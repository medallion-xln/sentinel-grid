// H-W4 Phase 5 screening: identical frozen screenWorld funnel (strict index + PCD admission BEFORE truth, then the
// frozen arm-stress rule) with the H-W4 exclusion context (ALL sealed registries incl. every H-W1 population) and the
// H-W4 allocation. The funnel function itself is imported unchanged from the frozen H-W1 module; only the CLI wiring
// (allocation, exclusions, output dir) differs.
//   node hw4-screen.mjs worker <EXPLORATION|VALIDATION> <block> <i> <n>
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { screenWorld } from '../stage3h-hw1-dev-v1/i2-screen.mjs';
import { loadExclusions, loadAllocation, blockSchedule } from './hw4-allocator.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), OUT = resolve(LANE, 'work/screen');

const [mode, a1, a2, a3, a4] = process.argv.slice(2);
if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'hw4-screen.mjs')) {
  if (mode !== 'worker') throw Error('USAGE: node hw4-screen.mjs worker <EXPLORATION|VALIDATION> <block> <i> <n>');
  const population = a1, block = Number(a2), i = Number(a3), n = Number(a4), t0 = Date.now(), alloc = loadAllocation();
  if (!(Number.isInteger(i) && Number.isInteger(n) && i >= 0 && i < n)) throw Error('USAGE: node hw4-screen.mjs worker <population> <block> <i> <n>');
  const extra = population === 'VALIDATION' ? [resolve(LANE, 'evidence/HW4_REGISTRY_EXPLORATION.json')] : [];
  const ctx = loadExclusions(extra), combos = blockSchedule(ctx, population, block, alloc), seen = new Set(), funnel = {}, admitted = [];
  mkdirSync(OUT, { recursive: true });
  combos.forEach((c, j) => { if (j % n !== i) return; const r = screenWorld(c, ctx, seen); funnel[r.status] = (funnel[r.status] ?? 0) + 1; if (r.status === 'ADMITTED') admitted.push(r); });
  writeExclusive(resolve(OUT, `${population}-${block}-shard-${i}-of-${n}.json`), { population, block, shard: i, of: n, scheduled: combos.filter((_, j) => j % n === i).length, seconds: (Date.now() - t0) / 1000, funnel, admitted });
  console.log(JSON.stringify({ population, block, shard: i, scheduled: combos.filter((_, j) => j % n === i).length, admitted: admitted.length, seconds: (Date.now() - t0) / 1000 }));
}
