#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const expected = {
  'public_html/azl/zeknova-identity-contract-v1.js': 'b92f7cc21e1def95014c5b8ee1ff4f2d3f0fb45e1d9e5b2988768336fce1e9c1',
  'public_html/azl/zeknova-perception-event-contract-v1.js': '7e4d5dffa70b5cda4992ec0c81eda088b842828813fd56cd64c244c704345c8c',
  'public_html/azl/zeknova-knowledge-ledger-contract-v1.js': 'a31264f97bf306cf505cac9cd71437baa36fe63d80e2cc7f8042fcfdef7d5381',
  'public_html/azl/zeknova-faction-observation-contract-v1.js': '997ff7c2d69bfd35a1c36bc52705f3f07a4d1d70cc733a76276dac37f097322d',
  'docs/governance/identity-registry.json': 'cd5b1dc8c8c93c2b9759565652a8724efa8ee1f94d3e36077fc257750e360c33',
  'docs/governance/perception-event-registry.json': '8639f09dd500e1944086e3fd27408f7b1906054bb3d46afe85542e986efb4d6e',
  'docs/governance/knowledge-ledger-registry.json': '800a8b42b2622758f381eb062d1a2bf89ccba6bf0d2fed0235be16ab9bcd2758',
  'docs/governance/faction-observation-registry.json': 'b68aab983106d18984b4f3bd6e63471c38d1653fe6819067f9e6d9164fbe20d3',
  'docs/governance/w0o2-knowledge-ledger-manifest.json': '39f3eec4e91b938063d5868d64723b77cb6c2a61ad5906ab0430f12bcf1d001f',
  'docs/governance/w0o3-faction-observation-manifest.json': '47583275864c71958422e0339ebdd26e935b12baed1b477137c196ec2fb44a80',
  'sgrid-lab/tests/w0o3-faction-observation-contract.test.js': 'ff54319542ba984aa2375585944b8e7a8d87f73198233908d16f66abe2b4a775',
  'sgrid-lab/tests/w0o3-portability-report.js': 'aec124eae7fa8c8e07e1f4dd83969afd527122dd2695e7455ff346b5d15a3f46'
};
let failures = 0;
for (const [relative, wanted] of Object.entries(expected)) {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) { console.log('  FAIL ' + relative + ' missing'); failures++; continue; }
  const measured = sha(file);
  const ok = measured === wanted;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${relative}  ${measured.slice(0, 16)}…`);
  if (!ok) failures++;
}
if (!failures) {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/faction-observation-registry.json'), 'utf8'));
  const contractHash = sha(path.join(ROOT, 'public_html/azl/zeknova-faction-observation-contract-v1.js'));
  const w0o2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/w0o2-knowledge-ledger-manifest.json'), 'utf8'));
  const w0o3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/w0o3-faction-observation-manifest.json'), 'utf8'));
  if (registry.contract.implementation_sha256 !== contractHash) { console.log('  FAIL observation contract hash does not match registry'); failures++; }
  else console.log('  OK   observation contract hash matches registry');
  if (w0o2.status !== 'frozen') { console.log('  FAIL inherited W0-O.2 manifest is not frozen'); failures++; }
  else console.log('  OK   inherited W0-O.2 manifest is frozen');
  if (w0o3.status !== 'provisional-linux-only') { console.log('  FAIL W0-O.3 manifest is not provisional'); failures++; }
  else console.log('  OK   W0-O.3 manifest is provisional');
}
if (failures) { console.error(`\nW0-O.3 INSTALL CHECK FAIL (${failures} problem${failures === 1 ? '' : 's'})`); process.exit(1); }
console.log('\nW0-O.3 INSTALL CHECK PASS');
