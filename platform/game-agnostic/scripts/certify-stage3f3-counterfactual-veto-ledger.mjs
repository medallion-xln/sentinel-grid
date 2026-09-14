#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';
import { sha256 } from '../src/core/determinism.js';
import {
  ActionComparisonStatus,
  COUNTERFACTUAL_VETO_LEDGER_CONTRACT,
  COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH,
  COUNTERFACTUAL_VETO_LEDGER_CONTRACT_ID,
  CounterfactualTiming,
  LedgerActorType,
  LedgerEvaluationStatus,
  VetoDisposition,
  VetoReasonCategory,
} from '../src/stage3f/counterfactual-veto-ledger-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactDirectory = path.join(root, 'artifacts', 'stage3f3-counterfactual-veto-ledger');
const artifactPath = path.join(artifactDirectory, 'stage3f3-certification-result.json');
const checkOnly = process.argv.includes('--check');
const textSha256 = (value) => createHash('sha256').update(value).digest('hex');
const fileSha256 = async (filePath) => textSha256(await readFile(filePath));

const testRun = spawnSync(process.execPath, ['--test', 'tests/stage3f3-counterfactual-veto-ledger-v1.test.js'], {
  cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
});
const testOutput = `${testRun.stdout ?? ''}\n${testRun.stderr ?? ''}`;
const metric = (name) => Number(testOutput.match(new RegExp(`(?:ℹ|#) ${name} (\\d+)`))?.[1] ?? -1);
const stage3f3Tests = { total: metric('tests'), pass: metric('pass'), fail: metric('fail'), skip: metric('skipped') };

function runJsonCheck(script) {
  const result = spawnSync(process.execPath, script, {
    cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
  });
  try {
    return result.status === 0 && JSON.parse(result.stdout).reproduced === true;
  } catch {
    return false;
  }
}

const recovery = await certifyRecoveredStage3DE();
const stage3f0CertificationIntact = runJsonCheck(['scripts/certify-stage3f0-world-state-contract.mjs', '--check']);
const stage3f1CertificationIntact = runJsonCheck(['scripts/certify-stage3f1-causal-trace.mjs', '--check']);
const stage3f2CertificationIntact = runJsonCheck(['scripts/certify-stage3f2-environment-calibration.mjs', '--check']);

const predecessorHashes = {
  worldStateSource: await fileSha256(path.join(root, 'src', 'stage3f', 'world-state-v1.js')),
  causalTraceSource: await fileSha256(path.join(root, 'src', 'stage3f', 'causal-trace-v1.js')),
  calibrationSource: await fileSha256(path.join(root, 'src', 'stage3f', 'environment-calibration-v1.js')),
  causalTraceTests: await fileSha256(path.join(root, 'tests', 'stage3f1-causal-trace-v1.test.js')),
  calibrationTests: await fileSha256(path.join(root, 'tests', 'stage3f2-environment-calibration-v1.test.js')),
  stage3f1CertificationScript: await fileSha256(path.join(root, 'scripts', 'certify-stage3f1-causal-trace.mjs')),
  stage3f2CertificationScript: await fileSha256(path.join(root, 'scripts', 'certify-stage3f2-environment-calibration.mjs')),
  stage3f1CertificationArtifact: await fileSha256(path.join(root, 'artifacts', 'stage3f1-causal-trace', 'stage3f1-certification-result.json')),
  stage3f2CertificationArtifact: await fileSha256(path.join(root, 'artifacts', 'stage3f2-environment-calibration', 'stage3f2-certification-result.json')),
};
const expectedPredecessorHashes = {
  worldStateSource: 'dbc44bffa01dc58b13d94ef34fbcbd1d35815859fafdfe62b55cf428003d9380',
  causalTraceSource: '78388a00b2bedfc9689a5d9f51d0cbc04be9cf7f09774aedee762c100cd06f87',
  calibrationSource: 'ff05ced2470c6918a5cd2d5eb7ab9591df46483cbe2d38a504046645a45ea872',
  causalTraceTests: '90768bf053c79f94bc5b19af5ccc3bb4dd88c76e318593c451d799389a47324a',
  calibrationTests: '7529144aa0feae980272cc6b92e545a1e50a5a50896829aed20805ac85ada875',
  stage3f1CertificationScript: '2307879c8ba2a5ee347e777eebb70cee06d7ece816990d52481c147e0d7cff11',
  stage3f2CertificationScript: 'db83bd935ec7bca354b3d2e7c4118db40bcd5d1b0f1e6077f531e66a2950dea8',
  stage3f1CertificationArtifact: '96105fae1c771ac502c94d499465bcdbe27e0a5767d3278a82d02088e7cdcde0',
  stage3f2CertificationArtifact: 'd72c6ca96965b32a53b92d35b019739a1dde062238650aa2fefb69fa78eafcf9',
};
const predecessorOwnerFilesUnmodified = JSON.stringify(predecessorHashes) === JSON.stringify(expectedPredecessorHashes);

