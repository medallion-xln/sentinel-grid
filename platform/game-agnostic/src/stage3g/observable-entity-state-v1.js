import { deepFreeze, sha256 } from '../core/determinism.js';
import { forgeWorldAdapter } from '../forge/adapter.js';
import { FORGE_ENTITY_TYPES, FORGE_TERRAIN_BY_CODE } from '../forge/contract.js';
import { observedThreatStructure } from '../stage3f/deployable-action-proposal-v1.js';
import { EPISTEMIC_SCHEMA_HASH } from './epistemic-provenance-v1.js';

/* ===========================================================================
 * STAGE_3G_2 — SENTINEL_OBSERVABLE_ENTITY_STATE_V1
 *
 * A canonical, decision-time entity state that exposes only what the environment genuinely shows the decision maker.
 *
 * Observability basis (Forge). The Forge adapter manifest declares capabilities.imperfectInformation=false, and the
 * Forge renderer draws every entity on the map: its cell, its kind (glyph) and whether it is in service (glyph case).
 * The Stage 3F interfaces discarded that map (ObservationPacket carries only the actor cell), which is why Stage 3F.6-P.1A
 * classified entity positions UNAVAILABLE. Stage 3G adds a structured visible-map channel. It never parses the ASCII
 * (the Forge contract forbids reading rendered characters back), and it exposes the map in the PRESENTED frame only.
 *
 * What stays out. Numeric internals the map does not show (entity value, cost, risk, non-actor health, carried
 * resources, flags other than `critical`) are UNAVAILABLE in this contract version. The hidden benchmark orientation,
 * base-frame geometry, the canonical frame and the kernel world digest are PRIVILEGED. Oracle labels, regret, successor
 * states and rollouts are ORACLE / FUTURE and never reach this module: its inputs are the ObservationPacket and the
 * visible map, nothing else.
 *
 * forgeVisibleMap() is the only function here that reads a kernel world, through an explicit field whitelist.
 * ========================================================================= */

export const OBSERVABLE_ENTITY_STATE_ID = 'SENTINEL_OBSERVABLE_ENTITY_STATE_V1';
export const FORGE_VISIBLE_MAP_ID = 'SENTINEL_FORGE_VISIBLE_MAP_V1';
const DELTA = deepFreeze({ NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] });
const F = deepFreeze({ TICK: 0, REMAINING: 1, ENERGY: 2, ACTOR_X: 3, ACTOR_Y: 4, ACTOR_HEALTH: 5, CARRIED: 6 });

export const FORGE_OBSERVABILITY_DECLARATION = deepFreeze({
  environment: 'sentinel-forge-world',
  adapterDeclaresImperfectInformation: forgeWorldAdapter.manifest().capabilities.imperfectInformation,
  basis: 'Forge declares perfect information (adapter manifest capabilities.imperfectInformation=false) and renders every entity: cell, kind glyph, in-service glyph case. The visible map is therefore decision-time information that the Stage 3F interfaces did not carry.',
  frame: 'PRESENTED: coordinates as the environment presents them (for FORGE_SYMMETRIC_V2, after the hidden seed-bound D4 orientation). The base frame and the orientation are never exposed.',
  visibleMapFields: ['tick', 'grid.width', 'grid.height', 'grid.terrain (per cell)', 'entity.id', 'entity.kind', 'entity.position', 'entity.inService'],
  notExposedInV1: ['entity.value', 'entity.cost', 'entity.risk', 'entity.health (non-actor)', 'entity.resources', 'entity.flags (other than critical, carried by canonicalState)', 'entity.faction (hostility is carried by canonicalState)'],
  otherEnvironments: 'each environment must declare its own observability before this contract applies; nothing here asserts that another game is fully observable',
});

/** The visible-map channel: whitelisted fields of the presented world. The only kernel read in Stage 3G.2. */
export function forgeVisibleMap(world) {
  const { width, height, cells } = world.grid;
  return deepFreeze({
    mapId: FORGE_VISIBLE_MAP_ID, tick: world.tick, width, height,
    terrain: cells.map((code) => FORGE_TERRAIN_BY_CODE[code].name),
    entities: [...world.entities].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((e) => ({
      id: e.id, kind: e.type, position: { x: e.position.x, y: e.position.y }, inService: e.available === true && e.health > 0,
    })),
  });
}

