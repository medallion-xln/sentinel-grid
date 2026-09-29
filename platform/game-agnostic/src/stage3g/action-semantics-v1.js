import { deepFreeze, sha256 } from '../core/determinism.js';
import { DECLARED_ACTION_COST_MODEL } from '../stage3f/deployable-action-proposal-v1.js';
import { EPISTEMIC_SCHEMA_HASH } from './epistemic-provenance-v1.js';
import { ENTITY_CLASSES, ENTITY_CLASS_NAMES, MOVE_DELTAS, OBSERVABLE_ENTITY_STATE_SCHEMA_HASH, manhattan, pathDistances, terrainAt } from './observable-entity-state-v1.js';

/* ===========================================================================
 * STAGE_3G_2 — ACTION_SEMANTICS_V1 and the action-relative spatial state.
 *
 * What each legal action MEANS, derived only from the current observable entity state and the action contract.
 *
 * Deterministic immediate effects are only those the action contract itself implies for a LEGAL action, each classified
 * E1: the actor's displacement for MOVE/RETREAT (a legal move always lands on its destination: the Forge adapter
 * declares stochasticTransitions=false), the declared energy cost, the one-tick advance, and target-side changes the
 * kernel contract states outright (COLLECT takes the resource out of service, TRANSFER empties the carried material into
 * the target, ...). An effect whose magnitude depends on an unexposed attribute (a resource's value, a target's health)
 * is declared with its magnitude UNAVAILABLE rather than guessed.
 *
 * Excluded on purpose: environment dynamics that happen whatever the actor does (hostile attacks, hazard damage). Those
 * are world transitions; modelling them is prediction (E3) and belongs to a later substage. No simulator successor state,
 * one-step reward or rollout result is read or produced here.
 * ========================================================================= */

export const ACTION_SEMANTICS_ID = 'ACTION_SEMANTICS_V1';
const COST = DECLARED_ACTION_COST_MODEL.cost;

