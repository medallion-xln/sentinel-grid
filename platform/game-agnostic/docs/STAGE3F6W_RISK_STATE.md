# Stage 3F.6-W — Decision-State Enrichment (Risk State)

Certification `7c5db9fbdd1d02bbee76ee12a0a5bf8a6e98c5a53adb510b0ed7e57ebd295fb6`
Analysis plan `2e2ef2685688edd7eeed37af2ff80625384a63de3b7c78d710c312d59eab7f90`
Risk-state contract `5b4d74b30f6a29e84dcab4d7736e108d20887e8acebf8ca01a9142cc3c38d17a`

## The question

When the Stage 3F.6-T router fails to see that NEXUS_SELECTOR beats RESOURCE_PRESERVING, what
decision-time information is missing? Stage 3F.6-T pointed at risk state first.

## Answer

**Risk information is only marginally missing.** Router errors do cluster in threat-heavy states, but
the threat structure behind them is already in the 30 CORE features. Of 12 candidate risk fields, one
added measurable information: `risk.retreatOptionCount`. That field describes the action surface, not
threat structure. It lifts CAL AUROC for NEXUS-vs-RESOURCE from 0.7878 to 0.7981 (+0.0103, 95% CI
+0.0045 to +0.0161). That is real but below the predeclared 0.02 materiality bar.
Result: **`B_CURRENT_RISK_SIGNALS_INSUFFICIENT`**.

## Discipline

- **DEV/CAL only.** Every prior HOLDOUT/OOD has been exposed and none was read. The evidence generator
  rebuilds DEV/CAL decision points only, and its CORE recomputation matches the stored corpus exactly
  (0 mismatches over 8,000 rows).
- **Plan frozen before metrics.** The analysis plan was hashed and written before any metric was computed.
- **Selection separated from measurement.** Fields were selected by 2-fold held-out AUROC inside DEV.
  The CORE vs CORE+RISK test ran once on CAL, which selection never touched.
- **Diagnostic models only.** No router was tuned, enlarged or promoted.

## Error forensics (CAL, frozen Stage 3F.6-T router)

848 errors in 4,000 episodes (21.2%). Of those, 588 missed a NEXUS-best episode, 213 moved away from a
RESOURCE-best episode, and 47 were other errors.

| Condition | n in | error in | error out | ratio | P(NEXUS best) in / out | P(RESOURCE best) in / out |
| --- | --- | --- | --- | --- | --- | --- |
| BOTTLENECK | 2761 | 0.252 | 0.123 | **2.05** | 0.250 / 0.123 | 0.559 / 0.768 |
| HIGH_HOSTILE | 2034 | 0.283 | 0.139 | **2.04** | 0.289 / 0.130 | 0.520 / 0.730 |
| UNCOVERED_THREAT | 2118 | 0.272 | 0.145 | **1.88** | 0.281 / 0.131 | 0.533 / 0.725 |
| NOVEL_STATE | 400 | 0.360 | 0.196 | **1.84** | 0.408 / 0.189 | 0.383 / 0.650 |
| UNSUPPORTED_THREAT | 1701 | 0.268 | 0.171 | 1.57 | 0.278 / 0.161 | 0.533 / 0.690 |
| THREATENED_CRITICAL | 664 | 0.304 | 0.194 | 1.57 | 0.301 / 0.192 | 0.521 / 0.644 |
| MULTI_OBJECTIVE | 2970 | 0.216 | 0.202 | 1.07 | 0.205 / 0.226 | 0.617 / 0.641 |
| LOW_ENERGY | 2251 | 0.192 | 0.238 | 0.80 | 0.191 / 0.236 | 0.646 / 0.595 |
| LATE_EPISODE | 1405 | 0.172 | 0.234 | 0.74 | 0.174 / 0.230 | 0.722 / 0.570 |
| FEW_ACTIONS | 3080 | 0.176 | 0.332 | 0.53 | 0.158 / 0.387 | 0.667 / 0.476 |
| LOW_ACTOR_HEALTH | 0 | — | — | — | not evaluable: actor health is always 100 | |

Errors concentrate where NEXUS is more often best: threat, bottleneck and novel states. But every one
of those conditions is defined from features the router already has. The router is not blind to
threat. It sees it and still cannot turn it into a correct NEXUS choice.

## Candidate risk fields

