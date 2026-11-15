// H-W1 I-4 cross-validation on the EXPLORATION population only. Folds are grouped by origin family (no family straddles train and test), balanced greedily and deterministically.
// Per fold: standardise on the training rows, build one Gram per (feature set, centring), fit every lambda for both heads, predict the held-out rows. Out-of-fold predictions drive every
// hyper-parameter choice and every honest exploration metric; in-sample numbers are reported separately and never used for selection.
import { createHash } from 'node:crypto';
import { standardise, gramOf, fitFromGram } from './i4-ridge.mjs';
import { pick, orbitOf } from './i4-data.mjs';
import { evalClass, aggregate } from './hw1-eval.mjs';

export const LAMBDAS = Object.freeze([1e-4, 1e-3, 1e-2, 1e-1, 1, 10]), FOLDS = 5;
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** foldOfClass[ci] in 0..K-1: families sorted by size (desc) then sha256(name), each placed in the currently lightest fold. */
export function makeFolds(ds, K = FOLDS) {
  const size = new Map(); ds.classes.forEach((c) => size.set(c.family, (size.get(c.family) ?? 0) + 1));
  const fams = [...size.keys()].sort((a, b) => size.get(b) - size.get(a) || (sha(a) < sha(b) ? -1 : 1)), load = new Array(K).fill(0), at = new Map();
  for (const f of fams) { const k = load.indexOf(Math.min(...load)); at.set(f, k); load[k] += size.get(f); }
  return { foldOfClass: ds.classes.map((c) => at.get(c.family)), load, K };
}

const predict = (Z, rows, head) => { const out = new Float64Array(rows.length); rows.forEach((i, r) => { let s = head.b; for (let j = 0; j < head.cols.length; j++) s += head.w[j] * Z[i][head.cols[j]]; out[r] = s; }); return out; };
const rowViews = (ds, mean, std) => { const Z = new Array(ds.N), W = ds.W; for (let i = 0; i < ds.N; i++) { const z = new Float64Array(W); for (let j = 0; j < W; j++) z[j] = (ds.X[i * W + j] - mean[j]) / std[j]; Z[i] = z; } return Z; };

/** specs: { name: { cols, within } }. Returns oof[`${spec}|${label}|${lambda}`] = Float64Array(ds.N) of out-of-fold predictions. */
export function oofPredictions(ds, folds, specs) {
  const oof = {}, trainRows = (f) => [...Array(ds.N).keys()].filter((i) => folds.foldOfClass[ds.classOf[i]] !== f), testRows = (f) => [...Array(ds.N).keys()].filter((i) => folds.foldOfClass[ds.classOf[i]] === f);
  for (const [name, spec] of Object.entries(specs)) for (const lab of Object.keys(ds.labels)) for (const lam of LAMBDAS) oof[`${name}|${lab}|${lam}`] = new Float64Array(ds.N);
  for (let f = 0; f < folds.K; f++) {
    const tr = trainRows(f), te = testRows(f), { mean, std } = standardise(tr.map((i) => ds.X.subarray(i * ds.W, (i + 1) * ds.W)), ds.W), Z = rowViews(ds, mean, std);
    for (const [name, spec] of Object.entries(specs)) {
      const g = gramOf(Z, ds.labels, ds.classOf, tr, spec.cols, spec.within);
      for (const lab of Object.keys(ds.labels)) for (const lam of LAMBDAS) { const p = predict(Z, te, fitFromGram(g, lab, lam)); te.forEach((i, r) => { oof[`${name}|${lab}|${lam}`][i] = p[r]; }); }
    }
  }
  return oof;
}

/** Within-class ranking error: mean over classes of the MSE between class-centred predictions and class-centred labels (the criterion used to choose head lambdas). */
export function withinMse(ds, pred, lab) {
  let s = 0, n = 0;
  ds.classes.forEach((c, ci) => { const a = ds.start[ci], mp = avg(pred, a, c.n), my = avg(ds.labels[lab], a, c.n); for (let i = 0; i < c.n; i++) { s += ((pred[a + i] - mp) - (ds.labels[lab][a + i] - my)) ** 2; n++; } });
  return s / n;
}
const avg = (v, a, n) => { let s = 0; for (let i = 0; i < n; i++) s += v[a + i]; return s / n; };

/** Decide every class with a row-score function; return the decided keyV2 orbits and the evaluator's per-class outcomes. */
export function decideAll(ds, classes, scoreAt, mask = null) {
  const orbits = ds.classes.map((c, ci) => { const i = pick(ds, ci, mask ? (r) => (mask(r) ? scoreAt(r) : -Infinity) : scoreAt); return { index: i, orbit: orbitOf(ds, ci, i) }; });
  return { picks: orbits, results: classes.map((cls, ci) => evalClass(cls, orbits[ci].orbit)) };
}
export const summarise = (ds, results, opts) => aggregate(results, ds.classes.map((c) => c.family), opts);

/** Lexicographic selection key: introductions (vs S0 + vs Nexus, class level) first, then mean nreg. Smaller is better. */
export const lex = (a) => [a.introVsS0 + a.introVsNexus, a.meanNreg];
export const lexLess = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);

/** Within-class AUC of a risk score for the class-safe label: P(risk[unsafe] > risk[safe]) over (unsafe, safe) action pairs of the same class, averaged over classes holding both. */
export function withinAuc(ds, risk) {
  const out = [];
  ds.classes.forEach((c, ci) => {
    const a = ds.start[ci]; let hit = 0, pairs = 0;
    for (let i = 0; i < c.n; i++) for (let j = 0; j < c.n; j++) if (ds.labels.cat[a + i] === 1 && ds.labels.cat[a + j] === 0) { pairs++; hit += risk[a + i] > risk[a + j] ? 1 : risk[a + i] === risk[a + j] ? 0.5 : 0; }
    if (pairs) out.push(hit / pairs);
  });
  return { auc: out.length ? out.reduce((x, y) => x + y, 0) / out.length : null, classesWithBoth: out.length };
}
