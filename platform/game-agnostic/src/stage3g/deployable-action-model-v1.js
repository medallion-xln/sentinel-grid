import { deepFreeze, sha256 } from '../core/determinism.js';
import { ACTION_SEMANTICS_CONTRACT, ACTION_SEMANTICS_SCHEMA_HASH } from './action-semantics-v1.js';
import { ENTITY_CLASS_NAMES, ENTITY_CLASSES, MOVE_DELTAS, pathDistances, terrainAt } from './observable-entity-state-v1.js';

// This is an action-effect projection, NEVER a successor-world prediction. All exogenous fields are UNKNOWN.
// Further spatial branches are explicitly CONDITIONAL_ON_UNKNOWN_LEGALITY; the reference map is t0 evidence.
export const UNKNOWN = 'UNKNOWN';
export const ACTION_MODEL_SCHEMA = deepFreeze({
  schemaId: 'DEPLOYABLE_ACTION_MODEL_V1', version: 1, actionSemanticsHash: ACTION_SEMANTICS_SCHEMA_HASH,
  knownEffects: [...new Set(Object.values(ACTION_SEMANTICS_CONTRACT).flatMap(s => s.effects.filter(e => e.class === 'E1').map(e => e.effect)))],
  unknownEffects: ['HOSTILE_ATTACK', 'HAZARD_DAMAGE', 'SERVICE_REVERSAL', 'ENTITY_STATE_CHANGE', 'RESOURCE_STATE_CHANGE', 'OTHER', 'EU_ACTION_MAGNITUDES'],
  inputs: ['current observable entity state', 'current visible map', 'certified legal action semantics'],
  unknownRule: 'Never replace UNKNOWN with simulator truth or assume no reaction. Keep certified action effects in a separate conditional projection; actual next health/service/position/legality and every unavailable magnitude remain UNKNOWN.',
  continuation: 'Exhaustive MOVE/WAIT action-effect envelope over the observed reference map, avoiding observed blockers. Future branches are conditional on unknown legality and actor survival. No future target actions are invented. No RETREAT tie-break is needed: all spatial neighbours are enumerated.',
  depths: [0, 1, 2, 3], depthMeaning: 'root action then d conditional navigation actions (same convention as Stage 3G.4)',
  searchColumns: [...ENTITY_CLASS_NAMES.map(x => `bestReferenceDistanceGain.${x}`), 'distinctEndpoints', 'referenceHazardFreeFraction', 'rootCollection', 'unknownLegality'],
  scoring: 'Fixed conditional-logit scorer fitted on open labels; root observable representation plus bounded envelope columns. No simulator reward, oracle, rollout or privileged scalar is a deployable scoring input.',
  authority: 'R0',
});
export const ACTION_MODEL_SCHEMA_HASH = sha256(ACTION_MODEL_SCHEMA);

export function projectAction(state, semantics) {
  const projection = { position: { ...state.actor.observedPosition }, energy: state.actor.energy, tick: state.observationTimestamp,
    carriedMaterial: state.actor.carriedMaterial, serviceEffects: {}, shields: {}, deliveries: {} };
  const applied = [];
  for (const e of semantics.deterministicImmediateEffects) {
    if (e.class !== 'E1') continue;
    applied.push(e.effect);
    if (e.effect === 'ACTOR_DISPLACEMENT') projection.position = { ...e.destination };
    if (e.effect === 'ENERGY_DELTA') projection.energy = e.energyAfter;
    if (e.effect === 'TICK_ADVANCE') projection.tick += 1;
    if (e.effect === 'CARRIED_MATERIAL_TO_ZERO') projection.carriedMaterial = 0;
    if (e.effect === 'TARGET_LEAVES_SERVICE') projection.serviceEffects[semantics.target] = false;
    if (e.effect === 'TARGET_PROTECTED') projection.shields[semantics.target] = true;
    if (e.effect === 'OBJECTIVE_DELIVERY') projection.deliveries[semantics.target] = e.deliveredIncrement;
  }
  if (semantics.deterministicImmediateEffects.some(e => e.effect === 'CARRIED_MATERIAL_INCREASES' && e.class !== 'E1')) projection.carriedMaterial = UNKNOWN;
  return deepFreeze({ schemaId: ACTION_MODEL_SCHEMA.schemaId, projection, applied,
    actualNext: { actorHealth: UNKNOWN, entityPositions: UNKNOWN, entityService: UNKNOWN, entityState: UNKNOWN, resourceState: UNKNOWN, legality: UNKNOWN, terminal: UNKNOWN },
    unknownEffects: [...ACTION_MODEL_SCHEMA.unknownEffects], status: 'ACTION_EFFECT_PROJECTION_WITH_UNKNOWN_ENVIRONMENT' });
}

/** Deterministic exhaustive navigation envelope. UNKNOWN world fields are never read to make a successor world. */
export function deployableSearch(state, visibleMap, semantics, depth) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 3) throw new Error('DEPLOYABLE_SEARCH: depth must be 0..3');
  const root = projectAction(state, semantics);
  const origin = state.actor.observedPosition;
  // map is a named reference, never promoted to a forecast. Root E1 service removal may remove a reference blocker.
  const reference = { ...visibleMap, entities: visibleMap.entities.map(e => ({ ...e, inService: root.projection.serviceEffects[e.id] === false ? false : e.inService })) };
  const referenceEntities = state.entities.map(e => root.projection.serviceEffects[e.entityId] === false ? { ...e, inService: false, resourceFlag: false } : e);
  let endpoints = new Map([[`${root.projection.position.x},${root.projection.position.y}`, root.projection.position]]);
  for (let d = 0; d < depth && d + 1 < state.actor.ticksRemaining; d += 1) {
    const next = new Map();
    for (const p of endpoints.values()) {
      next.set(`${p.x},${p.y}`, p); // WAIT
      const distances = pathDistances(reference, p);
      for (const [dx, dy] of Object.values(MOVE_DELTAS)) {
        const q = { x: p.x + dx, y: p.y + dy };
        if (q.x < 0 || q.y < 0 || q.x >= reference.width || q.y >= reference.height) continue;
        if (distances[q.y * reference.width + q.x] !== 1) continue;
        next.set(`${q.x},${q.y}`, q);
      }
    }
    endpoints = next;
  }
  const points = [...endpoints.values()];
  const nearest = (p, pred) => {
    const ds = pathDistances(reference, p);
    const v = referenceEntities.filter(pred).map(e => ds[e.observedPosition.y * reference.width + e.observedPosition.x]).filter(d => d >= 0);
    return v.length ? Math.min(...v) : reference.width * reference.height;
  };
  const gains = ENTITY_CLASS_NAMES.map(k => {
    const start = nearest(origin, ENTITY_CLASSES[k]);
    const end = points.map(p => nearest(p, ENTITY_CLASSES[k]));
    return k === 'HOSTILE' ? Math.max(...end) - start : start - Math.min(...end);
  });
  return { root, depth, conditionalLegality: depth > 0 ? UNKNOWN : 'ROOT_OFFERED_LEGAL', endpoints: points,
    features: [...gains, points.length, points.filter(p => terrainAt(reference, p) !== 'ENVIRONMENTAL_HAZARD').length / points.length,
      semantics.actionType === 'COLLECT' ? 1 : 0, depth > 0 ? 1 : 0] };
}
