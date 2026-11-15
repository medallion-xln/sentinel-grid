// Phases 2, 3, 4 and 5 DEV selector study. Usage: node selector-study.mjs [resamples]
// Reads only this lane's dev-runs (DEV288, FRESH_EXPLORE, FRESH_CHECK). Every exploration-dependent choice (partition
// arms, H2 guard conditions) is fitted on FRESH_EXPLORE only and evaluated once on FRESH_CHECK. Inference reuses the
// registered estimator code (stage3h-activation-readiness-v2/analysis.mjs bootstrap, families 40/30/120, 0.02) on DEV
// panels; results are descriptive development evidence, not a registered or confirmatory analysis.
import { resolve } from 'node:path';
import { bootstrap, groupCells, superiority, zeroIntroductionUpper } from '../stage3h-activation-readiness-v2/analysis.mjs';
import { LANE, ok, writeExclusive } from './lib.mjs';
import { loadRows } from './h2-mechanism.mjs';
import { SELECTORS, HANDLE_FREE, nexusPick, scoreIdx, introduction, typeThenS0 } from './candidates.mjs';

const RESAMPLES = Number(process.argv[2] ?? 20000);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const count = (xs) => { const m = {}; for (const x of xs) m[x] = (m[x] ?? 0) + 1; return m; };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const someCat = (r, idx) => idx.some((i) => Math.max(...r.u) - r.u[i] >= 100), someSafe = (r, idx) => idx.some((i) => Math.max(...r.u) - r.u[i] < 100);
const PRIMARIES = [{ key: 'A_H0_SPECIALIST', metric: 'RB', band: 'H0' }, { key: 'B_H2_AVOIDANCE', metric: 'RN', band: 'H2' }, { key: 'C_FULL_VS_B', metric: 'RB' }, { key: 'D_FULL_VS_N', metric: 'RN' }];
const SAFETY = ['HARM_B', 'HARM_N', 'BEST_OF_GAP'].map((key) => ({ key, metric: key }));

/** Candidate rows: R = selector, B = S0, N = frozen Nexus-else-S0; twin = O-2R.1 IDENTITY view (comparators' twins too). */
function candidateRows(rows, name) {
  const sel = SELECTORS[name];
  return rows.map((r) => {
    const R = sel(r, 'orig'), N = nexusPick(r, 'orig') === null ? r.sel.B : [nexusPick(r, 'orig')];
    const Rt = sel(r, 'twin'), Nt = nexusPick(r, 'twin') === null ? r.sel.B : [nexusPick(r, 'twin')];
    ok(r.identity.s0ScoresEqual && r.identity.nexusCodesEqual && r.identity.mechanismPredicted !== false, 'TWIN_RECONSTRUCTION_PRECONDITION');
    const m = { R: scoreIdx(r, R), B: scoreIdx(r, r.sel.B), N: scoreIdx(r, N) }, mt = { R: scoreIdx(r, Rt), B: scoreIdx(r, r.sel.B), N: scoreIdx(r, Nt) };
    const nu = { RB: Math.abs((m.R.nreg - m.B.nreg) - (mt.R.nreg - mt.B.nreg)), RN: Math.abs((m.R.nreg - m.N.nreg) - (mt.R.nreg - mt.N.nreg)) };
    return { id: r.idx, cell: r.cell, band: r.band, regime: r.regime, metrics: m, introB: introduction(r, R, r.sel.B), introN: introduction(r, R, N), nuisance: nu,
      selectorOnlyChange: !same(R, Rt), selectorOnlyAbs: Math.abs(m.R.nreg - mt.R.nreg), comparatorNChange: !same(N, Nt) };
  });
}
function scalar(cells, f, specs) { return bootstrap(cells.map((c) => c.map((r) => ({ ...r, metrics: { R: { nreg: f(r) }, B: { nreg: 0 }, N: { nreg: 0 } } }))), specs.map((s) => ({ ...s, metric: 'RB' })), { resamples: RESAMPLES, family: 120 }); }
function panel(cr) {
  const cells = groupCells(cr), prim = bootstrap(cells, PRIMARIES, { resamples: RESAMPLES, family: 40 }), safety = bootstrap(cells, SAFETY, { resamples: RESAMPLES, family: 30 });
  const nuis = Object.fromEntries(PRIMARIES.map((s) => [s.key, scalar(cells, (r) => r.nuisance[s.metric], [s])[s.key]]));
  const cat = Object.fromEntries(['introB', 'introN'].map((k) => { const n = cr.filter((r) => r[k]).length; return [k, { introductions: n, H2: cr.filter((r) => r[k] && r.band === 'H2').length, zeroUpper: n ? null : zeroIntroductionUpper(cells.map((c) => c.length), 40) }]; }));
  const brief = (e) => ({ mean: +e.mean.toFixed(5), upper: +e.upper.toFixed(5) });
  return { n: cr.length, primaries: Object.fromEntries(Object.entries(prim).map(([k, e]) => [k, { ...brief(e), materialBenefit: superiority(e) }])),
    safety: Object.fromEntries(Object.entries(safety).map(([k, e]) => [k, { ...brief(e), pass: e.upper <= 0.02 }])),
    identityNuisance: Object.fromEntries(Object.entries(nuis).map(([k, e]) => [k, { ...brief(e), pass: e.upper <= 0.02 }])),
    catastrophe: cat, selectorOnlyChangeRate: +mean(cr.map((r) => +r.selectorOnlyChange)).toFixed(5), comparatorNChangeRate: +mean(cr.map((r) => +r.comparatorNChange)).toFixed(5) };
}
const byPop = (rows) => { const m = {}; for (const r of rows) (m[r.population] ??= []).push(r); return m; };

