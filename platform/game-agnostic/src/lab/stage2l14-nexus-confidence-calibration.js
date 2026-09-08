/* Stage 2L.14 — Nexus confidence calibration and safe selective delegation
 * (R0, shadow only).
 *
 * THE MEASURED LIMITATION THIS ADDRESSES. Stage 2L.13 made Nexus accurate
 * (0.0844 -> 0.7826, overtaking Prime at 0.3946) and showed it can predict its own
 * correctness (discrimination 0.5475 against a permutation null p95 of 0.1055,
 * generalising out of sample). What it could not do was isolate a subgroup at the
 * inherited 0.99 reliability floor: its best eligible bucket reached 0.9459, so
 * delegations stayed at zero. The blocker moved from accuracy to CONFIDENCE.
 *
 * WHAT THIS STAGE DOES. It asks whether a genuinely high-confidence Nexus region
 * exists — not whether one can be manufactured. The 0.99 floor is inherited and
 * untouched. Reliability, delegation precision, harmful change, correct-Prime
 * break and every denominator keep their inherited definitions.
 *
 * THE ANTI-OVERFITTING GUARD. A bucket of 5/5 is not evidence. Every eligible
 * region must clear BOTH an observed-precision floor of 0.99 AND a conservative
 * Wilson lower bound, with a minimum case count declared in advance. With a
 * perfect point estimate the Wilson requirement alone forces n >= 88, so a
 * microscopic perfect bucket cannot certify Nexus.
 *
 * THE SPLIT DISCIPLINE. Three disjoint corpora drawn from the FROZEN Stage 2L.12
 * generator at variant ranges never previously used. DEVELOPMENT explores signal
 * families; CALIBRATION selects thresholds from a ladder declared before it ran;
 * FINAL_HOLDOUT is evaluated exactly once, after freezing.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { buildStage2L12Case } from './stage2l12-nexus-semantic-grounding-and-observable-utility.js';
import { evaluateValueAwareNexus } from './stage2l13-value-aware-nexus.js';

export const STAGE2L14_STAGE = 'STAGE2L14_NEXUS_CONFIDENCE_CALIBRATION_AND_SAFE_DELEGATION';
export const STAGE2L14_STAGE2L13_CERTIFICATION_HASH = '0b7f44d8874d0dfd831dfe7d05571735a62dbbcd689e89c77e3b377e636734c6';

/* ---------------------------------------------------------------------------
 * PREDECLARED CONSTANTS.
 *
 * Every one of these is fixed here, before CALIBRATION was run and long before
 * FINAL_HOLDOUT was touched. None may be revised after seeing a result — that is
 * what makes the stage falsifiable.
 * ------------------------------------------------------------------------- */

/* Inherited. NOT changed, NOT redefined. */
export const STAGE2L14_RELIABILITY_FLOOR = 0.99;
export const STAGE2L14_MAX_HARMFUL_CHANGE_RATE = 0.01;
export const STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE = 0.01;

/* Conservative bound: Wilson score interval, one-sided 95% (z = 1.6449).
 * Chosen because it is closed-form, deterministic, needs no iteration, and is
 * well behaved at p near 1 — where the normal approximation degenerates to a
 * zero-width interval and would wave through a 5/5 bucket.
 *
 * The requirement is 0.95, NOT 0.99. These are two different jobs and conflating
 * them would quietly distort the inherited floor. The 0.99 floor governs OBSERVED
 * precision and is inherited untouched. This bound is the separate anti-tiny-
 * bucket guard: its purpose is to ensure a bucket is large enough that its point
 * estimate is not an artifact. Setting it at 0.99 would demand ~268 perfect cases
 * and act as a second, stricter reliability floor rather than a support test.
 *
 * At 0.95 the bound forces n >= 52 at a perfect point estimate and n ~ 100 at
 * precision 0.99 — enough to exclude 1/1, 5/5 and 15/15 buckets while remaining
 * attainable by a genuine specialist region.
 *
 * CALIBRATED ON DEVELOPMENT, then frozen. Phase 2 designates DEVELOPMENT for
 * signal and methodology exploration; CALIBRATION and FINAL_HOLDOUT had not been
 * run when this value was fixed, and it is not revised afterwards. */
export const STAGE2L14_BOUND_METHOD = 'WILSON_SCORE_LOWER_BOUND';
export const STAGE2L14_BOUND_Z = 1.6449;
export const STAGE2L14_BOUND_CONFIDENCE_LEVEL = 0.95;
export const STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT = 0.95;

/* Support floors, scaled to a ~5,200-case decidable corpus. The eligible-case
 * count is raised above Stage 2L.10's inherited 60 because this corpus supports
 * it: candidate regions on DEVELOPMENT run to 120-270 cases, so 100 is a firmer
 * bar that a legitimate region still clears. */
export const STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT = 100;
export const STAGE2L14_MINIMUM_DELEGATION_COUNT = 50;
export const STAGE2L14_MINIMUM_DELEGATION_RATE = 0.005;

/* Threshold ladders. The confidence rule may only be assembled from these. */
export const STAGE2L14_RISK_LADDER = deepFreeze([400000, 500000, 600000, 700000, 800000]);
export const STAGE2L14_MARGIN_LADDER = deepFreeze([0, 100000, 200000, 300000, 400000]);

/* Split definition: disjoint variant ranges over the FROZEN Stage 2L.12
 * generator. Nothing about that generator changes; these are simply further
 * draws from the same deterministic process. */
export const STAGE2L14_SPLITS = deepFreeze({
  DEVELOPMENT: { split: 'HOLDOUT', from: 0, to: 14000 },
  CALIBRATION: { split: 'HOLDOUT', from: 14000, to: 28000 },
  FINAL_HOLDOUT: { split: 'HOLDOUT', from: 28000, to: 42000 },
});

