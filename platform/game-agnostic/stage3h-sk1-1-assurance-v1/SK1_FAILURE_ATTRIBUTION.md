# STAGE 3H-SK1.1 — Decision-failure matrix and failure attribution

AUTHORITY: R0 · BASE HEAD `179922dd` · labels: READ_ONLY_DIAGNOSTIC, SPENT_VALIDATION_POPULATION, POST_HOC_DIAGNOSTIC

Machine records: `evidence/SK1_1_DECISION_FAILURE_MATRIX.json` (600 rows), `evidence/SK1_1_FAILURE_ATTRIBUTION.json`.
Scripts: `diagnostics/extract-matrix.mjs`, `diagnostics/analyze.mjs`.

The classes analysed here are diagnostic evidence. They are not validation material for any future policy, and no
policy was repaired, tuned or selected with them.

## 1. How the matrix was built

`extract-matrix.mjs` replays the frozen kernel and the frozen C10 policy on the frozen SK1 validation class records and
scores the decision sets with the frozen evaluator — the same path as `infra/run.mjs check`. It generated no world and
no new evaluator label, and it writes only after exact reconciliation:

| reconciled against the committed SK1 result | outcome |
|---|---|
| 600 per-class records (decision hash, kind, forced set, bound, introduction flags, C10 set and flags) | identical |
| policy aggregates: S0, Nexus-else-S0, C10, SK1 forced choice, SK1 as specified (counts, mean nreg, bootstrap bounds) | identical |
| decision digest `a0455655…` | identical |
| 304 accepted, 296 abstained, 39 failing, 37 of them abstained, 2 accepted | identical |

Each row holds: opaque alias, origin family, horizon, menu size; the decision set, action type, introduction and
catastrophe flags and normalised regret of S0, Nexus-else-S0, C10 and the SK1 forced choice; whether SK1 abstained; the
top action's estimate, spread, bound, tier and expected regret; margins to the criterion, to the tier edge and to the
runner-up; leave-one-bag-out stability; selected public features and the evidence summary; safe-alternative counts; a
rule-based failure classification; and one categorical line per menu action.

Tracked rows carry no seed, world hash, block coordinate, utility vector or member identity (tested).
The extraction needs the privileged local class records; the analysis needs only tracked files.

## 2. The 39 failing classes (forced choice)

| split | classes |
|---|---|
| against both comparators / S0 only / Nexus only | 26 / 2 / 11 |
| failure present on the base world / on twin worlds only | 20 / 19 |
| chosen action catastrophic in some members / in every member | 33 / 6 |
| forced set equals S0's set / equals neither comparator's | 7 / 32 |
| top action MOVE / RETREAT / PROTECT | 33 / 5 / 1 |
| accepted / abstained | 2 / 37 |

A safe alternative — an action that introduces against neither comparator in any member — exists in all 39 failing
classes and in all 600 classes.

**Where in the frozen ranking contract the unsafe set overtook the best safe alternative** (rule-based, descriptive):

| stage | classes | accepted |
|---|---|---|
| the risk bound put the unsafe action in a strictly better tier than every safe alternative | 26 | 2 |
| a safe alternative shared the tier but had a higher bound | 8 | 0 |
| a safe alternative shared the tier with a lower bound; the expected-regret order chose the unsafe action | 5 | 0 |

- In **34 of 39** the bound ranked the unsafe choice as safer than every safe alternative.
- In **0 of 39** did any safe alternative meet the frozen criterion.
- Leave-one-bag-out changes the forced set in 11 of 39 failing classes and in 39 of 561 others (28% against 7%).

## 3. Mechanisms and their evidential status

| mechanism | status | evidence |
|---|---|---|
| Illegal or malformed decision | OBSERVED_FACT — not a cause | 0 illegal decisions in 600 |
| Within-menu risk ordering error | OBSERVED_FACT | in 34/39 failing classes the bound ranks the unsafe choice below every safe alternative; in 61/600 menus the lowest-estimate action is catastrophic in some member |
| Systematic under-estimation of risk (miscalibration) | NOT SUPPORTED | estimates are conservative: 32.3 expected against 7 observed catastrophic choices among accepted; ECE 0.026 |
| Ranking contract (tier, then regret) selecting poorly given the estimates | OBSERVED_FACT, minor | 5/39, none accepted |
| Outcome of the chosen action depends on hidden state | CAUSAL_EVIDENCE for the outcome | in 33/39 the same action under the same public state is catastrophic in some member worlds only; members differ only in hidden state by construction |
| Public information cannot identify a safe action | UNRESOLVED | a safe action exists in every class; whether public features can identify it is not shown either way |
| Ensemble disagreement signals the error | SUPPORTED_ASSOCIATION, weak | failing forced sets are less stable under bag removal (28% vs 7%); spread alone has AUROC 0.82 but adds little beyond the estimate |
| Advisory evidence caused or prevented failures | UNRESOLVED here | the committed ablation supports a benefit against Nexus only; this lane ran no new ablation |
| Horizon | NOT_ESTIMABLE | every class is H2 |

Associations compare failing with non-failing classes of one spent population and are not causal.

## 4. The accepted failures

The specified policy's introduction counts are **1 against S0** and **2 against Nexus**. They are three
comparator-relative events in **two unique classes**: one class fails against both comparators, one against Nexus only.

