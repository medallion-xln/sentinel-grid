# Sentinel Safety Kernel — `SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V1`

An isolated **R0 advisory** component. Given a canonical public state, the complete lawful action menu and optional
advisory expert evidence, it returns a ranked menu and either a recommendation or an explicit abstention, with a
deterministic, hashable decision record. It never executes, dispatches or mutates anything, and it is not connected to
the certified Prime / Arbiter path. The model it ships with is labelled `NOT_QUALIFIED`; see `SK1_RESULT.md`.

```js
import { createRecommendationApi } from './api/recommend.mjs';
const api = createRecommendationApi({ game: 'forge' });
const r = api.recommend(canonicalPublicState, legalActions, advisoryEvidence);
// r.rankedActions, r.recommendedActionOrAbstention, r.uncertainty, r.safetyAssessment,
// r.evidence, r.decisionHash, r.sourceIdentity, r.authority
api.replay({ state, legalActions, advisoryEvidence }, r.decisionHash).reproduced; // true
```

Run the demonstration from a clean checkout: `node demo/demo.mjs` (or `node demo/demo.mjs abstain`).

## Layout

| path | role | may import |
|---|---|---|
| `kernel/` | the game-agnostic kernel: `contract`, `semantics` (A), `risk` (B), `ranking` (C), `record` (D), `index` | `node:crypto` only |
| `adapters/forge/` | Forge World adapter: derived public projection, features, evidence canonicalisation | kernel, `node:crypto` |
| `adapters/rescue/` | second-game adapter (reference grid rescue); no risk model | kernel |
| `api/` | host (model loading, source identity) and the recommendation API | kernel, adapters, `node:fs/path/url` in `host.mjs` only |
| `models/` | frozen model files | — |
| `infra/` | **evaluation side**: exclusion registry and loader, allocator, screen, pool, class builder, freeze, trainer, audit, runner | anything; never imported by the rows above |
| `analysis/`, `tests/`, `demo/`, `evidence/` | diagnosis, tests, demonstration, tracked records | — |
| `work/` | privileged local data (seeds, world hashes, evaluator truth) — gitignored | — |

`infra/graph-audit.mjs` enforces the import rule for the first four rows; `tests/graph.test.mjs` plants violations to
show it catches them.

## The four components

- **A — Native Action Semantics.** Every action in the menu is inspected. An action is excluded only by a hard
  constraint that is publicly established and deterministic. Unknown preconditions, uncertain effects and public hazards
  are carried as annotations; nothing is removed on an assumption about a hidden outcome.
- **B — Action Risk Estimation.** A bagged ensemble of shallow boosted trees estimates, per action, the probability of
  a catastrophe in at least one world consistent with the public state, and the expected regret. Each estimate has one
  status: estimated, or unsupported because of no model, missing information, a category never seen in development,
  or absent/invalid evidence. Numeric features outside the development envelope inflate the bound. A risk value is an
  empirical estimate, never a guarantee.
- **C — Safety-Constrained Ranking.** Public constraints, then support, then risk tier, then expected regret, then the
  risk bound. Actions exactly tied on all of these are returned together as one decision set; no id, handle, menu
  position or lexical order prefers one over another. If the best action is unsupported or its bound exceeds the
  frozen criterion, the kernel abstains.
- **D — Evidence and Explanation.** The decision record: observation contract, menu identity, the full ranking with
  per-action constraints, risk, uncertainty and reason codes, the recommendation or abstention, evidence status, model
  and source hashes, authority and epistemic status, and a deterministic decision hash.

## Reproducibility, stated exactly

- **From a clean checkout:** the kernel inference graph (12 files), its tests, the second-game tests, the demonstration
  and decision replay. Verified on a `git archive` export in `evidence/SK1_GATE0_INTEGRITY.json`.
- **Not from a clean checkout:** generating populations and running the evaluation. They call the frozen comparators,
  whose sources are custody-protected overlay files that are deliberately untracked, and they read privileged local data.
- **No independent backup exists** for this repository (`evidence/SK1_CUSTODY_MANIFEST.json`).

## Exclusions

`infra/exclusion-registry.json` lists every forbidden block and every sealed registry of earlier populations.
`infra/exclusions.mjs` `loadSk1Exclusions()` is the only way to obtain an exclusion context and it fails closed. Blocks
901–910 are spent observational evidence and 911–914 are retired; any later allocator must load this registry.

## Tests

`node --test tests/` — kernel behaviour and invariance, projection provenance, exclusion enforcement, inference-graph
audit, second-game adapter, runner negative controls. Tests that need privileged local data are skipped in a clean
checkout and say so.
