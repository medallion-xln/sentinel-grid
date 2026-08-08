# Stage 1.1 — Evidence Portability

## Purpose

Sentinel Grid separates reproducible certification evidence from machine-specific execution diagnostics.

Two runs are deterministically equivalent when they use the same:

- kernel and contract versions
- adapter manifests and versions
- initial states and observers
- seeds and search settings
- canonical observations and legal actions
- transition and outcome behavior
- recommendation results
- conformance pass/fail results

They do not need the same operating system, CPU architecture, hostname, process identifier, Node.js version, wall-clock timestamp, or execution timing.

## Deterministic evidence

`artifacts/deterministic-evidence.json` contains only portable inputs, outputs, hashes, versions, action keys, and check results. Its canonical SHA-256 is exposed as:

```text
deterministicEvidenceHash
```

The hash uses Sentinel Grid canonical serialization, so object-property insertion order cannot change it.

The deterministic payload excludes execution-only check fields recursively, including:

- `durationMs`
- timestamps
- runtime identity
- operating-system platform
- CPU architecture
- hostname and process identifier
- working directories and local absolute paths

Adapter manifests are retained without filtering because they are versioned deterministic inputs. The diagnostic filter applies only to conformance-check details.

## Execution diagnostics

`artifacts/execution-diagnostics.json` contains:

- generation time
- Node.js version
- operating-system platform
- CPU architecture
- hostname and process identifier
- per-check duration
- per-adapter total duration

Its hash is exposed as:

```text
executionReportHash
```

This hash is expected to differ between machines and may differ between repeated runs on one machine.

## Shared builder

Both `scripts/verify.mjs` and `scripts/generate-evidence.mjs` call the same `createVerificationReport()` implementation. They can no longer define subtly different deterministic payloads.

## Verification commands

Generate evidence artifacts:

```bash
npm run evidence
```

Verify that the stored deterministic artifact matches a fresh run:

```bash
npm run evidence:check
```

Compare deterministic artifacts produced on two machines:

```bash
npm run evidence:compare -- \
  path/to/machine-a/deterministic-evidence.json \
  path/to/machine-b/deterministic-evidence.json
```

The comparison ignores diagnostics by comparing only `deterministicEvidenceHash`.

## Versioning rule

A change to the deterministic payload shape requires an explicit increment of `DETERMINISTIC_EVIDENCE_VERSION`. Execution-diagnostics changes use their separate diagnostics version and do not redefine deterministic equivalence.
