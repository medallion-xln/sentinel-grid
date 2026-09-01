#!/usr/bin/env node
/* Stage 2L.14 — Nexus confidence calibration and safe selective delegation.
 *
 * MEASUREMENT AND CALIBRATION STAGE. Writes only under
 * artifacts/stage2l14-nexus-confidence-calibration-and-safe-delegation/.
 * The Stage 2L.13 value-aware expert, the Stage 2L.12 grounded benchmark, the
 * Stage 2L.10 arbiter and the Stage 2L.7 evidence binding are imported frozen
 * and never modified. This stage adds a confidence contract on top of them; it
 * does not change what any of them computes.
 *
 * Usage:
 *   node scripts/certify-stage2l14-nexus-confidence-calibration-and-safe-delegation.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  STAGE2L14_RELIABILITY_FLOOR,
  STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
  buildStage2L14Evaluation,
  buildStage2L14PortabilityDigest,
  certifyStage2L14,
} from '../src/lab/stage2l14-nexus-confidence-calibration.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l14-nexus-confidence-calibration-and-safe-delegation');
const checkOnly = process.argv.includes('--check');

/* Frozen owners. A confidence calibration measured against a moving expert or a
 * moving benchmark measures nothing. Every one of these must be byte-identical
 * to the artifact it was certified as in its own stage. */
const FROZEN_OWNERS = {
  'src/lab/stage2l13-value-aware-nexus.js': '31d29c21d8adcdae8f689c676345f389d1b875767c479427bd87652d870ac282',
  'src/lab/stage2l13-value-aware-nexus-relational-utility.js': '99411200b95e5f5fd2e0ffd9ecf20ba3b4bca1c7abadedb9463bab89a878260b',
  'src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js': '2c54345aabedcd3e2e913fb7b4d5d5cbf9dd1ece99f2cf211c3dd76deaea0143',
  'src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js': '7301bc34486f0ae72e310898cd162fb9bd41d7be943b5ada81a5785bcd18a00a',
  'src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js': '5047dc0576b8242c00a1f73729c4b0bc49fc1d181eac22bc90896d2cf5cccc00',
  'src/experts/nexus.js': '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
};

async function measureFreeze() {
  const owners = [];
  for (const [relative, expected] of Object.entries(FROZEN_OWNERS)) {
    const measured = createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');
    owners.push({ path: relative, expected, measured, unchanged: measured === expected });
  }
  return { owners, allUnchanged: owners.every((entry) => entry.unchanged) };
}

/* The one substitution this stage could make to manufacture a pass is lowering
 * the inherited reliability floor. Checked structurally rather than trusted:
 * the constant is read back from the loaded module, and the source is scanned
 * for any competing floor declaration. */
