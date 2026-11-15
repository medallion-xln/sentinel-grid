# H-W4 / H-W4B engineering-risk register (additive; no source modified)

AUTHORITY: R0 · BASE HEAD: `9175a5558eff2de537a610af7c1d4da15e9cc1c4` · written for H-W4B-CLOSE Phase 3

This register records defects found while preparing and stopping H-W4B. Nothing here was repaired. Line references
are to the files as they stand in the working tree at the base head; `hw4-*.mjs` files are committed, `hw4b-*.mjs`
files are untracked and are not part of the closure commit.

**Reading rule.** "Historical impact" answers one question only: can the defect change a number or verdict that an
earlier stage reported? Where the answer is no, the entry says what the supporting evidence is. No entry declares
H-W4 invalid. The H-W4 result stands exactly as reported: classification C, 600 classes, 32 introductions against S0
and 65 against Nexus-else-S0 in both arms, 0 decision differences between arms, Δnreg −0.2247 (one-sided 95% upper
−0.1990) against S0 and −0.2449 (−0.2164) against Nexus-else-S0, 0 illegal actions, 0 identity violations.

## Summary

| id | issue | executed? | historical results changed? | clean-checkout reproduction |
|---|---|---|---|---|
| ER-01 | identity audit never produces band V2 for the V2 arm | yes, in H-W4 | no; one audit claim narrowed | defect readable at HEAD; dynamic repro needs local privileged data |
| ER-02 | V1/V2 C11 tau mismatch (0.02 vs 0.2) | training only | no | yes (committed models and records) |
| ER-03 | static import boundary passes only with an uncommitted cut | yes | no number changed; a PASS claim is working-tree-only | PASS: no. FAIL: yes |
| ER-04 | P2R scratch data missing; G8 round-trip cannot re-run | yes, in H-W4 | no; the G8 claim is now unverifiable | no |
| ER-05 | band-ablation diagnostic compares against the wrong arm | no | no | n/a (untracked file) |
| ER-06 | introduction action-type histogram mislabelled | yes, in H-W4 | yes, one reported field; corrected by erratum | defect readable at HEAD |
| ER-07 | audit manifest omits REPAIR; Table A uses a different base predicate | yes | summaries only; CSV correct | defect readable at HEAD |
| ER-08 | no paired introduction-rate endpoint; rule B needs no statistical support | no | no | n/a |
| ER-09 | Phase 2 sensitivity script tested unreachable states | yes, 2026-11-04 | led to 10 blocks being screened | n/a (untracked file) |
| ER-10 | contract text says V0 is "≤ 2"; code is `< 2` | n/a | no | yes |
| ER-11 | exclusion custody for blocks 901–914 is recorded but not enforced | n/a | no | partly |
| ER-12 | class ids of the form `population:block:k` encode the seed | n/a | no | yes |
| ER-13 | lane `.gitignore` is untracked; runtime version differs from the shell default | n/a | no | n/a |

## ER-01 — Identity audit never produces band V2 for the V2 arm

- **Source and function.** `auditShard` in `hw4b-validate.mjs:104` and in the committed `hw4-validate.mjs:106` calls
  `auditClassHw4(c, comboFor(c.block, c.k), policies, c.valueSpread)` with `c` taken from the population manifest.
  Manifest class entries are written by `hw4b-freeze.mjs:44` / `hw4-freeze.mjs:52` and carry no `valueSpread` field.
  `valueBandFn` (`hw4-contract-v2.mjs:18-20`) then computes `hi = undefined + 3 = NaN`, so `v >= hi` is always false
  and every non-objective node is banded V1. `auditClassHw4` consumes that value at `hw4-audit-class.mjs:76` and `:81`.
- **Trigger.** Every `audit` invocation. It is unconditional.
- **Scope.** The H-W4 Phase 7 identity audit, V2 arm (600 classes, 13,800 twins, 28,800 decisions). It would have
  applied to the H-W4B audit, which never ran.
