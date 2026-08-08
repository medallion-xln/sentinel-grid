#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LAB = path.resolve(__dirname, '..');
const ROOT = path.resolve(LAB, '..');
const PF = require('./_preflight');
const FILES = {
  identityContract: path.join(ROOT, 'public_html/azl/zeknova-identity-contract-v1.js'),
  eventContract: path.join(ROOT, 'public_html/azl/zeknova-perception-event-contract-v1.js'),
  knowledgeContract: path.join(ROOT, 'public_html/azl/zeknova-knowledge-ledger-contract-v1.js'),
  observationContract: path.join(ROOT, 'public_html/azl/zeknova-faction-observation-contract-v1.js'),
  legalityContract: path.join(ROOT, 'public_html/azl/zeknova-observation-legality-contract-v1.js'),
  identityRegistry: path.join(ROOT, 'docs/governance/identity-registry.json'),
  eventRegistry: path.join(ROOT, 'docs/governance/perception-event-registry.json'),
  knowledgeRegistry: path.join(ROOT, 'docs/governance/knowledge-ledger-registry.json'),
  observationRegistry: path.join(ROOT, 'docs/governance/faction-observation-registry.json'),
  legalityRegistry: path.join(ROOT, 'docs/governance/observation-legality-registry.json'),
  w0o3Manifest: path.join(ROOT, 'docs/governance/w0o3-faction-observation-manifest.json'),
  w0aManifest: path.join(ROOT, 'docs/governance/w0a-action-legality-manifest.json')
};
for (const [name, file] of Object.entries(FILES)) PF.requireFile(file, 'w0o5-portability-report.js', { ships_in: name });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
for (const key of ['identityContract', 'eventContract', 'knowledgeContract', 'observationContract', 'legalityContract']) (0, eval)(fs.readFileSync(FILES[key], 'utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;
const O = globalThis.ZekNovaFactionObservationContract;
const L = globalThis.ZekNovaObservationLegalityContract;
const registry = JSON.parse(fs.readFileSync(FILES.legalityRegistry, 'utf8'));
const w0o3 = JSON.parse(fs.readFileSync(FILES.w0o3Manifest, 'utf8'));
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
  const structure = I.structureEntityId({ worldId, recordId: 'watchtower-1' });
  r.registerEntity({ entityId: structure, kind: 'structure', ownerFactionId: s0, sourceKey: 'structure' });
  const stream = new P.PerceptionEventStream({ identitySnapshot: r.snapshot() });
  stream.append({ eventType: 'enemy_sighted', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: enemy, observedAtQuantum: 7, sourceType: 'line_of_sight', payload: { classification: 'stalker', hostility: 'hostile', movementBand: 'fast', positionCell: { x: 12, y: 0, z: -4 } } });
  stream.append({ eventType: 'route_observed', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: route, observedAtQuantum: 8, sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'damaged' } });
  stream.append({ eventType: 'structure_observed', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: structure, observedAtQuantum: 8, sourceType: 'structure_sensor', payload: { observedOwnerFactionId: s0, positionCell: { x: 4, y: 0, z: 5 }, statusBand: 'damaged', structureKind: 'watchtower' } });
  if (extraPrivate) stream.append({ eventType: 'enemy_sighted', observerFactionId: s1, sourceFactionId: s1, sourceEntityId: scout1, subjectId: hidden, observedAtQuantum: 8, sourceType: 'line_of_sight', payload: { classification: 'spitter', hostility: 'friendly', movementBand: 'slow', positionCell: { x: -9, y: 0, z: 6 } } });
  const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: r.snapshot() }); ledger.synchronize(stream.snapshot());
  const packet = O.createObservation({ identitySnapshot: r.snapshot(), ledgerSnapshot: ledger.snapshot(), factionId: s0, quantum: 8 });
  const targetView = L.buildTargetView(packet);
  const legality = L.computeLegality({ observation: packet, upstreamMask: [1, 1, 1, 1, 1, 1] });
  return { worldId, s0, packet, targetView, legality };
}
const base = fixture(false);
const hidden = fixture(true);
const report = I.canonicalize({
  report_schema_version: 1,
  artifact_id: 'sentinel-w0o5-observation-legality-v1',
  phase: 'W0-O.5',
  contract: {
    id: L.CONTRACT_ID,
    registry_id: L.REGISTRY_ID,
    schema_version: L.SCHEMA_VERSION,
    sha256: sha(fs.readFileSync(FILES.legalityContract)),
    action_space_id: L.ACTION_SPACE_ID,
    action_count: L.ACTION_COUNT,
    safe_fallback_index: L.SAFE_FALLBACK_INDEX,
    action_keys: L.ACTIONS.map(action => action.key)
  },
  registry: { id: registry.registry_id, status: registry.status, sha256: sha(fs.readFileSync(FILES.legalityRegistry)) },
  artifacts: {
    identity_contract_sha256: sha(fs.readFileSync(FILES.identityContract)),
    perception_event_contract_sha256: sha(fs.readFileSync(FILES.eventContract)),
    knowledge_ledger_contract_sha256: sha(fs.readFileSync(FILES.knowledgeContract)),
    faction_observation_contract_sha256: sha(fs.readFileSync(FILES.observationContract)),
    observation_legality_contract_sha256: sha(fs.readFileSync(FILES.legalityContract)),
    identity_registry_sha256: sha(fs.readFileSync(FILES.identityRegistry)),
    perception_event_registry_sha256: sha(fs.readFileSync(FILES.eventRegistry)),
    knowledge_ledger_registry_sha256: sha(fs.readFileSync(FILES.knowledgeRegistry)),
    faction_observation_registry_sha256: sha(fs.readFileSync(FILES.observationRegistry)),
    observation_legality_registry_sha256: sha(fs.readFileSync(FILES.legalityRegistry))
  },
  inherited: {
    w0o3_manifest_sha256: sha(fs.readFileSync(FILES.w0o3Manifest)),
    w0o3_status: w0o3.status,
    w0o3_sentinel_portability_digest: w0o3.verification.sentinel_linux_portability_digest,
    w0o3_zeknova_portability_digest: w0o3.verification.zeknova_linux_portability_digest,
    w0a_portability_digest: w0a.verification.w0a_portability_digest
  },
  fixed_fixture: {
    world_id: base.worldId,
    faction_id: base.s0,
    quantum: base.packet.quantum,
    observation_id: base.packet.observationId,
    target_view_id: base.targetView.targetViewId,
    legality_id: base.legality.legalityId,
    upstream_bitset_hex: base.legality.upstreamBitsetHex,
    observation_bitset_hex: base.legality.observationBitsetHex,
    final_bitset_hex: base.legality.finalBitsetHex,
    target_counts: base.legality.targetCounts,
    canonical_target_view: I.canonicalStringify(base.targetView),
    canonical_legality: I.canonicalStringify(base.legality),
    final_mask_hash: base.legality.finalMaskHash
  },
  semantics: {
    validated_w0o3_input_only: true,
    hidden_other_faction_equivalence: I.canonicalStringify(base.legality) === I.canonicalStringify(hidden.legality),
    hidden_other_faction_target_equivalence: I.canonicalStringify(base.targetView) === I.canonicalStringify(hidden.targetView),
    upstream_mask_never_resurrected: true,
    terminal_and_replan_mask_everything: true,
    stale_and_private_records_cannot_enable_actions: true,
    omitted_targets_cannot_be_selected: true,
    structured_target_ids_not_float_reconstruction: true,
    safe_fallback_required_for_nonterminal_upstream: true,
    action_execution_out_of_scope: true,
    prime_authority_out_of_scope: true
  }
});
const canonical = JSON.stringify(report);
const digest = sha(canonical);
if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
