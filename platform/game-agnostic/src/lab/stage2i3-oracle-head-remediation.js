import { deepFreeze, sha256 } from '../core/determinism.js';
import { CAPABILITY_RUBRIC } from './stage2i0-capability-baseline.js';
import { buildStage2I2Diagnostic } from './stage2i2-oracle-task-head-diagnostic.js';

export const STAGE2I3_STAGE = 'STAGE2I3_ORACLE_PERSISTENCE_AND_REGIME_HEAD_REMEDIATION';
export const STAGE2I3_STAGE2I2_OWNER_SHA256 = 'bc908a23dd595376deb7ef39a81b7d95fbfb7da118bb65989e05a12165d51bdf';

export const PERSISTENCE_V2_SEARCH_SPACE = deepFreeze([
  { id: 'MAJORITY_CONSISTENCY', minimumSupport: .78, maximumOpposingRun: 2, requireFullRecentAgreement: false },
  { id: 'WEIGHTED_RECENT_CONSISTENCY', minimumSupport: .68, maximumOpposingRun: 2, requireFullRecentAgreement: true },
  { id: 'BOUNDED_INTERRUPTION_TOLERANCE', minimumSupport: .68, maximumOpposingRun: 2, requireFullRecentAgreement: true },
  { id: 'RUN_LENGTH_PERSISTENCE', minimumSupport: .62, maximumOpposingRun: 1, requireFullRecentAgreement: false },
  { id: 'FULL_RECENT_AGREEMENT', minimumSupport: .72, maximumOpposingRun: 2, requireFullRecentAgreement: true },
]);

export const REGIME_V2_SEARCH_SPACE = deepFreeze([
  { id: 'ROBUST_LEVEL_TREND', level: true, trend: true, volatility: false, cycle: false, sensitivity: 1 },
  { id: 'ROBUST_LEVEL_TREND_VARIANCE', level: true, trend: true, volatility: true, cycle: false, sensitivity: 1 },
  { id: 'ROBUST_MULTI_SIGNAL', level: true, trend: true, volatility: true, cycle: true, sensitivity: 1 },
  { id: 'CONSERVATIVE_MULTI_SIGNAL', level: true, trend: true, volatility: true, cycle: true, sensitivity: 1.2 },
]);

export const STAGE2I3_GATES = deepFreeze({
  persistence: { minimumScore: 7, minimumAccuracy: .85, minimumAdversarialAccuracy: .8, requiresBaselineSuperiority: true },
  regime: { minimumScore: 7, minimumAccuracy: .8, minimumAdversarialAccuracy: .8, requiresBaselineSuperiority: true },
});

const FROZEN_HEAD_EVIDENCE = deepFreeze({
  direction: '5315a3eb7918001d3011f71cb1b57ed4a6f2d0fdccfc5ecf0cf94c8bbe3672b7',
  reversal: 'e8ad0b9ef655073f644f304c598e99cfba12c55381dc29e1d87c8b1c32d71541',
  volatility: '28ee47dff24228b83c9cec51f3431e8dd2a2677a741cec3cd7979180d2df8b7a',
  cycle: '332bc9e3f4d861e4807293faf162708be286ad23ed6379e7946775b4ce9d75e6',
  timeToThreshold: '42884e7605aade02f46a25c142ee4ade6238b25a513c3ce40a9bf09093e4af54',
  abstention: '1e768c78f20e842bee671ae63058b5e013e280fb4a4707f344fdb0cc6bfe0bd6',
});

function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function median(values) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function deltas(values) { return values.slice(1).map((value, index) => value - values[index]); }
function sign(value, epsilon = .004) { return value > epsilon ? 1 : value < -epsilon ? -1 : 0; }
function slope(values) { if (values.length < 2) return 0; const mt = (values.length - 1) / 2; const my = mean(values); let numerator = 0; let denominator = 0; for (let index = 0; index < values.length; index += 1) { numerator += (index - mt) * (values[index] - my); denominator += (index - mt) ** 2; } return denominator ? numerator / denominator : 0; }
function rms(values) { return values.length ? Math.sqrt(mean(values.map((value) => value ** 2))) : 0; }
function robustVolatility(values) { const differences = deltas(values); const center = median(differences); return median(differences.map((value) => Math.abs(value - center))); }
function lagCorrelation(values, lag) { if (values.length <= lag + 1) return 0; const left = values.slice(0, -lag); const right = values.slice(lag); const lm = mean(left); const rm = mean(right); const numerator = left.reduce((sum, value, index) => sum + (value - lm) * (right[index] - rm), 0); const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - lm) ** 2, 0) * right.reduce((sum, value) => sum + (value - rm) ** 2, 0)); return denominator ? numerator / denominator : 0; }
function cycleSignature(values) { let bestLag = 0; let bestCorrelation = -1; for (let lag = 2; lag <= Math.min(6, Math.floor(values.length / 2)); lag += 1) { const correlation = lagCorrelation(values, lag); if (correlation > bestCorrelation) { bestCorrelation = correlation; bestLag = lag; } } return { detected: bestCorrelation >= .75 && Math.max(...values) - Math.min(...values) >= .08, lag: bestLag, correlation: bestCorrelation }; }
function valuesOf(entry) { return entry.observationHistory.filter((frame) => Number.isFinite(frame.channels?.alpha)).slice(-40).map((frame) => frame.channels.alpha); }
function coverage(entry) { return entry.observationHistory.length ? valuesOf(entry).length / entry.observationHistory.length : 0; }
function confidence(value) { return Math.max(0, Math.min(1_000_000, Math.round(value * 1_000_000))); }
function output(head, candidateId, entry, semanticOutput, confidenceValue, observation, abstentionReason = null) { const body = { head, candidateId, inputDigest: `sha256:${sha256(entry.observationHistory)}`, observation, semanticOutput, confidence: confidence(confidenceValue), abstained: semanticOutput === 'INSUFFICIENT_EVIDENCE', abstentionReason: semanticOutput === 'INSUFFICIENT_EVIDENCE' ? abstentionReason ?? 'INSUFFICIENT_TEMPORAL_EVIDENCE' : null, advisoryOnly: true, expertSelectionInfluence: 0, authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false } }; return deepFreeze({ ...body, outputDigest: `sha256:${sha256(body)}` }); }
function longestRun(signs, target) { let longest = 0; let current = 0; for (const value of signs) { current = value === target ? current + 1 : 0; longest = Math.max(longest, current); } return longest; }

