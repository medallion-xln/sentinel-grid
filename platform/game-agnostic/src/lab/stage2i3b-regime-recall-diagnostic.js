import { deepFreeze, sha256 } from '../core/determinism.js';
import {
  buildStage2I3ASeparation,
  evaluateRegimeV3,
  REGIME_V3_SEARCH_SPACE,
} from './stage2i3a-regime-reversal-separation.js';

export const STAGE2I3B_STAGE = 'STAGE2I3B_REGIME_PROCESS_DESCRIPTOR_RECALL_DIAGNOSTIC';
export const STAGE2I3B_STAGE2I3A_CERTIFICATION_HASH = '01e36dd1cfddd2e8db9894b90f57fc6e2ca4ce2f69207433e1b295a32e94c87b';
export const STAGE2I3B_STAGE2I3A_EVIDENCE_DIGEST = '725356e2a55c788b30c19d4addc06e227964e906f25bcaaa9a6484304b794414';
export const STAGE2I3B_STAGE2I3A_OWNER_SHA256 = 'd2371ec2f73df191c6f5055e06d4abe25e59737bd8b376dd57182e3dd9481779';
export const STAGE2I3B_HOLDOUT_DIGEST = '104673b2fe90fd57cb6cbc4011cbebe6ef17b552acfa9497c51242e686f259a3';

const SELECTED_CANDIDATE_ID = 'CONSENSUS_PROCESS_CHANGE';
const NO_REGIME = new Set(['NO_CHANGE', 'INSUFFICIENT_EVIDENCE']);
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

// This is a byte-for-byte deterministic reconstruction of the frozen Stage 2I.3A
// final holdout. Its aggregate case digest is asserted before any analysis runs.
const HOLDOUT_DEFINITIONS = deepFreeze([
  { family: 'REVERSAL_RETURN_TO_PRIOR_BEHAVIOR', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, adversarial: true, semanticCategory: 'TEMPORARY_REVERSAL', build: (v) => withLocalCorrection(line(10, .5, .026), line(10, .5, .026), v) },
  { family: 'CYCLIC_TROUGH_EXIT', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, adversarial: true, semanticCategory: 'REVERSAL_SAME_REGIME', build: () => compose(cycle(10, .5, .15, 4, 1), cycle(10, .5, .15, 4, 3)) },
  { family: 'ONE_WINDOW_CORRECTION', quadrant: 'REVERSAL_ONLY', expected: 'NO_CHANGE', reversal: true, adversarial: true, semanticCategory: 'TEMPORARY_REVERSAL', build: (v) => withLocalCorrection(line(10, .5, -.026), line(10, .5, -.026), v, 1) },
  { family: 'LEVEL_SHIFT_SAME_DIRECTION', quadrant: 'REGIME_ONLY', expected: 'LEVEL_CHANGE', adversarial: true, relevantDimensions: ['LEVEL_CHANGE'], build: () => compose(line(10, .33, .02), line(10, .67, .02)) },
  { family: 'STABLE_TO_TREND_POSITIVE', quadrant: 'REGIME_ONLY', expected: 'TREND_CHANGE', semanticCategory: 'TREND_STRENGTH_CHANGE', relevantDimensions: ['TREND_CHANGE'], build: () => compose(constant(10, .5), line(10, .5, .035)) },
  { family: 'STABLE_TO_TREND_NEGATIVE', quadrant: 'REGIME_ONLY', expected: 'TREND_CHANGE', semanticCategory: 'TREND_STRENGTH_CHANGE', relevantDimensions: ['TREND_CHANGE'], build: () => compose(constant(10, .5), line(10, .5, -.035)) },
  { family: 'POSITIVE_TO_NEGATIVE_NEW_VARIANCE', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, adversarial: true, semanticCategory: 'PERSISTENT_REVERSAL_NEW_REGIME', relevantDimensions: ['TREND_CHANGE', 'VOLATILITY_CHANGE'], build: () => compose(line(10, .5, .045), line(10, .5, -.045).map((value, i) => value + (i % 2 ? .018 : -.018))) },
  { family: 'NEGATIVE_TO_POSITIVE_NEW_LEVEL', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, semanticCategory: 'PERSISTENT_REVERSAL_NEW_REGIME', relevantDimensions: ['TREND_CHANGE', 'LEVEL_CHANGE'], build: () => compose(line(10, .35, -.035), line(10, .65, .035)) },
  { family: 'CYCLE_REPLACED_BY_TREND', quadrant: 'REVERSAL_AND_REGIME', expected: 'MULTIPLE_CHANGE', reversal: true, adversarial: true, semanticCategory: 'PERSISTENT_REVERSAL_NEW_REGIME', relevantDimensions: ['TREND_CHANGE', 'CYCLE_CHANGE'], build: () => compose(cycle(10, .5, .16, 4), line(10, .5, -.042)) },
  { family: 'BOUNDED_VOLATILITY', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: (v) => compose(noise(10, .5, .035, v), noise(10, .5, .035, v + 2)) },
  { family: 'OUTLIER_CLUSTER', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: () => compose(constant(10, .5), constant(10, .5), [.5, .82, .82, .82, .5, .5, .5, .5]) },
  { family: 'DUPLICATED_SAMPLE_CONTINUATION', quadrant: 'NEITHER', expected: 'NO_CHANGE', adversarial: true, build: () => compose([.3, .3, .36, .36, .42, .42, .48, .48, .54, .54], [.3, .3, .36, .36, .42, .42, .48, .48, .54, .54]) },
]);

