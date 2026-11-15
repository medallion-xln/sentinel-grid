// STAGE 3H-SK1.1 — decision-failure matrix extraction (READ-ONLY DIAGNOSTIC, authority R0).
//   node diagnostics/extract-matrix.mjs            recompute, reconcile with the committed SK1 result, print a summary
//   node diagnostics/extract-matrix.mjs --write    the same, then create evidence/SK1_1_DECISION_FAILURE_MATRIX.json (exclusive)
//   node diagnostics/extract-matrix.mjs check      recompute and compare byte-for-byte with the stored matrix; writes nothing
//
// What this does and does not do
//   * It REPLAYS the frozen SK1 kernel and the frozen C10 policy on the frozen, spent VALIDATION class records and
//     scores the resulting decision sets with the FROZEN evaluator (hw1-eval evalClass), exactly as `infra/run.mjs check`
//     does. No world is generated, no evaluator label is created, nothing is trained, tuned or selected.
//   * It refuses to write unless every replayed decision hash equals the committed per-class hash and every policy
//     aggregate equals the committed SK1_VALIDATION_RESULTS.json exactly.
//   * It reads privileged local class records (work/, gitignored). The tracked output carries opaque aliases only:
//     no seed, world hash, block coordinate, utility vector or member identity.
//   * Leave-one-bag-out rows and every alternative-ranking flag are POST_HOC_DIAGNOSTIC on a spent population. They
//     are not a policy, not a threshold proposal and not validation material for any future policy.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadPopulation } from '../../stage3h-sk1-safety-kernel-v1/infra/population.mjs';
import { writeExclusive } from '../../stage3h-sk1-safety-kernel-v1/infra/common.mjs';
import { loadForgeKernel } from '../../stage3h-sk1-safety-kernel-v1/api/host.mjs';
import { forgeRequest } from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/features.mjs';
import { assessSemantics } from '../../stage3h-sk1-safety-kernel-v1/kernel/semantics.mjs';
import { rankActions } from '../../stage3h-sk1-safety-kernel-v1/kernel/ranking.mjs';
import { bagScore } from '../../stage3h-sk1-safety-kernel-v1/kernel/risk.mjs';
import { evalClass, aggregate, CATASTROPHE } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { makePolicy } from '../../stage3h-hw4-value-band-v1/hw4-policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), SK1 = resolve(GA, 'stage3h-sk1-safety-kernel-v1');
export const MATRIX_FILE = resolve(LANE, 'evidence/SK1_1_DECISION_FAILURE_MATRIX.json');
const RESULT_FILE = resolve(SK1, 'evidence/SK1_VALIDATION_RESULTS.json'), FREEZE_FILE = resolve(SK1, 'evidence/SK1_EXPERIMENT_FREEZE.json'), MODEL_FILE = resolve(SK1, 'models/SK1_MODEL.json');
const C10_FILE = resolve(GA, 'stage3h-hw4-value-band-v1/models/V1_PUBLIC_ONLY_C10_BASE_SAFE_FIRST.json');
// Identities of the frozen SK1 evidence this diagnostic is bound to. A mismatch stops the extraction.
export const PINS = Object.freeze({
  validationResultsSha256: '239c16bc210adef28e7cdef40ecd14298625ee26e08c13f45ad146988a3622b1',
  experimentFreezeSha256: 'd22be2c4766324db1794d511b3bbd79917d3771c28cfa1c7087ba4c6c0663794',
  modelFileSha256: '683ce6e09c374e7c3a628a53e39f9875d6b8122b6eca8a4b72d58087a0c9efa0',
  modelHash: 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b',
  c10ModelSha256: '41ce761cbeeb2c110a1564cc0f28aa7c773f53587045fc5b04fd72d192d5858e',
  kernelSourceHash: '5588744316bf27efaabdc72b86b886f6e31d868c13f3a783bc75ca19a3bc7cb5',
});
const sha = (b) => createHash('sha256').update(b).digest('hex'), fileSha = (p) => sha(readFileSync(p)), readJ = (p) => JSON.parse(readFileSync(p, 'utf8')), J = JSON.stringify;
const fail = (m) => { throw Error(m); };
const r6 = (x) => (x === null || x === undefined ? null : Math.round(x * 1e6) / 1e6);
// per-action rows are stored as arrays in this column order (booleans as 0/1)
export const ACTION_COLUMNS = Object.freeze(["index", "type", "rank", "selectable", "estimate", "spread", "upper", "tier", "expectedRegret", "ood", "cat", "introS0", "introNexus", "inForcedSet", "inS0Set", "inNexusSet", "inC10Set"]);
const PUBLIC_FEATURES = ['act.cost', 'act.energyAfter', 'act.dispManhattan', 'act.destHazard', 'act.retreatManhattan', 'act.nUncertainEffects', 'act.hasTarget', 'gradient.hostile', 'gradient.threatened', 'after.nearestHostile',
  'ctx.energy', 'ctx.health', 'ctx.ticksRemaining', 'ctx.nHostile', 'ctx.nThreatened', 'ctx.nOutOfService', 'ctx.nearestHostile', 'ctx.menuSize', 'ctx.menu.MOVE', 'ev.s0.inTop', 'ev.s0.rankFrac', 'ev.s0.gapToTop', 'ev.s0.topSize', 'ev.nexus.typeMatch', 'ev.expertsAgreeOnType'];

