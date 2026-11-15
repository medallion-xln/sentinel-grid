// H-W1 I-1 audit helpers: forbidden-component keys (negative controls), selection variants, and mapped comparison of keys and choices.
// A test pairs an action i of the base view with its image j in a transformed view. A key is invariant iff key(base, i) == key(twin, j) for every i.
// Negative controls append one forbidden component to the real keyV2; the audit demands that each is caught by at least one test and that the
// real keyV2 is caught by none.
import { keyV2, selectEquivariant } from './public-projection.mjs';
const J = JSON.stringify;

const target = (view, i) => { const id = view.surface[i].targetEntityId; return id == null ? null : view.state.entities.find((e) => e.entityId === id) ?? null; };
/** Forbidden inputs. ctx = { view, world, i }. */
export const LEAKS = {
  RAW_ENTITY_ID: ({ view, i }) => [view.surface[i].targetEntityId ?? null, view.surface[i].action.parameters?.dependent ?? null],
  ENTITY_ID_RANK: ({ view, i }) => { const t = view.surface[i].targetEntityId; return t == null ? null : view.state.entities.map((e) => e.entityId).sort().indexOf(t); },
  ACTION_HANDLE: ({ view, i }) => view.surface[i].actionId,
  MENU_POSITION: ({ i }) => i,
  SOURCE_STATE_HASH: ({ view }) => view.state.sourceStateHash,
  HIDDEN_HEALTH: ({ view, world, i }) => { const t = view.surface[i].targetEntityId, e = t == null ? null : world.entities.find((x) => x.id === t); return e ? e.health : null; },
  ABSOLUTE_POSITION: ({ view, i }) => { const e = target(view, i); return e ? [e.observedPosition.x, e.observedPosition.y] : null; },
};
/** HIDDEN_HEALTH reads the evaluator-side world by id, so it is only meaningful where ids are unchanged. */
const ONLY_HIDDEN = new Set(['HIDDEN_HEALTH']);

/**
 * Compare keys under one transformed view. base/twin = { view, world, P }; twin.map[i] = image index; twin.framed = base projection seen in the
 * twin's D4 frame (D4 tests only). Returns { n, real: failures of keyV2, leaks: { name: failures } }.
 */
export function compareKeys(kind, base, twin) {
  const out = { n: base.view.surface.length, real: 0, leaks: {} }, Pb = twin.framed ?? base.P;
  base.view.surface.forEach((_, i) => {
    const j = twin.map[i];
    if (keyV2(Pb, i) !== keyV2(twin.P, j)) out.real++;
    for (const [name, f] of Object.entries(LEAKS)) {
      if (ONLY_HIDDEN.has(name) && kind !== 'HIDDEN') continue;
      if (J(f({ view: base.view, world: base.world, i })) !== J(f({ view: twin.view, world: twin.world, i: j }))) out.leaks[name] = (out.leaks[name] ?? 0) + 1;
    }
  });
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ selection variants
const TYPE_RANK = ['WAIT', 'MOVE', 'RETREAT', 'REPAIR', 'RESTORE', 'REINFORCE', 'PROTECT', 'ATTACK', 'BYPASS'];
/** Invariant scores. CONSTANT ties every action, so the choice is the tie-break alone (the strictest test of the symmetric-orbit rule); TYPE ties
 *  across all actions of one type; COST ties less often. */
export const SCORES = {
  CONSTANT: () => () => 0,
  TYPE: (P) => (i) => TYPE_RANK.indexOf(P.menu[i].type),
  COST: (P) => (i) => Number(P.menu[i].cost) || 0,
};
const argmax = (P, score, better) => { let best = null; P.menu.forEach((_, i) => { if (best === null || score(i) > score(best) || (score(i) === score(best) && better(i, best))) best = i; }); return best; };
/** EQUIVARIANT is the I-1 selector; the others are naive tie-breaks used only as negative controls. */
export const SELECTORS = {
  EQUIVARIANT: (P, view, score) => selectEquivariant(P, score).index,
  LEXICAL_KEYV2: (P, view, score) => argmax(P, score, (i, b) => keyV2(P, i) < keyV2(P, b)),
  MENU_FIRST: (P, view, score) => argmax(P, score, () => false),
  HANDLE_ALPHABETICAL: (P, view, score) => argmax(P, score, (i, b) => view.surface[i].actionId < view.surface[b].actionId),
};

/** Equivariance of one selector on one twin: the twin's choice must be the image of the base choice. `pick` is the base choice, memoised by the caller. */
export const chooseMatches = (selector, scoreName, base, twin, pick) => {
  const P = twin.P, t = SELECTORS[selector](P, twin.view, SCORES[scoreName](P));
  return twin.map[pick] === t;
};
