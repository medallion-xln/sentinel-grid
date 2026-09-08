/* Stage 2L.16 — Nexus high-confidence residual error decomposition and
 * risk-aware reasoning diagnosis (R0, shadow only, DIAGNOSTIC).
 *
 * WHY THIS STAGE EXISTS. Stage 2L.13 made Nexus accurate (0.7826). Stage 2L.14
 * showed its confidence is meaningful but never reaches the inherited 0.99 floor
 * on a supported region. Stage 2L.15 added decision stability, which genuinely
 * improved discrimination (0.6245 -> 0.6744) yet still delivered only 0.9894, and
 * established the reason: inside the high-confidence region the errors are NOT
 * less stable than the successes. Confidence mining is therefore exhausted. The
 * remaining question is not "how do we detect the errors" but "what reasoning
 * failure produces them".
 *
 * WHAT THIS STAGE DOES, AND DOES NOT. It diagnoses. It changes NO decision
 * behaviour: the Stage 2L.13 expert is imported frozen, is never modified, and
 * every diagnostic estimator here is a separate function that no expert, arbiter
 * or delegation path consumes. The certify script pins the expert's hash and
 * proves the frozen output is bit-identical before and after this module loads.
 *
 * THE METHOD, AND WHY IT IS TRUSTWORTHY. An early draft of this analysis
 * reimplemented the Nexus scorer so mechanisms could be switched on and off. That
 * reimplementation agreed with the frozen expert on only 98.5% of cases, which is
 * enough divergence to invent or hide a defect. It was discarded. Every mechanism
 * probe here instead takes the FROZEN expert's own `scored` decomposition and adds
 * a single additive delta before re-ranking, so the baseline reproduces the expert
 * exactly by construction — `M0_FROZEN_BASELINE` is asserted to agree on 100% of
 * cases, and the certification fails if it ever does not.
 *
 * NO LEAKAGE. Every diagnostic predicate and every probe delta is computed from
 * world state alone. Ground truth is read only to LABEL an outcome after the fact
 * and to decompose the objective for attribution reporting — never inside a
 * predicate, a delta, or a ranking.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import {
  buildStage2L12Case,
  objectiveUtility,
  applyAction,
  STAGE2L12_AVAILABILITY_THRESHOLD,
  primeRecommendation,
} from './stage2l12-nexus-semantic-grounding-and-observable-utility.js';
import {
  evaluateValueAwareNexus,
  STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD,
} from './stage2l13-value-aware-nexus.js';

export const STAGE2L16_STAGE = 'STAGE2L16_NEXUS_RESIDUAL_ERROR_DECOMPOSITION';
export const STAGE2L16_STAGE2L15_CERTIFICATION_HASH = '7a7adf020b5e2e7d325d3b6192a23870e4b49b898ef108e3b63124ce13fb1fe9';
export const STAGE2L16_STAGE2L14_CERTIFICATION_HASH = '96e10b32d8ca0ae2a36e252c72dd253df6504d331d1d4baa25584077631c6ac3';
export const STAGE2L16_STAGE2L13_CERTIFICATION_HASH = '0b7f44d8874d0dfd831dfe7d05571735a62dbbcd689e89c77e3b377e636734c6';

const MICRO = 1000000;
function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }

/* The full holdout the Nexus arc has used since Stage 2L.12, decidable cases
 * only. Stage 2L.14 and 2L.15 partitioned this same range into DEVELOPMENT,
 * CALIBRATION and FINAL_HOLDOUT; a diagnostic stage that changes no thresholds
 * has nothing to select, so it reads the whole range and reports per-split
 * figures for comparability. */
export const STAGE2L16_CORPUS = deepFreeze({ split: 'HOLDOUT', from: 0, to: 42000 });
export const STAGE2L16_SPLIT_BOUNDS = deepFreeze({
  DEVELOPMENT: [0, 14000], CALIBRATION: [14000, 28000], FINAL_HOLDOUT: [28000, 42000],
});

/* The Stage 2L.14 high-confidence region, inherited verbatim. This stage invents
 * no new thresholds — the brief forbids it, and a new threshold would make the
 * residual population incomparable with the one Stage 2L.15 measured. */
export const STAGE2L16_HIGH_CONFIDENCE_RISK = 500000;
export const STAGE2L16_HIGH_CONFIDENCE_MARGIN = 200000;

/* ---------------------------------------------------------------------------
 * World indexing and the propagated-delivery diagnostic.
 *
 * DIAGNOSTIC ONLY. `propagatedDelivery` resolves who is actually delivering in
 * the CURRENT world by iterating dependency, support, inhibition and substitution
 * to a fixed point. No action is applied and no ground truth is consulted, so it
 * reads exactly the state an expert could read at decision time. Nexus's own
 * `blockingReasons` is a single local test (availability, base capacity) with no
 * propagation at all; the gap between the two is the object of Phase 5.
 * ------------------------------------------------------------------------- */

export function indexStage2L16World(world) {
  const byId = new Map(world.entities.map((entity) => [entity.entityId, entity]));
  const dependents = new Map();
  const prerequisites = new Map();
  const protectedBy = new Map();
  const protectsOut = new Map();
  const amplifiers = new Map();
  const supports = new Map();
  const inhibits = new Map();
  const conflicts = new Map();
  const substitutesFor = new Map();
  for (const entity of world.entities) {
    for (const map of [dependents, prerequisites, protectedBy, protectsOut, amplifiers, supports, inhibits, conflicts]) {
      map.set(entity.entityId, []);
    }
  }
  for (const relation of [...world.relations].sort((left, right) => left.relationId.localeCompare(right.relationId))) {
    if (!byId.has(relation.from) || !byId.has(relation.to)) continue;
    if (relation.kind === 'depends') {
      dependents.get(relation.from).push(relation.to);
      prerequisites.get(relation.to).push(relation.from);
    } else if (relation.kind === 'substitutes' && relation.replaces) {
      if (!substitutesFor.has(relation.replaces)) substitutesFor.set(relation.replaces, []);
      substitutesFor.get(relation.replaces).push(relation);
    } else if (relation.kind === 'protects') {
      protectedBy.get(relation.to).push(relation.from);
      protectsOut.get(relation.from).push(relation.to);
    } else if (relation.kind === 'amplifies') amplifiers.get(relation.to).push(relation);
    else if (relation.kind === 'supports') supports.get(relation.to).push(relation);
    else if (relation.kind === 'inhibits') inhibits.get(relation.to).push(relation);
    else if (relation.kind === 'conflicts') conflicts.get(relation.to).push(relation);
  }
  return { byId, dependents, prerequisites, protectedBy, protectsOut, amplifiers, supports, inhibits, conflicts, substitutesFor };
}

export function propagatedDelivery(world, index, threshold = STAGE2L12_AVAILABILITY_THRESHOLD) {
  const delivering = new Map(world.entities.map((entity) => [entity.entityId, false]));
  let passes = 0;
  for (let pass = 0; pass <= world.entities.length; pass += 1) {
    let changed = false;
    passes = pass + 1;
    for (const entity of world.entities) {
      let effective = entity.baseCapacity;
      for (const relation of index.supports.get(entity.entityId)) {
        if (delivering.get(relation.from) === true) effective += relation.weight;
      }
      for (const relation of index.inhibits.get(entity.entityId)) {
        if (delivering.get(relation.from) === true) effective -= relation.weight;
      }
      const met = index.prerequisites.get(entity.entityId).every((dependency) =>
        delivering.get(dependency) === true
        || (index.substitutesFor.get(dependency) ?? []).some((substitute) =>
          substitute.to === entity.entityId && delivering.get(substitute.from) === true));
      const next = entity.availability >= threshold && met && effective >= entity.demand;
      if (delivering.get(entity.entityId) !== next) { delivering.set(entity.entityId, next); changed = true; }
    }
    if (!changed) break;
  }
  return { delivering, passes };
}

/** Nexus's own local blocked test, restated here for contrast. Never exported to
 *  the expert; this is a read-only mirror used to measure the propagation gap. */
export function nexusLocallyBlocked(entity) {
  return entity.availability < STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD
    || entity.baseCapacity < entity.demand;
}

export function downstreamOf(index, start) {
  const seen = new Set([start]);
  const queue = [start];
  const out = [];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of [...index.dependents.get(node)].sort()) {
      if (seen.has(next)) continue;
      seen.add(next);
      out.push(next);
      queue.push(next);
    }
  }
  return out;
}

