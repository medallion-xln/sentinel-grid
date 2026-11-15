# ASCII Worlds 2.1 — temporal robustness diagnostic

The v2 worlds/controllers/reports, Stage 3F/3G artifacts and prior Stage 3H frozen/draft conclusions are unchanged. New code is isolated in ascii-suite/v21. No new roadmap stage, learned world model, nine-expert competence claim, live authority or model promotion.

## Required output

```text
=== SENTINEL GRID ASCII WORLDS 2.1 PERFORMANCE RESULT ===
STATUS=DIAGNOSTIC_EVALUATION_COMPLETE_NO_CERTIFICATION_OR_PROMOTION

### INHERITANCE
STAGE3F_FREEZE=41748ff68ff16e6a137b53b72eb7203cb62aa0e761bf15c19f7a13b73d4b79a9
STAGE3G_FREEZE=686805d655e94e4ecc24a98d965a4e2f33ed8c51c69e746fc11e96022b64f2f5
FROZEN_PATHS_UNCHANGED=true
AUTHORITY=R0
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false
ONLINE_LEARNING_ENABLED=false
PROMOTED_TO_LIVE_RUNTIME=false

### TEMPORAL OBSERVATION
OBSERVATION_CONTRACT=SENTINEL_TEMPORAL_OBSERVATION_V1
STALE_FRAME_HANDLING=DEDUPLICATED; OUT_OF_ORDER_AND_CONFLICTS_REJECTED; MISSING_AND_PARTIAL_EXPLICIT
AGE_AWARE_ESTIMATION=BOUNDED_PUBLISHED_SEMANTICS_PROVISIONAL_NOT_AUTHORITATIVE
UNCERTAINTY_TRACKING=EXPLICIT_MODEL_ASSUMPTION_INTERVALS; NOT_ALL_INTERVALS_EMPIRICALLY_CALIBRATED
PRIVILEGE_LEAKAGE=NO_SIMULATOR_STATE_OR_PRIVATE_SEEDS_IN_CONTROLLER_INPUTS; EVALUATOR_TRUTH_ONLY

### PLATFORMER
NORMAL_COMPLETION_V2=0.9688
NORMAL_COMPLETION_V3=0.9688
DELAYED_COMPLETION_V2=0.0000
DELAYED_COMPLETION_V3=0.9688
FAILURE_MEMORY_VALUE=0.5000 [0.2500, 0.7500], seed n=16, CI=0.95; DELAY3_ABLATION_ONLY
REMAINING_FAILURES=SEE_EPISODE_FAILURE_TRACES; JITTER_MISSING_PARTIAL_AND_UNKNOWN_DYNAMICS_REPORTED_SEPARATELY

### PONG
FILTER_ONLY_BASELINE=V2_FROZEN; NORMAL_RETURN=1.0000
TEMPORAL_FILTER_RESULT=NORMAL_RETURN=0.9909; DELAY_RETURN=0.9618
SHOT_SELECTION_VALUE=0.2500 [-0.4375, 1.0625], seed n=16, CI=0.95; SHOT_SELECTION_PROMOTION=false
CALIBRATION=DELAY3_V3_MEAN_EPISODE_INTERCEPT_ABS_ERROR=6.6523; COVERAGE_1_SIGMA=0.7868; COVERAGE_2_SIGMA=0.9641; NOT_ACTION_CORRECTNESS_CONFIDENCE
DELAY_ROBUSTNESS=0.2249 [0.1818, 0.2739], seed n=32, CI=0.9875

### FIGHTER
EXISTING_WIN_RATE=1.0000; V2_OPPONENTS_D5_FRESH_SEEDS
STRONG_OPPONENT_WIN_RATE={"AGGRESSIVE_PRESSURE":0.625,"DEFENSIVE_TURTLE":0,"COUNTER_PUNISHER":0,"ANTI_AIR_SPECIALIST":0,"ADAPTIVE_MIXUP":0.6875,"MIRROR_V2":0}
EQUAL_LATENCY_WIN_RATE={"0":{"RULE":0,"V2":0.21875,"V3":0.21875},"1":{"RULE":0.041666666666666664,"V2":0.4270833333333333,"V3":0.19791666666666666},"3":{"RULE":0.041666666666666664,"V2":0.020833333333333332,"V3":0.20833333333333334},"5":{"RULE":0.0625,"V2":0,"V3":0.20833333333333334}}
OPPONENT_ADAPTATION=OBSERVED_HABIT_RESPONSE_LOGGED; NO_WEIGHT_UPDATES; PERFORMANCE_VALUE_NOT_ASSUMED
FALSE_ADVANTAGE_AUDIT=SAME_SENSOR_SCHEDULE_AND_SIMULTANEOUS_PHYSICS; SEE_STYLE_LATENCY_TABLE; REGRET_NOT_TESTABLE

### RACING
RULE_BASELINE=2.7188
SENTINEL_V2=2.3125
SENTINEL_V3=2.3125
PLACEMENT_ADVANTAGE=ROTATED_GRID_V3_VS_RULE=0.1875 [-0.0938, 0.4688], seed n=16, CI=0.95; REPLICATED_MPC_ADVANTAGE=false
GRID_POSITION_CONTROL=ALL_FOUR_ROTATED_SLOTS_PAIRED; CLUSTERED_BY_SEED; ABSOLUTE_AND_RELATIVE_START_REPORTED
CORNER_MEMORY_VALUE=-0.0417 [-0.1354, 0.0521], seed n=16, CI=0.95; CORNER_MEMORY_VALUE_MATERIAL=false
DELAY_ROBUSTNESS=PLACEMENT_GAIN_V3_VS_V2=0.9063 [0.4375, 1.4375], seed n=32, CI=0.9875

### COMPUTE
MEAN_LATENCY=MAIN_CONDITIONS_V3_MS: PLATFORMER=2.3533; PONG=0.0477; FIGHTER=0.2527; RACING=0.6193
P95_LATENCY=MEAN_EPISODE_P95_V3_MS: PLATFORMER=8.1485; PONG=0.0661; FIGHTER=0.9182; RACING=0.9042; NOT_POOLED_QUANTILES
SEARCH_BUDGET={"tickLimits":{"pong":5000,"platformer":1500,"fighter":900,"racing":4000},"estimatorMaxAge":12,"observedActionHistoryTicks":64,"platformer":"101 plans * up to 3 position hypotheses * 45 ticks; repeated-failure comparison up to 6 strategies, measured separately","fighter":"up to 35 options * 5 opponent hypotheses * 28 ticks; equal budget for mirror, styles","racing":"16 plans * 40 ticks + 20 HUD prediction ticks","pong":"18 unique sightings, one degree <=2 fit and intercept projection; no simulation lookahead","reactionTimeClaims":"Wall times diagnostic; no real-time guarantee or causal speedup claim; paired order alternates by seed to reduce drift"}
VALUE_PER_COMPUTE=DELAY3_V3_SHAPED_RETURN_PER_TOTAL_DECISION_MS: PLATFORMER=0.0155; PONG=0.5745; FIGHTER=0.0166; RACING=0.2426; NOT_SCIENTIFIC_DDV_OR_CROSS_WORLD_RANKING

### ABLATIONS
PER_COMPONENT_RESULTS=PAIRED_WITH_MINUS_WITHOUT_SUCCESS_RETURN_LATENCY_CATASTROPHE; SEE_FULL_TABLE_AND_JSON

### SCIENTIFIC RESULTS
SUPPORTED_HYPOTHESES=H-TEMPORAL-PLATFORMER; H-TEMPORAL-PONG; H-TEMPORAL-FIGHTER
UNSUPPORTED_HYPOTHESES=H-TEMPORAL-RACING; SHOT_SELECTION_MATERIALITY_NOT_ESTABLISHED; MPC_RULE_ADVANTAGE_NOT_ESTABLISHED; CORNER_MEMORY_MATERIALITY_NOT_ESTABLISHED
NOT_TESTABLE=true counterfactual regret; scientific DDV/FPE/CAD/CR/TCA; total memory allocation; structural OOD; canonical expert intelligence; grappling without existing mechanic
REPRESENTATION_BOTTLENECK=MISSING_OBSERVATION_AGE_CORRECTED_IN_TASK_INTERFACE; CANONICAL_EXPERT_BINDINGS_UNCHANGED
TEMPORAL_BOTTLENECK=PRIMARY_PAIRED_OUTCOME_TESTS_RECORDED; ESTIMATION_ALONE_NOT_COMPETENCE
POLICY_BOTTLENECK=STRATEGIC_SHOTS_AND_RACECRAFT_REQUIRE_EPISODE_GAIN_NOT_RATIONALE
OPPONENT_BOTTLENECK=STRONG_EQUAL_LATENCY_POLICIES_REQUALIFY_FIGHTER; NO_HUMAN_COMPETENCE_CLAIM

### ROADMAP
STAGE3H_COMPETENCE_CERTIFIED=false
WORLD_MODEL_WORK_NOW_JUSTIFIED=false
ROUTER_2_0_NOW_JUSTIFIED=false
EXPERT_10_NOW_JUSTIFIED=false

### CERTIFICATION STATUS
GAMEPLAY_TESTS=44_INHERITED_PLUS_17_TEMPORAL_HTTP_TESTS_PASS
DETERMINISTIC_REPLAY=4512/4512_EXACT_EPISODE_TRANSITION_REPLAYS
PREREGISTRATION_HASH=66d3fb3d299b788ee486e74eeac5d696a3a1588924971ef713505334695832df
SOURCE_HASH=6558b0f7d4a5a1e5965e8b7baa6599bc121246e877ae9335a15c058b3d7db902
HELDOUT_STATUS=FRESH_A_B_FAMILIES_COMPLETE_DIAGNOSTIC; RESERVED_141001_141032_UNTOUCHED; NO_TUNING_AFTER_OUTCOMES
STAGE3G_FREEZE_CHECK=EXACT_CANONICAL_CERTIFICATE_REPRODUCTION_PASS
```

