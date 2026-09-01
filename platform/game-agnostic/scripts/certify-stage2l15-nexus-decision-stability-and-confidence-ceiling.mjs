#!/usr/bin/env node
/* Stage 2L.15 — Nexus decision stability, counterfactual consistency and
 * confidence-ceiling evaluation.
 *
 * MEASUREMENT STAGE. Writes only under
 * artifacts/stage2l15-nexus-decision-stability-and-confidence-ceiling/.
 * The Stage 2L.14 confidence calibration, the Stage 2L.13 expert, the Stage 2L.12
 * grounded benchmark, the Stage 2L.10 arbiter and the Stage 2L.7 evidence binding
 * are imported frozen and never modified. This stage adds one family of
 * decision-time evidence on top of them; it changes nothing they compute.
 *
 * Usage:
 *   node scripts/certify-stage2l15-nexus-decision-stability-and-confidence-ceiling.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  STAGE2L15_RELIABILITY_FLOOR,
  STAGE2L15_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L15_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L15_BOUND_METHOD,
  STAGE2L15_BOUND_Z,
  STAGE2L15_CONSERVATIVE_BOUND_REQUIREMENT,
  buildStage2L15Evaluation,
  buildStage2L15PortabilityDigest,
  certifyStage2L15,
} from '../src/lab/stage2l15-nexus-decision-stability.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l15-nexus-decision-stability-and-confidence-ceiling');
const checkOnly = process.argv.includes('--check');

/* Frozen owners. A stability measurement taken against a moving expert, a moving
 * benchmark or a moving confidence calibration measures nothing. */
