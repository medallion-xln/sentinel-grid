import { deepFreeze, sha256 } from '../core/determinism.js';
import { ROUTED_POLICIES, availablePolicies, bestPolicySet, bestLabel, quantile } from './policy-router-v1.js';

/* ===========================================================================
 * STAGE_3F_6_D — cost-sensitive policy decision rule.
 *
 * The router scores are FROZEN (Stage 3F.6-T). Only the rule that turns those scores into a
 * policy choice varies. The hypothesis under test: the router ranks NEXUS-best episodes
 * reasonably but under-selects NEXUS because argmax favours the majority RESOURCE class.
 *
 *   EXPECTED_COST(policy) = Σ_regime P(regime | state) × Cost(policy, regime)
 *
 * Every rule chooses only among AVAILABLE policies. With none available the decision is ABSTAIN,
 * never a fabricated action.
 * ========================================================================= */

export const DecisionRule = deepFreeze({
  A_ARGMAX: 'A_ARGMAX_POLICY_PROBABILITY',
  B_CLASS_WEIGHTED: 'B_CLASS_WEIGHTED_ARGMAX',
  C_EXPECTED_REGRET: 'C_EXPECTED_REGRET_MINIMIZATION',
  D_EXPECTED_VALUE: 'D_EXPECTED_VALUE_MAXIMIZATION',
  E_NEXUS_THRESHOLD: 'E_NEXUS_THRESHOLD_OVERRIDE',
});

export const STAGE3F6D_METHODOLOGY = deepFreeze({
  routerSource: 'frozen Stage 3F.6-T router (weights from its evaluation freeze); not retrained',
  inputProfile: 'DEPLOYABLE_CORE (30)',
  regimeDefinition: 'soft best-policy membership: 1/|best set| for each policy at minimum regret',
  classWeights: 'DEV only: w_k = 1 / max(prior_k, 1/n_dev), normalised to sum to 1 over routed policies',
  costMatrix: 'DEV only: mean realized regret of the selected policy, weighted by soft regime membership',
  valueMatrix: 'DEV only: mean correctness of the selected policy, weighted by soft regime membership',
  emptyCellPolicy: 'a cost/value cell with no DEV support falls back to the selected policy\'s overall DEV mean (frozen, recorded)',
  probabilityCalibration: 'temperature scaling of router probabilities; T chosen on CAL by minimum soft-target cross-entropy',
  temperatureGrid: [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4],
  nexusThresholdGrid: [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6],
  nexusThresholdRule: 'on CAL: minimise mean regret; ties -> higher accuracy -> higher threshold',
  headlineRuleSelection: 'on CAL, among B/C/D/E: minimum mean regret; ties -> higher accuracy -> DecisionRule order',
  primaryHypothesisRule: 'C_EXPECTED_REGRET_MINIMIZATION',
  tieBreak: 'ROUTED_POLICIES order',
});

const order = (policy) => ROUTED_POLICIES.indexOf(policy);
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/** Soft regime membership for an episode: each best policy gets 1/|best|. */
export function regimeWeights(row) {
  const { best } = bestPolicySet(row);
  return Object.fromEntries(ROUTED_POLICIES.map((p) => [p, best.includes(p) ? 1 / best.length : 0]));
}

/** Temperature-scale probabilities over available policies (p^(1/T), renormalised). */
export function calibrateProbabilities(probabilities, available, temperature) {
  const raised = Object.fromEntries(ROUTED_POLICIES.map((p) => [p, available.includes(p) && probabilities[p] > 0 ? probabilities[p] ** (1 / temperature) : 0]));
  const total = Object.values(raised).reduce((a, b) => a + b, 0);
  return Object.fromEntries(ROUTED_POLICIES.map((p) => [p, total > 0 ? raised[p] / total : 0]));
}

export function softCrossEntropy(entries) {
  return mean(entries.map(({ probabilities, row }) => {
    const w = regimeWeights(row);
    return -ROUTED_POLICIES.reduce((s, p) => s + (w[p] > 0 ? w[p] * Math.log(Math.max(1e-12, probabilities[p])) : 0), 0);
  }));
}

export function classWeightsFromDev(devRows) {
  const n = devRows.length;
  const prior = Object.fromEntries(ROUTED_POLICIES.map((p) => [p, 0]));
  for (const row of devRows) { const w = regimeWeights(row); for (const p of ROUTED_POLICIES) prior[p] += w[p] / n; }
  const raw = Object.fromEntries(ROUTED_POLICIES.map((p) => [p, 1 / Math.max(prior[p], 1 / n)]));
  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  return deepFreeze({ prior, weights: Object.fromEntries(ROUTED_POLICIES.map((p) => [p, raw[p] / total])) });
}

/**
 * DEV-only matrix M[selected][regime] = weighted mean of `metric(row, selected)` over DEV episodes where
 * `selected` was available, weighted by soft regime membership. Also records p95 regret and accuracy
 * loss per cell for reporting.
 */
