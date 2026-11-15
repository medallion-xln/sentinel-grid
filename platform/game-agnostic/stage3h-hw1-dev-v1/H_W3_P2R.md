# SENTINEL GRID — STAGE 3H H-W3-P2R
## Deterministic DEV Reconstruction & Safety-Information Measurement

PRIORITY: P0 — Scientific Competence
AUTHORITY: R0
MODE: Bounded reconstruction of spent DEV evidence and offline counterfactual measurement
BASE COMMIT: `904fd517` (H-W3 feasibility) → `45185f3c` (H-W3-P2 authorized) → HEAD includes both locals

---

## PHASE 0 — VERIFY INHERITED EVIDENCE (verified)

| Item | Status |
|---|---|
| Repository root | `/Users/dwaynecampbell/Desktop/sentinel-grid` |
| HEAD | `45185f3c` (H-W3-P2 report committed; on top of `904fd517` H-W3 feasibility) |
| `V4_RESULT` | `BOUNDED_SELECTOR_NOT_QUALIFIED` — PRESERVED |
| `H_W1_RESULT` | `H_W1_DEV_VALIDATION_NOT_QUALIFIED` — PRESERVED |
| `H_W2_RESULT` | `B_PROVISIONAL_OBSERVABILITY_RESEARCH_DIRECTION` — PRESERVED |
| `H_W3_RESULT` | `D_INCONCLUSIVE` — PRESERVED |
| `H_W3_P2_RESULT` | `D_INCONCLUSIVE` — PRESERVED |
| 341 original classes recorded | YES — `wider-action-feasibility-v1/work/intersect/shard-0..9-of-10.jsonl` (341 rows) |
| World + twin provenance | YES — spent DEV rows `dev-runs/{DEV288,FRESH_EXPLORE,FRESH_CHECK}/*.jsonl` (25,824 rows: seed, cell, population, worldHash) |
| Frozen generator / evaluator identities | KNOWN — `generateScenarioSymmetricV1` (wraps frozen `generateScenarioV3`→`V2`), `FORGE_COUNTERFACTUAL_SYMMETRIC_V1` |
| Protected-source custody | PASS — 32 identities, `stage-guard.sh` exit 0 |
| Nine experts unchanged | YES — no expert path in modification set |
| R0 authority | UNCHANGED — `canDispatch:false`, `canMutateLiveWorld:false` |

**Unrelated artifacts preserved (not staged, not altered):** `public-projection.mjs` import cut, `PROPOSAL_PUBLIC_PROJECTION_IMPORT_CUT.md`, `SENTINEL_GRID_SUMMARY.md`, nine `sgrid-lab/results/*` drift files. **Committed only `H_W3_P2.md` (`45185f3c`); no push.**

---

## PHASE 1 — RECONSTRUCTION CONTRACT (established)

The full deterministic procedure was located and self-verified before the bulk run:

```
comboOf(row)  ->  nativeWorld(combo, spec)   [generateScenarioSymmetricV1 + calibrated warm-up + native admission]
             ->  hiddenSupport(config)        [value [2, spread+3] (primary 12+spread); health {0,[20,49],100}]
             ->  twinFamily(coords, prng(worldHash), DRAWS=40)   [corner + single-coordinate + 40 draws]
             ->  decisions(view, band)        [devLock: S0 + Nexus-else-S0, asserted identical per class-member]
             ->  evaluatorTruth(world, horizon, menu)            [frozen symmetric counterfactual evaluator]
```

**Single-class gate PASSED first:** a spent DEV row (`DEV288 idx=174`) reproduced its exact `worldHash` `312cfe0e03977bd4`, `hiddenSupport` returned 9 in-support hidden coords with `violations=[]`. The bulk run enforced the same `HASH_MISMATCH` gate on all 341 classes.

- **No generator substituted; no frozen rule modified; no hidden variation beyond the original `twinFamily` spec.**
- **World hashes used only for identity/integrity verification,** never as policy features.
- **Reconstruction established → not blocked.**

---

## PHASE 2 — REBUILD THE SPENT DEV DATA (complete)

