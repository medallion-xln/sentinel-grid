// H-DISC-1 — the non-additivity gate (REPRESENTATION TEST, NOT A SAFETY OR PERFORMANCE RESULT).
//   node witness/nonadditivity-gate.mjs            run the six checks and print the verdict
//   node witness/nonadditivity-gate.mjs --write    also create evidence/HDISC1_NONADDITIVITY.json (exclusive)
//   node witness/nonadditivity-gate.mjs check      recompute and compare byte-for-byte; writes nothing
// Synthetic mathematical witnesses and two tracked public fixtures only. No world is generated, no label or historical
// outcome is read, no parameter is learned. If the gate fails, the stage stops: an additive ranker is not to be renamed.
//
//   1  an additive action scorer has the expected restricted behaviour        (L1 cocycle, L2 acyclic, L3 independent, L4 determined)
//   2  the proposed comparator expresses a pair interaction no additive scorer can
//   3  reversing a pair preserves the declared probability semantics
//   4  opaque identity relabelling preserves decisions
//   5  menu-order permutations preserve rankings
//   6  applicable geometric transformations (D4) preserve semantic equivalence
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiscriminator, MODES } from '../discriminator/index.mjs';
import { makeSyntheticEncoder } from '../discriminator/encoder.mjs';
import { makeForgeEncoder, FORGE_OBSERVATION_CONTRACT } from '../discriminator/forge-encoder.mjs';
import { FAMILIES, ORIGINS, PARAMETER_SCHEMA, parametersHash, validateParameters, comparePair, hasCrossActionInteraction, capacityOf } from '../discriminator/pair-model.mjs';
import { sha256 } from '../discriminator/canonical.mjs';
import { pairTableWitness, additiveScoreWitness, additiveInPairFamily, relationWitness, contextWitness, cocycleResidual, additiveFit, majorityCycle, flatten } from './nonadditivity.mjs';
import { frameProjection, D4_FRAMES } from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/projection.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), SK1 = resolve(LANE, '../stage3h-sk1-safety-kernel-v1');
export const OUT_FILE = resolve(LANE, 'evidence/HDISC1_NONADDITIVITY.json');
const TOL = 1e-12, r6 = (x) => Math.round(x * 1e6) / 1e6;
const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

// ---- synthetic menus over one categorical descriptor
const SUIT = makeSyntheticEncoder({ id: 'SYNTHETIC_SUIT_ENCODER_V1', descriptor: ['suit'], context: ['k'] }), SUIT_OC = { id: SUIT.schema.id, version: '1' };
const CELL = makeSyntheticEncoder({ id: 'SYNTHETIC_CELL_ENCODER_V1', descriptor: ['u', 'cell'], relation: [{ name: 'pair.sameCell', of: (a, b) => Number(a.cell === b.cell) }] }), CELL_OC = { id: CELL.schema.id, version: '1' };
const suitMenu = (suits, tag = '') => suits.map((s, i) => ({ key: `h${tag}${i}`, signature: `suit:${s}`, type: 'SYNTH', descriptor: { suit: s } }));
const disc = (encoder, parameters) => createDiscriminator({ encoder, parameters, mode: MODES.SYNTHETIC });
const run = (d, oc, menu, context = { k: 0 }) => d.compare({ observationContract: oc, context }, menu, null);
const logitMatrix = (p, suits, ctx = []) => suits.map((a) => suits.map((b) => (a === b ? 0 : comparePair(p, [a], [b], [], [], ctx).logit)));
const probMatrix = (p, suits, ctx = []) => suits.map((a) => suits.map((b) => comparePair(p, [a], [b], [], [], ctx).probability));
// rock-paper-scissors: 0 beats 1, 1 beats 2, 2 beats 0
export const T_CYCLE = [[0, 2, -2], [-2, 0, 2], [2, -2, 0]];
// four suits: a = 0, b = 1, x = 2, y = 3.  a is weakly preferred to b; x beats a strongly and loses to b strongly; y loses to both.
export const T_IIA = [[0, 0.4, -3, 2.2], [-0.4, 0, 3, 2.2], [3, -3, 0, 0], [-2.2, -2.2, 0, 0]];

