// STAGE 3H-SK2-F — exploration evidence extraction (READ-ONLY DIAGNOSTIC, authority R0).
//   node diagnostics/extract-exploration.mjs            recompute, reconcile, print a summary
//   node diagnostics/extract-exploration.mjs --write    then create evidence/SK2F_EXPLORATION_MATRIX.json (exclusive)
//   node diagnostics/extract-exploration.mjs check      recompute and compare byte-for-byte with the stored file; writes nothing
//
// What this does
//   * Applies the FROZEN SK1 model (hash-pinned) to the existing SK1 EXPLORATION class records and scores the resulting
//     decision sets with the frozen evaluator against the labels those records already carry. EXPLORATION is
//     development data. Nothing is trained, fitted, tuned or selected; no world is generated; SK1 VALIDATION outcomes
//     are not read (two public validation requests are featurised for a feature contrast, truth untouched).
//   * Produces two readings of the frozen model on EXPLORATION, both labelled:
//       IN_SAMPLE       the frozen rule exactly as shipped. The model was FIT on these classes, so every figure is a
//                       resubstitution figure and is optimistic.
//       OUT_OF_BAG      each bag was fit on a bootstrap of origin families. For a class whose family a bag never drew,
//                       that bag is out-of-sample. Averaging only those bags gives an honest-but-noisier reading of the
//                       frozen ensemble. It is a DIAGNOSTIC ESTIMATOR, NOT THE FROZEN RULE (fewer bags per class, each
//                       fit on about 63% of families). The bootstrap draws are re-derived from the seeded generator the
//                       trainer used and VERIFIED EXACTLY against every bag's stored base value; no tree is refitted.
//   * The honest out-of-fold aggregate recorded by the trainer before validation (SK1_TRAINING_RECORD.json) cannot be
//     recomputed without training and is cited, not reproduced.
// Tracked output: opaque aliases only; categorical per-action outcomes; no seed, world hash, coordinate or utility.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadPopulation } from '../../stage3h-sk1-safety-kernel-v1/infra/population.mjs';
import { writeExclusive } from '../../stage3h-sk1-safety-kernel-v1/infra/common.mjs';
import { labelsOf } from '../../stage3h-sk1-safety-kernel-v1/infra/dataset.mjs';
import { prng } from '../../stage3h-sk1-safety-kernel-v1/infra/gbdt.mjs';
import { loadForgeKernel } from '../../stage3h-sk1-safety-kernel-v1/api/host.mjs';
import { forgeRequest } from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/features.mjs';
import { assessSemantics } from '../../stage3h-sk1-safety-kernel-v1/kernel/semantics.mjs';
import { rankActions } from '../../stage3h-sk1-safety-kernel-v1/kernel/ranking.mjs';
import { bagScore } from '../../stage3h-sk1-safety-kernel-v1/kernel/risk.mjs';
import { evalClass, CATASTROPHE } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), SK1 = resolve(GA, 'stage3h-sk1-safety-kernel-v1'), SK11 = resolve(GA, 'stage3h-sk1-1-assurance-v1');
export const MATRIX_FILE = resolve(LANE, 'evidence/SK2F_EXPLORATION_MATRIX.json');
const MODEL_FILE = resolve(SK1, 'models/SK1_MODEL.json'), TRAINING_RECORD = resolve(SK1, 'evidence/SK1_TRAINING_RECORD.json'), VAL_MATRIX = resolve(SK11, 'evidence/SK1_1_DECISION_FAILURE_MATRIX.json');
export const PINS = Object.freeze({
  modelFileSha256: '683ce6e09c374e7c3a628a53e39f9875d6b8122b6eca8a4b72d58087a0c9efa0', modelHash: 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b',
  kernelSourceHash: '5588744316bf27efaabdc72b86b886f6e31d868c13f3a783bc75ca19a3bc7cb5', trainingRecordSha256: '0a20b72ba66967ad64e3dcf5fab50c475c32107c030c1b5fe5cf4d66ec7b471e',
  validationResultsSha256: '239c16bc210adef28e7cdef40ecd14298625ee26e08c13f45ad146988a3622b1', experimentFreezeSha256: 'd22be2c4766324db1794d511b3bbd79917d3771c28cfa1c7087ba4c6c0663794' });
