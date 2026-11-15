#!/bin/sh
# Operational launcher for registration 0364164c. Runs exactly one registered command with the bound runtime:
# plain `node campaign-v3.mjs <cmd>` with no flags. `exec` replaces this shell, so no wrapper process carries the
# runner's command line (the O-5 preflight treats any other matching node command line as a concurrent process).
set -eu
cd "$(dirname "$0")/.."
case "${1:-}" in
  run) [ "${2:-}" = A ] || [ "${2:-}" = B ] || exit 64 ;;
  analyse) ;;
  *) exit 64 ;;
esac
exec node campaign-v3.mjs "$@"
