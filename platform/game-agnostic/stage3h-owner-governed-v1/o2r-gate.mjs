// Phase 1 (renewed authorization): the ten-point O-2R gate for candidate e70625d1, over the 288 STAGE3H1 OPEN
// development worlds (already evaluated; no prospective seed). Every point is checked per world; any failure is recorded,
// none is dropped. Writes evidence/o2r-gate.json (wx).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { hashWorld } from '../src/forge/kernel.js';
import { evaluateCounterfactualsSymmetricV1 } from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { privilegedKeyScan } from '../src/stage3g/observable-entity-state-v1.js';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { transformSyntheticFixture } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { nativeRowV2 } from './connector-v2.mjs';
import { nativeLock } from './connector.mjs';
import { identityViewTwin } from './identity-view.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const strings = (x, out = []) => { if (typeof x === 'string') out.push(x); else if (Array.isArray(x)) x.forEach((v) => strings(v, out)); else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, out)); return out; };
const ID_FIELDS = new Set(['id', 'entityId', 'actorId', 'from', 'to', 'otherEntityId', 'targetEntityId', 'SOURCE_ENTITY', 'TARGET_ENTITY', 'actor', 'target']);
const idValues = (x, out = new Set(), key = null) => { if (typeof x === 'string') { if (ID_FIELDS.has(key)) out.add(x); } else if (Array.isArray(x)) x.forEach((v) => idValues(v, out, key)); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) idValues(v, out, k); return out; };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const src = readFileSync(resolve(LANE, 'identity-view.mjs'), 'utf8'), c2 = readFileSync(resolve(LANE, 'connector-v2.mjs'), 'utf8');
  const fnSrc = src.slice(src.indexOf('export function identityViewTwin'), src.indexOf('/** Paths whose value changed'));
  const staticChecks = {
    signatureTakesPublicViewOnly: /export function identityViewTwin\(publicView\)/.test(fnSrc),
    noImportsInTransformModule: !/^import /m.test(src),
    noKernelOrEvaluatorCallInTransform: !/(step|createWorld|evaluateCounterfactuals|orientWorld|renameEntities|hashWorld)\(/.test(fnSrc),
    identityTwinUsesOriginalTruth: c2.includes("truth.map((x) => ({ id: iv.actionMap[x.id], utility: x.utility }))"),
    v3NuisanceFunctionImportedUnchanged: c2.includes("import { scoreSyntheticTruth, nuisanceDependence, digest } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs'") && c2.includes('nuisanceDependence(original, variants).values'),
    v3RunnerBytesBoundByV3ReviewTarget: JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/review-target.json'), 'utf8')).bindings['runner.mjs'] === createHash('sha256').update(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/runner.mjs'))).digest('hex'),
  };
  const keys = ['1_publicObservationOnly', '2_nativeStateUnchanged', '3_nativeTransitionsRewardsUnchanged', '4_identifiersConsistentlyRenamed', '5_handlesOpaqueAndBijective', '6_retreatAndAllActionsSemanticsPreserved', '7_originalTruthAuthoritative', '8_noHiddenInformation', '9_exactV3Statistic', '10_developmentWitnessPasses'];
  const pass = Object.fromEntries(keys.map((k) => [k, 0])), failures = [];
  let worlds = 0, retreatWorlds = 0, privilegedHitsInOriginalView = null;
  for (const c of openCombos().map(({ panel, ...x }) => x)) {
    worlds++;
    const warm = runCalibratedWarmup(c.seed, (w) => generateScenarioSymmetricV1({ ...c, warmupTicks: w })), world = warm.world, horizon = warm.scenarioConfig.horizon;
    const before = hashWorld(world), worldJson = JSON.stringify(world), view = observableView(world), viewJson = JSON.stringify(view);
    const truthBefore = JSON.stringify(evaluateCounterfactualsSymmetricV1(world, { horizon }));
    const o = identityViewTwin(view), f = (k, ok, detail) => { if (ok) pass[k]++; else failures.push({ seed: c.seed, cell: [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/'), check: k, detail }); };
    // 1. Operates on the public view only (input view untouched; output identical to V3's own IDENTITY transform).
    const v3 = transformSyntheticFixture({ synthetic: true, publicView: view, releaseSyntheticTruth: () => [] }, 'IDENTITY', 'IDENTITY');
    f(keys[0], JSON.stringify(view) === viewJson && JSON.stringify(v3.fixture.publicView) === JSON.stringify(o.view) && JSON.stringify(v3.actionMap) === JSON.stringify(o.actionMap), 'differs from V3 transform or mutated input view');
    // 2. Native state unchanged.
    f(keys[1], hashWorld(world) === before && JSON.stringify(world) === worldJson, 'world changed');
    // 3. Native transitions and rewards unchanged: the original world's counterfactual result is byte-identical after the twin.
    f(keys[2], JSON.stringify(evaluateCounterfactualsSymmetricV1(world, { horizon })) === truthBefore, 'native counterfactual changed');
    // 4. Consistent renaming: every id-bearing value of the original is an entity id mapped by the twin; none survives; map injective.
    const origIds = idValues(view), twinIds = idValues(o.view), mapped = Object.keys(o.entityMap), targets = Object.values(o.entityMap);
    const coverage = [...origIds].every((id) => mapped.includes(id)), survivors = strings(o.view).filter((s) => mapped.includes(s));
    f(keys[3], coverage && survivors.length === 0 && new Set(targets).size === targets.length && [...twinIds].every((x) => targets.includes(x)) && !strings(view).some((s) => targets.includes(s)), { uncovered: [...origIds].filter((id) => !mapped.includes(id)), survivors: survivors.slice(0, 3) });
    // 5. Opaque, bijective handles; no original handle leaks anywhere in the twin view.
    const handles = view.surface.map((e) => e.actionId), tvals = Object.values(o.actionMap), leak = strings(o.view).filter((s) => handles.includes(s) && !/^forge\//.test(s));
    f(keys[4], new Set(tvals).size === handles.length && tvals.every((h) => /^opaque-\d+$/.test(h)) && JSON.stringify([...tvals].sort()) === JSON.stringify(o.view.surface.map((e) => e.actionId).sort()) && leak.length === 0, { leak: leak.slice(0, 3) });
    // 6. Every original action maps to exactly its renamed counterpart (same type, parameters, renamed actor/target); retreat exact.
    const ren = (x) => (typeof x === 'string' ? (o.entityMap[x] ?? x) : Array.isArray(x) ? x.map(ren) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, ren(v)])) : x);
    let actionsOk = true;
    view.surface.forEach((e) => { const t = o.view.surface.find((x) => x.actionId === o.actionMap[e.actionId]); if (!t || JSON.stringify(t.action) !== JSON.stringify(ren(e.action)) || t.actionType !== e.actionType || JSON.stringify(t.targetEntityId) !== JSON.stringify(ren(e.targetEntityId))) actionsOk = false; });
    const r0 = view.surface.find((e) => e.actionType === 'RETREAT'); if (r0) retreatWorlds++;
    const r1 = r0 ? o.view.surface.find((x) => x.actionId === o.actionMap[r0.actionId]) : null;
    f(keys[5], actionsOk && (!r0 || (r1.actionType === 'RETREAT' && JSON.stringify(r1.action.parameters) === JSON.stringify(r0.action.parameters))), 'action payload mismatch');
    // 7 and 9. Row from the V2 connector: identity twin scored with the original truth, nuisance from unchanged V3 function.
    let row = null; try { row = nativeRowV2({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set() }); } catch (e) { failures.push({ seed: c.seed, check: 'NATIVE_ROW_V2', detail: e.message }); }
    const lock = nativeLock(o.view, c.horizonBand);
    f(keys[6], !!row && lock.menu.every((id) => tvals.includes(id)) && row.row.truth.every((t) => Number.isFinite(t.utility)) && JSON.stringify(row.row.truth) === JSON.stringify(evaluateCounterfactualsSymmetricV1(world, { horizon }).branches.map((b) => ({ id: b.actionKey, utility: b.totalScalar }))), 'truth not original');
    // 8. No hidden information: the twin is a function of the public view only, adds no key, and passes the frozen privileged-key scan.
    const keySet = (x, p = '$', out = new Set()) => { if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { const q = p + (Array.isArray(x) ? '[]' : '.' + k); out.add(q); keySet(v, q, out); } return out; };
    const scanTwin = privilegedKeyScan(o.view), scanOrig = privilegedKeyScan(view);
    f(keys[7], Array.isArray(scanTwin) && JSON.stringify([...keySet(o.view)].sort()) === JSON.stringify([...keySet(view)].sort()) && JSON.stringify(scanTwin) === JSON.stringify(scanOrig), { scanTwin: scanTwin.slice(0, 3), scanOrig: scanOrig.slice(0, 3) });
    if (worlds === 1) privilegedHitsInOriginalView = scanOrig.length;
    f(keys[8], !!row && staticChecks.v3NuisanceFunctionImportedUnchanged && ['D4', 'IDENTITY', 'ORDER'].every((k) => Number.isFinite(row.row.nuisance[k].RB) && Number.isFinite(row.row.nuisance[k].RN)), 'nuisance missing');
    f(keys[9], keys.slice(0, 9).every((k) => !failures.some((x) => x.seed === c.seed && x.cell === [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/') && x.check === k)) && !!row, 'witness failed');
  }
  const allPass = Object.values(staticChecks).every(Boolean) && keys.every((k) => pass[k] === worlds) && failures.length === 0;
  const out = { schema: 'STAGE3H_OWNER_GOVERNED_O2R_GATE_V1', candidate: 'e70625d137a93c5321dd96b53b59ec99b960811cbe67d2f699a01e7a5ed1f720', inheritanceHead: inh.head, population: 'STAGE3H1_CANONICAL_OPEN_NATIVE_V1 (development only)',
    worlds, retreatWorlds, privilegedHitsInOriginalViewFirstWorld: privilegedHitsInOriginalView, staticChecks, passCounts: pass, failures, verdict: allPass ? 'O2R_GATE_PASS' : 'O2R_GATE_FAIL', droppedCases: 0, authority: 'R0' };
  writeExclusive(resolve(LANE, 'evidence/o2r-gate.json'), out);
  console.log(JSON.stringify({ verdict: out.verdict, worlds, retreatWorlds, privilegedHitsInOriginalViewFirstWorld: privilegedHitsInOriginalView, staticChecks, passCounts: pass, failures: failures.slice(0, 5), failureCount: failures.length }, null, 1));
}
