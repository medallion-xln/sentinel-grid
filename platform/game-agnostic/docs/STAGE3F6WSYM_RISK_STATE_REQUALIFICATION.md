# Stage 3F.6-W-SYM — Risk-State Symmetric Requalification

Certification `26e77c5d18c89774e3106295ec3868a2fcf2a83d251bab6173fc20510044f4b0`
Analysis plan `40dea606441ee54a1306cdee5306135b6e56406401297a148fa675a68ef9bc5b` · Freeze commit `7cb8565`
Seed plan `2e0d514c2d362123c70c4ee4ec972bbfdd3096253909f545a4c80758add1d065` · Historical W inventory `0dc44267cb4b18010faee350baafcf26a08c3e76e96044e10f6c68d89ccfdc15`
Open-phase report `645806bcb480203260cc468d421c9efdd2dd6d4cef208c2a8e14e5005bad3c6c`
Valid deployable W feature set `2d56dd0a35dd52d53c16f1da31fa37391f0bcb5e120534bbbb3e0612f8b9a8af`
Fresh partitions (seeds 3022 / 3032) `2c8f73fbd550460e82691616fdddac7d36d09f9c339a19679b2c9cef1f40f14d`, 12,000 records, generated at `7cb8565`

## The question

Stage 3F.6-W (certificate `7c5db9fb…95fb6`) added a decision-time risk contract (`SENTINEL_DECISION_RISK_STATE_V1`, 12
fields) to deployable CORE state. It concluded `B_CURRENT_RISK_SIGNALS_INSUFFICIENT`: one accepted field,
`risk.retreatOptionCount`, raised the NEXUS-vs-RESOURCE AUROC by +0.0103 [0.0045, 0.0161], below the 0.02 bar. That
measurement ran on DEV/CAL of the direction-confounded Forge V1 lineage.

This stage re-measures W on FORGE_SYMMETRIC_V2 with fresh sealed data. It separates risk-signal value from router value
and accounts for shortcuts. The router, Nexus, the risk contract and every policy are unchanged.

## Answer

**PASS. The valid risk signal is `RISK_SIGNAL_WEAK`. Additional labels: `RISK_SIGNAL_SHORTCUT_CORRELATED`,
`OOD_UNSTABLE` and `PROXY_OF_HIDDEN_GEOMETRY`. No genuine risk signal was measured. 10 of 13 retestable historical
claims survive in full or in part. W's headline result `B` reproduces exactly.**

- **Feature validity.** 7 of 12 risk fields are valid and deployable. All 12 are invariant under D4 twins, identity
  relabelling and candidate order. The other 5 fall out on predeclared rules: 4 are the historical structural
  rejections, which all reproduce, and `actorHealth` is constant. W's absolute actor-position diagnostic is
  `SHORTCUT_CORRELATED`, because every D4 twin changes it.
- **Risk-signal quality.** Valid risk adds nothing material over CORE on any target. The largest increment is
  +0.0069 AUROC on W's historical target (HOLDOUT), and it does not survive OOD. On the decision targets
  (catastrophic error, high regret, RESOURCE failure, NEXUS usefulness, costly action optimal) the increment is
  −0.0045 to +0.0055. `retreatOptionCount` alone is significant but not material for catastrophic error (+0.0023) and
  costly-action regimes (+0.0044).
- **Privileged geometry.** Where RESOURCE's move leads relative to the task entities lifts AUROC by +0.21 to +0.43 on
  every decision target. Once that geometry is present, valid risk adds nothing on W's target (−0.0014). What risk
  carries there is a weak shadow of hidden movement geometry (`PROXY_OF_HIDDEN_GEOMETRY`). The strongest correlation
  is `retreatOptionCount` with "RESOURCE chose MOVE EAST" (r = 0.26 / 0.31).
- **Router value.** The W router beats BASE at the headline thresholds (+0.091 accuracy on HOLDOUT). That gain comes
  from **threshold, not information**. W's CAL threshold is 0.7 against BASE's 0.4, so it falls back to RESOURCE on
  about 75% of rows. At a matched threshold the feature contribution is +0.0007 (n.s.) for W and +0.004 for W_ALL. The
  W router's orientation gap is 0.39, and its identity-permutation flag fires on HOLDOUT. It is not better than best
  single on OOD (−0.067 accuracy).

