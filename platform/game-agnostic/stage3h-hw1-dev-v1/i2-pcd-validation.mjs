// H-W1 I-2 PCD validation driver (R0). The 341 spent classes are DEV fixtures, not independent evidence.
//   node i2-pcd-validation.mjs worker <i> <n>      class k with k % n == i -> work/i2/pcd-shard-<i>-of-<n>.json (git-ignored)
//   node i2-pcd-validation.mjs aggregate [--write] merge, evaluate gates, record evidence/I2_PCD_VALIDATION.json only if all pass
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { candidates } from '../stage3h-safety-feasibility-v1/search.mjs';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { PCD_VERSION, TAMPERS, NAIVE_PCD } from './i2-pcd.mjs';
import { pcdClass } from './i2-pcd-class.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), WORK = resolve(LANE, 'work/i2'), [mode, a, b] = process.argv.slice(2);
const sha = (f) => createHash('sha256').update(readFileSync(resolve(LANE, f))).digest('hex');
const KINDS = ['RELABEL', 'MENU', 'D4', 'HIDDEN'];

if (mode === 'worker') {
  const i = Number(a), n = Number(b), out = []; mkdirSync(WORK, { recursive: true });
  candidates().forEach((c, k) => { if (k % n === i) out.push({ ord: k, ...pcdClass(c) }); });
  writeExclusive(resolve(WORK, `pcd-shard-${i}-of-${n}.json`), out);
  console.log(`pcd shard ${i}/${n}: ${out.length} classes`);
} else if (mode === 'aggregate') {
  const total = candidates().length, rows = readdirSync(WORK).filter((f) => f.startsWith('pcd-shard-')).flatMap((f) => JSON.parse(readFileSync(resolve(WORK, f), 'utf8'))).sort((x, y) => x.ord - y.ord);
  if (rows.length !== total || rows.some((r, k) => r.ord !== k)) throw Error(`SHARDS_INCOMPLETE ${rows.length}/${total}`);
  const gates = [], gate = (name, pass, detail) => gates.push({ name, pass: Boolean(pass), detail });
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const inv = Object.fromEntries(KINDS.map((k) => [k, { twins: sum((r) => r.twins[k]?.n ?? 0), fineFailures: sum((r) => r.twins[k]?.fineBad ?? 0), coarseFailures: sum((r) => r.twins[k]?.coarseBad ?? 0) }]));
  for (const k of KINDS) { gate(`FINE_PCD_INVARIANT_UNDER_${k}`, inv[k].twins > 0 && inv[k].fineFailures === 0, inv[k]); gate(`COARSE_PCD_INVARIANT_UNDER_${k}`, inv[k].twins > 0 && inv[k].coarseFailures === 0, inv[k]); }
  const naive = Object.fromEntries(Object.keys(NAIVE_PCD).map((nm) => [nm, Object.fromEntries(KINDS.map((k) => [k, sum((r) => r.naive[nm]?.[k]?.differs ?? 0)]))]));
  gate('EVERY_NAIVE_DIGEST_IS_CAUGHT_BY_A_TWIN_KIND', Object.values(naive).every((byKind) => Object.values(byKind).some((c) => c > 0)), { differsByTwinKind: naive });
  const tamper = Object.fromEntries(TAMPERS.map((t) => [t.name, { expectCoarseChange: t.coarse, classes: rows.length, fineChanged: sum((r) => (r.tamper[t.name].fineChanged ? 1 : 0)), enteringCoarse: sum((r) => (r.tamper[t.name].enters ? 1 : 0)),
    coarseChanged: sum((r) => (r.tamper[t.name].coarseChanged ? 1 : 0)), coarseChangedWhenEntering: sum((r) => (r.tamper[t.name].enters && r.tamper[t.name].coarseChanged ? 1 : 0)) }]));
  gate('EVERY_TAMPER_CHANGES_THE_FINE_PCD', Object.values(tamper).every((t) => t.fineChanged === t.classes), tamper);
  gate('COARSE_PCD_CHANGES_WHEN_A_COARSE_FIELD_IS_TAMPERED', TAMPERS.filter((t) => t.coarse).every((t) => tamper[t.name].coarseChangedWhenEntering === tamper[t.name].enteringCoarse && tamper[t.name].enteringCoarse > 0), Object.fromEntries(TAMPERS.filter((t) => t.coarse).map((t) => [t.name, [tamper[t.name].coarseChangedWhenEntering, tamper[t.name].enteringCoarse]])));
  gate('COARSE_PCD_IGNORES_CLOCK_FIELDS_AND_COST', TAMPERS.filter((t) => !t.coarse).every((t) => tamper[t.name].coarseChanged === 0), Object.fromEntries(TAMPERS.filter((t) => !t.coarse).map((t) => [t.name, tamper[t.name].coarseChanged])));
  const group = (key) => { const m = new Map(); rows.forEach((r) => { const k = r[key]; (m.get(k) ?? m.set(k, []).get(k)).push(`${r.set}:${r.idx}`); }); return [...m.values()].filter((g) => g.length > 1); };
  const fineGroups = group('fine'), coarseGroups = group('coarse');
  gate('NO_FINE_PCD_COLLISION_AMONG_THE_341', fineGroups.length === 0, { distinctFine: new Set(rows.map((r) => r.fine)).size, classes: rows.length, collisionGroups: fineGroups });
  gate('ALL_BASE_WORLDS_REGENERATED_AND_BAND_H2', rows.length === total && rows.every((r) => r.band === 'H2'), { classes: rows.length });
  const out = { schema: 'STAGE3H_HW1_I2_PCD_VALIDATION_V1', authority: 'R0', checkedAt: new Date().toISOString(), head: execFileSync('/usr/bin/git', ['-C', resolve(LANE, '../../..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    note: 'DEV fixtures only: the 341 spent classes are not independent evidence. Their PCDs form the mandatory exclusion registry for every H-W1 population.', pcdVersion: PCD_VERSION, classes: rows.length,
    sourceHashes: Object.fromEntries(['public-projection.mjs', 'transforms.mjs', 'i2-pcd.mjs', 'i2-pcd-class.mjs', 'i2-pcd-validation.mjs'].map((f) => [f, sha(f)])),
    invariance: inv, naiveDigests: naive, tamper, coarseCollisionGroups: coarseGroups.length, coarseCollisionClasses: coarseGroups.flat().length, distinctCoarse: new Set(rows.map((r) => r.coarse)).size,
    gates, allPass: gates.every((g) => g.pass), classPcds: rows.map((r) => [r.set, r.idx, r.worldHash, r.fine, r.coarse]) };
  console.log(JSON.stringify({ allPass: out.allPass, failed: gates.filter((g) => !g.pass).map((g) => ({ name: g.name, detail: g.detail })), invariance: inv, naive, coarseCollisionGroups: coarseGroups.length, distinctCoarse: out.distinctCoarse, fineGroups: fineGroups.length }, null, 1));
  if (process.argv.includes('--write')) { if (!out.allPass) throw Error('I2_PCD_VALIDATION_NOT_PASSING_NOT_RECORDED'); writeExclusive(resolve(LANE, 'evidence/I2_PCD_VALIDATION.json'), out); console.log('recorded evidence/I2_PCD_VALIDATION.json'); }
} else throw Error('USAGE: node i2-pcd-validation.mjs worker <i> <n> | aggregate [--write]');
