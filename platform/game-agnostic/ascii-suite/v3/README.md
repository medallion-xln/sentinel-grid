# Sentinel Grid - ASCII Worlds 3.0

Local, buildless Node suite. Four new worlds plus unchanged compatibility access to Pong, Side Scroller, Fighter and Racing. No canonical expert activation, training, live dispatch, promotion, external publication or new roadmap stage.

From the repository root:

```sh
node platform/game-agnostic/ascii-suite/v3/server.mjs
```

Open **http://127.0.0.1:4176/**. Use Reset after changing world, difficulty, seed, controller, memory or partner settings. Play runs the selected diagnostic baseline, Pause stops it, Auto Step advances one decision, and Manual Action executes the selected action. Arrow keys/WASD move; space toggles playback. Hide telemetry maximizes the field. Presentation speed never changes simulation rules. Existing entry points on 4174/4175 remain unchanged.

CLI manual play is also available: `node platform/game-agnostic/ascii-suite/v3/play.mjs rescue 9001000 1`. Substitute `cards`, `factory` or `roguelike`.

## How to play

- **Rescue:** select a team unit; collect K, open locked D with USE_KEY, locate C, stabilize injured civilians, rescue and carry them back to X. Extraction is at zero-based **(3,2)**, initially occupied by the scout whose glyph overlays X; EXTRACT works within one cell. Supplies and civilian deadlines are real. Scouting expands line-of-sight for two observations, costs a supply and tick, and gives no tile-count reward. SECURE_AREA temporarily contains patrols and disables nearby hazards. Selection costs a tick too.
- **Signal Cards:** your four cards are concealed; other hands are genuinely visible. Build each public category sequence one rank at a time. Clues specify a category or rank, update both matching and nonmatching slots, and cost a shared clue. Discard restores a clue but can permanently lose the last copy of a needed rank. The browser is always P0, even when partners privately decide. Partner turns use their configured policy when you step.
- **Factory:** O extracts ore; F converts ore to ingot; A consumes two ingots per product. D4/D5 also require a part from C, which consumes an ingot. Machine outputs travel only through actual axis-aligned directed links of at most four cells. Management actions are remote; MOVE positions the builder for adjacent BUILD actions. Power costs per operating node per tick are source 1, furnace 2, assembler 3 and cutter 2. A power plant supplies 6 plus 3 per upgrade. Correct allocation, restore missing links, repair faults, and deliver at X. Upgrades and repairs complete later; input stock cannot be transported as a machine's output. Buffer ports reserve room for both assembler inputs. Transport processing rotates deterministically for fair competing outputs.
- **Roguelike:** collect K using PICKUP, open D, manage enemies, potions, rations and stamina, locate X and DESCEND. Potions heal up to 40; capacity four. Defending restores one stamina and reduces incoming damage. Rest consumes a ration. INSPECT costs a tick and expands trap-aware LOS for two observations. Guardians threaten adjacent cells, hunters chase within six on alternating ticks, sentries attack along LOS within five every third tick. Inventory persists across levels; map coordinates do not become truth in the next dungeon.

## Difficulty contracts (version 3.0.0)

| World | D1 | D2 | D3 | D4 | D5 |
|---|---|---|---|---|---|
| Rescue | 27x15, 1 extraction | 31x17, key gate/patrol | 35x19, 2 extractions/injuries | 39x21, more patrol/hazard pressure | 43x23, 3 extractions |
| Cards | 2 categories x3 ranks, 8 clues/4 errors, target 5 | 2x4, 8/4, target 6 | 3x4, 6/3, target 9 | 4x5, 5/3, target 18 | 4x5, 4/2, target 18 |
| Factory | 12 products, complete chain | 16, missing output link | 20, power allocations insufficient | 24, parts chain and one failure | 28, parts chain and two failures |
| Rogue | 27x15, 1 level | 31x17, 2 levels/key gate | 35x19, 2 levels, fewer potions | 39x21, 3 levels/fewer rations | 43x23, 3 levels/more threat damage |

Generation families A/B change declared room-door layout or factory placement; card decks use separate deterministic shuffles. These are **known-family procedural replications**, not structurally independent OOD tasks. Population parity balances families. Difficulty is not guaranteed to produce monotone empirical success curves.

## Boundaries and replay

`kernel.mjs` owns authoritative worlds. `packet()` freezes only whitelisted observations, legal action descriptors, actor/tick and public-input hashes. Controller workers import no authoritative kernels, evaluator or filesystem modules. This is an audited information boundary for the provided policies, **not an OS sandbox for arbitrary hostile code**. Unknown movement outcomes are costed attempts; the action menu does not answer whether concealed destinations are safe. Own-card correctness is never an action prerequisite. Invalid/stale proposals do not advance the world.

`advisory.mjs` declares canonical experts NOT_TESTABLE, Picasso/Forge NOT_APPLICABLE, and an explicitly named rule fallback. No canonical output is fabricated. NONE is qualified by this build.

Public browser replay exports observations and sanitized public actions in an integrity hash chain, without private initialization, evaluator metrics or hidden-state hashes. This validates **public integrity only**. Exact private replay and evaluator truth exist solely in offline `results/**/episodes/*.json`; the server cannot serve those files or world source modules. Do not hand privileged diagnostic artifacts to controllers.

