// H-DISC-0 contract tests. Run: node --test contract/*.test.mjs
// SYNTHETIC, DETERMINISTIC FIXTURES ONLY. No game, no world, no evaluator, no trained model. A passing fixture shows
// that the contract can be implemented and checked; it shows nothing about learned decision competence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDS, AUTHORITY, ContractRejection, antisymmetrize, assertComparisonMatrix, compareAll, rankMenu, assertMenu, assertPublicRequest, assertSupportedEvidence, assertProvenance, createDiscriminator, actionLabel, pairLabel, LABEL_FAMILIES } from './pairwise-contract.mjs';

const H = (c) => c.repeat(64), OC = { id: 'SYNTHETIC_FIXTURE_OBSERVATION_V1', version: '1' };
const PROV = { discriminatorId: IDS.discriminator, sourceHash: H('a'), modelHash: H('b'), observationContract: OC, labelContract: IDS.labelContract, trainingPopulationDigest: H('c'), exclusionRegistryHash: H('d'), preregistrationHash: H('e'), qualification: { status: 'NOT_TRAINED' } };
const code = (c) => (e) => e instanceof ContractRejection && e.code === c;
// fixtures -------------------------------------------------------------------------------------------------------
const byRisk = antisymmetrize((a, b) => 4 * (b.r - a.r));                      // transitive: lower synthetic r is "safer"
const BEATS = { R: 'S', S: 'P', P: 'R' }, rps = antisymmetrize((a, b) => (a.s === b.s ? 0 : a.dominates || BEATS[a.s] === b.s ? (b.dominates ? 0 : 2) : -2)); // deliberately intransitive
const act = (key, descriptor, extra = {}) => ({ key, type: 'SYNTH', descriptor, ...extra });
const menuOf = (risks) => risks.map((r, i) => act(`k${i}`, { r }));
const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
const viewByKey = (res) => res.ranked.map((x) => [x.key, x.rank, x.supported, x.relativeSafety, x.worstCaseComparison, x.inCycle]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
const rank = (actions, cmp) => { const { P, issues } = compareAll(actions, cmp); return { ...rankMenu(actions, P), issues }; };

test('pair symmetry: p(a,b) + p(b,a) = 1 exactly and p(a,a) = 1/2, for every pair of a grid of descriptors', () => {
  const ds = [-3, -1, -0.25, 0, 0.1, 0.5, 2, 7].map((r) => ({ r }));
  for (const a of ds) for (const b of ds) { const p = byRisk(a, b), q = byRisk(b, a); assert.ok(p >= 0 && p <= 1); assert.ok(Math.abs(p + q - 1) <= 1e-12, `${a.r},${b.r}`); if (a.r === b.r) assert.equal(p, 0.5); if (a.r < b.r) assert.ok(p > 0.5); }
});

test('a raw scorer with a directional bias is consistent after antisymmetrisation; used raw it is withheld, never averaged', () => {
  const biased = (a, b) => 4 * (b.r - a.r) + 0.7, sig = (x) => 1 / (1 + Math.exp(-x)), m = menuOf([0.1, 0.4, 0.9]);
  const good = rank(m, antisymmetrize(biased)); assert.equal(good.order.kind, 'ORDERED'); assert.deepEqual(good.order.topKeys, ['k0']); assert.deepEqual(good.issues, []);
  const bad = rank(m, (a, b) => sig(biased(a, b))); assert.equal(bad.issues.length, 3); assert.ok(bad.issues.every((i) => i.code === 'PAIRWISE_SCORES_INCONSISTENT'));
  assert.equal(bad.order.kind, 'NO_ORDER'); assert.equal(bad.order.reason, 'NO_SUPPORTED_COMPARISON'); assert.deepEqual(bad.order.topSet, []);
});

test('a comparison matrix that violates the contract is rejected with its own code', () => {
  const ok = [[0.5, 0.8], [0.2, 0.5]]; assert.doesNotThrow(() => assertComparisonMatrix(ok, 2));
  assert.throws(() => assertComparisonMatrix([[0.5, 0.8]], 2), code('COMPARISON_MATRIX_SHAPE')); assert.throws(() => assertComparisonMatrix([[0.4, 0.8], [0.2, 0.5]], 2), code('COMPARISON_DIAGONAL_NOT_ONE_HALF'));
  assert.throws(() => assertComparisonMatrix([[0.5, 0.8], [0.3, 0.5]], 2), code('PAIRWISE_SCORES_INCONSISTENT')); assert.throws(() => assertComparisonMatrix([[0.5, 1.2], [-0.2, 0.5]], 2), code('COMPARISON_OUT_OF_RANGE'));
  assert.throws(() => assertComparisonMatrix([[0.5, NaN], [0.2, 0.5]], 2), code('COMPARISON_NOT_FINITE')); assert.throws(() => assertComparisonMatrix([[0.5, null], [0.2, 0.5]], 2), code('COMPARISON_SUPPORT_NOT_SYMMETRIC'));
});

test('a transitive fixture gives a complete ranking in its own order, with one top action and no cycle', () => {
  const res = rank(menuOf([0.6, 0.1, 0.9, 0.3]), byRisk); assert.equal(res.complete, true); assert.equal(res.ranked.length, 4);
  assert.deepEqual(res.ranked.map((x) => x.key), ['k1', 'k3', 'k0', 'k2']); assert.deepEqual(res.ranked.map((x) => x.rank), [0, 1, 2, 3]); assert.deepEqual(res.order.topSet, [1]);
  assert.deepEqual(res.cycles, []); assert.equal(res.order.strictOrderSupported, true); assert.ok(res.order.marginToRunnerUp > 0); assert.deepEqual(res.order.reasons, []);
});

test('menu-order invariance: every one of the 120 orderings of a five-action menu gives bit-identical scores and ranks per key', () => {
  const base = menuOf([0.31, 0.07, 0.52, 0.18, 0.44]), ref = JSON.stringify(viewByKey(rank(base, byRisk)));
  for (const p of perms(base)) assert.equal(JSON.stringify(viewByKey(rank(p, byRisk))), ref);
  const cyc = [act('a', { s: 'R' }), act('b', { s: 'P' }), act('c', { s: 'S' }), act('d', { s: 'R' })], refC = JSON.stringify(viewByKey(rank(cyc, rps)));
  for (const p of perms(cyc)) { const r = rank(p, rps); assert.equal(JSON.stringify(viewByKey(r)), refC); assert.deepEqual(r.order.topKeys, rank(cyc, rps).order.topKeys); }
});

test('identity invariance: renaming keys and listing signatures changes labels only, never the order or the scores', () => {
  const risks = [0.31, 0.07, 0.52, 0.18], a = risks.map((r, i) => act(`alpha-${i}`, { r }, { signature: `z${9 - i}` })), b = risks.map((r, i) => act(`omega-${3 - i}-x`, { r }, { signature: `a${i}` }));
  const ra = rank(a, byRisk), rb = rank(b, byRisk), strip = (res) => res.ranked.map((x) => [x.index, x.rank, x.relativeSafety, x.worstCaseComparison]).sort((x, y) => x[0] - y[0]);
  assert.deepEqual(strip(ra), strip(rb)); assert.deepEqual(ra.order.topSet, rb.order.topSet);
});

test('no lexical tie-break: distinct actions the comparator cannot separate are returned together, whatever they are called', () => {
  for (const names of [['aaa', 'zzz'], ['zzz', 'aaa'], ['m1', 'm0']]) for (const sigs of [['1', '2'], ['2', '1']]) {
    const m = [act(names[0], { r: 0.2 }, { signature: sigs[0] }), act(names[1], { r: 0.2 }, { signature: sigs[1] }), act('worse', { r: 0.8 })], res = rank(m, byRisk);
    assert.deepEqual(res.order.topSet, [0, 1]); assert.equal(res.order.distinctActionsInTopSet, 2); assert.ok(res.order.reasons.includes('INDISTINGUISHABLE_DISTINCT_ACTIONS')); assert.equal(res.order.strictOrderSupported, false); }
});

test('equivalent actions (one canonical key) tie without being called indistinguishable distinct actions', () => {
  const res = rank([act('orbit', { r: 0.2 }), act('orbit', { r: 0.2 }), act('other', { r: 0.7 })], byRisk);
  assert.deepEqual(res.order.topSet, [0, 1]); assert.equal(res.order.distinctActionsInTopSet, 1); assert.deepEqual(res.order.reasons, ['TIE_WITHIN_EQUIVALENT_ACTIONS']); assert.equal(res.order.strictOrderSupported, true);
});

test('cycles: an intransitive fixture is ranked, the cycle is reported, and a top set inside it is flagged as not strictly ordered', () => {
  const m = [act('rock', { s: 'R' }), act('paper', { s: 'P' }), act('scissors', { s: 'S' })], res = rank(m, rps);
  assert.deepEqual(res.cycles, [['paper', 'rock', 'scissors']]); assert.deepEqual(res.order.topSet, [0, 1, 2]); assert.ok(res.order.reasons.includes('TOP_SET_IN_A_COMPARISON_CYCLE')); assert.equal(res.order.strictOrderSupported, false);
  assert.ok(res.ranked.every((x) => x.inCycle && x.rank === 0 && x.relativeSafety === res.ranked[0].relativeSafety));
  // a dominant action above a cycle: the cycle is still reported, but the top is outside it and strictly ordered
  const dom = antisymmetrize((a, b) => (a.top ? 3 : b.top ? -3 : a.s === b.s ? 0 : BEATS[a.s] === b.s ? 2 : -2)), r2 = rank([...m, act('clear', { top: true, s: 'X' })], dom);
  assert.deepEqual(r2.order.topKeys, ['clear']); assert.deepEqual(r2.cycles, [['paper', 'rock', 'scissors']]); assert.equal(r2.order.strictOrderSupported, true); assert.deepEqual(r2.order.reasons, []);
});

test('missing or invalid estimates: the affected action is demoted and reported, never repaired; with nothing supported there is no order', () => {
  const holes = (bad) => (a, b) => (a.r === bad || b.r === bad ? NaN : byRisk(a, b)), m = menuOf([0.05, 0.3, 0.6]);
  const res = rank(m, holes(0.05)); assert.deepEqual(res.order.topKeys, ['k1']); assert.equal(res.ranked.find((x) => x.key === 'k0').supported, false); assert.equal(res.ranked.at(-1).key, 'k0');
  assert.ok(res.order.reasons.includes('SOME_ACTIONS_WITHOUT_SUPPORTED_COMPARISON')); assert.equal(res.unsupportedActions, 1); assert.ok(res.issues.every((i) => i.code === 'COMPARISON_MISSING_OR_INVALID'));
  for (const v of [null, undefined, 1.3, -0.1, Infinity, 'x']) assert.equal(rank(m, () => v).order.kind, 'NO_ORDER');
  const flagged = rank([act('a', { r: 0.01 }, { supported: false }), act('b', { r: 0.5 }), act('c', { r: 0.7 })], byRisk); assert.deepEqual(flagged.order.topKeys, ['b']); assert.equal(flagged.issues[0].code, 'ACTION_WITHOUT_SUPPORTED_EVIDENCE');
});

test('public deterministic constraints come first: an excluded action is never in the top set; all excluded means no order', () => {
  const res = rank([act('best-but-excluded', { r: 0.0 }, { excluded: true }), act('b', { r: 0.4 }), act('c', { r: 0.6 })], byRisk);
  assert.deepEqual(res.order.topKeys, ['b']); assert.equal(res.ranked.at(-1).key, 'best-but-excluded'); assert.equal(res.ranked.at(-1).excluded, true); assert.equal(res.complete, true);
  const none = rank(menuOf([0.1, 0.2]).map((a) => ({ ...a, excluded: true })), byRisk); assert.equal(none.order.kind, 'NO_ORDER'); assert.equal(none.order.reason, 'ALL_ACTIONS_EXCLUDED_BY_PUBLIC_CONSTRAINT');
});

test('variable menu sizes: one, two and fourteen actions', () => {
  const one = rank(menuOf([0.4]), byRisk); assert.deepEqual(one.order.topSet, [0]); assert.equal(one.ranked[0].relativeSafety, 0.5); assert.equal(one.order.marginToRunnerUp, null);
  assert.deepEqual(rank(menuOf([0.4, 0.1]), byRisk).order.topSet, [1]);
  const risks = Array.from({ length: 14 }, (_, i) => ((i * 37) % 14) / 14), big = rank(menuOf(risks), byRisk); assert.equal(big.ranked.length, 14); assert.equal(big.order.topKeys[0], `k${risks.indexOf(0)}`); assert.equal(new Set(big.ranked.map((x) => x.index)).size, 14);
});

test('invalid action identities are refused', () => {
  assert.throws(() => assertMenu('x'), code('LEGAL_ACTIONS_NOT_AN_ARRAY')); assert.throws(() => assertMenu([]), code('EMPTY_LEGAL_MENU')); assert.throws(() => assertMenu([null]), code('MALFORMED_ACTION'));
  assert.throws(() => assertMenu([{ type: 'T', descriptor: {} }]), code('ACTION_KEY_MISSING')); assert.throws(() => assertMenu([{ key: 'k', descriptor: {} }]), code('ACTION_TYPE_MISSING')); assert.throws(() => assertMenu([{ key: 'k', type: 'T' }]), code('ACTION_DESCRIPTOR_MISSING'));
  for (const bad of ['id', 'handle', 'name', 'menuIndex', 'menu_position', 'Position', 'ordinal']) { assert.throws(() => assertPublicRequest({ legalActions: [{ key: 'k', type: 'T', descriptor: { [bad]: 3 } }] }), code('ARBITRARY_IDENTIFIER_IN_DESCRIPTOR'), bad); assert.throws(() => assertPublicRequest({ legalActions: [{ key: 'k', type: 'T', [bad]: 3, descriptor: {} }] }), code('ARBITRARY_IDENTIFIER_IN_DESCRIPTOR'), bad); }
});

test('unsupported expert evidence is refused, not ignored', () => {
  const ok = { contract: 'SK1_ADVISORY_EVIDENCE_V1', experts: { S0: { kind: 'PUBLIC_SCORE', scores: [1, 2], topSet: [1] }, NEXUS: { kind: 'RECOMMENDATION_PROJECTION', abstain: true } } };
  assert.deepEqual(assertSupportedEvidence(ok), { status: 'VALID', experts: ['NEXUS', 'S0'] }); assert.deepEqual(assertSupportedEvidence(null), { status: 'ABSENT' });
  for (const bad of [{ ...ok, contract: 'OTHER_V9' }, { ...ok, experts: { ...ok.experts, VANGUARD: { kind: 'PUBLIC_SCORE' } } }, { ...ok, experts: { S0: { kind: 'ORACLE_ROLLOUT' } } }, { contract: ok.contract }, [], 'x'])
    assert.throws(() => assertSupportedEvidence(bad), code('UNSUPPORTED_EXPERT_EVIDENCE'));
});

const request = (legalActions, extra = {}) => ({ observationContract: OC, state: { grid: 5 }, legalActions, advisoryEvidence: null, ...extra });
test('the interface is R0: it compares and ranks, refuses every execution request and every privileged or label field', () => {
  const d = createDiscriminator({ comparator: byRisk, provenance: PROV }), out = d.compareMenu(request(menuOf([0.3, 0.1])));
  assert.deepEqual(out.order.topKeys, ['k1']); assert.deepEqual(out.authority, AUTHORITY); assert.equal(out.authority.canDispatch, false); assert.equal(out.authority.canMutateLiveWorld, false); assert.equal(out.status, 'DESIGN_REFERENCE_NOT_A_TRAINED_MODEL'); assert.equal(out.qualification.status, 'NOT_TRAINED');
  for (const m of ['execute', 'dispatch', 'mutate', 'apply', 'commit', 'act']) assert.throws(() => d[m](), code('EXECUTION_OR_MUTATION_REQUESTED'), m);
  for (const k of ['execute', 'Execute', 'executeAction', 'doDispatch', 'mutation', 'commit', 'apply', 'act', 'run', 'perform']) assert.throws(() => d.compareMenu(request(menuOf([0.3, 0.1]), { [k]: true })), code('EXECUTION_OR_MUTATION_REQUESTED'), k);
  assert.throws(() => d.compareMenu(request(menuOf([0.3]), { mode: 'EXECUTE' })), code('EXECUTION_OR_MUTATION_REQUESTED'));
  for (const k of ['truth', 'Truth', 'world_hash', 'worldHash', 'seed', 'hiddenHealth', 'hidden_value', 'evaluatorTruth', 'regret', 'catastrophic', 'introS0', 'introducesVsNexus', 'label', 'members', 'rollouts', 'outcome']) {
    assert.throws(() => d.compareMenu(request(menuOf([0.3, 0.1]), { state: { [k]: 1 } })), code('PRIVILEGED_FIELD_IN_REQUEST'), k); assert.throws(() => d.compareMenu(request([act('k', { [k]: 1 })])), code('PRIVILEGED_FIELD_IN_REQUEST'), k); }
  assert.deepEqual(d.describe().refuses, ['execute', 'dispatch', 'mutate', 'apply', 'commit', 'act']); assert.equal(d.describe().competence, 'NOT_A_COMPETENCE_DEMONSTRATION');
});

test('source provenance is required: no provenance, no discriminator', () => {
  assert.throws(() => createDiscriminator({ comparator: byRisk }), code('PROVENANCE_MISSING'));
  for (const f of Object.keys(PROV)) { const p = { ...PROV }; delete p[f]; assert.throws(() => createDiscriminator({ comparator: byRisk, provenance: p }), code('PROVENANCE_INCOMPLETE'), f); }
  assert.throws(() => assertProvenance({ ...PROV, modelHash: 'abc' }), code('PROVENANCE_HASH_MALFORMED')); assert.throws(() => assertProvenance({ ...PROV, discriminatorId: 'SOMETHING_ELSE' }), code('PROVENANCE_IDENTITY_MISMATCH'));
  for (const s of ['QUALIFIED', 'DEV_QUALIFIED', undefined]) assert.throws(() => assertProvenance({ ...PROV, qualification: { status: s } }), code('PROVENANCE_QUALIFICATION_LABEL_NOT_ALLOWED'));
  const d = createDiscriminator({ comparator: byRisk, provenance: PROV }); assert.throws(() => d.compareMenu({ ...request(menuOf([0.1])), observationContract: { id: 'OTHER', version: '1' } }), code('OBSERVATION_CONTRACT_MISMATCH'));
  assert.throws(() => createDiscriminator({ provenance: PROV }), code('COMPARATOR_REQUIRED'));
});

test('label contract: five separate families; the pair target is the union introduction; regret never breaks a safety tie', () => {
  assert.deepEqual([...LABEL_FAMILIES], ['PER_ACTION_CATASTROPHE', 'PER_ACTION_REGRET', 'COMPARATOR_RELATIVE_INTRODUCTION', 'WITHIN_MENU_RELATIVE_ORDER', 'TIED_OR_INDISTINGUISHABLE']);
  const cond = { s0SetDigest: 's0#1', nexusSetDigest: 'nx#1' }, L = (o) => actionLabel({ members: 10, catastrophicMembers: 0, meanNormalisedRegret: 0.2, introducesVsS0: false, introducesVsNexus: false, conditioning: cond, ...o });
  const safe = L({}), unsafeN = L({ catastrophicMembers: 3, introducesVsNexus: true, meanNormalisedRegret: 0.1 }), unsafeS = L({ catastrophicMembers: 10, introducesVsS0: true, meanNormalisedRegret: 0.9 }), catNotIntro = L({ catastrophicMembers: 4, meanNormalisedRegret: 0.6 });
  assert.equal(pairLabel(safe, unsafeN).primary, 'A_SAFER'); assert.equal(pairLabel(safe, unsafeN).target, 1); assert.equal(pairLabel(unsafeN, safe).primary, 'B_SAFER'); assert.equal(pairLabel(unsafeN, safe).target, 0);
  const tie = pairLabel(unsafeN, unsafeS); assert.equal(tie.primary, 'TIED'); assert.equal(tie.target, 0.5); assert.ok(tie.secondary.regretDifference < 0); // lower regret does NOT make unsafeN "safer"
  const c = pairLabel(safe, catNotIntro); assert.equal(c.primary, 'TIED'); assert.equal(c.secondary.catastrophe, 'A_SAFER'); // catastrophe and introduction are different labels
  assert.equal(pairLabel(unsafeN, unsafeS).secondary.vsS0, 'A_SAFER'); assert.equal(pairLabel(unsafeN, unsafeS).secondary.vsNexus, 'B_SAFER');
  assert.deepEqual(Object.keys(safe).sort(), ['catastrophe', 'conditioning', 'introduction', 'regret']); assert.equal(unsafeN.catastrophe.inEveryMember, false); assert.equal(unsafeS.catastrophe.inEveryMember, true);
  assert.throws(() => L({ conditioning: undefined }), code('LABEL_REQUIRES_COMPARATOR_CONDITIONING')); assert.throws(() => L({ conditioning: { s0SetDigest: 's0#1' } }), code('LABEL_REQUIRES_COMPARATOR_CONDITIONING'));
  assert.throws(() => pairLabel(safe, L({ conditioning: { s0SetDigest: 's0#2', nexusSetDigest: 'nx#1' } })), code('PAIR_LABELS_FROM_DIFFERENT_DECISION_STATES')); assert.throws(() => L({ catastrophicMembers: 11 }), code('LABEL_MEMBER_COUNTS_INVALID'));
});

test('frame invariance (synthetic D4): descriptors built from invariants rank identically in all eight frames; a signed coordinate does not', () => {
  const D4 = [(v) => [v[0], v[1]], (v) => [-v[1], v[0]], (v) => [-v[0], -v[1]], (v) => [v[1], -v[0]], (v) => [-v[0], v[1]], (v) => [v[0], -v[1]], (v) => [v[1], v[0]], (v) => [-v[1], -v[0]]];
  const raw = [{ key: 'north', to: [0, 3], hazard: [1, 4] }, { key: 'east', to: [2, 0], hazard: [1, 4] }, { key: 'south', to: [0, -1], hazard: [1, 4] }];
  const invariant = (g) => raw.map((a) => { const t = g(a.to), h = g(a.hazard); return act(a.key, { r: 1 / (1 + Math.abs(t[0] - h[0]) + Math.abs(t[1] - h[1])) }); }), signed = (g) => raw.map((a) => act(a.key, { r: g(a.to)[0] }));
  const ref = JSON.stringify(viewByKey(rank(invariant(D4[0]), byRisk))); for (const g of D4) assert.equal(JSON.stringify(viewByKey(rank(invariant(g), byRisk))), ref);
  assert.ok(D4.some((g) => JSON.stringify(viewByKey(rank(signed(g), byRisk))) !== JSON.stringify(viewByKey(rank(signed(D4[0]), byRisk)))), 'negative control: a frame-dependent descriptor must be detectable');
});

test('determinism and scope: equal requests give equal results; the reference imports nothing and carries its own disclaimer', () => {
  const d = createDiscriminator({ comparator: byRisk, provenance: PROV }), req = request(menuOf([0.31, 0.07, 0.52])), a = d.compareMenu(req), b = d.compareMenu(JSON.parse(JSON.stringify(req)));
  assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.equal(JSON.stringify(JSON.parse(JSON.stringify(a))), JSON.stringify(a));
  const src = readFileSync(new URL('./pairwise-contract.mjs', import.meta.url), 'utf8'); assert.ok(!/^\s*import\s/m.test(src), 'the contract reference must import nothing'); assert.ok(!/Math\.random|Date\.now|process\./.test(src));
  assert.equal(IDS.status, 'DESIGN_REFERENCE_NOT_A_TRAINED_MODEL'); assert.match(a.epistemic.statement, /not a guarantee/);
});
