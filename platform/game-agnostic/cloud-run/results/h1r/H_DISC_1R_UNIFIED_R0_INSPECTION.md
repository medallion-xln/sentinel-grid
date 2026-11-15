# H-DISC-1R — Unified R0 decision-inspection design (Phase 7)

**STATUS: DESIGN DRAFTED; SYNTHETIC DEMO RUNS (2 fixtures). No certified path changed; nothing deployed.**

## Principle

The inspection record **displays** each component's own output side by side. It must not:
- compute a combined score;
- pick an action;
- attribute a decision to a component that no certified path binds to the request.

It also never shows inactive experts as operational: every roster member gets an explicit status with its source.

## What is actually connected today

| Component | Interface | Bound to Forge public requests? | Certification |
|---|---|---|---|
| SK1 | `stage3h-sk1-safety-kernel-v1/api/recommend.mjs` / `host.mjs` `loadForgeKernel()` | yes | `NOT_QUALIFIED` (classification B) |
| H-DISC-1 | `api/discriminator-api.mjs`; `api/candidate-kernel.mjs` (SK1 V2 candidate) | yes | `NOT_TRAINED` (always abstains) |
| Nexus, S0 | advisory evidence under `SK1_ADVISORY_EVIDENCE_V1` | yes, as features only | — |
| Prime | `src/prime/root-puct.js` `recommend()` | **no**: it needs simulator successors | Stage 2 lineage |
| Arbiter | Stage 2L5–2L10 lab modules | **no**: it arbitrates NEXUS/ORACLE attestations in the ZekNova shadow path | Stage 2L10 certified, shadow only, `finalRecommendationOwner: PRIME`, real decision delta not measured |
| Oracle, Vanguard, Horizon, Archimedes, Alexandria, Picasso, Forge | — | no | see the roster |

## Inspection record: `SENTINEL_R0_DECISION_INSPECTION_RECORD_V1_DRAFT`

| Field | Meaning | Rule |
|---|---|---|
| `request` | observation contract, menu (index, type), request hash | from SK1's `requestHash`; the menu is shown complete |
| `decisionOwner.actual` | who actually decides | `HUMAN_OWNER` unless a certified path binds this request; then name that path |
| `selectedAction.actual` | the action actually taken | `null` for inspection; only an authorized executor may fill it |
| `advisoryEvidence` | S0 top and scores, Nexus type, reason and codes, agreement | shown raw; never merged |
| `components[]` | one entry per component: `role` ∈ {FROZEN_R0_RECOMMENDATION, UNTRAINED_CANDIDATE_SHADOW, SHADOW_RECOMMENDATION, NOT_APPLICABLE_TO_THIS_REQUEST, NOT_CONNECTED_TO_THIS_REQUEST}; `output` or `null`; `uncertainty`; `certification`; `sourceIdentity`; `authority`; `decisionHash` | each output is the component's own record, unmodified |
| `experts{}` | all nine with a status ∈ {PRESENT_AS_ADVISORY_EVIDENCE, NOT_PRESENT, NOT_APPLICABLE, NOT_IMPLEMENTED}, a detail and a source | read from `stage3h-ascii-competence-v1/evidence/expert-applicability.json` and the request; the roster must equal nine |
| `disagreement` | S0 top type, Nexus type, SK1 decision types, H-DISC decision | descriptive only |
| `notComputed` | an explicit list: combined score, consensus action, per-expert contribution weight | per-expert contribution weights do not exist in the current code |
| `authority` | R0, `canDispatch:false`, `canMutateLiveWorld:false`, and the path-unchanged flags | the demo throws if any component reports otherwise |
| `recordHash` | sha256 over the canonical record | for replay |

## Synthetic demonstration

- **Script:** `inspect-demo.mjs`, kept outside the repository; it only reads the repository.
- **Run:** `node inspect-demo.mjs <repo>/platform/game-agnostic recommend|abstain [--json]`.
- **Recommend fixture:**
  - SK1 recommends MOVE (risk 12.2 %, upper bound 15.5 %), NOT_QUALIFIED;
  - H-DISC abstains (`DISCRIMINATOR_NOT_TRAINED`);
  - S0's top is MOVE and Nexus prefers PROTECT, so the experts disagree;
  - Prime is not applicable and the Arbiter is not connected;
  - the owner decides; recordHash `2575d9ab…`.
- **Abstain fixture:** SK1 abstains (`ABSTAIN_NO_ACTION_MEETS_RISK_CRITERION`) and H-DISC abstains, so no component recommends anything.

## Next design steps (not done here; each needs authorization)

1. **Bind evidence to the menu identity.** Carry `legalActionMenu.identity` and per-action keys alongside the S0 scores, so the view can detect misaligned evidence.
2. **Add an Arbiter adapter only if the Arbiter is later bound to this observation contract under its own certification.** Until then the record shows NOT_CONNECTED.
3. **Make it a read-only view.** It could sit in the existing R0 observatory server (same `prohibitedCapabilities`). No new dashboard has been deployed.
