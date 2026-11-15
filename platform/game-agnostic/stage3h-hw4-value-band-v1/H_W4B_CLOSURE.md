# H-W4B — Scientific Closure, Evidence Custody and Research Redirect

AUTHORITY: R0 · BASE HEAD: `9175a5558eff2de537a610af7c1d4da15e9cc1c4` · MODE: documentation-only closure and
read-only integrity audit · OWNER DECISION: close the value-band policy research line

```
VALUE_BAND_POLICY_LINE=CLOSED
H_W4B_STATUS=BLOCKED_AT_PHASE_2
H_W4B_PERFORMANCE_RESULT=NOT_MEASURED
V2_DEV_QUALIFIED=false
VALUE_BAND_INFORMATION_GAIN=EXPLORATORY_SUPPORTED
VALUE_BAND_POLICY_ADVANTAGE=NOT_ESTABLISHED
OBSERVABILITY_NECESSITY=NOT_PROVEN
UNIVERSAL_SAFETY_PROVEN=false
```

H-W4B is closed as classification D (`H_W4B_INVALID_OR_BLOCKED`). It is a blocked experiment, not a completed
policy-performance evaluation: neither frozen C11 policy was run on any fresh world, and no safety or regret number
exists for it. H-W4 keeps its own, separate classification C. The two are not merged.

Companion records: `H_W4B.md` (the blocked run), `H_W4B_ENGINEERING_RISK_REGISTER.md` (defects, unrepaired),
`evidence/HW4B_STOP_RECORD.json`, `evidence/HW4B_BLOCK_SPEND_LEDGER.json`, `evidence/HW4B_REGISTRY_SCREENED.json`,
`evidence/HW4B_CLOSURE_MANIFEST.json` (sha256 of every file in the closure commit).

## 1. Scientific baseline verified (Phase 0)

- Repository root `/Users/dwaynecampbell/Desktop/sentinel-grid`, branch `main`, HEAD `9175a555`, nothing staged at
  the start, no stage process running.
- Custody guards active and hash-identical to their documented values: `pre-commit` and `pre-merge-commit` (stage
  guard, 31 protected identities, none in the index), `pre-push` (refuses every push). The guard manifest verifies
  5/5. No `core.hooksPath` override.
- Worktree at the start: the ten pre-existing tracked modifications (the uncommitted import cut in
  `stage3h-hw1-dev-v1/public-projection.mjs` and nine `sgrid-lab/results/*` drift files) and untracked H-W4B files.
  None of the ten was touched or staged.
- Expert roster unchanged: `SENTINEL_EXPERT_ROSTER_V1`, nine experts (Prime, Vanguard, Oracle, Nexus, Horizon,
  Archimedes, Alexandria, Picasso, Forge), roster hash `b25ca0b3…51e46b6`, in
  `artifacts/stage3g-freeze/stage3g-freeze.json`, unmodified since commit `8189d7ea` (2026-10-01).
- Authority state unchanged: `AUTHORITY=R0`, `CAN_DISPATCH=false`, `CAN_MUTATE_LIVE_WORLD=false`
  (authority hash `9d651763…3f8a092`, same file). R0 is the only authority state.

Prior findings preserved. Each record is tracked and byte-unmodified in the working tree:

