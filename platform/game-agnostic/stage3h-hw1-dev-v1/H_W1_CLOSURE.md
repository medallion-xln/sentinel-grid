# SENTINEL GRID — STAGE 3H H-W1 NEGATIVE RESULT CLOSURE

BASE EVIDENCE COMMIT: c96e68c6
AUTHORITY: R0 · MODE: negative-result adjudication, provenance audit, controlled closure
DATE: 2026-11-02

---

## PHASE 1 — VALIDATION EVIDENCE (verified read-only; experiment not repeated)

| Field | Value |
|---|---|
| Candidates evaluated | 13 of 13 |
| Candidates rejected | 13 of 13 |
| Validation classes | 300 |
| Origin families | 87 |
| Labelled member worlds | 20,419 |
| Catastrophe introductions vs S0 | 13–58 classes (best C07 at 13) |
| Catastrophe introductions vs Nexus | 29–47 classes (best C01 at 29) |
| Illegal actions | 0 |
| Reported identity violations | 0 |
| Decision runs / digest match | 2 / identical |
| Execution gates | 10 / 10 pass |
| Held-out I-6 classes generated | 0 |

**Preservation.** Candidate identities, the 13 model hashes, the population identities,
the execution records, the estimator outputs and every negative finding remain in
`evidence/I5_CANDIDATE_FREEZE.json` (sha pinned) and `evidence/I5_VALIDATION_RESULTS.json`
under commit `c96e68c6`. Not touched.

**Spent worlds.** Blocks 977–988 and their associated world identities are recorded as
spent. Screened or validated worlds must not be reused in future evaluation.

---

## PHASE 2 — IMPORT-CONTRACT EXCEPTION

The static dependency chain is real:

`public-projection.mjs → transforms.mjs → forge/kernel.js, orientation-symmetric-v1.js,
stage3g/evidence.mjs, stage3h-failure-diagnosis-v1/lib.mjs`

The five required distinctions:

1. **Static evaluator-capable reachability** — PRESENT. `transforms.mjs` is imported by the
   policy graph, and `transforms.mjs` itself statically imports `forge/kernel.js`,
   `orientation-symmetric-v1.js` (via `ORIENTATIONS`, `orientAction`, `orientWorld`),
   `scripts/stage3g/evidence.mjs` (`observableView`) and
   `stage3h-failure-diagnosis-v1/lib.mjs`. Some of these are evaluator-capable.
2. **Import-time execution** — `public-projection.mjs` line 13 imports *only* the named
   export `D4_ELEMENTS` from `transforms.mjs`. ES module evaluation of `transforms.mjs`
   executes its module body, which pulls in the transitive dependencies listed above. The
   side effect is confined to bundled-module evaluation; no world, truth, evaluator or
   comparator object is read by `public-projection.mjs`.
3. **Decision-time data flow** — `D4_ELEMENTS` is an alias for the `ORIENTATIONS` constant
   (`deepFreeze(Object.keys(CELL))`), a pure list of the 8 dihedral labels. The decision
   path (`i3-policy.mjs → i3-features.mjs` and `public-projection.mjs`) consumes only
   public-view projections; it never calls a world, truth, evaluator or comparator. The
   decision input is `projectPublic(view)` → projection.
4. **Privileged native-world or truth exposure** — none observed. No decision-path module
   references the world, truth, evaluator output or comparator output. `D4_ELEMENTS` is
   names only.
5. **Contractual flat-import compliance** — FAIL. The frozen I-3 flat-import rule (applied
   unchanged at I-5 preflight) flags the edge from `transforms.mjs`, and no committed
   evidence records a passing I-3/I-4 import gate. This closure-audit result replaces the
   flat rule for bookkeeping purposes; the edge was deliberately retained because four
   sealed evidence files pin the sha of `public-projection.mjs`.

**Verdict — `STATIC_IMPORT_CONTRACT=FAIL`.**

