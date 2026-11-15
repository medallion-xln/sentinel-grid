// H-W1 I-4 candidate roster and fitting. Thirteen interpretable public-feature candidates (the I-5 cap is 20; seven slots stay unused unless a documented reason adds one). Head lambdas
// are chosen by out-of-fold within-class ranking error; the SAFE_FIRST threshold tau and the RISK_WEIGHTED weight kappa are chosen lexicographically on out-of-fold decisions
// (fewest introductions vs S0 + Nexus, then lowest mean nreg). Everything here sees EXPLORATION data only.
import { LAMBDAS, withinMse, decideAll, summarise, lex, lexLess } from './i4-cv.mjs';
import { standardise, gramOf, fitFromGram } from './i4-ridge.mjs';
import { FEATURE_SETS, FEATURE_VERSION } from './i3-features.mjs';
import { POLICY_FAMILY, POLICY_VERSION } from './i3-policy.mjs';
import { TYPE_NAMES } from './i4-data.mjs';

export const TAUS = Object.freeze([0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75]), KAPPAS = Object.freeze([0.1, 0.3, 1, 3, 10, 30, 100]), TUNE_RESAMPLES = 200;
export const SPECS = Object.freeze({ 'TYPE|plain': { cols: [...TYPE_NAMES.keys()], within: false }, 'BASE|plain': { cols: [...FEATURE_SETS.BASE], within: false }, 'BASE|within': { cols: [...FEATURE_SETS.BASE], within: true },
  'FULL|plain': { cols: [...FEATURE_SETS.FULL], within: false }, 'FULL|within': { cols: [...FEATURE_SETS.FULL], within: true } });
export const ROSTER = Object.freeze([
  { id: 'C01', label: 'TYPE_PRIOR_NREG', spec: 'TYPE|plain', rule: 'NEG_NREG' }, { id: 'C02', label: 'BASE_NREG', spec: 'BASE|plain', rule: 'NEG_NREG' }, { id: 'C03', label: 'FULL_NREG', spec: 'FULL|plain', rule: 'NEG_NREG' },
  { id: 'C04', label: 'BASE_NREG_WITHIN', spec: 'BASE|within', rule: 'NEG_NREG' }, { id: 'C05', label: 'FULL_NREG_WITHIN', spec: 'FULL|within', rule: 'NEG_NREG' },
  { id: 'C06', label: 'BASE_RISK_WEIGHTED', spec: 'BASE|plain', rule: 'RISK_WEIGHTED' }, { id: 'C07', label: 'FULL_RISK_WEIGHTED', spec: 'FULL|plain', rule: 'RISK_WEIGHTED' },
  { id: 'C08', label: 'BASE_RISK_WEIGHTED_WITHIN', spec: 'BASE|within', rule: 'RISK_WEIGHTED' }, { id: 'C09', label: 'FULL_RISK_WEIGHTED_WITHIN', spec: 'FULL|within', rule: 'RISK_WEIGHTED' },
  { id: 'C10', label: 'BASE_SAFE_FIRST', spec: 'BASE|plain', rule: 'SAFE_FIRST' }, { id: 'C11', label: 'FULL_SAFE_FIRST', spec: 'FULL|plain', rule: 'SAFE_FIRST' },
  { id: 'C12', label: 'BASE_SAFE_FIRST_WITHIN', spec: 'BASE|within', rule: 'SAFE_FIRST' }, { id: 'C13', label: 'FULL_SAFE_FIRST_WITHIN', spec: 'FULL|within', rule: 'SAFE_FIRST' },
]);

/** Higher wins. Identical to the rule arithmetic in i3-policy.mjs (n = nreg head, c = cat head). */
export const ruleScore = (rule, hyper, n, c) => (rule === 'NEG_NREG' ? -n : rule === 'SAFE_FIRST' ? -(n + 1000 * Number(c > hyper.tau)) : -(n + hyper.kappa * c));

export function chooseLambda(ds, oof, spec, label) {
  let best = null; for (const lam of LAMBDAS) { const mse = withinMse(ds, oof[`${spec}|${label}|${lam}`], label); if (best === null || mse < best.mse) best = { lambda: lam, mse }; }
  return best;
}

/** Tune the rule parameter on out-of-fold decisions. NEG_NREG has none. */
export function tuneRule(ds, classes, oofN, oofC, rule) {
  if (rule === 'NEG_NREG') return { hyper: {}, grid: [] };
  const key = rule === 'SAFE_FIRST' ? 'tau' : 'kappa', values = rule === 'SAFE_FIRST' ? TAUS : KAPPAS, grid = []; let best = null;
  for (const v of values) {
    const hyper = { [key]: v }, { results } = decideAll(ds, classes, (r) => ruleScore(rule, hyper, oofN[r], oofC[r])), a = summarise(ds, results, { resamples: TUNE_RESAMPLES }), k = lex(a);
    grid.push({ [key]: v, introVsS0: a.introVsS0, introVsNexus: a.introVsNexus, meanNreg: a.meanNreg }); if (best === null || lexLess(k, best.k)) best = { hyper, k };
  }
  return { hyper: best.hyper, grid };
}

/** Fit the heads on ALL exploration rows and return the model JSON the policy runtime loads. */
export function buildModel(ds, cand, lamN, lamC, hyper, meta) {
  const spec = SPECS[cand.spec], W = ds.W, rows = [...Array(ds.N).keys()], { mean, std } = standardise(rows.map((i) => ds.X.subarray(i * W, (i + 1) * W)), W);
  const Z = rows.map((i) => { const z = new Float64Array(W); for (let j = 0; j < W; j++) z[j] = (ds.X[i * W + j] - mean[j]) / std[j]; return z; }), g = gramOf(Z, ds.labels, ds.classOf, rows, spec.cols, spec.within);
  const heads = { nreg: fitFromGram(g, 'nreg', lamN) }; if (cand.rule !== 'NEG_NREG') heads.cat = fitFromGram(g, 'cat', lamC);
  return { policyId: `${POLICY_FAMILY}/${POLICY_VERSION}/${cand.id}_${cand.label}`, policyFamily: POLICY_FAMILY, policyVersion: POLICY_VERSION, featureVersion: FEATURE_VERSION, mean, std, heads,
    score: { rule: cand.rule, ...hyper }, meta: { candidate: cand.id, label: cand.label, spec: cand.spec, trainedOn: 'EXPLORATION', lambdaNreg: lamN, lambdaCat: cand.rule === 'NEG_NREG' ? null : lamC, ...meta } };
}

/** Row scores of a model over a dataset, with the policy runtime's arithmetic (standardise, fixed-order head sum, rule). */
export function modelRowScores(ds, model) {
  const W = ds.W, h = (hd, r) => { let s = hd.b; for (let j = 0; j < hd.w.length; j++) s += hd.w[j] * ((ds.X[r * W + hd.cols[j]] - model.mean[hd.cols[j]]) / model.std[hd.cols[j]]); return s; };
  const out = new Float64Array(ds.N); for (let r = 0; r < ds.N; r++) out[r] = ruleScore(model.score.rule, model.score, h(model.heads.nreg, r), model.heads.cat ? h(model.heads.cat, r) : 0);
  return out;
}
