#!/usr/bin/env node
/* Stage 2L.17 — Nexus live-substitute validation and do-nothing baseline.
 *
 * BOUNDED EXPERT REMEDIATION. Writes only under
 * artifacts/stage2l17-live-substitute-and-hold-remediation/. The Stage 2L.13
 * expert, the Stage 2L.12 benchmark, the Stage 2L.14/2L.15 confidence machinery,
 * the Stage 2L.16 classifier, the arbiter and Prime are all imported frozen. The
 * remediated expert is a NEW file; nothing inherited was edited.
 *
 * Three structural gates run before any measurement:
 *   1. frozen owner hashes
 *   2. expert isolation — the remediated expert must import no benchmark module
 *      and name no ground-truth symbol
 *   3. inherited thresholds — the 0.99 floor and both 0.01 ceilings unchanged
 *
 * Usage:
 *   node scripts/certify-stage2l17-live-substitute-and-hold-remediation.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { deriveGroundTruth } from '../src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js';
import {
  STAGE2L14_RELIABILITY_FLOOR,
  STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L14_BOUND_METHOD,
  STAGE2L14_BOUND_Z,
  STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT,
} from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import {
  STAGE2L17_FORBIDDEN_IN_EXPERT,
  buildStage2L17Evaluation,
  buildStage2L17PortabilityDigest,
  certifyStage2L17,
} from '../src/lab/stage2l17-live-substitute-hold-remediation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l17-live-substitute-and-hold-remediation');
const checkOnly = process.argv.includes('--check');

const FROZEN_OWNERS = {
  'src/lab/stage2l16-nexus-residual-error-decomposition.js': '06baddc4275c256f33751422d74c713236de3568e960960c590d1db00cea53c2',
  'src/lab/stage2l15-nexus-decision-stability.js': 'c135899cc9a77ca801f08776ba91447e883d3bb09147ade92da40710342183ca',
  'src/lab/stage2l14-nexus-confidence-calibration.js': '0efbef966c7625675244b57a95e706c67c81ddd2c60b871ac3a48f4c07ceeb16',
  'src/lab/stage2l13-value-aware-nexus.js': '31d29c21d8adcdae8f689c676345f389d1b875767c479427bd87652d870ac282',
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

/* PHASE 9. The remediated expert must reason from canonical state alone. Checked
 * by scanning its source: no benchmark import, no ground-truth symbol, no
 * evaluation field, no case identifier. */
async function measureExpertIsolation() {
  const source = await readFile(path.join(root, 'src/lab/stage2l17-live-substitute-hold-nexus.js'), 'utf8');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  const forbiddenImports = imports.filter((specifier) =>
    /stage2l12|stage2l14|stage2l15|stage2l16/.test(specifier));
  const forbiddenSymbols = STAGE2L17_FORBIDDEN_IN_EXPERT.filter((symbol) => {
    /* The words appear in the file's prose header where the defect is explained.
     * Only CODE occurrences count, so comments are stripped before scanning. */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    return new RegExp(`\\b${symbol}\\b`).test(code);
  });
  return {
    imports,
    forbiddenImports,
    forbiddenSymbols,
    importsBenchmarkScoring: forbiddenImports.length > 0,
    namesGroundTruthSymbols: forbiddenSymbols.length > 0,
    isolationHolds: forbiddenImports.length === 0 && forbiddenSymbols.length === 0,
  };
}

async function measureInheritedThresholds() {
  const expert = await readFile(path.join(root, 'src/lab/stage2l17-live-substitute-hold-nexus.js'), 'utf8');
  const harness = await readFile(path.join(root, 'src/lab/stage2l17-live-substitute-hold-remediation.js'), 'utf8');
  const declaresOwnFloor = /STAGE2L17_RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(harness) || /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(expert);
  return {
    reliabilityFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorLowered: STAGE2L14_RELIABILITY_FLOOR < 0.99,
    floorRedeclaredLocally: declaresOwnFloor,
    harmCeiling: STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
    correctPrimeBreakCeiling: STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
    ceilingsLoosened: STAGE2L14_MAX_HARMFUL_CHANGE_RATE > 0.01 || STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE > 0.01,
    boundMethod: STAGE2L14_BOUND_METHOD,
    boundZ: STAGE2L14_BOUND_Z,
    conservativeBoundRequirement: STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT,
    methodChanged: STAGE2L14_BOUND_METHOD !== 'WILSON_SCORE_LOWER_BOUND'
      || STAGE2L14_BOUND_Z !== 1.6449 || STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT !== 0.95,
    thresholdsIntact: STAGE2L14_RELIABILITY_FLOOR === 0.99
      && STAGE2L14_MAX_HARMFUL_CHANGE_RATE === 0.01
      && STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE === 0.01
      && !declaresOwnFloor,
  };
}

