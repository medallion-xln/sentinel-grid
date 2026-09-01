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
| Stage 2L.10 | **PASS** — **current**. Arbiter correctness calibration and selective delegation. 22,750-case holdout, disjoint from an 8,450-case calibration corpus. Prime 54.81%, Arbiter 60.66% (+5.85 pp), 1,332 beneficial changes, **0 harmful changes**, **0 correct-Prime breaks**, delegation precision 1.000. Oracle correctness discrimination **+0.5651**, Nexus 0.0000 (abstains — measured non-identifiability). Portability recorded on a single platform. |
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

Still open after Stage 2L.10:

- **Nexus contributes no utility.** No structural bucket reached the reliability
  floor, so Nexus abstains everywhere; 1,849 correct delegation opportunities on
  the holdout were declined. Recovering them needs Nexus to certify *semantic*
  optimality, not just structural criticality — a Nexus contract question.
- **Only Oracle's direction head has a calibrated correctness signal.** The other
  six heads cannot currently justify a delegation.
- **Zero harm is measured on this corpus, not proven in general.** A mean-reverting
  displacement slower than the calibrated slope ratio would pass the gate and be
  wrong.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`), not PASS.
- Prime's priors are still uniform; the Router remains outside the certified Prime
  path.
- **Live ZekNova qualification remains uncertified** under the current lineage:
  0 accepted records, 0 accepted sessions, 0 accepted simulations,
  `thresholdsPass=false`, `certified=false`.
