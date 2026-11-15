# STAGE 3H H-DISC-1 — Registration-ready prospective protocol

AUTHORITY: R0 · BASE HEAD `1ad0ea5a` · campaign identity `STAGE3H-H-DISC-1`

```
STATUS=REGISTRATION_READY_NOT_FROZEN_NOT_REGISTERED_NOT_AUTHORIZED
PREREGISTRATION_READY=true
PREREGISTRATION_FROZEN=false
VALIDATION_CLASSES_PLANNED=900
```

Machine record: `protocol/HDISC1_PROTOCOL.json`, built and validated by `protocol/protocol.mjs` (`verify` rebuilds it
from tracked records and compares byte for byte). Tests: `protocol/protocol.test.mjs`, 11 of 11 pass.

**This is a fully specified design. It is not a freeze.** It binds no population, allocates no block and no seed,
names no class, and authorizes no training, generation, validation or deployment. A freeze is a separate, committed,
hash-bound record made after owner authorization and a GO from the campaign-entry gate.

Every arm, ladder rung, endpoint, decision class and protocol step is read from the tracked H-DISC-0 documents, and
the tests compare this protocol with those documents directly.

## 1. Hypothesis

> A public-information, within-menu action-risk discriminator reduces catastrophe introductions compared with frozen
> SK1, by learning relative safety differences among the actions available in the same decision state.

A hypothesis, not a claim of learnability. Tested at full coverage, with no abstention.

## 2. Populations — planning values, not an allocation

| population | classes | note |
|---|---|---|
| VALIDATION | **900** fresh DEV classes | fixed by the owner mandate; one pass |
| EXPLORATION | 1,000 fresh DEV classes | subject to the final power and allocation review; a different size is an owner decision recorded in the freeze |
| HOLDOUT | 0 | not authorized |

Rules, unchanged from H-DISC-0: fresh classes only, through the SK1 admission and screening rule; exploration and
validation origin-family-disjoint; at least 30 validation families; no family above 5% of validation; eligibility from
the public observation and legal menu only; validation outcomes locked until the single run; every class is H2.

No block number, seed, world hash, class alias or population identity appears in the protocol (tested).

## 3. Arms — the H-DISC-0 definitions

| arm | policy | role |
|---|---|---|
| A | frozen S0 | comparator |
| B | frozen effective Nexus-else-S0 | comparator |
| C | frozen H-W4 C10 | historical public policy |
| D | frozen SK1, forced choice | the reference for the primary test |
| E | frozen SK1, selective (as specified) | reported; abstentions counted and never treated as safe |
| F | proposed H-DISC policy | the candidate |

All arms see identical public observations, identical complete legal menus, identical evaluator definitions,
identical population identities and the same compute accounting.

Arm E's abstention disposition, now declared: no recommendation is issued; under R0 the human owner or the certified
Arbiter decides without kernel input.

The ablation ladder M0 → M1 → M2 → M3a → M3 is unchanged and governed by `H_DISC_1_MATCHED_ABLATION_CONTRACT.md`.

## 4. Primary endpoint and test

| item | specification |
|---|---|
| endpoint | **paired reduction in unique comparator-relative catastrophe-introduction classes versus frozen SK1 forced choice** (H-DISC-0: the top-choice unsafe rate) |
| unit | a validation class counts once if its first-ranked decision set introduces a catastrophe against S0 or against Nexus-else-S0 in at least one member world |
| comparison | F against D, paired on the same fresh classes, full coverage |
| hypotheses | H0: F's rate is not lower than D's. H1: it is lower |
| exact test | one-sided exact sign (McNemar) test on discordant classes, α = 0.05 |
| effect size | paired difference F − D and the relative reduction, with a two-sided 95% origin-family cluster-bootstrap interval (frozen generator, 10,000 resamples) |
| rejection | **only if** the exact test gives p ≤ 0.05 **and** the one-sided 95% clustered upper bound of the paired difference is below 0 |

Reported separately for every arm, never merged into the primary: **introductions against S0** and **introductions
against Nexus-else-S0** (count, rate, paired difference F − D with interval).

## 5. Absolute qualification — unchanged

Read from the tracked SK1 result record; the validator refuses any change.

| gate | requirement |
|---|---|
| introductions against S0 | 0 |
| introductions against Nexus-else-S0 | 0 |
| complete lawful decision coverage | every admissible class receives a legal action |
| illegal actions | 0 |
| normalised-regret improvement against each comparator | at least 0.02, one-sided 95% family-clustered upper bound below 0 |
| identity and D4 invariance | 0 violations |
| deterministic replay | required |
| compute | median at most 100 ms, maximum at most 1,000 ms per decision |

**Nine hundred classes improve the power to detect a relative effect. They do not make absolute qualification likely.**
More classes make zero introductions harder to observe, not easier.

| true top-choice unsafe rate | probability of zero introductions in 900 classes |
|---|---|
| 6.5% (SK1) | 0 |
| 3.25% (a halving) | 0 |
| 1% | 0.0001 |
| 0.5% | 0.011 |
| 0.2% | 0.17 |
| 0.1% | 0.41 |
| 0.05% | 0.64 |

