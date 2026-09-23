/* STAGE_3F_6_P_1_SYM — per-row Nexus evidence (in-process; nothing is written).
 *
 * For one stored corpus row: the unmodified policies' choices, confidence and reasons, identity-relabelled and D4-twin
 * re-runs (the certified Stage 3F.6-P.1E evidence builder, reused unchanged), a candidate-order shuffle re-run, and
 * per-candidate DEPLOYABLE and PRIVILEGED (diagnostic) blocks over every legal action. On the equivariance sample the
 * candidate blocks are recomputed on each D4 twin and compared.
 */
import { hashWorld } from '../src/forge/kernel.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { INVERSE_ORIENTATION, TRANSFORM_EQUIVALENT, canonicalActionKey, orientAction, orientWorld } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { seededUniform } from '../src/stage3f/policy-requalification-v1.js';
import { deployableCandidateBlocks, privilegedCandidateBlocks } from '../src/stage3f/nexus-requalification-v1.js';
import { decideAll, evidenceFor, policySurface } from './generate-stage3f6p1e-policy-evidence.mjs';
import { rebuildWorld } from './stage3f6p1asym-evidence.mjs';

const K16 = (k) => k.slice(0, 16);
export const TWIN_TRANSFORMS = Object.freeze(['ROTATE_90', 'ROTATE_180', 'ROTATE_270', 'REFLECT_X', 'REFLECT_Y']);
export const NEXUS_POLICIES = Object.freeze(['NEXUS_SELECTOR_V1', 'NEXUS_SELECTOR_V2_CANDIDATE']);
const observe = (world) => forgeWorldAdapter.observe(forgeAdapterState(world), FORGE_OBSERVER_ID);
const legalOf = (surface) => surface.map((e) => ({ actionId: e.actionId, actionType: e.actionType, targetEntityId: e.targetEntityId, parameters: e.action.parameters ?? {}, action: e.action }));

function candidateBlocks(world, key) {
  const surface = policySurface(world);
  const observation = observe(world);
  const reason = decideAll(observation, surface).NEXUS_SELECTOR_V1.why;
  const legal = legalOf(surface);
  const dep = deployableCandidateBlocks({ observation, legalActions: legal }, key, reason);
  const byKey = new Map(); for (const a of legal) if (!byKey.has(key(a))) byKey.set(key(a), a);
  const priv = privilegedCandidateBlocks(world, [...byKey].map(([k, a]) => [k, a.action]));
  return { dep, priv, byKey, reason };
}

export function nexusEvidence(row) {
  const base = evidenceFor(row);
  const world = rebuildWorld(row);
  const size = world.grid.width;
  const { dep, priv, byKey, reason } = candidateBlocks(world, (a) => K16(a.actionId));
  const keys = [...dep.keys()].sort();
  const candidates = keys.map((k) => { const a = byKey.get(k); const s = row.actions[k];
    return { key: k, t: a.actionType, target: a.targetEntityId ?? null, dir: a.parameters?.direction ?? null, dep: dep.get(k), priv: priv.get(k), i: s.i, o: s.o, r: s.r }; });

  /* candidate-order shuffle: identical inputs, surface order permuted (seeded by the record) */
  const surface = policySurface(world); const next = seededUniform(`STAGE3F6P1SYM:SHUFFLE:${row.recordHash}`);
  const shuffled = [...surface]; for (let i = shuffled.length - 1; i > 0; i -= 1) { const j = Math.floor(next() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const sd = decideAll(observe(world), shuffled);
  const shuffleChoices = Object.fromEntries(NEXUS_POLICIES.map((p) => [p, sd[p].id === null ? null : K16(sd[p].id)]));

  /* feature equivariance on D4 twins (equivariance sample only) */
  let twinFeatures = null;
  if (row.equivariance !== null) {
    twinFeatures = {};
    for (const transform of TWIN_TRANSFORMS) {
      const orientation = TRANSFORM_EQUIVALENT[transform];
      const twin = orientWorld(orientation, world);
      const mapBack = (a) => K16(canonicalActionKey('R0', orientAction(INVERSE_ORIENTATION[orientation], a.action, size), size));
      const t = candidateBlocks(twin, mapBack);
      twinFeatures[transform] = { reasonSame: t.reason === reason ? 1 : 0,
        depEqual: keys.every((k) => t.dep.has(k) && JSON.stringify(t.dep.get(k)) === JSON.stringify(dep.get(k))) ? 1 : 0,
        privEqual: keys.every((k) => t.priv.has(k) && JSON.stringify(t.priv.get(k)) === JSON.stringify(priv.get(k))) ? 1 : 0 };
    }
  }
  return { recordHash: row.recordHash, fidelity: { ...base.fidelity, candidateSet: JSON.stringify(keys) === JSON.stringify(Object.keys(row.actions).sort()) ? 1 : 0,
    world: hashWorld(world) === row.worldHash ? 1 : 0 },
  nexusReason: reason, policies: base.policies, idReversed: base.idReversed, idPermuted: base.idPermuted, twins: base.twins, shuffleChoices, twinFeatures, candidates };
}
