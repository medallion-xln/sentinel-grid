# Stage 3H V4 owner-governed scientific qualification: evidence dossier

All numbers come from `runs/7c41ba89c5c63489/ANALYSIS.json` (the registered analysis), the locked run files and
`evidence/execution-7c41ba89/qualification-summary.json`. Nothing was recomputed, adjusted or reselected.

```
=== SENTINEL GRID STAGE 3H V4 SCIENTIFIC QUALIFICATION ===

STATUS=COMPLETE (A and B executed once each and locked; registered analysis written; supplemental recount reconciled)
CLASSIFICATION=BOUNDED_OWNER_GOVERNED_QUALIFIED_NEGATIVE_HARM (registered disposition) -> BOUNDED_SELECTOR_NOT_QUALIFIED

REGISTRATION_SHA256=7c41ba89c5c63489b4b4b6351716889460996b688e8ab897197a64a6fb7014cc
REGISTRATION_COMMIT=01d4cc34cdee7f498f413396708f14acf13e2d33

AUTHORITY=R0
SOURCE_INTEGRITY=PASS (237 bound sources and runtime identity verified before launch, after both locks and after analysis)
PROTECTED_FILES_UNCHANGED=true (14,447; nine-expert roster preserved)
MACHINE_PREFLIGHT=PASS (registered O-5 preflight: A load 1.59/10, dev-lock p99 55 ms; B load 1.67/10, p99 53 ms; one earlier B start refused at load 2.54, nothing consumed)

REPLICATION_A_STATUS=EXECUTED_ONCE_LOCKED (2026-10-21 16:54-18:23)
REPLICATION_B_STATUS=EXECUTED_ONCE_LOCKED (2026-10-22 03:43-05:06)
REPLICATION_A_LOCK=ce0e3adc8efb727b9a07e69175e6b373632cc1303b21d72fd5cae519295ad038
REPLICATION_B_LOCK=86a5ff782906d1f34269a849ea37fad00e7415040b0ef583bb6e6176fe8786cc

SCHEDULED_WORLDS=25,536 (12,768 per replication)
ADMITTED_WORLDS=25,377 (A 12,696; B 12,681; 99.38%; every population and band admission floor passed)
REJECTED_WORLDS=159 (158 VALIDATOR_INVALID; 1 NATIVE_MENU_INVALID; 0 PRIOR_WORLD_EXCLUDED; never replaced)
NATIVE_MENU_INVALID_WORLDS=1 (B, OOD_ROLES star/scarce/restore_and_protect/H0/1, DUPLICATE_ACTION_ID; 1/25,536, 95% CI [9.9e-7, 2.2e-4]; 0/20,544 in the four other populations)
RECOUNT_RECONCILIATION=RECONCILED_EXACT (every population, both replications: scheduled, accepted, rejected, band and cell counts; accepted worlds world-by-world by id, seed, cell and world hash)
RECOUNT_LIMITATIONS=rejection reasons reconciled per cell in aggregate only (the runner records no reason); rejected worlds identified as the scheduled complement of the accepted set

FULL_POPULATION_REGRET_DELTA=R-B -0.193 to -0.250 and R-N -0.176 to -0.225 across all 10 panels; every family-adjusted upper bound < 0: MATERIAL_BENEFIT in 10/10
H0_SELECTION_BENEFIT=R-B at H0 -0.387 to -0.499: MATERIAL_BENEFIT in 10/10
H2_HARM_AVOIDANCE=R-N at H2 -0.353 to -0.449: MATERIAL_BENEFIT in 10/10
HOLDOUT_RESULT=primaries material benefit in A and B (full R-B -0.203 / -0.218); catastrophe zero-introduction veto FAILS (4 / 2 introductions vs N); IDENTITY nuisance FAILS; best-of gap FAILS in A (0.0217), passes in B
OOD_RESULTS=OOD_LEVEL, OOD_ROLES, OOD_OBJECTIVES, OOD_SHAPES: primaries material benefit in both replications; catastrophe veto fails in 7/8 OOD panels (A/OOD_LEVEL 0 introductions); IDENTITY nuisance fails in 8/8; best-of gap fails in 4/8
REGIME_RESULTS=OBSERVED_THREAT and NO_OBSERVED_THREAT: benefit in all 40 regime estimates (R-B and R-N), no material harm, support adequate
EFFECTIVE_SAMPLE_SIZES=full population 2,490.8-2,618.1 per panel; H0 1,244.9-1,301.1; H2 1,244.9-1,317.1
MULTIPLICITY_RESULT=all four primaries remain materially beneficial under the registered family-adjusted bounds (family 40, 20,000 resamples); no primary equivalent, none in the harm direction
NUISANCE_RESULT=D4 pass 40/40 and ORDER pass 40/40; IDENTITY (O-2R.1 opaque-handle twin) FAILS in 10/10 panels, maximum adjusted upper bound 0.075-0.119 against 0.02
CATASTROPHE_RESULT=R-B: 0 introductions, bound <= 0.0099, PASS 20/20; R-N: 35 introductions (all at H2, where R = S0 by rule), so the registered zero-introduction veto fails in 9/10 panels, although R has fewer catastrophes than N on average (R-N catastrophe mean -0.15 to -0.45 at H2)
FALSE_SELECTION_HARM=HARM_B pass 10/10 (max adjusted upper 0.0116); HARM_N pass 10/10 (max 0.0145); BEST_OF_GAP fails 5/10 (adjusted upper 0.0205-0.0232 > 0.02)
SAFETY_VETO=TRIGGERED (catastrophe zero-introduction veto and best-of-gap safety bound)

BOUNDED_SELECTOR_QUALIFICATION=BOUNDED_SELECTOR_NOT_QUALIFIED
SEVEN_DIMENSION_EVIDENCE_STATUS=SEPARATE_AND_INCOMPLETE (sealed Track A evidence now exists for marginal value, complementarity, horizon and regime competence and false-selection harm; Prime synthesis and TCA remain not testable; no owner disposition of all seven dimensions; no independent review)

OWNER_GOVERNED=true
INDEPENDENT_REVIEW=false
FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

EVIDENCE_COMMIT=(the commit that adds this dossier; see git log)
NEXT_EXACT_SCIENTIFIC_ACTION=Owner adjudication of this negative bounded result. No further campaign follows automatically, and registration 7c41ba89 is exhausted.
```

