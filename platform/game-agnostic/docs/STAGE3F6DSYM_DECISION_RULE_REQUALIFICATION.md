# Stage 3F.6-D-SYM — symmetric decision-rule requalification

Certification `65e507b76bbfb9b3a4ae867f73c9d2bc056575ef9b7743359bcfc28b2bb90680` — **PASS**. A negative scientific result is valid for this measurement stage.

## Question and answer

Historical Stage 3F.6-D found a small benefit from cost-sensitive selection on Forge V1. On `FORGE_SYMMETRIC_V2`, the CAL-selected historical expected-value rule has a real HOLDOUT regret reduction. It does **not** establish durable decision-rule value: the OOD action-accuracy loss is large and statistically clear; OOD normalized-regret reduction falls below the materiality bar; specialist false-selection harm and action-level D4 nuisance dependence fail their predeclared guards. The perfect selector reaches only 0.397 action accuracy on HOLDOUT and 0.359 on OOD. No Router 2.0 or Stage 3G work is justified by this result.

## Seal and lineage

- Freeze commit `226ea9f2a3c97f52775391fc5dfa35d6105c817f`; no D-SYM sealed row existed before it. The committed plan, fit, generator, certifier and tests are unchanged at HEAD during generation.
- Seed plan `de039fd8b5f929860b649bdbe46ef28f2e27cc36a2f7f89b42724af2fdd64f20`; 3023 HOLDOUT and 3033 OOD were reserved by P.1-SYM/W-SYM, untouched until this stage, and absent from 68,000 prior symmetric rows and every prior declared seed space.
- Headline policy set `34f0f3ddf7a3a508061e5c6fb716e67e28cc4919c70f8a724beb11e990d60c44`: RESOURCE, NEXUS V1, OBJECTIVE, THREAT. V2 is diagnostic only; diagnostic set hash `d9495b444280e65107c63cffb15be85386e80550bcaa4921a71892dc6bc10f81`.
- Analysis plan `1c90d172408faf47b4ff98014c1b8a4fe57bb5a26e6ffcfc6d7db71e7125db1d`; analysis freeze `4d7313b6151e329c2dc454ad72edd7fceca6a0557901fb750f8746b1400ead47`; cost matrix `2ee12bb89dc0c05cbac750d322e571dcd8dff5d4773ff599c5b7250f04eb41e4`.
- Fresh content `8aa1672a1acdfe62251458b8e986b2f79b4f0eb1cc794596315f92ba7ccbac9c`: 6,000 HOLDOUT and 6,000 OOD, with zero prior or internal record/world/topology overlap. HOLDOUT admitted 6,000/9,082 attempted; OOD 6,000/6,690. Both used only their declared seed.
- All seven predecessors (P.1C, P.1D, P.1E, T-SYM, P.1A-SYM, P.1-SYM, W-SYM) reproduced with TAP on this Node 26 host. The Stage 3F.6 erratum remains present. All 21 D-SYM integrity checks passed.

## Frozen method

The frozen Stage 3F.6-T masked multinomial router is fitted on symmetric DEV `DEPLOYABLE_CORE` only and matches T-SYM router hash `e9c123db9c0ac2dbada7b01bebe2035a3c0b4e39b8f013e754c8f2bb99208d88`. Historical D's class weights and soft-regime cost/value matrices are fitted on DEV. CAL selects temperature 1, NEXUS override threshold 0.6, BEST_SINGLE=RESOURCE, and cascade THREAT → OBJECTIVE → RESOURCE. The historical D decision rules are applied without a new model or confidence threshold. W-enriched routing is not run: W-SYM's valid risk signal is uncalibrated and OOD-unstable, and a newly fitted enriched router would add a routing intervention rather than requalify the rule.

The primary materiality bar is action accuracy gain ≥0.02 or normalized-regret reduction ≥0.02, with a paired 95% interval beyond zero and no significant worsening of the other metric. Raw-regret reduction ≥2 remains a historical diagnostic, because symmetric regret has a different scale. A rule must pass against both BEST_SINGLE and the cascade, survive OOD, avoid false-selection harm and pathological collapse, and retain its incremental value under nuisance mutations. Accuracy and regret are reported separately.

## Fresh HOLDOUT (n=6,000)