## Protocol

1. **Baseline.** HEAD `130f8cd`, clean, no active writer. P.1C, P.1D, P.1E, 3F.6-T-SYM, P.1A-SYM and P.1-SYM all
   reproduce byte for byte, with artifacts and git state unchanged.
2. **Historical inventory** (`HISTORICAL_W`, hash `0dc44267…`). The 12 risk fields; the OBJECTIVE, SPATIAL and
   TEMPORAL diagnostic groups; the accepted field; the certified source hashes; W's measured values. W trained no
   router. Its only routing artefact is the candidate contract `V1_1` = CORE + `retreatOptionCount`.
3. **Plan and freeze.** The analysis plan, the seed plan and the DEV/CAL open-phase report were committed in `7cb8565`
   with every evaluation file. The fresh gate opened only after that commit, and the certificate proves the order in
   git history.
   - PRE-FREEZE-001: the DEV/CAL dry run showed W routers choosing CAL threshold 0.7 against BASE's 0.4. I therefore
     added a matched-threshold (full-coverage) diagnostic. No sealed row existed at the time.
4. **Seeds.** HOLDOUT 3022 and OOD 3032 (3023 and 3033 in reserve). P.1-SYM declared them for sealed use and never
   generated them. They are disjoint from 38 enumerated prior seeds and all 56,000 prior rows: no record, world or
   topology hash is shared, and no combination is derived from a prior one. Rejections: 2,579 HOLDOUT / 526 OOD
   candidates claimed a prior topology. Symmetry holds on 2,435 equivariance checks. HOLDOUT covers levels 0–2 and OOD
   levels 6–7, in canonical order.
5. **Evidence.** For each row the world is rebuilt (hash-checked). The unmodified W extractor runs on the symmetric
   surface the policies saw; risk is recomputed on a reversed, relabelled surface and on every D4 twin. The certified
   P.1E policy evidence is reused unchanged.
