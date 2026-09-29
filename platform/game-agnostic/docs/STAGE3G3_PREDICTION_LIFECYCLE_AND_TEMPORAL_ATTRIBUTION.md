# Stage 3G.3 — Prediction Lifecycle and Multi-Step Residual Attribution

Stage 3G.1/3G.2 closed the free-action representation gap. The observable representation recovers about 99% of the
privileged-geometry ceiling, and one-step successor information adds nothing material. The remaining errors concentrate
in three places:

- horizon-dependent states;
- states with several optimal actions;
- the retreat case.

Stage 3G.3 asks whether those errors come from missing multi-step temporal information, or from ranking, utility,
option preservation, retreat-specific logic or label structure. It does not assume the answer is temporal.

This stage does not train a world model, run a tournament or add JEPA. It does not redesign the Router or Nexus, add an
Expert #10, change authority or repair the retreat case. Stage 3F and Stage 3G.1/3G.2 are read-only inheritance. Every
future quantity here is read from the frozen simulator and is labelled **PRIVILEGED_UPPER_BOUND**: none is deployable
evidence.

| Artifact | Role |
| --- | --- |
| `src/stage3g/prediction-lifecycle-v1.js` | `SENTINEL_PREDICTION_LIFECYCLE_V1` (infrastructure, not an expert) |
| `scripts/stage3g3/plan.mjs`, `plan-cli.mjs` | The pre-registered plan, and its writer/checker |
| `scripts/stage3g3/evidence.mjs` | Oracle-branch replay: truncated returns, option and temporal quantities, consequence depth |
| `scripts/stage3g3/scorers.mjs` | `SMALL_NONLINEAR_CONTROL`: a ReLU candidate scorer, used as a diagnostic |
| `scripts/stage3g3/generate-sealed.mjs` | Sealed partitions (seeds 5021 / 5031) |
| `scripts/stage3g3/certify.mjs` | Open phase, sealed evaluation, certificate, `--check` |
| `tests/stage3g3-prediction-lifecycle.test.js`, `tests/stage3g3-temporal-attribution.test.js` | Tests |

The Stage 3G.3 scripts live under `scripts/stage3g3/`. The frozen Stage 3G.1/3G.2 test suite enumerates the top-level
`stage3g` scripts exactly, so new top-level scripts would break its `--check`. Each Stage 3G.3 CLI installs the
check-mode guard, and the Stage 3G.3 tests enforce this.

## Phase 1 — Prediction lifecycle

Every prediction carries these fields:

- `predictionId` (content-addressed);
- `sourceStateHash`;
- `actionContextHash`, covering the action, the offered set and the semantics version;
- `createdAtLogicalTick`;
- `targetHorizon`;
- `confidence`;
- `validityConditions`;
- `invalidationConditions`;
- `provenance`;
- `epistemicClass`: E3 for the executed action, E4 for an unexecuted alternative;
- `access`;
- `status`.

Time is logical ticks only.

| Rule | Transition |
| --- | --- |
| L1 | INVALID and RESOLVED_* are final. |
| L2 | The action-semantics version changed → INVALID. |
| L3 | The action is no longer offered, or the offered set changed before execution → INVALID. |
| L4 | A required precondition is observed false → INVALID. |
| L5 | A required entity changed before the target tick → INVALID. |
| L6 | An observation at or after the target tick agrees → RESOLVED_CONFIRMED; disagrees → RESOLVED_REFUTED. This applies to E3 only. |
| L7 | An observation before the target contradicts an assumption → INVALID. |
| L8 | The horizon expired unresolved → INVALID. An E4 always ends here, because its branch never happens. |
| L9 | The source state is superseded → STALE. The prediction can still be resolved, but must not drive a new decision. |

Isolation from authoritative state:

- A prediction enters epistemic state only through `toEpistemicRecord`.
- An E3 record is admitted to the provisional lane, and an E4 record is refused.
- A request to place either in the authoritative lane is refused and flagged `UNVERIFIED_STATE_PROMOTION`.

