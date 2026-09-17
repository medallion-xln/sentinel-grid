import { createSeededRandom, deepFreeze, sha256 } from '../core/determinism.js';
import {
  DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH, DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_ID, DEPLOYABLE_PROPOSAL_PRODUCERS,
} from './deployable-action-proposal-v1.js';

/* ===========================================================================
 * STAGE_3F_6_T — deployable policy router.
 *
 * Chooses among the FROZEN Stage 3F.6-A deployable action producers from decision-time
 * DEPLOYABLE_CORE evidence. The question is not whether routing beats greedy — Stage 3F.6-A
 * already showed RESOURCE_PRESERVING_V1 does — but whether routing beats simply always using
 * the best single deployable policy.
 *
 * A policy that abstained on an episode is UNAVAILABLE there: it is masked out of the softmax in
 * training and at inference, so the router can never select a policy that proposed nothing.
 * Deterministic throughout: no RNG in training, a seeded RNG only for the bootstrap.
 * ========================================================================= */

export class PolicyRouterError extends Error {}

/** Routable candidates, in fixed order. The order is also the deterministic tie-break. */
export const ROUTED_POLICIES = deepFreeze(['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1']);
export const CONTROL_POLICY = 'RANDOM_LEGAL_V1';
export const NON_DEPLOYABLE_REFERENCE = 'GREEDY';

export const POLICY_SET = deepFreeze({
  policySetId: 'STAGE3F6T_FROZEN_DEPLOYABLE_POLICY_SET_V1',
  frozenFromStage: 'STAGE_3F_6_A',
  routedPolicies: ROUTED_POLICIES,
  controlPolicy: CONTROL_POLICY,
  nonDeployableReference: NON_DEPLOYABLE_REFERENCE,
  proposalContract: { id: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_ID, hash: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH },
  producerObjectives: DEPLOYABLE_PROPOSAL_PRODUCERS.map((p) => ({ producerId: p.producerId, objective: p.objective })),
  nexusSelector: { source: 'src/lab/stage3c-learned-nexus.js#nexusRelationalSelector', modified: false },
  policiesModified: false,
  policiesAdded: false,
});
export const POLICY_SET_HASH = sha256(POLICY_SET);

/** Frozen before any sealed partition is opened. */
export const STAGE3F6T_METHODOLOGY = deepFreeze({
  routerFamily: 'MULTINOMIAL_LOGISTIC_REGRESSION_MASKED_SOFTMAX',
  inputProfile: 'DEPLOYABLE_CORE',
  learningRate: 0.1,
  l2: 1e-3,
  iterations: 2000,
  weightInitialization: 'ZEROS',
  biasPosition: 'LAST',
  l2ExcludesBias: true,
  standardization: 'DEV_MEAN_AND_POPULATION_STD_ZERO_SD_TO_ONE',
  target: 'BEST_DEPLOYABLE_POLICY_BY_MINIMUM_REGRET_TIES_AS_UNIFORM_SOFT_TARGET',
  unavailablePolicySemantics: 'MASKED_FROM_SOFTMAX_NEVER_SELECTABLE',
  tieBreak: 'ROUTED_POLICIES_ORDER',
  confidenceGrid: [0, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95],
  confidenceRule: 'ON CAL: minimise mean regret; ties -> higher task accuracy -> lower threshold (higher coverage)',
  abstentionFallback: 'BEST_SINGLE_ALWAYS_AVAILABLE_DEPLOYABLE_POLICY_ON_DEV_CAL_BY_MEAN_REGRET',
  bootstrapResamples: 1000,
  bootstrapSeed: '3647',
  quantileRule: 'NEAREST_RANK',
  policyCollapseShare: 0.9,
  policyCollapseOptimalityMargin: 0.05,
});

/* ------------------------------------------------------------------- rows */

export function availablePolicies(row) {
  return ROUTED_POLICIES.filter((policy) => row.chosen[policy] !== null && row.chosen[policy] !== undefined
    && typeof row.regret[policy] === 'number' && Number.isFinite(row.regret[policy]));
}

/** Best deployable policies for an episode: every available policy at the minimum regret. Ties kept. */
export function bestPolicySet(row) {
  const available = availablePolicies(row);
  if (available.length === 0) return deepFreeze({ available, best: [], bestRegret: null });
  const bestRegret = Math.min(...available.map((policy) => row.regret[policy]));
  return deepFreeze({ available, best: available.filter((policy) => row.regret[policy] === bestRegret), bestRegret });
}