## 1. Registration identity

Registration `7c41ba89c5c63489b4b4b6351716889460996b688e8ab897197a64a6fb7014cc` (commit `01d4cc34`), which activates candidate
`d8a44ebd19f6dc5b833462435385680dcf2c3541a543a0e18f3fb81067307aad` (commit `5f54f234`). It succeeds the aborted registration `0364164c`,
which remains preserved unchanged: A consumed and aborted, B never started.

## 2. Owner execution authorization

`registration/EXECUTION_AUTHORIZATION_V4.json` (sha256 `f4e9c12a…`; commit `58028389`) is a session owner authorization, not a
cryptographic signature. It covers A, then B only after A locked, then the registered analysis. Before launch it also fixed the
supplemental recount (`exclusion-recount-v4.mjs`, validated on all 9,456 spent worlds) and the mapping from registered
dispositions to the four owner verdicts. The owner's repeated authorization of 2026-10-22 was treated as the same once-only
campaign, not as a new one.

## 3. Frozen source and runtime provenance

- **Sources and runtime.** All 237 bound sources were verified at four points: the pre-execution gates (18/18), the runner's own load
  check before each replication, the recount, and the post-run summary. Runtime throughout: Node 22.22.2 binary `5c899797…`, no
  launch flags, no NODE_OPTIONS.
- **Unchanged components.**
  - Frozen selector `c53826da…` (H0 → NEXUS_ELSE_S0, H2 → S0).
  - Forge World V2 sources, all 57 bound `src/` files.
  - The O-6 native-menu rule.
  - The O-2R.1 IDENTITY twin.
  - V3 analysis and admission code.
  - The 1,000 ms decision limit and the O-5 preflight.

## 4. A/B run status and lock hashes

| | A | B |
|---|---|---|
| Window | 2026-10-21 16:54–18:23 | 2026-10-22 03:43–05:06 |
| Lock | `ce0e3adc…` | `86a5ff78…` |
| Abort record | none | none |
| Outcome locked | 12,696/12,768 admitted | 12,681/12,768 admitted |

B was not adapted from A. A's outcomes were not opened before B locked, and the recount was recorded before
`ANALYSIS.json` was opened.

Operational events:

- The first chain's 8-hour idle window lapsed while macOS background work (Photos media analysis, Spotlight) and user apps
  kept the load at 4–34; B was not started.
- A committed B-only continuation (`f382d46c`) then resumed. It never invoked A.
- Its first B start was refused by the registered preflight (load 2.54 > 2.5), with nothing consumed.
- The second start, at load 1.51, ran and locked.

## 5. Admission results and supplemental recount

| Population | A admitted | B admitted |
|---|---|---|
| HOLDOUT_KNOWN_COMPOSITION | 2493/2496 | 2493/2496 |
| OOD_LEVEL | 2495/2496 | 2495/2496 |
| OOD_ROLES | 2495/2496 | 2491/2496 |
| OOD_OBJECTIVES | 2576/2592 | 2566/2592 |
| OOD_SHAPES | 2637/2688 | 2636/2688 |

Every registered admission requirement passed: population and per-horizon 90% floors, MIN_ACCEPTED_PER_CELL=2, effective N.
The outcome-blind recount reproduced every locked count exactly. It also matched every accepted world, world by world, against
the locked ledgers. Rejection reasons:

- **A:** 72 VALIDATOR_INVALID.
- **B:** 86 VALIDATOR_INVALID and 1 NATIVE_MENU_INVALID/DUPLICATE_ACTION_ID.

## 6. Actual exclusions and uncertainty

The single prospective malformed-menu world lies in the at-risk stratum identified before execution: a substitute-bearing role
(scarce) with a restore objective, in OOD_ROLES.

