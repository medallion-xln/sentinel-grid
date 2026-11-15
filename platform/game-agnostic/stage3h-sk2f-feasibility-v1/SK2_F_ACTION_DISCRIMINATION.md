# STAGE 3H-SK2-F — Safe-action discrimination

AUTHORITY: R0 · BASE HEAD `16ae5c21` · labels: READ_ONLY_DIAGNOSTIC, EXISTING_EVIDENCE_ONLY, POST_HOC_EXPLORATORY_ONLY

Machine record: `evidence/SK2F_FEASIBILITY.json`, section `discrimination`. No policy was implemented or trained.

## 1. Four error types, defined

| error | definition |
|---|---|
| RISK_ESTIMATION_ERROR | systematic miscalibration of the catastrophe estimate across menus |
| WITHIN_MENU_RISK_ORDERING_ERROR | a failing forced choice where **no** safe alternative has a lower risk bound than the chosen action: the risk order of that menu is itself wrong |
| RANKING_CONTRACT_ERROR | a failing forced choice where some safe alternative **has** a lower bound (necessarily in the same tier) and lost on the expected-regret order |
| ABSTENTION_DECISION_ERROR | accepting a class whose forced choice fails (false accept), or withholding a forced choice with no observed introduction (false abstain) |

A *safe alternative* is a selectable action outside the chosen set that introduces against neither comparator in any
sampled member world. "Safe" is an evaluator outcome on sampled worlds, not a public fact.

## 2. The recorded attribution is verified

Recomputed from the per-action rows of the tracked SK1.1 matrix, independently of the labels SK1.1 stored:

| | historical validation | recorded in SK1.1 |
|---|---|---|
| forced-choice failing classes | 39 | 39 |
| WITHIN_MENU_RISK_ORDERING_ERROR | **34** | 34 (26 better tier + 8 same tier, higher bound) |
| RANKING_CONTRACT_ERROR | **5** | 5 |
| no safe alternative | 0 | 0 |

The same split holds on exploration, with the frozen model and no training:

| | exploration, out of bag | exploration, in sample |
|---|---|---|
| forced-choice failing classes | 55 | 57 |
| WITHIN_MENU_RISK_ORDERING_ERROR | 48 (87%) | 50 (88%) |
| RANKING_CONTRACT_ERROR | 7 | 7 |
| no safe alternative | 0 | 0 |

Ordering errors are 87% of failures on both family-disjoint populations.

## 3. How the four error types compare

| error type | size | status |
|---|---|---|
| RISK_ESTIMATION_ERROR | expected calibration error 0.026 on validation; estimates conservative for selected actions | NOT SUPPORTED as a systematic problem. That calibration is on catastrophe, not on introductions |
| WITHIN_MENU_RISK_ORDERING_ERROR | 34 of 39 on validation; 48 of 55 out of bag | the principal failure mechanism |
| RANKING_CONTRACT_ERROR | 5 of 39; 7 of 55 | real and minor; **none among accepted decisions** |
| ABSTENTION_DECISION_ERROR, false accept | 2 on validation; 8 out of bag; 3 out of fold | every one is an ordering error underneath |
| ABSTENTION_DECISION_ERROR, false abstain | 259 on validation; 378 out of bag | the coverage cost of the mitigation |

**All accepted failures are ordering errors:** 2 of 2 on validation, 8 of 8 out of bag, 3 of 3 in sample.

## 4. The two accepted validation failures: agreement across bags, wrong order

| | `SK1V-0483` | `SK1V-0615` |
|---|---|---|
| mechanism | WITHIN_MENU_RISK_ORDERING_ERROR | WITHIN_MENU_RISK_ORDERING_ERROR |
| chosen action / best safe alternative | MOVE / MOVE | RETREAT / MOVE |
| estimate: chosen vs best safe alternative | 0.128 vs 0.276 | 0.123 vs 0.227 |
| bags of 10 that rank the safe alternative as lower risk | **0** | **0** |
| safe alternative of the same action type exists | yes | no |
| public features that differ between the two actions | 6 | 16 |

So yes: both reflect an inaccurate relative risk order **despite** unanimous agreement of the ten bags. The ensemble
was not uncertain and wrong; it was confident and wrong.

That is typical, not special to these two classes:

| ordering errors | unanimous across bags | at most 2 of 10 bags prefer the safe alternative |
|---|---|---|
| historical validation (34) | 17 | 24 |
| exploration, out of bag (48) | 31 (among the out-of-bag bags used) | — |

On exploration the chosen unsafe action's bound sits a median 2.6 ensemble spreads below the best safe alternative's.
Bag disagreement therefore cannot flag most of these errors, and refitting the same learner on resampled families
would not correct them. The error is in what the learner learns from these features, or in what the features can
express — not in estimation noise.

## 5. Do public features support telling the chosen action from a safer one?

What existing evidence shows, in both directions.

**In favour of public signal**

| fact | value |
|---|---|
| a safe action exists in the menu | 1,000 of 1,000 exploration classes; 600 of 600 validation classes |
| within-menu AUROC of the frozen estimate on classes it never saw, catastrophe label | 0.835 validation; 0.872 out of bag |
| the same, on the gated introduction label | 0.813 validation; 0.852 out of bag |
| failing classes where the chosen action and the best safe alternative have an identical feature vector | 0 of 55 out of bag; 0 of 57 in sample; 0 of 2 accepted validation failures |