export function bestLabel(row) {
  const { best } = bestPolicySet(row);
  if (best.length === 0) return 'NONE_AVAILABLE';
  return best.length === 1 ? best[0] : 'TIE';
}

/* ---------------------------------------------------------------- training */

function standardizer(matrix) {
  const n = matrix.length;
  const d = matrix[0].length;
  const mu = new Array(d).fill(0);
  for (const row of matrix) for (let j = 0; j < d; j += 1) mu[j] += row[j] / n;
  const sd = new Array(d).fill(0);
  for (const row of matrix) for (let j = 0; j < d; j += 1) sd[j] += ((row[j] - mu[j]) ** 2) / n;
  for (let j = 0; j < d; j += 1) { sd[j] = Math.sqrt(sd[j]); if (sd[j] === 0) sd[j] = 1; }
  return { mu, sd };
}

function maskedSoftmax(logits, mask) {
  let max = -Infinity;
  for (let k = 0; k < logits.length; k += 1) if (mask[k] && logits[k] > max) max = logits[k];
  const out = new Array(logits.length).fill(0);
  if (max === -Infinity) return out;
  let sum = 0;
  for (let k = 0; k < logits.length; k += 1) if (mask[k]) { out[k] = Math.exp(logits[k] - max); sum += out[k]; }
  for (let k = 0; k < logits.length; k += 1) out[k] /= sum;
  return out;
}

/**
 * Fit on DEV only. `rows` carry `core` (feature map), `chosen` and `regret` (per policy).
 * Weight layout: W[k] has feature weights then bias LAST.
 */
export function fitPolicyRouter(rows, featureKeys, options = {}) {
  const { learningRate, l2, iterations } = { ...STAGE3F6T_METHODOLOGY, ...options };
  const usable = rows.filter((row) => availablePolicies(row).length > 0);
  if (usable.length === 0) throw new PolicyRouterError('no DEV episode has an available policy');
  const raw = usable.map((row) => featureKeys.map((key) => {
    const value = row.core[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new PolicyRouterError(`non-finite feature ${key}`);
    return value;
  }));
  const { mu, sd } = standardizer(raw);
  const d = featureKeys.length;
  const K = ROUTED_POLICIES.length;
  const X = raw.map((row) => row.map((value, j) => (value - mu[j]) / sd[j]));
  const masks = usable.map((row) => { const a = availablePolicies(row); return ROUTED_POLICIES.map((p) => a.includes(p)); });
  const targets = usable.map((row) => {
    const { best } = bestPolicySet(row);
    return ROUTED_POLICIES.map((p) => (best.includes(p) ? 1 / best.length : 0));
  });

  const W = Array.from({ length: K }, () => new Array(d + 1).fill(0));
  const n = usable.length;
  const logits = new Array(K);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const grad = Array.from({ length: K }, () => new Array(d + 1).fill(0));
    for (let i = 0; i < n; i += 1) {
      const x = X[i];
      for (let k = 0; k < K; k += 1) {
        let z = W[k][d];
        for (let j = 0; j < d; j += 1) z += W[k][j] * x[j];
        logits[k] = z;
      }
      const p = maskedSoftmax(logits, masks[i]);
      for (let k = 0; k < K; k += 1) {
        if (!masks[i][k]) continue;
        const r = (p[k] - targets[i][k]) / n;
        for (let j = 0; j < d; j += 1) grad[k][j] += r * x[j];
        grad[k][d] += r;
      }
    }
    for (let k = 0; k < K; k += 1) {
      for (let j = 0; j < d; j += 1) W[k][j] -= learningRate * (grad[k][j] + l2 * W[k][j]);
      W[k][d] -= learningRate * grad[k][d];
    }
  }
  return deepFreeze({ family: STAGE3F6T_METHODOLOGY.routerFamily, policies: ROUTED_POLICIES, featureKeys: [...featureKeys],
    mu, sd, W, learningRate, l2, iterations, trainedN: n });
}

export function policyRouterHash(model) {
  return sha256({ family: model.family, policies: model.policies, featureKeys: model.featureKeys,
    mu: model.mu, sd: model.sd, W: model.W });
}

