// H-W1 I-1 audit: synthetic symmetric-orbit controls. None of the spent classes has a nontrivial symmetry (measured), so the symmetric-orbit rule is exercised on
// projection-level constructions whose symmetry group is known by construction:
//   MIRROR_PAIR      two mirrored hostiles          D4 stabiliser {R0, MY}; ATTACK pair and MOVE north/south pair are orbits of size 2
//   FOUR_FOLD        four hostiles at (+-2, +-1)    stabiliser {R0, MX, MY, R180}; only WAIT is fixed
//   COLOCATED_PAIR   two identical co-located hostiles   stabiliser {R0}; a node automorphism makes the ATTACK pair an orbit
//   ASYMMETRIC       control with trivial group     every action is fixed
// Required of an equivariant deterministic policy: choose exactly one executable action that is fixed by the whole group, and make that choice invariant under
// D4, menu permutation and node relabelling. Naive selectors (menu-first, keyV2-lexical) are run as negative controls: they must be caught.
import { prng, shuffled } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { PROJECTION_VERSION, frameProjection, symmetryReport, keyV2 } from './public-projection.mjs';
import { D4_ELEMENTS } from './transforms.mjs';
import { SELECTORS, SCORES } from './i1-audit-checks.mjs';

const node = (kind, dx, dy) => ({ kind, rel: { dx, dy }, dist: { manhattan: Math.abs(dx) + Math.abs(dy), path: Math.abs(dx) + Math.abs(dy) }, dir: { sx: Math.sign(dx), sy: Math.sign(dy) },
  flags: { hostile: kind === 'HOSTILE', critical: false, resource: false, objective: false, inService: true, threatened: false, hub: false }, rels: [], obj: [] });
const act = (type, extra = {}) => ({ type, params: {}, target: null, dependent: null, disp: null, toRel: null, cost: 1, pre: [], eff: [], energyAfter: null, destTerrain: null, ...extra });
const DELTA = { NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] };
const move = (dir) => act('MOVE', { params: { direction: dir }, disp: { dx: DELTA[dir][0], dy: DELTA[dir][1] } });
const projection = (nodes, menu) => ({ version: PROJECTION_VERSION, tick: 3, grid: { width: 10, height: 10 }, actor: { energy: 50, health: 100, carried: 0, ticksRemaining: 20, terrain: 'OPEN', borderDistance: 4 },
  history: { n: 1, channels: [] }, terrainCounts: { OPEN: 100 }, nodes, menu, frame: 'R0' });
const hostiles = (xy) => xy.map(([x, y]) => node('HOSTILE', x, y));
const attacks = (n) => [...Array(n).keys()].map((t) => act('ATTACK', { target: t }));
export const CASES = {
  MIRROR_PAIR: { stabiliser: 2, P: projection(hostiles([[2, 1], [2, -1]]), [act('WAIT'), move('EAST'), move('NORTH'), move('SOUTH'), ...attacks(2)]), orbits: [2, 2, 1, 1] },
  FOUR_FOLD: { stabiliser: 4, P: projection(hostiles([[2, 1], [2, -1], [-2, 1], [-2, -1]]), [act('WAIT'), move('EAST'), move('WEST'), move('NORTH'), move('SOUTH'), ...attacks(4)]), orbits: [4, 2, 2, 1] },
  COLOCATED_PAIR: { stabiliser: 1, P: projection(hostiles([[2, 1], [2, 1]]), [act('WAIT'), move('EAST'), ...attacks(2)]), orbits: [2, 1, 1] },
  ASYMMETRIC: { stabiliser: 1, P: projection(hostiles([[2, 1], [3, -1]]), [act('WAIT'), move('EAST'), ...attacks(2)]), orbits: [1, 1, 1, 1] },
};

/** Relabel the nodes and reorder the menu at projection level: nodePerm[old] = new node index; order[new] = old action index. */
export function permute(P, nodePerm, order) {
  const nodes = []; P.nodes.forEach((n, i) => { nodes[nodePerm[i]] = { ...n, rels: n.rels.map((r) => ({ ...r, to: nodePerm[r.to] })) }; });
  const m = (x) => (x == null ? x : nodePerm[x]);
  return { ...P, nodes, menu: order.map((i) => ({ ...P.menu[i], target: m(P.menu[i].target), dependent: m(P.menu[i].dependent) })) };
}

export function syntheticControls() {
  const out = {};
  for (const [name, c] of Object.entries(CASES)) {
    const P = c.P, n = P.menu.length, sym = symmetryReport(P), r = { name, stabiliser: sym.stabiliser, orbitSizes: sym.orbitSizes, fixed: sym.fixedActions.map((i) => P.menu[i].type), waitFixed: sym.waitFixed,
      expectedStabiliser: c.stabiliser, expectedOrbits: c.orbits, structureAsExpected: sym.stabiliser.length === c.stabiliser && JSON.stringify(sym.orbitSizes) === JSON.stringify(c.orbits) && sym.waitFixed, selectors: {} };
    const perms = [1, 2, 3, 4, 5].map((k) => { const rnd = prng(`${name}:${k}`); return { nodePerm: shuffled([...Array(P.nodes.length).keys()], rnd), order: shuffled([...Array(n).keys()], rnd) }; });
    for (const sel of ['EQUIVARIANT', 'MENU_FIRST', 'LEXICAL_KEYV2']) for (const sc of ['TYPE', 'CONSTANT']) {
      const pick = SELECTORS[sel](P, null, SCORES[sc](P)), inOrbit = !sym.fixedActions.includes(pick);
      let d4Bad = 0, permBad = 0;
      for (const t of D4_ELEMENTS) if (SELECTORS[sel](frameProjection(P, t), null, SCORES[sc](P)) !== pick) d4Bad++;
      for (const p of perms) { const Q = permute(P, p.nodePerm, p.order); if (p.order[SELECTORS[sel](Q, null, SCORES[sc](Q))] !== pick) permBad++; }
      r.selectors[`${sel}/${sc}`] = { chosen: P.menu[pick].type, chosenIsFixed: !inOrbit, d4Bad, d4N: D4_ELEMENTS.length, permBad, permN: perms.length };
    }
    // best-scoring action ignoring symmetry: shows what equivariance costs when the preferred action sits in a nontrivial orbit
    const s = SCORES.TYPE(P), best = Math.max(...P.menu.map((_, i) => s(i)));
    r.preferredInNontrivialOrbit = P.menu.some((_, i) => s(i) === best && !sym.fixedActions.includes(i));
    r.keyV2DistinctWithinMenu = new Set(P.menu.map((_, i) => keyV2(P, i))).size === n;
    out[name] = r;
  }
  return out;
}
