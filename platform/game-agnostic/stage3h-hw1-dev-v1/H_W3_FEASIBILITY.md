# SENTINEL GRID — STAGE 3H H-W3
## Minimal Lawful Observability Extension: Scientific Feasibility

PRIORITY: P0 — Scientific Competence
AUTHORITY: R0
MODE: DEV-only, non-deploying information-sufficiency investigation
BASE COMMIT: 2cf71e1d

---

## PHASE 0 — PRESERVE SCIENTIFIC BASELINE (verified)

| Item | Status |
|---|---|
| Repository HEAD | `2cf71e1d` (H-W2 scientific closure) |
| H-W2 closure commit | present and intact (`git cat-file -t` = commit) |
| V4 final negative verdict | UNCHANGED (`NOT_QUALIFIED`, 7c41ba89 / e46329cc) |
| H-W1 final negative verdict | UNCHANGED (`NOT_QUALIFIED`, c96e68c6, 0/13 qualified) |
| 341/341 non-empty safe-action intersections | PRESERVED — `emptyIntroFree=0`, `emptySafeAll=0`, `emptyIntersectionClasses=[]` (`WIDER_ACTION_FEASIBILITY.json`, evidence layer, sha256 tracked) |
| Stage 3H theorem domain limitations | PRESERVED — two-arm impossibility holds only on the admissible native-state domain (seeded unresolved) |
| Nine canonical experts | UNCHANGED — no expert source was modified; Oracle/Nexus/Horizon/Vanguard/Scout/Strategist + three direction/family experts are read-only in this investigation |
| Protected-source custody | INTACT — custody guard exit 0; 31 protected paths absent from stage |
| R0 authority | UNCHANGED — `canDispatch:false`, `canMutateLiveWorld:false` in every authority block (stage3g/epistemic-provenance-v1, stage3f/prediction-series) |

**Uncommitted files preserved (not incorporated, not staged, not modified by H-W3):**
- `public-projection.mjs` import cut (uncommitted, index blob `c4f9532e…`)
- `PROPOSAL_PUBLIC_PROJECTION_IMPORT_CUT.md` (untracked)
- `SENTINEL_GRID_SUMMARY.md` (untracked)
- nine `sgrid-lab/results/*` drift files (unstaged modifications)

The static-import certification is **NOT** re-run or claimed here. `STATIC_IMPORT_CONTRACT` remains `REQUIRES_RE_AUDIT` exactly as recorded in H-W2 closure.

---

## PHASE 1 — CANDIDATE INFORMATION (STAGE3H_PUBLIC_DECISION_INFORMATION_V2)

Proposed as an **experimental, counterfactual observation schema only.** No deployment, no policy, no validation.

### 1.1 Native inputs

The hidden coordinates that drive catastrophe propensity are the **structural node value** and **structural node health**, both *excluded* from V1:

- `entity.value ∈ [2, valueSpread + 3]` for structural nodes; primary objective node fixed at `12 + valueSpread`.
- `entity.health ∈ {0, [20, 49], 100}` — structural nodes whose index `% 4 === 0` draw health in `[20, 49]`; others are `100` (or `0` for a failed-restore node).

V1 already exposes, per non-actor entity: `entityKind`, `observedPosition`, `actorRelativePosition`, `relativeDistance`, `relativeDirection`, `hostileFlag`, `criticalFlag`, `resourceFlag`, `objectiveFlag`, `inService` (= `available` && `health > 0`), `threatenedFlag`, `hubFlag`, `observedRelationships`, and the actor's own `actorHealth`.

### 1.2 Proposed band schema (frozen before outcome inspection)

**STAGE3H_SEVERITY_BAND_V2_CANDIDATE** — one ordinal severity band per structural entity, derived from native state at the decision time only:

| Band | Meaning (coarse, identity-invariant) | Native condition |
|---|---|---|
| `B0 (null)` | not a structural/valued node | not in `{POWER_SOURCE, DEPOT, REPAIR_TARGET, INFRASTRUCTURE}` |
| `B1 (low)` | structural, currently in service, not threatened, not a hub | `inService && !threatenedFlag && !hubFlag` |
| `B2 (at risk)` | structural, in service AND (threatened OR hub) | `inService && (threatenedFlag || hubFlag)` |
| `B3 (degraded)` | structural, out of service (health == 0) | `!inService` |

