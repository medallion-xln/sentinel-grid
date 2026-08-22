import { sha256 } from '../core/determinism.js';

export const STAGE2F_CAMPAIGN_MANIFEST_VERSION = 1;
export const STAGE2F_QUALIFICATION_IDENTITY_VERSION = 1;
export const STAGE2F_RECORD_SCHEMA_VERSION = 2;
export const STAGE2F_COLLECTOR_SCHEMA_VERSION = 2;
export const STAGE2F_SESSION_MANIFEST_VERSION = 2;

const ID_RE = /^sha256:[a-f0-9]{64}$/;
const SHA_RE = /^[a-f0-9]{64}$/;

function assert(condition, message, code = 'STAGE2F_IDENTITY_CONTRACT_ERROR') {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function nonempty(value, name) {
  assert(typeof value === 'string' && value.length > 0, `${name} must be a non-empty string`);
  return value;
}

function runtimeId(value, name) {
  assert(typeof value === 'string' && ID_RE.test(value), `${name} must be a sha256: identity`);
  return value;
}

function samplingId(value) {
  assert(typeof value === 'string' && SHA_RE.test(value), 'samplingIdentity must be a lowercase SHA-256 hex string', 'SAMPLING_IDENTITY_INVALID');
  return value;
}

function without(object, key) {
  return Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
}

export function buildStage2FCampaignManifest({
  runtimeIdentity,
  generatedRuntimeProvenance,
  campaignStartTime,
  qualificationThresholdPolicy,
  certificationPolicyVersion = 'stage2f-certification-policy-v2',
  campaignMode = 'QUALIFICATION',
  campaignState = 'PREPARED',
}) {
  assert(runtimeIdentity && typeof runtimeIdentity === 'object', 'runtimeIdentity is required');
  assert(generatedRuntimeProvenance && typeof generatedRuntimeProvenance === 'object', 'generatedRuntimeProvenance is required');
  const sentinelRuntimeId = runtimeId(runtimeIdentity.sentinelRuntimeId, 'sentinelRuntimeId');
  const generatedRuntimeProvenanceId = runtimeId(generatedRuntimeProvenance.generatedRuntimeProvenanceId, 'generatedRuntimeProvenanceId');
  assert(runtimeIdentity.generatedRuntimeProvenanceId === generatedRuntimeProvenanceId, 'Runtime and generated provenance identities do not match');
  nonempty(campaignStartTime, 'campaignStartTime');
  assert(!Number.isNaN(Date.parse(campaignStartTime)), 'campaignStartTime must be an ISO-compatible timestamp');
  assert(qualificationThresholdPolicy && typeof qualificationThresholdPolicy === 'object', 'qualificationThresholdPolicy is required');
  assert(['QUALIFICATION', 'DRY_RUN'].includes(campaignMode), 'campaignMode must be QUALIFICATION or DRY_RUN');
  assert(['PREPARED', 'ACTIVE', 'CLOSED', 'STALE'].includes(campaignState), 'Unknown campaignState');
  if (campaignMode === 'QUALIFICATION') assert(campaignState === 'PREPARED' || campaignState === 'ACTIVE' || campaignState === 'CLOSED' || campaignState === 'STALE', 'Qualification campaign state is invalid');

  const identityPayload = {
    campaignIdentityVersion: 1,
    sentinelRuntimeId,
    generatedRuntimeProvenanceId,
    campaignStartTime,
    recordSchemaVersion: STAGE2F_RECORD_SCHEMA_VERSION,
    collectorSchemaVersion: STAGE2F_COLLECTOR_SCHEMA_VERSION,
    sessionManifestVersion: STAGE2F_SESSION_MANIFEST_VERSION,
    certificationPolicyVersion,
    qualificationThresholdPolicyHash: sha256(qualificationThresholdPolicy),
    authorityTier: 'R0',
    canonicalStateSchemaVersion: runtimeIdentity.canonicalStateSchemaVersion,
    primeVersion: runtimeIdentity.primeVersion,
    routerVersion: runtimeIdentity.routerVersion,
    authorityPolicyVersion: runtimeIdentity.authorityPolicyVersion,
  };
  const stage2fCampaignId = `sha256:${sha256(identityPayload)}`;
  const payload = {
    campaignManifestVersion: STAGE2F_CAMPAIGN_MANIFEST_VERSION,
    stage2fCampaignId,
    ...identityPayload,
    campaignMode,
    campaignState,
    qualificationEligible: campaignMode === 'QUALIFICATION' && campaignState === 'ACTIVE',
    qualificationThresholdPolicy,
    authority: {
      tier: 'R0',
      canDispatch: false,
      canMutateLiveWorld: false,
      canIssueAuthorityTokens: false,
    },
  };
  return Object.freeze({ ...payload, campaignManifestHash: sha256(payload) });
}

export function validateStage2FCampaignManifest(manifest, { runtimeIdentity = null, generatedRuntimeProvenance = null } = {}) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'Stage2F campaign manifest is required', 'UNKNOWN_CAMPAIGN');
  assert(manifest.campaignManifestVersion === STAGE2F_CAMPAIGN_MANIFEST_VERSION, 'Unknown Stage2F campaign manifest version', 'UNKNOWN_SCHEMA');
  const rebuilt = buildStage2FCampaignManifest({
    runtimeIdentity: runtimeIdentity ?? {
      sentinelRuntimeId: manifest.sentinelRuntimeId,
      generatedRuntimeProvenanceId: manifest.generatedRuntimeProvenanceId,
      canonicalStateSchemaVersion: manifest.canonicalStateSchemaVersion,
      primeVersion: manifest.primeVersion,
      routerVersion: manifest.routerVersion,
      authorityPolicyVersion: manifest.authorityPolicyVersion,
    },
    generatedRuntimeProvenance: generatedRuntimeProvenance ?? { generatedRuntimeProvenanceId: manifest.generatedRuntimeProvenanceId },
    campaignStartTime: manifest.campaignStartTime,
    qualificationThresholdPolicy: manifest.qualificationThresholdPolicy,
    certificationPolicyVersion: manifest.certificationPolicyVersion,
    campaignMode: manifest.campaignMode,
    campaignState: manifest.campaignState,
  });
  assert(rebuilt.stage2fCampaignId === manifest.stage2fCampaignId, 'Stage2F campaign identity mismatch', 'CAMPAIGN_ID_MISMATCH');
  assert(rebuilt.campaignManifestHash === manifest.campaignManifestHash, 'Stage2F campaign manifest hash mismatch', 'TAMPERED');
  assert(manifest.authority?.tier === 'R0'
    && manifest.authority?.canDispatch === false
    && manifest.authority?.canMutateLiveWorld === false
    && manifest.authority?.canIssueAuthorityTokens === false, 'Stage2F campaign authority must remain exact R0', 'AUTHORITY_MISMATCH');
  return structuredClone(manifest);
}