## The label-leak guard

The frozen oracle scores a candidate by its immediate `FORGE_REWARD_V2` scalar plus `GREEDY_CONTINUATION_V1` for the
row's label horizon h ∈ {1, 3, 5, 8}.

- `T_k` is the first k steps of the same oracle branch (vector-accumulated, then scalarised, exactly as the oracle does).
- `T_1` is the one-step successor.
- For a row with label horizon h, `T_{h+1}` *is* the label.

The primary temporal test therefore uses only **PARTIAL_k** rows (h + 1 > k), where the future supplied is strictly
shorter than the label depth. Full-population numbers are reported only as upper bounds, with the label-complete share
disclosed. The replay reproduces every stored label total exactly (`ROLLOUT_FIDELITY`).

## Results

Certification: `artifacts/stage3g3-temporal-attribution/stage3g3-certification-result.json`, PASS,
`6f58040133deae625e61c636f881b9283da62458581387b0dbe9afee6b4a8c69`.

How the result was produced:

- **Freeze:** `20e8bba`.
- **Amendment 001:** `f606f80` (below).
- **Sealed run:** one sealed evaluation, under `SENTINEL_CANONICAL_NUMERICS_V1`.
- **Sealed partitions:** 12,000 rows (content `cd6f448a…`), seeds 5021 / 5031, with zero overlap with the 92,000 prior
  rows. All D4 symmetry checks equal 1.
- **Coverage:** HOLDOUT covers curriculum levels 0–2 (canonical admission order); OOD covers levels 6–7.

### Amendment 001 (disclosed)

The one sealed run evaluated both partitions and then crashed in the inheritance-binding section. The certifier
referenced `P.STAGE3F_INHERITANCE`, which the Stage 3G.3 plan module does not export. The process printed nothing and
wrote no certificate, so **no sealed result was produced, printed or read** before the fix.

A dry run of the corrected certifier then used DEV/CAL stand-in rows; no sealed row was scored and its output stayed in
the session scratchpad. It exposed a static-audit false positive: the word "counterfactual" in lifecycle comments. The
audit now checks import specifiers only.

The amendment binds the certifier's before bytes (`d8411a9e…`) and after bytes (`cd7dd884…`). Because the first run
produced no output, the certificate records it as unobserved (`FIRST_RUN_PRODUCED_NO_RESULT=true`), and no
scientific-invariance comparison is possible. No rule, threshold, model, seed or partition changed.

### Baseline residual (NEW_LINEAR = the Stage 3G.1/3G.2 representation; model hash reproduced)

| | HOLDOUT | OOD |
| --- | --- | --- |
| optimal-set hit | 0.809 | 0.907 |
| HORIZON_DEPENDENT rate | 0.897 | 0.874 |
| multiple-optimal rate | 0.216 | 0.167 |
| retreat-optimal rate | 0.179 | 0.152 |

### Temporal diagnostics (PRIVILEGED_UPPER_BOUND)

The primary test is on PARTIAL_k rows. For each k, the table gives the gain over NEW_LINEAR and its 95% CI.

| | HOLDOUT | OOD |
| --- | --- | --- |
| one-step (all rows) | +0.002 | +0.003 |
| H2 (k = 2) | +0.001 [−0.008, 0.010] | +0.039 [0.031, 0.048] |
| **H3 (k = 3)** | +0.015 [0.004, 0.027] | **+0.060 [0.050, 0.068], material** |
| H4 (k = 4) | +0.002 [−0.014, 0.019] | +0.051 [0.040, 0.063], material |
| PARTIAL_k rows (k = 2/3 and k = 4) | 2,768 and 1,493 | 3,359 and 2,133 |
| regret reduction with H3 (CR_DIAGNOSTIC) | 13% | 76% |

