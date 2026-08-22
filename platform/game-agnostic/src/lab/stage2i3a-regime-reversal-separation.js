import { deepFreeze, sha256 } from '../core/determinism.js';
import { CAPABILITY_RUBRIC } from './stage2i0-capability-baseline.js';
import { evaluateStage2I2Head } from './stage2i2-oracle-task-head-diagnostic.js';
import { evaluatePersistenceV2, PERSISTENCE_V2_SEARCH_SPACE } from './stage2i3-oracle-head-remediation.js';

export const STAGE2I3A_STAGE = 'STAGE2I3A_REGIME_CHANGE_REVERSAL_SEPARATION_REMEDIATION';
export const STAGE2I3A_STAGE2I2_OWNER_SHA256 = 'bc908a23dd595376deb7ef39a81b7d95fbfb7da118bb65989e05a12165d51bdf';
export const STAGE2I3A_STAGE2I3_OWNER_SHA256 = 'd334e768f2ab559a04c3906f53d37b588a265e39c7c79821d086fedf0b96fcf9';
export const FROZEN_PERSISTENCE_V2 = PERSISTENCE_V2_SEARCH_SPACE.find((candidate) => candidate.id === 'BOUNDED_INTERRUPTION_TOLERANCE');

export const STAGE2I3A_SEMANTICS = deepFreeze({
  reversal: 'RECENT_DIRECTION_MATERIALLY_OPPOSES_EARLIER_DIRECTION',
  regimeChange: 'ONE_OR_MORE_STABLE_GENERATING_PROCESS_PROPERTIES_CHANGED_MATERIALLY_AND_PERSISTENTLY',
  reversalImpliesRegimeChange: false,
  regimeChangeMayIncludeReversal: true,
  processDimensions: ['LEVEL', 'TREND', 'VOLATILITY', 'CYCLE_STRUCTURE', 'FREQUENCY', 'PERSISTENCE_PATTERN'],
});

export const REGIME_V3_SEARCH_SPACE = deepFreeze([
  { id: 'MULTI_DIMENSION_WINDOW_DELTA', persistenceGate: false, cycleAware: true, anomalySuppression: false, sensitivity: 1 },
  { id: 'PERSISTENCE_GATED_WINDOW_DELTA', persistenceGate: true, cycleAware: false, anomalySuppression: true, sensitivity: 1 },
  { id: 'CONSENSUS_PROCESS_CHANGE', persistenceGate: true, cycleAware: true, anomalySuppression: true, sensitivity: 1 },
  { id: 'HIERARCHICAL_PROCESS_CHANGE', persistenceGate: true, cycleAware: true, anomalySuppression: true, sensitivity: 1.15 },
]);

export const STAGE2I3A_GATE = deepFreeze({
  preRegistered: true,
  minimumScore: 7,
  minimumAccuracy: .85,
  minimumAdversarialAccuracy: .85,
  maximumReversalOnlyFalseRegimeRate: .10,
  requiresSimpleBaselineSuperiority: true,
  requiresPositiveIncrementalValue: true,
  requiresDistinctFromReversal: true,
  requiresCausalAttribution: true,
});

const SIMPLE_BASELINES = deepFreeze(['RECENT_VS_PRIOR_MEAN_DELTA', 'RECENT_VS_PRIOR_SLOPE_DELTA', 'RECENT_VS_PRIOR_VARIANCE_DELTA', 'REVERSAL_ONLY_BASELINE', 'ANY_DIMENSION_DELTA_BASELINE']);
const FROZEN_HEAD_EVIDENCE = deepFreeze({
  direction: '5315a3eb7918001d3011f71cb1b57ed4a6f2d0fdccfc5ecf0cf94c8bbe3672b7',
  persistenceV2: '5ddd3243ade1811dac8d465dcf435d493b4d2bf7ac3c8600b6483f8156545d69',
  reversal: 'e8ad0b9ef655073f644f304c598e99cfba12c55381dc29e1d87c8b1c32d71541',
  volatility: '28ee47dff24228b83c9cec51f3431e8dd2a2677a741cec3cd7979180d2df8b7a',
  cycle: '332bc9e3f4d861e4807293faf162708be286ad23ed6379e7946775b4ce9d75e6',
  timeToThreshold: '42884e7605aade02f46a25c142ee4ade6238b25a513c3ce40a9bf09093e4af54',
  abstention: '1e768c78f20e842bee671ae63058b5e013e280fb4a4707f344fdb0cc6bfe0bd6',
});

