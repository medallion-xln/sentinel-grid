// SK1 development: fit the ONE prespecified Safety Kernel model on EXPLORATION, and its no-evidence ablation.
// Everything that is chosen from data is chosen here, on EXPLORATION out-of-fold predictions, by rules fixed in
// SK1_DESIGN_FREEZE.md before any fresh world existed. VALIDATION is never opened: the trainer refuses to run unless the
// VALIDATION outcome files are locked and no result exists.
//   Fixed (not tuned): estimator family and size (gbdt.mjs DEFAULTS with 10 bags), risk target catAny, regret target nreg,
//                      uncertainty multiplier z = 1, out-of-distribution penalty 0.05 per feature, 5 family-grouped folds.
//   Tuned, rule T1:    tierWidth in {0.1, 0.2, 0.3, 1.0} -> fewest out-of-fold forced-choice introductions (vs S0 + vs
//                      Nexus-else-S0); ties -> lower mean nreg; ties -> larger tierWidth.
//   Tuned, rule T2:    tau in TAUS -> the largest tau whose out-of-fold DECIDED classes show zero introductions with
//                      coverage >= 0.10; if none, the tau with the lowest introduction rate among decided classes with
//                      coverage >= 0.25 (ties -> larger tau).
//   node infra/train.mjs [--write]            EXPLORATION -> models/ and evidence/SK1_TRAINING_RECORD.json (exclusive create)
//   node infra/train.mjs --fixture [--write]  design fixture -> work/dev-model/ (pipeline test only)
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aggregate } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { makeForgeFeaturizer, FORGE_OBSERVATION_CONTRACT } from '../adapters/forge/features.mjs';
import { KERNEL_ID } from '../kernel/contract.mjs';
import { RANKING_CONTRACT } from '../kernel/ranking.mjs';
import { fitHead, binColumns, DEFAULTS } from './gbdt.mjs';
import { buildDataset, predictAll, decideFromPredictions, outcomeOf } from './dataset.mjs';
import { loadPopulation, loadManifest, outcomeFileModes, RESULT_FILE, summaryPath } from './population.mjs';
import { LANE, WORK, EVIDENCE, sha, fileSha, readJ, fail, writeExclusive, exists } from './common.mjs';

export const CFG = Object.freeze({ ...DEFAULTS, bags: 10 }), FOLDS = 5, Z = 1, OOD_PENALTY = 0.05, TIER_WIDTHS = [0.1, 0.2, 0.3, 1.0], TAUS = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0];
const FIXTURE = process.argv.includes('--fixture'), WRITE = process.argv.includes('--write'), t00 = Date.now();

let classes, populationRecord;
if (FIXTURE) { const dir = resolve(WORK, 'dev-fixture'); classes = readdirSync(dir).sort().flatMap((f) => readJ(resolve(dir, f)).classes); populationRecord = { name: 'DESIGN_FIXTURE_SPENT_HW4_EXPLORATION', classListDigest: sha(classes.map((c) => c.id).join('\n')) }; }
else {
  if (exists(RESULT_FILE)) fail('VALIDATION_ALREADY_RUN_TRAINING_REFUSED');
  const vm = loadManifest('VALIDATION'); if (!outcomeFileModes(vm).every((m) => m === 0)) fail('VALIDATION_OUTCOME_FILES_NOT_LOCKED_TRAINING_REFUSED');
  const pop = loadPopulation('EXPLORATION', 'DEVELOPMENT'); classes = pop.classes; populationRecord = { name: 'EXPLORATION', classListDigest: pop.manifest.classListDigest, summarySha256: fileSha(summaryPath('EXPLORATION')) };
}
const famOf = classes.map((c) => c.family), fams = [...new Set(famOf)].sort((a, b) => (sha(a) < sha(b) ? -1 : 1)), foldOf = new Map(fams.map((f, i) => [f, i % FOLDS]));
const nexusCodes = [...new Set(classes.flatMap((c) => c.evidence.experts.NEXUS.rationaleCodes))].sort(), nexusReasons = [...new Set(classes.map((c) => c.evidence.experts.NEXUS.reason ?? 'NONE'))].sort();
const fitHeads = (rows, yCat, yReg, fam, label) => { const B = binColumns(rows, CFG.maxBins); return { risk: fitHead(rows, yCat, fam, 'logistic', `${label}|risk`, CFG, B), regret: fitHead(rows, yReg, fam, 'squared', `${label}|regret`, CFG, B) }; };

