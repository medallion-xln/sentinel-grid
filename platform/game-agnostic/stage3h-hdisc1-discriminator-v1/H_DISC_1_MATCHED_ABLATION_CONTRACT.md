# STAGE 3H H-DISC-1 — Matched ablation contract

AUTHORITY: R0 · BASE HEAD `1ad0ea5a` · status: **CONTRACT ONLY. No arm exists, nothing is trained, nothing is evaluated.**

Machine-checkable form: `protocol/ablation-contract.mjs` — `HDISC_MATCHED_ABLATION_CONTRACT_V1` (pure; imports nothing).
Tests: `protocol/ablation-contract.test.mjs`, 10 of 10 pass, on synthetic arm records only.

The contract fixes, before any model exists, how the ladder arms must be matched, what a future comparison may
conclude, and what stops a pairwise arm from being an additive ranker under another name.

## 1. The ladder, unchanged

Taken word for word from `H_DISC_0_PREREGISTRATION_DRAFT.md`; a test compares the two.

| arm | label | information | objective | isolates, against the arm above | model family |
|---|---|---|---|---|---|
| M0 | catastrophe in any member | SK1 feature set | pointwise | new data only (against D) | additive control |
| M1 | union introduction | SK1 feature set | pointwise | the label | additive control |
| M2 | union introduction | SK1 features plus per-action contrasts to the menu and to the comparators' public choices | pointwise | relational information | additive control |
| M3a | union introduction | the same per-action descriptors as M2, presented as pairs | pairwise, antisymmetrised | **the pairwise objective** | pair family, no pair-relation inputs |
| M3 = F | union introduction | M3a plus explicit pair-contrast inputs | pairwise | pair-specific inputs | pair family with pair-relation inputs |

Families: additive control `HDISC_ADDITIVE_POINTWISE_TREE_ENSEMBLE_V1`, pair
`HDISC_ANTISYMMETRISED_PAIR_TREE_ENSEMBLE_V1`. One learner family throughout: bagged regression-tree ensembles in one
tree format.

**The essential comparison is M2 against M3a.**

## 2. Nine controlled dimensions

`assertMatchedContrast(armA, armB, records)` compares two future arm records and gives each dimension one status.

| status | meaning |
|---|---|
| MATCHED | equal |
| DIFFERS_BY_DESIGN | the one factor this contrast isolates, and only that |
| UNAVOIDABLE_DIFFERENCE | cannot be equalised; the reason is recorded; the part that *can* be equalised must be |
| MISMATCH | differs although it should not, or cannot be verified |

| # | dimension | what must be equal |
|---|---|---|
| 1 | training information | exploration class-list digest, class count, fold assignment |
| 2 | feature access | per-action input names, pair-relation input names, context input names |
| 3 | native-action menu | observation contract, evidence contract, complete lawful menu |
| 4 | label definitions | label contract, label family, comparator conditioning, evaluator definitions |
| 5 | model capacity | learner family; bags, trees per bag, maximum depth; node count inside that budget |
| 6 | training objective | objective, loss, link |
| 7 | optimisation budget | configurations tried, tuning rule, early-stopping rule, tree budget, leaf-update budget, total training weight, pair sampling rule |
| 8 | randomisation | stream-derivation scheme, bag bootstrap scheme, fold assignment rule |
| 9 | inference budget | shared ceiling; both arms measured and inside it; declared scaling in the menu size |

Overall verdict:

| verdict | condition |
|---|---|
| FULLY_MATCHED | exactly one dimension differs by design; every other is matched |
| PARTIALLY_MATCHED | exactly one differs by design; no mismatch; at least one declared unavoidable difference |
| NOT_TESTABLE | any mismatch, a malformed record, an arm that is not what it claims to be, or a vacuous pair model |

The check fails closed. A record that cannot be verified is a mismatch, not a match.

## 3. M2 against M3a

