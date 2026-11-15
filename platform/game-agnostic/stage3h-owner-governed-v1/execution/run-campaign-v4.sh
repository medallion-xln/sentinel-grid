#!/bin/sh
# Once-only chain for registration 7c41ba89 (owner execution authorization of 2026-10-21). Never weakens a gate:
# - waits until the 1-minute load is <= 2.2 for 3 consecutive minutes (stricter than the registered 2.5) before each launch;
# - a start refused by the runner preflight consumes nothing (no replication directory); only then is a later start tried
#   (at most 6 attempts per replication); a replication directory without LOCK.json means started and aborted: consumed, stop;
# - B is launched only if A wrote LOCK.json; the analysis only if both did. No retry of a started replication, ever.
set -u
L=/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/stage3h-owner-governed-v1
E=$L/evidence/execution-7c41ba89
R=$L/runs/7c41ba89c5c63489
log() { echo "$(date '+%Y-%m-%dT%H:%M:%S%z') $*" >> "$E/chain.log"; }
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
run_rep() {
  rep=$1; attempt=0
  while :; do
    wait_idle || { log "NOT_IDLE_WITHIN_8H_$rep (nothing consumed)"; return 2; }
    attempt=$((attempt + 1)); log "LAUNCH_$rep attempt=$attempt"
    caffeinate -i -s "$L/execution/launch-replication-v4.sh" run "$rep" >> "$E/$rep-run.stdout.log" 2>> "$E/$rep-run.stderr.log"
    rc=$?; log "EXIT_$rep rc=$rc"
    if [ -f "$R/$rep/LOCK.json" ]; then log "LOCKED_$rep"; return 0; fi
    if [ -d "$R/$rep" ]; then log "CONSUMED_ABORTED_$rep"; return 3; fi
    log "REFUSED_NOT_CONSUMED_$rep"
    [ $attempt -ge 6 ] && { log "REFUSED_MAX_ATTEMPTS_$rep"; return 4; }
  done
}
log "CHAIN_START"
run_rep A || { log "CHAIN_STOP_AFTER_A"; exit 1; }
run_rep B || { log "CHAIN_STOP_AFTER_B"; exit 1; }
caffeinate -i -s "$L/execution/launch-replication-v4.sh" analyse > "$E/analyse.stdout.log" 2> "$E/analyse.stderr.log"
rc=$?; log "EXIT_ANALYSE rc=$rc"; log "CHAIN_DONE"
exit $rc
