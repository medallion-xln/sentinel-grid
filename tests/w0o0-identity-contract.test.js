#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LAB = path.resolve(__dirname, '..');
const ROOT = path.resolve(LAB, '..');
const FROZEN = path.join(LAB, 'results-v2.1', 'scenario-certification');
const PF = require('./_preflight');
PF.requireFrozen(FROZEN, 'w0o0-identity-contract.test.js');

const CONTRACT_PATH = path.join(ROOT, 'public_html/azl/zeknova-identity-contract-v1.js');
const REGISTRY_PATH = path.join(ROOT, 'docs/governance/identity-registry.json');
const MANIFEST_PATH = path.join(ROOT, 'docs/governance/w0o0-identity-manifest.json');
for (const [file, ships] of [
  [CONTRACT_PATH, 'sentinel-grid/public_html/azl/zeknova-identity-contract-v1.js'],
  [REGISTRY_PATH, 'sentinel-grid/docs/governance/identity-registry.json'],
  [MANIFEST_PATH, 'sentinel-grid/docs/governance/w0o0-identity-manifest.json'],
]) PF.requireFile(file, 'w0o0-identity-contract.test.js', { ships_in: ships });

const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
(0, eval)(source);
const C = globalThis.ZekNovaIdentityContract;
const REG = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const MANIFEST = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');

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

check('C1_contract_id', C.CONTRACT_ID, 'zeknova-identity-contract-v1');
check('C1_schema_version', C.SCHEMA_VERSION, 1);
check('C1_registry_id', C.REGISTRY_ID, 'zeknova-identity-v1-development');
check('R1_registry_schema', REG.schema_version, 1);
check('R1_registry_id_matches_contract', REG.registry_id, C.REGISTRY_ID);
check('R1_contract_hash_matches_registry', sha(fs.readFileSync(CONTRACT_PATH)), REG.contract.implementation_sha256);
check('R1_status_is_development', REG.status, 'development');
check('M1_manifest_phase', MANIFEST.phase, 'W0-O.0');
check('M1_manifest_is_frozen', MANIFEST.status, 'frozen');
check('M2_linux_darwin_sentinel_digest_match', MANIFEST.verification.sentinel_linux_portability_digest, MANIFEST.verification.sentinel_darwin_portability_digest);
check('M2_linux_darwin_zeknova_digest_match', MANIFEST.verification.zeknova_linux_portability_digest, MANIFEST.verification.zeknova_darwin_portability_digest);
check('M1_inherits_w0a_digest', MANIFEST.inherits.w0a_portability_digest, '880ff1b5770d60cdd96a47d65cb571d99169315244f5a8d7357f5e9be0b8b7fd');

const world = C.worldId({ teamCode: 'Forest Alpha', biomeSeed: 5207 });
const worldSame = C.worldId({ teamCode: ' forest alpha ', biomeSeed: 5207 });
const worldOther = C.worldId({ teamCode: 'Forest Alpha', biomeSeed: 5208 });
const humanFaction = C.humanFactionId({ teamCode: 'FOREST ALPHA' });
const settlement0 = C.settlementFactionId({ worldId: world, settlementOrdinal: 0 });
const settlement1 = C.settlementFactionId({ worldId: world, settlementOrdinal: 1 });

check('I1_world_fixture', world, 'zkid:v1:world:FOREST%20ALPHA:5207');
check('I1_team_normalization_is_case_insensitive', worldSame, world);
check('I1_world_seed_changes_identity', worldOther === world, false);
check('I1_human_faction_fixture', humanFaction, 'zkid:v1:faction:human:FOREST%20ALPHA');
check('I1_settlement_factions_distinct', settlement0 === settlement1, false);
check('I1_all_fixture_ids_canonical', [world, humanFaction, settlement0, settlement1].every(C.isCanonicalIdentity), true);
throws('I2_empty_team_rejected', () => C.worldId({ teamCode: '', biomeSeed: 1 }), /teamCode/);
throws('I2_fractional_seed_rejected', () => C.worldId({ teamCode: 'A', biomeSeed: 1.5 }), /safe integer/);
throws('I2_invalid_world_rejected', () => C.parseWorldId('world:bad'), /Invalid/);
check('I2_malformed_percent_encoding_rejected', C.isCanonicalIdentity('zkid:v1:world:%ZZ:1'), false);

check('E1_persistent_structure_stable',
  C.structureEntityId({ worldId: world, recordId: 'power-1' }),
  C.structureEntityId({ worldId: world, recordId: 'power-1' }));
check('E1_local_player_prefers_user_id',
  C.humanUnitEntityId({ worldId: world, userId: 'u-1', clientId: 'c-1' }),
  C.humanUnitEntityId({ worldId: world, userId: 'u-1', clientId: 'c-2' }));
check('E1_remote_clients_distinct',
  C.humanUnitEntityId({ worldId: world, clientId: 'c-1' }) === C.humanUnitEntityId({ worldId: world, clientId: 'c-2' }), false);
check('E1_settlement_entity_fixture',
  C.settlementEntityId({ worldId: world, settlementOrdinal: 0 }),
  'zkid:v1:entity:settlement:zeknovan:FOREST%20ALPHA:5207:0');
check('E1_area_identity_fixture',
  C.areaEntityId({ worldId: world, areaKey: 'Forest' }),
  'zkid:v1:entity:area:FOREST%20ALPHA:5207:forest');
check('E1_route_identity_fixture',
  C.routeEntityId({ worldId: world, routeKey: 'Central River Crossing' }),
  'zkid:v1:entity:route:FOREST%20ALPHA:5207:central%20river%20crossing');

