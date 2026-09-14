# Stage 3F.5 — Integrated Live Shadow and ASCII Observatory

Stage 3F.5 composes the certified World State, Calibration, Causal Trace,
Counterfactual/Veto Ledger, and Shadow Experience contracts around the existing
deterministic Sentinel Forge adapter. It does not replace or modify those contracts.

The incumbent action is chosen first and is executed exactly once by the Forge
adapter. Shadow instrumentation runs across an error boundary: missing evidence is
reported as `DEGRADED` or `PARTIAL_EVIDENCE`, and never blocks, replaces, or retries
the incumbent transition. Outcomes attach after execution and may remain `UNKNOWN`.

The Stage 3E logistic router is evaluated from the exact 51-feature runtime contract
and is bound to its frozen hash. Candidate recommendations carry their real producer
identity. The certification campaign uses the existing deterministic Nexus selector;
if the router requests the Stage 3D V2B fallback without genuine V2B evidence, the
integration abstains instead of synthesizing an expert output. No future truth is
used in decision-time features.

## Observatory

Run:

```sh
npm run observatory -- --view WORLD
npm run observatory -- --view TRACE --full-ids
```

Views are `WORLD`, `STATE`, `DECISION`, `TRACE`, `COUNTERFACTUALS`, `EXPERIENCE`,
and `METRICS`. The Observatory receives copied presentation frames through a bounded
buffer. A disconnected or slow consumer drops frames. Its exposed object has only
snapshot/render controls and no adapter, dispatch, execution, mutation, override,
model, threshold, environment, training, or authoritative-state writing surface.

Telemetry and display cadence are excluded from governed campaign identity.
