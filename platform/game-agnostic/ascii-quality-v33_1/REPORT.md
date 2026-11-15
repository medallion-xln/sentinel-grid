# ASCII Worlds v33.1 — gameplay recovery report

Lane `ascii-quality-v33_1` · mechanics v32 unchanged · presentation v33 unchanged · authority R0 · 24 levels / 8 games inventoried from source.

## Phase A1 — inventory

Full per-level inventory (identity, dimensions, initial conditions, legal actions, observation keys, step/terminal citations with file:line and hash, controllers, rendering, seed contract, entrypoints, tests, known regressions): `artifacts/ASCII_V33_1_INVENTORY_V1.json`.

| GAME | LEVEL | actions@t0 | limit | step (file:line) | terminal (file:line) |
|---|---|---|---|---|---|
| pong | PONG_ADVANCED_1 | 3 | 5000 | ascii-suite/v32/legacy-extension.mjs:69 | ascii-suite/v32/legacy-extension.mjs:81 |
| pong | PONG_ADVANCED_2 | 3 | 5000 | ascii-suite/v32/legacy-extension.mjs:69 | ascii-suite/v32/legacy-extension.mjs:81 |
| pong | PONG_ADVANCED_3 | 3 | 5000 | ascii-suite/v32/legacy-extension.mjs:69 | ascii-suite/v32/legacy-extension.mjs:81 |
| platformer | PLATFORMER_ADVANCED_1 | 7 | 1500 | ascii-suite/worlds/platformer.mjs:158 | ascii-suite/worlds/platformer.mjs:189 |
| platformer | PLATFORMER_ADVANCED_2 | 7 | 1500 | ascii-suite/worlds/platformer.mjs:158 | ascii-suite/worlds/platformer.mjs:189 |
| platformer | PLATFORMER_ADVANCED_3 | 7 | 4500 | ascii-suite/worlds/platformer.mjs:158 | ascii-suite/worlds/platformer.mjs:189 |
| fighter | FIGHTER_ADVANCED_1 | 12 | 900 | ascii-suite/v32/legacy-extension.mjs:63 | ascii-suite/v32/legacy-extension.mjs:67 |
| fighter | FIGHTER_ADVANCED_2 | 12 | 5400 | ascii-suite/v32/legacy-extension.mjs:63 | ascii-suite/v32/legacy-extension.mjs:67 |
| fighter | FIGHTER_ADVANCED_3 | 12 | 10800 | ascii-suite/v32/legacy-extension.mjs:63 | ascii-suite/v32/legacy-extension.mjs:67 |
| racing | RACING_ADVANCED_1 | 5 | 6000 | ascii-suite/worlds/racing.mjs:122 | ascii-suite/worlds/racing.mjs:153 |
| racing | RACING_ADVANCED_2 | 5 | 6000 | ascii-suite/worlds/racing.mjs:122 | ascii-suite/worlds/racing.mjs:153 |
| racing | RACING_ADVANCED_3 | 5 | 18000 | ascii-suite/worlds/racing.mjs:122 | ascii-suite/worlds/racing.mjs:153 |
| rescue | RESCUE_ADVANCED_1 | 8 | 600 | ascii-suite/v3/worlds/rescue.mjs:13 | ascii-suite/v3/worlds/rescue.mjs:28 |
| rescue | RESCUE_ADVANCED_2 | 8 | 720 | ascii-suite/v3/worlds/rescue.mjs:13 | ascii-suite/v3/worlds/rescue.mjs:28 |
| rescue | RESCUE_ADVANCED_3 | 8 | 840 | ascii-suite/v3/worlds/rescue.mjs:13 | ascii-suite/v3/worlds/rescue.mjs:28 |
| cards | CARDS_ADVANCED_1 | 4 | 160 | ascii-suite/v3/worlds/cards.mjs:7 | ascii-suite/v3/worlds/cards.mjs:9 |
| cards | CARDS_ADVANCED_2 | 4 | 160 | ascii-suite/v3/worlds/cards.mjs:7 | ascii-suite/v3/worlds/cards.mjs:9 |
| cards | CARDS_ADVANCED_3 | 4 | 480 | ascii-suite/v3/worlds/cards.mjs:7 | ascii-suite/v3/worlds/cards.mjs:9 |
| factory | FACTORY_ADVANCED_1 | 11 | 480 | ascii-suite/v32/factory-flow.mjs:5 | ascii-suite/v32/strategic-extension.mjs:100 |
| factory | FACTORY_ADVANCED_2 | 11 | 600 | ascii-suite/v32/factory-flow.mjs:5 | ascii-suite/v32/strategic-extension.mjs:100 |
| factory | FACTORY_ADVANCED_3 | 11 | 720 | ascii-suite/v32/factory-flow.mjs:5 | ascii-suite/v32/strategic-extension.mjs:100 |
| roguelike | ROGUE_ADVANCED_1 | 8 | 1000 | ascii-suite/v3/worlds/roguelike.mjs:7 | ascii-suite/v3/worlds/roguelike.mjs:17 |
| roguelike | ROGUE_ADVANCED_2 | 8 | 1400 | ascii-suite/v3/worlds/roguelike.mjs:7 | ascii-suite/v3/worlds/roguelike.mjs:17 |
| roguelike | ROGUE_ADVANCED_3 | 8 | 1800 | ascii-suite/v3/worlds/roguelike.mjs:7 | ascii-suite/v3/worlds/roguelike.mjs:17 |

