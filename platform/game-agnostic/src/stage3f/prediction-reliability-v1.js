import { performance } from 'node:perf_hooks';

import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import { deepFreeze, sha256, stableStringify } from '../core/determinism.js';
import { EpistemicCategory } from './world-state-v1.js';
import {
  CalibrationDomain, CalibrationStatus, createCalibrationEvidence, createDomainAssessment,
  createEnvironmentCalibration, evaluateCalibrationSufficiency,
} from './environment-calibration-v1.js';
import { CounterfactualTiming } from './counterfactual-veto-ledger-v1.js';
import { STAGE3E_CANDIDATE_FEATURE_KEYS } from './prediction-reliability-corpus-v1.js';

export {
  STAGE3E_SPLITS, STAGE3F6_PARTITION_BY_SPLIT, STAGE3F6_CORPUS_SPEC, STAGE3E_CANDIDATE_FEATURE_KEYS,
} from './prediction-reliability-corpus-v1.js';

/* ===========================================================================
 * Stage 3F.6 — Prediction Reliability Baseline v1
 *
 * A measurement contract. Nothing here trains, fits, updates weights, selects a
 * policy, dispatches, or mutates a world. Every threshold below is declared before
 * any HOLDOUT/OOD evidence is scored and is bound into the evaluation freeze hash.
 *
 *   GOOD_FINAL_OUTCOME != GOOD_WORLD_MODEL
 *   GOOD_PREDICTION_FOR_WRONG_REASON != RELIABLE_PREDICTION
 *   PREDICTED != OBSERVED
 * ========================================================================= */

export const PREDICTION_RELIABILITY_CONTRACT_ID = 'SENTINEL_PREDICTION_RELIABILITY_BASELINE_V1';
export const PREDICTION_RELIABILITY_SCHEMA_VERSION = 1;

export const PredictionQuality = deepFreeze({
  EXACT: 'EXACT', DIRECTIONALLY_CORRECT: 'DIRECTIONALLY_CORRECT', APPROXIMATELY_CORRECT: 'APPROXIMATELY_CORRECT',
  WRONG: 'WRONG', INCOMPARABLE: 'INCOMPARABLE', UNKNOWN: 'UNKNOWN',
});
export const PredictionAvailability = deepFreeze({
  AVAILABLE: 'AVAILABLE', NOT_AVAILABLE: 'NOT_AVAILABLE', INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
});
export const ErrorAttribution = deepFreeze({
  OBSERVATION_ERROR: 'OBSERVATION_ERROR', STATE_REPRESENTATION_ERROR: 'STATE_REPRESENTATION_ERROR',
  CALIBRATION_ERROR: 'CALIBRATION_ERROR', FEATURE_DERIVATION_ERROR: 'FEATURE_DERIVATION_ERROR',
  PREDICTOR_ERROR: 'PREDICTOR_ERROR', ROUTER_ERROR: 'ROUTER_ERROR', ACTION_BINDING_ERROR: 'ACTION_BINDING_ERROR',
  OUTCOME_BINDING_ERROR: 'OUTCOME_BINDING_ERROR', INHERENT_STOCHASTICITY: 'INHERENT_STOCHASTICITY', UNKNOWN: 'UNKNOWN',
});
export const NoveltyBucket = deepFreeze({
  FAMILIAR: 'FAMILIAR', NEAR_NOVEL: 'NEAR_NOVEL', STRONGLY_NOVEL: 'STRONGLY_NOVEL', UNKNOWN: 'UNKNOWN',
});
export const ProxyFidelityBucket = deepFreeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', UNKNOWN: 'UNKNOWN' });
export const CounterfactualPredictionKind = deepFreeze({
  EXECUTED_ACTION_PREDICTION: 'EXECUTED_ACTION_PREDICTION',
  UNEXECUTED_COUNTERFACTUAL_PREDICTION: 'UNEXECUTED_COUNTERFACTUAL_PREDICTION',
  NO_COUNTERFACTUAL_PROPOSAL: 'NO_COUNTERFACTUAL_PROPOSAL',
});
export const CalibrationCondition = deepFreeze({
  CALIBRATED: 'CALIBRATED', PARTIALLY_CALIBRATED: 'PARTIALLY_CALIBRATED', INSUFFICIENT: 'INSUFFICIENT', CONFLICTED: 'CONFLICTED',
});
export const Stage3F6Partition = deepFreeze({ DEV: 'DEV', CAL: 'CAL', HOLDOUT: 'HOLDOUT', OOD: 'OOD' });
export const DESIGN_PARTITIONS = deepFreeze(['DEV', 'CAL']);
export const SEALED_PARTITIONS = deepFreeze(['HOLDOUT', 'OOD']);
export const DiagnosisCategory = deepFreeze({
  A_ROUTER_LIMITED: 'A_ROUTER_LIMITED', B_STATE_REPRESENTATION_LIMITED: 'B_STATE_REPRESENTATION_LIMITED',
  C_PREDICTION_LIMITED: 'C_PREDICTION_LIMITED', D_UNCERTAINTY_CALIBRATION_LIMITED: 'D_UNCERTAINTY_CALIBRATION_LIMITED',
  E_LONG_HORIZON_DRIFT_LIMITED: 'E_LONG_HORIZON_DRIFT_LIMITED', F_ENVIRONMENT_CALIBRATION_LIMITED: 'F_ENVIRONMENT_CALIBRATION_LIMITED',
  G_MIXED_LIMITATION: 'G_MIXED_LIMITATION', H_INSUFFICIENT_EVIDENCE: 'H_INSUFFICIENT_EVIDENCE',
});
export const ObservationDegradation = deepFreeze({
  REMOVE_THREAT_INFORMATION: 'REMOVE_THREAT_INFORMATION', REMOVE_OBJECTIVE_INFORMATION: 'REMOVE_OBJECTIVE_INFORMATION',
  DROP_ENTITY_SUBSET: 'DROP_ENTITY_SUBSET', HIDE_RELATIONSHIPS: 'HIDE_RELATIONSHIPS',
  REMOVE_RESOURCE_SIGNALS: 'REMOVE_RESOURCE_SIGNALS', HIDE_SPATIAL_INFORMATION: 'HIDE_SPATIAL_INFORMATION',
  STALE_OBSERVATION: 'STALE_OBSERVATION',
});

/** The eight Stage 3F world-state domains measured separately (never hidden inside one aggregate). */
export const PREDICTION_DOMAINS = deepFreeze(['entities', 'resources', 'objectives', 'relationships', 'spatialState', 'constraints', 'risk', 'temporalState']);

/** Calibration semantics a comparison in each domain requires. */
export const DOMAIN_CALIBRATION_REQUIREMENT = deepFreeze({
  entities: CalibrationDomain.ACTION_SEMANTICS, resources: CalibrationDomain.RESOURCE_SEMANTICS,
  objectives: CalibrationDomain.OBJECTIVE_SEMANTICS, relationships: CalibrationDomain.ACTION_SEMANTICS,
  spatialState: CalibrationDomain.OBSERVATION_SEMANTICS, constraints: CalibrationDomain.CONSTRAINT_SEMANTICS,
  risk: CalibrationDomain.ACTION_SEMANTICS, temporalState: CalibrationDomain.TEMPORAL_SEMANTICS,
});

/** Forge reward V1 component -> world-state domain of the consequence it predicts. */
export const ONE_STEP_COMPONENT_DOMAIN = deepFreeze({
  objectiveProgress: 'objectives', deliveredValue: 'objectives', terminalSuccess: 'objectives', terminalFailure: 'objectives',
  preservedValue: 'entities', civilianSafety: 'entities', infrastructureHealth: 'entities',
  resourceCost: 'resources', riskExposure: 'risk', timeCost: 'temporalState', illegalActionPenalty: 'constraints',
});

/** World State v1 facts written by the Stage 3F.5 runtime and their domain. */
export const RUNTIME_WORLD_STATE_FACTS = deepFreeze({
  'temporalState.tick': { domain: 'temporalState', identity: false },
  'resources.actorEnergy': { domain: 'resources', identity: false },
  'entities.count': { domain: 'entities', identity: false },
  'relationships.count': { domain: 'relationships', identity: false },
  'objectives.count': { domain: 'objectives', identity: false },
  'constraints.worldHash': { domain: 'constraints', identity: true },
});

