#!/usr/bin/env bash
set -euo pipefail
exec node "/Users/dwaynecampbell/Desktop/sentinel-grid/integration/status.mjs" --sentinel "/Users/dwaynecampbell/Desktop/sentinel-grid" --zeknova "/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience" "$@"
