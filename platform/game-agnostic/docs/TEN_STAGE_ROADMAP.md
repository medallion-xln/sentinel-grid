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
| Stage 2L.14 | **FAIL** — Nexus confidence calibration and safe selective delegation. A calibration stage that failed honestly: it asked whether a genuinely high-confidence Nexus region exists, and the answer measured out as no. Three disjoint splits carved from the frozen Stage 2L.12 corpus — `DEVELOPMENT` 5,261, `CALIBRATION` 5,232, `FINAL_HOLDOUT` 5,324 decidable cases — with only `CALIBRATION` permitted to select and `FINAL_HOLDOUT` scored once, after freezing. Nexus confidence is real and strongly ordered (`OBSTRUCTED` 0.7135 → best region 0.9832), but **no supported region on the 25-cell predeclared risk/margin grid reached the inherited 0.99 floor**. Cells that cleared it on `DEVELOPMENT` (0.9917 at n=121, 1.0000 at n=48) fell to 0.9691 and 0.9444 on a fresh calibration draw — the overfitting a two-way split would have shipped, since those same cells score 0.9926 and 0.9844 on the final holdout. `SELECTED = null`; the frozen parameters fall back to the most restrictive rung, not the best-measured one. **0 delegations, 0 harmful changes, 0 correct-Prime breaks, 172/172 harmful opportunities rejected**, and 2,332 beneficial opportunities deliberately forgone. Outcome `D_CONFIDENCE_DOES_NOT_GENERALIZE`, `FAILURE_MODE = FAILED_GENERALIZATION`. The 0.99 floor was **not** lowered — the certify script exits `2` on any attempt to weaken it. |
| Stage 2L.15 | **FAIL** — Nexus decision stability, counterfactual consistency and confidence-ceiling evaluation. Tested whether surviving legitimate perturbation identifies a smaller region at >=0.99. Eight heterogeneous perturbation families, 15 probes per case, seeded from a digest of world CONTENT only; validated before use — the benchmark's own optimum survives **99.30%** of perturbations, and objective identity and graph shape survive 100%. Stability **is** a real signal: out-of-sample discrimination rises from **0.6245 to 0.6744** (+0.0499), so `STABILITY_ADDS_INFORMATION=true`. One rule of 406 cleared the floor on CALIBRATION (`risk>=400k & margin>=100k & marginVariance<=20k`, 0.9910 at n=111) and was frozen and carried to the final holdout, where it delegated **94 times at 0.9894** — one harmful change, and **below the inherited 0.99 floor**. Every other gate passed; the stage fails on 0.0006 of precision. Outcome `B_STABILITY_IMPROVES_CONFIDENCE_BUT_BELOW_FLOOR`. Estimated ceiling **0.9606** (conservative bound), limitation class `RESIDUAL_EXPERT_ERROR`: inside the high-confidence region the four errors are *more* stable than the successes (margin variance 30074 vs 31140), so no rule built from these signals can exclude them. The floor was not lowered and the statistical method was not changed. |
| Stage 2L.16 | **PASS** — Nexus residual error decomposition and risk-aware reasoning diagnosis. A diagnostic stage: it passes because it explained the residual errors reproducibly and changed nothing, not because Nexus improved. 3,308 residual errors over 15,817 decidable cases. **The mechanism Stage 2L.15 nominated is not the defect**: Nexus is 17 points *better* in risk-dominated worlds (0.9022) than outside them (0.7353), and pricing risk conditionally measures **net −309**, so `NONLINEAR_RISK_DEFECT_DETECTED=false`. The dominant defect is `SUBSTITUTE_MISVALUATION` (41.9%): Nexus credits a BYPASS whenever a substitute *exists*, without checking it is itself delivering. A bounded probe correcting only that lifts accuracy **0.7909 → 0.8130** (+351 net, 27.3% of errors); threshold alignment adds +213. Second class `SINGLE_PASS_APPROXIMATION` (39.8% dominant, 66.1% any-label) is prevalent but only marginally productive (+13 net, flagged marginal). Explained share 0.8948. **73.5% of errors choose an action worse than doing nothing** and 80.6% are fundamental misorders, because Nexus never ranks HOLD — its "should I act" test is a threshold on its own private scale. Only 11 errors are high-confidence, and their dominant class differs from the overall one (n too small for rates). Outcome `B_MULTIPLE_BOUNDED_REMEDIABLE_DEFECTS`, `NEXUS_099_FEASIBILITY=PLAUSIBLE_WITH_BOUNDED_REMEDIATION`. No remediation implemented. |
| Stage 2L.17 | **PASS** (expert remediation) — Nexus live-substitute validation and do-nothing baseline. A bounded expert remediation acting on exactly the Stage 2L.16 diagnosis; the Stage 2L.13 expert is imported frozen and was not edited. Two corrections: a BYPASS is credited only when at least one substitute could actually carry the dependency once its availability is restored, and benefit counts only value **not already delivering**. Measured on the frozen 15,817-case corpus: **Nexus 0.790858 -> 0.829108 (+3.83 pp)**, 657 errors fixed against 52 broken, **605 net eliminated**. Dead-substitute region **0.8046 -> 0.9193**; BYPASS->RESTORE errors 925 -> 417; worse-than-HOLD error rate 0.1375 -> 0.0984. `SUBSTITUTE_MISVALUATION` falls **1,385 -> 517** on the unchanged Stage 2L.16 classifier, and the replay confirms this is not relabelling. The ablation rejected switching everything on: the abstention half of the HOLD baseline measures **net -934 with zero fixes**, because the corpus is decidability-filtered so HOLD is never optimal — a limit of the corpus, not a refutation. **Safe delegation still fails**: precision **0.989474** against the 0.99 floor, one harmful change in 95 delegations — essentially unmoved from Stage 2L.15's 0.989362 despite a far better expert. Outcome `B_EXPERT_FIXED_DELEGATION_STILL_BELOW_FLOOR`. Fixed-point importance fell from +13 to **-93** and was not implemented. |
| Stage 2L.18 | **PASS** (diagnostic) — **current**. Nexus high-confidence tail isolation and delegation-boundary diagnosis. Stage 2L.17 showed the delegation ceiling does not move with expert accuracy, so this stage isolated the population that actually governs it. **The entire high-confidence wrong tail is SIX cases** across all three splits (4 DEV / 1 CAL / 1 HOLDOUT) against 304 correct. A bounded search over 34 decision-time features found a rule — `nexusTopRiskAdjustment<=526975 & positiveUtilityCandidateCount<=2` — whose development lift of **0.2311 lands exactly on the permutation null's p95** (median 0.1789, p99 0.2543) and which retains only **33%/31%** of that lift on CALIBRATION and FINAL_HOLDOUT. It fails both declared criteria independently, so `SEPARABLE_SIGNAL=false`. Propagation is ruled out (the iterative probe fixes **0** and breaks 0 on this region); value diffusion has **no variance** here (every case has concentration 1.0 and one value bearer); and action type has **no contrast by construction** — the region is 310/310 PROTECT, because the rule gates on a risk adjustment the expert assigns only to PROTECT. All six errors are RISK_DOMINATED and five choose PROTECT where RESTORE was optimal; all six are fixable by a bounded single-field edit and none is a structural modelling failure. Outcome `D_REPRESENTATION_LIMIT_IDENTIFIED`, `NEXUS_099_FEASIBILITY=NOT_SEPARABLE_WITH_CURRENT_REPRESENTATION`. Nothing remediated. |
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

