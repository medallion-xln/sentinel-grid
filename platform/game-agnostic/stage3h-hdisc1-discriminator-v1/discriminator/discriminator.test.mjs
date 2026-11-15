// H-DISC-1 discriminator tests. Run: node --test discriminator/*.test.mjs
// Tracked public fixtures and synthetic parameter sets only. No world, no label, no learned parameter, no evaluation.
// Nothing here measures decision quality.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiscriminator, MODES, STATUS, ContractRejection, ModelRejection, ABSTENTION } from './index.mjs';
import { createDiscriminatorApi, API_VERSION } from '../api/discriminator-api.mjs';
import { sourceIdentity, INFERENCE_CLOSURE } from '../api/host.mjs';
import { makeForgeEncoder, FORGE_OBSERVATION_CONTRACT, ENCODER_ID } from './forge-encoder.mjs';
import { makeSyntheticEncoder, assertEncoding, EncoderRejection, project } from './encoder.mjs';
import { FAMILIES, ORIGINS, PARAMETER_SCHEMA, parametersHash, validateParameters, capacityOf, hasCrossActionInteraction, comparePair, layoutOf } from './pair-model.mjs';
import { pairTableWitness, additiveScoreWitness, flatten } from '../witness/nonadditivity.mjs';
import { forgeWitness, T_CYCLE } from '../witness/nonadditivity-gate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), SK1 = resolve(HERE, '../../stage3h-sk1-safety-kernel-v1');
const fixture = (f) => JSON.parse(readFileSync(resolve(SK1, 'demo/fixtures', f), 'utf8')), FX = [fixture('forge-request-recommend.json'), fixture('forge-request-abstain.json')];
const code = (c) => (e) => (e instanceof ContractRejection || e instanceof ModelRejection || e instanceof EncoderRejection) && e.code === c;
const clone = (v) => JSON.parse(JSON.stringify(v)), H = (c) => c.repeat(64);

test('untrained: the discriminator abstains on every request, lists the complete lawful menu and says why', () => {
  const api = createDiscriminatorApi({ game: 'forge' }); assert.equal(api.status, STATUS.NOT_TRAINED);
  for (const fx of FX) { const r = api.compare(fx.state, fx.legalActions, fx.advisoryEvidence), n = fx.legalActions.length;
    assert.equal(r.apiVersion, API_VERSION); assert.equal(r.status, 'NOT_TRAINED'); assert.equal(r.decision.kind, 'ABSTAIN'); assert.equal(r.decision.reason, 'DISCRIMINATOR_NOT_TRAINED'); assert.deepEqual(r.decision.topSet, []); assert.equal(r.decision.semantics, ABSTENTION.semantics);
    assert.equal(r.legalActionMenu.size, n); assert.equal(r.legalActionMenu.complete, true); assert.equal(r.rankedActions.length, n); assert.deepEqual(r.rankedActions.map((x) => x.index).sort((a, b) => a - b), [...Array(n).keys()]);
    assert.ok(r.rankedActions.every((x) => x.inputsSupported === true && x.comparisonSupported === false && x.type === fx.legalActions[x.index].type)); // the encoder accepts the state; there is simply nothing to compare with
    assert.ok(r.uncertainty.flags.includes('DISCRIMINATOR_NOT_TRAINED')); assert.equal(r.sourceIdentity.parametersHash, null); assert.equal(r.qualification.status, 'NOT_TRAINED');
    assert.ok(r.pairwiseEvidence.matrix.every((row, i) => row.every((v, j) => (i === j ? v === 0.5 : v === null)))); }
});

