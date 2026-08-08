# Sentinel Grid Implementation Status

## Stage 0 through Stage 1.1

The universal contracts, variable observations, opaque actions, game-owned transitions and outcomes, deterministic hashing, seeded randomness, root-PUCT baseline, replay, R0 controls, universal conformance, and portable evidence separation remain implemented.

## Stage 2A — Production Adapter SDK

| Requirement | Implementation | Verification |
|---|---|---|
| External adapter registration | `ProductionAdapterRegistry.registerPackage()` | Locked registration tests |
| Package discovery | `discoverAdapterPackages()` | Two external package fixtures |
| Package containment | Relative paths, realpath containment, symlink rejection | Negative path tests |
| Version and source locking | Package, adapter, entrypoint, and configuration hashes | Drift rejection tests |
| Configuration | Schema validation and frozen resolved values | Defaults, bounds, unknown-key tests |
| Certification profiles | Immutable R0 profiles | Capability compatibility tests |
| Lock-before-import | Descriptor verification precedes dynamic import | Registry integration tests |
| Certification provenance | Package, configuration, lock, and profile evidence | Deterministic evidence |

## Stage 2B — Production Snapshot Ingestion

| Requirement | Implementation | Verification |
|---|---|---|
| Snapshot format declaration | `sentinelGrid.adapter.snapshotFormats` | Discovery tests |
| Snapshot schema locking | Lock version 2 with schema hashes | Lock integrity tests |
| Snapshot envelope | `validateSnapshotEnvelope()` | Contract tests |
| File security | Approved roots, regular files, symlink denial, byte limits | Negative ingestion tests |
| Game-owned validation | `validateJsonDocument()` against adapter schema | Nested and unknown-field tests |
| Adapter-owned conversion | `importSnapshot()` with detached ingestion context | Importer tests |
| Native state isolation | Private handle storage and clone checks | Opaque-state tests |
| Imported-state conformance | Observation, legality, outcome, terminal checks | Fixture certification |
| Deterministic provenance | Envelope, payload, state, schema, package, config, and lock hashes | Evidence tests |
| Prime from snapshots | `ProductionSnapshotIngestion.recommend()` | Repeatability tests |
| Terminal safety | Terminal snapshots ingest; search is denied | Terminal tests |
| Lifecycle | `get()`, `list()`, `release()` without state exposure | Lifecycle tests |
| R0 preservation | No dispatch or mutation fields | Snapshot certification evidence |

## Stage 2D-Z current status

The ZekNova Stage 1A-Z shadow adapter is now a locked production adapter. Six frozen fixtures pass exact observation, mask, target, transition, ranking, visit, and selection parity. Authority remains R0 and scripted NPC AI remains the sole executor.


## Stage 2E-Z

Real-state capture/parity evaluation and sustained-shadow certification machinery are implemented. Frozen replay self-tests pass. Production promotion remains denied until real Desktop captures satisfy the production thresholds.