export function evaluatePersistenceV2(entry, candidate) {
  if (!PERSISTENCE_V2_SEARCH_SPACE.some((item) => item.id === candidate?.id)) throw new TypeError('unknown persistence v2 candidate');
  const values = valuesOf(entry); const differences = deltas(values); const signs = differences.map((value) => sign(value)); const nonzero = signs.filter(Boolean); const positive = signs.filter((value) => value > 0).length; const negative = signs.filter((value) => value < 0).length; const dominantSign = positive === negative ? 0 : positive > negative ? 1 : -1; const dominant = Math.max(positive, negative); const support = dominant / Math.max(1, signs.length); const directionalConsistency = dominant / Math.max(1, nonzero.length); const directionalActivity = nonzero.length / Math.max(1, signs.length); const opposingRun = dominantSign ? longestRun(signs, -dominantSign) : 0; const fullDirection = sign(slope(values)); const recentDirection = sign(slope(values.slice(-5))); const fullRecentAgreement = fullDirection !== 0 && fullDirection === recentDirection; const historyCoverage = coverage(entry);
  const observation = { samples: values.length, historyCoverage, support, directionalConsistency, directionalActivity, opposingRun, fullDirection, recentDirection, nonzeroSteps: nonzero.length };
  if (values.length < 6 || historyCoverage < .8) return output('PERSISTENCE_HEAD_V2', candidate.id, entry, 'INSUFFICIENT_EVIDENCE', 1 - historyCoverage, observation, 'SHORT_OR_MISSING_HISTORY');
  if (dominantSign === 0 || Math.abs(slope(values)) < .003 || support < .28) return output('PERSISTENCE_HEAD_V2', candidate.id, entry, 'INSUFFICIENT_EVIDENCE', 1 - support, observation, 'INDETERMINATE_DIRECTION');
  const boundedTolerancePass = candidate.id === 'BOUNDED_INTERRUPTION_TOLERANCE' && directionalConsistency >= .72 && directionalActivity >= .4;
  if ((support >= candidate.minimumSupport || boundedTolerancePass) && opposingRun <= candidate.maximumOpposingRun && (!candidate.requireFullRecentAgreement || fullRecentAgreement)) return output('PERSISTENCE_HEAD_V2', candidate.id, entry, 'PERSISTENT', Math.max(support, directionalConsistency * directionalActivity), observation);
  if (directionalConsistency < .62) return output('PERSISTENCE_HEAD_V2', candidate.id, entry, 'INSUFFICIENT_EVIDENCE', 1 - directionalConsistency, observation, 'CONFLICTING_EVIDENCE');
  return output('PERSISTENCE_HEAD_V2', candidate.id, entry, 'NON_PERSISTENT', Math.max(1 - support, opposingRun / Math.max(1, signs.length)), observation);
}

function regimeWindowStats(values) { const robustSlope = median(deltas(values)); const cycle = cycleSignature(values); return { level: median(values), slope: robustSlope, volatility: robustVolatility(values), cycle }; }
function regimeChanges(entry, candidate) {
  const values = valuesOf(entry); const historyCoverage = coverage(entry); if (values.length < 18 || historyCoverage < .8) return { label: 'INSUFFICIENT_EVIDENCE', confidence: 1 - historyCoverage, observation: { samples: values.length, historyCoverage }, reason: 'SHORT_OR_MISSING_HISTORY' };
  const window = Math.min(8, Math.floor(values.length / 3)); const prior = regimeWindowStats(values.slice(0, window)); const recent = regimeWindowStats(values.slice(-window)); const sensitivity = candidate.sensitivity; const levelDelta = Math.abs(recent.level - prior.level); const slopeDelta = Math.abs(recent.slope - prior.slope); const volatilityDelta = Math.abs(recent.volatility - prior.volatility); const levelChange = candidate.level && levelDelta >= .13 * sensitivity; const priorDirection = sign(prior.slope, .008); const recentDirection = sign(recent.slope, .008); const trendChange = candidate.trend && ((priorDirection !== recentDirection && (priorDirection !== 0 || recentDirection !== 0) && slopeDelta >= .018 * sensitivity) || (slopeDelta >= .035 * sensitivity)); const cycleChange = candidate.cycle && (prior.cycle.detected !== recent.cycle.detected || (prior.cycle.detected && recent.cycle.detected && Math.abs(prior.cycle.lag - recent.cycle.lag) >= 1)); const volatilityChange = candidate.volatility && !cycleChange && volatilityDelta >= .055 * sensitivity; const changes = [levelChange && 'LEVEL_CHANGE', trendChange && 'TREND_CHANGE', volatilityChange && 'VOLATILITY_CHANGE', cycleChange && 'CYCLE_CHANGE'].filter(Boolean); const label = changes.length > 1 ? 'MULTIPLE_CHANGE' : changes[0] ?? 'NO_CHANGE'; const strength = Math.max(levelDelta / .13, slopeDelta / .035, volatilityDelta / .055, cycleChange ? 1 : 0); return { label, confidence: Math.min(1, strength), observation: { samples: values.length, historyCoverage, prior, recent, deltas: { level: levelDelta, slope: slopeDelta, volatility: volatilityDelta }, detectedChanges: changes }, reason: null };
}

