# Stage 3G.4 — Level-Stratified Temporal Replication: specification (revised prompt)

This is the stage prompt as issued, with the design corrections agreed before the stage began folded in. It is committed
with the freeze. The plan (`scripts/stage3g4/plan.mjs`) implements it, and the certificate is judged against it.

## Inheritance and scope

- **Certified inheritance:**
  - Stage 3F freeze `41748ff6…`;
  - Stage 3G.1/3G.2 `7f392535…`;
  - Stage 3G.3 `6f580401…` (commits `20e8bba`, `f606f80` and `3a878c1`, which are local on `main` and not yet pushed).
- **Do not:**
  - modify any of their scientific results;
  - train a learned world model or begin the world-model tournament;
  - redesign Router, Nexus, Oracle or Prime;
  - add an Expert #10;
  - change authority (R0);
  - repair RETREAT.
- **Question:** does decision-relevant temporal value increase with curriculum level, independent of partition identity?
- **Nature of the stage:** replication and stratification only.

## Hypotheses (pre-registered)

- H1_LEVEL_SCALING
- H2_THRESHOLD_EFFECT
- H3_PARTITION_ARTIFACT
- H4_RETREAT_LEVEL_INTERACTION
- H5_NO_STABLE_TEMPORAL_EFFECT

The plan gives the operational rule for each.

## Design corrections folded in

1. **Frozen fitted models.** Every Stage 3G.3 scorer was fitted on DEV rows, which cover levels 0–1. The primary analysis
   reuses the Stage 3G.3 fitted models byte for byte: they are refitted deterministically, and each must reproduce its
   Stage 3G.3 model hash. A level-balanced refit is fitted on a newly declared fit seed (6011, levels 0–7), which is
   open data and never sealed. It is a pre-registered secondary analysis that separates "temporal value scales with
   level" from "a level-0/1 scorer extrapolates worse".

2. **Seed families crossed with level.** Two seed families cover every level L0–L7:
   - family A = 5022, reserved by Stage 3G.3 for HOLDOUT use;
   - family B = 5032, reserved by Stage 3G.3 for OOD use.

   Stage 3G.3 reserved both "for later Stage 3G", which permits this use; they are re-declared here. The difference
   between families at a fixed level is the partition effect. 5023 and 5033 stay reserved.

3. **Horizon-band balance.** Each (family, level) cell holds equal quotas of the five horizon bands H0–H4 (label horizons
   1, 1, 3, 5, 8). The count of PARTIAL rows, and so the apparent temporal value, then cannot vary with level through
   band mix.

4. **Quotas.** 190 admitted rows per (family, level, band), which is 950 per (family, level) (about 850 eligible) and
   15,200 sealed rows in total. That is enough for per-cell CIs at the 0.05 bar.

5. **Decision units.** The pooled bands LOW (0–2), MID (3–5) and HIGH (6–7) are the decision units, and materiality is
   required in **both** seed families. Single levels are descriptive, with independent CIs.

   Scaling is judged by one pre-registered trend test: the bootstrap slope of the primary temporal gain across levels,
   together with the band ordering. It is never judged from endpoints alone.

6. **Bounded-search control.** This is an exhaustive, max-return, known-model planner over the frozen Forge transition
   and `FORGE_REWARD_V2`, labelled PRIVILEGED (it uses the simulator). It differs from the Stage 3G.3 H_k diagnostic,
   which follows the oracle's greedy continuation.
   - It runs at DEPTH_0 (immediate), DEPTH_1 and DEPTH_2 on every row.
   - It runs at DEPTH_3 on a declared subsample (every 16th eligible row), because a depth-3 exhaustive search costs
     about 9³ transitions per candidate.
   - The same label-leak guard applies: the planner's total depth must be shorter than the label depth.
   - **Sufficient** means the best bounded-search control is not materially worse than the temporal diagnostic of the
     same depth, in MID and HIGH, in both families.

7. **Observable option features.** These are E1 under the Stage 3G.2 contract only: derived from the visible map, the
   observed hostiles and the action semantics, with no simulation. Each feature is listed with its classification.
   - `CURRENT_SAFE_ACTION_COUNT` uses only hazard terrain, blocking and visible-hostile adjacency.
   - Anything that needs health dynamics is excluded.

