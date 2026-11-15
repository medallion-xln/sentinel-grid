// HDISC_MATCHED_ABLATION_CONTRACT_V1 — tests. Run: node --test protocol/*.test.mjs
// SYNTHETIC ARM RECORDS ONLY. No arm exists, nothing is trained and no parameter is learned. The tiny trees below are
// hand-written shapes used to exercise the structural check; they are not models.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT_ID, LADDER, CONTRASTS, DIMENSIONS, STATUS, VERDICT, FAMILIES, LABEL_FAMILIES, OBJECTIVES, LEARNER_FAMILY, PAIR_SAMPLING_RULE, ESSENTIAL_CONTRAST, BEST_REACHABLE, ATTRIBUTION, NEVER_LICENSED, LICENSED_CLAIMS,
  assertMatchedContrast, hasCrossActionInteraction, hasPairRelationSplit, inputWidth, attributionOutcome } from './ablation-contract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), HDISC0 = resolve(HERE, '../../stage3h-hdisc0-design-v1');
const SK1_NAMES = ['f1', 'f2', 'f3'], M2_NAMES = [...SK1_NAMES, 'contrast.menu', 'contrast.s0'], CTX = ['c1', 'c2'], RHO = ['rho.sameType', 'rho.destinationDistance'];
const SPEC = Object.fromEntries(LADDER.map((s) => [s.arm, s]));
/** A synthetic, internally consistent record for a ladder arm. */
function record(arm, patch = () => {}) {
  const s = SPEC[arm], per = s.perActionSet === 'SK1_FEATURE_SET' ? SK1_NAMES : M2_NAMES, rho = s.pairRelationInputs ? RHO : [], layout = { d: per.length, r: rho.length, k: CTX.length }, pair = s.pairPresentation;
  const rec = { arm, learnerFamily: LEARNER_FAMILY,
    trainingInformation: { explorationClassListDigest: 'e'.repeat(64), classes: 1000, foldAssignmentDigest: 'f'.repeat(64) },
    featureAccess: { perActionSet: s.perActionSet, perActionSchemaId: `schema:${s.perActionSet}`, perActionNames: [...per], contextNames: [...CTX], pairRelationNames: [...rho], inputLayout: layout },
    nativeActionMenu: { observationContract: { id: 'STAGE3H_PUBLIC_DECISION_INFORMATION_V1', version: 'HW1_PUBLIC_PROJECTION_V1' }, evidenceContract: 'SK1_ADVISORY_EVIDENCE_V1', menuContract: 'COMPLETE_LAWFUL_NATIVE_MENU', completeMenu: true },
    labelDefinitions: { labelContract: 'HDISC_SAFETY_LABEL_CONTRACT_V1', labelFamily: s.labelFamily, comparatorConditioning: true, evaluatorDefinitionsDigest: 'd'.repeat(64) },
    capacity: { family: s.family, bags: 10, treesPerBag: 100, maxDepth: 3, totalNodes: 9000, totalLeaves: 5000, inputWidth: inputWidth(s.family, layout) },
    objective: { id: s.objectiveId, family: s.family, unit: pair ? 'PAIR' : 'ACTION', antisymmetrised: pair, loss: 'LOGISTIC', link: 'logit' },
    optimisationBudget: { configurationsTried: 18, tuningRuleId: 'HDISC1_SHARED_CONFIGURATION_RULE_V1', earlyStoppingRule: 'NONE_FIXED_TREE_COUNT', treeBudget: 1000, leafUpdateBudget: 8_000_000, totalTrainingWeight: 8000, pairSamplingRule: pair ? PAIR_SAMPLING_RULE : null },
    randomisation: { seedDerivationScheme: 'HDISC1|<arm>|<stage>|<head>', bagBootstrapScheme: 'ORIGIN_FAMILY_BOOTSTRAP', foldAssignmentRule: 'HDISC1_FAMILY_FOLDS_V1' },
    inferenceBudget: { medianMs: pair ? 31 : 9, maxMs: pair ? 240 : 60, ceiling: { medianMsMax: 100, maxMsMax: 1000 }, referenceMenuSize: 9, pairEvaluationsPerMenu: pair ? 'QUADRATIC_n(n-1)' : 'LINEAR_n', scorerEvaluationsAtReferenceMenu: pair ? 72 : 9 },
    structural: pair ? { hasCrossActionInteraction: true, hasPairRelationSplit: s.pairRelationInputs ? true : false, parametersSha256: 'a'.repeat(64) } : {} };
  patch(rec); return rec;
}
const pairOf = (a, b, pa, pb) => ({ [a]: record(a, pa), [b]: record(b, pb) });
const statuses = (res) => Object.fromEntries(DIMENSIONS.map((d) => [d, res.dimensions[d].status]));

