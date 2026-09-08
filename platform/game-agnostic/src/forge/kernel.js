/* Sentinel Forge World — deterministic simulation kernel.
 *
 * Pure functions over plain JSON worlds. There is no module-level mutable state,
 * no wall-clock read, and no unseeded randomness anywhere in this file; the only
 * entropy is the world's own seed, carried inside the state so a serialized world
 * resumes exactly where it left off.
 *
 * step() is PURE: it returns a new world and never touches the one it was given.
 * That is stronger than the Sentinel adapter contract requires (which only asks
 * that the adapter not mutate the caller's state), and it is the property the
 * counterfactual oracle rests on — branch A cannot contaminate branch B if no
 * branch can write to its parent at all.
 */

import { sha256 } from '../core/determinism.js';
import {
  FORGE_ACTION_TYPES,
  FORGE_ENTITY_TYPES,
  FORGE_MOVE_DIRECTIONS,
  FORGE_RELATION_TYPES,
  FORGE_STATE_SCHEMA_VERSION,
  FORGE_TERRAIN,
  FORGE_TERRAIN_BY_CODE,
  FORGE_WORLD_VERSION,
  ForgeIllegalActionError,
  assertForge,
  emptyRewardVector,
  scalarizeReward,
  validateWorld,
} from './contract.js';

export const FORGE_KERNEL_VERSION = 'forge-kernel-v1';
export const FORGE_ACTION_RANGE = 1;         // Manhattan range for targeted actions.
export const FORGE_REPAIR_AMOUNT = 40;
export const FORGE_REINFORCE_AMOUNT = 25;
export const FORGE_ATTACK_AMOUNT = 45;
export const FORGE_DAMAGE_THRESHOLD = 40;    // Below this an entity is degraded.
export const FORGE_ENERGY_START = 40;

/* ---------------------------------------------------------------------------
 * Small pure helpers
 * ------------------------------------------------------------------------- */

const clone = (value) => structuredClone(value);
const byId = (world, id) => world.entities.find((entity) => entity.id === id) ?? null;
const cellAt = (world, x, y) => world.grid.cells[y * world.grid.width + x];
const inBounds = (world, x, y) => x >= 0 && y >= 0 && x < world.grid.width && y < world.grid.height;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const clampHealth = (value) => (value < 0 ? 0 : value > 100 ? 100 : value);

function blockedAt(world, x, y) {
  if (!inBounds(world, x, y)) return 'OUT_OF_BOUNDS';
  if (!FORGE_TERRAIN_BY_CODE[cellAt(world, x, y)].traversable) return 'BLOCKED_CELL';
  const blocker = world.entities.find(
    (entity) => entity.position.x === x && entity.position.y === y
      && FORGE_ENTITY_TYPES[entity.type].blocking && entity.available,
  );
  return blocker ? 'BLOCKED_CELL' : null;
}

/** The controlled actor. Exactly one per world, by construction. */
export function controlledActor(world) {
  return world.entities.find((entity) => entity.type === 'ACTOR' && entity.faction === 'sentinel') ?? null;
}

/* ---------------------------------------------------------------------------
 * Construction
 * ------------------------------------------------------------------------- */

export function createWorld(seed, scenarioConfig) {
  assertForge(scenarioConfig !== null && typeof scenarioConfig === 'object', 'scenarioConfig is required');
  const world = {
    schemaVersion: FORGE_STATE_SCHEMA_VERSION,
    worldVersion: FORGE_WORLD_VERSION,
    kernelVersion: FORGE_KERNEL_VERSION,
    seed: String(seed),
    scenarioFamily: scenarioConfig.family,
    scenarioLevel: scenarioConfig.level,
    tick: 0,
    maxTicks: scenarioConfig.maxTicks,
    grid: clone(scenarioConfig.grid),
    entities: clone(scenarioConfig.entities),
    relations: clone(scenarioConfig.relations),
    objectives: clone(scenarioConfig.objectives),
    constraints: clone(scenarioConfig.constraints ?? { energy: FORGE_ENERGY_START }),
    hazards: clone(scenarioConfig.hazards ?? []),
    events: [],
    /* Temporal channels are part of authoritative state, not a derived view:
     * the Oracle families are ABOUT the series, so the series has to be the thing
     * the simulator owns rather than something reconstructed later. */
    channels: clone(scenarioConfig.channels ?? {}),
    history: [],
    terminalReason: null,
  };
  world.history.push(currentFrame(world));
  return validateWorld(world);
}

