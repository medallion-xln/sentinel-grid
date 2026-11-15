// H-W1 I-4 exploration training and measurement. EXPLORATION population only: refuses to run with HW1_PHASE=I5 and never calls loadPopulation('VALIDATION').
// Offline native outcomes are LABELS here (orbit nreg, orbit catastrophe); the policies that come out receive only the public projection. Every honest number is out-of-fold, family-grouped;
// every candidate (including the ones that do worse than the comparators) is kept in the evidence.
//   node i4-train.mjs [--write]      dry run prints a compact table; --write seals models/*.json and evidence/I4_EXPLORATION_RESULTS.json
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { writeExclusive, prng } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { LANE } from './i2-allocator.mjs';
import { loadPopulation, manifestPath } from './i2-population.mjs';
import { buildDataset, TYPE_NAMES } from './i4-data.mjs';
import { makeFolds, oofPredictions, withinMse, decideAll, summarise, withinAuc, LAMBDAS, FOLDS } from './i4-cv.mjs';
import { ROSTER, SPECS, TAUS, KAPPAS, TUNE_RESAMPLES, ruleScore, chooseLambda, tuneRule, buildModel, modelRowScores } from './i4-candidates.mjs';
import { makePolicy } from './i3-policy.mjs';
import { NAMES, FEATURE_VERSION, FEATURE_SETS } from './i3-features.mjs';

const HET_THRESHOLD = 0.05, CONSISTENCY_CLASSES = 40, sha = (b) => createHash('sha256').update(b).digest('hex'), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const evidencePath = resolve(LANE, 'evidence/I4_EXPLORATION_RESULTS.json'), modelPath = (c) => resolve(LANE, 'models', `${c.id}_${c.label}.json`);
const SOURCES = ['i3-features.mjs', 'i3-policy.mjs', 'public-projection.mjs', 'hw1-eval.mjs', 'i4-ridge.mjs', 'i4-data.mjs', 'i4-cv.mjs', 'i4-candidates.mjs', 'i4-train.mjs'];
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function labelShuffle(ds, tag) { // control: permute labels across the actions of each class (deterministic); structure and features untouched
  const rnd = prng(tag), nreg = new Float64Array(ds.N), cat = new Float64Array(ds.N);
  ds.classes.forEach((c, ci) => { const a = ds.start[ci], perm = [...Array(c.n).keys()]; for (let i = c.n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; } for (let i = 0; i < c.n; i++) { nreg[a + i] = ds.labels.nreg[a + perm[i]]; cat[a + i] = ds.labels.cat[a + perm[i]]; } });
  return { ...ds, labels: { nreg, cat } };
}
const hitRate = (ds, picks) => picks.filter((p, ci) => ds.classes[ci].cat[p.index] === 0).length / picks.length;
const brief = (a) => ({ classes: a.classes, illegal: a.illegal, introVsS0: a.introVsS0, introVsNexus: a.introVsNexus, introVsS0BaseOnly: a.introVsS0BaseOnly, introVsNexusBaseOnly: a.introVsNexusBaseOnly, introMembersVsS0: a.introMembersVsS0, introMembersVsNexus: a.introMembersVsNexus,
  catClasses: a.catClasses, familiesWithIntroVsS0: a.familiesWithIntroVsS0, familiesWithIntroVsNexus: a.familiesWithIntroVsNexus, meanNreg: a.meanNreg, meanNregS0: a.meanNregS0, meanNregNexus: a.meanNregNexus, worstClassNreg: a.worstClassNreg,
  deltaVsS0: a.deltaVsS0, deltaVsNexus: a.deltaVsNexus, deltaVsS0BaseOnly: a.deltaVsS0BaseOnly, deltaVsNexusBaseOnly: a.deltaVsNexusBaseOnly, equalsS0: a.equalsS0, equalsNexus: a.equalsNexus });

