# H-DISC-1R — Scientific implementation review (Phase 5)

**STATUS: PRELIMINARY — code review from the cloud snapshot; not Mac-verified. Verdict: NOT_ACCEPTED (reporting incomplete; one decision-rule gap).**

## Scope and basis

- **Files reviewed:**
  - `campaign/evaluate.mjs` (sha256 `3ceee117…`), `campaign/analysis.mjs` (`26015ebc…`), `campaign/runner.mjs` (`40a8088b…`) and `campaign/train.mjs` (`209fb278…`);
  - `protocol/ablation-contract.mjs`;
  - the protocol record `protocol/HDISC1_PROTOCOL.json` and `H_DISC_1_PREREGISTRATION_READY.md` §§4–13.
- **These are the frozen versions.** All 151 committed files bound by `protocol/HDISC1_FROZEN_PREREGISTRATION.json` match byte for byte in the snapshot. The 29 protected files could not be read here.
- **Nothing was run natively.** `evaluate.mjs`, `analysis.mjs` and `train.mjs` import `stage3h-canonical-v1/adapters.mjs` (a protected file) through `hw1-eval.mjs` and `failure-diagnosis/lib.mjs`, so they cannot load without the overlay.

Labels used below: IMPLEMENTED · TESTED_SYNTHETICALLY · NOT_IMPLEMENTED · NOT_TESTED_NATIVELY · REQUIRES_PROTOCOL_AMENDMENT.

## Requirement-by-requirement

| # | Requirement | Status | Where / why |
|---|---|---|---|
| 1 | Primary endpoint: unique comparator-relative introduction classes, F vs D, exact one-sided sign test **and** clustered upper bound < 0 | IMPLEMENTED · TESTED_SYNTHETICALLY · NOT_TESTED_NATIVELY | `evaluate.mjs`: `unsafe=introB‖introN`, `paired(F,D)`. `analysis.mjs`: `paired()` sets `reject = p ≤ .05 && delta.upper95 < 0`. `analysis.test.mjs` covers the sign test, agreement and the one-family case. |
| 2 | Both absolute catastrophe-introduction gates (vs S0 and vs Nexus-else-S0 = 0) | IMPLEMENTED · NOT_TESTED_NATIVELY | `gates.zeroIntroductionsVsS0`, `gates.zeroIntroductionsVsNexus` |
| 3 | Complete decision coverage | IMPLEMENTED | `fullCoverage: abstentions===0`, and A/B/C/D/F/ladder sets must all be legal (`usable`) |
| 4 | Normalised-regret gates vs S0 and vs Nexus (≥ 0.02 improvement, clustered one-sided bound < 0) | IMPLEMENTED · NOT_TESTED_NATIVELY | `regret.vsS0/vsNexus` from `interval()`; gate `point ≤ -0.02 && upper95 < 0` |
| 4b | Regret family: F vs C, and non-inferiority of F to D within 0.02 (Holm) | **NOT_IMPLEMENTED** | No F-vs-C or F-vs-D regret test exists in `evaluate.mjs` |
| 5 | Family-clustered uncertainty | IMPLEMENTED · TESTED_SYNTHETICALLY | `interval()`: origin-family cluster bootstrap, inherited generator, 10,000 resamples |
| 6 | Native action legality | IMPLEMENTED · NOT_TESTED_NATIVELY | Index-range and duplicate checks per arm; `evalClass` marks illegal sets; audit `legality.illegal===0` |
| 7 | Identity and D4 invariance | IMPLEMENTED · NOT_TESTED_NATIVELY | `invariance` requires RELABEL/MENU/D4/HIDDEN audits with n > 0 and 0 bad, 8 feature frames, poison and repeat checks, and every negative control detected, on all 900 classes (`auditClass` from SK1 infra) |
| 8 | Deterministic replay | IMPLEMENTED | Each class is called twice; `check` mode recomputes the digest and rows and refuses on mismatch |
| 9 | Inference compute limits (median ≤ 100 ms, max ≤ 1000 ms) | IMPLEMENTED | Timed on arm F only, the arm Contract A applies to. Other arms are not timed, although the protocol's arm conditions mention "same compute accounting"; that is a minor reporting gap. |
| 10 | Complete preregistered secondary metrics | **NOT_IMPLEMENTED (partial)** | Comparator-specific family present (introB, introN, catAny; Holm). Missing: the regret family (4b), the pairwise-ordering family, per-arm counts and rates for **every** arm (rows hold the data; no aggregate), arm E abstention counts, and the descriptive tables (by origin family, rescue and harm, cycles and withheld pairs, twin sensitivity) |
| 11 | Matched M2-vs-M3a ablation (mechanism qualification) | **NOT_IMPLEMENTED** in the evaluator | Ladder top sets are computed and evaluated per class. But no contrast test is run, `assertMatchedContrast` and `attributionOutcome` (in `protocol/ablation-contract.mjs`) are never called, and no `H_DISC_MECHANISM_*` label is produced. `train.mjs` records `mechanismNonVacuous` (STOP_VACUOUS_PAIR_MODEL input), but nothing consumes it. |
| 12 | Within-menu pairwise discrimination (correctly ordered safe/unsafe pairs; worst-case ordering failures; pairwise consistency and cycles) | **NOT_IMPLEMENTED** | Needs labels for every action and the full F comparison records. `rows` store only top-set outcomes and the decision hash. |
| 13 | Source and model provenance | IMPLEMENTED | The training binding (source hash, population digest, exclusion-registry hash, preregistration hash), the experiment freeze (declaration, training, populations, inherited models, inference source hash) and `decisionDigest` are all checked before `audit`, `run` and `check` |
| 14 | Explicit negative-result reporting | **PARTIAL** | `H_DISC_NO_SUPPORTED_ADVANTAGE` is produced; `STOP_DEVELOPMENT` is implemented (`development-stop.json`). **Missing:** the power re-estimate on exploration that the negative-result rules need to separate a *well-powered null* from an *inconclusive* one. The development rule "re-estimate baseline rate, design effect and association out of fold and report them before validation" is not implemented. |
| 15 | Stop rules: entry gate, supply, development, execution validity, no interim look | IMPLEMENTED | `guard()` (GO + review flag + committed owner record); allocation needs ≥ 30 validation families; evaluate enforces ≥ 30 families and ≤ 45 per family; validation-start marker; exclusive result files |

