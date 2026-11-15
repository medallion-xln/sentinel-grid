# STAGE 3H-SK1.1 — Abstention effectiveness and risk-coverage analysis

AUTHORITY: R0 · BASE HEAD `179922dd` · labels: READ_ONLY_DIAGNOSTIC, SPENT_VALIDATION_POPULATION, POST_HOC_DIAGNOSTIC

Machine record: `evidence/SK1_1_RISK_COVERAGE.json` (from `diagnostics/analyze.mjs`, tracked evidence only).
Source rows: `evidence/SK1_1_DECISION_FAILURE_MATRIX.json`, reconciled exactly with the committed SK1 result.

Everything below describes the 600 spent SK1 validation classes. Nothing was re-evaluated, retrained or re-thresholded.
No number here is a proposed operating point, and none may be used to fit or select a future policy.

## Terms

- **Forced choice** — the kernel's top-ranked decision set on a class, whether or not it recommended it.
- **Accepted** — the kernel recommended (304 classes). **Abstained** — it did not (296 classes).
- **Failing class** — the forced choice introduces a catastrophe against S0 or against Nexus-else-S0 in at least one
  member world (39 classes).
- **Estimate** — the model's catastrophe-risk estimate for the top-ranked action. **Spread** — standard deviation of
  that estimate across the 10 bags. **Bound** — estimate + 1 spread + envelope penalty. The frozen rule recommends
  exactly when the bound is at most 0.2; this holds for all 600 rows.
- Estimates, spreads and bounds are **model outputs**. Introductions and catastrophes are **observed outcomes** of the
  frozen evaluator on the sampled member worlds. A forced choice with no observed introduction is not thereby safe.

## 1. What abstention did

| measure | count |
|---|---|
| classes | 600 |
| accepted / abstained | 304 / 296 |
| failing classes (forced choice) | 39 |
| failing classes withheld by abstention | 37 |
| failing classes accepted | 2 |
| forced choices with no observed introduction that were also withheld | 259 |
| — of those, catastrophic in some member but not an introduction | 8 |
| — of those, no catastrophe observed | 251 |
| abstentions per failing class withheld | 8.0 |

Observed failure rate of the forced choice: **0.66%** among accepted (2/304), **12.5%** among abstained (37/296),
6.5% overall. The price of withholding 37 failing classes was withholding 259 choices on which no introduction was
observed.

## 2. Why 37 of the 39 failing classes sit in the abstention set

