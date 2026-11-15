# Stage 3H scientific adjudication and failure-mechanism diagnosis

Development-only evidence. No sealed world was generated, no campaign ran, no registration was activated, and V4 was
not reanalysed. Every number below comes from this lane's DEV runs (`dev-runs/`, `evidence/`) unless it is marked as a
published V4 aggregate.

```
=== SENTINEL GRID STAGE 3H SCIENTIFIC FAILURE ANALYSIS ===

V4_RESULT_ADJUDICATED=true (evidence/ADJUDICATION_7c41ba89.json: BOUNDED_SELECTOR_NOT_QUALIFIED accepted as final)
V4_EVIDENCE_UNCHANGED=true (57 tracked V4 evidence files byte-identical to e46329cc; lane status clean)
V4_REANALYSIS_PERFORMED=false

REPLICATED_REGRET_BENEFIT=true (published: all four primaries MATERIAL_BENEFIT in 10/10 panels; reproduced on 20 DEV panels)
IDENTITY_FAILURE_ACCEPTED=true
CATASTROPHE_VETO_FAILURE_ACCEPTED=true
BEST_OF_GAP_FAILURE_ACCEPTED=true

IDENTITY_ROOT_CAUSE=NEXUS_SELECTOR_LEXICAL_HANDLE_TIE_BREAK (stage3h-canonical-v1/nexus-selector-v1-port.mjs: among actions of the preferred type, the lexically smallest action handle wins; native handles are SHA-256 forgeActionKey digests, so the pick is an arbitrary hash order; predicted 19,317/19,317 + 218/218 picks exactly)
IDENTITY_POLICY_DEPENDENCE=NEXUS_ONLY (S0 0/25,676 changes; abstention/fallback 0 changes; entity renaming 0; order-preserving relabel 0; handle-only relabel reproduces the full effect). Two channels: the selector R at H0 (R = N) and the comparator N at H2 (R = S0 is invariant, so the R-N nuisance at H2 is entirely the comparator's)
IDENTITY_TRANSFORM_VALIDITY=VALID_SEMANTICS_PRESERVING_BIJECTION_ORDER_REVERSING (no leaks, only identifier fields change, S0 features and Nexus rationale codes invariant; its reverse numbering flips 98.9% of multi-member tie classes, a worst case for a lexical tie-break, but random relabels still give about half the effect and exceed 0.02 at H0)

H2_SAFETY_MECHANISM=S0_MOVE_FORGOES_MAINTENANCE (at H2, R = S0; in 39/12,700 DEV H2 worlds S0's objective-progress MOVE is catastrophic while Nexus's PROTECT/REPAIR/REINFORCE is safe; deficit infrastructureHealth/restoredDependencyValue, regret 100-156, no terminal events, no S0 tie sets). Mirror class: Nexus PROTECT catastrophic and S0 safe in 2,865 H2 worlds (about 73x as frequent)
PUBLIC_OBSERVABILITY=PARTIAL_INSUFFICIENT (S0's catastrophe label flips under single-entity hidden-health twins with a byte-identical public view and identical decisions in 28/39 introduction worlds; held-out introduction cells all contain reverse failures: 20 vs 1,435; risk-indicator AUC 0.38-0.75 and unstable)
SAFETY_GUARD_FEASIBILITY=NOT_FEASIBLE_AT_ZERO_INTRODUCTION (49 public guards: only one created no introduction vs S0 on EXPLORE, and on held-out CHECK it avoided 3/20 introductions vs N while creating 2 vs S0; broad guards create 61-590 introductions vs S0 for 1-8 avoided)

BEST_OF_GAP_MECHANISM=HORIZON_ONLY_WRONG_ARM (per world R-min(B,N) = HARM_B at H0 + HARM_N at H2 exactly; the wrong arm is chosen in 4.2% of worlds at about 0.32 nreg each; DEV mean 0.0134, frozen uppers 0.0067-0.0240, fail 5/10 DEV panels, as in V4)
REGRET_SAFETY_TRADEOFF=CONFIRMED (a 35-cell public partition cuts the held-out best-of gap 0.0134 -> 0.0079 and improves nreg by 0.0054 but creates 3 introductions vs S0; identity-free H0 tie-breaks raise HARM_N/best-of gap above 0.02 in 8-10/10 panels)

DIAGNOSIS_CLASSIFICATION=B. NEW_SELECTOR_RESEARCH_REQUIRED
PROSPECTIVE_CORRECTION_NEEDED=true (identity-free Nexus tie resolution, applied to the selector AND the Nexus comparator; necessary but not sufficient)
NEW_CONFIRMATORY_REGISTRATION_REQUIRED=true (for any future claim; none is proposed now)

BOUNDED_SELECTOR_QUALIFIED=false
FULL_STAGE3H_CERTIFIED=false
CANONICAL_MOE_GAIN=NOT_ESTABLISHED

NEW_SEALED_WORLDS_GENERATED=false
NEW_CAMPAIGN_EXECUTED=false

STAGE3I_STARTED=false
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

NEXT_EXACT_SCIENTIFIC_ACTION=Owner decision on whether to open a DEV-only selector research question (no registration): an identity-free Nexus tie resolution adopted in both the selector and its Nexus comparator, plus a public H2 maintenance-risk model, to be shown on fresh DEV blocks (not 951/952) to meet all three failed criteria held-out. Before any such work, the owner must also decide whether zero introductions against both comparators is a satisfiable requirement under the documented public-information limit.
```

