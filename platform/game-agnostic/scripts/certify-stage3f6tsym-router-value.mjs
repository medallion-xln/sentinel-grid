#!/usr/bin/env node
/* STAGE_3F_6_T_SYM — SYMMETRIC ROUTER-VALUE REQUALIFICATION certification.
 *
 * Evaluation only. Refits the frozen Stage 3F.6-T router methodology (unmodified module) on the symmetric lineage and
 * measures whether deployable features identify regimes where a specialist beats RESOURCE, and whether routing creates
 * material downstream value.
 *
 *   --phase=open   DEV fits, CAL selects; writes the open-phase report. No fresh, HOLDOUT or OOD row is scored.
 *   (default)      requires the committed open-phase report (recomputed byte for byte) and the fresh confirmatory
 *                  partitions, then evaluates FRESH_HOLDOUT, FRESH_OOD (primary) and the exposed P.1E HOLDOUT/OOD.
 *   --check        recomputes everything and requires a byte-identical certification.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STAGE3F6TSYM_FEATURE_SET, STAGE3F6TSYM_FEATURE_SET_HASH, STAGE3F6TSYM_OUT, STAGE3F6TSYM_PLAN, STAGE3F6TSYM_PLAN_HASH, STAGE3F6TSYM_PLAN_PATH } from './stage3f6tsym-analysis-plan.mjs';
import { EVALUATION_FILES, FRESH_MANIFEST_PATH, FRESH_PATH, FRESH_SPEC, OPEN_REPORT_PATH, seedAudit } from './generate-stage3f6tsym-confirmatory.mjs';
import { readCorpus } from './generate-stage3f6p1e-policy-evidence.mjs';
import {
  POLICY_SET_HASH, ROUTED_POLICIES, bestPolicySet, evaluateStrategy, falseSelectionHarm, fitPolicyRouter, oracleGainCaptured, pairedBootstrap,
  policyRouterHash, routeEpisode, selectionConfusion,
} from '../src/stage3f/policy-router-v1.js';
import { DEPLOYABLE_FEATURES } from '../src/stage3f/deployable-feature-contract-v1.js';
import { STAGE3F6_METHODOLOGY } from '../src/stage3f/prediction-reliability-v1.js';
import { bootstrapMean, bootstrapPlan } from '../src/stage3f/policy-requalification-v1.js';
import {
  atThreshold, aurocOf, averagePrecision, brier, ece10, f1Threshold, fitBinaryLogistic, identifiability, materiality, predictBinary, routerConclusion, specialistValue,
} from '../src/stage3f/router-value-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');
const at = (r) => path.join(root, r);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (r) => JSON.parse(readFileSync(at(r), 'utf8'));
const phaseOpen = process.argv.includes('--phase=open');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const skipPredecessors = process.argv.includes('--skip-predecessors');
const RESULT = `${STAGE3F6TSYM_OUT}/stage3f6tsym-certification-result.json`;
const plan = STAGE3F6TSYM_PLAN;
const FEATURES = STAGE3F6TSYM_FEATURE_SET.featureIds;
const RES = 'RESOURCE_PRESERVING_V1'; const NEX = 'NEXUS_SELECTOR'; const OBJ = 'OBJECTIVE_TARGETING_V1'; const THR = 'THREAT_COVERING_V1';
const SPECIALISTS = [NEX, OBJ, THR];
const CATASTROPHIC = STAGE3F6_METHODOLOGY.catastrophicRegret;
const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const roundDeep = (v) => (Array.isArray(v) ? v.map(roundDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)])) : round(v));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const rate = (l, fn) => (l.length ? l.filter(fn).length / l.length : null);

/* ================================================================== rows */
/** Router row in the historical shape; the NEXUS slot holds V1 (headline) or V2 (diagnostic candidate). */
function routerRow(r, nexusSource = 'NEXUS_SELECTOR_V1') {
  const src = { [RES]: RES, [NEX]: nexusSource, [OBJ]: OBJ, [THR]: THR, RANDOM_LEGAL_V1: 'RANDOM_LEGAL_V1', GREEDY: 'GREEDY' };
  const chosen = {}; const regret = {}; const correct = {};
  for (const [slot, p] of Object.entries(src)) {
    const k = r.policies[p]; chosen[slot] = k;
    if (k !== null) { regret[slot] = r.actions[k].r; correct[slot] = r.actions[k].o; }
  }
  const maxRegret = Math.max(...Object.values(r.actions).map((a) => a.r));
  return { partition: r.partition, recordHash: r.recordHash, core: r.core, label: r.label, actions: r.actions, chosen, regret, correct, maxRegret,
    zeroCostOptimal: Object.values(r.actions).some((a) => a.o === 1 && a.c === 0), equivariance: r.equivariance, v2: r.policies.NEXUS_SELECTOR_V2_CANDIDATE };
}
const nr = (row, p) => (row.chosen[p] === null || row.chosen[p] === undefined ? null : row.maxRegret > 0 ? row.regret[p] / row.maxRegret : 0);

const corpus = readCorpus();
const byPart = (p) => corpus.filter((r) => r.partition === p);
const DEV = byPart('DEV').map((r) => routerRow(r)); const CAL = byPart('CAL').map((r) => routerRow(r));
const DEV2 = byPart('DEV').map((r) => routerRow(r, 'NEXUS_SELECTOR_V2_CANDIDATE')); const CAL2 = byPart('CAL').map((r) => routerRow(r, 'NEXUS_SELECTOR_V2_CANDIDATE'));

