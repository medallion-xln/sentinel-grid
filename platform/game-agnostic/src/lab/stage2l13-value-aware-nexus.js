/* Stage 2L.13 — Value-aware Nexus relational utility expert (R0, advisory only).
 *
 * THE MEASURED DEFECT THIS ADDRESSES. Stage 2L.12 rebuilt the Nexus benchmark on
 * deterministic world semantics and measured the inherited expert at 0.0844 where
 * Prime scored 0.3946, random 0.1667 and the best trivial policy 0.3931. A source
 * audit confirmed why: of the eight semantic fields the canonical state carries —
 * objectiveValue, demand, baseCapacity, availability, risk, protectionNeed,
 * restorationCost, objectiveRelevant — the entire Nexus path reads NONE. It reads
 * two booleans (`critical`, `hostile`) and edge kinds. Optimality is set by value,
 * cost and risk; Nexus was reasoning only about shape.
 *
 * WHAT CHANGES. Nexus stops asking "which entity is structurally important?" and
 * starts asking "which relational intervention has the best objective consequence,
 * given structure, value, cost, risk, redundancy and dependencies?"
 *
 * WHAT DELIBERATELY DOES NOT CHANGE. This file imports NOTHING from the Stage
 * 2L.12 benchmark. Not its objective function, not its action-consequence
 * transform, not its ground-truth derivation, not its corpus. That separation is
 * structural and is asserted by test: an expert that called the scoring function
 * would score well and mean nothing.
 *
 * HOW IT STAYS AN EXPERT RATHER THAN AN ORACLE. Nexus builds its OWN approximate
 * model of consequence from raw world fields, and that model is deliberately
 * weaker than the truth in ways that produce real, interpretable errors:
 *
 *   - it uses its own declared operational threshold (0.5), not the world's
 *     delivery threshold, so it misjudges entities near the boundary;
 *   - it does a single-pass blocking analysis, not the world's recursive fixed
 *     point, so deep multi-blocker chains defeat it;
 *   - it has no semantics for `amplifies` or `conflicts` and ignores them;
 *   - it approximates capacity as baseCapacity vs demand, ignoring the capacity
 *     that `supports` edges contribute.
 *
 * Using the same raw quantities the benchmark uses is not leakage. Deriving its
 * own interpretation of them is exactly what an expert is for.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { evaluateNexus } from '../experts/nexus.js';

export const STAGE2L13_EXPERT_ID = 'sentinel-nexus-value-aware-relational-utility';
export const STAGE2L13_EXPERT_VERSION = 1;

const MICRO = 1000000;

/* Nexus's OWN declared operational threshold. Deliberately not the world's
 * delivery threshold: an expert that happened to know the environment's exact
 * constant would be reading the answer key. Set at the natural midpoint, decided
 * a priori and never tuned against a score. */
export const STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD = 500000;

/* Redundancy discount: acting on a target that already has an alternate path is
 * worth less, but not nothing — the alternate may itself be fragile. */
export const STAGE2L13_REDUNDANCY_DISCOUNT_NUMERATOR = 1;
export const STAGE2L13_REDUNDANCY_DISCOUNT_DENOMINATOR = 4;

/* Per-blocker attenuation. A chain still blocked elsewhere yields less than a
 * chain this action would fully clear. Integer arithmetic keeps it exact. */
export const STAGE2L13_BLOCKER_ATTENUATION_NUMERATOR = 1;
export const STAGE2L13_BLOCKER_ATTENUATION_DENOMINATOR = 3;

export const STAGE2L13_RELATIONAL_UTILITY_MODEL = deepFreeze({
  schemaVersion: 1,
  id: 'STAGE2L13_VALUE_AWARE_RELATIONAL_UTILITY_V1',
  expertId: STAGE2L13_EXPERT_ID,
  expertVersion: STAGE2L13_EXPERT_VERSION,
  scale: MICRO,
  components: [
    'structuralImportance',
    'objectiveRelevance',
    'relationalBenefit',
    'actionCostPenalty',
    'riskAdjustment',
    'redundancyAdjustment',
    'finalRelationalUtility',
  ],
  composition: 'finalRelationalUtility = relationalBenefit + riskAdjustment - actionCostPenalty',
  benefitRule: 'value of objective-bearing entities downstream of the target that this action would unblock, attenuated per remaining blocker on the path and discounted where an alternate path exists',
  approximations: [
    'expert-declared operational threshold, not the world delivery threshold',
    'single-pass blocking analysis, no recursive fixed point',
    'no semantics for amplifies or conflicts',
    'capacity approximated as baseCapacity vs demand, ignoring supports contributions',
  ],
  importsBenchmarkScoring: false,
  readsGroundTruth: false,
  readsOptimalAction: false,
  readsCorpusIdentity: false,
  advisoryOnly: true,
  actionGeneration: false,
  authorityTier: 'R0',
});
export const STAGE2L13_RELATIONAL_UTILITY_MODEL_DIGEST = sha256(STAGE2L13_RELATIONAL_UTILITY_MODEL);

function integerOr(value, fallback) { return Number.isFinite(value) && Number.isInteger(value) ? value : fallback; }

