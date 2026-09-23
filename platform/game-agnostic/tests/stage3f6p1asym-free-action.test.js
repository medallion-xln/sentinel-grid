import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DIAGNOSTIC_SPECS, MODEL_SPECS, STAGE3F6P1ASYM_PLAN, STAGE3F6P1ASYM_PLAN_HASH, STAGE3F6P1ASYM_PLAN_PATH, STAGE3F6P1ASYM_STATE_FEATURES,
  STAGE3F6P1ASYM_STATE_FEATURES_HASH } from '../scripts/stage3f6p1asym-analysis-plan.mjs';
import { FRESH_SPEC, OPEN_REPORT_PATH, freshGate } from '../scripts/generate-stage3f6p1asym-confirmatory.mjs';
import { readCorpus } from '../scripts/generate-stage3f6p1e-policy-evidence.mjs';
import { candidateEvidence, isEligible } from '../scripts/stage3f6p1asym-evidence.mjs';
import { ORIENTATIONS, orientCell, orientDirection } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { DeployableProfile, DEPLOYABLE_PROFILES } from '../src/stage3f/deployable-feature-contract-v1.js';
import {
  CANDIDATE_FEATURE_INVENTORY, FREE_ACTION_REPRESENTATION_CONTRACT, FREE_ACTION_REPRESENTATION_HASH, ZERO_COST_TYPES, attributeError, deriveDeployableCandidates,
  directionOneHot, ece10, fitCandidateLogit, materialGain, modelHash, outcomeOf, scoreCandidates, sufficiencyCategory, topSet,
} from '../src/stage3f/free-action-sufficiency-v1.js';
import { sha256 } from '../src/core/determinism.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (r) => path.join(root, r);
const json = (r) => JSON.parse(readFileSync(at(r), 'utf8'));

/* A synthetic decision input on a level-0 (8x8) grid: actor at (2,5), four MOVEs, a RETREAT one step WEST, a WAIT and a costly PROTECT. */
const synthetic = (orientation = 'R0', { reverse = false, ids = (i, a) => a.actionId } = {}) => {
  const size = 8; const actor = orientCell(orientation, { x: 2, y: 5 }, size); const retreat = orientCell(orientation, { x: 1, y: 5 }, size);
  const base = [
    ...['EAST', 'NORTH', 'SOUTH', 'WEST'].map((d) => ({ actionId: `move-${d}`, actionType: 'MOVE', parameters: { direction: orientDirection(orientation, d) }, base: `move-${d}` })),
    { actionId: 'retreat', actionType: 'RETREAT', parameters: { toX: retreat.x, toY: retreat.y }, base: 'retreat' },
    { actionId: 'wait', actionType: 'WAIT', parameters: {}, base: 'wait' },
    { actionId: 'protect', actionType: 'PROTECT', parameters: {}, base: 'protect' },
  ];
  const legalActions = (reverse ? [...base].reverse() : base).map((a, i) => ({ ...a, actionId: ids(i, a) }));
  return { observation: { features: [0, 0, 0, actor.x, actor.y], metadata: { scenarioLevel: 0 } }, legalActions };
};
const flat = (d) => [...d.TYPE, ...d.CANDIDATE, ...d.GEOMETRY];