test('the ladder is the H-DISC-0 ladder, word for word, in the same order', () => {
  const md = readFileSync(resolve(HDISC0, 'H_DISC_0_PREREGISTRATION_DRAFT.md'), 'utf8'), clean = (s) => s.replace(/\*\*/g, '').trim();
  const rows = md.split('\n').filter((l) => /^\| M(0|1|2|3a|3 = F) \|/.test(l)).map((l) => l.split('|').slice(1, -1).map(clean));
  assert.equal(rows.length, 5); assert.deepEqual(rows.map((r) => r[0]), ['M0', 'M1', 'M2', 'M3a', 'M3 = F']); assert.deepEqual(LADDER.map((s) => s.arm), ['M0', 'M1', 'M2', 'M3a', 'M3']);
  rows.forEach((r, i) => { const s = LADDER[i]; assert.equal(s.label, r[1], s.arm); assert.equal(s.information, r[2], s.arm); assert.equal(s.objective, r[3], s.arm); assert.equal(s.isolates, r[4], s.arm); });
  assert.equal(LADDER[4].equalsPolicyArm, 'F'); assert.deepEqual(LADDER.map((s) => s.against), ['D', 'M0', 'M1', 'M2', 'M3a']);
  assert.match(md, /minimum matched control that isolates pairwise within-menu learning is M2 against M3a/); assert.equal(ESSENTIAL_CONTRAST, 'M2_vs_M3a');
  for (const [id, c] of Object.entries(CONTRASTS)) { assert.equal(id, `${c.upper}_vs_${c.lower}`); assert.equal(c.isolates, SPEC[c.lower].isolates); assert.equal(SPEC[c.lower].against, c.upper); assert.ok(DIMENSIONS.includes(c.designed)); }
  assert.equal(DIMENSIONS.length, 9); assert.equal(CONTRACT_ID, 'HDISC_MATCHED_ABLATION_CONTRACT_V1');
});

test('a correctly built M2 / M3a pair differs by design in the objective only; three differences are unavoidable and are never called matched', () => {
  const res = assertMatchedContrast('M2', 'M3a', pairOf('M2', 'M3a'));
  assert.deepEqual(statuses(res), { TRAINING_INFORMATION: STATUS.MATCHED, FEATURE_ACCESS: STATUS.MATCHED, NATIVE_ACTION_MENU: STATUS.MATCHED, LABEL_DEFINITIONS: STATUS.MATCHED, MODEL_CAPACITY: STATUS.UNAVOIDABLE,
    TRAINING_OBJECTIVE: STATUS.BY_DESIGN, OPTIMISATION_BUDGET: STATUS.UNAVOIDABLE, RANDOMISATION: STATUS.MATCHED, INFERENCE_BUDGET: STATUS.UNAVOIDABLE });
  assert.equal(res.verdict, VERDICT.PARTIAL); assert.deepEqual(res.reasons, []); assert.equal(res.vacuous, false); assert.equal(res.isolates, 'the pairwise objective');
  assert.deepEqual(res.unavoidableDifferences.map((u) => u.dimension), ['MODEL_CAPACITY', 'OPTIMISATION_BUDGET', 'INFERENCE_BUDGET']); for (const u of res.unavoidableDifferences) assert.ok(u.reason.length > 40);
  assert.match(res.dimensions.MODEL_CAPACITY.detail, /2d\+k/); assert.match(res.dimensions.MODEL_CAPACITY.detail, /antisymmetrisation/); assert.match(res.dimensions.OPTIMISATION_BUDGET.detail, /pairs/); assert.match(res.dimensions.INFERENCE_BUDGET.detail, /n\(n-1\)/);
  assert.equal(BEST_REACHABLE.M2_vs_M3a, VERDICT.PARTIAL); // FULLY_MATCHED is not reachable for this contrast, by construction
});

