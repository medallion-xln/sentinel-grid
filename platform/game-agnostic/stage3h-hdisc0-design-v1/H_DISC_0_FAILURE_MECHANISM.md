# STAGE 3H H-DISC-0 — The scientific failure mechanism

AUTHORITY: R0 · BASE HEAD `eb75dff8` · labels: READ_ONLY_DESIGN_ANALYSIS, EXISTING_EVIDENCE_ONLY, NOT_AN_H_DISC_PERFORMANCE_RESULT

Machine record: `evidence/HDISC0_DESIGN_EVIDENCE.json` (from `analysis/design-evidence.mjs`; tracked evidence only).

Sources: the spent SK1 validation population (600 classes; verification and description only) and the SK1 exploration
population (1,000 classes; development data, read through the out-of-bag diagnostic). Nothing was trained, and no
candidate, feature, parameter or threshold was chosen from validation outcomes.

## 1. Kinds of statement

Every conclusion below carries one of five labels. They are not interchangeable.

| label | meaning |
|---|---|
| OBSERVATION | what the frozen policy did |
| OFFLINE_EVALUATOR_FACT | an outcome computed by the frozen evaluator on sampled member worlds; unavailable at inference |
| LEARNED_MODEL_ERROR | a disagreement between the frozen model's ordering and evaluator facts |
| PUBLIC_IDENTIFIABILITY | whether a public-information rule can recover the evaluator fact on classes it has not seen |
| CAUSAL_EXPLANATION | why the error occurs |

## 2. The recorded attribution, re-derived

Recomputed from per-action rows, independently of the labels earlier stages stored. All match.

| recorded claim | re-derived | kind |
|---|---|---|
| 34 of 39 forced-choice failures involve within-menu risk ordering | 34 of 39 | LEARNED_MODEL_ERROR |
| 5 of 39 involve the ranking contract | 5 of 39 | LEARNED_MODEL_ERROR (ranking rule, not estimate) |
| 2 unique accepted validation failures | 2 | OBSERVATION |
| every accepted validation failure involved ordering | 2 of 2 | LEARNED_MODEL_ERROR |
| 48 of 55 exploration out-of-bag failures involve ordering | 48 of 55 | LEARNED_MODEL_ERROR |
| all 600 validation classes had at least one evaluator-safe legal action | 600 of 600 (and 1,000 of 1,000 exploration) | OFFLINE_EVALUATOR_FACT |

Definitions: a *forced-choice failure* is a class whose first-ranked decision set introduces a catastrophe against S0 or
Nexus-else-S0 in at least one member world. It is a *within-menu ordering* error when no safe alternative has a lower
risk bound than the chosen action, and a *ranking-contract* error when one does and lost on the regret order.

**The last row is the one most easily over-read.** "An evaluator-safe action exists" is a fact the evaluator knows. It
says nothing about whether public information can find that action.

## 3. Baselines a discriminator would have to beat

The frozen SK1 estimate was never trained on pairs or on the introduction event. Its behaviour on those terms:

| measure | historical validation | exploration, out of bag |
|---|---|---|
| top-choice unsafe rate | 39 of 600 (6.5%) | 55 of 875 (6.3%) |
| top-choice catastrophe rate | 52 of 600 (8.7%) | 66 of 875 (7.5%) |
| safe–unsafe action pairs in menus that have both | 8,174 in 493 menus | 12,849 in 762 menus |
| pairs correctly ordered, all | 80.1% | 85.0% |
| — pairs of the **same** action type | 84.6% (1,661 pairs) | 87.2% (2,523 pairs) |
| — pairs of **different** action types | 79.0% (6,513 pairs) | 84.5% (10,326 pairs) |
| menus with every pair correct | 177 of 493 | 326 of 762 |

For reference on the same validation classes: S0 is unsafe against Nexus in 97, Nexus against S0 in 193, C10 in 84.
Out of fold in development the top-choice unsafe rate was 7.3%.

Two things follow for the design.

- **About one pair in five is mis-ordered**, yet the top choice is unsafe in only one menu in fifteen. Most
  mis-orderings are harmless because they are not at the top. The design must optimise the top of the list, not the
  average pair.
- **Cross-type pairs are both more numerous and worse ordered** than same-type pairs. An earlier report stressed that
  a same-type safe alternative usually exists in failing menus (32 of 39), which is true, but it would be wrong to
  conclude the problem is mainly about telling two MOVEs apart. Most mis-ordered pairs compare different action types.

## 4. Three candidate explanations

### A. Incorrect risk differences between legal actions

**SUPPORTED** — as an observation about the model, not as a cause.

- 34 of 39 failing validation menus and 48 of 55 out of bag: the model gives the unsafe choice a lower risk bound than
  every safe alternative.
- The size of the error is not marginal: on exploration the chosen unsafe action's bound sits a median 2.6 ensemble
  spreads below the best safe alternative's.

### B. Shared modelling bias among the risk-estimator bags

**SUPPORTED as common-mode error. Its cause is not identified.**

| ordering errors on validation (34) | count |
|---|---|
| 0 of 10 bags rank the best safe alternative as lower risk | 17 |
| at most 2 of 10 | 24 |
| a majority of bags prefer the safe alternative | 2 |

On exploration, 31 of 48 ordering errors are unanimous among the out-of-bag bags used.

The bags share one learner, one feature set, one label and overlapping origin families. Their agreement is therefore
not independent confirmation. That the errors are common to the ensemble is established. Whether the common cause is
the learner and its objective (which a different learner could correct) or the features (which no learner on those
features could correct) is **not distinguishable from existing evidence**.

### C. Public-observation equivalence hiding safety-relevant differences

**ESTABLISHED for the outcome of a single world. NOT ESTABLISHED for choosing a robustly safe action.**

