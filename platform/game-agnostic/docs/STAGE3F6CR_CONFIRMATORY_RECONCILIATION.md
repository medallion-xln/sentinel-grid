# Stage 3F.6-CR — confirmatory reconciliation

Stage 3F.6-CR is the last measurement-integrity step before the formal Stage 3F freeze. It measures nothing new. It
reconciles the historical Stage 3F.6 certificate, the Stage 3F.6-R runtime remediation, STAGE3F6-ERRATUM-001 and the
symmetric requalification chain (P.1C → D-SYM) into one canonical claim map. It freezes
`SENTINEL_DECISION_EVALUATION_CONTRACT_V1` (specification only) and a Stage 3G inherited-requirements candidate, and
evaluates the Stage 3F exit criteria.

It does **not** begin Stage 3G, redesign the Router or any expert, add world-model code, change authority, or perform
the formal Stage 3F freeze. Authority stays R0: `canDispatch=false`, `canMutateLiveWorld=false`,
`onlineLearningEnabled=false`, `promotedToLiveRuntime=false`.

## Commands

| Command | Effect |
| --- | --- |
| `npm run stage3f6cr:reverify-erratum` | Re-runs the erratum's provenance experiment from committed state and records the result. |
| `npm run stage3f6cr:plan` / `stage3f6cr:plan:check` | Builds, or byte-checks, the plan, claim map and Decision Evaluation Contract. |
| `npm run stage3f6cr:full-suite` | Runs the full platform test suite (TAP reporter) and records the counts. |
| `npm run stage3f6cr:certify` / `stage3f6cr:check` | Certifies, or byte-checks, the reconciliation with `scripts/stage3f6cr-certify.mjs` (the check never writes). |
| `npm run test:stage3f6cr` | Runs the stage's own tests. |

`stage3f6cr:reverify-erratum` needs the Stage 3F.6 evaluation-corpus payload
(`npm run stage3f:evidence:rebuild -- --only=3F6_EVALUATION_CORPUS`). The certifier needs the Stage 3F payloads for the
predecessor chain (`npm run stage3f:evidence:rebuild`). Payloads are git-ignored. They are regenerated from committed
code and verified against their committed manifests.

## Method

**Every claim is bound, not transcribed.** Each historical, erratum, claim-map, requirement, exit-criterion and
immutable-fact statement carries at least one evidence binding: `{certificate, certificationHash, path, expect}`. A
binding holds only if:

- the named committed certificate still has that certification hash; and
- the JSON field at `path` equals `expect`.

A binding that does not hold fails the plan build, the tests and the certificate.

**Predecessor reproduction.** The certifier re-runs the W-SYM, D-SYM freeze and D-SYM `--check` commands through
`verify-stage3f.mjs`, which always runs under the canonical runtime (`SENTINEL_CANONICAL_NUMERICS_V1`) and the
read-only guard. W-SYM's check is transitive: it runs P.1-SYM, which runs P.1A-SYM. That in turn requires P.1C, P.1D,
P.1E and T-SYM to reproduce byte for byte. Phase 0 also ran all nine checks explicitly, and all were `BYTE_EXACT`.

**Erratum re-verification.** `stage3f6cr-erratum-reverification.mjs` repeats the erratum's experiment from committed
state:

- The committed Stage 3F.6 certifier is recomputed at HEAD.
- It is recomputed again in a temporary worktree where only the three runtime/recovery files named by the erratum are
  restored to their bytes before `2ee28987`.
- Both runs are compared section by section with the stored certificate.

Result, identical on two runs:

- At HEAD the recomputation differs in 806 fields. That is exactly the erratum's figure, concentrated in Layer B,
  degradation, the evaluation snapshot and calibration.
- With the pre-remediation runtime restored, every measurement section is identical to the stored certificate. The
  residual 33 leaves all fall in the categories the erratum discloses:
  - status;
  - predecessor environment diagnosis and blockers;
  - tests 104/106 and the exit criteria they drive;
  - the certifier and test source hashes.

  The erratum counted 17 with its own diff tool. This tool counts each predecessor flag, diagnosis field and shifted
  blocker index separately, so the categories are compared, not the count.

