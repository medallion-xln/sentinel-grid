#!/usr/bin/env bash
set -euo pipefail

FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
  shift
fi

TARGET="${1:-$HOME/Desktop/sentinel-grid-game-agnostic}"
SOURCE="$(cd "$(dirname "$0")" && pwd)"

if [ -e "$TARGET" ] && [ "$(find "$TARGET" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)" != "" ]; then
  if [ "$FORCE" -ne 1 ]; then
    printf 'Target exists and is not empty: %s\n' "$TARGET" >&2
    printf 'Use --force only when intentional.\n' >&2
    exit 2
  fi
  rm -rf "$TARGET"
fi

mkdir -p "$TARGET"
(
  cd "$SOURCE"
  tar --exclude='./.git' --exclude='./node_modules' -cf - .
) | (
  cd "$TARGET"
  tar -xf -
)

chmod +x "$TARGET/install.sh" "$TARGET/verify.sh"
cd "$TARGET"
./verify.sh

printf '\nInstalled Sentinel Grid game-agnostic Stage 0 through Stage 2F-Z at:\n%s\n' "$TARGET"