Still open after Stage 2L.14, and carried into Stage 2L.15:

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

### What Stage 2L.15 established

Stage 2L.14 left the ceiling measured but unexplained: supported reliability near
0.98 against a 0.99 floor, with no account of *why*. Stage 2L.15 added one family
of decision-time evidence — does the recommendation survive bounded, legitimate
perturbation of the quantities the world is uncertain about? — and answered it.

**The signal is real.** Combining stability with the existing confidence signal
lifts out-of-sample discrimination from 0.6245 to 0.6744. That is reported as a
genuine gain, not talked up and not talked down.

**It is not sufficient, and the reason is specific.** Stability exposes errors in
the regions where Nexus was already visibly unsure, and exposes nothing where
delegation would actually occur:

| high-confidence region (risk >= 500k, margin >= 200k), n=274, 4 wrong | correct | wrong |
|---|---|---|
| mean margin variance | 31140 | 30074 |
| mean top-action stability | 999471 | 1000000 |

The errors that matter are not unstable, not contradicted, not low-margin and not
low-risk. They are simply wrong, and confidently so. Hence
`CEILING_LIMITATION_CLASS = RESIDUAL_EXPERT_ERROR`: the remaining gap is reachable
by improving the expert, not by measuring confidence better over the current one.

Three further findings, measured and deliberately not acted on:

- **The flip rate is nearly worthless.** 81.1% of all errors are perfectly
  top-stable and 7.8% of correct answers are not. Variance carries what signal
  exists; flipping does not.
- **Multiplicity was priced rather than ignored.** At n=111 a region whose true
  rate is 0.98 has a 34.7% chance of measuring at or above 0.99. Across 406 rules,
  one such region appearing is the expectation. The one that did scored 0.9524 on
  DEVELOPMENT — the Stage 2L.14 noise-pocket pattern with the odd draw moved.
- **`VALUE_DIFFUSE` errors are unstable; `RISK_DOMINATED` errors are not.** The
  former is the worst regime (0.5476) and stability finds it. The latter is the
  largest (982 cases), holds most delegation-eligible work, and stability is blind
  to its errors.

