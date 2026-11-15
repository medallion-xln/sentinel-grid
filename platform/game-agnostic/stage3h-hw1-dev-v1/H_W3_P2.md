# SENTINEL GRID — STAGE 3H H-W3-P2
## Quantifying the Safety Information Added by Coarse Health and Value Bands

PRIORITY: P0 — Scientific Competence
AUTHORITY: R0 — Observation and Recommendation Only
MODE: Research-only counterfactual observability measurement
BASE COMMIT: `2cf71e1d` + `904fd517` (local H-W3 feasibility report)

---

## PHASE 0 — SCIENTIFIC AND REPOSITORY BASELINE (verified)

| Item | Status |
|---|---|
| Repository root | `/Users/dwaynecampbell/Desktop/sentinel-grid` |
| Current HEAD | `904fd517` (H-W3 feasibility commit, on top of `2cf71e1d`) |
| V4 negative qualification | UNCHANGED (`NOT_QUALIFIED`) |
| H-W1 negative qualification | UNCHANGED (`NOT_QUALIFIED`, 0/13) |
| H-W2 provisional classification | UNCHANGED (`B_PROVISIONAL_OBSERVABILITY_RESEARCH_DIRECTION`) |
| H-W3 source-level finding | UNCHANGED (`D — INCONCLUSIVE`, `P3 NECESSITY = NOT_PROVEN`) |
| Nine Sentinel experts | UNCHANGED — no expert path in the working-tree modification set |
| Protected-source custody | INTACT — 32 identities, `stage-guard.sh` exit 0 |
| R0 authority | UNCHANGED — `canDispatch:false`, `canMutateLiveWorld:false` everywhere |

**Uncommitted artifacts preserved (not staged, not altered):**
- `public-projection.mjs` import cut (modified)
- `PROPOSAL_PUBLIC_PROJECTION_IMPORT_CUT.md` (untracked)
- `SENTINEL_GRID_SUMMARY.md` (untracked)
- nine `sgrid-lab/results/*` drift files (modified)

**`H_W3_FEASIBILITY.md` verified** (content hash unchanged from authorship) and committed locally as `904fd517` — no push.

---

## PHASE 1 — FREEZE THE MEASUREMENT CONTRACT

### 1.1 Authoritative source definitions (located, exact)

| # | Definition | Authority / source | Frozen value |
|---|---|---|---|
| 1 | Native node health | `scenarios-v2.js` L191 | `index % 4 === 0 ? 20 + randomInt(0,30) : 100`; failed-restore node forced `0` |
| 2 | Native node value | `scenarios-v2.js` L190, L205 | `2 + randomInt(0, valueSpread + 2)` → `[2, valueSpread+3]`; primary node overridden `12 + valueSpread` |
| 3 | Legitimate source ranges | `twins.mjs hiddenSupport` | value `[2, spread+3]` (primary `12+spread`); health `{0, [20,49], 100}` |
| 4 | Values at decision point | `twins.mjs nativeWorld` / `observableView` | post calibrated-warm-up world state; V1 view omits `value`/`health` |
| 5 | V1 public equivalence | `contract.mjs publicContent` | full public view minus digest fields; excludes `value`, `health`, `cost`, `risk` |
| 6 | Legal action semantics | `deriveActionSemantics` (V1) | unchanged; band adds no menu entries |
| 7 | Frozen catastrophe evaluator | `FORGE_COUNTERFACTUAL_SYMMETRIC_V1`, regret ≥ 100 | unchanged; offline ground truth only |
| 8 | DEV-world identities | 341 spent classes; blocks 977–988 spent | no sealed V4 rows, no H-W1 validation reopened |

### 1.2 Four observation conditions (frozen before any metric computed)

| Condition | Information admitted |
|---|---|
| **A** | V1 public only |
| **B** | V1 + coarse health band (structural node only) |
| **C** | V1 + coarse value band (structural node only) |
| **D** | V1 + coarse health and value bands |

**Band schemas** — frozen, outcome-independent (thresholds derive from source ranges, not from catastrophe labels):

- **HEALTH_BAND** (3 ordinal levels): `H0` unavailable/zero (`health==0`); `H1` degraded (`20..49`); `H2` intact (`100`).
- **VALUE_BAND** (3 ordinal levels): `V0` low (`[2, spread+1]`, below median in support); `V1` mid (`spread+2`); `V2` high (`spread+3`, local max; note primary objective is `spread+12` and already visible via `critical`/`objective` flags).
- **COMBINED_BAND** = Cartesian product of the two, truncated to structural nodes only.

