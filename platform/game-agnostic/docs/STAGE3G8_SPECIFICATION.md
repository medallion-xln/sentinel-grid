# Stage 3G.8 frozen protocol

Stage 3G.8 is the existing-observation projection and prospective disclosure value qualification. The machine plan is `stage3g8/plan.mjs`, and its hash is bound in `artifacts/stage3g8-projection-disclosure/stage3g8-analysis-plan.json`. Runtime stays at R0. The live adapter is unchanged. There is no environment predictor, no learned world model, no Stage 3I work, no Oracle/Router redesign, no Expert #10 and no Stage 3H work.

- **OBJECTIVE_PROGRESS_V1.** This projects `metadata.objectives`, which is already delivered. Required and delivered amounts are E0; remaining amount, completion fraction and completion are E1. It is an exact inverse projection, so there is no projection loss.
- **TYPED_RELATION_DISCLOSURE_CANDIDATE_V1.** This is prospective and audit-only. It keeps the canonical Forge relation type that `observe()` collapses to a Nexus kind. It must reproduce the delivered coarse relations exactly. It reads only `world.relations[].{from,to,type}`.
- **Heads.** All heads are linear and fit on the reused Stage 3G.7 OPEN set (rows with horizon > 2). `BASELINE_G7` is the certified Stage 3G.7 head; a refit must reproduce its hash. The other heads add only the named column blocks. The hidden-current-state heads are audit-only diagnostics.
- **Sealed data.** There are two fresh population families, A and B, with 96 rows per level × horizon band (12 per objective). There are also two BYPASS-conditional cohorts, with 9 rows per level × band in H2–H4; they are descriptive and carry population weight 0. All lineage is disjoint from prior stages.
- **Statistics.** Materiality uses the Stage 3G.7 rule and must replicate in both families. Noninferiority is one-sided, Bonferroni-corrected over 8 endpoints, with 40,000 paired resamples and margins of .05 (hit) and .01 (normalized regret). n < 100 is NOT_TESTABLE.
- **Audits.**
  - Objective fidelity on every row.
  - BYPASS on every natural root: coarse vs typed vs the actual kernel rewiring.
  - Oracle value of information for coarse-consistent subtype retyping.
  - Frozen Stage 3G.7 column parity on every candidate.
  - On every 25th row: D4, identity renaming and order, poisoning, and determinism.
- **Decision rules.** Sufficiency and closure rules are in `DECISION_RULES`. If closure fails, the stage names exactly one blocker.

Stage code lives in `stage3g8/`, not in `src/` or `scripts/`. The frozen Stage 3G.7 source hash scans every `.js`/`.mjs` under those two trees, so adding files there would invalidate its reproduction.
