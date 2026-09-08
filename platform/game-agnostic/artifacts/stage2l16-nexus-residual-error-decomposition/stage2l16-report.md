# Stage 2L.16 — Nexus residual error decomposition and risk-aware reasoning diagnosis

**Status: PASS** (diagnostic) · `NEXUS_RESIDUAL_ERROR_OUTCOME = B_MULTIPLE_BOUNDED_REMEDIABLE_DEFECTS`
Authority R0 · `canDispatch=false` · `canMutateLiveWorld=false` · Prime remains the decision owner.
**Nexus behaviour changed: no.** No threshold was introduced, no floor moved, no remediation was implemented.

> Stage 2L.15 established that confidence mining is exhausted: the residual errors
> are not detectably less stable than the successes. This stage asks what is
> actually wrong. The answer is **not** the mechanism 2L.15 nominated. Risk is not
> the problem — Nexus is *better* in risk-dominated worlds (0.9022) than outside
> them (0.7353), and pricing risk conditionally makes things **worse** (net −309).
> The dominant defect is that Nexus credits a `BYPASS` whenever a substitute
> *exists*, without checking that the substitute is itself delivering.

## Baseline

Stage 2L.15, 2L.14, 2L.13, 2L.12, 2L.11 and 2L.10 all reproduce byte-identically.
Stage 2L.15: `FAIL`, delegation precision 0.989362, 1 harmful change, 94
delegations. Stage 2L.13 accuracy 0.782551 on what 2L.14 later named DEVELOPMENT —
reproduced here as a per-split figure.

## The residual population

15,817 decidable cases across the full holdout (variants 0–42,000).

| population | count |
|---|---|
| Nexus accuracy | 0.790858 |
| Prime accuracy | 0.397357 |
| **TOTAL_NEXUS_WRONG** | **3,308** |
| — of which the expert abstained | 348 |
| — structurally eligible (2L.14 gate) | 693 |
| — **high confidence** (risk ≥ 500k, margin ≥ 200k) | **11** |
| NEXUS_WRONG / PRIME_CORRECT | 693 |
| NEXUS_WRONG / PRIME_WRONG | 2,615 |
| structure–value decoupled wrong | 1,448 |
| RISK_DOMINATED wrong | 515 |
| CYCLE wrong | 321 |
| VALUE_DIFFUSE wrong | 1,659 |

Matched correct controls were found for 99.88% of error cases on family,
objective type, action count, and value/risk/depth bands.

## How the diagnosis was measured, and why it can be trusted

An early draft reimplemented the Nexus scorer so mechanisms could be toggled. It
agreed with the frozen expert on only **98.5%** of cases — enough divergence to
invent or hide a defect — and was discarded. Every probe reported here instead
takes the **frozen expert's own decomposition** and adds one additive delta before
re-ranking. The zero-delta baseline therefore reproduces the expert *by
construction*: `probeBaselineFaithful = true`, and the certify script exits `2` if
it ever is not.

## Error taxonomy

Classification is deterministic, derived from world state and the expert's own
components, and never reads the optimal action or any outcome — it would run
identically at decision time. No case identifier appears anywhere.

| class | dominant (by precedence) | any-label prevalence |
|---|---|---|
| **SUBSTITUTE_MISVALUATION** | **1,385 — 41.9%** | 41.9% |
| **SINGLE_PASS_APPROXIMATION** | **1,318 — 39.8%** | 66.1% |
| OTHER (unclassified) | 348 — 10.5% | 10.5% |
| RISK_UNDERESTIMATION | 100 — 3.0% | **84.6%** |
| MULTIHOP_DEPENDENCY | 43 — 1.3% | 57.3% |
| COST_VALUE_TRADEOFF | 42 — 1.3% | 4.9% |
| THRESHOLD_BOUNDARY | 40 — 1.2% | 1.7% |
| VALUE_DIFFUSION | 18 — 0.5% | 43.5% |
| REDUNDANCY_MISVALUATION | 9 — 0.3% | 8.1% |
| CYCLE_PROPAGATION | 5 — 0.2% | 9.3% |
| ACTION_INTERACTION | 0 | 5.4% |
| BOTTLENECK_MISVALUATION | 0 | 4.7% |

`EXPLAINED_ERROR_SHARE = 0.8948`, `UNCLASSIFIED = 0.1052` (the unclassified are
exactly the 348 abstentions, which have no chosen action to diagnose).

**Prevalence is not causation.** `RISK_UNDERESTIMATION` is present in 84.6% of
errors and is nearly worthless as an explanation — see the probe table.

