#!/bin/sh
# Continuation for registration 7c41ba89 when run-campaign-v4.sh ended without starting B (no idle window). Never invokes
# replication A. Refuses unless A wrote LOCK.json with no ABORT record and B has never started. Same idle gating as the
# original chain (load <= 2.2 for 3 consecutive minutes, stricter than the registered 2.5); a start refused by the runner
# preflight consumes nothing; a B directory without LOCK.json means started and aborted: consumed, stop. Then the analysis.
set -u
L=/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/stage3h-owner-governed-v1
E=$L/evidence/execution-7c41ba89
R=$L/runs/7c41ba89c5c63489
log() { echo "$(date '+%Y-%m-%dT%H:%M:%S%z') $*" >> "$E/chain.log"; }
[ -f "$R/A/LOCK.json" ] && [ ! -e "$R/A/ABORT.json" ] || { log "CONTINUE_B_REFUSED_A_NOT_LOCKED"; exit 1; }
[ ! -e "$R/B" ] || { log "CONTINUE_B_REFUSED_B_ALREADY_STARTED"; exit 1; }
wait_idle() {
  n=0; t=0
  while [ $t -lt 480 ]; do
    l=$(sysctl -n vm.loadavg | awk '{print $2}')
    if awk -v l="$l" 'BEGIN { exit !(l <= 2.2) }'; then n=$((n + 1)); else n=0; fi
    log "load1=$l idleMinutes=$n"
    [ $n -ge 3 ] && return 0
    sleep 60; t=$((t + 1))
  done
  return 1
}
log "CHAIN_CONTINUE_B_START"
attempt=0
while :; do
  wait_idle || { log "NOT_IDLE_WITHIN_8H_B (nothing consumed)"; log "CHAIN_STOP_AFTER_B"; exit 1; }
  attempt=$((attempt + 1)); log "LAUNCH_B attempt=$attempt"
  caffeinate -i -s "$L/execution/launch-replication-v4.sh" run B >> "$E/B-run.stdout.log" 2>> "$E/B-run.stderr.log"
  rc=$?; log "EXIT_B rc=$rc"
  if [ -f "$R/B/LOCK.json" ]; then log "LOCKED_B"; break; fi
  if [ -d "$R/B" ]; then log "CONSUMED_ABORTED_B"; log "CHAIN_STOP_AFTER_B"; exit 1; fi
  log "REFUSED_NOT_CONSUMED_B"
  [ $attempt -ge 6 ] && { log "REFUSED_MAX_ATTEMPTS_B"; log "CHAIN_STOP_AFTER_B"; exit 1; }
done
caffeinate -i -s "$L/execution/launch-replication-v4.sh" analyse > "$E/analyse.stdout.log" 2> "$E/analyse.stderr.log"
rc=$?; log "EXIT_ANALYSE rc=$rc"; log "CHAIN_DONE"
exit $rc