export const STAGE3F6_METHODOLOGY = deepFreeze({
  version: 'STAGE3F6_METHODOLOGY_V1',
  partitions: { source: 'FROZEN_STAGE3E_ROUTABILITY_SPLITS_JOINED_BY_RECORD_HASH', design: DESIGN_PARTITIONS, sealed: SEALED_PARTITIONS,
    derivedVariantQuarantine: 'Stage 3E splits are not topology-disjoint (inherited). A case is excluded from Stage 3F.6 evaluation when its topologyHash already appears in an earlier partition in order DEV, CAL, HOLDOUT, OOD. Full Stage 3E splits are used only for the exact Stage 3E replay.',
    quarantineOrder: ['DEV', 'CAL', 'HOLDOUT', 'OOD'] },
  predictionQuality: {
    exact: 'absolute error == 0',
    approximate: 'absolute error <= max(1, 0.05 * |actual|) and not exact',
    directional: 'sign of predicted change == sign of actual change, actual change != 0, not approximate',
    wrong: 'comparable, none of the above',
    incomparable: 'identity fact, malformed prediction, environment mismatch, non-decision-time or hindsight prediction, conflicted outcome, or calibration insufficient for the domain',
    unknown: 'prediction or actual outcome missing',
    precedence: ['UNKNOWN', 'INCOMPARABLE', 'EXACT', 'APPROXIMATELY_CORRECT', 'DIRECTIONALLY_CORRECT', 'WRONG'],
    approximateCountsAsExact: false,
  },
  confidence: { bins: 10, binning: 'EQUAL_WIDTH_0_1_RIGHT_CLOSED_LAST', ece: 'SUM n_b/N * |accuracy_b - meanConfidence_b|', brier: 'MEAN (confidence - correct)^2', mixSemanticClasses: false },
  highConfidenceThresholds: [0.9, 0.95, 0.99],
  reliabilityTiers: [0.8, 0.9, 0.95, 0.975, 0.99],
  evidenceFloor: { minTierN: 200, minBucketN: 30, wilsonZ: 1.96, source: 'STAGE3E evidence-floor.json (predeclared n>=200 Wilson 95%)' },
  tierSelection: {
    grid: 'tau in 0.50..0.99 step 0.01', designPartition: 'CAL',
    rule: 'smallest tau with CAL routed n>=200 and CAL Wilson lower >= tier',
    achievable: 'HOLDOUT routed n>=200 and HOLDOUT Wilson lower >= tier at the CAL-selected tau',
    noOperatingPoint: 'NOT_ACHIEVABLE; frozen Stage 3E tau reported as reference only',
  },
  stage3eFrozenTau: 0.9,
  novelty: {
    representation: 'STAGE3E_CONTRACT_FEATURES_STANDARDIZED_BY_FROZEN_STAGE3E_MU_SD',
    distance: 'EUCLIDEAN / sqrt(featureCount) to nearest DEV case',
    thresholdSource: 'CAL nearest-DEV distance quantiles', familiarQuantile: 0.5, nearNovelQuantile: 0.95,
  },
  proxyFidelity: {
    statistic: 'KENDALL_TAU_B(immediate V2 scalar, horizon total scalar) over legal branches excluding the contract greedy branch',
    minimumBranches: 3, high: 0.8, low: 0.5,
    purpose: 'per-state reliability of one-step consequence evidence as a proxy for horizon consequence; excludes the greedy branch so the bucket is not the GREEDY_SAFE label',
  },
  worldStateBaseline: {
    id: 'CALIBRATION_SEMANTICS_PERSISTENCE_BASELINE_V1', sentinelCapability: false,
    rules: ['tick + declared actionDuration (TEMPORAL_SEMANTICS)', 'energy - declared resourceCosts (ACTION_SEMANTICS)',
      'entity/relationship/objective counts persist absent declared creation/destruction effects', 'worldHash identity not predicted'],
    readsSimulator: false, fitted: false,
  },
  degradations: Object.values(ObservationDegradation),
  degradationDropRule: 'drop non-ACTOR entity when sha256(id + ":STAGE3F6_DROP") begins with 0-3 (25%)',
  calibrationVariants: Object.values(CalibrationCondition),
  routerEquations: {
    contractPath: 'STAGE3E_CANONICAL_BIAS_LAST over frozen matrix features (must reproduce Stage 3E CAL/HOLDOUT/OOD exactly)',
    runtimePath: 'STAGE3F5_RUNTIME_BIAS_FIRST over Stage 3F.5 runtime features (as executed by the certified runtime)',
    decomposition: ['contract', 'runtime', 'runtimeFeaturesCanonicalEquation', 'derivationOnly', 'candidateOnly', 'equationOnly'],
    justifiedOn: 'CAL',
  },
  attributionPrecedence: {
    runtimeRouterFalseSafe: ['OUTCOME_BINDING_ERROR', 'INHERENT_STOCHASTICITY', 'ROUTER_ERROR(RUNTIME_ROUTER_EQUATION_DIVERGENCE)',
      'FEATURE_DERIVATION_ERROR', 'ACTION_BINDING_ERROR', 'STATE_REPRESENTATION_ERROR', 'ROUTER_ERROR(REPRESENTATION_EVIDENCES_UNSAFE_YET_ROUTED)', 'UNKNOWN'],
    contractRouterFalseSafe: ['INHERENT_STOCHASTICITY', 'STATE_REPRESENTATION_ERROR', 'ROUTER_ERROR(REPRESENTATION_EVIDENCES_UNSAFE_YET_ROUTED)', 'UNKNOWN'],
    worldStateBaseline: ['OBSERVATION_ERROR', 'CALIBRATION_ERROR', 'PREDICTOR_ERROR'],
    oneStepConsequence: ['OBSERVATION_ERROR', 'CALIBRATION_ERROR', 'PREDICTOR_ERROR'],
    routerErrorEvidence: 'runtime equation alone changed the route, or exact contract-feature signature class with >=2 members, all unsafe, yet routed',
    representationErrorEvidence: 'exact contract-feature signature class containing both labels',
  },
  correctForWrongReason: 'final runtime decision correct while at least one intermediate error is present: runtime feature evidence changed the route, the runtime equation changed the route, or the runtime greedy action differs from the contract greedy action',
  errorCompensation: 'final runtime decision correct, two or more intermediate errors present, and correcting any single present error alone makes the decision wrong',
  catastrophicRegret: 100,
  layerB: { quotas: { DEV: 100, CAL: 100, HOLDOUT: 300, OOD: 300 }, order: 'sha256("STAGE3F6_LAYER_B:" + recordHash)', shardSize: 50,
    incumbent: 'STAGE3F5 runtime HEURISTIC_GREEDY_IMMEDIATE action', snapshotPurpose: 'PREDICTION_CALIBRATION',
    degradationQuota: 120, calibrationSensitivityQuota: 40 },
  diagnosisRules: {
    shares: 'over contract-path HOLDOUT false-safe routes: A = HIGH fidelity share, C = MEDIUM+LOW share; B = runtime false-safes attributed FEATURE_DERIVATION or ACTION_BINDING',
    A: 'share >= 0.2', C: 'share >= 0.2', B: 'share >= 0.2 or runtime/contract route disagreement >= 0.02',
    D: 'HOLDOUT ECE >= 0.05 or HOLDOUT high-confidence-wrong(0.90) rate >= 0.10 with n >= 200',
    E: 'multistep prediction unavailable and false-safe(H3,H4) - false-safe(H0,H1) >= 0.10 with each n >= 30',
    F: 'any prediction output changes across calibration variants',
    G: 'two or more of A-F supported', H: 'fewer than 30 contract-path HOLDOUT false-safes',
    primary: 'larger of A and C shares', secondary: 'other of A/C if share >= 0.2 else first supported of B, E, D, F',
  },
  learning: { modelTrainingPerformed: false, weightsUpdated: false, routerRetrained: false, onlineLearningEnabled: false },
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true },
});

export const PREDICTION_RELIABILITY_CONTRACT = deepFreeze({
  contractId: PREDICTION_RELIABILITY_CONTRACT_ID, schemaVersion: PREDICTION_RELIABILITY_SCHEMA_VERSION,
  methodologyHash: sha256(STAGE3F6_METHODOLOGY),
  predictionQualities: Object.values(PredictionQuality), attributions: Object.values(ErrorAttribution),
  goodFinalOutcomeImpliesGoodWorldModel: false, correctForWrongReasonCountsAsReliable: false,
  predictedEqualsObserved: false, counterfactualScoredAsExecuted: false,
  modelTrainingPerformed: false, weightsUpdated: false, routerRetrained: false, onlineLearningEnabled: false,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true },
});
export const PREDICTION_RELIABILITY_CONTRACT_HASH = sha256(PREDICTION_RELIABILITY_CONTRACT);

export class PredictionReliabilityContractError extends Error {
  constructor(message, details = undefined) { super(message); this.name = 'PredictionReliabilityContractError'; this.details = details; }
}

/* ---------------------------------------------------------------------------
 * Statistics
 * ------------------------------------------------------------------------- */

const round = (value, digits = 6) => (value === null || value === undefined || Number.isNaN(value) ? null : Number(value.toFixed(digits)));

export function wilsonInterval(k, n, z = 1.96) {
  if (!Number.isSafeInteger(k) || !Number.isSafeInteger(n) || k < 0 || n < 0 || k > n) throw new PredictionReliabilityContractError('wilson requires 0 <= k <= n integers');
  if (n === 0) return deepFreeze({ k, n, p: null, lower: 0, upper: 1 });
  const p = k / n; const d = 1 + (z * z) / n; const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return deepFreeze({ k, n, p: round(p), lower: round(Math.max(0, (centre - spread) / d)), upper: round(Math.min(1, (centre + spread) / d)) });
}