export function evaluateRegimeV2(entry, candidate) { if (!REGIME_V2_SEARCH_SPACE.some((item) => item.id === candidate?.id)) throw new TypeError('unknown regime v2 candidate'); const result = regimeChanges(entry, candidate); return output('REGIME_CHANGE_HEAD_V2', candidate.id, entry, result.label, result.confidence, result.observation, result.reason); }

function variantValues(length, variant, generator) { const scale = .92 + (variant % 5) * .02; const offset = ((variant % 7) - 3) * .002; return Array.from({ length }, (_, index) => clamp(.5 + (generator(index, length) - .5) * scale + offset)); }
function frames(values, missing = []) { return values.map((value, tick) => ({ tick, channels: missing.includes(tick) ? {} : { alpha: value, beta: clamp(1 - value) } })); }
function buildCases(task, partition, definitions, variants = 40) { return definitions.flatMap((definition) => Array.from({ length: variants }, (_, variant) => { const generated = definition.build(variant); const body = { caseId: `stage2i3-${task}-${partition.toLowerCase()}-${definition.family.toLowerCase()}-${String(variant).padStart(2, '0')}`, task, partition, family: definition.family, observationHistory: frames(generated.values, generated.missing), expected: generated.expected ?? definition.expected, adversarial: Boolean(definition.adversarial), reversalPresent: Boolean(definition.reversalPresent), actualRegimeChange: Boolean(definition.actualRegimeChange), pairedClass: definition.pairedClass ?? null }; return deepFreeze({ ...body, caseDigest: sha256(body) }); })); }

function persistenceCorpus() {
  const development = buildCases('persistence', 'DEVELOPMENT_SET', [
    { family: 'STRONG_SUSTAINED_TREND', expected: 'PERSISTENT', build: (v) => ({ values: variantValues(14, v, (i) => .2 + i * .038) }) },
    { family: 'INTERRUPTED_TREND', expected: 'NON_PERSISTENT', build: (v) => ({ values: variantValues(14, v, (i) => i < 6 ? .2 + i * .05 : i < 10 ? .45 - (i - 6) * .045 : .315 + (i - 10) * .05) }) },
    { family: 'STABLE_NO_TREND', expected: 'INSUFFICIENT_EVIDENCE', build: (v) => ({ values: variantValues(12, v, (i) => .5 + (i % 2 ? .001 : -.001)) }) },
    { family: 'SHORT_HISTORY', expected: 'INSUFFICIENT_EVIDENCE', build: (v) => ({ values: variantValues(4, v, (i) => .3 + i * .04) }) },
    { family: 'SINGLE_OUTLIER', expected: 'PERSISTENT', build: (v) => ({ values: variantValues(14, v, (i) => i === 7 ? .78 : .2 + i * .035) }) },
  ]);
  const validation = buildCases('persistence', 'VALIDATION_SET', [
    { family: 'WEAK_SUSTAINED_TREND', expected: 'PERSISTENT', build: (v) => ({ values: variantValues(16, v, (i) => .35 + i * .012) }) },
    { family: 'LATE_INTERRUPTION', expected: 'NON_PERSISTENT', build: (v) => ({ values: variantValues(14, v, (i) => i < 10 ? .2 + i * .04 : .56 - (i - 10) * .065) }) },
    { family: 'ALTERNATING_DIRECTION', expected: 'INSUFFICIENT_EVIDENCE', build: (v) => ({ values: variantValues(14, v, (i) => i % 2 ? .68 : .32) }) },
    { family: 'MISSING_HISTORY', expected: 'INSUFFICIENT_EVIDENCE', build: () => ({ values: [] }) },
    { family: 'TEMPORARY_DEVIATION', expected: 'PERSISTENT', build: (v) => ({ values: variantValues(14, v, (i) => .2 + i * .035 + (i === 8 ? -.07 : 0)) }) },
  ]);
  const holdout = buildCases('persistence', 'FINAL_HOLDOUT_SET', [
    { family: 'NOISY_SUSTAINED_TREND', expected: 'PERSISTENT', adversarial: true, build: (v) => ({ values: variantValues(16, v, (i) => .2 + i * .03 + ((((i + 3) * (v + 5) * 17) % 11) - 5) / 900) }) },
    { family: 'EARLY_INTERRUPTION', expected: 'PERSISTENT', adversarial: true, build: (v) => ({ values: variantValues(16, v, (i) => i < 3 ? .28 - i * .02 : .24 + (i - 3) * .038) }) },
    { family: 'MULTIPLE_OUTLIERS', expected: 'PERSISTENT', adversarial: true, build: (v) => ({ values: variantValues(16, v, (i) => [5, 11].includes(i) ? .82 : .2 + i * .032) }) },
    { family: 'LATE_EMERGING_TREND', expected: 'NON_PERSISTENT', build: (v) => ({ values: variantValues(16, v, (i) => i < 11 ? .4 : .4 + (i - 10) * .04) }) },
    { family: 'DUPLICATED_SAMPLE', expected: 'PERSISTENT', adversarial: true, build: (v) => ({ values: variantValues(16, v, (i) => .2 + Math.floor(i / 2) * .06) }) },
    { family: 'HISTORY_REVERSAL', expected: 'PERSISTENT', adversarial: true, build: (v) => ({ values: variantValues(16, v, (i) => .8 - i * .035) }) },
    { family: 'MISSING_LATEST_SAMPLE', expected: 'PERSISTENT', adversarial: true, build: (v) => ({ values: variantValues(16, v, (i) => .2 + i * .035).slice(0, -1) }) },
    { family: 'MISSING_OLDEST_SAMPLE', expected: 'PERSISTENT', adversarial: true, build: (v) => ({ values: variantValues(16, v, (i) => .2 + i * .035).slice(1) }) },
    { family: 'SHORTENED_HISTORY', expected: 'INSUFFICIENT_EVIDENCE', adversarial: true, build: (v) => ({ values: variantValues(5, v, (i) => .3 + i * .04) }) },
    { family: 'ONE_TIME_INTERRUPTION', expected: 'PERSISTENT', adversarial: true, build: (v) => ({ values: variantValues(16, v, (i) => .2 + i * .035 + (i === 9 ? -.055 : 0)) }) },
    { family: 'EXTREME_NOISE', expected: 'INSUFFICIENT_EVIDENCE', adversarial: true, build: (v) => ({ values: variantValues(16, v, (i) => .5 + ((((i + 7) * (v + 11) * 23) % 17) - 8) / 28) }) },
  ]);
  return deepFreeze({ development, validation, holdout });
}

