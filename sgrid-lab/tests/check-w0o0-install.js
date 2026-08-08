#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LAB = path.resolve(__dirname, '..');
const ROOT = path.resolve(LAB, '..');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const required = [
  ['contract', 'public_html/azl/zeknova-identity-contract-v1.js'],
  ['registry', 'docs/governance/identity-registry.json'],
  ['manifest', 'docs/governance/w0o0-identity-manifest.json'],
  ['test', 'sgrid-lab/tests/w0o0-identity-contract.test.js'],
  ['portability report', 'sgrid-lab/tests/w0o0-portability-report.js'],
];
let failed = 0;
for (const [label, relative] of required) {
  const file = path.join(ROOT, relative);
  const exists = fs.existsSync(file);
  console.log(`${exists ? '  OK  ' : '  FAIL'} ${label.padEnd(20)} ${relative}${exists ? `  ${sha(file).slice(0, 16)}…` : ''}`);
  if (!exists) failed++;
}
if (!failed) {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/identity-registry.json'), 'utf8'));
  const contract = path.join(ROOT, 'public_html/azl/zeknova-identity-contract-v1.js');
  const match = sha(contract) === registry.contract.implementation_sha256;
  console.log(`${match ? '  OK  ' : '  FAIL'} contract hash matches registry`);
  if (!match) failed++;
}
console.log(failed ? `\nW0-O.0 INSTALL CHECK FAIL (${failed})` : '\nW0-O.0 INSTALL CHECK PASS');
process.exit(failed ? 1 : 0);
