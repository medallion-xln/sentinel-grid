# STAGE 3H-SK1.1 — SK1 reproducibility gap report

AUTHORITY: R0 · BASE HEAD `179922dd` · evidence `evidence/SK1_1_REPRO_INVENTORY.json` (sha256 `3f171488…`, core `2b2a7108…`)

```
CLEAN_CHECKOUT_INFERENCE_REPRODUCIBLE=true    (kernel, adapters, API, frozen model, demonstration and replay of its two stored decisions)
CLEAN_CHECKOUT_EVALUATION_REPRODUCIBLE=false  (needs 29 protected files, 1 uncommitted file and local data that are in no commit)
INDEPENDENT_BACKUP_VERIFIED=false             (no backup destination exists; none was created or restored)
```

Nothing here re-ran the SK1 validation, generated a world, trained a model, changed an SK1 file or moved protected
source. Check mode, which recomputes and compares with the committed result and writes nothing, was the only
evaluation-side command executed, and only inside a temporary export.

## 1. How it was measured

`repro/clean-checkout-probe.mjs` exports HEAD with `git archive` into a temporary directory and removes it afterwards.
The export is sparse (the tracked tree is 9.35 GiB) but converges: any path a command touches that is tracked at HEAD
is added from HEAD and the command re-run, so it behaves like a full clean checkout. A path that is not tracked at
HEAD is never added. A file-read tracer confirmed that no run read the real repository.

- **Stage A — HEAD only.** Inference-graph audit, all seven SK1 test files, both demonstrations, an import attempt of
  every evaluation entry point, and `infra/run.mjs check`.
- **Stage C — HEAD plus declared supplements.** The same export with three additions, then `check`.
- **Ablations.** Each supplement withdrawn in turn.

## 2. What reproduces from what

| capability | HEAD alone | needs | measured result |
|---|---|---|---|
| Kernel inference graph (12 files, closure `8a7e39ab…`, equal to the Gate 0 record) | **yes** | — | evaluator-free, 0 violations |
| Kernel, graph and second-game tests | **yes** | — | 21 of 21 pass |
| R0 demonstration, both fixtures, with replay and execution refusal | **yes** | — | decision, model, kernel and adapter hashes equal the committed demo record |
| Replay of the 600 validation decisions | no | local class records | the public projections exist only inside the privileged class records; the tracked registry holds class digests |
| Exclusion registry: identity of the records, and that blocks 801–837 and 901–914 are listed | **yes** | — | 114 forbidden blocks; 14 of 14 and 37 of 37 listed; 7 sealed registries and 3 SK1 registries match their recorded hashes |
| Exclusion **loaders** (`loadSk1Exclusions`, `loadSuccessorExclusions`) | **no** | protected overlay | do not link: `strict-index.mjs` reaches `stage3h-canonical-v1/adapters.mjs` |
| Exclusion, projection and successor tests (15 tests in 3 files) | **no** | protected overlay | the three files fail to load |
| Runner negative controls (4 tests) | no | local data | skipped, as designed |
| `run.mjs check` (recompute and compare with the committed result) | **no** | all three supplements | fails at link |
| Population screening, class construction, training | no | protected overlay, uncommitted file; then would produce non-fresh worlds | **not executed by design**; dependencies established statically only |

The full SK1 suite is 40 tests. From HEAD alone: 21 pass, 4 skip, 15 cannot load. The Gate 0 record ran only the
kernel, graph, second-game and runner-control files in its clean export, so this is new information, not a regression.

## 3. The three supplements: sufficient together, each necessary

With all three present, `check` in the export **passes**: 12 of 12 result sections reproduced, decision digest
`a0455655…` equal to the stored one, nothing written, no path requested beyond the declared supplements.

| supplement | content | withdrawn → first failure |
|---|---|---|
| Custody-protected overlay | 29 files, each verified against its recorded identity before use: 6 in `stage3h-canonical-v1` (adapters, baseline, evidence, guard, metrics, Nexus selector port) and 23 in `ascii-suite` | `Cannot find module …/stage3h-canonical-v1/adapters.mjs` |
| Uncommitted tracked modification | `stage3h-hw1-dev-v1/public-projection.mjs`, the import cut (working `c4f9532e…`, HEAD `2d1e7061…`) | `SK1_FREEZE_MISMATCH:evaluationDependencies` |
| Gitignored local data | 19 files, 13.9 MB: 2 population manifests, 9 validation class shards, 8 identity-audit shards | `ENOENT … work/classes/VALIDATION` |

The second row matters most. The SK1 experiment freeze binds the **uncommitted** content of that file. The content
that the committed result depends on exists in the working tree and in no commit.

## 4. Source inventory

Static import closure of all SK1 entry points: **176 files, no npm package, Node builtins only.**

| group | files | equal to HEAD | modified vs HEAD | protected, untracked | missing |
|---|---|---|---|---|---|
| Inference (`api/recommend.mjs`, `demo/demo.mjs`, graph entry points) | 13 | 13 | 0 | 0 | 0 |
| Evaluation (every `infra/`, `analysis/`, `successor/` module) | 166 | 136 | 1 | 29 | 0 |
| Tests | 156 | 126 | 1 | 29 | 0 |

