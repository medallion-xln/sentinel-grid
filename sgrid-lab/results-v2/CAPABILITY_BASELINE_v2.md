# Sentinel Grid - Capability Baseline v2 (env v2, outcome-vector scoring)

Environment: reference-colony **v2** (hardened, losable; heuristic collapses 19/20 unaided). Horizon 2400 ticks.
Scoring: declared vector {"survived":0.35,"ticksFrac":0.15,"popN":0.2,"infraN":0.1,"exploredN":0.1,"threatContained":0.1} - survival is a real event; no reuse of health() weighting.
Provenance: results-v2/baseline2.json. Latency: warmed (first 5 decisions/episode discarded), per-config P50/P95.
v1 (health-proxy) results FROZEN at results-v1-health-proxy/ - do not compare across scoring versions.

## Ladder (28 paired seeds)
| Config | meanAgg | collapses | survived | popN | infraN | exploredN | threat | latP50 | latP95 |
|---|---|---|---|---|---|---|---|---|---|
| C0 | 0.242 | 27/28 | 0.036 | 0 | 0.14 | 0.1 | 0.878 | 0ms | 0ms |
| C1 | 0.206 | 28/28 | 0 | 0 | 0.991 | 0.1 | 0.88 | 0.13ms | 0.18ms |
| C2 | 0.787 | 0/28 | 1 | 0.507 | 0.631 | 0.766 | 0.462 | 0.8ms | 1.16ms |
| C3 | 0.653 | 3/28 | 0.893 | 0.008 | 1 | 0.282 | 0.717 | 17.66ms | 20.9ms |
| RND | 0.818 | 0/28 | 1 | 0.344 | 1 | 1 | 0.492 | 0ms | 0ms |

## Paired comparisons (agg, tie eps .02)
- **C2_vs_C0**: 28W/0L/0D, winRate 1, LCB 0.879 | segs {"calm":{"n":28,"w":28,"l":0,"lcb":0.879}}
- **C2_vs_RND**: 0W/18L/10D, winRate 0, LCB 0 **SEGMENT VETO: calm** | segs {"calm":{"n":28,"w":0,"l":18,"lcb":0}}
- **C3_vs_C1**: 28W/0L/0D, winRate 1, LCB 0.879 | segs {"calm":{"n":28,"w":28,"l":0,"lcb":0.879}}
- **C2_vs_C3**: 27W/0L/1D, winRate 1, LCB 0.875 | segs {"calm":{"n":28,"w":27,"l":0,"lcb":0.875}}
- **C1_vs_C0**: 0W/16L/12D, winRate 0, LCB 0 **SEGMENT VETO: calm** | segs {"calm":{"n":28,"w":0,"l":16,"lcb":0}}

## Budget sweep (C2)
[{"sims":64,"meanAgg":0.746,"survRate":1,"n":8},{"sims":256,"meanAgg":0.816,"survRate":1,"n":6}]

## C4/C5 status
C4/C5 inherit C3 quality exactly under env v2 (verified on 60 states)

## Preregistration outcomes
- P1: Heuristic (C0) collapses in most episodes (greedy probe showed 19/20) -> **MATCHED (27/28 collapsed)**
- P2: Vanguard greedy (C1) inherits heuristic behavior -> also collapse-prone -> **MATCHED (28/28 collapsed)**
- P3: Uniform-prior Prime materially raises survival + agg over heuristic. ALTERNATIVE: if collapse spirals (~tick 1800) exceed ~6-ply reactive correction, C2 fails too -> finding = long-horizon planning gap (Horizon's future job), not a search bug -> **MATCHED (lcb 0.879)**
- P4: Vanguard-guided Prime (C3) ~ Vanguard greedy (prior capture persists under env v2) -> **SURPRISE (wr 1) - investigate**
- P5: Random control survives by stagnating (low pop growth) but loses to C2 on the aggregate - the vector resists do-nothing gaming -> **CHECK (RND surv 1, agg 0.818)**
- P6: C2 beats the do-nothing survivor on the full vector -> **NOT CONFIRMED (wr 0, lcb 0) - see alternative**

## Pending (real environment / local machine)
Full sweep + degraded-ruler re-validation under v2 (one command each, heavier than container budget); human ranking of real ZekNova states; adapter feasibility; browser device runs; environment_id PHP wiring (migration shipped).
