# Stage 2A — Production Adapter SDK

## Purpose

Stage 2A turns the original in-repository Adapter SDK into a production package boundary. A game adapter can now live in an external package and be discovered, locked, configured, loaded, and certified without embedding game-specific logic in the Sentinel Grid kernel.

## Security order

1. Discover package metadata from explicit roots.
2. Validate relative entrypoint and schema paths.
3. Reject symbolic links.
4. Hash every package file deterministically.
5. Verify the package against `sentinel-grid.adapters.lock.json`.
6. Validate and resolve the locked configuration.
7. Import the exact locked entrypoint.
8. Call the declared adapter factory.
9. Validate the universal adapter contract.
10. Verify manifest identity and adapter version.
11. Enforce the selected certification profile.
12. Run deterministic conformance and Prime replay.

Adapter code is not executed during discovery.

## Lock coverage

Every locked adapter records:

- NPM-style package name and exact package version
- Complete package SHA-256
- Entrypoint path and SHA-256
- Configuration schema path and SHA-256
- Game ID
- Adapter ID
- Adapter version
- Factory export
- Certification profile
- Fully resolved adapter configuration
- Configuration SHA-256

The lock itself has a canonical SHA-256 and contains no machine-specific absolute paths.

## Configuration

Each adapter package supplies a JSON configuration schema. Stage 2A supports the deterministic subset required for adapter configuration:

- `type`
- `properties`
- `required`
- `additionalProperties`
- `default`
- `enum`
- `minimum` and `maximum`
- `minLength` and `maxLength`
- `pattern`
- `items`, `minItems`, and `maxItems`

Resolved configuration is frozen before being passed to the adapter factory.

## Certification profiles

Built-in profiles are immutable:

- `universal-r0`
- `production-r0`
- `imperfect-information-r0`
- `stochastic-r0`

Profiles may require adapter capabilities and define default conformance budgets. Profiles cannot grant execution authority.

## Evidence

Evidence version 3 adds production certification provenance:

- Package identity and version
- Package and entrypoint hashes
- Configuration schema and resolved configuration hashes
- Adapter lock hash
- Certification profile and version

Machine-specific runtime information remains isolated in execution diagnostics.