/* ---------------------------------------------------------------------------
 * Relational index. Built once per world, deterministic, order-independent.
 * ------------------------------------------------------------------------- */

function buildIndex(world) {
  const entities = [...world.entities].sort((left, right) => left.entityId.localeCompare(right.entityId));
  const relations = [...world.relations].sort((left, right) => left.relationId.localeCompare(right.relationId));
  const byId = new Map(entities.map((entity) => [entity.entityId, entity]));
  const dependents = new Map(entities.map((entity) => [entity.entityId, []]));   // target -> things that depend on it
  const prerequisites = new Map(entities.map((entity) => [entity.entityId, []])); // target -> what it depends on
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
      /* Nexus has no quantitative semantics for these. It counts them as
       * contradiction rather than pretending to price them. */
      contradicts.set(relation.to, (contradicts.get(relation.to) ?? 0) + 1);
    }
  }
  return { entities, relations, byId, dependents, prerequisites, substitutesFor, protects, supports, contradicts };
}

/* Nexus's own, coarse judgement of whether an entity is currently held back.
 * Deliberately not the world's delivery rule. */
function blockingReasons(entity) {
  const reasons = [];
  if (integerOr(entity.availability, 0) < STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD) reasons.push('UNAVAILABLE');
  if (integerOr(entity.baseCapacity, 0) < integerOr(entity.demand, 0)) reasons.push('STARVED');
  return reasons;
}

/** Entities that depend on `start`, transitively. Deterministic BFS. */
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

/** Blockers other than `target` sitting on the prerequisite closure of `valuable`. */
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
 * The relational utility estimate.
 *
 * Decomposed on purpose. A single opaque scalar would be unauditable, and the
 * Arbiter's whole design rests on being able to inspect why an expert believes
 * what it believes.
 * ------------------------------------------------------------------------- */

export function scoreRelationalUtility(world, action, index = buildIndex(world)) {
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
    finalRelationalUtility: 0,
  };
  if (action.kind === 'HOLD' || action.targetEntityId === null) return zero;

  const target = index.byId.get(action.targetEntityId);
  if (target === undefined) return { ...zero, semanticFieldsComplete: false };

  /* Fail closed on incomplete semantics rather than inventing values. An expert
   * that hallucinates a missing cost is worse than one that declines. */
  const required = ['objectiveValue', 'demand', 'baseCapacity', 'availability', 'risk', 'protectionNeed', 'restorationCost'];
  const complete = required.every((field) => Number.isFinite(target[field]) && Number.isInteger(target[field]) && target[field] >= 0);
  if (!complete) return { ...zero, semanticFieldsComplete: false };

  // 1. STRUCTURAL IMPORTANCE — how much of the graph hangs off this entity.
  const downstream = downstreamOf(index, target.entityId);
  const structuralImportance = downstream.length;

  // 2. OBJECTIVE RELEVANCE — structure crossed with value. The new capability.
  const bearers = [target.entityId, ...downstream]
    .map((id) => index.byId.get(id))
    .filter((entity) => entity !== undefined && integerOr(entity.objectiveValue, 0) > 0);
  const objectiveRelevance = bearers.reduce((sum, entity) => sum + integerOr(entity.objectiveValue, 0), 0);

  // 3. RELATIONAL BENEFIT — what this specific intervention would unblock.
  const targetBlocks = blockingReasons(target);
  const substitutes = index.substitutesFor.get(target.entityId) ?? [];
  let addressesTarget = false;
  if (action.kind === 'RESTORE') addressesTarget = targetBlocks.includes('UNAVAILABLE');
  else if (action.kind === 'REINFORCE') {
    addressesTarget = targetBlocks.includes('STARVED')
      && integerOr(target.baseCapacity, 0) + integerOr(action.reinforceAmount, 0) >= integerOr(target.demand, 0);
  } else if (action.kind === 'BYPASS') addressesTarget = substitutes.length > 0;

  let relationalBenefit = 0;
  let redundancyAdjustment = 0;
  if (addressesTarget) {
    for (const bearer of bearers) {
      /* Would this bearer actually come good? Only if nothing else on its
       * prerequisite closure is still blocked. Chains still blocked elsewhere are
       * attenuated, not dismissed — Nexus is uncertain, not omniscient. */
      const blockers = remainingBlockers(index, bearer.entityId, target.entityId);
      const value = integerOr(bearer.objectiveValue, 0);
      const attenuated = blockers === 0
        ? value
        : Math.round((value * STAGE2L13_BLOCKER_ATTENUATION_NUMERATOR)
          / (STAGE2L13_BLOCKER_ATTENUATION_DENOMINATOR * blockers));
      relationalBenefit += attenuated;
    }
    /* 6. REDUNDANCY ADJUSTMENT — an alternate path already exists, so the
     * intervention is worth less. BYPASS is exempt: the substitute IS the point. */
    if (action.kind !== 'BYPASS' && substitutes.length > 0) {
      const discount = Math.round((relationalBenefit * STAGE2L13_REDUNDANCY_DISCOUNT_NUMERATOR)
        / STAGE2L13_REDUNDANCY_DISCOUNT_DENOMINATOR);
      redundancyAdjustment = -discount;
      relationalBenefit += redundancyAdjustment;
    }
  }

  // 5. RISK — the exposure this action removes. Protection already standing counts.
  const protectors = index.protects.get(target.entityId) ?? [];
  const alreadyProtected = protectors.some((id) => {
    const protector = index.byId.get(id);
    return protector !== undefined && blockingReasons(protector).length === 0;
  });
  const exposure = alreadyProtected
    ? 0
    : Math.round((integerOr(target.risk, 0) * integerOr(target.protectionNeed, 0)) / MICRO);
  const riskAdjustment = action.kind === 'PROTECT' ? exposure : 0;

  // 4. COST — bounded, taken straight from the entity.
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
    finalRelationalUtility,
  };
}

