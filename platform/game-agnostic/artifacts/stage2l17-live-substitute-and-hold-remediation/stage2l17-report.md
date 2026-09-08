# Stage 2L.17 — Nexus live-substitute validation and do-nothing baseline

**Status: PASS** (expert remediation) · `NEXUS_REMEDIATION_OUTCOME = B_EXPERT_FIXED_DELEGATION_STILL_BELOW_FLOOR`
Authority R0 · `canDispatch=false` · `canMutateLiveWorld=false` · Prime remains the decision owner.
**Safe delegation: not certified.** Expert remediation and delegation are separate verdicts, and only the first passed.

> Nexus goes from **0.790858 to 0.829108** (+3.83 pp), eliminating **605 net errors**
> — 657 fixed against 52 broken. The dead-substitute region improves from 0.8046 to
> **0.9193**, and BYPASS→RESTORE errors more than halve, 925 → 417. Yet delegation
> precision lands at **0.989474** against a 0.99 floor: almost exactly where Stage
> 2L.15 left it (0.989362). Fixing 18% of the expert's errors moved the delegation
> ceiling by 0.0001.

## Baseline

All seven prior certifications reproduce byte-identically. Stage 2L.16 certified,
`DOMINANT_ERROR_CLASS = SUBSTITUTE_MISVALUATION`, `TOP_CANDIDATE =
LIVE_SUBSTITUTE_REQUIREMENT`. Stage 2L.15 delegation precision 0.989362 with one
harmful change. Stage 2L.13 accuracy 0.782551. Ground truth untouched.

## The defect, reproduced before anything was changed

The inherited expert credits a BYPASS whenever a substitute *exists*:

```js
else if (action.kind === 'BYPASS') addressesTarget = substitutes.length > 0;
```

Constructed cases, scored against the frozen world model:

| case | inherited pick | credited benefit | true optimum |
|---|---|---|---|
| substitute exists and delivers | BYPASS | 1,000,000 | HOLD |
| substitute unavailable | BYPASS | 1,000,000 | **BYPASS** |
| substitute starved | BYPASS | 1,000,000 | RESTORE |
| substitute's own dependency unmet | BYPASS | 1,000,000 | RESTORE |
| two substitutes, neither usable | BYPASS | 1,000,000 | RESTORE |

It credits the full downstream value in every case, including the three where the
bypass achieves nothing.

### The subtlety that makes the fix non-obvious

Row two matters more than the rest. **BYPASS sets the substitute's availability to
full**, so a substitute that is down *only because it is unavailable* is exactly
the case the action repairs. Stage 2L.16's diagnostic probe tested "is the
substitute currently delivering" and therefore killed this case — which is why
that probe cost 552 broken cases against 903 fixed.

The correct decision-time question is counterfactual and bounded:

> would this substitute deliver **once its availability is restored**?

answered from canonical state alone: does it have the capacity it needs
(`baseCapacity >= demand`), and is its own prerequisite closure unblocked.
Availability is deliberately excluded. No ground truth enters it.

## The second defect

The expert never ranks HOLD — it orders interventions and separately asks whether
its private score clears zero. But the deeper problem is that its benefit term was
never a *counterfactual delta*: it summed the objective value sitting downstream of
a target whether or not that value was **already flowing**. An intervention on a
healthy chain scored the chain's entire worth.

## The remediation

Two bounded changes to `scoreRelationalUtility`, in a new file. The Stage 2L.13
expert is imported frozen and was not edited; its hash is pinned and checked.

| correction | inherited | remediated |
|---|---|---|
| `LIVE_SUBSTITUTE_REQUIREMENT` | a substitute merely has to exist | at least one has to be able to carry the dependency once available |
| `DO_NOTHING_BASELINE_DELTA` | benefit = all downstream value | benefit = downstream value **not already delivering** |

New additive signals: `nexusSubstituteCount`, `nexusLiveSubstituteCount`,
`nexusSubstituteCoverage`, `nexusBypassSupportValid`, `nexusHoldUtilityEstimate`,
`nexusEstimatedDeliveredValue`, `nexusEstimatedRecoverableValue`,
`nexusGainOverHold`. Every inherited signal keeps its name, meaning and value, so
the Stage 2L.14/2L.15 machinery consumes the block unchanged.

