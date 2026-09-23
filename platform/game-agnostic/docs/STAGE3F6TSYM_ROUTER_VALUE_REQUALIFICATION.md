# Stage 3F.6-T-SYM — Symmetric Router-Value Requalification

Certification `edd46e40fc2c6ddc611f9f78a432f723f0ae4e66facc1b2ca84183fa4d896f4e`
Analysis plan `6ef5e2360f5034e9a00666acd98d51fb03ea13c78e872a4a092c1c5cd25d519f` (amendment 001 of `642336d9…cb79`)
Feature set `838c141991c4e74a627d1b1a906c6b5dd114281888519b505a113a86088b3d76` · Policy set `STAGE3F6T_FROZEN_DEPLOYABLE_POLICY_SET_V1`
Open-phase report `47538d7b841972b6df7bfbd67638384c7b99f5a7696202d0469946bdb56ad19b`
Freeze commits `8bcff51` (original) → `f42a502` (amendment 001) · Fresh partitions generated at `f42a502`
Fresh confirmatory content `2921adb7e933c274ed692d0f38ccc58a6d1553a60194d01d14b75105c92ff6e8` (12,000 records)

## The question

Can deployable decision-time information identify the regimes where the current specialist policies create
enough downstream value to justify learned routing? This is a measurement stage. It changes no policy, expert,
Nexus version, feature contract or router methodology, and it does not begin Stage 3G.

## Answer

**PASS, and the result is negative.** Primary conclusion: **`EXPERT_COMPLEMENTARITY_NOT_ROUTABLE`**. Secondary:
`ROUTER_VALUE_NOT_MATERIAL` and `MIXED_ACCURACY_REGRET_TRADEOFF`.

- Complementarity exists. The perfect selector beats RESOURCE by +0.137 accuracy on FRESH_HOLDOUT (95% CI
  0.129–0.146).
- The historical Stage 3F.6-T methodology, refitted on symmetric DEV, does not collapse onto RESOURCE. It routes
  77% of FRESH_HOLDOUT decisions to NEXUS V1. That lowers regret (−4.6) but costs **−0.058 accuracy** (CI −0.071
  to −0.044). It captures **−42%** of the accuracy headroom and +24% of the regret headroom.
- Deployable features do predict when RESOURCE is structurally wrong (COSTLY_ACTION_OPTIMAL AUROC 0.863 on
  HOLDOUT, 0.921 on OOD). They do **not** predict when NEXUS V1 beats RESOURCE in general (AUROC 0.596 / 0.532).
  NEXUS V1 is worth selecting almost only in the costly regime, which covers 13% of HOLDOUT and 4% of OOD. The
  router's target, the minimum-regret policy, does not isolate that regime.
- Policy quality, not selection, is the dominant loss. The policy set loses 0.600 accuracy even under perfect
  selection; imperfect selection loses 0.137.

## Protocol

1. **Baseline and predecessors.** Start `8bcff51` on `main`, clean, 16 commits ahead of `origin/main`. Before any
   change, the P.1C (`81586cbe`), P.1D (`afd0d6e6`), P.1E (`11dcf65b`) and historical 3F.6-T (`5d6910dd`)
   certifications all reproduced byte-for-byte under `--check`. The P.1E headline was recomputed from its
   certificate: RESOURCE 0.2555, perfect selector +0.1415, and every class matches.
   Erratum `STAGE3F6-ERRATUM-001` (`0a8dd75`) is one additive file, is present, and was not modified.
2. **Freeze.** A previous run of this stage froze the plan, feature set, open-phase report and all evaluation code
   in `8bcff51`. That run began generating fresh partitions but never finished. Its orphaned generator (session
   `141ec5b4`) was still running against the superseded plan. It was stopped before it wrote anything. No fresh
   row, sealed router result or certificate existed at that point.
3. **Amendment 001 (`f42a502`).** This amendment is additive and was committed before any fresh row existed. It
   defines two roadmap fields the brief requires and the first freeze lacked: `EXPERT_COMPLEMENTARITY_EXISTS` and
   `POLICY_QUALITY_REMAINS_PRIMARY_BOTTLENECK`. It also adds reporting: DEV/CAL selection distributions and regime
   metrics, correct and false specialist selections, and costly/free stratification (used for reporting only,
   never as an input). Finally, it adds generation provenance: the fresh manifest records its HEAD, and
   certification requires the plan, open report, generator, certifier and router-value module to be byte-identical
   since then. Test 13 proves every original plan field is unchanged. The router hash, CAL threshold, cascades and
   regime fits are identical to the first freeze.