// ---------------- identity aggregates ----------------
function identityAggregate(rows) {
  const n = rows.length, c = (f) => rows.filter(f).length;
  const paths = count(rows.flatMap((r) => r.identity.changedPaths));
  return { rows: n, validity: { o2rReproduced: c((r) => r.identity.o2rReproduced), entityBijective: c((r) => r.identity.entityBijective), handleBijective: c((r) => r.identity.handleBijective),
      leaksZero: c((r) => r.identity.leaks === 0), unrenamedKeysAllSchemaFieldActor: 'see DEV288 probe: keys equal to the actor id are schema field names', s0FeaturesEqual: c((r) => r.identity.s0FeaturesEqual), s0ScoresEqual: c((r) => r.identity.s0ScoresEqual),
      nexusCodesEqual: c((r) => r.identity.nexusCodesEqual), nexusSignalsEqual: c((r) => r.identity.nexusSignalsEqual), regimeEqual: c((r) => r.identity.regimeEqual),
      frozenLockVerified: c((r) => r.identity.frozenAgrees !== null), frozenLockAgrees: c((r) => r.identity.frozenAgrees === true) },
    changedPaths: paths, armsChanged: { B: c((r) => r.identity.changed.B), N: c((r) => r.identity.changed.N), R: c((r) => r.identity.changed.R), R_H0: c((r) => r.identity.changed.R && r.band === 'H0'), R_H2: c((r) => r.identity.changed.R && r.band === 'H2') },
    nexusClass: count(rows.map((r) => r.identity.nexusClass)), mechanismPredicted: c((r) => r.identity.mechanismPredicted === true), mechanismApplicable: c((r) => r.identity.mechanismPredicted !== null),
    tieClassSize: count(rows.filter((r) => !r.nexus.abstain).map((r) => r.nexus.tieClass.length)),
    tieClassUtilityDistinct: c((r) => !r.nexus.abstain && new Set(r.nexus.tieClass.map((i) => r.u[i])).size > 1),
    nuisanceMeans: { RB: mean(rows.map((r) => r.identity.RB)), RN: mean(rows.map((r) => r.identity.RN)), RB_H0: mean(rows.filter((r) => r.band === 'H0').map((r) => r.identity.RB)), RN_H2: mean(rows.filter((r) => r.band === 'H2').map((r) => r.identity.RN)), RN_H0: mean(rows.filter((r) => r.band === 'H0').map((r) => r.identity.RN)), RB_H2: mean(rows.filter((r) => r.band === 'H2').map((r) => r.identity.RB)) },
    controls: Object.fromEntries(Object.keys(rows[0].ctl).map((k) => [k, { Nchanged: c((r) => r.ctl[k].changed.N), Bchanged: c((r) => r.ctl[k].changed.B), RB: mean(rows.map((r) => r.ctl[k].RB)), RN: mean(rows.map((r) => r.ctl[k].RN)), s0Equal: c((r) => r.ctl[k].s0Equal), nexusCodesEqual: c((r) => r.ctl[k].nexusCodesEqual) }])),
    s0TieSets: { H0: c((r) => r.band === 'H0' && r.sel.B.length > 1), H2: c((r) => r.band === 'H2' && r.sel.B.length > 1) }, nexusAbstain: c((r) => r.nexus.abstain) };
}