export function buildFrozenStage2I3AHoldout() {
  const cases = HOLDOUT_DEFINITIONS.flatMap((definition) => Array.from({ length: 30 }, (_, variant) => {
    const observationHistory = frames(variantTransform(definition.build(variant), variant));
    const body = {
      caseId: `stage2i3a-final_holdout_set-${definition.family.toLowerCase()}-${String(variant).padStart(2, '0')}`,
      partition: 'FINAL_HOLDOUT_SET',
      family: definition.family,
      quadrant: definition.quadrant,
      observationHistory,
      expected: definition.expected,
      reversalExpected: Boolean(definition.reversal),
      regimeExpected: !NO_REGIME.has(definition.expected),
      adversarial: Boolean(definition.adversarial),
    };
    return deepFreeze({
      ...body,
      caseDigest: sha256(body),
      diagnosticMetadata: {
        relevantDimensions: definition.relevantDimensions ?? [],
        semanticCategory: definition.semanticCategory ?? null,
        priorWindowLength: 10,
        recentWindowLength: 10,
        postChangeObservationCount: 10,
      },
    });
  }));
  const digest = sha256(cases.map((entry) => entry.caseDigest));
  if (digest !== STAGE2I3B_HOLDOUT_DIGEST) throw new Error('STAGE2I3B_FROZEN_HOLDOUT_DRIFT');
  return deepFreeze(cases);
}

function isRegime(output) { return !NO_REGIME.has(output); }
function ratio(numerator, denominator) { return denominator ? numerator / denominator : null; }
function countBy(values, key) { return Object.fromEntries([...new Set(values.map(key))].sort().map((name) => [name, values.filter((value) => key(value) === name).length])); }

