# H-DISC-1 entry-condition implementation

This continuation addresses the seven provenance conditions. Passing them does not establish performance, complete Stage 3H qualification, or authorize a scientific run. The retained mixture remains experimental with delegation disabled.

## Verified condition status

The committed check passes **4 of 7** conditions: G1 custody, G2 exclusions, G5 the prospective scientific freeze, and G7 evaluator-free committed inference. G3 lacks an issued bundle, G4 lacks independent restore acceptance, and G6 has only the 29 protected source files awaiting that bundle verification. No ordinary campaign source dependency remains uncommitted.

Evidence: `evidence/HDISC1_ENTRY_CONDITIONS.json` and `evidence/HDISC1_INFERENCE_AUDIT.json`. The final software checks pass 82 tests. The separate frozen mixture reproduces all 700 decisions with delegation disabled.

## Implementation

The new `campaign/` modules implement class-normalised family-bootstrap tree fitting, the antisymmetric pair objective, five-arm shared-configuration selection, origin-family cross-validation, native population construction, validation locking, the primary paired test and family-clustered intervals, candidate-kernel integration, and a guarded one-pass runner. Synthetic tests exercise the learner, statistical calculation, integration and lifecycle boundaries. No scientific population or learned campaign model has been created.

The native end-to-end campaign has not been exercised. Secondary and mechanism reporting still need completion and review before any execution authorization: the current evaluator reports the primary endpoint, absolute gates and comparator-specific family, but not the entire preregistered secondary/attribution report. Source provenance is not a claim that this remaining scientific reporting has passed acceptance.

The prospective preregistration freezes the design, learner grid, family split and current source identities. It is distinct from the later experiment freeze, which must bind the actual trained models, fresh populations and audit before validation labels open. Historical draft files retain their original status. A source change after the prospective freeze requires a new explicit amendment and renewed source verification.

The H-DISC-1 entry checker also strengthens the inherited checks:

- G3 requires a committed, valid owner issuance record binding the bundle and its recipients. A draft manifest cannot satisfy it.
- G4 additionally requires the accepted backup to name that exact issued bundle.
- G5 checks the prospective plan and source hashes, as well as its committed freeze record.
- G6 requires the declared campaign source entries; declaring only inference cannot hide missing campaign files. Protected dependencies need verified bundle issuance.
- G7 requires the committed discriminator source audit and its clean-export live-call check.

## Commands

From this lane:

```sh
node --test campaign/*.test.mjs readiness/entry-gate.test.mjs
node readiness/preregistration-freeze.mjs
node readiness/campaign-entry-gate.mjs
node audit/inference-graph-audit.mjs committed
```

The entry checker exits 2 on NO_GO. The runner refuses every scientific command unless the real seven-condition gate is GO and a separate committed owner execution record binds this preregistration. The current request to satisfy entry conditions is recorded as authorization for preparation; no backup attestation or scientific execution is inferred from it.

## Offline evidence dependency

The local manifest describes 57 required files and verifies them in place. Issuance still requires placing and verifying those files in the approved encrypted offline container, naming recipients, and producing the owner issuance record. Independent recovery still requires a restore on a different device with the four existing acceptance conditions satisfied. No external physical disk was attached when this continuation inspected the machine.

Runpod is a potential future compute host. It does not satisfy this protocol's offline recovery requirement, and this work has neither rented compute nor transmitted repository content.

The additive controls now evaluate their trees once per action, then reuse the scores across comparisons. Regression tests verify exact equality with uncached pair evaluation. `HDISC1_NONADDITIVITY_ENTRY_RECHECK.json` binds the updated inference source; the original `HDISC1_NONADDITIVITY.json` remains a historical record of the preceding source.

## Re-check of G4–G7 at `7b8c2edd` (2026-11-14)

Record: `evidence/HDISC1_G4_G7_RECHECK.json`. Nothing was issued, backed up, attested, uploaded or pushed; no gate, validator or frozen source changed.

- The real gate is unchanged: **4 of 7**, NO_GO. G5 and G7 are re-verified and pass. G3, G4 and G6 fail for the same reasons as before.
- Use the pinned runtime, `/opt/homebrew/bin/node` (v26.7.0). The default `node` on this shell is v22.22.2 and makes G3 and bundle verification report a runtime mismatch.
- A real transport clone of this branch holds 0 of the 31 protected blobs. Alone it passes G2 and G7 only. With exactly the 57 draft-manifest files copied over it, it reproduces the live tree: bundle verified, 82 of 82 tests, 4 of 7. This was a same-device rehearsal and is not an independent restore.
- Acceptance condition 2 needs all 305 SK1 `work/` files, which the backup copies. The 57-file bundle alone fails it. The independent restore must be of the backup, not of the bundle alone.
- In a deleted throwaway clone, synthetic and plainly labelled issuance and acceptance records moved the gate to 6 of 7 and then 7 of 7, and the runner still refused with `SCIENTIFIC_IMPLEMENTATION_REVIEW_REQUIRED`. The two owner acts are therefore the only missing inputs to G3, G4 and G6. No such record exists in this repository.
- The cloud cannot satisfy G3, G4 or G6 under the committed custody procedure, as storage or as compute. Changing that is an owner custody amendment, not made here.

## Independent restore: required command (D1 repair, 2026-11-14)

The restore tool judged "different device" by filesystem id only, so a restore into a disk image mounted on the source Mac itself would have passed acceptance condition 1. The pinned tools are unchanged. Run the restore on the second Mac through the machine-identity wrapper, from the `platform/game-agnostic/stage3h-hdisc1-discriminator-v1` directory of a checkout:

```sh
/opt/homebrew/bin/node custody/machine-identity.mjs restore-verify --backup <mounted backup dir> --to <new empty dir> --owner-attests-medium-detached
```

Compose the acceptance record from **this** output and keep the output file. The wrapper refuses condition 1 if the restoring Mac hashes to `custody/SOURCE_MACHINE_IDENTITY.json`, or if either identity cannot be established. The campaign gate does not yet check that the wrapper was used; see draft amendment C1, section 5. Tests: `node --test custody/machine-identity.test.mjs` (9).
