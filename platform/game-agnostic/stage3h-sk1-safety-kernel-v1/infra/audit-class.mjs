// SK1 per-class identity and public-only audit of the Safety Kernel (evaluation side; no evaluator truth is read).
// Twin program (frozen H-W1 transforms): 6 relabellings, 6 menu orders, 7 lawful D4 world transforms and public-content-
// equivalent hidden twins. On EVERY transformed view the expert evidence is RE-COMPUTED from that view and the kernel is
// re-run, so any instability of an expert projection is counted against the kernel. Also: repeat determinism,
// poisoned view (excluded fields deleted), read trace of the projection against the allowlist, feature invariance under
// the eight D4 frames, legality of every decision, and three negative-control deciders that the audit MUST catch.
import { cloneWorld } from '../../src/forge/kernel.js';
import { observableView } from '../../scripts/stage3g/evidence.mjs';
import { nativeWorld } from '../../stage3h-safety-feasibility-v1/twins.mjs';
import { publicContent } from '../../stage3h-safety-feasibility-v1/contract.mjs';
import { D4_NON_IDENTITY, d4Twin, relabelTwin, menuTwin, menuOrders, RELABEL_KINDS } from '../../stage3h-hw1-dev-v1/transforms.mjs';
import { CONTROLS, poisonedView } from '../../stage3h-hw1-dev-v1/i3-audit-class.mjs';
import { projectPublic, frameProjection, traceReads, unallowedReads, D4_FRAMES } from '../adapters/forge/projection.mjs';
import { forgeRequest } from '../adapters/forge/features.mjs';
import { evidenceForView } from './evidence-source.mjs';

export const TESTS = ['RELABEL', 'MENU', 'D4', 'HIDDEN'];
const J = JSON.stringify, sorted = (a) => J([...a].sort((x, y) => x - y)), id = (n) => [...Array(n).keys()];

function hiddenTwins(base, cap = 3) {
  const out = []; let nonEquivalent = 0;
  for (const e of base.world.entities) { if (out.length >= cap) break; if (e.type === 'ACTOR' || e.type === 'CIVILIAN' || !(e.health > 0)) continue;
    for (const d of [-20, 20, -10, 10, -5, 5]) { const h = e.health + d; if (h < 1 || h > 100) continue; const w = cloneWorld(base.world); w.entities.find((x) => x.id === e.id).health = h; const view = observableView(w);
      if (publicContent(view) !== base.content) { nonEquivalent++; continue; } out.push({ world: w, view }); break; } }
  return { twins: out, nonEquivalent };
}
function makeTwins(base, label) {
  const v = base.view, n = v.surface.length, twins = [];
  for (const kind of RELABEL_KINDS) twins.push({ test: 'RELABEL', kind, view: relabelTwin(v, kind, label).view, world: base.world, map: id(n) });
  for (const o of menuOrders(n, label)) twins.push({ test: 'MENU', kind: o.kind, view: menuTwin(v, o.order).view, world: base.world, map: id(n).map((i) => o.order.indexOf(i)) });
  let d4Unlawful = 0;
  for (const t of D4_NON_IDENTITY) { const w = d4Twin(base.world, t); if (!w.lawful) { d4Unlawful++; continue; } twins.push({ test: 'D4', kind: t, view: w.view, world: w.world, map: v.surface.map((e) => w.view.surface.findIndex((x) => x.actionId === w.actionMap[e.actionId])) }); }
  const hid = hiddenTwins(base); for (const h of hid.twins) twins.push({ test: 'HIDDEN', kind: 'HEALTH', view: h.view, world: h.world, map: id(n) });
  return { twins, d4Unlawful, hiddenNonEquivalent: hid.nonEquivalent };
}
const bump = (o, k, f) => { const e = (o[k] ??= { n: 0, bad: 0 }); e.n++; if (f) e.bad++; };

