# H-DISC-1R — Mac baseline (Phase 0)

**STATUS: NOT_EXECUTED — the owner's Mac was not reachable from this session.**

This run was made in a Claude Code cloud session. The session has no shared computer folder (`list_computer_folders` returned none, twice), so no command ran on the Mac. Nothing below is a Mac observation.

## What is known, and from where

| Item | Value | Source | Mac-verified |
|---|---|---|---|
| Last recorded Mac recheck | HEAD `7b8c2edd5e8f`, branch `codex/stage3h-entry-conditions`, gate 4 of 7 | `stage3h-hdisc1-discriminator-v1/evidence/HDISC1_G4_G7_RECHECK.json` | recorded 2026-11-15 05:58 UTC; not re-verified |
| Cloud snapshot | `7512aab2` on `claude/stage3h-cloud-snapshot`, described in its commit message as a "curated snapshot of 4925dcb6" | git log in this checkout | no |
| Custody override records written after the recheck | `custody/OWNER_CUSTODY_OVERRIDE_2026-11-14*.json` (06:35 and 06:39 UTC) | snapshot | no |
| Frozen source in the snapshot | 151 of 180 bound source hashes match byte for byte; 29 (the protected files) are absent | computed here against `protocol/HDISC1_FROZEN_PREREGISTRATION.json` | no |

The snapshot carries records written after the recheck, so the Mac's HEAD has moved past `7b8c2edd` at least once. Only the Mac can say by how much.

## Phase 0 commands for the Mac

Run these from the repository root:

```sh
git rev-parse HEAD
git branch --show-current
git status --short
git log -10 --oneline
git log --oneline 7b8c2edd..HEAD
git diff --stat 7b8c2edd HEAD
git cat-file -t 4925dcb6
```

The last command tells you whether the snapshot's source commit exists locally.

## Reconciliation rule

The cloud snapshot is **not** source of truth: its commit ids differ from the real history. The real freeze commit is `aa170d67`; in the cloud run, the gate read the freeze commit as `7512aab2`. Nothing from the cloud branch may be merged, cherry-picked or rebased into the Mac history.