export function nearestRankQuantile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  return sortedValues[Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * p) - 1))];
}

export function summarizeDistribution(values) {
  const sorted = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return deepFreeze({ n: 0, mean: null, median: null, p50: null, p90: null, p95: null, p99: null, worst: null });
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const q = (p) => round(nearestRankQuantile(sorted, p));
  return deepFreeze({ n: sorted.length, mean: round(mean), median: q(0.5), p50: q(0.5), p90: q(0.9), p95: q(0.95), p99: q(0.99), worst: round(sorted.at(-1)) });
}

export function validateConfidence(value) {
  if (value === null || value === undefined) return deepFreeze({ status: 'MISSING', value: null });
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return deepFreeze({ status: 'INVALID', value: null });
  return deepFreeze({ status: 'VALID', value });
}

/**
 * Brier score, ECE, and reliability bins for ONE semantic prediction class.
 * pairs: [{ semanticClass, confidence, correct }]. Missing/invalid confidences are counted, never scored.
 */
export function calibrationReport(pairs, { bins = STAGE3F6_METHODOLOGY.confidence.bins } = {}) {
  const classes = new Set(pairs.map((pair) => pair.semanticClass));
  if (classes.size > 1) throw new PredictionReliabilityContractError('calibration cannot mix semantically incompatible prediction classes', { classes: [...classes].sort() });
  let missing = 0; let invalid = 0; const valid = [];
  for (const pair of pairs) {
    const checked = validateConfidence(pair.confidence);
    if (checked.status === 'MISSING') missing += 1; else if (checked.status === 'INVALID') invalid += 1;
    else if (typeof pair.correct === 'boolean') valid.push({ confidence: checked.value, correct: pair.correct });
    else missing += 1;
  }
  const table = Array.from({ length: bins }, (_, index) => ({ lower: round(index / bins, 4), upper: round((index + 1) / bins, 4), n: 0, confidenceSum: 0, correct: 0 }));
  let brier = 0;
  for (const entry of valid) {
    const index = Math.min(bins - 1, Math.floor(entry.confidence * bins));
    table[index].n += 1; table[index].confidenceSum += entry.confidence; table[index].correct += entry.correct ? 1 : 0;
    brier += (entry.confidence - (entry.correct ? 1 : 0)) ** 2;
  }
  const n = valid.length;
  const ece = n === 0 ? null : table.reduce((sum, bin) => sum + (bin.n === 0 ? 0 : (bin.n / n) * Math.abs(bin.correct / bin.n - bin.confidenceSum / bin.n)), 0);
  return deepFreeze({
    semanticClass: [...classes][0] ?? null, n, missingConfidence: missing, invalidConfidence: invalid,
    brierScore: n === 0 ? null : round(brier / n), ece: round(ece),
    accuracy: n === 0 ? null : round(valid.filter((entry) => entry.correct).length / n),
    meanConfidence: n === 0 ? null : round(valid.reduce((sum, entry) => sum + entry.confidence, 0) / n),
    bins: table.map((bin) => ({ lower: bin.lower, upper: bin.upper, n: bin.n,
      meanConfidence: bin.n === 0 ? null : round(bin.confidenceSum / bin.n), accuracy: bin.n === 0 ? null : round(bin.correct / bin.n) })),
  });
}

export function highConfidenceWrong(pairs, { thresholds = STAGE3F6_METHODOLOGY.highConfidenceThresholds, floor = STAGE3F6_METHODOLOGY.evidenceFloor.minTierN } = {}) {
  return deepFreeze(Object.fromEntries(thresholds.map((threshold) => {
    const above = pairs.filter((pair) => validateConfidence(pair.confidence).status === 'VALID' && pair.confidence >= threshold && typeof pair.correct === 'boolean');
    const wrong = above.filter((pair) => !pair.correct).length;
    const interval = wilsonInterval(wrong, above.length);
    return [String(threshold), { threshold, n: above.length, wrong, rate: interval.p, wilsonLower: interval.lower, wilsonUpper: interval.upper,
      evidenced: above.length >= floor, reliability: above.length === 0 ? null : round(1 - wrong / above.length) }];
  })));
}

export function kendallTauB(xs, ys) {
  if (xs.length !== ys.length) throw new PredictionReliabilityContractError('kendall requires equal-length vectors');
  let concordant = 0; let discordant = 0; let tiesX = 0; let tiesY = 0;
  for (let i = 0; i < xs.length; i += 1) {
    for (let j = i + 1; j < xs.length; j += 1) {
      const dx = Math.sign(xs[i] - xs[j]); const dy = Math.sign(ys[i] - ys[j]);
      if (dx === 0 && dy === 0) continue;
      if (dx === 0) tiesX += 1; else if (dy === 0) tiesY += 1; else if (dx === dy) concordant += 1; else discordant += 1;
    }
  }
  const denominator = Math.sqrt((concordant + discordant + tiesX) * (concordant + discordant + tiesY));
  return denominator === 0 ? null : (concordant - discordant) / denominator;
}

/* ---------------------------------------------------------------------------
 * Prediction quality and binding guards
 * ------------------------------------------------------------------------- */

export function classifyNumericPrediction({ predicted, actual, reference = null, comparable = true, identity = false }) {
  if (identity) return deepFreeze({ quality: PredictionQuality.INCOMPARABLE, error: null, absoluteError: null, reason: 'IDENTITY_FACT_NOT_PREDICTABLE' });
  if (predicted === undefined || predicted === null) return deepFreeze({ quality: PredictionQuality.UNKNOWN, error: null, absoluteError: null, reason: 'PREDICTION_MISSING' });
  if (actual === undefined || actual === null) return deepFreeze({ quality: PredictionQuality.UNKNOWN, error: null, absoluteError: null, reason: 'ACTUAL_OUTCOME_MISSING' });
  if (typeof predicted !== 'number' || !Number.isFinite(predicted)) return deepFreeze({ quality: PredictionQuality.INCOMPARABLE, error: null, absoluteError: null, reason: 'PREDICTION_MALFORMED' });
  if (typeof actual !== 'number' || !Number.isFinite(actual)) return deepFreeze({ quality: PredictionQuality.INCOMPARABLE, error: null, absoluteError: null, reason: 'ACTUAL_MALFORMED' });
  if (!comparable) return deepFreeze({ quality: PredictionQuality.INCOMPARABLE, error: null, absoluteError: null, reason: 'CALIBRATION_INSUFFICIENT' });
  const error = predicted - actual; const absoluteError = Math.abs(error);
  let quality = PredictionQuality.WRONG;
  const predictedDirection = Math.sign(reference === null ? predicted : predicted - reference);
  const actualDirection = Math.sign(reference === null ? actual : actual - reference);
  if (absoluteError === 0) quality = PredictionQuality.EXACT;
  else if (absoluteError <= Math.max(1, 0.05 * Math.abs(actual))) quality = PredictionQuality.APPROXIMATELY_CORRECT;
  else if (actualDirection !== 0 && predictedDirection === actualDirection) quality = PredictionQuality.DIRECTIONALLY_CORRECT;
  return deepFreeze({ quality, error, absoluteError, reason: null });
}

/**
 * Bind one prediction to one actual outcome, failing safely. Nothing here throws on bad evidence;
 * unscorable evidence is classified, counted, and excluded from reliability claims.
 */
export function bindPredictionToOutcome({ prediction, outcome, environmentIdentity, calibrationSufficient, decisionLogicalTime, reference = null, identity = false }) {
  const verdict = (quality, reason, extra = {}) => deepFreeze({ scored: quality !== PredictionQuality.UNKNOWN && quality !== PredictionQuality.INCOMPARABLE,
    quality, reason, confidence: validateConfidence(prediction?.confidence), ...extra });
  if (prediction === null || prediction === undefined) return verdict(PredictionQuality.UNKNOWN, 'PREDICTION_MISSING');
  if (typeof prediction !== 'object' || Array.isArray(prediction) || typeof prediction.classId !== 'string'
      || typeof prediction.domain !== 'string' || !('value' in prediction)) return verdict(PredictionQuality.UNKNOWN, 'PREDICTION_MALFORMED');
  if (outcome === null || outcome === undefined || outcome.status === 'UNKNOWN') return verdict(PredictionQuality.UNKNOWN, 'ACTUAL_OUTCOME_MISSING');
  if (outcome.status === 'CONFLICTED') return verdict(PredictionQuality.INCOMPARABLE, 'OUTCOME_CONFLICTED');
  if (prediction.environmentIdentity !== environmentIdentity || outcome.environmentIdentity !== environmentIdentity) {
    return verdict(PredictionQuality.INCOMPARABLE, 'ENVIRONMENT_MISMATCH');
  }
  if (prediction.timing !== CounterfactualTiming.DECISION_TIME) return verdict(PredictionQuality.INCOMPARABLE, 'NOT_DECISION_TIME_PREDICTION');
  if (!Number.isSafeInteger(prediction.generatedLogicalTime) || prediction.generatedLogicalTime > decisionLogicalTime
      || !Number.isSafeInteger(outcome.logicalTime) || prediction.generatedLogicalTime >= outcome.logicalTime) {
    return verdict(PredictionQuality.INCOMPARABLE, 'PREDICTION_GENERATED_AFTER_DECISION_OR_OUTCOME');
  }
  const classified = classifyNumericPrediction({ predicted: prediction.value, actual: outcome.value, reference, comparable: calibrationSufficient === true, identity });
  return verdict(classified.quality, classified.reason, { error: classified.error, absoluteError: classified.absoluteError });
}