export function cloneWorld(world) {
  return clone(world);
}

/** A temporal frame in exactly the shape the Oracle expert consumes. */
export function currentFrame(world) {
  const channels = {};
  for (const name of Object.keys(world.channels).sort()) {
    const series = world.channels[name];
    const index = world.tick < series.length ? world.tick : series.length - 1;
    channels[name] = series[index];
  }
  return { tick: world.tick, channels };
}

/* ---------------------------------------------------------------------------
 * Identity
 *
 * hashWorld covers SEMANTIC state only. Presentation, version banners and the
 * event log are excluded on purpose: re-rendering the ASCII, or relabelling the
 * kernel, must not move world identity, or the renderer would silently become
 * part of the simulation.
 * ------------------------------------------------------------------------- */

export function semanticProjection(world) {
  return {
    tick: world.tick,
    grid: world.grid,
    entities: [...world.entities]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((entity) => ({
        id: entity.id, type: entity.type, position: entity.position, health: entity.health,
        available: entity.available, value: entity.value, cost: entity.cost, risk: entity.risk,
        faction: entity.faction, flags: entity.flags, resources: entity.resources,
      })),
    relations: [...world.relations]
      .map((relation) => `${relation.type} ${relation.from} ${relation.to}`)
      .sort(),
    objectives: [...world.objectives]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((objective) => ({ ...objective })),
    constraints: world.constraints,
    channelFrame: currentFrame(world).channels,
    terminalReason: world.terminalReason,
  };
}

export function hashWorld(world) {
  return sha256(semanticProjection(world));
}

/** Topology only: what depends on what, with positions and health stripped. */
export function topologyHash(world) {
  return sha256({
    types: [...world.entities].map((entity) => `${entity.id}:${entity.type}`).sort(),
    relations: [...world.relations].map((relation) => `${relation.type} ${relation.from} ${relation.to}`).sort(),
    objectives: [...world.objectives].map((objective) => `${objective.entityId}:${objective.requiredValue}`).sort(),
  });
}

/* ---------------------------------------------------------------------------
 * Terminality and scoring
 * ------------------------------------------------------------------------- */

export function isTerminal(world) {
  if (world.terminalReason !== null) return true;
  if (world.tick >= world.maxTicks) return true;
  if (world.objectives.every((objective) => objective.deliveredValue >= objective.requiredValue)) return true;
  const actor = controlledActor(world);
  if (actor === null || actor.health <= 0) return true;
  return false;
}

export function terminalStatus(world) {
  if (world.objectives.every((objective) => objective.deliveredValue >= objective.requiredValue)) {
    return { terminal: true, outcome: 'SUCCESS', reason: 'ALL_OBJECTIVES_SATISFIED' };
  }
  const actor = controlledActor(world);
  if (actor === null || actor.health <= 0) return { terminal: true, outcome: 'FAILURE', reason: 'ACTOR_LOST' };
  if (world.tick >= world.maxTicks) return { terminal: true, outcome: 'FAILURE', reason: 'HORIZON_EXHAUSTED' };
  if (world.terminalReason !== null) return { terminal: true, outcome: 'FAILURE', reason: world.terminalReason };
  return { terminal: false, outcome: 'ONGOING', reason: null };
}

