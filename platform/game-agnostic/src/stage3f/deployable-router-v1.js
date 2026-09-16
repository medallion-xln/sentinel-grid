import { deepFreeze, sha256 } from '../core/determinism.js';

/* ===========================================================================
 * STAGE_3F_6_C — deployable router training and evaluation.
 *
 * Mirrors the Stage 3E logistic-regression family exactly (standardize, bias LAST,
 * full-batch gradient descent, L2 excluding the bias) so that a change in results
 * reflects the FEATURE CONTRACT and not a change of model family.
 *
 * Deterministic throughout: no RNG, no wall clock, no data-dependent early stopping.
 * ========================================================================= */

export class DeployableRouterError extends Error {}

/** Frozen before any sealed partition is opened. */
export const STAGE3F6C_METHODOLOGY = deepFreeze({
  routerFamily: 'LOGISTIC_REGRESSION_STANDARDIZED_BIAS_LAST',
  inheritedFrom: 'STAGE3E_FIT_LR',
  learningRate: 0.1,
  l2: 1e-3,
  iterations: 4000,
  weightInitialization: 'ZEROS',
  biasPosition: 'LAST',
  l2ExcludesBias: true,
  standardization: 'DEV_MEAN_AND_POPULATION_STD_ZERO_SD_TO_ONE',
  minRoutedN: 200,
  wilsonZ: 1.96,
  reliabilityTiers: [0.8, 0.9, 0.95, 0.975, 0.99],
  tauGrid: { start: 0.5, end: 0.999, step: 0.002 },
  reportedTauCurve: [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.92, 0.95, 0.97, 0.98, 0.99, 0.995],
  eceBins: 10,
  tierSelectionRule: 'LARGEST_ROUTED_N_MEETING_PRECISION_TARGET_AT_OR_ABOVE_EVIDENCE_FLOOR',
  thresholdSelectedOn: 'CAL_ONLY',
  sealedPartitions: ['HOLDOUT', 'OOD'],
  quantileRule: 'NEAREST_RANK',
});

/* --------------------------------------------------------------- statistics */