## Reproduction and preregistration

Phase 0 reproduced 135 selected v2 episodes exactly, including inspected 81001-series normal and stale failures. Those seeds are not new confirmation. The complete v2 reports, registration, machine results and stored replay verification were read; fresh forensic action/observation traces are retained. 44 inherited gameplay tests and six Stage 3G boundary tests passed; Stage 3G's canonical certificate reproduced exactly. The previously pending Stage 3F read-only reproduction passed with 20 tests and zero tracked write attempts. Prior Stage 3H results were not revised.

Development failures in dev1/dev2 are retained, including software errors and partial results. dev3 (four-seed pilot), dev4 (eight-seed comparison) and dev5 (final eight-seed comparison including wider unknown-wind bounds and partial-field provenance repair) are diagnostic tuning records. None is held-out confirmation. The registered source/plan/seeds/thresholds were frozen before A/B access. Main comparisons use 32 seed units, two families of 16; strong opponents, grids, ablations and bounded shifts use 16 independent seed units, explicitly exploratory. Initial fighter spacing/side varies by seed so mirror rounds are not fake independent copies of one deterministic fixture.

One initial held-out attempt was stopped after a source audit found asymmetric actuator feedback: the player estimator received the applied action but the opponent received the requested action even when it fell back to WAIT. Its source, registration and completed partial traces are retained in results/aborted-heldout-v1. Its outcomes were not inspected for tuning and no performance hypothesis was scored from it. Both initial families (121001/131001 series) were retired wholesale. The corrected software interface sends actual applied actions to both estimators; this replacement registration uses entirely fresh 151001/161001 families with unchanged acceptance/statistical criteria. This is an integrity repair, not a post-hoc performance threshold change.

All 4512/4512 evaluated episodes replay exactly at every transition. Replay alone verifies deterministic world execution, not controller competence or a new scientific certificate. Raw packets, estimates, legal requests, actions and outcomes are compressed JSON forensic traces. Four reserved future seed values from Stage 3H and the new 32-seed 141001-series reserve remain untouched by this program.

## Paired primary outcomes

98.75% paired seed-cluster percentile bootstrap intervals control four primary tests by Bonferroni. Individual family means must meet materiality. A zero-variance bootstrap is disclosed; marginal Wilson success intervals are in the JSON and do not establish universal certainty. Normal noninferiority and observed catastrophic/repeated-failure limits are separate gates. Safety rates and secondary tests are exploratory, not a general safety guarantee.

| World | Delay3 gain (positive better) | Normal difference, 95% CI | Frozen acceptance |
|---|---|---|---|
| platformer | 0.9688 [0.8750, 1.0000], seed n=32, CI=0.9875 | 0.0000 [0.0000, 0.0000], seed n=32, CI=0.95 | SUPPORTED_DIAGNOSTIC_POPULATION_ONLY |
| pong | 0.2249 [0.1818, 0.2739], seed n=32, CI=0.9875 | -0.0091 [-0.0178, -0.0023], seed n=32, CI=0.95 | SUPPORTED_DIAGNOSTIC_POPULATION_ONLY |
| fighter | 0.8438 [0.6563, 0.9688], seed n=32, CI=0.9875 | 0.0000 [0.0000, 0.0000], seed n=32, CI=0.95 | SUPPORTED_DIAGNOSTIC_POPULATION_ONLY |
| racing | 0.9063 [0.4375, 1.4375], seed n=32, CI=0.9875 | 0.0000 [0.0000, 0.0000], seed n=32, CI=0.95 | NOT_FULLY_SUPPORTED |

## Outcomes by observation condition

