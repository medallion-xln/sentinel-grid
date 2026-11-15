# ASCII Worlds 3.2 — isolated development extension

Start from the repository root:

```sh
node platform/game-agnostic/ascii-suite/v32/server.mjs
```

Open http://127.0.0.1:4178/. Pick a game and Advanced, Expert or Extreme, then **Play Sentinel**. New episode resets the selected seed; One planner tick and manual legal-action controls dispatch actual simulation actions. Factory and Cards render their changing inventories, clues, public events and progress. Original D1–D5 remain in the unchanged 3.1 application at port 4176.

This is a separate 3.2 source/configuration lane. It does not replace frozen games, modify canonical weights, grant authority, or enable online learning. A Sentinel-labeled controller here is an observation-only game planner, not evidence of canonical MoE learning. Every final action includes its actual source. Offline rejected candidates cannot be selected by the UI.

## Actual extensions

- Pong: bounded spin, acceleration-limited paddles, equal noisy delayed ball channels, independent two-ball mode, public-history adaptive shot opponent.
- Platformer: moving platforms, timed hazards, key/switch/exit dependencies, elevated alternatives, and a three-stage wind/resource expedition. Final obstacle is not a boss.
- Fighter: counter specialist, six-style tournament and two-cycle championship, same simultaneous combat physics and matched observation reaction age. The championship is not yet a independently qualified human-level opponent or learned opponent model.
- Racing: technical/chicane tracks, rotated grids, changing visible weather/grip, and three-race championship. No tire/pit mechanics are claimed.
- Rescue: hidden threats and civilians, deadlines, relocations with last-seen intel timestamps, multiple extraction sites, and connectivity-preserving closures.
- Cards: scarce communication, private partner clue priorities, and changing-deal/partner three-round tournaments; own identities remain concealed.
- Factory: broken/disconnected chains, shared ore/power/credits, multiple quotas/deadlines, and equipment disruptions. The new `V32_TRANSPORT_THEN_RECIPE_CAPACITY_V1` flow converts full input inventories without the inherited pre-consumption-capacity deadlock; original V3 mechanics are unchanged.
- Rogue: new corridor families, scarce survival resources, two/four/five floors, keys and gates, patrollers, visible cyclic hazards, and a final artifact dependency.

## Evidence and limitations

`baseline-audit.json`, `inheritance.json` and `preregistration.json` precede new level outcomes. Runs use exclusive artifact writes, retain failures, separate public packets from evaluator-only labels/replays/witnesses, and never materialize reserved tests. A constructive private witness is only existence evidence, not a deployed policy or hidden-information competence claim.

`runs/codec-pilot-001` tests the staged encoder with an exact legal-action decoder on fresh TRAIN and two OPEN populations. `runs/relational-pilot-001` separately fits graph-derived action features. Both are small diagnostic pilots, not powered qualification. V2 software coverage is not trained-policy safety. Rejected weights remain available as artifacts but are never automatically activated.

`runs/challenge-smoke-001` covers all 24 levels with strong/wait/spam/random policies and controlled sensor sweeps. `runs/memory-transfer-pilot-001` retains strict new-catastrophe vetoes, retests inherited Rogue memory and frozen Rescue occupancy transfer, and compares Pong shot/filter planners. The curriculum manager permits advancement from TRAIN/DEV only; OPEN or reserved feedback cannot update weights. Other transfer targets, reward calibration, exact regret, genuine Prime synthesis and independent structural-OOD qualification are not claimed.

Pong and racing require successful constructive witnesses before admission as strategic win benchmarks; unsolved instances stay unresolved. Difficulty discrimination is reported per game/tier rather than mixing reward scales. Broad full qualification remains gated on codec and relational-consumer success.

Verify software:

```sh
node --test platform/game-agnostic/ascii-suite/v32/tests.mjs
```

Campaign scripts are immutable-run owners; rerunning an existing run ID refuses to overwrite its artifacts. Read the generated final result before interpreting gameplay success as learned or canonical intelligence.

## Delivery status

This is a partial scientific/mechanics delivery, not certification of all requested challenges. All 24 core tier selections execute actual simulations. The final browser check completed Factory Extreme at tick 81; Cards Extreme advanced through tick 51 to a legitimate failure with its own hand still hidden. The UI now queues game/tier resets during in-flight requests, preventing a changed selector from leaving an old board active.

Final software checks: 254 passed, zero failed. Independent replay: 627 retained evaluator episodes and witness attempts, 791,037 transitions, zero divergences. The 515 evaluation episodes all completed; that count is executable admission, not proof of scientific benchmark validity. Constructive existence is established for 37 of 48 checked level/seed instances. Pong Advanced/Extreme wins, all racing first-place goals, and one Rogue Extreme seed remain unresolved. Witnesses are evaluator-only and never policy inputs.

The four finite primary V2 heads and eight finite control heads reproduce from TRAIN data, but no primary head qualifies. The independent Factory relational V1 experiment is numerically invalid: an optional-node Boolean feature became `NaN`, serialized as null, contaminating 65 weights. Its original hash-only reproducibility claim is superseded by the additive numeric audit, not accepted as training evidence. Original failed artifacts remain untouched. `numeric-contract.mjs` provides a guarded, explicitly untrained V2 feature repair and finite-only training checks for a future fresh experiment; it is not activated in gameplay.

Fighter Extreme's distinct resource/tactical-phase extension and Cards' distinct risk-preference partner behavior remain incomplete. Independent structural-OOD/stress qualification, a full adaptive training loop, and powered policy qualification were not completed. See `RESULT.md` for the required structured result, all ten answers, per-level outcomes, hashes, exact failures, and the next experiment.

The agent-owned preview is stopped at handoff under the Sites local-preview workflow; run the command above to start it again. The original user-owned 4176 server is untouched.