const WIDEN = (r) => { r.featureAccess.perActionNames.push('extra'); r.featureAccess.inputLayout.d += 1; r.capacity.inputWidth = inputWidth(r.capacity.family, r.featureAccess.inputLayout); };
const PERTURB = {
  TRAINING_INFORMATION: (r) => { r.trainingInformation.explorationClassListDigest = '0'.repeat(64); },
  FEATURE_ACCESS: WIDEN,
  NATIVE_ACTION_MENU: (r) => { r.nativeActionMenu.observationContract.version = 'SOMETHING_ELSE'; },
  LABEL_DEFINITIONS: (r) => { r.labelDefinitions.evaluatorDefinitionsDigest = '1'.repeat(64); },
  MODEL_CAPACITY: (r) => { r.capacity.treesPerBag = 200; },
  TRAINING_OBJECTIVE: (r) => { r.objective.loss = 'SQUARED'; },
  OPTIMISATION_BUDGET: (r) => { r.optimisationBudget.configurationsTried = 54; },
  RANDOMISATION: (r) => { r.randomisation.seedDerivationScheme = 'OTHER'; },
  INFERENCE_BUDGET: (r) => { r.inferenceBudget.maxMs = 1500; },
};
test('each of the nine dimensions, perturbed alone in the pairwise arm, is caught as a MISMATCH and makes the contrast NOT_TESTABLE', () => {
  const base = statuses(assertMatchedContrast('M2', 'M3a', pairOf('M2', 'M3a')));
  for (const dim of DIMENSIONS) { const res = assertMatchedContrast('M2', 'M3a', pairOf('M2', 'M3a', undefined, PERTURB[dim])), st = statuses(res);
    assert.equal(st[dim], STATUS.MISMATCH, dim); assert.equal(res.verdict, VERDICT.NOT_TESTABLE, dim); assert.ok(res.reasons.includes(`MISMATCH:${dim}`), dim);
    for (const other of DIMENSIONS) if (other !== dim) assert.equal(st[other], base[other], `${dim} must not disturb ${other}`); }
  // the same perturbations in the pointwise arm are caught too
  for (const dim of ['TRAINING_INFORMATION', 'LABEL_DEFINITIONS', 'MODEL_CAPACITY', 'OPTIMISATION_BUDGET', 'RANDOMISATION', 'INFERENCE_BUDGET']) assert.equal(statuses(assertMatchedContrast('M2', 'M3a', pairOf('M2', 'M3a', PERTURB[dim])))[dim], STATUS.MISMATCH, dim);
});

test('an unavoidable difference cannot be made to look matched', () => {
  // claiming linear inference for a pair model, or a pair model without the declared pair sampling rule, is a MISMATCH, not a match
  const linear = assertMatchedContrast('M2', 'M3a', pairOf('M2', 'M3a', undefined, (r) => { r.inferenceBudget.pairEvaluationsPerMenu = 'LINEAR_n'; })); assert.equal(linear.dimensions.INFERENCE_BUDGET.status, STATUS.MISMATCH);
  const noRule = assertMatchedContrast('M2', 'M3a', pairOf('M2', 'M3a', undefined, (r) => { r.optimisationBudget.pairSamplingRule = null; })); assert.equal(noRule.dimensions.OPTIMISATION_BUDGET.status, STATUS.MISMATCH);
  const unmeasured = assertMatchedContrast('M2', 'M3a', pairOf('M2', 'M3a', undefined, (r) => { delete r.inferenceBudget.medianMs; })); assert.equal(unmeasured.dimensions.INFERENCE_BUDGET.status, STATUS.MISMATCH);
  const weight = assertMatchedContrast('M2', 'M3a', pairOf('M2', 'M3a', undefined, (r) => { r.optimisationBudget.totalTrainingWeight = 36000; })); assert.equal(weight.dimensions.OPTIMISATION_BUDGET.status, STATUS.MISMATCH); // pairs not class-normalised
  for (const res of [linear, noRule, unmeasured, weight]) { assert.equal(res.verdict, VERDICT.NOT_TESTABLE); for (const d of ['MODEL_CAPACITY', 'OPTIMISATION_BUDGET', 'INFERENCE_BUDGET']) assert.notEqual(res.dimensions[d].status, STATUS.MATCHED); }
});