Two defects in this stage's own machinery were caught by its adversarial suite and
fixed before certification: a delegation gate that trusted stability evidence with
an unknown schema, a superseded producing model or out-of-domain values; and a
Prime baseline that used a convenience ordering rather than the inherited certified
path, understating Prime at 0.0605 instead of 0.3995 and inflating apparent uplift
roughly sixfold. A test now pins the Prime figure to Stage 2L.14's.

Still open after Stage 2L.15, and carried into Stage 2L.16:

- **Selective Nexus delegation remains unauthorised.** The blocker has moved once
  more — from accuracy (2L.13) to confidence (2L.14) to *residual expert error that
  carries no observable instability*. Prime keeps the recommendation on all 5,324
  holdout cases.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.15. Stage 2L.15 records the limitation and does not address it.
- Everything else open after Stage 2L.14 remains open. Stage 2L.15 changed no
  expert, no benchmark, no arbiter, no threshold and no statistical method.

### What Stage 2L.16 established

Stage 2L.15 closed off confidence mining and named the limitation
`RESIDUAL_EXPERT_ERROR` without saying what the error *was*. Stage 2L.16 diagnosed
it, and the first result is a correction to the previous stage's hypothesis.

**Risk is not the defect.** Stage 2L.15 nominated `RISK_DOMINATED` worlds as a
candidate locus. They are where Nexus performs *best*: 0.9022 against 0.7353
elsewhere, with accuracy rising monotonically across aggregate-exposure quartiles.
A real structural asymmetry does exist — the objective penalises risk conditionally
on a protector delivering, while Nexus prices exposure only for a PROTECT on the
target itself, so 95.1% of its errors credit no risk at all — but pricing that
conditionality measures **net −309**. Prevalence is not causation:
`RISK_UNDERESTIMATION` carries an 84.6% any-label prevalence and explains nothing.

**The dominant defect is substitute liveness.** Nexus credits a BYPASS whenever a
substitute *exists* (`addressesTarget = substitutes.length > 0`), while the world
honours a substitute only when it is itself delivering. That is 41.9% of residual
errors, and a bounded probe correcting only it moves accuracy 0.7909 → 0.8130.
Threshold alignment — the expert operates at 500,000 where the world's
availability threshold is 600,000 — adds a further +213 net.

**The severity finding matters more than the rank finding.** The true optimum sits
second in Nexus's ordering 52% of the time, which reads like near-miss error. It is
not: 80.6% of errors are fundamental by utility, and **73.5% choose an action worse
than doing nothing**. Both are true because *Nexus never ranks HOLD* — it orders
interventions only and acts whenever its own `finalRelationalUtility > 0`, a
threshold on a private scale never calibrated against the true do-nothing baseline.
Counterfactuals agree: 82.3% of errors are deep mis-modelling, not boundary ties.

**Value diffusion is real and monotone.** Accuracy falls from 0.8654 with one
value-bearing entity to about 0.56 with seven or more; diffuse worlds score 0.5844
against 0.8489 concentrated.

Methodological note, because the conclusion depends on it: an early draft
reimplemented the Nexus scorer to toggle mechanisms and agreed with the frozen
expert on only 98.5% of cases. It was discarded. Every probe reported instead adds
an additive delta to the frozen expert's own decomposition, so the baseline
reproduces the expert by construction and the certification refuses to run if it
does not.

Still open after Stage 2L.16, and carried into Stage 2L.17:

- **Selective Nexus delegation remains unauthorised.** Nothing was remediated; this
  stage only says what to remediate.
- **Raw accuracy is not delegation precision.** Stages 2L.14 and 2L.15 both showed
  a supported region at 0.99 is a far stronger requirement than an accuracy gain,
  so `PLAUSIBLE_WITH_BOUNDED_REMEDIATION` is a diagnosis, not a forecast.
- **Only 11 residual errors are high-confidence**, and their dominant class
  (`SINGLE_PASS_APPROXIMATION`) differs from the overall one. The sample is too
  small to carry rates.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.16.
- Everything else open after Stage 2L.15 remains open. Stage 2L.16 changed no
  expert, no benchmark, no arbiter, no threshold and no statistical method.

### What Stage 2L.17 established

Stage 2L.16 named two defects and measured a probe for the first. Stage 2L.17
implemented both properly and measured what they were worth.

**The diagnosis was right, and the probe was not the fix.** Stage 2L.16's probe
tested "is the substitute currently delivering", which cost it 552 broken cases.
That test is wrong, because the world's BYPASS *sets the substitute's availability
to full* — a substitute that is down only because it is unavailable is exactly the
case the action repairs. The correct decision-time question is counterfactual:
would this substitute deliver once availability is no longer its problem, i.e. has
it the capacity it needs and is its own prerequisite closure clear. Implemented
that way, the live-substitute requirement fixes 300 cases and breaks **zero**.

