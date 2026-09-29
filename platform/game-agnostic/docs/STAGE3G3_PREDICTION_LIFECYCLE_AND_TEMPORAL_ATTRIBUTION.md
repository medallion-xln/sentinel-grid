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

Results are recorded below after certification.
