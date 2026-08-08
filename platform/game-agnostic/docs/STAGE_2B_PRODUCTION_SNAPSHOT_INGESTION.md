# Stage 2B — Production Snapshot Ingestion

## Purpose

Stage 2B allows Sentinel Grid to evaluate real game states without teaching the universal kernel any game's native save format or exposing live game objects.

## Trust boundary

1. A snapshot file is treated as untrusted input.
2. The file must be a regular non-symlink file inside an approved root and below the configured byte limit.
3. The universal snapshot envelope is validated.
4. Adapter identity, version, format, and schema are matched against the exact adapter lock.
5. The game-owned payload is validated against the locked snapshot schema.
6. The adapter importer receives a clone in `detached-snapshot-ingestion` mode.
7. The resulting state is tested for clone isolation, terminal determinism, observation validity, legal-action validity, outcome validity, and source immutability.
8. The state is stored privately behind a deterministic opaque handle.
9. Prime searches only a detached clone of the stored state.
10. Authority remains R0.

## Deterministic record

Each accepted snapshot produces hashes for:

- canonical envelope
- game-owned payload
- imported detached state
- observations
- legal actions
- outcomes
- adapter package
- adapter configuration
- adapter lock
- snapshot schema
- recommendation, when requested

Local paths are not included in deterministic certification evidence.

## Non-goals

Stage 2B does not:

- connect to a live game process
- poll a runtime
- execute actions
- mutate save files
- grant authority
- define a ZekNova-specific state format in the kernel