## Phase A2 — Platformer Advanced defect

Reproduction on the identical v33 population (seeds 271828..271839): STRONG v1 {"TIMEOUT":12}. Reference witness: scripted public-action family WIN at t169 (d=1.5, hold=8), replay-verified=true.

Stall: {"startTick":108,"xRange":[104.75,108.75],"actions":{"MOVE_LEFT":61,"MOVE_RIGHT":59},"deaths":0,"illegal":0}. First meaningful divergence: STRONG never exceeds x=108.75 after tick 108; the witness passes that x at tick 118 and wins at t169.

Candidate set at the first MOVE_LEFT (tick 105, x=107.25): 101 plans, 1 "safe", 0 clearing (anyCleared=false); decided MOVE_LEFT — top plan BACK9+RUN6+JUMP (endX 130.98); RUN plan: {"plan":"RUN","safe":false,"cleared":false,"died":true,"damage":0,"endX":138.92,"ticks":32,"landingX":null,"value":-1061.08}.

Classification **D — CONTROLLER_STRATEGY_OR_PLANNING_DEFECT** (confirmed=true). When GAP@x0 enters the 26-cell window no candidate trajectory (RUN k<=16 + JUMP, WAIT, BACK) can clear it within the 45-tick horizon because the takeoff must happen past the elevated platform that ends 4 cells before the gap (head-bump otherwise); the scoring rule treats every non-clearing plan that ends before the gap as "safe", so a BACK plan wins, the body moves left, the gap leaves the window, the "clear path" branch moves right, and the cycle repeats until TIMEOUT.

Ruled out: - world mechanics: no death, damage, head bump or illegal action during the stall; the scripted public-action witness wins (replay-verified) on the same world
- observation/state encoding: the planner sees the gap and the platform (terrainAhead) correctly
- action legality: zero illegal selections
- terminal/win logic: the witness WIN triggers at x >= exit with the Advanced gate open
- rendering: not involved (decisions are computed from the observation, never from the render)

V2 copy equivalence (repair off): seed 271828 true; twelve seeds true; tiers 2/3 true.

## Phase A3/A7 — full-series audit (fresh preregistered seeds)

Seeds 2080374784, 2080382691, 2080390598 (family V32_DEV_OFFSET). Independent claims per level: WORLD_VALID, WORLD_SOLVABLE, CONTROLLER_COMPETENT, BENCHMARK_QUALIFIED.

