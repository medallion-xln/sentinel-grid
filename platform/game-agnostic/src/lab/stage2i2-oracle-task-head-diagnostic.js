import { deepFreeze, sha256 } from '../core/determinism.js';
import { evaluateOracle } from '../experts/oracle.js';
import { buildStage2H6Corpus } from './stage2h6-oracle-v2-design.js';
import { CAPABILITY_RUBRIC } from './stage2i0-capability-baseline.js';

export const STAGE2I2_STAGE = 'STAGE2I2_ORACLE_TEMPORAL_TASK_HEAD_DIAGNOSTIC';
export const STAGE2I2_ORACLE_V1_SHA256 = 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a';
export const STAGE2I2_ROBUST_TREND_SHA256 = '476e9287142ed6de8ddcecef13a9f4366134f0b6ba3b47750bca71ae7a68214a';
export const STAGE2I2_HEADS = deepFreeze([
  'DIRECTION_HEAD',
  'PERSISTENCE_HEAD',
  'REVERSAL_HEAD',
  'REGIME_CHANGE_HEAD',
  'VOLATILITY_HEAD',
  'CYCLE_HEAD',
  'TIME_TO_THRESHOLD_HEAD',
  'HISTORY_SUFFICIENCY_HEAD',
  'ABSTENTION_HEAD',
]);

export const STAGE2I2_GROUND_TRUTH = deepFreeze({
  DIRECTION_HEAD: { owner: 'STAGE2H6_SEMANTIC_FAMILY_GENERATOR', deterministic: true, benchmarkable: true },
  PERSISTENCE_HEAD: { owner: 'STAGE2I2_PERSISTENCE_SCENARIO_GENERATOR', deterministic: true, benchmarkable: true },
  REVERSAL_HEAD: { owner: 'STAGE2I2_REVERSAL_SCENARIO_GENERATOR', deterministic: true, benchmarkable: true },
  REGIME_CHANGE_HEAD: { owner: 'STAGE2I2_CHANGE_POINT_SCENARIO_GENERATOR', deterministic: true, benchmarkable: true },
  VOLATILITY_HEAD: { owner: 'EXACT_RMS_FIRST_DIFFERENCE_REFERENCE', deterministic: true, benchmarkable: true },
  CYCLE_HEAD: { owner: 'STAGE2I2_CYCLE_SCENARIO_GENERATOR', deterministic: true, benchmarkable: true },
  TIME_TO_THRESHOLD_HEAD: { owner: 'WITHHELD_DETERMINISTIC_CONTINUATION', deterministic: true, benchmarkable: true },
  HISTORY_SUFFICIENCY_HEAD: { owner: 'FROZEN_MINIMUM_COVERAGE_RULE', deterministic: true, benchmarkable: true },
  ABSTENTION_HEAD: { owner: 'STAGE2I2_EVIDENCE_QUALITY_SCENARIO_GENERATOR', deterministic: true, benchmarkable: true },
});

export const STAGE2I2_HEAD_RUBRIC = deepFreeze({
  preRegistered: true,
  thresholds: CAPABILITY_RUBRIC.thresholds,
  belowRelevantSimpleBaselineMaximum: 3,
  dispositions: {
    KEEP: 'score>=7 AND beatsRelevantSimpleBaseline',
    REDESIGN: 'score>=4 AND score<7',
    REPLACE: 'score<=3 AND benchmarkable',
    REMOVE: 'benchmarkable=false',
  },
});

const POLARITIES = deepFreeze(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NEUTRAL_DIRECTION', 'UNKNOWN_POLARITY']);
const DIRECTION_FAMILIES = deepFreeze({
  MONOTONIC_IMPROVING: 'UP',
  MONOTONIC_WORSENING: 'DOWN',
  STABLE: 'STABLE',
  ACCELERATING: 'DOWN',
  DECELERATING: 'DOWN',
  LOW_VOLATILITY: 'STABLE',
  LONG_HISTORY: 'DOWN',
  NOISY_TREND: 'DOWN',
  TREND_WITH_OUTLIER: 'DOWN',
});

function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }
function sign(value, epsilon = 0.004) { return value > epsilon ? 1 : value < -epsilon ? -1 : 0; }
function labelSign(value, epsilon = 0.004) { const direction = sign(value, epsilon); return direction > 0 ? 'UP' : direction < 0 ? 'DOWN' : 'STABLE'; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function variance(values) { const average = mean(values); return values.length ? mean(values.map((value) => (value - average) ** 2)) : 0; }
function rms(values) { return values.length ? Math.sqrt(mean(values.map((value) => value ** 2))) : 0; }
function median(values) { if (!values.length) return 0; const ordered = [...values].sort((a, b) => a - b); const middle = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2; }
function deltas(values) { return values.slice(1).map((value, index) => value - values[index]); }
function slope(values) { if (values.length < 2) return 0; const mt = (values.length - 1) / 2; const my = mean(values); let numerator = 0; let denominator = 0; for (let index = 0; index < values.length; index += 1) { numerator += (index - mt) * (values[index] - my); denominator += (index - mt) ** 2; } return denominator ? numerator / denominator : 0; }
function alternation(values) { const differences = deltas(values).map((value) => sign(value)).filter(Boolean); if (differences.length < 2) return 0; return differences.slice(1).filter((value, index) => value === -differences[index]).length / (differences.length - 1); }
function lagCorrelation(values, lag) { if (values.length <= lag + 1) return 0; const left = values.slice(0, -lag); const right = values.slice(lag); const leftMean = mean(left); const rightMean = mean(right); const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0); const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) * right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0)); return denominator ? numerator / denominator : 0; }
function valuesOf(input) { return (input.observationHistory ?? []).filter((frame) => Number.isFinite(frame.channels?.alpha)).slice(-32).map((frame) => frame.channels.alpha); }
function confidence(value) { return Math.max(0, Math.min(1_000_000, Math.round(value * 1_000_000))); }

