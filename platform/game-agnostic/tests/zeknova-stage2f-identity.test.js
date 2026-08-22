import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2FCampaignManifest,
  buildStage2FQualificationIdentity,
  validateStage2FCampaignManifest,
  validateStage2FQualificationIdentity,
} from '../src/lab/zeknova-stage2f-identity.js';
import {
  DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS,
  buildZekNovaSessionManifest,
  certifyZekNovaSustainedShadowCampaign,
  reconcileStage2FEvidence,
  validateZekNovaSessionManifest,
} from '../src/lab/zeknova-controlled-evaluation.js';

const runtimeIdentity = Object.freeze({
  sentinelRuntimeId: `sha256:${'1'.repeat(64)}`,
  generatedRuntimeProvenanceId: `sha256:${'2'.repeat(64)}`,
  canonicalStateSchemaVersion: 'state-v2',
  primeVersion: 'prime-v1',
  routerVersion: 'router-v1',
  authorityPolicyVersion: 'r0-policy-v1',
});
const generatedRuntimeProvenance = Object.freeze({ generatedRuntimeProvenanceId: runtimeIdentity.generatedRuntimeProvenanceId });
const dryCampaign = buildStage2FCampaignManifest({
  runtimeIdentity,
  generatedRuntimeProvenance,
  campaignStartTime: '2026-08-14T00:00:00.000Z',
  qualificationThresholdPolicy: DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS,
  campaignMode: 'DRY_RUN',
  campaignState: 'ACTIVE',
});

function rehash(record) {
  const { recordHash: _discarded, ...payload } = record;
  return { ...payload, recordHash: sha256(payload) };
}

function recordFor({ sequence = 0, samplingIdentity = '3'.repeat(64), campaign = dryCampaign, identityPatch = {}, recordPatch = {} } = {}) {
  const sessionId = 'stage2f-dry-session';
  const qualificationIdentity = {
    ...buildStage2FQualificationIdentity({ campaignManifest: campaign, sessionId, samplingIdentity }),
    ...identityPatch,
  };
  const payload = {
    shadowRecordVersion: 2,
    captureId: `${sessionId}:${String(sequence).padStart(6, '0')}:dry-run`,
    fixtureHash: sha256({ sequence, samplingIdentity }),
    captureHash: sha256({ sequence, samplingIdentity, capture: true }),
    capturedAt: '2026-08-14T00:01:00.000Z',
    captureProvenance: {
      kind: 'live-runtime',
      productionEligible: qualificationIdentity.qualificationEligible,
      repositoryHead: '4'.repeat(40),
      runtimeBuildHash: '5'.repeat(64),
      collectorId: 'collector-test-v2',
      sentinelRuntimeId: qualificationIdentity.sentinelRuntimeId,
      generatedRuntimeProvenanceId: qualificationIdentity.generatedRuntimeProvenanceId,
      stage2fCampaignId: qualificationIdentity.stage2fCampaignId,
      evidenceMode: qualificationIdentity.evidenceMode,
      qualificationEligible: qualificationIdentity.qualificationEligible,
    },
    qualificationIdentity,
    context: { sessionId, sequence, factionId: 'faction-a', biomeId: 'forest', missionId: 'grid', missionPhase: 'opening', tensionBand: 'low', infrastructureBand: 'fragile', tick: sequence },
    sourceStateHash: sha256({ sequence, state: true }),
    observerId: 'faction-a',
    simulations: 320,
    selectedActionKey: 'stabilize',
    legacySelectedActionKey: 'stabilize',
    legalMaskHash: sha256([true, false]),
    legalActionKeys: ['stabilize'],
    agreement: { selectedAction: true, ranking: true, observation: true, legalMask: true, targetSlots: true, transitions: true, recommendationLegal: true, sourceUnmutated: true, authority: true },
    pass: true,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
    ...recordPatch,
  };
  return rehash(payload);
}

function manifestFor(records, campaign = dryCampaign) {
  return buildZekNovaSessionManifest({
    sessionId: 'stage2f-dry-session',
    environmentId: 'identity-contract-test',
    repositoryHead: '4'.repeat(40),
    runtimeBuildHash: '5'.repeat(64),
    collectorId: 'collector-test-v2',
    startedAt: '2026-08-14T00:00:00.000Z',
    endedAt: '2026-08-14T00:10:00.000Z',
    records,
    campaignManifest: campaign,
  });
}