- **Historical impact: results not changed; one claim narrowed.** Evidence:
  - Both audited C10 models use 70 feature columns with highest index 69; neither uses any band column (index ≥ 130).
    A band-free model returns the same decision for any band, so the audit outcome cannot depend on the wrong band.
  - The two arms' recorded decisions are identical in 600/600 classes, the band-ablation diagnostic is 0/600, and
    identity violations are 0 in both arms.
  - The decision and metric path (`run` → `decideAllClasses`, `hw4-validate.mjs:135`) reads the stored
    `projectionBanded`, which was built with the true spread (`hw4-build-class.mjs:33`). The 32 / 65 counts and the
    regret figures do not pass through the audit.
  - What is narrowed: the H-W4 audit did not exercise the V2 contract with real V2 bands. The gate
    `FEATURES_INVARIANT_UNDER_D4` was satisfied for the V2 arm on V1/P bands only. `V2_BAND_KEY_D4_INVARIANT` used
    stored projections and is unaffected.
- **Re-audit needed?** Only before trusting an identity audit of a band-consuming candidate. Not for C10.
- **Minimal prospective repair.** Pass each class's true spread (from the schedule entry's generator configuration, or
  carried into the manifest) and make `valueBandFn` throw on a non-finite spread so the adapter fails closed.
- **Clean checkout.** The defect is readable at HEAD. Running the audit needs the uncommitted population manifest and
  the gitignored class records, so it cannot be reproduced from a clean checkout alone.

## ER-02 — V1/V2 C11 tau mismatch

- **Source and function.** `tuneRule` (`stage3h-hw1-dev-v1/i4-candidates.mjs:33`) chooses the SAFE_FIRST threshold on
  out-of-fold decisions; `hw4-train.mjs:77` calls it separately for each arm. Result: `score.tau` is 0.02 in
  `models/V1_PUBLIC_ONLY_C11_FULL_SAFE_FIRST.json` (`749d1d5f…09c56b`) and 0.2 in
  `models/V2_PUBLIC_PLUS_VALUE_BAND_C11_FULL_SAFE_FIRST.json` (`77136f46…23f03fc`).
- **Trigger.** Any rule hyper-parameter tuned per arm on arm-specific out-of-fold decisions.
- **Scope.** Of the 13 candidate pairs, C11 is the only one whose hyper-parameters differ between arms. The other 12
  match (C10: tau 0.2 in both arms).
- **Historical impact: none on H-W4.** The selected C10 pair has the same tau and identical decisions. The only
  affected statement is the H_W4.md §7 hint "C11: 55 vs 61", which compares different taus. From the frozen tuning
  tables, the matched-tau out-of-fold counts against S0 are 55 vs 58 (tau 0.2) and 59 vs 61 (tau 0.02), of 1,000.
- **Consequence for H-W4B.** The frozen C11 pair is **not a controlled band-only contrast**. A V1/V2 difference would
  mix the band, the threshold and the refit weights. No matched-tau contrast was established.
