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

## Stage 3F reproducibility

Stage 3F certificates are byte-reproducible on every host under `SENTINEL_CANONICAL_NUMERICS_V1`, and every
verification is read-only. From a clean clone (Node.js ≥ 20, git):

```bash
npm run stage3f:evidence:rebuild   # rebuild every gitignored Stage 3F payload and verify its manifest hash
npm run stage3f:verify             # run every Stage 3F certifier --check under the canonical runtime
npm run stage3frp:check            # Stage 3F-RP reproducibility portability certificate
```

See `docs/STAGE3FRP_REPRODUCIBILITY_PORTABILITY.md`.

Stage 3F.6-CR reconciles the historical Stage 3F.6 claims, its erratum and the symmetric chain into one canonical claim
map and freezes `SENTINEL_DECISION_EVALUATION_CONTRACT_V1` (specification only): `npm run stage3f6cr:check`. See
`docs/STAGE3F6CR_CONFIRMATORY_RECONCILIATION.md`.

The formal Stage 3F freeze (`artifacts/stage3f-freeze/`) binds that record by hash as the immutable inheritance boundary
for Stage 3G: the immutable facts, Decision Evaluation Contract v1, the reproducibility contract, the Stage 3G entry
requirements, the nine-expert roster and R0 authority. `npm run stage3f-freeze:check` re-verifies it read-only. See
`docs/STAGE3F_FORMAL_FREEZE.md`.
