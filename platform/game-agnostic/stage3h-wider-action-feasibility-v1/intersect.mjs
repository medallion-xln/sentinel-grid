// Phase 4 worker: safety-set intersection over every existing admissible-state equivalence class (the 341 classes of
// the safety-feasibility search, rebuilt with the same deterministic twin families). Offline labels only.
// Usage (from the lane): node intersect.mjs <shard> <of>   -> work/intersect/shard-<i>-of-<n>.jsonl ('wx'; work/ gitignored)
import { openSync, writeSync, closeSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { evaluatorTruth, prng } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { identityViewTwinV2 } from '../stage3h-owner-governed-v1/identity-view-v2.mjs';
import { candidates, DRAWS } from '../stage3h-safety-feasibility-v1/search.mjs';
import { nativeWorld, hiddenSupport, decisions, twinFamily } from '../stage3h-safety-feasibility-v1/twins.mjs';
import { worldLabels } from './contract.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), ok = (v, m) => { if (!v) throw Error(m); };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Identity-free semantic key (type, displacement, target public attributes, non-identifier parameters). */
export function semanticKey(view, i) {
  const e = view.surface[i], s = view.semantics[i], st = view.state, actor = st.actor;
  const t = e.targetEntityId ? st.entities.find((x) => x.entityId === e.targetEntityId) : null, dest = s.observableSpatialEffect?.destination ?? null;
  const params = Object.fromEntries(Object.entries(e.action.parameters ?? {}).filter(([k]) => !['dependent', 'toX', 'toY'].includes(k)));
  return JSON.stringify({ type: e.actionType, displacement: dest ? { dx: dest.x - actor.observedPosition.x, dy: dest.y - actor.observedPosition.y } : null,
    target: t ? { kind: t.entityKind, rel: t.actorRelativePosition, flags: [t.criticalFlag, t.objectiveFlag, t.hostileFlag, t.threatenedFlag, t.inService, t.hubFlag], relationships: t.observedRelationships.map((r) => [r.kind, r.role]).sort() } : null,
    params: Object.keys(params).length ? params : null });
}

export function analyseClass({ set, row, reason }) {
  const combo = comboOf(row), base = nativeWorld(combo);
  ok(!base.rejected && base.worldHash === row.worldHash, 'BASE_REGENERATION_MISMATCH');
  const sup = hiddenSupport(base.config), dec = decisions(base.view, base.band), n = dec.menu.length, members = [base];
  for (const f of twinFamily(sup.coords, prng(base.worldHash), DRAWS)) { const t = nativeWorld(combo, f.spec); if (!t.rejected && t.content === base.content) members.push(t); }
  // every decision is a function of the (identical) public view; truth is released only now, offline
  const L = members.map((m) => worldLabels(evaluatorTruth(m.world, m.horizon, dec.menu).map((x) => x.utility), dec.B, dec.N));
  const all = (f) => [...Array(n).keys()].filter((i) => L.every((l) => f(l, i)));
  const safeAll = all((l, i) => !l.cat[i]), introFreeAll = all((l, i) => l.introFree[i]);
  const act = [...Array(n).keys()].map((i) => ({ maxNreg: Math.max(...L.map((l) => l.nreg[i])), meanNreg: mean(L.map((l) => l.nreg[i])), catWorlds: L.filter((l) => l.cat[i]).length }));
  const setNreg = (l, S) => mean(S.map((i) => l.nreg[i])), nregB = L.map((l) => setNreg(l, dec.B)), nregN = L.map((l) => setNreg(l, dec.N));
  const pick = (cands) => cands.length ? cands.reduce((b, i) => (act[i].maxNreg < act[b].maxNreg || (act[i].maxNreg === act[b].maxNreg && act[i].meanNreg < act[b].meanNreg) ? i : b), cands[0]) : null;
  const oracle = pick(introFreeAll), unconstrained = pick([...Array(n).keys()]);
  const keys = [...Array(n).keys()].map((i) => semanticKey(base.view, i)), twin = identityViewTwinV2(base.view), back = Object.fromEntries(Object.entries(twin.actionMap).map(([a, b]) => [b, a]));
  const twinKey = Object.fromEntries(twin.view.surface.map((e, j) => [back[e.actionId], semanticKey(twin.view, j)]));
  const optimalSets = new Set(L.map((l) => JSON.stringify(l.regret.map((r, i) => (r === 0 ? i : -1)).filter((i) => i >= 0))));
  const types = base.view.surface.map((e) => e.actionType);
  return { set, idx: row.idx, cell: row.cell, reason, worlds: members.length, menuSize: n, B: dec.B, N: dec.N,
    publicFeatures: { regime: row.regime, nexusType: types[dec.N[0]], nexusReason: row.nexus.reason, s0Types: [...new Set(dec.B.map((i) => types[i]))], hostiles: row.pub.hostiles, nearestHostile: row.pub.nearestHostile, actorEnergy: row.pub.actor.energy, ticks: row.pub.actor.ticks },
    safeAll, introFreeAll, introFreeAllEmpty: introFreeAll.length === 0, safeAllEmpty: safeAll.length === 0,
    s0IntroFreeAll: dec.B.every((i) => introFreeAll.includes(i)), nexusIntroFreeAll: dec.N.every((i) => introFreeAll.includes(i)),
    twoArmConflict: L.some((l) => !dec.N.every((i) => l.introFree[i])) && L.some((l) => !dec.B.every((i) => l.introFree[i])),
    oracle: oracle === null ? null : { index: oracle, type: types[oracle], inArms: dec.B.includes(oracle) || dec.N.includes(oracle), maxNreg: act[oracle].maxNreg, meanNreg: act[oracle].meanNreg,
      meanDeltaVsB: mean(L.map((l, w) => l.nreg[oracle] - nregB[w])), meanDeltaVsN: mean(L.map((l, w) => l.nreg[oracle] - nregN[w])), meanBestOfGap: mean(L.map((l, w) => l.nreg[oracle] - Math.min(nregB[w], nregN[w]))) },
    unconstrained: { index: unconstrained, maxNreg: act[unconstrained].maxNreg, meanNreg: act[unconstrained].meanNreg, introFreeAll: introFreeAll.includes(unconstrained) },
    arms: { meanNregB: mean(nregB), meanNregN: mean(nregN) },
    hiddenRisk: { actionsWithVaryingCatastropheStatus: act.filter((a) => a.catWorlds > 0 && a.catWorlds < members.length).length, actionsAlwaysCatastrophic: act.filter((a) => a.catWorlds === members.length).length,
      distinctOptimalSets: optimalSets.size, actionsWithVaryingIntroFreeStatus: [...Array(n).keys()].filter((i) => L.some((l) => l.introFree[i]) && !L.every((l) => l.introFree[i])).length },
    identity: { semanticKeysUnique: new Set(keys).size === n, relabelStable: base.view.surface.every((e, i) => twinKey[e.actionId] === keys[i]) },
    safeAllTypes: safeAll.map((i) => types[i]), safeAllKeys: safeAll.map((i) => JSON.parse(keys[i])) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [shard, of] = process.argv.slice(2).map(Number);
  ok(Number.isInteger(shard) && Number.isInteger(of) && shard >= 0 && shard < of, 'USAGE: node intersect.mjs <shard> <of>');
  const dir = resolve(LANE, 'work/intersect'); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const fd = openSync(resolve(dir, `shard-${shard}-of-${of}.jsonl`), 'wx'), mine = candidates().filter((_, i) => i % of === shard);
  for (const c of mine) writeSync(fd, JSON.stringify(analyseClass(c)) + '\n');
  closeSync(fd); console.log(JSON.stringify({ shard, of, classes: mine.length }));
}
