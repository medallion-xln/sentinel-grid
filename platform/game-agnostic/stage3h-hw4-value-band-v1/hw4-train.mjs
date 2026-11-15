// H-W4 Phase 6: matched two-arm exploration training (EXPLORATION population only; refuses HW4_PHASE=VALIDATION and
// never loads the validation population). PAIRED protocol — the SAME frozen learning procedure runs once per arm
// (V1_PUBLIC_ONLY, V2_PUBLIC_PLUS_VALUE_BAND); the ONLY difference is the feature builder (V1 rows vs V1 rows + 8 band
// one-hots). Fold assignment is arm-independent (computed from origin families). Every candidate is kept in the
// evidence; the prespecified per-arm selection is lexicographic (fewest OOF intros vs S0 + Nexus, then lowest mean nreg).
//   node hw4-train.mjs [--write]     dry run prints the table; --write seals models/ and evidence/HW4_EXPLORATION_<ARM>.json
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { writeExclusive, prng } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { LANE } from './hw4-allocator.mjs';
import { loadPopulation, manifestPath } from './hw4-population.mjs';
import { buildDataset, pick, orbitOf, TYPE_NAMES } from './hw4-data.mjs';
import { makeFolds, oofPredictions, withinMse, decideAll, summarise, withinAuc, LAMBDAS, FOLDS } from '../stage3h-hw1-dev-v1/i4-cv.mjs';
import { ROSTER, TAUS, KAPPAS, TUNE_RESAMPLES, ruleScore, chooseLambda, tuneRule, modelRowScores } from '../stage3h-hw1-dev-v1/i4-candidates.mjs';
import { standardise, gramOf, fitFromGram } from '../stage3h-hw1-dev-v1/i4-ridge.mjs';
import { makePolicy, POLICY_FAMILY, POLICY_VERSION, ARM_FEATURES } from './hw4-policy.mjs';
import { NAMES, FEATURE_VERSION, FEATURE_SETS } from '../stage3h-hw1-dev-v1/i3-features.mjs';
import { FEATURE_VERSION_V1, FEATURE_VERSION_V2, BAND_NAMES } from './hw4-features.mjs';

const ARMS = ['V1_PUBLIC_ONLY', 'V2_PUBLIC_PLUS_VALUE_BAND'];
const HET_THRESHOLD = 0.05, CONSISTENCY_CLASSES = 40, sha = (b) => createHash('sha256').update(b).digest('hex'), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const LANE_FILES = ['hw4-contract-v2.mjs', 'hw4-features.mjs', 'hw4-policy.mjs', 'hw4-data.mjs', 'hw4-train.mjs', 'hw4-allocator.mjs'];
const HW1_FILES = ['public-projection.mjs', 'i3-features.mjs', 'hw1-eval.mjs', 'i4-ridge.mjs', 'i4-cv.mjs', 'i4-candidates.mjs'];
const GA = resolve(LANE, '..');

/** Arm feature sets: identical column indices for TYPE/BASE; FULL = all columns of the arm (band cols included for V2). */
function specsFor(arm) {
  const W = ARM_FEATURES[arm].names.length;
  return { 'TYPE|plain': { cols: [...TYPE_NAMES.keys()], within: false }, 'BASE|plain': { cols: [...FEATURE_SETS.BASE], within: false }, 'BASE|within': { cols: [...FEATURE_SETS.BASE], within: true },
    'FULL|plain': { cols: [...Array(W).keys()], within: false }, 'FULL|within': { cols: [...Array(W).keys()], within: true } };
}

/** Fit the heads on ALL exploration rows for one arm and return the model JSON the H-W4 policy runtime loads. */
function buildModelArm(ds, arm, cand, lamN, lamC, hyper, meta) {
  const spec = specsFor(arm)[cand.spec], W = ds.W, rows = [...Array(ds.N).keys()], { mean: mu, std } = standardise(rows.map((i) => ds.X.subarray(i * W, (i + 1) * W)), W);
  const Z = rows.map((i) => { const z = new Float64Array(W); for (let j = 0; j < W; j++) z[j] = (ds.X[i * W + j] - mu[j]) / std[j]; return z; }), g = gramOf(Z, ds.labels, ds.classOf, rows, spec.cols, spec.within);
  const heads = { nreg: fitFromGram(g, 'nreg', lamN) }; if (cand.rule !== 'NEG_NREG') heads.cat = fitFromGram(g, 'cat', lamC);
  return { policyId: `${POLICY_FAMILY}/${POLICY_VERSION}/${arm}/${cand.id}_${cand.label}`, policyFamily: POLICY_FAMILY, policyVersion: POLICY_VERSION, arm, featureVersion: ARM_FEATURES[arm].featureVersion, mean: mu, std, heads,
    score: { rule: cand.rule, ...hyper }, meta: { candidate: cand.id, label: cand.label, spec: cand.spec, trainedOn: 'EXPLORATION', lambdaNreg: lamN, lambdaCat: cand.rule === 'NEG_NREG' ? null : lamC, ...meta } };
}