export function wilsonLower(k, n, z = STAGE3F6C_METHODOLOGY.wilsonZ) {
  if (n === 0) return 0;
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  return Math.max(0, ((p + (z * z) / (2 * n)) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denominator);
}

/** Nearest-rank quantile over an ascending array. */
export function quantile(sortedAscending, q) {
  if (sortedAscending.length === 0) return null;
  const rank = Math.max(1, Math.ceil(q * sortedAscending.length));
  return sortedAscending[Math.min(rank, sortedAscending.length) - 1];
}

/** Rank-based AUROC with mid-ranks for ties. */
export function auroc(scores, labels) {
  const n = scores.length;
  const positives = labels.reduce((sum, value) => sum + value, 0);
  const negatives = n - positives;
  if (positives === 0 || negatives === 0) return null;
  const order = [...scores.keys()].sort((a, b) => scores[a] - scores[b] || a - b);
  const ranks = new Array(n);
  let index = 0;
  while (index < n) {
    let end = index;
    while (end + 1 < n && scores[order[end + 1]] === scores[order[index]]) end += 1;
    const midRank = (index + 1 + end + 1) / 2;
    for (let j = index; j <= end; j += 1) ranks[order[j]] = midRank;
    index = end + 1;
  }
  let positiveRankSum = 0;
  for (let i = 0; i < n; i += 1) if (labels[i] === 1) positiveRankSum += ranks[i];
  return (positiveRankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

export function brier(scores, labels) {
  if (scores.length === 0) return null;
  return scores.reduce((sum, p, i) => sum + (p - labels[i]) ** 2, 0) / scores.length;
}

/** Expected calibration error, equal-width bins. */
export function ece(scores, labels, bins = STAGE3F6C_METHODOLOGY.eceBins) {
  if (scores.length === 0) return null;
  const buckets = Array.from({ length: bins }, () => ({ n: 0, scoreSum: 0, labelSum: 0 }));
  for (let i = 0; i < scores.length; i += 1) {
    const index = Math.min(bins - 1, Math.floor(scores[i] * bins));
    buckets[index].n += 1;
    buckets[index].scoreSum += scores[i];
    buckets[index].labelSum += labels[i];
  }
  let total = 0;
  for (const bucket of buckets) {
    if (bucket.n === 0) continue;
    total += (bucket.n / scores.length) * Math.abs(bucket.scoreSum / bucket.n - bucket.labelSum / bucket.n);
  }
  return total;
}

/** Reliability by score bin: does a higher score actually mean safer routing? */
export function reliabilityByBin(scores, labels, bins = STAGE3F6C_METHODOLOGY.eceBins) {
  const buckets = Array.from({ length: bins }, (unused, index) => ({
    bin: `${(index / bins).toFixed(1)}-${((index + 1) / bins).toFixed(1)}`, n: 0, positives: 0,
  }));
  for (let i = 0; i < scores.length; i += 1) {
    const index = Math.min(bins - 1, Math.floor(scores[i] * bins));
    buckets[index].n += 1;
    buckets[index].positives += labels[i];
  }
  return buckets.map((bucket) => ({
    ...bucket,
    observedPrecision: bucket.n ? bucket.positives / bucket.n : null,
    wilsonLower: bucket.n ? wilsonLower(bucket.positives, bucket.n) : null,
  }));
}

/* ----------------------------------------------------------------- training */

/**
 * Fit the Stage 3E logistic-regression family on DEV only.
 * Weight layout is Stage 3E's: feature weight i at w[i], bias LAST at w[keys.length].
 */
export function fitLogisticRegression(matrix, labels, keys, options = {}) {
  const { learningRate, l2, iterations } = { ...STAGE3F6C_METHODOLOGY, ...options };
  const n = matrix.length;
  if (n === 0) throw new DeployableRouterError('cannot fit a router on an empty DEV partition');
  const d = keys.length;

  const mu = new Array(d).fill(0);
  for (const row of matrix) for (let j = 0; j < d; j += 1) mu[j] += row[j] / n;
  const sd = new Array(d).fill(0);
  for (const row of matrix) for (let j = 0; j < d; j += 1) sd[j] += ((row[j] - mu[j]) ** 2) / n;
  for (let j = 0; j < d; j += 1) {
    sd[j] = Math.sqrt(sd[j]);
    if (sd[j] === 0) sd[j] = 1;
  }

  const z = matrix.map((row) => {
    const standardized = new Array(d + 1);
    for (let j = 0; j < d; j += 1) standardized[j] = (row[j] - mu[j]) / sd[j];
    standardized[d] = 1;
    return standardized;
  });

  const w = new Array(d + 1).fill(0);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = new Array(d + 1).fill(0);
    for (let i = 0; i < n; i += 1) {
      let dot = 0;
      for (let j = 0; j <= d; j += 1) dot += z[i][j] * w[j];
      const residual = 1 / (1 + Math.exp(-dot)) - labels[i];
      for (let j = 0; j <= d; j += 1) gradient[j] += (z[i][j] * residual) / n;
    }
    for (let j = 0; j < d; j += 1) gradient[j] += l2 * w[j];
    for (let j = 0; j <= d; j += 1) w[j] -= learningRate * gradient[j];
  }

  return deepFreeze({
    keys: [...keys], mu, sd, w,
    family: STAGE3F6C_METHODOLOGY.routerFamily,
    learningRate, l2, iterations, biasIndex: d,
  });
}

/** Score one feature-value map with a fitted model. Missing key => hard error, never a silent zero. */
export function scoreFeatures(model, values) {
  let dot = model.w[model.keys.length];
  for (let j = 0; j < model.keys.length; j += 1) {
    const value = values[model.keys[j]];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DeployableRouterError(`feature '${model.keys[j]}' is not available as a finite number at scoring time`);
    }
    dot += model.w[j] * ((value - model.mu[j]) / model.sd[j]);
  }
  return 1 / (1 + Math.exp(-dot));
}

export function scoreMatrix(model, matrix) {
  return matrix.map((row) => {
    let dot = model.w[model.keys.length];
    for (let j = 0; j < model.keys.length; j += 1) dot += model.w[j] * ((row[j] - model.mu[j]) / model.sd[j]);
    return 1 / (1 + Math.exp(-dot));
  });
}

export function featureImportance(model) {
  return deepFreeze(model.keys
    .map((key, index) => ({ key, weight: model.w[index], absWeight: Math.abs(model.w[index]) }))
    .sort((a, b) => b.absWeight - a.absWeight || (a.key < b.key ? -1 : 1)));
}

export function routerHash(model) {
  return sha256({ keys: model.keys, mu: model.mu, sd: model.sd, w: model.w, family: model.family });
}

/* -------------------------------------------------------------- calibration */

export function tauCurve(scores, labels, taus = STAGE3F6C_METHODOLOGY.reportedTauCurve) {
  return taus.map((tau) => {
    const selected = scores.map((p, i) => ({ p, y: labels[i] })).filter((entry) => entry.p >= tau);
    const n = selected.length;
    const k = selected.reduce((sum, entry) => sum + entry.y, 0);
    return {
      tau, routedN: n,
      precision: n ? k / n : 0,
      wilsonLower: wilsonLower(k, n),
      coverage: scores.length ? n / scores.length : 0,
    };
  });
}

/**
 * Tier selection on CAL only: the largest routed n whose OBSERVED precision meets the
 * target at or above the evidence floor. Targets are never lowered to make a tier achievable.
 */
export function selectTiers(scores, labels, options = {}) {
  const { minRoutedN, reliabilityTiers, tauGrid } = { ...STAGE3F6C_METHODOLOGY, ...options };
  const tiers = {};
  for (const target of reliabilityTiers) {
    let best = null;
    for (let tau = tauGrid.start; tau < tauGrid.end; tau += tauGrid.step) {
      const rounded = Math.round(tau * 1000) / 1000;
      let n = 0; let k = 0;
      for (let i = 0; i < scores.length; i += 1) if (scores[i] >= rounded) { n += 1; k += labels[i]; }
      if (n < minRoutedN) continue;
      const precision = k / n;
      if (precision >= target && (best === null || n > best.routedN)) {
        best = { tau: rounded, routedN: n, precision, wilsonLower: wilsonLower(k, n), coverage: n / scores.length };
      }
    }
    tiers[String(target)] = best === null
      ? { achievable: false, reason: `no tau routes >= ${minRoutedN} cases at observed precision >= ${target}` }
      : { achievable: true, ...best };
  }
  return deepFreeze(tiers);
}

/* -------------------------------------------------------------- evaluation */

/**
 * Evaluate one partition at a frozen threshold.
 *
 * `greedy` is the action the router vouches for; `fallback` is what the runtime does when the
 * router declines. Both arms carry their own correctness and regret, so the hybrid is measured
 * rather than assumed.
 */
export function evaluatePartition({ scores, labels, tau, greedyOk, greedyRegret, fallbackOk, fallbackRegret }) {
  const n = scores.length;
  const routed = scores.map((p) => p >= tau);
  const routedN = routed.filter(Boolean).length;
  const routedCorrect = routed.reduce((sum, isRouted, i) => sum + (isRouted ? labels[i] : 0), 0);
  const falseSafeIndices = routed.map((isRouted, i) => (isRouted && labels[i] === 0 ? i : -1)).filter((i) => i >= 0);

  const hybridOk = routed.map((isRouted, i) => (isRouted ? greedyOk[i] : fallbackOk[i]));
  const hybridRegrets = routed.map((isRouted, i) => (isRouted ? greedyRegret[i] : fallbackRegret[i]))
    .filter((value) => typeof value === 'number' && Number.isFinite(value));

  const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
  const finite = (values) => values.filter((value) => typeof value === 'number' && Number.isFinite(value));

  const falseSafeRegrets = finite(falseSafeIndices.map((i) => greedyRegret[i])).sort((a, b) => a - b);
  const fallbackOnSameStates = finite(falseSafeIndices.map((i) => fallbackRegret[i]));

  return deepFreeze({
    n,
    prevalence: n ? labels.reduce((sum, value) => sum + value, 0) / n : null,
    tau,
    routedN,
    coverage: n ? routedN / n : 0,
    precision: routedN ? routedCorrect / routedN : 0,
    wilsonLower: wilsonLower(routedCorrect, routedN),
    falseSafe: routedN - routedCorrect,
    meetsEvidenceFloor: routedN >= STAGE3F6C_METHODOLOGY.minRoutedN,
    hybridAccuracy: mean(hybridOk),
    hybridRegret: mean(hybridRegrets),
    policies: {
      ALWAYS_GREEDY: { accuracy: mean(greedyOk), regret: mean(finite(greedyRegret)) },
      ALWAYS_FALLBACK: { accuracy: mean(fallbackOk), regret: mean(finite(fallbackRegret)) },
      DEPLOYABLE_CORE_ROUTER: { accuracy: mean(hybridOk), regret: mean(hybridRegrets) },
      ORACLE_GREEDY_SAFE: {
        accuracy: mean(labels.map((y, i) => (y === 1 ? greedyOk[i] : fallbackOk[i]))),
        regret: mean(finite(labels.map((y, i) => (y === 1 ? greedyRegret[i] : fallbackRegret[i])))),
      },
    },
    falseSafeHarm: {
      n: falseSafeIndices.length,
      meanRegret: mean(falseSafeRegrets),
      p50: quantile(falseSafeRegrets, 0.5),
      p90: quantile(falseSafeRegrets, 0.9),
      p95: quantile(falseSafeRegrets, 0.95),
      p99: quantile(falseSafeRegrets, 0.99),
      worst: falseSafeRegrets.length ? falseSafeRegrets[falseSafeRegrets.length - 1] : null,
      fallbackWouldHaveRegret: mean(fallbackOnSameStates),
      harmVersusFallback: mean(falseSafeRegrets) !== null && mean(fallbackOnSameStates) !== null
        ? mean(falseSafeRegrets) - mean(fallbackOnSameStates) : null,
    },
  });
}

/** High-confidence-wrong: of cases scored at or above the level, how many are actually unsafe. */
export function highConfidenceWrong(scores, labels, levels = [0.9, 0.95, 0.99]) {
  const out = {};
  for (const level of levels) {
    let n = 0; let wrong = 0;
    for (let i = 0; i < scores.length; i += 1) if (scores[i] >= level) { n += 1; if (labels[i] === 0) wrong += 1; }
    out[String(level)] = { n, wrong, rate: n ? wrong / n : null, wilsonLowerOnCorrect: wilsonLower(n - wrong, n) };
  }
  return deepFreeze(out);
}

export const DeployableDiagnosis = deepFreeze({
  A_DEPLOYABLE_ROUTER_SUFFICIENT: 'A_DEPLOYABLE_ROUTER_SUFFICIENT',
  B_DEPLOYABLE_FEATURE_INFORMATION_LIMITED: 'B_DEPLOYABLE_FEATURE_INFORMATION_LIMITED',
  C_SIMULATOR_CAPABILITY_MATERIALLY_HELPFUL: 'C_SIMULATOR_CAPABILITY_MATERIALLY_HELPFUL',
  D_V2B_CAPABILITY_MATERIALLY_HELPFUL: 'D_V2B_CAPABILITY_MATERIALLY_HELPFUL',
  E_UNCERTAINTY_CALIBRATION_LIMITED: 'E_UNCERTAINTY_CALIBRATION_LIMITED',
  F_MIXED_LIMITATION: 'F_MIXED_LIMITATION',
  G_INSUFFICIENT_EVIDENCE: 'G_INSUFFICIENT_EVIDENCE',
});