/** Digest of everything the decision maker observed. It deliberately excludes ObservationPacket.metadata.worldHash (a digest of privileged state). */
export function observationHash(observation, visibleMap) {
  const m = observation.metadata ?? {};
  return sha256({ features: observation.features, scenarioLevel: m.scenarioLevel ?? null, canonicalState: m.canonicalState ?? null,
    objectives: m.objectives ?? null, observationHistory: m.observationHistory ?? null, visibleMap });
}

/* ------------------------------------------------------------ field classification */
const fc = (field, cls, source, equivariance, derivation = null) => ({ field, class: cls, source, equivariance, derivation });
/** Every entity-level field with its epistemic class (OBSERVED=E0, DETERMINISTICALLY_DERIVED=E1, MODEL_INFERRED=E3, UNAVAILABLE=EU). */
export const ENTITY_FIELD_CLASSIFICATION = deepFreeze([
  fc('entityId', 'OBSERVED', 'visible map / canonicalState entity handle (opaque: no derivation reads its characters)', 'INVARIANT'),
  fc('entityKind', 'OBSERVED', 'visible map glyph kind = canonicalState kind', 'INVARIANT'),
  fc('observedPosition', 'OBSERVED', 'visible map cell in the presented frame', 'FRAME_DEPENDENT'),
  fc('inService', 'OBSERVED', 'visible map glyph case', 'INVARIANT'),
  fc('hostileFlag', 'OBSERVED', 'canonicalState.entities[].hostile', 'INVARIANT'),
  fc('criticalFlag', 'OBSERVED', 'canonicalState.entities[].critical', 'INVARIANT'),
  fc('observedRelationships', 'OBSERVED', 'canonicalState.relationships (Nexus kinds)', 'INVARIANT'),
  fc('observationTimestamp', 'OBSERVED', 'ObservationPacket.features[0] (tick) = visible map tick', 'INVARIANT'),
  fc('actorRelativePosition', 'DETERMINISTICALLY_DERIVED', 'observedPosition - actor observedPosition', 'EQUIVARIANT', ['observedPosition', 'actor.observedPosition']),
  fc('relativeDistance.manhattan', 'DETERMINISTICALLY_DERIVED', '|dx| + |dy|', 'INVARIANT', ['actorRelativePosition']),
  fc('relativeDistance.path', 'DETERMINISTICALLY_DERIVED', 'breadth-first steps over observed traversable terrain avoiding in-service blocking kinds (null if unreachable)', 'INVARIANT', ['terrain', 'observedPosition', 'entityKind', 'inService']),
  fc('relativeDirection', 'DETERMINISTICALLY_DERIVED', 'sign(dx), sign(dy) in the presented frame', 'EQUIVARIANT', ['actorRelativePosition']),
  fc('resourceFlag', 'DETERMINISTICALLY_DERIVED', 'entityKind = RESOURCE and inService', 'INVARIANT', ['entityKind', 'inService']),
  fc('objectiveFlag', 'DETERMINISTICALLY_DERIVED', 'entityId is an objective entityId (ObservationPacket.metadata.objectives)', 'INVARIANT', ['entityId', 'objectives']),
  fc('threatenedFlag', 'DETERMINISTICALLY_DERIVED', 'target of a threatens relationship', 'INVARIANT', ['observedRelationships']),
  fc('hubFlag', 'DETERMINISTICALLY_DERIVED', 'two or more depends relationships point to it', 'INVARIANT', ['observedRelationships']),
  fc('provenance', 'DETERMINISTICALLY_DERIVED', 'sourceStateHash, logical time, schema hashes', 'INVARIANT', ['observationHash']),
  fc('entityValue', 'UNAVAILABLE', 'not shown on the map; not exposed in V1', 'INVARIANT'),
  fc('entityHealth', 'UNAVAILABLE', 'non-actor health is not shown (only in-service vs out of service)', 'INVARIANT'),
  fc('entityCost', 'UNAVAILABLE', 'not exposed', 'INVARIANT'),
  fc('entityRisk', 'UNAVAILABLE', 'not exposed', 'INVARIANT'),
  fc('entityResources', 'UNAVAILABLE', 'not exposed (the actor\'s carried material is observed separately)', 'INVARIANT'),
  fc('entityFlags', 'UNAVAILABLE', 'flags other than critical are not exposed; some are revealed by the legality of targeted actions (ACTION_SEMANTICS_V1 preconditions)', 'INVARIANT'),
  fc('entityFuturePosition', 'MODEL_INFERRED', 'reserved: any predicted position must be an E3 record in the provisional lane; none is produced in Stage 3G.1/3G.2', 'EQUIVARIANT'),
  fc('entityIntent', 'MODEL_INFERRED', 'reserved: inferred latent intent (E3); none is produced', 'INVARIANT'),
]);
export const ACTOR_FIELD_CLASSIFICATION = deepFreeze([
  fc('actor.entityId', 'OBSERVED', 'the visible ACTOR entity at ObservationPacket.features[3..4]', 'INVARIANT'),
  fc('actor.observedPosition', 'OBSERVED', 'ObservationPacket.features[3..4] = visible map cell', 'FRAME_DEPENDENT'),
  fc('actor.energy', 'OBSERVED', 'ObservationPacket.features[2]', 'INVARIANT'),
  fc('actor.health', 'OBSERVED', 'ObservationPacket.features[5]', 'INVARIANT'),
  fc('actor.carriedMaterial', 'OBSERVED', 'ObservationPacket.features[6]', 'INVARIANT'),
  fc('actor.ticksRemaining', 'OBSERVED', 'ObservationPacket.features[1]', 'INVARIANT'),
  fc('actor.terrain', 'OBSERVED', 'visible map terrain at the actor cell', 'INVARIANT'),
  fc('actor.borderDistance', 'DETERMINISTICALLY_DERIVED', 'min distance to a grid edge', 'INVARIANT', ['actor.observedPosition', 'grid']),
]);

