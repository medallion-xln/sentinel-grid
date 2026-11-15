# Custody amendment C1: encrypted remote medium (DRAFT, not adopted)

STATUS: `DRAFT_NOT_ADOPTED` · AUTHORITY: R0 · BASE HEAD `085c4002` · drafted 2026-11-14 at the owner's request ("Draft cloud amendment")

This is a proposal. It changes no validator, gate, record or frozen file. Until the owner adopts it in writing and the steps in section 6 are complete, the current rules stand: offline media only, never uploaded. The gate stays 4 of 7.

## 1. What problem this solves

G3, G4 and G6 need an owner-issued evidence bundle and a backup restored on a second device. The current procedure accepts only an offline external drive. This Mac has none attached and no Time Machine destination. The amendment would let an encrypted remote store stand in for the drive. It would **not** remove the need for a second physical device or for the owner's own acts.

## 2. What the amendment permits

A new medium class, `CLIENT_ENCRYPTED_REMOTE`, alongside the existing `OFFLINE_EXTERNAL`:

| Rule | Requirement |
|---|---|
| Encryption | Before upload, on this Mac. Use the existing AES-256 APFS sparsebundle (`hdiutil`). The passphrase is typed at `hdiutil`'s own prompt. It is never an argument, variable, file, chat message or provider secret. |
| What leaves the machine | Ciphertext only: the sparsebundle's band files. No plaintext file, git object, manifest of protected content or passphrase is ever uploaded. |
| Store | An object store chosen by the owner, under an account only the owner controls. Versioning on. Object lock or retention set, so a compromised account cannot delete the only copy. |
| Key custody | Held by the owner, plus one sealed offline copy the owner chooses (paper or a password manager). Losing the key means losing the backup; the provider cannot recover it. |
| Integrity | The sha256 of every uploaded band is recorded before upload and checked after download, in addition to the existing `restore-verify` hashes of every restored file. |
| Remote compute | **Not permitted** to hold the key or decrypt. A cloud instance never counts as the restore device. |

## 3. What stays exactly as it is

- **The restore must be on a second physical computer**, owned or controlled by the owner, never a cloud instance. The runtime pin also requires darwin-arm64 with Node v26.7.0, so in practice that means a second Apple Silicon Mac.
- All four acceptance conditions remain. Condition 4 is reworded for the remote case (section 4).
- Issuance stays an owner act with named recipients. A model or script may not issue or attest.
- No git history goes to a remote git host. The pre-push guard stays installed and unchanged.
- The bundle and backup scopes are unchanged. The restore must be of the **backup** (all 305 SK1 `work/` files), because the 57-file bundle alone fails acceptance condition 2 (`HDISC1_G4_G7_RECHECK.json`).
- Training and validation remain blocked even at 7 of 7, pending the scientific implementation review and a separate execution authorization.

## 4. Acceptance conditions under C1

| # | Current wording | C1 wording for `CLIENT_ENCRYPTED_REMOTE` |
|---|---|---|
| 1 | Restore on a different device; every file and ref matches; fsck clean | Unchanged, **plus** a machine-identity check (section 5, defect D1): the restoring computer's hardware identity must differ from the source machine's |
| 2 | `status.mjs verify` passes in the restored copy | Unchanged |
| 3 | `SK1_CHECK_PASS` in the restored copy | Unchanged |
| 4 | Owner attests the medium has been detached | Owner attests that: (a) the restore used ciphertext downloaded from the store, not a local copy; (b) every downloaded band matched its pre-upload sha256; (c) the key never left owner custody; (d) retention or object lock is active on the remote copy |

## 5. A defect found while drafting (applies today, with or without C1)

**D1. "Different device" is a filesystem test, not a machine test.** `stage3h-sk1-1-assurance-v1/repro/backup-manifest.mjs` `verifyRestore` labels a restore `RESTORE_ON_DIFFERENT_DEVICE` whenever the restored root's `st_dev` differs from the repository's. Every mounted volume has its own `st_dev`: on this Mac the repository is 16777232 and the mounted simulator disk image is 16777239. A restore into an encrypted sparsebundle mounted **on this same Mac** would therefore pass condition 1. Only the owner's attestation (condition 4) stands in the way.

This was observed by comparing device ids. No restore was run and nothing was exploited.

**D1 status: repaired at the tool layer; gate-level enforcement is still pending.** `backup-manifest.mjs` and `backup.mjs` are pinned by hash in the SK1.1 and SK2-F source manifests, so neither was edited. Instead:

