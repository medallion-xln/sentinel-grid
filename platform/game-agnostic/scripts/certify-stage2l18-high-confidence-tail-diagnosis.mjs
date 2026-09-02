#!/usr/bin/env node
/* Stage 2L.18 — Nexus high-confidence tail error isolation and
 * delegation-boundary diagnosis.
 *
 * DIAGNOSTIC STAGE. Writes only under
 * artifacts/stage2l18-nexus-high-confidence-tail-diagnosis/. Every predecessor is
 * imported frozen. No decision behaviour changes: no expert edit, no new
 * confidence rule, no threshold. Proven by hash, by source scan, and by replaying
 * the Stage 2L.17 expert's own recommendations.
 *
 * Usage:
 *   node scripts/certify-stage2l18-high-confidence-tail-diagnosis.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { deriveGroundTruth } from '../src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js';
import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import {
  STAGE2L18_FROZEN_RULE_ID,
  buildStage2L18Evaluation,
  buildStage2L18PortabilityDigest,
  certifyStage2L18,
} from '../src/lab/stage2l18-high-confidence-tail-diagnosis.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l18-nexus-high-confidence-tail-diagnosis');
const checkOnly = process.argv.includes('--check');

const FROZEN_OWNERS = {
  'src/lab/stage2l17-live-substitute-hold-nexus.js': '14f845d9b767abd5f7dc083fcaadccc3ce799a9750cfbeabdb019fa765a56a59',
  'src/lab/stage2l17-live-substitute-hold-remediation.js': '3736a687cfdc643093f1da7a8f8cc0dbdf9c8a15f5418c4d69855fa7bc78ed05',
  'src/lab/stage2l16-nexus-residual-error-decomposition.js': '06baddc4275c256f33751422d74c713236de3568e960960c590d1db00cea53c2',
  'src/lab/stage2l15-nexus-decision-stability.js': 'c135899cc9a77ca801f08776ba91447e883d3bb09147ade92da40710342183ca',
  'src/lab/stage2l14-nexus-confidence-calibration.js': '0efbef966c7625675244b57a95e706c67c81ddd2c60b871ac3a48f4c07ceeb16',
  'src/lab/stage2l13-value-aware-nexus.js': '31d29c21d8adcdae8f689c676345f389d1b875767c479427bd87652d870ac282',
  'src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js': '2c54345aabedcd3e2e913fb7b4d5d5cbf9dd1ece99f2cf211c3dd76deaea0143',
  'src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js': '7301bc34486f0ae72e310898cd162fb9bd41d7be943b5ada81a5785bcd18a00a',
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

/* A diagnostic stage must not introduce a decision path. Scanned rather than
 * asserted: this module may DESCRIBE the inherited rule it reports on, but must
 * not export a delegation function, restate the reliability floor, or reassign an
 * expert function. */
async function measureDiagnosticDiscipline() {
  const source = await readFile(path.join(root, 'src/lab/stage2l18-high-confidence-tail-diagnosis.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(code);
  const exportsDelegation = /export function\s+\w*[Dd]elegat/.test(code);
  const reassignsExpert = /evaluateStage2L17Nexus\s*=|scoreStage2L17RelationalUtility\s*=/.test(code);
  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    declaresOwnReliabilityFloor: declaresFloor,
    exportsDelegationPath: exportsDelegation,
    reassignsExpertFunctions: reassignsExpert,
    frozenRuleId: STAGE2L18_FROZEN_RULE_ID,
    disciplineHolds: !declaresFloor && !exportsDelegation && !reassignsExpert
      && STAGE2L14_RELIABILITY_FLOOR === 0.99,
  };
}

const freeze = await measureFreeze();
const discipline = await measureDiagnosticDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE2L18_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE2L18_BLOCKED=true reason=DIAGNOSTIC_STAGE_INTRODUCED_BEHAVIOUR');
  console.error(`  ${JSON.stringify(discipline)}`);
  process.exit(2);
}

const evaluation = buildStage2L18Evaluation({ deriveGroundTruthFn: deriveGroundTruth });
const certification = certifyStage2L18({ evaluation });
const portability = buildStage2L18PortabilityDigest(certification);

if (certification.nexusBehaviorChanged) {
  console.error('STAGE2L18_BLOCKED=true reason=NEXUS_BEHAVIOUR_CHANGED');
  process.exit(2);
}

/* The frozen rule this stage reports on must be the one Stage 2L.17 certified. */
const inherited = JSON.parse(await readFile(path.join(root,
  'artifacts/stage2l17-live-substitute-and-hold-remediation/stage2l17-certification-result.json'), 'utf8'));
if (inherited.calibration.delegatingRuleId !== STAGE2L18_FROZEN_RULE_ID) {
  console.error('STAGE2L18_BLOCKED=true reason=FROZEN_RULE_DOES_NOT_MATCH_STAGE2L17');
  console.error(`  stage2l17=${inherited.calibration.delegatingRuleId}  stage2l18=${STAGE2L18_FROZEN_RULE_ID}`);
  process.exit(2);
}

