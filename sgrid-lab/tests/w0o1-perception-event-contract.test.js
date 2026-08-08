#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LAB = path.resolve(__dirname, '..');
const ROOT = path.resolve(LAB, '..');
const FROZEN = path.join(LAB, 'results-v2.1', 'scenario-certification');
const PF = require('./_preflight');
PF.requireFrozen(FROZEN, 'w0o1-perception-event-contract.test.js');

const FILES = {
  identity: path.join(ROOT, 'public_html/azl/zeknova-identity-contract-v1.js'),
  event: path.join(ROOT, 'public_html/azl/zeknova-perception-event-contract-v1.js'),
  registry: path.join(ROOT, 'docs/governance/perception-event-registry.json'),
  manifest: path.join(ROOT, 'docs/governance/w0o1-perception-event-manifest.json'),
  w0o0: path.join(ROOT, 'docs/governance/w0o0-identity-manifest.json'),
};
for (const [name, file] of Object.entries(FILES)) PF.requireFile(file, 'w0o1-perception-event-contract.test.js', { ships_in: name });
(0, eval)(fs.readFileSync(FILES.identity, 'utf8'));
(0, eval)(fs.readFileSync(FILES.event, 'utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const REG = JSON.parse(fs.readFileSync(FILES.registry, 'utf8'));
const MANIFEST = JSON.parse(fs.readFileSync(FILES.manifest, 'utf8'));
const W0O0 = JSON.parse(fs.readFileSync(FILES.w0o0, 'utf8'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

const results = {};
let failures = 0;
function check(name, actual, expected) {
  const pass = actual === expected;
  results[name] = pass ? 'pass' : `FAIL(expected ${expected}, got ${actual})`;
  if (!pass) failures++;
}
function throws(name, fn, pattern) {
  let pass = false;
  try { fn(); } catch (error) { pass = pattern ? pattern.test(String(error.message || error)) : true; }
  check(name, pass, true);
}
function frozenFingerprint() {
  const files = [];
  (function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      fs.statSync(file).isDirectory() ? walk(file) : files.push(file);
    }
  })(FROZEN);
  const hash = crypto.createHash('sha256');
  for (const file of files) { hash.update(path.relative(FROZEN, file)); hash.update(fs.readFileSync(file)); }
  return { count: files.length, digest: hash.digest('hex') };
}
const before = frozenFingerprint();

check('C1_contract_id', P.CONTRACT_ID, 'zeknova-perception-event-contract-v1');
check('C1_schema_version', P.SCHEMA_VERSION, 1);
check('C1_registry_id', P.REGISTRY_ID, 'zeknova-perception-events-v1-development');
check('C1_event_type_count', P.EVENT_TYPES.length, 10);
check('R1_registry_schema', REG.schema_version, 1);
check('R1_registry_id_matches_contract', REG.registry_id, P.REGISTRY_ID);
check('R1_contract_hash_matches_registry', sha(fs.readFileSync(FILES.event)), REG.contract.implementation_sha256);
check('R1_status_is_development', REG.status, 'development');
check('M1_manifest_phase', MANIFEST.phase, 'W0-O.1');
check('M1_manifest_is_frozen', MANIFEST.status, 'frozen');
check('M2_linux_darwin_sentinel_digest_match', MANIFEST.verification.sentinel_linux_portability_digest, MANIFEST.verification.sentinel_darwin_portability_digest);
check('M2_linux_darwin_zeknova_digest_match', MANIFEST.verification.zeknova_linux_portability_digest, MANIFEST.verification.zeknova_darwin_portability_digest);
check('M1_inherits_frozen_w0o0', W0O0.status, 'frozen');
check('M1_inherits_w0o0_sentinel_digest', MANIFEST.inherits.w0o0_sentinel_portability_digest, '5d6e4872e1dab3f7e3062f1b9cf118a329252823ece3c6357ce794058ce0eb34');
check('M1_inherits_w0o0_zeknova_digest', MANIFEST.inherits.w0o0_zeknova_portability_digest, '0b424ff21f1def34f3a156e1c02396e47872e753e9fe3ca27714ae1814b617a9');

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
  const scout0 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const scout1 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s1 }).entityId;
  const enemy = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  const structure = I.structureEntityId({ worldId, recordId: 'power-1' });
  r.registerEntity({ entityId: structure, kind: 'structure', ownerFactionId: human, sourceKey: 'power-1' });
  const resource = I.resourceEntityId({ worldId, resourceKind: 'tree', sourceId: 'tree-1' });
  r.registerEntity({ entityId: resource, kind: 'resource', ownerFactionId: null, sourceKey: 'tree-1' });
  const route = I.routeEntityId({ worldId, routeKey: 'central-river-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route-1' });
  return { worldId, human, s0, s1, r, player, scout0, scout1, enemy, structure, resource, route };
}
function sighting(f, overrides) {
  return Object.assign({
    eventType: 'enemy_sighted', observerFactionId: f.s0, sourceFactionId: f.s0,
    sourceEntityId: f.scout0, subjectId: f.enemy, observedAtQuantum: 7,
    sourceType: 'line_of_sight', payload: {
      classification: 'stalker', hostility: 'hostile', movementBand: 'fast',
      positionCell: { x: 12, y: 2, z: -4 }
    }
  }, overrides || {});
}
const f = fixture();
const ids = f.r.snapshot();
const stream = new P.PerceptionEventStream({ identitySnapshot: ids });
const first = stream.append(sighting(f));
check('E1_first_sequence', first.eventSequence, 1);
check('E1_event_id_valid', P.isEventId(first.eventId), true);
check('E1_event_id_revalidates', P.validateEvent(first, ids).eventId, first.eventId);
check('E1_event_world_bound', first.worldId, f.worldId);
check('E1_source_owned', f.r.getEntity(first.sourceEntityId).ownerFactionId, first.sourceFactionId);
check('E1_observer_equals_source', first.observerFactionId, first.sourceFactionId);
check('E1_position_integer', Number.isSafeInteger(first.payload.positionCell.x), true);

