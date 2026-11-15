# STAGE 3H H-DISC-0 — Pre-registration draft for a future campaign `H-DISC-1`

AUTHORITY: R0 · BASE HEAD `eb75dff8`

**STATUS: DRAFT. Not frozen, not registered, not authorized.** No population identity is fixed here, no block is
allocated, no world is generated, no model is trained and no outcome is accessed. A frozen pre-registration would be a
separate, hash-bound, committed record made only after owner authorization and a GO from the campaign-entry gate
(`H_DISC_0_CAMPAIGN_GO_NO_GO.md`).

## 1. Hypothesis

> **H-DISC.** A public-information, within-menu action-risk discriminator reduces catastrophe introductions compared
> with frozen SK1, by learning relative safety differences among the actions available in the same decision state.

- This is a hypothesis, not a claim of learnability.
- It is tested at **full coverage**, with no abstention.
- A well-powered failure to reject the null would be evidence for a public-information limit in these menus, and would
  be recorded as such. No follow-up is automatic.

## 2. Identities (distinct from every earlier stage)

| item | proposed identity |
|---|---|
| campaign | `STAGE3H-H-DISC-1` |
| policy component | `SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1` |
| kernel identity | `SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V2_CANDIDATE` (includes the SK1.1 defect fixes F1–F9; a new source hash) |
| model | `HDISC_FORGE_PAIRWISE_V1` (a new model hash; nothing reused from `SK1_FORGE_PRIMARY_V1`) |
| contracts | pairwise comparator, safety label and menu ranking contracts, as in `H_DISC_0_ARCHITECTURE.md` |
| observation contract | `STAGE3H_PUBLIC_DECISION_INFORMATION_V1` / `HW1_PUBLIC_PROJECTION_V1`, unchanged |
| allocation namespace | `HDISC1`; a block range to be allocated by a successor allocator at freeze time. **No block numbers are proposed here** |
| class aliases | `HD1E-nnnn` (exploration), `HD1V-nnnn` (validation); opaque; no seed-bearing identifiers in tracked records |
| family split rule | `HDISC1_FAMILY_SPLIT_V1`, a new salt, fixed before any world exists |
| structured exclusions | every block and registry in the SK1 successor context: 114 forbidden blocks including 801–837 and 901–914, the seven sealed registries and the three SK1 registries |

## 3. Populations (planning values, not an allocation)

| population | classes | use |
|---|---|---|
| EXPLORATION | 1,000 | fitting and all model selection, out of fold by origin family |
| VALIDATION | 900 recommended; 600 only with a pre-registered 60% effect (see the statistical plan) | one pass |
| HOLDOUT | 0 | not authorized |

Rules:

- Fresh classes only, generated after the freeze, through the same admission and screening rule as SK1 so that results
  are comparable. That rule screens for classes that stress the comparators; rates do not transfer to an unscreened
  distribution, and the report must say so.
- Exploration and validation are origin-family-disjoint. At least 30 families on the validation side; no family above
  5% of validation classes.
- Eligibility is decided from the public observation and the legal menu only, identically for every arm.
- Validation outcome files are locked from population freeze until the single run.
- All classes are H2 under the SK1 schedule. No statement about other horizons can be made.

## 4. Arms

All arms see identical public observations, identical complete legal menus, identical evaluator definitions, identical
population identities and the same compute accounting.

| arm | policy | role |
|---|---|---|
| A | frozen S0 | comparator |
| B | frozen effective Nexus-else-S0 | comparator |
| C | frozen H-W4 C10 | historical public policy |
| D | frozen SK1, forced choice | **the reference for the primary test** |
| E | frozen SK1, selective (as specified) | reported; abstentions counted and never treated as safe |
| F | proposed H-DISC policy | the candidate |

### Matched controls for mechanism attribution

Arm D is frozen on old exploration data, so F against D confounds four things: new data, a new label, new features and
a new objective. An ablation ladder, trained on the same fresh exploration classes, isolates them one at a time.