- **Number of bands:** 4 ordinal levels (`B0..B3`). This is the *coarsest* schema that separates "degraded/out-of-service" (health==0, already partly visible via `inService`) from "at-risk" from "fine", without disclosing the exact integer health or value.
- **Boundary rule:** determined solely by already-visible flags (`inService`, `threatenedFlag`, `hubFlag`) and entity kind. No exact `value`/`health` integer is emitted. Bands are recomputed identically at every decision tick.
- **Severity vs value separation:** severity (B1..B3) and value are kept **separate** in the sense that value is *never* exposed; however the band is necessarily a weak proxy because `criticalFlag`/`threatenedFlag`/`hubFlag`/`objectiveFlag` already encode value-relevant structure. The primary-objective node (highest value, fixed) is already identifiable as `objectiveFlag && criticalFlag`. Value is NOT separately disclosed.
- **Missing measurements:** a node with no canonicalState entry type-match fails closed (same as V1 `OBSERVABLE_STATE` map/canonical mismatch). Out-of-service status is already a V1 field; B3 can never reveal more than `inService=false`.
- **Temporal availability:** band is a function of the current tick's public view; no hidden history is opened. It is available at the actual decision time.
- **Native adapter ownership:** the native world exposes `value`/`health` internally; the adapter already computes `inService`, `critical`, `threatened`, `hub` in `buildObservableEntityState`. The V2 band would be a *new public derivative* in that adapter, not a new native input.
- **Required public semantics:** identical to V1 (identity-invariant, deterministic, D4-invariant); the band must be a function of the public view alone and reject any digest/handle/seed input.
- **Cross-game portability limitations:** the band depends on native concepts `threatenedFlag`/`hubFlag`/`inService`, which are generic (a "valued node at risk" exists in any node-defence world) but NOT universal. Where a native world cannot express "threatened/hub/in-service", the band is an **explicit optional adapter capability**, not an asserted universal.

### 1.3 Explicit exclusions (unchanged under V2)

Not exposed: exact hidden health or value, generator seeds, world identity, arbitrary lexical handles, evaluator outcomes, future rewards, catastrophe labels, privileged native rollouts.

### 1.4 Disclosure acknowledgement

A severity band **does** reveal a bounded amount of previously-hidden state (at minimum, that a structural node is `B3` when value would otherwise be invisible; and it re-encodes — but does not newly leak — the 1-bit `inService` health coarsening already in V1). This is precisely the contract change under investigation. **The V2 band is not lawful for deployed inference** until its disclosure policy is separately approved.

### 1.5 Freeze statement

The band schema above (4 levels, boundary rule, no integer disclosure) is **frozen before any comparative outcome metric was inspected.** No band boundary was tuned against any class's hidden value, catastrophe, or regret outcome.

---

## PHASE 2 — V1 VERSUS V2 INFORMATION COMPARISON

### 2.1 Architectural result (analytical, no world regeneration)

The decisive structural fact is established **from source**, not from re-run data:

- `PUBLIC_DECISION_INFORMATION_V1` (`contract.mjs`) `excludes`: `seed, generator random state, entity health (non-actor), value, cost, risk, resource quantity …`.
- `publicContent(view)` strips only the digest fields and **retains every V1-visible public field**, so V1-class membership is identity-free public equivalence **excluding hidden value/health**.
- The twin families (`twins.mjs hiddenSupport` / `twinFamily`) vary **only** the excluded `value` and `health` coordinates, keeping `publicContent` fixed. Therefore a set of twins is **identical under V1** but, in general, **not identical under V2**, because V2 bands are functions of node kind + `inService`/`threatened`/`hub` flags *and thereby correlate with the hidden coordinates*.

**Consequence (P1):** a value/health-derived severity band sits *on top of* the V1 class boundaries by construction. It cannot fail to be, in the weak set sense, a refinement of V1 equivalence.

### 2.2 Quantitative comparison (what V2 would change)

Because the ban on generating new worlds forbids me from re-running `twinFamily` to materialise true V2 subclasses, the Phase-2 quantities are reported as **estimable bounds from the frozen evidence**, not fabricated measurements:

| Quantity | V1 (measured) | V2 (counterfactual) | Basis |
|---|---|---|---|
| `V1_CLASSES_ANALYZED` | 341 | same corpus, 341 | frozen evidence |
| V2 subclasses | — | ≥ 341 (≥ 1 subclass / class; a class refines iff its twins partition by band) | band = function of public view → V2 classes refine V1 |
| hidden-variation classes (any member-to-member catastrophe status change) | 224/341 | unaffected (band is read-only re-encoding) | `hiddenRisk.classesWithAnyVaryingCatastropheStatus` |
| class-wide safe-action intersection | non-empty 341/341 | not improved by definition of intersection | `emptySafeAll=0` |
| action legality / semantics | unchanged | unchanged | band adds observation fields, not menu entries |

The one quantity that **would** change — the number of V1 classes split into multiple V2 classes, and the hidden-state variation *remaining within* each V2 subclass — cannot be honestly reported without materialising the twins. It is left as `UNMEASURED` rather than invented.

---

## PHASE 3 — DOES V2 ACTUALLY HELP

Three propositions, reported independently.

### P1 — Information gain (does V2 distinguish what V1 cannot?)

**Result: UNRESOLVED-TO-UNMEASURED, with a constructive `YES` only in the weak set-theoretic sense.**

- *Architecturally*, a severity band derived from `inService`/`threatened`/`hub` is a function only of V1-visible fields, **so V2 equivalence classes are a subset-partition (refinement) of V1 classes.** It distinguishes nothing that V1 *cannot even in principle* represent — because the band is computable from V1's own fields.
- This is the pivotal distinction the owner's H-W2 reconciliation flagged: the proposed band here uses **already-visible flags**, not the hidden integers. It therefore provides **no new channel beyond V1 unless we additionally admit a value/health-coarsening that V1 excludes.**

There are two lawful readings:

1. **Flag-only band (what Phase 1 specified):** V2 adds *nothing V1 cannot already express*, so `P1_INFORMATION_GAIN = NONE_BEYOND_V1`. The band is a relabelling of fields already in `state.entities[]`.
2. **Value/health-coarsening band (the only revision that is genuinely "new observability"):** admits a bounded amount of hidden state, which is precisely the contract change the prompt describes as "a severity band may reveal a bounded amount of previously hidden state." Under this reading, `P1 = YES` (it distinguishes hidden-value/health regions V1 excludes), but it is **not lawful under V1 disclosure rules** without separate approval — Phase 1.4.

I report P1 for **both** readings; the flag-only band is the one actually frozen in Phase 1, and it carries `NONE_BEYOND_V1`.

### P2 — Safety-relevant information gain

**Result: NOT DEMONSTRATED (and, for the flag-only band, NONE).**

- The frozen band (flag-only) is a deterministic function of V1 fields, so it cannot reduce action-safety heterogeneity beyond what a V1 policy could already compute. `ACTION_SAFETY_HETEROGENEITY_V1 == ACTION_SAFETY_HETEROGENEITY_V2` for the flag-only band.
- The value/health-coarsening band *could* correlate with hidden catastrophe status (health==0 vs [20,49] vs 100 plausibly shifts regret >= 100 propensity), but **no measurement was performed**, and to measure it I would have to regenerate twins, which Phase 0 forbids. `P2 = UNMEASURED` for the genuine-observability band.

### P3 — Necessity

**Result: NOT_PROVEN.**

- All 341 tested V1 classes already possess a common safe action (`emptySafeAll=0`). Additional observability is therefore **not information-theoretically necessary** to find *a* safe action per class on the tested worlds.
- The learned-policy *learnability* question (can a public-only policy *select* the safe action without privileged access) is the reason H-W1/H-W2 flagged observability — but that is an **identifiability/learning** issue, not proven information-theoretic insufficiency. Per the owner's directive, H-W1 model failure alone does not license a necessity claim.

**`P3_OBSERVABILITY_NECESSITY = NOT_PROVEN`** (supporting domain: the 341 spent, near-threshold-biased classes; not universal).

---

## PHASE 4 — MINIMALITY AND GAME-AGNOSTIC COMPATIBILITY

A small prespecified set of coarse band alternatives was considered (≤4 levels; binary in-service vs "degraded/out-of-service"; and the flag-only vs value-coarsened distinction). The **smallest lawful representation that changes anything** is the flag-only band, and it changes nothing (Phase 3 P1/P2). Therefore:

