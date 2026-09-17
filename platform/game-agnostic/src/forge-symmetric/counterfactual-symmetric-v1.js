import { deepFreeze, sha256 } from '../core/determinism.js';
import { cloneWorld, isTerminal } from '../forge/kernel.js';
import { CONTINUATION_POLICIES } from '../forge/counterfactual-v2.js';
import { addRewardV2Vectors, emptyRewardV2Vector, rewardV2For, scalarizeRewardV2 } from '../forge/reward-v2.js';
import { canonicalActionKey, canonicalOrientation } from './orientation-symmetric-v1.js';
import { symmetricLegalActions, symmetricStep } from './action-surface-symmetric-v1.js';

/* ===========================================================================
 * STAGE_3F_6_P_1C — FORGE_COUNTERFACTUAL_SYMMETRIC_V1 and FORGE_GREEDY_SAFE_SYMMETRIC_V1
 *
 * The Stage 3B oracle's semantics, with one repair: ties are no longer broken by a world-independent action
 * hash. Historical `counterfactual-v2` breaks continuation ties by `forgeActionKey`, whose MOVE order is the
 * same in every world (EAST < SOUTH < WEST < NORTH), so a rotated world could roll forward differently and
 * receive a different optimal set. Here every tie — in the rollout, in the optimal representative and in the
 * label's greedy choice — is broken by the action's identity IN THE CANONICAL FRAME of the ROOT world, which
 * is the same frame for a world and for any of its dihedral images.
 *
 * Unchanged: the reward (FORGE_REWARD_V2), the continuation policy family, the kernel's transitions, and the
 * meaning of the optimal set and of GREEDY_SAFE. Historical counterfactual-v2 is imported, never modified,
 * and still reproduces every historical record.
 * ========================================================================= */

export const FORGE_COUNTERFACTUAL_SYMMETRIC_ID = 'FORGE_COUNTERFACTUAL_SYMMETRIC_V1';
export const FORGE_GREEDY_SAFE_SYMMETRIC_ID = 'FORGE_GREEDY_SAFE_SYMMETRIC_V1';
export const FORGE_SYMMETRIC_CONTINUATION_POLICY = 'GREEDY_CONTINUATION_V1';

function transition(world, action) {
  const outcome = symmetricStep(world, action);
  const vector = rewardV2For({ before: world, after: outcome.state, v1Vector: outcome.rewardVector, events: outcome.events, terminal: outcome.terminal, outcome: outcome.outcome });
  return { state: outcome.state, vector, scalar: scalarizeRewardV2(vector), terminal: outcome.terminal, outcome: outcome.outcome };
}

/** Evaluate every legal action of the symmetric surface over the horizon, with canonical-frame tie-breaks. */
export function evaluateCounterfactualsSymmetricV1(world, { horizon = 4, policyId = FORGE_SYMMETRIC_CONTINUATION_POLICY } = {}) {
  const policy = CONTINUATION_POLICIES[policyId];
  if (policy === undefined) throw new Error(`Unknown continuation policy: ${policyId}`);
  const canonical = canonicalOrientation(world);
  const frame = canonical.orientation;
  const size = world.grid.width;
  const tieKey = (action) => canonicalActionKey(frame, action, size);

  const continuation = (current) => {
    let best = null;
    for (const action of symmetricLegalActions(current, frame)) {
      const result = transition(current, action);
      const rank = policy.rank({ scalar: result.scalar, vector: result.vector });
      const key = tieKey(action);
      if (best === null || rank > best.rank || (rank === best.rank && key < best.key)) best = { action, rank, key };
    }
    return best === null ? null : best.action;
  };

  const branches = [];
  for (const action of symmetricLegalActions(world, frame)) {
    const immediate = transition(cloneWorld(world), action);
    let current = immediate.state;
    let accumulated = emptyRewardV2Vector();
    let depth = 0;
    for (; depth < horizon; depth += 1) {
      if (isTerminal(current)) break;
      const next = continuation(current);
      if (next === null) break;
      const result = transition(current, next);
      accumulated = addRewardV2Vectors(accumulated, result.vector);
      current = result.state;
    }
    const totalVector = addRewardV2Vectors(immediate.vector, accumulated);
    branches.push({ actionKey: canonicalActionKey('R0', action, size), canonicalKey: tieKey(action), action,
      actionType: action.actionType, immediateScalar: immediate.scalar, totalScalar: scalarizeRewardV2(totalVector),
      terminal: immediate.terminal, horizonDepth: depth });
  }
  branches.sort((a, b) => (a.canonicalKey < b.canonicalKey ? -1 : a.canonicalKey > b.canonicalKey ? 1 : 0));
  const optimalScalar = branches.length === 0 ? null : Math.max(...branches.map((b) => b.totalScalar));
  const optimal = branches.filter((b) => b.totalScalar === optimalScalar);
  for (const branch of branches) branch.regret = optimalScalar === null ? null : optimalScalar - branch.totalScalar;
  return deepFreeze({
    oracleId: FORGE_COUNTERFACTUAL_SYMMETRIC_ID, continuationPolicy: policyId, horizon,
    canonicalFrame: frame, canonicalFrameDigestTied: canonical.tied,
    branchCount: branches.length, branches,
    optimalScalar, optimalActionKeys: optimal.map((b) => b.actionKey).sort(),
    optimalActionKey: optimal.length === 0 ? null : optimal[0].actionKey,
    exactTie: optimal.length > 1, tieCount: optimal.length,
    utilitySpread: branches.length === 0 ? 0 : optimalScalar - Math.min(...branches.map((b) => b.totalScalar)),
  });
}

