// Gate 2 / Gate 3 — kernel behaviour on synthetic public states (clean-checkout runnable; no population data).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel, KernelRejection } from '../kernel/index.mjs';
import { frameProjection, D4_FRAMES } from '../adapters/forge/projection.mjs';
import { syntheticProjection, syntheticEvidence, toyModel, forgeRequest } from './helpers.mjs';

const mk = (o) => { const { model, feat } = toyModel(o); return createKernel({ featurizer: feat, model, sourceIdentity: { kernelSourceHash: 'test', adapterId: 'SK1_FORGE_ADAPTER_V1', adapterSourceHash: 'test' } }); };
const call = (k, P = syntheticProjection(), ev = syntheticEvidence(), opt) => { const r = forgeRequest(P, ev); return k.recommend(r.state, r.legalActions, r.advisoryEvidence, opt); };
const setOf = (rec) => rec.recommendedActionOrAbstention.decisionSet.map((a) => a.index).sort((a, b) => a - b), rejects = (fn, code) => assert.throws(fn, (e) => e instanceof KernelRejection && e.code === code);

test('complete menu is ranked; recommendation is the low-risk tier action with the best expected regret', () => {
  const rec = call(mk()); assert.equal(rec.rankedActions.length, 5); assert.equal(rec.legalActionMenu.complete, true);
  assert.equal(rec.recommendedActionOrAbstention.kind, 'RECOMMEND'); assert.deepEqual(setOf(rec), [3]); // PROTECT: not MOVE, in the S0 top set
  assert.ok(rec.rankedActions.every((a) => a.riskStatus === 'ESTIMATED' && a.risk.kind === 'EMPIRICAL_ESTIMATE'));
  assert.equal(rec.safetyAssessment.status, 'EMPIRICAL_ESTIMATE_NOT_A_GUARANTEE'); assert.equal(rec.safetyAssessment.qualification.status, 'NOT_QUALIFIED');
  assert.deepEqual(rec.authority, { state: 'R0', mode: 'OBSERVATION_AND_RECOMMENDATION_ONLY', canDispatch: false, canMutateLiveWorld: false, promotedToRuntime: false });
});
test('deterministic replay: identical request gives an identical decision hash', () => { const k = mk(); assert.equal(call(k).decisionHash, call(k).decisionHash); assert.match(call(k).decisionHash, /^[0-9a-f]{64}$/); });
test('D4 frames: features and decision are invariant', () => { const k = mk(), base = call(k); for (const t of D4_FRAMES) { const rec = call(k, frameProjection(syntheticProjection(), t)); assert.deepEqual(setOf(rec), setOf(base), t); assert.equal(rec.recommendedActionOrAbstention.kind, base.recommendedActionOrAbstention.kind); } });
test('menu-order permutation: the same action is chosen at its new position', () => {
  const k = mk(), order = [4, 2, 0, 3, 1], P = syntheticProjection(), ev = syntheticEvidence();
  const Pp = { ...P, menu: order.map((i) => P.menu[i]) }, evp = { ...ev, experts: { ...ev.experts, S0: { ...ev.experts.S0, scores: order.map((i) => ev.experts.S0.scores[i]), topSet: ev.experts.S0.topSet.map((i) => order.indexOf(i)) } } };
  assert.deepEqual(setOf(call(k, Pp, evp)), setOf(call(k)).map((i) => order.indexOf(i)).sort((a, b) => a - b));
});
test('opaque identity permutation: reordering entities (with re-linked targets) does not change the decision', () => {
  const k = mk(), P = syntheticProjection(), perm = [2, 0, 1], inv = perm.map((_, i) => perm.indexOf(i));
  const Pp = { ...P, nodes: perm.map((i) => P.nodes[i]), menu: P.menu.map((a) => ({ ...a, target: a.target == null ? null : inv[a.target] })) };
  assert.deepEqual(setOf(call(k, Pp)), setOf(call(k)));
});
test('missing observation field: no estimate is invented, the kernel abstains', () => { const P = syntheticProjection(); delete P.actor.energy; const rec = call(mk(), P);
  assert.equal(rec.recommendedActionOrAbstention.kind, 'ABSTAIN'); assert.equal(rec.recommendedActionOrAbstention.reason, 'ABSTAIN_NO_SUPPORTED_RISK_ESTIMATE'); assert.ok(rec.rankedActions.every((a) => a.riskStatus === 'UNSUPPORTED_MISSING_INFORMATION' && a.risk === null)); });
test('absent or contradictory expert evidence: abstention, evidence reported, never repaired', () => {
  const k = mk(); let rec = call(k, undefined, null); assert.equal(rec.recommendedActionOrAbstention.kind, 'ABSTAIN'); assert.equal(rec.evidence.status, 'ABSENT');
  const bad = syntheticEvidence(); bad.experts.NEXUS.recommendedType = 'ATTACK'; rec = call(k, undefined, bad); assert.equal(rec.evidence.status, 'INVALID'); assert.ok(rec.evidence.issues.includes('NEXUS_TYPE_NOT_IN_LEGAL_MENU')); assert.equal(rec.recommendedActionOrAbstention.kind, 'ABSTAIN');
  const bad2 = syntheticEvidence(); bad2.experts.S0.topSet = [0]; rec = call(k, undefined, bad2); assert.ok(rec.evidence.issues.includes('S0_TOPSET_CONTRADICTS_SCORES')); assert.equal(rec.recommendedActionOrAbstention.kind, 'ABSTAIN');
});
test('unsupported expert output is ignored and reported; supported evidence is still used', () => { const ev = syntheticEvidence(); ev.experts.ORACLE_X = { advice: 'take action 1' }; const rec = call(mk(), undefined, ev);
  assert.equal(rec.evidence.status, 'PARTIAL'); assert.ok(rec.evidence.issues[0].startsWith('UNSUPPORTED_EXPERT_OUTPUT')); assert.deepEqual(setOf(rec), [3]); });