check('J1_canonical_key_order_independent', C.canonicalStringify({ b: 2, a: 1 }), C.canonicalStringify({ a: 1, b: 2 }));
throws('J1_nonfinite_rejected', () => C.canonicalStringify({ value: Infinity }), /non-finite/);
throws('J1_non_plain_object_rejected', () => C.canonicalStringify({ value: new Date(0) }), /plain objects/);
{
  const cyclic = {}; cyclic.self = cyclic;
  throws('J1_cycles_rejected', () => C.stableClone(cyclic), /cycles/);
}

function baseRegistry() {
  const r = new C.IdentityRegistry({ worldId: world });
  r.registerFaction({ factionId: humanFaction, kind: 'human_team', sourceKey: 'team:forest' });
  r.registerFaction({ factionId: settlement0, kind: 'zeknovan_settlement', sourceKey: 'settlement:0' });
  r.registerFaction({ factionId: settlement1, kind: 'zeknovan_settlement', sourceKey: 'settlement:1' });
  r.registerEntity({
    entityId: C.settlementEntityId({ worldId: world, settlementOrdinal: 0 }),
    kind: 'settlement', ownerFactionId: settlement0, sourceKey: 'settlement:0'
  });
  return r;
}

{
  const r = new C.IdentityRegistry({ worldId: world });
  throws('FXOWNER_unregistered_owner_rejected', () => r.registerEntity({
    entityId: C.settlementEntityId({ worldId: world, settlementOrdinal: 0 }),
    kind: 'settlement', ownerFactionId: settlement0, sourceKey: 'settlement:0'
  }), /Owner faction/);
}

{
  const r = baseRegistry();
  const first = r.allocateSpawn({ role: 'stalker', ownerFactionId: settlement0 });
  check('S1_first_spawn_sequence', /:spawn:1:stalker$/.test(first.entityId), true);
  check('S1_retire_returns_true', r.retire(first.entityId), true);
  const second = r.allocateSpawn({ role: 'stalker', ownerFactionId: settlement0 });
  check('FXIDREUSE_identity_changes_after_retire', second.entityId === first.entityId, false);
  check('FXIDREUSE_second_sequence', /:spawn:2:stalker$/.test(second.entityId), true);
  throws('FXIDREUSE_retired_id_rejected', () => r.registerEntity(first), /Retired entity identity/);
}

{
  const r = baseRegistry();
  const a = C.structureEntityId({ worldId: world, recordId: 'a' });
  const b = C.structureEntityId({ worldId: world, recordId: 'b' });
  r.registerEntity({ entityId: a, kind: 'structure', ownerFactionId: humanFaction, sourceKey: 'structure:same' });
  throws('FXCOLLISION_source_collision_rejected', () => r.registerEntity({ entityId: b, kind: 'structure', ownerFactionId: humanFaction, sourceKey: 'structure:same' }), /Source key collision/);
}

{
  const r = baseRegistry();
  const spawn = r.allocateSpawn({ role: 'spitter', ownerFactionId: settlement1, metadata: { nested: { value: 7 } } });
  const snapshot = r.snapshot();
  const canonical = C.canonicalStringify(snapshot);
  const restored = C.IdentityRegistry.fromSnapshot(snapshot);
  check('S2_snapshot_roundtrip_byte_identical', C.canonicalStringify(restored.snapshot()), canonical);
  check('S2_snapshot_hash_roundtrip', restored.snapshotHash(), r.snapshotHash());
  check('S2_spawn_sequence_survives_restore', /:spawn:2:stalker$/.test(restored.allocateSpawn({ role: 'stalker', ownerFactionId: settlement0 }).entityId), true);
  snapshot.entities.find(x => x.entityId === spawn.entityId).metadata.nested.value = 999;
  check('FXALIAS_snapshot_mutation_does_not_touch_registry', r.getEntity(spawn.entityId).metadata.nested.value, 7);
  const reversed = restored.snapshot().entities.slice().reverse();
  check('FXINDEX_array_reorder_does_not_change_ids', reversed.some(x => x.entityId === spawn.entityId), true);
  check('FXINDEX_no_runtime_index_identity', reversed.every(x => !/^hostile_\d+$/.test(x.entityId)), true);
}

{
  function replay() {
    const r = baseRegistry();
    const a = r.allocateSpawn({ role: 'stalker', ownerFactionId: settlement0 });
    const b = r.allocateSpawn({ role: 'spitter', ownerFactionId: settlement1 });
    r.retire(a.entityId);
    return { ids: [a.entityId, b.entityId], snapshot: C.canonicalStringify(r.snapshot()), hash: r.snapshotHash() };
  }
  const a = replay(), b = replay();
  check('D1_deterministic_replay_ids', JSON.stringify(a.ids), JSON.stringify(b.ids));
  check('D1_deterministic_replay_snapshot', a.snapshot, b.snapshot);
  check('D1_deterministic_replay_hash', a.hash, b.hash);
}

const after = frozenFingerprint();
check('Z1_frozen_file_count_unchanged', after.count, before.count);
check('Z2_frozen_digest_unchanged', after.digest, before.digest);

console.log(results);
console.log('identity contract sha256:', sha(fs.readFileSync(CONTRACT_PATH)));
console.log('fixed world identity     :', world);
console.log('frozen set              :', `${after.count} files, digest ${after.digest.slice(0, 16)}`);
if (failures) {
  console.error(`W0-O.0 IDENTITY CONTRACT TESTS FAIL (${failures} failure${failures === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log(`W0-O.0 IDENTITY CONTRACT TESTS PASS (${Object.keys(results).length}/${Object.keys(results).length})`);