test('1. plan, representation and state-feature hashes are deterministic and bound to the plan file', () => {
  const file = json(STAGE3F6P1ASYM_PLAN_PATH);
  assert.equal(sha256(STAGE3F6P1ASYM_PLAN), STAGE3F6P1ASYM_PLAN_HASH); assert.equal(file.planHash, STAGE3F6P1ASYM_PLAN_HASH);
  assert.equal(sha256(FREE_ACTION_REPRESENTATION_CONTRACT), FREE_ACTION_REPRESENTATION_HASH); assert.equal(file.representationHash, FREE_ACTION_REPRESENTATION_HASH);
  assert.equal(sha256(STAGE3F6P1ASYM_STATE_FEATURES), STAGE3F6P1ASYM_STATE_FEATURES_HASH); assert.equal(file.stateFeaturesHash, STAGE3F6P1ASYM_STATE_FEATURES_HASH);
  assert.deepEqual(STAGE3F6P1ASYM_STATE_FEATURES.featureIds, [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort());
});

test('2. headline models read only DEPLOYABLE blocks; every non-deployable class is diagnostic-only', () => {
  const blockClass = Object.fromEntries(CANDIDATE_FEATURE_INVENTORY.filter((f) => f.block !== 'NONE').map((f) => [f.block, f.class]));
  for (const spec of Object.values(MODEL_SPECS)) for (const b of [...spec.main, ...spec.interact]) assert.equal(blockClass[b], 'DEPLOYABLE', b);
  for (const d of Object.values(DIAGNOSTIC_SPECS)) for (const b of d.add) assert.ok(b === 'ONESTEP' || blockClass[b] !== 'DEPLOYABLE', b);
  assert.deepEqual(ZERO_COST_TYPES, ['COLLECT', 'MOVE', 'RETREAT', 'WAIT']);
});

test('3. deployable candidate fields are D4-equivariant on every orientation; the absolute direction is not (symmetry mutation)', () => {
  const base = deriveDeployableCandidates(synthetic('R0'), (a) => a.base);
  assert.deepEqual([...base.keys()].sort(), ['move-EAST', 'move-NORTH', 'move-SOUTH', 'move-WEST', 'retreat', 'wait']);
  assert.deepEqual(flat(base.get('move-WEST')).slice(3, 8), [1, 0, 1, 1, 2], 'WEST aligns with the retreat step');
  let absoluteChanged = 0;
  for (const o of ORIENTATIONS) {
    const t = deriveDeployableCandidates(synthetic(o), (a) => a.base);
    for (const k of base.keys()) assert.deepEqual(flat(t.get(k)), flat(base.get(k)), `${o} ${k}`);
    if (o !== 'R0' && JSON.stringify(directionOneHot(orientDirection(o, 'EAST'))) !== JSON.stringify(directionOneHot('EAST'))) absoluteChanged += 1;
  }
  assert.ok(absoluteChanged >= 5, 'the absolute-direction control must change under the transforms, or the test could not fail');
});

test('4. identity replacement and list reversal leave every deployable field unchanged (action-ID permutation)', () => {
  const base = deriveDeployableCandidates(synthetic('R90'), (a) => a.base);
  const perm = deriveDeployableCandidates(synthetic('R90', { reverse: true, ids: (i) => `zz-${i}` }), (a) => a.base);
  for (const k of base.keys()) assert.deepEqual(flat(perm.get(k)), flat(base.get(k)));
});

test('5. the deployable derivation reads only the decision input (no world, positions, successor or oracle fields)', () => {
  const src = readFileSync(at('src/stage3f/free-action-sufficiency-v1.js'), 'utf8');
  const body = src.slice(src.indexOf('export function deriveDeployableCandidates'), src.indexOf('/** State-level fields'));
  assert.ok(!/world|\.position|entities|immediateScalar|\.i\b|regret|orientation|canonicalOrientation/.test(body));
  const d = deriveDeployableCandidates({ observation: { features: [0, 0, 0, 2, 5], metadata: { scenarioLevel: 0 } }, legalActions: synthetic().legalActions }, (a) => a.base);
  assert.equal(d.has('protect'), false, 'costly actions are never candidates');
  const noCell = deriveDeployableCandidates({ observation: { features: [], metadata: {} }, legalActions: synthetic().legalActions }, (a) => a.base);
  assert.deepEqual(noCell.get('move-EAST').GEOMETRY, [0, 0, 0], 'missing actor cell or level -> no geometry, never a guess');
});

test('6. the candidate scorer fits deterministically, learns a separable signal, and is order-free', () => {
  const groups = Array.from({ length: 60 }, (_, g) => ({ X: [[1, g % 3], [0, (g + 1) % 3], [0, 2]], y: [1, 0, 0] }));
  const a = fitCandidateLogit(groups, { iterations: 300 }); const b = fitCandidateLogit(groups, { iterations: 300 });
  assert.equal(modelHash(a), modelHash(b));
  const s = scoreCandidates(a, [[1, 0], [0, 1], [0, 2]]); assert.deepEqual(topSet(s.scores), [0]);
  const r = scoreCandidates(a, [[0, 2], [0, 1], [1, 0]]); assert.deepEqual(r.scores, [...s.scores].reverse());
});

test('7. ties are never broken by identity: identical candidates share the decision uniformly', () => {
  const m = fitCandidateLogit([{ X: [[1], [0]], y: [1, 0] }], { iterations: 50 });
  const { scores, probabilities } = scoreCandidates(m, [[0], [0], [0], [1]]);
  assert.deepEqual(topSet(scores), [3]);
  const tie = topSet([0.5, 0.5, 0.1]); assert.deepEqual(tie, [0, 1]);
  const o = outcomeOf([{ o: 1, r: 0, maxR: 10 }, { o: 0, r: 10, maxR: 10 }, { o: 0, r: 5, maxR: 10 }], tie, [0.4, 0.4, 0.2]);
  assert.equal(o.hit, 0.5); assert.equal(o.regret, 5); assert.equal(o.nreg, 0.5); assert.ok(Math.abs(o.pOptimal - 0.4) < 1e-12);
  assert.ok(probabilities.every((p) => p > 0));
});

test('8. materiality needs the 0.05 gain AND significance; categories follow the predeclared precedence', () => {
  const d = (top1Difference, top1Ci95, nregCi95 = [-0.01, 0.01]) => ({ top1Difference, top1Ci95, nregDifference: 0, nregCi95 });
  assert.equal(materialGain(d(0.03, [0.01, 0.05])).MATERIAL, false); assert.equal(materialGain(d(0.03, [0.01, 0.05])).statisticallyBetter, true);
  assert.equal(materialGain(d(0.08, [0.06, 0.1])).MATERIAL, true);
  assert.equal(materialGain(d(0.08, [0.06, 0.1], [0.01, 0.02])).MATERIAL, false, 'a gain with significantly worse normalized regret is not material');
  const m = materialGain(d(0.1, [0.08, 0.12])); const n = materialGain(d(0.01, [-0.01, 0.03]));
  const e = { holdoutN: 5000, oodN: 5000, vsUniformHoldout: m, vsResourceHoldout: m, vsUniformOod: m, vsResourceOod: m, equivariant: true, top1Holdout: 0.6, shortcutControlMaterial: false };
  assert.equal(sufficiencyCategory(e).primary, 'REPRESENTATION_SUFFICIENT_POLICY_WEAK');
  assert.equal(sufficiencyCategory({ ...e, top1Holdout: 0.4 }).primary, 'REPRESENTATION_PARTIALLY_SUFFICIENT');
  assert.equal(sufficiencyCategory({ ...e, equivariant: false }).primary, 'SHORTCUT_ONLY_GAIN');
  assert.equal(sufficiencyCategory({ ...e, vsUniformOod: n }).primary, 'REPRESENTATION_INSUFFICIENT');
  assert.ok(sufficiencyCategory({ ...e, vsUniformOod: n }).secondary.includes('OOD_UNSTABLE'));
  assert.equal(sufficiencyCategory({ ...e, vsUniformHoldout: n, shortcutControlMaterial: true }).primary, 'SHORTCUT_ONLY_GAIN');
  assert.equal(sufficiencyCategory({ ...e, vsUniformHoldout: n }).primary, 'REPRESENTATION_INSUFFICIENT');
  assert.equal(sufficiencyCategory({ ...e, holdoutN: 10 }).primary, 'INSUFFICIENT_EVIDENCE');
});

test('9. error attribution follows the predeclared precedence (mutation-sensitive)', () => {
  const c = (dep, priv, i) => ({ dep, priv, i });
  const same = [0, 1];
  const differing = attributeError({ O: [c([1, 0], [0, 0, 0, 0, 0, 0, 0], 0)], W: [c(same, [0, 0, 0, 0, 0, 0, 0], 0)], horizonDependent: true });
  assert.equal(differing.primary, 'TEMPORAL', 'differing deployable fields alone never make a primary class');
  assert.equal(differing.deployablyDistinguishable, true);
  assert.equal(attributeError({ O: [c(same, [-1, 0, 0, 0, 0, 0, 0], 0)], W: [c(same, [1, 0, 0, 0, 0, 0, 0], 0)], horizonDependent: true }).primary, 'OBJECTIVE');
  assert.equal(attributeError({ O: [c(same, [0, 0, 0, 1, 0, 0, 0], 0)], W: [c(same, [0, 0, 0, -1, 0, 0, 0], 0)], horizonDependent: true }).primary, 'THREAT');
  assert.equal(attributeError({ O: [c(same, [0, 0, 0, 0, 0, 0, 0], 1)], W: [c(same, [0, 0, 0, 0, 0, 0, 0], -7)], horizonDependent: true }).primary, 'MECHANISTIC');
  assert.equal(attributeError({ O: [c(same, [0, 0, 0, 0, 0, 0, 0], 1)], W: [c(same, [0, 0, 0, 0, 0, 0, 0], 1)], horizonDependent: true }).primary, 'TEMPORAL');
  assert.equal(attributeError({ O: [c(same, [0, 0, 0, 0, 0, 0, 0], 1)], W: [c(same, [0, 0, 0, 0, 0, 0, 0], 1)], horizonDependent: false }).primary, 'ACTION_ID_AMBIGUITY');
  assert.equal(attributeError({ O: [c(same, [1, 0, 0, 0, 0, 0, 0], 1), c(same, [-1, 0, 0, 0, 0, 0, 0], 1)], W: [c(same, [0, 0, 0, 0, 0, 0, 0], 1)], horizonDependent: false }).primary, 'UNKNOWN');
  assert.ok(Math.abs(ece10([{ p: 0.95, y: 1 }, { p: 0.05, y: 0 }]) - 0.05) < 1e-12);
});

test('10. real rows: every DEV evidence row rebuilds exactly and its deployable fields are invariant on every D4 twin', () => {
  const rows = readCorpus().filter((r) => r.partition === 'DEV' && isEligible(r) && r.equivariance !== null).slice(0, 12);
  assert.ok(rows.length >= 10);
  for (const row of rows) {
    const e = candidateEvidence(row);
    assert.equal(e.worldFidelity, 1); assert.equal(e.candidateSetFidelity, 1); assert.equal(e.idPermutationInvariant, 1);
    for (const tf of Object.values(e.twinFeatures)) for (const c of e.candidates) assert.deepEqual(tf[c.key], c.dep);
  }
});

test('11. the open-phase report is bound to the plan and scores no sealed row; the fresh gate opens only on a committed freeze', () => {
  const open = json(OPEN_REPORT_PATH);
  assert.equal(open.planHash, STAGE3F6P1ASYM_PLAN_HASH); assert.deepEqual(open.partitions, ['DEV', 'CAL']); assert.equal(open.noSealedRowScored, true);
  assert.equal(open.calSelection.deterministic, true);
  assert.ok(Object.keys(MODEL_SPECS).includes(open.calSelection.selected));
  assert.deepEqual(freshGate(), []);
  assert.deepEqual(Object.values(FRESH_SPEC).map((s) => s.seed), [2023, 2033]);
});

test('12. no hidden temporary paths, no larger model, R0 intact', () => {
  for (const f of ['scripts/stage3f6p1asym-analysis-plan.mjs', 'scripts/generate-stage3f6p1asym-confirmatory.mjs', 'scripts/stage3f6p1asym-evidence.mjs',
    'scripts/certify-stage3f6p1asym-free-action.mjs', 'src/stage3f/free-action-sufficiency-v1.js']) {
    const s = readFileSync(at(f), 'utf8');
    assert.ok(!/\/tmp\/|\/private\/|tmpdir\(|scratchpad/.test(s), f);
    assert.ok(!/from '[^']*(jepa|neural|tensorflow|onnx|world-model)/i.test(s), f);
  }
  assert.deepEqual(STAGE3F6P1ASYM_PLAN.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
});