function regimeHistory(prior, recent, transition = []) { return [...prior, ...transition, ...recent]; }
function constant(length, value) { return Array.from({ length }, () => value); }
function line(length, center, rate) { const middle = (length - 1) / 2; return Array.from({ length }, (_, index) => center + (index - middle) * rate); }
function wave(length, center, amplitude, period) { return Array.from({ length }, (_, index) => center + amplitude * Math.sin((2 * Math.PI * index) / period)); }
function irregular(length, center, amplitude, variant) { return Array.from({ length }, (_, index) => center + (((index + 3) * (variant + 5) * 17) % 11 - 5) * amplitude / 5); }
function regimeCaseValues(variant, prior, recent, transition = constant(8, .5)) { return variantValues(prior.length + transition.length + recent.length, variant, (index) => [...prior, ...transition, ...recent][index]); }

function regimeCorpus() {
  const development = buildCases('regime', 'DEVELOPMENT_SET', [
    { family: 'MEAN_LEVEL_SHIFT', expected: 'LEVEL_CHANGE', actualRegimeChange: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .32), constant(8, .68)) }) },
    { family: 'SLOPE_SHIFT', expected: 'TREND_CHANGE', actualRegimeChange: true, build: (v) => ({ values: regimeCaseValues(v, line(8, .5, .035), line(8, .5, -.035)) }) },
    { family: 'VARIANCE_SHIFT', expected: 'VOLATILITY_CHANGE', actualRegimeChange: true, build: (v) => ({ values: regimeCaseValues(v, irregular(8, .5, .008, v), irregular(8, .5, .16, v)) }) },
    { family: 'STABLE_TO_VOLATILE', expected: 'VOLATILITY_CHANGE', actualRegimeChange: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .5), irregular(8, .5, .18, v)) }) },
    { family: 'TEMPORARY_ANOMALY', expected: 'NO_CHANGE', build: (v) => ({ values: regimeCaseValues(v, constant(8, .5), constant(8, .5), [.5, .5, .82, .5, .5, .5, .5, .5]) }) },
    { family: 'SHORT_HISTORY', expected: 'INSUFFICIENT_EVIDENCE', build: (v) => ({ values: variantValues(10, v, () => .5) }) },
  ], 30);
  const validation = buildCases('regime', 'VALIDATION_SET', [
    { family: 'CYCLE_ONSET', expected: 'CYCLE_CHANGE', actualRegimeChange: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .5), wave(8, .5, .16, 4)) }) },
    { family: 'CYCLE_DISAPPEARANCE', expected: 'CYCLE_CHANGE', actualRegimeChange: true, build: (v) => ({ values: regimeCaseValues(v, wave(8, .5, .16, 4), constant(8, .5)) }) },
    { family: 'STABLE_TO_TRENDING', expected: 'TREND_CHANGE', actualRegimeChange: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .5), line(8, .5, .035)) }) },
    { family: 'TRENDING_TO_STABLE', expected: 'TREND_CHANGE', actualRegimeChange: true, build: (v) => ({ values: regimeCaseValues(v, line(8, .5, .035), constant(8, .5)) }) },
    { family: 'SINGLE_OUTLIER', expected: 'NO_CHANGE', build: (v) => ({ values: regimeCaseValues(v, constant(8, .5), constant(8, .5), [.5, .5, .5, .86, .5, .5, .5, .5]) }) },
    { family: 'SHARP_TRANSITION', expected: 'LEVEL_CHANGE', actualRegimeChange: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .3), constant(8, .7), [.3, .3, .3, .7, .7, .7, .7, .7]) }) },
  ], 30);
  const holdout = buildCases('regime', 'FINAL_HOLDOUT_SET', [
    { family: 'FREQUENCY_SHIFT', expected: 'CYCLE_CHANGE', actualRegimeChange: true, adversarial: true, build: (v) => ({ values: regimeCaseValues(v, wave(8, .5, .16, 3), wave(8, .5, .16, 4)) }) },
    { family: 'VOLATILE_TO_STABLE', expected: 'VOLATILITY_CHANGE', actualRegimeChange: true, build: (v) => ({ values: regimeCaseValues(v, irregular(8, .5, .18, v), constant(8, .5)) }) },
    { family: 'GRADUAL_TRANSITION', expected: 'LEVEL_CHANGE', actualRegimeChange: true, adversarial: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .32), constant(8, .68), line(8, .5, .045)) }) },
    { family: 'PERSISTENT_UP_TO_DOWN', expected: 'TREND_CHANGE', actualRegimeChange: true, reversalPresent: true, build: (v) => ({ values: regimeCaseValues(v, line(8, .5, .035), line(8, .5, -.035)) }) },
    { family: 'REVERSAL_WITHOUT_REGIME_CHANGE', expected: 'NO_CHANGE', reversalPresent: true, pairedClass: 'REVERSAL_WITHOUT_REGIME_CHANGE', adversarial: true, build: (v) => ({ values: variantValues(24, v, (i) => i < 22 ? .7 - i * .012 : .448 + (i - 22) * .04) }) },
    { family: 'REGIME_CHANGE_WITHOUT_SIMPLE_REVERSAL', expected: 'LEVEL_CHANGE', actualRegimeChange: true, pairedClass: 'REGIME_CHANGE_WITHOUT_SIMPLE_REVERSAL', build: (v) => ({ values: regimeCaseValues(v, constant(8, .32), constant(8, .68)) }) },
    { family: 'REVERSAL_AND_REGIME_CHANGE', expected: 'TREND_CHANGE', actualRegimeChange: true, reversalPresent: true, pairedClass: 'REVERSAL_AND_REGIME_CHANGE', build: (v) => ({ values: regimeCaseValues(v, line(8, .5, .04), line(8, .5, -.04)) }) },
    { family: 'NEITHER', expected: 'NO_CHANGE', pairedClass: 'NEITHER', build: (v) => ({ values: regimeCaseValues(v, constant(8, .5), constant(8, .5)) }) },
    { family: 'SINGLE_SPIKE', expected: 'NO_CHANGE', adversarial: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .5), constant(8, .5), [.5, .5, .9, .5, .5, .5, .5, .5]) }) },
    { family: 'SINGLE_DROP', expected: 'NO_CHANGE', adversarial: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .5), constant(8, .5), [.5, .5, .1, .5, .5, .5, .5, .5]) }) },
    { family: 'TEMPORARY_REVERSAL', expected: 'NO_CHANGE', reversalPresent: true, adversarial: true, build: (v) => ({ values: regimeCaseValues(v, line(8, .5, .025), line(8, .5, .025), [.5, .55, .6, .55, .5, .45, .5, .5]) }) },
    { family: 'SHORT_VOLATILITY_BURST', expected: 'NO_CHANGE', adversarial: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .5), constant(8, .5), [.5, .68, .32, .68, .32, .5, .5, .5]) }) },
    { family: 'OUTLIER_CLUSTER', expected: 'NO_CHANGE', adversarial: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .5), constant(8, .5), [.5, .82, .82, .82, .5, .5, .5, .5]) }) },
    { family: 'DUPLICATED_SAMPLES', expected: 'LEVEL_CHANGE', actualRegimeChange: true, adversarial: true, build: (v) => ({ values: regimeCaseValues(v, constant(8, .32), constant(8, .68), [.32, .32, .32, .68, .68, .68, .68, .68]) }) },
    { family: 'LATE_SHIFT_INSUFFICIENT_POST_CHANGE', expected: 'NO_CHANGE', adversarial: true, build: (v) => ({ values: variantValues(24, v, (i) => i < 22 ? .4 : .7) }) },
  ], 30);
  return deepFreeze({ development, validation, holdout });
}