// evaluate.mjs `summary`, reproduced so aggregates can be compared field by field with the committed result
const summary = (a) => ({ classes: a.classes, illegal: a.illegal, introVsS0: a.introVsS0, introVsNexus: a.introVsNexus, introVsS0BaseOnly: a.introVsS0BaseOnly, introVsNexusBaseOnly: a.introVsNexusBaseOnly, familiesWithIntroVsS0: a.familiesWithIntroVsS0, familiesWithIntroVsNexus: a.familiesWithIntroVsNexus,
  catastrophicClasses: a.catClasses, catastrophicOnBase: a.catBaseOnly, meanNreg: a.meanNreg, worstClassNreg: a.worstClassNreg, regretDeltaVsS0: a.deltaVsS0, regretDeltaVsNexus: a.deltaVsNexus, equalsS0: a.equalsS0, equalsNexus: a.equalsNexus });

const sigmoid = (x) => 1 / (1 + Math.exp(-x)), clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Per-bag head predictions of one feature row (same arithmetic as kernel/risk.mjs headPredict, kept per bag). */
const perBag = (head, row) => head.bags.map((b) => { const s = bagScore(b, row); return head.link === 'logit' ? sigmoid(s) : s; });
const meanSd = (p) => { const m = p.reduce((a, b) => a + b, 0) / p.length; return [m, Math.sqrt(p.reduce((a, b) => a + (b - m) * (b - m), 0) / p.length)]; };