## Phase 1: owner adjudication

`evidence/ADJUDICATION_7c41ba89.json` records the owner's adjudication from the session instruction (not a signature):

| Item | Value |
|---|---|
| Decision value | STRONG_REPLICATED_POSITIVE_EVIDENCE |
| Identity invariance | FAILED |
| Catastrophe veto vs N | FAILED |
| Best-of gap | FAILED |
| Bounded selector qualification | NOT_QUALIFIED |
| Full canonical Stage 3H certified | false |
| Independent review | false |
| Canonical MoE gain | NOT_ESTABLISHED |

The record states that passing regret comparisons cannot override the three failed requirements: the criteria are
conjunctive. The small best-of-gap exceedances are valid failures, and no threshold is relaxed.

The adjudication script read only git metadata. It checked that the evidence commit is an ancestor of HEAD, that the V4
lane has no working-tree change or diff against `e46329cc`, and that all 57 tracked evidence files hash to their
committed blobs.

## Development populations

| Set | Scheduled | Admitted | Rejected | Frozen-lock cross-check |
|---|---|---|---|---|
| DEV288 (permitted OPEN development worlds) | 288 | 288 | 0 | 288/288 identical |
| FRESH_EXPLORE (block 951) | 12,768 | 12,691 | 75 validator, 2 menu | 795/795 identical |
| FRESH_CHECK (block 952) | 12,768 | 12,697 | 70 validator, 1 menu | 795/795 identical |

Both fresh blocks follow the frozen V3 population design. No fresh world matched any of the 9,407 prior world hashes
or any V4 ledger hash; the comparison used hashes only.

Applying the registered estimator code to the 10 fresh DEV panels reproduces the V4 failure pattern without reading
any V4 row:

| | DEV (frozen rule) | V4 (published) |
|---|---|---|
| Primaries | material in 10/10 panels | material in 10/10 panels |
| Max IDENTITY upper per panel | 0.084–0.122 | 0.075–0.119 |
| Best-of gap | fails 5/10 (0.0209–0.0240) | fails 5/10 (0.0205–0.0232) |
| Introductions vs N | 39, all at H2; zero-introduction passes 1/10 panels | 35, all at H2; passes 1/10 panels |

## Phase 2: identity invariance

### Mechanism

`nexusRelationalSelector` ranks actions by a fixed type preference and then compares `a.actionKey < b.actionKey`. On
native views the handle is `forgeActionKey`, a SHA-256 digest of `[type, actor, target, parameters]`. Whenever the
preferred type has more than one offered action, the choice among them is therefore an arbitrary hash order.

