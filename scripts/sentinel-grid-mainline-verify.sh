#!/usr/bin/env bash
set -euo pipefail
cd "/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic"
./verify.sh
node "/Users/dwaynecampbell/Desktop/sentinel-grid/integration/verify-installed.mjs" --sentinel "/Users/dwaynecampbell/Desktop/sentinel-grid" --zeknova "/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience"
"/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience/sentinel-grid/scripts/verify-bridge.sh"