6. **Models.** `fitBinaryLogistic`, the same optimiser W used, fitted on DEV with thresholds from CAL. Increments are
   paired AUROC bootstraps (1,000 resamples). SIGNIFICANT means CI lower bound > 0. MATERIAL means significant and
   Δ ≥ 0.02 (W's bar). Routers use the unmodified 3F.6-T methodology. BASE_ROUTER reproduces the T-SYM router hash and
   threshold exactly.

## Feature validity (DEV/CAL, fixed before the freeze)

| Field | Class | Reason |
|---|---|---|
| threatRelationCount, maxThreatPressure, threatenedCriticalCount, threatenedDependencyCount, civilianHealthTotal, retreatOptionCount, unavailableEntityCount | DEPLOYABLE | — |
| hostileAliveCount | REDUNDANT | ≡ `relational.hostileEntityCount` (as in W) |
| coveredThreatCount | REDUNDANT | ≡ threatened − uncovered (as in W) |
| threatenedCivilianCount | REDUNDANT | ≡ `relational.unresolvedDependencyCount` (as in W) |
| actorHealth | REDUNDANT | constant (100) |
| threatCoverageRatio | UNAVAILABLE | NOT_APPLICABLE on rows without a threat (as in W) |
| objective.shortfall | DEPLOYABLE (diagnostic group) | — |
| objective.criticalEntityCount | REDUNDANT | ≡ `context.objectiveCount` |
| spatial.actorX / actorY | SHORTCUT_CORRELATED | changes on 100% of D4 twins |
| temporal.* | UNAVAILABLE | no history on some rows (as in W) |

No field is non-deployable, oracle, rollout, future-state, leaked (max single-field separability 0.735) or divergent.
The historical DEV selection rule, replayed on symmetric DEV, accepts **no** field. `retreatOptionCount`'s mean fold
Δ is +0.0006, below W's 0.005 acceptance bar.

## Risk-signal quality (paired AUROC Δ over CORE; HOLDOUT / OOD)

| Target | CORE AUROC | + valid risk | + accepted (retreat) | + privileged geometry |
|---|---|---|---|---|
| T0 NEXUS vs RESOURCE best (W's target) | 0.679 / 0.687 | **+0.0069 sig** / +0.0007 | **+0.0051 sig** / +0.0020 | +0.210 / +0.242 |
| T1 catastrophic error (regret ≥ 100) | 0.762 / 0.590 | −0.0009 / **+0.0044 sig** | **+0.0023 sig** / **+0.0009 sig** | +0.063 / +0.122 |
| T2 high regret (NR ≥ 0.5) | 0.565 / 0.518 | −0.0031 / −0.0039 | +0.0002 / −0.0003 | +0.274 / +0.360 |
| T3 policy disagreement | 0.903 / 0.913 | +0.0017 / +0.0011 | −0.0001 / −0.0004 | +0.015 / +0.021 |
| T4 RESOURCE failure | 0.607 / 0.537 | −0.0045 / −0.0027 | +0.0002 / +0.0019 | +0.287 / +0.434 |
| T5 NEXUS V1 useful | 0.592 / 0.534 | +0.0055 / −0.0023 | +0.0048 / +0.0002 | +0.256 / +0.352 |
| T6 costly action optimal | 0.874 / 0.908 | +0.0051 / +0.0030 | **+0.0044 sig** / **+0.0063 sig** | +0.003 / +0.001 |

- **Magnitude.** Nothing is material. Valid risk alone is informative (≥ 0.65) only for policy disagreement
  (0.742 / 0.790), which CORE already ranks at 0.90 or better.
- **Calibration.** CORE + valid risk is calibrated on HOLDOUT (ECE 0.012–0.036) but not on OOD (0.039–0.204).
- **Stability.** Results across seed families (2021, 2022, 2023, 3021, 3022) and levels are consistent with HOLDOUT;
  T0 gains stay under 0.02 everywhere.

## Risk value vs router value

| HOLDOUT (OOD) | Accuracy | Mean regret | Norm. regret | Catastrophic |
|---|---|---|---|---|
| Best single = RESOURCE | 0.265 (0.265) | 49.38 (86.36) | 0.572 (0.626) | 0.146 (0.410) |
| Headline cascade THR→OBJ→RES | 0.275 (0.264) | 47.43 (86.10) | 0.554 (0.623) | 0.137 (0.408) |
| BASE_ROUTER (CORE; = T-SYM router) | 0.190 (0.168) | 45.26 (84.64) | 0.553 (0.622) | 0.091 (0.338) |
| W_ROUTER (CORE + retreat) | 0.281 (0.198) | 45.46 (83.91) | 0.538 (0.616) | 0.124 (0.351) |
| W_ROUTER_ALL (CORE + valid risk) | 0.282 (0.206) | 45.41 (83.91) | 0.537 (0.615) | 0.125 (0.357) |
| BASE / W / W_ALL at matched threshold 0 | 0.189 / 0.190 / 0.193 | 45.26 / 45.18 / 45.04 | 0.554 / 0.552 / 0.551 | 0.09 |
| Perfect selector | 0.395 (0.363) | 30.88 (62.14) | 0.377 (0.456) | 0.060 (0.249) |

- **W vs BASE.** The headline comparison is MATERIAL on both partitions (+0.091 / +0.030 accuracy), which is why
  `RISK_SIGNAL_IMPROVES_ROUTING` is mechanically true. The matched-threshold diagnostic attributes the gain to the
  CAL threshold, not to risk: W vs BASE +0.0007 [−0.0025, 0.0038]; W_ALL vs BASE +0.004 [0.0005, 0.0075]. The higher
  threshold makes W abstain to RESOURCE more often. On HOLDOUT its routed share is 0.24 against 0.99, and BASE sends
  80% of rows to NEXUS against W's 14%. That behaviour does not transfer: on OOD, W routes 81% of rows and sends 67%
  to NEXUS.
- **W vs best single.** MATERIAL on HOLDOUT (+0.016 accuracy, −0.034 normalized regret). On OOD accuracy is worse
  (−0.067), so `RISK_SIGNAL_IMPROVES_DECISIONS` = false.
- **W vs the headline cascade.** Not material on either partition.
- **Headroom and harm.** W captures 13% of the accuracy headroom on HOLDOUT and a negative share on OOD. Its
  false-selection rate is 0.468 against BASE's 0.316.
- **Shortcuts in the W router.** Its risk inputs are fully equivariant, but its routed action equals the twin's action
  on only 30% of twin pairs, because its fallback, RESOURCE, is orientation-bound. Orientation gap: 0.39 (HOLDOUT) and
  0.26 (OOD). The identity-permutation flag fires on HOLDOUT (Δ 0.048).

## Historical claims

| Claim | Verdict | Evidence (HOLDOUT) |
|---|---|---|
| W1 router errors concentrate in threat states | SURVIVES | error ratios HIGH_HOSTILE 1.45, UNCOVERED 1.50, BOTTLENECK 1.56 (W: 2.04 / 1.88 / 2.05) |
| W2 threat structure already in CORE | SURVIVES | single-field Δ −0.0003 to +0.0011, none significant |
| W3 retreat option real but not material | SURVIVES | +0.0051 [0.0009, 0.0090] (W: +0.0103 [0.0045, 0.0161]) |
| W4 all usable risk not better than accepted | SURVIVES | +0.0018 [−0.0026, 0.0063] |
| W5 actor position small increment | INVALIDATED | +0.0001 [−0.0070, 0.0067]; W's +0.0061 was absolute-frame and orientation-bound |
| W6 objective not a gap | SURVIVES | +0.0001 |
| W7 CORE ranks NEXUS vs RESOURCE (0.79) | PARTIALLY | 0.679 |
| W8 NEXUS capture fails despite signal | INVALIDATED | the T-SYM router now *over*-selects NEXUS (94% of NEXUS-best rows; 80% of all rows) |
| W9 primary result B | SURVIVES | the historical precedence on HOLDOUT yields B exactly |
| W10 structural rejections | SURVIVES | all four reproduce |
| W11 leak-free, decision-time | SURVIVES | module byte-identical to W; contract `5b4d74b3…` unchanged; relabel-invariant |
| W12 no routing gain from enrichment | INVALIDATED (formally) | headline W vs BASE is material, but it is a threshold effect (see above) |
| W13 false-selection harm unchanged | SURVIVES | enrichment raises it (0.316 → 0.468) |
| W14 OOD | NOT_RETESTABLE | W made no OOD claim; T0 increment is OOD-unstable |

## Roadmap

`W_REQUALIFIED` true · `HISTORICAL_W_SURVIVES` PARTIAL · `GENUINE_RISK_SIGNAL_MEASURED` false ·
`RISK_SIGNAL_DEPLOYABLE` true · `RISK_SIGNAL_CALIBRATED` false · `RISK_SIGNAL_OOD_STABLE` false ·
`RISK_SIGNAL_IMPROVES_DECISIONS` false · `RISK_SIGNAL_IMPROVES_ROUTING` true (threshold effect, not risk information) ·
`ROUTER_2_0_JUSTIFIED` false · `RISK_STATE_USEFUL_FOR_3G` false · `READY_FOR_STAGE3F6D_REQUALIFICATION` true ·
`READY_FOR_3F_FREEZE` false · `READY_FOR_STAGE3G` false. Stage 3F stays OPEN; 3F.6-D is the remaining requalification.

## Disclosures

- The `priv.*` features read kernel positions that no interface exposes. They appear only in diagnostic models.
- Targets are oracle labels and are never inputs.
- Seed-family rows were exposed by earlier stages and are diagnostic only.
- `RISK_SIGNAL_IMPROVES_ROUTING` follows the predeclared rule. The attribution to threshold rests on the predeclared
  matched-threshold diagnostic, which is not a headline rule.
- Latency is printed, not hashed: about 5–20 µs per routing decision.
- The certifier runs P.1-SYM `--check` in parallel with the evaluation. That check transitively reproduces P.1A-SYM,
  P.1C, P.1D, P.1E and 3F.6-T-SYM.

## Reproduce

```
cd platform/game-agnostic
node scripts/generate-stage3f6wsym-confirmatory.mjs --verify   # rebuilds the git-ignored fresh payload
node scripts/certify-stage3f6wsym-risk.mjs --check
```
