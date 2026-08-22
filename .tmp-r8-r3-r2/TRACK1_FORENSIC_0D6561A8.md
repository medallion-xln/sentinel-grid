# Track 1 — R0 visual-expert and mission-aware provenance forensics

## Target lineage
- R7 certified: `7c97573c60f2f04830ec72d5a9cf7ba7a9f4d2055c36458fac8ca46fdb4812a7` (1,302,376 bytes)
- Prior frozen successor: `a080f0cffbdf5666493eab50f9ba7879cb0847340eaae43f080fd822348033c6` (1,399,735 bytes)
- Current successor: `0d6561a83905a6c263daa772ffdee690d8e623525def54a0eaf73f81aeb8017a` (1,400,787 bytes), frozen 2026-08-09

## Sentinel anchors
- `getAdvisorTelemetry`: 2 occurrences; exact method anchor retained once.
- `getStrategicStateQuantum`: 0 occurrences.
- Legacy bridge and global game anchors retained once each.
- Forbidden runtime tokens `canDispatch:true`, `canMutateLiveWorld:true`, `authority:"R2"`, and `authority:"R3"`: 0 occurrences.
- Both ZekNova and Sentinel authority-readiness suites: PASS 13/13.

## Successor changes reviewed
- Mission and boss readiness fixes remain covered by `scripts/check-source.mjs`.
- Picasso visual expert, theme manager, and expert router are R0 visual-only. Their authority object denies dispatch, mutation, command execution, and gameplay writes.
- Dedicated Picasso tests PASS; 300 deterministic profile switches completed with no diffusion-per-frame path.
- Full ZekNova test suite and animation audit PASS.
- `src/main.js` remains `1055917bf5f8b51bc009be8000e6ed5629f9a93d2dd4546932f8d3d6f4894c84`.
- `StrategicStateClock.js` remains `38744f6bb0f09a19cb879d1842c491c573ab9191e21089c46769f509c40d81dc`.

## Result
- Classification: FULL_REBUILD_WITH_R0_VISUAL_EXPERT_PLUS_MISSION_AND_RUNTIME_CHANGES
- Runtime rebaseline remains exact-hash-bound and requires the final review gate.
- `RUNTIME_REBASELINE_REVIEW_ELIGIBLE=false` until that gate emits procedural and substantive PASS.
- No authority escalation; Online-R0 remains shadow-only and measurement-only.
