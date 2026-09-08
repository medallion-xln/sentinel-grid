# Stage 2L.12 — Nexus semantic grounding, observable utility, and relational correctness certification

**Status: PASS** · `SEMANTIC_GROUNDING_VALID = true` · `GROUNDED_NEXUS_IDENTIFIABILITY_STATUS = IDENTIFIABLE`
Authority R0 · `canDispatch=false` · `canMutateLiveWorld=false` · Prime remains the decision owner.

> **A PASS here certifies the BENCHMARK, not the expert.** Stage 2L.12 passes because
> Nexus evaluation became scientifically meaningful and reproducible. Measured
> against the repaired benchmark, the inherited Nexus expert performs **poorly**,
> and that finding is reported rather than hidden.

## What was broken

Stage 2L.11 proved the benchmark itself was the defect. Nexus correctness was
decided by `nexusAligned` — an independent seeded draw, statistically independent
of every legitimate decision-time observable. Under that benchmark no expert
could ever be shown good or bad. `REMEDIATION_CLASS = CORPUS_SEMANTICS`.

## What replaced it

Ground truth is now **computed from world state**, never drawn:

```
entities   value, demand, capacity, availability, risk, protectionNeed, cost
relations  depends, supports, protects, inhibits, amplifies, substitutes, conflicts
objective  U(state) = delivered value + amplification − risk penalty − conflict penalty
actions    RESTORE, REINFORCE, PROTECT, BYPASS, HOLD  (pure clone-then-edit)

ACTION_UTILITY   = U(after) − U(before) − cost
GROUND_TRUTH     = argmax ACTION_UTILITY,  ties broken by canonical action key
```

Delivery is resolved by iteration to a fixed point, so cycles terminate
deterministically instead of depending on traversal order. Every quantity is a
fixed-point integer in micro-units.

Nothing in that chain consults Nexus, Prime, the Arbiter, or a correctness flag.

### The structural guarantee against re-cheating

Topology, semantics and action sets are drawn from **three independently derived
seeded streams**. An entity's shape in the graph and its worth to the objective
are sampled separately, so *structurally attractive* and *objectively optimal* are
free to disagree — and eight semantic profiles make sure they often do:

| profile | what it decouples |
|---|---|
| `VALUE_ON_BOTTLENECK` | structure and utility agree (the easy case) |
| `VALUE_ON_LEAF` | a low-degree node holds the value |
| `BOTTLENECK_WORTHLESS` | the single point of failure feeds nothing valuable |
| `EXPENSIVE_BOTTLENECK` | structurally critical, but repair costs more than it returns |
| `RISK_DOMINATED` | the best action removes exposure, not a dependency |
| `CAPACITY_STARVED` | the best action adds capacity, not availability |
| `SUBSTITUTE_AVAILABLE` | bypassing beats repairing |
| `VALUE_DIFFUSE` | no single target dominates |

The generator uses randomness to **create worlds**. It never uses randomness to
decide whether an expert is right. That distinction is tested, not asserted.

## Ground-truth validation (Phase 5)

| | |
|---|---|
| holdout cases | 14,000 |
| legal actions evaluated | 84,000 |
| deterministic / replay / ordering / serialisation invariant | **all true** |
| tie rate | 0.0000 |
| decidable cases | 5,261 (37.6%) |
| optimal-action kinds | RESTORE 2,310 · PROTECT 1,561 · REINFORCE 1,086 · BYPASS 304 |
| max single-kind share | 0.439 |
| hidden correctness fields | **none** |
| utility margin p10 / p50 / p90 | 24,893 / 458,568 / 1,087,171 |

### Trivial-heuristic baselines — the anti-degeneracy gate

A benchmark a dumb rule can win is not a benchmark. Every trivial policy was
measured on the decidable subset:

| policy | accuracy |
|---|---|
| `HIGHEST_OBJECTIVE_VALUE_TARGET` | **0.3931** ← best |
| `PREFER_RESTORE` | 0.3391 |
| `CHEAPEST_ACTION` | 0.2336 |
| `HIGHEST_DEGREE_TARGET` | 0.2220 |
| `FIRST_ALPHABETICAL` | 0.1988 |
| `LOWEST_DEGREE_TARGET` | 0.1585 |
| `ALWAYS_HOLD` | 0.0000 |
| random choice | 0.1667 |

Best trivial baseline **0.393**, under the 0.60 rejection threshold. Nothing
degenerate dominates, and purely structural targeting (highest degree) gets only
0.222 — the topology shortcut is closed.

An earlier draft of this corpus had `ALWAYS_HOLD` optimal 73.7% of the time and
was rejected under this same gate before any expert was evaluated.

## Nexus blind evaluation (Phase 6)

The **inherited** Nexus expert, unmodified. Its policy is the honest relational
one: rank candidate targets by the criticality its own analysis assigns them. The
reachability question is deliberately **value-blind** — dependency roots and sinks
in lexicographic order — because aiming it at the highest-value entity would hand
Nexus the answer's location. Nexus receives the complete canonical state including
`objectiveValue`, `restorationCost` and `demand`; its contract simply does not
read them.

| | |
|---|---|
| decidable cases | 5,261 |
| **Nexus accuracy** | **0.0844** |
| Nexus accuracy when it recommends | 0.1383 |
| Nexus abstention rate | 0.3899 |
| **Prime accuracy** | **0.3946** |
| Nexus/Prime agreement | 0.1114 |
| Nexus correct, Prime wrong | 311 |
| Nexus wrong, Prime correct | 1,943 |
| both correct | 133 |
| both wrong | 2,874 |
| beats random (0.1667)? | **no** |
| beats best trivial baseline (0.3931)? | **no** |