/** Absolute world score. Integer, so equality is equality. */
export function score(world) {
  let objective = 0;
  for (const entry of world.objectives) {
    objective += entry.deliveredValue > entry.requiredValue ? entry.requiredValue : entry.deliveredValue;
  }
  let infrastructure = 0;
  let civilian = 0;
  for (const entity of world.entities) {
    if (entity.type === 'CIVILIAN') civilian += entity.health;
    else if (entity.type === 'INFRASTRUCTURE' || entity.type === 'REPAIR_TARGET') infrastructure += entity.health;
  }
  const status = terminalStatus(world);
  return {
    objective,
    infrastructure,
    civilian,
    tick: world.tick,
    outcome: status.outcome,
    total: objective * 10 + civilian * 2 + infrastructure - world.tick,
  };
}

/* ---------------------------------------------------------------------------
 * Legal actions
 *
 * legalActions is the single source of truth for what may be attempted; step()
 * re-derives legality independently rather than trusting its caller, so an action
 * fabricated outside this function cannot slip through.
 * ------------------------------------------------------------------------- */

function actionDescriptor({ type, actorId, targetId = null, parameters = {} }) {
  return {
    actionId: `forge/${type.toLowerCase()}`,
    actionType: type,
    actorId,
    target: targetId === null ? null : { kind: 'entity', id: targetId },
    parameters,
  };
}

/** Deterministic identity of an action, independent of key insertion order. */
export function forgeActionKey(action) {
  return sha256([action.actionType, action.actorId, action.target, action.parameters]);
}

