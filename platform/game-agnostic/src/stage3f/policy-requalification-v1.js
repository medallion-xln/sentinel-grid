import { createHash } from 'node:crypto';
import { deepFreeze } from '../core/determinism.js';

/* ===========================================================================
 * STAGE_3F_6_P_1E — symmetric policy requalification primitives.
 *
 * Pure, deterministic measurement functions over stored corpus rows. A row carries `actions`
 * (distinct 16-char key -> { t type, c declared cost, r regret, o optimal }) and a chosen key per
 * policy (null = abstain). Nothing here chooses an action, trains anything or reads sealed data
 * on its own: callers decide which partition a function sees.
 * ========================================================================= */

export const STAGE3F6P1E_BOOTSTRAP_RESAMPLES = 1000;
export const CONFIDENCE_BINS = deepFreeze([0, 0.2, 0.4, 0.6, 0.8, 1.0000001]);

export const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
export const rate = (list, fn) => (list.length ? list.filter(fn).length / list.length : null);

/** Nearest-rank quantile (the repository's rule). */
export function quantile(sortedAscending, q) {
  if (sortedAscending.length === 0) return null;
  const rank = Math.max(1, Math.ceil(q * sortedAscending.length));
  return sortedAscending[Math.min(rank, sortedAscending.length) - 1];
}

/** Wilson score 95% interval for k successes in n trials. */
export function wilson(k, n, z = 1.959963984540054) {
  if (n === 0) return null;
  const p = k / n; const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/* ------------------------------------------------------------ bootstrap */

/** mulberry32, seeded from a string via sha256. Fast and fully deterministic. */
export function seededUniform(label) {
  let state = createHash('sha256').update(`STAGE3F6P1E_BOOTSTRAP:${label}`).digest().readUInt32BE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One shared set of resample indices per (partition, slice), so every statistic on that slice is paired. */
export function bootstrapPlan(n, label, resamples = STAGE3F6P1E_BOOTSTRAP_RESAMPLES) {
  const next = seededUniform(label);
  const indices = new Int32Array(n * resamples);
  for (let i = 0; i < indices.length; i += 1) indices[i] = Math.floor(next() * n);
  return { n, resamples, indices, label };
}

/**
 * 95% percentile interval of a weighted mean. `values[i]` counts only where `weights[i]` is 1, so a
 * statistic over proposing episodes resamples whole episodes (abstentions included) and stays paired.
 */
export function bootstrapMean(plan, values, weights = null) {
  if (values.length !== plan.n) throw new Error('bootstrap plan size mismatch');
  const stats = [];
  for (let b = 0; b < plan.resamples; b += 1) {
    let sum = 0; let count = 0;
    const base = b * plan.n;
    for (let i = 0; i < plan.n; i += 1) {
      const j = plan.indices[base + i];
      if (weights !== null && weights[j] !== 1) continue;
      sum += values[j]; count += 1;
    }
    if (count > 0) stats.push(sum / count);
  }
  stats.sort((a, b) => a - b);
  return stats.length ? [quantile(stats, 0.025), quantile(stats, 0.975)] : null;
}

/* ------------------------------------------------------------- episodes */

export const actionList = (row) => Object.entries(row.actions).map(([key, a]) => ({ key, ...a }));
export const maxRegret = (row) => Math.max(...actionList(row).map((a) => a.r));
export const normalizedRegret = (row, key) => { const m = maxRegret(row); return m > 0 ? row.actions[key].r / m : 0; };
export const uniformLegalAccuracy = (row) => { const a = actionList(row); return a.filter((x) => x.o === 1).length / a.length; };
export const uniformLegalRegret = (row) => mean(actionList(row).map((x) => x.r));

/** The minimum-declared-cost legal actions, or null when a legal action has no declared cost (RESOURCE abstains there). */
export function cheapestClass(row) {
  const a = actionList(row);
  if (a.some((x) => typeof x.c !== 'number')) return null;
  const min = Math.min(...a.map((x) => x.c));
  return a.filter((x) => x.c === min);
}
export const cheapestClassAccuracy = (row) => { const c = cheapestClass(row); return c === null ? null : c.filter((x) => x.o === 1).length / c.length; };
export const zeroCostAvailable = (row) => actionList(row).some((x) => x.c === 0);
export const zeroCostOptimal = (row) => actionList(row).some((x) => x.o === 1 && x.c === 0);

/* ------------------------------------------------------------ confidence */

/** Expected calibration error over fixed bins, plus the per-bin table. */
export function calibration(pairs) {
  const bins = [];
  for (let k = 0; k < CONFIDENCE_BINS.length - 1; k += 1) {
    const lo = CONFIDENCE_BINS[k]; const hi = CONFIDENCE_BINS[k + 1];
    const inBin = pairs.filter((p) => p.confidence >= lo && p.confidence < hi);
    bins.push({ lo, hi: Math.min(1, hi), n: inBin.length, meanConfidence: mean(inBin.map((p) => p.confidence)), accuracy: mean(inBin.map((p) => p.correct)) });
  }
  const n = pairs.length;
  const ece = n ? bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.accuracy - b.meanConfidence) : 0), 0) : null;
  return { bins, ece };
}

