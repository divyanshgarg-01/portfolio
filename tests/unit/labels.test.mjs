import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const settings = JSON.parse(fs.readFileSync(path.join(root, 'src', 'content', 'settings.json'), 'utf8'));
const labels = settings.labels || {};

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function resolvePath(dottedPath) {
  return dottedPath.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return current[key];
  }, labels);
}

function expandPaths(pattern) {
  const dynamic = pattern.match(/^(.*?)\$\{([^}]+)\}(.*)$/);
  if (!dynamic) return [pattern];
  const [, before, expression, after] = dynamic;
  const candidates = /(?:index|i)/.test(expression)
    ? ['0', '1', '2', '3']
    : Object.keys(labels);
  const expanded = candidates.flatMap((candidate) => expandPaths(`${before}${candidate}${after}`));
  const valid = expanded.filter((candidate) => resolvePath(candidate) !== undefined || /\$\{/.test(candidate));
  return valid.length ? valid : [expanded[0] || pattern];
}

function labelPaths(source) {
  const found = new Set();
  const pattern = /label\([^,]+,\s*(['"`])([^'"`]+)\1\s*,/g;
  let match;
  while ((match = pattern.exec(source))) {
    for (const labelPath of expandPaths(match[2])) found.add(labelPath);
  }
  return found;
}

describe('CMS label bindings', () => {
  it('every label() path used by the public components exists in settings', () => {
    const files = sourceFiles(path.join(root, 'src', 'original'));
    assert.ok(files.length > 0);
    const missing = [];
    for (const file of files) {
      for (const labelPath of labelPaths(fs.readFileSync(file, 'utf8'))) {
        if (resolvePath(labelPath) === undefined) {
          missing.push(`${path.relative(root, file)} -> labels.${labelPath}`);
        }
      }
    }
    assert.deepEqual(missing.sort(), []);
  });

  it('uses the CMS currentlyLines and sectionOrder defaults', () => {
    assert.deepEqual(settings.currentlyLines, [
      'UnderGrad @ IIT Madras',
      'Intern @ IIT Ropar',
      'CoFounder @Cynorva',
    ]);
    assert.equal(settings.sectionOrder[0], 'top');
    assert.equal(settings.sectionOrder.at(-1), 'contact');
  });
});
