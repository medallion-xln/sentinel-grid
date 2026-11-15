# STAGE 3H-SK1.1 — Phase 6: R0 engineering assurance

AUTHORITY: R0 (recommendations only) · STATUS OF EVERYTHING HERE: shadow mode, **NOT_QUALIFIED** · BASE HEAD `179922dd`

This phase hardens the engineering around the Safety Kernel. It changes no decision and supports no qualification claim.
The frozen SK1 kernel, adapters, API, model, thresholds, observations and results are untouched: the SK1 lane has no
uncommitted change, and `SK1_VALIDATION_RESULTS.json` (`239c16bc…`) and `SK1_EXPERIMENT_FREEZE.json` (`d22be2c4…`) are
byte-identical.

Machine record: `evidence/SK1_1_ENGINEERING_ASSURANCE.json` (written by `r0/record-assurance.mjs`).

## 1. What was built

`r0/assured-api.mjs` — `SK1_R0_ASSURED_API_V1_1`, a **pure envelope** around the frozen `api/recommend.mjs`.

- It imports the frozen API. It contains no ranking logic and no estimator, and substitutes nothing.
- The frozen decision record and its `decisionHash` are passed through unchanged (`env.record`, `env.decisionHash`).
- Everything it adds is a fail-closed check with a stable rejection code, or a derived read-only view.
- It can only withhold. A request is served with the frozen decision or refused; a decision is never altered.
- Its import closure is itself plus the twelve frozen inference files. No evaluator, population or label module is reachable.

```js
const api = createAssuredApi({ game: 'forge' });                       // verifies the pins, or refuses to construct
const env = api.recommend(state, legalActions, evidence, declarationFor('forge', evidenceSources));
env.record        // the frozen kernel's record       env.assurance   // checks, pins, provenance, views
api.replay(request, { decisionHash, envelopeHash });  api.verify(env);  api.describe();
```

**Equivalence.** All 600 frozen validation requests were replayed through the envelope: 600 served, 0 refused, 600 of 600
decision hashes, decision kinds and forced sets equal to the committed per-class record (304 recommend, 296 abstain).
This is replay of public requests; no outcome was read and no metric computed.

## 2. The twelve verification items

| # | item | status | tests |
|---|---|---|---|
| 01 | Complete legal-action-menu integrity | VERIFIED_IN_FROZEN_KERNEL | 3/3 |
| 02 | Explicit evidence-source provenance | VERIFIED_ONLY_WITH_V1_1_ENVELOPE | 3/3 |
| 03 | Risk versus deterministic safety separation | VERIFIED_IN_FROZEN_KERNEL | 2/2 |
| 04 | Unknown-state handling | **DEFECT_FOUND_NOT_PATCHED** (F3, F4) | 4/4 |
| 05 | Malformed expert evidence rejection | **DEFECT_FOUND_NOT_PATCHED** (F5) | 3/3 |
| 06 | Stable action semantics | VERIFIED_IN_FROZEN_KERNEL | 1/1 |
| 07 | Deterministic tie handling | VERIFIED_IN_FROZEN_KERNEL (note F7) | 3/3 |
| 08 | Confidence and uncertainty serialization | VERIFIED_IN_FROZEN_KERNEL | 3/3 |
| 09 | Decision-hash reproduction | VERIFIED_IN_FROZEN_KERNEL | 2/2 |
| 10 | Refusal of execute/mutate requests | **DEFECT_FOUND_NOT_PATCHED** (F1, F2) | 2/2 |
| 11 | Fail-closed contract-version mismatch | VERIFIED_ONLY_WITH_V1_1_ENVELOPE | 2/2 |
| 12 | Output labels reflect NOT_QUALIFIED | **DEFECT_FOUND_NOT_PATCHED** (F6, F8) | 3/3 |

Plus 10 supporting tests: pinning (4), negative controls (4), equivalence (2). **41 tests, 41 pass** in the working tree.
In an export of the committed SK1 lane plus `r0/`, 40 pass and the 600-class replay is skipped with an explicit message.

"DEFECT_FOUND_NOT_PATCHED" means the frozen kernel does not fully meet the item on its own. Each defect has a test that
reproduces the frozen behaviour and a test that the envelope refuses the same input.

## 3. Findings against the frozen kernel

None was patched. None is triggered by any of the 600 validation requests, so no SK1 result depends on them.

