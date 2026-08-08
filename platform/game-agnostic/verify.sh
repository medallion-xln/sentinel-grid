#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

npm test
npm run adapters:discover
npm run adapters:lock:check
npm run adapters:certify
npm run snapshots:validate
npm run snapshots:certify
npm run conformance:production
npm run parity:zeknova
npm run shadow:zeknova:framework
npm run shadow:zeknova:stage2f:framework
npm run verify
npm run evidence:check
npm run sha256:check

printf '\nSentinel Grid Stage 0 through Stage 2F-Z verification: PASS\n'
printf 'Production Adapter SDK: certified\n'
printf 'Production Snapshot Ingestion: certified\n'
printf 'Production Conformance Expansion: certified\n'
printf 'ZekNova Production Adapter: registered and certified\n'
printf 'ZekNova frozen-corpus behavioral parity: certified\n'
printf 'ZekNova real-state capture and sustained shadow framework: certified\n'
printf 'Stage 2F-Z provenance-locked campaign and controlled evaluation framework: certified\n'
printf 'Authentic live sustained-shadow campaign: pending captures\n'
printf 'Controlled next-stage evaluation: blocked until live campaign certification\n'
printf 'Authority promotion: unavailable\n'
printf 'Authority: R0\n'
printf 'Execution interface: absent\n'
printf 'Live-world mutation interface: absent\n'
printf 'Scripted ZekNova NPC executor: preserved\n'
printf 'Evidence portability: hardened\n'
