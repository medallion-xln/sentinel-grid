/* Stage 2L.17 — Nexus with live-substitute validation and an explicit
 * do-nothing baseline (R0, advisory only).
 *
 * WHAT THIS FIXES, AND WHY THESE TWO THINGS. Stage 2L.16 decomposed 3,308
 * residual errors and found two coherent defects in the frozen Stage 2L.13
 * expert:
 *
 *   1. SUBSTITUTE_MISVALUATION (41.9% of errors). The expert credits a BYPASS
 *      whenever a substitute EXISTS — `addressesTarget = substitutes.length > 0`
 *      — with no check that the substitute could actually carry the dependency.
 *
 *   2. NO DO-NOTHING BASELINE. 73.5% of its errors choose an intervention whose
 *      true utility is worse than inaction. The expert never ranks HOLD; it ranks
 *      interventions and separately asks whether its own score clears zero.
 *
 * THE SUBTLETY THAT MAKES THE FIRST FIX NON-OBVIOUS. Stage 2L.16's diagnostic
 * probe tested "is the substitute currently delivering", which cost it 552 broken
 * cases. That test is wrong, because the world's BYPASS action SETS the
 * substitute's availability to full. A substitute that is down *only because it is
 * unavailable* is exactly the case BYPASS repairs. The correct decision-time
 * question is counterfactual and bounded:
 *
 *      would this substitute deliver ONCE ITS AVAILABILITY IS RESTORED?
 *
 * which is answered from canonical state: does it have the capacity it needs, and
 * are its own prerequisites unblocked. Nothing about the answer key enters it.
 *
 * WHAT THE SECOND FIX ACTUALLY IS. The expert's benefit term was never a
 * counterfactual delta. It summed the objective value sitting downstream of a
 * target whether or not that value was ALREADY being delivered. So an
 * intervention on a healthy chain scored the chain's entire worth. The fix is to
 * credit only value that is not already flowing — which is precisely "compare
 * against the do-nothing baseline" — and then to recommend acting only when that
 * delta beats the estimated cost of acting. HOLD becomes a real candidate that
 * can itself be wrong, not an automatic winner.
 *
 * WHAT IS DELIBERATELY NOT DONE. No fixed-point reasoning: Stage 2L.16 measured
 * iterative propagation at +13 net cases (0.39% of errors) and Stage 2L.17's brief
 * forbids expanding into it. Every traversal here is the bounded BFS the inherited
 * expert already performed. No benchmark module is imported; the certify script
 * fails if one ever is.
 *
 * FAITHFULNESS. This file reimplements the inherited scorer so the two
 * corrections can be switched off for ablation. A reimplementation that drifts
 * would invent or hide an improvement, so the INHERITED variant is asserted to
 * reproduce the frozen Stage 2L.13 expert on every corpus case, and certification
 * is refused if it does not.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';

export const STAGE2L17_EXPERT_ID = 'sentinel-nexus-live-substitute-hold-baseline';
export const STAGE2L17_EXPERT_VERSION = 1;

const MICRO = 1000000;

/* Inherited constants, restated at their Stage 2L.13 values. These are NOT tuned
 * by this stage; the ablation switches mechanisms on and off, it never moves a
 * constant. */
export const STAGE2L17_NEXUS_OPERATIONAL_THRESHOLD = 500000;
export const STAGE2L17_REDUNDANCY_DISCOUNT_NUMERATOR = 1;
export const STAGE2L17_REDUNDANCY_DISCOUNT_DENOMINATOR = 4;
export const STAGE2L17_BLOCKER_ATTENUATION_NUMERATOR = 1;
export const STAGE2L17_BLOCKER_ATTENUATION_DENOMINATOR = 3;

/* The do-nothing baseline has two separable halves, and the ablation must be able
 * to tell them apart:
 *
 *   holdDelta     — credit an intervention only with value it would NEWLY bring
 *                   online, rather than with everything sitting downstream. This
 *                   affects RANKING.
 *   holdAbstain   — refuse to act when the estimated gain over inaction is not
 *                   positive. This affects WHETHER TO ACT AT ALL.
 *
 * Measuring them together would confound a ranking improvement with an abstention
 * change, and on this corpus the two pull in opposite directions. */