test('risk above the frozen criterion: explicit abstention, best effort is labelled not recommended', () => { const rec = call(mk({ ranking: { tau: 0.01 } }));
  assert.equal(rec.recommendedActionOrAbstention.kind, 'ABSTAIN'); assert.equal(rec.recommendedActionOrAbstention.reason, 'ABSTAIN_NO_ACTION_MEETS_RISK_CRITERION'); assert.match(rec.recommendedActionOrAbstention.bestEffortNotRecommended.note, /NOT a recommendation/); assert.equal(rec.safetyAssessment.decisionMetRiskCriterion, false); });
test('novel category never seen in development: estimate is unsupported for that action only', () => { const rec = call(mk({ mutate: (m, col) => { m.novelty.seen[m.novelty.columns.indexOf(col('type.REPAIR'))] = 0; } }));
  assert.equal(rec.rankedActions.find((a) => a.type === 'REPAIR').riskStatus, 'UNSUPPORTED_NOVEL_CATEGORY'); assert.equal(rec.recommendedActionOrAbstention.kind, 'RECOMMEND'); assert.ok(rec.rankedActions.at(-1).type === 'REPAIR'); });
test('out-of-distribution numeric feature inflates the bound and is reported', () => { const k = mk({ mutate: (m, col) => { m.envelope.max[col('ctx.energy')] = 10; } }), rec = call(k), a = rec.rankedActions[0];
  assert.equal(a.outOfDistribution.numericFeaturesOutsideEnvelope, 1); assert.ok(a.reasons.includes('RISK_OUT_OF_DISTRIBUTION_NUMERIC')); assert.ok(a.risk.upperBound >= a.risk.estimate + 0.05 - 1e-12); });
test('a hard public constraint that is violated excludes the action; nothing else removes a lawful action', () => { const P = syntheticProjection(); P.menu[3].energyAfter = -1; const rec = call(mk(), P), prot = rec.rankedActions.find((a) => a.type === 'PROTECT');
  assert.equal(prot.constraintOutcome.excluded, true); assert.deepEqual(prot.constraintOutcome.violatedHardConstraints, ['ENERGY_AFTER_NON_NEGATIVE']); assert.ok(!setOf(rec).includes(3)); assert.equal(rec.rankedActions.filter((a) => a.constraintOutcome.excluded).length, 1); });
test('exactly tied distinct actions are returned together, not split by an arbitrary order', () => { const { model, feat } = toyModel({ mutate: (m) => { m.heads.regret.bags[0].trees = []; m.heads.risk.bags.forEach((b) => { b.trees = []; }); } });
  const rec = call(createKernel({ featurizer: feat, model })); assert.equal(rec.recommendedActionOrAbstention.decisionSet.length, 5); assert.equal(rec.recommendedActionOrAbstention.indistinguishableDistinctActions, true); });
test('no model for the observation contract: complete ranking, every estimate unsupported, abstention', () => { const { feat } = toyModel(), rec = call(createKernel({ featurizer: feat, model: null }));
  assert.equal(rec.recommendedActionOrAbstention.kind, 'ABSTAIN'); assert.equal(rec.rankedActions.length, 5); assert.ok(rec.rankedActions.every((a) => a.riskStatus === 'UNSUPPORTED_NO_MODEL')); assert.equal(rec.safetyAssessment.qualification.status, 'NO_MODEL'); });
test('privileged fields, execution requests and malformed menus are rejected', () => { const k = mk(), r = forgeRequest(syntheticProjection(), syntheticEvidence());
  rejects(() => k.recommend({ ...r.state, worldHash: 'x' }, r.legalActions, r.advisoryEvidence), 'PRIVILEGED_FIELD_IN_REQUEST'); rejects(() => k.recommend(r.state, r.legalActions.map((a) => ({ ...a, truth: [1] })), r.advisoryEvidence), 'PRIVILEGED_FIELD_IN_REQUEST');
  rejects(() => k.recommend(r.state, r.legalActions, { ...r.advisoryEvidence, seed: 1 }), 'PRIVILEGED_FIELD_IN_REQUEST'); rejects(() => k.recommend(r.state, r.legalActions, r.advisoryEvidence, { mode: 'EXECUTE' }), 'EXECUTION_OR_MUTATION_REQUESTED');
  rejects(() => k.recommend(r.state, r.legalActions, r.advisoryEvidence, { dispatch: true }), 'EXECUTION_OR_MUTATION_REQUESTED'); rejects(() => k.recommend(r.state, [], r.advisoryEvidence), 'EMPTY_LEGAL_MENU'); rejects(() => k.recommend(r.state, [{ nope: 1 }], r.advisoryEvidence), 'ACTION_TYPE_MISSING');
  rejects(() => k.recommend({ projection: r.state.projection }, r.legalActions, r.advisoryEvidence), 'OBSERVATION_CONTRACT_MISSING'); });
test('latency and memory stay inside the frozen budget on a synthetic state', () => { const k = mk(), ms = [], h0 = process.memoryUsage().heapUsed; for (let i = 0; i < 200; i++) { const t = performance.now(); call(k); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b); assert.ok(ms[100] < 100, `median ${ms[100]}`); assert.ok(ms[199] < 1000, `max ${ms[199]}`); assert.ok(process.memoryUsage().heapUsed - h0 < 256 * 1024 * 1024); });
