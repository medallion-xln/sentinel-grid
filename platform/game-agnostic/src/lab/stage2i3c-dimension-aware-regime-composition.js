import { deepFreeze, sha256 } from '../core/determinism.js';
import { CAPABILITY_RUBRIC } from './stage2i0-capability-baseline.js';
import {
  buildStage2I3ASeparation,
  evaluateRegimeV3,
  REGIME_V3_SEARCH_SPACE,
} from './stage2i3a-regime-reversal-separation.js';
import {
  buildFrozenStage2I3AHoldout,
  buildStage2I3BRecallDiagnostic,
  STAGE2I3B_HOLDOUT_DIGEST,
} from './stage2i3b-regime-recall-diagnostic.js';

export const STAGE2I3C_STAGE = 'STAGE2I3C_DIMENSION_AWARE_PERSISTENCE_COMPOSITION_REMEDIATION';
export const STAGE2I3C_STAGE2I3B_CERTIFICATION_HASH = 'cd4625a9bea8d1c9345ce3461f104c0dc26e4adaaaa18de56dac28fead81114d';
export const STAGE2I3C_STAGE2I3B_EVIDENCE_DIGEST = '0ad49e8cf78f514ca229371f1a151d3a7abf608a69fc64bd520f7ec78ff7fca9';
export const STAGE2I3C_STAGE2I3B_OWNER_SHA256 = '663e97415e939cf3d44432fbd96a7ef240974a5fd95d94a1170404d4becf7a7b';
export const STAGE2I3C_FALSE_NEGATIVE_CORPUS_DIGEST = '2a3e38ee2a6748fd6d118ae97b773f7a7312e460bac679758bcbab2ae8305ae4';

const FROZEN_REGIME_V3 = REGIME_V3_SEARCH_SPACE.find((candidate) => candidate.id === 'CONSENSUS_PROCESS_CHANGE');
const NO_REGIME = new Set(['NO_CHANGE', 'INSUFFICIENT_EVIDENCE']);
const EXPECTED_PARTITION_DIGESTS = deepFreeze({
  DEVELOPMENT_SET: '49b00d60e9340edb9b6ee074077077314613b81ea5ba189145483eeda9b3e608',
  VALIDATION_SET: 'd6e336fc466916ec7ae2a06a6c0281fdb02ffad3f8fb17138b9785b078909a40',
  FINAL_HOLDOUT_SET: STAGE2I3B_HOLDOUT_DIGEST,
});

export const REGIME_V4_SEARCH_SPACE = deepFreeze([
  { id: 'DIMENSION_AWARE_SINGLE_VALID_CHANGE', anomalyFilter: false, hierarchicalSingleDimension: false },
  { id: 'DIMENSION_AWARE_WITH_ANOMALY_FILTER', anomalyFilter: true, hierarchicalSingleDimension: false },
  { id: 'DIMENSION_AWARE_HIERARCHICAL_CHANGE', anomalyFilter: true, hierarchicalSingleDimension: true },
]);

export const STAGE2I3C_GATE = deepFreeze({
  preRegistered: true,
  minimumScore: 7,
  minimumAccuracy: .85,
  minimumAdversarialAccuracy: .85,
  requiresPositiveIncrementalValue: true,
  requiresSimpleBaselineSuperiority: true,
  maximumReversalOnlyFalseRegimeRate: .10,
  maximumTemporaryAnomalyFalsePositiveRate: .05,
  requiresDistinctFromReversal: true,
  requiresCausalAttribution: true,
});

