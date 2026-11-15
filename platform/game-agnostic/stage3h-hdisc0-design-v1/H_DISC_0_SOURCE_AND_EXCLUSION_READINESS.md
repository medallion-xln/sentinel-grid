# STAGE 3H H-DISC-0 — Source, exclusion and recovery readiness

AUTHORITY: R0 · BASE HEAD `eb75dff8` · Gate 5 · bounded infrastructure preparation

Machine record: `evidence/HDISC0_READINESS.json` (`readiness/campaign-entry-gate.mjs`).
Nothing here allocated a block, generated a world, trained a model, ran an evaluation, copied a protected file or
created a backup. No existing lane, loader, registry, hook or frozen record was modified.

```
EXCLUSION_SOURCE_CLEAN_CHECKOUT=true     (a NEW portable loader imports and enforces from committed source alone)
HISTORICAL_LOADERS_CLEAN_CHECKOUT=false  (unchanged; they still cannot be imported without protected source)
EXCLUSION_REGISTRY_ENFORCEMENT=VERIFIED  (identical to the historical successor context; 163 of 163 controls)
PROTECTED_SOURCE_CUSTODY=INTACT_NOT_PORTABLE   (31 of 31 identities match; 29 evaluation files remain outside git)
EVALUATION_REPRODUCIBILITY=NOT_FROM_A_CLEAN_CHECKOUT_ALONE
EVIDENCE_BUNDLE=TOOLING_ONLY             (specification and verifier exist; no bundle has been issued)
BACKUP_VERIFIED=false
CAMPAIGN_ENTRY_GATE=NO_GO                (2 of 7 conditions met)
```

## 1. Why the historical loaders are not portable

`loadSk1Exclusions()` and `loadSuccessorExclusions()` read only tracked records. What ties them to custody-protected
source is two **constants**, each exported by a module whose import graph reaches protected files:

| constant | value | exported by | shortest path to protected source |
|---|---|---|---|
| `EXCLUDED_BLOCKS` | blocks 731 and 732 | `stage3h-owner-governed-v1/allocate-namespaces-v4.mjs` | `→ connector.mjs → stage3h-canonical-v1/adapters.mjs` |
| `PCD_VERSION` | `'HW1_PCD_V1'` | `stage3h-hw1-dev-v1/i2-pcd.mjs` (through `i2-registry.mjs`) | `→ transforms.mjs → stage3h-failure-diagnosis-v1/lib.mjs → stage3h-canonical-v1/adapters.mjs` |

Nothing else is needed: no schedule, no world generator, no hash helper. Through the first chain the successor loader's
static closure is 117 files, 29 of them protected; through the second, `i2-registry.mjs` alone reaches 5.
The committed import cut does not change either chain.

## 2. The portable loader

`readiness/exclusions/portable-exclusions.mjs` — `HDISC_PORTABLE_EXCLUSIONS_V1`.

- Imports `node:fs`, `node:path`, `node:url`, `node:crypto` and nothing else.
- Reads 26 tracked records: the SK1 exclusion registry, the SK1 spend ledger, 7 sealed registries, 3 SK1 registries,
  4 strict-index records and 10 sealed V4 ledgers.
- Restates the historical semantics line for line, with the two constants embedded as literals: fail-closed load,
  hash and seal verification of every registry, forbidden-block rejection, strict world and seed preflight, and
  public-class matching on both the fine and the coarse key. Refusal messages are the historical ones.
- No part had to be left out. Nothing in the exclusion path needs the protected schedule.

It is prospective tooling for a future allocator. It does **not** repair or replace the historical loaders, which are
byte-identical to before, and every past population was gated by them, not by this file.

### Equivalence, measured in this working tree

| check | result |
|---|---|
| embedded constants equal the historical exports (8 constants) | equal |
| context identity (forbidden blocks, strict blocks, seeds, worlds and sources, registry seals, fine and coarse indexes) | identical, `fd768113…` for both |
| forbidden blocks / sealed and SK1 registries | 114 / 10 |
| distinct excluded worlds / excluded seeds | 109,082 / 25,499 |
| public-class keys, fine / coarse | 18,927 / 11,893 |
| probe vectors with identical verdicts | **2,056 of 2,056** |
| — blocks 90–1010 and malformed blocks | 927 |
| — blocks holding an individually excluded seed | 3 |
| — spent world hashes, sampled from every source combination | 300 |
| — spent public-class identities, coarse / fine, sampled from all 10 registries | 410 / 410 |
| — clean and malformed identities; a seven-row population | 5 / 1 |
| tampered ledgers and registries refused with the same message by both loaders | 6 ledgers, 9 registries; an untouched ledger copy loads in both |