| Scope | Malformed-menu rate | 95% Clopper–Pearson interval |
|---|---|---|
| All worlds | 1/25,536 | [9.9e-7, 2.2e-4] |
| OOD_ROLES | 1/4,992 | [5.1e-6, 1.1e-3] |
| At-risk stratum | 1/2,496 | [1.0e-5, 2.2e-3] |
| Other four populations | 0/20,544 | upper 1.8e-4 |

These are observed rates; no guaranteed future rate is implied. Validator rejections (158) are concentrated in OOD_SHAPES
(103) and OOD_OBJECTIVES (42), as in development.

## 7. Statistical comparisons (registered analysis, 20,000 resamples)

- **Primaries.** All four (H0 specialist, H2 avoidance, full vs B, full vs N) are MATERIAL_BENEFIT in all ten panels (two
  replications × five populations). Every family-adjusted upper bound is below 0 and every mean is at or below −0.176,
  against the 0.02 materiality threshold.
- **Other checks.** Accuracy passes 40/40. Both regimes show benefit in all 40 regime estimates, with no material harm. The
  H0 R=N and H2 R=B exact identities pass in all panels.
- **A/B agreement.** The primary interpretations agree in every population.
- **Where the qualification fails.** Three registered vetoes and bounds fail:
  - **Catastrophe zero-introduction (R vs N).** There are 35 worlds, all at H2 (where the frozen rule plays S0), in which R is
    catastrophic and N is not. Per panel (A / B): HOLDOUT 4/2, OOD_LEVEL 0/2, OOD_ROLES 3/3, OOD_OBJECTIVES 8/5, OOD_SHAPES 5/3.
    The registered criterion requires zero, so it fails in 9/10 panels, although R averages far fewer catastrophes than N at
    H2. Against S0 (R vs B) there are zero introductions and the bound passes everywhere.
  - **IDENTITY nuisance.** Selections depend on the opaque relabelling of entities and actions beyond 0.02 in every panel: the
    maximum adjusted upper bound is 0.075–0.119. D4 orientation and presentation ORDER are invariant (40/40 each). The cause
    was not investigated, because no new stage was authorized.
  - **Best-of gap.** In 5/10 panels the adjusted upper bound of R − min(B, N) is 0.0205–0.0232, against 0.02.
- **Disposition.** The registered rule classifies any catastrophe introduction as harm, which gives
  BOUNDED_OWNER_GOVERNED_QUALIFIED_NEGATIVE_HARM. The mapping fixed before launch turns that into
  **BOUNDED_SELECTOR_NOT_QUALIFIED**. Even with no introductions at all, the IDENTITY nuisance and best-of-gap failures would
  still have prevented a positive result.

## 8. Catastrophe and safety findings

- No catastrophe risk claim is made. Against S0, zero catastrophe introductions were observed; the registered 95% bound
  reaches up to 0.0099 per comparison, so zero does not mean no risk.
- Against Nexus-else-S0, the rule's H2 choice of S0 introduced catastrophes in 35 worlds while avoiding many more. Net
  avoidance is not what the frozen veto tests.
- The false-selection harm bounds against B and against N pass. The best-of-gap safety bound fails in five panels.

## 9. Confirmatory versus earlier development evidence

The regret effects replicate the earlier 3H.1-F confirmations closely. For example, OOD_ROLES Δnreg was −0.2095 in 3H.1-F and
−0.193 / −0.199 now; OOD_LEVEL was −0.260 and is −0.2495 / −0.2495 now. The criteria that fail here belong to the stricter V3
contract (zero introductions against both comparators, nuisance invariance, best-of gap), which 3H.1-F did not test. The
development O-2R.1 gate validated the identity twin's construction, not the selector's invariance to it.

## 10. Reproducibility limitations

- All locked files, `ANALYSIS.json`, the recount and the summary are preserved and committed, with hashes as above.
- The 30 policy-protected sources are not committed; a local byte-preserving package (`ecfc7016…`) enables clean-clone replay.
- Replay equivalence excludes the wall-clock fields only.
- The exclusion-reason breakdown is aggregate per cell for rejected worlds.

## 11. Owner-governance disclosure

The same person designed, held custody and executed; blinding was procedural. INDEPENDENT_METHOD_REVIEW=false;
EXTERNAL_INDEPENDENT_CUSTODY=false. Approval and authorization are session instructions, not signatures. No independent
reviewer is claimed.

## 12. Final bounded qualification verdict

**BOUNDED_SELECTOR_NOT_QUALIFIED.** The frozen horizon selector shows large, replicated regret benefits. It fails the
registered catastrophe zero-introduction veto against Nexus-else-S0, the IDENTITY nuisance invariance criterion, and in half
the panels the best-of-gap safety bound. Registration 7c41ba89 is exhausted; no part of it may be rerun or re-analysed to a
different verdict.

## 13. Outstanding canonical Stage 3H requirements

These are unchanged and separate from this bounded result:

- independent method review and custody;
- TCA (no frozen World-Model Trust Gate);
- incumbent Prime synthesis (no matched interface);
- owner dispositions for all seven dimensions.

The canonical MoE gain is NOT_ESTABLISHED; full canonical Stage 3H certification is false; Stage 3I is not started.