/** Kernel decision on a public view: evidence recomputed from the view, projection by the lane-local projector. */
export function decideView(kernel, view, band, evidenceView = view) {
  const t0 = performance.now(), ev = evidenceForView(evidenceView, band).evidence, t1 = performance.now(), r = forgeRequest(projectPublic(view), ev), rec = kernel.recommend(r.state, r.legalActions, r.advisoryEvidence), t2 = performance.now();
  const d = rec.recommendedActionOrAbstention, set = (d.kind === 'RECOMMEND' ? d.decisionSet : d.bestEffortNotRecommended?.decisionSet ?? []).map((a) => a.index);
  return { kind: d.kind, set, n: r.legalActions.length, hash: rec.decisionHash, ranked: rec.rankedActions.length, evidenceStatus: rec.evidence.status, kernelMs: t2 - t1, evidenceMs: t1 - t0, featurized: null };
}
const illegal = (d) => d.ranked !== d.n || d.set.some((i) => !Number.isInteger(i) || i < 0 || i >= d.n) || new Set(d.set).size !== d.set.length || (d.kind === 'RECOMMEND' && d.set.length === 0);

/** cls: a manifest entry (alias id, world hash); combo: its schedule entry; kernel: the frozen kernel; feat: its featurizer. */
export function auditClass(cls, combo, kernel, feat) {
  const base = nativeWorld(combo); if (base.rejected || base.worldHash !== cls.worldHash) throw Error('BASE_REGENERATION_MISMATCH:' + cls.id);
  const v = base.view, n = v.surface.length, { twins, d4Unlawful, hiddenNonEquivalent } = makeTwins(base, cls.id);
  const rec = { id: cls.id, menu: n, twins: twins.length, d4Unlawful, hiddenNonEquivalent, byTest: {}, kind: {}, legality: { decisions: 0, illegal: 0 }, repeatMismatch: 0, poisonMismatch: 0, unallowed: [], reads: 0, kernelMs: [], evidenceMs: [], controls: {}, features: { frames: 0, bad: 0 }, evidenceNotValid: 0 };
  const d0 = decideView(kernel, v, base.band); rec.kernelMs.push(d0.kernelMs); rec.evidenceMs.push(d0.evidenceMs); rec.legality.decisions++; if (illegal(d0)) rec.legality.illegal++; if (d0.evidenceStatus !== 'VALID') rec.evidenceNotValid++;
  if (decideView(kernel, v, base.band).hash !== d0.hash) rec.repeatMismatch++;
  const tr = traceReads(v); projectPublic(tr.view); rec.reads = tr.reads.size; for (const p of unallowedReads(tr.reads)) if (!rec.unallowed.includes(p)) rec.unallowed.push(p);
  const dp = decideView(kernel, poisonedView(v), base.band, v); if (dp.hash !== d0.hash) rec.poisonMismatch++;
  // feature invariance under the eight D4 frames (evidence is aligned with the menu, which a frame change does not reorder)
  const ev0 = evidenceForView(v, base.band).evidence, P0 = projectPublic(v), rows = (P) => { const r = forgeRequest(P, ev0); return J(feat(r.state, r.legalActions, r.advisoryEvidence).rows); }, rows0 = rows(P0);
  for (const t of D4_FRAMES) { rec.features.frames++; if (rows(frameProjection(P0, t)) !== rows0) rec.features.bad++; }
  for (const t of twins) { const d = decideView(kernel, t.view, base.band); rec.legality.decisions++; if (illegal(d)) rec.legality.illegal++; if (d.evidenceStatus !== 'VALID') rec.evidenceNotValid++;
    bump(rec.byTest, t.test, sorted(d0.set.map((i) => t.map[i])) !== sorted(d.set)); bump(rec.kind, t.test, d.kind !== d0.kind); }
  for (const [name, c] of Object.entries(CONTROLS)) { const b = c.decide(v, base.world); for (const t of twins) bump((rec.controls[name] ??= {}), t.test, t.map[b] !== c.decide(t.view, t.world)); }
  return rec;
}
export { CONTROLS };
