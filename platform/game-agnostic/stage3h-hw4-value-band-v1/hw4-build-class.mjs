// H-W4 Phase 5 class builder: the identical frozen buildClass (twin joins only on public-content equality, projection
// identity, frozen-arm decision identity and strict-index preflight; truth released only after every decision is fixed)
// with the H-W4 allocation, exclusion context and pool. The builder function itself is imported unchanged.
//   node hw4-build-class.mjs worker <EXPLORATION|VALIDATION> <from> <to> <i> <n>
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { buildClass } from '../stage3h-hw1-dev-v1/i2-build-class.mjs';
import { nativeWorld } from '../stage3h-safety-feasibility-v1/twins.mjs';
import { loadAllocation, loadExclusions, blockSchedule } from './hw4-allocator.mjs';
import { withValueBands } from './hw4-contract-v2.mjs';

const LANE = dirname(fileURLToPath(import.meta.url));
export const CLASS_DIR = (population) => resolve(LANE, 'work/classes', population);

const [mode, a1, a2, a3, a4, a5] = process.argv.slice(2);
if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'hw4-build-class.mjs')) {
  if (mode !== 'worker') throw Error('USAGE: node hw4-build-class.mjs worker <EXPLORATION|VALIDATION> <from> <to> <i> <n>');
  const population = a1, from = Number(a2), to = Number(a3), i = Number(a4), n = Number(a5), t0 = Date.now();
  if (![from, to, i, n].every(Number.isInteger) || !(i >= 0 && i < n && from < to)) throw Error('USAGE: node hw4-build-class.mjs worker <population> <from> <to> <i> <n>');
  const extra = population === 'VALIDATION' ? [resolve(LANE, 'evidence/HW4_REGISTRY_EXPLORATION.json')] : [];
  const pool = JSON.parse(readFileSync(resolve(LANE, 'work/pool', `pool-${population}.json`), 'utf8')).pool, alloc = loadAllocation(), ctx = loadExclusions(extra);
  const schedules = new Map(), comboFor = (block, k) => { if (!schedules.has(block)) schedules.set(block, new Map(blockSchedule(ctx, population, block, alloc).map((c) => [c.k, c]))); return schedules.get(block).get(k); };
  const out = [], status = {};
  pool.slice(from, to).forEach((e, off) => {
    if (off % n !== i) return;
    const c = comboFor(e.block, e.k); if (!c) throw Error('COMBO_NOT_FOUND:' + e.id);
    const r = buildClass(e, c, ctx.strict); status[r.status] = (status[r.status] ?? 0) + 1;
    if (r.status === 'OK') { // DEV V2 contract: attach the base-decision-time value band to the stored projection (V1 arm ignores .band)
      const nw = nativeWorld(c); if (nw.worldHash !== e.worldHash) throw Error('BASE_REGENERATION_MISMATCH_B:' + e.id);
      const spread = nw.config.curriculumParameters.valueSpread;
      r.valueSpread = spread; r.projectionBanded = withValueBands(r.projection, nw.world, spread);
    }
    out.push(r);
  });
  mkdirSync(CLASS_DIR(population), { recursive: true });
  writeExclusive(resolve(CLASS_DIR(population), `range-${from}-${to}-shard-${i}-of-${n}.json`), { population, from, to, shard: i, of: n, seconds: (Date.now() - t0) / 1000, classes: out });
  console.log(JSON.stringify({ population, from, to, shard: i, built: out.length, status, seconds: (Date.now() - t0) / 1000 }));
}
