#!/usr/bin/env node
/* Stage 2G — Oracle + Nexus R0 expert certification.
 *
 * Binds the certified experts to the inherited Stage 2F campaign manifest and
 * writes the deterministic certification artifact. Read-only with respect to every
 * Stage 2F artifact: this script writes only under artifacts/stage2g-experts/.
 *
 * Usage:
 *   node scripts/certify-stage2g-experts.mjs [--campaign <manifest.json>] [--check]
 *
 *   --check  Recompute and compare against the stored artifact without writing.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildStage2GPortabilityDigest,
  certifyStage2GExperts,
} from '../src/lab/stage2g-expert-certification.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function flag(name) {
  return process.argv.includes(name);
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

const campaignPath = path.resolve(
  option('--campaign', path.join(root, 'artifacts', 'r0-runtime-identity', 'stage2f-campaign-manifest.json')),
);
const artifactRoot = path.join(root, 'artifacts', 'stage2g-experts');
const checkOnly = flag('--check');

let campaignManifest;
try {
  campaignManifest = JSON.parse(await readFile(campaignPath, 'utf8'));
} catch (error) {
  console.error(`STAGE2G_BLOCKED=true reason=CAMPAIGN_MANIFEST_UNREADABLE path=${campaignPath}`);
  console.error(String(error?.message ?? error));
  process.exit(2);
}

let certification;
let records;
try {
  ({ certification, records } = certifyStage2GExperts({ campaignManifest }));
} catch (error) {
  console.error(`STAGE2G_BLOCKED=true reason=${error?.code ?? 'CERTIFICATION_ERROR'}`);
  console.error(String(error?.message ?? error));
  process.exit(3);
}

const portability = buildStage2GPortabilityDigest();

/* Recorded cross-platform evidence.
 *
 * Each entry is an ACTUAL measured run of this script on that platform, not an
 * expectation. portabilityStatus is DERIVED below by re-comparing every recorded
 * digest against the digest computed in this process: a recorded measurement that
 * stops reproducing turns the status to FAIL rather than being silently carried.
 *
 * Never edit a digest here to force agreement. Re-measure on the platform instead.
 * Node version, platform, architecture and endianness are excluded from the digest
 * itself, per repository portability doctrine; they are provenance for the run. */
const MEASURED_PLATFORMS = [
  { platform: 'darwin', arch: 'arm64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-20', digest: '6630d43f3c27c167c3152ebcd553ab49b18a77baa5233a6df675bb176d4588a1' },
  { platform: 'linux', arch: 'arm64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-20', digest: '6630d43f3c27c167c3152ebcd553ab49b18a77baa5233a6df675bb176d4588a1' },
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-20', digest: '6630d43f3c27c167c3152ebcd553ab49b18a77baa5233a6df675bb176d4588a1' },
];

const reproducing = MEASURED_PLATFORMS.filter((entry) => entry.digest === portability.digest);
const disagreeing = MEASURED_PLATFORMS.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(reproducing.map((entry) => entry.platform))].sort();
const currentPlatformRecorded = MEASURED_PLATFORMS.some((entry) => entry.platform === process.platform
  && entry.arch === process.arch
  && entry.nodeVersion === process.version
  && entry.digest === portability.digest);

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
  measuredPlatforms: MEASURED_PLATFORMS,
  disagreeingPlatforms: disagreeing,
  witnesses: portability.witnesses,
};

const evidence = {
  evidenceSchemaVersion: 1,
  stage: certification.stage,
  sentinelRuntimeId: certification.sentinelRuntimeId,
  stage2fCampaignId: certification.stage2fCampaignId,
  recordCount: records.length,
  records,
};

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2g-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({
    check: 'STAGE2G_CERTIFICATION',
    reproduced: match,
    storedHash: stored.certificationHash,
    recomputedHash: certification.certificationHash,
  }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2g-certification-result.json': certification,
  'stage2g-expert-evidence.json': evidence,
  'stage2g-portability-report.json': portabilityReport,
})) {
  await writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

console.log(JSON.stringify({
  stage: certification.stage,
  authority: certification.authority,
  oracleCertified: certification.oracleCertified,
  nexusCertified: certification.nexusCertified,
  oracleDeterministic: certification.oracleDeterministic,
  nexusDeterministic: certification.nexusDeterministic,
  stage2fProvenanceInherited: certification.stage2fProvenanceInherited,
  runtimeIdentityBound: certification.runtimeIdentityBound,
  campaignBound: certification.campaignBound,
  negativeGatesPassed: certification.negativeGatesPassed,
  negativeGateCount: certification.negativeGateCount,
  evidenceRecordCount: certification.evidenceRecordCount,
  liveActionDispatches: certification.liveActionDispatches,
  worldMutations: certification.worldMutations,
  authorityEscalations: certification.authorityEscalations,
  stage2gCertified: certification.stage2gCertified,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
  platformsPassed,
  currentPlatformRecorded,
}, null, 2));

process.exit(certification.stage2gCertified && portabilityStatus !== 'FAIL' ? 0 : 1);