| Rule | Action accuracy | Mean regret | Normalized regret | Catastrophic ≥100 | RESOURCE / NEXUS / OBJECTIVE / THREAT | Δ accuracy vs BEST | Δ normalized regret vs BEST |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| BEST_SINGLE | 0.2663 | 50.700 | 0.5737 | 0.1640 | 100 / 0 / 0 / 0% | — | — |
| SIMPLE_CASCADE | 0.2753 | 48.862 | 0.5565 | 0.1533 | 91.3 / 0 / 5.8 / 2.9% | +0.0090 | −0.0172 |
| ARGMAX | 0.1885 | 45.883 | 0.5489 | 0.0923 | 14.6 / 80.6 / 2.7 / 2.1% | −0.0778 | −0.0248 |
| EXPECTED_REGRET | 0.1965 | 45.724 | 0.5456 | 0.0938 | 19.6 / 76.7 / 1.1 / 2.6% | −0.0698 | −0.0281 |
| CLASS_WEIGHTED | 0.1977 | 45.809 | 0.5469 | 0.0940 | 16.9 / 74.4 / 6.0 / 2.7% | −0.0687 | −0.0268 |
| **EXPECTED_VALUE** | **0.2855** | **45.851** | **0.5317** | **0.1335** | **78.5 / 13.3 / 5.6 / 2.7%** | **+0.0192** | **−0.0420** |
| PERFECT_SELECTOR reference | 0.3973 | 30.660 | 0.3678 | 0.0570 | 44.7 / 52.1 / 1.8 / 1.4% | — | — |

All rules abstain on 0% of rows because RESOURCE always proposes. The NEXUS-threshold rule is identical to argmax at the CAL-selected threshold. EXPECTED_VALUE's paired normalized-regret gain versus BEST is −0.0420 [−0.0492, −0.0356], and versus the cascade −0.0248 [−0.0301, −0.0196]. Its action-accuracy gain versus BEST is +0.0192 [0.0117, 0.0272], below the frozen +0.02 point-estimate bar; versus the cascade it is +0.0102. Thus the HOLDOUT gain is regret-positive with a smaller accuracy gain, not a material accuracy gain.

## Fresh OOD (n=6,000)

| Rule | Action accuracy | Mean regret | Normalized regret | Catastrophic ≥100 | RESOURCE / NEXUS / OBJECTIVE / THREAT | Δ accuracy vs BEST | Δ normalized regret vs BEST |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| BEST_SINGLE | 0.2542 | 87.772 | 0.6319 | 0.4057 | 100 / 0 / 0 / 0% | — | — |
| SIMPLE_CASCADE | 0.2532 | 87.530 | 0.6296 | 0.4027 | 97.8 / 0 / 1.6 / 0.6% | −0.0010 | −0.0023 |
| ARGMAX | 0.1682 | 84.519 | 0.6201 | 0.3325 | 13.5 / 86.0 / 0.2 / 0.4% | −0.0860 | −0.0118 |
| EXPECTED_REGRET | 0.1690 | 84.512 | 0.6199 | 0.3330 | 14.1 / 85.3 / 0.2 / 0.5% | −0.0852 | −0.0119 |
| CLASS_WEIGHTED | 0.1690 | 84.572 | 0.6202 | 0.3330 | 13.7 / 84.2 / 1.5 / 0.6% | −0.0852 | −0.0117 |
| **EXPECTED_VALUE** | **0.1867** | **84.710** | **0.6187** | **0.3438** | **29.2 / 68.9 / 1.5 / 0.5%** | **−0.0675** | **−0.0131** |
| PERFECT_SELECTOR reference | 0.3593 | 62.327 | 0.4569 | 0.2397 | 42.5 / 57.0 / 0.2 / 0.3% | — | — |

EXPECTED_VALUE loses 0.0675 accuracy versus BEST [−0.0798, −0.0548] while reducing normalized regret by only 0.0131 (below 0.02). Against the cascade the accuracy loss is 0.0665 [−0.0780, −0.0530]. This is a mixed accuracy/regret tradeoff and **REVERSES** under the frozen OOD rule. Expected-regret and class-weighted routing also lose about 0.085 accuracy versus BEST for normalized-regret reductions of only about 0.012.

## Specialist selection, harm, and collapse

For the CAL-selected EXPECTED_VALUE rule, figures below are totals over each 6,000-row partition. “Saved correct” requires the selected specialist to be in the minimum-regret best set; “partial” means it improves over RESOURCE but is not best. False-selection harm is regret added over RESOURCE when the specialist is outside the best set.

| Partition / specialist | Selected | Saved correct | Saved partial | Added false | Net saved | False-selection rate | False-selection p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HOLDOUT NEXUS V1 | 796 | 28,403 | 0 | 10,851 | +17,552 | 26.6% | 118 |
| HOLDOUT OBJECTIVE | 334 | 9,408 | 1,027 | 5,746 | +4,689 | 35.0% | **158** |
| HOLDOUT THREAT | 160 | 6,273 | 1,699 | 1,117 | +6,855 | 33.8% | 75 |
| OOD NEXUS V1 | 4,134 | 120,751 | 150 | 103,767 | +17,134 | 28.5% | 178 |
| OOD OBJECTIVE | 88 | 2,553 | 46 | 2,738 | **−139** | 35.2% | **241** |
| OOD THREAT | 28 | 1,452 | 252 | 326 | +1,378 | 28.6% | 140 |