function check1_additiveControl() {
  // exhaustive over a finite grid of additive scorers: every assignment of four score values to four suits (256 scorers)
  const VALUES = [0, 0.5, 1.25, 3], K = 4, suits = [0, 1, 2, 3]; let scorers = 0, maxCocycle = 0, cycles = 0, iiaFlips = 0, mismatchWithPairForm = 0, crossPaths = 0, maxFit = 0;
  for (let code = 0; code < VALUES.length ** K; code++) { const s = suits.map((q) => VALUES[Math.floor(code / VALUES.length ** q) % VALUES.length]), A = additiveScoreWitness(s), B = additiveInPairFamily(s); scorers++;
    const L = logitMatrix(A, suits), P = probMatrix(A, suits); maxCocycle = Math.max(maxCocycle, cocycleResidual(L)); maxFit = Math.max(maxFit, additiveFit(L).maxResidual); if (majorityCycle(P)) cycles++;
    // L3: the aggregated order of a and b must be the same whatever the third action is
    for (const a of suits) for (const b of suits) if (a < b) { const signs = new Set(suits.filter((x) => x !== a && x !== b).map((x) => Math.sign((P[a][b] + P[a][x]) / 2 - (P[b][a] + P[b][x]) / 2))); if (signs.size > 1) iiaFlips++; }
    const LB = logitMatrix(B, suits); for (const a of suits) for (const b of suits) if (Math.abs(L[a][b] - LB[a][b]) > TOL) mismatchWithPairForm++; crossPaths += hasCrossActionInteraction(B).crossActionPaths; }
  return { pass: maxCocycle <= TOL && cycles === 0 && iiaFlips === 0 && mismatchWithPairForm === 0 && crossPaths === 0, additiveScorersEnumerated: scorers, L1_maxCocycleResidual: maxCocycle, L1_maxDistanceFromAnAdditiveFit: maxFit, L2_scorersWithAMajorityCycle: cycles, L3_orderOfTwoActionsChangedByAThirdAction: iiaFlips,
    sameScorerWrittenInThePairFamily: { logitMismatches: mismatchWithPairForm, crossActionPaths: crossPaths, reading: 'the pair family contains the additive family; an additive member has no cross-action path and is reported as such' } };
}
function check2_nonAdditiveWitnesses() {
  const out = {};
  // (a) a cycle inside one menu
  const W = pairTableWitness(T_CYCLE), L = logitMatrix(W, [0, 1, 2]), P = probMatrix(W, [0, 1, 2]), cyc = majorityCycle(P), res = run(disc(SUIT, W), SUIT_OC, suitMenu([0, 1, 2]));
  out.cycle = { pass: cocycleResidual(L) > 1 && cyc !== null && additiveFit(L).maxResidual > 1 && res.uncertainty.cycles.length === 1 && res.decision.strictOrderSupported === false, cocycleResidual: cocycleResidual(L), majorityCycle: cyc, distanceFromTheBestAdditiveFit: r6(additiveFit(L).maxResidual), crossAction: hasCrossActionInteraction(W),
    throughTheDiscriminator: { decision: res.decision.kind, topSetSize: res.decision.topSet.length, flags: res.uncertainty.flags }, why: 'L2: an additive scorer orders actions by one number each, so its majority relation can never contain a cycle' };
  // (b) the order of two actions depends on which third action is present
  const WI = pairTableWitness(T_IIA), dI = disc(SUIT, WI), order = (third) => { const r = run(dI, SUIT_OC, suitMenu([0, 1, third])), rank = (s) => r.rankedActions.find((x) => x.signature === `suit:${s}`); return { third, rankOfA: rank(0).rank, rankOfB: rank(1).rank, safetyA: r6(rank(0).relativeSafety), safetyB: r6(rank(1).relativeSafety), top: r.decision.topActions.map((x) => r.rankedActions.find((y) => y.index === x.index).signature) }; };
  const withX = order(2), withY = order(3), pab = comparePair(WI, [0], [1], [], [], []).probability;
  out.dependenceOnOtherAlternatives = { pass: withX.rankOfB < withX.rankOfA && withY.rankOfA < withY.rankOfB && pab > 0.5, directComparisonOfAandB: r6(pab), menuWithX: withX, menuWithY: withY, why: 'L3: with per-action scores, whether a ranks above b cannot depend on a third action. Here a is preferred to b directly, ranks above b beside y, and below b beside x' };
  // (c) the comparison depends on a relation that belongs to neither action alone
  const WR = relationWitness(), dR = disc(CELL, WR), cell = (cb) => run(dR, CELL_OC, [{ key: 'p', signature: 'u0', type: 'SYNTH', descriptor: { u: 0, cell: 1 } }, { key: 'q', signature: 'u1', type: 'SYNTH', descriptor: { u: 1, cell: cb } }]);
  const same = cell(1), diff = cell(2);
  out.pairRelation = { pass: same.pairwiseEvidence.matrix[0][1] > 0.5 && diff.pairwiseEvidence.matrix[0][1] < 0.5 && same.decision.topSet[0] === 0 && diff.decision.topSet[0] === 1, identicalComparedInputsOfBothActions: true, sameCell: r6(same.pairwiseEvidence.matrix[0][1]), differentCell: r6(diff.pairwiseEvidence.matrix[0][1]), crossAction: hasCrossActionInteraction(WR),
    why: 'L4: the model reads u of each action and the relation between them. u is identical in both menus, so any per-action scorer of u must give the same comparison; the comparator reverses it' };
  // (d) the interaction itself depends on shared context
  const T_FLAT = [[0, 2, 2], [-2, 0, 2], [-2, -2, 0]], WC = contextWitness(T_CYCLE, T_FLAT), dC = disc(SUIT, WC), k0 = run(dC, SUIT_OC, suitMenu([0, 1, 2]), { k: 0 }), k1 = run(dC, SUIT_OC, suitMenu([0, 1, 2]), { k: 1 });
  out.contextDependentInteraction = { pass: k0.uncertainty.cycles.length === 0 && k0.decision.strictOrderSupported === true && k1.uncertainty.cycles.length === 1, contextZero: { cycles: k0.uncertainty.cycles.length, topSetSize: k0.decision.topSet.length }, contextOne: { cycles: k1.uncertainty.cycles.length, topSetSize: k1.decision.topSet.length } };
  out.capacity = { cycleWitness: capacityOf(W), relationWitness: capacityOf(WR) };
  return { pass: Object.values(out).every((x) => x.pass !== false), ...out };
}
const WITNESS_MENUS = () => [[pairTableWitness(T_CYCLE), [0, 1, 2]], [pairTableWitness(T_IIA), [0, 1, 2, 3]], [pairTableWitness(T_IIA, { bags: 3 }), [3, 1, 0, 2]], [additiveInPairFamily([0, 0.5, 1.25, 3]), [0, 1, 2, 3]]];
function check3_reversal() {
  let pairs = 0, worst = 0, exactNegation = 0, diagonal = 0;
  for (const [p, suits] of WITNESS_MENUS()) for (const a of suits) for (const b of suits) { const x = comparePair(p, [a], [b], [], [], []), y = comparePair(p, [b], [a], [], [], []); pairs++; worst = Math.max(worst, Math.abs(x.probability + y.probability - 1)); if (x.logit === -y.logit || (x.logit === 0 && y.logit === 0)) exactNegation++; if (a === b && x.probability === 0.5) diagonal++; }
  const WR = relationWitness(); for (const [ua, ub, same] of [[0, 1, 1], [0, 1, 0], [1, 0, 1], [1, 1, 0], [0, 0, 1]]) { const x = comparePair(WR, [ua], [ub], [same], [same], []), y = comparePair(WR, [ub], [ua], [same], [same], []); pairs++; worst = Math.max(worst, Math.abs(x.probability + y.probability - 1)); if (x.logit === -y.logit || (x.logit === 0 && y.logit === 0)) exactNegation++; }
  return { pass: worst <= TOL && exactNegation === pairs, orderedPairsChecked: pairs, maxDeviationFromOne: worst, logitsExactlyNegated: exactNegation, identicalActionsAtOneHalf: diagonal };
}
function check4_identityRelabelling() {
  let cases = 0, same = 0; const names = [['h0', 'h1', 'h2', 'h3'], ['zeta', 'alpha', 'mu', 'beta'], ['3', '2', '1', '0'], ['id-9f', 'id-02', 'id-77', 'id-a1']];
  for (const [p, suits] of WITNESS_MENUS()) { const d = disc(SUIT, p), ref = run(d, SUIT_OC, suitMenu(suits)); for (const nm of names) { const m = suits.map((s, i) => ({ key: nm[i], signature: `suit:${s}`, type: 'SYNTH', descriptor: { suit: s } })), r = run(d, SUIT_OC, m); cases++;
    if (r.decisionDigest === ref.decisionDigest && JSON.stringify(r.decision.topSet) === JSON.stringify(ref.decision.topSet) && JSON.stringify(r.pairwiseEvidence.matrix) === JSON.stringify(ref.pairwiseEvidence.matrix)) same++; } }
  return { pass: same === cases, relabelledMenus: cases, identicalDecisionDigestTopSetAndMatrix: same };
}
function check5_menuOrder() {
  let cases = 0, same = 0; const view = (r) => JSON.stringify(r.rankedActions.map((x) => [x.signature, x.rank, x.relativeSafety, x.worstCaseComparison, x.inCycle]).sort());
  for (const [p, suits] of WITNESS_MENUS()) { const d = disc(SUIT, p), base = suitMenu(suits), ref = run(d, SUIT_OC, base); for (const m of perms(base)) { const r = run(d, SUIT_OC, m); cases++; if (r.decisionDigest === ref.decisionDigest && view(r) === view(ref)) same++; } }
  return { pass: same === cases, permutedMenus: cases, bitIdenticalRanksScoresAndDigest: same };
}
// ---- a Forge-layout witness: hand-built trees over real encoder inputs, with a cross-action path and a relation split
export function forgeWitness(encoder) {
  const layout = { descriptor: ['type.MOVE', 'geo.dest.nearest.hostile', 'ev.s0.z', 'act.cost'], relation: ['pair.stepDot', 'pair.destManhattan', 'pair.diff.s0Score'], context: ['ctx.nHostile'] }, d = layout.descriptor.length, A = (nm) => layout.descriptor.indexOf(nm), Bi = (nm) => d + layout.descriptor.indexOf(nm), R = (nm) => 2 * d + layout.relation.indexOf(nm), C = (nm) => 2 * d + layout.relation.length + layout.context.indexOf(nm);
  const S = (f, t, l, r) => ({ f, t, l, r }), trees = [
    S(A('geo.dest.nearest.hostile'), 3.5, S(Bi('geo.dest.nearest.hostile'), 3.5, 0, -0.9), S(Bi('geo.dest.nearest.hostile'), 3.5, 0.9, 0)),      // the action ending farther from a hostile
    S(R('pair.stepDot'), -0.5, S(A('ev.s0.z'), 0, -0.35, 0.35), 0),                                                                         // opposite steps: side with S0
    S(C('ctx.nHostile'), 0.5, 0, S(A('type.MOVE'), 0.5, S(Bi('type.MOVE'), 0.5, 0, 0.25), S(Bi('type.MOVE'), 0.5, -0.25, 0))),               // with hostiles present, a non-move over a move
    S(R('pair.diff.s0Score'), 0, -0.15, 0.15), S(A('act.cost'), 0.5, S(Bi('act.cost'), 0.5, 0, 0.1), S(Bi('act.cost'), 0.5, -0.1, 0))].map(flatten);
  const p = { schema: PARAMETER_SCHEMA, origin: ORIGINS.SYNTHETIC, family: FAMILIES.PAIR, layout, bags: [{ trees }, { trees: trees.slice(0, 4) }] }; p.parametersHash = parametersHash(p); validateParameters(p);
  for (const nm of [...layout.descriptor]) if (!encoder.schema.descriptor.includes(nm)) throw Error('FORGE_WITNESS_INPUT_MISSING:' + nm); return Object.freeze(p);
}
const relabelProjection = (P, legalActions, perm) => { const n = P.nodes.length, nodes = Array(n); P.nodes.forEach((x, i) => { nodes[perm[i]] = { ...x, rels: x.rels.map((r) => (Number.isInteger(r.to) ? { ...r, to: perm[r.to] } : r)) }; });
  return { projection: { ...P, nodes }, legalActions: legalActions.map((a) => ({ ...a, target: a.target === null ? null : perm[a.target], dependent: a.dependent === null ? null : perm[a.dependent] })) }; };
