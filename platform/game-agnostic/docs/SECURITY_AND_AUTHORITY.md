# Security and Authority Boundary

## Included operations at R0

- Observe adapter-provided detached or read-only state
- Enumerate adapter-provided legal actions
- Clone state for simulation
- Simulate on detached clones
- Rank and recommend legal actions
- Produce deterministic evidence and replay hashes

## Explicitly absent

- Live runtime dispatcher
- World mutation API
- Command bus
- Capability-token issuer
- Authority-policy editor
- Self-promotion mechanism
- Production credentials

## Enforcement layers

1. Adapter manifests must declare R0 and `executionInterface=false`.
2. Adapter objects are rejected when their public members resemble execution or authority-escalation surfaces.
3. Prime creates the exact frozen R0 policy internally.
4. Recommendation packets preserve the R0 policy.
5. `step()` receives `mode: detached-simulation` and a cloned state.
6. Conformance tests verify source-state isolation.
7. Future authority must live in a separate package and certification lineage.

## Snapshot ingestion controls

- Approved-root allowlist
- Regular-file requirement
- Symbolic-link rejection
- Configurable byte ceiling
- Exact adapter/version/format/schema lock matching
- JSON envelope and game-owned payload validation
- Adapter importer runs only in detached snapshot mode
- Native imported state remains private behind an opaque handle
- Terminal snapshots cannot be searched
- R0 recommendation boundary remains unchanged


## Stage 2E-Z shadow rule

Shadow records are evidence only. Passing sustained-shadow thresholds does not create authority, an execution token, or a dispatcher. Human authorization remains mandatory for any future authority change.