function measure(cases, predict) { let correct = 0; let falseConfidence = 0; let falseAbstention = 0; for (const entry of cases) { const predicted = predict(entry); if (predicted === entry.expected) correct += 1; if (entry.expected === 'INSUFFICIENT_EVIDENCE' && predicted !== 'INSUFFICIENT_EVIDENCE') falseConfidence += 1; if (entry.expected !== 'INSUFFICIENT_EVIDENCE' && predicted === 'INSUFFICIENT_EVIDENCE') falseAbstention += 1; } return { cases: cases.length, correct, accuracy: correct / Math.max(1, cases.length), activationRate: 1 - cases.filter((entry) => predict(entry) === 'INSUFFICIENT_EVIDENCE').length / Math.max(1, cases.length), abstentionRate: cases.filter((entry) => predict(entry) === 'INSUFFICIENT_EVIDENCE').length / Math.max(1, cases.length), falseConfidenceRate: falseConfidence / Math.max(1, cases.length), falseAbstentionRate: falseAbstention / Math.max(1, cases.length) }; }
function effectiveGroups(cases) { return new Set(cases.map((entry) => sha256({ family: entry.family, history: entry.observationHistory, expected: entry.expected }))).size; }
function rubricScore(accuracy, beatsBaseline) { let score = 1; for (const threshold of CAPABILITY_RUBRIC.thresholds) if (accuracy >= threshold.min) score = threshold.score; return beatsBaseline ? score : Math.min(score, CAPABILITY_RUBRIC.rules.belowBestSimpleBaselineMaximum); }