function develop(arm, useEvidence) {
  const t0 = Date.now(), feat = makeForgeFeaturizer({ useEvidence, nexusCodes, nexusReasons }), ds = buildDataset(classes, feat), preds = classes.map((c) => Array(c.projection.menu.length));
  for (let f = 0; f < FOLDS; f++) { const tr = [], te = []; ds.rows.forEach((_, k) => (foldOf.get(ds.fam[k]) === f ? te : tr).push(k));
    const heads = fitHeads(tr.map((k) => ds.rows[k]), tr.map((k) => ds.yCat[k]), tr.map((k) => ds.yReg[k]), tr.map((k) => ds.fam[k]), `SK1|${arm}|fold${f}`);
    const p = predictAll({ rows: te.map((k) => ds.rows[k]), owner: te.map((k) => ds.owner[k]) }, heads, classes); for (const k of te) { const [ci, a] = ds.owner[k]; preds[ci][a] = p[ci][a]; } }
  const pairs = ds.rows.map((_, k) => { const [ci, a] = ds.owner[k]; return [preds[ci][a].risk.mean, ds.yCat[k]]; }), pos = pairs.filter((x) => x[1]).length; let rs = 0; [...pairs].sort((a, b) => a[0] - b[0]).forEach((x, i) => { if (x[1]) rs += i + 1; });
  const auc = (rs - (pos * (pos + 1)) / 2) / (pos * (pairs.length - pos));
  const calibration = { bins: Array.from({ length: 10 }, (_, b) => { const lo = b / 10, hi = b === 9 ? 1.0000001 : (b + 1) / 10, in_ = pairs.filter((x) => x[0] >= lo && x[0] < hi); return { lo, hi, n: in_.length, rate: in_.length ? in_.filter((x) => x[1]).length / in_.length : null }; }), source: 'EXPLORATION out-of-fold' };
  // rule T1
  const t1 = TIER_WIDTHS.map((tierWidth) => { const dec = classes.map((c, ci) => decideFromPredictions(ds.sem[ci], preds[ci], { z: Z, tierWidth, tau: 1 })), a = aggregate(classes.map((c, ci) => outcomeOf(c, dec[ci])), famOf);
    return { tierWidth, introVsS0: a.introVsS0, introVsNexus: a.introVsNexus, total: a.introVsS0 + a.introVsNexus, meanNreg: a.meanNreg, deltaVsS0: a.deltaVsS0.point, deltaVsNexus: a.deltaVsNexus.point, catClasses: a.catClasses, dec }; });
  const best = [...t1].sort((x, y) => x.total - y.total || x.meanNreg - y.meanNreg || y.tierWidth - x.tierWidth)[0];
  // rule T2 — on the forced-choice decisions of the chosen tierWidth: a class is decided at tau when its bound is <= tau
  const cls = classes.map((c, ci) => { const d = best.dec[ci], r = outcomeOf(c, d); return { u: d.riskUpperBound, fail: Number(Boolean(r.introB || r.introN)) }; });
  const t2 = TAUS.map((tau) => { const decided = cls.filter((x) => x.u <= tau), failing = decided.reduce((s, x) => s + x.fail, 0); return { tau, decided: decided.length, coverage: decided.length / cls.length, failingClasses: failing, rate: decided.length ? failing / decided.length : null }; });
  const zero = t2.filter((x) => x.failingClasses === 0 && x.coverage >= 0.10), fallback = t2.filter((x) => x.coverage >= 0.25).sort((x, y) => x.rate - y.rate || y.tau - x.tau);
  const tauPick = zero.length ? { ...zero[zero.length - 1], branch: 'ZERO_OUT_OF_FOLD_INTRODUCTIONS_AT_COVERAGE>=0.10' } : { ...fallback[0], branch: 'LOWEST_OUT_OF_FOLD_RATE_AT_COVERAGE>=0.25' };
  // final fit on all EXPLORATION rows
  const heads = fitHeads(ds.rows, ds.yCat, ds.yReg, ds.fam, `SK1|${arm}|final`), d = feat.schema.names.length, min = Array(d).fill(Infinity), max = Array(d).fill(-Infinity);
  for (const row of ds.rows) for (let j = 0; j < d; j++) { if (row[j] < min[j]) min[j] = row[j]; if (row[j] > max[j]) max[j] = row[j]; }
  const model = { modelId: `SK1_FORGE_${arm}_V1`, kernelId: KERNEL_ID, observationContract: FORGE_OBSERVATION_CONTRACT, evidenceContract: feat.evidenceContract, featurizer: feat.config, schema: { id: feat.schema.id, names: [...feat.schema.names] },
    estimator: { id: 'SK1_BAGGED_BOOSTED_TREES_V1', riskTarget: 'catastrophic (regret >= 100) in at least one member world of the public-equivalence class', regretTarget: 'member-mean normalised regret', config: CFG },
    uncertainty: { method: 'FAMILY_BOOTSTRAP_BAG_SPREAD_V1', statement: 'upper bound = mean + z x standard deviation across bags, each bag fit on a bootstrap of origin families, plus a fixed penalty per numeric feature outside the development envelope', z: Z, oodPenalty: OOD_PENALTY },
    envelope: { min, max }, novelty: { columns: feat.categoricalColumns, seen: feat.categoricalColumns.map((c) => Number(ds.rows.some((r) => r[c] !== 0))) }, heads,
    ranking: { contract: RANKING_CONTRACT, z: Z, tierWidth: best.tierWidth, tau: tauPick.tau, oodPenalty: OOD_PENALTY, requireEvidence: useEvidence }, calibration,
    qualification: { status: 'NOT_QUALIFIED', statement: 'Development model under R0. It is not qualified for control or dispatch. Its measured DEV performance is in the SK1 result record; no finite DEV result proves universal safety.' },
    training: { population: populationRecord.name, classListDigest: populationRecord.classListDigest, classes: classes.length, rows: ds.rows.length, families: fams.length, folds: FOLDS, catAnyBaseRate: pos / pairs.length } };
  model.modelHash = sha(JSON.stringify(model));
  const record = { arm, useEvidence, features: d, rows: ds.rows.length, outOfFold: { riskAuc: auc, calibration: calibration.bins, ruleT1: t1.map(({ dec, ...r }) => r), chosenTierWidth: best.tierWidth, ruleT2: t2, chosenTau: tauPick },
    model: { modelId: model.modelId, modelHash: model.modelHash, schemaId: model.schema.id, ranking: model.ranking, treesPerHead: CFG.bags * CFG.trees, novelCategoriesUnseen: model.novelty.seen.filter((s) => s === 0).length }, seconds: (Date.now() - t0) / 1000 };
  return { model, record };
}
const primary = develop('PRIMARY', true), ablation = develop('NO_EVIDENCE', false);
const out = { schema: 'SK1_TRAINING_RECORD_V1', authority: 'R0', stage: 'STAGE3H-SK1', trainedAt: new Date().toISOString(), node: process.version, population: populationRecord, validationOpened: false, fixtureMode: FIXTURE,
  vocabularies: { nexusCodes, nexusReasons }, fixed: { estimator: CFG, z: Z, oodPenalty: OOD_PENALTY, folds: FOLDS, tierWidthGrid: TIER_WIDTHS, tauGrid: TAUS },
  arms: [primary.record, ablation.record], sources: Object.fromEntries(['infra/train.mjs', 'infra/gbdt.mjs', 'infra/dataset.mjs', 'adapters/forge/features.mjs', 'adapters/forge/evidence.mjs', 'adapters/forge/projection.mjs', 'kernel/risk.mjs', 'kernel/ranking.mjs', 'kernel/semantics.mjs'].map((f) => [f, fileSha(resolve(LANE, f))])), elapsedSeconds: (Date.now() - t00) / 1000 };
