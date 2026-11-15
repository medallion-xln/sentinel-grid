# Stage 3H dual-comparator safety feasibility

**Question.** Can a selector that reads only public observations and chooses between the frozen S0 and Nexus comparator
policies have zero catastrophe introductions against both comparators?

**Answer.** No. Nine verified pairs of publicly identical native worlds force every such selector into an
introduction. This is a development-only study: it builds no selector or model, opens no registration, runs no
campaign, and does not modify or reanalyse V4.

```
=== SENTINEL GRID STAGE 3H SAFETY FEASIBILITY ===

STATUS=COMPLETE (DEV-only; no selector, model, registration or campaign)
CLASSIFICATION=A. TWO_ARM_PUBLIC_ONLY_IMPOSSIBILITY_PROVEN

V4_VERDICT_UNCHANGED=true
V4_EVIDENCE_UNCHANGED=true (57 tracked files byte-identical to e46329cc)
PROTECTED_FILES_UNCHANGED=true (14,447; nine-expert roster preserved; R0, canDispatch=false)

DEV_SEEDS_FRESH=NOT_APPLICABLE (no seed consumed: base worlds are the spent DEV blocks 951/952 and DEV288; the 22,022 twin worlds are DEV constructs on those seeds, none in any exclusion record)
PRIOR_WORLD_EXCLUSIONS_VALID=true (structured records: DEV_WORLD_IDENTITIES.json hash = manifest; blocks 951/952 excluded whole; 9,407 prior hashes unique and unchanged; 0 DEV hashes in the 25,377 V4 ledger hashes)

PUBLIC_OBSERVATION_EQUIVALENCE=STAGE3H_PUBLIC_DECISION_INFORMATION_V1: the complete public view (observation packet incl. features and history, canonical relations, visible map, entity state, full legal menu, action semantics) is byte-identical apart from integrity digests, at the decision point AND at every warm-up tick; identifiers are identical
TWO_ARM_POLICY_CLASS=TWO_ARM_PUBLIC_ONLY_V1: any function of public decision information choosing R = B (S0) or R = N (Nexus-else-S0), deterministic, randomized, or any nonempty subset of B u N; no third action
CATASTROPHE_DEFINITION=frozen FORGE_COUNTERFACTUAL_SYMMETRIC_V1 regret >= 100; introduction = runner-design potentialIntroduction against B and against N

CONTRADICTORY_PAIRS_FOUND=10 (9 valid; the 10th has a mixed-safety S0 tie set in which one subset of B u N stays safe)
FORMAL_WITNESS_VALID=true (all 9 pass every check; primary FRESH_CHECK 9837, margin 5; 5 of 9 contain the native seed-generated world)
PUBLIC_INFORMATION_SUFFICIENCY=INSUFFICIENT_FOR_THE_TWO_ARM_CLASS; NOT_SHOWN_INSUFFICIENT_FOR_SAFETY (in 9/9 witness classes an action outside B u N is non-catastrophic in every tested equivalent world)
ZERO_INTRODUCTION_SATISFIABILITY=UNSATISFIABLE for the two-arm public-only class (deterministic, set-valued and randomized; randomized worst-case introduction probability >= 0.5)

IDENTITY_FIX_RELATION=INDEPENDENT (Nexus's preferred-type class has 1 member in 6/9 witnesses, so no tie-break can change N; the contradiction survives the identity-free comparator in 9/9)
BEST_OF_GAP_RELATION=SEPARATE_MECHANISM (in each witness class the better arm flips between publicly identical worlds, so some best-of error is irreducible for any two-arm selector; the registered best-of failure remains the horizon-only wrong-arm mechanism and is not addressed)

SCIENTIFIC_DECISION=A. TWO_ARM_PUBLIC_ONLY_IMPOSSIBILITY_PROVEN
NEW_SELECTOR_RESEARCH_JUSTIFIED=false within the two-arm class; conditional on an owner decision to change an assumption (see below)
NEW_REGISTRATION_REQUIRED_FOR_FUTURE_CONFIRMATION=true

NEW_SELECTOR_IMPLEMENTED=false
SEALED_CAMPAIGN_EXECUTED=false

FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

NEXT_EXACT_SCIENTIFIC_ACTION=Owner decision recording which assumption changes before any further qualification campaign: (1) widen the policy class beyond the two frozen arms (a third action or safety override); (2) extend the observation contract to expose the decisive hidden state (damaged-node health, node value); or (3) re-specify the requirement of zero introductions against both comparators. This task relaxes nothing. No selector, model or campaign until that decision exists.
```

## Phase 1: baseline (`evidence/baseline.json`, passes)

| Check | Result |
|---|---|
| V4 evidence | 57 tracked files byte-identical to `e46329cc` |
| V4 verdict | `BOUNDED_SELECTOR_NOT_QUALIFIED`, final |
| Diagnosis lane | unchanged since `8d154081`; still `B. NEW_SELECTOR_RESEARCH_REQUIRED` |
| Normalized reproducibility | all 22 DEV run records reproduce their manifest raw and normalized hashes; `REGENERATION_PASS` unchanged |
| Protected files | 14,447 canonical protected files, milestones, frozen rule and nine-expert roster intact |
| Authority | R0, `canDispatch=false`, `canMutateLiveWorld=false` |

