# H-W4B — Final Prospective Value-Band Policy Test (DEV, R0)

**STATUS: `H_W4B_BLOCKED_AT_PHASE_2` — CLASSIFICATION D: `H_W4B_INVALID_OR_BLOCKED`.**

The directive's Phase 2 stop rule fired. On the permitted synthetic fixtures, changing the ordinal value band changes
the frozen V2 C11 model's features, its risk scores and the order of its risk scores, but under every lawful band
state it never moves a risk score across the decision threshold, never changes the final ranking and never changes
the selected action. As instructed, the run stopped there: no fresh class was built, no population was frozen, and
neither C11 policy was run on any new world. H-W4B produced no safety measurement, in either direction.

Nothing was trained, committed, pushed, deployed or promoted. The H-W4 negative result (classification C) and the
frozen introduction audit are unchanged.

BASE_HEAD: `9175a5558eff2de537a610af7c1d4da15e9cc1c4` · node `v26.7.0` · evidence binding: `evidence/HW4B_STOP_RECORD.json`
sha256 `9af66b9f54bdcb737ec2dd600286552f3a961ff76d065663b66354973bb17096`

## 0. Starting state (found, not created, in this session)

An earlier H-W4B session (2026-11-04) had already written `hw4b-*.mjs`, `evidence/HW4B_PROTOCOL_FREEZE.json` and
`evidence/HW4B_NAMESPACE_ALLOCATION.json`, and had screened DEV blocks 901–910 into a 837-entry pool
(`work4b/`, gitignored) before it was interrupted. No process was live. That session left no Phase 0 erratum and no
Phase 1/2 evidence record; its Phase 2 script printed "decision sensitive: true" and it went on to allocate and
screen. This session re-did Phases 0–2 from the frozen sources and reached a different Phase 2 answer (section 3).

- The protocol freeze (sha256 `93c013eb…daff30`) predates every generated world (frozen 08:31:44Z, newest screening
  shard 08:41:03Z) and is unmodified. Its 17 bound source hashes and both model hashes show zero drift.
- The screening read only the frozen comparator arm-stress rule. No C11 decision or outcome exists for any H-W4B
  world. No class record, population manifest, registry, candidate freeze or result file exists.
- Blocks 901–910 have had their worlds generated and are therefore spent for screening. Blocks 911–914 are untouched.

## 1. Phase 0 — H-W4 action-family report reconciled

Additive erratum: `evidence/HW4_INTRODUCTION_AUDIT_ERRATUM_1.md` / `.json` (script `hw4b-phase0-reconcile.mjs`).
**The frozen class CSV is correct. Two frozen summaries were wrong or incomplete.** No frozen file was edited and no
validation was re-executed. Set arithmetic is preserved: S0_ONLY=18, NEXUS_ONLY=51, BOTH=14, UNIQUE=83, PASS_BOTH=517.

Selected C10 action type (mutually exclusive; every column sums to its failing-class count):

| selected action | vs S0 | vs Nexus | S0 only | Nexus only | both | unique |
|---|---|---|---|---|---|---|
| MOVE | 8 | 46 | 1 | 39 | 7 | 47 |
| RETREAT | 9 | 14 | 3 | 8 | 6 | 17 |
| RESTORE | 7 | 3 | 7 | 3 | 0 | 10 |
| REPAIR | 5 | 0 | 5 | 0 | 0 | 5 |
| BYPASS | 3 | 2 | 2 | 1 | 1 | 4 |
| **total** | **32** | **65** | **18** | **51** | **14** | **83** |

Effective comparator action type: S0 played MOVE 23, REPAIR 8, RESTORE 1 in the 32 S0 failures; Nexus-else-S0 played
REINFORCE 32, PROTECT 25, REPAIR 8 in the 65 Nexus failures (the Nexus orbit equals the S0 orbit in none of them).

Where the conflicting subtotals came from:

- **E1 — `HW4_VALIDATION_RESULTS.json` `introducedActionTypes` = {BYPASS 47, UNKNOWN 32, RESTORE 4} is mislabelled.**
  It indexed the first six one-hot feature columns with a hard-coded list (MOVE, PROTECT, RESTORE, RETREAT, BYPASS,
  REPAIR), but those columns are alphabetical (ATTACK, BUILD, BYPASS, COLLECT, MOVE, PROTECT). So "BYPASS 47" is MOVE
  47, "RESTORE 4" is BYPASS 4, and "UNKNOWN 32" is RETREAT 17 + RESTORE 10 + REPAIR 5. It is also a count over the
  union of 83 classes, not per comparator. The histogram was reproduced exactly from the frozen decisions.