| finding | record | status preserved |
|---|---|---|
| V4 | `stage3h-owner-governed-v1/QUALIFICATION_DOSSIER_7c41ba89.md` (commits `e46329cc`, `38f7c1d6`) | `BOUNDED_SELECTOR_NOT_QUALIFIED`; `V4_NEGATIVE_VERDICT_FINAL=true` |
| H-W1 | `stage3h-hw1-dev-v1/H_W1_CLOSURE.md` (`d706b689`) | `H_W1_DEV_VALIDATION_NOT_QUALIFIED`, closed; final |
| H-W2 | `stage3h-hw1-dev-v1/H_W2_DECISION.md` (`2cf71e1d`) | `B_PROVISIONAL_OBSERVABILITY_RESEARCH_DIRECTION` — provisional, an engineering hypothesis |
| H-W3-P2R | `stage3h-hw1-dev-v1/H_W3_P2R.md` (`135700d2`) | A, safety-information gain demonstrated for the value-only band — exploratory, reconstructed DEV population only, no policy claim |
| H-W4 | `H_W4.md` (`9175a555`) | classification C, `H_W4_V2_NO_MEANINGFUL_POLICY_ADVANTAGE`; 32 / 65 introductions in both arms |
| H-W4 introduction audit | `evidence/HW4_INTRODUCTION_CLASSES.csv`, `HW4_INTRODUCTION_AUDIT.md` (`9175a555`) | 83 unique classes: 18 S0-only, 51 Nexus-only, 14 both; 517 pass both |
| H-W4B | `H_W4B.md`, `evidence/HW4B_STOP_RECORD.json` | blocked at Phase 2, classification D |

## 2. H-W4B stop record reconciled (Phase 1)

- `evidence/HW4B_STOP_RECORD.json` sha256 = `9af66b9f54bdcb737ec2dd600286552f3a961ff76d065663b66354973bb17096`,
  re-computed and equal to the value in `H_W4B.md`. All 19 artifact hashes it binds match the files on disk, as do
  the three frozen H-W4 identities it pins.
- Frozen C11 model identities, re-hashed:
  - V1 `749d1d5f7573bbe1466f6ad5ad909b0ab628f0f561f4cf9d77218984e309c56b`
  - V2 `77136f461ddcd42f0f2c7dc89b9d3989d04a80602fd645552eb49d26523f03fc`
- **Tau mismatch: `V1_TAU=0.02`, `V2_TAU=0.2`.** The threshold was tuned separately in each arm. The frozen C11 pair
  is therefore not a controlled band-only contrast, and no matched-tau contrast was established.

Phase 2 findings, complete:

| finding | result |
|---|---|
| band feature connected to the scoring function | yes — 6 of 8 band weights non-zero in each head |
| band-sensitive risk scores | yes — up to 0.209 per action |
| band-sensitive ordering of risk scores | yes — on the five-action fixture |
| final-action change on lawful tested fixtures | **none** — 0 selection changes in 40 fixture × spread × band cells (594 value configurations) |
| crossing of the applicable frozen tau (0.2) | **none** — lowest risk score 0.72 |
| earlier "decision flips" | depended on unreachable states: all 9 had the objective removed |
| new safety evaluation | none |
| new qualification | none |

## 3. Interrupted experiment state, verified against the ledgers (Phase 2)

Statuses below come from the allocation record, the screen shards on disk, the strict exclusion index, the sealed
registries and a repository text scan, not from the narrative. Record: `evidence/HW4B_BLOCK_SPEND_LEDGER.json`.

| item | verified status |
|---|---|
| allocation record | hash-valid; DEV blocks 901–914; HOLDOUT not allocated, 0 generated |
| blocks 901–910 | **screened and spent** — 9 shards each (90 files), 6,384 worlds each (63,840), equal to the allocation's schedule counts |
| blocks 911–914 | **allocated, never generated** — no shard, no strict-index entry, 0 seed occurrences in any repository text |
| screened pool | 837 entries, reproduced exactly from the shards; 885 raw admitted = 837 + 41 family-cap + 7 coarse-duplicate |
| class records, population, registry, candidate freeze, results | none exist |
| completed new validation evaluation | none |
| held-out evaluation | none |
| other allocation ledgers (H-W1, H-W4) | neither allocates nor forbids any of 901–914 |
| collisions of the 885 admitted identities with the six prior sealed registries | 0 |

Custody decisions recorded here:

- The screened worlds are **not fresh**. Their comparator outcomes were read by the frozen screening rule. That no
  candidate evaluated them does not restore freshness.
