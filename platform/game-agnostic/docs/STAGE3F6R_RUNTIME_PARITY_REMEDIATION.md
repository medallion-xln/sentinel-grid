# Stage 3F.6-R — Runtime Parity Remediation (gate)

`STAGE_3F_6_R_RUNTIME_PARITY_REMEDIATION` is a bounded correctness gate, not a new architectural stage and not a reliability study. It repairs four confirmed defects found by the Stage 3F.6 diagnostic run and records two additive errata. It trains nothing, adds no feature, creates no predictor, and modifies no frozen Stage 3E artifact.

```text
AUTHORITY=R0  CAN_DISPATCH=false  CAN_MUTATE_LIVE_WORLD=false
MODEL_TRAINING_PERFORMED=false  ONLINE_LEARNING_ENABLED=false  NEW_PREDICTIVE_MODEL=false
```

## Two explicitly separated feature modes

**REFERENCE_PARITY_MODE** — diagnostic only. It exists solely to prove historical parity with the frozen Stage 3E contract. It imports `training/stage3e-recovered/features-v2.mjs` unmodified, byte-checked against the canonical lineage record, and it depends on:
- reward-V2 immediate semantics;
- frozen greedy identity;
- greedy-continuation **horizon rollout totals** (7 features);
- genuine V2B answers (5 features, archive-only, so reported `REQUIRES_V2B`).

It is never simulator-free, never one-step, and never the deployable runtime contract.

**DEPLOYABLE_RUNTIME_MODE** — the integrated runtime's own adapter. It is measured, not redesigned, in this gate.

```text
DEPLOYABLE_STAGE3E_FEATURE_PARITY=false
DEPLOYABLE_RUNTIME_FEATURE_CONTRACT_REQUIRES_REDESIGN=true
```

That research question is deliberately left open.

## What changed

- **Router equation binding** (`src/stage3f/integrated-live-shadow-v1.js`): the frozen model stores the bias last, so `bias = w[keys.length]` and `feature weight i = w[i]`. The model shape is asserted, and incomplete or non-finite input fails closed with no score and no route.
- **Abstention evidence** (same file): an abstained recommendation attaches no counterfactual, and it preserves the trace, the ledger (`NO_SENTINEL_PROPOSAL`), the selected and executed incumbent action, the experience, validation, and eligibility for every purpose. Prediction-dependent profiles are explicitly `INELIGIBLE` with `DECISION_TIME_PREDICTION_REQUIRED`. Ledger evaluation is `INCOMPARABLE`, because there is no proposal to compare.
- **Feature labeling** (same file): the runtime feature adapter is labeled `STAGE3F6R_DEPLOYABLE_RUNTIME_FEATURE_ADAPTER_NOT_STAGE3E_PARITY`. The prior "exact Stage 3E contract" claim is withdrawn.
- **Campaign** (same file): the DISAGREEMENT episode moves from seed 11 to seed 12. Under the corrected router, seed 11 abstains (0.7056) and so cannot exercise disagreement. Seed 12 is the first seed ≥ 11 in that family and level where the corrected router proposes an action (0.9131). The erratum records this.
- **Predecessor verification** (`src/lab/stage3de-recovery-canonicalization.js`): candidate identity binds to the in-repo manifest, whose per-file hash composite must equal the frozen candidate hash. Canonical certification no longer consults `lineage.recoveredSourcePath` or any ephemeral scratch path. Adapter byte verification is opt-in through `SENTINEL_STAGE3D_V2B_ADAPTER_DIRECTORY`, reports `ADAPTER_BYTES_VERIFIED` or `NOT_VERIFIED_ARCHIVE_UNAVAILABLE`, and never gates PASS or FAIL.

## Stage 3F.5 status

```text
STAGE3F5_CURRENT_VALIDITY=SUPERSEDED
HISTORICAL_ARTIFACT_UNCHANGED=true
```

The original certificate (`eda3d2d6…`) is preserved byte-for-byte. Because its hashed runtime source changed, its `--check` no longer reproduces by design. Still valid historically: R0 authority, incumbent sole execution, failure isolation, deterministic evidence behavior, and the read-only Observatory.

## Errata (additive; no history rewritten)

- `artifacts/stage3f6r-runtime-parity-remediation/erratum-stage3f5-integrated-live-shadow.json`
- `artifacts/stage3f6r-runtime-parity-remediation/erratum-stage3e-routability-intelligence.json`

## Confirmatory Stage 3F.6

Not performed here. The current HOLDOUT and OOD splits were exposed during diagnosis, so same-split replay is used only for exact parity verification, never for new statistical claims.

```text
NEW_HOLDOUT_SPLIT=true
NEW_OOD_SPLIT=true
TOPOLOGY_DISJOINT_BY_CONSTRUCTION=true
DISJOINT_SEED_SPACE=true
```

## Commands

```sh
npm run stage3f6r:certify
npm run stage3f6r:check
npm run test:stage3f6r
```