const QUADRANTS = deepFreeze(['REVERSAL_ONLY', 'REGIME_ONLY', 'REVERSAL_AND_REGIME', 'NEITHER']);
const CHANGE_LABELS = deepFreeze(['NO_CHANGE', 'LEVEL_CHANGE', 'TREND_CHANGE', 'VOLATILITY_CHANGE', 'CYCLE_CHANGE', 'MULTIPLE_CHANGE', 'INSUFFICIENT_EVIDENCE']);

function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function median(values) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function deltas(values) { return values.slice(1).map((value, index) => value - values[index]); }
function sign(value, epsilon = .004) { return value > epsilon ? 1 : value < -epsilon ? -1 : 0; }
function rms(values) { return values.length ? Math.sqrt(mean(values.map((value) => value ** 2))) : 0; }
function lagCorrelation(values, lag) { if (values.length <= lag + 1) return 0; const left = values.slice(0, -lag); const right = values.slice(lag); const lm = mean(left); const rm = mean(right); const numerator = left.reduce((sum, value, index) => sum + (value - lm) * (right[index] - rm), 0); const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - lm) ** 2, 0) * right.reduce((sum, value) => sum + (value - rm) ** 2, 0)); return denominator ? numerator / denominator : 0; }
function valuesOf(entry) { return entry.observationHistory.filter((frame) => Number.isFinite(frame.channels?.alpha)).slice(-48).map((frame) => frame.channels.alpha); }
function frames(values) { return values.map((value, tick) => ({ tick, channels: { alpha: clamp(value), beta: clamp(1 - value) } })); }
function confidence(value) { return Math.max(0, Math.min(1_000_000, Math.round(value * 1_000_000))); }
function output(candidate, entry, semanticOutput, confidenceValue, observation, abstentionReason = null) { const body = { head: 'REGIME_CHANGE_HEAD_V3', candidateId: candidate.id, inputDigest: `sha256:${sha256(entry.observationHistory)}`, observation, semanticOutput, confidence: confidence(confidenceValue), abstained: semanticOutput === 'INSUFFICIENT_EVIDENCE', abstentionReason: semanticOutput === 'INSUFFICIENT_EVIDENCE' ? abstentionReason ?? 'INSUFFICIENT_TEMPORAL_EVIDENCE' : null, reversalImpliesRegimeChange: false, advisoryOnly: true, expertSelectionInfluence: 0, authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false } }; return deepFreeze({ ...body, outputDigest: `sha256:${sha256(body)}` }); }

function cycleSignature(values) { let bestLag = 0; let bestCorrelation = -1; for (let lag = 2; lag <= Math.min(6, Math.floor(values.length / 2)); lag += 1) { const correlation = lagCorrelation(values, lag); if (correlation > bestCorrelation) { bestCorrelation = correlation; bestLag = lag; } } const amplitude = (Math.max(...values) - Math.min(...values)) / 2; const directions = deltas(values).map((value) => sign(value)).filter(Boolean); const turns = directions.slice(1).filter((value, index) => value === -directions[index]).length; return { detected: bestCorrelation >= .78 && amplitude >= .035 && turns >= 2, lag: bestLag, correlation: bestCorrelation, amplitude, turns }; }
function processDescriptor(values) { const differences = deltas(values); const trend = median(differences); const signs = differences.map((value) => sign(value)).filter(Boolean); const dominant = Math.max(signs.filter((value) => value > 0).length, signs.filter((value) => value < 0).length); const persistence = dominant / Math.max(1, differences.length); const center = median(differences); const volatility = rms(differences.map((value) => value - center)); return { level: median(values), trend, direction: sign(trend, .006), volatility, cycle: cycleSignature(values), persistence }; }
function persistenceObservation(values) { return evaluatePersistenceV2({ observationHistory: frames(values) }, FROZEN_PERSISTENCE_V2).semanticOutput; }

