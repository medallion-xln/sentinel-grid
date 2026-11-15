# STAGE 3H-SK2-F — Reproducibility, custody and infrastructure readiness

AUTHORITY: R0 · BASE HEAD `16ae5c21` · Gate 5 · nothing here ran a validation, generated a world or trained a model

The audit below was run at the base, before the import cut was committed. The cut was then committed locally as
`17318b03`; statements marked *after the commit* were re-measured at that commit.

Machine records: `evidence/SK2F_REPRO_STATUS.json` (`infra-audit/status.mjs`),
`evidence/SK2F_IMPORT_CUT_AUDIT.json` (`infra-audit/import-cut-audit.mjs`).

```
INFRASTRUCTURE_READY_FOR_AN_INDEPENDENT_SCIENTIFIC_CAMPAIGN=NOT_READY
CAN_RUN_LOCALLY_WITH_TRUSTWORTHY_PROVENANCE=true      (this machine, this working tree)
CLEAN_CHECKOUT_INFERENCE_REPRODUCIBLE=true
CLEAN_CHECKOUT_EVALUATION_REPRODUCIBLE=false
EXCLUSION_REGISTRY_ENFORCED_IN_WORKING_TREE=true
EXCLUSION_LOADERS_IMPORTABLE_FROM_CLEAN_CHECKOUT=false
SOURCE_CUSTODY_PASS=true
INDEPENDENT_BACKUP_VERIFIED=false
IMPORT_CUT_AUDIT=IMPORT_CUT_QUALIFIES_FOR_SCOPED_COMMIT
IMPORT_CUT_LOCAL_COMMIT=17318b03                        (one path, prospective source correction, not pushed)
```

## 1. The five limitations

| # | limitation | status at base `16ae5c21` | what would close it | who |
|---|---|---|---|---|
| L1 | 29 custody-protected source files are in no commit (23 in `ascii-suite`, 6 in `stage3h-canonical-v1`) | OPEN. All 31 protected identities are present and match their recorded hashes; none is tracked | a custody decision on how a second machine lawfully obtains the overlay. No commit closes it | owner |
| L2 | the SK1, H-W4 and H-W4B freezes bind a revision of `public-projection.mjs` that is in no commit | **CLOSED PROSPECTIVELY** by local commit `17318b03`. Earlier freezes still bound it while it was uncommitted | done; a future freeze must not bind an uncommitted file | owner-authorized |
| L3 | 19 gitignored data files (13.9 MB) are needed to re-check SK1: 2 manifests, 9 validation class shards, 8 audit shards | OPEN. Present, hash-recorded, local only | not closable in git; a verified backup makes it recoverable | owner |
| L4 | both exclusion loaders depend on custody-protected source | OPEN. Enforced in this working tree; not importable from a clean checkout | a separately authorized refactor so the loaders read the tracked registries directly, or L1 | owner decision |
| L5 | no independently verified restorable backup | OPEN. No external volume, no Time Machine destination, `main` is 61 commits ahead of `origin`, push not authorized | section 5 | owner |

**L4 in detail.** `infra/exclusions.mjs` and `successor/exclusions-v2.mjs` each reach all 29 protected files. The
chain is `exclusions.mjs → stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs →
stage3h-safety-feasibility-v1/closure/exclusions.mjs → stage3h-owner-governed-v1/allocate-namespaces-v4.mjs →
connector.mjs → stage3h-canonical-v1/adapters.mjs`. Both loaders also reach `public-projection.mjs`, but with either
revision of that file they reach the same 29 protected files. **The import cut does not change this.**

**Exclusion custody.** Registry `infra/exclusion-registry.json` sha256 `1073b1e5…`; its declared hash verifies; fail
closed. The tracked records alone list 114 forbidden blocks, including all 14 of 901–914 and all 37 of 801–837. Seven
sealed registries and three SK1 registries match their recorded hashes. In this working tree the loaders reject
14 of 14 and 37 of 37.

## 2. Import-cut audit

File: `stage3h-hw1-dev-v1/public-projection.mjs`. Nothing was staged or committed by the audit.

| revision | sha256 | git blob | where it exists |
|---|---|---|---|
| OLD | `2d1e70611b26005179cc50e21a9d6ec5eae59704d7db36e722bb28b53eacb9ca` | `88f89808` | committed in `b38b16ee` (H-W1 I-1); the only revision in history up to the base |
| CUT | `c4f9532e0771e025513122052128b0d14185e4abcde3ace9de9de5d77db6c099` | `8e149f13` | working tree only until this stage; committed in `17318b03` |