**Faithfulness.** This file reimplements the scorer so mechanisms can be switched
off. A drifting reimplementation would invent or hide an improvement — the trap
Stage 2L.16 hit at 98.5% agreement. The `INHERITED` variant is asserted to
reproduce the frozen expert's recommendation, ranking and every signal on **100%**
of cases, and the certify script exits `2` if it ever does not.

## Ablation — and why "both fixes on" was rejected

| variant | accuracy | fixes | breaks | net | abstentions |
|---|---|---|---|---|---|
| `INHERITED` | 0.790858 | 0 | 0 | 0 | 348 |
| `LIVE_SUBSTITUTE_ONLY` | 0.809825 | 300 | **0** | +300 | 390 |
| `HOLD_DELTA_ONLY` | 0.822533 | 553 | 52 | +501 | 453 |
| `HOLD_ABSTAIN_ONLY` | 0.731808 | **0** | 934 | **−934** | 1503 |
| `HOLD_ONLY` (delta + abstain) | 0.757982 | 455 | 975 | −520 | 1508 |
| **`LIVE_SUBSTITUTE_AND_HOLD_DELTA`** | **0.829108** | **657** | **52** | **+605** | 466 |
| `BOTH` (everything) | 0.764557 | 559 | 975 | −416 | 1521 |

The do-nothing baseline has two separable halves, and measuring them together
would have confounded them. The **delta** half is the single strongest correction.
The **abstention gate** only ever loses.

**Why, and what that does and does not prove.** The Stage 2L.12 corpus is
decidability-filtered: a case is included only when some action strictly beats
holding. HOLD is therefore *never* optimal here — `holdIsNeverOptimal = true`, and
`holdCorrect` is 0 for every variant — so any mechanism that raises abstention can
only convert right answers into wrong ones. That is a limit of what this corpus
can measure, **not** evidence that comparing against inaction is wrong. The
abstention gate's merit remains untested; it would need a corpus containing cases
where holding is correct.

The selected variant is therefore `LIVE_SUBSTITUTE_AND_HOLD_DELTA`, chosen by
measured net, not by taking every switch.

## Blind evaluation on the frozen corpus

15,817 decidable cases. Prime 0.397357.

| | inherited | remediated |
|---|---|---|
| accuracy | 0.790858 | **0.829108** (+3.83 pp) |
| recommendation accuracy | 0.808650 | 0.854277 |
| abstention rate | 0.022002 | 0.029462 |
| total errors | 3,308 | **2,703** |

| defect region | n | before | after |
|---|---|---|---|
| substitute region | 8,688 | 0.736073 | **0.805709** |
| **dead-substitute region** | 2,615 | 0.804589 | **0.919312** |
| live-substitute region | 6,073 | 0.706570 | 0.756792 |

| | before | after |
|---|---|---|
| worse-than-HOLD error rate | 0.137510 | **0.098438** |
| worse-than-HOLD share of errors | 0.657497 | 0.576027 |
| BYPASS→RESTORE errors | 925 | **417** |

Agreement: 657 cases only the remediated expert gets right, 52 only the inherited
one does. Improvement holds on all three splits (DEVELOPMENT 0.7826→0.8213,
CALIBRATION 0.7949→0.8335, FINAL_HOLDOUT 0.7951→0.8325).

## Taxonomy replay — the Stage 2L.16 classifier, unchanged

| class | before | after | delta |
|---|---|---|---|
| **SUBSTITUTE_MISVALUATION** | 1,385 | **517** | **−868** |
| SINGLE_PASS_APPROXIMATION | 1,318 | 1,356 | +38 |
| RISK_UNDERESTIMATION | 432 | 555 | +123 |
| VALUE_DIFFUSION | 21 | 88 | +67 |
| MULTIHOP_DEPENDENCY | 43 | 65 | +22 |
| THRESHOLD_BOUNDARY | 40 | 48 | +8 |
| COST_VALUE_TRADEOFF | 42 | 46 | +4 |
| CYCLE_PROPAGATION | 18 | 19 | +1 |
| REDUNDANCY_MISVALUATION | 9 | 9 | 0 |

