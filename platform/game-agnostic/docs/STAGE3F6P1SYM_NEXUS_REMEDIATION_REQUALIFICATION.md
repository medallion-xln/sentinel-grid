# Stage 3F.6-P.1-SYM — Nexus Remediation Symmetric Requalification

Certification `afcdceb18df34b05bb60613e302a762c3de196d764b34dfbe50e1978d3f80cf8`
Analysis plan `b7c69812be75d8ef9bf8157d84db76becd292119e5f6f79f781fda1ecc0c95c9` · Freeze commit `8656f3d`
Seed plan `5571364b9c3b4fad4109399b607dbdea031a8842ef54856fd9d2bcfc3efd1f3b` · Policy set `77d73cea1886cb55be7fe2a806e6377f27be82a157db4da193a79f673c61a1cb`
Candidate schema `631af2fc5eb75a6e28e51192f735e7a80f1b32c90c7d737a60152e67c2eef82d`
Fresh partitions (new seeds 3021 / 3031) `fee73d23f3cf55d89d9ba9c6c11c9bc86012db497e783f35235de88badbd8523`, 12,000 records, generated at `8656f3d`

## The question

Stage 3F.6-P.1 (certificate `48462a16…31e4`) made one change to Nexus. `NEXUS_SELECTOR_V2_CANDIDATE` allows PROTECT only
when the target has an observed `threatens` edge. P.1 concluded `D_REMEDIATION_REQUIRES_MISSING_REPRESENTATION`: the
change improved Nexus standalone, but by turning it into a mover that collapsed onto RESOURCE.

That work ran on the direction-confounded Forge V1 benchmark. This stage re-tests every material P.1 claim on
FORGE_SYMMETRIC_V2, with fresh sealed data. It separates shortcut effects from relational ones, and it asks whether
Nexus is limited by its policy logic or by missing input. Nexus was not redesigned.

## Answer

**PASS. Nexus V1 is `REPRESENTATION_BLOCKED` and `POLICY_LOGIC_LIMITED`, with no genuine relational competence
measurable from observable state. The historical conclusion survives, and it is now sharper.**

- **Where V1 fails.** V1 picks PROTECT in 90% of decisions, and PROTECT carries 95% of its regret. Its action *type*
  is right only 17% of the time. When the type is right, the target is right 92% of the time.
- **Where V1 is right.** When the oracle says an entity-targeted or PROTECT action is optimal, V1 is correct 71–92% of
  the time. That regime cannot be identified from observable state. No observable relational regime shows V1 or V2
  beating both uniform choice and RESOURCE.
- **V2.** V2's improvement over V1 is real even with tie-breaks randomised (+0.138 HOLDOUT, +0.131 OOD). It comes from
  choosing MOVE, though, and its choice of MOVE direction is a fixed-EAST shortcut (orientation gap 0.42 / 0.75). V2 is
  `SHORTCUT_DEPENDENT`, and it lowers the policy-set ceiling (0.397 → 0.351).
- **Privileged kernel geometry.** A linear scorer over Nexus's inputs plus kernel geometry reaches 0.755 / 0.902,
  against 0.386 / 0.309 for every deployable input. The whole gain comes from **where movement leads relative to the
  task entities**. Where targeted entities are adds nothing (Δ 0.000). One-step successor information adds 0.002.
- **Missing capability.** It belongs to observation and action-semantics infrastructure, not to Nexus's relational
  scope.

## Protocol

1. **Baseline.** HEAD `6db1ad0`, clean, no active writer. P.1C, P.1D, P.1E, 3F.6-T-SYM and P.1A-SYM all reproduce
   byte-for-byte. `STAGE3F6-ERRATUM-001` is present.
