import { deepFreeze, sha256 } from '../core/determinism.js';
import { cloneWorld, forgeActionKey } from '../forge/kernel.js';

/* ===========================================================================
 * STAGE_3F_6_P_1B — FORGE_SYMMETRY_TRANSFORM_V1 (DIAGNOSTIC ONLY; never a runtime or policy input)
 *
 * Maps a valid Forge world, and actions on it, through a rigid symmetry of its grid so the benchmark
 * can be asked: would the same decision, rotated or reflected, keep its optimal-action semantics?
 * It is additive. It does not modify the kernel, any scenario generator, any corpus or any record.
 *
 * Mapped (spatial):   grid width/height/cells, every entity position, hazard positions, positional
 *                     events (MOVED/RETREATED `to`), MOVE direction, RETREAT destination.
 * Not mapped:         entity ids, types, values, health, flags, resources, relations, objectives,
 *                     constraints, channels, history, tick. None of these is spatial in Forge; each is
 *                     carried unchanged by explicit declaration, never silently.
 * Fail closed:        rotations require a square grid; an unknown positional field aborts the transform.
 *
 * Whether the kernel's DYNAMICS and the oracle's LABELS are equivariant under these maps is measured by
 * Stage 3F.6-P.1B, never assumed here (e.g. the kernel's RETREAT rule prefers the x axis).
 * ========================================================================= */

export const FORGE_SYMMETRY_TRANSFORM_ID = 'FORGE_SYMMETRY_TRANSFORM_V1';
export const DIRECTION_DELTAS = deepFreeze({ NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] });

/* Screen coordinates, y grows downward. S = side of a square grid; W, H = width, height. */
export const SYMMETRY_TRANSFORMS = deepFreeze({
  IDENTITY: { requiresSquare: false, swapsAxes: false, cell: '(x, y)', delta: '(dx, dy)' },
  ROTATE_90: { requiresSquare: true, swapsAxes: true, cell: '(S-1-y, x)', delta: '(-dy, dx)' },
  ROTATE_180: { requiresSquare: false, swapsAxes: false, cell: '(W-1-x, H-1-y)', delta: '(-dx, -dy)' },
  ROTATE_270: { requiresSquare: true, swapsAxes: true, cell: '(y, S-1-x)', delta: '(dy, -dx)' },
  REFLECT_X: { requiresSquare: false, swapsAxes: false, cell: '(W-1-x, y)', delta: '(-dx, dy)' },
  REFLECT_Y: { requiresSquare: false, swapsAxes: false, cell: '(x, H-1-y)', delta: '(dx, -dy)' },
});
export const SYMMETRY_TRANSFORM_IDS = deepFreeze(Object.keys(SYMMETRY_TRANSFORMS));
export const INVERSE_TRANSFORM = deepFreeze({ IDENTITY: 'IDENTITY', ROTATE_90: 'ROTATE_270', ROTATE_180: 'ROTATE_180', ROTATE_270: 'ROTATE_90', REFLECT_X: 'REFLECT_X', REFLECT_Y: 'REFLECT_Y' });

const CELL = {
  IDENTITY: (x, y) => [x, y],
  ROTATE_90: (x, y, W) => [W - 1 - y, x],
  ROTATE_180: (x, y, W, H) => [W - 1 - x, H - 1 - y],
  ROTATE_270: (x, y, W) => [y, W - 1 - x],
  REFLECT_X: (x, y, W) => [W - 1 - x, y],
  REFLECT_Y: (x, y, W, H) => [x, H - 1 - y],
};
const DELTA = {
  IDENTITY: (dx, dy) => [dx, dy],
  ROTATE_90: (dx, dy) => [-dy, dx],
  ROTATE_180: (dx, dy) => [-dx, -dy],
  ROTATE_270: (dx, dy) => [dy, -dx],
  REFLECT_X: (dx, dy) => [-dx, dy],
  REFLECT_Y: (dx, dy) => [dx, -dy],
};

export class SymmetryTransformError extends Error {}

