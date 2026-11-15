// SK1 class builder. The frozen H-W1 buildClass (base world plus its public-equivalent hidden twins; a twin joins only
// if its public content, projection and both frozen comparator decisions equal the base's; truth released only after
// every decision is fixed) under the SK1 exclusion context. Two SK1 additions, both PUBLIC-side:
//   * the canonical advisory evidence of the base view (identity-free comparator projections)
//   * an assertion that the lane-local projection equals the frozen projection stored by the builder
// Output is privileged (seeds, world hashes, evaluator truth) and gitignored.
//   node infra/build-class.mjs worker <EXPLORATION|VALIDATION> <from> <to> <i> <n>
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildClass } from '../../stage3h-hw1-dev-v1/i2-build-class.mjs';
import { nativeWorld } from '../../stage3h-safety-feasibility-v1/twins.mjs';
import { projectPublic } from '../adapters/forge/projection.mjs';
import { loadSk1Exclusions } from './exclusions.mjs';
import { loadAllocation, blockSchedule } from './allocator.mjs';
import { evidenceForView } from './evidence-source.mjs';
import { POOL_FILE } from './pool.mjs';
import { WORK, POPULATIONS, readJ, fail, writeExclusive } from './common.mjs';

export const classDir = (p) => resolve(WORK, 'classes', p);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, population, a2, a3, a4, a5] = process.argv.slice(2), from = Number(a2), to = Number(a3), i = Number(a4), n = Number(a5), t0 = Date.now();
  if (mode !== 'worker' || !POPULATIONS.includes(population) || ![from, to, i, n].every(Number.isInteger) || !(i >= 0 && i < n && from < to)) fail('USAGE: node infra/build-class.mjs worker <EXPLORATION|VALIDATION> <from> <to> <i> <n>');
  const pool = readJ(POOL_FILE).pool[population], alloc = loadAllocation(), ctx = loadSk1Exclusions(), sched = new Map(), out = [], status = {};
  const comboFor = (b, k) => { if (!sched.has(b)) sched.set(b, new Map(blockSchedule(ctx, b, alloc).map((c) => [c.k, c]))); return sched.get(b).get(k); };
  pool.slice(from, to).forEach((e, off) => { if (off % n !== i) return;
    const combo = comboFor(e.block, e.k); if (!combo) fail('COMBO_NOT_FOUND:' + e.id);
    const r = buildClass(e, combo, ctx.strict); status[r.status] = (status[r.status] ?? 0) + 1;
    if (r.status === 'OK') { const w = nativeWorld(combo); if (w.rejected || w.worldHash !== e.worldHash) fail('BASE_REGENERATION_MISMATCH:' + e.id);
      if (JSON.stringify(projectPublic(w.view)) !== JSON.stringify(r.projection)) fail('LANE_PROJECTION_DIFFERS_FROM_FROZEN_PROJECTION:' + e.id);
      const { evidence, lock } = evidenceForView(w.view, w.band), ix = (ids) => JSON.stringify(ids.map((id) => lock.menu.indexOf(id)).sort((a, b) => a - b)), srt = (a) => JSON.stringify([...a].sort((x, y) => x - y));
      if (ix(lock.selections.B) !== srt(r.B) || ix(lock.selections.N) !== srt(r.N)) fail('EVIDENCE_COMPARATORS_DIFFER_FROM_CLASS_RECORD:' + e.id);
      r.evidence = evidence; r.band = w.band; r.population = population; }
    out.push(r); });
  mkdirSync(classDir(population), { recursive: true });
  writeExclusive(resolve(classDir(population), `range-${from}-${to}-shard-${i}-of-${n}.json`), JSON.stringify({ population, from, to, shard: i, of: n, seconds: (Date.now() - t0) / 1000, classes: out }));
  console.log(JSON.stringify({ population, from, to, shard: i, built: out.length, status, seconds: (Date.now() - t0) / 1000 }));
}
