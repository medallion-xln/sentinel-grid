# Stage 3F.3 — Counterfactual / Veto Ledger v1

`SENTINEL_COUNTERFACTUAL_VETO_LEDGER_V1` records a decision comparison episode without turning agreement, disagreement, veto, or override into reward. It is evidence-only and retains the exact R0 authority boundary.

## Identity and inherited evidence

The deterministic `ledgerEntryId` is derived from an immutable decision episode. That episode binds the Stage 3F.1 trace and recommendation, the Stage 3F.0 world-state snapshot, and the Stage 3F.2 calibration through their canonical IDs, digests, and calibration bindings. Later evidence changes the materialized `ledgerDigest`, never the decision episode or `ledgerEntryId`.

The Sentinel proposal is copied as a sealed reference projection of the Stage 3F.1 recommendation: recommendation ID, proposed action, confidence, uncertainty, router evaluation ID, state snapshot ID, predictor evidence refs, abstention, and R0 authority. The selected action is a separate append event with independent `selectedBy` and `executedBy` actors.

## Append-oriented lifecycle

Evidence is added as immutable, content-addressed events:

1. selected action;
2. veto or override;
3. decision-time or post-hoc counterfactual;
4. Stage 3F.1 actual-outcome reference;
5. derived evaluation.

Events are deduplicated by content identity and sorted canonically, so identical attachments are idempotent and semantically unordered processing reproduces the same digest. Distinct claims for a singleton slot are retained and project the episode as `CONFLICTED`.

## Neutral disagreement and veto semantics

Selection comparison is `MATCH`, `PARTIAL_MATCH`, `DIFFERENT_ACTION`, `NO_SENTINEL_PROPOSAL`, `NO_SELECTED_ACTION`, or `UNKNOWN`. None means correct or incorrect. Vetoes use `ACCEPTED`, `OVERRIDDEN`, `VETOED`, `IGNORED`, `NOT_APPLICABLE`, or `UNKNOWN`; an absent reason remains explicitly unknown. Classified reasons preserve whether their source is directly observed or derived, plus confidence and provenance.

The contract fixes these boundaries:

```text
DISAGREEMENT != NEGATIVE_REWARD
AGREEMENT != CORRECTNESS
```

No ledger function assigns reward, decides training eligibility, updates a model, dispatches an action, or mutates the live world.

## Counterfactual and actual outcomes

Every counterfactual is `PREDICTED`, explicitly unexecuted, and has no observed-outcome reference. A `DECISION_TIME` counterfactual must bind predictor evidence already frozen in the Stage 3F.1 trace and cannot claim a generation time after the decision. Later analysis is labeled `POST_HOC_ANALYSIS` and remains separate.

Actual outcomes are never recreated in the ledger. An outcome attachment identifies an existing observed Stage 3F.1 outcome and its authoritative state snapshot.

## Calibration-gated evaluation

An evaluation declares the exact Stage 3F.2 semantic domains it needs. Without one authoritative outcome, evaluation remains `UNRESOLVED`. With insufficient calibration it becomes `INCOMPARABLE` with `COMPARISON_NOT_VALID=CALIBRATION_INSUFFICIENT`. With conflicts it becomes `CONFLICTED`. Only a conflict-free episode with an authoritative outcome and sufficient declared calibration may retain outcome-comparison metrics.

Stage 3F.4 receives evidence-readiness metadata—resolution, outcome authority, calibration sufficiency, conflict freedom, and decision-time prediction availability—but Stage 3F.3 deliberately does not produce a training-eligibility decision.

## Authority

All ledger records use the default R0 policy:

```text
AUTHORITY=R0
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false
INCUMBENT_SOLE_EXECUTOR=true
ONLINE_LEARNING_ENABLED=false
```
