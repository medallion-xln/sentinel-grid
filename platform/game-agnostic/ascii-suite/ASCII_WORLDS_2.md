# ASCII Worlds 2.0 — adaptive control, competitive gameplay and decision-quality requalification

**Status: DIAGNOSTIC. Authority R0. No certificate. Not a Stage 3H result and not evidence of general intelligence.**
Frozen Stage 3F/3G artifacts are untouched; the Stage 3G freeze certifier reproduces read-only (`stage3g-freeze/certify.mjs --check`: certificate `38c5b1b2…`, freeze `686805d6…`, PASS). `src/prime/root-puct.js` is used unchanged; no world model, Expert #10 or Router 2.0 was added; no controller updates weights.

Location: `ascii-suite/ASCII_WORLDS_2.md`. Code: `ascii-suite/` (worlds in `worlds/`, controllers in `controllers/`, evaluation in `eval/`). Pre-registration: `ascii-suite/eval/preregistration.json` (sha256 `561825ac…ecbf`, registered before any held-out run). Machine-generated results: `ascii-suite/results/ASCII_WORLDS_2_REPORT.md` and `ascii-suite/results/ascii-worlds-2-results.json`. Phase 0 reproduction: `ascii-suite/results/phase0-reproduction.json`.

## How the work was done

1. **Phase 0.** The v1 engine was frozen verbatim as `ascii-suite/legacy/games-v1.mjs`. `eval/phase0-reproduce.mjs` replays the incumbent one-step root PUCT on it, captures actions, Q-values, observations, transitions and outcomes, and classifies 21 issues as POLICY, PHYSICS, SCORING, ACTION_SEMANTICS, OPPONENT or OBSERVABILITY. A regression test keeps the v1 side-scroller failure reproducible (44.06% progress, three identical deaths at x≈82).
2. **Phases 1–4.** Each world was rebuilt in its own module, with a controller-legal `observe()` that excludes RNG, hidden parameters and future state. Each game got an isolated test controller that plans over that observation using published physics, plus baselines. The incumbent root PUCT is kept as the inherited baseline and relabelled **ROOT-PUCT (ONE-STEP, INCUMBENT)**. The old "SENTINEL PRIME" label described only one-step root PUCT.
3. **Phase 5–7.** `eval/harness.mjs` runs every controller under seven adaptation conditions. Held-out seeds 81001–81010 were fixed in the pre-registration before use. `eval/report.mjs` scores each hypothesis exactly as registered and classifies capability from logged triggers, not from declarations.
4. **Phase 8.** The UI keeps the full-screen ASCII field, game selector, replay export and deterministic seeds. It adds a DIAGNOSTIC panel (CURRENT_OBJECTIVE, CONTROLLER, ACTION, REASON, PLANNING_HORIZON, LAST_FAILURE, ADAPTATION_TRIGGER, OPPONENT_STATUS, RESULT). After any terminal outcome it shows `NO_ACTION_TERMINAL` and keeps the last preterminal recommendation. Replay V2 exports the exact action sequence.

Tests: `node --test ascii-suite/suite.test.mjs` — 44 tests, including full gameplay trajectories (level completions, wind-gap retries, an impossible gap forcing repeated-failure comparison, stagnation replanning, Pong band comparisons, the five fighter scenarios, full races with no-teleport checks, HTTP replay).

Where the run happened twice: after the first held-out run I made UI and reporting changes only. Those were the racing HUD, two capability labels, and parsing of the incumbent's `ONE_STEP` horizon string. I then re-ran everything. Every episode's action-sequence and final-state hash matched the first run (see "Re-run verification" below). No behaviour, threshold or criterion changed after the held-out seeds were seen.

---

## Side scroller

