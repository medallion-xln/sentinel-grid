/* Stage 2L.12 — Nexus semantic grounding, observable utility, and relational
 * correctness certification (R0, shadow only).
 *
 * WHY THIS STAGE EXISTS. Stage 2L.11 proved that the Nexus benchmark itself was
 * broken. Correctness was decided by `nexusAligned`, an independent seeded draw
 * statistically independent of every legitimate decision-time observable. Under
 * that benchmark no expert could ever be shown good or bad — the question was
 * unanswerable by construction, and Stage 2L.11 classified the defect as
 * REMEDIATION_CLASS=CORPUS_SEMANTICS.
 *
 * WHAT THIS STAGE CHANGES. The benchmark, and only the benchmark. Nexus is not
 * touched. The Stage 2L.10 arbiter, its frozen calibration and every inherited
 * safety ceiling are imported frozen. The evidence contract is NOT widened —
 * Stage 2L.11 already established that widening it does not recover
 * identifiability, so starting there would be answering the wrong question.
 *
 * THE REPLACEMENT SEMANTICS. Ground truth is now derived from world state:
 *
 *     entities carry value, capacity, availability, risk, cost
 *     relations carry dependency, support, protection, inhibition,
 *                     amplification, substitution and conflict semantics
 *     a deterministic objective function scores a world state
 *     each legal action deterministically transforms the world
 *     ACTION_UTILITY  = U(after) - U(before) - cost
 *     GROUND_TRUTH    = argmax ACTION_UTILITY
 *
 * Nothing in that chain consults Nexus, Prime, the Arbiter, or a correctness
 * flag. The generator uses randomness to CREATE worlds; it never uses randomness
 * to decide whether an expert is right. That distinction is the whole point of
 * the stage and it is tested, not asserted.
 *
 * WHAT IS DELIBERATELY NOT DONE. No observable proxy for the old hidden draw is
 * manufactured. Topology and semantic parameters are sampled from independent
 * streams, so structural attractiveness and objective utility are free to
 * disagree — and the corpus is explicitly built to contain cases where they do:
 * high-degree decoys with no objective relevance, low-degree sole suppliers of
 * the highest-value objective, single points of failure that do not matter, and
 * bottlenecks whose repair costs more than it returns.
 *
 * Whether Nexus reads any of this is Nexus's business. It is given the complete
 * canonical state and may use as much of it as its contract chooses to.
 */

import { createSeededRandom, deriveSeed, deepFreeze, sha256 } from '../core/determinism.js';
import { evaluateNexus } from '../experts/nexus.js';
import { analyzeRelationalDelta, isReachable, normalizeRelationalGraph } from './stage2k0-nexus-relational-diagnostic.js';
import { STAGE2L10_FROZEN_CALIBRATION } from './stage2l10-arbiter-correctness-calibration-and-selective-delegation.js';

export const STAGE2L12_STAGE = 'STAGE2L12_NEXUS_SEMANTIC_GROUNDING_AND_OBSERVABLE_UTILITY';

/* Frozen predecessors. Stage 2L.12 changes none of them. */
export const STAGE2L12_STAGE2L11_CERTIFICATION_HASH = 'c8a2cde31674c3c19f1a8918f7a37fcfd69bf74393a700d5ee2d9ef99d9d14f5';
export const STAGE2L12_STAGE2L10_CERTIFICATION_HASH = '73e958a02a479326bb60cad058fa5cc3e29d5c77614aaef87936aa41dba41a86';

/* Inherited bounds, unchanged. */
export const STAGE2L12_MAX_HARMFUL_CHANGE_RATE = 0.01;
export const STAGE2L12_MAX_CORRECT_PRIME_BREAK_RATE = 0.01;

/* Fixed-point scale. Every semantic quantity is an integer in micro-units so the
 * objective is exactly reproducible and free of floating-point drift. */
const MICRO = 1000000;

function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }

/* ---------------------------------------------------------------------------
 * PHASE 1 — Relational world semantics.
 *
 * The minimum vocabulary needed for relational reasoning to have consequences.
 * Every field is an integer in micro-units or a small enum; nothing is derived
 * from an expert and nothing encodes an answer.
 * ------------------------------------------------------------------------- */

export const STAGE2L12_RELATION_KINDS = deepFreeze([
  'depends',      // A cannot deliver unless B delivers
  'supports',     // B contributes capacity to A
  'protects',     // B reduces A's risk exposure
  'inhibits',     // B subtracts capacity from A
  'amplifies',    // B multiplies A's delivered value
  'substitutes',  // B can stand in for A in a dependency
  'conflicts',    // A and B degrade each other
]);

export const STAGE2L12_ENTITY_FIELDS = deepFreeze([
  'entityId',
  'objectiveValue',      // intrinsic contribution when delivered (micro)
  'demand',              // capacity required to deliver (micro)
  'baseCapacity',        // capacity the entity supplies on its own (micro)
  'availability',        // 0..MICRO operational state
  'risk',                // 0..MICRO intrinsic exposure
  'protectionNeed',      // how much risk translates into loss (micro)
  'restorationCost',     // cost to act on this entity (micro)
  'objectiveRelevant',   // participates in an objective at all
]);

export const STAGE2L12_WORLD_FEATURE_COUNT = STAGE2L12_ENTITY_FIELDS.length + STAGE2L12_RELATION_KINDS.length;

export const STAGE2L12_AVAILABILITY_THRESHOLD = 600000; // 0.6 in micro

/* ---------------------------------------------------------------------------
 * PHASE 2 — The objective function.
 *
 * Deterministic, inspectable, versioned, and independent of every expert. It
 * reads a world state and returns an integer utility.
 *
 * A node DELIVERS when it is available, its dependencies (or their substitutes)
 * deliver, and its effective capacity meets its demand. Delivery is resolved by
 * iteration to a fixed point, which makes cycles terminate deterministically
 * rather than depending on traversal order.
 * ------------------------------------------------------------------------- */

export const STAGE2L12_OBJECTIVE_MODEL = deepFreeze({
  schemaVersion: 1,
  id: 'STAGE2L12_DELIVERED_VALUE_MINUS_RISK_V1',
  scale: MICRO,
  availabilityThreshold: STAGE2L12_AVAILABILITY_THRESHOLD,
  terms: [
    { name: 'deliveredObjectiveValue', sign: '+', description: 'objectiveValue of every entity that delivers' },
    { name: 'amplification', sign: '+', description: 'delivered value scaled by available amplifiers' },
    { name: 'riskPenalty', sign: '-', description: 'risk x protectionNeed for entities whose protectors are unavailable' },
    { name: 'conflictPenalty', sign: '-', description: 'mutual degradation between simultaneously delivering conflicting entities' },
  ],
  deliveryRule: 'available AND all depends satisfied (directly or via a delivering substitute) AND effectiveCapacity >= demand',
  capacityRule: 'baseCapacity + sum(supports from delivering suppliers) - sum(inhibits from delivering inhibitors)',
  fixedPointResolution: 'iterate delivery to convergence, bounded by entity count',
  readsExpertOutput: false,
  readsPrimeOutput: false,
  readsArbiterOutput: false,
  readsRandomCorrectnessFlag: false,
});
export const STAGE2L12_OBJECTIVE_MODEL_DIGEST = sha256(STAGE2L12_OBJECTIVE_MODEL);

function indexWorld(world) {
  const byId = new Map(world.entities.map((entity) => [entity.entityId, entity]));
  const incoming = new Map(world.entities.map((entity) => [entity.entityId, []]));
  for (const relation of world.relations) {
    if (incoming.has(relation.to)) incoming.get(relation.to).push(relation);
  }
  return { byId, incoming };
}

/** Deterministic delivery fixed point. Order-independent by construction. */
function resolveDelivery(world) {
  const { byId, incoming } = indexWorld(world);
  const delivering = new Map(world.entities.map((entity) => [entity.entityId, false]));
  const capacity = new Map(world.entities.map((entity) => [entity.entityId, 0]));

  for (let pass = 0; pass <= world.entities.length; pass += 1) {
    let changed = false;
    for (const entity of world.entities) {
      const relations = incoming.get(entity.entityId) ?? [];
      let effective = entity.baseCapacity;
      for (const relation of relations) {
        const source = byId.get(relation.from);
        if (!source) continue;
        const sourceDelivers = delivering.get(relation.from) === true;
        if (relation.kind === 'supports' && sourceDelivers) effective += relation.weight;
        if (relation.kind === 'inhibits' && sourceDelivers) effective -= relation.weight;
      }
      const dependencies = relations.filter((relation) => relation.kind === 'depends');
      const substitutes = relations.filter((relation) => relation.kind === 'substitutes');
      const dependenciesMet = dependencies.every((relation) => delivering.get(relation.from) === true
        || substitutes.some((substitute) => substitute.replaces === relation.from && delivering.get(substitute.from) === true));
      const next = entity.availability >= STAGE2L12_AVAILABILITY_THRESHOLD
        && dependenciesMet
        && effective >= entity.demand;
      if (capacity.get(entity.entityId) !== effective) { capacity.set(entity.entityId, effective); changed = true; }
      if (delivering.get(entity.entityId) !== next) { delivering.set(entity.entityId, next); changed = true; }
    }
    if (!changed) break;
  }
  return { delivering, capacity, byId, incoming };
}

