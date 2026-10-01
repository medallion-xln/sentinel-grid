# Stage 3G.9 — C2 observable-state sufficiency requalification

Certification: **PASS**, `5a578b9047c09f67f6e5fc02d8cb501b1e1bba3b2ad198f70393173e53a335b6`.

**C2 passes, and Stage 3G is scientifically complete** under the preregistered rules: `STAGE3G_STATUS=COMPLETE`, `READY_FOR_STAGE3H=true`. Stage 3H has not begun.

Runtime stays at R0. The live adapter is unchanged, learned typed features are not promoted, and there is no world model and no counterfactual prediction.

## Inheritance

All eight inherited checks reproduced under canonical numerics, and the tracked tree was unchanged (`INHERITANCE_INTACT=true`).

| Check | Certificate | Seconds |
|---|---|---:|
| stage3f | `0fe5d3e2…08ce` | 4700 |
| stage3g12 | `7f392535…5100` | 2269 |
| stage3g3 | `6f580401…8c69` | 3052 |
| stage3g4 | `259195ba…c4c8` | 5290 |
| stage3g5 | `d472f04f…68da` | 59 |
| stage3g6 | `291e8ac8…d766` | 64 |
| stage3g7 | `ec5ae9c1…79b6` | 20 |
| stage3g8 | `0e91ab6c21137fdd0cb29ca258bdf076fc8bbeaa52d0c017de61f1983c78e2e7` | 29 |

The Stage 3G.8 certificate records C2 as the only failing closure condition (`C2_ONLY_REMAINING_BLOCKER=true`).

## Semantic channel (TYPED_RELATION_SEMANTIC_CHANNEL_V1)

Schema hash: `e749a5f2333f4cfaa7b985f96fe81301c97f757291bab3133ee2405e0533d99a`.

Typed relations from the audit-only Stage 3G.8 candidate enter only the semantic and search layer:

- exact root BYPASS substitute;
- conditional continuation substitutes;
- exact dependsOn rewiring in the ledger;
- deterministic branch existence.

With the disclosure off, the channel reproduces the frozen Stage 3G.7 columns exactly for every candidate.

- **Scorer unchanged.** S2 scores with the frozen Stage 3G.8 runtime scorer `30a72416…` (60 columns). A refit on the reused OPEN rows reproduces it. `ROOT_SCORER_HASH_UNCHANGED=true`.
- **Root columns unchanged.** All 36 root-state columns are identical to S0 for every one of the 116,867 candidates. Only the 18 search columns move: 37.7% of roots, with truncation falling from 1.8% to 1.0%. `FEATURE_DIMENSION_UNCHANGED=true`.
- **BYPASS exactness.** Across 1,233 natural BYPASS roots, the coarse contract identifies the substitute in 682 cases and leaves 551 ambiguous. Semantic substitute exactness is 1.0 and dependsOn rewire exactness is 1.0. The fixtures agree, and the lexical rule follows the kernel under renaming. `COARSE_RELATION_IDENTIFIABLE=false`, `TYPED_SEMANTIC_IDENTIFIABLE=true`.
- **Privilege.** The checks show:
  - the channel imports no kernel or script code;
  - the disclosure is consistent on every row;
  - S2 vectors are identical across the hidden-health collision pair;
  - S2 vectors are invariant under poisoning;
  - Stage 3G.8 disclosure safety is inherited.

  `PRIVILEGE_SAFE=true`, `PRIVILEGE_LEAKAGE=false`.

## Design

- **Families.** A and B each have 7,680 rows, of which 4,608 are inferential: 192 rows per level × band and 24 per objective, drawn from 16-seed panels 9101 and 9111. This is double the Stage 3G.8 sample.
- **Cohorts.** BYPASS_A and BYPASS_B have 432 rows each (18 per level × band in H2–H4) with no shortfall. They carry population weight 0.
- **Lineage.** All rows are disjoint from prior lineage through the Stage 3G.8 sealed rows.
- **Statistics.** Margins are frozen at hit < .05 and normalized regret < .01, with n ≥ 100. There are ten registered NI endpoints at α = .005 each, which is stricter than Stage 3G.8's .00625. Each test uses 40,000 paired resamples.
- **Generation.** Parallel workers only pre-compute pure records, and a single canonical admission pass decides every row. A dry run confirmed the payload is byte-identical after the cache is partly rebuilt.

## Primary S2 noninferiority (required: ALL in both families)

| Endpoint | A | B | A UB hit / nreg | B UB hit / nreg |
|---|---|---|---|---|
| S2 vs S1 hidden-state control | PASS | PASS | .0074 / .0048 | .0091 / .0068 |
| S2 vs S0 runtime | PASS | PASS | .0015 / .0004 | .0007 / .0008 |

Per-stratum results are reported, not required:

| Stratum | S2 vs hidden | S2 vs runtime |
|---|---|---|
| LOW | NOT_TESTABLE (B nreg UB .0118) | PASS |
| MID | PASS | PASS |
| HIGH | PASS | PASS |
| RETREAT | NOT_TESTABLE (B nreg UB .0119) | PASS |
| HORIZON_DEPENDENT | PASS | PASS |

