import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionKey } from '../src/core/contracts.js';
import { sha256 } from '../src/core/determinism.js';
import { recommend } from '../src/prime/root-puct.js';
import { loadProductionRegistry } from '../scripts/production-context.mjs';
import { loadZekNovaBehavioralParity } from '../scripts/zeknova-parity-context.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function zeknova() {
  const { registry } = await loadProductionRegistry();
  return registry.get('zeknova:zeknova-stage1az-shadow-adapter');
}

test('ZekNova adapter is registered under exact production identity and R0', async () => {
  const registration = await zeknova();
  assert.equal(registration.manifest.gameId, 'zeknova');
  assert.equal(registration.manifest.adapterId, 'zeknova-stage1az-shadow-adapter');
  assert.equal(registration.manifest.adapterVersion, '1.0.0');
  assert.equal(registration.manifest.authority.tier, 'R0');
  assert.equal(registration.manifest.authority.executionInterface, false);
  assert.equal(registration.certificationProfile, 'zeknova-parity-r0');
});

test('ZekNova observations preserve exact 592-feature faction-private surface', async () => {
  const registration = await zeknova();
  const state = registration.adapter.initialState(23n);
  const forest = registration.adapter.observe(state, 'forest');
  const desert = registration.adapter.observe(state, 'desert');
  assert.equal(forest.features.length, 592);
  assert.equal(desert.features.length, 592);
  assert.notEqual(sha256(forest.features), sha256(desert.features));
  assert.equal(forest.metadata.factionPrivate, true);
});

test('ZekNova legal surface is the six Stage 1A-Z actions with canonical target slots', async () => {
  const registration = await zeknova();
  const state = registration.adapter.initialState(23n);
  const actions = registration.adapter.legalActions(state, 'forest');
  assert.equal(actions.length, 6);
  assert.deepEqual(actions.map((entry) => entry.actionId), [
    'zeknova.stage1az/stabilize',
    'zeknova.stage1az/scout_region',
    'zeknova.stage1az/intercept_contact',
    'zeknova.stage1az/fortify_known_route',
    'zeknova.stage1az/repair_known_structure',
    'zeknova.stage1az/share_intelligence',
  ]);
  assert.equal(new Set(actions.map((entry) => entry.target.slot)).size, 6);
  assert.equal(new Set(actions.map(actionKey)).size, 6);
});

test('ZekNova Prime recommendation remains deterministic and evaluation-only', async () => {
  const registration = await zeknova();
  const state = registration.adapter.initialState(23n);
  const first = recommend({ adapter: registration.adapter, state, observerId: 'forest', simulations: 96, seed: 99n, cPuct: 1.25 });
  const second = recommend({ adapter: registration.adapter, state, observerId: 'forest', simulations: 96, seed: 99n, cPuct: 1.25 });
  assert.equal(first.recommendationHash, second.recommendationHash);
  assert.equal(first.authority.tier, 'R0');
  assert.equal(first.authority.canDispatch, false);
  assert.equal(first.authority.canMutateLiveWorld, false);
});

test('ZekNova behavioral parity report passes every frozen fixture', async () => {
  const parity = await loadZekNovaBehavioralParity();
  assert.equal(parity.report.pass, true);
  assert.equal(parity.fixtures.length, 6);
  assert.equal(parity.report.fixtureResults.every((entry) => entry.pass), true);
  assert.equal(parity.report.certification.observationFeatureCount, 592);
  assert.equal(parity.report.certification.actionCount, 6);
});

test('ZekNova frozen parity baseline is immutable and self-hashing', async () => {
  const baseline = JSON.parse(await readFile(path.join(root, 'parity/zeknova-stage1az/legacy-baseline.json'), 'utf8'));
  const { baselineHash, ...payload } = baseline;
  assert.equal(sha256(payload), baselineHash);
  assert.equal(baseline.fixtureCount, 6);
});
