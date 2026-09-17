import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildRecordV2 } from '../src/forge/record-v2.js';
import { evaluateCounterfactualsV2 } from '../src/forge/counterfactual-v2.js';
import { forgeActionKey, legalActions } from '../src/forge/kernel.js';
import {
  FORGE_SYMMETRY_TRANSFORM_CONTRACT, INVERSE_TRANSFORM, SYMMETRY_TRANSFORM_IDS, SymmetryTransformError, transformAction, transformCell, transformDirection, transformWorld,
} from '../src/stage3f/forge-symmetry-transform-v1.js';
import { replicaScalars } from '../scripts/generate-stage3f6p1b-symmetry-evidence.mjs';
import { STAGE3F6P1B_PLAN, STAGE3F6P1B_PLAN_HASH } from '../scripts/stage3f6p1b-analysis-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (r) => path.join(root, r);
const text = (r) => readFileSync(at(r), 'utf8');
const json = (r) => JSON.parse(text(r));
const hex = (v) => createHash('sha256').update(v).digest('hex');
const headHash = (r) => { const g = spawnSync('git', ['-C', path.resolve(root, '..', '..'), 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const OUT = 'artifacts/stage3f6p1b-directional-symmetry';
const manifest = json(`${OUT}/symmetry-evidence-dev-manifest.json`);
const evidence = gunzipSync(readFileSync(at(`${OUT}/symmetry-evidence-dev.jsonl.gz`))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const devCorpus = gunzipSync(readFileSync(at('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8').split('\n').filter(Boolean)
  .map((l) => JSON.parse(l)).filter((r) => r.partition === 'DEV');
const build = (row) => { const c = row.combination; return buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood); };
const keysOf = (world) => new Set(legalActions(world).map((a) => forgeActionKey(a)));
const K16 = (k) => k.slice(0, 16);

test('1. predecessor certifications are intact', () => {
  assert.equal(json('artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json').certificationHash, '3cd670113c2ffd3ad40e1113b77d492943b226bfcdb1730c3b60a15de679a585');
  assert.equal(json('artifacts/stage3f6p1-nexus-remediation/stage3f6p1-certification-result.json').certificationHash, '48462a169c88337a9f27315c3e10b83f615e077a8ba2dc6751fdf437351d31e4');
  assert.equal(json('artifacts/stage3f6p1a-nexus-spatial/stage3f6p1a-certification-result.json').certificationHash, 'c4029ff96e617341b448ae5d4f1853f6d21186134a64ce6162acc755394f40be');
});

test('2. Forge generators, kernel, oracle and policies are byte-identical to HEAD', () => {
  for (const f of ['src/forge/scenarios-v2.js', 'src/forge/scenarios-v3.js', 'src/forge/kernel.js', 'src/forge/counterfactual-v2.js', 'src/forge/record-v2.js',
    'src/forge/reward-v2.js', 'src/forge/warmup.js', 'src/forge/topology.js', 'src/lab/stage3c-learned-nexus.js', 'src/stage3f/nexus-selector-v2-candidate.js',
    'src/stage3f/deployable-action-proposal-v1.js']) assert.equal(hex(readFileSync(at(f))), headHash(f), f);
});

test('3. historical corpora and evidence are untouched', () => {
  const git = spawnSync('git', ['-C', path.resolve(root, '..', '..'), 'status', '--porcelain', '--', ...['artifacts/stage3f6c-deployable-router', 'artifacts/stage3f6p-policy-quality',
    'artifacts/stage3f6p1-nexus-remediation', 'artifacts/stage3f6p1a-nexus-spatial', 'artifacts/stage3e-routability-intelligence'].map((p) => `platform/game-agnostic/${p}`)], { encoding: 'utf8' });
  assert.equal(git.stdout.trim(), '');
  const spatial = gunzipSync(readFileSync(at('artifacts/stage3f6p1a-nexus-spatial/spatial-evidence-dev.jsonl.gz'))).toString('utf8');
  assert.equal(hex(spatial), '98b5671241a44d301b17ad2275d31dd363467cb2beb01e6ae16623342758e9b5');
});

test('4. MOVE identity: key order is EAST < SOUTH < WEST < NORTH and depends only on the direction', () => {
  const key = (d, actorId = 'actor') => forgeActionKey({ actionType: 'MOVE', actorId, target: null, parameters: { direction: d } });
  assert.deepEqual(['NORTH', 'EAST', 'SOUTH', 'WEST'].sort((a, b) => (key(a) < key(b) ? -1 : 1)), ['EAST', 'SOUTH', 'WEST', 'NORTH']);
  const world = build(devCorpus[0]).world;
  const moves = legalActions(world).filter((a) => a.actionType === 'MOVE');
  for (const m of moves) assert.equal(forgeActionKey(m), key(m.parameters.direction));
  assert.notEqual(key('EAST', 'someone-else'), key('EAST'));
});

test('5. transform algebra: inverses, involutions, four rotations are the identity, directions are bijective', () => {
  const dims = { width: 7, height: 7 };
  for (const t of SYMMETRY_TRANSFORM_IDS) {
    const mapped = ['NORTH', 'EAST', 'SOUTH', 'WEST'].map((d) => transformDirection(t, d));
    assert.equal(new Set(mapped).size, 4, `${t} direction map is bijective`);
    for (let x = 0; x < 7; x += 1) for (let y = 0; y < 7; y += 1) {
      const back = transformCell(INVERSE_TRANSFORM[t], transformCell(t, { x, y }, dims), dims);
      assert.deepEqual(back, { x, y });
    }
  }
  let d = 'EAST'; for (let i = 0; i < 4; i += 1) d = transformDirection('ROTATE_90', d); assert.equal(d, 'EAST');
  assert.equal(transformDirection('ROTATE_90', 'EAST'), 'SOUTH'); assert.equal(transformDirection('REFLECT_X', 'EAST'), 'WEST'); assert.equal(transformDirection('REFLECT_Y', 'EAST'), 'EAST');
  const world = build(devCorpus[1]).world;
  for (const t of SYMMETRY_TRANSFORM_IDS) {
    const round = transformWorld(INVERSE_TRANSFORM[t], transformWorld(t, world));
    assert.equal(JSON.stringify(round), JSON.stringify(world), `${t} then inverse restores the world`);
  }
});

test('6. transforms fail closed', () => {
  const world = build(devCorpus[2]).world;
  const rect = { ...world, grid: { ...world.grid, width: world.grid.width + 1, cells: new Array((world.grid.width + 1) * world.grid.height).fill(0) } };
  assert.throws(() => transformWorld('ROTATE_90', rect), SymmetryTransformError);
  assert.throws(() => transformWorld('ROTATE_TWICE', world), SymmetryTransformError);
  assert.throws(() => transformDirection('REFLECT_X', 'UP'), SymmetryTransformError);
  assert.throws(() => transformWorld('REFLECT_X', { ...world, hazards: [{ x: 1, y: 1 }] }), SymmetryTransformError);
  assert.equal(FORGE_SYMMETRY_TRANSFORM_CONTRACT.diagnosticOnly, true); assert.equal(FORGE_SYMMETRY_TRANSFORM_CONTRACT.deployable, false);
});

test('7. transforms never mutate the source world', () => {
  const world = build(devCorpus[3]).world; const before = JSON.stringify(world);
  for (const t of SYMMETRY_TRANSFORM_IDS) transformWorld(t, world);
  assert.equal(JSON.stringify(world), before);
});

test('8. legal surface is equivariant without hostiles; RETREAT is the kernel axis asymmetry under 90-degree rotations', () => {
  const calm = devCorpus.find((r) => r.combination.roles === 'bare');
  const world = build(calm).world; const dims = world.grid;
  for (const t of SYMMETRY_TRANSFORM_IDS) {
    const mapped = new Set(legalActions(world).map((a) => forgeActionKey(transformAction(t, a, dims))));
    const actual = keysOf(transformWorld(t, world));
    assert.equal(mapped.size, actual.size); for (const k of mapped) assert.ok(actual.has(k), t);
  }
  const mismatchTypes = new Set(evidence.flatMap((r) => ['ROTATE_90', 'ROTATE_270'].flatMap((t) => [...r.transforms[t].legalMissingTypes, ...r.transforms[t].legalExtraTypes])));
  assert.deepEqual([...mismatchTypes], ['RETREAT']);
  for (const t of ['ROTATE_180', 'REFLECT_X', 'REFLECT_Y']) assert.ok(evidence.every((r) => r.transforms[t].legalEquivariant));
});

test('9. IDENTITY control reproduces every certified record and corpus label', () => {
  assert.ok(evidence.every((r) => r.transforms.IDENTITY.optimalSetEquivariant && r.transforms.IDENTITY.regretMismatches === 0 && r.transforms.IDENTITY.legalEquivariant));
  assert.ok(evidence.every((r) => r.greedySafeMatchesCorpus === 1));
});

test('10. the replica oracle reproduces the official oracle exactly', () => {
  for (const row of devCorpus.slice(0, 3)) {
    const built = build(row);
    const official = evaluateCounterfactualsV2(built.world, { horizon: built.horizonLength });
    const replica = replicaScalars(built.world, built.horizonLength, forgeActionKey);
    for (const b of official.branches) assert.equal(replica.get(K16(b.actionKey)), b.totalScalar);
  }
  assert.ok(evidence.filter((r) => r.replicaFidelityW !== null).every((r) => r.replicaFidelityW === true));
  assert.ok(evidence.every((r) => Object.values(r.transforms).every((t) => t.replicaFidelityT === null || t.replicaFidelityT === true || t.valid === false)));
});

test('11. the transform is diagnostic only: nothing in src imports it', () => {
  const grep = spawnSync('grep', ['-rl', 'forge-symmetry-transform-v1', 'src'], { cwd: root, encoding: 'utf8' });
  assert.equal(grep.stdout.trim(), '', 'no source file references the diagnostic transform module');
});

test('12. the analysis plan was fixed before the evidence', () => {
  assert.equal(manifest.planHash, STAGE3F6P1B_PLAN_HASH);
  assert.equal(json(`${OUT}/stage3f6p1b-analysis-plan.json`).planHash, STAGE3F6P1B_PLAN_HASH);
  assert.equal(manifest.evaluated, 4000); assert.equal(manifest.rebuildMismatches, 0);
});

test('13. DEV only: no sealed partition is read', () => {
  assert.equal(manifest.partition, 'DEV');
  assert.match(text('scripts/generate-stage3f6p1b-symmetry-evidence.mjs'), /filter\(\(r\) => r\.partition === 'DEV'\)/);
  const certifier = text('scripts/certify-stage3f6p1b-directional-symmetry.mjs');
  assert.equal(/confirmatory-holdout-ood|spatial-evidence-cal|nexus-evidence-cal/.test(certifier), false);
});

test('14. action mapping: MOVE directions and RETREAT destinations move with the grid', () => {
  const dims = { width: 10, height: 10 };
  assert.equal(transformAction('ROTATE_90', { actionType: 'MOVE', parameters: { direction: 'NORTH' } }, dims).parameters.direction, 'EAST');
  assert.deepEqual(transformAction('ROTATE_90', { actionType: 'RETREAT', parameters: { toX: 2, toY: 3 } }, dims).parameters, { toX: 6, toY: 2 });
  const protect = { actionType: 'PROTECT', target: { kind: 'entity', id: 'n1' }, parameters: {} };
  assert.equal(transformAction('REFLECT_X', protect, dims), protect, 'targeted actions are carried unchanged');
});

test('15. authority stays R0, no online learning, no router training, no policy or generator change', () => {
  assert.deepEqual({ ...STAGE3F6P1B_PLAN.authority }, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
  const code = text('scripts/certify-stage3f6p1b-directional-symmetry.mjs') + text('scripts/generate-stage3f6p1b-symmetry-evidence.mjs') + text('src/stage3f/forge-symmetry-transform-v1.js');
  assert.equal(/fitPolicyRouter\(|fitLogisticRegression\(|onlineLearningEnabled:\s*true|writeFile\([^)]*src\/forge/.test(code), false);
  assert.match(text('scripts/certify-stage3f6p1b-directional-symmetry.mjs'), /READY_FOR_STAGE3G: false/);
});
