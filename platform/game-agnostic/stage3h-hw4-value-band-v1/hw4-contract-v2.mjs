// H-W4 Phase 2: STAGE3H_PUBLIC_DECISION_INFORMATION_V2_VALUE_DEV — DEV-only experimental observation contract.
// Extends the V1 public projection with EXACTLY ONE additional information element: the frozen three-level coarse
// node-value band from H-W3-P2R (V0 = value <= lo, V1 = lo < value < hi, V2 = value >= hi with lo = 2, hi = valueSpread+3;
// objective-attached nodes carry the spike marker 'P'). Health-band disclosure is EXCLUDED (measured zero refinement).
// The adapter may read native node `value` at the current decision time solely to compute this ordinal. The policy never
// receives: exact node value, hidden health, seeds, evaluator regret, catastrophe labels, future outcomes, privileged
// rollouts, hashes/world ids, or action handles. Thresholds are outcome-independent (source-range constants from P2R;
// no retuning). This contract is Forge-World-specific: the bands read the Forge structural-node `value` field and are not
// asserted portable to another native world without an independent adapter. The production V1 contract is untouched.
export const V2_CONTRACT_ID = 'STAGE3H_PUBLIC_DECISION_INFORMATION_V2_VALUE_DEV';
export const V2_BAND_SCHEMA = 'V0(<=2)/V1(3..spread+2)/V2(>=spread+3); objective-attached nodes: P';
export const VALUE_BAND_THRESHOLDS = Object.freeze({ lo: 2, primary: 'P' }); // hi = valueSpread + 3, read per class
export const BAND_SOURCE = 'H-W3-P2R frozen value-band schema (p2r-scratch measurement); thresholds outcome-independent';

const STRUCTURAL = new Set(['POWER_SOURCE', 'DEPOT', 'REPAIR_TARGET', 'INFRASTRUCTURE']);

/** Frozen band function for one class: value -> 0 | 1 | 2; objective-attached entities are marked 'P' by the caller. */
export function valueBandFn(valueSpread) {
  const lo = VALUE_BAND_THRESHOLDS.lo, hi = valueSpread + 3;
  return (v) => (v < lo ? 0 : v >= hi ? 2 : 1);
}

/**
 * Attach the DEV-only value band to a V1 projection. `world` is the native world at the current decision tick;
 * `valueSpread` comes from the class config. Nodes are joined by actor-relative position (unique per grid cell);
 * any structural native entity without exactly one public counterpart fails closed. Returns a NEW projection whose
 * nodes carry `.band` (0 | 1 | 2 | 'P'); the V1 projection object is not mutated.
 */
export function withValueBands(P, world, valueSpread) {
  const ents = world.entities, actor = ents.find((e) => e.type === 'ACTOR');
  if (!actor) throw Error('V2_NATIVE_ACTOR_MISSING');
  const ax = actor.position.x, ay = actor.position.y, vBand = valueBandFn(valueSpread);
  const objectives = new Set(world.objectives.map((o) => o.entityId));
  const nat = ents.filter((e) => STRUCTURAL.has(e.type)).map((e) => {
    const dx = e.position.x - ax, dy = e.position.y - ay;
    return { dx, dy, band: objectives.has(e.id) ? 'P' : vBand(e.value) };
  });
  const used = new Set();
  const byRel = new Map(P.nodes.map((n, i) => [`${n.rel.dx},${n.rel.dy}`, i]));
  const bands = P.nodes.map(() => null);
  for (const n of nat) {
    const key = `${n.dx},${n.dy}`;
    if (!byRel.has(key)) throw Error('V2_JOIN_FAILED_NO_PUBLIC_COUNTERPART:' + key);
    const i = byRel.get(key);
    if (used.has(i)) throw Error('V2_JOIN_AMBIGUOUS:' + key);
    used.add(i); bands[i] = n.band;
  }
  // non-structural public nodes (HOSTILE/RESOURCE/CIVILIAN/ACTOR-side) carry no band — fail closed if a structural node was missed
  P.nodes.forEach((n, i) => { if (bands[i] === null && STRUCTURAL.has(kindToNative(n.kind))) throw Error('V2_JOIN_STRUCTURAL_NODE_UNBANDED:' + i); });
  return { ...P, nodes: P.nodes.map((n, i) => ({ ...n, band: bands[i] ?? 'X' })), v2Contract: V2_CONTRACT_ID };
}

const kindToNative = (k) => k; // public entityKind equals the native type for Forge worlds (asserted by the projection audit)

/** The sorted, order-free VALUE-band key of a banded projection — matches the value part of the P2R bandKey (Phase 3 gate). */
export function bandKeyOf(P) {
  return P.nodes.filter((n) => n.band !== 'X').map((n) => `${n.kind[0]}:${n.band}`).sort().join('|');
}
/** Value-part key of a raw P2R bandKey row set, for cross-checking: 'D:2:1|...' -> 'D:1|...' per segment. */
export const valuePartOfP2RKey = (bandKey) => bandKey.split('|').map((s) => s.split(':')[0] + ':' + s.split(':')[2]).sort().join('|');