test('R0: no execution, dispatch or mutation; privileged, label and unknown inputs are refused before anything is computed', () => {
  const api = createDiscriminatorApi({ game: 'forge' }), fx = FX[0], r = api.compare(fx.state, fx.legalActions, fx.advisoryEvidence);
  assert.deepEqual(r.authority, { state: 'R0', mode: 'OBSERVATION_AND_RECOMMENDATION_ONLY', canDispatch: false, canMutateLiveWorld: false, promotedToRuntime: false });
  for (const m of ['execute', 'dispatch', 'mutate', 'apply', 'commit', 'act']) assert.throws(() => api[m](), code('EXECUTION_OR_MUTATION_REQUESTED'), m);
  for (const k of ['execute', 'Execute', 'executeAction', 'doDispatch', 'mutation', 'commit', 'apply', 'act', 'run', 'perform', 'enact']) assert.throws(() => api.compare(fx.state, fx.legalActions, fx.advisoryEvidence, { [k]: true }), code('EXECUTION_OR_MUTATION_REQUESTED'), k);
  assert.throws(() => api.compare(fx.state, fx.legalActions, fx.advisoryEvidence, { mode: 'EXECUTE' }), code('EXECUTION_OR_MUTATION_REQUESTED'));
  for (const k of ['tau', 'threshold', 'forceRecommend', 'parameters']) assert.throws(() => api.compare(fx.state, fx.legalActions, fx.advisoryEvidence, { [k]: 1 }), code('UNKNOWN_OPTION'), k);
  for (const k of ['truth', 'Truth', 'world_hash', 'worldHash', 'seed', 'hiddenHealth', 'hidden_value', 'evaluatorTruth', 'regret', 'catastrophic', 'introS0', 'introducesVsNexus', 'label', 'members', 'rollouts', 'outcome']) {
    const s = clone(fx.state); s.projection.actor[k] = 1; assert.throws(() => api.compare(s, fx.legalActions, fx.advisoryEvidence), code('PRIVILEGED_FIELD_IN_REQUEST'), k);
    const a = clone(fx.legalActions); a[0][k] = 1; assert.throws(() => api.compare(fx.state, a, fx.advisoryEvidence), code('PRIVILEGED_FIELD_IN_REQUEST'), k); }
  for (const k of ['id', 'handle', 'name', 'menuIndex', 'position', 'ordinal']) { const a = clone(fx.legalActions); a[1][k] = 'x7'; assert.throws(() => api.compare(fx.state, a, fx.advisoryEvidence), code('ARBITRARY_IDENTIFIER_IN_DESCRIPTOR'), k); }
  assert.throws(() => api.compare(null, fx.legalActions, null), code('STATE_NOT_AN_OBJECT')); assert.throws(() => api.compare(fx.state, [], null), code('EMPTY_LEGAL_MENU')); assert.throws(() => api.compare(fx.state, 'x', null), code('LEGAL_ACTIONS_NOT_AN_ARRAY'));
  assert.throws(() => api.compare(fx.state, [{}], fx.advisoryEvidence), code('ACTION_TYPE_MISSING'));
  assert.throws(() => api.compare({ ...fx.state, observationContract: { id: 'OTHER', version: '1' } }, fx.legalActions, fx.advisoryEvidence), code('OBSERVATION_CONTRACT_MISMATCH'));
  assert.throws(() => api.compare({ ...fx.state, observationContract: { ...fx.state.observationContract, version: 'HW1_PUBLIC_PROJECTION_V9' } }, fx.legalActions, fx.advisoryEvidence), code('OBSERVATION_CONTRACT_MISMATCH'));
});

test('unsupported expert evidence is refused; absent or invalid evidence leaves nothing supported', () => {
  const api = createDiscriminatorApi({ game: 'forge' }), fx = FX[0], ev = (f) => { const e = clone(fx.advisoryEvidence); f(e); return e; };
  assert.throws(() => api.compare(fx.state, fx.legalActions, ev((e) => { e.contract = 'OTHER_V9'; })), code('UNSUPPORTED_EXPERT_EVIDENCE'));
  assert.throws(() => api.compare(fx.state, fx.legalActions, ev((e) => { e.experts.VANGUARD = { kind: 'PUBLIC_SCORE' }; })), code('UNSUPPORTED_EXPERT_EVIDENCE'));
  assert.throws(() => api.compare(fx.state, fx.legalActions, ev((e) => { e.experts.S0.kind = 'ORACLE_ROLLOUT'; })), code('UNSUPPORTED_EXPERT_EVIDENCE')); // the SK1 finding F5 input
  const enc = makeForgeEncoder(), absent = enc(fx.state, fx.legalActions, null); assert.ok(absent.supported.every((s) => !s)); assert.ok(absent.unsupportedReasons[0].some((x) => x.startsWith('ADVISORY_EVIDENCE_NOT_VALID')));
  const bad = enc(fx.state, fx.legalActions, ev((e) => { e.experts.S0.scores = e.experts.S0.scores.slice(1); })); assert.ok(bad.supported.every((s) => !s));
  const d = createDiscriminator({ encoder: enc, parameters: forgeWitness(enc), mode: MODES.SYNTHETIC }), r = d.compare(fx.state, fx.legalActions, null); assert.equal(r.decision.kind, 'ABSTAIN'); assert.equal(r.decision.reason, 'NO_SUPPORTED_COMPARISON'); assert.ok(r.decision.unsupportedReasons.some((x) => x.startsWith('ADVISORY_EVIDENCE_NOT_VALID')));
});