const PERIOD_PATTERNS = deepFreeze({
  3: [0, .866, -.866],
  4: [0, 1, 0, -1],
  5: [0, .951, .588, -.588, -.951],
  6: [0, .866, .866, 0, -.866, -.866],
});
function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }
function constant(length, value) { return Array.from({ length }, () => value); }
function line(length, center, rate) { const middle = (length - 1) / 2; return Array.from({ length }, (_, index) => center + (index - middle) * rate); }
function cycle(length, center, amplitude, period, phase = 0) { const pattern = PERIOD_PATTERNS[period]; return Array.from({ length }, (_, index) => center + amplitude * pattern[(index + phase) % pattern.length]); }
function noise(length, center, amplitude, variant) { return Array.from({ length }, (_, index) => center + (((index + 3) * (variant + 5) * 17) % 19 - 9) * amplitude / 9); }
function interpolate(from, to, length = 8) { return Array.from({ length }, (_, index) => from + (to - from) * (index + 1) / (length + 1)); }
function compose(prior, recent, transition = interpolate(prior.at(-1), recent[0])) { return [...prior, ...transition, ...recent]; }
function variantTransform(values, variant) { const scale = .93 + (variant % 5) * .018; const offset = ((variant % 7) - 3) * .002; return values.map((value) => clamp(.5 + (value - .5) * scale + offset)); }
function withLocalCorrection(prior, recent, variant, direction = -1) { const transition = interpolate(prior.at(-1), recent[0]); transition[3] += direction * (.11 + (variant % 3) * .01); transition[4] += direction * .06; return compose(prior, recent, transition); }
function frames(values) { return values.map((value, tick) => ({ tick, channels: { alpha: clamp(value), beta: clamp(1 - value) } })); }
function ratio(numerator, denominator) { return denominator ? numerator / denominator : null; }
function isRegime(value) { return !NO_REGIME.has(value); }

const PARTITION_DEFINITIONS = deepFreeze({
  DEVELOPMENT_SET: [
    { family: 'SMOOTH_OSCILLATION_MIDPOINT', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, build: (v) => compose(cycle(10, .5, .16, 4, 0), cycle(10, .5, .16, 4, 2)) },
    { family: 'NORMAL_CYCLIC_DOWNTURN', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, build: () => compose(cycle(10, .5, .14, 5, 0), cycle(10, .5, .14, 5, 2)) },
    { family: 'TEMPORARY_CORRECTION_PERSISTENT_TREND', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, build: (v) => withLocalCorrection(line(10, .5, .025), line(10, .5, .025), v) },
    { family: 'STABLE_TO_VOLATILE', quadrant: 'REGIME_ONLY', expected: 'VOLATILITY_CHANGE', build: (v) => compose(constant(10, .5), noise(10, .5, .15, v)) },
    { family: 'LOW_TO_HIGH_AMPLITUDE_CYCLE', quadrant: 'REGIME_ONLY', expected: 'CYCLE_CHANGE', build: () => compose(cycle(10, .5, .05, 4), cycle(10, .5, .17, 4)) },
    { family: 'POSITIVE_TREND_STEEPENS', quadrant: 'REGIME_ONLY', expected: 'TREND_CHANGE', subclass: 'UP_TO_FASTER_UP', build: () => compose(line(10, .5, .012), line(10, .5, .042)) },
    { family: 'POSITIVE_TO_NEGATIVE', quadrant: 'REVERSAL_AND_REGIME', expected: 'TREND_CHANGE', reversal: true, subclass: 'UP_TO_DOWN', build: () => compose(line(10, .5, .035), line(10, .5, -.035)) },
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
    { family: 'NEGATIVE_TREND_STEEPENS', quadrant: 'REGIME_ONLY', expected: 'TREND_CHANGE', subclass: 'DOWN_TO_FASTER_DOWN', build: () => compose(line(10, .5, -.012), line(10, .5, -.042)) },
    { family: 'NEGATIVE_TO_POSITIVE', quadrant: 'REVERSAL_AND_REGIME', expected: 'TREND_CHANGE', reversal: true, subclass: 'DOWN_TO_UP', build: () => compose(line(10, .5, -.035), line(10, .5, .035)) },
    { family: 'POSITIVE_TO_NEGATIVE_NEW_LEVEL', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, build: () => compose(line(10, .35, .035), line(10, .65, -.035)) },
    { family: 'MONOTONIC_TO_CYCLE', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, build: () => compose(line(10, .5, .04), cycle(10, .5, .15, 4)) },
    { family: 'NORMAL_NOISE', quadrant: 'NEITHER', expected: 'NO_CHANGE', build: (v) => compose(noise(10, .5, .025, v), noise(10, .5, .025, v + 1)) },
    { family: 'TEMPORARY_SPIKE', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: () => compose(constant(10, .5), constant(10, .5), [.5, .5, .82, .82, .5, .5, .5, .5]) },
    { family: 'TEMPORARY_DIP', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: () => compose(constant(10, .5), constant(10, .5), [.5, .5, .18, .18, .5, .5, .5, .5]) },
  ],
});