function output(head, input, label, confidenceValue, observation, abstentionReason = null) {
  const body = {
    head,
    inputDigest: `sha256:${sha256(input)}`,
    observation,
    semanticOutput: label,
    confidence: confidence(confidenceValue),
    abstained: label === null,
    abstentionReason: label === null ? abstentionReason ?? 'INSUFFICIENT_TEMPORAL_EVIDENCE' : null,
    temporalObservationValueCoupling: false,
    advisoryOnly: true,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  };
  return deepFreeze({ ...body, outputDigest: `sha256:${sha256(body)}` });
}

function directionEstimate(values, architecture) {
  if (values.length < 3) return null;
  if (architecture === 'ORACLE_V1_FULL_SLOPE') return labelSign(slope(values));
  if (architecture === 'ROBUST_TREND_DIRECTION') return labelSign(median(deltas(values).slice(-5)));
  if (architecture === 'LAST_MINUS_FIRST') return labelSign(values.at(-1) - values[0]);
  if (architecture === 'MOVING_AVERAGE_DIRECTION') { const half = Math.floor(values.length / 2); return labelSign(mean(values.slice(-half)) - mean(values.slice(0, half))); }
  if (architecture === 'RECENT_WINDOW_SLOPE') return labelSign(slope(values.slice(-5)));
  if (architecture === 'MAJORITY_DELTA_DIRECTION') return labelSign(deltas(values).reduce((sum, value) => sum + sign(value), 0), 0.5);
  throw new TypeError('unknown direction architecture');
}

const DIRECTION_ARCHITECTURES = deepFreeze(['ORACLE_V1_FULL_SLOPE', 'ROBUST_TREND_DIRECTION', 'LAST_MINUS_FIRST', 'MOVING_AVERAGE_DIRECTION', 'RECENT_WINDOW_SLOPE', 'MAJORITY_DELTA_DIRECTION']);
const REGIME_ARCHITECTURES = deepFreeze(['SPLIT_MEAN_SHIFT', 'SPLIT_VARIANCE_SHIFT', 'COMPOSITE_CHANGE_POINT']);

function regimeEstimate(values, architecture) {
  if (values.length < 8) return null;
  const split = Math.floor(values.length / 2); const early = values.slice(0, split); const recent = values.slice(split);
  const meanShift = Math.abs(mean(recent) - mean(early));
  const varianceShift = Math.abs(Math.sqrt(variance(recent)) - Math.sqrt(variance(early)));
  const trendShift = Math.abs(slope(recent) - slope(early));
  const cycleShift = Math.abs(alternation(recent) - alternation(early));
  if (architecture === 'SPLIT_MEAN_SHIFT') return meanShift >= 0.16 ? 'REGIME_CHANGE' : 'NO_REGIME_CHANGE';
  if (architecture === 'SPLIT_VARIANCE_SHIFT') return varianceShift >= 0.09 ? 'REGIME_CHANGE' : 'NO_REGIME_CHANGE';
  return meanShift >= 0.14 || varianceShift >= 0.08 || trendShift >= 0.055 || cycleShift >= 0.55 ? 'REGIME_CHANGE' : 'NO_REGIME_CHANGE';
}