/** Probability over AVAILABLE policies only. An unavailable policy always has probability 0. */
export function scorePolicies(model, row) {
  const d = model.featureKeys.length;
  const x = model.featureKeys.map((key, j) => {
    const value = row.core[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new PolicyRouterError(`feature '${key}' unavailable at scoring time`);
    return (value - model.mu[j]) / model.sd[j];
  });
  const available = availablePolicies(row);
  const mask = model.policies.map((p) => available.includes(p));
  const logits = model.W.map((w) => { let z = w[d]; for (let j = 0; j < d; j += 1) z += w[j] * x[j]; return z; });
  const probabilities = maskedSoftmax(logits, mask);
  let bestIndex = -1;
  for (let k = 0; k < model.policies.length; k += 1) {
    if (!mask[k]) continue;
    if (bestIndex === -1 || probabilities[k] > probabilities[bestIndex]) bestIndex = k;
  }
  return deepFreeze({
    available,
    probabilities: Object.fromEntries(model.policies.map((p, k) => [p, probabilities[k]])),
    selected: bestIndex === -1 ? null : model.policies[bestIndex],
    confidence: bestIndex === -1 ? 0 : probabilities[bestIndex],
  });
}

/** Router decision at a frozen confidence threshold; below it, the predeclared fallback acts. */
export function routeEpisode(model, row, { threshold, fallbackPolicy }) {
  const scored = scorePolicies(model, row);
  const routed = scored.selected !== null && scored.confidence >= threshold;
  const fallbackAvailable = scored.available.includes(fallbackPolicy);
  const selected = routed ? scored.selected : (fallbackAvailable ? fallbackPolicy : scored.selected);
  return deepFreeze({ ...scored, routed, selectedPolicy: selected, usedFallback: !routed });
}

/* ------------------------------------------------------------- evaluation */

export function quantile(sortedAscending, q) {
  if (sortedAscending.length === 0) return null;
  const rank = Math.max(1, Math.ceil(q * sortedAscending.length));
  return sortedAscending[Math.min(rank, sortedAscending.length) - 1];
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/**
 * Evaluate a per-episode choice function. `choose(row)` returns a policy id or null (no action).
 * Rows where the chosen policy did not propose count as not covered for that strategy.
 */
export function evaluateStrategy(rows, choose) {
  const outcomes = [];
  let covered = 0;
  for (const row of rows) {
    const policy = choose(row);
    const { best, bestRegret } = bestPolicySet(row);
    const valid = policy !== null && row.chosen[policy] !== null && row.chosen[policy] !== undefined
      && typeof row.regret[policy] === 'number';
    if (!valid) continue;
    covered += 1;
    outcomes.push({ policy, correct: row.correct[policy], regret: row.regret[policy],
      selectionCorrect: best.includes(policy), addedRegret: bestRegret === null ? null : row.regret[policy] - bestRegret });
  }
  const regrets = outcomes.map((o) => o.regret).sort((a, b) => a - b);
  const distribution = {};
  for (const o of outcomes) distribution[o.policy] = (distribution[o.policy] ?? 0) + 1;
  for (const key of Object.keys(distribution)) distribution[key] /= outcomes.length;
  return {
    n: rows.length,
    coveredN: covered,
    coverage: rows.length ? covered / rows.length : 0,
    accuracy: mean(outcomes.map((o) => o.correct)),
    meanRegret: mean(regrets),
    p95Regret: quantile(regrets, 0.95),
    selectionAccuracy: mean(outcomes.map((o) => (o.selectionCorrect ? 1 : 0))),
    selectionDistribution: distribution,
  };
}

/** Routing equivalent of false-safe harm: regret added by selecting a policy outside the best set. */
export function falseSelectionHarm(rows, choose) {
  const added = [];
  for (const row of rows) {
    const policy = choose(row);
    if (policy === null || row.chosen[policy] === null || typeof row.regret[policy] !== 'number') continue;
    const { best, bestRegret } = bestPolicySet(row);
    if (best.includes(policy)) continue;
    added.push(row.regret[policy] - bestRegret);
  }
  added.sort((a, b) => a - b);
  return {
    falseSelections: added.length,
    rate: rows.length ? added.length / rows.length : null,
    meanAddedRegret: mean(added),
    p90: quantile(added, 0.9), p95: quantile(added, 0.95), p99: quantile(added, 0.99),
    worst: added.length ? added[added.length - 1] : null,
  };
}

/** Confusion of true-best label (single policy, TIE, NONE) against the selected policy. */
export function selectionConfusion(rows, choose) {
  const matrix = {};
  const recall = {};
  for (const row of rows) {
    const label = bestLabel(row);
    const selected = choose(row) ?? 'NONE';
    matrix[label] = matrix[label] ?? {};
    matrix[label][selected] = (matrix[label][selected] ?? 0) + 1;
  }
  for (const policy of ROUTED_POLICIES) {
    const uniquelyBest = rows.filter((row) => bestLabel(row) === policy);
    const inBest = rows.filter((row) => bestPolicySet(row).best.includes(policy));
    recall[policy] = {
      uniquelyBestN: uniquelyBest.length,
      selectedWhenUniquelyBest: uniquelyBest.length ? uniquelyBest.filter((row) => choose(row) === policy).length / uniquelyBest.length : null,
      inBestSetN: inBest.length,
      selectedWhenInBestSet: inBest.length ? inBest.filter((row) => choose(row) === policy).length / inBest.length : null,
    };
  }
  return { matrix, recall };
}

export function opportunityDistribution(rows) {
  const counts = { NONE_AVAILABLE: 0, TIE: 0 };
  for (const policy of ROUTED_POLICIES) counts[policy] = 0;
  let greedyBest = 0;
  let greedyStrictlyBetter = 0;
  for (const row of rows) {
    counts[bestLabel(row)] += 1;
    const { bestRegret } = bestPolicySet(row);
    if (typeof row.regret.GREEDY === 'number' && bestRegret !== null && row.regret.GREEDY <= bestRegret) greedyBest += 1;
    if (typeof row.regret.GREEDY === 'number' && bestRegret !== null && row.regret.GREEDY < bestRegret) greedyStrictlyBetter += 1;
  }
  const out = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, rows.length ? v / rows.length : null]));
  out.GREEDY_AT_LEAST_AS_GOOD_AS_BEST_DEPLOYABLE = rows.length ? greedyBest / rows.length : null;
  out.GREEDY_STRICTLY_BETTER_THAN_BEST_DEPLOYABLE = rows.length ? greedyStrictlyBetter / rows.length : null;
  return out;
}

