/* STAGE_3F_6_P_1A_SYM — per-candidate evidence for one stored corpus row.
 *
 * Rebuilds the row's world from its combination (world hash must match), presents the same symmetric surface
 * Stage 3F.6-P.1D presented, and derives for every distinct zero-cost candidate:
 *   dep     deployable fields, from { observation, legalActions } ONLY (deriveDeployableCandidates)
 *   priv    privileged relations from kernel positions (diagnostic, UNAVAILABLE at decision time)
 *   abs / canon / hidden   absolute, canonical-frame and base-frame (hidden orientation) direction one-hots (controls)
 *   i       one-step immediate scalar of the simulated successor (diagnostic, FUTURE_STATE_REQUIRED)
 * plus, on the stored equivariance sample, the deployable fields of every D4 twin mapped back to the base
 * candidates, a candidate-order/identity permutation replay, and RESOURCE re-run with reversed identities.
 * Deterministic; writes nothing.
 */
import { hashWorld } from '../src/forge/kernel.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { INVERSE_ORIENTATION, TRANSFORM_EQUIVALENT, canonicalActionKey, canonicalOrientation, orientAction, orientWorld } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { DECLARED_ACTION_COST_MODEL, proposeAll } from '../src/stage3f/deployable-action-proposal-v1.js';
import { deriveDeployableCandidates, directionOneHot, privilegedRelations } from '../src/stage3f/free-action-sufficiency-v1.js';
import { policySurface } from './generate-stage3f6p1e-policy-evidence.mjs';

const K16 = (k) => k.slice(0, 16);
export const TWIN_TRANSFORMS = Object.freeze(['ROTATE_90', 'ROTATE_180', 'ROTATE_270', 'REFLECT_X', 'REFLECT_Y']);
const observe = (world) => forgeWorldAdapter.observe(forgeAdapterState(world), FORGE_OBSERVER_ID);
const decisionInput = (world) => ({ observation: observe(world), legalActions: policySurface(world).map((e) => ({ actionId: e.actionId, actionType: e.actionType, parameters: e.action.parameters ?? {}, action: e.action })) });
const flat = (d) => [...d.TYPE, ...d.CANDIDATE, ...d.GEOMETRY];

export const rebuildWorld = (row) => runCalibratedWarmup(row.combination.seed, (warmupTicks) => generateScenarioSymmetricV1({ ...row.combination, warmupTicks })).world;
export const isEligible = (row) => Object.values(row.actions).some((a) => a.c === 0 && a.o === 1);

export function candidateEvidence(row, { twins = row.equivariance !== null } = {}) {
  const world = rebuildWorld(row);
  const size = world.grid.width;
  const input = decisionInput(world);
  const dep = deriveDeployableCandidates(input, (a) => K16(a.actionId));
  const byKey = new Map(); for (const a of input.legalActions) if (!byKey.has(K16(a.actionId))) byKey.set(K16(a.actionId), a);
  const keys = [...dep.keys()].sort();
  const storedZero = Object.entries(row.actions).filter(([, a]) => a.c === 0).map(([k]) => k).sort();
  const priv = privilegedRelations(world, keys.map((k) => [k, byKey.get(k).action]));
  const frame = canonicalOrientation(world).orientation;
  const baseFrame = INVERSE_ORIENTATION[row.orientation];
  const dirOf = (action, orientation) => {
    if (action.actionType === 'MOVE') return orientAction(orientation, action, size).parameters.direction;
    return null;
  };
  const maxR = Math.max(...Object.values(row.actions).map((a) => a.r));
  const candidates = keys.map((k) => {
    const a = byKey.get(k).action; const s = row.actions[k];
    return { key: k, type: a.actionType, dir: a.parameters?.direction ?? null, dep: flat(dep.get(k)), blocks: dep.get(k), priv: priv.get(k), abs: directionOneHot(a.parameters?.direction ?? null),
      canon: directionOneHot(dirOf(a, frame)), hidden: directionOneHot(dirOf(a, baseFrame)), i: s.i, o: s.o, r: s.r, maxR };
  });

  /* identity/order permutation: the same inputs with identities replaced and the list reversed */
  const permutedInput = { observation: input.observation, legalActions: [...input.legalActions].reverse().map((a, idx) => ({ ...a, actionId: `perm-${idx}`, orig: K16(a.actionId) })) };
  const permuted = deriveDeployableCandidates(permutedInput, (a) => a.orig);
  const idPermutationInvariant = keys.every((k) => JSON.stringify(flat(permuted.get(k))) === JSON.stringify(flat(dep.get(k)))) ? 1 : 0;

  /* RESOURCE with identities reversed (its only tie-break), mapped back */
  const legal = input.legalActions.map((a) => ({ actionId: a.actionId, actionType: a.actionType, targetEntityId: a.action.target?.id ?? null }));
  const order = legal.map((e, i) => i).sort((x, y) => (legal[x].actionId < legal[y].actionId ? -1 : 1));
  const alias = new Array(legal.length); order.forEach((i, rank) => { alias[i] = `a${String(legal.length - 1 - rank).padStart(5, '0')}`; });
  const back = new Map(legal.map((e, i) => [alias[i], K16(e.actionId)]));
  const res = proposeAll({ observation: input.observation, legalActions: legal.map((e, i) => ({ ...e, actionId: alias[i] })) }).find((p) => p.producerId === 'RESOURCE_PRESERVING_V1');
  const resourceIdReversed = res.action === null ? null : back.get(res.action.actionId);

  let twinFeatures = null;
  if (twins) {
    twinFeatures = {};
    for (const transform of TWIN_TRANSFORMS) {
      const orientation = TRANSFORM_EQUIVALENT[transform];
      const twin = orientWorld(orientation, world);
      const tInput = decisionInput(twin);
      const mapBack = (a) => K16(canonicalActionKey('R0', orientAction(INVERSE_ORIENTATION[orientation], a.action, size), size));
      const tDep = deriveDeployableCandidates(tInput, mapBack);
      twinFeatures[transform] = Object.fromEntries(keys.map((k) => [k, tDep.has(k) ? flat(tDep.get(k)) : null]));
    }
  }
  return {
    recordHash: row.recordHash, worldFidelity: hashWorld(world) === row.worldHash ? 1 : 0,
    candidateSetFidelity: JSON.stringify(keys) === JSON.stringify(storedZero) ? 1 : 0,
    candidates, idPermutationInvariant, resourceIdReversed, twinFeatures,
    zeroCostTypesOnSurface: [...new Set(input.legalActions.filter((a) => DECLARED_ACTION_COST_MODEL.cost[a.actionType] === 0).map((a) => a.actionType))].sort(),
  };
}