// ---------------- best-of gap decomposition (frozen rule) ----------------
function bestOfDecomposition(rows) {
  const per = rows.map((r) => { const m = { B: scoreIdx(r, r.sel.B), N: scoreIdx(r, r.sel.N), R: scoreIdx(r, r.sel.R) }; return { r, m, gap: m.R.nreg - Math.min(m.B.nreg, m.N.nreg) }; });
  const h0 = per.filter((x) => x.r.band === 'H0'), h2 = per.filter((x) => x.r.band === 'H2');
  const part = (xs, worse) => ({ worlds: xs.length, disagree: xs.filter((x) => !same(x.r.sel.B, x.r.sel.N)).length, wrongArm: xs.filter((x) => x.gap > 0).length, meanGap: mean(xs.map((x) => x.gap)),
    meanGapGivenWrong: mean(xs.filter((x) => x.gap > 0).map((x) => x.gap)), otherArmBetter: worse, sumIdentity: Math.abs(mean(xs.map((x) => x.gap)) - mean(xs.map((x) => Math.max(0, x.m.R.nreg - x.m[x.r.band === 'H0' ? 'B' : 'N'].nreg)))) < 1e-12 });
  return { all: { worlds: per.length, meanGap: mean(per.map((x) => x.gap)), wrongArmRate: mean(per.map((x) => +(x.gap > 0))) }, H0: part(h0, 'S0 better than Nexus-else-S0'), H2: part(h2, 'Nexus-else-S0 better than S0'),
    note: 'Since R equals N at H0 and B at H2, BEST_OF_GAP per world = HARM_B at H0 + HARM_N at H2 exactly (sumIdentity).' };
}