8. **Pre-seal dry run.** The certifier has a `--dry-run` mode that exercises every code path on the open fit rows,
   standing in for the sealed partitions. It writes only outside the repository and must run before the sealed
   evaluation. A disclosed amendment slot is pre-declared, so there are at most four commits: freeze, optional
   amendment, certification, and the freeze's own artifacts.

9. **Phase 0.** Stage 3F, Stage 3G.1/3G.2 and Stage 3G.3 are all reproduced with `--check`. The Stage 3G.3 check already
   hash-binds Stage 3F and Stage 3G.1/3G.2, so the long Stage 3F freeze check runs in parallel and blocks nothing but
   tracked edits.

10. **Oracle question (Q9).** This stage produces no evidence about the Oracle expert (temporal channel forecasting). Q9
    is answered as "does the evidence put temporal modelling on the critical path?", and the default answer is no.

11. **Housekeeping.** Scripts live under `scripts/stage3g4/`, because both frozen Stage 3G test suites enumerate the
    top-level `stage3g*` scripts. The Stage 3G.3 commits are part of the inheritance and are not pushed by this stage.

## Frozen diagnostics (unchanged from Stage 3G.3)

The following are all reused, not redefined:

- ONE_STEP, H2, H3 and H4 (truncated oracle-branch returns), with the same reward scalarisation and rollout semantics;
- the materiality rule (+0.05, CI lower bound > 0, normalised regret not worse);
- the label-leak guard (PARTIAL_k: the diagnostic depth is strictly shorter than the label depth);
- the privileged option block;
- BEST_CAPACITY (NEW_INTERACTION).

The primary temporal horizon is H3, the best in Stage 3G.3. H2 and H4 are reported alongside it.

## Required per-level report (L0–L7, per family and pooled)

- BASELINE_OPTIMAL_SET_HIT
- ONE_STEP_DELTA
- H2_DELTA, H3_DELTA and H4_DELTA, each on PARTIAL rows with an independent CI
- NORMALIZED_REGRET
- TEMPORAL_REGRET_REDUCTION
- HORIZON_DEPENDENT_RATE
- RETREAT_OPTIMAL_RATE
- MULTIPLE_OPTIMAL_RATE
- the retreat block: baseline, H2, H3, H4, the option block, the observable option block, and the temporal and option
  deltas
- the observable option features
- bounded search at depths 0–3
- CAD, CR and the DDV upper bound (TEMPORAL_DECISION_VALUE_BY_LEVEL), never presented as deployable

## Decision rules (pre-registered)

`TRANSITION_PREDICTION_NOW_JUSTIFIED=true` only if all six conditions hold:

1. Some k ∈ {2, 3, 4} has D_Hk − NEW_LINEAR MATERIAL on PARTIAL_k rows in MID **and** HIGH.
2. That holds in **both** seed families (replication).
3. The partition effect is not material. At HIGH and pooled over levels, the family A − family B difference in the
   temporal gain must not be ≥ 0.05 with a CI excluding 0.
4. Every integrity check equals 1.
5. D_Hk − D_OBS_OPTION is MATERIAL in MID and HIGH, in both families.
6. The relative regret reduction is ≥ 0.20, with the normalised-regret CI upper bound < 0.

`WORLD_MODEL_WORK_NOW_JUSTIFIED=true` only if transition prediction is justified **and** neither deterministic bounded
search nor observable option features capture the value.

`READY_FOR_3G_COUNTERFACTUAL_PREDICTION` equals `TRANSITION_PREDICTION_NOW_JUSTIFIED`.

## Testing and reproduction

- Reproduce Stage 3F, Stage 3G.1/3G.2 and Stage 3G.3.
- Audit seed overlap and level/band balance.
- Enforce the label-leak guard.
- Check D4 equivariance of the NEW, temporal, search and observable-option features.
- Check identity renaming and candidate-order invariance.
- Check deterministic replay.
- Run the full repository suite.
- Run `--check` twice and reproduce from a fresh clone.
- `CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE=true`.
- Everything runs under `SENTINEL_CANONICAL_NUMERICS_V1`.
