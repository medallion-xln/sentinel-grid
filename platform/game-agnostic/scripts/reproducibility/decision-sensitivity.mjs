#!/usr/bin/env node
/* Stage 3F reproducibility — decision-sensitivity study (needs the 3F.6-C and P.1D payloads).
 *
 *   node scripts/reproducibility/decision-sensitivity.mjs [--out=PATH]
 *
 * How large must a perturbation of fitted coefficients be before anything a certificate decides changes? Each
 * stored fitted coefficient is multiplied independently by (1 + eps*u), u ~ U[-1,1] (seeded), for eps from 1e-16
 * to 1e-3, and the decision quantities each stage actually uses are recomputed. Math.exp is pinned to
 * SENTINEL_CANONICAL_NUMERICS_V1, so the output is identical on every host.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as canonical from '../../src/core/canonical-numerics-v1.js';

Math.exp = canonical.exp;
const root = path.resolve(process.env.SENTINEL_GA_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
const imp = (f) => import(pathToFileURL(path.join(root, f)).href);
const json = (f) => JSON.parse(readFileSync(path.join(root, f), 'utf8'));

const EPS = [0, 1e-16, 1e-15, 1e-14, 1e-13, 1e-12, 1e-11, 1e-10, 1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3];
const TRIALS = 32;
function rng(seed) { let s = BigInt(seed); return () => { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return Number(s >> 11n) / 2 ** 53; }; }
const perturb = (v, eps, r) => v * (1 + eps * (2 * r() - 1));

const results = { schemaVersion: 1, study: 'STAGE3F_DECISION_SENSITIVITY_V1', numericsProfile: canonical.CANONICAL_NUMERICS_ID, epsilons: EPS, trialsPerEpsilon: TRIALS,
  perturbation: 'every fitted coefficient multiplied independently by (1 + eps*u), u ~ U[-1,1], seeded; mu/sd (pure IEEE arithmetic, platform-invariant) held fixed', models: {} };

/* ----------------------------------------------- A. Stage 3F.6-C logistic router */
{
  const R = await imp('src/stage3f/deployable-router-v1.js');
  const { DEPLOYABLE_PROFILES, DeployableProfile } = await imp('src/stage3f/deployable-feature-contract-v1.js');
  const freeze = json('artifacts/stage3f6c-deployable-router/stage3f6c-evaluation-freeze.json');
  const keys = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort();
  const rows = gunzipSync(readFileSync(path.join(root, 'artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const parts = Object.fromEntries(['DEV', 'CAL', 'HOLDOUT', 'OOD'].map((p) => { const rs = rows.filter((r) => r.partition === p);
    return [p, { X: rs.map((r) => keys.map((k) => r.core[k])), y: rs.map((r) => r.y), rs }]; }));
  const base = { keys, mu: freeze.coreWeights.mu, sd: freeze.coreWeights.sd, w: freeze.coreWeights.w, family: 'x' };
  const tau = freeze.operatingPointSelection.tau;
  const grid = []; for (let t = 0.5; t <= 0.999 + 1e-12; t += 0.002) grid.push(Math.round(t * 1000) / 1000);
  const baseScores = Object.fromEntries(Object.entries(parts).map(([p, d]) => [p, R.scoreMatrix(base, d.X)]));
  // analytic decision margins
  let minTauMargin = Infinity; let minGridMargin = Infinity; let minScoreGapRel = Infinity;
  for (const s of Object.values(baseScores)) {
    for (const v of s) { minTauMargin = Math.min(minTauMargin, Math.abs(v - tau)); for (const g of grid) minGridMargin = Math.min(minGridMargin, Math.abs(v - g)); }
    const srt = [...s].sort((a, b) => a - b); for (let i = 1; i < srt.length; i += 1) if (srt[i] !== srt[i - 1]) minScoreGapRel = Math.min(minScoreGapRel, (srt[i] - srt[i - 1]) / srt[i]);
  }
  const baseTiers = R.selectTiers(baseScores.CAL, parts.CAL.y);
  const baseMetrics = Object.fromEntries(Object.entries(parts).map(([p, d]) => [p, { auroc: R.auroc(baseScores[p], d.y), brier: R.brier(baseScores[p], d.y), ece: R.ece(baseScores[p], d.y), routed: baseScores[p].filter((v) => v >= tau).length }]));
  const byEps = [];
  for (const eps of EPS) {
    const agg = { eps, maxAbsDeltaScore: 0, routedFlips: 0, gridCrossings: 0, aurocChanged: 0, maxAbsDeltaAuroc: 0, maxAbsDeltaBrier: 0, maxAbsDeltaEce: 0, tierSelectionChanged: 0, routedCountChanged: 0 };
    for (let t = 0; t < (eps === 0 ? 1 : TRIALS); t += 1) {
      const r = rng(1000 + t); const m = { ...base, w: base.w.map((v) => perturb(v, eps, r)) };
      for (const [p, d] of Object.entries(parts)) {
        const s = R.scoreMatrix(m, d.X); const b = baseScores[p];
        for (let i = 0; i < s.length; i += 1) {
          agg.maxAbsDeltaScore = Math.max(agg.maxAbsDeltaScore, Math.abs(s[i] - b[i]));
          if ((s[i] >= tau) !== (b[i] >= tau)) agg.routedFlips += 1;
          for (const g of grid) if ((s[i] >= g) !== (b[i] >= g)) agg.gridCrossings += 1;
        }
        const a = R.auroc(s, d.y); if (a !== baseMetrics[p].auroc) agg.aurocChanged += 1;
        agg.maxAbsDeltaAuroc = Math.max(agg.maxAbsDeltaAuroc, Math.abs(a - baseMetrics[p].auroc));
        agg.maxAbsDeltaBrier = Math.max(agg.maxAbsDeltaBrier, Math.abs(R.brier(s, d.y) - baseMetrics[p].brier));
        agg.maxAbsDeltaEce = Math.max(agg.maxAbsDeltaEce, Math.abs(R.ece(s, d.y) - baseMetrics[p].ece));
        if (s.filter((v) => v >= tau).length !== baseMetrics[p].routed) agg.routedCountChanged += 1;
        if (p === 'CAL' && JSON.stringify(R.selectTiers(s, d.y)) !== JSON.stringify(baseTiers)) agg.tierSelectionChanged += 1;
      }
    }
    byEps.push(agg);
  }
  results.models.STAGE3F6C_CORE_LOGISTIC = { coefficients: base.w.length, operatingTau: tau, rows: rows.length,
    analyticMargins: { minAbsScoreMinusOperatingTau: minTauMargin, minAbsScoreMinusAnyGridTau: minGridMargin, minRelativeGapBetweenDistinctScores: minScoreGapRel },
    byEpsilon: byEps };
}