export const STAGE2L17_VARIANTS = deepFreeze({
  INHERITED: { liveSubstitute: false, holdDelta: false, holdAbstain: false },
  LIVE_SUBSTITUTE_ONLY: { liveSubstitute: true, holdDelta: false, holdAbstain: false },
  HOLD_ONLY: { liveSubstitute: false, holdDelta: true, holdAbstain: true },
  HOLD_DELTA_ONLY: { liveSubstitute: false, holdDelta: true, holdAbstain: false },
  HOLD_ABSTAIN_ONLY: { liveSubstitute: false, holdDelta: false, holdAbstain: true },
  LIVE_SUBSTITUTE_AND_HOLD_DELTA: { liveSubstitute: true, holdDelta: true, holdAbstain: false },
  BOTH: { liveSubstitute: true, holdDelta: true, holdAbstain: true },
});

/* THE VARIANT THE EVIDENCE SELECTED, and why it is not "both fixes on".
 *
 * The Phase 8 ablation over all 15,817 decidable cases measured:
 *
 *   INHERITED                        0.790858     net    0
 *   LIVE_SUBSTITUTE_ONLY             0.809825     net +300   (0 breaks)
 *   HOLD_DELTA_ONLY                  0.822533     net +501
 *   HOLD_ABSTAIN_ONLY                0.731808     net -934   (0 fixes)
 *   LIVE_SUBSTITUTE_AND_HOLD_DELTA   0.829108     net +605   <- selected
 *   BOTH (delta + abstain)           0.764557     net -416
 *
 * The abstention gate is the one mechanism that only ever loses here, and the
 * reason is structural rather than a defect in the idea: the Stage 2L.12 corpus is
 * DECIDABILITY-FILTERED, meaning a case is included only when some action strictly
 * beats holding. HOLD is therefore never the optimal answer in this population —
 * `holdCorrect` is 0 for every variant — so any mechanism that increases
 * abstention can only convert right answers into wrong ones.
 *
 * That is a limit of what this corpus can measure, NOT evidence that comparing
 * against inaction is wrong. The merit of refusing to act remains untested here
 * and would need a corpus containing cases where holding is correct. What this
 * corpus CAN measure is the other half of the same idea — crediting an
 * intervention only with value it would newly bring online — and that half is the
 * single strongest correction found.
 */
export const STAGE2L17_SELECTED_VARIANT = 'LIVE_SUBSTITUTE_AND_HOLD_DELTA';

export const STAGE2L17_REMEDIATION_MODEL = deepFreeze({
  id: 'STAGE2L17_LIVE_SUBSTITUTE_AND_HOLD_BASELINE_V1',
  basedOn: 'STAGE2L13_VALUE_AWARE_RELATIONAL_UTILITY_V1',
  corrections: [
    {
      id: 'LIVE_SUBSTITUTE_REQUIREMENT',
      replaces: 'addressesTarget = substitutes.length > 0',
      with: 'addressesTarget = at least one substitute would deliver once its availability is restored',
      usesOnly: ['baseCapacity', 'demand', 'prerequisite closure', 'availability'],
      readsGroundTruth: false,
    },
    {
      id: 'DO_NOTHING_BASELINE_DELTA',
      replaces: 'benefit = sum of downstream objective value',
      with: 'benefit = sum of downstream objective value NOT ALREADY DELIVERING',
      usesOnly: ['prerequisite closure', 'availability', 'baseCapacity', 'demand'],
      readsGroundTruth: false,
      selected: true,
    },
    {
      id: 'DO_NOTHING_BASELINE_ABSTENTION',
      replaces: 'act whenever the private score clears zero',
      with: 'act only when the estimated gain over inaction is positive',
      usesOnly: ['prerequisite closure', 'availability', 'baseCapacity', 'demand', 'restorationCost'],
      readsGroundTruth: false,
      selected: false,
      notSelectedBecause: 'The corpus is decidability-filtered, so HOLD is never optimal and any added abstention is necessarily wrong. Measured net -934 with zero fixes. Its merit is untestable on this corpus rather than disproven.',
    },
  ],
  importsBenchmarkScoring: false,
  usesFixedPointReasoning: false,
  operationalThreshold: STAGE2L17_NEXUS_OPERATIONAL_THRESHOLD,
});
export const STAGE2L17_REMEDIATION_MODEL_DIGEST = sha256(STAGE2L17_REMEDIATION_MODEL);

