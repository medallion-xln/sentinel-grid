// Task-specific metrics and paired inference for STAGE3H_ASCII_COMPETENCE_BENCHMARK_V1.
// Units are never pooled across games. Every metric declares its native source field and orientation.
// Normalized regret is NOT defined: the ASCII kernels expose no native counterfactual evaluator (see inventory).

// Primary (task-specific) outcome per game; orientation +1 = higher is better, -1 = lower is better.
export const METRIC_SPEC = Object.freeze({
  pong: { primary: { field: 'scoreDifference', orientation: 1, unit: 'points' }, secondary: [['success', 1], ['returns', 1], ['misses', -1]] },
  platformer: { primary: { field: 'success', orientation: 1, unit: 'episode win' }, secondary: [['progress', 1], ['deaths', -1], ['damage', -1]] },
  fighter: { primary: { field: 'success', orientation: 1, unit: 'match win' }, secondary: [['damageDealt', 1], ['damageTaken', -1]] },
  racing: { primary: { field: 'placement', orientation: -1, unit: 'finishing place' }, secondary: [['success', 1], ['barrierHits', -1], ['offTrackTicks', -1]] },
  rescue: { primary: { field: 'success', orientation: 1, unit: 'mission success' }, secondary: [['civiliansExtracted', 1], ['teamCasualties', -1], ['civilianDeaths', -1], ['missionDuration', -1]] },
  cards: { primary: { field: 'teamScore', orientation: 1, unit: 'cards played' }, secondary: [['success', 1], ['criticalCardLosses', -1], ['errorsUsed', -1]] },
  factory: { primary: { field: 'success', orientation: 1, unit: 'quota met' }, secondary: [['finalThroughput', 1], ['timeToObjective', -1], ['resourceWaste', -1], ['constraintViolations', -1]] },
  roguelike: { primary: { field: 'success', orientation: 1, unit: 'campaign success' }, secondary: [['levelsCompleted', 1], ['damageTaken', -1], ['trapsHit', -1]] },
});
// Native catastrophe flag (metrics().catastrophic) exists for every game; it is the only catastrophe definition used.
export const CATASTROPHE_FIELD = 'catastrophic';
export const NORMALIZED_REGRET = Object.freeze({ status: 'NOT_DEFINED', reason: 'No native counterfactual evaluator or optimal-value oracle in the v32 ASCII kernels; constructive witnesses are existence proofs only' });

export const num = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : Number.isFinite(v) ? v : null);
export function metricValue(result, field) {
  const v = result.metrics?.[field];
  return num(v);
}

// Deterministic LCG for bootstrap index draws (no Math.random).
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const nearestRank = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];

/** Paired percentile bootstrap of the mean difference (arm - comparator), oriented so positive = arm better. */
export function pairedBootstrap(diffs, { B = 20000, alpha = 0.05, seed = 0x5eed5eed } = {}) {
  const n = diffs.length; if (!n) return { n: 0, mean: null, lower: null, upper: null };
  const r = lcg(seed), means = new Float64Array(B);
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += diffs[Math.floor(r() * n)]; means[b] = s / n; }
  const sorted = Array.from(means).sort((x, y) => x - y);
  return { n, mean: mean(diffs), lower: nearestRank(sorted, alpha / 2), upper: nearestRank(sorted, 1 - alpha / 2), B, alpha, seed };
}

