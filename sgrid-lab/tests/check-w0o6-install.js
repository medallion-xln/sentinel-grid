#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const expected = {
  'public_html/azl/zeknova-identity-contract-v1.js': 'b92f7cc21e1def95014c5b8ee1ff4f2d3f0fb45e1d9e5b2988768336fce1e9c1',
  'public_html/azl/zeknova-perception-event-contract-v1.js': '7e4d5dffa70b5cda4992ec0c81eda088b842828813fd56cd64c244c704345c8c',
  'public_html/azl/zeknova-knowledge-ledger-contract-v1.js': 'a31264f97bf306cf505cac9cd71437baa36fe63d80e2cc7f8042fcfdef7d5381',
  'public_html/azl/zeknova-faction-observation-contract-v1.js': '997ff7c2d69bfd35a1c36bc52705f3f07a4d1d70cc733a76276dac37f097322d',
  'public_html/azl/zeknova-observation-legality-contract-v1.js': 'e4514ffe2c335bad81e6433ff26ea197ac148cd83e2b2c9fd86db66a624203f3',
  'public_html/azl/zeknova-prime-shadow-contract-v1.js': 'd8938f0f02a450a79a5326708a378eae6c31dbc1d839b30bd424853d5f897866',
  'docs/governance/observation-legality-registry.json': 'c78c969f730ab210be46b834addeaf3a787703999f77a7d4341dbad55409ea18',
  'docs/governance/prime-shadow-registry.json': 'ff8c843e804ff728b85ff2cf8d20f2a0b2620307df29fa3bbd1699c2e03dea06',
  'docs/governance/w0o5-observation-legality-manifest.json': 'ff16b8fa3caecd45b0d8d936677962b240ebe48ec776193c01092643320672b6',
  'docs/governance/w0o6-prime-shadow-manifest.json': 'c473c6915bf14056a265d3bf1ad11c63bfbf78a1f1c9e284576e35b2bdb8d7d9',
  'sgrid-lab/tests/w0o5-observation-legality-contract.test.js': 'e1eee8b78453d9067460ce4ef6060c6a960e187defa63872eef421104929a38f',
  'sgrid-lab/tests/w0o5-observation-legality-contract.portability-v1.js': '152668f2815dd2298b2327a32d8fdc40c46429630f0ccb90233d5daa02b8d1ee',
  'sgrid-lab/tests/w0o6-prime-shadow-contract.test.js': 'a3a8d5d7222f8f776be82fa6dde9eecd22996eb8de0421f2d9d8c13221ec377e',
  'sgrid-lab/tests/w0o6-portability-report.js': 'e8ba4097ecaff1a1332ceb6765491d90cae42cde6691087cc173afd7f8395b47'
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
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/prime-shadow-registry.json'), 'utf8'));
  const contractHash = sha(path.join(ROOT, 'public_html/azl/zeknova-prime-shadow-contract-v1.js'));
  const w0o5 = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/w0o5-observation-legality-manifest.json'), 'utf8'));
  const w0o6 = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/w0o6-prime-shadow-manifest.json'), 'utf8'));
  if (registry.contract.implementation_sha256 !== contractHash) { console.log('  FAIL shadow contract hash does not match registry'); failures++; }
  else console.log('  OK   shadow contract hash matches registry');
  if (w0o5.status !== 'frozen') { console.log('  FAIL inherited W0-O.5 manifest is not frozen'); failures++; }
  else console.log('  OK   inherited W0-O.5 manifest is frozen');
  if (w0o6.status !== 'frozen') { console.log('  FAIL W0-O.6 manifest is not frozen'); failures++; }
  else console.log('  OK   W0-O.6 manifest is frozen');
  if (w0o6.verification.sentinel_linux_portability_digest !== w0o6.verification.sentinel_darwin_portability_digest) { console.log('  FAIL W0-O.6 Sentinel Linux/Darwin mismatch'); failures++; }
  else console.log('  OK   W0-O.6 Sentinel Linux/Darwin digests match');
  if (w0o6.verification.zeknova_linux_portability_digest !== w0o6.verification.zeknova_darwin_portability_digest) { console.log('  FAIL W0-O.6 ZekNova Linux/Darwin mismatch'); failures++; }
  else console.log('  OK   W0-O.6 ZekNova Linux/Darwin digests match');
  if (registry.shadow_only !== true || registry.not_production_action_authority !== true) { console.log('  FAIL shadow-only authority guard is missing'); failures++; }
  else console.log('  OK   shadow-only no-authority guard declared');
}
if (failures) { console.error(`\nW0-O.6 INSTALL CHECK FAIL (${failures} problem${failures === 1 ? '' : 's'})`); process.exit(1); }
console.log('\nW0-O.6 INSTALL CHECK PASS');