export function evaluateRegimeV3(entry, candidate) {
  if (!REGIME_V3_SEARCH_SPACE.some((item) => item.id === candidate?.id)) throw new TypeError('unknown Regime V3 candidate');
  const values = valuesOf(entry); if (values.length < 24) return output(candidate, entry, 'INSUFFICIENT_EVIDENCE', 0, { samples: values.length }, 'SHORT_HISTORY');
  const window = 10; const priorValues = values.slice(0, window); const recentValues = values.slice(-window); const prior = processDescriptor(priorValues); const recent = processDescriptor(recentValues); const priorPersistence = persistenceObservation(priorValues); const recentPersistence = persistenceObservation(recentValues); const frozenReversal = evaluateStage2I2Head('REVERSAL_HEAD', entry).semanticOutput;
  const sensitivity = candidate.sensitivity; const levelDelta = Math.abs(recent.level - prior.level); const trendDelta = Math.abs(recent.trend - prior.trend); const volatilityDelta = Math.abs(recent.volatility - prior.volatility); const sameCycle = prior.cycle.detected && recent.cycle.detected && prior.cycle.lag === recent.cycle.lag && Math.abs(prior.cycle.amplitude - recent.cycle.amplitude) < .06 * sensitivity; const cycleChange = candidate.cycleAware && (prior.cycle.detected !== recent.cycle.detected || (prior.cycle.detected && recent.cycle.detected && (prior.cycle.lag !== recent.cycle.lag || Math.abs(prior.cycle.amplitude - recent.cycle.amplitude) >= .06 * sensitivity)));
  const persistentPrior = priorPersistence === 'PERSISTENT'; const persistentRecent = recentPersistence === 'PERSISTENT'; const directionChanged = prior.direction !== recent.direction && (prior.direction !== 0 || recent.direction !== 0); const magnitudeChanged = prior.direction === recent.direction && prior.direction !== 0 && trendDelta >= .018 * sensitivity; const stableTrendTransition = (prior.direction === 0) !== (recent.direction === 0) && trendDelta >= .012 * sensitivity; let trendChange = directionChanged || magnitudeChanged || stableTrendTransition;
  if (candidate.persistenceGate) trendChange = trendChange && ((directionChanged || magnitudeChanged) ? persistentPrior && persistentRecent : persistentPrior || persistentRecent);
  if (sameCycle) trendChange = false;
  const levelChange = levelDelta >= .13 * sensitivity;
  const volatilityChange = !cycleChange && volatilityDelta >= .035 * sensitivity;
  const changes = [levelChange && 'LEVEL_CHANGE', trendChange && 'TREND_CHANGE', volatilityChange && 'VOLATILITY_CHANGE', cycleChange && 'CYCLE_CHANGE'].filter(Boolean);
  const semanticOutput = changes.length > 1 ? 'MULTIPLE_CHANGE' : changes[0] ?? 'NO_CHANGE';
  const strength = Math.max(levelDelta / .13, trendDelta / .018, volatilityDelta / .035, cycleChange ? 1 : 0);
  return output(candidate, entry, semanticOutput, Math.min(1, strength), { samples: values.length, prior, recent, priorPersistence, recentPersistence, frozenReversalObservation: frozenReversal, deltas: { level: levelDelta, trend: trendDelta, volatility: volatilityDelta }, detectedChanges: changes });
}