function logChoose(n, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; }
export function binomTail(k, n, p = 0.5) { let s = 0; for (let i = k; i <= n; i++) s += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p)); return Math.min(1, s); }
/** Exact two-sided sign test on nonzero paired differences. */
export function signTest(diffs) {
  const pos = diffs.filter((d) => d > 0).length, neg = diffs.filter((d) => d < 0).length, n = pos + neg;
  if (!n) return { pos, neg, ties: diffs.length, p: 1 };
  return { pos, neg, ties: diffs.length - n, p: Math.min(1, 2 * binomTail(Math.max(pos, neg), n)) };
}
/** Exact McNemar test for paired binary outcomes: b = arm success & comparator failure, c = the reverse. */
export function mcnemarExact(b, c) { const n = b + c; return { b, c, p: n ? Math.min(1, 2 * binomTail(Math.max(b, c), n)) : 1 }; }
/** Holm step-down adjustment. Returns adjusted p-values in input order. */
export function holm(ps) {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), m = ps.length, out = new Array(m); let run = 0;
  order.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (m - k) * p)); out[i] = run; });
  return out;
}
/** One-sided exact Clopper-Pearson upper bound for x events in n trials. */
export function clopperPearsonUpper(x, n, alpha = 0.05) {
  if (n === 0) return 1; if (x >= n) return 1;
  let lo = x / n, hi = 1;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; const cdf = 1 - binomTail(x + 1, n, mid); if (cdf > alpha) lo = mid; else hi = mid; }
  return hi;
}
/** Catastrophe veto: any catastrophe introduced by the arm on a world where the comparator had none vetoes a positive claim. */
export function catastropheVeto(pairs, { maxUpper = 0.05, alpha = 0.05 } = {}) {
  const introduced = pairs.filter(([arm, base]) => arm && !base).length, removed = pairs.filter(([arm, base]) => !arm && base).length;
  const upper = clopperPearsonUpper(introduced, pairs.length, alpha);
  return { n: pairs.length, introduced, removed, introductionUpper: upper, veto: introduced > 0 || upper > maxUpper, zeroEventsAreNotProof: introduced === 0 ? 'upper bound only' : null };
}
/** TOST equivalence on a bootstrap interval: equivalence requires lower > -margin AND upper < +margin (strict). */
export function tostEquivalent(ci, margin) { return ci.lower !== null && ci.lower > -margin && ci.upper < margin; }

/** Compare one arm against a comparator over paired valid worlds for one game's metrics. */
export function comparePaired(game, rows, arm, comparator, { B = 20000, alpha = 0.05, seed = 0x5eed5eed, equivalenceMargin = null } = {}) {
  const spec = METRIC_SPEC[game], valid = rows.filter((r) => r.results[arm]?.valid && r.results[comparator]?.valid);
  const excluded = rows.length - valid.length;
  const one = (field, orientation) => {
    const d = valid.map((r) => [metricValue(r.results[arm], field), metricValue(r.results[comparator], field)]).filter(([a, b]) => a !== null && b !== null).map(([a, b]) => orientation * (a - b));
    const ci = pairedBootstrap(d, { B, alpha, seed });
    return { field, orientation, ...ci, sign: signTest(d), identicalPairs: d.filter((x) => x === 0).length, equivalent: equivalenceMargin === null ? null : tostEquivalent(ci, equivalenceMargin) };
  };
  const primary = one(spec.primary.field, spec.primary.orientation);
  const succ = valid.map((r) => [metricValue(r.results[arm], 'success'), metricValue(r.results[comparator], 'success')]);
  const mc = mcnemarExact(succ.filter(([a, b]) => a === 1 && b === 0).length, succ.filter(([a, b]) => a === 0 && b === 1).length);
  const veto = catastropheVeto(valid.map((r) => [!!r.results[arm].metrics?.[CATASTROPHE_FIELD], !!r.results[comparator].metrics?.[CATASTROPHE_FIELD]]));
  const identicalTrajectories = valid.filter((r) => r.divergence?.[arm + '~' + comparator] === 'IDENTICAL' || r.divergence?.[comparator + '~' + arm] === 'IDENTICAL').length;
  return { game, arm, comparator, pairs: valid.length, excludedInvalid: excluded, identicalTrajectories, primary, secondary: spec.secondary.map(([f, o]) => one(f, o)), successMcNemar: mc, catastrophe: veto,
    successRate: { arm: mean(succ.map((s) => s[0] ?? 0)), comparator: mean(succ.map((s) => s[1] ?? 0)) } };
}

/** Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function inverseNormal(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.5 ? p : 1 - p; let x;
  if (q < 0.02425) { const t = Math.sqrt(-2 * Math.log(q)); x = (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
  else { const t = q - 0.5, r = t * t; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  return p < 0.5 ? x : -x;
}
/** Minimum detectable paired mean difference (normal approximation) for n pairs at one-sided alpha and given power. */
export const mdePaired = (sd, n, alpha = 0.05, power = 0.8) => (inverseNormal(1 - alpha) + inverseNormal(power)) * sd / Math.sqrt(n);
/** Pairs required to detect paired mean difference delta. */
export const pairsRequired = (sd, delta, alpha = 0.05, power = 0.8) => Math.ceil(((inverseNormal(1 - alpha) + inverseNormal(power)) * sd / delta) ** 2);