/* -------------------------------- B. symmetric policy router (T-SYM / D-SYM frozen fit) */
{
  const P = await imp('src/stage3f/policy-router-v1.js');
  const { routerRow } = await imp('scripts/stage3f6dsym-freeze.mjs');
  const { readCorpus } = await imp('scripts/generate-stage3f6p1e-policy-evidence.mjs');
  const freeze = json('artifacts/stage3f6dsym-decision-rule/stage3f6dsym-analysis-freeze.json');
  const tsym = json('artifacts/stage3f6tsym-router-value/stage3f6tsym-open-phase-report.json');
  const threshold = tsym.router.calibration.threshold; const fallbackPolicy = tsym.router.bestSingle.policy;
  const corpus = readCorpus().map(routerRow);
  const parts = Object.fromEntries([...new Set(corpus.map((r) => r.partition))].map((p) => [p, corpus.filter((r) => r.partition === p)]));
  const base = { family: freeze.model.family, policies: P.ROUTED_POLICIES, featureKeys: freeze.model.featureKeys, mu: freeze.model.mu, sd: freeze.model.sd, W: freeze.model.W };
  const baseRoute = Object.fromEntries(Object.entries(parts).map(([p, rs]) => [p, rs.map((row) => P.routeEpisode(base, row, { threshold, fallbackPolicy }))]));
  let minTop2 = Infinity; let minThr = Infinity;
  for (const rs of Object.values(baseRoute)) for (const e of rs) {
    const pr = Object.entries(e.probabilities).filter(([k]) => e.available.includes(k)).map(([, v]) => v).sort((a, b) => b - a);
    if (pr.length > 1) minTop2 = Math.min(minTop2, pr[0] - pr[1]);
    minThr = Math.min(minThr, Math.abs(e.confidence - threshold));
  }
  const baseEval = Object.fromEntries(Object.entries(parts).map(([p, rs]) => [p, P.evaluateStrategy(rs, (row) => P.routeEpisode(base, row, { threshold, fallbackPolicy }).selectedPolicy)]));
  const byEps = [];
  for (const eps of EPS) {
    const agg = { eps, maxAbsDeltaProbability: 0, argmaxFlips: 0, rankingChanges: 0, routedFlips: 0, selectedPolicyFlips: 0, maxAbsDeltaAccuracy: 0, maxAbsDeltaMeanRegret: 0 };
    for (let t = 0; t < (eps === 0 ? 1 : TRIALS); t += 1) {
      const r = rng(2000 + t); const m = { ...base, W: base.W.map((row) => row.map((v) => perturb(v, eps, r))) };
      for (const [p, rs] of Object.entries(parts)) {
        for (let i = 0; i < rs.length; i += 1) {
          const e = P.routeEpisode(m, rs[i], { threshold, fallbackPolicy }); const b = baseRoute[p][i];
          for (const k of P.ROUTED_POLICIES) agg.maxAbsDeltaProbability = Math.max(agg.maxAbsDeltaProbability, Math.abs(e.probabilities[k] - b.probabilities[k]));
          if (e.selected !== b.selected) agg.argmaxFlips += 1;
          const rk = (x) => P.ROUTED_POLICIES.filter((k) => x.available.includes(k)).sort((a, c) => x.probabilities[c] - x.probabilities[a]).join(',');
          if (rk(e) !== rk(b)) agg.rankingChanges += 1;
          if (e.routed !== b.routed) agg.routedFlips += 1;
          if (e.selectedPolicy !== b.selectedPolicy) agg.selectedPolicyFlips += 1;
        }
        const ev = P.evaluateStrategy(rs, (row) => P.routeEpisode(m, row, { threshold, fallbackPolicy }).selectedPolicy);
        agg.maxAbsDeltaAccuracy = Math.max(agg.maxAbsDeltaAccuracy, Math.abs(ev.accuracy - baseEval[p].accuracy));
        agg.maxAbsDeltaMeanRegret = Math.max(agg.maxAbsDeltaMeanRegret, Math.abs(ev.meanRegret - baseEval[p].meanRegret));
      }
    }
    byEps.push(agg);
  }
  results.models.SYMMETRIC_POLICY_ROUTER = { coefficients: base.W.flat().length, threshold, fallbackPolicy, rows: corpus.length, partitions: Object.keys(parts),
    analyticMargins: { minTop1MinusTop2Probability: minTop2, minAbsConfidenceMinusThreshold: minThr }, byEpsilon: byEps };
}