- The 837-entry pool **must not be promoted or reused** for any future independent validation.
- The 885 screening/admission identities are preserved in `evidence/HW4B_REGISTRY_SCREENED.json`, a sealed registry
  in the frozen registry format (seal `a9ccaf76…5dbda121`), which the frozen loader accepts and which rejects every
  one of the 885. Entry ids are opaque aliases; the file carries no seed, schedule index or world hash.
- Blocks 911–914 stay reserved by a frozen allocation record for a closed experiment. Retiring them with the lane
  is recommended; that is an owner decision.

**Exclusion custody is incomplete. Precise exceptions:**

1. No executable loader forbids blocks 901–914. The strict index lists none of them and none of the 885 identities;
   no allocator's forbidden list contains them. Enforcement starts only when a future allocator forbids 901–914 and
   loads the new registry. No source was changed in this closure.
2. Identities were retained for the 885 admitted entries only. The other screened worlds are protected only while
   the whole block stays forbidden.
3. Seeds and world hashes exist only in gitignored `work4b/`, with no independent backup of the repository.
4. A clean checkout carries none of those seeds, so the repository text scan would not reject blocks 901–910 there.

## 4. Engineering defects (Phase 3)

Thirteen entries are recorded, unrepaired, in `H_W4B_ENGINEERING_RISK_REGISTER.md`, each with source location,
trigger, scope, historical impact, supporting evidence, minimal repair and clean-checkout status. The four named in
the closure directive:

- **Identity audit never produces band V2 for the V2 arm.** H-W4 results unchanged, because the audited C10 models
  use no band column; the claim that the audit exercised the V2 contract is narrowed.
- **Tau mismatch.** No effect on H-W4 (C10 has tau 0.2 in both arms). C11 is the only one of 13 candidate pairs
  affected.
- **Static import boundary.** PASS in the working tree with the uncommitted cut; **FAIL at committed HEAD**
  (76-file closure, 40 violations). H-W4's evidence pins a file revision that exists in no commit.
- **Missing P2R scratch evidence.** The G8 round-trip cannot be re-run. The original claim is unverifiable, not
  refuted, and no H-W4 number depends on it.

No historical numerical result changes. One reported field (`introducedActionTypes`) was wrong and is corrected by
the additive erratum.

## 5. Final scientific disposition (Phase 4)

**What was observed.** The frozen C11 V2 policy consumes the value band: its features, its risk scores and the order
of its risk scores change when the band changes. On the two permitted synthetic fixtures, across every lawful band
state, its selected action did not change and no risk score crossed its threshold.

**Boundary of the conclusion.**

- That observation is about two small hand-built fixtures in which every action's risk score lies far above the
  threshold. It does **not** establish that the band can never change a decision on a native world.
  `UNIVERSAL_DECISION_INSENSITIVITY_PROVEN=false`.
- No H-W4B fresh-population safety effect exists, positive or negative. `H_W4B_PERFORMANCE_RESULT=NOT_MEASURED`.
- The value band's information gain remains what H-W3-P2R and H-W4 Phase 1 reported: an exploratory, DEV-limited
  observational property (catastrophe-status heterogeneity 0.2856 → 0.1084; +562 robust-safe actions across 170 of
  341 classes). `VALUE_BAND_INFORMATION_GAIN=EXPLORATORY_SUPPORTED`.
- No policy has turned that information into a safety advantage. In H-W4 the selected policies ignored the band and
  were identical; in H-W4B the band-consuming pair was never evaluated. `VALUE_BAND_POLICY_ADVANTAGE=NOT_ESTABLISHED`.
- Neither result shows that additional observability is necessary or unnecessary for safety.
  `OBSERVABILITY_NECESSITY=NOT_PROVEN`. `UNIVERSAL_SAFETY_PROVEN=false`.

**What is closed.** The value-band policy research line. H-W4B is not to be resumed; the training-projection
sensitivity test proposed in `H_W4B.md` §6 is not authorized and was not run; no further value-band campaign is
planned.

## 6. Proposed next research question (Phase 5 — proposal only, nothing implemented)