### The pattern is exactly what the decoupling predicts

| semantic profile | Nexus accuracy |
|---|---|
| `VALUE_ON_BOTTLENECK` — structure carries the value | **0.1432** |
| `RISK_DOMINATED` | 0.1251 |
| `VALUE_DIFFUSE` | 0.0621 |
| `EXPENSIVE_BOTTLENECK` — critical but not worth repairing | 0.0580 |
| `BOTTLENECK_WORTHLESS` — the SPOF feeds nothing | 0.0479 |
| `SUBSTITUTE_AVAILABLE` | 0.0296 |
| `VALUE_ON_LEAF` — value on a low-degree node | **0.0225** |

Nexus does best where structural criticality coincides with objective value and
worst where the corpus pulls them apart. That is a coherent, interpretable
signature — the benchmark is measuring the right thing.

## Identifiability (Phase 7)

Stage 2L.11's methodology, re-run against world-derived correctness. Conditioned
on Nexus having actually recommended (an abstention is scored incorrect, so
leaving abstentions in lets the abstention flag "predict" the label by
construction rather than by information).

| | |
|---|---|
| cases (after conditioning) | 3,210 · coverage 0.610 |
| base rate | 0.1383 |
| **best signal** | `context.baselineUtility <= 848218` |
| **best discrimination** | **0.1526** |
| permutation null median / p95 | 0.0700 / 0.0871 |
| exceeds null p95? | **yes** |
| frozen rule, discovery → holdout | 0.2899 → **0.2581** (base rate 0.1383) |
| generalizes out of sample? | **yes** |
| reaches the 0.99 delegation floor? | **no** |

**`GROUNDED_NEXUS_IDENTIFIABILITY_STATUS = IDENTIFIABLE`** — but only partially.
Correctness is genuinely predictable above chance and the rule survives holdout,
yet nowhere near the standard selective delegation requires.

### Where the signal lives — and where it does not

| tier | best gap |
|---|---|
| `TIER_WORLD_STATE` | **0.1526** |
| `TIER_NEXUS_OUTPUT` | 0.0379 |

This is the sharpest finding of the stage. The predictive signal is
`baselineUtility` — *how bad the current world already is* — which is world state
the Arbiter does not currently receive. **Every feature Nexus itself reports falls
below the permutation null (0.0379 < 0.0871).** Nexus cannot tell you when Nexus
is right.

### Leakage controls

Two features were removed during development after being caught as leakage:

- `utilityMargin` — the gap between optimal and runner-up. Computing it
  presupposes the answer. Removed, and the leakage scan hardened to catch
  derived-from-answer quantities by name.
- `family` / `profile` / `objectiveType` — labels of the *process that built* the
  world, not observations of it. Conditioning on them would be the corpus-index
  shortcut this stage exists to rule out. Removed from the feature vector, kept
  for stratified reporting only.

`baselineUtility` was kept: it is `U(current state)`, knowable before any action
is scored, and does not indicate which action is best.

## Delegation (Phase 8)

The Stage 2L.10 frozen calibration applied **unchanged**. No ceiling lowered, no
bucket re-fitted, no delegation forced.

| | |
|---|---|
| Nexus delegating buckets | none |
| **Nexus delegations** | **0** |
| harmful changes / harm rate | 0 / 0.000000 |
| correct-Prime breaks / rate | 0 / 0.000000 |
| harm ceiling respected | yes |

Zero delegations is the correct outcome: no bucket clears the 0.99 floor, and the
identifiable signal is not in Nexus's output anyway.

## Outcome class

**Class B** — `SEMANTIC_GROUNDING_VALID=true`, `NEXUS_IDENTIFIABLE=true`,
`NEXUS_SAFE_DELEGATION=false`.

The benchmark is now valid and correctness is partially predictable, but the
inherited expert is not accurate enough for safe delegation, and the usable
signal is not one Nexus emits.

**`MEASURED_LIMITATION = EXPERT_SEMANTICS`.** Not the corpus (repaired here), not
the evidence contract (Stage 2L.11 excluded it empirically), not the Arbiter. The
limitation is that Nexus reasons about *structure* while optimality is determined
by *value, cost and risk* — quantities present in the canonical state that its
contract does not read.

## Limitations

- The conclusion is scoped to this objective model (`STAGE2L12_DELIVERED_VALUE_MINUS_RISK_V1`)
  and this action vocabulary. A different objective could rank experts differently.
- `RISK_DOMINATED` (1,702) and `VALUE_DIFFUSE` (1,336) are over-represented among
  decidable cases relative to `VALUE_ON_LEAF` (89). All profiles are present; the
  distribution is uneven and is reported rather than rebalanced post hoc.
- Nexus's action policy is one defensible reading of a structural expert. A
  different value-blind policy might score differently; the policy is stated in
  full so it can be challenged.
- Portability remains `DIGEST_PRODUCED_SINGLE_PLATFORM` (linux/x64, Node
  v22.22.2) for 2L.10, 2L.11 and 2L.12.
- No live ZekNova decision delta is measured or claimed.

## Reproduction

```
npm run nexus:stage2l12:certify
npm run nexus:stage2l12:check
npm run test:stage2l12-semantic-grounding
```