- **E2 — the audit manifest omits REPAIR.** Its listed S0 subtotals sum to 27, not 32; the missing 5 are REPAIR.
- **E3 — audit Table D is correct** (sums to 32 and 65).
- **E4 — audit Table A's "base/twin" column uses a different predicate** (chosen action catastrophic on the base
  world) from the base counts (introduction on the base world). They differ in one row, HW4-VAL-486. The CSV
  `intro_on_base_*` columns are authoritative: base 16 / twin-only 16 vs S0, base 38 / twin-only 27 vs Nexus.

## 2. Phase 1 — C11 reproducibility gate: PASS (10/10)

Record: `evidence/HW4B_PHASE1_REPRODUCIBILITY.json` (script `hw4b-phase12.mjs`). Outcome-free. C11 decisions were
replayed only on the H-W4 EXPLORATION population (the models' own training data); no C11 decision was computed on the
spent H-W4 VALIDATION classes.

| # | check | result |
|---|---|---|
| 1 | weights and parameters exist | PASS — V1 `749d1d5f…09c56b` (130 weights/head), V2 `77136f46…23f03fc` (138); each matches the protocol freeze, the exploration evidence record and the blob committed at HEAD |
| 2 | training inputs and identities frozen | PASS — training manifest `5af97e58…1aef14`, class-list digest and 9 data files match; 12/12 training source hashes unchanged; validation / holdout / privileged features not accessed |
| 3 | identical architecture and objectives | PASS — same family, version, heads (nreg, cat), SAFE_FIRST rule, FULL spec, ridge (0.01 / 0.1), folds and dataset; shared standardisation identical. **Disclosed difference beyond the band: tau is 0.02 for V1 and 0.2 for V2** (tuned per arm by the same frozen grid and criterion) |
| 4 | matched public information except the band | PASS — 1,000/1,000 banded projections equal the V1 projection once the band is stripped; V2 rows = V1 rows + 8 binary columns |
| 5 | band connected to the scoring function | PASS — 6 of 8 band weights non-zero in each head (the two V0 weights are exactly 0) |
| 6 | no privileged evaluator information at inference | PASS — the decision takes the projection only; the band adapter reads only entity type, id, position, value and objective attachment |
| 7 | no hidden value beyond the band | PASS — changing a value inside a band leaves features identical; health and energy are never read |
| 8 | no static evaluator-capable dependency introduced | PASS **for the working tree only** — see below |
| 9 | identity and D4 invariance | PASS — 3,200 frame checks and 400 menu-permutation checks, 0 mismatches (projection level) |
| 10 | deterministic decisions in the source environment | PASS — identical digests in-process and in a separate process; the same runtime reproduces the frozen C10 decisions 600/600 in both arms |

Caveats that travel with this PASS:

- **Static boundary.** The policy closure is 10 files, hash-identical to the closure frozen in H-W4, with zero
  forbidden imports. That holds only with the uncommitted import cut in `stage3h-hw1-dev-v1/public-projection.mjs`
  (working tree `c4f9532e…db6c099`; HEAD `2d1e7061…eacb9ca`). At committed HEAD the same rule fails (76-file closure,
  40 violations). The closure also includes `src/forge/kernel.js`, reached through the orientation module; the frozen
  rule permits it and it was present in H-W4.
- **Recovery identities.** `evidence/HW4B_RECOVERY_MANIFEST.json` embeds the 5-line import-cut diff (code only) and
  records the two uncommitted population manifests and their class data files by hash and size only. No seed, world
  hash or truth is reproduced.
- **Frozen gates re-run:** 12/13 pass. G8 (P2R band round-trip) can no longer be evaluated because the gitignored
  scratch dataset it reads no longer carries reconstructed worlds. The adapter source is hash-identical to the
  revision that recorded 1,023/1,023 in H_W4.md. I did not re-establish G8.
- **Documentation.** The contract header describes V0 as "≤ 2"; the frozen code is `value < 2`. The code is what was
  trained. Not edited.

## 3. Phase 2 — band sensitivity: STOP

Record: `evidence/HW4B_PHASE2_BAND_SENSITIVITY.json`.

**Fixtures.** F1 is the hand-built `hw4-gates.mjs` world and projection, verbatim (two actions). F2 is the same world
with the five-action menu the earlier session recorded, whose actions target all three structural nodes. The only
other synthetic fixtures in the lanes (`i1-audit-synthetic.mjs`) contain no structural nodes and so carry no band.

**Lawful band states.** The generator draws non-objective structural values in [2, spread+3] and sets the
objective node to 12+spread; the kernel never changes a value. Checked against the 1,000 training projections
(structure only):

- Band V0 never occurs (0 of 14,270 structural nodes); the V0 weights in the model are exactly 0.
- Band P coincides exactly with the *public* objective flag (1,630 / 1,630, no exceptions either way).
- So the band's only non-public content is **V1 vs V2 on non-objective structural nodes** — one bit per node,
  marking a value at the top of its range.

The lawful test therefore holds the public projection fixed and enumerates every value of the two non-objective nodes
for spreads 2, 4, 6, 7 and 8: 297 value configurations and 20 band configurations per fixture.

| effect of a lawful band change on V2 C11 | F1 | F2 |
|---|---|---|
| model features | **changes** (2 distinct row sets) | **changes** (4) |
| native-action risk scores | **change**, up to 0.090 per action | **change**, up to 0.209 per action |
| order of the risk scores | no change | **changes** (4 distinct orders) |
| any risk score crossing tau = 0.2 | none (lowest score 0.84) | none (lowest score 0.72) |
| final SAFE_FIRST ranking | **no change** | **no change** |
| final action selection | **no change** (MOVE) | **no change** (MOVE toward the repair target) |
| V1 control | band-insensitive | band-insensitive |

Changing a value inside a band never changed anything (0 / 594), as the contract requires.

**Why the earlier session reported "decision sensitive".** Its grid included values 0 and 1 (band V0) and worlds with
the objective removed while the public flags stayed the same. On that grid F2 shows 9 selection-changing band
configurations — all 9 have the objective removed. With the objective present there are none, with or without V0.
Those states are not natively reachable, so they cannot support the gate.

**Limitation, stated plainly.** This is a statement about two small hand-built fixtures, in which every action's risk
score sits far above the threshold. It does not show that the band can never change a C11 decision on a real state.
Outcome-free structure on the training projections says the route is narrow rather than closed:

| training classes (1,000) | V1 C11 (tau 0.02) | V2 C11 (tau 0.2) |
|---|---|---|
| every action above tau (threshold saturated) | 913 | 568 |
| choice equals the plain nreg-head best action | 987 | 964 |

A V1→V2 change on a target moves the risk head by about +0.09 and the nreg head by −0.0016. The frozen out-of-fold
tuning tables also show the H_W4.md hint "55 vs 61" compared different taus: at matched tau the counts are 55 vs 58
(tau 0.2) and 59 vs 61 (tau 0.02) of 1,000.

Whether a lawful band change flips a decision on real projections was **not tested**: the directive restricts Phase 2
to existing synthetic fixtures, and I did not widen it.

## 4. Phases 3–5 — not executed

- Phase 3: the 2026-11-04 protocol freeze pre-exists and was left untouched. No candidate freeze was written.
- Phase 4: no class was built and no admission was frozen. `FRESH_DEV_CLASSES=0`. The exclusion loader is bound and
  its tamper check passes (all 6 sealed registries reject known fine and coarse identities; strict index 109,082
  excluded worlds), but no admission exercised it.
- Phase 5: neither policy was run. Every outcome field below is `NOT_MEASURED`.

Defects found in the pre-existing runner, none executed, all to be repaired before any future use:

1. `hw4b-validate.mjs` (and the frozen `hw4-validate.mjs`) pass `valueSpread` from manifest entries, which do not
   carry it. The identity audit therefore ran the V2 arm with an undefined threshold, so band V2 could never appear.
   This was harmless for the band-free C10 audited in H-W4; it would have mis-audited C11.
2. Its "band ablation flips" compare the ablated V2 model with V1's decisions rather than V2's own.
3. Its action-type histogram repeats the mislabelling in erratum E1.
4. It has no paired introduction-rate endpoint with origin-family-clustered intervals, and the frozen rule for
   classification B ("strictly fewer introductions in total") requires no statistical support.

## 5. Prohibitions respected

No new model; no other candidate; C11 unmodified; H-W4 validation results and audit files byte-identical
(`f24878df…`, `e7e8cfad…`, `144db753…`); no validation re-executed; no C11 decision on the audited H-W4 failure
classes; no sealed or held-out world; no threshold change; no tracked file in the lane modified; nothing staged,
committed, pushed, deployed or promoted. The nine `sgrid-lab/results/*` drift files, `SENTINEL_GRID_SUMMARY.md` and
the import-cut proposal were not touched.

## 6. Recommendation

H-W4B does not establish whether the value band improves safety, and it does not establish whether observability is
necessary. `OBSERVABILITY_NECESSITY=NOT_PROVEN`.

**Recommended: close the value-band policy line.** The band adds one bit per non-objective node beyond public
information; the prespecified H-W4 selection ignored it; at matched tau the frozen C11 pair differed by 2–3 classes
per 1,000 out of fold; both C11 policies behave almost entirely as plain regret rankers; and no lawful band state
changes the V2 decision on the permitted fixtures. A band-attributable effect large enough to remove the 30–65
introductions seen in H-W4 is not in prospect, so classification A is not a realistic outcome of running the
population.

**Alternative, if the owner wants Phase 2 settled on real states:** authorize one outcome-free counterfactual test —
flip V1↔V2 on non-objective nodes of the H-W4 EXPLORATION training projections and count V2 C11 decision changes. Only
if that count is non-zero would Phases 3–5 be worth running, on the already-screened pool, with the runner repaired
and a matched-tau and band-ablation control prespecified so a tau effect cannot be read as a band effect.

## REQUIRED RESULT

```
=== SENTINEL GRID STAGE 3H H-W4B ===

STATUS=H_W4B_BLOCKED_AT_PHASE_2
CLASSIFICATION=D (H_W4B_INVALID_OR_BLOCKED)

H_W4_NEGATIVE_VERDICT_PRESERVED=true
H_W4_AUDIT_RECONCILED=true (additive erratum; frozen CSV correct; results histogram mislabelled; manifest omitted REPAIR 5/0)

V1_C11_MODEL_HASH=749d1d5f7573bbe1466f6ad5ad909b0ab628f0f561f4cf9d77218984e309c56b
V2_C11_MODEL_HASH=77136f461ddcd42f0f2c7dc89b9d3989d04a80602fd645552eb49d26523f03fc
MODEL_REPRODUCIBILITY=PASS (10/10; tau differs by arm: V1 0.02, V2 0.2)
BAND_FEATURE_CONNECTED=true
BAND_SCORE_SENSITIVE=true (risk scores and their order; no tau crossing)
BAND_DECISION_SENSITIVE=false (no lawful band state changes final ranking or selection on the permitted fixtures)
STATIC_IMPORT_BOUNDARY=PASS_WORKING_TREE_ONLY (uncommitted import cut c4f9532e…; FAIL at committed HEAD)

FRESH_DEV_CLASSES=0 (none built or admitted; 837 screened pool entries pre-exist from the 2026-11-04 session)
ORIGIN_FAMILIES=0 (not applicable)
EXCLUSION_VALIDITY=LOADER_BOUND_TAMPER_CHECK_PASS (6 registries); not exercised by any admission
HOLDOUT_WORLDS=0

V1_INTRODUCTIONS_VS_S0=NOT_MEASURED
V2_INTRODUCTIONS_VS_S0=NOT_MEASURED
V1_INTRODUCTIONS_VS_NEXUS=NOT_MEASURED
V2_INTRODUCTIONS_VS_NEXUS=NOT_MEASURED

BOTH_COMPARATOR_FAILURE_OVERLAP=NOT_MEASURED
PAIRED_SAFETY_EFFECT_S0=NOT_MEASURED
PAIRED_SAFETY_EFFECT_NEXUS=NOT_MEASURED
CLUSTERED_CONFIDENCE_INTERVALS=NOT_COMPUTED

V1_V2_DECISION_FLIPS=NOT_MEASURED (synthetic lawful band changes: 0 selection changes)
ACTION_FAMILY_BREAKDOWN=NOT_MEASURED (H-W4 breakdown reconciled in erratum 1)
BASE_VS_TWIN_FAILURES=NOT_MEASURED

V1_REGRET_VS_S0=NOT_MEASURED
V2_REGRET_VS_S0=NOT_MEASURED
V1_REGRET_VS_NEXUS=NOT_MEASURED
V2_REGRET_VS_NEXUS=NOT_MEASURED

V2_ILLEGAL_ACTIONS=NOT_MEASURED (0 illegal in 4,000 Phase 1 replay decisions)
IDENTITY_INVARIANCE=PASS_PROJECTION_LEVEL (fresh-population twin audit NOT_RUN)
DETERMINISTIC_REPLAY=PASS
COMPUTE_GATE=PASS_ON_PHASE_1_SAMPLE (median 12.5 ms, max 80.7 ms; budget 100 / 1000) — fresh population NOT_RUN

V2_DEV_QUALIFIED=false
OBSERVABILITY_NECESSITY=NOT_PROVEN
UNIVERSAL_SAFETY_PROVEN=false

H_W4B_REPORT_PATH=platform/game-agnostic/stage3h-hw4-value-band-v1/H_W4B.md
H_W4B_EVIDENCE_HASH=9af66b9f54bdcb737ec2dd600286552f3a961ff76d065663b66354973bb17096 (sha256 of evidence/HW4B_STOP_RECORD.json, which binds every H-W4B artifact)

NEW_MODEL_TRAINED=false
HELDOUT_EXECUTED=false
SEALED_CAMPAIGN_EXECUTED=false
REMOTE_PUSH=false
A5_AUTHORIZED=false

V4_NEGATIVE_VERDICT_FINAL=true
H_W1_NEGATIVE_VERDICT_FINAL=true
FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

NEXT_EXACT_SCIENTIFIC_DECISION=owner decides: close the value-band policy line on the recorded evidence (recommended), OR authorize one outcome-free counterfactual V1<->V2 band test on the H-W4 EXPLORATION training projections and, only if it shows a decision change, resume Phases 3-5 on the screened pool with the runner repaired and a matched-tau / band-ablation control
```