export function qualityCounts(verdicts) {
  const counts = Object.fromEntries(Object.values(PredictionQuality).map((quality) => [quality, 0]));
  for (const entry of verdicts) counts[entry.quality] += 1;
  const comparable = counts.EXACT + counts.APPROXIMATELY_CORRECT + counts.DIRECTIONALLY_CORRECT + counts.WRONG;
  const exact = wilsonInterval(counts.EXACT, comparable);
  return deepFreeze({ counts, n: verdicts.length, comparable,
    exactAccuracy: comparable === 0 ? null : round(counts.EXACT / comparable),
    exactWilsonLower: exact.lower,
    approximateOrBetterAccuracy: comparable === 0 ? null : round((counts.EXACT + counts.APPROXIMATELY_CORRECT) / comparable),
    comparableCoverage: verdicts.length === 0 ? null : round(comparable / verdicts.length) });
}

/* ---------------------------------------------------------------------------
 * Calibration conditions
 * ------------------------------------------------------------------------- */

// Calibrations are deep-frozen, verified records; memoizing per object identity changes no semantics,
// it only avoids re-verifying the whole calibration for every compared component.
const calibrationResultCache = new WeakMap();
function cachedSufficiency(calibration, requiredDomains) {
  let perCalibration = calibrationResultCache.get(calibration);
  if (!perCalibration) { perCalibration = new Map(); calibrationResultCache.set(calibration, perCalibration); }
  const key = [...requiredDomains].sort().join(',');
  if (!perCalibration.has(key)) perCalibration.set(key, evaluateCalibrationSufficiency(calibration, requiredDomains));
  return perCalibration.get(key);
}

export function calibrationSufficientFor(calibration, domain) {
  return cachedSufficiency(calibration, [domain]).sufficient;
}

export function classifyCalibrationCondition(calibration, requiredDomains) {
  const result = cachedSufficiency(calibration, requiredDomains);
  if (result.domainResults.some((entry) => entry.reason === 'MATERIAL_CONFLICT')) return CalibrationCondition.CONFLICTED;
  const sufficient = result.domainResults.filter((entry) => entry.sufficient).length;
  if (sufficient === result.domainResults.length) return CalibrationCondition.CALIBRATED;
  return sufficient > 0 ? CalibrationCondition.PARTIALLY_CALIBRATED : CalibrationCondition.INSUFFICIENT;
}

const variantProvenance = (identity, name) => ({ environmentId: identity.environmentId, environmentVersion: identity.environmentVersion,
  sourceId: 'stage3f6-calibration-variant', evidenceId: `stage3f6-${name}` });

/**
 * Evaluation-only calibration variants built from a certified base calibration. They never replace the
 * runtime calibration; they exist to measure whether calibration status relates to prediction reliability.
 */
export function createCalibrationVariant(base, variant, { insufficientCalibration = null } = {}) {
  const identity = base.environmentIdentity;
  if (variant === CalibrationCondition.CALIBRATED) return base;
  if (variant === CalibrationCondition.INSUFFICIENT) {
    if (!insufficientCalibration) throw new PredictionReliabilityContractError('INSUFFICIENT variant requires the certified insufficient calibration');
    return insufficientCalibration;
  }
  if (variant === CalibrationCondition.PARTIALLY_CALIBRATED) {
    const degraded = new Set([CalibrationDomain.RESOURCE_SEMANTICS, CalibrationDomain.OBJECTIVE_SEMANTICS]);
    const assessments = base.domainAssessments.map((entry) => (degraded.has(entry.domain)
      ? createDomainAssessment({ environmentIdentity: identity, domain: entry.domain, status: CalibrationStatus.UNKNOWN, confidence: null,
        evidenceRefs: [], provenance: variantProvenance(identity, `partial-${entry.domain}`) }) : entry));
    return createEnvironmentCalibration({ environmentIdentity: identity, calibrationVersion: `${base.calibrationVersion}+3F6-PARTIAL`,
      evidence: base.evidence, semanticDefinitions: base.semanticDefinitions, domainAssessments: assessments });
  }
  if (variant === CalibrationCondition.CONFLICTED) {
    const conflicting = createCalibrationEvidence({ environmentIdentity: identity, domain: CalibrationDomain.RESOURCE_SEMANTICS,
      claimTarget: `${CalibrationDomain.RESOURCE_SEMANTICS}:FORGE`, claimType: 'SEMANTIC_DEFINITION', claimValue: { present: false },
      sourceReference: { contract: 'STAGE3F6_CONFLICT_INJECTION', domain: CalibrationDomain.RESOURCE_SEMANTICS },
      epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1, material: true, provenance: variantProvenance(identity, 'conflict') });
    return createEnvironmentCalibration({ environmentIdentity: identity, calibrationVersion: `${base.calibrationVersion}+3F6-CONFLICTED`,
      evidence: [...base.evidence, conflicting], semanticDefinitions: base.semanticDefinitions, domainAssessments: base.domainAssessments });
  }
  throw new PredictionReliabilityContractError(`unknown calibration variant: ${variant}`);
}

/* ---------------------------------------------------------------------------
 * Reference World State baseline (NOT a Sentinel capability)
 * ------------------------------------------------------------------------- */

function semanticsFor(calibration, domain) {
  return calibration.semanticDefinitions.find((entry) => entry.domain === domain)?.semantics ?? null;
}

export function worldStateFactMap(snapshot) {
  const map = {};
  for (const fact of snapshot?.facts ?? []) map[fact.path.join('.')] = { value: fact.value, category: fact.category, stale: false };
  return map;
}

/**
 * Parameter-free reference predictor over World State v1 facts. It uses only what the Stage 3F.2 calibration
 * declares. It reads no simulator and fits nothing. Missing inputs abstain (UNKNOWN), never guess.
 */
export function predictWorldStateBaseline({ facts, actionType, calibration }) {
  const temporal = calibrationSufficientFor(calibration, CalibrationDomain.TEMPORAL_SEMANTICS) ? semanticsFor(calibration, CalibrationDomain.TEMPORAL_SEMANTICS) : null;
  const action = calibrationSufficientFor(calibration, CalibrationDomain.ACTION_SEMANTICS) ? semanticsFor(calibration, CalibrationDomain.ACTION_SEMANTICS) : null;
  const known = (path) => facts[path] && facts[path].category !== EpistemicCategory.UNKNOWN && facts[path].value !== null && facts[path].value !== undefined;
  const out = [];
  const push = (path, value, basis, inputs) => out.push({ path, domain: RUNTIME_WORLD_STATE_FACTS[path].domain, value,
    abstained: value === null, basis, staleInput: inputs.some((input) => facts[input]?.stale === true) });
  push('temporalState.tick', known('temporalState.tick') && temporal?.actionDuration?.units === 'logical-step'
    ? facts['temporalState.tick'].value + 1 : null, temporal ? 'DECLARED_ACTION_DURATION' : 'TEMPORAL_SEMANTICS_UNAVAILABLE', ['temporalState.tick']);
  const declaredCosts = (action?.resourceCosts ?? []).filter((entry) => entry?.actionType === actionType && entry?.resourceId === 'energy');
  push('resources.actorEnergy', known('resources.actorEnergy') && action
    ? facts['resources.actorEnergy'].value - declaredCosts.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0) : null,
  action ? (declaredCosts.length ? 'DECLARED_RESOURCE_COST' : 'NO_DECLARED_RESOURCE_COST_PERSISTENCE') : 'ACTION_SEMANTICS_UNAVAILABLE', ['resources.actorEnergy']);
  for (const path of ['entities.count', 'relationships.count', 'objectives.count']) {
    push(path, known(path) ? facts[path].value : null, 'PERSISTENCE_NO_DECLARED_CREATION_OR_DESTRUCTION', [path]);
  }
  out.push({ path: 'constraints.worldHash', domain: 'constraints', value: null, abstained: true, basis: 'IDENTITY_NOT_PREDICTED', staleInput: false });
  return deepFreeze({ predictorId: STAGE3F6_METHODOLOGY.worldStateBaseline.id, sentinelCapability: false, confidence: null, predictions: out,
    declaredResourceCostCount: (action?.resourceCosts ?? []).length });
}

