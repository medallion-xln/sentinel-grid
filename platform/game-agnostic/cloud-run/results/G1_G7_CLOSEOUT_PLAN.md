# H-DISC-1 entry conditions G1–G7: close-out plan

Status: PLAN ONLY. Nothing here was issued, backed up, attested, committed or run beyond read-only checks.
Written: 2026-11-15, from the cloud checkout of snapshot `7512aab2` (branch `claude/stage3h-cloud-results`).

## 0. Where things stand

| Where | Result | Source |
|---|---|---|
| Cloud, key-less, Linux x64, Node v26.7.0 | NO_GO, 2 of 7 (G2, G7 pass) | `CLOUD_RUN_NOKEY_RESULT.json` |
| Owner's Mac, full working tree, pinned node | NO_GO, 4 of 7 (G1, G2, G5, G7 pass) | `stage3h-hdisc1-discriminator-v1/evidence/HDISC1_G4_G7_RECHECK.json` (HEAD `7b8c2edd`) |
| Throwaway clone on the Mac with **synthetic** issuance and acceptance records | 6 of 7 with issuance alone, 7 of 7 with both | same record, `gatePathDryRun` |

**Step 2 of the brief: done here, but it can't show the local state.** This container has neither the custody files nor the protected sources, so its gate and freeze run (the cloud result above) only reproduces the key-less state. The local state comes from the Mac recheck record. Before step 1 below, rerun on the Mac with the pinned runtime to confirm it still holds:

```sh
cd platform/game-agnostic/stage3h-hdisc1-discriminator-v1
/opt/homebrew/bin/node readiness/campaign-entry-gate.mjs --probe     # expect NO_GO, 4 of 7
/opt/homebrew/bin/node readiness/preregistration-freeze.mjs          # expect ok: true
/opt/homebrew/bin/node readiness/evidence-bundle-manifest.mjs verify # expect HDISC1_BUNDLE_DRAFT_VERIFY_PASS
```

Local reasons recorded on the Mac:
- **G3:** NO_ISSUED_EVIDENCE_BUNDLE_MANIFEST, BUNDLE_MANIFEST_NOT_BOUND_BY_A_CAMPAIGN_DECLARATION, EVIDENCE_BUNDLE_NOT_VERIFIED, OWNER_ISSUANCE_NOT_VERIFIED. RUNTIME_DIFFERS_FROM_PIN is absent there.
- **G4:** NO_BACKUP_ACCEPTANCE_RECORD, BACKUP_ACCEPTANCE_RECORD_NOT_COMMITTED, BACKUP_ACCEPTANCE_RECORD_NOT_VALID, BACKUP_DOES_NOT_BIND_ISSUED_BUNDLE.
- **G6:** PROTECTED_SOURCE_NOT_BUNDLE_VERIFIED (29 files), PROTECTED_EVALUATION_SOURCE_REQUIRES_VERIFIED_ISSUANCE.

**What's left is two owner acts.** One is a bundle issuance, which closes G3 and with it G6. The other is an independent-device backup acceptance, which closes G4. The synthetic dry run on the Mac found no other blocker in the gate path.

**Do all of this in the real local history, not the cloud snapshot.** Snapshot `7512aab2` is a curated history with different commit ids. In the cloud run the gate's freeze commit read as `7512aab2`, while the real one is `aa170d67`. A manifest, issuance or backup bound to the snapshot would not bind the real repository.

## 1. Order of work

Checked against the code. G1 already passes on the Mac and is not a step there.

```
pre-check (agent, Mac)  →  G3 issuance (owner)  →  G6 follows from G3  →  G4 backup + second-Mac restore (owner)  →  full rerun (agent)
                                                    G1, G2, G5, G7: regression checks after every commit
```

G4 has to come after G3, for two reasons:
- The H-DISC-1 gate requires the acceptance record's `evidenceBundle.{bundleId, manifestSha256}` to equal the issued manifest (`readiness/campaign-entry-gate.mjs`, BACKUP_DOES_NOT_BIND_ISSUED_BUNDLE).
- `acceptance-record.mjs compose --bundle-manifest` needs that manifest as input.

G6 needs no separate act. Its protected-file check clears only when the bundle is issued, bound and verified, and its additional H-DISC-1 check fails whenever G3 is not PASS.

## 2. Per condition

### G1: verified source custody

