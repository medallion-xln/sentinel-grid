# Stage 3F.6-P — Deployable Policy Quality Audit

Certification `3cd670113c2ffd3ad40e1113b77d492943b226bfcdb1730c3b60a15de679a585`
Analysis plan `0d4487542ae2850b28aa1e88e8cdee58618352bf712085f5b78d8f80d7798596`
Policy evidence `f79e0d9ecc66466e4ea6d4085ef5087e518380e26b0b66f6cfacf8b1e753a601` (gitignored build product)

## The question

When a policy is "best available", is it actually good, or just less bad than the others? This stage
audits the frozen Stage 3F.6-A policies themselves. It trains no router, tests no decision rule, adds no
features, and changes no policy.

**Diagnostic only.** It uses DEV and CAL (n = 8000). Every prior HOLDOUT and OOD split has already been
looked at. `CONFIRMATORY_POLICY_QUALITY_CLAIMS=false`.

## Answer

**`B_POLICY_QUALITY_IS_BINDING_LIMITATION`.** NEXUS contributes real oracle value: removing it raises
oracle regret by 8.47. But its own actions are poor even when it is the best policy available. RESOURCE
is genuinely good when it is best, and that strength rests on a Forge cost regularity. OBJECTIVE and
THREAT make sound choices when they act, but they act too rarely to matter.

## Absolute quality (DEV+CAL)

| Policy | coverage | acc | mean regret | median | p95 | worst |
| --- | --- | --- | --- | --- | --- | --- |
| RESOURCE | 1.000 | 0.612 | 26.03 | 0 | 130 | 440 |
| NEXUS | 0.838 | 0.225 | 51.17 | 44 | 145 | 434 |
| OBJECTIVE | 0.048 | 0.199 | 63.96 | 43 | 190 | 267 |
| THREAT | 0.015 | 0.458 | 23.76 | 8 | 82 | 127 |
| GREEDY (reference) | 1.000 | 0.266 | 48.97 | 42 | 142 | 434 |
| RANDOM (control) | 1.000 | 0.226 | 57.92 | 49 | 156 | 444 |

Overall, NEXUS is barely better than a random legal action.

## When best available

| Policy | n best | acc | mean regret | P(≤5) | P(≤25) | P(>50) | P(>100) | uniquely-best n / acc / regret |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RESOURCE | 6107 | 0.802 | **9.82** | 0.819 | 0.881 | 0.070 | 0.029 | 4987 / 0.804 / 8.59 |
| NEXUS | 2884 | 0.523 | **29.09** | 0.537 | 0.640 | 0.243 | 0.085 | 1688 / **0.350 / 37.44** |
| OBJECTIVE | 166 | 0.458 | 44.32 | 0.470 | 0.560 | 0.307 | 0.181 | 59 / 0.627 / 27.56 |
| THREAT | 68 | 0.794 | 8.62 | 0.809 | 0.897 | 0.074 | 0.015 | 57 / 0.790 / 8.72 |

"Best available" includes zero-regret ties with RESOURCE, so the uniquely-best column is the stricter
view. When NEXUS alone is best, it misses the optimal action 65% of the time.

Opportunity (uniquely best): RESOURCE 62.3%, NEXUS 21.1%, OBJECTIVE 0.7%, THREAT 0.7%, tie 15.1%.

## Oracle ceiling and marginal value

| Oracle | acc | mean regret |
| --- | --- | --- |
| current set | 0.701 | 16.17 |
| excluding RESOURCE | 0.232 | 51.52 |
| excluding NEXUS | 0.627 | 24.64 |
| excluding OBJECTIVE | 0.696 | 16.35 |
| excluding THREAT | 0.695 | 16.37 |

Marginal regret reduction: RESOURCE 35.35, NEXUS 8.47, OBJECTIVE 0.19, THREAT 0.20. Even a perfect
router over the current set leaves 16.17 mean regret.

## NEXUS audit

- **Action semantics.** NEXUS picks PROTECT in 91.4% of its selections (accuracy 0.211, mean regret
  53.5), REINFORCE in 5.6%, and REPAIR in 3.1% (accuracy 0.633). In the episodes where NEXUS is best, the
  optimal set contains MOVE 80% of the time and PROTECT 50% of the time. Verdict:
  `DOMINATED_BY_WEAK_PATTERN`.