function integerOr(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

/* ---------------------------------------------------------------------------
 * Relational index — identical in construction to the inherited expert's.
 * ------------------------------------------------------------------------- */

export function buildStage2L17Index(world) {
  const entities = [...world.entities].sort((left, right) => left.entityId.localeCompare(right.entityId));
  const relations = [...world.relations].sort((left, right) => left.relationId.localeCompare(right.relationId));
  const byId = new Map(entities.map((entity) => [entity.entityId, entity]));
  const dependents = new Map(entities.map((entity) => [entity.entityId, []]));
  const prerequisites = new Map(entities.map((entity) => [entity.entityId, []]));
  const substitutesFor = new Map();
  const protects = new Map(entities.map((entity) => [entity.entityId, []]));
  const contradicts = new Map(entities.map((entity) => [entity.entityId, 0]));
  const supports = new Map(entities.map((entity) => [entity.entityId, []]));

  for (const relation of relations) {
    if (!byId.has(relation.from) || !byId.has(relation.to)) continue;
    if (relation.kind === 'depends') {
      dependents.get(relation.from).push(relation.to);
      prerequisites.get(relation.to).push(relation.from);
    } else if (relation.kind === 'substitutes' && relation.replaces) {
      if (!substitutesFor.has(relation.replaces)) substitutesFor.set(relation.replaces, []);
      substitutesFor.get(relation.replaces).push(relation.from);
    } else if (relation.kind === 'protects') {
      protects.get(relation.to).push(relation.from);
    } else if (relation.kind === 'supports') {
      supports.get(relation.to).push(relation.from);
    } else if (relation.kind === 'conflicts' || relation.kind === 'inhibits') {
      contradicts.set(relation.to, (contradicts.get(relation.to) ?? 0) + 1);
    }
  }
  return { entities, relations, byId, dependents, prerequisites, substitutesFor, protects, supports, contradicts };
}

/** The inherited coarse blocked test, unchanged. Deliberately not the world's rule. */
export function blockingReasons(entity) {
  const reasons = [];
  if (integerOr(entity.availability, 0) < STAGE2L17_NEXUS_OPERATIONAL_THRESHOLD) reasons.push('UNAVAILABLE');
  if (integerOr(entity.baseCapacity, 0) < integerOr(entity.demand, 0)) reasons.push('STARVED');
  return reasons;
}

function downstreamOf(index, start) {
  const seen = new Set([start]);
  const queue = [start];
  const out = [];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of [...(index.dependents.get(node) ?? [])].sort()) {
      if (seen.has(next)) continue;
      seen.add(next);
      out.push(next);
      queue.push(next);
    }
  }
  return out;
}

function remainingBlockers(index, valuable, target) {
  const seen = new Set([valuable]);
  const queue = [valuable];
  let count = 0;
  while (queue.length > 0) {
    const node = queue.shift();
    for (const prerequisite of [...(index.prerequisites.get(node) ?? [])].sort()) {
      if (seen.has(prerequisite)) continue;
      seen.add(prerequisite);
      queue.push(prerequisite);
      if (prerequisite === target) continue;
      const entity = index.byId.get(prerequisite);
      if (entity && blockingReasons(entity).length > 0) count += 1;
    }
  }
  const own = index.byId.get(valuable);
  if (own && valuable !== target && blockingReasons(own).length > 0) count += 1;
  return count;
}