function labelShuffle(ds, tag) {
  const rnd = prng(tag), nreg = new Float64Array(ds.N), cat = new Float64Array(ds.N);
  ds.classes.forEach((c, ci) => { const a = ds.start[ci], perm = [...Array(c.n).keys()]; for (let i = c.n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; } for (let i = 0; i < c.n; i++) { nreg[a + i] = ds.labels.nreg[a + perm[i]]; cat[a + i] = ds.labels.cat[a + perm[i]]; } });
  return { ...ds, labels: { nreg, cat } };
}
const hitRate = (ds, picks) => picks.filter((p, ci) => ds.classes[ci].cat[p.index] === 0).length / picks.length;
const brief = (a) => ({ classes: a.classes, illegal: a.illegal, introVsS0: a.introVsS0, introVsNexus: a.introVsNexus, introVsS0BaseOnly: a.introVsS0BaseOnly, introVsNexusBaseOnly: a.introVsNexusBaseOnly, introMembersVsS0: a.introMembersVsS0, introMembersVsNexus: a.introMembersVsNexus,
  catClasses: a.catClasses, familiesWithIntroVsS0: a.familiesWithIntroVsS0, familiesWithIntroVsNexus: a.familiesWithIntroVsNexus, meanNreg: a.meanNreg, meanNregS0: a.meanNregS0, meanNregNexus: a.meanNregNexus, worstClassNreg: a.worstClassNreg,
  deltaVsS0: a.deltaVsS0, deltaVsNexus: a.deltaVsNexus, deltaVsS0BaseOnly: a.deltaVsS0BaseOnly, deltaVsNexusBaseOnly: a.deltaVsNexusBaseOnly, equalsS0: a.equalsS0, equalsNexus: a.equalsNexus });

/** Prespecified lexicographic candidate pick (H_W4_DESIGN.md §3): fewest OOF intros vs S0, then vs Nexus, then lowest mean nreg. */
export const selectCandidate = (candidates) => [...candidates].sort((a, b) => a.oof.introVsS0 - b.oof.introVsS0 || a.oof.introVsNexus - b.oof.introVsNexus || a.oof.meanNreg - b.oof.meanNreg)[0];

