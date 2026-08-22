#!/usr/bin/env node
/* Stage 2H — shadow expert consumption and Prime context integration.
 *
 * Read-only with respect to every Stage 2F and Stage 2G artifact: this script
 * writes only under artifacts/stage2h-prime-context/.
 *
 * Usage:
 *   node scripts/certify-stage2h-prime-context.mjs [--campaign <manifest.json>] [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildStage2HPortabilityDigest,
  certifyStage2HPrimeContext,
} from '../src/lab/stage2h-prime-context-certification.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const flag = (name) => process.argv.includes(name);
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
};

const campaignPath = path.resolve(
  option('--campaign', path.join(root, 'artifacts', 'r0-runtime-identity', 'stage2f-campaign-manifest.json')),
);
const artifactRoot = path.join(root, 'artifacts', 'stage2h-prime-context');
const checkOnly = flag('--check');

let campaignManifest;
try {
  campaignManifest = JSON.parse(await readFile(campaignPath, 'utf8'));
} catch (error) {
  console.error(`STAGE2H_BLOCKED=true reason=CAMPAIGN_MANIFEST_UNREADABLE path=${campaignPath}`);
  console.error(String(error?.message ?? error));
  process.exit(2);
}

let certification;
try {
  ({ certification } = certifyStage2HPrimeContext({ campaignManifest }));
} catch (error) {
  console.error(`STAGE2H_BLOCKED=true reason=${error?.code ?? 'CERTIFICATION_ERROR'}`);
  console.error(String(error?.message ?? error));
  process.exit(3);
}

const portability = buildStage2HPortabilityDigest({ campaignManifest });

/* Recorded cross-platform evidence — actual measured runs, never expectations.
 * portabilityStatus is DERIVED by re-comparing each recorded digest against the
 * digest computed in this process, so a platform that stops reproducing turns the
 * status to FAIL instead of carrying a stale PASS.
 *
 * Never edit a digest here to force agreement. Re-measure on the platform. */
const MEASURED_PLATFORMS = [
  { platform: 'darwin', arch: 'arm64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-20', digest: '967e9e13abe30daae47252048c493103d3d6ca6fd082bf247c9b99fe14ef124a' },
  { platform: 'linux', arch: 'arm64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-20', digest: '967e9e13abe30daae47252048c493103d3d6ca6fd082bf247c9b99fe14ef124a' },
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-20', digest: '967e9e13abe30daae47252048c493103d3d6ca6fd082bf247c9b99fe14ef124a' },
];

const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0
  ? 'FAIL'
  : platformsPassed.length >= 2
    ? 'PASS'
    : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

const portabilityReport = {
  portabilityDigestVersion: 1,
  stage: certification.stage,
  digest: portability.digest,
  portabilityStatus,
  platformsPassed,
  measuredPlatforms: recorded,
  disagreeingPlatforms: disagreeing,
  witnesses: portability.witnesses,
};

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2h-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({
    check: 'STAGE2H_CERTIFICATION',
    reproduced: match,
    storedHash: stored.certificationHash,
    recomputedHash: certification.certificationHash,
  }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2h-certification-result.json': certification,
  'stage2h-portability-report.json': portabilityReport,
})) {
  await writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

console.log(JSON.stringify({
  stage: certification.stage,
  authority: certification.authority,
  finalRecommendationOwner: certification.finalRecommendationOwner,
  oracleContextConsumed: certification.oracleContextConsumed,
  nexusContextConsumed: certification.nexusContextConsumed,
  baselineModeBitExact: certification.baselineModeBitExact,
  neutralContextBitExact: certification.neutralContextBitExact,
  expertAdjustmentBounded: certification.expertAdjustmentBounded,
  positiveClampCertified: certification.positiveClampCertified,
  negativeClampCertified: certification.negativeClampCertified,
  legalActionsPreserved: certification.legalActionsPreserved,
  priorsUnchanged: certification.priorsUnchanged,
  replayEquivalent: certification.replayEquivalent,
  negativeGatesPassed: certification.negativeGatesPassed,
  negativeGateCount: certification.negativeGateCount,
  comparisonCount: certification.comparisonCount,
  decisionsChanged: certification.decisionsChanged,
  decisionsUnchanged: certification.decisionsUnchanged,
  selectionsChanged: certification.selectionsChanged,
  liveActionDispatches: certification.liveActionDispatches,
  worldMutations: certification.worldMutations,
  authorityEscalations: certification.authorityEscalations,
  stage2hCertified: certification.stage2hCertified,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
  platformsPassed,
}, null, 2));

process.exit(certification.stage2hCertified && portabilityStatus !== 'FAIL' ? 0 : 1);
