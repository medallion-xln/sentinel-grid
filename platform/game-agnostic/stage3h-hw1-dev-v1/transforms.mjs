// H-W1 DEV transformation contracts (frozen at I-0). Three families, each returning the transformed public view together with the
// map that carries an action of the original view to its image in the transformed view:
//   RELABEL   consistent opaque renaming of every entity identifier and every action handle (O-2R.1 mechanics, lib.mjs relabelView)
//   MENU      permutation of the legal-action list (surface and semantics permuted together; handles unchanged)
//   D4        one of the 8 dihedral elements applied to the native world (orientWorld) and the view rebuilt by the frozen observableView;
//             the action map is forgeActionKey(orientAction(t, action)), the same mapping scripts/stage3g/evidence.mjs uses for its twins.
// Nothing here reads hidden state or evaluator output. D4 is lawful for a given world only if the map is a bijection onto the
// transformed menu (checked, never assumed).
import { forgeActionKey } from '../src/forge/kernel.js';
import { ORIENTATIONS, orientAction, orientWorld } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { controlMaps, relabelView, prng, shuffled, ok } from '../stage3h-failure-diagnosis-v1/lib.mjs';

export const D4_ELEMENTS = ORIENTATIONS, D4_NON_IDENTITY = ORIENTATIONS.filter((t) => t !== 'R0');
export const RELABEL_KINDS = ['O2R1_EQUIVALENT', 'RANDOM_1', 'RANDOM_2', 'RANDOM_3', 'RANDOM_4', 'RANDOM_5'];

/** RELABEL: returns { view, actionMap (old handle -> new handle), entityMap }. */
export function relabelTwin(view, kind, label) {
  const m = controlMaps(view, kind, label), v = relabelView(view, m.entity, m.handle);
  ok(v.surface.length === view.surface.length && v.surface.every((e, i) => e.actionId === m.handle[view.surface[i].actionId]), 'RELABEL_HANDLE_MAP_BROKEN');
  return { view: v, actionMap: m.handle, entityMap: m.entity };
}

/** MENU: permutes the list order only. `order[i]` is the old index shown at new position i. */
export function menuTwin(view, order) {
  ok(order.length === view.surface.length && new Set(order).size === order.length, 'MENU_ORDER_NOT_A_PERMUTATION');
  return { view: { ...view, surface: order.map((i) => view.surface[i]), semantics: order.map((i) => view.semantics[i]) }, order };
}
/** The six frozen menu orders: five seeded random permutations and the reverse. */
export function menuOrders(n, label) {
  const idx = [...Array(n).keys()], out = [];
  for (let k = 1; k <= 5; k++) out.push({ kind: `RANDOM_${k}`, order: shuffled(idx, prng(`${label}:MENU:${k}`)) });
  out.push({ kind: 'REVERSE', order: [...idx].reverse() });
  return out;
}

/** D4: the transformed view and the old-handle -> new-handle map; `lawful` records whether the map is a bijection onto the new menu. */
export function d4Twin(world, t) {
  const size = world.grid.width, w = orientWorld(t, world), view = observableView(w), base = observableView(world);
  const actionMap = {};
  for (const e of base.surface) { ok(e.actionId === forgeActionKey(e.action), 'HANDLE_IS_NOT_FORGE_ACTION_KEY'); actionMap[e.actionId] = forgeActionKey(orientAction(t, e.action, size)); }
  const images = Object.values(actionMap), newMenu = new Set(view.surface.map((e) => e.actionId));
  const injective = new Set(images).size === images.length, onto = images.length === newMenu.size && images.every((h) => newMenu.has(h));
  return { t, world: w, view, actionMap, lawful: injective && onto, injective, onto, missing: images.filter((h) => !newMenu.has(h)).length, extra: [...newMenu].filter((h) => !new Set(images).has(h)).length };
}
