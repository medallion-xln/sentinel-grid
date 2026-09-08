/* Sentinel Forge World — V2 counterfactual oracle.
 *
 * A SUPERSEDING module wrapping the frozen Stage 3A oracle. It reuses the frozen
 * kernel's step() unchanged and recomputes the reward under FORGE_REWARD_V2, so
 * Stage 3A's oracle and every certification resting on it continue to reproduce
 * byte-identically.
 *
 * It also generalises the continuation policy. Stage 3A had one; Stage 3B needs a
 * small named FAMILY, because a dataset whose optimal actions are all artefacts
 * of a single roll-forward rule is a dataset about that rule. Cases where every
 * policy agrees are stronger supervision than cases where they do not, and the
 * difference is recorded rather than averaged away.
 */

import { sha256 } from '../core/determinism.js';
import { forgeActionKey, isTerminal, legalActions, step, hashWorld, cloneWorld } from './kernel.js';
import {
  FORGE_REWARD_V2_VERSION, addRewardV2Vectors, emptyRewardV2Vector, rewardV2For, scalarizeRewardV2,
} from './reward-v2.js';

export const FORGE_ORACLE_V2_VERSION = 'forge-counterfactual-v2';
export const FORGE_DEFAULT_HORIZON_V2 = 4;

/* ---------------------------------------------------------------------------
 * Continuation policy family (Phase 11)
 *
 * Each is deterministic, closed-form and consults only the simulator. None is
 * "the true future" — each is a NAMED assumption about what happens next, and the
 * optimum is always reported with respect to one.
 * ------------------------------------------------------------------------- */

export const CONTINUATION_POLICIES = Object.freeze({
  GREEDY_CONTINUATION_V1: {
    id: 'GREEDY_CONTINUATION_V1',
    description: 'take the action with the highest immediate V2 scalar; ties broken by canonical action key',
    rank: (candidate) => candidate.scalar,
  },
  OBJECTIVE_PRIORITY_V1: {
    id: 'OBJECTIVE_PRIORITY_V1',
    description: 'prefer objective progress and delivery above all else, then fall back to the immediate scalar',
    rank: (candidate) => candidate.vector.immediateObjectiveProgress * 1000
      + candidate.vector.deliveredValue * 100
      + candidate.vector.futureObjectivePotential * 10
      + candidate.scalar,
  },
  RISK_CONSERVATIVE_V1: {
    id: 'RISK_CONSERVATIVE_V1',
    description: 'avoid risk and civilian harm first, then take the immediate scalar',
    rank: (candidate) => -candidate.vector.riskExposure * 100
      + candidate.vector.civilianSafety * 100
      + candidate.scalar,
  },
});

export const CONTINUATION_POLICY_IDS = Object.freeze(Object.keys(CONTINUATION_POLICIES).sort());

export const POLICY_AGREEMENT_CLASSES = Object.freeze(['POLICY_INVARIANT_OPTIMUM', 'POLICY_DEPENDENT_OPTIMUM']);

/** One transition, scored under V2. The kernel is untouched. */
function transitionV2(world, action) {
  const outcome = step(world, action);
  const vector = rewardV2For({
    before: world,
    after: outcome.state,
    v1Vector: outcome.rewardVector,
    events: outcome.events,
    terminal: outcome.terminal,
    outcome: outcome.outcome,
  });
  return { ...outcome, vector, scalar: scalarizeRewardV2(vector) };
}

function continuationAction(world, policy) {
  const actions = legalActions(world);
  if (actions.length === 0) return null;
  let best = null;
  for (const action of actions) {
    const result = transitionV2(world, action);
    const key = forgeActionKey(action);
    const rank = policy.rank({ scalar: result.scalar, vector: result.vector });
    if (best === null || rank > best.rank || (rank === best.rank && key < best.key)) {
      best = { action, rank, key };
    }
  }
  return best.action;
}

export function rollForwardV2(world, horizon, policy) {
  let current = world;
  let accumulated = emptyRewardV2Vector();
  let depth = 0;
  for (; depth < horizon; depth += 1) {
    if (isTerminal(current)) break;
    const action = continuationAction(current, policy);
    if (action === null) break;
    const result = transitionV2(current, action);
    accumulated = addRewardV2Vectors(accumulated, result.vector);
    current = result.state;
  }
  return { state: current, vector: accumulated, depthReached: depth };
}

/**
 * Evaluate every legal action under one continuation policy.
 *
 * Returns the same isolation evidence the Stage 3A oracle does — the source hash
 * before and after — because branching that silently mutated its parent would
 * make every utility downstream meaningless, and that has to stay measured rather
 * than inherited on trust.
 */
