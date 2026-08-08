/* _preflight.js — shared guard: fail with an actionable message, never a stack trace. */
'use strict';
const fs = require('fs');
const path = require('path');

function requireFrozen(FROZEN, who) {
  if (fs.existsSync(FROZEN) && fs.existsSync(path.join(FROZEN, 'certification.json'))) return;
  const lab = path.resolve(__dirname, '..');
  console.error('\n' + who + ': cannot run — the frozen Stage 1A archive is missing.\n');
  console.error('  expected: ' + FROZEN);
  console.error('  found   : ' + (fs.existsSync(FROZEN) ? 'directory exists but certification.json is absent' : 'nothing'));
  console.error('\nThis bundle is an OVERLAY. It does not contain the frozen evidence —');
  console.error('that ships in sentinel-grid-stage1a.zip and must already be in your tree.\n');
  console.error('Fix, from your repo root:');
  console.error('  unzip -o sentinel-grid-stage1a.zip -x "__MACOSX/*"');
  console.error('\nThen diagnose the whole tree with:');
  console.error('  cd ' + lab + ' && node tests/check-install.js\n');
  process.exit(1);
}
/* Generic: a missing required artifact must explain itself, not stack-trace. */
function requireFile(absPath, who, opts) {
  if (fs.existsSync(absPath)) return absPath;
  const o = opts || {};
  const lab = path.resolve(__dirname, '..');
  const root = path.resolve(lab, '..');
  console.error('\n' + who + ': cannot run — a required file is missing.\n');
  console.error('  expected: ' + absPath);
  if (o.ships_in) console.error('  ships in: ' + o.ships_in);
  console.error('');
  if (o.fix) console.error('Fix:\n  ' + o.fix + '\n');
  console.error('Locate a stray copy with:');
  console.error('  find ' + root + ' -name "' + path.basename(absPath) + '"');
  console.error('\nThen diagnose the whole tree with:');
  console.error('  cd ' + lab + ' && node tests/check-install.js\n');
  process.exit(1);
}

module.exports = { requireFrozen, requireFile };