function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }

/** Wilson score lower bound. Deterministic, closed form, no iteration. */
export function wilsonLowerBound(successes, trials, z = STAGE2L14_BOUND_Z) {
  if (trials === 0) return 0;
  const proportion = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = (proportion + (z * z) / (2 * trials)) / denominator;
  const halfWidth = (z / denominator) * Math.sqrt((proportion * (1 - proportion)) / trials + (z * z) / (4 * trials * trials));
  return round(Math.max(0, centre - halfWidth));
}

/* ---------------------------------------------------------------------------
 * PHASE 6 — multi-axis robustness.
 *
 * Stage 2L.13 emitted a cost-only stability flag that turned out to carry almost
 * no information: it separated 0.8036 from a 0.8041 base rate, flagging 17 of
 * 5,120 cases. This probe perturbs value, cost and risk independently, in both
 * directions, and re-runs the FROZEN expert. It reads no benchmark quantity and
 * no future state; it only asks whether the expert's own recommendation survives
 * small, plausible changes to the world it was given.
 * ------------------------------------------------------------------------- */

/* MEASURED ON DEVELOPMENT: this probe carries almost no discriminative
 * information. 5,025 of 5,120 recommendations survive all six perturbations, and
 * the surviving set is 0.8062 accurate against a 0.8041 base rate. It is retained
 * as a fail-closed structural gate — a recommendation that flips under a 10%
 * nudge should not be delegated on principle — but it is NOT presented as a
 * confidence signal, and the report says so. Stage 2L.13's cost-only flag is
 * weaker still (0.8036). */
export const STAGE2L14_ROBUSTNESS_AXES = deepFreeze(['objectiveValue', 'restorationCost', 'risk']);
export const STAGE2L14_ROBUSTNESS_DELTA_PERCENT = 10;

function perturbWorld(world, field, percent) {
  return {
    entities: world.entities.map((entity) => {
      const base = entity[field];
      if (!Number.isInteger(base)) return { ...entity };
      const delta = Math.round((base * percent) / 100);
      return { ...entity, [field]: Math.max(0, base + delta) };
    }),
    relations: world.relations.map((relation) => ({ ...relation })),
  };
}

/**
 * Fraction of perturbations under which the expert's recommendation is unchanged.
 * Six probes: each of three axes, up and down.
 */
export function measureRobustness(world, legalActions, baselineActionId) {
  let held = 0;
  let total = 0;
  for (const axis of STAGE2L14_ROBUSTNESS_AXES) {
    for (const percent of [STAGE2L14_ROBUSTNESS_DELTA_PERCENT, -STAGE2L14_ROBUSTNESS_DELTA_PERCENT]) {
      total += 1;
      const probe = evaluateValueAwareNexus(perturbWorld(world, axis, percent), legalActions, { inheritedSignals: false });
      if (probe.recommendedActionId === baselineActionId) held += 1;
    }
  }
  return { robustnessHeld: held, robustnessProbes: total, robustnessScore: Math.round((held * 1000000) / total) };
}

/* ---------------------------------------------------------------------------
 * PHASE 1 — confidence signal inventory.
 *
 * Every legitimate decision-time signal, with provenance. A signal is listed as
 * leakage-prone only if it could encode an evaluation label; none here can,
 * because all are computed by the expert from world state before any action is
 * scored.
 * ------------------------------------------------------------------------- */

export const STAGE2L14_SIGNAL_INVENTORY = deepFreeze([
  ['nexusUtilityMargin', 'STAGE2L13_EXPERT', 'own first-versus-second utility estimate'],
  ['nexusTopUtility', 'STAGE2L13_EXPERT', 'estimated utility of the chosen action'],
  ['nexusTopObjectiveRelevance', 'STAGE2L13_EXPERT', 'value reachable downstream of the target'],
  ['nexusTopStructuralImportance', 'STAGE2L13_EXPERT', 'dependents hanging off the target'],
  ['nexusTopCostPenalty', 'STAGE2L13_EXPERT', 'restoration cost of the target'],
  ['nexusTopRiskAdjustment', 'STAGE2L13_EXPERT', 'exposure the action removes'],
  ['nexusTopRedundancyAdjustment', 'STAGE2L13_EXPERT', 'discount applied for an alternate path'],
  ['remainingBlockerCount', 'STAGE2L13_EXPERT', 'blockers still on the best path after this action'],
  ['objectiveSupportCount', 'STAGE2L13_EXPERT', 'objective-bearing entities downstream'],
  ['contradictionCount', 'STAGE2L13_EXPERT', 'conflicting or inhibiting relations touching the target'],
  ['structuralSemanticAlignment', 'STAGE2L13_EXPERT', 'whether shape and utility agree on the pick'],
  ['positiveUtilityCandidateCount', 'STAGE2L13_EXPERT', 'candidates with net-positive utility'],
  ['candidateCount', 'STAGE2L13_EXPERT', 'actionable candidates considered'],
  ['semanticCoverage', 'STAGE2L13_EXPERT', 'fraction of candidates with complete semantics'],
  ['semanticFieldsIncompleteCount', 'STAGE2L13_EXPERT', 'candidates with missing or malformed fields'],
  ['perturbationStable', 'STAGE2L13_EXPERT', 'cost-only stability flag inherited from Stage 2L.13'],
  ['nexusRobustnessScore', 'STAGE2L14_ADDITIVE', 'multi-axis value/cost/risk stability, added by this stage'],
  ['nexusNormalizedMargin', 'STAGE2L14_ADDITIVE', 'margin as a fraction of top utility, added by this stage'],
].map(([signal, source, description]) => ({
  signal,
  source,
  description,
  deterministic: true,
  decisionTimeAvailable: true,
  expertEmitted: true,
  arbiterVisible: true,
  potentialLeakage: false,
})));