export function main(write) {
  if (process.env.HW4_PHASE === 'VALIDATION') throw Error('HW4_TRAINER_REFUSES_VALIDATION_PHASE');
  const { manifest, classes } = loadPopulation('EXPLORATION'), foldsShared = makeFolds({ classes: classes.map((c) => ({ family: c.family })) }), t0 = Date.now();
  const results = {};
  for (const arm of ARMS) {
    const ds = buildDataset(classes, arm), folds = makeFolds(ds);
    // fold assignment must be arm-independent (paired design)
    if (JSON.stringify(folds.foldOfClass) !== JSON.stringify(foldsShared.foldOfClass)) throw Error('FOLD_ASSIGNMENT_NOT_PAIRED');
    const oof = oofPredictions(ds, folds, specsFor(arm)), lam = {}, auc = {};
    for (const name of Object.keys(specsFor(arm))) lam[name] = { nreg: chooseLambda(ds, oof, name, 'nreg'), cat: chooseLambda(ds, oof, name, 'cat') };
    const zero = new Float64Array(ds.N), varWithin = { nreg: withinMse(ds, zero, 'nreg'), cat: withinMse(ds, zero, 'cat') };
    for (const name of Object.keys(specsFor(arm))) auc[name] = { ...withinAuc(ds, oof[`${name}|cat|${lam[name].cat.lambda}`]), catWithinMse: lam[name].cat.mse, catWithinR2: 1 - lam[name].cat.mse / varWithin.cat, nregWithinMse: lam[name].nreg.mse, nregWithinR2: 1 - lam[name].nreg.mse / varWithin.nreg, lambdaNreg: lam[name].nreg.lambda, lambdaCat: lam[name].cat.lambda };
    const safeExists = ds.classes.map((c) => c.cat.some((x) => x === 0)), safeFrac = ds.classes.map((c) => c.cat.filter((x) => x === 0).length / c.n);
    const dataset = { classes: ds.classes.length, rows: ds.N, menuSize: { min: Math.min(...ds.classes.map((c) => c.n)), median: q(ds.classes.map((c) => c.n), 0.5), max: Math.max(...ds.classes.map((c) => c.n)) }, classesWithClassSafeAction: safeExists.filter(Boolean).length, rateClassesWithClassSafeAction: mean(safeExists.map(Number)),
      meanSafeActionFraction: mean(safeFrac), uniformRandomActionHitRate: mean(safeFrac), uniformRandomMeanNreg: mean(ds.classes.map((c) => mean(c.nreg))), offlineBestActionMeanNreg: mean(ds.classes.map((c) => Math.min(...c.nreg))), actionsCatastrophicRate: mean([...ds.labels.cat]) };
    const types = TYPE_NAMES.map((name, t) => { const rows = [...Array(ds.N).keys()].filter((r) => ds.typeOf[r] === t); return { type: name, actions: rows.length, catRate: rows.length ? mean(rows.map((r) => ds.labels.cat[r])) : 0, hetRate: rows.length ? mean(rows.map((r) => ds.het[r])) : 0 }; });
    const sensitive = new Set(types.map((x, t) => (x.actions && x.hetRate >= HET_THRESHOLD ? t : -1)).filter((t) => t >= 0)), insensitive = (r) => !sensitive.has(ds.typeOf[r]);
    const candidates = [], consistency = [], ms = [];
    for (const cand of ROSTER) {
      const lamN = lam[cand.spec].nreg.lambda, lamC = lam[cand.spec].cat.lambda, oN = oof[`${cand.spec}|nreg|${lamN}`], oC = oof[`${cand.spec}|cat|${lamC}`], tuned = tuneRule(ds, classes, oN, oC, cand.rule);
      const dec = decideAll(ds, classes, (r) => ruleScore(cand.rule, tuned.hyper, oN[r], oC[r])), oofSum = summarise(ds, dec.results), restricted = summarise(ds, decideAll(ds, classes, (r) => ruleScore(cand.rule, tuned.hyper, oN[r], oC[r]), insensitive).results);
      const model = buildModelArm(ds, arm, cand, lamN, lamC, tuned.hyper, { classListDigest: manifest.classListDigest, tuning: tuned.grid }), scores = modelRowScores(ds, model), inDec = decideAll(ds, classes, (r) => scores[r]), inSum = summarise(ds, inDec.results);
      const policy = makePolicy(JSON.parse(JSON.stringify(model))), step = Math.floor(ds.classes.length / CONSISTENCY_CLASSES); let mismatches = 0, checked = 0;
      for (let ci = 0; ci < ds.classes.length && checked < CONSISTENCY_CLASSES; ci += step, checked++) { const Pc = arm === 'V2_PUBLIC_PLUS_VALUE_BAND' ? classes[ci].projectionBanded : classes[ci].projection; const d = policy.decideProjection(Pc); ms.push(d.ms); if (d.index !== inDec.picks[ci].index) mismatches++; }
      consistency.push({ id: cand.id, checked, mismatches });
      const sensitivePickShare = dec.picks.filter((p, ci) => sensitive.has(ds.typeOf[ds.start[ci] + p.index])).length / dec.picks.length;
      candidates.push({ ...cand, hyper: tuned.hyper, tuning: tuned.grid, lambdaNreg: lamN, lambdaCat: cand.rule === 'NEG_NREG' ? null : lamC, oof: { ...brief(oofSum), classSafeHitRate: hitRate(ds, dec.picks), classSafeHitRateAmongClassesWithSafeAction: dec.picks.filter((p, ci) => safeExists[ci] && ds.classes[ci].cat[p.index] === 0).length / safeExists.filter(Boolean).length },
        inSample: { ...brief(inSum), classSafeHitRate: hitRate(ds, inDec.picks) }, hiddenSensitivity: { sensitivePickShare, restrictedToInsensitiveTypes: brief(restricted) }, model: { file: `models/${arm}_${cand.id}_${cand.label}.json`, sha256: sha(JSON.stringify(model, null, 1) + '\n'), nonZeroWeights: Object.fromEntries(Object.entries(model.heads).map(([k, h]) => [k, h.w.filter((x) => x !== 0).length])) } });
      if (write) { mkdirSync(resolve(LANE, 'models'), { recursive: true }); writeExclusive(resolve(LANE, 'models', `${arm}_${cand.id}_${cand.label}.json`), model); }
      const o = candidates.at(-1).oof; console.log(`${arm.slice(0, 2)} ${cand.id} ${cand.label.padEnd(26)} lamN=${lamN} ${JSON.stringify(tuned.hyper)} introS0=${o.introVsS0} introNx=${o.introVsNexus} nreg=${o.meanNreg.toFixed(4)} dS0=${o.deltaVsS0.point.toFixed(4)} dNx=${o.deltaVsNexus.point.toFixed(4)} hit=${o.classSafeHitRate.toFixed(3)}`);
    }
    const sh = labelShuffle(ds, 'HW4_LABEL_SHUFFLE_V1_' + arm), shSpecs = { 'BASE|within': specsFor(arm)['BASE|within'] }, shOof = oofPredictions(sh, folds, shSpecs), shLam = chooseLambda(sh, shOof, 'BASE|within', 'nreg'), shScore = shOof[`BASE|within|nreg|${shLam.lambda}`];
    const shDec = decideAll(ds, classes, (r) => -shScore[r]), control = { name: 'LABEL_SHUFFLE_BASE_WITHIN_NEG_NREG', lambda: shLam.lambda, ...brief(summarise(ds, shDec.results)), classSafeHitRate: hitRate(ds, shDec.picks) };
    const selected = selectCandidate(candidates);
    const out = { schema: 'STAGE3H_HW4_EXPLORATION_V1', authority: 'R0', stage: 'H-W4', arm, features: { version: ARM_FEATURES[arm].featureVersion, count: ARM_FEATURES[arm].names.length, bandFeatures: arm === 'V2_PUBLIC_PLUS_VALUE_BAND' ? BAND_NAMES : [] },
      population: { name: 'EXPLORATION', classes: classes.length, rows: ds.N, classListDigest: manifest.classListDigest, manifestSha256: sha(readFileSync(manifestPath('EXPLORATION'))) }, validationAccessed: false, holdoutAccessed: false, privilegedFeaturesUsed: false,
      protocol: { folds: FOLDS, foldClassLoad: folds.load, groupedBy: 'origin family', foldAssignmentPaired: true, lambdas: LAMBDAS, taus: TAUS, kappas: KAPPAS, tuneResamples: TUNE_RESAMPLES, headLambdaCriterion: 'out-of-fold within-class MSE', ruleParameterCriterion: 'lexicographic: fewest class-level introductions vs S0 + Nexus, then lowest mean nreg', candidatesBuilt: ROSTER.length },
      dataset, headQuality: auc, hiddenSensitivity: { hetThreshold: HET_THRESHOLD, sensitiveTypes: [...sensitive].map((t) => TYPE_NAMES[t]), types }, controls: [control], modelConsistency: { perCandidate: consistency, totalMismatches: consistency.reduce((a, c) => a + c.mismatches, 0) },
      compute: { decisions: ms.length, medianMs: q(ms, 0.5), p95Ms: q(ms, 0.95), maxMs: Math.max(...ms), budget: { medianMs: 100, maxMs: 1000 } },
      selectedCandidate: { id: selected.id, label: selected.label, rule: selected.rule, hyper: selected.hyper, spec: selected.spec, model: selected.model },
      sources: Object.fromEntries([...LANE_FILES.map((f) => [`hw4:${f}`, sha(readFileSync(resolve(LANE, f)))]), ...HW1_FILES.map((f) => [`hw1:${f}`, sha(readFileSync(resolve(GA, 'stage3h-hw1-dev-v1', f)))])]),
      candidates, notes: [
        'PAIRED design: both arms share worlds, comparators, folds, evaluator and training code; the only difference is the feature builder (8 band one-hots for V2).',
        'Training labels are offline native outcomes of EXPLORATION worlds; inference features are the arm public projection only. No validation outcome was loaded.',
        'Hyper-parameters chosen on out-of-fold exploration decisions with family-grouped folds; OOF numbers are the honest exploration estimate.',
        'Candidate selection is the prespecified lexicographic rule (fewest OOF intros vs S0, then vs Nexus, then lowest mean nreg), frozen in H_W4_DESIGN.md before training.'],
      selectedCandidateLexi: selected.id, elapsedSeconds: (Date.now() - t0) / 1000 };
    console.log(JSON.stringify({ arm, selected: selected.id, control: { introVsS0: control.introVsS0, introVsNexus: control.introVsNexus, meanNreg: control.meanNreg }, compute: out.compute, consistencyMismatches: out.modelConsistency.totalMismatches }, null, 1));
    if (write) writeExclusive(resolve(LANE, 'evidence', `HW4_EXPLORATION_${arm}.json`), out);
    results[arm] = out;
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'hw4-train.mjs')) main(process.argv.includes('--write'));