BEST_SINGLE p95 total regret is 140 HOLDOUT and 196 OOD; OBJECTIVE false-selection p95 exceeds both bounds. OOD OBJECTIVE adds more regret than it saves. NEXUS remains net-positive but its OOD false picks add 103,767 regret, nearly erasing the 120,901 total saving. Thus specialist selections do not meet the predeclared acceptable-harm rule. EXPECTED_REGRET selects NEXUS 4,599 HOLDOUT / 5,119 OOD episodes and sacrifices 0.070 / 0.085 action accuracy against BEST to lower regret; that is a tradeoff, not a decision-quality improvement.

The headline EXPECTED_VALUE rule does **not** cross the >90% collapse threshold: it selects RESOURCE 78.5% on HOLDOUT and NEXUS 68.9% on OOD. The simple cascade does collapse toward RESOURCE (91.3% / 97.8%). The headline distribution shifts sharply across partitions, so absence of formal collapse is not OOD stability.

## Symmetry and shortcut audit

On the frozen first 64 D4-evidence rows per fresh partition, every rule's **policy decision** is D4-equivariant, action-ID invariant at the decision layer, and candidate-policy-order invariant (all agreement 1.0). The chosen **action** inherits policy-level nuisance behavior. EXPECTED_VALUE action equivariance under D4 is 0.347 HOLDOUT and 0.781 OOD, versus 0.194 / 0.197 for BEST_SINGLE. Its D4 action-accuracy delta is −0.0125 HOLDOUT and −0.0281 OOD; BEST_SINGLE's is −0.0344 and +0.0094. The incremental D4 delta differs by 0.0219 and 0.0375, exceeding the frozen 0.02 nuisance-value limit. ID permutation changes EXPECTED_VALUE action accuracy by −0.0586 HOLDOUT / −0.0410 OOD; candidate-order decision delta is zero. Orientation-slice accuracy gaps for EXPECTED_VALUE are 0.365 HOLDOUT and 0.230 OOD. Curriculum slices are recorded in the certificate (HOLDOUT levels 0–2; OOD levels 6–7).

The benchmark itself remains D4 symmetric; the rule's **choice of policy** is equivariant. The selected policies' action tie behavior is not, so its apparent incremental value is not credited as genuine decision-rule value. RESOURCE's cost shortcut remains a controlled baseline, and V2 does not enter the headline set.

## Historical claims and roadmap

| Historical D claim | Requalification |
| --- | --- |
| Expected-regret advantage | PARTIALLY_SURVIVES: regret falls, accuracy falls materially |
| Class weighting effect | INVALIDATED: the historical harmful regret effect does not repeat, though accuracy remains poor |
| NEXUS capture falls under cost-sensitive selection | SURVIVES |
| False-selection harm | PARTIALLY_SURVIVES: large harm remains, but some specialists net positive |
| RESOURCE baseline dominance | INVALIDATED as a universal HOLDOUT regret claim; RESOURCE remains CAL BEST_SINGLE |
| OOD survival | INVALIDATED: headline accuracy reverses |
| Materiality | SURVIVES: no rule passes all promotion guards |
| Headline collapse | INVALIDATED: selection is mixed but unstable |

`D_REQUALIFIED=true`; `DECISION_RULE_VALUE_MEASURED=true`; `DECISION_RULE_VALUE_MATERIAL=false`; `DECISION_RULE_ACCURACY_POSITIVE=false`; `DECISION_RULE_REGRET_POSITIVE=true` on HOLDOUT only; `DECISION_RULE_OOD_STABLE=false`; `DECISION_RULE_COLLAPSES=false`; `FALSE_SELECTION_HARM_ACCEPTABLE=false`; `DECISION_RULE_LOGIC_USEFUL_FOR_3G=false`; `ROUTER_2_0_JUSTIFIED=false`. Authority remains **R0**, non-dispatching, no live-world mutation, no online learning, and no runtime promotion.

Stage 3F requalification is complete. The exact remaining work is the separately planned confirmatory Stage 3F.6 rerun, then a formal 3F freeze decision and reconciliation of the old Stage 3F.6 erratum. `READY_FOR_3F_CONFIRMATORY_RERUN=true`; `READY_FOR_3F_FREEZE=false`; `READY_FOR_STAGE3G=false`. Missing observable spatial state and action semantics remain architectural diagnoses; this stage does not repair them.

## Reproduction

Run from `platform/game-agnostic`:

```bash
npm run stage3f6dsym:freeze:check
npm run stage3f6dsym:verify
npm run stage3f6dsym:check
npm run test:stage3f6dsym
```

The full platform suite passed 2,235 tests, with 0 failures and 1 skip. Separate root overlay tests require the absent frozen Stage 1A archive and sibling `Desktop/public_html/azl` tree; `sgrid-lab` has seven older frozen-status/hash assertion failures. Those broader test failures are outside this D-SYM measurement and are disclosed rather than altering the D-SYM scientific result.