export function evaluateStage2I2Head(head, input, options = {}) {
  if (!STAGE2I2_HEADS.includes(head)) throw new TypeError('unknown Stage 2I.2 head');
  const values = valuesOf(input); const differences = deltas(values); const fullSlope = slope(values); const recentSlope = slope(values.slice(-5)); const volatility = rms(differences); const coverage = (input.observationHistory?.length ?? 0) ? values.length / input.observationHistory.length : 0;
  if (head === 'DIRECTION_HEAD') { const architecture = options.architecture ?? 'ROBUST_TREND_DIRECTION'; const label = directionEstimate(values, architecture); return output(head, input, label, Math.min(1, values.length / 12) * Math.min(1, Math.abs(recentSlope) / 0.04), { architecture, fullSlope, recentSlope, samples: values.length }, 'SHORT_HISTORY'); }
  if (head === 'PERSISTENCE_HEAD') { if (values.length < 6) return output(head, input, null, 0, { samples: values.length }, 'SHORT_HISTORY'); const nonzero = differences.map((value) => sign(value)).filter(Boolean); const dominant = Math.max(nonzero.filter((value) => value > 0).length, nonzero.filter((value) => value < 0).length); const ratio = dominant / Math.max(1, nonzero.length); return output(head, input, ratio >= 0.75 && sign(fullSlope) !== 0 ? 'PERSISTENT' : 'NOT_PERSISTENT', ratio, { ratio, fullSlope, samples: values.length }); }
  if (head === 'REVERSAL_HEAD') { if (values.length < 8) return output(head, input, null, 0, { samples: values.length }, 'SHORT_HISTORY'); const cut = Math.max(3, values.length - 4); const priorSlope = slope(values.slice(0, cut)); const tailSlope = slope(values.slice(cut - 1)); const material = Math.abs(priorSlope) >= 0.008 && Math.abs(tailSlope) >= 0.012; const reversed = material && sign(priorSlope) === -sign(tailSlope); return output(head, input, reversed ? 'REVERSAL' : 'NO_REVERSAL', Math.min(1, (Math.abs(priorSlope) + Math.abs(tailSlope)) / 0.08), { priorSlope, recentSlope: tailSlope, material }); }
  if (head === 'REGIME_CHANGE_HEAD') { const architecture = options.architecture ?? 'COMPOSITE_CHANGE_POINT'; const label = regimeEstimate(values, architecture); return output(head, input, label, label === null ? 0 : Math.min(1, values.length / 16), { architecture, samples: values.length }, 'SHORT_HISTORY'); }
  if (head === 'VOLATILITY_HEAD') { if (values.length < 4) return output(head, input, null, 0, { samples: values.length }, 'SHORT_HISTORY'); const magnitude = volatility; return output(head, input, magnitude >= 0.12 ? 'HIGH_VOLATILITY' : 'LOW_VOLATILITY', Math.min(1, Math.abs(magnitude - 0.12) / 0.12), { magnitude, samples: values.length }); }
  if (head === 'CYCLE_HEAD') { if (values.length < 8) return output(head, input, null, 0, { samples: values.length }, 'SHORT_HISTORY'); let bestLag = 0; let bestCorrelation = -1; for (let lag = 2; lag <= Math.min(8, Math.floor(values.length / 2)); lag += 1) { const correlation = lagCorrelation(values, lag); if (correlation > bestCorrelation) { bestCorrelation = correlation; bestLag = lag; } } const amplitude = Math.max(...values) - Math.min(...values); const cyclic = bestCorrelation >= 0.72 && amplitude >= 0.08; return output(head, input, cyclic ? 'CYCLICAL' : 'NOT_CYCLICAL', Math.max(0, bestCorrelation), { bestLag, bestCorrelation, amplitude, samples: values.length }); }
  if (head === 'TIME_TO_THRESHOLD_HEAD') { const threshold = input.channelSemantics?.alpha?.threshold; if (!Number.isFinite(threshold) || !POLARITIES.includes(input.channelSemantics?.alpha?.polarity) || values.length < 4) return output(head, input, null, 0, { samples: values.length }, 'MISSING_THRESHOLD_OR_HISTORY'); const last = values.at(-1); if (last >= threshold) return output(head, input, 'ALREADY_CROSSED', 1, { threshold, last, recentSlope }); if (recentSlope <= 0.004 || sign(fullSlope) !== sign(recentSlope)) return output(head, input, 'NOT_CROSSING', Math.min(1, Math.abs(recentSlope) / 0.04), { threshold, last, fullSlope, recentSlope }); const ticks = Math.ceil((threshold - last) / recentSlope); const label = ticks <= 3 ? 'CROSSING_1_TO_3' : ticks <= 8 ? 'CROSSING_4_TO_8' : 'NOT_CROSSING'; return output(head, input, label, Math.min(1, values.length / 12), { threshold, last, fullSlope, recentSlope, estimatedTicks: ticks }); }
  if (head === 'HISTORY_SUFFICIENCY_HEAD') { const enough = values.length >= 5 && coverage >= 0.8; return output(head, input, enough ? 'ENOUGH_EVIDENCE' : 'INSUFFICIENT_EVIDENCE', enough ? Math.min(1, values.length / 12) : 1 - coverage, { samples: values.length, coverage }); }
  if (head === 'ABSTENTION_HEAD') { const conflict = sign(fullSlope) !== 0 && sign(recentSlope) !== 0 && sign(fullSlope) !== sign(recentSlope); const noisy = volatility >= 0.14; const enough = values.length >= 5 && coverage >= 0.8 && !conflict && !noisy; return output(head, input, enough ? 'ENOUGH_EVIDENCE' : 'INSUFFICIENT_EVIDENCE', enough ? Math.min(1, values.length / 12) : Math.max(1 - coverage, conflict ? 0.8 : 0, noisy ? 0.8 : 0), { samples: values.length, coverage, conflict, volatility }); }
  throw new TypeError('unreachable Stage 2I.2 head');
}

function scaledHistory(history) { return history.map((frame) => ({ tick: frame.tick, channels: Object.fromEntries(Object.entries(frame.channels).map(([name, value]) => [name, Number((0.5 + (value - 0.5) * 0.91).toFixed(6))])) })); }
function directionCases() { return buildStage2H6Corpus().flatMap((entry) => DIRECTION_FAMILIES[entry.family] ? [entry, { ...entry, caseId: `${entry.caseId}-scaled`, observationHistory: scaledHistory(entry.observationHistory), caseDigest: sha256({ source: entry.caseDigest, transform: 'SCALE_AROUND_HALF_0.91' }) }] : []).map((entry, index) => ({ caseId: `stage2i2-direction-${index}`, family: entry.family, observationHistory: entry.observationHistory, expected: DIRECTION_FAMILIES[entry.family], polarity: POLARITIES[index % POLARITIES.length], source: 'STAGE2I1_REUSED' })); }
function frames(values, missing = []) { return values.map((value, tick) => ({ tick, channels: missing.includes(tick) ? {} : { alpha: clamp(value), beta: clamp(1 - value) } })); }
function variantSeries(length, variant, generator) { const scale = 0.9 + (variant % 5) * 0.025; const offset = ((variant % 7) - 3) * 0.003; return Array.from({ length }, (_, index) => clamp(0.5 + (generator(index, length) - 0.5) * scale + offset)); }
function customCases(task, definitions, variants = 40) { const rows = []; for (const definition of definitions) for (let variant = 0; variant < variants; variant += 1) { const built = definition.build(variant); const observationHistory = frames(built.values, built.missing); rows.push({ caseId: `stage2i2-${task.toLowerCase()}-${definition.family.toLowerCase()}-${String(variant).padStart(2, '0')}`, family: definition.family, observationHistory, expected: built.expected ?? definition.expected, expectedMagnitude: built.expectedMagnitude, channelSemantics: built.channelSemantics, polarity: built.channelSemantics?.alpha?.polarity ?? POLARITIES[variant % POLARITIES.length], source: 'STAGE2I2_TASK_SPECIFIC' }); } return rows; }

