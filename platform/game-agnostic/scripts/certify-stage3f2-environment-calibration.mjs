#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';
import { EpistemicCategory, EvidenceAuthority, createWorldStateFact, createWorldStateSnapshot } from '../src/stage3f/world-state-v1.js';
import {
  createDecisionTimeTrace,
  createFeatureDerivationEvidence,
  createObservationEvidence,
  createRecommendationEvidence,
  createRouterEvaluationEvidence,
} from '../src/stage3f/causal-trace-v1.js';
import {
  CalibrationDomain,
  CalibrationStatus,
  ENVIRONMENT_CALIBRATION_CONTRACT,
  ENVIRONMENT_CALIBRATION_CONTRACT_HASH,
  ENVIRONMENT_CALIBRATION_CONTRACT_ID,
  SemanticRelationType,
  bindCausalTraceCalibration,
  bindWorldStateCalibration,
  createCalibrationEvidence,
  createDomainAssessment,
  createEnvironmentCalibration,
  createEnvironmentIdentity,
  createSemanticDefinition,
  createSemanticMapping,
  evaluateCalibrationSufficiency,
  serializeEnvironmentCalibration,
  verifyEnvironmentCalibration,
} from '../src/stage3f/environment-calibration-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactDirectory = path.join(root, 'artifacts', 'stage3f2-environment-calibration');
const artifactPath = path.join(artifactDirectory, 'stage3f2-certification-result.json');
const checkOnly = process.argv.includes('--check');
const textSha256 = (value) => createHash('sha256').update(value).digest('hex');
const fileSha256 = async (filePath) => textSha256(await readFile(filePath));
const domains = Object.values(CalibrationDomain);

function environmentIdentity(runtimeIdentity = 'forge-world', environmentVersion = 'FORGE_WORLD_V2') {
  return createEnvironmentIdentity({
    runtimeIdentity,
    environmentVersion,
    environmentFamily: 'SENTINEL_FORGE',
    environmentSchemaVersion: '2',
    structuralSemantics: {
      observationSchemaHash: 'sha256:forge-observation-schema-v2',
      actionSchemaHash: 'sha256:forge-action-schema-v2',
      objectiveSchemaHash: 'sha256:forge-objective-schema-v2',
      transitionContractVersion: 'FORGE_TRANSITION_V2',
    },
  });
}

const provenance = (identity, sourceId, evidenceId) => ({
  environmentId: identity.environmentId,
  environmentVersion: identity.environmentVersion,
  sourceId,
  evidenceId,
});

function actionEvidence(identity, amount = 2, evidenceId = `move-cost-${amount}`) {
  return createCalibrationEvidence({
    environmentIdentity: identity,
    domain: CalibrationDomain.ACTION_SEMANTICS,
    claimTarget: 'ACTION:MOVE:resourceCost',
    claimType: 'RESOURCE_COST',
    claimValue: { resourceId: 'energy', amount },
    sourceReference: { contract: 'FORGE_ENVIRONMENT_SPEC_V2', section: 'MOVE' },
    epistemicCategory: EpistemicCategory.OBSERVED,
    confidence: 1,
    material: true,
    provenance: provenance(identity, 'forge-environment-spec-v2', evidenceId),
  });
}

function actionDefinition(identity, evidenceRecord, amount = 2) {
  return createSemanticDefinition({
    environmentIdentity: identity,
    domain: CalibrationDomain.ACTION_SEMANTICS,
    conceptId: 'MOVE',
    conceptVersion: '2',
    semantics: {
      actionId: 'MOVE', actionVersion: '2',
      parameters: [{ id: 'direction', dataType: 'enum', required: true, domain: ['NORTH', 'SOUTH'] }],
      preconditions: ['destination is legal'], expectedDirectEffects: ['actor position may change'],
      possibleSideEffects: ['energy may decrease'], resourceCosts: [{ resourceId: 'energy', amount }],
      temporalDuration: { value: 1, units: 'logical-step' }, failureModes: ['BLOCKED'],
      legalityConstraints: ['inside grid bounds'], resultObservability: 'DIRECT',
    },
    epistemicCategory: EpistemicCategory.OBSERVED,
    confidence: 0.95,
    evidenceRefs: [evidenceRecord.calibrationEvidenceId],
    provenance: provenance(identity, 'calibration-builder', 'move-definition'),
  });
}

