# ASCII Worlds 3.1 — interactive Sentinel connection

Run from the repository root:

```sh
node platform/game-agnostic/ascii-suite/v31/server.mjs
```

Open http://127.0.0.1:4176/. Stop any older game server occupying that exact port first.
Use this **v31** command, not the frozen `v3/server.mjs` command.

Sentinel is selected by default and starts automatically. Changing world, difficulty,
seed, controller, memory, partner, or player count immediately loads and plays that
selection. Pause stops playback; Auto Step and Manual Action pause and execute one
step. Restart & Play reconnects/reset the selected world. Play again restarts a
terminal episode. ASCII sizing adapts to the field; Hide telemetry expands it.

Signal Cards now shows boxed cards, the active player, public clues/plays and
sequence progress. Entering Cards selects a readable 1-turn/second presentation
speed (you can change Speed). Own card identities remain hidden by the rules.
Factory now shows pulses for actual transfers this tick, inventories, production,
blocked machines and delivery progress. Pulses visualize existing instantaneous
transfers; they are not new travelling-item physics. The builder can remain still
while machines produce on every tick, including WAIT.

Expand **Manual cards & clues** or **Factory engineering controls** to pause and
use game-specific actions. Cards provides play/discard/clue buttons and a partner
turn button. Factory provides engineering orders and a production-tick button.
Close the controls and press Play to resume automatic play.

## What is actually connected

- The four original games use their existing `SENTINEL` observation-only game
  planners, **not** the prior UI's PRIMARY_BASELINE mapping.
- Native, unchanged `src/experts/nexus.js#evaluateNexus` and
  `src/experts/oracle.js#evaluateOracle` are invoked on each Sentinel decision.
  The UI reports the genuine invocation counts, output digests, and action source.
- New worlds use the observation-only bounded planner as an explicitly labeled
  fallback. Factory public dependency graphs can produce a native Nexus legal
  repair proposal through the unchanged inherited relational selector. Oracle is
  a temporal advisor, not an action selector. Neither is presented as learned AI.
- Cards partner policies remain independently scoped and their private rationale
  is not exposed to the P0 browser. Partners are baseline policies, not Sentinel.
- This is **not** full Prime/MoE synthesis or a qualified canonical game binding.
  No live dispatch, training, promotion, or scientific competence claim is enabled.
  The kernel alone applies validated proposals inside the local simulation.

Frozen V3 sources, benchmark artifacts, and Stage 3F/G/H conclusions are unchanged.
This separate interactive overlay imports frozen kernels but has its own runtime
identity `SENTINEL_ASCII_INTERACTIVE_3.1.0`. Do not attribute V3 baseline results to
the new Sentinel integration.

## Verification

```sh
node --test platform/game-agnostic/ascii-suite/v31/tests.mjs
node --test platform/game-agnostic/ascii-suite/v3/tests.mjs
```

2026-10-09 checks: 11 integration/presentation tests and 115 inherited tests passed. HTTP and
browser controls advanced all eight games. Twenty complete new-world smoke
episodes (four worlds × five difficulties, one seed 9001000) terminated normally.
Some harder Cards/Roguelike episodes failed; these smoke runs are playback checks,
not a success-rate estimate or scientific certification. Factory D4/D5 produced
real native Nexus repair proposals. Protected 14,502-file predecessor closure
and frozen V3 source manifest were checked unchanged. Browser checks also verified
a manual rank clue and partner play, factory power starvation/restoration and real
transfer pulses, followed by successful completion of both D1 games.