test('the Forge encoder is strict where the frozen SK1 adapter imputed: unknown vocabulary and missing public fields are unsupported, never estimated', () => {
  const enc = makeForgeEncoder(), fx = FX[0], n = fx.legalActions.length, ok = enc(fx.state, fx.legalActions, fx.advisoryEvidence); assertEncoding(ok, n); assert.ok(ok.supported.every(Boolean));
  assert.equal(enc.encoderId, ENCODER_ID); assert.deepEqual(enc.observationContract, FORGE_OBSERVATION_CONTRACT); assert.equal(ok.descriptors[0].length, enc.schema.descriptor.length);
  // F3: an action type outside the vocabulary — that action only, and it stays in the menu
  const a1 = clone(fx.legalActions); a1[0].type = 'TELEPORT'; const e1 = enc(fx.state, a1, fx.advisoryEvidence); assert.equal(e1.supported[0], false); assert.ok(e1.unsupportedReasons[0].includes('ACTION_TYPE_OUTSIDE_VOCABULARY:TELEPORT')); assert.equal(e1.keys.length, n);
  // F3: an entity kind outside the vocabulary — shared context is affected, so nothing is supported
  const s2 = clone(fx.state); s2.projection.nodes[0].kind = 'WORMHOLE'; assert.ok(enc(s2, fx.legalActions, fx.advisoryEvidence).supported.every((s) => !s));
  // F4: fields the frozen adapter silently imputed
  for (const [what, mut] of [['terrainCounts', (s) => { delete s.projection.terrainCounts; }], ['history.channels', (s) => { delete s.projection.history.channels; }], ['node flag', (s) => { delete s.projection.nodes[1].flags.hub; }], ['actor.health', (s) => { delete s.projection.actor.health; }], ['version', (s) => { s.projection.version = 'HW1_PUBLIC_PROJECTION_V0'; }]]) {
    const s = clone(fx.state); mut(s); const e = enc(s, fx.legalActions, fx.advisoryEvidence); assert.ok(e.supported.every((x) => !x), what); assert.ok(e.unsupportedReasons[0].length > 0, what); }
  const a3 = clone(fx.legalActions); delete a3[2].destTerrain; const e3 = enc(fx.state, a3, fx.advisoryEvidence); assert.equal(e3.supported[2], false); assert.ok(e3.unsupportedReasons[2].includes('MISSING_PUBLIC_FIELD:action.destTerrain')); assert.equal(e3.supported.filter(Boolean).length, n - 1);
  assert.throws(() => enc({ observationContract: FORGE_OBSERVATION_CONTRACT, projection: {} }, fx.legalActions, fx.advisoryEvidence), code('NOT_A_FORGE_PUBLIC_PROJECTION'));
  // the ladder's input sets are declared subsets of the schema; M2 and M3a see the same per-action inputs; only M3 takes pair relations
  const fs = enc.featureSets; assert.deepEqual(fs.M0, fs.M1); assert.deepEqual(fs.M2.descriptor, fs.M3a.descriptor); assert.deepEqual(fs.M3a.relation, []); assert.deepEqual(fs.M3.relation, [...enc.schema.relation]); assert.ok(fs.M0.descriptor.every((nm) => fs.M2.descriptor.includes(nm)) && fs.M2.descriptor.length > fs.M0.descriptor.length);
  assert.equal(fs.M0.descriptor.length + fs.M0.context.length, 144); for (const r of [ok.relation(0, 1), ok.relation(1, 0)]) assert.equal(r.length, enc.schema.relation.length);
});

test('context inputs really are shared by the menu, and pair relations are consistent with their meaning', () => {
  const enc = makeForgeEncoder(), R = enc.schema.relation;
  for (const fx of FX) { const e = enc(fx.state, fx.legalActions, fx.advisoryEvidence), n = e.n, same = R.indexOf('pair.sameType'), dm = R.indexOf('pair.destManhattan'), dc = R.indexOf('pair.diff.cost'), ds = R.indexOf('pair.diff.s0Score'), ao = R.indexOf('pair.s0.aInTopOnly'), bo = R.indexOf('pair.s0.bInTopOnly');
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) { const a = e.relation(i, j), b = e.relation(j, i);
      assert.equal(a[same], Number(fx.legalActions[i].type === fx.legalActions[j].type)); assert.equal(a[same], b[same]); assert.equal(a[dm], b[dm]); assert.equal(a[dc], -b[dc] + 0); assert.ok(Math.abs(a[ds] + b[ds]) < 1e-12); assert.equal(a[ao], b[bo]); } }
});

