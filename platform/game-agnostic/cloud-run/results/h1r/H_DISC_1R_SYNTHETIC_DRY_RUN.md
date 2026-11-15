# H-DISC-1R — Synthetic end-to-end dry run (Phase 6)

**STATUS: PASS 56/56 on the inference side and SK1 representation. Step 8 (report generation) NOT_EXECUTED here. Engineering readiness only; not Mac-verified.**

## Run

| Item | Value |
|---|---|
| Environment | cloud, Node v26.7.0, linux-x64 (not the pinned darwin-arm64) |
| Script | `dry-run.mjs` (sha256 `45f6905c…`), outside the repository; imports repository modules read-only |
| Inputs | the two tracked SK1 public demo fixtures: `forge-request-recommend.json` (`d20d58c0…`) and `forge-request-abstain.json` (`86e88587…`) |
| Labels | `SYNTHETIC_LABEL_RULE_V1`: an action is labelled unsafe iff its type is WAIT or RETREAT. Explicitly synthetic; not evaluator truth. |
| Parameters | fitted by `campaign/learner.mjs` `fit()` on the synthetic labels, origin `SYNTHETIC_MATHEMATICAL_WITNESS`, config 3 bags × 20 trees × depth 3. M2 (additive) `a83cabd4…`, M3 (pair) `d685d540…` |
| Inference source hash | `83dbd6125f13…`, equal to the committed audit's `H_DISC_1_SOURCE_HASH` |
| Not used | no world, population, evaluator, learned parameter or spent validation data; nothing written to the repository |

**Reproduce:**

```sh
node dry-run.mjs <repo>/platform/game-agnostic
```

## Results by step

| # | Step | Checks | Result |
|---|---|---|---|
| 1 | Public observation enters the adapter (`STAGE3H_PUBLIC_DECISION_INFORMATION_V1/HW1_PUBLIC_PROJECTION_V1`) | 2 | PASS |
| 2 | The complete legal menu is preserved (7 and 10 actions, all encoded) | 2 | PASS |
| 3 | Only lawful information: `seed`, `worldHash`, `evaluatorLabel`, `hiddenHealth` in the state, and an `outcome` on an action, are all refused before computation | 5 | PASS |
| 4 | Pairwise comparisons: P(i,j)+P(j,i)=1 on every supported pair (42 and 90 ordered pairs), none withheld; the M3 pair model has a cross-action path | 5 | PASS |
| 5 | Deterministic menu ranking: identical record on repeat; identical decision digest when the menu **and** the S0 evidence are permuted together; the candidate kernel preserves the top set | 13 | PASS |
| 6 | Uncertainty and abstention: the untrained discriminator abstains with `DISCRIMINATOR_NOT_TRAINED` and the full menu; trained-synthetic records carry flags, bag count, margin and cycle flags | 6 | PASS |
| 7 | Frozen comparators unchanged: SK1 `modelHash` = protocol pin `b479972a…`; SK1 recommends and abstains deterministically on the two fixtures | 3 | PASS |
| 8 | Report generation covers the registered schema | — | **NOT_EXECUTED**: `evaluate.mjs` and `analysis.mjs` need the protected `stage3h-canonical-v1/adapters.mjs`. Static coverage is in `H_DISC_1R_IMPLEMENTATION_REVIEW.md`: the primary is covered; secondary, pairwise and mechanism reporting are not |
| 9 | Execution and mutation refused: `execute`/`dispatch`/`mutate` on the API, the discriminator and the candidate kernel, plus `compare(…,{mode:'EXECUTE'})`; `canDispatch` and `canMutateLiveWorld` false on every record | 11 | PASS |
| 10 | Outputs bind to source identities: source hash and parameters hash on every record; replay reproduces the decision and record hash; synthetic parameters refused in `R0_ADVISORY` mode | 9 | PASS |

## Corrections made during the run (my test errors, not code defects)

1. **SK1 model check.** My first check compared the model *file's* sha256 (`683ce6e0…`) with the protocol pin. The pin is the model's internal `modelHash` field, which matches.
2. **Menu-reversal check.** My first check reversed the menu but not the index-aligned S0 evidence, and the decision changed. Every feature that changed was an `ev.s0.*` feature. With evidence and menu permuted together, the digest is invariant. The underlying observation is recorded in the implementation review: evidence is matched to actions by position only.

## Still to do on the Mac

- Rerun this script with the pinned runtime.
- Exercise step 8 with the overlay present. `analysis.test.mjs` and `boundaries.test.mjs` then load; the evaluator itself needs a 900-class validation population, so its full path can only run on synthetic classes built for the purpose, which would need separate authorization.