/* ---------------------------------------------------------------------------
 * The expert.
 *
 * Returns a recommendation plus a decomposed self-assessment. Every confidence
 * signal is Nexus-derived and decision-time; none is the benchmark's
 * optimal-minus-runner-up. `nexusUtilityMargin` is Nexus's OWN first-versus-second
 * estimate and is named so it cannot be confused with the benchmark quantity.
 * ------------------------------------------------------------------------- */

export function evaluateValueAwareNexus(world, legalActions, options = {}) {
  const index = buildIndex(world);
  const ordered = [...legalActions].sort((left, right) => left.actionId.localeCompare(right.actionId));
  const scored = ordered.map((action) => scoreRelationalUtility(world, action, index));

  const actionable = scored.filter((entry) => entry.kind !== 'HOLD' && entry.semanticFieldsComplete);
  const ranked = [...actionable].sort((left, right) =>
    right.finalRelationalUtility - left.finalRelationalUtility
    || right.objectiveRelevance - left.objectiveRelevance
    || left.actionId.localeCompare(right.actionId));

  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  /* Nexus declines when nothing it can see is worth doing. It does not guess. */
  const recommends = top !== null && top.finalRelationalUtility > 0;

  // Structural-only pick, so alignment between shape and utility is measurable.
  const structuralRanked = [...actionable].sort((left, right) =>
    right.structuralImportance - left.structuralImportance
    || left.actionId.localeCompare(right.actionId));
  const structuralTop = structuralRanked[0] ?? null;

  const semanticCoverage = scored.length === 0
    ? 0
    : Math.round((scored.filter((entry) => entry.semanticFieldsComplete).length * MICRO) / scored.length);

  /* Robustness: does the pick survive a bounded, deterministic perturbation of
   * cost? A recommendation that flips under a 10% cost nudge is a fragile one,
   * and Nexus should say so rather than present it as firm. */
  let perturbationStable = true;
  if (recommends) {
    const perturbed = actionable.map((entry) => ({
      actionId: entry.actionId,
      value: entry.finalRelationalUtility - Math.round(entry.actionCostPenalty / 10),
    })).sort((left, right) => right.value - left.value || left.actionId.localeCompare(right.actionId));
    perturbationStable = perturbed[0]?.actionId === top.actionId;
  }

  const inherited = options.inheritedSignals === false ? null : (() => {
    try {
      return evaluateNexus({
        canonicalState: {
          entities: index.entities.map((entity) => ({ id: entity.entityId, critical: entity.objectiveRelevant === true, hostile: false })),
          relationships: index.relations.map((relation) => ({
            id: relation.relationId, from: relation.from, to: relation.to,
            kind: relation.kind === 'depends' ? 'depends' : relation.kind === 'supports' ? 'supports' : relation.kind === 'conflicts' ? 'threatens' : 'depends',
          })),
        },
        legalActions: ordered.map((action) => ({ actionId: action.actionId, targetEntityId: action.targetEntityId ?? undefined })),
      });
    } catch { return null; }
  })();

  const signals = {
    signalVersion: 1,
    kind: 'NEXUS_RELATIONAL_UTILITY_V1',
    // Nexus's OWN first-versus-second estimate. Not the benchmark margin.
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
    // Does shape agree with utility? Disagreement is where old Nexus went wrong.
    structuralSemanticAlignment: top !== null && structuralTop !== null && top.actionId === structuralTop.actionId,
    positiveUtilityCandidateCount: actionable.filter((entry) => entry.finalRelationalUtility > 0).length,
    candidateCount: actionable.length,
    semanticCoverage,
    semanticFieldsIncompleteCount: scored.filter((entry) => !entry.semanticFieldsComplete).length,
    perturbationStable,
    abstained: !recommends,
  };

  return deepFreeze({
    expertId: STAGE2L13_EXPERT_ID,
    expertVersion: STAGE2L13_EXPERT_VERSION,
    modelDigest: STAGE2L13_RELATIONAL_UTILITY_MODEL_DIGEST,
    recommendedActionId: recommends ? top.actionId : null,
    abstained: !recommends,
    scored,
    ranked: ranked.map((entry) => entry.actionId),
    decomposition: top,
    signals,
    inheritedStructuralSignals: inherited === null ? null : { ...inherited.signals, inheritedConfidence: inherited.confidence },
    advisoryOnly: true,
    actionGeneration: false,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
  });
}
