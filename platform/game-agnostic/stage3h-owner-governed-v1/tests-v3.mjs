// Tests for O-2R.1 (identity-view-v2 / connector-v3 / campaign-v3). node --test tests-v3.mjs. Development worlds only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { identityViewTwin } from './identity-view.mjs';
import { identityViewTwinV2 } from './identity-view-v2.mjs';
import { nativeRowV2 } from './connector-v2.mjs';
import { nativeRowV3, CONNECTOR_V3_ID } from './connector-v3.mjs';
import { CONNECTOR_V2_ID } from './connector-v2.mjs';
import { runReplicationV3, preflight } from './campaign-v3.mjs';
import { registrationHash } from './campaign.mjs';
import { GA, LANE } from './inherit.mjs';

const dev = openCombos().map(({ panel, ...c }) => c), pick = (n) => [...dev.filter((c) => c.horizonBand === 'H0').slice(0, n / 2), ...dev.filter((c) => c.horizonBand === 'H2').slice(0, n / 2)];
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const strings = (x, o = []) => { if (typeof x === 'string') o.push(x); else if (Array.isArray(x)) x.forEach((v) => strings(v, o)); else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, o)); return o; };

test('files bound by rejected candidates 18ff522c and e70625d1 are byte-identical', () => {
  for (const f of ['REGISTRATION_CANDIDATE.json', 'REGISTRATION_CANDIDATE_V2.json']) {
    const c = JSON.parse(readFileSync(resolve(LANE, 'registration', f), 'utf8'));
    for (const [p, h] of Object.entries(c.bindings.sources)) assert.equal(sha(resolve(GA, p)), h, f + ':' + p);
  }
});

test('negative control: the e70625d1 transform leaks original handles; the O-2R.1 transform leaks none and keeps semantics consistent', () => {
  for (const c of pick(6)) {
    const view = observableView(runCalibratedWarmup(c.seed, (w) => generateScenarioSymmetricV1({ ...c, warmupTicks: w })).world), handles = new Set(view.surface.map((e) => e.actionId));
    assert.ok(strings(identityViewTwin(view).view).some((s) => handles.has(s)), 'old transform must be caught');
    const o = identityViewTwinV2(view);
    assert.ok(!strings(o.view).some((s) => handles.has(s)));
    assert.ok(o.view.semantics.every((s, i) => s.ACTION_ID === o.view.surface[i].actionId));
  }
});

test('V3 rows equal V2 rows in every decision, truth, metric, D4 and ORDER value; only the IDENTITY twin view differs', () => {
  for (const c of pick(8)) {
    const a = nativeRowV2({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set() }), b = nativeRowV3({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set() });
    for (const k of ['id', 'band', 'regime', 'selections', 'menu', 'truth', 'metrics', 'introductionB', 'introductionN']) assert.deepEqual(b.row[k], a.row[k], k);
    assert.deepEqual(b.row.nuisance.D4, a.row.nuisance.D4); assert.deepEqual(b.row.nuisance.ORDER, a.row.nuisance.ORDER);
    assert.equal(b.row.nuisanceModes.IDENTITY, 'STAGE3H_IDENTITY_OBSERVATION_ONLY_O2R1_V1');
  }
});

test('O-5 preflight is fail-closed and runs before the replication directory is created', () => {
  assert.throws(() => preflight({ maxLoadFractionOfCores: -1, devLocks: 1, lockP99MaxMs: 250, lockMaxMs: 500 }), /PREFLIGHT_LOAD_TOO_HIGH/);
  const src = readFileSync(resolve(LANE, 'campaign-v3.mjs'), 'utf8'), body = src.slice(src.indexOf('export function runReplicationV3'));
  assert.ok(body.indexOf('preflight(preflightLimits)') > 0 && body.indexOf('preflight(preflightLimits)') < body.indexOf('mkdirSync(out'));
  assert.ok(readFileSync(resolve(LANE, 'connector.mjs'), 'utf8').includes('ok(elapsedMs <= 1000 && baseline.modelHash === S0_HASH'), 'frozen 1,000 ms lock limit unchanged');
  assert.ok(!/elapsedMs <= \d/.test(src), 'campaign-v3 does not redefine the policy limit');
});

test('V3 runner refuses without an active V3 registration and refuses registrations for other connectors', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 's3h-v3-')), reg = resolve(dir, 'reg.json'), auth = resolve(dir, 'auth.json');
  assert.throws(() => runReplicationV3('A', { registrationPath: reg, authorizationPath: auth }), /NO_ACTIVE_REGISTRATION/);
  const pending = { status: 'REGISTRATION_PENDING_OWNER_APPROVAL', reviewMode: 'OWNER_GOVERNED', independentMethodReview: false, connector: CONNECTOR_V2_ID };
  writeFileSync(reg, JSON.stringify({ ...pending, registrationHash: registrationHash(pending) }));
  assert.throws(() => runReplicationV3('A', { registrationPath: reg, authorizationPath: auth }), /REGISTRATION_NOT_ACTIVE_OWNER_GOVERNED/);
  assert.notEqual(CONNECTOR_V3_ID, CONNECTOR_V2_ID);
});
