#!/usr/bin/env node
/* Stage 2L.12 — Nexus semantic grounding, observable utility, and relational
 * correctness certification.
 *
 * BENCHMARK REMEDIATION + MEASUREMENT STAGE. Writes only under
 * artifacts/stage2l12-nexus-semantic-grounding-and-observable-utility/.
 * Nexus, the Stage 2L.10 arbiter, its frozen calibration and the evidence
 * contract are imported frozen and never modified.
 *
 * Usage:
 *   node scripts/certify-stage2l12-nexus-semantic-grounding-and-observable-utility.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  buildStage2L12Evaluation,
  buildStage2L12PortabilityDigest,
  certifyStage2L12,
} from '../src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l12-nexus-semantic-grounding-and-observable-utility');
const checkOnly = process.argv.includes('--check');

/* Frozen owners. A benchmark-remediation stage that silently re-measured a
 * mutated expert or a re-tuned arbiter would prove nothing. */
const FROZEN_OWNERS = {
  'src/experts/nexus.js': '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  'src/lab/stage2l11-nexus-semantic-identifiability-and-decision-utility.js': 'db44349ec867bab7abca48f04341388ab098a333fe1bbe2d362350ef453d2e18',
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

const freeze = await measureFreeze();
if (!freeze.allUnchanged) {
  console.error('STAGE2L12_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}

const evaluation = buildStage2L12Evaluation();
const certification = certifyStage2L12({ evaluation });
const portability = buildStage2L12PortabilityDigest(certification);

/* Recorded cross-platform evidence — actual measured runs, never expectations.
 * Stage 2L.10 and 2L.11 remain DIGEST_PRODUCED_SINGLE_PLATFORM; Stage 2L.12 does
 * not change that and portability stays an explicit later item. */
const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-01', digest: 'f20be2f9bb0c913b53f788ef3eafc42bb2f602b0003b18d75879a9a9060d4644' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS'
    : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l12-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L12_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

const { rows, ...evidenceBody } = evaluation;
await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l12-certification-result.json': certification,
  'stage2l12-evidence.json': { stage: certification.stage, evidenceDigest: certification.evidenceDigest, ...evidenceBody },
  'stage2l12-semantic-model.json': { stage: certification.stage, ...evaluation.semanticModel },
  'stage2l12-objective-function.json': {
    stage: certification.stage,
    objectiveModel: evaluation.semanticModel.objectiveModel,
    objectiveModelDigest: evaluation.semanticModel.objectiveModelDigest,
    consequenceModel: evaluation.semanticModel.consequenceModel,
    consequenceModelDigest: evaluation.semanticModel.consequenceModelDigest,
  },
  'stage2l12-corpus-manifest.json': { stage: certification.stage, corpus: evaluation.corpus, discoveryValidation: evaluation.discoveryValidation },
  'stage2l12-ground-truth-validation.json': { stage: certification.stage, validation: evaluation.validation },
  'stage2l12-nexus-evaluation.json': { stage: certification.stage, nexusEvaluation: evaluation.nexusEvaluation },
  'stage2l12-identifiability-analysis.json': {
    stage: certification.stage,
    analysis: evaluation.analysis,
    ruleSearch: evaluation.ruleSearch,
    generalization: evaluation.generalization,
    classification: evaluation.classification,
  },
  'stage2l12-holdout-manifest.json': { stage: certification.stage, corpus: evaluation.corpus, labelLeakage: evaluation.labelLeakage, replay: evaluation.replay },
  'stage2l12-delegation-evaluation.json': { stage: certification.stage, delegation: evaluation.delegation, security: evaluation.security },
  'stage2l12-freeze-report.json': { stage: certification.stage, ...freeze },
  'stage2l12-portability-report.json': {
    portabilityDigestVersion: 1,
    stage: certification.stage,
    digest: portability.digest,
    portabilityStatus,
    platformsPassed,
    measuredPlatforms: recorded,
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
  semanticGroundingValid: certification.semanticGroundingValid,
  groundTruthDerivedFromWorldState: certification.groundTruth.groundTruthDerivedFromWorldState,
  independentRandomCorrectnessLabel: certification.groundTruth.independentRandomCorrectnessLabel,
  discoveryCases: certification.corpus.discoveryCases,
  holdoutCases: certification.corpus.holdoutCases,
  holdoutDecidable: certification.corpus.holdoutDecidable,
  legalActionsEvaluated: certification.groundTruth.legalActionsEvaluated,
  tieRate: certification.groundTruth.tieRate,
  bestTrivialBaselineAccuracy: certification.groundTruth.bestTrivialBaselineAccuracy,
  randomChoiceBaseline: certification.groundTruth.randomChoiceBaseline,
  nexusAccuracy: certification.nexusEvaluation.nexusAccuracy,
  nexusAccuracyWhenRecommending: certification.nexusEvaluation.nexusAccuracyWhenRecommending,
  primeAccuracy: certification.nexusEvaluation.primeAccuracy,
  nexusBeatsBestTrivialBaseline: certification.nexusEvaluation.nexusBeatsBestTrivialBaseline,
  groundedNexusIdentifiabilityStatus: certification.identifiability.status,
  bestSignal: certification.identifiability.bestSignal,
  bestSignalTier: certification.identifiability.bestSignalTier,
  bestDiscrimination: certification.identifiability.bestDiscrimination,
  perTierBestGap: certification.identifiability.perTierBestGap,
  permutationNullP95: certification.identifiability.permutationNull.p95,
  generalizationPass: certification.generalization.generalizes,
  nexusDelegations: certification.delegation.nexusDelegations,
  nexusHarmRate: certification.delegation.nexusHarmRate,
  labelLeakageDetected: certification.labelLeakageDetected,
  measuredLimitation: certification.interpretation.measuredLimitation,
  stage2l12Certified: certification.stage2l12Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l12Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