function analyseClass(cls, kernel, featurizer, model, c10) {
  const req = forgeRequest(cls.projection, cls.evidence), n = req.legalActions.length, cfg = model.ranking;
  const rec = kernel.recommend(req.state, req.legalActions, req.advisoryEvidence), d = rec.recommendedActionOrAbstention;
  const forced = (d.kind === 'RECOMMEND' ? d.decisionSet : d.bestEffortNotRecommended?.decisionSet ?? []).map((a) => a.index);
  if (!forced.length) fail('NO_FORCED_CHOICE:' + cls.id);
  const byIndex = new Map(rec.rankedActions.map((a, pos) => [a.index, { ...a, pos }])), top = byIndex.get(forced[0]);
  const inSet = new Set(forced), runner = rec.rankedActions.find((a) => a.selectable && !inSet.has(a.index) && a.rank > top.rank) ?? null;
  const selectable = rec.rankedActions.filter((a) => a.selectable && a.risk);
  // ---- frozen outcomes
  const cx = c10.decideProjection(cls.projection), R = { S0: evalClass(cls, cls.B), NEXUS: evalClass(cls, cls.N), C10: evalClass(cls, cx.orbit), SK1_FORCED: evalClass(cls, forced) };
  const types = (set) => [...new Set(set.map((i) => cls.projection.menu[i].type))].sort().join('+');
  const pol = (set, r) => ({ set: [...set], type: types(set), introS0: Boolean(r.introB), introNexus: Boolean(r.introN), introS0Base: Boolean(r.introBBase), introNexusBase: Boolean(r.introNBase), catAny: Boolean(r.catAny), catBase: Boolean(r.catBase), nreg: r6(r.nreg), nregWorst: r6(r.nregWorst), equalsS0: r.equalsB, equalsNexus: r.equalsN });
  // ---- per-action evaluator-derived flags (frozen truth of the class members; categorical, no utilities)
  const M = cls.members.length, catCount = Array(n).fill(0);
  for (const m of cls.members) { const max = Math.max(...m.truth); for (let a = 0; a < n; a++) if (max - m.truth[a] >= CATASTROPHE) catCount[a]++; }
  const single = [...Array(n).keys()].map((a) => evalClass(cls, [a])), pattern = (c) => (c === 0 ? 'NONE' : c === M ? 'ALL_MEMBERS' : 'SOME_MEMBERS');
  const isSafe = (a) => !single[a].introB && !single[a].introN, safe = [...Array(n).keys()].filter(isSafe), safeOther = safe.filter((a) => !inSet.has(a));
  const actions = rec.rankedActions.map((a) => ({ index: a.index, type: a.type, rank: a.rank, selectable: a.selectable, estimate: r6(a.risk?.estimate), spread: r6(a.risk?.spread), bagMin: r6(a.risk?.bagMin), bagMax: r6(a.risk?.bagMax), upper: r6(a.risk?.upperBound), tier: a.riskTier, expectedRegret: r6(a.expectedRegret?.estimate),
    ood: a.outOfDistribution.numericFeaturesOutsideEnvelope, cat: pattern(catCount[a.index]), introS0: Boolean(single[a.index].introB), introNexus: Boolean(single[a.index].introN), inForcedSet: inSet.has(a.index), inS0Set: cls.B.includes(a.index), inNexusSet: cls.N.includes(a.index), inC10Set: cx.orbit.includes(a.index) }));
  const safeRanked = actions.filter((a) => safeOther.includes(a.index) && a.selectable), bestSafe = safeRanked[0] ?? null;
  const worstForcedCat = Math.max(...forced.map((a) => catCount[a]));
  const alternatives = { safeCount: safe.length, safeOtherCount: safeOther.length, classSafeCount: catCount.filter((c) => c === 0).length, forcedSetSafe: forced.every(isSafe), forcedCatPattern: pattern(worstForcedCat),
    bestSafeAlternative: bestSafe && { type: bestSafe.type, rank: bestSafe.rank, tier: bestSafe.tier, upper: bestSafe.upper, estimate: bestSafe.estimate, expectedRegret: bestSafe.expectedRegret },
    safeAlternativeSharesTier: safeRanked.some((a) => a.tier === top.riskTier), safeAlternativeUnderTau: safeRanked.some((a) => a.upper <= cfg.tau),
    estimateRanksSomeSafeAlternativeSafer: safeRanked.some((a) => a.estimate < r6(top.risk.estimate)), boundRanksSomeSafeAlternativeSafer: safeRanked.some((a) => a.upper < r6(top.risk.upperBound)),
    sameTierSafeAlternativeWithLowerBound: safeRanked.some((a) => a.tier === top.riskTier && a.upper < r6(top.risk.upperBound)) };
  // ---- leave-one-bag-out stability of the frozen decision (POST_HOC_DIAGNOSTIC): drop each of the bags in turn and
  //      re-run the frozen ranking contract on the remaining ones. With all bags this must reproduce the kernel exactly.
  const F = featurizer(req.state, req.legalActions, req.advisoryEvidence), sem = assessSemantics(F, n);
  const pr = F.rows.map((row) => perBag(model.heads.risk, row)), pg = F.rows.map((row) => perBag(model.heads.regret, row)), oodN = F.rows.map((row) => row.filter((v, j) => v < model.envelope.min[j] || v > model.envelope.max[j]).length), B = model.heads.risk.bags.length;
  const decideWith = (keep) => { const risks = F.rows.map((_, i) => { const [m, s] = meanSd(pr[i].filter((_, b) => keep(b))), [g] = meanSd(pg[i].filter((_, b) => keep(b))); return { index: i, supported: true, upper: clamp01(m + cfg.z * s + cfg.oodPenalty * oodN[i]), regret: { estimate: g } }; });
    const dd = rankActions(sem, risks, cfg).decision; return { kind: dd.kind, set: dd.kind === 'RECOMMEND' ? dd.decisionSet : dd.forcedChoiceSet ?? [] }; };
  const full = decideWith(() => true); if (full.kind !== d.kind || J(full.set) !== J([...forced].sort((a, b) => a - b))) fail('PER_BAG_RECOMPUTATION_DOES_NOT_REPRODUCE_KERNEL:' + cls.id);
  const loo = [...Array(B).keys()].map((b) => decideWith((x) => x !== b));
  const stability = { bags: B, looForcedSetChanges: loo.filter((x) => J(x.set) !== J(full.set)).length, looKindChanges: loo.filter((x) => x.kind !== full.kind).length,
    bagsWhereTopExceedsTau: pr[forced[0]].filter((p) => p > cfg.tau).length, bagsWhereBestSafeAlternativeHasLowerRisk: bestSafe ? pr[forced[0]].filter((p, b) => pr[bestSafe.index][b] < p).length : null };
  // ---- margins
  const tierEdge = (top.riskTier + 1) * cfg.tierWidth - top.risk.upperBound;
  const sk1 = { kind: d.kind, abstained: d.kind === 'ABSTAIN', reason: d.reason, decisionHash: rec.decisionHash, forcedSet: [...forced], type: top.type, setSize: forced.length, distinctActionsInSet: new Set(forced.map((i) => byIndex.get(i).key)).size,
    risk: { estimate: r6(top.risk.estimate), spread: r6(top.risk.spread), bagMin: r6(top.risk.bagMin), bagMax: r6(top.risk.bagMax), upperBound: top.risk.upperBound }, tier: top.riskTier, expectedRegret: r6(top.expectedRegret.estimate), ood: top.outOfDistribution.numericFeaturesOutsideEnvelope,
    margins: { tau: cfg.tau, tauMargin: r6(cfg.tau - top.risk.upperBound), tierEdgeMargin: r6(tierEdge), decidedBy: runner === null ? 'NO_RUNNER_UP' : runner.riskTier !== top.riskTier ? 'RISK_TIER' : runner.expectedRegret.estimate !== top.expectedRegret.estimate ? 'EXPECTED_REGRET_WITHIN_TIER' : 'RISK_BOUND_WITHIN_TIER',
      runnerUp: runner && { type: runner.type, tier: runner.riskTier, upper: r6(runner.risk.upperBound), estimate: r6(runner.risk.estimate), expectedRegret: r6(runner.expectedRegret.estimate), tierGap: runner.riskTier - top.riskTier, upperGap: r6(runner.risk.upperBound - top.risk.upperBound), regretGap: r6(runner.expectedRegret.estimate - top.expectedRegret.estimate) },
      selectableUnderTau: selectable.filter((a) => a.risk.upperBound <= cfg.tau).length, selectableInBestTier: selectable.filter((a) => a.riskTier === top.riskTier).length, minUpperInMenu: r6(Math.min(...selectable.map((a) => a.risk.upperBound))) }, stability };
  const failing = R.SK1_FORCED.introB || R.SK1_FORCED.introN;
  const failure = !failing ? null : { vsS0: Boolean(R.SK1_FORCED.introB), vsNexus: Boolean(R.SK1_FORCED.introN), onBase: Boolean(R.SK1_FORCED.introBBase || R.SK1_FORCED.introNBase), accepted: d.kind === 'RECOMMEND', chosenCatastrophicIn: pattern(worstForcedCat),
    comparatorRelation: R.SK1_FORCED.equalsB ? 'EQUALS_S0' : R.SK1_FORCED.equalsN ? 'EQUALS_NEXUS' : 'NEITHER',
    // rule-based, descriptive: where in the frozen ranking contract the unsafe action overtook the best safe alternative
    rankingStage: !safeRanked.length ? 'NO_SAFE_ALTERNATIVE' : alternatives.safeAlternativeSharesTier ? (alternatives.sameTierSafeAlternativeWithLowerBound ? 'SAME_TIER_SAFE_ALTERNATIVE_HAD_LOWER_BOUND_REGRET_ORDER_CHOSE_UNSAFE' : 'SAME_TIER_SAFE_ALTERNATIVE_HAD_HIGHER_BOUND') : 'RISK_BOUND_PLACED_UNSAFE_ACTION_IN_BETTER_TIER_THAN_EVERY_SAFE_ALTERNATIVE' };
  const fi = Object.fromEntries(PUBLIC_FEATURES.map((nm) => [nm, F.rows[forced[0]][F.schema.names.indexOf(nm)]]));
  const tgt = req.legalActions[forced[0]].target, ev = rec.evidence.summary;
  const row = { alias: cls.id, family: cls.family, horizon: cls.cell.split('/')[3], cellSuffix: cls.cell.split('/')[4] ?? null, menuSize: n, members: M,
    policies: { S0: pol(cls.B, R.S0), NEXUS: pol(cls.N, R.NEXUS), C10: pol(cx.orbit, R.C10), SK1_FORCED: pol(forced, R.SK1_FORCED) }, sk1,
    publicFeatures: { ...fi, targetKind: tgt == null ? null : cls.projection.nodes[tgt].kind }, evidence: { status: rec.evidence.status, s0TopTypes: ev?.s0TopTypes ?? null, nexusRecommendedType: ev?.nexusRecommendedType ?? null, nexusAbstain: ev?.nexusAbstain ?? null, expertsAgreeOnType: ev?.expertsAgreeOnType ?? null },
    alternatives, failure, actions: actions.map((x) => ACTION_COLUMNS.map((k) => (typeof x[k] === "boolean" ? Number(x[k]) : x[k]))) };
  return { row, R, family: cls.family, decided: d.kind === 'RECOMMEND' };
}

