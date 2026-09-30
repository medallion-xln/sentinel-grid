# Stage 3G.4 — Level-Stratified Temporal Replication

Stage 3G.3 found a split result. Multi-step temporal value was material on OOD (levels 6–7) and not on HOLDOUT
(levels 0–2). Levels 3–5 were never evaluated, so partition identity and curriculum level were confounded. Stage 3G.4
asks whether decision-relevant temporal value increases with curriculum level, independently of partition identity.

This stage only replicates and stratifies. The specification (the revised stage prompt, with the design corrections
folded in) is `docs/STAGE3G4_SPECIFICATION.md`, and it is committed with the freeze.

| Artifact | Role |
| --- | --- |
| `src/stage3g/observable-option-features-v1.js` | `SENTINEL_OBSERVABLE_OPTION_FEATURES_V1`: E1 option-preservation features, with no simulation |
| `scripts/stage3g4/plan.mjs`, `plan-cli.mjs` | The pre-registered plan, and its writer/checker |
| `scripts/stage3g4/evidence.mjs` | Stage 3G.3 evidence, plus bounded search (privileged) and observable option features |
| `scripts/stage3g4/generate.mjs` | Open fit set (seed 6011) and sealed seed families A = 5022, B = 5032 |
| `scripts/stage3g4/certify.mjs` | Open phase, `--dry-run`, sealed evaluation, `--check` |
| `tests/stage3g4-level-replication.test.js` | Tests |

## Design

**Seed families crossed with level.**

- Family A (5022) and family B (5032) each cover levels 0–7 × horizon bands H0–H4, with 190 admitted rows per cell:
  15,200 sealed rows in all.
- The two families differ only by generation seed. At a fixed level, the difference between them is the partition effect.
- The level slope is the level effect.

**Frozen models.**

- The primary analysis reuses the Stage 3G.3 fitted models byte for byte. They were fitted on levels 0–1 DEV rows.
  NEW_LINEAR, NEW_INTERACTION, D_ONE_STEP, D_H2, D_H3, D_H4 and D_OPTION all reproduce their Stage 3G.3 model hashes.
- The secondary analysis refits NEW_LINEAR, D_H3 and D_OBS_OPTION on a level-balanced open fit set (seed 6011, 60 per
  cell). This separates level scaling from level-0/1 extrapolation.

**Bounded search (PRIVILEGED, known model).**

- The search value is a candidate's immediate scalar plus the maximum cumulative scalar over every sequence of d further
  legal actions. It is exhaustive and needs no tie-break, so it is D4-invariant.
- A depth-1 search value equals the H2 truncated return by construction, because the greedy continuation already takes
  the one-step maximum. D_SEARCH_D1 therefore duplicates D_H2, and their model hashes are identical.
- The informative controls are DEPTH_2 (every row) and DEPTH_3 (every 16th row).

**Observable option features (E1, deployable).**

- For the destination cell: open moves, safe moves (not on hazard terrain, not adjacent to a visible hostile), retreat
  gain, border mobility, on-hazard, and non-hazard exits.
- All come from the visible map, the observed hostiles and the action semantics, without simulation.

Results are recorded below after certification.
