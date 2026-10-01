# Stage 3G.8 — Existing-observation projection and prospective disclosure value

Certification: **PASS**, `0e91ab6c21137fdd0cb29ca258bdf076fc8bbeaa52d0c017de61f1983c78e2e7`. Stage status: `STAGE3G8_COMPLETE_STAGE3G_OPEN`.

The certificate attests that this audit is reproducible. It does not say that Stage 3G closes. Stage 3G does **not** close under the preregistered rules: exactly one condition fails, C2, the sufficiency of observable state with the disclosure.

Runtime stays at R0, with dispatch, live-world mutation, online learning and promotion disabled. The live adapter is unchanged. This stage built no predictor and no learned world model, did not redesign Oracle or Router, added no Expert #10, and did not begin Stage 3H or 3I.

## Inheritance

All seven inherited checks reproduced under canonical numerics, each with its own `--check` criteria. The tracked tree was unchanged throughout (`INHERITANCE_INTACT=true`).

| Check | Certificate | Seconds |
|---|---|---:|
| stage3f | `0fe5d3e2…08ce` | 4219 |
| stage3g12 | `7f392535…5100` | 1967 |
| stage3g3 | `6f580401…8c69` | 2553 |
| stage3g4 | `259195ba…c4c8` | 4741 |
| stage3g5 | `d472f04f…68da` | 46 |
| stage3g6 | `291e8ac8…d766` | 56 |
| stage3g7 | `ec5ae9c1d2f011791ed93f6bfa2879756905647a4098fcb9c4a9cd42e87e79b6` | 19 |

The Stage 3G.7 conclusions are inherited unchanged. The Phase 10 flags below are Stage 3G.8 requalifications under the registered Stage 3G.8 rules; they are reported next to the inherited flags, not over them.

Stage-local code lives in `stage3g8/`. The frozen Stage 3G.7 source hash scans every `.js`/`.mjs` under `src/` and `scripts/`, so new files there would have broken its reproduction.

## Design

- **Fit set.** The heads are fit on the reused Stage 3G.7 OPEN fit set: 320 rows, 192 with horizon > 2. No new OPEN rows were generated.
- **Baseline.** A refit of `BASELINE_G7` reproduces the certified Stage 3G.7 head hash `382d454d…e2f6`. Its 54 columns match the frozen Stage 3G.7 `observableColumns` exactly, for every candidate in all 8,430 evidence rows.
- **Sealed population.** Fresh families A and B, with 3,840 rows each and 2,304 inferential rows each. Each family has 96 rows per level × horizon band and 12 per objective (Stage 3G.7 used 24 per cell). The larger sample was chosen so the noninferiority endpoints could resolve.
- **Conditional cohorts.** BYPASS_A (216 rows) and BYPASS_B (214 rows, 2 short), from bands H2–H4. Rows are admitted only if BYPASS is offered. These cohorts are descriptive and carry population weight 0.
- **Lineage.** Record, world and topology hashes are disjoint from all prior lineage. The reserved seeds 5023 and 5033 are untouched.
- **Statistics.** The Stage 3G.7 materiality rule, which must replicate in both families. Eight one-sided noninferiority endpoints with Bonferroni correction (α = .00625 each), 40,000 paired resamples, and margins of .05 for hit and .01 for normalized regret.

## Objective progress (OBJECTIVE_PROGRESS_V1)

`OBJECTIVE_PROGRESS_V1` projects `metadata.objectives`, which the live adapter already delivers. Schema hash: `1302aeea48be7c50bf8e90cdebfe9e35c6cc1b7475d83c73c02cf8b3cf46944f`.

| Field | Class |
|---|---|
| required amount | E0 |
| delivered amount | E0 |
| remaining amount | E1 |
| completion fraction | E1 |
| complete | E1 |

Projection fidelity is **EXACT** on every one of the 8,430 rows:

- the packet objectives equal the kernel objectives (audit read);
- `reconstructObjectives(project(packet))` reproduces the packet exactly;
- summed remaining equals packet feature 12.

A reachable COLLECT→TRANSFER trajectory confirms delivered = 7 and completion 0.41, and replays deterministically. D4, identity renaming, candidate order, poisoning and determinism all pass on the 329 integrity rows. `OBJECTIVE_PROGRESS_PROJECTION_LOSS=false`.