export function attributeBaselineError({ verdict, prediction, calibration }) {
  if ([PredictionQuality.EXACT, PredictionQuality.UNKNOWN, PredictionQuality.INCOMPARABLE].includes(verdict.quality)) return null;
  if (prediction.staleInput) return ErrorAttribution.OBSERVATION_ERROR;
  if (prediction.path === 'resources.actorEnergy' && (semanticsFor(calibration, CalibrationDomain.ACTION_SEMANTICS)?.resourceCosts ?? []).length === 0) {
    return ErrorAttribution.CALIBRATION_ERROR;
  }
  return ErrorAttribution.PREDICTOR_ERROR;
}

/* ---------------------------------------------------------------------------
 * Sentinel decision-time one-step consequence evidence (privileged simulator lookahead)
 * ------------------------------------------------------------------------- */

const NON_EXACT_SCORED = [PredictionQuality.WRONG, PredictionQuality.APPROXIMATELY_CORRECT, PredictionQuality.DIRECTIONALLY_CORRECT];

/**
 * Score the executed action's decision-time branch evidence (reward vector computed before execution) against
 * the executed transition. Every component passes the same binding guards as any other prediction.
 * guard: { environmentIdentity, predictionEnvironmentIdentity, decisionLogicalTime, generatedLogicalTime,
 *          outcomeLogicalTime, outcomeStatus, timing }
 */
export function evaluateOneStepConsequence({ branches, executedActionKey, actualRewardVector, actualScalarReward, calibration, guard }) {
  const predictedBranch = (branches ?? []).find((branch) => branch.actionKey === executedActionKey) ?? null;
  const outcomeFor = (value) => ({ value, logicalTime: guard.outcomeLogicalTime, environmentIdentity: guard.environmentIdentity,
    status: guard.outcomeStatus });
  const predictionFor = (domain, value) => (predictedBranch === null ? null : {
    classId: 'DECISION_TIME_ONE_STEP_CONSEQUENCE', domain, value, confidence: null, timing: guard.timing ?? CounterfactualTiming.DECISION_TIME,
    generatedLogicalTime: guard.generatedLogicalTime, environmentIdentity: guard.predictionEnvironmentIdentity ?? guard.environmentIdentity });
  const components = Object.keys(ONE_STEP_COMPONENT_DOMAIN).sort().map((component) => {
    const domain = ONE_STEP_COMPONENT_DOMAIN[component];
    const verdict = bindPredictionToOutcome({ prediction: predictionFor(domain, predictedBranch?.rewardVector?.[component] ?? null),
      outcome: outcomeFor(actualRewardVector ? (actualRewardVector[component] ?? null) : null), environmentIdentity: guard.environmentIdentity,
      calibrationSufficient: calibrationSufficientFor(calibration, DOMAIN_CALIBRATION_REQUIREMENT[domain]), decisionLogicalTime: guard.decisionLogicalTime });
    return { component, domain, predicted: predictedBranch?.rewardVector?.[component] ?? null, actual: actualRewardVector?.[component] ?? null,
      quality: verdict.quality, reason: verdict.reason, error: verdict.error ?? null, absoluteError: verdict.absoluteError ?? null,
      attribution: NON_EXACT_SCORED.includes(verdict.quality) ? ErrorAttribution.PREDICTOR_ERROR : null };
  });
  const scalar = bindPredictionToOutcome({ prediction: predictionFor('transition', predictedBranch?.immediateScalar ?? null),
    outcome: outcomeFor(actualScalarReward ?? null), environmentIdentity: guard.environmentIdentity,
    calibrationSufficient: calibrationSufficientFor(calibration, CalibrationDomain.TRANSITION_SEMANTICS), decisionLogicalTime: guard.decisionLogicalTime });
  const wrongComponents = components.filter((entry) => NON_EXACT_SCORED.includes(entry.quality));
  return deepFreeze({ classId: 'DECISION_TIME_ONE_STEP_CONSEQUENCE', privilegedSimulatorAccess: true, confidence: null,
    predictionPresent: predictedBranch !== null, components,
    scalar: { quality: scalar.quality, reason: scalar.reason, error: scalar.error ?? null, absoluteError: scalar.absoluteError ?? null,
      predicted: predictedBranch?.immediateScalar ?? null, actual: actualScalarReward ?? null },
    // A scalar that matches while intermediate components are wrong is not grounded success.
    correctForWrongReason: scalar.quality === PredictionQuality.EXACT && wrongComponents.length > 0,
    // The scalar is a weighted sum of components, so >=2 wrong components with an exact scalar is cancellation.
    errorCompensation: scalar.quality === PredictionQuality.EXACT && wrongComponents.length >= 2 });
}

/* ---------------------------------------------------------------------------
 * Observation degradation (always on evaluation copies)
 * ------------------------------------------------------------------------- */

const OBSERVATION_FEATURE_INDEX = deepFreeze({ energy: 2, actorX: 3, actorY: 4, material: 6, objectiveShortfall: 12 });

export function degradeObservation(observation, degradation) {
  if (!Object.values(ObservationDegradation).includes(degradation) || degradation === ObservationDegradation.STALE_OBSERVATION) {
    throw new PredictionReliabilityContractError(`degradation not applicable to a single observation: ${degradation}`);
  }
  const copy = structuredClone(observation);
  const state = copy.metadata.canonicalState;
  if (degradation === ObservationDegradation.REMOVE_THREAT_INFORMATION) {
    state.entities = state.entities.map((entity) => ({ ...entity, hostile: false }));
    state.relationships = state.relationships.filter((relation) => relation.kind !== 'threatens');
  } else if (degradation === ObservationDegradation.REMOVE_OBJECTIVE_INFORMATION) {
    state.entities = state.entities.map((entity) => ({ ...entity, critical: false }));
    copy.metadata.objectives = []; copy.features[OBSERVATION_FEATURE_INDEX.objectiveShortfall] = 0;
  } else if (degradation === ObservationDegradation.DROP_ENTITY_SUBSET) {
    const dropped = new Set(state.entities.filter((entity) => entity.kind !== 'ACTOR' && '0123'.includes(sha256(`${entity.id}:STAGE3F6_DROP`)[0])).map((entity) => entity.id));
    state.entities = state.entities.filter((entity) => !dropped.has(entity.id));
    state.relationships = state.relationships.filter((relation) => !dropped.has(relation.from) && !dropped.has(relation.to));
  } else if (degradation === ObservationDegradation.HIDE_RELATIONSHIPS) {
    state.relationships = [];
  } else if (degradation === ObservationDegradation.REMOVE_RESOURCE_SIGNALS) {
    copy.features[OBSERVATION_FEATURE_INDEX.energy] = 0; copy.features[OBSERVATION_FEATURE_INDEX.material] = 0;
  } else if (degradation === ObservationDegradation.HIDE_SPATIAL_INFORMATION) {
    copy.features[OBSERVATION_FEATURE_INDEX.actorX] = 0; copy.features[OBSERVATION_FEATURE_INDEX.actorY] = 0;
  }
  return deepFreeze(copy);
}

export function degradeWorldStateFacts(facts, degradation) {
  const copy = structuredClone(facts);
  const drop = (path) => { if (copy[path]) copy[path] = { value: null, category: EpistemicCategory.UNKNOWN, stale: false }; };
  if (degradation === ObservationDegradation.REMOVE_RESOURCE_SIGNALS) drop('resources.actorEnergy');
  else if (degradation === ObservationDegradation.DROP_ENTITY_SUBSET) drop('entities.count');
  else if (degradation === ObservationDegradation.REMOVE_OBJECTIVE_INFORMATION) drop('objectives.count');
  else if (degradation === ObservationDegradation.HIDE_RELATIONSHIPS) drop('relationships.count');
  else if (degradation === ObservationDegradation.STALE_OBSERVATION) {
    for (const path of Object.keys(copy)) copy[path] = { ...copy[path], stale: true };
    if (copy['temporalState.tick']) copy['temporalState.tick'] = { ...copy['temporalState.tick'], value: copy['temporalState.tick'].value - 1 };
  }
  return copy;
}

export function worldStateDomainCoverage(facts) {
  const covered = new Set(Object.entries(RUNTIME_WORLD_STATE_FACTS)
    .filter(([path, meta]) => !meta.identity && facts[path] && facts[path].category !== EpistemicCategory.UNKNOWN).map(([, meta]) => meta.domain));
  return deepFreeze({ covered: PREDICTION_DOMAINS.filter((domain) => covered.has(domain)),
    missing: PREDICTION_DOMAINS.filter((domain) => !covered.has(domain)), complete: PREDICTION_DOMAINS.every((domain) => covered.has(domain)) });
}

/* ---------------------------------------------------------------------------
 * Router evidence on the Stage 3E corpus
 * ------------------------------------------------------------------------- */