/** AUROC of confidence for correctness (Mann-Whitney, ties count half). Null if a class is empty. */
export function auroc(pairs) {
  const sorted = [...pairs].sort((a, b) => a.confidence - b.confidence);
  let rankSum = 0; let i = 0; const positives = pairs.filter((p) => p.correct === 1).length; const negatives = pairs.length - positives;
  if (positives === 0 || negatives === 0) return null;
  while (i < sorted.length) {
    let j = i; while (j < sorted.length && sorted[j].confidence === sorted[i].confidence) j += 1;
    const averageRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) if (sorted[k].correct === 1) rankSum += averageRank;
    i = j;
  }
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/* ------------------------------------------------------------ best sets */

/** Proposing members at minimum regret. `choice(row, p)` returns the chosen key or null. */
export function bestSet(row, members, choice) {
  const available = members.filter((p) => choice(row, p) !== null);
  if (available.length === 0) return { available, best: [], bestRegret: null };
  const bestRegret = Math.min(...available.map((p) => row.actions[choice(row, p)].r));
  return { available, best: available.filter((p) => row.actions[choice(row, p)].r === bestRegret), bestRegret };
}

/** Perfect selector over `members`; an episode with no proposing member uses `fallback`. */
export function perfectSelector(rows, members, choice, fallback) {
  return rows.map((row) => {
    const { best, bestRegret } = bestSet(row, members, choice);
    const key = best.length ? choice(row, best[0]) : choice(row, fallback);
    const regret = best.length ? bestRegret : row.actions[key].r;
    return { key, regret, correct: row.actions[key].o, normalized: normalizedRegret(row, key), covered: best.length > 0 };
  });
}

/* ------------------------------------------------------------ flags */

/**
 * Accuracy gap across the levels of a factor. Only levels with at least `minN` episodes count. Flags when the
 * gap exceeds max(bar, 3 * SE of the difference between the extreme levels).
 */
export function factorGap(levels, { minN = 100, bar = 0.08 } = {}) {
  const usable = Object.entries(levels).filter(([, v]) => v.n >= minN && v.accuracy !== null);
  if (usable.length < 2) return { usableLevels: usable.length, gap: null, threshold: null, flag: false };
  usable.sort((a, b) => a[1].accuracy - b[1].accuracy);
  const [loName, lo] = usable[0]; const [hiName, hi] = usable[usable.length - 1];
  const se = Math.sqrt((lo.accuracy * (1 - lo.accuracy)) / lo.n + (hi.accuracy * (1 - hi.accuracy)) / hi.n);
  const threshold = Math.max(bar, 3 * se);
  const gap = hi.accuracy - lo.accuracy;
  return { usableLevels: usable.length, lowest: loName, highest: hiName, gap, threshold, flag: gap > threshold };
}

/** Paired difference flag: |mean d| > max(bar, 3 * SE(d)). */
export function pairedFlag(differences, { bar = 0.03 } = {}) {
  const n = differences.length;
  if (n < 2) return { n, meanDifference: null, threshold: null, flag: false };
  const m = mean(differences);
  const sd = Math.sqrt(differences.reduce((s, d) => s + (d - m) ** 2, 0) / (n - 1));
  const threshold = Math.max(bar, (3 * sd) / Math.sqrt(n));
  return { n, meanDifference: m, threshold, flag: Math.abs(m) > threshold };
}

/* ------------------------------------------------------------ classification */

/** The plan's decision list, first match wins. Inputs are HOLDOUT quantities. */
export function classifyPolicy(e) {
  if (e.proposingN < 200) return 'INSUFFICIENT_EVIDENCE';
  if (e.nuisanceDependence || e.artifactExplains) return 'SHORTCUT_DEPENDENT';
  if (e.marginalAccuracyGain < 0.005 && e.marginalNormalizedRegretReduction < 0.005) return 'REDUNDANT';
  if (e.aboveChance && e.accuracyWhenBest >= 0.75 && e.marginalAccuracyGain >= 0.02) return 'KEEP';
  if (e.marginalAccuracyGain >= 0.02 && e.accuracyWhenBest < 0.5) return 'REDESIGN_CANDIDATE';
  if (e.marginalAccuracyGain >= 0.02) return 'WEAK_BUT_DISTINCT';
  if (e.aboveChance) return 'KEEP_BUT_LIMIT';
  return 'REDESIGN_CANDIDATE';
}

export function resourceVerdict({ costPriorExplains, reasoningBeyondCostPrior, nuisanceDependence }) {
  const base = reasoningBeyondCostPrior ? 'GENUINE_RESOURCE_REASONING' : costPriorExplains ? 'ZERO_COST_PRIOR_ONLY' : 'MIXED';
  return nuisanceDependence ? `${base}+ANOTHER_ARTIFACT` : base;
}