| World | Condition | Variant | Episodes | Success | Episode shaped return | Place | Return rate | Repeated failure | Censored |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| platformer | NORMAL | V2 | 32 | 0.9688 | 47.1034 | NOT_MEASURED | NOT_MEASURED | 0.0000 | 0 |
| platformer | NORMAL | V3 | 32 | 0.9688 | 47.1451 | NOT_MEASURED | NOT_MEASURED | 0.0000 | 0 |
| platformer | NORMAL | RULE | 32 | 0.0000 | -19.7150 | NOT_MEASURED | NOT_MEASURED | 0.8000 | 0 |
| platformer | DELAY3 | V2 | 32 | 0.0000 | -17.3403 | NOT_MEASURED | NOT_MEASURED | 0.7750 | 0 |
| platformer | DELAY3 | V3 | 32 | 0.9688 | 45.8897 | NOT_MEASURED | NOT_MEASURED | 0.0000 | 0 |
| platformer | DELAY3 | RULE | 32 | 0.0000 | -19.5650 | NOT_MEASURED | NOT_MEASURED | 0.8000 | 0 |
| platformer | JITTER | V2 | 32 | 0.0000 | -18.0649 | NOT_MEASURED | NOT_MEASURED | 0.7375 | 0 |
| platformer | JITTER | V3 | 32 | 0.9688 | 46.4869 | NOT_MEASURED | NOT_MEASURED | 0.0219 | 0 |
| platformer | JITTER | RULE | 32 | 0.0000 | -17.0888 | NOT_MEASURED | NOT_MEASURED | 0.7800 | 0 |
| platformer | STALE_REPEAT | V2 | 16 | 0.0000 | -16.8663 | NOT_MEASURED | NOT_MEASURED | 0.7750 | 0 |
| platformer | STALE_REPEAT | V3 | 16 | 0.8750 | 43.1494 | NOT_MEASURED | NOT_MEASURED | 0.0458 | 0 |
| platformer | MISSING | V2 | 16 | 0.3750 | 16.3666 | NOT_MEASURED | NOT_MEASURED | 0.2689 | 0 |
| platformer | MISSING | V3 | 16 | 0.9375 | 44.2118 | NOT_MEASURED | NOT_MEASURED | 0.2125 | 0 |
| platformer | PARTIAL | V2 | 16 | 0.0000 | -7.0902 | NOT_MEASURED | NOT_MEASURED | 0.4250 | 0 |
| platformer | PARTIAL | V3 | 16 | 1.0000 | 48.0149 | NOT_MEASURED | NOT_MEASURED | 0.0000 | 0 |
| pong | NORMAL | V2 | 32 | 1.0000 | 70.4094 | NOT_MEASURED | 1.0000 | NOT_MEASURED | 0 |
| pong | NORMAL | V3 | 32 | 1.0000 | 70.0216 | NOT_MEASURED | 0.9909 | 0.0667 | 0 |
| pong | NORMAL | RULE | 32 | 0.1250 | -7.7856 | NOT_MEASURED | 0.5119 | 0.3783 | 0 |
| pong | DELAY3 | V2 | 32 | 0.4375 | 17.0906 | NOT_MEASURED | 0.7369 | 0.3331 | 0 |
| pong | DELAY3 | V3 | 32 | 0.9688 | 68.8119 | NOT_MEASURED | 0.9618 | 0.0429 | 0 |
| pong | DELAY3 | RULE | 32 | 0.0625 | -14.8269 | NOT_MEASURED | 0.5079 | 0.4006 | 0 |
| pong | JITTER | V2 | 32 | 0.8125 | 43.5294 | NOT_MEASURED | 0.8484 | 0.2460 | 0 |
| pong | JITTER | V3 | 32 | 1.0000 | 66.2059 | NOT_MEASURED | 0.9629 | 0.1179 | 0 |
| pong | JITTER | RULE | 32 | 0.5313 | 21.5941 | NOT_MEASURED | 0.7734 | 0.2475 | 0 |
| pong | STALE_REPEAT | V2 | 16 | 0.3750 | 15.8462 | NOT_MEASURED | 0.7216 | 0.3271 | 0 |
| pong | STALE_REPEAT | V3 | 16 | 1.0000 | 69.2156 | NOT_MEASURED | 0.9542 | 0.0667 | 0 |
| pong | MISSING | V2 | 16 | 1.0000 | 56.5394 | NOT_MEASURED | 0.9080 | 0.0976 | 0 |
| pong | MISSING | V3 | 16 | 1.0000 | 63.5144 | NOT_MEASURED | 0.9510 | 0.1481 | 0 |
| pong | PARTIAL | V2 | 16 | 0.0000 | -28.7456 | NOT_MEASURED | 0.2388 | 0.4286 | 0 |
| pong | PARTIAL | V3 | 16 | 0.9375 | 72.0106 | NOT_MEASURED | 0.9618 | 0.1437 | 0 |
| fighter | NORMAL | V2 | 32 | 1.0000 | 5.1486 | NOT_MEASURED | NOT_MEASURED | 0.0000 | 0 |
| fighter | NORMAL | V3 | 32 | 1.0000 | 5.1486 | NOT_MEASURED | NOT_MEASURED | 0.0000 | 0 |
| fighter | NORMAL | RULE | 32 | 0.6250 | -1.3484 | NOT_MEASURED | NOT_MEASURED | 0.4491 | 0 |
| fighter | DELAY3 | V2 | 32 | 0.0938 | -8.0302 | NOT_MEASURED | NOT_MEASURED | 0.3481 | 0 |
| fighter | DELAY3 | V3 | 32 | 0.9375 | 1.2241 | NOT_MEASURED | NOT_MEASURED | 0.0965 | 0 |
| fighter | DELAY3 | RULE | 32 | 1.0000 | 5.2105 | NOT_MEASURED | NOT_MEASURED | 0.0396 | 0 |
| fighter | JITTER | V2 | 32 | 0.4063 | -2.5308 | NOT_MEASURED | NOT_MEASURED | 0.1781 | 0 |
| fighter | JITTER | V3 | 32 | 1.0000 | 4.8844 | NOT_MEASURED | NOT_MEASURED | 0.0046 | 0 |
| fighter | JITTER | RULE | 32 | 0.7813 | -0.2844 | NOT_MEASURED | NOT_MEASURED | 0.3361 | 0 |
| fighter | STALE_REPEAT | V2 | 16 | 0.0000 | -8.2991 | NOT_MEASURED | NOT_MEASURED | 0.3461 | 0 |
| fighter | STALE_REPEAT | V3 | 16 | 1.0000 | 0.8016 | NOT_MEASURED | NOT_MEASURED | 0.1095 | 0 |
| fighter | MISSING | V2 | 16 | 1.0000 | 1.9497 | NOT_MEASURED | NOT_MEASURED | 0.0502 | 0 |
| fighter | MISSING | V3 | 16 | 1.0000 | 4.7178 | NOT_MEASURED | NOT_MEASURED | 0.0000 | 0 |
| fighter | PARTIAL | V2 | 16 | 1.0000 | 4.4197 | NOT_MEASURED | NOT_MEASURED | 0.0000 | 0 |
| fighter | PARTIAL | V3 | 16 | 1.0000 | 4.9088 | NOT_MEASURED | NOT_MEASURED | 0.0000 | 0 |
| racing | NORMAL | V2 | 32 | 0.2813 | 334.0669 | 2.3125 | NOT_MEASURED | 0.0000 | 0 |
| racing | NORMAL | V3 | 32 | 0.2813 | 334.0669 | 2.3125 | NOT_MEASURED | 0.0000 | 0 |
| racing | NORMAL | RULE | 32 | 0.1563 | 333.9794 | 2.7188 | NOT_MEASURED | 0.0000 | 0 |
| racing | DELAY3 | V2 | 32 | 0.0000 | 224.5496 | 4.0000 | NOT_MEASURED | 0.1743 | 0 |
| racing | DELAY3 | V3 | 32 | 0.1563 | 301.9444 | 3.0938 | NOT_MEASURED | 0.5750 | 0 |
| racing | DELAY3 | RULE | 32 | 0.0000 | 151.7365 | 4.0000 | NOT_MEASURED | 0.4944 | 0 |
| racing | JITTER | V2 | 32 | 0.0000 | 191.2651 | 4.0000 | NOT_MEASURED | 0.1176 | 0 |
| racing | JITTER | V3 | 32 | 0.2188 | 330.9832 | 2.6250 | NOT_MEASURED | 0.0000 | 0 |
| racing | JITTER | RULE | 32 | 0.0000 | -381.7421 | 4.0000 | NOT_MEASURED | 0.1489 | 0 |
| racing | STALE_REPEAT | V2 | 16 | 0.0000 | 85.2697 | 4.0000 | NOT_MEASURED | 0.3582 | 0 |
| racing | STALE_REPEAT | V3 | 16 | 0.1875 | 296.3160 | 3.1250 | NOT_MEASURED | 0.5440 | 0 |
| racing | MISSING | V2 | 16 | 0.0000 | 297.6785 | 4.0000 | NOT_MEASURED | 0.0967 | 0 |
| racing | MISSING | V3 | 16 | 0.3125 | 329.9030 | 2.1875 | NOT_MEASURED | NOT_MEASURED | 0 |
| racing | PARTIAL | V2 | 16 | 0.0625 | 328.1765 | 3.5625 | NOT_MEASURED | 0.0000 | 0 |
| racing | PARTIAL | V3 | 16 | 0.3125 | 329.0620 | 2.3750 | NOT_MEASURED | NOT_MEASURED | 0 |