function targetsInRange(world, actor, predicate) {
  return world.entities
    .filter((entity) => entity.id !== actor.id && manhattan(actor.position, entity.position) <= FORGE_ACTION_RANGE)
    .filter(predicate)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function substituteFor(world, targetId) {
  return world.relations
    .filter((relation) => relation.type === 'substitutes' && relation.to === targetId)
    .map((relation) => byId(world, relation.from))
    .filter((entity) => entity !== null && entity.available && entity.health > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}

export function legalActions(world, actorId = null) {
  validateWorld(world);
  if (isTerminal(world)) return [];
  const actor = actorId === null ? controlledActor(world) : byId(world, actorId);
  if (actor === null) return [];
  const energy = world.constraints.energy ?? 0;
  const actions = [];

  for (const name of Object.keys(FORGE_MOVE_DIRECTIONS).sort()) {
    const { dx, dy } = FORGE_MOVE_DIRECTIONS[name];
    const x = actor.position.x + dx;
    const y = actor.position.y + dy;
    if (blockedAt(world, x, y) === null) {
      actions.push(actionDescriptor({ type: 'MOVE', actorId: actor.id, parameters: { direction: name } }));
    }
  }

  if (energy >= 2) {
    for (const target of targetsInRange(world, actor, (entity) => !entity.available && entity.type !== 'HOSTILE')) {
      actions.push(actionDescriptor({ type: 'RESTORE', actorId: actor.id, targetId: target.id }));
    }
  }
  if (energy >= 1) {
    for (const target of targetsInRange(world, actor, (entity) => entity.faction !== 'hostile' && entity.flags.protected !== true)) {
      actions.push(actionDescriptor({ type: 'PROTECT', actorId: actor.id, targetId: target.id }));
    }
  }
  if (energy >= 2) {
    for (const target of targetsInRange(world, actor, (entity) => entity.health > 0 && entity.health < 100 && entity.faction !== 'hostile')) {
      actions.push(actionDescriptor({ type: 'REINFORCE', actorId: actor.id, targetId: target.id }));
      actions.push(actionDescriptor({ type: 'REPAIR', actorId: actor.id, targetId: target.id }));
    }
  }
  if (energy >= 3) {
    /* BYPASS is offered only where a substitute genuinely exists and can carry the
     * dependency now. Offering it otherwise would make "dead substitute" scenarios
     * trivially solvable by an action that cannot work. */
    for (const relation of world.relations.filter((entry) => entry.type === 'dependsOn')) {
      const failed = byId(world, relation.to);
      if (failed === null || failed.available) continue;
      if (manhattan(actor.position, failed.position) > FORGE_ACTION_RANGE) continue;
      if (substituteFor(world, relation.to) === null) continue;
      actions.push(actionDescriptor({ type: 'BYPASS', actorId: actor.id, targetId: relation.to, parameters: { dependent: relation.from } }));
    }
  }
  if (energy >= 4) {
    for (const target of targetsInRange(world, actor, (entity) => entity.flags.planned === true && !entity.available)) {
      actions.push(actionDescriptor({ type: 'BUILD', actorId: actor.id, targetId: target.id }));
    }
  }
  if ((actor.resources.material ?? 0) > 0) {
    for (const target of targetsInRange(world, actor, (entity) => entity.flags.acceptsMaterial === true)) {
      actions.push(actionDescriptor({ type: 'TRANSFER', actorId: actor.id, targetId: target.id }));
    }
  }
  for (const target of world.entities.filter(
    (entity) => entity.type === 'RESOURCE' && entity.available
      && entity.position.x === actor.position.x && entity.position.y === actor.position.y,
  ).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    actions.push(actionDescriptor({ type: 'COLLECT', actorId: actor.id, targetId: target.id }));
  }
  if (energy >= 2) {
    for (const target of targetsInRange(world, actor, (entity) => entity.type === 'HOSTILE' && entity.health > 0)) {
      actions.push(actionDescriptor({ type: 'ATTACK', actorId: actor.id, targetId: target.id }));
    }
  }
  const hostiles = world.entities.filter((entity) => entity.type === 'HOSTILE' && entity.health > 0);
  if (hostiles.length > 0) {
    const nearest = hostiles
      .map((entity) => ({ entity, distance: manhattan(actor.position, entity.position) }))
      .sort((a, b) => a.distance - b.distance || (a.entity.id < b.entity.id ? -1 : 1))[0];
    const dx = Math.sign(actor.position.x - nearest.entity.position.x);
    const dy = Math.sign(actor.position.y - nearest.entity.position.y);
    const x = actor.position.x + (dx !== 0 ? dx : 0);
    const y = actor.position.y + (dx !== 0 ? 0 : dy);
    if ((dx !== 0 || dy !== 0) && blockedAt(world, x, y) === null) {
      actions.push(actionDescriptor({ type: 'RETREAT', actorId: actor.id, parameters: { toX: x, toY: y } }));
    }
  }

  actions.push(actionDescriptor({ type: 'WAIT', actorId: actor.id }));

  /* Canonical order, so two runs that produce the same set produce the same
   * array, and any downstream index is stable. */
  return actions.sort((a, b) => {
    const ka = forgeActionKey(a);
    const kb = forgeActionKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** Why an action is or is not legal, by name, without mutating anything. */
export function checkLegality(world, action) {
  if (action === null || typeof action !== 'object') return { legal: false, reason: 'MALFORMED_ACTION' };
  if (typeof action.actionType !== 'string' || FORGE_ACTION_TYPES[action.actionType] === undefined) {
    return { legal: false, reason: 'UNKNOWN_ACTION_TYPE' };
  }
  if (isTerminal(world)) return { legal: false, reason: 'TERMINAL_STATE' };
  const actor = byId(world, action.actorId);
  if (actor === null) return { legal: false, reason: 'ACTOR_NOT_FOUND' };
  if (FORGE_ACTION_TYPES[action.actionType].needsTarget && (action.target === null || action.target === undefined)) {
    return { legal: false, reason: 'TARGET_REQUIRED' };
  }
  if (action.target !== null && action.target !== undefined) {
    const target = byId(world, action.target.id);
    if (target === null) return { legal: false, reason: 'TARGET_NOT_FOUND' };
    if (manhattan(actor.position, target.position) > FORGE_ACTION_RANGE && action.actionType !== 'COLLECT') {
      return { legal: false, reason: 'TARGET_OUT_OF_RANGE' };
    }
  }
  const key = forgeActionKey(action);
  const offered = legalActions(world, action.actorId).some((candidate) => forgeActionKey(candidate) === key);
  if (!offered) {
    /* The action is well-formed and the target reachable, but the world does not
     * offer it. Distinguishing the specific refusal makes the illegality label
     * useful to a training exporter instead of a shrug. */
    if (action.actionType === 'BYPASS') return { legal: false, reason: 'NO_SUBSTITUTE_AVAILABLE' };
    if (action.actionType === 'ATTACK') return { legal: false, reason: 'NO_HOSTILE_PRESENT' };
    if (action.actionType === 'MOVE' || action.actionType === 'RETREAT') return { legal: false, reason: 'BLOCKED_CELL' };
    if (action.actionType === 'TRANSFER' || action.actionType === 'COLLECT') return { legal: false, reason: 'INSUFFICIENT_RESOURCES' };
    return { legal: false, reason: 'TARGET_NOT_ELIGIBLE' };
  }
  return { legal: true, reason: null };
}

/* ---------------------------------------------------------------------------
 * Transition
 * ------------------------------------------------------------------------- */

const ENERGY_COST = {
  MOVE: 0, WAIT: 0, RETREAT: 0, COLLECT: 0, TRANSFER: 1,
  PROTECT: 1, RESTORE: 2, REINFORCE: 2, REPAIR: 2, ATTACK: 2, BYPASS: 3, BUILD: 4,
};

/**
 * Apply one action. Returns a NEW world; the input is not touched.
 *
 * An illegal action throws by name and produces no world at all, so there is no
 * path by which a rejected action leaves a partial mutation behind.
 */
export function step(world, action) {
  validateWorld(world);
  const legality = checkLegality(world, action);
  if (!legality.legal) throw new ForgeIllegalActionError(legality.reason, { actionType: action?.actionType ?? null });

  const next = clone(world);
  const actor = byId(next, action.actorId);
  const target = action.target ? byId(next, action.target.id) : null;
  const reward = emptyRewardVector();
  const events = [];

  next.constraints.energy = (next.constraints.energy ?? 0) - (ENERGY_COST[action.actionType] ?? 0);
  reward.resourceCost += ENERGY_COST[action.actionType] ?? 0;
  reward.riskExposure += actor.risk;

  switch (action.actionType) {
    case 'MOVE': {
      const { dx, dy } = FORGE_MOVE_DIRECTIONS[action.parameters.direction];
      actor.position = { x: actor.position.x + dx, y: actor.position.y + dy };
      events.push({ type: 'MOVED', to: actor.position });
      break;
    }
    case 'RETREAT': {
      actor.position = { x: action.parameters.toX, y: action.parameters.toY };
      events.push({ type: 'RETREATED', to: actor.position });
      break;
    }
    case 'RESTORE': {
      target.available = true;
      if (target.health <= 0) target.health = 1;
      reward.preservedValue += target.value;
      events.push({ type: 'RESTORED', id: target.id });
      break;
    }
    case 'PROTECT': {
      target.flags = { ...target.flags, protected: true };
      reward.preservedValue += Math.floor(target.value / 2);
      if (target.type === 'CIVILIAN') reward.civilianSafety += 5;
      events.push({ type: 'PROTECTED', id: target.id });
      break;
    }
    case 'REINFORCE': {
      const before = target.health;
      target.health = clampHealth(target.health + FORGE_REINFORCE_AMOUNT);
      reward.infrastructureHealth += target.health - before;
      events.push({ type: 'REINFORCED', id: target.id, delta: target.health - before });
      break;
    }
    case 'REPAIR': {
      const before = target.health;
      target.health = clampHealth(target.health + FORGE_REPAIR_AMOUNT);
      reward.infrastructureHealth += target.health - before;
      if (target.type === 'CIVILIAN') reward.civilianSafety += target.health - before;
      events.push({ type: 'REPAIRED', id: target.id, delta: target.health - before });
      break;
    }
    case 'BYPASS': {
      const substitute = substituteFor(next, target.id);
      /* Re-checked against the CHILD world, not the parent. checkLegality proved a
       * substitute existed a moment ago; this proves one exists in the state the
       * edge is actually being rewritten in. */
      if (substitute === null) throw new ForgeIllegalActionError('NO_SUBSTITUTE_AVAILABLE', { target: target.id });
      const dependent = action.parameters.dependent;
      next.relations = next.relations.filter(
        (relation) => !(relation.type === 'dependsOn' && relation.from === dependent && relation.to === target.id),
      );
      next.relations.push({ type: 'dependsOn', from: dependent, to: substitute.id });
      next.relations.sort((a, b) => {
        const ka = `${a.type} ${a.from} ${a.to}`;
        const kb = `${b.type} ${b.from} ${b.to}`;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      reward.preservedValue += byId(next, dependent)?.value ?? 0;
      reward.objectiveProgress += 1;
      events.push({ type: 'BYPASSED', failed: target.id, via: substitute.id });
      break;
    }
    case 'BUILD': {
      target.available = true;
      target.health = clampHealth(60);
      target.flags = { ...target.flags, planned: false, built: true };
      reward.infrastructureHealth += 60;
      reward.objectiveProgress += 1;
      events.push({ type: 'BUILT', id: target.id });
      break;
    }
    case 'TRANSFER': {
      const carried = actor.resources.material ?? 0;
      actor.resources = { ...actor.resources, material: 0 };
      target.resources = { ...target.resources, material: (target.resources.material ?? 0) + carried };
      const objective = next.objectives.find((entry) => entry.entityId === target.id);
      if (objective) {
        const before = objective.deliveredValue;
        objective.deliveredValue = before + carried;
        const counted = Math.min(objective.requiredValue, objective.deliveredValue) - Math.min(objective.requiredValue, before);
        reward.deliveredValue += counted;
        reward.objectiveProgress += counted > 0 ? 1 : 0;
      }
      events.push({ type: 'TRANSFERRED', id: target.id, amount: carried });
      break;
    }
    case 'COLLECT': {
      const amount = target.value;
      target.available = false;
      actor.resources = { ...actor.resources, material: (actor.resources.material ?? 0) + amount };
      events.push({ type: 'COLLECTED', id: target.id, amount });
      break;
    }
    case 'ATTACK': {
      const before = target.health;
      target.health = clampHealth(target.health - FORGE_ATTACK_AMOUNT);
      if (target.health === 0) target.available = false;
      reward.riskExposure += 3;
      reward.preservedValue += before - target.health > 0 ? 1 : 0;
      events.push({ type: 'ATTACKED', id: target.id, delta: before - target.health });
      break;
    }
    case 'WAIT':
      events.push({ type: 'WAITED' });
      break;
    default:
      throw new ForgeIllegalActionError('UNKNOWN_ACTION_TYPE', { actionType: action.actionType });
  }

  advanceWorld(next, reward, events);

  const status = terminalStatus(next);
  if (status.terminal && next.terminalReason === null && status.outcome === 'FAILURE') {
    next.terminalReason = status.reason;
  }
  if (status.terminal) {
    if (status.outcome === 'SUCCESS') reward.terminalSuccess += 1;
    else reward.terminalFailure += 1;
  }

  next.events = events;
  validateWorld(next);
  return {
    state: next,
    rewardVector: reward,
    scalarReward: scalarizeReward(reward),
    terminal: status.terminal,
    outcome: status.outcome,
    events,
  };
}

/** World dynamics that happen regardless of the action taken. */
function advanceWorld(next, reward, events) {
  next.tick += 1;
  reward.timeCost += 1;

  /* Environmental hazard damage, applied in canonical entity order so the result
   * cannot depend on array ordering upstream. */
  const ordered = [...next.entities].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const sorted of ordered) {
    const entity = byId(next, sorted.id);
    const terrain = FORGE_TERRAIN_BY_CODE[cellAt(next, entity.position.x, entity.position.y)];
    if (terrain.tickDamage && !entity.flags.protected) {
      const before = entity.health;
      entity.health = clampHealth(entity.health - terrain.tickDamage);
      if (entity.type === 'CIVILIAN') reward.civilianSafety -= before - entity.health;
      if (before !== entity.health) events.push({ type: 'HAZARD_DAMAGE', id: entity.id, delta: before - entity.health });
    }
  }

  /* Hostiles degrade what they attack. Deterministic, ordered, no randomness. */
  for (const relation of [...next.relations]
    .filter((entry) => entry.type === 'attacks')
    .sort((a, b) => (`${a.from}${a.to}` < `${b.from}${b.to}` ? -1 : 1))) {
    const attacker = byId(next, relation.from);
    const victim = byId(next, relation.to);
    if (attacker === null || victim === null) continue;
    if (attacker.health <= 0 || !attacker.available) continue;
    if (victim.flags.protected) continue;
    const before = victim.health;
    victim.health = clampHealth(victim.health - 5);
    if (victim.health < FORGE_DAMAGE_THRESHOLD) victim.available = victim.health > 0;
    if (victim.type === 'CIVILIAN') reward.civilianSafety -= before - victim.health;
    else reward.infrastructureHealth -= before - victim.health;
    if (before !== victim.health) events.push({ type: 'DEGRADED', id: victim.id, delta: before - victim.health });
  }

  next.history.push(currentFrame(next));
}

/* ---------------------------------------------------------------------------
 * Observation
 *
 * The Sentinel-facing view. Feature vector for Prime, canonical relational state
 * for Nexus, temporal history for Oracle — all derived from structured state, all
 * in the shapes those contracts already define.
 * ------------------------------------------------------------------------- */

export function observe(world, observerId = 'sentinel') {
  validateWorld(world);
  const actor = controlledActor(world);
  const entities = [...world.entities].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const features = [
    world.tick,
    world.maxTicks - world.tick,
    world.constraints.energy ?? 0,
    actor === null ? 0 : actor.position.x,
    actor === null ? 0 : actor.position.y,
    actor === null ? 0 : actor.health,
    actor === null ? 0 : (actor.resources.material ?? 0),
    entities.length,
    world.relations.length,
    entities.filter((entity) => !entity.available).length,
    entities.filter((entity) => entity.type === 'HOSTILE' && entity.health > 0).length,
    entities.filter((entity) => entity.type === 'CIVILIAN').reduce((total, entity) => total + entity.health, 0),
    world.objectives.reduce((total, entry) => total + entry.requiredValue - Math.min(entry.requiredValue, entry.deliveredValue), 0),
  ];

  return {
    observerId,
    tick: world.tick,
    features,
    /* Exactly the shape Nexus normalizes: entities with id/kind/hostile/critical,
     * relationships with from/to/kind in its three-kind vocabulary. */
    canonicalState: {
      entities: entities.map((entity) => ({
        id: entity.id,
        kind: entity.type,
        hostile: FORGE_ENTITY_TYPES[entity.type].hostile || entity.faction === 'hostile',
        critical: world.objectives.some((objective) => objective.entityId === entity.id) || entity.flags.critical === true,
      })),
      relationships: [...world.relations]
        .map((relation) => ({ from: relation.from, to: relation.to, kind: FORGE_RELATION_TYPES[relation.type].nexusKind }))
        .sort((a, b) => {
          const ka = `${a.kind} ${a.from} ${a.to}`;
          const kb = `${b.kind} ${b.from} ${b.to}`;
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        }),
    },
    /* Exactly the shape Oracle normalizes: {tick, channels} frames. */
    observationHistory: world.history.map((frame) => ({ tick: frame.tick, channels: { ...frame.channels } })),
    objectives: world.objectives.map((objective) => ({ ...objective })),
    worldHash: hashWorld(world),
  };
}

export { FORGE_TERRAIN, FORGE_TERRAIN_BY_CODE };
