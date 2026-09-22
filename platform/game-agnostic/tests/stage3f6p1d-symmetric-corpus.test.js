import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildRecordV2 } from '../src/forge/record-v2.js';
import { DeployableProfile, DEPLOYABLE_FEATURE_CONTRACT_ID, DEPLOYABLE_PROFILES, FeatureValueStatus } from '../src/stage3f/deployable-feature-contract-v1.js';
import { extractDeployableFeatures } from '../src/stage3f/deployable-feature-extractor-v1.js';
import { STAGE3F6P1D_PLAN, STAGE3F6P1D_PLAN_HASH } from '../scripts/stage3f6p1d-corpus-plan.mjs';
import { benchmarkBinding, corpusRecord } from '../scripts/generate-stage3f6p1d-symmetric-corpus.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (r) => path.join(root, r);
const text = (r) => readFileSync(at(r), 'utf8');
const json = (r) => JSON.parse(text(r));
const hex = (v) => createHash('sha256').update(v).digest('hex');
const headHash = (r) => { const g = spawnSync('git', ['-C', path.resolve(root, '..', '..'), 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const OUT = 'artifacts/stage3f6p1d-symmetric-corpus';
const manifest = json(`${OUT}/symmetric-corpus-v1-manifest.json`);
const corpus = gunzipSync(readFileSync(at(`${OUT}/symmetric-corpus-v1.jsonl.gz`))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const PARTITIONS = ['DEV', 'CAL', 'HOLDOUT', 'OOD'];
const DIRECTIONS = ['EAST', 'NORTH', 'SOUTH', 'WEST'];
const ORIENTATIONS = ['R0', 'R90', 'R180', 'R270', 'MX', 'MY', 'MD', 'MA'];
const CORE_IDS = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds;
const part = (p) => corpus.filter((r) => r.partition === p);
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const rate = (list, fn) => (list.length ? list.filter(fn).length / list.length : null);

test('1. Stage 3F.6-P.1C is intact', () => {
  assert.equal(json('artifacts/stage3f6p1c-symmetric-benchmark/stage3f6p1c-certification-result.json').certificationHash,
    '81586cbe068885596d7f8b5c78d6f6d5d72e53425289f850386e0c43ddff702d');
  assert.equal(json('artifacts/stage3f6p1b-directional-symmetry/stage3f6p1b-certification-result.json').certificationHash,
    '120e7649a2912447d149e8a1b4c1a24c6a1af6bd64d5b6b5efd1b6dfe4ddfbdb');
});

test('2. the corpus binds the exact certified benchmark hashes', () => {
  const binding = benchmarkBinding();
  assert.deepEqual(manifest.benchmark, binding);
  assert.equal(binding.BENCHMARK_ID, 'FORGE_SYMMETRIC_V2');
  assert.equal(binding.LABEL_ID, 'FORGE_GREEDY_SAFE_SYMMETRIC_V1');
  assert.equal(manifest.planHash, STAGE3F6P1D_PLAN_HASH);
});

test('3. Forge V1 generator and corpus are unchanged and still reproduce', () => {
  for (const f of ['src/forge/scenarios-v2.js', 'src/forge/scenarios-v3.js', 'src/forge/kernel.js', 'src/forge/counterfactual-v2.js', 'src/forge/record-v2.js']) {
    assert.equal(hex(readFileSync(at(f))), headHash(f), f);
  }
  const v1 = gunzipSync(readFileSync(at('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8');
  assert.equal(hex(v1), json('artifacts/stage3f6c-deployable-router/confirmatory-corpus-manifest.json').contentHash);
  const row = v1.split('\n').filter(Boolean).map((l) => JSON.parse(l))[0];
  const c = row.combination;
  const built = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
  assert.equal(built.record.recordHash, row.recordHash);
});

test('4. the seed space is fresh and partition-disjoint', () => {
  const prior = STAGE3F6P1D_PLAN.seeds.priorConsumed;
  const used = Object.fromEntries(PARTITIONS.map((p) => [p, new Set(part(p).map((r) => r.combination.seed))]));
  for (const p of PARTITIONS) {
    for (const seed of used[p]) {
      assert.equal(prior.includes(seed), false, `seed ${seed} was consumed before`);
      assert.ok(STAGE3F6P1D_PLAN.seeds[p].includes(seed), `seed ${seed} is not declared for ${p}`);
    }
  }
  for (let i = 0; i < PARTITIONS.length; i += 1) for (let j = i + 1; j < PARTITIONS.length; j += 1) {
    const shared = [...used[PARTITIONS[i]]].filter((s) => used[PARTITIONS[j]].has(s));
    assert.deepEqual(shared, [], `${PARTITIONS[i]}/${PARTITIONS[j]}`);
  }
});

test('5/6/7. record, state and topology overlap are zero everywhere', () => {
  for (const field of ['recordHash', 'worldHash', 'topologyHash']) {
    assert.equal(new Set(corpus.map((r) => r[field])).size, corpus.length, `${field} duplicates`);
    for (let i = 0; i < PARTITIONS.length; i += 1) for (let j = i + 1; j < PARTITIONS.length; j += 1) {
      const a = new Set(part(PARTITIONS[i]).map((r) => r[field]));
      assert.equal(part(PARTITIONS[j]).filter((r) => a.has(r[field])).length, 0, `${field} ${PARTITIONS[i]}/${PARTITIONS[j]}`);
    }
  }
});

test('8. orientation distribution is balanced in every partition', () => {
  for (const p of PARTITIONS) {
    const rows = part(p);
    for (const o of ORIENTATIONS) {
      const share = rate(rows, (r) => r.orientation === o);
      assert.ok(Math.abs(share - 1 / 8) <= STAGE3F6P1D_PLAN.symmetryBalance.orientationMaxDeviationFromUniform, `${p}/${o} ${share}`);
    }
  }
});

test('9. no cardinal direction dominates optimality', () => {
  for (const p of PARTITIONS) {
    const rows = part(p);
    const optimalGivenLegal = DIRECTIONS.map((d) => rate(rows.filter((r) => r.directionLegal[d] === 1), (r) => r.directionOptimal[d] === 1));
    const m = mean(optimalGivenLegal);
    assert.ok(Math.max(...optimalGivenLegal.map((v) => Math.abs(v - m))) <= STAGE3F6P1D_PLAN.symmetryBalance.optimalDirectionMaxDeviationFromMean, `${p} ${optimalGivenLegal}`);
    const material = DIRECTIONS.map((d) => rate(rows.filter((r) => r.materialDirection !== null), (r) => r.materialDirection === d));
    assert.ok(Math.max(...material) <= STAGE3F6P1D_PLAN.symmetryBalance.materialDirectionMaxShare, `${p} material ${material}`);
  }
});

test('10. the fixed-direction and lowest-identity shortcuts are absent', () => {
  for (const p of PARTITIONS) {
    const moveOptimal = part(p).filter((r) => r.moveOptimalRow === 1);
    const fixed = DIRECTIONS.map((d) => rate(moveOptimal.filter((r) => r.directionLegal[d] === 1), (r) => r.directionOptimal[d] === 1));
    assert.ok(Math.max(...fixed) - Math.min(...fixed) <= 0.15, `${p} spread ${fixed}`);
    const lowest = rate(moveOptimal.filter((r) => r.lowestIdentityMove !== null), (r) => r.lowestIdentityMove.optimal === 1);
    const random = mean(moveOptimal.map((r) => r.randomMoveExpectedAccuracy).filter((v) => v !== null));
    assert.ok(Math.abs(lowest - random) <= 0.10, `${p} lowest ${lowest} random ${random}`);
  }
});

test('11. the sampled equivariance gate is exactly 1.0', () => {
  let checks = 0;
  for (const p of PARTITIONS) {
    const sampled = part(p).filter((r) => r.equivariance !== null);
    assert.ok(sampled.length >= 50, `${p} sampled ${sampled.length}`);
    for (const row of sampled) {
      for (const [transform, result] of Object.entries(row.equivariance)) {
        checks += 1;
        for (const key of ['legal', 'optimal', 'regret', 'label', 'coreFeatureInvariant']) {
          assert.equal(result[key], 1, `${p} ${transform} ${key} ${row.recordHash.slice(0, 12)}`);
        }
      }
    }
  }
  assert.ok(checks >= 2000, `transform checks ${checks}`);
});

test('12/13. label identity is correct and the distribution is recorded, not manipulated', () => {
  for (const p of PARTITIONS) {
    const rows = part(p);
    assert.ok(rows.every((r) => r.label.labelId === 'FORGE_GREEDY_SAFE_SYMMETRIC_V1'));
    const positive = rows.filter((r) => r.label.greedySafe === 1).length;
    assert.equal(positive + rows.filter((r) => r.label.greedySafe === 0).length, rows.length);
    assert.ok(positive > 0 && positive < rows.length, `${p} degenerate labels`);
  }
});

test('14/15. the feature contract is exact and missing semantics are preserved', () => {
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT_ID, STAGE3F6P1D_PLAN.featureContract.id);
  assert.equal(CORE_IDS.length, 30);
  for (const row of corpus.slice(0, 500)) {
    assert.deepEqual(Object.keys(row.core).sort(), [...CORE_IDS].sort());
    assert.equal(row.coreMissing.length, 0);
    assert.ok(Object.values(row.core).every((v) => typeof v === 'number' && Number.isFinite(v)));
  }
  const stripped = extractDeployableFeatures({ observation: null, legalActions: null, profile: DeployableProfile.DEPLOYABLE_CORE });
  const statuses = CORE_IDS.map((id) => stripped.features[id].status);
  assert.ok(statuses.every((s) => s !== FeatureValueStatus.AVAILABLE), 'absent inputs yield non-AVAILABLE statuses, never zeros');
});

test('16. no orientation token leaks into features or labels', () => {
  assert.equal(CORE_IDS.some((id) => /orient|rotat|reflect|transform|frame|canonical/i.test(id)), false);
  for (const row of corpus.slice(0, 200)) {
    assert.equal(/orient|rotat|reflect|canonical/i.test(JSON.stringify(row.core)), false);
    assert.equal(/orient|rotat|reflect|canonical/i.test(JSON.stringify(row.label)), false);
  }
  const sampled = corpus.filter((r) => r.equivariance !== null).slice(0, 100);
  for (const row of sampled) for (const result of Object.values(row.equivariance)) assert.equal(result.coreFeatureInvariant, 1);
});

test('17/18. generation is deterministic and independent of the worker layout', () => {
  assert.ok(manifest.workers > 1, 'the corpus was produced by multiple workers');
  for (const p of PARTITIONS) {
    for (const row of part(p).slice(0, 3)) {
      const rebuilt = corpusRecord(p, row.combination, row.combinationIndex, { withEquivariance: row.equivariance !== null });
      assert.equal(JSON.stringify(rebuilt), JSON.stringify(row), `${p} ${row.recordHash.slice(0, 12)}`);
    }
  }
});

test('19/20/21. R0 holds, no router training and no policy modification', () => {
  assert.deepEqual({ ...STAGE3F6P1D_PLAN.authority }, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
  const code = text('scripts/generate-stage3f6p1d-symmetric-corpus.mjs') + text('scripts/certify-stage3f6p1d-symmetric-corpus.mjs');
  assert.equal(/fitPolicyRouter\(|fitLogisticRegression\(|scoreMatrix\(|train\(/.test(code), false);
  for (const f of ['src/lab/stage3c-learned-nexus.js', 'src/stage3f/deployable-action-proposal-v1.js', 'src/stage3f/nexus-selector-v2-candidate.js',
    'src/stage3f/policy-router-v1.js', 'src/forge-symmetric/counterfactual-symmetric-v1.js', 'src/forge-symmetric/scenarios-symmetric-v1.js']) {
    assert.equal(hex(readFileSync(at(f))), headHash(f), f);
  }
  assert.match(text('scripts/certify-stage3f6p1d-symmetric-corpus.mjs'), /READY_FOR_STAGE3G: false/);
});