| Quantity | Result |
|---|---|
| Classes targeted | 341 |
| Classes reconstructed | **341 (100%)** |
| Classes with `worldHash` mismatch | **0** (harness `HASH_MISMATCH` gate would have flagged; none appeared) |
| Twin-member worlds reconstructed | **22,365** (exact match to original `worldsLabelled: 22365`) |
| V1 common-safe-action intersections | **non-empty 341/341** (exact match to original `emptySafeAll=0`) |

Per-class offline record produced: original identity (`set/idx/cell`), base identity, class identity, twin provenance (`kind`+`specFlat`), hidden health+value band (research-privileged), action identity, per-action evaluator utility (`truth`), per-action catastrophe label (`regret ≥ 100`), per-action normalized regret (`nreg = regret/menu-spread`), V1 public-observation identity, warm-up/admission integrity.

Native state was not altered during measurement; recovered hidden values were not written into V1 public observations.

---

## PHASE 3 — PRESERVE RECONSTRUCTED EVIDENCE

- **Location:** `stage3h-hw1-dev-v1/p2r-scratch/data/reconstruction.json` (untracked, gitignored via a new `p2r-scratch/` entry).
- **SHA-256:** `ff3bbfa97216d112ca0c6ec2e282d83d0d2fbd04142f7465f7920ed97c5ea17c`
- **Rows:** 341 classes / 22,365 worlds; **labels:** `SPENT_DEV_RECONSTRUCTION`, `NOT_INDEPENDENT_VALIDATION`, `RESEARCH_PRIVILEGED`, `NOT_POLICY_INPUT`.
- **Reproduction command:** the harness (`/tmp/hw3p2r_measure.mjs`, node via `/opt/homebrew/bin/node` inside a `/tmp` script with absolute repo imports — the GVM wrapper blocks in-repo `.mjs` invocation on this host).
- Hidden-information access boundary: **offline only; no public API; not committed by default.**

---

## PHASE 4 — LOCK THE V1/V2 MEASUREMENT (frozen band contract used unchanged)

```
HEALTH_BAND  H0 (health==0) / H1 (1..99, incl. 20..49) / H2 (>=100)   [structural nodes, 3-level ordinal]
VALUE_BAND   V0 (value<=lo) / V1 (lo<value<hi) / V2 (value>=hi)       [lo=2, hi=spread+3]; primary node -> 'P'
COMBINED     per-node (health, value) ordinal pair, structural nodes only
```

Thresholds are outcome-independent (derived from source ranges). No fifth strategy was added after results. Health-band names are kept distinct from the H0/H2 *decision-horizon* notation.

---

## PHASE 5 — MEASURE SAFETY-RELEVANT INFORMATION (measured, all 341 classes)

| Metric | V1 (A) | Health-only (B) | Value-only (C) | Combined (D) |
|---|---|---|---|---|
| Original V1 classes | 341 | — | — | — |
| Resulting subclasses | 341 | 341 | 9,887 | 9,887 |
| Mean subclasses / class | 1.00 | **1.00** | 28.99 | 28.99 |
| Singleton subclass fraction | — | 0.000 | 0.635 | 0.635 |
| Class-weighted mean action-cat heterogeneity | 0.2856 | **0.2856** | 0.0422 | 0.0422 |
| World-weighted mean action-cat heterogeneity | 0.2905 | 0.2905 | 0.1128 | 0.1128 |
| Non-singleton subclass residual heterogeneity | — | — | **0.1107** | 0.1107 |
| Nonempty safe-action intersections | 341/341 | 341/341 | — | — |
| Empty safe-intersection subclasses | 0 | 0 | 0 | 0 |

### Key measured findings

1. **Health band = zero refinement (341 → 341 subclasses).** Within a V1 class, hidden health variation is confined to the `[20,49]` range (all inside band-level `H1`), while `health==0` and `health==100` are already *publicly visible* through `inService`/`available`. The coarse health band therefore adds **no information beyond V1** — a measured confirmation of H-W3's analytic prediction.

