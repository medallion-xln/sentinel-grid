/* STAGE_3G_3 — SMALL_NONLINEAR_CONTROL: a diagnostic ranking-capacity control, never an expert.
 *
 * A one-hidden-layer ReLU candidate scorer with a within-state softmax and the same set-valued target as the Stage 3F/3G
 * conditional logit (maximise log P(optimal set)). DEV standardisation, seeded deterministic initialisation, full-batch Adam
 * for a fixed number of iterations, l2 on all weights. ReLU and sqrt are exact IEEE operations and exp runs under the
 * canonical numerics profile, so the fit is byte-reproducible. Hidden width is chosen on CAL from a predeclared grid.
 */
import { createSeededRandom, deepFreeze, sha256 } from '../../src/core/determinism.js';

export const MLP_GRID = deepFreeze([8, 16, 32]);
export const MLP_SETTINGS = deepFreeze({ iterations: 600, learningRate: 0.01, beta1: 0.9, beta2: 0.999, epsilon: 1e-8, l2: 1e-4, seed: 'STAGE3G3_SMALL_NONLINEAR_CONTROL_V1', init: 'uniform(-1,1) * sqrt(6 / (fanIn + fanOut))' });

export function fitMlp(groups, hidden, s = MLP_SETTINGS) {
  const d = groups[0].X[0].length; let n = 0;
  const mu = new Float64Array(d); const sd = new Float64Array(d);
  for (const g of groups) for (const x of g.X) { n += 1; for (let j = 0; j < d; j += 1) mu[j] += x[j]; }
  for (let j = 0; j < d; j += 1) mu[j] /= n;
  for (const g of groups) for (const x of g.X) for (let j = 0; j < d; j += 1) sd[j] += (x[j] - mu[j]) * (x[j] - mu[j]);
  for (let j = 0; j < d; j += 1) { sd[j] = Math.sqrt(sd[j] / n); if (sd[j] === 0) sd[j] = 1; }
  const Z = groups.map((g) => ({ X: g.X.map((x) => Float64Array.from(x, (v, j) => (v - mu[j]) / sd[j])), y: g.y }));
  const rand = createSeededRandom(BigInt(`0x${sha256(`${s.seed}:${hidden}:${d}`).slice(0, 15)}`));
  const a1 = Math.sqrt(6 / (d + hidden)); const a2 = Math.sqrt(6 / (hidden + 1));
  const P = { W: Float64Array.from({ length: hidden * d }, () => (rand() * 2 - 1) * a1), b: new Float64Array(hidden), v: Float64Array.from({ length: hidden }, () => (rand() * 2 - 1) * a2) };
  const M = { W: new Float64Array(P.W.length), b: new Float64Array(hidden), v: new Float64Array(hidden) };
  const V = { W: new Float64Array(P.W.length), b: new Float64Array(hidden), v: new Float64Array(hidden) };
  const G = groups.length; let b1t = 1; let b2t = 1;
  for (let it = 1; it <= s.iterations; it += 1) {
    b1t *= s.beta1; b2t *= s.beta2; /* running powers instead of the exponent operator (canonical runtime) */
    const gW = new Float64Array(P.W.length); const gb = new Float64Array(hidden); const gv = new Float64Array(hidden);
    for (const g of Z) {
      const H = g.X.map((x) => { const a = new Float64Array(hidden); for (let k = 0; k < hidden; k += 1) { let z = P.b[k]; const o = k * d; for (let j = 0; j < d; j += 1) z += P.W[o + j] * x[j]; a[k] = z > 0 ? z : 0; } return a; });
      const sc = H.map((a) => { let z = 0; for (let k = 0; k < hidden; k += 1) z += P.v[k] * a[k]; return z; });
      const m = Math.max(...sc); const e = sc.map((v) => Math.exp(v - m)); const tot = e.reduce((a, b) => a + b, 0);
      const pOpt = e.reduce((a, v, i) => a + (g.y[i] ? v : 0), 0);
      for (let i = 0; i < g.X.length; i += 1) {
        const coef = (e[i] / tot - (g.y[i] ? e[i] / pOpt : 0)) / G;
        if (coef === 0) continue;
        const a = H[i]; const x = g.X[i];
        for (let k = 0; k < hidden; k += 1) {
          gv[k] += coef * a[k];
          if (a[k] > 0) { const c = coef * P.v[k]; gb[k] += c; const o = k * d; for (let j = 0; j < d; j += 1) gW[o + j] += c * x[j]; }
        }
      }
    }
    for (const [name, grad] of [['W', gW], ['b', gb], ['v', gv]]) {
      const p = P[name]; const m1 = M[name]; const m2 = V[name];
      for (let j = 0; j < p.length; j += 1) {
        const gj = grad[j] + (name === 'b' ? 0 : s.l2 * p[j]);
        m1[j] = s.beta1 * m1[j] + (1 - s.beta1) * gj; m2[j] = s.beta2 * m2[j] + (1 - s.beta2) * gj * gj;
        const mh = m1[j] / (1 - b1t); const vh = m2[j] / (1 - b2t);
        p[j] -= s.learningRate * mh / (Math.sqrt(vh) + s.epsilon);
      }
    }
  }
  return deepFreeze({ kind: 'MLP_RELU_1H', hidden, d, mu: [...mu], sd: [...sd], W: [...P.W], b: [...P.b], v: [...P.v], trainedGroups: G, trainedCandidates: n });
}

/** Scores and softmax probabilities; each candidate is scored independently (order-free). */
export function scoreMlp(model, X) {
  const { d, hidden } = model;
  const s = X.map((x0) => { const x = x0.map((v, j) => (v - model.mu[j]) / model.sd[j]); let z = 0;
    for (let k = 0; k < hidden; k += 1) { let a = model.b[k]; const o = k * d; for (let j = 0; j < d; j += 1) a += model.W[o + j] * x[j]; if (a > 0) z += model.v[k] * a; }
    return Math.round(z * 1e9) / 1e9; });
  const m = Math.max(...s); const e = s.map((v) => Math.exp(v - m)); const tot = e.reduce((a, b) => a + b, 0);
  return { scores: s, probabilities: e.map((v) => v / tot) };
}
export const mlpHash = (m) => sha256({ hidden: m.hidden, mu: m.mu, sd: m.sd, W: m.W, b: m.b, v: m.v });