Pong normal-band paired return-rate differences (V3 minus filter-only V2), all included in the noninferiority gate:

Band 1: 0.0000 [0.0000, 0.0000], seed n=32, CI=0.95

Band 2: 0.0000 [0.0000, 0.0000], seed n=32, CI=0.95

Band 3: 0.0000 [0.0000, 0.0000], seed n=32, CI=0.95

Band 4: -0.0110 [-0.0177, -0.0048], seed n=32, CI=0.95

Reward/success/trajectory/estimate accuracy are kept separate. REGRET_ONE_STEP_PROXY is explicitly not true counterfactual regret; no new proxy is optimized. True opponent-adjusted regret and inherited FPE/CAD/CR/DDV/TCA remain NOT_TESTABLE without an eligible target. Fighter damage efficiency, contacts, attack mix, whiffs, spacing-derived actions, landing/anti-air/cross-up events and response to repeated tactics are in per-episode metrics/frames; those are tactical diagnostics, not counterfactual competence.

## Equal-information fighter requalification

Both sides receive the same whole-body observation delay schedule, public move information and simultaneous unchanged fightTick mechanics. They do not see each other's policy labels, seeds, reaction buffers or future decisions. Opponent policy styles use the same bounded planner plus explicitly logged, observation-only overrides. Existing grappling does not exist, so that label is NOT_APPLICABLE. No new mechanics were invented.

| Adversary | Equal latency | Rule win | V2 win | V3 win | V3 damage efficiency |
|---|---:|---:|---:|---:|---:|
| AGGRESSIVE_PRESSURE | 0 | 0.0000 | 0.6250 | 0.6250 | 0.5112 |
| AGGRESSIVE_PRESSURE | 1 | 0.0000 | 0.5625 | 0.4375 | 0.4842 |
| AGGRESSIVE_PRESSURE | 3 | 0.0000 | 0.0000 | 0.3125 | 0.4686 |
| AGGRESSIVE_PRESSURE | 5 | 0.0000 | 0.0000 | 0.2500 | 0.4828 |
| DEFENSIVE_TURTLE | 0 | 0.0000 | 0.0000 | 0.0000 | 0.5000 |
| DEFENSIVE_TURTLE | 1 | 0.2500 | 0.5000 | 0.0000 | 0.5000 |
| DEFENSIVE_TURTLE | 3 | 0.2500 | 0.0000 | 0.0000 | 0.5000 |
| DEFENSIVE_TURTLE | 5 | 0.0625 | 0.0000 | 0.0000 | 0.5000 |
| COUNTER_PUNISHER | 0 | 0.0000 | 0.0000 | 0.0000 | 0.5000 |
| COUNTER_PUNISHER | 1 | 0.0000 | 0.2500 | 0.0000 | 0.5000 |
| COUNTER_PUNISHER | 3 | 0.0000 | 0.0625 | 0.0000 | 0.5000 |
| COUNTER_PUNISHER | 5 | 0.0000 | 0.0000 | 0.0000 | 0.5000 |
| ANTI_AIR_SPECIALIST | 0 | 0.0000 | 0.0000 | 0.0000 | 0.5000 |
| ANTI_AIR_SPECIALIST | 1 | 0.0000 | 0.6250 | 0.0000 | 0.5000 |
| ANTI_AIR_SPECIALIST | 3 | 0.0000 | 0.0000 | 0.0000 | 0.5000 |
| ANTI_AIR_SPECIALIST | 5 | 0.0000 | 0.0000 | 0.0000 | 0.5000 |
| ADAPTIVE_MIXUP | 0 | 0.0000 | 0.6875 | 0.6875 | 0.5460 |
| ADAPTIVE_MIXUP | 1 | 0.0000 | 0.6250 | 0.0000 | 0.5000 |
| ADAPTIVE_MIXUP | 3 | 0.0000 | 0.0625 | 0.0000 | 0.5000 |
| ADAPTIVE_MIXUP | 5 | 0.0000 | 0.0000 | 0.0000 | 0.5000 |
| MIRROR_V2 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.5000 |
| MIRROR_V2 | 1 | 0.0000 | 0.0000 | 0.7500 | 0.5465 |
| MIRROR_V2 | 3 | 0.0000 | 0.0000 | 0.9375 | 0.6360 |
| MIRROR_V2 | 5 | 0.3125 | 0.0000 | 1.0000 | 0.8727 |

A perfect win rate against the legacy opponent is not the target. Different style/latency cells must remain visible; averaging easy encounters does not make the mirror/anti-air cases easy. Repeated jump-over choices and anti-air/deny-cross-up responses are logged. A response log is not by itself proof of adaptation value; opponent-model-off ablations test episode effects.

## Racing start-slot control

Road width stays 18 columns and all rivals use the original carStep. Every seed is paired across four starting slots; intervals cluster by seed. Start-place minus finish-place is positive when positions were gained. Passing success is measured as logged overtakes/contacts and final relative position, not an invented pass-attempt rate. Lap times, corner efficiency/grip utilization, slides and steering reversals remain in the episode JSON. Scenario grip changes are seeded evaluator fixtures, not changes made to help a candidate or forced off-track events.

| Start place | Condition | Variant | Finish place | Positions gained | Mean lap ticks | Contacts | Off-track ticks | Overtakes |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | NORMAL | RULE | 1.1875 | -0.1875 | 656.7500 | 2.1875 | 0.0000 | 0.0000 |
| 1 | NORMAL | V2 | 1.2500 | -0.2500 | 605.4167 | 1.2500 | 0.0000 | 0.2500 |
| 1 | NORMAL | V3 | 1.2500 | -0.2500 | 605.4167 | 1.2500 | 0.0000 | 0.2500 |
| 1 | DELAY3 | RULE | 4.0000 | -3.0000 | 1127.1458 | 9.1875 | 290.7500 | 0.0000 |
| 1 | DELAY3 | V2 | 4.0000 | -3.0000 | 1048.8333 | 2.8750 | 239.1250 | 0.0000 |
| 1 | DELAY3 | V3 | 2.4375 | -1.4375 | 640.6458 | 1.8750 | 50.6250 | 0.5000 |
| 2 | NORMAL | RULE | 2.2500 | -0.2500 | 659.0833 | 2.0625 | 1.0625 | 0.1250 |
| 2 | NORMAL | V2 | 2.1875 | -0.1875 | 647.8542 | 4.1875 | 0.0000 | 1.0625 |
| 2 | NORMAL | V3 | 2.1875 | -0.1875 | 647.8542 | 4.1875 | 0.0000 | 1.0625 |
| 2 | DELAY3 | RULE | 4.0000 | -2.0000 | 1136.1146 | 5.1250 | 344.3750 | 0.0000 |
| 2 | DELAY3 | V2 | 4.0000 | -2.0000 | 1056.0833 | 2.8750 | 263.8750 | 0.0000 |
| 2 | DELAY3 | V3 | 2.9375 | -0.9375 | 656.5417 | 3.3750 | 49.3125 | 0.7500 |
| 3 | NORMAL | RULE | 3.2500 | -0.2500 | 669.5208 | 4.5625 | 0.0000 | 0.2500 |
| 3 | NORMAL | V2 | 2.8750 | 0.1250 | 654.0833 | 4.1875 | 0.0000 | 1.5000 |
| 3 | NORMAL | V3 | 2.8750 | 0.1250 | 654.0833 | 4.1875 | 0.0000 | 1.5000 |
| 3 | DELAY3 | RULE | 4.0000 | -1.0000 | 1145.6979 | 2.7500 | 394.8750 | 0.0000 |
| 3 | DELAY3 | V2 | 4.0000 | -1.0000 | 1019.2708 | 0.7500 | 165.5000 | 0.0000 |
| 3 | DELAY3 | V3 | 3.8125 | -0.8125 | 668.1250 | 3.5000 | 54.3125 | 0.6875 |
| 4 | NORMAL | RULE | 3.6250 | 0.3750 | 672.3750 | 3.6250 | 0.0000 | 0.3750 |
| 4 | NORMAL | V2 | 3.2500 | 0.7500 | 661.8542 | 3.8125 | 0.3750 | 1.5000 |
| 4 | NORMAL | V3 | 3.2500 | 0.7500 | 661.8542 | 3.8125 | 0.3750 | 1.5000 |
| 4 | DELAY3 | RULE | 4.0000 | 0.0000 | 1160.4687 | 0.0000 | 404.8750 | 0.0000 |
| 4 | DELAY3 | V2 | 4.0000 | 0.0000 | 1086.2083 | 0.0000 | 300.8125 | 0.0000 |
| 4 | DELAY3 | V3 | 3.5625 | 0.4375 | 667.7500 | 2.3750 | 51.0000 | 1.2500 |

