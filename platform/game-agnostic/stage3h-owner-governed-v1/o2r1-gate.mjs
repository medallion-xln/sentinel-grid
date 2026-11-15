// Ten-point gate for the O-2R.1 identity nuisance (connector-v3 / identity-view-v2), over the 288 STAGE3H1 OPEN
// development worlds. Point specifications are FIXED HERE BEFORE THE RUN and are stricter than o2r-gate.mjs:
//  1 public-only: input view untouched; output equals V3 transformSyntheticFixture(IDENTITY) followed by global handle remap
//  2 native state unchanged (hashWorld and full JSON)
//  3 native transitions/rewards unchanged (original-world counterfactual result byte-identical after the twin)
//  4 identifiers: every native entity id (world.entities) occurring as a value in the view is mapped; none occurs as a
//    value or substring in the twin; key sets identical; map injective; no original string collides with a new name
//  5 handles: twin surface handles /^opaque-\d+$/, unique, bijective; no original handle anywhere in the twin;
//    semantics[i].ACTION_ID === surface[i].actionId in the twin whenever it holds in the original
//  6 every original action maps to exactly its renamed counterpart (type, payload, target); retreat parameters equal
//  7 row truth equals the original world's counterfactual branches
//  8 no hidden information: identical key set and privileged-key scan; unchanged provenance fingerprints are decision-inert
//    (R/B/N selections unchanged when they are scrambled)
//  9 V3 nuisanceDependence imported unchanged and finite for D4, IDENTITY, ORDER
// 10 the world passes 1-9
// Writes evidence/o2r1-gate.json (wx). No case is dropped.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { hashWorld } from '../src/forge/kernel.js';
import { evaluateCounterfactualsSymmetricV1 } from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { privilegedKeyScan } from '../src/stage3g/observable-entity-state-v1.js';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { transformSyntheticFixture } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { nativeRowV3 } from './connector-v3.mjs';
import { nativeLock } from './connector.mjs';
import { identityViewTwinV2 } from './identity-view-v2.mjs';
import { verifyOwnerLane, LANE } from './inherit.mjs';