Every generated admission runs a structural reachability/resource check with at most 16 attempts. Successful private replay witnesses cover all 20 **software fixture** world/difficulty cells, including D5. This is not a proof for every seed, a limited-information solvability proof or an optimality claim. Cards' generator check establishes full-deck sequence reachability, not that every shuffled limited-information team can finish.

## Policies and memory

The four comparators are RANDOM_LEGAL, REACTIVE_BASELINE, RULE_BASELINE and BOUNDED_PLANNER. They are hand-written game policies, not Sentinel MoE experts. Card partner aliases INFERENCE_BASED and COOPERATIVE_PLANNER currently share the bounded policy; reactive/rule rogue policies are largely shared. Do not infer diversity or expert marginal value from these names.

Path search is capped at 2,048 expansions **per decision**. Factory planning evaluates at most 32 public candidates over 16 ticks each; its conservative upgrade model treats the upgrading node as temporarily unavailable (the real world keeps it operating until upgrade completion). This is a declared prediction-model approximation, not qualified mechanical FPE. Card beliefs use multiplicity-weighted constrained marginals, not an exact joint posterior (at most 80 slot/category/rank candidates here, below the 4,096 budget). World randomness never enters controller packets; controller RNG state is separate. Actual expansions/candidates/model ticks/invocations and selection/observation/step timing are recorded.

Rogue NO_MEMORY clears public map evidence each decision. EPISODE_MEMORY_ONLY remembers the current level; CAMPAIGN_MEMORY additionally retains provenance/time/type-conditioned historical evidence; EXPERIENCE_RETRIEVAL exposes uncertainty-marked hypotheses from the same campaign's previous levels. Current maps reset on level changes. Stale enemy coordinates are never used as current routing truth. The bounded policy can prepare healing for a matching historically encountered threat; contradictory visible damage invalidates that match. All modes start fresh per campaign with an empty external experience corpus. This is diagnostic memory, not learned canonical policy weights or Alexandria qualification.

## Diagnostic populations and metrics

`plan.json` fixes seed rules and equal quotas. The completed final development check is `results/DEV_QUALIFIED/report.json` (800 episodes). Original DEV (800 episodes) is retained as development evidence. DEV_FINAL was deliberately stopped during review; its 624 written episode artifacts and incomplete-run record remain, and are not represented as a complete population. Repairs stayed before the source freeze and OPEN exposure.

`freeze.json` and `registration.json` bind final code, predecessor closure, plan, browser/test/witness evidence before OPEN. OPEN schedules 1,600 main episodes (20 seeds x4 worlds x5 difficulties x4 controllers), 100 matched rogue memory campaigns and 100 card partner-policy campaigns. Supplemental panels are separate, not pooled into main rates. No source or policy retuning after exposure, no sealed authorization and no automatic next cycle.

Success means each world's explicit objective; return is declared gameplay utility, **not DDV**: rescue -0.1/tick, +30/extraction, -30/civilian death, -60/team casualty; cards -0.05/tick, +2/valid play, -4/misplay; factory -0.1/tick, +3/product delivered; rogue -0.1/tick, +30/completed level, +1/treasure, -0.2/damage. Catastrophe is respectively a team casualty or zero extraction at terminal; exhausted error budget; zero delivered products at terminal; death. Timeouts remain visible, never silently dropped.

Explicit predecision card/playability and sparse rescue threat hypotheses have evaluator-only Brier labels at their source tick. Report means at episode/campaign level, not independent-turn samples. Cooperative score, factory throughput, survival/progress, resource conservation and memory ablations are gameplay diagnostics. FPE as a canonical-expert metric, CAD, CR, DDV, TCA and scientific VOI remain NOT_ESTABLISHED. Clue efficiency is plays per clue, not causal information value. Information acquisition costs are tick/resource counts, not certified VOI. Pooled returns across different worlds are descriptive only.

The OPEN table, raw traces, exact replays, exploratory paired bootstrap intervals (2,000 fixed resamples; no multiplicity-controlled certification), actual latency quantiles and independent metric/binding replay verification are in `results/`. Main card results vary P0's controller with fixed RULE_BASED partners; timing/invocation counts include those partner decisions. Independent partner-policy tests cover 2/3/4 players. Sealed seeds from ancestor stages are not used.

## Verification and one-shot evaluation

```sh
node --test platform/game-agnostic/ascii-suite/v3/tests.mjs
node platform/game-agnostic/ascii-suite/v3/protect.mjs
```

The registered OPEN run is one-shot: `node platform/game-agnostic/ascii-suite/v3/evaluate.mjs OPEN`. Existing artifacts are exclusively created and rerunning into the same lane intentionally refuses overwrite. `verify-results.mjs` independently reproduces exact replays, trace bindings, predecision labels, raw-summary links and aggregate cells. It also preserves predecessor byte identity; prior F/G semantic reproduction is retained, not claimed as a new semantic certification run.

Read `REPORT.md` and `results/result.json` for the completed result and remaining scientific-qualification limits. No Router 2.0, world model, Expert 10, Stage 3H competence or cross-world transfer is justified by this build.