| dimension | status for a correctly built pair |
|---|---|
| training information | MATCHED |
| feature access | MATCHED — the same per-action descriptors and context; no pair-relation input |
| native-action menu | MATCHED |
| label definitions | MATCHED |
| training objective | **DIFFERS_BY_DESIGN** — pointwise replaced by pairwise antisymmetrised; same loss and link |
| randomisation | MATCHED |
| model capacity | UNAVOIDABLE_DIFFERENCE |
| optimisation budget | UNAVOIDABLE_DIFFERENCE |
| inference budget | UNAVOIDABLE_DIFFERENCE |

**Best reachable verdict: PARTIALLY_MATCHED.** FULLY_MATCHED is not reachable for this contrast by construction.

### The unavoidable differences and how each is accounted

| | difference | accounting |
|---|---|---|
| (a) | The pair model evaluates n(n−1) ordered pairs per menu; the control evaluates n actions | One shared ceiling (median 100 ms, maximum 1,000 ms per decision). Both arms must be measured and inside it. Milliseconds and scorer evaluations per menu are both reported. Claiming linear cost for a pair model is a mismatch |
| (b) | The pair model is fitted on pairs, the control on actions | The matched unit is fixed: the same classes and actions; every unordered pair of selectable actions once (`HDISC_PAIR_SAMPLING_ALL_UNORDERED_PAIRS_CLASS_NORMALISED_V1`); pair weights normalised so each class carries the same total weight in both arms; equal leaf-update budget. Unequal total weight is a mismatch |
| (c) | The pair model reads 2d + k inputs, the control d + k | Equal tree budget (bags × trees × depth) is required. Equal budgets over inputs of different width are not equal function classes; this is stated, not hidden |
| (d) | Antisymmetrisation uses every tree twice with opposite sign and removes its symmetric part | Same accounting as (c): the tree budget is equal, the effective degrees of freedom are not |

An unequal tree budget, an unequal tuning effort, an arm outside the compute ceiling, or an unmeasured arm is a
MISMATCH and makes the contrast NOT_TESTABLE. Only the four items above are accepted as unavoidable.

### The non-vacuity rule

An additive score in pair form reaches exactly the same rankings as a pointwise score. H-W1 saw this: six matched
pairs of linear policies with and without within-menu centring showed no safety difference. So the trained M3a must be
shown to be non-additive **in substance**.

Declared input layout of a pair-family tree, for d per-action descriptors, r pair-relation inputs, k context inputs:

| input indices | content |
|---|---|
| [0, d) | φ_a — the first action |
| [d, 2d) | φ_b — the second action |
| [2d, 2d + r) | ρ_ab — explicit pair-relation inputs (r = 0 for M3a) |
| [2d + r, 2d + r + k) | c — shared menu context |

`hasCrossActionInteraction(parameters)` walks every tree in the format `{f, t, l, r, v}` and returns true only if some
root-to-leaf path splits on an input in [0, d) **and** on an input in [d, 2d). A sum of trees that each look at one
action is additive however many there are, and returns false.

| structural result for the trained M3a | consequence |
|---|---|
| true | the contrast may be tested |
| false | **VACUOUS** — attribution is NOT_TESTABLE |
| not verified | NOT_TESTABLE (fails closed) |

For M3, `hasPairRelationSplit` must also be true, or the pair-relation inputs were never used and the M3a-to-M3 step is
vacuous.

## 4. The other rungs

| contrast | isolates | best reachable verdict | note |
|---|---|---|---|
| D → M0 | new data | PARTIALLY_MATCHED | D is the frozen SK1 kernel, ranked by risk tier and a separate regret head; M0 is ranked by the H-DISC ranking contract. The ranking contract changes together with the data. It is also capacity-matched only if the shared configuration equals the SK1 risk-head budget; otherwise NOT_TESTABLE |
| M0 → M1 | the label | FULLY_MATCHED | |
| M1 → M2 | relational information | FULLY_MATCHED | M2 must read every M1 input plus contrasts; the wider input follows from the isolated factor |
| M2 → M3a | the pairwise objective | PARTIALLY_MATCHED | section 3 |
| M3a → M3 | pair-specific inputs | FULLY_MATCHED | M3 must actually split on a pair-relation input |