- **Cloud reasons:** CUSTODY_IDENTITY_LIST_UNREADABLE, NO_PROTECTED_IDENTITIES_LISTED, CUSTODY_GUARD_NOT_INTACT.
- **Mac:** PASS.
- **What the gate checks** (`stage3h-hdisc0-design-v1/readiness/campaign-entry-gate.mjs`, `custodyFacts`):
  - `<git-common-dir>/custody/protected-identities.tsv` is readable and lists at least one identity.
  - Every listed file is present, its sha256 matches, and none is tracked.
  - Every line of `<git-common-dir>/custody/GUARD_MANIFEST.sha256` matches.
- **Evidence:** the custody control files inside `.git` and the 31 protected files in the working tree. None of this is committed, by design.
- **Producing tool:** none needed. The files exist on the Mac. On the second Mac, `backup.mjs` restores them (it copies the custody control files and the protected overlay).
- **Who:** nobody, as long as the Mac tree stays intact. Agent: regression check only.
- **Depends on:** nothing.
- **Confirm:** gate shows `G1_VERIFIED_SOURCE_CUSTODY: PASS`. It must also pass inside the restored copy on the second Mac.

### G2: verified excluded-population enforcement

- PASS in the cloud and on the Mac: 10 sealed registries, 114 forbidden blocks.
- **Checks:** the portable exclusion context loads, the pins verify, the self-check passes with every negative control rejected, and the equivalence result is identical or explicitly unavailable.
- **Who:** agent, regression only. No owner act. No step below touches `readiness/exclusions/`.
- **Confirm:** gate shows `G2_...: PASS`. Optionally also run `node stage3h-hdisc0-design-v1/readiness/exclusions/selfcheck.mjs`.

### G3: reproducible evaluation environment

**Current reasons.** In the cloud there are five, adding RUNTIME_DIFFERS_FROM_PIN, because the pin is darwin-arm64. On the Mac there are four, listed in section 0.

**What the gate checks.** The inherited gate's `environmentFacts` requires:
- `evidence/HDISC1_ISSUED_BUNDLE_MANIFEST.json` exists, has schema `SENTINEL_EVIDENCE_BUNDLE_V1`, and its self-hash is correct;
- `protocol/HDISC1_CAMPAIGN_DECLARATION.json` sets `evidenceBundle.manifestSha256` to that hash (today it is `null`);
- `verifyBundle(manifest, REPO)` passes: every entry is present with matching sha256 and size, nothing protected is tracked, `baseCommit` is an ancestor of HEAD, every link target resolves, and the runtime is node v26.7.0 on darwin-arm64;
- the runtime is pinned and the current runtime matches it.

The H-DISC-1 additions require `evidence/HDISC1_BUNDLE_ISSUANCE.json` to:
- pass `validateIssuance`: schema `SENTINEL_EVIDENCE_BUNDLE_ISSUANCE_V1`, a valid self-hash, a binding to this manifest's hash, id and version, and a manifest with no placeholder recipient and no DRAFT status;
- name a human `OWNER` issuer and give an issue date;
- describe the container: `OWNER_HELD_ENCRYPTED_CONTAINER`, encryption `AES-256_SPARSEBUNDLE` or `ENCRYPTED_VOLUME`, a label, and `OFFLINE_MEDIA_ONLY` transport;
- name recipients equal to the manifest's;
- give `placementVerification.result = EVIDENCE_BUNDLE_VERIFIED` with the sha256 of the exact verifier output;
- be committed and equal to HEAD.

**Steps.** Every command runs with `/opt/homebrew/bin/node` v26.7.0. The default nvm node (v22) causes RUNTIME_MISMATCH.

1. *Owner:* choose the named recipients and provide approved offline media with an encrypted container (AES-256 sparsebundle or encrypted APFS volume).
2. *Owner:* copy the 57 files listed in `evidence/HDISC1_EVIDENCE_BUNDLE_MANIFEST_DRAFT.json` into the container, at their listed paths. These are 31 protected sources, 19 data files and 7 custody controls.
3. *Owner:* build the manifest outside the repository. The tool refuses an `--out` inside it.
   `node platform/game-agnostic/stage3h-hdisc0-design-v1/readiness/bundle/evidence-bundle.mjs manifest --recipient <name> [--recipient <name>...] --out <path outside repo>`
4. *Owner:* verify the placement. Make a clean `git clone --no-local` of the branch, copy the container's contents over it, then run:
   `node .../evidence-bundle.mjs verify --manifest <manifest> --root <that clone>`
   Keep the exact output text. It must end with `EVIDENCE_BUNDLE_VERIFIED`.