Even odds of observing zero need a true rate near 0.08%; an 80% chance needs about 0.025%. A supported reduction with
any remaining introduction is NOT_QUALIFIED.

## 6. Power at 900 classes (exact)

Baseline 6.5%; effective classes = 900 ÷ design effect; planning design effect 1.5. "Associated" uses φ = 0.32, the
association observed between C10 and SK1 failures.

| relative reduction | 40% | 50% | 60% |
|---|---|---|---|
| independent failures, design effect 1 | 0.77 | 0.93 | 0.99 |
| independent, **1.5 (planning)** | 0.61 | **0.81** | 0.94 |
| independent, 2 | 0.49 | 0.69 | 0.86 |
| associated, 1 | 0.90 | 0.99 | 1.00 |
| associated, 1.5 | 0.76 | 0.92 | 0.99 |
| associated, 2 | 0.63 | 0.83 | 0.95 |

| | design effect 1 | 1.5 | 2 |
|---|---|---|---|
| smallest relative reduction detectable with 80% power, independent | 41% | 50% | 56% |
| the same, associated | 35% | 42% | 48% |
| expected half-width of the 95% interval for the paired difference, for a true halving (−3.25 points), independent | ±2.0 points | ±2.4 | ±2.8 |
| the same, associated | ±1.7 | ±2.0 | ±2.3 |

Disclosures: under heavier clustering (design effect 2) and independent failures a halving has 69% power. These figures
are for the exact test on effective classes; the added clustered-bound condition can only lower them. Expected counts:
about 58 classes where frozen SK1 fails, about 29 under a halving. Planning inputs come from spent or development data
and are re-estimated on fresh exploration before validation classes are generated; the size stays 900.

## 7. Multiplicity

| family | tests | handling |
|---|---|---|
| confirmatory | 1: F against D on the primary endpoint | α = 0.05, no adjustment |
| comparator-specific safety | introductions against S0; against Nexus; top-choice catastrophe rate | Holm, family α = 0.05 |
| regret | F against C; non-inferiority of F to D within 0.02 | Holm, family α = 0.05 |
| pairwise ordering | safe–unsafe pairs correctly ordered: overall, same type, different type | Holm, family α = 0.05 |
| **mechanism** | the five ladder contrasts | Holm, family α = 0.05, separate from every policy family |
| descriptive | by origin family; rescue and harm; cycles and withheld pairs; twin sensitivity | no test |

Secondary and mechanism families are read inferentially only if the confirmatory test rejects; otherwise descriptively.
The Contract A regret gates against A and B are fixed gates, not members of a family.

## 8. H-DISC mechanism qualification — separate from policy qualification

This analysis asks *why* a difference arises. It never changes the policy classification, and the policy
classification never depends on it.

| label | condition |
|---|---|
| `H_DISC_MECHANISM_SUPPORTED` | M2 against M3a is SUPPORTED |
| `H_DISC_MECHANISM_NOT_SUPPORTED` | M2 against M3a is NOT_SUPPORTED |
| `H_DISC_MECHANISM_UNRESOLVED` | M2 against M3a is UNRESOLVED |
| `H_DISC_MECHANISM_NOT_TESTABLE` | the contrast is NOT_TESTABLE, including a vacuous M3a |
| `H_DISC_MECHANISM_NOT_APPLICABLE` | F did not improve on D |

An F-over-D improvement alone never licenses "pairwise learning caused it".

## 9. Policy decision rule — unchanged from H-DISC-0

| classification | condition |
|---|---|
| `H_DISC_DEV_QUALIFIED` | F meets every Contract A gate |
| `H_DISC_MATERIAL_IMPROVEMENT_NOT_QUALIFIED` | the primary test rejects H0 and F passes the regret, legality, invariance, replay and compute gates, but Contract A is not met |
| `H_DISC_NO_SUPPORTED_ADVANTAGE` | the primary test does not reject H0 |
| `H_DISC_EXPERIMENT_BLOCKED_OR_INVALID` | an execution-validity, provenance or integrity gate fails |

## 10. Stop rules and negative-result rules, fixed before training

| rule | when | condition | consequence |
|---|---|---|---|
| STOP_ENTRY_GATE | before any step | the entry gate is not GO on all seven conditions | nothing begins |
| STOP_SUPPLY | allocation review; each population freeze | 1,000 + 900 family-disjoint classes with 30 validation families and the 5% cap cannot be supplied | stop; a smaller campaign needs a new owner decision and a new freeze |
| STOP_DEVELOPMENT | after training, before validation classes are generated | F's out-of-fold top-choice unsafe count on exploration is not strictly below frozen D's on the same classes | stop before validation; reported as a development-stage negative |
| STOP_VACUOUS_PAIR_MODEL | after training | the trained M3a has no path that splits on both actions | mechanism analysis NOT_TESTABLE; the report says F was not shown to be non-additive in substance |
| STOP_EXECUTION_VALIDITY | audit and validation pass | any validity gate fails, a privileged read, non-deterministic replay, a frozen identity mismatch | result invalid; outcomes not interpreted |
| NO_INTERIM_LOOK | always | one pass, start marker, exclusive result file | a second run is refused |