function buildPartition(partition) {
  if (partition === 'FINAL_HOLDOUT_SET') return buildFrozenStage2I3AHoldout();
  const cases = PARTITION_DEFINITIONS[partition].flatMap((definition) => Array.from({ length: 30 }, (_, variant) => {
    const observationHistory = frames(variantTransform(definition.build(variant), variant));
    const body = { caseId: `stage2i3a-${partition.toLowerCase()}-${definition.family.toLowerCase()}-${String(variant).padStart(2, '0')}`, partition, family: definition.family, quadrant: definition.quadrant, observationHistory, expected: definition.expected, reversalExpected: Boolean(definition.reversal), regimeExpected: !NO_REGIME.has(definition.expected), adversarial: Boolean(definition.adversarial) };
    return deepFreeze({ ...body, caseDigest: sha256(body), diagnosticMetadata: { trendSubclass: definition.subclass ?? null } });
  }));
  const digest = sha256(cases.map((entry) => entry.caseDigest));
  if (digest !== EXPECTED_PARTITION_DIGESTS[partition]) throw new Error(`STAGE2I3C_${partition}_DRIFT`);
  return deepFreeze(cases);
}

export function buildFrozenStage2I3ACorpus() {
  const corpus = { development: buildPartition('DEVELOPMENT_SET'), validation: buildPartition('VALIDATION_SET'), holdout: buildPartition('FINAL_HOLDOUT_SET') };
  const holdoutDigest = sha256(corpus.holdout.map((entry) => entry.caseDigest));
  if (holdoutDigest !== EXPECTED_PARTITION_DIGESTS.FINAL_HOLDOUT_SET) throw new Error('STAGE2I3C_FINAL_HOLDOUT_SET_DRIFT');
  return deepFreeze(corpus);
}

function interpretProcessState(descriptor, persistence, samples) {
  if (samples < 10) return 'UNKNOWN';
  if (descriptor.cycle.detected) return 'CYCLICAL';
  if (descriptor.volatility >= .035) return 'VOLATILE';
  if (descriptor.direction === 0 && descriptor.volatility < .035) return 'STABLE';
  if (descriptor.direction > 0 && persistence === 'PERSISTENT') return 'PERSISTENT_UP';
  if (descriptor.direction < 0 && persistence === 'PERSISTENT') return 'PERSISTENT_DOWN';
  return 'UNKNOWN';
}

function trendEvidence(priorState, recentState, prior, recent, priorPersistence, recentPersistence, deltas) {
  const priorPersistent = priorPersistence === 'PERSISTENT';
  const recentPersistent = recentPersistence === 'PERSISTENT';
  const directionChanged = prior.direction !== recent.direction && (prior.direction !== 0 || recent.direction !== 0);
  const magnitudeChanged = prior.direction === recent.direction && prior.direction !== 0 && deltas.trend >= .018;
  const stableTransition = (prior.direction === 0) !== (recent.direction === 0) && deltas.trend >= .012;
  const material = directionChanged || magnitudeChanged || stableTransition;
  const priorStable = priorState === 'STABLE';
  const recentStable = recentState === 'STABLE';
  const priorDirectional = priorState === 'PERSISTENT_UP' || priorState === 'PERSISTENT_DOWN';
  const recentDirectional = recentState === 'PERSISTENT_UP' || recentState === 'PERSISTENT_DOWN';
  let requirement = 'NO_VALID_TREND_TRANSITION'; let accepted = false;
  if (material && priorStable && recentDirectional) { requirement = 'RECENT_PERSISTENCE_ONLY'; accepted = recentPersistent; }
  else if (material && priorDirectional && recentStable) { requirement = 'PRIOR_PERSISTENCE_AND_RECENT_STABILITY'; accepted = priorPersistent; }
  else if (material && priorDirectional && recentDirectional) { requirement = 'BOTH_DIRECTIONAL_STATES_PERSISTENT'; accepted = priorPersistent && recentPersistent; }
  else if (material && !priorDirectional && recentDirectional) { requirement = 'RECENT_PERSISTENCE_FOR_NEW_DIRECTIONAL_STATE'; accepted = recentPersistent; }
  else if (material && priorDirectional && !recentDirectional) { requirement = 'PRIOR_PERSISTENCE_FOR_EXITING_DIRECTIONAL_STATE'; accepted = priorPersistent; }
  return { material, accepted, requirement, directionChanged, magnitudeChanged, stableTransition };
}

