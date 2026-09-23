import { deepFreeze } from '../core/determinism.js';
import { STAGE3F6T_METHODOLOGY } from './policy-router-v1.js';

/* ===========================================================================
 * STAGE_3F_6_T_SYM — router-value primitives.
 *
 * Regime predictability (binary logistic regression with the frozen Stage 3F.6-T optimiser settings),
 * discrimination / calibration metrics, specialist benefit-versus-harm accounting and the predeclared
 * conclusion rules. Deterministic; no randomness; reads nothing on its own.
 * ========================================================================= */

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/* ------------------------------------------------------------ regime model */

/** DEV standardisation, zeros init, bias last, l2 excluding the bias, full-batch gradient descent. */
export function fitBinaryLogistic(X, y, { learningRate = STAGE3F6T_METHODOLOGY.learningRate, l2 = STAGE3F6T_METHODOLOGY.l2,
  iterations = STAGE3F6T_METHODOLOGY.iterations } = {}) {
  const n = X.length; const d = X[0].length;
  const mu = new Array(d).fill(0); const sd = new Array(d).fill(0);
  for (const x of X) for (let j = 0; j < d; j += 1) mu[j] += x[j] / n;
  for (const x of X) for (let j = 0; j < d; j += 1) sd[j] += ((x[j] - mu[j]) ** 2) / n;
  for (let j = 0; j < d; j += 1) { sd[j] = Math.sqrt(sd[j]); if (sd[j] === 0) sd[j] = 1; }
  const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j]));
  const w = new Array(d + 1).fill(0);
  for (let it = 0; it < iterations; it += 1) {
    const g = new Array(d + 1).fill(0);
    for (let i = 0; i < n; i += 1) {
      let z = w[d]; const zi = Z[i];
      for (let j = 0; j < d; j += 1) z += w[j] * zi[j];
      const r = (1 / (1 + Math.exp(-z)) - y[i]) / n;
      for (let j = 0; j < d; j += 1) g[j] += r * zi[j];
      g[d] += r;
    }
    for (let j = 0; j < d; j += 1) w[j] -= learningRate * (g[j] + l2 * w[j]);
    w[d] -= learningRate * g[d];
  }
  return deepFreeze({ mu, sd, w, trainedN: n, positiveRate: mean(y) });
}

export function predictBinary(model, x) {
  let z = model.w[model.w.length - 1];
  for (let j = 0; j < x.length; j += 1) z += model.w[j] * ((x[j] - model.mu[j]) / model.sd[j]);
  return 1 / (1 + Math.exp(-z));
}

/* ------------------------------------------------------------ discrimination */

/** AUROC by Mann-Whitney with average ranks for ties. Null when a class is empty. */
export function aurocOf(scores, labels) {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]);
  const pos = labels.filter((y) => y === 1).length; const neg = labels.length - pos;
  if (pos === 0 || neg === 0) return null;
  let rankSum = 0; let i = 0;
  while (i < idx.length) {
    let j = i; while (j < idx.length && scores[idx[j]] === scores[idx[i]]) j += 1;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) if (labels[idx[k]] === 1) rankSum += avg;
    i = j;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** Average precision with tied scores treated as one threshold. */
export function averagePrecision(scores, labels) {
  const pos = labels.filter((y) => y === 1).length;
  if (pos === 0) return null;
  const idx = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
  let tp = 0; let fp = 0; let prevRecall = 0; let ap = 0; let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j < idx.length && scores[idx[j]] === scores[idx[i]]) { if (labels[idx[j]] === 1) tp += 1; else fp += 1; j += 1; }
    const recall = tp / pos; const precision = tp / (tp + fp);
    ap += (recall - prevRecall) * precision; prevRecall = recall; i = j;
  }
  return ap;
}

export const brier = (p, y) => mean(p.map((v, i) => (v - y[i]) ** 2));

export function ece10(p, y) {
  const b = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  p.forEach((v, i) => { const k = Math.min(9, Math.floor(v * 10)); b[k].n += 1; b[k].p += v; b[k].y += y[i]; });
  return p.length ? b.reduce((s, x) => s + (x.n ? (x.n / p.length) * Math.abs(x.p / x.n - x.y / x.n) : 0), 0) : null;
}

export function atThreshold(p, y, t) {
  let tp = 0; let fp = 0; let fn = 0;
  p.forEach((v, i) => { if (v >= t) { if (y[i] === 1) tp += 1; else fp += 1; } else if (y[i] === 1) fn += 1; });
  const precision = tp + fp ? tp / (tp + fp) : null; const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { threshold: t, predictedPositive: tp + fp, precision, recall, f1 };
}

/** CAL rule: maximise F1 on a 0.01 grid; ties -> lower threshold. */
export function f1Threshold(p, y) {
  let best = null;
  for (let k = 1; k <= 99; k += 1) {
    const t = Math.round(k) / 100; const s = atThreshold(p, y, t);
    if (best === null || s.f1 > best.f1) best = s;
  }
  return best;
}

/* ------------------------------------------------------------ specialist value */

/**
 * For each specialist the chooser selects instead of the reference policy: regret saved where it is strictly better,
 * regret added where it is strictly worse (raw and normalized), per partition episode. With `inBest`, selections are
 * also counted as correct (the specialist is in the episode's best set) or false (it is not).
 */