In every one of the 7,680 population rows, delivered = 0 at decision time; only the required amount (5–15) varies. The population therefore cannot test the delivered component separately. The projection mainly re-exposes a level-correlated required amount.

| Stratum | A hit gain (OP − G7) | B hit gain | Replicated |
|---|---:|---:|---|
| ALL | −0.26 pp | −0.26 pp | NOT_MATERIAL |
| LOW | −0.12 pp | 0.00 pp | NOT_MATERIAL |
| MID | −0.46 pp | −0.23 pp | NOT_MATERIAL |
| HIGH | −0.17 pp | −0.69 pp | NOT_MATERIAL |
| RETREAT | −0.27 pp | −1.10 pp | NOT_MATERIAL |
| HORIZON_DEPENDENT | −0.36 pp | −0.51 pp | NOT_MATERIAL |

Decision flips are about 0.7% of rows, and catastrophic errors change by at most 0.5 pp. `OBJECTIVE_PROGRESS_VALUE_MEASURED=true` and `OBJECTIVE_PROGRESS_VALUE_MATERIAL=false`.

`OBJECTIVE_PROGRESS_OOD_STABLE=NOT_TESTABLE`. In the level-extrapolation probe (fit on levels ≤ 3, evaluate on levels ≥ 4), the hit-deficit upper bound is .014/.015. That passes the hit margin, but the normalized-regret upper bounds of .0111/.0106 just exceed the .01 margin.

## Typed relation disclosure (TYPED_RELATION_DISCLOSURE_CANDIDATE_V1)

This is a prospective, audit-only candidate, not runtime-approved. Schema hash: `28a8e8ed587c8356b1853e8ba6ca61ca663e4c5a5630ba71e309916b01907588`.

It keeps `world.relations[].type`, and its source reads only `{from,to,type}`. Mapping each record through `FORGE_RELATION_TYPES[type].nexusKind` must reproduce the delivered coarse relations exactly, and it did on every row.

Relation types observed:

| Type | Count |
|---|---:|
| dependsOn | 137,689 |
| supplies | 50,686 |
| substitutes | 9,335 |
| attacks | 7,208 |
| supports | 2,164 |

`protects` never occurs. The collapse groups are:

- supports ← {supplies, protects, substitutes, repairs, powers, supports}
- depends ← {dependsOn, controls, requires}
- threatens ← {attacks, blocks}

**Safety audit.** For the `type` field the answers are:

| Question | Answer |
|---|---|
| Currently observable in the environment | yes; Forge `renderRelations` presents `from --type--> to` |
| Currently dropped before adapter output | yes; kernel `observe()` collapses it |
| Privileged | no |
| Reveals hidden health | no |
| Reveals future state | no |
| Reveals oracle information | no |

`from` and `to` are already delivered. The supporting evidence:

- the disclosure is invariant under poisoning;
- the hidden-health collision remains collided under disclosure;
- the privileged-key scan is clean.

`PRIVILEGE_SAFE=true`.

**Typed search.** Relations change only through BYPASS `dependsOn` rewiring, so a missing `substitutes` edge is exact current structure, not a prediction. Typed search uses this to drop impossible BYPASS continuations. It prunes about 5.1 branches per root, changes 43% of root search vectors, and halves D2 truncation (2.2% → 1.2% in A, 2.0% → 0.9% in B).

## BYPASS

| | Coarse (current) | Typed (prospective) |
|---|---|---|
| Inherited collision fixture | NOT identifiable: identical observation and menu, different rewiring | Identifiable: predicts both rewirings exactly |
| Natural BYPASS roots (684) | 373 identifiable, 311 ambiguous | 684 / 684 exact against the kernel |
| Runtime ledger substitute | UNKNOWN in every case | Exact |
| Non-monotone identity rename | — | Follows the kernel's lexical rule |

`BYPASS_EXACT_SUBSTITUTE_IDENTIFIABLE_WITH_DISCLOSURE=true`, `BYPASS_RELATION_COLLISION_RESOLVED=true`, `BYPASS_PRIVILEGE_LEAKAGE=false`.

## Disclosure decision value

Hit gain is the typed variant minus its comparator.