/* ================================================================ regimes */
const TARGETS = {
  COSTLY_ACTION_OPTIMAL: { label: (r) => (r.zeroCostOptimal ? 0 : 1), subset: () => true },
  FREE_ACTION_OPTIMAL: { label: (r) => (r.zeroCostOptimal ? 1 : 0), subset: () => true },
  HORIZON_DEPENDENT: { label: (r) => (r.label.horizonClass === 'HORIZON_DEPENDENT' ? 1 : 0), subset: () => true },
  NEXUS_V1_BEATS_RESOURCE: { label: (r) => (r.regret[NEX] < r.regret[RES] ? 1 : 0), subset: (r) => r.chosen[NEX] !== null },
  OBJECTIVE_APPLICABLE: { label: (r) => (r.regret[OBJ] < r.regret[RES] ? 1 : 0), subset: (r) => r.chosen[OBJ] !== null },
  THREAT_APPLICABLE: { label: (r) => (r.regret[THR] < r.regret[RES] ? 1 : 0), subset: (r) => r.chosen[THR] !== null },
};
const vec = (r) => FEATURES.map((k) => r.core[k]);
function fitRegimes() {
  return Object.fromEntries(Object.entries(TARGETS).map(([name, t]) => {
    const dev = DEV.filter(t.subset); const y = dev.map(t.label);
    if (y.filter((v) => v === 1).length < 50 || y.filter((v) => v === 0).length < 50) return [name, { status: 'INSUFFICIENT_EVIDENCE', devN: dev.length, devPositives: y.filter((v) => v === 1).length }];
    const model = fitBinaryLogistic(dev.map(vec), y);
    const cal = CAL.filter(t.subset); const pc = cal.map((r) => predictBinary(model, vec(r))); const yc = cal.map(t.label);
    const univariate = FEATURES.map((k) => { const a = aurocOf(dev.map((r) => r.core[k]), y); return { feature: k, separability: a === null ? null : Math.max(a, 1 - a) }; })
      .sort((a, b) => (b.separability ?? 0) - (a.separability ?? 0));
    return [name, { status: 'FITTED', model, devN: dev.length, devBaseRate: model.positiveRate, calThreshold: f1Threshold(pc, yc).threshold,
      calAuroc: aurocOf(pc, yc), bestUnivariate: univariate[0], modelHash: hex(JSON.stringify(model)) }];
  }));
}
function regimeMetrics(fits, rows) {
  return Object.fromEntries(Object.entries(TARGETS).map(([name, t]) => {
    const fit = fits[name]; if (fit.status !== 'FITTED') return [name, { status: fit.status }];
    const sub = rows.filter(t.subset); const y = sub.map(t.label); const p = sub.map((r) => predictBinary(fit.model, vec(r)));
    const positives = y.filter((v) => v === 1).length;
    if (positives < 50 || sub.length - positives < 50) return [name, { status: 'INSUFFICIENT_EVIDENCE', n: sub.length, positives }];
    const base = fit.devBaseRate;
    const b = brier(p, y); const bRef = brier(y.map(() => base), y);
    const auroc = aurocOf(p, y);
    return [name, { status: 'EVALUATED', n: sub.length, positives, baseRate: positives / sub.length, AUROC: auroc, AUPRC: averagePrecision(p, y),
      BRIER: b, BRIER_SKILL: bRef > 0 ? 1 - b / bRef : null, ECE: ece10(p, y), atCalThreshold: atThreshold(p, y, fit.calThreshold), identifiability: identifiability(auroc) }];
  }));
}

/** Amendment 001: descriptive policy performance on oracle-stratified regimes (the label stratifies; it is never an input). */
const REGIME_STRATA = { COSTLY_OPTIMAL: (r) => !r.zeroCostOptimal, FREE_OPTIMAL: (r) => r.zeroCostOptimal };
function byRegime(rows, choosers) {
  return Object.fromEntries(Object.entries(REGIME_STRATA).map(([stratum, inStratum]) => {
    const sub = rows.filter(inStratum);
    return [stratum, { n: sub.length, share: rows.length ? sub.length / rows.length : null, strategies: Object.fromEntries(Object.entries(choosers).map(([k, fn]) => {
      const e = evaluateStrategy(sub, fn);
      const acting = sub.filter((row) => { const p = fn(row); return p !== null && row.chosen[p] !== null; });
      return [k, { coverage: e.coverage, accuracy: e.accuracy, meanRegret: e.meanRegret, meanNormalizedRegret: mean(acting.map((row) => nr(row, fn(row)))) }];
    })) }];
  }));
}
const inBest = (row, p) => bestPolicySet(row).best.includes(p);
const policyChoosers = Object.fromEntries(ROUTED_POLICIES.map((p) => [p, () => p]));

