# Stage 2L.15 — Nexus decision stability, counterfactual consistency and confidence ceiling

**Status: FAIL** · `NEXUS_STABILITY_OUTCOME = B_STABILITY_IMPROVES_CONFIDENCE_BUT_BELOW_FLOOR`
Authority R0 · `canDispatch=false` · `canMutateLiveWorld=false` · Prime remains the decision owner.

> Decision stability is a **real** confidence signal — it lifts out-of-sample
> discrimination from **0.6245 to 0.6744** — and it was enough to put one rule over
> the 0.99 line on the calibration split. Carried to the final holdout, that rule
> delegated 94 times at **0.9894** precision. One harmful change. The inherited
> floor is 0.99, and 0.9894 is below it. **Delegation remains unauthorised.**
> The floor was not lowered, and the statistical method was not changed.

## The question, and the honest answer

Does a correct Nexus recommendation survive legitimate perturbation more often
than an incorrect one? **Yes, measurably — but not where it matters.**

Stability separates correct from wrong in the regions where Nexus was already
visibly unsure. Inside the high-confidence region where delegation would actually
occur, it separates nothing:

| high-confidence region (risk ≥ 500k, margin ≥ 200k), n=274, 4 wrong | correct | wrong |
|---|---|---|
| mean margin variance | 31140 | **30074** |
| mean top-action stability | 999471 | **1000000** |

The four errors in the delegation-relevant region are *more* stable than the
successes. That single table is the stage's finding, and it is why the ceiling did
not move.

## Why Stage 2L.14's probe was useless and this one is not

Stage 2L.14 scaled one field across every entity by the same signed percentage —
a near-monotone transform that left 98.1% of cases trivially "robust" and
separated 0.8062 from a 0.8041 base rate. Every perturbation here is
**heterogeneous**: each entity and each relation receives its own bounded,
deterministically seeded delta, so the ordering is genuinely stressed.

Eight families, 15 probes per case, seeded from a SHA-256 of **world content** —
never the case id, split, variant, topology family, semantic profile or objective
type.

| family | fields | max magnitude |
|---|---|---|
| `ENTITY_VALUE_JITTER` | `objectiveValue` | ±8% |
| `COST_JITTER` | `restorationCost` | ±8% |
| `RISK_JITTER` | `risk`, `protectionNeed` | ±8% |
| `CAPACITY_DEMAND_JITTER` | `baseCapacity`, `demand` | ±6% |
| `AVAILABILITY_JITTER` | `availability` (threshold side held) | ±6% |
| `RELATION_WEIGHT_JITTER` | relation `weight` | ±10% |
| `COMBINED_MILD` | value, cost, risk together | ±5% |
| `ORDERING_PERMUTATION` | none — pure invariance probe | 0% |

**Validated before use.** Across 400 cases × 14 semantic probes, the benchmark's
own optimal action survives the perturbation **99.30%** of the time; objective
identity and graph shape survive 100%. A perturbation that changed the decision
problem would not be a stability probe, so this was measured rather than assumed.
Ground truth is consulted **only** here, for validation; it reaches no signal, no
rule and no delegation. The certify script refuses to run if that ever changes.

The ordering probe is a genuine check, not decoration: the expert is order
invariant on all 15,817 cases, so a flip there would be an expert defect.

## What the stability signals are worth

Nine signals, all integers in micro-units, all computable before correctness is
known. DEVELOPMENT AUROC against a 0.9043 base rate:

| signal | AUROC |
|---|---|
| `nexusMarginVariance` | **0.5642** |
| `nexusCounterfactualAgreement` | 0.5592 |
| `nexusTopActionStability` | 0.5551 |
| `nexusSemanticStability` | 0.5538 |
| `nexusRankingStability` | 0.5421 |
| `nexusRelationSupportStability` | 0.5399 |
| `nexusTop2Stability` | 0.5352 |
| `nexusAbstentionStability` | 0.5000 |
| `nexusUtilityVariance` | 0.4862 |

Every one is weaker than the existing `nexusTopRiskAdjustment` (0.6151). The
**flip rate is nearly worthless** — 81.1% of all errors are perfectly top-stable,
and 7.8% of correct answers are not. Variance, not flipping, carries what signal
there is.

