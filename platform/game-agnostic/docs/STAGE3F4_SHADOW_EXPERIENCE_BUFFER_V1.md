# Stage 3F.4 — Shadow Experience Buffer v1

`SENTINEL_SHADOW_EXPERIENCE_V1` indexes governed Stage 3F evidence as deterministic transition episodes for future offline analysis. It does not train models, create rewards, update weights, dispatch actions, or mutate live state.

## Three separate decisions

An experience is always `RECORDED` when its immutable episode shell exists. A later validation event may classify it as `VALIDATED`, `INVALID`, `INCOMPLETE`, or `CONFLICTED`. A still-later eligibility event evaluates one explicit purpose as `ELIGIBLE`, `INELIGIBLE`, or `UNRESOLVED`.

```text
RECORDED_EXPERIENCE
!= VALIDATED_EXPERIENCE
!= TRAINING_ELIGIBLE_EXPERIENCE
```

Eligibility is evidence metadata only. Stage 3F.4 performs no training.

## Experience identity and lineage

`experienceId` is the content identity of an immutable episode that binds:

- the Stage 3F.0 `state_t` snapshot and observation;
- the Stage 3F.1 causal trace and recommendation;
- the Stage 3F.2 calibration ID and digest;
- the Stage 3F.3 counterfactual/veto ledger;
- future partition guards for causal episode, state, and derived-variant identity.

Later execution, prediction, outcome, validation, eligibility, and prediction-error evidence are immutable append events. They change `experienceDigest`, not `experienceId`. Equal values from different trace episodes remain different experiences.

## Transition integrity

The executed action is imported from the ledger's selected-action evidence and retains separate `selectedBy` and `executedBy` actors. Sentinel's recommendation stays a distinct reference. Conflicting action claims are all retained.

Predicted next state and predicted outcome remain `PREDICTED` references. Actual next state and outcome must bind an observed Stage 3F.1 outcome and a verified Stage 3F.0 snapshot. Missing evidence remains unknown. Multiple authoritative outcome claims remain conflicted.

Validation records provenance, schema, environment, calibration-reference, action, outcome, temporal order, epistemic-contamination, prediction-separation, trace, ledger, hindsight, and conflict gates. Transition timing records start, action, end, duration, outcome delay, and whether the attribution window is bound.

## Purpose-specific eligibility

The contract defines independent profiles for:

- transition-model training evidence;
- router analysis;
- prediction calibration;
- counterfactual evaluation;
- strategic policy research.

Each profile declares required Stage 3F.2 semantic domains and whether an authoritative outcome or decision-time prediction is required. Human intervention is retained as context and is not converted to negative reward. A transition may therefore be eligible for transition analysis while remaining ineligible for prediction calibration.

## Prediction error

Prediction errors are structured components, not a universal scalar. Every component names its semantic domain, prediction reference, actual-outcome reference, metric type, and value. Stage 3F.2 sufficiency is mandatory. Insufficient calibration produces `INCOMPARABLE`; missing evidence produces `UNKNOWN`; conflicts produce `CONFLICTED`.

## Frozen snapshots and storage

The buffer stores immutable experience versions and projects one canonical latest version per `experienceId`. A frozen snapshot records exact experience IDs and digests, eligibility profile, calibration constraints, partition-guard metadata, and source buffer identity/digest. Later buffer additions cannot mutate an existing frozen snapshot; a new selection creates a new snapshot identity.

Canonical contracts, source, tests, documentation, and bounded certification artifacts belong in Git. Large operational experience payloads should live in durable content-addressed evidence storage, with their immutable hashes and governed references retained by the buffer. Temporary agent or scratch directories must never become authoritative storage.

## Authority and learning boundary

```text
AUTHORITY=R0
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false
INCUMBENT_SOLE_EXECUTOR=true
MODEL_TRAINING_PERFORMED=false
AUTOMATIC_REWARD_ASSIGNMENT=false
ONLINE_LEARNING_ENABLED=false
```
