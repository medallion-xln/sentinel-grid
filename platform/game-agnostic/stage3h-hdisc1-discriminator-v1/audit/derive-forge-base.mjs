// H-DISC-1 — derive the inference-side Forge base (keys, symmetry, SK1 feature set) from the frozen SK1 adapter.
//   node audit/derive-forge-base.mjs            print what would be derived and whether the files on disk equal it
//   node audit/derive-forge-base.mjs --write    write discriminator/forge-base/*.mjs and evidence/HDISC1_FORGE_BASE_PROVENANCE.json
//   node audit/derive-forge-base.mjs verify     recompute; compare with the files on disk and the provenance record; writes nothing
//
// WHY. The frozen SK1 module adapters/forge/projection.mjs holds two different things in one file:
//   (1) projection-level functions: keys, Weisfeiler-Leman colours, symmetry, canonical frame — functions of a PUBLIC PROJECTION;
//   (2) the harness-side extractor projectPublic(view) and its read tracer, which read a NATIVE OBSERVABLE VIEW
//       (entity ids for linking, the list of excluded integrity fields).
// An inference component receives a projection and never a view. Part (2) must therefore not be in its closure.
// The SK1 file is frozen and is NOT modified. This script derives a lane-local copy that contains part (1) only, and a
// copy of the SK1 featuriser that imports it. Nothing else changes: every retained line is byte-identical to the frozen
// source, and discriminator/forge-base.test.mjs shows the derived featuriser returns identical output.
// Evaluation-side tooling; never imported by the inference closure.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), SK1 = resolve(LANE, '../stage3h-sk1-safety-kernel-v1'), OUT = resolve(LANE, 'discriminator/forge-base'), PROV = resolve(LANE, 'evidence/HDISC1_FORGE_BASE_PROVENANCE.json');
const sha = (s) => createHash('sha256').update(s).digest('hex'), fail = (m) => { throw Error(m); };
const SOURCES = { projection: 'adapters/forge/projection.mjs', features: 'adapters/forge/features.mjs' };
const FORBIDDEN_AFTER = /READ_PATHS|EXCLUDED_FIELDS|traceReads|unallowedReads|projectPublic|FLAG_FIELDS|LINK_PARAMS|entityId|sourceStateHash|worldHash|observedPosition|\ballowed\(/;

/** Remove the lines from the first line starting with `from` through the first later line for which `until` holds, inclusive. */
function cut(lines, from, until, what, removed) {
  const i = lines.findIndex((l) => l.startsWith(from)); if (i < 0) fail('DERIVATION_MARKER_MISSING:' + what); let j = i; while (j < lines.length && !until(lines[j], j, i)) j++; if (j >= lines.length) fail('DERIVATION_END_MISSING:' + what);
  removed.push({ what, lines: j - i + 1, firstLine: lines[i].slice(0, 60), lastLine: lines[j].slice(0, 60) }); return [...lines.slice(0, i), ...lines.slice(j + 1)];
}
export function deriveProjection(source) {
  let lines = source.split('\n'); const removed = [];
  const firstCode = lines.findIndex((l) => l.startsWith('import ')); if (firstCode < 0) fail('DERIVATION_MARKER_MISSING:first import'); removed.push({ what: 'SK1 header comment', lines: firstCode }); lines = lines.slice(firstCode);
  lines = cut(lines, '/** Every view path the projection may read.', (l) => l.startsWith('export const unallowedReads'), 'READ_PATHS, EXCLUDED_FIELDS, allowed, traceReads, unallowedReads (native-view read tracing)', removed);
  lines = cut(lines, 'const FLAG_FIELDS = {', (l, j, i) => j > i && l === '}', 'FLAG_FIELDS, LINK_PARAMS, projectPublic (native-view extractor)', removed);
  const header = ['// H-DISC-1 inference-side Forge projection functions. DERIVED FILE — do not edit by hand; regenerate with audit/derive-forge-base.mjs.',
    '// Source: stage3h-sk1-safety-kernel-v1/adapters/forge/projection.mjs (frozen, unmodified). Every line below is byte-identical to that',
    '// file. Two blocks were REMOVED: the native-view extractor projectPublic(view) with its field tables, and the view read tracer. What',
    '// remains takes a PUBLIC PROJECTION as input: action keys, Weisfeiler-Leman colours, symmetry and the canonical frame.',
    '// Provenance: evidence/HDISC1_FORGE_BASE_PROVENANCE.json. The only import is node:crypto.'].join('\n');
  const body = lines.join('\n'); const hit = body.match(FORBIDDEN_AFTER); if (hit) fail('DERIVED_PROJECTION_STILL_CONTAINS_VIEW_SIDE_CODE:' + hit[0]);
  for (const need of ['export function keyV2', 'export const keysV2', 'export function symmetryReport', 'export function canonicalFrame', 'export function canonicalActionKeys', 'export function frameProjection', 'export const PROJECTION_VERSION']) if (!body.includes(need)) fail('DERIVED_PROJECTION_LOST:' + need);
  return { text: header + '\n' + body, removed };
}
export function deriveFeatures(source) {
  const rewrites = [["from './projection.mjs';", "from './projection-keys.mjs';"], ["from './evidence.mjs';", "from '../../../stage3h-sk1-safety-kernel-v1/adapters/forge/evidence.mjs';"], ["from '../../kernel/contract.mjs';", "from '../../../stage3h-sk1-safety-kernel-v1/kernel/contract.mjs';"]];
  let text = source; const changed = []; for (const [a, b] of rewrites) { if (text.split(a).length !== 2) fail('DERIVATION_IMPORT_NOT_FOUND_EXACTLY_ONCE:' + a); text = text.replace(a, b); changed.push({ from: a, to: b }); }
  const header = ['// H-DISC-1 inference-side copy of the SK1 Forge featuriser. DERIVED FILE — do not edit by hand; regenerate with audit/derive-forge-base.mjs.',
    '// Source: stage3h-sk1-safety-kernel-v1/adapters/forge/features.mjs (frozen, unmodified). Byte-identical except three import paths:',
    '// the projection functions come from the derived ./projection-keys.mjs; evidence validation and the kernel contract are imported',
    '// from the frozen SK1 lane unchanged. Provenance: evidence/HDISC1_FORGE_BASE_PROVENANCE.json.'].join('\n');
  return { text: header + '\n' + text, importRewrites: changed };
}
export function derive() {
  const src = Object.fromEntries(Object.entries(SOURCES).map(([k, f]) => [k, readFileSync(resolve(SK1, f), 'utf8')])), p = deriveProjection(src.projection), f = deriveFeatures(src.features);
  const frozen = JSON.parse(readFileSync(resolve(SK1, 'evidence/SK1_EXPERIMENT_FREEZE.json'), 'utf8')).codeHashes;
  for (const [k, file] of Object.entries(SOURCES)) if (frozen[file] !== sha(src[k])) fail('SK1_SOURCE_DIFFERS_FROM_THE_SK1_FREEZE:' + file);
  const files = { 'discriminator/forge-base/projection-keys.mjs': p.text, 'discriminator/forge-base/features.mjs': f.text };
  const record = { schema: 'HDISC1_FORGE_BASE_PROVENANCE_V1', authority: 'R0', stage: 'STAGE3H-H-DISC-1', deriverSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    sources: Object.fromEntries(Object.entries(SOURCES).map(([k, file]) => [`stage3h-sk1-safety-kernel-v1/${file}`, { sha256: sha(src[k]), equalsTheSk1Freeze: true }])), sourcesModified: false,
    derived: Object.fromEntries(Object.entries(files).map(([k, t]) => [k, { sha256: sha(t), bytes: Buffer.byteLength(t) }])), projection: { removed: p.removed, retainedLinesAreByteIdenticalToTheSource: true }, features: { importRewrites: f.importRewrites, otherwiseByteIdentical: true },
    reason: 'the inference closure must not contain code that reads a native observable view; the frozen SK1 file mixes projection-level functions with the view extractor' };
  return { files, record };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'print', { files, record } = derive(), text = JSON.stringify(record, null, 1) + '\n';
  const onDisk = Object.fromEntries(Object.entries(files).map(([k, t]) => [k, existsSync(resolve(LANE, k)) && readFileSync(resolve(LANE, k), 'utf8') === t]));
  if (mode === '--write') { mkdirSync(OUT, { recursive: true }); for (const [k, t] of Object.entries(files)) writeFileSync(resolve(LANE, k), t); writeFileSync(PROV, text); console.log('written', Object.keys(files).join(', '), 'and evidence/HDISC1_FORGE_BASE_PROVENANCE.json'); }
  else { const ok = Object.values(onDisk).every(Boolean) && (mode !== 'verify' || (existsSync(PROV) && readFileSync(PROV, 'utf8') === text));
    console.log(JSON.stringify({ mode, derived: record.derived, removed: record.projection.removed, filesOnDiskEqualTheDerivation: onDisk }, null, 1)); console.log(ok ? 'HDISC1_FORGE_BASE_VERIFY_PASS' : 'HDISC1_FORGE_BASE_NOT_CURRENT'); if (mode === 'verify' && !ok) process.exitCode = 1; }
}