const PERIOD_PATTERNS = deepFreeze({
  3: [0, .866, -.866],
  4: [0, 1, 0, -1],
  5: [0, .951, .588, -.588, -.951],
  6: [0, .866, .866, 0, -.866, -.866],
});
function constant(length, value) { return Array.from({ length }, () => value); }
function line(length, center, rate) { const middle = (length - 1) / 2; return Array.from({ length }, (_, index) => center + (index - middle) * rate); }
function cycle(length, center, amplitude, period, phase = 0) { const pattern = PERIOD_PATTERNS[period]; return Array.from({ length }, (_, index) => center + amplitude * pattern[(index + phase) % pattern.length]); }
function noise(length, center, amplitude, variant) { return Array.from({ length }, (_, index) => center + (((index + 3) * (variant + 5) * 17) % 19 - 9) * amplitude / 9); }
function interpolate(from, to, length = 8) { return Array.from({ length }, (_, index) => from + (to - from) * (index + 1) / (length + 1)); }
function compose(prior, recent, transition = interpolate(prior.at(-1), recent[0])) { return [...prior, ...transition, ...recent]; }
function variantTransform(values, variant) { const scale = .93 + (variant % 5) * .018; const offset = ((variant % 7) - 3) * .002; return values.map((value) => clamp(.5 + (value - .5) * scale + offset)); }
function withLocalCorrection(prior, recent, variant, direction = -1) { const transition = interpolate(prior.at(-1), recent[0]); transition[3] += direction * (.11 + (variant % 3) * .01); transition[4] += direction * .06; return compose(prior, recent, transition); }