H3 is also material over BEST_CAPACITY on OOD (+0.069), and it passes the unique-optimal control there. Nothing is
material on HOLDOUT, so the pre-registered HOLDOUT-and-OOD rule is not met.

Full-population upper bounds, which include label-complete rows, are H3 +0.039 on HOLDOUT and +0.061 on OOD.

### Ranking capacity (same observable representation)

| | HOLDOUT | OOD |
| --- | --- | --- |
| LINEAR | 0.809 | 0.907 |
| INTERACTION (BEST_CAPACITY on CAL) | 0.803 | 0.899 |
| SMALL_NONLINEAR (ReLU, width 8) | 0.783 | 0.914 |

Neither control is materially better than linear. On DEV, the MLP beat linear by only +0.013 in-sample, and it did not
generalise to CAL. Extra scoring capacity buys almost nothing, even on training data.

### Option preservation (PRIVILEGED_UPPER_BOUND)

The option block covers legal and safe action counts at t+1 and t+2, retreat availability, irreversible-state entry and
hazard lock-in.

- **All rows:** it adds +0.026 on HOLDOUT and +0.011 on OOD. Neither is material.
- **Retreat-optimal rows:** it adds +0.037 on HOLDOUT and **+0.243 on OOD (material)**.
- **Temporal-feature block:** +0.028 / +0.011.

### Multiple-optimal evaluation (NEW_LINEAR)

| | HOLDOUT | OOD |
| --- | --- | --- |
| optimal-set hit / exact top-1 (all) | 0.809 / 0.728 | 0.907 / 0.862 |
| set − exact (harmless tie selection) | 0.081 | 0.045 |
| multiple-optimal rows: set hit / exact / regret | 0.732 / 0.356 / 12.0 | 0.581 / 0.309 / 45.7 |
| near-tie share of residual | 0.062 | 0.032 |

- Exact-action scoring would overstate error by 0.081 on HOLDOUT and 0.045 on OOD. The OOD figure is below the bar, so
  this is not material on both.
- Stage 3G.1/3G.2 already measured optimal-set hit, so its residual is not a tie artefact.
- The multiple-optimal rows are genuinely harder. They are not mislabelled.

### Retreat

| NEW_LINEAR set hit | HOLDOUT | OOD |
| --- | --- | --- |
| MOVE only | 0.842 | 0.969 |
| MOVE + RETREAT available | 0.789 | 0.856 |
| RETREAT optimal | 0.752 | **0.551** |
| RETREAT suboptimal | 0.804 | 0.972 |
| RETREAT only | none | none |

On OOD retreat-optimal rows, several futures lift the result:

- H3: 0.551 → 0.899 (+0.346);
- H4: +0.298;
- option preservation: +0.243;
- privileged relations: +0.005;
- capacity control: −0.039.

On HOLDOUT, no diagnostic is material. The classification needs both partitions, so it is **UNRESOLVED**. On OOD alone
it would be TEMPORAL + OPTION_PRESERVATION. It is not ACTION_SEMANTICS_LIMITED, RANKING_LIMITED or
LABEL_STRUCTURE_LIMITED on either partition.

### Horizon stratification (consequence depth; share of NEW_LINEAR residual)

| Stratum | HOLDOUT rows / residual share / NEW | OOD rows / residual share / NEW |
| --- | --- | --- |
| H0 | 991 / 0.28 / 0.714 | 576 / 0.03 / 0.970 |
| H1 | 3,637 / 0.41 / 0.885 | 4,943 / 0.83 / 0.912 |
| H2 | 197 / 0.03 / 0.853 | 79 / 0.02 / 0.848 |
| H3 | 197 / 0.13 / 0.355 | 24 / 0.03 / 0.375 |
| H4 | 244 / 0.15 / 0.381 | 51 / 0.09 / 0.059 |

- **HOLDOUT:** the residual is spread widely, and 28% sits in H0 states, where the immediate outcome already identifies an
  optimal action.
