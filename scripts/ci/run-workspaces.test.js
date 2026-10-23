'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listWorkspaces, planRuns, parseArgs } = require('./run-workspaces');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
  const write = (rel, json) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), JSON.stringify(json));
  };
  write('package.json', { name: 'root', workspaces: ['packages/*', 'tools/one'] });
  write('packages/b-app/package.json', { name: '@x/b-app', scripts: { build: 'b', test: 't' } });
  write('packages/a-core/package.json', { name: '@x/a-core', scripts: { build: 'b', test: 't' } });
  write('packages/c-agent/package.json', { name: '@x/c-agent' });
  fs.mkdirSync(path.join(root, 'packages/not-a-package'));
  write('tools/one/package.json', { name: '@x/tool', scripts: { test: 't' } });
  return root;
}

test('listWorkspaces expands dir/* globs and plain paths, sorted, skipping folders without package.json', () => {
  const names = listWorkspaces(fixture()).map((w) => w.name);
  assert.deepEqual(names, ['@x/a-core', '@x/b-app', '@x/c-agent', '@x/tool']);
});

test('planRuns keeps only workspaces that define the script', () => {
  assert.deepEqual(planRuns(fixture(), 'test', []), ['@x/a-core', '@x/b-app', '@x/tool']);
  assert.deepEqual(planRuns(fixture(), 'build', []), ['@x/a-core', '@x/b-app']);
  assert.deepEqual(planRuns(fixture(), 'package', []), []);
});

test('planRuns honours --skip', () => {
  assert.deepEqual(planRuns(fixture(), 'build', ['@x/a-core']), ['@x/b-app']);
});

test('parseArgs reads the script and a comma-separated skip list', () => {
  assert.deepEqual(parseArgs(['build', '--skip', '@x/a,@x/b']), { script: 'build', skip: ['@x/a', '@x/b'], passthrough: [] });
  assert.deepEqual(parseArgs(['test']), { script: 'test', skip: [], passthrough: [] });
  assert.throws(() => parseArgs([]), /usage/i);
});

test('parseArgs forwards everything after -- to the package script', () => {
  assert.deepEqual(parseArgs(['test', '--', '--maxWorkers=2', '--ci']), { script: 'test', skip: [], passthrough: ['--maxWorkers=2', '--ci'] });
  assert.deepEqual(parseArgs(['test', '--skip', '@x/a', '--', '--skip']), { script: 'test', skip: ['@x/a'], passthrough: ['--skip'] });
});
