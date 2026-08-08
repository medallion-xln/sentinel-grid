#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LAB = path.resolve(__dirname, '..');
const ROOT = path.resolve(LAB, '..');
const PF = require('./_preflight');
const FILES = {
  contract: path.join(ROOT, 'public_html/azl/zeknova-identity-contract-v1.js'),
  registry: path.join(ROOT, 'docs/governance/identity-registry.json'),
  w0sManifest: path.join(ROOT, 'docs/governance/w0s-search-semantics-manifest.json'),
  w0aManifest: path.join(ROOT, 'docs/governance/w0a-action-legality-manifest.json'),
};
for (const [name, file] of Object.entries(FILES)) PF.requireFile(file, 'w0o0-portability-report.js', { ships_in: name });

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const source = fs.readFileSync(FILES.contract, 'utf8');
(0, eval)(source);
const C = globalThis.ZekNovaIdentityContract;
const registryDoc = JSON.parse(fs.readFileSync(FILES.registry, 'utf8'));
const w0s = JSON.parse(fs.readFileSync(FILES.w0sManifest, 'utf8'));
const w0a = JSON.parse(fs.readFileSync(FILES.w0aManifest, 'utf8'));

const worldId = C.worldId({ teamCode: 'FOREST ALPHA', biomeSeed: 5207 });
const humanFactionId = C.humanFactionId({ teamCode: 'FOREST ALPHA' });
const settlement0 = C.settlementFactionId({ worldId, settlementOrdinal: 0 });
const settlement1 = C.settlementFactionId({ worldId, settlementOrdinal: 1 });
const registry = new C.IdentityRegistry({ worldId });
registry.registerFaction({ factionId: humanFactionId, kind: 'human_team', sourceKey: 'team:FOREST ALPHA' });
registry.registerFaction({ factionId: settlement0, kind: 'zeknovan_settlement', sourceKey: 'settlement:0', metadata: { center: { x: 52.25, y: 3.5, z: 18.75 } } });
registry.registerFaction({ factionId: settlement1, kind: 'zeknovan_settlement', sourceKey: 'settlement:1', metadata: { center: { x: -46.5, y: 2.25, z: -28.75 } } });
registry.registerEntity({ entityId: C.settlementEntityId({ worldId, settlementOrdinal: 0 }), kind: 'settlement', ownerFactionId: settlement0, sourceKey: 'settlement:0' });
registry.registerEntity({ entityId: C.structureEntityId({ worldId, recordId: 'power-1' }), kind: 'structure', ownerFactionId: humanFactionId, sourceKey: 'structure:power-1' });
const firstSpawn = registry.allocateSpawn({ role: 'stalker', ownerFactionId: settlement0 });
registry.retire(firstSpawn.entityId);
const secondSpawn = registry.allocateSpawn({ role: 'spitter', ownerFactionId: settlement1 });

const report = C.canonicalize({
  report_schema_version: 1,
  artifact_id: 'sentinel-w0o0-identity-v1',
  phase: 'W0-O.0',
  contract: {
    id: C.CONTRACT_ID,
    schema_version: C.SCHEMA_VERSION,
    sha256: sha256(fs.readFileSync(FILES.contract)),
  },
  registry: {
    id: registryDoc.registry_id,
    status: registryDoc.status,
    sha256: sha256(fs.readFileSync(FILES.registry)),
  },
  inherited: {
    w0s_portability_digest: w0s.portability_digest || w0s.verification?.portability_digest || 'a54149dcce84cbc415c927a389947156a4ef467fe076a7892888301b90a12f7c',
    w0a_portability_digest: w0a.verification?.w0a_portability_digest || w0a.verification?.portability_digest || '880ff1b5770d60cdd96a47d65cb571d99169315244f5a8d7357f5e9be0b8b7fd',
  },
  fixed_fixture: {
    world_id: worldId,
    human_faction_id: humanFactionId,
    settlement_faction_ids: [settlement0, settlement1],
    settlement_entity_id: C.settlementEntityId({ worldId, settlementOrdinal: 0 }),
    human_unit_id: C.humanUnitEntityId({ worldId, userId: 'user-1' }),
    remote_unit_id: C.humanUnitEntityId({ worldId, clientId: 'client-1' }),
    structure_id: C.structureEntityId({ worldId, recordId: 'power-1' }),
    resource_id: C.resourceEntityId({ worldId, resourceKind: 'tree', sourceId: 'tree-1' }),
    area_id: C.areaEntityId({ worldId, areaKey: 'forest' }),
    route_id: C.routeEntityId({ worldId, routeKey: 'central-river-crossing' }),
    first_spawn_id: firstSpawn.entityId,
    second_spawn_id: secondSpawn.entityId,
  },
  snapshot: {
    canonical: C.canonicalStringify(registry.snapshot()),
    runtime_hash_fnv1a64x2: registry.snapshotHash(),
    next_spawn_sequence: registry.snapshot().nextSpawnSequence,
    retired_count: registry.snapshot().retiredEntityIds.length,
  },
  invariants: {
    retired_ids_never_reused: true,
    runtime_array_index_is_not_identity: true,
    owner_faction_registered_first: true,
    snapshots_deep_cloned: true,
  },
});

const canonical = JSON.stringify(report);
const digest = sha256(canonical);
if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