export function evaluateCounterfactualsV2(world, {
  horizon = FORGE_DEFAULT_HORIZON_V2,
  policyId = 'GREEDY_CONTINUATION_V1',
  shuffleSeed = null,
} = {}) {
  const policy = CONTINUATION_POLICIES[policyId];
  if (policy === undefined) throw new Error(`Unknown continuation policy: ${policyId}`);

  const sourceHashBefore = hashWorld(world);
  const actions = legalActions(world);

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
    const immediate = transitionV2(child, action);
    const rolled = rollForwardV2(immediate.state, horizon, policy);
    const totalVector = addRewardV2Vectors(immediate.vector, rolled.vector);
    branches.push({
      actionKey: forgeActionKey(action),
      action,
      immediateRewardVector: immediate.vector,
      immediateScalar: immediate.scalar,
      horizonRewardVector: rolled.vector,
      totalRewardVector: totalVector,
      totalScalar: scalarizeRewardV2(totalVector),
      resultingStateHash: hashWorld(immediate.state),
      horizonStateHash: hashWorld(rolled.state),
      terminal: immediate.terminal,
      outcome: immediate.outcome,
      horizonDepth: rolled.depthReached,
      rewardVersion: FORGE_REWARD_V2_VERSION,
    });
  }
  branches.sort((a, b) => (a.actionKey < b.actionKey ? -1 : a.actionKey > b.actionKey ? 1 : 0));

  let optimal = null;
  for (const branch of branches) {
    if (optimal === null || branch.totalScalar > optimal.totalScalar
      || (branch.totalScalar === optimal.totalScalar && branch.actionKey < optimal.actionKey)) {
      optimal = branch;
    }
  }
  const best = optimal === null ? null : optimal.totalScalar;
  const tied = branches.filter((branch) => branch.totalScalar === best);
  const ranked = [...branches].sort((a, b) => b.totalScalar - a.totalScalar || (a.actionKey < b.actionKey ? -1 : 1));

  return {
    oracleVersion: FORGE_ORACLE_V2_VERSION,
    continuationPolicy: policyId,
    rewardVersion: FORGE_REWARD_V2_VERSION,
    horizon,
    sourceStateHash: sourceHashBefore,
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
    utilitySpread: branches.length === 0 ? 0 : best - ranked[ranked.length - 1].totalScalar,
  };
}

/**
 * Evaluate under every policy in the family and classify agreement.
 *
 * POLICY_INVARIANT_OPTIMUM means every named assumption about the future picks
 * the same action — supervision that does not depend on which story about the
 * continuation you believe. That is a stronger label, and it is marked as one.
 */
export function evaluateAcrossPolicies(world, { horizon = FORGE_DEFAULT_HORIZON_V2 } = {}) {
  const byPolicy = {};
  for (const policyId of CONTINUATION_POLICY_IDS) {
    byPolicy[policyId] = evaluateCounterfactualsV2(world, { horizon, policyId });
  }
  /* Agreement is on the optimal SET, not on the tie-broken representative. Two
   * policies that both put an action among the optima agree about the decision;
   * differing on a lexicographic tie-break is not disagreement about the world. */
  const optimalSets = CONTINUATION_POLICY_IDS.map((policyId) => {
    const result = byPolicy[policyId];
    return new Set(result.branches.filter((branch) => branch.totalScalar === result.optimalScalar).map((branch) => branch.actionKey));
  });
  const intersection = optimalSets.reduce((accumulator, current) =>
    new Set([...accumulator].filter((key) => current.has(key))));
  const invariant = intersection.size > 0;

  return {
    policies: CONTINUATION_POLICY_IDS,
    policyCount: CONTINUATION_POLICY_IDS.length,
    byPolicy,
    sharedOptimalActionKeys: [...intersection].sort(),
    agreementClass: invariant ? 'POLICY_INVARIANT_OPTIMUM' : 'POLICY_DEPENDENT_OPTIMUM',
    policyInvariant: invariant,
    note: 'No policy is "the true future". Each is a named assumption; a case where all of them agree is stronger supervision than one where they do not.',
  };
}

/* ---------------------------------------------------------------------------
 * Horizon dependence (Phase 10)
 * ------------------------------------------------------------------------- */

export const HORIZON_CLASSES = Object.freeze(['HORIZON_ALIGNED', 'HORIZON_DEPENDENT']);

/**
 * Compare the one-step optimum against the continuation optimum.
 *
 * Both are computed under the SAME reward, so the difference isolates the horizon
 * and nothing else. A case is horizon-dependent when no immediate-optimal action
 * is also continuation-optimal — set against set, so a lexicographic tie-break
 * cannot manufacture the classification.
 */
export function classifyHorizonDependence(world, {
  horizon = FORGE_DEFAULT_HORIZON_V2,
  policyId = 'GREEDY_CONTINUATION_V1',
  /* The caller usually already has the horizon evaluation. Recomputing it was
   * roughly half the cost of a case, and at fifty thousand cases that is the
   * difference between a corpus that can be generated and one that cannot. */
  deepEvaluation = null,
} = {}) {
  const shallow = evaluateCounterfactualsV2(world, { horizon: 0, policyId });
  const deep = deepEvaluation ?? evaluateCounterfactualsV2(world, { horizon, policyId });
  if (shallow.branchCount === 0 || deep.branchCount === 0) {
    return { horizonClass: 'HORIZON_ALIGNED', measurable: false, reason: 'no legal actions' };
  }
  const immediateOptima = new Set(shallow.branches
    .filter((branch) => branch.totalScalar === shallow.optimalScalar).map((branch) => branch.actionKey));
  const horizonOptima = new Set(deep.branches
    .filter((branch) => branch.totalScalar === deep.optimalScalar).map((branch) => branch.actionKey));
  const overlap = [...immediateOptima].filter((key) => horizonOptima.has(key));

  /* The regret a myopic chooser actually pays: best immediate action, scored on
   * the horizon. Zero when the sets overlap. */
  const bestImmediateKey = [...immediateOptima].sort()[0];
  const asHorizon = deep.branches.find((branch) => branch.actionKey === bestImmediateKey);
  const greedyRegret = asHorizon === undefined ? null : deep.optimalScalar - asHorizon.totalScalar;

  return {
    horizonClass: overlap.length > 0 ? 'HORIZON_ALIGNED' : 'HORIZON_DEPENDENT',
    measurable: true,
    horizon,
    policyId,
    immediateOptimaCount: immediateOptima.size,
    horizonOptimaCount: horizonOptima.size,
    overlapCount: overlap.length,
    greedyRegret,
    shallowSpread: shallow.utilitySpread,
    horizonSpread: deep.utilitySpread,
  };
}
