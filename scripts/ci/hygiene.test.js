'use strict';

// Run with: node --test "scripts/ci/*.test.js"
// Bad samples are built by concatenation so this file passes its own hygiene scan.

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkPath, checkContent, rot13 } = require('./hygiene');

const rules = (findings) => findings.map((f) => f.rule);

test('tenant hosts are flagged', () => {
  for (const host of ['acme', 'acme-admin', 'acme-my', 'a1b2'].map((l) => l + '.sharepoint.com')) {
    assert.deepEqual(rules(checkContent('a.md', `see https://${host}/sites/x`)), ['tenant-host'], host);
  }
});

test('placeholder and sample hosts pass', () => {
  for (const text of [
    'https://<tenant>' + '.sharepoint.com/_layouts/15/workbench.aspx',
    'https://{tenantDomain}' + '.sharepoint.com/sites/{site}',
    'https://x' + '.sharepoint.com/sites/demo',
    'https://contoso' + '.sharepoint.com/sites/demo',
    'https://contoso-admin' + '.sharepoint.com',
    '"https://$Tenant' + '.sharepoint.com"',
    'https://*' + '.sharepoint.com',
  ]) {
    assert.deepEqual(checkContent('a.md', text), [], text);
  }
});

test('onmicrosoft hosts are flagged, placeholders pass', () => {
  assert.deepEqual(rules(checkContent('a.ps1', '-Tenant acme' + '.onmicrosoft.com')), ['onmicrosoft-host']);
  assert.deepEqual(checkContent('a.ps1', '-Tenant <tenant>' + '.onmicrosoft.com'), []);
});

test('host matching is case-insensitive', () => {
  assert.deepEqual(rules(checkContent('a.md', 'ACME' + '.SharePoint.com')), ['tenant-host']);
});

test('banned names are flagged at a word start', () => {
  for (const word of ['xczt', 'rhnn', 'rnfb', 'fnegbe', 'xvc'].map(rot13)) {
    assert.deepEqual(rules(checkContent('a.md', `by ${word} team`)), ['banned-name'], word);
    assert.deepEqual(rules(checkContent('a.md', `${word.toUpperCase()}87`)), ['banned-name'], word);
    assert.deepEqual(rules(checkContent('a.md', `(${word})`)), ['banned-name'], word);
  }
});

test('banned names inside other words pass', () => {
  for (const text of ['the reason is', 'skip it', 'seasonal', 'a_' + rot13('xczt'), 'x' + rot13('fnegbe')]) {
    assert.deepEqual(checkContent('a.md', text), [], text);
  }
});

test('JWTs are flagged outside SVG files only', () => {
  const jwt = 'ey' + 'JhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  assert.deepEqual(rules(checkContent('a.ts', `const t = '${jwt}';`)), ['jwt']);
  assert.deepEqual(checkContent('docs/diagram.svg', `<image href="data:image/png;base64,${jwt}"/>`), []);
  assert.deepEqual(checkContent('docs/DIAGRAM.SVG', jwt), []);
});

test('GitHub tokens are flagged', () => {
  assert.deepEqual(rules(checkContent('a.yml', 'token: gh' + 'p_' + 'A1'.repeat(18))), ['github-token']);
  assert.deepEqual(rules(checkContent('a.yml', 'token: gh' + 's_' + 'b2'.repeat(20))), ['github-token']);
  assert.deepEqual(rules(checkContent('a.yml', 'github' + '_pat_' + '11ABCDEFG0' + 'x'.repeat(40))), ['github-token']);
});

test('things that look a bit like tokens pass', () => {
  for (const text of ['ghp_short', 'uses: actions/checkout@v4', 'sha512-' + 'Q'.repeat(86) + '==', 'eyJ.e.y']) {
    assert.deepEqual(checkContent('a.txt', text), [], text);
  }
});

test('findings carry line numbers and a redacted excerpt', () => {
  const host = 'acme' + '.sharepoint.com';
  const [f] = checkContent('a.md', `line one\nline two ${host}\n`);
  assert.equal(f.line, 2);
  assert.equal(f.path, 'a.md');
  assert.ok(!f.excerpt.includes(host), 'excerpt must not repeat the match');
});

test('tracked .env files are flagged unless they are samples', () => {
  for (const p of ['.env', 'packages/mcp/.env', 'packages/agent/env/.env.dev', '.env.local']) {
    assert.deepEqual(rules(checkPath(p)), ['env-file'], p);
  }
  for (const p of ['packages/mcp/.env.sample', 'packages/agent/env/.env.dev.sample', 'docs/env.md', '.envrc.md', 'src/dotenv.ts']) {
    assert.deepEqual(checkPath(p), [], p);
  }
});

test('superpowers paths are flagged', () => {
  for (const p of ['docs/superpowers/plans/x.md', '.superpowers/state.json', 'packages/a/.superpowers/x']) {
    assert.deepEqual(rules(checkPath(p)), ['superpowers-path'], p);
  }
  assert.deepEqual(checkPath('docs/superpowers-notes.md'), []);
  assert.deepEqual(checkPath('docs/ci.md'), []);
});