**The risk estimate itself did most of the work; the spread added little.** (Second table is POST_HOC_DIAGNOSTIC: it
re-reads the frozen top action's numbers and changes no ranking.)

| score, over all 600 classes | AUROC for "forced choice fails" |
|---|---|
| bound (as frozen) | 0.831 |
| estimate alone | 0.820 |
| spread alone | 0.824 |
| expected regret | 0.671 |

| why the class was not accepted | classes | failing |
|---|---|---|
| estimate alone already above 0.2 | 214 | 33 |
| estimate at most 0.2, pushed over by spread or envelope penalty | 82 | 4 |
| accepted (bound at most 0.2) | 304 | 2 |

Estimate and spread carry nearly the same information here: each alone separates failures about as well as the bound.
The spread term cost 82 extra abstentions and withheld 4 more failing classes (4.9% failing, against 15.4% for the
classes rejected on the estimate alone).

**Failing classes are menus in which even the best-looking action carries elevated estimated risk.**

| top-ranked action | accepted (304) | abstained (296) | failing (39) |
|---|---|---|---|
| estimate, median | 0.107 | 0.230 | 0.258 |
| spread, median | 0.026 | 0.059 | 0.075 |
| bound, median | 0.140 | 0.290 | 0.344 |
| observed: catastrophic in some member | 7 (2.3%) | 45 (15.2%) | 39 |

A class fails only if the chosen action is catastrophic somewhere. The estimator targets exactly that event and is
calibrated on it (section 4), so classes with no low-risk action are where introductions occur. In **none** of the 39
failing classes did any safe alternative meet the frozen criterion. Abstention therefore acts as a detector of hard
menus, not as a detector of a specific wrong choice.

**Inside the abstention set the bound still orders risk, but weakly:** AUROC 0.69 among the 296 abstained classes.

**The mechanism is stable for most classes.** Dropping any one bag changes recommend/abstain in 46 classes (9 accepted,
37 abstained). Neither accepted failing class is among them.

## 3. Descriptive risk-coverage curve — POST_HOC_DIAGNOSTIC

Classes ordered by the frozen bound of the frozen top action. Class-level bounds assume independent classes and are
optimistic under family clustering.

| coverage | classes | largest bound | failing | vs S0 | vs Nexus | catastrophic | observed rate | class-level upper 95% | mean nreg |
|---|---|---|---|---|---|---|---|---|---|
| 10% | 60 | 0.092 | 0 | 0 | 0 | 2 | 0 | 4.87% | 0.157 |
| 20% | 120 | 0.120 | 0 | 0 | 0 | 2 | 0 | 2.47% | 0.131 |
| 30% | 180 | 0.151 | 1 | 0 | 1 | 5 | 0.56% | 2.61% | 0.139 |
| 40% | 240 | 0.175 | 2 | 1 | 2 | 7 | 0.83% | 2.60% | 0.158 |
| **50.7% (frozen rule)** | **304** | **0.199** | **2** | **1** | **2** | **7** | **0.66%** | **2.06%** | **0.182** |
| 60% | 360 | 0.237 | 4 | 2 | 4 | 10 | 1.11% | 2.52% | 0.190 |
| 70% | 420 | 0.273 | 8 | 5 | 8 | 15 | 1.90% | 3.41% | 0.201 |
| 80% | 480 | 0.307 | 14 | 10 | 13 | 23 | 2.92% | 4.52% | 0.212 |
| 90% | 540 | 0.390 | 26 | 21 | 24 | 39 | 4.81% | 6.62% | 0.219 |
| 100% | 600 | 0.638 | 39 | 28 | 37 | 52 | 6.50% | 8.40% | 0.220 |

The first observed failure is the 171st class in this order (bound 0.1475); the longest prefix with no observed failure
is 170 classes (28.3% coverage). That is a description of this population. It is **not** a threshold proposal: choosing
it would be fitting to spent validation outcomes.

Two readings that the curve supports:

1. Risk rises monotonically with the bound beyond the frozen point; the bound is informative across its whole range.
2. No coverage level on this population gives a small upper bound. Even a failure-free prefix of 170 classes carries a
   class-level upper bound of 1.75%. Zero observed failures is weak evidence at this sample size.

## 4. Calibration

| quantity | status | evidence |
|---|---|---|
| risk estimate (per action: catastrophic in at least one member) | **SOURCE-DEFINED METRICS PRESENT** | frozen run: ECE 0.026, Brier 0.198, AUROC 0.762 over 5,304 action estimates; recomputed from the matrix: ECE 0.026 |
| bag-spread bound as a confidence statement | **NOT_VERIFIED** | no source-defined metric exists; it is a heuristic margin and is not assumed calibrated |
| probability that a recommendation *introduces* against a comparator | **NOT ESTIMATED BY THE MODEL** | the estimator targets catastrophe, the gate counts introductions |

Descriptive checks (POST_HOC_DIAGNOSTIC):

- **The estimate is conservative, not optimistic, for the actions the kernel selects.** Among the 304 accepted
  decisions the estimates sum to 32.3 expected catastrophic choices; 7 were observed. Among the 296 abstained, 74.5
  expected against 45 observed. Selecting the lowest-risk action did not produce an optimism bias in this population.
- **Bound versus observed rate.** In 9 of 10 bound bins the observed catastrophe rate is below the mean bound; the
  exception is the top bin (23 actions). This describes direction only and does not verify the bound.
- **Catastrophe is not introduction.** Of the 7 accepted decisions that were catastrophic in some member, 2 were
  introductions; in the other 5 the comparator was catastrophic in the same member world.
- **Within one menu** the estimate orders actions well but not perfectly: mean within-menu AUROC 0.835 over 529 menus;
  in 61 of 600 menus the lowest-estimate action is catastrophic in some member, although every menu contains at least
  one action that never is.
- **Sharpness.** The lowest estimate given to any of the 5,304 actions is 0.035. Of 486 actions whose bound meets the
  criterion, 461 were never catastrophic in any sampled member and 25 were.

## 5. Matched-cohort comparison

Same classes for every policy. SK1 chose which classes to accept; the other policies did not.

| cohort | policy | vs S0 | vs Nexus | failing classes | catastrophic classes | mean nreg |
|---|---|---|---|---|---|---|
| accepted (304) | S0 | 0 | 20 | 20 | 77 | 0.557 |
| | Nexus-else-S0 | 96 | 0 | 96 | 141 | 0.685 |
| | C10 | 8 | 5 | 10 | 37 | 0.330 |
| | **SK1** | **1** | **2** | **2** | **7** | **0.182** |
| abstained (296) | S0 | 0 | 77 | 77 | 118 | 0.566 |
| | Nexus-else-S0 | 97 | 0 | 97 | 153 | 0.562 |
| | C10 | 41 | 53 | 74 | 107 | 0.438 |
| | SK1 forced choice | 27 | 35 | 37 | 45 | 0.260 |

Paired SK1 − C10, family-clustered 95% intervals (the frozen evaluator's bootstrap, reproduced exactly):

| cohort | failing-class rate | catastrophic-class rate | mean nreg |
|---|---|---|---|
| accepted | −0.026 [−0.042, −0.012] | −0.099 [−0.143, −0.057] | −0.148 [−0.179, −0.117] |
| abstained | −0.125 [−0.189, −0.058] | −0.210 [−0.282, −0.135] | −0.178 [−0.222, −0.133] |
| all | −0.075 [−0.112, −0.041] | −0.153 [−0.203, −0.109] | −0.163 [−0.189, −0.136] |

Readings:

- The accepted cohort is easier for C10 too (10 failing of 304, against 74 of 296 on the abstained cohort), so part of
  SK1's low accepted failure rate is selection of easier classes. The paired difference on the same 304 classes remains
  below zero, so it is not only selection.
- The accepted cohort is **not** easy for the comparators: on it Nexus introduces against S0 in 96 classes and S0
  against Nexus in 20.
- **A fallback is not automatically safe.** On the 296 abstained classes S0 introduces against Nexus in 77 and Nexus
  against S0 in 97; S0 is catastrophic in some member in 118 and Nexus in 153.

## 6. Action family, origin family, horizon

| top action type | classes | accepted | abstained | failing | failing accepted |
|---|---|---|---|---|---|
| MOVE | 474 | 249 | 225 | 33 | 1 |
| RETREAT | 63 | 33 | 30 | 5 | 1 |
| RESTORE | 33 | 8 | 25 | 0 | 0 |
| REPAIR | 12 | 3 | 9 | 0 | 0 |
| PROTECT | 9 | 3 | 6 | 1 | 0 |
| BYPASS | 6 | 6 | 0 | 0 | 0 |
| REINFORCE | 3 | 2 | 1 | 0 | 0 |

- **Horizon:** NOT_ESTIMABLE. Every class is H2 by construction.
- **Origin family:** 46 families; 26 contain a failing class and the five worst hold 13 of the 39. The two accepted
  failures are in two different families. Acceptance rate varies widely by family (median 54%, range 0–100%; two
  families have no accepted class).
- **Clustering:** intraclass correlation of the failure indicator across families is 0.009, a design effect of about
  1.11 at 13 classes per family. This is a planning number from a spent population with few events.
- **Out-of-envelope:** 9 classes, 8 abstained, 1 failing (abstained).
- **Expert evidence:** 38 of 39 failing classes are ones where S0 and Nexus disagree on action type, but so are 552 of
  600 classes; no association is supported.

## 7. Assurance arithmetic for the accepted decisions

| quantity | value |
|---|---|
| failing classes among accepted | 2 of 304 (0.66%) |
| class-level one-sided 95% upper bound (Clopper–Pearson) | 2.06% |
| exposure-adjusted, vs S0 (set differs from S0's: 226 decisions, 1 introduction) | upper 95% 2.08% |
| exposure-adjusted, vs Nexus (302 decisions, 2 introductions) | upper 95% 2.07% |
| upper bound had no failure been observed in 304 | 0.98% |

A decision set equal to a comparator's set cannot introduce against that comparator by definition; 78 accepted
decisions equal S0's set and are not evidence about safety relative to S0.

**Development predicted validation.** The tracked SK1 training record (`SK1_TRAINING_RECORD.json`, EXPLORATION, out of
fold, written before validation was opened) gives, at the frozen threshold:

| population | accepted | coverage | failing among accepted | rate |
|---|---|---|---|---|
| EXPLORATION, out of fold | 434 of 1,000 | 43.4% | 3 | 0.69% |
| VALIDATION, one pass | 304 of 600 | 50.7% | 2 | 0.66% |

The two family-disjoint populations agree. This is one replication, not a proof of stability.

## 8. Limits

- One spent population, one frozen model, one threshold, one pass. Nothing here estimates run-to-run variation.
- All alternative-threshold and component readings are post hoc and descriptive.
- "Never catastrophic" means in the sampled member worlds of the class under the frozen evaluator.
- The population was screened to stress the comparators; rates do not transfer to an unscreened distribution.