### Positive demonstration and negative controls

Positive: 12 synthetic candidate classes with clean identities on a block the context does not reject — block
accepted, every admission accepted, contamination report empty.

| negative controls | count | all rejected |
|---|---|---|
| spent, retired and rejected blocks (901, 910, 911, 913, 914, 801, 813, 827, 828, 837, 731, 733, 951, …), singly and as a population; all of 801–837 and 901–914; malformed blocks | 40 | yes |
| spent world from each of the four strict sources, as base world and as member world; a non-canonical hash | 13 | yes |
| a spent identity from each of the 7 sealed and 3 SK1 registries, at both key levels | 70 | yes |
| tampered, missing, re-hashed and unknown-schema records | 38 | yes |
| sanity loads of the untouched private copy, before and after | 2 | load |
| **total** | **163** | **163 behave as expected** |

Record controls include: one flipped bit in each sealed registry; a registry removed; a forbidden block deleted with
and without re-hashing the record; a retired block re-labelled as available; `failClosed` switched off; a sealed
registry given an unknown schema and re-pinned so only the schema check can stop it; an identity removed and re-pinned
(caught by the seal); strict-index hashes removed, duplicated or missing. Each is refused with its own code.

### Clean checkout

`git archive HEAD` of the 26 inputs into a temporary directory, with the loader and self-check copied in.

| in the export | result |
|---|---|
| files / protected files / `work/` data / `.git` | 28 / 0 / 0 / none |
| portable loader imports, verifies every hash and loads | yes |
| context identity | `fd768113…`, the same as in the working tree |
| positive demonstration | pass |
| negative controls | 163 of 163 |
| `loadSk1Exclusions`, `loadSuccessorExclusions` | **do not import**; after 64 tracked modules were supplied from HEAD the first missing module is `stage3h-canonical-v1/adapters.mjs`, which is custody-protected and in no commit |

### Pins

`readiness/exclusions/input-pins.json` binds the loader source, the 26 input hashes and the context identity as they
were when equivalence was measured. The pin tool refuses to write unless the two contexts are identical. A clean
checkout cannot re-measure equivalence, but it can verify the pins; equal pins mean the same code is reading the same
records that were shown equivalent here.

### What may and may not be claimed

| claim | status |
|---|---|
| Exclusion **source** is importable and testable from a clean checkout | **true**, for the portable loader |
| Exclusion enforcement is demonstrated, positively and with negative controls | **true** |
| The historical loaders are importable from a clean checkout | **false**, unchanged |
| Past populations were gated by the portable loader | **false** |
| Any block is free or allocated | **not claimed** |

For planning only: of blocks 100–999, the context does not reject 786 (100–730, 735–800, 838–900, 915–940). That is not
a list of unused blocks and not an allocation. Blocks below 100 or above 999 fail the 12-digit seed rule.

## 3. Protected-source custody (unchanged)

| fact | value |
|---|---|
| protected identities listed / present / matching their recorded hash / tracked | 31 / 31 / 31 / 0 |
| guard manifest (3 hooks, guard script, identity list) | intact |
| protected files in the SK1 evaluation closure | **29, still outside git** |
| SK1 evaluation closure | 154 files: 125 tracked and equal to HEAD, 0 modified, 0 unresolved, 29 protected |

No protected file was moved, copied or committed.

## 4. Evidence bundle — `SENTINEL_EVIDENCE_BUNDLE_V1`

The mechanism by which a second machine could lawfully obtain what git does not hold.
Tool: `readiness/bundle/evidence-bundle.mjs`. **It reads and hashes; it never copies, packs or transmits.**

| requirement | how it is met |
|---|---|
| source identity verification | every entry is bound by path, sha256, size and mode; protected entries must equal the custody identity list or the manifest is refused |
| access control | declared in the manifest: `OWNER_HELD_ENCRYPTED_CONTAINER`, a named recipients list, `OFFLINE_MEDIA_ONLY`; the owner is the only issuer |
| integrity | `entriesSha256` over the canonical entry list; `manifestSha256` over the whole manifest |
| explicit versioning | integer `bundleVersion`; a version above 1 must name the manifest hash it supersedes; `verify --minimum-version` refuses a superseded one |
| independent recovery | the bundle scope is a subset of what the SK2-F `backup.mjs restore-verify` step restores and checks |
| reproducible environment | the manifest pins the runtime; `verify` refuses any other |

Scope a manifest issued from this working tree would have (computed in memory; **not an issued bundle**):