- **OOD:** 83% of the residual sits in H1, where one continuation step disambiguates. There, H3 lifts NEW from 0.912 to
  0.981.
- **H4 (beyond four steps):** it is where NEW is weakest, and no four-step future helps.

### Decision Evaluation Contract diagnostics (PRIVILEGED_UPPER_BOUND)

**CAD_DIAGNOSTIC.** This is the share of NEW residual weight where T_k strictly ranks the optimal candidate above the
chosen one.

| | HOLDOUT | OOD |
| --- | --- | --- |
| T_1 | 0.48 | 0.10 |
| T_2 | 0.63 | 0.86 |
| T_3 | 0.51 | 0.81 |

**Net residual resolution** (resolved minus broken):

| | HOLDOUT | OOD |
| --- | --- | --- |
| H3 | 0.21 | 0.65 |
| option preservation | 0.14 | 0.12 |
| BEST_CAPACITY | −0.03 | −0.09 |

### Integrity (both partitions)

All of the following hold on both partitions:

- NEW feature D4 = 1, and prediction D4 = 1 for linear, interaction and MLP.
- Temporal-feature D4 = 1 (1,095 and 1,145 twin checks).
- Identity renaming = 1.
- Candidate order = 1 for every scorer and diagnostic.
- Rollout fidelity = 1 (19,554 and 18,794 label totals reproduced exactly).
- One-step fidelity = 1.
- Privileged-key scan: 0 hits. Poisoning probe = 1.

## Conclusions (pre-registered rules)

| Field | Value |
| --- | --- |
| PREDICTION_LIFECYCLE_IMPLEMENTED / SAFE | true / true |
| MULTI_STEP_TEMPORAL_VALUE_MEASURED | true |
| MULTI_STEP_TEMPORAL_VALUE_MATERIAL | false (material on OOD only, at H3 and H4) |
| MULTI_STEP_TEMPORAL_VALUE_OOD_STABLE | false (no HOLDOUT-material horizon to carry over) |
| RANKING_CAPACITY_LIMITATION_MEASURED / MATERIAL | true / false |
| OPTION_PRESERVATION_VALUE_MEASURED / MATERIAL | true / false |
| RETREAT_RESIDUAL_CLASSIFIED | true: UNRESOLVED (TEMPORAL + OPTION on OOD only) |
| MULTIPLE_OPTIMAL_EFFECT_MATERIAL | false |
| H6_MIXED | false |
| TRANSITION_PREDICTION_NOW_JUSTIFIED | false |
| WORLD_MODEL_WORK_NOW_JUSTIFIED | false |
| READY_FOR_3G_COUNTERFACTUAL_PREDICTION | false |

A negative temporal result is a valid PASS. The finding that matters most is that the temporal signal **depends on the
partition**:

- On OOD (levels 6–7, larger grids), a three-step future materially reduces the residual, above all in retreat states.
- On HOLDOUT (levels 0–2), it does not, and no tested mechanism resolves most of the HOLDOUT residual.

The design cannot separate curriculum level from partition. Canonical admission put levels 0–2 in HOLDOUT, and levels
3–5 are not covered. That is the question to replicate next, with reserved seeds 5022 / 5032 and level-balanced
admission. It is not a reason to start transition prediction.

Authority stays R0. There is no dispatch, no live-world mutation, no online learning and no promotion.

## Reproduce

```bash
node scripts/reproducibility/run-canonical.mjs scripts/stage3g3/generate-sealed.mjs --verify   # sealed payload (gitignored)
node scripts/reproducibility/run-canonical.mjs scripts/stage3g3/certify.mjs --check
node scripts/reproducibility/run-canonical.mjs scripts/stage3g3/plan-cli.mjs --check
node --test tests/stage3g3-prediction-lifecycle.test.js tests/stage3g3-temporal-attribution.test.js
```

The check also needs the gitignored Stage 3F lineage payloads and the Stage 3G.1/3G.2 sealed payload, each verified
against its committed manifest.