export function matrixFromDev(devRows) {
  const cells = {};
  const marginalRegret = {}; const marginalValue = {};
  for (const sel of ROUTED_POLICIES) {
    cells[sel] = {};
    const avail = devRows.filter((r) => availablePolicies(r).includes(sel));
    marginalRegret[sel] = mean(avail.map((r) => r.regret[sel]));
    marginalValue[sel] = mean(avail.map((r) => r.correct[sel]));
    for (const regime of ROUTED_POLICIES) {
      let wSum = 0; let regret = 0; let value = 0; const regrets = [];
      for (const r of avail) {
        const w = regimeWeights(r)[regime];
        if (w <= 0) continue;
        wSum += w; regret += w * r.regret[sel]; value += w * r.correct[sel]; regrets.push(r.regret[sel]);
      }
      regrets.sort((a, b) => a - b);
      cells[sel][regime] = {
        support: wSum,
        meanRegret: wSum > 0 ? regret / wSum : null,
        meanValue: wSum > 0 ? value / wSum : null,
        p95Regret: quantile(regrets, 0.95),
        accuracyLoss: wSum > 0 ? 1 - value / wSum : null,
      };
    }
  }
  const cost = {}; const valueM = {}; const fallbacks = [];
  for (const sel of ROUTED_POLICIES) {
    cost[sel] = {}; valueM[sel] = {};
    for (const regime of ROUTED_POLICIES) {
      const c = cells[sel][regime];
      if (c.meanRegret === null) fallbacks.push(`${sel}|${regime}`);
      cost[sel][regime] = c.meanRegret ?? marginalRegret[sel];
      valueM[sel][regime] = c.meanValue ?? marginalValue[sel];
    }
  }
  return deepFreeze({ cells, cost, value: valueM, marginalRegret, marginalValue, emptyCellFallbacks: fallbacks });
}

export function expectedCosts(probabilities, available, costMatrix) {
  return Object.fromEntries(available.map((sel) => [sel, ROUTED_POLICIES.reduce((s, k) => s + probabilities[k] * costMatrix[sel][k], 0)]));
}

export function expectedValues(probabilities, available, valueMatrix) {
  return Object.fromEntries(available.map((sel) => [sel, ROUTED_POLICIES.reduce((s, k) => s + probabilities[k] * valueMatrix[sel][k], 0)]));
}

function pickBy(available, score, maximize) {
  return [...available].sort((a, b) => (maximize ? score[b] - score[a] : score[a] - score[b]) || order(a) - order(b))[0];
}

/**
 * Apply one frozen rule. `probabilities` are calibrated router probabilities over routed policies.
 * Returns ABSTAIN when no policy proposed an action.
 */
export function decide(rule, { probabilities, available, classWeights, costMatrix, valueMatrix, nexusThreshold }) {
  if (available.length === 0) return deepFreeze({ rule, policy: null, status: 'ABSTAIN', expectedCost: null });
  const ec = costMatrix ? expectedCosts(probabilities, available, costMatrix) : null;
  let policy;
  if (rule === DecisionRule.A_ARGMAX) policy = pickBy(available, probabilities, true);
  else if (rule === DecisionRule.B_CLASS_WEIGHTED) {
    const s = Object.fromEntries(available.map((p) => [p, probabilities[p] * classWeights[p]]));
    policy = pickBy(available, s, true);
  } else if (rule === DecisionRule.C_EXPECTED_REGRET) policy = pickBy(available, ec, false);
  else if (rule === DecisionRule.D_EXPECTED_VALUE) policy = pickBy(available, expectedValues(probabilities, available, valueMatrix), true);
  else if (rule === DecisionRule.E_NEXUS_THRESHOLD) {
    policy = available.includes('NEXUS_SELECTOR') && probabilities.NEXUS_SELECTOR >= nexusThreshold
      ? 'NEXUS_SELECTOR' : pickBy(available, probabilities, true);
  } else throw new Error(`unknown decision rule ${rule}`);
  return deepFreeze({ rule, policy, status: 'SELECTED', expectedCost: ec ? ec[policy] : null });
}

/** NEXUS opportunity capture relative to always-RESOURCE on identical episodes. */
export function nexusCapture(rows, choose) {
  let bestN = 0; let capturedWhenBest = 0; let saved = 0; let added = 0; let falseNexus = 0; let nexusSelected = 0;
  for (const row of rows) {
    const sel = choose(row);
    const label = bestLabel(row);
    if (label === 'NEXUS_SELECTOR') { bestN += 1; if (sel === 'NEXUS_SELECTOR') capturedWhenBest += 1; }
    if (sel !== 'NEXUS_SELECTOR') continue;
    nexusSelected += 1;
    if (!bestPolicySet(row).best.includes('NEXUS_SELECTOR')) falseNexus += 1;
    const diff = row.regret.RESOURCE_PRESERVING_V1 - row.regret.NEXUS_SELECTOR;
    if (diff > 0) saved += diff; else added += -diff;
  }
  return { NEXUS_BEST_N: bestN, NEXUS_SELECTED_WHEN_BEST: capturedWhenBest, NEXUS_CAPTURE_RATE: bestN ? capturedWhenBest / bestN : null,
    NEXUS_SELECTED_N: nexusSelected, FALSE_NEXUS_SELECTION_N: falseNexus,
    REGRET_SAVED_FROM_NEXUS_CAPTURE: saved, REGRET_ADDED_FROM_FALSE_NEXUS_SELECTION: added, NET_REGRET_SAVED: saved - added };
}

export function pearson(xs, ys) {
  const n = xs.length; if (n < 2) return null;
  const mx = mean(xs); const my = mean(ys);
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

const ranks = (v) => {
  const idx = [...v.keys()].sort((a, b) => v[a] - v[b]);
  const r = new Array(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j += 1;
    for (let k = i; k <= j; k += 1) r[idx[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
};
export const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys));

export function costMatrixHash(matrix) {
  return sha256({ cost: matrix.cost, value: matrix.value, emptyCellFallbacks: matrix.emptyCellFallbacks });
}