/* ---------------------------------------------------------------------------
 * CORRECTION 1 — live substitute validation.
 *
 * The world's BYPASS makes every substitute of the target AVAILABLE. So the
 * decision-time question is not "is this substitute delivering now" but "would it
 * deliver once availability is no longer its problem". Two conditions, both read
 * straight off canonical state:
 *
 *   - it has the capacity it needs (baseCapacity >= demand), and
 *   - nothing on its own prerequisite closure is blocked.
 *
 * A substitute failing either cannot carry the dependency however available it is
 * made, so a BYPASS resting only on such substitutes buys nothing.
 * ------------------------------------------------------------------------- */

export function substituteWouldCarry(index, substituteId) {
  const substitute = index.byId.get(substituteId);
  if (substitute === undefined) return false;
  /* Availability is excluded on purpose: BYPASS repairs exactly that. Judging a
   * substitute unusable because it is unavailable would reject the one case the
   * action exists to handle. */
  if (integerOr(substitute.baseCapacity, 0) < integerOr(substitute.demand, 0)) return false;
  const seen = new Set([substituteId]);
  const queue = [substituteId];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const prerequisite of [...(index.prerequisites.get(node) ?? [])].sort()) {
      if (seen.has(prerequisite)) continue;
      seen.add(prerequisite);
      queue.push(prerequisite);
      const entity = index.byId.get(prerequisite);
      if (entity && blockingReasons(entity).length > 0) return false;
    }
  }
  return true;
}

export function summariseSubstitutes(index, targetEntityId) {
  const substitutes = index.substitutesFor.get(targetEntityId) ?? [];
  const live = substitutes.filter((id) => substituteWouldCarry(index, id));
  return {
    substituteCount: substitutes.length,
    liveSubstituteCount: live.length,
    substituteCoverage: substitutes.length === 0 ? 0 : Math.round((live.length * MICRO) / substitutes.length),
    bypassSupportValid: live.length > 0,
    bypassReason: substitutes.length === 0 ? 'NO_SUBSTITUTE_RELATION'
      : live.length > 0 ? 'LIVE_SUBSTITUTE_AVAILABLE'
        : 'ALL_SUBSTITUTES_CANNOT_CARRY',
  };
}

/* ---------------------------------------------------------------------------
 * CORRECTION 2 — the do-nothing baseline.
 *
 * An entity whose whole prerequisite closure, itself included, is unblocked is
 * ALREADY delivering its value. Crediting an intervention with that value counts
 * something the world would have had anyway. The baseline is the sum of such
 * value; an intervention is credited only with what it would ADD.
 * ------------------------------------------------------------------------- */

export function alreadyDelivering(index, entityId) {
  const own = index.byId.get(entityId);
  if (own === undefined) return false;
  if (blockingReasons(own).length > 0) return false;
  const seen = new Set([entityId]);
  const queue = [entityId];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const prerequisite of [...(index.prerequisites.get(node) ?? [])].sort()) {
      if (seen.has(prerequisite)) continue;
      seen.add(prerequisite);
      queue.push(prerequisite);
      const entity = index.byId.get(prerequisite);
      if (entity && blockingReasons(entity).length > 0) return false;
    }
  }
  return true;
}

export function estimateHoldBaseline(index) {
  let deliveredValue = 0;
  let deliveringBearers = 0;
  let blockedValue = 0;
  let blockedBearers = 0;
  for (const entity of index.entities) {
    const value = integerOr(entity.objectiveValue, 0);
    if (value <= 0) continue;
    if (alreadyDelivering(index, entity.entityId)) { deliveredValue += value; deliveringBearers += 1; }
    else { blockedValue += value; blockedBearers += 1; }
  }
  return {
    holdBaselineSchema: 'NEXUS_HOLD_BASELINE_V1',
    estimatedDeliveredValue: deliveredValue,
    deliveringBearerCount: deliveringBearers,
    estimatedRecoverableValue: blockedValue,
    blockedBearerCount: blockedBearers,
    /* Nexus's own estimate of what inaction is worth. It is an ESTIMATE and can be
     * wrong; it is not a guarantee that holding is correct. */
    holdUtilityEstimate: 0,
    nothingToRecover: blockedValue === 0,
  };
}

