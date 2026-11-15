# Stage 3H safety feasibility closure: witness preservation and native-state admissibility audit

This is a DEV-only verification of the contradiction witnesses in `RESULT.md`, which is preserved unedited (see
corrections C2 and C3). No sealed V4 outcome was accessed; no selector, model, registration or seed allocation was
made; V4 and the failure diagnosis are unchanged.

```
=== SENTINEL GRID STAGE 3H SAFETY THEOREM AUDIT ===

STATUS=COMPLETE
CLASSIFICATION=B. TWO_ARM_IMPOSSIBILITY_PROVEN_FOR_ADMISSIBLE_NATIVE_STATE_DOMAIN_ONLY

V4_VERDICT_UNCHANGED=true (BOUNDED_SELECTOR_NOT_QUALIFIED)
V4_EVIDENCE_BYTE_IDENTICAL=true (57/57 vs e46329cc)
PROTECTED_FILES_UNCHANGED=true (14,447; 237 V4-bound sources incl. Forge World V2 src/ unchanged; nine-expert roster; R0)

TWIN_WORLDS_VERIFIED=true (25,212 constructed twin records rebuilt deterministically and equal to the committed search in 341/341 classes; 22,024 publicly equivalent = 22,022 non-base records = 21,998 distinct worlds; 25,186 distinct non-base worlds overall)
VALID_CONTRADICTION_PAIRS=9 (10 candidates; 1 excluded: S0 mixed-safety tie set leaves a safe subset)
PUBLIC_HISTORY_IDENTITY=true (9/9 pairs: full public view identical at every warm-up tick, 7-25 views per pair (calibrated warm-ups of 6-24 ticks plus the initial state), digests excepted)
ACTION_MENU_VALIDITY=VALID (18/18 worlds: O-6 menu, equal to the native symmetric surface, every action transitions natively, E1-faithful semantics, identity-free keys stable under relabelling)
NATIVE_STATE_ADMISSIBILITY=ADMISSIBLE (18/18 worlds: generator ranges, joint product support, validateScenarioV2, kernel validateWorld at every state, frozen warm-up replay frame-identical, legal native transitions)
SEEDED_REACHABILITY=PARTIAL_UNRESOLVED (5/18 worlds seeded-reachable, each with its own seed as witness; 13 not established; 0/9 pairs with both members seeded)

DETERMINISTIC_IMPOSSIBILITY=PROVEN on the admissible native-state domain (9/9 pairs)
RANDOMIZED_ZERO_RISK_IMPOSSIBILITY=PROVEN on the admissible native-state domain (worst-case introduction probability >= 1/2)
FORMAL_DOMAIN_OF_THEOREM=ADMISSIBLE_NATIVE_STATE_DOMAIN (frozen V2 generator configuration for a seed and axes, hidden node value and damaged-node initial health anywhere in the generator's ranges, frozen calibrated warm-up, native admission); NOT the seeded evaluation population

COMMON_SAFE_ALTERNATIVES=COMMON_SAFE_ACTIONS_OBSERVED (9/9 valid pairs; 9/9 classes across all 62-91 tested equivalent worlds; never inside S0 u N)
WIDER_POLICY_FEASIBILITY=WIDER_POLICY_FEASIBILITY_UNRESOLVED (nine tested classes only; their safety is not lawfully computable under the current decision contract)

DIAGNOSTIC_WORLD_EXCLUSIONS=SPENT_DIAGNOSTIC: 48,910 constructed world hashes + 25,676 DEV base worlds + blocks 951/952 (whole) + 6 OPEN seeds; consumed by closure/exclusions.mjs (structured records only, tested); NOT consumed by the frozen V4 allocator, so a future registration must bind it
RAW_SEARCH_EVIDENCE_COMMITTED=true (search/*.jsonl, 1.9 MB, committed by the owner in 8749fd44; hashes, specs and utilities only, no protected-source bytes)
SOURCE_REPRODUCIBILITY=see evidence/closure/CLEAN_CLONE.json (clean clone of the closure commit, no overlay)
TESTS_PASS=true (closure/tests.mjs 9/9; committed-evidence witness reproduction 9/9)

OWNER_RESEARCH_DIRECTION=WIDER_NATIVE_ACTION_POLICY
NEW_SELECTOR_IMPLEMENTED=false
NEW_CONFIRMATORY_REGISTRATION=false
SEALED_CAMPAIGN_EXECUTED=false

BOUNDED_SELECTOR_QUALIFIED=false
FULL_STAGE3H_CERTIFIED=false

STAGE3I_STARTED=false
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

COMMIT_HASH=(the commit that adds this file; see git log)
NEXT_SCIENTIFIC_DECISION=Owner specification, before any selector design, of the wider-native-action research question: (1) the theorem domain future qualification must use: admissible native states, or the seeded population with generator-seed inversion explicitly excluded by contract; (2) how a lawful policy may come to know action safety: a lawful model under the current contract, or a contract change exposing node health and value; (3) a decision on the protected-source custody change in 8749fd44.
```