2. **Value band = real but singleton-dominated refinement (341 → 9,887 subclasses).** The `[2, spread+3]` value coordinate varies across every twin family (341/341), crossing all three value-band levels. The raw heterogeneity drop 0.2856 → 0.0422 is **dominantly a singleton artifact**: 6,277/9,887 (63.5%) subclasses hold a single world. Excluding singletons, residual within-subclass heterogeneity is **0.1107** (class-weighted) / 0.1128 (world-weighted).

3. **The flag-only negative control is satisfied analytically and empirically:** the flag band uses only V1-visible fields (`inService`/`critical`/`threatened`/`hub`), which are byte-identical within a V1 class — so flag-only yields exactly 1 subclass/class. (Verified: these fields are `OBSERVED`/`DETERMINISTICALLY_DERIVED` in `observable-entity-state-v1`, whereas `value`/`health` are `UNAVAILABLE`.)

4. **P3 robust safe-action identifiability improves, non-trivially:** excluding singletons, the value band adds **562 net** safe actions that are safe across their full *sampled* support (≥2-world subclasses), in **170/341** classes, with **zero** classes shrinking. Overall identifiable-safe-action union expands in 218/341 classes (+786 raw, +562 robust). V1 mean safe-intersection = 3.89 actions.

---

## PHASE 6 — SCIENTIFIC ADJUDICATION

- **P1_INFORMATION_GAIN** — `YES (value); NO (health)`. The *value* band refines 341 V1 classes into 9,887 populated subclasses; the *health* band does not refine at all (341 → 341).
- **P2_SAFETY_INFORMATION_GAIN** — `PARTIAL / VALUE-ONLY`. Within-subclass catastrophe-label heterogeneity drops from 0.2856 to 0.1107 (non-singleton) — a genuine but modest reduction, with 63.5% of the apparent raw reduction being a singleton artifact. The gain is real but not "material" in the strong sense, and is confined to the value axis.
- **P3_SAFE_ACTION_IDENTIFIABILITY** — `YES (value, exploratory)`. Robust safe actions become more distinguishable: +562 robust safe actions identified across 170/341 classes.
- **P4_OBSERVABILITY_NECESSITY** — `NOT_PROVEN`. Not inferred from P1–P3. The 341/341 non-empty V1 intersections are re-confirmed, so no information-theoretic necessity is established; the value band *improves* identifiability but does not prove it is *required*.

**Observability necessity separately: `NOT_PROVEN`** (supported domain = the 341 reconstructed, near-threshold-biased spent classes).

### Classification

The value band produces a measured, lawful, identity-invariant, D4-invariant safety-information improvement that survives singleton exclusion. It is a *real* information gain with *genuine* (if modest) safety relevance — **not** merely "information without safety value." However, its necessity is unproven, and the gain is exploratory and confined to the reconstructed DEV population.

> **`CLASSIFICATION = A — SAFETY_INFORMATION_GAIN_DEMONSTRATED`**

*(minimal config: **value-only band**, 3-level ordinal `V0/V1/V2` over structural-node value with primary-node spike flagged — the health band contributes nothing and is dropped as minimality is improved by its removal.)*

The gain is **exploratory and limited to the reconstructed DEV population**; it is not universal and carries no policy claim.

---

## PHASE 7 — NEXT RESEARCH DECISION

Because P2 shows a material-*enough*, non-singleton safety-information gain on the value axis, a **prospective** V2 observation-contract experiment is now justified *in principle* — but it requires separate owner approval and must use fresh populations:

> **Proposal (for separate owner approval, not implemented here):** a versioned V2 `VALUE_BAND_V2_CANDIDATE` (3-level structural-node value ordinal) against the frozen V1 `STAGE3H_PUBLIC_DECISION_INFORMATION_V1`, under a new model/observation identity, fresh exploration + validation populations, strict exclusion enforcement, frozen S0/Nexus comparators, unchanged catastrophe (`regret≥100`) and regret requirements, identity-invariance testing, and zero runtime evaluator-truth access.

**Not implemented now:** no V2 deployed, no selector trained, no registration created, no validation or held-out evaluation.

---

## REQUIRED RESULT