| LEVEL | WORLD_LOADS | RENDERER | INPUT | ACTIONS_LEGAL | PROGRESS | WIN_REACHABLE | STRONG | REFERENCE | WORLD_VALID | SOLVABLE | CONTROLLER | BENCHMARK |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PONG_ADVANCED_1 | YES | YES | YES | YES | YES | REFERENCE_NOT_ESTABLISHED | {"TIMEOUT":3} | REFERENCE_NOT_ESTABLISHED | YES | NOT_ESTABLISHED | NO | NOT_QUALIFIED |
| PONG_ADVANCED_2 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"LOSS":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | NO | DEV_WORLD_VALID_AND_SOLVABLE |
| PONG_ADVANCED_3 | YES | YES | YES | YES | YES | REFERENCE_NOT_ESTABLISHED | {"LOSS":3} | REFERENCE_NOT_ESTABLISHED | YES | NOT_ESTABLISHED | NO | NOT_QUALIFIED |
| PLATFORMER_ADVANCED_1 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"TIMEOUT":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | NO | DEV_WORLD_VALID_AND_SOLVABLE |
| PLATFORMER_ADVANCED_2 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"WIN":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| PLATFORMER_ADVANCED_3 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"WIN":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| FIGHTER_ADVANCED_1 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"WIN":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| FIGHTER_ADVANCED_2 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"WIN":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| FIGHTER_ADVANCED_3 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"WIN":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| RACING_ADVANCED_1 | YES | YES | YES | YES | YES | PARTIAL 1/3 | {"FINISH_PLACE_1":1,"FINISH_PLACE_4":2} | 1/1_WITNESSES_REPLAY_VERIFIED | YES | PARTIAL | PARTIAL | NOT_QUALIFIED |
| RACING_ADVANCED_2 | YES | YES | YES | YES | YES | PARTIAL 1/3 | {"FINISH_PLACE_1":1,"FINISH_PLACE_4":2} | 1/1_WITNESSES_REPLAY_VERIFIED | YES | PARTIAL | PARTIAL | NOT_QUALIFIED |
| RACING_ADVANCED_3 | YES | YES | YES | YES | YES | REFERENCE_NOT_ESTABLISHED | {"FINISH_PLACE_4":2,"FINISH_PLACE_1":1} | REFERENCE_NOT_ESTABLISHED | YES | NOT_ESTABLISHED | NO | NOT_QUALIFIED |
| RESCUE_ADVANCED_1 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"SUCCESS":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| RESCUE_ADVANCED_2 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"SUCCESS":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| RESCUE_ADVANCED_3 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"FAILURE":1,"SUCCESS":2} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | PARTIAL | DEV_WORLD_VALID_AND_SOLVABLE |
| CARDS_ADVANCED_1 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"FAILURE":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | NO | DEV_WORLD_VALID_AND_SOLVABLE |
| CARDS_ADVANCED_2 | YES | YES | YES | YES | YES | PARTIAL 2/3 | {"FAILURE":3} | 2/2_WITNESSES_REPLAY_VERIFIED | YES | PARTIAL | NO | NOT_QUALIFIED |
| CARDS_ADVANCED_3 | YES | YES | YES | YES | YES | PARTIAL 2/3 | {"FAILURE":3} | 2/2_WITNESSES_REPLAY_VERIFIED | YES | PARTIAL | NO | NOT_QUALIFIED |
| FACTORY_ADVANCED_1 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"SUCCESS":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| FACTORY_ADVANCED_2 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"SUCCESS":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| FACTORY_ADVANCED_3 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"SUCCESS":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| ROGUE_ADVANCED_1 | YES | YES | YES | YES | YES | WITNESS_FOUND | {"SUCCESS":3} | 3/3_WITNESSES_REPLAY_VERIFIED | YES | YES | YES | DEV_WORLD_VALID_AND_SOLVABLE |
| ROGUE_ADVANCED_2 | YES | YES | YES | YES | YES | PARTIAL 2/3 | {"FAILURE":3} | 2/2_WITNESSES_REPLAY_VERIFIED | YES | PARTIAL | NO | NOT_QUALIFIED |
| ROGUE_ADVANCED_3 | YES | YES | YES | YES | YES | PARTIAL 1/3 | {"FAILURE":3} | 1/1_WITNESSES_REPLAY_VERIFIED | YES | PARTIAL | NO | NOT_QUALIFIED |

## Phase A4 — root causes

