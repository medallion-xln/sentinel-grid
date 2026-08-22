import { performance } from 'node:perf_hooks';
import { actionKey, validateObservationPacket } from '../core/contracts.js';
import { createSeededRandom, deriveSeed, sha256 } from '../core/determinism.js';
import { recommend } from '../prime/root-puct.js';
import { LEGACY_ACTIONS, LEGACY_ENGINE_ID } from '../compat/zeknova-stage1az-legacy.js';
import {
  STAGE2F_RECORD_SCHEMA_VERSION,
  validateStage2FQualificationIdentity,
} from './zeknova-stage2f-identity.js';

export const ZEKNOVA_LIVE_CAPTURE_VERSION = 1;
export const ZEKNOVA_SHADOW_RECORD_VERSION = STAGE2F_RECORD_SCHEMA_VERSION;
export const ZEKNOVA_SHADOW_CERTIFICATION_VERSION = 1;

export const DEFAULT_PRODUCTION_SHADOW_THRESHOLDS = Object.freeze({
  minRecordCount: 1000,
  minDistinctSourceStates: 250,
  minSessionCount: 5,
  minFactionCount: 4,
  minBiomeCount: 4,
  minMissionCount: 12,
  minMissionPhaseCount: 3,
  minTensionBandCount: 3,
  minInfrastructureBandCount: 3,
  minDistinctLegalMasks: 6,
  minDistinctSelectedActions: 3,
  minTotalSimulations: 320000,
  requiredSelectedActionAgreementRate: 1,
  requiredRankingAgreementRate: 1,
  requiredObservationAgreementRate: 1,
  requiredLegalMaskAgreementRate: 1,
  requiredTargetSlotAgreementRate: 1,
  requiredTransitionAgreementRate: 1,
  maxIllegalRecommendationCount: 0,
  maxSourceMutationCount: 0,
  maxAuthorityViolationCount: 0,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equalJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function normalizeRanking(ranking) {
  return ranking.map((entry) => ({
    actionKey: entry.actionKey,
    visits: entry.visits,
    valueSum: Number(entry.valueSum.toFixed(12)),
    meanValue: Number(entry.meanValue.toFixed(12)),
  }));
}
function stableUnique(values) { return [...new Set(values)].sort(); }
function rate(records, field) {
  if (records.length === 0) return 0;
  return Number((records.filter((record) => record.agreement[field] === true).length / records.length).toFixed(12));
}
function validateString(value, name) {
  assert(typeof value === 'string' && value.length > 0, `${name} must be a non-empty string`);
  return value;
}
function validateInteger(value, name, minimum = 0) {
  assert(Number.isInteger(value) && value >= minimum, `${name} must be an integer >= ${minimum}`);
  return value;
}

export function validateZekNovaLiveCapture(capture, { campaignManifest = null } = {}) {
  assert(capture && typeof capture === 'object' && !Array.isArray(capture), 'Live capture must be an object');
  assert(capture.captureVersion === ZEKNOVA_LIVE_CAPTURE_VERSION, `captureVersion must be ${ZEKNOVA_LIVE_CAPTURE_VERSION}`);
  validateString(capture.captureId, 'captureId');
  assert(capture.context && typeof capture.context === 'object', 'capture.context is required');
  for (const field of ['sessionId', 'factionId', 'biomeId', 'missionId', 'missionPhase', 'tensionBand', 'infrastructureBand']) {
    validateString(capture.context[field], `context.${field}`);
  }
  validateInteger(capture.context.sequence, 'context.sequence');
  validateInteger(capture.context.tick, 'context.tick');
  assert(capture.envelope && typeof capture.envelope === 'object', 'capture.envelope is required');
  assert(capture.legacyEvidence && typeof capture.legacyEvidence === 'object', 'capture.legacyEvidence is required');
  assert(capture.envelope.gameId === 'zeknova', 'Live capture envelope gameId must be zeknova');
  assert(capture.envelope.adapterId === 'zeknova-stage1az-shadow-adapter', 'Live capture adapterId mismatch');
  assert(capture.envelope.formatId === 'zeknova/stage1az-faction-state-json', 'Live capture formatId mismatch');
  assert(capture.legacyEvidence.observerId === capture.context.factionId, 'Capture factionId must match legacy observerId');
  assert(capture.envelope.observers.includes(capture.context.factionId), 'Capture faction must be declared as an envelope observer');
  assert(capture.legacyEvidence.recommendation?.engineId === LEGACY_ENGINE_ID, 'Legacy engine identity mismatch');
  assert(Number.isInteger(capture.legacyEvidence.simulations) && capture.legacyEvidence.simulations > 0, 'Legacy simulations must be positive');
  assert(Number.isFinite(capture.legacyEvidence.cPuct) && capture.legacyEvidence.cPuct > 0, 'Legacy cPuct must be positive');
  assert(Array.isArray(capture.legacyEvidence.legalMask) && capture.legacyEvidence.legalMask.length === 6, 'Legacy legalMask must contain six entries');
  assert(capture.legacyEvidence.legalMask.some(Boolean), 'Legacy legalMask must contain a legal action');
  assert(Array.isArray(capture.legacyEvidence.legalActionKeys), 'Legacy legalActionKeys are required');
  assert(Array.isArray(capture.legacyEvidence.transitions), 'Legacy transitions are required');
  assert(Array.isArray(capture.legacyEvidence.recommendation?.ranking), 'Legacy recommendation ranking is required');
  if (campaignManifest) {
    validateStage2FQualificationIdentity(capture.qualificationIdentity, {
      campaignManifest,
      sessionId: capture.context.sessionId,
      samplingIdentity: capture.envelope?.metadata?.stateIdentity,
    });
  }
  return structuredClone(capture);
}

export function evaluateZekNovaLiveCapture({ adapter, manifest, configuration, capture, campaignManifest = null }) {
  const startedAt = performance.now();
  const validated = validateZekNovaLiveCapture(capture, { campaignManifest });
  const expected = validated.legacyEvidence;
  const observerId = validated.context.factionId;
  const state = adapter.importSnapshot(structuredClone(validated.envelope.payload), {
    mode: 'detached-snapshot-ingestion',
    formatId: validated.envelope.formatId,
    formatVersion: validated.envelope.formatVersion,
    snapshotId: validated.envelope.snapshotId,
    configuration,
  });
  const sourceStateHash = sha256(state);
  const observation = validateObservationPacket(adapter.observe(state, observerId), manifest);
  const actions = adapter.legalActions(state, observerId).sort((a, b) => actionKey(a).localeCompare(actionKey(b)));
  const actionKeys = actions.map(actionKey);
  const transitions = actions.map((action, index) => {
    const transitionSeed = deriveSeed(BigInt(expected.seed), 'root-transition', index, actionKey(action));
    const clone = adapter.cloneState(state);
    const result = adapter.step(clone, structuredClone(action), {
      observerId,
      seed: transitionSeed,
      simulationIndex: index,
      random: createSeededRandom(transitionSeed),
      mode: 'detached-simulation',
    });
    return { actionKey: actionKey(action), stateHash: sha256(result.state), reward: result.reward, terminal: result.terminal };
  });
  const universalRecommendation = recommend({
    adapter,
    state,
    observerId,
    seed: BigInt(expected.seed),
    simulations: expected.simulations,
    cPuct: expected.cPuct,
  });
  const universalRanking = normalizeRanking(universalRecommendation.ranking);
  const legacyRanking = normalizeRanking(expected.recommendation.ranking);
  const selectedActionKey = universalRecommendation.selected.actionKey;
  const legalSet = new Set(actionKeys);
  const agreement = {
    sourceState: sourceStateHash === expected.sourceStateHash,
    observation: sha256(observation.features) === expected.observationHash,
    legalMask: sha256(state.factions[observerId].legalMask) === expected.legalMaskHash,
    targetSlots: sha256(state.factions[observerId].targetSlots) === expected.targetSlotsHash,
    legalActions: equalJson(actionKeys, expected.legalActionKeys),
    transitions: equalJson(transitions, expected.transitions),
    outcome: adapter.outcome(state, observerId).scalar === expected.outcomeScalar,
    ranking: equalJson(universalRanking, legacyRanking),
    selectedAction: selectedActionKey === expected.recommendation.selectedActionKey,
    sourceUnmutated: sha256(state) === sourceStateHash,
    recommendationLegal: legalSet.has(selectedActionKey),
    authority: manifest.authority?.tier === 'R0' && manifest.authority?.executionInterface === false,
  };
  const pass = Object.values(agreement).every(Boolean);
  const payload = {
    shadowRecordVersion: validated.qualificationIdentity ? ZEKNOVA_SHADOW_RECORD_VERSION : 1,
    captureId: validated.captureId,
    fixtureHash: sha256({ envelope: validated.envelope, legacyEvidence: validated.legacyEvidence }),
    captureHash: sha256(validated),
    capturedAt: validated.capturedAt ?? null,
    captureProvenance: structuredClone(validated.source ?? { kind: 'unknown', productionEligible: false }),
    ...(validated.qualificationIdentity ? { qualificationIdentity: structuredClone(validated.qualificationIdentity) } : {}),
    context: validated.context,
    sourceStateHash,
    observerId,
    seed: String(expected.seed),
    simulations: expected.simulations,
    cPuct: expected.cPuct,
    observationHash: sha256(observation.features),
    legalMaskHash: sha256(state.factions[observerId].legalMask),
    targetSlotsHash: sha256(state.factions[observerId].targetSlots),
    legalActionKeys: actionKeys,
    legalActionKeysHash: sha256(actionKeys),
    selectedActionKey,
    legacySelectedActionKey: expected.recommendation.selectedActionKey,
    rankingHash: sha256(universalRanking),
    legacyRankingHash: sha256(legacyRanking),
    agreement,
    pass,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  };
  const record = Object.freeze({ ...payload, recordHash: sha256(payload) });
  return {
    pass,
    record,
    diagnostics: { durationMs: Number((performance.now() - startedAt).toFixed(3)), universalRecommendationHash: sha256(universalRecommendation) },
  };
}

export function validateShadowRecord(record) {
  assert(record && typeof record === 'object' && !Array.isArray(record), 'Shadow record must be an object');
  assert(record.shadowRecordVersion === 1 || record.shadowRecordVersion === ZEKNOVA_SHADOW_RECORD_VERSION, 'Unsupported shadow record version');
  const { recordHash, ...payload } = record;
  assert(recordHash === sha256(payload), 'Shadow record hash mismatch');
  assert(record.authority?.tier === 'R0', 'Shadow record authority must remain R0');
  assert(record.authority?.canDispatch === false && record.authority?.canMutateLiveWorld === false, 'Shadow record cannot dispatch or mutate the live world');
  if (record.shadowRecordVersion === ZEKNOVA_SHADOW_RECORD_VERSION) {
    assert(record.qualificationIdentity && typeof record.qualificationIdentity === 'object', 'Stage2F v2 record requires qualificationIdentity');
  }
  return structuredClone(record);
}

export function summarizeShadowRecords(records) {
  const validated = records.map(validateShadowRecord);
  const hashes = new Set();
  for (const record of validated) {
    assert(!hashes.has(record.recordHash), `Duplicate shadow record: ${record.recordHash}`);
    hashes.add(record.recordHash);
  }
  return Object.freeze({
    recordCount: validated.length,
    distinctSourceStateCount: new Set(validated.map((record) => record.sourceStateHash)).size,
    sessionIds: stableUnique(validated.map((record) => record.context.sessionId)),
    factions: stableUnique(validated.map((record) => record.context.factionId)),
    biomes: stableUnique(validated.map((record) => record.context.biomeId)),
    missions: stableUnique(validated.map((record) => record.context.missionId)),
    missionPhases: stableUnique(validated.map((record) => record.context.missionPhase)),
    tensionBands: stableUnique(validated.map((record) => record.context.tensionBand)),
    infrastructureBands: stableUnique(validated.map((record) => record.context.infrastructureBand)),
    distinctLegalMaskCount: new Set(validated.map((record) => record.legalMaskHash)).size,
    distinctSelectedActionCount: new Set(validated.map((record) => record.selectedActionKey)).size,
    totalSimulations: validated.reduce((sum, record) => sum + record.simulations, 0),
    selectedActionAgreementRate: rate(validated, 'selectedAction'),
    rankingAgreementRate: rate(validated, 'ranking'),
    observationAgreementRate: rate(validated, 'observation'),
    legalMaskAgreementRate: rate(validated, 'legalMask'),
    targetSlotAgreementRate: rate(validated, 'targetSlots'),
    transitionAgreementRate: rate(validated, 'transitions'),
    illegalRecommendationCount: validated.filter((record) => !record.agreement.recommendationLegal).length,
    sourceMutationCount: validated.filter((record) => !record.agreement.sourceUnmutated).length,
    authorityViolationCount: validated.filter((record) => !record.agreement.authority).length,
    failedRecordCount: validated.filter((record) => !record.pass).length,
    recordsHash: sha256(validated.map((record) => record.recordHash).sort()),
  });
}

function thresholdCheck(name, actual, operator, expected) {
  const pass = operator === '>=' ? actual >= expected : actual <= expected;
  return { name, pass, actual, operator, expected };
}

export function certifyZekNovaSustainedShadow({ manifest, records, thresholds = DEFAULT_PRODUCTION_SHADOW_THRESHOLDS, profileName = 'production-live-r0' }) {
  const summary = summarizeShadowRecords(records);
  const checks = [
    { name: 'shadow-record-integrity', pass: summary.failedRecordCount === 0, failedRecordCount: summary.failedRecordCount, recordsHash: summary.recordsHash },
    thresholdCheck('minimum-shadow-records', summary.recordCount, '>=', thresholds.minRecordCount),
    thresholdCheck('minimum-distinct-source-states', summary.distinctSourceStateCount, '>=', thresholds.minDistinctSourceStates),
    thresholdCheck('minimum-shadow-sessions', summary.sessionIds.length, '>=', thresholds.minSessionCount),
    thresholdCheck('faction-coverage', summary.factions.length, '>=', thresholds.minFactionCount),
    thresholdCheck('biome-coverage', summary.biomes.length, '>=', thresholds.minBiomeCount),
    thresholdCheck('mission-coverage', summary.missions.length, '>=', thresholds.minMissionCount),
    thresholdCheck('mission-phase-coverage', summary.missionPhases.length, '>=', thresholds.minMissionPhaseCount),
    thresholdCheck('tension-band-coverage', summary.tensionBands.length, '>=', thresholds.minTensionBandCount),
    thresholdCheck('infrastructure-band-coverage', summary.infrastructureBands.length, '>=', thresholds.minInfrastructureBandCount),
    thresholdCheck('legal-mask-coverage', summary.distinctLegalMaskCount, '>=', thresholds.minDistinctLegalMasks),
    thresholdCheck('selected-action-diversity', summary.distinctSelectedActionCount, '>=', thresholds.minDistinctSelectedActions),
    thresholdCheck('minimum-total-simulations', summary.totalSimulations, '>=', thresholds.minTotalSimulations),
    thresholdCheck('selected-action-agreement', summary.selectedActionAgreementRate, '>=', thresholds.requiredSelectedActionAgreementRate),
    thresholdCheck('ranking-agreement', summary.rankingAgreementRate, '>=', thresholds.requiredRankingAgreementRate),
    thresholdCheck('observation-agreement', summary.observationAgreementRate, '>=', thresholds.requiredObservationAgreementRate),
    thresholdCheck('legal-mask-agreement', summary.legalMaskAgreementRate, '>=', thresholds.requiredLegalMaskAgreementRate),
    thresholdCheck('target-slot-agreement', summary.targetSlotAgreementRate, '>=', thresholds.requiredTargetSlotAgreementRate),
    thresholdCheck('transition-agreement', summary.transitionAgreementRate, '>=', thresholds.requiredTransitionAgreementRate),
    thresholdCheck('illegal-recommendation-limit', summary.illegalRecommendationCount, '<=', thresholds.maxIllegalRecommendationCount),
    thresholdCheck('source-mutation-limit', summary.sourceMutationCount, '<=', thresholds.maxSourceMutationCount),
    thresholdCheck('authority-violation-limit', summary.authorityViolationCount, '<=', thresholds.maxAuthorityViolationCount),
    { name: 'r0-promotion-boundary', pass: manifest.authority?.tier === 'R0' && manifest.authority?.executionInterface === false, tier: manifest.authority?.tier, canDispatch: false, canMutateLiveWorld: false, scriptedNpcExecutorPreserved: true },
  ];
  const pass = checks.every((check) => check.pass);
  return Object.freeze({
    pass,
    status: pass ? 'sustained-shadow-certified' : records.length === 0 ? 'pending-live-fixture-capture' : 'shadow-evidence-insufficient',
    adapter: manifest,
    certification: {
      evidenceKind: 'zeknova-real-state-sustained-shadow',
      certificationVersion: ZEKNOVA_SHADOW_CERTIFICATION_VERSION,
      profileName,
      thresholdHash: sha256(thresholds),
      recordsHash: summary.recordsHash,
      promotionEligible: pass,
      authority: 'R0',
    },
    checks,
    summary,
  });
}

export function buildZekNovaShadowFrameworkCertification({ manifest, evaluations }) {
  const records = evaluations.map((evaluation) => evaluation.record);
  const selfTestThresholds = {
    ...DEFAULT_PRODUCTION_SHADOW_THRESHOLDS,
    minRecordCount: 6,
    minDistinctSourceStates: 6,
    minSessionCount: 2,
    minFactionCount: 1,
    minBiomeCount: 1,
    minMissionCount: 6,
    minMissionPhaseCount: 3,
    minTensionBandCount: 3,
    minInfrastructureBandCount: 3,
    minTotalSimulations: 1920,
  };
  const selfTest = certifyZekNovaSustainedShadow({ manifest, records, thresholds: selfTestThresholds, profileName: 'framework-replay-self-test-r0' });
  const productionGate = certifyZekNovaSustainedShadow({ manifest, records, thresholds: DEFAULT_PRODUCTION_SHADOW_THRESHOLDS, profileName: 'production-live-r0' });
  const summary = summarizeShadowRecords(records);
  const checks = [
    { name: 'live-capture-contract', pass: evaluations.length === 6, evaluatedCaptureCount: evaluations.length },
    { name: 'real-state-parity-evaluator', pass: evaluations.every((evaluation) => evaluation.pass), passingCaptureCount: evaluations.filter((evaluation) => evaluation.pass).length },
    { name: 'shadow-record-self-hashing', pass: records.every((record) => validateShadowRecord(record).recordHash === record.recordHash), recordCount: records.length },
    { name: 'shadow-summary-determinism', pass: sha256(summary) === sha256(summarizeShadowRecords(records)), recordsHash: summary.recordsHash },
    { name: 'sustained-shadow-self-test-profile', pass: selfTest.pass, selfTestCheckCount: selfTest.checks.length },
    { name: 'production-gate-fails-closed-on-replay-corpus', pass: productionGate.pass === false && productionGate.status === 'shadow-evidence-insufficient', productionStatus: productionGate.status },
    { name: 'production-thresholds-are-explicit', pass: Object.keys(DEFAULT_PRODUCTION_SHADOW_THRESHOLDS).length >= 20, thresholdHash: sha256(DEFAULT_PRODUCTION_SHADOW_THRESHOLDS) },
    { name: 'no-live-promotion-from-framework-evidence', pass: productionGate.certification.promotionEligible === false, promotionEligible: false },
    { name: 'r0-shadow-boundary', pass: manifest.authority?.tier === 'R0' && manifest.authority?.executionInterface === false, tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  ];
  return Object.freeze({
    pass: checks.every((check) => check.pass),
    adapter: manifest,
    certification: {
      evidenceKind: 'zeknova-real-state-shadow-framework',
      frameworkVersion: 1,
      replayCaptureCount: evaluations.length,
      productionPromotionEligible: false,
      liveEvidenceStatus: 'pending-live-fixture-capture',
      authority: 'R0',
    },
    checks,
    selfTest,
    productionGate,
  });
}