Of 26 evaluation modules, 20 cannot link from HEAD. The six that can are `common`, `derive-projection`, `gbdt`,
`graph-audit`, `population` and `analysis/gate3-record`.

| source identity | definition | files | composition | closure sha256 |
|---|---|---|---|---|
| Native engine | everything under `src/` the evaluation reaches (Forge World, symmetric orientation and action surface, core, experts, Stage 3F/3G modules) | 57 | all equal to HEAD | `6e905bb8…` |
| World generation and class construction | closure of `allocator`, `screen`, `pool`, `build-class` | 130 | 100 HEAD, 1 modified, 29 protected | `1a807017…` |
| Frozen evaluator definitions | closure of `stage3h-hw1-dev-v1/hw1-eval.mjs` | 71 | 66 HEAD, 5 protected | `8908c9e4…` |
| Evaluation run | closure of `infra/run.mjs` | 142 | 112 HEAD, 1 modified, 29 protected | `2d8d0534…` |
| Training | closure of `infra/train.mjs` | 83 | 78 HEAD, 5 protected | `cac27155…` |
| Frozen comparators (S0, Nexus-else-S0) | the protected files themselves | 29 | all protected | `be7dc481…` |
| Kernel source / Forge adapter | `api/host.mjs` directory hashes | 6 / 3 | all equal to HEAD | `55887443…` / `948352b6…` |

The native engine is fully committed. The comparators are not, and even the evaluator's own definitions reach
protected source through `stage3h-failure-diagnosis-v1/lib.mjs`.

**Decision models.** `SK1_MODEL.json`, `SK1_MODEL_NO_EVIDENCE.json` and the H-W4 C10 model are tracked and equal to
HEAD; both SK1 models verify against their embedded model hash.

**Frozen experiment binding.** All eight groups of hashes in `SK1_EXPERIMENT_FREEZE.json` still describe the disk:
34 code files (and no extra file in a frozen directory), 16 evaluation dependencies, 3 models, 4 population records,
9 validation data files, allocation, exclusion registry, training record and design freeze; the result binds the
freeze and the run marker. The 75 tracked SK1 lane files equal HEAD.

## 5. Data inventory

| data | where | status |
|---|---|---|
| 24 SK1 records (evidence JSON, design freeze, result, README, demo fixtures, exclusion registry) | tracked | equal to HEAD |
| Sealed registries of earlier populations (7), strict-index sources, C10 model: 23 files read by check mode outside the lane | tracked | equal to HEAD |
| Population manifests (2) — seeds, world hashes | `work/manifests`, gitignored | bound by the tracked population summaries |
| Class records (18 shards, 33.2 MB) — public projection, comparator sets, evaluator truth | `work/classes`, gitignored | bound by tracked evidence; validation shards are mode `400` |
| Identity-audit shards (8) | `work/audit` | **no tracked hash before this inventory** |
| Screening admission records (234) and pool (1) — the original admission records | `work/screen`, `work/pool` | **no tracked hash before this inventory** |
| Design fixture (8) and its development models (3; not the frozen models) | `work/dev-fixture`, `work/dev-model` | no tracked hash before this inventory |
| Logs (31) | `work/logs` | not an input |

Local data totals 305 files, 46.4 MB. The inventory now records a file-level sha256 for every one of them, so a
restored copy can be verified. It records identities only: no seed, world hash or truth value.

## 6. Custody

- 31 protected identities; all 31 files present and equal to their recorded hash; none tracked; 29 are in the SK1
  evaluation closure (not `stage3h-canonical-v1/plan.mjs` or one aborted-run `freeze.mjs`). The 29 equal the hashes in
  `SK1_CUSTODY_MANIFEST.json`. The guard manifest (three hooks, guard script, identity list) is intact.
- The identity list, the hooks and `.git/info/exclude` (which keeps protected paths out of `git add`) all live inside
  `.git`. **A clone has none of them.** The tracked inventory now carries the 31 path-and-hash identities, so an overlay
  supplied to a fresh checkout can be verified from tracked data.
- Observation, not acted on: blob objects for all 31 identities are present in this clone's object store. None is
  reachable from `main`. 30 are reachable from `refs/custody/pre-remediation-main` and from a `refs/codex/…`
  checkpoint ref; 1 from `refs/custody/pre-a4b-main` and `refs/custody/remediated-main`. The tooling never reads them
  from git. Consequence for backup: a `git bundle --all` contains protected source and must be handled as such.

## 7. Runtime

Every SK1 record was produced on Node `v26.7.0`, darwin-arm64. `package.json` says `>=18`; there is no version pin
file. The risk estimate uses `Math.exp` and floating-point sums, and the intervals use a seeded bootstrap. No
canonical-numerics layer or cross-version determinism claim exists for SK1. Bit-exact reproduction is **observed on
one runtime only**; other runtimes are NOT_VERIFIED.

