#!/usr/bin/env node
/* Stage 2L.11 — Nexus semantic identifiability and decision-utility certification.
 *
 * MEASUREMENT / CERTIFICATION STAGE. Writes only under
 * artifacts/stage2l11-nexus-semantic-identifiability-and-decision-utility/.
 * Nexus, the Stage 2L.10 arbiter and its frozen calibration are imported frozen
 * and never modified.
 *
 * Usage:
 *   node scripts/certify-stage2l11-nexus-semantic-identifiability-and-decision-utility.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  STAGE2L11_STAGE2L10_OWNER_SHA256,
  buildStage2L11Evaluation,
  buildStage2L11PortabilityDigest,
  certifyStage2L11,
} from '../src/lab/stage2l11-nexus-semantic-identifiability-and-decision-utility.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l11-nexus-semantic-identifiability-and-decision-utility');
const checkOnly = process.argv.includes('--check');

/* Frozen owners. Any drift fails closed before a single case is measured. A
 * measurement stage that silently re-measured a mutated Nexus would be worthless. */
const FROZEN_OWNERS = {
  'src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js': STAGE2L11_STAGE2L10_OWNER_SHA256,
  'src/lab/stage2l9-single-expert-delegation-precision-bound.js': 'ec80274f55630cfd96da413786d3dbe8af9c7ee99ac583041fe5538bf6a20a81',
  'src/lab/stage2l8-remediated-arbiter-independent-red-team-replication.js': '0e9e09c3d853237365ebbd42512ba3f18bb4ee6577db554bd9c15588eb7f70e0',
  'src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js': '5047dc0576b8242c00a1f73729c4b0bc49fc1d181eac22bc90896d2cf5cccc00',
  'src/lab/stage2l5-deterministic-arbiter-candidate.js': 'ed294a98c44bb3e4ee0f021ad73f58a703d9ba976c642ed2a1782881e5107e88',
  'src/lab/stage2l0-core-triad-shadow-integration.js': 'eb91d58369e8b15505c16e2523462656a49e896ecf9eee1d1bab974785c44ce8',
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
  console.error('STAGE2L11_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}

const evaluation = buildStage2L11Evaluation();
const certification = certifyStage2L11({ evaluation });
const portability = buildStage2L11PortabilityDigest(certification);

/* Recorded cross-platform evidence — actual measured runs, never expectations.
 * Stage 2L.10 remains DIGEST_PRODUCED_SINGLE_PLATFORM and Stage 2L.11 does not
 * change that; second-platform portability stays an explicit later item. */
const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-01', digest: '5cc6e3bcd631ec7d991cf7da9b6fc4084283d588261ff8e4c1da879551446c2f' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS'
    : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l11-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L11_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

const { rows, ...evidenceBody } = evaluation;
await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l11-certification-result.json': certification,
  'stage2l11-evidence.json': { stage: certification.stage, evidenceDigest: certification.evidenceDigest, ...evidenceBody },
  'stage2l11-nexus-contract-map.json': { stage: certification.stage, ...evaluation.contractMap },
  'stage2l11-semantic-generation-audit.json': { stage: certification.stage, ...evaluation.audit },
  'stage2l11-identifiability-analysis.json': {
    stage: certification.stage,
    analysis: evaluation.analysis,
    discoveryAnalysis: evaluation.discoveryAnalysis,
    ruleSearch: evaluation.ruleSearch,
    generalization: evaluation.generalization,
    classification: evaluation.classification,
  },
  'stage2l11-holdout-manifest.json': {
    stage: certification.stage,
    corpus: evaluation.corpus,
    coverage: evaluation.coverage,
    labelLeakage: evaluation.labelLeakage,
    replay: evaluation.replay,
  },
  'stage2l11-delegation-evaluation.json': { stage: certification.stage, delegation: evaluation.delegation, security: evaluation.security },
  'stage2l11-freeze-report.json': { stage: certification.stage, ...freeze },
  'stage2l11-portability-report.json': {
    portabilityDigestVersion: 1,
    stage: certification.stage,
    digest: portability.digest,
    portabilityStatus,
    platformsPassed,
    measuredPlatforms: recorded,
    disagreeingPlatforms: disagreeing,
    inheritedNote: certification.portabilityNote,
    witnesses: portability.witnesses,
  },
})) {
  await writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}
`);
}

console.log(JSON.stringify({
  stage: certification.stage,
  status: certification.status,
  authority: certification.authority,
  frozenOwnersUnchanged: freeze.allUnchanged,
  nexusIdentifiabilityStatus: certification.identifiability.status,
  discoveryCases: certification.corpus.discoveryCases,
  holdoutCases: certification.corpus.holdoutCases,
  calibrationHoldoutSeparate: certification.corpus.calibrationHoldoutSeparate,
  labelLeakageDetected: certification.labelLeakageDetected,
  delegationOpportunities: certification.identifiability.opportunities,
  bestExistingSignal: certification.identifiability.bestExistingSignal,
  bestExistingDiscrimination: certification.identifiability.bestExistingDiscrimination,
  permutationNullMedian: certification.identifiability.permutationNull.median,
  permutationNullP95: certification.identifiability.permutationNull.p95,
  observedExceedsPermutationP95: certification.identifiability.observedExceedsPermutationP95,
  frozenRuleDiscoveryReliability: certification.generalization.discoveryReliability,
  frozenRuleHoldoutReliability: certification.generalization.holdoutReliability,
  frozenRuleCollapsedToBaseRate: certification.generalization.collapsedToBaseRate,
  nexusDelegations: certification.delegation.nexusDelegations,
  nexusHarmfulChanges: certification.delegation.nexusHarmfulChanges,
  nexusCorrectPrimeBreaks: certification.delegation.nexusCorrectPrimeBreaks,
  nexusCorrectnessDiscrimination: certification.delegation.nexusCorrectnessDiscrimination,
  remediationClass: certification.interpretation.remediationClass,
  defectLocus: certification.interpretation.defectLocus,
  identifiabilityQuestionAnswered: certification.identifiabilityQuestionAnswered,
  conclusionReproducible: certification.conclusionReproducible,
  securityRegressionPass: certification.securityRegressionPass,
  stage2l11Certified: certification.stage2l11Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l11Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