Rotated-grid V3 over rule placement benefit: 0.1875 [-0.0938, 0.4688], seed n=16, CI=0.95. Replicated material MPC advantage: false. Across declared grip shifts, corner-memory placement benefit: -0.0417 [-0.1354, 0.0521], seed n=16, CI=0.95; material: false. If false, the evidence does not justify retaining corner memory for performance; it remains an experimental ablation switch, not a promoted default advantage.

## Component attribution

WITH is V3; WITHOUT is the named row. Intervals use seed-level paired differences. More return does not establish more success, and a lower latency cannot excuse a higher catastrophic rate. Primitive age-only/uncertainty/action-history variants are included separately. Failure memory is applicable to platformer, corner memory to racing, opponent model to fighter, strategic shot selection to Pong, and racecraft selection to racing. Unimplemented/unapplicable mechanisms are not fabricated into ablations.

| World | WITHOUT component/variant | Delta success | Delta return | Delta mean latency ms | Delta catastrophic failure |
|---|---|---|---|---|---|
| platformer | RAW_LATEST_OBSERVATION | 1.0000 [1.0000, 1.0000], seed n=16, CI=0.95 | 63.6107 [60.7574, 66.2976], seed n=16, CI=0.95 | 1.3752 [1.0091, 1.7333], seed n=16, CI=0.95 | -1.0000 [-1.0000, -1.0000], seed n=16, CI=0.95 |
| platformer | AGE_AWARE_ESTIMATION | 1.0000 [1.0000, 1.0000], seed n=16, CI=0.95 | 59.3796 [56.1608, 62.5740], seed n=16, CI=0.95 | 1.5572 [1.2030, 1.9072], seed n=16, CI=0.95 | -1.0000 [-1.0000, -1.0000], seed n=16, CI=0.95 |
| platformer | AGE_AWARE_ESTIMATION_WITH_UNCERTAINTY | 1.0000 [1.0000, 1.0000], seed n=16, CI=0.95 | 59.5269 [56.1035, 62.8756], seed n=16, CI=0.95 | 0.6016 [0.2879, 0.9411], seed n=16, CI=0.95 | -1.0000 [-1.0000, -1.0000], seed n=16, CI=0.95 |
| platformer | AGE_AWARE_ESTIMATION_WITH_ACTION_HISTORY | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 | -0.2628 [-1.2383, 0.7160], seed n=16, CI=0.95 | 1.3751 [1.1203, 1.6336], seed n=16, CI=0.95 | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 |
| platformer | NO_UNCERTAINTY | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 | -0.2628 [-1.2383, 0.7160], seed n=16, CI=0.95 | 1.3483 [1.0867, 1.6156], seed n=16, CI=0.95 | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 |
| platformer | NO_ACTION_HISTORY | 1.0000 [1.0000, 1.0000], seed n=16, CI=0.95 | 59.5269 [56.1035, 62.8756], seed n=16, CI=0.95 | 0.5708 [0.2630, 0.9039], seed n=16, CI=0.95 | -1.0000 [-1.0000, -1.0000], seed n=16, CI=0.95 |
| platformer | NO_MEMORY | 0.5000 [0.2500, 0.7500], seed n=16, CI=0.95 | 22.7298 [10.3600, 35.5909], seed n=16, CI=0.95 | 0.1199 [-0.1393, 0.3296], seed n=16, CI=0.95 | -0.5000 [-0.7500, -0.2500], seed n=16, CI=0.95 |
| platformer | SHORT_HORIZON | 0.6875 [0.4375, 0.8750], seed n=16, CI=0.95 | 36.3166 [22.9789, 48.3362], seed n=16, CI=0.95 | -4.1087 [-7.7991, -1.1993], seed n=16, CI=0.95 | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 |
| pong | RAW_LATEST_OBSERVATION | 0.3750 [0.0625, 0.6875], seed n=16, CI=0.95 | 56.3419 [45.7019, 67.7306], seed n=16, CI=0.95 | 0.0001 [-0.0015, 0.0017], seed n=16, CI=0.95 | -0.4375 [-0.6875, -0.1875], seed n=16, CI=0.95 |
| pong | AGE_AWARE_ESTIMATION | 0.3750 [0.0625, 0.6875], seed n=16, CI=0.95 | 56.3419 [45.7019, 67.7306], seed n=16, CI=0.95 | 0.0014 [0.0001, 0.0026], seed n=16, CI=0.95 | -0.4375 [-0.6875, -0.1875], seed n=16, CI=0.95 |
| pong | AGE_AWARE_ESTIMATION_WITH_UNCERTAINTY | 0.6250 [0.3750, 0.8750], seed n=16, CI=0.95 | 61.0637 [49.2525, 73.5006], seed n=16, CI=0.95 | 0.0004 [-0.0011, 0.0019], seed n=16, CI=0.95 | -0.6875 [-0.8750, -0.4375], seed n=16, CI=0.95 |
| pong | AGE_AWARE_ESTIMATION_WITH_ACTION_HISTORY | -0.0625 [-0.1875, 0.0000], seed n=16, CI=0.95 | 13.0112 [7.1006, 19.0231], seed n=16, CI=0.95 | -0.0004 [-0.0028, 0.0018], seed n=16, CI=0.95 | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 |
| pong | NO_UNCERTAINTY | -0.0625 [-0.1875, 0.0000], seed n=16, CI=0.95 | 13.0112 [7.1006, 19.0231], seed n=16, CI=0.95 | 0.0003 [-0.0015, 0.0022], seed n=16, CI=0.95 | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 |
| pong | NO_ACTION_HISTORY | 0.6250 [0.3750, 0.8750], seed n=16, CI=0.95 | 61.0637 [49.2525, 73.5006], seed n=16, CI=0.95 | -0.0016 [-0.0060, 0.0014], seed n=16, CI=0.95 | -0.6875 [-0.8750, -0.4375], seed n=16, CI=0.95 |
| pong | SHOT_PLANNER | -0.0625 [-0.1875, 0.0000], seed n=16, CI=0.95 | 7.7050 [-1.3338, 17.7587], seed n=16, CI=0.95 | 0.0004 [-0.0015, 0.0020], seed n=16, CI=0.95 | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 |
| fighter | RAW_LATEST_OBSERVATION | 0.9375 [0.8125, 1.0000], seed n=16, CI=0.95 | 8.8213 [6.9872, 10.8441], seed n=16, CI=0.95 | -0.1310 [-0.1467, -0.1171], seed n=16, CI=0.95 | -0.9375 [-1.0000, -0.8125], seed n=16, CI=0.95 |
| fighter | AGE_AWARE_ESTIMATION | 0.0000 [-0.1875, 0.1875], seed n=16, CI=0.95 | -2.6462 [-4.6272, -0.5544], seed n=16, CI=0.95 | -0.1712 [-0.2318, -0.1327], seed n=16, CI=0.95 | 0.0000 [-0.1875, 0.1875], seed n=16, CI=0.95 |
| fighter | AGE_AWARE_ESTIMATION_WITH_UNCERTAINTY | -0.0625 [-0.1875, 0.0000], seed n=16, CI=0.95 | -2.3275 [-3.7837, -1.0178], seed n=16, CI=0.95 | -0.1413 [-0.1551, -0.1270], seed n=16, CI=0.95 | 0.0625 [0.0000, 0.1875], seed n=16, CI=0.95 |
| fighter | AGE_AWARE_ESTIMATION_WITH_ACTION_HISTORY | 0.0000 [-0.1875, 0.1875], seed n=16, CI=0.95 | -2.4462 [-5.0931, 0.2572], seed n=16, CI=0.95 | -0.0009 [-0.0152, 0.0174], seed n=16, CI=0.95 | 0.0000 [-0.1875, 0.1875], seed n=16, CI=0.95 |
| fighter | NO_UNCERTAINTY | 0.0000 [-0.1875, 0.1875], seed n=16, CI=0.95 | -2.4462 [-5.0931, 0.2572], seed n=16, CI=0.95 | -0.0048 [-0.0247, 0.0161], seed n=16, CI=0.95 | 0.0000 [-0.1875, 0.1875], seed n=16, CI=0.95 |
| fighter | NO_ACTION_HISTORY | -0.0625 [-0.1875, 0.0000], seed n=16, CI=0.95 | -2.3275 [-3.7837, -1.0178], seed n=16, CI=0.95 | -0.1395 [-0.1525, -0.1266], seed n=16, CI=0.95 | 0.0625 [0.0000, 0.1875], seed n=16, CI=0.95 |
| fighter | NO_OPPONENT_MODEL | -0.0625 [-0.1875, 0.0000], seed n=16, CI=0.95 | -0.9941 [-2.2872, 0.0000], seed n=16, CI=0.95 | -0.0616 [-0.0697, -0.0540], seed n=16, CI=0.95 | 0.0625 [0.0000, 0.1875], seed n=16, CI=0.95 |
| fighter | SHORT_HORIZON | -0.0625 [-0.1875, 0.0000], seed n=16, CI=0.95 | -3.4053 [-5.8178, -0.9000], seed n=16, CI=0.95 | 0.0603 [0.0483, 0.0739], seed n=16, CI=0.95 | 0.0625 [0.0000, 0.1875], seed n=16, CI=0.95 |
| racing | RAW_LATEST_OBSERVATION | 0.1875 [0.0000, 0.3750], seed n=16, CI=0.95 | 124.2597 [72.5208, 181.1427], seed n=16, CI=0.95 | 0.0433 [0.0240, 0.0637], seed n=16, CI=0.95 | 0.0625 [-0.1875, 0.3125], seed n=16, CI=0.95 |
| racing | AGE_AWARE_ESTIMATION | 0.1875 [0.0000, 0.3750], seed n=16, CI=0.95 | 280.8812 [237.1102, 317.1231], seed n=16, CI=0.95 | 0.0743 [0.0603, 0.0895], seed n=16, CI=0.95 | 0.8750 [0.6875, 1.0000], seed n=16, CI=0.95 |
| racing | AGE_AWARE_ESTIMATION_WITH_UNCERTAINTY | 0.1875 [0.0000, 0.3750], seed n=16, CI=0.95 | 280.8812 [237.1102, 317.1231], seed n=16, CI=0.95 | 0.0614 [0.0425, 0.0812], seed n=16, CI=0.95 | 0.8750 [0.6875, 1.0000], seed n=16, CI=0.95 |
| racing | AGE_AWARE_ESTIMATION_WITH_ACTION_HISTORY | 0.0625 [-0.1250, 0.2500], seed n=16, CI=0.95 | 1.3639 [-5.0788, 7.8420], seed n=16, CI=0.95 | -0.0027 [-0.0256, 0.0199], seed n=16, CI=0.95 | 0.0625 [0.0000, 0.1875], seed n=16, CI=0.95 |
| racing | NO_UNCERTAINTY | 0.0625 [-0.1250, 0.2500], seed n=16, CI=0.95 | 1.3639 [-5.0788, 7.8420], seed n=16, CI=0.95 | 0.0145 [-0.0064, 0.0364], seed n=16, CI=0.95 | 0.0625 [0.0000, 0.1875], seed n=16, CI=0.95 |
| racing | NO_ACTION_HISTORY | 0.1875 [0.0000, 0.3750], seed n=16, CI=0.95 | 280.8812 [237.1102, 317.1231], seed n=16, CI=0.95 | 0.0743 [0.0562, 0.0930], seed n=16, CI=0.95 | 0.8750 [0.6875, 1.0000], seed n=16, CI=0.95 |
| racing | NO_MEMORY | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 | 3.8369 [-0.6964, 8.4106], seed n=16, CI=0.95 | 0.0095 [-0.0229, 0.0354], seed n=16, CI=0.95 | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 |
| racing | SHORT_HORIZON | 0.0000 [-0.1875, 0.1875], seed n=16, CI=0.95 | 9.6332 [2.3059, 17.7371], seed n=16, CI=0.95 | 0.1914 [0.1802, 0.2028], seed n=16, CI=0.95 | 0.0625 [0.0000, 0.1875], seed n=16, CI=0.95 |
| racing | NO_STRATEGIC_ACTION | 0.1250 [0.0000, 0.3125], seed n=16, CI=0.95 | 10.3367 [2.1896, 18.8844], seed n=16, CI=0.95 | 0.3937 [0.3820, 0.4071], seed n=16, CI=0.95 | 0.0000 [0.0000, 0.0000], seed n=16, CI=0.95 |