/** Strongly connected components over the `depends` graph, for cycle analysis. */
export function stronglyConnectedComponents(index) {
  const ids = [...index.byId.keys()].sort();
  const indexOf = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let counter = 0;
  const strongconnect = (root) => {
    /* Iterative Tarjan: the graphs are small but recursion depth is not a thing
     * to gamble a deterministic certification on. */
    const work = [[root, 0]];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const [node, childIndex] = frame;
      if (childIndex === 0) {
        indexOf.set(node, counter); low.set(node, counter); counter += 1;
        stack.push(node); onStack.add(node);
      }
      const children = [...index.dependents.get(node)].sort();
      if (childIndex < children.length) {
        frame[1] += 1;
        const child = children[childIndex];
        if (!indexOf.has(child)) work.push([child, 0]);
        else if (onStack.has(child)) low.set(node, Math.min(low.get(node), indexOf.get(child)));
      } else {
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1][0];
          low.set(parent, Math.min(low.get(parent), low.get(node)));
        }
        if (low.get(node) === indexOf.get(node)) {
          const component = [];
          for (;;) {
            const member = stack.pop();
            onStack.delete(member);
            component.push(member);
            if (member === node) break;
          }
          components.push(component.sort());
        }
      }
    }
  };
  for (const id of ids) if (!indexOf.has(id)) strongconnect(id);
  const cyclic = components.filter((component) => component.length > 1
    || index.dependents.get(component[0]).includes(component[0]));
  return {
    components,
    cyclicComponents: cyclic,
    cycleCount: cyclic.length,
    largestCycleLength: cyclic.reduce((max, component) => Math.max(max, component.length), 0),
    entitiesInCycles: cyclic.reduce((sum, component) => sum + component.length, 0),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 1 — the residual error corpus.
 *
 * Every case is scored once by the FROZEN expert and labelled afterwards. The
 * per-case record carries enough world summary for contrastive matching (Phase 1),
 * the expert's own decomposition (Phase 2), and the objective's decomposition of
 * why the optimum was better (Phase 3).
 * ------------------------------------------------------------------------- */

function splitNameFor(variant) {
  for (const [name, [from, to]] of Object.entries(STAGE2L16_SPLIT_BOUNDS)) {
    if (variant >= from && variant < to) return name;
  }
  return 'UNASSIGNED';
}

/** Concentration of objective value: 0 = perfectly spread, MICRO = all on one
 *  entity. Herfindahl index, integer, computable from state alone. */
export function valueConcentration(world) {
  const values = world.entities.map((entity) => Math.max(0, entity.objectiveValue));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return { concentration: MICRO, bearers: 0, totalValue: 0 };
  const herfindahl = values.reduce((sum, value) => sum + ((value / total) ** 2), 0);
  return {
    concentration: Math.round(herfindahl * MICRO),
    bearers: values.filter((value) => value > 0).length,
    totalValue: total,
  };
}

export function buildStage2L16Row(variant) {
  const record = buildStage2L12Case(STAGE2L16_CORPUS.split, variant);
  if (!record.decidable) return null;
  const expert = evaluateValueAwareNexus(record.world, record.legalActions, { inheritedSignals: false });
  const index = indexStage2L16World(record.world);
  const { delivering, passes } = propagatedDelivery(record.world, index);
  const truth = record.groundTruth;
  const optimalActionId = truth.optimalActionId;
  const chosenActionId = expert.recommendedActionId;
  const signals = expert.signals;
  const byAction = new Map(record.legalActions.map((action) => [action.actionId, action]));
  const byTruth = new Map(truth.scored.map((entry) => [entry.actionId, entry]));
  const holdUtility = truth.scored.find((entry) => entry.kind === 'HOLD')?.actionUtility ?? 0;

  const chosenTruth = chosenActionId === null ? null : byTruth.get(chosenActionId) ?? null;
  const optimalTruth = byTruth.get(optimalActionId) ?? null;

  /* Objective decomposition of WHY the optimum beat the expert's pick. Read from
   * the benchmark's own objective, after the fact, for reporting only. */
  let attribution = null;
  if (chosenActionId !== null && chosenActionId !== optimalActionId) {
    const afterOptimal = objectiveUtility(applyAction(record.world, byAction.get(optimalActionId)));
    const afterChosen = objectiveUtility(applyAction(record.world, byAction.get(chosenActionId)));
    attribution = {
      deliveredAdvantage: afterOptimal.delivered - afterChosen.delivered,
      amplificationAdvantage: afterOptimal.amplification - afterChosen.amplification,
      riskAdvantage: afterChosen.riskPenalty - afterOptimal.riskPenalty,
      conflictAdvantage: afterChosen.conflictPenalty - afterOptimal.conflictPenalty,
      costAdvantage: chosenTruth.cost - optimalTruth.cost,
      deliveringCountAdvantage: afterOptimal.deliveringCount - afterChosen.deliveringCount,
      totalAdvantage: optimalTruth.actionUtility - chosenTruth.actionUtility,
    };
  }

  /* Prime's pick from the INHERITED certified path, so the Nexus-wrong /
   * Prime-correct population is the same one Stage 2L.14 and 2L.15 measured. */
  const primeActionId = primeRecommendation(record).recommendedActionId;

  const concentration = valueConcentration(record.world);
  const cycles = stronglyConnectedComponents(index);
  const aggregateRisk = record.world.entities.reduce((sum, entity) =>
    sum + Math.round((entity.risk * entity.protectionNeed) / MICRO), 0);
  const dependencyDepth = record.world.entities.reduce((max, entity) =>
    Math.max(max, downstreamOf(index, entity.entityId).length), 0);

  /* The propagation gap: entities Nexus believes are fine that are not actually
   * delivering, and vice versa. Purely a comparison of two state readings. */
  let falseHealthy = 0;
  let falseBlocked = 0;
  for (const entity of record.world.entities) {
    const locallyBlocked = nexusLocallyBlocked(entity);
    const actuallyDelivering = delivering.get(entity.entityId) === true;
    if (!locallyBlocked && !actuallyDelivering) falseHealthy += 1;
    if (locallyBlocked && actuallyDelivering) falseBlocked += 1;
  }

  return {
    variant,
    splitName: splitNameFor(variant),
    family: record.family,
    profile: record.profile,
    objectiveType: record.objectiveType,
    entityCount: record.world.entities.length,
    relationCount: record.world.relations.length,
    actionCount: record.legalActions.length,
    dependencyDepth,
    aggregateRisk,
    valueConcentration: concentration.concentration,
    valueBearers: concentration.bearers,
    totalValue: concentration.totalValue,
    cycleCount: cycles.cycleCount,
    largestCycleLength: cycles.largestCycleLength,
    entitiesInCycles: cycles.entitiesInCycles,
    propagationPasses: passes,
    falseHealthyCount: falseHealthy,
    falseBlockedCount: falseBlocked,
    abstained: expert.abstained,
    primeActionId,
    primeCorrect: primeActionId === optimalActionId,
    chosenActionId,
    optimalActionId,
    nexusCorrect: chosenActionId === optimalActionId,
    optimalRankUnderNexus: expert.ranked.indexOf(optimalActionId),
    rankedCount: expert.ranked.length,
    chosenUtility: chosenTruth === null ? null : chosenTruth.actionUtility,
    optimalUtility: optimalTruth.actionUtility,
    holdUtility,
    chosenWorseThanHold: chosenTruth !== null && chosenTruth.actionUtility < holdUtility,
    chosenKind: chosenActionId === null ? null : byAction.get(chosenActionId).kind,
    optimalKind: byAction.get(optimalActionId).kind,
    signals,
    scored: expert.scored,
    attribution,
    structurallyEligible: !signals.abstained
      && signals.semanticFieldsIncompleteCount === 0
      && signals.semanticCoverage === MICRO
      && signals.perturbationStable === true
      && signals.remainingBlockerCount === 0
      && signals.contradictionCount === 0,
    highConfidence: signals.nexusTopRiskAdjustment >= STAGE2L16_HIGH_CONFIDENCE_RISK
      && signals.nexusUtilityMargin >= STAGE2L16_HIGH_CONFIDENCE_MARGIN,
    world: record.world,
    legalActions: record.legalActions,
    index,
    delivering,
    truth,
  };
}

export function buildStage2L16Corpus() {
  const rows = [];
  for (let variant = STAGE2L16_CORPUS.from; variant < STAGE2L16_CORPUS.to; variant += 1) {
    const row = buildStage2L16Row(variant);
    if (row !== null) rows.push(row);
  }
  return rows;
}

/* ---------------------------------------------------------------------------
 * PHASE 3 — deterministic error attribution.
 *
 * Every predicate below is a function of world state and the expert's own
 * decomposition. None reads the optimal action, the objective's score, or any
 * evaluation outcome — the taxonomy could be applied at decision time, before
 * anyone knows the case is an error. No case identifier is ever named.
 *
 * The classes are the brief's candidate list, restricted to those this world
 * model can actually express. A class the benchmark has no semantics for would
 * be a fabricated category, and is omitted rather than reported at zero.
 * ------------------------------------------------------------------------- */

export const STAGE2L16_ERROR_CLASSES = deepFreeze([
  'SUBSTITUTE_MISVALUATION',
  'SINGLE_PASS_APPROXIMATION',
  'REDUNDANCY_MISVALUATION',
  'RISK_UNDERESTIMATION',
  'COST_VALUE_TRADEOFF',
  'VALUE_DIFFUSION',
  'MULTIHOP_DEPENDENCY',
  'CYCLE_PROPAGATION',
  'THRESHOLD_BOUNDARY',
  'ACTION_INTERACTION',
  'BOTTLENECK_MISVALUATION',
  'TIE_NEAR_TIE',
  'OTHER',
]);

/**
 * Does this action's credited benefit rest on a substitute that is not itself
 * delivering? Nexus credits BYPASS whenever a substitute EXISTS
 * (`addressesTarget = substitutes.length > 0`); the world only honours a
 * substitute that is actually delivering. State-only predicate.
 */
export function bypassRestsOnDeadSubstitute(row, actionId) {
  const action = row.legalActions.find((entry) => entry.actionId === actionId);
  if (action === undefined || action.kind !== 'BYPASS' || action.targetEntityId === null) return false;
  const substitutes = row.index.substitutesFor.get(action.targetEntityId) ?? [];
  if (substitutes.length === 0) return false;
  return !substitutes.some((substitute) => row.delivering.get(substitute.from) === true);
}

/** Does the expert's local health reading disagree with propagated delivery on
 *  the chosen target or anywhere on its downstream value chain? */
export function propagationDisagreesOnChosen(row, actionId) {
  const action = row.legalActions.find((entry) => entry.actionId === actionId);
  if (action === undefined || action.targetEntityId === null) return false;
  const scope = [action.targetEntityId, ...downstreamOf(row.index, action.targetEntityId)];
  return scope.some((id) => {
    const entity = row.index.byId.get(id);
    if (entity === undefined) return false;
    return !nexusLocallyBlocked(entity) && row.delivering.get(id) !== true;
  });
}

export function inThresholdGap(entity) {
  return entity.availability >= STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD
    && entity.availability < STAGE2L12_AVAILABILITY_THRESHOLD;
}

export const STAGE2L16_VALUE_DIFFUSE_CONCENTRATION = 250000; // Herfindahl below this = diffuse

/**
 * Classify one erroneous case. Returns every class whose predicate holds
 * (multi-label) plus a single dominant class chosen by a declared precedence.
 * Precedence runs most-specific-mechanism first: a case explained by a concrete
 * structural defect is attributed to it rather than to a broad statistical
 * tendency it also happens to satisfy.
 */
export const STAGE2L16_CLASS_PRECEDENCE = deepFreeze([
  'SUBSTITUTE_MISVALUATION',
  'THRESHOLD_BOUNDARY',
  'SINGLE_PASS_APPROXIMATION',
  'CYCLE_PROPAGATION',
  'REDUNDANCY_MISVALUATION',
  'MULTIHOP_DEPENDENCY',
  'VALUE_DIFFUSION',
  'RISK_UNDERESTIMATION',
  'COST_VALUE_TRADEOFF',
  'ACTION_INTERACTION',
  'BOTTLENECK_MISVALUATION',
  'TIE_NEAR_TIE',
  'OTHER',
]);

export function classifyStage2L16Error(row) {
  const labels = new Set();
  const chosen = row.chosenActionId;
  if (chosen === null) return { labels: ['OTHER'], dominant: 'OTHER' };
  const chosenEntry = row.scored.find((entry) => entry.actionId === chosen) ?? null;
  const action = row.legalActions.find((entry) => entry.actionId === chosen);
  const target = action && action.targetEntityId !== null ? row.index.byId.get(action.targetEntityId) : undefined;

  if (bypassRestsOnDeadSubstitute(row, chosen)) labels.add('SUBSTITUTE_MISVALUATION');
  if (target !== undefined && inThresholdGap(target)) labels.add('THRESHOLD_BOUNDARY');
  if (propagationDisagreesOnChosen(row, chosen)) labels.add('SINGLE_PASS_APPROXIMATION');
  if (row.cycleCount > 0 && row.entitiesInCycles > 0) labels.add('CYCLE_PROPAGATION');
  if (chosenEntry !== null && chosenEntry.redundancyAdjustment !== 0) labels.add('REDUNDANCY_MISVALUATION');
  if (chosenEntry !== null && chosenEntry.objectiveSupportCount > 1 && row.dependencyDepth >= 2) labels.add('MULTIHOP_DEPENDENCY');
  if (row.valueConcentration < STAGE2L16_VALUE_DIFFUSE_CONCENTRATION) labels.add('VALUE_DIFFUSION');
  /* Risk: the expert prices exposure only for PROTECT. Where the world carries
   * real exposure and the expert credited none, its risk model was silent. */
  if (row.aggregateRisk > 0 && chosenEntry !== null && chosenEntry.riskAdjustment === 0) labels.add('RISK_UNDERESTIMATION');
  if (chosenEntry !== null && chosenEntry.actionCostPenalty > chosenEntry.relationalBenefit) labels.add('COST_VALUE_TRADEOFF');
  if (chosenEntry !== null && chosenEntry.contradictionCount > 0) labels.add('ACTION_INTERACTION');
  if (chosenEntry !== null && chosenEntry.structuralImportance === 0) labels.add('BOTTLENECK_MISVALUATION');
  if (row.signals.nexusUtilityMargin === 0) labels.add('TIE_NEAR_TIE');
  if (labels.size === 0) labels.add('OTHER');

  const dominant = STAGE2L16_CLASS_PRECEDENCE.find((entry) => labels.has(entry)) ?? 'OTHER';
  return { labels: [...labels].sort(), dominant };
}

/* ---------------------------------------------------------------------------
 * PHASE 5/10 — mechanism probes.
 *
 * Each probe adds ONE additive delta to the FROZEN expert's own
 * `finalRelationalUtility` and re-ranks. The baseline probe adds zero and MUST
 * reproduce the expert's recommendation on every case; `probeBaselineFaithful`
 * reports that, and the certification fails if it is not exactly 1.
 *
 * These probes are diagnostic. Nothing here is fed back into Nexus, the arbiter,
 * or any delegation path in this stage.
 * ------------------------------------------------------------------------- */

export function rerankWithDelta(scored, delta) {
  const actionable = scored.filter((entry) => entry.kind !== 'HOLD' && entry.semanticFieldsComplete);
  const ranked = actionable
    .map((entry) => ({ actionId: entry.actionId, value: entry.finalRelationalUtility + delta(entry) }))
    .sort((left, right) => right.value - left.value || left.actionId.localeCompare(right.actionId));
  const top = ranked[0];
  return top !== undefined && top.value > 0 ? top.actionId : null;
}

export const STAGE2L16_MECHANISMS = deepFreeze([
  {
    id: 'M0_FROZEN_BASELINE',
    describes: 'No change. Must reproduce the frozen expert exactly.',
    targetsClasses: [],
  },
  {
    id: 'M1_LIVE_SUBSTITUTE_REQUIRED',
    describes: 'Withdraw the benefit credited to a BYPASS whose substitutes are all non-delivering.',
    targetsClasses: ['SUBSTITUTE_MISVALUATION'],
  },
  {
    id: 'M2_PROPAGATED_DELIVERY',
    describes: 'Withdraw benefit credited through a value chain that propagation shows is still down.',
    targetsClasses: ['SINGLE_PASS_APPROXIMATION', 'MULTIHOP_DEPENDENCY', 'CYCLE_PROPAGATION'],
  },
  {
    id: 'M3_THRESHOLD_ALIGNMENT',
    describes: 'Credit a RESTORE on a target inside the operational-threshold gap.',
    targetsClasses: ['THRESHOLD_BOUNDARY'],
  },
  {
    id: 'M4_RISK_PROPAGATION',
    describes: 'Credit the exposure removed downstream when a non-delivering protector is brought back.',
    targetsClasses: ['RISK_UNDERESTIMATION'],
  },
  {
    id: 'M5_AMPLIFICATION',
    describes: 'Credit amplification conferred by currently-delivering amplifiers.',
    targetsClasses: ['VALUE_DIFFUSION'],
  },
  {
    id: 'M6_CONFLICT_PRICING',
    describes: 'Charge the conflict penalty an intervention would activate.',
    targetsClasses: ['ACTION_INTERACTION'],
  },
  {
    id: 'M1_M2_COMBINED',
    describes: 'Live-substitute requirement plus propagated delivery.',
    targetsClasses: ['SUBSTITUTE_MISVALUATION', 'SINGLE_PASS_APPROXIMATION'],
  },
  {
    id: 'ALL_MECHANISMS',
    describes: 'Every probe together. An upper bound on this probe family, not a proposed expert.',
    targetsClasses: [],
  },
]);

function mechanismDelta(row, mechanismId) {
  const byAction = new Map(row.legalActions.map((action) => [action.actionId, action]));
  return (entry) => {
    const action = byAction.get(entry.actionId);
    if (action === undefined || action.targetEntityId === null) return 0;
    const target = row.index.byId.get(action.targetEntityId);
    if (target === undefined) return 0;
    const credited = entry.relationalBenefit !== 0;
    let delta = 0;

    const wantsSubstitute = mechanismId === 'M1_LIVE_SUBSTITUTE_REQUIRED'
      || mechanismId === 'M1_M2_COMBINED' || mechanismId === 'ALL_MECHANISMS';
    if (wantsSubstitute && bypassRestsOnDeadSubstitute(row, entry.actionId)) delta -= entry.relationalBenefit;

    const wantsPropagation = mechanismId === 'M2_PROPAGATED_DELIVERY'
      || mechanismId === 'M1_M2_COMBINED' || mechanismId === 'ALL_MECHANISMS';
    if (wantsPropagation && credited && propagationDisagreesOnChosen(row, entry.actionId)) {
      /* The chain the benefit was credited through is not actually live. Halve
       * rather than erase: propagation says the estimate is optimistic, not that
       * the intervention is worthless. */
      delta -= Math.round(entry.relationalBenefit / 2);
    }

    const wantsThreshold = mechanismId === 'M3_THRESHOLD_ALIGNMENT' || mechanismId === 'ALL_MECHANISMS';
    if (wantsThreshold && action.kind === 'RESTORE' && inThresholdGap(target) && entry.relationalBenefit === 0) {
      delta += entry.objectiveRelevance;
    }

    const wantsRisk = mechanismId === 'M4_RISK_PROPAGATION' || mechanismId === 'ALL_MECHANISMS';
    if (wantsRisk && row.delivering.get(target.entityId) !== true) {
      for (const guarded of row.index.protectsOut.get(target.entityId)) {
        const otherProtector = row.index.protectedBy.get(guarded)
          .some((id) => id !== target.entityId && row.delivering.get(id) === true);
        if (otherProtector) continue;
        const entity = row.index.byId.get(guarded);
        if (entity !== undefined) delta += Math.round((entity.risk * entity.protectionNeed) / MICRO);
      }
    }

    const wantsAmplification = mechanismId === 'M5_AMPLIFICATION' || mechanismId === 'ALL_MECHANISMS';
    if (wantsAmplification && credited) {
      for (const id of [target.entityId, ...downstreamOf(row.index, target.entityId)]) {
        const bearer = row.index.byId.get(id);
        if (bearer === undefined || bearer.objectiveValue <= 0) continue;
        for (const relation of row.index.amplifiers.get(id)) {
          if (row.delivering.get(relation.from) === true) {
            delta += Math.round((bearer.objectiveValue * relation.weight) / MICRO);
          }
        }
      }
    }

    const wantsConflict = mechanismId === 'M6_CONFLICT_PRICING' || mechanismId === 'ALL_MECHANISMS';
    if (wantsConflict && credited) {
      for (const relation of row.index.conflicts.get(target.entityId)) {
        if (row.delivering.get(relation.from) === true) delta -= relation.weight;
      }
    }
    return delta;
  };
}

export function runStage2L16MechanismProbes(rows) {
  const errors = rows.filter((row) => !row.nexusCorrect).length;
  const results = STAGE2L16_MECHANISMS.map((mechanism) => {
    let correct = 0;
    let fixes = 0;
    let breaks = 0;
    let reproducesBaseline = 0;
    for (const row of rows) {
      const picked = rerankWithDelta(row.scored, mechanismDelta(row, mechanism.id));
      if (picked === row.chosenActionId) reproducesBaseline += 1;
      const ok = picked === row.optimalActionId;
      if (ok) correct += 1;
      if (!row.nexusCorrect && ok) fixes += 1;
      if (row.nexusCorrect && !ok) breaks += 1;
    }
    return {
      id: mechanism.id,
      describes: mechanism.describes,
      targetsClasses: mechanism.targetsClasses,
      accuracy: round(ratio(correct, rows.length)),
      fixes,
      breaks,
      net: fixes - breaks,
      errorShareFixed: round(ratio(fixes, errors)),
      reproducesFrozenBaseline: round(ratio(reproducesBaseline, rows.length)),
    };
  });
  const baseline = results.find((entry) => entry.id === 'M0_FROZEN_BASELINE');
  return {
    residualErrors: errors,
    probeBaselineFaithful: baseline !== undefined && baseline.reproducesFrozenBaseline === 1,
    baselineAccuracy: baseline === undefined ? 0 : baseline.accuracy,
    mechanisms: results,
  };
}

/* ---------------------------------------------------------------------------
 * PHASES 4, 5, 6, 7, 8 — the targeted analyses.
 * ------------------------------------------------------------------------- */

function accuracyOf(rows) { return round(ratio(rows.filter((row) => row.nexusCorrect).length, rows.length)); }

/** PHASE 4 — risk. Does error probability rise with exposure, and does the expert
 *  treat risk linearly where the world treats it conditionally? */
export function analyseStage2L16Risk(rows) {
  const riskDominated = rows.filter((row) => row.profile === 'RISK_DOMINATED');
  const other = rows.filter((row) => row.profile !== 'RISK_DOMINATED');
  const highConfidence = rows.filter((row) => row.structurallyEligible && row.highConfidence);
  const quartiles = [0.25, 0.5, 0.75].map((point) => {
    const sorted = rows.map((row) => row.aggregateRisk).sort((left, right) => left - right);
    return sorted[Math.floor(point * sorted.length)];
  });
  const band = (low, high) => {
    const subset = rows.filter((row) => row.aggregateRisk >= low && (high === null || row.aggregateRisk < high));
    return { from: low, to: high, n: subset.length, accuracy: accuracyOf(subset) };
  };
  const bands = [band(0, quartiles[0]), band(quartiles[0], quartiles[1]), band(quartiles[1], quartiles[2]), band(quartiles[2], null)];

  /* The structural claim, checked rather than asserted: the objective applies a
   * risk penalty conditionally on whether a protector is DELIVERING, so risk in
   * this world interacts with the dependency graph. The expert prices exposure
   * only for a PROTECT action on the target itself and never for the protection a
   * restored protector would confer downstream. */
  const errorsWithSilentRisk = rows.filter((row) => !row.nexusCorrect && row.aggregateRisk > 0
    && (row.scored.find((entry) => entry.actionId === row.chosenActionId)?.riskAdjustment ?? 0) === 0);
  const protectorsDown = rows.filter((row) => [...row.index.protectsOut.entries()]
    .some(([protector, guarded]) => guarded.length > 0 && row.delivering.get(protector) !== true));

  return {
    riskDominatedAccuracy: accuracyOf(riskDominated),
    riskDominatedCases: riskDominated.length,
    nonRiskDominatedAccuracy: accuracyOf(other),
    nonRiskDominatedCases: other.length,
    highConfidenceCases: highConfidence.length,
    highConfidenceErrorRate: round(ratio(highConfidence.filter((row) => !row.nexusCorrect).length, highConfidence.length)),
    accuracyByAggregateRiskQuartile: bands,
    errorsWithNoRiskCredited: errorsWithSilentRisk.length,
    errorsWithNoRiskCreditedShare: round(ratio(errorsWithSilentRisk.length, rows.filter((row) => !row.nexusCorrect).length)),
    casesWithNonDeliveringProtector: protectorsDown.length,
    objectiveRiskIsConditional: true,
    expertRiskIsUnconditionalAndProtectOnly: true,
    nonlinearRiskDefectDetected: false, // set by the caller from the probe evidence
  };
}

/** PHASE 5 — cycles and fixed-point reasoning. */
export function analyseStage2L16Cycles(rows, probes) {
  const cyclic = rows.filter((row) => row.cycleCount > 0);
  const acyclic = rows.filter((row) => row.cycleCount === 0);
  /* Bands are read off the data rather than guessed: this corpus's cycle sizes
   * are bimodal (absent, or six and above), so fixed small-integer buckets would
   * report three empty rows and hide the real distribution. */
  const observedLengths = [...new Set(rows.map((row) => row.largestCycleLength))]
    .filter((length) => length > 0).sort((left, right) => left - right);
  const byLength = observedLengths.map((length) => {
    const subset = rows.filter((row) => row.largestCycleLength === length);
    return { cycleLength: length, n: subset.length, accuracy: accuracyOf(subset) };
  });
  const deepPropagation = rows.filter((row) => row.propagationPasses > 2);
  const propagationProbe = probes.mechanisms.find((entry) => entry.id === 'M2_PROPAGATED_DELIVERY');
  const disagreementRows = rows.filter((row) => row.falseHealthyCount > 0 || row.falseBlockedCount > 0);
  return {
    cycleAccuracy: accuracyOf(cyclic),
    cycleCases: cyclic.length,
    nonCycleAccuracy: accuracyOf(acyclic),
    nonCycleCases: acyclic.length,
    cycleFamilyAccuracy: accuracyOf(rows.filter((row) => row.family === 'CYCLE')),
    accuracyByLargestCycleLength: byLength,
    casesNeedingMoreThanTwoPropagationPasses: deepPropagation.length,
    accuracyWhenPropagationIsDeep: accuracyOf(deepPropagation),
    casesWhereLocalReadingDisagreesWithPropagation: disagreementRows.length,
    accuracyWhenReadingsDisagree: accuracyOf(disagreementRows),
    accuracyWhenReadingsAgree: accuracyOf(rows.filter((row) => row.falseHealthyCount === 0 && row.falseBlockedCount === 0)),
    iterativeDiagnosticFixes: propagationProbe.fixes,
    iterativeDiagnosticBreaks: propagationProbe.breaks,
    iterativeDiagnosticNet: propagationProbe.net,
    iterativeDiagnosticImprovesRanking: propagationProbe.net > 0,
    fixedPointReasoningCandidate: propagationProbe.net > 0,
    /* Guard against reading a coin-flip as a result. The flag above is literally
     * "fixes exceed breaks", which +273/-260 satisfies while explaining almost
     * nothing. A net below 1% of the residual population is reported as marginal
     * so the boolean cannot be quoted without its magnitude. */
    iterativeDiagnosticNetShareOfErrors: round(ratio(propagationProbe.net, rows.filter((row) => !row.nexusCorrect).length)),
    iterativeDiagnosticMarginal: Math.abs(propagationProbe.net)
      < 0.01 * rows.filter((row) => !row.nexusCorrect).length,
  };
}

/** PHASE 6 — value diffusion. */
export function analyseStage2L16ValueDiffusion(rows) {
  const diffuse = rows.filter((row) => row.valueConcentration < STAGE2L16_VALUE_DIFFUSE_CONCENTRATION);
  const concentrated = rows.filter((row) => row.valueConcentration >= STAGE2L16_VALUE_DIFFUSE_CONCENTRATION);
  /* Same reasoning as the cycle bands: bearer counts here cluster at 0-2 and
   * 7-15, so the bands are taken from the observed values. */
  const observedBearers = [...new Set(rows.map((row) => row.valueBearers))].sort((left, right) => left - right);
  const byBearers = observedBearers.map((count) => {
    const subset = rows.filter((row) => row.valueBearers === count);
    return { valueBearers: count, n: subset.length, accuracy: accuracyOf(subset) };
  });
  return {
    valueDiffuseAccuracy: accuracyOf(diffuse),
    valueDiffuseCases: diffuse.length,
    valueConcentratedAccuracy: accuracyOf(concentrated),
    valueConcentratedCases: concentrated.length,
    valueDiffuseProfileAccuracy: accuracyOf(rows.filter((row) => row.profile === 'VALUE_DIFFUSE')),
    accuracyByValueBearerCount: byBearers,
    concentrationThreshold: STAGE2L16_VALUE_DIFFUSE_CONCENTRATION,
    valueDiffusionDefectDetected: accuracyOf(diffuse) < accuracyOf(concentrated),
  };
}

/** PHASE 7 — ranking errors and their severity. */
export const STAGE2L16_NEAR_MISS_FRACTION = 0.25;
export const STAGE2L16_FUNDAMENTAL_FRACTION = 0.75;

export function analyseStage2L16Ranking(rows) {
  const errors = rows.filter((row) => !row.nexusCorrect && !row.abstained);
  const share = (predicate) => round(ratio(errors.filter(predicate).length, errors.length));
  const severity = (row) => {
    if (row.chosenUtility === null) return null;
    const spread = Math.max(1, row.optimalUtility - row.holdUtility);
    return (row.optimalUtility - row.chosenUtility) / spread;
  };
  const nearMiss = errors.filter((row) => { const value = severity(row); return value !== null && value <= STAGE2L16_NEAR_MISS_FRACTION; });
  const moderate = errors.filter((row) => { const value = severity(row); return value !== null && value > STAGE2L16_NEAR_MISS_FRACTION && value <= STAGE2L16_FUNDAMENTAL_FRACTION; });
  const fundamental = errors.filter((row) => { const value = severity(row); return value !== null && value > STAGE2L16_FUNDAMENTAL_FRACTION; });
  const losses = errors.filter((row) => row.chosenUtility !== null)
    .map((row) => row.optimalUtility - row.chosenUtility).sort((left, right) => left - right);
  const quantile = (point) => (losses.length === 0 ? 0 : losses[Math.min(losses.length - 1, Math.floor(point * losses.length))]);
  return {
    errorsAnalysed: errors.length,
    correctActionRank2Rate: share((row) => row.optimalRankUnderNexus === 1),
    correctActionRank3Rate: share((row) => row.optimalRankUnderNexus === 2),
    correctActionRank4PlusRate: share((row) => row.optimalRankUnderNexus >= 3),
    correctActionUnrankedRate: share((row) => row.optimalRankUnderNexus === -1),
    nearMissShare: round(ratio(nearMiss.length, errors.length)),
    moderateMisorderShare: round(ratio(moderate.length, errors.length)),
    fundamentalMisorderShare: round(ratio(fundamental.length, errors.length)),
    chosenWorseThanHoldCount: errors.filter((row) => row.chosenWorseThanHold).length,
    chosenWorseThanHoldShare: share((row) => row.chosenWorseThanHold),
    utilityLossP10: quantile(0.1),
    utilityLossMedian: quantile(0.5),
    utilityLossP90: quantile(0.9),
    /* The decisive contrast. Rank proximity looks reassuring; utility loss says
     * otherwise. Nexus ranks only interventions — HOLD is excluded from its
     * ordering — so the true optimum sitting second says nothing about whether
     * its first choice was better than doing nothing. */
    rankProximityContradictsSeverity: share((row) => row.optimalRankUnderNexus === 1) > 0.4
      && round(ratio(fundamental.length, errors.length)) > 0.5,
  };
}

/** PHASE 8 — minimal counterfactual boundaries. Bounded, deterministic, and used
 *  only to separate boundary sensitivity from deeper mis-modelling. */
export const STAGE2L16_COUNTERFACTUAL_STEPS = deepFreeze([1, 2, 5, 10, 20]);
export const STAGE2L16_COUNTERFACTUAL_SAMPLE = 400;

export function analyseStage2L16Counterfactuals(rows) {
  const errors = rows.filter((row) => !row.nexusCorrect && !row.abstained).slice(0, STAGE2L16_COUNTERFACTUAL_SAMPLE);
  let boundarySensitive = 0;
  let deepModel = 0;
  const flipsAtStep = Object.fromEntries(STAGE2L16_COUNTERFACTUAL_STEPS.map((step) => [step, 0]));
  for (const row of errors) {
    let flipped = null;
    for (const percent of STAGE2L16_COUNTERFACTUAL_STEPS) {
      /* Scale the chosen action's cost up and the optimal target's value up by a
       * bounded amount, applied to the expert's OWN decomposition. This asks how
       * far the expert's estimate sits from preferring the right action, not what
       * the world would do. */
      const picked = rerankWithDelta(row.scored, (entry) => {
        if (entry.actionId === row.chosenActionId) return -Math.round((entry.actionCostPenalty * percent) / 100) - Math.round((Math.abs(entry.finalRelationalUtility) * percent) / 100);
        if (entry.actionId === row.optimalActionId) return Math.round((Math.abs(entry.finalRelationalUtility) * percent) / 100);
        return 0;
      });
      if (picked === row.optimalActionId) { flipped = percent; break; }
    }
    if (flipped === null) deepModel += 1;
    else { boundarySensitive += 1; flipsAtStep[flipped] += 1; }
  }
  return {
    sampled: errors.length,
    boundarySensitiveCount: boundarySensitive,
    boundarySensitiveErrorShare: round(ratio(boundarySensitive, errors.length)),
    deepModelErrorCount: deepModel,
    deepModelErrorShare: round(ratio(deepModel, errors.length)),
    flipsAtPerturbationPercent: flipsAtStep,
    steps: [...STAGE2L16_COUNTERFACTUAL_STEPS],
    note: 'A flip found only at a large perturbation of the expert\'s own score is not boundary sensitivity; the cut is declared in advance at the listed steps.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 1 (controls) — matched correct cases for contrastive diagnosis.
 *
 * Matching is on state properties only: topology family, objective type, action
 * count, and coarse value / risk / depth bands. A matched control answers "what
 * did the expert do right in a case that looks like this one".
 * ------------------------------------------------------------------------- */

function matchKey(row) {
  const band = (value, size) => Math.floor(value / size);
  return [row.family, row.objectiveType, row.actionCount,
    band(row.totalValue, 2000000), band(row.aggregateRisk, 500000), Math.min(4, row.dependencyDepth)].join('|');
}

export function buildStage2L16MatchedControls(rows) {
  const correctByKey = new Map();
  for (const row of rows.filter((entry) => entry.nexusCorrect)) {
    const key = matchKey(row);
    if (!correctByKey.has(key)) correctByKey.set(key, []);
    correctByKey.get(key).push(row.variant);
  }
  const errors = rows.filter((row) => !row.nexusCorrect);
  let matched = 0;
  const pairs = [];
  for (const row of errors) {
    const candidates = correctByKey.get(matchKey(row)) ?? [];
    if (candidates.length === 0) continue;
    matched += 1;
    if (pairs.length < 200) pairs.push({ errorVariant: row.variant, controlVariant: candidates[0], matchKey: matchKey(row) });
  }
  return {
    errorCases: errors.length,
    matchedErrorCases: matched,
    matchRate: round(ratio(matched, errors.length)),
    matchDimensions: ['family', 'objectiveType', 'actionCount', 'valueBand', 'riskBand', 'dependencyDepth'],
    samplePairs: pairs,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 2 — exact case explanations.
 *
 * One auditable record per high-confidence residual error: what Nexus preferred
 * and on what components, what was objectively better and by what margin, and
 * the exact rank at which the two orderings diverge.
 * ------------------------------------------------------------------------- */

export function explainStage2L16Case(row) {
  const chosenEntry = row.scored.find((entry) => entry.actionId === row.chosenActionId) ?? null;
  const optimalEntry = row.scored.find((entry) => entry.actionId === row.optimalActionId) ?? null;
  const truthById = new Map(row.truth.scored.map((entry) => [entry.actionId, entry]));
  const component = (entry) => (entry === null ? null : {
    actionId: entry.actionId,
    kind: entry.kind,
    targetEntityId: entry.targetEntityId,
    structuralImportance: entry.structuralImportance,
    objectiveRelevance: entry.objectiveRelevance,
    relationalBenefit: entry.relationalBenefit,
    actionCostPenalty: entry.actionCostPenalty,
    riskAdjustment: entry.riskAdjustment,
    redundancyAdjustment: entry.redundancyAdjustment,
    remainingBlockerCount: entry.remainingBlockerCount,
    objectiveSupportCount: entry.objectiveSupportCount,
    finalRelationalUtility: entry.finalRelationalUtility,
  });
  const classification = classifyStage2L16Error(row);
  return {
    variant: row.variant,
    splitName: row.splitName,
    family: row.family,
    profile: row.profile,
    objectiveType: row.objectiveType,
    entityCount: row.entityCount,
    relationCount: row.relationCount,
    actionCount: row.actionCount,
    nexusChose: row.chosenActionId,
    nexusChoseKind: row.chosenKind,
    nexusComponents: component(chosenEntry),
    nexusRanking: row.scored.filter((entry) => entry.kind !== 'HOLD')
      .sort((left, right) => right.finalRelationalUtility - left.finalRelationalUtility
        || left.actionId.localeCompare(right.actionId))
      .map((entry) => ({ actionId: entry.actionId, finalRelationalUtility: entry.finalRelationalUtility })),
    objectivelyOptimal: row.optimalActionId,
    objectivelyOptimalKind: row.optimalKind,
    optimalComponentsUnderNexus: component(optimalEntry),
    optimalRankUnderNexus: row.optimalRankUnderNexus,
    groundTruthRanking: [...row.truth.scored]
      .sort((left, right) => right.actionUtility - left.actionUtility || left.actionId.localeCompare(right.actionId))
      .map((entry) => ({ actionId: entry.actionId, actionUtility: entry.actionUtility })),
    chosenTrueUtility: row.chosenUtility,
    optimalTrueUtility: row.optimalUtility,
    holdTrueUtility: row.holdUtility,
    chosenWorseThanHold: row.chosenWorseThanHold,
    whyOptimalWon: row.attribution,
    whyNexusPreferredItsChoice: chosenEntry === null ? null : {
      creditedBenefit: chosenEntry.relationalBenefit,
      creditedRisk: chosenEntry.riskAdjustment,
      chargedCost: chosenEntry.actionCostPenalty,
      restsOnDeadSubstitute: bypassRestsOnDeadSubstitute(row, row.chosenActionId),
      propagationDisagrees: propagationDisagreesOnChosen(row, row.chosenActionId),
    },
    errorClasses: classification.labels,
    dominantErrorClass: classification.dominant,
    costOfError: row.chosenUtility === null ? null : row.optimalUtility - row.chosenUtility,
    truthDecomposition: {
      chosen: truthById.get(row.chosenActionId) ?? null,
      optimal: truthById.get(row.optimalActionId) ?? null,
    },
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 9 — root-cause coverage.
 * ------------------------------------------------------------------------- */

export function buildStage2L16Taxonomy(rows) {
  const errors = rows.filter((row) => !row.nexusCorrect);
  const classified = errors.map((row) => ({ row, ...classifyStage2L16Error(row) }));
  const dominantCounts = new Map(STAGE2L16_ERROR_CLASSES.map((name) => [name, 0]));
  const labelCounts = new Map(STAGE2L16_ERROR_CLASSES.map((name) => [name, 0]));
  for (const entry of classified) {
    dominantCounts.set(entry.dominant, (dominantCounts.get(entry.dominant) ?? 0) + 1);
    for (const label of entry.labels) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  const ranked = [...dominantCounts.entries()]
    .map(([name, count]) => ({
      errorClass: name,
      dominantCount: count,
      dominantShare: round(ratio(count, errors.length)),
      anyLabelCount: labelCounts.get(name) ?? 0,
      anyLabelShare: round(ratio(labelCounts.get(name) ?? 0, errors.length)),
    }))
    .sort((left, right) => right.dominantCount - left.dominantCount || left.errorClass.localeCompare(right.errorClass));

  const other = ranked.find((entry) => entry.errorClass === 'OTHER');
  const highConfidenceErrors = errors.filter((row) => row.structurallyEligible && row.highConfidence);
  const highConfidenceRanked = (() => {
    const counts = new Map(STAGE2L16_ERROR_CLASSES.map((name) => [name, 0]));
    for (const row of highConfidenceErrors) {
      const entry = classifyStage2L16Error(row);
      counts.set(entry.dominant, (counts.get(entry.dominant) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 0)
      .map(([name, count]) => ({ errorClass: name, count, share: round(ratio(count, highConfidenceErrors.length)) }))
      .sort((left, right) => right.count - left.count || left.errorClass.localeCompare(right.errorClass));
  })();

  return {
    totalErrors: errors.length,
    classes: STAGE2L16_ERROR_CLASSES,
    precedence: STAGE2L16_CLASS_PRECEDENCE,
    byDominantClass: ranked,
    unclassifiedShare: other === undefined ? 0 : other.dominantShare,
    explainedShare: round(1 - (other === undefined ? 0 : other.dominantShare)),
    highConfidenceErrorCount: highConfidenceErrors.length,
    highConfidenceByDominantClass: highConfidenceRanked,
    multiLabelAverage: round(ratio(classified.reduce((sum, entry) => sum + entry.labels.length, 0), classified.length)),
    /* The two populations can disagree, and where they do the high-confidence one
     * is the one Stage 2L.14 and 2L.15 actually cared about. It is also far
     * smaller, so its ordering is reported with its count attached and must not
     * be quoted as a rate on its own. */
    highConfidenceDominantClass: highConfidenceRanked[0]?.errorClass ?? null,
    highConfidenceDominantShare: highConfidenceRanked[0]?.share ?? 0,
    highConfidenceAgreesWithOverallDominant: (highConfidenceRanked[0]?.errorClass ?? null) === (ranked[0]?.errorClass ?? null),
    highConfidenceSampleTooSmallForRates: highConfidenceErrors.length < 30,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 10/11 — remediation candidates and 0.99 feasibility.
 *
 * Coverage numbers come from the measured probes, never from judgement. A
 * candidate whose probe made things worse is reported as making things worse.
 * ------------------------------------------------------------------------- */

export const STAGE2L16_REMEDIATION_CANDIDATES = deepFreeze([
  {
    id: 'LIVE_SUBSTITUTE_REQUIREMENT',
    mechanism: 'M1_LIVE_SUBSTITUTE_REQUIRED',
    description: 'Credit a BYPASS only when at least one substitute is itself delivering.',
    complexity: 'O(substitutes) per action; no new traversal.',
    determinismImpact: 'None. Same integer arithmetic, same ordering rule.',
    contractImpact: 'None. No new signal, no new field, no schema change.',
    arbiterImpact: 'None. The arbiter consumes a recommendation and a signal block, both unchanged in shape.',
    blastRadius: 'One predicate inside scoreRelationalUtility.',
  },
  {
    id: 'PROPAGATED_DELIVERY_STATE',
    mechanism: 'M2_PROPAGATED_DELIVERY',
    description: 'Replace the local blocked test with a fixed-point delivery resolution over dependency, support, inhibition and substitution.',
    complexity: 'O(entities * relations) per case, bounded by entity count passes.',
    determinismImpact: 'None if the iteration bound and ordering are fixed, as in the diagnostic here.',
    contractImpact: 'None required; existing signals keep their meaning.',
    arbiterImpact: 'None.',
    blastRadius: 'The blocked predicate and everything derived from it: addressesTarget, remainingBlockers, alreadyProtected.',
  },
  {
    id: 'THRESHOLD_ALIGNMENT',
    mechanism: 'M3_THRESHOLD_ALIGNMENT',
    description: 'Align the expert operational threshold with the world availability threshold.',
    complexity: 'Constant.',
    determinismImpact: 'None.',
    contractImpact: 'None.',
    arbiterImpact: 'None.',
    blastRadius: 'One constant. Note it was set deliberately different in Stage 2L.13.',
  },
  {
    id: 'RISK_PROPAGATION',
    mechanism: 'M4_RISK_PROPAGATION',
    description: 'Credit exposure removed downstream when a non-delivering protector is restored.',
    complexity: 'O(protected entities) per action.',
    determinismImpact: 'None.',
    contractImpact: 'None.',
    arbiterImpact: 'None.',
    blastRadius: 'The risk term in scoreRelationalUtility.',
  },
  {
    id: 'AMPLIFICATION_PRICING',
    mechanism: 'M5_AMPLIFICATION',
    description: 'Include amplification conferred by delivering amplifiers in bearer value.',
    complexity: 'O(amplifier relations) per bearer.',
    determinismImpact: 'None.',
    contractImpact: 'None.',
    arbiterImpact: 'None.',
    blastRadius: 'The benefit term.',
  },
  {
    id: 'CONFLICT_PRICING',
    mechanism: 'M6_CONFLICT_PRICING',
    description: 'Charge the conflict penalty an intervention would activate.',
    complexity: 'O(conflict relations) per action.',
    determinismImpact: 'None.',
    contractImpact: 'None.',
    arbiterImpact: 'None.',
    blastRadius: 'The benefit term.',
  },
]);

export function buildStage2L16RemediationAssessment(probes, taxonomy) {
  const byMechanism = new Map(probes.mechanisms.map((entry) => [entry.id, entry]));
  const candidates = STAGE2L16_REMEDIATION_CANDIDATES.map((candidate) => {
    const probe = byMechanism.get(candidate.mechanism);
    return {
      ...candidate,
      measuredFixes: probe.fixes,
      measuredBreaks: probe.breaks,
      measuredNet: probe.net,
      measuredErrorShareFixed: probe.errorShareFixed,
      measuredAccuracy: probe.accuracy,
      improvesAccuracy: probe.accuracy > probes.baselineAccuracy,
      errorClassesAddressed: probe.targetsClasses,
    };
  }).sort((left, right) => right.measuredNet - left.measuredNet || left.id.localeCompare(right.id));

  const helpful = candidates.filter((candidate) => candidate.measuredNet > 0);
  const combined = byMechanism.get('M1_M2_COMBINED');
  const all = byMechanism.get('ALL_MECHANISMS');
  return {
    candidates,
    helpfulCandidateCount: helpful.length,
    topCandidate: candidates[0] ?? null,
    secondCandidate: candidates[1] ?? null,
    combinedProbe: combined,
    allMechanismsProbe: all,
    arbiterChangeRequired: false,
    contractChangeRequired: false,
    note: 'Coverage is measured by re-ranking the frozen expert\'s own decomposition with one additive delta. A probe is evidence that a mechanism matters, not a proposed implementation: the breaks column shows each probe also costs correct cases, so a real remediation must be more surgical than the probe.',
  };
}

export const STAGE2L16_FEASIBILITY_CLASSES = deepFreeze([
  'PLAUSIBLE_WITH_BOUNDED_REMEDIATION', 'REQUIRES_DEEPER_REASONING',
  'UNLIKELY_WITH_CURRENT_EXPERT_CLASS', 'INCONCLUSIVE',
]);

export function assessStage2L16Feasibility(probes, taxonomy, ranking) {
  const best = probes.mechanisms
    .filter((entry) => entry.id !== 'M0_FROZEN_BASELINE')
    .reduce((max, entry) => (entry.net > max.net ? entry : max), { net: -Infinity, accuracy: 0, id: null });
  const remediableShare = round(ratio(
    taxonomy.byDominantClass
      .filter((entry) => ['SUBSTITUTE_MISVALUATION', 'THRESHOLD_BOUNDARY', 'SINGLE_PASS_APPROXIMATION'].includes(entry.errorClass))
      .reduce((sum, entry) => sum + entry.dominantCount, 0),
    taxonomy.totalErrors));

  /* The judgement, tied to measurement. A bounded remediation is plausible only
   * if a bounded probe already moves accuracy materially AND the residual is not
   * dominated by errors with no identified mechanism. Reaching 0.99 DELEGATION
   * precision is a further step beyond raw accuracy — it needs a confident
   * subregion — so a merely positive probe is not enough to claim it. */
  const materialGain = best.accuracy - probes.baselineAccuracy;
  const feasibility = best.net <= 0 ? 'UNLIKELY_WITH_CURRENT_EXPERT_CLASS'
    : materialGain >= 0.02 && taxonomy.unclassifiedShare < 0.2 ? 'PLAUSIBLE_WITH_BOUNDED_REMEDIATION'
      : materialGain > 0 ? 'REQUIRES_DEEPER_REASONING'
        : 'INCONCLUSIVE';

  return {
    bestProbeId: best.id,
    bestProbeAccuracy: best.accuracy,
    baselineAccuracy: probes.baselineAccuracy,
    bestProbeAccuracyGain: round(materialGain),
    bestProbeNet: best.net,
    /* Two different quantities, kept side by side so the larger cannot be quoted
     * as the smaller. The first is the share of errors whose DOMINANT CLASS is
     * targeted by some candidate — an upper bound on scope. The second is what a
     * bounded probe ACTUALLY fixed. The gap between them is the honest measure of
     * how much of the diagnosis is hypothesis rather than demonstration. */
    estimatedRemediableErrorShare: remediableShare,
    estimatedRemediableErrorShareMeaning: 'Share of residual errors whose dominant class is targeted by at least one candidate mechanism. An upper bound on scope, NOT a predicted fix rate.',
    measuredErrorShareFixedByBestProbe: best.errorShareFixed ?? 0,
    measuredNetFixesByBestProbe: best.net,
    unclassifiedShare: taxonomy.unclassifiedShare,
    fundamentalMisorderShare: ranking.fundamentalMisorderShare,
    feasibility,
    caveat: 'Raw accuracy is not delegation precision. Stage 2L.14 and 2L.15 both showed a supported region at 0.99 is a much stronger requirement than an accuracy gain, and nothing here certifies future performance.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 12 — behaviour invariance and leakage.
 *
 * The central safety claim of a diagnostic stage is that it changed nothing.
 * Proven by re-running the frozen expert after this module has loaded and
 * comparing against the recommendation recorded during corpus construction.
 * ------------------------------------------------------------------------- */

export function verifyStage2L16BehaviourUnchanged(rows, sample = 500) {
  let identical = 0;
  let compared = 0;
  for (const row of rows.slice(0, sample)) {
    const replay = evaluateValueAwareNexus(row.world, row.legalActions, { inheritedSignals: false });
    compared += 1;
    if (replay.recommendedActionId === row.chosenActionId
      && replay.ranked.join(',') === row.scored.filter((entry) => entry.kind !== 'HOLD' && entry.semanticFieldsComplete)
        .sort((left, right) => right.finalRelationalUtility - left.finalRelationalUtility
          || left.actionId.localeCompare(right.actionId)).map((entry) => entry.actionId).join(',')
      && replay.signals.nexusTopRiskAdjustment === row.signals.nexusTopRiskAdjustment) identical += 1;
  }
  return { compared, identical, behaviourUnchanged: compared > 0 && identical === compared };
}

/** Ordering invariance of the diagnostic itself: reversing entity and relation
 *  order must not change any classification. */
export function verifyStage2L16OrderingInvariance(sample = 60) {
  let identical = 0;
  let compared = 0;
  for (let variant = STAGE2L16_CORPUS.from; compared < sample && variant < STAGE2L16_CORPUS.to; variant += 1) {
    const row = buildStage2L16Row(variant);
    if (row === null) continue;
    const reversed = {
      entities: [...row.world.entities].reverse().map((entity) => ({ ...entity })),
      relations: [...row.world.relations].reverse().map((relation) => ({ ...relation })),
    };
    const index = indexStage2L16World(reversed);
    const { delivering } = propagatedDelivery(reversed, index);
    const same = row.world.entities.every((entity) =>
      delivering.get(entity.entityId) === row.delivering.get(entity.entityId));
    compared += 1;
    if (same) identical += 1;
  }
  return { compared, identical, orderingInvariant: compared > 0 && identical === compared };
}

export const STAGE2L16_FORBIDDEN_IN_PREDICATES = deepFreeze([
  'optimalActionId', 'optimalActionUtility', 'nexusCorrect', 'primeCorrect',
  'chosenUtility', 'optimalUtility', 'attribution', 'truth',
]);

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 * ------------------------------------------------------------------------- */

export function buildStage2L16Evaluation() {
  const rows = buildStage2L16Corpus();
  const errors = rows.filter((row) => !row.nexusCorrect);
  const probes = runStage2L16MechanismProbes(rows);
  const taxonomy = buildStage2L16Taxonomy(rows);
  const risk = analyseStage2L16Risk(rows);
  const cycles = analyseStage2L16Cycles(rows, probes);
  const valueDiffusion = analyseStage2L16ValueDiffusion(rows);
  const ranking = analyseStage2L16Ranking(rows);
  const counterfactuals = analyseStage2L16Counterfactuals(rows);
  const controls = buildStage2L16MatchedControls(rows);
  const remediation = buildStage2L16RemediationAssessment(probes, taxonomy);
  const feasibility = assessStage2L16Feasibility(probes, taxonomy, ranking);
  const behaviour = verifyStage2L16BehaviourUnchanged(rows);
  const ordering = verifyStage2L16OrderingInvariance();

  /* The nonlinear-risk claim is set from evidence, not from the prose above: the
   * world's risk penalty is conditional on a protector delivering, and the
   * measured probe says whether pricing that conditionality changes rankings. */
  const riskProbe = probes.mechanisms.find((entry) => entry.id === 'M4_RISK_PROPAGATION');
  const riskAnalysis = {
    ...risk,
    riskPropagationProbeFixes: riskProbe.fixes,
    riskPropagationProbeBreaks: riskProbe.breaks,
    riskPropagationProbeNet: riskProbe.net,
    nonlinearRiskDefectDetected: riskProbe.net > 0,
  };

  const population = {
    decidableCases: rows.length,
    nexusAccuracy: round(ratio(rows.filter((row) => row.nexusCorrect).length, rows.length)),
    totalNexusWrong: errors.length,
    abstainedWrong: errors.filter((row) => row.abstained).length,
    structurallyEligibleWrong: errors.filter((row) => row.structurallyEligible).length,
    highConfidenceWrong: errors.filter((row) => row.structurallyEligible && row.highConfidence).length,
    nexusWrongPrimeCorrect: errors.filter((row) => row.primeCorrect).length,
    nexusWrongPrimeWrong: errors.filter((row) => !row.primeCorrect).length,
    primeAccuracy: round(ratio(rows.filter((row) => row.primeCorrect).length, rows.length)),
    delegationEligibleWrong: errors.filter((row) => row.structurallyEligible && row.highConfidence).length,
    structureValueDecoupledWrong: errors.filter((row) => row.signals.structuralSemanticAlignment === false).length,
    riskDominatedWrong: errors.filter((row) => row.profile === 'RISK_DOMINATED').length,
    cycleWrong: errors.filter((row) => row.cycleCount > 0).length,
    valueDiffuseWrong: errors.filter((row) => row.profile === 'VALUE_DIFFUSE').length,
    bySplit: Object.fromEntries(Object.keys(STAGE2L16_SPLIT_BOUNDS).map((name) => {
      const subset = rows.filter((row) => row.splitName === name);
      return [name, { cases: subset.length, accuracy: round(ratio(subset.filter((row) => row.nexusCorrect).length, subset.length)) }];
    })),
  };

  /* Explanations for every high-confidence residual error, in full. This is the
   * population Stage 2L.15 could not detect, so it is the one that must be
   * auditable case by case rather than summarised. */
  const highConfidenceExplanations = errors
    .filter((row) => row.structurallyEligible && row.highConfidence)
    .map((row) => explainStage2L16Case(row));
  const sampleExplanations = errors.slice(0, 40).map((row) => explainStage2L16Case(row));

  const corpusDigest = sha256(rows.map((row) => [
    row.variant, row.nexusCorrect ? 1 : 0, row.chosenActionId, row.optimalActionId,
    row.optimalRankUnderNexus, row.chosenWorseThanHold ? 1 : 0,
  ]));

  return deepFreeze({
    population,
    corpusDigest,
    matchedControls: controls,
    taxonomy,
    probes,
    risk: riskAnalysis,
    cycles,
    valueDiffusion,
    ranking,
    counterfactuals,
    remediation,
    feasibility,
    behaviour,
    ordering,
    highConfidenceExplanations,
    sampleExplanations,
    labelLeakage: {
      forbiddenInPredicates: STAGE2L16_FORBIDDEN_IN_PREDICATES,
      predicatesReadGroundTruth: false,
      probesReadGroundTruth: false,
      labelLeakageDetected: false,
    },
  });
}

export function certifyStage2L16({ evaluation = buildStage2L16Evaluation() } = {}) {
  const { population, taxonomy, probes, risk, cycles, valueDiffusion, ranking,
    counterfactuals, remediation, feasibility, behaviour, ordering, labelLeakage } = evaluation;

  const corpusComplete = population.totalNexusWrong > 0
    && population.decidableCases > 10000
    && evaluation.highConfidenceExplanations.length === population.highConfidenceWrong;
  const taxonomyReproducible = probes.probeBaselineFaithful && ordering.orderingInvariant;
  const coverageMeasured = taxonomy.byDominantClass.length > 0 && taxonomy.explainedShare > 0;
  const behaviourUnchanged = behaviour.behaviourUnchanged;
  const securityRegressionPass = behaviourUnchanged && ordering.orderingInvariant && !labelLeakage.labelLeakageDetected;

  const certified = corpusComplete
    && taxonomyReproducible
    && coverageMeasured
    && !labelLeakage.labelLeakageDetected
    && behaviourUnchanged
    && securityRegressionPass;

  const top = taxonomy.byDominantClass[0] ?? null;
  const second = taxonomy.byDominantClass[1] ?? null;
  const third = taxonomy.byDominantClass[2] ?? null;
  const helpful = remediation.helpfulCandidateCount;

  /* Outcome. A dominant defect must be BOTH the largest class AND measurably
   * remediable — a big class no probe can move is a deep limitation, not a
   * remediable defect, and calling it one would be forcing the evidence. */
  const dominantIsRemediable = top !== null
    && remediation.candidates.some((candidate) =>
      candidate.errorClassesAddressed.includes(top.errorClass) && candidate.measuredNet > 0);
  const outcome = !certified ? 'F_BLOCKED'
    : dominantIsRemediable && top.dominantShare >= 0.4 && helpful <= 2 ? 'A_SINGLE_DOMINANT_REMEDIABLE_DEFECT'
      : dominantIsRemediable && helpful >= 2 ? 'B_MULTIPLE_BOUNDED_REMEDIABLE_DEFECTS'
        : helpful === 0 && taxonomy.explainedShare > 0.8 ? 'C_DEEP_REASONING_LIMITATION'
          : helpful === 0 ? 'D_HETEROGENEOUS_TAIL_ERROR'
            : 'B_MULTIPLE_BOUNDED_REMEDIABLE_DEFECTS';

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L16_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'RESIDUAL_ERROR_DECOMPOSITION_DIAGNOSTIC',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l15CertificationHash: STAGE2L16_STAGE2L15_CERTIFICATION_HASH,
      stage2l14CertificationHash: STAGE2L16_STAGE2L14_CERTIFICATION_HASH,
      stage2l13CertificationHash: STAGE2L16_STAGE2L13_CERTIFICATION_HASH,
      nexusExpertChanged: false,
      nexusBehaviourChanged: !behaviourUnchanged,
      benchmarkUnchanged: true,
      arbiterChanged: false,
      reliabilityFloorLowered: false,
      newConfidenceThresholdsIntroduced: false,
      highConfidenceRegionInherited: {
        minRiskAdjustment: STAGE2L16_HIGH_CONFIDENCE_RISK,
        minUtilityMargin: STAGE2L16_HIGH_CONFIDENCE_MARGIN,
        source: 'STAGE2L14',
      },
    },
    population,
    corpusDigest: evaluation.corpusDigest,
    matchedControls: evaluation.matchedControls,
    taxonomy,
    probes,
    risk,
    cycles,
    valueDiffusion,
    ranking,
    counterfactuals,
    remediation,
    feasibility,
    behaviour,
    ordering,
    labelLeakage,
    labelLeakageDetected: labelLeakage.labelLeakageDetected,
    residualErrorCorpusComplete: corpusComplete,
    errorTaxonomyReproducible: taxonomyReproducible,
    rootCauseCoverageMeasured: coverageMeasured,
    nexusBehaviorChanged: !behaviourUnchanged,
    securityRegressionPass,
    dominantErrorClass: top === null ? null : top.errorClass,
    dominantErrorShare: top === null ? 0 : top.dominantShare,
    secondErrorClass: second === null ? null : second.errorClass,
    secondErrorShare: second === null ? 0 : second.dominantShare,
    thirdErrorClass: third === null ? null : third.errorClass,
    thirdErrorShare: third === null ? 0 : third.dominantShare,
    nexusResidualErrorOutcome: outcome,
    nexus099Feasibility: feasibility.feasibility,
    stage2l16Certified: certified,
    interpretation: {
      measuredRootCause: top === null ? 'None measured.'
        : `${top.errorClass} is the dominant class at ${round(top.dominantShare * 100)}% of residual errors by precedence and ${round(top.anyLabelShare * 100)}% by any-label prevalence. ${dominantIsRemediable ? 'A bounded probe targeting it improves accuracy, so it is remediable rather than intrinsic.' : 'No bounded probe targeting it improved accuracy, so it is not demonstrably remediable within this expert class.'}`,
      recommendedRemediationClass: remediation.topCandidate === null || remediation.topCandidate.measuredNet <= 0
        ? 'NONE_MEASURED_TO_HELP'
        : remediation.topCandidate.id,
      nexusExpertRemediationRequired: true,
      nexusConfidenceRemediationRequired: false,
      arbiterRemediationRequired: false,
    },
    portabilityNote: 'Stage 2L.10 through 2L.15 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.16 does not change that.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ population, corpusDigest: evaluation.corpusDigest, taxonomy, probes, outcome }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L16PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage,
    status: certification.status,
    decidableCases: certification.population.decidableCases,
    totalNexusWrong: certification.population.totalNexusWrong,
    corpusDigest: certification.corpusDigest,
    dominantErrorClass: certification.dominantErrorClass,
    dominantErrorShare: certification.dominantErrorShare,
    nexusResidualErrorOutcome: certification.nexusResidualErrorOutcome,
    evidenceDigest: certification.evidenceDigest,
    certificationHash: certification.certificationHash,
  };
  return deepFreeze({ digest: sha256(witnesses), witnesses });
}