export function buildStage2FQualificationIdentity({ campaignManifest, sessionId, samplingIdentity, evidenceMode = null }) {
  const campaign = validateStage2FCampaignManifest(campaignManifest);
  nonempty(sessionId, 'sessionId');
  samplingId(samplingIdentity);
  const mode = evidenceMode ?? campaign.campaignMode;
  assert(mode === campaign.campaignMode, 'Evidence mode does not match campaign mode', 'CAMPAIGN_ID_MISMATCH');
  return Object.freeze({
    identityEnvelopeVersion: STAGE2F_QUALIFICATION_IDENTITY_VERSION,
    sentinelRuntimeId: campaign.sentinelRuntimeId,
    generatedRuntimeProvenanceId: campaign.generatedRuntimeProvenanceId,
    stage2fCampaignId: campaign.stage2fCampaignId,
    sessionId,
    samplingIdentity,
    recordSchemaVersion: campaign.recordSchemaVersion,
    collectorSchemaVersion: campaign.collectorSchemaVersion,
    authorityTier: 'R0',
    evidenceMode: mode,
    qualificationEligible: campaign.qualificationEligible === true && mode === 'QUALIFICATION',
    canonicalStateSchemaVersion: campaign.canonicalStateSchemaVersion,
    primeVersion: campaign.primeVersion,
    routerVersion: campaign.routerVersion,
    authorityPolicyVersion: campaign.authorityPolicyVersion,
    certificationPolicyVersion: campaign.certificationPolicyVersion,
  });
}

export function validateStage2FQualificationIdentity(identity, { campaignManifest, sessionId, samplingIdentity } = {}) {
  assert(identity && typeof identity === 'object' && !Array.isArray(identity), 'qualificationIdentity is required', 'MISSING_RUNTIME_BINDING');
  assert(identity.identityEnvelopeVersion === STAGE2F_QUALIFICATION_IDENTITY_VERSION, 'Unknown qualification identity schema', 'UNKNOWN_SCHEMA');
  const campaign = validateStage2FCampaignManifest(campaignManifest);
  assert(identity.sentinelRuntimeId !== undefined, 'sentinelRuntimeId is required', 'MISSING_RUNTIME_BINDING');
  assert(identity.generatedRuntimeProvenanceId !== undefined, 'generatedRuntimeProvenanceId is required', 'MISSING_PROVENANCE_ID');
  assert(identity.stage2fCampaignId !== undefined, 'stage2fCampaignId is required', 'MISSING_CAMPAIGN_ID');
  runtimeId(identity.sentinelRuntimeId, 'sentinelRuntimeId');
  runtimeId(identity.generatedRuntimeProvenanceId, 'generatedRuntimeProvenanceId');
  runtimeId(identity.stage2fCampaignId, 'stage2fCampaignId');
  samplingId(identity.samplingIdentity);
  assert(identity.sentinelRuntimeId === campaign.sentinelRuntimeId, 'Sentinel runtime identity mismatch', 'RUNTIME_ID_MISMATCH');
  assert(identity.generatedRuntimeProvenanceId === campaign.generatedRuntimeProvenanceId, 'Generated runtime provenance mismatch', 'PROVENANCE_ID_MISMATCH');
  assert(identity.stage2fCampaignId === campaign.stage2fCampaignId, 'Stage2F campaign identity mismatch', 'CAMPAIGN_ID_MISMATCH');
  assert(identity.sessionId === sessionId, 'Qualification identity session mismatch', 'BROKEN_SESSION_CHAIN');
  assert(identity.samplingIdentity === samplingIdentity, 'Qualification sampling identity mismatch', 'TAMPERED');
  assert(identity.recordSchemaVersion === STAGE2F_RECORD_SCHEMA_VERSION && identity.collectorSchemaVersion === STAGE2F_COLLECTOR_SCHEMA_VERSION, 'Unknown Stage2F record or collector schema', 'UNKNOWN_SCHEMA');
  assert(identity.authorityTier === 'R0', 'Qualification identity authority must be R0', 'AUTHORITY_MISMATCH');
  assert(identity.evidenceMode === campaign.campaignMode, 'Qualification evidence mode mismatch', 'CAMPAIGN_ID_MISMATCH');
  assert(identity.qualificationEligible === (campaign.qualificationEligible === true && campaign.campaignMode === 'QUALIFICATION'), 'Qualification eligibility does not match campaign state', 'STALE_CAMPAIGN');
  return structuredClone(identity);
}

export function campaignIdentityPayload(manifest) {
  const validated = validateStage2FCampaignManifest(manifest);
  return without(without(validated, 'campaignManifestHash'), 'qualificationThresholdPolicy');
}