/* ---------------------------------------------------------------------------
 * The relational utility estimate.
 *
 * Structurally identical to the inherited scorer. The two corrections are guarded
 * by `variant` flags so the INHERITED setting reproduces Stage 2L.13 exactly and
 * the ablation can attribute every change to one mechanism.
 * ------------------------------------------------------------------------- */

export function scoreStage2L17RelationalUtility(world, action, index, variant) {
  const zero = {
    actionId: action.actionId,
    kind: action.kind,
    targetEntityId: action.targetEntityId ?? null,
    structuralImportance: 0,
    objectiveRelevance: 0,
    relationalBenefit: 0,
    actionCostPenalty: 0,
    riskAdjustment: 0,
    redundancyAdjustment: 0,
    remainingBlockerCount: 0,
    objectiveSupportCount: 0,
    contradictionCount: 0,
    semanticFieldsComplete: true,
    substituteCount: 0,
    liveSubstituteCount: 0,
    substituteCoverage: 0,
    bypassSupportValid: false,
    bypassReason: 'NOT_A_BYPASS',
    alreadyDeliveringValue: 0,
    newlyDeliveredValue: 0,
    finalRelationalUtility: 0,
  };
  if (action.kind === 'HOLD' || action.targetEntityId === null) return zero;

  const target = index.byId.get(action.targetEntityId);
  if (target === undefined) return { ...zero, semanticFieldsComplete: false };

  const required = ['objectiveValue', 'demand', 'baseCapacity', 'availability', 'risk', 'protectionNeed', 'restorationCost'];
  const complete = required.every((field) => Number.isFinite(target[field]) && Number.isInteger(target[field]) && target[field] >= 0);
  if (!complete) return { ...zero, semanticFieldsComplete: false };

  const downstream = downstreamOf(index, target.entityId);
  const structuralImportance = downstream.length;
  const bearers = [target.entityId, ...downstream]
    .map((id) => index.byId.get(id))
    .filter((entity) => entity !== undefined && integerOr(entity.objectiveValue, 0) > 0);
  const objectiveRelevance = bearers.reduce((sum, entity) => sum + integerOr(entity.objectiveValue, 0), 0);

  const targetBlocks = blockingReasons(target);
  const substituteIds = index.substitutesFor.get(target.entityId) ?? [];
  const substituteSummary = summariseSubstitutes(index, target.entityId);

  let addressesTarget = false;
  if (action.kind === 'RESTORE') addressesTarget = targetBlocks.includes('UNAVAILABLE');
  else if (action.kind === 'REINFORCE') {
    addressesTarget = targetBlocks.includes('STARVED')
      && integerOr(target.baseCapacity, 0) + integerOr(action.reinforceAmount, 0) >= integerOr(target.demand, 0);
  } else if (action.kind === 'BYPASS') {
    /* CORRECTION 1. Inherited: a substitute merely has to exist. Remediated: at
     * least one of them has to be able to carry the dependency once available. */
    addressesTarget = variant.liveSubstitute ? substituteSummary.bypassSupportValid : substituteIds.length > 0;
  }

  let relationalBenefit = 0;
  let redundancyAdjustment = 0;
  let alreadyDeliveringValue = 0;
  let newlyDeliveredValue = 0;
  if (addressesTarget) {
    for (const bearer of bearers) {
      const value = integerOr(bearer.objectiveValue, 0);
      /* CORRECTION 2. Value already flowing is not something an intervention
       * delivers. Measured against the do-nothing baseline, it is worth zero. */
      if (variant.holdDelta && alreadyDelivering(index, bearer.entityId)) {
        alreadyDeliveringValue += value;
        continue;
      }
      const blockers = remainingBlockers(index, bearer.entityId, target.entityId);
      const attenuated = blockers === 0
        ? value
        : Math.round((value * STAGE2L17_BLOCKER_ATTENUATION_NUMERATOR)
          / (STAGE2L17_BLOCKER_ATTENUATION_DENOMINATOR * blockers));
      newlyDeliveredValue += value;
      relationalBenefit += attenuated;
    }
    if (action.kind !== 'BYPASS' && substituteIds.length > 0) {
      const discount = Math.round((relationalBenefit * STAGE2L17_REDUNDANCY_DISCOUNT_NUMERATOR)
        / STAGE2L17_REDUNDANCY_DISCOUNT_DENOMINATOR);
      redundancyAdjustment = -discount;
      relationalBenefit += redundancyAdjustment;
    }
  }

  const protectors = index.protects.get(target.entityId) ?? [];
  const alreadyProtected = protectors.some((id) => {
    const protector = index.byId.get(id);
    return protector !== undefined && blockingReasons(protector).length === 0;
  });
  const exposure = alreadyProtected
    ? 0
    : Math.round((integerOr(target.risk, 0) * integerOr(target.protectionNeed, 0)) / MICRO);
  const riskAdjustment = action.kind === 'PROTECT' ? exposure : 0;
  const actionCostPenalty = integerOr(target.restorationCost, 0);
  const finalRelationalUtility = relationalBenefit + riskAdjustment - actionCostPenalty;

  return {
    actionId: action.actionId,
    kind: action.kind,
    targetEntityId: target.entityId,
    structuralImportance,
    objectiveRelevance,
    relationalBenefit,
    actionCostPenalty,
    riskAdjustment,
    redundancyAdjustment,
    remainingBlockerCount: bearers.reduce((max, bearer) => Math.max(max, remainingBlockers(index, bearer.entityId, target.entityId)), 0),
    objectiveSupportCount: bearers.length,
    contradictionCount: index.contradicts.get(target.entityId) ?? 0,
    semanticFieldsComplete: true,
    substituteCount: substituteSummary.substituteCount,
    liveSubstituteCount: substituteSummary.liveSubstituteCount,
    substituteCoverage: substituteSummary.substituteCoverage,
    bypassSupportValid: action.kind === 'BYPASS' ? substituteSummary.bypassSupportValid : false,
    bypassReason: action.kind === 'BYPASS' ? substituteSummary.bypassReason : 'NOT_A_BYPASS',
    alreadyDeliveringValue,
    newlyDeliveredValue,
    finalRelationalUtility,
  };
}