2. **New sealed seed space.** Every HOLDOUT/OOD seed the P.1D plan declared (2021–2023, 2031–2033) had been consumed.
   HOLDOUT 3021–3023 and OOD 3031–3033 were declared in a separately hashed seed plan and bound into the analysis plan.
   They were proven disjoint from every enumerated prior seed (1–1011, 2001–2033), and no repository file uses any seed
   in the 3000s. The DEV/CAL spares were not used.
3. **Open phase (DEV/CAL).** DEV fitted seven predeclared linear diagnostic scorers (the P.1A-SYM conditional logit,
   unchanged), with a deterministic fit. CAL was descriptive only; no selection is needed.
   - A dry run on CAL, with CAL rows standing in for sealed data, found one flaw. The deployable repair test counted
     actor-movement geometry that Nexus never reads.
   - The predeclared `NX_RELATIONAL_ONLY` scorer (Nexus's own relational inputs) now carries the repair verdict.
     `PRE-FREEZE-001` in the plan records this. It made the rule stricter.
4. **Freeze (`8656f3d`).** The plan, seed plan, open report and every evaluation file were frozen. The generator
   refused to run until they were committed. The certifier checks that the fresh manifest was generated at `8656f3d`
   and that the evaluation files are unchanged since.
5. **Fresh data.** 6,000 HOLDOUT rows (seed 3021 only, levels 0–2 in canonical order) and 6,000 OOD rows (seed 3031
   only, levels 6–7). They were built with the unmodified P.1D record builder and checked against the full 44,000-row
   prior lineage (P.1D + T-SYM fresh + P.1A-SYM fresh):
   - record, state and topology overlap: 0
   - derived-variant leakage: 0
   - duplicates: 0
   - D4 symmetry: 2,415 / 2,415
6. **Sealed evaluation.** It ran once. There was no tuning after the freeze.

## Historical Nexus inventory

| | policy | hash | rule |
| --- | --- | --- | --- |
| baseline | `NEXUS_SELECTOR_V1` (`stage3c-learned-nexus.js#nexusRelationalSelector`) | source bytes in policy set `77d73cea…` | Nexus diagnosis → threat or structure type order → **smallest action identity** within the type; the target is never consulted; abstains without relational structure |
| remediated | `NEXUS_SELECTOR_V2_CANDIDATE` | candidate `8c658bfa…a900`, source `965cb36f…1577` (byte-identical to P.1) | V1, with PROTECT admissible only on an observed-threatened target |

Neither uses a simulator or rollout. The V2 hashes match the P.1 certificate. V1 reproduces every stored choice
(fidelity 1.000).

## Results (P1SYM_HOLDOUT / P1SYM_OOD, n = 6000 each)

| Strategy | class | coverage | top-1 H / O | norm. regret H / O | regret ≥ 100 H / O |
| --- | --- | --- | --- | --- | --- |
| NEXUS_SELECTOR_V1 | baseline | 0.894 / 0.858 | **0.154 / 0.142** | 0.561 / 0.624 | 0.085 / 0.321 |
| NEXUS_SELECTOR_V2_CANDIDATE | remediated | 0.894 / 0.858 | **0.294 / 0.269** | 0.521 / 0.612 | 0.120 / 0.389 |
| RESOURCE_PRESERVING_V1 | control | 1.000 | 0.264 / 0.259 | 0.567 / 0.634 | 0.145 / 0.405 |
| uniform legal | control | — | 0.204 / 0.199 | 0.587 / 0.641 | — |
| RANDOM_LEGAL_V1 | control | 1.000 | 0.201 / 0.203 | 0.593 / 0.635 | 0.127 / 0.363 |
| GREEDY | simulator reference | 1.000 | 0.200 / 0.166 | 0.541 / 0.612 | 0.080 / 0.316 |
| OBJECTIVE / THREAT | references | 0.071 / 0.025 (H) | 0.262 / 0.329 (H) | | |
| NX_RELATIONAL_ONLY | deployable diagnostic | 1.000 | 0.343 / 0.284 | 0.488 / 0.597 | 0.109 / 0.374 |
| NX_DEPLOYABLE | deployable ceiling | 1.000 | 0.386 / 0.309 | 0.436 / 0.561 | 0.087 / 0.323 |
| NX_PRIVILEGED | diagnostic, unavailable | 1.000 | **0.755 / 0.902** | 0.099 / 0.041 | 0.021 / 0.022 |
| NX_PRIV_MOVEMENT_ONLY | diagnostic | 1.000 | 0.755 / 0.904 | 0.099 / 0.040 | |
| NX_PRIV_TARGET_ONLY | diagnostic | 1.000 | 0.386 / 0.309 (identical to NX_DEPLOYABLE) | | |
| NX_DEPLOYABLE_ONESTEP | diagnostic, future state | 1.000 | 0.409 / 0.305 | | |
| NX_PRIVILEGED_ONESTEP | diagnostic | 1.000 | 0.757 / 0.901 | | |

Paired differences on the policy's proposing rows, top-1 with 95% CI (material = ≥ 0.05, CI > 0, normalized regret not
worse):