4. **Open phase.** DEV fits the router, standardisation and regime predictors. CAL selects the router threshold
   (0.40 on the historical grid), the regime thresholds, the best single policy (RESOURCE) and the headline cascade
   (THREAT → OBJECTIVE → RESOURCE).
5. **Fresh confirmatory partitions.** These use the declared but unused P.1D seeds (HOLDOUT 2022, OOD 2032), the
   unmodified P.1D record builder and canonical admission order. They have zero record, world or topology overlap
   with the 20,000-row lineage. All 2,440 D4-twin equivariance checks (legal, optimal, regret, label, core features) equal 1. The P.1D/P.1E HOLDOUT and OOD are *exposed*
   (P.1E evaluated every policy there and formed the costly-action hypothesis on them), so they are reported only
   as secondary partitions.
6. **Sealed evaluation.** The evaluation ran once. It involved no tuning, no larger model, no world-model or
   rollout feature, and no oracle input.

## Feature audit

All 30 DEPLOYABLE_CORE features are `DEPLOYABLE`. Zero features fall in each of NON_DEPLOYABLE, LEAKED,
REQUIRES_ORACLE, REQUIRES_ROLLOUT, REQUIRES_FUTURE_STATE, DIVERGENT and UNAVAILABLE. No single feature reaches
DEV AUROC 0.99 for any target. The best is `actionSurface.legalActionCount`, with 0.851 separability for
COSTLY_ACTION_OPTIMAL. The feature set is the historical 3F.6-T router input, unchanged.

## Regime prediction (DEV-fitted logistic regression, CAL threshold)

| Target | CAL AUROC | HOLDOUT AUROC | AUPRC (base) | Brier skill | ECE | P / R at CAL thr. | OOD AUROC | Verdict (HOLDOUT) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| COSTLY_ACTION_OPTIMAL | 0.887 | **0.863** | 0.648 (0.131) | 0.397 | 0.013 | 0.66 / 0.63 | 0.921 | IDENTIFIABLE |
| FREE_ACTION_OPTIMAL | 0.887 | 0.863 | 0.963 (0.869) | 0.397 | 0.013 | 0.94 / 0.96 | 0.921 | IDENTIFIABLE |
| HORIZON_DEPENDENT | 0.813 | 0.759 | 0.912 (0.786) | 0.135 | 0.040 | 0.84 / 0.92 | 0.661 | IDENTIFIABLE (OOD weak) |
| NEXUS_V1_BEATS_RESOURCE | 0.605 | **0.596** | 0.698 (0.597) | 0.033 | 0.025 | 0.60 / 1.00 | 0.532 | NOT_IDENTIFIABLE |
| OBJECTIVE_APPLICABLE | 0.740 | 0.729 | 0.803 (0.618) | 0.135 | 0.071 | 0.67 / 0.94 | n = 96 | WEAKLY_IDENTIFIABLE |
| THREAT_APPLICABLE | — | — | — | — | — | — | — | INSUFFICIENT_EVIDENCE (DEV n = 120) |

On OOD the costly regime shrinks to 4.3%, so AUPRC falls to 0.42 despite the higher AUROC.

## Routing (FRESH_HOLDOUT n = 6000 / FRESH_OOD n = 6000)

| Strategy | HOLDOUT acc | regret | norm. regret | regret ≥ 100 | OOD acc | regret | norm. regret |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALWAYS_RESOURCE = BEST_SINGLE (CAL) | 0.263 | 50.33 | 0.568 | 0.153 | 0.258 | 86.50 | 0.637 |
| FIXED_PRIORITY_CASCADE (headline set) | 0.269 | 48.77 | 0.555 | 0.145 | 0.255 | 86.57 | 0.636 |
| FIXED_PRIORITY_CASCADE (P.1E, uses V2) | 0.284 | 45.97 | 0.531 | 0.131 | 0.262 | 83.86 | 0.619 |
| HISTORICAL 3F.6-T router (frozen weights) | 0.196 | 46.35 | 0.550 | 0.099 | 0.196 | 82.16 | 0.616 |
| **ROUTER (3F.6-T methodology, symmetric DEV)** | **0.205** | **45.75** | **0.543** | **0.100** | **0.169** | **82.43** | **0.622** |
| REGIME_GATED_SWITCH (diagnostic) | 0.289 | 45.65 | 0.529 | 0.130 | 0.263 | 84.70 | 0.623 |
| COSTLY_ORACLE_SWITCH (oracle diagnostic) | 0.333 | 44.03 | 0.508 | 0.127 | 0.282 | 83.90 | 0.617 |
| CANDIDATE_ROUTER_V2 (diagnostic, V2) | 0.292 | 45.35 | 0.524 | 0.130 | 0.264 | 83.93 | 0.619 |
| RANDOM_VALID_POLICY (expectation) | 0.224 | 48.28 | 0.560 | — | 0.212 | 84.58 | 0.630 |
| PERFECT_POLICY_SELECTOR (oracle) | 0.400 | 31.45 | 0.373 | 0.066 | 0.359 | 62.04 | 0.466 |