/** Paired, seeded bootstrap of (a - b) for accuracy and regret on identical episodes. */
export function pairedBootstrap(rows, chooseA, chooseB, { resamples = STAGE3F6T_METHODOLOGY.bootstrapResamples,
  seed = STAGE3F6T_METHODOLOGY.bootstrapSeed } = {}) {
  const pairs = [];
  for (const row of rows) {
    const a = chooseA(row); const b = chooseB(row);
    if (a === null || b === null || typeof row.regret[a] !== 'number' || typeof row.regret[b] !== 'number') continue;
    pairs.push({ acc: row.correct[a] - row.correct[b], reg: row.regret[a] - row.regret[b] });
  }
  const n = pairs.length;
  if (n === 0) return { n: 0 };
  const random = createSeededRandom(BigInt(seed));
  const accDiffs = []; const regDiffs = [];
  for (let r = 0; r < resamples; r += 1) {
    let acc = 0; let reg = 0;
    for (let i = 0; i < n; i += 1) { const pick = pairs[Math.floor(random() * n)]; acc += pick.acc; reg += pick.reg; }
    accDiffs.push(acc / n); regDiffs.push(reg / n);
  }
  accDiffs.sort((a, b) => a - b); regDiffs.sort((a, b) => a - b);
  return {
    n,
    accuracyDifference: mean(pairs.map((p) => p.acc)),
    accuracyCi95: [quantile(accDiffs, 0.025), quantile(accDiffs, 0.975)],
    regretDifference: mean(pairs.map((p) => p.reg)),
    regretCi95: [quantile(regDiffs, 0.025), quantile(regDiffs, 0.975)],
    episodesImproved: pairs.filter((p) => p.reg < 0).length,
    episodesWorsened: pairs.filter((p) => p.reg > 0).length,
  };
}

/** Fraction of the oracle's advantage over the best single policy that the router recovers. */
export function oracleGainCaptured({ router, bestSingle, oracle }) {
  const accuracyDenominator = oracle.accuracy - bestSingle.accuracy;
  const regretDenominator = bestSingle.meanRegret - oracle.meanRegret;
  return {
    accuracy: accuracyDenominator > 0 ? (router.accuracy - bestSingle.accuracy) / accuracyDenominator : null,
    regret: regretDenominator > 0 ? (bestSingle.meanRegret - router.meanRegret) / regretDenominator : null,
    accuracyDenominator,
    regretDenominator,
  };
}

/** Expected calibration error of router confidence against selection correctness. */
export function selectionEce(entries, bins = 10) {
  if (entries.length === 0) return null;
  const buckets = Array.from({ length: bins }, () => ({ n: 0, conf: 0, hit: 0 }));
  for (const e of entries) {
    const b = Math.min(bins - 1, Math.floor(e.confidence * bins));
    buckets[b].n += 1; buckets[b].conf += e.confidence; buckets[b].hit += e.correct ? 1 : 0;
  }
  let total = 0;
  for (const b of buckets) if (b.n) total += (b.n / entries.length) * Math.abs(b.conf / b.n - b.hit / b.n);
  return total;
}
