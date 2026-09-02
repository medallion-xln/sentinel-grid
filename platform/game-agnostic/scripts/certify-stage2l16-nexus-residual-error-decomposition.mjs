#!/usr/bin/env node
/* Stage 2L.16 — Nexus residual error decomposition and risk-aware reasoning
 * diagnosis.
 *
 * DIAGNOSTIC STAGE. Writes only under
 * artifacts/stage2l16-nexus-residual-error-decomposition/. Every predecessor is
 * imported frozen. This stage changes NO decision behaviour: it adds no signal to
 * the expert, no rule to the arbiter and no threshold anywhere. That claim is
 * proven three ways below — frozen owner hashes, a source scan for remediation
 * edits, and a measured replay of the expert's own recommendations.
 *
 * Usage:
 *   node scripts/certify-stage2l16-nexus-residual-error-decomposition.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  STAGE2L16_HIGH_CONFIDENCE_RISK,
  STAGE2L16_HIGH_CONFIDENCE_MARGIN,
  buildStage2L16Evaluation,
  buildStage2L16PortabilityDigest,
  certifyStage2L16,
} from '../src/lab/stage2l16-nexus-residual-error-decomposition.js';
import { STAGE2L15_RELIABILITY_FLOOR } from '../src/lab/stage2l15-nexus-decision-stability.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l16-nexus-residual-error-decomposition');
const checkOnly = process.argv.includes('--check');

/* Frozen owners. A diagnosis of an expert that moved while being diagnosed is
 * worthless, and the whole point of this stage is that the expert did NOT move. */
const FROZEN_OWNERS = {
  'src/lab/stage2l15-nexus-decision-stability.js': 'c135899cc9a77ca801f08776ba91447e883d3bb09147ade92da40710342183ca',
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

/* A diagnostic stage must not quietly introduce a threshold or a delegation
 * decision. Checked by scanning this stage's own module: it may DEFINE the
 * inherited high-confidence region it reports on, but must not export a
 * delegation path or restate the reliability floor. */
async function measureDiagnosticDiscipline() {
  const source = await readFile(path.join(root, 'src/lab/stage2l16-nexus-residual-error-decomposition.js'), 'utf8');
  const declaresFloor = /STAGE2L16_RELIABILITY_FLOOR\s*=/.test(source);
  const declaresDelegation = /export function\s+\w*[Dd]elegat/.test(source);
  const mutatesExpert = /evaluateValueAwareNexus\s*=|scoreRelationalUtility\s*=/.test(source);
  return {
    inheritedFloorUnchanged: STAGE2L15_RELIABILITY_FLOOR === 0.99,
    declaresOwnReliabilityFloor: declaresFloor,
    exportsDelegationPath: declaresDelegation,
    reassignsExpertFunctions: mutatesExpert,
    highConfidenceRegionInherited: {
      minRiskAdjustment: STAGE2L16_HIGH_CONFIDENCE_RISK,
      minUtilityMargin: STAGE2L16_HIGH_CONFIDENCE_MARGIN,
      source: 'STAGE2L14',
    },
    disciplineHolds: !declaresFloor && !declaresDelegation && !mutatesExpert
      && STAGE2L15_RELIABILITY_FLOOR === 0.99,
  };
}

const freeze = await measureFreeze();
const discipline = await measureDiagnosticDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE2L16_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE2L16_BLOCKED=true reason=DIAGNOSTIC_STAGE_INTRODUCED_BEHAVIOUR');
  console.error(`  ${JSON.stringify(discipline)}`);
  process.exit(2);
}

const evaluation = buildStage2L16Evaluation();
const certification = certifyStage2L16({ evaluation });
const portability = buildStage2L16PortabilityDigest(certification);

/* The probe baseline must reproduce the frozen expert on every case. If it does
 * not, every coverage number below is measured against a fiction. */
if (!certification.probes.probeBaselineFaithful) {
  console.error('STAGE2L16_BLOCKED=true reason=PROBE_BASELINE_DOES_NOT_REPRODUCE_FROZEN_EXPERT');
  process.exit(2);
}
if (certification.nexusBehaviorChanged) {
  console.error('STAGE2L16_BLOCKED=true reason=NEXUS_BEHAVIOUR_CHANGED');
  process.exit(2);
}

/* Recorded cross-platform evidence — actual measured runs, never expectations.
 * Stage 2L.10 through 2L.15 remain DIGEST_PRODUCED_SINGLE_PLATFORM; Stage 2L.16
 * does not change that and portability stays an explicit later item. */