Paired differences, router minus comparator, with 95% bootstrap CIs:

| | HOLDOUT Δacc | Δregret | Δnorm. regret | OOD Δacc | Δregret | Δnorm. regret |
| --- | --- | --- | --- | --- | --- | --- |
| vs best single | −0.058 [−0.071, −0.044] | −4.58 [−5.82, −3.37] | −0.025 [−0.037, −0.014] | −0.089 [−0.102, −0.076] | −4.07 [−5.77, −2.26] | −0.014 [−0.027, −0.003] |
| vs cascade (headline) | −0.064 [−0.077, −0.051] | −3.02 [−4.14, −1.88] | −0.012 [−0.024, −0.001] | −0.086 [−0.099, −0.073] | −4.14 [−5.79, −2.33] | −0.014 [−0.025, −0.003] |
| vs cascade (P.1E) | −0.078 [−0.090, −0.066] | −0.21 [−1.25, 0.82] | +0.011 [+0.001, +0.022] | −0.093 [−0.107, −0.081] | −1.43 [−3.11, 0.36] | +0.003 [−0.008, +0.015] |

- **Headroom captured.** HOLDOUT accuracy −0.422 and regret +0.243. OOD accuracy −0.875 and regret +0.166.
- **Why none of this is material.** The regret gains need a normalized reduction of at least 0.02 without
  significantly worse accuracy. The router's gains are bought with significantly worse accuracy: every regret
  gain is a `MIXED_ACCURACY_REGRET_TRADEOFF`. The historical raw-regret rule (≥ 2.0) would call it material; the
  predeclared scale correction explains why it is not used for the headline.
- **Abstention.** 1.0% on HOLDOUT (threshold 0.40) and 0.02% on OOD.
- **Latency.** ≈ 12 µs per decision (wall clock, excluded from the certificate). Compute is 154 multiply-adds per
  decision.

### Selection distribution (collapse audit)

| Partition | RESOURCE | NEXUS V1 | OBJECTIVE | THREAT | ABSTAIN (→ RESOURCE) |
| --- | --- | --- | --- | --- | --- |
| DEV | 23.2% | 70.7% | 3.7% | 2.4% | 1.6% |
| CAL | 20.1% | 74.4% | 3.6% | 2.0% | 1.5% |
| FRESH_HOLDOUT | 17.3% | 77.3% | 3.3% | 2.1% | 1.0% |
| FRESH_OOD | 15.4% | 84.0% | 0.2% | 0.4% | 0.0% |

There is no `POLICY_COLLAPSE` under the historical rule: the top share is below 0.9 and NEXUS is in the best set
on 56% of episodes. Even so, the router is **not** a useful mixture. It is a NEXUS-dominant switch that picks NEXUS
where NEXUS minimises regret, and on most of those episodes NEXUS is still wrong. Abstentions fall back to
RESOURCE and are included in the RESOURCE share.

### Specialist value (router selections instead of RESOURCE, per partition episode)

| FRESH_HOLDOUT | selected | correct / false | regret saved | harm added | net | net (normalized) |
| --- | --- | --- | --- | --- | --- | --- |
| NEXUS V1 | 4635 | 3064 / 1571 | 15.85 | 12.72 | **+3.14** | +0.013 |
| … costly-optimal rows (n = 786) | 545 | 516 / 29 | 37.73 | 0.53 | +37.20 | +0.356 |
| … free-optimal rows (n = 5214) | 4090 | 2548 / 1542 | 12.55 | 14.55 | **−2.00** | **−0.039** |
| OBJECTIVE | 195 | 132 / 63 | 1.16 | 0.35 | +0.81 | +0.007 |
| THREAT | 129 | 87 / 42 | 0.95 | 0.33 | +0.63 | +0.005 |

