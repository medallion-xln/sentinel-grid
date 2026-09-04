/* Sentinel Forge World — counterfactual oracle.
 *
 * The reason the simulator exists. For a state S it evaluates every legal action
 * exactly, by cloning and stepping, so utility(A), utility(B) and utility(C) all
 * come from the same starting state and can be compared without an estimator
 * standing between the world and the answer.
 *
 * Three properties are load-bearing, and each is measured rather than asserted:
 *
 *   1. The source state is unchanged by branching.
 *   2. Branches are isolated from each other.
 *   3. The order branches are evaluated in does not affect any result.
 *
 * No learned model may define these values. The roll-forward uses a NAMED,
 * deterministic continuation policy — greedy on immediate scalar reward, ties
 * broken by canonical action key — so the horizon value is a property of the
 * world and the declared policy, never of a model's opinion.
 */

import { sha256 } from '../core/determinism.js';
import {
  FORGE_REWARD_VERSION,
  addRewardVectors,
  emptyRewardVector,
  scalarizeReward,
} from './contract.js';
import { cloneWorld, forgeActionKey, hashWorld, isTerminal, legalActions, step } from './kernel.js';

export const FORGE_ORACLE_VERSION = 'forge-counterfactual-v1';
export const FORGE_CONTINUATION_POLICY = 'GREEDY_IMMEDIATE_SCALAR_TIEBREAK_ACTION_KEY_V1';
export const FORGE_DEFAULT_HORIZON = 3;

/**
 * The declared continuation policy. Deterministic and closed-form: it consults
 * only the simulator, never an expert and never a model.
 */
function continuationAction(world) {
  const actions = legalActions(world);
  if (actions.length === 0) return null;
  let best = null;
  for (const action of actions) {
    const outcome = step(world, action);
    const key = forgeActionKey(action);
    if (best === null || outcome.scalarReward > best.scalar
      || (outcome.scalarReward === best.scalar && key < best.key)) {
      best = { action, scalar: outcome.scalarReward, key };
    }
  }
  return best.action;
}

/** Roll a world forward under the continuation policy for at most `horizon` ticks. */
export function rollForward(world, horizon) {
  let current = world;
  let accumulated = emptyRewardVector();
  const trace = [];
  for (let depth = 0; depth < horizon; depth += 1) {
    if (isTerminal(current)) break;
    const action = continuationAction(current);
    if (action === null) break;
    const outcome = step(current, action);
    accumulated = addRewardVectors(accumulated, outcome.rewardVector);
    trace.push({ depth, actionType: action.actionType, actionKey: forgeActionKey(action), scalar: outcome.scalarReward });
    current = outcome.state;
  }
  return { state: current, rewardVector: accumulated, trace, depthReached: trace.length };
}

/**
 * Evaluate every legal action from one state.
 *
 * Returns the branches in canonical action-key order regardless of the order they
 * were computed in, and reports the isolation evidence alongside the results so a
 * caller cannot read the utilities without also being able to see whether the
 * branching was sound.
 */
export function evaluateCounterfactuals(world, { horizon = FORGE_DEFAULT_HORIZON, shuffleSeed = null } = {}) {
  const sourceHashBefore = hashWorld(world);
  const actions = legalActions(world);

  /* Optional deliberate reordering. Evaluating in a different order must not
   * change any branch — that is the ordering-invariance claim, and the only way
   * to earn it is to actually vary the order. */
  const order = actions.map((action, index) => index);
  if (shuffleSeed !== null) {
    order.sort((a, b) => {
      const ka = sha256([String(shuffleSeed), forgeActionKey(actions[a])]);
      const kb = sha256([String(shuffleSeed), forgeActionKey(actions[b])]);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }

  const branches = [];
  for (const index of order) {
    const action = actions[index];
    const child = cloneWorld(world);
    const immediate = step(child, action);
    const rolled = rollForward(immediate.state, horizon);
    const totalVector = addRewardVectors(immediate.rewardVector, rolled.rewardVector);
    branches.push({
      actionKey: forgeActionKey(action),
      action,
      immediateRewardVector: immediate.rewardVector,
      immediateScalar: immediate.scalarReward,
      horizonRewardVector: rolled.rewardVector,
      totalRewardVector: totalVector,
      totalScalar: scalarizeReward(totalVector),
      resultingStateHash: hashWorld(immediate.state),
      horizonStateHash: hashWorld(rolled.state),
      terminal: immediate.terminal,
      outcome: immediate.outcome,
      horizonDepth: rolled.depthReached,
      rewardVersion: FORGE_REWARD_VERSION,
    });
  }

  branches.sort((a, b) => (a.actionKey < b.actionKey ? -1 : a.actionKey > b.actionKey ? 1 : 0));

  /* Optimum by total scalar; ties broken by canonical action key so "the optimal
   * action" is a function of the state, not of evaluation order. Exact ties are
   * genuinely exact because every reward component is an integer. */
  let optimal = null;
  for (const branch of branches) {
    if (optimal === null || branch.totalScalar > optimal.totalScalar
      || (branch.totalScalar === optimal.totalScalar && branch.actionKey < optimal.actionKey)) {
      optimal = branch;
    }
  }
  const best = optimal === null ? null : optimal.totalScalar;
  const tied = branches.filter((branch) => branch.totalScalar === best);
  const ranked = [...branches].sort((a, b) =>
    b.totalScalar - a.totalScalar || (a.actionKey < b.actionKey ? -1 : 1));

  return {
    oracleVersion: FORGE_ORACLE_VERSION,
    continuationPolicy: FORGE_CONTINUATION_POLICY,
    rewardVersion: FORGE_REWARD_VERSION,
    horizon,
    sourceStateHash: sourceHashBefore,
    /* The isolation evidence. Recomputed AFTER every branch has run. */
    sourceStateHashAfterBranching: hashWorld(world),
    sourceUnchanged: hashWorld(world) === sourceHashBefore,
    branchCount: branches.length,
    branches,
    ranking: ranked.map((branch) => branch.actionKey),
    optimalActionKey: optimal === null ? null : optimal.actionKey,
    optimalAction: optimal === null ? null : optimal.action,
    optimalScalar: best,
    exactOptimalAvailable: optimal !== null,
    tieCount: tied.length,
    exactTie: tied.length > 1,
    /* Regret of the worst legal choice: how much the decision is worth at all. If
     * this is zero every action is equivalent and the case teaches nothing. */
    utilitySpread: branches.length === 0 ? 0 : best - ranked[ranked.length - 1].totalScalar,
  };
}

/** Regret of a chosen action against the exact optimum. Zero means optimal. */
export function regretOf(counterfactuals, actionKey) {
  const branch = counterfactuals.branches.find((entry) => entry.actionKey === actionKey);
  if (branch === undefined) return null;
  return counterfactuals.optimalScalar - branch.totalScalar;
}

/** Stable identity of the whole counterfactual result, for replay binding. */
export function counterfactualDigest(counterfactuals) {
  return sha256({
    oracleVersion: counterfactuals.oracleVersion,
    continuationPolicy: counterfactuals.continuationPolicy,
    rewardVersion: counterfactuals.rewardVersion,
    horizon: counterfactuals.horizon,
    sourceStateHash: counterfactuals.sourceStateHash,
    branches: counterfactuals.branches.map((branch) => [branch.actionKey, branch.totalScalar, branch.resultingStateHash]),
  });
}