/**
 * The frozen Stage 3E model stores the bias LAST (fit with hstack([X, 1]) @ w; replayed that way by the Stage 3D/3E
 * recovery certifier). The Stage 3F.5 runtime evaluates w[0] as bias and w[i+1] as weights. Both are measured,
 * never silently reconciled.
 */
export const RouterEquation = deepFreeze({
  STAGE3E_CANONICAL: 'STAGE3E_CANONICAL_BIAS_LAST', STAGE3F5_RUNTIME: 'STAGE3F5_RUNTIME_BIAS_FIRST',
});

export function scoreStage3ERouter(featureValues, model, equation = RouterEquation.STAGE3E_CANONICAL) {
  if (!Object.values(RouterEquation).includes(equation)) throw new PredictionReliabilityContractError(`unknown router equation: ${equation}`);
  const biasLast = equation === RouterEquation.STAGE3E_CANONICAL;
  let z = biasLast ? model.w[model.keys.length] : model.w[0];
  for (let index = 0; index < model.keys.length; index += 1) {
    const value = Number(featureValues[model.keys[index]]);
    z += model.w[biasLast ? index : index + 1] * ((value - model.mu[index]) / model.sd[index]);
  }
  const score = 1 / (1 + Math.exp(-z));
  return Number.isFinite(score) ? score : null;
}

export function branchRegret(entry, key) {
  const branch = entry.branches.find((candidate) => candidate[0] === key);
  return branch ? branch[4] : null;
}

export function proxyFidelity(entry) {
  const rest = entry.branches.filter((branch) => branch[0] !== entry.contractGreedyKey);
  if (rest.length < STAGE3F6_METHODOLOGY.proxyFidelity.minimumBranches) return deepFreeze({ tau: null, bucket: ProxyFidelityBucket.UNKNOWN });
  const tau = kendallTauB(rest.map((branch) => branch[2]), rest.map((branch) => branch[3]));
  const bucket = tau === null ? ProxyFidelityBucket.UNKNOWN
    : tau >= STAGE3F6_METHODOLOGY.proxyFidelity.high ? ProxyFidelityBucket.HIGH
      : tau < STAGE3F6_METHODOLOGY.proxyFidelity.low ? ProxyFidelityBucket.LOW : ProxyFidelityBucket.MEDIUM;
  return deepFreeze({ tau: round(tau), bucket });
}

/**
 * Contract path (frozen Stage 3E semantics) and Stage 3F.5 runtime path for one labeled case.
 * `label` is the frozen matrix row { y, f }. Router scores use the frozen model only.
 */
export function evaluateRouterCase(entry, label, model, tau = STAGE3F6_METHODOLOGY.stage3eFrozenTau) {
  const diff = entry.runtimeFeatureDiff ?? {};
  const derivationDiff = Object.fromEntries(Object.entries(diff).filter(([key]) => !STAGE3E_CANDIDATE_FEATURE_KEYS.includes(key)));
  const candidateDiff = Object.fromEntries(Object.entries(diff).filter(([key]) => STAGE3E_CANDIDATE_FEATURE_KEYS.includes(key)));
  const canonical = (values) => scoreStage3ERouter(values, model, RouterEquation.STAGE3E_CANONICAL);
  const runtimeEquation = (values) => scoreStage3ERouter(values, model, RouterEquation.STAGE3F5_RUNTIME);
  const runtimeFeatures = { ...label.f, ...diff };
  const scores = {
    contract: canonical(label.f),
    runtime: runtimeEquation(runtimeFeatures),
    runtimeFeaturesCanonicalEquation: canonical(runtimeFeatures),
    derivationOnly: canonical({ ...label.f, ...derivationDiff }),
    candidateOnly: canonical({ ...label.f, ...candidateDiff }),
    equationOnly: runtimeEquation(label.f),
  };
  const routed = (score) => score !== null && score >= tau;
  const routes = Object.fromEntries(Object.entries(scores).map(([name, score]) => [name, routed(score)]));
  const optimal = (key) => { const regret = branchRegret(entry, key); return regret === null ? null : regret === 0; };
  const decisionCorrect = (route, key) => { const o = optimal(key); return o === null ? null : route ? o : !o; };
  // Intermediate evidence errors on the runtime path, each defined against the frozen contract.
  const featureRouteError = Object.keys(diff).length > 0 && routes.runtimeFeaturesCanonicalEquation !== routes.contract;
  const equationRouteError = routes.runtime !== routes.runtimeFeaturesCanonicalEquation;
  const actionBindingError = entry.runtimeGreedyKey !== entry.contractGreedyKey;
  const correctRuntime = decisionCorrect(routes.runtime, entry.runtimeGreedyKey);
  const correctContract = decisionCorrect(routes.contract, entry.contractGreedyKey);
  const singleFixes = [
    featureRouteError ? decisionCorrect(routes.equationOnly, entry.runtimeGreedyKey) : null,
    equationRouteError ? decisionCorrect(routes.runtimeFeaturesCanonicalEquation, entry.runtimeGreedyKey) : null,
    actionBindingError ? decisionCorrect(routes.runtime, entry.contractGreedyKey) : null,
  ].filter((value) => value !== null);
  const intermediateErrors = [featureRouteError, equationRouteError, actionBindingError].filter(Boolean).length;
  return deepFreeze({
    recordHash: entry.recordHash, partition: entry.partition, y: label.y,
    scoreContract: scores.contract, scoreRuntime: scores.runtime, scoreRuntimeFeaturesCanonical: scores.runtimeFeaturesCanonicalEquation,
    scoreDerivationOnly: scores.derivationOnly, scoreCandidateOnly: scores.candidateOnly, scoreEquationOnly: scores.equationOnly,
    routeContract: routes.contract, routeRuntime: routes.runtime, routeRuntimeFeaturesCanonical: routes.runtimeFeaturesCanonicalEquation,
    routeDerivationOnly: routes.derivationOnly, routeCandidateOnly: routes.candidateOnly, routeEquationOnly: routes.equationOnly,
    runtimeGreedyOptimal: optimal(entry.runtimeGreedyKey), contractGreedyOptimal: label.y === 1,
    runtimeGreedyRegret: branchRegret(entry, entry.runtimeGreedyKey), contractGreedyRegret: branchRegret(entry, entry.contractGreedyKey),
    candidateOptimal: optimal(entry.runtimeCandidate.actionKey),
    featureParity: Object.keys(derivationDiff).length === 0, derivationDiffKeys: Object.keys(derivationDiff).sort(),
    candidateDiffKeys: Object.keys(candidateDiff).sort(), featureRouteError, equationRouteError, actionBindingError,
    correctRuntime, correctContract,
    correctForWrongReason: correctRuntime === true && intermediateErrors > 0,
    errorCompensation: correctRuntime === true && intermediateErrors >= 2 && singleFixes.every((value) => value === false),
    contractFalseSafe: routes.contract && label.y === 0,
    runtimeFalseSafe: routes.runtime && optimal(entry.runtimeGreedyKey) === false,
    proxy: proxyFidelity(entry),
  });
}

export function featureSignature(features, model) { return model.keys.map((key) => String(features[key])).join('|'); }
export function worldStateSignature(entry) {
  const ws = entry.worldState; return `${ws.tick}|${ws.energy}|${ws.entities}|${ws.relations}|${ws.objectives}`;
}

/** In-sample label ambiguity of a representation: an upper bound for ANY router over it, not a deployable model. */
export function representationAmbiguity(items, { coverage = null, evidencedClassSize = 5 } = {}) {
  const classes = new Map();
  for (const item of items) {
    if (!classes.has(item.signature)) classes.set(item.signature, { n: 0, positive: 0 });
    const entry = classes.get(item.signature); entry.n += 1; entry.positive += item.y === 1 ? 1 : 0;
  }
  const values = [...classes.values()]; const n = items.length;
  const ambiguousCases = values.filter((entry) => entry.positive > 0 && entry.positive < entry.n).reduce((sum, entry) => sum + entry.n, 0);
  const evidenced = values.filter((entry) => entry.n >= evidencedClassSize);
  const evidencedCases = evidenced.reduce((sum, entry) => sum + entry.n, 0);
  let ceilingPrecision = null;
  if (coverage !== null && n > 0) {
    const ranked = [...values].filter((entry) => entry.positive > 0)
      .sort((a, b) => (b.positive / b.n) - (a.positive / a.n) || b.n - a.n);
    let taken = 0; let positive = 0;
    for (const entry of ranked) { if (taken >= coverage * n) break; taken += entry.n; positive += entry.positive; }
    ceilingPrecision = taken === 0 ? null : round(positive / taken);
  }
  return deepFreeze({ n, classes: values.length, singletonRate: n === 0 ? null : round(values.filter((entry) => entry.n === 1).length / n),
    ambiguousCaseRate: n === 0 ? null : round(ambiguousCases / n),
    bayesCeilingAccuracy: n === 0 ? null : round(values.reduce((sum, entry) => sum + Math.max(entry.positive, entry.n - entry.positive), 0) / n),
    evidencedClassCoverage: n === 0 ? null : round(evidencedCases / n),
    evidencedAmbiguousRate: evidencedCases === 0 ? null
      : round(evidenced.filter((entry) => entry.positive > 0 && entry.positive < entry.n).reduce((sum, entry) => sum + entry.n, 0) / evidencedCases),
    selectiveCeilingPrecision: ceilingPrecision, ceilingIsInSampleUpperBound: true });
}