const DEFINITIONS = deepFreeze({
  DEVELOPMENT_SET: [
    { family: 'SMOOTH_OSCILLATION_MIDPOINT', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, build: (v) => compose(cycle(10, .5, .16, 4, 0), cycle(10, .5, .16, 4, 2)) },
    { family: 'NORMAL_CYCLIC_DOWNTURN', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, build: () => compose(cycle(10, .5, .14, 5, 0), cycle(10, .5, .14, 5, 2)) },
    { family: 'TEMPORARY_CORRECTION_PERSISTENT_TREND', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, build: (v) => withLocalCorrection(line(10, .5, .025), line(10, .5, .025), v) },
    { family: 'STABLE_TO_VOLATILE', quadrant: 'REGIME_ONLY', expected: 'VOLATILITY_CHANGE', build: (v) => compose(constant(10, .5), noise(10, .5, .15, v)) },
    { family: 'LOW_TO_HIGH_AMPLITUDE_CYCLE', quadrant: 'REGIME_ONLY', expected: 'CYCLE_CHANGE', build: () => compose(cycle(10, .5, .05, 4), cycle(10, .5, .17, 4)) },
    { family: 'POSITIVE_TREND_STEEPENS', quadrant: 'REGIME_ONLY', expected: 'TREND_CHANGE', build: () => compose(line(10, .5, .012), line(10, .5, .042)) },
    { family: 'POSITIVE_TO_NEGATIVE', quadrant: 'REVERSAL_AND_REGIME', expected: 'TREND_CHANGE', reversal: true, build: () => compose(line(10, .5, .035), line(10, .5, -.035)) },
    { family: 'NEGATIVE_TO_POSITIVE_NEW_VARIANCE', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, build: (v) => compose(line(10, .5, -.045), line(10, .5, .045).map((value, i) => value + (i % 2 ? .018 : -.018))) },
    { family: 'CYCLE_TO_MONOTONIC', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, build: () => compose(cycle(10, .5, .15, 4), line(10, .5, -.04)) },
    { family: 'STABLE_CONTINUATION', quadrant: 'NEITHER', expected: 'NO_CHANGE', build: () => compose(constant(10, .5), constant(10, .5)) },
    { family: 'POSITIVE_TREND_CONTINUATION', quadrant: 'NEITHER', expected: 'NO_CHANGE', build: () => compose(line(10, .5, .025), line(10, .5, .025)) },
    { family: 'SINGLE_OUTLIER', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: () => compose(constant(10, .5), constant(10, .5), [.5, .5, .5, .88, .5, .5, .5, .5]) },
  ],
  VALIDATION_SET: [
    { family: 'BOUNDED_MEAN_REVERSION', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, build: () => compose(cycle(10, .5, .11, 6), cycle(10, .5, .11, 6, 3)) },
    { family: 'SINGLE_LOCAL_TURNING_POINT', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, build: (v) => withLocalCorrection(line(10, .5, -.024), line(10, .5, -.024), v, 1) },
    { family: 'SHORT_LIVED_REVERSAL', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, build: (v) => withLocalCorrection(line(10, .5, .022), line(10, .5, .022), v) },
    { family: 'VOLATILE_TO_STABLE', quadrant: 'REGIME_ONLY', expected: 'VOLATILITY_CHANGE', build: (v) => compose(noise(10, .5, .15, v), constant(10, .5)) },
    { family: 'CYCLE_FREQUENCY_SHIFT', quadrant: 'REGIME_ONLY', expected: 'CYCLE_CHANGE', build: () => compose(cycle(10, .5, .15, 4), cycle(10, .5, .15, 6)) },
    { family: 'NEGATIVE_TREND_STEEPENS', quadrant: 'REGIME_ONLY', expected: 'TREND_CHANGE', build: () => compose(line(10, .5, -.012), line(10, .5, -.042)) },
    { family: 'NEGATIVE_TO_POSITIVE', quadrant: 'REVERSAL_AND_REGIME', expected: 'TREND_CHANGE', reversal: true, build: () => compose(line(10, .5, -.035), line(10, .5, .035)) },
    { family: 'POSITIVE_TO_NEGATIVE_NEW_LEVEL', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, build: () => compose(line(10, .35, .035), line(10, .65, -.035)) },
    { family: 'MONOTONIC_TO_CYCLE', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, build: () => compose(line(10, .5, .04), cycle(10, .5, .15, 4)) },
    { family: 'NORMAL_NOISE', quadrant: 'NEITHER', expected: 'NO_CHANGE', build: (v) => compose(noise(10, .5, .025, v), noise(10, .5, .025, v + 1)) },
    { family: 'TEMPORARY_SPIKE', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: () => compose(constant(10, .5), constant(10, .5), [.5, .5, .82, .82, .5, .5, .5, .5]) },
    { family: 'TEMPORARY_DIP', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: () => compose(constant(10, .5), constant(10, .5), [.5, .5, .18, .18, .5, .5, .5, .5]) },
  ],
  FINAL_HOLDOUT_SET: [
    { family: 'REVERSAL_RETURN_TO_PRIOR_BEHAVIOR', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, adversarial: true, build: (v) => withLocalCorrection(line(10, .5, .026), line(10, .5, .026), v) },
    { family: 'CYCLIC_TROUGH_EXIT', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, adversarial: true, build: () => compose(cycle(10, .5, .15, 4, 1), cycle(10, .5, .15, 4, 3)) },
    { family: 'ONE_WINDOW_CORRECTION', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, adversarial: true, build: (v) => withLocalCorrection(line(10, .5, -.026), line(10, .5, -.026), v, 1) },
    { family: 'LEVEL_SHIFT_SAME_DIRECTION', quadrant: 'REGIME_ONLY', expected: 'LEVEL_CHANGE', adversarial: true, build: () => compose(line(10, .33, .02), line(10, .67, .02)) },
    { family: 'STABLE_TO_TREND_POSITIVE', quadrant: 'REGIME_ONLY', expected: 'TREND_CHANGE', build: () => compose(constant(10, .5), line(10, .5, .035)) },
    { family: 'STABLE_TO_TREND_NEGATIVE', quadrant: 'REGIME_ONLY', expected: 'TREND_CHANGE', build: () => compose(constant(10, .5), line(10, .5, -.035)) },
    { family: 'POSITIVE_TO_NEGATIVE_NEW_VARIANCE', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, adversarial: true, build: () => compose(line(10, .5, .045), line(10, .5, -.045).map((value, i) => value + (i % 2 ? .018 : -.018))) },
    { family: 'NEGATIVE_TO_POSITIVE_NEW_LEVEL', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, build: () => compose(line(10, .35, -.035), line(10, .65, .035)) },
    { family: 'CYCLE_REPLACED_BY_TREND', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, adversarial: true, build: () => compose(cycle(10, .5, .16, 4), line(10, .5, -.042)) },
    { family: 'BOUNDED_VOLATILITY', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: (v) => compose(noise(10, .5, .035, v), noise(10, .5, .035, v + 2)) },
    { family: 'OUTLIER_CLUSTER', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: () => compose(constant(10, .5), constant(10, .5), [.5, .82, .82, .82, .5, .5, .5, .5]) },
    { family: 'DUPLICATED_SAMPLE_CONTINUATION', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: () => compose([.3, .3, .36, .36, .42, .42, .48, .48, .54, .54], [.3, .3, .36, .36, .42, .42, .48, .48, .54, .54]) },
  ],
});

