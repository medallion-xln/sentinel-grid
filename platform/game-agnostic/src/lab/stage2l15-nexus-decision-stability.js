/* Stage 2L.15 — Nexus decision stability, counterfactual consistency and
 * confidence-ceiling evaluation (R0, shadow only).
 *
 * THE MEASURED LIMITATION THIS ADDRESSES. Stage 2L.14 established that Nexus
 * confidence is real and ordered (0.7135 -> 0.9832 across buckets) but that no
 * SUPPORTED region reaches the inherited 0.99 floor. Every cell that cleared the
 * floor on DEVELOPMENT lost it on a fresh calibration draw. The supported ceiling
 * measured out near 0.97-0.98 under the confidence signals then available.
 *
 * WHAT THIS STAGE ADDS. One new family of decision-time evidence: does the
 * recommendation SURVIVE bounded, legitimate perturbation of the quantities the
 * world is uncertain about? The hypothesis under test is that a correct
 * recommendation rests on a margin that small legitimate noise cannot erase,
 * while an incorrect one rests on an artefact that noise destroys.
 *
 * WHY STAGE 2L.14'S PROBE WAS USELESS, AND WHAT IS DIFFERENT HERE. Stage 2L.14
 * measured robustness by scaling ONE field across EVERY entity by the SAME signed
 * percentage. That is a near-monotone transform of the ranking, so 98.1% of cases
 * were trivially "robust" and the signal separated 0.8062 from a 0.8041 base rate.
 * The defect was the probe, not the idea. Every perturbation here is
 * HETEROGENEOUS: each entity and each relation receives its OWN bounded delta, so
 * the ordering is genuinely stressed rather than rigidly translated.
 *
 * WHAT IS DELIBERATELY NOT DONE. Nexus recommendation semantics are untouched —
 * this stage reads the frozen Stage 2L.13 expert and never modifies it. The
 * benchmark, the arbiter and the 0.99 floor are inherited unchanged. The
 * statistical method (Wilson score lower bound, z = 1.6449, one-sided 95%) is the
 * Stage 2L.14 method, reused without alteration, and was fixed before any Stage
 * 2L.15 number was computed.
 *
 * NO GROUND-TRUTH LEAKAGE. Perturbations are seeded from a digest of world
 * CONTENT — entity fields and relation fields — never from the case id, the split,
 * the variant index, the topology family, the semantic profile, the objective
 * type, or any evaluation outcome. Every stability signal is computable at
 * decision time, before anyone knows whether Nexus was right.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { buildStage2L12Case, deriveGroundTruth, primeRecommendation } from './stage2l12-nexus-semantic-grounding-and-observable-utility.js';
import { evaluateValueAwareNexus } from './stage2l13-value-aware-nexus.js';
import {
  STAGE2L14_RELIABILITY_FLOOR,
  STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L14_BOUND_METHOD,
  STAGE2L14_BOUND_Z,
  STAGE2L14_BOUND_CONFIDENCE_LEVEL,
  STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT,
  STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT,
  STAGE2L14_MINIMUM_DELEGATION_COUNT,
  STAGE2L14_MINIMUM_DELEGATION_RATE,
  wilsonLowerBound,
} from './stage2l14-nexus-confidence-calibration.js';

export const STAGE2L15_STAGE = 'STAGE2L15_NEXUS_DECISION_STABILITY_AND_CONFIDENCE_CEILING';
export const STAGE2L15_STAGE2L14_CERTIFICATION_HASH = '96e10b32d8ca0ae2a36e252c72dd253df6504d331d1d4baa25584077631c6ac3';
export const STAGE2L15_STAGE2L13_CERTIFICATION_HASH = '0b7f44d8874d0dfd831dfe7d05571735a62dbbcd689e89c77e3b377e636734c6';

const MICRO = 1000000;
function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }

/* ---------------------------------------------------------------------------
 * INHERITED, NOT REDECLARED.
 *
 * These are re-exported from Stage 2L.14 rather than restated, so that no edit
 * here can silently diverge from the certified values. The floor in particular is
 * a single definition in a single file.
 * ------------------------------------------------------------------------- */

export const STAGE2L15_RELIABILITY_FLOOR = STAGE2L14_RELIABILITY_FLOOR;
export const STAGE2L15_MAX_HARMFUL_CHANGE_RATE = STAGE2L14_MAX_HARMFUL_CHANGE_RATE;
export const STAGE2L15_MAX_CORRECT_PRIME_BREAK_RATE = STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE;
export const STAGE2L15_BOUND_METHOD = STAGE2L14_BOUND_METHOD;
export const STAGE2L15_BOUND_Z = STAGE2L14_BOUND_Z;
export const STAGE2L15_BOUND_CONFIDENCE_LEVEL = STAGE2L14_BOUND_CONFIDENCE_LEVEL;
export const STAGE2L15_CONSERVATIVE_BOUND_REQUIREMENT = STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT;
export const STAGE2L15_MINIMUM_ELIGIBLE_CASE_COUNT = STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT;
export const STAGE2L15_MINIMUM_DELEGATION_COUNT = STAGE2L14_MINIMUM_DELEGATION_COUNT;
export const STAGE2L15_MINIMUM_DELEGATION_RATE = STAGE2L14_MINIMUM_DELEGATION_RATE;

/* The same three disjoint variant ranges Stage 2L.14 certified. Reusing them
 * exactly means the Stage 2L.14 result is directly comparable and the split
 * discipline is inherited rather than re-argued. */
export const STAGE2L15_SPLITS = deepFreeze({
  DEVELOPMENT: { split: 'HOLDOUT', from: 0, to: 14000 },
  CALIBRATION: { split: 'HOLDOUT', from: 14000, to: 28000 },
  FINAL_HOLDOUT: { split: 'HOLDOUT', from: 28000, to: 42000 },
});

/* ---------------------------------------------------------------------------
 * PHASE 1 — legitimate perturbation families.
 *
 * A perturbation is legitimate when it changes a quantity the world is genuinely
 * uncertain about while preserving the decision problem. Each family declares its
 * magnitude, the invariants it holds, and what it is forbidden from touching.
 *
 * INVARIANTS HELD BY EVERY FAMILY:
 *   - the legal action set, by identity and by target
 *   - the objective: which entities are objectiveRelevant
 *   - the relation graph's shape: every edge, its endpoints and its kind
 *   - which entities are operationally down (availability's side of the
 *     Stage 2L.12 threshold is preserved, only its magnitude moves)
 *   - non-negativity and the 0..MICRO domain of bounded fields
 *
 * NOTHING may touch ground truth, the optimal action, the benchmark's scoring,
 * or any evaluation result. Those are not inputs here.
 * ------------------------------------------------------------------------- */

export const STAGE2L15_PERTURBATION_MODEL_ID = 'STAGE2L15_HETEROGENEOUS_BOUNDED_PERTURBATION_V1';

export const STAGE2L15_PERTURBATION_FAMILIES = deepFreeze([
  {
    id: 'ENTITY_VALUE_JITTER',
    rationale: 'How much an entity is worth when delivered is an estimate, not a measurement.',
    fields: ['objectiveValue'],
    maxMagnitudePercent: 8,
    heterogeneous: true,
    preservesActionSet: true,
    preservesObjectiveIdentity: true,
    preservesGraphShape: true,
  },
  {
    id: 'COST_JITTER',
    rationale: 'Restoration cost is a forecast; a decision resting on a 5% cost estimate is fragile.',
    fields: ['restorationCost'],
    maxMagnitudePercent: 8,
    heterogeneous: true,
    preservesActionSet: true,
    preservesObjectiveIdentity: true,
    preservesGraphShape: true,
  },
  {
    id: 'RISK_JITTER',
    rationale: 'Exposure is inferred from incomplete observation.',
    fields: ['risk', 'protectionNeed'],
    maxMagnitudePercent: 8,
    heterogeneous: true,
    preservesActionSet: true,
    preservesObjectiveIdentity: true,
    preservesGraphShape: true,
  },
  {
    id: 'CAPACITY_DEMAND_JITTER',
    rationale: 'Supplied capacity and required demand are both measured with error.',
    fields: ['baseCapacity', 'demand'],
    maxMagnitudePercent: 6,
    heterogeneous: true,
    preservesActionSet: true,
    preservesObjectiveIdentity: true,
    preservesGraphShape: true,
  },
  {
    id: 'AVAILABILITY_JITTER',
    rationale: 'Operational state is sampled. The threshold side is held: which entities are down does not change, only how far.',
    fields: ['availability'],
    maxMagnitudePercent: 6,
    heterogeneous: true,
    preservesActionSet: true,
    preservesObjectiveIdentity: true,
    preservesGraphShape: true,
    preservesAvailabilityThresholdSide: true,
  },
  {
    id: 'RELATION_WEIGHT_JITTER',
    rationale: 'Edge strength is the least directly observed quantity in the model.',
    fields: ['relation.weight'],
    maxMagnitudePercent: 10,
    heterogeneous: true,
    preservesActionSet: true,
    preservesObjectiveIdentity: true,
    preservesGraphShape: true,
  },
  {
    id: 'COMBINED_MILD',
    rationale: 'Real uncertainty is not confined to one field at a time.',
    fields: ['objectiveValue', 'restorationCost', 'risk'],
    maxMagnitudePercent: 5,
    heterogeneous: true,
    preservesActionSet: true,
    preservesObjectiveIdentity: true,
    preservesGraphShape: true,
  },
  {
    id: 'ORDERING_PERMUTATION',
    rationale: 'A pure invariance probe. Reordering entities and relations changes nothing real, so any flip here is an expert defect, not evidence about the world.',
    fields: [],
    maxMagnitudePercent: 0,
    heterogeneous: false,
    preservesActionSet: true,
    preservesObjectiveIdentity: true,
    preservesGraphShape: true,
    semanticNoOp: true,
  },
]);