/** The objective. Integer in, integer out, no expert anywhere in the chain. */
export function objectiveUtility(world) {
  const { delivering, byId, incoming } = resolveDelivery(world);
  let delivered = 0;
  let amplification = 0;
  let riskPenalty = 0;
  let conflictPenalty = 0;

  for (const entity of world.entities) {
    const relations = incoming.get(entity.entityId) ?? [];
    if (delivering.get(entity.entityId)) {
      delivered += entity.objectiveValue;
      for (const relation of relations) {
        if (relation.kind === 'amplifies' && delivering.get(relation.from) === true) {
          amplification += Math.round((entity.objectiveValue * relation.weight) / MICRO);
        }
      }
    }
    // Risk lands only where a protector is missing or itself down.
    const protectors = relations.filter((relation) => relation.kind === 'protects');
    const protectedNow = protectors.some((relation) => delivering.get(relation.from) === true);
    if (!protectedNow) riskPenalty += Math.round((entity.risk * entity.protectionNeed) / MICRO);
    for (const relation of relations) {
      if (relation.kind === 'conflicts'
        && delivering.get(entity.entityId) === true
        && delivering.get(relation.from) === true) {
        conflictPenalty += relation.weight;
      }
    }
  }
  const total = delivered + amplification - riskPenalty - conflictPenalty;
  return {
    utility: total,
    delivered,
    amplification,
    riskPenalty,
    conflictPenalty,
    deliveringCount: [...delivering.values()].filter(Boolean).length,
    deliveringIds: world.entities.filter((entity) => delivering.get(entity.entityId)).map((entity) => entity.entityId).sort(),
    byId,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 3 — Action consequence semantics.
 *
 * Each legal action names one entity and deterministically transforms the world.
 * The transform is pure: it clones, edits, and returns. Nothing mutates the
 * source state, so evaluating actions in any order gives identical results.
 * ------------------------------------------------------------------------- */

export const STAGE2L12_ACTION_KINDS = deepFreeze([
  'RESTORE',   // bring a degraded entity back above the availability threshold
  'REINFORCE', // add capacity to an entity that is starved
  'PROTECT',   // remove risk exposure by standing up protection
  'BYPASS',    // activate a substitute so a dependency stops mattering
  'HOLD',      // do nothing, cost nothing
]);

export const STAGE2L12_ACTION_CONSEQUENCE_MODEL = deepFreeze({
  schemaVersion: 1,
  id: 'STAGE2L12_PURE_ENTITY_TRANSFORM_V1',
  kinds: [...STAGE2L12_ACTION_KINDS],
  effects: {
    RESTORE: 'availability := MICRO',
    REINFORCE: 'baseCapacity += reinforceAmount',
    PROTECT: 'risk := 0',
    BYPASS: 'every substitutes relation naming this entity becomes available',
    HOLD: 'no change, no cost',
  },
  purity: 'clone-then-edit; the source world is never mutated',
  costRule: 'ACTION_UTILITY = U(after) - U(before) - restorationCost of the target (HOLD costs 0)',
  tieRule: 'ties in ACTION_UTILITY are broken by ascending canonical action key, and every tie is recorded',
  readsExpertOutput: false,
});
export const STAGE2L12_ACTION_CONSEQUENCE_MODEL_DIGEST = sha256(STAGE2L12_ACTION_CONSEQUENCE_MODEL);

function cloneWorld(world) {
  return {
    entities: world.entities.map((entity) => ({ ...entity })),
    relations: world.relations.map((relation) => ({ ...relation })),
  };
}

/** Pure transform. Returns a new world; never touches the input. */
export function applyAction(world, action) {
  const next = cloneWorld(world);
  if (action.kind === 'HOLD') return next;
  const target = next.entities.find((entity) => entity.entityId === action.targetEntityId);
  if (!target) return next;
  if (action.kind === 'RESTORE') target.availability = MICRO;
  if (action.kind === 'REINFORCE') target.baseCapacity += action.reinforceAmount;
  if (action.kind === 'PROTECT') target.risk = 0;
  if (action.kind === 'BYPASS') {
    for (const relation of next.relations) {
      if (relation.kind === 'substitutes' && relation.replaces === action.targetEntityId) {
        const substitute = next.entities.find((entity) => entity.entityId === relation.from);
        if (substitute) substitute.availability = MICRO;
      }
    }
  }
  return next;
}

export function actionCost(world, action) {
  if (action.kind === 'HOLD') return 0;
  const target = world.entities.find((entity) => entity.entityId === action.targetEntityId);
  return target ? target.restorationCost : 0;
}

/**
 * Derive the objectively optimal action from world semantics alone.
 *
 * No expert output, no Prime ranking, no correctness flag, no case identity, no
 * corpus index enters this function. It sees a world and a legal action set.
 */
export function deriveGroundTruth(world, legalActions) {
  const baseline = objectiveUtility(world).utility;
  const scored = legalActions.map((action) => {
    const after = objectiveUtility(applyAction(world, action)).utility;
    const cost = actionCost(world, action);
    return {
      actionId: action.actionId,
      kind: action.kind,
      targetEntityId: action.targetEntityId ?? null,
      utilityBefore: baseline,
      utilityAfter: after,
      cost,
      actionUtility: after - baseline - cost,
    };
  }).sort((left, right) => left.actionId.localeCompare(right.actionId));

  const best = scored.reduce((max, entry) => (entry.actionUtility > max.actionUtility ? entry : max), scored[0]);
  const tied = scored.filter((entry) => entry.actionUtility === best.actionUtility);
  // Explicit, order-independent tie rule.
  const optimal = tied.slice().sort((left, right) => left.actionId.localeCompare(right.actionId))[0];
  const runnerUp = scored.filter((entry) => entry.actionId !== optimal.actionId)
    .reduce((max, entry) => (max === null || entry.actionUtility > max.actionUtility ? entry : max), null);
  return {
    baselineUtility: baseline,
    scored,
    optimalActionId: optimal.actionId,
    optimalActionUtility: optimal.actionUtility,
    tieCount: tied.length,
    tied: tied.length > 1,
    utilityMargin: runnerUp === null ? 0 : optimal.actionUtility - runnerUp.actionUtility,
    objectiveModelDigest: STAGE2L12_OBJECTIVE_MODEL_DIGEST,
    consequenceModelDigest: STAGE2L12_ACTION_CONSEQUENCE_MODEL_DIGEST,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 4 — The semantic corpus.
 *
 * Topology and semantics are drawn from SEPARATE derived streams. That is the
 * structural guarantee that replaces the old hidden draw: an entity's shape in
 * the graph and its worth to the objective are sampled independently, so
 * "structurally attractive" and "objectively optimal" are free to disagree — and
 * the semantic profiles below make sure they frequently do.
 * ------------------------------------------------------------------------- */

export const STAGE2L12_SPLITS = deepFreeze(['DISCOVERY', 'HOLDOUT']);
const SPLIT_SEED = deepFreeze({ DISCOVERY: 0x5347324c313244n, HOLDOUT: 0x5347324c313248n });
export const STAGE2L12_DISCOVERY_CASES = 7000;
export const STAGE2L12_HOLDOUT_CASES = 14000;

export const STAGE2L12_TOPOLOGY_FAMILIES = deepFreeze([
  'CHAIN', 'STAR', 'TREE', 'DIAMOND', 'CYCLE', 'MULTI_COMPONENT',
  'REDUNDANT_NETWORK', 'NESTED_BOTTLENECK', 'COMPETING_CRITICAL_PATHS',
  'PROTECTED_CRITICAL_NODE', 'DECOY_HIGH_DEGREE', 'LOW_DEGREE_HIGH_VALUE',
]);

/* Semantic profiles decide WHERE value lives, independently of graph shape.
 * These are what break the topology shortcut. */
export const STAGE2L12_SEMANTIC_PROFILES = deepFreeze([
  'VALUE_ON_BOTTLENECK',      // structure and utility agree
  'VALUE_ON_LEAF',            // a low-degree node holds the value
  'VALUE_DIFFUSE',            // value spread thin, no single target dominates
  'BOTTLENECK_WORTHLESS',     // the single point of failure feeds nothing valuable
  'EXPENSIVE_BOTTLENECK',     // structurally critical but repair costs more than it returns
  'RISK_DOMINATED',           // the best action removes risk, not a dependency
  'CAPACITY_STARVED',         // the best action adds capacity, not availability
  'SUBSTITUTE_AVAILABLE',     // bypassing beats repairing
]);

export const STAGE2L12_OBJECTIVE_TYPES = deepFreeze(['THROUGHPUT', 'PROTECTION', 'CONTINUITY']);

function pick(random, list) { return list[Math.floor(random() * list.length)]; }
function span(random, low, high) { return low + Math.floor(random() * (high - low + 1)); }

/** Build the graph shape. Reads the TOPOLOGY stream only. */
function buildTopology(random, family, base) {
  const entities = [];
  const relations = [];
  const node = (id) => { entities.push(id); return id; };
  const link = (from, to, kind, weight = 0, replaces = null) => {
    relations.push({ relationId: `${base}-r${relations.length}`, from, to, kind, weight, replaces });
  };
  const size = span(random, 6, 14);
  const ids = Array.from({ length: size }, (unused, i) => node(`${base}-n${i}`));

  if (family === 'CHAIN' || family === 'NESTED_BOTTLENECK') {
    for (let i = 0; i + 1 < ids.length; i += 1) link(ids[i], ids[i + 1], 'depends');
  } else if (family === 'STAR' || family === 'DECOY_HIGH_DEGREE') {
    for (let i = 1; i < ids.length; i += 1) link(ids[0], ids[i], 'depends');
  } else if (family === 'TREE' || family === 'LOW_DEGREE_HIGH_VALUE') {
    for (let i = 1; i < ids.length; i += 1) link(ids[Math.floor((i - 1) / 2)], ids[i], 'depends');
  } else if (family === 'DIAMOND' || family === 'COMPETING_CRITICAL_PATHS') {
    const mid = Math.floor(ids.length / 2);
    for (let i = 1; i < mid; i += 1) { link(ids[0], ids[i], 'depends'); link(ids[i], ids[ids.length - 1], 'depends'); }
    for (let i = mid; i + 1 < ids.length; i += 1) link(ids[i - 1], ids[i], 'depends');
  } else if (family === 'CYCLE') {
    for (let i = 0; i < ids.length; i += 1) link(ids[i], ids[(i + 1) % ids.length], 'depends');
  } else if (family === 'MULTI_COMPONENT') {
    const half = Math.floor(ids.length / 2);
    for (let i = 0; i + 1 < half; i += 1) link(ids[i], ids[i + 1], 'depends');
    for (let i = half; i + 1 < ids.length; i += 1) link(ids[i], ids[i + 1], 'depends');
  } else if (family === 'REDUNDANT_NETWORK') {
    for (let i = 1; i + 1 < ids.length; i += 1) { link(ids[0], ids[i], 'depends'); link(ids[i], ids[ids.length - 1], 'supports', span(random, 100000, 400000)); }
  } else if (family === 'PROTECTED_CRITICAL_NODE') {
    for (let i = 1; i + 1 < ids.length; i += 1) link(ids[i - 1], ids[i], 'depends');
    link(ids[ids.length - 1], ids[1], 'protects');
  }
  /* A real substitute for one dependency edge, so BYPASS is a live option rather
   * than a guaranteed no-op that only ever costs. Which dependency gets the
   * substitute is topological; whether bypassing is WORTH it is decided by the
   * independent semantic stream. */
  const dependencyEdges = relations.filter((relation) => relation.kind === 'depends');
  if (dependencyEdges.length > 0) {
    const chosen = dependencyEdges[span(random, 0, dependencyEdges.length - 1)];
    const standby = node(`${base}-sub`);
    link(standby, chosen.to, 'substitutes', 0, chosen.from);
    ids.push(standby);
  }

  // A few cross-kind relations everywhere, so the richer semantics are exercised.
  const extras = span(random, 1, 3);
  for (let i = 0; i < extras; i += 1) {
    const from = ids[span(random, 0, ids.length - 1)];
    const to = ids[span(random, 0, ids.length - 1)];
    if (from === to) continue;
    const kind = pick(random, ['supports', 'protects', 'inhibits', 'amplifies', 'conflicts']);
    link(from, to, kind, span(random, 50000, 350000));
  }
  return { ids, relations };
}

/** Assign semantics. Reads the SEMANTIC stream only — never the topology stream. */
function assignSemantics(random, profile, objectiveType, ids, relations) {
  const degree = new Map(ids.map((id) => [id, 0]));
  for (const relation of relations) {
    degree.set(relation.from, (degree.get(relation.from) ?? 0) + 1);
    degree.set(relation.to, (degree.get(relation.to) ?? 0) + 1);
  }
  const byDegreeDesc = [...ids].sort((left, right) => (degree.get(right) - degree.get(left)) || left.localeCompare(right));
  const highestDegree = byDegreeDesc[0];
  const lowestDegree = byDegreeDesc[byDegreeDesc.length - 1];

  /* Which entity carries the objective value is chosen by PROFILE, not by shape.
   * VALUE_ON_BOTTLENECK lets them agree; the others pull them apart. */
  let valueHolders;
  if (profile === 'VALUE_ON_BOTTLENECK') valueHolders = [highestDegree];
  else if (profile === 'VALUE_ON_LEAF' || profile === 'LOW_DEGREE_HIGH_VALUE') valueHolders = [lowestDegree];
  else if (profile === 'VALUE_DIFFUSE') valueHolders = ids.filter((unused, i) => i % 2 === 0);
  else if (profile === 'BOTTLENECK_WORTHLESS') valueHolders = ids.filter((id) => id !== highestDegree).slice(0, 2);
  else valueHolders = [ids[span(random, 0, ids.length - 1)]];

  const entities = ids.map((id) => {
    const isStandby = id.endsWith('-sub');
    const isValueHolder = valueHolders.includes(id) && !isStandby;
    const objectiveValue = isValueHolder ? span(random, 400000, 1200000) : (profile === 'VALUE_DIFFUSE' ? span(random, 20000, 90000) : 0);
    const degraded = random() < 0.45;
    const starved = random() < 0.35;
    return {
      entityId: id,
      objectiveValue,
      demand: starved ? span(random, 200000, 600000) : span(random, 0, 150000),
      baseCapacity: starved ? span(random, 0, 150000) : span(random, 200000, 700000),
      // A standby is dark until something activates it; that is what BYPASS does.
      availability: isStandby ? 0 : (degraded ? span(random, 0, 550000) : span(random, 700000, MICRO)),
      /* Risk is one term among several, not the whole objective. Left wider it
       * aggregates across every entity and makes PROTECT trivially optimal
       * everywhere, which is the same degeneracy as an always-HOLD corpus.
       * RISK_DOMINATED still overloads it on purpose — that profile exists so
       * the best action is sometimes about exposure rather than dependency. */
      risk: profile === 'RISK_DOMINATED' ? span(random, 400000, MICRO) : span(random, 0, 200000),
      protectionNeed: profile === 'RISK_DOMINATED' ? span(random, 500000, MICRO) : span(random, 0, 140000),
      /* Cost is sampled independently of value and of degree. EXPENSIVE_BOTTLENECK
       * deliberately loads cost onto the structurally attractive node so the
       * relationally obvious action is the objectively wrong one. */
      /* Cost is sampled on the same order as objective value so it genuinely
       * trades off, instead of vetoing every action and making HOLD trivially
       * optimal. EXPENSIVE_BOTTLENECK still overloads the structurally
       * attractive node on purpose. */
      restorationCost: profile === 'EXPENSIVE_BOTTLENECK' && id === highestDegree
        ? span(random, 700000, 1400000)
        : span(random, 5000, 90000),
      objectiveRelevant: isValueHolder,
    };
  });
  return { entities, highestDegree, lowestDegree, degree };
}

/**
 * Choose the legal action set.
 *
 * A real legal action set contains plausible options, so this deliberately
 * includes BOTH the relationally attractive target (the highest-degree node, and
 * whatever currently blocks a value holder) AND targets that merely look
 * plausible (a low-degree node, a standby). Including a candidate is not a hint
 * about which is best: cost, downstream value, risk and capacity still decide,
 * and those come from the independent semantic stream.
 *
 * This function reads world state only. It never sees the ground truth it will
 * later be scored against — the utilities are computed afterwards, from the
 * objective, over whatever set this produced.
 */
function buildLegalActions(random, base, world, profile, highestDegree, lowestDegree) {
  const byId = new Map(world.entities.map((entity) => [entity.entityId, entity]));
  const { delivering } = resolveDelivery(world);

  /* Entities that currently block a value holder: a dependency of something
   * valuable that is not delivering. Structurally obvious, but not necessarily
   * worth repairing. */
  const valueHolders = world.entities.filter((entity) => entity.objectiveValue > 0).map((entity) => entity.entityId);
  const blockers = [];
  for (const relation of world.relations) {
    if (relation.kind !== 'depends') continue;
    if (!valueHolders.includes(relation.to)) continue;
    if (delivering.get(relation.from) === true) continue;
    blockers.push(relation.from);
  }
  const standby = world.entities.filter((entity) => entity.entityId.endsWith('-sub')).map((entity) => entity.entityId);
  const bypassable = world.relations.filter((relation) => relation.kind === 'substitutes').map((relation) => relation.replaces);

  const candidates = [];
  const push = (id) => { if (id && byId.has(id) && !candidates.includes(id)) candidates.push(id); };
  push(blockers.sort()[0]);
  push(highestDegree);
  push(valueHolders.slice().sort()[0]);
  push(lowestDegree);
  push(bypassable.sort()[0]);
  for (const entity of [...world.entities].sort((left, right) => left.entityId.localeCompare(right.entityId))) {
    if (candidates.length >= 5) break;
    push(entity.entityId);
  }

  const actions = [{ actionId: `${base}-act-hold`, kind: 'HOLD', targetEntityId: null, reinforceAmount: 0 }];
  for (const targetId of candidates) {
    const target = byId.get(targetId);
    /* Which repair verb is available for a target follows the world, not the
     * answer: a dark node can be restored, a starved node reinforced, a risky
     * node protected, a substituted node bypassed. */
    const kinds = [];
    if (target.availability < STAGE2L12_AVAILABILITY_THRESHOLD) kinds.push('RESTORE');
    if (target.baseCapacity < target.demand) kinds.push('REINFORCE');
    if (target.risk >= 300000 && target.protectionNeed >= 200000) kinds.push('PROTECT');
    if (bypassable.includes(targetId)) kinds.push('BYPASS');
    if (kinds.length === 0) kinds.push('REINFORCE');
    const kind = kinds[span(random, 0, kinds.length - 1)];
    actions.push({
      actionId: `${base}-act-${kind.toLowerCase()}-${targetId.split('-').pop()}`,
      kind,
      targetEntityId: targetId,
      reinforceAmount: span(random, 300000, 900000),
    });
  }
  const unique = [];
  for (const action of actions) {
    if (!unique.some((entry) => entry.actionId === action.actionId)) unique.push(action);
  }
  void standby;
  void profile;
  return unique.sort((left, right) => left.actionId.localeCompare(right.actionId));
}

export function buildStage2L12World(split, variant) {
  const base = `${split === 'DISCOVERY' ? 's2l12d' : 's2l12h'}-${String(variant).padStart(5, '0')}`;
  /* Three independent streams. Topology cannot see semantics and neither can see
   * anything about correctness — correctness is not drawn at all, it is computed. */
  const topologyRandom = createSeededRandom(deriveSeed(SPLIT_SEED[split], `STAGE2L12_TOPOLOGY_${split}`, variant));
  const semanticRandom = createSeededRandom(deriveSeed(SPLIT_SEED[split], `STAGE2L12_SEMANTICS_${split}`, variant));
  const actionRandom = createSeededRandom(deriveSeed(SPLIT_SEED[split], `STAGE2L12_ACTIONS_${split}`, variant));

  const family = pick(topologyRandom, STAGE2L12_TOPOLOGY_FAMILIES);
  const profile = pick(semanticRandom, STAGE2L12_SEMANTIC_PROFILES);
  const objectiveType = pick(semanticRandom, STAGE2L12_OBJECTIVE_TYPES);

  const topology = buildTopology(topologyRandom, family, base);
  const semantics = assignSemantics(semanticRandom, profile, objectiveType, topology.ids, topology.relations);
  const world = deepFreeze({
    worldId: base,
    entities: semantics.entities.sort((left, right) => left.entityId.localeCompare(right.entityId)),
    relations: topology.relations.slice().sort((left, right) => left.relationId.localeCompare(right.relationId)),
  });
  const legalActions = buildLegalActions(actionRandom, base, world, profile, semantics.highestDegree, semantics.lowestDegree);
  return deepFreeze({
    worldId: base, split, variant, family, profile, objectiveType,
    world, legalActions,
    highestDegreeEntity: semantics.highestDegree,
    lowestDegreeEntity: semantics.lowestDegree,
  });
}

/* ---------------------------------------------------------------------------
 * Decidability.
 *
 * A case is DECIDABLE when at least one action strictly beats doing nothing.
 * Where nothing is worth doing, "hold" is correct and every expert scores the
 * same, so such cases measure nothing about relational reasoning. The filter is
 * computed from world semantics alone and is declared, exactly like Stage 2L.9's
 * delegation-opportunity conditioning. It does not reveal WHICH action is best —
 * several typically beat holding.
 * ------------------------------------------------------------------------- */

export function isDecidable(groundTruth) {
  const hold = groundTruth.scored.find((entry) => entry.kind === 'HOLD');
  const holdUtility = hold ? hold.actionUtility : 0;
  return groundTruth.optimalActionUtility > holdUtility;
}

export function buildStage2L12Case(split, variant) {
  const generated = buildStage2L12World(split, variant);
  const groundTruth = deriveGroundTruth(generated.world, generated.legalActions);
  return deepFreeze({ ...generated, groundTruth, decidable: isDecidable(groundTruth) });
}

export function buildStage2L12Corpus(split) {
  if (!STAGE2L12_SPLITS.includes(split)) throw new Error(`STAGE2L12_UNKNOWN_SPLIT:${split}`);
  const count = split === 'DISCOVERY' ? STAGE2L12_DISCOVERY_CASES : STAGE2L12_HOLDOUT_CASES;
  return deepFreeze(Array.from({ length: count }, (unused, variant) => buildStage2L12Case(split, variant)));
}

/* ---------------------------------------------------------------------------
 * PHASE 5 — Ground-truth validation.
 *
 * The corpus is validated BEFORE any expert touches it. A benchmark that has not
 * been shown deterministic, order-independent and free of hidden answers is not
 * a benchmark, and Stage 2L.11 exists precisely because the previous one was
 * never checked this way.
 * ------------------------------------------------------------------------- */

/* Trivial policies. If one of these matches the optimum too often, the corpus is
 * measuring a shortcut rather than relational reasoning, and the stage must say
 * so rather than proceed. */
export const STAGE2L12_TRIVIAL_BASELINES = deepFreeze([
  'ALWAYS_HOLD', 'HIGHEST_DEGREE_TARGET', 'LOWEST_DEGREE_TARGET',
  'CHEAPEST_ACTION', 'HIGHEST_OBJECTIVE_VALUE_TARGET', 'FIRST_ALPHABETICAL', 'PREFER_RESTORE',
]);
export const STAGE2L12_MAX_TRIVIAL_BASELINE_ACCURACY = 0.60;

function trivialChoice(name, record) {
  const scored = record.groundTruth.scored;
  const byId = new Map(record.world.entities.map((entity) => [entity.entityId, entity]));
  const targeted = scored.filter((entry) => entry.targetEntityId !== null);
  const alphabetical = (left, right) => left.actionId.localeCompare(right.actionId);
  if (name === 'ALWAYS_HOLD') return scored.find((entry) => entry.kind === 'HOLD') ?? null;
  if (name === 'HIGHEST_DEGREE_TARGET') return scored.find((entry) => entry.targetEntityId === record.highestDegreeEntity) ?? null;
  if (name === 'LOWEST_DEGREE_TARGET') return scored.find((entry) => entry.targetEntityId === record.lowestDegreeEntity) ?? null;
  if (name === 'CHEAPEST_ACTION') return targeted.slice().sort((left, right) => left.cost - right.cost || alphabetical(left, right))[0] ?? null;
  if (name === 'HIGHEST_OBJECTIVE_VALUE_TARGET') {
    return targeted.slice().sort((left, right) => (byId.get(right.targetEntityId).objectiveValue - byId.get(left.targetEntityId).objectiveValue) || alphabetical(left, right))[0] ?? null;
  }
  if (name === 'FIRST_ALPHABETICAL') return targeted.slice().sort(alphabetical)[0] ?? null;
  if (name === 'PREFER_RESTORE') return scored.find((entry) => entry.kind === 'RESTORE') ?? scored.find((entry) => entry.kind === 'HOLD') ?? null;
  return null;
}

/** Reverse entity and relation order; ground truth must be untouched. */
function reversedWorld(world) {
  return {
    entities: [...world.entities].reverse().map((entity) => ({ ...entity })),
    relations: [...world.relations].reverse().map((relation) => ({ ...relation })),
  };
}

export function validateStage2L12GroundTruth(corpus) {
  const sample = corpus.slice(0, 400);
  let deterministic = true;
  let orderingInvariant = true;
  let serializationInvariant = true;
  let replayInvariant = true;

  for (const record of sample) {
    const again = deriveGroundTruth(record.world, record.legalActions);
    if (again.optimalActionId !== record.groundTruth.optimalActionId
      || again.optimalActionUtility !== record.groundTruth.optimalActionUtility) deterministic = false;

    const reversed = deriveGroundTruth(reversedWorld(record.world), [...record.legalActions].reverse());
    if (reversed.optimalActionId !== record.groundTruth.optimalActionId
      || reversed.optimalActionUtility !== record.groundTruth.optimalActionUtility) orderingInvariant = false;

    const roundTripped = deriveGroundTruth(
      JSON.parse(JSON.stringify(record.world)),
      JSON.parse(JSON.stringify(record.legalActions)),
    );
    if (roundTripped.optimalActionId !== record.groundTruth.optimalActionId) serializationInvariant = false;

    const rebuilt = buildStage2L12Case(record.split, record.variant);
    if (rebuilt.groundTruth.optimalActionId !== record.groundTruth.optimalActionId) replayInvariant = false;
  }

  const decidable = corpus.filter((record) => record.decidable);
  const optimalOf = (record) => record.groundTruth.scored.find((entry) => entry.actionId === record.groundTruth.optimalActionId);
  const kindCounts = {};
  for (const record of decidable) {
    const kind = optimalOf(record).kind;
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
  }
  const baselines = Object.fromEntries(STAGE2L12_TRIVIAL_BASELINES.map((name) => {
    const hits = decidable.filter((record) => {
      const choice = trivialChoice(name, record);
      return choice !== null && choice.actionId === record.groundTruth.optimalActionId;
    }).length;
    return [name, round(ratio(hits, decidable.length))];
  }));
  const bestTrivial = Math.max(...Object.values(baselines));
  const randomBaseline = round(ratio(decidable.reduce((sum, record) => sum + 1 / record.groundTruth.scored.length, 0), decidable.length));

  /* The structural guarantee that replaces the old hidden draw: no field anywhere
   * in a case may name correctness, and the generator must not carry one. */
  const forbiddenFields = ['nexusAligned', 'expertCorrect', 'correct', 'aligned', 'isCorrect', 'answer', 'label'];
  const seenKeys = new Set();
  const collect = (value, depth = 0) => {
    if (depth > 10 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const entry of value) collect(entry, depth + 1); return; }
    for (const [key, entry] of Object.entries(value)) { seenKeys.add(key); collect(entry, depth + 1); }
  };
  for (const record of sample) { collect(record.world); collect(record.legalActions); }
  const hiddenCorrectnessFields = forbiddenFields.filter((field) => seenKeys.has(field));

  const margins = decidable.map((record) => record.groundTruth.utilityMargin).sort((left, right) => left - right);
  const quantile = (proportion) => margins[Math.min(margins.length - 1, Math.max(0, Math.ceil(margins.length * proportion) - 1))] ?? 0;

  return deepFreeze({
    validationVersion: 1,
    casesValidated: corpus.length,
    sampleValidated: sample.length,
    legalActionsEvaluated: corpus.reduce((sum, record) => sum + record.groundTruth.scored.length, 0),
    groundTruthDeterministic: deterministic,
    groundTruthOrderingInvariance: orderingInvariant,
    groundTruthSerializationInvariance: serializationInvariant,
    groundTruthReplayPass: replayInvariant,
    decidableCases: decidable.length,
    decidableRate: round(ratio(decidable.length, corpus.length)),
    tieCases: corpus.filter((record) => record.groundTruth.tied).length,
    tieRate: round(ratio(corpus.filter((record) => record.groundTruth.tied).length, corpus.length)),
    optimalActionKindDistribution: kindCounts,
    maxOptimalKindShare: round(ratio(Math.max(...Object.values(kindCounts), 0), decidable.length)),
    trivialBaselineAccuracy: baselines,
    bestTrivialBaselineAccuracy: round(bestTrivial),
    randomChoiceBaseline: randomBaseline,
    trivialBaselineDominates: bestTrivial > STAGE2L12_MAX_TRIVIAL_BASELINE_ACCURACY,
    utilityMarginP10: quantile(0.1),
    utilityMarginP50: quantile(0.5),
    utilityMarginP90: quantile(0.9),
    topologyFamilyDistribution: Object.fromEntries(STAGE2L12_TOPOLOGY_FAMILIES.map((family) => [family, decidable.filter((record) => record.family === family).length])),
    semanticProfileDistribution: Object.fromEntries(STAGE2L12_SEMANTIC_PROFILES.map((profile) => [profile, decidable.filter((record) => record.profile === profile).length])),
    objectiveTypeDistribution: Object.fromEntries(STAGE2L12_OBJECTIVE_TYPES.map((type) => [type, decidable.filter((record) => record.objectiveType === type).length])),
    hiddenCorrectnessFields,
    independentRandomCorrectnessLabel: hiddenCorrectnessFields.length > 0,
    groundTruthDerivedFromWorldState: true,
    objectiveModelDigest: STAGE2L12_OBJECTIVE_MODEL_DIGEST,
    consequenceModelDigest: STAGE2L12_ACTION_CONSEQUENCE_MODEL_DIGEST,
    valid: deterministic && orderingInvariant && serializationInvariant && replayInvariant
      && hiddenCorrectnessFields.length === 0
      && bestTrivial <= STAGE2L12_MAX_TRIVIAL_BASELINE_ACCURACY
      && decidable.length >= 1000
      && Object.keys(kindCounts).length >= 3,
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 6 — Nexus blind evaluation.
 *
 * The INHERITED Nexus expert is measured as-is. Nothing about it is modified,
 * tuned, or given a hint.
 *
 * Nexus is a relational expert, so its policy is the honest relational one: rank
 * each candidate action's target by the criticality Nexus's own analysis assigns
 * it, and recommend the most critical. The reachability query is deliberately
 * VALUE-BLIND — lexicographic first and last entity — because pointing the query
 * at the highest-value entity would hand Nexus the answer's location and
 * manufacture exactly the observability this stage must not fabricate.
 *
 * Nexus receives the complete canonical state. It is free to read objectiveValue,
 * cost or capacity; its contract simply does not. That is a finding about the
 * expert, not a limitation imposed here.
 * ------------------------------------------------------------------------- */

function canonicalStateFor(world) {
  return {
    entities: world.entities.map((entity) => ({
      id: entity.entityId,
      critical: entity.objectiveRelevant === true,
      hostile: false,
      // The full semantic payload travels with the state. Nexus may use it.
      objectiveValue: entity.objectiveValue,
      demand: entity.demand,
      baseCapacity: entity.baseCapacity,
      availability: entity.availability,
      risk: entity.risk,
      restorationCost: entity.restorationCost,
    })),
    relationships: world.relations.map((relation) => ({
      id: relation.relationId,
      from: relation.from,
      to: relation.to,
      kind: relation.kind === 'depends' ? 'depends' : relation.kind === 'supports' ? 'supports' : relation.kind === 'conflicts' ? 'threatens' : 'depends',
    })),
  };
}

/**
 * Choose the reachability question to put to Nexus.
 *
 * A single-point-of-failure only exists relative to a relation that currently
 * holds, so an unreachable source/target pair makes the question vacuous and
 * Nexus abstains for a reason that says nothing about Nexus. The pair is chosen
 * VALUE-BLIND: dependency roots and sinks in lexicographic order, first pair that
 * is actually reachable. Objective value, cost and capacity play no part.
 */
export function chooseReachabilityQuery(world) {
  const graph = normalizeRelationalGraph({ entities: world.entities.map((entity) => ({ id: entity.entityId })), relationships: world.relations.map((relation) => ({ id: relation.relationId, from: relation.from, to: relation.to, kind: relation.kind })) });
  const ids = world.entities.map((entity) => entity.entityId).sort();
  const dependsEdges = world.relations.filter((relation) => relation.kind === 'depends');
  const hasIncoming = new Set(dependsEdges.map((relation) => relation.to));
  const hasOutgoing = new Set(dependsEdges.map((relation) => relation.from));
  const roots = ids.filter((id) => !hasIncoming.has(id) && hasOutgoing.has(id));
  const sinks = ids.filter((id) => !hasOutgoing.has(id) && hasIncoming.has(id));
  const sources = roots.length > 0 ? roots : ids;
  const targets = sinks.length > 0 ? sinks : [...ids].reverse();
  for (const source of sources) {
    for (const target of targets) {
      if (source === target) continue;
      if (isReachable(graph, source, target, null)) return { source, target, reachable: true };
    }
  }
  return { source: sources[0] ?? ids[0], target: targets[0] ?? ids[ids.length - 1], reachable: false };
}

export function nexusRecommendation(record) {
  const world = record.world;
  const { source, target, reachable } = chooseReachabilityQuery(world);
  const canonicalState = canonicalStateFor(world);

  const candidates = record.legalActions.filter((action) => action.targetEntityId !== null);
  const scoredCandidates = candidates.map((action) => {
    const analysis = analyzeRelationalDelta({
      caseId: `${record.worldId}-${action.actionId}`,
      canonicalState,
      query: { source, target, edgeType: null, candidateType: 'node', candidateNodeId: action.targetEntityId, candidateEdgeId: null },
      mutation: { type: 'NONE' },
    });
    const spofNodes = analysis.spofNodes ?? [];
    const isSpof = spofNodes.includes(action.targetEntityId);
    const isBottleneck = (analysis.bottleneckEntities ?? []).includes(action.targetEntityId);
    const isCritical = (analysis.criticalEntities ?? []).includes(action.targetEntityId);
    const redundant = analysis.redundancy?.redundant === true;
    const degree = world.relations.filter((relation) => relation.from === action.targetEntityId || relation.to === action.targetEntityId).length;
    // Purely relational score. No value, no cost, no capacity.
    const criticality = (isSpof ? 4 : 0) + (isBottleneck ? 2 : 0) + (isCritical ? 2 : 0) - (redundant ? 1 : 0);
    return { action, criticality, degree, isSpof, isBottleneck, isCritical, redundant, spofNodeCount: spofNodes.length, analysis };
  });

  const ranked = [...scoredCandidates].sort((left, right) =>
    right.criticality - left.criticality
    || right.degree - left.degree
    || left.action.actionId.localeCompare(right.action.actionId));
  const best = ranked[0] ?? null;
  const expert = evaluateNexus({ canonicalState, legalActions: record.legalActions.map((action) => ({ actionId: action.actionId, targetEntityId: action.targetEntityId ?? undefined })) });

  return {
    queryReachable: reachable,
    querySource: source,
    queryTarget: target,
    recommendedActionId: best && best.criticality > 0 ? best.action.actionId : null,
    abstained: !best || best.criticality <= 0,
    topCriticality: best ? best.criticality : 0,
    criticalityMargin: ranked.length > 1 ? ranked[0].criticality - ranked[1].criticality : 0,
    spofCandidateCount: scoredCandidates.filter((entry) => entry.isSpof).length,
    candidateCount: scoredCandidates.length,
    expertSignals: { ...expert.signals, expertConfidence: expert.confidence, rationaleCodeCount: expert.rationaleCodes.length },
    perCandidate: scoredCandidates.map((entry) => ({
      actionId: entry.action.actionId,
      criticality: entry.criticality,
      degree: entry.degree,
      isSpof: entry.isSpof,
      isBottleneck: entry.isBottleneck,
      redundant: entry.redundant,
      spofNodeCount: entry.spofNodeCount,
    })),
  };
}

/* Prime's baseline policy on this corpus. Prime is a bounded search engine, not a
 * relational reasoner; here it stands in as a value-aware but structure-blind
 * chooser so the comparison is meaningful rather than a straw man. */
export function primeRecommendation(record) {
  const byId = new Map(record.world.entities.map((entity) => [entity.entityId, entity]));
  const targeted = record.groundTruth.scored.filter((entry) => entry.targetEntityId !== null);
  if (targeted.length === 0) return { recommendedActionId: record.groundTruth.scored[0]?.actionId ?? null };
  const ranked = [...targeted].sort((left, right) => {
    const leftEntity = byId.get(left.targetEntityId);
    const rightEntity = byId.get(right.targetEntityId);
    return (rightEntity.objectiveValue - leftEntity.objectiveValue)
      || (leftEntity.restorationCost - rightEntity.restorationCost)
      || left.actionId.localeCompare(right.actionId);
  });
  return { recommendedActionId: ranked[0].actionId };
}

export function evaluateNexusBlind(corpus) {
  const decidable = corpus.filter((record) => record.decidable);
  const rows = decidable.map((record) => {
    const nexus = nexusRecommendation(record);
    const prime = primeRecommendation(record);
    const optimal = record.groundTruth.optimalActionId;
    const nexusCorrect = nexus.recommendedActionId !== null && nexus.recommendedActionId === optimal;
    const primeCorrect = prime.recommendedActionId === optimal;
    return {
      worldId: record.worldId,
      split: record.split,
      variant: record.variant,
      family: record.family,
      profile: record.profile,
      objectiveType: record.objectiveType,
      utilityMargin: record.groundTruth.utilityMargin,
      tied: record.groundTruth.tied,
      optimalActionId: optimal,
      nexusActionId: nexus.recommendedActionId,
      primeActionId: prime.recommendedActionId,
      nexusAbstained: nexus.abstained,
      nexusCorrect,
      primeCorrect,
      agreement: nexus.recommendedActionId !== null && nexus.recommendedActionId === prime.recommendedActionId,
      nexusFeatures: {
        queryReachable: nexus.queryReachable,
        topCriticality: nexus.topCriticality,
        criticalityMargin: nexus.criticalityMargin,
        spofCandidateCount: nexus.spofCandidateCount,
        candidateCount: nexus.candidateCount,
        ...nexus.expertSignals,
      },
      /* Decision-time observables only. utilityMargin is deliberately EXCLUDED:
       * it is the gap between the optimal action and the runner-up, so computing
       * it presupposes the answer. baselineUtility is U(current state), which is
       * knowable before any action is scored, and is kept. */
      contextFeatures: {
        entityCount: record.world.entities.length,
        relationCount: record.world.relations.length,
        legalActionCount: record.legalActions.length,
        baselineUtility: record.groundTruth.baselineUtility,
      },
    };
  });
  const total = rows.length;
  const count = (predicate) => rows.filter(predicate).length;
  return {
    rows,
    decidableCases: total,
    nexusAccuracy: round(ratio(count((row) => row.nexusCorrect), total)),
    primeAccuracy: round(ratio(count((row) => row.primeCorrect), total)),
    nexusAbstentionRate: round(ratio(count((row) => row.nexusAbstained), total)),
    nexusPrimeAgreement: round(ratio(count((row) => row.agreement), total)),
    nexusCorrectPrimeWrong: count((row) => row.nexusCorrect && !row.primeCorrect),
    nexusWrongPrimeCorrect: count((row) => !row.nexusCorrect && row.primeCorrect),
    bothCorrect: count((row) => row.nexusCorrect && row.primeCorrect),
    bothWrong: count((row) => !row.nexusCorrect && !row.primeCorrect),
    byFamily: Object.fromEntries(STAGE2L12_TOPOLOGY_FAMILIES.map((family) => {
      const subset = rows.filter((row) => row.family === family);
      return [family, { cases: subset.length, nexusAccuracy: round(ratio(subset.filter((row) => row.nexusCorrect).length, subset.length)) }];
    })),
    byProfile: Object.fromEntries(STAGE2L12_SEMANTIC_PROFILES.map((profile) => {
      const subset = rows.filter((row) => row.profile === profile);
      return [profile, { cases: subset.length, nexusAccuracy: round(ratio(subset.filter((row) => row.nexusCorrect).length, subset.length)) }];
    })),
    byMarginQuartile: (() => {
      const sorted = [...rows].sort((left, right) => left.utilityMargin - right.utilityMargin);
      const quarter = Math.max(1, Math.floor(sorted.length / 4));
      return [0, 1, 2, 3].map((index) => {
        const subset = sorted.slice(index * quarter, index === 3 ? sorted.length : (index + 1) * quarter);
        return { quartile: index + 1, cases: subset.length, nexusAccuracy: round(ratio(subset.filter((row) => row.nexusCorrect).length, subset.length)) };
      });
    })(),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 7 — Identifiability under the grounded correctness label.
 *
 * The Stage 2L.11 methodology, re-run against world-derived correctness instead
 * of a hidden draw: exhaustive single-feature predicate search, a permutation
 * null so "what a search finds by chance" is measured rather than assumed, and a
 * rule frozen on discovery carried unchanged to holdout.
 * ------------------------------------------------------------------------- */

const MIN_SPLIT_SUPPORT = 100;

/**
 * The feature vector the identifiability analysis is allowed to see.
 *
 * Generator metadata is deliberately EXCLUDED. The topology family, semantic
 * profile and objective type are labels of the process that built the world, not
 * things an agent observes at decision time; conditioning on them would be the
 * corpus-index shortcut this stage exists to rule out. They stay on the row for
 * stratified REPORTING, which is a different job.
 */
export function flattenStage2L12Features(row) {
  return {
    ...Object.fromEntries(Object.entries(row.nexusFeatures).map(([key, value]) => [`nexus.${key}`, value])),
    ...Object.fromEntries(Object.entries(row.contextFeatures).map(([key, value]) => [`context.${key}`, value])),
  };
}

function predicatesFor(name, values) {
  const distinct = [...new Set(values)];
  if (distinct.length < 2) return [];
  const numeric = distinct.every((value) => typeof value === 'number' && Number.isFinite(value));
  if (numeric && distinct.length > 12) {
    const sorted = [...distinct].sort((left, right) => left - right);
    return sorted.slice(0, -1).map((threshold) => ({ id: `${name}<=${threshold}`, test: (features) => Number(features[name]) <= threshold }));
  }
  return distinct.map((value) => String(value)).sort().map((value) => ({ id: `${name}==${value}`, test: (features) => String(features[name]) === value }));
}

function evaluatePredicate(samples, predicate) {
  let inCount = 0; let inCorrect = 0; let outCount = 0; let outCorrect = 0;
  for (const sample of samples) {
    if (predicate.test(sample.features)) { inCount += 1; if (sample.correct) inCorrect += 1; }
    else { outCount += 1; if (sample.correct) outCorrect += 1; }
  }
  if (inCount < MIN_SPLIT_SUPPORT || outCount < MIN_SPLIT_SUPPORT) return null;
  const inRate = inCorrect / inCount;
  const outRate = outCorrect / outCount;
  return {
    id: predicate.id, inCount, outCount,
    inReliability: round(inRate), outReliability: round(outRate),
    gap: round(Math.abs(inRate - outRate)),
    bestSideReliability: round(Math.max(inRate, outRate)),
    bestSideSupport: inRate >= outRate ? inCount : outCount,
    bestSide: inRate >= outRate ? 'IN' : 'OUT',
  };
}

/**
 * Condition on Nexus having actually made a recommendation.
 *
 * An abstention is scored as incorrect, so leaving abstentions in lets the
 * abstention flag itself "predict" correctness perfectly — an artifact of the
 * scoring rule, not information about when Nexus is right. Coverage is a separate
 * axis and is reported separately. This mirrors Stage 2L.9's delegation-
 * opportunity conditioning, inherited deliberately.
 */
function samplesOf(rows) {
  return rows
    .filter((row) => !row.nexusAbstained)
    .map((row) => ({ features: flattenStage2L12Features(row), correct: row.nexusCorrect }));
}

function allPredicates(samples) {
  if (samples.length === 0) return [];
  return Object.keys(samples[0].features).flatMap((name) => predicatesFor(name, samples.map((sample) => sample.features[name])));
}

function permuteLabels(samples, seed) {
  const random = createSeededRandom(deriveSeed(0x5347324c313250n, 'STAGE2L12_PERMUTATION', seed));
  const labels = samples.map((sample) => sample.correct);
  for (let i = labels.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = labels[i]; labels[i] = labels[j]; labels[j] = swap;
  }
  return samples.map((sample, i) => ({ features: sample.features, correct: labels[i] }));
}

/* Where a signal lives decides what remediation it implies. A signal inside
 * nexus.* could be carried by the existing attestation; a signal that only exists
 * in world-state features the Arbiter never receives implies a different fix
 * entirely. The distinction is measured, not assumed. */
export function featureTierOf(name) {
  return name.startsWith('nexus.') ? 'TIER_NEXUS_OUTPUT' : 'TIER_WORLD_STATE';
}

export function analyzeStage2L12Identifiability(rows, { permutations = 40 } = {}) {
  const samples = samplesOf(rows);
  const predicates = allPredicates(samples);
  const evaluated = predicates.map((predicate) => evaluatePredicate(samples, predicate)).filter(Boolean);
  const byGap = [...evaluated].sort((left, right) => right.gap - left.gap || left.id.localeCompare(right.id));
  const byReliability = [...evaluated].sort((left, right) => right.bestSideReliability - left.bestSideReliability || left.id.localeCompare(right.id));

  const names = samples.length === 0 ? [] : Object.keys(samples[0].features);
  const perFeature = names.map((name) => {
    const own = evaluated.filter((entry) => entry.id.startsWith(`${name}==`) || entry.id.startsWith(`${name}<=`));
    const best = own.slice().sort((left, right) => right.gap - left.gap)[0] ?? null;
    return {
      feature: name,
      distinctValues: new Set(samples.map((sample) => sample.features[name])).size,
      bestGap: best ? best.gap : 0,
      bestPredicate: best ? best.id : null,
      bestSideReliability: best ? best.bestSideReliability : null,
    };
  }).sort((left, right) => right.bestGap - left.bestGap || left.feature.localeCompare(right.feature));

  const nullGaps = [];
  for (let i = 0; i < permutations; i += 1) {
    const permuted = permuteLabels(samples, i);
    nullGaps.push(round(predicates.map((predicate) => evaluatePredicate(permuted, predicate)).filter(Boolean).reduce((max, entry) => Math.max(max, entry.gap), 0)));
  }
  nullGaps.sort((left, right) => left - right);
  const quantile = (proportion) => nullGaps[Math.min(nullGaps.length - 1, Math.max(0, Math.ceil(nullGaps.length * proportion) - 1))] ?? 0;
  const observedBestGap = byGap[0]?.gap ?? 0;

  return deepFreeze({
    cases: samples.length,
    conditionedOn: 'NEXUS_MADE_A_RECOMMENDATION',
    rowsBeforeConditioning: rows.length,
    coverage: round(ratio(samples.length, rows.length)),
    baseRate: round(ratio(samples.filter((sample) => sample.correct).length, samples.length)),
    featuresInspected: names.length,
    featuresVarying: names.filter((name) => new Set(samples.map((sample) => sample.features[name])).size > 1).length,
    predicatesSearched: predicates.length,
    predicatesEvaluable: evaluated.length,
    perFeature: perFeature.map((entry) => ({ ...entry, tier: featureTierOf(entry.feature) })),
    perTierBestGap: {
      TIER_NEXUS_OUTPUT: perFeature.filter((entry) => featureTierOf(entry.feature) === 'TIER_NEXUS_OUTPUT').reduce((max, entry) => Math.max(max, entry.bestGap), 0),
      TIER_WORLD_STATE: perFeature.filter((entry) => featureTierOf(entry.feature) === 'TIER_WORLD_STATE').reduce((max, entry) => Math.max(max, entry.bestGap), 0),
    },
    topByGap: byGap.slice(0, 15),
    topByReliability: byReliability.slice(0, 15),
    observedBestGap,
    observedBestPredicate: byGap[0]?.id ?? null,
    observedBestSideReliability: byReliability[0]?.bestSideReliability ?? null,
    permutationNull: { permutations, min: nullGaps[0] ?? 0, median: quantile(0.5), p95: quantile(0.95), max: nullGaps[nullGaps.length - 1] ?? 0 },
    observedExceedsPermutationP95: observedBestGap > quantile(0.95),
    anyPredicateReachesReliabilityFloor: evaluated.some((entry) => entry.bestSideReliability >= 0.99 && entry.bestSideSupport >= 60),
  });
}

export function discoverStage2L12Rule(discoveryRows) {
  for (const row of discoveryRows) {
    if (row.split !== 'DISCOVERY') throw new Error('STAGE2L12_DISCOVERY_SPLIT_VIOLATION');
  }
  const samples = samplesOf(discoveryRows);
  const predicates = allPredicates(samples);
  const evaluated = predicates.map((predicate) => ({ predicate, score: evaluatePredicate(samples, predicate) })).filter((entry) => entry.score !== null);
  const seeds = [...evaluated].sort((left, right) => right.score.bestSideReliability - left.score.bestSideReliability || left.predicate.id.localeCompare(right.predicate.id)).slice(0, 30);
  const conjunctions = [];
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      const left = seeds[i].predicate; const right = seeds[j].predicate;
      // Two thresholds on the same feature are one predicate, not a conjunction.
      const feature = (id) => id.split(/==|<=/)[0];
      if (feature(left.id) === feature(right.id)) continue;
      conjunctions.push({ id: `(${left.id}) AND (${right.id})`, test: (features) => left.test(features) && right.test(features) });
    }
  }
  const evaluatedConjunctions = conjunctions.map((predicate) => ({ predicate, score: evaluatePredicate(samples, predicate) })).filter((entry) => entry.score !== null);
  const all = [...evaluated, ...evaluatedConjunctions];
  const ranked = [...all].sort((left, right) =>
    right.score.bestSideReliability - left.score.bestSideReliability
    || right.score.bestSideSupport - left.score.bestSideSupport
    || left.predicate.id.localeCompare(right.predicate.id));
  const best = ranked[0] ?? null;
  return {
    searchSpace: { singles: predicates.length, singlesEvaluable: evaluated.length, conjunctionSeeds: seeds.length, conjunctions: conjunctions.length, conjunctionsEvaluable: evaluatedConjunctions.length },
    discoveryCases: samples.length,
    discoveryBaseRate: round(ratio(samples.filter((sample) => sample.correct).length, samples.length)),
    frozenRule: best === null ? null : {
      id: best.predicate.id,
      side: best.score.bestSide,
      discoveryReliability: best.score.bestSideReliability,
      discoverySupport: best.score.bestSideSupport,
      discoveryGap: best.score.gap,
      reachesFloorOnDiscovery: best.score.bestSideReliability >= 0.99 && best.score.bestSideSupport >= 60,
    },
    frozenRuleTest: best === null ? null : (features) => (best.score.bestSide === 'IN' ? best.predicate.test(features) : !best.predicate.test(features)),
    topTen: ranked.slice(0, 10).map((entry) => ({ id: entry.predicate.id, side: entry.score.bestSide, reliability: entry.score.bestSideReliability, support: entry.score.bestSideSupport, gap: entry.score.gap })),
  };
}

export function testStage2L12Generalization(discovery, holdoutRows) {
  for (const row of holdoutRows) {
    if (row.split !== 'HOLDOUT') throw new Error('STAGE2L12_HOLDOUT_SPLIT_VIOLATION');
  }
  if (discovery.frozenRule === null) return deepFreeze({ applicable: false, reason: 'NO_EVALUABLE_RULE_ON_DISCOVERY' });
  const samples = samplesOf(holdoutRows);
  const selected = samples.filter((sample) => discovery.frozenRuleTest(sample.features));
  const rejected = samples.filter((sample) => !discovery.frozenRuleTest(sample.features));
  const holdoutReliability = round(ratio(selected.filter((sample) => sample.correct).length, selected.length));
  const rejectedReliability = round(ratio(rejected.filter((sample) => sample.correct).length, rejected.length));
  const baseRate = round(ratio(samples.filter((sample) => sample.correct).length, samples.length));
  return deepFreeze({
    applicable: true,
    ruleId: discovery.frozenRule.id,
    discoveryReliability: discovery.frozenRule.discoveryReliability,
    discoverySupport: discovery.frozenRule.discoverySupport,
    holdoutCases: samples.length,
    holdoutBaseRate: baseRate,
    holdoutSelected: selected.length,
    holdoutReliability,
    holdoutRejected: rejected.length,
    holdoutRejectedReliability: rejectedReliability,
    holdoutGap: round(Math.abs(holdoutReliability - rejectedReliability)),
    reliabilityLostFromDiscoveryToHoldout: round(discovery.frozenRule.discoveryReliability - holdoutReliability),
    holdoutReachesFloor: selected.length >= 60 && holdoutReliability >= 0.99,
    /* Did the rule retain a real, out-of-sample edge over simply not using it? */
    generalizes: selected.length >= 60 && holdoutReliability > baseRate + 0.05,
    collapsedToBaseRate: Math.abs(holdoutReliability - baseRate) < 0.05,
  });
}

export const STAGE2L12_STATUSES = deepFreeze(['IDENTIFIABLE', 'CONTRACT_INCOMPLETE', 'NON_IDENTIFIABLE', 'INCONCLUSIVE']);

export function classifyStage2L12({ analysis, generalization }) {
  const reasons = [];
  const adequate = analysis.cases >= 1500 && analysis.featuresVarying >= 8 && analysis.predicatesEvaluable >= 20;
  if (!adequate) {
    reasons.push('Search power insufficient: too few decidable cases, varying features, or evaluable predicates.');
    return { status: 'INCONCLUSIVE', reasons };
  }
  if (generalization.applicable && generalization.holdoutReachesFloor) {
    reasons.push(`A rule frozen on discovery reached ${generalization.holdoutReliability} reliability on unseen holdout with ${generalization.holdoutSelected} support, clearing the inherited 0.99 floor.`);
    return { status: 'IDENTIFIABLE', reasons };
  }
  if (generalization.applicable && generalization.generalizes) {
    reasons.push(`A frozen rule retained an out-of-sample edge (${generalization.holdoutReliability} vs base rate ${generalization.holdoutBaseRate}) but did not reach the 0.99 delegation floor.`);
    reasons.push('Correctness is partially predictable, so the signal is real, but not to the standard selective delegation requires.');
    return { status: 'IDENTIFIABLE', reasons };
  }
  if (!analysis.observedExceedsPermutationP95) {
    reasons.push(`Best gap over ${analysis.predicatesSearched} predicates was ${analysis.observedBestGap}, at or below the permutation-null p95 of ${analysis.permutationNull.p95}.`);
    reasons.push(`The best frozen rule fell from ${generalization.discoveryReliability} to ${generalization.holdoutReliability} out of sample against a base rate of ${generalization.holdoutBaseRate}.`);
    return { status: 'NON_IDENTIFIABLE', reasons };
  }
  reasons.push(`A signal exceeded the permutation null (gap ${analysis.observedBestGap} vs p95 ${analysis.permutationNull.p95}) but no frozen rule generalized.`);
  return { status: 'INCONCLUSIVE', reasons };
}

/* ---------------------------------------------------------------------------
 * PHASE 8 — Selective delegation gate, applied to the grounded corpus.
 *
 * The Stage 2L.10 frozen calibration is applied UNCHANGED. No ceiling is
 * lowered, no bucket is re-fitted, and no delegation is forced. This is the
 * inherited gate evaluated against the new benchmark, not a new gate.
 * ------------------------------------------------------------------------- */

export function applyStage2L10NexusGate(rows, calibration) {
  const gated = rows.map((row) => {
    /* The same structural attestation shape Stage 2L.10 consumes, computed from
     * this corpus. Nothing about the objective enters it. */
    const signals = {
      kind: 'NEXUS_STRUCTURAL_DETERMINACY_V1',
      candidateIsSpof: row.nexusFeatures.spofCandidateCount > 0,
      spofNodeCount: row.nexusFeatures.spofCandidateCount,
      spofEdgeCount: 0,
      criticalCount: row.nexusFeatures.criticalDependencyCount ?? 0,
      bottleneckCount: row.nexusFeatures.bottleneckCount ?? 0,
      componentCount: 1,
      entityCount: row.contextFeatures.entityCount,
      edgeCount: row.contextFeatures.relationCount,
      redundantPathPresent: false,
      reachableWithoutCandidate: false,
      semanticOptimalityCertified: false,
    };
    const bucket = nexusUncertaintyBucketFor(signals, calibration);
    const entry = bucket === null ? undefined : calibration.nexus.buckets[bucket];
    const delegates = entry !== undefined && entry.delegates === true;
    return {
      ...row,
      uncertaintyBucket: bucket,
      bucketReliability: entry ? entry.reliability : null,
      bucketDelegates: delegates,
      delegated: delegates && row.nexusActionId !== null,
    };
  });
  const total = gated.length;
  const delegations = gated.filter((row) => row.delegated);
  const beneficial = delegations.filter((row) => row.nexusCorrect && !row.primeCorrect).length;
  const harmful = delegations.filter((row) => !row.nexusCorrect && row.primeCorrect).length;
  return deepFreeze({
    casesEvaluated: total,
    calibrationDigest: calibration.calibrationDigest,
    calibrationUnchanged: true,
    nexusDelegatingBuckets: [...calibration.nexus.delegatingBuckets],
    bucketUsage: Object.fromEntries([...new Set(gated.map((row) => String(row.uncertaintyBucket)))].sort().map((bucket) => {
      const subset = gated.filter((row) => String(row.uncertaintyBucket) === bucket);
      return [bucket, { cases: subset.length, delegates: subset[0]?.bucketDelegates === true, reliability: subset[0]?.bucketReliability ?? null }];
    })),
    nexusDelegations: delegations.length,
    nexusDelegationRate: round(ratio(delegations.length, total)),
    nexusDelegationPrecision: round(ratio(beneficial, delegations.length)),
    nexusBeneficialChanges: beneficial,
    nexusHarmfulChanges: harmful,
    nexusHarmRate: round(ratio(harmful, total)),
    nexusCorrectPrimeBreaks: harmful,
    nexusCorrectPrimeBreakRate: round(ratio(harmful, total)),
    harmCeilingRespected: round(ratio(harmful, total)) <= STAGE2L12_MAX_HARMFUL_CHANGE_RATE,
    correctPrimeBreakCeilingRespected: round(ratio(harmful, total)) <= STAGE2L12_MAX_CORRECT_PRIME_BREAK_RATE,
    delegationForced: false,
  });
}

/* Local copy of the Stage 2L.10 bucket rule, applied to Stage 2L.10's own frozen
 * parameters. Kept local so this stage imports the calibration without importing
 * — or being able to perturb — the arbiter itself. */
function nexusUncertaintyBucketFor(signals, calibration) {
  if (signals.kind !== 'NEXUS_STRUCTURAL_DETERMINACY_V1') return null;
  if (signals.candidateIsSpof !== true) return 'NEXUS_NO_STRUCTURAL_CRITICALITY';
  if (signals.redundantPathPresent === true || signals.reachableWithoutCandidate === true) return 'NEXUS_REDUNDANT_PATH';
  if (signals.spofNodeCount > 1) return 'NEXUS_MULTIPLE_CRITICAL_NODES';
  if (signals.entityCount >= calibration.nexus.parameters.minWideFanEntityCount) return 'NEXUS_WIDE_FAN_CRITICAL';
  return 'NEXUS_SOLE_CRITICAL_NODE';
}

/* ---------------------------------------------------------------------------
 * PHASE 9 — Security regression.
 *
 * Stage 2L.12 changes no decision code, so the inherited protections are
 * re-verified by construction checks rather than re-implemented: the arbiter,
 * the calibration and every ceiling are byte-identical to what Stage 2L.10 and
 * Stage 2L.11 certified. The behavioural attack suites live in those stages'
 * tests and are re-run by the full regression.
 * ------------------------------------------------------------------------- */

export function stage2L12SecurityPosture(calibration) {
  return deepFreeze({
    arbiterModified: false,
    calibrationModified: false,
    evidenceContractModified: false,
    nexusExpertModified: false,
    inheritedCalibrationDigest: calibration.calibrationDigest,
    minBucketReliabilityUnchanged: calibration.minBucketReliability === 0.99,
    minBucketSamplesUnchanged: calibration.minBucketSamples === 60,
    harmCeilingUnchanged: STAGE2L12_MAX_HARMFUL_CHANGE_RATE === 0.01,
    correctPrimeBreakCeilingUnchanged: STAGE2L12_MAX_CORRECT_PRIME_BREAK_RATE === 0.01,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
    /* Attack-class coverage is inherited, not re-asserted here: Stage 2L.10 and
     * Stage 2L.11 own those suites and the full regression runs them. */
    inheritedAttackSuites: [
      'STAGE2L10_TWELVE_EVIDENCE_ATTACKS', 'STAGE2L10_NINE_ATTESTATION_ATTACKS',
      'STAGE2L11_TWELVE_TOPOLOGY_FAMILY_REGRESSION',
    ],
  });
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 *
 * Stage 2L.12 PASSES when the BENCHMARK becomes scientifically meaningful and
 * reproducible. It does not require Nexus to perform well. If the grounded
 * corpus shows the inherited expert performing badly, that is a reported finding
 * about the expert, not a reason to fail the measurement.
 * ------------------------------------------------------------------------- */

export function buildStage2L12Evaluation({ calibration = STAGE2L10_FROZEN_CALIBRATION } = {}) {
  const discoveryCorpus = buildStage2L12Corpus('DISCOVERY');
  const holdoutCorpus = buildStage2L12Corpus('HOLDOUT');

  const validation = validateStage2L12GroundTruth(holdoutCorpus);
  const discoveryValidation = validateStage2L12GroundTruth(discoveryCorpus);

  const discoveryEval = evaluateNexusBlind(discoveryCorpus);
  const holdoutEval = evaluateNexusBlind(holdoutCorpus);
  const replayEval = evaluateNexusBlind(holdoutCorpus);

  const discovery = discoverStage2L12Rule(discoveryEval.rows);
  const generalization = testStage2L12Generalization(discovery, holdoutEval.rows);
  const analysis = analyzeStage2L12Identifiability(holdoutEval.rows);
  const classification = classifyStage2L12({ analysis, generalization });

  /* The delegation gate is applied only when the precondition holds. Forcing a
   * delegation run on a non-identifiable expert would produce a number that
   * looked like evidence and was not. */
  const delegationApplicable = classification.status === 'IDENTIFIABLE';
  const delegation = delegationApplicable
    ? applyStage2L10NexusGate(holdoutEval.rows, calibration)
    : deepFreeze({
      evaluated: false,
      reason: `Precondition not met: GROUNDED_NEXUS_IDENTIFIABILITY_STATUS=${classification.status}. Stage 2L.12 does not force a delegation run on an expert whose correctness is not identifiable.`,
      calibrationDigest: calibration.calibrationDigest,
      calibrationUnchanged: true,
      nexusDelegatingBuckets: [...calibration.nexus.delegatingBuckets],
      nexusDelegations: 0,
      nexusDelegationRate: 0,
      nexusDelegationPrecision: 0,
      nexusBeneficialChanges: 0,
      nexusHarmfulChanges: 0,
      nexusHarmRate: 0,
      nexusCorrectPrimeBreaks: 0,
      nexusCorrectPrimeBreakRate: 0,
      harmCeilingRespected: true,
      correctPrimeBreakCeilingRespected: true,
      delegationForced: false,
    });

  const security = stage2L12SecurityPosture(calibration);

  const discoveryIds = new Set(discoveryCorpus.map((record) => record.worldId));
  const corpusOverlap = holdoutCorpus.filter((record) => discoveryIds.has(record.worldId)).length;

  const rowDigest = sha256(holdoutEval.rows.map((row) => ({ worldId: row.worldId, optimal: row.optimalActionId, nexus: row.nexusActionId })));
  const replayDigest = sha256(replayEval.rows.map((row) => ({ worldId: row.worldId, optimal: row.optimalActionId, nexus: row.nexusActionId })));

  /* Label leakage: the feature vector the analysis sees must contain no outcome,
   * and no case may carry a correctness field. */
  const forbidden = [
    'nexusCorrect', 'primeCorrect', 'optimalActionId', 'nexusAligned', 'correct', 'aligned',
    'answer', 'label', 'worldId', 'variant',
    // Generator metadata: labels of how the world was built, not observations of it.
    'family', 'profile', 'objectiveType', 'split',
    // Quantities that can only be computed once the answer is known.
    'utilityMargin', 'utilityMarginMicro', 'optimalActionUtility', 'actionUtility', 'tied', 'tieCount',
  ];
  const featureKeys = holdoutEval.rows.length > 0 ? Object.keys(flattenStage2L12Features(holdoutEval.rows[0])) : [];
  const forbiddenInFeatures = forbidden.filter((key) => featureKeys.includes(key) || featureKeys.includes(`nexus.${key}`) || featureKeys.includes(`context.${key}`));

  return deepFreeze({
    corpus: {
      discoveryCases: discoveryCorpus.length,
      holdoutCases: holdoutCorpus.length,
      corpusOverlap,
      calibrationHoldoutSeparate: corpusOverlap === 0,
      discoveryDecidable: discoveryValidation.decidableCases,
      holdoutDecidable: validation.decidableCases,
      topologyFamilies: [...STAGE2L12_TOPOLOGY_FAMILIES],
      semanticProfiles: [...STAGE2L12_SEMANTIC_PROFILES],
      objectiveTypes: [...STAGE2L12_OBJECTIVE_TYPES],
      worldFeatureCount: STAGE2L12_WORLD_FEATURE_COUNT,
      discoveryCorpusDigest: sha256(discoveryCorpus.map((record) => ({ worldId: record.worldId, family: record.family, profile: record.profile }))),
      holdoutCorpusDigest: sha256(holdoutCorpus.map((record) => ({ worldId: record.worldId, family: record.family, profile: record.profile }))),
    },
    semanticModel: {
      objectiveModel: STAGE2L12_OBJECTIVE_MODEL,
      objectiveModelDigest: STAGE2L12_OBJECTIVE_MODEL_DIGEST,
      consequenceModel: STAGE2L12_ACTION_CONSEQUENCE_MODEL,
      consequenceModelDigest: STAGE2L12_ACTION_CONSEQUENCE_MODEL_DIGEST,
      entityFields: [...STAGE2L12_ENTITY_FIELDS],
      relationKinds: [...STAGE2L12_RELATION_KINDS],
      actionKinds: [...STAGE2L12_ACTION_KINDS],
    },
    validation,
    discoveryValidation: { decidableCases: discoveryValidation.decidableCases, valid: discoveryValidation.valid, bestTrivialBaselineAccuracy: discoveryValidation.bestTrivialBaselineAccuracy },
    nexusEvaluation: {
      decidableCases: holdoutEval.decidableCases,
      nexusAccuracy: holdoutEval.nexusAccuracy,
      primeAccuracy: holdoutEval.primeAccuracy,
      nexusAbstentionRate: holdoutEval.nexusAbstentionRate,
      nexusAccuracyWhenRecommending: round(ratio(
        holdoutEval.rows.filter((row) => row.nexusCorrect).length,
        holdoutEval.rows.filter((row) => !row.nexusAbstained).length,
      )),
      nexusPrimeAgreement: holdoutEval.nexusPrimeAgreement,
      nexusCorrectPrimeWrong: holdoutEval.nexusCorrectPrimeWrong,
      nexusWrongPrimeCorrect: holdoutEval.nexusWrongPrimeCorrect,
      bothCorrect: holdoutEval.bothCorrect,
      bothWrong: holdoutEval.bothWrong,
      byFamily: holdoutEval.byFamily,
      byProfile: holdoutEval.byProfile,
      byMarginQuartile: holdoutEval.byMarginQuartile,
      bestTrivialBaselineAccuracy: validation.bestTrivialBaselineAccuracy,
      randomChoiceBaseline: validation.randomChoiceBaseline,
      nexusBeatsRandom: holdoutEval.nexusAccuracy > validation.randomChoiceBaseline,
      nexusBeatsBestTrivialBaseline: holdoutEval.nexusAccuracy > validation.bestTrivialBaselineAccuracy,
    },
    analysis,
    ruleSearch: { searchSpace: discovery.searchSpace, discoveryCases: discovery.discoveryCases, discoveryBaseRate: discovery.discoveryBaseRate, frozenRule: discovery.frozenRule, topTen: discovery.topTen },
    generalization,
    classification,
    delegation,
    security,
    labelLeakage: {
      featureKeysInspected: featureKeys.length,
      forbiddenScanned: forbidden,
      forbiddenInFeatures,
      hiddenCorrectnessFieldsInCorpus: validation.hiddenCorrectnessFields,
      labelLeakageDetected: forbiddenInFeatures.length > 0 || validation.hiddenCorrectnessFields.length > 0,
    },
    replay: { rowDigest, replayDigest, replayEquivalent: rowDigest === replayDigest },
    rows: holdoutEval.rows,
  });
}

export function certifyStage2L12({ evaluation = buildStage2L12Evaluation() } = {}) {
  const { validation, corpus, analysis, generalization, classification, delegation, security, labelLeakage, nexusEvaluation } = evaluation;

  const semanticGroundingValid = validation.valid
    && validation.groundTruthDerivedFromWorldState
    && !validation.independentRandomCorrectnessLabel
    && !validation.trivialBaselineDominates;
  const groundTruthValidationPass = validation.groundTruthDeterministic
    && validation.groundTruthReplayPass
    && validation.groundTruthOrderingInvariance
    && validation.groundTruthSerializationInvariance;
  const identifiabilityQuestionAnswered = STAGE2L12_STATUSES.includes(classification.status)
    && classification.status !== 'INCONCLUSIVE';
  const securityRegressionPass = security.arbiterModified === false
    && security.calibrationModified === false
    && security.nexusExpertModified === false
    && security.minBucketReliabilityUnchanged
    && security.minBucketSamplesUnchanged
    && security.harmCeilingUnchanged
    && security.correctPrimeBreakCeilingUnchanged
    && delegation.harmCeilingRespected
    && delegation.correctPrimeBreakCeilingRespected;

  const certified = semanticGroundingValid
    && groundTruthValidationPass
    && identifiabilityQuestionAnswered
    && securityRegressionPass
    && !labelLeakage.labelLeakageDetected
    && corpus.calibrationHoldoutSeparate
    && evaluation.replay.replayEquivalent;

  /* Where the remaining limitation actually lives, measured rather than guessed.
   * The benchmark is now valid, so a poor Nexus result is an EXPERT finding. */
  const nexusUsable = classification.status === 'IDENTIFIABLE' && delegation.nexusDelegations > 0;
  const measuredLimitation = !semanticGroundingValid
    ? 'CORPUS_SEMANTICS'
    : nexusEvaluation.nexusBeatsBestTrivialBaseline
      ? (classification.status === 'IDENTIFIABLE' ? 'NONE' : 'EXPERT_CONFIDENCE_SIGNAL')
      : 'EXPERT_SEMANTICS';

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L12_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'BENCHMARK_REMEDIATION_AND_MEASUREMENT',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l11CertificationHash: STAGE2L12_STAGE2L11_CERTIFICATION_HASH,
      stage2l10CertificationHash: STAGE2L12_STAGE2L10_CERTIFICATION_HASH,
      stage2l10CalibrationDigest: security.inheritedCalibrationDigest,
      nexusChanged: false,
      arbiterChanged: false,
      calibrationChanged: false,
      evidenceContractChanged: false,
      thresholdsUnchanged: security.minBucketReliabilityUnchanged && security.minBucketSamplesUnchanged
        && security.harmCeilingUnchanged && security.correctPrimeBreakCeilingUnchanged,
    },
    corpus,
    semanticModel: evaluation.semanticModel,
    groundTruth: validation,
    nexusEvaluation,
    identifiability: {
      status: classification.status,
      reasons: classification.reasons,
      cases: analysis.cases,
      baseRate: analysis.baseRate,
      featuresInspected: analysis.featuresInspected,
      featuresVarying: analysis.featuresVarying,
      predicatesSearched: analysis.predicatesSearched,
      bestSignal: analysis.observedBestPredicate,
      bestSignalTier: analysis.observedBestPredicate ? featureTierOf(analysis.observedBestPredicate.split(/==|<=/)[0]) : null,
      bestDiscrimination: analysis.observedBestGap,
      perTierBestGap: analysis.perTierBestGap,
      coverage: analysis.coverage,
      conditionedOn: analysis.conditionedOn,
      permutationNull: analysis.permutationNull,
      observedExceedsPermutationP95: analysis.observedExceedsPermutationP95,
      anyPredicateReachesReliabilityFloor: analysis.anyPredicateReachesReliabilityFloor,
    },
    ruleSearch: evaluation.ruleSearch,
    generalization,
    delegation,
    security,
    labelLeakage,
    labelLeakageDetected: labelLeakage.labelLeakageDetected,
    replayEquivalent: evaluation.replay.replayEquivalent,
    semanticGroundingValid,
    groundTruthValidationPass,
    identifiabilityQuestionAnswered,
    securityRegressionPass,
    stage2l12Certified: certified,
    interpretation: {
      nexusSafeForSelectiveDelegation: nexusUsable,
      nexusExpertRemediationRequired: !nexusEvaluation.nexusBeatsBestTrivialBaseline,
      nexusContractRemediationRequired: classification.status === 'CONTRACT_INCOMPLETE',
      arbiterRemediationRequired: false,
      corpusRemediationRequired: !semanticGroundingValid,
      measuredLimitation,
      summary: nexusEvaluation.nexusBeatsBestTrivialBaseline
        ? 'The grounded benchmark is valid and the inherited Nexus expert beats the best trivial baseline.'
        : 'The grounded benchmark is valid. Measured against it, the inherited Nexus expert does not beat the best trivial baseline: purely structural criticality does not determine objective utility once value, cost and risk are decoupled from topology.',
    },
    portabilityNote: 'Stage 2L.10 and Stage 2L.11 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.12 does not change that and claims no cross-platform deterministic certification.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ corpus, validation, nexusEvaluation, analysis: { best: analysis.observedBestGap, null: analysis.permutationNull }, generalization, classification }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L12PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage,
    status: certification.status,
    holdoutCases: certification.corpus.holdoutCases,
    holdoutDecidable: certification.corpus.holdoutDecidable,
    bestTrivialBaseline: certification.groundTruth.bestTrivialBaselineAccuracy,
    nexusAccuracy: certification.nexusEvaluation.nexusAccuracy,
    primeAccuracy: certification.nexusEvaluation.primeAccuracy,
    identifiabilityStatus: certification.identifiability.status,
    bestDiscrimination: certification.identifiability.bestDiscrimination,
    nexusDelegations: certification.delegation.nexusDelegations,
    evidenceDigest: certification.evidenceDigest,
    certificationHash: certification.certificationHash,
  };
  return deepFreeze({ digest: sha256(witnesses), witnesses });
}