test('a vacuous pairwise arm makes the attribution NOT_TESTABLE; an unverified one fails closed', () => {
  const vac = assertMatchedContrast('M2', 'M3a', pairOf('M2', 'M3a', undefined, (r) => { r.structural.hasCrossActionInteraction = false; }));
  assert.equal(vac.verdict, VERDICT.NOT_TESTABLE); assert.equal(vac.vacuous, true); assert.deepEqual(vac.reasons, ['M3a:VACUOUS_NO_CROSS_ACTION_PATH']); assert.equal(statuses(vac).TRAINING_OBJECTIVE, STATUS.BY_DESIGN); // matched on paper, vacuous in substance
  const unk = assertMatchedContrast('M2', 'M3a', pairOf('M2', 'M3a', undefined, (r) => { r.structural = {}; })); assert.equal(unk.verdict, VERDICT.NOT_TESTABLE); assert.deepEqual(unk.reasons, ['M3a:STRUCTURE_NOT_VERIFIED']);
  assert.deepEqual(attributionOutcome({ contrastVerdict: vac.verdict, vacuous: vac.vacuous, rejected: true, interval: [-0.03, -0.01], totalEffect: -0.03 }), { outcome: ATTRIBUTION.NOT_TESTABLE, qualifier: null });
  const m3 = assertMatchedContrast('M3a', 'M3', pairOf('M3a', 'M3', undefined, (r) => { r.structural.hasPairRelationSplit = false; })); assert.equal(m3.verdict, VERDICT.NOT_TESTABLE); assert.deepEqual(m3.reasons, ['M3:VACUOUS_PAIR_RELATION_INPUTS_UNUSED']);
});

test('an additive ranker renamed as the pairwise arm is refused', () => {
  const renamed = assertMatchedContrast('M2', 'M3a', { M2: record('M2'), M3a: { ...record('M2'), arm: 'M3a' } });
  assert.equal(renamed.verdict, VERDICT.NOT_TESTABLE); assert.ok(renamed.reasons.some((r) => r.startsWith('M3a:DOES_NOT_CONFORM_TO_ITS_ARM')));
  const withRho = assertMatchedContrast('M2', 'M3a', { M2: record('M2'), M3a: { ...record('M3'), arm: 'M3a' } }); assert.equal(withRho.verdict, VERDICT.NOT_TESTABLE); assert.ok(withRho.reasons.includes('M3a:DOES_NOT_CONFORM_TO_ITS_ARM:PAIR_RELATION_INPUTS'));
  assert.equal(assertMatchedContrast('M2', 'M3a', { M2: record('M2') }).verdict, VERDICT.NOT_TESTABLE); assert.equal(assertMatchedContrast('M0', 'M3a', pairOf('M0', 'M3a')).reasons[0], 'NOT_A_LADDER_CONTRAST');
});