| fact | value | kind |
|---|---|---|
| catastrophic actions that are catastrophic in only some public-equivalent member worlds | 1,653 of 2,589 on validation (64%); 2,862 of 4,558 on exploration (63%) | OFFLINE_EVALUATOR_FACT |
| failing choices catastrophic in some members only / in every member | 33 / 6 on validation | OFFLINE_EVALUATOR_FACT |
| failures present only on twin worlds / on the base world | 19 / 20 on validation | OFFLINE_EVALUATOR_FACT |
| classes containing an action safe in **every** sampled member | 600 of 600; 1,000 of 1,000 | OFFLINE_EVALUATOR_FACT |
| menus with actions whose feature rows are identical but whose introduction outcomes differ | 4 of 1,000 | demonstrated representation limit |
| identical feature rows across different classes | 0 | — |

Hidden state decides what a given action does in a given world: nearly two thirds of catastrophic actions are
catastrophic in some public-equivalent worlds and harmless in others. So the outcome *in the world actually being
played* is not publicly predictable, and a discriminator must not be asked to predict it.

That does not make the robust question unanswerable. The labels a discriminator would learn are class-level: "does
this action introduce a catastrophe in *any* member world". Those are fixed by the public state together with the twin
construction, and every class contains an action for which the answer is no. Whether public information suffices to
*find* that action on unseen classes is unresolved. A hard limit is demonstrated only for the four menus whose actions
the current featurisation cannot tell apart.

### Can the three be told apart?

| pair | answer |
|---|---|
| A versus B | not separate hypotheses: B describes how the errors in A are distributed across the ensemble |
| B versus C | **NOT_DISTINGUISHABLE_FROM_EXISTING_EVIDENCE.** Both predict confident, unanimous, wrong within-menu orderings |
| what would separate them | a different learner evaluated on fresh classes (B predicts it can improve; a strict C predicts a ceiling it cannot pass), together with a twin-consistency measurement |

This limitation is recorded, not resolved. H-DISC is a test of B against C as much as it is an attempt to build a
better policy: a well-powered null result would be the first evidence *for* a public-information limit.

## 5. Prior evidence that bears on the hypothesis

H-W1 already tested a neighbouring idea, and it must be weighed honestly. Six of its thirteen sealed candidates were
linear public-only policies fitted *within the menu* (features centred inside each class), paired with otherwise
identical plain candidates. On its 300-class validation (tracked record `stage3h-hw1-dev-v1/evidence/I5_VALIDATION_RESULTS.json`,
spent, verdict NOT_QUALIFIED):

| pair | plain: introductions vs S0 / vs Nexus | within-menu: vs S0 / vs Nexus |
|---|---|---|
| base features, regret rule | 18 / 37 | 17 / 41 |
| full features, regret rule | 18 / 35 | 18 / 36 |
| base features, risk-weighted | 14 / 47 | 14 / 46 |
| full features, risk-weighted | 13 / 44 | 14 / 45 |
| base features, safe-first | 17 / 43 | 15 / 42 |
| full features, safe-first | 18 / 38 | 17 / 39 |

**Within-menu fitting made no visible difference to safety in that family.** This is OBSERVATION on a spent population,
for linear models, on regret and catastrophe-risk labels, without advisory evidence.

What it does and does not imply:

- It is real evidence **against the weakest form of H-DISC**: taking an additive score and merely training it on
  within-menu differences. For an additive model, pairwise and pointwise training search the same family of rankings,
  so no gain should be expected, and none was seen.
- It does not test what H-DISC proposes to change: the label (comparator-relative introduction instead of regret or
  catastrophe), a non-additive pair model, explicit contrasts between actions, and advisory evidence.
- It lowers the prior that the pairwise *objective alone* helps. The ablation ladder in the pre-registration draft is
  built so that this specific step can be seen to fail.

## 6. Summary

| conclusion | status | kind |
|---|---|---|
| The frozen model mis-orders safe and unsafe actions inside a menu | established | LEARNED_MODEL_ERROR |
| Such errors account for most failures and for every accepted failure | established on two family-disjoint populations | OBSERVATION |
| The errors are common to all bags | established | OBSERVATION |
| A safe action exists in every class | established | OFFLINE_EVALUATOR_FACT |
| Outcomes of single worlds depend on hidden state | established | OFFLINE_EVALUATOR_FACT |
| The safe action is publicly identifiable | **NOT ESTABLISHED** | PUBLIC_IDENTIFIABILITY |
| The safe action is *not* publicly identifiable | **NOT ESTABLISHED** | PUBLIC_IDENTIFIABILITY |
| Why the model mis-orders | **UNRESOLVED** | CAUSAL_EXPLANATION |
| Within-menu fitting of a linear model improves safety | not supported (H-W1, six matched pairs) | OBSERVATION |

```
WITHIN_MENU_ORDERING_FAILURES=34/39 validation; 48/55 exploration out of bag; 2/2 accepted validation failures
PUBLIC_SAFE_ACTION_IDENTIFIABILITY=NOT_ESTABLISHED (in either direction)
HIDDEN_STATE_AMBIGUITY=ESTABLISHED_FOR_SINGLE_WORLD_OUTCOMES (64% of catastrophic actions); NOT_ESTABLISHED_AS_A_BAR_TO_ROBUST_CHOICE
```

## 7. Limits

- One spent validation population and one development population, both screened to stress the comparators and both H2.
- The out-of-bag reading is a diagnostic estimator of the frozen ensemble, not the frozen rule.
- "Safe" and "every member" refer to the sampled member worlds under the frozen evaluator, not to all possible worlds.
- The historical 83 H-W4 failures and these 39 SK1 failures informed the design. They are not independent validation
  material for anything that follows.