export const FORGE_SYMMETRY_TRANSFORM_CONTRACT = deepFreeze({
  transformId: FORGE_SYMMETRY_TRANSFORM_ID,
  diagnosticOnly: true,
  deployable: false,
  transforms: SYMMETRY_TRANSFORMS,
  mapped: ['grid.width', 'grid.height', 'grid.cells', 'entities[].position', 'hazards[].position', 'events[].to (MOVED, RETREATED)',
    'MOVE parameters.direction', 'RETREAT parameters.toX/toY'],
  carriedUnchanged: ['entity id/type/value/health/available/flags/resources/faction/risk/cost', 'relations', 'objectives', 'constraints', 'channels',
    'history', 'tick', 'maxTicks', 'targeted-action target ids', 'BYPASS dependent id'],
  failClosed: ['rotation of a non-square grid', 'hazard or event carrying an unrecognised positional field'],
  notAssumed: 'kernel dynamics, legal-action rules and oracle labels are tested for equivariance, never assumed',
});
export const FORGE_SYMMETRY_TRANSFORM_CONTRACT_HASH = sha256(FORGE_SYMMETRY_TRANSFORM_CONTRACT);

function spec(transformId) {
  if (!SYMMETRY_TRANSFORM_IDS.includes(transformId)) throw new SymmetryTransformError(`unknown transform ${transformId}`);
  return SYMMETRY_TRANSFORMS[transformId];
}

export function transformCell(transformId, { x, y }, { width, height }) {
  const s = spec(transformId);
  if (s.requiresSquare && width !== height) throw new SymmetryTransformError('rotation requires a square grid');
  const [nx, ny] = CELL[transformId](x, y, width, height);
  return { x: nx, y: ny };
}

export function transformDirection(transformId, direction) {
  spec(transformId);
  const delta = DIRECTION_DELTAS[direction];
  if (delta === undefined) throw new SymmetryTransformError(`unknown direction ${direction}`);
  const [dx, dy] = DELTA[transformId](delta[0], delta[1]);
  return Object.keys(DIRECTION_DELTAS).find((name) => DIRECTION_DELTAS[name][0] === dx && DIRECTION_DELTAS[name][1] === dy);
}

/** T(W): a new world; the input is never mutated. */
export function transformWorld(transformId, world) {
  const s = spec(transformId);
  const { width, height } = world.grid;
  if (s.requiresSquare && width !== height) throw new SymmetryTransformError('rotation requires a square grid');
  const next = cloneWorld(world);
  const nw = s.swapsAxes ? height : width; const nh = s.swapsAxes ? width : height;
  const cells = new Array(nw * nh);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = transformCell(transformId, { x, y }, { width, height });
      cells[t.y * nw + t.x] = world.grid.cells[y * width + x];
    }
  }
  next.grid = { ...next.grid, width: nw, height: nh, cells };
  for (const entity of next.entities) entity.position = transformCell(transformId, entity.position, { width, height });
  next.hazards = (next.hazards ?? []).map((hazard) => {
    const keys = Object.keys(hazard);
    if (keys.some((k) => ['x', 'y', 'cells', 'area'].includes(k))) throw new SymmetryTransformError('hazard carries an unrecognised positional field');
    return hazard.position ? { ...hazard, position: transformCell(transformId, hazard.position, { width, height }) } : hazard;
  });
  next.events = (next.events ?? []).map((event) => {
    if (event.to && typeof event.to === 'object') return { ...event, to: transformCell(transformId, event.to, { width, height }) };
    if ('x' in event || 'y' in event || 'position' in event) throw new SymmetryTransformError('event carries an unrecognised positional field');
    return event;
  });
  return next;
}

/** T(a) for an action descriptor valid in W; `dims` are W's grid dimensions. */
export function transformAction(transformId, action, dims) {
  spec(transformId);
  if (action.actionType === 'MOVE') return { ...action, parameters: { ...action.parameters, direction: transformDirection(transformId, action.parameters.direction) } };
  if (action.actionType === 'RETREAT') {
    const t = transformCell(transformId, { x: action.parameters.toX, y: action.parameters.toY }, dims);
    return { ...action, parameters: { ...action.parameters, toX: t.x, toY: t.y } };
  }
  return action;
}

export const transformedActionKey = (transformId, action, dims) => forgeActionKey(transformAction(transformId, action, dims));