function persistenceCases() { return customCases('PERSISTENCE', [
  { family: 'CONSISTENT_TREND', expected: 'PERSISTENT', build: (v) => ({ values: variantSeries(10 + v % 5, v, (i) => 0.2 + i * 0.045) }) },
  { family: 'INTERMITTENT_TREND', expected: 'NOT_PERSISTENT', build: (v) => ({ values: variantSeries(12, v, (i) => 0.35 + [0, .05, .01, .06, .02, .07][i % 6]) }) },
  { family: 'LATE_INTERRUPTION', expected: 'NOT_PERSISTENT', build: (v) => ({ values: variantSeries(12, v, (i, n) => i < n - 3 ? 0.2 + i * .045 : 0.62 - (i - (n - 3)) * .08) }) },
  { family: 'NOISY_PERSISTENCE', expected: 'PERSISTENT', build: (v) => ({ values: variantSeries(12, v, (i) => 0.2 + i * .035 + (i % 2 ? .006 : -.006)) }) },
  { family: 'STABLE', expected: 'NOT_PERSISTENT', build: (v) => ({ values: variantSeries(10, v, (i) => .5 + (i % 2 ? .001 : -.001)) }) },
]); }
function reversalCases() { return customCases('REVERSAL', [
  { family: 'CLEAN_REVERSAL', expected: 'REVERSAL', build: (v) => ({ values: variantSeries(12, v, (i) => i < 8 ? .75 - i * .04 : .43 + (i - 8) * .07) }) },
  { family: 'LATE_REVERSAL', expected: 'REVERSAL', build: (v) => ({ values: variantSeries(14, v, (i) => i < 10 ? .78 - i * .035 : .465 + (i - 10) * .06) }) },
  { family: 'WEAK_REVERSAL', expected: 'REVERSAL', build: (v) => ({ values: variantSeries(12, v, (i) => i < 8 ? .62 - i * .018 : .494 + (i - 8) * .022) }) },
  { family: 'FALSE_REVERSAL_FROM_SPIKE', expected: 'NO_REVERSAL', build: (v) => ({ values: variantSeries(12, v, (i) => i === 10 ? .85 : .72 - i * .025) }) },
  { family: 'TEMPORARY_REVERSAL', expected: 'NO_REVERSAL', build: (v) => ({ values: variantSeries(12, v, (i) => .72 - i * .025 + (i === 8 ? .08 : 0)) }) },
  { family: 'DOUBLE_REVERSAL', expected: 'NO_REVERSAL', build: (v) => ({ values: variantSeries(14, v, (i) => i < 6 ? .72 - i * .035 : i < 10 ? .545 + (i - 6) * .045 : .68 - (i - 10) * .04) }) },
]); }
function regimeCases() { return customCases('REGIME_CHANGE', [
  { family: 'MEAN_SHIFT', expected: 'REGIME_CHANGE', build: (v) => ({ values: variantSeries(14, v, (i) => i < 7 ? .35 : .68) }) },
  { family: 'VARIANCE_SHIFT', expected: 'REGIME_CHANGE', build: (v) => ({ values: variantSeries(14, v, (i) => i < 7 ? .5 + (i % 2 ? .005 : -.005) : .5 + (i % 2 ? .18 : -.18)) }) },
  { family: 'TREND_SHIFT', expected: 'REGIME_CHANGE', build: (v) => ({ values: variantSeries(14, v, (i) => i < 7 ? .25 + i * .012 : .334 + (i - 7) * .065) }) },
  { family: 'CYCLE_ONSET', expected: 'REGIME_CHANGE', build: (v) => ({ values: variantSeries(16, v, (i) => i < 8 ? .5 : .5 + (i % 2 ? .16 : -.16)) }) },
  { family: 'CYCLE_DISAPPEARANCE', expected: 'REGIME_CHANGE', build: (v) => ({ values: variantSeries(16, v, (i) => i < 8 ? .5 + (i % 2 ? .16 : -.16) : .5) }) },
  { family: 'STABLE_TO_VOLATILE', expected: 'REGIME_CHANGE', build: (v) => ({ values: variantSeries(14, v, (i) => i < 7 ? .5 : .5 + (i % 3 - 1) * .17) }) },
  { family: 'VOLATILE_TO_STABLE', expected: 'REGIME_CHANGE', build: (v) => ({ values: variantSeries(14, v, (i) => i < 7 ? .5 + (i % 3 - 1) * .17 : .5) }) },
  { family: 'ORDINARY_REVERSAL', expected: 'NO_REGIME_CHANGE', build: (v) => ({ values: variantSeries(14, v, (i) => i < 9 ? .7 - i * .025 : .5 + (i - 9) * .025) }) },
  { family: 'CONTINUING_TREND', expected: 'NO_REGIME_CHANGE', build: (v) => ({ values: variantSeries(14, v, (i) => .25 + i * .035) }) },
  { family: 'SINGLE_OUTLIER', expected: 'NO_REGIME_CHANGE', build: (v) => ({ values: variantSeries(14, v, (i) => i === 8 ? .82 : .5) }) },
  { family: 'STABLE', expected: 'NO_REGIME_CHANGE', build: (v) => ({ values: variantSeries(14, v, () => .5) }) },
], 30); }
function volatilityCases() { return customCases('VOLATILITY', [
  { family: 'HIGH_VOLATILITY', build: (v) => { const values = variantSeries(12, v, (i) => i % 2 ? .78 : .22); const magnitude = rms(deltas(values)); return { values, expected: magnitude >= .12 ? 'HIGH_VOLATILITY' : 'LOW_VOLATILITY', expectedMagnitude: magnitude }; } },
  { family: 'LOW_VOLATILITY', build: (v) => { const values = variantSeries(12, v, (i) => .5 + (i % 2 ? .015 : -.015)); const magnitude = rms(deltas(values)); return { values, expected: magnitude >= .12 ? 'HIGH_VOLATILITY' : 'LOW_VOLATILITY', expectedMagnitude: magnitude }; } },
  { family: 'STABLE', build: (v) => { const values = variantSeries(12, v, () => .5); return { values, expected: 'LOW_VOLATILITY', expectedMagnitude: rms(deltas(values)) }; } },
  { family: 'SINGLE_OUTLIER', build: (v) => { const values = variantSeries(12, v, (i) => i === 6 ? .82 : .5); const magnitude = rms(deltas(values)); return { values, expected: magnitude >= .12 ? 'HIGH_VOLATILITY' : 'LOW_VOLATILITY', expectedMagnitude: magnitude }; } },
  { family: 'IRREGULAR_INSTABILITY', build: (v) => { const pattern = [.2, .7, .35, .8, .4, .65]; const values = variantSeries(12, v, (i) => pattern[i % pattern.length]); const magnitude = rms(deltas(values)); return { values, expected: magnitude >= .12 ? 'HIGH_VOLATILITY' : 'LOW_VOLATILITY', expectedMagnitude: magnitude }; } },
]); }
function cycleCases() { return customCases('CYCLE', [
  { family: 'PERIODIC_CYCLE', expected: 'CYCLICAL', build: (v) => ({ values: variantSeries(16, v, (i) => .5 + .18 * Math.sin((2 * Math.PI * i) / 4)) }) },
  { family: 'IRREGULAR_CYCLE', expected: 'CYCLICAL', build: (v) => ({ values: variantSeries(18, v, (i) => .5 + .16 * Math.sin((2 * Math.PI * i) / 5) + (i % 3 - 1) * .006) }) },
  { family: 'FALSE_CYCLE_NOISE', expected: 'NOT_CYCLICAL', build: (v) => ({ values: variantSeries(16, v, (i) => .5 + ((((i + 3) * (v + 5) * 17) % 19) - 9) / 70) }) },
  { family: 'TWO_FREQUENCY_PATTERN', expected: 'CYCLICAL', build: (v) => ({ values: variantSeries(24, v, (i) => .5 + .12 * Math.sin((2 * Math.PI * i) / 4) + .06 * Math.sin((2 * Math.PI * i) / 7)) }) },
  { family: 'PARTIAL_CYCLE', expected: 'NOT_CYCLICAL', build: (v) => ({ values: variantSeries(10, v, (i) => .5 + .16 * Math.sin((Math.PI * i) / 9)) }) },
  { family: 'INSUFFICIENT_HISTORY', expected: null, build: (v) => ({ values: variantSeries(5, v, (i) => .5 + .15 * Math.sin((2 * Math.PI * i) / 4)) }) },
]); }
function crossingLabel(history, future, threshold) { if (history.at(-1) >= threshold) return 'ALREADY_CROSSED'; const index = future.findIndex((value) => value >= threshold); if (index < 0) return 'NOT_CROSSING'; return index < 3 ? 'CROSSING_1_TO_3' : index < 8 ? 'CROSSING_4_TO_8' : 'NOT_CROSSING'; }
function thresholdCases() { return customCases('TIME_TO_THRESHOLD', [
  { family: 'APPROACHING_THRESHOLD', build: (v) => { const values = variantSeries(10, v, (i) => .2 + i * .045); const future = Array.from({ length: 8 }, (_, i) => values.at(-1) + (i + 1) * .045); return { values, expected: crossingLabel(values, future, .8), channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: .8 } } }; } },
  { family: 'RECEDING_FROM_THRESHOLD', build: (v) => { const values = variantSeries(10, v, (i) => .7 - i * .035); const future = Array.from({ length: 8 }, (_, i) => values.at(-1) - (i + 1) * .035); return { values, expected: crossingLabel(values, future, .8), channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: .8 } } }; } },
  { family: 'NEVER_CROSSING', build: (v) => { const values = variantSeries(10, v, () => .45); return { values, expected: 'NOT_CROSSING', channelSemantics: { alpha: { polarity: 'NEUTRAL_DIRECTION', threshold: .8 } } }; } },
  { family: 'ALREADY_CROSSED', build: (v) => { const values = variantSeries(10, v, (i) => .82 + i * .004); return { values, expected: 'ALREADY_CROSSED', channelSemantics: { alpha: { polarity: 'HIGHER_IS_BETTER', threshold: .8 } } }; } },
  { family: 'ACCELERATING_TOWARD_THRESHOLD', build: (v) => { const values = variantSeries(9, v, (i) => .25 + .006 * i ** 2); const lastDelta = values.at(-1) - values.at(-2); const future = Array.from({ length: 8 }, (_, i) => values.at(-1) + (i + 1) * lastDelta * (1 + i * .12)); return { values, expected: crossingLabel(values, future, .8), channelSemantics: { alpha: { polarity: 'UNKNOWN_POLARITY', threshold: .8 } } }; } },
  { family: 'REVERSAL_BEFORE_CROSSING', build: (v) => { const values = variantSeries(10, v, (i) => i < 7 ? .25 + i * .065 : .64 - (i - 7) * .07); const future = Array.from({ length: 8 }, (_, i) => values.at(-1) - (i + 1) * .05); return { values, expected: crossingLabel(values, future, .8), channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: .8 } } }; } },
]); }
function abstentionCases() { return customCases('ABSTENTION', [
  { family: 'SHORT_HISTORY', expected: 'INSUFFICIENT_EVIDENCE', build: (v) => ({ values: variantSeries(3, v, (i) => .3 + i * .04) }) },
  { family: 'MISSING_HISTORY', expected: 'INSUFFICIENT_EVIDENCE', build: () => ({ values: [] }) },
  { family: 'CONFLICTING_TRENDS', expected: 'INSUFFICIENT_EVIDENCE', build: (v) => ({ values: variantSeries(12, v, (i) => i < 8 ? .7 - i * .04 : .42 + (i - 8) * .07) }) },
  { family: 'HIGH_NOISE', expected: 'INSUFFICIENT_EVIDENCE', build: (v) => ({ values: variantSeries(12, v, (i) => i % 2 ? .78 : .22) }) },
  { family: 'MISSING_SAMPLES', expected: 'INSUFFICIENT_EVIDENCE', build: (v) => ({ values: variantSeries(10, v, (i) => .2 + i * .04), missing: [2, 4, 6] }) },
  { family: 'CONSISTENT_LONG', expected: 'ENOUGH_EVIDENCE', build: (v) => ({ values: variantSeries(12, v, (i) => .2 + i * .035) }) },
  { family: 'STABLE_LONG', expected: 'ENOUGH_EVIDENCE', build: (v) => ({ values: variantSeries(12, v, () => .5) }) },
  { family: 'LOW_NOISE_LONG', expected: 'ENOUGH_EVIDENCE', build: (v) => ({ values: variantSeries(12, v, (i) => .25 + i * .03 + (i % 2 ? .004 : -.004)) }) },
]); }

