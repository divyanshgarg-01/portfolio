import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contentDir = path.join(root, 'src', 'content');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(contentDir, relativePath), 'utf8'));
}

function readFolder(folder) {
  const dir = path.join(contentDir, folder);
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

describe('frozen published content snapshot', () => {
  it('contains the complete published entity set', () => {
    assert.equal(readFolder('projects').length, 3);
    assert.equal(readFolder('experience').length, 2);
    assert.equal(readFolder('education').length, 2);
    assert.equal(readFolder('skill-categories').length, 5);
    assert.equal(readFolder('skills').length, 30);
    assert.equal(readFolder('socials').length, 3);
    assert.equal(readFolder('achievements').length, 9);
  });

  it('preserves all eight certificates in the master order', () => {
    const certificates = readFolder('achievements')
      .filter((item) => item.type === 'certificate')
      .sort((a, b) => a.order - b.order);
    assert.deepEqual(certificates.map((item) => item.title), [
      'Foundational Certificate in Statistics and Management',
      'Applied Machine Learning using Python',
      'Decoding the Digital and Financial Worlds',
      'Applications of AI in Precision Oncology',
      'Deloitte Australia - Data Analytics Job Simulation',
      'AI Tools Workshop',
      'Tracing the Invisible – OSINT & Digital Footprint in the Modern World',
      'Cyber Security Workshop',
    ]);
  });

  it('publishes only visible records', () => {
    for (const folder of ['projects', 'experience', 'education', 'skill-categories', 'skills', 'achievements', 'socials']) {
      for (const item of readFolder(folder)) {
        assert.equal(item.visibility, 'published');
        if (folder === 'socials') assert.equal(item.visible, true);
      }
    }
  });

  it('references only local files that exist', () => {
    const allFiles = [
      readJson('settings.json'),
      readJson('about.json'),
      readJson('resume.json'),
      ...readFolder('projects'),
      ...readFolder('achievements'),
    ];
    const localPaths = collectStrings(allFiles).filter((value) => value.startsWith('/uploads/'));
    assert.ok(localPaths.length > 0);
    for (const assetPath of localPaths) {
      assert.ok(fs.existsSync(path.join(root, 'public', assetPath.replace(/^\/+/, ''))), assetPath);
    }
  });

  it('contains the editable label and section groups', () => {
    const settings = readJson('settings.json');
    assert.deepEqual(settings.currentlyLines, [
      'UnderGrad @ IIT Madras',
      'Intern @ IIT Ropar',
      'CoFounder @Cynorva',
    ]);
    assert.deepEqual(settings.sectionOrder, [
      'top', 'marquee', 'about', 'education', 'experience', 'approach', 'projects',
      'certifications', 'skills', 'achievements', 'community', 'contact',
    ]);
    assert.deepEqual(settings.labels.preloader.words, ['Research', 'Building', 'Refining', 'Shipping']);
    assert.equal(settings.labels.preloader.signature, 'DIVYANSH GARG — PORTFOLIO');
    assert.equal(settings.labels.preloader.countFallback, '000');
    for (const key of [
      'common', 'hero', 'about', 'education', 'experience', 'approach', 'projects',
      'certifications', 'skills', 'achievements', 'community', 'contact', 'footer',
      'telemetry', 'preloader', 'terminal',
    ]) {
      assert.ok(key in settings.labels, `missing labels.${key}`);
    }
    assert.equal(settings.approach.length, 4);
    assert.match(settings.community.notice, /Community statistics and video tabs are omitted/);
  });
});
