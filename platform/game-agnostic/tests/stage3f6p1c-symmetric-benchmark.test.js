import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildRecordV2 } from '../src/forge/record-v2.js';
import { forgeActionKey, hashWorld, legalActions, step } from '../src/forge/kernel.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { transformCell, transformDirection } from '../src/stage3f/forge-symmetry-transform-v1.js';
import {
  INVERSE_ORIENTATION, ORIENTATIONS, OrientationError, TRANSFORM_EQUIVALENT, canonicalOrientation, orientAction, orientCell, orientDirection, orientWorld,
} from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { nearestHostile, symmetricLegalActions, toKernelAction } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import { evaluateCounterfactualsSymmetricV1, greedySafeSymmetricV1 } from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID, generateScenarioSymmetricV1, orientationForScenario } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { STAGE3F6P1C_PLAN, STAGE3F6P1C_PLAN_HASH } from '../scripts/stage3f6p1c-analysis-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (r) => path.join(root, r);
const text = (r) => readFileSync(at(r), 'utf8');
const json = (r) => JSON.parse(text(r));
const hex = (v) => createHash('sha256').update(v).digest('hex');
const headHash = (r) => { const g = spawnSync('git', ['-C', path.resolve(root, '..', '..'), 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const OUT = 'artifacts/stage3f6p1c-symmetric-benchmark';
const manifest = json(`${OUT}/symmetric-dev-evidence-manifest.json`);
const evidence = gunzipSync(readFileSync(at(`${OUT}/symmetric-dev-evidence.jsonl.gz`))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const devCorpus = gunzipSync(readFileSync(at('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8').split('\n').filter(Boolean)
  .map((l) => JSON.parse(l)).filter((r) => r.partition === 'DEV');
const TRANSFORMS = STAGE3F6P1C_PLAN.transformsTested;
const buildSymmetric = (combination) => {
  const warmup = runCalibratedWarmup(combination.seed, (warmupTicks) => generateScenarioSymmetricV1({ ...combination, warmupTicks }));
  return { world: warmup.world, horizon: Math.max(1, warmup.scenarioConfig.horizon), config: warmup.scenarioConfig };
};
const SAMPLE = [
  { shape: 'mesh', roles: 'defended', objectives: 'supply_and_defend', horizonBand: 'H2', level: 3, seed: 1001 },
  { shape: 'ring', roles: 'populated', objectives: 'protect_civilians', horizonBand: 'H1', level: 2, seed: 1002 },
  { shape: 'tree', roles: 'scarce', objectives: 'restore_and_protect', horizonBand: 'H3', level: 4, seed: 1003 },
];

test('1. Forge V1 sources are byte-identical to HEAD', () => {
  for (const f of ['src/forge/scenarios-v2.js', 'src/forge/scenarios-v3.js', 'src/forge/kernel.js', 'src/forge/counterfactual-v2.js', 'src/forge/record-v2.js',
    'src/forge/reward-v2.js', 'src/forge/warmup.js', 'src/forge/topology.js', 'src/forge/adapter.js', 'src/forge/contract.js']) assert.equal(hex(readFileSync(at(f))), headHash(f), f);
});

test('2. historical corpus records still reproduce exactly', () => {
  for (const row of devCorpus.slice(0, 5)) {
    const c = row.combination;
    const built = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
    assert.equal(built.admitted, true);
    assert.equal(built.record.recordHash, row.recordHash);
  }
  const git = spawnSync('git', ['-C', path.resolve(root, '..', '..'), 'status', '--porcelain', '--',
    'platform/game-agnostic/artifacts/stage3f6c-deployable-router', 'platform/game-agnostic/artifacts/stage3f6p1b-directional-symmetry'], { encoding: 'utf8' });
  assert.equal(git.stdout.trim(), '');
});

test('3. the symmetric generator is deterministic and seed-bound', () => {
  for (const c of SAMPLE) {
    const a = generateScenarioSymmetricV1(c); const b = generateScenarioSymmetricV1({ ...c });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(a.orientation, orientationForScenario(a.scenarioSeed));
    assert.equal(a.generatorId, FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID);
    assert.ok(ORIENTATIONS.includes(a.orientation));
  }
});

test('4. the symmetric oracle is deterministic', () => {
  for (const c of SAMPLE.slice(0, 2)) {
    const { world, horizon } = buildSymmetric(c);
    const a = evaluateCounterfactualsSymmetricV1(world, { horizon });
    const b = evaluateCounterfactualsSymmetricV1(structuredClone(world), { horizon });
    assert.equal(JSON.stringify(a.branches.map((x) => [x.actionKey, x.totalScalar])), JSON.stringify(b.branches.map((x) => [x.actionKey, x.totalScalar])));
    assert.deepEqual(a.optimalActionKeys, b.optimalActionKeys);
  }
});

test('5. seed replay is deterministic end to end', () => {
  const c = SAMPLE[0];
  const first = buildSymmetric(c); const second = buildSymmetric(c);
  assert.equal(hashWorld(first.world), hashWorld(second.world));
  assert.equal(JSON.stringify(greedySafeSymmetricV1(first.world, { horizon: first.horizon })), JSON.stringify(greedySafeSymmetricV1(second.world, { horizon: second.horizon })));
});

test('6. no wall-clock or ambient randomness in the new benchmark', () => {
  for (const f of ['src/forge-symmetric/scenarios-symmetric-v1.js', 'src/forge-symmetric/orientation-symmetric-v1.js', 'src/forge-symmetric/action-surface-symmetric-v1.js', 'src/forge-symmetric/counterfactual-symmetric-v1.js']) {
    const code = text(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/Math\.random|Date\.now|new Date|process\.hrtime|performance\.now/.test(code), false, f);
  }
});

test('7. placement orientation is balanced and the EAST-first effect is gone', () => {
  const withMaterial = evidence.filter((r) => r.materialDirection !== null);
  const share = (d) => withMaterial.filter((r) => r.materialDirection === d).length / withMaterial.length;
  for (const d of ['EAST', 'NORTH', 'SOUTH', 'WEST']) assert.ok(share(d) <= STAGE3F6P1C_PLAN.directionBalance.materialPlacementMaxShare, `${d} ${share(d)}`);
  assert.ok(share('EAST') < 0.78 / 2, 'the historical 78% EAST adjacency is eliminated');
  const orientations = new Set(evidence.map((r) => r.orientation));
  assert.equal(orientations.size, ORIENTATIONS.length, 'every orientation occurs');
});

test('8. orientation round-trip, group agreement with the certified transform, and fail-closed behaviour', () => {
  const dims = { width: 9, height: 9 };
  for (const o of ORIENTATIONS) {
    for (let x = 0; x < 9; x += 1) for (let y = 0; y < 9; y += 1) {
      assert.deepEqual(orientCell(INVERSE_ORIENTATION[o], orientCell(o, { x, y }, 9), 9), { x, y });
    }
  }
  for (const [transform, orientation] of Object.entries(TRANSFORM_EQUIVALENT)) {
    for (const d of ['NORTH', 'EAST', 'SOUTH', 'WEST']) assert.equal(orientDirection(orientation, d), transformDirection(transform, d), `${transform}/${d}`);
    for (let x = 0; x < 9; x += 1) for (let y = 0; y < 9; y += 1) {
      assert.deepEqual(orientCell(orientation, { x, y }, 9), transformCell(transform, { x, y }, dims), `${transform} cell`);
    }
  }
  assert.throws(() => orientDirection('R90', 'UP'), OrientationError);
  assert.throws(() => orientCell('NOPE', { x: 0, y: 0 }, 9), OrientationError);
  const { world } = buildSymmetric(SAMPLE[0]);
  assert.throws(() => orientWorld('R90', { ...world, grid: { ...world.grid, width: world.grid.width + 1 } }), OrientationError);
});

test('9. legal surface equivariance, and the symmetric surface covers the kernel surface exactly', () => {
  for (const c of SAMPLE) {
    const { world } = buildSymmetric(c);
    const size = world.grid.width;
    const base = symmetricLegalActions(world);
    for (const transform of TRANSFORMS) {
      const orientation = TRANSFORM_EQUIVALENT[transform];
      const mapped = new Set(base.map((a) => forgeActionKey(orientAction(orientation, a, size))));
      const actual = new Set(symmetricLegalActions(orientWorld(orientation, world)).map((a) => forgeActionKey(a)));
      assert.equal(mapped.size, actual.size, transform);
      for (const k of mapped) assert.ok(actual.has(k), `${transform} missing ${k}`);
    }
    const symStates = new Set(base.map((a) => hashWorld(step(world, toKernelAction(world, a)).state)));
    const kernelStates = new Set(legalActions(world).map((a) => hashWorld(step(world, a).state)));
    assert.equal(symStates.size, kernelStates.size);
    for (const s of kernelStates) assert.ok(symStates.has(s), 'symmetric surface reaches every kernel successor state');
  }
  assert.ok(evidence.every((r) => r.successorCoverage === 1));
});

test('10. optimal-set equivariance holds on the whole fresh sample', () => {
  for (const transform of TRANSFORMS) {
    const scored = evidence.filter((r) => r.canonicalFrameDigestTied === 0 && r.transforms[transform].canonicalFrameDigestTiedT === 0);
    assert.ok(scored.length > 1000);
    assert.equal(scored.every((r) => r.transforms[transform].optimalEquivariant === 1), true, transform);
  }
});

test('11. regret equivariance holds on the whole fresh sample', () => {
  for (const transform of TRANSFORMS) {
    const scored = evidence.filter((r) => r.canonicalFrameDigestTied === 0 && r.transforms[transform].canonicalFrameDigestTiedT === 0);
    assert.equal(scored.every((r) => r.transforms[transform].regretMismatches === 0), true, transform);
    assert.ok(scored.reduce((s, r) => s + r.transforms[transform].regretCompared, 0) > 5000);
  }
});

test('12. symmetric GREEDY_SAFE equivariance', () => {
  for (const transform of TRANSFORMS) {
    const scored = evidence.filter((r) => r.canonicalFrameDigestTied === 0 && r.transforms[transform].canonicalFrameDigestTiedT === 0);
    assert.equal(scored.every((r) => r.transforms[transform].labelEquivariant === 1), true, transform);
  }
  const { world, horizon } = buildSymmetric(SAMPLE[1]);
  const label = greedySafeSymmetricV1(world, { horizon });
  assert.equal(label.labelId, 'FORGE_GREEDY_SAFE_SYMMETRIC_V1');
  for (const transform of TRANSFORMS) {
    const t = greedySafeSymmetricV1(orientWorld(TRANSFORM_EQUIVALENT[transform], world), { horizon });
    assert.equal(t.greedySafe, label.greedySafe); assert.equal(t.greedyRegret, label.greedyRegret); assert.equal(t.horizonClass, label.horizonClass);
  }
});

test('13. RETREAT is equivariant and never uses an axis preference', () => {
  const rows = evidence.filter((r) => TRANSFORMS.every((t) => r.transforms[t].retreatEquivariant !== null));
  assert.ok(rows.length > 100, `retreat rows ${rows.length}`);
  for (const transform of TRANSFORMS) assert.equal(rows.every((r) => r.transforms[transform].retreatEquivariant === 1), true, transform);
  const code = text('src/forge-symmetric/action-surface-symmetric-v1.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  assert.equal(/dx !== 0 \? dx : 0|dx !== 0 \? 0 : dy/.test(code), false, 'no x-before-y rule');
  const { world } = buildSymmetric(SAMPLE[0]);
  if (nearestHostile(world) !== null) {
    const retreat = symmetricLegalActions(world).find((a) => a.actionType === 'RETREAT');
    assert.ok(retreat, 'a hostile world offers RETREAT');
    assert.equal(toKernelAction(world, retreat).actionType, 'MOVE', 'RETREAT executes as the equivalent MOVE');
  }
});

test('14. action identity is preserved and separate from tie-break order', () => {
  const { world, horizon } = buildSymmetric(SAMPLE[0]);
  const evaluation = evaluateCounterfactualsSymmetricV1(world, { horizon });
  for (const branch of evaluation.branches) assert.equal(branch.actionKey, forgeActionKey(branch.action), 'identity is still the frozen forgeActionKey');
  const canonical = canonicalOrientation(world);
  assert.ok(ORIENTATIONS.includes(canonical.orientation));
  const differs = evaluation.branches.some((b) => b.actionKey !== b.canonicalKey);
  assert.equal(differs || canonical.orientation === 'R0', true, 'tie-break order is the canonical-frame key, not the raw identity');
});

test('15. no fixed direction and no lowest-identity move keeps an unexplained advantage', () => {
  const moveOptimal = evidence.filter((r) => r.moveOptimalRow === 1);
  const fixed = ['EAST', 'NORTH', 'SOUTH', 'WEST'].map((d) => {
    const legal = moveOptimal.filter((r) => r.directionLegal[d] === 1);
    return legal.filter((r) => r.directionOptimal[d] === 1).length / legal.length;
  });
  assert.ok(Math.max(...fixed) - Math.min(...fixed) <= STAGE3F6P1C_PLAN.directionBalance.fixedBaselineSpread, `spread ${Math.max(...fixed) - Math.min(...fixed)}`);
  const lowest = moveOptimal.filter((r) => r.lowestIdentityMove !== null);
  const lowestAccuracy = lowest.filter((r) => r.lowestIdentityMove.optimal === 1).length / lowest.length;
  const random = lowest.reduce((s, r) => s + r.randomMoveExpectedAccuracy, 0) / lowest.length;
  assert.ok(Math.abs(lowestAccuracy - random) <= STAGE3F6P1C_PLAN.directionBalance.lowestIdVersusRandomMax, `lowest ${lowestAccuracy} random ${random}`);
});

test('16/17. policies are read-only diagnostics and unchanged', () => {
  for (const f of ['src/lab/stage3c-learned-nexus.js', 'src/stage3f/deployable-action-proposal-v1.js', 'src/stage3f/nexus-selector-v2-candidate.js',
    'src/stage3f/policy-router-v1.js']) assert.equal(hex(readFileSync(at(f))), headHash(f), f);
  const code = text('scripts/generate-stage3f6p1c-symmetric-evidence.mjs') + text('scripts/certify-stage3f6p1c-symmetric-benchmark.mjs');
  assert.equal(/fitPolicyRouter\(|fitLogisticRegression\(|train\(/.test(code), false);
  assert.ok(evidence.every((r) => 'policies' in r));
});

test('18. no Sentinel architecture change and no corpus generation', () => {
  const git = spawnSync('git', ['-C', path.resolve(root, '..', '..'), 'status', '--porcelain', '--',
    'platform/game-agnostic/src/stage3f', 'platform/game-agnostic/src/core', 'platform/game-agnostic/src/experts', 'platform/game-agnostic/src/prime'], { encoding: 'utf8' });
  assert.equal(git.stdout.trim(), '', 'no Sentinel-side source is modified');
  assert.equal(manifest.partition, 'FRESH_DEV_DIAGNOSTIC');
  assert.equal(manifest.historicalCorporaRead, false);
});

test('19. the plan was fixed before the evidence', () => {
  assert.equal(manifest.planHash, STAGE3F6P1C_PLAN_HASH);
  assert.equal(json(`${OUT}/stage3f6p1c-analysis-plan.json`).planHash, STAGE3F6P1C_PLAN_HASH);
  assert.equal(manifest.admitted, evidence.length);
  assert.ok(evidence.every((r) => [1001, 1002, 1003, 1011].includes(r.combination.seed)), 'fresh seed space only');
});

test('20. authority stays R0 with no online learning', () => {
  assert.deepEqual({ ...STAGE3F6P1C_PLAN.authority }, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
  assert.match(text('scripts/certify-stage3f6p1c-symmetric-benchmark.mjs'), /READY_FOR_STAGE3G: false/);
});
