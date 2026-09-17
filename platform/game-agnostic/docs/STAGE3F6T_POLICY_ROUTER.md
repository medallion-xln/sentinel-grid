# Stage 3F.6-T — Deployable Policy Router Retraining

Certification `5d6910dd39405ee9f9fc2868f1309ff84998d30f7128e7a60b36644ca9056582`
Evaluation freeze `665a29e3b8b1b16e6c65a20f45a2458ab1d10cee5ac3f42d23a60871600356fc`
Router `25876d1899a17b0252605982ac353123308c1f006194d1e84844a381471d8d25`
Policy set `3f1a19f788389202af79ee50c9149344fa069f407abf09c6fede876617620c79`

## The question

Can a deployable router choose among the frozen Stage 3F.6-A policies well enough to beat simply
**always using the best single deployable policy**? Beating greedy is not the bar — Stage 3F.6-A
already showed `RESOURCE_PRESERVING_V1` does that.

## Answer

**No, not materially.** On fresh HOLDOUT the router lowers mean regret by 1.15 (95% CI −1.86 to −0.38)
with no accuracy change (+0.0012, CI −0.0058 to +0.0085). That is statistically real but below the
predeclared materiality bar (≥ 2.0 regret or ≥ 0.02 accuracy), and it recovers only **11.5%** of the
regret the oracle shows is available. On OOD it is **worse on accuracy** (−0.0102, CI −0.0153 to
−0.0053) and collapses onto RESOURCE_PRESERVING. Router value: **LOW**. Stage 3G stays blocked.

## Data discipline

The Stage 3F.6-C HOLDOUT/OOD were used for Stage 3F.6-A's sealed evaluation and disclosed as not
pristine, so they were not reused. Fresh HOLDOUT (seeds 601–603, levels 0–5) and OOD (seed 611,
levels 6–7) were generated, excluding every topology, record and world state in the prior corpus.
**445 candidates were rejected for topology collision with the prior corpus** — topology hashes are
not seed-unique, so the exclusion was necessary, not decorative.

| | DEV | CAL | HOLDOUT (fresh) | OOD (fresh) |
| --- | --- | --- | --- | --- |
| n | 4000 | 4000 | 6000 | 6000 |

Record, state and topology overlap across all boundaries: **0**. DEV fits, CAL selects the confidence
threshold, HOLDOUT/OOD are structurally unreachable until the evaluation freeze is written.

## Router

Multinomial logistic regression over the 30 `DEPLOYABLE_CORE` features, no simulator, V2B or rollout
features. Target: the minimum-regret available policy per episode, ties kept as a uniform soft target.
A policy that abstained is masked out of the softmax, so it can never be selected. Training is
deterministic (replay hash identical) and takes ~2 s.

The CAL rule (minimise mean regret) selected threshold **0**: the router always routes. Any higher
threshold only moved decisions toward RESOURCE_PRESERVING and raised CAL regret.

Policy-selection accuracy: DEV 0.797 · CAL 0.788 · HOLDOUT 0.789 · OOD 0.830.

## Task performance

| | HOLDOUT acc | HOLDOUT regret | OOD acc | OOD regret |
| --- | --- | --- | --- | --- |
| `ALWAYS_GREEDY` (not deployable) | 0.2697 | 49.14 | 0.2728 | 69.42 |
| **`ALWAYS_RESOURCE_PRESERVING`** | **0.6142** | **25.96** | **0.7515** | **24.27** |
| `ALWAYS_NEXUS_SELECTOR` (85% coverage) | 0.2289 | 51.58 | 0.2458 | 72.06 |
| `RANDOM_LEGAL` control | 0.2275 | 58.30 | 0.2245 | 82.00 |
| **`ROUTED_POLICY_SET`** | **0.6153** | **24.81** | **0.7413** | **24.75** |
| `ORACLE_POLICY_SET` (diagnostic) | 0.7063 | 15.92 | 0.8070 | 16.11 |

Oracle gain captured on HOLDOUT: **1.3%** of the accuracy gap and **11.5%** of the regret gap. On OOD
the router captures a *negative* share (−18.3% accuracy, −5.9% regret).

## Is the routing problem balanced?

No. On HOLDOUT, RESOURCE_PRESERVING is uniquely best in 61.8% of episodes, NEXUS_SELECTOR in 21.5%,
ties 15.2%, OBJECTIVE and THREAT under 1% each. Greedy is strictly better than every deployable policy
in only 7.0% of episodes.

The opportunity is real — NEXUS is uniquely best in a fifth of episodes — but the router cannot find
it. Recall when uniquely best:

| Policy | HOLDOUT | OOD |
| --- | --- | --- |
| RESOURCE_PRESERVING | 0.920 | 0.961 |
| NEXUS_SELECTOR | **0.293** | **0.182** |
| OBJECTIVE_TARGETING (n=45 / 11) | 0.444 | 0.636 |
| THREAT_COVERING (n=44 / 8) | 0.886 | 0.500 |

## Policy collapse

HOLDOUT selection: RESOURCE 84.8%, NEXUS 12.8% — no collapse (RESOURCE's true best-set share is 75.7%).
**OOD selection: RESOURCE 93.1% against an 81.9% true share — `POLICY_COLLAPSE=true`.** On OOD the router
largely learns "pick the cheap action", which is the Forge-cost shortcut Stage 3F.6-A warned about.

## False-selection harm

| | false selections | rate | mean added | p90 | p95 | p99 | worst |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HOLDOUT | 1266 | 21.1% | 42.16 | 119 | 144 | 204 | 260 |
| OOD | 1023 | 17.1% | 50.70 | 162 | 184 | 244 | 386 |

Mistakes are expensive when they happen: HOLDOUT p95 added regret (144) exceeds always-RESOURCE's own
p95 regret (127), which fails the predeclared harm criterion. Net episode count still favours the router
(516 improved vs 298 worsened on HOLDOUT).

## Where the value is concentrated

Gains on HOLDOUT cluster in regimes where NEXUS is more often best: novel states (−8.97 regret, n=599),
high energy (−2.77), unsupported threat (−2.16), critical dependency (−1.87). In familiar states and low
energy the router adds nothing. **This does not transfer:** OOD is entirely low-energy (below the DEV
median) and the same regimes show the router *worse* (unsupported threat +1.62, novel +0.55).

OOD accuracy is *higher* than HOLDOUT for every deployable policy. That is a distribution shift, not
stronger generalisation: OOD levels 6–7 sit in the low-energy regime where cheap actions are
horizon-optimal more often (RESOURCE uniquely best 65.2% vs 61.8%).

## Representation gaps (measured, not fixed)

| Gap | Router errors concentrated? |
| --- | --- |
| `RISK_STATE_GAP` | **yes** — false-selection rate 1.25× overall on HOLDOUT, 1.34× on OOD |
| `OBJECTIVE_STRUCTURE_GAP` | no (1.03×) |
| `TEMPORAL_STATE_GAP` (proxy: late episode) | no on HOLDOUT (0.86×); OOD has no late-episode rows |
| `SPATIAL_STATE_GAP` | not measurable — CORE has no spatial evidence |

## Capacity diagnosis

No predeclared limitation flag fired, so the primary diagnosis is **UNDETERMINED**. The evidence:
no overfitting (DEV–CAL selection gap 0.009), confidence reasonably calibrated (selection ECE 0.065),
the policy set holds real value (CAL oracle regret gain 9.68), and per-feature separability of
NEXUS-best vs RESOURCE-best is weak (best single feature 0.689, `actionSurface.actionTypeEntropy`).
Minority NEXUS recall is 0.30 on CAL — poor, but above the predeclared 0.2 imbalance threshold.

Reading beyond the frozen rules: a linear router over CORE features sees only weak signal for *when*
NEXUS beats RESOURCE, and the concentration of errors in unsupported-threat states points to missing
risk information more than missing model capacity. That is a hypothesis, not an established finding;
no larger model was trained.

## Frozen-rule limitation (disclosed)

The predeclared classification labels OOD `C_ROUTING_EQUIVALENT_TO_BEST_SINGLE_POLICY` because `D_WORSE`
required regret to be significantly worse. OOD accuracy **is** significantly worse. The rule was not
changed after sealed inspection; any reuse should add an accuracy-only "worse" case.

## Stage 3G readiness

| Requirement (predeclared) | Met |
| --- | --- |
| material improvement over best single policy (HOLDOUT) | **no** |
| OOD not significantly worse (regret) | yes |
| HOLDOUT n ≥ 2000 | yes |
| deterministic replay | yes |
| zero leakage | yes |
| acceptable false-selection harm | **no** |
| non-trivial policy diversity (HOLDOUT) | yes |

`READY_FOR_STAGE3G=false`.

## Authority

R0, non-dispatching, shadow-only. Candidate router frozen (`f889b069…`), never promoted. No online
learning, no larger model, no policy added or modified, World State not expanded.

## Reproduce

```bash
npm run stage3f6t:generate
npm run stage3f6t:certify
npm run stage3f6t:check
npm run test:stage3f6t
```