const permuteMenu = (legalActions, evidence, order) => ({ legalActions: order.map((i) => legalActions[i]), advisoryEvidence: { ...evidence, experts: { ...evidence.experts, S0: { ...evidence.experts.S0, scores: order.map((i) => evidence.experts.S0.scores[i]), topSet: evidence.experts.S0.topSet.map((t) => order.indexOf(t)).sort((a, b) => a - b) } } } });
function check6_geometry() {
  const enc = makeForgeEncoder(), W = forgeWitness(enc), d = disc(enc, W), fixtures = ['forge-request-recommend.json', 'forge-request-abstain.json'].map((f) => ({ name: f, ...JSON.parse(readFileSync(resolve(SK1, 'demo/fixtures', f), 'utf8')) }));
  const state = (projection) => ({ observationContract: FORGE_OBSERVATION_CONTRACT, projection }), cmp = (projection, legalActions, ev) => d.compare(state(projection), legalActions, ev);
  const out = { pass: true, witness: { parametersHash: W.parametersHash, capacity: capacityOf(W), crossAction: hasCrossActionInteraction(W) }, fixtures: [] };
  for (const fx of fixtures) { const P = fx.state.projection, ref = cmp(P, fx.legalActions, fx.advisoryEvidence), n = fx.legalActions.length;
    let frames = 0, frameSame = 0; for (const t of D4_FRAMES) { const Pt = frameProjection({ ...P, menu: fx.legalActions }, t), { menu, ...proj } = Pt, r = cmp(proj, menu, fx.advisoryEvidence); frames++; if (r.decisionDigest === ref.decisionDigest && JSON.stringify(r.decision.topSet) === JSON.stringify(ref.decision.topSet)) frameSame++; }
    let relabels = 0, relabelSame = 0; for (let s = 1; s <= 5; s++) { const perm = [...Array(P.nodes.length).keys()].map((i) => (i * (2 * s + 1) + s) % P.nodes.length); if (new Set(perm).size !== perm.length) continue; const q = relabelProjection(P, fx.legalActions, perm), r = cmp(q.projection, q.legalActions, fx.advisoryEvidence); relabels++; if (r.decisionDigest === ref.decisionDigest && JSON.stringify(r.decision.topSet) === JSON.stringify(ref.decision.topSet)) relabelSame++; }
    let orders = 0, orderSame = 0; for (let s = 1; s <= 6; s++) { const order = [...Array(n).keys()].map((i) => (i * (n % 2 === 0 ? (s % 2 ? s : s + 1) : s) + s) % n); if (new Set(order).size !== n) continue; const q = permuteMenu(fx.legalActions, fx.advisoryEvidence, order), r = cmp(P, q.legalActions, q.advisoryEvidence); orders++; if (r.decisionDigest === ref.decisionDigest) orderSame++; }
    const informative = ref.pairwiseEvidence.matrix.flat().filter((v) => v !== null && v !== 0.5).length;
    const ok = frameSame === frames && frames === 8 && relabelSame === relabels && relabels > 0 && orderSame === orders && orders > 0 && informative > 0 && ref.decision.kind === 'TOP_SET';
    out.fixtures.push({ fixture: fx.name, menuSize: n, decision: ref.decision.kind, comparisonsThatAreNotOneHalf: informative, d4Frames: `${frameSame}/${frames}`, entityRelabellings: `${relabelSame}/${relabels}`, menuOrders: `${orderSame}/${orders}`, decisionDigest: ref.decisionDigest, pass: ok }); if (!ok) out.pass = false; }
  // negative control: an input that is NOT frame-invariant must be detectable by the same comparison
  const SIGNED = makeSyntheticEncoder({ id: 'SYNTHETIC_SIGNED_COORDINATE_ENCODER_V1', descriptor: ['x'] }), dS = disc(SIGNED, additiveScoreWitnessOver('x')), D4 = [(v) => [v[0], v[1]], (v) => [-v[1], v[0]], (v) => [-v[0], -v[1]], (v) => [v[1], -v[0]], (v) => [-v[0], v[1]], (v) => [v[0], -v[1]], (v) => [v[1], v[0]], (v) => [-v[1], -v[0]]];
  const raw = [{ sig: 'north', to: [0, 3] }, { sig: 'east', to: [2, 0] }, { sig: 'south', to: [0, -1] }], tops = new Set(D4.map((g) => { const r = dS.compare({ observationContract: { id: SIGNED.schema.id, version: '1' } }, raw.map((a) => ({ key: a.sig, signature: a.sig, type: 'SYNTH', descriptor: { x: g(a.to)[0] } })), null); return r.rankedActions[0].signature; }));
  out.negativeControl = { frameDependentInputDetected: tops.size > 1, distinctTopActionsAcrossFrames: tops.size }; if (!out.negativeControl.frameDependentInputDetected) out.pass = false;
  return out;
}
function additiveScoreWitnessOver(name) { const p = { schema: PARAMETER_SCHEMA, origin: ORIGINS.SYNTHETIC, family: FAMILIES.ADDITIVE, layout: { descriptor: [name], relation: [], context: [] }, bags: [{ trees: [flatten({ f: 0, t: -0.5, l: -1, r: { f: 0, t: 0.5, l: 0, r: { f: 0, t: 1.5, l: 1, r: 2 } } })] }] }; p.parametersHash = parametersHash(p); validateParameters(p); return p; }