- **Frequency.** This happens in 2,487 + 2,451 fresh worlds (classes of 2–4 actions). In about 80% of those classes the
  members have different utilities.
- **Original picks.** For targeted actions the canonical-frame menu order equals the handle order, so the original
  pick is always the first class member in menu order (100%).
- **O-2R.1 twin picks.** O-2R.1 numbers handles `opaque-(n-i)` in reverse menu order, so the twin picks the last
  member. It changes the pick in 98.9% of multi-member classes (4,884/4,938); the remainder are digit-width cases such as `opaque-10`
  vs `opaque-9`.

### Localisation (fresh sets, 25,388 worlds; DEV288 agrees)

| Arm or check | Result under the O-2R.1 IDENTITY twin |
|---|---|
| B = S0 | 0 changes; per-action features and scores identical in 100% of worlds |
| Nexus abstention and S0 fallback | 0 changes; rationale codes identical in 100% |
| N = Nexus-else-S0 | 4,884 changes, all `SAME_TYPE_TIE_BREAK`; mechanism predicts 19,317/19,317 picks |
| R | 2,484 changes, all at H0 (R = N); 0 at H2 |
| Nuisance per world | R−B at H0: 0.086 / 0.082; R−N at H2: 0.025 / 0.025; R−N at H0 and R−B at H2: exactly 0 |

Control relabellings, all decided before truth:

| Control | Result |
|---|---|
| Order-preserving relabel (same lexical order of ids and handles) | 0 changes |
| Entities renamed, handles kept | 0 changes |
| Handles renamed, entities kept | identical to O-2R.1 (4,884 changes, same nuisance) |
| Two random relabels | 2,538 and 2,578 Nexus changes, against 2,558 expected for a fair random tie-break; R−B nuisance about 0.022 overall (about 0.044 at H0) |

### D4 contrast (DEV288)

S0 and Nexus are invariant in 2,304/2,304 oriented twins. Nexus only ever picks targeted types (PROTECT, REPAIR,
REINFORCE), whose handles carry no geometry, so the tie-break key happens to be rotation-invariant (1,744/1,744). D4
passes by that coincidence, not because the policy is free of arbitrary keys.

### Transform validity

The O-2R.1 twin is a valid, semantics-preserving bijection:

- reproduced exactly in 100% of worlds; entity and handle maps bijective; no original identifier left anywhere;
- only identifier-bearing fields change (19–21 paths: ids, relationship endpoints, objective handles, BYPASS
  `parameters.dependent`, `semantics[]` actor/target/ACTION_ID);
- the only unrenamed keys are the schema field name `actor`, which happens to equal the actor's id.

One latent, decision-inert engine dependence was found. `evaluateNexus.maxDependencyDepth` uses an id-sorted DFS, so it
varies in cyclic graphs (6.8% of worlds); rationale codes, and hence decisions, never change.

### Separating transform from policy

The failure is genuine policy dependence on arbitrary identifiers. The transform contributes only its magnitude:
reverse numbering is the worst case for a lexical tie-break, roughly doubling the measured effect relative to a random
relabel. A random relabel still exceeds 0.02 at H0.

The registered difference-of-differences estimands also attribute the comparator's dependence to the selector. At H2
the selector is invariant, but N is not.

## Phase 3: H2 catastrophe introductions

H0 has essentially no catastrophic actions (2/12,688 H0 menus; 0 introductions of either kind), so the veto is purely
an H2 phenomenon.

| H2 outcome (both fresh sets) | Count |
|---|---|
| S0 (= R) catastrophic | 84 (0.66%) |
| Nexus-else-S0 catastrophic | 2,910 (22.9%) |
| Introductions vs N (S0 catastrophic, N safe) | 39 (19 + 20) |
| Reverse (N catastrophic, S0 safe) | 2,865 |

**Introduction worlds (all 39 probed).** In every case S0 chose MOVE, and never as a tie set. Nexus chose PROTECT (27),
REPAIR (6) or REINFORCE (6). The catastrophic deficit is forgone maintenance:

- infrastructureHealth in 20 worlds, restoredDependencyValue in 17;
- regret 100–156, with no terminal outcome or actor loss.

A hostile is degrading, or a dependency awaits restoration, and moving away costs just over the 100 threshold within
four steps.

**Reverse worlds (120 probed).** Nexus chose PROTECT in 120/120, and the deficit is mostly forgone objective progress
(101/120).

**Public-equivalent hidden-health twins.** One non-civilian entity's hidden health was shifted by ±5/10/20. Each twin
was kept only if the policy-relevant public view was byte-identical, and every decision was asserted unchanged.

- S0's catastrophe label flips in 28/39 introduction worlds. Whether S0's choice is catastrophic is not a function of
  the public view there.
- Nexus's pick stays safe in all twins in 38/39.
- S0 stays safe in all twins of 120/120 reverse worlds.
- No conflict witness was found (a public-identical twin with the opposite introduction). Strict observational
  indistinguishability of the two classes is therefore not proven.

**Guards.** I searched 49 public single-condition guards, fitted on EXPLORE and checked on CHECK.

- The only zero-creation guard on EXPLORE was "Nexus proposes REINFORCE at H2". It avoided 3 introductions but created
  2 introductions vs S0 on CHECK.
- "Nexus proposes REPAIR" avoided 3 and created 1–2.
- Broad guards (regime, hostile proximity) avoid 1–8 introductions and create 61–590.
- At the finest partition tested (K4), every held-out cell containing an introduction also contains reverse failures
  (20 vs 1,435).
- Risk-indicator AUCs for S0 catastrophe are 0.38–0.75 and inconsistent between sets.

**Conclusion.** Avoiding one class introduces the other at about 70:1. Zero introductions against both comparators would
need near-perfect public discrimination on the disagreement set. The tested public information does not provide it, and
the label itself depends on unobserved health in most introduction worlds.

## Phase 4: best-of gap

Because R equals N at H0 and B at H2, the per-world best-of gap equals HARM_B at H0 plus HARM_N at H2 exactly
(verified on every world).

| Quantity | EXPLORE | CHECK |
|---|---|---|
| H0: S0 better than Nexus (wrong arm) | 230 | 216 |
| H2: Nexus better than S0 (wrong arm) | 297 | 315 |
| Mean gap given a wrong arm | 0.31–0.33 nreg | 0.31–0.33 nreg |
| Mean best-of gap | 0.0134 | 0.0134 |

The individual harms pass (HARM_B upper ≤ 0.0112, HARM_N ≤ 0.0153). Their sum is what crosses 0.02.

**Public-state selection.** Fitted on EXPLORE and evaluated on CHECK:

- partitions by band and Nexus type (8–16 cells) barely help: 0.0122;
- adding S0's chosen type (35 cells) reaches 0.0079 and improves nreg by 0.0054 vs the frozen rule, but switching H2
  cells to Nexus creates 3 introductions vs S0.

The remaining gap at that granularity is irreducible without information the partition lacks. The privileged per-world
best arm is not a policy input and was not used.

## Phase 5: feasibility before redesign

| Candidate (DEV, new identity, not proposed for registration) | IDENTITY | HARM_N | Best-of gap | Zero introductions vs N |
|---|---|---|---|---|
| Frozen rule | A 0/10, B 2/10, C 0/10, D 8/10 | 10/10 | 5/10 | 1/10 |
| Identity-free selector only (`TYPE_THEN_S0_H0`) | A, C 10/10; B 2/10, D 0/10 (comparator) | 0/10 | 0/10 | 1/10 |
| Identity-free selector only (`TYPE_SET_H0`) | A, C 10/10; B 2/10, D 0/10 | 2/10 | 2/10 | 1/10 |
| Identity-free selector and comparator (`JOINT_TYPE_SET`, CHECK) | all pass (dependence 0) | 5/5 | 2/5 | 0/5 (23 introductions) |
| Identity-free selector and comparator (`JOINT_TYPE_THEN_S0`, CHECK) | all pass | 5/5 | 1/5 | 0/5 (18 introductions) |