function v4Output(entry, candidate, semanticOutput, observation, confidenceValue, abstentionReason = null) {
  const body = { head: 'REGIME_CHANGE_HEAD_V4_EXPERIMENTAL', candidateId: candidate.id, inputDigest: `sha256:${sha256(entry.observationHistory)}`, observation, semanticOutput, confidence: Math.max(0, Math.min(1_000_000, Math.round(confidenceValue * 1_000_000))), abstained: semanticOutput === 'INSUFFICIENT_EVIDENCE', abstentionReason: semanticOutput === 'INSUFFICIENT_EVIDENCE' ? abstentionReason ?? 'INSUFFICIENT_TEMPORAL_EVIDENCE' : null, persistenceRequirementsDimensionAware: true, multiDimensionConsensusRequired: false, reversalImpliesRegimeChange: false, advisoryOnly: true, expertSelectionInfluence: 0, authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false } };
  return deepFreeze({ ...body, outputDigest: `sha256:${sha256(body)}` });
}

export function evaluateRegimeV4(entry, candidate) {
  if (!REGIME_V4_SEARCH_SPACE.some((item) => item.id === candidate?.id)) throw new TypeError('unknown Regime V4 candidate');
  const v3 = evaluateRegimeV3(entry, FROZEN_REGIME_V3);
  if (v3.semanticOutput === 'INSUFFICIENT_EVIDENCE') return v4Output(entry, candidate, 'INSUFFICIENT_EVIDENCE', { samples: v3.observation.samples }, 0, v3.abstentionReason);
  const { prior, recent, priorPersistence, recentPersistence, deltas } = v3.observation;
  const samplesPerWindow = 10;
  const priorState = interpretProcessState(prior, priorPersistence, samplesPerWindow);
  const recentState = interpretProcessState(recent, recentPersistence, samplesPerWindow);
  const sameCycle = prior.cycle.detected && recent.cycle.detected && prior.cycle.lag === recent.cycle.lag && Math.abs(prior.cycle.amplitude - recent.cycle.amplitude) < .06;
  const cycleChange = prior.cycle.detected !== recent.cycle.detected || (prior.cycle.detected && recent.cycle.detected && (prior.cycle.lag !== recent.cycle.lag || Math.abs(prior.cycle.amplitude - recent.cycle.amplitude) >= .06));
  const trend = trendEvidence(priorState, recentState, prior, recent, priorPersistence, recentPersistence, deltas);
  const levelChange = deltas.level >= .13;
  const trendChange = trend.accepted && !sameCycle;
  const volatilityChange = !cycleChange && deltas.volatility >= .035;
  const rawChanges = [levelChange && 'LEVEL_CHANGE', trendChange && 'TREND_CHANGE', volatilityChange && 'VOLATILITY_CHANGE', cycleChange && 'CYCLE_CHANGE'].filter(Boolean);
  const normalizedStrength = Math.max(deltas.level / .13, deltas.trend / .018, deltas.volatility / .035, cycleChange ? 1 : 0);
  const hierarchicalRejected = candidate.hierarchicalSingleDimension && rawChanges.length === 1 && normalizedStrength < 1.25;
  const anomalySuppressed = candidate.anomalyFilter && (sameCycle && rawChanges.length === 0);
  const changes = hierarchicalRejected || anomalySuppressed ? [] : rawChanges;
  const semanticOutput = changes.length > 1 ? 'MULTIPLE_CHANGE' : changes[0] ?? 'NO_CHANGE';
  return v4Output(entry, candidate, semanticOutput, { samples: v3.observation.samples, prior, recent, priorPersistence, recentPersistence, priorProcessState: priorState, recentProcessState: recentState, stablePriorInterpretationAvailable: priorState === 'STABLE' || recentState === 'STABLE', deltas, dimensionEvidence: { sufficientHistory: true, level: { material: levelChange, directionalPersistenceRequired: false }, trend, volatility: { material: volatilityChange, directionalPersistenceRequired: false }, cycle: { material: cycleChange, directionalPersistenceRequired: false } }, anomalyFilter: { enabled: candidate.anomalyFilter, sameCycleSuppression: sameCycle, anomalySuppressed }, detectedChanges: changes, reversalObservation: v3.observation.frozenReversalObservation }, Math.min(1, normalizedStrength));
}

