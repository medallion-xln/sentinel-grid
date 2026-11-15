# ASCII Worlds 2.1 — local diagnostic suite

This is a separate temporal-control experiment over unchanged ASCII Worlds 2.0 physics. It is not certified Sentinel Prime, nine-expert synthesis, Stage 3H certification, or a learned world model. Authority stays R0; dispatch, live-world mutation, online learning and live promotion remain disabled.

## Run the ASCII UI

From the game-agnostic workspace:

```sh
cd /Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic
node ascii-suite/v21/server.mjs
```

Open <http://127.0.0.1:4175/>. Select a world and observation condition, choose **Temporal task V3**, reset, and play. V2 is the frozen task-controller comparison, not canonical Prime. Fighter has six stronger opponent styles; both sides use the selected observation timing. The original v2 UI/server on port 4174 is unaffected. Stop this server with Ctrl-C when finished.

The full-screen ASCII view includes a compact timing/provenance panel. Ground-truth rendering is UI-only; the task controller receives the immutable, potentially impaired observation packet, not that rendering state. Estimates and predictions are provisional, outside authoritative E0/E1/E2. At a terminal outcome, the UI reports NO_ACTION_TERMINAL.

Export downloads a forensic JSON replay containing packets, decisions, applied-action feedback, initial state and every transition hash. Replay it locally:

```sh
node ascii-suite/v21/replay.mjs /absolute/path/to/exported-replay.json
```

The same command accepts compressed experiment traces ending in `.json.gz`.

## Verify

```sh
node --test ascii-suite/suite.test.mjs ascii-suite/v21/temporal.test.mjs ascii-suite/v21/server.test.mjs tests/stage3g-freeze.test.js
node ascii-suite/v21/freeze.mjs
```

The frozen read-only Stage 3F and canonical Stage 3G certificate reproductions were separately performed; the protected baseline manifest includes the old task sources, reports and prior Stage 3H artifacts. This program does not revise their conclusions.

## Evidence and reproducibility

`registration.json` freezes source, physics fixtures, budgets, statistical rules, materiality/regression limits and fresh seed families before final evaluation. `plan.mjs` contains those rules. `evaluate.mjs` executes the fixed matrix, writes each trace before its summary, verifies every world transition, and can resume an interrupted run only with the same registration and job identity. It refuses changed frozen source. Never overwrite a completed evaluation to retune outcomes.

```sh
node ascii-suite/v21/evaluate.mjs
node ascii-suite/v21/report.mjs
```

The completed report is `RESULTS.md`; the required structured output and machine-readable analysis are under `results/`. Main comparisons use two independent 16-seed families; smaller adversary, grid, ablation and shift subsets are explicitly exploratory. Confidence intervals cluster repeated slots/styles by seed. Fresh generator layouts and bounded parameter shifts are not structural OOD.

Phase 0 and all development attempts are retained. An initial held-out attempt was stopped for asymmetric requested-versus-applied opponent action feedback. Its source and partial records remain in `results/aborted-heldout-v1`; both initial seed families were retired. The replacement uses fresh 151001/161001 families with unchanged claim criteria. The 141001-series future reserve remains untouched.

## Boundaries and limitations

- Deterministic estimates use timestamps, observed changes, actual applied actions, published physics and explicit model-assumption intervals. They are not learned predictions or guaranteed coverage bounds.
- Estimation is bounded to 12 ticks; observation transport conditions are separately declared. Missing or repeated frames are not independent new evidence.
- Pong remains filter-only by default. Shot selection is a separately registered experimental candidate and does not become the default merely because its rationale sounds plausible.
- Fighter styles use legal existing moves and simultaneous unchanged physics. Grappling is not invented. Style response logs do not themselves prove useful adaptation.
- Racing retains the 18-column road and same-physics rivals. All four grid positions are paired. Memory/racecraft claims require episode evidence, not forced failures.
- True counterfactual regret and inherited scientific DDV/FPE/CAD/CR/TCA are not established. The old one-step proxy is not relabeled as true regret.
- Net heap change is not total memory allocation. Timing is local diagnostic timing, not a production real-time guarantee. Planner simulation counts and their bounds are labeled separately.
- No canonical expert competence, live runtime promotion, Router 2.0, Expert 10, or next roadmap stage is authorized by these results.

Implementation and preview remain local; no site was published.
