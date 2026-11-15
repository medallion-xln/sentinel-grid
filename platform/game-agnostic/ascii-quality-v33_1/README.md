# ASCII Worlds v33.1 — gameplay recovery lane

Additive remediation lane created 2026-10-19. **Mechanics (v32 kernel, worlds, physics, actions, observations,
rewards, timeouts, scoring) are unchanged**; the v33 presentation lane is unchanged; every historical artifact is
untouched (hash-bound in `inheritance.json`: 5,832 ASCII source files, the v33 RESULT, the ASCII baseline freeze and
the 14,447-file canonical protected set). Authority R0. Nothing here trains, dispatches or promotes.

Pre-existing uncommitted changes recorded at start and not touched: `docs/stage3f5-integrated-live-shadow.md`,
`package.json` (tracked, modified) and the untracked stage lanes.

## What was found

| Game | Finding | Class | Action |
|---|---|---|---|
| Platformer Advanced | STRONG softlock (0/12 TIMEOUT): receding-horizon window hysteresis — no candidate trajectory clears GAP@133 within 45 ticks from x≈107 because takeoff must be past the elevated platform; a non-clearing BACK plan scores "safe", the gap leaves the window, "clear path" moves right, repeat | D (controller), confirmed | versioned planner V2 (`platformer-planner-v2.mjs`, APPROACH_UNTIL_CLEARABLE) → **24/24 WIN**, no Expert/Extreme regression |
| Rescue (STALE sensor) | controller dereferences a civilian absent from a stale observation → exception | B/D (controller robustness), confirmed | versioned controller copy (`controllers-v33_1.mjs`, one guard) → 0 exceptions |
| Pong | STRONG never wins a point, but a privileged contact sweep finds point-winning contacts in every sampled approach state | D (controller deficiency); public-information winnability NOT_ESTABLISHED | no change (competence, not malfunction) |
| Racing | first place is decided by the rotated start grid: pole seeds win 45/45 driver parameterisations (STRONG too), last-row seeds 0/45 but win from pole | benchmark design | no change; any change needs authorization |
| Cards | all public policies fail by deck exhaustion with errors unused (clue economy), privileged witness succeeds | D (hidden-information planning deficiency) | no change (prior decision stopped Cards repair) |
| Roguelike Expert/Extreme | STRONG dies to adjacent enemies / traps on floors 1–2; privileged witness survives | D (controller) | no change |
| Shared runtime | seeding, cloning, packet immutability, stale-packet/illegal-action rejection, sensors, terminal handling, timeout-at-limit: 24/24 levels pass | none | — |

## Files

`guard.mjs` (inheritance + sole-writer), `population.mjs` (preregistered seeds), `inventory.mjs` (A1),
`platformer-forensics.mjs` (A2), `platformer-planner-v2.mjs` + `policy-v33_1.mjs` + `controllers-v33_1.mjs` (A5),
`audit.mjs` (A3/A7), `acceptance.mjs` (A6), `probes.mjs` + `shared-infra.mjs` (A4), `finalize.mjs` (matrix, repair
manifest, RESULT), `report.mjs` (REPORT.md), `server.mjs` (v33.1 UI, port 4186, candidate controllers selectable),
`observatory/` (A8 overlay, port 4193), `tests.mjs`.

## Reproduce (read-only)

```sh
node ascii-quality-v33_1/guard.mjs
node --test ascii-quality-v33_1/tests.mjs
node ascii-quality-v33_1/server.mjs                 # http://127.0.0.1:4186 — pick "v33.1 candidate" controllers
node ascii-quality-v33_1/observatory/server.mjs     # http://127.0.0.1:4193 — STAGE 3H EVALUATION mode → game health
```

Generators (`inventory`, `platformer-forensics`, `acceptance`, `audit`, `probes`, `shared-infra`, `finalize`, `report`)
refuse to overwrite existing outputs; delete a level's `evidence/audit/<LEVEL>.json` to re-audit that level.