## Controls

| Variant | A hit / nreg | B hit / nreg |
|---|---|---|
| S0 current runtime | .8010 / .0840 | .7969 / .0855 |
| S2 semantic-only | .8021 / .0829 | .7988 / .0847 |
| S1 hidden current state | .8053 / .0806 | .8038 / .0806 |
| S1R hidden refit | .8036 / .0826 | .8014 / .0831 |
| S0H runtime + hidden | .8051 / .0809 | .8034 / .0813 |
| S3 learned typed columns | .7958 / .0876 | .7947 / .0865 |

**Hidden current state.** It shows no replicated material advantage in any required population stratum.

- The largest effect is in TARGET_BEARING: +3.1 pp in A and +4.2 pp in B (refit +2.8/+3.6). These are real (both CIs exclude 0) but below the 5 pp materiality threshold.
- In the population BYPASS stratum it is material in B only (n = 34; A n = 29), so it is not replicated.
- In the BYPASS-conditional cohorts it is materially better: +12.5 pp in A and +13.0 pp in B.

Individual health and availability matter on BYPASS-offered decisions, but those are about 1% of population rows. This is a task-scoped limit, recorded here, not a population deficiency.

**Learned typed columns (S3).** They remain harmful. Replicated HARMFUL appears in both BYPASS cohorts (−21.1 and −22.0 pp against S0). The population point estimates are negative everywhere (ALL −0.5/−0.2 pp; RETREAT A −1.9 pp).

**Semantic channel.** It is never harmful and its value is not material. It gives a small positive effect: ALL +0.1/+0.2 pp, and HORIZON_DEPENDENT +0.3/+0.4 pp with both CIs excluding 0.

`RELATION_INFORMATION_USEFUL_FOR_SEMANTICS_NOT_SCORING=true`.

## C2 and runtime

| C2 condition | Result |
|---|---|
| 1 Primary NI passes in both families | true |
| 2 No replicated material hidden-state advantage | true |
| 3 Environment-dynamics value non-material | true |
| 4 Semantic exactness without privilege | true |
| 5 UNKNOWN boundaries intact | true |
| 6 No unresolved material observation deficiency | true |

`C2_OBSERVABLE_STATE_SUFFICIENT_FOR_DEMONSTRATED_TASKS=true`.

```text
CURRENT_RUNTIME_DECISION_NONINFERIOR=true   (runtime vs hidden, runtime vs semantic: PASS in A and B)
SEMANTICALLY_EXACT_RUNTIME_POSSIBLE=true    (requires adopting the typed relation disclosure)
CURRENT_RUNTIME_SEMANTICALLY_EXACT=false    (coarse contract leaves 551/1233 BYPASS substitutes UNKNOWN)
```

## Stage 3G closure

C1–C8 are all true:

| Condition | Source |
|---|---|
| C1 | re-verified (integrity on 650 sample rows) |
| C2 | this stage |
| C3 | re-verified (UNKNOWN safety on every candidate) |
| C4–C8 | carried from Stage 3G.8 and reproduced |

`STAGE3G_SCIENTIFICALLY_COMPLETE=true`, `REMAINING_3G_BLOCKER=NONE`, `READY_FOR_3G_COUNTERFACTUAL_PREDICTION=false`, `WORLD_MODEL_WORK_NOW_JUSTIFIED=false`, `STRUCTURAL_OOD=NOT_TESTED`.

The proposed closure bindings are in `stage3g-closure-candidate.json` (candidate hash `0c68b0ca…242f`). It covers the 3G.1/3G.2 through 3G.9 certificates, the observation boundary V2, the semantic channel, the target-eligibility contract, the prediction lifecycle reference, the closure facts and the authority state. It is **PROPOSED_NOT_FROZEN**. A formal Stage 3G freeze is a separate, explicitly authorized step, following the precedent of the Stage 3F freeze.

## Limits

- Sufficiency is task-scoped to the balanced known-composition population. It is not omniscience.
- COLLECT, TRANSFER and BUILD have no population rows.
- BYPASS-conditional decisions do benefit materially from hidden individual state.
- Search caps 1024/2048 and depth 3 are inherited, not re-tested.
- Structural OOD was not tested.
- The semantic channel is offline. Using it at runtime requires adopting the typed relation disclosure in the adapter contract.

## Verification

- Full suite: platform 2,387 passed, 0 failed, 1 skipped (including 8 Stage 3G.9 tests); overlay 23 passed.
- Legacy lab: 33 passed, with the same seven failures. Their causes match and the lab tree is unchanged.
- Two read-only `--check` runs reproduced the certificate with tracked state unchanged.
- The fresh-clone reproduction rebuilds the sealed rows, the evidence and the tests from source, importing only hash-verified ancestor raw payloads (`stage3g9-reproduction-proof.json`).
