#!/usr/bin/env node
/* Stage 2L.13 — Value-aware Nexus relational utility certification.
 *
 * EXPERT-REMEDIATION STAGE. Writes only under
 * artifacts/stage2l13-value-aware-nexus-relational-utility/.
 * The Stage 2L.12 benchmark, the inherited Nexus expert, the Stage 2L.10 arbiter
 * and its frozen calibration are all imported frozen and never modified.
 *
 * Usage:
 *   node scripts/certify-stage2l13-value-aware-nexus-relational-utility.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  buildStage2L13Evaluation,
  certifyStage2L13,
} from '../src/lab/stage2l13-value-aware-nexus-relational-utility.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l13-value-aware-nexus-relational-utility');
const checkOnly = process.argv.includes('--check');

/* Frozen owners. Remediating an expert while its benchmark or the arbiter shifted
 * underneath would make the measured improvement meaningless. */
const FROZEN_OWNERS = {
  'src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js': '2c54345aabedcd3e2e913fb7b4d5d5cbf9dd1ece99f2cf211c3dd76deaea0143',
  'src/experts/nexus.js': '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  'src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js': '7301bc34486f0ae72e310898cd162fb9bd41d7be943b5ada81a5785bcd18a00a',
  'src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js': '5047dc0576b8242c00a1f73729c4b0bc49fc1d181eac22bc90896d2cf5cccc00',
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

/* Structural guarantee: the value-aware expert must not import the benchmark's
 * scoring machinery. Checked here, not merely asserted in prose. */
async function measureExpertIsolation() {
  const source = await readFile(path.join(root, 'src/lab/stage2l13-value-aware-nexus.js'), 'utf8');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  const forbidden = imports.filter((specifier) => /stage2l12|stage2l10|deriveGroundTruth|objectiveUtility/.test(specifier));
  return {
    imports,
    forbiddenImports: forbidden,
    importsBenchmarkScoring: forbidden.length > 0,
    mentionsGroundTruthSymbols: /deriveGroundTruth|objectiveUtility|applyAction\s*\(/.test(source),
  };
}

const freeze = await measureFreeze();
const isolation = await measureExpertIsolation();
if (!freeze.allUnchanged) {
  console.error('STAGE2L13_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (isolation.importsBenchmarkScoring) {
  console.error('STAGE2L13_BLOCKED=true reason=EXPERT_IMPORTS_BENCHMARK_SCORING');
  console.error(`  forbidden imports: ${isolation.forbiddenImports.join(', ')}`);
  process.exit(2);
}

const evaluation = buildStage2L13Evaluation();
const certification = certifyStage2L13({ evaluation });

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l13-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L13_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

const { rows, ...evidenceBody } = evaluation;
await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l13-certification-result.json': certification,
  'stage2l13-evidence.json': { stage: certification.stage, evidenceDigest: certification.evidenceDigest, ...evidenceBody },
  'stage2l13-nexus-gap-audit.json': { stage: certification.stage, ...evaluation.gapAudit },
  'stage2l13-relational-utility-model.json': {
    stage: certification.stage,
    model: evaluation.relationalUtilityModel,
    modelDigest: evaluation.relationalUtilityModelDigest,
    expertIsolation: isolation,
  },
  'stage2l13-blind-evaluation.json': { stage: certification.stage, blindEvaluation: certification.blindEvaluation },
  'stage2l13-identifiability-analysis.json': {
    stage: certification.stage,
    analysis: evaluation.analysis,
    ruleSearch: evaluation.ruleSearch,
    generalization: evaluation.generalization,
    calibration: evaluation.calibration,
  },
  'stage2l13-holdout-manifest.json': { stage: certification.stage, corpus: evaluation.corpus, labelLeakage: evaluation.labelLeakage, invariance: evaluation.invariance },
  'stage2l13-security-regression.json': { stage: certification.stage, adversarial: evaluation.adversarial, invariance: evaluation.invariance, freeze, expertIsolation: isolation },
  'stage2l13-delegation-evaluation.json': { stage: certification.stage, delegation: evaluation.delegation, calibration: evaluation.calibration },
  'stage2l13-freeze-report.json': { stage: certification.stage, ...freeze, expertIsolation: isolation },
})) {
  await writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}
`);
}

console.log(JSON.stringify({
  stage: certification.stage,
  status: certification.status,
  authority: certification.authority,
  frozenOwnersUnchanged: freeze.allUnchanged,
  expertImportsBenchmarkScoring: isolation.importsBenchmarkScoring,
  benchmarkUnchanged: certification.freeze.benchmarkUnchanged,
  decidableCases: certification.corpus.holdoutDecidable,
  randomBaseline: certification.blindEvaluation.randomBaseline,
  primeAccuracy: certification.blindEvaluation.primeAccuracy,
  inheritedNexusAccuracy: certification.blindEvaluation.inherited.accuracy,
  remediatedNexusAccuracy: certification.blindEvaluation.remediated.accuracy,
  absoluteImprovementPp: certification.blindEvaluation.absoluteImprovementPp,
  structureValueDecoupledBefore: certification.blindEvaluation.structureValueDecoupled.inheritedAccuracy,
  structureValueDecoupledAfter: certification.blindEvaluation.structureValueDecoupled.remediatedAccuracy,
  structureValueDecoupledGainPp: certification.blindEvaluation.structureValueDecoupledGainPp,
  bestNexusEmittedSignal: certification.identifiability.bestNexusEmittedSignal,
  bestNexusEmittedDiscrimination: certification.identifiability.bestNexusEmittedDiscrimination,
  permutationNullP95: certification.identifiability.permutationNull.p95,
  selfCorrectnessIdentifiable: certification.identifiability.selfCorrectnessIdentifiable,
  bestEligibleBucketReliability: certification.bestEligibleBucketReliability,
  nexusDelegations: certification.delegation.nexusDelegations,
  nexusHarmRate: certification.delegation.nexusHarmRate,
  nexusSafeForSelectiveDelegation: certification.nexusSafeForSelectiveDelegation,
  nexusRemediationOutcome: certification.nexusRemediationOutcome,
  nexusRemediationOutcomeQualifier: certification.nexusRemediationOutcomeQualifier,
  labelLeakageDetected: certification.labelLeakageDetected,
  securityRegressionPass: certification.securityRegressionPass,
  stage2l13Certified: certification.stage2l13Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
}, null, 2));

process.exit(certification.stage2l13Certified ? 0 : 1);