const canonicalA = P.createEvent(Object.assign(sighting(f), { eventSequence: 30 }), ids);
const canonicalB = P.createEvent(Object.assign(sighting(f), { eventSequence: 30, payload: { positionCell: { z: -4, y: 2, x: 12 }, movementBand: 'fast', hostility: 'hostile', classification: 'stalker' } }), ids);
check('D1_key_order_independent', canonicalA.eventId, canonicalB.eventId);
check('D1_changed_payload_changes_id', P.createEvent(Object.assign(sighting(f), { eventSequence: 30, payload: Object.assign({}, sighting(f).payload, { hostility: 'unknown' }) }), ids).eventId === canonicalA.eventId, false);

throws('FXOMNI_aggregate_rejected', () => stream.append(Object.assign(sighting(f), { payload: Object.assign({}, sighting(f).payload, { enemyCount: 99 }) })), /unexpected or missing fields/);
throws('FXHIDDEN_hidden_health_rejected', () => stream.append(Object.assign(sighting(f), { payload: Object.assign({}, sighting(f).payload, { hiddenHealth: 62 }) })), /unexpected or missing fields/);
throws('FXSOURCE_unregistered_source_rejected', () => stream.append(Object.assign(sighting(f), { sourceEntityId: I.humanUnitEntityId({ worldId: f.worldId, userId: 'missing' }) })), /not an active registered entity/);
throws('FXOWNER_source_owner_mismatch_rejected', () => stream.append(Object.assign(sighting(f), { sourceFactionId: f.s1 })), /not owned/);
throws('FXFACTION_nonshare_cross_faction_rejected', () => stream.append(Object.assign(sighting(f), { observerFactionId: f.s1 })), /observerFactionId to equal sourceFactionId/);
throws('FXKIND_subject_kind_rejected', () => stream.append(Object.assign(sighting(f), { subjectId: f.structure })), /does not accept subject kind/);
throws('FXSOURCE_wrong_source_type_rejected', () => stream.append(Object.assign(sighting(f), { sourceType: 'resource_sensor' })), /not allowed/);
throws('FXTIME_fractional_quantum_rejected', () => stream.append(Object.assign(sighting(f), { observedAtQuantum: 1.5 })), /safe integer/);
throws('FXCLOCK_wall_clock_field_rejected', () => stream.append(Object.assign(sighting(f), { observedAtMs: 123 })), /unexpected or missing fields/);
throws('FXFLOAT_fractional_cell_rejected', () => stream.append(Object.assign(sighting(f), { payload: Object.assign({}, sighting(f).payload, { positionCell: { x: 1.2, y: 0, z: 0 } }) })), /safe integer/);

