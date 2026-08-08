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
  observationContract: path.join(ROOT, 'public_html/azl/zeknova-faction-observation-contract-v1.js'),
  identityRegistry: path.join(ROOT, 'docs/governance/identity-registry.json'),
  eventRegistry: path.join(ROOT, 'docs/governance/perception-event-registry.json'),
  knowledgeRegistry: path.join(ROOT, 'docs/governance/knowledge-ledger-registry.json'),
  observationRegistry: path.join(ROOT, 'docs/governance/faction-observation-registry.json'),
  w0o2Manifest: path.join(ROOT, 'docs/governance/w0o2-knowledge-ledger-manifest.json'),
  w0aManifest: path.join(ROOT, 'docs/governance/w0a-action-legality-manifest.json')
};
for (const [name, file] of Object.entries(FILES)) PF.requireFile(file, 'w0o3-portability-report.js', { ships_in: name });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
for (const key of ['identityContract', 'eventContract', 'knowledgeContract', 'observationContract']) (0, eval)(fs.readFileSync(FILES[key], 'utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;
const O = globalThis.ZekNovaFactionObservationContract;
const registry = JSON.parse(fs.readFileSync(FILES.observationRegistry, 'utf8'));
const w0o2 = JSON.parse(fs.readFileSync(FILES.w0o2Manifest, 'utf8'));
const w0a = JSON.parse(fs.readFileSync(FILES.w0aManifest, 'utf8'));

function fixture(extraPrivate) {
  const worldId = I.worldId({ teamCode: 'FOREST ALPHA', biomeSeed: 5207 });
  const s0 = I.settlementFactionId({ worldId, settlementOrdinal: 0 });
  const s1 = I.settlementFactionId({ worldId, settlementOrdinal: 1 });
  const r = new I.IdentityRegistry({ worldId });
  r.registerFaction({ factionId: s0, kind: 'zeknovan_settlement', sourceKey: 's0' });
  r.registerFaction({ factionId: s1, kind: 'zeknovan_settlement', sourceKey: 's1' });
  const scout0 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const scout1 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s1 }).entityId;
  const enemy = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  const hidden = r.allocateSpawn({ role: 'spitter', ownerFactionId: s1 }).entityId;
  const route = I.routeEntityId({ worldId, routeKey: 'central-river-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route' });
  const stream = new P.PerceptionEventStream({ identitySnapshot: r.snapshot() });
  stream.append({ eventType: 'enemy_sighted', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: enemy, observedAtQuantum: 7, sourceType: 'line_of_sight', payload: { classification: 'stalker', hostility: 'hostile', movementBand: 'fast', positionCell: { x: 12, y: 0, z: -4 } } });
  stream.append({ eventType: 'route_observed', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: route, observedAtQuantum: 8, sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'blocked' } });
  if (extraPrivate) stream.append({ eventType: 'enemy_sighted', observerFactionId: s1, sourceFactionId: s1, sourceEntityId: scout1, subjectId: hidden, observedAtQuantum: 8, sourceType: 'line_of_sight', payload: { classification: 'spitter', hostility: 'friendly', movementBand: 'slow', positionCell: { x: -9, y: 0, z: 6 } } });
  const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: r.snapshot() }); ledger.synchronize(stream.snapshot());
  const packet = O.createObservation({ identitySnapshot: r.snapshot(), ledgerSnapshot: ledger.snapshot(), factionId: s0, quantum: 8 });
  return { worldId, s0, s1, packet };
}
const base = fixture(false);
const hidden = fixture(true);
const report = I.canonicalize({
  report_schema_version: 1,
  artifact_id: 'sentinel-w0o3-faction-observation-v1',
  phase: 'W0-O.3',
  contract: {
    id: O.CONTRACT_ID,
    registry_id: O.REGISTRY_ID,
    schema_version: O.SCHEMA_VERSION,
    sha256: sha(fs.readFileSync(FILES.observationContract)),
    feature_layout_id: O.FEATURE_LAYOUT_ID,
    feature_count: O.FEATURE_COUNT,
    header_width: O.HEADER_WIDTH,
    slot_width: O.SLOT_WIDTH,
    topic_order: O.TOPIC_ORDER,
    slot_capacities: O.SLOT_CAPACITIES
  },
  registry: { id: registry.registry_id, status: registry.status, sha256: sha(fs.readFileSync(FILES.observationRegistry)) },
  artifacts: {
    identity_contract_sha256: sha(fs.readFileSync(FILES.identityContract)),
    perception_event_contract_sha256: sha(fs.readFileSync(FILES.eventContract)),
    knowledge_ledger_contract_sha256: sha(fs.readFileSync(FILES.knowledgeContract)),
    observation_contract_sha256: sha(fs.readFileSync(FILES.observationContract)),
    identity_registry_sha256: sha(fs.readFileSync(FILES.identityRegistry)),
    perception_event_registry_sha256: sha(fs.readFileSync(FILES.eventRegistry)),
    knowledge_ledger_registry_sha256: sha(fs.readFileSync(FILES.knowledgeRegistry)),
    observation_registry_sha256: sha(fs.readFileSync(FILES.observationRegistry))
  },
  inherited: {
    w0o2_manifest_sha256: sha(fs.readFileSync(FILES.w0o2Manifest)),
    w0o2_status: w0o2.status,
    w0o2_sentinel_portability_digest: w0o2.verification.sentinel_linux_portability_digest,
    w0o2_zeknova_portability_digest: w0o2.verification.zeknova_linux_portability_digest,
    w0a_portability_digest: w0a.verification.w0a_portability_digest
  },
  fixed_fixture: {
    world_id: base.worldId,
    faction_id: base.s0,
    quantum: base.packet.quantum,
    observation_id: base.packet.observationId,
    selected_fresh_record_count: base.packet.selectedFreshRecordCount,
    omitted_fresh_record_count: base.packet.omittedFreshRecordCount,
    canonical_packet: I.canonicalStringify(base.packet),
    packet_hash_fnv1a64x2: I.hash64x2(base.packet),
    feature_vector_sha256: sha(I.canonicalStringify(base.packet.featureVector)),
    feature_vector_nonzero_count: base.packet.featureVector.filter(value => value !== 0).length
  },
  semantics: {
    validated_w0o2_input_only: true,
    faction_private_projection: true,
    stale_records_excluded: true,
    hidden_other_faction_equivalence: I.canonicalStringify(base.packet) === I.canonicalStringify(hidden.packet),
    event_ids_and_global_sequences_excluded: true,
    fixed_width_finite_bounded_features: true,
    deterministic_capacity_and_overflow: true,
    clone_isolated_packet: true,
    action_legality_out_of_scope: true,
    prime_authority_out_of_scope: true
  }
});
const canonical = JSON.stringify(report);
const digest = sha(canonical);
if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