const freeze = await measureFreeze();
const isolation = await measureExpertIsolation();
const thresholds = await measureInheritedThresholds();

if (!freeze.allUnchanged) {
  console.error('STAGE2L17_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!isolation.isolationHolds) {
  console.error('STAGE2L17_BLOCKED=true reason=BENCHMARK_LOGIC_IMPORTED_INTO_NEXUS');
  console.error(`  imports: ${isolation.forbiddenImports.join(', ')}  symbols: ${isolation.forbiddenSymbols.join(', ')}`);
  process.exit(2);
}
if (!thresholds.thresholdsIntact || thresholds.methodChanged) {
  console.error('STAGE2L17_BLOCKED=true reason=INHERITED_THRESHOLD_OR_METHOD_WEAKENED');
  console.error(`  ${JSON.stringify(thresholds)}`);
  process.exit(2);
}

const evaluation = buildStage2L17Evaluation({ deriveGroundTruthFn: deriveGroundTruth });
const certification = certifyStage2L17({ evaluation });
const portability = buildStage2L17PortabilityDigest(certification);

/* The faithfulness gate. If the INHERITED variant does not reproduce the frozen
 * Stage 2L.13 expert on every case, this reimplementation has drifted and every
 * improvement measured against it is a fiction. */
if (!certification.expertReproducesInherited) {
  console.error('STAGE2L17_BLOCKED=true reason=INHERITED_VARIANT_DOES_NOT_REPRODUCE_FROZEN_EXPERT');
  process.exit(2);
}

const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-02', digest: '6d835a3bfe64ff12f8e380e10b3b3da391bce47bc4d70a9e110013f64b7976ae' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS'
    : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l17-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L17_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l17-certification-result.json': certification,
  'stage2l17-baseline-audit.json': {
    stage: certification.stage,
    freeze,
    inheritedThresholds: thresholds,
    expertIsolation: isolation,
    inheritedVariantReproducesFrozenExpert: certification.expertReproducesInherited,
    corpusDigest: certification.corpusDigest,
  },
  'stage2l17-live-substitute-audit.json': {
    stage: certification.stage,
    substituteCases: certification.audits.substitute,
    liveSubstituteDefectReproduced: certification.audits.liveSubstituteDefectReproduced,
    liveSubstituteDefectRepaired: certification.audits.liveSubstituteDefectRepaired,
    note: certification.audits.note,
  },
  'stage2l17-hold-baseline-audit.json': {
    stage: certification.stage,
    holdCases: certification.audits.hold,
    holdBaselineDefectReproduced: certification.audits.holdBaselineDefectReproduced,
    holdBaselineDefectRepairedInSelectedVariant: certification.audits.holdBaselineDefectRepairedInSelectedVariant,
    holdIsNeverOptimalInCorpus: certification.ablation.holdIsNeverOptimal,
  },
  'stage2l17-remediation-model.json': {
    stage: certification.stage,
    model: certification.remediationModel,
    modelDigest: certification.remediationModelDigest,
    variantSelected: certification.variantSelected,
    expertIsolation: isolation,
  },
  'stage2l17-ablation.json': { stage: certification.stage, ...certification.ablation },
  'stage2l17-blind-evaluation.json': { stage: certification.stage, ...certification.blind },
  'stage2l17-error-taxonomy-replay.json': { stage: certification.stage, ...certification.taxonomy, fixedPoint: certification.fixedPoint },
  'stage2l17-confidence-evaluation.json': { stage: certification.stage, ...certification.calibration },
  'stage2l17-delegation-evaluation.json': {
    stage: certification.stage,
    delegation: certification.delegation,
    reliabilityPass: certification.reliabilityPass,
    conservativeReliabilityBoundPass: certification.conservativeReliabilityBoundPass,
    minimumDelegationSupportPass: certification.minimumDelegationSupportPass,
    utilityPass: certification.utilityPass,
    harmCeilingPass: certification.harmCeilingPass,
    safeDelegationPass: certification.safeDelegationPass,
  },
  'stage2l17-security-regression.json': {
    stage: certification.stage,
    adversarial: certification.adversarial,
    invariance: certification.invariance,
    freeze,
    expertIsolation: isolation,
    inheritedThresholds: thresholds,
  },
  'stage2l17-portability-report.json': {
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
  frozenOwnersUnchanged: freeze.allUnchanged,
  benchmarkLogicImportedIntoNexus: isolation.importsBenchmarkScoring || isolation.namesGroundTruthSymbols,
  inheritedThresholdsIntact: thresholds.thresholdsIntact,
  inheritedVariantFaithful: certification.expertReproducesInherited,
  variantSelected: certification.variantSelected,
  bestByNet: certification.ablation.bestByNet,
  selectionMatchesEvidence: certification.ablation.selectionMatchesEvidence,
  holdIsNeverOptimal: certification.ablation.holdIsNeverOptimal,
  liveSubstituteDefectReproduced: certification.audits.liveSubstituteDefectReproduced,
  holdBaselineDefectReproduced: certification.audits.holdBaselineDefectReproduced,
  cases: certification.blind.cases,
  primeAccuracy: certification.blind.primeAccuracy,
  inheritedNexusAccuracy: certification.blind.before.accuracy,
  remediatedNexusAccuracy: certification.blind.after.accuracy,
  absoluteImprovementPp: certification.blind.absoluteImprovementPp,
  deadSubstituteAccuracyBefore: certification.blind.before.deadSubstituteRegion.accuracy,
  deadSubstituteAccuracyAfter: certification.blind.after.deadSubstituteRegion.accuracy,
  worseThanHoldErrorRateBefore: certification.blind.before.worseThanHoldErrorRate,
  worseThanHoldErrorRateAfter: certification.blind.after.worseThanHoldErrorRate,
  bypassToRestoreErrorsBefore: certification.blind.before.bypassToRestoreErrorCount,
  bypassToRestoreErrorsAfter: certification.blind.after.bypassToRestoreErrorCount,
  totalErrorsBefore: certification.taxonomy.totalErrorsBefore,
  totalErrorsAfter: certification.taxonomy.totalErrorsAfter,
  netErrorsEliminated: certification.taxonomy.netErrorsEliminated,
  dominantErrorClassBefore: certification.taxonomy.dominantErrorClassBefore,
  dominantErrorClassAfter: certification.taxonomy.dominantErrorClassAfter,
  newlyExposedDominantClass: certification.taxonomy.newlyExposedDominantClass,
  fixedPointImportanceChanged: certification.fixedPoint.fixedPointImportanceChanged,
  qualifyingRuleCount: certification.calibration.qualifyingRuleCount,
  delegatingRuleId: certification.calibration.delegatingRuleId,
  nexusDelegations: certification.delegation.nexusDelegations,
  nexusDelegationPrecision: certification.delegation.nexusDelegationPrecision,
  nexusDelegationLowerBound: certification.delegation.nexusDelegationLowerBound,
  harmfulChanges: certification.delegation.harmfulChanges,
  primeOnlyAccuracy: certification.delegation.primeOnlyAccuracy,
  arbiterAccuracy: certification.delegation.arbiterAccuracy,
  expertRemediationPass: certification.expertRemediationPass,
  liveSubstituteRemediationPass: certification.liveSubstituteRemediationPass,
  holdBaselineRemediationPass: certification.holdBaselineRemediationPass,
  reliabilityPass: certification.reliabilityPass,
  safeDelegationPass: certification.safeDelegationPass,
  securityRegressionPass: certification.securityRegressionPass,
  nexusRemediationOutcome: certification.nexusRemediationOutcome,
  stage2l17Certified: certification.stage2l17Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l17Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