The frozen estimate, never trained for within-menu ranking, already orders a menu far better than chance on unseen
families. And in every failing class the two actions are distinguishable in the features.

**Against, or limiting**

| fact | value |
|---|---|
| menus where the lowest-estimate action is unsafe (introduction label) | 45 of 600 validation; 63 of 875 out of bag |
| failing classes with a safe alternative of the **same action type** | 32 of 39 validation; 38 of 55 out of bag |
| ordering errors that are unanimous across bags | half or more (section 4) |
| menus containing actions with identical 144-feature rows but different introduction outcomes | 4 of 1,000 |
| groups of identical rows with different catastrophe outcomes | 7, across 1,000 menus |

Action type cannot separate most failing pairs: the safe alternative is usually another MOVE. Whatever separates them
has to be relational — where the move goes relative to the rest of the public state.

The four colliding menus are a demonstrated representation limit: those actions differ in the public projection (they
are not in the same symmetry orbit) yet the featurisation gives them identical rows, so nothing learned from these
features can order them. It is small (0.4% of menus) but it is a floor.

**What differs between the unsafe choice and the best safe alternative** (55 out-of-bag failing classes):

| feature group | classes where it differs |
|---|---|
| S0 advisory score features (standardised score, rank, gap to top) | 55 |
| direction relative to resources | 46 |
| direction relative to objectives; to out-of-service entities | 41 each |
| direction relative to hostiles; to threatened entities; distance to nearest hostile after the move | 31 each |
| action type | 31 |

**A hypothesis the two validation failures suggested, checked and not supported.** In both, the unsafe action moves
*away* from the nearest hostile and the safe alternative moves *toward* it. If the model systematically under-rated
retreat-like moves, that would be a fixable bias. On exploration it does not hold:

| displacement actions with bound at most 0.2 (out of bag) | actions | mean estimate | observed catastrophe rate | observed introduction rate |
|---|---|---|---|---|
| moves toward the nearest hostile | 131 | 0.113 | 5.3% | 4.6% |
| no change | 141 | 0.129 | 8.5% | 2.8% |
| moves away from the nearest hostile | 286 | 0.111 | 2.8% | 1.4% |

Moves away from hostiles are the *safest* admissible group. Among failing classes the direction pattern is mixed (9
away-versus-toward, 4 the reverse, 24 the same). Two cases are not a pattern.

### Verdict

**PUBLIC_SAFE_ACTION_IDENTIFIABILITY = NOT_ESTABLISHED.**

- A safe action always exists, but that is evaluator knowledge. It does not show the action is publicly identifiable.
- Public features carry real within-menu signal and are never literally identical for the failing pairs.
- Whether that signal is enough to rank a safe action first in the menus where SK1 fails cannot be decided from
  existing evidence. It needs a learner built for the purpose and a prospective test.

## 6. Proposed future research hypothesis

Not a new risk threshold. A different learning problem.

> **H-DISC.** A public-only action ranker trained for *within-menu discrimination* — fitted on the gated event per
> action (comparator-relative introduction, per comparator), with a pairwise or listwise objective over the actions
> of one menu, and with relational features that describe each action against its menu alternatives and against the
> comparators' choices — has a lower **top-1 unsafe rate** at full coverage than frozen SK1 on fresh, family-disjoint
> DEV classes.

| element | specification |
|---|---|
| primary measure | top-1 unsafe rate: union introduction rate of the first-ranked decision set at full coverage, no abstention |
| comparison | paired with frozen SK1 on the same fresh classes |
| prespecified effect | at least a halving (SK1 planning baseline 6.5%–7.3%), one-sided 95% family-clustered bound on the paired difference below zero |
| size | about 600 fresh validation classes for a halving; about 1,900 for a 30% reduction (`SK2_F_SAMPLE_SIZE_PLAN.md`) |
| secondary measures | pairwise accuracy on same-type safe/unsafe pairs; within-menu AUROC on the introduction label (SK1: 0.81); share of ordering errors that are unanimous across the ensemble; normalised regret against both comparators |
| what changes relative to SK1 | the label (introduction, not class-level catastrophe); the objective (order within a menu, not calibrate across menus); the features (relational contrasts; the four-menu collision must be removed) |
| what does not change | public information only; no new hidden-state disclosure; no change to catastrophe or introduction definitions; R0 authority; Contract A unchanged |
| falsification | no supported reduction on an adequately powered fresh validation. That outcome would be evidence *for* a public-information limit in these menus, which existing evidence cannot provide |

Why this before another selective campaign: a halved top-1 unsafe rate is testable at SK1's scale, and it attacks the
mechanism behind every accepted failure. If it succeeds, the accepted failure rate of any abstention rule built on it
falls with it, and a selective contract at 1% may become reachable. If it fails, a selective contract at 1% is not
reachable by this route and the owner will know why.

Requirements unchanged from earlier stages: a new source and model identity, fresh exploration and validation
populations through the successor exclusion loader, a frozen pre-registration, one validation pass, and separate
owner authorization. Nothing here authorizes it.

## 7. Limits

- All of this is post hoc on one spent validation population and one development population.
- The out-of-bag reading is a diagnostic estimator, not the frozen rule.
- "Safe" always means in the sampled member worlds under the frozen evaluator.
- Feature contrasts are descriptive. A feature that differs is not thereby a feature that predicts.