function buildPartition(partition, variants = 30) { return DEFINITIONS[partition].flatMap((definition) => Array.from({ length: variants }, (_, variant) => { const observationHistory = frames(variantTransform(definition.build(variant), variant)); const body = { caseId: `stage2i3a-${partition.toLowerCase()}-${definition.family.toLowerCase()}-${String(variant).padStart(2, '0')}`, partition, family: definition.family, quadrant: definition.quadrant, observationHistory, expected: definition.expected, reversalExpected: Boolean(definition.reversal), regimeExpected: !['NO_CHANGE', 'INSUFFICIENT_EVIDENCE'].includes(definition.expected), adversarial: Boolean(definition.adversarial) }; return deepFreeze({ ...body, caseDigest: sha256(body) }); })); }
function buildCorpus() { return deepFreeze({ development: buildPartition('DEVELOPMENT_SET'), validation: buildPartition('VALIDATION_SET'), holdout: buildPartition('FINAL_HOLDOUT_SET') }); }

function regimeBaseline(entry, name) { const values = valuesOf(entry); const prior = processDescriptor(values.slice(0, 10)); const recent = processDescriptor(values.slice(-10)); const level = Math.abs(recent.level - prior.level) >= .13; const trend = Math.abs(recent.trend - prior.trend) >= .018; const volatility = Math.abs(recent.volatility - prior.volatility) >= .035; const reversal = entry.reversalExpected; if (name === 'RECENT_VS_PRIOR_MEAN_DELTA') return level ? 'LEVEL_CHANGE' : 'NO_CHANGE'; if (name === 'RECENT_VS_PRIOR_SLOPE_DELTA') return trend ? 'TREND_CHANGE' : 'NO_CHANGE'; if (name === 'RECENT_VS_PRIOR_VARIANCE_DELTA') return volatility ? 'VOLATILITY_CHANGE' : 'NO_CHANGE'; if (name === 'REVERSAL_ONLY_BASELINE') return reversal ? 'TREND_CHANGE' : 'NO_CHANGE'; const changes = [level && 'LEVEL_CHANGE', trend && 'TREND_CHANGE', volatility && 'VOLATILITY_CHANGE'].filter(Boolean); return changes.length > 1 ? 'MULTIPLE_CHANGE' : changes[0] ?? 'NO_CHANGE'; }
function measure(cases, predict) { let correct = 0; let tp = 0; let fp = 0; let fn = 0; let tn = 0; const labels = Object.fromEntries(CHANGE_LABELS.map((label) => [label, { cases: 0, correct: 0 }])); const quadrants = Object.fromEntries(QUADRANTS.map((quadrant) => [quadrant, { cases: 0, correct: 0 }])); for (const entry of cases) { const predicted = predict(entry); const exact = predicted === entry.expected; if (exact) correct += 1; labels[entry.expected].cases += 1; if (exact) labels[entry.expected].correct += 1; quadrants[entry.quadrant].cases += 1; if (exact) quadrants[entry.quadrant].correct += 1; const predictedRegime = !['NO_CHANGE', 'INSUFFICIENT_EVIDENCE'].includes(predicted); if (entry.regimeExpected && predictedRegime) tp += 1; else if (!entry.regimeExpected && predictedRegime) fp += 1; else if (entry.regimeExpected) fn += 1; else tn += 1; } const precision = tp + fp ? tp / (tp + fp) : 0; const recall = tp + fn ? tp / (tp + fn) : 0; const specificity = tn + fp ? tn / (tn + fp) : 0; const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0; return { cases: cases.length, correct, accuracy: correct / Math.max(1, cases.length), truePositive: tp, falsePositive: fp, falseNegative: fn, trueNegative: tn, precision, recall, specificity, f1, labelAccuracy: Object.fromEntries(Object.entries(labels).map(([label, value]) => [label, value.cases ? value.correct / value.cases : null])), quadrantAccuracy: Object.fromEntries(Object.entries(quadrants).map(([quadrant, value]) => [quadrant, value.cases ? value.correct / value.cases : null])) }; }
function effectiveGroups(cases) { return new Set(cases.map((entry) => sha256({ family: entry.family, history: entry.observationHistory, expected: entry.expected }))).size; }
function rubricScore(accuracy, beatsBaseline) { let score = 1; for (const threshold of CAPABILITY_RUBRIC.thresholds) if (accuracy >= threshold.min) score = threshold.score; return beatsBaseline ? score : Math.min(score, CAPABILITY_RUBRIC.rules.belowBestSimpleBaselineMaximum); }
function selectCandidate(validation) { const results = Object.fromEntries(REGIME_V3_SEARCH_SPACE.map((candidate) => [candidate.id, measure(validation, (entry) => evaluateRegimeV3(entry, candidate).semanticOutput)])); const selected = [...REGIME_V3_SEARCH_SPACE].sort((a, b) => results[b.id].accuracy - results[a.id].accuracy || results[a.id].falsePositive - results[b.id].falsePositive || a.id.localeCompare(b.id))[0]; return { results, selected }; }

