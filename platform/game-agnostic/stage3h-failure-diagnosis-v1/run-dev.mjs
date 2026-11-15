// STAGE3H_FAILURE_DIAGNOSIS_V1 per-world DEV runner. Usage: node run-dev.mjs <set> <shard> <of>
//   set DEV288        the 288 already-evaluated development worlds (stage3h-canonical-v1/plan.mjs)
//   set FRESH_EXPLORE fresh DEV namespace 951e9 + k, frozen V3 population design (12,768 scheduled)
//   set FRESH_CHECK   fresh DEV namespace 952e9 + k, same design; held out from all guard/selector exploration
// Per world: frozen generation/admission; O-6 menu validity; ALL decisions locked (original, O-2R.1 IDENTITY twin,
// five control relabellings); only then evaluator truth. Fresh worlds whose hash equals any prior executed,
// development or V4-ledger world are excluded (hash comparison only; no V4 row, outcome or analysis is read).
// Writes dev-runs/<set>/shard-<i>-of-<n>.jsonl ('wx') and a .done.json marker.
import { openSync, writeSync, closeSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { combinations } from '../stage3h-canonical-v1/plan.mjs';
import { nativeLock, schedule } from '../stage3h-owner-governed-v1/connector.mjs';
import { identityViewTwinV2 } from '../stage3h-owner-governed-v1/identity-view-v2.mjs';
import { stableStringify } from '../src/core/determinism.js';
import { LANE, GA, DEV_BLOCKS, ok, sha, readJson, writeExclusive, devWorld, devLock, evaluatorTruth, score, identityUniverse,
  relabelView, controlMaps, stringLeaves, objectKeys, changedLeafPaths, publicDescriptors } from './lib.mjs';

export const CONTROLS = ['ORDER_PRESERVING', 'HANDLES_ONLY', 'ENTITIES_ONLY', 'RANDOM_1', 'RANDOM_2'];
const setKey = (ids) => JSON.stringify([...ids].sort());

export function worldsOf(set) {
  if (set === 'DEV288') return combinations().map((c, idx) => ({ population: 'DEV288', cell: [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/'), ...c, idx }));
  ok(Object.hasOwn(DEV_BLOCKS, set), 'UNKNOWN_SET');
  const contract = readJson(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'));
  return schedule(contract.populations, DEV_BLOCKS[set]).map((c, idx) => ({ ...c, idx }));
}

export function priorWorldHashes() {
  const prior = new Set(readJson(resolve(GA, 'stage3h-owner-governed-v1/evidence/prior-world-exclusions.json')).priorWorldHashes);
  const runs = resolve(GA, 'stage3h-owner-governed-v1/runs/7c41ba89c5c63489');
  for (const r of ['A', 'B']) for (const f of readdirSync(resolve(runs, r)).filter((n) => n.endsWith('.ledger.json'))) for (const e of readJson(resolve(runs, r, f))) prior.add(e.worldHash);
  return prior;
}

const armChanges = (a, bMapped) => Object.fromEntries(['B', 'N', 'R'].map((arm) => [arm, setKey(a[arm]) !== setKey(bMapped[arm])]));
const nuis = (m0, m1) => ({ RB: Math.abs((m0.R.nreg - m0.B.nreg) - (m1.R.nreg - m1.B.nreg)), RN: Math.abs((m0.R.nreg - m0.N.nreg) - (m1.R.nreg - m1.N.nreg)) });

export function diagnoseWorld(combo, ctx) {
  const t0 = performance.now(), base = { set: ctx.set, idx: combo.idx, population: combo.population, cell: combo.cell, seed: combo.seed, band: combo.horizonBand };
  const w = devWorld(combo);
  if (w.rejected) return { ...base, rejected: w.rejected };
  if (ctx.seen.has(w.worldHash)) return { ...base, rejected: 'DUPLICATE_WORLD_HASH' };
  ctx.seen.add(w.worldHash);
  if (ctx.prior?.has(w.worldHash)) return { ...base, rejected: 'PRIOR_WORLD_EXCLUDED' };
  const view = w.view, menu = view.surface.map((e) => e.actionId), index = new Map(menu.map((id, i) => [id, i]));
  const o2r = identityViewTwinV2(view);
  const menus = [menu, o2r.view.surface.map((e) => e.actionId)];
  if (menus.some((m) => !m.length || new Set(m).size !== m.length)) return { ...base, rejected: 'NATIVE_MENU_INVALID' };

  // ---- every decision for this world, before any truth ----
  const lock = devLock(view, w.band), twin = devLock(o2r.view, w.band);
  const eq = controlMaps(view, 'O2R1_EQUIVALENT'), o2rReproduced = stableStringify(relabelView(view, eq.entity, eq.handle)) === stableStringify(o2r.view);
  const controls = CONTROLS.map((kind) => { const maps = controlMaps(view, kind, w.worldHash), cv = relabelView(view, maps.entity, maps.handle); return { kind, maps, lock: devLock(cv, w.band) }; });
  let frozenAgrees = null;
  if (ctx.verifyFrozen) {
    try { const f = nativeLock(view, w.band), ft = nativeLock(o2r.view, w.band);
      frozenAgrees = stableStringify(f.selections) === stableStringify(lock.selections) && stableStringify(ft.selections) === stableStringify(twin.selections); }
    catch (e) { frozenAgrees = 'ERROR:' + e.message; }
  }
  const decisionsHash = sha({ lock: lock.selections, twin: twin.selections, controls: controls.map((c) => c.lock.selections) });

  // ---- evaluator truth (released only now) ----
  const truth = evaluatorTruth(w.world, w.horizon, menu), sc = score(lock.selections, menu, truth);
  ok(sha({ lock: lock.selections, twin: twin.selections, controls: controls.map((c) => c.lock.selections) }) === decisionsHash, 'DECISIONS_MUTATED_AFTER_TRUTH');

  const backMap = (handleMap) => { const inv = Object.fromEntries(Object.entries(handleMap).map(([a, b]) => [b, a])); return (id) => inv[id] ?? id; };
  const mapSel = (sel, back) => Object.fromEntries(Object.entries(sel).map(([arm, ids]) => [arm, ids.map(back)]));
  const typeOf = (id) => view.surface[index.get(id)].actionType;

  // O-2R.1 IDENTITY twin
  const back = backMap(o2r.actionMap), twinSel = mapSel(twin.selections, back), twinMetrics = score(twinSel, menu, truth).metrics;
  const nO = lock.nexus.action, nT = twin.nexus.action === null ? null : back(twin.nexus.action);
  let nexusClass;
  if (lock.nexus.abstain !== twin.nexus.abstain) nexusClass = 'ABSTENTION_CHANGED';
  else if (lock.nexus.abstain) nexusClass = 'BOTH_ABSTAIN';
  else if (nO === nT) nexusClass = 'SAME';
  else nexusClass = typeOf(nO) === typeOf(nT) ? 'SAME_TYPE_TIE_BREAK' : 'DIFFERENT_TYPE';
  // Mechanism check: Nexus = lexically smallest handle among the menu actions of its preferred type, in each view.
  let tieClass = null, mechanismPredicted = null;
  if (!lock.nexus.abstain) {
    tieClass = menu.filter((id) => typeOf(id) === typeOf(nO));
    const twinHandle = (id) => o2r.actionMap[id];
    const predO = [...tieClass].sort()[0], predT = [...tieClass].sort((a, b) => (twinHandle(a) < twinHandle(b) ? -1 : twinHandle(a) > twinHandle(b) ? 1 : 0))[0];
    mechanismPredicted = predO === nO && (twin.nexus.abstain ? false : predT === nT);
  }
  // transform validity probes
  const universe = identityUniverse(view), renamedIds = new Set(universe), handles = new Set(menu);
  const twinLeaves = stringLeaves(o2r.view), leaks = twinLeaves.filter(([, s]) => renamedIds.has(s) || handles.has(s));
  const keyHits = objectKeys(view).filter((k) => renamedIds.has(k) || handles.has(k));
  const entityVals = Object.values(o2r.entityMap), handleVals = Object.values(o2r.actionMap);
  const identity = {
    o2rReproduced, frozenAgrees,
    entityBijective: new Set(entityVals).size === universe.length && entityVals.every((v) => !renamedIds.has(v) && !handles.has(v)),
    handleBijective: new Set(handleVals).size === menu.length && handleVals.every((v) => !renamedIds.has(v) && !handles.has(v) && !entityVals.includes(v)),
    leaks: leaks.length, leakPaths: [...new Set(leaks.map(([p]) => p))].slice(0, 5), keyHits: keyHits.length,
    changedPaths: [...changedLeafPaths(view, o2r.view)].sort(),
    s0FeaturesEqual: stableStringify(lock.s0.features) === stableStringify(twin.s0.features), s0ScoresEqual: stableStringify(lock.s0.scores) === stableStringify(twin.s0.scores),
    nexusSignalsEqual: stableStringify(lock.nexus.signals) === stableStringify(twin.nexus.signals), nexusCodesEqual: stableStringify(lock.nexus.codes) === stableStringify(twin.nexus.codes),
    regimeEqual: lock.regime === twin.regime,
    changed: armChanges(lock.selections, twinSel), nexusClass, mechanismPredicted, ...nuis(sc.metrics, twinMetrics),
  };
  const ctl = Object.fromEntries(controls.map((c) => {
    const b = backMap(c.maps.handle), sel = mapSel(c.lock.selections, b), m = score(sel, menu, truth).metrics;
    return [c.kind, { changed: armChanges(lock.selections, sel), ...nuis(sc.metrics, m), s0Equal: stableStringify(lock.s0.scores) === stableStringify(c.lock.s0.scores),
      nexusCodesEqual: stableStringify(lock.nexus.codes) === stableStringify(c.lock.nexus.codes), nexusSame: (lock.nexus.action === null ? null : lock.nexus.action) === (c.lock.nexus.action === null ? null : b(c.lock.nexus.action)) }];
  }));
  const ix = (ids) => ids.map((id) => index.get(id));
  return { ...base, worldHash: w.worldHash, regime: lock.regime, menuSize: menu.length, ms: Math.round(performance.now() - t0),
    sel: { B: ix(lock.selections.B), N: ix(lock.selections.N), R: ix(lock.selections.R) },
    nexus: { abstain: lock.nexus.abstain, reason: lock.nexus.reason, codes: lock.nexus.codes, pick: nO === null ? null : index.get(nO), tieClass: tieClass ? ix(tieClass) : null },
    pub: publicDescriptors(view, lock.s0.scores), u: truth.map((t) => t.utility),
    m: sc.metrics, introB: sc.introductionB, introN: sc.introductionN, identity, ctl };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'run-dev.mjs')) {
  const [set, shardArg, ofArg] = process.argv.slice(2), shard = Number(shardArg), of = Number(ofArg);
  ok(Number.isInteger(shard) && Number.isInteger(of) && shard >= 0 && shard < of, 'USAGE: node run-dev.mjs <set> <shard> <of>');
  const dir = resolve(LANE, 'dev-runs', set); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const out = resolve(dir, `shard-${shard}-of-${of}.jsonl`), fd = openSync(out, 'wx');
  const ctx = { set, seen: new Set(), prior: set === 'DEV288' ? null : priorWorldHashes(), verifyFrozen: false };
  const worlds = worldsOf(set).filter((c) => c.idx % of === shard);
  let n = 0, rejected = 0, verified = 0; const started = Date.now();
  for (const c of worlds) {
    ctx.verifyFrozen = set === 'DEV288' || c.idx % 16 === 0;
    const row = diagnoseWorld(c, ctx); if (row.rejected) rejected++; else if (ctx.verifyFrozen) verified++;
    writeSync(fd, JSON.stringify(row) + '\n'); n++;
  }
  closeSync(fd);
  writeExclusive(out.replace(/\.jsonl$/, '.done.json'), { set, shard, of, scheduled: worlds.length, written: n, rejected, frozenLockVerified: verified, priorHashes: ctx.prior?.size ?? 0, seconds: (Date.now() - started) / 1000 });
  console.log(JSON.stringify({ set, shard, of, written: n, rejected, verified, seconds: (Date.now() - started) / 1000 }));
}
