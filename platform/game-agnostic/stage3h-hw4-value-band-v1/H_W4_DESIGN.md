# SENTINEL GRID — STAGE 3H H-W4 DESIGN (FROZEN BEFORE WORLD GENERATION)

PRIORITY: P0 — Scientific Competence · AUTHORITY: R0 · MODE: Controlled DEV-only V1/V2 experiment

This document is frozen BEFORE any H-W4 world is generated. Later edits are prohibited; deviations must be
recorded as DEVIATION entries in the results report, never silently.

## 1. Hypothesis (primary, prespecified)

**H-W4**: Under an otherwise identical lawful policy-learning procedure, adding the frozen coarse node-value
band (V0/V1/V2, thresholds lo=2, hi=valueSpread+3, objective nodes 'P') to the public observation reduces
catastrophe introductions against both frozen comparators (S0, Nexus-else-S0) on fresh DEV classes, compared
with V1, while preserving meaningful regret improvements (mean nreg improvement ≥ 0.02 vs each comparator).

The experiment is PAIRED: both arms see the same worlds, comparators, evaluator and training code.

## 2. Arms

| Arm | Contract | Features |
|---|---|---|
| A `V1_PUBLIC_ONLY` | `STAGE3H_PUBLIC_DECISION_INFORMATION_V1` | frozen I-3 `NAMES` (HW1_PUBLIC_FEATURES_V1), unchanged |
| B `V2_PUBLIC_PLUS_VALUE_BAND` | `STAGE3H_PUBLIC_DECISION_INFORMATION_V2_VALUE_DEV` (DEV-only) | identical I-3 `NAMES` + exactly 8 band one-hots (`target.band.{V0,V1,V2,P}`, `dependent.band.{V0,V1,V2,P}`) |

The ONLY intended information difference is the ordinal value band. The band is a FEATURE ONLY: it never
enters action identity (keyV1/keyV2), action orbits, menu derivation, symmetry, or canonical keys — those are
byte-identical between arms. Non-structural nodes have no band (all-zero one-hots); the adapter fails closed on
any structural node it cannot join or band.

## 3. Identical learning procedure (both arms)

- Architecture: standardized ridge linear heads (nreg + cat), frozen I-4 code (`i4-ridge`, `i4-cv`, `i4-candidates`).
- Lambda grid, fold count, family-grouped folds: the frozen I-4 grids (`LAMBDAS`, `FOLDS`, grouped by origin family).
- Score rules: the frozen roster (NEG_NREG, SAFE_FIRST, RISK_WEIGHTED) with the frozen TAUS/KAPPAS grids and
  `TUNE_RESAMPLES`.
- Tuning criterion: the frozen I-4 lexicographic rule (fewest class-level introductions vs S0 + Nexus, then
  lowest mean nreg), on out-of-fold EXPLORATION decisions only.
- Candidate selection (prespecified): per arm, the single candidate with (1) fewest OOF class-level introductions
  vs S0, (2) fewest vs Nexus, (3) lowest OOF mean nreg — lexicographic. Frozen before VALIDATION is touched.
- Label-shuffle control: run once (BASE|within), as in I-4.
- Deterministic seeds recorded; learned parameters sealed to `models/` with sha256.

Any necessary algorithmic variation is prespecified here and applies symmetrically: NONE beyond the 8 band
features is planned. If an unforeseen variation becomes necessary, both arms are re-run symmetrically and the
variation is reported as a separate comparison.

## 4. Population construction (Phase 5)