test('campaign identity is deterministic and hash-bound', () => {
  const duplicate = buildStage2FCampaignManifest({
    runtimeIdentity,
    generatedRuntimeProvenance,
    campaignStartTime: '2026-08-14T00:00:00.000Z',
    qualificationThresholdPolicy: DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS,
    campaignMode: 'DRY_RUN',
    campaignState: 'ACTIVE',
  });
  assert.deepEqual(duplicate, dryCampaign);
  assert.equal(validateStage2FCampaignManifest(dryCampaign, { runtimeIdentity, generatedRuntimeProvenance }).stage2fCampaignId, dryCampaign.stage2fCampaignId);
  const tampered = structuredClone(dryCampaign);
  tampered.qualificationThresholdPolicy.minRecordCount += 1;
  assert.throws(() => validateStage2FCampaignManifest(tampered), /identity mismatch|hash mismatch/);
});

test('valid bound dry-run record and manifest reconcile but cannot qualify', () => {
  const record = recordFor();
  const sessionManifest = manifestFor([record]);
  assert.equal(validateZekNovaSessionManifest(sessionManifest, [record], { campaignManifest: dryCampaign }).manifestHash, sessionManifest.manifestHash);
  const reconciliation = reconcileStage2FEvidence({ records: [record], sessionManifests: [sessionManifest], campaignManifest: dryCampaign });
  assert.equal(reconciliation.accepted, 1);
  assert.equal(reconciliation.quarantined, 0);
  assert.equal(reconciliation.rejected, 0);
  const certification = certifyZekNovaSustainedShadowCampaign({ manifest: { authority: { tier: 'R0', executionInterface: false } }, records: [record], sessionManifests: [sessionManifest], campaignManifest: dryCampaign });
  assert.equal(certification.certification.authenticRecordCount, 0);
  assert.equal(certification.pass, false);
});

test('certifier counts only exact current-runtime current-campaign R0 qualification evidence', () => {
  const qualificationCampaign = buildStage2FCampaignManifest({
    runtimeIdentity,
    generatedRuntimeProvenance,
    campaignStartTime: '2026-08-16T00:00:00.000Z',
    qualificationThresholdPolicy: DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS,
    campaignMode: 'QUALIFICATION',
    campaignState: 'ACTIVE',
  });
  const current = recordFor({ campaign: qualificationCampaign });
  const currentManifest = manifestFor([current], qualificationCampaign);
  const certification = certifyZekNovaSustainedShadowCampaign({
    manifest: { authority: { tier: 'R0', executionInterface: false } },
    records: [current],
    sessionManifests: [currentManifest],
    campaignManifest: qualificationCampaign,
  });
  assert.equal(certification.certification.authenticRecordCount, 1);
  assert.equal(certification.certification.sentinelRuntimeId, runtimeIdentity.sentinelRuntimeId);
  assert.equal(certification.certification.stage2fCampaignId, qualificationCampaign.stage2fCampaignId);
  assert.equal(certification.pass, false, 'one authentic record must not satisfy qualification thresholds');

  const wrongRuntime = recordFor({ campaign: qualificationCampaign, identityPatch: { sentinelRuntimeId: `sha256:${'9'.repeat(64)}` } });
  const mixed = certifyZekNovaSustainedShadowCampaign({
    manifest: { authority: { tier: 'R0', executionInterface: false } },
    records: [wrongRuntime],
    sessionManifests: [currentManifest],
    campaignManifest: qualificationCampaign,
  });
  assert.equal(mixed.certification.authenticRecordCount, 0);
  assert.equal(mixed.reconciliation.reasons.RUNTIME_ID_MISMATCH, 1);
});