## Phase 1: frozen inheritance (`evidence/closure/inheritance.json`, passes)

HEAD descends from `8d154081`.

| Check | Result |
|---|---|
| V4 | `BOUNDED_SELECTOR_NOT_QUALIFIED`; 57 evidence files byte-identical |
| Failure diagnosis | unchanged since `8d154081` |
| Reproducibility manifest | 22/22 records' raw and normalized hashes still match |
| Protected files | 14,447 intact |
| V4-bound sources | 237 unchanged, including the 57 Forge World V2 `src/` files |
| `src/` | no change since `8d154081` |
| Roster and authority | nine experts unchanged; R0 with dispatch off |

**Owner commit `8749fd44` ("Sentinel Grid 3H").** It modified no frozen file; its only modifications are the two
previously unstaged unrelated files. It committed this lane. It also added the 30 protected-source package files to
Git; their bytes equal the bound hashes.

The earlier custody rule kept protected bytes out of Git without separate authorization, and no authorization record
was found. This is recorded, not reverted; it is an owner decision. As a consequence, a clean clone of HEAD no longer
needs the overlay.

## Phase 2: witness preservation and exclusions

`evidence/closure/WITNESS_DOSSIER.json` holds, per witness:

- seed, axes and hidden perturbations;
- base, w1 and w2 world hashes;
- every admission and invariant check;
- the full public decision view (digests excluded) and the SHA-256 of the per-tick public history;
- menu identities and action objects;
- the frozen decisions, frozen evaluator utilities and catastrophe labels;
- the class verdict and seeded-reachability status;
- the reason the tenth witness was discarded.

**Policy identities.**

- S0: `30a72416…`.
- Nexus: `sentinel-nexus-relational-v1+NEXUS_RELATIONAL_SELECTOR_V1` (selector port sha256 in `ADMISSIBILITY.json`).

`evidence/closure/DIAGNOSTIC_WORLD_EXCLUSIONS.json` (status `SPENT_DIAGNOSTIC`) lists every starting world the
diagnosis line constructed, 48,910 distinct hashes in total:

| Source | Distinct hashes | Note |
|---|---|---|
| Safety-feasibility twin families | 25,186 non-base | rebuilt from 25,212 records; the EQUIVALENT sets equal the committed search records class by class |
| Failure-diagnosis hidden-health probe twins | 21,738 | |
| D4-oriented DEV288 worlds | 2,304 | |

It also covers the 25,676 DEV base worlds (by reference), the whole blocks 951/952 and the six OPEN seeds. Evaluator
rollout states are not starting worlds and are not listed.

`closure/exclusions.mjs` merges every structured record:

- prior exclusions;
- blocks 731–734;
- V4 ledger world hashes and seeds (identifier fields only);
- DEV identities and this ledger.

It does no text search. Its tests show that it rejects every seed in blocks 951/952 (first, middle and last), blocks
731–734, the OPEN seeds and every recorded world, and accepts a synthetic unrecorded block (a test value, not an
allocation). **It is not consumed by the frozen V4 allocator**, which knows only its bound prior-exclusion file and a
text scan. A future registration must bind this index and call `validateSeedRange` and `excludedWorld` in its gates.

## Phase 3: native-state admissibility (`evidence/closure/ADMISSIBILITY.json`)

All 18 worlds of the 9 valid pairs, each rebuilt from seed, axes and hidden spec, are:

- **GENERATOR_RANGE_VALID.** Every hidden value is in its range in `src/forge/scenarios-v2.js`.
- **Jointly permitted** under the documented sampling contract. Each node draws value and health independently through
  `randomInt`, with no rejection sampling or cross-node constraint; only the primary value and the failed-node health
  are overridden afterwards. The joint support is therefore the product of the ranges.
- **NATIVE_STATE_ADMISSIBLE.** `validateScenarioV2` passes. The kernel's authoritative `validateWorld` held at every
  state (run by `createWorld`, `legalActions`, `step` and `observe`). The calibrated warm-up reproduces the world, and
  its replay is frame-identical. Every warm-up tick is a legal WAIT transition. The menu is O-6 valid and equals the
  native symmetric surface. Every menu action transitions natively. The semantics are E1-faithful to those transitions.

