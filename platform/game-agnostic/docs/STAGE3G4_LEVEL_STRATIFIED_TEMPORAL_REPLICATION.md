# Stage 3G.4 — Level-Stratified Temporal Replication

Stage 3G.3 found a split result. Multi-step temporal value was material on OOD (levels 6–7) and not on HOLDOUT
(levels 0–2). Levels 3–5 were never evaluated, so partition identity and curriculum level were confounded. Stage 3G.4
asks whether decision-relevant temporal value increases with curriculum level, independently of partition identity.

This stage only replicates and stratifies. The specification (the revised stage prompt, with the design corrections
folded in) is `docs/STAGE3G4_SPECIFICATION.md`, and it is committed with the freeze.

| Artifact | Role |
| --- | --- |
| `src/stage3g/observable-option-features-v1.js` | `SENTINEL_OBSERVABLE_OPTION_FEATURES_V1`: E1 option-preservation features, with no simulation |
| `scripts/stage3g4/plan.mjs`, `plan-cli.mjs` | The pre-registered plan, and its writer/checker |
| `scripts/stage3g4/evidence.mjs` | Stage 3G.3 evidence, plus bounded search (privileged) and observable option features |
| `scripts/stage3g4/generate.mjs` | Open fit set (seed 6011) and sealed seed families A = 5022, B = 5032 |
| `scripts/stage3g4/certify.mjs` | Open phase, `--dry-run`, sealed evaluation, `--check` |
| `tests/stage3g4-level-replication.test.js` | Tests |

## Design

**Seed families crossed with level.**

- Family A (5022) and family B (5032) each cover levels 0–7 × horizon bands H0–H4, with 190 admitted rows per cell:
  15,200 sealed rows in all.
- The two families differ only by generation seed. At a fixed level, the difference between them is the partition effect.
- The level slope is the level effect.

**Frozen models.**

- The primary analysis reuses the Stage 3G.3 fitted models byte for byte. They were fitted on levels 0–1 DEV rows.
  NEW_LINEAR, NEW_INTERACTION, D_ONE_STEP, D_H2, D_H3, D_H4 and D_OPTION all reproduce their Stage 3G.3 model hashes.
- The secondary analysis refits NEW_LINEAR, D_H3 and D_OBS_OPTION on a level-balanced open fit set (seed 6011, 60 per
  cell). This separates level scaling from level-0/1 extrapolation.

**Bounded search (PRIVILEGED, known model).**

- The search value is a candidate's immediate scalar plus the maximum cumulative scalar over every sequence of d further
  legal actions. It is exhaustive and needs no tie-break, so it is D4-invariant.
- A depth-1 search value equals the H2 truncated return by construction, because the greedy continuation already takes
  the one-step maximum. D_SEARCH_D1 therefore duplicates D_H2, and their model hashes are identical.
- The informative controls are DEPTH_2 (every row) and DEPTH_3 (every 16th row).

**Observable option features (E1, deployable).**

- For the destination cell: open moves, safe moves (not on hazard terrain, not adjacent to a visible hostile), retreat
  gain, border mobility, on-hazard, and non-hazard exits.
- All come from the visible map, the observed hostiles and the action semantics, without simulation.

## Results

Certification: `artifacts/stage3g4-level-replication/stage3g4-certification-result.json`, PASS,
`259195ba9c2d223010d8302579c665c67fd20b666f43b35c9ae539e6e70cb4c8`.

How the result was produced:

- **Freeze:** `dfa7f10`.
- **Sealed run:** one sealed evaluation, with no amendment, under `SENTINEL_CANONICAL_NUMERICS_V1`.
- **Sealed rows:** 15,200 (content `025d7e25…`), with zero overlap with the 104,000 prior rows or the fit set.
- **Balance:** all 80 (family, level, band) cells hold exactly 190 rows. There are 785–911 eligible rows per (family,
  level).
- **Symmetry:** all D4 symmetry checks equal 1.
- **Pre-seal dry run:** it ran on the open fit rows. Its (open-data) conclusions were seen before the sealed run; the
  rules were already frozen and were not changed.

