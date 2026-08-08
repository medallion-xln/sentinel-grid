# R8-R3-R2 Report — Proceed Steps 1,2,3

## Status
- Proceed 1,2,3 requested by user at 2026-08-07.
- Sandbox limits: writes to sibling `zeknova-shared-gaming-experience` denied; `sentinel-grid` writable. `ps` and `kill` blocked.

## Step 1 — Freeze listener 8790
- `lsof -iTCP:8790` → `php 66196 LISTEN 127.0.0.1:8790`
- `kill 66196` / `kill -9 66196` → `Operation not permitted`
- `pkill` → `sysmond service not found`
- Collector port 43127 → no listener (PASS)
- `runtime-collector/server.mjs` → NO_MATCH (PASS)
- Authority → R0

**Result:** Procedural FAIL — 8790 must be cleared manually outside sandbox (`kill 66196` in unsandboxed Terminal, or `lsof -tiTCP:8790 | xargs kill`).

## Step 2 — Runtime delta forensics (current 39276d)
- R7 certified: `7c97573c60f2f04830ec72d5a9cf7ba7a9f4d2055c36458fac8ca46fdb4812a7` 1302376 bytes
- HEAD (forensics): `c227d31da80a41ed8743864a9f0228927995082de27fa1dbeba3db8d60730210` 1162996 bytes
- CURRENT: `39276d3b10e8323f25148bf38e1b226a644b32c8fa3a523c88ef54305d21a5f2` 1330657 bytes
- Delta R7→CURRENT: 28281 bytes, 409921 differing offsets; HEAD→CURRENT: +167661 bytes at ~807374 (`createCampaignTiers` new import).
- Boss-loader substitution still present (Ancient→InsectKing), but FULL_REBUILD adds Missions.js biome-objective restructuring, Game.js `localQaOfficer`+`?qaRank`, etc.
- Sentinel anchors: `getAdvisorTelemetry` 2/2, `getStrategicStateQuantum` 0/0 → unchanged. No authority change.
- Classification: `FULL_REBUILD_WITH_BOSS_LOADER_PLUS_MISSION_AND_RUNTIME_CHANGES` — NOT `BOSS_VISUAL_LOADER_REBUILD_ONLY`. `REBASELINE_REVIEW_ELIGIBLE=false` until new mission-aware forensics approves 39276d.

## Step 3 — Self-test patch
- Cause: `HISTORICAL_ENVELOPES_PREDATE_STATE_IDENTITY` — 6 parity fixtures lack stateIdentity, legacy `sourceStateHash` valid.
- Isolated candidate: hydrates `envelope.metadata.stateIdentity` + `snapshotId` + `legacyEvidence.stateIdentity` from `sourceStateHash` (verified `^[a-f0-9]{64}$`), in-memory only. Tested single + all-6 fixtures PASS.
- Patch: one file `sentinel-grid/live-parity/runtime-collector/tests/self-test.mjs` (80→94 lines)
  - Orig SHA: `ecefd85ecb8f23f2606a93a20f6a3becb7c660871c2a209d80cf4a535406873e`
  - Patched SHA: `d2e90525848064627e2fb136667912955779efb0be3d773d86890efe668a41f6`
  - Patch SHA: `eeb6f8c287f13747a74c177e7c69560cf228cf9486868b2d22bdc00c2e351710`
- Sandbox blocked write to zeknova path; patched file staged in `.tmp-r8-r3-r2/` for manual apply.

## Manual apply instructions (outside sandbox Terminal)
```bash
# 1. kill 8790 listener
lsof -iTCP:8790 -sTCP:LISTEN -n -P
kill 66196  # or lsof -tiTCP:8790 | xargs kill

# 2. apply patch
cp /Users/dwaynecampbell/Desktop/sentinel-grid/.tmp-r8-r3-r2/self-test.mjs.patched \
   /Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience/sentinel-grid/live-parity/runtime-collector/tests/self-test.mjs
shasum -a 256 /Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience/sentinel-grid/live-parity/runtime-collector/tests/self-test.mjs
# expect d2e90525848064627e2fb136667912955779efb0be3d773d86890efe668a41f6

# 3. verify
node /Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience/sentinel-grid/live-parity/runtime-collector/tests/self-test.mjs \
     /Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic

# 4. new forensics for 39276d (mission changes) before rebaseline
```

## Next
- After manual kill + patch verify, re-run R8-R6/R8-R7 with `ps` Alternative (`lsof` frozen snapshot) and full mission forensics.