// ---------------- partition floors (fit on EXPLORE, evaluate on CHECK) ----------------
const KEYS = {
  K0_BAND: (r) => r.band,
  K1_NEXUS_TYPE: (r) => [r.band, r.nexus.abstain ? 'ABSTAIN' : r.pub.actions[r.nexus.pick].t].join('|'),
  K2_REASON_REGIME: (r) => [r.band, r.nexus.abstain ? 'ABSTAIN' : r.pub.actions[r.nexus.pick].t, r.nexus.reason, r.regime].join('|'),
  K3_S0_TYPES: (r) => [r.band, r.nexus.abstain ? 'ABSTAIN' : r.pub.actions[r.nexus.pick].t, r.nexus.reason, r.regime, [...new Set(r.sel.B.map((i) => r.pub.actions[i].t))].sort().join('+')].join('|'),
  K4_FINE: (r) => [r.band, r.nexus.abstain ? 'ABSTAIN' : r.pub.actions[r.nexus.pick].t, r.nexus.reason, r.regime, [...new Set(r.sel.B.map((i) => r.pub.actions[i].t))].sort().join('+'), r.pub.hostiles > 0, r.sel.B.length > 1, r.pub.actor.energy < 10, r.pub.actor.ticks < 6].join('|'),
};
function partitionStudy(explore, check, arms) {
  const gap = (r, idx) => scoreIdx(r, idx).nreg - Math.min(scoreIdx(r, r.sel.B).nreg, scoreIdx(r, r.sel.N).nreg);
  return Object.fromEntries(Object.entries(KEYS).map(([name, key]) => {
    const fit = {}; for (const r of explore) { const k = key(r); fit[k] ??= Object.fromEntries(Object.keys(arms).map((a) => [a, 0])); for (const [a, f] of Object.entries(arms)) fit[k][a] += gap(r, f(r)); }
    const choice = Object.fromEntries(Object.entries(fit).map(([k, s]) => [k, Object.entries(s).sort((x, y) => x[1] - y[1])[0][0]]));
    const pick = (r) => arms[choice[key(r)] ?? 'S0'](r);
    const evalSet = (rows) => { const g = rows.map((r) => gap(r, pick(r))); return { meanBestOfGap: mean(g), introB: rows.filter((r) => introduction(r, pick(r), r.sel.B)).length, introN: rows.filter((r) => introduction(r, pick(r), r.sel.N)).length, meanNregVsFrozen: mean(rows.map((r) => scoreIdx(r, pick(r)).nreg - scoreIdx(r, r.sel.R).nreg)) }; };
    return [name, { cells: Object.keys(fit).length, inSampleExplore: evalSet(explore), heldOutCheck: evalSet(check), unseenCheckCells: check.filter((r) => !(key(r) in choice)).length }];
  }));
}