test('parameter sets are validated structurally and must declare where they came from', () => {
  const good = pairTableWitness(T_CYCLE); assert.equal(validateParameters(good), true); assert.equal(good.origin, ORIGINS.SYNTHETIC); assert.equal(good.parametersHash, parametersHash(good));
  const mk = (f) => { const p = clone(good); delete p.parametersHash; f(p); return p; }, bad = (f, c) => assert.throws(() => validateParameters(mk(f)), code(c), c);
  bad((p) => { p.schema = 'X'; }, 'PARAMETER_SCHEMA_MISMATCH'); bad((p) => { p.family = 'SOMETHING'; }, 'UNKNOWN_MODEL_FAMILY'); bad((p) => { delete p.origin; }, 'PARAMETER_ORIGIN_NOT_DECLARED'); bad((p) => { p.origin = 'TRAINED'; }, 'PARAMETER_ORIGIN_NOT_DECLARED');
  bad((p) => { p.bags = []; }, 'PARAMETERS_WITHOUT_BAGS'); bad((p) => { p.bags[0].trees = []; }, 'BAG_WITHOUT_TREES'); bad((p) => { p.bags[0].trees[0].f[0] = 99; }, 'TREE_SPLIT_OUTSIDE_INPUT_LAYOUT'); bad((p) => { p.bags[0].trees[0].l[0] = 0; }, 'TREE_CHILD_INDEX_INVALID');
  bad((p) => { const t = p.bags[0].trees[0]; t.v[t.f.findIndex((x) => x < 0)] = null; }, 'TREE_LEAF_NOT_FINITE'); bad((p) => { p.bags[0].trees[0].t[0] = 'x'; }, 'TREE_THRESHOLD_NOT_FINITE'); bad((p) => { p.layout.descriptor = []; }, 'PARAMETER_LAYOUT_EMPTY_DESCRIPTOR');
  bad((p) => { p.family = FAMILIES.ADDITIVE; p.layout.relation = ['pair.x']; }, 'ADDITIVE_FAMILY_CANNOT_TAKE_PAIR_RELATIONS'); bad((p) => { p.layout.context = ['suit']; }, 'PARAMETER_LAYOUT_DUPLICATE_NAME');
  const tampered = clone(good); tampered.bags[0].trees[0].v[tampered.bags[0].trees[0].f.findIndex((x) => x < 0)] += 1; assert.throws(() => validateParameters(tampered), code('PARAMETERS_HASH_MISMATCH'));
  assert.deepEqual(capacityOf(good), { family: FAMILIES.PAIR, bags: 1, treesPerBag: 1, maxDepth: 4, totalNodes: 17, totalLeaves: 9, inputWidth: 2 }); assert.equal(layoutOf(additiveScoreWitness([0, 1])).width, 1);
  assert.equal(comparePair(good, [0], [NaN], [], [], []), null); assert.equal(comparePair(good, [0], [1, 2], [], [], []), null); // a missing input is an unsupported comparison, never a guess
});

