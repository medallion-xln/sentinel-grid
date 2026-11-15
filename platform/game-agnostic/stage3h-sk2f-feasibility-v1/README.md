# Stage 3H-SK2-F — selective safety feasibility and infrastructure readiness

AUTHORITY: R0 (recommendations only) · BASE HEAD `16ae5c21` · existing-evidence analysis and scoped engineering.

**Result: B — `SELECTIVE_ASSURANCE_FEASIBILITY_UNSUPPORTED`** for the frozen SK1 policy against the research targets
(selective risk at most 1%, 95% confidence, coverage at least 40%).
**Recommended next scientific priority: `WITHIN_MENU_ACTION_RISK_DISCRIMINATION`.**

SK1 is unchanged: classification B, not qualified. Contract B is neither adopted nor certified.

**Not done here, by design:** no training or retraining, no new threshold, no rerun of the spent validation, no new
population, no holdout, no deployment, no authority change, no push.

## Deliverables

| file | content |
|---|---|
| `SK2_F_FEASIBILITY.md` | endpoints, bounds, the three-way feasibility verdict, classification |
| `SK2_F_RISK_COVERAGE_EVIDENCE.md` | risk-coverage relationships on exploration; all POST_HOC_EXPLORATORY_ONLY |
| `SK2_F_SAMPLE_SIZE_PLAN.md` | exact sample sizes and pass probabilities; a paired design for the discrimination hypothesis |
| `SK2_F_ACTION_DISCRIMINATION.md` | ordering versus ranking-contract versus abstention errors; public identifiability; hypothesis H-DISC |
| `SK2_F_REPRODUCIBILITY_STATUS.md` | clean-checkout limits, import-cut audit, exclusion custody, backup procedure, readiness |
| `SK2_F_PROSPECTIVE_CONTRACT.md` | the selective-assurance contract proposal, entry conditions, owner decisions |

## Layout

| path | role | needs privileged local data? |
|---|---|---|
| `diagnostics/extract-exploration.mjs` | applies the frozen model to the existing exploration records; in-sample and out-of-bag readings; no training | yes |
| `diagnostics/feasibility.mjs` | endpoints, bounds, sample sizes, risk-coverage, discrimination, verdict | no |
| `infra-audit/` | import-cut audit, reproducibility status, backup procedure | partly |
| `evidence/` | tracked machine records; opaque aliases only | — |

## Run

```
cd platform/game-agnostic/stage3h-sk2f-feasibility-v1
node --test diagnostics/*.test.mjs infra-audit/*.test.mjs
node diagnostics/feasibility.mjs check             # tracked evidence only
node diagnostics/extract-exploration.mjs check     # needs ../stage3h-sk1-safety-kernel-v1/work/
```

## Rules for anyone continuing

- The research targets are owner inputs. Do not adjust them to observed outcomes.
- SK1 VALIDATION is spent: historical arithmetic only. SK1 EXPLORATION is development data: anything developed on it
  must still be validated on fresh classes.
- The out-of-bag reading is a diagnostic estimator of the frozen ensemble, not the frozen rule.
- No figure in this lane is an operating point.
- Do not add or change files under the SK1 lane's `kernel/`, `adapters/`, `api/` or `infra/`.
- A discrimination or selective campaign needs a new source and model identity, fresh populations through
  `successor/exclusions-v2.mjs`, a frozen pre-registration and separate owner authorization.