## Phase 7 — the mandatory incremental-information test

Signals chosen on DEVELOPMENT, then measured **out of sample** on CALIBRATION:

| | AUROC |
|---|---|
| existing confidence (`nexusTopRiskAdjustment`) | 0.6245 |
| stability only (`nexusMarginVariance`) | 0.5738 |
| **combined** | **0.6744** |
| incremental over existing | **+0.0499** |

`STABILITY_ADDS_INFORMATION = true`. This is a genuine improvement and is reported
as such — but ordering better is not the same as clearing a floor.

## Phase 8 — 406 predeclared rules, one qualifier

Ladders were fixed before any rule was scored; the risk and margin rungs are Stage
2L.14's, byte for byte. Conjunctions are capped at three signals and every rule is
a readable inequality.

Exactly one rule cleared the inherited criterion on CALIBRATION:

`risk >= 400000 & margin >= 100000 & marginVariance <= 20000`

| split | n | wrong | precision |
|---|---|---|---|
| DEVELOPMENT | 84 | 4 | **0.9524** |
| CALIBRATION | 111 | 1 | **0.9910** |
| FINAL_HOLDOUT | 108 | 1 | 0.9907 |

Note the first row. This is the Stage 2L.14 pattern with the odd draw in a
different position — there it was high, low, high; here it is low, high, high.
Both describe a region whose true rate sits near 0.98 with sampling noise either
side.

**Multiplicity, priced explicitly.** At n=111, a region whose *true* rate is 0.98
has a **34.7%** chance of measuring at or above 0.99 (23.1% at a true 0.975; 50.3%
at 0.985). Across a 406-rule search — even heavily correlated — at least one such
region appearing is the expectation, not a surprise. The neighbourhood agrees:
loosening `marginVariance` from 20000 to 30000 takes n from 111 to 268 and
precision to 0.9813.

## Phase 9 — final holdout, scored once

| quantity | value |
|---|---|
| cases evaluated | 5324 |
| structurally eligible recommendations | 2577 (2435 would move Prime) |
| **Nexus delegations** | **94** |
| delegation rate | 0.0177 |
| **delegation precision** | **0.9894** ← floor is 0.99 |
| conservative lower bound | 0.9537 |
| beneficial changes | 93 |
| **harmful changes** | **1** |
| correct-Prime breaks | 1 |
| harmful opportunities rejected | 171 / 172 |
| Prime-only accuracy | 0.3995 |
| Nexus-only accuracy (not authorised) | 0.7951 |
| Arbiter accuracy | 0.4168 (+1.73 pp) |

The Prime baseline is the inherited certified path and reproduces Stage 2L.14's
0.399512 exactly. An easier Prime would have manufactured uplift out of nothing.

## Gates

| gate | result |
|---|---|
| Stage 2L.14 reproduced | pass |
| perturbation model valid | pass |
| splits disjoint | pass |
| label leakage | none detected |
| stability model deterministic | pass |
| **stability adds information** | **pass** |
| **reliability ≥ 0.99** | **FAIL (0.9894)** |
| conservative bound ≥ 0.95 | pass |
| minimum delegation support | pass |
| utility | pass |
| harm ceiling ≤ 0.01 | pass (0.0002) |
| Prime protection | pass |
| security regression | pass |

One gate failed, and it is the one that matters. Every other requirement was met:
the signal is real, the support is adequate, the harm is within ceiling, the
utility is positive. The stage fails on **0.0006 of precision**.

## Two defects this stage found in its own machinery

Both were caught by the adversarial suite and fixed before certification:

1. **The delegation gate trusted unvalidated stability evidence.** Evidence with
   an unknown schema, evidence produced by the *superseded Stage 2L.14* model, and
   evidence carrying out-of-domain values (negative variance, stability above
   1.0) all delegated. `stage2L15StabilityEvidenceUsable` now validates schema,
   producing model and numeric domain before any threshold is applied. All 15
   probes now fail closed.
2. **The Prime baseline was wrong.** An early draft ranked Prime's action first-by-id
   instead of using the inherited certified path, reporting Prime at 0.0605 rather
   than 0.3995 and inflating apparent uplift roughly sixfold. Corrected to
   `primeRecommendation`, and a test now pins the figure to Stage 2L.14's.