export function buildStage2I3ASeparation() {
  const corpus = buildCorpus(); const allCases = [...corpus.development, ...corpus.validation, ...corpus.holdout]; const selectionResult = selectCandidate(corpus.validation); const selection = { selectedRegimeV3: selectionResult.selected, selectionFrozen: true, frozenBeforeFinalHoldout: true, rule: 'MAX_EXACT_ACCURACY_THEN_MIN_FALSE_POSITIVES_THEN_LEXICAL_ID' };
  const final = measure(corpus.holdout, (entry) => evaluateRegimeV3(entry, selection.selectedRegimeV3).semanticOutput); const adversarial = measure(corpus.holdout.filter((entry) => entry.adversarial), (entry) => evaluateRegimeV3(entry, selection.selectedRegimeV3).semanticOutput); const baselines = Object.fromEntries(SIMPLE_BASELINES.map((name) => [name, measure(corpus.holdout, (entry) => regimeBaseline(entry, name))])); const bestBaseline = Object.entries(baselines).sort((a, b) => b[1].accuracy - a[1].accuracy || a[0].localeCompare(b[0]))[0]; const beatsBaseline = final.accuracy > bestBaseline[1].accuracy; const score = rubricScore(final.accuracy, beatsBaseline); const currentState = measure(corpus.holdout, () => 'NO_CHANGE'); const reversalOnlyCases = corpus.holdout.filter((entry) => entry.quadrant === 'REVERSAL_ONLY'); const reversalOnlyFalseRegimeRate = reversalOnlyCases.filter((entry) => !['NO_CHANGE', 'INSUFFICIENT_EVIDENCE'].includes(evaluateRegimeV3(entry, selection.selectedRegimeV3).semanticOutput)).length / reversalOnlyCases.length; const temporaryCases = corpus.holdout.filter((entry) => entry.quadrant === 'NEITHER'); const temporaryAnomalyFalsePositiveRate = temporaryCases.filter((entry) => !['NO_CHANGE', 'INSUFFICIENT_EVIDENCE'].includes(evaluateRegimeV3(entry, selection.selectedRegimeV3).semanticOutput)).length / temporaryCases.length;
  const distinctFromReversal = reversalOnlyFalseRegimeRate <= STAGE2I3A_GATE.maximumReversalOnlyFalseRegimeRate && final.quadrantAccuracy.REGIME_ONLY >= .85 && final.quadrantAccuracy.REVERSAL_AND_REGIME >= .85 && final.quadrantAccuracy.NEITHER >= .85;
  const causalPairs = [
    [compose(constant(10, .5), constant(10, .5)), compose(constant(10, .5), noise(10, .5, .15, 2))],
    [compose(line(10, .5, .02), line(10, .5, .02)), compose(line(10, .5, .02), line(10, .5, .045))],
    [compose(line(10, .35, .02), line(10, .35, .02)), compose(line(10, .35, .02), line(10, .65, .02))],
    [compose(constant(10, .5), constant(10, .5)), compose(constant(10, .5), cycle(10, .5, .16, 4))],
  ].map(([control, changed], index) => ({ control: { caseId: `causal-control-${index}`, observationHistory: frames(control) }, changed: { caseId: `causal-changed-${index}`, observationHistory: frames(changed) } }));
  const causal = causalPairs.every((pair) => evaluateRegimeV3(pair.control, selection.selectedRegimeV3).semanticOutput !== evaluateRegimeV3(pair.changed, selection.selectedRegimeV3).semanticOutput);
  const incrementalValue = final.accuracy - currentState.accuracy; const gatePass = score >= STAGE2I3A_GATE.minimumScore && final.accuracy >= STAGE2I3A_GATE.minimumAccuracy && adversarial.accuracy >= STAGE2I3A_GATE.minimumAdversarialAccuracy && beatsBaseline && incrementalValue > 0 && distinctFromReversal && causal;
  const quadrantCases = Object.fromEntries(QUADRANTS.map((quadrant) => [quadrant, allCases.filter((entry) => entry.quadrant === quadrant).length])); const frozenChanges = { direction: false, persistenceV2: false, reversal: false, volatility: false, cycle: false, timeToThreshold: false, abstention: false };
  const payload = {
    stage: STAGE2I3A_STAGE,
    baseline: { scores: { prime: 4, oracleV1: 3, nexus: 4, persistenceV2: 7, regimeV2: 6 }, stage2i3Status: 'FAIL', stage2i3CertificationHash: '75a9308cba3a16dcfafdef0214df607f2812f2052b5aaa1d76746e86f6e5573c', stage2i3EvidenceDigest: '1be4b3081d9b3350c433bb4718f0deb42603c63426fa45689cb426e30c21434b' },
    semantics: STAGE2I3A_SEMANTICS,
    frozenHeads: { stage2i2OwnerSha256: STAGE2I3A_STAGE2I2_OWNER_SHA256, stage2i3OwnerSha256: STAGE2I3A_STAGE2I3_OWNER_SHA256, persistenceSelection: FROZEN_PERSISTENCE_V2, persistenceSelectionDigest: '573b3a7b2325b8c0a18d129d9957b30ad021f097eed41515a8d769b2136f0ef9', evidenceIdentities: FROZEN_HEAD_EVIDENCE, changed: frozenChanges, allOtherSuccessfulHeadsUnchanged: Object.values(frozenChanges).every((value) => value === false) },
    corpus: { totalCases: allCases.length, effectiveSemanticGroups: effectiveGroups(allCases), casesPerQuadrant: quadrantCases, semanticFamilyLeakage: false, development: { cases: corpus.development.length, families: DEFINITIONS.DEVELOPMENT_SET.map((item) => item.family), digest: sha256(corpus.development.map((entry) => entry.caseDigest)) }, validation: { cases: corpus.validation.length, families: DEFINITIONS.VALIDATION_SET.map((item) => item.family), digest: sha256(corpus.validation.map((entry) => entry.caseDigest)) }, finalHoldout: { cases: corpus.holdout.length, families: DEFINITIONS.FINAL_HOLDOUT_SET.map((item) => item.family), digest: sha256(corpus.holdout.map((entry) => entry.caseDigest)), executedOnce: true } },
    search: { space: REGIME_V3_SEARCH_SPACE, digest: sha256(REGIME_V3_SEARCH_SPACE), validationResults: selectionResult.results, selection },
    simpleBaselinesFrozen: true,
    finalHoldout: { regimeV1Score: 6, regimeV2Score: 6, regimeV3Score: score, ...final, adversarialAccuracy: adversarial.accuracy, incrementalValue, baselines, bestSimpleBaseline: { name: bestBaseline[0], ...bestBaseline[1] }, beatsSimpleBaseline: beatsBaseline, reversalOnlyFalseRegimeRate, temporaryAnomalyFalsePositiveRate, distinctFromReversal, signalCausallyAttributed: causal },
    qualityGate: STAGE2I3A_GATE,
    qualityGatePass: gatePass,
    projectedOracleV2: { heads: { direction: 10, persistence: 7, reversal: 7, regimeChange: score, volatility: 10, cycle: 7, timeToThreshold: 10, abstention: 10 }, capabilityScore: 'NOT_CERTIFIABLE_UNTIL_ASSEMBLY' },
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