test('nothing can pass for trained: synthetic parameters only in synthetic mode, learned parameters only with bound provenance', () => {
  const suit = makeSyntheticEncoder({ id: 'SYNTHETIC_SUIT_ENCODER_V1', descriptor: ['suit'] }), W = pairTableWitness(T_CYCLE), forge = makeForgeEncoder();
  assert.throws(() => createDiscriminator({ encoder: suit, parameters: W }), code('SYNTHETIC_ENCODER_OUTSIDE_SYNTHETIC_MODE')); assert.throws(() => createDiscriminator({ encoder: forge, parameters: forgeWitness(forge) }), code('SYNTHETIC_PARAMETERS_OUTSIDE_SYNTHETIC_MODE'));
  assert.throws(() => createDiscriminatorApi({ game: 'forge', parameters: forgeWitness(forge) }), code('SYNTHETIC_PARAMETERS_OUTSIDE_SYNTHETIC_MODE')); assert.throws(() => makeSyntheticEncoder({ id: 'FORGE_LIKE', descriptor: ['x'] }), code('SYNTHETIC_ENCODER_ID_MUST_SAY_SO'));
  const d = createDiscriminator({ encoder: forge, parameters: forgeWitness(forge), mode: MODES.SYNTHETIC }), r = d.compare(FX[0].state, FX[0].legalActions, FX[0].advisoryEvidence);
  assert.equal(r.status, STATUS.SYNTHETIC); assert.equal(r.qualification.status, 'NOT_TRAINED'); assert.match(r.qualification.statement, /No decision competence is claimed/); assert.equal(r.sourceIdentity.parametersOrigin, ORIGINS.SYNTHETIC);
  // a parameter set that CLAIMS to be learned needs complete provenance bound to exactly those parameters, and still cannot call itself qualified
  const learned = (() => { const p = clone(forgeWitness(forge)); delete p.parametersHash; p.origin = ORIGINS.LEARNED; p.parametersHash = parametersHash(p); return p; })();
  const prov = { discriminatorId: 'SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1', sourceHash: H('a'), modelHash: learned.parametersHash, observationContract: FORGE_OBSERVATION_CONTRACT, labelContract: 'HDISC_SAFETY_LABEL_CONTRACT_V1', trainingPopulationDigest: H('c'), exclusionRegistryHash: H('d'), preregistrationHash: H('e'), qualification: { status: 'NOT_QUALIFIED' } };
  assert.throws(() => createDiscriminator({ encoder: forge, parameters: learned }), code('PROVENANCE_MISSING')); assert.throws(() => createDiscriminator({ encoder: forge, parameters: learned, provenance: { ...prov, modelHash: H('f') } }), code('PROVENANCE_DOES_NOT_BIND_THESE_PARAMETERS'));
  assert.throws(() => createDiscriminator({ encoder: forge, parameters: learned, provenance: { ...prov, qualification: { status: 'QUALIFIED' } } }), code('PROVENANCE_QUALIFICATION_LABEL_NOT_ALLOWED')); assert.throws(() => createDiscriminator({ encoder: forge, parameters: learned, provenance: prov, mode: MODES.SYNTHETIC }), code('LEARNED_PARAMETERS_IN_SYNTHETIC_MODE'));
  assert.throws(() => createDiscriminator({ encoder: suit, parameters: forgeWitness(forge), mode: MODES.SYNTHETIC }), code('PARAMETER_LAYOUT_NOT_IN_ENCODER_SCHEMA')); assert.throws(() => createDiscriminator({ parameters: W }), code('ENCODER_REQUIRED')); assert.throws(() => createDiscriminator({ encoder: forge, mode: 'LIVE' }), code('UNKNOWN_MODE'));
  // this file creates no learned parameter: the object above is a relabelled hand-built witness used only to exercise the refusals, and it is never evaluated
});

test('deterministic: equal requests give an identical record; replay checks both digests; inputs are never written to', () => {
  const forge = makeForgeEncoder(), d = createDiscriminator({ encoder: forge, parameters: forgeWitness(forge), mode: MODES.SYNTHETIC, sourceIdentity: { sourceHash: sourceIdentity().sourceHash } });
  for (const fx of FX) { const before = JSON.stringify(fx), a = d.compare(fx.state, fx.legalActions, fx.advisoryEvidence), b = d.compare(clone(fx.state), clone(fx.legalActions), clone(fx.advisoryEvidence));
    assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.equal(JSON.stringify(fx), before); assert.equal(JSON.stringify(JSON.parse(JSON.stringify(a))), JSON.stringify(a)); assert.ok(Object.isFrozen(a));
    assert.deepEqual(d.replay(fx, { decisionDigest: a.decisionDigest, recordHash: a.recordHash }), { reproduced: true, decisionDigest: a.decisionDigest, recordHash: a.recordHash }); assert.equal(d.replay(fx, { decisionDigest: H('0') }).reproduced, false);
    assert.equal(a.sourceIdentity.sourceHash, sourceIdentity().sourceHash); assert.match(a.decisionDigest, /^[0-9a-f]{64}$/);
    // legality: the ranking is a permutation of the lawful menu and the top set lies inside it; every number is finite and every probability in [0, 1]
    assert.deepEqual(a.rankedActions.map((x) => x.index).sort((x, y) => x - y), [...Array(fx.legalActions.length).keys()]); assert.ok(a.decision.topSet.every((i) => i >= 0 && i < fx.legalActions.length));
    for (const row of a.pairwiseEvidence.matrix) for (const v of row) assert.ok(v === null || (Number.isFinite(v) && v >= 0 && v <= 1)); const M = a.pairwiseEvidence.matrix; for (let i = 0; i < M.length; i++) for (let j = 0; j < M.length; j++) if (M[i][j] !== null) assert.ok(Math.abs(M[i][j] + M[j][i] - 1) <= 1e-12);
    assert.equal(a.uncertainty.status, 'HEURISTIC_NOT_A_CALIBRATED_CONFIDENCE_STATEMENT'); assert.match(a.decision.note, /not a statement that the action is safe/); }
});

