# Sentinel Grid — Ten-Stage Game-Agnostic Roadmap

## Stage 0 — Universal deterministic kernel

Build canonical contracts, deterministic hashing and randomness, R0 authority denial, legal-action enforcement, recommendation packets, and replay metadata.

**Exit:** One reference adapter produces deterministic legal R0 recommendations and exact replay.

## Stage 1 — Adapter SDK and Certification Lab

Provide reusable adapter definitions, TypeScript interfaces, JSON schemas, conformance checks, negative fixtures, performance hooks, verification scripts, and a second structurally different reference adapter.

**Exit:** Two unrelated games pass without kernel modifications.

## Stage 2 — First production adapter: ZekNova parity

Wrap the certified 592-feature observation, private knowledge, six-action legality, targets, clone/step, outcome, and shadow telemetry behind the universal SDK.

**Exit:** Existing Stage 1A-Z behavior is reproduced through the generic kernel with no authority increase.

## Stage 3 — Universal multistep simulation

Support variable horizons, simultaneous decisions, deterministic seeded stochastic events, chance nodes, terminal states, outcome vectors, and adapter-specific simulation fidelity tiers.

**Exit:** Certified multistep transition parity in at least two production-grade game environments.

## Stage 4 — Universal Sentinel Prime

Advance from root-only PUCT to multistep PUCT/MCTS, hierarchical actions, transpositions, belief-state search, bounded rollout policies, and adapter-provided objective scalarization.

**Exit:** Prime independently beats approved baselines in every certified game domain where it is promoted.

## Stage 5 — Universal Expert SDK

Standardize expert packets for Vanguard, Oracle, Horizon, Nexus, Strategist, and future experts. Separate game-specific encoders from universal calibration, attribution, ablation, and failure handling.

**Exit:** Experts can be independently enabled, disabled, benchmarked, and versioned without changing game adapters or Prime internals.

## Stage 6 — Temporal and relational intelligence

Deploy Oracle as an interpretable temporal baseline, Horizon as a learned temporal predictor, and Nexus as a relationship/dependency reasoner when a game exposes suitable history and graphs.

**Exit:** Each expert proves independent and integrated value on compatible games; unsupported games degrade safely.

## Stage 7 — Calibrated policy learning

Rebuild Vanguard from certified search targets with uncertainty, calibration, root-coverage protection, state-familiarity detection, and uniform-prior fallback.

**Exit:** Vanguard plus Prime beats uniform-prior Prime under equal compute budgets without suppressing rare critical actions.

## Stage 8 — Constrained mixture-of-experts routing

Introduce deterministic routing and adaptive compute first. Evaluate learned routing only after multiple experts independently pass promotion gates.

**Exit:** Better decision quality per unit of compute, complete attribution, safe expert disablement, and deterministic fallback.

## Stage 9 — Intelligence Lab and improvement planes

Expand Alexandria evidence/memory, Archimedes bounded critique, Forge isolated engineering, Picasso non-authoritative experience generation, replay/outcome datasets, model registry, federated candidate generation, shadow, canary, promotion, and rollback.

**Exit:** Reproducible candidate-to-promotion lifecycle across multiple games with no self-promotion or direct production writes.

## Stage 10 — Separately certified authority plane

Add optional per-game execution adapters only behind explicit human authorization, capability tokens, final legality revalidation, rate and resource limits, idempotency, emergency stop, rollback, and immutable audit evidence.

**Exit:** Authority can progress from R0 on a per-game and per-action-domain basis without changing the intelligence kernel or allowing any model to grant itself authority.

## Current roadmap position

Documentation reconciliation only — no historical evidence is rewritten here.

