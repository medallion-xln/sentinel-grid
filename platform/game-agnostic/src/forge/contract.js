/* Sentinel Forge World — contract surface.
 *
 * The vocabulary of the simulator: what an entity can be, how entities relate,
 * what an actor may do, and what an outcome is made of. Everything downstream —
 * the kernel, the renderer, the scenario generators, the counterfactual oracle,
 * the exporters — reads its vocabulary from here, so a change of vocabulary is a
 * change of one file and a version bump rather than a diff scattered across ten.
 *
 * Two rules hold throughout Forge World and are enforced rather than assumed:
 *
 *   1. ASCII is a PRESENTATION LAYER. The authoritative state is the structured
 *      object in this contract. Nothing may read the rendered characters back to
 *      decide anything, and the renderer may never influence world identity.
 *
 *   2. Every quantity is an INTEGER. Values, costs, risks, health, rewards and
 *      the scalarized reward are all exact integers in fixed units. Floating
 *      point is used nowhere in the reward or transition path, so "byte-identical
 *      across runs" is a property of the arithmetic rather than a hope about it,
 *      and exact ties are exact rather than nearly-exact.
 */

import { deepFreeze } from '../core/determinism.js';

export const FORGE_WORLD_VERSION = 'sentinel-forge-world-0.1.0';
export const FORGE_WORLD_CONTRACT_VERSION = 1;
export const FORGE_STATE_SCHEMA_VERSION = 1;

/* ---------------------------------------------------------------------------
 * Entities
 * ------------------------------------------------------------------------- */

export const FORGE_ENTITY_TYPES = deepFreeze({
  ACTOR: { symbol: 'P', hostile: false, blocking: false, description: 'the controlled actor' },
  HOSTILE: { symbol: 'E', hostile: true, blocking: false, description: 'an adversarial actor' },
  CIVILIAN: { symbol: 'C', hostile: false, blocking: false, description: 'a protected non-combatant' },
  REPAIR_TARGET: { symbol: 'R', hostile: false, blocking: false, description: 'damaged infrastructure that can be repaired' },
  SUBSTITUTE: { symbol: 'S', hostile: false, blocking: false, description: 'an alternative provider for a dependency' },
  CRITICAL_TARGET: { symbol: 'T', hostile: false, blocking: false, description: 'an objective-bearing node' },
  RESOURCE: { symbol: 'F', hostile: false, blocking: false, description: 'a collectable resource' },
  HAZARD: { symbol: 'H', hostile: false, blocking: false, description: 'a damaging environmental feature' },
  BARRIER: { symbol: 'B', hostile: false, blocking: true, description: 'a removable obstruction' },
  INFRASTRUCTURE: { symbol: 'I', hostile: false, blocking: false, description: 'a load-bearing structural node' },
  POWER_SOURCE: { symbol: 'W', hostile: false, blocking: false, description: 'a node that powers others' },
  DEPOT: { symbol: 'D', hostile: false, blocking: false, description: 'a materials store' },
});
export const FORGE_ENTITY_TYPE_NAMES = deepFreeze(Object.keys(FORGE_ENTITY_TYPES).sort());

/* ---------------------------------------------------------------------------
 * Relations
 *
 * Forge relations are richer than the three edge kinds Nexus consumes, because
 * the simulator has to model the world and Nexus only has to reason about it. The
 * projection to Nexus vocabulary is declared here rather than buried in the
 * adapter, so it can be inspected and tested as a mapping in its own right.
 * ------------------------------------------------------------------------- */

export const FORGE_RELATION_TYPES = deepFreeze({
  supplies: { nexusKind: 'supports', directed: true, description: 'from provides material or flow to to' },
  dependsOn: { nexusKind: 'depends', directed: true, description: 'from cannot function unless to functions' },
  protects: { nexusKind: 'supports', directed: true, description: 'from shields to from harm' },
  substitutes: { nexusKind: 'supports', directed: true, description: 'from can stand in for to' },
  attacks: { nexusKind: 'threatens', directed: true, description: 'from degrades to' },
  repairs: { nexusKind: 'supports', directed: true, description: 'from can restore to' },
  powers: { nexusKind: 'supports', directed: true, description: 'from energizes to' },
  controls: { nexusKind: 'depends', directed: true, description: 'to is governed by from' },
  blocks: { nexusKind: 'threatens', directed: true, description: 'from obstructs to' },
  requires: { nexusKind: 'depends', directed: true, description: 'from needs a resource held by to' },
  supports: { nexusKind: 'supports', directed: true, description: 'from structurally bears to' },
});
export const FORGE_RELATION_TYPE_NAMES = deepFreeze(Object.keys(FORGE_RELATION_TYPES).sort());