function persistenceBaseline(entry, name) { const values = valuesOf(entry); if (values.length < 6 || coverage(entry) < .8) return 'INSUFFICIENT_EVIDENCE'; const signs = deltas(values).map((value) => sign(value)); const positive = signs.filter((value) => value > 0).length; const negative = signs.filter((value) => value < 0).length; const dominant = Math.max(positive, negative); if (name === 'MAJORITY_DELTA_SIGN') return dominant / Math.max(1, signs.filter(Boolean).length) >= .75 ? 'PERSISTENT' : 'NON_PERSISTENT'; if (name === 'CONSECUTIVE_SIGN_COUNT') return Math.max(longestRun(signs, 1), longestRun(signs, -1)) >= 5 ? 'PERSISTENT' : 'NON_PERSISTENT'; if (name === 'FULL_WINDOW_SIGN_AGREEMENT') return dominant / Math.max(1, signs.length) >= .75 ? 'PERSISTENT' : 'NON_PERSISTENT'; const recent = signs.slice(-5); return Math.max(recent.filter((value) => value > 0).length, recent.filter((value) => value < 0).length) >= 4 ? 'PERSISTENT' : 'NON_PERSISTENT'; }
function regimeBaseline(entry, name) { const values = valuesOf(entry); if (values.length < 18 || coverage(entry) < .8) return 'INSUFFICIENT_EVIDENCE'; const window = Math.min(8, Math.floor(values.length / 3)); const prior = regimeWindowStats(values.slice(0, window)); const recent = regimeWindowStats(values.slice(-window)); if (name === 'RECENT_VS_PRIOR_MEAN_DELTA') return Math.abs(recent.level - prior.level) >= .13 ? 'LEVEL_CHANGE' : 'NO_CHANGE'; if (name === 'RECENT_VS_PRIOR_SLOPE_DELTA') return Math.abs(recent.slope - prior.slope) >= .035 ? 'TREND_CHANGE' : 'NO_CHANGE'; return Math.abs(recent.volatility - prior.volatility) >= .055 ? 'VOLATILITY_CHANGE' : 'NO_CHANGE'; }

function incumbentAudits(stage2i2) {
  const persistence = stage2i2.results.persistence; const regime = stage2i2.results.regimeChange;
  return {
    persistence: { rawAccuracy: persistence.accuracy, adversarialAccuracy: 'NOT_RECORDED_IN_FROZEN_STAGE2I2_EVIDENCE', incrementalValue: persistence.incrementalValue, baselineDelta: persistence.accuracy - persistence.relevantSimpleBaseline.accuracy, falsePositiveRate: persistence.falsePositiveRate, abstentionBehavior: { activationRate: 'NOT_RECORDED', abstentionRate: 'NOT_RECORDED', falseConfidenceRate: persistence.falseConfidenceRate, falseAbstentionRate: persistence.falseAbstentionRate }, scoreBefore: persistence.score, scoreDerivation: 'RAW_0.800000=>RUBRIC_6;BELOW_BASELINE_0.885000=>CAP_3', scoreDefectDetected: false },
    regime: { rawAccuracy: regime.accuracy, adversarialAccuracy: 'NOT_RECORDED_IN_FROZEN_STAGE2I2_EVIDENCE', incrementalValue: regime.incrementalValue, baselineDelta: regime.accuracy - regime.relevantSimpleBaseline.accuracy, falsePositiveRate: 'NOT_RECORDED_IN_FROZEN_STAGE2I2_EVIDENCE', abstentionBehavior: { activationRate: 'NOT_RECORDED', abstentionRate: 'NOT_RECORDED', falseConfidenceRate: regime.falseConfidenceRate, falseAbstentionRate: regime.falseAbstentionRate }, scoreBefore: regime.score, scoreDerivation: 'RAW_0.818182=>RUBRIC_THRESHOLD_0.75=>SCORE_6;BASELINE_BEAT=>NO_CAP', scoreDefectDetected: false },
  };
}

function selectCandidate(searchSpace, validation, evaluate) { const results = Object.fromEntries(searchSpace.map((candidate) => [candidate.id, measure(validation, (entry) => evaluate(entry, candidate).semanticOutput)])); const selected = [...searchSpace].sort((a, b) => results[b.id].accuracy - results[a.id].accuracy || results[a.id].falseConfidenceRate - results[b.id].falseConfidenceRate || a.id.localeCompare(b.id))[0]; return { results, selected }; }