/* ================================================================ open phase */
const bestSingleOf = () => {
  const devCal = [...DEV, ...CAL];
  const candidates = ROUTED_POLICIES.map((p) => ({ policy: p, ...evaluateStrategy(devCal, () => p) })).filter((e) => e.coverage === 1)
    .sort((a, b) => a.meanRegret - b.meanRegret || ROUTED_POLICIES.indexOf(a.policy) - ROUTED_POLICIES.indexOf(b.policy));
  return { policy: candidates[0]?.policy ?? null, candidates: candidates.map((c) => ({ policy: c.policy, meanRegret: c.meanRegret, accuracy: c.accuracy })) };
};
function calibrate(model, cal, fallbackPolicy) {
  const grid = plan.router.methodology.confidenceGrid.map((threshold) => {
    const e = evaluateStrategy(cal, (row) => routeEpisode(model, row, { threshold, fallbackPolicy }).selectedPolicy);
    return { threshold, accuracy: e.accuracy, meanRegret: e.meanRegret, routedShare: rate(cal, (row) => routeEpisode(model, row, { threshold, fallbackPolicy }).routed) };
  });
  const chosen = [...grid].sort((a, b) => (a.meanRegret - b.meanRegret) || (b.accuracy - a.accuracy) || (a.threshold - b.threshold))[0].threshold;
  return { grid, threshold: chosen };
}
function featureAudit(fits) {
  const invariance = corpus.filter((r) => r.equivariance !== null).every((r) => Object.values(r.equivariance).every((x) => x.coreFeatureInvariant === 1));
  return Object.fromEntries(FEATURES.map((id) => {
    const f = DEPLOYABLE_FEATURES.find((x) => x.featureId === id);
    const leakedEmpirically = Object.values(fits).some((fit) => fit.status === 'FITTED' && fit.bestUnivariate.feature === id && fit.bestUnivariate.separability >= 0.99);
    const available = corpus.every((r) => typeof r.core[id] === 'number' && Number.isFinite(r.core[id]));
    const flags = {
      NON_DEPLOYABLE: f.decisionTimeAvailable !== true || f.requiredCapabilities.some((c) => /SIMULATOR|V2B/.test(c)),
      LEAKED: f.labelDerived === true || leakedEmpirically, REQUIRES_ROLLOUT: f.multiStepRollout === true, REQUIRES_FUTURE_STATE: f.futureLeaking === true,
      REQUIRES_ORACLE: /counterfactual|oracle|regret/i.test(`${f.evidencePath} ${f.provenanceRule}`), DIVERGENT: !invariance, UNAVAILABLE: !available,
    };
    const failing = Object.entries(flags).filter(([, v]) => v).map(([k]) => k);
    return [id, { class: failing.length ? failing[0] : 'DEPLOYABLE', flags, requiredCapabilities: f.requiredCapabilities }];
  }));
}
function openPhase() {
  const best = bestSingleOf();
  const model = fitPolicyRouter(DEV, FEATURES); const routerHash = policyRouterHash(model);
  const replayHash = policyRouterHash(fitPolicyRouter(DEV, FEATURES));
  const cal = calibrate(model, CAL, best.policy);
  const model2 = fitPolicyRouter(DEV2, FEATURES); const cal2 = calibrate(model2, CAL2, best.policy);
  const fits = fitRegimes();
  const calAcc = (p) => evaluateStrategy(CAL, () => p);
  const bestCal = calAcc(best.policy).accuracy;
  const headlineCascade = SPECIALISTS.map((p) => ({ p, e: calAcc(p) })).filter((x) => x.e.accuracy !== null && x.e.accuracy > bestCal)
    .sort((a, b) => b.e.accuracy - a.e.accuracy || (a.p < b.p ? -1 : 1)).map((x) => x.p);
  const p1eOpen = readJson('artifacts/stage3f6p1e-policy-requalification/stage3f6p1e-open-phase-report.json');
  const audit = featureAudit(fits);
  const report = roundDeep({
    schemaVersion: 1, stage: plan.stage, phase: 'OPEN', planHash: STAGE3F6TSYM_PLAN_HASH, featureSetHash: STAGE3F6TSYM_FEATURE_SET_HASH, partitions: ['DEV', 'CAL'],
    featureAudit: audit, headlineFeatures: FEATURES.filter((k) => audit[k].class === 'DEPLOYABLE'),
    router: { routerHash, replayHash, deterministic: routerHash === replayHash, weights: { featureKeys: model.featureKeys, mu: model.mu, sd: model.sd, W: model.W },
      bestSingle: best, calibration: cal },
    candidateRouterV2: { routerHash: policyRouterHash(model2), calibration: cal2, weights: { mu: model2.mu, sd: model2.sd, W: model2.W } },
    cascades: { P1E: p1eOpen.calSelections.cascadeOrder, HEADLINE: [...headlineCascade, best.policy], calAccuracy: Object.fromEntries(ROUTED_POLICIES.map((p) => [p, calAcc(p).accuracy])) },
    regimes: Object.fromEntries(Object.entries(fits).map(([k, v]) => [k, v.status === 'FITTED' ? { ...v, model: { mu: v.model.mu, sd: v.model.sd, w: v.model.w } } : v])),
    descriptive: { DEV: pickStrategies(DEV, model, cal.threshold, best.policy), CAL: pickStrategies(CAL, model, cal.threshold, best.policy) },
    amendment001: {
      regimeMetrics: { DEV: regimeMetrics(fits, DEV), CAL: regimeMetrics(fits, CAL) },
      policyByRegime: Object.fromEntries([['DEV', DEV], ['CAL', CAL]].map(([k, rows]) => [k, byRegime(rows, { ...policyChoosers,
        ROUTER_SYMMETRIC: (row) => routeEpisode(model, row, { threshold: cal.threshold, fallbackPolicy: best.policy }).selectedPolicy })])),
    },
    noSealedRowScored: true,
  });
  return { report, model, model2, fits };
}
function pickStrategies(rows, model, threshold, fallbackPolicy) {
  const e = (fn) => { const x = evaluateStrategy(rows, fn); return { accuracy: x.accuracy, meanRegret: x.meanRegret }; };
  const route = (row) => routeEpisode(model, row, { threshold, fallbackPolicy });
  const routerEval = evaluateStrategy(rows, (row) => route(row).selectedPolicy);
  return { ALWAYS_RESOURCE: e(() => RES), ROUTER: e((row) => route(row).selectedPolicy),
    ORACLE: e((row) => bestPolicySet(row).best[0] ?? null),
    ROUTER_SELECTION: { selectionDistribution: routerEval.selectionDistribution, routedShare: rate(rows, (row) => route(row).routed), abstainedShare: rate(rows, (row) => !route(row).routed) } };
}

const open = openPhase();
if (phaseOpen) {
  open.report.reportHash = hex(JSON.stringify(open.report));
  await writeFile(at(OPEN_REPORT_PATH), `${JSON.stringify(open.report, null, 2)}\n`);
  console.log(JSON.stringify({ phase: 'OPEN', reportHash: open.report.reportHash, router: { routerHash: open.report.router.routerHash, deterministic: open.report.router.deterministic,
    bestSingle: open.report.router.bestSingle.policy, threshold: open.report.router.calibration.threshold }, candidateThreshold: open.report.candidateRouterV2.calibration.threshold,
  cascades: open.report.cascades, featureClasses: [...new Set(Object.values(open.report.featureAudit).map((f) => f.class))],
  regimes: Object.fromEntries(Object.entries(open.report.regimes).map(([k, v]) => [k, { status: v.status, calAuroc: v.calAuroc, calThreshold: v.calThreshold, best: v.bestUnivariate }])),
  descriptive: open.report.descriptive }, null, 2));
  process.exit(0);
}

