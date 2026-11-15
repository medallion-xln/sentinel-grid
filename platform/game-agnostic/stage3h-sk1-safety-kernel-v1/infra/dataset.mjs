// SK1 development dataset and offline evaluation helpers (evaluation side). Labels are OFFLINE evaluator outcomes of
// EXPLORATION worlds; they are attached to rows here and never enter a request, a feature or the kernel.
//   catAny  1 if the action is catastrophic (regret >= 100 against the member's best action) in AT LEAST ONE member world
//           of the public-equivalence class — the robust event the risk head estimates
//   nreg    equal-weight member mean of regret / menu utility spread — the quantity the regret head estimates
import { evalClass, CATASTROPHE } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { forgeRequest } from '../adapters/forge/features.mjs';
import { headPredict } from '../kernel/risk.mjs';
import { rankActions } from '../kernel/ranking.mjs';
import { assessSemantics } from '../kernel/semantics.mjs';

export function labelsOf(cls) {
  const n = cls.projection.menu.length, catAny = Array(n).fill(0), nreg = Array(n).fill(0), catRate = Array(n).fill(0);
  for (const m of cls.members) { const max = Math.max(...m.truth), spread = max - Math.min(...m.truth);
    for (let a = 0; a < n; a++) { const reg = max - m.truth[a]; if (reg >= CATASTROPHE) { catAny[a] = 1; catRate[a] += 1 / cls.members.length; } nreg[a] += (spread ? reg / spread : 0) / cls.members.length; } }
  return { catAny, nreg, catRate };
}
/** classes -> flat row table. feat: a Forge featurizer. */
export function buildDataset(classes, feat) {
  const rows = [], yCat = [], yReg = [], fam = [], owner = [], sem = [];
  classes.forEach((c, ci) => { const r = forgeRequest(c.projection, c.evidence ?? null), F = feat(r.state, r.legalActions, r.advisoryEvidence), L = labelsOf(c);
    if (F.rows.some((row) => row.some((x) => x === null))) throw Error('DATASET_ROW_HAS_MISSING_FEATURE:' + c.id);
    sem.push(assessSemantics(F, r.legalActions.length));
    F.rows.forEach((row, a) => { rows.push(row); yCat.push(L.catAny[a]); yReg.push(L.nreg[a]); fam.push(c.family); owner.push([ci, a]); }); });
  return { rows, yCat, yReg, fam, owner, sem };
}
/** Per-action head predictions for every class: preds[ci][a] = { risk: {mean, sd}, regret: {mean, sd} }. */
export function predictAll(ds, heads, classes) {
  const out = classes.map((c) => Array(c.projection.menu.length)); ds.rows.forEach((row, k) => { const [ci, a] = ds.owner[k]; out[ci][a] = { risk: headPredict(heads.risk, row), regret: headPredict(heads.regret, row) }; }); return out;
}
/** Run the frozen ranking contract on stored predictions (used for out-of-fold tuning; identical arithmetic to the kernel). */
export function decideFromPredictions(sem, preds, cfg) {
  const risks = preds.map((p, i) => ({ index: i, supported: true, upper: Math.min(1, Math.max(0, p.risk.mean + cfg.z * p.risk.sd)), regret: { estimate: p.regret.mean } }));
  return rankActions(sem, risks, cfg).decision;
}
/** Offline class outcome of a decision set under the frozen evaluator. forced = evaluate the forced choice when the kernel abstains. */
export function outcomeOf(cls, decision, forced = false) {
  const set = decision.kind === 'RECOMMEND' ? decision.decisionSet : forced ? decision.forcedChoiceSet ?? [] : [];
  return set.length ? evalClass(cls, set) : { abstained: true };
}
