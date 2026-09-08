#!/usr/bin/env bash
# Mainline verifier.
#
# Stage 2M: roots are derived and declared rather than hardcoded. See
# sentinel-grid-mainline-status.sh for the reasoning.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SENTINEL_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${ZEKNOVA_ROOT:-}" ]]; then
  echo "ZEKNOVA_ROOT is not set. ZekNova-dependent verification cannot run without an explicit binding; it is never inferred." >&2
  echo "  export ZEKNOVA_ROOT=/path/to/zeknova-shared-gaming-experience" >&2
  exit 2
fi
if [[ ! -d "${ZEKNOVA_ROOT}" ]]; then
  echo "ZEKNOVA_ROOT points at ${ZEKNOVA_ROOT}, which is not a directory." >&2
  exit 2
fi

cd "${SENTINEL_ROOT}/platform/game-agnostic"
./verify.sh

node "${SENTINEL_ROOT}/integration/verify-installed.mjs" \
  --sentinel "${SENTINEL_ROOT}" \
  --zeknova "${ZEKNOVA_ROOT}"

"${ZEKNOVA_ROOT}/sentinel-grid/scripts/verify-bridge.sh"
