# Sentinel Grid Game-Agnostic Architecture

## Identity

Sentinel Grid is a universal decision-intelligence kernel. A game adapter translates a particular runtime into Sentinel Grid contracts. ZekNova is the first production adapter, not a hard-coded platform dependency.

## Universal flow

```text
Game-owned live state or snapshot file
  → adapter-owned snapshot/import and information boundary
  → canonical ObservationPacket
  → adapter-owned legal ActionDescriptor set
  → Sentinel Prime detached search
  → deterministic RecommendationPacket
  → no execution at R0
```

## Kernel-owned responsibilities

- Contract validation
- Canonical serialization and hashing
- Seed derivation and deterministic randomness
- Legal-action-only search
- Recommendation packet creation
- Replay verification
- Adapter conformance testing
- R0 default-denial authority

## Adapter-owned responsibilities

- Native game-state representation
- Observer identities and information boundaries
- Canonical observation encoding
- Action identifiers, actors, targets, and parameters
- Legality and availability
- Detached state cloning
- Seeded transition behavior
- Immediate reward semantics
- Terminal-state detection
- Outcome vector and scalarization
- Game-specific parity testing

## Non-negotiable invariants

1. The kernel never imports a production game adapter by name.
2. Observation size is defined by the adapter schema and may vary by state.
3. Action identifiers are opaque strings to the kernel.
4. Targets and parameters are validated as JSON but interpreted only by the adapter.
5. Prime searches only adapter-provided legal actions.
6. Terminal states expose no legal actions.
7. Adapter `step()` operates on detached simulation state.
8. `observe()`, `legalActions()`, `outcome()`, and `recommend()` cannot mutate source state.
9. All stochasticity receives a deterministic derived seed and PRNG.
10. Every recommendation carries hashes sufficient for exact replay verification.
11. The kernel and Stage 0/1 adapters expose no execution surface.
12. Authority defaults to R0 and cannot self-escalate.

## Why two reference adapters are included

`reference-token-race` demonstrates alternating actors, opaque actions, structured targets, and variable observation length.

`reference-grid-rescue` demonstrates partial information, seeded stochastic transitions, structured game-defined targets, and a different objective vector.

Both run through the same kernel and conformance laboratory without kernel changes.

## Evidence boundary

Certification output is divided into two planes:

```text
Conformance results
  ├─ deterministic evidence
  │    versions, hashes, canonical inputs and outputs, pass/fail results
  │    → portable deterministicEvidenceHash
  └─ execution diagnostics
       runtime, platform, architecture, hostname, timestamps, timings
       → machine-specific executionReportHash
```

Both outputs are produced by one shared builder. Runtime diagnostics cannot enter the deterministic evidence payload.

## Snapshot boundary

Production snapshots are admitted through a versioned universal envelope, a locked game-owned schema, and an adapter-owned importer. Imported native state is retained behind an opaque handle and is never part of the public SDK response. Prime receives only a detached clone.
