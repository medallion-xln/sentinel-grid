# H-W4 introduction audit — ERRATUM 1 (additive; H-W4B Phase 0)

**Scope.** Independent re-aggregation of the 32 S0 and 65 Nexus-else-S0 introduction classes from the frozen
`HW4_INTRODUCTION_CLASSES.csv` (sha256 `e7e8cfad9cdbcf1400f56568915123f217e99744007e392d4cbd539e84c8c840`). Nothing frozen was edited and no validation was re-executed.
**The CSV is correct. Two frozen summaries were wrong or incomplete; this erratum supersedes them for action-family
counts only.** H-W4 classification C, `V2_DEV_QUALIFIED=false`, `V1_V2_SAFETY_EFFECT=0` are unchanged.

## 1. Set arithmetic (preserved)

S0_ONLY=18, NEXUS_ONLY=51, BOTH=14, UNIQUE_FAILURE_CLASSES=83, PASS_BOTH=517
(18+14=32; 51+14=65; 83+517=600).

## 2. Selected C10 action type (authoritative; mutually exclusive)

| selected action | vs S0 | vs Nexus | S0 only | Nexus only | both | unique classes |
|---|---|---|---|---|---|---|
| BYPASS | 3 | 2 | 2 | 1 | 1 | 4 |
| MOVE | 8 | 46 | 1 | 39 | 7 | 47 |
| REPAIR | 5 | 0 | 5 | 0 | 0 | 5 |
| RESTORE | 7 | 3 | 7 | 3 | 0 | 10 |
| RETREAT | 9 | 14 | 3 | 8 | 6 | 17 |
| **total** | **32** | **65** | **18** | **51** | **14** | **83** |

PROTECT, WAIT, REINFORCE and ATTACK: 0 in every column. Each column sums to its failing-class count.

## 3. Effective comparator action type

The action type the comparator actually played in the failing classes (S0 orbit for the S0 set; Nexus-else-S0 orbit for
the Nexus set — Nexus abstention already resolved to S0 in the class record).

| comparator action | S0 comparator, 32 S0 failures | Nexus-else-S0 comparator, 65 Nexus failures |
|---|---|---|
| MOVE | 23 | 0 |
| PROTECT | 0 | 25 |
| REINFORCE | 0 | 32 |
| REPAIR | 8 | 8 |
| RESTORE | 1 | 0 |
| **total** | **32** | **65** |

Selected → comparator transitions, vs S0: BYPASS->MOVE ×3; MOVE->MOVE ×3; MOVE->REPAIR ×4; MOVE->RESTORE ×1; REPAIR->MOVE ×5; RESTORE->MOVE ×7; RETREAT->MOVE ×5; RETREAT->REPAIR ×4.

Selected → comparator transitions, vs Nexus: BYPASS->PROTECT ×2; MOVE->PROTECT ×14; MOVE->REINFORCE ×24; MOVE->REPAIR ×8; RESTORE->PROTECT ×3; RETREAT->PROTECT ×6; RETREAT->REINFORCE ×8.

Among the 65 Nexus failures the Nexus-else-S0 orbit equals the S0 orbit in 0 classes.

## 4. Original action-family classification — reconciled

| source (frozen, not edited) | what it reported | status |
|---|---|---|
| `HW4_VALIDATION_RESULTS.json` `introducedActionTypes` | {"BYPASS":47,"RESTORE":4,"UNKNOWN":32} (sum 83) | **incorrect labels** (E1) |
| `HW4_INTRODUCTION_AUDIT_MANIFEST.json` counts | MOVE 8/46, PROTECT 0/0, RESTORE 7/3, RETREAT 9/14, BYPASS 3/2 (S0 subtotal 27) | **incomplete**: REPAIR 5/0 omitted (E2) |
| `HW4_INTRODUCTION_AUDIT.md` Table D | per-comparator family counts summing to 32 / 65 | correct (E3) |
| `HW4_INTRODUCTION_CLASSES.csv` | per-class selected action | **correct, authoritative** |