| FRESH_OOD | selected | correct / false | regret saved | harm added | net | net (normalized) |
| --- | --- | --- | --- | --- | --- | --- |
| NEXUS V1 | 5042 | 3599 / 1443 | 24.15 | 20.19 | +3.96 | +0.014 |
| … costly-optimal rows (n = 256) | 210 | 204 / 6 | 60.18 | 0.34 | +59.84 | +0.448 |
| … free-optimal rows (n = 5744) | 4832 | 3395 / 1437 | 22.54 | 21.07 | +1.47 | −0.006 |
| OBJECTIVE | 12 | 9 / 3 | 0.04 | 0.02 | +0.02 | +0.000 |
| THREAT | 21 | 15 / 6 | 0.18 | 0.08 | +0.09 | +0.001 |

"Correct" means the selected policy is in the minimum-regret best set. The benefit shown for the costly-optimal
rows is per costly-optimal episode.

On costly-optimal HOLDOUT rows, NEXUS V1 scores 0.585 accuracy and RESOURCE 0.000. On free-optimal rows, NEXUS V1
scores 0.106 and RESOURCE 0.303. The router selects NEXUS on 4,090 free-optimal episodes and only 545 costly ones,
so the free-regime harm cancels most of the costly-regime value. The historical harm rule is met (episodes worsened
≤ improved; false-selection p95 is 113 against RESOURCE's 145), but accuracy is what the router gives up.
OBJECTIVE and THREAT wins do outweigh their harm. Their net value is small because coverage is small.

### Predeclared diagnostic: the regime gate (not headline)

The plan predeclared a gate: RESOURCE, unless the DEV-fitted costly predictor exceeds its CAL threshold, in which
case the first proposing specialist (NEXUS → THREAT → OBJECTIVE) is used. On FRESH_HOLDOUT it beats RESOURCE:
**+0.026 accuracy [0.020, 0.031]** and normalized regret −0.039 [−0.044, −0.034]. That meets the materiality bar
and captures 18.7% of the accuracy headroom. It does **not** hold on OOD: +0.006 accuracy [0.002, 0.009] and
−0.014 normalized regret, which is below the bar and captures 5.6% of the headroom. The oracle version of the same
gate (true costly label) reaches only 0.333 on HOLDOUT and 0.282 on OOD. So the ceiling of the costly-regime route
is about +0.07 accuracy in-distribution and +0.02 OOD. The plan forbids promoting a diagnostic to the headline, and
by rule this does not justify Router 2.0. It locates the only routable complementarity, and shows how small and
distribution-dependent that complementarity is.

### Exposed partitions (secondary)

The P.1E HOLDOUT shows the same pattern: RESOURCE 0.256, router 0.208, oracle 0.397, router −0.047 accuracy and
−0.030 normalized regret (mixed). On the P.1E OOD the router loses 0.097 accuracy with no significant
normalized-regret gain.

## Roadmap decisions

| Field | Value | Rule |
| --- | --- | --- |
| ROUTER_VALUE_MEASURED | true | stage PASS |
| ROUTER_VALUE_MATERIAL | false | not material vs best single on FRESH_HOLDOUT |
| EXPERT_COMPLEMENTARITY_EXISTS | true | headroom CI lower bound 0.129 ≥ 0.05 |
| EXPERT_COMPLEMENTARITY_ROUTABLE | false | requires material router value |
| ROUTER_2_0_JUSTIFIED | false | primary conclusion is not ROUTER_VALUE_CONFIRMED |
| EXPERT_REPAIR_REQUIRED | true | perfect selector reaches only 0.400 (< 0.5) |
| POLICY_QUALITY_REMAINS_PRIMARY_BOTTLENECK | true | policy-set loss 0.600 > selection loss 0.137 |
| READY_FOR_3F_FREEZE | false | 3F.6-P.1, P.1A, W, D requalifications remain |
| READY_FOR_STAGE3G | false | by construction |

## Disclosures

- The fresh HOLDOUT follows P.1D's canonical admission order, so it covers curriculum levels 0–2 only. OOD covers
  levels 6–7.
- The P.1E cascade contains the diagnostic NEXUS V2 exactly as P.1E froze it. The headline cascade excludes it.
- Plan amendment 001 was made after the open phase and before any sealed data existed. Its rationale and the
  byte-identity proof of the original fields are in the plan file and in test 13.
- The earlier session also left a scratch copy of the certifier. It could not score any fresh row: no fresh
  manifest existed, and no certificate existed before this run.
- Latency is not deterministic, so it is reported here and not in the certificate.

Authority: R0, non-dispatching, no online learning, nothing promoted.

## Reproduce

```bash
node scripts/generate-stage3f6tsym-confirmatory.mjs --verify   # rebuild the gitignored fresh payload; content hash must match
node scripts/certify-stage3f6tsym-router-value.mjs --check
node --test tests/stage3f6tsym-router-value.test.js
```
