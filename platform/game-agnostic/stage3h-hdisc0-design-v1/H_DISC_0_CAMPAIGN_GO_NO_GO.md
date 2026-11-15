# STAGE 3H H-DISC-0 — Inheritance, campaign entry gate and design disposition

AUTHORITY: R0 · BASE HEAD `eb75dff868bf526720cb8d13b70f5643fed49e64`

Machine records: `evidence/HDISC0_INHERITANCE.json` (`inheritance/verify-inheritance.mjs`),
`evidence/HDISC0_READINESS.json` (`readiness/campaign-entry-gate.mjs`).

## Disposition

**CLASSIFICATION: A — `H_DISC_DESIGN_READY_CAMPAIGN_NOT_AUTHORIZED`**

| dimension | status |
|---|---|
| **Scientific-design readiness** | **READY as a design.** The mechanism is specified, the contracts are executable and tested, the arms, matched controls, endpoints, decision rule and power are fixed in a draft. Items in section 5 remain before a freeze |
| **Campaign readiness** | **NO_GO.** The entry gate passes 2 of 7 conditions. Training and validation are not authorized |

This is not an H-DISC performance result. Nothing was trained or evaluated, and the design may fail.

## 1. Gate 0 — what was inherited, verified now

All eleven items verified against tracked records; nothing was rewritten, recommitted or rerun.

| # | item | result |
|---|---|---|
| 1 | HEAD `eb75dff8…`; `179922dd`, `16ae5c21`, `17318b03`, `eb75dff8` are ancestors in that order; none is on `origin` | VERIFIED |
| 2 | custody guards: hooks present, guard manifest intact, 31 of 31 protected identities match, none tracked | VERIFIED |
| 3 | SK1: classification B, `SAFETY_KERNEL_DEV_QUALIFIED=false`; results `239c16bc…`, freeze `d22be2c4…`, model `b479972a…`; check mode passes; 40 of 40 tests | VERIFIED |
| 4 | SK1.1 evidence identities and source manifest; suite 64 of 65, the one failure being the dated-inventory test that detects the authorized import-cut commit | VERIFIED |
| 5 | SK2-F: classification B, priority `WITHIN_MENU_ACTION_RISK_DISCRIMINATION`; check modes pass; 23 of 23 tests | VERIFIED |
| 6 | predecessor verdicts (table below) | VERIFIED |
| 7 | import-cut commit `17318b03`: one path; old `2d1e7061…`, new `c4f9532e…`; old revision retrievable at `b38b16ee` | VERIFIED |
| 8 | historical exclusions: 114 forbidden blocks listed; 901–914 and 801–837 rejected in this working tree | VERIFIED |
| 9 | R0 authority: frozen kernel and SK1.1 envelope cannot dispatch or mutate and are labelled NOT_QUALIFIED | VERIFIED |
| 10 | canonical nine-expert roster unchanged since `966f6eb3` | VERIFIED |
| 11 | the five mandatory readiness findings, each re-measured | VERIFIED — none resolved except as stated below |

**Predecessor verdicts, from their tracked records:**

| study | verdict | record | commit |
|---|---|---|---|
| V4 | `BOUNDED_SELECTOR_NOT_QUALIFIED`; registration complete and irrevocably consumed | `stage3h-owner-governed-v1/evidence/execution-7c41ba89/qualification-summary.json`; `stage3h-failure-diagnosis-v1/evidence/ADJUDICATION_7c41ba89.json` | `e46329cc`, `38f7c1d6` |
| H-W1 | `H_W1_DEV_VALIDATION_NOT_QUALIFIED`; closed; `STATIC_IMPORT_CONTRACT=FAIL` | `stage3h-hw1-dev-v1/evidence/I5_VALIDATION_RESULTS.json`; `H_W1_CLOSURE.md` | `c96e68c6`, `d706b689` |
| H-W4 | `H_W4_V2_NO_MEANINGFUL_POLICY_ADVANTAGE`; classification C | `stage3h-hw4-value-band-v1/evidence/HW4_VALIDATION_RESULTS.json`; `H_W4.md` | `9175a555` |
| H-W4B | blocked at phase 2; classification D; value-band policy line CLOSED | `HW4B_STOP_RECORD.json`, `HW4B_CLOSURE_MANIFEST.json`, `H_W4B_CLOSURE.md` | `966f6eb3` |

**The roster.** `SENTINEL_EXPERT_ROSTER_V1` in `artifacts/stage3f-freeze/stage3f-freeze.json`, nine experts: Prime,
Vanguard, Oracle, Nexus, Horizon, Archimedes, Alexandria, Picasso, Forge. Six tracked definitions agree. The Arbiter is
recorded as infrastructure (router/arbiter), not as one of the nine. The discriminator is a policy component, not an
additional expert.

## 2. The five mandatory readiness findings

| # | finding | status now |
|---|---|---|
| 1 | Twenty-nine protected source files remain outside Git | **unchanged.** 31 of 31 identities match; 29 are in the SK1 evaluation closure; none is tracked |
| 2 | Nineteen gitignored data files are required to reproduce the historical evaluation | **unchanged.** 2 manifests, 9 validation class shards, 8 audit shards |
| 3 | Exclusion loaders are not independently importable from clean committed source | **unchanged for the historical loaders.** A new portable loader, exactly equivalent, is importable from committed source alone (section 3) |
| 4 | No independently restored backup exists | **unchanged.** One mounted volume, no Time Machine destination, nothing copied |
| 5 | The import-cut revision is committed, but historical source identities remain distinct | **unchanged.** HEAD carries the revision H-W4, H-W4B and SK1 pinned; H-W1 pinned the earlier one. 25 tracked files now pin a revision |