**E1 — HW4_VALIDATION_RESULTS.json candidates[].introducedActionTypes (frozen; NOT edited) — INCORRECT_LABELS.** The histogram {"BYPASS":47,"RESTORE":4,"UNKNOWN":32} was computed as hardcoded[rows[chosen].slice(0,6).indexOf(1)] with hardcoded=["MOVE","PROTECT","RESTORE","RETREAT","BYPASS","REPAIR"], but the feature one-hot columns follow FORGE_ACTION_TYPE_NAMES (alphabetical): first six = ["ATTACK","BUILD","BYPASS","COLLECT","MOVE","PROTECT"] of 12 types. The labels are therefore a positional mislabelling over the UNION of 83 failing classes, not per-comparator counts. True mapping (original<=true): {"BYPASS<=MOVE":47,"RESTORE<=BYPASS":4,"UNKNOWN<=REPAIR":5,"UNKNOWN<=RESTORE":10,"UNKNOWN<=RETREAT":17}.

**E2 — HW4_INTRODUCTION_AUDIT_MANIFEST.json counts (frozen; NOT edited) — INCOMPLETE.** The manifest lists MOVE/PROTECT/RESTORE/RETREAT/BYPASS per comparator but omits REPAIR. Listed S0 subtotals sum to 27 (not 32): the missing 5 are REPAIR (vs S0 = 5, vs Nexus = 0). Listed Nexus subtotals sum to 65. Every listed value is individually correct.

**E3 — HW4_INTRODUCTION_AUDIT.md Table D (frozen; NOT edited) — CORRECT.** Table D chosen-action family counts equal the independent CSV aggregation and sum to 32 / 65.

**E4 — HW4_INTRODUCTION_AUDIT.md Table A column "base/twin" (frozen; NOT edited) — LABEL_USES_DIFFERENT_PREDICATE.** Table A labels a row "base" when the chosen action is catastrophic on the base world (chosen_catastrophe_base), whereas the Table D / manifest base counts use introduction-on-base (intro_on_base_s0). Rows where the two predicates differ: 1 (HW4-VAL-486). The authoritative base/twin split is the CSV intro_on_base_* columns.

The E1 histogram is reproduced exactly from the frozen decisions (`ORIGINAL_HISTOGRAM_REPRODUCED_EXACTLY=true`),
which proves the mechanism rather than inferring it.

## 5. Base world vs twin-only (authoritative: CSV intro_on_base_* columns)

vs S0: base 16, twin-only 16 (of 32). vs Nexus: base 38, twin-only 27 (of 65).

## 6. Checks

- SELECTED_VS_S0_SUMS_TO_32: true
- SELECTED_VS_NEXUS_SUMS_TO_65: true
- SELECTED_UNION_SUMS_TO_83: true
- PARTITION_SUMS: true
- COMPARATOR_VS_S0_SUMS_TO_32: true
- COMPARATOR_VS_NEXUS_SUMS_TO_65: true
- ORIGINAL_HISTOGRAM_REPRODUCED_EXACTLY: true
- ORIGINAL_HISTOGRAM_SUMS_TO_83: true
- CSV_MATCHES_SOURCE_SELECTED_ACTIONS: true
- V1_V2_IDENTICAL_DECISIONS: true

Frozen identities: CSV `e7e8cfad9cdbcf1400f56568915123f217e99744007e392d4cbd539e84c8c840`; audit MD `144db753de176d7302a3fc5a10e679efbbb4e7e9be7b2966973952362780a11e`; audit manifest `67edbc71345397f258f9967fe6038a0b71fbd3fb78aa57790ffb96fda59344cf`;
validation results `f24878df4c444635f6edcfa8ac8feed7a70fa4bb9e4f377bec7c618bea2df6c0`; audit script `1c0b08b5f065c042f5df6790075d6c608c0887c38d9351cb65c5c6e6b0006629`.