| class | entries | content |
|---|---|---|
| PROTECTED_SOURCE | 31 | 29 in the SK1 evaluation closure, 2 protected files outside it |
| LOCAL_SCIENTIFIC_DATA | 19 | 2 population manifests, 9 validation class shards, 8 identity-audit shards (13.9 MB) |
| CUSTODY_CONTROL | 7 | 3 hooks, guard script, identity list, guard manifest, `.git/info/exclude` |

`--include-optional` adds the 9 exploration class shards that the SK1.1 and SK2-F extraction checks read (28 data
entries, 34.9 MB in total). A future campaign's own populations would be added by a later bundle version.

`verify --manifest <file> --root <checkout>` reports whether: the manifest is untampered and current; every entry is
present and matching; no protected path is tracked; the base commit is in the checkout's history; the runtime is the
pinned one; and every declared evaluation entry point links (static import closure, nothing executed).
Verified in place against this working tree: 57 of 57 entries match, 154 files in the link closure, nothing unresolved.

Environment setup on a second machine, exactly:

1. Install Node `v26.7.0` on `darwin-arm64` (the only runtime the SK1 results were produced and observed on).
2. Clone the repository from an owner-supplied git bundle and check out the base commit named in the manifest.
3. Mount the owner-held encrypted container and place each listed file at its listed path.
4. `node readiness/bundle/evidence-bundle.mjs verify --manifest <manifest> --root <checkout>` → `EVIDENCE_BUNDLE_VERIFIED`.
5. `node infra/run.mjs check` in the SK1 lane → `SK1_CHECK_PASS`.

What a verified bundle would and would not give:

| | clean checkout alone | clean checkout plus a verified bundle |
|---|---|---|
| kernel inference, its tests, demonstration | yes | yes |
| portable exclusion loader and its controls | yes | yes |
| historical exclusion loaders | no | yes |
| SK1 check mode | no | yes (measured in SK1.1 with the same supplements) |
| a claim of clean-checkout reproducibility | no | **still no** — it is reproducibility with external inputs, and must be described that way |

Tested on a tiny synthetic repository: a faithful overlay verifies; a missing file, an altered source, data or guard
file, a protected path added to git, a different runtime, a tampered or re-pointed manifest, a non-git directory, a
missing base commit and a superseded version are each refused with their own code. The command line refuses `--out`
inside the repository.

## 5. Backup acceptance

Current facts: one volume mounted (the internal disk); no Time Machine destination; no external destination is
authorized. **BACKUP_VERIFIED=false.** Nothing was copied.

The procedure is the SK2-F one, unchanged. Checklist for the owner:

| # | step | command | evidence |
|---|---|---|---|
| 1 | dry run against the mounted offline drive | `node ../stage3h-sk2f-feasibility-v1/infra-audit/backup/backup.mjs plan --dest /Volumes/<drive>` | destination accepted; sizes |
| 2 | write the encrypted backup, in a terminal | `… backup.mjs run --dest /Volumes/<drive> --owner-approved-destination` | `BACKUP_WRITTEN_NOT_YET_VERIFIED_BY_RESTORE`; record the printed scope sha256 separately |
| 3 | restore on a **different device** and verify; save the output | `… backup.mjs restore-verify --backup <mounted backup> --to <new directory on another device> --owner-attests-medium-detached > restore-output.json` | `ALL_FOUR_ACCEPTANCE_CONDITIONS_MET` |
| 4 | detach the medium | — | owner attestation |
| 5 | compose the acceptance record | `node readiness/backup/acceptance-record.mjs compose --restore-output restore-output.json --head <commit> --scope-sha256 <hex> --medium-label <text> --encryption AES-256_SPARSEBUNDLE --attested-by <owner name> --out <record>` | a record that validates |
| 6 | commit the record | owner | tracked, unmodified |

The four acceptance conditions are those of the restore step: manifest restore on a different device; reproducibility
status verify in the restored copy; SK1 check in the restored copy; medium detached.

`SENTINEL_BACKUP_ACCEPTANCE_RECORD_V1`:

| field | content |
|---|---|
| `recordedAt` | date of the restore verification |
| `attestedBy` | `{ role: "OWNER", name }` — a human; a model or script may not attest |
| `source` | backed-up commit, the scope sha256 printed by `run`, bundle size |
| `medium` | `OFFLINE_EXTERNAL`, a label, the encryption method, `detachedAfterVerification: true` |
| `restoreVerify` | the result, the four conditions, the restore summary, and the sha256 of the exact output text |
| `evidenceBundle` | optional reference to the bundle manifest issued from the same state |
| `recordSha256` | self-hash |