/* ---------------------------------------------------------------------------
 * The expert.
 * ------------------------------------------------------------------------- */

export function evaluateStage2L17Nexus(world, legalActions, options = {}) {
  const variantName = options.variant ?? STAGE2L17_SELECTED_VARIANT;
  const variant = STAGE2L17_VARIANTS[variantName];
  if (variant === undefined) throw new Error(`STAGE2L17_UNKNOWN_VARIANT:${variantName}`);

  const index = buildStage2L17Index(world);
  const ordered = [...legalActions].sort((left, right) => left.actionId.localeCompare(right.actionId));
  const scored = ordered.map((action) => scoreStage2L17RelationalUtility(world, action, index, variant));

  const actionable = scored.filter((entry) => entry.kind !== 'HOLD' && entry.semanticFieldsComplete);
  const ranked = [...actionable].sort((left, right) =>
    right.finalRelationalUtility - left.finalRelationalUtility
    || right.objectiveRelevance - left.objectiveRelevance
    || left.actionId.localeCompare(right.actionId));

  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;

  const holdBaseline = estimateHoldBaseline(index);
  /* CORRECTION 2, second half. Inherited: act whenever the private score clears
   * zero. Remediated: act only when the estimated gain over doing nothing is
   * positive AND there is something to recover at all. The estimate can be wrong
   * — HOLD is a candidate here, not an automatic winner. */
  const recommends = top === null ? false
    : variant.holdAbstain
      ? top.finalRelationalUtility > holdBaseline.holdUtilityEstimate && !holdBaseline.nothingToRecover
      : top.finalRelationalUtility > 0;

  const structuralRanked = [...actionable].sort((left, right) =>
    right.structuralImportance - left.structuralImportance
    || left.actionId.localeCompare(right.actionId));
  const structuralTop = structuralRanked[0] ?? null;

  const semanticCoverage = scored.length === 0
    ? 0
    : Math.round((scored.filter((entry) => entry.semanticFieldsComplete).length * MICRO) / scored.length);

  let perturbationStable = true;
  if (recommends) {
    const perturbed = actionable.map((entry) => ({
      actionId: entry.actionId,
      value: entry.finalRelationalUtility - Math.round(entry.actionCostPenalty / 10),
    })).sort((left, right) => right.value - left.value || left.actionId.localeCompare(right.actionId));
    perturbationStable = perturbed[0]?.actionId === top.actionId;
  }

  /* The inherited confidence block, carried through byte-compatible so the Stage
   * 2L.14 and 2L.15 machinery consumes it unchanged. New fields are ADDITIVE. */
  const signals = {
    signalVersion: 1,
    kind: 'NEXUS_RELATIONAL_UTILITY_V1',
    nexusUtilityMargin: top === null ? 0 : top.finalRelationalUtility - (second === null ? 0 : second.finalRelationalUtility),
    nexusTopUtility: top === null ? 0 : top.finalRelationalUtility,
    nexusTopObjectiveRelevance: top === null ? 0 : top.objectiveRelevance,
    nexusTopStructuralImportance: top === null ? 0 : top.structuralImportance,
    nexusTopCostPenalty: top === null ? 0 : top.actionCostPenalty,
    nexusTopRiskAdjustment: top === null ? 0 : top.riskAdjustment,
    nexusTopRedundancyAdjustment: top === null ? 0 : top.redundancyAdjustment,
    remainingBlockerCount: top === null ? 0 : top.remainingBlockerCount,
    objectiveSupportCount: top === null ? 0 : top.objectiveSupportCount,
    contradictionCount: top === null ? 0 : top.contradictionCount,
    structuralSemanticAlignment: top !== null && structuralTop !== null && top.actionId === structuralTop.actionId,
    positiveUtilityCandidateCount: actionable.filter((entry) => entry.finalRelationalUtility > 0).length,
    candidateCount: actionable.length,
    semanticCoverage,
    semanticFieldsIncompleteCount: scored.filter((entry) => !entry.semanticFieldsComplete).length,
    perturbationStable,
    abstained: !recommends,
    // Additive Stage 2L.17 fields. Deterministic, bounded, decision-time.
    nexusSubstituteCount: top === null ? 0 : top.substituteCount,
    nexusLiveSubstituteCount: top === null ? 0 : top.liveSubstituteCount,
    nexusSubstituteCoverage: top === null ? 0 : top.substituteCoverage,
    nexusBypassSupportValid: top === null ? false : top.bypassSupportValid,
    nexusHoldUtilityEstimate: holdBaseline.holdUtilityEstimate,
    nexusEstimatedDeliveredValue: holdBaseline.estimatedDeliveredValue,
    nexusEstimatedRecoverableValue: holdBaseline.estimatedRecoverableValue,
    nexusGainOverHold: top === null ? 0 : top.finalRelationalUtility - holdBaseline.holdUtilityEstimate,
  };

  return deepFreeze({
    expertId: STAGE2L17_EXPERT_ID,
    expertVersion: STAGE2L17_EXPERT_VERSION,
    modelDigest: STAGE2L17_REMEDIATION_MODEL_DIGEST,
    variant: variantName,
    recommendedActionId: recommends ? top.actionId : null,
    abstained: !recommends,
    scored,
    ranked: ranked.map((entry) => entry.actionId),
    decomposition: top,
    holdBaseline,
    signals,
    advisoryOnly: true,
    actionGeneration: false,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
  });
}