/* ---------------------------------------------------------------------------
 * Actions
 * ------------------------------------------------------------------------- */

export const FORGE_ACTION_TYPES = deepFreeze({
  MOVE: { needsTarget: false, description: 'step one cell in a cardinal direction' },
  RESTORE: { needsTarget: true, description: 'bring an unavailable node back into service' },
  PROTECT: { needsTarget: true, description: 'shield a node from degradation' },
  REINFORCE: { needsTarget: true, description: 'raise a node above its damage threshold' },
  BYPASS: { needsTarget: true, description: 'route a dependency around a failed node via a substitute' },
  REPAIR: { needsTarget: true, description: 'restore health to a damaged node' },
  BUILD: { needsTarget: true, description: 'construct a planned structural node' },
  TRANSFER: { needsTarget: true, description: 'move carried resources into a node' },
  COLLECT: { needsTarget: true, description: 'take a co-located resource' },
  WAIT: { needsTarget: false, description: 'advance one tick without acting' },
  ATTACK: { needsTarget: true, description: 'degrade a hostile actor' },
  RETREAT: { needsTarget: false, description: 'move one cell away from the nearest hostile' },
});
export const FORGE_ACTION_TYPE_NAMES = deepFreeze(Object.keys(FORGE_ACTION_TYPES).sort());

export const FORGE_MOVE_DIRECTIONS = deepFreeze({
  NORTH: { dx: 0, dy: -1 },
  EAST: { dx: 1, dy: 0 },
  SOUTH: { dx: 0, dy: 1 },
  WEST: { dx: -1, dy: 0 },
});
export const FORGE_MOVE_DIRECTION_NAMES = deepFreeze(Object.keys(FORGE_MOVE_DIRECTIONS).sort());

/* Every reason an action can be refused. An illegal action fails by NAME — a
 * bare throw would tell a training exporter nothing about why the action was not
 * available, and "it threw" is not a label. */
export const FORGE_ILLEGALITY_REASONS = deepFreeze([
  'UNKNOWN_ACTION_TYPE',
  'MALFORMED_ACTION',
  'ACTOR_NOT_FOUND',
  'TARGET_REQUIRED',
  'TARGET_NOT_FOUND',
  'TARGET_OUT_OF_RANGE',
  'TARGET_NOT_ELIGIBLE',
  'BLOCKED_CELL',
  'OUT_OF_BOUNDS',
  'INSUFFICIENT_RESOURCES',
  'INSUFFICIENT_ENERGY',
  'NO_HOSTILE_PRESENT',
  'NO_SUBSTITUTE_AVAILABLE',
  'TERMINAL_STATE',
]);

/* ---------------------------------------------------------------------------
 * Terrain
 * ------------------------------------------------------------------------- */

export const FORGE_TERRAIN = deepFreeze({
  TRAVERSABLE: { code: 0, symbol: '.', traversable: true },
  WALL: { code: 1, symbol: '#', traversable: false },
  ENVIRONMENTAL_HAZARD: { code: 2, symbol: '~', traversable: true, tickDamage: 2 },
});
export const FORGE_TERRAIN_BY_CODE = deepFreeze(
  Object.fromEntries(Object.entries(FORGE_TERRAIN).map(([name, spec]) => [spec.code, { name, ...spec }])),
);

/* ---------------------------------------------------------------------------
 * Reward
 *
 * A vector first, a scalar second, and the scalar only ever through a NAMED
 * version. Collapsing to one opaque number at the point of measurement is how a
 * reward function stops being auditable: the components that moved become
 * unrecoverable, and a weight change becomes indistinguishable from a behaviour
 * change. Both are recorded here instead.
 * ------------------------------------------------------------------------- */

export const FORGE_REWARD_VERSION = 'FORGE_REWARD_V1';

