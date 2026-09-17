# Stage 3F.6-D — Cost-Sensitive Policy Decision Rule

Certification `f262c3477631a92007e1a40d4ba85bc03874fab6c1a68e78013378de2b909f3b`
Decision freeze `f02ad9b95b78f050dc5aa28c32761e4150d3579604bebb9dc9be6d59abca1363`
Cost matrix `73cf38f64f4ac13c34f2568f78c99de6cb54010153b71fc0fda1cede2b8059d6`

## The question

Is the Stage 3F.6-T router's low practical value caused by its decision rule? The hypothesis: the
router ranks NEXUS-best episodes reasonably (CAL AUROC ≈ 0.79) but under-selects NEXUS because argmax
favours the RESOURCE majority.

## Answer

**No. The hypothesis is refuted.** Cost-sensitive rules do not select NEXUS more; they select it *less*.
DEV costs show why: capturing a NEXUS-best episode saves little, because NEXUS still carries 32.8
regret even when it is the best available policy, while a false NEXUS pick when RESOURCE is best
costs 60.0. The best rules gain a little over always-RESOURCE by leaning further toward RESOURCE.
They stay below the materiality bar and collapse onto it.
Result: **`B_COST_SENSITIVE_RULE_BETTER_BUT_NOT_MATERIAL`**.

## Discipline

- **Frozen router, not retrained.** The frozen Stage 3F.6-T router supplies the scores: 30
  `DEPLOYABLE_CORE` features, router hash `25876d18…`. The candidate V1_1 risk field is not used.
- **DEV builds costs.** The cost and value matrices and the class weights come from DEV only.
- **CAL chooses bounded constants.** Probability temperature (T = 1), the NEXUS threshold (0.6), and the
  headline rule (lowest CAL regret among B–E: expected-value maximization).
- **Fresh confirmatory splits.** Seeds 801–803 (HOLDOUT) and 811 (OOD), disjoint from every prior
  Stage 3F.6 seed space. Every topology, record and state in both the Stage 3F.6-C corpus and the
  Stage 3F.6-T confirmatory set is excluded, and 653 candidates were rejected for topology collision.
  Record, state and topology overlap: 0. The splits stayed sealed until the decision freeze was written.

## DEV cost matrix (mean regret: selected policy × true best regime)

| selected \ best | RESOURCE | NEXUS | OBJECTIVE | THREAT |
| --- | --- | --- | --- | --- |
| RESOURCE | **9.6** | 64.0 | 74.7 | 84.2 |
| NEXUS | 60.0 | **32.8** | 41.3 | 37.3 |
| OBJECTIVE | 83.1 | 54.3 | **34.4** | 9.8 |
| THREAT | 48.4 | 45.6 | 19.4 | **4.4** |

The asymmetry that decides everything: RESOURCE is nearly regret-free when it is best (9.6), while NEXUS
is expensive even when it is best (32.8).

## Fresh HOLDOUT (n = 6000)

Always-RESOURCE: accuracy 0.6162, regret 25.84, p95 129. Oracle: 0.7028 / 15.43.

| Rule | acc | regret | p95 | Δacc vs RES (CI) | Δregret vs RES (CI) | Δregret vs argmax | NEXUS capture | RES selected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A argmax | 0.6157 | 24.78 | 127 | −0.0005 (−0.008, +0.007) | −1.06 (−1.86, −0.29) | — | 30.7% | 84.6% |
| B class-weighted | 0.4967 | 32.91 | 136 | **−0.1195** | **+7.08** | +8.14 | 76.3% | 46.7% |
| C expected regret | 0.6215 | 24.46 | 128 | +0.0053 (+0.000, +0.010) | −1.37 (−1.95, −0.84) | −0.31 (n.s.) | 14.8% | 92.2% |
| **D expected value** (headline) | **0.6250** | **24.51** | 128 | **+0.0088** (+0.005, +0.012) | **−1.33** (−1.74, −0.94) | −0.27 (n.s.) | 5.3% | **96.2%** |
| E NEXUS threshold | identical to argmax (CAL chose τ = 0.6, above where it overrides) | | | | | | | |

The headline rule falls short on both materiality tests: accuracy +0.0088 is below the 0.01 bar, and
regret −1.33 is below the 2.0 bar. It also collapses pathologically (96.2% RESOURCE against a 76%
best-set share).

## NEXUS capture: the central trade-off (HOLDOUT)

