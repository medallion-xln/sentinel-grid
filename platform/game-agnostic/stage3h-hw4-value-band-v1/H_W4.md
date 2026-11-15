# H-W4 — Value-Band V2: Prospective Public-Information Policy Experiment (DEV, R0)

**STATUS: H_W4_COMPLETE — CLASSIFICATION C: `H_W4_V2_NO_MEANINGFUL_POLICY_ADVANTAGE`.**
One-pass matched validation executed exactly once. V2 is NOT qualified. Nothing was deployed, promoted, pushed or
committed. OBSERVABILITY_NECESSITY remains NOT_PROVEN. This report preserves the negative result.

BASE_HEAD: `083fc13889a754ff68a2fbdac4d4c707a3ba6d91` · H_W3_P2R committed: `135700d2` · gitignore scope committed: `083fc138`

## 1. Phase 1 — evidence reconciliation (P2R fidelity, exploratory → verified on the matched comparison)

Replayed all 341 studied observation classes deterministically (reconstruct of the H-W3-P2R DEV evidence), with
individual-member verification against the ORIGINAL closure ledger (`stage3h-safety-feasibility-v1/work/ledger`):

- Class base-hash parity: **341/341** vs DEV rows AND vs the ledger's `baseWorldHash`.
- **Individual-member hash parity: exact multiset 341/341.** Every reconstructed equivalent twin's worldHash equals the
  ledger's EQUIVALENT member list, per class (subset 341/341, count 341/341). The ledger additionally lists 3,188
  REJECTED/NOT_EQUIVALENT twin draws (25,212 total draws vs 22,024 equivalent twins + 341 bases = 22,365 reconstructed)
  — these are correctly excluded by the reconstruction's public-content admission; there is no unexplained diff.