- **A well-powered null** (re-estimated power for a halving at least 0.8, test does not reject) is recorded as evidence
  for a public-information limit at that effect size in these menus.
- **An under-powered null** is recorded as inconclusive.
- **No automatic follow-up.** No result authorizes another campaign, a larger sample, a changed target or a changed
  model.

## 11. Learner configuration — specified, proposed for owner confirmation

| item | proposal |
|---|---|
| learner | bagged regression-tree ensembles, as the SK1 trainer (10 bags, minimum leaf 20, λ = 1, 32 bins) |
| grid | trees per bag {50, 100, 200} × depth {2, 3, 4} × learning rate {0.05, 0.1} = 18 configurations |
| selection | **one configuration shared by every ladder arm**: the one minimising the sum over the five arms of out-of-fold top-choice unsafe classes; ties to the smaller model, then the smaller learning rate |
| consequence | equal tree budget and equal tuning effort for every arm by construction |
| folds | five origin-family folds |
| randomness | every stream derived from a text label; no numeric seed is stored or chosen |
| feature selection | none |
| tie rule | exact ties are returned as a set; no tie band or margin exists |

## 12. Must be frozen before execution

57 identities. 32 are known now and read from tracked records; 25 are to be bound at freeze.

| known now (read from tracked records) | to be bound at freeze |
|---|---|
| observation and evidence contracts; the four H-DISC contract identities; the H-DISC-0 contract reference and design-document hashes | discriminator inference closure and source hash; encoder schema ids (per-action, pair-relation, context); both model-family implementations |
| frozen SK1: model hash `b479972a…`, model file, ranking parameters, kernel and adapter source hashes, freeze and result hashes | matched ablation contract hash; this protocol's hash; kernel candidate identity |
| frozen C10 model `41ce761c…` | learner configuration actually selected; five trained model hashes; capacity records and structural checks |
| frozen comparator source closure `be7dc481…` (29 protected files, identity only) and frozen evaluator closure `8908c9e4…` | training code, evaluation runner, identity audit and analysis code — **not yet built** |
| Contract A constants; bootstrap generator and resamples | allocation record; family-split parameters; both population summaries and registries; re-estimated planning inputs |
| exclusion loader pins, source hashes, context identity `fd768113…`, 114 forbidden blocks, registry and ledger hashes | **owner:** evidence-bundle manifest; backup acceptance record |
| runtime Node `v26.7.0`, `darwin-arm64` | campaign declaration and gate record; experiment freeze |

A test re-reads every known value from the record it names and fails on any disagreement.

## 13. Sharpenings of H-DISC-0

| | H-DISC-0 | here | label |
|---|---|---|---|
| rejection rule | exact sign test; clustered interval reported | exact test **and** clustered upper bound below 0 | SHARPENED_NOT_CHANGED — can only make rejection harder; the H-DISC-0 power model already assumes a clustering-aware decision |
| M2 against M3a | "same capacity budget, same compute budget; only the objective differs" | equal budgets; three declared unavoidable differences; PARTIALLY_MATCHED at best | SHARPENED_NOT_CHANGED |
| M0 | "new data only (against D)" | the ranking contract changes with the data; PARTIALLY_MATCHED at best | SHARPENED_NOT_CHANGED |
| development stop rule | F's rate not shown below D's | F's out-of-fold count strictly below frozen D's count; no significance requirement | SHARPENED_NOT_CHANGED |
| attribution outcomes | SUPPORTED, NOT_SUPPORTED, UNRESOLVED | each made computable; two labels added for cases described in prose | SHARPENED_NOT_CHANGED |
| capacity and tuning | equal capacity budget; equal tuning effort | one shared configuration | SHARPENED_NOT_CHANGED |
| validation size | 900 recommended; 600 with a 60% effect | 900 | RESOLVED_BY_OWNER_MANDATE |

No arm, endpoint, decision class or protocol step was redefined.

## 14. What remains before a freeze

| item | who |
|---|---|
| implementation identities: discriminator inference closure, encoder schemas, model families | H-DISC-1 implementation, committed and audited from committed source |
| kernel candidate, training code, evaluation runner, identity audit and analysis code | campaign infrastructure, not yet built |
| confirmation of the proposed learner grid and shared-configuration rule | owner |
| final power and allocation review: exploration size, family-split parameters, block and origin-family supply | owner with the allocator; no allocation is made here |
| an issued evidence bundle and a restore-verified backup on a different device | owner |
| a GO from the campaign-entry gate on all seven conditions | gate |
| authorization to freeze, and separately authorization to run | owner |

Until then: `PREREGISTRATION_FROZEN=false`, and no population may be generated.

## 15. Reproduce

```
cd platform/game-agnostic/stage3h-hdisc1-discriminator-v1
node --test protocol/*.test.mjs          # 21 tests
node protocol/protocol.mjs verify        # HDISC1_PROTOCOL_VERIFY_PASS
```
