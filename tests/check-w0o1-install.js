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
  'docs/governance/identity-registry.json': 'cd5b1dc8c8c93c2b9759565652a8724efa8ee1f94d3e36077fc257750e360c33',
  'docs/governance/perception-event-registry.json': '8639f09dd500e1944086e3fd27408f7b1906054bb3d46afe85542e986efb4d6e',
  'docs/governance/w0o0-identity-manifest.json': 'ce8a132467e0c52fe808b0acf46b9b50f98cc2ed4edba9afcec80663b28d772f',
  'docs/governance/w0o1-perception-event-manifest.json': '46939e53b06190a9e1b45a0da8173500685d152296c3781db0f3778a8f93c374',
  'sgrid-lab/tests/w0o1-perception-event-contract.test.js': '37930cda9a07b6b2e635bce635e6f61afb33ebcc675001eef191c1fa6ddace16',
  'sgrid-lab/tests/w0o1-portability-report.js': '1b2e4f6afeb483d4afacfc469ebc298aa00c47348293c20f0bea543b1321e3d6'
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
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/perception-event-registry.json'), 'utf8'));
  const measured = sha(path.join(ROOT, 'public_html/azl/zeknova-perception-event-contract-v1.js'));
  if (registry.contract.implementation_sha256 !== measured) {
    console.log('  FAIL event contract hash does not match registry'); failures++;
  } else console.log('  OK   event contract hash matches registry');
}
if (failures) { console.error(`\nW0-O.1 INSTALL CHECK FAIL (${failures} problem${failures === 1 ? '' : 's'})`); process.exit(1); }
console.log('\nW0-O.1 INSTALL CHECK PASS');