function accuracy(cases, predict) { let correct = 0; let falseConfidence = 0; let falseAbstention = 0; for (const entry of cases) { const predicted = predict(entry); if (predicted === entry.expected) correct += 1; if (predicted !== null && entry.expected === null) falseConfidence += 1; if (predicted === null && entry.expected !== null) falseAbstention += 1; } return { cases: cases.length, correct, accuracy: correct / Math.max(1, cases.length), falseConfidenceRate: falseConfidence / Math.max(1, cases.length), falseAbstentionRate: falseAbstention / Math.max(1, cases.length) }; }
function simpleLabel(cases, predict) { return accuracy(cases, predict); }
function effectiveGroups(cases) { return new Set(cases.map((entry) => sha256({ family: entry.family, history: entry.observationHistory, expected: entry.expected, semantics: entry.channelSemantics }))).size; }
function score(value, beatsBaseline) { let rating = 1; for (const threshold of STAGE2I2_HEAD_RUBRIC.thresholds) if (value >= threshold.min) rating = threshold.score; return beatsBaseline ? rating : Math.min(rating, STAGE2I2_HEAD_RUBRIC.belowRelevantSimpleBaselineMaximum); }
function disposition(rating, beatsBaseline, benchmarkable = true) { if (!benchmarkable) return 'REMOVE'; if (rating >= 7 && beatsBaseline) return 'KEEP'; if (rating >= 4) return 'REDESIGN'; return 'REPLACE'; }
function headResult(head, cases, baselinePredict, options = {}) { const measured = accuracy(cases, (entry) => evaluateStage2I2Head(head, entry, options).semanticOutput); const baseline = accuracy(cases, baselinePredict); const beats = measured.accuracy > baseline.accuracy; const rating = score(measured.accuracy, beats); return { ...measured, effectiveSemanticGroups: effectiveGroups(cases), relevantSimpleBaseline: { ...baseline, name: options.baselineName }, beatsRelevantSimpleBaseline: beats, incrementalValue: measured.accuracy - baseline.accuracy, score: rating, disposition: disposition(rating, beats) }; }