- **Objective (documented, not changed).** NEXUS ranks action *types* by relational rationale codes: a
  threat-driven order or a structure-repair order. It reads no value, cost, target or horizon term. Ties
  within a type break on action identity.
- **Type vs target.** The chosen type is in the optimal set 53.2% of the time. Exact accuracy is 52.3%.
  So when NEXUS picks the right type, it almost always picks the right target. The error is type
  preference, not target choice.
- **By rationale.** With the threat-driven order, accuracy is 0.472 and mean regret 31.8 (n = 1933). With
  the structure-driven order, accuracy is 0.625 and mean regret 23.5 (n = 951).
- **Regimes (within NEXUS-best).** The only concentrated regime is any observed hostile: regret 32.0 vs
  24.0 without hostiles (ratio 1.34). The DEV hostile median is 0, so HIGH_HOSTILE means any hostile.
  Bottleneck (1.01), low energy (1.10), few actions (0.97) and novelty (1.12) are not concentrated.
- **Routing vs policy.** `NEXUS_ITSELF_CHOOSES_WEAK_ACTIONS`. With perfect routing to NEXUS-best episodes,
  NEXUS still carries 29.1 regret. RESOURCE carries 53.9 in the same episodes.
- **Replacement hypothesis.** `BETTER_RISK_RESPONSE`. The mapping rule narrowly missed its accuracy bar
  (0.5225 vs < 0.5). The type-vs-target finding points the same way: under threat, the problem is
  reflexive PROTECT.

## RESOURCE audit

- When best: accuracy 0.802, mean regret 9.82. It exceeds 50 regret in 20.4% of all episodes.
- Failure regime: novel states, regret 44.4 vs 24.0 (ratio 1.85). Hostiles (1.50) and unsupported threats
  (1.39) also raise its regret.
- **Forge shortcut (Forge only; not generalized).** P(greedy picks the max-cost action) = 0.973. P(a
  zero-cost action is in the optimal set) = 0.900. P(RESOURCE correct | zero-cost optimal exists) = 0.680
  vs 0 otherwise. RESOURCE always chooses a zero-cost action, so the HIGH dependence is structural.

## OBJECTIVE and THREAT

| | abstention | opportunity | acc when proposing | acc with an in-class optimal action | reason |
| --- | --- | --- | --- | --- | --- |
| OBJECTIVE | 95.2% | 1.0% | 0.199 | 0.916 (n = 83) | RARE_OPPORTUNITY |
| THREAT | 98.5% | 0.9% | 0.458 | 0.794 (n = 68) | RARE_OPPORTUNITY |

When a target-class action is actually optimal, their decision rules choose it well. They rarely apply,
and those opportunities are rare. `INSUFFICIENT_OBSERVATION` cannot be measured from current evidence.

## Classification (diagnostic)

| Policy | Class |
| --- | --- |
| RESOURCE_PRESERVING_V1 | KEEP |
| NEXUS_SELECTOR | REDESIGN_CANDIDATE |
| OBJECTIVE_TARGETING_V1 | INSUFFICIENT_EVIDENCE (best-available n < 200; marginal value also below the removal bar) |
| THREAT_COVERING_V1 | INSUFFICIENT_EVIDENCE (same) |

## Disclosures

- **Static audit correction.** On the first run, the three static audits matched their own regex literals.
  They were tightened to call and import forms that cannot match themselves. The plan hash, rules and
  metrics are unchanged.
- **Oracle fallback.** When no member of an oracle subset proposes an action, the subset falls back to the
  RANDOM_LEGAL control action.

## Roadmap

`READY_FOR_POLICY_REDESIGN=true` (diagnostic; not confirmed on fresh data) · `READY_FOR_ROUTER_RETRAIN=false` ·
`READY_FOR_STAGE3G=false`. Authority R0, non-dispatching, no online learning.

## Reproduce

```bash
npm run stage3f6p:generate
npm run stage3f6p:certify
npm run stage3f6p:check
npm run test:stage3f6p
```