## Mechanism probes — measured coverage

| mechanism | accuracy | fixes | breaks | net | % of errors fixed |
|---|---|---|---|---|---|
| `M0_FROZEN_BASELINE` | 0.790858 | 0 | 0 | 0 | — |
| **`M1_LIVE_SUBSTITUTE_REQUIRED`** | **0.813049** | 903 | 552 | **+351** | **27.3%** |
| `M3_THRESHOLD_ALIGNMENT` | 0.804324 | 414 | 201 | +213 | 12.5% |
| `M1_M2_COMBINED` | 0.804767 | 990 | 770 | +220 | 29.9% |
| `ALL_MECHANISMS` | 0.802301 | 1,514 | 1,333 | +181 | 45.8% |
| `M2_PROPAGATED_DELIVERY` | 0.791680 | 273 | 260 | +13 | 8.3% |
| `M6_CONFLICT_PRICING` | 0.791048 | 3 | 0 | +3 | 0.1% |
| `M5_AMPLIFICATION` | 0.790858 | 0 | 0 | 0 | 0.0% |
| **`M4_RISK_PROPAGATION`** | 0.771322 | 57 | 366 | **−309** | 1.7% |

Every probe also *breaks* correct cases, because a blunt additive delta is not a
remediation. The breaks column is reported for exactly that reason: it is the
distance between "this mechanism matters" and "this is the fix".

## Phase 4 — risk: the nominated locus is not the defect

| | accuracy |
|---|---|
| RISK_DOMINATED worlds | **0.902203** |
| non-risk-dominated worlds | **0.735286** |

Nexus is 17 points *better* where risk dominates. Accuracy rises monotonically
with aggregate exposure (0.7334 → 0.7375 → 0.7888 → 0.9037 across quartiles), and
the high-confidence error rate is 0.0130 over 849 cases.

The structural asymmetry is real and was confirmed by reading both models: the
objective applies a risk penalty **conditionally** on whether a protector is
delivering, while Nexus prices exposure only for a `PROTECT` action on the target
itself — 95.1% of its errors credit no risk at all. But pricing that
conditionality is measurably harmful (net −309), so:

**`NONLINEAR_RISK_DEFECT_DETECTED = false`.** The asymmetry exists; it is not what
is costing accuracy. Stage 2L.15 nominated `RISK_DOMINATED` because stability was
blind to its errors — a different property from the expert being inaccurate there.

## Phase 5 — cycles and fixed points

| | accuracy |
|---|---|
| worlds containing a cycle (n=804) | **0.600746** |
| acyclic worlds (n=15,013) | 0.801039 |

A 20-point gap, and accuracy stays in the 0.54–0.64 band across every observed
cycle length (6 through 14; this corpus has no cycles of length 2–5).

`FIXED_POINT_REASONING_CANDIDATE = true` — but **`ITERATIVE_DIAGNOSTIC_MARGINAL =
true`**. The propagation probe fixes 273 and breaks 260 for a net of **+13**,
0.39% of the residual population. That satisfies "converges more often" only in
the most literal sense. The boolean must not be quoted without the magnitude, and
the artifact carries the qualifier so it cannot be.

## Phase 6 — value diffusion

| | accuracy |
|---|---|
| diffuse value (Herfindahl < 0.25) | **0.584389** |
| concentrated value | **0.848927** |

Degradation is monotone in the number of value-bearing entities:

| bearers | n | accuracy |
|---|---|---|
| 0 | 554 | 0.9422 |
| 1 | 8,935 | 0.8654 |
| 2 | 2,368 | 0.8252 |
| 7 | 454 | 0.5551 |
| 9 | 473 | 0.5772 |

`VALUE_DIFFUSION_DEFECT_DETECTED = true`. Nexus systematically favours
concentrated value over distributed downstream utility — a 26-point gap. Note it
sits at only 0.5% *dominant* share because more specific mechanisms take
precedence on the same cases; its 43.5% any-label prevalence is the honest figure.

## Phase 7 — ranking errors: rank proximity is misleading

| the true optimal, under Nexus's ranking | share |
|---|---|
| rank 2 | 51.99% |
| rank 3 | 22.20% |
| rank 4+ | 25.81% |

Half the errors put the right answer second — which sounds like a near miss. By
utility it is not:

| severity (loss ÷ optimal-minus-hold spread) | share |
|---|---|
| NEAR_MISS (≤ 0.25) | 11.62% |
| MODERATE (0.25–0.75) | 7.74% |
| **FUNDAMENTAL (> 0.75)** | **80.64%** |