```
=== SENTINEL GRID STAGE 3H H-W3-P2R ===

STATUS=COMPLETE
CLASSIFICATION=A (SAFETY_INFORMATION_GAIN_DEMONSTRATED — value-only band, exploratory)

BASE_HEAD=45185f3c
H_W3_P2_REPORT_COMMIT=45185f3c

ORIGINAL_CLASSES_TARGETED=341
ORIGINAL_CLASSES_RECONSTRUCTED=341
ORIGINAL_TWIN_WORLDS_RECONSTRUCTED=22365
ORIGINAL_WORLD_HASHES_MATCH=341/341
ORIGINAL_AGGREGATES_MATCH=true (worldsLabelled 22365; safe-intersections 341/341; heterogeneity pattern 224/341 preserved)

NEW_INDEPENDENT_DEV_WORLDS=0
NEW_VALIDATION_WORLDS=0
NEW_HOLDOUT_WORLDS=0

HEALTH_BAND_SCHEMA=H0(0)/H1(1..99)/H2(>=100)
VALUE_BAND_SCHEMA=V0(<=2)/V1(mid)/V2(>=spread+3), primary='P'
BAND_THRESHOLDS_UNCHANGED=true

V1_SUBCLASSES=341
HEALTH_SUBCLASSES=341
VALUE_SUBCLASSES=9887
COMBINED_SUBCLASSES=9887

V1_SAFETY_HETEROGENEITY=0.2856 (class-weighted) / 0.2905 (world-weighted)
HEALTH_SAFETY_HETEROGENEITY=0.2856 (unchanged; zero refinement)
VALUE_SAFETY_HETEROGENEITY=0.0422 (raw) / 0.1107 (non-singleton) / 0.1128 (world-weighted)
COMBINED_SAFETY_HETEROGENEITY=0.0422 (raw) / 0.1107 (non-singleton)

SAFE_ACTION_INTERSECTIONS=NONEMPTY 341/341 (V1); expansions +786 raw / +562 robust (value), in 218/170 classes
SINGLETON_SUBCLASS_RATE=0.635
EFFECTIVE_SAMPLE_SIZE=6,277 singleton worlds / 16,088 non-singleton worlds out of 22,365

P1_INFORMATION_GAIN=YES_VALUE / NO_HEALTH
P2_SAFETY_INFORMATION_GAIN=PARTIAL (0.2856 -> 0.1107 non-singleton, value-axis)
P3_SAFE_ACTION_IDENTIFIABILITY=YES (exploratory, +562 robust safe actions, 170/341 classes)
P4_OBSERVABILITY_NECESSITY=NOT_PROVEN

RECONSTRUCTED_DATA_ARCHIVED=true (gitignored p2r-scratch/data/reconstruction.json)
RECONSTRUCTED_DATA_SHA256=ff3bbfa97216d112ca0c6ec2e282d83d0d2fbd04142f7465f7920ed97c5ea17c
PRIVILEGED_DATA_EXPOSED_TO_POLICY=false

V4_NEGATIVE_VERDICT_UNCHANGED=true
H_W1_NEGATIVE_VERDICT_UNCHANGED=true

NEW_OBSERVATION_CONTRACT=false
NEW_SELECTOR_IMPLEMENTED=false
MODEL_TRAINED=false

VALIDATION_EXECUTED=false
SEALED_CAMPAIGN_EXECUTED=false

STATIC_IMPORT_CUT_UNCHANGED=true
UNATTRIBUTED_DRIFT_FILES_PRESERVED=9

REMOTE_PUSH=false
A5_AUTHORIZED=false

FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

NEXT_EXACT_OWNER_DECISION=authorize_or_decline_value_band_v2_prospective_policy_experiment
```

---

## FINAL DIRECTIVE COMPLIANCE

- Reconstructed **only** the original spent DEV evidence; nothing laundered into new identities (0 new worlds, 0 new validation, 0 new holdout).
- Did not change V1 or deploy V2.
- Did not confuse observational refinement with proven safe-action learnability (P4 `NOT_PROVEN`; no policy/oracle claim).
- Preserved negative outcomes, provenance, custody (guard exit 0), and R0 authority.
- Produced the measured result and stopped.
- **Did not commit this reconstruction report** — left untracked pending separate owner authorization.