### Temporal value by level

The gain is D_H3 − NEW_LINEAR on PARTIAL_3 rows (PRIVILEGED_UPPER_BOUND); `*` marks a MATERIAL result.

| Level | Baseline set hit | Family A H3 Δ | Family B H3 Δ | Pooled H3 Δ | Pooled H2 Δ | Pooled H4 Δ | Pooled regret reduction (H3) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L0 | 0.742 | +0.024 | +0.019 | +0.021 | +0.006 | +0.016 | 14% |
| L1 | 0.812 | +0.022 | +0.025 | +0.024 | +0.008 | +0.025 | 12% |
| L2 | 0.831 | +0.033 | +0.020 | +0.026 | +0.011 | +0.026 | 28% |
| L3 | 0.841 | +0.043 | +0.010 | +0.026 | −0.002 | +0.025 | 37% |
| L4 | 0.882 | +0.039 | +0.035 | +0.037 | +0.009 | +0.024 | 56% |
| L5 | 0.885 | +0.046 | +0.054* | +0.050 | +0.022 | +0.041 | 63% |
| L6 | 0.905 | +0.051* | +0.045 | +0.048 | +0.023 | +0.047 | 70% |
| L7 | 0.901 | +0.059* | +0.053* | +0.056* | +0.028 | +0.057* | 83% |

Across levels, the horizon-dependent rate is 0.86–0.88, the retreat-optimal rate 0.13–0.23 and the multiple-optimal
rate 0.14–0.27. The one-step Δ is at most +0.007 everywhere.

| Band | Family A H3 Δ | Family B H3 Δ | Pooled | Material in both families |
| --- | --- | --- | --- | --- |
| LOW (0–2) | +0.026 [0.011, 0.041] | +0.021 | +0.024 | no |
| MID (3–5) | +0.042 [0.029, 0.056] | +0.033 | +0.038 | no |
| HIGH (6–7) | **+0.055 [0.041, 0.069]** | +0.049 [0.035, 0.064] | +0.052 | no (B is just under the bar) |

**Level effect.** The pooled H3-gain slope is +0.005 per level [0.003, 0.008]. It is positive in family A (+0.005) and
in family B (+0.006), so the classification is MONOTONICALLY_INCREASES.

**Partition effect.** A − B in the H3 gain is +0.006 [−0.014, 0.028] at HIGH and +0.007 [−0.004, 0.019] pooled; no level
is material. Both effects are identified by the design. **The Stage 3G.3 OOD signal was a level effect, not a partition
effect.**

### Secondary: level-balanced refit (open fit set, seed 6011)

| Band | NEW_LINEAR (frozen, fitted on levels 0–1) | NEW_LINEAR_LB (fitted on levels 0–7) | D_H3_LB − NEW_LINEAR_LB |
| --- | --- | --- | --- |
| LOW | 0.796 | 0.805 | +0.021 |
| MID | 0.870 | 0.913 | +0.008 |
| HIGH | 0.903 | **0.962** | +0.009 |

The slope of D_H3_LB − NEW_LINEAR_LB over levels is **−0.002** [−0.004, −0.000].

A deployable linear scorer on the unchanged Stage 3G.2 observable representation, fitted across levels, closes most of
the high-level gap **without any future information**. Once it is, the temporal gain is about +0.01 and does not grow
with level. The primary "scaling" is therefore mostly an extrapolation weakness of the level-0/1 models, not missing
temporal information. This is a pre-registered secondary analysis. It does not change a primary conclusion, but it
decides how they should be read.

### Retreat by level (pooled, retreat-optimal rows)

| | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 0.732 | 0.756 | 0.675 | 0.582 | 0.541 | 0.523 | 0.596 | 0.518 |
| H3 Δ | −0.005 | +0.038 | +0.111 | +0.183 | +0.233 | +0.309 | +0.253 | +0.315 |
| option Δ (privileged) | −0.023 | −0.013 | +0.084 | +0.190 | +0.202 | +0.281 | +0.158 | +0.255 |
| observable option Δ | 0.000 | +0.013 | −0.004 | +0.013 | +0.028 | +0.026 | +0.038 | +0.022 |

