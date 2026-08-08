import test from 'node:test';
import assert from 'node:assert/strict';
import { loadZekNovaShadowFrameworkCertification } from '../scripts/zeknova-shadow-context.mjs';
import {
  buildZekNovaSessionManifest,
  validateZekNovaSessionManifest,
  certifyZekNovaSustainedShadowCampaign,
  evaluateControlledCandidateRecommendation,
  validateCandidateEvaluationRecord,
  certifyControlledCandidateEvaluation,
  buildControlledNextStageDecisionPacket,
  buildStage2FFrameworkCertification,
} from '../src/lab/zeknova-controlled-evaluation.js';

const shadow = await loadZekNovaShadowFrameworkCertification();
const records = shadow.evaluations.map((evaluation) => evaluation.record);

function manifestFor(sessionId) {
  const sessionRecords = records.filter((record) => record.context.sessionId === sessionId);
  return buildZekNovaSessionManifest({
    sessionId,
    environmentId: 'test-environment',
    repositoryHead: '1'.repeat(40),
    runtimeBuildHash: '2'.repeat(64),
    collectorId: 'test-collector',
    startedAt: '2026-07-28T00:00:00.000Z',
    endedAt: '2026-07-28T00:30:00.000Z',
    records: sessionRecords,
  });
}

test('Stage 2F session manifests are self-hashing and record-bound', () => {
  const sessionId = records[0].context.sessionId;
  const sessionRecords = records.filter((record) => record.context.sessionId === sessionId);
  const manifest = manifestFor(sessionId);
  assert.equal(validateZekNovaSessionManifest(manifest, sessionRecords).manifestHash, manifest.manifestHash);
  const tampered = structuredClone(manifest);
  tampered.collectorId = 'tampered';
  assert.throws(() => validateZekNovaSessionManifest(tampered, sessionRecords), /hash mismatch/);
});

test('replay evidence is quarantined from production campaign certification', () => {
  const manifests = [...new Set(records.map((record) => record.context.sessionId))].map(manifestFor);
  const certification = certifyZekNovaSustainedShadowCampaign({ manifest: shadow.registration.manifest, records, sessionManifests: manifests });
  assert.equal(certification.pass, false);
  assert.equal(certification.status, 'pending-authentic-live-captures');
  assert.equal(certification.certification.authenticRecordCount, 0);
  assert.equal(certification.quarantined.length, records.length);
});

test('candidate evaluation verifies legality mutation and R0', () => {
  const record = records[0];
  const candidate = evaluateControlledCandidateRecommendation({
    shadowRecord: record,
    candidateRecommendation: {
      candidateId: 'candidate-a', engineId: 'candidate-engine-a',
      selectedActionKey: record.selectedActionKey,
      ranking: [{ actionKey: record.selectedActionKey }],
      sourceStateHash: record.sourceStateHash,
      sourceStateHashAfter: record.sourceStateHash,
      latencyMs: 12, baselineLatencyMs: 10, simulations: 320,
      authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
    },
  });
  assert.equal(candidate.pass, true);
  assert.equal(validateCandidateEvaluationRecord(candidate).candidateRecordHash, candidate.candidateRecordHash);
});

test('candidate evaluation rejects illegal selected actions', () => {
  const record = records[0];
  const candidate = evaluateControlledCandidateRecommendation({
    shadowRecord: record,
    candidateRecommendation: {
      candidateId: 'candidate-b', engineId: 'candidate-engine-b',
      selectedActionKey: 'illegal-action', ranking: [{ actionKey: 'illegal-action' }],
      sourceStateHash: record.sourceStateHash, sourceStateHashAfter: record.sourceStateHash,
      latencyMs: 10, baselineLatencyMs: 10, simulations: 320,
      authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
    },
  });
  assert.equal(candidate.pass, false);
  assert.equal(candidate.safety.selectedActionLegal, false);
});

test('candidate certification cannot advance without a certified live campaign', () => {
  const candidateRecords = records.map((record) => evaluateControlledCandidateRecommendation({
    shadowRecord: record,
    candidateRecommendation: {
      candidateId: 'candidate-c', engineId: 'candidate-engine-c', selectedActionKey: record.selectedActionKey,
      ranking: [{ actionKey: record.selectedActionKey }], sourceStateHash: record.sourceStateHash,
      sourceStateHashAfter: record.sourceStateHash, latencyMs: 10, baselineLatencyMs: 10,
      simulations: record.simulations, authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
    },
  }));
  const campaign = certifyZekNovaSustainedShadowCampaign({ manifest: shadow.registration.manifest, records, sessionManifests: [] });
  const certification = certifyControlledCandidateEvaluation({ manifest: shadow.registration.manifest, campaignCertification: campaign, candidateRecords });
  assert.equal(certification.pass, false);
  assert.equal(certification.status, 'live-campaign-not-certified');
  assert.equal(certification.authorityPromotionEligible, false);
});

test('controlled decision packets never grant authority', () => {
  const packet = buildControlledNextStageDecisionPacket({ campaignCertification: { pass: false }, candidateCertification: { pass: false } });
  assert.equal(packet.status, 'blocked-live-campaign-not-certified');
  assert.equal(packet.authorityPromotionEligible, false);
  assert.equal(packet.authority.canDispatch, false);
});

test('Stage 2F framework report passes while all production gates stay closed', () => {
  const report = buildStage2FFrameworkCertification({ manifest: shadow.registration.manifest, replayRecords: records });
  assert.equal(report.pass, true);
  assert.equal(report.certification.authenticLiveRecordCount, 0);
  assert.equal(report.certification.controlledShadowEvaluationEligible, false);
  assert.equal(report.certification.authorityPromotionEligible, false);
  assert.equal(report.decision.status, 'blocked-live-campaign-not-certified');
});
