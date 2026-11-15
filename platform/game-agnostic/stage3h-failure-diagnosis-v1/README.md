# STAGE3H_FAILURE_DIAGNOSIS_V1

Development-only diagnosis of the three criteria that failed in the completed Stage 3H V4 owner-governed campaign
(registration `7c41ba89…`, evidence commit `e46329cc`). This lane runs no sealed campaign and activates no registration.
It does not reanalyse V4.

## Boundaries

- **V4 is read for two things only.** `adjudicate.mjs` reads git metadata and the dossier's published aggregate values.
  `run-dev.mjs` reads the `worldHash` field of the V4 ledgers, to exclude identical worlds from the fresh DEV
  populations. No V4 row, `ANALYSIS.json` content or per-world outcome is opened.
- **Frozen code is imported, never edited.** This covers the generator, warm-up, validator, S0, Nexus, `selectSets`, the
  O-2R.1 identity view, the evaluator and the registered bootstrap.
- **Policies see only the public view.** Evaluator truth for a world is computed after every decision for that world
  (original, IDENTITY twin, controls) has been locked. Truth is used only for offline scoring and is never a policy
  input.
- **All results are development evidence.** The registered 0.02 thresholds and family sizes are reused only to describe
  DEV panels. Nothing here qualifies anything.

## World populations (all DEV)

| Set | Source | Use |
|---|---|---|
| DEV288 | `stage3h-canonical-v1/plan.mjs` (the six OPEN seeds, already evaluated in development) | mechanism localisation, D4 contrast |
| FRESH_EXPLORE | block 951 (`951000000000 + k`), frozen V3 population design, 12,768 scheduled | exploration; all fitted choices |
| FRESH_CHECK | block 952 (`952000000000 + k`), same design, 12,768 scheduled | held-out check of exploration choices |

Blocks 951 and 952 were free of prior seeds and of repository text before use. They are now **spent for development**.
A future confirmatory registration must exclude them and the world hashes in `dev-runs/`.

## Scripts

| Script | Phase | Output |
|---|---|---|
| `adjudicate.mjs` | 1 | `evidence/ADJUDICATION_7c41ba89.json` (verifies the 57 tracked V4 evidence files are byte-identical to `e46329cc`) |
| `run-dev.mjs <set> <shard> <of>` | 2–4 data | `dev-runs/<set>/shard-*.jsonl` (one row per world: decisions, twin and control decisions, validity probes, public descriptors, evaluator utilities) |
| `d4-contrast.mjs` | 2 | `evidence/d4-contrast-DEV288.json` |
| `h2-mechanism.mjs <set>` | 3 | `evidence/h2-mechanism-<set>.json` (catastrophe reward decomposition and public-equivalent hidden-health twins) |
| `selector-study.mjs [resamples]` | 2–5 | `evidence/selector-study-r<resamples>.json` (candidate selectors from `candidates.mjs`, best-of decomposition, partition floors, H2 guard search, risk AUCs) |
| `phase5-feasibility.mjs` | 5 | `evidence/phase5-feasibility.json` (identity-free selector and comparator, held-out FRESH_CHECK) |

Writers use exclusive `wx` creation. Run them with plain `node` from this directory. Results: `RESULT.md`.

`dev-runs/` (81 MB of raw per-world rows) is gitignored; only `evidence/` is committed. To regenerate it, run
`run-dev.mjs` for DEV288 (1 shard) and for each fresh set (5 shards), about 15 minutes in parallel on 10 cores. Every
row field is deterministic except the per-row `ms` timing. The shard hashes in `RESULT.md` are of the original run,
timing included, so a regenerated run matches them only after `ms` is removed.

That limitation is resolved additively in `REPRODUCIBILITY.md` and `evidence/reproducibility/`. They provide:

- raw and normalized hashes for every run record, under a declared normalization contract (`repro/normalize.mjs`);
- a clean-clone regeneration at `38f7c1d6` with the authorized protected-source overlay, which passed;
- a checksummed raw archive in `archive/`, gitignored and on the same disk, so not an independent copy;
- the committed DEV world identities that keep blocks 951 and 952 excluded.

A clean clone needs `stage3h-owner-governed-v1/registration/protected-source-package-d8a44ebd.tar.gz` (sha256
`ecfc7016…`, not committed) extracted into `platform/game-agnostic/`.