- Verification note (honesty record): a first comparison reported "subset 0/341" — that was an artifact of testing
  containment of the BASE world against the ledger's twin-only member list. It was resolved by reading
  `closure/ledger.mjs` (the ledger's `worlds` array covers twin-family draws only) and re-running the deterministic
  replay with corrected, stored per-member hashes. No aggregate was ever presented as replay parity.

Matched-population metrics (N=341; cluster = observation class; 10k-rep class-cluster bootstrap, seed 42):

| metric | V1 (public only) | V2 band partition | paired diff [95% CI] |
|---|---|---|---|
| catastrophe-status heterogeneity (all classes, unrefined counted at V1) | 0.2856 | 0.1084 | −0.1773 [−0.1983, −0.1564] |
| matched-worlds heterogeneity (eligible classes) | 0.2765 | 0.1084 | −0.1681 [−0.1880, −0.1487] |
| robust-safe actions per class (intersection → robust union) | 1,328 total | 1,890 total | +1.6481 [+1.3988, +1.9003] |

Singleton adjustment: singleton subclass fraction 0.6194 mean/class; 6,277 singleton worlds vs 16,088 non-singleton;
170/341 classes expanded, 0 shrunk. Origin-family direction consistent (DEV288 0.1905→0.0913; FRESH_EXPLORE
0.2554→0.1026; FRESH_CHECK 0.2953→0.1134; family-weighted 0.2471→0.1024). Every action family gains robust-safe
actions (MOVE 702→879, PROTECT 303→483, WAIT 58→159, RETREAT 143→168, REINFORCE 35→64, REPAIR 35→66, RESTORE 41→54,
BYPASS 10→14, ATTACK 1→3). **Verdict: the exploratory P2R benefit survives the matched comparison — the design
freeze's stop-before-training condition did not trigger.** This remains an observational property of the value band,
not a policy result.

## 2. Phases 2–3 — frozen V2 DEV contract and static boundary

- Contract `STAGE3H_PUBLIC_DECISION_INFORMATION_V2_VALUE_DEV`: V1 + exactly one 3-level value band per structural node,
  frozen P2R band fn `v<2?0 : v>=spread+3?2 : 1` (lo=2, hi=valueSpread+3), objective-attached nodes 'P', no health band,
  no outcome-dependent retuning. The policy never receives exact value, hidden health, seeds, hashes, world IDs,
  evaluator regret, catastrophe labels, future outcomes, privileged rollouts or action handles.
- Gates (13/13 PASS, `hw4-gates.mjs`): static import boundary (transitive closure of the cut `public-projection.mjs`,
  working-tree hash `c4f9532e…` recorded; the cut itself remains UNCOMMITTED), V1 rows byte-equal to frozen i3,
  V2 = V1 + 8 band one-hots, fail-closed adapter (missing/unbanded/dislocated/no-actor all throw), no exact values in
  features, id-rename / menu-permutation / order invariance, determinism, no lexical identifiers, and —
  **G8 round-trip PASS (1,023/1,023 reconstructed worlds)**: `withValueBands(projectPublic(view), world, spread)`
  reproduces, through the public projection alone, exactly the value-band components of the P2R bandKey computed from
  NATIVE hidden values (world identity pinned by recomputed evaluator truth).
- Exclusion context: strict index 109,082 distinct excluded worlds / 25,499 excluded seeds (V4 namespaces, H-W1
  exploration + validation, blocks 731–734/951–952/977–988, H-W2/H-W3 diagnostic families, all recorded OPEN seeds,
  analyzed class digests, twin lineages). Tamper check PASS: all 4 sealed registries reject fine + coarse PCD probes.
  HOLDOUT = 0. ORIGIN_FAMILY_LEAKAGE = 0.

## 3. Phases 5–6 — fresh populations and matched training

- EXPLORATION: 16 fresh DEV blocks → funnel 148,641 scheduled / 1,486 admitted / pool 1,398 → **1,000 classes built
  (all OK)**, frozen and sealed `HW4_REGISTRY_EXPLORATION` seal `90207037…` (sha256 `327ca410…`).
- VALIDATION: 12 fresh blocks → 1,103 admitted / pool 1,012 → **600 classes built (all OK)**, frozen with outcomes
  withheld (`funnel: counts-only-withheld`), sealed `HW4_REGISTRY_VALIDATION` seal `388921b4…` (sha256 `7c030fd4…`).
- Training (`hw4-train.mjs --write`, refuses VALIDATION phase): two arms, identical architecture / objective / folds /
  ridge / roster / label-shuffle control; folds family-grouped and paired; consistency mismatches 0. OOF selection by
  the prespecified lexicographic rule selected **C10 `BASE_SAFE_FIRST` (tau 0.2) in BOTH arms** (OOF intros vs S0 44;
  label-shuffle control 369). C10's features are the arm-independent BASE columns — the band one-hots live only in
  FULL candidates — so **the two selected policies are identical models**. No post-hoc reselection was performed; the
  frozen rule was followed exactly.

## 4. Phase 7 — one-pass matched validation (600 fresh classes, executed once)

Freeze record `HW4_CANDIDATE_FREEZE.json` (code/contract/population hashes) → 6-shard identity audit (600 classes,
13,800 twins, 28,800 decisions) → single `run --write`. All 11 execution gates PASS
(IMPORTS_ALLOWLISTED, ALLOWLISTED_READS_ONLY, POISONED_VIEW_IDENTICAL, NO_ILLEGAL_ACTIONS_IN_AUDIT,
DETERMINISTIC_REPEAT, FEATURES_INVARIANT_UNDER_D4, V2_BAND_KEY_D4_INVARIANT, EVERY_TEST_EXERCISED,
NEGATIVE_CONTROLS_DETECTED, CLASS_COUNT_MEETS_MINIMUM, NO_HOLDOUT). `reproducible: true`.
Negative controls all fire (HANDLE_ORDER 3188/3600, MENU_POSITION 3258/3600, HIDDEN_HEALTH 2155/2400) — the audit
detects what it should. Unallowed reads: none.

| candidate | intros vs S0 | intros vs Nexus | Δnreg vs S0 [95% one-sided up] | Δnreg vs Nexus [up] | illegal | identity violations | qualified |
|---|---|---|---|---|---|---|---|
| V1 `C10_BASE_SAFE_FIRST` | 32 | 65 | −0.2247 [−0.1990] | −0.2449 [−0.2164] | 0 | 0 | **false** |
| V2 `C10_BASE_SAFE_FIRST` | 32 | 65 | −0.2247 [−0.1990] | −0.2449 [−0.2164] | 0 | 0 | **false** |

- Both arms fail ONLY the zero-introduction gates (32 > 0 vs S0, 65 > 0 vs Nexus). Mean nreg improvement is large and
  CI-bounded below zero vs both comparators (far beyond the 0.02 floor), illegal actions 0, identity zero-tolerance met.
- Paired V2−V1 safety effect: **exactly 0** (identical selected policies; band-ablation diagnostic: 0/600 decision
  flips when the band-column weights are zeroed — the band columns carry zero weight in the selected model).
- Per the frozen rule, this is classification **C: `H_W4_V2_NO_MEANINGFUL_POLICY_ADVANTAGE`** — not B ("safety
  improvement but not qualified"), because the V2 arm shows no decision-level difference at all. Regret improvement
  over comparators is a property of BOTH arms and does not distinguish them; it is not a V2 effect.

## 5. Interpretation (discipline record)

1. The value band carries real decision-relevant information about catastrophe status (Phase 1: heterogeneity halves,
   robust-safe sets expand, CIs exclude 0) — confirming H-W3-P2R qualitatively on a matched comparison.
2. But the prespecified learning procedure, given that information as 8 one-hot features on the exploration population,
   does not use it: lexicographic OOF selection prefers the band-free BASE feature set in both arms, and the selected
   V2 policy is identical to V1 with zero band influence (0/600 ablation flips).
3. Therefore the public value band, in this DEV-only experimental contract, is **not yet a demonstrated
   policy-input necessity**: OBSERVABILITY_NECESSITY remains **NOT_PROVEN**. This is a negative result on the POLICY
   question, and it does not overturn the Phase 1 observational finding — it bounds it.
4. Per the owner directive: no relative-improvement substitution for safety standards; nonzero introductions are NOT
   qualified regardless of regret gains; the regret results of both arms remain exploratory DEV evidence.

## 6. Prohibitions respected

No change to deployed V1 observations; no production disclosure of hidden node value; no new sealed or confirmatory
campaign; no I-6 or held-out qualification; no reuse of spent H-W1 validation populations; no change to frozen V4 or
H-W1 results; no GitHub push; no A5; no runtime authority promotion; V2 never deployed; HOLDOUT = 0;
NEW_SEALED_REGISTRATION = false (the two H-W4 population registries are the design-authorized Phase 5 artifacts, not
qualification registrations); V4 and H-W1 negative verdicts stand FINAL; FULL_STAGE3H_CERTIFIED = false;
STAGE3I_STARTED = false. **The H-W4 implementation and results are NOT committed** — separate authorization required.

## 7. Explicit recommendation (next exact scientific decision)

`NEXT_EXACT_SCIENTIFIC_DECISION`: **Decide whether the value band deserves a third policy-form attempt or closure.**
The only V2-vs-V1 difference that failed is *selection*, not safety: FULL candidates (which DO consume the band) were
nearly identical in OOF safety (C11: 55 vs 61 intros vs S0; C03: 59 vs 61) — a hint, not evidence, that the band's
value may concentrate in the cat-head (SAFE_FIRST/RISK_WEIGHTED) candidates rather than the nreg head. A prespecified
follow-up restricting lexicographic selection to FULL (band-consuming) candidates, run once on fresh DEV blocks under
the same gates, would test exactly that; anything less disciplined would be tuning. Alternative: accept the negative
result, freeze the H-W4 lane, and record that the public value band is decision-relevant (Phase 1) but not
policy-necessary (Phase 7) under every prespecified procedure attempted.

## REQUIRED RESULT

```
STATUS=H_W4_COMPLETE
CLASSIFICATION=C
BASE_HEAD=083fc13889a754ff68a2fbdac4d4c707a3ba6d91
H_W3_P2R_COMMITTED=true
GITIGNORE_SCOPE_COMMITTED=true
CUSTODY_GUARDS_PASS=true
P2R_MATCHED_EFFECT_VERIFIED=true
P2R_SINGLETON_ADJUSTMENT=survived (0.6194 singleton fraction; paired het diff −0.1773 CI[−0.1983,−0.1564]; 170/341 expanded, 0 shrunk)
P2R_WORLD_IDENTITY_PARITY=exact multiset 341/341 (twins vs ledger EQUIVALENT; base 341/341; 3,188 ledger REJECTED/NOT_EQUIVALENT draws correctly excluded)
V1_CONTRACT_ID=STAGE3H_PUBLIC_DECISION_INFORMATION_V1
V2_EXPERIMENTAL_CONTRACT_ID=STAGE3H_PUBLIC_DECISION_INFORMATION_V2_VALUE_DEV
VALUE_BAND_SCHEMA_FROZEN=true
VALUE_DISCLOSURE_DEV_ONLY=true
STATIC_IMPORT_BOUNDARY_PASS=true
IDENTITY_INVARIANCE_PASS=true
STRICT_EXCLUSIONS_BOUND=true
FRESH_EXPLORATION_CLASSES=1000
FRESH_VALIDATION_CLASSES=600
HOLDOUT_CLASSES_GENERATED=0
ORIGIN_FAMILY_LEAKAGE=0
V1_POLICY_ID=V1_PUBLIC_ONLY/C10_BASE_SAFE_FIRST
V2_POLICY_ID=V2_PUBLIC_PLUS_VALUE_BAND/C10_BASE_SAFE_FIRST
POLICY_ARCHITECTURE_MATCHED=true
TRAINING_OBJECTIVE_MATCHED=true
TRAINING_DATA_MATCHED=true
V1_INTRODUCTIONS_VS_S0=32
V2_INTRODUCTIONS_VS_S0=32
V1_INTRODUCTIONS_VS_NEXUS=65
V2_INTRODUCTIONS_VS_NEXUS=65
PAIRED_SAFETY_EFFECT=0 (identical selected policies; band ablation 0/600 flips)
PAIRED_CONFIDENCE_INTERVALS=V1/V2 vs S0 Δnreg −0.2247 [95% one-sided upper −0.1990]; vs Nexus −0.2449 [−0.2164]; V2−V1 exactly 0
V1_REGRET_DELTA=-0.2247 (vs S0)
V2_REGRET_DELTA=-0.2247 (vs S0)
V2_ILLEGAL_ACTIONS=0
V2_COMPUTE_BUDGET=within (median 13.0ms ≤ 100; max 165.3ms ≤ 1000)
V2_DEV_QUALIFIED=false
OBSERVABILITY_NECESSITY=NOT_PROVEN
UNIVERSAL_SAFETY_PROVEN=false
NEW_SEALED_REGISTRATION=false
HOLDOUT_EXECUTED=false
V2_PRODUCTION_DEPLOYED=false
V4_NEGATIVE_VERDICT_FINAL=true
H_W1_NEGATIVE_VERDICT_FINAL=true
FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false
REMOTE_PUSH=false
A5_AUTHORIZED=false
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false
NEXT_EXACT_SCIENTIFIC_DECISION=owner decides: one prespecified FULL-only selection re-run on fresh DEV blocks (tests band value in the cat-head candidates; same gates, one pass) OR accept the negative result and freeze the H-W4 lane with the recorded boundary (band decision-relevant, not policy-necessary under prespecified selection)
```