| | HOLDOUT | OOD |
| --- | --- | --- |
| V2 − V1 | +0.141 [0.126, 0.156] material | +0.127 [0.112, 0.142] material |
| V2 − V1, both tie-randomised | +0.138 [0.128, 0.149] material | +0.131 [0.120, 0.141] material |
| V1 − uniform | **−0.050** [−0.059, −0.041] | **−0.057** |
| V1 − RESOURCE | −0.107 | −0.119 |
| V2 − RESOURCE | +0.034, not material | +0.008, not material |
| NX_RELATIONAL_ONLY − V1 | +0.190 material | +0.141 material |
| NX_RELATIONAL_ONLY − RESOURCE | +0.079 material | +0.025 **not material** |
| NX_PRIVILEGED − NX_DEPLOYABLE | +0.369 material | +0.594 material |
| NX_PRIV_TARGET_ONLY − NX_DEPLOYABLE | 0.000 | 0.000 |
| NX_PRIVILEGED_ONESTEP − NX_PRIVILEGED | +0.002 | −0.002 |

## Shortcut audit

| | V1 HOLDOUT / OOD | V2 HOLDOUT / OOD |
| --- | --- | --- |
| top-1 equivariance on D4 twins | **1.000 / 1.000** | 0.341 / 0.256 |
| target equivariance | 1.000 / 1.000 | 1.000 / 1.000 |
| orientation gap | 0.047 / 0.041 (no flag) | **0.421 / 0.746 (flag, replicated)** |
| action-ID permutation Δ | +0.002 / +0.001 | +0.004 / −0.003 |
| choice changed by ID permutation | 0.336 / 0.204 | 0.847 / 0.922 |
| chosen MOVE direction | — (never moves) | EAST 0.884 / 0.932 |
| candidate-order shuffle | 0 changes | 0 changes |
| PROTECT selection vs optimal rate | 0.904 vs 0.149 (precision 0.125) | 0.027 vs 0.149 |
| zero-cost choice vs zero-cost optimal | 0.000 vs 0.865 | 0.846 vs 0.865 |

- **V1** is exactly equivariant. Its identity tie-break changes *which* PROTECT target it picks in a third of cases,
  but not its accuracy.
- **V2** inherits the lowest-identity MOVE, which is EAST. Its accuracy is 0.56–0.79 in the two orientations that keep
  EAST as EAST, and 0.04–0.25 in the other six. It is the same fixed-direction pattern P.1E found in RESOURCE.

## Relational competence

No **observable** relational regime meets the predeclared rule, for V1 or for V2. The rule requires a material margin
over both uniform and RESOURCE on HOLDOUT (n ≥ 200), confirmed on OOD, with no nuisance dependence.

- V1 is below uniform in every observable regime (0.08–0.18 across HOLDOUT and OOD): hostile present, unsupported threat, dependency, dense or
  sparse relations, objective relation, threat-driven diagnosis.