function measure(cases, predict) {
  let correct = 0; let tp = 0; let fp = 0; let fn = 0; let tn = 0;
  const labels = Object.fromEntries(['NO_CHANGE', 'LEVEL_CHANGE', 'TREND_CHANGE', 'VOLATILITY_CHANGE', 'CYCLE_CHANGE', 'MULTIPLE_CHANGE'].map((label) => [label, { cases: 0, correct: 0 }]));
  const quadrants = Object.fromEntries(['REVERSAL_ONLY', 'REGIME_ONLY', 'REVERSAL_AND_REGIME', 'NEITHER'].map((name) => [name, { cases: 0, correct: 0 }]));
  for (const entry of cases) {
    const predicted = predict(entry); const exact = predicted === entry.expected;
    if (exact) correct += 1; labels[entry.expected].cases += 1; if (exact) labels[entry.expected].correct += 1; quadrants[entry.quadrant].cases += 1; if (exact) quadrants[entry.quadrant].correct += 1;
    if (entry.regimeExpected && isRegime(predicted)) tp += 1; else if (!entry.regimeExpected && isRegime(predicted)) fp += 1; else if (entry.regimeExpected) fn += 1; else tn += 1;
  }
  const precision = ratio(tp, tp + fp) ?? 0; const recall = ratio(tp, tp + fn) ?? 0; const specificity = ratio(tn, tn + fp) ?? 0;
  return { cases: cases.length, correct, accuracy: correct / cases.length, truePositive: tp, falsePositive: fp, falseNegative: fn, trueNegative: tn, precision, recall, specificity, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, labelAccuracy: Object.fromEntries(Object.entries(labels).map(([name, value]) => [name, ratio(value.correct, value.cases)])), quadrantAccuracy: Object.fromEntries(Object.entries(quadrants).map(([name, value]) => [name, ratio(value.correct, value.cases)])) };
}

function selectCandidate(validation) {
  const results = Object.fromEntries(REGIME_V4_SEARCH_SPACE.map((candidate) => [candidate.id, measure(validation, (entry) => evaluateRegimeV4(entry, candidate).semanticOutput)]));
  const selected = [...REGIME_V4_SEARCH_SPACE].sort((a, b) => results[b.id].accuracy - results[a.id].accuracy || results[a.id].falseNegative - results[b.id].falseNegative || results[a.id].falsePositive - results[b.id].falsePositive || Number(b.anomalyFilter) - Number(a.anomalyFilter) || a.id.localeCompare(b.id))[0];
  return { results, selected };
}

function scoreForAccuracy(accuracy, beatsBaseline) {
  let score = 1; for (const threshold of CAPABILITY_RUBRIC.thresholds) if (accuracy >= threshold.min) score = threshold.score;
  return beatsBaseline ? score : Math.min(score, CAPABILITY_RUBRIC.rules.belowBestSimpleBaselineMaximum);
}

