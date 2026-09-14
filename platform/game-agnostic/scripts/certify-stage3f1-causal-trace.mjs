#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';
import {
  EpistemicCategory,
  EvidenceAuthority,
  createWorldStateFact,
  createWorldStateSnapshot,
} from '../src/stage3f/world-state-v1.js';
import {
  AttributionStatus,
  CAUSAL_TRACE_CONTRACT,
  CAUSAL_TRACE_CONTRACT_HASH,
  CAUSAL_TRACE_CONTRACT_ID,
  FailureAttributionCategory,
  TraceLifecycleStatus,
  TraceRelationshipType,
  attachAttribution,
  attachIncumbentAction,
  attachInstrumentationFailure,
  attachOutcome,
  createDecisionTimeTrace,
  createFeatureDerivationEvidence,
  createObservationEvidence,
  createPredictorEvidence,
  createRecommendationEvidence,
  createRouterEvaluationEvidence,
  serializeCausalTrace,
  verifyCausalTrace,
} from '../src/stage3f/causal-trace-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactDirectory = path.join(root, 'artifacts', 'stage3f1-causal-trace');
const artifactPath = path.join(artifactDirectory, 'stage3f1-certification-result.json');
const checkOnly = process.argv.includes('--check');
const fileSha256 = async (filePath) => createHash('sha256').update(await readFile(filePath)).digest('hex');
const textSha256 = (value) => createHash('sha256').update(value).digest('hex');

const environment = { identity: 'forge-world', version: 'FORGE_WORLD_V2' };
const provenance = (sourceId, evidenceId) => ({
  environmentIdentity: environment.identity,
  environmentVersion: environment.version,
  sourceId,
  evidenceId,
});
const observedFact = (energy, logicalTime) => createWorldStateFact({
  path: ['resources', 'actor', 'energy'],
  category: EpistemicCategory.OBSERVED,
  authority: EvidenceAuthority.AUTHORITATIVE_OBSERVATION,
  value: energy,
  confidence: 1,
  uncertainty: { status: 'BOUNDED', radius: 0 },
  provenance: provenance('forge-observer-v2', `energy-${logicalTime}-${energy}`),
});
const state = (energy, logicalTime) => createWorldStateSnapshot({
  environment,
  logicalTime,
  facts: [observedFact(energy, logicalTime)],
});

function decisionTrace() {
  const snapshot = state(31, 17);
  const observation = createObservationEvidence({
    observationId: 'observation-17',
    environment,
    logicalTime: 17,
    observationDigest: `sha256:${textSha256('observation-17')}`,
    provenance: provenance('forge-observer-v2', 'observation-17'),
  });
  const feature = createFeatureDerivationEvidence({
    worldStateSnapshot: snapshot,
    featureContract: {
      id: 'SENTINEL_FEATURE_CONTRACT_V2',
      version: '2',
      hash: '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb',
    },
    featureValues: { energy: 31, greedyFuturePotential: 7, greedyResourceCost: 3 },
    implementation: { id: 'stage3e-feature-extractor', version: '2', hash: 'sha256:feature-extractor-v2' },
    provenance: provenance('stage3e-feature-extractor', 'features-17'),
  });
  const predictor = createPredictorEvidence({
    worldStateSnapshot: snapshot,
    predictor: { id: 'generic-risk-predictor', version: '1' },
    outputSummary: { horizon: 1, riskBand: 'LOW' },
    confidence: 0.76,
    uncertainty: { status: 'BOUNDED', radius: 0.08 },
    provenance: provenance('generic-risk-predictor', 'prediction-17'),
  });
  const router = createRouterEvaluationEvidence({
    featureDerivation: feature,
    predictorEvidence: [predictor],
    router: {
      id: 'STAGE3E_ROUTABILITY_ROUTER',
      version: 'STAGE_3E',
      hash: 'd87cfa8b010c5889818b6ac6f3b9ddbaf2d23aa1cfb6e61d53cf31f50b722e64',
    },
    score: 0.92,
    threshold: 0.9,
    selectedRoute: 'GREEDY',
    fallback: { available: true, used: false, route: 'INCUMBENT_DEFAULT' },
    provenance: provenance('stage3e-router', 'router-17'),
  });
  const recommendation = createRecommendationEvidence({
    routerEvaluation: router,
    proposedAction: { actionId: 'MOVE', parameters: { direction: 'NORTH' } },
    recommendedPath: 'GREEDY',
    confidence: 0.92,
    uncertainty: { status: 'BOUNDED', marginToThreshold: 0.02 },
    provenance: provenance('sentinel-shadow', 'recommendation-17'),
  });
  return createDecisionTimeTrace({
    observationEvidence: observation,
    worldStateSnapshot: snapshot,
    featureDerivation: feature,
    predictorEvidence: [predictor],
    routerEvaluation: router,
    recommendation,
  });
}

