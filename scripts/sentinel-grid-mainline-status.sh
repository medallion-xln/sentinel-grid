#!/usr/bin/env bash
# Mainline status report.
#
# Stage 2M: this script used to hardcode one developer's Desktop layout for both
# repositories. The Sentinel root is now derived from where this script actually
# lives, and the ZekNova root must be declared. Nothing is searched for and
# nothing is guessed: an unset ZEKNOVA_ROOT is reported as an unset binding, not
# as a missing file several layers down.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SENTINEL_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${ZEKNOVA_ROOT:-}" ]]; then
  echo "ZEKNOVA_ROOT is not set. ZekNova-dependent status cannot be reported without an explicit binding; it is never inferred." >&2
  echo "  export ZEKNOVA_ROOT=/path/to/zeknova-shared-gaming-experience" >&2
  exit 2
fi
if [[ ! -d "${ZEKNOVA_ROOT}" ]]; then
  echo "ZEKNOVA_ROOT points at ${ZEKNOVA_ROOT}, which is not a directory." >&2
  exit 2
fi

exec node "${SENTINEL_ROOT}/integration/status.mjs" \
  --sentinel "${SENTINEL_ROOT}" \
  --zeknova "${ZEKNOVA_ROOT}" \
  "$@"