- Pinned hashes preserved; sealed candidates and pinned dependencies unmodified.
- The negative result is **not** re-interpreted as a PASS. No runtime truth leakage being
  observed does not cure the static-rule violation, and no candidate can be declared
  qualified under either status.
- This compliance finding is **independent of** the negative catastrophe result and of the
  execution reproducibility; all three are reported separately.

---

## PHASE 3 — UNEXPECTED WORKTREE MODIFICATIONS (read-only)

Nine files under `sgrid-lab/results/`. HEAD/worktree blobs and mtimes:

| Path | HEAD blob | Worktree blob | mtime (local) |
|---|---|---|---|
| CAPABILITY_BASELINE_v1.md | 84b84694 | ca8de813 | 2026-11-02T14:25:47 |
| baseline.json | 50a87372 | 395570c9 | 2026-11-02T14:24:19 |
| capability-baseline.json | 76b34b26 | d4e01d2b | 2026-11-02T14:25:47 |
| ladder-C0.json | 4fd6c959 | 544d4381 | 2026-11-02T14:24:19 |
| ladder-C1.json | ae1e9559 | 93d1881c | 2026-11-02T14:24:19 |
| ladder-C2.json | 016498d0 | e0421380 | 2026-11-02T14:24:21 |
| ladder-C3.json | fc397372 | e84425ab | 2026-11-02T14:24:49 |
| ladder-C4.json | 5bdcd796 | ca30bd15 | 2026-11-02T14:25:18 |
| ladder-C5.json | 75dbf33e | 9ae31258 | 2026-11-02T14:25:47 |

**Diff classification.** All nine are deterministic metric/timing/provenance refreshes, not
source or model changes:

- `baseline.json`: `frozenAt` timestamp bumped 2026-07-20 → 2026-11-02, plus one new module
  hash `azl-federated.js`.
- `capability-baseline.json`: `generatedAt` bumped, per-decision latency values updated
  (C2 0.9→0.5, C3 10.3→6.5, C4 10.9→6.9, C5 11→6.9), `cloneStepMicros`/`forwardModelPerf`
  2.33us → 0.71us.
- `CAPABILITY_BASELINE_v1.md`: the same latency table and conformance values text-refreshed.
- `ladder-C0..C5.json`: per-decision `msPerDecision` values refreshed en masse (e.g. 0.08→0.02
  etc.), keeping the per-run score/terminal/ticks/segment fields intact.

Latency/`generatedAt`/`frozenAt`/module-hash updates are consistent with a benchmark/metric
re-run, not with a code or model edit. No `sgrid-lab/results` path is referenced by any
H-W1 evidence file, the freeze, the driver, or the decision path, so none of the registered
evaluation evidence depends on these files.

**Attribution.** No author is identifiable from the content. Timestamps in these files
predate the I-5 execution (whose commit is 2026-11-02T15:42:27 local) and do not prove
authorship. A known test/build process (`sgrid-lab/tests/*`) exists that writes
`sgrid-lab/results`, but no evidence ties *this* modification to a recorded run in this
session.

**Verdict — `WORKTREE_DRIFT_ATTRIBUTION=UNATTRIBUTED_WORKTREE_DRIFT`.** The repository is not
treated as clean. Files not overwritten, reverted, staged, committed, or deleted.

---

## PHASE 4 — SCIENTIFIC ADJUDICATION

- **(A)** The H-W1 V1 candidate family (public-only full-menu linear policies) **failed
  safety qualification** on fresh exclusion-aware validation data. This is the primary
  finding.
- **(B)** Its mean-regret improvement **remains positive** against both comparators
  (class-level delta vs S0 −0.11 to −0.23, vs Nexus −0.15 to −0.27, upper 95% < 0). This is
  a genuine within-family property but does not constitute qualification and is not treated
  as one.
- **(C)** Reproducible execution (2 independent runs, identical digests, 10/10 gates) does
  **not cure** the static import-contract exception, which stands as `FAIL`.
- **(D)** The two-arm impossibility theorem remains limited to the **admissible
  native-state domain**; it is not generalized here.