async function measureFloorImmutability() {
  const source = await readFile(path.join(root, 'src/lab/stage2l14-nexus-confidence-calibration.js'), 'utf8');
  const declarations = [...source.matchAll(/STAGE2L14_RELIABILITY_FLOOR\s*=\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  return {
    inheritedFloor: 0.99,
    loadedFloor: STAGE2L14_RELIABILITY_FLOOR,
    sourceDeclarations: declarations,
    harmCeiling: STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
    correctPrimeBreakCeiling: STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
    floorLowered: STAGE2L14_RELIABILITY_FLOOR < 0.99
      || declarations.some((value) => value < 0.99)
      || declarations.length !== 1,
    ceilingsLoosened: STAGE2L14_MAX_HARMFUL_CHANGE_RATE > 0.01
      || STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE > 0.01,
  };
}

const freeze = await measureFreeze();
const floor = await measureFloorImmutability();
if (!freeze.allUnchanged) {
  console.error('STAGE2L14_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (floor.floorLowered || floor.ceilingsLoosened) {
  console.error('STAGE2L14_BLOCKED=true reason=INHERITED_SAFETY_THRESHOLD_WEAKENED');
  console.error(`  floor=${floor.loadedFloor} declarations=${JSON.stringify(floor.sourceDeclarations)} harmCeiling=${floor.harmCeiling}`);
  process.exit(2);
}

const evaluation = buildStage2L14Evaluation();
const certification = certifyStage2L14({ evaluation });
const portability = buildStage2L14PortabilityDigest(certification);

/* Recorded cross-platform evidence — actual measured runs, never expectations.
 * Stage 2L.10 through 2L.13 remain DIGEST_PRODUCED_SINGLE_PLATFORM; Stage 2L.14
 * does not change that and portability stays an explicit later item. */
const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-01', digest: 'b63cff14f2b66d8940ba8b3067696f418ba75d89ab63570648b2edb92ef47101' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS'
    : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l14-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L14_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

const { rows, ...evidenceBody } = evaluation;
await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l14-certification-result.json': certification,
  'stage2l14-evidence.json': { stage: certification.stage, evidenceDigest: certification.evidenceDigest, ...evidenceBody },
  'stage2l14-confidence-signal-inventory.json': {
    stage: certification.stage,
    signalInventory: evaluation.signalInventory,
    confidenceBuckets: certification.calibration.buckets,
    structurallyIneligibleBuckets: certification.calibration.structurallyIneligibleBuckets,
    labelLeakage: evaluation.labelLeakage,
  },
  'stage2l14-development-manifest.json': {
    stage: certification.stage,
    split: 'DEVELOPMENT',
    definition: certification.splits.definition.DEVELOPMENT,
    cases: certification.splits.developmentCases,
    digest: certification.splits.developmentDigest,
    diagnosticGrid: certification.diagnosticGrid.map((entry) => ({
      minRiskAdjustment: entry.minRiskAdjustment,
      minUtilityMargin: entry.minUtilityMargin,
      ...entry.development,
    })),
    note: 'DEVELOPMENT is the only split used for exploration. Nothing measured here was permitted to select the frozen calibration.',
  },
  'stage2l14-calibration-manifest.json': {
    stage: certification.stage,
    split: 'CALIBRATION',
    definition: certification.splits.definition.CALIBRATION,
    cases: certification.splits.calibrationCases,
    digest: certification.splits.calibrationDigest,
    sweep: certification.calibration.sweep,
    selected: certification.calibration.selected,
    note: 'CALIBRATION alone selects and freezes the confidence model. FINAL_HOLDOUT was scored once, after freezing.',
  },
  'stage2l14-holdout-manifest.json': {
    stage: certification.stage,
    split: 'FINAL_HOLDOUT',
    definition: certification.splits.definition.FINAL_HOLDOUT,
    cases: certification.splits.finalHoldoutCases,
    digest: certification.splits.finalHoldoutDigest,
    splitsDisjoint: certification.splits.splitsDisjoint,
    overlaps: certification.splits.overlaps,
    calibrationHoldoutSeparate: certification.splits.calibrationHoldoutSeparate,
  },
  'stage2l14-calibration-model.json': {
    stage: certification.stage,
    predeclared: certification.predeclared,
    confidenceModel: certification.calibration.confidenceModel,
    calibrationVersion: certification.calibration.calibrationVersion,
    calibrationDigest: certification.calibration.calibrationDigest,
    parameters: certification.calibration.parameters,
    delegatingBuckets: certification.calibration.delegatingBuckets,
    selected: certification.calibration.selected,
    floorImmutability: floor,
  },
  'stage2l14-reliability-buckets.json': {
    stage: certification.stage,
    calibrationBuckets: certification.calibration.buckets,
    finalHoldoutBucketUsage: certification.delegation.bucketUsage,
    generalizationGrid: certification.diagnosticGrid,
    bestCalibrationPrecision: certification.calibration.bestCalibrationPrecision,
    anyCalibrationRegionAtFloor: certification.calibration.anyCalibrationRegionAtFloor,
    anyCalibrationRegionAtFloorWithSupport: certification.calibration.anyCalibrationRegionAtFloorWithSupport,
    developmentReachedFloor: certification.calibration.developmentReachedFloor,
  },
  'stage2l14-robustness-analysis.json': { stage: certification.stage, ...certification.robustnessFinding },
  'stage2l14-delegation-evaluation.json': {
    stage: certification.stage,
    delegation: certification.delegation,
    reliabilityPass: certification.reliabilityPass,
    conservativeReliabilityBoundPass: certification.conservativeReliabilityBoundPass,
    minimumDelegationSupportPass: certification.minimumDelegationSupportPass,
    utilityPass: certification.utilityPass,
    harmCeilingPass: certification.harmCeilingPass,
    primeProtectionPass: certification.primeProtectionPass,
  },
  'stage2l14-security-regression.json': {
    stage: certification.stage,
    adversarial: certification.adversarial,
    invariance: certification.invariance,
    labelLeakage: certification.labelLeakage,
    freeze,
    floorImmutability: floor,
  },
  'stage2l14-portability-report.json': {
    portabilityDigestVersion: 1,
    stage: certification.stage,
    digest: portability.digest,
    portabilityStatus,
    platformsPassed,
    disagreeing,
    inheritedNote: certification.portabilityNote,
    witnesses: portability.witnesses,
  },
})) {
  await writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

console.log(JSON.stringify({
  stage: certification.stage,
  status: certification.status,
  authority: certification.authority,
  canDispatch: certification.canDispatch,
  frozenOwnersUnchanged: freeze.allUnchanged,
  reliabilityFloor: certification.predeclared.reliabilityFloor,
  reliabilityFloorLowered: floor.floorLowered,
  splitsDisjoint: certification.splits.splitsDisjoint,
  developmentCases: certification.splits.developmentCases,
  calibrationCases: certification.splits.calibrationCases,
  finalHoldoutCases: certification.splits.finalHoldoutCases,
  bestCalibrationPrecision: certification.calibration.bestCalibrationPrecision,
  developmentReachedFloor: certification.calibration.developmentReachedFloor,
  anyCalibrationRegionAtFloor: certification.calibration.anyCalibrationRegionAtFloor,
  delegatingBuckets: certification.calibration.delegatingBuckets,
  structurallyEligibleRecommendations: certification.delegation.structurallyEligibleRecommendations,
  nexusEligibleRecommendations: certification.delegation.nexusEligibleRecommendations,
  nexusDelegations: certification.delegation.nexusDelegations,
  nexusDelegationRate: certification.delegation.nexusDelegationRate,
  nexusDelegationPrecision: certification.delegation.nexusDelegationPrecision,
  delegatedReliabilityLowerBound: certification.delegation.delegatedReliabilityLowerBound,
  harmfulChanges: certification.delegation.harmfulChanges,
  correctPrimeBreaks: certification.delegation.correctPrimeBreaks,
  harmfulOpportunityRejectionRate: certification.delegation.harmfulOpportunityRejectionRate,
  primeOnlyAccuracy: certification.delegation.primeOnlyAccuracy,
  arbiterAccuracy: certification.delegation.arbiterAccuracy,
  reliabilityPass: certification.reliabilityPass,
  conservativeReliabilityBoundPass: certification.conservativeReliabilityBoundPass,
  minimumDelegationSupportPass: certification.minimumDelegationSupportPass,
  utilityPass: certification.utilityPass,
  harmCeilingPass: certification.harmCeilingPass,
  primeProtectionPass: certification.primeProtectionPass,
  securityRegressionPass: certification.securityRegressionPass,
  labelLeakageDetected: certification.labelLeakageDetected,
  nexusSafeForSelectiveDelegation: certification.nexusSafeForSelectiveDelegation,
  nexusConfidenceOutcome: certification.nexusConfidenceOutcome,
  failureMode: certification.failureMode,
  stage2l14Certified: certification.stage2l14Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l14Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
