// H-W1 I-2 public class digest (PCD). A PCD identifies a public observation class independently of entity ids, action handles, menu order and (for the
// D4-canonical forms) the orientation of the view. Two forms are produced, both built from the I-1 identity-free projection only:
//   fine    canonicalFrame digest: node colours (Weisfeiler-Leman), sorted action signatures, tick, history, actor and terrain aggregates
//   coarse  minimum over the 8 D4 frames of (horizon band, sorted keyV2 multiset, public aggregates). The tick, the remaining-tick count, the observation history,
//           the sequence and every timestamp are dropped, so the coarse form merges classes that differ only in when they were observed.
// The contract's comparator projections (S0 top set, Nexus abstention and rationale codes) are deterministic functions of the same public view and are D4/relabel/menu
// stable (I-1 audit), so they cannot split a coarse class (I-1 audit gate S0_AND_NEXUS_ABSTENTION_AND_CODES_STABLE_AT_KEY_LEVEL) and are not re-hashed into the digest.
// Integrity digests (worldHash, sourceStateHash, provenance) are never read: projectPublic does not touch them.
import { createHash } from 'node:crypto';
import { projectPublic, frameProjection, canonicalFrame, keysV2 } from './public-projection.mjs';
import { D4_ELEMENTS } from './transforms.mjs';

export const PCD_VERSION = 'HW1_PCD_V1';
const J = JSON.stringify, H = (x) => createHash('sha256').update(x).digest('hex');

/** Public aggregates kept in the coarse form (no clock fields). */
export function aggregates(P) {
  const kinds = {}; for (const n of P.nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
  const a = P.actor;
  return { grid: P.grid, actor: { energy: a.energy, health: a.health, carried: a.carried, terrain: a.terrain, borderDistance: a.borderDistance }, terrainCounts: P.terrainCounts, kinds: Object.fromEntries(Object.entries(kinds).sort()) };
}

/** PCD of a projection and its horizon band. */
export function pcd(P, band) {
  const fine = H(J([PCD_VERSION, 'FINE', band, canonicalFrame(P).digest]));
  const agg = aggregates(P), per = D4_ELEMENTS.map((t) => H(J([PCD_VERSION, 'COARSE', band, keysV2(frameProjection(P, t)).sort(), agg])));
  return { version: PCD_VERSION, fine, coarse: [...per].sort()[0] };
}
export const pcdOfView = (view, band) => pcd(projectPublic(view), band);

// ------------------------------------------------------------------------------------------------------------------ naive digests (negative controls)
/** Deliberately wrong digests. The invariance tests must catch each one; the real PCD must pass the same tests. */
export const NAIVE_PCD = {
  MENU_ORDER: (view, band) => H(J([band, projectPublic(view).menu.map((_, i) => keysV2(projectPublic(view))[i])])),
  NO_D4: (view, band) => { const P = projectPublic(view); return H(J([band, keysV2(P).sort(), aggregates(P)])); },
  RAW_ENTITY_IDS: (view, band) => H(J([band, view.state.entities.map((e) => e.entityId).sort(), view.surface.map((e) => e.targetEntityId ?? null).sort()])),
  SOURCE_STATE_HASH: (view, band) => H(J([band, view.state.sourceStateHash])),
};

// ------------------------------------------------------------------------------------------------------------------ tamper mutators
const clone = (P) => structuredClone(P);
/** A node the coarse form can see: one that some action targets or depends on (the coarse form keeps only the keyV2 blocks of those nodes plus kind counts). */
const seen = (P) => { const a = P.menu.find((m) => m.target != null) ?? P.menu.find((m) => m.dependent != null); return a ? (a.target ?? a.dependent) : null; };
const seenDependent = (P) => P.menu.find((m) => m.dependent != null)?.dependent ?? null;
/** One public field changed at a time. apply returns whether the field enters the coarse form on this projection. fine: the fine digest must always change.
 *  coarse true: the coarse digest must change whenever the field enters it; false: it must NOT change (clock fields are dropped by design). */
export const TAMPERS = [
  { name: 'ACTOR_ENERGY', coarse: true, apply: (P) => { P.actor.energy += 1; return true; } },
  { name: 'ACTOR_HEALTH', coarse: true, apply: (P) => { P.actor.health += 1; return true; } },
  { name: 'ACTOR_TERRAIN', coarse: true, apply: (P) => { P.actor.terrain = P.actor.terrain + '_X'; return true; } },
  { name: 'ACTOR_BORDER_DISTANCE', coarse: true, apply: (P) => { P.actor.borderDistance += 1; return true; } },
  { name: 'NODE_FLAG_CRITICAL', coarse: true, apply: (P) => { const k = seen(P) ?? 0; P.nodes[k].flags.critical = !P.nodes[k].flags.critical; return seen(P) !== null; } },
  { name: 'NODE_FLAG_RESOURCE', coarse: true, apply: (P) => { const k = seenDependent(P) ?? 0; P.nodes[k].flags.resource = !P.nodes[k].flags.resource; return seenDependent(P) !== null; } },
  { name: 'NODE_KIND', coarse: true, apply: (P) => { P.nodes[seen(P) ?? 0].kind += '_X'; return true; } },
  { name: 'NODE_REL_DX', coarse: true, apply: (P) => { const k = seen(P) ?? 0; P.nodes[k].rel = { ...P.nodes[k].rel, dx: P.nodes[k].rel.dx + 3 }; return seen(P) !== null; } },
  { name: 'NODE_ADDED', coarse: true, apply: (P) => { P.nodes.push({ ...clone(P.nodes[0]), rels: [], obj: [] }); return true; } },
  { name: 'MENU_COST', coarse: false, apply: (P) => { const m = P.menu[P.menu.length - 1]; m.cost = (Number(m.cost) || 0) + 7; return false; } }, // declared cost is not part of keyV2 by design (I-1)
  { name: 'MENU_TYPE', coarse: true, apply: (P) => { P.menu[P.menu.length - 1].type += '_X'; return true; } },
  { name: 'MENU_ACTION_REMOVED', coarse: true, apply: (P) => { P.menu.pop(); return true; } },
  { name: 'TERRAIN_COUNT', coarse: true, apply: (P) => { const k = Object.keys(P.terrainCounts)[0]; P.terrainCounts = { ...P.terrainCounts, [k]: P.terrainCounts[k] + 1 }; return true; } },
  { name: 'GRID', coarse: true, apply: (P) => { P.grid = { ...P.grid, width: P.grid.width + 1 }; return true; } },
  { name: 'TICK', coarse: false, apply: (P) => { P.tick += 1; return false; } },
  { name: 'TICKS_REMAINING', coarse: false, apply: (P) => { P.actor.ticksRemaining += 1; return false; } },
  { name: 'HISTORY_LENGTH', coarse: false, apply: (P) => { P.history.n += 1; return false; } },
  { name: 'HISTORY_CHANNEL_LAST', coarse: false, apply: (P) => { const c = P.history.channels; if (c.length) c[0] = [c[0][0], (c[0][1] ?? 0) + 1, c[0][2], c[0][3]]; else c.push(['x', 1, 0, 1]); return false; } },
];
export const tamperedPcd = (P, band, t) => { const Q = clone(P), enters = t.apply(Q); return { pcd: pcd(Q, band), enters }; };
