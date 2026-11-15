// H-W1 I-2 screening: for every scheduled H2 world of an allocated block, apply the strict-index and PCD admission gate (public, outcome-independent, BEFORE any truth is
// computed) and then the frozen arm-stress rule (candidates() in stage3h-safety-feasibility-v1/search.mjs, hash 13a7ed68...): Nexus applies, B != N, and either S0 introduces vs
// Nexus or both arms' regrets lie in [40, 160]. Output goes to git-ignored work/i2/screen/. Validation outcome fields are counted only, never printed.
//   node i2-screen.mjs worker <EXPLORATION|VALIDATION> <block> <i> <n>
//   node i2-screen.mjs regress [count]       the screen with exclusions off reproduces candidates() on the first `count` H2 worlds of spent block 951
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devWorld, devLock, evaluatorTruth, score, writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { candidates } from '../stage3h-safety-feasibility-v1/search.mjs';
import { schedule } from '../stage3h-owner-governed-v1/connector.mjs';
import { projectPublic } from './public-projection.mjs';
import { pcd } from './i2-pcd.mjs';
import { loadExclusions, loadAllocation, blockSchedule, admission, GA } from './i2-allocator.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), OUT = resolve(LANE, 'work/i2/screen'), same = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

/** One world through the gate and the rule. ctx null = exclusions off (regression of the rule only). seen: world hashes already produced in this block. */
export function screenWorld(combo, ctx, seen) {
  const w = devWorld(combo); if (w.rejected) return { status: 'REJECTED_' + w.rejected };
  if (seen.has(w.worldHash)) return { status: 'DUPLICATE_WORLD_HASH' }; seen.add(w.worldHash);
  const menu = w.view.surface.map((e) => e.actionId); if (!menu.length || new Set(menu).size !== menu.length) return { status: 'REJECTED_NATIVE_MENU_INVALID' };
  const p = pcd(projectPublic(w.view), w.band);
  if (ctx) { const a = admission(ctx, w.worldHash, p); if (!a.ok) return { status: 'EXCLUDED_' + a.reason }; }
  const lock = devLock(w.view, w.band); if (lock.nexus.abstain) return { status: 'NEXUS_ABSTAIN' };
  const index = new Map(menu.map((id, i) => [id, i])), ix = (ids) => ids.map((id) => index.get(id)), B = ix(lock.selections.B), N = ix(lock.selections.N);
  if (same(B, N)) return { status: 'B_EQUALS_N' };
  const truth = evaluatorTruth(w.world, w.horizon, menu), sc = score(lock.selections, menu, truth), u = truth.map((t) => t.utility), max = Math.max(...u);
  const regB = Math.max(...B.map((i) => max - u[i])), regN = Math.max(...N.map((i) => max - u[i])), near = regB >= 40 && regB <= 160 && regN >= 40 && regN <= 160, introN = Boolean(sc.introductionN);
  if (!(introN || near)) return { status: 'NOT_STRESS' };
  return { status: 'ADMITTED', worldHash: w.worldHash, fine: p.fine, coarse: p.coarse, introN, near, reason: introN ? (near ? 'INTRO_AND_NEAR' : 'INTRO') : 'NEAR_THRESHOLD', regB, regN, menuSize: menu.length, seed: combo.seed, cell: combo.cell, k: combo.k };
}

const [mode, a1, a2, a3, a4] = process.argv.slice(2);
if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'i2-screen.mjs')) {
  if (mode === 'worker') {
    const population = a1, block = Number(a2), i = Number(a3), n = Number(a4), t0 = Date.now(), alloc = loadAllocation(), ctx = loadExclusions(population === 'VALIDATION' ? [resolve(LANE, 'evidence/I2_REGISTRY_EXPLORATION.json')] : []);
    if (!(Number.isInteger(i) && Number.isInteger(n) && i >= 0 && i < n)) throw Error('USAGE: node i2-screen.mjs worker <population> <block> <i> <n>');
    const combos = blockSchedule(ctx, population, block, alloc), seen = new Set(), funnel = {}, admitted = []; mkdirSync(OUT, { recursive: true });
    // duplicate-hash bookkeeping is per shard here and resolved globally at aggregation
    combos.forEach((c, j) => { if (j % n !== i) return; const r = screenWorld(c, ctx, seen); funnel[r.status] = (funnel[r.status] ?? 0) + 1; if (r.status === 'ADMITTED') admitted.push(r); });
    writeExclusive(resolve(OUT, `${population}-${block}-shard-${i}-of-${n}.json`), { population, block, shard: i, of: n, scheduled: combos.filter((_, j) => j % n === i).length, seconds: (Date.now() - t0) / 1000, funnel, admitted });
    console.log(JSON.stringify({ population, block, shard: i, scheduled: combos.filter((_, j) => j % n === i).length, admitted: admitted.length, seconds: (Date.now() - t0) / 1000 }));
  } else if (mode === 'regress') {
    const count = Number(a1 ?? 400), contract = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8')), t0 = Date.now();
    const combos = schedule(contract.populations, 951e9).map((c, k) => ({ ...c, k })).filter((c) => c.horizonBand === 'H2').slice(0, count), seen = new Set(), got = new Map();
    for (const c of combos) { const r = screenWorld(c, null, seen); if (r.status === 'ADMITTED') got.set(r.seed, r); }
    const seeds = new Set(combos.map((c) => c.seed)), want = new Map(candidates().filter((c) => c.set === 'FRESH_EXPLORE' && seeds.has(c.row.seed)).map((c) => [c.row.seed, c]));
    const missing = [...want.keys()].filter((s) => !got.has(s)), extra = [...got.keys()].filter((s) => !want.has(s)), reasonDiff = [...want].filter(([s, c]) => got.has(s) && got.get(s).reason !== c.reason).length, hashDiff = [...want].filter(([s, c]) => got.has(s) && got.get(s).worldHash !== c.row.worldHash).length;
    console.log(JSON.stringify({ worlds: combos.length, expected: want.size, got: got.size, missing: missing.length, extra: extra.length, reasonDiff, hashDiff, match: !missing.length && !extra.length && !reasonDiff && !hashDiff, seconds: (Date.now() - t0) / 1000 }));
    if (missing.length || extra.length || reasonDiff || hashDiff) process.exitCode = 1;
  } else throw Error('USAGE: node i2-screen.mjs worker <population> <block> <i> <n> | regress [count]');
}