| Stage | State |
|---|---|
| Stage 2D-Z | Frozen ZekNova parity certified |
| Stage 2E-Z | Real-state capture and sustained-shadow machinery certified |
| Stage 2F | Runtime identity, provenance binding and campaign identity complete and certified. Runtime `sha256:bdc88a75…`, campaign `sha256:6fe9f8ab…`. The live qualification campaign itself is still **not** certified: it awaits provenance-verified live records under the current lineage. |
| Stage 2G | Sentinel Oracle + Sentinel Nexus certified as deterministic R0 experts. Portability PASS on darwin and linux. |
| Stage 2H | Shadow expert consumption and Prime context integration — certified. Prime consumes bounded expert context while remaining the decision owner. |
| Stage 2H.1 | Action-discriminating expert context — certified. Oracle and Nexus score individual legal actions within the unchanged 0.02/0.03 bounds; every ranking change is causally attributed. |
| Stage 2I–2K | Oracle V2 head architecture, bounded depth-2 Prime, and Nexus relational reasoning — certified as individual expert capabilities. |
| Stage 2L.0–2L.5 | Core triad shadow integration, counterfactual expert information, and the first deterministic Arbiter candidate. |
| Stage 2L.6 | **FAIL** — the first Arbiter failed adversarial evidence and trust-boundary testing: stale evidence, cross-observation mismatch, ambiguous binding, and unsafe expert consensus. |
| Stage 2L.7 | **PASS** — remediated. Evidence identity binding, runtime/campaign binding, expert and head eligibility, default-deny validation, malformed/stale/cross-runtime rejection, fail-closed behaviour, R0 preserved. |
| Stage 2L.8 | **PASS** — independent 20,020-case red-team replication. Prime 49.83%, Arbiter 52.36% (+2.53 pp), 507 selection changes, 0 harmful changes, 0 correct-Prime breaks. |
| Stage 2L.9 | **FAIL** — 20,500 cases. Prime 49.94%, Arbiter 61.48% (+11.54 pp), but 915 harmful changes against a 1.00% ceiling (4.46%). Correctness discrimination measured at −0.0038 (Oracle) and +0.0030 (Nexus): the Arbiter could prove evidence was *authentic* but had no signal for whether the expert was *correct*. |
| Stage 2L.10 | **PASS** — Arbiter correctness calibration and selective delegation. 22,750-case holdout, disjoint from an 8,450-case calibration corpus. Prime 54.81%, Arbiter 60.66% (+5.85 pp), 1,332 beneficial changes, **0 harmful changes**, **0 correct-Prime breaks**, delegation precision 1.000. Oracle correctness discrimination **+0.5651**, Nexus 0.0000 (abstains everywhere; whether that was remediable was left open and is settled by Stage 2L.11). Portability recorded on a single platform. |
| Stage 2L.11 | **PASS** — Nexus semantic identifiability and decision-utility certification. A measurement stage: it passes because it answered its question, not because Nexus turned out useful. 12,000-case holdout over twelve topology families, disjoint from a 6,000-case discovery corpus. `NEXUS_IDENTIFIABILITY_STATUS = NON_IDENTIFIABLE_CURRENT_TASK`. Best gap over 264 predicates spanning all four feature tiers was 0.0520, **below** the permutation-null median of 0.0593; a rule frozen on discovery fell from 0.5947 to 0.5242 out of sample against a 0.5338 base rate. Nexus delegations 0, harm 0, correct-Prime breaks 0. |
| Stage 2L.12 | **PASS** — Nexus semantic grounding and observable utility. A benchmark-remediation stage: it passes because Nexus evaluation became meaningful and reproducible, not because Nexus performed well. Ground truth is now computed from world state — entity value, capacity, availability, risk and cost across seven relation kinds, scored by a versioned objective function over five action kinds — replacing the independent `nexusAligned` draw entirely. 14,000-case holdout (5,261 decidable, 84,000 legal actions evaluated), disjoint from a 7,000-case discovery corpus. Best trivial baseline 0.393 against a 0.60 rejection gate. **Measured: Nexus 0.0844, Prime 0.3946** — the inherited expert beats neither random (0.1667) nor the best trivial baseline. `GROUNDED_NEXUS_IDENTIFIABILITY_STATUS = IDENTIFIABLE` but only from world state (gap 0.1526), not from Nexus output (0.0379, below the permutation null). Nexus delegations 0, harm 0. |
| Stage 2L.13 | **PASS** — Value-aware Nexus relational utility. A bounded expert remediation: the benchmark, the Arbiter, its calibration and every ceiling are untouched; only Nexus changes. A source audit confirmed the Stage 2L.12 diagnosis — of the eight quantitative semantic fields the canonical state carries, the inherited Nexus path read **none**, and ignored five of eight relation kinds. The remediated expert scores an auditable relational utility (`relationalBenefit + riskAdjustment − actionCostPenalty`) over structure crossed with value, cost and risk. On the frozen 5,261-case grounded benchmark: **Nexus 0.0844 → 0.7826**, overtaking Prime (0.3946), random 0.1667. `STRUCTURE_VALUE_DECOUPLED_ACCURACY` **0.0469 → 0.7520 (+70.51 pp)** across 4,093 cases. Nexus can now also discriminate its own correctness (gap 0.5475 vs null p95 0.1055; frozen rule held 0.9833 out of sample). But its best bucket reaches **0.9459** against the inherited **0.99** floor, so **delegations remain 0** and safe delegation is still unauthorised. Outcome `B_IMPROVED_NOT_SELF_CALIBRATED`. |
| Stage 2L.14 | **FAIL** — **current**. Nexus confidence calibration and safe selective delegation. A calibration stage that failed honestly: it asked whether a genuinely high-confidence Nexus region exists, and the answer measured out as no. Three disjoint splits carved from the frozen Stage 2L.12 corpus — `DEVELOPMENT` 5,261, `CALIBRATION` 5,232, `FINAL_HOLDOUT` 5,324 decidable cases — with only `CALIBRATION` permitted to select and `FINAL_HOLDOUT` scored once, after freezing. Nexus confidence is real and strongly ordered (`OBSTRUCTED` 0.7135 → best region 0.9832), but **no supported region on the 25-cell predeclared risk/margin grid reached the inherited 0.99 floor**. Cells that cleared it on `DEVELOPMENT` (0.9917 at n=121, 1.0000 at n=48) fell to 0.9691 and 0.9444 on a fresh calibration draw — the overfitting a two-way split would have shipped, since those same cells score 0.9926 and 0.9844 on the final holdout. `SELECTED = null`; the frozen parameters fall back to the most restrictive rung, not the best-measured one. **0 delegations, 0 harmful changes, 0 correct-Prime breaks, 172/172 harmful opportunities rejected**, and 2,332 beneficial opportunities deliberately forgone. Outcome `D_CONFIDENCE_DOES_NOT_GENERALIZE`, `FAILURE_MODE = FAILED_GENERALIZATION`. The 0.99 floor was **not** lowered — the certify script exits `2` on any attempt to weaken it. |
| Stage 3+ | Not started |

