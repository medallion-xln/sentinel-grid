# Stage 3H diagnosis: reproducibility correction

This is an additive correction to the diagnosis committed at `38f7c1d6`. It fixes two reproducibility limitations:

- raw byte-identical regeneration was impossible because of wall-clock timing fields;
- a clean clone needs the protected-source overlay.

It does not reopen the diagnosis. `RESULT.md`, its hashes and every diagnosis file are unchanged.

```
=== SENTINEL GRID STAGE 3H REPRODUCIBILITY ===

BASE_COMMIT=38f7c1d6

RAW_FILES_PRESERVED=true (38 files in dev-runs/ unchanged; raw hashes re-verified before and after archiving)
RAW_ARCHIVE_SHA256=d1f23c09b3a172c8be4ea661ac910a7d8c8314e792f6a7f4433aecddc89543de (archive/dev-runs-38f7c1d6.tar.gz, 4,706,350 bytes, gitignored)
RAW_HASHES_VERIFIED=true (38/38 extracted files reproduce their original raw sha256; RESULT.md concatenated hashes reproduced)

NORMALIZATION_CONTRACT=STAGE3H_DEV_RUN_NORMALIZATION_V1 (remove only $[row].ms in shard JSONL and $.seconds in completion markers; round-trip precondition enforced)
SCIENTIFIC_RECORDS_IDENTICAL=true (0 of 25,835 records differ in any field other than the declared timing fields)
NORMALIZED_HASHES_MATCH=true (22/22 records and all 3 per-set concatenations)
REGENERATION_PASS=true

PROTECTED_SOURCE_OVERLAY_IDENTIFIED=true (stage3h-owner-governed-v1/registration/protected-source-package-d8a44ebd.tar.gz; 30 files; 6 needed by this lane, all stage3h-canonical-v1/)
SOURCE_PACKAGE_HASH_VERIFIED=true (sha256 ecfc7016... equals the committed V4 record; 30/30 files equal their hashes bound in REGISTRATION_CANDIDATE_V4.json)
CLEAN_CLONE_WITH_OVERLAY_PASS=true (git clone --no-hardlinks at 38f7c1d6 + complete package overlay; exact original commands; clone removed)

DEV_951_EXCLUDED=true (whole block; enforced by the registered allocator rule via committed identities)
DEV_952_EXCLUDED=true (whole block; same)

V4_EVIDENCE_UNCHANGED=true (57 tracked files byte-identical to e46329cc)
V4_NEGATIVE_VERDICT_FINAL=true

NEW_SELECTOR_IMPLEMENTED=false
NEW_REGISTRATION=false
NEW_CAMPAIGN=false

COMMIT_HASH=(the commit that adds this file; see git log)
NEXT_SCIENTIFIC_DECISION=Unchanged from RESULT.md: owner decision on whether to open DEV-only selector research (identity-free Nexus tie-break in both the selector and its Nexus comparator, plus a public H2 maintenance-risk model), and whether zero introductions against both comparators is satisfiable. Custody: make and verify an independently stored copy of the raw archive before the originals may ever be deleted.

FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false
```

## 1. Raw and normalized hashes

`evidence/reproducibility/DEV_RUN_MANIFEST.json` covers all 22 original run records: 11 shard JSONL files (25,824 rows)
and 11 completion markers. For each record it gives:

- raw and normalized SHA-256, size and row count;
- seed block and world identities (counts, rejections by reason, seed range or rule, and the SHA-256 of the ordered
  `[idx, seed, worldHash, rejection]` list);
- the measured frozen source identity and runtime;
- the exact regeneration command.

The 16 console logs under `dev-runs/logs/` are listed with raw hashes only; they are not run records.

The manifest also recomputes the three concatenated hashes in `RESULT.md` from the original files. All three still
match, and they were not rewritten.

**Normalization contract** (`repro/normalize.mjs`, `STAGE3H_DEV_RUN_NORMALIZATION_V1`):

| Record | Removed field | Why |
|---|---|---|
| `shard-<i>-of-<n>.jsonl` | `ms` on each row | per-world wall-clock milliseconds; absent on rejected rows |
| `shard-<i>-of-<n>.done.json` | `seconds` | per-shard wall-clock seconds |

Everything else is preserved: fields, values, key order, row order and row count.

The tool refuses to normalize unless every raw line re-serializes byte-identically. That proves the normalized bytes
differ from the raw bytes by the removed fields alone.

`identity.frozenAgrees` is deliberately not removed. It could change if a frozen lock overran its 1,000 ms assertion,
and any such change would count as a scientific difference. None occurred, even though load reached about 29 during
regeneration.

**Frozen source identity** (`repro/source-closure.mjs`). This is measured, not listed. A module-load hook and an
instrumented `readFileSync` exercise the regeneration command's code paths. Results:

- 89 files: 76 modules and 13 data files; closure SHA-256 `5c2950bb…`.
- Every tracked file equals its blob at `38f7c1d6`.
- The 6 untracked files are all `stage3h-canonical-v1/` modules covered by the protected package.
- The data files are the S0 model, the V3 contract, `prior-world-exclusions.json` and the ten V4 ledgers. The ledgers
  are read for world-hash exclusion only; no V4 row, LOCK, admission or ANALYSIS file is in the closure.

**Runtime.** Node v22.22.2, binary `5c899797…` (the V4 runtime), no flags.

**Regeneration command.** From `platform/game-agnostic/stage3h-failure-diagnosis-v1`:

- `node run-dev.mjs DEV288 0 1`
- `node run-dev.mjs FRESH_EXPLORE <0..4> 5`
- `node run-dev.mjs FRESH_CHECK <0..4> 5`

The shards may run in parallel. They write with exclusive creation, so `dev-runs/<set>/` must not already hold the
shard.

## 2. Clean clone with the protected-source overlay

`repro/clean-clone-reproduce.mjs` produced `evidence/reproducibility/REGENERATION_VERIFICATION.json`.

| Step | Result |
|---|---|
| Package | `protected-source-package-d8a44ebd.tar.gz`, sha256 `ecfc7016…`, equal to the value recorded in the committed `stage3h-owner-governed-v1/evidence/successor-v4-preflight/clean-clone-verification.json` |
| Package contents | listing equals the recorded 30 files; 30/30 equal their hashes in the authoritative manifest (`REGISTRATION_CANDIDATE_V4.json` `bindings.sources`) |
| Clone | `git clone --no-hardlinks`, checked out `38f7c1d6`; clean before overlay; no `dev-runs/` |
| Overlay | complete package extracted; it added exactly the 30 package files, each equal to its bound hash; no other source version used |
| Closure inside the clone | identical to the working tree (89 files, `5c2950bb…`) |
| Regeneration | 11 original commands, exit 0, 1,043 s; blocks 951 and 952 plus DEV288 |

Comparison with the originals:

| Check | Result |
|---|---|
| Raw byte-identical records | 0/22 (expected: timing) |
| Normalized byte-identical records | 22/22 |
| Per-set normalized concatenations | 3/3 |
| Row counts | all equal |
| Rows with any non-timing difference | 0 |
| Rows differing only in timing | 25,601 |

The clone contained protected bytes, so it was removed afterwards. The package itself stays gitignored and
uncommitted.

## 3. Raw archive custody

`repro/archive.mjs` produced `evidence/reproducibility/ARCHIVE_VERIFICATION.json`.

- `archive/dev-runs-38f7c1d6.tar.gz` (gitignored) and its `.sha256` sidecar hold all of `dev-runs/`.
- Extracted into a fresh temporary directory, all 38 files reproduce their original raw hashes, with no extra files.
  The extraction directory was removed.
- The originals were not modified or deleted.

The archive is on the same disk and machine as the originals, so **no independent archival redundancy exists**.
The originals must not be deleted until an independently stored copy has been made and verified.

## 4. Scientific integrity

`repro/integrity.mjs` produced `evidence/reproducibility/INTEGRITY.json`, and it passes.

| Check | Result |
|---|---|
| V4 evidence | 57 tracked files byte-identical to `e46329cc`; lane clean |
| V4 verdict | dossier states `BOUNDED_SELECTOR_NOT_QUALIFIED`; the adjudication record agrees; final |
| Protected files | V4 lane chain (`verifyOwnerLane`): 14,447 canonical protected files, milestones, frozen rule, roster and V3 bindings unchanged; all 237 V4-candidate bound sources unchanged |
| Sealed data | no V4 row, LOCK, admission or ANALYSIS file opened; the regeneration command reads only the ledgers' world hashes, as the original run did |
| Diagnosis | 16 diagnosis files, including `RESULT.md` and the 7 evidence files, unchanged since `38f7c1d6`; classification still `B. NEW_SELECTOR_RESEARCH_REQUIRED` |

**DEV exclusion.** `evidence/reproducibility/DEV_WORLD_IDENTITIES.json` commits:

- the whole-block rule for 951 and 952;
- the six OPEN seeds;
- all 25,676 admitted DEV world hashes in index order.

The registered allocator's own check, `blockFailures` with `scanRepositoryText`, now rejects both blocks with
`REPOSITORY_TEXT_HIT`. Both blocks are also outside its 733–799 range.

At `38f7c1d6` that check would **not** have caught them. `RESULT.md` is not scanned, and `lib.mjs` writes the bases
with numeric separators. Inside the allocator's tested windows, the only hits now come from this correction's files.

**Scope of the commit.** Only the correction's tooling (`repro/`), its five evidence files, this document and the
lane's `README.md` and `.gitignore` are committed. Two pre-existing unrelated edits are left unstaged:
`docs/stage3f5-integrated-live-shadow.md` and `package.json`.

**Tool history.** `repro/source-closure.mjs` was corrected after `DEV_RUN_MANIFEST.json` was written. The fix
canonicalises macOS `/var` → `/private/var` temp paths, which made the first clone attempt fail closed with an empty
closure; nothing was written and the clone was removed. The working-tree closure measured before and after the fix is
identical (89 files, `5c2950bb…`).

## Files

| File | Purpose |
|---|---|
| `repro/normalize.mjs` | normalization contract, round-trip check, field-level diff |
| `repro/trace-hooks.mjs`, `repro/source-closure.mjs` | measured source closure and its classification |
| `repro/manifest.mjs` | `DEV_RUN_MANIFEST.json`, `DEV_WORLD_IDENTITIES.json` |
| `repro/archive.mjs` | archive, sidecar, extraction check → `ARCHIVE_VERIFICATION.json` |
| `repro/clean-clone-reproduce.mjs` | package check, clean clone, overlay, regeneration, comparison → `REGENERATION_VERIFICATION.json` |
| `repro/integrity.mjs` | Task 4 checks → `INTEGRITY.json` |
