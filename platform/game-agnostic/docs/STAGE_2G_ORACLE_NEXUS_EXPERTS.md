# Stage 2G — Sentinel Oracle + Sentinel Nexus (R0 expert layer)

Stage 2G introduces the first game-agnostic certified expert layer in the kernel.
Two deterministic experts observe canonical inputs and emit bounded advisory
signals. Neither can dispatch, mutate, bypass Prime, or grant authority.

Authority is unchanged: **R0**, `canDispatch=false`, `canMutateLiveWorld=false`.
The incumbent scripted ZekNova AI remains the sole live executor.

## What was added

| Path | Role |
|---|---|
| `src/experts/expert-contract.js` | Shared expert contract: fixed-point signals, digests, authority isolation |
| `src/experts/oracle.js` | Sentinel Oracle — deterministic temporal expert |
| `src/experts/nexus.js` | Sentinel Nexus — deterministic relational expert |
| `src/lab/stage2g-expert-certification.js` | Stage 2F provenance inheritance, gates, certification |
| `scripts/certify-stage2g-experts.mjs` | Certification entry point (`--check` re-verifies) |
| `tests/stage2g-experts.test.js` | 33 deterministic tests |

## The expert contract

```js
evaluate({ canonicalState, observationHistory, legalActions, context })
// →
{ expertContractVersion, expertId, expertVersion, inputDigest,
  signalScale, signals, confidence, rationaleCodes,
  authority: { tier: 'R0', canDispatch: false, ... },
  advisoryOnly: true, outputDigest }
```

Outputs are deep-frozen. `outputDigest` is self-excluding: it is computed over
every field except itself, matching the convention that a document cannot contain
its own hash.

### Why the legacy AZL experts were not ported verbatim

`public_html/azl/azl-oracle.js` and `azl-relational.js` supplied the reusable
*algorithms* — OLS slope, second-difference acceleration, volatility, mean message
passing, bottleneck and isolation detection. They are not portable as written:

1. **Transcendental math.** ECMAScript specifies `Math.tanh`, `Math.exp`, `Math.log`
   and `Math.pow` only as implementation-approximated. Two conforming engines may
   differ in the last ULP, which would move a portability digest. Stage 2G uses only
   IEEE-754 correctly-rounded operations (`+ - * /`, `Math.sqrt`), with
   `squash(x) = x / (1 + |x|)` replacing `tanh`. A test asserts the forbidden
   functions do not appear in the expert path.
2. **Fixed point.** Every signal is an integer in micro-units (`SIGNAL_SCALE`
   = 1,000,000 represents 1.0). Floats never reach a digest.
3. **Wall clock.** Legacy staleness reads `U.now()`. Stage 2G takes no clock;
   recency is an integer tick delta carried by the input.
4. **Game coupling.** Legacy Oracle hardcodes ZekNova feature groups; legacy
   Relational infers adjacency from `x`/`y` distance. Stage 2G Oracle reads named
   numeric channels, and Nexus reads declared `{from, to, kind}` edges. Mapping a
   game onto channels and edges is adapter/canonicalization work.

## Sentinel Oracle

Per channel: `direction`, `slope`, `acceleration`, `volatility`, `persistence`,
`level`. Aggregate: frame and channel counts, `sufficientHistory`, `maxAbsSlope`,
`maxVolatility`, `repeatedStateRatio`, `tickSpan`.

Oracle does not predict. Below `ORACLE_MIN_FRAMES` (3) it emits zeroed metrics,
zero confidence and `ORACLE_INSUFFICIENT_HISTORY` rather than guessing. A channel
present in only some frames degrades to `ORACLE_PARTIAL_CHANNEL_HISTORY`.

## Sentinel Nexus

Entity and edge counts, isolation, unresolved dependencies, critical dependencies
(single points of failure), bottlenecks, threat/support balance, action-to-entity
coverage, max dependency depth, centrality, density, cycle detection.

Depth uses iterative DFS — recursion would be unbounded on adversarial graphs — is
cycle-safe, and caps at `NEXUS_MAX_DEPTH` (64). Graphs are bounded at
`MAX_ENTITIES` (512) and `MAX_EDGES` (4096); oversize inputs truncate
deterministically with `NEXUS_GRAPH_TRUNCATED`. Unknown edge kinds are ignored,
never guessed at.

## Stage 2F provenance inheritance

Stage 2G **extends** Stage 2F provenance and introduces no second campaign identity
system. Each evidence record embeds the Stage 2F qualification identity verbatim,
built by the existing `buildStage2FQualificationIdentity` owner:

```
sentinelRuntimeId · generatedRuntimeProvenanceId · stage2fCampaignId
sessionId · samplingIdentity · recordSchemaVersion · collectorSchemaVersion
+ observationId · recordId · expertId · expertVersion
+ expertInputDigest · expertOutputDigest
```

Certification fixtures carry `evidenceClass = STAGE2G_CERTIFICATION_FIXTURE` and
`countsTowardStage2FQualification = false`, so Stage 2G evidence can never inflate
a Stage 2F qualification threshold. `validateStage2GEvidenceRecord` rejects any
record that sets it true.

## Integration depth

Prime is **unmodified**. `recommend()` still uses a uniform prior; wiring expert
signals into it would change certified Stage 2F parity behaviour, so it is out of
scope for this pass. Stage 2G ends at a certified expert-output envelope:

```
canonical state → Oracle + Nexus → bounded signals
                → Stage 2G evidence envelope → shadow evaluation only
```

`primeIntegration = none-prime-unmodified`,
`routerIntegration = none-shadow-envelope-only`.

## Gates

| Gate | Result |
|---|---|
| A — baseline | 147/147 kernel tests pass (114 pre-existing + 33 new) |
| B — determinism | Oracle and Nexus byte-stable over 11 + 11 canonical cases |
| C — replay | Identical certified inputs reproduce identical digests |
| D — runtime binding | All 22 records bind the certified runtime and campaign id |
| E — authority isolation | R0 exact; 0 dispatches, mutations, escalations, tokens |
| F — negative | 13/13 forgery attempts rejected |
| G — portability | **PASS** — same digest on darwin and linux (arm64 + x64) |

Gate F covers tampered signals, forged authority, injected dispatch and
world-mutation keys, executable callbacks, out-of-range and non-integer signals,
substituted runtime/provenance/campaign identities, qualification inflation, and
escalated evidence authority.

## Commands

```bash
npm run test:stage2g-experts
npm run experts:stage2g:certify
npm run experts:stage2g:check
```

Artifacts are written under `artifacts/stage2g-experts/` only. No Stage 2F artifact
is read-modified-written by this stage, and `npm run runtime:r0:verify` reproduces
the same `sentinelRuntimeId` before and after.

## Cross-platform status

**PORTABILITY_STATUS = PASS.** `platformsPassed = [darwin, linux]`.

```
digest 6630d43f3c27c167c3152ebcd553ab49b18a77baa5233a6df675bb176d4588a1
```

Measured on three independent runs of the same source tree, all Node v22.22.2:

| platform | arch | tests | digest |
|---|---|---|---|
| darwin | arm64 | 32/32 | `6630d43f…4588a1` |
| linux | arm64 | 32/32 | `6630d43f…4588a1` |
| linux | x64 | 32/32 | `6630d43f…4588a1` |

Linux runs execute the same tree mounted read-only into
`node:22.22.2-bookworm-slim` with `--network none`, copied to a scratch directory
inside the container so the repository can never be written to from the container.

The x64 run is deliberate: Darwin is arm64, so a linux/arm64 match alone would not
distinguish platform portability from architecture coincidence. All three runs
agree, and the fixed-point contract is confirmed independent of both.

All three Stage 2G artifacts — certification result, expert evidence and
portability report — are now **byte-for-byte identical** across platforms:

```
stage2g-certification-result.json  3a86c4e352af67635ea0ed20070fe700ddb727ccf1bfe0ab4b4e2d28947b7e94
stage2g-expert-evidence.json       909e7a6630801f962574e2f4849d09b81d95077ff86ec5776a59be23238ee742
stage2g-portability-report.json    12a94a532c050d9df035c17613cf9c78cfcbf05e198800891e959b3c65a80072
```

`portabilityStatus` is **derived, never asserted**. `certify-stage2g-experts.mjs`
carries the recorded measurements and re-compares every recorded digest against the
digest computed in the running process: if any recorded platform stops reproducing,
the status becomes `FAIL` and the script exits non-zero rather than carrying a stale
PASS. A test (`stored portability artifact still reproduces its recorded digest`)
enforces the same property. Never edit a recorded digest to obtain agreement —
re-measure on the platform instead.

To re-measure Linux:

```bash
docker run --rm --network none \
  -v "$PWD:/src:ro" node:22.22.2-bookworm-slim \
  bash -c 'cp -R /src /work && cd /work && node --test tests/stage2g-experts.test.js && node scripts/certify-stage2g-experts.mjs'
```