All primaries stay materially beneficial in every variant.

**Diagnosis: B. NEW_SELECTOR_RESEARCH_REQUIRED.**

- **Identity has a minimal, source-grounded correction.** Replace the lexical handle tie-break by an identifier-free
  resolution. It works only if the Nexus comparator arm is re-specified the same way, or the nuisance estimand is
  redefined to the selector's own dependence; either way that is a new claim.
- **The other two failures survive that correction.** They are structural to a horizon-only rule. Fixing them needs
  within-horizon, public-state selection with an explicit H2 maintenance-risk model, and that trades average regret
  against catastrophe introductions.
- **Why not C.** No tested guard reaches zero, and hidden health decides most labels. But no conflict witness was found,
  and a learned risk model was not tried. So PUBLIC_INFORMATION_INSUFFICIENT is the documented limit for the
  zero-introduction criterion at the tested granularity, not a proven impossibility.
- **Why not A or D.** No minimal correction passes all three criteria on DEV (A), and every root cause is established
  (D).

The frozen H0/H2 rule and its evidence are unchanged. No Router 2.0 was built.

## Phase 6: scientific exit

| Research state | Status |
|---|---|
| V4 owner-governed study | COMPLETE, QUALIFIED NEGATIVE (`BOUNDED_SELECTOR_NOT_QUALIFIED`) |
| Original frozen selector | NOT QUALIFIED |
| Canonical Stage 3H | INCOMPLETE |

Mapping to the seven canonical dimensions (V3 exit matrix). This grants no qualification.

| Dimension | Registered V4 evidence | Status |
|---|---|---|
| Expert marginal value | H0 R−B −0.387..−0.499, material 10/10 | positive, measured, not qualified |
| Expert complementarity | full R−B −0.193..−0.250, R−N −0.176..−0.225, material 10/10 | positive, measured, not qualified |
| Horizon-stratified competence | A/B material 10/10; exact H0 R=N / H2 R=B controls pass; H2 catastrophe veto vs N fails | mixed, not qualified |
| Regime-specific competence | benefit in all 40 regime estimates, no material harm | positive (descriptive), not qualified |
| Ablation value | Nexus-removal contrast (R minus Nexus = S0) is estimand A/C, positive; Oracle protocol inertness not measured in V4 | partial, not qualified |
| Prime synthesis value | none | NOT_TESTABLE (owner-approved scope; unmeasured) |
| False-selection harm | HARM_B and HARM_N pass 10/10; best-of gap fails 5/10; zero-introduction vs N fails 9/10 | failed |

IDENTITY invariance is a cross-cutting integrity requirement and failed. TCA remains APPROVED_NOT_TESTABLE (owner
scope), kept separate from measured results. No full Stage 3H certification; Stage 3I not entered.

## Spent development resources

Blocks 951 and 952 (25,536 seeds) and the 25,388 admitted DEV world hashes in `dev-runs/` are spent for development.
Any future confirmatory registration must exclude them, together with all earlier exclusions.

## Evidence binding (sha256, first 16 hex)

| File | Hash |
|---|---|
| `evidence/ADJUDICATION_7c41ba89.json` | f81210d69a556bea |
| `evidence/selector-study-r20000.json` | 4e9d9a1c5318ad73 |
| `evidence/h2-mechanism-FRESH_EXPLORE.json` | 7ca97a06cc72ec40 |
| `evidence/h2-mechanism-FRESH_CHECK.json` | bb613e57ee8c90a6 |
| `evidence/h2-mechanism-DEV288.json` | ee999bc4b07ab95a |
| `evidence/d4-contrast-DEV288.json` | 1f6af2991532cb42 |
| `evidence/phase5-feasibility.json` | b1133a321262f409 |
| `dev-runs` DEV288 / FRESH_EXPLORE / FRESH_CHECK (concatenated shards) | c8513c1b4df356c5 / b7447db13bba1238 / aa46c92c129aded5 |