console.log(JSON.stringify({ population: populationRecord.name, classes: classes.length, families: fams.length, arms: out.arms.map((a) => ({ arm: a.arm, features: a.features, auc: +a.outOfFold.riskAuc.toFixed(4), t1: a.outOfFold.ruleT1.map((r) => `${r.tierWidth}:${r.introVsS0}+${r.introVsNexus}`).join(' '), tierWidth: a.outOfFold.chosenTierWidth, tau: a.outOfFold.chosenTau, modelHash: a.model.modelHash.slice(0, 16), seconds: a.seconds })) }, null, 1));
if (WRITE) {
  if (FIXTURE) { mkdirSync(resolve(WORK, 'dev-model'), { recursive: true }); writeFileSync(resolve(WORK, 'dev-model/SK1_MODEL.json'), JSON.stringify(primary.model)); writeFileSync(resolve(WORK, 'dev-model/SK1_MODEL_NO_EVIDENCE.json'), JSON.stringify(ablation.model)); writeFileSync(resolve(WORK, 'dev-model/TRAINING_RECORD.json'), JSON.stringify(out, null, 1)); console.log('wrote work/dev-model/ (fixture, not a frozen model)'); }
  else { writeExclusive(resolve(LANE, 'models/SK1_MODEL.json'), JSON.stringify(primary.model) + '\n'); writeExclusive(resolve(LANE, 'models/SK1_MODEL_NO_EVIDENCE.json'), JSON.stringify(ablation.model) + '\n');
    out.modelFiles = { 'models/SK1_MODEL.json': fileSha(resolve(LANE, 'models/SK1_MODEL.json')), 'models/SK1_MODEL_NO_EVIDENCE.json': fileSha(resolve(LANE, 'models/SK1_MODEL_NO_EVIDENCE.json')) }; writeExclusive(resolve(EVIDENCE, 'SK1_TRAINING_RECORD.json'), out); console.log('frozen models/SK1_MODEL.json, models/SK1_MODEL_NO_EVIDENCE.json, evidence/SK1_TRAINING_RECORD.json'); }
}