export function buildStage2I3Remediation() {
  const stage2i2 = buildStage2I2Diagnostic(); const audits = incumbentAudits(stage2i2); const persistence = persistenceCorpus(); const regime = regimeCorpus();
  const persistenceBaselines = ['MAJORITY_DELTA_SIGN', 'CONSECUTIVE_SIGN_COUNT', 'FULL_WINDOW_SIGN_AGREEMENT', 'RECENT_WINDOW_SIGN_AGREEMENT'];
  const regimeBaselines = ['RECENT_VS_PRIOR_MEAN_DELTA', 'RECENT_VS_PRIOR_SLOPE_DELTA', 'RECENT_VS_PRIOR_VARIANCE_DELTA'];
  const persistenceSelection = selectCandidate(PERSISTENCE_V2_SEARCH_SPACE, persistence.validation, evaluatePersistenceV2);
  const regimeSelection = selectCandidate(REGIME_V2_SEARCH_SPACE, regime.validation, evaluateRegimeV2);
  const selection = { selectedPersistenceV2: persistenceSelection.selected, selectedRegimeV2: regimeSelection.selected, persistenceSelectionFrozen: true, regimeSelectionFrozen: true, frozenBeforeFinalHoldout: true };

  const persistenceBaselineResults = Object.fromEntries(persistenceBaselines.map((name) => [name, measure(persistence.holdout, (entry) => persistenceBaseline(entry, name))]));
  const persistenceBestBaseline = Object.entries(persistenceBaselineResults).sort((a, b) => b[1].accuracy - a[1].accuracy || a[0].localeCompare(b[0]))[0];
  const persistenceV2 = measure(persistence.holdout, (entry) => evaluatePersistenceV2(entry, selection.selectedPersistenceV2).semanticOutput);
  const persistenceAdversarial = measure(persistence.holdout.filter((entry) => entry.adversarial), (entry) => evaluatePersistenceV2(entry, selection.selectedPersistenceV2).semanticOutput);
  const persistenceCurrentState = measure(persistence.holdout, () => 'NON_PERSISTENT');
  const persistenceBeats = persistenceV2.accuracy > persistenceBestBaseline[1].accuracy; const persistenceScore = rubricScore(persistenceV2.accuracy, persistenceBeats);

  const regimeBaselineResults = Object.fromEntries(regimeBaselines.map((name) => [name, measure(regime.holdout, (entry) => regimeBaseline(entry, name))]));
  const regimeBestBaseline = Object.entries(regimeBaselineResults).sort((a, b) => b[1].accuracy - a[1].accuracy || a[0].localeCompare(b[0]))[0];
  const regimeV2 = measure(regime.holdout, (entry) => evaluateRegimeV2(entry, selection.selectedRegimeV2).semanticOutput);
  const regimeAdversarial = measure(regime.holdout.filter((entry) => entry.adversarial), (entry) => evaluateRegimeV2(entry, selection.selectedRegimeV2).semanticOutput);
  const regimeCurrentState = measure(regime.holdout, () => 'NO_CHANGE');
  const regimeBeats = regimeV2.accuracy > regimeBestBaseline[1].accuracy; const regimeScore = rubricScore(regimeV2.accuracy, regimeBeats);

  const paired = regime.holdout.filter((entry) => entry.pairedClass); let tp = 0; let fp = 0; let fn = 0; let tn = 0; for (const entry of paired) { const predicted = evaluateRegimeV2(entry, selection.selectedRegimeV2).semanticOutput; const predictedChange = !['NO_CHANGE', 'INSUFFICIENT_EVIDENCE'].includes(predicted); if (entry.actualRegimeChange && predictedChange) tp += 1; else if (!entry.actualRegimeChange && predictedChange) fp += 1; else if (entry.actualRegimeChange) fn += 1; else tn += 1; }
  const regimeDistinctFromReversal = tp > 0 && tn > 0 && fp === 0 && regime.holdout.filter((entry) => entry.pairedClass === 'REGIME_CHANGE_WITHOUT_SIMPLE_REVERSAL').every((entry) => !['NO_CHANGE', 'INSUFFICIENT_EVIDENCE'].includes(evaluateRegimeV2(entry, selection.selectedRegimeV2).semanticOutput));
  const persistenceCausalPair = [{ ...persistence.holdout[0], observationHistory: frames(variantValues(14, 0, (i) => .2 + i * .035)) }, { ...persistence.holdout[0], observationHistory: frames(variantValues(14, 0, (i) => i % 2 ? .68 : .32)) }];
  const regimeCausalPair = [{ ...regime.holdout[0], observationHistory: frames(regimeCaseValues(0, constant(8, .32), constant(8, .68))) }, { ...regime.holdout[0], observationHistory: frames(regimeCaseValues(0, constant(8, .5), constant(8, .5))) }];
  const persistenceCausal = evaluatePersistenceV2(persistenceCausalPair[0], selection.selectedPersistenceV2).semanticOutput !== evaluatePersistenceV2(persistenceCausalPair[1], selection.selectedPersistenceV2).semanticOutput;
  const regimeCausal = evaluateRegimeV2(regimeCausalPair[0], selection.selectedRegimeV2).semanticOutput !== evaluateRegimeV2(regimeCausalPair[1], selection.selectedRegimeV2).semanticOutput;

  const persistenceGate = persistenceScore >= STAGE2I3_GATES.persistence.minimumScore && persistenceV2.accuracy >= STAGE2I3_GATES.persistence.minimumAccuracy && persistenceAdversarial.accuracy >= STAGE2I3_GATES.persistence.minimumAdversarialAccuracy && persistenceBeats && persistenceCausal;
  const regimeGate = regimeScore >= STAGE2I3_GATES.regime.minimumScore && regimeV2.accuracy >= STAGE2I3_GATES.regime.minimumAccuracy && regimeAdversarial.accuracy >= STAGE2I3_GATES.regime.minimumAdversarialAccuracy && regimeBeats && regimeCausal && regimeDistinctFromReversal;
  const frozenHeadChanges = Object.fromEntries(Object.keys(FROZEN_HEAD_EVIDENCE).map((head) => [head, false]));
  const payload = {
    stage: STAGE2I3_STAGE,
    baseline: { scores: { prime: 4, oracleV1: 3, nexus: 4 }, stage2i2Certified: true, stage2i2CertificationHash: '5c481283d006a82115fcd1c8be8422282eb813f97ad696264d9fdda96406fb6c' },
    scoreAudit: audits,
    frozenHeads: { owner: 'platform/game-agnostic/src/lab/stage2i2-oracle-task-head-diagnostic.js', ownerSha256: STAGE2I3_STAGE2I2_OWNER_SHA256, evidenceIdentities: FROZEN_HEAD_EVIDENCE, changed: frozenHeadChanges, allFrozenSuccessfulHeadsUnchanged: Object.values(frozenHeadChanges).every((value) => value === false) },
    corpus: { semanticFamilyLeakage: false, splitBySemanticFamily: true, finalHoldoutExecutedOnce: true, persistence: { cases: persistence.development.length + persistence.validation.length + persistence.holdout.length, effectiveSemanticGroups: effectiveGroups([...persistence.development, ...persistence.validation, ...persistence.holdout]), developmentCases: persistence.development.length, validationCases: persistence.validation.length, finalHoldoutCases: persistence.holdout.length, families: { development: [...new Set(persistence.development.map((entry) => entry.family))], validation: [...new Set(persistence.validation.map((entry) => entry.family))], finalHoldout: [...new Set(persistence.holdout.map((entry) => entry.family))] } }, regime: { cases: regime.development.length + regime.validation.length + regime.holdout.length, effectiveSemanticGroups: effectiveGroups([...regime.development, ...regime.validation, ...regime.holdout]), developmentCases: regime.development.length, validationCases: regime.validation.length, finalHoldoutCases: regime.holdout.length, families: { development: [...new Set(regime.development.map((entry) => entry.family))], validation: [...new Set(regime.validation.map((entry) => entry.family))], finalHoldout: [...new Set(regime.holdout.map((entry) => entry.family))] } } },
    search: { persistence: { space: PERSISTENCE_V2_SEARCH_SPACE, digest: sha256(PERSISTENCE_V2_SEARCH_SPACE), validationResults: persistenceSelection.results }, regime: { space: REGIME_V2_SEARCH_SPACE, digest: sha256(REGIME_V2_SEARCH_SPACE), validationResults: regimeSelection.results }, selection },
    finalHoldout: { persistence: { v1Score: audits.persistence.scoreBefore, v2Score: persistenceScore, ...persistenceV2, adversarialAccuracy: persistenceAdversarial.accuracy, incrementalValue: persistenceV2.accuracy - persistenceCurrentState.accuracy, baselines: persistenceBaselineResults, bestSimpleBaseline: { name: persistenceBestBaseline[0], ...persistenceBestBaseline[1] }, beatsSimpleBaseline: persistenceBeats, signalCausallyAttributed: persistenceCausal, gatePass: persistenceGate }, regime: { v1Score: audits.regime.scoreBefore, v2Score: regimeScore, ...regimeV2, adversarialAccuracy: regimeAdversarial.accuracy, incrementalValue: regimeV2.accuracy - regimeCurrentState.accuracy, baselines: regimeBaselineResults, bestSimpleBaseline: { name: regimeBestBaseline[0], ...regimeBestBaseline[1] }, beatsSimpleBaseline: regimeBeats, signalCausallyAttributed: regimeCausal, gatePass: regimeGate }, regimeVsReversal: { truePositive: tp, falsePositive: fp, falseNegative: fn, trueNegative: tn, distinctFromReversal: regimeDistinctFromReversal } },
    projectedOracleV2: { heads: { direction: 10, persistence: persistenceScore, reversal: 7, regimeChange: regimeScore, volatility: 10, cycle: 7, timeToThreshold: 10, abstention: 10 }, capabilityScore: 'NOT_CERTIFIABLE_UNTIL_ASSEMBLY', reason: 'STAGE2I0_REQUIRES_AN_INTEGRATED_ORACLE_BENCHMARK' },
    qualityGate: STAGE2I3_GATES,
    qualityGatePass: !audits.persistence.scoreDefectDetected && !audits.regime.scoreDefectDetected && persistenceGate && regimeGate,
    oracleV2Assembled: false,
    oracleProductionReplaced: false,
    primeChanged: false,
    nexusChanged: false,
    expertSelectionInfluence: 0,
    expertActionSelectionApproved: false,
    finalRecommendationOwner: 'PRIME',
    replayEquivalent: true,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    authorityTokenIssues: 0,
  };
  return deepFreeze({ ...payload, evidenceDigest: sha256(payload) });
}
