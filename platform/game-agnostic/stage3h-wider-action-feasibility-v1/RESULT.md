# Stage 3H next research decision: custody and wider native-action feasibility

DEV-only. No selector or model was built or trained, no registration and no campaign; V4, the diagnosis and result B
are unchanged. **This lane and the custody audit are NOT committed:** protected-source custody is unresolved (see
`../stage3h-custody-audit-v1/REMEDIATION_PROPOSAL.md`), and the instruction forbids committing a new lane on the
affected history without a remediation decision.

```
=== SENTINEL GRID STAGE 3H NEXT RESEARCH DECISION ===

STATUS=COMPLETE (custody: proposal awaiting approval; research: DEV feasibility answered; nothing committed)

V4_NEGATIVE_VERDICT_FINAL=true
SAFETY_THEOREM_CLASSIFICATION=ADMISSIBLE_NATIVE_STATE_DOMAIN_ONLY

PROTECTED_SOURCE_CUSTODY_STATUS=BREACHED_LOCAL_UNRESOLVED (30 policy-protected files tracked since 8749fd44; remediation R1 proposed, nothing executed)
TRACKED_PROTECTED_SOURCE_COUNT=30 (in 8749fd44, e9b77ae0, ac9daeb5 = HEAD; 30 packed blobs, 198,555 bytes)
REMOTE_EXPOSURE_STATUS=NO_EVIDENCE_OF_DISTRIBUTION (last push e7fe50fd on 2026-10-01; main 41 commits ahead and unpushed; no remote-tracking ref holds a protected path; GitHub not reachable from this session, so not confirmed remotely)
BACKUP_VERIFIED=PARTIAL (protected package ecfc7016 verified: 30/30 files equal bound hashes; NO repository backup: no Time Machine destination, no local snapshots)
HISTORY_REMEDIATION_REQUIRED=true (forward untracking would leave the bytes in 8749fd44 and its descendants; R1 rebuilds those three commits without the 30 paths, dry-run verified)
REMEDIATION_APPROVAL_REQUIRED=true

STRUCTURED_EXCLUSION_INTEGRITY=VALID (48,910 constructed + 25,676 DEV base + 9,407 prior + 25,377 V4 sealed worlds = 109,082 distinct; blocks 731-734, 951, 952; 6 OPEN seeds; 116 prior seeds; no duplicates or non-canonical identities; 288 two-source identities kept)
FUTURE_ALLOCATOR_INTEGRATION_SPECIFIED=true (exclusion/strict-index.mjs: fail-closed loader plus namespace and world preflight; 5/5 synthetic collision and tamper tests; the closure validator's endpoint-only block check is a documented defect superseded by the strict preflight; the frozen V4 allocator does not consume the index)

WIDER_ACTION_POLICY_CLASS=pi: public decision information -> one action of the complete native legal menu (or a distribution); S0 and Nexus-else-S0 frozen comparators
PUBLIC_INFORMATION_CONTRACT=STAGE3H_PUBLIC_DECISION_INFORMATION_V1 (complete public view and history, digests excluded); hidden node health/value not exposed
SEED_RECOVERY_FORBIDDEN=true
ONLINE_PRIVILEGED_ROLLOUTS_FORBIDDEN=true

OBSERVATION_CLASSES_ANALYZED=341 (all existing admissible-state equivalence classes; 22,365 labelled worlds)
COMMON_SAFE_ACTION_CLASSES=341/341 (introduction-free intersection non-empty in every class; non-catastrophic intersection also non-empty in every class)
EMPTY_SAFE_INTERSECTIONS=0
IDENTITY_INVARIANCE=semantic keys relabel-stable in 341/341 classes; 3 classes have a key collision (two BYPASS on one DEPOT, differing only in the dependent), identical in catastrophe and introduction-free status, never the oracle or an arm; key refinement required
REGRET_SAFETY_TRADEOFF=NONE_AT_ORACLE_LEVEL (in 341/341 classes the unconstrained minimax-regret action is already introduction-free); the deployable trade-off is untested

SCIENTIFIC_FEASIBILITY_VERDICT=A. WIDER_ACTION_PUBLIC_ONLY_RESEARCH_FEASIBLE (on the tested classes; offline in-class oracle, not a policy)
MINIMAL_NEXT_RESEARCH_HYPOTHESIS=H-W1 (see below): a new identity-invariant public-only policy over the full native menu, trained offline only, has zero introductions against both frozen comparators on fresh exclusion-aware DEV equivalence classes, and mean nreg at least 0.02 below both

NEW_SELECTOR_IMPLEMENTED=false
NEW_MODEL_TRAINED=false
NEW_SEALED_REGISTRATION=false
NEW_CAMPAIGN_EXECUTED=false

FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

NEXT_EXACT_OWNER_DECISION=Decide custody remediation R1 gates A0 (pre-push guard) and A1 (verified bundle backup) now; then A2-A4 (rebuild, verify, switch) before any further commit. After custody is resolved, approve or reject H-W1 as a prospective DEV-only research contract (fresh blocks validated by the strict exclusion preflight); no implementation before that approval.
```

