// H-W1 I-2 class builder: one pool entry -> one observation class (the base world plus its public-equivalent hidden-draw twins) with the offline evaluator truth of every member.
// Mirrors stage3h-safety-feasibility-v1/search.mjs#searchClass (regression-checked by `regress`): a twin joins only if its public content equals the base's, its public projection is
// identical and both frozen arms re-lock to the same decision. Failures are recorded, never thrown. Twin world hashes are preflighted against the strict index. Truth is released only
// after every decision in the class is fixed. Output is git-ignored (work/i2/classes/<population>/); validation files carry outcomes and are never printed.
//   node i2-build-class.mjs worker <population> <from> <to> <i> <n>   pool entries [from, to) with (j - from) % n == i
//   node i2-build-class.mjs regress [count]                            the builder reproduces searchClass on every 14th spent arm-stress class
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { evaluatorTruth, prng, writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { preflightWorlds } from '../stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs';
import { nativeWorld, hiddenSupport, decisions, twinFamily } from '../stage3h-safety-feasibility-v1/twins.mjs';
import { labels } from '../stage3h-safety-feasibility-v1/contract.mjs';
import { candidates, searchClass, DRAWS } from '../stage3h-safety-feasibility-v1/search.mjs';
import { comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { projectPublic } from './public-projection.mjs';
import { LANE, loadAllocation, loadExclusions, blockSchedule } from './i2-allocator.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex'), same = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));
export const CLASS_DIR = (population) => resolve(LANE, 'work/i2/classes', population);

/** Build one class. strict: strict index for twin-hash preflight (null for the regression on spent classes). Returns a record with status OK or the reason the class cannot be a population member. */
export function buildClass(entry, combo, strict) {
  const base = nativeWorld(combo);
  if (base.rejected || base.worldHash !== entry.worldHash) throw Error('BASE_REGENERATION_MISMATCH:' + entry.id);
  const head = { id: entry.id, block: entry.block, k: entry.k, seed: entry.seed, cell: entry.cell, family: entry.family, worldHash: entry.worldHash, fine: entry.fine, coarse: entry.coarse };
  const sup = hiddenSupport(base.config); if (!sup.inSupport) return { ...head, status: 'BASE_OUTSIDE_SUPPORT_MODEL', violations: sup.violations };
  const dec = decisions(base.view, base.band);
  if (dec.nexusAbstain || same(dec.B, dec.N)) throw Error('BASE_DECISION_MISMATCH:' + entry.id);
  const projection = projectPublic(base.view), projectionSha = sha(JSON.stringify(projection)), dropped = {}, note = (r) => { dropped[r] = (dropped[r] ?? 0) + 1; };
  const members = [{ kind: 'BASE', spec: [], w: base }], seen = new Set([base.worldHash]); let attempted = 0;
  for (const f of twinFamily(sup.coords, prng(base.worldHash), DRAWS)) {
    attempted++; const w = nativeWorld(combo, f.spec);
    if (w.rejected) { note('REJECTED_' + w.rejected); continue; }
    if (w.content !== base.content) { note('NOT_PUBLIC_EQUIVALENT'); continue; }
    if (sha(JSON.stringify(projectPublic(w.view))) !== projectionSha) { note('PROJECTION_DIFFERS'); continue; }
    const d = decisions(w.view, w.band);
    if (!(same(d.B, dec.B) && same(d.N, dec.N) && d.nexusAbstain === false && JSON.stringify(d.menu) === JSON.stringify(dec.menu))) { note('DECISION_CHANGED_ON_EQUIVALENT_TWIN'); continue; }
    if (seen.has(w.worldHash)) { note('DUPLICATE_MEMBER_HASH'); continue; }
    if (strict && !preflightWorlds(strict, [w.worldHash]).ok) { note('TWIN_HASH_IN_STRICT_INDEX'); continue; }
    seen.add(w.worldHash); members.push({ kind: f.kind, spec: f.spec, w });
  }
  // every decision in the class is fixed; truth is released only now
  const scored = members.map((m) => { const truth = evaluatorTruth(m.w.world, m.w.horizon, dec.menu).map((x) => x.utility); return { kind: m.kind, worldHash: m.w.worldHash, truth, ...labels(dec, truth) }; });
  const b = scored[0]; if (entry.regB !== undefined && (b.regretB !== entry.regB || b.regretN !== entry.regN)) throw Error('SCREEN_BUILD_REGRET_MISMATCH:' + entry.id);
  return { ...head, status: 'OK', menu: dec.menu, B: dec.B, N: dec.N, projection, projectionSha, twinsAttempted: attempted, twinsDropped: dropped, members: scored.map(({ kind, worldHash, truth }) => ({ kind, worldHash, truth })) };
}