- **Minimal prospective repair.** Fix shared hyper-parameters across arms by rule before training, or prespecify the
  cross-evaluation (each arm at the other's tau) and a band-ablated V2 as controls.
- **Clean checkout.** Yes. Both models and both exploration records are committed at `9175a555`.

## ER-03 — Static import boundary passes only with an uncommitted working-tree cut

- **Source and function.** At committed HEAD, `stage3h-hw1-dev-v1/public-projection.mjs:13` is
  `import { D4_ELEMENTS } from './transforms.mjs';`. The working tree replaces it with the definition-site constant
  (`:12` and `:14`). The gates that read the closure are `hw4-gates.mjs` G1 and `importAudit`
  (`hw4-validate.mjs:63`, `hw4b-validate.mjs:61`, `hw4b-lib.mjs`).
- **Trigger.** Evaluating the boundary on the committed tree.
- **Measured status.**

  | tree | `public-projection.mjs` sha256 | closure | violations of the frozen H-W4 rule |
  |---|---|---|---|
  | working tree (uncommitted cut) | `c4f9532e0771e025513122052128b0d14185e4abcde3ace9de9de5d77db6c099` | 10 files | 0 — **PASS** |
  | committed HEAD `9175a555` | `2d1e70611b26005179cc50e21a9d6ec5eae59704d7db36e722bb28b53eacb9ca` | 76 files | 40 — **FAIL** |

  A passing working-tree gate is not a passing gate at committed HEAD, and no record should say otherwise.
- **Scope.** H-W1 (recorded `STATIC_IMPORT_CONTRACT=FAIL` at closure), H-W4 (recorded pass, with the note that the cut
  is uncommitted), H-W4B Phase 1.
- **Historical impact: no number changed; the PASS claim is working-tree-only.** Evidence:
  - The cut is identity-preserving by definition: `transforms.mjs:14` is `export const D4_ELEMENTS = ORIENTATIONS`.
  - With the cut, the same runtime reproduces the frozen H-W4 C10 decisions 600/600 in both arms.
  - `HW4_CANDIDATE_FREEZE.json` and both exploration records pin `c4f9532e…`, a revision that exists in no commit.
    A clean checkout of `9175a555` therefore fails the freeze hash check and the boundary gate.
- **Minimal prospective repair.** An owner decision on the existing import-cut proposal: either commit the cut and
  re-record the boundary at a commit, or keep the tree as committed and record the boundary as FAIL.
- **Clean checkout.** The PASS cannot be reproduced. The FAIL can. The evaluated revision is recoverable from HEAD plus
  the five-line diff embedded in `evidence/HW4B_RECOVERY_MANIFEST.json` (diff sha256 `93c0b22f…edc3653`).

## ER-04 — Missing P2R scratch evidence prevents the G8 round-trip re-execution

- **Source and function.** `hw4-gates.mjs:123-137` reads the gitignored
  `stage3h-hw1-dev-v1/p2r-scratch/data/hw4_reconcile.json` and needs a reconstructed world with `specFlat` and
  `bandKey`. The file present today (7.4 MB, modified 2026-11-03T14:10Z) stores `{kind, bandKey, truth}` per world
  and no `specFlat`, so the gate reports `no reconstructed world with specFlat+bandKey found`.
- **Trigger.** Re-running the gates after the scratch dataset was rewritten.
- **Scope.** H-W4 Phase 3 gate G8 only. The other 12 gates re-pass.
- **Historical impact: results not changed; the G8 claim is unverifiable, not refuted.** Evidence:
  - The adapter source is hash-identical (`94fe0b51…a344de`) to the revision used in H-W4.
  - The H-W4 counts come from band-free C10 models (ER-01), so they do not depend on band fidelity.
  - Two limits on the original claim: the figure "1,023/1,023" appears only as narrative in `H_W4.md:50`, with no
    committed evidence record; and the committed gate code checks the first matching world, not 1,023.
- **Minimal prospective repair.** Regenerate the reconstruction keeping native world specifications under gitignore,
  and record the round-trip result as an evidence file with counts and hashes.
- **Clean checkout.** No. The input is gitignored by design.

## ER-05 — Band-ablation diagnostic compares against the wrong arm (H-W4B copy only)

- **Source.** `hw4b-validate.mjs:157` counts ablated-V2 decisions that differ from **V1** (`dec1[v1Idx]`). The
  committed `hw4-validate.mjs:158` compares against `dec1[1]`, the V2 arm, which is correct.
- **Scope and impact.** Never executed. H-W4's "0/600" used the correct comparison.
- **Repair.** Compare the ablated V2 model with V2's own decisions.

## ER-06 — Introduction action-type histogram is mislabelled

- **Source.** `hw4-validate.mjs:165` and `hw4b-validate.mjs:164` index the first six one-hot feature columns with a
  hard-coded list (MOVE, PROTECT, RESTORE, RETREAT, BYPASS, REPAIR). The columns are alphabetical (ATTACK, BUILD,
  BYPASS, COLLECT, MOVE, PROTECT), and the count runs over the union of failing classes.
- **Historical impact: yes, one reported field.** `introducedActionTypes` in `HW4_VALIDATION_RESULTS.json` reads
  {BYPASS 47, UNKNOWN 32, RESTORE 4}; the true types are MOVE 47, BYPASS 4, RETREAT 17, RESTORE 10, REPAIR 5.
  The frozen file is not edited; `evidence/HW4_INTRODUCTION_AUDIT_ERRATUM_1` supersedes it for action-family counts.
  The 32 / 65 counts are unaffected.
- **Repair.** Read the action type from the public menu entry.

## ER-07 — Audit manifest omits REPAIR; audit Table A uses a different base predicate

- **Source.** `evidence/hw4-introduction-audit.mjs:184` writes per-type counts for five types and omits REPAIR; `:90`
  labels Table A rows by "chosen action catastrophic on the base world" while the base counts use "introduction on
  the base world".
- **Historical impact.** Summaries only. The manifest's S0 subtotals sum to 27 instead of 32 (REPAIR 5 missing); one
  Table A row (HW4-VAL-486) carries a label under the other predicate. The class CSV is correct and authoritative.

## ER-08 — No paired introduction-rate endpoint; classification rule B needs no statistical support

- **Source.** `hw4b-validate.mjs:178` and `classificationRule.B` in `evidence/HW4B_PROTOCOL_FREEZE.json` ("strictly
  fewer classes in total"). The runner computes regret intervals but no paired introduction-rate difference with
  origin-family-clustered intervals, which were the directive's primary endpoints.
- **Scope and impact.** Never executed; no historical result.
- **Repair.** Prespecify the paired difference against each comparator with clustered intervals, and require support
  for a "safety improved" label.

## ER-09 — Phase 2 sensitivity script tested unreachable states

- **Source.** `hw4b-repro-band.mjs:107` uses values {0, 1, 2, 3, 5, 8, 9, 12} and `:109` toggles the objective off
  while the public flags stay fixed. Values 0 and 1 (band V0) never occur natively, and every native world has an
  objective whose band P equals the public objective flag.
- **Historical impact.** That script's "decision sensitive" output preceded the 2026-11-04 allocation and screening.
  Blocks 901–910 were spent on that basis. On its grid, 9 band configurations change the selection and all 9 have the
  objective removed; with the objective present there are none.
- **Repair.** Restrict any sensitivity test to the generator's range and hold the public projection fixed.

## ER-10 — Contract text and schema string disagree with the code on V0

- **Source.** `hw4-contract-v2.mjs:3` and `:11` describe V0 as "≤ 2"; `:20` implements `v < 2`.
- **Impact.** None numerically: band V0 occurs in 0 of 14,270 structural nodes of the training projections. The code
  is what was trained. A correction belongs in a successor contract id, not in the frozen file.

## ER-11 — Exclusion custody for blocks 901–914 is recorded but not yet enforced

Verified against the ledgers in `evidence/HW4B_BLOCK_SPEND_LEDGER.json`:

- The strict structured exclusion index lists none of blocks 901–914 and none of the 885 admitted identities.
- No allocator's forbidden list contains them. By lane convention each successor allocator hard-codes its
  predecessors' blocks, so enforcement begins only when a future allocator forbids 901–914 and loads
  `evidence/HW4B_REGISTRY_SCREENED.json`.
- Identities were retained for the 885 admitted entries only. The other screened worlds (63,840 in total) are
  protected only while the whole block stays forbidden.
- Seeds and world hashes exist only in gitignored `work4b/`. No independent backup of this repository exists
  (custody gate A1 remains blocked).

## ER-12 — Class ids of the form `population:block:k` encode the seed

`seed = block × 10⁹ + k` holds for 600/600 H-W4 validation classes and for every H-W4B pool entry. Committed H-W1 and
H-W4 registries, the H-W4 introduction CSV and the audit tables use such ids. This does not affect any result; these
are spent DEV populations. It does mean the audit header's statement that the outputs expose no seeds is inexact.
History is not rewritten. Prospectively, registries should use opaque aliases, as `HW4B_REGISTRY_SCREENED.json` does.

## ER-13 — Local-only protections

- The lane `.gitignore` (which keeps `work/`, `work4b/` and scratch data out of the index) is itself untracked.
- The evidence was produced with node v26.7.0 (`/opt/homebrew/bin/node`); the shell default is v22.22.2. Frozen
  records pin the version; scripts do not check it.