const sha = (b) => createHash('sha256').update(b).digest('hex'), fileSha = (p) => sha(readFileSync(p)), readJ = (p) => JSON.parse(readFileSync(p, 'utf8')), J = JSON.stringify, fail = (m) => { throw Error(m); };
const r6 = (x) => (x === null || x === undefined ? null : Math.round(x * 1e6) / 1e6), sigmoid = (x) => 1 / (1 + Math.exp(-x)), clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const meanSd = (p) => { const m = p.reduce((a, b) => a + b, 0) / p.length; return [m, Math.sqrt(p.reduce((a, b) => a + (b - m) * (b - m), 0) / p.length)]; };
export const ACTION_COLUMNS = Object.freeze(['index', 'type', 'selectable', 'inSampleEstimate', 'inSampleUpper', 'inSampleTier', 'oobEstimate', 'oobUpper', 'oobTier', 'cat', 'introS0', 'introNexus', 'inInSampleSet', 'inOobSet', 'inS0Set', 'inNexusSet', 'gradientHostile', 'gradientObjective', 'gradientThreatened']);
const MIN_OOB_RISK_BAGS = 2, GRAD = ['gradient.hostile', 'gradient.objective', 'gradient.threatened'];

/** Re-derive the family bootstrap of every bag of one head (infra/gbdt.mjs fitHead draws; no fitting). */
function bagCounts(label, families, bags) { const fams = [...new Set(families)].sort(), rnd = prng(label), out = []; for (let b = 0; b < bags; b++) { const count = new Map(); for (let k = 0; k < fams.length; k++) { const f = fams[Math.floor(rnd() * fams.length)]; count.set(f, (count.get(f) ?? 0) + 1); } out.push(count); } return out; }

function decisionView(cls, sem, set, kind, top, per, single, catCount, M, cfg) {
  // per[a] = { est, upper, tier, bagRisks } under this reading; set = forced-choice set; top = set[0]
  const n = cls.projection.menu.length, inSet = new Set(set), r = evalClass(cls, set), pattern = (c) => (c === 0 ? 'NONE' : c === M ? 'ALL_MEMBERS' : 'SOME_MEMBERS');
  const isSafe = (a) => !single[a].introB && !single[a].introN, safeOther = [...Array(n).keys()].filter((a) => isSafe(a) && !inSet.has(a) && sem[a].selectable), failing = Boolean(r.introB || r.introN);
  const t = per[top], lower = safeOther.filter((a) => per[a].upper < t.upper), order = [...safeOther].sort((a, b) => per[a].upper - per[b].upper), best = order.length ? order[0] : null;
  const failure = !failing ? null : { vsS0: Boolean(r.introB), vsNexus: Boolean(r.introN), onBase: Boolean(r.introBBase || r.introNBase), chosenCatastrophicIn: pattern(Math.max(...set.map((a) => catCount[a]))),
    // WITHIN_MENU_RISK_ORDERING_ERROR: no safe alternative has a lower risk bound than the chosen action (the risk order itself is wrong)
    // RANKING_CONTRACT_ERROR: a safe alternative has a lower bound (same tier) and lost on the expected-regret order
    mechanism: !safeOther.length ? 'NO_SAFE_ALTERNATIVE' : lower.length ? 'RANKING_CONTRACT_ERROR' : 'WITHIN_MENU_RISK_ORDERING_ERROR', safeAlternatives: safeOther.length,
    sameTypeSafeAlternative: safeOther.some((a) => cls.projection.menu[a].type === cls.projection.menu[top].type), bestSafeAlternative: best === null ? null : { index: best, type: cls.projection.menu[best].type, estimate: r6(per[best].est), upper: r6(per[best].upper), tier: per[best].tier },
    bagsUsed: t.bagRisks.length, bagsWhereBestSafeAlternativeHasLowerRisk: best === null ? null : t.bagRisks.filter((p, b) => per[best].bagRisks[b] < p).length, boundGapInSpreads: best === null || !t.spread ? null : r6((per[best].upper - t.upper) / t.spread) };
  return { kind, accepted: kind === 'RECOMMEND', forcedSet: [...set], type: cls.projection.menu[top].type, estimate: r6(t.est), spread: r6(t.spread), upper: r6(t.upper), tier: t.tier, expectedRegret: r6(t.regret),
    introS0: Boolean(r.introB), introNexus: Boolean(r.introN), union: failing, catAny: Boolean(r.catAny), nreg: r6(r.nreg), equalsS0: r.equalsB, equalsNexus: r.equalsN, failure };
}

