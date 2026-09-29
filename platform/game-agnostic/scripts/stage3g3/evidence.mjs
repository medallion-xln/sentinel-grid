/* STAGE_3G_3 — per-row temporal, option-preservation and label-structure evidence (PRIVILEGED DIAGNOSTIC ONLY).
 *
 * For one stored corpus row, on top of the certified Stage 3G.1/3G.2 evidence (stage3gEvidence, unmodified):
 *   - replays, for every zero-cost candidate, the frozen oracle's own branch: the candidate, then the GREEDY_CONTINUATION_V1
 *     policy with canonical-frame tie-breaks of the ROOT world (FORGE_COUNTERFACTUAL_SYMMETRIC_V1 semantics), for four
 *     continuation steps, accumulating FORGE_REWARD_V2 vectors exactly as the oracle does;
 *   - truncated returns T1..T5 (T1 = immediate scalar = the Stage 3F one-step successor); T_{h+1} equals the stored label
 *     total for a row of label horizon h <= 4 (checked: ROLLOUT_FIDELITY);
 *   - option-preservation quantities at t+1 and t+2 and decision-relevant temporal quantities over the four steps;
 *   - the row's consequence depth (the diagnostic H0-H4 stratum) and the exact oracle representative.
 * Everything here reads simulator successor states: it is PRIVILEGED, never a runtime input, and it lives outside every
 * runtime-facing contract. Deterministic; writes nothing.
 */
import { cloneWorld, isTerminal } from '../../src/forge/kernel.js';
import { CONTINUATION_POLICIES } from '../../src/forge/counterfactual-v2.js';
import { addRewardV2Vectors, emptyRewardV2Vector, rewardV2For, scalarizeRewardV2 } from '../../src/forge/reward-v2.js';
import { symmetricLegalActions, symmetricStep } from '../../src/forge-symmetric/action-surface-symmetric-v1.js';
import { INVERSE_ORIENTATION, TRANSFORM_EQUIVALENT, canonicalActionKey, canonicalOrientation, orientAction, orientWorld } from '../../src/forge-symmetric/orientation-symmetric-v1.js';
import { forgeVisibleMap, pathDistances } from '../../src/stage3g/observable-entity-state-v1.js';
import { stableStringify } from '../../src/core/determinism.js';
import { policySurface } from '../generate-stage3f6p1e-policy-evidence.mjs';
import { TWIN_TRANSFORMS, rebuildWorld } from '../stage3f6p1asym-evidence.mjs';
import { stage3gEvidence, isEligible } from '../stage3g/evidence.mjs';

export { isEligible };
export const CONTINUATION_STEPS = 4;
export const OPTION_COLUMNS = Object.freeze(['legalT1', 'legalT2', 'safeT1', 'safeT2', 'retreatT1', 'retreatT2', 'irreversibleEntry', 'hazardLockIn']);
export const TEMPORAL_COLUMNS = Object.freeze(['failureWithin4', 'hazardSteps4', 'irreversibleLoss4', 'dObjectiveT2', 'dObjectiveT4', 'dResourceT2', 'dResourceT4', 'optionTypesT2']);
const K16 = (k) => k.slice(0, 16);
const policy = CONTINUATION_POLICIES.GREEDY_CONTINUATION_V1;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function transition(world, action) {
  const outcome = symmetricStep(world, action);
  const vector = rewardV2For({ before: world, after: outcome.state, v1Vector: outcome.rewardVector, events: outcome.events, terminal: outcome.terminal, outcome: outcome.outcome });
  return { state: outcome.state, vector, scalar: scalarizeRewardV2(vector), terminal: outcome.terminal, outcome: outcome.outcome };
}
const actorOf = (w) => w.entities.find((e) => e.type === 'ACTOR' && e.faction === 'sentinel');
const terrainName = (w, p) => { const code = w.grid.cells[p.y * w.grid.width + p.x]; return code === 2 ? 'ENVIRONMENTAL_HAZARD' : code === 1 ? 'WALL' : 'TRAVERSABLE'; };
const onHazard = (w) => terrainName(w, actorOf(w).position) === 'ENVIRONMENTAL_HAZARD';
const inService = (e) => e.available === true && e.health > 0;
/** A legal action is SAFE when its transition does not fail the episode, does not lower actor health and does not end on hazard terrain. */
const isSafe = (before, r) => r.outcome !== 'FAILURE' && actorOf(r.state) !== undefined && actorOf(r.state).health >= actorOf(before).health && !onHazard(r.state);
function nearest(world, predicate) {
  const map = forgeVisibleMap(world); const a = actorOf(world).position; const dist = pathDistances(map, a);
  const objectiveIds = new Set(world.objectives.map((o) => o.entityId));
  const d = world.entities.filter((e) => e.type !== 'ACTOR' && predicate(e, objectiveIds)).map((e) => dist[e.position.y * map.width + e.position.x]).filter((x) => x >= 0);
  return d.length ? Math.min(...d) : map.width * map.height;
}
const objectiveDistance = (w) => nearest(w, (e, ids) => ids.has(e.id));
const resourceDistance = (w) => nearest(w, (e) => e.type === 'RESOURCE' && inService(e));