Authority remains **R0** at every stage above: `canDispatch=false`,
`canMutateLiveWorld=false`. The scripted ZekNova NPC AI is still the sole live
executor, and no authority increase is permitted before Stage 10.

### What Stage 2L.10 established

Delegation now requires two independent things, not one:

- **evidence validity** — is this legitimate Oracle/Nexus evidence for this exact
  decision? (Stage 2L.7, imported frozen, still holds the veto)
- **expert correctness confidence** — given legitimate evidence, how justified are
  we in believing this expert should replace Prime?

The second is answered by expert-emitted correctness attestations mapped to
deterministic uncertainty buckets, each carrying a reliability measured only on
the calibration corpus and gated at a floor fixed a priori from the inherited
harm ceiling. A valid expert that cannot establish decision-specific confidence
produces `ABSTAIN_FROM_DELEGATION`, never trust-by-default. Stage 2L.10
delegations are a strict subset of Stage 2L.7 delegations, so no inherited
protection can be weakened by construction.

### What Stage 2L.11 established

Stage 2L.10 left one question open: was Nexus's zero contribution a property of
Nexus, of the evidence contract, or of the task? Stage 2L.11 measured it and
found the *benchmark* was the defect — correctness was an independent seeded
draw, so no expert could be shown good or bad. `CONTRACT_INCOMPLETE` was
empirically excluded; `REMEDIATION_CLASS = CORPUS_SEMANTICS`.

### What Stage 2L.12 established

Stage 2L.12 repaired the benchmark and then re-ran the measurement.

Ground truth is now derived from deterministic world semantics — never drawn.
Topology, semantics and action sets come from three independent seeded streams,
so structural attractiveness and objective utility are free to disagree, and
eight semantic profiles ensure they frequently do (worthless bottlenecks,
expensive bottlenecks, value on low-degree leaves, risk-dominated worlds,
available substitutes). An anti-degeneracy gate rejects any corpus a trivial
heuristic could win; an earlier draft with `ALWAYS_HOLD` optimal 73.7% of the
time was rejected under it before any expert was evaluated.

Measured against the repaired benchmark, the inherited Nexus expert scores
**0.0844** where Prime scores **0.3946**, random is 0.1667 and the best trivial
policy is 0.3931. Its accuracy tracks the decoupling exactly: 0.1432 where
structure carries the value, 0.0225 where the value sits on a low-degree leaf.

Correctness is now partially predictable — a rule frozen on discovery held at
0.2581 on holdout against a 0.1383 base rate — but the predictive signal is
`baselineUtility`, world state the Arbiter does not receive. Every feature Nexus
itself emits falls **below** the permutation null.

`MEASURED_LIMITATION = EXPERT_SEMANTICS`: Nexus reasons about structure while
optimality is determined by value, cost and risk — quantities that are present in
the canonical state but that its contract does not read.

### What Stage 2L.13 established