test('qualification identity rejects missing, wrong, stale, malformed, and R1 fields', () => {
  const current = buildStage2FQualificationIdentity({ campaignManifest: dryCampaign, sessionId: 'stage2f-dry-session', samplingIdentity: '3'.repeat(64) });
  const invalid = [
    Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'sentinelRuntimeId')),
    { ...current, sentinelRuntimeId: `sha256:${'9'.repeat(64)}` },
    { ...current, sentinelRuntimeId: 'malformed' },
    Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'generatedRuntimeProvenanceId')),
    { ...current, generatedRuntimeProvenanceId: `sha256:${'9'.repeat(64)}` },
    Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'stage2fCampaignId')),
    { ...current, stage2fCampaignId: `sha256:${'9'.repeat(64)}` },
    { ...current, authorityTier: 'R1' },
    { ...current, identityEnvelopeVersion: 999 },
    { ...current, samplingIdentity: '8'.repeat(64) },
    { ...current, qualificationEligible: true },
  ];
  for (const identity of invalid) assert.throws(() => validateStage2FQualificationIdentity(identity, { campaignManifest: dryCampaign, sessionId: 'stage2f-dry-session', samplingIdentity: '3'.repeat(64) }));
});

test('reconciler classifies historical, tampered, mismatched, duplicate, and broken-chain records deterministically', () => {
  const valid = recordFor();
  const manifest = manifestFor([valid]);
  const historical = rehash({ ...valid, shadowRecordVersion: 1, qualificationIdentity: undefined, captureProvenance: { kind: 'live-runtime', productionEligible: true } });
  delete historical.qualificationIdentity;
  const tampered = { ...valid, selectedActionKey: 'tampered' };
  const wrongRuntime = recordFor({ samplingIdentity: '6'.repeat(64), identityPatch: { sentinelRuntimeId: `sha256:${'9'.repeat(64)}` } });
  const duplicate = structuredClone(valid);
  const evidence = [historical, tampered, wrongRuntime, valid, duplicate];
  const result = reconcileStage2FEvidence({ records: evidence, sessionManifests: [manifest], campaignManifest: dryCampaign });
  assert.equal(result.accepted, 1);
  assert.equal(result.reasons.MISSING_RUNTIME_BINDING, 1);
  assert.equal(result.reasons.TAMPERED, 1);
  assert.equal(result.reasons.RUNTIME_ID_MISMATCH, 1);
  assert.equal(result.reasons.DUPLICATE, 1);
  assert.deepEqual(result, reconcileStage2FEvidence({ records: evidence, sessionManifests: [manifest], campaignManifest: dryCampaign }));
});

test('mixed identity sessions, duplicate sampling IDs, sequence gaps, and tampered manifests fail closed', () => {
  const first = recordFor({ sequence: 0, samplingIdentity: '3'.repeat(64) });
  const second = recordFor({ sequence: 1, samplingIdentity: '6'.repeat(64) });
  const goodManifest = manifestFor([first, second]);
  const mixedRuntime = recordFor({ sequence: 1, samplingIdentity: '6'.repeat(64), identityPatch: { sentinelRuntimeId: `sha256:${'9'.repeat(64)}` } });
  assert.throws(() => manifestFor([first, mixedRuntime]), /runtime identity mismatch/i);
  const otherCampaign = buildStage2FCampaignManifest({ ...{
    runtimeIdentity,
    generatedRuntimeProvenance,
    campaignStartTime: '2026-08-15T00:00:00.000Z',
    qualificationThresholdPolicy: DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS,
    campaignMode: 'DRY_RUN',
    campaignState: 'ACTIVE',
  } });
  const mixedCampaign = recordFor({ sequence: 1, samplingIdentity: '6'.repeat(64), campaign: otherCampaign });
  assert.throws(() => manifestFor([first, mixedCampaign]), /campaign identity mismatch/i);
  assert.throws(() => manifestFor([first, recordFor({ sequence: 1, samplingIdentity: '3'.repeat(64) })]), /duplicate sampling identity/i);
  assert.throws(() => manifestFor([first, recordFor({ sequence: 2, samplingIdentity: '6'.repeat(64) })]), /not contiguous/i);
  const tamperedManifest = structuredClone(goodManifest);
  tamperedManifest.recordCount += 1;
  assert.throws(() => validateZekNovaSessionManifest(tamperedManifest, [first, second], { campaignManifest: dryCampaign }), /hash mismatch/);
});