const attribution = (category, basis) => deepFreeze({ category, basis });

function representationAttribution(signatureClass) {
  if (signatureClass && signatureClass.positive > 0 && signatureClass.positive < signatureClass.n) {
    return attribution(ErrorAttribution.STATE_REPRESENTATION_ERROR, 'IDENTICAL_CONTRACT_FEATURES_OPPOSITE_LABELS');
  }
  if (signatureClass && signatureClass.n >= 2 && signatureClass.positive === 0) {
    return attribution(ErrorAttribution.ROUTER_ERROR, 'REPRESENTATION_EVIDENCES_UNSAFE_YET_ROUTED');
  }
  return null;
}

/** Deterministic precedence; UNKNOWN is a valid, reported outcome and is never forced into a category. */
export function attributeRuntimeFalseSafe(caseEval, { unscorable = false, stochasticDuplicate = false, signatureClass = null } = {}) {
  if (unscorable) return attribution(ErrorAttribution.OUTCOME_BINDING_ERROR, 'EXECUTED_ACTION_NOT_BOUND_TO_SCORED_BRANCH');
  if (stochasticDuplicate) return attribution(ErrorAttribution.INHERENT_STOCHASTICITY, 'IDENTICAL_FULL_STATE_OPPOSITE_OUTCOMES');
  if (caseEval.routeRuntime && !caseEval.routeRuntimeFeaturesCanonical) return attribution(ErrorAttribution.ROUTER_ERROR, 'RUNTIME_ROUTER_EQUATION_DIVERGENCE');
  if (caseEval.routeRuntimeFeaturesCanonical && !caseEval.routeContract) {
    return attribution(ErrorAttribution.FEATURE_DERIVATION_ERROR, caseEval.routeDerivationOnly ? 'RUNTIME_FEATURE_EQUATION_DIVERGENCE' : 'CANDIDATE_EVIDENCE_SUBSTITUTION');
  }
  if (caseEval.routeContract && caseEval.actionBindingError && caseEval.contractGreedyOptimal) {
    return attribution(ErrorAttribution.ACTION_BINDING_ERROR, 'RUNTIME_GREEDY_ACTION_DIFFERS_FROM_LABELED_GREEDY_ACTION');
  }
  return representationAttribution(signatureClass) ?? attribution(ErrorAttribution.UNKNOWN, 'CONTRACT_PATH_ERROR_NOT_SEPARABLE_WITHOUT_TRAINING');
}

export function attributeContractFalseSafe({ stochasticDuplicate = false, signatureClass = null } = {}) {
  if (stochasticDuplicate) return attribution(ErrorAttribution.INHERENT_STOCHASTICITY, 'IDENTICAL_FULL_STATE_OPPOSITE_OUTCOMES');
  return representationAttribution(signatureClass) ?? attribution(ErrorAttribution.UNKNOWN, 'ROUTER_FORM_VS_LOSSY_REPRESENTATION_NOT_SEPARABLE_WITHOUT_TRAINING');
}

/* ---------------------------------------------------------------------------
 * Partitions, leakage, novelty, tiers
 * ------------------------------------------------------------------------- */

/** Remove derived variants: a case whose topology already appeared in an earlier partition is quarantined. */
export function quarantineDerivedVariants(partitions, order = STAGE3F6_METHODOLOGY.partitions.quarantineOrder) {
  const seen = new Set(); const kept = {}; const quarantined = {};
  for (const name of order) {
    const list = partitions[name] ?? [];
    kept[name] = list.filter((entry) => !seen.has(entry.topologyHash));
    quarantined[name] = list.length - kept[name].length;
    for (const entry of list) seen.add(entry.topologyHash);
  }
  return { partitions: kept, quarantined };
}

export function partitionIdentity(entries) {
  return `sha256:${sha256(entries.map((entry) => entry.recordHash).sort().join('\n'))}`;
}

export function checkPartitionLeakage(partitions) {
  const names = Object.keys(partitions).sort();
  const overlap = (field) => {
    const pairs = {}; let total = 0;
    for (let i = 0; i < names.length; i += 1) {
      const left = new Set(partitions[names[i]].map((entry) => entry[field]));
      for (let j = i + 1; j < names.length; j += 1) {
        const count = partitions[names[j]].filter((entry) => left.has(entry[field])).length;
        pairs[`${names[i]}/${names[j]}`] = count; total += count;
      }
    }
    return { total, pairs };
  };
  const episode = overlap('recordHash'); const state = overlap('worldHash'); const variant = overlap('topologyHash');
  return deepFreeze({ episodeOverlap: episode.total, stateIdOverlap: state.total, derivedVariantLeakage: variant.total,
    pairwise: { recordHash: episode.pairs, worldHash: state.pairs, topologyHash: variant.pairs } });
}

export function temporalLeakage(episodes) {
  let temporal = 0; let futureToPast = 0;
  for (const episode of episodes) {
    if (!(episode.decisionLogicalTime < episode.outcomeLogicalTime)) temporal += 1;
    if (episode.predictionGeneratedLogicalTime !== null && episode.predictionGeneratedLogicalTime > episode.decisionLogicalTime) futureToPast += 1;
  }
  return deepFreeze({ temporalLeakage: temporal, futureToPastLeakage: futureToPast });
}

export function standardizedMatrix(rows, model) {
  const dims = model.keys.length; const data = new Float64Array(rows.length * dims);
  rows.forEach((features, row) => { for (let d = 0; d < dims; d += 1) data[row * dims + d] = (Number(features[model.keys[d]]) - model.mu[d]) / model.sd[d]; });
  return { data, rows: rows.length, dims };
}

export function nearestReferenceDistances(queries, references) {
  const { dims } = queries; const out = new Float64Array(queries.rows);
  for (let q = 0; q < queries.rows; q += 1) {
    let best = Infinity; const qo = q * dims;
    for (let r = 0; r < references.rows; r += 1) {
      let sum = 0; const ro = r * dims;
      for (let d = 0; d < dims && sum < best; d += 1) { const delta = queries.data[qo + d] - references.data[ro + d]; sum += delta * delta; }
      if (sum < best) best = sum;
    }
    out[q] = Math.sqrt(best / dims);
  }
  return out;
}

export function deriveNoveltyThresholds(calibrationDistances) {
  const sorted = [...calibrationDistances].sort((a, b) => a - b);
  return deepFreeze({ familiar: round(nearestRankQuantile(sorted, STAGE3F6_METHODOLOGY.novelty.familiarQuantile)),
    nearNovel: round(nearestRankQuantile(sorted, STAGE3F6_METHODOLOGY.novelty.nearNovelQuantile)), source: 'CAL', n: sorted.length });
}

export function noveltyBucket(distance, thresholds) {
  if (typeof distance !== 'number' || !Number.isFinite(distance) || !thresholds) return NoveltyBucket.UNKNOWN;
  if (distance <= thresholds.familiar) return NoveltyBucket.FAMILIAR;
  return distance <= thresholds.nearNovel ? NoveltyBucket.NEAR_NOVEL : NoveltyBucket.STRONGLY_NOVEL;
}

export function selectiveReliability(pairs, tau) {
  const routed = pairs.filter((pair) => pair.score !== null && pair.score >= tau);
  const correct = routed.filter((pair) => pair.correct).length; const interval = wilsonInterval(correct, routed.length);
  const errorsTotal = pairs.filter((pair) => !pair.correct).length;
  return deepFreeze({ tau, n: routed.length, coverage: pairs.length === 0 ? null : round(routed.length / pairs.length),
    observed: interval.p, lower: interval.lower, upper: interval.upper,
    abstentionRate: pairs.length === 0 ? null : round(1 - routed.length / pairs.length),
    errorAmongNonAbstained: interval.p === null ? null : round(1 - interval.p),
    errorAvoidedByAbstention: errorsTotal === 0 ? null : round(1 - (routed.length - correct) / errorsTotal) });
}

export function selectTierOperatingPoints(calPairs, { tiers = STAGE3F6_METHODOLOGY.reliabilityTiers, floor = STAGE3F6_METHODOLOGY.evidenceFloor.minTierN } = {}) {
  const grid = Array.from({ length: 50 }, (_, index) => round(0.5 + index * 0.01, 2));
  const points = grid.map((tau) => selectiveReliability(calPairs, tau));
  const best = [...points].filter((point) => point.n >= floor).sort((a, b) => b.lower - a.lower || a.tau - b.tau)[0] ?? null;
  return deepFreeze(Object.fromEntries(tiers.map((tier) => {
    const chosen = points.find((point) => point.n >= floor && point.lower >= tier) ?? null;
    return [String(tier), { tier, tau: chosen?.tau ?? null, cal: chosen, bestEvidencedCalPoint: best }];
  })));
}