Also verified for every pair: identical public history at every tick, identical decisions under the frozen
`nativeLock`, and an exact reproduction of the label reversal under the frozen `evaluateCounterfactualsSymmetricV1`,
`metrics.mjs` `score()` and `potentialIntroduction`.

**SEEDED_GENERATOR_REACHABLE.**

- **Reachable (5/18).** Five worlds are the unperturbed generator output of their own seed. Each pair contains at most
  one such world.
- **Not established (13/18).** A twin differs from its seed's own world only in hidden draws. Reaching it from the
  seeded generator would need another seed whose SplitMix64 stream (64-bit state, seeded through SHA-256) reproduces
  every public draw.
  - The public placement, node-count and primary-node draws alone fix at least 77–208 bits per class.
  - Treating the draws as independent and uniform (an idealization, not a proof), the expected number of other states
    reproducing a twin's public observation is at most 2^(64−77) to 2^(64−208).
  - Exhaustive enumeration of 2^64 states is infeasible, so this is not settled.
  - Under that idealization the twins are almost certainly not seeded-reachable. The seeded population then almost
    surely contains no such pair for these observations: there the public observation, read through the generator,
    determines the hidden draws.
  - Exploiting that would require recovering the seed or generator state from public geometry, which the decision
    contract excludes.

## Phase 4: formal two-arm impossibility

For each admissible pair (w1, w2), the two worlds share all permitted decision information and both frozen arms decide
identically:

- **w1:** Nexus-else-S0 is catastrophic and S0 is not.
- **w2:** S0 is catastrophic and Nexus is not.

Any public-only σ acts identically in both worlds:

- **σ = S0** introduces a catastrophe against N in w2.
- **σ = Nexus** introduces one against B in w1.
- **Any subset of B ∪ N** introduces in at least one world (exhaustive, for single-action arms).
- **Randomized σ** has worst-case introduction probability ≥ 1/2.

The argument uses the frozen catastrophe definition (regret ≥ 100) and the frozen introduction rule.

**Theorem (proven).** No two-arm public-only selector achieves zero catastrophe introductions against both comparators
on the admissible native-state domain, or on any population whose support contains one of these pairs.

**Not proven.** The same statement for the seeded evaluation population.

## Phase 5: wider native-action evidence (`evidence/closure/ALTERNATIVE_ACTIONS.json`)

The checks used only the existing witnesses.

- **Menus.** In each class the legal menu is common to all equivalent worlds. Every action has an identity-free
  semantic key (type, displacement, target's public attributes) that is unique in its menu and unchanged under the
  O-2R.1 identity relabelling.
- **Per pair.** All 9 valid pairs have an action outside S0 ∪ N that is safe in both worlds.
- **Class-wide.** All 9 classes also have one safe in every tested equivalent world (62–91 worlds). The pair and class
  levels differ: class 9839 has {0, 1, 5} per pair but {0, 5} class-wide; class 10798 has {0, 2} versus {2}.
- **Lack of a common safe action.** No class lacks one. None of the common safe actions is in S0 ∪ N.

**Lawful computability.** On the tested family this safety does not depend on the hidden state. But establishing it
needs native rollouts over the hidden-state support, and the decision contract forbids simulator and evaluator access.
An offline-discovered safe alternative is therefore not a deployable policy, and nine classes say nothing about the
universal safety of a wider policy.

## Corrections (`evidence/closure/CORRECTIONS.json`)

| Id | Correction |
|---|---|
| C1 | The first `assumption-check.json` reported 0 (misnamed field). It was deleted before any commit and its bytes are not preserved; the record states the only difference (0 instead of 9). |
| C2 | `RESULT.md` "not committed" is superseded by `8749fd44`. |
| C3 | "22,022 twin worlds" were records, not distinct worlds. The distinct counts are given above. |
| C4 | `ADMISSIBILITY.json` shows `labelsReproduce=false` for the invalid witness 1655. It compares a mean over a selected set with the search's max; the introduction flags reproduce exactly. |

## Files

| Path | Purpose |
|---|---|
| `closure/inheritance.mjs` | Phase 1 |
| `closure/ledger.mjs`, `closure/ledger-merge.mjs` | rebuild and exclusion ledger |
| `closure/exclusions.mjs` | consolidated exclusion validator |
| `closure/admissibility.mjs` | admissibility audit and dossier |
| `closure/alternatives.mjs` | Phase 5 |
| `closure/manifest.mjs` | source/archive manifest and corrections |
| `closure/reproduce-witnesses.mjs` | committed-evidence reproduction |
| `closure/tests.mjs` | tests |

`work/` (rebuilt ledger shards) is gitignored; its hashes are in `SOURCE_AND_ARCHIVE_MANIFEST.json`.