// ---------------- H2 guard search (Phase 3 feasibility) ----------------
function h2GuardStudy(explore, check) {
  const conds = {};
  const add = (name, f) => { conds[name] = f; };
  add('ALWAYS', () => true);
  for (const reg of ['OBSERVED_THREAT', 'NO_OBSERVED_THREAT']) add('regime=' + reg, (r) => r.regime === reg);
  for (const why of ['THREAT_DRIVEN_PREFERENCE', 'STRUCTURE_DRIVEN_PREFERENCE']) add('nexusReason=' + why, (r) => r.nexus.reason === why);
  for (const t of ['MOVE', 'RETREAT', 'WAIT', 'PROTECT', 'REINFORCE', 'REPAIR', 'COLLECT', 'TRANSFER', 'ATTACK', 'RESTORE', 'BYPASS', 'BUILD', 'SUBSTITUTE']) {
    add('s0Type=' + t, (r) => r.sel.B.some((i) => r.pub.actions[i].t === t)); add('nexusType=' + t, (r) => !r.nexus.abstain && r.pub.actions[r.nexus.pick].t === t);
  }
  add('s0TieSet', (r) => r.sel.B.length > 1);
  for (const k of [2, 4, 6, 10]) { add('ticks<' + k, (r) => r.pub.actor.ticks < k); add('nearestHostile<=' + k, (r) => r.pub.nearestHostile !== null && r.pub.nearestHostile <= k); add('energy<' + k * 2, (r) => r.pub.actor.energy < k * 2); }
  add('actorDamaged', (r) => r.pub.actor.health < 100); add('carrying', (r) => r.pub.actor.carried > 0); add('outOfService>0', (r) => r.pub.outOfService > 0); add('threatened>0', (r) => r.pub.threatened > 0);
  add('s0MarginToNexus<1', (r) => !r.nexus.abstain && Math.max(...r.pub.actions.map((a) => a.s)) - r.pub.actions[r.nexus.pick].s < 1);
  const h2 = (rows) => rows.filter((r) => r.band === 'H2' && !r.nexus.abstain && !same(r.sel.B, r.sel.N));
  const ev = (rows, f, arm) => { const xs = h2(rows).filter(f); return { switched: xs.length,
    avoidedIntroN: xs.filter((r) => introduction(r, r.sel.B, r.sel.N) && !introduction(r, arm(r), r.sel.N)).length, createdIntroN: xs.filter((r) => !introduction(r, r.sel.B, r.sel.N) && introduction(r, arm(r), r.sel.N)).length,
    createdIntroB: xs.filter((r) => introduction(r, arm(r), r.sel.B)).length,
    deltaNregSum: xs.reduce((a, r) => a + scoreIdx(r, arm(r)).nreg - scoreIdx(r, r.sel.B).nreg, 0) }; };
  const arms = { NEXUS: (r) => r.sel.N, TYPE_THEN_S0: (r) => typeThenS0(r) };
  const out = {};
  for (const [an, arm] of Object.entries(arms)) {
    const table = Object.entries(conds).map(([c, f]) => ({ cond: c, explore: ev(explore, f, arm) }));
    const safe = table.filter((t) => t.explore.createdIntroB === 0 && t.explore.avoidedIntroN > 0).sort((a, b) => b.explore.avoidedIntroN - a.explore.avoidedIntroN);
    out[an] = { conditions: table.length, totalIntroN_explore: h2(explore).filter((r) => r.introN).length, totalIntroN_check: h2(check).filter((r) => r.introN).length,
      zeroCreationConditionsOnExplore: safe.map((t) => ({ ...t, check: ev(check, conds[t.cond], arm) })),
      bestRatioOnExplore: table.filter((t) => t.explore.avoidedIntroN > 0).sort((a, b) => (b.explore.avoidedIntroN / (1 + b.explore.createdIntroB)) - (a.explore.avoidedIntroN / (1 + a.explore.createdIntroB))).slice(0, 8).map((t) => ({ ...t, check: ev(check, conds[t.cond], arm) })) };
  }
  // cell-level separability: every public cell (K4) containing an INTRO_N world also containing a REVERSE world?
  const cellsOf = (rows) => { const m = {}; for (const r of h2(rows)) { const k = KEYS.K4_FINE(r); m[k] ??= { introN: 0, reverse: 0, n: 0 }; m[k].n++; if (someCat(r, r.sel.B) && someSafe(r, r.sel.N)) m[k].introN++; if (someCat(r, r.sel.N) && someSafe(r, r.sel.B)) m[k].reverse++; } return m; };
  const sep = (rows) => { const cs = Object.values(cellsOf(rows)).filter((c) => c.introN > 0); return { cellsWithIntroN: cs.length, ofWhichAlsoReverse: cs.filter((c) => c.reverse > 0).length, introNInMixedCells: cs.filter((c) => c.reverse > 0).reduce((a, c) => a + c.introN, 0), reverseInThoseCells: cs.reduce((a, c) => a + c.reverse, 0), worldsInThoseCells: cs.reduce((a, c) => a + c.n, 0) }; };
  out.K4CellSeparability = { explore: sep(explore), check: sep(check) };
  return out;
}

// ---------------- public risk indicators (AUC) ----------------
function auc(pos, neg) { if (!pos.length || !neg.length) return null; let s = 0; for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0; return s / (pos.length * neg.length); }
function riskIndicators(rows) {
  const h2 = rows.filter((r) => r.band === 'H2');
  const ind = { negTicks: (r) => -r.pub.actor.ticks, negEnergy: (r) => -r.pub.actor.energy, hostiles: (r) => r.pub.hostiles, negNearestHostile: (r) => -(r.pub.nearestHostile ?? 99), outOfService: (r) => r.pub.outOfService,
    threatened: (r) => r.pub.threatened, objectivesOpen: (r) => r.pub.objectivesOpen, menuSize: (r) => r.menuSize, s0TieSize: (r) => r.sel.B.length, negS0TopScore: (r) => -Math.max(...r.pub.actions.map((a) => a.s)), s0Spread: (r) => Math.max(...r.pub.actions.map((a) => a.s)) - Math.min(...r.pub.actions.map((a) => a.s)) };
  const lab = { S0_CATASTROPHIC: (r) => someCat(r, r.sel.B), NEXUS_CATASTROPHIC: (r) => someCat(r, r.sel.N), INTRO_N: (r) => someCat(r, r.sel.B) && someSafe(r, r.sel.N) && !same(r.sel.B, r.sel.N) };
  return Object.fromEntries(Object.entries(lab).map(([ln, lf]) => { const pos = h2.filter(lf), neg = h2.filter((r) => !lf(r));
    return [ln, { positives: pos.length, of: h2.length, auc: Object.fromEntries(Object.entries(ind).map(([k, f]) => [k, auc(pos.map(f), neg.map(f))]).map(([k, v]) => [k, v === null ? null : +v.toFixed(3)])) }]; }));
}