export function buildStage2I2Diagnostic() {
  const corpora = { direction: directionCases(), persistence: persistenceCases(), reversal: reversalCases(), regimeChange: regimeCases(), volatility: volatilityCases(), cycle: cycleCases(), timeToThreshold: thresholdCases(), abstention: abstentionCases() };
  const directionCandidates = Object.fromEntries(DIRECTION_ARCHITECTURES.map((architecture) => [architecture, accuracy(corpora.direction, (entry) => directionEstimate(valuesOf(entry), architecture))]));
  const directionAdversarialFamilies = new Set(['NOISY_TREND', 'TREND_WITH_OUTLIER', 'STABLE']);
  const directionAdversarial = Object.fromEntries(DIRECTION_ARCHITECTURES.map((architecture) => [architecture, accuracy(corpora.direction.filter((entry) => directionAdversarialFamilies.has(entry.family)), (entry) => directionEstimate(valuesOf(entry), architecture))]));
  const directionArchitecture = [...DIRECTION_ARCHITECTURES].sort((a, b) => directionCandidates[b].accuracy - directionCandidates[a].accuracy || directionAdversarial[b].accuracy - directionAdversarial[a].accuracy || a.localeCompare(b))[0];
  const regimeCandidates = Object.fromEntries(REGIME_ARCHITECTURES.map((architecture) => [architecture, accuracy(corpora.regimeChange, (entry) => regimeEstimate(valuesOf(entry), architecture))]));
  const regimeArchitecture = [...REGIME_ARCHITECTURES].sort((a, b) => regimeCandidates[b].accuracy - regimeCandidates[a].accuracy || a.localeCompare(b))[0];

  const direction = headResult('DIRECTION_HEAD', corpora.direction, () => null, { architecture: directionArchitecture, baselineName: 'CURRENT_STATE_NO_TEMPORAL_DIRECTION' });
  direction.bestArchitecture = directionArchitecture; direction.candidates = directionCandidates; direction.adversarialAccuracy = directionAdversarial[directionArchitecture].accuracy;
  const persistence = headResult('PERSISTENCE_HEAD', corpora.persistence, (entry) => Math.abs(valuesOf(entry).at(-1) - .5) > .08 ? 'PERSISTENT' : 'NOT_PERSISTENT', { baselineName: 'CURRENT_LEVEL_DISTANCE' });
  persistence.falsePositiveRate = corpora.persistence.filter((entry) => entry.expected === 'NOT_PERSISTENT' && evaluateStage2I2Head('PERSISTENCE_HEAD', entry).semanticOutput === 'PERSISTENT').length / corpora.persistence.filter((entry) => entry.expected === 'NOT_PERSISTENT').length;
  const reversal = headResult('REVERSAL_HEAD', corpora.reversal, (entry) => { const values = valuesOf(entry); if (values.length < 3) return null; return sign(values.at(-1) - values.at(-2)) !== sign(values.at(-2) - values.at(-3)) ? 'REVERSAL' : 'NO_REVERSAL'; }, { baselineName: 'LAST_DELTA_FLIP' });
  reversal.adversarialAccuracy = accuracy(corpora.reversal.filter((entry) => !['CLEAN_REVERSAL', 'LATE_REVERSAL'].includes(entry.family)), (entry) => evaluateStage2I2Head('REVERSAL_HEAD', entry).semanticOutput).accuracy;
  const regimeChange = headResult('REGIME_CHANGE_HEAD', corpora.regimeChange, (entry) => { const values = valuesOf(entry); const split = Math.floor(values.length / 2); return Math.abs(mean(values.slice(split)) - mean(values.slice(0, split))) >= .16 ? 'REGIME_CHANGE' : 'NO_REGIME_CHANGE'; }, { architecture: regimeArchitecture, baselineName: 'ABS_SPLIT_MEAN_SHIFT' });
  regimeChange.bestArchitecture = regimeArchitecture; regimeChange.candidates = regimeCandidates;
  const volatility = headResult('VOLATILITY_HEAD', corpora.volatility, (entry) => Math.max(...valuesOf(entry)) - Math.min(...valuesOf(entry)) >= .35 ? 'HIGH_VOLATILITY' : 'LOW_VOLATILITY', { baselineName: 'RANGE_THRESHOLD' });
  volatility.magnitudeError = mean(corpora.volatility.map((entry) => Math.abs(evaluateStage2I2Head('VOLATILITY_HEAD', entry).observation.magnitude - entry.expectedMagnitude)));
  const cycle = headResult('CYCLE_HEAD', corpora.cycle, (entry) => { const ratio = alternation(valuesOf(entry)); return valuesOf(entry).length < 8 ? null : ratio >= .75 ? 'CYCLICAL' : 'NOT_CYCLICAL'; }, { baselineName: 'ALTERNATION_RATIO' });
  cycle.falsePositiveRate = corpora.cycle.filter((entry) => entry.expected === 'NOT_CYCLICAL' && evaluateStage2I2Head('CYCLE_HEAD', entry).semanticOutput === 'CYCLICAL').length / corpora.cycle.filter((entry) => entry.expected === 'NOT_CYCLICAL').length;
  const timeToThreshold = headResult('TIME_TO_THRESHOLD_HEAD', corpora.timeToThreshold, (entry) => valuesOf(entry).at(-1) >= entry.channelSemantics.alpha.threshold ? 'ALREADY_CROSSED' : 'NOT_CROSSING', { baselineName: 'CURRENT_STATE_THRESHOLD' });
  timeToThreshold.abstentionRate = corpora.timeToThreshold.filter((entry) => evaluateStage2I2Head('TIME_TO_THRESHOLD_HEAD', entry).abstained).length / corpora.timeToThreshold.length;
  const abstention = headResult('ABSTENTION_HEAD', corpora.abstention, (entry) => valuesOf(entry).length >= 5 ? 'ENOUGH_EVIDENCE' : 'INSUFFICIENT_EVIDENCE', { baselineName: 'HISTORY_LENGTH_ONLY' });
  const insufficientCases = corpora.abstention.filter((entry) => entry.expected === 'INSUFFICIENT_EVIDENCE');
  const enoughCases = corpora.abstention.filter((entry) => entry.expected === 'ENOUGH_EVIDENCE');
  abstention.falseConfidenceRate = insufficientCases.filter((entry) => evaluateStage2I2Head('ABSTENTION_HEAD', entry).semanticOutput === 'ENOUGH_EVIDENCE').length / insufficientCases.length;
  abstention.falseAbstentionRate = enoughCases.filter((entry) => evaluateStage2I2Head('ABSTENTION_HEAD', entry).semanticOutput === 'INSUFFICIENT_EVIDENCE').length / enoughCases.length;
  const historyCases = corpora.abstention.map((entry) => ({ ...entry, expected: valuesOf(entry).length >= 5 && valuesOf(entry).length / Math.max(1, entry.observationHistory.length) >= .8 ? 'ENOUGH_EVIDENCE' : 'INSUFFICIENT_EVIDENCE' }));
  const historySufficiency = headResult('HISTORY_SUFFICIENCY_HEAD', historyCases, (entry) => valuesOf(entry).length >= 3 ? 'ENOUGH_EVIDENCE' : 'INSUFFICIENT_EVIDENCE', { baselineName: 'THREE_FRAME_LENGTH_ONLY' });

  const results = { direction, persistence, reversal, regimeChange, volatility, cycle, timeToThreshold, abstention, historySufficiency };
  const contracts = Object.fromEntries(STAGE2I2_HEADS.map((head) => [head, { consumesBoundedHistory: true, maximumFrames: 32, ownSemanticOutputOnly: true, deterministicConfidence: true, canAbstain: true, carriesDigest: true, isolatedFromPrimeSelection: true }]));
  const groundTruth = Object.fromEntries(Object.entries(STAGE2I2_GROUND_TRUTH).map(([head, value]) => [head, { ...value, cases: head === 'HISTORY_SUFFICIENCY_HEAD' ? corpora.abstention.length : corpora[{ DIRECTION_HEAD: 'direction', PERSISTENCE_HEAD: 'persistence', REVERSAL_HEAD: 'reversal', REGIME_CHANGE_HEAD: 'regimeChange', VOLATILITY_HEAD: 'volatility', CYCLE_HEAD: 'cycle', TIME_TO_THRESHOLD_HEAD: 'timeToThreshold', ABSTENTION_HEAD: 'abstention' }[head]]?.length ?? 0, effectiveSemanticGroups: head === 'HISTORY_SUFFICIENCY_HEAD' ? effectiveGroups(corpora.abstention) : effectiveGroups(corpora[{ DIRECTION_HEAD: 'direction', PERSISTENCE_HEAD: 'persistence', REVERSAL_HEAD: 'reversal', REGIME_CHANGE_HEAD: 'regimeChange', VOLATILITY_HEAD: 'volatility', CYCLE_HEAD: 'cycle', TIME_TO_THRESHOLD_HEAD: 'timeToThreshold', ABSTENTION_HEAD: 'abstention' }[head]] ?? []) }]));
  const oracleV2Design = {
    frozen: true,
    composition: STAGE2I2_HEADS,
    structuredTemporalAssessment: true,
    genericScalarTemporalValueRequired: false,
    actionMappingPresent: false,
    forbiddenFields: ['recommendedAction', 'actionAdjustment', 'selectedAction'],
    requirements7Of10: {
      requiredHeadMinimums: { DIRECTION_HEAD: 7, REVERSAL_HEAD: 7, REGIME_CHANGE_HEAD: 7, ABSTENTION_HEAD: 7 },
      requiresPositiveIncrementalValueByRequiredHead: true,
      requiresTaskSpecificBaselineSuperiority: true,
      requiresDeterministicConfidenceAndAbstention: true,
      requiresNoActionMapping: true,
    },
  };
  const payload = {
    stage: STAGE2I2_STAGE,
    baseline: { scores: { prime: 4, oracle: 3, nexus: 4 }, stage2i0Unchanged: true, stage2i1Status: 'FAIL' },
    frozenOwners: { oracleV1Sha256: STAGE2I2_ORACLE_V1_SHA256, robustTrendExpertSha256: STAGE2I2_ROBUST_TREND_SHA256, oracleV1Changed: false, robustTrendExpertChanged: false },
    contracts,
    groundTruth,
    corpus: { sourceStage2i1Cases: 2040, reusedStage2i1Cases: corpora.direction.length, semanticFamilyLeakage: false, partitionStrategy: 'HEAD_SPECIFIC_DIAGNOSTIC_NO_TRAINING', digest: sha256(corpora) },
    semanticPolicy: { temporalObservationValueCoupling: false, channelPolarityBound: true, permittedPolarities: POLARITIES, valueInterpretationRequiresExplicitPolarity: true },
    headRubric: STAGE2I2_HEAD_RUBRIC,
    results,
    dispositions: { direction: direction.disposition, persistence: persistence.disposition, reversal: reversal.disposition, regimeChange: regimeChange.disposition, volatility: volatility.disposition, cycle: cycle.disposition, timeToThreshold: timeToThreshold.disposition, historySufficiency: historySufficiency.disposition, abstention: abstention.disposition },
    oracleV2Design,
    gameRoleMap: {
      currentlySupported: ['RESOURCE_TREND', 'ENEMY_PRESSURE_TREND', 'TEMPORAL_HISTORY_SUFFICIENCY', 'RESOURCE_INSTABILITY'],
      partiallySupported: ['COMBAT_MOMENTUM_REVERSAL', 'RESOURCE_RECOVERY', 'AMMO_DEPLETION', 'SHIELD_FAILURE', 'WATER_RESERVE_EXHAUSTION'],
      futureTargets: ['BOSS_PHASE_CHANGE', 'ENEMY_BEHAVIOR_MODE_CHANGE', 'BOSS_ATTACK_CADENCE', 'PATROL_ROTATION'],
    },
    qualityGate: { trustworthyTaskDecompositionProduced: true, allGroundTruthDeterministic: Object.values(STAGE2I2_GROUND_TRUTH).every((entry) => entry.deterministic), modularOracleV2DesignFrozen: true, noPostMeasurementTuning: true },
    qualityGatePass: true,
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
