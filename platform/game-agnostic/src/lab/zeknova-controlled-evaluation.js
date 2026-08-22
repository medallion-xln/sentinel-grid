import { sha256 } from '../core/determinism.js';
import {
  DEFAULT_PRODUCTION_SHADOW_THRESHOLDS,
  certifyZekNovaSustainedShadow,
  validateShadowRecord,
} from './zeknova-real-state-shadow.js';
import {
  STAGE2F_RECORD_SCHEMA_VERSION,
  STAGE2F_SESSION_MANIFEST_VERSION,
  validateStage2FCampaignManifest,
  validateStage2FQualificationIdentity,
} from './zeknova-stage2f-identity.js';

export const ZEKNOVA_SESSION_MANIFEST_VERSION = STAGE2F_SESSION_MANIFEST_VERSION;
export const ZEKNOVA_CAMPAIGN_CERTIFICATION_VERSION = 2;
export const ZEKNOVA_CANDIDATE_EVALUATION_VERSION = 1;
export const ZEKNOVA_CONTROLLED_DECISION_VERSION = 1;

export const DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS = Object.freeze({
  ...DEFAULT_PRODUCTION_SHADOW_THRESHOLDS,
  minAuthenticRecordCount: 1000,
  minManifestedSessionCount: 5,
  minHoldoutRecordCount: 200,
  maxDuplicateCaptureIdCount: 0,
  maxDuplicateFixtureHashCount: 0,
  maxSessionSequenceGapCount: 0,
  maxSessionChainBreakCount: 0,
  maxQuarantinedRecordCount: 0,
});