Changing two factors in one step is not an isolating contrast and is NOT_TESTABLE.

## 5. What may be claimed

For each contrast the pre-registered paired test and the origin-family cluster-bootstrap interval are applied to the
lower arm against the upper arm. Difference = lower arm's top-choice unsafe rate minus the upper arm's.

| outcome | condition | licensed statement |
|---|---|---|
| SUPPORTED | contrast not NOT_TESTABLE; the test rejects; the clustered interval lies below zero | With the same label, per-action information, tree budget and tuning effort, the isolated factor lowered the top-choice unsafe rate. If PARTIALLY_MATCHED, the unavoidable differences are listed beside the claim |
| NOT_SUPPORTED | the interval includes zero and excludes half of the total F-against-D effect | The factor did not lower the rate, and a contribution as large as half the total effect is excluded |
| UNRESOLVED | the interval includes both zero and half of the total effect | Cannot tell no contribution from half of everything. **Not a negative finding** |
| NOT_TESTABLE | arms not matched, not built, or the pair model is vacuous | No statement about the factor |
| NOT_APPLICABLE_NO_TOTAL_EFFECT | F did not improve on D | Nothing to attribute |

**An improvement of F over D, however large, never licenses the statement that pairwise learning caused it.** F
differs from D in data, label, information, objective and pair-specific inputs at once. Only M2 against M3a speaks to
the pairwise objective, and only at the strength its verdict allows.

At 900 validation classes the adjacent contrasts are powered only for large effects. UNRESOLVED is the likely outcome
for a modest contribution.

## 6. Sharpenings of H-DISC-0 (definitions unchanged)

| | H-DISC-0 text | here | label |
|---|---|---|---|
| M2 against M3a | "same label, same information, same learner family, same capacity budget, same compute budget; only the objective differs" | equal tree budget and a shared compute ceiling; three differences cannot be removed and are declared; best reachable verdict PARTIALLY_MATCHED | SHARPENED_NOT_CHANGED |
| M0 | "new data only (against D)" | the ranking contract changes together with the data; PARTIALLY_MATCHED at best | SHARPENED_NOT_CHANGED |
| attribution outcomes | "SUPPORTED, NOT_SUPPORTED or UNRESOLVED" | each made computable; NOT_TESTABLE and NOT_APPLICABLE_NO_TOTAL_EFFECT added as labels for cases H-DISC-0 described in prose | SHARPENED_NOT_CHANGED |
| equal capacity and tuning | "an equal capacity budget … equal tuning effort" | one configuration shared by all ladder arms (protocol, proposed for owner confirmation) | SHARPENED_NOT_CHANGED |

H-DISC-0 already states that a contrast whose capacity or compute cannot be equalised is PARTIALLY_MATCHED. No arm was
redefined.

## 7. Tests

| test | shows |
|---|---|
| ladder equals the H-DISC-0 text | no arm was redefined |
| a correctly built M2 / M3a pair | objective differs by design; three unavoidable; verdict PARTIALLY_MATCHED |
| each of nine dimensions perturbed alone | caught as MISMATCH; no other dimension disturbed |
| an unavoidable difference dressed as matched | linear cost claimed for a pair model, no pair sampling rule, unmeasured compute, unnormalised pair weight: all MISMATCH |
| vacuous or unverified M3a | NOT_TESTABLE |
| an additive ranker renamed M3a | refused: the record does not conform to its arm |
| structural check on hand-written trees | one-action trees are additive; a path through both actions is not |
| the other rungs | three can be fully matched; the step from D cannot |
| attribution | the outcomes are distinct; an F-over-D gain licenses nothing about pairwise learning |
| purity | no import; family and label identifiers as fixed |

```
MATCHED_ABLATION_CONTRACT=HDISC_MATCHED_ABLATION_CONTRACT_V1 (five rungs unchanged; nine controlled dimensions; fail-closed)
M2_VS_M3A_CONTRAST_VALID=VALID_IN_DESIGN_AT_MOST_PARTIALLY_MATCHED (three declared unavoidable differences); NOT_TESTABLE if the trained M3a has no cross-action path
```
