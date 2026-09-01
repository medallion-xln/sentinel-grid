#!/usr/bin/env node
/* Stage 2L.8 — remediated Arbiter independent red-team replication.
 *
 * Validation/challenge stage. Writes only under
 * artifacts/stage2l8-remediated-arbiter-independent-red-team-replication/.
 * The Stage 2L.7 implementation is imported and never modified.
 *
 * Usage:
 *   node scripts/certify-stage2l8-remediated-arbiter-independent-red-team-replication.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  STAGE2L8_STAGE2L7_OWNER_SHA256,
  benchmarkStage2L8,
  buildStage2L8Evaluation,
  buildStage2L8PortabilityDigest,
  certifyStage2L8,
} from '../src/lab/stage2l8-remediated-arbiter-independent-red-team-replication.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l8-remediated-arbiter-independent-red-team-replication');
const checkOnly = process.argv.includes('--check');

/* Frozen owners. Any drift here fails closed before a single case is measured. */
const FROZEN_OWNERS = {
  'src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js': STAGE2L8_STAGE2L7_OWNER_SHA256,
  'src/lab/stage2l6-deterministic-arbiter-adversarial-shadow-challenge.js': '9d293051b58827e7d0587704952399eef42b2b48e591dfb2abf794c79dc9ab1e',
  'src/lab/stage2l5-deterministic-arbiter-candidate.js': 'ed294a98c44bb3e4ee0f021ad73f58a703d9ba976c642ed2a1782881e5107e88',
  'src/lab/stage2l4-oracle-head-specific-decision-eligibility.js': 'c986ca46680b9f7ccb6f1e601a343df8010f66bd8316b006cd1b89d4cf86470f',
  'src/lab/stage2l2-independent-counterfactual-replication.js': '2220ad01ff079924358f4b2b4b870506d86613da2a240ff799858f379fbbfdb1',
  'src/lab/stage2l0-core-triad-shadow-integration.js': 'eb91d58369e8b15505c16e2523462656a49e896ecf9eee1d1bab974785c44ce8',
  'src/lab/stage2i4-oracle-v2-assembly.js': '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  'src/lab/stage2j1-bounded-two-step-prime.js': '77e692a0738526b3076a14a28750acfebbe989bfb4e2be5bd5cf0b4153559e6f',
  'src/lab/stage2k0-nexus-relational-diagnostic.js': 'e8745bc08e3452c9f0f824508bef52b202b3650dbd2e9e11a9e61e437baca7a1',
};

async function measureFreeze() {
  const owners = [];
  for (const [relative, expected] of Object.entries(FROZEN_OWNERS)) {
    const measured = createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');
    owners.push({ path: relative, expected, measured, unchanged: measured === expected });
  }
  return { owners, allUnchanged: owners.every((entry) => entry.unchanged) };
}

const freeze = await measureFreeze();
if (!freeze.allUnchanged) {
  console.error('STAGE2L8_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}

const evaluation = buildStage2L8Evaluation();
const performance = benchmarkStage2L8();
const certification = certifyStage2L8({ evaluation, performance });
const portability = buildStage2L8PortabilityDigest(certification);

/* Recorded cross-platform evidence — actual measured runs, never expectations.
 * Status is derived by re-comparing each recorded digest against the digest
 * computed in this process. Never edit a digest here; re-measure instead. */
const MEASURED_PLATFORMS = [
  { platform: 'darwin', arch: 'arm64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-26', digest: 'b1c8d8d1a6e39232bf4c80a0fef7da24a306d69293d9f687fd07786dc650f82d' },
  { platform: 'linux', arch: 'arm64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-26', digest: 'b1c8d8d1a6e39232bf4c80a0fef7da24a306d69293d9f687fd07786dc650f82d' },
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-08-26', digest: 'b1c8d8d1a6e39232bf4c80a0fef7da24a306d69293d9f687fd07786dc650f82d' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL' : platformsPassed.length >= 2 ? 'PASS' : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

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
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l8-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L8_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

const { rows, ...evidenceBody } = evaluation;
await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l8-certification-result.json': certification,
  'stage2l8-evidence.json': { stage: certification.stage, evidenceDigest: certification.evidenceDigest, ...evidenceBody },
  'stage2l8-red-team-corpus-report.json': { stage: certification.stage, corpus: evaluation.corpus, strata: evaluation.strata },
  'stage2l8-safety-bounds-report.json': { stage: certification.stage, bounds: evaluation.bounds, boundsPass: evaluation.boundsPass, eligibility: evaluation.eligibility },
  'stage2l8-benefit-retention-report.json': { stage: certification.stage, benefit: evaluation.benefit, metrics: evaluation.metrics },
  'stage2l8-residual-exposure-report.json': { stage: certification.stage, note: 'Reported separately; deliberately excluded from headline corpus metrics.', residualExposure: evaluation.residualExposure },
  'stage2l8-freeze-report.json': { stage: certification.stage, ...freeze },
  'stage2l8-performance-report.json': { stage: certification.stage, performance },
  'stage2l8-portability-report.json': portabilityReport,
})) {
  await writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

console.log(JSON.stringify({
  stage: certification.stage,
  status: certification.status,
  authority: certification.authority,
  arbiterShadowOnly: certification.arbiterShadowOnly,
  finalRecommendationOwner: certification.finalRecommendationOwner,
  frozenOwnersUnchanged: freeze.allUnchanged,
  corpusCases: certification.corpus.cases,
  effectiveSemanticGroups: certification.corpus.effectiveSemanticGroups,
  corpusOverlap: certification.corpus.corpusOverlap,
  primeOnlyTop1: certification.primeOnlyTop1,
  arbiterTop1: certification.arbiterTop1,
  decisionDelta: certification.decisionDelta,
  selectionChanges: certification.selectionChanges,
  beneficialChanges: certification.arbiterBeneficialChanges,
  harmfulChanges: certification.arbiterHarmfulChanges,
  harmfulChangeRate: certification.arbiterHarmfulChangeRate,
  correctPrimeBreakRate: certification.arbiterCorrectPrimeBreakRate,
  validDataValueRetentionRatio: certification.benefit.validDataValueRetentionRatio,
  boundsPass: certification.boundsPass,
  failureIsolationPass: certification.failureIsolationPass,
  invariancePass: certification.invariancePass,
  replayEquivalent: certification.replayEquivalent,
  liveActionDispatches: certification.liveActionDispatches,
  worldMutations: certification.worldMutations,
  authorityEscalations: certification.authorityEscalations,
  stage2l8Certified: certification.stage2l8Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
  platformsPassed,
  nextRecommendedStage: certification.nextRecommendedStage,
}, null, 2));

process.exit(certification.stage2l8Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