test('the structural check reads the declared layout: a path must split on the first AND the second action', () => {
  const L = { d: 2, r: 1, k: 1 }, leafL = -1, T = (f, l, r) => ({ f, t: f.map(() => 0.5), l, r, v: f.map(() => 0.1) }); // inputs: 0,1 = phi_a; 2,3 = phi_b; 4 = rho; 5 = c
  const onlyA = T([0, leafL, 1, leafL, leafL], [1, -1, 3, -1, -1], [2, -1, 4, -1, -1]), onlyB = T([2, leafL, leafL], [1, -1, -1], [2, -1, -1]);
  const cross = T([0, leafL, 3, leafL, leafL], [1, -1, 3, -1, -1], [2, -1, 4, -1, -1]), ctxThenA = T([5, 0, leafL, leafL, leafL], [1, 3, -1, -1, -1], [2, 4, -1, -1, -1]), rho = T([4, leafL, leafL], [1, -1, -1], [2, -1, -1]);
  const P = (...trees) => ({ family: FAMILIES.pair, layout: L, bags: [{ base: 0, trees }] });
  assert.equal(hasCrossActionInteraction(P(onlyA, onlyB, ctxThenA)), false); // a sum of one-action trees is additive, however many there are
  assert.equal(hasCrossActionInteraction(P(onlyA, cross)), true); assert.equal(hasCrossActionInteraction(P(rho)), false);
  assert.equal(hasPairRelationSplit(P(onlyA, cross)), false); assert.equal(hasPairRelationSplit(P(rho)), true); assert.equal(hasCrossActionInteraction({ family: FAMILIES.pair, layout: L, bags: [] }), false);
  assert.throws(() => hasCrossActionInteraction({ bags: [{ trees: [cross] }] }), /PARAMETERS_OR_LAYOUT_MALFORMED/); assert.throws(() => hasCrossActionInteraction(P({ f: [0] })), /TREE_MALFORMED/);
  assert.equal(inputWidth(FAMILIES.pair, L), 6); assert.equal(inputWidth(FAMILIES.additive, L), 3);
});

test('the other rungs: label, relational information and pair inputs can be fully matched; the step from D cannot', () => {
  const label = assertMatchedContrast('M0', 'M1', pairOf('M0', 'M1')); assert.equal(label.verdict, VERDICT.FULL); assert.equal(statuses(label).LABEL_DEFINITIONS, STATUS.BY_DESIGN); assert.equal(Object.values(statuses(label)).filter((s) => s === STATUS.MATCHED).length, 8);
  const info = assertMatchedContrast('M1', 'M2', pairOf('M1', 'M2')); assert.equal(info.verdict, VERDICT.FULL); assert.equal(statuses(info).FEATURE_ACCESS, STATUS.BY_DESIGN); assert.equal(statuses(info).MODEL_CAPACITY, STATUS.MATCHED);
  const rho = assertMatchedContrast('M3a', 'M3', pairOf('M3a', 'M3')); assert.equal(rho.verdict, VERDICT.FULL); assert.equal(statuses(rho).FEATURE_ACCESS, STATUS.BY_DESIGN); assert.equal(statuses(rho).INFERENCE_BUDGET, STATUS.MATCHED);
  // two factors changed at once is not an isolating contrast
  const two = assertMatchedContrast('M0', 'M1', pairOf('M0', 'M1', undefined, WIDEN)); assert.equal(two.verdict, VERDICT.NOT_TESTABLE); assert.equal(statuses(two).FEATURE_ACCESS, STATUS.MISMATCH);
  const noLabelChange = assertMatchedContrast('M0', 'M1', { M0: record('M0'), M1: { ...record('M0'), arm: 'M1' } }); assert.equal(noLabelChange.verdict, VERDICT.NOT_TESTABLE);
  const D = { arm: 'D', frozen: true, modelHash: 'b'.repeat(64), explorationClassListDigest: '3'.repeat(64), featureNames: [...SK1_NAMES, ...CTX], observationContract: record('M0').nativeActionMenu.observationContract, riskHeadCapacity: { bags: 10, treesPerBag: 100, maxDepth: 3 }, bagBootstrapScheme: 'ORIGIN_FAMILY_BOOTSTRAP' };
  const fromD = assertMatchedContrast('D', 'M0', { D, M0: record('M0') }); assert.equal(fromD.verdict, VERDICT.PARTIAL); assert.equal(statuses(fromD).TRAINING_INFORMATION, STATUS.BY_DESIGN); assert.equal(statuses(fromD).TRAINING_OBJECTIVE, STATUS.UNAVOIDABLE); assert.equal(BEST_REACHABLE.D_vs_M0, VERDICT.PARTIAL);
  assert.equal(assertMatchedContrast('D', 'M0', { D, M0: record('M0', (r) => { r.capacity.maxDepth = 5; r.capacity.totalNodes = 9000; }) }).verdict, VERDICT.NOT_TESTABLE);
  assert.deepEqual(BEST_REACHABLE, { D_vs_M0: VERDICT.PARTIAL, M0_vs_M1: VERDICT.FULL, M1_vs_M2: VERDICT.FULL, M2_vs_M3a: VERDICT.PARTIAL, M3a_vs_M3: VERDICT.FULL });
});