A record validates only if all four conditions are true, the restore label is `RESTORE_ON_DIFFERENT_DEVICE`, no file
or ref mismatched, the medium is encrypted and attested detached, the owner attestation is present, the record is
unaltered, the backed-up commit is in the current history, and it contains the commit of the frozen protocol.
A same-device rehearsal never validates.

## 6. Campaign-entry provenance gate

`readiness/campaign-entry-gate.mjs`. Seven conditions, each computed from repository state. No flag can assert one.
Any failed or unevaluable condition gives NO_GO. GO authorizes nothing; a campaign still needs owner authorization.

| # | condition | passes only when | now |
|---|---|---|---|
| G1 | verified source custody | every protected identity present and matching, none tracked, guard manifest intact | **PASS** (31 of 31) |
| G2 | verified excluded-population enforcement | portable context loads; pins match; positive case passes; every negative control rejected; equivalence identical where measurable | **PASS** |
| G3 | reproducible evaluation environment | an owner-issued bundle manifest, bound by the campaign declaration, verifies; runtime pinned and matching | **FAIL** — no issued bundle manifest |
| G4 | independently recoverable evidence | a committed, valid backup acceptance record that contains the frozen protocol's commit | **FAIL** — no record |
| G5 | frozen scientific protocol | a committed freeze record with status `FROZEN` whose hash matches the committed protocol document | **FAIL** — only a draft exists |
| G6 | no uncommitted source dependency | the declared source closure is entirely tracked-equals-HEAD or bundle-verified protected source | **FAIL** — no closure declared |
| G7 | no privileged inference leakage | the declared inference closure exists and reaches no evaluator, training, privileged-data or protected module | **FAIL** — no policy implementation exists |

**Decision: NO_GO, 2 of 7.** G5 and G7 cannot pass in this stage by construction: it writes a design and a draft.

Informational, not a pass: the SK1 evaluation closure has no modified and no unresolved file today, and the runtime in
use equals the pinned one. G6 would still fail on 29 protected files that no issued bundle has verified.

What the gate reads from a future campaign:

- `SENTINEL_CAMPAIGN_DECLARATION_V1`: `campaignId`, `preregistration.freezeRecord`, `sourceEntryPoints`,
  `inferenceEntryPoints`, `evidenceBundle.manifestSha256`, `backupAcceptanceRecord`.
- `SENTINEL_PREREGISTRATION_FREEZE_V1`: `campaignId`, `status: "FROZEN"`, `protocol.file`, `protocol.sha256`.

Tests show each condition alone forces NO_GO in every way it can fail (51 synthetic breaks), that missing or malformed
facts never give GO, and that a synthetic fixture with all seven met gives GO.

## 7. Tooling and how to run

| file | purpose |
|---|---|
| `readiness/exclusions/portable-exclusions.mjs` | the portable loader |
| `readiness/exclusions/selfcheck.mjs` | positive demonstration and negative controls; runs in a clean checkout |
| `readiness/exclusions/equivalence.mjs` | comparison with the historical loader, where it can be imported |
| `readiness/exclusions/clean-checkout.mjs` | the export probe |
| `readiness/exclusions/pin-inputs.mjs`, `input-pins.json` | pins |
| `readiness/bundle/evidence-bundle.mjs` | bundle manifest and verifier |
| `readiness/backup/acceptance-record.mjs` | acceptance record composer and validator |
| `readiness/campaign-entry-gate.mjs` | the gate and the evidence record |

```
cd platform/game-agnostic/stage3h-hdisc0-design-v1
node --test readiness/exclusions/*.test.mjs readiness/bundle/*.test.mjs readiness/*.test.mjs    # 38 tests
node readiness/exclusions/selfcheck.mjs          # HDISC_PORTABLE_EXCLUSIONS_SELFCHECK_PASS
node readiness/exclusions/clean-checkout.mjs     # HDISC_PORTABLE_EXCLUSIONS_CLEAN_CHECKOUT_PASS
node readiness/exclusions/pin-inputs.mjs verify  # HDISC_EXCLUSION_PINS_VERIFY_PASS
node readiness/campaign-entry-gate.mjs verify    # HDISC0_READINESS_VERIFY_PASS, decision NO_GO
```

Tests that need the historical loaders or the custody overlay skip with a message in a clean checkout.

## 8. Limits

- Equivalence is with the historical loaders as they stand at `eb75dff8`, on the 26 records as they stand. A change
  to either shows up as a pin failure, not as silent drift.
- Probe vectors sample the identity space; the context-identity digest covers all of it.
- The evidence bundle and the backup are specified and tooled, not created.
- Runtime reproducibility is observed on one runtime only.
- Readiness of source and exclusions says nothing about the scientific design.