/** The oracle branch of one candidate, replayed with four continuation steps. */
function rollout(root, action, frame) {
  const size = root.grid.width;
  const tieKey = (a) => canonicalActionKey(frame, a, size);
  const imm = transition(cloneWorld(root), action);
  let vector = imm.vector; let current = imm.state; let terminal = imm.terminal; let failed = imm.outcome === 'FAILURE';
  const T = [scalarizeRewardV2(vector)];
  const options = []; let hazardSteps = onHazard(current) ? 1 : 0; let optionTypesT2 = 0;
  const lostIds = new Set();
  const noteLoss = (w) => { for (const e of root.entities) { if (e.type === 'RESOURCE' || e.type === 'ACTOR' || !inService(e)) continue; const n = w.entities.find((x) => x.id === e.id); if (n && !inService(n)) lostIds.add(e.id); } };
  noteLoss(current);
  let objT2 = null; let resT2 = null;
  for (let depth = 1; depth <= CONTINUATION_STEPS; depth += 1) {
    if (depth === 2) { objT2 = objectiveDistance(current); resT2 = resourceDistance(current); }
    if (terminal || isTerminal(current)) { if (depth <= 2) options.push({ legal: 0, safe: 0, retreat: 0, moves: 0, lock: false }); T.push(scalarizeRewardV2(vector)); continue; }
    const legal = symmetricLegalActions(current, frame);
    let best = null; let safe = 0; let moves = 0; let hazardMoves = 0;
    for (const a of legal) {
      const r = transition(current, a);
      if (isSafe(current, r)) safe += 1;
      if (a.actionType === 'MOVE' || a.actionType === 'RETREAT') { moves += 1; if (onHazard(r.state)) hazardMoves += 1; }
      const rank = policy.rank({ scalar: r.scalar, vector: r.vector }); const key = tieKey(a);
      if (best === null || rank > best.rank || (rank === best.rank && key < best.key)) best = { r, rank, key };
    }
    if (depth <= 2) options.push({ legal: legal.length, safe, retreat: legal.some((a) => a.actionType === 'RETREAT') ? 1 : 0, moves, lock: onHazard(current) && moves > 0 && hazardMoves === moves });
    if (depth === 2) optionTypesT2 = new Set(legal.map((a) => a.actionType)).size;
    if (best === null) { T.push(scalarizeRewardV2(vector)); continue; }
    vector = addRewardV2Vectors(vector, best.r.vector); current = best.r.state; terminal = best.r.terminal; failed = failed || best.r.outcome === 'FAILURE';
    if (onHazard(current)) hazardSteps += 1;
    noteLoss(current);
    T.push(scalarizeRewardV2(vector));
  }
  while (options.length < 2) options.push({ legal: 0, safe: 0, retreat: 0, moves: 0, lock: false });
  if (objT2 === null) { objT2 = objectiveDistance(current); resT2 = resourceDistance(current); }
  const obj0 = objectiveDistance(root); const res0 = resourceDistance(root);
  const irreversible = failed || lostIds.size > 0 || options[0].moves === 0;
  return {
    T,
    option: [options[0].legal, options[1].legal, options[0].safe, options[1].safe, options[0].retreat, options[1].retreat, irreversible ? 1 : 0, options[0].lock ? 1 : 0],
    temporal: [failed ? 1 : 0, hazardSteps, lostIds.size, clamp(objT2 - obj0, -6, 6), clamp(objectiveDistance(current) - obj0, -6, 6),
      clamp(resT2 - res0, -6, 6), clamp(resourceDistance(current) - res0, -6, 6), optionTypesT2],
  };
}