Shot planner versus temporal filter-only score difference: 0.2500 [-0.4375, 1.0625], seed n=16, CI=0.95; return-rate difference: -0.0019 [-0.0207, 0.0169], seed n=16, CI=0.95. SHOT_SELECTION_PROMOTION=false. Even a positive exploratory result would not promote a model to live runtime; the default filter-only source was frozen before these results.

## Compute audit

Table percentiles are means of episode percentiles, not pooled quantiles. Each episode stores p50/p95/p99, maximum latency, mean/max branches, V3 instrumented planner rollouts/steps, estimator time, control-loop time and wall runtime. V2 simulation counts remain published-budget bounds, not falsely instrumented counts. Racing's HUD projection is counted (20 ticks upper bound, may stop early); estimator branch computations are not part of planner counts. Heap change can be negative after GC and is not total allocation. JIT, tracing, serialization, replay and other local activity affect wall time; no production reaction-time certificate or causal speedup claim.

| World | Variant | Mean ms | Mean episode p50 | Mean episode p95 | Mean episode p99 | Mean/max branches | Mean instrumented rollouts | Estimator ms | Loop ms | Episode wall ms | Net heap bytes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| platformer | V2 | 0.9878 | 0.6611 | 3.1571 | 6.7561 | 57.2733 / 101 | NOT_MEASURED | 0.0464 | 1.1707 | 344.5970 | -167111.5000 |
| platformer | V3 | 2.3533 | 1.0721 | 8.1485 | 12.2792 | 93.6056 / 303 | 37877.4792 | 0.0548 | 2.5466 | 1511.1925 | 1344875.5000 |
| platformer | RULE | 0.0571 | 0.0541 | 0.0744 | 0.2016 | 1.0000 / 1 | NOT_MEASURED | 0.0409 | 0.2131 | 25.4565 | -2774462.3333 |
| pong | V2 | 0.0457 | 0.0402 | 0.0622 | 0.1126 | 0.4501 / 1 | NOT_MEASURED | 0.0225 | 0.1191 | 256.9255 | -3322113.0000 |
| pong | V3 | 0.0477 | 0.0414 | 0.0661 | 0.1345 | 0.4283 / 1 | 0.0000 | 0.0237 | 0.1231 | 277.8553 | -6827133.3333 |
| pong | RULE | 0.0306 | 0.0281 | 0.0359 | 0.0718 | 0.9947 / 1 | NOT_MEASURED | 0.0226 | 0.1025 | 142.8383 | -2796774.9167 |
| fighter | V2 | 0.3109 | 0.1096 | 1.0127 | 1.7717 | 31.6454 / 175 | NOT_MEASURED | 0.0238 | 0.4472 | 164.2829 | -953257.0833 |
| fighter | V3 | 0.2527 | 0.0419 | 0.9182 | 1.7107 | 24.4940 / 175 | 6823.5417 | 0.0250 | 0.3828 | 107.2167 | 297400.5833 |
| fighter | RULE | 0.0304 | 0.0294 | 0.0364 | 0.0526 | 1.0000 / 1 | NOT_MEASURED | 0.0231 | 0.1551 | 78.9720 | 1460200.5000 |
| racing | V2 | 0.5847 | 0.5275 | 0.8557 | 1.3265 | 16.0000 / 16 | NOT_MEASURED | 0.0437 | 0.7501 | 2029.2411 | -3986567.7500 |
| racing | V3 | 0.6193 | 0.5603 | 0.9042 | 1.4414 | 16.0000 / 16 | 33464.1458 | 0.0505 | 0.7900 | 1556.9674 | -8396542.7500 |
| racing | RULE | 0.0570 | 0.0524 | 0.0715 | 0.1418 | 1.0000 / 1 | NOT_MEASURED | 0.0413 | 0.2075 | 610.0447 | -9922930.0000 |