/* ------------------------------------------------------------ privileged boundary */
/** What may never enter the deployable Stage 3G state contract, by category. */
export const PRIVILEGED_BOUNDARY = deepFreeze({
  KERNEL_PRIVATE_GEOMETRY: ['base-frame (pre-orientation) positions', 'geometry digest', 'canonical frame (argmin of a digest over the full kernel geometry)'],
  HIDDEN_ORIENTATION: ['the seed-bound D4 orientation of the scenario', 'base-frame direction of any action'],
  ORACLE_OPTIMAL_ACTIONS: ['optimal-set membership', 'oracle best action', 'greedy-safe label'],
  REGRET: ['counterfactual regret', 'normalised regret'],
  FUTURE_STATE: ['successor state', 'one-step immediate scalar', 'temporal channel values beyond the current tick'],
  ROLLOUT_RESULTS: ['horizon rollout totals', 'terminal outcome of any branch'],
  SYNTHETIC_LABELS: ['labels produced by the corpus generator', 'warm-up provenance', 'benchmark generator identity'],
  KERNEL_DIGESTS_AND_INTERNALS: ['ObservationPacket.metadata.worldHash (digest of privileged state)', 'scenario seed', 'entity value / cost / risk / non-actor health / resources / private flags'],
});
/** Key names that may not appear anywhere in runtime-facing Stage 3G state (checked recursively, case-insensitive). */
export const FORBIDDEN_RUNTIME_KEYS = deepFreeze(['orientation', 'baseframe', 'hiddenorientation', 'canonicalframe', 'canonicalorientation', 'geometrydigest',
  'optimal', 'optimalset', 'oracle', 'regret', 'label', 'labels', 'greedysafe', 'rollout', 'horizontotal', 'totalscalar', 'nextstate', 'futurestate', 'successor',
  'onestep', 'immediatescalar', 'scalarreward', 'rewardvector', 'worldhash', 'seed', 'scenarioseed', 'value', 'risk', 'cost', 'health', 'resources', 'flags',
  'channels', 'history', 'hazards', 'faction', 'synthetic', 'generator', 'benchmarkid', 'warmup', 'maxticks']);
/** Allowed spellings that contain a forbidden stem but name an OBSERVED/declared quantity. */
const ALLOWED_RUNTIME_KEYS = deepFreeze(['declaredresourcecost', 'declaredcost', 'actorhealth', 'carriedmaterial', 'contractvalue', 'inputvalues']);