| DEFECT_ID | AFFECTED | CLASS | SOURCE | CAUSAL EXPLANATION | FIX |
|---|---|---|---|---|---|
| PLATFORMER_ADVANCED_PLANNER_WINDOW_HYSTERESIS | PLATFORMER_ADVANCED_1 | D | ascii-suite/controllers/platformer.mjs — decide(): `if (!target || target.x0 - obs.body.x > 26 ...)` else-branch executes plan().be | When GAP@x0 enters the 26-cell window no candidate trajectory (RUN k<=16 + JUMP, WAIT, BACK) can clear it within the 45-tick horizon because the takeoff must happen past the elevated platform that ends 4 cells before the | CONTROLLER_STRATEGY_BUG_IN_SEPARATELY_VERSIONED_CONTROLLER; REPAIRED_CANDIDATE (24/24 Advanced, no Expert/Extreme regression; development evidence) |
| RESCUE_STALE_PACKET_UNDEFINED_CIVILIAN | RESCUE_ADVANCED_1, RESCUE_ADVANCED_2, RESCUE_ADVANCED_3 | B/D | ascii-suite/v3/controllers.mjs — rescueDecision: find(p,'RESCUE_CIVILIAN',v=>{const c=o.civilians.find(c=>c.id===v.id);retu | offered actions are fresh (kernel packet) while the observation is 10 ticks old under STALE; the controller assumed every offered civilian is observed | CONTROLLER_ROBUSTNESS_BUG_IN_SEPARATELY_VERSIONED_CONTROLLER; REPAIRED_CANDIDATE (0 exceptions under STALE; outcomes recorded, not claimed improved) |
| PONG_NOT_REPAIRED | pong (all tiers) | see matrix ROOT_CAUSE | — | win condition not reached in the privileged upper-bound probe; changing the environment opponent would change the benchmark meaning → proposed as a NEW versioned benchmark pending authorization; no source change made | NONE |
| RACING_NOT_REPAIRED | racing (all tiers) | see matrix ROOT_CAUSE | — | first place not reached by any privileged rule-driver parameterisation; start-grid/rival pace are benchmark design; no runtime defect found; no source change made | NONE |
| CARDS_NOT_REPAIRED | cards (all tiers) | see matrix ROOT_CAUSE | — | controller competence under hidden information; world valid and solvable (privileged witness); Cards planner repair was stopped by prior decision (3H.14/15); no change | NONE |
| ROGUELIKE_NOT_REPAIRED | roguelike (all tiers) | see matrix ROOT_CAUSE | — | controller combat exposure (deaths) on Expert/Extreme; world valid and solvable; no mechanics defect; no change | NONE |

Per-level ROOT_CAUSE strings (hypothesis vs confirmed is stated inline) are in the matrix artifact.

Shared infrastructure (tick counter, state cloning/purity, packet immutability, seeding, stale-packet and illegal-action rejection, sensor contracts, terminal handling, timeout-at-limit): sameSeedSameWorld 24/24; differentSeedDifferentWorld 24/24; packetFrozen 24/24; tickStartsAtZero 24/24; stepIsPure 24/24; tickIncrementsByOne 24/24; stalePacketRejected 24/24; illegalActionRejected 24/24; delayedSensorAgeTwo 24/24; missingSensorDropsObservationNotActions 24/24; terminalReached 24/24; terminalLegalEmpty 24/24; terminalStepRefused 24/24; timeoutExactlyAtLimit 24/24.

### Probe summaries

- **Pong** (privileged upper bound; never a policy input): tier 1: 305 point-winning contacts of 1610 tried across 6 approach states; STRONG 0:2 after 3000 ticks; opponent arrival error max 3.21 (reach 3.5); tier 2: 440 point-winning contacts of 1606 tried across 6 approach states; STRONG 6:5 after 3000 ticks; opponent arrival error max 20.07 (reach 3.5); tier 3: 152 point-winning contacts of 1598 tried across 6 approach states; STRONG 0:6 after 3000 ticks; opponent arrival error max 2.75 (reach 3.5)
- **Racing**: tier 1 seed 2080374784: grid 1, STRONG place 1, sweep 45/45 first, pole-isolation place 1; tier 1 seed 2080382691: grid 4, STRONG place 4, sweep 0/45 first, pole-isolation place 1; tier 2 seed 2080374784: grid 1, STRONG place 1, sweep 41/45 first, pole-isolation place 1; tier 2 seed 2080382691: grid 4, STRONG place 4, sweep 0/45 first, pole-isolation place 1
- **Cards**: t1 2/10 FINAL_TURNS_AFTER_DECK_EMPTY (errors left 2, critical losses 5); t1 1/10 FINAL_TURNS_AFTER_DECK_EMPTY (errors left 1, critical losses 6); t1 1/10 FINAL_TURNS_AFTER_DECK_EMPTY (errors left 1, critical losses 6); t2 8/16 FINAL_TURNS_AFTER_DECK_EMPTY (errors left 1, critical losses 6); t2 13/16 FINAL_TURNS_AFTER_DECK_EMPTY (errors left 2, critical losses 3); t2 8/16 FINAL_TURNS_AFTER_DECK_EMPTY (errors left 2, critical losses 4); t3 9/16 FINAL_TURNS_AFTER_DECK_EMPTY (errors left 2, critical losses 5); t3 12/16 FINAL_TURNS_AFTER_DECK_EMPTY (errors left 2, critical losses 2); t3 10/16 FINAL_TURNS_AFTER_DECK_EMPTY (errors left 2, critical losses 5)
- **Roguelike**: t1 SUCCESS floors 2/2; t1 SUCCESS floors 2/2; t1 SUCCESS floors 2/2; t2 FAILURE floors 2/4 cause ENEMY_ADJACENT; t2 FAILURE floors 2/4 cause ENEMY_ADJACENT; t2 FAILURE floors 2/4 cause ENEMY_ADJACENT; t3 FAILURE floors 1/5 cause TRAP; t3 FAILURE floors 1/5 cause TRAP; t3 FAILURE floors 1/5 cause TRAP

## Phase A6 — Platformer acceptance (preregistered: 12 v33 seeds + 12 fresh seeds × 3 tiers × 2 controllers)

| population | tier | STRONG v1 | STRONG_V33_1 | replay | illegal |
|---|---|---|---|---|---|
| V33_TWELVE | 1 | {"TIMEOUT":12} | {"WIN":12} | true | 0 |
| V33_TWELVE | 2 | {"WIN":12} | {"WIN":12} | true | 0 |
| V33_TWELVE | 3 | {"WIN":12} | {"WIN":12} | true | 0 |
| FRESH_TWELVE | 1 | {"TIMEOUT":12} | {"WIN":12} | true | 0 |
| FRESH_TWELVE | 2 | {"WIN":12} | {"WIN":12} | true | 0 |
| FRESH_TWELVE | 3 | {"WIN":12} | {"WIN":12} | true | 0 |

Privileged access: planner imports ["../ascii-suite/worlds/platformer.mjs"] (symbols PHYS, bodyStep, bodyLegalActions, bodyFallback); onlyPublicPhysics=true. Native UI evidence: evidence/ui-platformer-advanced-strong-v33_1-win.png (WIN t160) and evidence/ui-platformer-advanced-strong-v1-timeout.png (TIMEOUT t1500 at x≈108.75), both on the v33.1 server (port 4186) with mechanics ASCII_V32_UNCHANGED.

## Phase A8 — Observatory game-health view

Additive overlay `observatory/server.mjs` (port 4193; spawns the unchanged live Observatory on 4194 and proxies it, SSE included). In STAGE 3H EVALUATION mode it renders GAME / LEVEL / WORLD_HEALTH / REFERENCE_SOLVABILITY / STRONG_WIN_RATE / TIMEOUT_RATE / ILLEGAL_ACTION_RATE / REPLAY_STATUS / VERSION / KNOWN_DEFECTS / ROOT_CAUSE / REPAIR_STATUS with the sha256 of the evidence file behind every row; untested levels show NOT_ESTABLISHED. No protected Observatory file is modified.

## Result

```text
STATUS=COMPLETE_DEVELOPMENT_AUDIT_24_LEVELS; PLATFORMER_PLANNER_AND_RESCUE_STALE_REPAIRED_AS_VERSIONED_CANDIDATES; PONG_RACING_CARDS_ROGUE_FAILURES_PRESERVED_AND_CLASSIFIED
GAMES_INVENTORIED=8
ADVANCED_LEVELS_INVENTORIED=24
PLATFORMER_ROOT_CAUSE=CLASS_D BASELINE_PLANNER_WINDOW_HYSTERESIS (confirmed=true): no candidate clears GAP@133 within the 45-tick window from x≈107 because the takeoff must be past the elevated platform; non-clearing BACK plan scores as safe; window exit flips to clear-path; oscillation x 104.75-108.75 until TIMEOUT
PLATFORMER_REFERENCE_WIN=WIN@t169 (scripted public-action witness d=1.5 h=8, replay-verified=true)
PLATFORMER_STRONG_WINS=v1 STRONG 0/12 (v33 seeds) + 0/12 (fresh); STRONG_V33_1 12/12 (v33 seeds) + 12/12 (fresh); Expert v1 12+12 vs V33_1 12+12; Extreme v1 12+12 vs V33_1 12+12
PLATFORMER_STRONG_TIMEOUTS=v1 12/12 + 12/12; STRONG_V33_1 0/12 + 0/12 (Advanced)
SHARED_RUNTIME_DEFECTS=NONE_FOUND (sameSeedSameWorld 24/24; differentSeedDifferentWorld 24/24; packetFrozen 24/24; tickStartsAtZero 24/24; stepIsPure 24/24; tickIncrementsByOne 24/24; stalePacketRejected 24/24; illegalActionRejected 24/24; delayedSensorAgeTwo 24/24; missingSensorDropsObservationNotActions 24/24; terminalReached 24/24; terminalLegalEmpty 24/24; terminalStepRefused 24/24; timeoutExactlyAtLimit 24/24)
CONTROLLER_DEFECTS=2 confirmed bugs (platformer planner window hysteresis; rescue stale-packet dereference) + competence deficiencies (cards hidden-information planning; roguelike combat exposure; pong/racing headroom unknown) — deficiencies are not defects
PHYSICS_DEFECTS=NONE_FOUND (v33 physics validity PASS; audit action contract: 0 violations across 24 levels)
TERMINAL_DEFECTS=NONE_FOUND (396 episodes)
RENDERING_DEFECTS=NONE_FOUND in 52116 rendered frames (v33 for platformer/fighter; v32 for the other six; known: fighters overlap at contact, v32 platformer feet row — unchanged, documented)
GAMES_FIXED=platformer (planner candidate STRONG_V33_1), rescue (controller candidate STRONG_RESCUE_V33_1) — versioned candidates, mechanics unchanged
LEVELS_FIXED=PLATFORMER_ADVANCED_1 (candidate); RESCUE_ADVANCED_1-3 STALE robustness (candidate)
LEVELS_WORLD_VALID=24/24
LEVELS_SOLVABLE=15/24 (witness on every fresh seed); partial 6
LEVELS_REFERENCE_VALIDATED=21/24 (all witnesses replay-verified)
LEVELS_STRONG_VALIDATED=11/24 (STRONG succeeds on every fresh seed)
ILLEGAL_ACTION_COUNT=0 unoffered proposals in 531535 decisions (396 episodes)
REPLAY_FAILURE_COUNT=0/396
UNRESOLVED_DEFECTS=PONG_ADVANCED_1:no-witness;strong-0 PONG_ADVANCED_2:strong-0 PONG_ADVANCED_3:no-witness;strong-0 PLATFORMER_ADVANCED_1:strong-0 RACING_ADVANCED_3:no-witness;strong-0 CARDS_ADVANCED_1:strong-0 CARDS_ADVANCED_2:strong-0 CARDS_ADVANCED_3:strong-0 ROGUE_ADVANCED_2:strong-0 ROGUE_ADVANCED_3:strong-0
SOURCE_HASH=88b32b620c2cdd432cd3fc0667bbf5fe7bbfe5639787a2c1bddc8ea7904a3a88
REPAIR_MANIFEST=60e6920062d0c9d97fd935c5e13f9285e4b3c5bb773b0db19e156c367a811dbf
TEST_PASS=13
TEST_FAIL=0
V33_UNCHANGED=true
PROTECTED_FILES_UNCHANGED=true
AUTHORITY=R0
ASCII_RECOVERY_VERDICT=PARTIAL_RECOVERY: runtime integrity (load, actions, termination, replay, rendering) verified on all audited levels; two controller bugs repaired as versioned candidates; Pong/Racing win conditions unreached even with privileged drivers (benchmark design, authorization needed for any change); Cards/Roguelike failures are controller competence, preserved unresolved
```