| id | finding | exact reproducing input | frozen behaviour | envelope |
|---|---|---|---|---|
| F1 | Execution-request scan is exact and case-sensitive; unknown options are ignored | `recommend(s, a, e, { Execute: true })`, also `executeAction`, `doDispatch`, `autoApply`, `mutation`, `commitAction`, `perform`, `run`, `enact`, `{ tau: 0.9 }` | accepted, same decision hash. Nothing is executed: no such code path exists | `EXECUTION_OR_MUTATION_REQUESTED` / `UNKNOWN_DECLARATION_KEY` |
| F2 | Privileged-field scan is exact and case-sensitive | `state.projection.actor.world_hash = 1`, also `Truth`, `WorldHash`, `hidden_health`, `Seed`, `groundTruth`, `evaluatorTruth` | accepted; the decision set is unchanged because the field is never read | `PRIVILEGED_FIELD_IN_REQUEST` |
| F3 | Out-of-vocabulary action type or entity kind gets a supported estimate | `legalActions[0].type = 'TELEPORT'` or `nodes[t].kind = 'WORMHOLE'` | `riskStatus: ESTIMATED` | `INPUT_OUTSIDE_ADAPTER_VOCABULARY` |
| F4 | Absent public fields are silently imputed; `projection.version` is not compared | delete `projection.terrainCounts`, `history.channels`, `action.destTerrain`, or a flag on an untargeted entity | estimates stay `ESTIMATED` (zero hazards, no history, flag false) | `REQUIRED_PUBLIC_FIELD_MISSING` / `OBSERVATION_CONTRACT_MISMATCH` |
| F5 | Evidence validator ignores the expert `kind` and unknown extra fields | `evidence.experts.S0.kind = 'ORACLE_ROLLOUT'` or `S0.handles = ['E7']` | `evidence.status: VALID`, evidence used | `MALFORMED_EVIDENCE` |
| F6 | Model loader accepts any self-consistent file; the label and criterion come from it | copy the model, set `qualification.status = 'QUALIFIED'`, `ranking.tau = 1`, recompute `modelHash`, pass as `modelPath` | served, labelled `QUALIFIED`; the abstain fixture becomes a recommendation | `MODEL_PIN_MISMATCH` at construction |
| F7 | `representative` is a listing artefact when a decision set holds distinct actions | a model scoring all actions equally, on the synthetic projection | the whole set is returned and flagged, but `representative` still names one | `assuredRepresentative: null` |
| F8 | The API host files are outside the source identity in a record | read `api/host.mjs` | a host-layer change does not change `sourceIdentity` | all twelve inference files compared with the freeze |
| F9 | `legalActionMenu.identity` is not D4-invariant (informational) | `frameProjection(P, 'R90')` | decision and estimates identical, menu identity differs | passed through |

**Fixes that would change SK1 policy behaviour: F3, F4, F5.** Correcting them inside the kernel changes what the policy
returns for the affected inputs, so it cannot be done under the SK1 identity. They are isolated under the prospective
name `SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V1_1_CANDIDATE`, which is **not implemented** and carries **no qualification
claim**. A corrected kernel would be a new source and model identity and would need its own fresh, pre-registered
evaluation. F1, F2, F6, F7 and F8 do not change a decision, but any edit to the frozen files would break the frozen
runner's hash binding, so they are covered by the envelope instead.

## 4. What the envelope adds

- **Source pinning.** The twelve inference files, the model file hash, `modelHash`, ranking parameters and the
  qualification label must equal the identities in `SK1_EXPERIMENT_FREEZE.json`, or the API refuses to construct.
  The pins are literals, checked against the freeze record by a test.
- **Explicit contract declaration.** Every call states API version, request contract, observation contract, evidence
  contract and `mode: 'RECOMMEND'`. A missing or mismatching declaration, or an unknown key, is refused before the kernel runs.
- **Hardened key scans.** Keys are normalised and matched on stems, so case variants and compound names are refused.
- **Public-state completeness.** Out-of-vocabulary types and kinds, silently imputed fields and unknown extra fields are refused.
  Missing fields the frozen kernel already reports still pass through to its abstention.
- **Evidence policy.** Absent evidence passes through (the frozen kernel abstains). Structurally malformed evidence is refused.
  Evidence the frozen validator does not rate `VALID` is refused rather than served as an abstention.
- **Evidence provenance.** A declared producer per expert, the contract, the validation status and an evidence digest.
  It is marked `DECLARED_BY_CALLER_NOT_AUTHENTICATED`: the envelope cannot prove who produced the evidence.
- **Output checks on every response.** Decision-hash integrity (also after a JSON round trip), complete menu, decision inside
  the menu, abstention selects nothing, labels, authority, finite and in-range numbers, inputs not mutated.
- **Separated view.** Deterministically established constraint outcomes, empirical estimates, and unsupported or unknown
  items in three disjoint sections. No estimate is worded as an established property.
- **Uncertainty summary.** Margin to the frozen criterion, distance to the nearest tier boundary, gap to the next ranked
  alternative. The bound is labelled `HEURISTIC_UPPER_BOUND_NOT_A_CALIBRATED_CONFIDENCE_INTERVAL`.
- **Replay and offline verification** of both the decision hash and the envelope hash.
- **Explicit refusals.** `execute`, `dispatch`, `mutate`, `apply`, `commit` and `act` exist only to throw
  `EXECUTION_OR_MUTATION_REQUESTED`.

## 5. What it does not do

- It does not change, retrain, re-threshold or replace the SK1 policy or model. There is no new estimator.
- It does not make SK1 qualified. Every response is labelled R0, shadow mode, recommendation only, NOT_QUALIFIED.
- It does not authenticate evidence producers. Provenance is a declaration.
- It verifies files at construction; it does not protect against a file changing between that check and module load.
- It was not evaluated: no world was generated, no outcome read, no validation run. Equivalence is hash replay only.
- It is not connected to the Prime / Arbiter path and cannot dispatch or mutate anything.
- It is stricter than the frozen API: some requests the frozen kernel would answer with an abstention are refused.

## 6. How to run

```
cd platform/game-agnostic/stage3h-sk1-1-assurance-v1
/opt/homebrew/bin/node --test r0/*.test.mjs          # 41 tests; the 600-class replay needs the local class records
/opt/homebrew/bin/node r0/equivalence.mjs            # replay summary, writes nothing
/opt/homebrew/bin/node r0/record-assurance.mjs       # print the record; add --write to rewrite the evidence file
```