**`STAGE3H_PUBLIC_ACTION_SAFETY_FAILURE_ATTRIBUTION`**

**Question.** Why do the existing public-only policies achieve strong regret improvements while introducing
catastrophes against S0 and Nexus?

**Design.** A read-only attribution study of the spent H-W4 validation population and the frozen C10 decisions.
No new world, no new policy, no observation contract, no runner repair. The unit is the failing class; the 517
classes that pass both comparators serve as controls.

**Starting taxonomy (frozen, from the H-W4 audit and erratum 1).**

| | vs S0 (32) | vs Nexus-else-S0 (65) |
|---|---|---|
| unique classes | 83 in total: 18 S0-only, 51 Nexus-only, 14 both | |
| on the base world / twin-only | 16 / 16 | 38 / 27 |
| MOVE | 8 | 46 |
| RETREAT | 9 | 14 |
| RESTORE | 7 | 3 |
| REPAIR | 5 | 0 |
| BYPASS | 3 | 2 |
| what the comparator played | MOVE 23, REPAIR 8, RESTORE 1 | REINFORCE 32, PROTECT 25, REPAIR 8 |

**Candidate causes and the evidence that would separate them.** Let *F* be the set of menu actions that introduce no
catastrophe against the relevant comparator(s) in any member world of the class.

| cause | what it predicts | distinguishing evidence (all computable offline on spent data) |
|---|---|---|
| comparator-specific failure | the chosen action is unsafe only relative to one comparator's particular choice | per class: is the chosen action catastrophic in absolute terms, or only where that comparator happens to be safe; fraction of members affected; whether the other comparator is itself catastrophic there |
| hidden-state sensitivity | the same public state hides safe and unsafe worlds for the chosen action | base versus twin-only split; share of member worlds in which the chosen action is catastrophic; whether *F* is still non-empty |
| observation insufficiency | no public-only choice can be safe | *F* is empty for the class: no action is introduction-free across all members. If *F* is non-empty the failure was avoidable with the information the policy had |
| risk-estimation error | the risk head scored the unsafe action as safer than the safe ones | risk-head score of the chosen action versus every action in *F*; within-class ranking quality of the risk head |
| threshold calibration | the threshold did not act where it was needed | whether every action exceeded tau (threshold inert) or the chosen action sat below tau while being catastrophic; share of failures in saturated classes versus the 517 controls |
| safety-ranking error | a safe action passed the threshold but lost on predicted regret | an action in *F* has the same threshold status as the chosen action and a worse nreg-head score |
| policy-selection error | the selection rule picked a candidate whose failures another frozen candidate avoids | per-class overlap of failures across the 13 frozen candidates on the exploration population, where every candidate was already evaluated out of fold |

**Reporting rule.** Report every flag for every class, not a single assigned cause, and give counts by comparator
set, action family and base/twin with origin-family-clustered intervals. A prespecified precedence may be used for a
summary table only.

**What each outcome would mean.** If *F* is non-empty in most failing classes, the failures are decision errors
(estimation, threshold or ranking) under sufficient information, and observability is not the binding constraint
there. If *F* is empty in many, those classes are information-limited for a public-only policy under the two-
comparator gate. Mixed results would bound how much of the 83 each explanation covers.

**Limits to state up front.** Post hoc, on one spent DEV population and one selected candidate; 83 classes;
attribution is descriptive and cannot qualify, select or tune anything; identities stay under aliases.

**Authorization needed.** A distinct owner authorization, including explicit permission to read the spent validation
truth offline for this purpose and to compute other frozen candidates' decisions on spent data. Another value-band
campaign is not the proposed default.

## 7. Commit scope (Phase 6)

Staged: `H_W4B.md`, this file, `H_W4B_ENGINEERING_RISK_REGISTER.md`, and under `evidence/`: the stop record, the
Phase 1 and Phase 2 records, the recovery manifest, the protocol freeze and namespace allocation of 2026-11-04, the
H-W4 introduction-audit erratum (two files), the block-spend ledger, the screened-identity registry and the closure
manifest.