test('attribution: supported, not supported and unresolved are distinct, and an F-over-D gain alone licenses nothing about pairwise learning', () => {
  const total = -0.03, ok = { contrastVerdict: VERDICT.PARTIAL, totalEffect: total };
  assert.deepEqual(attributionOutcome({ ...ok, rejected: true, interval: [-0.035, -0.004] }), { outcome: ATTRIBUTION.SUPPORTED, qualifier: 'WITH_DECLARED_UNAVOIDABLE_DIFFERENCES' });
  assert.equal(attributionOutcome({ ...ok, rejected: false, interval: [-0.02, 0.012] }).outcome, ATTRIBUTION.UNRESOLVED);     // includes zero and half the total effect (-0.015)
  assert.equal(attributionOutcome({ ...ok, rejected: false, interval: [-0.008, 0.012] }).outcome, ATTRIBUTION.NOT_SUPPORTED);  // includes zero, excludes -0.015
  assert.equal(attributionOutcome({ ...ok, rejected: false, interval: [-0.02, 0.012], totalEffect: 0.004 }).outcome, ATTRIBUTION.NO_TOTAL_EFFECT);
  assert.equal(attributionOutcome({ ...ok, rejected: true, interval: [-0.02, 0.001] }).outcome, ATTRIBUTION.UNRESOLVED);       // a rejection whose clustered interval still reaches zero is not support
  assert.equal(attributionOutcome({ contrastVerdict: VERDICT.FULL, rejected: true, interval: [-0.02, -0.001], totalEffect: total }).qualifier, null);
  for (const bad of [{ ...ok, rejected: true }, { ...ok, rejected: true, interval: [0.1, -0.1] }, { ...ok, interval: [-0.02, 0.01] }, { contrastVerdict: 'SOMETHING', rejected: true, interval: [-1, -0.5], totalEffect: -1 }]) assert.equal(attributionOutcome(bad).outcome, ATTRIBUTION.NOT_TESTABLE);
  assert.match(NEVER_LICENSED, /never licenses/); assert.deepEqual(Object.keys(LICENSED_CLAIMS).sort(), Object.values(ATTRIBUTION).sort()); assert.match(LICENSED_CLAIMS.UNRESOLVED, /not a negative finding/);
});

test('the contract is pure: it imports nothing and names the families and label families of the fixed interface', () => {
  const src = readFileSync(resolve(HERE, 'ablation-contract.mjs'), 'utf8'); assert.ok(!/^\s*import\s/m.test(src)); assert.ok(!/Math\.random|Date\.now|process\./.test(src));
  assert.deepEqual({ ...FAMILIES }, { pair: 'HDISC_ANTISYMMETRISED_PAIR_TREE_ENSEMBLE_V1', additive: 'HDISC_ADDITIVE_POINTWISE_TREE_ENSEMBLE_V1' });
  assert.deepEqual(LADDER.map((s) => s.family), [FAMILIES.additive, FAMILIES.additive, FAMILIES.additive, FAMILIES.pair, FAMILIES.pair]); assert.deepEqual(LADDER.map((s) => s.labelFamily), [LABEL_FAMILIES.catastrophe, ...Array(4).fill(LABEL_FAMILIES.introduction)]);
  assert.deepEqual(LADDER.map((s) => s.objectiveId), [OBJECTIVES.pointwise, OBJECTIVES.pointwise, OBJECTIVES.pointwise, OBJECTIVES.pairwise, OBJECTIVES.pairwise]); assert.deepEqual(LADDER.map((s) => s.pairRelationInputs), [false, false, false, false, true]);
});
