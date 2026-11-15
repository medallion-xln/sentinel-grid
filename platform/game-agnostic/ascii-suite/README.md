# Sentinel Grid — ASCII Worlds 2.0

Four deterministic 2D simulations with one plain-ASCII observability surface, upgraded to test prediction, planning, adversarial play, uncertainty and adaptation. **This is a bounded diagnostic game suite, not a Stage 3H competence certificate.** Everything runs locally at authority R0; nothing is dispatched or published, no frozen Stage 3F/3G path is touched, no model weights change, and `src/prime/root-puct.js` is used unchanged.

Results of the pre-registered held-out evaluation: [`results/ASCII_WORLDS_2_REPORT.md`](results/ASCII_WORLDS_2_REPORT.md). Interpretation and per-game verdicts: [`ASCII_WORLDS_2.md`](ASCII_WORLDS_2.md). Phase 0 reproduction of the recorded failures: [`results/phase0-reproduction.json`](results/phase0-reproduction.json).

## Launch

From `platform/game-agnostic`:

```sh
node ascii-suite/server.mjs
```

Open http://127.0.0.1:4174/ (override with `ASCII_SUITE_PORT` or `PORT`). The server binds loopback only. Terminal alternative:

```sh
node ascii-suite/cli.mjs --game platformer --mode sentinel --difficulty 4 --seed 1
```

## Controllers (the CONTROL selector)

| Mode | Controller | Access | What it is |
|---|---|---|---|
| `SENTINEL TEST PLANNER` (default) | per-game isolated test controller | observation only | bounded planner described below; diagnostic, not qualified Prime synthesis |
| `ROOT-PUCT (ONE-STEP, INCUMBENT)` | `src/prime/root-puct.js`, 96 simulations | known simulator (privileged, diagnostic) | the inherited baseline, previously labelled "SENTINEL PRIME"; it is one-step root PUCT, so it is labelled accurately |
| `RULE BASELINE` | hand-written comparator per game | observation only | pong analytic intercept; side-scroller jump-at-obstacle; fighter guard/punish rules; racing braking-profile driver |
| `MANUAL` | keyboard / buttons | — | local play |

Additional evaluation controllers (registry in `controllers/index.mjs`): `SENTINEL_NO_MEMORY` (side scroller and racing ablations), `SENTINEL_FILTER_ONLY` (pong without shot selection), `REACTIVE` (pong ball follower, racing reactive steering), `CONSTANT_SPEED` (racing), `UNIFORM_RANDOM` (floor). Observation-only controllers receive a deep-frozen copy of `observe(state)`; only the incumbent receives simulator state.

After a terminal win/loss/finish no executable recommendation is produced: every controller, the server and the panel show `NO_ACTION_TERMINAL`, and the last valid preterminal recommendation is kept in the panel history.

## Worlds

Difficulty is 1–5 in every game. Every action is one logical tick; the tick-rate selector changes presentation only.

### Side scroller (`worlds/platformer.mjs`)
- Body physics: ground/air acceleration, friction/drag, gravity, **variable jump height** (holding a jump action while rising keeps the full impulse; releasing cuts it), head bumps, wall and landing collision with substeps.
- **Legal-action audit**: jump actions are legal when grounded, or while rising with the jump held; otherwise they are applied as the documented fallback (`JUMP_RIGHT`→`MOVE_RIGHT`) and logged as `ILLEGAL_ACTION_AUDITED`.
- Seeded levels of 7–11 sections: gaps, spike clusters, walls, patrol enemies, wide gaps with a floating platform, pits with a patrol on the landing, low-ceiling gaps (d≥3) and **crosswind gaps (d≥4)** whose zone is visible but whose strength is not observable. Every generated gap is checked solvable under true physics (`offlineGapSolvability`, test only).
- Checkpoints activate when passed (airborne or not); falls respawn at the last checkpoint. Five lives.
- Test controller: receding-horizon comparison of **complete trajectories** (run-up length × hold profile × air control, wait and back-off variants, ≤101 rollouts × 45 ticks) over its own belief: observed geometry, published physics, enemy motion estimated from observation, crosswind estimated from its own motion residual. Local ephemeral **failure memory** keyed by (checkpoint, section, cause) with signatures (position, velocity, takeoff, last 12 actions, strategy, predicted landing, observed drift); cause-specific **retry strategies** (`EDGE_TAKEOFF`, `RUN_UP`, `SHORT_HOP`, `FULL_ARC`, `WAIT_FOR_CLEARANCE`); `REPEATED_FAILURE_DETECTED` triggers a comparison of the best trajectory under every strategy; **stagnation** (90 ticks without progress) triggers `STAGNATION_REPLAN`.

### Pong (`worlds/pong.mjs`)
Five cumulative bands: 1 constant velocity, 2 multiple wall reflections, 3 in-flight spin curvature, 4 delayed (3 ticks) and noisy (σ=0.6) observation, 5 adaptive opponent placement and shot selection. Controllers observe only a (possibly delayed/noisy) ball position — no velocity, spin or future — and the observed crossing of their own goal line. The shaped reward contains no intercept term (v1 leaked the analytic intercept into the reward). The UI separates the **true ball** `o`, the **observed ball** `*`, the **projected intercept** `:`, its **±1σ band** `.` and the **actual contact** `x`.

