#!/usr/bin/env node
/* check-install.js — diagnose the working tree before running any suite.
 * Run from sgrid-lab/:   node tests/check-install.js
 * Exits 0 when everything the suites need is present, 1 otherwise. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LAB = path.resolve(__dirname, '..');
const ROOT = path.resolve(LAB, '..');
const ENG = path.join(ROOT, 'public_html', 'azl');
const FROZEN = path.join(LAB, 'results-v2.1', 'scenario-certification');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

const rows = [];
let fatal = 0;
function row(label, ok, detail, fix) {
  rows.push({ label, ok, detail, fix });
  if (!ok) fatal++;
}

console.log('repo root : ' + ROOT);
console.log('sgrid-lab : ' + LAB);
console.log('engine    : ' + ENG + '\n');

/* 1. engine modules */
const MODULES = ['azl-config.js', 'azl-util.js', 'azl-state.js', 'azl-nn.js', 'azl-scout.js',
  'azl-strategist.js', 'azl-oracle.js', 'azl-relational.js', 'azl-mcts.js', 'azl-router.js',
  'azl-weights.js', 'azl-federated.js', 'azl-eval.js', 'azl-ref-adapter-v2.js'];
const missingMods = MODULES.filter(m => !fs.existsSync(path.join(ENG, m)));
row('engine modules (14)', missingMods.length === 0,
  missingMods.length ? 'missing: ' + missingMods.join(', ') : 'all present',
  'extract azl.zip so its 14 azl-*.js files land in ' + ENG);

row('azl-ref-adapter-v3.js', fs.existsSync(path.join(ENG, 'azl-ref-adapter-v3.js')),
  '', 'copy sentinel-w0g-w0s/public_html/ over your repo root');

/* 2. lab scripts */
['lab.js', 'lab2.js', 'lab3.js'].forEach(f =>
  row('sgrid-lab/' + f, fs.existsSync(path.join(LAB, f)), '',
    'extract sentinel-grid-stage1a.zip into the repo root'));

/* 3. frozen Stage 1A archive — the usual failure */
const frozenExists = fs.existsSync(FROZEN);
row('frozen Stage 1A archive', frozenExists,
  frozenExists ? FROZEN : 'NOT FOUND at ' + FROZEN,
  'extract sentinel-grid-stage1a.zip from the repo root: unzip -o sentinel-grid-stage1a.zip -x "__MACOSX/*"');

if (frozenExists) {
  const cj = path.join(FROZEN, 'certification.json');
  const cjOk = fs.existsSync(cj);
  row('certification.json', cjOk,
    cjOk ? sha(fs.readFileSync(cj)) : 'missing',
    're-extract sentinel-grid-stage1a.zip');
  if (cjOk) {
    const want = '20743ff77ddf43a87b273a253c3e900422511cc052de44220437728efedab134';
    row('  matches expected hash', sha(fs.readFileSync(cj)) === want,
      'expected ' + want.slice(0, 16) + '…',
      'your frozen archive differs from the one this bundle was built against');
  }
  const wdir = path.join(FROZEN, 'witnesses');
  const n = fs.existsSync(wdir) ? fs.readdirSync(wdir).filter(f => f.endsWith('.json')).length : 0;
  row('witness files', n === 474, n + ' found, expected 474',
    n === 0 ? 're-extract sentinel-grid-stage1a.zip'
            : 'run: node lab3.js certify --output-dir /tmp/x && node lab3.js negative --output-dir /tmp/x');
  if (n === 474) {
    const WR = require('../governance/witness-root');
    const r = WR.witnessRoot(FROZEN);
    row('  witness root', r.witness_root_hash ===
      '6797bbaa01c8ca870fca77cddb557cb220d2013957352ffcf23975a00461f0dc',
      r.witness_root_hash, 'frozen evidence has been modified — re-extract the archive');
  }
}

/* 4. governance artifacts */
[['docs/governance/GUARDRAILS-v2.md', ROOT],
 ['docs/governance/guardrails-v2-manifest.json', ROOT],
 ['docs/governance/stage1a-v1-grandfathering-attestation.json', ROOT],
 ['docs/governance/frozen-paths.json', ROOT],
 ['docs/governance/evidence-partitions.json', ROOT],
 ['docs/governance/leaf-registry.json', ROOT],
 ['governance/canonical-json.js', LAB],
 ['governance/witness-root.js', LAB],
 ['governance/verify-governance.js', LAB],
 ['governance/frozen-guard.js', LAB]].forEach(([rel, base]) =>
  row(rel, fs.existsSync(path.join(base, rel)), '',
    'copy sentinel-w0g-w0s/docs and /sgrid-lab over your repo root'));

/* 4b. W0-A' artifacts — all three or none. A partial install is the failure mode
   that produced a raw ENOENT, so detect presence first, then judge. */
const W0A = [
  ['docs/governance/action-lifecycle-registry.json', ROOT],
  ['public_html/azl/azl-ref-adapter-v4.js', ROOT],
  ['sgrid-lab/tests/w0a-action-legality.test.js', ROOT]
].map(([rel, base]) => ({ rel, present: fs.existsSync(path.join(base, rel)) }));
const anyW0A = W0A.some(x => x.present);
const allW0A = W0A.every(x => x.present);
for (const x of W0A) {
  row("W0-A' " + x.rel, x.present || !anyW0A,
    x.present ? '' : (anyW0A ? 'MISSING while other W0-A\' files are present — PARTIAL INSTALL' : 'not applied yet (fine)'),
    'copy ALL THREE directories from w0a-prime-a1-a10: docs, public_html, sgrid-lab');
}
if (anyW0A && !allW0A) {
  row("W0-A' install is complete", false, W0A.filter(x => !x.present).length + ' of 3 file(s) missing',
    'copy ALL THREE directories from w0a-prime-a1-a10: docs, public_html, sgrid-lab');
}


/* 5. fixtures */
const FX = path.join(__dirname, 'fixtures', 'governance');
const nfx = fs.existsSync(FX) ? fs.readdirSync(FX).filter(f => f.endsWith('.json')).length : 0;
row('governance fixtures', nfx >= 14, nfx + ' found, expected 14',
  'copy sentinel-w0g-w0s/sgrid-lab/tests/fixtures over sgrid-lab/tests');
row('doctrine fixtures', fs.existsSync(path.join(FX, 'doctrine', 'doctrine-good.md')), '',
  'copy sentinel-w0g-w0s/sgrid-lab/tests/fixtures over sgrid-lab/tests');

/* report */
const pad = Math.max(...rows.map(r => r.label.length)) + 2;
for (const r of rows) {
  console.log((r.ok ? '  OK   ' : '  FAIL ') + r.label.padEnd(pad) + (r.detail || ''));
}
if (fatal) {
  console.log('\n' + fatal + ' problem(s). Fixes:\n');
  const seen = new Set();
  for (const r of rows) if (!r.ok && r.fix && !seen.has(r.fix)) { seen.add(r.fix); console.log('  - ' + r.fix); }
  console.log('\nINSTALL CHECK FAIL');
} else {
  console.log('\nINSTALL CHECK PASS — safe to run the suites');
}
process.exit(fatal ? 1 : 0);
