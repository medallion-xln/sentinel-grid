# Standalone launch: registration 0364164c (once-only A then B)

Registration `0364164cb05e140da6265c89d830388b84dafed7ef5f3abf47ad6afb2833b01f` (commit `e009344c`) and its execution authorization (commit `885f803b`) are already in place. Nothing below changes the runner, protocol or thresholds.

## Verified on 2026-10-21

- A clean login shell (`env -i … zsh -lic`) resolves `node` to `~/.nvm/versions/node/v22.22.2/bin/node`, whose SHA-256 equals the bound runtime binary.
- The runner's own loaders accept the registration and the authorization for A and B, and the runtime identity matches.
- LingCode, Codex and Docker are not needed while the run is going.

## 1. Make the machine idle

Quit Google Chrome, the Codex app, Docker Desktop and any other heavy app. LingCode may be closed too. Let the Mac cool, and keep it on AC power. In Terminal, run this until the first number is 2.5 or lower:

```sh
sysctl -n vm.loadavg
```

## 2. Run once (about 3 hours)

Paste the block below into Terminal. B starts only if A wrote its LOCK, and the analysis starts only if both did. Do not use `cd`: the gvm shell override breaks it, and the launcher handles its own directory.

```sh
L=/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/stage3h-owner-governed-v1
E=$L/evidence/execution-0364164c
R=$L/runs/0364164cb05e140d
caffeinate -i -s "$L/execution/launch-replication.sh" run A >"$E/A-run.stdout.log" 2>"$E/A-run.stderr.log" \
&& test -f "$R/A/LOCK.json" \
&& caffeinate -i -s "$L/execution/launch-replication.sh" run B >"$E/B-run.stdout.log" 2>"$E/B-run.stderr.log" \
&& test -f "$R/B/LOCK.json" \
&& caffeinate -i -s "$L/execution/launch-replication.sh" analyse >"$E/analyse.stdout.log" 2>"$E/analyse.stderr.log"
echo "exit=$?"
```

While it runs, do not use the Mac heavily and do not start any other `node` program.

## 3. Read the outcome

- **`exit=0`.** Both replications are locked and the registered analysis is written to `runs/0364164cb05e140d/ANALYSIS.json`. Reopen LingCode and ask for the evidence dossier.
- **`exit` not 0, and the `runs` directory is missing.** The preflight refused, so nothing was consumed. The reason is the last `Error:` line in `A-run.stderr.log`.
- **`runs/…/A` exists without `LOCK.json`.** Replication A started and aborted, and it is consumed. Never rerun it. Report it as it stands.
- **A is locked but B's preflight refused.** B is not consumed. Wait until the machine is idle, then run only the B and analysis lines.
