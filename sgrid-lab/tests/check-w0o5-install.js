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
  'public_html/azl/zeknova-observation-legality-contract-v1.js': 'e4514ffe2c335bad81e6433ff26ea197ac148cd83e2b2c9fd86db66a624203f3',
  'docs/governance/identity-registry.json': 'cd5b1dc8c8c93c2b9759565652a8724efa8ee1f94d3e36077fc257750e360c33',
  'docs/governance/perception-event-registry.json': '8639f09dd500e1944086e3fd27408f7b1906054bb3d46afe85542e986efb4d6e',
  'docs/governance/knowledge-ledger-registry.json': '800a8b42b2622758f381eb062d1a2bf89ccba6bf0d2fed0235be16ab9bcd2758',
  'docs/governance/faction-observation-registry.json': 'b68aab983106d18984b4f3bd6e63471c38d1653fe6819067f9e6d9164fbe20d3',
  'docs/governance/observation-legality-registry.json': 'c78c969f730ab210be46b834addeaf3a787703999f77a7d4341dbad55409ea18',
  'docs/governance/w0o3-faction-observation-manifest.json': '1313dc0181af4f4d9b48f5ee1bd6633a0153bf8db0965f941d904d2bf8559b32',
  'docs/governance/w0o5-observation-legality-manifest.json': 'ff16b8fa3caecd45b0d8d936677962b240ebe48ec776193c01092643320672b6',
  'sgrid-lab/tests/w0o5-observation-legality-contract.test.js': 'e1eee8b78453d9067460ce4ef6060c6a960e187defa63872eef421104929a38f',
  'sgrid-lab/tests/w0o5-observation-legality-contract.portability-v1.js': '152668f2815dd2298b2327a32d8fdc40c46429630f0ccb90233d5daa02b8d1ee',
  'sgrid-lab/tests/w0o5-portability-report.js': '89a97d87192206daa82c7b417c5c5cb08b912ca8415b5fc9857e16f8eeb50d5e'
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
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/observation-legality-registry.json'), 'utf8'));
  const contractHash = sha(path.join(ROOT, 'public_html/azl/zeknova-observation-legality-contract-v1.js'));
  const w0o3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/w0o3-faction-observation-manifest.json'), 'utf8'));
  const w0o5 = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/w0o5-observation-legality-manifest.json'), 'utf8'));
  if (registry.contract.implementation_sha256 !== contractHash) { console.log('  FAIL legality contract hash does not match registry'); failures++; }
  else console.log('  OK   legality contract hash matches registry');
  if (w0o3.status !== 'frozen') { console.log('  FAIL inherited W0-O.3 manifest is not frozen'); failures++; }
  else console.log('  OK   inherited W0-O.3 manifest is frozen');
  if (w0o5.status !== 'frozen') { console.log('  FAIL W0-O.5 manifest is not frozen'); failures++; }
  else console.log('  OK   W0-O.5 manifest is frozen');
  if (w0o5.verification.sentinel_linux_portability_digest !== w0o5.verification.sentinel_darwin_portability_digest) { console.log('  FAIL W0-O.5 Sentinel Linux/Darwin digests differ'); failures++; }
  else console.log('  OK   W0-O.5 Sentinel Linux/Darwin digests match');
  if (w0o5.verification.zeknova_linux_portability_digest !== w0o5.verification.zeknova_darwin_portability_digest) { console.log('  FAIL W0-O.5 ZekNova Linux/Darwin digests differ'); failures++; }
  else console.log('  OK   W0-O.5 ZekNova Linux/Darwin digests match');
  if (w0o5.w0o4_disposition.status !== 'satisfied-by-w0o3-evidence') { console.log('  FAIL W0-O.4 disposition is missing'); failures++; }
  else console.log('  OK   W0-O.4 is dispositioned by W0-O.3 evidence');
}
if (failures) { console.error(`\nW0-O.5 INSTALL CHECK FAIL (${failures} problem${failures === 1 ? '' : 's'})`); process.exit(1); }
console.log('\nW0-O.5 INSTALL CHECK PASS');
