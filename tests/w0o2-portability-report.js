#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LAB = path.resolve(__dirname, '..');
const ROOT = path.resolve(LAB, '..');
const PF = require('./_preflight');
const FILES = {
  identityContract: path.join(ROOT, 'public_html/azl/zeknova-identity-contract-v1.js'),
  eventContract: path.join(ROOT, 'public_html/azl/zeknova-perception-event-contract-v1.js'),
  knowledgeContract: path.join(ROOT, 'public_html/azl/zeknova-knowledge-ledger-contract-v1.js'),
  identityRegistry: path.join(ROOT, 'docs/governance/identity-registry.json'),
  eventRegistry: path.join(ROOT, 'docs/governance/perception-event-registry.json'),
  knowledgeRegistry: path.join(ROOT, 'docs/governance/knowledge-ledger-registry.json'),
  w0o1Manifest: path.join(ROOT, 'docs/governance/w0o1-perception-event-manifest.json'),
  w0aManifest: path.join(ROOT, 'docs/governance/w0a-action-legality-manifest.json'),
  test: path.join(LAB, 'tests/w0o2-knowledge-ledger-contract.portability-v1.js'),
};
for (const [name, file] of Object.entries(FILES)) PF.requireFile(file, 'w0o2-portability-report.js', { ships_in: name });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
(0, eval)(fs.readFileSync(FILES.identityContract, 'utf8'));
(0, eval)(fs.readFileSync(FILES.eventContract, 'utf8'));
(0, eval)(fs.readFileSync(FILES.knowledgeContract, 'utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;
const registry = JSON.parse(fs.readFileSync(FILES.knowledgeRegistry, 'utf8'));
const w0o1 = JSON.parse(fs.readFileSync(FILES.w0o1Manifest, 'utf8'));
const w0a = JSON.parse(fs.readFileSync(FILES.w0aManifest, 'utf8'));

function fixture() {
  const worldId = I.worldId({ teamCode: 'FOREST ALPHA', biomeSeed: 5207 });
  const human = I.humanFactionId({ teamCode: 'FOREST ALPHA' });
  const s0 = I.settlementFactionId({ worldId, settlementOrdinal: 0 });
  const s1 = I.settlementFactionId({ worldId, settlementOrdinal: 1 });
  const r = new I.IdentityRegistry({ worldId });
  r.registerFaction({ factionId: human, kind: 'human_team', sourceKey: 'human' });
  r.registerFaction({ factionId: s0, kind: 'zeknovan_settlement', sourceKey: 's0' });
  r.registerFaction({ factionId: s1, kind: 'zeknovan_settlement', sourceKey: 's1' });
  const scout = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const enemy = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  const route = I.routeEntityId({ worldId, routeKey: 'central-river-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route' });
  return { worldId, human, s0, s1, r, scout, enemy, route };
}
const f = fixture();
const stream = new P.PerceptionEventStream({ identitySnapshot: f.r.snapshot() });
const sighting = stream.append({ eventType: 'enemy_sighted', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout, subjectId: f.enemy, observedAtQuantum: 7, sourceType: 'line_of_sight', payload: { classification: 'stalker', hostility: 'hostile', movementBand: 'fast', positionCell: { x: 12, y: 0, z: -4 } } });
stream.append({ eventType: 'enemy_lost', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout, subjectId: f.enemy, observedAtQuantum: 8, sourceType: 'line_of_sight', payload: { lastKnownPositionCell: { x: 12, y: 0, z: -4 }, reason: 'occluded' } });
stream.append({ eventType: 'route_observed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout, subjectId: f.route, observedAtQuantum: 9, sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'blocked' } });
stream.share({ originalEventId: sighting.eventId, senderFactionId: f.s0, recipientFactionId: f.s1, sourceEntityId: f.scout, observedAtQuantum: 12, shareMode: 'direct' });
const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() });
ledger.synchronize(stream.snapshot());
ledger.advanceToQuantum(17);
const senderUnit = ledger.getRecord(f.s0, f.enemy, 'unit_contact');
const recipientUnit = ledger.getRecord(f.s1, f.enemy, 'unit_contact');
const routeRecord = ledger.getRecord(f.s0, f.route, 'route_status');

const report = I.canonicalize({
  report_schema_version: 1,
  artifact_id: 'sentinel-w0o2-faction-knowledge-v1',
  phase: 'W0-O.2',
  contract: {
    id: K.CONTRACT_ID,
    registry_id: K.REGISTRY_ID,
    schema_version: K.SCHEMA_VERSION,
    sha256: sha(fs.readFileSync(FILES.knowledgeContract)),
    topics: K.TOPICS,
    event_policies: K.EVENT_POLICIES,
  },
  registry: {
    id: registry.registry_id,
    status: registry.status,
    sha256: sha(fs.readFileSync(FILES.knowledgeRegistry)),
  },
  artifacts: {
    identity_contract_sha256: sha(fs.readFileSync(FILES.identityContract)),
    perception_event_contract_sha256: sha(fs.readFileSync(FILES.eventContract)),
    identity_registry_sha256: sha(fs.readFileSync(FILES.identityRegistry)),
    perception_event_registry_sha256: sha(fs.readFileSync(FILES.eventRegistry)),
    knowledge_contract_sha256: sha(fs.readFileSync(FILES.knowledgeContract)),
    knowledge_registry_sha256: sha(fs.readFileSync(FILES.knowledgeRegistry)),
    test_sha256: sha(fs.readFileSync(FILES.test)),
  },
  inherited: {
    w0o1_manifest_sha256: sha(fs.readFileSync(FILES.w0o1Manifest)),
    w0o1_status: w0o1.status,
    w0o1_sentinel_portability_digest: w0o1.verification.sentinel_linux_portability_digest,
    w0o1_zeknova_portability_digest: w0o1.verification.zeknova_linux_portability_digest,
    w0a_portability_digest: w0a.verification.w0a_portability_digest,
  },
  fixed_fixture: {
    world_id: f.worldId,
    sender_faction_id: f.s0,
    recipient_faction_id: f.s1,
    subject_id: f.enemy,
    sender_unit_record_id: senderUnit.recordId,
    recipient_unit_record_id: recipientUnit.recordId,
    route_record_id: routeRecord.recordId,
  },
  ledger: {
    canonical: I.canonicalStringify(ledger.snapshot()),
    runtime_hash_fnv1a64x2: ledger.snapshotHash(),
    current_quantum: ledger.currentQuantum,
    record_count: ledger.snapshot().records.length,
    applied_event_count: ledger.snapshot().appliedEventIds.length,
    sender_record_count: ledger.recordsForFaction(f.s0).length,
    recipient_record_count: ledger.recordsForFaction(f.s1).length,
    sender_unit_state: senderUnit.knowledgeState,
    sender_unit_current_event: senderUnit.currentEvidence.eventType,
    recipient_unit_state: recipientUnit.knowledgeState,
    recipient_original_observation_quantum: recipientUnit.currentEvidence.effectiveObservedAtQuantum,
    route_state_at_exclusive_expiry: routeRecord.knowledgeState,
  },
  semantics: {
    validated_event_input_only: true,
    faction_private_ledger: true,
    shared_intelligence_preserves_original_age: true,
    direct_over_shared_same_time: true,
    exact_exclusive_expiry: true,
    contradictions_preserved: true,
    monotonic_integer_quantum: true,
    clone_isolated_canonical_snapshot: true,
    observation_generation_out_of_scope: true,
  },
});
const canonical = JSON.stringify(report);
const digest = sha(canonical);
if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