/** Rollout blocks of every zero-cost candidate of a world, keyed by the frame-R0 candidate key (as in Stage 3G evidence). */
function rolloutBlocks(world, keys) {
  const frame = canonicalOrientation(world).orientation; const size = world.grid.width;
  const byKey = new Map(); for (const e of policySurface(world)) { const k = K16(e.actionId); if (!byKey.has(k)) byKey.set(k, e.action); }
  return { frame, blocks: new Map(keys.map((k) => [k, rollout(world, byKey.get(k), frame)])), canonKey: (k) => canonicalActionKey(frame, byKey.get(k), size) };
}

/** Consequence depth: the smallest number of continuation steps d (0..4) whose truncated return T_{d+1} selects only optimal candidates; >4 -> 5. */
export function consequenceDepth(candidates) {
  for (let d = 0; d <= CONTINUATION_STEPS; d += 1) {
    const v = candidates.map((c) => c.T[d]); const m = Math.max(...v);
    if (candidates.every((c, i) => v[i] !== m || c.o === 1)) return d;
  }
  return CONTINUATION_STEPS + 1;
}
export const horizonStratum = (d) => (d === 0 ? 'H0' : d === 1 ? 'H1' : d === 2 ? 'H2' : d <= 4 ? 'H3' : 'H4');

export function stage3g3Evidence(row, { integrity = row.equivariance !== null } = {}) {
  const base = stage3gEvidence(row, { integrity });
  const world = rebuildWorld(row); const size = world.grid.width;
  const keys = base.candidates.map((c) => c.key);
  const { blocks, canonKey } = rolloutBlocks(world, keys);
  const candidates = base.candidates.map((c) => ({ ...c, T: blocks.get(c.key).T, option: blocks.get(c.key).option, temporal: blocks.get(c.key).temporal, canonicalKey: canonKey(c.key) }));
  /* the oracle's own representative among the optimal zero-cost candidates: smallest identity in the canonical frame */
  const optimal = candidates.filter((c) => c.o === 1).sort((a, b) => (a.canonicalKey < b.canonicalKey ? -1 : 1));
  const representativeKey = optimal[0].key;
  const labelHorizon = row.horizon;
  const fidelity = labelHorizon <= CONTINUATION_STEPS ? { checked: candidates.length, equal: candidates.filter((c) => c.T[labelHorizon] === row.actions[c.key].s).length } : { checked: 0, equal: 0 };
  const oneStepFidelity = candidates.every((c) => c.T[0] === c.i) ? 1 : 0;
  const depth = consequenceDepth(candidates);
  let twinTemporal = null;
  if (integrity) {
    twinTemporal = {};
    for (const transform of TWIN_TRANSFORMS) {
      const o = TRANSFORM_EQUIVALENT[transform]; const twin = orientWorld(o, world);
      const map = new Map(); for (const e of policySurface(twin)) { const k = K16(canonicalActionKey('R0', orientAction(INVERSE_ORIENTATION[o], e.action, size), size)); if (!map.has(k)) map.set(k, e.action); }
      const frame = canonicalOrientation(twin).orientation;
      twinTemporal[transform] = candidates.every((c) => { const a = map.get(c.key); if (!a) return false; const r = rollout(twin, a, frame);
        return stableStringify({ T: r.T, option: r.option, temporal: r.temporal }) === stableStringify({ T: c.T, option: c.option, temporal: c.temporal }); }) ? 1 : 0;
    }
  }
  return { ...base, candidates, representativeKey, labelHorizon, consequenceDepth: depth, stratum: horizonStratum(depth), rolloutFidelity: fidelity, oneStepFidelity, twinTemporal };
}