function assessments(identity, evidenceRecords) {
  const actionRefs = evidenceRecords.map((entry) => entry.calibrationEvidenceId);
  return domains.map((domain) => createDomainAssessment({
    environmentIdentity: identity,
    domain,
    status: domain === CalibrationDomain.ACTION_SEMANTICS
      ? CalibrationStatus.CALIBRATED : CalibrationStatus.UNKNOWN,
    confidence: domain === CalibrationDomain.ACTION_SEMANTICS ? 0.95 : null,
    evidenceRefs: domain === CalibrationDomain.ACTION_SEMANTICS ? actionRefs : [],
    provenance: provenance(identity, 'calibration-auditor', `assessment-${domain}`),
  }));
}

function partialCalibration(identity, calibrationVersion = '1.0.0', extraEvidence = []) {
  const primary = actionEvidence(identity);
  const evidence = [primary, ...extraEvidence];
  return createEnvironmentCalibration({
    environmentIdentity: identity,
    calibrationVersion,
    evidence,
    semanticDefinitions: [actionDefinition(identity, primary)],
    domainAssessments: assessments(identity, evidence),
  });
}

function stateSnapshot(identity, logicalTime = 17) {
  const runtime = { identity: identity.runtimeIdentity, version: identity.environmentVersion };
  const fact = createWorldStateFact({
    path: ['resources', 'actor', 'energy'],
    category: EpistemicCategory.OBSERVED,
    authority: EvidenceAuthority.AUTHORITATIVE_OBSERVATION,
    value: 31,
    confidence: 1,
    uncertainty: { status: 'BOUNDED', radius: 0 },
    provenance: {
      environmentIdentity: runtime.identity, environmentVersion: runtime.version,
      sourceId: 'forge-observer', evidenceId: `energy-${logicalTime}`,
    },
  });
  return createWorldStateSnapshot({ environment: runtime, logicalTime, facts: [fact] });
}

function decisionTrace(identity) {
  const snapshot = stateSnapshot(identity);
  const runtime = snapshot.environment;
  const traceProvenance = (sourceId, evidenceId) => ({
    environmentIdentity: runtime.identity, environmentVersion: runtime.version, sourceId, evidenceId,
  });
  const observation = createObservationEvidence({
    observationId: 'observation-17', environment: runtime, logicalTime: 17,
    observationDigest: `sha256:${textSha256('observation-17')}`,
    provenance: traceProvenance('forge-observer', 'observation-17'),
  });
  const feature = createFeatureDerivationEvidence({
    worldStateSnapshot: snapshot,
    featureContract: {
      id: 'SENTINEL_FEATURE_CONTRACT_V2', version: '2',
      hash: '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb',
    },
    featureValues: { energy: 31 },
    implementation: { id: 'stage3e-feature-extractor', version: '2', hash: 'sha256:extractor-v2' },
    provenance: traceProvenance('stage3e-feature-extractor', 'features-17'),
  });
  const router = createRouterEvaluationEvidence({
    featureDerivation: feature,
    router: {
      id: 'STAGE3E_ROUTER', version: 'STAGE_3E',
      hash: 'd87cfa8b010c5889818b6ac6f3b9ddbaf2d23aa1cfb6e61d53cf31f50b722e64',
    },
    score: 0.92, threshold: 0.9, selectedRoute: 'GREEDY', fallback: { available: true, used: false },
    provenance: traceProvenance('stage3e-router', 'router-17'),
  });
  const recommendation = createRecommendationEvidence({
    routerEvaluation: router,
    proposedAction: { actionId: 'MOVE', parameters: { direction: 'NORTH' } },
    recommendedPath: 'GREEDY', confidence: 0.92, uncertainty: { status: 'BOUNDED' },
    provenance: traceProvenance('sentinel-shadow', 'recommendation-17'),
  });
  return createDecisionTimeTrace({
    observationEvidence: observation, worldStateSnapshot: snapshot,
    featureDerivation: feature, routerEvaluation: router, recommendation,
  });
}