Errors eliminated 657, introduced 52, **net 605**. `relabellingOnly = false`:
growth across all other classes totals +263 against 868 removed from the target
class, so this is not the same errors wearing a new label.

**The dominant class changed — and that is arithmetic, not a discovery.**
`SINGLE_PASS_APPROXIMATION` is now largest, but it was already second at 1,318 and
grew by only 38 (2.9%). It was promoted because the class above it shrank. The
certification requires a genuinely new dominant defect to be both *not already
prominent* and *materially grown* before it will report
`F_NEW_DOMINANT_DEFECT_EXPOSED`; neither holds, so the outcome is **B**.

## Fixed-point non-expansion guard

Stage 2L.16 measured iterative propagation at +13 net. Re-measured after this
remediation it is **−93** (166 fixes, 259 breaks) — it became *actively harmful*.
`FIXED_POINT_IMPORTANCE_CHANGED = false`. No iterative or fixed-point reasoning
entered the expert, and a test asserts the source contains no propagation loop.

## Confidence and delegation — inherited methodology, unchanged

Same ladders, same eligibility gate, same Wilson bound (z = 1.6449), same three
disjoint splits, same cross-split consistency guard. DEVELOPMENT explores,
CALIBRATION selects and freezes, FINAL_HOLDOUT is scored once.

Exactly one rule qualified — the same rule Stage 2L.15 found:

`risk >= 400000 & margin >= 100000 & marginVariance <= 20000`
calibration 0.991379 (n = 116), development 0.952941

| final holdout | value |
|---|---|
| Nexus delegations | 95 |
| delegation rate | 0.017844 |
| **delegation precision** | **0.989474** ← floor is 0.99 |
| conservative lower bound | 0.954190 |
| beneficial changes | 94 |
| **harmful changes** | **1** |
| correct-Prime breaks | 1 (rate 0.000188) |
| Prime-only accuracy | 0.399512 |
| Arbiter accuracy | 0.416980 (+1.73 pp) |

**The finding that matters most.** Stage 2L.15 measured 0.989362 with the
inherited expert. This stage measured **0.989474** with an expert that is 3.83
points more accurate and makes 605 fewer errors. A large expert improvement moved
delegation precision by 0.0001, and the failure is still a single harmful change
out of 95. The delegation ceiling is evidently not governed by the expert's
average accuracy.

## Safety

All 15 adversarial probes fail closed and none throws: dead substitutes that look
structurally valid, duplicate substitutes, cyclic substitute relations, malformed
substitute state, missing delivery state, unknown relation schema, malformed and
missing HOLD inputs, NaN and negative semantic fields, extreme cost, value and
risk, an illegal action target, and an empty action set. Replay determinism and
ordering invariance hold. Prime and the arbiter are untouched; Prime reproduces
0.399512 exactly.

Structural gates run before any measurement: frozen owner hashes, expert isolation
(no benchmark import, no ground-truth symbol in code), and inherited thresholds
(0.99 floor, both 0.01 ceilings, Wilson method). Any failure exits `2`.

## Conclusion

The bounded remediation worked, and the diagnosis behind it was correct: the
dominant error class fell by 63% and the two targeted defect regions both improved
materially. Expert remediation **passes**.

Safe delegation does **not**. Precision 0.989474 against 0.99 — one harmful change
short, and essentially unmoved from Stage 2L.15 despite a much better expert. That
is the honest finding to carry forward: whatever governs the delegation ceiling on
this corpus, it is not the expert's overall accuracy.

Per the brief, this result is reported and the stage stops. No further remediation
was attempted.

## Reproduction

```
npm run nexus:stage2l17:certify
npm run nexus:stage2l17:check     # byte-identical reproduction
npm run test:stage2l17-live-substitute-hold
```

`CERTIFICATION_HASH = c0bc3360712a3a51e16fe898bf8cfc2d437a131e5c8b8ae14d4cef61e00c1e2a`
`EVIDENCE_DIGEST = 9e89e0a306b2de6ad2818344fc72af8de96b982a9726fe41542a36f3f691b20c`

Portability remains `DIGEST_PRODUCED_SINGLE_PLATFORM`, inherited from Stages
2L.10–2L.16 and recorded unchanged.