| arm | label | information | objective | isolates, against the arm above |
|---|---|---|---|---|
| M0 | catastrophe in any member | SK1 feature set | pointwise | new data only (against D) |
| M1 | **union introduction** | SK1 feature set | pointwise | the label |
| M2 | union introduction | SK1 features **plus per-action contrasts to the menu and to the comparators' public choices** | pointwise | relational information |
| M3a | union introduction | the same per-action descriptors as M2, presented as pairs | **pairwise, antisymmetrised** | **the pairwise objective** |
| M3 = F | union introduction | M3a plus explicit pair-contrast inputs | pairwise | pair-specific inputs |

**The minimum matched control that isolates pairwise within-menu learning is M2 against M3a**: same label, same
information, same learner family, same capacity budget, same compute budget; only the objective differs.

**Prior evidence on this step.** H-W1 compared six matched pairs of linear policies fitted with and without
within-menu centring and saw no safety difference. For an additive score that is expected: pairwise and pointwise
training reach the same rankings. The M2-against-M3a contrast is therefore a real test that may well show nothing, and
M3a must use a pair model that is *able* to be non-additive, or the contrast is vacuous and must be labelled
`NOT_TESTABLE`.

Matching requirements, each recorded in the freeze:

- one learner family across M0–M3;
- an equal capacity budget (for tree ensembles: bags × trees × depth; for another family: parameter count);
- equal tuning effort: the same number of configurations tried by the same pre-registered rule;
- training and inference compute measured and reported per arm.

If capacity or compute cannot be equalised, the difference is reported and the affected contrast is labelled
`PARTIALLY_MATCHED`.

**Attribution status: TESTABLE in design, likely under-powered.** Adjacent contrasts are powered only for large
effects at the planned scale. Outcomes are declared in advance as SUPPORTED, NOT_SUPPORTED or UNRESOLVED; an unresolved
attribution is not a negative finding. If M2 and M3a cannot both be built within the matching rules, the
mechanism-specific attribution is `NOT_TESTABLE` and is reported as such.

## 5. Endpoints (fixed before any world exists)

### Primary policy endpoints

| endpoint | arms | role |
|---|---|---|
| **unique comparator-relative introduction classes at full coverage** (top-choice unsafe rate) | F against D, paired | **the one confirmatory test** |
| catastrophe introductions against S0 | all | Contract A gate for F; reported for all |
| catastrophe introductions against Nexus-else-S0 | all | Contract A gate for F; reported for all |
| full decision coverage | F, D, E | Contract A gate for F |
| mean normalised regret | all | Contract A gate for F against A and B; non-inferiority to D within 0.02 |
| origin-family-clustered uncertainty | every difference | cluster bootstrap, frozen generator |

### Mechanism endpoints

| endpoint | definition |
|---|---|
| correctly ordered safe-versus-unsafe pairs | share of (safe, unsafe) action pairs in a menu where the safe action is ranked above; overall, same type, different type. SK1 baseline: 80% validation, 85% out of bag |
| top-choice catastrophe rate | share of classes whose first-ranked set is catastrophic in some member. SK1 baseline: 8.7% |
| worst-case risk-ordering failures | menus where an unsafe action is ranked first while a safe action exists; and where it is ranked above **every** safe action |
| pairwise score consistency | share of pairs withheld because p(a,b) + p(b,a) ≠ 1 (must be 0 by construction); share of menus with a majority cycle; share with a cycle at the top |
| effect where SK1 formerly ranked incorrectly | on **fresh** classes where frozen D fails: share F gets right (rescue). On the rest: share F breaks (harm). Historical failing classes are not used |
| unseen origin families | every endpoint by family; all validation families are unseen by construction |
| sensitivity to public-equivalent hidden twins | the decision set must be identical across twins (identity audit on every class); share of F's failures that occur on twin worlds only |

The 83 H-W4 failures and the 39 SK1 forced-choice failures were used for diagnostic design. They are not validation
populations and no endpoint is computed on them.

## 6. Decision rule for the future result

Exactly one, fixed now:

| classification | condition |
|---|---|
| `H_DISC_DEV_QUALIFIED` | F meets every Contract A gate: zero introductions against S0 and against Nexus, zero illegal actions, complete coverage, regret gates against both comparators, invariance, replay, compute |
| `H_DISC_MATERIAL_IMPROVEMENT_NOT_QUALIFIED` | the primary paired test rejects H0 and F passes the regret, legality, invariance, replay and compute gates, but Contract A is not met |
| `H_DISC_NO_SUPPORTED_ADVANTAGE` | the primary test does not reject H0 |
| `H_DISC_EXPERIMENT_BLOCKED_OR_INVALID` | an execution-validity, provenance or integrity gate fails |

Stated in advance, so it cannot be softened afterwards:

- A supported reduction with any remaining introduction is **NOT_QUALIFIED**. At the rates under discussion, zero
  introductions in 600 or 900 classes would require a true rate near 0.1% or lower.
- Relative improvement over SK1 is not evidence of absolute safety.
- No result grants execution authority. The component stays R0.
- A negative result does not authorize another campaign.

## 7. Development rules (exploration only)

- Out-of-fold evaluation by origin-family folds for every choice.
- Every tunable — learner configuration, feature subset, the regret tie rule, any margin — is chosen by a rule written
  in the frozen pre-registration and applied to exploration data only.
- The baseline rate, the design effect and the association between F's and D's failures are re-estimated out of fold
  on exploration, and the validation size is confirmed before validation classes are generated.
- A development stop rule: if out-of-fold evidence on exploration does not show F's top-choice unsafe rate below D's on
  the same classes, the campaign stops before validation and is reported as such.
- Evaluator labels are used for training and offline evaluation. They never reach inference.

## 8. Execution validity (as in SK1, unchanged)

Allow-listed reads only; a poisoned privileged view gives identical decisions; zero illegal actions in the audit;
features invariant under D4; every identity test exercised on every validation class; negative controls for handle
order, menu position and hidden health all detected; the inference closure passes an evaluator-free graph audit;
deterministic replay across two passes; a check mode that recomputes and writes nothing.

## 9. One-pass protocol

| step | action | bound by |
|---|---|---|
| 1 | campaign-entry gate returns GO | `readiness/campaign-entry-gate.mjs` |
| 2 | freeze this pre-registration: hypotheses, arms, endpoints, decision rule, tuning rules, analysis code | committed, hash-bound record |
| 3 | allocate the `HDISC1` namespace through the exclusion loader; preflight every block | allocation record |
| 4 | generate and admit EXPLORATION; register identities under opaque aliases | population summary and registry |
| 5 | develop and train all arms on EXPLORATION only | training record with model hashes |
| 6 | generate VALIDATION; lock outcomes; register identities | population summary and registry |
| 7 | freeze the experiment: code, models, populations, rules; all committed at HEAD; no uncommitted dependency | experiment freeze |
| 8 | identity audit on every validation class, without reading outcomes | audit shards |
| 9 | one validation pass; start marker; exclusive result file | result record |
| 10 | check mode; spend ledger; successor exclusions updated | ledger and loader |

No interim look. No candidate replacement. No change of threshold, feature or rule after step 7.

## 10. What a frozen version must add

| missing from this draft | why |
|---|---|
| block range and allocation | not authorized; none is proposed |
| learner family, configuration grid and capacity budget | to be fixed with the owner before the freeze; rules, not post hoc choices |
| the exact relational feature list | must be specified and audited for invariance and public-only inputs |
| re-estimated planning inputs | need fresh exploration data |
| the abstention disposition for arm E | reporting only, but must be declared |
| a GO from the campaign-entry gate | currently NO-GO |

```
FUTURE_MATCHED_ARMS=A S0; B Nexus-else-S0; C C10; D SK1 forced; E SK1 selective; F H-DISC; ablation ladder M0-M1-M2-M3a-M3 (minimum matched control for pairwise learning: M2 vs M3a)
PRIMARY_SAFETY_ENDPOINTS=unique comparator-relative introduction classes at full coverage (F vs D, paired); introductions vs S0; introductions vs Nexus; coverage; mean normalised regret; family-clustered uncertainty
PREREGISTRATION_DRAFT_COMPLETE=true (draft; not frozen, not registered, not authorized)
```