const identity = environmentIdentity();
const calibration = partialCalibration(identity);
const replay = partialCalibration(environmentIdentity());
const reordered = createEnvironmentCalibration({
  environmentIdentity: identity,
  calibrationVersion: calibration.calibrationVersion,
  evidence: [...calibration.evidence].reverse(),
  semanticDefinitions: [...calibration.semanticDefinitions].reverse(),
  domainAssessments: [...calibration.domainAssessments].reverse(),
});
const snapshot = stateSnapshot(identity);
const trace = decisionTrace(identity);
const worldBinding = bindWorldStateCalibration(snapshot, calibration);
const traceBinding = bindCausalTraceCalibration(trace, calibration);
const nextCalibration = partialCalibration(identity, '2.0.0');
const nextTraceBinding = bindCausalTraceCalibration(trace, nextCalibration);
const actionSufficiency = evaluateCalibrationSufficiency(calibration, [CalibrationDomain.ACTION_SEMANTICS]);
const planningSufficiency = evaluateCalibrationSufficiency(calibration, [
  CalibrationDomain.ACTION_SEMANTICS,
  CalibrationDomain.OBJECTIVE_SEMANTICS,
  CalibrationDomain.TEMPORAL_SEMANTICS,
  CalibrationDomain.TRANSITION_SEMANTICS,
]);
const conflictingEvidence = actionEvidence(identity, 3, 'conflicting-move-cost');
const conflicted = partialCalibration(identity, '1.0.0-conflict', [conflictingEvidence]);
const conflictSufficiency = evaluateCalibrationSufficiency(conflicted, [CalibrationDomain.ACTION_SEMANTICS]);
const otherIdentity = environmentIdentity('other-world');
const otherCalibration = partialCalibration(otherIdentity);
const sourceAction = calibration.semanticDefinitions[0];
const targetAction = otherCalibration.semanticDefinitions[0];
const unknownMapping = createSemanticMapping({
  sourceEnvironment: identity,
  targetEnvironment: otherIdentity,
  sourceConceptRef: sourceAction.semanticDefinitionId,
  targetConceptRef: targetAction.semanticDefinitionId,
  relationType: SemanticRelationType.UNKNOWN,
  confidence: null,
  evidenceRefs: [],
  provenance: {
    sourceEnvironmentId: identity.environmentId,
    targetEnvironmentId: otherIdentity.environmentId,
    sourceId: 'calibration-mapper', evidenceId: 'unproven-move-relation',
  },
});

let mismatchFailsClosed = false;
try {
  bindWorldStateCalibration(snapshot, otherCalibration);
} catch {
  mismatchFailsClosed = true;
}

const testRun = spawnSync(process.execPath, ['--test', 'tests/stage3f2-environment-calibration-v1.test.js'], {
  cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
});
const testOutput = `${testRun.stdout ?? ''}\n${testRun.stderr ?? ''}`;
const metric = (name) => Number(testOutput.match(new RegExp(`(?:ℹ|#) ${name} (\\d+)`))?.[1] ?? -1);
const stage3f2Tests = { total: metric('tests'), pass: metric('pass'), fail: metric('fail'), skip: metric('skipped') };

