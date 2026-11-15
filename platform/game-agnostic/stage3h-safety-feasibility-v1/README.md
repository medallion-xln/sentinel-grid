# STAGE3H_DUAL_COMPARATOR_SAFETY_FEASIBILITY_V1

This DEV-only study asks whether a selector that sees only public observations and chooses between the frozen S0 and
Nexus comparators can have zero catastrophe introductions against both of them. The answer, with nine verified
witnesses, is no for that class. Results: `RESULT.md`.

## Boundaries

- No selector, model, training or tuning. No registration or campaign. No V4 row, outcome or analysis is read.
- **Base worlds** come from the spent DEV sets of `stage3h-failure-diagnosis-v1`: DEV288 and blocks 951/952. No new
  seed is consumed.
- **Twins** change only the frozen V2 generator's hidden draws, within the generator's own ranges. Each twin is then
  built by the frozen calibrated warm-up and native admission. A twin counts only if its full public view, digests
  excepted, equals the base view and both frozen arms decide identically.
- **Evaluator truth** is computed after every decision in an observation class is fixed, and is never a policy input.
- **DEV exclusion** is checked against the structured identity records, not repository text.

## Run order (plain `node`, from this directory)

1. `node baseline-check.mjs`
2. `node search.mjs <shard> <of>` for every shard (10 used)
3. `node analyse.mjs`
4. `node verify-witness.mjs`
5. `node assumption-check.mjs`

Every step needs the local `stage3h-failure-diagnosis-v1/dev-runs/`, regenerable as described in that lane's
`REPRODUCIBILITY.md`. Writers use exclusive `wx` creation.

## Closure (theorem audit)

`CLOSURE.md` audits the witnesses. It preserves them, checks their native-state admissibility and seeded reachability,
builds a structured exclusion ledger, and checks alternative actions. Scripts are in `closure/` and evidence in
`evidence/closure/`. Run order:

1. `node closure/inheritance.mjs`
2. `node closure/ledger.mjs <i> 10` for every shard, then `node closure/ledger-merge.mjs`
3. `node closure/admissibility.mjs`
4. `node closure/alternatives.mjs`
5. `node closure/manifest.mjs`
6. `node --test closure/tests.mjs`

`node closure/reproduce-witnesses.mjs` needs only committed evidence. The rebuilt ledger shards in `work/` are
gitignored.
