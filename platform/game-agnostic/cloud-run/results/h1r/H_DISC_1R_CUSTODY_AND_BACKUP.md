# H-DISC-1R — Custody bundle and independent backup (Phases 3–4)

**STATUS: NOT_EXECUTED. BUNDLE_ISSUED=false. BACKUP_VERIFIED=false. G4=BLOCKED_OWNER_RESOURCE.**

No custody file, protected source or drive is reachable from this session. Nothing was issued, backed up, restored or attested, and no synthetic custody record was made.

## Phase 3 — bundle preparation

| Requirement | State | Evidence |
|---|---|---|
| 57-file inventory: 31 protected sources, 19 data files, 7 custody controls | last verified in place on the Mac (57/57); **not re-verified** | `HDISC1_G4_G7_RECHECK.json` |
| Every required source hash | 151 of 180 frozen hashes match in the snapshot; the 29 protected files can only be checked on the Mac | computed here |
| Named recipients | **not recorded anywhere in the repository**: owner decision | — |
| Approved encrypted offline storage | **none found** at the last check (no external disk, no Time Machine) | recheck record |
| Issuance workflow | fully specified in `G1_G7_CLOSEOUT_PLAN.md` §2, G3 | plan |

### Tooling gap

There is no command to compose the issuance record. `composeIssuance` is exported but has no CLI, so the owner has to call it from a short script. Adding a CLI would change frozen source, which needs a prospective amendment.

### Mac commands to re-verify

Run from `stage3h-hdisc1-discriminator-v1`:

```sh
/opt/homebrew/bin/node readiness/evidence-bundle-manifest.mjs verify
```

Expect 57 entries present and matching, with the result `HDISC1_BUNDLE_DRAFT_VERIFY_PASS`.

## Phase 4 — independent backup

| Resource | State |
|---|---|
| Encrypted external drive with ≥ 3.05 GiB free | not present at the last check |
| Second Apple Silicon Mac with Node v26.7.0 | unknown; not recorded |
| Owner access to the custody materials on that Mac | unknown |

The procedure itself is unchanged:
- run `backup.mjs run` (whose scope includes all 305 SK1 `work/` files);
- detach the medium;
- run `custody/machine-identity.mjs restore-verify --owner-attests-medium-detached` on the second Mac;
- then `acceptance-record.mjs compose --bundle-manifest <issued manifest>`.

The 57-file bundle alone fails acceptance condition 2. The restore must be of the backup.

### Known limit

The gate does not check that the machine-identity wrapper was used (defect D1). Using it is a procedural requirement. Enforcing it in the gate would tighten the check, and needs a prospective amendment.