const FROZEN_OWNERS = {
  'src/lab/stage2l14-nexus-confidence-calibration.js': '0efbef966c7625675244b57a95e706c67c81ddd2c60b871ac3a48f4c07ceeb16',
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

/* Two substitutions could manufacture a pass here: lowering the inherited floor,
 * or swapping the statistical method for a more permissive one after seeing
 * results. Both are checked structurally, before any measurement runs. The floor
 * and the bound are re-exported from Stage 2L.14 rather than redeclared, so this
 * also proves the single definition was not shadowed. */
async function measureInheritedThresholds() {
  const source = await readFile(path.join(root, 'src/lab/stage2l15-nexus-decision-stability.js'), 'utf8');
  const ownFloorDeclarations = [...source.matchAll(/STAGE2L15_RELIABILITY_FLOOR\s*=\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  return {
    inheritedFloor: 0.99,
    loadedFloor: STAGE2L15_RELIABILITY_FLOOR,
    floorIsReExportedNotRedeclared: ownFloorDeclarations.length === 0,
    boundMethod: STAGE2L15_BOUND_METHOD,
    boundZ: STAGE2L15_BOUND_Z,
    conservativeBoundRequirement: STAGE2L15_CONSERVATIVE_BOUND_REQUIREMENT,
    harmCeiling: STAGE2L15_MAX_HARMFUL_CHANGE_RATE,
    correctPrimeBreakCeiling: STAGE2L15_MAX_CORRECT_PRIME_BREAK_RATE,
    floorLowered: STAGE2L15_RELIABILITY_FLOOR < 0.99 || ownFloorDeclarations.some((value) => value < 0.99),
    ceilingsLoosened: STAGE2L15_MAX_HARMFUL_CHANGE_RATE > 0.01 || STAGE2L15_MAX_CORRECT_PRIME_BREAK_RATE > 0.01,
    statisticalMethodChanged: STAGE2L15_BOUND_METHOD !== 'WILSON_SCORE_LOWER_BOUND'
      || STAGE2L15_BOUND_Z !== 1.6449
      || STAGE2L15_CONSERVATIVE_BOUND_REQUIREMENT !== 0.95,
  };
}

/* Structural guarantee: the stability measurement must not import the benchmark's
 * answer machinery. deriveGroundTruth is imported by this module for ONE purpose —
 * validating that a perturbation preserves the decision problem — so the check is
 * that it appears only inside the validation function, never in a signal path. */
async function measureStabilityIsolation() {
  const source = await readFile(path.join(root, 'src/lab/stage2l15-nexus-decision-stability.js'), 'utf8');
  const measurementFunction = source.slice(
    source.indexOf('export function measureStage2L15Stability'),
    source.indexOf('export function stage2L15StructurallyEligible'),
  );
  const perturbationFunction = source.slice(
    source.indexOf('export function perturbStage2L15World'),
    source.indexOf('PHASE 2 — stability metrics'),
  );
  const forbidden = /deriveGroundTruth|optimalActionId|optimalActionUtility|nexusCorrect|primeCorrect/;
  return {
    groundTruthInStabilityMeasurement: forbidden.test(measurementFunction),
    groundTruthInPerturbation: forbidden.test(perturbationFunction),
    caseIdentityInPerturbation: /record\.variant|record\.split|record\.family|record\.profile|worldId/.test(perturbationFunction),
    isolationHolds: !forbidden.test(measurementFunction)
      && !forbidden.test(perturbationFunction)
      && !/record\.variant|record\.split|record\.family|record\.profile|worldId/.test(perturbationFunction),
  };
}

const freeze = await measureFreeze();
const thresholds = await measureInheritedThresholds();
const isolation = await measureStabilityIsolation();

if (!freeze.allUnchanged) {
  console.error('STAGE2L15_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (thresholds.floorLowered || thresholds.ceilingsLoosened || thresholds.statisticalMethodChanged) {
  console.error('STAGE2L15_BLOCKED=true reason=INHERITED_SAFETY_THRESHOLD_OR_METHOD_WEAKENED');
  console.error(`  floor=${thresholds.loadedFloor} method=${thresholds.boundMethod} z=${thresholds.boundZ} harmCeiling=${thresholds.harmCeiling}`);
  process.exit(2);
}
if (!isolation.isolationHolds) {
  console.error('STAGE2L15_BLOCKED=true reason=STABILITY_MEASUREMENT_READS_GROUND_TRUTH_OR_CASE_IDENTITY');
  console.error(`  ${JSON.stringify(isolation)}`);
  process.exit(2);
}

const evaluation = buildStage2L15Evaluation();
const certification = certifyStage2L15({ evaluation });
const portability = buildStage2L15PortabilityDigest(certification);

/* Recorded cross-platform evidence — actual measured runs, never expectations.
 * Stage 2L.10 through 2L.14 remain DIGEST_PRODUCED_SINGLE_PLATFORM; Stage 2L.15
 * does not change that and portability stays an explicit later item. */
const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-01', digest: '5c40e685b9347d7e4188b699721bed3601bb5c02586ae6d45f99f169aeeb313a' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS'
    : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l15-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L15_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

const { rows, ...evidenceBody } = evaluation;
await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l15-certification-result.json': certification,
  'stage2l15-evidence.json': { stage: certification.stage, evidenceDigest: certification.evidenceDigest, ...evidenceBody },
  'stage2l15-perturbation-model.json': {
    stage: certification.stage,
    ...certification.perturbationModel,
    isolation,
  },
  'stage2l15-stability-analysis.json': {
    stage: certification.stage,
    ...certification.stabilityAnalysis,
    signalInventory: certification.signalInventory,
  },
  'stage2l15-development-manifest.json': {
    stage: certification.stage,
    split: 'DEVELOPMENT',
    definition: certification.splits.definition.DEVELOPMENT,
    cases: certification.splits.developmentCases,
    digest: certification.splits.developmentDigest,
    perSignalDevelopmentAuroc: Object.fromEntries(
      Object.entries(certification.stabilityAnalysis.perSignal).map(([signal, entry]) => [signal, entry.developmentAuroc])),
    note: 'DEVELOPMENT is the only split used for exploration. Nothing measured here selected the frozen rule.',
  },
  'stage2l15-calibration-manifest.json': {
    stage: certification.stage,
    split: 'CALIBRATION',
    definition: certification.splits.definition.CALIBRATION,
    cases: certification.splits.calibrationCases,
    digest: certification.splits.calibrationDigest,
    ruleCount: certification.calibration.ruleCount,
    sweep: certification.calibration.sweep,
    note: 'CALIBRATION alone selects and freezes the rule. FINAL_HOLDOUT was scored once, after freezing.',
  },
  'stage2l15-holdout-manifest.json': {
    stage: certification.stage,
    split: 'FINAL_HOLDOUT',
    definition: certification.splits.definition.FINAL_HOLDOUT,
    cases: certification.splits.finalHoldoutCases,
    digest: certification.splits.finalHoldoutDigest,
    splitsDisjoint: certification.splits.splitsDisjoint,
    overlaps: certification.splits.overlaps,
  },
  'stage2l15-confidence-model.json': {
    stage: certification.stage,
    confidenceModel: certification.calibration.confidenceModel,
    calibrationDigest: certification.calibration.calibrationDigest,
    ladders: certification.calibration.ladders,
    crossSplitConsistencyRequired: certification.calibration.crossSplitConsistencyRequired,
    qualifyingRuleCount: certification.calibration.qualifyingRuleCount,
    meetsInheritedCriterionCount: certification.calibration.meetsInheritedCriterionCount,
    inheritedCriterionCandidates: certification.calibration.inheritedCriterionCandidates,
    selected: certification.calibration.selected,
    delegatingRuleId: certification.calibration.delegatingRuleId,
    incremental: certification.incremental,
    inheritedThresholds: thresholds,
  },
  'stage2l15-delegation-evaluation.json': {
    stage: certification.stage,
    delegation: certification.delegation,
    stabilityInformationPass: certification.stabilityInformationPass,
    reliabilityPass: certification.reliabilityPass,
    conservativeReliabilityBoundPass: certification.conservativeReliabilityBoundPass,
    minimumDelegationSupportPass: certification.minimumDelegationSupportPass,
    utilityPass: certification.utilityPass,
    harmCeilingPass: certification.harmCeilingPass,
    primeProtectionPass: certification.primeProtectionPass,
  },
  'stage2l15-confidence-ceiling.json': {
    stage: certification.stage,
    ...certification.confidenceCeiling,
    reliabilityFloor: STAGE2L15_RELIABILITY_FLOOR,
    interpretation: certification.interpretation,
  },
  'stage2l15-security-regression.json': {
    stage: certification.stage,
    adversarial: certification.adversarial,
    invariance: certification.invariance,
    labelLeakage: certification.labelLeakage,
    freeze,
    inheritedThresholds: thresholds,
    isolation,
  },
  'stage2l15-portability-report.json': {
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
  reliabilityFloor: STAGE2L15_RELIABILITY_FLOOR,
  reliabilityFloorLowered: thresholds.floorLowered,
  statisticalMethodChanged: thresholds.statisticalMethodChanged,
  stabilityIsolationHolds: isolation.isolationHolds,
  perturbationFamilyCount: certification.perturbationModel.familyCount,
  perturbationsPerCase: certification.perturbationModel.perturbationsPerCase,
  problemPreservationRate: certification.perturbationModel.validation.problemPreservationRate,
  splitsDisjoint: certification.splits.splitsDisjoint,
  developmentCases: certification.splits.developmentCases,
  calibrationCases: certification.splits.calibrationCases,
  finalHoldoutCases: certification.splits.finalHoldoutCases,
  existingConfidenceDiscrimination: certification.incremental.existingConfidenceDiscrimination,
  stabilityOnlyDiscrimination: certification.incremental.stabilityOnlyDiscrimination,
  combinedDiscrimination: certification.incremental.combinedDiscrimination,
  stabilityAddsInformation: certification.incremental.stabilityAddsInformation,
  qualifyingRuleCount: certification.calibration.qualifyingRuleCount,
  delegatingRuleId: certification.calibration.delegatingRuleId,
  nexusDelegations: certification.delegation.nexusDelegations,
  nexusDelegationRate: certification.delegation.nexusDelegationRate,
  nexusDelegationPrecision: certification.delegation.nexusDelegationPrecision,
  nexusDelegationLowerBound: certification.delegation.nexusDelegationLowerBound,
  beneficialChanges: certification.delegation.beneficialChanges,
  harmfulChanges: certification.delegation.harmfulChanges,
  correctPrimeBreaks: certification.delegation.correctPrimeBreaks,
  primeOnlyAccuracy: certification.delegation.primeOnlyAccuracy,
  arbiterAccuracy: certification.delegation.arbiterAccuracy,
  highestSupportedReliability: certification.confidenceCeiling.highestSupportedReliability,
  estimatedConfidenceCeiling: certification.confidenceCeiling.estimatedConfidenceCeiling,
  ceilingLimitationClass: certification.confidenceCeiling.ceilingLimitationClass,
  stabilityInformationPass: certification.stabilityInformationPass,
  reliabilityPass: certification.reliabilityPass,
  utilityPass: certification.utilityPass,
  harmCeilingPass: certification.harmCeilingPass,
  primeProtectionPass: certification.primeProtectionPass,
  securityRegressionPass: certification.securityRegressionPass,
  labelLeakageDetected: certification.labelLeakageDetected,
  nexusStabilityOutcome: certification.nexusStabilityOutcome,
  stage2l15Certified: certification.stage2l15Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l15Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