**IMPLEMENTATION_STATUS: COMPLETE.** Grounded/airborne legal-action audit (airborne jumps are illegal except to hold a rising jump, and are logged when applied as a fallback). Corrected jump/momentum/gravity/landing/head-bump/wall collision; variable jump height. Seeded 7–11-section levels with gaps, spikes, walls, patrols, platform gaps, pit+patrol, low ceilings (d≥3) and crosswind gaps (d≥4), all offline-verified solvable. Checkpoints now activate when passed (the v1 bug). Planner: complete-trajectory rollouts (≤101 × 45 ticks); gap-edge and landing-margin detection from observed geometry; ephemeral failure memory with signatures (checkpoint, section, position, velocity, takeoff, last 12 actions, cause, strategy, predicted landing, observed drift); cause-specific retry strategies; `REPEATED_FAILURE_DETECTED` with a strategy-by-strategy trajectory comparison; stagnation replanning.

**BASELINE_PERFORMANCE (incumbent, v1).** 44.06% maximum progress, 3/3 lives lost at the same x≈82. `JUMP_RIGHT` on 98.5% of ticks, because one-step search ties it with `MOVE_RIGHT`. Every death tick had ≥4 tied actions. Respawn was always at x=4 because the checkpoint required being grounded. Seeds 1 and 3 were identical.

**UPDATED_PERFORMANCE (held-out, 10 seeds per tier).**

| controller | d1 completion | d3 completion | d5 completion | d5 deaths | d5 repeated-failure rate |
|---|---|---|---|---|---|
| SENTINEL (memory) | 1.0 | 1.0 | 0.9 | 2.1 | 0.0 |
| SENTINEL_NO_MEMORY | 1.0 | 1.0 | 0.0 | 5.0 | 0.8 |
| RULE_BASELINE | 0.0 | 0.0 | 0.0 | 5.0 | 0.8 |
| ROOT-PUCT incumbent (3 seeds) | 0.0 | 0.0 | 0.0 | 5.0 | 0.67 |

H-PLAT-1 (memory cuts repeated deaths) **SUPPORTED**. H-PLAT-2 (planning beats incumbent and rule baseline by ≥0.3) **SUPPORTED** (1.0 vs 0 and 0).

**ADAPTATION_MEASURED.**
- CROSS_ATTEMPT_ADAPTATION (across lives, within an episode): the first crosswind death records its residual drift and retries `EDGE_TAKEOFF`, which differs from the failed `NOMINAL_MAX_MARGIN`. The no-memory ablation repeats the identical death until out of lives.
- On a deliberately impossible gap, the planner logs `REPEATED_FAILURE_DETECTED`, compares ≥5 strategies' best trajectories, and executes ≥3 distinct retry strategies with different takeoffs and action sequences (test).
- WITHIN_EPISODE_ADAPTATION: residual wind estimation.
- Repeating a scenario the planner already solves is reported as deterministic repetition (5/5 identical), not learning.

**REMAINING_FAILURES.**
- The first encounter with a crosswind gap usually costs a life. Unknown-strength wind is planned at nominal strength by design.
- One d5 held-out level was not completed.
- Under 3-tick delayed observation with 10% stale frames, completion falls to **0/5** and progress to 0.33. The planner assumes its observation is current, and retries cannot fix a timing error they cannot see.
- Jump timing error stays around 2 units: the planner prefers margin-balanced takeoffs over the window centre.

**SCIENTIFIC_CLAIMS_JUSTIFIED.** In this simulator, explicit failure memory plus genuinely different retry plans removes repeated deaths that a memoryless planner repeats deterministically. Complete-trajectory evaluation fixes the v1 pogo-jump failure. Not justified: robustness to sensor delay, or any general claim about adaptation outside this simulator.

## Pong

**IMPLEMENTATION_STATUS: COMPLETE.** Five cumulative bands (constant velocity, multiple wall reflections, in-flight spin curvature, 3-tick delay + σ=0.6 noise, adaptive opponent placement and shot selection). Controllers see only a possibly delayed/noisy ball position and their own goal-line crossing. Intercept shaping (the v1 future-state leak) was removed from the reward. The UI separates the true ball `o`, the observed ball `*`, the projected intercept `:`, the ±1σ band `.` and the actual contact `x`. Benchmarks: reactive follower, analytic intercept, incumbent root PUCT, Sentinel filter-only, and Sentinel with bounded shot selection.

**BASELINE_PERFORMANCE (incumbent, v1).** Nobody missed: reactive and analytic controllers returned every ball and scores stayed 0–0 or 1–0 over 3000 ticks. Root PUCT agreed with the analytic-intercept rule on 85.8% of ticks because the reward contained that intercept. "Prediction error" measured the formula, not a controller.