## 8. Blockers

| # | blocker | can SK1.1 resolve it? |
|---|---|---|
| B1 | 29 protected source files are in no commit. Without them the exclusion loaders, the evaluator, the comparators, training and the runner cannot link. | No. Moving protected source into git is not authorized. Needs a custody decision on how a second machine lawfully obtains the overlay. |
| B2 | The committed result depends on an uncommitted edit of `stage3h-hw1-dev-v1/public-projection.mjs`. One working-tree file is the only copy. | Not here: it is another lane's source. A separately scoped commit of the cut (draft `PROPOSAL_PUBLIC_PROJECTION_IMPORT_CUT.md` exists, untracked) would close it without changing any SK1 hash, because the freeze already binds that content. Owner decision. |
| B3 | Experiment data is local only; part of it had no tracked hash. | Partly. Every file is now hash-recorded. The data itself stays local. |
| B4 | Regeneration of populations is unverified. | No. It is forbidden to run, and regenerated validation worlds would not be fresh. |
| B5 | No independent backup. | No. Needs owner-supplied storage (section 10). |
| B6 | One runtime observed. | No. Needs a second runtime, which needs B1. |

**Not repaired:** the static-import FAIL of the frozen H-W1 / H-W4 policies at committed HEAD stands as recorded in
the H-W4B closure. The SK1 kernel passing its own graph audit does not change that.

## 9. Tooling added (all read-only; `repro/`)

| file | purpose |
|---|---|
| `inventory.mjs` | builds the inventory; `verify` recomputes it and checks the SK1 freeze, custody records and exclusion loaders, writes nothing, exits 1 on drift |
| `clean-checkout-probe.mjs` | the staged probe of section 1 |
| `read-trace-preload.mjs` | records which files a command reads, so data dependencies are measured |
| `backup-manifest.mjs` | lists what a backup must contain; `verify` accepts or rejects a restored copy |
| `lib.mjs`, `repro.test.mjs` | shared helpers; 15 tests, 5 of them negative controls |

```
node repro/inventory.mjs verify            # SK1_1_INVENTORY_VERIFY_PASS, no drift, 8 of 8 freeze checks
node --test repro/repro.test.mjs           # 15 pass, 0 fail
node repro/clean-checkout-probe.mjs        # about one minute; temporary directory removed
```

Negative controls show that an edited kernel file, a file added to a frozen directory, a changed dependency, model,
registry or validation data file, a tracked protected path, a retired block that stops being rejected, a tampered
inventory hash, a tampered or incomplete restore and a forged backup manifest are each reported.

## 10. Backup plan (nothing below has been done)

**Current facts.** No external volume is mounted. No Time Machine destination is configured. `main` is 60 commits
ahead of `origin`. Remote push is not authorized. Everything exists on one internal disk.

**Scope** (`node repro/backup-manifest.mjs`):

| item | size | why a clone is not enough |
|---|---|---|
| `git bundle create … --all`: 12 refs including custody refs and the stash | pack 2.19 GiB | contains protected blobs through the custody refs |
| Custody control files: 3 hooks, guard script, identity list, guard manifest, `.git/info/exclude` | 7 files | live inside `.git` |
| Protected overlay | 31 files, 201 KB | untracked by design |
| Uncommitted tracked modifications, including the import cut | 10 files | working tree only |
| Untracked, not ignored | 36 files at the time of writing | working tree only |
| SK1 `work/` | 305 files, 46.4 MB | gitignored |
| Other gitignored experiment data (44 entries; 21 more are OS or environment artifacts) | 1,388 files, 1.53 GB | owner decides which to keep |

**Approved storage.** Owner-controlled offline media only: an external drive, ideally two, kept in different places.
Not cloud storage, not a remote git host, not a shared or synced folder.

**Encryption.** An APFS encrypted volume, or an AES-256 encrypted disk image, with the passphrase held by the owner
and not stored on this machine's disk next to the image.

**Integrity.** Write the scope manifest next to the backup with `backup-manifest.mjs --out`, and record its
`scopeSha256` somewhere separate. Run `git bundle verify` on the bundle.

**Restore test.** Restore to a location on a different device than this repository: clone from the bundle, fetch
every ref, then put back the control files, overlay, modifications, untracked files and `work/`.

**Acceptance.** `INDEPENDENT_BACKUP_VERIFIED=true` may be stated only when all four hold on the restored copy:

1. `backup-manifest.mjs verify --manifest … --root <restored>` prints `BACKUP_RESTORE_VERIFIED` (every listed file
   and ref matches, `git fsck` is clean, the restored root is on a different device). A same-device run is labelled
   `REHEARSAL` and does not count.
2. `repro/inventory.mjs verify` passes there.
3. `infra/run.mjs check` prints `SK1_CHECK_PASS` there.
4. The backup medium has since been detached.

**Never.** Upload the bundle, the overlay, `work/` or the manifest; push custody refs; copy protected files into a
tracked path; treat a restored validation population as fresh.
