# Stage 3H H-DISC-0 — within-menu action safety discrimination: design and readiness

AUTHORITY: R0 (recommendations only) · BASE HEAD `eb75dff8` · research preparation, not scientific execution.

This lane specifies a new policy component, drafts a pre-registration, and prepares the infrastructure a future
campaign would need. **No model was trained, no world generated, no population allocated, no validation or holdout
run.** Earlier results are untouched: SK1 stays classification B and not qualified; SK2-F stays classification B.

The hypothesis under design:

> A public-information, within-menu action-risk discriminator can reduce catastrophe introductions compared with
> frozen SK1 by learning relative safety differences among the actions available in the same decision state.

It is a hypothesis. Nothing here shows it is true, and nothing here is an H-DISC performance result.

## Deliverables

| file | content |
|---|---|
| `H_DISC_0_FAILURE_MECHANISM.md` | what existing evidence establishes about why SK1 fails, by kind of statement; what it cannot distinguish |
| `H_DISC_0_ARCHITECTURE.md` | `SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1`: comparator, label, ranking and integration contracts |
| `H_DISC_0_PREREGISTRATION_DRAFT.md` | draft for a future `H-DISC-1`: arms, matched controls, endpoints, decision rule, one-pass protocol |
| `H_DISC_0_STATISTICAL_PLAN.md` | exact power for the paired primary test; why 600 classes is short; recommended scale |
| `H_DISC_0_SOURCE_AND_EXCLUSION_READINESS.md` | portable exclusion loader, evidence bundle, backup acceptance, custody status |
| `H_DISC_0_CAMPAIGN_GO_NO_GO.md` | inheritance verification, the seven-condition entry gate, design disposition |

## Layout

| path | role | needs privileged local data? |
|---|---|---|
| `analysis/design-evidence.mjs` | mechanism evidence, pairwise baselines, exact power; tracked evidence only | no |
| `contract/pairwise-contract.mjs` | executable contract reference: no model, no game feature, no import | no |
| `inheritance/` | verification of inherited results, custody and identities | partly |
| `readiness/exclusions/` | portable exclusion loader reading tracked records only | no |
| `readiness/bundle/` | evidence-bundle manifest and verification tool | manifest building only |
| `readiness/campaign-entry-gate.mjs` | mechanical GO / NO-GO for a future campaign | partly |
| `evidence/` | tracked machine records; identities and aggregates only | — |

## Run

```
cd platform/game-agnostic/stage3h-hdisc0-design-v1
node --test analysis/*.test.mjs contract/*.test.mjs
node --test readiness/exclusions/*.test.mjs readiness/bundle/*.test.mjs readiness/*.test.mjs inheritance/*.test.mjs
node analysis/design-evidence.mjs check
node readiness/campaign-entry-gate.mjs
```

Pass test files as globs, not as a bare directory.

## Rules for anyone continuing

- Training and validation of H-DISC are **not authorized**. A campaign needs a frozen pre-registration, a GO from the
  entry gate and separate owner authorization.
- The contract reference is a design artefact. Synthetic fixtures passing its tests show the contract can be checked;
  they show no learned competence.
- An evaluator-safe action existing in a menu is not evidence that public information can identify it.
- A supported relative improvement over SK1 is not qualification. Contract A (zero introductions, full coverage) is
  unchanged. The selective contract is a draft, neither adopted nor certified.
- SK1 VALIDATION is spent. The 83 H-W4 and 39 SK1 failing classes informed the design and are not validation material.
- Planning values (baseline rate, design effect, failure association) must be re-estimated on fresh exploration data.
- Do not add or change files under the SK1 lane's `kernel/`, `adapters/`, `api/` or `infra/`.