| | `SK1V-0483` | `SK1V-0615` |
|---|---|---|
| origin family | multi_settlement / defended / reach_target | bridge / populated / reach_target |
| menu size, member worlds | 10, 49 | 8, 65 |
| SK1 recommended | MOVE | RETREAT |
| introduces against | S0 and Nexus | Nexus only |
| on the base world | yes | yes |
| recommended action catastrophic in | some member worlds | some member worlds |
| S0's action | REPAIR — catastrophic in some twin members, not on base | MOVE — also catastrophic on base, also introduces against Nexus |
| Nexus's action | REINFORCE — catastrophic in some twin members, not on base | PROTECT — never catastrophic in any member |
| safer comparator | both S0 and Nexus | Nexus |
| C10 on the same class | RETREAT — also introduces against both | the same RETREAT — also introduces against Nexus |
| estimate / spread / bound | 0.128 / 0.046 / 0.174 | 0.123 / 0.024 / 0.147 |
| bag range of the estimate | 0.038 – 0.200 | 0.063 – 0.161 |
| margin to the criterion (0.2) | 0.026 | 0.053 |
| actions meeting the criterion | 1 (the recommended one) | 2 (both sometimes catastrophic) |
| decided by | risk tier | expected regret within the tier |
| runner-up | RETREAT, bound 0.212 — also unsafe | S0's MOVE, bound 0.165 — also unsafe |
| safe alternatives in the menu | 7 (1 never catastrophic) | 4 (all never catastrophic) |
| best-ranked safe alternative | MOVE, estimate 0.276, bound 0.371 | MOVE, estimate 0.227, bound 0.256 |
| bags in which that alternative has lower risk | 0 of 10 | 0 of 10 |
| bags in which the recommended action exceeds 0.2 | 1 of 10 | 0 of 10 |
| leave-one-bag-out: recommend/abstain flips | 0 of 10 | 0 of 10 |
| leave-one-bag-out: forced set changes | 1 of 10 | 0 of 10 |
| outside the numeric envelope | no | no |
| expert evidence | valid; S0 and Nexus disagree on type; SK1's action is neither's | valid; S0 and Nexus disagree on type; SK1's action is neither's |

Public information available to the kernel in both classes: the full public projection, the complete legal menu and
valid evidence from both experts. Both recommended actions are zero-cost moves away from the nearest hostile (public
gradient +1), at public health 100, with no declared uncertain effect and no public hazard at the destination.

### Answers to the Phase 4 questions

| question | `SK1V-0483` | `SK1V-0615` |
|---|---|---|
| Did a safer alternative exist? | yes, 7 | yes, 4 |
| Was it publicly *identifiable*? | not shown | not shown |
| Was the risk estimate understated? | relative to the alternatives, yes: every safe alternative was estimated riskier. Against calibration, not shown: a 13% estimate for an event that occurred is one observation | same: 12% |
| Was uncertainty understated? | the spread gave no warning: 9 of 10 bags under the criterion, no bag preferred a safe alternative. No calibrated claim was attached to the bound, so "understated" cannot be scored | same, more strongly: 10 of 10 bags under the criterion |
| Did the ranking tier hide a relevant difference? | no: it was the only action under the criterion | no: the tier held two actions, both unsafe; every safe alternative was in a worse tier |
| Did the decision rest on an unstable margin? | marginally: one bag exceeds 0.2 and one bag removal changes the forced set; recommend/abstain never flips | no |
| Did the action's outcome vary across public-equivalent states? | yes | yes |
| Observation-contract limitation | demonstrated for predicting this action's outcome; hypothetical for choosing a safe action | same |

### Classification

| label | `SK1V-0483` | `SK1V-0615` |
|---|---|---|
| OBSERVED_FAILURE | yes | yes |
| MODEL_ERROR | SUPPORTED as a within-menu ordering error; NOT SUPPORTED as miscalibration | same |
| RANKING_ERROR | no | no |
| UNCERTAINTY_ERROR | SUPPORTED_ASSOCIATION: ensemble spread did not reflect the ordering error | same |
| PUBLIC_INFORMATION_LIMITATION | demonstrated for outcome prediction only | same |
| UNRESOLVED | whether any public-only estimator can order this menu correctly | same |

Two further facts apply to both and fit none of the labels:

1. **The frozen criterion admitted them knowingly.** It accepts any action whose catastrophe bound is at most 0.2. These
   decisions were accepted at stated bounds of 17.4% and 14.7%. A zero-introduction gate cannot be met by construction
   with a rule that tolerates double-digit estimated risk unless the estimates are far too pessimistic.
2. **They are a smaller residual than the model itself predicted.** The model expected about 32 catastrophic choices
   among the 304 accepted; 7 occurred, 2 of them introductions.

No causal mechanism is claimed for either class beyond the hidden-state dependence of the outcome, which follows from
how member worlds are constructed.

## 5. What is and is not addressable from existing public information

| finding | reading |
|---|---|
| Risk estimates are informative and conservative | supports using them for selective recommendation; does not support a recalibration programme |
| Within-menu ordering fails in a minority of menus, unanimously across bags | a better estimator *might* fix it; this evidence cannot show that one exists |
| Ranking-contract errors are 5 of 39, none accepted | a ranking change alone would not have removed either accepted failure |
| Outcomes are hidden-state dependent in 33 of 39 | zero introductions at full coverage requires robustly safe choices in every class; not shown to be publicly identifiable |
| The criterion's tolerance does not match the gate | a contract question, addressed in `SK1_SAFETY_CONTRACTS.md` |

## 6. Limits

- Post hoc, one spent population, one frozen policy.
- "Safe alternative" and "never catastrophic" refer to the sampled member worlds under the frozen evaluator.
- Two accepted failures are too few to characterise accepted failures in general.
- Rule-based stage labels describe the frozen ranking arithmetic; they are not causes.