/* ============================================================ confirmatory */
const openStored = readJson(OPEN_REPORT_PATH);
const openRecomputed = { ...open.report }; openRecomputed.reportHash = hex(JSON.stringify(open.report));
const OPEN_PHASE_REPRODUCED = JSON.stringify(openStored) === JSON.stringify(openRecomputed);
const freshManifest = readJson(FRESH_MANIFEST_PATH);
const freshText = gunzipSync(readFileSync(at(FRESH_PATH))).toString('utf8');
const fresh = freshText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const BEST = openStored.router.bestSingle.policy; const THRESHOLD = openStored.router.calibration.threshold;
const THRESHOLD_V2 = openStored.candidateRouterV2.calibration.threshold;
const model = open.model; const model2 = open.model2; const fits = open.fits;
const historicalFreeze = readJson('artifacts/stage3f6t-policy-router/stage3f6t-evaluation-freeze.json');
const historicalModel = { family: historicalFreeze.methodology.routerFamily, policies: ROUTED_POLICIES, ...historicalFreeze.weights };
const historicalThreshold = historicalFreeze.threshold;

const EVAL = {
  FRESH_HOLDOUT: fresh.filter((r) => r.partition === 'FRESH_HOLDOUT'), FRESH_OOD: fresh.filter((r) => r.partition === 'FRESH_OOD'),
  EXPOSED_HOLDOUT: byPart('HOLDOUT'), EXPOSED_OOD: byPart('OOD'),
};
const ROWS = Object.fromEntries(Object.entries(EVAL).map(([k, v]) => [k, v.map((r) => routerRow(r))]));
const ROWS2 = Object.fromEntries(Object.entries(EVAL).map(([k, v]) => [k, v.map((r) => routerRow(r, 'NEXUS_SELECTOR_V2_CANDIDATE'))]));

const costly = fits.COSTLY_ACTION_OPTIMAL;
const gatedChoice = (row) => {
  if (predictBinary(costly.model, vec(row)) < costly.calThreshold) return RES;
  return [NEX, THR, OBJ].find((p) => row.chosen[p] !== null) ?? RES;
};
const oracleGateChoice = (row) => (row.zeroCostOptimal ? RES : ([NEX, THR, OBJ].find((p) => row.chosen[p] !== null) ?? RES));
const cascadeHeadline = (row) => openStored.cascades.HEADLINE.find((p) => row.chosen[p] !== null) ?? RES;
const routerChoose = (row) => routeEpisode(model, row, { threshold: THRESHOLD, fallbackPolicy: BEST }).selectedPolicy;
const STRATEGIES = {
  ALWAYS_RESOURCE: () => RES,
  BEST_SINGLE_POLICY: () => BEST,
  FIXED_PRIORITY_CASCADE_HEADLINE: cascadeHeadline,
  HISTORICAL_3F6T_ROUTER_FROZEN: (row) => routeEpisode(historicalModel, row, { threshold: historicalThreshold, fallbackPolicy: RES }).selectedPolicy,
  ROUTER_SYMMETRIC: routerChoose,
  ROUTER_SYMMETRIC_FULL_COVERAGE: (row) => routeEpisode(model, row, { threshold: 0, fallbackPolicy: BEST }).selectedPolicy,
  REGIME_GATED_SWITCH: gatedChoice,
  COSTLY_ORACLE_SWITCH: oracleGateChoice,
  PERFECT_POLICY_SELECTOR: (row) => bestPolicySet(row).best[0] ?? null,
};
/** P.1E cascade and the V2 candidate router need the V2 slot, so they run on the V2 rows (identical episodes). */
const V2_STRATEGIES = {
  FIXED_PRIORITY_CASCADE_P1E: (row) => {
    for (const p of openStored.cascades.P1E) { const slot = p === 'NEXUS_SELECTOR_V2_CANDIDATE' ? NEX : p; if (row.chosen[slot] !== null) return slot; }
    return RES;
  },
  CANDIDATE_ROUTER_V2: (row) => routeEpisode(model2, row, { threshold: THRESHOLD_V2, fallbackPolicy: BEST }).selectedPolicy,
};

function summarize(rows, choose) {
  const e = evaluateStrategy(rows, choose);
  const acting = rows.filter((row) => { const p = choose(row); return p !== null && row.chosen[p] !== null; });
  const regrets = acting.map((row) => row.regret[choose(row)]);
  return { n: rows.length, coverage: e.coverage, accuracy: e.accuracy, meanRegret: e.meanRegret, p95Regret: e.p95Regret,
    meanNormalizedRegret: mean(acting.map((row) => nr(row, choose(row)))), catastrophicRate: regrets.length ? regrets.filter((x) => x >= CATASTROPHIC).length / regrets.length : null,
    selectionAccuracy: e.selectionAccuracy, selectionDistribution: e.selectionDistribution };
}
const randomValid = (rows) => {
  const per = rows.map((row) => { const av = ROUTED_POLICIES.filter((p) => row.chosen[p] !== null); return { acc: mean(av.map((p) => row.correct[p])), reg: mean(av.map((p) => row.regret[p])), nr: mean(av.map((p) => nr(row, p))) }; });
  return { n: rows.length, accuracy: mean(per.map((x) => x.acc)), meanRegret: mean(per.map((x) => x.reg)), meanNormalizedRegret: mean(per.map((x) => x.nr)), note: 'exact expectation of a uniform choice among proposing headline policies' };
};
/** Paired comparison: historical bootstrap for accuracy and raw regret, plus a paired normalized-regret bootstrap. */
function compare(rows, chooseA, chooseB, label) {
  const hb = pairedBootstrap(rows, chooseA, chooseB);
  const d = rows.map((row) => { const a = chooseA(row); const b = chooseB(row); return a === null || b === null || row.chosen[a] === null || row.chosen[b] === null ? null : nr(row, a) - nr(row, b); });
  const w = d.map((x) => (x === null ? 0 : 1));
  const ci = bootstrapMean(bootstrapPlan(rows.length, `STAGE3F6TSYM:${label}`), d.map((x) => x ?? 0), w);
  const diff = { n: hb.n, accuracyDifference: hb.accuracyDifference, accuracyCi95: hb.accuracyCi95, regretDifference: hb.regretDifference, regretCi95: hb.regretCi95,
    normalizedRegretDifference: mean(d.filter((x) => x !== null)), normalizedRegretCi95: ci, episodesImproved: hb.episodesImproved, episodesWorsened: hb.episodesWorsened };
  return { ...diff, ...materiality(diff) };
}
function collapse(rows, choose) {
  const e = evaluateStrategy(rows, choose);
  const [top, share] = Object.entries(e.selectionDistribution).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const optimalShare = top ? rate(rows, (row) => bestPolicySet(row).best.includes(top)) : 0;
  return { topPolicy: top, topShare: share, optimalShareOfTopPolicy: optimalShare,
    POLICY_COLLAPSE: share > plan.router.methodology.policyCollapseShare && share > optimalShare + plan.router.methodology.policyCollapseOptimalityMargin,
    policiesSelectedOnAtLeast5Percent: Object.values(e.selectionDistribution).filter((v) => v >= 0.05).length };
}

