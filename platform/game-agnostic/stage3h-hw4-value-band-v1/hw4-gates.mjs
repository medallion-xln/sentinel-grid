// H-W4 Phase 3 gates. Run: /opt/homebrew/bin/node .../hw4-gates.mjs
// The harness is evaluator-free: it builds a minimal public projection P by hand (the adapter and feature builders
// consume P + the native world only; projectPublic itself is frozen H-W1 code, recorded by hash and walked by G1).
// Gates: G1 static import boundary (no evaluator/scripts module reachable from inference imports);
// G2 feature contract (V1 rows byte-identical to frozen I-3; V2 = V1 + exactly the 8 band one-hots);
// G3 identity invariance (id rename, menu permutation, order-free band key); G4 fail-closed adapter + no exact value
// in features; G5 determinism; G6 no lexical identifiers in the band key.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { withValueBands, bandKeyOf, valuePartOfP2RKey, V2_CONTRACT_ID } from './hw4-contract-v2.mjs';
import { actionFeaturesV1, actionFeaturesV2, BAND_NAMES } from './hw4-features.mjs';
import { actionFeatures as v1Frozen, NAMES } from '../stage3h-hw1-dev-v1/i3-features.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), GA = resolve(LANE, '..'), HW1 = resolve(GA, 'stage3h-hw1-dev-v1');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const out = { gates: {}, failures: [] };
const record = (g, ok, detail = '') => { out.gates[g] = ok ? 'PASS' : 'FAIL:' + detail; if (!ok) out.failures.push(g + ':' + detail); };

// ---- G1: static import boundary over the inference closure (textual, transitive, fail-closed) ----
const INFERENCE = [
  resolve(HW1, 'public-projection.mjs'),
  resolve(LANE, 'hw4-contract-v2.mjs'), resolve(LANE, 'hw4-features.mjs'), resolve(LANE, 'hw4-policy.mjs'),
];
const FORBIDDEN = /(^|\/)(scripts|src\/forge(-symmetric)?\/(evidence|metrics|evaluator))|(^|\/)evidence\.mjs|(^|\/)(i4-|i5-|i2-)|intersect\.mjs/;
function importClosure(entry) {
  const seen = new Set(), stack = [entry], bad = [];
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
    let src; try { src = readFileSync(f, 'utf8'); } catch { bad.push('UNREADABLE:' + f); continue; }
    for (const m of src.matchAll(/import\s.+?from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1]; if (!spec.startsWith('.')) continue;
      const t = resolve(dirname(f), spec);
      if (FORBIDDEN.test(t)) bad.push(t); else stack.push(t);
    }
  }
  return { files: [...seen], bad };
}
{
  const bad = [];
  for (const f of INFERENCE) bad.push(...importClosure(f).bad);
  record('G1_STATIC_IMPORT_BOUNDARY', bad.length === 0, [...new Set(bad)].join(','));
}

// ---- deterministic synthetic fixtures: native world + hand-built matching public projection ----
// actor at (4,4); structural nodes at rel (-2,0),(0,-2),(2,0); one unbanded hostile at (0,2).
const mkWorld = (mut = {}) => {
  const w = {
    entities: [
      { id: 'a1', type: 'ACTOR', position: { x: 4, y: 4 }, health: 10, energy: 10 },
      { id: 'p1', type: 'POWER_SOURCE', position: { x: 2, y: 4 }, health: 5, value: 1 },
      { id: 'p2', type: 'DEPOT', position: { x: 6, y: 4 }, health: 5, value: 9 },
      { id: 'r1', type: 'REPAIR_TARGET', position: { x: 4, y: 2 }, health: 5, value: 5 },
      { id: 'h1', type: 'HOSTILE', position: { x: 4, y: 6 }, health: 5 },
    ], objectives: [{ entityId: 'p2' }], ...mut,
  };
  return w;
};
const world = mkWorld();
const mkP = (w) => {
  const actor = w.entities.find((e) => e.type === 'ACTOR');
  const NOFLAGS = { hostile: false, critical: false, resource: false, objective: false, inService: true, threatened: false, hub: false };
  const nodes = w.entities.filter((e) => e.type !== 'ACTOR').map((e) => ({
    kind: e.type, rel: { dx: e.position.x - actor.position.x, dy: e.position.y - actor.position.y },
    dist: { manhattan: Math.abs(e.position.x - actor.position.x) + Math.abs(e.position.y - actor.position.y), path: NaN },
    dir: { sx: Math.sign(e.position.x - actor.position.x), sy: Math.sign(e.position.y - actor.position.y) },
    flags: { ...NOFLAGS }, rels: [], obj: [],
  }));
  // two trivial actions targeting the first node, so the feature builders have rows to emit
  const menu = [
    { type: 'MOVE', params: {}, target: 0, dependent: null, disp: { dx: 1, dy: 0 }, toRel: null, cost: 1, pre: [], eff: [], energyAfter: 8, destTerrain: 'PLAIN' },
    { type: 'PROTECT', params: {}, target: 0, dependent: 1, disp: null, toRel: null, cost: 2, pre: [], eff: [], energyAfter: 7, destTerrain: null },
  ];
  return { nodes, menu, actor: { energy: 10, ticksRemaining: 50 } };
};
const P = mkP(world);
const SPREAD = 6; // frozen per class; hi = 9, lo = 2  (V0<=2, V1 3..8, V2>=9)

// ---- banded projection for the feature gates (band adapter + values) ----
const Pb = withValueBands(P, world, SPREAD);