const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-02', digest: '26ff3c5f4e08dd8041b6f92791a47c86153f1cab921462a6b337304c9f33163f' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS'
    : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l18-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L18_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l18-certification-result.json': certification,
  'stage2l18-tail-corpus.json': {
    stage: certification.stage,
    corpusDigest: certification.corpusDigest,
    population: certification.population,
    highConfidenceWrongExplanations: evaluation.explanations,
    highConfidenceCorrectControlSample: evaluation.correctControls,
  },
  'stage2l18-matched-controls.json': { stage: certification.stage, ...certification.matchedControls },
  'stage2l18-feature-audit.json': { stage: certification.stage, ...certification.featureAudit, labelLeakage: certification.labelLeakage },
  'stage2l18-error-taxonomy.json': { stage: certification.stage, ...certification.taxonomy },
  'stage2l18-propagation-analysis.json': { stage: certification.stage, ...certification.propagation },
  'stage2l18-value-diffusion-analysis.json': { stage: certification.stage, ...certification.valueDiffusion },
  'stage2l18-action-analysis.json': { stage: certification.stage, ...certification.actions },
  'stage2l18-counterfactual-analysis.json': { stage: certification.stage, ...certification.counterfactuals },
  'stage2l18-separability-analysis.json': {
    stage: certification.stage,
    ...certification.separability,
    verdict: certification.separabilityVerdict,
  },
  'stage2l18-null-analysis.json': { stage: certification.stage, ...certification.nullAnalysis },
  'stage2l18-security-regression.json': {
    stage: certification.stage,
    behaviour: certification.behaviour,
    invariance: certification.invariance,
    labelLeakage: certification.labelLeakage,
    freeze,
    diagnosticDiscipline: discipline,
  },
  'stage2l18-portability-report.json': {
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
  diagnosticDisciplineHolds: discipline.disciplineHolds,
  nexusBehaviorChanged: certification.nexusBehaviorChanged,
  frozenRuleMatchesStage2L17: true,
  structurallyEligible: certification.population.structurallyEligible,
  confidenceEligible: certification.population.confidenceEligible,
  delegationCandidates: certification.population.delegationCandidates,
  highConfCorrect: certification.population.primaryTail.correct,
  highConfWrong: certification.population.primaryTail.wrong,
  highConfNexusCorrectPrimeWrong: certification.population.primaryTail.nexusCorrectPrimeWrong,
  highConfNexusWrongPrimeCorrect: certification.population.primaryTail.nexusWrongPrimeCorrect,
  highConfidenceWrongInDevelopment: certification.population.highConfidenceWrongInDevelopment,
  sampleTooSmallForRates: certification.population.sampleTooSmallForRates,
  tailDominantErrorClass: certification.taxonomy.tailDominantClass,
  tailDominantErrorShare: certification.taxonomy.tailDominantShare,
  tailSecondErrorClass: certification.taxonomy.tailSecondClass,
  tailSecondErrorShare: certification.taxonomy.tailSecondShare,
  tailExplainedShare: certification.taxonomy.tailExplainedShare,
  globalDominantErrorClass: certification.taxonomy.globalDominantClass,
  tailIsActionHomogeneous: certification.actions.tailIsActionHomogeneous,
  actionKindsPresentInTail: certification.actions.actionKindsPresentInTail,
  dominantErrorAction: certification.actions.dominantErrorAction,
  highConfWrongPropagationRate: certification.propagation.highConfWrongPropagationRate,
  highConfCorrectPropagationRate: certification.propagation.highConfCorrectPropagationRate,
  iterativeDiagnosticFixesTailErrors: certification.propagation.iterativeDiagnosticFixesTailErrors,
  propagationLimitDetected: certification.propagation.propagationLimitDetected,
  highConfWrongValueDiffuseRate: certification.valueDiffusion.highConfWrongValueDiffuseRate,
  highConfCorrectValueDiffuseRate: certification.valueDiffusion.highConfCorrectValueDiffuseRate,
  valueModelLimitDetected: certification.valueDiffusion.valueModelLimitDetected,
  bestDecisionTimeSignal: certification.featureAudit.secondaryBand.bestFeature,
  bestSignalDiscrimination: certification.featureAudit.secondaryBand.bestDiscrimination,
  bestDevelopmentRule: certification.separability.best?.id ?? null,
  developmentLift: certification.separabilityVerdict.developmentLift,
  calibrationLift: certification.separabilityVerdict.calibrationLift,
  finalHoldoutLift: certification.separabilityVerdict.finalHoldoutLift,
  nullMedian: certification.nullAnalysis.nullMedian,
  nullP95: certification.nullAnalysis.nullP95,
  nullP99: certification.nullAnalysis.nullP99,
  signalExceedsNull: certification.separableSignal,
  counterfactualClasses: certification.counterfactuals.classificationCounts,
  nexusTailIdentifiabilityStatus: certification.nexusTailIdentifiabilityStatus,
  nexus099Feasibility: certification.nexus099Feasibility,
  labelLeakageDetected: certification.labelLeakageDetected,
  securityRegressionPass: certification.securityRegressionPass,
  stage2l18Outcome: certification.stage2l18Outcome,
  stage2l18Certified: certification.stage2l18Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l18Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
