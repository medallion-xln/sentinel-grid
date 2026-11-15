// H-W1 I-1 audit: stability of the frozen comparators' outputs when expressed through the public action key. For each transformed view the frozen
// lock (devLock: S0 scores/top set, Nexus abstention/pick/rationale codes, the B/N selection sets) is recomputed and compared with the base lock
// after mapping action i -> map[i]. A quantity may enter a policy only if it is stable at the level of keyV2 (the identity-free action key).
import { devLock } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { keyV2 } from './public-projection.mjs';

const sorted = (xs) => [...xs].sort((a, b) => a - b), eqSet = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
/** Frozen comparator outputs of one view, as menu indices of that view's surface. */
export function comparatorSummary(view, band) {
  const lock = devLock(view, band), at = new Map(view.surface.map((e, i) => [e.actionId, i])), ix = (ids) => ids.map((id) => at.get(id));
  return { S0: ix(lock.s0.selected), B: ix(lock.selections.B), N: ix(lock.selections.N), scores: [...lock.s0.scores], abstain: lock.nexus.abstain,
    codes: lock.nexus.codes, reason: lock.nexus.reason, pick: lock.nexus.action == null ? null : at.get(lock.nexus.action) };
}

/**
 * Compare comparator outputs on a twin. base/twin = summaries; Pb = projection of the base seen in the twin's frame (or the base projection),
 * Pt = projection of the twin; map[i] = image of base action i. Each field is true when stable.
 */
export function compareComparators(base, twin, Pb, Pt, map) {
  const img = (xs) => xs.map((i) => map[i]);
  let maxScoreDiff = 0; base.scores.forEach((s, i) => { maxScoreDiff = Math.max(maxScoreDiff, Math.abs(s - twin.scores[map[i]])); });
  const pickExact = base.pick === null ? twin.pick === null : twin.pick === map[base.pick];
  const pickKey = base.pick === null || twin.pick === null ? base.pick === twin.pick : keyV2(Pb, base.pick) === keyV2(Pt, twin.pick);
  return {
    s0TopSet: eqSet(img(base.S0), twin.S0), s0ScoresExact: maxScoreDiff === 0, s0MaxScoreDiff: maxScoreDiff,
    selB: eqSet(img(base.B), twin.B), selN: eqSet(img(base.N), twin.N),
    nexusAbstain: base.abstain === twin.abstain, nexusCodes: JSON.stringify(base.codes) === JSON.stringify(twin.codes), nexusReason: base.reason === twin.reason,
    nexusPickExact: pickExact, nexusPickKeyV2: pickKey,
  };
}