export const FORGE_REWARD_COMPONENTS = deepFreeze([
  { id: 'objectiveProgress', sense: 'benefit', description: 'objective satisfaction gained this transition' },
  { id: 'deliveredValue', sense: 'benefit', description: 'value actually delivered to objective-bearing nodes' },
  { id: 'preservedValue', sense: 'benefit', description: 'value that would have been lost and was not' },
  { id: 'civilianSafety', sense: 'benefit', description: 'civilian health preserved' },
  { id: 'infrastructureHealth', sense: 'benefit', description: 'net infrastructure health change' },
  { id: 'resourceCost', sense: 'cost', description: 'resources consumed' },
  { id: 'riskExposure', sense: 'cost', description: 'risk the actor took on' },
  { id: 'timeCost', sense: 'cost', description: 'ticks spent' },
  { id: 'illegalActionPenalty', sense: 'cost', description: 'penalty for an attempted illegal action' },
  { id: 'terminalSuccess', sense: 'benefit', description: 'objective completion bonus' },
  { id: 'terminalFailure', sense: 'cost', description: 'terminal failure penalty' },
]);
export const FORGE_REWARD_COMPONENT_IDS = deepFreeze(FORGE_REWARD_COMPONENTS.map((entry) => entry.id));

/* Integer weights. A weight change MUST create a new version id — the whole
 * point of naming the scalarization is that a stored scalar can be traced to the
 * weights that produced it. */
export const FORGE_REWARD_WEIGHTS_V1 = deepFreeze({
  objectiveProgress: 10,
  deliveredValue: 4,
  preservedValue: 3,
  civilianSafety: 6,
  infrastructureHealth: 2,
  resourceCost: -1,
  riskExposure: -2,
  timeCost: -1,
  illegalActionPenalty: -50,
  terminalSuccess: 25,
  terminalFailure: -25,
});

export function emptyRewardVector() {
  const vector = {};
  for (const id of FORGE_REWARD_COMPONENT_IDS) vector[id] = 0;
  return vector;
}

export function addRewardVectors(a, b) {
  const sum = {};
  for (const id of FORGE_REWARD_COMPONENT_IDS) sum[id] = (a[id] ?? 0) + (b[id] ?? 0);
  return sum;
}

/** Exact integer scalarization. No floats, so no drift and no near-tie ambiguity. */
export function scalarizeReward(vector, version = FORGE_REWARD_VERSION) {
  if (version !== FORGE_REWARD_VERSION) {
    throw new ForgeContractError(`Unknown reward version: ${version}`, { known: FORGE_REWARD_VERSION });
  }
  let total = 0;
  for (const id of FORGE_REWARD_COMPONENT_IDS) {
    total += (vector[id] ?? 0) * FORGE_REWARD_WEIGHTS_V1[id];
  }
  return total;
}

/* ---------------------------------------------------------------------------
 * Errors
 * ------------------------------------------------------------------------- */

export class ForgeContractError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'ForgeContractError';
    this.code = 'FORGE_CONTRACT';
    if (details !== undefined) this.details = details;
  }
}

export class ForgeIllegalActionError extends Error {
  constructor(reason, detail = undefined) {
    super(`Illegal action: ${reason}`);
    this.name = 'ForgeIllegalActionError';
    this.code = 'FORGE_ILLEGAL_ACTION';
    this.reason = reason;
    if (detail !== undefined) this.detail = detail;
  }
}

export function assertForge(condition, message, details = undefined) {
  if (!condition) throw new ForgeContractError(message, details);
}

/* ---------------------------------------------------------------------------
 * Structural validation of a world object.
 *
 * Used by the kernel on construction and by the adversarial tests, which feed it
 * malformed worlds on purpose. A malformed world must be REFUSED by name, never
 * silently normalized: a simulator that quietly repairs its inputs cannot tell
 * you that its generator is broken.
 * ------------------------------------------------------------------------- */