## Phase 0: inheritance (`evidence/phase0.json`, passes)

| Check | Result |
|---|---|
| V4 | `BOUNDED_SELECTOR_NOT_QUALIFIED`; 57 files byte-identical |
| Nine experts and frozen H0/H2 rule | rule hash `c53826da…` matches |
| Forge V2 | 0/237 bound-source mismatches; no `src/` change |
| Protected files and authority | 14,447 intact; R0 |
| Result B | preserved; safety lane unchanged since `ac9daeb5` |
| Witnesses | 9/9 reproduce |
| Exclusions | spent blocks, OPEN seeds and all DEV base worlds remain excluded |

## Phase 1: custody (separate report: `../stage3h-custody-audit-v1/`)

`evidence/CUSTODY_AUDIT.json` (no protected content) and `REMEDIATION_PROPOSAL.md` contain the findings and the single
proposal **R1**. Its steps:

1. pre-push guard;
2. verified full-history bundle;
3. rebuild `8749fd44`, `e9b77ae0`, `ac9daeb5` without the 30 paths on a side ref;
4. verify the science;
5. switch `main`;
6. purge.

Each step has its own approval. The dry run (`evidence/REMEDIATION_DRYRUN.json`) was done in a disposable clone and
left the real repository untouched. It shows every rebuilt commit removes exactly the 30 paths and nothing else, so
all scientific evidence blobs stay byte-identical.

## Phase 2: exclusion integrity (`evidence/EXCLUSION_INTEGRITY.json`)

`exclusion/strict-index.mjs` validates the exact structured records and throws on any inconsistency. It checks
schemas, canonical 64-hex identities, uniqueness, declared counts, the ledger digest, the ledger's reference to the
DEV identity file, V4 seeds against the allocated blocks, and whole-block DEV exclusion. It provides:

- `preflightNamespace`, which checks every block a range touches;
- `preflightWorlds`, which rejects non-canonical hashes.

The synthetic tests (`exclusion/tests.mjs`, 5/5) cover:

- spent blocks and their boundaries;
- recorded seeds;
- a range whose spent blocks lie inside it (the committed `closure/exclusions.mjs` passes it, a defect; the strict
  preflight rejects it);
- every identity source;
- non-canonical hashes;
- tampered or missing records, which all throw.

## Phases 3–4: safety-set intersections (`evidence/WIDER_ACTION_FEASIBILITY.json`)

**Question.** Can a public-only policy choose any native legal action that never introduces a catastrophe against
either frozen comparator while retaining material decision value?

**Population.** All 341 existing equivalence classes, H2 (22,365 worlds). For every action in every equivalent world
the analysis records the frozen-evaluator regret, its catastrophe status and whether it is introduction-free.

**Intersections.**

- The introduction-free intersection is **non-empty in 341/341 classes**.
- The all-world non-catastrophic intersection is also non-empty in 341/341.
- No equivalence class lacks a common safe native action.