const first = decisionTrace();
const replay = decisionTrace();
const actionArgs = {
  selectedAction: { actionId: 'MOVE', parameters: { direction: 'NORTH' } },
  logicalTime: 18,
  provenance: provenance('incumbent-executor', 'action-18'),
};
const outcomeArgs = {
  actualStateSnapshot: state(28, 19),
  logicalTime: 19,
  outcomeSummary: { energy: 28, terminal: false },
  observationCompleteness: 'COMPLETE',
  provenance: provenance('forge-outcome-observer', 'outcome-19'),
};
const actionBound = attachIncumbentAction(first, actionArgs);
const outcomeBound = attachOutcome(actionBound, outcomeArgs);
const reverseOrder = attachIncumbentAction(attachOutcome(replay, outcomeArgs), actionArgs);
const idempotent = attachOutcome(attachIncumbentAction(outcomeBound, actionArgs), outcomeArgs);
const conflict = attachIncumbentAction(actionBound, {
  selectedAction: { actionId: 'WAIT', parameters: {} },
  logicalTime: 18,
  provenance: provenance('incumbent-executor', 'conflicting-action-18'),
});
const unknownAttribution = attachAttribution(first, {
  status: AttributionStatus.UNKNOWN,
  failureCategory: FailureAttributionCategory.UNKNOWN,
  explanation: 'No outcome evidence is available.',
  evidenceRefs: [],
  logicalTime: 20,
  provenance: provenance('trace-auditor', 'unknown-attribution-20'),
});
const instrumentationFailure = attachInstrumentationFailure(first, {
  failureType: 'WRITE_FAILURE',
  reason: 'Certification failure injection',
  logicalTime: 18,
  provenance: provenance('trace-instrumentation', 'failure-18'),
});

let environmentMismatchFailsClosed = false;
try {
  attachOutcome(first, {
    ...outcomeArgs,
    provenance: { ...outcomeArgs.provenance, environmentVersion: 'FORGE_WORLD_V3' },
  });
} catch {
  environmentMismatchFailsClosed = first.attachments.length === 0;
}

const testRun = spawnSync(process.execPath, ['--test', 'tests/stage3f1-causal-trace-v1.test.js'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, NO_COLOR: '1' },
});
const testOutput = `${testRun.stdout ?? ''}\n${testRun.stderr ?? ''}`;
const metric = (name) => Number(testOutput.match(new RegExp(`(?:ℹ|#) ${name} (\\d+)`))?.[1] ?? -1);
const stage3f1Tests = { total: metric('tests'), pass: metric('pass'), fail: metric('fail'), skip: metric('skipped') };