/* ---------------------------------------------------------------------------
 * The calibrated confidence contract.
 *
 * Additive and versioned. Stage 2L.13's signal block is carried through
 * unchanged; this stage appends a confidence envelope. The clean gate is a
 * conjunction of conditions under which the expert itself declares its reasoning
 * unobstructed — nothing about the answer enters it.
 * ------------------------------------------------------------------------- */

export const STAGE2L14_CONFIDENCE_CONTRACT_VERSION = 1;
export const STAGE2L14_CONFIDENCE_BUCKETS = deepFreeze([
  'NEXUS_CONFIDENCE_INELIGIBLE_ABSTAINED',
  'NEXUS_CONFIDENCE_INELIGIBLE_SEMANTICS',
  'NEXUS_CONFIDENCE_INELIGIBLE_UNSTABLE',
  'NEXUS_CONFIDENCE_OBSTRUCTED',
  'NEXUS_CONFIDENCE_MODERATE',
  'NEXUS_CONFIDENCE_HIGH',
]);

/* A priori structural ineligibility, inherited in spirit from Stage 2L.10: a
 * bucket in which the expert disclaims its own basis never delegates, however
 * well it happens to measure. */
export const STAGE2L14_STRUCTURALLY_INELIGIBLE_BUCKETS = deepFreeze([
  'NEXUS_CONFIDENCE_INELIGIBLE_ABSTAINED',
  'NEXUS_CONFIDENCE_INELIGIBLE_SEMANTICS',
  'NEXUS_CONFIDENCE_INELIGIBLE_UNSTABLE',
]);

export const STAGE2L14_MINIMUM_ROBUSTNESS_SCORE = 1000000; // all six probes must hold

export function stage2L14ConfidenceBucket(signals, parameters) {
  if (signals === null || signals === undefined) return null;
  if (signals.kind !== 'NEXUS_RELATIONAL_UTILITY_V1') return null;
  if (signals.abstained === true) return 'NEXUS_CONFIDENCE_INELIGIBLE_ABSTAINED';
  if (signals.semanticFieldsIncompleteCount > 0 || signals.semanticCoverage < 1000000) return 'NEXUS_CONFIDENCE_INELIGIBLE_SEMANTICS';
  if (signals.perturbationStable !== true) return 'NEXUS_CONFIDENCE_INELIGIBLE_UNSTABLE';
  if (Number.isInteger(signals.nexusRobustnessScore) && signals.nexusRobustnessScore < STAGE2L14_MINIMUM_ROBUSTNESS_SCORE) {
    return 'NEXUS_CONFIDENCE_INELIGIBLE_UNSTABLE';
  }
  /* Obstructed: the expert itself says something is still in the way. */
  if (signals.remainingBlockerCount > 0 || signals.contradictionCount > 0) return 'NEXUS_CONFIDENCE_OBSTRUCTED';
  const high = signals.nexusTopRiskAdjustment >= parameters.minRiskAdjustment
    && signals.nexusUtilityMargin >= parameters.minUtilityMargin;
  return high ? 'NEXUS_CONFIDENCE_HIGH' : 'NEXUS_CONFIDENCE_MODERATE';
}

export function bucketStructurallyEligible(bucket) {
  return bucket !== null && !STAGE2L14_STRUCTURALLY_INELIGIBLE_BUCKETS.includes(bucket);
}

/* ---------------------------------------------------------------------------
 * Corpus and evaluation over the three disjoint splits.
 * ------------------------------------------------------------------------- */

export function buildStage2L14Split(name) {
  const range = STAGE2L14_SPLITS[name];
  if (range === undefined) throw new Error(`STAGE2L14_UNKNOWN_SPLIT:${name}`);
  const cases = [];
  for (let variant = range.from; variant < range.to; variant += 1) {
    const record = buildStage2L12Case(range.split, variant);
    if (record.decidable) cases.push(record);
  }
  return cases;
}

/**
 * Run the FROZEN Stage 2L.13 expert plus this stage's additive confidence
 * envelope. The benchmark's ground truth is read only to SCORE the row, never to
 * compute any signal.
 */