/* The smallest perturbation at which any decision quantity moved, per model. Continuous metrics (Brier, ECE,
 * probabilities) move at every eps and are governed by tolerance, not by this threshold. */
const firstDecisionChange = (rows, keys) => rows.find((r) => r.eps > 0 && keys.some((k) => r[k] > 0))?.eps ?? null;
results.summary = {
  STAGE3F6C_CORE_LOGISTIC: { firstEpsAnyDecisionQuantityChanged: firstDecisionChange(results.models.STAGE3F6C_CORE_LOGISTIC.byEpsilon, ['routedFlips', 'gridCrossings', 'aurocChanged', 'tierSelectionChanged', 'routedCountChanged']),
    firstEpsRoutingDecisionChanged: firstDecisionChange(results.models.STAGE3F6C_CORE_LOGISTIC.byEpsilon, ['routedFlips', 'gridCrossings', 'tierSelectionChanged', 'routedCountChanged']) },
  SYMMETRIC_POLICY_ROUTER: { firstEpsAnyDecisionQuantityChanged: firstDecisionChange(results.models.SYMMETRIC_POLICY_ROUTER.byEpsilon, ['argmaxFlips', 'rankingChanges', 'routedFlips', 'selectedPolicyFlips', 'maxAbsDeltaAccuracy', 'maxAbsDeltaMeanRegret']) },
};
results.summary.smallestDecisionRelevantEps = Math.min(...Object.values(results.summary).map((m) => m.firstEpsAnyDecisionQuantityChanged).filter((v) => v !== null));
if (out) writeFileSync(path.resolve(out), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results.summary, null, 2));