5. *Owner:* compose the issuance record with `composeIssuance` from `readiness/evidence-bundle-manifest.mjs`. Its arguments are the manifest, the owner name, `issuedAt`, the encryption, the container label, the recipients and the verifier output text. **There is no CLI for this** (section 4), so call the exported function from a one-off `node -e` or `node --input-type=module` script.
6. *Owner (or an agent under explicit owner instruction):*
   - copy the manifest to `evidence/HDISC1_ISSUED_BUNDLE_MANIFEST.json` (identities only, no content);
   - write the record to `evidence/HDISC1_BUNDLE_ISSUANCE.json`;
   - set `evidenceBundle.manifestSha256` in the declaration;
   - commit all three.
   The Mac dry run confirmed that binding the hash in the declaration does not disturb the freeze. The declaration must be committed, or G5 adds CAMPAIGN_DECLARATION_NOT_COMMITTED.

- **Depends on:** G1 (the manifest builder refuses unless every protected file matches the custody list) and a clean working tree for the declared closure.
- **Confirm:** `node readiness/campaign-entry-gate.mjs --probe` should show G3 PASS and G6 PASS, 6 of 7, as in the dry run.

### G4: independently recoverable evidence

**Current reasons:** NO_BACKUP_ACCEPTANCE_RECORD, BACKUP_ACCEPTANCE_RECORD_NOT_COMMITTED, BACKUP_ACCEPTANCE_RECORD_NOT_VALID, BACKUP_DOES_NOT_BIND_ISSUED_BUNDLE, the same in the cloud and on the Mac.

**What the gate checks.** The inherited gate's `recoveryFacts` and `validateRecord` require `evidence/HDISC1_BACKUP_ACCEPTANCE.json`, the path the declaration names, to:
- be committed and unmodified, with schema `SENTINEL_BACKUP_ACCEPTANCE_RECORD_V1` and a valid self-hash;
- carry an `OWNER` attestation;
- describe the medium as class `OFFLINE_EXTERNAL`, encrypted, attested as detached, with a label;
- give `restoreVerify.result = ALL_FOUR_ACCEPTANCE_CONDITIONS_MET` with all four conditions true;
- give the restore label `RESTORE_ON_DIFFERENT_DEVICE`, with files and refs checked, none missing, mismatched or wrong, and fsck ok;
- give the restore output hash;
- name a backed-up `source.head` that is an ancestor of HEAD and contains the freeze commit. The freeze commit is the last commit touching `protocol/HDISC1_PREREGISTRATION_FREEZE.json`, which is `aa170d67` on the Mac.

The H-DISC-1 addition requires `evidenceBundle.{bundleId, manifestSha256}` to equal the issued manifest.

**Steps:**

1. *Owner:* attach an external encrypted drive with at least 3.05 GiB free. Per the dry run, the backup is 2.24 GiB: a git bundle of 13 refs, 305 SK1 `work/` files, 31 protected files and 7 custody files. Cloud-synced, network and same-device destinations are refused.
2. *Owner, in an interactive terminal, after the G3 commit:*
   - `node platform/game-agnostic/stage3h-sk2f-feasibility-v1/infra-audit/backup/backup.mjs plan --dest <path>`, then
   - `... run --dest <path> --owner-approved-destination`. The passphrase goes in at hdiutil's own prompt.
   - Record the printed head and scope sha256, then detach the medium.

   Backing up after the issuance commit means the restored copy is the issued state.
3. *Owner, on a second Apple Silicon Mac with Node v26.7.0, from `stage3h-hdisc1-discriminator-v1` in a checkout:*
   `/opt/homebrew/bin/node custody/machine-identity.mjs restore-verify --backup <mounted backup dir> --to <new empty dir> --owner-attests-medium-detached`
   - It has to be the wrapper, not bare `backup.mjs`. The wrapper refuses condition 1 if the restoring Mac hashes to `custody/SOURCE_MACHINE_IDENTITY.json` (defect D1).
   - It has to be a restore of the *backup*. The 57-file bundle alone fails condition 2 (305 → 19 work files).
   - Keep the output file.
4. *Owner:* compose and validate the record:
   `node platform/game-agnostic/stage3h-hdisc0-design-v1/readiness/backup/acceptance-record.mjs compose --restore-output <file> --head <backed-up head> --scope-sha256 <hex> --medium-label <text> --encryption <AES-256_SPARSEBUNDLE|ENCRYPTED_VOLUME> --attested-by <owner name> --bundle-manifest <issued manifest> --out platform/game-agnostic/stage3h-hdisc1-discriminator-v1/evidence/HDISC1_BACKUP_ACCEPTANCE.json`
   then
   `... acceptance-record.mjs validate --record <that file>`
