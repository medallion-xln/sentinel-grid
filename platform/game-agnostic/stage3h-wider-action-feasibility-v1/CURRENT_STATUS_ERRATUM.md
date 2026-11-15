# Current status and erratum for the 2026-10-22 wider-action report

Authority R0. Recorded 2026-10-30, before the two evidence lanes were committed to local `main`.

The dated reports are preserved byte-for-byte and are not edited. This document is the current status. Where it differs
from a dated report on custody or commit state, **this document governs**. The scientific content of the dated report
(the 341-class DEV feasibility result, the exclusion integrity record, the key collisions) is not affected by anything
below and is not restated here.

## Superseded statements

| Dated document | Statement as written (2026-10-22) | Current status (2026-10-30) |
|---|---|---|
| `RESULT.md`, intro and `STATUS` | "This lane and the custody audit are NOT committed"; "nothing committed" | Both lanes are committed locally as separate evidence commits (see the Phase 0 record). Not pushed. |
| `RESULT.md`, `PROTECTED_SOURCE_CUSTODY_STATUS` | `BREACHED_LOCAL_UNRESOLVED` (30 files tracked since `8749fd44`; remediation R1 proposed, nothing executed) | Resolved locally. A2 to A4b were executed and verified: local `main` is `2d26176ae55f59009796c546fd42f2635e7da5bb` and has **0** protected blobs reachable (`../stage3h-custody-audit-v1/evidence/A4B_AUDIT_MAIN_FINAL.json`, re-confirmed in `STAGE3H_CLOSURE_AUDIT.json`). |
| `RESULT.md`, `TRACKED_PROTECTED_SOURCE_COUNT` | 30, in `8749fd44`, `e9b77ae0`, `ac9daeb5` (= HEAD) | 0 tracked on `main`. `ac9daeb5` is the pre-remediation tip, kept as `refs/custody/pre-remediation-main` (30 blobs, positive control). HEAD is no longer `ac9daeb5`. |
| `RESULT.md`, `REMOTE_EXPOSURE_STATUS` | "main 41 commits ahead and unpushed" | Unchanged in substance: `origin/main` is still `e7fe50fd` and `main` is still 41 commits ahead of it (this was checked on 2026-10-30 before the evidence commits). Nothing has been pushed. Remote reachability of GitHub is still unconfirmed. |
| `RESULT.md`, `BACKUP_VERIFIED` | `PARTIAL`, "NO repository backup" | A same-disk local backup exists (A1 local backup, `INDEPENDENT_BACKUP=false`). It is **not** independent: a disk failure loses the repository, the recovery refs and the backup together. |
| `RESULT.md`, `HISTORY_REMEDIATION_REQUIRED` and `REMEDIATION_APPROVAL_REQUIRED` | `true` | Done and accepted by the owner as locally complete (`CUSTODY_A4B=ACCEPTED_AS_LOCALLY_COMPLETE`). History was rewritten locally only. |
| `RESULT.md`, `NEXT_EXACT_OWNER_DECISION` | decide R1 gates A0 and A1, then A2 to A4, before any further commit | Superseded. A0 to A4b are done. The owner has since authorised H-W1 phases I-0 to I-5 as a bounded DEV study. |
| `../stage3h-custody-audit-v1/REMEDIATION_PROPOSAL.md`, "Effect on research" | "custody remains **unresolved**"; no research lane committed on the affected history; both lanes left uncommitted | Superseded for the same reason. The lanes were committed on the remediated history. |

Other statements in the dated reports that name `ac9daeb5` (for example "safety lane unchanged since `ac9daeb5`") are
historically accurate: that commit was the HEAD at the time and the safety lane files are unchanged since.

## What has not changed

- Git custody is closed **locally** only. The 30 protected blobs remain in the object store, reachable from the retained
  recovery refs and from the Codex checkpoint ref. Publishing all refs is prohibited and no push is authorised. A5
  (purge) is deferred and not authorised. `pre-push` refuses unconditionally; every local hook is bypassable.
- The 31 overlay files stay on disk, untracked and excluded. The two lanes were content-audited before being staged
  (`../stage3h-custody-audit-v1/evidence/LANE_CONTENT_AUDIT.json`): no protected blob id, sha256, path alias, embedded
  source, archive, secret pattern or unrelated generated data. The 10 `work/` shards in this lane are ignored and are not
  committed.
- The R0 runtime-identity drift is a separate open finding. It was not measured, changed or closed here.
  Full Stage 3H runtime certification was not executed (`FULL_STAGE3H_CERTIFIED=false`).
- V4 remains `BOUNDED_SELECTOR_NOT_QUALIFIED` (`V4_NEGATIVE_VERDICT_FINAL=true`). The nine-expert roster is unchanged.
  Stage 3I has not started. Nothing can dispatch or mutate a live world.
- The 341 classes are spent, privileged, offline evidence and fixtures only. They are not new independent evidence
  for any policy. The `FRESH_EXPLORE` (block 951) and `FRESH_CHECK` (block 952) labels are legacy: all of those worlds
  are spent and excluded.
- `H_W1_CONTRACT.json` (sha256 `d1e903d3655b3f06c0fbe8a6305202e138536d7b9e910d76d68c735fd1b83d2e`) governs over
  `H_W1_CONTRACT.md` if they differ. The held-out population is not generated and I-6 is not authorised.