const stage3f0Check = spawnSync(process.execPath, ['scripts/certify-stage3f0-world-state-contract.mjs', '--check'], {
  cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
});
let stage3f0CertificationIntact = false;
try {
  stage3f0CertificationIntact = stage3f0Check.status === 0
    && JSON.parse(stage3f0Check.stdout).reproduced === true;
} catch {
  stage3f0CertificationIntact = false;
}
const recovery = await certifyRecoveredStage3DE();
const relationships = new Set(outcomeBound.edges.map((edge) => edge.relationshipType));
const predecessorHashes = {
  worldStateSource: await fileSha256(path.join(root, 'src', 'stage3f', 'world-state-v1.js')),
  worldStateTests: await fileSha256(path.join(root, 'tests', 'stage3f-world-state-v1.test.js')),
  stage3f0CertificationScript: await fileSha256(path.join(root, 'scripts', 'certify-stage3f0-world-state-contract.mjs')),
  stage3f0CertificationArtifact: await fileSha256(path.join(root, 'artifacts', 'stage3f0-world-state-contract', 'stage3f0-certification-result.json')),
};
const expectedPredecessorHashes = {
  worldStateSource: 'dbc44bffa01dc58b13d94ef34fbcbd1d35815859fafdfe62b55cf428003d9380',
  worldStateTests: 'd0aadb78779ac6a3fb5f8d45bcdf9c3cec6a1bf86528853e9e54b996674add5d',
  stage3f0CertificationScript: 'e6687eeb12a7c43c10032238d01888144272b7ab3c95eecbd3948b4c3e18f0e6',
  stage3f0CertificationArtifact: '125d29aab44377f6f571580e2f497b223dcd5bc3dbdacfcc5ba05f9af70c3cc9',
};
const predecessorOwnerFilesUnmodified = JSON.stringify(predecessorHashes) === JSON.stringify(expectedPredecessorHashes);

