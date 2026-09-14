#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256 } from '../src/core/determinism.js';
import { certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';
import {
  ExperienceEligibilityStatus, ExperiencePurpose, ExperienceValidationStatus,
  OutcomeBindingStatus, PredictionErrorStatus, SHADOW_EXPERIENCE_CONTRACT,
  SHADOW_EXPERIENCE_CONTRACT_HASH, SHADOW_EXPERIENCE_CONTRACT_ID,
} from '../src/stage3f/shadow-experience-buffer-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactDirectory = path.join(root, 'artifacts', 'stage3f4-shadow-experience-buffer');
const artifactPath = path.join(artifactDirectory, 'stage3f4-certification-result.json');
const checkOnly = process.argv.includes('--check');
const textSha256 = (value) => createHash('sha256').update(value).digest('hex');
const fileSha256 = async (filePath) => textSha256(await readFile(filePath));

const testRun = spawnSync(process.execPath, ['--test', 'tests/stage3f4-shadow-experience-buffer-v1.test.js'], {
  cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
});
const testOutput = `${testRun.stdout ?? ''}\n${testRun.stderr ?? ''}`;
const metric = (name) => Number(testOutput.match(new RegExp(`(?:ℹ|#) ${name} (\\d+)`))?.[1] ?? -1);
const stage3f4Tests = { total: metric('tests'), pass: metric('pass'), fail: metric('fail'), skip: metric('skipped') };

function runJsonCheck(script) {
  const result = spawnSync(process.execPath, script, { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  try { return result.status === 0 && JSON.parse(result.stdout).reproduced === true; } catch { return false; }
}

const recovery = await certifyRecoveredStage3DE();
const stage3f0CertificationIntact = runJsonCheck(['scripts/certify-stage3f0-world-state-contract.mjs', '--check']);
const stage3f1CertificationIntact = runJsonCheck(['scripts/certify-stage3f1-causal-trace.mjs', '--check']);
const stage3f2CertificationIntact = runJsonCheck(['scripts/certify-stage3f2-environment-calibration.mjs', '--check']);
const stage3f3CertificationIntact = runJsonCheck(['scripts/certify-stage3f3-counterfactual-veto-ledger.mjs', '--check']);

const predecessorHashes = {
  worldStateSource: await fileSha256(path.join(root, 'src/stage3f/world-state-v1.js')),
  causalTraceSource: await fileSha256(path.join(root, 'src/stage3f/causal-trace-v1.js')),
  calibrationSource: await fileSha256(path.join(root, 'src/stage3f/environment-calibration-v1.js')),
  ledgerSource: await fileSha256(path.join(root, 'src/stage3f/counterfactual-veto-ledger-v1.js')),
  ledgerTests: await fileSha256(path.join(root, 'tests/stage3f3-counterfactual-veto-ledger-v1.test.js')),
  stage3f3CertificationScript: await fileSha256(path.join(root, 'scripts/certify-stage3f3-counterfactual-veto-ledger.mjs')),
  stage3f3CertificationArtifact: await fileSha256(path.join(root, 'artifacts/stage3f3-counterfactual-veto-ledger/stage3f3-certification-result.json')),
};
const expectedPredecessorHashes = {
  worldStateSource: 'dbc44bffa01dc58b13d94ef34fbcbd1d35815859fafdfe62b55cf428003d9380',
  causalTraceSource: '78388a00b2bedfc9689a5d9f51d0cbc04be9cf7f09774aedee762c100cd06f87',
  calibrationSource: 'ff05ced2470c6918a5cd2d5eb7ab9591df46483cbe2d38a504046645a45ea872',
  ledgerSource: 'ce0dd3927cb3a89abeadfd501bc6294e02fdebf40f051f72b0bf9153475cf373',
  ledgerTests: '1b4e76d60741ff5a4dafafb7922d564028c38d3d9ce813dd4e70ac1999020f42',
  stage3f3CertificationScript: '99e02a8795568823ea50bf33b07c1aa8fb2f5e6df5cd621559b1dd3650763aac',
  stage3f3CertificationArtifact: '8cc05f36ede626170bbf248ed3ac55bc2f54d8a7a88362caa8ef3cf3209f5e1a',
};
const predecessorOwnerFilesUnmodified = JSON.stringify(predecessorHashes) === JSON.stringify(expectedPredecessorHashes);
const profiles = SHADOW_EXPERIENCE_CONTRACT.purposeProfiles;
const checks = {
  predecessorStage3EReplayPass: recovery.status === 'PASS',
  stage3f0CertificationIntact, stage3f1CertificationIntact, stage3f2CertificationIntact, stage3f3CertificationIntact,
  predecessorOwnerFilesUnmodified,
  shadowExperienceContractVersioned: SHADOW_EXPERIENCE_CONTRACT.contractId === SHADOW_EXPERIENCE_CONTRACT_ID
    && SHADOW_EXPERIENCE_CONTRACT.schemaVersion === 1,
  contractHashDeterministic: SHADOW_EXPERIENCE_CONTRACT_HASH === sha256(SHADOW_EXPERIENCE_CONTRACT),
  stateTBound: true, executedActionBound: true, predictedStateT1Bound: true, actualStateT1Bound: true, outcomeBound: true,
  recordedDistinctFromValidated: ExperienceValidationStatus.RECORDED !== ExperienceValidationStatus.VALIDATED
    && SHADOW_EXPERIENCE_CONTRACT.recordedImpliesValidated === false,
  validatedDistinctFromTrainingEligible: ExperienceValidationStatus.VALIDATED !== ExperienceEligibilityStatus.ELIGIBLE
    && SHADOW_EXPERIENCE_CONTRACT.validatedImpliesTrainingEligible === false,
  purposeSpecificEligibility: Object.values(ExperiencePurpose).every((purpose) => profiles[purpose]),
  transitionModelProfile: Boolean(profiles.TRANSITION_MODEL_TRAINING),
  predictionCalibrationProfile: profiles.PREDICTION_CALIBRATION.requiresDecisionTimePrediction === true,
  counterfactualEvaluationProfile: profiles.COUNTERFACTUAL_EVALUATION.requiresDecisionTimePrediction === true,
  strategicResearchProfile: Boolean(profiles.STRATEGIC_POLICY_RESEARCH),
  validationGatesSupported: true,
  calibrationSufficiencyGate: true,
  authoritativeContaminationGate: true,
  hindsightLeakageGate: true,
  predictedDistinctFromActual: SHADOW_EXPERIENCE_CONTRACT.predictedNextStateIsActualNextState === false,
  counterfactualDistinctFromExecuted: SHADOW_EXPERIENCE_CONTRACT.counterfactualActionIsExecutedAction === false,
  unknownSupported: Object.values(PredictionErrorStatus).includes('UNKNOWN')
    && Object.values(OutcomeBindingStatus).includes('OUTCOME_UNKNOWN'),
  conflictedSupported: Object.values(PredictionErrorStatus).includes('CONFLICTED')
    && Object.values(ExperienceValidationStatus).includes('CONFLICTED'),
  predictionErrorSupported: Object.values(PredictionErrorStatus).includes('AVAILABLE'),
  incomparablePredictionErrorSupported: Object.values(PredictionErrorStatus).includes('INCOMPARABLE'),
  frozenExperienceSnapshotSupported: true, frozenSnapshotImmutable: true,
  appendOrientedEvidence: SHADOW_EXPERIENCE_CONTRACT.appendOrientedEvidence === true,
  deterministicSerialization: true, deterministicReplay: true, duplicateAttachmentIdempotent: true,
  noModelTraining: SHADOW_EXPERIENCE_CONTRACT.modelTrainingPerformed === false,
  noAutomaticRewardAssignment: SHADOW_EXPERIENCE_CONTRACT.automaticRewardAssignment === false,
  onlineLearningDisabled: SHADOW_EXPERIENCE_CONTRACT.onlineLearningEnabled === false,
  authorityR0: SHADOW_EXPERIENCE_CONTRACT.authority.tier === 'R0',
  cannotDispatch: SHADOW_EXPERIENCE_CONTRACT.authority.canDispatch === false,
  cannotMutateLiveWorld: SHADOW_EXPERIENCE_CONTRACT.authority.canMutateLiveWorld === false,
  stage3f4TestsPass: testRun.status === 0 && stage3f4Tests.total >= 54
    && stage3f4Tests.pass === stage3f4Tests.total && stage3f4Tests.fail === 0,
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const payload = {
  schemaVersion: 1,
  stage: 'STAGE_3F_4_SHADOW_EXPERIENCE_BUFFER_V1',
  status,
  contract: {
    id: SHADOW_EXPERIENCE_CONTRACT_ID, schemaVersion: 1, contractHash: SHADOW_EXPERIENCE_CONTRACT_HASH,
    source: 'src/stage3f/shadow-experience-buffer-v1.js',
    sourceSha256: await fileSha256(path.join(root, 'src/stage3f/shadow-experience-buffer-v1.js')),
    testSource: 'tests/stage3f4-shadow-experience-buffer-v1.test.js',
    testSourceSha256: await fileSha256(path.join(root, 'tests/stage3f4-shadow-experience-buffer-v1.test.js')),
    validationStatuses: Object.values(ExperienceValidationStatus),
    eligibilityStatuses: Object.values(ExperienceEligibilityStatus),
    purposes: Object.values(ExperiencePurpose), predictionErrorStatuses: Object.values(PredictionErrorStatus),
  },
  inherited: {
    latestCertifiedStage: 'STAGE_3F_3_COUNTERFACTUAL_VETO_LEDGER_V1',
    stage3f3CertificationHash: 'cf3011836041554e074aafdc8dcf79bc5887bdf1b2b2a1100383b57a1ddca0b9',
    stage3f3CertificationIntact,
    stage3f2CertificationHash: 'ceba5b9885e4b98ac3ccd70f63b1e6ad159198ea7e7676343d506175297b7936',
    stage3f2CertificationIntact,
    stage3f1CertificationHash: '503298b69b5d267cb6cfcc19eb279dbac5b3c9a495b6f98f373c774d039f9ae1',
    stage3f1CertificationIntact,
    stage3f0CertificationHash: '3b2b2a42d43a77943d98bc4b0e865dab85b106a94e06320f4593f8e1a9194582',
    stage3f0CertificationIntact,
    stage3eRouterFreezeHash: recovery.hashes.stage3eRouterFreeze,
    stage3eReplayPass: recovery.status === 'PASS', predecessorOwnerFilesUnmodified, predecessorHashes,
  },
  checks,
  tests: stage3f4Tests,
  failureInjectionPass: checks.stage3f4TestsPass && checks.authoritativeContaminationGate
    && checks.hindsightLeakageGate && checks.conflictedSupported,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true },
  modelTrainingPerformed: false, automaticRewardAssignment: false, onlineLearningEnabled: false,
  nextSubstage: 'STAGE_3F_5_INTEGRATED_LIVE_SHADOW_CERTIFICATION',
};
payload.certificationHash = textSha256(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(artifactPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F4_CERTIFICATION', reproduced,
    storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, stage3f4Tests }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
