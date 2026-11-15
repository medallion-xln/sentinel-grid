// Tests for the proposed O-2R correction (connector-v2 / campaign-v2). node --test tests-v2.mjs
// Development worlds only. Also proves candidate 18ff522c's bound files are untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { hashWorld } from '../src/forge/kernel.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { nativeRow } from './connector.mjs';
import { nativeRowV2, CONNECTOR_V2_ID } from './connector-v2.mjs';
import { identityViewTwin } from './identity-view.mjs';
import { runReplicationV2 } from './campaign-v2.mjs';
import { registrationHash } from './campaign.mjs';
import { GA, LANE } from './inherit.mjs';

const dev = openCombos().map(({ panel, ...c }) => c);
const pick = (n) => [...dev.filter((c) => c.horizonBand === 'H0').slice(0, n / 2), ...dev.filter((c) => c.horizonBand === 'H2').slice(0, n / 2)];

test('candidate 18ff522c bound files are byte-identical (V1 identity preserved)', () => {
  const c = JSON.parse(readFileSync(resolve(LANE, 'registration/REGISTRATION_CANDIDATE.json'), 'utf8'));
  for (const [f, h] of Object.entries(c.bindings.sources)) assert.equal(createHash('sha256').update(readFileSync(resolve(GA, f))).digest('hex'), h, f);
});

test('V2 rows equal V1 rows in selections, metrics, introductions and ledger; only nuisance differs', () => {
  for (const c of pick(8)) {
    const a = nativeRow({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set() }), b = nativeRowV2({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set() });
    for (const k of ['id', 'cell', 'band', 'regime', 'selections', 'menu', 'truth', 'metrics', 'introductionB', 'introductionN', 'decisionsHash']) assert.deepEqual(b.row[k], a.row[k], k);
    assert.deepEqual(b.ledger, a.ledger);
    assert.deepEqual(b.row.nuisance.D4, a.row.nuisance.D4, 'D4 unchanged'); assert.deepEqual(b.row.nuisance.ORDER, a.row.nuisance.ORDER, 'ORDER unchanged');
  }
});

test('O-2R identity twin is observation-only: world untouched, legal, bijective, retreat preserved, V3 nuisance passes', () => {
  for (const c of pick(8)) {
    const warm = runCalibratedWarmup(c.seed, (w) => generateScenarioSymmetricV1({ ...c, warmupTicks: w })), world = warm.world, before = hashWorld(world), view = observableView(world);
    const o = identityViewTwin(view);
    assert.equal(hashWorld(world), before);
    const vals = Object.values(o.actionMap); assert.equal(new Set(vals).size, view.surface.length);
    const r0 = view.surface.find((e) => e.actionType === 'RETREAT'), r1 = o.view.surface.find((e) => e.actionType === 'RETREAT');
    if (r0) { assert.equal(r1.actionId, o.actionMap[r0.actionId]); assert.deepEqual(r1.action.parameters, r0.action.parameters); }
    const r = nativeRowV2({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set() });
    assert.equal(r.row.nuisanceModes.IDENTITY, 'STAGE3H_IDENTITY_OBSERVATION_ONLY_O2R_V1');
    assert.ok(['D4', 'IDENTITY', 'ORDER'].every((k) => Number.isFinite(r.row.nuisance[k].RB)));
  }
});

test('V2 runner refuses without an active V2 registration, and refuses a registration not built for connector V2', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 's3h-v2-')), reg = resolve(dir, 'reg.json'), auth = resolve(dir, 'auth.json');
  assert.throws(() => runReplicationV2('A', { registrationPath: reg, authorizationPath: auth }), /NO_ACTIVE_REGISTRATION/);
  const pending = { status: 'REGISTRATION_PENDING_OWNER_APPROVAL', reviewMode: 'OWNER_GOVERNED', independentMethodReview: false, connector: CONNECTOR_V2_ID };
  writeFileSync(reg, JSON.stringify({ ...pending, registrationHash: registrationHash(pending) }));
  assert.throws(() => runReplicationV2('A', { registrationPath: reg, authorizationPath: auth }), /REGISTRATION_NOT_ACTIVE_OWNER_GOVERNED/);
});