const lost = stream.append({ eventType: 'enemy_lost', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.enemy, observedAtQuantum: 8, sourceType: 'line_of_sight', payload: { lastKnownPositionCell: { x: 12, y: 2, z: -4 }, reason: 'occluded' } });
check('T1_enemy_lost', lost.eventType, 'enemy_lost');
const combat = stream.append({ eventType: 'combat_alert', observerFactionId: f.human, sourceFactionId: f.human, sourceEntityId: f.player, subjectId: f.structure, observedAtQuantum: 9, sourceType: 'damage_sensor', payload: { contactRole: 'defender', positionCell: { x: 4, y: 0, z: 5 }, severity: 'high' } });
check('T2_combat_alert', combat.payload.severity, 'high');
const resource = stream.append({ eventType: 'resource_discovered', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.resource, observedAtQuantum: 10, sourceType: 'resource_sensor', payload: { abundanceBand: 'high', positionCell: { x: 1, y: 0, z: 1 }, resourceKind: 'tree' } });
check('T3_resource_discovered', resource.payload.resourceKind, 'tree');
const route = stream.append({ eventType: 'route_observed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.route, observedAtQuantum: 11, sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 0 }, status: 'blocked' } });
check('T4_route_observed', route.payload.status, 'blocked');

const shared = stream.share({ originalEventId: first.eventId, senderFactionId: f.s0, recipientFactionId: f.s1, sourceEntityId: f.scout0, observedAtQuantum: 12, shareMode: 'direct' });
check('S1_share_recipient', shared.observerFactionId, f.s1);
check('S1_share_sender', shared.sourceFactionId, f.s0);
check('S1_original_event_preserved', I.canonicalStringify(shared.payload.sharedEvent), I.canonicalStringify(first));
check('S1_original_time_preserved', shared.payload.sharedEvent.observedAtQuantum, 7);
throws('FXLEAK_nonobserver_share_rejected', () => stream.share({ originalEventId: first.eventId, senderFactionId: f.s1, recipientFactionId: f.human, sourceEntityId: f.scout1, observedAtQuantum: 13 }), /Only the faction that observed/);
throws('FXFUTURE_share_before_observation_rejected', () => stream.share({ originalEventId: first.eventId, senderFactionId: f.s0, recipientFactionId: f.s1, sourceEntityId: f.scout0, observedAtQuantum: 6 }), /before it was observed/);
throws('FXNEST_nested_share_rejected', () => stream.share({ originalEventId: shared.eventId, senderFactionId: f.s1, recipientFactionId: f.human, sourceEntityId: f.scout1, observedAtQuantum: 13 }), /Nested intelligence/);
check('P1_sender_query_excludes_recipient_share', stream.eventsForFaction(f.s0).some(e => e.eventId === shared.eventId), false);
check('P1_recipient_query_includes_share', stream.eventsForFaction(f.s1).some(e => e.eventId === shared.eventId), true);

const bytes = I.canonicalStringify(stream.snapshot());
const restored = P.PerceptionEventStream.fromSnapshot(ids, stream.snapshot());
check('C2_snapshot_roundtrip', I.canonicalStringify(restored.snapshot()), bytes);
check('C2_snapshot_hash_roundtrip', restored.snapshotHash(), stream.snapshotHash());
const detached = stream.snapshot(); detached.events[0].payload.positionCell.x = 999;
check('FXALIAS_snapshot_detached', stream.getEvent(first.eventId).payload.positionCell.x, 12);
throws('FXSEQ_sequence_tamper_rejected', () => { const bad = stream.snapshot(); bad.events[1].eventSequence = 1; P.PerceptionEventStream.fromSnapshot(ids, bad); }, /canonical event body|contiguous/);
throws('FXID_event_id_tamper_rejected', () => P.validateEvent(Object.assign({}, first, { eventId: first.eventId.slice(0, -1) + (first.eventId.endsWith('0') ? '1' : '0') }), ids), /does not match/);

const retired = I.IdentityRegistry.fromSnapshot(ids); retired.retire(f.enemy);
check('H1_retired_subject_valid_for_historical_event', P.validateEvent(first, retired.snapshot()).subjectId, f.enemy);
function replay() {
  const s = new P.PerceptionEventStream({ identitySnapshot: ids });
  const a = s.append(sighting(f));
  s.append({ eventType: 'enemy_lost', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.enemy, observedAtQuantum: 8, sourceType: 'line_of_sight', payload: { lastKnownPositionCell: { x: 12, y: 2, z: -4 }, reason: 'out_of_range' } });
  return { id: a.eventId, bytes: I.canonicalStringify(s.snapshot()), hash: s.snapshotHash() };
}
check('D2_replay_id_deterministic', replay().id, replay().id);
check('D2_replay_bytes_deterministic', replay().bytes, replay().bytes);
check('D2_replay_hash_deterministic', replay().hash, replay().hash);

const after = frozenFingerprint();
check('Z1_frozen_file_count_unchanged', after.count, before.count);
check('Z2_frozen_digest_unchanged', after.digest, before.digest);

console.log(results);
console.log('perception contract sha256:', sha(fs.readFileSync(FILES.event)));
console.log('fixed sighting event id    :', first.eventId);
console.log('event stream hash          :', stream.snapshotHash());
console.log('frozen set                 :', `${after.count} files, digest ${after.digest.slice(0, 16)}`);
if (failures) {
  console.error(`W0-O.1 PERCEPTION EVENT CONTRACT TESTS FAIL (${failures} failure${failures === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log(`W0-O.1 PERCEPTION EVENT CONTRACT TESTS PASS (${Object.keys(results).length}/${Object.keys(results).length})`);