export const DEFAULT_CONTROLLED_CANDIDATE_THRESHOLDS = Object.freeze({
  minCandidateRecordCount: 250,
  minCandidateDistinctStateCount: 100,
  minCandidateSessionCount: 3,
  minCandidateHoldoutRecordCount: 50,
  maxIllegalSelectedActionCount: 0,
  maxIllegalRankingActionCount: 0,
  maxSourceMutationCount: 0,
  maxAuthorityViolationCount: 0,
  maxInvalidRecordCount: 0,
  maxP95LatencyMs: 500,
  maxP95LatencyRatio: 1.5,
  maxMedianLatencyRatio: 1.25,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function validateString(value, name) {
  assert(typeof value === 'string' && value.length > 0, `${name} must be a non-empty string`);
  return value;
}
function validateIso(value, name) {
  validateString(value, name);
  assert(!Number.isNaN(Date.parse(value)), `${name} must be an ISO-compatible timestamp`);
  return value;
}
function isSha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function stableUnique(values) { return [...new Set(values)].sort(); }
function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Number(sorted[index].toFixed(6));
}
function median(values) { return percentile(values, 0.5); }
function thresholdCheck(name, actual, operator, expected) {
  const pass = operator === '>=' ? actual >= expected : actual <= expected;
  return { name, pass, actual, operator, expected };
}
function recordPayload(record) {
  const { recordHash, ...payload } = record;
  return payload;
}
function candidatePayload(record) {
  const { candidateRecordHash, ...payload } = record;
  return payload;
}
function isAuthenticLiveRuntimeRecord(record) {
  const source = record.captureProvenance;
  return source?.kind === 'live-runtime'
    && source?.productionEligible === true
    && validateOptionalSha(source.runtimeBuildHash)
    && validateOptionalSha(source.repositoryHead)
    && typeof source.collectorId === 'string'
    && source.collectorId.length > 0
    && typeof record.capturedAt === 'string'
    && !Number.isNaN(Date.parse(record.capturedAt));
}
function validateOptionalSha(value) {
  return typeof value === 'string' && (/^[a-f0-9]{40}$/.test(value) || /^[a-f0-9]{64}$/.test(value));
}

export function buildZekNovaSessionManifest({
  sessionId,
  environmentId,
  repositoryHead,
  runtimeBuildHash,
  collectorId,
  startedAt,
  endedAt,
  records,
  campaignManifest = null,
}) {
  validateString(sessionId, 'sessionId');
  validateString(environmentId, 'environmentId');
  assert(validateOptionalSha(repositoryHead), 'repositoryHead must be a 40- or 64-character lowercase hex hash');
  assert(isSha256(runtimeBuildHash), 'runtimeBuildHash must be a SHA-256 hex string');
  validateString(collectorId, 'collectorId');
  validateIso(startedAt, 'startedAt');
  validateIso(endedAt, 'endedAt');
  assert(Date.parse(endedAt) >= Date.parse(startedAt), 'endedAt cannot precede startedAt');
  assert(Array.isArray(records) && records.length > 0, 'records must be a non-empty array');
  const validated = records.map(validateShadowRecord).filter((record) => record.context.sessionId === sessionId);
  assert(validated.length === records.length, 'Every session record must match sessionId');
  const ordered = [...validated].sort((a, b) => a.context.sequence - b.context.sequence || a.captureId.localeCompare(b.captureId));
  const bound = campaignManifest !== null;
  const campaign = bound ? validateStage2FCampaignManifest(campaignManifest) : null;
  if (bound) {
    assert(ordered.every((record) => record.shadowRecordVersion === STAGE2F_RECORD_SCHEMA_VERSION), 'Every bound session record must use the current record schema');
    for (const record of ordered) {
      validateStage2FQualificationIdentity(record.qualificationIdentity, {
        campaignManifest: campaign,
        sessionId,
        samplingIdentity: record.qualificationIdentity?.samplingIdentity,
      });
    }
    assert(new Set(ordered.map((record) => record.qualificationIdentity.samplingIdentity)).size === ordered.length, 'Session contains a duplicate sampling identity');
  }
  const sequences = ordered.map((record) => record.context.sequence);
  assert(new Set(sequences).size === sequences.length, 'Session contains a duplicate sequence');
  for (let index = 1; index < sequences.length; index += 1) assert(sequences[index] === sequences[index - 1] + 1, 'Session sequence chain is not contiguous');
  const entries = ordered.map((record) => ({
    sequence: record.context.sequence,
    captureId: record.captureId,
    captureHash: record.captureHash ?? null,
    recordHash: record.recordHash,
    sourceStateHash: record.sourceStateHash,
    ...(bound ? { samplingIdentity: record.qualificationIdentity.samplingIdentity } : {}),
  }));
  const payload = {
    manifestVersion: bound ? ZEKNOVA_SESSION_MANIFEST_VERSION : 1,
    sessionId,
    environmentId,
    repositoryHead,
    runtimeBuildHash,
    collectorId,
    startedAt,
    endedAt,
    recordCount: entries.length,
    firstSequence: entries[0].sequence,
    lastSequence: entries.at(-1).sequence,
    ...(bound ? {
      stage2fCampaignId: campaign.stage2fCampaignId,
      sentinelRuntimeId: campaign.sentinelRuntimeId,
      generatedRuntimeProvenanceId: campaign.generatedRuntimeProvenanceId,
      recordSchemaVersion: campaign.recordSchemaVersion,
      collectorSchemaVersion: campaign.collectorSchemaVersion,
      samplingIdentities: entries.map((entry) => entry.samplingIdentity),
      samplingIdentitiesHash: sha256(entries.map((entry) => entry.samplingIdentity)),
      evidenceMode: campaign.campaignMode,
      qualificationEligible: campaign.qualificationEligible === true,
    } : {}),
    entries,
    entriesHash: sha256(entries),
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
  };
  return Object.freeze({ ...payload, manifestHash: sha256(payload) });
}

export function validateZekNovaSessionManifest(manifest, records, { campaignManifest = null } = {}) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'Session manifest must be an object');
  assert(manifest.manifestVersion === 1 || manifest.manifestVersion === ZEKNOVA_SESSION_MANIFEST_VERSION, 'Unsupported session manifest version');
  if (campaignManifest) assert(manifest.manifestVersion === ZEKNOVA_SESSION_MANIFEST_VERSION, 'Bound campaign requires the current session manifest schema');
  const { manifestHash, ...payload } = manifest;
  assert(manifestHash === sha256(payload), 'Session manifest hash mismatch');
  assert(manifest.authority?.tier === 'R0' && manifest.authority?.canDispatch === false && manifest.authority?.canMutateLiveWorld === false, 'Session manifest must remain R0');
  if (manifest.manifestVersion === ZEKNOVA_SESSION_MANIFEST_VERSION) assert(manifest.authority?.canIssueAuthorityTokens === false, 'Session manifest cannot issue authority tokens');
  const rebuilt = buildZekNovaSessionManifest({
    sessionId: manifest.sessionId,
    environmentId: manifest.environmentId,
    repositoryHead: manifest.repositoryHead,
    runtimeBuildHash: manifest.runtimeBuildHash,
    collectorId: manifest.collectorId,
    startedAt: manifest.startedAt,
    endedAt: manifest.endedAt,
    records,
    campaignManifest,
  });
  assert(rebuilt.manifestHash === manifest.manifestHash, 'Session manifest does not match supplied records');
  return structuredClone(manifest);
}