| Field (candidate name) | Decision | Reason |
| --- | --- | --- |
| `risk.retreatOptionCount` (escapeOptionCount) | **ACCEPTED** | DEV held-out AUROC +0.0089 |
| `risk.threatRelationCount` (activeThreatCount) | rejected | no increment (−0.0001) |
| `risk.maxThreatPressure` (maxThreatSeverity) | rejected | no increment (−0.0002) |
| `risk.threatenedCriticalCount` (objectiveExposure) | rejected | no increment (0.0000) |
| `risk.threatenedDependencyCount` (dependencyExposure) | rejected | no increment (−0.0019) |
| `risk.civilianHealthTotal` | rejected | no increment (−0.0006) |
| `risk.unavailableEntityCount` (actionConstraintCount) | rejected | no increment (−0.0018) |
| `risk.hostileAliveCount` | rejected | identical to CORE `relational.hostileEntityCount` |
| `risk.coveredThreatCount` | rejected | identical to CORE threatened − uncovered |
| `risk.threatenedCivilianCount` | rejected | constant (always 0) in this corpus; matches a CORE feature that is also always 0 |
| `risk.actorHealth` | rejected | constant (always 100): zero information |
| `risk.threatCoverageRatio` | rejected | undefined when no threat is observed; using it would require imputation |

The strongest single separators are threat counts (separability ≈ 0.61–0.62), but they duplicate
information CORE already carries. That is why they separate well alone and add nothing on top of CORE.

## Information gain (fit on DEV, measured once on CAL)

| Model | CAL AUROC (NEXUS vs RESOURCE) | Δ vs CORE | 95% CI | CAL log loss |
| --- | --- | --- | --- | --- |
| CORE (30) | 0.7878 | — | — | 0.4563 |
| CORE + accepted risk (31) | **0.7981** | **+0.0103** | +0.0045 … +0.0161 | 0.4490 |
| CORE + all usable risk (38) | 0.7942 | +0.0064 | +0.0002 … +0.0131 | 0.4505 |
| CORE + actor position (32) | 0.7939 | +0.0061 | +0.0018 … +0.0098 | 0.4536 |
| CORE + objective (32) | 0.7876 | −0.0002 | −0.0016 … +0.0010 | 0.4567 |
| CORE + temporal | not evaluated | — | — | — |

Multinomial soft-target CAL loss over all four policies: CORE 0.5341, CORE + accepted risk 0.5281.
Adding every usable risk field is *worse* than adding the one accepted field, which supports minimality.

## Representation findings

- **Risk state:** information present, not material.
- **Spatial:** actor position adds a small, significant increment (+0.0061), about the same size as the
  accepted risk field. Entity positions are not in the governed observation, so the spatial layout
  itself stays `SPATIAL_STATE_EVIDENCE_UNAVAILABLE`. No spatial subsystem was added.
- **Temporal:** `UNKNOWN`. 185 of 8,000 rows (2.3%) have fewer than three history frames. The frozen
  rule allows no imputation, so the temporal group could not be evaluated. `temporal.historyLength`
  alone separates fairly well (0.61), which is a reason to look again, not a finding.
- **Objective structure:** confirmed as not a gap. No incremental information (−0.0002), and errors
  barely concentrate in multi-objective states (1.07×).

## What this suggests about model capacity

The Stage 3F.6-T router picked NEXUS in only ~29% of the episodes where NEXUS was uniquely best. Yet
on the same kind of data a linear model over CORE ranks NEXUS-best above RESOURCE-best with AUROC ≈
0.79. So the ranking signal exists; what fails is turning it into a NEXUS choice. With NEXUS best in
only ~21% of episodes against RESOURCE's ~62%, the argmax decision rarely favours it.

This points at the decision rule and class balance more than at missing information or model size.
**It is a hypothesis, not a result of this stage.** No router was re-tuned to test it.

## Enriched contract

`SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1_1` (`673df1d1…`): the unchanged 30 CORE features plus
`risk.retreatOptionCount`, 31 in total. `V1` is not modified. The frozen rule created it because the
accepted field's CAL gain is significant. It is a **candidate only**, and any use of it would need
fresh confirmatory splits.

## Leakage and missing semantics

- **Static:** the risk module imports only determinism and the observation binding. No access to
  transitions, labels, regret, split metadata or authoritative world state.
- **Dynamic:** future-outcome invariance holds on 24 rebuilt decisions. There is no hidden world-state
  bypass: mutating the world after observation leaves risk unchanged.
- **Degradation:** removing threat information changed risk in 15 of 15 threatened decisions.
- **Missing semantics:** relationships absent → UNKNOWN; no action surface → UNAVAILABLE; coverage with
  no threat → NOT_APPLICABLE; none of these is ever zero.

**Audit correction (disclosed):** the first certification run failed `NO_FUTURE_OUTCOME_ACCESS`. The
pattern `/state_t\+1/` had matched the contract's own `prohibitedSources` documentation string, not an
access path. It was replaced by patterns that detect real transition access. The contract and the
analysis plan were not changed; the plan hash is identical across both runs.

## Roadmap

`FRESH_CONFIRMATORY_SPLITS_REQUIRED=false` and `READY_FOR_ROUTER_RETRAIN=false` under the frozen rule,
which reserves both for a material gain. `READY_FOR_STAGE3G=false`.

## Reproduce

```bash
npm run stage3f6w:generate
npm run stage3f6w:certify
npm run stage3f6w:check
npm run test:stage3f6w
```