// ---- G2: feature contract ----
const f1 = actionFeaturesV1(P), f2 = actionFeaturesV2(Pb), f1b = v1Frozen(P);
const rowsEq = (a, b) => a.length === b.length && a.every((r, i) => JSON.stringify(r) === JSON.stringify(b[i]));
record('G2A_V1_ROWS_FROZEN', rowsEq(f1.rows, f1b.rows) && JSON.stringify(f1.names) === JSON.stringify(f1b.names));
record('G2B_V2_ROWS_V1_PLUS_8', f2.rows.length === f1.rows.length && f2.rows.every((r, i) =>
  r.length === f1.rows[i].length + 8 && r.slice(0, f1.rows[i].length).every((x, j) => x === f1.rows[i][j])) &&
  JSON.stringify(f2.names) === JSON.stringify([...NAMES, ...BAND_NAMES]));

// ---- G4: fail-closed adapter + no exact value in features ----
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
// structural node present public-side but missing native-side must throw (fail closed)
const noStruct = throws(() => withValueBands(P, mkWorld({ entities: world.entities.filter((e) => e.type !== 'DEPOT') }), SPREAD));
const unbanded = throws(() => actionFeaturesV2(P)); // a projection without .band must be refused, not silently encoded as zeros
const dislocated = throws(() => withValueBands(P, mkWorld({ entities: world.entities.map((e) => e.type === 'POWER_SOURCE' ? { ...e, position: { x: 0, y: 0 } } : e) }), SPREAD));
const noActor = throws(() => withValueBands(P, mkWorld({ entities: world.entities.filter((e) => e.type !== 'ACTOR') }), SPREAD));
const bandOnly = f2.rows.every((r) => r.slice(-8).every((x) => x === 0 || x === 1));
record('G4A_FAIL_CLOSED', noStruct && unbanded && dislocated && noActor, `noStruct=${noStruct} unbanded=${unbanded} dislocated=${dislocated} noActor=${noActor}`);
record('G4B_NO_EXACT_VALUE_IN_FEATURES', bandOnly);
const bandOf = (k) => Pb.nodes[Pb.nodes.findIndex((n) => n.kind === k)].band;
record('G4C_BAND_VALUES', bandOf('POWER_SOURCE') === 0 && bandOf('REPAIR_TARGET') === 1 && bandOf('DEPOT') === 'P' && Pb.nodes.find((n) => n.kind === 'HOSTILE').band === 'X', JSON.stringify(Pb.nodes.map((n) => [n.kind, n.band])));

// ---- G3: identity invariance ----
const w2 = mkWorld(); const idm = { a1: 'zz9', p1: 'q7', p2: 'q8', r1: 'q9', h1: 'q0' };
w2.entities = w2.entities.map((e) => ({ ...e, id: idm[e.id] })); w2.objectives = w2.objectives.map((o) => ({ entityId: idm[o.entityId] }));
const Pb2 = withValueBands(P, w2, SPREAD);
record('G3A_ID_RENAME_INVARIANT', bandKeyOf(Pb) === bandKeyOf(Pb2));
record('G3B_BANDKEY_ORDER_FREE', bandKeyOf(Pb) === [...bandKeyOf(Pb).split('|')].sort().join('|'));
const Pperm = { ...Pb, menu: [...Pb.menu].reverse() };
record('G3C_MENU_PERMUTATION', JSON.stringify(actionFeaturesV2(Pperm).rows) === JSON.stringify([...actionFeaturesV2(Pb).rows].reverse()));

// ---- G5: determinism ----
record('G5_DETERMINISM', JSON.stringify(actionFeaturesV2(withValueBands(P, mkWorld(), SPREAD))) === JSON.stringify(actionFeaturesV2(Pb)));

// ---- G6: no lexical identifiers in the band key ----
record('G6_NO_LEXICAL_ID_IN_BANDKEY', !/[a-z]\d/.test(bandKeyOf(Pb).replace(/V0|V1|V2|P/g, '')));

// ---- helper consistency with the P2R bandKey shape ----
record('G7_P2R_KEY_HELPER', valuePartOfP2RKey('D:2:1|I:5:2') === 'D:1|I:2');

// ---- Phase 2/3 evidence cross-check on real reconstructed classes (if the reconcile replay has landed) ----
const REC = resolve(GA, 'stage3h-hw1-dev-v1/p2r-scratch/data/hw4_reconcile.json');
if (existsSync(REC)) {
  const rec = JSON.parse(readFileSync(REC, 'utf8'));
  const rows = rec.classes ?? rec.results ?? [];
  const firstWithWorlds = rows.find((r) => r._worlds && r._worlds.some((w) => w.specFlat && w.bandKey));
  if (firstWithWorlds) {
    const w0 = firstWithWorlds._worlds.find((w) => w.specFlat && w.bandKey);
    const nw = w0.specFlat.entities ? w0.specFlat : JSON.parse(w0.specFlat);
    const Pq = mkP(nw);
    const spread = firstWithWorlds.valueSpread ?? rec.valueSpread;
    const key = bandKeyOf(withValueBands(Pq, nw, spread));
    const expect = valuePartOfP2RKey(w0.bandKey);
    out.p2rBandRoundTrip = { key, expect, match: key === expect };
    record('G8_P2R_BAND_ROUND_TRIP', key === expect, `${key} vs ${expect}`);
  } else record('G8_P2R_BAND_ROUND_TRIP', false, 'no reconstructed world with specFlat+bandKey found');
} else out.p2rBandRoundTrip = 'PENDING (hw4_reconcile.json not yet written)';

out.contracts = { v2: V2_CONTRACT_ID };
out.inferenceFiles = importClosure(INFERENCE[0]).files.length + importClosure(INFERENCE[1]).files.length;
out.sourceHashes = Object.fromEntries(INFERENCE.map((f) => [f.replace(GA + '/', ''), sha(readFileSync(f, 'utf8'))]));
console.log(JSON.stringify(out, null, 1));
if (out.failures.length) process.exit(1);