- **(E)** The full-menu offline oracle demonstrated safe alternatives **only within tested
  classes**; it is not evidence of broader safety.
- **(F)** The failure of 13 policies does **not** prove universal public-only impossibility;
  the negative finding is scoped to this evaluated population and policy family.

**Close-the-approach judgment.** Both the exploration population (1000 classes) and the
independent validation population (300 classes) produced overlapping introduction rates, and
the exploration result traced the cause to the hidden-state sensitivity of every populated
action type. Within that supported scope the evidence supports closing this exact modeling
approach. It does not support the stronger claim of universal public-only impossibility.

---

## PHASE 5 — NEXT RESEARCH DECISION

The evidence is not strong enough to self-authorize a new program. If the owner wishes to
decide on further work, the candidate directions and their prerequisites are:

- **Different policy mechanism** over the same public projection — would require explaining
  how the new mechanism resolves the hidden-state-sensitivity finding, not just re-scoring.
- **Additional lawful public observability** — requires an explicitly *changed* information
  contract (an inference-dependency boundary beyond the current public projection).
- **Explicitly changed information contract** — same: a new policy identity and boundary.

None is approved. Any future hypothesis requires a new policy identity, a corrected inference
dependency boundary, fresh exclusions, prospective evaluation rules, and separate owner
authorization. Spent validation data must not be used for candidate selection, and zero
introductions is not relaxed.

---

## PHASE 6 — EVIDENCE CLOSURE

Final scientific classification: **negative**, within the supported scope.

- Existing local commit `c96e68c6` and all pinned evidence are preserved.
- The nine unattributed modified files are **excluded** from any closure commit.
- This report is the only new artifact; it contains no protected source content and does not
  modify the sealed candidates or pinned dependencies.
- No push, no history purge, no re-run of V4 or H-W1 validation.

---

## REQUIRED RESULT

```
=== SENTINEL GRID STAGE 3H H-W1 CLOSURE ===

STATUS=CLOSED
CLASSIFICATION=H_W1_DEV_VALIDATION_NOT_QUALIFIED

CANDIDATES_EVALUATED=13
CANDIDATES_QUALIFIED=0

VALIDATION_CLASSES=300
VALIDATION_ORIGIN_FAMILIES=87
VALIDATION_WORLDS=20419

SAFETY_VS_S0=FAIL
SAFETY_VS_NEXUS=FAIL
REGRET_VS_S0=POSITIVE (mean delta -0.11 to -0.23, upper95 < 0)
REGRET_VS_NEXUS=POSITIVE (mean delta -0.15 to -0.27, upper95 < 0)

EXECUTION_REPRODUCIBILITY=PASS (2 runs, identical digest, 10/10 gates)
STATIC_IMPORT_CONTRACT=FAIL
PRIVILEGED_INFERENCE_LEAKAGE_EVIDENCE=NONE_OBSERVED

UNEXPECTED_MODIFIED_FILES=9
WORKTREE_DRIFT_ATTRIBUTION=UNATTRIBUTED_WORKTREE_DRIFT
UNRELATED_FILES_PRESERVED=TRUE

SPENT_WORLD_EXCLUSIONS=BLOCKS_977_988_SPENT
V4_NEGATIVE_VERDICT_FINAL=true
TWO_ARM_THEOREM_DOMAIN=ADMISSIBLE_NATIVE_STATES_ONLY

H_W1_V1_CLOSED=true
FULL_MENU_PUBLIC_ONLY_IMPOSSIBILITY_PROVEN=false

I6_AUTHORIZED=false
I6_EXECUTED=false

NEW_POLICY_IMPLEMENTED=false
NEW_VALIDATION_EXECUTED=false
NEW_SEALED_REGISTRATION=false

REMOTE_PUSH=false
A5_AUTHORIZED=false

FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

NEXT_EXACT_SCIENTIFIC_DECISION=none_authorized_awaiting_owner_hypothesis
```