/** Recursive key scan of a runtime-facing object. Returns the offending key paths (empty = clean). */
export function privilegedKeyScan(object) {
  const hits = [];
  const walk = (v, where) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${where}[${i}]`)); return; }
    if (v === null || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      const lk = k.toLowerCase();
      if (FORBIDDEN_RUNTIME_KEYS.includes(lk) && !ALLOWED_RUNTIME_KEYS.includes(lk)) hits.push(`${where}.${k}`);
      walk(x, `${where}.${k}`);
    }
  };
  walk(object, '$');
  return hits;
}

/* ------------------------------------------------------------ geometry helpers */
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const TRAVERSABLE_BY_NAME = deepFreeze(Object.fromEntries(Object.values(FORGE_TERRAIN_BY_CODE).map((s) => [s.name, s.traversable])));

/** Breadth-first distances from `start` over the observed map: traversable terrain, avoiding in-service blocking kinds. */
export function pathDistances(map, start) {
  const { width, height } = map;
  const blocked = new Uint8Array(width * height);
  map.terrain.forEach((t, i) => { if (TRAVERSABLE_BY_NAME[t] !== true) blocked[i] = 1; });
  for (const e of map.entities) if (FORGE_ENTITY_TYPES[e.kind]?.blocking && e.inService) blocked[e.position.y * width + e.position.x] = 1;
  const dist = new Int32Array(width * height).fill(-1);
  if (start.x < 0 || start.y < 0 || start.x >= width || start.y >= height) return dist;
  const queue = [start.y * width + start.x]; dist[queue[0]] = 0;
  for (let h = 0; h < queue.length; h += 1) {
    const c = queue[h]; const x = c % width; const y = (c - x) / width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (dist[n] !== -1 || blocked[n]) continue;
      dist[n] = dist[c] + 1; queue.push(n);
    }
  }
  return dist;
}
export const terrainAt = (map, p) => (p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height ? map.terrain[p.y * map.width + p.x] : null);

/* ------------------------------------------------------------ the entity state */

/**
 * Build the observable entity state from { observation (ObservationPacket), visibleMap }. Nothing else is read.
 * Fails closed (throws) if the packet and the map disagree about the actor cell or the tick.
 */
export function buildObservableEntityState({ observation, visibleMap }) {
  const feats = observation.features;
  const meta = observation.metadata ?? {};
  if (!isInt(feats?.[F.ACTOR_X]) || !isInt(feats?.[F.ACTOR_Y])) throw new Error('OBSERVABLE_STATE: actor cell not observed');
  if (feats[F.TICK] !== visibleMap.tick) throw new Error('OBSERVABLE_STATE: packet and visible map disagree on the tick');
  const actorCell = { x: feats[F.ACTOR_X], y: feats[F.ACTOR_Y] };
  const actors = visibleMap.entities.filter((e) => e.kind === 'ACTOR' && e.position.x === actorCell.x && e.position.y === actorCell.y);
  if (actors.length !== 1) throw new Error('OBSERVABLE_STATE: the observed actor cell does not hold exactly one visible actor');
  const actor = actors[0];
  const canonical = meta.canonicalState ?? { entities: [], relationships: [] };
  const byCanonical = new Map(canonical.entities.map((e) => [e.id, e]));
  const structure = observedThreatStructure(canonical);
  const objectiveIds = new Set((meta.objectives ?? []).map((o) => o.entityId));
  const hash = observationHash(observation, visibleMap);
  const dist = pathDistances(visibleMap, actorCell);
  const logicalTime = visibleMap.tick;
  const relationshipsOf = (id) => canonical.relationships.flatMap((r) => [
    ...(r.from === id ? [{ kind: r.kind, role: 'FROM', otherEntityId: r.to }] : []), ...(r.to === id ? [{ kind: r.kind, role: 'TO', otherEntityId: r.from }] : []),
  ]).sort((a, b) => (`${a.kind}${a.role}${a.otherEntityId}` < `${b.kind}${b.role}${b.otherEntityId}` ? -1 : 1));
  const provenance = { sourceStateHash: hash, logicalTime, access: 'DEPLOYABLE', schemaId: OBSERVABLE_ENTITY_STATE_ID, epistemicSchemaHash: EPISTEMIC_SCHEMA_HASH };
  const entities = visibleMap.entities.filter((e) => e.id !== actor.id).map((e) => {
    const c = byCanonical.get(e.id);
    if (c === undefined || c.kind !== e.kind) throw new Error('OBSERVABLE_STATE: visible map and canonicalState disagree on an entity');
    const dx = e.position.x - actorCell.x; const dy = e.position.y - actorCell.y;
    const d = dist[e.position.y * visibleMap.width + e.position.x];
    return {
      entityId: e.id, entityKind: e.kind, observedPosition: { x: e.position.x, y: e.position.y },
      actorRelativePosition: { dx, dy }, relativeDistance: { manhattan: Math.abs(dx) + Math.abs(dy), path: d < 0 ? null : d },
      relativeDirection: { sx: sign(dx), sy: sign(dy) },
      hostileFlag: c.hostile === true, criticalFlag: c.critical === true, resourceFlag: e.kind === 'RESOURCE' && e.inService,
      objectiveFlag: objectiveIds.has(e.id), inService: e.inService,
      threatenedFlag: (structure.threatenedBy.get(e.id) ?? 0) > 0, hubFlag: (structure.dependents.get(e.id) ?? 0) >= 2,
      observedRelationships: relationshipsOf(e.id), observationTimestamp: logicalTime, provenance,
    };
  });
  const border = Math.min(actorCell.x, actorCell.y, visibleMap.width - 1 - actorCell.x, visibleMap.height - 1 - actorCell.y);
  return deepFreeze({
    schemaId: OBSERVABLE_ENTITY_STATE_ID, sourceStateHash: hash, observationTimestamp: logicalTime,
    grid: { width: visibleMap.width, height: visibleMap.height },
    actor: { entityId: actor.id, observedPosition: actorCell, energy: feats[F.ENERGY], actorHealth: feats[F.ACTOR_HEALTH], carriedMaterial: feats[F.CARRIED],
      ticksRemaining: feats[F.REMAINING], terrain: terrainAt(visibleMap, actorCell), borderDistance: border },
    entities, provenance,
  });
}

/** Observable entity classes used by action-relative geometry (all derived from E0 fields; none reads an id's characters). */
export const ENTITY_CLASSES = deepFreeze({
  OBJECTIVE: (e) => e.objectiveFlag,
  RESOURCE: (e) => e.resourceFlag,
  HOSTILE: (e) => e.hostileFlag && e.inService,
  THREATENED: (e) => e.threatenedFlag,
  CRITICAL: (e) => e.criticalFlag,
  HUB: (e) => e.hubFlag,
});
export const ENTITY_CLASS_NAMES = deepFreeze(Object.keys(ENTITY_CLASSES));

export const OBSERVABLE_ENTITY_STATE_SCHEMA = deepFreeze({
  schemaId: OBSERVABLE_ENTITY_STATE_ID, schemaVersion: 1, visibleMapId: FORGE_VISIBLE_MAP_ID,
  observability: FORGE_OBSERVABILITY_DECLARATION,
  inputs: ['ObservationPacket (features, metadata.scenarioLevel, metadata.canonicalState, metadata.objectives, metadata.observationHistory)', 'visible map (forgeVisibleMap)'],
  entityFields: ENTITY_FIELD_CLASSIFICATION, actorFields: ACTOR_FIELD_CLASSIFICATION,
  entityClasses: { OBJECTIVE: 'objectiveFlag', RESOURCE: 'resourceFlag (kind RESOURCE, in service)', HOSTILE: 'hostileFlag and in service', THREATENED: 'threatenedFlag', CRITICAL: 'criticalFlag', HUB: 'hubFlag' },
  privilegedBoundary: PRIVILEGED_BOUNDARY, forbiddenRuntimeKeys: FORBIDDEN_RUNTIME_KEYS, allowedRuntimeKeys: ALLOWED_RUNTIME_KEYS,
  failClosed: ['actor cell not observed', 'packet/map tick mismatch', 'observed actor cell without exactly one visible actor', 'map/canonicalState entity mismatch'],
  idRule: 'entity and action identities are opaque handles: no derivation reads their characters, and renaming them consistently changes nothing',
  epistemicSchemaHash: EPISTEMIC_SCHEMA_HASH,
});
export const OBSERVABLE_ENTITY_STATE_SCHEMA_HASH = sha256(OBSERVABLE_ENTITY_STATE_SCHEMA);
export { DELTA as MOVE_DELTAS, manhattan };