function runJsonCheck(script) {
  const result = spawnSync(process.execPath, script, { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  try {
    return result.status === 0 && JSON.parse(result.stdout).reproduced === true;
  } catch {
    return false;
  }
}

const stage3f0CertificationIntact = runJsonCheck(['scripts/certify-stage3f0-world-state-contract.mjs', '--check']);
const stage3f1CertificationIntact = runJsonCheck(['scripts/certify-stage3f1-causal-trace.mjs', '--check']);
const recovery = await certifyRecoveredStage3DE();
const predecessorHashes = {
  worldStateSource: await fileSha256(path.join(root, 'src', 'stage3f', 'world-state-v1.js')),
  causalTraceSource: await fileSha256(path.join(root, 'src', 'stage3f', 'causal-trace-v1.js')),
  causalTraceTests: await fileSha256(path.join(root, 'tests', 'stage3f1-causal-trace-v1.test.js')),
  stage3f1CertificationScript: await fileSha256(path.join(root, 'scripts', 'certify-stage3f1-causal-trace.mjs')),
  stage3f1CertificationArtifact: await fileSha256(path.join(root, 'artifacts', 'stage3f1-causal-trace', 'stage3f1-certification-result.json')),
};
const expectedPredecessorHashes = {
  worldStateSource: 'dbc44bffa01dc58b13d94ef34fbcbd1d35815859fafdfe62b55cf428003d9380',
  causalTraceSource: '78388a00b2bedfc9689a5d9f51d0cbc04be9cf7f09774aedee762c100cd06f87',
  causalTraceTests: '90768bf053c79f94bc5b19af5ccc3bb4dd88c76e318593c451d799389a47324a',
  stage3f1CertificationScript: '2307879c8ba2a5ee347e777eebb70cee06d7ece816990d52481c147e0d7cff11',
  stage3f1CertificationArtifact: '96105fae1c771ac502c94d499465bcdbe27e0a5767d3278a82d02088e7cdcde0',
};
const predecessorOwnerFilesUnmodified = JSON.stringify(predecessorHashes) === JSON.stringify(expectedPredecessorHashes);

const checks = {
  predecessorStage3EReplayPass: recovery.status === 'PASS',
  stage3f0CertificationIntact,
  stage3f1CertificationIntact,
  predecessorOwnerFilesUnmodified,
  calibrationContractVersioned: calibration.contractId === ENVIRONMENT_CALIBRATION_CONTRACT_ID
    && calibration.schemaVersion === 1,
  contractHashBound: calibration.contractHash === ENVIRONMENT_CALIBRATION_CONTRACT_HASH,
  environmentIdentityBound: calibration.environmentIdentity.environmentId === identity.environmentId,
  environmentVersionBound: calibration.environmentIdentity.environmentVersion === 'FORGE_WORLD_V2',
  calibrationVersionImmutable: Object.isFrozen(calibration) && calibration.calibrationId !== nextCalibration.calibrationId,
  allSemanticDomainsSupported: domains.every((domain) => ENVIRONMENT_CALIBRATION_CONTRACT.domains.includes(domain)),
  allEpistemicCategoriesSupported: Object.values(EpistemicCategory).every((category) =>
    ENVIRONMENT_CALIBRATION_CONTRACT.epistemicCategories.includes(category)),
  partialCalibrationSupported: calibration.overallStatus === CalibrationStatus.PARTIALLY_CALIBRATED,
  unknownSemanticsSupported: calibration.domainAssessments.some((entry) => entry.status === CalibrationStatus.UNKNOWN),
  conflictedCalibrationSupported: conflicted.overallStatus === CalibrationStatus.CONFLICTED
    && conflicted.conflicts.length === 1,
  taskSpecificSufficiency: actionSufficiency.sufficient && !planningSufficiency.sufficient,
  insufficientCalibrationFailsClosed: planningSufficiency.calibrationInsufficient
    && conflictSufficiency.calibrationInsufficient,
  sameNameDoesNotImplySameSemantics: sourceAction.conceptId === targetAction.conceptId
    && sourceAction.semanticDefinitionId !== targetAction.semanticDefinitionId,
  semanticMappingInterface: unknownMapping.relationType === SemanticRelationType.UNKNOWN,
  unprovenMappingRemainsUnknown: unknownMapping.confidence === null && unknownMapping.evidenceRefs.length === 0,
  worldStateCalibrationBinding: worldBinding.calibrationRef.calibrationId === calibration.calibrationId,
  causalTraceCalibrationBinding: traceBinding.calibrationRef.calibrationId === calibration.calibrationId,
  historicalCalibrationReferencePreserved: traceBinding.calibrationRef.calibrationId !== nextTraceBinding.calibrationRef.calibrationId,
  environmentMismatchFailsClosed: mismatchFailsClosed,
  deterministicSerialization: serializeEnvironmentCalibration(calibration) === serializeEnvironmentCalibration(replay),
  deterministicReplay: calibration.calibrationDigest === replay.calibrationDigest,
  keyAndArrayOrderInvariant: calibration.calibrationDigest === reordered.calibrationDigest,
  calibrationVerifies: verifyEnvironmentCalibration(calibration),
  authorityR0: calibration.authority.tier === 'R0',
  cannotDispatch: calibration.authority.canDispatch === false,
  cannotMutateLiveWorld: calibration.authority.canMutateLiveWorld === false,
  stage3f2TestsPass: testRun.status === 0 && stage3f2Tests.total > 0
    && stage3f2Tests.pass === stage3f2Tests.total && stage3f2Tests.fail === 0,
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const payload = {
  schemaVersion: 1,
  stage: 'STAGE_3F_2_ENVIRONMENT_CALIBRATION_CONTRACT_V1',
  status,
  contract: {
    id: ENVIRONMENT_CALIBRATION_CONTRACT_ID,
    schemaVersion: 1,
    contractHash: ENVIRONMENT_CALIBRATION_CONTRACT_HASH,
    source: 'src/stage3f/environment-calibration-v1.js',
    sourceSha256: await fileSha256(path.join(root, 'src', 'stage3f', 'environment-calibration-v1.js')),
    testSource: 'tests/stage3f2-environment-calibration-v1.test.js',
    testSourceSha256: await fileSha256(path.join(root, 'tests', 'stage3f2-environment-calibration-v1.test.js')),
    domains,
    statuses: Object.values(CalibrationStatus),
    semanticRelations: Object.values(SemanticRelationType),
  },
  inherited: {
    latestCertifiedStage: 'STAGE_3F_1_SENTINEL_CAUSAL_TRACE_V1',
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
  witnesses: {
    environmentId: identity.environmentId,
    calibrationId: calibration.calibrationId,
    calibrationDigest: calibration.calibrationDigest,
    worldStateCalibrationBindingId: worldBinding.worldStateCalibrationBindingId,
    causalTraceCalibrationBindingId: traceBinding.causalTraceCalibrationBindingId,
    conflictId: conflicted.conflicts[0].conflictId,
    actionSufficiencyDigest: actionSufficiency.sufficiencyDigest,
    planningSufficiencyDigest: planningSufficiency.sufficiencyDigest,
    unknownMappingId: unknownMapping.semanticMappingId,
  },
  tests: stage3f2Tests,
  failureInjectionPass: checks.insufficientCalibrationFailsClosed
    && checks.environmentMismatchFailsClosed && checks.conflictedCalibrationSupported,
  authority: {
    tier: calibration.authority.tier,
    canDispatch: calibration.authority.canDispatch,
    canMutateLiveWorld: calibration.authority.canMutateLiveWorld,
    incumbentSoleExecutor: true,
  },
  onlineLearningEnabled: false,
  nextSubstage: 'STAGE_3F_3_COUNTERFACTUAL_VETO_LEDGER_V1',
};
payload.certificationHash = textSha256(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(artifactPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash
    && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({
    check: 'STAGE3F2_CERTIFICATION', reproduced,
    storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, stage3f2Tests,
  }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