const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-02', digest: '2da168bbd58c968911d03697a2ff59ce7f922c8b59bd7b71721f697613729e71' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS'
    : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l16-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L16_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l16-certification-result.json': certification,
  'stage2l16-residual-error-corpus.json': {
    stage: certification.stage,
    corpus: { split: 'HOLDOUT', from: 0, to: 42000, decidableOnly: true },
    corpusDigest: certification.corpusDigest,
    population: certification.population,
    matchedControls: certification.matchedControls,
    highConfidenceExplanations: certification.highConfidenceExplanations ?? evaluation.highConfidenceExplanations,
    sampleExplanations: evaluation.sampleExplanations,
  },
  'stage2l16-error-taxonomy.json': {
    stage: certification.stage,
    ...certification.taxonomy,
    mechanismProbes: certification.probes,
  },
  'stage2l16-risk-analysis.json': { stage: certification.stage, ...certification.risk },
  'stage2l16-cycle-analysis.json': { stage: certification.stage, ...certification.cycles },
  'stage2l16-value-diffusion-analysis.json': { stage: certification.stage, ...certification.valueDiffusion },
  'stage2l16-ranking-analysis.json': { stage: certification.stage, ...certification.ranking },
  'stage2l16-counterfactual-analysis.json': { stage: certification.stage, ...certification.counterfactuals },
  'stage2l16-remediation-candidates.json': {
    stage: certification.stage,
    ...certification.remediation,
    feasibility: certification.feasibility,
    interpretation: certification.interpretation,
  },
  'stage2l16-security-regression.json': {
    stage: certification.stage,
    behaviour: certification.behaviour,
    ordering: certification.ordering,
    labelLeakage: certification.labelLeakage,
    freeze,
    diagnosticDiscipline: discipline,
  },
  'stage2l16-portability-report.json': {
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
  probeBaselineFaithful: certification.probes.probeBaselineFaithful,
  decidableCases: certification.population.decidableCases,
  nexusAccuracy: certification.population.nexusAccuracy,
  primeAccuracy: certification.population.primeAccuracy,
  totalNexusWrong: certification.population.totalNexusWrong,
  highConfidenceNexusWrong: certification.population.highConfidenceWrong,
  nexusWrongPrimeCorrect: certification.population.nexusWrongPrimeCorrect,
  delegationEligibleWrong: certification.population.delegationEligibleWrong,
  dominantErrorClass: certification.dominantErrorClass,
  dominantErrorShare: certification.dominantErrorShare,
  secondErrorClass: certification.secondErrorClass,
  secondErrorShare: certification.secondErrorShare,
  thirdErrorClass: certification.thirdErrorClass,
  thirdErrorShare: certification.thirdErrorShare,
  explainedErrorShare: certification.taxonomy.explainedShare,
  unclassifiedErrorShare: certification.taxonomy.unclassifiedShare,
  highConfidenceDominantClass: certification.taxonomy.highConfidenceDominantClass,
  riskDominatedAccuracy: certification.risk.riskDominatedAccuracy,
  nonRiskDominatedAccuracy: certification.risk.nonRiskDominatedAccuracy,
  nonlinearRiskDefectDetected: certification.risk.nonlinearRiskDefectDetected,
  cycleAccuracy: certification.cycles.cycleAccuracy,
  nonCycleAccuracy: certification.cycles.nonCycleAccuracy,
  fixedPointReasoningCandidate: certification.cycles.fixedPointReasoningCandidate,
  iterativeDiagnosticMarginal: certification.cycles.iterativeDiagnosticMarginal,
  valueDiffuseAccuracy: certification.valueDiffusion.valueDiffuseAccuracy,
  valueConcentratedAccuracy: certification.valueDiffusion.valueConcentratedAccuracy,
  valueDiffusionDefectDetected: certification.valueDiffusion.valueDiffusionDefectDetected,
  nearMissShare: certification.ranking.nearMissShare,
  fundamentalMisorderShare: certification.ranking.fundamentalMisorderShare,
  chosenWorseThanHoldShare: certification.ranking.chosenWorseThanHoldShare,
  boundarySensitiveErrorShare: certification.counterfactuals.boundarySensitiveErrorShare,
  deepModelErrorShare: certification.counterfactuals.deepModelErrorShare,
  topCandidate: certification.remediation.topCandidate?.id ?? null,
  topCandidateErrorShareFixed: certification.remediation.topCandidate?.measuredErrorShareFixed ?? 0,
  secondCandidate: certification.remediation.secondCandidate?.id ?? null,
  secondCandidateErrorShareFixed: certification.remediation.secondCandidate?.measuredErrorShareFixed ?? 0,
  nexus099Feasibility: certification.nexus099Feasibility,
  estimatedRemediableErrorShare: certification.feasibility.estimatedRemediableErrorShare,
  labelLeakageDetected: certification.labelLeakageDetected,
  securityRegressionPass: certification.securityRegressionPass,
  nexusResidualErrorOutcome: certification.nexusResidualErrorOutcome,
  stage2l16Certified: certification.stage2l16Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l16Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
