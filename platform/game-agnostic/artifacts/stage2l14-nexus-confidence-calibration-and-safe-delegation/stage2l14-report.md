# Stage 2L.14 — Nexus confidence calibration and safe selective delegation

**Status: FAIL** · `NEXUS_CONFIDENCE_OUTCOME = D_CONFIDENCE_DOES_NOT_GENERALIZE`
`FAILURE_MODE = FAILED_GENERALIZATION`
Authority R0 · `canDispatch=false` · `canMutateLiveWorld=false` · Prime remains the decision owner.

> Nexus **does** carry a real self-confidence signal, and it is strong: the cleanest
> region of the calibration split is **0.9832** accurate. But the inherited floor is
> **0.99**, and no supported region reached it on the split that was allowed to
> select. Regions that cleared 0.99 on DEVELOPMENT (0.9917 at n=121) fell to 0.9691
> on a fresh draw. **Zero delegations were authorised.** The floor was not lowered.

## What this stage was asked to decide

Not *"can the threshold be moved until Nexus delegates"* — the opposite. The
question was whether a **genuinely high-confidence Nexus region exists** that
holds up on data it was not chosen on. The 0.99 reliability floor, the 0.01 harm
ceiling and the 0.01 correct-Prime-break ceiling are all inherited unchanged from
Stage 2L.7/2L.10 and are asserted structurally by the certify script, which exits
`2` on `INHERITED_SAFETY_THRESHOLD_WEAKENED` before any measurement runs.

## Three splits, and only one of them may choose

| split | source range | decidable cases | role |
|---|---|---|---|
| `DEVELOPMENT` | `HOLDOUT[0, 14000)` | 5261 | exploration only — may not select |
| `CALIBRATION` | `HOLDOUT[14000, 28000)` | 5232 | selects and freezes the confidence model |
| `FINAL_HOLDOUT` | `HOLDOUT[28000, 42000)` | 5324 | scored **once**, after freezing |

Pairwise overlap is 0 on all three pairs; each split carries its own digest.
`evaluateStage2L14Delegation` throws `STAGE2L14_HOLDOUT_SPLIT_VIOLATION` on any
row that is not `FINAL_HOLDOUT`, and `deriveStage2L14Calibration` throws
`STAGE2L14_CALIBRATION_SPLIT_VIOLATION` on any row that is not `CALIBRATION`.
Both guards run before any early return.

This three-way separation is the whole finding. A conventional two-way split
would have explored on DEVELOPMENT, selected `R≥500000 / M≥300000` at 0.9917, and
scored **0.9927 on the final holdout** — a clean, reportable pass. It would have
been wrong. The middle draw says that same cell is 0.9691.

## The confidence contract

Additive and versioned; Stage 2L.13's signal block is carried through byte-identical.
Sixteen inherited signals plus two added here (`nexusRobustnessScore`,
`nexusNormalizedMargin`). Every one is deterministic, decision-time available and
expert-emitted. No outcome field, no benchmark-derived quantity, no generator
metadata enters it — verified by scan, not by assertion.

Six buckets, three of them **a priori structurally ineligible**: where the expert
disclaims its own basis, it never delegates however well it happens to measure.
That rule is inherited in spirit from Stage 2L.10, where `ORACLE_UNSUPPORTED_HEAD`
measured 1.0 reliability and was refused anyway.

| bucket | calibration n | reliability | eligible | delegates |
|---|---|---|---|---|
| `INELIGIBLE_ABSTAINED` | 103 | 0.0000 | no | no |
| `INELIGIBLE_SEMANTICS` | 0 | — | no | no |
| `INELIGIBLE_UNSTABLE` | 85 | 0.6941 | no | no |
| `OBSTRUCTED` | 2562 | 0.7135 | yes | no |
| `MODERATE` | 2447 | 0.9154 | yes | no |
| `HIGH` | 35 | 0.9143 | yes | no |

## The 25-cell search, and why nothing qualified

The risk/margin ladder was predeclared (`[400k…800k] × [0…400k]`) before any cell
was scored. Best five cells on CALIBRATION:

| `minRisk` | `minMargin` | n | precision | Wilson LB | qualifies |
|---|---|---|---|---|---|
| 500000 | 200000 | 297 | **0.9832** | 0.9658 | no |
| 500000 | 0 | 715 | 0.9818 | 0.9716 | no |
| 600000 | 200000 | 258 | 0.9806 | 0.9607 | no |
| 500000 | 100000 | 505 | 0.9802 | 0.9672 | no |
| 700000 | 0 | 350 | 0.9800 | 0.9635 | no |

Nothing on the grid reached 0.99. `SELECTED = null`, and the frozen parameters
fall back to the **most restrictive** rung on the ladder
(`{minRiskAdjustment: 800000, minUtilityMargin: 400000}`) rather than the
best-measured one — failing closed, not optimistically.

### The generalization table