export function validateWorld(world) {
  assertForge(world !== null && typeof world === 'object' && !Array.isArray(world), 'World must be an object');
  assertForge(world.schemaVersion === FORGE_STATE_SCHEMA_VERSION, 'World.schemaVersion mismatch', { got: world.schemaVersion });
  assertForge(Number.isInteger(world.tick) && world.tick >= 0, 'World.tick must be a non-negative integer');
  assertForge(Number.isInteger(world.maxTicks) && world.maxTicks > 0, 'World.maxTicks must be a positive integer');
  assertForge(typeof world.seed === 'string' && /^\d+$/.test(world.seed), 'World.seed must be a base-10 integer string');

  const grid = world.grid;
  assertForge(grid !== null && typeof grid === 'object', 'World.grid is required');
  assertForge(Number.isInteger(grid.width) && grid.width > 0, 'grid.width must be a positive integer');
  assertForge(Number.isInteger(grid.height) && grid.height > 0, 'grid.height must be a positive integer');
  assertForge(Array.isArray(grid.cells) && grid.cells.length === grid.width * grid.height, 'grid.cells length must equal width*height');
  for (const code of grid.cells) {
    assertForge(FORGE_TERRAIN_BY_CODE[code] !== undefined, 'grid.cells contains an unknown terrain code', { code });
  }

  assertForge(Array.isArray(world.entities), 'World.entities must be an array');
  const ids = new Set();
  for (const entity of world.entities) {
    assertForge(entity !== null && typeof entity === 'object', 'Each entity must be an object');
    assertForge(typeof entity.id === 'string' && entity.id.length > 0, 'entity.id is required');
    assertForge(!ids.has(entity.id), 'Duplicate entity id', { id: entity.id });
    ids.add(entity.id);
    assertForge(FORGE_ENTITY_TYPES[entity.type] !== undefined, 'Unknown entity type', { id: entity.id, type: entity.type });
    assertForge(Number.isInteger(entity.position?.x) && Number.isInteger(entity.position?.y), 'entity.position must be integer x/y', { id: entity.id });
    assertForge(entity.position.x >= 0 && entity.position.x < grid.width, 'entity.position.x out of bounds', { id: entity.id });
    assertForge(entity.position.y >= 0 && entity.position.y < grid.height, 'entity.position.y out of bounds', { id: entity.id });
    for (const field of ['health', 'value', 'cost', 'risk']) {
      assertForge(Number.isInteger(entity[field]), `entity.${field} must be an integer`, { id: entity.id, field });
    }
    assertForge(typeof entity.available === 'boolean', 'entity.available must be boolean', { id: entity.id });
    assertForge(typeof entity.faction === 'string' && entity.faction.length > 0, 'entity.faction is required', { id: entity.id });
    assertForge(entity.flags !== null && typeof entity.flags === 'object' && !Array.isArray(entity.flags), 'entity.flags must be an object', { id: entity.id });
    assertForge(entity.resources !== null && typeof entity.resources === 'object' && !Array.isArray(entity.resources), 'entity.resources must be an object', { id: entity.id });
  }

  assertForge(Array.isArray(world.relations), 'World.relations must be an array');
  for (const relation of world.relations) {
    assertForge(relation !== null && typeof relation === 'object', 'Each relation must be an object');
    assertForge(FORGE_RELATION_TYPES[relation.type] !== undefined, 'Unknown relation type', { type: relation.type });
    assertForge(ids.has(relation.from), 'Relation references an unknown source entity', { from: relation.from });
    assertForge(ids.has(relation.to), 'Relation references an unknown target entity', { to: relation.to });
  }

  assertForge(Array.isArray(world.objectives) && world.objectives.length > 0, 'World.objectives must be a non-empty array');
  for (const objective of world.objectives) {
    assertForge(typeof objective.id === 'string' && objective.id.length > 0, 'objective.id is required');
    assertForge(ids.has(objective.entityId), 'objective.entityId must reference an entity', { id: objective.id });
    assertForge(Number.isInteger(objective.requiredValue) && objective.requiredValue >= 0, 'objective.requiredValue must be a non-negative integer');
    assertForge(Number.isInteger(objective.deliveredValue) && objective.deliveredValue >= 0, 'objective.deliveredValue must be a non-negative integer');
  }

  assertForge(Array.isArray(world.events), 'World.events must be an array');
  assertForge(world.channels !== null && typeof world.channels === 'object' && !Array.isArray(world.channels), 'World.channels must be an object');
  assertForge(Array.isArray(world.history), 'World.history must be an array');
  return world;
}