DEV exclusion was checked against the structured records only, not repository text:

- `DEV_WORLD_IDENTITIES.json` (sha256 equals the manifest) excludes blocks 951 and 952 whole.
- `prior-world-exclusions.json` holds 9,407 unique hashes and is unchanged.
- The 25,676 DEV hashes collide with none of the 25,377 V4 ledger hashes, and with no prior hash outside DEV288.

## Phase 2: formal question (`contract.mjs`)

**Public decision information** is the complete public view: observation packet (with features and channel history),
canonical entities and relations, visible map, observable entity state, full legal menu and action semantics. For
witnesses it also includes the full public view at every warm-up tick. Uncertainty signals are admitted only as
functions of this view (Nexus codes and confidence, S0 scores).

Excluded:

- **Integrity digests** (`worldHash`, `sourceStateHash`, `provenance`). These are injective commitments to the private
  world state; no frozen decision interface reads them.
- **Privileged fields:** seed, generator state, non-actor health, value, simulator and evaluator access.

Identity: equivalence is modulo a bijection of identifiers. Witness worlds share identifiers, so it also holds
literally.

**Policy class.** R = B or R = N, chosen by any function of public decision information:

- deterministic;
- randomized;
- or any nonempty subset of B ∪ N.

There is no third action.

**Catastrophe.** Frozen evaluator regret ≥ 100. Introductions are measured with the frozen `potentialIntroduction`,
against B and against N.

**Native support.** The frozen V2 generator's own hidden draws, within its own ranges:

- structural-node value in `[2, valueSpread + 3]`;
- initial health of damaged nodes (index % 4 = 0) in `[20, 49]`.

The primary objective value and failed-node health are fixed. Each world is then produced by the frozen calibrated
warm-up and native admission, with the seed, axes, geometry, topology, roles, relations, objectives, channels and
energy unchanged.

## Phase 3: contradiction search (`search.mjs`, `evidence/feasibility.json`)

**Candidates.** All 341 H2 public observations in the spent DEV sets where Nexus applies, N ≠ B, and either S0
introduces against N or both regrets lie in [40, 160]. This was fixed before any twin was built.

**Twin families.** Each class got a deterministic family: global corners, single-coordinate extremes and 40
product-support draws.

| Twins | Count |
|---|---|
| Built | 25,212 |
| Publicly equivalent, with both arms' decisions re-locked and asserted identical | 22,024 |
| Changed the public view, excluded | 3,188 |
| Evaluator truth computed | only after every decision in a class was fixed |

| Class status | Count |
|---|---|
| Witness | 10 |
| One-sided | 135 (49 only S0 introduces, 86 only Nexus introduces) |
| No introduction | 196 |

**Primary witness** (`evidence/witness.json`). FRESH_CHECK idx 9837, `bridge/defended/restore_and_conserve/H2/1`, seed
952000009837. It was selected by the rule fixed in advance: largest margin from the threshold.