And the decisive number: **73.48% of Nexus's errors choose an action that is worse
than doing nothing.** Median utility loss 469,357.

The two readings are reconciled by a structural fact: **Nexus never ranks `HOLD`.**
It orders interventions only and recommends the top one whenever its own
`finalRelationalUtility > 0` — a threshold on its private scale with no
calibration against the true do-nothing baseline. So "the optimum was second" says
nothing about whether the first choice beat inaction. `rankProximityContradictsSeverity = true`.

## Phase 8 — counterfactual boundaries

Perturbing the expert's own score by a predeclared ladder (1%, 2%, 5%, 10%, 20%):

| | share |
|---|---|
| BOUNDARY_SENSITIVE | 17.75% |
| **DEEP_MODEL** | **82.25%** |

Only 5 of 400 sampled errors flip at 1%. These are not tie-breaking accidents;
they are mis-modelling.

## Phases 10–11 — candidates and feasibility

| candidate | net | % errors fixed | blast radius |
|---|---|---|---|
| **LIVE_SUBSTITUTE_REQUIREMENT** | **+351** | **27.3%** | one predicate in `scoreRelationalUtility` |
| THRESHOLD_ALIGNMENT | +213 | 12.5% | one constant (deliberately set apart in 2L.13) |
| PROPAGATED_DELIVERY_STATE | +13 | 8.3% | the blocked predicate and all derived logic |
| CONFLICT_PRICING | +3 | 0.1% | the benefit term |
| AMPLIFICATION_PRICING | 0 | 0.0% | the benefit term |
| RISK_PROPAGATION | **−309** | 1.7% | the risk term |

`ARBITER_CHANGE_REQUIRED = false`. `CONTRACT_CHANGE_REQUIRED = false`. No candidate
adds a signal, changes a schema, or touches the delegation path.

`NEXUS_099_FEASIBILITY = PLAUSIBLE_WITH_BOUNDED_REMEDIATION`, on the evidence that
a single bounded probe already moves accuracy 0.7909 → 0.8130 and that only 10.5%
of errors are unclassified.

**Two numbers, deliberately kept apart.** `ESTIMATED_REMEDIABLE_ERROR_SHARE =
0.8292` is the share of errors whose *dominant class* is targeted by some
candidate — an upper bound on scope. `MEASURED_ERROR_SHARE_FIXED_BY_BEST_PROBE =
0.2730` is what a probe actually fixed. The gap between them is how much of this
diagnosis is hypothesis rather than demonstration.

And the standing caveat: **raw accuracy is not delegation precision.** Stages 2L.14
and 2L.15 both showed that a *supported region at 0.99* is a far stronger
requirement than an accuracy gain. Nothing here certifies future performance.

## The high-confidence population, separately

Only **11** residual errors are high-confidence under the inherited 2L.14 region.
Their dominant class is `SINGLE_PASS_APPROXIMATION` (8, 72.7%), **not** the
`SUBSTITUTE_MISVALUATION` that dominates overall. With n = 11 this is an
observation, not a rate; the artifact flags
`highConfidenceSampleTooSmallForRates = true`. All 11 carry a full auditable
explanation — components, both rankings, and the objective decomposition of why
the optimum won.

## Security and invariance

Behaviour replay identical on every compared case; ordering invariance holds; no
label leakage; frozen owners unchanged; the diagnostic-discipline scan confirms
this module declares no reliability floor, exports no delegation path, and
reassigns no expert function.

## Conclusion

The residual errors are **not** heterogeneous tail noise, and **not** a deep
reasoning limitation. Two bounded, specific, measured defects account for most of
them — a substitute-liveness check and a threshold alignment, both local edits to
`scoreRelationalUtility` with no contract or arbiter impact. A third mechanism
(propagated delivery) is prevalent but only marginally productive, and the
mechanism Stage 2L.15 nominated (risk) is measurably counterproductive.

Per the brief, the defect is identified and this stage **stops**. No remediation
was implemented.

## Reproduction

```
npm run nexus:stage2l16:certify
npm run nexus:stage2l16:check     # byte-identical reproduction
npm run test:stage2l16-residual-errors
```

`CERTIFICATION_HASH = e341d55f74619411a7f143a7288a6fd02e0b7071ad6904465803204b3f23a86d`
`EVIDENCE_DIGEST = 4d6ab2fd214875d974fc70ff02b4b9f9014a87301a18330b06dd640e237e41c8`

Portability remains `DIGEST_PRODUCED_SINGLE_PLATFORM`, inherited from Stages
2L.10–2L.15 and recorded unchanged.