Retreat difficulty rises with level: the baseline slope is −0.033 per level [−0.041, −0.025]. The temporal and option
slopes are +0.047 and +0.041 per level, both with CIs above 0. Retreat is the one clearly temporal pocket, and it becomes
more so with level. Observable (E1) option features recover almost none of it.

### Observable option features and bounded search

**Observable option features (deployable).** D_OBS_OPTION − NEW_LINEAR is +0.002 to +0.006 in every band; they are not
sufficient.

**Bounded search (PRIVILEGED, known model).**

- D_SEARCH_D2 − NEW_LINEAR, on PARTIAL_3 rows:
  - LOW +0.020, MID +0.038, HIGH +0.056 (MATERIAL in both families at HIGH).
- D_H3 − D_SEARCH_D2 is −0.005 to +0.004 everywhere: **depth-2 search captures the temporal value**.
- PLANNER_D2 alone, a pure argmax with no learned scorer, reaches 0.970 at HIGH on PARTIAL_3 rows.
- PLANNER_D3 on the depth-3 subsample (90 rows) reaches 0.946, against NEW_LINEAR 0.878.
- DEPTH_1 duplicates H2 by construction.

### Decision Evaluation Contract diagnostics (PRIVILEGED_UPPER_BOUND)

| | LOW | HIGH |
| --- | --- | --- |
| CAD, T_3 | 0.38 | 0.75 |
| Regret reduction (CR) | 17% | 77% |
| DDV upper bound (the H3 Δ above) | +0.024 | +0.052 |

### Integrity (both families)

All of the following equal 1 for every scorer, diagnostic and planner:

- NEW feature D4 and prediction D4;
- temporal, search and observable-option D4;
- identity renaming;
- candidate order;
- rollout fidelity (21,646 and 21,506 label totals reproduced);
- one-step and search fidelity;
- poisoning probe.

The privileged-key scan found 0 hits.

## Conclusions (pre-registered rules)

| Field | Value |
| --- | --- |
| LEVEL_STRATIFICATION_COMPLETE | true |
| TEMPORAL_VALUE_LEVEL_SCALING | MONOTONICALLY_INCREASES (primary, frozen models); not present with the level-balanced refit (secondary) |
| TEMPORAL_VALUE_THRESHOLD_MEASURED | true (THRESHOLD = NONE: no band is material in both families) |
| TEMPORAL_VALUE_REPLICATED | false |
| TEMPORAL_VALUE_MATERIAL_MID_LEVEL / HIGH_LEVEL | false / false (HIGH is material in A and pooled; B is +0.049) |
| PARTITION_CONFOUND_RESOLVED | true: a level effect, with no partition effect |
| RETREAT_LEVEL_EFFECT_MEASURED | true: retreat becomes harder and more temporal with level |
| OBSERVABLE_OPTION_FEATURES_SUFFICIENT | false |
| DETERMINISTIC_BOUNDED_SEARCH_SUFFICIENT | true |
| TRANSITION_PREDICTION_NOW_JUSTIFIED | false |
| WORLD_MODEL_WORK_NOW_JUSTIFIED | false |
| READY_FOR_3G_COUNTERFACTUAL_PREDICTION | false |
| Temporal modelling on the critical path (Q9) | no |
| Hypotheses | H1 true; H2 false; H3 false; H4 true; H5 true (as defined: no band material in both families) |

Authority stays R0.

## Reproduce

```bash
node scripts/reproducibility/run-canonical.mjs scripts/stage3g4/generate.mjs --verify-fit   # open fit set (gitignored)
node scripts/reproducibility/run-canonical.mjs scripts/stage3g4/generate.mjs --verify       # sealed families (gitignored)
node scripts/reproducibility/run-canonical.mjs scripts/stage3g4/certify.mjs --check
node --test tests/stage3g4-level-replication.test.js
```

The check also needs the Stage 3F lineage, the Stage 3G.1/3G.2 sealed payload and the Stage 3G.3 sealed payload, each
verified against its committed manifest.