export function evaluateTier(pairs, operatingPoint, tier, { floor = STAGE3F6_METHODOLOGY.evidenceFloor.minTierN, referenceTau = STAGE3F6_METHODOLOGY.stage3eFrozenTau } = {}) {
  if (operatingPoint.tau === null) {
    const reference = selectiveReliability(pairs, referenceTau);
    return deepFreeze({ tier, status: 'NOT_ACHIEVABLE', reason: 'NO_CAL_OPERATING_POINT_MEETS_TIER_AT_EVIDENCE_FLOOR',
      tau: null, referenceTau, n: reference.n, coverage: reference.coverage, observed: reference.observed, lower: reference.lower });
  }
  const point = selectiveReliability(pairs, operatingPoint.tau);
  const achievable = point.n >= floor && point.lower >= tier;
  return deepFreeze({ tier, status: achievable ? 'ACHIEVABLE' : 'NOT_ACHIEVABLE',
    reason: achievable ? null : point.n < floor ? 'BELOW_EVIDENCE_FLOOR' : 'WILSON_LOWER_BELOW_TIER',
    tau: operatingPoint.tau, n: point.n, coverage: point.coverage, observed: point.observed, lower: point.lower });
}

/* ---------------------------------------------------------------------------
 * Evaluation freeze and sealed partition access
 * ------------------------------------------------------------------------- */

export function createEvaluationFreeze({ corpusDigest, snapshotManifest, partitionIdentities, designDerived, inventory, sealedExposureDisclosures = [] }) {
  const authority = defaultAuthorityPolicy(); assertEvaluationOnly(authority);
  const body = {
    recordType: 'SENTINEL_STAGE3F6_EVALUATION_FREEZE_V1', contractId: PREDICTION_RELIABILITY_CONTRACT_ID,
    contractHash: PREDICTION_RELIABILITY_CONTRACT_HASH, methodology: STAGE3F6_METHODOLOGY, methodologyHash: sha256(STAGE3F6_METHODOLOGY),
    corpusDigest, evaluationSnapshot: { snapshotId: snapshotManifest.snapshotId, snapshotDigest: snapshotManifest.snapshotDigest },
    partitionIdentities, designDerived, predictionInventory: inventory,
    // Sealed-partition metrics were not used to set any threshold. Any pre-freeze exposure is disclosed, not hidden.
    sealedMetricsUsedForThresholds: false, sealedExposureDisclosures, authority,
  };
  return deepFreeze({ ...body, freezeHash: sha256(body) });
}

export function verifyEvaluationFreeze(freeze) {
  if (!freeze || freeze.recordType !== 'SENTINEL_STAGE3F6_EVALUATION_FREEZE_V1') throw new PredictionReliabilityContractError('not a Stage 3F.6 evaluation freeze');
  const { freezeHash, ...body } = freeze;
  if (freezeHash !== sha256(body)) throw new PredictionReliabilityContractError('evaluation freeze hash mismatch');
  if (body.methodologyHash !== sha256(STAGE3F6_METHODOLOGY)) throw new PredictionReliabilityContractError('methodology changed after freeze');
  assertEvaluationOnly(body.authority);
  return true;
}

/** Design partitions are readable at any time; sealed partitions only with a verified freeze naming their identity. */
export function createPartitionAccess(partitions, { namespace = null } = {}) {
  const log = [];
  const key = (name) => (namespace === null ? name : `${namespace}/${name}`);
  const identities = Object.fromEntries(Object.entries(partitions).map(([name, entries]) => [key(name), partitionIdentity(entries)]));
  return Object.freeze({
    identities: deepFreeze(identities),
    design(name) {
      if (!DESIGN_PARTITIONS.includes(name)) throw new PredictionReliabilityContractError(`not a design partition: ${name}`);
      log.push({ partition: key(name), access: 'DESIGN' }); return partitions[name];
    },
    sealed(name, freeze) {
      if (!SEALED_PARTITIONS.includes(name)) throw new PredictionReliabilityContractError(`not a sealed partition: ${name}`);
      if (!freeze) throw new PredictionReliabilityContractError('SEALED_PARTITION_ACCESS_BEFORE_FREEZE', { partition: name });
      verifyEvaluationFreeze(freeze);
      if (freeze.partitionIdentities[key(name)] !== identities[key(name)]) throw new PredictionReliabilityContractError('sealed partition identity differs from freeze', { partition: key(name) });
      log.push({ partition: key(name), access: 'SEALED', freezeHash: freeze.freezeHash }); return partitions[name];
    },
    accessLog: () => deepFreeze(structuredClone(log)),
  });
}

/* ---------------------------------------------------------------------------
 * Diagnosis
 * ------------------------------------------------------------------------- */

export function diagnoseLimitations({ contractFalseSafeByFidelity, runtimeFalseSafeAttribution, routeDisagreementRate,
  holdoutEce, holdoutHcw090, horizonFalseSafe, multistepPredictionAvailable, calibrationSensitivity }) {
  const floor = STAGE3F6_METHODOLOGY.evidenceFloor;
  const totalContract = Object.values(contractFalseSafeByFidelity).reduce((sum, value) => sum + value, 0);
  const share = (value, total) => (total === 0 ? 0 : value / total);
  const aShare = share(contractFalseSafeByFidelity.HIGH ?? 0, totalContract);
  const cShare = share((contractFalseSafeByFidelity.MEDIUM ?? 0) + (contractFalseSafeByFidelity.LOW ?? 0), totalContract);
  const runtimeTotal = Object.values(runtimeFalseSafeAttribution).reduce((sum, value) => sum + value, 0);
  const bShare = share((runtimeFalseSafeAttribution.FEATURE_DERIVATION_ERROR ?? 0) + (runtimeFalseSafeAttribution.ACTION_BINDING_ERROR ?? 0), runtimeTotal);
  const early = horizonFalseSafe.early; const late = horizonFalseSafe.late;
  const eDelta = early.routed >= floor.minBucketN && late.routed >= floor.minBucketN
    ? late.falseSafe / late.routed - early.falseSafe / early.routed : null;
  const supported = {
    A_ROUTER_LIMITED: { supported: aShare >= 0.2, share: round(aShare, 4) },
    B_STATE_REPRESENTATION_LIMITED: { supported: bShare >= 0.2 || routeDisagreementRate >= 0.02, share: round(bShare, 4), routeDisagreementRate: round(routeDisagreementRate, 4) },
    C_PREDICTION_LIMITED: { supported: cShare >= 0.2, share: round(cShare, 4) },
    D_UNCERTAINTY_CALIBRATION_LIMITED: { supported: (holdoutEce ?? 0) >= 0.05 || (holdoutHcw090.n >= floor.minTierN && (holdoutHcw090.rate ?? 0) >= 0.1),
      ece: holdoutEce, hcw090: holdoutHcw090.rate, hcw090N: holdoutHcw090.n },
    E_LONG_HORIZON_DRIFT_LIMITED: { supported: multistepPredictionAvailable === false && eDelta !== null && eDelta >= 0.1, falseSafeDelta: round(eDelta, 4) },
    F_ENVIRONMENT_CALIBRATION_LIMITED: { supported: calibrationSensitivity > 0, calibrationSensitivity },
  };
  const insufficient = totalContract < floor.minBucketN;
  const supportedIds = Object.entries(supported).filter(([, value]) => value.supported).map(([id]) => id);
  const categories = insufficient ? [DiagnosisCategory.H_INSUFFICIENT_EVIDENCE]
    : [...supportedIds, ...(supportedIds.length >= 2 ? [DiagnosisCategory.G_MIXED_LIMITATION] : [])];
  let primary = DiagnosisCategory.H_INSUFFICIENT_EVIDENCE; let secondary = null;
  if (!insufficient) {
    const [first, second] = aShare >= cShare ? ['A_ROUTER_LIMITED', 'C_PREDICTION_LIMITED'] : ['C_PREDICTION_LIMITED', 'A_ROUTER_LIMITED'];
    primary = first;
    secondary = supported[second].supported ? second
      : ['B_STATE_REPRESENTATION_LIMITED', 'E_LONG_HORIZON_DRIFT_LIMITED', 'D_UNCERTAINTY_CALIBRATION_LIMITED', 'F_ENVIRONMENT_CALIBRATION_LIMITED']
        .find((id) => supported[id].supported) ?? null;
  }
  return deepFreeze({ categories, supported, primary, secondary, contractFalseSafeTotal: totalContract, runtimeFalseSafeTotal: runtimeTotal });
}

/* ---------------------------------------------------------------------------
 * Timing
 * ------------------------------------------------------------------------- */

export function timed(fn) {
  const start = performance.now(); const value = fn(); return { value, ms: performance.now() - start };
}

export function stableDigest(value) { return `sha256:${sha256(value)}`; }
export { stableStringify };