Not staged: every `hw4b-*.mjs` script (including the defective `hw4b-validate.mjs`, which was not executed), the
import cut, the import-cut proposal, `SENTINEL_GRID_SUMMARY.md`, the nine `sgrid-lab/results/*` files, the two
seed-bearing population manifests, the lane `.gitignore`, and all gitignored scratch and work data.

Three points for the owner's attention:

- The recovery manifest embeds the five-line import-cut diff as text so the evaluated revision is recoverable from
  HEAD. The source file itself is not staged and the committed boundary status is unchanged (FAIL).
- The namespace allocation record states each block's seed-range endpoints, which follow from the block number
  (block × 10⁹). It names no admitted or screened seed, and the H-W4 allocation record of the same form is already
  committed at `9175a555`.
- The scripts that generated this evidence stay untracked. The stop record and closure manifest bind them by hash,
  but they are not recoverable from the commit.

## REQUIRED RESULT

```
=== SENTINEL GRID STAGE 3H H-W4B CLOSURE ===

STATUS=H_W4B_CLOSED

H_W4B_CLASSIFICATION=D
H_W4B_PHASE_2_STOP_PRESERVED=true

H_W4_NEGATIVE_VERDICT_FINAL=true
V4_NEGATIVE_VERDICT_FINAL=true
H_W1_NEGATIVE_VERDICT_FINAL=true

VALUE_BAND_POLICY_LINE=CLOSED
FRESH_H_W4B_VALIDATION_EXECUTED=false

V1_TAU=0.02
V2_TAU=0.2
MATCHED_TAU_CONTRAST_ESTABLISHED=false

BAND_FEATURE_CONNECTED=true
BAND_SCORE_SENSITIVE=true
LAWFUL_FIXTURE_SELECTION_CHANGES=0
UNIVERSAL_DECISION_INSENSITIVITY_PROVEN=false

BLOCKS_901_910=SCREENED_SPENT (ledger-verified: 90 shards, 63,840 worlds, 885 admitted)
BLOCKS_911_914=ALLOCATED_NOT_GENERATED (ledger-verified untouched; retirement recommended)
SCREENED_POOL_ACCOUNTED_FOR=true (837 reproduced from shards; 885 identities sealed; not reusable)
EXCLUSION_LEDGER_VERIFIED=PARTIAL (recorded and sealed; not enforced by any loader — four exceptions in section 3)

STATIC_IMPORT_CLEAN_HEAD=FAIL
STATIC_IMPORT_WORKING_TREE=PASS (uncommitted import cut)
RUNNER_DEFECTS_DOCUMENTED=true (13 entries, unrepaired)
PRIOR_RESULTS_IMPACT_ASSESSED=true (no H-W4 number changed; one field corrected by erratum; two claims narrowed)

H_W4B_STOP_RECORD_SHA256=9af66b9f54bdcb737ec2dd600286552f3a961ff76d065663b66354973bb17096
H_W4B_CLOSURE_REPORT=platform/game-agnostic/stage3h-hw4-value-band-v1/H_W4B_CLOSURE.md

EVIDENCE_COMMITTED=see the closure commit (this file cannot contain its own commit hash)
LOCAL_COMMIT_HASH=reported with the commit
STAGED_FILES=14 (listed in evidence/HW4B_CLOSURE_MANIFEST.json plus the manifest itself)
UNRELATED_WORKTREE_CHANGES_PRESERVED=true

NEW_MODEL_TRAINED=false
NEW_VALIDATION=false
HOLDOUT_EXECUTED=false

V2_PRODUCTION_DEPLOYED=false
REMOTE_PUSH=false
A5_AUTHORIZED=false

FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

NEXT_RESEARCH_PROPOSAL=STAGE3H_PUBLIC_ACTION_SAFETY_FAILURE_ATTRIBUTION (proposal only; section 6)
NEXT_OWNER_AUTHORIZATION_REQUIRED=true
```
