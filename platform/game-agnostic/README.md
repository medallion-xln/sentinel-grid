# Sentinel Grid Kernel — Stage 0 through Stage 2F-Z

Sentinel Grid is a game-agnostic deterministic decision-intelligence kernel. Stage 2F-Z hardens ZekNova sustained-shadow certification with provenance-locked live campaigns, self-hashed session manifests, duplicate and sequence-chain rejection, deterministic holdout cohorts, controlled candidate-vs-baseline evaluation, latency and safety stop rules, and a human-reviewed decision packet that can never grant execution authority.

## Certified platform state

- Kernel: `@sentinel-grid/kernel@0.9.0`
- ZekNova production adapter: registered and locked
- Frozen Stage 1A-Z parity: certified
- Stage 2E-Z real-state/shadow machinery: certified
- Stage 2F-Z campaign and controlled-evaluation machinery: certified
- Authentic live sustained-shadow campaign: pending captures
- Controlled candidate evaluation: blocked until the live campaign passes
- Authority promotion: unavailable
- Authority: R0
- Scripted ZekNova NPC AI: sole executor

## Core commands

```bash
npm test
npm run parity:zeknova
npm run shadow:zeknova:framework
npm run shadow:zeknova:stage2f:framework
npm run verify
./verify.sh
```

Evaluate a real Stage 2F-Z workspace:

```bash
npm run shadow:zeknova:stage2f:campaign -- \
  --records /path/to/records \
  --sessions /path/to/sessions \
  --candidates /path/to/candidates \
  --output /path/to/evidence/stage2f-latest.json
```

Only records with `source.kind = "live-runtime"`, `productionEligible = true`, valid build/repository hashes, and matching self-hashed session manifests count toward the production campaign. Replay or synthetic records are quarantined. Candidate evaluation can recommend only controlled R0 shadow review; it cannot execute, dispatch, mutate the world, or authorize a higher authority tier.