**Offline in-class minimax choice** (an oracle that knows the class's hidden-state family; it is not a policy):

| Mean nreg | All 341 classes | 145 classes where an arm introduces somewhere | 10 two-arm-conflict classes |
|---|---|---|---|
| Oracle | 0.034 | 0.033 | 0.041 |
| S0 | 0.494 | 0.540 | 0.754 |
| Nexus-else-S0 | 0.554 | 0.653 | 0.593 |

- The oracle lies outside S0 ∪ N in 313 classes.
- In 200 classes its action type equals S0's but it is a different action (mostly another MOVE direction), so S0's
  within-type ranking is the largest gap.
- Oracle types: MOVE 265, RETREAT 28, RESTORE 28, PROTECT 15, REPAIR 4, BYPASS 1.

**Regret versus safety.** None at oracle level: in every class the least-regret robust action is already
introduction-free.

**Hidden risk.**

- 224 classes have actions whose catastrophe status depends on hidden state (2.4 per class on average).
- 110 classes have an optimal action that varies with hidden state.

A lawful policy therefore has to choose actions that are robust to hidden variation. It cannot rely on a best guess
of the hidden state.

**Public features.** No single public feature isolates the classes where an arm fails:

- regime: 41% (observed threat) versus 48% (no observed threat);
- Nexus type: PROTECT 42%, REINFORCE 37%, REPAIR 73%.

Whether richer lawful features predict the robust set is the open question.

**Identity** (`evidence/KEY_COLLISIONS.json`). Semantic keys are unchanged under the O-2R.1 relabelling in every
class. The three key collisions are two BYPASS actions on one DEPOT that differ only in the dependent entity. They
match in catastrophe and introduction-free status in every world, and none is the oracle choice or an arm. The future
representation must add the dependent's public attributes.

## Phase 5: decision

**A. WIDER_ACTION_PUBLIC_ONLY_RESEARCH_FEASIBLE.** The verdict rule was fixed before aggregation: no empty
intersection, and the offline choice is at least 0.02 nreg below both arms on the arm-failing classes.

This is feasibility of research, not of deployment:

- The safe sets come from an offline, privileged in-class oracle over finite twin families.
- They do not show universal safety.
- The analysed classes are a biased sample of hard, near-threshold cases.
- Whether lawful public features can identify the robust action, the remaining observability question (C), can only
  be answered prospectively.

### H-W1: minimal prospective DEV-only specification (not implemented)

**Identity.** A new selector, `STAGE3H_WIDER_ACTION_POLICY_W1`. S0 and Nexus-else-S0 stay frozen comparators.

**Action representation.** Identity-invariant semantic keys: type, displacement, the target's public attributes,
plus the BYPASS dependent's public attributes. No handles or entity ids.

**Inputs at decision time.** Public decision information only:

- the per-action semantic features above;
- S0's public per-action score;
- Nexus's public rationale codes;
- public state aggregates.

No hidden health or value, no seed, no simulator or evaluator.

**Training labels (offline only).** For each DEV equivalence class and action: the worst-case regret and the
introduction status over the admissible twin family.

**Objective.** Lexicographic:

1. minimise predicted introduction risk over the admissible hidden support (target zero);
2. then minimise predicted worst-case regret.

**Populations.** Independent DEV exploration and DEV validation sets from fresh blocks, validated with
`exclusion/strict-index.mjs`, each evaluated with twin families. Plus a secondary measurement on the actual seeded
population, reported separately with no impossibility inference.

**Prospective success criteria.** On every validation equivalence class:

- zero introductions against both comparators;
- mean nreg at least 0.02 below both comparators, with the bootstrap upper bound below 0;
- exactly zero dependence under O-2R.1 and random relabelling, and D4/ORDER invariance.

A new evaluation contract and its own approval are required before implementation.

## Files

| File | Purpose |
|---|---|
| `phase0.mjs` | inheritance |
| `contract.mjs` | definitions |
| `exclusion/strict-index.mjs`, `exclusion/tests.mjs`, `exclusion/integrity.mjs` | Phase 2 |
| `intersect.mjs` (`work/` gitignored) and `analyse.mjs` | Phase 4 |
| `key-collisions.mjs` | identity check |
| `evidence/*.json` | results |

The custody audit lives in `../stage3h-custody-audit-v1/`.