/**
 * FORGE_GREEDY_SAFE_SYMMETRIC_V1: the historical label's meaning — is the best-immediate action a member of
 * the horizon-optimal set — computed under the symmetric oracle with canonical-frame tie-breaks.
 */
export function greedySafeSymmetricV1(world, { horizon = 4 } = {}) {
  const deep = evaluateCounterfactualsSymmetricV1(world, { horizon });
  const shallow = evaluateCounterfactualsSymmetricV1(world, { horizon: 0 });
  if (deep.branchCount === 0) return deepFreeze({ labelId: FORGE_GREEDY_SAFE_SYMMETRIC_ID, measurable: false, greedySafe: null, greedyRegret: null, horizonClass: 'HORIZON_ALIGNED' });
  const bestImmediate = Math.max(...deep.branches.map((b) => b.immediateScalar));
  const greedy = deep.branches.filter((b) => b.immediateScalar === bestImmediate)
    .sort((a, b) => (a.canonicalKey < b.canonicalKey ? -1 : 1))[0];
  const shallowOptima = shallow.branches.filter((b) => b.totalScalar === shallow.optimalScalar)
    .sort((a, b) => (a.canonicalKey < b.canonicalKey ? -1 : 1));
  const horizonOptima = new Set(deep.optimalActionKeys);
  const overlap = shallowOptima.some((b) => horizonOptima.has(b.actionKey));
  const bestImmediateBranch = deep.branches.find((b) => b.actionKey === shallowOptima[0].actionKey);
  return deepFreeze({
    labelId: FORGE_GREEDY_SAFE_SYMMETRIC_ID, measurable: true,
    greedyActionKey: greedy.actionKey, greedySafe: greedy.regret === 0 ? 1 : 0, greedyRegret: bestImmediateBranch === undefined ? null : bestImmediateBranch.regret,
    horizonClass: overlap ? 'HORIZON_ALIGNED' : 'HORIZON_DEPENDENT',
    optimalActionKeys: deep.optimalActionKeys, optimalSetSize: deep.tieCount, canonicalFrame: deep.canonicalFrame,
  });
}

export const FORGE_COUNTERFACTUAL_SYMMETRIC_CONTRACT = deepFreeze({
  oracleId: FORGE_COUNTERFACTUAL_SYMMETRIC_ID,
  labelId: FORGE_GREEDY_SAFE_SYMMETRIC_ID,
  basedOn: 'counterfactual-v2 semantics (imported, unmodified) with FORGE_REWARD_V2 and GREEDY_CONTINUATION_V1',
  repaired: ['continuation tie-break', 'optimal representative', 'label greedy tie-break'],
  tieBreak: 'action identity in the canonical frame of the ROOT world, held fixed through the rollout',
  actionIdentity: 'unchanged frozen forgeActionKey; identity and tie-break order are separate concerns',
  surface: 'FORGE_ACTION_SURFACE_SYMMETRIC_V1 (equivariant RETREAT)',
  historicalOracleModified: false,
});
export const FORGE_COUNTERFACTUAL_SYMMETRIC_CONTRACT_HASH = sha256(FORGE_COUNTERFACTUAL_SYMMETRIC_CONTRACT);