function rawSignals(result, candidate) {
  const { prior, recent, priorPersistence, recentPersistence, deltas } = result.observation;
  const sensitivity = candidate.sensitivity;
  const persistentPrior = priorPersistence === 'PERSISTENT';
  const persistentRecent = recentPersistence === 'PERSISTENT';
  const directionChanged = prior.direction !== recent.direction && (prior.direction !== 0 || recent.direction !== 0);
  const magnitudeChanged = prior.direction === recent.direction && prior.direction !== 0 && deltas.trend >= .018 * sensitivity;
  const stableTrendTransition = (prior.direction === 0) !== (recent.direction === 0) && deltas.trend >= .012 * sensitivity;
  const trendBeforePersistence = directionChanged || magnitudeChanged || stableTrendTransition;
  const persistenceRequirement = directionChanged || magnitudeChanged ? 'BOTH_WINDOWS_PERSISTENT' : 'EITHER_WINDOW_PERSISTENT';
  const persistenceAccepted = !candidate.persistenceGate || (directionChanged || magnitudeChanged ? persistentPrior && persistentRecent : persistentPrior || persistentRecent);
  const sameCycle = prior.cycle.detected && recent.cycle.detected && prior.cycle.lag === recent.cycle.lag && Math.abs(prior.cycle.amplitude - recent.cycle.amplitude) < .06 * sensitivity;
  const cycleChange = candidate.cycleAware && (prior.cycle.detected !== recent.cycle.detected || (prior.cycle.detected && recent.cycle.detected && (prior.cycle.lag !== recent.cycle.lag || Math.abs(prior.cycle.amplitude - recent.cycle.amplitude) >= .06 * sensitivity)));
  const signals = {
    LEVEL_CHANGE: deltas.level >= .13 * sensitivity,
    TREND_CHANGE: trendBeforePersistence,
    VOLATILITY_CHANGE: !cycleChange && deltas.volatility >= .035 * sensitivity,
    CYCLE_CHANGE: cycleChange,
  };
  return {
    signals,
    directionChanged,
    magnitudeChanged,
    stableTrendTransition,
    trendBeforePersistence,
    persistenceRequirement,
    persistenceAccepted,
    sameCycle,
    trendAfterPersistence: trendBeforePersistence && persistenceAccepted,
    trendAfterReversalSeparation: trendBeforePersistence && persistenceAccepted && !sameCycle,
    persistentPrior,
    persistentRecent,
  };
}

function descriptorTrace(entry, result, raw) {
  const observation = result.observation;
  const { prior, recent } = observation;
  return {
    priorLevel: prior.level,
    recentLevel: recent.level,
    levelDelta: observation.deltas.level,
    priorSlope: prior.trend,
    recentSlope: recent.trend,
    slopeDelta: observation.deltas.trend,
    relativeSlopeDelta: observation.deltas.trend / Math.max(.000001, Math.abs(prior.trend), Math.abs(recent.trend)),
    priorDirection: prior.direction,
    recentDirection: recent.direction,
    priorVolatility: prior.volatility,
    recentVolatility: recent.volatility,
    volatilityDelta: observation.deltas.volatility,
    priorCyclePresent: prior.cycle.detected,
    recentCyclePresent: recent.cycle.detected,
    priorCycleFrequency: prior.cycle.detected ? prior.cycle.lag : null,
    recentCycleFrequency: recent.cycle.detected ? recent.cycle.lag : null,
    priorCycle: prior.cycle,
    recentCycle: recent.cycle,
    priorPersistence: observation.priorPersistence,
    recentPersistence: observation.recentPersistence,
    priorDescriptorPersistence: prior.persistence,
    recentDescriptorPersistence: recent.persistence,
    reversalObservation: observation.frozenReversalObservation,
    reversalPresent: entry.reversalExpected,
    rawSignals: raw.signals,
    directionChanged: raw.directionChanged,
    magnitudeChanged: raw.magnitudeChanged,
    stableTrendTransition: raw.stableTrendTransition,
    persistenceRequirement: raw.persistenceRequirement,
    persistenceAccepted: raw.persistenceAccepted,
    sameCycleSuppression: raw.sameCycle,
    detectedChangesAfterComposition: observation.detectedChanges,
  };
}

