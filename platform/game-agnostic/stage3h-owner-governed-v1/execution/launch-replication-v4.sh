#!/bin/sh
# Operational launcher for registration 7c41ba89. Runs exactly one registered command with the bound runtime:
# plain `node campaign-v4.mjs <cmd>` with no flags and no NODE_OPTIONS. `exec` replaces this shell, so no wrapper process
# carries the runner's command line (the O-5 preflight treats any other matching node command line as a concurrent process).
set -eu
cd "$(dirname "$0")/.."
case "${1:-}" in
  run) [ "${2:-}" = A ] || [ "${2:-}" = B ] || exit 64 ;;
  analyse) ;;
  *) exit 64 ;;
esac
exec env -u NODE_OPTIONS node campaign-v4.mjs "$@"
