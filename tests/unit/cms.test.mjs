import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const root = process.cwd();
const configText = fs.readFileSync(path.join(root, 'public', 'admin', 'config.yml'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'public', 'admin', 'index.html'), 'utf8');
const config = yaml.load(configText);
const workflow = yaml.load(fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8'));
const worker = fs.readFileSync(path.join(root, 'oauth-worker', 'worker.js'), 'utf8');
const contentDir = path.join(root, 'src', 'content');

const VALID_WIDGETS = new Set([
  'string', 'text', 'textarea', 'boolean', 'select', 'list', 'object', 'image', 'file',
  'date', 'datetime', 'number', 'uuid', 'hidden', 'relation', 'map', 'code', 'color', 'markdown',
]);

function fieldNames(value, out = new Set(), invalidWidgets = []) {
  if (Array.isArray(value)) {
    for (const item of value) fieldNames(item, out, invalidWidgets);
  } else if (value && typeof value === 'object') {
    if (typeof value.name === 'string') out.add(value.name);
    if (typeof value.widget === 'string' && !VALID_WIDGETS.has(value.widget)) {
      invalidWidgets.push(value.widget);
    }
    for (const item of Object.values(value)) fieldNames(item, out, invalidWidgets);
  }
  return { names: out, invalidWidgets };
}

function keyNames(value, out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) keyNames(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.add(key);
      keyNames(item, out);
    }
  }
  return out;
}

function jsonFiles() {
  const files = [];
  for (const entry of fs.readdirSync(contentDir)) {
    const full = path.join(contentDir, entry);
    if (entry.endsWith('.json')) files.push(full);
    if (fs.statSync(full).isDirectory()) {
      for (const name of fs.readdirSync(full)) {
        if (name.endsWith('.json')) files.push(path.join(full, name));
      }
    }
  }
  return files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
}

describe('Decap CMS configuration', () => {
  it('uses the GitHub backend and editorial workflow with the correct paths', () => {
    assert.equal(config.backend.name, 'github');
    assert.equal(config.backend.repo, 'divyanshgarg-01/portfolio');
    assert.equal(config.backend.branch, 'main');
    assert.equal(config.backend.base_url, 'https://divyansh-portfolio-oauth.workers.dev');
    assert.equal(config.backend.auth_endpoint, 'auth');
    assert.equal(config.publish_mode, 'editorial_workflow');
    assert.equal(config.media_folder, 'public/uploads');
    assert.equal(config.public_folder, '/portfolio/uploads');
  });

  it('loads a pinned Decap CMS bundle with integrity checking', () => {
    assert.ok(adminHtml.includes('decap-cms@3.18.0/dist/decap-cms.js'));
    assert.ok(adminHtml.includes('sha384-Vu0vdYOBhK+2KywHCtNZ9sCqpzkwx358AT6pCSg8om/clLoDzpWYF41jrtEk/WMM'));
    assert.ok(adminHtml.includes('crossorigin="anonymous"'));
    assert.ok(!adminHtml.includes('decap-cms@^'));
  });

  it('defines every singleton and folder collection', () => {
    const names = config.collections.map((collection) => collection.name);
    for (const expected of [
      'settings', 'about', 'resume', 'projects', 'experience', 'education',
      'skill-categories', 'skills', 'achievements', 'socials',
    ]) {
      assert.ok(names.includes(expected), `missing collection ${expected}`);
    }
  });

  it('covers every top-level content key with a CMS field', () => {
    const { names } = fieldNames(config.collections);
    for (const file of jsonFiles()) {
      for (const key of Object.keys(file)) {
        assert.ok(names.has(key), `missing CMS field ${key}`);
      }
    }
  });

  it('covers nested content keys with CMS fields', () => {
    const { names } = fieldNames(config.collections);
    const missing = [...keyNames(jsonFiles())].filter((key) => !names.has(key)).sort();
    assert.deepEqual(missing, []);
  });

  it('exposes editable section order', () => {
    const settings = config.collections.find((collection) => collection.name === 'settings');
    const field = settings.files[0].fields.find((item) => item.name === 'sectionOrder');
    const expected = [
      'top', 'marquee', 'about', 'education', 'experience', 'approach', 'projects',
      'certifications', 'skills', 'achievements', 'community', 'contact',
    ];
    assert.equal(field.widget, 'list');
    assert.deepEqual(field.default, expected);
    assert.deepEqual(field.field.options, expected);
  });

  it('uses only valid Decap widgets', () => {
    const { invalidWidgets } = fieldNames(config.collections);
    assert.deepEqual(invalidWidgets, []);
  });
});

describe('GitHub Pages workflow', () => {
  it('deploys dist on pushes to main', () => {
    assert.ok(workflow.on.push.branches.includes('main'));
    assert.ok('workflow_dispatch' in workflow.on);
    assert.equal(workflow.permissions.contents, 'read');
    assert.equal(workflow.permissions.pages, 'write');
    assert.equal(workflow.permissions['id-token'], 'write');
    const steps = workflow.jobs.build.steps;
    const runCommands = steps.filter((step) => step.run).map((step) => step.run);
    for (const command of ['npm ci', 'npm run typecheck', 'npm run test', 'npm run build', 'npm run verify:build']) {
      assert.ok(runCommands.includes(command), `missing workflow command ${command}`);
    }
    const upload = steps.find((step) => step.uses?.startsWith('actions/upload-pages-artifact'));
    assert.equal(upload.with.path, './dist');
    assert.ok(workflow.jobs.deploy.steps.some((step) => step.uses === 'actions/deploy-pages@v4'));
  });
});

describe('hardened OAuth worker', () => {
  it('validates state, restricts CORS and requests least privilege', () => {
    for (const fragment of [
      'crypto.getRandomValues', 'constantTimeEqual', '__Host-cms-oauth_state', 'SameSite=Lax',
      'public_repo', 'Access-Control-Allow-Origin', 'GITHUB_CLIENT_SECRET', 'ALLOWED_USER',
      'no-store, no-cache, must-revalidate',
    ]) {
      assert.ok(worker.includes(fragment), `worker missing ${fragment}`);
    }
    assert.ok(!worker.includes('Access-Control-Allow-Origin": "*"'));
  });
});