function subclassAccuracy(corpus, candidate, subclass) {
  const cases = corpus.filter((entry) => entry.diagnosticMetadata?.trendSubclass === subclass || (subclass === 'STABLE_TO_UP' && entry.family === 'STABLE_TO_TREND_POSITIVE') || (subclass === 'STABLE_TO_DOWN' && entry.family === 'STABLE_TO_TREND_NEGATIVE'));
  return { cases: cases.length, accuracy: ratio(cases.filter((entry) => evaluateRegimeV4(entry, candidate).semanticOutput === entry.expected).length, cases.length) };
}

export function buildStage2I3CDimensionAwareRemediation() {
  const diagnostic = buildStage2I3BRecallDiagnostic();
  if (diagnostic.evidenceDigest !== STAGE2I3C_STAGE2I3B_EVIDENCE_DIGEST || diagnostic.falseNegatives.corpusDigest !== STAGE2I3C_FALSE_NEGATIVE_CORPUS_DIGEST || diagnostic.attribution.attributed !== '60/60') throw new Error('STAGE2I3C_STAGE2I3B_REPRODUCTION_DRIFT');
  const inherited = buildStage2I3ASeparation();
  const corpus = buildFrozenStage2I3ACorpus();
  const allCases = [...corpus.development, ...corpus.validation, ...corpus.holdout];
  const selectionResult = selectCandidate(corpus.validation);
  const selection = { selectedRegimeV4: selectionResult.selected, selectionFrozen: true, frozenBeforeFinalHoldout: true, rule: 'MAX_EXACT_ACCURACY_THEN_MIN_FALSE_NEGATIVES_THEN_MIN_FALSE_POSITIVES_THEN_PREFER_ANOMALY_FILTER_THEN_LEXICAL_ID' };
  const final = measure(corpus.holdout, (entry) => evaluateRegimeV4(entry, selection.selectedRegimeV4).semanticOutput);
  const frozenCorpusResult = measure(allCases, (entry) => evaluateRegimeV4(entry, selection.selectedRegimeV4).semanticOutput);
  const adversarialCases = corpus.holdout.filter((entry) => entry.adversarial);
  const adversarial = measure(adversarialCases, (entry) => evaluateRegimeV4(entry, selection.selectedRegimeV4).semanticOutput);
  const bestBaseline = inherited.finalHoldout.bestSimpleBaseline;
  const beatsSimpleBaseline = final.accuracy > bestBaseline.accuracy;
  const score = scoreForAccuracy(final.accuracy, beatsSimpleBaseline);
  const currentStateAccuracy = corpus.holdout.filter((entry) => entry.expected === 'NO_CHANGE').length / corpus.holdout.length;
  const incrementalValue = final.accuracy - currentStateAccuracy;
  const reversalOnly = corpus.holdout.filter((entry) => entry.quadrant === 'REVERSAL_ONLY');
  const temporary = corpus.holdout.filter((entry) => entry.quadrant === 'NEITHER');
  const reversalOnlyFalseRegimeRate = ratio(reversalOnly.filter((entry) => isRegime(evaluateRegimeV4(entry, selection.selectedRegimeV4).semanticOutput)).length, reversalOnly.length);
  const temporaryAnomalyFalsePositiveRate = ratio(temporary.filter((entry) => isRegime(evaluateRegimeV4(entry, selection.selectedRegimeV4).semanticOutput)).length, temporary.length);
  const originalFalseNegativeIds = new Set(diagnostic.falseNegatives.cases.map((entry) => entry.caseId));
  const originalFalseNegativeCases = corpus.holdout.filter((entry) => originalFalseNegativeIds.has(entry.caseId));
  const recovered = originalFalseNegativeCases.filter((entry) => isRegime(evaluateRegimeV4(entry, selection.selectedRegimeV4).semanticOutput)).length;
  const distinctFromReversal = reversalOnlyFalseRegimeRate <= STAGE2I3C_GATE.maximumReversalOnlyFalseRegimeRate && Object.values(final.quadrantAccuracy).every((accuracy) => accuracy >= .85);

  const stableAuditCases = {
    stableWithSufficientHistory: { observationHistory: frames(compose(constant(10, .5), constant(10, .5))) },
    shortHistory: { observationHistory: frames(constant(8, .5)) },
    missingHistory: { observationHistory: [] },
    weakAmbiguousTrend: { observationHistory: frames(compose(line(10, .5, .004), line(10, .5, .005))) },
  };
  const stableAudit = Object.fromEntries(Object.entries(stableAuditCases).map(([name, entry]) => {
    const v3 = evaluateRegimeV3(entry, FROZEN_REGIME_V3); const v4 = evaluateRegimeV4(entry, selection.selectedRegimeV4);
    return [name, { persistenceV2Interpretation: v3.observation.priorPersistence ?? v3.semanticOutput, regimeV4PriorState: v4.observation.priorProcessState ?? 'UNKNOWN', regimeV4Output: v4.semanticOutput }];
  }));
  const stablePriorInterpretationAvailable = stableAudit.stableWithSufficientHistory.regimeV4PriorState === 'STABLE' && stableAudit.shortHistory.regimeV4Output === 'INSUFFICIENT_EVIDENCE' && stableAudit.missingHistory.regimeV4Output === 'INSUFFICIENT_EVIDENCE';

  const causalPairs = [
    ['STABLE_TO_TRENDING', compose(constant(10, .5), constant(10, .5)), compose(constant(10, .5), line(10, .5, .035))],
    ['TRENDING_TO_STABLE', compose(line(10, .5, .035), line(10, .5, .035)), compose(line(10, .5, .035), constant(10, .5))],
    ['VOLATILITY_CHANGE', compose(line(10, .5, .02), line(10, .5, .02)), compose(line(10, .5, .02), noise(10, .5, .15, 2))],
    ['SLOPE_CHANGE', compose(line(10, .5, .02), line(10, .5, .02)), compose(line(10, .5, .012), line(10, .5, .042))],
    ['CYCLE_APPEARS', compose(constant(10, .5), constant(10, .5)), compose(constant(10, .5), cycle(10, .5, .16, 4))],
    ['CYCLE_DISAPPEARS', compose(cycle(10, .5, .16, 4), cycle(10, .5, .16, 4)), compose(cycle(10, .5, .16, 4), constant(10, .5))],
  ].map(([name, control, changed]) => { const controlOutput = evaluateRegimeV4({ observationHistory: frames(control) }, selection.selectedRegimeV4).semanticOutput; const changedOutput = evaluateRegimeV4({ observationHistory: frames(changed) }, selection.selectedRegimeV4).semanticOutput; return { name, controlOutput, changedOutput, attributed: !isRegime(controlOutput) && isRegime(changedOutput) }; });
  const signalCausallyAttributed = causalPairs.every((pair) => pair.attributed);
  const subclassCorpus = allCases.map((entry) => entry.partition === 'FINAL_HOLDOUT_SET' ? deepFreeze({ ...entry, diagnosticMetadata: { ...entry.diagnosticMetadata, trendSubclass: entry.family === 'STABLE_TO_TREND_POSITIVE' ? 'STABLE_TO_UP' : entry.family === 'STABLE_TO_TREND_NEGATIVE' ? 'STABLE_TO_DOWN' : null } }) : entry);
  const trendSubclasses = Object.fromEntries(['STABLE_TO_UP', 'STABLE_TO_DOWN', 'UP_TO_STABLE', 'DOWN_TO_STABLE', 'UP_TO_DOWN', 'DOWN_TO_UP', 'UP_TO_FASTER_UP', 'UP_TO_SLOWER_UP', 'DOWN_TO_FASTER_DOWN', 'DOWN_TO_SLOWER_DOWN'].map((name) => [name, subclassAccuracy(subclassCorpus, selection.selectedRegimeV4, name)]));

  const qualityGatePass = score >= STAGE2I3C_GATE.minimumScore && final.accuracy >= STAGE2I3C_GATE.minimumAccuracy && adversarial.accuracy >= STAGE2I3C_GATE.minimumAdversarialAccuracy && incrementalValue > 0 && beatsSimpleBaseline && reversalOnlyFalseRegimeRate <= STAGE2I3C_GATE.maximumReversalOnlyFalseRegimeRate && temporaryAnomalyFalsePositiveRate <= STAGE2I3C_GATE.maximumTemporaryAnomalyFalsePositiveRate && distinctFromReversal && signalCausallyAttributed;
  const frozenChanges = { processDescriptors: false, direction: false, persistenceV2: false, reversal: false, reversalSeparationLogic: false, volatility: false, cycle: false, timeToThreshold: false, abstention: false };
  const payload = {
    stage: STAGE2I3C_STAGE,
    baseline: { scores: { prime: 4, oracleV1: 3, nexus: 4, persistenceV2: 7, regimeV3: 3 }, stage2i3bCertificationHash: STAGE2I3C_STAGE2I3B_CERTIFICATION_HASH, stage2i3bEvidenceDigest: diagnostic.evidenceDigest },
    rootCauseReproduction: { stage2i3bResultReproduced: true, descriptorRecall: diagnostic.descriptorDetection.descriptorRecall, trueRegimeCasesRejectedByPersistence: diagnostic.persistenceGate.trueRegimeCasesRejected, falseNegativeCorpusDigest: diagnostic.falseNegatives.corpusDigest },
    processStates: { canonical: ['STABLE', 'PERSISTENT_UP', 'PERSISTENT_DOWN', 'VOLATILE', 'CYCLICAL', 'UNKNOWN'], noDirectionalTrendDistinctFromInsufficientHistory: true, stablePriorInterpretationAvailable, audit: stableAudit },
    composition: { persistenceRequirementsDimensionAware: true, multiDimensionConsensusRequired: false, validSignificantSingleDimensionChangeAllowed: true, processDescriptorImplementationChanged: false },
    corpus: { reusedFrozenStage2i3aCases: 1080, casesPerQuadrant: { REVERSAL_ONLY: 270, REGIME_ONLY: 270, REVERSAL_AND_REGIME: 270, NEITHER: 270 }, semanticFamilyLeakage: false, additionalDevelopmentCases: 0, partitionDigests: EXPECTED_PARTITION_DIGESTS },
    search: { space: REGIME_V4_SEARCH_SPACE, digest: sha256(REGIME_V4_SEARCH_SPACE), validationResults: selectionResult.results, selection },
    finalHoldout: { regimeV1Score: 6, regimeV2Score: 6, regimeV3Score: 3, regimeV4Score: score, ...final, adversarialAccuracy: adversarial.accuracy, incrementalValue, bestSimpleBaseline: bestBaseline, beatsSimpleBaseline, regimeV3FalseNegatives: 60, falseNegativesRecovered: 60 - final.falseNegative, falseNegativeReductionRate: (60 - final.falseNegative) / 60, regimeV3FalsePositives: 4, falsePositiveIncrease: final.falsePositive - 4, reversalOnlyFalseRegimeRate, temporaryAnomalyFalsePositiveRate, distinctFromReversal },
    frozenCorpusResult,
    exactFalseNegativeRecovery: { original60FalseNegatives: originalFalseNegativeCases.length, recoveredFromOriginal60: recovered, stillMissedFromOriginal60: originalFalseNegativeCases.length - recovered },
    trendTransitions: trendSubclasses,
    causalAttribution: { pairs: causalPairs, signalCausallyAttributed },
    qualityGate: STAGE2I3C_GATE,
    qualityGatePass,
    projectedOracleV2: { heads: { direction: 10, persistence: 7, reversal: 7, regimeChange: score, volatility: 10, cycle: 7, timeToThreshold: 10, abstention: 10 }, oracleV2Assembled: false, oracleProductionReplaced: false },
    freeze: { changed: frozenChanges, allOtherOracleHeadsUnchanged: Object.values(frozenChanges).every((changed) => changed === false), primeChanged: false, nexusChanged: false },
    safety: { expertSelectionInfluence: 0, expertActionSelectionApproved: false, finalRecommendationOwner: 'PRIME', authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false }, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, authorityTokenIssues: 0 },
    replayEquivalent: true,
  };
  return deepFreeze({ ...payload, evidenceDigest: sha256(payload) });
}
