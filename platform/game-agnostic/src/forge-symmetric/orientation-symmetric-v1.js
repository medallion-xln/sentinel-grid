import { deepFreeze, sha256 } from '../core/determinism.js';
import { cloneWorld, forgeActionKey } from '../forge/kernel.js';

/* ===========================================================================
 * STAGE_3F_6_P_1C — FORGE_ORIENTATION_SYMMETRIC_V1
 *
 * The dihedral group D4 of a square Forge grid, as explicit deterministic maps, plus the CANONICAL FRAME
 * used by the symmetric benchmark to break ties without preferring a cardinal direction.
 *
 * Why the group must be complete: the canonical frame is the group element minimising a geometry digest.
 * For an orientation T, canonical(T(W)) o T = canonical(W) holds only when T is IN the group, so all eight
 * elements are present — four rotations, two axis reflections, two diagonal reflections.
 *
 * Forge V1 is untouched. This module adds geometry; it changes nothing historical. The certified
 * FORGE_SYMMETRY_TRANSFORM_V1 remains the independent gate, and the tests prove these maps agree with it.
 * ========================================================================= */

export const FORGE_ORIENTATION_SYMMETRIC_ID = 'FORGE_ORIENTATION_SYMMETRIC_V1';

/* Screen coordinates, y grows downward; S is the side of a square grid. */
const CELL = {
  R0: (x, y) => [x, y],
  R90: (x, y, S) => [S - 1 - y, x],
  R180: (x, y, S) => [S - 1 - x, S - 1 - y],
  R270: (x, y, S) => [y, S - 1 - x],
  MX: (x, y, S) => [S - 1 - x, y],
  MY: (x, y, S) => [x, S - 1 - y],
  MD: (x, y) => [y, x],
  MA: (x, y, S) => [S - 1 - y, S - 1 - x],
};
const DELTA = {
  R0: (dx, dy) => [dx, dy],
  R90: (dx, dy) => [-dy, dx],
  R180: (dx, dy) => [-dx, -dy],
  R270: (dx, dy) => [dy, -dx],
  MX: (dx, dy) => [-dx, dy],
  MY: (dx, dy) => [dx, -dy],
  MD: (dx, dy) => [dy, dx],
  MA: (dx, dy) => [-dy, -dx],
};
export const ORIENTATIONS = deepFreeze(Object.keys(CELL));
export const DIRECTION_DELTAS = deepFreeze({ NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] });
/** Equivalents of the certified FORGE_SYMMETRY_TRANSFORM_V1 ids, so the gate and the benchmark share one geometry. */
export const TRANSFORM_EQUIVALENT = deepFreeze({ IDENTITY: 'R0', ROTATE_90: 'R90', ROTATE_180: 'R180', ROTATE_270: 'R270', REFLECT_X: 'MX', REFLECT_Y: 'MY' });
export const INVERSE_ORIENTATION = deepFreeze({ R0: 'R0', R90: 'R270', R180: 'R180', R270: 'R90', MX: 'MX', MY: 'MY', MD: 'MD', MA: 'MA' });

export class OrientationError extends Error {}

const assertSquare = (grid) => { if (grid.width !== grid.height) throw new OrientationError('symmetric Forge requires a square grid'); };
const check = (orientation) => { if (!ORIENTATIONS.includes(orientation)) throw new OrientationError(`unknown orientation ${orientation}`); };

export function orientCell(orientation, { x, y }, size) { check(orientation); const [nx, ny] = CELL[orientation](x, y, size); return { x: nx, y: ny }; }
export function orientDirection(orientation, direction) {
  check(orientation);
  const delta = DIRECTION_DELTAS[direction];
  if (delta === undefined) throw new OrientationError(`unknown direction ${direction}`);
  const [dx, dy] = DELTA[orientation](delta[0], delta[1]);
  return Object.keys(DIRECTION_DELTAS).find((name) => DIRECTION_DELTAS[name][0] === dx && DIRECTION_DELTAS[name][1] === dy);
}