- V2 beats uniform everywhere but never RESOURCE, except in the small objective-relation slice on HOLDOUT
  (n = 400, not replicated on OOD, where n = 74).

Conditional competence does exist, in regimes only the oracle can see:

| oracle regime (HOLDOUT / OOD) | V1 | V2 | RESOURCE | uniform |
| --- | --- | --- | --- | --- |
| a PROTECT action is optimal (15% / 14%) | **0.828 / 0.922** | 0.270 / 0.281 | 0.175 / 0.246 | 0.326 / 0.355 |
| an entity-targeted action is optimal | **0.711 / 0.861** | 0.327 / 0.334 | 0.121 / 0.205 | 0.271 / 0.320 |
| a costly action is optimal | 0.565 / 0.617 | 0.334 / 0.403 | 0.000 | 0.183 / 0.191 |

V1's relational response is right when a relational response is called for. Nothing it can observe tells it when that
is. Stage 3F.6-T-SYM found the same thing from the router side: whether V1 beats RESOURCE was not identifiable.

## Historical claims

| Claim (Stage 3F.6-P.1) | symmetric evidence (HOLDOUT unless noted) | verdict |
| --- | --- | --- |
| C1 PROTECT bias is the main cause of V1's poor quality | PROTECT 90.4% of choices, 95.3% of V1 regret | **SURVIVES** |
| C2 target choice is not the main defect | P(right \| right type) = 0.924; type accuracy only 0.166 | **SURVIVES** |
| C3 V2 materially improves standalone quality | +0.141 raw, +0.138 tie-randomised; OOD +0.127 / +0.131 | **SURVIVES** (but see C4 and shortcut audit) |
| C4 V2's gain comes from MOVE and is RESOURCE-collinear | MOVE 84.6%, agreement with RESOURCE 0.683 | **SURVIVES** |
| C5 V2 reduces policy-set value | oracle 0.397 → 0.351, CI [−0.053, −0.038] | **SURVIVES** |
| C6 V2 is worse where V1 was best | −0.103 [−0.117, −0.088] | **SURVIVES** |
| C7 V1's value came from greedy collinearity | agreement with GREEDY 0.775 (OOD 0.847) | **SURVIVES** |
| C8 remediation requires missing representation | privileged − deployable +0.369 / +0.594 | **SURVIVES** |
| C9 V1 is insensitive to threat regime | hostile vs not: 0.142 vs 0.177, gap 0.035 < 0.08 | **SURVIVES** |
| C10 perfect choice among entity-targeted actions is not material | +0.063 [0.056, 0.069] over V1 | **INVALIDATED** (material on HOLDOUT; +0.023 on OOD) |
| C11 V2 is simulator-free and leak-free | candidate and source hashes identical to P.1 (static re-check) | **SURVIVES** |
| C12 V1 is preserved | reproduces every stored choice | **SURVIVES** |

What the symmetric benchmark adds is **why** C3 survives. V2 gains by moving more than by relational reasoning, and its
*direction* is a fixed-EAST artifact that only pays in two of eight orientations. Tie-randomisation leaves the gain
intact because moving in *any* direction beats PROTECTing a random pickup. The mechanism P.1 named (reflexive PROTECT
removed, collapse onto RESOURCE) is confirmed. The quality gain is real but not relational.

## Classification

| | primary | all labels |
| --- | --- | --- |
| NEXUS_SELECTOR_V1 | **REPRESENTATION_BLOCKED** | REPRESENTATION_BLOCKED, POLICY_LOGIC_LIMITED, REDESIGN_CANDIDATE, WEAK_BUT_DISTINCT |
| NEXUS_SELECTOR_V2_CANDIDATE | **SHORTCUT_DEPENDENT** (orientation, replicated) | SHORTCUT_DEPENDENT, REPRESENTATION_BLOCKED, REDESIGN_CANDIDATE, WEAK_BUT_DISTINCT |