| Rule | NEXUS best | captured | selected | false NEXUS | regret saved | regret added | net |
| --- | --- | --- | --- | --- | --- | --- | --- |
| argmax | 1287 | 30.7% | 785 | 294 | 22,420 | 20,522 | +1,898 |
| class-weighted | 1287 | 76.3% | 2,853 | 1,312 | 46,140 | 87,016 | **−40,876** |
| expected regret | 1287 | 14.8% | 372 | 135 | 13,860 | 8,677 | +5,183 |
| expected value | 1287 | 5.3% | 102 | 26 | 5,290 | 2,003 | +3,287 |

Selecting more NEXUS adds regret faster than it saves it. Argmax's 30.7% capture is roughly break-even;
the rules that net the most regret select NEXUS far less often.

## False-selection harm (HOLDOUT)

| Rule | wrong selections | mean added | p90 | p95 | p99 | worst |
| --- | --- | --- | --- | --- | --- | --- |
| argmax | 1261 | 44.47 | 122 | 150 | 212 | 321 |
| class-weighted | 1761 | 59.56 | 132 | 153 | 213 | 303 |
| expected regret | 1298 | 41.74 | 118 | 150 | 190 | 321 |
| expected value | 1332 | 40.89 | 113 | 144 | 186 | 321 |
| *always-RESOURCE (context)* | 1452 | 42.99 | — | 144 | — | 321 |

**Disclosed criterion flaw.** The inherited harm criterion compares a rule's false-selection p95 against
always-RESOURCE's p95 *total* regret (129). Always-RESOURCE fails that bar itself (144). The headline
rule's harm is no worse than always-RESOURCE's own, so its `acceptableFalseSelectionHarm=false` reflects
a criterion almost nothing near RESOURCE can pass. It was not waived. It does not change the outcome:
materiality and collapse fail independently.

## Fresh OOD (n = 6000)

Always-RESOURCE: 0.7468 / 24.84. Oracle: 0.8092 / 16.65.

| Rule | acc | regret | Δacc vs RES (CI) | Δregret vs RES (CI) | RES selected |
| --- | --- | --- | --- | --- | --- |
| argmax | 0.7383 | 25.46 | −0.0085 (worse) | +0.62 (worse) | 92.9% |
| class-weighted | 0.6493 | 35.79 | −0.0975 | +10.94 | 66.0% |
| expected regret | 0.7433 | 24.88 | −0.0035 (worse) | +0.04 (n.s.) | 97.1% |
| **expected value** | **0.7463** | **24.75** | −0.0005 (n.s.) | −0.10 (n.s.) | **98.8%** |

The headline rule survives OOD only by becoming nearly always-RESOURCE. Plain argmax, the Stage 3F.6-T
rule, is significantly *worse* than always-RESOURCE on fresh OOD on both metrics.

## Expected-cost calibration

Across fresh HOLDOUT, the expected regret of the chosen policy (rule C) correlates weakly with realized
regret: Pearson 0.214, Spearman 0.243. Deciles rise broadly (expected 14 → 42, realized 10 → 43), except
that the lowest-expected-cost decile realizes 18. The layer carries real but coarse information.

## Diagnosis

- **Primary result:** `B_COST_SENSITIVE_RULE_BETTER_BUT_NOT_MATERIAL`.
- **Primary bottleneck:** not established as the decision rule. The same 30 CORE features do not become
  materially useful under any frozen rule.
- **Model capacity:** unresolved; no larger model was trained.
- **Representation:** carried from Stage 3F.6-W: current risk signals are insufficient.

The unresolved reason is the policy set's value structure, not the rule. The oracle gap is real
(25.84 → 15.43). But much of it comes from NEXUS episodes where NEXUS is only relatively better and
still costly. The router cannot identify those episodes confidently enough for the saving to exceed the
cost of being wrong.

## Stage 3G readiness (predeclared)

| Criterion | Met |
| --- | --- |
| materially beats always-RESOURCE on fresh HOLDOUT | **no** |
| acceptable false-selection harm | **no** (see criterion flaw) |
| survives fresh OOD | yes |
| no pathological collapse | **no** |
| deterministic replay | yes |
| zero leakage | yes |

`READY_FOR_STAGE3G=false`.

## Authority

R0, non-dispatching, no online learning, nothing promoted to the live runtime.

## Reproduce

```bash
npm run stage3f6d:generate
npm run stage3f6d:certify
npm run stage3f6d:check
npm run test:stage3f6d
```