const E1 = 'E1'; const EU = 'EU';
const eff = (effect, cls, detail) => ({ effect, class: cls, detail });
const pre = (id, evidence) => ({ id, evidence });
/** The contract, by action type. `evidence`: OBSERVED (checkable from observed state) or LEGALITY (revealed by the action being offered). */
export const ACTION_SEMANTICS_CONTRACT = deepFreeze({
  MOVE: { target: 'NONE', parameters: ['direction'], preconditions: [pre('NOT_TERMINAL', 'LEGALITY'), pre('DESTINATION_IN_BOUNDS', 'OBSERVED'), pre('DESTINATION_TRAVERSABLE', 'OBSERVED'), pre('DESTINATION_UNBLOCKED', 'OBSERVED')],
    effects: [eff('ACTOR_DISPLACEMENT', E1, 'actor cell := actor cell + declared direction delta'), eff('ENERGY_DELTA', E1, '-declared cost'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['OUT_OF_BOUNDS', 'BLOCKED_CELL', 'TERMINAL_STATE'] },
  RETREAT: { target: 'NONE', parameters: ['toX', 'toY'], preconditions: [pre('LIVE_HOSTILE_PRESENT', 'OBSERVED'), pre('DESTINATION_ADJACENT', 'OBSERVED'), pre('DESTINATION_TRAVERSABLE', 'OBSERVED'), pre('DESTINATION_UNBLOCKED', 'OBSERVED'), pre('STEP_AWAY_FROM_NEAREST_HOSTILE', 'OBSERVED')],
    effects: [eff('ACTOR_DISPLACEMENT', E1, 'actor cell := (toX, toY)'), eff('ENERGY_DELTA', E1, '-declared cost'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['NO_HOSTILE_PRESENT', 'BLOCKED_CELL', 'TERMINAL_STATE'] },
  WAIT: { target: 'NONE', parameters: [], preconditions: [pre('NOT_TERMINAL', 'LEGALITY')], effects: [eff('TICK_ADVANCE', E1, '+1')], failureConditions: ['TERMINAL_STATE'] },
  COLLECT: { target: 'ENTITY', parameters: [], preconditions: [pre('TARGET_RESOURCE_CO_LOCATED', 'OBSERVED'), pre('TARGET_IN_SERVICE', 'OBSERVED')],
    effects: [eff('TARGET_LEAVES_SERVICE', E1, 'the resource is no longer available'), eff('CARRIED_MATERIAL_INCREASES', EU, 'by the resource value, which is not exposed'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['INSUFFICIENT_RESOURCES', 'TARGET_NOT_FOUND', 'TERMINAL_STATE'] },
  TRANSFER: { target: 'ENTITY', parameters: [], preconditions: [pre('CARRIED_MATERIAL_POSITIVE', 'OBSERVED'), pre('TARGET_IN_RANGE_1', 'OBSERVED'), pre('TARGET_ACCEPTS_MATERIAL', 'LEGALITY')],
    effects: [eff('CARRIED_MATERIAL_TO_ZERO', E1, 'all carried material moves to the target'), eff('OBJECTIVE_DELIVERY', E1, 'if the target is an objective: delivered += carried, counted up to the required amount'), eff('ENERGY_DELTA', E1, '-declared cost'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['INSUFFICIENT_RESOURCES', 'TARGET_OUT_OF_RANGE', 'TARGET_NOT_ELIGIBLE', 'TERMINAL_STATE'] },
  PROTECT: { target: 'ENTITY', parameters: [], preconditions: [pre('ENERGY_AT_LEAST_COST', 'OBSERVED'), pre('TARGET_IN_RANGE_1', 'OBSERVED'), pre('TARGET_NOT_HOSTILE', 'OBSERVED'), pre('TARGET_NOT_PROTECTED', 'LEGALITY')],
    effects: [eff('TARGET_PROTECTED', E1, 'the target is shielded from degradation'), eff('ENERGY_DELTA', E1, '-declared cost'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['INSUFFICIENT_ENERGY', 'TARGET_OUT_OF_RANGE', 'TARGET_NOT_ELIGIBLE', 'TERMINAL_STATE'] },
  RESTORE: { target: 'ENTITY', parameters: [], preconditions: [pre('ENERGY_AT_LEAST_COST', 'OBSERVED'), pre('TARGET_IN_RANGE_1', 'OBSERVED'), pre('TARGET_OUT_OF_SERVICE', 'OBSERVED'), pre('TARGET_NOT_HOSTILE_KIND', 'OBSERVED')],
    effects: [eff('TARGET_RETURNS_TO_SERVICE', EU, 'the action returns the target to service, but a hostile attack or hazard in the same environment step can take it out again (measured: 3 of 103 DEV RESTOREs), so its post-transition service is not deterministic'), eff('ENERGY_DELTA', E1, '-declared cost'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['INSUFFICIENT_ENERGY', 'TARGET_OUT_OF_RANGE', 'TARGET_NOT_ELIGIBLE', 'TERMINAL_STATE'] },
  REINFORCE: { target: 'ENTITY', parameters: [], preconditions: [pre('ENERGY_AT_LEAST_COST', 'OBSERVED'), pre('TARGET_IN_RANGE_1', 'OBSERVED'), pre('TARGET_NOT_HOSTILE', 'OBSERVED'), pre('TARGET_DAMAGED', 'LEGALITY')],
    effects: [eff('TARGET_HEALTH_INCREASES', EU, 'by up to the declared 25; the resulting health is not exposed'), eff('ENERGY_DELTA', E1, '-declared cost'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['INSUFFICIENT_ENERGY', 'TARGET_OUT_OF_RANGE', 'TARGET_NOT_ELIGIBLE', 'TERMINAL_STATE'] },
  REPAIR: { target: 'ENTITY', parameters: [], preconditions: [pre('ENERGY_AT_LEAST_COST', 'OBSERVED'), pre('TARGET_IN_RANGE_1', 'OBSERVED'), pre('TARGET_NOT_HOSTILE', 'OBSERVED'), pre('TARGET_DAMAGED', 'LEGALITY')],
    effects: [eff('TARGET_HEALTH_INCREASES', EU, 'by up to the declared 40; the resulting health is not exposed'), eff('ENERGY_DELTA', E1, '-declared cost'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['INSUFFICIENT_ENERGY', 'TARGET_OUT_OF_RANGE', 'TARGET_NOT_ELIGIBLE', 'TERMINAL_STATE'] },
  ATTACK: { target: 'ENTITY', parameters: [], preconditions: [pre('ENERGY_AT_LEAST_COST', 'OBSERVED'), pre('TARGET_IN_RANGE_1', 'OBSERVED'), pre('TARGET_HOSTILE_IN_SERVICE', 'OBSERVED')],
    effects: [eff('TARGET_HEALTH_DECREASES', EU, 'by the declared 45; whether it leaves service depends on unexposed health'), eff('ENERGY_DELTA', E1, '-declared cost'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['INSUFFICIENT_ENERGY', 'TARGET_OUT_OF_RANGE', 'NO_HOSTILE_PRESENT', 'TERMINAL_STATE'] },
  BYPASS: { target: 'ENTITY', parameters: ['dependent'], preconditions: [pre('ENERGY_AT_LEAST_COST', 'OBSERVED'), pre('TARGET_IN_RANGE_1', 'OBSERVED'), pre('TARGET_OUT_OF_SERVICE', 'OBSERVED'), pre('SUBSTITUTE_IN_SERVICE', 'OBSERVED')],
    effects: [eff('DEPENDENCY_REWIRED', E1, 'dependent depends on the lowest-identity in-service substitute of the target instead'), eff('ENERGY_DELTA', E1, '-declared cost'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['INSUFFICIENT_ENERGY', 'TARGET_OUT_OF_RANGE', 'NO_SUBSTITUTE_AVAILABLE', 'TERMINAL_STATE'] },
  BUILD: { target: 'ENTITY', parameters: [], preconditions: [pre('ENERGY_AT_LEAST_COST', 'OBSERVED'), pre('TARGET_IN_RANGE_1', 'OBSERVED'), pre('TARGET_PLANNED', 'LEGALITY')],
    effects: [eff('TARGET_RETURNS_TO_SERVICE', EU, 'the planned node is built; its post-transition service can still be changed by the same environment step'), eff('ENERGY_DELTA', E1, '-declared cost'), eff('TICK_ADVANCE', E1, '+1')],
    failureConditions: ['INSUFFICIENT_ENERGY', 'TARGET_OUT_OF_RANGE', 'TARGET_NOT_ELIGIBLE', 'TERMINAL_STATE'] },
});
export const EXCLUDED_EFFECTS = deepFreeze({
  ENVIRONMENT_DYNAMICS: 'hostile attacks and hazard damage happen whatever the actor does; predicting them is E3 transition prediction, not action semantics',
  SUCCESSOR_STATE: 'no simulated successor state, one-step reward or rollout result is read or produced',
  UNEXPOSED_MAGNITUDES: 'effects whose size depends on unexposed attributes (resource value, target health) are declared with class EU',
  DYNAMICS_EXPOSED_EFFECTS: 'every E1 effect is a claim about the POST-TRANSITION observable state; an action effect that the same environment step can undo (RESTORE / BUILD return to service) is declared EU',
});

/** Normalised legal action: { actionId, actionType, targetEntityId, parameters } (accepts the policy surface shape). */
export const normaliseLegalAction = (a) => ({ actionId: a.actionId, actionType: a.actionType, targetEntityId: a.targetEntityId ?? a.target?.id ?? a.action?.target?.id ?? null,
  parameters: a.parameters ?? a.action?.parameters ?? {} });

const destinationOf = (actor, a) => {
  if (a.actionType === 'MOVE' && MOVE_DELTAS[a.parameters?.direction]) return { x: actor.x + MOVE_DELTAS[a.parameters.direction][0], y: actor.y + MOVE_DELTAS[a.parameters.direction][1] };
  if (a.actionType === 'RETREAT' && Number.isInteger(a.parameters?.toX) && Number.isInteger(a.parameters?.toY)) return { x: a.parameters.toX, y: a.parameters.toY };
  return null;
};

/** Nearest distance from `p` to each observable entity class, Manhattan and path (map BFS from p). null = no member / unreachable. */
function nearestByClass(state, map, p, cache) {
  const key = `${p.x},${p.y}`;
  if (cache.has(key)) return cache.get(key);
  const dist = pathDistances(map, p);
  const out = { manhattan: {}, path: {} };
  for (const name of ENTITY_CLASS_NAMES) {
    const members = state.entities.filter(ENTITY_CLASSES[name]);
    out.manhattan[name] = members.length ? Math.min(...members.map((e) => manhattan(p, e.observedPosition))) : null;
    const reach = members.map((e) => dist[e.observedPosition.y * map.width + e.observedPosition.x]).filter((d) => d >= 0);
    out.path[name] = reach.length ? Math.min(...reach) : null;
  }
  cache.set(key, out);
  return out;
}

/**
 * ACTION_SEMANTICS_V1 plus the action-relative spatial state of every legal action, from { state (observable entity
 * state), visibleMap, legalActions } only. Each output carries the Stage 3G field names. Action identities are carried as
 * opaque labels; nothing reads them.
 */
export function deriveActionSemantics({ state, visibleMap, legalActions }) {
  const actor = state.actor.observedPosition;
  const byId = new Map(state.entities.map((e) => [e.entityId, e]));
  const cache = new Map();
  const here = nearestByClass(state, visibleMap, actor, cache);
  const provenance = { sourceStateHash: state.sourceStateHash, logicalTime: state.observationTimestamp, class: E1, access: 'DEPLOYABLE',
    contract: ACTION_SEMANTICS_ID, observableStateSchemaHash: OBSERVABLE_ENTITY_STATE_SCHEMA_HASH, epistemicSchemaHash: EPISTEMIC_SCHEMA_HASH };
  return legalActions.map(normaliseLegalAction).map((a) => {
    const spec = ACTION_SEMANTICS_CONTRACT[a.actionType];
    if (spec === undefined) throw new Error(`ACTION_SEMANTICS: undeclared action type ${a.actionType}`);
    const declaredCost = COST[a.actionType];
    const target = a.targetEntityId === null ? null : byId.get(a.targetEntityId) ?? null;
    const dest = destinationOf(actor, a);
    const displacement = dest === null ? null : { dx: dest.x - actor.x, dy: dest.y - actor.y };
    const there = dest === null ? here : nearestByClass(state, visibleMap, dest, cache);
    const delta = (metric) => Object.fromEntries(ENTITY_CLASS_NAMES.map((c) => {
      const d0 = here[metric][c]; const d1 = there[metric][c];
      return [c, d0 === null && d1 === null ? 0 : d0 === null || d1 === null ? (d1 === null ? 2 : -2) : Math.max(-2, Math.min(2, d1 - d0))];
    }));
    const objective = target === null ? null : target.objectiveFlag;
    const immediate = spec.effects.map((e) => ({ effect: e.effect, class: e.class,
      ...(e.effect === 'ACTOR_DISPLACEMENT' ? { displacement, destination: dest } : {}),
      ...(e.effect === 'ENERGY_DELTA' ? { energyAfter: state.actor.energy - declaredCost } : {}),
      ...(e.effect === 'CARRIED_MATERIAL_TO_ZERO' ? { carriedMaterialAfter: 0 } : {}),
      ...(e.effect === 'OBJECTIVE_DELIVERY' ? { targetIsObjective: objective, deliveredIncrement: objective ? state.actor.carriedMaterial : 0 } : {}),
      ...(e.effect === 'TARGET_LEAVES_SERVICE' || e.effect === 'TARGET_RETURNS_TO_SERVICE' ? { targetInServiceAfter: e.effect === 'TARGET_RETURNS_TO_SERVICE' } : {}),
    }));
    const preconditions = spec.preconditions.map((p) => ({ id: p.id, evidence: p.evidence, status: p.evidence === 'LEGALITY' ? 'IMPLIED_BY_LEGALITY' : 'SATISFIED_OBSERVED' }));
    return {
      /* ACTION_SEMANTICS_V1 */
      actionType: a.actionType, actor: state.actor.entityId, target: a.targetEntityId, parameters: { ...a.parameters },
      preconditions, declaredCost, deterministicImmediateEffects: immediate,
      observableSpatialEffect: displacement === null ? null : { displacement, destination: dest, destinationTerrain: terrainAt(visibleMap, dest) },
      failureConditions: [...spec.failureConditions], provenance,
      /* action-relative spatial state */
      ACTION_ID: a.actionId, ACTION_TYPE: a.actionType, SOURCE_ENTITY: state.actor.entityId, TARGET_ENTITY: a.targetEntityId,
      CURRENT_RELATIVE_GEOMETRY: target === null ? (displacement === null ? null : { step: displacement })
        : { actorRelativePosition: target.actorRelativePosition, relativeDistance: target.relativeDistance },
      DECLARED_RESOURCE_COST: declaredCost,
      LEGAL_PRECONDITIONS: preconditions.map((p) => p.id),
      RELATIVE_SPATIAL_EFFECT_IF_DETERMINISTIC: displacement === null ? null : {
        displacement, deltaNearestManhattan: delta('manhattan'), deltaNearestPath: delta('path'),
        destinationHazard: terrainAt(visibleMap, dest) === 'ENVIRONMENTAL_HAZARD', currentHazard: state.actor.terrain === 'ENVIRONMENTAL_HAZARD',
      },
      TARGET_RELATIONSHIPS: target === null ? [] : target.observedRelationships,
    };
  });
}

/* ------------------------------------------------------------ scoring blocks (representation recheck) */

/** Per-candidate columns of the Stage 3G observable representation. Every column is a D4-invariant scalar. */
export const ENTITY_BLOCK_COLUMNS = deepFreeze([...ENTITY_CLASS_NAMES.map((c) => `delta.${c}`), 'delta.OBJECTIVE_x_carrying', 'delta.RESOURCE_x_notCarrying', 'delta.hazard']);
export function entityBlock(semantics, state, metric) {
  const s = semantics.RELATIVE_SPATIAL_EFFECT_IF_DETERMINISTIC;
  const carrying = state.actor.carriedMaterial > 0 ? 1 : 0;
  if (s === null) return ENTITY_BLOCK_COLUMNS.map(() => 0);
  const d = metric === 'PATH' ? s.deltaNearestPath : s.deltaNearestManhattan;
  return [...ENTITY_CLASS_NAMES.map((c) => d[c]), d.OBJECTIVE * carrying, d.RESOURCE * (1 - carrying), (s.destinationHazard ? 1 : 0) - (s.currentHazard ? 1 : 0)];
}

export const ACTION_SEMANTICS_SCHEMA = deepFreeze({
  schemaId: ACTION_SEMANTICS_ID, schemaVersion: 1,
  fields: ['actionType', 'actor', 'target', 'parameters', 'preconditions', 'declaredCost', 'deterministicImmediateEffects', 'observableSpatialEffect', 'failureConditions', 'provenance'],
  actionRelativeFields: ['ACTION_ID', 'ACTION_TYPE', 'SOURCE_ENTITY', 'TARGET_ENTITY', 'CURRENT_RELATIVE_GEOMETRY', 'DECLARED_RESOURCE_COST', 'LEGAL_PRECONDITIONS', 'RELATIVE_SPATIAL_EFFECT_IF_DETERMINISTIC', 'TARGET_RELATIONSHIPS'],
  contract: ACTION_SEMANTICS_CONTRACT, declaredCostModel: DECLARED_ACTION_COST_MODEL.modelId, excludedEffects: EXCLUDED_EFFECTS,
  deltaRule: 'nearest-distance change from the actor cell to the E1 destination, per observable entity class, clamped to [-2, 2]; a class appearing or disappearing from reach counts as -2 / +2; no displacement -> 0',
  entityBlockColumns: ENTITY_BLOCK_COLUMNS,
  identityRule: 'ACTION_ID is an opaque label, never a scoring input; candidate order is never read',
  frameRule: 'displacement and destination are in the presented frame (FRAME_DEPENDENT, never scoring columns); every scoring column is a D4-invariant scalar',
  observableStateSchemaHash: OBSERVABLE_ENTITY_STATE_SCHEMA_HASH, epistemicSchemaHash: EPISTEMIC_SCHEMA_HASH,
});
export const ACTION_SEMANTICS_SCHEMA_HASH = sha256(ACTION_SEMANTICS_SCHEMA);
