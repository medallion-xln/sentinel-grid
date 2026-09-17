import { deepFreeze, sha256 } from '../core/determinism.js';
import { forgeActionKey, legalActions, step } from '../forge/kernel.js';
import { canonicalActionKey, canonicalOrientation } from './orientation-symmetric-v1.js';

/* ===========================================================================
 * STAGE_3F_6_P_1C — FORGE_ACTION_SURFACE_SYMMETRIC_V1
 *
 * The legal action surface of the symmetric benchmark. It is the frozen kernel surface with ONE repair:
 *
 *   Historical RETREAT resolves its destination with a global x-before-y preference
 *   (kernel.js: "x + (dx !== 0 ? dx : 0), y + (dx !== 0 ? 0 : dy)"), which is not equivariant under
 *   90-degree rotations. Here RETREAT keeps its meaning — step away from the nearest live hostile — but
 *   its destination is the reachable neighbour that MAXIMISES distance from that hostile, with ties broken
 *   by action identity in the canonical frame. No axis is preferred.
 *
 * The kernel is not modified and cannot be: its checkLegality only accepts actions the kernel itself offers.
 * Every symmetric RETREAT therefore EXECUTES as the kernel MOVE onto the same cell, which is the identical
 * transition (same destination, same zero energy cost, same reward vector; the kernel's own RETREAT is a
 * duplicate of that MOVE in every respect except the event name). The benchmark verifies that the symmetric
 * surface reaches exactly the same set of successor states as the kernel surface.
 * ========================================================================= */

export const FORGE_ACTION_SURFACE_SYMMETRIC_ID = 'FORGE_ACTION_SURFACE_SYMMETRIC_V1';
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

export class SymmetricSurfaceError extends Error {}

const actorOf = (world) => world.entities.find((e) => e.type === 'ACTOR' && e.faction === 'sentinel') ?? null;
const liveHostiles = (world) => world.entities.filter((e) => e.type === 'HOSTILE' && e.health > 0);

/** The nearest live hostile: smallest distance from the actor, ties by entity id (frame-independent). */
export function nearestHostile(world) {
  const actor = actorOf(world); if (actor === null) return null;
  const hostiles = liveHostiles(world); if (hostiles.length === 0) return null;
  return [...hostiles].sort((a, b) => manhattan(actor.position, a.position) - manhattan(actor.position, b.position) || (a.id < b.id ? -1 : 1))[0];
}

/**
 * The symmetric surface: kernel actions with the kernel's axis-ordered RETREAT replaced by an equivariant one.
 * `frame` is the canonical orientation of the world (computed once and passed in by the oracle).
 */
export function symmetricLegalActions(world, frame = canonicalOrientation(world)?.orientation ?? 'R0') {
  const kernel = legalActions(world);
  const size = world.grid.width;
  const actions = kernel.filter((a) => a.actionType !== 'RETREAT');
  const hostile = nearestHostile(world);
  if (hostile !== null) {
    const moves = kernel.filter((a) => a.actionType === 'MOVE');
    const scored = moves.map((move) => {
      const actor = actorOf(world);
      const delta = { NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] }[move.parameters.direction];
      const destination = { x: actor.position.x + delta[0], y: actor.position.y + delta[1] };
      return { destination, distance: manhattan(destination, hostile.position), key: canonicalActionKey(frame, move, size) };
    });
    if (scored.length > 0) {
      const furthest = Math.max(...scored.map((s) => s.distance));
      const chosen = scored.filter((s) => s.distance === furthest).sort(byKey)[0];
      actions.push({ actionId: 'forge/retreat', actionType: 'RETREAT', actorId: actorOf(world).id, target: null,
        parameters: { toX: chosen.destination.x, toY: chosen.destination.y } });
    }
  }
  return actions.sort((a, b) => { const ka = forgeActionKey(a); const kb = forgeActionKey(b); return ka < kb ? -1 : ka > kb ? 1 : 0; });
}

/** The kernel action that executes a symmetric action: RETREAT runs as the MOVE onto the same cell. */
export function toKernelAction(world, action) {
  if (action.actionType !== 'RETREAT') return action;
  const actor = actorOf(world);
  const move = legalActions(world).find((candidate) => {
    if (candidate.actionType !== 'MOVE') return false;
    const delta = { NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] }[candidate.parameters.direction];
    return actor.position.x + delta[0] === action.parameters.toX && actor.position.y + delta[1] === action.parameters.toY;
  });
  if (move === undefined) throw new SymmetricSurfaceError('symmetric RETREAT has no equivalent kernel MOVE');
  return move;
}

/** One transition under the symmetric surface, executed by the frozen kernel. */
export function symmetricStep(world, action) { return step(world, toKernelAction(world, action)); }

export const FORGE_ACTION_SURFACE_SYMMETRIC_CONTRACT = deepFreeze({
  contractId: FORGE_ACTION_SURFACE_SYMMETRIC_ID,
  basedOn: 'frozen kernel legalActions (unchanged)',
  repaired: ['RETREAT destination: furthest reachable neighbour from the nearest live hostile, canonical-frame tie-break, no axis preference'],
  unchanged: ['every other action type, its legality and its identity', 'kernel transitions, rewards and energy costs'],
  execution: 'symmetric RETREAT executes as the kernel MOVE onto the same cell (identical transition)',
  verified: 'successor-state set of the symmetric surface equals that of the kernel surface',
  historicalForgeModified: false,
});
export const FORGE_ACTION_SURFACE_SYMMETRIC_CONTRACT_HASH = sha256(FORGE_ACTION_SURFACE_SYMMETRIC_CONTRACT);