The two limitations are distinct:

- **Policy logic (V1).** Nexus's *own relational inputs*, scored linearly, beat V1 by +0.19 / +0.14, because V1's fixed
  PROTECT-first type order is wrong 83% of the time. But that scorer does not materially beat RESOURCE on OOD (+0.025).
  So a relational-only repair would not produce a competent policy: `NEXUS_POLICY_REPAIR_JUSTIFIED = false`.
- **Representation.** Adding kernel geometry of where each move leads relative to the objective, material and hostile
  entities lifts the same scorer to 0.755 / 0.902. That information is not in any deployable interface.

V1 keeps real complementary value (marginal oracle gain +0.107 / +0.093) but is poor when it is the best available
policy (0.245), hence `REDESIGN_CANDIDATE`.

## Architecture

| owner | evidence | verdict |
| --- | --- | --- |
| OBSERVATION_INFRASTRUCTURE | the missing inputs are kernel entity positions no interface exposes | **yes** |
| ACTION_SEMANTICS_INFRASTRUCTURE | the entire privileged gain is in where an action moves the actor relative to entities (+0.369 / +0.595) | **yes** |
| NEXUS (relational spatial context of targets) | target geometry adds 0.000 on both partitions | no |
| ARCHIMEDES (mechanistic one-step effect) | +0.002 / −0.002 on top of geometry | no |
| ORACLE (temporal) | not assessed here; P.1A-SYM found temporal < 1.2% of residual errors | — |
| Expert #10 | no orthogonal capability found | no |

## Roadmap

| Field | Value |
| --- | --- |
| NEXUS_REQUALIFIED | true |
| HISTORICAL_P1_SURVIVES | PARTIAL (11 survive, C10 invalidated) |
| GENUINE_RELATIONAL_VALUE_MEASURED | false |
| NEXUS_POLICY_REPAIR_JUSTIFIED | false |
| NEXUS_REPRESENTATION_BLOCKED | true |
| SPATIAL_STATE_REQUIRED | true |
| ACTION_SEMANTICS_REQUIRED | true |
| TRANSITION_PREDICTION_REQUIRED | false |
| ROUTER_2_0_JUSTIFIED | false |
| READY_FOR_STAGE3F6W_REQUALIFICATION | true |
| READY_FOR_STAGE3F6D_REQUALIFICATION | false (after W) |
| READY_FOR_3F_FREEZE / READY_FOR_STAGE3G | false / false |

## Disclosures

- **Pre-freeze revision.** `PRE-FREEZE-001` is described in the protocol above and recorded verbatim in the plan. No
  fresh row existed at the time.
- **Scorers are diagnostics, not Nexus versions.** The `NX_*` scorers measure what the inputs can support. The
  privileged ones read kernel positions and are upper references only. None is deployable, promoted or a repair.
- **Overlapping regimes.** Several observable regimes nearly coincide on this benchmark. PROTECT is legal in every
  state, a RESOURCE-kind target is almost always present, and DEPENDENCY equals MULTI_ENTITY_DEPENDENCY here. The
  relational-regime table is therefore less discriminating than its length suggests.
- **C11 is a static re-check.** The historical dynamic poison probe was not re-run; source and candidate hashes are
  byte-identical to the certified candidate.
- **Transitive predecessors.** The certifier re-runs P.1A-SYM `--check`, which reproduces only if P.1C, P.1D, P.1E and
  3F.6-T-SYM do.
- **Level coverage.** Canonical admission order gives HOLDOUT levels 0–2, as in every earlier symmetric partition.

Authority: R0, non-dispatching, no online learning, nothing promoted.

## Reproduce

```bash
node scripts/generate-stage3f6p1sym-confirmatory.mjs --verify   # rebuilds the gitignored fresh payload from committed state
node scripts/certify-stage3f6p1sym-nexus.mjs --check
node --test tests/stage3f6p1sym-nexus.test.js
```
