// SK1 Gate 0.2 — derive the lane-local, import-free public projection from the frozen H-W1 module.
// The H-W1 file stage3h-hw1-dev-v1/public-projection.mjs is NOT modified. At committed HEAD it imports ./transforms.mjs
// (which reaches evaluator-capable code); an uncommitted working-tree cut imports the same constant from its definition
// site. This script removes BOTH import variants and embeds the three orientation tables as literals, so the derived
// file has no import except node:crypto and is byte-identical whichever revision it is derived from.
// The tables are read from the engine module here (derivation time) and asserted again by tests/projection.test.mjs.
//   /opt/homebrew/bin/node infra/derive-projection.mjs            print the derived hash for the working-tree and the HEAD revision
//   /opt/homebrew/bin/node infra/derive-projection.mjs --write    write adapters/forge/projection.mjs and evidence/SK1_PROJECTION_PROVENANCE.json
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { orientDirection, DIRECTION_DELTAS, ORIENTATIONS } from '../../src/forge-symmetric/orientation-symmetric-v1.js';

const LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GA = resolve(LANE, '..'), REPO = resolve(GA, '../..');
const SRC_REL = 'platform/game-agnostic/stage3h-hw1-dev-v1/public-projection.mjs', sha = (s) => createHash('sha256').update(s).digest('hex');
const table = Object.fromEntries(ORIENTATIONS.map((t) => [t, Object.fromEntries(Object.keys(DIRECTION_DELTAS).map((d) => [d, orientDirection(t, d)]))]));
const EMBED = [
  '// ---- embedded orientation tables (literal copies of src/forge-symmetric/orientation-symmetric-v1.js; asserted equal by tests/projection.test.mjs)',
  `const ORIENTATIONS = Object.freeze(${JSON.stringify([...ORIENTATIONS])});`,
  `const DIRECTION_DELTAS = Object.freeze(${JSON.stringify(Object.fromEntries(Object.entries(DIRECTION_DELTAS).map(([k, v]) => [k, [...v]])))});`,
  `const ORIENT_TABLE = Object.freeze(${JSON.stringify(table)});`,
  "const orientDirection = (t, d) => { const m = ORIENT_TABLE[t]; if (!m || !(d in m)) throw Error('UNKNOWN_ORIENTATION_OR_DIRECTION'); return m[d]; };",
  'const D4_ELEMENTS = ORIENTATIONS;',
  'export const D4_FRAMES = ORIENTATIONS;',
].join('\n');
const HEADER = [
  '// SK1 lane-local public projection for Forge World. DERIVED FILE — do not edit by hand; regenerate with infra/derive-projection.mjs.',
  '// Source: stage3h-hw1-dev-v1/public-projection.mjs (H-W1 I-1, frozen). The body below is that file verbatim except that its imports of',
  '// the orientation module / transforms.mjs are replaced by embedded literal tables. The only import is node:crypto, so this file and',
  '// everything that depends on it stay outside the evaluator-capable module graph. Provenance: evidence/SK1_PROJECTION_PROVENANCE.json.',
].join('\n');

export function derive(source) {
  const lines = source.split('\n'), out = []; let embedded = false, removed = [];
  for (const line of lines) {
    if (/^import\s.*from\s+'\.\.\/src\/forge-symmetric\/orientation-symmetric-v1\.js';\s*$/.test(line) || /^import\s.*from\s+'\.\/transforms\.mjs';\s*$/.test(line) || /^const D4_ELEMENTS = ORIENTATIONS;/.test(line)) {
      removed.push(line); if (!embedded) { out.push(EMBED); embedded = true; } continue;
    }
    out.push(line);
  }
  if (!embedded) throw Error('DERIVATION_ANCHOR_NOT_FOUND');
  // normalise the blank lines after the embedded block (the two revisions differ only there), so both give identical bytes
  const joined = out.join('\n'), at = joined.indexOf(EMBED) + EMBED.length, text = joined.slice(0, at) + '\n\n' + joined.slice(at).replace(/^\n+/, '');
  const imports = [...text.matchAll(/^import\s.*$/gm)].map((m) => m[0]);
  if (imports.length !== 1 || !/from 'node:crypto'/.test(imports[0])) throw Error('DERIVED_FILE_HAS_UNEXPECTED_IMPORTS:' + imports.join('|'));
  return { text: HEADER + '\n' + text, removed };
}

const working = readFileSync(resolve(REPO, SRC_REL), 'utf8'), head = execFileSync('/usr/bin/git', ['-C', REPO, 'show', `HEAD:${SRC_REL}`], { encoding: 'utf8' });
const dW = derive(working), dH = derive(head);
const result = { sourceFile: SRC_REL, sourceSha256: { workingTree: sha(working), committedHead: sha(head) }, derivedSha256: { fromWorkingTree: sha(dW.text), fromCommittedHead: sha(dH.text) }, identicalFromBothRevisions: dW.text === dH.text,
  removedLines: { workingTree: dW.removed, committedHead: dH.removed }, embeddedTables: { ORIENTATIONS: [...ORIENTATIONS], DIRECTION_DELTAS, ORIENT_TABLE: table } };
if (!result.identicalFromBothRevisions) throw Error('DERIVATION_DIFFERS_BETWEEN_REVISIONS');
console.log(JSON.stringify({ sourceSha256: result.sourceSha256, derivedSha256: result.derivedSha256.fromCommittedHead, identicalFromBothRevisions: true, removed: result.removedLines }, null, 1));
if (process.argv.includes('--write')) {
  writeFileSync(resolve(LANE, 'adapters/forge/projection.mjs'), dH.text);
  writeFileSync(resolve(LANE, 'evidence/SK1_PROJECTION_PROVENANCE.json'), JSON.stringify({ schema: 'SK1_PROJECTION_PROVENANCE_V1', authority: 'R0', repoHead: execFileSync('/usr/bin/git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), ...result,
    statement: 'The H-W1 source file was not modified. The committed H-W4 static-import failure at HEAD is NOT repaired by this derivation; it remains as recorded. This file gives the NEW kernel an evaluator-free projection only.' }, null, 1) + '\n');
  console.log('written adapters/forge/projection.mjs and evidence/SK1_PROJECTION_PROVENANCE.json');
}