The erratum itself is not modified. It is bound by sha256, and git shows exactly one commit ever touching it.

## Canonical claim map

Classes: `SURVIVES`, `PARTIALLY_SURVIVES`, `INVALIDATED`, `SUPERSEDED`, `NOT_RETESTABLE`, `INSUFFICIENT_EVIDENCE`. The
file is `artifacts/stage3f6cr-confirmatory-reconciliation/stage3f6cr-claim-map.json`.

| Claim | Class | Current finding |
| --- | --- | --- |
| RESOURCE competence | INVALIDATED | Shortcut-dependent: zero-cost prior plus a fixed-direction tie-break. |
| RESOURCE shortcut dependence | SURVIVES | Confirmed on symmetric and fresh sealed partitions. |
| NEXUS V1 competence | SURVIVES | Redesign candidate; representation-blocked and policy-logic-limited. |
| NEXUS V2 competence | PARTIALLY_SURVIVES | Real standalone gain, but it comes from a direction shortcut; lowers the ceiling. |
| OBJECTIVE competence | SUPERSEDED | Now KEEP_BUT_LIMIT: low coverage, degrades on OOD. |
| THREAT competence | INSUFFICIENT_EVIDENCE | Coverage 0.026; accurate where it proposes, but below the evidence floor. |
| Expert complementarity | SURVIVES | Exists: a perfect selector gains +0.137 accuracy on fresh HOLDOUT. |
| Complementarity routability | INVALIDATED | Not routable from deployable features. |
| Router value | SURVIVES | Not material; Router 2.0 not justified. |
| Risk-state value | PARTIALLY_SURVIVES | Weak, shortcut-correlated, OOD-unstable. |
| Decision-rule value | PARTIALLY_SURVIVES | Not material; the historical OOD survival is invalidated. |
| Policy-set ceiling | SUPERSEDED | Perfect selector reaches 0.397 on HOLDOUT; the policy set is not competent. |
| False-selection harm | PARTIALLY_SURVIVES | Harm is not acceptable. |
| OOD stability | SUPERSEDED | No routing, risk or decision-rule gain is OOD-stable. |
| State-representation sufficiency | SUPERSEDED | Now decided: insufficient. |
| Spatial observability | SURVIVES | Spatial state is required. |
| Action semantics | SURVIVES | Action semantics are required. |
| Transition-prediction need | INVALIDATED | Not the first bottleneck; multistep prediction was not measured. |
| Prediction reliability | PARTIALLY_SURVIVES | No evidence-grounded reliability tier on the deployable contract. |
| Non-privileged predictor gap | SURVIVES | Stands. |
| Policy-quality bottleneck | SURVIVES | Policy quality is the primary bottleneck relative to selection. |
| Genuine relational value | SURVIVES | The negative result stands: no genuine relational value was measured. |
| Historical runtime-router reliability | NOT_RETESTABLE | The measured runtime no longer exists. |
| Authority | SURVIVES | R0. |

## Decision Evaluation Contract v1

The contract is `sentinel-decision-evaluation-contract-v1.json`, status `SPECIFICATION_ONLY`. It fixes how a future
predictive component is judged, before one exists. Its canonical rule is:

> LOWER FACTUAL PREDICTION LOSS DOES NOT IMPLY BETTER DECISION VALUE.

| Metric | Measures | Role |
| --- | --- | --- |
| FPE | Factual prediction error on the executed action. | Diagnostic |
| CAD | Counterfactual action discrimination: ordering of predicted consequences across legal alternatives. | Diagnostic |
| CR | Counterfactual regret from ranking alternative futures wrongly. | Ranks third |
| DDV | Downstream decision value: paired ablation of Prime with and without the component, on sealed HOLDOUT and OOD, against the inherited Stage 3F materiality bar. | Ranks first |
| TCA | Trust-conditioned advantage: DDV on cases a future World-Model Trust Gate admits. | Ranks second |

No world model may win the Stage 3I tournament solely by having the lowest reconstruction, latent or next-state loss.
FPE and CAD never decide a ranking on their own.

## Stage 3G inherited requirements (candidate, not adopted)

- **Required, levels undefined:** epistemic provenance. The E0–E5 scale is not defined in the repository; Stage 3G must
  define it before use.
