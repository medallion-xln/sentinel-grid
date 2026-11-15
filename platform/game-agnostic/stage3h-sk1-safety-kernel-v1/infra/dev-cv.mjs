// SK1 development cross-validation on the DESIGN FIXTURE (spent H-W4 training classes, exploration-side families only).
// Purpose: check that the estimator trains, time it, and exercise the tuning code path. Not a gating statistic.
//   /opt/homebrew/bin/node infra/dev-cv.mjs [bags trees depth]
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { aggregate } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { makeForgeFeaturizer } from '../adapters/forge/features.mjs';
import { fitHead, binColumns, DEFAULTS } from './gbdt.mjs';
import { buildDataset, predictAll, decideFromPredictions, outcomeOf } from './dataset.mjs';
import { WORK, readJ, sha } from './common.mjs';

const [bags, trees, depth] = process.argv.slice(2).map(Number), cfg = { ...DEFAULTS, ...(bags ? { bags } : {}), ...(trees ? { trees } : {}), ...(depth ? { depth } : {}) };
const dir = resolve(WORK, 'dev-fixture'), classes = readdirSync(dir).sort().flatMap((f) => readJ(resolve(dir, f)).classes);
const codes = [...new Set(classes.flatMap((c) => c.evidence.experts.NEXUS.rationaleCodes))].sort(), reasons = [...new Set(classes.map((c) => c.evidence.experts.NEXUS.reason ?? 'NONE'))].sort();
console.log(JSON.stringify({ classes: classes.length, families: new Set(classes.map((c) => c.family)).size, nexusCodes: codes, nexusReasons: reasons, cfg }));
const fams = [...new Set(classes.map((c) => c.family))].sort((a, b) => (sha(a) < sha(b) ? -1 : 1)), foldOf = new Map(fams.map((f, i) => [f, i % 5]));
for (const useEvidence of [true, false]) {
  const feat = makeForgeFeaturizer({ useEvidence, nexusCodes: codes, nexusReasons: reasons }), t0 = Date.now(), ds = buildDataset(classes, feat), preds = classes.map((c) => Array(c.projection.menu.length));
  for (let f = 0; f < 5; f++) {
    const tr = [], te = []; ds.rows.forEach((_, k) => (foldOf.get(ds.fam[k]) === f ? te : tr).push(k));
    const X = tr.map((k) => ds.rows[k]), fm = tr.map((k) => ds.fam[k]), B = binColumns(X, cfg.maxBins);
    const heads = { risk: fitHead(X, tr.map((k) => ds.yCat[k]), fm, 'logistic', `dev|risk|${f}`, cfg, B), regret: fitHead(X, tr.map((k) => ds.yReg[k]), fm, 'squared', `dev|regret|${f}`, cfg, B) };
    const sub = { rows: te.map((k) => ds.rows[k]), owner: te.map((k) => ds.owner[k]) }, p = predictAll(sub, heads, classes); for (const k of te) { const [ci, a] = ds.owner[k]; preds[ci][a] = p[ci][a]; }
  }
  // discrimination of the risk head, out of fold
  const pairs = ds.rows.map((_, k) => { const [ci, a] = ds.owner[k]; return [preds[ci][a].risk.mean, ds.yCat[k]]; }), pos = pairs.filter((x) => x[1]).length, sorted = [...pairs].sort((a, b) => a[0] - b[0]); let rankSum = 0; sorted.forEach((x, i) => { if (x[1]) rankSum += i + 1; });
  const auc = (rankSum - (pos * (pos + 1)) / 2) / (pos * (pairs.length - pos));
  const famOf = classes.map((c) => c.family), grid = [];
  for (const z of [0, 1, 2]) for (const tierWidth of [0.01, 0.05, 0.1, 0.2, 1]) { const res = classes.map((c, ci) => outcomeOf(c, decideFromPredictions(ds.sem[ci], preds[ci], { z, tierWidth, tau: 1 }))), a = aggregate(res, famOf);
    grid.push({ z, tierWidth, introS0: a.introVsS0, introNexus: a.introVsNexus, meanNreg: +a.meanNreg.toFixed(4), dS0: +a.deltaVsS0.point.toFixed(4), dNex: +a.deltaVsNexus.point.toFixed(4), cat: a.catClasses, multiActionSets: res.length }); }
  console.log(JSON.stringify({ useEvidence, features: feat.schema.names.length, rows: ds.rows.length, catAnyRate: +(pos / pairs.length).toFixed(3), oofAuc: +auc.toFixed(4), seconds: (Date.now() - t0) / 1000 }));
  for (const g of grid) console.log('  ', JSON.stringify(g));
}
const ref = (key) => classes.filter((c) => { const r = outcomeOf(c, { kind: 'RECOMMEND', decisionSet: c[key] }); return key === 'B' ? r.introN : r.introB; }).length;
console.log(JSON.stringify({ reference: { s0IntroducesVsNexus: ref('B'), nexusIntroducesVsS0: ref('N'), classes: classes.length } }));
