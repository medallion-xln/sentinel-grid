# Stage 3H-SK1.1 — safety assurance, failure attribution and reproducibility hardening

AUTHORITY: R0 (recommendations only) · BASE HEAD `179922dd` · everything here is diagnostic or engineering.

SK1 is accepted as `SK1_COMPLETE_ONE_PASS_EXECUTED`, classification B
(`SAFETY_KERNEL_MATERIAL_IMPROVEMENT_NOT_QUALIFIED`). This lane does not rerun, retrain or re-threshold it. The SK1
lane (`../stage3h-sk1-safety-kernel-v1/`) is untouched; this lane only imports from it.

**Not done here, by design:** no new policy, no new population, no validation or holdout run, no change to any frozen
parameter, model, result or predecessor verdict, no authority change, no push.

## Deliverables

| file | content |
|---|---|
| `SK1_REPRODUCIBILITY_GAP.md` | what reproduces from committed source, what needs local or protected material, backup plan |
| `SK1_FAILURE_ATTRIBUTION.md` | the decision-failure matrix, the 39 failing classes, the two accepted failures |
| `SK1_RISK_COVERAGE_ANALYSIS.md` | abstention effectiveness, descriptive risk-coverage curve, calibration, matched cohorts |
| `SK1_SAFETY_CONTRACTS.md` | Contract A (unchanged) and Contract B (selective assurance; designed, not certified) |
| `SK1_ENGINEERING_ASSURANCE.md` | the hardened R0 envelope, twelve verification items, findings against the frozen kernel |
| `SK2_RESEARCH_PROPOSAL.md` | the next scientific hypothesis and the decisions it needs |

## Layout

| path | role | needs privileged local data? |
|---|---|---|
| `diagnostics/extract-matrix.mjs` | replays frozen decisions on the frozen validation records, reconciles exactly, writes the matrix | yes |
| `diagnostics/analyze.mjs` | abstention, risk-coverage, calibration, cohort and failure analysis from tracked evidence | no |
| `r0/` | `SK1_R0_ASSURED_API_V1_1`: a fail-closed envelope around the frozen API; decisions pass through unchanged | only the 600-class replay test |
| `repro/` | dependency inventory, source verification, clean-checkout probe, backup manifest helper | inventory of local data only |
| `evidence/` | tracked machine records; opaque aliases only | — |

## Evidence files

| file | written by |
|---|---|
| `evidence/SK1_1_DECISION_FAILURE_MATRIX.json` | `diagnostics/extract-matrix.mjs --write` |
| `evidence/SK1_1_RISK_COVERAGE.json`, `evidence/SK1_1_FAILURE_ATTRIBUTION.json` | `diagnostics/analyze.mjs --write` |
| `evidence/SK1_1_ENGINEERING_ASSURANCE.json` | `r0/record-assurance.mjs --write` |
| `evidence/SK1_1_REPRO_INVENTORY.json` | `repro/inventory.mjs --write` |

Every writer creates its file exclusively and has a mode that recomputes and compares without writing.

## Run

```
cd platform/game-agnostic/stage3h-sk1-1-assurance-v1
node --test diagnostics/*.test.mjs r0/*.test.mjs repro/*.test.mjs
node diagnostics/analyze.mjs check            # tracked evidence only
node diagnostics/extract-matrix.mjs check     # needs the SK1 class records in ../stage3h-sk1-safety-kernel-v1/work/
node repro/inventory.mjs verify
```

Pass test files as globs, not as a bare directory. Tests that need privileged data skip with a message when it is
absent.

## Rules for anyone continuing this work

- The 600 SK1 validation classes are spent. They are diagnostic evidence only and must never be used to fit, tune,
  threshold or validate a policy. Every alternative-threshold figure in this lane is labelled POST_HOC_DIAGNOSTIC.
- Do not add or change any file under the SK1 lane's `kernel/`, `adapters/`, `api/` or `infra/`: the frozen runner
  hash-binds those directories and its check mode would fail.
- Any future allocator must load `../stage3h-sk1-safety-kernel-v1/successor/exclusions-v2.mjs`.
- A corrected kernel or a new policy needs a new source and model identity, fresh populations, a frozen
  pre-registration and separate owner authorization.