| Comparison / stratum | A | B | Replicated |
|---|---:|---:|---|
| TYPED_RELATION_ONLY vs G7, ALL | +0.02 pp | +0.13 pp | NOT_MATERIAL |
| OP+TR vs OP, ALL | −0.28 pp | +0.26 pp | NOT_MATERIAL |
| TYPED_RELATION_ONLY vs G7, TARGET_BEARING | +2.74 pp | +1.47 pp | NOT_MATERIAL |
| TYPED_RELATION_ONLY vs G7, LOW / MID / HIGH | — | — | NOT_MATERIAL |
| Population BYPASS stratum (n = 21/22) | — | — | NOT_TESTABLE |
| BYPASS cohorts, TYPED_RELATION_ONLY vs G7 | −21.3 pp | −18.2 pp | **HARMFUL** |
| BYPASS cohorts, OP+TR vs OP | −19.4 pp | −18.2 pp | **HARMFUL** |
| BYPASS cohorts, typed search only vs G7 | 0.0 pp | +0.5 pp | NOT_MATERIAL |

The BYPASS-cohort harm comes from linear weights on the typed root columns. They were learned on population OPEN data with only 6 BYPASS rows and do not transfer to BYPASS decisions. Typed search alone is neutral, so the harm is not evidence that the information itself is harmful.

The head-independent oracle value-of-information audit is the cleaner measure. A coarse-consistent retyping changes the optimal set in 0.22% of population rows in both families. The oracle misbelief hit loss is 0.17/0.20 pp, and 1.1/0.0 pp in the cohorts. BYPASS is offered in 0.9%/1.0% of population rows and is coarse-ambiguous in 0.35%/0.48%.

The path is therefore not materially relevant at population scale (threshold 5%), and typed relations show no material decision value. `TYPED_RELATION_DECISION_VALUE_MATERIAL=false` and `TYPED_RELATION_DISCLOSURE_JUSTIFIED=false`.

The mechanistic case still holds: the information is legitimate, it resolves a real collision, it is exact and it does not leak. `TYPED_RELATION_SCHEMA_SUPPORT_JUSTIFIED=true`. Typed relations restore semantic exactness; they do not demonstrably improve decisions.

## Hidden current state and noninferiority

The hidden-state diagnostic appends the root target's individual health, available, planned, acceptsMaterial, protected and value. It is audit-only.

| Endpoint (primary vs reference) | A | B |
|---|---|---|
| S1 runtime head (G7+OP) vs runtime + private | PASS (hit UB .011, nreg UB .0067) | PASS (.0135, .0087) |
| S2 disclosure head (G7+OP+TR) vs disclosure + private | PASS (.010, .0060) | **NOT_TESTABLE** (.0139, nreg UB **.0104**) |
| S3 runtime head vs disclosure head | PASS | PASS |
| OOD objective progress | NOT_TESTABLE | NOT_TESTABLE |

The private gap (C6/C7) is not replicated-material in any population stratum. It is material in TARGET_BEARING for family B only (+5.0/+5.3 pp; A: +4.6/+2.4 pp), and material in both BYPASS cohorts (+10.6/+16.8 pp runtime, +25.5/+25.7 pp disclosure).

Hidden individual state matters on targeted and BYPASS decisions. Those decisions are rare in this population, so the effect is not population-material.

## Observation boundary (CURRENT_OBSERVATION_BOUNDARY_V2)

Boundary hash: `dc2ad7ab5e74d68376d77f53be5692b2d0ff0dde9eeec37ee7dbffedc878ad62`.

- **OBSERVED:**
  - entity handle, kind, presented position and in-service bit;
  - hostile and critical flags;
  - coarse relations;
  - actor fields;
  - tick;
  - objective handle and entity;
  - required and delivered amounts;
  - the offered menu.
- **DERIVED:**
  - distances, directions and class flags;
  - remaining amount, completion fraction and completion;
  - t0 offered-legality predicates;
  - the declared-cost E1 ledger.
- **PROSPECTIVE_AUDIT_ONLY:** canonical relation type.
- **UNKNOWN:**
  - individual health;
  - the available flag;
  - the planned, acceptsMaterial and protected flags, except through t0 offered legality;
  - resource quantity and value;
  - the BYPASS substitute under the coarse contract;
  - future survival, eligibility, state and position;
  - terminal state.