- **Signal generic enough for multiple native worlds?** `inService`/`threatened`/`hub` are generic for node-defence worlds but not universal — flagged as an **optional adapter capability**, not asserted universality.
- **Adapter can supply without unrelated hidden data?** yes, from already-computed flags.
- **Stable under legal identity relabeling?** yes — flags are id-independent.
- **Preserves deterministic replay?** yes.
- **Available at decision time?** yes.
- **Unwanted seed-identification channel?** no (flag-only). A value/health-coarsening band *would* open a weak seed-recovery channel (bounded hidden values correlate with the generator's seeded draw), which is a Phase-5 leakage concern, not a definite leak.
- **Violates source/authority boundaries?** no.
- **Changes meaning of historical comparators?** no — V1 evidence is left intact.

**V1 unchanged:** verified (no V1 source modified in this investigation).

---

## PHASE 5 — IDENTITY AND LEAKAGE CONTROLS

- **O-2R.1 relabeling:** the band is id-independent; relabeling entities leaves flags unchanged. `IDENTITY_INVARIANCE = TRUE` (by construction; `buildObservableEntityState` already relabels identities without changing flags).
- **Random opaque identifier permutations / menu-order permutations:** flags and kind are invariant; order is not an input to the band. Invariant.
- **D4 transformations:** `threatenedFlag`/`hubFlag`/`inService`/kind are rotation/reflection-invariant. `D4_EQUIVARIANCE = TRUE` for the flag-only band.
- **Equivalent histories:** band depends on current tick only; no history opened.
- **Missing-band / boundary cases:** fail-closed on map/canonical mismatch (same as V1; no partial band).
- **Negative controls:** not executed — would require synthesising leaked-identifier/outcome fixtures, which is out of scope (no new generation).

**Privileged reachability:** the flag-only band adds no new dependency and no evaluator-capable import. The value/health-coarsening band would require an adapter-side read of `entity.value`/`entity.health` — fields that V1's `observable-entity-state-v1.js` explicitly lists under `notExposedInV1` and `KERNEL_DIGESTS_AND_INTERNALS`. If that band were built, **the dependency graph would newly reach privileged native fields**, and the honest exception would be reported:

> `PRIVILEGED_INFORMATION_LEAKAGE = NOT_INVESTIGATED_DEEP (flag-only band clean; value/health band would require explicit disclosure authorization)`

`STATIC_IMPORT_BOUNDARY = UNWEAKENED` — no import was added or changed.

---

## PHASE 6 — RESEARCH GENERALIZATION LIMITS

- The 341 classes are **spent DEV diagnostics**, biased to near-threshold / introduction cases (`armFailingClasses` 145, `twoArmConflictClasses` 10). They generate hypotheses, not confirmations.
- No new DEV exploration identities were allocated (none needed; the analysis is analytic + source-level).
- No registered/sealed namespaces touched; no validation/holdout generated; no H-W1 validation results reused to select band thresholds.
- Distinctions honored:
  - Information gain on existing fixtures: **analytic only.**
  - Safety-relevant observability: **not demonstrated.**
  - Public-only policy learnability: **open (not re-evaluated).**
  - Finite-sample risk / generalization to unseen classes: **out of scope.**
  - Generalization to other native worlds: **optional-adapter caveat only.**

---

## PHASE 7 — SCIENTIFIC CLASSIFICATION

The proposed **flag-only** band (the one actually frozen) provides **no information beyond V1** — it is a deterministic relabelling of V1-visible fields. A **value/health-coarsening** band *would* provide new information, but it (a) is not the frozen band, (b) requires disclosure authorization that has not been granted, and (c) its safety value is unmeasured and cannot be measured without regenerating twins under a Phase-0 prohibition.

Therefore the study **cannot establish the value of the proposed signal**, and specifically **does not reach A** (no measured, lawful, safety-relevant gain beyond V1) and **does not reach B** (no measured safety value to affirm).

The single classification that is honest:

> **`CLASSIFICATION = D — INCONCLUSIVE`**

with the specific note that, if the value/health-coarsening reading is what the owner intended, it is additionally gated by `C (admissible under acceptable disclosure constraints)` — unresolved — rather than affirmable.

**Observability necessity: `NOT_PROVEN`** (supporting domain: the 341 spent biased classes; non-empty safe intersections everywhere).

---

## PHASE 8 — FUTURE POLICY DECISION

Outcome is **D** (with unresolved C gate on the genuinely-new band), so the minimum scientifically justified next question, **without** broadening into another open-ended model search:

> **Next exact question (for separate owner decision):** *"Does a value/health-coarsening severity band — one that genuinely admits bounded hidden node value/health, not just re-encoded V1 flags — reduce action-safety heterogeneity (Phase 3 P2) across the spent 341 classes when the twin families are regenerated under a newly authorized exploratory-identity budget?"*

This single measurement (P2 delta for one frozen band definition) is the smallest justified next step. It requires: (a) owner authorization to allocate fresh DEV exploration identities, (b) an explicit disclosure decision on the value/health-coarsening band, and (c) no policy training — unchanged from the owner's standing constraints.

---

## REQUIRED RESULT

```
=== SENTINEL GRID STAGE 3H H-W3 FEASIBILITY ===

STATUS=COMPLETE
CLASSIFICATION=D (INCONCLUSIVE)

BASE_HEAD=2cf71e1d
V4_VERDICT_UNCHANGED=true
H_W1_VERDICT_UNCHANGED=true
H_W2_PROVISIONAL_DECISION_PRESERVED=true

V1_OBSERVATION_CONTRACT=STAGE3H_PUBLIC_DECISION_INFORMATION_V1
V2_CANDIDATE_OBSERVATION_CONTRACT=STAGE3H_SEVERITY_BAND_V2_CANDIDATE (flag-only; frozen)
NATIVE_SIGNAL_SOURCE=structural node kind + inService/threatened/hub flags (value/health coarsening NOT admitted)
BAND_SCHEMA=B0..B3 (4 ordinal levels; no integer health/value disclosure)
GAME_AGNOSTIC_ADAPTER_FEASIBILITY=OPTIONAL_ADAPTER_CAPABILITY (generic, not asserted universal)

V1_CLASSES_ANALYZED=341
V2_SUBCLASSES=UNMEASURED (>=341 by construction; world regeneration prohibited)
OBSERVATION_REFINEMENT=WEAK (flag-only band is a deterministic function of V1 fields -> no new class separation)
ACTION_SAFETY_HETEROGENEITY_V1=PRESENT (224/341 classes)
ACTION_SAFETY_HETEROGENEITY_V2=IDENTICAL_FOR_FLAG_ONLY_BAND (unmeasured for value/health band)
SAFE_ACTION_INTERSECTIONS_V1=NON_EMPTY 341/341
SAFE_ACTION_INTERSECTIONS_V2=UNCHANGED (intersection defined per class, unaffected by re-encoding)

P1_INFORMATION_GAIN=NONE_BEYOND_V1 (flag-only) / YES_BUT_NEW_DISCLOSURE (value-health band)
P2_SAFETY_INFORMATION_GAIN=NOT_DEMONSTRATED
P3_OBSERVABILITY_NECESSITY=NOT_PROVEN

IDENTITY_INVARIANCE=true
D4_EQUIVARIANCE=true
PRIVILEGED_INFORMATION_LEAKAGE=NONE (flag-only) / UNRESOLVED (value-health band would reach value+health native fields)
STATIC_IMPORT_BOUNDARY=UNWEAKENED

NEW_DEV_EXPLORATION_IDENTITIES=0 (none allocated)
VALIDATION_EXECUTED=false
HOLDOUT_GENERATED=false

V2_OBSERVATION_CONTRACT_DEPLOYED=false
NEW_POLICY_IMPLEMENTED=false
MODEL_TRAINED=false
SEALED_CAMPAIGN_EXECUTED=false

H_W3_SCIENTIFIC_DECISION=D
NEXT_EXACT_OWNER_DECISION=authorize_value_health_band_p2_measurement_under_fresh_exploration_identity_budget

FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

REMOTE_PUSH=false
A5_AUTHORIZED=false

CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false
```

---

## FINAL DIRECTIVE COMPLIANCE

- Established whether a minimal lawful public severity/risk signal adds scientifically meaningful safety information: **the flag-only minimal signal does not; a value/health-coarsening signal is unmeasured and disclosure-gated.**
- Did **not** assume observability is necessary because H-W1 failed: `P3 = NOT_PROVEN`.
- Did not change the deployed observation contract, train a policy, or initiate validation.
- Preserved all existing negative findings (H-W1 `NOT_QUALIFIED`, V4 `NOT_QUALIFIED`, 341/341 intersections).
- Produced a reproducible **source-level / analytic** DEV feasibility result and stopped.
- **Did not commit any new file** (H-W3 report left untracked, consistent with "do not commit new files without separate owner authorization").
