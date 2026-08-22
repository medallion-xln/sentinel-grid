#!/usr/bin/env node
/* Stage 2H.1 — action-discriminating expert context certification.
 *
 * Read-only with respect to every Stage 2F, 2G and 2H artifact: this script
 * writes only under artifacts/stage2h1-action-context/.
 *
 * Usage:
 *   node scripts/certify-stage2h1-action-context.mjs [--campaign <manifest.json>] [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildStage2H1PortabilityDigest,
  certifyStage2H1ActionContext,
} from '../src/lab/stage2h1-action-context-certification.js';

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
const artifactRoot = path.join(root, 'artifacts', 'stage2h1-action-context');
const checkOnly = flag('--check');

let campaignManifest;
try {
  campaignManifest = JSON.parse(await readFile(campaignPath, 'utf8'));
} catch (error) {
  console.error(`STAGE2H1_BLOCKED=true reason=CAMPAIGN_MANIFEST_UNREADABLE path=${campaignPath}`);
  console.error(String(error?.message ?? error));
  process.exit(2);
}

let certification;
try {
  ({ certification } = certifyStage2H1ActionContext({ campaignManifest }));
} catch (error) {
  console.error(`STAGE2H1_BLOCKED=true reason=${error?.code ?? 'CERTIFICATION_ERROR'}`);
  console.error(String(error?.message ?? error));
  process.exit(3);
}

const portability = buildStage2H1PortabilityDigest({ campaignManifest });

/* Recorded cross-platform evidence — actual measured runs, never expectations.
 * portabilityStatus is DERIVED by re-comparing each recorded digest against the
 * digest computed in this process, so a platform that stops reproducing turns the
 * status to FAIL instead of carrying a stale PASS.
 *
 * Never edit a digest here to force agreement. Re-measure on the platform. */
const MEASURED_PLATFORMS = [
  { platform: 'darwin', arch: 'arm64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-20', digest: 'cc7ff03a25d899f607c2f13624736ee3cf41e96bb18c23a2b41c78c1922284bd' },
  { platform: 'linux', arch: 'arm64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-20', digest: 'cc7ff03a25d899f607c2f13624736ee3cf41e96bb18c23a2b41c78c1922284bd' },
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-20', digest: 'cc7ff03a25d899f607c2f13624736ee3cf41e96bb18c23a2b41c78c1922284bd' },
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
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2h1-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({
    check: 'STAGE2H1_CERTIFICATION',
    reproduced: match,
    storedHash: stored.certificationHash,
    recomputedHash: certification.certificationHash,
  }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2h1-certification-result.json': certification,
  'stage2h1-portability-report.json': portabilityReport,
})) {
  await writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

console.log(JSON.stringify({
  stage: certification.stage,
  authority: certification.authority,
  finalRecommendationOwner: certification.finalRecommendationOwner,
  actionSpecificContext: certification.actionSpecificContext,
  oracleActionDiscrimination: certification.oracleActionDiscrimination,
  nexusActionDiscrimination: certification.nexusActionDiscrimination,
  neutralContextInert: certification.neutralContextInert,
  noFabricatedPreference: certification.noFabricatedPreference,
  strongPreferenceHeld: certification.strongPreferenceHeld,
  legalActionSetPreserved: certification.legalActionSetPreserved,
  actionAdjustmentBounded: certification.actionAdjustmentBounded,
  boundsUnchanged: certification.boundsUnchanged,
  fixtureCount: certification.fixtureCount,
  packetsChanged: certification.packetsChanged,
  decisionsChanged: certification.decisionsChanged,
  rankingsChanged: certification.rankingsChanged,
  selectionsChanged: certification.selectionsChanged,
  selectionChangeCausallyAttributed: certification.selectionChangeCausallyAttributed,
  unattributedSelectionChanges: certification.unattributedSelectionChanges,
  oracleAblationMeasured: certification.oracleAblationMeasured,
  nexusAblationMeasured: certification.nexusAblationMeasured,
  combinedAblationMeasured: certification.combinedAblationMeasured,
  replayEquivalent: certification.replayEquivalent,
  negativeGatesPassed: certification.negativeGatesPassed,
  liveActionDispatches: certification.liveActionDispatches,
  worldMutations: certification.worldMutations,
  authorityEscalations: certification.authorityEscalations,
  stage2h1Certified: certification.stage2h1Certified,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
  platformsPassed,
}, null, 2));

process.exit(certification.stage2h1Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