- **PRIVILEGED:** the Stage 3G privileged boundary, i.e. orientation, digests, oracle labels, regret, successors, rollouts, seeds and generator internals.

This stage exposes no hidden current state and no future state.

## Action-surface requalification (Stage 3G.8 rules)

```text
OBJECTIVE_PROJECTION_COMPLETE=true
DEPENDENCY_COLLISION_RESOLVED_PROSPECTIVELY=true
TARGET_SEMANTICS_EXACT=false
TARGET_SEMANTICS_SUFFICIENT=true
DEPENDENCY_SEMANTICS_SUFFICIENT=false
DEPENDENCY_SEMANTICS_SUFFICIENT_WITH_DISCLOSURE=true
SCIENTIFICALLY_SUFFICIENT_WITH_DISCLOSURE=false
CURRENT_RUNTIME_SUFFICIENT=false
ACTION_SURFACE_SUFFICIENT=false
DEPLOYABLE_PLANNING_SUFFICIENT=false
NOT_DEMONSTRATED_ACTION_CELLS=[COLLECT, TRANSFER, BUILD]
```

`TARGET_SEMANTICS_SUFFICIENT=true` is decision-scoped, as registered. It means four things hold together: the projection is complete; every unavailable predicate is UNKNOWN with no false certainty; S1 passes in both families; and there is no replicated material private gap. Exact target semantics remain false.

`DEPENDENCY_SEMANTICS_SUFFICIENT` keeps the Stage 3G.7 exactness meaning. It is false at runtime and true only with the audit-only disclosure, and runtime sufficiency is never marked true on the strength of audit-only fields.

`SCIENTIFICALLY_SUFFICIENT_WITH_DISCLOSURE` is false because S2 did not resolve in family B.

## Stage 3G closure

| Condition | Result |
|---|---|
| C1 epistemic integrity | true |
| C2 observable state sufficient for demonstrated tasks | **false** |
| C3 unavailable fields explicitly UNKNOWN | true |
| C4 prediction lifecycle safe | true |
| C5 environment-dynamics value non-material | true |
| C6 no learned world model justified | true |
| C7 adapter improvements understood and scoped | true |
| C8 nothing requires counterfactual prediction | true |

```text
STAGE3G_SCIENTIFICALLY_COMPLETE=false
REMAINING_3G_BLOCKER=C2_OBSERVABLE_STATE_SUFFICIENT_FOR_DEMONSTRATED_TASKS
READY_FOR_3G_COUNTERFACTUAL_PREDICTION=false
WORLD_MODEL_WORK_NOW_JUSTIFIED=false
STRUCTURAL_OOD=NOT_TESTED
```

The single blocker is C2. Sufficiency with the disclosure could not be established because the S2 noninferiority bound for normalized regret in family B (.0104) missed the .01 margin. The weak link is the disclosure head: its typed root columns, fit without BYPASS training signal, do not generalize.

The runtime surface without the disclosure passes S1 and S3. It is still not runtime-sufficient, because the BYPASS substitute is not identifiable without typed relations.

The blocker is a precision and qualification problem for one head. It does not point to environment dynamics, so it does not justify prediction or world-model work. No Stage 3H work was started.

## Verification

- Full suite: platform 2,379 passed, 0 failed, 1 skipped (including all 12 Stage 3G.8 tests); overlay 23 passed.
- Legacy lab: 33 passed, with the same seven failures as Stage 3G.7. Their causes match and the lab tree is unchanged.
- Integrity on all 8,430 rows: world, label completeness, frozen G7 parity and UNKNOWN safety.
- Integrity on the 329 sample rows: D4, monotone renaming with reversed order, non-monotone renaming, poisoning, determinism, privileged-key scan, and oracle label reproduction.
- Two read-only `--check` runs reproduced the certificate with tracked state unchanged (`stage3g8-two-checks.json`).
- The fresh-clone reproduction imports only hash-verified ancestor raw payloads. It rebuilds the Stage 3G.8 sealed rows, the OPEN and sealed evidence, and the tests from source (`stage3g8-reproduction-proof.json`).
- A pre-freeze dry run on a throwaway clone with tiny quotas found one bug before any sealed row existed: a population-balance filter that also matched the BYPASS cohort partitions. It was fixed before the freeze.
