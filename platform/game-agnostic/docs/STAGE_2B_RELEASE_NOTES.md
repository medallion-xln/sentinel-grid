# Sentinel Grid Stage 2B Release Notes

## Release

- Kernel: `0.5.0`
- Adapter lock: version 2
- Snapshot contract: version 1
- Authority: R0

## Added

- Adapter-declared snapshot formats
- Snapshot schema and importer-method locking
- Universal snapshot envelope
- Secure file ingestion from approved roots
- Symlink and size-limit enforcement
- Game-owned payload schema validation
- Adapter-owned detached snapshot import
- Opaque in-memory snapshot handles
- Imported-state clone and contract validation
- Prime recommendations from detached snapshot handles
- Snapshot-specific deterministic certification evidence
- Snapshot validation and certification CLI commands

## Compatibility

The universal game contracts remain version 1. Existing Stage 2A packages must add a snapshot format declaration and importer before they can satisfy the Stage 2B production profiles.

## Authority

No execution, dispatch, live-world mutation, authority-token, or self-promotion interface was added.

## Certification baseline

- Automated tests: 79/79
- Production adapter checks: 38/38
- Snapshot ingestion checks: 14/14
- Combined checks: 52/52
- Registered adapters: 2
- Certified snapshot fixtures: 2
- Adapter lock hash: `86d8afa0e326b664f5675b0ac97f15d7ab4e413a7d9ec52e467c17cdd11969f3`
- Combined deterministic evidence hash: `1e203d793512fcdbc54652074d1b529b33a94706faae06145f90d1e69d57f888`
