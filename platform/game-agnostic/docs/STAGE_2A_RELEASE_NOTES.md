# Stage 2A Release Notes — v0.4.0

Stage 2A adds a production adapter package system while retaining the Stage 1.1 deterministic evidence and R0 authority boundary.

## Added

- Production adapter package discovery
- Full package integrity hashing
- Path-independent adapter lockfile
- Version and source locking
- Configuration schemas and frozen resolved configuration
- Immutable certification profiles
- Production adapter registry
- Lock-before-import enforcement
- Production certification provenance in evidence version 3
- Adapter discovery, lock, and certification command-line tools
- Two external package fixtures

## Verification target

- 62 automated tests
- 34 production adapter certification checks
- Two production package registrations
- Exact deterministic evidence replay
- Complete repository SHA-256 manifest