const sets = Object.fromEntries(['DEV288', 'FRESH_EXPLORE', 'FRESH_CHECK'].map((s) => [s, loadRows(s)]));
const admitted = Object.fromEntries(Object.entries(sets).map(([s, rows]) => [s, rows.filter((r) => !r.rejected)]));
const t0 = Date.now();
const out = { schema: 'STAGE3H_FAILURE_DIAGNOSIS_SELECTOR_STUDY_V1', authority: 'R0', resamples: RESAMPLES, v4RowsRead: false,
  admission: Object.fromEntries(Object.entries(sets).map(([s, rows]) => [s, { scheduled: rows.length, admitted: admitted[s].length, rejected: count(rows.filter((r) => r.rejected).map((r) => r.rejected)) }])),
  identity: Object.fromEntries(Object.entries(admitted).map(([s, rows]) => [s, identityAggregate(rows)])),
  bestOf: Object.fromEntries(Object.entries(admitted).map(([s, rows]) => [s, bestOfDecomposition(rows)])),
  candidates: {}, partition: {}, h2Guard: null, riskIndicators: {} };
for (const name of Object.keys(SELECTORS)) {
  out.candidates[name] = { handleFree: HANDLE_FREE.has(name), panels: {} };
  for (const s of ['FRESH_EXPLORE', 'FRESH_CHECK']) for (const [pop, rows] of Object.entries(byPop(admitted[s]))) out.candidates[name].panels[s + '/' + pop] = panel(candidateRows(rows, name));
  const ps = Object.values(out.candidates[name].panels), all = (f) => ps.filter(f).length;
  out.candidates[name].summary = { panels: ps.length, allPrimariesMaterial: all((p) => Object.values(p.primaries).every((e) => e.materialBenefit)),
    safetyPass: Object.fromEntries(SAFETY.map((s) => [s.key, all((p) => p.safety[s.key].pass)])), identityPass: Object.fromEntries(PRIMARIES.map((s) => [s.key, all((p) => p.identityNuisance[s.key].pass)])),
    zeroIntroB: all((p) => p.catastrophe.introB.introductions === 0), zeroIntroN: all((p) => p.catastrophe.introN.introductions === 0), introN: ps.reduce((a, p) => a + p.catastrophe.introN.introductions, 0), introB: ps.reduce((a, p) => a + p.catastrophe.introB.introductions, 0) };
  console.error('candidate', name, (Date.now() - t0) / 1000);
}
out.partition = { arms_S0_vs_NEXUS: partitionStudy(admitted.FRESH_EXPLORE, admitted.FRESH_CHECK, { S0: (r) => r.sel.B, NEXUS: (r) => r.sel.N }),
  arms_S0_vs_TYPE_THEN_S0: partitionStudy(admitted.FRESH_EXPLORE, admitted.FRESH_CHECK, { S0: (r) => r.sel.B, TYPE_THEN_S0: (r) => typeThenS0(r) }) };
out.h2Guard = h2GuardStudy(admitted.FRESH_EXPLORE, admitted.FRESH_CHECK);
out.riskIndicators = Object.fromEntries(['FRESH_EXPLORE', 'FRESH_CHECK'].map((s) => [s, riskIndicators(admitted[s])]));
out.seconds = (Date.now() - t0) / 1000;
writeExclusive(resolve(LANE, `evidence/selector-study-r${RESAMPLES}.json`), out);
console.log(JSON.stringify({ seconds: out.seconds, admission: out.admission, candidates: Object.fromEntries(Object.entries(out.candidates).map(([k, v]) => [k, v.summary])) }, null, 1));