EPISODE_DECISION_VALUE here means declared within-world diagnostic episode return, not inherited scientific DDV. Per-decision-compute value and per-mean-latency value are descriptive ratios, not cross-world quantities:

platformer: V3 return/total decision ms=0.0155, V2=-0.1162; V3 return/mean latency=12.4966, V2=-20.6779.

pong: V3 return/total decision ms=0.5745, V2=0.1826; V3 return/mean latency=1357.2111, V2=364.6053.

fighter: V3 return/total decision ms=0.0166, V2=-0.0552; V3 return/mean latency=5.2931, V2=-21.6990.

racing: V3 return/total decision ms=0.2426, V2=0.1260; V3 return/mean latency=484.2117, V2=392.8923.

## Bounded shifts, not structural OOD

Fresh seeds exercise unseen layouts/tracks from the same generator. Declared wind/patrol/grip variants are controlled parameter/behavior shifts. They are separate from main fresh-seed replication. Structural OOD and learned-policy adaptation were not run and are not claimed.

| World | Scenario | Condition | Variant | Episodes | Success | Place | Return |
|---|---|---|---|---:|---:|---:|---:|
| platformer | WIND_SHIFT | NORMAL | V2 | 16 | 0.4375 | NOT_MEASURED | 19.8574 |
| platformer | WIND_SHIFT | NORMAL | V3 | 16 | 0.4375 | NOT_MEASURED | 19.8527 |
| platformer | WIND_SHIFT | NORMAL | NO_MEMORY | 16 | 0.4375 | NOT_MEASURED | 20.4383 |
| platformer | WIND_SHIFT | DELAY3 | V2 | 16 | 0.0000 | NOT_MEASURED | -16.4655 |
| platformer | WIND_SHIFT | DELAY3 | V3 | 16 | 0.3750 | NOT_MEASURED | 17.9867 |
| platformer | WIND_SHIFT | DELAY3 | NO_MEMORY | 16 | 0.4375 | NOT_MEASURED | 20.1976 |
| platformer | FAST_PATROL | NORMAL | V2 | 16 | 1.0000 | NOT_MEASURED | 48.4346 |
| platformer | FAST_PATROL | NORMAL | V3 | 16 | 1.0000 | NOT_MEASURED | 48.4361 |
| platformer | FAST_PATROL | NORMAL | NO_MEMORY | 16 | 1.0000 | NOT_MEASURED | 48.4769 |
| platformer | FAST_PATROL | DELAY3 | V2 | 16 | 0.0000 | NOT_MEASURED | -16.5780 |
| platformer | FAST_PATROL | DELAY3 | V3 | 16 | 0.9375 | NOT_MEASURED | 46.8506 |
| platformer | FAST_PATROL | DELAY3 | NO_MEMORY | 16 | 0.5000 | NOT_MEASURED | 24.3096 |
| pong | ADAPTIVE_PONG | NORMAL | V2 | 16 | 1.0000 | NOT_MEASURED | 65.8075 |
| pong | ADAPTIVE_PONG | NORMAL | V3 | 16 | 1.0000 | NOT_MEASURED | 65.8075 |
| pong | ADAPTIVE_PONG | NORMAL | NO_MEMORY | 16 | 1.0000 | NOT_MEASURED | 65.8075 |
| pong | ADAPTIVE_PONG | DELAY3 | V2 | 16 | 0.8125 | NOT_MEASURED | 29.1156 |
| pong | ADAPTIVE_PONG | DELAY3 | V3 | 16 | 1.0000 | NOT_MEASURED | 74.9312 |
| pong | ADAPTIVE_PONG | DELAY3 | NO_MEMORY | 16 | 1.0000 | NOT_MEASURED | 74.9312 |
| racing | WET_GRIP_LOW | NORMAL | V2 | 16 | 0.5000 | 1.8750 | 328.4647 |
| racing | WET_GRIP_LOW | NORMAL | V3 | 16 | 0.5000 | 1.8750 | 328.4647 |
| racing | WET_GRIP_LOW | NORMAL | NO_MEMORY | 16 | 0.5625 | 1.8750 | 328.4017 |
| racing | WET_GRIP_LOW | DELAY3 | V2 | 16 | 0.0000 | 4.0000 | 185.8920 |
| racing | WET_GRIP_LOW | DELAY3 | V3 | 16 | 0.1875 | 2.6875 | 277.1875 |
| racing | WET_GRIP_LOW | DELAY3 | NO_MEMORY | 16 | 0.1875 | 2.6250 | 277.1011 |
| racing | WET_GRIP_HIGH | NORMAL | V2 | 16 | 0.4375 | 1.9375 | 329.5930 |
| racing | WET_GRIP_HIGH | NORMAL | V3 | 16 | 0.4375 | 1.9375 | 329.5930 |
| racing | WET_GRIP_HIGH | NORMAL | NO_MEMORY | 16 | 0.4375 | 1.9375 | 329.5930 |
| racing | WET_GRIP_HIGH | DELAY3 | V2 | 16 | 0.0000 | 4.0000 | 167.9434 |
| racing | WET_GRIP_HIGH | DELAY3 | V3 | 16 | 0.3125 | 1.9375 | 323.3997 |
| racing | WET_GRIP_HIGH | DELAY3 | NO_MEMORY | 16 | 0.3750 | 1.8125 | 324.3348 |
| racing | SEEDED_GRIP_CHANGE | NORMAL | V2 | 16 | 0.4375 | 2.1250 | 328.6106 |
| racing | SEEDED_GRIP_CHANGE | NORMAL | V3 | 16 | 0.4375 | 2.1250 | 328.6106 |
| racing | SEEDED_GRIP_CHANGE | NORMAL | NO_MEMORY | 16 | 0.4375 | 2.0625 | 328.6257 |
| racing | SEEDED_GRIP_CHANGE | DELAY3 | V2 | 16 | 0.0000 | 4.0000 | 224.0369 |
| racing | SEEDED_GRIP_CHANGE | DELAY3 | V3 | 16 | 0.2500 | 2.7500 | 288.3678 |
| racing | SEEDED_GRIP_CHANGE | DELAY3 | NO_MEMORY | 16 | 0.2500 | 2.7500 | 287.4314 |