| `minRisk` | `minMargin` | DEV n / prec | CAL n / prec | HOLDOUT n / prec |
|---|---|---|---|---|
| 500000 | 300000 | 121 / **0.9917** | 162 / 0.9691 | 136 / 0.9926 |
| 500000 | 400000 | 48 / **1.0000** | 72 / 0.9444 | 64 / 0.9844 |
| 600000 | 300000 | 114 / **0.9912** | 144 / 0.9653 | 124 / 1.0000 |
| 600000 | 400000 | 43 / 1.0000 | 64 / 0.9375 | 56 / 1.0000 |
| 700000 | 400000 | 37 / 1.0000 | 54 / 0.9444 | 48 / 1.0000 |
| 800000 | 400000 | 29 / 1.0000 | 35 / 0.9143 | 32 / 1.0000 |

Read the middle column. Every cell that cleared the floor on DEVELOPMENT lost it
on CALIBRATION, and several regained it on the final holdout. That pattern —
high, low, high, at n in the tens to low hundreds — is a region whose true rate
sits somewhere near 0.97–0.98 with sampling noise on either side of it, not a
region that is genuinely ≥0.99. Calling it a pass would be reading the noise.

The `FINAL_HOLDOUT` column is reported here **after** freezing, as a post-hoc
diagnostic. It did not and could not feed selection.

## Final holdout, scored once against the frozen calibration

| quantity | value |
|---|---|
| cases evaluated | 5324 |
| structurally eligible Nexus recommendations | 5126 |
| …of which would move Prime | 2935 |
| eligible under the frozen calibration | **0** |
| Nexus delegations | **0** |
| delegation rate | 0 |
| delegation precision | 0 (undefined on an empty set) |
| conservative precision lower bound | 0 |
| harmful changes / correct-Prime breaks | 0 / 0 |
| harmful opportunities rejected | 172 / 172 (1.0000) |
| beneficial opportunities forgone | 2332 |
| Prime-only accuracy | 0.3995 |
| arbiter accuracy | 0.3995 |
| Nexus-only accuracy (not authorised) | 0.7951 |

Two distinct zeros are reported separately on purpose. 5126 recommendations were
structurally eligible — the expert did not disclaim them. Zero were *authorised*,
because no bucket survived calibration. A report showing only the second number
could not tell the two apart.

## Gates

| gate | result |
|---|---|
| splits disjoint | pass |
| label leakage | none detected |
| confidence model deterministic | pass |
| Nexus self-correctness identifiable | pass |
| reliability ≥ 0.99 | **fail** |
| conservative bound ≥ 0.95 | **fail** |
| minimum delegation support | **fail** |
| utility | **fail** |
| harm ceiling ≤ 0.01 | pass (vacuously — no delegations) |
| Prime protection | pass |
| security regression | pass |

The four failures are all the same fact seen from four angles: nothing delegated.
Per the brief, a zero-delegation implementation **must** fail utility, and it does.
The harm and Prime-protection passes are vacuous and are labelled as such.

## Two things measured and deliberately not acted on

**The added robustness probe is near-useless as a signal.** A multi-axis
value/cost/risk perturbation (±10%, six probes) leaves 98.1% of cases fully
robust, and that "robust" set is 0.8062 accurate against a 0.8041 base rate. It is
retained only as a fail-closed structural gate and is explicitly recorded as
`discriminativeValue: NEGLIGIBLE`. It is not presented as a confidence signal.

**`nexusUtilityMargin` inverts at the top.** Above 3M the expert's own margin is
*negatively* associated with correctness (0.4396). Confidence is carried by
`nexusTopRiskAdjustment`, not by margin. Margin is retained only as a secondary
gate, at the values the ladder declared in advance.

## Adversarial confidence probes

All 13 probes fail closed: unknown signal kind, missing signals, an abstaining
expert, incomplete semantics, instability under perturbation, low robustness,
blockers, contradictions, exact threshold equality, one below and one above
threshold, an unseen bucket name, and a negative margin. An unseen or unmeasured
confidence region delegates under no circumstances. Replay is bit-identical.

## What is and is not established

- Nexus's confidence is **real and measurable** — 0.7135 → 0.9832 across buckets
  is not noise, and it survives from DEVELOPMENT to CALIBRATION as an ordering.
- What does **not** survive is any *supported* region at ≥0.99.
- The limitation is therefore **not** the expert (Stage 2L.13 fixed that), **not**
  the benchmark (Stage 2L.12 grounded it), **not** the arbiter, and **not** the
  confidence contract's expressiveness. It is that the achievable reliability
  ceiling of this expert on this corpus sits near 0.98, below a floor of 0.99.
- Selective Nexus delegation therefore **remains unauthorised**. Prime keeps the
  recommendation on every case.

Per the brief, this result is reported and **not remediated in this run**.

## Reproduction

```
npm run nexus:stage2l14:certify
npm run nexus:stage2l14:check     # byte-identical reproduction
npm run test:stage2l14-confidence-calibration
```

`CERTIFICATION_HASH = 96e10b32d8ca0ae2a36e252c72dd253df6504d331d1d4baa25584077631c6ac3`
`EVIDENCE_DIGEST = 81ad269fc74fcc0d5d3b3052e623a1be8950210ad8d02da691d5fa7eb7bd4bdd`
`CALIBRATION_DIGEST = 80ed9a80d07b94557ff33543bba2c9dbec40c267b61e801d723a0141f4fe0c23`

Portability remains `DIGEST_PRODUCED_SINGLE_PLATFORM`, inherited from Stages
2L.10–2L.13 and recorded unchanged. Stage 2L.14 does not address it.