export function runGate() {
  const checks = { '1_additiveScorerIsRestricted': check1_additiveControl(), '2_comparatorExpressesANonAdditivePairInteraction': check2_nonAdditiveWitnesses(), '3_pairReversalConsistency': check3_reversal(), '4_opaqueIdentityRelabelling': check4_identityRelabelling(), '5_menuOrderPermutation': check5_menuOrder(), '6_geometricTransformations': check6_geometry() };
  const pass = Object.values(checks).every((c) => c.pass === true);
  return { schema: 'HDISC1_NONADDITIVITY_GATE_V1', authority: 'R0', stage: 'STAGE3H-H-DISC-1', labels: ['REPRESENTATION_TEST', 'SYNTHETIC_MATHEMATICAL_WITNESSES', 'NO_LEARNED_PARAMETERS', 'NOT_A_SAFETY_OR_PERFORMANCE_RESULT'],
    source: { gateSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), witnessSha256: sha256(readFileSync(resolve(HERE, 'nonadditivity.mjs'))), pairModelSha256: sha256(readFileSync(resolve(LANE, 'discriminator/pair-model.mjs'))) },
    gate: pass ? 'PASS' : 'FAIL', NONADDITIVE_COMPARATOR: pass ? 'ESTABLISHED_AS_A_REPRESENTATION_PROPERTY' : 'NOT_ESTABLISHED', checks,
    whatThisDoesNotShow: ['that a trained comparator will use a cross-action interaction', 'that using one improves safety', 'anything about any native world, label or policy outcome'] };
}
const text = (o) => JSON.stringify(o, null, 1) + '\n';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'dry', res = runGate(), t = text(res);
  console.log(JSON.stringify({ mode, gate: res.gate, checks: Object.fromEntries(Object.entries(res.checks).map(([k, v]) => [k, v.pass])), sha256: sha256(t) }, null, 1));
  if (res.gate !== 'PASS') { console.log('HDISC1_NONADDITIVITY_GATE_FAIL'); process.exitCode = 1; }
  else if (mode === '--write') { const fd = openSync(OUT_FILE, 'wx'); writeSync(fd, t); closeSync(fd); console.log('written evidence/HDISC1_NONADDITIVITY.json'); }
  else if (mode === 'check') { const same = readFileSync(OUT_FILE, 'utf8') === t; console.log(same ? 'HDISC1_NONADDITIVITY_CHECK_PASS' : 'HDISC1_NONADDITIVITY_CHECK_FAILED'); if (!same) process.exitCode = 1; }
  else if (mode === 'print') console.log(t);
  else console.log('HDISC1_NONADDITIVITY_GATE_PASS');
}