## Defect: the decision-rule gap

`evaluate.mjs` classifies as follows:

```
(!executionValid || primary.reject && !absolute && !quality) ? 'H_DISC_EXPERIMENT_BLOCKED_OR_INVALID'
: absolute ? 'H_DISC_DEV_QUALIFIED'
: primary.reject && quality ? 'H_DISC_MATERIAL_IMPROVEMENT_NOT_QUALIFIED'
: 'H_DISC_NO_SUPPORTED_ADVANTAGE'
```

Consider a **valid** experiment in which the primary test rejects but F fails a regret or compute gate. It is labelled `EXPERIMENT_BLOCKED_OR_INVALID`. The protocol defines that class only as "an execution-validity, provenance or integrity gate fails". No protocol class fits the case either:
- MATERIAL_IMPROVEMENT requires the regret and compute gates;
- NO_SUPPORTED_ADVANTAGE requires non-rejection.

So the frozen decision rule's `exactlyOne` list is incomplete, and the code fills the hole with a label that misstates validity. **REQUIRES_PROTOCOL_AMENDMENT.** Add an explicit class (e.g. "relative improvement with failed regret or compute gate") or an explicit mapping, and decide it before any validation label opens.

## Observation: S0 evidence is matched to actions by position

The request boundary accepts S0 advisory evidence that is out of order with the menu. `scores[i]` and `topSet` are aligned by position only and are not tied to action keys. The campaign builds requests through `forgeRequest`, which aligns them, so this does not affect a correct run. But a caller that reorders the menu without reordering the evidence gets a silently different decision. The dry run demonstrated this. The frozen SK1 contract shares the behaviour. Worth stating in the inspection design, which binds evidence to the menu identity.

## What completing the review requires

1. **Secondary, pairwise and mechanism reporting** (rows 4b, 10, 11, 12) and the **power re-estimate** (row 14). This is new analysis code. `evaluate.mjs`, `analysis.mjs`, `runner.mjs` and `train.mjs` are bound in the 180-file prospective freeze, and the protocol requires analysis code frozen before execution, so either route is an amendment:
   - **(a)** edit the frozen files under a prospective amendment with a successor freeze; or
   - **(b)** add a separate analysis module, also frozen by amendment before validation.

   Route (b) still needs `run` to persist the full F records and per-action labels for row 12. The current `rows` are not enough for the pairwise endpoints.
2. **The decision-rule gap**: a prospective protocol amendment.
3. **A native end-to-end exercise.** Possible only on development data, on the Mac, under a separate authorization; this review does not authorize it.
4. **Owner confirmation of the learner grid and shared-configuration rule.** Still marked `SPECIFIED_PROPOSED_FOR_OWNER_CONFIRMATION`.

No endpoint or threshold was changed in this review.

## Verdict

```
SCIENTIFIC_IMPLEMENTATION_REVIEW=NOT_ACCEPTED_PRELIMINARY
PRIMARY_REPORTING_COMPLETE=true (implemented; not run natively)
SECONDARY_REPORTING_COMPLETE=false
MECHANISM_REPORTING_COMPLETE=false
DECISION_RULE_GAP=REQUIRES_PROTOCOL_AMENDMENT
```