**UPDATED_PERFORMANCE (held-out return rate, 10 seeds per band).**

| band | REACTIVE | ANALYTIC | SENTINEL_FILTER_ONLY | SENTINEL (+shot selection) | incumbent (3 seeds) |
|---|---|---|---|---|---|
| 1 constant | 1.00 | 1.00 | 1.00 | 1.00 | 0.31 |
| 2 reflections | 0.92 | 1.00 | 1.00 | 0.98 | 0.24 |
| 3 spin | 0.92 | 1.00 | 1.00 | 0.99 | 0.38 |
| 4 delayed/noisy | 0.35 | 0.45 | 0.99 | 0.96 | 0.36 |
| 5 adaptive opp. | 0.36 | 0.43 | 0.99 | 0.97 | 0.16 |

- Intercept error at 8–40 ticks lead: Sentinel 1.9 vs analytic 2.9 in band 3, and 5.9–6.0 vs 9.2–9.3 in bands 4–5.
- Calibration (filter-only, bands 3–5): 70% within 1σ, 92% within 2σ. Over-wide in bands 1–2 (≈99–100%).
- H-PONG-1 **SUPPORTED**: return-rate gain over analytic is 0.00 in bands 1–3 and +0.54/+0.57 in bands 4/5.
- H-PONG-2 (shot selection helps) **NOT SUPPORTED**: −1.1 score differential.
- H-PONG-3 (calibration) **SUPPORTED**.

**ADAPTATION_MEASURED.** None claimed. The estimator is state estimation plus projection, so its capability is evidenced as DETERMINISTIC_PLANNING and the declaration was corrected. Repeated scenarios are deterministic repetition. Band-5 opponent adaptation exists in the environment (its aim reinforcement and placement lean are logged). The Sentinel side shows no adaptation trigger.

**REMAINING_FAILURES.**
- Shot selection costs return rate without improving score.
- Under undeclared extra delay with 10% stale frames (Phase 5, base band 3), the stale repeats break flight segmentation. Sentinel wins 1/5 and filter-only 3/5, while the analytic baseline wins **5/5**.
- Intervals are conservative at low bands.

**SCIENTIFIC_CLAIMS_JUSTIFIED.** Long-range prediction adds no value beyond the deterministic analytic baseline when observations are exact (bands 1–3). The value appears only when filtering and latency compensation matter (bands 4–5). That is a sensor-handling result, not a reasoning result. A good Pong score is not general reasoning competence.

## Fighter

**IMPLEMENTATION_STATUS: COMPLETE.**
- Side-view bodies with x/y, gravity and facing.
- Movement: walk forward/back, vertical and directional jumps, passing over a standing opponent, automatic facing reversal with a 2-tick turnaround (none while the opponent is overhead).
- Attacks: light (high), heavy (mid/anti-air), low sweep and aerial, each with startup/active/recovery frames and hit-box vs hurt-box collision.
- Outcomes: whiffs, hit-stun, block-stun, knockback, chip, back-hit bonus and punish detection; standing (high) and crouching (low) guard.
- Opponents: AGGRESSIVE, DEFENSIVE, COUNTER_ATTACKER and ADAPTIVE share `fightTick` with the player. They see through a 6→2-tick reaction delay and make seeded mistakes; at d4–5 they plan with short rollouts.
- Planner: ≤35 macro options × ≤5 opponent hypotheses from a within-episode opponent model, 28-tick discounted rollouts, risk-mixed value.

**BASELINE_PERFORMANCE (incumbent, v1).** 91–94% of decisions were value ties; 7-way ties at −0.005. `BLOCK` was chosen on 95% of long-range ticks. Seed 3 timed out with zero damage dealt. There was no vertical position or facing, and fighters could never cross.

**UPDATED_PERFORMANCE (held-out, 10 seeds × 4 archetypes per tier).**