export function build() {
  for (const [k, f] of [['modelFileSha256', MODEL_FILE], ['trainingRecordSha256', TRAINING_RECORD], ['validationResultsSha256', resolve(SK1, 'evidence/SK1_VALIDATION_RESULTS.json')], ['experimentFreezeSha256', resolve(SK1, 'evidence/SK1_EXPERIMENT_FREEZE.json')]]) if (fileSha(f) !== PINS[k]) fail('FROZEN_IDENTITY_MISMATCH:' + k);
  const { kernel, featurizer, model } = loadForgeKernel(MODEL_FILE), cfg = model.ranking, train = readJ(TRAINING_RECORD), arm = train.arms.find((a) => a.arm === 'PRIMARY');
  if (model.modelHash !== PINS.modelHash || kernel.identity.kernelSourceHash !== PINS.kernelSourceHash) fail('FROZEN_IDENTITY_MISMATCH:model_or_kernel');
  const { classes, manifest } = loadPopulation('EXPLORATION', 'DEVELOPMENT'), issues = [], need = (name, ok) => { if (!ok) issues.push(name); };
  need('classListDigest', manifest.classListDigest === train.population.classListDigest && classes.length === 1000);
  // ---- features and labels in the trainer's row order
  const F = classes.map((c) => { const r = forgeRequest(c.projection, c.evidence); return { req: r, feat: featurizer(r.state, r.legalActions, r.advisoryEvidence) }; }), L = classes.map(labelsOf);
  const rowFam = [], yCat = [], yReg = []; classes.forEach((c, ci) => F[ci].feat.rows.forEach((_, a) => { rowFam.push(c.family); yCat.push(L[ci].catAny[a]); yReg.push(L[ci].nreg[a]); }));
  need('rows', rowFam.length === arm.rows); need('catAnyBaseRate', yCat.reduce((a, b) => a + b, 0) / yCat.length === model.training.catAnyBaseRate);
  // ---- re-derive each bag's family bootstrap and verify it exactly against the stored base of that bag
  const B = model.heads.risk.bags.length, counts = { risk: bagCounts('SK1|PRIMARY|final|risk', rowFam, B), regret: bagCounts('SK1|PRIMARY|final|regret', rowFam, B) };
  const baseOf = (count, y, logistic) => { let sw = 0, sy = 0; for (let i = 0; i < y.length; i++) { const w = count.get(rowFam[i]) ?? 0; if (w > 0) { sw += w; sy += w * y[i]; } } const m = sy / sw; return logistic ? Math.log(Math.min(1 - 1e-6, Math.max(1e-6, m)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, m)))) : m; };
  const baseCheck = { risk: counts.risk.map((c, b) => baseOf(c, yCat, true) === model.heads.risk.bags[b].base), regret: counts.regret.map((c, b) => baseOf(c, yReg, false) === model.heads.regret.bags[b].base) };
  need('bagBootstrapReconstructionExact', baseCheck.risk.every(Boolean) && baseCheck.regret.every(Boolean));
  const fams = [...new Set(rowFam)].sort(), oobBags = (head, fam) => [...Array(B).keys()].filter((b) => !counts[head][b].has(fam));
  // ---- per class
  const globalRows = new Map(), rows = classes.map((cls, ci) => {
    const { req, feat } = F[ci], n = req.legalActions.length, M = cls.members.length, sem = assessSemantics(feat, n), rec = kernel.recommend(req.state, req.legalActions, req.advisoryEvidence), d = rec.recommendedActionOrAbstention;
    const forced = (d.kind === 'RECOMMEND' ? d.decisionSet : d.bestEffortNotRecommended?.decisionSet ?? []).map((a) => a.index); if (!forced.length) fail('NO_FORCED_CHOICE:' + cls.id);
    const pr = feat.rows.map((row) => model.heads.risk.bags.map((b) => sigmoid(bagScore(b, row)))), pg = feat.rows.map((row) => model.heads.regret.bags.map((b) => bagScore(b, row)));
    const oodN = feat.rows.map((row) => row.filter((v, j) => v < model.envelope.min[j] || v > model.envelope.max[j]).length), tierOf = (u) => Math.floor(u / cfg.tierWidth + 1e-12);
    const reading = (rb, gb) => feat.rows.map((_, a) => { const br = rb.map((b) => pr[a][b]), [m, s] = meanSd(br), [g] = meanSd(gb.map((b) => pg[a][b])), upper = clamp01(m + cfg.z * s + cfg.oodPenalty * oodN[a]); return { est: m, spread: s, upper, tier: tierOf(upper), regret: g, bagRisks: br }; });
    const decide = (per) => { const dd = rankActions(sem, per.map((p, i) => ({ index: i, supported: true, upper: p.upper, regret: { estimate: p.regret } })), cfg).decision; return { kind: dd.kind, set: dd.kind === 'RECOMMEND' ? dd.decisionSet : dd.forcedChoiceSet ?? [], top: dd.kind === 'RECOMMEND' ? dd.selectedIndex : dd.forcedChoiceIndex }; };
    const all = [...Array(B).keys()], perIS = reading(all, all), dIS = decide(perIS);
    if (dIS.kind !== d.kind || J(dIS.set) !== J([...forced].sort((a, b) => a - b))) fail('PER_BAG_RECOMPUTATION_DOES_NOT_REPRODUCE_KERNEL:' + cls.id);
    const rb = oobBags('risk', cls.family), gb = oobBags('regret', cls.family), oobOk = rb.length >= MIN_OOB_RISK_BAGS && gb.length >= 1, perOOB = oobOk ? reading(rb, gb) : null, dOOB = oobOk ? decide(perOOB) : null;
    const catCount = Array(n).fill(0); for (const m of cls.members) { const max = Math.max(...m.truth); for (let a = 0; a < n; a++) if (max - m.truth[a] >= CATASTROPHE) catCount[a]++; }
    const single = [...Array(n).keys()].map((a) => evalClass(cls, [a])), pattern = (c) => (c === 0 ? 'NONE' : c === M ? 'ALL_MEMBERS' : 'SOME_MEMBERS'), rS = evalClass(cls, cls.B), rN = evalClass(cls, cls.N);
    const types = (set) => [...new Set(set.map((i) => cls.projection.menu[i].type))].sort().join('+');
    const IS = decisionView(cls, sem, dIS.set, dIS.kind, dIS.top, perIS, single, catCount, M, cfg), OOB = oobOk ? decisionView(cls, sem, dOOB.set, dOOB.kind, dOOB.top, perOOB, single, catCount, M, cfg) : null;
    // ---- public-feature contrast between the chosen unsafe action and its best safe alternative (names only; menu-level context features are equal by construction)
    const contrast = (view) => { const f = view?.failure; if (!f || !f.bestSafeAlternative) return; const a = feat.rows[view.forcedSet[0]], b = feat.rows[f.bestSafeAlternative.index]; f.differingFeatures = feat.schema.names.filter((_, j) => a[j] !== b[j]); f.identicalFeatureVector = f.differingFeatures.length === 0; f.gradientContrast = Object.fromEntries(GRAD.map((g) => [g, [a[feat.schema.names.indexOf(g)], b[feat.schema.names.indexOf(g)]]])); };
    contrast(IS); contrast(OOB);
    // ---- feature-vector collisions: actions the featurisation cannot tell apart
    const keyOf = feat.rows.map((row) => J(row)), groups = new Map(); keyOf.forEach((k, a) => (groups.get(k) ?? groups.set(k, []).get(k)).push(a));
    const unsafe = (a) => single[a].introB || single[a].introN, mixed = [...groups.values()].filter((g) => g.length > 1);
    keyOf.forEach((k, a) => { const e = globalRows.get(k) ?? globalRows.set(k, { n: 0, cat: 0, classes: new Set() }).get(k); e.n++; e.cat += Number(catCount[a] > 0); e.classes.add(ci); });
    const collisions = { groupsOfIdenticalRows: mixed.length, mixedCatastropheLabel: mixed.filter((g) => new Set(g.map((a) => catCount[a] > 0)).size > 1).length, mixedIntroductionLabel: mixed.filter((g) => new Set(g.map(unsafe)).size > 1).length, sameSymmetryOrbit: mixed.filter((g) => new Set(g.map((a) => feat.keys[a])).size === 1).length };
    const actions = [...Array(n).keys()].map((a) => [a, cls.projection.menu[a].type, Number(sem[a].selectable), r6(perIS[a].est), r6(perIS[a].upper), perIS[a].tier, oobOk ? r6(perOOB[a].est) : null, oobOk ? r6(perOOB[a].upper) : null, oobOk ? perOOB[a].tier : null, pattern(catCount[a]), Number(Boolean(single[a].introB)), Number(Boolean(single[a].introN)),
      Number(dIS.set.includes(a)), Number(oobOk && dOOB.set.includes(a)), Number(cls.B.includes(a)), Number(cls.N.includes(a)), ...GRAD.map((g) => feat.rows[a][feat.schema.names.indexOf(g)])]);
    return { alias: cls.id, family: cls.family, horizon: cls.cell.split('/')[3], cellSuffix: cls.cell.split('/')[4] ?? null, menuSize: n, members: M, oob: { riskBags: rb.length, regretBags: gb.length, available: oobOk },
      S0: { set: [...cls.B], type: types(cls.B), introNexus: Boolean(rS.introN), catAny: Boolean(rS.catAny), nreg: r6(rS.nreg) }, NEXUS: { set: [...cls.N], type: types(cls.N), introS0: Boolean(rN.introB), catAny: Boolean(rN.catAny), nreg: r6(rN.nreg) },
      inSample: IS, outOfBag: OOB, safeActions: single.filter((s) => !s.introB && !s.introN).length, neverCatastrophicActions: catCount.filter((c) => c === 0).length, collisions, actions };
  });
  const cross = [...globalRows.values()].filter((e) => e.classes.size > 1), crossMixed = cross.filter((e) => e.cat > 0 && e.cat < e.n);
  // ---- feature contrast for the two accepted validation failures (public requests only; flags come from the tracked SK1.1 matrix)
  const vm = readJ(VAL_MATRIX), AC = vm.actionColumns, col = (a, k) => a[AC.indexOf(k)], targets = vm.rows.filter((r) => r.failure?.accepted), val = loadPopulation('VALIDATION', 'CHECK').classes;
  const validationContrasts = targets.map((r) => { const cls = val.find((c) => c.id === r.alias), req = forgeRequest(cls.projection, cls.evidence), feat = featurizer(req.state, req.legalActions, req.advisoryEvidence), top = r.sk1.forcedSet[0];
    const best = r.actions.find((a) => col(a, 'selectable') === 1 && col(a, 'inForcedSet') === 0 && col(a, 'introS0') === 0 && col(a, 'introNexus') === 0), bi = col(best, 'index'), names = feat.schema.names, differing = names.filter((_, j) => feat.rows[top][j] !== feat.rows[bi][j]);
    return { alias: r.alias, chosen: { type: req.legalActions[top].type }, bestSafeAlternative: { type: col(best, 'type'), estimate: col(best, 'estimate'), upper: col(best, 'upper') }, sameType: req.legalActions[top].type === col(best, 'type'), differingFeatures: differing.map((nm) => ({ feature: nm, chosen: feat.rows[top][names.indexOf(nm)], safeAlternative: feat.rows[bi][names.indexOf(nm)] })), identicalFeatureVector: differing.length === 0 }; });
  need('twoAcceptedValidationFailures', validationContrasts.length === 2);
  const matrix = { schema: 'SK2F_EXPLORATION_MATRIX_V1', authority: 'R0', stage: 'STAGE3H-SK2-F', labels: ['READ_ONLY_DIAGNOSTIC', 'EXISTING_EXPLORATION_EVIDENCE', 'NO_TRAINING', 'POST_HOC_EXPLORATORY_ONLY', 'NOT_A_QUALIFICATION'], node: process.version,
    source: { ...PINS, extractorSha256: fileSha(fileURLToPath(import.meta.url)), population: 'SK1 EXPLORATION (development data; the frozen model was fit on it)', classListDigest: manifest.classListDigest, validationMatrixSha256: fileSha(VAL_MATRIX) },
    readings: { IN_SAMPLE: 'frozen rule exactly as shipped, applied to the classes the model was fit on: resubstitution, optimistic', OUT_OF_BAG: `for each class, only the bags whose family bootstrap never drew the class's origin family (at least ${MIN_OOB_RISK_BAGS} risk bags and 1 regret bag); a diagnostic estimator, NOT the frozen rule`,
      OUT_OF_FOLD_REFERENCE: 'aggregate recorded by the trainer before validation, in SK1_TRAINING_RECORD.json; cited, not recomputed (recomputing would require training)' },
    frozenCriterion: { tau: cfg.tau, tierWidth: cfg.tierWidth, z: cfg.z, oodPenalty: cfg.oodPenalty, contract: cfg.contract },
    disclosure: 'Opaque aliases only. No seed, world hash, coordinate, utility or member identity. Per-action flags are categorical outcomes of the frozen evaluator on the sampled member worlds; "NONE" does not mean universally safe.',
    reconciliation: { exact: issues.length === 0, issues, classes: rows.length, rows: rowFam.length, families: fams.length, bagBootstrapVerifiedAgainstStoredBase: baseCheck, oobAvailableClasses: rows.filter((r) => r.oob.available).length, oobRiskBagsPerClass: { min: Math.min(...rows.map((r) => r.oob.riskBags)), mean: r6(rows.reduce((s, r) => s + r.oob.riskBags, 0) / rows.length), max: Math.max(...rows.map((r) => r.oob.riskBags)) } },
    crossClassFeatureCollisions: { note: 'identical 144-feature rows that occur in more than one class', groups: cross.length, withMixedCatastropheLabel: crossMixed.length, rowsInMixedGroups: crossMixed.reduce((s, e) => s + e.n, 0), totalRows: rowFam.length },
    validationAcceptedFailureContrasts: validationContrasts, actionColumns: ACTION_COLUMNS, rows };
  return { matrix, issues };
}
export const serialise = (m) => { const { rows, ...head } = m; return JSON.stringify(head, null, 1).replace(/\n}$/, ',\n "rows": [\n' + rows.map((r) => J(r)).join(',\n') + '\n ]\n}\n'); };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'dry', { matrix, issues } = build(), text = serialise(matrix);
  console.log(J({ mode, reconciliation: matrix.reconciliation, crossClassFeatureCollisions: matrix.crossClassFeatureCollisions, bytes: text.length, sha256: sha(text) }, null, 1));
  if (issues.length) { console.log('SK2F_EXPLORATION_RECONCILIATION_FAILED'); process.exitCode = 1; }
  else if (mode === '--write') { writeExclusive(MATRIX_FILE, text); console.log('written evidence/SK2F_EXPLORATION_MATRIX.json'); }
  else if (mode === 'check') { const same = readFileSync(MATRIX_FILE, 'utf8') === text; console.log(same ? 'SK2F_EXPLORATION_CHECK_PASS' : 'SK2F_EXPLORATION_CHECK_FAILED'); if (!same) process.exitCode = 1; }
  else if (mode !== 'dry') fail('USAGE: node diagnostics/extract-exploration.mjs [--write | check]');
}