5. *Owner:* commit the record. Committing it moves HEAD forward. The backed-up head stays an ancestor, and the bundle `baseCommit` stays in history.

- **Depends on:** G3 (the issued manifest) and the freeze commit being in the backed-up history. G1 must also pass in the restored copy, which the restore covers.
- **Confirm:** gate shows 7 of 7, GO.

### G5: frozen scientific protocol

**Current reasons.** In the cloud: HDISC1_PREREGISTRATION_NOT_VERIFIED, from SOURCE_DEPENDENCY_UNRESOLVED on 12 protected files. On the Mac: PASS (`verifyFreeze ok`; 180 bound source hashes, 29 of them protected).

**What the gate checks:**
- Inherited: a declaration exists; the freeze record is committed and FROZEN; the protocol hash matches.
- H-DISC-1:
  - the declaration is committed at HEAD;
  - `verifyFreeze()` passes. It recomputes the prospective plan, which requires the 12 protected files present so that the closure links, and every bound source hash equal. The plan and the freeze record must both be committed.

**Evidence:** `protocol/HDISC1_FROZEN_PREREGISTRATION.json` and `protocol/HDISC1_PREREGISTRATION_FREEZE.json` (already committed, freeze commit `aa170d67`), plus the protected sources in the working tree.

**Who:** no owner act. Agent: regression check after every commit.

**Watch for:**
- Any edit to a frozen source, including any validator change such as C1 or D1 enforcement, breaks the freeze and needs a prospective amendment with a successor freeze.
- Do not edit files in the 180-file closure while closing G3 and G4.

**Confirm:** `node readiness/preregistration-freeze.mjs` gives `ok: true`, and the gate shows `G5: PASS`.

### G6: no uncommitted source dependency

**Current reasons:**
- Cloud: UNRESOLVED for the same 12 protected files, in a 151-file committed closure.
- Mac: PROTECTED_SOURCE_NOT_BUNDLE_VERIFIED (29 files), PROTECTED_EVALUATION_SOURCE_REQUIRES_VERIFIED_ISSUANCE. The closure there is 180 files, all committed or protected, with nothing unresolved.

**What the gate checks:**
- Inherited (`classifyClosure` over `sourceEntryPoints`): no tracked-modified, untracked non-protected or unresolved files. Every protected file must be bundle-verified, which means the bundle is issued, bound by the declaration and passes `verifyBundle`.
- H-DISC-1:
  - all eight `campaign/*.mjs` entries are declared and present (already true);
  - if G3 is not PASS while protected files are in the closure, G6 fails.

**Evidence:** the same G3 evidence. There is no separate record.

**Who:** owner, through G3 only. Agent: confirms the closure files are clean before the G3 commit (`git status` on the closure).

**Depends on:** G3 and G1.

**Confirm:** gate shows `G6: PASS`. This happened in the dry run as soon as the synthetic issuance was committed.

### G7: no privileged inference leakage

- PASS in the cloud and on the Mac: committed-source audit PASS, 12 files, no violations, live call ABSTAIN, `canDispatch: false`.
- **Checks:** the inherited inference closure of `inferenceEntryPoints` is evaluator-free, with no protected, unresolved or uncommitted module. `audit/inference-graph-audit.mjs` must report COMMITTED_SOURCE_AUDIT PASS.
- **Who:** agent, regression only. The G3 and G4 commits touch only `evidence/*.json` and the declaration, which are outside the inference closure.
- **Confirm:** `node audit/inference-graph-audit.mjs committed` gives COMMITTED_SOURCE_AUDIT PASS, and the gate shows `G7: PASS`.

## 3. The two cloud-vs-rehearsal differences

**(a) G1 had three reasons instead of the one in the expected table.**
- The code fixes the reasons. When `protected-identities.tsv` can't be read, `custodyFacts` returns `identities: 0` and `guardManifestIntact: false`, and `evaluateGate` then always emits all three: CUSTODY_IDENTITY_LIST_UNREADABLE, NO_PROTECTED_IDENTITIES_LISTED and CUSTODY_GUARD_NOT_INTACT. The other three G1 checks (present, matching, tracked) are satisfied trivially at 0.
- The Mac's own key-less clean clone in `HDISC1_G4_G7_RECHECK.json` (`sameDeviceRehearsal.cleanCloneAlone`) recorded exactly the same three.
- So the expected table named only the first reason. **The check does not behave differently by platform.**