## Ten closing answers

1. Yes, in this diagnostic population: platformer, Pong and legacy-fighter delay hypotheses met all frozen gates. Racing improved placement but failed its repeated-failure regression gate. No universal reliability or general-intelligence claim follows.
2. Side scroller has the largest direct episode-completion improvement: 0/32 to 31/32 under three-tick delay, with normal completion unchanged at 31/32. Different worlds' shaped rewards are not a common ranking scale.
3. Timestamp-aware estimation and executed-action history improved the control interface. Platformer also benefits from explicit failure memory (+50 percentage points completion) and its longer horizon (+68.75 points versus the short-horizon variant). Extra uncertainty planning did not improve platformer completion. These are deterministic estimation/replanning and explicit within-episode updates, not learned-policy adaptation.
4. No. Shot selection's score benefit was +0.25, 95% CI [-0.4375, 1.0625], with no replicated material improvement and no demonstrated return-rate noninferiority at its frozen limit. SHOT_SELECTION_PROMOTION=false; filter-only stays the default.
5. Sometimes, not reliably across styles. V3 wins 21.875% averaged across the six strong styles at zero equal latency and 20.833% at three or five ticks. At zero latency it beats pressure/mixup encounters but wins none against turtle, counter, anti-air or mirror in this subset. At one tick it regresses against V2 (19.792% versus 42.708%). This is a policy limitation, not proof of general adversarial competence.
6. Not at the frozen replicated materiality criterion. Rotated-grid V3 over rule placement benefit is +0.1875, 95% CI [-0.09375, 0.46875], with family A only +0.03125. Delay placement improves from 4.0 to 3.09375, but repeated off-track failure increases and vetoes the overall temporal-racing hypothesis. No MPC promotion or blanket racing advantage is justified.
7. Platformer failure memory provides measurable value: +0.50 completion, 95% CI [0.25, 0.75], in the 16-seed delayed ablation. Racing corner memory does not: placement benefit -0.0417, CI [-0.1354, 0.0521] across the grip-shift subset. The wind-shift platformer subset also does not show a memory benefit; the memory claim is bounded, not universal. Explicit memory is not online learning.
8. Platformer uncertainty planning adds about 1.35 ms per decision with no extra completion versus NO_UNCERTAINTY. Racing corner memory has no established placement advantage; racing's longer horizon adds about 0.19 ms without demonstrated success gain. Fighter's longer horizon adds about 0.06 ms while its shaped return decreases on the legacy-opponent ablation. Fighter opponent modeling has no demonstrated benefit there, although its measured mean latency is lower, not higher. Pong shots remain unproven. These small secondary subsets do not authorize post-hoc retuning or default promotion.
9. No. Published-semantics deterministic estimation addressed timing; these results do not qualify learned world-model work, Router 2.0 or Expert 10.
10. Future Stage 3H inputs are the timing/provenance contract, retained failures, equal-latency opponents and paired-grid diagnostics. Remaining limits include expert-interface bindings, fighter policy weakness/one-tick regression, racing repeated off-track failures, uncertain interval validity, weak wind-shift completion, structural OOD, true counterfactual regret and total allocation measurement. Stage 3H scientific conclusions were not edited and no next stage was begun.

## Presentation audit and measurement limits

This section describes already stored outcomes and measurements; it does not change frozen source, hypotheses, statistical procedures, thresholds or selection. The required block's numeric calibration/compute fields and the plain closing answers were expanded after the unchanged frozen report generator ran.

Racing's temporal gain replicated in both families and normal results were noninferior, but its paired repeated-failure rate increased by 0.4137, 95% CI [0.2923, 0.5250], in 28 pairs with finite rates. This exceeds the registered +0.05 regression limit. Its catastrophic indicator (any barrier hit) changed by +0.03125; that is not the gate responsible for rejection. Rate denominators depend on exposure to corners/laps, so these are declared diagnostic rates, not a general causal safety certificate. The failed gate remains failed.

Across the entire matrix there are 114 TIMEOUT outcomes, including 77 racing timeouts. None of those racing timeouts is marked as a win. TIMEOUT is an actual simulator terminal result at its existing tick limit; the report's Censored column separately counts early evaluator-budget truncation, of which there are none. Placement in rows containing TIMEOUT means terminal standing, not a completed finishing position. Main NORMAL races and V2/V3 DELAY3 races all finish; main JITTER includes three V2 timeouts, and the rule racer has four DELAY3 and fifteen JITTER timeouts. Do not infer completed lap times for unfinished laps or classify timeout positions as race wins.

Pong goal-crossing calibration averages each episode's long-lead predictions (8 < lead < 40) before the 32-seed condition mean. Multiple predictions within a flight are correlated; prediction counts are not independent sample sizes. No Gaussian calibration target or action-correctness probability is established.

| Condition | Controller | Mean absolute intercept error | Mean 1-sigma coverage | Mean 2-sigma coverage | Stored predictions |
|---|---|---:|---:|---:|---:|
| NORMAL | V2 filter | 5.9293 | 0.7580 | 0.9574 | 20,362 |
| NORMAL | V3 temporal filter | 6.1049 | 0.7623 | 0.9563 | 20,810 |
| DELAY3 | V2 filter | 6.0344 | 0.7570 | 0.9578 | 20,126 |
| DELAY3 | V3 temporal filter | 6.6523 | 0.7868 | 0.9641 | 21,372 |

Thus better Pong returns do not imply better mean long-lead intercept accuracy. The sampled state-estimation errors concern platformer/fighter x, racing lateral offset n and Pong own-paddle y only, not complete state accuracy. DELAY3 means are respectively V2/V3 1.8276/0.1563, 1.7079/0.1730, 0.8990/0.0032 and 2.8279/0.0000. All truth comparisons are evaluator-only.

Racing cornerEfficiency is a speed-to-grip-limited-corner-speed ratio. It is not a fully calibrated grip-utilization measurement, and instantaneous HUD gripUsage is an observation-derived dry-grip estimate, not private wet-grip truth. Passing/contact logs do not establish a calibrated pass-attempt success rate. Fighter's stronger set is discriminating but is not independently qualified as competitively balanced or solvable across every style. The component-off fighter ablations use the legacy opponent, so their effects cannot be generalized to the stronger set without additional tests.

Simplest retained choices: keep Pong filter-only; treat racing V3/corner memory as experimental, retaining the frozen V2 and rule racer for comparisons rather than claiming a promoted MPC replacement. The tested simpler platformer action-history variant matched V3 delayed completion on its smaller subset; that alone does not establish all-condition replacement equivalence. No candidate or default was retuned after held-out outcomes.