const partitions = {};
for (const [name, rows] of Object.entries(ROWS)) {
  const rows2 = ROWS2[name];
  const strategies = Object.fromEntries(Object.entries(STRATEGIES).map(([k, fn]) => [k, summarize(rows, fn)]));
  for (const [k, fn] of Object.entries(V2_STRATEGIES)) strategies[k] = summarize(rows2, fn);
  strategies.RANDOM_VALID_POLICY = randomValid(rows);
  const oracleVsBest = compare(rows, STRATEGIES.PERFECT_POLICY_SELECTOR, () => BEST, `${name}:oracle-best`);
  const harm = falseSelectionHarm(rows, routerChoose);
  const bestRegrets = rows.map((row) => row.regret[BEST]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  const rvb = compare(rows, routerChoose, () => BEST, `${name}:router-best`);
  const rows2Idx = new Map(rows2.map((r) => [r.recordHash, r]));
  /* router vs the P.1E cascade: the cascade's choice is resolved on the V2 row of the same episode */
  const p1eCascadeOnHeadline = (row) => { const r2 = rows2Idx.get(row.recordHash); const slot = V2_STRATEGIES.FIXED_PRIORITY_CASCADE_P1E(r2); return slot === NEX ? 'V2' : slot; };
  const vsP1E = (() => {
    const pairs = rows.map((row) => { const a = routerChoose(row); const b = p1eCascadeOnHeadline(row); const r2 = rows2Idx.get(row.recordHash);
      const bAcc = b === 'V2' ? r2.correct[NEX] : row.correct[b]; const bReg = b === 'V2' ? r2.regret[NEX] : row.regret[b]; const bNr = b === 'V2' ? nr(r2, NEX) : nr(row, b);
      return { acc: row.correct[a] - bAcc, reg: row.regret[a] - bReg, nr: nr(row, a) - bNr }; });
    const plan95 = bootstrapPlan(rows.length, `STAGE3F6TSYM:${name}:router-p1e`);
    const diff = { n: pairs.length, accuracyDifference: mean(pairs.map((p) => p.acc)), accuracyCi95: bootstrapMean(plan95, pairs.map((p) => p.acc)),
      regretDifference: mean(pairs.map((p) => p.reg)), regretCi95: bootstrapMean(plan95, pairs.map((p) => p.reg)),
      normalizedRegretDifference: mean(pairs.map((p) => p.nr)), normalizedRegretCi95: bootstrapMean(plan95, pairs.map((p) => p.nr)) };
    return { ...diff, ...materiality(diff), bootstrap: 'paired mulberry32 (accuracy, regret, normalized regret)' };
  })();
  partitions[name] = {
    n: rows.length, strategies,
    headroom: { HEADROOM_AVAILABLE_ACCURACY: oracleVsBest.accuracyDifference, accuracy95: oracleVsBest.accuracyCi95,
      HEADROOM_AVAILABLE_REGRET: -oracleVsBest.regretDifference, HEADROOM_AVAILABLE_NORMALIZED_REGRET: -oracleVsBest.normalizedRegretDifference },
    captured: oracleGainCaptured({ router: strategies.ROUTER_SYMMETRIC, bestSingle: strategies.BEST_SINGLE_POLICY, oracle: strategies.PERFECT_POLICY_SELECTOR }),
    capturedByGate: oracleGainCaptured({ router: strategies.REGIME_GATED_SWITCH, bestSingle: strategies.BEST_SINGLE_POLICY, oracle: strategies.PERFECT_POLICY_SELECTOR }),
    routerVsBestSingle: rvb,
    routerVsResource: compare(rows, routerChoose, () => RES, `${name}:router-resource`),
    routerVsCascadeHeadline: compare(rows, routerChoose, cascadeHeadline, `${name}:router-cascade-headline`),
    routerVsCascadeP1E: vsP1E,
    gateVsBestSingle: compare(rows, gatedChoice, () => BEST, `${name}:gate-best`),
    cascadeHeadlineVsBestSingle: compare(rows, cascadeHeadline, () => BEST, `${name}:cascade-best`),
    abstention: { routedShare: rate(rows, (row) => routeEpisode(model, row, { threshold: THRESHOLD, fallbackPolicy: BEST }).routed),
      abstainedShare: rate(rows, (row) => !routeEpisode(model, row, { threshold: THRESHOLD, fallbackPolicy: BEST }).routed), threshold: THRESHOLD },
    collapse: collapse(rows, routerChoose),
    historicalHarm: { ...harm, bestSingleP95Regret: bestRegrets.length ? bestRegrets[Math.max(0, Math.ceil(0.95 * bestRegrets.length) - 1)] : null,
      acceptable: rvb.episodesWorsened <= rvb.episodesImproved && (harm.p95 ?? 0) <= (bestRegrets.length ? bestRegrets[Math.max(0, Math.ceil(0.95 * bestRegrets.length) - 1)] : 0) },
    specialistValue: specialistValue(rows, routerChoose, { reference: RES, specialists: SPECIALISTS, normalized: nr, inBest }),
    specialistValueByRegime: Object.fromEntries(Object.entries(REGIME_STRATA).map(([k, f]) => [k, specialistValue(rows.filter(f), routerChoose, { reference: RES, specialists: SPECIALISTS, normalized: nr, inBest })])),
    policyByRegime: byRegime(rows, { ...policyChoosers, ROUTER_SYMMETRIC: routerChoose, PERFECT_POLICY_SELECTOR: STRATEGIES.PERFECT_POLICY_SELECTOR }),
    specialistValueGate: specialistValue(rows, gatedChoice, { reference: RES, specialists: SPECIALISTS, normalized: nr }),
    confusionRecall: selectionConfusion(rows, routerChoose).recall,
    regimePrediction: regimeMetrics(fits, rows),
  };
}
const FH = partitions.FRESH_HOLDOUT; const FO = partitions.FRESH_OOD;

/* ================================================================ conclusions */
const oodNotWorse = !FO.routerVsBestSingle.ACCURACY_WORSE && !FO.routerVsBestSingle.NORMALIZED_REGRET_WORSE;
const conclusion = routerConclusion({
  holdoutN: FH.n, vsBestSingle: FH.routerVsBestSingle, vsCascadeHeadline: FH.routerVsCascadeHeadline, oodNotWorse, collapse: FH.collapse.POLICY_COLLAPSE,
  harmAcceptable: FH.historicalHarm.acceptable, costlyIdentifiability: FH.regimePrediction.COSTLY_ACTION_OPTIMAL.identifiability,
  nexusIdentifiability: FH.regimePrediction.NEXUS_V1_BEATS_RESOURCE.identifiability, headroomLower: FH.headroom.accuracy95[0], headroomCapturedAccuracy: FH.captured.accuracy,
});
const ROUTER_VALUE_MATERIAL = FH.routerVsBestSingle.MATERIAL && oodNotWorse;
const ROUTER_2_0_JUSTIFIED = conclusion.primary === 'ROUTER_VALUE_CONFIRMED';

/* ================================================================ integrity */
const headBytesHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const git = (...a) => spawnSync('git', ['-C', repositoryRoot, ...a], { encoding: 'utf8' });
/**
 * The freeze is the LAST commit that wrote the plan file (the original freeze, then amendment 001). Every commit that
 * wrote it must carry the open-phase report and no fresh payload/manifest or certificate, and the fresh manifest must
 * have been generated at a commit descending from the effective freeze with the evaluation files byte-identical
 * between that commit and the working tree being certified.
 */
const freeze = (() => {
  const g = (r) => `platform/game-agnostic/${r}`;
  const planRepo = g(STAGE3F6TSYM_PLAN_PATH);
  const commits = git('log', '--format=%H', '--', planRepo).stdout.trim().split('\n').filter(Boolean);
  const commit = commits[0] ?? null;
  const filesOf = (c) => git('show', '--name-only', '--format=', c).stdout.trim().split('\n').filter(Boolean);
  const history = [...commits].reverse().map((c) => { const files = filesOf(c); return { commit: c, files,
    planAndOpenReport: files.includes(planRepo) && files.includes(g(OPEN_REPORT_PATH)), noFreshOrResult: !files.some((f) => /fresh-confirmatory|stage3f6tsym-certification-result/.test(f)) }; });
  const changed = commit ? git('diff', '--name-only', commit, 'HEAD', '--', planRepo, g(OPEN_REPORT_PATH), g('scripts/stage3f6tsym-analysis-plan.mjs')).stdout.trim() : 'NO_FREEZE_COMMIT';
  const generatedAt = freshManifest.generatedAtHead ?? null;
  const descends = generatedAt !== null && commit !== null && git('merge-base', '--is-ancestor', commit, generatedAt).status === 0;
  const evalChanged = generatedAt === null ? 'NO_GENERATION_COMMIT' : git('diff', '--name-only', generatedAt, '--', ...EVALUATION_FILES.map(g)).stdout.trim();
  const out = { originalFreezeCommit: history[0]?.commit ?? null, freezeCommit: commit, history,
    planAndOpenReportInFreezeCommits: history.length > 0 && history.every((h) => h.planAndOpenReport),
    noFreshOrResultInFreezeCommits: history.every((h) => h.noFreshOrResult),
    planUnchangedSinceFreeze: changed === '', planAndOpenReportAtHead: [STAGE3F6TSYM_PLAN_PATH, OPEN_REPORT_PATH].every((f) => headBytesHash(f) === hex(readFileSync(at(f)))),
    freshGeneratedAtHead: generatedAt, freshGeneratedAfterFreeze: descends, evaluationFilesUnchangedSinceGeneration: evalChanged === '' };
  out.FROZEN_BEFORE_FRESH_AND_SEALED = commit !== null && out.planAndOpenReportInFreezeCommits && out.noFreshOrResultInFreezeCommits && out.planUnchangedSinceFreeze
    && out.planAndOpenReportAtHead && out.freshGeneratedAfterFreeze && out.evaluationFilesUnchangedSinceGeneration;
  return out;
})();
const lineageSets = { record: new Set(corpus.map((r) => r.recordHash)), world: new Set(corpus.map((r) => r.worldHash)), topology: new Set(corpus.map((r) => r.topologyHash)) };
const freshEq = fresh.filter((r) => r.equivariance !== null).flatMap((r) => Object.values(r.equivariance));
const freshIntegrity = {
  contentHash: hex(freshText), contentBound: hex(freshText) === freshManifest.contentHash, planBound: freshManifest.planHash === STAGE3F6TSYM_PLAN_HASH,
  counts: Object.fromEntries(Object.keys(FRESH_SPEC).map((p) => [p, EVAL[p].length])), stats: freshManifest.stats,
  seedAudit: seedAudit(corpus), seedsUsed: Object.fromEntries(Object.keys(FRESH_SPEC).map((p) => [p, [...new Set(EVAL[p].map((r) => r.combination.seed))]])),
  overlapWithLineage: { record: fresh.filter((r) => lineageSets.record.has(r.recordHash)).length, world: fresh.filter((r) => lineageSets.world.has(r.worldHash)).length,
    topology: fresh.filter((r) => lineageSets.topology.has(r.topologyHash)).length },
  internalDuplicates: { record: fresh.length - new Set(fresh.map((r) => r.recordHash)).size, world: fresh.length - new Set(fresh.map((r) => r.worldHash)).size,
    topology: fresh.length - new Set(fresh.map((r) => r.topologyHash)).size },
  levels: Object.fromEntries(Object.keys(FRESH_SPEC).map((p) => [p, [...new Set(EVAL[p].map((r) => r.combination.level))].sort()])),
  equivarianceChecks: freshEq.length,
  SYMMETRY_CHECKS: Object.fromEntries(['legal', 'optimal', 'regret', 'label', 'coreFeatureInvariant'].map((k) => [k, rate(freshEq, (x) => x[k] === 1)])),
  coreComplete: fresh.every((r) => FEATURES.every((k) => typeof r.core[k] === 'number' && Number.isFinite(r.core[k])) && r.coreMissing.length === 0),
  benchmarkBound: JSON.stringify(freshManifest.benchmark) === JSON.stringify(readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').benchmark),
};
const metricVerification = {
  oracleNeverWorse: Object.values(ROWS).every((rows) => rows.every((row) => { const b = bestPolicySet(row); return ROUTED_POLICIES.every((p) => row.chosen[p] === null || row.regret[p] >= b.bestRegret); })),
  normalizedBounded: Object.values(ROWS).every((rows) => rows.every((row) => ROUTED_POLICIES.every((p) => { const v = nr(row, p); return v === null || (v >= 0 && v <= 1); }))),
  resourceAlwaysAvailable: Object.values(ROWS).every((rows) => rows.every((row) => row.chosen[RES] !== null)),
  routerSelectsOnlyAvailable: Object.values(ROWS).every((rows) => rows.every((row) => row.chosen[routerChoose(row)] !== null)),
  costlyImpliesResourceWrong: Object.values(ROWS).every((rows) => rows.every((row) => row.zeroCostOptimal || row.correct[RES] === 0)),
};
const selfSource = readFileSync(at('scripts/certify-stage3f6tsym-router-value.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const staticAudit = {
  ROUTER_FIT_ON_DEV_ONLY: [...selfSource.matchAll(/fitPolicyRouter\(([A-Z0-9]+),/g)].every((m) => ['DEV', 'DEV2'].includes(m[1])),
  NO_DEEP_OR_WORLD_MODEL: !/from '[^']*(jepa|neural|tensorflow|onnx|world-model)/i.test(selfSource),
  NO_POLICY_WRITE: !/writeFile\([^)]*src\//.test(selfSource),
};
let predecessorChecks = { skipped: true };
if (!skipPredecessors) {
  const run = (s) => { const r = spawnSync(process.execPath, [s, '--check'], { cwd: root, encoding: 'utf8' }); try { return r.status === 0 && JSON.parse(r.stdout).reproduced === true; } catch { return false; } };
  predecessorChecks = { stage3f6p1c: run('scripts/certify-stage3f6p1c-symmetric-benchmark.mjs'), stage3f6p1d: run('scripts/certify-stage3f6p1d-symmetric-corpus.mjs'),
    stage3f6p1e: run('scripts/certify-stage3f6p1e-policy-requalification.mjs'), stage3f6t: run('scripts/certify-stage3f6t-policy-router.mjs') };
}
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const r = spawnSync(process.execPath, ['--test', 'tests/stage3f6tsym-router-value.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = r.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(r.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}
const planFile = readJson(STAGE3F6TSYM_PLAN_PATH);
const checks = {
  PREDECESSORS_REPRODUCE: skipPredecessors || Object.values(predecessorChecks).every(Boolean),
  CORPUS_BOUND: freshManifest.extensionOf === 'FORGE_SYMMETRIC_V2_ROUTABILITY_CORPUS_V1' && readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').contentHash === plan.predecessors.corpusContentHash,
  POLICY_SET_BOUND: POLICY_SET_HASH === plan.policySet.stage3f6tPolicySetHash,
  FEATURE_SET_BOUND: planFile.featureSetHash === STAGE3F6TSYM_FEATURE_SET_HASH && openStored.featureSetHash === STAGE3F6TSYM_FEATURE_SET_HASH,
  PLAN_BOUND: planFile.planHash === STAGE3F6TSYM_PLAN_HASH,
  FROZEN_BEFORE_FRESH_AND_SEALED: freeze.FROZEN_BEFORE_FRESH_AND_SEALED,
  OPEN_PHASE_REPRODUCED,
  ROUTER_DETERMINISTIC: openStored.router.deterministic === true,
  HEADLINE_FEATURES_ALL_DEPLOYABLE: openStored.headlineFeatures.length === FEATURES.length,
  FRESH_INTEGRITY: freshIntegrity.contentBound && freshIntegrity.planBound && freshIntegrity.benchmarkBound && freshIntegrity.coreComplete
    && Object.values(freshIntegrity.overlapWithLineage).every((v) => v === 0) && Object.values(freshIntegrity.internalDuplicates).every((v) => v === 0)
    && Object.values(freshIntegrity.seedAudit).every((s) => s.declaredForPartition && !s.usedByLineage && !s.inPriorConsumed)
    && Object.keys(FRESH_SPEC).every((p) => freshIntegrity.counts[p] === FRESH_SPEC[p].n),
  FRESH_SYMMETRY_INTACT: freshIntegrity.equivarianceChecks > 0 && Object.values(freshIntegrity.SYMMETRY_CHECKS).every((v) => v === 1),
  METRICS_VERIFIED: Object.values(metricVerification).every(Boolean),
  NO_SEALED_TUNING_OR_LARGER_MODEL: Object.values(staticAudit).every(Boolean),
  AUTHORITY_R0: plan.authority.tier === 'R0' && !plan.authority.canDispatch && !plan.authority.canMutateLiveWorld && !plan.authority.onlineLearningEnabled && !plan.authority.promotedToLiveRuntime,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const roadmap = {
  ROUTER_VALUE_MEASURED: status === 'PASS', ROUTER_VALUE_MATERIAL, EXPERT_COMPLEMENTARITY_ROUTABLE: ROUTER_VALUE_MATERIAL && (FH.captured.accuracy ?? 0) >= 0.2,
  ROUTER_2_0_JUSTIFIED, EXPERT_REPAIR_REQUIRED: !ROUTER_2_0_JUSTIFIED || FH.strategies.PERFECT_POLICY_SELECTOR.accuracy < 0.5,
  EXPERT_COMPLEMENTARITY_EXISTS: FH.headroom.accuracy95[0] >= 0.05,
  POLICY_QUALITY_REMAINS_PRIMARY_BOTTLENECK: (1 - FH.strategies.PERFECT_POLICY_SELECTOR.accuracy)
    > (FH.strategies.PERFECT_POLICY_SELECTOR.accuracy - Math.max(FH.strategies.ROUTER_SYMMETRIC.accuracy, FH.strategies.BEST_SINGLE_POLICY.accuracy)),
  bottleneckDecomposition: { policySetAccuracyLoss: 1 - FH.strategies.PERFECT_POLICY_SELECTOR.accuracy,
    selectionAccuracyLoss: FH.strategies.PERFECT_POLICY_SELECTOR.accuracy - Math.max(FH.strategies.ROUTER_SYMMETRIC.accuracy, FH.strategies.BEST_SINGLE_POLICY.accuracy) },
  READY_FOR_3F_FREEZE: false, READY_FOR_STAGE3G: false, STAGE3F_STATUS: 'OPEN (requalification 2 of 6: 3F.6-P.1, P.1A, W, D remain)',
};
const payload = roundDeep({
  schemaVersion: 1, stage: plan.stage, status, planHash: STAGE3F6TSYM_PLAN_HASH, featureSetHash: STAGE3F6TSYM_FEATURE_SET_HASH, policySetHash: POLICY_SET_HASH,
  openPhaseReportHash: openStored.reportHash, freeze, predecessorChecks,
  data: { benchmarkId: 'FORGE_SYMMETRIC_V2', corpusId: 'FORGE_SYMMETRIC_V2_ROUTABILITY_CORPUS_V1', corpusContentHash: plan.predecessors.corpusContentHash, fresh: freshIntegrity },
  featureAudit: openStored.featureAudit,
  router: { type: plan.router.methodology.routerFamily, routerHash: openStored.router.routerHash, trainingPartition: 'DEV', calibrationPartition: 'CAL', threshold: THRESHOLD,
    bestSingle: BEST, historicalRouterHash: historicalFreeze.routerHash, candidateRouterV2Hash: openStored.candidateRouterV2.routerHash, candidateThreshold: THRESHOLD_V2,
    computeCostMultiplyAddsPerDecision: ROUTED_POLICIES.length * (FEATURES.length + 1) + FEATURES.length },
  cascades: openStored.cascades, regimeModels: Object.fromEntries(Object.entries(openStored.regimes).map(([k, v]) => [k, { status: v.status, modelHash: v.modelHash, calThreshold: v.calThreshold, calAuroc: v.calAuroc, bestUnivariate: v.bestUnivariate }])),
  partitions, conclusion, roadmap, metricVerification, staticAudit,
  disclosures: {
    EXPOSED_PARTITIONS: plan.partitions.EXPOSED_HOLDOUT,
    MATERIALITY_CORRECTIONS: plan.materiality.correctionsDeclaredBeforeSealedEvaluation,
    PLAN_AMENDMENT_001: plan.amendments[0].timing,
    LATENCY: plan.metrics.latency,
    P1E_CASCADE_USES_V2: 'FIXED_PRIORITY_CASCADE_P1E contains the diagnostic NEXUS V2 exactly as P.1E froze it; FIXED_PRIORITY_CASCADE_HEADLINE is the headline-set comparator',
    LEVEL_COVERAGE: 'the fresh partitions follow the same canonical admission order as P.1D, so FRESH_HOLDOUT is dominated by low curriculum levels (see data.fresh.levels)',
  },
  checks, tests: testMetrics, authority: plan.authority,
  scope: { newOwners: ['scripts/stage3f6tsym-analysis-plan.mjs', 'scripts/generate-stage3f6tsym-confirmatory.mjs', 'scripts/certify-stage3f6tsym-router-value.mjs',
    'src/stage3f/router-value-v1.js', 'tests/stage3f6tsym-router-value.test.js'], existingOwnersModified: ['package.json', '.gitignore'],
  policiesModified: false, expertsAdded: false, routerMethodologyModified: false, stage3gStarted: false },
});
payload.sourceHashes = Object.fromEntries(payload.scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))]));
payload.certificationHash = hex(JSON.stringify(payload));

/* latency is measured for the report only; it is not part of the certificate */
const t0 = process.hrtime.bigint(); for (const row of ROWS.FRESH_HOLDOUT) routerChoose(row);
const latencyUs = Number(process.hrtime.bigint() - t0) / 1000 / ROWS.FRESH_HOLDOUT.length;

if (checkOnly) {
  const stored = readJson(RESULT);
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6TSYM_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    conclusion, roadmap, latencyMicrosecondsPerDecision: latencyUs }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