Test controller: least-squares fit of the flight since the last contact in unfolded wall coordinates (curvature term when ≥6 samples in spin bands), latency compensation, prediction variance plus a lead-time model-error term, and optional shot selection that aims away from the observed opponent only when uncertainty leaves margin on the paddle.

### Fighter (`worlds/fighter.mjs`)
Side-view bodies with x/y position, velocity, gravity and **facing**. Walk forward/back, jump up/forward/back, crouch; **pass over** a standing opponent while high enough; facing reverses automatically after crossing with a 2-tick turnaround (no turning toward an opponent still overhead — the cross-up). Light (high), heavy (mid, anti-air reach), low (sweep) and aerial attacks with **startup / active / recovery frames**, hit boxes vs hurt boxes (standing/crouching/airborne heights), whiffs, **hit-stun / block-stun**, knockback, chip damage, back-hit bonus, punish detection, standing (high) and crouching (low) guard. Both fighters run the same `fightTick`.

Opponent archetypes `AGGRESSIVE`, `DEFENSIVE`, `COUNTER_ATTACKER`, `ADAPTIVE` see the player through a reaction delay (6→2 ticks by difficulty) and make seeded mistakes; at difficulty 4–5 they plan with short option rollouts on the same physics. The archetype is hidden from controllers.

Test controller: up to 35 macro options (approach, retreat, guard-then-counter, immediate and walk-in attacks, timed jump-in air attacks with land-turn-counter) × up to 5 opponent response hypotheses from a **within-episode opponent model** (counts by spacing and visible phase), 28-tick rollouts with time-discounted damage and a whiff cost, value = 0.7·expected + 0.3·worst case. It reports `qTies` and `qTieCategories` (ties across guard/attack/move/jump/idle).

### Racing (`worlds/racing.mjs`)
Curvilinear vehicle model (distance, lateral offset, heading) with a **lateral grip limit** (corner speed √(μ/κ)), **speed-dependent steering**, braking distances, grass slowdown, **barriers**, and car-to-car contact between every pair. The road is **18 columns wide at 1 column per lateral unit** (barriers at ±10.5). Seeded tracks of straights, sweepers, medium/sharp corners, hairpins and chicanes (more and tighter with difficulty), with visibly **wet** corners at d≥4 whose grip loss is not quantified to controllers. Rivals (APEX/BOLT/CRUISE) use the same `carStep` and five actions, driven by the same rule-based logic as the `RULE_BASED` player baseline with seeded skill — no teleporting, boosting or rubber-banding. The STATE panel shows the driver HUD: next corner (direction, radius, distance, grip-limited speed), braking distance, grip usage, nearest gaps, overtaking opportunity and projected off-track risk.

Test controller: MPC over 4 aggression levels × 4 lateral plans (racing line, pass left/right, centre), 40-tick rollouts on the visible preview with constant-velocity rival predictions, a terminal brakeability check, an interval estimate of wet grip from its own slide/no-slide evidence, and a per-corner speed factor carried across laps.

## Evaluation

```sh
node ascii-suite/eval/phase0-reproduce.mjs            # Phase 0 on the frozen v1 engine (legacy/games-v1.mjs)
node ascii-suite/eval/run.mjs --game platformer       # held-out run for one game (pong|platformer|fighter|racing)
node ascii-suite/eval/report.mjs                      # merge, score pre-registered hypotheses, write the report
node --test ascii-suite/suite.test.mjs                # unit + gameplay-trajectory tests
```

- `eval/preregistration.json` fixes held-out seeds, controllers, compute budgets, metrics and pass/fail criteria. `report.mjs` refuses results produced under a different registration hash.
- `eval/harness.mjs` runs episodes with the Phase 5 conditions (`FIRST_ENCOUNTER`, `REPEATED_SIMILAR` with explicitly carried memory, `CHANGED_INITIAL_STATE`, `CHANGED_OPPONENT`, `UNSEEN_SEED`, `INCREASED_DIFFICULTY`, `DELAYED_OBSERVATION` with 3-tick delay and 10% stale frames) and records horizon, branches, latency, legality, ties, adaptation triggers, terminal behaviour, intercept error/calibration and a one-step regret **proxy** (valid only as a one-step diagnostic).
- Capability classes are assigned from logged evidence: `REACTIVE_CONTROL`, `DETERMINISTIC_PLANNING`, `WITHIN_EPISODE_ADAPTATION`, `CROSS_ATTEMPT_ADAPTATION`; no controller updates weights, so `LEARNED_POLICY_ADAPTATION` is never claimed. Identical replays are reported as deterministic repetition, not learning.

## Replay

`EXPORT REPLAY` (schema `SENTINEL_ASCII_EVALUATION_REPLAY_V2`) contains the engine version, config, initial state, the exact applied `actionSequence`, per-tick decision summaries (controller, reason, horizon, adaptation trigger, legality audit), the final state and a SHA-256 provenance manifest of the simulation/controller closure. `stepGame(initialState, a)` over `actionSequence` reproduces the final state. The v1 replay schema is not compatible with v2 engines; v1 replays still replay against `legacy/games-v1.mjs`.

## Limits

Diagnostic only. Opponents are scripted environment agents, the planners use published physics, and success in these worlds says nothing about general reasoning, Stage 3H expert competence or certified Prime synthesis.