**Missing-value rule:** a node with no canonicalState type match fails closed (no band emitted for it); a node's band is omitted, never defaulted.

**Boundary semantics:** bands are pure integer-comparison against frozen constants; no seed, handle, digest, or evaluator value is an input. No tuning against labels.

---

## PHASE 2 — STRICT INFORMATION BOUNDARY

The proposed measurement requires a projection that reads each twin's hidden `value`/`health` to assign bands. The required separation exists:

```
RESEARCH_PRIVILEGED_MEASUREMENT = true   // offline analysis process may read hidden value/health
RUNTIME_PRIVILEGED_INFORMATION = false   // nothing reached by Sentinel inference changes
V2_DEPLOYMENT_AUTHORIZED          = false
```

**Exactly which extra state would become public under a future V2 contract:** structural-node `health` coarsened to 3 levels (`0 / 20..49 / 100`) and structural-node `value` coarsened to 3 levels (support-trinths), each an ordinal per node, identity-invariant. No integer is disclosed; no non-structural (`HOSTILE`, `RESOURCE`, `ACTOR`) health/value is touched.

**No** native state, V1 output, comparator, evaluator, or prior result is altered. The evaluator is ground-truth-only, offline, and outside any deployable path.

---

## PHASE 3 — P2 SAFETY INFORMATION MEASUREMENT

### 3.1 The decisive finding: the measurement cannot be completed against persisted data

The P2 metric requires, per class, each twin's **hidden `health`/`value` integers** (to assign bands B/C/D) and the **evaluator truth per action per twin** (safety labels). Audit of the persisted artifacts establishes:

1. **`wider-action-feasibility-v1/work/intersect/*.jsonl`** (341 rows) persists only summary metrics — `safeAll`, `introFreeAll`, `hiddenRisk`, `publicFeatures` (regime, types, hostiles, energy, ticks) — and **no per-world hidden coordinates** and **no per-world action-safety labels beyond the aggregate `safeAll`/`introFreeAll` sets per class**.

2. **`safety-feasibility-v1/work/ledger/*.jsonl`** persists only `(index, worldHash, twinKind)` triples per class. `worldHash` is the *private*-state hash — an injective commitment to hidden state, explicitly excluded from V1 (`DIGEST_FIELDS` = `worldHash`, `sourceStateHash`, `provenance`) and **forbidden as an information feature** in Phase 1.

3. **No persisted artifact** joins `worldHash` (or seed/axes) → the hidden `value`/`health` integers, and no artifact stores per-twin per-action evaluator utilities for offline re-labelling.

Consequence: assigning B/C/D bands and measuring within-subclass safety heterogeneity **requires recovering the hidden coordinates by re-running the frozen generator + `hiddenSupport` + calibrated warm-up** (and the evaluator for per-world labels) — i.e. regenerating the spent twin families. The owner's Phase 0 prohibition is explicit and repeated:

> "Use only permitted spent DEV data" · "Do not … Generate sealed or held-out populations" · (H-W3 repeat) "Do not generate new worlds or rerun validation."

The band→subclass→heterogeneity measurement is therefore **not executable against the persisted samples**, and it is **not authorized** to regenerate them.

### 3.2 What can be reported honestly

The conditional statement that *could* be measured is pinned down at the source level, but left **UNMEASURED** rather than fabricated:

- **Direction of effect (analytic):** the health band (H0/H1/H2) is a monotone coarsening of `health`, which the twin families perturb and which drives `available`/repair-relevant outcomes. The value band (V0/V1/V2) coarsens `value`, which drives objective-worth / regret-scale. Both bands *partition* the V1 class — so B/C/D are, by construction, refinements of A. `P1` is trivially true (more classes), but the *safety-relevant* resolution (whether the refined subclasses have lower within-subclass heterogeneity) is exactly the unmeasured quantity.
- **Class-level baselines already frozen (from `WIDER_ACTION_FEASIBILITY.json`):**
  - `SAFETY_HETEROGENEITY_V1` = present in 224/341 classes (`classesWithAnyVaryingCatastropheStatus`), mean 2.38 varying actions/class.
  - `COMMON_SAFE_INTERSECTIONS` = non-empty 341/341 (`emptySafeAll=0`, `emptyIntroFree=0`, `emptyIntersectionClasses=[]`).
  - These are the A-condition anchors. B/C/D subclass counts, coverage, and post-refinement heterogeneity remain unmeasured.

