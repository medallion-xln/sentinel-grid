// Component C — Safety-Constrained Ranking (frozen contract SK1_TIERED_RISK_THEN_REGRET_V1).
// The COMPLETE menu is ranked. Order of precedence, most important first:
//   1. public deterministic constraints   (an action excluded by Component A ranks last and is never selected)
//   2. support                            (an action without a supported risk estimate ranks below every supported one)
//   3. risk tier                          tier = floor(upperBound / tierWidth), lower is better; upperBound already
//                                         includes ensemble uncertainty and the out-of-distribution penalty
//   4. expected regret                    lower is better, inside a risk tier
//   5. risk upper bound                   lower is better
// Advisory expert evidence enters through the estimators (Component B); it never overrides steps 1-3.
// Ties: actions that are EXACTLY equal on steps 1-5 are indistinguishable to the kernel. They are returned together
// as one decision set. No action id, handle, menu position or lexical order is used to prefer one of them: the
// canonical signature only fixes the order in which the members of a set are LISTED.
// Abstention: if the best selectable action is unsupported, or its upper bound exceeds tau, nothing is recommended.
import { REASON } from './contract.mjs';

export const RANKING_CONTRACT = 'SK1_TIERED_RISK_THEN_REGRET_V1';

export function rankActions(semantics, risks, cfg) {
  const n = semantics.length, tierOf = (u) => Math.floor(u / cfg.tierWidth + 1e-12);
  const rows = semantics.map((s, i) => { const r = risks[i]; return { index: i, key: s.key, signature: s.signature, excluded: s.excluded, selectable: s.selectable, supported: r.supported,
    tier: r.supported ? tierOf(r.upper) : null, regret: r.supported ? r.regret.estimate : null, upper: r.upper }; });
  const cls = (a) => (a.excluded ? 2 : a.supported ? 0 : 1);
  const substantive = (a, b) => cls(a) - cls(b) || (a.supported && b.supported ? a.tier - b.tier || a.regret - b.regret || a.upper - b.upper : 0);
  const order = [...rows].sort((a, b) => substantive(a, b) || (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0) || a.index - b.index);
  // rank groups: consecutive rows that are exactly equal on every substantive criterion share a rank
  let rank = 0; order.forEach((r, k) => { if (k > 0 && substantive(order[k - 1], r) !== 0) rank = k; r.rank = rank; });
  const ranked = order.map((r) => ({ index: r.index, rank: r.rank, excluded: r.excluded, selectable: r.selectable, supported: r.supported, riskTier: r.tier, expectedRegret: r.regret, riskUpperBound: r.upper }));
  const candidates = order.filter((r) => r.selectable);
  const abstain = (reason, extra = {}) => ({ contract: RANKING_CONTRACT, ranked, decision: { kind: 'ABSTAIN', reason, selectedIndex: null, decisionSet: [], ...extra } });
  if (!candidates.length) return abstain(REASON.ABSTAIN_ALL_ACTIONS_EXCLUDED_BY_PUBLIC_CONSTRAINT);
  const best = candidates[0];
  if (!best.supported) return abstain(REASON.ABSTAIN_NO_SUPPORTED_RISK_ESTIMATE);
  // best-effort view for diagnostics only: what a forced choice would be. Never presented as a recommendation.
  const set = candidates.filter((r) => substantive(best, r) === 0), setIdx = set.map((r) => r.index).sort((a, b) => a - b);
  const forced = { forcedChoiceIndex: best.index, forcedChoiceSet: setIdx };
  if (best.upper > cfg.tau) return abstain(REASON.ABSTAIN_NO_ACTION_MEETS_RISK_CRITERION, { bestRiskUpperBound: best.upper, tau: cfg.tau, ...forced });
  const distinctKeys = new Set(set.map((r) => r.key)).size, tiers = new Set(candidates.filter((r) => r.supported).map((r) => r.tier));
  return { contract: RANKING_CONTRACT, ranked, decision: { kind: 'RECOMMEND', selectedIndex: best.index, decisionSet: setIdx, indistinguishableDistinctActions: distinctKeys > 1, distinctActionsInSet: distinctKeys,
    reason: tiers.size > 1 && candidates.filter((r) => r.supported && r.tier === best.tier).length === 1 ? REASON.SELECTED_LOWEST_RISK_TIER : REASON.SELECTED_BEST_EXPECTED_REGRET_IN_TIER,
    tieNote: set.length > 1 && distinctKeys === 1 ? REASON.TIE_RESOLVED_WITHIN_EQUIVALENT_ACTIONS : null, riskUpperBound: best.upper, tau: cfg.tau, ...forced }, menuSize: n };
}
