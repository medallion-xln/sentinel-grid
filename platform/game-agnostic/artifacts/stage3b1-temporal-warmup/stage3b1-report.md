# Stage 3B.1 — Forge World temporal warm-up and Oracle reachability

Status: **PASS** — `A_TEMPORAL_WARMUP_AND_ORACLE_REACHABILITY_CERTIFIED`

## The defect, and what it was not

Stage 3B recorded `ORACLE_AXIS_UNREACHABLE`: decisions were captured at tick 0,
where `world.history` holds exactly one frame, against an Oracle that needs three.
Every Oracle case abstained and router usefulness alignment fell to **0.0268**.

That was never an Oracle deficiency. The signal was in the world state — a
channel of 8 to 22 samples — and the expert could not reach it. Repairing it
means evolving the world before recording the decision, which changes every
world hash, which is why this is a new lineage rather than a patch.

A second defect surfaced while repairing the first, and it would have hidden the
repair: the eight-head assembly reads `frame.channels.alpha` and nothing else,
while Forge declares `primary`. Every head computed over an empty series and
abstained regardless of history length. The remedy is a declared channel mapping
at the adapter layer — `ORACLE_HEAD_CHANNEL_VOCABULARY_UNMAPPED` — and no head
was modified.

## Why 24 ticks, and not 18

The longest guard in the head contract opens at **18** frames.
The warm-up targets **24**.

The binding head is regimeChange. Its guard opens at 18 frames, so a warm-up of 17 ticks would clear every documented minimum — and would be exactly the mistake the stage forbids, because at 18 frames the head compares six-sample windows instead of the eight-sample windows it is built around. floor(n/3) reaches 8 at n = 24. The warm-up therefore targets 24 observed frames, which 24 ticks deliver on top of the tick-zero frame.

## The warm-up does not change the task

Probed across 45 scenarios spanning every topology shape:

- task preserved: **45/45**
- decision horizon preserved exactly: **45/45**
- channel clamped (flat history): **0**
- resources consumed: **0**, actors moved: **0**, entities killed: **0**
- objectives completed: **0**, legal actions changed: **0**, structure changed: **0**
- reached the full 24-tick target: **21**, shortened: **24** (TASK_CHANGED 24)

The only dynamic that ends a warm-up early is hostile degradation through an `attacks` relation crossing an availability threshold. Terrain hazards never fire during warm-up in this curriculum (no entity is placed on damaging terrain at tick zero), WAIT costs no energy, and nothing moves. Role mixes that declare hostiles (defended, scarce, populated) therefore support shorter warm-ups than those that do not (bare, redundant, industrial).

ORACLE_HEAD_REACHABILITY_CONFOUNDED_BY_ROLE_MIX: because truncation is caused by hostiles, the heads needing the longest history are measurable disproportionately in worlds without them. This is a property of the curriculum, not a defect introduced here, and it is reported so that no per-head rate is read as unconditional.

## The Oracle axis, per head

Never collapsed into one number.

| head | guard opens at | measurable at | guard cleared | positive claim | distinct outputs |
| --- | --- | --- | --- | --- | --- |
| `direction` | 3 | 3 | 0.9721 | 0.9721 | 3 |
| `volatility` | 4 | 4 | 0.9545 | 0.9545 | 2 |
| `timeToThreshold` | 4 | 5 | 0.9545 | 0.9545 | 4 |
| `abstention` | 5 | 5 | 0.9335 | 0.5846 | 1 |
| `persistence` | 6 | 6 | 0.8994 | 0.3707 | 2 |
| `reversal` | 8 | 9 | 0.8456 | 0.8456 | 2 |
| `cycle` | 8 | 18 | 0.8456 | 0.8456 | 2 |
| `regimeChange` | 18 | 24 | 0.7029 | 0.4788 | 3 |

Generic Oracle sufficiency: **0.9721** of 70804 records
(Stage 3B: **0**).

`CYCLE_HEAD_FIRES_ON_SMOOTH_TRENDS`: The cycle head selects the lag with the highest autocorrelation, and a smooth monotonic ramp is strongly autocorrelated at every lag, so it reports CYCLICAL on MONOTONIC_RISE and MONOTONIC_FALL histories. Measured here, not corrected: the head is frozen, and the declared family is not used as its ground truth.

## V1 versus V2 — a corpus effect, not a model claim

Prime, Nexus, Oracle, the Arbiter and the router are byte-identical between the two lineages, and no training was run in either. Every difference below is caused by which world state the decision was captured in. Describing any of it as a model improvement would be false.

| metric | V1 | V2 |
| --- | --- | --- |
| oracleCases | 0 | 289 |
| oracleSufficientRate | 0 | 0.9633 |
| routerAlignment | 0.0268 | 0.932 |
| historyFramesAtDecision | 1 | 25 |
| primeOptimumRate | 0.2207 | 0.2267 |
| primeLegalRate | 1 | 1 |
| nexusStructuralRate | 1 | 1 |
| horizonAlignedOptimumRate | 0.8684 | 0.8831 |
| horizonDependentOptimumRate | 0 | 0 |

## Corpus V2

- admitted: **70804** of 72000 generated, **1196** rejected
- unique topologies: **65307**
- effective dataset size: **62377** (the least-varied dimension, never the raw count)
- splits: TRAIN 50860, OOD 7144, VALIDATION 6509, HOLDOUT 6291
- cross-split world overlap: **0**, topology leakage: **0**
- temporal families realised on the observed history: **0.9786**

A family that does not show up is almost always a warm-up truncated too short for the family to express itself — a one-tick history cannot exhibit a level shift. Those records carry temporalFamilyRealized=false and the family name is not treated as ground truth for them.

## Determinism

Replay compares **every warm-up frame**, not just the decision state: 286 frames across 15 probes, all identical.

Shard independence is checked, not assumed: 60 records rebuilt in a single process
through the same builder the four workers used, **60** matching by record hash.

## Authority

`AUTHORITY=R0`, `CAN_DISPATCH=false`, `CAN_MUTATE_LIVE_WORLD=false`. The dispatch
probe was **attempted** and refused (`AuthorityError`) — a zero that was never
attempted would prove nothing. The warm-up never consults a Sentinel expert and
never writes to `world.history`; the frozen kernel owns every frame.

**No model was trained. No expert was modified. Soup was not invoked.**

Certification hash: `1fd230523adbde9dc5e1971cb07637be9e9dc741b5a51b1d6f0e90b4966bab74`