export function specialistValue(rows, choose, { reference, specialists, normalized, inBest = null }) {
  const out = {};
  for (const s of specialists) {
    const sel = rows.filter((r) => choose(r) === s && r.chosen[s] !== null && r.chosen[reference] !== null);
    let saved = 0; let added = 0; let savedN = 0; let addedN = 0; let improved = 0; let worsened = 0; let inBestN = 0;
    for (const r of sel) {
      if (inBest !== null && inBest(r, s)) inBestN += 1;
      const d = r.regret[reference] - r.regret[s];
      const dn = normalized(r, reference) - normalized(r, s);
      if (d > 0) { saved += d; improved += 1; } else if (d < 0) { added += -d; worsened += 1; }
      if (dn > 0) savedN += dn; else if (dn < 0) addedN += -dn;
    }
    const n = rows.length;
    out[s] = { selectedN: sel.length, improvedN: improved, worsenedN: worsened, unchangedN: sel.length - improved - worsened,
      ...(inBest === null ? {} : { correctSelectionsN: inBestN, falseSelectionsN: sel.length - inBestN }),
      BENEFIT_SAVED: n ? saved / n : null, FALSE_SELECTION_HARM: n ? added / n : null, NET: n ? (saved - added) / n : null,
      BENEFIT_SAVED_NORMALIZED: n ? savedN / n : null, FALSE_SELECTION_HARM_NORMALIZED: n ? addedN / n : null,
      NET_NORMALIZED: n ? (savedN - addedN) / n : null, benefitExceedsHarm: saved > added };
  }
  return out;
}

/* ------------------------------------------------------------ conclusions */

export function materiality(diff) {
  const accWorse = diff.accuracyCi95[1] < 0; const nrWorse = diff.normalizedRegretCi95[0] > 0;
  const accBetter = diff.accuracyCi95[0] > 0; const nrBetter = diff.normalizedRegretCi95[1] < 0;
  const accMaterial = diff.accuracyDifference >= 0.02 && accBetter && !nrWorse;
  const nrMaterial = -diff.normalizedRegretDifference >= 0.02 && nrBetter && !accWorse;
  const rawHistorical = (diff.accuracyDifference >= 0.02 && accBetter) || (-diff.regretDifference >= 2.0 && diff.regretCi95[1] < 0);
  return { MATERIAL: accMaterial || nrMaterial, accuracyMaterial: accMaterial, normalizedRegretMaterial: nrMaterial,
    HISTORICAL_RAW_RULE_MATERIAL: rawHistorical, MIXED_ACCURACY_REGRET_TRADEOFF: (accBetter && nrWorse) || (nrBetter && accWorse),
    statisticallyBetter: (accBetter && !nrWorse) || (nrBetter && !accWorse),
    ACCURACY_WORSE: accWorse, NORMALIZED_REGRET_WORSE: nrWorse };
}

export const identifiability = (auroc) => (auroc === null ? 'INSUFFICIENT_EVIDENCE' : auroc >= 0.75 ? 'REGIME_IDENTIFIABLE'
  : auroc >= 0.65 ? 'WEAKLY_IDENTIFIABLE' : 'NOT_IDENTIFIABLE');

/** The plan's precedence list. Inputs are FRESH_HOLDOUT / FRESH_OOD quantities. */
export function routerConclusion(e) {
  const holds = {
    INSUFFICIENT_EVIDENCE: e.holdoutN < 2000,
    ROUTER_VALUE_CONFIRMED: e.vsBestSingle.MATERIAL && e.vsCascadeHeadline.MATERIAL && e.oodNotWorse && !e.collapse && e.harmAcceptable,
    ROUTER_COLLAPSES_TO_SINGLE_POLICY: e.collapse && !e.vsBestSingle.MATERIAL,
    ROUTER_VALUE_SMALL: e.vsBestSingle.statisticallyBetter,
    DEPLOYABLE_FEATURES_INSUFFICIENT: e.costlyIdentifiability === 'NOT_IDENTIFIABLE' && e.nexusIdentifiability === 'NOT_IDENTIFIABLE',
    EXPERT_COMPLEMENTARITY_NOT_ROUTABLE: e.headroomLower >= 0.05 && (e.headroomCapturedAccuracy ?? 0) < 0.2,
  };
  const order = ['INSUFFICIENT_EVIDENCE', 'ROUTER_VALUE_CONFIRMED', 'ROUTER_COLLAPSES_TO_SINGLE_POLICY', 'ROUTER_VALUE_SMALL',
    'DEPLOYABLE_FEATURES_INSUFFICIENT', 'EXPERT_COMPLEMENTARITY_NOT_ROUTABLE'];
  const primary = order.find((k) => holds[k]) ?? 'ROUTER_VALUE_NOT_MATERIAL';
  const secondary = order.filter((k) => holds[k] && k !== primary && !(k === 'ROUTER_VALUE_SMALL' && holds.ROUTER_VALUE_CONFIRMED));
  if (!e.vsBestSingle.MATERIAL && primary !== 'ROUTER_VALUE_NOT_MATERIAL') secondary.push('ROUTER_VALUE_NOT_MATERIAL');
  if (e.vsBestSingle.MIXED_ACCURACY_REGRET_TRADEOFF) secondary.push('MIXED_ACCURACY_REGRET_TRADEOFF');
  return { primary, secondary, holds };
}
