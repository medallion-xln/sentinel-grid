import { deepFreeze, sha256 } from '../core/determinism.js';
import { FORGE_ENTITY_TYPES, FORGE_TERRAIN_BY_CODE } from '../forge/contract.js';
import { MOVE_DELTAS } from './observable-entity-state-v1.js';

/* ===========================================================================
 * STAGE_3G_4 — SENTINEL_OBSERVABLE_OPTION_FEATURES_V1
 *
 * Option-preservation features that need NO future simulation: each is a deterministic function (E1) of the Stage 3G.2
 * observable entity state, the visible map and ACTION_SEMANTICS_V1. They describe the cell a legal action leaves the actor
 * on (the E1 destination of MOVE / RETREAT, or the current cell otherwise): how many moves stay open from it, how many of
 * those are safe on observed terrain and observed hostile adjacency, whether distance from the nearest visible hostile can
 * still grow, how close it is to the grid edge, and whether it traps the actor on hazard terrain.
 *
 * Forge entities other than the actor never move, so the neighbourhood of the destination observed now is the one the actor
 * will face at t+1 (the E1 claim). Anything that depends on health or on environment dynamics is excluded.
 * ========================================================================= */

export const OBSERVABLE_OPTION_FEATURES_ID = 'SENTINEL_OBSERVABLE_OPTION_FEATURES_V1';
export const OBS_OPTION_COLUMNS = deepFreeze([
  { id: 'destMoveCount', class: 'DETERMINISTICALLY_DERIVED', definition: 'in-bounds, traversable, unblocked 4-neighbours of the destination (the MOVEs open at t+1)' },
  { id: 'destSafeMoveCount', class: 'DETERMINISTICALLY_DERIVED', definition: 'of those, neighbours that are not hazard terrain and not Manhattan-adjacent to an in-service visible hostile' },
  { id: 'destRetreatGain', class: 'DETERMINISTICALLY_DERIVED', definition: 'max over open neighbours of (distance to nearest in-service hostile) minus that distance at the destination; 0 with no hostile' },
  { id: 'destBorderMobility', class: 'DETERMINISTICALLY_DERIVED', definition: 'in-bounds 4-neighbours of the destination (4 minus adjacent grid edges)' },
  { id: 'destOnHazard', class: 'DETERMINISTICALLY_DERIVED', definition: '1 if the destination is ENVIRONMENTAL_HAZARD terrain' },
  { id: 'destNonHazardExits', class: 'DETERMINISTICALLY_DERIVED', definition: 'open neighbours of the destination that are not hazard terrain (hazard escape options)' },
]);
export const EXCLUDED = deepFreeze(['anything needing health or damage dynamics', 'future positions of other entities (they never move in Forge; a future engine where they do would make these E3)', 'simulated successor states']);

const TRAVERSABLE = Object.fromEntries(Object.values(FORGE_TERRAIN_BY_CODE).map((s) => [s.name, s.traversable]));
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Per-action observable option features, in the order of `semantics`. Reads only { state, visibleMap, semantics }. */
export function observableOptionFeatures({ state, visibleMap, semantics }) {
  const { width, height } = visibleMap;
  const terrain = (p) => visibleMap.terrain[p.y * width + p.x];
  const blocked = new Set(visibleMap.entities.filter((e) => FORGE_ENTITY_TYPES[e.kind]?.blocking && e.inService).map((e) => `${e.position.x},${e.position.y}`));
  const hostiles = state.entities.filter((e) => e.hostileFlag && e.inService).map((e) => e.observedPosition);
  const nearestHostile = (p) => (hostiles.length ? Math.min(...hostiles.map((h) => manhattan(p, h))) : null);
  const inBounds = (p) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  const open = (p) => inBounds(p) && TRAVERSABLE[terrain(p)] === true && !blocked.has(`${p.x},${p.y}`);
  return semantics.map((s) => {
    const dest = s.observableSpatialEffect?.destination ?? state.actor.observedPosition;
    const nbrs = Object.values(MOVE_DELTAS).map(([dx, dy]) => ({ x: dest.x + dx, y: dest.y + dy }));
    const openN = nbrs.filter(open);
    const safe = openN.filter((p) => terrain(p) !== 'ENVIRONMENTAL_HAZARD' && !hostiles.some((h) => manhattan(p, h) <= 1));
    const d0 = nearestHostile(dest);
    const gain = d0 === null || openN.length === 0 ? 0 : Math.max(...openN.map((p) => nearestHostile(p))) - d0;
    return [openN.length, safe.length, gain, nbrs.filter(inBounds).length, terrain(dest) === 'ENVIRONMENTAL_HAZARD' ? 1 : 0, openN.filter((p) => terrain(p) !== 'ENVIRONMENTAL_HAZARD').length];
  });
}

export const OBSERVABLE_OPTION_FEATURES_SCHEMA = deepFreeze({ schemaId: OBSERVABLE_OPTION_FEATURES_ID, schemaVersion: 1, columns: OBS_OPTION_COLUMNS, excluded: EXCLUDED,
  inputs: ['SENTINEL_OBSERVABLE_ENTITY_STATE_V1', 'SENTINEL_FORGE_VISIBLE_MAP_V1', 'ACTION_SEMANTICS_V1'], access: 'DEPLOYABLE', epistemicClass: 'E1' });
export const OBSERVABLE_OPTION_FEATURES_SCHEMA_HASH = sha256(OBSERVABLE_OPTION_FEATURES_SCHEMA);
