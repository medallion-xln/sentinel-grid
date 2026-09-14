# Sentinel Causal Trace v1

`SENTINEL_CAUSAL_TRACE_V1` is the Stage 3F.1 evidence contract. It reconstructs a
shadow recommendation from decision-time observation through later incumbent-action
and outcome evidence. It does not grant execution authority and does not treat a
complete trace as proof of causation.

## Identity and lifecycle

The decision-time record contains the complete immutable evidence bundle:

1. observation evidence,
2. the certified `SENTINEL_WORLD_STATE_V1` snapshot,
3. feature-contract identity, feature values or their deterministic digest, and
   extractor identity,
4. zero or more generic predictor records marked `PREDICTED`,
5. the Stage 3E router evaluation, and
6. the R0 shadow recommendation.

Every component is content-addressed. `traceId` is the SHA-256 identity of that
decision-time bundle and never changes. `traceDigest` covers the current canonical
projection, including its append events, and therefore evolves as evidence arrives.
Wall-clock creation metadata is deliberately absent from canonical hashing. Equal
inputs, including the same durable observation identity, reproduce the same trace.

The initial projection is `OPEN`, with action and outcome status `UNKNOWN`. An
incumbent action, observed outcome, attribution, or instrumentation failure is a new
hash-addressed append event. Exact duplicate events are idempotent. Event order does
not affect the materialized projection because events are canonically ordered by
identity. The original decision-time event is never rewritten.

## Relationships are evidence semantics

Edges carry one of these explicit types:

- `TEMPORAL_LINK`
- `DERIVATION_LINK`
- `DECISION_DEPENDENCY`
- `ACTION_BINDING`
- `OUTCOME_BINDING`
- `CAUSAL_CLAIM`

Temporal order, derivation, decision dependency, an action match, and outcome binding
do not create a causal claim. `CAUSAL_CLAIM` is created only by an explicit derived
attribution with a non-`UNKNOWN` status, a named method, and evidence references.
Thus `TRACE_COMPLETENESS != CAUSAL_CERTAINTY` is represented directly in the
contract and in every trace projection.

Attribution status is one of `ESTABLISHED`, `SUPPORTED`, `PLAUSIBLE`, `CONFLICTED`,
or `UNKNOWN`. Raw events are retained independently of derived attribution.

## Conflicts, unknowns, and authority

Absent future evidence remains `UNKNOWN`; the contract does not fabricate action or
outcome placeholders. Multiple distinct claims to the single incumbent-action or
outcome slot are all retained and make the trace `CONFLICTED`. Environment identity
or version mismatch fails closed before an event is attached. Instrumentation
failure is evidence about the trace layer only and has no incumbent execution path.

The trace and recommendation contain the exact R0 denial policy:

```text
AUTHORITY=R0
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false
```

The incumbent remains the sole executor. The trace module has no dispatch, live-world
mutation, learning, or authority-escalation interface.

## Certification

Run:

```sh
npm run test:stage3f1
npm run stage3f1:check
```

The permanent machine-readable result is stored at
`artifacts/stage3f1-causal-trace/stage3f1-certification-result.json`.