| # | owner condition | result | decisive evidence |
|---|---|---|---|
| 1 | exact contents equal the recorded five-line diff | **PASS** | 2 lines removed, 3 added, first change at line 12; the 11 lines before and 204 lines after are identical. The live diff against the OLD revision is byte-identical to the diff embedded in the tracked `HW4B_RECOVERY_MANIFEST.json` (sha256 `93c0b22f…`). `SK1_PROJECTION_PROVENANCE.json` records the same lines. The untracked draft proposal matches as code; only the wording of one trailing comment differs from the draft |
| 2 | public projection semantics unchanged | **PASS** | `transforms.mjs` `D4_ELEMENTS` **is** the `ORIENTATIONS` object (strict identity). Export surface and constants identical. Eleven projection functions give byte-identical output on 1,602 public projections (2 demo fixtures, 1,000 exploration and 600 validation class projections; truth never read). The SK1 derived projection is identical from both revisions |
| 3 | protected frozen inputs unchanged | **PASS** | 31 of 31 protected identities match; none tracked; guard manifest intact; all eight SK1 freeze checks still describe the disk |
| 4 | evaluator-free static reachability from committed source | **PASS** | closure shrinks from 72 files (5 custody-protected, `transforms.mjs`, scripts, evaluator tooling) to 6 tracked files. Written to an empty directory from committed blobs, the cut module imports and runs; the OLD revision cannot link there (`stage3h-canonical-v1/adapters.mjs` missing). The frozen H-W4 rule re-measures as recorded: 10 files / 0 violations with the cut, 76 / 40 with OLD |
| 5 | custody and compatibility tests | **PASS** | before the commit: SK1 40 of 40; SK1 `run.mjs check` `SK1_CHECK_PASS` 12 of 12; SK1.1 65 of 65. *After the commit*: SK1 40 of 40; `SK1_CHECK_PASS`; SK1.1 64 of 65, the one failure being the dated-inventory drift test described in section 3; H-W4 `hw4-gates.mjs` G1 static-import boundary passes. That script still exits 1 on G8, which needs a gitignored scratch dataset and is unrelated to the cut; nothing was repaired |
| 6 | historical record preserved | **PASS** | 20 tracked files pin one or both revisions; all classified, none edited (section 3). The OLD revision stays in history: `git show b38b16ee:platform/game-agnostic/stage3h-hw1-dev-v1/public-projection.mjs` |
| 7 | no certificate or freeze hash rewritten | **PASS** | the commit touches exactly one path. Every freeze binds file *content*, which does not change. `run.mjs check` passes against a simulated post-commit state |

**Condition 2, what was and was not measured.** `projectPublic(view)` and `traceReads(view)` need a native observable
view, which would mean generating a world. They were not run. They are covered by the textual result: both revisions
are identical outside the hunk, and neither function references the changed binding (it is used only in `D4_LINEAR`,
`symmetryReport` and `canonicalFrame`).

**Condition 4, the residual edge.** After the cut, `public-projection.mjs → orientation-symmetric-v1.js →
src/forge/kernel.js` (plus `forge/contract.js`, `core/determinism.js`, `core/errors.js`) remains, exactly as in the OLD
revision. The native engine module is tracked, not protected and not an evaluator, and nothing in the projection calls
it. Whether a flat no-engine rule would accept that edge is a separate contract question, not decided here.

**Is the file a protected immutable owner?** No. It is not a custody-protected identity and is not under a governance
frozen path. It *is* a pinned dependency of the sealed H-W1 candidates: the H-W1 closure kept the edge for that reason
and reserved "a corrected inference dependency boundary" for separate owner authorization. The SK2-F mandate gives
that authorization conditionally, and the conditions hold.

**Recommendation: `IMPORT_CUT_QUALIFIES_FOR_SCOPED_COMMIT`** — one path, one local commit, described as a prospective
source correction, with both sha256 values in the message.

### What the commit must not be said to do

- It does **not** repair `STATIC_IMPORT_CONTRACT=FAIL` for H-W1. That verdict describes the OLD revision, which is
  unchanged in history.
- It does **not** mean H-W4 or SK1 were evaluated on committed source. They bound the cut while it was uncommitted, and
  their records say so.
- It does **not** make evaluation clean-checkout reproducible. L1 and L3 remain.
- It does **not** make the exclusion loaders importable from a clean checkout. L4 remains.

### One trade-off to know

After the commit a checkout of HEAD carries the revision that H-W4, H-W4B and SK1 pinned, and no longer the one H-W1
pinned. Re-checking an H-W1 record against its pinned hash then needs the OLD revision from history. Today it is the
other way round. Neither state satisfies both sets of pins from HEAD alone.

## 3. Who pinned which revision

