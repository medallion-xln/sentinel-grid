# Stage 3G.9 frozen protocol

Stage 3G.9 is the C2 observable-state sufficiency requalification. It addresses only the single remaining Stage 3G blocker, C2. The machine plan is `stage3g9/plan.mjs`, and its hash is bound in `artifacts/stage3g9-c2-requalification/stage3g9-analysis-plan.json`.

The stage runs at R0 with no live adapter change. It includes no Stage 3H work, no counterfactual prediction, no world model, no Oracle/Router/Nexus/Prime redesign and no Expert #10.

## Semantic channel

`TYPED_RELATION_SEMANTIC_CHANNEL_V1` uses the audit-only typed-relation candidate in exactly three places:

- exact BYPASS substitute resolution: the t0 root is exact; a continuation is exact only when a single typed substitute exists, conditional on the branch being legal;
- exact dependency rewiring in the conditional ledger;
- deterministic conditional branch semantics.

It never changes the 36 root-state columns, the objective columns, the model dimension, the training data or the coefficients. With the disclosure off, it reproduces the frozen Stage 3G.7 columns exactly.

## Variants

| Variant | Scorer | Columns |
|---|---|---|
| S0 current runtime | frozen Stage 3G.8 `OBJECTIVE_PROGRESS_ONLY` (60) | coarse G7 54 + OP 6 |
| S2 semantic-only (primary) | the identical S0 scorer | semantic-search G7 54 + OP 6 |
| S1 hidden-current-state control | frozen Stage 3G.8 `RUNTIME_PLUS_CURRENT_PRIVATE` | S2 vector + 6 hidden target facts |
| S1R | refit on the reused OPEN rows (diagnostic) | S2 vector + 6 hidden target facts |
| S0H runtime hidden control | frozen `RUNTIME_PLUS_CURRENT_PRIVATE` | S0 vector + 6 hidden facts |
| S3 learned typed control (diagnostic only) | frozen `OBJECTIVE_PROGRESS_PLUS_TYPED_RELATION` | Stage 3G.8 typed vector with learned typed root columns |

A refit on the reused Stage 3G.7 OPEN rows must reproduce the frozen S0, S1 and S3 hashes.

## Sample

- **Population.** Two families, A and B. Each has 192 rows per level × horizon band and 24 per objective, for 7,680 rows and 4,608 inferential rows per family. Seeds come from fixed 16-seed panels starting at 9101 and 9111. Admission follows the canonical traversal.
- **Cohorts.** BYPASS_A and BYPASS_B take 18 rows per level × band in H2–H4, using panels starting at 9121 and 9131. They are descriptive and carry population weight 0.
- **Lineage.** The sample is disjoint from all prior lineage through the Stage 3G.8 sealed rows. Reserved seeds 5023 and 5033 are untouched.
- **Parallelism.** Workers only pre-compute pure records; a single canonical pass admits rows, so the payload does not depend on the cache.

## Statistics

The margins are frozen: hit deficit < .05 and normalized-regret excess < .01, with n ≥ 100. Each test uses 40,000 deterministic paired resamples.

There are ten registered NI endpoints, each tested in families A and B on ALL. The per-endpoint alpha is .005, which is not larger than Stage 3G.8's .00625.

| Endpoint group | Role |
|---|---|
| S2 vs S1, and S2 vs S0 | required |
| S0 vs S0H, and S0 vs S2 | Phase 7 |
| S2 vs S1R | diagnostic |

Primary noninferiority is also reported per stratum (LOW, MID, HIGH, RETREAT, HORIZON_DEPENDENT) but is not required there.

Materiality uses the Stage 3G.7 rule, replicated in both families, over the frozen Stage 3G.8 population strata. No stratum is added.

## C2 and closure

C2 passes only if all six conditions hold:

1. S2 passes both required NI endpoints in both families.
2. No hidden-state control has a replicated material advantage.
3. The value of environment dynamics stays non-material (inherited from Stage 3G.8).
4. Semantic exactness is 1.0 without privileged information.
5. UNKNOWN boundaries stay intact.
6. No audit-only channel has a replicated material advantage over S2.

The other closure conditions (C1, C3–C8) carry over from the Stage 3G.8 certificate and are re-verified here. If C2 fails, the certificate names exactly one blocker.
