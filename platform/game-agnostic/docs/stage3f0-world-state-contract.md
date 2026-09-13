# Stage 3F.0 — World State Contract v1

`SENTINEL_WORLD_STATE_V1` is the canonical deterministic state-evidence contract for Stage 3F. It is additive and evaluation-only.

Each fact is bound to an environment identity and version, a path in one of the declared world-state sections, explicit uncertainty and provenance, and exactly one epistemic category: `OBSERVED`, `DERIVED`, `PREDICTED`, or `UNKNOWN`.

Evidence precedence is deterministic:

1. `AUTHORITATIVE_OBSERVATION`
2. `VALIDATED_DERIVATION`
3. `CALIBRATED_PREDICTION`
4. `GENERATED_HYPOTHESIS`
5. `UNKNOWN`

Lower-authority evidence is retained for audit but cannot overwrite higher-authority state. Equal-authority contradictions fail closed. Missing information produces an explicit deterministic `UNKNOWN` fact rather than a fabricated default. Equivalent evidence sets—including reordered and duplicated evidence—produce the same canonical serialization and snapshot digest.

Every snapshot carries the standard R0 denial policy. The contract cannot dispatch, mutate the live world, issue authority tokens, or change authority policy. Stage 3F.0 does not add prediction, learning, simulation, or execution.