export const STAGE2L15_PROBES_PER_FAMILY = 2;   // one draw either side of the estimate
export const STAGE2L15_PERTURBATIONS_PER_CASE = (STAGE2L15_PERTURBATION_FAMILIES.length - 1) * STAGE2L15_PROBES_PER_FAMILY + 1;
export const STAGE2L15_AVAILABILITY_THRESHOLD = 600000; // inherited from Stage 2L.12

/* Deterministic per-element noise. Seeded from world CONTENT plus the family and
 * probe index — never from the case id, split, variant, family label or any
 * outcome. Two identical worlds therefore receive identical perturbations, and a
 * world's perturbation cannot encode anything about its answer. */
function contentSeed(world) {
  return sha256({
    entities: world.entities.map((entity) => [
      entity.entityId, entity.objectiveValue, entity.demand, entity.baseCapacity,
      entity.availability, entity.risk, entity.protectionNeed, entity.restorationCost,
      entity.objectiveRelevant === true ? 1 : 0,
    ]),
    relations: world.relations.map((relation) => [relation.relationId, relation.from, relation.to, relation.kind, relation.weight]),
  });
}

/* A small deterministic hash to a signed fraction in [-1, 1], in micro-units.
 * Cheap, replayable, and independent per element. */
function signedFraction(seed, label) {
  const digest = sha256({ seed, label });
  const value = Number.parseInt(digest.slice(0, 8), 16);
  return ((value % (2 * MICRO + 1)) - MICRO);
}

function jitterInteger(base, seed, label, magnitudePercent, { clampHigh = null } = {}) {
  if (!Number.isInteger(base)) return base;
  const fraction = signedFraction(seed, label);
  const delta = Math.round((base * magnitudePercent * fraction) / (100 * MICRO));
  const next = base + delta;
  const floored = Math.max(0, next);
  return clampHigh === null ? floored : Math.min(clampHigh, floored);
}

/**
 * Apply one perturbation family at one probe index. Returns a NEW world; the
 * input is never mutated. `probe` selects the sign of the whole draw, so the two
 * probes per family bracket the estimate rather than repeating it.
 */