| lane | pins | files |
|---|---|---|
| H-W1 | **OLD** | `evidence/I1_PUBLIC_INPUT_AUDIT.json`, `I2_PCD_VALIDATION.json`, `I4_EXPLORATION_RESULTS.json`, `I5_CANDIDATE_FREEZE.json`, `LANE_CONTENT_AUDIT_I1.json` |
| H-W3 | CUT (prose, as an uncommitted file left untouched) | `H_W3_FEASIBILITY.md` |
| H-W4 | **CUT**, uncommitted at the time | `evidence/HW4_CANDIDATE_FREEZE.json`, `HW4_EXPLORATION_V1_PUBLIC_ONLY.json`, `HW4_EXPLORATION_V2_PUBLIC_PLUS_VALUE_BAND.json`, `H_W4.md` |
| H-W4B | **CUT**; records name both | `evidence/HW4B_PROTOCOL_FREEZE.json` (CUT); `HW4B_PHASE1_REPRODUCIBILITY.json`, `HW4B_RECOVERY_MANIFEST.json`, `H_W4B.md`, `H_W4B_ENGINEERING_RISK_REGISTER.md` (both) |
| SK1 | **CUT**, uncommitted at the time, disclosed in the freeze | `evidence/SK1_EXPERIMENT_FREEZE.json`, `SK1_CUSTODY_MANIFEST.json` (CUT); `SK1_PROJECTION_PROVENANCE.json` (both) |
| SK1.1 | records both | `evidence/SK1_1_REPRO_INVENTORY.json`, `SK1_REPRODUCIBILITY_GAP.md` |

Every pin is a dated statement made at a named commit. None is edited by committing the cut.

### Live tools whose output changes after the commit

| tool | change |
|---|---|
| SK1 `infra/run.mjs check` | none — it compares content hashes |
| SK1.1 `repro/inventory.mjs verify` and the INTEGRATION test in `repro/repro.test.mjs` | **reports drift, as designed.** The dated inventory classified the file `TRACKED_MODIFIED`; it becomes `TRACKED_EQUALS_HEAD` with the same sha256. 42 rows: that file's class, its removed `headSha256`, and 40 class counts derived from it. That one SK1.1 test then fails. *After the commit* the suite measures 64 of 65, with exactly that test failing |
| SK1 test suite | none — 40 of 40 in the simulated post-commit state |
| `infra-audit/status.mjs` | labels exactly those rows `EXPECTED_AFTER_IMPORT_CUT_COMMIT` and passes; any other row fails it |
| SK1.1 `clean-checkout-probe.mjs`, `backup-manifest.mjs` | one supplement and one uncommitted modification fewer |
| SK1 `custody-manifest.mjs`, `derive-projection.mjs` (print modes) | print output only; their tracked records are dated and are not rewritten |

The SK1.1 inventory is a dated record at `179922dd` and is deliberately left as written. The current reference after
the commit is `evidence/SK2F_REPRO_STATUS.json`.

**Hazard found, not acted on.** SK1 `infra/derive-projection.mjs` has no entry-point guard: it runs when imported, and
writes `adapters/forge/projection.mjs` and `SK1_PROJECTION_PROVENANCE.json` whenever `--write` is anywhere in the
argument list. Run after the commit, it would overwrite the dated provenance record with two equal hashes. It must not
be run with `--write` again. The audit calls it only in a child process with a clean argument list.

## 4. How the post-commit state was checked without committing

`infra-audit/sim-post-commit.mjs` builds a scratch git directory under the system temp dir that borrows the real object
store read-only and holds one extra commit (base plus the cut). Tools run against it see the post-commit state while
reading the real working tree. No object, ref or index entry is written to the real repository; a test confirms HEAD,
refs, object count and the working file are unchanged afterwards.

Measured there: `status.mjs verify` passes with the label above; SK1 `run.mjs check` passes; the SK1 suite is 40 of 40.
The SK1.1 suite shows 61 of 65: the inventory test fails as designed, and three backup tests fail **only because of the
simulation** — its git environment variables leak into the small fixture repositories those tests create. They do not
read this repository's HEAD. *After the commit* the real figure was measured: 64 of 65, the inventory test only.

## 5. Backup procedure (executable; not executed)

Current facts: no external volume mounted; no Time Machine destination; everything is on one internal disk.

```
cd platform/game-agnostic/stage3h-sk2f-feasibility-v1

# 1. dry run: sizes and, if given, whether a destination would be accepted. Touches nothing.
node infra-audit/backup/backup.mjs plan
node infra-audit/backup/backup.mjs plan --dest /Volumes/<approved offline drive>

# 2. the owner, in a terminal, after mounting approved offline storage
node infra-audit/backup/backup.mjs run --dest /Volumes/<approved offline drive> --owner-approved-destination

# 3. on a different device (the restored copy must not be on this disk)
node infra-audit/backup/backup.mjs restore-verify --backup /Volumes/SentinelGridBackup/sentinel-grid-backup \
     --to /Volumes/<other device>/sentinel-grid-restored --owner-attests-medium-detached
```