test('public deterministic constraints come first and unsupported actions are demoted, in the full pipeline', () => {
  const enc = makeSyntheticEncoder({ id: 'SYNTHETIC_SUIT_ENCODER_V1', descriptor: ['suit'] }), W = additiveScoreWitness([0, 1, 2, 3]), d = createDiscriminator({ encoder: enc, parameters: W, mode: MODES.SYNTHETIC }), oc = { observationContract: { id: enc.schema.id, version: '1' } };
  const m = (extra) => [0, 1, 2].map((s, i) => ({ key: `k${i}`, signature: `suit:${s}`, type: 'SYNTH', descriptor: { suit: s }, ...(extra[i] ?? {}) }));
  assert.deepEqual(d.compare(oc, m({}), null).decision.topSet, [0]);
  const ex = d.compare(oc, m({ 0: { excluded: true } }), null); assert.deepEqual(ex.decision.topSet, [1]); assert.equal(ex.rankedActions.at(-1).index, 0); assert.ok(ex.rankedActions.at(-1).reasons.includes('EXCLUDED_BY_PUBLIC_CONSTRAINT')); assert.equal(ex.legalActionMenu.complete, true);
  const un = d.compare(oc, m({ 0: { supported: false } }), null); assert.deepEqual(un.decision.topSet, [1]); assert.ok(un.uncertainty.flags.includes('SOME_ACTIONS_WITHOUT_SUPPORTED_COMPARISON')); assert.equal(un.rankedActions.find((x) => x.index === 0).inputsSupported, false);
  const miss = d.compare(oc, [{ key: 'a', signature: 'a', type: 'SYNTH', descriptor: {} }, { key: 'b', signature: 'b', type: 'SYNTH', descriptor: { suit: 1 } }, { key: 'c', signature: 'c', type: 'SYNTH', descriptor: { suit: 2 } }], null); assert.deepEqual(miss.decision.topSet, [1]); assert.ok(miss.rankedActions.find((x) => x.index === 0).reasons.includes('MISSING_PUBLIC_DESCRIPTOR'));
  const all = d.compare(oc, m({ 0: { excluded: true }, 1: { excluded: true }, 2: { excluded: true } }), null); assert.equal(all.decision.kind, 'ABSTAIN'); assert.equal(all.decision.reason, 'ALL_ACTIONS_EXCLUDED_BY_PUBLIC_CONSTRAINT');
  assert.equal(d.compare(oc, [m({})[1]], null).decision.topSet.length, 1); // a one-action menu
});

test('the source identity covers exactly the declared inference closure and changes with any byte of it', () => {
  const id = sourceIdentity(); assert.equal(id.files.length, INFERENCE_CLOSURE.length); assert.deepEqual(id.files.map((f) => f.file), [...INFERENCE_CLOSURE]); assert.match(id.sourceHash, /^[0-9a-f]{64}$/);
  const api = createDiscriminatorApi({ game: 'forge' }), desc = api.describe(); assert.equal(desc.sourceIdentity.sourceHash, id.sourceHash); assert.deepEqual(desc.refuses, ['execute', 'dispatch', 'mutate', 'apply', 'commit', 'act']); assert.deepEqual(desc.capabilities, ['compare', 'replay', 'describe']);
  assert.equal(desc.status, 'NOT_TRAINED'); assert.equal(desc.authority.canDispatch, false); assert.equal(desc.sourceIdentity.encoderSchemaId, makeForgeEncoder().schema.id); assert.equal(hasCrossActionInteraction(forgeWitness(makeForgeEncoder())).crossActionPath, true);
  assert.ok(project(makeForgeEncoder()(FX[0].state, FX[0].legalActions, FX[0].advisoryEvidence), { descriptor: ['no.such.input'], relation: [], context: [] }) === null);
});