function identityFailure(record, campaignManifest) {
  if (!record?.qualificationIdentity?.sentinelRuntimeId) return 'MISSING_RUNTIME_BINDING';
  if (!record.qualificationIdentity.generatedRuntimeProvenanceId) return 'MISSING_PROVENANCE_ID';
  if (!record.qualificationIdentity.stage2fCampaignId) return 'MISSING_CAMPAIGN_ID';
  if (record.shadowRecordVersion !== STAGE2F_RECORD_SCHEMA_VERSION) return 'UNKNOWN_SCHEMA';
  try {
    validateShadowRecord(record);
  } catch (error) {
    return /version/i.test(error.message) ? 'UNKNOWN_SCHEMA' : 'TAMPERED';
  }
  if (!campaignManifest) return 'UNKNOWN_CAMPAIGN';
  try {
    validateStage2FQualificationIdentity(record.qualificationIdentity, {
      campaignManifest,
      sessionId: record.context?.sessionId,
      samplingIdentity: record.qualificationIdentity?.samplingIdentity,
    });
  } catch (error) {
    return error.code ?? 'TAMPERED';
  }
  if (record.authority?.tier !== 'R0'
      || record.authority?.canDispatch !== false
      || record.authority?.canMutateLiveWorld !== false) return 'AUTHORITY_MISMATCH';
  if (record.captureProvenance?.sentinelRuntimeId !== record.qualificationIdentity.sentinelRuntimeId) return 'RUNTIME_ID_MISMATCH';
  if (record.captureProvenance?.generatedRuntimeProvenanceId !== record.qualificationIdentity.generatedRuntimeProvenanceId) return 'PROVENANCE_ID_MISMATCH';
  if (record.captureProvenance?.stage2fCampaignId !== record.qualificationIdentity.stage2fCampaignId) return 'CAMPAIGN_ID_MISMATCH';
  return null;
}

export function reconcileStage2FEvidence({ records, sessionManifests = [], campaignManifest = null }) {
  assert(Array.isArray(records), 'records must be an array');
  assert(Array.isArray(sessionManifests), 'sessionManifests must be an array');
  let campaign = null;
  let campaignError = null;
  try { campaign = campaignManifest ? validateStage2FCampaignManifest(campaignManifest) : null; }
  catch (error) { campaignError = error.code ?? 'UNKNOWN_CAMPAIGN'; }

  const accepted = [];
  const quarantined = [];
  const rejected = [];
  const candidates = [];
  const seenRecordHashes = new Set();
  const seenSamplingIdentities = new Set();
  for (const [index, record] of records.entries()) {
    const recordRef = record?.recordHash ?? record?.captureId ?? `index:${index}`;
    const failure = campaignError ?? identityFailure(record, campaign);
    if (failure) {
      const target = record?.shadowRecordVersion === 1 || failure.startsWith('MISSING_') ? quarantined : rejected;
      target.push({ recordRef, reason: failure });
      continue;
    }
    if (seenRecordHashes.has(record.recordHash) || seenSamplingIdentities.has(record.qualificationIdentity.samplingIdentity)) {
      rejected.push({ recordRef, reason: 'DUPLICATE' });
      continue;
    }
    seenRecordHashes.add(record.recordHash);
    seenSamplingIdentities.add(record.qualificationIdentity.samplingIdentity);
    candidates.push(record);
  }

  const manifestsBySession = new Map();
  for (const manifest of sessionManifests) {
    if (manifestsBySession.has(manifest?.sessionId)) {
      manifestsBySession.set(manifest.sessionId, null);
    } else manifestsBySession.set(manifest?.sessionId, manifest);
  }
  for (const record of candidates) {
    const sessionId = record.context.sessionId;
    const sessionRecords = candidates.filter((entry) => entry.context.sessionId === sessionId);
    const sessionManifest = manifestsBySession.get(sessionId);
    const recordRef = record.recordHash;
    if (!sessionManifest) {
      rejected.push({ recordRef, reason: 'BROKEN_SESSION_CHAIN' });
      continue;
    }
    try {
      validateZekNovaSessionManifest(sessionManifest, sessionRecords, { campaignManifest: campaign });
      accepted.push(record);
    } catch {
      rejected.push({ recordRef, reason: 'BROKEN_SESSION_CHAIN' });
    }
  }

  const reasons = {};
  for (const item of [...quarantined, ...rejected]) reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
  return Object.freeze({
    reconciliationVersion: 2,
    stage2fCampaignId: campaign?.stage2fCampaignId ?? null,
    sentinelRuntimeId: campaign?.sentinelRuntimeId ?? null,
    generatedRuntimeProvenanceId: campaign?.generatedRuntimeProvenanceId ?? null,
    total: records.length,
    accepted: accepted.length,
    quarantined: quarantined.length,
    rejected: rejected.length,
    acceptedRecords: Object.freeze(accepted.map((record) => structuredClone(record))),
    quarantinedRecords: Object.freeze(quarantined),
    rejectedRecords: Object.freeze(rejected),
    reasons: Object.freeze(reasons),
  });
}