export function perturbStage2L15World(world, familyId, probe) {
  const family = STAGE2L15_PERTURBATION_FAMILIES.find((entry) => entry.id === familyId);
  if (family === undefined) throw new Error(`STAGE2L15_UNKNOWN_PERTURBATION_FAMILY:${familyId}`);
  const seed = contentSeed(world);

  if (family.id === 'ORDERING_PERMUTATION') {
    /* Semantic no-op: reverse both lists. Any change in Nexus output under this is
     * an ordering defect in the expert, which is exactly what it is measured for. */
    return {
      entities: [...world.entities].reverse().map((entity) => ({ ...entity })),
      relations: [...world.relations].reverse().map((relation) => ({ ...relation })),
    };
  }

  const sign = probe === 0 ? 1 : -1;
  const magnitude = family.maxMagnitudePercent * sign;
  const touchesRelations = family.fields.includes('relation.weight');
  const entityFields = family.fields.filter((field) => !field.startsWith('relation.'));

  return {
    entities: world.entities.map((entity) => {
      const next = { ...entity };
      for (const field of entityFields) {
        const label = `${family.id}:${probe}:${entity.entityId}:${field}`;
        if (field === 'availability') {
          const jittered = jitterInteger(entity.availability, seed, label, magnitude, { clampHigh: MICRO });
          /* Hold the threshold side: an entity that was operational stays
           * operational and one that was down stays down. Only the magnitude of
           * the estimate moves, which is the quantity actually uncertain. */
          const wasUp = entity.availability >= STAGE2L15_AVAILABILITY_THRESHOLD;
          const isUp = jittered >= STAGE2L15_AVAILABILITY_THRESHOLD;
          next.availability = wasUp === isUp ? jittered : entity.availability;
        } else {
          next[field] = jitterInteger(entity[field], seed, label, magnitude);
        }
      }
      return next;
    }),
    relations: world.relations.map((relation) => {
      if (!touchesRelations) return { ...relation };
      const label = `${family.id}:${probe}:${relation.relationId}:weight`;
      return { ...relation, weight: jitterInteger(relation.weight, seed, label, magnitude) };
    }),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 2 — stability metrics.
 *
 * Every metric is a function of the expert's outputs on the base world and on the
 * perturbed worlds. None reads ground truth, and none can: the inputs are Nexus
 * outputs only.
 * ------------------------------------------------------------------------- */

function rankingAgreement(baseRanked, probeRanked) {
  if (baseRanked.length === 0 || probeRanked.length === 0) return 0;
  const length = Math.min(baseRanked.length, probeRanked.length);
  let agree = 0;
  for (let index = 0; index < length; index += 1) {
    if (baseRanked[index] === probeRanked[index]) agree += 1;
  }
  return Math.round((agree * MICRO) / length);
}

function setAgreement(baseSet, probeSet) {
  if (baseSet.length === 0) return 0;
  const probe = new Set(probeSet);
  const shared = baseSet.filter((item) => probe.has(item)).length;
  return Math.round((shared * MICRO) / baseSet.length);
}

/** Population standard deviation of integers, returned in the same units. */
function deviation(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.round(Math.sqrt(variance));
}

/**
 * Run the full perturbation battery for one case and derive the stability signals.
 *
 * Returns integers in micro-units throughout, so the whole thing is exactly
 * replayable and platform-independent, matching the inherited convention.
 */
export function measureStage2L15Stability(world, legalActions, base) {
  const baseAction = base.recommendedActionId;
  const baseRanked = base.ranked;
  const baseTop2 = baseRanked.slice(0, 2);
  const baseDecomposition = base.decomposition;

  const probes = [];
  for (const family of STAGE2L15_PERTURBATION_FAMILIES) {
    const probeCount = family.semanticNoOp === true ? 1 : STAGE2L15_PROBES_PER_FAMILY;
    for (let probe = 0; probe < probeCount; probe += 1) {
      const perturbed = perturbStage2L15World(world, family.id, probe);
      const result = evaluateValueAwareNexus(perturbed, legalActions, { inheritedSignals: false });
      probes.push({ family: family.id, probe, semanticNoOp: family.semanticNoOp === true, result });
    }
  }

  const semanticProbes = probes.filter((entry) => !entry.semanticNoOp);
  const orderingProbes = probes.filter((entry) => entry.semanticNoOp);

  const topHeld = semanticProbes.filter((entry) => entry.result.recommendedActionId === baseAction).length;
  const top2Held = semanticProbes.filter((entry) => setAgreement(baseTop2, entry.result.ranked.slice(0, 2)) === MICRO).length;
  const rankingScores = semanticProbes.map((entry) => rankingAgreement(baseRanked, entry.result.ranked));
  const utilities = semanticProbes.map((entry) => entry.result.signals.nexusTopUtility);
  const margins = semanticProbes.map((entry) => entry.result.signals.nexusUtilityMargin);

  /* Rationale stability: does the expert justify the pick the same way? Compared
   * component by component on sign and on which relations carried the decision,
   * not on exact magnitudes, which necessarily move when the inputs move. */
  const rationaleHeld = semanticProbes.filter((entry) => {
    const probeTop = entry.result.decomposition;
    if (baseDecomposition === null || probeTop === null) return false;
    return probeTop.actionId === baseDecomposition.actionId
      && Math.sign(probeTop.relationalBenefit) === Math.sign(baseDecomposition.relationalBenefit)
      && Math.sign(probeTop.riskAdjustment) === Math.sign(baseDecomposition.riskAdjustment)
      && probeTop.remainingBlockerCount === baseDecomposition.remainingBlockerCount
      && probeTop.objectiveSupportCount === baseDecomposition.objectiveSupportCount;
  }).length;

  const relationSupportHeld = semanticProbes.filter((entry) => {
    const probeTop = entry.result.decomposition;
    if (baseDecomposition === null || probeTop === null) return false;
    return probeTop.contradictionCount === baseDecomposition.contradictionCount
      && probeTop.objectiveSupportCount === baseDecomposition.objectiveSupportCount;
  }).length;

  const orderingHeld = orderingProbes.every((entry) => entry.result.recommendedActionId === baseAction);
  const abstentionHeld = semanticProbes.filter((entry) => entry.result.abstained === base.abstained).length;

  const total = semanticProbes.length;
  const topUtility = base.signals.nexusTopUtility;

  return {
    stabilitySchema: 'NEXUS_DECISION_STABILITY_V1',
    perturbationModelId: STAGE2L15_PERTURBATION_MODEL_ID,
    probeCount: probes.length,
    semanticProbeCount: total,
    nexusTopActionStability: Math.round((topHeld * MICRO) / total),
    nexusTop2Stability: Math.round((top2Held * MICRO) / total),
    nexusRankingStability: Math.round(rankingScores.reduce((sum, value) => sum + value, 0) / total),
    /* Variance is scale-dependent, so it is normalised by the base top utility.
     * An unnormalised deviation would mostly measure how large the world is. */
    nexusUtilityVariance: topUtility === 0 ? MICRO : Math.min(MICRO, Math.round((deviation(utilities) * MICRO) / Math.abs(topUtility))),
    nexusMarginVariance: topUtility === 0 ? MICRO : Math.min(MICRO, Math.round((deviation(margins) * MICRO) / Math.abs(topUtility))),
    nexusSemanticStability: Math.round((rationaleHeld * MICRO) / total),
    nexusRelationSupportStability: Math.round((relationSupportHeld * MICRO) / total),
    nexusCounterfactualAgreement: Math.round(((topHeld + top2Held + rationaleHeld) * MICRO) / (3 * total)),
    nexusAbstentionStability: Math.round((abstentionHeld * MICRO) / total),
    nexusOrderingInvariant: orderingHeld,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 5 — the three disjoint splits, with the inherited eligibility gate.
 *
 * Structural eligibility is Stage 2L.14's, unchanged: the expert must not have
 * abstained, its semantics must be complete, its own cost-perturbation flag must
 * hold, and it must report no remaining blocker and no contradiction. A bucket in
 * which the expert disclaims its own basis never delegates, however it measures.
 * ------------------------------------------------------------------------- */

export function stage2L15StructurallyEligible(signals) {
  if (signals === null || signals === undefined) return false;
  if (signals.kind !== 'NEXUS_RELATIONAL_UTILITY_V1') return false;
  return signals.abstained !== true
    && signals.semanticFieldsIncompleteCount === 0
    && signals.semanticCoverage === MICRO
    && signals.perturbationStable === true
    && signals.remainingBlockerCount === 0
    && signals.contradictionCount === 0;
}

export function buildStage2L15Split(name) {
  const range = STAGE2L15_SPLITS[name];
  if (range === undefined) throw new Error(`STAGE2L15_UNKNOWN_SPLIT:${name}`);
  const rows = [];
  for (let variant = range.from; variant < range.to; variant += 1) {
    const record = buildStage2L12Case(range.split, variant);
    if (!record.decidable) continue;
    rows.push(record);
  }
  return rows;
}

/**
 * Score one split: run the FROZEN Stage 2L.13 expert, measure stability, and
 * record the outcome. Ground truth is read ONLY to label the row for evaluation;
 * it never reaches a signal.
 */
export function runStage2L15Split(name) {
  return buildStage2L15Split(name).map((record) => {
    const base = evaluateValueAwareNexus(record.world, record.legalActions, { inheritedSignals: false });
    const stability = measureStage2L15Stability(record.world, record.legalActions, base);
    const optimal = record.groundTruth.optimalActionId;
    /* Prime's pick comes from the INHERITED certified path (Stage 2L.12's
     * primeRecommendation), not from any convenience ordering. Using anything
     * else would understate Prime and inflate the apparent value of delegating. */
    const primeAction = primeRecommendation(record).recommendedActionId;
    return {
      splitName: name,
      signals: base.signals,
      stability,
      structurallyEligible: stage2L15StructurallyEligible(base.signals),
      nexusCorrect: base.recommendedActionId === optimal,
      primeCorrect: primeAction === optimal,
      movesPrime: base.recommendedActionId !== null && base.recommendedActionId !== primeAction,
      abstained: base.abstained,
      family: record.family,
      profile: record.profile,
    };
  });
}

export function stage2L15SplitDigest(rows) {
  return sha256(rows.map((row) => [
    row.splitName, row.nexusCorrect ? 1 : 0, row.primeCorrect ? 1 : 0, row.movesPrime ? 1 : 0,
    row.signals.nexusTopRiskAdjustment, row.signals.nexusUtilityMargin,
    row.stability.nexusMarginVariance, row.stability.nexusTopActionStability,
  ]));
}

/* ---------------------------------------------------------------------------
 * PHASE 3/7 — discrimination measurement.
 *
 * AUROC is used for the incremental-information test because it is rank based
 * and, unlike a precision gap between a region and its complement, cannot be
 * inflated by a region that selects 98% of the corpus and leaves a tiny, terrible
 * remainder. Both are reported; the AUROC is the one the verdict rests on.
 * ------------------------------------------------------------------------- */

export function auroc(rows, score) {
  const values = rows.map((row) => ({ value: score(row), positive: row.nexusCorrect }))
    .sort((left, right) => left.value - right.value);
  const positives = values.filter((entry) => entry.positive).length;
  const negatives = values.length - positives;
  if (positives === 0 || negatives === 0) return 0.5;
  let rank = 1;
  let index = 0;
  let positiveRankSum = 0;
  while (index < values.length) {
    let last = index;
    while (last + 1 < values.length && values[last + 1].value === values[index].value) last += 1;
    const average = (rank + (rank + (last - index))) / 2;
    for (let cursor = index; cursor <= last; cursor += 1) {
      if (values[cursor].positive) positiveRankSum += average;
    }
    rank += last - index + 1;
    index = last + 1;
  }
  return round((positiveRankSum - (positives * (positives + 1)) / 2) / (positives * negatives));
}

/** Normalised rank of a score within a row set, used only to combine two signals
 *  into one measurable ordering for the incremental test. Not a delegation rule. */
function normalisedRanks(rows, score) {
  const ordered = rows.map((row, index) => ({ index, value: score(row) }))
    .sort((left, right) => left.value - right.value);
  const ranks = new Array(rows.length);
  ordered.forEach((entry, position) => { ranks[entry.index] = position / Math.max(1, rows.length - 1); });
  return ranks;
}

export const STAGE2L15_STABILITY_SIGNALS = deepFreeze([
  ['nexusTopActionStability', true], ['nexusTop2Stability', true], ['nexusRankingStability', true],
  ['nexusUtilityVariance', false], ['nexusMarginVariance', false], ['nexusSemanticStability', true],
  ['nexusRelationSupportStability', true], ['nexusCounterfactualAgreement', true], ['nexusAbstentionStability', true],
]);

export const STAGE2L15_SIGNAL_INVENTORY = deepFreeze(STAGE2L15_STABILITY_SIGNALS.map(([signal, higherIsBetter]) => ({
  signal,
  source: 'STAGE2L15_ADDITIVE',
  higherIsBetter,
  deterministic: true,
  decisionTimeAvailable: true,
  expertEmitted: false,
  derivedFromExpertOutputsOnly: true,
  readsGroundTruth: false,
  potentialLeakage: false,
})));

/** Fields a stability measurement is forbidden to contain. Scanned, not asserted. */
export const STAGE2L15_FORBIDDEN_FIELDS = deepFreeze([
  'optimalAction', 'optimalActionId', 'optimalActionUtility', 'groundTruth', 'expertCorrect',
  'nexusCorrect', 'primeCorrect', 'utilityMargin', 'scored', 'family', 'profile', 'objectiveType',
  'worldId', 'variant', 'split', 'caseId',
]);

export function measureStage2L15IncrementalInformation(developmentRows, calibrationRows) {
  const devEligible = developmentRows.filter((row) => row.structurallyEligible);
  const calEligible = calibrationRows.filter((row) => row.structurallyEligible);

  /* Best single signal of each class chosen on DEVELOPMENT, then measured on
   * CALIBRATION. Choosing on the split that also scores would be the exact error
   * Stage 2L.14 exists to prevent. */
  const existingCandidates = [
    ['nexusTopRiskAdjustment', (row) => row.signals.nexusTopRiskAdjustment],
    ['nexusUtilityMargin', (row) => row.signals.nexusUtilityMargin],
  ];
  const stabilityCandidates = STAGE2L15_STABILITY_SIGNALS.map(([signal, higherIsBetter]) => [
    signal,
    (row) => (higherIsBetter ? row.stability[signal] : -row.stability[signal]),
  ]);

  const pickBest = (candidates) => candidates
    .map(([name, score]) => ({ name, score, development: auroc(devEligible, score) }))
    .sort((left, right) => right.development - left.development)[0];

  const bestExisting = pickBest(existingCandidates);
  const bestStability = pickBest(stabilityCandidates);

  const existingRanks = normalisedRanks(calEligible, bestExisting.score);
  const stabilityRanks = normalisedRanks(calEligible, bestStability.score);
  const combinedRows = calEligible.map((row, index) => ({ ...row, combined: (existingRanks[index] + stabilityRanks[index]) / 2 }));

  const existingDiscrimination = auroc(calEligible, bestExisting.score);
  const stabilityDiscrimination = auroc(calEligible, bestStability.score);
  const combinedDiscrimination = auroc(combinedRows, (row) => row.combined);

  return deepFreeze({
    method: 'AUROC_ON_CALIBRATION_WITH_SIGNAL_CHOSEN_ON_DEVELOPMENT',
    bestExistingSignal: bestExisting.name,
    bestStabilitySignal: bestStability.name,
    existingConfidenceDiscrimination: existingDiscrimination,
    stabilityOnlyDiscrimination: stabilityDiscrimination,
    combinedDiscrimination,
    incrementalOverExisting: round(combinedDiscrimination - existingDiscrimination),
    perSignalCalibrationAuroc: Object.fromEntries(stabilityCandidates.map(([name, score]) => [name, auroc(calEligible, score)])),
    /* An improvement in ordering is necessary for the signal to be worth
     * anything, but it is not sufficient for delegation: what matters is whether
     * it lifts a SUPPORTED region over the floor, which Phase 8 decides. */
    stabilityAddsInformation: round(combinedDiscrimination - existingDiscrimination) > 0,
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 6 — the predeclared rule ladder.
 *
 * Every threshold below was fixed before any rule was scored. The existing rungs
 * are Stage 2L.14's, byte for byte. The stability rungs were chosen from the
 * DEVELOPMENT distribution alone. Conjunctions are capped at three signals and
 * every rule is a readable inequality: no fitted classifier, no learned weights,
 * nothing that cannot be audited by reading it.
 * ------------------------------------------------------------------------- */

export const STAGE2L15_RISK_LADDER = deepFreeze([400000, 500000, 600000, 700000, 800000]);
export const STAGE2L15_MARGIN_LADDER = deepFreeze([0, 100000, 200000, 300000, 400000]);
export const STAGE2L15_VARIANCE_LADDER = deepFreeze([10000, 20000, 30000, 50000, 100000]);
export const STAGE2L15_STABILITY_LADDER = deepFreeze([857143, 928571, 1000000]);
export const STAGE2L15_MAX_CONJUNCTION_WIDTH = 3;

/**
 * The full predeclared rule set. Each entry carries its class so the incremental
 * question — does adding stability change what is reachable? — can be answered by
 * comparing the best rule of each class rather than by assertion.
 */
export function buildStage2L15RuleSet() {
  const rules = [];
  const push = (id, cls, width, test) => rules.push({ id, cls, width, test });
  for (const risk of STAGE2L15_RISK_LADDER) {
    for (const margin of STAGE2L15_MARGIN_LADDER) {
      push(`risk>=${risk} & margin>=${margin}`, 'EXISTING', 2,
        (row) => row.signals.nexusTopRiskAdjustment >= risk && row.signals.nexusUtilityMargin >= margin);
      for (const variance of STAGE2L15_VARIANCE_LADDER) {
        push(`risk>=${risk} & margin>=${margin} & marginVariance<=${variance}`, 'COMBINED', 3,
          (row) => row.signals.nexusTopRiskAdjustment >= risk
            && row.signals.nexusUtilityMargin >= margin
            && row.stability.nexusMarginVariance <= variance);
      }
      for (const stability of STAGE2L15_STABILITY_LADDER) {
        for (const signal of ['nexusTopActionStability', 'nexusSemanticStability', 'nexusCounterfactualAgreement']) {
          push(`risk>=${risk} & margin>=${margin} & ${signal}>=${stability}`, 'COMBINED', 3,
            (row) => row.signals.nexusTopRiskAdjustment >= risk
              && row.signals.nexusUtilityMargin >= margin
              && row.stability[signal] >= stability);
        }
      }
    }
  }
  for (const variance of STAGE2L15_VARIANCE_LADDER) {
    push(`marginVariance<=${variance}`, 'STABILITY', 1, (row) => row.stability.nexusMarginVariance <= variance);
    push(`utilityVariance<=${variance}`, 'STABILITY', 1, (row) => row.stability.nexusUtilityVariance <= variance);
  }
  for (const stability of STAGE2L15_STABILITY_LADDER) {
    for (const [signal] of STAGE2L15_STABILITY_SIGNALS.filter(([, higher]) => higher)) {
      push(`${signal}>=${stability}`, 'STABILITY', 1, (row) => row.stability[signal] >= stability);
    }
  }
  return rules;
}

export function scoreStage2L15Rule(rows, test) {
  const inside = rows.filter((row) => row.structurallyEligible && test(row));
  const outside = rows.filter((row) => row.structurallyEligible && !test(row));
  const correct = inside.filter((row) => row.nexusCorrect).length;
  const outsideCorrect = outside.filter((row) => row.nexusCorrect).length;
  return {
    n: inside.length,
    correct,
    wrong: inside.length - correct,
    precision: round(ratio(correct, inside.length)),
    wilsonLowerBound: wilsonLowerBound(correct, inside.length),
    complementPrecision: round(ratio(outsideCorrect, outside.length)),
    discriminationGap: round(ratio(correct, inside.length) - ratio(outsideCorrect, outside.length)),
    movesPrime: inside.filter((row) => row.movesPrime).length,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 8 — conservative reliability, and the guard this stage adds.
 *
 * THE INHERITED CRITERION, UNCHANGED. A region qualifies only if it clears the
 * 0.99 observed-precision floor on CALIBRATION, carries at least
 * STAGE2L15_MINIMUM_ELIGIBLE_CASE_COUNT cases, and clears the inherited Wilson
 * lower-bound requirement. Method, z and confidence level are Stage 2L.14's and
 * were fixed before any Stage 2L.15 number existed.
 *
 * THE ADDITIONAL GUARD, AND WHY IT IS HERE. Stage 2L.14 searched 25 cells. This
 * stage searches 398 rules — sixteen times the multiplicity — because adding a
 * signal family multiplies the grid. At n = 111 and a TRUE rate of 0.98, a single
 * region has a 34.7% chance of MEASURING at or above 0.99. Across a rule set this
 * size, at least one such region appearing by chance is not a possibility, it is
 * the expectation. The inherited Wilson requirement was calibrated against a
 * 25-cell search and does not price that in.
 *
 * The guard is therefore: a candidate must also not be CONTRADICTED by the
 * DEVELOPMENT split, where contradicted means its DEVELOPMENT precision falls
 * below the same conservative bound requirement the region must clear elsewhere.
 * A genuine >=0.99 region shows up as strong on every draw it is measured on. A
 * multiplicity artefact shows up on one.
 *
 * DISCLOSURE OF TIMING, AND OF THE GUARD'S ACTUAL EFFECT. This guard was written
 * after observing that exactly one rule cleared the inherited criterion on
 * CALIBRATION while scoring 0.9524 on DEVELOPMENT. That ordering is disclosed
 * rather than hidden, and it is admissible for one reason only: the guard can
 * exclusively REFUSE delegations, never create one, so it cannot manufacture a
 * pass. Both views are reported in full — inheritedCriterionCandidates lists what
 * the inherited criterion alone would have selected — so either standard can be
 * applied by the reader.
 *
 * AS MEASURED, THIS GUARD WAS NOT LOAD BEARING. The one candidate scored 0.9524
 * on DEVELOPMENT, which is above the 0.95 conservative-bound requirement, so the
 * guard did NOT reject it; the rule was frozen and carried to the final holdout,
 * where it delivered a delegation precision of 0.9894 and failed the inherited
 * 0.99 reliability gate on its own. The Stage 2L.15 verdict therefore rests
 * entirely on inherited criteria. The guard remains declared for later stages,
 * where a larger search may need it.
 * ------------------------------------------------------------------------- */

export const STAGE2L15_CROSS_SPLIT_CONSISTENCY_REQUIRED = true;

export function deriveStage2L15Calibration(developmentRows, calibrationRows) {
  for (const row of calibrationRows) {
    if (row.splitName !== 'CALIBRATION') throw new Error('STAGE2L15_CALIBRATION_SPLIT_VIOLATION');
  }
  for (const row of developmentRows) {
    if (row.splitName !== 'DEVELOPMENT') throw new Error('STAGE2L15_DEVELOPMENT_SPLIT_VIOLATION');
  }

  const rules = buildStage2L15RuleSet();
  const sweep = rules.map((rule) => {
    const calibration = scoreStage2L15Rule(calibrationRows, rule.test);
    const development = scoreStage2L15Rule(developmentRows, rule.test);
    const meetsInherited = calibration.n >= STAGE2L15_MINIMUM_ELIGIBLE_CASE_COUNT
      && calibration.precision >= STAGE2L15_RELIABILITY_FLOOR
      && calibration.wilsonLowerBound >= STAGE2L15_CONSERVATIVE_BOUND_REQUIREMENT;
    const developmentContradicts = development.n > 0
      && development.precision < STAGE2L15_CONSERVATIVE_BOUND_REQUIREMENT;
    return {
      id: rule.id,
      cls: rule.cls,
      width: rule.width,
      calibration,
      development,
      meetsInheritedCriterion: meetsInherited,
      developmentContradicts,
      qualifies: meetsInherited && !(STAGE2L15_CROSS_SPLIT_CONSISTENCY_REQUIRED && developmentContradicts),
    };
  });

  const qualifying = sweep.filter((entry) => entry.qualifies);
  const inheritedOnly = sweep.filter((entry) => entry.meetsInheritedCriterion);
  /* Among qualifying rules prefer the largest support, not the highest point
   * estimate: at these sample sizes the highest point estimate is the one most
   * likely to be noise. */
  const selected = qualifying.slice().sort((left, right) =>
    right.calibration.n - left.calibration.n || left.id.localeCompare(right.id))[0] ?? null;

  const supported = sweep.filter((entry) => entry.calibration.n >= STAGE2L15_MINIMUM_ELIGIBLE_CASE_COUNT);
  const ceiling = supported.slice().sort((left, right) =>
    right.calibration.precision - left.calibration.precision || right.calibration.n - left.calibration.n)[0] ?? null;

  const body = {
    confidenceModel: 'STAGE2L15_STABILITY_AUGMENTED_CONFIDENCE_V1',
    calibrationVersion: 1,
    ruleCount: rules.length,
    reliabilityFloor: STAGE2L15_RELIABILITY_FLOOR,
    boundMethod: STAGE2L15_BOUND_METHOD,
    boundZ: STAGE2L15_BOUND_Z,
    boundConfidenceLevel: STAGE2L15_BOUND_CONFIDENCE_LEVEL,
    conservativeBoundRequirement: STAGE2L15_CONSERVATIVE_BOUND_REQUIREMENT,
    minimumEligibleCaseCount: STAGE2L15_MINIMUM_ELIGIBLE_CASE_COUNT,
    crossSplitConsistencyRequired: STAGE2L15_CROSS_SPLIT_CONSISTENCY_REQUIRED,
    ladders: {
      risk: [...STAGE2L15_RISK_LADDER],
      margin: [...STAGE2L15_MARGIN_LADDER],
      variance: [...STAGE2L15_VARIANCE_LADDER],
      stability: [...STAGE2L15_STABILITY_LADDER],
      maxConjunctionWidth: STAGE2L15_MAX_CONJUNCTION_WIDTH,
    },
    sweep,
    qualifyingRuleCount: qualifying.length,
    meetsInheritedCriterionCount: inheritedOnly.length,
    /* Reported in full: what the inherited criterion alone would have selected,
     * and why the cross-split guard rejected it. Nothing is hidden by the guard. */
    inheritedCriterionCandidates: inheritedOnly.map((entry) => ({
      id: entry.id,
      cls: entry.cls,
      calibration: entry.calibration,
      development: entry.development,
      rejectedByCrossSplitGuard: entry.developmentContradicts,
    })),
    selected: selected === null ? null : { id: selected.id, cls: selected.cls, calibration: selected.calibration, development: selected.development },
    delegatingRuleId: selected === null ? null : selected.id,
    ceiling: ceiling === null ? null : { id: ceiling.id, cls: ceiling.cls, calibration: ceiling.calibration, development: ceiling.development },
  };
  return deepFreeze({ ...body, calibrationDigest: sha256(body) });
}

/* ---------------------------------------------------------------------------
 * PHASE 9 — delegation on a frozen rule, scored once on FINAL_HOLDOUT.
 *
 * Delegation requires the frozen rule to hold AND the recommendation to actually
 * move Prime. Everything else keeps Prime. An unresolvable or unseen row abstains.
 * ------------------------------------------------------------------------- */

/**
 * Is this stability evidence usable at all? Schema, producing model and numeric
 * domain are all checked before any threshold is applied. Evidence from an
 * unrecognised schema, from a superseded perturbation model, or carrying values
 * outside the declared 0..MICRO range is not weak evidence — it is not evidence,
 * and it must abstain rather than be compared against a threshold.
 */
export function stage2L15StabilityEvidenceUsable(stability) {
  if (stability === null || stability === undefined) return false;
  if (stability.stabilitySchema !== 'NEXUS_DECISION_STABILITY_V1') return false;
  if (stability.perturbationModelId !== STAGE2L15_PERTURBATION_MODEL_ID) return false;
  for (const [signal] of STAGE2L15_STABILITY_SIGNALS) {
    const value = stability[signal];
    if (!Number.isInteger(value) || value < 0 || value > MICRO) return false;
  }
  return true;
}

export function evaluateStage2L15Delegation(rows, calibration, ruleTest, { expectedSplit = 'FINAL_HOLDOUT' } = {}) {
  for (const row of rows) {
    if (row.splitName !== expectedSplit) throw new Error('STAGE2L15_HOLDOUT_SPLIT_VIOLATION');
  }
  const delegates = (row) => calibration.delegatingRuleId !== null
    && row.structurallyEligible
    && stage2L15StabilityEvidenceUsable(row.stability)
    && ruleTest !== null
    && ruleTest(row)
    && row.movesPrime;

  const gated = rows.map((row) => ({ ...row, delegated: delegates(row) }));
  const total = gated.length;
  const delegations = gated.filter((row) => row.delegated);
  const beneficial = delegations.filter((row) => row.nexusCorrect && !row.primeCorrect).length;
  const harmful = delegations.filter((row) => !row.nexusCorrect && row.primeCorrect).length;
  const delegatedCorrect = delegations.filter((row) => row.nexusCorrect).length;
  const arbiterCorrect = gated.filter((row) => (row.delegated ? row.nexusCorrect : row.primeCorrect)).length;
  const primeCorrect = gated.filter((row) => row.primeCorrect).length;
  const beneficialOpportunities = gated.filter((row) => row.movesPrime && row.nexusCorrect && !row.primeCorrect);
  const harmfulOpportunities = gated.filter((row) => row.movesPrime && !row.nexusCorrect && row.primeCorrect);

  return deepFreeze({
    casesEvaluated: total,
    calibrationDigest: calibration.calibrationDigest,
    delegatingRuleId: calibration.delegatingRuleId,
    structurallyEligibleRecommendations: gated.filter((row) => row.structurallyEligible).length,
    structurallyEligibleMovingPrime: gated.filter((row) => row.structurallyEligible && row.movesPrime).length,
    nexusDelegations: delegations.length,
    nexusDelegationRate: round(ratio(delegations.length, total)),
    nexusDelegationPrecision: round(ratio(beneficial, delegations.length)),
    nexusDelegationLowerBound: wilsonLowerBound(beneficial, delegations.length),
    delegatedReliability: round(ratio(delegatedCorrect, delegations.length)),
    delegatedReliabilityLowerBound: wilsonLowerBound(delegatedCorrect, delegations.length),
    beneficialChanges: beneficial,
    harmfulChanges: harmful,
    harmfulChangeRate: round(ratio(harmful, total)),
    correctPrimeBreaks: harmful,
    correctPrimeBreakRate: round(ratio(harmful, total)),
    primeOnlyAccuracy: round(ratio(primeCorrect, total)),
    nexusOnlyAccuracy: round(ratio(gated.filter((row) => row.nexusCorrect).length, total)),
    arbiterAccuracy: round(ratio(arbiterCorrect, total)),
    accuracyUpliftOverPrimePp: round((ratio(arbiterCorrect, total) - ratio(primeCorrect, total)) * 100),
    beneficialOpportunities: beneficialOpportunities.length,
    beneficialOpportunitiesCaptured: beneficialOpportunities.filter((row) => row.delegated).length,
    harmfulOpportunities: harmfulOpportunities.length,
    harmfulOpportunitiesRejected: harmfulOpportunities.filter((row) => !row.delegated).length,
    harmfulOpportunityRejectionRate: round(ratio(harmfulOpportunities.filter((row) => !row.delegated).length, harmfulOpportunities.length)),
    harmCeilingRespected: round(ratio(harmful, total)) <= STAGE2L15_MAX_HARMFUL_CHANGE_RATE,
    correctPrimeBreakCeilingRespected: round(ratio(harmful, total)) <= STAGE2L15_MAX_CORRECT_PRIME_BREAK_RATE,
    reliabilityFloorLowered: false,
    delegationForced: false,
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 11 — adversarial stability tests.
 *
 * Every malformed, unseen, illegal or unsupported case must abstain. The two
 * cases the brief names specifically — stable-but-wrong and unstable-but-correct
 * — are measured on real corpus rows rather than synthesised, because their whole
 * point is whether they occur in practice.
 * ------------------------------------------------------------------------- */

export const STAGE2L15_ADVERSARIAL_CASES = deepFreeze([
  'MALFORMED_PERTURBATION', 'UNKNOWN_PERTURBATION_FAMILY', 'MISSING_SEMANTICS',
  'UNKNOWN_STABILITY_SCHEMA', 'STALE_STABILITY_EVIDENCE', 'CROSS_RUNTIME_STABILITY_EVIDENCE',
  'ABSTAINED_EXPERT', 'OBSTRUCTED_BY_BLOCKERS', 'CONTRADICTED', 'UNSTABLE_EXPERT',
  'EXACT_THRESHOLD_EQUALITY', 'JUST_BELOW_THRESHOLD', 'JUST_ABOVE_THRESHOLD',
  'ILLEGAL_PERTURBED_STATE', 'HIGH_CONFIDENCE_UNSTABLE',
]);

export function runStage2L15AdversarialSuite(calibration, ruleTest) {
  const cleanSignals = (overrides = {}) => ({
    kind: 'NEXUS_RELATIONAL_UTILITY_V1', signalVersion: 1, abstained: false,
    semanticCoverage: MICRO, semanticFieldsIncompleteCount: 0, perturbationStable: true,
    remainingBlockerCount: 0, contradictionCount: 0,
    nexusTopRiskAdjustment: 900000, nexusUtilityMargin: 900000, ...overrides,
  });
  const cleanStability = (overrides = {}) => ({
    stabilitySchema: 'NEXUS_DECISION_STABILITY_V1', perturbationModelId: STAGE2L15_PERTURBATION_MODEL_ID,
    nexusTopActionStability: MICRO, nexusTop2Stability: MICRO, nexusRankingStability: MICRO,
    nexusUtilityVariance: 0, nexusMarginVariance: 0, nexusSemanticStability: MICRO,
    nexusRelationSupportStability: MICRO, nexusCounterfactualAgreement: MICRO,
    nexusAbstentionStability: MICRO, nexusOrderingInvariant: true, ...overrides,
  });

  const probe = (signals, stability) => {
    const row = { splitName: 'FINAL_HOLDOUT', signals, stability, movesPrime: true, nexusCorrect: true, primeCorrect: false };
    row.structurallyEligible = stage2L15StructurallyEligible(signals);
    let delegates = false;
    try {
      delegates = calibration.delegatingRuleId !== null && row.structurallyEligible
        && stage2L15StabilityEvidenceUsable(row.stability)
        && ruleTest !== null && ruleTest(row) && row.movesPrime;
    } catch { delegates = false; }
    return { delegates: delegates === true, structurallyEligible: row.structurallyEligible };
  };

  let unknownFamilyRejected = false;
  try { perturbStage2L15World({ entities: [], relations: [] }, 'NOT_A_FAMILY', 0); }
  catch (error) { unknownFamilyRejected = /STAGE2L15_UNKNOWN_PERTURBATION_FAMILY/.test(error.message); }

  const results = {
    MALFORMED_PERTURBATION: probe(cleanSignals(), cleanStability({ nexusMarginVariance: Number.NaN, nexusTopActionStability: Number.NaN })),
    UNKNOWN_PERTURBATION_FAMILY: { delegates: !unknownFamilyRejected, structurallyEligible: false },
    MISSING_SEMANTICS: probe(cleanSignals({ semanticCoverage: 500000, semanticFieldsIncompleteCount: 3 }), cleanStability()),
    UNKNOWN_STABILITY_SCHEMA: probe(cleanSignals(), cleanStability({ stabilitySchema: 'SOMETHING_ELSE_V9' })),
    STALE_STABILITY_EVIDENCE: probe(cleanSignals(), cleanStability({ perturbationModelId: 'STAGE2L14_ROBUSTNESS_V1' })),
    CROSS_RUNTIME_STABILITY_EVIDENCE: probe(cleanSignals({ kind: 'NEXUS_RELATIONAL_UTILITY_V0_OTHER_RUNTIME' }), cleanStability()),
    ABSTAINED_EXPERT: probe(cleanSignals({ abstained: true }), cleanStability()),
    OBSTRUCTED_BY_BLOCKERS: probe(cleanSignals({ remainingBlockerCount: 2 }), cleanStability()),
    CONTRADICTED: probe(cleanSignals({ contradictionCount: 1 }), cleanStability()),
    UNSTABLE_EXPERT: probe(cleanSignals({ perturbationStable: false }), cleanStability()),
    EXACT_THRESHOLD_EQUALITY: probe(cleanSignals({ nexusTopRiskAdjustment: 400000, nexusUtilityMargin: 100000 }), cleanStability({ nexusMarginVariance: 20000 })),
    JUST_BELOW_THRESHOLD: probe(cleanSignals({ nexusTopRiskAdjustment: 399999, nexusUtilityMargin: 100000 }), cleanStability({ nexusMarginVariance: 20000 })),
    JUST_ABOVE_THRESHOLD: probe(cleanSignals({ nexusTopRiskAdjustment: 400001, nexusUtilityMargin: 100001 }), cleanStability({ nexusMarginVariance: 19999 })),
    ILLEGAL_PERTURBED_STATE: probe(cleanSignals(), cleanStability({ nexusMarginVariance: -1, nexusTopActionStability: MICRO * 10 })),
    HIGH_CONFIDENCE_UNSTABLE: probe(cleanSignals(), cleanStability({ nexusMarginVariance: MICRO, nexusTopActionStability: 0, nexusCounterfactualAgreement: 0 })),
  };

  /* Every probe must abstain EXCEPT the two that describe a legitimately
   * qualifying case: a row exactly at the frozen thresholds and one just inside
   * them. Those exist to prove the gate is not simply refusing everything. Where
   * no rule was frozen the whole suite abstains trivially, so each entry records
   * that its pass is vacuous rather than presenting it as meaningful evidence. */
  const legitimatelyDelegating = ['EXACT_THRESHOLD_EQUALITY', 'JUST_ABOVE_THRESHOLD'];
  return deepFreeze(Object.fromEntries(Object.entries(results).map(([name, result]) => {
    const expectedToAbstain = !legitimatelyDelegating.includes(name);
    return [name, {
      ...result,
      expectedToAbstain,
      failsClosed: expectedToAbstain ? result.delegates === false : true,
      vacuous: calibration.delegatingRuleId === null,
    }];
  })));
}

/* ---------------------------------------------------------------------------
 * PHASE 10 — confidence-ceiling characterisation.
 *
 * When no region qualifies, the stage owes an estimate rather than a bare FAIL:
 * how high does supported reliability actually go, and what is holding it there?
 * ------------------------------------------------------------------------- */

export const STAGE2L15_CEILING_LIMITATION_CLASSES = deepFreeze([
  'RESIDUAL_EXPERT_ERROR', 'CONFIDENCE_SIGNAL_LIMITATION', 'SAMPLE_SUPPORT_LIMITATION',
  'NON_STATIONARY_BUCKET', 'OTHER',
]);

/** Probability that a region whose TRUE rate is p0 measures at or above the floor
 *  on n draws. Used to price the multiplicity of the rule search, not to gate. */
export function falseDiscoveryProbability(n, trueRate, floor) {
  if (n <= 0) return 0;
  const needed = Math.ceil(floor * n);
  const logFactorial = [0];
  for (let index = 1; index <= n; index += 1) logFactorial[index] = logFactorial[index - 1] + Math.log(index);
  let total = 0;
  for (let k = needed; k <= n; k += 1) {
    total += Math.exp(logFactorial[n] - logFactorial[k] - logFactorial[n - k]
      + (k * Math.log(trueRate)) + ((n - k) * Math.log(1 - trueRate)));
  }
  return round(Math.min(1, total));
}

export function characteriseStage2L15Ceiling(calibration, holdoutRows, developmentRows) {
  const ceiling = calibration.ceiling;
  const rules = buildStage2L15RuleSet();
  const ceilingRule = ceiling === null ? null : rules.find((rule) => rule.id === ceiling.id) ?? null;
  const holdoutAtCeiling = ceilingRule === null ? null : scoreStage2L15Rule(holdoutRows, ceilingRule.test);

  /* How often does a region of this size measure at or above the floor purely by
   * chance, if its true rate is the measured ceiling? Multiplied by the size of
   * the rule set, this is what a single qualifying rule has to be weighed against. */
  const supportN = ceiling === null ? 0 : ceiling.calibration.n;
  const observedCeiling = ceiling === null ? 0 : ceiling.calibration.precision;
  const multiplicity = {
    ruleSetSize: calibration.ruleCount,
    representativeSupport: supportN,
    perRuleFalseDiscoveryAt0975: falseDiscoveryProbability(supportN, 0.975, STAGE2L15_RELIABILITY_FLOOR),
    perRuleFalseDiscoveryAt098: falseDiscoveryProbability(supportN, 0.98, STAGE2L15_RELIABILITY_FLOOR),
    perRuleFalseDiscoveryAt0985: falseDiscoveryProbability(supportN, 0.985, STAGE2L15_RELIABILITY_FLOOR),
    note: 'Rules in this set are heavily correlated, so multiplying by the rule count overstates the expected hit count. The order of magnitude is what matters: at these sample sizes a region measuring above the floor by chance is expected, not surprising.',
  };

  /* Where does the remaining error live? If the high-confidence region's errors
   * are indistinguishable from its successes on every stability signal, the
   * limitation is the expert's residual error, not the confidence machinery. */
  const highConfidence = developmentRows.filter((row) => row.structurallyEligible
    && row.signals.nexusTopRiskAdjustment >= 500000 && row.signals.nexusUtilityMargin >= 200000);
  const hcCorrect = highConfidence.filter((row) => row.nexusCorrect);
  const hcWrong = highConfidence.filter((row) => !row.nexusCorrect);
  const meanOf = (rows, key) => (rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.stability[key], 0) / rows.length));
  const highConfidenceSeparation = {
    n: highConfidence.length,
    wrong: hcWrong.length,
    marginVarianceCorrect: meanOf(hcCorrect, 'nexusMarginVariance'),
    marginVarianceWrong: meanOf(hcWrong, 'nexusMarginVariance'),
    topActionStabilityCorrect: meanOf(hcCorrect, 'nexusTopActionStability'),
    topActionStabilityWrong: meanOf(hcWrong, 'nexusTopActionStability'),
    separates: meanOf(hcWrong, 'nexusMarginVariance') > meanOf(hcCorrect, 'nexusMarginVariance') * 1.25,
  };

  return deepFreeze({
    highestSupportedReliability: observedCeiling,
    supportAtHighestReliability: supportN,
    lowerBoundAtHighestReliability: ceiling === null ? 0 : ceiling.calibration.wilsonLowerBound,
    ruleAtHighestReliability: ceiling === null ? null : ceiling.id,
    developmentAtHighestReliability: ceiling === null ? null : ceiling.development.precision,
    holdoutAtHighestReliability: holdoutAtCeiling === null ? null : holdoutAtCeiling.precision,
    holdoutSupportAtHighestReliability: holdoutAtCeiling === null ? 0 : holdoutAtCeiling.n,
    /* The conservative estimate of the true ceiling is the lower bound, not the
     * point estimate: the point estimate is what the search maximised. */
    estimatedConfidenceCeiling: ceiling === null ? 0 : ceiling.calibration.wilsonLowerBound,
    multiplicity,
    highConfidenceSeparation,
    ceilingLimitationClass: highConfidenceSeparation.separates
      ? 'CONFIDENCE_SIGNAL_LIMITATION'
      : 'RESIDUAL_EXPERT_ERROR',
    ceilingLimitationReason: highConfidenceSeparation.separates
      ? 'Stability separates correct from incorrect inside the high-confidence region, so a better confidence rule may still exist.'
      : 'Inside the high-confidence region where delegation would occur, the errors are indistinguishable from the successes on every stability signal measured. The residual error is not accompanied by any observable instability, so no confidence rule built from these signals can exclude it.',
  });
}

/* ---------------------------------------------------------------------------
 * Perturbation-model validation.
 *
 * A perturbation that changes the underlying decision problem is not a stability
 * probe, it is a different question. This measures how often the benchmark's own
 * optimum survives the perturbation. It runs ONCE, over a bounded sample, purely
 * to validate the perturbation model — its output never reaches a signal, a rule
 * or a delegation decision, exactly as Stage 2L.12 validated its corpus before
 * any expert touched it.
 * ------------------------------------------------------------------------- */

export const STAGE2L15_VALIDATION_SAMPLE = 400;
export const STAGE2L15_MIN_PROBLEM_PRESERVATION = 0.95;

export function validateStage2L15PerturbationModel() {
  const records = buildStage2L15Split('DEVELOPMENT').slice(0, STAGE2L15_VALIDATION_SAMPLE);
  let preserved = 0;
  let checked = 0;
  let actionSetPreserved = 0;
  let objectivePreserved = 0;
  let graphPreserved = 0;
  for (const record of records) {
    for (const family of STAGE2L15_PERTURBATION_FAMILIES) {
      const probeCount = family.semanticNoOp === true ? 1 : STAGE2L15_PROBES_PER_FAMILY;
      for (let probe = 0; probe < probeCount; probe += 1) {
        const perturbed = perturbStage2L15World(record.world, family.id, probe);
        const truth = deriveGroundTruth(perturbed, record.legalActions);
        checked += 1;
        if (truth.optimalActionId === record.groundTruth.optimalActionId) preserved += 1;
        if (perturbed.entities.length === record.world.entities.length) actionSetPreserved += 1;
        const objectiveSame = perturbed.entities.every((entity) => {
          const original = record.world.entities.find((other) => other.entityId === entity.entityId);
          return original !== undefined && original.objectiveRelevant === entity.objectiveRelevant;
        });
        if (objectiveSame) objectivePreserved += 1;
        const graphSame = perturbed.relations.length === record.world.relations.length
          && perturbed.relations.every((relation) => {
            const original = record.world.relations.find((other) => other.relationId === relation.relationId);
            return original !== undefined && original.from === relation.from
              && original.to === relation.to && original.kind === relation.kind;
          });
        if (graphSame) graphPreserved += 1;
      }
    }
  }
  const preservationRate = round(ratio(preserved, checked));
  return deepFreeze({
    sampleCases: records.length,
    perturbationsChecked: checked,
    problemPreserved: preserved,
    problemPreservationRate: preservationRate,
    minimumRequired: STAGE2L15_MIN_PROBLEM_PRESERVATION,
    problemPreservationPass: preservationRate >= STAGE2L15_MIN_PROBLEM_PRESERVATION,
    actionSetPreservedRate: round(ratio(actionSetPreserved, checked)),
    objectiveIdentityPreservedRate: round(ratio(objectivePreserved, checked)),
    graphShapePreservedRate: round(ratio(graphPreserved, checked)),
    note: 'Ground truth is consulted here ONLY to validate that the perturbation preserves the decision problem. It reaches no signal, no rule and no delegation.',
  });
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 * ------------------------------------------------------------------------- */

export function buildStage2L15Evaluation() {
  const development = runStage2L15Split('DEVELOPMENT');
  const calibrationRows = runStage2L15Split('CALIBRATION');
  const holdout = runStage2L15Split('FINAL_HOLDOUT');

  const key = (row) => `${row.signals.nexusTopRiskAdjustment}:${row.signals.nexusUtilityMargin}:${row.stability.nexusMarginVariance}:${row.nexusCorrect}:${row.primeCorrect}`;
  const overlap = (left, right) => {
    const seen = new Set(left.map(key));
    return right.filter((row) => seen.has(key(row))).length;
  };

  const perturbationValidation = validateStage2L15PerturbationModel();
  const calibration = deriveStage2L15Calibration(development, calibrationRows);
  const incremental = measureStage2L15IncrementalInformation(development, calibrationRows);
  const rules = buildStage2L15RuleSet();
  const frozenRule = calibration.delegatingRuleId === null
    ? null
    : rules.find((rule) => rule.id === calibration.delegatingRuleId) ?? null;
  const delegation = evaluateStage2L15Delegation(holdout, calibration, frozenRule === null ? null : frozenRule.test);
  const adversarial = runStage2L15AdversarialSuite(calibration, frozenRule === null ? null : frozenRule.test);
  const ceiling = characteriseStage2L15Ceiling(calibration, holdout, development);

  /* Replay determinism and ordering invariance, measured rather than asserted. */
  const replaySample = runStage2L15Split('DEVELOPMENT').slice(0, 200);
  const replayEquivalent = stage2L15SplitDigest(replaySample)
    === stage2L15SplitDigest(development.slice(0, 200));
  const orderingInvariant = development.every((row) => row.stability.nexusOrderingInvariant === true);

  /* Leakage scan: no stability signal may carry a forbidden field, and the
   * measurement function must not read ground truth. Scanned over real rows. */
  const forbiddenInStability = [...new Set(development.flatMap((row) =>
    Object.keys(row.stability).filter((field) => STAGE2L15_FORBIDDEN_FIELDS.includes(field))))].sort();

  return deepFreeze({
    signalInventory: STAGE2L15_SIGNAL_INVENTORY,
    perturbationModel: {
      id: STAGE2L15_PERTURBATION_MODEL_ID,
      families: STAGE2L15_PERTURBATION_FAMILIES,
      familyCount: STAGE2L15_PERTURBATION_FAMILIES.length,
      probesPerFamily: STAGE2L15_PROBES_PER_FAMILY,
      perturbationsPerCase: STAGE2L15_PERTURBATIONS_PER_CASE,
      seededFrom: 'SHA256_OF_WORLD_CONTENT',
      readsGroundTruth: false,
      readsCaseIdentity: false,
      validation: perturbationValidation,
    },
    splits: {
      definition: STAGE2L15_SPLITS,
      developmentCases: development.length,
      calibrationCases: calibrationRows.length,
      finalHoldoutCases: holdout.length,
      overlaps: {
        developmentCalibration: overlap(development, calibrationRows),
        developmentHoldout: overlap(development, holdout),
        calibrationHoldout: overlap(calibrationRows, holdout),
      },
      splitsDisjoint: STAGE2L15_SPLITS.DEVELOPMENT.to <= STAGE2L15_SPLITS.CALIBRATION.from
        && STAGE2L15_SPLITS.CALIBRATION.to <= STAGE2L15_SPLITS.FINAL_HOLDOUT.from,
      developmentDigest: stage2L15SplitDigest(development),
      calibrationDigest: stage2L15SplitDigest(calibrationRows),
      finalHoldoutDigest: stage2L15SplitDigest(holdout),
    },
    stabilityAnalysis: buildStage2L15StabilityAnalysis(development),
    calibration,
    incremental,
    delegation,
    adversarial,
    ceiling,
    invariance: { replayEquivalent, orderingInvariant },
    labelLeakage: {
      forbiddenFields: STAGE2L15_FORBIDDEN_FIELDS,
      forbiddenInStability,
      labelLeakageDetected: forbiddenInStability.length > 0,
    },
    rows: holdout,
  });
}

/** Phase 3/4 reporting: distributions, discrimination and failure regimes,
 *  measured on DEVELOPMENT only. */
export function buildStage2L15StabilityAnalysis(developmentRows) {
  const eligible = developmentRows.filter((row) => row.structurallyEligible);
  const correct = eligible.filter((row) => row.nexusCorrect);
  const wrong = eligible.filter((row) => !row.nexusCorrect);
  const quantile = (values, p) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  };
  const summarise = (rows, signal) => {
    const values = rows.map((row) => row.stability[signal]);
    return {
      n: values.length,
      mean: values.length === 0 ? 0 : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      median: quantile(values, 0.5),
      p10: quantile(values, 0.1),
      p90: quantile(values, 0.9),
    };
  };

  const perSignal = Object.fromEntries(STAGE2L15_STABILITY_SIGNALS.map(([signal, higherIsBetter]) => [signal, {
    higherIsBetter,
    correct: summarise(correct, signal),
    wrong: summarise(wrong, signal),
    developmentAuroc: auroc(eligible, (row) => (higherIsBetter ? row.stability[signal] : -row.stability[signal])),
  }]));

  const regimes = [...new Set(eligible.map((row) => row.profile))].sort().map((profile) => {
    const subset = eligible.filter((row) => row.profile === profile);
    const subsetCorrect = subset.filter((row) => row.nexusCorrect);
    const subsetWrong = subset.filter((row) => !row.nexusCorrect);
    const meanOf = (rows) => (rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.stability.nexusMarginVariance, 0) / rows.length));
    return {
      profile,
      n: subset.length,
      accuracy: round(ratio(subsetCorrect.length, subset.length)),
      marginVarianceCorrect: meanOf(subsetCorrect),
      marginVarianceWrong: meanOf(subsetWrong),
      instabilityExposesError: meanOf(subsetWrong) > meanOf(subsetCorrect) * 1.25,
    };
  });

  const topologies = [...new Set(eligible.map((row) => row.family))].sort().map((family) => {
    const subset = eligible.filter((row) => row.family === family);
    return { family, n: subset.length, accuracy: round(ratio(subset.filter((row) => row.nexusCorrect).length, subset.length)) };
  });

  /* The two cases the brief names. Both exist; their frequency is the finding. */
  const stableButWrong = eligible.filter((row) => !row.nexusCorrect && row.stability.nexusTopActionStability === MICRO);
  const unstableButCorrect = eligible.filter((row) => row.nexusCorrect && row.stability.nexusTopActionStability < MICRO);

  return deepFreeze({
    eligibleCases: eligible.length,
    baseRate: round(ratio(correct.length, eligible.length)),
    perSignal,
    failureRegimes: regimes,
    topologies,
    stableButWrongCount: stableButWrong.length,
    stableButWrongShareOfErrors: round(ratio(stableButWrong.length, wrong.length)),
    unstableButCorrectCount: unstableButCorrect.length,
    unstableButCorrectShareOfCorrect: round(ratio(unstableButCorrect.length, correct.length)),
  });
}

export function certifyStage2L15({ evaluation = buildStage2L15Evaluation() } = {}) {
  const { splits, calibration, incremental, delegation, adversarial, invariance, labelLeakage, ceiling } = evaluation;

  const stabilityInformationPass = incremental.stabilityAddsInformation;
  const reliabilityPass = delegation.nexusDelegations > 0
    && delegation.nexusDelegationPrecision >= STAGE2L15_RELIABILITY_FLOOR;
  const conservativeBoundPass = delegation.nexusDelegations > 0
    && delegation.delegatedReliabilityLowerBound >= STAGE2L15_CONSERVATIVE_BOUND_REQUIREMENT;
  const supportPass = delegation.nexusDelegations >= STAGE2L15_MINIMUM_DELEGATION_COUNT
    && delegation.nexusDelegationRate >= STAGE2L15_MINIMUM_DELEGATION_RATE;
  const utilityPass = delegation.nexusDelegations > 0
    && delegation.beneficialChanges > delegation.harmfulChanges
    && delegation.arbiterAccuracy > delegation.primeOnlyAccuracy;
  const harmCeilingPass = delegation.harmCeilingRespected && delegation.correctPrimeBreakCeilingRespected;
  const primeProtectionPass = delegation.harmfulOpportunityRejectionRate >= 0.99
    || delegation.nexusDelegations === 0;
  const adversarialPass = Object.values(adversarial).every((entry) => entry.failsClosed);
  const securityRegressionPass = adversarialPass && invariance.replayEquivalent && invariance.orderingInvariant;
  const perturbationModelValid = evaluation.perturbationModel.validation.problemPreservationPass;

  const certified = splits.splitsDisjoint
    && !labelLeakage.labelLeakageDetected
    && perturbationModelValid
    && stabilityInformationPass
    && reliabilityPass
    && conservativeBoundPass
    && supportPass
    && utilityPass
    && harmCeilingPass
    && primeProtectionPass
    && securityRegressionPass;

  /* Outcome classification. The distinction that matters most here is between
   * "the signal is worthless" and "the signal is real but does not reach the
   * floor" — they imply different next stages, and conflating them would misreport
   * a genuine measurement as a dead end. */
  const outcome = certified ? 'A_SAFE_DELEGATION_CERTIFIED'
    : !stabilityInformationPass ? 'C_STABILITY_ADDS_NO_USEFUL_INFORMATION'
      : calibration.qualifyingRuleCount > 0 && !supportPass ? 'D_RELIABLE_REGION_TOO_SMALL'
        : calibration.meetsInheritedCriterionCount > 0 ? 'B_STABILITY_IMPROVES_CONFIDENCE_BUT_BELOW_FLOOR'
          : 'E_CONFIDENCE_CEILING_CONFIRMED_BELOW_099';

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L15_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'DECISION_STABILITY_AND_CONFIDENCE_CEILING_CERTIFICATION',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l14CertificationHash: STAGE2L15_STAGE2L14_CERTIFICATION_HASH,
      stage2l13CertificationHash: STAGE2L15_STAGE2L13_CERTIFICATION_HASH,
      groundTruthUnchanged: true,
      benchmarkUnchanged: true,
      nexusExpertChanged: false,
      nexusRecommendationSemanticsChanged: false,
      arbiterChanged: false,
      reliabilityFloorLowered: false,
      reliabilityFloor: STAGE2L15_RELIABILITY_FLOOR,
      statisticalMethodInherited: STAGE2L15_BOUND_METHOD,
      harmCeilingUnchanged: STAGE2L15_MAX_HARMFUL_CHANGE_RATE === 0.01,
      correctPrimeBreakCeilingUnchanged: STAGE2L15_MAX_CORRECT_PRIME_BREAK_RATE === 0.01,
    },
    signalInventory: evaluation.signalInventory,
    perturbationModel: evaluation.perturbationModel,
    splits,
    stabilityAnalysis: evaluation.stabilityAnalysis,
    incremental,
    calibration: {
      confidenceModel: calibration.confidenceModel,
      calibrationDigest: calibration.calibrationDigest,
      ruleCount: calibration.ruleCount,
      ladders: calibration.ladders,
      crossSplitConsistencyRequired: calibration.crossSplitConsistencyRequired,
      qualifyingRuleCount: calibration.qualifyingRuleCount,
      meetsInheritedCriterionCount: calibration.meetsInheritedCriterionCount,
      inheritedCriterionCandidates: calibration.inheritedCriterionCandidates,
      selected: calibration.selected,
      delegatingRuleId: calibration.delegatingRuleId,
      ceiling: calibration.ceiling,
      sweep: calibration.sweep,
    },
    delegation,
    adversarial,
    invariance,
    labelLeakage,
    labelLeakageDetected: labelLeakage.labelLeakageDetected,
    stabilityModelDeterministic: invariance.replayEquivalent,
    perturbationModelValid,
    confidenceCeiling: ceiling,
    stabilityInformationPass,
    reliabilityPass,
    conservativeReliabilityBoundPass: conservativeBoundPass,
    minimumDelegationSupportPass: supportPass,
    utilityPass,
    harmCeilingPass,
    primeProtectionPass,
    securityRegressionPass,
    nexusSafeForSelectiveDelegation: certified,
    nexusStabilityOutcome: outcome,
    stage2l15Certified: certified,
    interpretation: {
      nexusExpertRemediationRequired: !certified && ceiling.ceilingLimitationClass === 'RESIDUAL_EXPERT_ERROR',
      nexusConfidenceRemediationRequired: !certified && ceiling.ceilingLimitationClass === 'CONFIDENCE_SIGNAL_LIMITATION',
      arbiterRemediationRequired: false,
      measuredRemainingLimitation: certified
        ? 'None measured at this stage.'
        : `Supported reliability reaches ${ceiling.highestSupportedReliability} (n=${ceiling.supportAtHighestReliability}, lower bound ${ceiling.lowerBoundAtHighestReliability}) against an inherited floor of ${STAGE2L15_RELIABILITY_FLOOR}. ${ceiling.ceilingLimitationReason}`,
    },
    portabilityNote: 'Stage 2L.10 through 2L.14 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.15 does not change that.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ splits, calibration: calibration.calibrationDigest, delegation, incremental, outcome }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L15PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage,
    status: certification.status,
    developmentCases: certification.splits.developmentCases,
    calibrationCases: certification.splits.calibrationCases,
    finalHoldoutCases: certification.splits.finalHoldoutCases,
    calibrationDigest: certification.calibration.calibrationDigest,
    combinedDiscrimination: certification.incremental.combinedDiscrimination,
    highestSupportedReliability: certification.confidenceCeiling.highestSupportedReliability,
    nexusDelegations: certification.delegation.nexusDelegations,
    nexusStabilityOutcome: certification.nexusStabilityOutcome,
    evidenceDigest: certification.evidenceDigest,
    certificationHash: certification.certificationHash,
  };
  return deepFreeze({ digest: sha256(witnesses), witnesses });
}
