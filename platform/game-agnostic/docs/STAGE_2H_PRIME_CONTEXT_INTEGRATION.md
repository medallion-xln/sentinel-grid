# Stage 2H — shadow expert consumption and Prime context integration (R0)

Stage 2H proves that Prime can deterministically consume certified Oracle and Nexus
output as **bounded evaluation context** while remaining the sole decision owner.

Authority is unchanged: **R0**, `canDispatch=false`, `canMutateLiveWorld=false`.
The incumbent scripted ZekNova AI remains the sole live executor.

**Stage 2H does not claim that expert context improves play.** It certifies safe,
bounded, deterministic consumption. Whether a changed evaluation is *better* is an
evaluation question for a later stage, and nothing here asserts it.

## What was added

| Path | Role |
|---|---|
| `src/experts/expert-context.js` | Bounded context envelope, feature derivation, clamped adjustment |
| `src/lab/stage2h-prime-context-certification.js` | Scenarios, shadow comparison, gates, certification |
| `scripts/certify-stage2h-prime-context.mjs` | Certification entry point (`--check` re-verifies) |
| `tests/stage2h-prime-context.test.js` | 24 deterministic tests (matrix A–P) |

Prime and the recommendation packet were changed **additively**:

| Path | Change |
|---|---|
| `src/prime/root-puct.js` | Optional `expertContext` parameter; bounded leaf-evaluation adjustment |
| `src/core/recommendation.js` | Optional `expertContext` provenance block |

## Architecture

```
Canonical State
      |
      +----------------+
      |                |
   Oracle           Nexus          (Stage 2G, unchanged)
      |                |
      +-------+--------+
              |
   Expert Context Envelope         (bounded, frozen, digest-bound)
              |
   LEGAL ACTION FILTER  ← untouched by context
              |
            PRIME / PUCT           ← sole decision owner
              |
      R0 RECOMMENDATION
```

The envelope carries no action, no target, no priors and no callable handle. It
**cannot name an action**, so it cannot select or dispatch one. `validateExpertContextEnvelope`
rejects an envelope carrying any of `action`, `actionKey`, `selected`,
`selectedAction`, `priors`, `prior` or `targetEntityId`.

## Bounded adjustment

Eight fixed context features are derived from the certified expert signals:

```
temporalRisk  temporalOpportunity  stability  volatility
dependencyRisk  criticality  supportStrength  isolationRisk
```

```
oracleRaw = temporalOpportunity − temporalRisk − volatility
nexusRaw  = supportStrength − dependencyRisk − criticality − isolationRisk

basePrimeValue + boundedOracleAdjustment + boundedNexusAdjustment = contextAdjustedValue
```

| Bound | Micro-units | Value |
|---|---|---|
| `ORACLE_ADJUSTMENT_BOUND_MICRO` | 20000 | 0.02 |
| `NEXUS_ADJUSTMENT_BOUND_MICRO` | 20000 | 0.02 |
| `TOTAL_ADJUSTMENT_BOUND_MICRO` | 30000 | 0.03 |

The combined bound is deliberately **less** than the sum of the parts (0.04), so
the total clamp is a real reachable guard rather than arithmetic decoration — both
clamps are proven by test at their exact boundary.

Two design points worth stating plainly:

- **Neutral-at-zero by construction.** An all-zero feature set yields exactly 0, so
  a neutral context leaves Prime's decision bit-identical.
- **`stability` is reported but not weighted.** It is the exact complement of
  `volatility`, so weighting both would double-count one fact.

All arithmetic is integer fixed-point using only IEEE-754 correctly-rounded
operations. No wall clock, no RNG, no transcendental functions — enforced by test.

## Baseline mode

`expertContext` absent, `null`, or `undefined` all reproduce pre-Stage-2H Prime
**bit-exactly**, and the baseline packet gains no `expertContext` key at all.

This was verified beyond the test suite: with the Stage 2H changes reverted, the
kernel's whole-suite deterministic evidence hash is `3aedfedc…` — *identical* to the
hash with Stage 2H present. Stage 2H changes nothing about baseline behaviour.

## Shadow comparison — what was actually measured

8 scenarios × 4 search fixtures = 32 comparisons.

| Scenario | Adjustment (micro) | Decision changed |
|---|---|---|
| neutral | 0 | 0/4 |
| oracle-only-rising | +11111 | 4/4 |
| oracle-only-falling | −20000 | 4/4 |
| nexus-only-supported | +20000 | 4/4 |
| nexus-only-isolated | −20000 | 4/4 |
| combined | +4091 | 4/4 |
| max-positive | +30000 (clamped) | 4/4 |
| max-negative | −30000 (clamped) | 4/4 |

```
comparisons            32
decisionsChanged       28
decisionsUnchanged      4   (all four neutral)
selectionsChanged       0
```

**A note on two different "changed" metrics.** A context-consuming packet always
carries an extra provenance block, so its packet hash necessarily differs even when
the search outcome is identical. Stripping that block isolates the real question.
`decisionChanged` (ranking, visits, mean values, selection) is the metric the gates
use; the raw packet-hash difference is reported separately and is always true when
context is consumed.

`selectionsChanged = 0` is a measured observation, not a designed guarantee: across
these fixtures the bounded adjustment moved evaluation values and visit
distribution without flipping the selected action. Do not read it as a safety
property — the safety properties are the clamp, the legal-action invariant, and
Prime's retained ownership.

## Gates

| Gate | Result |
|---|---|
| A — baseline disabled | Bit-exact vs legacy Prime; no context key in packet |
| B — neutral context | Adjustment exactly 0; decision bit-identical |
| C — Oracle-only | Deterministic bounded adjustment, Nexus at 0 |
| D — Nexus-only | Deterministic bounded adjustment, Oracle at 0 |
| E — combined | Deterministic bounded composition |
| F/G — clamps | Both boundaries hit exactly, by real and synthetic extremes |
| H/I — malformed expert output | Rejected |
| J/K — runtime / campaign substitution | Rejected |
| L — expert digest substitution | Rejected |
| M — legal-action integrity | `legalActionsHash` and count identical in all 32 |
| N — authority forgery | `canDispatch`, `canMutateLiveWorld`, tier `R2` all rejected |
| O — replay | Identical inputs reproduce identical Prime results |
| P — portability | **PASS** — darwin + linux (arm64 and x64) |

16 negative gates, all rejecting.

## Portability

```
digest 967e9e13abe30daae47252048c493103d3d6ca6fd082bf247c9b99fe14ef124a
```

| platform | arch | tests | digest |
|---|---|---|---|
| darwin | arm64 | 24/24 | `967e9e13…ef124a` |
| linux | arm64 | 24/24 | `967e9e13…ef124a` |
| linux | x64 | 24/24 | `967e9e13…ef124a` |

Both Stage 2H artifacts are byte-for-byte identical across platforms:

```
stage2h-certification-result.json  154835177c359dd4fa3088d39efb116028935c4bc0b0af79394013beac8e5a5c
stage2h-portability-report.json    b3e5f109cacc298bb1efccbe77acb5793f03716e42717b603612560640adc54e
```

`portabilityStatus` is derived, never asserted: the script re-compares every
recorded digest against the digest computed in the running process, and any
platform that stops reproducing turns the status to `FAIL`.

## Commands

```bash
npm run test:stage2h-prime-context
npm run prime:stage2h:certify
npm run prime:stage2h:check
```

## Explicitly out of scope

Prime's priors are still `uniform` — expert signals never become action priors.
The Router remains outside the certified Prime path. Action-specific expert
mappings are the boundary for a later substage, as is any evaluation of whether
expert context improves decision quality.