function analyzeSessionChains(records, manifests, campaignManifest = null) {
  const manifestBySession = new Map(manifests.map((manifest) => [manifest.sessionId, manifest]));
  let sequenceGapCount = 0;
  let chainBreakCount = 0;
  const sessions = stableUnique(records.map((record) => record.context.sessionId));
  for (const sessionId of sessions) {
    const sessionRecords = records.filter((record) => record.context.sessionId === sessionId);
    const manifest = manifestBySession.get(sessionId);
    if (!manifest) {
      chainBreakCount += 1;
      continue;
    }
    try { validateZekNovaSessionManifest(manifest, sessionRecords, { campaignManifest }); } catch { chainBreakCount += 1; }
    const sequences = [...sessionRecords].map((record) => record.context.sequence).sort((a, b) => a - b);
    for (let index = 1; index < sequences.length; index += 1) {
      if (sequences[index] !== sequences[index - 1] + 1) sequenceGapCount += 1;
    }
  }
  return { sequenceGapCount, chainBreakCount, manifestedSessionCount: manifests.length };
}

function duplicateCount(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

export function certifyZekNovaSustainedShadowCampaign({
  manifest,
  records,
  sessionManifests = [],
  campaignManifest = null,
  thresholds = DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS,
  profileName = 'stage2f-production-live-r0',
}) {
  assert(Array.isArray(records), 'records must be an array');
  assert(Array.isArray(sessionManifests), 'sessionManifests must be an array');
  let boundCampaign = null;
  try { boundCampaign = campaignManifest ? validateStage2FCampaignManifest(campaignManifest) : null; } catch { boundCampaign = null; }
  const reconciliation = reconcileStage2FEvidence({ records, sessionManifests, campaignManifest });
  const validated = reconciliation.acceptedRecords.filter((record) => record.qualificationIdentity?.qualificationEligible === true && isAuthenticLiveRuntimeRecord(record));
  const quarantined = [
    ...reconciliation.quarantinedRecords,
    ...reconciliation.rejectedRecords,
    ...reconciliation.acceptedRecords
      .filter((record) => record.qualificationIdentity?.qualificationEligible !== true || !isAuthenticLiveRuntimeRecord(record))
      .map((record) => ({ recordRef: record.recordHash, reason: record.qualificationIdentity?.evidenceMode === 'DRY_RUN' ? 'DRY_RUN_NONQUALIFYING' : 'NON_AUTHENTIC_OR_INCOMPLETE_LIVE_PROVENANCE' })),
  ];
  const duplicateCaptureIdCount = duplicateCount(validated.map((record) => record.captureId));
  const duplicateFixtureHashCount = duplicateCount(validated.map((record) => record.fixtureHash));
  const chains = analyzeSessionChains(validated, sessionManifests, campaignManifest);
  const baseThresholds = { ...DEFAULT_PRODUCTION_SHADOW_THRESHOLDS, ...thresholds };
  const base = certifyZekNovaSustainedShadow({ manifest, records: validated, thresholds: baseThresholds, profileName });
  const holdoutRecords = validated.filter((record) => Number.parseInt(record.sourceStateHash.slice(0, 8), 16) % 5 === 0);
  const checks = [
    { name: 'current-campaign-manifest-required', pass: Boolean(boundCampaign), stage2fCampaignId: boundCampaign?.stage2fCampaignId ?? null },
    { name: 'qualification-campaign-active', pass: boundCampaign?.campaignMode === 'QUALIFICATION' && boundCampaign?.campaignState === 'ACTIVE' && boundCampaign?.qualificationEligible === true, campaignMode: boundCampaign?.campaignMode ?? null, campaignState: boundCampaign?.campaignState ?? null },
    { name: 'authentic-live-runtime-provenance', pass: quarantined.length <= thresholds.maxQuarantinedRecordCount, authenticRecordCount: validated.length, quarantinedRecordCount: quarantined.length },
    { name: 'runtime-identity-binding', pass: validated.every((record) => record.qualificationIdentity.sentinelRuntimeId === campaignManifest?.sentinelRuntimeId), sentinelRuntimeId: campaignManifest?.sentinelRuntimeId ?? null },
    { name: 'generated-runtime-provenance-binding', pass: validated.every((record) => record.qualificationIdentity.generatedRuntimeProvenanceId === campaignManifest?.generatedRuntimeProvenanceId), generatedRuntimeProvenanceId: campaignManifest?.generatedRuntimeProvenanceId ?? null },
    { name: 'campaign-identity-binding', pass: validated.every((record) => record.qualificationIdentity.stage2fCampaignId === campaignManifest?.stage2fCampaignId), stage2fCampaignId: campaignManifest?.stage2fCampaignId ?? null },
    thresholdCheck('minimum-authentic-records', validated.length, '>=', thresholds.minAuthenticRecordCount),
    thresholdCheck('minimum-manifested-sessions', chains.manifestedSessionCount, '>=', thresholds.minManifestedSessionCount),
    thresholdCheck('minimum-deterministic-holdout-records', holdoutRecords.length, '>=', thresholds.minHoldoutRecordCount),
    thresholdCheck('duplicate-capture-id-limit', duplicateCaptureIdCount, '<=', thresholds.maxDuplicateCaptureIdCount),
    thresholdCheck('duplicate-fixture-hash-limit', duplicateFixtureHashCount, '<=', thresholds.maxDuplicateFixtureHashCount),
    thresholdCheck('session-sequence-gap-limit', chains.sequenceGapCount, '<=', thresholds.maxSessionSequenceGapCount),
    thresholdCheck('session-chain-break-limit', chains.chainBreakCount, '<=', thresholds.maxSessionChainBreakCount),
    { name: 'stage2e-sustained-shadow-gate', pass: base.pass, baseStatus: base.status, baseCheckCount: base.checks.length },
    { name: 'r0-campaign-boundary', pass: manifest.authority?.tier === 'R0' && manifest.authority?.executionInterface === false, tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  ];
  const pass = checks.every((check) => check.pass);
  const campaignPayload = {
    campaignCertificationVersion: ZEKNOVA_CAMPAIGN_CERTIFICATION_VERSION,
    stage2fCampaignId: campaignManifest?.stage2fCampaignId ?? null,
    sentinelRuntimeId: campaignManifest?.sentinelRuntimeId ?? null,
    generatedRuntimeProvenanceId: campaignManifest?.generatedRuntimeProvenanceId ?? null,
    profileName,
    authenticRecordCount: validated.length,
    quarantinedRecordCount: quarantined.length,
    sessionManifestCount: sessionManifests.length,
    holdoutRecordCount: holdoutRecords.length,
    recordsHash: sha256(validated.map((record) => record.recordHash).sort()),
    sessionManifestsHash: sha256(sessionManifests.map((entry) => entry.manifestHash).sort()),
    thresholdHash: sha256(thresholds),
    promotionEligible: pass,
    authority: 'R0',
  };
  return Object.freeze({
    pass,
    status: pass ? 'sustained-shadow-campaign-certified' : validated.length === 0 ? 'pending-authentic-live-captures' : 'campaign-evidence-insufficient',
    certification: { ...campaignPayload, campaignHash: sha256(campaignPayload) },
    checks,
    baseCertification: base,
    quarantined,
    reconciliation,
    holdoutRecordHashes: holdoutRecords.map((record) => record.recordHash).sort(),
  });
}

export function evaluateControlledCandidateRecommendation({ shadowRecord, candidateRecommendation }) {
  const baseline = validateShadowRecord(shadowRecord);
  assert(candidateRecommendation && typeof candidateRecommendation === 'object', 'candidateRecommendation is required');
  for (const field of ['candidateId', 'engineId', 'selectedActionKey', 'sourceStateHash', 'sourceStateHashAfter']) validateString(candidateRecommendation[field], field);
  assert(Array.isArray(candidateRecommendation.ranking), 'candidateRecommendation.ranking must be an array');
  assert(Number.isFinite(candidateRecommendation.latencyMs) && candidateRecommendation.latencyMs >= 0, 'candidate latencyMs must be finite and non-negative');
  assert(Number.isFinite(candidateRecommendation.baselineLatencyMs) && candidateRecommendation.baselineLatencyMs > 0, 'baselineLatencyMs must be positive');
  assert(Number.isInteger(candidateRecommendation.simulations) && candidateRecommendation.simulations > 0, 'candidate simulations must be positive');
  const legalKeys = new Set(baseline.legalActionKeys ?? []);
  const rankingKeys = candidateRecommendation.ranking.map((entry) => entry.actionKey);
  const safety = {
    selectedActionLegal: legalKeys.has(candidateRecommendation.selectedActionKey),
    rankingActionsLegal: rankingKeys.length > 0 && rankingKeys.every((key) => legalKeys.has(key)),
    sourceUnmutated: candidateRecommendation.sourceStateHash === baseline.sourceStateHash && candidateRecommendation.sourceStateHashAfter === baseline.sourceStateHash,
    authority: candidateRecommendation.authority?.tier === 'R0' && candidateRecommendation.authority?.canDispatch === false && candidateRecommendation.authority?.canMutateLiveWorld === false,
  };
  const payload = {
    candidateEvaluationVersion: ZEKNOVA_CANDIDATE_EVALUATION_VERSION,
    candidateId: candidateRecommendation.candidateId,
    engineId: candidateRecommendation.engineId,
    captureId: baseline.captureId,
    sessionId: baseline.context.sessionId,
    sourceStateHash: baseline.sourceStateHash,
    shadowRecordHash: baseline.recordHash,
    selectedActionKey: candidateRecommendation.selectedActionKey,
    baselineSelectedActionKey: baseline.selectedActionKey,
    rankingHash: sha256(candidateRecommendation.ranking),
    baselineRankingHash: baseline.rankingHash,
    selectedActionAgreement: candidateRecommendation.selectedActionKey === baseline.selectedActionKey,
    rankingAgreement: sha256(candidateRecommendation.ranking) === baseline.rankingHash,
    latencyMs: Number(candidateRecommendation.latencyMs.toFixed(6)),
    baselineLatencyMs: Number(candidateRecommendation.baselineLatencyMs.toFixed(6)),
    latencyRatio: Number((candidateRecommendation.latencyMs / candidateRecommendation.baselineLatencyMs).toFixed(6)),
    simulations: candidateRecommendation.simulations,
    safety,
    pass: Object.values(safety).every(Boolean),
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  };
  return Object.freeze({ ...payload, candidateRecordHash: sha256(payload) });
}

export function validateCandidateEvaluationRecord(record) {
  assert(record && typeof record === 'object' && !Array.isArray(record), 'Candidate evaluation record must be an object');
  assert(record.candidateEvaluationVersion === ZEKNOVA_CANDIDATE_EVALUATION_VERSION, 'Unsupported candidate evaluation version');
  assert(record.candidateRecordHash === sha256(candidatePayload(record)), 'Candidate evaluation record hash mismatch');
  assert(record.authority?.tier === 'R0' && record.authority?.canDispatch === false && record.authority?.canMutateLiveWorld === false, 'Candidate evaluation must remain R0');
  return structuredClone(record);
}

export function certifyControlledCandidateEvaluation({
  manifest,
  campaignCertification,
  candidateRecords,
  thresholds = DEFAULT_CONTROLLED_CANDIDATE_THRESHOLDS,
}) {
  assert(Array.isArray(candidateRecords), 'candidateRecords must be an array');
  const valid = [];
  let invalidRecordCount = 0;
  for (const record of candidateRecords) {
    try { valid.push(validateCandidateEvaluationRecord(record)); } catch { invalidRecordCount += 1; }
  }
  const distinctStates = new Set(valid.map((record) => record.sourceStateHash)).size;
  const sessions = new Set(valid.map((record) => record.sessionId)).size;
  const holdout = valid.filter((record) => Number.parseInt(record.sourceStateHash.slice(0, 8), 16) % 5 === 0);
  const illegalSelectedActionCount = valid.filter((record) => !record.safety.selectedActionLegal).length;
  const illegalRankingActionCount = valid.filter((record) => !record.safety.rankingActionsLegal).length;
  const sourceMutationCount = valid.filter((record) => !record.safety.sourceUnmutated).length;
  const authorityViolationCount = valid.filter((record) => !record.safety.authority).length;
  const latencies = valid.map((record) => record.latencyMs);
  const ratios = valid.map((record) => record.latencyRatio);
  const checks = [
    { name: 'certified-live-campaign-required', pass: campaignCertification?.pass === true, campaignStatus: campaignCertification?.status ?? 'missing' },
    thresholdCheck('minimum-candidate-records', valid.length, '>=', thresholds.minCandidateRecordCount),
    thresholdCheck('minimum-candidate-distinct-states', distinctStates, '>=', thresholds.minCandidateDistinctStateCount),
    thresholdCheck('minimum-candidate-sessions', sessions, '>=', thresholds.minCandidateSessionCount),
    thresholdCheck('minimum-candidate-holdout-records', holdout.length, '>=', thresholds.minCandidateHoldoutRecordCount),
    thresholdCheck('candidate-illegal-selected-action-limit', illegalSelectedActionCount, '<=', thresholds.maxIllegalSelectedActionCount),
    thresholdCheck('candidate-illegal-ranking-action-limit', illegalRankingActionCount, '<=', thresholds.maxIllegalRankingActionCount),
    thresholdCheck('candidate-source-mutation-limit', sourceMutationCount, '<=', thresholds.maxSourceMutationCount),
    thresholdCheck('candidate-authority-violation-limit', authorityViolationCount, '<=', thresholds.maxAuthorityViolationCount),
    thresholdCheck('candidate-invalid-record-limit', invalidRecordCount, '<=', thresholds.maxInvalidRecordCount),
    thresholdCheck('candidate-p95-latency-ceiling', percentile(latencies, 0.95), '<=', thresholds.maxP95LatencyMs),
    thresholdCheck('candidate-p95-latency-ratio', percentile(ratios, 0.95), '<=', thresholds.maxP95LatencyRatio),
    thresholdCheck('candidate-median-latency-ratio', median(ratios), '<=', thresholds.maxMedianLatencyRatio),
    { name: 'r0-controlled-evaluation-boundary', pass: manifest.authority?.tier === 'R0' && manifest.authority?.executionInterface === false, tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  ];
  const pass = checks.every((check) => check.pass);
  const summary = {
    candidateRecordCount: valid.length,
    distinctStateCount: distinctStates,
    sessionCount: sessions,
    holdoutRecordCount: holdout.length,
    selectedActionAgreementRate: valid.length ? Number((valid.filter((record) => record.selectedActionAgreement).length / valid.length).toFixed(12)) : 0,
    rankingAgreementRate: valid.length ? Number((valid.filter((record) => record.rankingAgreement).length / valid.length).toFixed(12)) : 0,
    p95LatencyMs: percentile(latencies, 0.95),
    medianLatencyMs: median(latencies),
    p95LatencyRatio: percentile(ratios, 0.95),
    medianLatencyRatio: median(ratios),
    recordsHash: sha256(valid.map((record) => record.candidateRecordHash).sort()),
  };
  return Object.freeze({
    pass,
    status: pass ? 'eligible-for-controlled-shadow-evaluation' : campaignCertification?.pass ? 'candidate-regression-or-coverage-blocked' : 'live-campaign-not-certified',
    controlledEvaluationEligible: pass,
    authorityPromotionEligible: false,
    humanReviewRequired: true,
    checks,
    summary,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  });
}

export function buildControlledNextStageDecisionPacket({ campaignCertification, candidateCertification }) {
  const status = campaignCertification?.pass !== true
    ? 'blocked-live-campaign-not-certified'
    : candidateCertification?.pass !== true
      ? 'blocked-candidate-safety-coverage-or-latency'
      : 'ready-for-human-reviewed-controlled-shadow-only';
  const payload = {
    decisionVersion: ZEKNOVA_CONTROLLED_DECISION_VERSION,
    stage: 'Stage 2F-Z',
    status,
    campaignHash: campaignCertification?.certification?.campaignHash ?? null,
    candidateRecordsHash: candidateCertification?.summary?.recordsHash ?? null,
    controlledShadowEvaluationEligible: status === 'ready-for-human-reviewed-controlled-shadow-only',
    authorityPromotionEligible: false,
    humanAuthorizationRequired: true,
    scriptedNpcExecutorPreserved: true,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  };
  return Object.freeze({ ...payload, decisionHash: sha256(payload) });
}

export function buildStage2FFrameworkCertification({ manifest, replayRecords }) {
  const records = replayRecords.map(validateShadowRecord);
  const sessions = stableUnique(records.map((record) => record.context.sessionId));
  const sessionManifests = sessions.map((sessionId, index) => {
    const sessionRecords = records.filter((record) => record.context.sessionId === sessionId);
    return buildZekNovaSessionManifest({
      sessionId,
      environmentId: 'stage2f-framework-self-test',
      repositoryHead: '0'.repeat(40),
      runtimeBuildHash: sha256({ sessionId, index, kind: 'stage2f-framework-self-test' }),
      collectorId: 'sentinel-grid-stage2f-self-test',
      startedAt: `2026-07-28T0${index}:00:00.000Z`,
      endedAt: `2026-07-28T0${index}:59:59.000Z`,
      records: sessionRecords,
    });
  });
  const productionCampaign = certifyZekNovaSustainedShadowCampaign({ manifest, records, sessionManifests });
  const candidateRecords = records.map((record, index) => evaluateControlledCandidateRecommendation({
    shadowRecord: record,
    candidateRecommendation: {
      candidateId: 'stage2f-self-test-candidate',
      engineId: 'sentinel-prime-stage2f-candidate-self-test',
      selectedActionKey: record.selectedActionKey,
      ranking: [{ actionKey: record.selectedActionKey }],
      sourceStateHash: record.sourceStateHash,
      sourceStateHashAfter: record.sourceStateHash,
      latencyMs: 20 + index,
      baselineLatencyMs: 20 + index,
      simulations: record.simulations,
      authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
    },
  }));
  const candidate = certifyControlledCandidateEvaluation({ manifest, campaignCertification: productionCampaign, candidateRecords });
  const decision = buildControlledNextStageDecisionPacket({ campaignCertification: productionCampaign, candidateCertification: candidate });
  const checks = [
    { name: 'session-manifest-self-hashing', pass: sessionManifests.every((entry) => validateZekNovaSessionManifest(entry, records.filter((record) => record.context.sessionId === entry.sessionId)).manifestHash === entry.manifestHash), manifestCount: sessionManifests.length },
    { name: 'session-sequence-chain-validation', pass: analyzeSessionChains(records, sessionManifests).chainBreakCount === 0, sessionCount: sessionManifests.length },
    { name: 'replay-records-quarantined-from-production', pass: productionCampaign.certification.authenticRecordCount === 0 && productionCampaign.quarantined.length === records.length, quarantinedRecordCount: productionCampaign.quarantined.length },
    { name: 'production-campaign-fails-closed-without-authentic-captures', pass: productionCampaign.pass === false && productionCampaign.status === 'pending-authentic-live-captures', status: productionCampaign.status },
    { name: 'candidate-evaluation-record-self-hashing', pass: candidateRecords.every((entry) => validateCandidateEvaluationRecord(entry).candidateRecordHash === entry.candidateRecordHash), recordCount: candidateRecords.length },
    { name: 'candidate-safety-contract', pass: candidateRecords.every((entry) => entry.pass), passingRecordCount: candidateRecords.filter((entry) => entry.pass).length },
    { name: 'candidate-gate-requires-certified-live-campaign', pass: candidate.pass === false && candidate.status === 'live-campaign-not-certified', status: candidate.status },
    { name: 'controlled-decision-remains-blocked', pass: decision.status === 'blocked-live-campaign-not-certified' && decision.controlledShadowEvaluationEligible === false, status: decision.status },
    { name: 'authority-promotion-is-never-implied', pass: decision.authorityPromotionEligible === false && decision.humanAuthorizationRequired === true, authorityPromotionEligible: false },
    { name: 'decision-packet-self-hashing', pass: decision.decisionHash === sha256(Object.fromEntries(Object.entries(decision).filter(([key]) => key !== 'decisionHash'))), decisionHash: decision.decisionHash },
    { name: 'r0-stage2f-boundary', pass: manifest.authority?.tier === 'R0' && manifest.authority?.executionInterface === false, tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  ];
  return Object.freeze({
    pass: checks.every((check) => check.pass),
    adapter: manifest,
    certification: {
      evidenceKind: 'zeknova-stage2f-sustained-shadow-controlled-evaluation-framework',
      frameworkVersion: 1,
      replayRecordCount: records.length,
      authenticLiveRecordCount: 0,
      controlledShadowEvaluationEligible: false,
      authorityPromotionEligible: false,
      authority: 'R0',
    },
    checks,
    productionCampaign,
    candidate,
    decision,
  });
}