## A guard that was declared but did not fire

Because this stage searches 406 rules against Stage 2L.14's 25, a cross-split
consistency guard was added: a candidate must not be contradicted by DEVELOPMENT.
**Disclosure: it was written after observing the single qualifying rule**, and it
is admissible only because it can refuse a delegation and never create one.

**It was not load-bearing.** The candidate scored 0.9524 on DEVELOPMENT, above the
0.95 requirement, so the guard did not reject it. The rule was frozen, carried to
the holdout, and failed the inherited reliability gate on its own. The Stage 2L.15
verdict rests entirely on inherited criteria. `inheritedCriterionCandidates`
records what the inherited criterion alone would have selected, so either standard
can be applied by the reader.

## Phase 10 — the confidence ceiling

| | |
|---|---|
| highest supported calibration reliability | 0.9910 (n=111) |
| conservative lower bound there | 0.9606 |
| same rule on DEVELOPMENT | 0.9524 |
| same rule on FINAL_HOLDOUT | 0.9907 (n=108) |
| **estimated confidence ceiling** | **0.9606** |
| **limitation class** | **`RESIDUAL_EXPERT_ERROR`** |

The ceiling is reported as the *lower bound*, not the point estimate, because the
point estimate is precisely what a 406-rule search maximised.

`RESIDUAL_EXPERT_ERROR`, not `CONFIDENCE_SIGNAL_LIMITATION`, because of the table
at the top of this report: inside the high-confidence region the errors are
indistinguishable from the successes on every stability signal measured. They are
not unstable, not contradicted, not low-margin, not low-risk. They are simply
wrong, and confidently so. **No confidence rule built from these signals can
exclude them**, because there is nothing to key on. Where the remaining error lives:

| semantic profile | n | accuracy | mean margin variance (correct / wrong) | instability exposes error |
|---|---|---|---|---|
| `VALUE_DIFFUSE` | 42 | **0.5476** | 27447 / 92086 | yes |
| `RISK_DOMINATED` | 982 | 0.8747 | 30760 / 32042 | **no** |
| `BOTTLENECK_WORTHLESS` | 329 | 0.8906 | 23422 / 73226 | yes |
| `VALUE_ON_BOTTLENECK` | 314 | 0.9204 | 26118 / 30105 | **no** |
| `SUBSTITUTE_AVAILABLE` | 242 | 0.9298 | 20185 / 28780 | yes |
| `EXPENSIVE_BOTTLENECK` | 232 | 0.9612 | 24345 / 83282 | yes |
| `CAPACITY_STARVED` | 270 | 0.9704 | 23270 / 47168 | yes |
| `VALUE_ON_LEAF` | 77 | 0.9870 | 24766 / 17749 | **no** |

`VALUE_DIFFUSE` remains the worst regime and its errors *are* unstable — Stage
2L.13's diagnosis holds. But `RISK_DOMINATED`, the largest regime at 982 cases, is
where instability tells you nothing, and it is also where most delegation-eligible
cases sit.

## What is established

- Stability is a real, additive confidence signal: **+0.0499 AUROC out of sample**.
- It is nonetheless **not sufficient**: best supported delegation precision 0.9894
  against a 0.99 floor.
- The binding limitation is **residual expert error that is not observably
  unstable** — reachable by improving the expert, not by improving confidence
  measurement over the current expert.
- Prime keeps the recommendation on all 5,324 holdout cases.

Per the brief, this result is reported and **not remediated in this run**.

## Reproduction

```
npm run nexus:stage2l15:certify
npm run nexus:stage2l15:check     # byte-identical reproduction
npm run test:stage2l15-decision-stability
```

`CERTIFICATION_HASH = 7a7adf020b5e2e7d325d3b6192a23870e4b49b898ef108e3b63124ce13fb1fe9`
`EVIDENCE_DIGEST = f280ecd02e8b8dac6b06b670f8961f8392baf0b020bd77796778e39ce00facc0`

Portability remains `DIGEST_PRODUCED_SINGLE_PLATFORM`, inherited from Stages
2L.10–2L.14 and recorded unchanged. Stage 2L.15 does not address it.