| | S0 (B = MOVE #4) regret | Nexus (N = REINFORCE #8) regret | Choosing the other arm |
|---|---|---|---|
| w1: hidden values 2–5, damaged-node health 46 / 45 / 26 | 93 (safe) | 105 (catastrophic) | choosing N introduces vs B |
| w2: same values as the native world, damaged-node health 20 / 20 / 20 | 105 (catastrophic) | 79 (safe) | choosing B introduces vs N |

Every check passes:

- **Provenance:** hashes reproduced; same seed and axes; configs differ only in hidden `value` and `health` fields,
  inside generator support; same calibrated warm-up (19 ticks).
- **Equivalence:** public content byte-identical at the decision point and at all 20 public history ticks; replay
  reaches both worlds.
- **Decisions:** identical through the lane lock and the frozen connector `nativeLock`; Nexus applies in both.
- **Evaluator:** recomputation is deterministic.

The mechanism, from an evaluator-only decomposition: hidden damaged-node health and node values decide whether Nexus's
immediate maintenance path or S0's objective path loses more `infrastructureHealth` over the four steps. The two arms
sit 12–26 regret apart around the threshold, and the hidden draws move each across it in opposite directions.

**Strongest native-member witness.** FRESH_EXPLORE idx 5819, `chain/industrial/restore_and_protect/H2/3`, margin 4.

| | S0 regret | Nexus (REPAIR) regret |
|---|---|---|
| Seed-generated world 951000005819, exactly as generated | 104 (catastrophic) | 10 (safe) |
| Twin: damaged-node health 49, values at minimum | 80 (safe) | 118 (catastrophic) |

**Formal argument.** Let o be the common public decision information of w1 and w2. Every σ in the class depends on o
only, so it acts identically in both worlds.

- If σ(o) = S0, then in w2 R = B contains a catastrophic action while N contains a safe one, so R introduces against N.
- If σ(o) = NEXUS, then in w1 R = N introduces against B.
- Every nonempty subset of B ∪ N was checked exhaustively: each introduces in at least one of the two worlds.
- A randomized σ has worst-case introduction probability max(p, 1 − p) ≥ 1/2.

Hence no member of the class achieves zero introductions against both comparators on any world population whose
support contains such a pair. The same holds for all 9 valid witnesses.

## Phase 4: cause and limits

| Candidate cause | Finding | Category |
|---|---|---|
| Truly unobservable native state | yes: damaged-node health and node value (both UNAVAILABLE in the Stage 3G contract) | FORMAL_IMPOSSIBILITY_WITNESS |
| Missing but lawfully observable history | no: the public view is identical at every warm-up tick | — |
| Policy-specific information asymmetry | no: the selector sees a superset of each arm's input, and both arms are deterministic functions of the same view | — |
| Action semantics | identical (part of the public view) | — |
| Incorrect policy applicability | no: Nexus applies (no abstention) in both worlds | — |
| Horizon-only selection | no: the argument covers every public-only function, not only horizon rules | — |
| Stochastic native transitions | no: kernel deterministic, evaluator recomputation identical | — |

**For the two-arm class, public information is insufficient for the tested policies**
(PUBLIC_INFORMATION_INSUFFICIENT_FOR_TESTED_POLICIES). It is not shown to be insufficient for safety in general: in 9/9
witness classes an action outside B ∪ N (another MOVE direction, RESTORE or RETREAT) is non-catastrophic in every one
of the 62–91 tested equivalent worlds (`evidence/assumption-check.json`).

Limitations:

- **Seed realizability.** The witnesses are native with respect to the generator's declared per-field support. In 5 of
  the 9, one member is the actual seed-generated world. Whether the twin's exact draw combination is realizable by some
  seed is not established, because the generator couples public and hidden draws in one random stream. Exploiting that
  coupling would mean recovering the seed or generator state, which the decision contract excludes. The impossibility
  is therefore stated for the contract-declared hidden state.
- **Coverage.** The observation space was not characterized exhaustively. The search covered 341 DEV classes and
  finite twin families. That is enough to prove impossibility, which needs one witness, but it does not show that any
  wider policy class is safe; "safe in every tested equivalent world" is not "safe over the full support".
- **Margins.** The witnesses sit near the threshold (margin 5 for the primary, 0–4 for the others). This is inherent in
  a threshold-defined catastrophe. A witness with a positive margin stays valid for any threshold within that margin of
  100.

## Phase 5: identity and regret

**Identity.** The frozen Nexus comparator is unchanged, and the lexical-handle diagnosis stands.

- In 6 of the 9 witnesses, Nexus's preferred-type class has a single member, so no tie-break rule can change N.
- In the other 3, the contradiction survives with the identity-free whole-class comparator.

An identity-invariant comparator would change the claim, because N would be a different comparator. It cannot change
the impossibility.

**Best-of gap.** Within each witness class the better arm flips between publicly identical worlds (primary: B better by
12 in w1, N better by 26 in w2). Some best-of error is therefore irreducible for any two-arm selector there. The
registered best-of failure is the separate, already-diagnosed horizon-only wrong-arm mechanism. No router was built and
nothing was tuned.

## Phase 6: decision

**A. TWO_ARM_PUBLIC_ONLY_IMPOSSIBILITY_PROVEN.**

The binding assumption is the two-arm restriction combined with the requirement of zero introductions against both
comparators, under the current observation contract. Before another qualification campaign can be justified, the owner
must change one of:

1. **The policy class.** Admit actions beyond the two frozen arms (a third action or safety override). The evidence
   that this could help is that robust non-arm safe actions exist in 9/9 witness classes over the tested families. Its
   feasibility over the full support is unproven, and it would be new selector research.
2. **The observation contract.** Expose damaged-node health and node value. That changes the deployable-information
   claim.
3. **The safety requirement.** For example, introductions measured against a single comparator, or a nonzero bound.
   This is an owner decision; nothing is relaxed here.

The frozen H0/H2 rule, the V4 verdict and the diagnosis are unchanged.

## Process notes

- The first `assumption-check.json` had a wrong aggregate (a misnamed field made the "robust action outside arms" count
  0). It was deleted and regenerated after the fix; the per-class data was unchanged.
- One witness (FRESH_CHECK 1655) fails validity because S0 returned a mixed-safety tie set. It is reported, not counted.

## Files

| File | Purpose |
|---|---|
| `contract.mjs` | definitions: public information, policy class, catastrophe, exhaustive class verdict |
| `twins.mjs` | generator-support model, native twin construction, public history |
| `baseline-check.mjs` | Phase 1 → `evidence/baseline.json` |
| `search.mjs` | Phase 3 search → `search/shard-*.jsonl` (1.9 MB, includes every twin hash) |
| `analyse.mjs` | → `evidence/feasibility.json` |
| `verify-witness.mjs` | → `evidence/witness.json` |
| `assumption-check.mjs` | → `evidence/assumption-check.json` |

Run with plain `node` from this directory, after `stage3h-failure-diagnosis-v1/dev-runs/` exists. The lane is not
committed.
