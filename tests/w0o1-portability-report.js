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
  identityRegistry: path.join(ROOT, 'docs/governance/identity-registry.json'),
  eventRegistry: path.join(ROOT, 'docs/governance/perception-event-registry.json'),
  w0o0Manifest: path.join(ROOT, 'docs/governance/w0o0-identity-manifest.json'),
  w0aManifest: path.join(ROOT, 'docs/governance/w0a-action-legality-manifest.json'),
};
for (const [name, file] of Object.entries(FILES)) PF.requireFile(file, 'w0o1-portability-report.js', { ships_in: name });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
(0, eval)(fs.readFileSync(FILES.identityContract, 'utf8'));
(0, eval)(fs.readFileSync(FILES.eventContract, 'utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const eventRegistry = JSON.parse(fs.readFileSync(FILES.eventRegistry, 'utf8'));
const w0o0 = JSON.parse(fs.readFileSync(FILES.w0o0Manifest, 'utf8'));
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
  const player = I.humanUnitEntityId({ worldId, userId: 'user-1' });
  r.registerEntity({ entityId: player, kind: 'unit', ownerFactionId: human, sourceKey: 'player' });
  const scout = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const enemy = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  const route = I.routeEntityId({ worldId, routeKey: 'central-river-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route' });
  return { worldId, human, s0, s1, r, player, scout, enemy, route };
}
const f = fixture();
const stream = new P.PerceptionEventStream({ identitySnapshot: f.r.snapshot() });
const sighting = stream.append({
  eventType: 'enemy_sighted', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout, subjectId: f.enemy, observedAtQuantum: 7,
  sourceType: 'line_of_sight', payload: {
    classification: 'stalker', hostility: 'hostile', movementBand: 'fast',
    positionCell: { x: 12, y: 2, z: -4 }
  }
});
const route = stream.append({
  eventType: 'route_observed', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout, subjectId: f.route, observedAtQuantum: 8,
  sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'blocked' }
});
const shared = stream.share({
  originalEventId: sighting.eventId, senderFactionId: f.s0, recipientFactionId: f.s1,
  sourceEntityId: f.scout, observedAtQuantum: 9, shareMode: 'direct'
});

const report = I.canonicalize({
  report_schema_version: 1,
  artifact_id: 'sentinel-w0o1-perception-events-v1',
  phase: 'W0-O.1',
  contract: {
    id: P.CONTRACT_ID,
    registry_id: P.REGISTRY_ID,
    schema_version: P.SCHEMA_VERSION,
    sha256: sha(fs.readFileSync(FILES.eventContract)),
    event_types: P.EVENT_TYPES
  },
  registry: {
    id: eventRegistry.registry_id,
    status: eventRegistry.status,
    sha256: sha(fs.readFileSync(FILES.eventRegistry))
  },
  inherited: {
    identity_contract_sha256: sha(fs.readFileSync(FILES.identityContract)),
    identity_registry_sha256: sha(fs.readFileSync(FILES.identityRegistry)),
    w0o0_manifest_sha256: sha(fs.readFileSync(FILES.w0o0Manifest)),
    w0o0_sentinel_portability_digest: w0o0.verification.sentinel_linux_portability_digest,
    w0o0_zeknova_portability_digest: w0o0.verification.zeknova_linux_portability_digest,
    w0a_portability_digest: w0a.verification.w0a_portability_digest
  },
  fixed_fixture: {
    world_id: f.worldId,
    observer_faction_id: f.s0,
    recipient_faction_id: f.s1,
    source_entity_id: f.scout,
    subject_entity_id: f.enemy,
    sighting_event_id: sighting.eventId,
    route_event_id: route.eventId,
    share_event_id: shared.eventId,
    shared_original_event_id: shared.payload.sharedEvent.eventId
  },
  stream: {
    canonical: I.canonicalStringify(stream.snapshot()),
    runtime_hash_fnv1a64x2: stream.snapshotHash(),
    event_count: stream.snapshot().events.length,
    next_event_sequence: stream.snapshot().nextEventSequence,
    observer_event_count: stream.eventsForFaction(f.s0).length,
    recipient_event_count: stream.eventsForFaction(f.s1).length
  },
  semantics: {
    exact_payload_schemas: true,
    source_entity_ownership_required: true,
    wall_clock_forbidden: true,
    integer_position_cells: true,
    explicit_intelligence_sharing_only: true,
    shared_event_preserves_original_time_and_source: true,
    automatic_omniscient_enumeration_forbidden: true,
    no_knowledge_ledger_in_this_phase: true
  }
});
const canonical = JSON.stringify(report);
const digest = sha(canonical);
if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
