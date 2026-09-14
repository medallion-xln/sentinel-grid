# Environment Calibration Contract v1

`SENTINEL_ENVIRONMENT_CALIBRATION_V1` records the environment semantics that
Sentinel may rely on. It is immutable, deterministic, evidence-backed, and R0-only.
It does not learn mappings, adapt an environment, select actions, or modify the live
world.

## Environment and calibration identity

`environmentId` hashes only semantic identity anchors:

- the runtime environment identity and version,
- environment family and environment-schema version,
- observation, action, and objective schema hashes, and
- the transition/semantic contract version.

Display labels, filesystem paths, build timestamps, and unrelated implementation
details are excluded. A relevant schema or version change creates a new environment
identity; renaming an unrelated implementation detail does not.

`calibrationId` hashes the complete canonical semantic record: environment identity,
calibration version, evidence, semantic definitions, domain assessments, conflicts,
and R0 policy. `calibrationDigest` additionally binds that identity. A material
semantic change or calibration-version change creates a new calibration. Existing
records are deeply frozen and never rewritten.

## Semantic domains

The contract has explicit domains for observations, actions, resources, objectives,
failures, constraints, time, and transitions. Definitions are scoped by
`environmentId` and include an epistemic category, confidence, evidence references,
and provenance.

Observation definitions state type, units, valid domain, required/optional status,
and explicit missing-value behavior. Absence is never silently converted to zero or
false. Action definitions record parameters, preconditions, effects, side effects,
resource costs, duration, failure modes, legality constraints, and result
observability. Unknown action semantics remain `UNKNOWN`.

Resource directionality is explicit, including cases where lower values are better
or desirability is context-dependent. Objective definitions explicitly classify the
relationship between reward and objective truth; numerical reward is not assumed to
be the objective. Risk estimates remain `DERIVED` or `PREDICTED`, while failure
occurrence can be authoritative only as `OBSERVED` evidence.

Temporal definitions distinguish discrete, continuous, hybrid, and unknown time,
and record step meaning, cadence, delay, action duration, horizons, and uncertainty.
Transition claims independently represent stochasticity, partial observability,
action conditioning, external influence, delayed effects, hidden state,
nonstationarity, or unknown status.

## Confidence, conflict, and sufficiency

Each domain is assessed as `CALIBRATED`, `PARTIALLY_CALIBRATED`, `INSUFFICIENT`,
`CONFLICTED`, or `UNKNOWN`, with its own confidence. Overall calibration status is a
summary and is not a universal permission to reason.

`evaluateCalibrationSufficiency` evaluates a declared set of required domains and
minimum confidences. A legal-action query can require only action semantics, while
long-horizon reasoning can also require objective, temporal, transition, failure,
and resource semantics. A missing, unknown, insufficient, low-confidence, or
materially conflicted required domain returns `calibrationInsufficient=true` and
does not trigger a semantic fallback.

Conflicting evidence is grouped by environment, domain, claim target, and claim
type. Distinct values are all retained in a content-addressed conflict record.
Processing order cannot select a winner.

## Cross-environment isolation

Semantic-definition identities include `environmentId`. Equal field names or action
IDs in different environments therefore have different identities. The contract
does not create mappings by name.

The mapping interface supports `EQUIVALENT`, `PARTIALLY_EQUIVALENT`, `RELATED`,
`INCOMPATIBLE`, and `UNKNOWN`. Any non-unknown relation requires explicit evidence,
confidence, and provenance bound to both environments. With no proof, the relation
remains `UNKNOWN`.

## World-state and trace binding

Stage 3F.0 and Stage 3F.1 owner files remain unchanged. Additive binding records tie
a world-state `snapshotId` or causal-trace decision event to an exact immutable
calibration reference. A later calibration version produces a different binding and
cannot rewrite the historical one. Bindings reject runtime identity or environment
version mismatch.

All calibration records, sufficiency results, mappings, and bindings carry the exact
R0 denial policy:

```text
AUTHORITY=R0
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false
```

## Canonical ordering

Evidence, semantic definitions, domain assessments, evidence references, action
semantic sets, resource rules, objective conditions, and transition assumptions are
semantically unordered and sorted by deterministic identity or canonical value.
Meaningful numeric priority and horizon values are preserved as data rather than
being reordered.

Run certification with:

```sh
npm run test:stage3f2
npm run stage3f2:check
```