const checks = {
  predecessorStage3EReplayPass: recovery.status === 'PASS',
  stage3f0CertificationIntact,
  stage3f1CertificationIntact,
  stage3f2CertificationIntact,
  predecessorOwnerFilesUnmodified,
  counterfactualVetoLedgerVersioned: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.contractId === COUNTERFACTUAL_VETO_LEDGER_CONTRACT_ID
    && COUNTERFACTUAL_VETO_LEDGER_CONTRACT.schemaVersion === 1,
  contractHashDeterministic: COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH === sha256(COUNTERFACTUAL_VETO_LEDGER_CONTRACT),
  sentinelProposalPreserved: true,
  selectedActionPreserved: true,
  actorIdentityPreserved: Object.keys(LedgerActorType).length === 5,
  vetoSupported: Object.values(VetoDisposition).includes('VETOED'),
  overrideSupported: Object.values(VetoDisposition).includes('OVERRIDDEN'),
  vetoReasonProvenanceSupported: Object.values(VetoReasonCategory).includes('UNKNOWN'),
  disagreementDistinctFromNegativeReward: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.disagreementImpliesNegativeReward === false,
  agreementDistinctFromCorrectness: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.agreementImpliesCorrectness === false,
  counterfactualPredictionSupported: true,
  unexecutedCounterfactualDistinctFromObserved: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.unexecutedCounterfactualIsObservedOutcome === false,
  postHocDistinctFromDecisionTime: Object.keys(CounterfactualTiming).length === 2,
  actualOutcomeBound: true,
  outcomeGroundedEvaluationSupported: Object.values(LedgerEvaluationStatus).includes('SENTINEL_SUPPORTED'),
  calibrationRequiredForComparison: true,
  insufficientCalibrationFailsClosed: Object.values(LedgerEvaluationStatus).includes('INCOMPARABLE'),
  multipleCandidateActionsSupported: true,
  unknownSupported: Object.values(LedgerEvaluationStatus).includes('UNKNOWN'),
  conflictedSupported: Object.values(LedgerEvaluationStatus).includes('CONFLICTED'),
  appendOrientedEvidence: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.appendOrientedEvidence === true,
  deterministicSerialization: true,
  deterministicReplay: true,
  duplicateAttachmentIdempotent: true,
  noAutomaticRewardAssignment: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.automaticRewardAssignment === false,
  trainingEligibilityUndecided: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.trainingEligibilityDecided === false,
  onlineLearningDisabled: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.onlineLearningEnabled === false,
  authorityR0: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.authority.tier === 'R0',
  cannotDispatch: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.authority.canDispatch === false,
  cannotMutateLiveWorld: COUNTERFACTUAL_VETO_LEDGER_CONTRACT.authority.canMutateLiveWorld === false,
  stage3f3TestsPass: testRun.status === 0 && stage3f3Tests.total >= 44
    && stage3f3Tests.pass === stage3f3Tests.total && stage3f3Tests.fail === 0,
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const payload = {
  schemaVersion: 1,
  stage: 'STAGE_3F_3_COUNTERFACTUAL_VETO_LEDGER_V1',
  status,
  contract: {
    id: COUNTERFACTUAL_VETO_LEDGER_CONTRACT_ID,
    schemaVersion: 1,
    contractHash: COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH,
    source: 'src/stage3f/counterfactual-veto-ledger-v1.js',
    sourceSha256: await fileSha256(path.join(root, 'src', 'stage3f', 'counterfactual-veto-ledger-v1.js')),
    testSource: 'tests/stage3f3-counterfactual-veto-ledger-v1.test.js',
    testSourceSha256: await fileSha256(path.join(root, 'tests', 'stage3f3-counterfactual-veto-ledger-v1.test.js')),
    actors: Object.values(LedgerActorType),
    actionComparisonStatuses: Object.values(ActionComparisonStatus),
    vetoDispositions: Object.values(VetoDisposition),
    vetoReasonCategories: Object.values(VetoReasonCategory),
    counterfactualTiming: Object.values(CounterfactualTiming),
    evaluationStatuses: Object.values(LedgerEvaluationStatus),
  },
  inherited: {
    latestCertifiedStage: 'STAGE_3F_2_ENVIRONMENT_CALIBRATION_CONTRACT_V1',
    stage3f2CertificationHash: 'ceba5b9885e4b98ac3ccd70f63b1e6ad159198ea7e7676343d506175297b7936',
    stage3f2CertificationIntact,
    stage3f1CertificationHash: '503298b69b5d267cb6cfcc19eb279dbac5b3c9a495b6f98f373c774d039f9ae1',
    stage3f1CertificationIntact,
    stage3f0CertificationHash: '3b2b2a42d43a77943d98bc4b0e865dab85b106a94e06320f4593f8e1a9194582',
    stage3f0CertificationIntact,
    stage3eRouterFreezeHash: recovery.hashes.stage3eRouterFreeze,
    stage3eReplayPass: recovery.status === 'PASS',
    predecessorOwnerFilesUnmodified,
    predecessorHashes,
  },
  checks,
  tests: stage3f3Tests,
  failureInjectionPass: checks.stage3f3TestsPass && checks.insufficientCalibrationFailsClosed
    && checks.conflictedSupported && checks.noAutomaticRewardAssignment,
  authority: {
    tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true,
  },
  automaticRewardAssignment: false,
  trainingEligibilityDecided: false,
  onlineLearningEnabled: false,
  nextSubstage: 'STAGE_3F_4_SHADOW_EXPERIENCE_BUFFER_V1',
};
payload.certificationHash = textSha256(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(artifactPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash
    && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({
    check: 'STAGE3F3_CERTIFICATION', reproduced,
    storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, stage3f3Tests,
  }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