- `custody/SOURCE_MACHINE_IDENTITY.json` records a one-way, domain-separated sha256 of this Mac's hardware UUID. The UUID itself is not stored. Because the record is committed, every later backup carries it in its history.
- `custody/machine-identity.mjs restore-verify` runs the unchanged `backup.mjs restore-verify`. It then reads the source record from the restored history and sets condition 1 to false when the restoring machine is the source machine, or when either identity cannot be established. It never turns a failure into a pass. When it rejects, the frozen acceptance validator refuses the resulting record, as `custody/machine-identity.test.mjs` shows.
- **Still open:** the frozen validator cannot tell whether the wrapper or the bare tool produced the output. Until an amendment makes `acceptance-record.mjs` require the `machineCheck` field, using the wrapper is a procedure requirement, not a gate check. That validator change belongs in the same prospective amendment as C1 (section 6, step 3), or in an amendment of its own.

## 6. What adoption would require, in order

The custody validators are part of the frozen H-DISC-1 source set, so adopting C1 is a **prospective preregistration amendment**, not an edit.

1. **Owner decision, in writing:** adopt C1 as drafted or modified, and name the store, the account holder, the retention period, the key's offline copy and the second restore computer. Recorded as a committed `SENTINEL_CUSTODY_AMENDMENT_V1` record signed by the owner.
2. **Owner decision on the riskiest content:** `git bundle --all` carries the old protected blobs through the custody refs (`refs/custody/*` and the Codex checkpoint ref). Choose either
   - (a) upload them encrypted, as the offline procedure would, or
   - (b) exclude those refs from the remote copy and keep a separate offline-only copy of them. Under (b), the restore's ref check must be scoped to match.
3. **Source changes** (each with tests):

   | File | Frozen in H-DISC-1? | Change |
   |---|---|---|
   | `stage3h-hdisc0-design-v1/readiness/backup/acceptance-record.mjs` | yes | accept `CLIENT_ENCRYPTED_REMOTE`; C1 condition-4 fields; machine-identity fields |
   | `stage3h-hdisc0-design-v1/readiness/bundle/evidence-bundle.mjs` | yes | an access transport value for client-encrypted remote |
   | `stage3h-hdisc1-discriminator-v1/readiness/evidence-bundle-manifest.mjs` | yes | `validateIssuance` accepts that transport only with an adopted C1 record |
   | `stage3h-hdisc0-design-v1/readiness/campaign-entry-gate.mjs` | yes | G4 requires the C1 record whenever the medium is remote |
   | `stage3h-sk2f-feasibility-v1/infra-audit/backup/backup.mjs` | no | a `stage-remote` mode that writes the encrypted sparsebundle locally (today it refuses same-disk destinations), records band hashes, and never uploads by itself |
   | `stage3h-hdisc0-design-v1/readiness/backup/acceptance-record.mjs` (same file as above) | yes | require `machineCheck.label = DIFFERENT_MACHINE` in the restore output (D1 at gate level). The tool-layer D1 check already exists in `custody/machine-identity.mjs` |
   | `stage3h-hdisc0-design-v1/HDISC0_SOURCE_MANIFEST.sha256` | (pins H-DISC-0) | new pins, kept as a superseding file; the original is preserved |

   The tests that currently assert the offline rules (`campaign-entry-gate.test.mjs`, `bundle/evidence-bundle.test.mjs`, `infra-audit.test.mjs`) keep their offline cases. New cases cover remote acceptance, the refusal without an adopted C1 record, and the D1 refusal.
4. **Renewed freeze:** a new `HDISC1_PREREGISTRATION_FREEZE_A1.json` binding the changed source hashes and naming its predecessor (`aa170d67`). The original freeze and plan stay untouched. `preregistration-freeze.mjs` hard-codes the original freeze paths and is itself frozen, so it needs a successor verifier that checks the chain. The declaration is repointed in a separate commit. G5 is re-verified on committed source. Scientific thresholds, exclusions, the family split (m=19, t=9) and validation locking are unchanged.
5. **Owner acts**, unchanged in kind:
   - stage the encrypted backup;
   - upload the ciphertext;
   - issue the bundle;
   - on the second Mac, download, attach with the passphrase and run `restore-verify`;
   - attest.

   The issuance and acceptance records are then composed from those outputs and committed, and the gate is rerun.

## 7. Risks the owner accepts by adopting C1

| Risk | Under offline-only | Under C1 |
|---|---|---|
| Protected material leaves owner premises | no | yes, as ciphertext |
| Exposure if the passphrase is weak or leaks | needs physical theft of the drive | anyone holding the downloaded ciphertext |
| Metadata visible to the provider | none | backup size, upload and download times, account identity |
| Loss of the only copy | drive failure | key loss, or account loss without retention |
| Relaxes the committed "never uploaded" rule | n/a | **yes**; the old rule stays in history and is superseded only prospectively |

## 8. What this draft does not do

- It does not choose or contact a provider, create an account, upload, push or transmit anything.
- It does not edit any validator, gate, test, freeze, declaration or historical record.
- It does not count a cloud instance as a restore, and it does not authorize cloud compute for the scientific campaign. That needs its own runtime and custody review, and the darwin-arm64 runtime pin would fail on a typical Linux instance anyway.
- It does not change the remaining non-provenance blockers: secondary and mechanism reporting, the scientific implementation review, and a separate owner execution authorization.
