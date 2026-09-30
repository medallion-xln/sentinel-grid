/* STAGE_3G_4 — per-row evidence: the certified Stage 3G.3 evidence (unchanged) plus
 *   search   PRIVILEGED known-model bounded search: for each zero-cost candidate, its immediate FORGE_REWARD_V2 scalar plus
 *            the maximum cumulative scalar over every sequence of d further legal actions of the symmetric surface
 *            (exhaustive, d = 0..2 on every row, d = 3 on the declared subsample). No tie-break is needed: a maximum over
 *            all sequences is frame-free, so the values are D4-invariant by construction (checked on twins).
 *   obsOption  SENTINEL_OBSERVABLE_OPTION_FEATURES_V1 (E1, deployable) for every candidate, from the observable view only.
 * Reward components and weights are integers, so per-step scalar sums are exact. Deterministic; writes nothing.
 */
import { stableStringify } from '../../src/core/determinism.js';
import { isTerminal } from '../../src/forge/kernel.js';
import { rewardV2For, scalarizeRewardV2 } from '../../src/forge/reward-v2.js';
import { symmetricLegalActions, symmetricStep } from '../../src/forge-symmetric/action-surface-symmetric-v1.js';
import { INVERSE_ORIENTATION, TRANSFORM_EQUIVALENT, canonicalActionKey, canonicalOrientation, orientAction, orientWorld } from '../../src/forge-symmetric/orientation-symmetric-v1.js';
import { observableOptionFeatures } from '../../src/stage3g/observable-option-features-v1.js';
import { policySurface } from '../generate-stage3f6p1e-policy-evidence.mjs';
import { TWIN_TRANSFORMS, rebuildWorld } from '../stage3f6p1asym-evidence.mjs';
import { observableView } from '../stage3g/evidence.mjs';
import { stage3g3Evidence, isEligible } from '../stage3g3/evidence.mjs';

export { isEligible };
export const SEARCH_DEPTHS_ALL = 2;
export const SEARCH_DEPTH_SUBSAMPLE = 3;
const K16 = (k) => k.slice(0, 16);

function transition(world, action) {
  const o = symmetricStep(world, action);
  const vector = rewardV2For({ before: world, after: o.state, v1Vector: o.rewardVector, events: o.events, terminal: o.terminal, outcome: o.outcome });
  return { state: o.state, scalar: scalarizeRewardV2(vector), terminal: o.terminal };
}
/** best[k] = max cumulative scalar over k further actions (k = 0..D); a terminal state or an empty surface ends the sum. */
function bestUpTo(state, frame, D) {
  const best = new Array(D + 1).fill(0);
  if (D === 0 || isTerminal(state)) return best;
  const legal = symmetricLegalActions(state, frame);
  if (legal.length === 0) return best;
  for (let k = 1; k <= D; k += 1) best[k] = -Infinity;
  for (const a of legal) {
    const r = transition(state, a);
    const sub = r.terminal ? new Array(D).fill(0) : bestUpTo(r.state, frame, D - 1);
    for (let k = 1; k <= D; k += 1) { const v = r.scalar + sub[k - 1]; if (v > best[k]) best[k] = v; }
  }
  return best;
}
/** search[d] for d = 0..D: candidate immediate + best d-step continuation. */
export function searchValues(world, action, D, frame = canonicalOrientation(world).orientation) {
  const imm = transition(world, action);
  const cont = imm.terminal ? new Array(D + 1).fill(0) : bestUpTo(imm.state, frame, D);
  return cont.map((v) => imm.scalar + v);
}
function surfaceByKey(world, mapKey) { const m = new Map(); for (const e of policySurface(world)) { const k = mapKey(e.action); if (!m.has(k)) m.set(k, e.action); } return m; }
function obsByKey(world, mapKey) {
  const v = observableView(world); const f = observableOptionFeatures({ state: v.state, visibleMap: v.visibleMap, semantics: v.semantics });
  const m = new Map(); v.surface.forEach((e, i) => { const k = mapKey(e.action); if (!m.has(k)) m.set(k, f[i]); }); return m;
}

export function stage3g4Evidence(row, { integrity = row.equivariance !== null, depth3 = false } = {}) {
  const base = stage3g3Evidence(row, { integrity });
  const world = rebuildWorld(row); const size = world.grid.width; const frame = canonicalOrientation(world).orientation;
  const D = depth3 ? SEARCH_DEPTH_SUBSAMPLE : SEARCH_DEPTHS_ALL;
  const r0 = (a) => K16(canonicalActionKey('R0', a, size));
  const actions = surfaceByKey(world, r0); const obs = obsByKey(world, r0);
  const candidates = base.candidates.map((c) => ({ ...c, search: searchValues(world, actions.get(c.key), D, frame), obsOption: obs.get(c.key) }));
  const searchFidelity = candidates.every((c) => c.search[0] === c.i) ? 1 : 0;
  let twinSearch = null; let twinObsOption = null;
  if (integrity) {
    twinSearch = {}; twinObsOption = {};
    for (const transform of TWIN_TRANSFORMS) {
      const o = TRANSFORM_EQUIVALENT[transform]; const twin = orientWorld(o, world); const tf = canonicalOrientation(twin).orientation;
      const back = (a) => K16(canonicalActionKey('R0', orientAction(INVERSE_ORIENTATION[o], a, size), size));
      const tActions = surfaceByKey(twin, back); const tObs = obsByKey(twin, back);
      twinSearch[transform] = candidates.every((c) => tActions.has(c.key) && stableStringify(searchValues(twin, tActions.get(c.key), SEARCH_DEPTHS_ALL, tf)) === stableStringify(c.search.slice(0, SEARCH_DEPTHS_ALL + 1))) ? 1 : 0;
      twinObsOption[transform] = candidates.every((c) => tObs.has(c.key) && stableStringify(tObs.get(c.key)) === stableStringify(c.obsOption)) ? 1 : 0;
    }
  }
  return { ...base, candidates, depth3, searchFidelity, twinSearch, twinObsOption, level: row.combination.level, band: row.combination.horizonBand };
}