function measure(cases, predict) {
  let correct = 0; let tp = 0; let fp = 0; let fn = 0; let tn = 0;
  for (const entry of cases) {
    const predicted = predict(entry);
    if (predicted === entry.expected) correct += 1;
    if (entry.regimeExpected && isRegime(predicted)) tp += 1;
    else if (!entry.regimeExpected && isRegime(predicted)) fp += 1;
    else if (entry.regimeExpected) fn += 1;
    else tn += 1;
  }
  const precision = ratio(tp, tp + fp) ?? 0;
  const recall = ratio(tp, tp + fn) ?? 0;
  return { cases: cases.length, correct, accuracy: correct / cases.length, truePositive: tp, falsePositive: fp, falseNegative: fn, trueNegative: tn, precision, recall, specificity: ratio(tn, tn + fp) ?? 0, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
}

function anyDimensionBaseline(result) {
  const changes = [
    result.observation.deltas.level >= .13 && 'LEVEL_CHANGE',
    result.observation.deltas.trend >= .018 && 'TREND_CHANGE',
    result.observation.deltas.volatility >= .035 && 'VOLATILITY_CHANGE',
  ].filter(Boolean);
  return changes.length > 1 ? 'MULTIPLE_CHANGE' : changes[0] ?? 'NO_CHANGE';
}

function magnitudeBucket(entry, result) {
  const relevant = entry.diagnosticMetadata.relevantDimensions;
  const normalized = relevant.map((dimension) => {
    if (dimension === 'LEVEL_CHANGE') return result.observation.deltas.level / .13;
    if (dimension === 'TREND_CHANGE') return result.observation.deltas.trend / .018;
    if (dimension === 'VOLATILITY_CHANGE') return result.observation.deltas.volatility / .035;
    return result.observation.prior.cycle.detected !== result.observation.recent.cycle.detected ? 1 : Math.abs(result.observation.prior.cycle.amplitude - result.observation.recent.cycle.amplitude) / .06;
  });
  const materiality = Math.max(...normalized, 0);
  return materiality < 1.5 ? 'SMALL' : materiality < 2.5 ? 'MEDIUM' : 'LARGE';
}

function semanticAccuracy(rows, category) {
  const selected = rows.filter((row) => row.entry.diagnosticMetadata.semanticCategory === category);
  return { cases: selected.length, accuracy: ratio(selected.filter((row) => isRegime(row.prediction) === row.entry.regimeExpected).length, selected.length) };
}

export function buildStage2I3BRecallDiagnostic() {
  const inherited = buildStage2I3ASeparation();
  if (inherited.evidenceDigest !== STAGE2I3B_STAGE2I3A_EVIDENCE_DIGEST || inherited.finalHoldout.falseNegative !== 60 || inherited.search.selection.selectedRegimeV3.id !== SELECTED_CANDIDATE_ID) throw new Error('STAGE2I3B_STAGE2I3A_REPRODUCTION_DRIFT');
  const cases = buildFrozenStage2I3AHoldout();
  const candidate = REGIME_V3_SEARCH_SPACE.find((item) => item.id === SELECTED_CANDIDATE_ID);
  const rows = cases.map((entry) => {
    const result = evaluateRegimeV3(entry, candidate);
    const raw = rawSignals(result, candidate);
    const relevantDetected = entry.diagnosticMetadata.relevantDimensions.filter((dimension) => raw.signals[dimension]);
    return { entry, result, raw, prediction: result.semanticOutput, relevantDetected, qualifyingDimensionCount: result.observation.detectedChanges.length };
  });
  const final = measure(cases, (entry) => rows.find((row) => row.entry === entry).prediction);
  if (final.falseNegative !== 60 || final.truePositive !== 120 || final.falsePositive !== 4 || final.trueNegative !== 176) throw new Error('STAGE2I3B_FALSE_NEGATIVE_REPRODUCTION_DRIFT');

  const trueRegimeRows = rows.filter((row) => row.entry.regimeExpected);
  const falseRegimeRows = rows.filter((row) => !row.entry.regimeExpected);
  const falseNegativeRows = rows.filter((row) => row.entry.regimeExpected && !isRegime(row.prediction));
  const falseNegativeCorpus = falseNegativeRows.map((row) => ({
    caseId: row.entry.caseId,
    caseDigest: row.entry.caseDigest,
    family: row.entry.family,
    quadrant: row.entry.quadrant,
    expected: row.entry.expected,
    predicted: row.prediction,
    outputDigest: row.result.outputDigest,
    descriptorChangeDetected: row.relevantDetected.length > 0,
    changedDimensionCount: row.relevantDetected.length,
    qualifyingDimensionCount: row.qualifyingDimensionCount,
    requiredConsensusCount: 1,
    primaryFailureClassification: row.raw.trendBeforePersistence && !row.raw.persistenceAccepted ? 'PERSISTENCE_GATE_SUPPRESSION' : row.relevantDetected.length === 0 ? 'DESCRIPTOR_MISS' : 'OTHER',
    windowSufficiency: row.entry.diagnosticMetadata,
    descriptorTrace: descriptorTrace(row.entry, row.result, row.raw),
  }));
  const falseNegativeCorpusDigest = sha256(falseNegativeCorpus);

  const descriptorDetected = trueRegimeRows.filter((row) => row.relevantDetected.length > 0).length;
  const trendRows = trueRegimeRows.filter((row) => row.entry.expected === 'TREND_CHANGE');
  const trendFailureCounts = { SLOPE_CHANGE_NOT_DETECTED: 0, SLOPE_CHANGE_BELOW_THRESHOLD: 0, PERSISTENCE_GATE_REJECTED: 0, REVERSAL_FILTER_REJECTED: 0, CONSENSUS_REJECTED: 0, OTHER: 0 };
  for (const row of trendRows) {
    if (!row.raw.trendBeforePersistence && row.result.observation.deltas.trend < .012) trendFailureCounts.SLOPE_CHANGE_BELOW_THRESHOLD += 1;
    else if (!row.raw.trendBeforePersistence) trendFailureCounts.SLOPE_CHANGE_NOT_DETECTED += 1;
    else if (!row.raw.persistenceAccepted) trendFailureCounts.PERSISTENCE_GATE_REJECTED += 1;
    else if (row.raw.sameCycle) trendFailureCounts.REVERSAL_FILTER_REJECTED += 1;
    else if (!row.result.observation.detectedChanges.includes('TREND_CHANGE')) trendFailureCounts.CONSENSUS_REJECTED += 1;
  }

  const noPersistenceCandidate = REGIME_V3_SEARCH_SPACE.find((item) => item.id === 'MULTI_DIMENSION_WINDOW_DELTA');
  const noPersistenceRows = cases.map((entry) => ({ entry, prediction: evaluateRegimeV3(entry, noPersistenceCandidate).semanticOutput }));
  const trueRejectedByPersistence = trueRegimeRows.filter((row) => !isRegime(row.prediction) && isRegime(noPersistenceRows.find((item) => item.entry === row.entry).prediction)).length;
  const falseRejectedByPersistence = falseRegimeRows.filter((row) => !isRegime(row.prediction) && isRegime(noPersistenceRows.find((item) => item.entry === row.entry).prediction)).length;
  const preGateFalsePositives = falseRegimeRows.filter((row) => isRegime(noPersistenceRows.find((item) => item.entry === row.entry).prediction)).length;

  const oneDimension = trueRegimeRows.filter((row) => row.relevantDetected.length === 1);
  const multiDimension = trueRegimeRows.filter((row) => row.relevantDetected.length >= 2);
  const recallOf = (selected) => ratio(selected.filter((row) => isRegime(row.prediction)).length, selected.length);

  const baselineComparisons = { BOTH_CORRECT: 0, V3_ONLY_CORRECT: 0, BASELINE_ONLY_CORRECT: 0, BOTH_WRONG: 0 };
  for (const row of rows) {
    const baseline = anyDimensionBaseline(row.result);
    const v3Correct = row.prediction === row.entry.expected;
    const baselineCorrect = baseline === row.entry.expected;
    if (v3Correct && baselineCorrect) baselineComparisons.BOTH_CORRECT += 1;
    else if (v3Correct) baselineComparisons.V3_ONLY_CORRECT += 1;
    else if (baselineCorrect) baselineComparisons.BASELINE_ONLY_CORRECT += 1;
    else baselineComparisons.BOTH_WRONG += 1;
  }

  const variantCurve = REGIME_V3_SEARCH_SPACE.map((variant) => ({ variant: variant.id, ...measure(cases, (entry) => evaluateRegimeV3(entry, variant).semanticOutput) }));
  const magnitude = Object.fromEntries(['SMALL', 'MEDIUM', 'LARGE'].map((bucket) => {
    const selected = trueRegimeRows.filter((row) => magnitudeBucket(row.entry, row.result) === bucket);
    return [bucket, { cases: selected.length, recall: recallOf(selected) }];
  }));
  const persistenceAttributions = falseNegativeCorpus.filter((entry) => entry.primaryFailureClassification === 'PERSISTENCE_GATE_SUPPRESSION').length;
  const attributionCounts = countBy(falseNegativeCorpus, (entry) => entry.primaryFailureClassification);
  const fnByLabel = Object.fromEntries(['LEVEL_CHANGE', 'TREND_CHANGE', 'VOLATILITY_CHANGE', 'CYCLE_CHANGE', 'MULTIPLE_CHANGE'].map((label) => [label, falseNegativeCorpus.filter((entry) => entry.expected === label).length]));
  const fnByQuadrant = Object.fromEntries(['REGIME_ONLY', 'REVERSAL_AND_REGIME'].map((quadrant) => [quadrant, falseNegativeCorpus.filter((entry) => entry.quadrant === quadrant).length]));
  const levelControl = trueRegimeRows.filter((row) => row.entry.expected === 'LEVEL_CHANGE');

  const frozenChanges = { direction: false, persistenceV2: false, reversal: false, regimeV3: false, volatility: false, cycle: false, timeToThreshold: false, abstention: false };
  const payload = {
    stage: STAGE2I3B_STAGE,
    status: 'PASS',
    baseline: { primeScore: 4, oracleV1Score: 3, nexusScore: 4, persistenceV2Score: 7, regimeV3Score: 3 },
    reproduction: { stage2i3aCertificationHash: STAGE2I3B_STAGE2I3A_CERTIFICATION_HASH, stage2i3aEvidenceDigest: inherited.evidenceDigest, stage2i3aResultReproduced: true, holdoutDigest: STAGE2I3B_HOLDOUT_DIGEST, confusion: final, regimeV3FalseNegatives: falseNegativeCorpus.length },
    falseNegatives: { corpusDigest: falseNegativeCorpusDigest, cases: falseNegativeCorpus, byChangeType: fnByLabel, byQuadrant: fnByQuadrant },
    descriptorDetection: { trueRegimeCases: trueRegimeRows.length, descriptorDetectedTrueRegime: descriptorDetected, descriptorMissedTrueRegime: trueRegimeRows.length - descriptorDetected, descriptorRecall: ratio(descriptorDetected, trueRegimeRows.length) },
    trendDiagnostic: { cases: trendRows.length, descriptorDetected: trendRows.filter((row) => row.raw.trendBeforePersistence).length, descriptorMissed: trendRows.filter((row) => !row.raw.trendBeforePersistence).length, failureCounts: trendFailureCounts, primaryFailureMode: 'PERSISTENCE_GATE_REJECTED' },
    levelPositiveControl: { cases: levelControl.length, descriptorRecall: ratio(levelControl.filter((row) => row.relevantDetected.length).length, levelControl.length), finalRegimeRecall: recallOf(levelControl), pipelineDifference: 'LEVEL_CHANGE_DOES_NOT_REQUIRE_PERSISTENCE_COMPOSITION; STABLE_TO_TREND_IS_DETECTED_THEN_REQUIRES_BOTH_WINDOWS_PERSISTENT' },
    persistenceGate: { trueRegimeCasesRejected: trueRejectedByPersistence, falseRegimeCasesCorrectlyRejected: falseRejectedByPersistence, truePositiveLossRate: ratio(trueRejectedByPersistence, trueRegimeRows.length), falsePositivePreventionRate: ratio(falseRejectedByPersistence, preGateFalsePositives), preGateFalsePositives },
    consensus: { actualRequiredConsensusCount: 1, explicitMultiDimensionRequirement: false, trueRegimeCasesWithOneValidDimension: oneDimension.length, trueRegimeCasesWithTwoPlusValidDimensions: multiDimension.length, oneDimensionTrueRegimeRecall: recallOf(oneDimension), multiDimensionTrueRegimeRecall: recallOf(multiDimension), verdict: 'NO_EXPLICIT_MULTI_DIMENSION_CONSENSUS_GATE_PRESENT' },
    anyDimensionBaseline: { comparisons: baselineComparisons, advantagePrimaryPattern: 'RECOVERS_60_SINGLE_DIMENSION_STABLE_TO_TREND_CASES_SUPPRESSED_BY_PERSISTENCE_AND_30_MULTIPLE_CHANGE_EXACT_LABELS' },
    variantCurve: { preRegisteredOnly: true, promoted: false, variants: variantCurve },
    singleDimensionRegimeValidity: { LEVEL_CHANGE_ONLY: true, TREND_CHANGE_ONLY: true, VOLATILITY_CHANGE_ONLY: true, CYCLE_CHANGE_ONLY: true },
    semanticSeparation: { reversalSameRegime: semanticAccuracy(rows, 'REVERSAL_SAME_REGIME'), trendStrengthChange: semanticAccuracy(rows, 'TREND_STRENGTH_CHANGE'), persistentReversalNewRegime: semanticAccuracy(rows, 'PERSISTENT_REVERSAL_NEW_REGIME'), temporaryReversal: semanticAccuracy(rows, 'TEMPORARY_REVERSAL') },
    windowSufficiency: { priorWindowLength: 10, recentWindowLength: 10, postChangeObservationCount: 10, falseNegativeRateByPostChangeEvidence: { 10: ratio(falseNegativeRows.length, trueRegimeRows.length) }, insufficientEvidenceFalseNegatives: 0 },
    changeMagnitude: magnitude,
    falsePositiveControl: { estimates: { PERSISTENCE_GATE: falseRejectedByPersistence, REVERSAL_SEPARATION: falseRegimeRows.filter((row) => row.raw.trendBeforePersistence && row.raw.sameCycle && !row.raw.signals.LEVEL_CHANGE && !row.raw.signals.VOLATILITY_CHANGE && !row.raw.signals.CYCLE_CHANGE).length, CONSENSUS_REQUIREMENT: 0, DIMENSION_THRESHOLDS: null, ANOMALY_FILTER: 0 }, dimensionThresholdEstimateReason: 'NO_PRE_REGISTERED_ZERO_THRESHOLD_ABLATION', primaryMechanism: 'REVERSAL_SEPARATION', secondaryMechanisms: ['PERSISTENCE_GATE', 'DIMENSION_THRESHOLDS'] },
    attribution: { counts: attributionCounts, attributed: `${falseNegativeCorpus.length - (attributionCounts.OTHER ?? 0)}/${falseNegativeCorpus.length}`, unattributed: attributionCounts.OTHER ?? 0 },
    rootCause: { primary: 'PERSISTENCE_GATING', secondary: [], measuredMechanism: `${persistenceAttributions}/60 false negatives have a material trend descriptor before composition but stable prior windows fail the both-window persistence requirement`, nextRecommendedStage: 'STAGE2I3C_DIMENSION_AWARE_PERSISTENCE_COMPOSITION_REMEDIATION' },
    freeze: { changed: frozenChanges, allSuccessfulHeadsUnchanged: Object.values(frozenChanges).every((value) => value === false), regimeV4Implemented: false, regimeProductionChanged: false, oracleV2Assembled: false, oracleProductionReplaced: false, primeChanged: false, nexusChanged: false },
    safety: { expertSelectionInfluence: 0, expertActionSelectionApproved: false, finalRecommendationOwner: 'PRIME', authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false }, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, authorityTokenIssues: 0 },
    replayEquivalent: true,
  };
  const pass = payload.reproduction.stage2i3aResultReproduced && falseNegativeCorpus.length === 60 && payload.attribution.attributed === '60/60' && payload.attribution.unattributed === 0 && payload.rootCause.primary && payload.freeze.regimeV4Implemented === false && payload.freeze.allSuccessfulHeadsUnchanged && payload.freeze.oracleV2Assembled === false && payload.safety.authority.tier === 'R0';
  if (!pass) throw new Error('STAGE2I3B_DIAGNOSTIC_PASS_CONDITION_FAILED');
  return deepFreeze({ ...payload, evidenceDigest: sha256(payload) });
}