const [mode, a1, a2, a3, a4, a5] = process.argv.slice(2);
if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'i2-build-class.mjs')) {
  if (mode === 'worker') {
    const population = a1, from = Number(a2), to = Number(a3), i = Number(a4), n = Number(a5), t0 = Date.now();
    if (![from, to, i, n].every(Number.isInteger) || !(i >= 0 && i < n && from < to)) throw Error('USAGE: node i2-build-class.mjs worker <population> <from> <to> <i> <n>');
    const pool = JSON.parse(readFileSync(resolve(LANE, 'work/i2/pool', `pool-${population}.json`), 'utf8')).pool, alloc = loadAllocation(), ctx = loadExclusions(population === 'VALIDATION' ? [resolve(LANE, 'evidence/I2_REGISTRY_EXPLORATION.json')] : []);
    const schedules = new Map(), comboFor = (block, k) => { if (!schedules.has(block)) schedules.set(block, new Map(blockSchedule(ctx, population, block, alloc).map((c) => [c.k, c]))); return schedules.get(block).get(k); };
    const out = [], status = {};
    pool.slice(from, to).forEach((e, off) => { if (off % n !== i) return; const c = comboFor(e.block, e.k); if (!c) throw Error('COMBO_NOT_FOUND:' + e.id); const r = buildClass(e, c, ctx.strict); status[r.status] = (status[r.status] ?? 0) + 1; out.push(r); });
    mkdirSync(CLASS_DIR(population), { recursive: true });
    writeExclusive(resolve(CLASS_DIR(population), `range-${from}-${to}-shard-${i}-of-${n}.json`), { population, from, to, shard: i, of: n, seconds: (Date.now() - t0) / 1000, classes: out });
    console.log(JSON.stringify({ population, from, to, shard: i, built: out.length, status, seconds: (Date.now() - t0) / 1000 }));
  } else if (mode === 'regress') {
    const count = Number(a1 ?? 24), picks = candidates().filter((_, k) => k % 14 === 0).slice(0, count), t0 = Date.now(), bad = [];
    for (const c of picks) {
      const row = c.row, combo = comboOf(row), ref = searchClass(c), entry = { id: `${c.set}:${row.idx}`, block: 0, k: row.idx, seed: row.seed, cell: row.cell, family: '', worldHash: row.worldHash, fine: '', coarse: '' };
      const got = buildClass(entry, combo, null);
      if (ref.status === 'BASE_OUTSIDE_SUPPORT_MODEL') { if (got.status !== ref.status) bad.push([entry.id, 'STATUS']); continue; }
      const hashes = new Set(ref.equivalentHashes), mine = new Set(got.members.map((m) => m.worldHash)), us = got.members.map((m) => m.truth);
      const rangeOf = (key) => { const v = got.members.map((m) => Math.max(...got[key].map((x) => Math.max(...m.truth) - m.truth[x]))); return [Math.min(...v), Math.max(...v)]; };
      const ok = hashes.size === mine.size && [...hashes].every((h) => mine.has(h)) && same(got.B, ref.B) && same(got.N, ref.N) && got.menu.length === ref.menuSize && JSON.stringify(rangeOf('B')) === JSON.stringify(ref.regretRange.B) && JSON.stringify(rangeOf('N')) === JSON.stringify(ref.regretRange.N) && us.length === got.members.length;
      if (!ok) bad.push([entry.id, 'CONTENT']);
    }
    console.log(JSON.stringify({ classes: picks.length, mismatches: bad, match: !bad.length, seconds: (Date.now() - t0) / 1000 })); if (bad.length) process.exitCode = 1;
  } else throw Error('USAGE: node i2-build-class.mjs worker <population> <from> <to> <i> <n> | regress [count]');
}