| controller | d1 win | d3 win | d5 win | d5 damage efficiency | cross-category tie rate |
|---|---|---|---|---|---|
| SENTINEL | 1.00 | 1.00 | 1.00 | 0.77 | 0.02–0.03 |
| RULE_BASELINE | 0.90 | 0.80 | 0.78 | 0.63 | — |
| UNIFORM_RANDOM | 0.40 | 0.08 | 0.00 | 0.05 | — |
| ROOT-PUCT incumbent (3 seeds × 4) | 0.00 | 0.17 | 0.00 | — | 0.98–1.00 |

All five required scenarios pass as gameplay tests:
- jump over a perfect-guard opponent and hit from behind, then land and turn;
- punish a whiffed heavy;
- block a low and counter with a punish;
- approach from long range without blocking;
- choose LIGHT for a 3-tick window at close range, and HEAVY for a long window beyond light range.

Held-out d3 averages: whiff rate 0.7%, punish rate 0.94, about 2.2 jump-overs per round.

H-FIGHT-1, -2 and -3 are all **SUPPORTED**:
- -1: win rate 1.00 vs 0.78; higher damage efficiency in every archetype.
- -2: cross-category tie rate 0.034 vs 0.977 for the incumbent.
- -3: 0.6 win rate under delayed observation.

**ADAPTATION_MEASURED.** WITHIN_EPISODE_ADAPTATION through `OPPONENT_MODEL_SHIFT` triggers. A repeated round with the carried opponent model changed behaviour in 4/5 seeds, with damage efficiency +0.018 (small). Damage efficiency by condition:

| condition | damage efficiency |
|---|---|
| first encounter | 0.98 |
| changed opponent | 0.99 |
| increased difficulty | 0.70 |
| delayed observation | 0.59 (win 1.0 → 0.6) |

**REMAINING_FAILURES.**
- The scripted archetypes do not discriminate Sentinel's level: it wins 100% at every tier. Its edge is partly reaction speed (exact physics, zero delay) — with a 3-tick delay its win rate falls to 0.6.
- Ties between same-category actions (mostly guard height) remain on 2–7% of actionable decisions; cross-category ties are 1.6–3.4%.
- Blocking is rare at d5 (block effectiveness 0.08): the planner prefers trading and evasion.
- The rule baseline is non-monotone across difficulty for some archetypes.

**SCIENTIFIC_CLAIMS_JUSTIFIED.** Multi-tick rollouts on shared physics remove the one-step ties that made guard, attack and movement look equal, and they produce the required spacing, punish and cross-up behaviour. Not justified: adversarial competence against strong or human opponents. The opponents are scripted and slower to react.

## Racing

**IMPLEMENTATION_STATUS: COMPLETE.**
- The road is 18 columns wide at 1 column per lateral unit, with barriers at ±10.5.
- The curvilinear vehicle model has a lateral grip limit (corner speed √(μ/κ)), speed-dependent steering, braking distances, a grass penalty, barrier collisions, and contact between all car pairs.
- Seeded tracks have sweepers, sharp corners, hairpins and chicanes, plus visibly wet corners at d≥4.
- Rivals use the same `carStep` and actions with seeded rule-based skill. There is no teleport, boost or rubber-banding (tested every tick).
- The driver HUD shows next corner, distance, grip-limited speed, braking distance, grip use, nearest gaps, overtaking opportunity and projected off-track risk.
- Benchmarks: constant speed, reactive steering, rule-based racer (the same logic as the rivals), Sentinel MPC with wet-grip interval estimation and per-corner lap memory.

**BASELINE_PERFORMANCE (incumbent, v1).** The road was ~55 columns at 120 width. The player cornered at 3.17 against a "safe" 1.5 that the physics never enforced. Rivals braked to fixed corner speeds and finished 800–980 units (more than a lap) behind. Lap times were identical across seeds.

**UPDATED_PERFORMANCE (held-out, 10 seeds per tier; placement 1–4, lower is better).**