Stage 2L.12 named the limitation `EXPERT_SEMANTICS` and stopped. Stage 2L.13 acted
on exactly that, and nothing else.

A source audit of the whole inherited Nexus path confirmed the diagnosis at the
line level: `objectiveValue`, `restorationCost`, `risk`, `protectionNeed`,
`availability`, `demand`, `baseCapacity` and `objectiveRelevant` were read by
nothing. Recommendation and confidence were functions of graph shape and two
booleans.

The remediated expert reasons about relational *utility* — value reached through
the dependency graph, priced against cost and risk, discounted for redundancy —
and emits an auditable decomposition rather than one opaque scalar. It lives in
its own file that imports nothing from the benchmark; the certify script refuses
to run if that ever changes. It remains an approximation, not the oracle: it picks
the optimal action 80% of the time but reproduces the true full ranking only 38.5%
of the time.

The decisive check is the identical-topology test. Under the inherited expert the
same graph always produced the same recommendation regardless of where the value
sat, which is why it failed. It no longer does.

Still open after Stage 2L.13, and carried into Stage 2L.14:

- **Nexus delegation remains unauthorised, and the blocker has moved.** It is no
  longer accuracy — Nexus now beats Prime by 39 points. It is *confidence*: the
  best eligible bucket reaches 0.9459 against the inherited 0.99 floor. Closing
  that gap needs better expert self-assessment, not better recommendations.
- **Nexus can now discriminate its own correctness**, which it could not at
  Stage 2L.12. The frozen rule held at 0.9833 out of sample against a 0.8041 base
  rate. It just does not reach the delegation standard.
- **The residual ~22% error concentrates in `VALUE_DIFFUSE` and `CYCLE`**, where
  the expert's single-pass, no-fixed-point approximation is weakest.
- **Only Oracle's direction head has a calibrated correctness signal.** The other
  six heads still cannot justify a delegation.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.13. It remains an explicit later certification item.
- Prime's priors are still uniform; the Router remains outside the certified Prime
  path.
- **Live ZekNova qualification remains uncertified** under the current lineage:
  0 accepted records, 0 accepted sessions, 0 accepted simulations,
  `thresholdsPass=false`, `certified=false`.

### What Stage 2L.14 established

Stage 2L.13 left the blocker precisely located: not accuracy, but *confidence*.
Stage 2L.14 tested whether that gap could be closed by calibration alone — with
the inherited 0.99 floor held fixed — and established that on this corpus it
cannot.

The stage's design is the result. A two-way split would have explored on one draw,
selected `R>=500000 / M>=300000` at 0.9917, scored **0.9927** on the holdout and
reported a pass. The three-way separation put a second, independent draw between
exploration and selection, and that draw scores the same cell at **0.9691**. Every
cell that cleared the floor on `DEVELOPMENT` lost it on `CALIBRATION`; several
regained it on the final holdout. High, low, high, at n in the tens to low
hundreds, is a region whose true rate sits near 0.97-0.98 with sampling noise on
either side — not a region that is genuinely >=0.99.

Three further things were measured and deliberately not acted on:

- **Structural ineligibility still overrides measurement.** Three of the six
  confidence buckets are ineligible a priori because the expert disclaims its own
  basis in them. That rule is inherited from Stage 2L.10, where a bucket measuring
  1.0 reliability was refused for the same reason.
- **The added multi-axis robustness probe is near-useless as a signal.** 98.1% of
  cases are fully robust, and that set is 0.8062 accurate against a 0.8041 base
  rate. It is recorded as `discriminativeValue: NEGLIGIBLE` and retained only as a
  fail-closed gate.
- **`nexusUtilityMargin` inverts at the top.** Above 3M, the expert's own margin is
  *negatively* associated with correctness (0.4396). Confidence is carried by
  `nexusTopRiskAdjustment`. Margin survives only as a secondary gate at
  predeclared values.

Still open after Stage 2L.14:

- **Selective Nexus delegation remains unauthorised**, and the limitation is now
  named precisely: it is neither the expert (2L.13), the benchmark (2L.12), the
  Arbiter, nor the expressiveness of the confidence contract. It is that this
  expert's achievable reliability ceiling on this corpus sits near 0.98, below a
  floor of 0.99. Prime keeps the recommendation on every case, forgoing 2,332
  measured beneficial opportunities to do so.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.14. Stage 2L.14 records the limitation and does not address it.
- Everything else open after Stage 2L.13 remains open. Stage 2L.14 changed no
  expert, no benchmark, no arbiter and no threshold.
