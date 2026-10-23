#!/usr/bin/env node
'use strict';

// Runs one npm script in every workspace that defines it, one package at a time, so a
// single Node process is alive at once (the Podman VM and CI runners are memory-bound).
// Keeps going after a failure and exits 1 at the end if any package failed.
//
// Usage: node scripts/ci/run-workspaces.js <script> [--skip @scope/a,@scope/b] [-- args for the script]

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// Supports the two forms this repo uses: "dir/*" and a plain "dir/name".
function listWorkspaces(root) {
  const dirs = [];
  for (const pattern of readJson(path.join(root, 'package.json')).workspaces || []) {
    if (pattern.endsWith('/*')) {
      const parent = path.join(root, pattern.slice(0, -2));
      for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(path.join(parent, entry.name));
      }
    } else {
      dirs.push(path.join(root, pattern));
    }
  }
  return dirs
    .filter((dir) => fs.existsSync(path.join(dir, 'package.json')))
    .map((dir) => ({ dir, ...readJson(path.join(dir, 'package.json')) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function planRuns(root, script, skip) {
  return listWorkspaces(root)
    .filter((ws) => ws.scripts && ws.scripts[script] && !skip.includes(ws.name))
    .map((ws) => ws.name);
}

function parseArgs(argv) {
  const [script, ...rest] = argv;
  if (!script || script.startsWith('-')) {
    throw new Error('usage: run-workspaces.js <script> [--skip @scope/a,@scope/b] [-- args for the script]');
  }
  const sep = rest.indexOf('--');
  const own = sep >= 0 ? rest.slice(0, sep) : rest;
  const passthrough = sep >= 0 ? rest.slice(sep + 1) : [];
  const i = own.indexOf('--skip');
  const skip = i >= 0 && own[i + 1] ? own[i + 1].split(',').filter(Boolean) : [];
  return { script, skip, passthrough };
}

function main() {
  const { script, skip, passthrough } = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..', '..');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const extra = passthrough.length ? ['--', ...passthrough] : [];
  const failed = [];
  for (const name of planRuns(root, script, skip)) {
    console.log(`\n=== ${script}: ${name} ===`);
    const res = spawnSync(npm, ['run', script, '-w', name, ...extra], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (res.status !== 0) failed.push(name);
  }
  if (failed.length) {
    console.error(`\n${script} failed in: ${failed.join(', ')}`);
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}

module.exports = { listWorkspaces, planRuns, parseArgs };