/** Orient a scenario configuration (pre-world): grid cells and entity positions only. */
export function orientScenarioConfig(orientation, config) {
  check(orientation); assertSquare(config.grid);
  const size = config.grid.width;
  const cells = new Array(size * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) { const c = orientCell(orientation, { x, y }, size); cells[c.y * size + c.x] = config.grid.cells[y * size + x]; }
  return {
    ...config,
    grid: { ...config.grid, cells },
    entities: config.entities.map((entity) => ({ ...entity, position: orientCell(orientation, entity.position, size) })),
    hazards: (config.hazards ?? []).map((hazard) => (hazard.position ? { ...hazard, position: orientCell(orientation, hazard.position, size) } : hazard)),
  };
}

/** Orient a built world. The input is never mutated. */
export function orientWorld(orientation, world) {
  check(orientation); assertSquare(world.grid);
  const size = world.grid.width;
  const next = cloneWorld(world);
  const cells = new Array(size * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) { const c = orientCell(orientation, { x, y }, size); cells[c.y * size + c.x] = world.grid.cells[y * size + x]; }
  next.grid = { ...next.grid, cells };
  for (const entity of next.entities) entity.position = orientCell(orientation, entity.position, size);
  next.hazards = (next.hazards ?? []).map((h) => (h.position ? { ...h, position: orientCell(orientation, h.position, size) } : h));
  next.events = (next.events ?? []).map((e) => (e.to && typeof e.to === 'object' ? { ...e, to: orientCell(orientation, e.to, size) } : e));
  return next;
}

export function orientAction(orientation, action, size) {
  check(orientation);
  if (action.actionType === 'MOVE') return { ...action, parameters: { ...action.parameters, direction: orientDirection(orientation, action.parameters.direction) } };
  if (action.actionType === 'RETREAT') { const c = orientCell(orientation, { x: action.parameters.toX, y: action.parameters.toY }, size); return { ...action, parameters: { ...action.parameters, toX: c.x, toY: c.y } }; }
  return action;
}

/** Geometry digest: everything the orientation can move, and nothing it cannot. */
export function geometryDigest(world) {
  return sha256({
    size: world.grid.width, cells: world.grid.cells,
    entities: [...world.entities].sort((a, b) => (a.id < b.id ? -1 : 1)).map((e) => `${e.id}@${e.position.x},${e.position.y}`),
  });
}

/**
 * The canonical frame: the orientation whose image has the smallest geometry digest.
 *
 * canonicalOrientation(T(W)) composed with T equals canonicalOrientation(W) for every T in D4, so any tie-break
 * computed in this frame is identical for a world and for its transformed twin. Digest ties (a world with an exact
 * dihedral self-symmetry) are resolved by the declared orientation order and are reported, never hidden.
 */
export function canonicalOrientation(world) {
  assertSquare(world.grid);
  let best = null;
  for (const orientation of ORIENTATIONS) {
    const digest = geometryDigest(orientWorld(orientation, world));
    if (best === null || digest < best.digest) best = { orientation, digest, tied: false };
    else if (digest === best.digest) best.tied = true;
  }
  return best;
}

/** An action's identity IN the canonical frame: stable under any orientation of the same world. */
export function canonicalActionKey(orientation, action, size) { return forgeActionKey(orientAction(orientation, action, size)); }

export const FORGE_ORIENTATION_SYMMETRIC_CONTRACT = deepFreeze({
  contractId: FORGE_ORIENTATION_SYMMETRIC_ID,
  group: 'D4 (four rotations, two axis reflections, two diagonal reflections) over a square grid',
  orientations: ORIENTATIONS,
  canonicalFrame: 'the orientation minimising the geometry digest; equivariant because the group is closed',
  tieBreakPrinciple: 'ACTION_IDENTITY != DECISION_TIE_BREAK_ORDER: identities stay the frozen forgeActionKey; ties are broken by the identity in the canonical frame',
  declaredException: 'a world with an exact dihedral self-symmetry has a digest tie; the declared orientation order resolves it and the incidence is reported',
  historicalForgeModified: false,
});
export const FORGE_ORIENTATION_SYMMETRIC_CONTRACT_HASH = sha256(FORGE_ORIENTATION_SYMMETRIC_CONTRACT);