- Screening rule: the frozen arm-stress rule of the H-W1 I-2 screen (Nexus applies; B ≠ N; S0 introduces vs
  Nexus OR both arms' regrets in [40,160]) — identical to H-W1, chosen for comparability, frozen before screening.
- Exclusion (fail-closed, tamper-tested): strict structured exclusion index (V4 namespaces, H-W1 exploration and
  validation worlds, blocks 731–734, 951–952, 977–988, all recorded OPEN seeds) + ALL sealed PCD registries
  (STUDIED_341, DEV_H2, H-W1 EXPLORATION, H-W1 VALIDATION) + repository text scan + H-W4's own
  exploration registry applied during validation screening. Class digests and twin lineages of previously analyzed
  classes are excluded via these registries.
- Block reserve (fresh, prefighted PASS): EXPLORATION [941–949, 953–959] (16), VALIDATION [960, 989–999] (12).
  Forbidden: 731–734, 951–952, 967, 983, 961–976, 977–988. Block 950 rejected by text scan.
- Sizes: EXPLORATION 1,000 classes; VALIDATION 600 classes; HOLDOUT 0 (never generated). If validation falls
  below 300, record a deviation and STOP for review. Exploration below 1,000: record the achieved number and
  proceed only if ≥ 800 (deviation noted); below 800, stop for review.
- Origin-family separation: folds and uncertainty clustering group by origin family (block-level lineage);
  exploration and validation never share a block. Rejected or duplicate classes are not recycled.
- Assignment frozen (allocation record + population manifests, exclusive-create) before training.

## 5. One-pass validation protocol (Phase 7)

Both policies are frozen (sealed model files) BEFORE any validation outcome is viewed. Each policy runs exactly
once over the same frozen validation classes. No validation outcome feeds back into training, tuning, or
candidate choice. No policy is re-tested on the same population after any peek.

Primary paired comparison: catastrophe introductions vs S0 and vs Nexus per arm; paired differences in
introduction rates; origin-family-clustered bootstrap uncertainty intervals; improvement-across-action-families
check (per MOVE/PROTECT/RESTORE/RETREAT/BYPASS/REPAIR contribution).

Qualification requirements (each policy independently, unchanged thresholds):
1. Zero observed catastrophe introductions vs S0. 2. Zero vs Nexus. 3. Zero illegal actions.
4. Mean nreg improvement ≥ 0.02 vs each comparator. 5. One-sided 95% cluster-bootstrap upper bound < 0 for
nreg differences vs each comparator. 6. Identity and applicable geometric invariance. 7. Deterministic replay.
8. Compute budget (median decision < 100 ms, max < 1000 ms, same as H-W1).

A V2 policy with fewer catastrophes but nonzero introductions is scientifically informative but NOT_QUALIFIED.
Zero events in a finite DEV run is never interpreted as universal safety.

## 6. Secondary results (prespecified)

Mean nreg; worst-case nreg; safe-action identification accuracy; per-action-family contributions; calibration of
the learned cat head (reliability by decile); hidden-state-sensitive failures (het-rate by type); V2 band
dependence (decision flip rate when band features are ablated at inference, diagnostic only); origin-family
generalization; compute overhead (ms distributions).

## 7. Classification rule (Phase 8, prespecified)

- **A** `V2_POLICY_SAFETY_QUALIFIED_ON_DEV` — all frozen DEV safety, regret, invariance and implementation gates pass for the V2 policy.
- **B** `V2_SAFETY_IMPROVEMENT_BUT_NOT_QUALIFIED` — V2 reduces catastrophe introductions vs V1 but fails ≥ 1 qualification requirement.
- **C** `V2_NO_MEANINGFUL_POLICY_ADVANTAGE` — the measured information gain does not translate into a supported policy improvement.
- **D** `EXPERIMENT_INVALID_OR_BLOCKED` — a required provenance, identity, source, exclusion or execution gate fails.

The V1 result is reported separately under the same requirements. All results are DEV-limited. Classification A
does not authorize held-out execution, does not deploy V2, and does not certify Stage 3H.

## 8. Fidelity of evidence (Phase 1 gate)

Phase 1 reconciliation must distinguish class-hash parity (341/341 base worlds) from individual-world hash
parity (per-member comparison against the original safety-feasibility ledger), recompute matched-population
heterogeneity with paired cluster-bootstrap intervals, and quantify how much of the P2R information gain
survives singleton adjustment. Safe-set expansion under class refinement is mathematically monotonic and is NOT
itself proof of policy learnability. If the exploratory benefit fails a meaningful matched comparison, H-W4
STOPS before policy training.

## 9. Static source boundary (Phase 3)

Inference modules (projection, band adapter, features, policy) form an evaluator-free static import graph:
no module reachable from inference imports may import the counterfactual evaluator, metrics scoring, or any
`scripts/` module. The working-tree import cut in `stage3h-hw1-dev-v1/public-projection.mjs` (uncommitted,
owner-known) severs `public-projection.mjs → transforms.mjs → evidence.mjs`; H-W4 does not alter that file,
does not commit the cut, and records its hash. Frozen H-W1 dependencies and evidence hashes are untouched.
Every inference module is source-hashed in the evidence record.

## 10. Prohibitions inherited from the owner directive

No deployed-V1 change; no production disclosure of node value; no sealed/confirmatory campaign; no I-6 or
held-out qualification; no reuse of spent H-W1 validation populations; no change to frozen V4/H-W1 results;
no GitHub push or A5; no runtime authority promotion; V2 is never deployed; the H-W3-P2R result remains
exploratory; OBSERVABILITY_NECESSITY=NOT_PROVEN throughout.
