#!/usr/bin/env node
'use strict';

// Fails when a tracked file leaks tenant data, secrets, local-only paths or banned names.
// The file list comes from `git ls-files`; the patterns run in Node rather than `git grep`,
// so the result does not depend on how git's regex engine was built (CI runner vs container).
//
// Usage: node scripts/ci/hygiene.js     (exit 0 = clean, 1 = findings, 2 = error)

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rot13 = (s) =>
  s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

// Kept in ROT13 so the names themselves never appear in the repo in plain text.
const BANNED_NAMES = ['xczt', 'rhnn', 'rnfb', 'fnegbe', 'xvc'].map(rot13);

// A host label that is a placeholder or a documented sample, not a real tenant.
function isSampleHost(text, label, index) {
  const lower = label.toLowerCase();
  if (lower === 'x' || lower.startsWith('contoso')) return true;
  if (index > 0 && text[index - 1] === '$') return true; // "$Tenant.sharepoint.com" in a script
  // "<tenant>-admin.sharepoint.com": the label group cannot contain "<", so it only sees "admin".
  return lower === 'admin' && text.slice(Math.max(0, index - 9), index) === '<tenant>-';
}

const CONTENT_RULES = [
  {
    id: 'tenant-host',
    regex: /\b([a-z0-9-]+)\.sharepoint\.com/gi,
    allow: (m, text) => isSampleHost(text, m[1], m.index),
  },
  {
    id: 'onmicrosoft-host',
    regex: /\b([a-z0-9-]+)\.onmicrosoft\.com/gi,
    allow: (m, text) => isSampleHost(text, m[1], m.index),
  },
  {
    id: 'banned-name',
    regex: new RegExp(`\\b(?:${BANNED_NAMES.join('|')})`, 'gi'),
  },
  {
    id: 'jwt',
    regex: /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g,
    skipSvg: true, // base64 inside rendered Mermaid SVGs looks like a JWT
  },
  {
    id: 'github-token',
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/g,
    skipSvg: true,
  },
];

const PATH_RULES = [
  { id: 'env-file', test: (p) => /(^|\/)\.env(\.[^/]*)?$/.test(p) && !p.endsWith('.sample') },
  { id: 'superpowers-path', test: (p) => /(^|\/)(docs\/superpowers|\.superpowers)(\/|$)/i.test(p) },
];

// Never echo the match into the CI log: that would leak the value a second time.
const redact = (s) => `${s.slice(0, 3)}${'*'.repeat(Math.max(3, s.length - 3))}`;

function checkPath(file) {
  const p = file.replace(/\\/g, '/');
  return PATH_RULES.filter((r) => r.test(p)).map((r) => ({ rule: r.id, path: file, line: 0, excerpt: '' }));
}

function checkContent(file, text) {
  const isSvg = /\.svg$/i.test(file);
  const findings = [];
  for (const rule of CONTENT_RULES) {
    if (rule.skipSvg && isSvg) continue;
    rule.regex.lastIndex = 0;
    for (const m of text.matchAll(rule.regex)) {
      if (rule.allow && rule.allow(m, text)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      findings.push({ rule: rule.id, path: file, line, excerpt: redact(m[0]) });
    }
  }
  return findings;
}

function trackedFiles(cwd) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

function scan(cwd) {
  const findings = [];
  for (const file of trackedFiles(cwd)) {
    findings.push(...checkPath(file));
    let buf;
    try {
      buf = fs.readFileSync(path.join(cwd, file));
    } catch (err) {
      if (err.code === 'ENOENT') continue; // deleted in the working tree, not yet staged
      throw err;
    }
    if (buf.includes(0)) continue; // binary
    findings.push(...checkContent(file, buf.toString('utf8')));
  }
  return findings;
}

function main() {
  const cwd = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const findings = scan(cwd);
  for (const f of findings) {
    console.error(`${f.path}${f.line ? `:${f.line}` : ''}: [${f.rule}] ${f.excerpt}`.trimEnd());
  }
  if (findings.length) {
    console.error(`\nhygiene: ${findings.length} finding(s). See docs/ci.md#hygiene.`);
    process.exit(1);
  }
  console.log('hygiene: clean');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`hygiene: ${err.message}`);
    process.exit(2);
  }
}

module.exports = { checkPath, checkContent, scan, rot13 };
