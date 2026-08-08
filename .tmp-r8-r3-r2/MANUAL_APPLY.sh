#!/bin/bash
set -euo pipefail
echo "Manual apply for R8-R3-R2 self-test patch (outside sandbox)"
echo "1) kill 8790 listener if needed"
lsof -iTCP:8790 -sTCP:LISTEN -n -P || echo "8790 already free"
echo "To kill: lsof -tiTCP:8790 | xargs kill"
echo ""
echo "2) apply one-file patch"
SRC="/Users/dwaynecampbell/Desktop/sentinel-grid/.tmp-r8-r3-r2/self-test.mjs.patched"
DST="/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience/sentinel-grid/live-parity/runtime-collector/tests/self-test.mjs"
echo "cp $SRC $DST"
cp "$SRC" "$DST"
echo "Verify:"
shasum -a 256 "$DST"
echo "expected d2e90525848064627e2fb136667912955779efb0be3d773d86890efe668a41f6"
echo ""
echo "3) verify self-test"
node "$DST" /Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic
echo ""
echo "4) check runtime hash (currently 39276d, full rebuild not yet rebaselined)"
shasum -a 256 /Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience/assets/index-02987539.js