### 3.3 Reported metric table

| Metric | Value |
|---|---|
| `V1_SUBCLASSES` (=== `DEV_CLASSES_ANALYZED`) | 341 |
| `HEALTH_SUBCLASSES` | UNMEASURED (requires hidden-health recovery) |
| `VALUE_SUBCLASSES` | UNMEASURED |
| `COMBINED_SUBCLASSES` | UNMEASURED |
| `SAFETY_HETEROGENEITY_V1` | 224/341 classes contain catastrophe-status variation |
| `SAFETY_HETEROGENEITY_{HEALTH,VALUE,COMBINED}` | UNMEASURED |
| `COMMON_SAFE_INTERSECTIONS` | non-empty 341/341 (A-condition, frozen) |
| `SUBCLASS_COVERAGE` | UNMEASURED |
| `EFFECTIVE_SAMPLE_SIZE` | UNMEASURED |

No singleton-subclass improvement is claimed; nothing is reported as a measured gain.

---

## PHASE 4 — IDENTIFIABILITY TEST

- **P1_INFORMATION_GAIN** — `PARTIAL (constructive, unmeasured)`: more observation classes by construction, but the number of *populated*, *safety-relevant* subclasses is unmeasured.
- **P2_SAFETY_INFORMATION_GAIN** — `UNMEASURED`: the within-subclass catastrophe-heterogeneity reduction is the target quantity and was not computed (no regeneration authorized).
- **P3_SAFE_ACTION_IDENTIFIABILITY** — `UNMEASURED`: cannot assert robust-safe-action identifiability improved.
- **P4_OBSERVABILITY_NECESSITY** — `NOT_PROVEN`: unchanged from H-W3; 341/341 non-empty intersections means necessity is not established on the tested domain.

No safety-prediction improvement is equated with universal safe-action selection; no learning claim is made.

---

## PHASE 5 — IDENTITY AND GAME-AGNOSTIC CHECKS

These are answerable **analytically** regardless of the unmeasured P2 quantity, because bands are functions of node kind + public flags + integer thresholds:

- **Opaque entity relabeling** — invariant (bands keyed on kind/thresholds, id-independent).
- **Menu-order changes** — invariant (bands are per-entity observations, not menu-positional).
- **Semantically equivalent action representations** — unaffected.
- **D4 transformations** — invariant (`health`/`value`/`kind` are rotation/reflection-invariant).
- **Decision-time availability** — yes (bands from current native state).
- **Missing/boundary band values** — fail-closed; boundary at integer thresholds is exact.
- **Deterministic replay** — yes (pure function of native state).

**Game-agnostic portability:** the health/value coarsening is Forge-World-specific in its exact ranges and in its dependence on structural-node `health`/`value` fields. A generic equivalent would be an **optional adapter capability** ("expose an ordinal structural-integrity band and an ordinal structural-value band, 3 levels each, ranges declared per adapter") — not an asserted universal. **No game-agnostic portability is claimed without evidence.**

**Static-import contract** — unchanged (no import added or weakened).

---

## PHASE 6 — SCIENTIFIC VERDICT

The single quantity the experiment exists to measure — does coarse health/value disclosure reduce within-subclass safety heterogeneity — **could not be measured** because its inputs (per-twin hidden `health`/`value` integers and per-twin per-action evaluator labels) are not persisted in any spent-DEV artifact, and recovering them requires regenerating the spent twin families, which the owner prohibits.

- It is **not A** (no measured gain).
- It is **not B** (cannot affirm "information gain without safety value" — the safety value is exactly what is unmeasured, and B requires concluding the gain lacks safety value in tested data).
- It is **not C** (nothing found inadmissible; the bands are lawful-in-principle, identity-invariant, D4-invariant; no leakage obstacle surfaced).

The honest classification is:

> **`CLASSIFICATION = D — INCONCLUSIVE`**

with the **missing evidence** named precisely: *the per-twin hidden-coordinate-to-safety-label measurement is absent, and its production is gated on world/twin regeneration that has not been authorized.*

**Observability necessity: `NOT_PROVEN`** (separate from the classification; supported domain = the 341 spent, near-threshold-biased classes).

---

## PHASE 7 — FUTURE SCIENTIFIC DECISION

Because P2 shows no *measured* material safety-information gain, **no prospective V2 observation-contract experiment is proposed at this stage.** The minimum justified next step is not a new policy/model search but a narrowly-scoped **measurement-enablement decision**:

> **Authorize (or decline) regeneration of the 341 spent classes' twin families under a fresh DEV exploratory-identity budget, with per-twin hidden `health`/`value` and per-twin per-action evaluator utilities persisted to a new read-only measurement artifact — so the B/C/D safety-information measurement can be executed without touching sealed namespaces.**

If the owner instead prefers to keep the spent twins un-regenerated, the correct disposition is to leave H-W3‑P2 `D` and preserve `V1` unchanged as the deployed observation contract.

---

## REQUIRED RESULT

```
=== SENTINEL GRID STAGE 3H H-W3-P2 ===

STATUS=COMPLETE
CLASSIFICATION=D (INCONCLUSIVE)

BASE_HEAD=904fd517
H_W3_REPORT_LOCAL_COMMIT=904fd517

V4_NEGATIVE_VERDICT_FINAL=true
H_W1_NEGATIVE_VERDICT_FINAL=true
H_W2_PROVISIONAL_CLASSIFICATION_PRESERVED=true

DEV_CLASSES_ANALYZED=341
DEV_WORLDS_ANALYZED=0 (no regeneration; persisted samples lack hidden coordinates)
NEW_WORLD_IDENTITIES_GENERATED=0

HEALTH_BAND_SCHEMA=H0(0)/H1(20..49)/H2(100), structural nodes, ordinal
VALUE_BAND_SCHEMA=V0([2,spread+1])/V1(spread+2)/V2(spread+3), structural nodes, ordinal
COMBINED_BAND_SCHEMA=HEALTH x VALUE ordinal pair, structural nodes only

V1_SUBCLASSES=341
HEALTH_SUBCLASSES=UNMEASURED
VALUE_SUBCLASSES=UNMEASURED
COMBINED_SUBCLASSES=UNMEASURED

SAFETY_HETEROGENEITY_V1=224/341 classes
SAFETY_HETEROGENEITY_HEALTH=UNMEASURED
SAFETY_HETEROGENEITY_VALUE=UNMEASURED
SAFETY_HETEROGENEITY_COMBINED=UNMEASURED

COMMON_SAFE_INTERSECTIONS=NONEMPTY 341/341 (V1 condition)
SUBCLASS_COVERAGE=UNMEASURED
EFFECTIVE_SAMPLE_SIZE=UNMEASURED

P1_INFORMATION_GAIN=PARTIAL (constructive refinement, unmeasured magnitude)
P2_SAFETY_INFORMATION_GAIN=UNMEASURED
P3_SAFE_ACTION_IDENTIFIABILITY=UNMEASURED
P4_OBSERVABILITY_NECESSITY=NOT_PROVEN

IDENTITY_INVARIANCE=true (analytic)
D4_EQUIVARIANCE=true (analytic)
GAME_AGNOSTIC_FEASIBILITY=OPTIONAL_ADAPTER_CAPABILITY (not asserted universal)

RUNTIME_HIDDEN_INFORMATION_EXPOSED=false
V2_OBSERVATION_CONTRACT_DEPLOYED=false

NEW_SELECTOR_IMPLEMENTED=false
MODEL_TRAINED=false
VALIDATION_EXECUTED=false
SEALED_CAMPAIGN_EXECUTED=false

STATIC_IMPORT_CUT_UNCHANGED=true
UNATTRIBUTED_DRIFT_FILES_PRESERVED=9

FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

REMOTE_PUSH=false
A5_AUTHORIZED=false
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

NEXT_EXACT_OWNER_DECISION=authorize_or_decline_twin_regeneration_for_p2_measurement
```

---

## FINAL DIRECTIVE COMPLIANCE

- Measured whether coarse hidden health/value disclosure improves safety-relevant observability: **could not measure — the safety-relevant quantity's inputs are unpersisted and their regeneration is prohibited.** This is reported honestly as `D`, not as a fabricated null or a claimed gain.
- Preserved all frozen findings (V4 `NOT_QUALIFIED`, H-W1 `NOT_QUALIFIED`, H-W2 provisional, H-W3 `D`).
- Used only permitted spent DEV data; regenerated nothing; touched no sealed namespace.
- Did not deploy V2, modify the native world, train a selector, or conduct validation.
- Returned the measured information gain as **unmeasured-with-named-missing-evidence** and the minimum justified next decision as **a regeneration authorization**, not a new search.
- **Did not commit this P2 report** — left untracked pending a separate owner authorization.