None is reported as resolved. Finding 3 has a prospective remedy that does not alter the historical loaders.

## 3. What Gate 5 prepared

Details in `H_DISC_0_SOURCE_AND_EXCLUSION_READINESS.md`.

| item | result |
|---|---|
| why the historical loaders were not portable | two constants (`EXCLUDED_BLOCKS`, `PCD_VERSION`) exported by modules whose import graph reaches protected source; no schedule or generator is involved |
| portable exclusion loader | node built-ins only; reads 26 tracked records; context identity identical to the historical successor loader (`fd768113…`); 2,056 of 2,056 probe verdicts identical |
| clean-checkout demonstration | a `git archive HEAD` export with no protected file and no local data: loader imports, verifies every hash, passes the positive case and 163 of 163 negative controls |
| evidence bundle | `SENTINEL_EVIDENCE_BUNDLE_V1` specified and a verifier built; **no bundle issued** |
| backup acceptance | checklist and `SENTINEL_BACKUP_ACCEPTANCE_RECORD_V1` schema; **no backup made** |
| campaign-entry gate | seven computed conditions; fail closed |

## 4. Campaign entry gate

`node readiness/campaign-entry-gate.mjs` — each condition is computed from repository state; none can be asserted by a
flag. Any failed or unevaluable condition gives NO_GO. A GO would authorize nothing by itself.

| # | condition | now | what would satisfy it |
|---|---|---|---|
| G1 | verified source custody | **PASS** | — |
| G2 | verified excluded-population enforcement | **PASS** | — |
| G3 | reproducible evaluation environment | FAIL | an owner-issued evidence-bundle manifest, bound by the campaign declaration, that verifies; runtime pinned |
| G4 | independently recoverable evidence | FAIL | a committed, valid backup acceptance record from a restore on a different device |
| G5 | frozen scientific protocol | FAIL | a committed freeze record whose hash matches the committed protocol; only a draft exists |
| G6 | no uncommitted source dependency | FAIL | a declared source closure that is entirely committed or bundle-verified |
| G7 | no privileged inference leakage | FAIL | an H-DISC implementation whose inference closure passes an evaluator-free graph audit; none exists |

**DECISION: NO_GO — 2 of 7.**

G5 and G7 cannot pass in this stage by construction. G3 and G4 need owner action with approved offline storage. G6
needs both.

## 5. What remains before a pre-registration could be frozen

Scientific design:

| item | note |
|---|---|
| learner family, configuration grid and capacity budget | must allow a non-additive pair model, or the pairwise step is vacuous |
| the exact relational feature list | audited for public-only inputs and invariance; must remove the four-menu feature collision |
| validation size | 900 recommended; 600 only with a pre-registered 60% effect |
| re-estimated planning inputs | baseline, design effect and failure association, on fresh exploration data |
| supply check | fresh blocks and origin families for a family-disjoint 1,000 / 900 split |

Known risks the owner should weigh before authorizing anything:

1. **Adverse prior for the pairwise step.** H-W1's six matched pairs showed no safety difference from within-menu
   fitting of linear models. The design isolates this step so that it can be seen to fail.
2. **Identifiability is open.** A safe action exists in every class; nothing shows public information can find it.
   A null result is a live possibility and would be informative.
3. **A success would still not qualify.** Halving SK1's top-choice unsafe rate leaves it near 3%; Contract A needs
   zero. The expected best case is a supported improvement that is NOT_QUALIFIED.
4. **Single horizon, screened population.** Every class is H2 and screened to stress the comparators.

## 6. Why A and not B, C or D

| option | verdict | reason |
|---|---|---|
| A — design ready, campaign not authorized | **chosen** | mechanism specified; contracts executable; matched controls, endpoints, decision rule and exact power fixed in a draft; infrastructure prerequisites listed |
| B — design underdetermined | rejected | a concrete mechanism and a matched comparison exist. What is underdetermined is the *cause* of SK1's errors (learner versus features), and the design is built to test exactly that |
| C — prospective research blocked | rejected | nothing required is impossible to make ready: exclusion source is now portable, and the remaining gates need owner action and an implementation, not something unobtainable |
| D — hypothesis not justified | rejected | ordering errors are 87% of failures on two family-disjoint populations and every accepted failure, so the target is justified. The adverse prior applies to one step of the mechanism, not to the priority |

## 7. Exact owner decisions

1. Accept or reject disposition A.
2. Validation scale: 900 classes, or 600 with a 60% pre-registered effect.
3. Supply approved offline storage and run the backup procedure, then issue an evidence bundle (gates G3, G4).
4. Whether to authorize the next preparatory step: freezing a pre-registration and building the discriminator
   implementation **without training on fresh data**, so that G5–G7 can be evaluated.
5. Training and validation remain unauthorized until the gate returns GO and the owner authorizes a campaign
   separately.

Nothing follows automatically from any of these.

```
EXCLUSION_SOURCE_CLEAN_CHECKOUT=true (new portable loader; historical loaders unchanged and still not importable)
EXCLUSION_REGISTRY_ENFORCEMENT=VERIFIED (identical context; 2,056/2,056 probes; 163/163 controls; clean-checkout pass)
PROTECTED_SOURCE_CUSTODY=INTACT_NOT_PORTABLE (31/31 identities match; 29 evaluation files outside git; no bundle issued)
EVALUATION_REPRODUCIBILITY=NOT_FROM_A_CLEAN_CHECKOUT_ALONE
INDEPENDENT_BACKUP_VERIFIED=false
CAMPAIGN_READINESS=NO_GO (2 of 7: G1, G2 pass; G3-G7 fail)
```