const checks = {
  predecessorStage3EReplayPass: recovery.status === 'PASS',
  stage3f0CertificationIntact,
  predecessorOwnerFilesUnmodified,
  traceContractVersioned: first.contractId === CAUSAL_TRACE_CONTRACT_ID && first.schemaVersion === 1,
  traceContractHashBound: first.contractHash === CAUSAL_TRACE_CONTRACT_HASH,
  traceIdDeterministic: first.traceId === replay.traceId,
  deterministicSerialization: serializeCausalTrace(first) === serializeCausalTrace(replay),
  deterministicReplay: outcomeBound.traceDigest === reverseOrder.traceDigest,
  decisionTimeEvidenceFrozen: Object.isFrozen(first.decisionTimeEvent)
    && outcomeBound.decisionTimeEvent === first.decisionTimeEvent,
  appendOrientedEvidence: first.attachments.length === 0 && outcomeBound.attachments.length === 2,
  duplicateAttachmentIdempotent: idempotent.traceDigest === outcomeBound.traceDigest,
  worldStateReferenceBound: first.decisionTimeEvent.decisionTimeEvidence.featureDerivation.worldStateSnapshotId
    === first.decisionTimeEvent.decisionTimeEvidence.worldStateSnapshot.snapshotId,
  featureDerivationBound: first.decisionTimeEvent.decisionTimeEvidence.routerEvaluation.featureDerivationId
    === first.decisionTimeEvent.decisionTimeEvidence.featureDerivation.featureDerivationId,
  predictorEvidenceSupported: first.decisionTimeEvent.decisionTimeEvidence.predictorEvidence[0].epistemicCategory
    === EpistemicCategory.PREDICTED,
  routerEvidenceBound: first.decisionTimeEvent.decisionTimeEvidence.recommendation.routerEvaluationId
    === first.decisionTimeEvent.decisionTimeEvidence.routerEvaluation.routerEvaluationId,
  recommendationBound: first.decisionTimeEvent.decisionTimeEvidence.recommendation.recommendationId.startsWith('sha256:'),
  actionLateBinding: actionBound.projection.incumbentActionStatus === 'BOUND',
  outcomeLateBinding: outcomeBound.projection.outcomeStatus === 'BOUND',
  conflictsPreserved: conflict.projection.lifecycleStatus === TraceLifecycleStatus.CONFLICTED
    && conflict.projection.incumbentActions.length === 2,
  unknownSupported: first.projection.outcomeStatus === 'UNKNOWN'
    && unknownAttribution.projection.attributionStatus === AttributionStatus.UNKNOWN,
  environmentMismatchFailsClosed,
  instrumentationFailureIsolated: instrumentationFailure.projection.lifecycleStatus === TraceLifecycleStatus.INCOMPLETE
    && instrumentationFailure.authority.canDispatch === false,
  temporalLinkSupported: relationships.has(TraceRelationshipType.TEMPORAL_LINK),
  derivationLinkSupported: relationships.has(TraceRelationshipType.DERIVATION_LINK),
  decisionDependencySupported: relationships.has(TraceRelationshipType.DECISION_DEPENDENCY),
  actionBindingSupported: relationships.has(TraceRelationshipType.ACTION_BINDING),
  outcomeBindingSupported: relationships.has(TraceRelationshipType.OUTCOME_BINDING),
  causalClaimDistinct: !relationships.has(TraceRelationshipType.CAUSAL_CLAIM),
  completenessDistinctFromCausalCertainty: outcomeBound.projection.traceCompletenessImpliesCausalCertainty === false,
  attributionStatusesSupported: Object.values(AttributionStatus).every((status) =>
    CAUSAL_TRACE_CONTRACT.attributionStatuses.includes(status)),
  authorityR0: first.authority.tier === 'R0',
  cannotDispatch: first.authority.canDispatch === false,
  cannotMutateLiveWorld: first.authority.canMutateLiveWorld === false,
  stage3f1TestsPass: testRun.status === 0 && stage3f1Tests.total > 0
    && stage3f1Tests.pass === stage3f1Tests.total && stage3f1Tests.fail === 0,
  traceVerifies: verifyCausalTrace(outcomeBound) === true,
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const payload = {
  schemaVersion: 1,
  stage: 'STAGE_3F_1_SENTINEL_CAUSAL_TRACE_V1',
  status,
  contract: {
    id: CAUSAL_TRACE_CONTRACT_ID,
    schemaVersion: 1,
    contractHash: CAUSAL_TRACE_CONTRACT_HASH,
    source: 'src/stage3f/causal-trace-v1.js',
    sourceSha256: await fileSha256(path.join(root, 'src', 'stage3f', 'causal-trace-v1.js')),
    testSource: 'tests/stage3f1-causal-trace-v1.test.js',
    testSourceSha256: await fileSha256(path.join(root, 'tests', 'stage3f1-causal-trace-v1.test.js')),
    relationships: Object.values(TraceRelationshipType),
    attributionStatuses: Object.values(AttributionStatus),
  },
  inherited: {
    latestCertifiedStage: 'STAGE_3F_0_WORLD_STATE_CONTRACT_V1',
    stage3f0CertificationHash: '3b2b2a42d43a77943d98bc4b0e865dab85b106a94e06320f4593f8e1a9194582',
    stage3f0CertificationIntact,
    stage3eRouterFreezeHash: recovery.hashes.stage3eRouterFreeze,
    stage3eReplayPass: recovery.status === 'PASS',
    predecessorOwnerFilesUnmodified,
    predecessorHashes,
  },
  checks,
  tests: stage3f1Tests,
  failureInjectionPass: checks.environmentMismatchFailsClosed
    && checks.conflictsPreserved && checks.instrumentationFailureIsolated,
  authority: {
    tier: first.authority.tier,
    canDispatch: first.authority.canDispatch,
    canMutateLiveWorld: first.authority.canMutateLiveWorld,
    incumbentSoleExecutor: true,
  },
  onlineLearningEnabled: false,
  nextSubstage: 'STAGE_3F_2_ENVIRONMENT_CALIBRATION_CONTRACT_V1',
};
payload.certificationHash = textSha256(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(artifactPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash
    && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({
    check: 'STAGE3F1_CERTIFICATION',
    reproduced,
    storedHash: stored.certificationHash,
    recomputedHash: payload.certificationHash,
    stage3f1Tests,
  }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