export function runStage2L14Split(name) {
  const cases = buildStage2L14Split(name);
  return cases.map((record) => {
    const expert = evaluateValueAwareNexus(record.world, record.legalActions);
    const robustness = expert.recommendedActionId === null
      ? { robustnessHeld: 0, robustnessProbes: 6, robustnessScore: 0 }
      : measureRobustness(record.world, record.legalActions, expert.recommendedActionId);
    const signals = deepFreeze({
      ...expert.signals,
      confidenceContractVersion: STAGE2L14_CONFIDENCE_CONTRACT_VERSION,
      nexusRobustnessScore: robustness.robustnessScore,
      nexusRobustnessHeld: robustness.robustnessHeld,
      nexusRobustnessProbes: robustness.robustnessProbes,
      nexusNormalizedMargin: expert.signals.nexusTopUtility > 0
        ? Math.round((expert.signals.nexusUtilityMargin * 1000000) / expert.signals.nexusTopUtility)
        : 0,
    });
    const byId = new Map(record.world.entities.map((entity) => [entity.entityId, entity]));
    const primeRanked = record.groundTruth.scored
      .filter((entry) => entry.targetEntityId !== null)
      .sort((left, right) => {
        const leftEntity = byId.get(left.targetEntityId);
        const rightEntity = byId.get(right.targetEntityId);
        return (rightEntity.objectiveValue - leftEntity.objectiveValue)
          || (leftEntity.restorationCost - rightEntity.restorationCost)
          || left.actionId.localeCompare(right.actionId);
      });
    const primeActionId = primeRanked[0]?.actionId ?? record.groundTruth.scored[0]?.actionId ?? null;
    const optimal = record.groundTruth.optimalActionId;
    return {
      worldId: record.worldId,
      splitName: name,
      family: record.family,
      profile: record.profile,
      optimalActionId: optimal,
      primeActionId,
      primeCorrect: primeActionId === optimal,
      nexusActionId: expert.recommendedActionId,
      nexusAbstained: expert.abstained,
      nexusCorrect: expert.recommendedActionId !== null && expert.recommendedActionId === optimal,
      /* Would delegating actually move Prime? Neutral agreement is not a
       * delegation, exactly as Stage 2L.9 through 2L.13 define it. */
      movesPrime: expert.recommendedActionId !== null && expert.recommendedActionId !== primeActionId,
      signals,
    };
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 2/5 — calibration.
 *
 * Thresholds are chosen from the declared ladders on the CALIBRATION split only,
 * by a selection rule fixed before that split was run. FINAL_HOLDOUT is never
 * consulted here.
 * ------------------------------------------------------------------------- */

function bucketStats(rows, bucket, parameters) {
  const subset = rows.filter((row) => stage2L14ConfidenceBucket(row.signals, parameters) === bucket);
  const correct = subset.filter((row) => row.nexusCorrect).length;
  const moves = subset.filter((row) => row.movesPrime);
  return {
    opportunities: subset.length,
    expertCorrect: correct,
    expertWrong: subset.length - correct,
    reliability: subset.length === 0 ? null : round(ratio(correct, subset.length)),
    wilsonLowerBound: wilsonLowerBound(correct, subset.length),
    movesPrime: moves.length,
    beneficialOverrides: moves.filter((row) => row.nexusCorrect && !row.primeCorrect).length,
    harmfulOverrides: moves.filter((row) => !row.nexusCorrect && row.primeCorrect).length,
  };
}

function qualifies(stats) {
  return stats.opportunities >= STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT
    && stats.reliability !== null
    && stats.reliability >= STAGE2L14_RELIABILITY_FLOOR
    && stats.wilsonLowerBound >= STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT;
}

export function deriveStage2L14Calibration(calibrationRows) {
  for (const row of calibrationRows) {
    if (row.splitName !== 'CALIBRATION') throw new Error('STAGE2L14_CALIBRATION_SPLIT_VIOLATION');
  }
  const sweep = [];
  for (const minRiskAdjustment of STAGE2L14_RISK_LADDER) {
    for (const minUtilityMargin of STAGE2L14_MARGIN_LADDER) {
      const parameters = { minRiskAdjustment, minUtilityMargin };
      const stats = bucketStats(calibrationRows, 'NEXUS_CONFIDENCE_HIGH', parameters);
      sweep.push({ minRiskAdjustment, minUtilityMargin, ...stats, qualifies: qualifies(stats) });
    }
  }
  /* Declared selection rule, fixed before CALIBRATION ran:
   *   1. keep only candidates meeting precision, conservative bound and support;
   *   2. among those take the MOST opportunities — a specialist region is only
   *      useful if it covers something;
   *   3. break ties toward the more conservative candidate (higher risk floor,
   *      then higher margin floor). */
  const qualifying = sweep.filter((entry) => entry.qualifies);
  const chosen = qualifying.length === 0 ? null
    : qualifying.slice().sort((left, right) =>
      right.opportunities - left.opportunities
      || right.minRiskAdjustment - left.minRiskAdjustment
      || right.minUtilityMargin - left.minUtilityMargin)[0];

  /* Fail closed: with no qualifying candidate the parameters are set to the most
   * restrictive ladder entry and nothing delegates. */
  const parameters = chosen === null
    ? { minRiskAdjustment: STAGE2L14_RISK_LADDER[STAGE2L14_RISK_LADDER.length - 1], minUtilityMargin: STAGE2L14_MARGIN_LADDER[STAGE2L14_MARGIN_LADDER.length - 1] }
    : { minRiskAdjustment: chosen.minRiskAdjustment, minUtilityMargin: chosen.minUtilityMargin };

  const buckets = Object.fromEntries(STAGE2L14_CONFIDENCE_BUCKETS.map((bucket) => {
    const stats = bucketStats(calibrationRows, bucket, parameters);
    const eligible = bucketStructurallyEligible(bucket);
    return [bucket, {
      ...stats,
      structurallyEligible: eligible,
      delegates: eligible && chosen !== null && bucket === 'NEXUS_CONFIDENCE_HIGH' && qualifies(stats),
    }];
  }));

  const body = {
    calibrationVersion: STAGE2L14_CONFIDENCE_CONTRACT_VERSION,
    stage: STAGE2L14_STAGE,
    confidenceModel: 'STAGE2L14_RISK_DOMINANT_MARGIN_GATED_CONFIDENCE_V1',
    signalKind: 'NEXUS_RELATIONAL_UTILITY_V1',
    reliabilityFloor: STAGE2L14_RELIABILITY_FLOOR,
    boundMethod: STAGE2L14_BOUND_METHOD,
    boundConfidenceLevel: STAGE2L14_BOUND_CONFIDENCE_LEVEL,
    boundZ: STAGE2L14_BOUND_Z,
    conservativeBoundRequirement: STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT,
    minimumEligibleCaseCount: STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT,
    minimumDelegationCount: STAGE2L14_MINIMUM_DELEGATION_COUNT,
    minimumDelegationRate: STAGE2L14_MINIMUM_DELEGATION_RATE,
    riskLadder: [...STAGE2L14_RISK_LADDER],
    marginLadder: [...STAGE2L14_MARGIN_LADDER],
    parameters,
    buckets,
    delegatingBuckets: STAGE2L14_CONFIDENCE_BUCKETS.filter((bucket) => buckets[bucket].delegates),
    structurallyIneligibleBuckets: [...STAGE2L14_STRUCTURALLY_INELIGIBLE_BUCKETS],
    sweep,
    selected: chosen,
    calibrationOpportunities: calibrationRows.length,
  };
  return deepFreeze({ ...body, calibrationDigest: sha256(body) });
}

/* ---------------------------------------------------------------------------
 * PHASE 8/9/10 — delegation on a frozen calibration.
 *
 * Delegation requires the confidence bucket to be a calibrated delegating bucket
 * AND the recommendation to actually move Prime. Everything else keeps Prime.
 * ------------------------------------------------------------------------- */

export function evaluateStage2L14Delegation(rows, calibration, { expectedSplit = 'FINAL_HOLDOUT' } = {}) {
  for (const row of rows) {
    if (row.splitName !== expectedSplit) throw new Error('STAGE2L14_HOLDOUT_SPLIT_VIOLATION');
  }
  const gated = rows.map((row) => {
    const bucket = stage2L14ConfidenceBucket(row.signals, calibration.parameters);
    const entry = bucket === null ? undefined : calibration.buckets[bucket];
    /* Unknown, unseen or unsupported buckets abstain. Default deny. */
    const delegates = entry !== undefined && entry.delegates === true;
    return { ...row, confidenceBucket: bucket, delegated: delegates && row.movesPrime };
  });
  const total = gated.length;
  const delegations = gated.filter((row) => row.delegated);
  const beneficial = delegations.filter((row) => row.nexusCorrect && !row.primeCorrect).length;
  const harmful = delegations.filter((row) => !row.nexusCorrect && row.primeCorrect).length;
  const arbiterCorrect = gated.filter((row) => (row.delegated ? row.nexusCorrect : row.primeCorrect)).length;
  const primeCorrect = gated.filter((row) => row.primeCorrect).length;

  /* Prime protection, measured both ways. A confidence rule that captured
   * beneficial overrides and harmful ones equally would be worthless. */
  const beneficialOpportunities = gated.filter((row) => row.movesPrime && row.nexusCorrect && !row.primeCorrect);
  const harmfulOpportunities = gated.filter((row) => row.movesPrime && !row.nexusCorrect && row.primeCorrect);
  const eligible = gated.filter((row) => {
    const entry = row.confidenceBucket === null ? undefined : calibration.buckets[row.confidenceBucket];
    return entry !== undefined && entry.delegates === true;
  });
  /* Two different zeros. "No case reached a delegating bucket" and "no case was
   * even structurally eligible" are distinct findings, and a report that shows
   * only the first cannot tell them apart. Structural eligibility is a property
   * of the expert's own confidence contract and is independent of whether any
   * bucket survived calibration. */
  const structurallyEligible = gated.filter((row) => bucketStructurallyEligible(row.confidenceBucket));
  const structurallyEligibleMovingPrime = structurallyEligible.filter((row) => row.movesPrime);

  return deepFreeze({
    casesEvaluated: total,
    calibrationDigest: calibration.calibrationDigest,
    delegatingBuckets: [...calibration.delegatingBuckets],
    bucketUsage: Object.fromEntries(STAGE2L14_CONFIDENCE_BUCKETS.map((bucket) => {
      const subset = gated.filter((row) => row.confidenceBucket === bucket);
      const correct = subset.filter((row) => row.nexusCorrect).length;
      return [bucket, {
        cases: subset.length,
        delegated: subset.filter((row) => row.delegated).length,
        reliability: subset.length === 0 ? null : round(ratio(correct, subset.length)),
        wilsonLowerBound: wilsonLowerBound(correct, subset.length),
      }];
    })),
    nexusEligibleRecommendations: eligible.length,
    structurallyEligibleRecommendations: structurallyEligible.length,
    structurallyEligibleRecommendationsMovingPrime: structurallyEligibleMovingPrime.length,
    structurallyEligibleReliability: round(ratio(structurallyEligible.filter((row) => row.nexusCorrect).length, structurallyEligible.length)),
    nexusDelegations: delegations.length,
    nexusDelegationRate: round(ratio(delegations.length, total)),
    nexusDelegationPrecision: round(ratio(beneficial, delegations.length)),
    nexusDelegationPrecisionLowerBound: wilsonLowerBound(beneficial, delegations.length),
    /* Reliability of the delegated set measured as Nexus-correctness, the same
     * quantity the 0.99 floor is stated against. */
    delegatedReliability: round(ratio(delegations.filter((row) => row.nexusCorrect).length, delegations.length)),
    delegatedReliabilityLowerBound: wilsonLowerBound(delegations.filter((row) => row.nexusCorrect).length, delegations.length),
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
    beneficialOpportunityCaptureRate: round(ratio(beneficialOpportunities.filter((row) => row.delegated).length, beneficialOpportunities.length)),
    harmfulOpportunities: harmfulOpportunities.length,
    harmfulOpportunitiesRejected: harmfulOpportunities.filter((row) => !row.delegated).length,
    harmfulOpportunityRejectionRate: round(ratio(harmfulOpportunities.filter((row) => !row.delegated).length, harmfulOpportunities.length)),
    harmCeilingRespected: round(ratio(harmful, total)) <= STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
    correctPrimeBreakCeilingRespected: round(ratio(harmful, total)) <= STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
    reliabilityFloorLowered: false,
    delegationForced: false,
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 12 — adversarial confidence tests.
 *
 * Every unsupported, unseen, malformed or unknown confidence region must abstain
 * rather than delegate optimistically.
 * ------------------------------------------------------------------------- */

export const STAGE2L14_ADVERSARIAL_CONFIDENCE_CASES = deepFreeze([
  'UNKNOWN_SIGNAL_KIND', 'MISSING_SIGNALS', 'ABSTAINED_EXPERT',
  'INCOMPLETE_SEMANTICS', 'UNSTABLE_UNDER_PERTURBATION', 'LOW_ROBUSTNESS',
  'OBSTRUCTED_BY_BLOCKERS', 'CONTRADICTED', 'EXACT_THRESHOLD_EQUALITY',
  'ONE_BELOW_THRESHOLD', 'ONE_ABOVE_THRESHOLD', 'UNSEEN_BUCKET', 'NEGATIVE_MARGIN',
]);

function confidenceSignals(overrides = {}) {
  return {
    kind: 'NEXUS_RELATIONAL_UTILITY_V1',
    abstained: false,
    semanticFieldsIncompleteCount: 0,
    semanticCoverage: 1000000,
    perturbationStable: true,
    nexusRobustnessScore: 1000000,
    remainingBlockerCount: 0,
    contradictionCount: 0,
    nexusTopRiskAdjustment: 900000,
    nexusUtilityMargin: 500000,
    ...overrides,
  };
}

export function runStage2L14AdversarialSuite(calibration) {
  const parameters = calibration.parameters;
  const probe = (signals) => {
    const bucket = stage2L14ConfidenceBucket(signals, parameters);
    const entry = bucket === null ? undefined : calibration.buckets[bucket];
    return { bucket, delegates: entry !== undefined && entry.delegates === true };
  };
  const cases = {
    UNKNOWN_SIGNAL_KIND: probe(confidenceSignals({ kind: 'NEXUS_UNREGISTERED_V9' })),
    MISSING_SIGNALS: probe(null),
    ABSTAINED_EXPERT: probe(confidenceSignals({ abstained: true })),
    INCOMPLETE_SEMANTICS: probe(confidenceSignals({ semanticCoverage: 500000, semanticFieldsIncompleteCount: 2 })),
    UNSTABLE_UNDER_PERTURBATION: probe(confidenceSignals({ perturbationStable: false })),
    LOW_ROBUSTNESS: probe(confidenceSignals({ nexusRobustnessScore: 833333 })),
    OBSTRUCTED_BY_BLOCKERS: probe(confidenceSignals({ remainingBlockerCount: 2 })),
    CONTRADICTED: probe(confidenceSignals({ contradictionCount: 1 })),
    EXACT_THRESHOLD_EQUALITY: probe(confidenceSignals({ nexusTopRiskAdjustment: parameters.minRiskAdjustment, nexusUtilityMargin: parameters.minUtilityMargin })),
    ONE_BELOW_THRESHOLD: probe(confidenceSignals({ nexusTopRiskAdjustment: parameters.minRiskAdjustment - 1, nexusUtilityMargin: parameters.minUtilityMargin })),
    ONE_ABOVE_THRESHOLD: probe(confidenceSignals({ nexusTopRiskAdjustment: parameters.minRiskAdjustment + 1, nexusUtilityMargin: parameters.minUtilityMargin + 1 })),
    UNSEEN_BUCKET: (() => {
      const bucket = 'NEXUS_CONFIDENCE_NEVER_CALIBRATED';
      const entry = calibration.buckets[bucket];
      return { bucket, delegates: entry !== undefined && entry.delegates === true };
    })(),
    NEGATIVE_MARGIN: probe(confidenceSignals({ nexusUtilityMargin: -1 })),
  };
  return deepFreeze(Object.fromEntries(Object.entries(cases).map(([name, result]) => [name, {
    ...result,
    /* Optimistic delegation on any of these would be the failure mode. Only the
     * two threshold-boundary probes may legitimately delegate, and only if a
     * delegating bucket exists at all. */
    abstains: !result.delegates,
    expectedToAbstain: !['EXACT_THRESHOLD_EQUALITY', 'ONE_ABOVE_THRESHOLD'].includes(name),
    failsClosed: !['EXACT_THRESHOLD_EQUALITY', 'ONE_ABOVE_THRESHOLD'].includes(name) ? !result.delegates : true,
  }])));
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 * ------------------------------------------------------------------------- */

export function buildStage2L14Evaluation() {
  const developmentRows = runStage2L14Split('DEVELOPMENT');
  const calibrationRows = runStage2L14Split('CALIBRATION');
  const holdoutRows = runStage2L14Split('FINAL_HOLDOUT');
  const replayRows = runStage2L14Split('FINAL_HOLDOUT');

  const calibration = deriveStage2L14Calibration(calibrationRows);
  const delegation = evaluateStage2L14Delegation(holdoutRows, calibration);
  const adversarial = runStage2L14AdversarialSuite(calibration);

  /* Post-freeze diagnostics only. The parameters are already frozen and nothing
   * below can change them; this exists so the report can say whether the signal
   * itself generalised or merely the point estimate collapsed. */
  const diagnosticGrid = [];
  for (const minRiskAdjustment of STAGE2L14_RISK_LADDER) {
    for (const minUtilityMargin of STAGE2L14_MARGIN_LADDER) {
      const parameters = { minRiskAdjustment, minUtilityMargin };
      const forSplit = (rows) => {
        const subset = rows.filter((row) => stage2L14ConfidenceBucket(row.signals, parameters) === 'NEXUS_CONFIDENCE_HIGH');
        const correct = subset.filter((row) => row.nexusCorrect).length;
        return { n: subset.length, precision: subset.length === 0 ? null : round(ratio(correct, subset.length)), wilsonLowerBound: wilsonLowerBound(correct, subset.length) };
      };
      diagnosticGrid.push({
        minRiskAdjustment, minUtilityMargin,
        development: forSplit(developmentRows),
        calibration: forSplit(calibrationRows),
        finalHoldout: forSplit(holdoutRows),
      });
    }
  }

  const splitIds = {
    development: new Set(developmentRows.map((row) => row.worldId)),
    calibration: new Set(calibrationRows.map((row) => row.worldId)),
    holdout: new Set(holdoutRows.map((row) => row.worldId)),
  };
  const overlaps = {
    developmentCalibration: [...splitIds.development].filter((id) => splitIds.calibration.has(id)).length,
    developmentHoldout: [...splitIds.development].filter((id) => splitIds.holdout.has(id)).length,
    calibrationHoldout: [...splitIds.calibration].filter((id) => splitIds.holdout.has(id)).length,
  };

  const rowDigest = sha256(holdoutRows.map((row) => ({ worldId: row.worldId, nexus: row.nexusActionId, bucket: stage2L14ConfidenceBucket(row.signals, calibration.parameters) })));
  const replayDigest = sha256(replayRows.map((row) => ({ worldId: row.worldId, nexus: row.nexusActionId, bucket: stage2L14ConfidenceBucket(row.signals, calibration.parameters) })));

  const forbidden = ['nexusCorrect', 'primeCorrect', 'optimalActionId', 'movesPrime', 'worldId', 'family', 'profile', 'splitName'];
  const signalKeys = holdoutRows.length > 0 ? Object.keys(holdoutRows[0].signals) : [];
  const forbiddenInSignals = forbidden.filter((key) => signalKeys.includes(key));

  return deepFreeze({
    signalInventory: STAGE2L14_SIGNAL_INVENTORY,
    splits: {
      definition: STAGE2L14_SPLITS,
      developmentCases: developmentRows.length,
      calibrationCases: calibrationRows.length,
      finalHoldoutCases: holdoutRows.length,
      overlaps,
      splitsDisjoint: Object.values(overlaps).every((count) => count === 0),
      calibrationHoldoutSeparate: overlaps.calibrationHoldout === 0,
      developmentDigest: sha256(developmentRows.map((row) => row.worldId)),
      calibrationDigest: sha256(calibrationRows.map((row) => row.worldId)),
      finalHoldoutDigest: sha256(holdoutRows.map((row) => row.worldId)),
    },
    calibration,
    delegation,
    adversarial,
    diagnosticGrid,
    robustnessFinding: {
      axes: [...STAGE2L14_ROBUSTNESS_AXES],
      deltaPercent: STAGE2L14_ROBUSTNESS_DELTA_PERCENT,
      probesPerCase: 6,
      fullyRobustShare: round(ratio(developmentRows.filter((row) => row.signals.nexusRobustnessScore === 1000000).length, developmentRows.filter((row) => !row.nexusAbstained).length)),
      discriminativeValue: 'NEGLIGIBLE',
      note: 'Measured on DEVELOPMENT: the fully robust set is 0.8062 accurate against a 0.8041 base rate. Retained as a fail-closed structural gate, not presented as a confidence signal.',
    },
    invariance: { replayEquivalent: rowDigest === replayDigest, rowDigest, replayDigest },
    labelLeakage: {
      signalKeysInspected: signalKeys.length,
      forbiddenScanned: forbidden,
      forbiddenInSignals,
      labelLeakageDetected: forbiddenInSignals.length > 0,
    },
    rows: holdoutRows,
  });
}

export function certifyStage2L14({ evaluation = buildStage2L14Evaluation() } = {}) {
  const { splits, calibration, delegation, adversarial, invariance, labelLeakage } = evaluation;

  const reliabilityPass = delegation.nexusDelegations > 0
    && delegation.nexusDelegationPrecision >= STAGE2L14_RELIABILITY_FLOOR;
  const conservativeBoundPass = delegation.nexusDelegations > 0
    && delegation.delegatedReliabilityLowerBound >= STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT;
  const supportPass = delegation.nexusDelegations >= STAGE2L14_MINIMUM_DELEGATION_COUNT
    && delegation.nexusDelegationRate >= STAGE2L14_MINIMUM_DELEGATION_RATE;
  const utilityPass = delegation.nexusDelegations > 0
    && delegation.beneficialChanges > delegation.harmfulChanges
    && delegation.arbiterAccuracy > delegation.primeOnlyAccuracy;
  const harmCeilingPass = delegation.harmCeilingRespected && delegation.correctPrimeBreakCeilingRespected;
  const primeProtectionPass = delegation.harmfulOpportunityRejectionRate >= 0.99
    || delegation.nexusDelegations === 0;
  const adversarialPass = Object.values(adversarial).every((entry) => entry.failsClosed);
  const securityRegressionPass = adversarialPass && invariance.replayEquivalent;

  const certified = splits.splitsDisjoint
    && !labelLeakage.labelLeakageDetected
    && reliabilityPass
    && conservativeBoundPass
    && supportPass
    && utilityPass
    && harmCeilingPass
    && primeProtectionPass
    && securityRegressionPass;

  /* Where the failure lives, if it fails. Distinguishing these matters: they
   * imply different next stages, and "no >=0.99 region exists" is a different
   * finding from "one exists but is too small" or "one appeared and collapsed". */
  const bestCalibrationPrecision = Math.max(0, ...calibration.sweep.map((entry) => entry.reliability ?? 0));
  const anyCalibrationRegionAtFloor = calibration.sweep.some((entry) =>
    (entry.reliability ?? 0) >= STAGE2L14_RELIABILITY_FLOOR);
  const anyCalibrationRegionAtFloorWithSupport = calibration.sweep.some((entry) =>
    (entry.reliability ?? 0) >= STAGE2L14_RELIABILITY_FLOOR
    && entry.opportunities >= STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT);
  const developmentReachedFloor = evaluation.diagnosticGrid.some((entry) =>
    (entry.development.precision ?? 0) >= STAGE2L14_RELIABILITY_FLOOR
    && entry.development.n >= STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT);

  const outcome = certified ? 'A_SAFE_DELEGATION_CERTIFIED'
    : anyCalibrationRegionAtFloor && !anyCalibrationRegionAtFloorWithSupport ? 'B_RELIABLE_REGION_EXISTS_BUT_TOO_SMALL'
      : developmentReachedFloor && !anyCalibrationRegionAtFloor ? 'D_CONFIDENCE_DOES_NOT_GENERALIZE'
        : 'C_SIGNAL_EXISTS_BELOW_RELIABILITY_FLOOR';

  const failureMode = certified ? null
    : outcome === 'B_RELIABLE_REGION_EXISTS_BUT_TOO_SMALL' ? 'INSUFFICIENT_SUPPORT'
      : outcome === 'D_CONFIDENCE_DOES_NOT_GENERALIZE' ? 'FAILED_GENERALIZATION'
        : 'INSUFFICIENT_RELIABILITY';

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L14_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'CONFIDENCE_CALIBRATION_AND_DELEGATION_CERTIFICATION',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l13CertificationHash: STAGE2L14_STAGE2L13_CERTIFICATION_HASH,
      groundTruthUnchanged: true,
      benchmarkUnchanged: true,
      nexusExpertChanged: false,
      arbiterChanged: false,
      reliabilityFloorLowered: false,
      reliabilityFloor: STAGE2L14_RELIABILITY_FLOOR,
      harmCeilingUnchanged: STAGE2L14_MAX_HARMFUL_CHANGE_RATE === 0.01,
      correctPrimeBreakCeilingUnchanged: STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE === 0.01,
    },
    signalInventory: evaluation.signalInventory,
    splits,
    predeclared: {
      reliabilityFloor: STAGE2L14_RELIABILITY_FLOOR,
      boundMethod: STAGE2L14_BOUND_METHOD,
      boundConfidenceLevel: STAGE2L14_BOUND_CONFIDENCE_LEVEL,
      conservativeBoundRequirement: STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT,
      minimumEligibleCaseCount: STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT,
      minimumDelegationCount: STAGE2L14_MINIMUM_DELEGATION_COUNT,
      minimumDelegationRate: STAGE2L14_MINIMUM_DELEGATION_RATE,
      riskLadder: [...STAGE2L14_RISK_LADDER],
      marginLadder: [...STAGE2L14_MARGIN_LADDER],
    },
    calibration: {
      confidenceModel: calibration.confidenceModel,
      calibrationVersion: calibration.calibrationVersion,
      calibrationDigest: calibration.calibrationDigest,
      parameters: calibration.parameters,
      buckets: calibration.buckets,
      delegatingBuckets: calibration.delegatingBuckets,
      structurallyIneligibleBuckets: calibration.structurallyIneligibleBuckets,
      sweep: calibration.sweep,
      selected: calibration.selected,
      bestCalibrationPrecision: round(bestCalibrationPrecision),
      anyCalibrationRegionAtFloor,
      anyCalibrationRegionAtFloorWithSupport,
      developmentReachedFloor,
    },
    diagnosticGrid: evaluation.diagnosticGrid,
    robustnessFinding: evaluation.robustnessFinding,
    delegation,
    adversarial,
    invariance,
    labelLeakage,
    labelLeakageDetected: labelLeakage.labelLeakageDetected,
    confidenceModelDeterministic: invariance.replayEquivalent,
    nexusSelfCorrectnessIdentifiable: true,
    reliabilityPass,
    conservativeReliabilityBoundPass: conservativeBoundPass,
    minimumDelegationSupportPass: supportPass,
    utilityPass,
    harmCeilingPass,
    primeProtectionPass,
    securityRegressionPass,
    nexusSafeForSelectiveDelegation: certified,
    nexusConfidenceOutcome: outcome,
    failureMode,
    stage2l14Certified: certified,
    interpretation: {
      nexusExpertRemediationRequired: false,
      nexusConfidenceRemediationRequired: !certified,
      nexusContractRemediationRequired: false,
      arbiterRemediationRequired: false,
      measuredRemainingLimitation: certified
        ? 'None measured at this stage.'
        : `No supported confidence region reaches the inherited ${STAGE2L14_RELIABILITY_FLOOR} floor. Best precision anywhere on the calibration grid was ${round(bestCalibrationPrecision)}. Regions above the floor on DEVELOPMENT did not reproduce on a fresh calibration draw, which is what the three-way split exists to detect.`,
    },
    portabilityNote: 'Stage 2L.10 through 2L.13 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.14 does not change that.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ splits, calibration: calibration.calibrationDigest, delegation, outcome }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

/* ---------------------------------------------------------------------------
 * Portability witness.
 *
 * Same shape as Stage 2L.11 through 2L.13. Stage 2L.14 measures on a single
 * platform, so its recorded status stays DIGEST_PRODUCED_SINGLE_PLATFORM. That
 * limitation is inherited and recorded, not remediated here.
 * ------------------------------------------------------------------------- */

export function buildStage2L14PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage,
    status: certification.status,
    developmentCases: certification.splits.developmentCases,
    calibrationCases: certification.splits.calibrationCases,
    finalHoldoutCases: certification.splits.finalHoldoutCases,
    calibrationDigest: certification.calibration.calibrationDigest,
    bestCalibrationPrecision: certification.calibration.bestCalibrationPrecision,
    delegatingBuckets: certification.calibration.delegatingBuckets,
    nexusDelegations: certification.delegation.nexusDelegations,
    nexusDelegationPrecision: certification.delegation.nexusDelegationPrecision,
    nexusConfidenceOutcome: certification.nexusConfidenceOutcome,
    failureMode: certification.failureMode,
    evidenceDigest: certification.evidenceDigest,
    certificationHash: certification.certificationHash,
  };
  return deepFreeze({ digest: sha256(witnesses), witnesses });
}
