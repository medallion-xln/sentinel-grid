// H-W1 DEV I-0 fixture gates, run over all 341 spent base classes of the arm-stress selection (reproduced, never regenerated):
//   A. regeneration reproduces every recorded world hash (generator and native-world versions are the frozen ones)
//   B. frozen schemas: public observation key paths and native legal-action schema, with a forbidden-name scan (informative; adjudicated at I-1)
//   C. D4: for 7 non-identity elements x 341 worlds, the action map is a bijection onto the transformed menu AND the frozen evaluator's
//      utilities are equivariant under it (tolerance 0). D4 is claimed lawful only where both hold; otherwise the gate fails.
//   D. comparator stability: S0 and Nexus are re-run on 6 relabellings, 6 menu orders and 7 D4 views of every class; each projection is
//      classified stable/unstable. Only a projection with zero instability may reach the policy (contract comparatorInputRule).
//   E. negative controls: deliberately broken maps/labels/relabellings must be detected by the same checks.
// Read-only on the repository. Usage: node i0-fixture-gates.mjs [--limit N] [--write]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { candidates } from '../stage3h-safety-feasibility-v1/search.mjs';
import { comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { nativeWorld } from '../stage3h-safety-feasibility-v1/twins.mjs';
import { evaluatorTruth, devLock, identityUniverse, relabelView, stringLeaves, sha, ok, writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { D4_NON_IDENTITY, RELABEL_KINDS, relabelTwin, menuTwin, menuOrders, d4Twin } from './transforms.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(LANE, '../../..');
const argv = process.argv, limitArg = argv.indexOf('--limit'), LIMIT = limitArg > 0 ? Number(argv[limitArg + 1]) : Infinity, WRITE = argv.includes('--write');
const RULE_HASH = '13a7ed687d4436585b3821569de7a8d63dcdd8616e75546df86a6c1685f7a57f', IDENTITIES_SHA = 'a39ab255d94d6a34c424b82c9ce399462edcc7daf74e10de4b6b79093c96766a';

// ---------------------------------------------------------------- helpers
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
function keyPaths(x, path, out) {
  const t = typeOf(x); (out.get(path) ?? out.set(path, new Set()).get(path)).add(t);
  if (t === 'array') x.forEach((v) => keyPaths(v, path + '[]', out));
  else if (t === 'object') for (const [k, v] of Object.entries(x)) keyPaths(v, `${path}.${k}`, out);
}
const FORBIDDEN_NAME = /health|value\b|hidden|outcome|seed|regret|utilit|catastroph|oracle|rollout|reward|branch|counterfactual|truth|label/i;

/** S0 scores / top set and the Nexus decision on one public view, keyed by action handle. */
function comparators(view, band) {
  const L = devLock(view, band), scores = new Map(), types = new Map();
  view.surface.forEach((e, i) => { scores.set(e.actionId, L.s0.scores[i]); types.set(e.actionId, e.actionType); });
  return { scores, types, top: new Set(L.s0.selected), nexus: L.nexus, menuSize: view.surface.length };
}
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const typeBag = (set, types) => [...set].map((h) => types.get(h)).sort().join(',');

/** Stability flags of comparator outputs on a transformed view against the base, through the action map `map` (old handle -> new handle). */
function compare(B, T, map, signalMap) {
  let scoreMax = 0, scoresEqual = true;
  for (const [h, s] of B.scores) { const d = Math.abs(T.scores.get(map[h]) - s); if (!(d === 0)) scoresEqual = false; if (!(d <= scoreMax)) scoreMax = Number.isNaN(d) ? Infinity : d; }
  const topMapped = new Set([...B.top].map((h) => map[h]));
  const bn = B.nexus, tn = T.nexus;
  let pick;
  if (bn.abstain !== tn.abstain) pick = 'ABSTAIN_MISMATCH';
  else if (bn.abstain) pick = 'SAME';
  else if (tn.action === map[bn.action]) pick = 'SAME';
  else if (T.types.get(tn.action) === B.types.get(bn.action)) pick = 'SAME_TYPE_DIFFERENT_ACTION';
  else pick = 'DIFFERENT_TYPE';
  const signalsMapped = signalMap ? sha(signalMap(bn.signals)) === sha(tn.signals) : null;
  return {
    s0Scores: scoresEqual, s0ScoreMaxAbsDiff: scoreMax, s0TopSet: sameSet(topMapped, T.top), s0TopSize: B.top.size === T.top.size, s0TopTypes: typeBag(topMapped, T.types) === typeBag(T.top, T.types),
    nexusAbstain: bn.abstain === tn.abstain, nexusPick: pick, nexusPickType: bn.abstain || tn.abstain ? bn.abstain === tn.abstain : B.types.get(bn.action) === T.types.get(tn.action),
    nexusCodes: sha(bn.codes) === sha(tn.codes), nexusReason: bn.reason === tn.reason, nexusSignalsExact: sha(bn.signals) === sha(tn.signals), nexusSignalsUnderMap: signalsMapped,
  };
}
const PROJECTIONS = ['s0Scores', 's0TopSet', 's0TopSize', 's0TopTypes', 'nexusAbstain', 'nexusPickType', 'nexusCodes', 'nexusReason', 'nexusSignalsExact'];
const newTally = () => ({ n: 0, threw: 0, unstable: Object.fromEntries(PROJECTIONS.map((p) => [p, 0])), nexusPick: { SAME: 0, SAME_TYPE_DIFFERENT_ACTION: 0, DIFFERENT_TYPE: 0, ABSTAIN_MISMATCH: 0 }, s0ScoreMaxAbsDiff: 0, signalsUnderMapUnstable: 0, signalsUnderMapChecked: 0 });
function tally(t, r) {
  t.n++; for (const p of PROJECTIONS) if (r[p] !== true) t.unstable[p]++;
  t.nexusPick[r.nexusPick]++; if (r.s0ScoreMaxAbsDiff > t.s0ScoreMaxAbsDiff) t.s0ScoreMaxAbsDiff = r.s0ScoreMaxAbsDiff;
  if (r.nexusSignalsUnderMap !== null) { t.signalsUnderMapChecked++; if (!r.nexusSignalsUnderMap) t.signalsUnderMapUnstable++; }
}

/** Evaluator-label equivariance of one D4 twin: utilities through the action map, tolerance 0. */
function labelEquivariance(U, TU, map) {
  let maxAbsDiff = 0, missing = 0;
  for (const [h, u] of U) { const v = TU.get(map[h]); if (v === undefined) { missing++; continue; } const d = Math.abs(v - u); if (d > maxAbsDiff) maxAbsDiff = d; }
  const spread = (m) => Math.max(...m.values()) - Math.min(...m.values());
  return { maxAbsDiff, missing, spreadEqual: spread(U) === spread(TU), equivariant: missing === 0 && maxAbsDiff === 0 && spread(U) === spread(TU) };
}

// ---------------------------------------------------------------- run
const t0 = Date.now(), cs = candidates();
ok(cs.length === 341, 'ARM_STRESS_SET_NOT_341');
const idsSha = sha(cs.map((c) => `${c.set}\t${c.row.idx}\t${c.row.seed}\t${c.row.worldHash}\t${c.reason}`).join('\n'));
const work = cs.slice(0, Math.min(LIMIT, cs.length));

const obsPaths = new Map(), obsWorlds = new Map(), actionSchema = {};
const regen = { total: work.length, rejected: 0, hashMismatch: 0, rejectedExamples: [] };
const d4 = { lawfulNot: [], perTransform: Object.fromEntries(D4_NON_IDENTITY.map((t) => [t, { worlds: 0, lawful: 0, injectiveFail: 0, ontoFail: 0, equivariant: 0, maxAbsDiff: 0, spreadMismatch: 0, menuSizeMismatch: 0, comparators: newTally() }])) };
const rel = Object.fromEntries(RELABEL_KINDS.map((k) => [k, newTally()])), men = Object.fromEntries(['RANDOM_1', 'RANDOM_2', 'RANDOM_3', 'RANDOM_4', 'RANDOM_5', 'REVERSE'].map((k) => [k, newTally()]));
const signalIdentifiers = { worldsWithIdentifierLeaves: 0, examples: [] };
const rowsForHash = [], menuSizes = [], store = [];

for (let i = 0; i < work.length; i++) {
  const c = work[i], base = nativeWorld(comboOf(c.row));
  if (base.rejected) { regen.rejected++; if (regen.rejectedExamples.length < 5) regen.rejectedExamples.push({ i, reason: base.rejected }); continue; }
  if (base.worldHash !== c.row.worldHash) regen.hashMismatch++;
  const view = base.view, menu = view.surface.map((e) => e.actionId), ids = new Set([...identityUniverse(view), ...menu]);
  menuSizes.push(menu.length);
  // schema inventories
  const worldPaths = new Map(); keyPaths({ observation: view.observation, visibleMap: view.visibleMap, state: view.state, surface: view.surface, semantics: view.semantics }, '$', worldPaths);
  for (const [p, ts] of worldPaths) { (obsPaths.get(p) ?? obsPaths.set(p, new Set()).get(p)); for (const t of ts) obsPaths.get(p).add(t); obsWorlds.set(p, (obsWorlds.get(p) ?? 0) + 1); }
  for (const e of view.surface) { const s = (actionSchema[e.actionType] ??= { count: 0, keys: new Map() }); s.count++; const ks = new Map(); keyPaths(e.action, '$', ks); for (const [p, ts] of ks) { const m = (s.keys.get(p) ?? s.keys.set(p, new Set()).get(p)); for (const t of ts) m.add(t); } }

  const U = new Map(evaluatorTruth(base.world, base.horizon, menu).map((x) => [x.id, x.utility])), B = comparators(view, base.band);
  const idLeaves = stringLeaves(B.nexus.signals).filter(([, v]) => ids.has(v));
  if (idLeaves.length) { signalIdentifiers.worldsWithIdentifierLeaves++; if (signalIdentifiers.examples.length < 3) signalIdentifiers.examples.push({ i, leaves: idLeaves.slice(0, 3) }); }
  const row = [i, base.worldHash === c.row.worldHash ? 1 : 0, menu.length];

  // relabel
  for (const kind of RELABEL_KINDS) {
    const tw = relabelTwin(view, kind, `i0:${c.row.worldHash}`), r = rel[kind];
    try { const T = comparators(tw.view, base.band); const res = compare(B, T, tw.actionMap, (sig) => relabelView(sig, tw.entityMap, tw.actionMap)); tally(r, res); row.push(res.nexusPick, res.s0Scores ? 1 : 0); } catch { r.threw++; r.n++; }
  }
  // menu order
  for (const { kind, order } of menuOrders(menu.length, `i0:${c.row.worldHash}`)) {
    const tw = menuTwin(view, order), identity = Object.fromEntries(menu.map((h) => [h, h])), r = men[kind];
    try { const T = comparators(tw.view, base.band); tally(r, compare(B, T, identity, (sig) => sig)); } catch { r.threw++; r.n++; }
  }
  // D4
  for (const t of D4_NON_IDENTITY) {
    const tw = d4Twin(base.world, t), r = d4.perTransform[t]; r.worlds++;
    if (!tw.injective) r.injectiveFail++; if (!tw.onto) r.ontoFail++;
    if (tw.view.surface.length !== menu.length) r.menuSizeMismatch++;
    if (!tw.lawful) { d4.lawfulNot.push({ i, t, missing: tw.missing, extra: tw.extra }); row.push(`${t}:U`); continue; }
    r.lawful++;
    const tm = tw.view.surface.map((e) => e.actionId), TU = new Map(evaluatorTruth(tw.world, base.horizon, tm).map((x) => [x.id, x.utility])), le = labelEquivariance(U, TU, tw.actionMap);
    if (le.equivariant) r.equivariant++; if (le.maxAbsDiff > r.maxAbsDiff) r.maxAbsDiff = le.maxAbsDiff; if (!le.spreadEqual) r.spreadMismatch++;
    try { tally(r.comparators, compare(B, comparators(tw.view, base.band), tw.actionMap, null)); } catch { r.comparators.threw++; r.comparators.n++; }
    row.push(`${t}:${le.maxAbsDiff}`);
  }
  rowsForHash.push(row);
  if (i === 0 || (i + 1) % 50 === 0) console.error(`[${i + 1}/${work.length}] ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (store.length < 40) store.push({ view, world: base.world, horizon: base.horizon, band: base.band, U });
}

// ---------------------------------------------------------------- negative controls (the same detectors, deliberately fed broken inputs)
const nc = { d4WrongMapDetected: null, d4IdentityMapDetected: null, tamperedLabelDetected: null, partialRelabelDetected: null, nonPermutationMenuRejected: null, scoreTamperDetected: null, details: {} };
{
  // 1. D4 action map taken from a different element must be flagged by the equivariance check on at least one control world, for every pair
  let wrongDetected = 0, wrongTried = 0, idDetected = 0, idTried = 0;
  for (const s of store) {
    const menu = s.view.surface.map((e) => e.actionId);
    for (const t of ['R90', 'MX']) {
      const tw = d4Twin(s.world, t), tm = tw.view.surface.map((e) => e.actionId), TU = new Map(evaluatorTruth(tw.world, s.horizon, tm).map((x) => [x.id, x.utility]));
      const other = d4Twin(s.world, t === 'R90' ? 'MY' : 'MD');
      wrongTried++; if (!labelEquivariance(s.U, TU, Object.fromEntries(menu.map((h) => [h, other.actionMap[h]]))).equivariant) wrongDetected++;
      idTried++; if (!labelEquivariance(s.U, TU, Object.fromEntries(menu.map((h) => [h, h]))).equivariant) idDetected++;
    }
  }
  nc.d4WrongMapDetected = wrongDetected > 0; nc.d4IdentityMapDetected = idDetected > 0; nc.details.d4WrongMap = { tried: wrongTried, flagged: wrongDetected }; nc.details.d4IdentityMap = { tried: idTried, flagged: idDetected };
  // 2. an evaluator label perturbed by one unit must be flagged
  const s = store[0], tw = d4Twin(s.world, 'R90'), tm = tw.view.surface.map((e) => e.actionId), TU = new Map(evaluatorTruth(tw.world, s.horizon, tm).map((x) => [x.id, x.utility]));
  const first = tw.actionMap[s.view.surface[0].actionId]; TU.set(first, TU.get(first) + 1);
  nc.tamperedLabelDetected = !labelEquivariance(s.U, TU, tw.actionMap).equivariant;
  // 3. a relabelling that omits one entity must be reported incomplete by the universe-coverage check
  const full = relabelTwin(s.view, 'RANDOM_1', 'nc'), universe = identityUniverse(s.view), partial = { ...full.entityMap }; delete partial[universe[0]];
  nc.partialRelabelDetected = universe.some((id) => !Object.hasOwn(partial, id)) && universe.every((id) => Object.hasOwn(full.entityMap, id));
  // 4. a non-permutation menu order must be rejected
  try { menuTwin(s.view, s.view.surface.map((_, i) => (i === 0 ? 1 : i))); nc.nonPermutationMenuRejected = false; } catch (e) { nc.nonPermutationMenuRejected = /MENU_ORDER_NOT_A_PERMUTATION/.test(e.message); }
  // 5. a perturbed S0 score must be flagged by the comparator-stability check
  const B = comparators(s.view, s.band), identity = Object.fromEntries(s.view.surface.map((e) => [e.actionId, e.actionId]));
  const T = { ...B, scores: new Map(B.scores) }; const k0 = s.view.surface[0].actionId; T.scores.set(k0, T.scores.get(k0) + 1e-9);
  nc.scoreTamperDetected = compare(B, T, identity, null).s0Scores === false;
}

// ---------------------------------------------------------------- aggregate
const schemaObs = [...obsPaths.keys()].sort().map((p) => ({ path: p, types: [...obsPaths.get(p)].sort(), worlds: obsWorlds.get(p) }));
const schemaAct = Object.fromEntries(Object.keys(actionSchema).sort().map((k) => [k, { count: actionSchema[k].count, keys: [...actionSchema[k].keys.keys()].sort().map((p) => ({ path: p, types: [...actionSchema[k].keys.get(p)].sort() })) }]));
const obsForbidden = schemaObs.filter((x) => FORBIDDEN_NAME.test(x.path.split('.').pop())).map((x) => x.path);
const d4Totals = Object.values(d4.perTransform).reduce((a, r) => ({ worlds: a.worlds + r.worlds, lawful: a.lawful + r.lawful, equivariant: a.equivariant + r.equivariant, maxAbsDiff: Math.max(a.maxAbsDiff, r.maxAbsDiff), spreadMismatch: a.spreadMismatch + r.spreadMismatch, menuSizeMismatch: a.menuSizeMismatch + r.menuSizeMismatch }), { worlds: 0, lawful: 0, equivariant: 0, maxAbsDiff: 0, spreadMismatch: 0, menuSizeMismatch: 0 });
const family = (tallies) => { const sum = newTally(); for (const t of tallies) { sum.n += t.n; sum.threw += t.threw; for (const p of PROJECTIONS) sum.unstable[p] += t.unstable[p]; for (const k of Object.keys(sum.nexusPick)) sum.nexusPick[k] += t.nexusPick[k]; sum.s0ScoreMaxAbsDiff = Math.max(sum.s0ScoreMaxAbsDiff, t.s0ScoreMaxAbsDiff); sum.signalsUnderMapUnstable += t.signalsUnderMapUnstable; sum.signalsUnderMapChecked += t.signalsUnderMapChecked; } return sum; };
const fam = { relabel: family(Object.values(rel)), menuOrder: family(Object.values(men)), d4: family(Object.values(d4.perTransform).map((r) => r.comparators)) };
const admissibility = {};
for (const p of PROJECTIONS) {
  const u = { relabel: fam.relabel.unstable[p], menuOrder: fam.menuOrder.unstable[p], d4: fam.d4.unstable[p] };
  admissibility[p] = { unstable: u, threw: { relabel: fam.relabel.threw, menuOrder: fam.menuOrder.threw, d4: fam.d4.threw }, admissibleAsPolicyFeature: u.relabel === 0 && u.menuOrder === 0 && u.d4 === 0 && fam.relabel.threw + fam.menuOrder.threw + fam.d4.threw === 0 };
}
{ // the exact Nexus recommended action (a handle) is identity-bearing by construction; judged on the same rule as every other projection
  const nonSame = (f) => f.nexusPick.SAME_TYPE_DIFFERENT_ACTION + f.nexusPick.DIFFERENT_TYPE + f.nexusPick.ABSTAIN_MISMATCH, u = { relabel: nonSame(fam.relabel), menuOrder: nonSame(fam.menuOrder), d4: nonSame(fam.d4) };
  admissibility.nexusPickExactAction = { unstable: u, threw: { relabel: fam.relabel.threw, menuOrder: fam.menuOrder.threw, d4: fam.d4.threw }, admissibleAsPolicyFeature: u.relabel === 0 && u.menuOrder === 0 && u.d4 === 0 && fam.relabel.threw + fam.menuOrder.threw + fam.d4.threw === 0,
    pickClassification: { relabel: fam.relabel.nexusPick, menuOrder: fam.menuOrder.nexusPick, d4: fam.d4.nexusPick } };
}
const full = work.length === 341;
const gates = {
  armStressSetReproduced: cs.length === 341 && idsSha === IDENTITIES_SHA,
  regenerationReproducesEveryRecordedWorldHash: regen.rejected === 0 && regen.hashMismatch === 0 && rowsForHash.length === work.length,
  observationSchemaFrozen: schemaObs.length > 0 && Object.keys(schemaAct).length >= 6,
  d4ActionMapLawfulEverywhere: d4.lawfulNot.length === 0 && d4Totals.lawful === d4Totals.worlds && d4Totals.worlds === work.length * 7,
  d4LabelsEquivariantEverywhere: d4Totals.equivariant === d4Totals.worlds && d4Totals.maxAbsDiff === 0 && d4Totals.spreadMismatch === 0 && d4Totals.menuSizeMismatch === 0,
  relabelMapsBijective: fam.relabel.n === work.length * RELABEL_KINDS.length,
  negativeControlsDetected: Object.entries(nc).filter(([k]) => k !== 'details').every(([, v]) => v === true),
  fullPopulation: full,
};
const pass = Object.values(gates).every(Boolean);
const head = execFileSync('/usr/bin/git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = {
  schema: 'H_W1_DEV_I0_FIXTURE_GATES_V1', authority: 'R0', checkedAt: new Date().toISOString(), nodeVersion: process.version, head, armStressRuleHash: RULE_HASH, armStressIdentitiesSha256: idsSha, classes: work.length,
  note: 'Spent privileged fixtures (the 341 arm-stress classes): used only to verify transformation lawfulness and comparator stability. They are not new independent evidence and are never used for policy selection or training.',
  regeneration: regen, menuSizes: { min: Math.min(...menuSizes), max: Math.max(...menuSizes), mean: menuSizes.reduce((a, b) => a + b, 0) / menuSizes.length },
  schemas: { observation: { paths: schemaObs.length, sha256: sha(schemaObs), forbiddenNamedPathsToAdjudicateAtI1: obsForbidden, inventory: schemaObs }, nativeAction: { sha256: sha(schemaAct), byType: schemaAct } },
  d4: { elements: D4_NON_IDENTITY, totals: d4Totals, perTransform: Object.fromEntries(Object.entries(d4.perTransform).map(([t, r]) => [t, { ...r, comparators: undefined }])), unlawful: d4.lawfulNot.slice(0, 20), unlawfulCount: d4.lawfulNot.length,
    claim: d4Totals.equivariant === d4Totals.worlds && d4Totals.worlds > 0 ? 'D4 LAWFUL AND LABEL-EQUIVARIANT FOR EVERY CLASS AND ELEMENT (tolerance 0)' : 'D4 NOT CLAIMED' },
  comparatorStability: { relabel: { perKind: rel, total: fam.relabel }, menuOrder: { perKind: men, total: fam.menuOrder }, d4: { perTransform: Object.fromEntries(Object.entries(d4.perTransform).map(([t, r]) => [t, r.comparators])), total: fam.d4 },
    nexusSignalsContainIdentifiers: signalIdentifiers, admissibility,
    decision: 'A comparator projection may be a policy input only if admissibleAsPolicyFeature is true (zero instability under relabel, menu order and D4 on all classes). Unstable projections stay in the evaluation as comparators but are excluded as features.' },
  negativeControls: nc, tableSha256: sha(rowsForHash), gates, pass, elapsedSeconds: Math.round((Date.now() - t0) / 1000),
};
if (WRITE) { ok(pass, 'I0_FIXTURE_GATES_NOT_CLEAN_NOT_RECORDED'); ok(full, 'I0_FIXTURE_GATES_PARTIAL_RUN_NOT_RECORDED'); writeExclusive(resolve(LANE, 'evidence/I0_FIXTURE_GATES.json'), out); }
console.log(JSON.stringify({ pass, gates, classes: out.classes, regeneration: regen, menuSizes: out.menuSizes, observationPaths: schemaObs.length, forbiddenNamedPaths: obsForbidden, d4: { totals: d4Totals, unlawfulCount: d4.lawfulNot.length, claim: out.d4.claim },
  comparatorStability: { relabel: fam.relabel, menuOrder: fam.menuOrder, d4: fam.d4 }, admissibility: Object.fromEntries(Object.entries(admissibility).map(([k, v]) => [k, v.admissibleAsPolicyFeature])), signalIdentifiers, negativeControls: nc, elapsedSeconds: out.elapsedSeconds }, null, 1));