**The second defect was mis-stated as a HOLD problem.** Stage 2L.16 observed that
73.5% of errors chose an action worse than inaction and inferred that Nexus needed
to rank HOLD. The measured truth is narrower: the benefit term was never a
counterfactual delta, so an intervention on an already-healthy chain scored the
chain's whole worth. Crediting only value **not already delivering** is the fix
(+501 net). Adding the abstention gate on top measures **-934 with zero fixes**,
because the corpus is decidability-filtered and HOLD is never optimal in it. The
gate's merit is untested here rather than disproven, and it was not shipped.

**The delegation ceiling did not move.** This is the stage's most important
negative result. With an expert 3.83 points more accurate and 605 errors lighter,
delegation precision went from 0.989362 to **0.989474** — one ten-thousandth — and
the failure is still a single harmful change out of 95 delegations. Whatever
governs the 0.99 ceiling on this corpus, it is not the expert's average accuracy.

**The dominant class changed for an uninteresting reason.**
`SINGLE_PASS_APPROXIMATION` is now largest, but it was already second at 1,318 and
grew by 38. It was promoted because the class above it shrank, so the stage does
NOT report a newly exposed defect; the certification requires a class to be both
not-already-prominent and materially grown before it will.

Still open after Stage 2L.17, and carried into Stage 2L.18:

- **Selective Nexus delegation remains unauthorised**, now for a reason that
  survived a real expert improvement. The next question is what the delegation
  ceiling actually depends on, since accuracy has been ruled out.
- **The abstention mechanism is unmeasurable on this corpus.** Testing it needs
  cases where holding is correct, which the decidability filter removes.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.17.
- Everything else open after Stage 2L.16 remains open. Stage 2L.17 changed no
  benchmark, no arbiter, no Prime, no threshold and no statistical method.

### What Stage 2L.18 established

Stage 2L.17 ruled out expert accuracy as the thing governing the 0.99 ceiling.
Stage 2L.18 asked what does, and the answer is a population too small to interrogate.

**Six cases.** That is the entire high-confidence wrong tail across all three
splits — four in DEVELOPMENT, one in CALIBRATION, one in FINAL_HOLDOUT, against
304 correct. Every figure in the stage is reported with its sample size attached,
and shares over six cases are labelled as counts rather than rates.

**The search found a rule, and the rule is noise.** A bounded search over 34
decision-time features produced a two-term conjunction with a development lift of
0.2311. The permutation null — re-running the *identical* greedy conjunction
search over shuffled labels — has median 0.1789, p95 0.2311 and p99 0.2543. The
observed lift lands exactly on p95: the search finds a rule this good on shuffled
labels one time in twenty. It also retains only a third of its lift out of sample
(33.2% on CALIBRATION, 30.7% on FINAL_HOLDOUT). It fails both declared criteria
independently.

A methodological note that changed the verdict: an earlier draft compared a
conjunction search against a single-term null. That is rigged — the observed
search explores a strictly larger space, so its best is inflated relative to its
threshold — and it produced a false positive. Corrected, the signal disappears.

**Three candidate mechanisms were ruled out, each for a different reason.**

- *Propagation* is not it: the wrong cases are LESS likely to show a propagation
  disagreement than the correct ones (0.833 vs 0.878), and the Stage 2L.16
  iterative probe applied to this region fixes 0 and breaks 0.
- *Value diffusion* cannot be it: every case in the region, correct and wrong,
  has value concentration 1.0 and exactly one value bearer. The feature has no
  variance to separate anything with.
- *Action type* has no contrast by construction: the region is 310/310 PROTECT,
  because the frozen rule gates on `nexusTopRiskAdjustment` and the expert assigns
  a non-zero risk adjustment only to PROTECT. That is arithmetic, and it is
  recorded as such rather than reported as "PROTECT carries 100% of the errors".

**The limit is information, not mechanism.** `REPRESENTATION_INSUFFICIENT`. And
the honest statement cuts both ways: no separating property was found in the
expert-visible state, AND at six positives a real but moderate effect could not
have been detected if one existed. That is a characterised absence of evidence,
not evidence of absence. `RECOMMENDED_REMEDIATION_CLASS=NONE_SUPPORTED_BY_EVIDENCE`
— proposing a fix here would mean fitting to six cases.

Still open after Stage 2L.18:

- **Selective Nexus delegation remains unauthorised**, and both obvious routes are
  now closed: it does not yield to a better expert (2L.17) and it does not yield
  to a better confidence rule over the current representation (2L.18).
- **The delegation region is structurally PROTECT-only.** Whether that is the
  right region at all is a question this arc has not asked.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.18.
- Everything else open after Stage 2L.17 remains open. Stage 2L.18 changed no
  expert, no benchmark, no arbiter, no threshold and no confidence rule.