| controller | d1 place | d3 place | d5 place | d3 mean lap ticks | d5 mean lap ticks | off-track ticks (d3/d5) |
|---|---|---|---|---|---|---|
| SENTINEL | 2.3 | 2.4 | 1.9 | 508 | 642 | 0 / 0 |
| RULE_BASED | 2.3 | 2.7 | 1.9 | 524 | 676 | 0 / 0 |
| REACTIVE | 1.5 | 3.2 | 3.2 | 528 | 688 | 890 / 1984 |
| CONSTANT_SPEED | 4.0 | 3.9 | 4.0 | 690 | 786 | 0 / 0 |
| ROOT-PUCT incumbent (censored at 1500 ticks) | 4.0 | 4.0 | 4.0 | — | — | 900–1015 |

- H-RACE-1 (comparable pace) **SUPPORTED**: the mean finish spread across all four cars is 3.4% of race time, and the rule-based racer wins 20% at d3.
- H-RACE-2 (MPC beats rule racer by ≥0.3 places with no more off-track) **NOT SUPPORTED**: −0.3 at d3 but 0.0 at d5, although laps are 3–5% faster.
- H-RACE-3 (corner memory reduces off-track) **NOT SUPPORTED**: no planner left the track, so the memory never engaged. SENTINEL and SENTINEL_NO_MEMORY are identical in the main runs.

**ADAPTATION_MEASURED.**
- WITHIN_EPISODE_ADAPTATION: `GRIP_ESTIMATE_UPDATE` fired on wet corners (22 updates in the d5 condition).
- CROSS_ATTEMPT_ADAPTATION: `CORNER_MEMORY_SLOWER` fired only under delayed observation (14 triggers), and still finished last.
- Repeated races are deterministic repetition (5/5 identical).

**REMAINING_FAILURES.**
- Planning gains over the rule racer are small, and placement is dominated by start position and traffic. A changed grid slot costs about 0.8 places.
- Under delayed observation every controller finishes last.
- Opponent pace calibration rests on one rule family. The incumbent leaves the track and is censored at the budget.

**SCIENTIFIC_CLAIMS_JUSTIFIED.**
- The rebalanced world is competitive: opponents are no longer structurally inferior.
- Physics-respecting braking and lines (rule or MPC) are necessary; reactive driving and one-step search fail.
- Not justified: that the MPC adds a meaningful racing advantage, or that lap memory adapts usefully.

---

## Re-run verification

Source closure changed from `e03ae8f6…` (run 1) to `3b80148a…` (run 2, the published results) because of the UI/reporting edits. Pre-registration unchanged. From `results/rerun-verification.json`:

| game | episodes compared | identical action-sequence hashes | identical final-state hashes |
|---|---|---|---|
| pong | 385 | 385 | 385 |
| platformer | 249 | 249 | 249 |
| fighter | 476 | 476 | 476 |
| racing | 309 | 309 | 309 |

## Which worlds test what

| capability | most useful world | why | weakest world |
|---|---|---|---|
| Prediction | **Pong bands 3–5** | Exact ground truth for the intercept, in-flight curvature, delay and noise. Calibration is measurable. Bands 1–2 show prediction without added value. | Racing (preview is given, not predicted) |
| Planning | **Side scroller** | Delayed consequences (a jump commits ~15 ticks), sharp safe/unsafe boundaries, multi-step trajectory choice; 1.0 vs 0 completion separates planners from one-step search. | Pong (reactive/analytic suffice without delay) |
| Adversarial reasoning | **Fighter** | Simultaneous moves, frame advantage, mix-ups, cross-ups, an opponent model. Its current limit is weak scripted archetypes: Sentinel saturates at 100%. | Pong (the opponent is a noisy environment) |
| Uncertainty | **Pong bands 4–5**, then the side-scroller crosswind | Pong gives calibrated intervals against truth. The wind gap creates model uncertainty with an observable residual. | Fighter (all physics visible) |
| Adaptation | **Side scroller (d4–5)** | Failures are reproducible and attributable, retries differ, and the ablation repeats the identical death. Racing and Pong showed little or no adaptation value. | Racing (memory never triggered in normal runs) |

Across all four worlds, the strongest results come from bounded planning on known, published physics. The clearest weaknesses are sensitivity to delayed or stale observations, scripted opponents too weak to discriminate, and adaptation mechanisms that matter only where the world hides a quantity (crosswind strength) — **none of this supports a claim of general intelligence, Stage 3H expert competence, or qualified Prime synthesis.**