export function build() {
  for (const [k, f] of [['validationResultsSha256', RESULT_FILE], ['experimentFreezeSha256', FREEZE_FILE], ['modelFileSha256', MODEL_FILE], ['c10ModelSha256', C10_FILE]]) if (fileSha(f) !== PINS[k]) fail('FROZEN_IDENTITY_MISMATCH:' + k);
  const stored = readJ(RESULT_FILE), { kernel, featurizer, model } = loadForgeKernel(MODEL_FILE), c10 = makePolicy(readJ(C10_FILE));
  if (model.modelHash !== PINS.modelHash || kernel.identity.kernelSourceHash !== PINS.kernelSourceHash) fail('FROZEN_IDENTITY_MISMATCH:model_or_kernel');
  const { classes } = loadPopulation('VALIDATION', 'CHECK'), out = classes.map((c) => analyseClass(c, kernel, featurizer, model, c10)), fam = out.map((o) => o.family);
  // ---- exact reconciliation with the committed result
  const issues = [], cmp = (name, a, b) => { if (J(a) !== J(b)) issues.push(name); };
  out.forEach((o, i) => { const s = stored.perClass[i], r = o.row;
    cmp(`perClass:${r.alias}`, { id: r.alias, family: r.family, sk1: { kind: r.sk1.kind, forcedSet: r.sk1.forcedSet, type: r.sk1.type, riskUpperBound: r.sk1.risk.upperBound, introS0: r.policies.SK1_FORCED.introS0, introNexus: r.policies.SK1_FORCED.introNexus, decisionHash: r.sk1.decisionHash }, c10: { set: r.policies.C10.set, type: s.c10.type, introS0: r.policies.C10.introS0, introNexus: r.policies.C10.introNexus } }, s); });
  const agg = (k) => summary(aggregate(out.map((o) => o.R[k]), fam)), pick = (o, ref) => Object.fromEntries(Object.keys(ref).map((k) => [k, o[k]]));
  const A = { S0: agg('S0'), NEXUS: agg('NEXUS'), C10: agg('C10'), SK1_FORCED_CHOICE: agg('SK1_FORCED') }, dec = out.filter((o) => o.decided), AS = summary(aggregate(dec.map((o) => o.R.SK1_FORCED), dec.map((o) => o.family)));
  for (const k of Object.keys(A)) cmp('aggregate:' + k, A[k], pick(stored.policies[k], A[k]));
  cmp('aggregate:SK1_AS_SPECIFIED', AS, pick(stored.policies.SK1_AS_SPECIFIED, AS));
  const failing = out.filter((o) => o.row.failure);
  cmp('counts', { decided: dec.length, abstained: out.length - dec.length, failing: failing.length, failingAbstained: failing.filter((o) => !o.decided).length, failingDecided: failing.filter((o) => o.decided).length },
    { decided: stored.policies.SK1_AS_SPECIFIED.decidedClasses, abstained: stored.policies.SK1_AS_SPECIFIED.abstentions, failing: stored.uncertainty.failingClassesForcedChoice, failingAbstained: stored.uncertainty.failingAmongAbstained, failingDecided: stored.uncertainty.failingAmongDecided });
  const digest = sha(J(out.map((o) => [o.row.sk1.kind, o.row.sk1.kind === 'RECOMMEND' ? o.row.sk1.forcedSet : [], o.row.sk1.forcedSet, o.row.sk1.decisionHash])));
  cmp('decisionDigest', digest, stored.reproducibility.decisionDigest);
  const selfSha = (f) => fileSha(resolve(HERE, f));
  const matrix = { schema: 'SK1_1_DECISION_FAILURE_MATRIX_V1', authority: 'R0', stage: 'STAGE3H-SK1.1', labels: ['READ_ONLY_DIAGNOSTIC', 'SPENT_VALIDATION_POPULATION', 'POST_HOC_DIAGNOSTIC', 'NOT_VALIDATION_MATERIAL_FOR_ANY_FUTURE_POLICY'], node: process.version,
    source: { ...PINS, extractorSha256: selfSha('extract-matrix.mjs'), replayedFrom: 'frozen SK1 VALIDATION class records (privileged local data, hash-bound to the tracked population summary) through the frozen kernel, frozen C10 policy and frozen evaluator' },
    disclosure: 'Opaque aliases only. No seed, world hash, block coordinate, utility vector or member identity. Per-action flags are categorical outcomes of the frozen evaluator on the frozen member worlds. "NONE" means no catastrophe was observed in the sampled member worlds; it does not mean the action is universally safe.',
    definitions: { introduction: 'frozen potentialIntroduction of the decision set against the comparator set in at least one member world', catastrophe: `member regret >= ${CATASTROPHE}`, safeAlternative: 'an action that introduces against neither comparator in any member world of the class (Gate 1 definition F)', forcedChoice: 'the kernel\'s top-ranked decision set on every class, including classes where it abstained; a diagnostic reading, not the policy as specified',
      rankingStage: 'for a failing class, the stage of the frozen ranking contract at which the unsafe set overtook the best-ranked safe alternative (descriptive, rule-based)', stability: 'leave-one-bag-out re-run of the frozen ranking contract; POST_HOC_DIAGNOSTIC' },
    actionColumns: ACTION_COLUMNS,
    reconciliation: { exact: issues.length === 0, issues, classes: out.length, decided: dec.length, abstained: out.length - dec.length, failingForcedChoice: failing.length, failingAbstained: failing.filter((o) => !o.decided).length, failingDecided: failing.filter((o) => o.decided).length, decisionDigest: digest, aggregatesComparedExactly: [...Object.keys(A), 'SK1_AS_SPECIFIED'], perClassRecordsComparedExactly: out.length },
    rows: out.map((o) => o.row) };
  return { matrix, issues };
}
export const serialise = (m) => { const { rows, ...head } = m; return JSON.stringify(head, null, 1).replace(/\n}$/, ',\n "rows": [\n' + rows.map((r) => J(r)).join(',\n') + '\n ]\n}\n'); };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'dry', { matrix, issues } = build(), text = serialise(matrix);
  console.log(J({ mode, reconciliation: matrix.reconciliation, bytes: text.length, sha256: sha(text) }, null, 1));
  if (issues.length) { console.log('SK1_1_MATRIX_RECONCILIATION_FAILED'); process.exitCode = 1; }
  else if (mode === '--write') { writeExclusive(MATRIX_FILE, text); console.log('written evidence/SK1_1_DECISION_FAILURE_MATRIX.json'); }
  else if (mode === 'check') { const same = readFileSync(MATRIX_FILE, 'utf8') === text; console.log(same ? 'SK1_1_MATRIX_CHECK_PASS' : 'SK1_1_MATRIX_CHECK_FAILED'); if (!same) process.exitCode = 1; }
  else if (mode !== 'dry') fail('USAGE: node diagnostics/extract-matrix.mjs [--write | check]');
}