**(b) hdisc1 tests were 83/87 instead of 84/87.**
- The extra skip is `custody/machine-identity.test.mjs:73`, "INTEGRATION the committed source-machine record validates and this machine yields an identity". It is declared `{ skip: process.platform !== 'darwin' }`, because `currentIdentity()` reads the macOS IOPlatformUUID through `/usr/sbin/ioreg` and returns `null` on other platforms (fail-closed).
- On macOS the test runs and passes, giving 84. On Linux it is skipped, giving 83 with 2 skipped. The two failing files are the same on both, because they can't load `stage3h-canonical-v1/adapters.mjs`, which is inside the overlay.
- **This is platform-dependent by design.** It affects only that test and the machine-identity wrapper, not the gate's decision logic.
- G3's runtime pin is also platform-dependent by design (`darwin-arm64`), so G3 cannot pass on any Linux host.

## 4. What existing tooling can't do

None of these weakens a check. Each is either a gap in convenience or a missing physical or policy prerequisite.

1. **There is no command-line composer for the issuance record.** `composeIssuance` is exported and tested, but `evidence-bundle-manifest.mjs` has only `print`, `--write` and `verify` modes. The owner has to call the function from a short script (G3 step 5). This is not a blocker.
2. **D1 is not enforced by the gate.** The frozen `acceptance-record.mjs` reads only the four conditions and the restore label, so it can't tell whether the machine-identity wrapper was used. Using the wrapper is a procedural requirement. Enforcing it at gate level would tighten the check, and needs a prospective amendment and a successor freeze (`amendments/CUSTODY_AMENDMENT_C1_ENCRYPTED_REMOTE_MEDIUM_DRAFT.md`, section 5). It is not required to reach GO.
3. **The physical prerequisites were missing at the last check.** On 2026-11-14 the Mac had no external drive and no Time Machine destination. Nothing in the repository records whether a second Apple Silicon Mac is available. G4 cannot be met without both.
4. **The cloud can't close G1, G3, G4 or G6 under the committed rules:**
   - there is no key, so no custody files or protected sources;
   - the runtime pin is darwin-arm64;
   - transport is `OFFLINE_MEDIA_ONLY`;
   - the medium must be `OFFLINE_EXTERNAL`, restored on a different physical device;
   - the snapshot history differs from the real one.

   A remote medium would need draft amendment C1 adopted prospectively. It is `DRAFT_NOT_ADOPTED`, and even then the restore must be on a second physical Mac.

## 5. Beyond G1–G7

GO is a provenance result only. `campaign/runner.mjs` still refuses unless `scientificExecutionReady === true` in the declaration and `campaignExecutionAuthorization` names a committed owner record. In the dry run it refused with SCIENTIFIC_IMPLEMENTATION_REVIEW_REQUIRED. `H_DISC_1_EXECUTION_READINESS.md` lists secondary and mechanism reporting and the scientific implementation review as still open. Those are separate owner decisions and are not part of this plan.

## 6. Summary of actions

| # | Who | Action | Closes |
|---|---|---|---|
| 0 | Agent (Mac) | Pinned-node rerun of the gate, freeze, draft-bundle verify and tests; expect 4 of 7 | baseline |
| 1 | Owner | Name the recipients; provide an offline encrypted container; place the 57 files | G3 (prep) |
| 2 | Owner | `evidence-bundle.mjs manifest --recipient … --out <outside>`, then `verify` over a clean clone with the overlay | G3 |
| 3 | Owner | Compose the issuance record (`composeIssuance`); place the manifest and record; bind `manifestSha256` in the declaration; commit | G3, G6 |
| 4 | Agent | Gate rerun; expect 6 of 7. Freeze and inference audit unchanged | check |
| 5 | Owner | External drive with ≥3.05 GiB free; `backup.mjs plan`, then `run --owner-approved-destination`; detach | G4 (prep) |
| 6 | Owner | On a second Apple Silicon Mac: `machine-identity.mjs restore-verify … --owner-attests-medium-detached` | G4 |
| 7 | Owner | `acceptance-record.mjs compose … --bundle-manifest <issued>`, then `validate`; commit | G4 |
| 8 | Agent | Final gate `--probe` (expect GO, 7 of 7), freeze, inference audit and test suites; record the observation | all |