export function main(write) {
  if (process.env.HW1_PHASE === 'I5') throw Error('I4_TRAINER_REFUSES_I5_PHASE');
  const { manifest, classes } = loadPopulation('EXPLORATION'), ds = buildDataset(classes), folds = makeFolds(ds), t0 = Date.now();
  const oof = oofPredictions(ds, folds, SPECS), lam = {}, auc = {};
  for (const name of Object.keys(SPECS)) { lam[name] = { nreg: chooseLambda(ds, oof, name, 'nreg'), cat: chooseLambda(ds, oof, name, 'cat') }; }
  const zero = new Float64Array(ds.N), varWithin = { nreg: withinMse(ds, zero, 'nreg'), cat: withinMse(ds, zero, 'cat') };
  for (const name of Object.keys(SPECS)) auc[name] = { ...withinAuc(ds, oof[`${name}|cat|${lam[name].cat.lambda}`]), catWithinMse: lam[name].cat.mse, catWithinR2: 1 - lam[name].cat.mse / varWithin.cat, nregWithinMse: lam[name].nreg.mse, nregWithinR2: 1 - lam[name].nreg.mse / varWithin.nreg, lambdaNreg: lam[name].nreg.lambda, lambdaCat: lam[name].cat.lambda };
  // dataset base rates and context bounds (offline labels: context only, none of it is a policy)
  const safeExists = ds.classes.map((c) => c.cat.some((x) => x === 0)), safeFrac = ds.classes.map((c) => c.cat.filter((x) => x === 0).length / c.n);
  const dataset = { classes: ds.classes.length, rows: ds.N, menuSize: { min: Math.min(...ds.classes.map((c) => c.n)), median: q(ds.classes.map((c) => c.n), 0.5), max: Math.max(...ds.classes.map((c) => c.n)) }, classesWithClassSafeAction: safeExists.filter(Boolean).length, rateClassesWithClassSafeAction: mean(safeExists.map(Number)),
    meanSafeActionFraction: mean(safeFrac), uniformRandomActionHitRate: mean(safeFrac), uniformRandomMeanNreg: mean(ds.classes.map((c) => mean(c.nreg))), offlineBestActionMeanNreg: mean(ds.classes.map((c) => Math.min(...c.nreg))), actionsCatastrophicRate: mean([...ds.labels.cat]) };
  // hidden-state-sensitive action types (operational definition): the action's catastrophe status differs between member worlds of one public class
  const types = TYPE_NAMES.map((name, t) => { const rows = [...Array(ds.N).keys()].filter((r) => ds.typeOf[r] === t); return { type: name, actions: rows.length, catRate: rows.length ? mean(rows.map((r) => ds.labels.cat[r])) : 0, hetRate: rows.length ? mean(rows.map((r) => ds.het[r])) : 0 }; });
  const sensitive = new Set(types.map((x, t) => (x.actions && x.hetRate >= HET_THRESHOLD ? t : -1)).filter((t) => t >= 0)), insensitive = (r) => !sensitive.has(ds.typeOf[r]);
  const candidates = [], consistency = [], ms = [];
  for (const cand of ROSTER) {
    const lamN = lam[cand.spec].nreg.lambda, lamC = lam[cand.spec].cat.lambda, oN = oof[`${cand.spec}|nreg|${lamN}`], oC = oof[`${cand.spec}|cat|${lamC}`], tuned = tuneRule(ds, classes, oN, oC, cand.rule);
    const dec = decideAll(ds, classes, (r) => ruleScore(cand.rule, tuned.hyper, oN[r], oC[r])), oofSum = summarise(ds, dec.results), restricted = summarise(ds, decideAll(ds, classes, (r) => ruleScore(cand.rule, tuned.hyper, oN[r], oC[r]), insensitive).results);
    const model = buildModel(ds, cand, lamN, lamC, tuned.hyper, { classListDigest: manifest.classListDigest, tuning: tuned.grid }), scores = modelRowScores(ds, model), inDec = decideAll(ds, classes, (r) => scores[r]), inSum = summarise(ds, inDec.results);
    const policy = makePolicy(JSON.parse(JSON.stringify(model))), step = Math.floor(ds.classes.length / CONSISTENCY_CLASSES); let mismatches = 0, checked = 0;
    for (let ci = 0; ci < ds.classes.length && checked < CONSISTENCY_CLASSES; ci += step, checked++) { const d = policy.decideProjection(classes[ci].projection); ms.push(d.ms); if (d.index !== inDec.picks[ci].index) mismatches++; }
    consistency.push({ id: cand.id, checked, mismatches });
    const sensitivePickShare = dec.picks.filter((p, ci) => sensitive.has(ds.typeOf[ds.start[ci] + p.index])).length / dec.picks.length;
    candidates.push({ ...cand, hyper: tuned.hyper, tuning: tuned.grid, lambdaNreg: lamN, lambdaCat: cand.rule === 'NEG_NREG' ? null : lamC, oof: { ...brief(oofSum), classSafeHitRate: hitRate(ds, dec.picks), classSafeHitRateAmongClassesWithSafeAction: dec.picks.filter((p, ci) => safeExists[ci] && ds.classes[ci].cat[p.index] === 0).length / safeExists.filter(Boolean).length },
      inSample: { ...brief(inSum), classSafeHitRate: hitRate(ds, inDec.picks) }, hiddenSensitivity: { sensitivePickShare, restrictedToInsensitiveTypes: brief(restricted) }, model: { file: `models/${cand.id}_${cand.label}.json`, sha256: sha(JSON.stringify(model, null, 1) + '\n'), nonZeroWeights: Object.fromEntries(Object.entries(model.heads).map(([k, h]) => [k, h.w.filter((x) => x !== 0).length])) } });
    if (write) { mkdirSync(resolve(LANE, 'models'), { recursive: true }); writeExclusive(modelPath(cand), model); }
    const o = candidates.at(-1).oof; console.log(`${cand.id} ${cand.label.padEnd(26)} lamN=${lamN} ${JSON.stringify(tuned.hyper)} introS0=${o.introVsS0} introNx=${o.introVsNexus} nreg=${o.meanNreg.toFixed(4)} dS0=${o.deltaVsS0.point.toFixed(4)}(ub ${o.deltaVsS0.upper95.toFixed(4)}) dNx=${o.deltaVsNexus.point.toFixed(4)}(ub ${o.deltaVsNexus.upper95.toFixed(4)}) hit=${o.classSafeHitRate.toFixed(3)}`);
  }
  // control: shuffled labels (BASE, within-class, NEG_NREG) must not beat chance if the pipeline has no leakage
  const sh = labelShuffle(ds, 'HW1_I4_LABEL_SHUFFLE_V1'), shOof = oofPredictions(sh, folds, { 'BASE|within': SPECS['BASE|within'] }), shLam = chooseLambda(sh, shOof, 'BASE|within', 'nreg'), shScore = shOof[`BASE|within|nreg|${shLam.lambda}`];
  const shDec = decideAll(ds, classes, (r) => -shScore[r]), control = { name: 'LABEL_SHUFFLE_BASE_WITHIN_NEG_NREG', lambda: shLam.lambda, ...brief(summarise(ds, shDec.results)), classSafeHitRate: hitRate(ds, shDec.picks) };
  const note = [
    'Training labels are offline native outcomes of EXPLORATION worlds; inference features are the I-1 public projection only (i3-features.mjs). No validation or holdout outcome was loaded (HW1_PHASE != I5).',
    'Hyper-parameters (head lambda, SAFE_FIRST tau, RISK_WEIGHTED kappa) were chosen on out-of-fold exploration decisions with family-grouped folds; the OOF numbers are the honest exploration estimate, in-sample numbers are shown only to expose overfit.',
    'The action-feature families were designed after the earlier offline-oracle study (design-leak concern, H-W1 contract); the 341 spent classes are not used here and are not independent evidence.',
    `Hidden-state-sensitive types are an operational definition adopted in I-4: action types whose catastrophe status differs between member worlds of one public class in at least ${HET_THRESHOLD * 100}% of their actions.`,
    'Exploration results cannot qualify a policy: only the single I-5 validation pass can, and a candidate frozen after seeing validation outcomes would not be independently validated.'];
  const out = { schema: 'STAGE3H_HW1_I4_EXPLORATION_V1', authority: 'R0', stage: 'I-4', population: { name: 'EXPLORATION', classes: classes.length, rows: ds.N, classListDigest: manifest.classListDigest, manifestSha256: sha(readFileSync(manifestPath('EXPLORATION'))) }, validationAccessed: false, holdoutAccessed: false, privilegedFeaturesUsed: false,
    sources: Object.fromEntries(SOURCES.map((f) => [f, sha(readFileSync(resolve(LANE, f)))])), features: { version: FEATURE_VERSION, count: NAMES.length, base: FEATURE_SETS.BASE.length, full: FEATURE_SETS.FULL.length },
    protocol: { folds: FOLDS, foldClassLoad: folds.load, groupedBy: 'origin family', lambdas: LAMBDAS, taus: TAUS, kappas: KAPPAS, tuneResamples: TUNE_RESAMPLES, headLambdaCriterion: 'out-of-fold within-class MSE', ruleParameterCriterion: 'lexicographic: fewest class-level introductions vs S0 + Nexus, then lowest mean nreg', maxCandidates: 20, candidatesBuilt: ROSTER.length },
    dataset, headQuality: auc, hiddenSensitivity: { hetThreshold: HET_THRESHOLD, sensitiveTypes: [...sensitive].map((t) => TYPE_NAMES[t]), types }, controls: [control], modelConsistency: { perCandidate: consistency, totalMismatches: consistency.reduce((a, c) => a + c.mismatches, 0) },
    compute: { decisions: ms.length, medianMs: q(ms, 0.5), p95Ms: q(ms, 0.95), maxMs: Math.max(...ms), budget: { medianMs: 100, maxMs: 1000 } }, candidates, notes: note, elapsedSeconds: (Date.now() - t0) / 1000 };
  console.log(JSON.stringify({ dataset, control: { introVsS0: control.introVsS0, introVsNexus: control.introVsNexus, meanNreg: control.meanNreg, hit: control.classSafeHitRate }, compute: out.compute, consistencyMismatches: out.modelConsistency.totalMismatches, sensitiveTypes: out.hiddenSensitivity.sensitiveTypes }, null, 1));
  if (write) { writeExclusive(evidencePath, out); console.log('written ' + evidencePath); }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'i4-train.mjs')) main(process.argv.includes('--write'));