- **Required:**
  - observable entity state;
  - actor- and action-relative spatial representation;
  - structured action semantics;
  - prediction lifecycle;
  - counterfactual discrimination;
  - counterfactual regret;
  - downstream decision value;
  - stage-wise failure attribution.
- **Planned:** World-Model Trust Gate; task-state contamination tracking.
- **Not evidence-supported, and excluded:**
  - a large learned world model;
  - JEPA deployment;
  - a generative world model;
  - Router 2.0;
  - Expert #10;
  - any authority increase.

## Freeze readiness

`READY_FOR_3F_FREEZE` requires all of the following:

- every exit criterion holds;
- every evidence binding holds;
- the predecessor chain reproduces byte for byte;
- the erratum is reconciled;
- the Decision Evaluation Contract was frozen in the plan commit;
- the full platform suite passes.

Weak policies and negative Router results do not block measurement-integrity completion.

`READY_FOR_STAGE3G` is always `false` here. It becomes eligible only after the separate formal Stage 3F freeze commit.

## Result

Certificate: `artifacts/stage3f6cr-confirmatory-reconciliation/stage3f6cr-certification-result.json`, status `PASS`.

Evidence and reproduction:

- All 138 evidence bindings hold.
- Every exit criterion holds, including ERRATUM_RECONCILED and DECISION_EVALUATION_CONTRACT_FROZEN.
- Predecessor reproduction:
  - Phase 0 ran all nine checks one at a time under the canonical runtime, and all were `BYTE_EXACT`: P.1C, P.1D,
    P.1E, T-SYM, P.1A-SYM, P.1-SYM, W-SYM, the D-SYM freeze and D-SYM.
  - The certifier's own clean-tree run reproduced W-SYM (the transitive gate), the D-SYM freeze and D-SYM
    `BYTE_EXACT`.
- Full platform suite: 2,265 passed, 0 failed, 1 skipped.

Conclusions:

- `STAGE3F_SCIENTIFIC_COMPLETE=true`.
- `READY_FOR_3F_FREEZE=true`.
- `READY_FOR_STAGE3G=false`.

The only remaining roadmap blocker is `FORMAL_3F_FREEZE_COMMIT_NOT_YET_MADE`.

Frozen hashes:

| Artifact | Hash |
| --- | --- |
| Plan | `c39db9ff1182720a2e39e216f433ea5755be4e050e3f7b24bf241735506b5e6e` |
| Claim map | `97e556f502ea42d818f1764e17314ef6cc6f435214ba52fd3a9680e897026350` |
| Decision Evaluation Contract v1 | `10c301884539c5cfb21d95795191217b98762a98aacfab8eab4207c87cbec90e` |
| Freeze commit | `890aa208ee08dec402f208629042fca7af1336c7` |

## Disclosed limitations

- The historical Stage 3F.6 certificate remains unreproducible from any commit: its certifier and test bytes were never
  committed. Its measurement sections are reproduced exactly under the pre-remediation runtime.
- The privileged Stage 3E runtime router and the reference World State baseline were not re-measured on fresh splits.
  Neither is inherited by Stage 3G.
- Multistep prediction was never measured. "Transition prediction is not required" means it is not the first
  bottleneck.
- The root AZL overlay suite and `sgrid-lab`'s node tests are outside Stage 3F. Their counts are recorded in the
  full-suite record as disclosed and non-gating, as in D-SYM.
- `scripts/stage3f6cr-certify.mjs` is a meta-certifier: it runs the Stage 3F chain (W-SYM, the D-SYM freeze, D-SYM), so
  it cannot also be a link in the chain.
  - Stage 3F-RP seals `scripts/reproducibility/stage3f-chain.mjs` and its chain-coverage test by hash. That test
    enumerates `certify-stage3f*` measurement certifiers and excludes the 3F-RP meta-certifier.
  - Registering 3F.6-CR in the chain would therefore break `stage3frp:check`. The certifier is instead named outside
    that pattern.
  - This stage's own tests assert that every measurement certifier remains covered by the chain.
  - The formal Stage 3F freeze should state the meta-certifier rule explicitly.