const walk = (x, fn, p = '$') => { if (typeof x === 'string') fn('value', x, p); else if (Array.isArray(x)) x.forEach((v) => walk(v, fn, p + '[]')); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { fn('key', k, p + '.' + k); walk(v, fn, p + '.' + k); } };
const values = (x) => { const o = []; walk(x, (k, s) => { if (k === 'value') o.push(s); }); return o; };
const keyPaths = (x) => { const o = []; walk(x, (k, s, p) => { if (k === 'key') o.push(p); }); return o.sort(); };
const mapStrings = (x, m) => (typeof x === 'string' ? (Object.hasOwn(m, x) ? m[x] : x) : Array.isArray(x) ? x.map((v) => mapStrings(v, m)) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, mapStrings(v, m)])) : x);
function scrambleFingerprints(v) {
  const z = (s) => (typeof s === 'string' ? s.split('').reverse().join('') : s), w = structuredClone(v);
  w.observation.metadata.worldHash = z(w.observation.metadata.worldHash); w.state.sourceStateHash = z(w.state.sourceStateHash);
  if (w.state.provenance) w.state.provenance.sourceStateHash = z(w.state.provenance.sourceStateHash);
  for (const e of w.state.entities ?? []) if (e.provenance) e.provenance.sourceStateHash = z(e.provenance.sourceStateHash);
  w.semantics = w.semantics.map((s) => (s.provenance ? { ...s, provenance: { ...s.provenance, sourceStateHash: z(s.provenance.sourceStateHash) } } : s));
  return w;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const c3 = readFileSync(resolve(LANE, 'connector-v3.mjs'), 'utf8');
  const staticV3Nuisance = c3.includes("import { scoreSyntheticTruth, nuisanceDependence, digest } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs'") && c3.includes('nuisanceDependence(original, variants).values') && c3.includes("from './identity-view-v2.mjs'");
  const K = ['1_publicObservationOnly', '2_nativeStateUnchanged', '3_nativeTransitionsRewardsUnchanged', '4_identifiersConsistentlyRenamed', '5_handlesOpaqueAndBijective', '6_actionSemanticsPreserved', '7_originalTruthAuthoritative', '8_noHiddenInformation', '9_exactV3Statistic', '10_developmentWitnessPasses'];
  const pass = Object.fromEntries(K.map((k) => [k, 0])), failures = []; let worlds = 0, retreatWorlds = 0, originalSemanticsConsistent = 0;
  for (const c of openCombos().map(({ panel, ...x }) => x)) {
    worlds++; const cell = [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/'), mine = [];
    const warm = runCalibratedWarmup(c.seed, (w) => generateScenarioSymmetricV1({ ...c, warmupTicks: w })), world = warm.world, horizon = warm.scenarioConfig.horizon;
    const before = hashWorld(world), worldJson = JSON.stringify(world), view = observableView(world), viewJson = JSON.stringify(view), cfBefore = JSON.stringify(evaluateCounterfactualsSymmetricV1(world, { horizon }));
    const o = identityViewTwinV2(view), f = (k, ok, detail) => { if (ok) pass[k]++; else { failures.push({ seed: c.seed, cell, check: k, detail }); mine.push(k); } };
    const v3 = transformSyntheticFixture({ synthetic: true, publicView: view, releaseSyntheticTruth: () => [] }, 'IDENTITY', 'IDENTITY');
    f(K[0], JSON.stringify(view) === viewJson && JSON.stringify(mapStrings(v3.fixture.publicView, v3.actionMap)) === JSON.stringify(o.view) && JSON.stringify(v3.actionMap) === JSON.stringify(o.actionMap), 'not V3 transform + handle remap, or input mutated');
    f(K[1], hashWorld(world) === before && JSON.stringify(world) === worldJson, 'world changed');
    f(K[2], JSON.stringify(evaluateCounterfactualsSymmetricV1(world, { horizon })) === cfBefore, 'counterfactual changed');
    const ents = [...new Set(world.entities.map((e) => e.id))], ov = values(view), tv = values(o.view), names = Object.values(o.entityMap);
    const unmapped = [...new Set(ov.filter((s) => ents.includes(s) && !Object.hasOwn(o.entityMap, s)))], survivors = tv.filter((s) => ents.includes(s)), embedded = tv.filter((s) => !ents.includes(s) && ents.some((id) => id.length > 2 && s.includes(id)));
    f(K[3], unmapped.length === 0 && survivors.length === 0 && embedded.length === 0 && JSON.stringify(keyPaths(view)) === JSON.stringify(keyPaths(o.view)) && new Set(names).size === names.length && !ov.some((s) => names.includes(s)), { unmapped, survivors: survivors.slice(0, 3), embedded: embedded.slice(0, 3) });
    const handles = view.surface.map((e) => e.actionId), th = Object.values(o.actionMap), leak = tv.filter((s) => handles.includes(s) && !/^forge\//.test(s));
    const origConsistent = view.semantics.length === view.surface.length && view.semantics.every((s, i) => s.ACTION_ID === view.surface[i].actionId); if (origConsistent) originalSemanticsConsistent++;
    const twinConsistent = o.view.semantics.length === o.view.surface.length && o.view.semantics.every((s, i) => s.ACTION_ID === o.view.surface[i].actionId);
    f(K[4], new Set(th).size === handles.length && th.every((h) => /^opaque-\d+$/.test(h)) && JSON.stringify([...th].sort()) === JSON.stringify(o.view.surface.map((e) => e.actionId).sort()) && leak.length === 0 && (!origConsistent || twinConsistent), { leak: leak.slice(0, 3), origConsistent, twinConsistent });
    const ren = (x) => mapStrings(x, o.entityMap); let actionsOk = true;
    view.surface.forEach((e) => { const t = o.view.surface.find((x) => x.actionId === o.actionMap[e.actionId]); if (!t || t.actionType !== e.actionType || JSON.stringify(t.action) !== JSON.stringify(mapStrings(ren(e.action), o.actionMap)) || JSON.stringify(t.targetEntityId) !== JSON.stringify(ren(e.targetEntityId))) actionsOk = false; });
    const r0 = view.surface.find((e) => e.actionType === 'RETREAT'); if (r0) retreatWorlds++; const r1 = r0 ? o.view.surface.find((x) => x.actionId === o.actionMap[r0.actionId]) : null;
    f(K[5], actionsOk && (!r0 || (r1 && r1.actionType === 'RETREAT' && JSON.stringify(r1.action.parameters) === JSON.stringify(r0.action.parameters))), 'action payload mismatch');
    let row = null; try { row = nativeRowV3({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set() }); } catch (e) { failures.push({ seed: c.seed, cell, check: 'NATIVE_ROW_V3', detail: e.message }); mine.push('row'); }
    f(K[6], !!row && JSON.stringify(row.row.truth) === JSON.stringify(evaluateCounterfactualsSymmetricV1(world, { horizon }).branches.map((b) => ({ id: b.actionKey, utility: b.totalScalar }))), 'truth not original');
    const base = nativeLock(o.view, c.horizonBand).selections, scrambled = nativeLock(scrambleFingerprints(o.view), c.horizonBand).selections;
    f(K[7], JSON.stringify(privilegedKeyScan(o.view)) === JSON.stringify(privilegedKeyScan(view)) && JSON.stringify(keyPaths(o.view)) === JSON.stringify(keyPaths(view)) && JSON.stringify(scrambled) === JSON.stringify(base), 'hidden-information check failed');
    f(K[8], !!row && staticV3Nuisance && ['D4', 'IDENTITY', 'ORDER'].every((k) => Number.isFinite(row.row.nuisance[k].RB) && Number.isFinite(row.row.nuisance[k].RN)), 'nuisance');
    f(K[9], mine.length === 0, mine);
  }
  const verdict = staticV3Nuisance && K.every((k) => pass[k] === worlds) && failures.length === 0 ? 'O2R1_GATE_PASS' : 'O2R1_GATE_FAIL';
  writeExclusive(resolve(LANE, 'evidence/o2r1-gate.json'), { schema: 'STAGE3H_OWNER_GOVERNED_O2R1_GATE_V1', inheritanceHead: inh.head, population: 'STAGE3H1_CANONICAL_OPEN_NATIVE_V1 (development only)', worlds, retreatWorlds, originalSemanticsConsistent, staticV3Nuisance, passCounts: pass, failures, verdict, droppedCases: 0, authority: 'R0' });
  console.log(JSON.stringify({ verdict, worlds, retreatWorlds, originalSemanticsConsistent, staticV3Nuisance, passCounts: pass, failures: failures.slice(0, 4), failureCount: failures.length }, null, 1));
}