| property | how it is enforced |
|---|---|
| owner-approved destination only | `run` refuses without `--dest` and `--owner-approved-destination` |
| cannot run unattended | `run` refuses without an interactive terminal |
| independent medium | refuses a destination inside the repository or on the same device |
| no cloud, no network | refuses iCloud, Dropbox, Google Drive, OneDrive and other sync folders, and SMB/AFP/NFS/WebDAV mounts |
| enough space | refuses below 3.05 GiB free (scope 2.24 GiB × 1.25 + 256 MiB) |
| encryption | writes into an already encrypted volume, or creates an AES-256 APFS sparsebundle; the passphrase is typed at `hdiutil`'s prompt and is never an argument, variable or file |
| contents | git bundle of all 12 refs (verified), 7 custody control files, 31 protected overlay files, uncommitted and untracked files, 305 SK1 `work/` files; modes preserved; every copy re-hashed |
| manifest | `SCOPE_MANIFEST.json` from the SK1.1 `backup-manifest.mjs`; its scope sha256 is printed for the owner to record separately |

The git bundle contains protected source through the custody refs and must be handled as protected.
Other gitignored experiment data (1.53 GB) is listed in the manifest at directory level and is not copied; the owner
decides what to keep.

**Acceptance.** `INDEPENDENT_BACKUP_VERIFIED=true` may be stated only when `restore-verify` prints
`ALL_FOUR_ACCEPTANCE_CONDITIONS_MET`:

1. every listed file and ref matches the manifest, `git fsck` is clean, and the restored root is on a different device;
2. `infra-audit/status.mjs verify` passes in the restored copy;
3. `infra/run.mjs check` prints `SK1_CHECK_PASS` in the restored copy;
4. the owner attests the medium has since been detached.

A same-device restore is labelled `REHEARSAL` and never counts. A restored validation population is spent data.

Tested here: every refusal path, the dry run, and a full backup → restore → verify rehearsal on a tiny fixture
repository, including a tampered-backup negative control. No copy of this repository was made.

## 6. Readiness for another independent scientific campaign

| question | answer |
|---|---|
| Can a campaign run here with trustworthy local provenance? | **Yes**, as SK1 did: custody identities match, the freeze describes the disk, exclusions are enforced, check mode reproduces the result |
| Could anyone else reproduce or re-check it? | **No**: L1 and L3 |
| Could it be recovered after a disk failure? | **No**: L5 |
| Could a clean checkout prove the exclusions were applied? | **No**: L4. The tracked registries can be read; the enforcing loaders cannot be imported |

**Verdict: NOT_READY.** Blocking, in order:

1. **L5** — no verified backup. One disk failure destroys the protected source, the local data and 61 unpushed commits.
2. **L1** — protected source. No second machine can re-check a result.
3. **L4** — exclusion enforcement cannot be exercised from committed source.
L2 was the fourth blocker and is closed prospectively by `17318b03`. That commit removed that item only; the three
above remain.

## 7. Tooling (`infra-audit/`, all read-only)

| file | purpose |
|---|---|
| `import-cut-audit.mjs` | the seven conditions; `verify` recomputes the state-independent core |
| `status.mjs` | the five limitations, exclusion custody, readiness; correct before and after the commit |
| `sim-post-commit.mjs` | scratch post-commit state for tests |
| `backup/backup.mjs` | `plan`, `run`, `restore-verify` |
| `infra-audit.test.mjs` | 12 tests; each check has a negative control |

```
node --test infra-audit/*.test.mjs
node infra-audit/status.mjs verify            # a few seconds
node infra-audit/import-cut-audit.mjs verify  # about four minutes: it re-compares 1,602 projections
```

## State of the records

- `evidence/SK2F_IMPORT_CUT_AUDIT.json` and `evidence/SK2F_REPRO_STATUS.json` were written at the base, before the
  commit, and say so (`CUT_UNCOMMITTED`). They are dated records and were not regenerated. Their `verify` modes compare
  a state-independent core and pass at `17318b03`.
- `node infra-audit/status.mjs verify` at `17318b03` prints `IMPORT_CUT_COMMITTED: true`, the three remaining blocking
  items and `SK2F_REPRO_STATUS_VERIFY_PASS`.
- The SK1.1 inventory (`SK1_1_REPRO_INVENTORY.json`) is a dated record at `179922dd` and is left as written. Its
  integration test now fails by design; it is superseded as the current reference by `SK2F_REPRO_STATUS.json`.
- The untracked draft `stage3h-hw1-dev-v1/PROPOSAL_PUBLIC_PROJECTION_IMPORT_CUT.md` was left untouched and untracked.
