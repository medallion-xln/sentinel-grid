# Sentinel Grid Stage 1.1 Release Notes

## Release

- Kernel package: `@sentinel-grid/kernel@0.3.0`
- Scope: Stage 1.1 Evidence Portability Hardening
- Authority: R0 evaluation and recommendation only
- Execution interface: absent

## Corrected design issue

Stage 0/1 used separate top-level payload construction in `verify.mjs` and `generate-evidence.mjs`. Although check durations were removed from both, the payload shapes were not identical, so their top-level hashes were not valid objects for direct comparison.

Stage 1.1 replaces both implementations with one shared canonical builder.

## New outputs

- `artifacts/deterministic-evidence.json`
- `artifacts/execution-diagnostics.json`
- `artifacts/verification-report.json`
- `deterministicEvidenceHash`
- `executionReportHash`

## New verification surfaces

- Recursive execution-field exclusion
- Runtime/platform independence tests
- Timing independence tests
- Object-key-order independence test
- Fixed canonical evidence fixture
- Stored-evidence freshness check
- Cross-machine evidence comparison command

## Certified result

- Automated tests: 46/46 PASS
- Universal adapter checks: 30/30 PASS
- Reference adapters: 2/2 PASS
- Internal SHA-256 entries: 52/52 PASS
- Stored/fresh deterministic evidence comparison: PASS
- Cross-runtime simulation comparison: PASS
- Authority: R0
- Executor exposed: no
- Live-world mutation interface: no

## Deterministic evidence hash

```text
417553fafe3a21870afb209814ce64c8cc9d9b5b01b5326a532c5aa108cdd4b3
```

Execution-report hashes are intentionally not fixed because they contain runtime identity, timestamps, and timing measurements.
