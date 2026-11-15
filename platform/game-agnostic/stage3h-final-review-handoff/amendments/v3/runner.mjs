// Source-faithful public-policy/record components; all executable paths require handcrafted fixtures.
// Native generation, warmup, counterfactual evaluation, allocation and sealed execution are absent.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decisionPacket, invokeNexus } from '../../../stage3h-canonical-v1/adapters.mjs';
import { currentBaseline, S0_HASH } from '../../../stage3h-canonical-v1/baseline.mjs';
import { score as frozenScore } from '../../../stage3h-canonical-v1/metrics.mjs';
import { stableStringify, deepFreeze } from '../../../src/core/determinism.js';
import { ORIENTATIONS, orientCell, orientAction } from '../../../src/forge-symmetric/orientation-symmetric-v1.js';
import { selectSets, potentialIntroduction } from '../../../stage3h-activation-readiness-v2/runner-design.mjs';
const ok = (v, m) => { if (!v) throw Error(m); };
export const digest = x => createHash('sha256').update(stableStringify(x)).digest('hex');
const setKey = ids => JSON.stringify([...ids].sort());
const legal = (ids, menu) => ok(Array.isArray(ids) && ids.length && new Set(ids).size === ids.length && ids.every(id => menu.includes(id)), 'ILLEGAL_OR_DUPLICATE_SELECTION');
const fixtureOnly = f => ok(f.synthetic === true && !('seed' in f) && !('world' in f), 'SYNTHETIC_FIXTURE_ONLY');
export function lockFrozenPolicies(f) {
  fixtureOnly(f);
  ok(['H0', 'H2'].includes(f.band), 'OUTSIDE_FROZEN_DOMAIN');
  const view = deepFreeze(structuredClone(f.publicView)), before = digest(view);
  const packet = decisionPacket(view.observation, view.surface, { evaluationSteps: f.band === 'H0' ? 1 : 4 });
  const menu = packet.legalActions.map(a => a.actionId);
  ok(menu.length && new Set(menu).size === menu.length && setKey(menu) === setKey(view.surface.map(a => a.actionId)), 'NATIVE_MENU_MISMATCH');
  const started = performance.now();
  // Frozen order, interfaces and shared cache from confirm-core: Nexus packet then S0 full view.
  const nexus = invokeNexus(packet), baseline = currentBaseline(view), elapsedMs = performance.now() - started;
  ok(elapsedMs <= 1000 && baseline.modelHash === S0_HASH, 'COMPUTE_LIMIT_OR_SOURCE_MISMATCH');
  const selections = selectSets(f.band, baseline.selected, nexus.recommendedAction ? [nexus.recommendedAction] : null);
  Object.values(selections).forEach(ids => legal(ids, menu));
  ok(digest(view) === before, 'PUBLIC_INPUT_MUTATED');
  return { selections, menu, band: f.band, regime: packet.regime[0], decisionsHash: digest(selections),
    publicEnvelopeHashByArm: { R: before, B: before, N: before },
    policyInterfaceLedger: { N: 'FROZEN_NEXUS_PACKET', B: 'FROZEN_S0_FULL_PUBLIC_VIEW', R: 'FROZEN_HORIZON_SELECTION_OF_CACHED_OUTPUTS' },
    compute: { S0Calls: 1, NexusCalls: 1, columns: baseline.columns, conditionalSearchBudget: baseline.conditionalSearchBudget, conditionalSearchDepth: baseline.conditionalSearchDepth,
      chargedCallsEachArm: { S0: 1, Nexus: 1 }, publicSimulatorCalls: 0, budgetMs: 1000, elapsedMs } };
}
export function scoreSyntheticTruth(selections, menu, truth) {
  ok(truth.length === menu.length && new Set(truth.map(b => b.id)).size === truth.length && setKey(truth.map(b => b.id)) === setKey(menu), 'TRUTH_MENU_MISMATCH');
  ok(truth.every(b => Number.isFinite(b.utility)), 'NONFINITE_TRUTH');
  const max = Math.max(...truth.map(b => b.utility)), spread = max - Math.min(...truth.map(b => b.utility));
  const native = { utilitySpread: spread, branches: truth.map(b => ({ actionKey: b.id, regret: max - b.utility })) };
  const metrics = Object.fromEntries(['R', 'B', 'N'].map(arm => {
    legal(selections[arm], menu);
    const s = frozenScore(selections[arm], native);
    return [arm, { nreg: s.normalizedRegret, regret: s.regret, cat: s.catastrophic, hit: s.hit }];
  }));
  return { metrics, introductionB: potentialIntroduction(selections.R, selections.B, truth), introductionN: potentialIntroduction(selections.R, selections.N, truth) };
}
export function runSyntheticNative(f) {
  fixtureOnly(f);
  // Admission precedes packet/policy calls; no truth callback may run on a rejection.
  ok(f.admission && typeof f.admission.validatorValid === 'boolean' && typeof f.admission.terminal === 'boolean' && typeof f.admission.taskPreserved === 'boolean', 'MISSING_ADMISSION');
  if (!f.admission.validatorValid || f.admission.terminal || !f.admission.taskPreserved) {
    ok(typeof f.admission.reason === 'string' && f.admission.reason.length, 'MISSING_REJECTION_REASON');
    return { synthetic: true, id: f.id, cell: f.cell, band: f.band, rejected: true, reason: f.admission.reason, publicPolicyCalls: 0, replacementAllowed: false };
  }
  const lock = lockFrozenPolicies(f), lockHash = digest(lock.selections), events = ['ADMISSION_PASS', 'ALL_DECISIONS_LOCKED'];
  const truth = f.releaseSyntheticTruth(deepFreeze({ decisionsHash: lockHash, events: [...events] }));
  ok(digest(lock.selections) === lockHash, 'DECISIONS_MUTATED_AFTER_LOCK');
  events.push('SYNTHETIC_TRUTH_RELEASED');
  return { synthetic: true, id: f.id, cell: f.cell, rejected: false, ...lock, ...scoreSyntheticTruth(lock.selections, lock.menu, truth), events };
}
export function admissionReport(rows, schedule) {
  ok(rows.length && Object.keys(schedule).length, 'EMPTY_SCHEDULE');
  const ids = rows.map(r => r.id);
  ok(ids.every(x => typeof x === 'string' && x.length) && new Set(ids).size === ids.length, 'DUPLICATE_OR_MISSING_UNIT');
  ok(rows.every(r => Object.hasOwn(schedule, r.cell) && schedule[r.cell].band === r.band && typeof r.rejected === 'boolean'), 'UNSCHEDULED_OR_INVALID_UNIT');
  const cells = {};
  for (const [key, spec] of Object.entries(schedule)) {
    ok(Number.isInteger(spec.scheduled) && spec.scheduled > 0 && ['H0', 'H2'].includes(spec.band), 'INVALID_SCHEDULE');
    const all = rows.filter(r => r.cell === key), accepted = all.filter(r => !r.rejected).length;
    ok(all.length === spec.scheduled && all.every(r => !r.rejected || typeof r.reason === 'string' && r.reason.length), 'UNRECONCILED_SCHEDULE_OR_REJECTION');
    cells[key] = { ...spec, accepted, rejected: all.length - accepted };
  }
  const cs = Object.values(cells), accepted = cs.reduce((s, c) => s + c.accepted, 0);
  const effectiveN = cs.every(c => c.accepted > 0) ? 1 / cs.reduce((s, c) => s + 1 / (cs.length ** 2 * c.accepted), 0) : 0;
  const perBand = Object.fromEntries(['H0', 'H2'].map(band => {
    const subset = cs.filter(c => c.band === band), n = subset.reduce((s, c) => s + c.accepted, 0), scheduled = subset.reduce((s, c) => s + c.scheduled, 0);
    return [band, { accepted: n, scheduled, pass: scheduled > 0 && n / scheduled >= 0.9 }];
  }));
  return { cells, accepted, effectiveN, perBand, pass: accepted / rows.length >= 0.9 && cs.every(c => c.accepted >= Math.ceil(0.5 * c.scheduled)) && effectiveN >= 2100 && Object.values(perBand).every(b => b.pass), replacementAllowed: false };
}
export function nuisanceDependence(original, variants) {
  const verifyScoring = row => {
    const scored = scoreSyntheticTruth(row.selections, row.menu, row.truth);
    ok(digest(scored.metrics) === digest(row.metrics), 'NUISANCE_METRICS_NOT_FROM_TRUTH');
  };
  verifyScoring(original);
  const byCategory = {};
  for (const category of ['D4', 'IDENTITY', 'ORDER']) {
    const vs = variants.filter(v => v.category === category);
    const expected = category === 'D4' ? ORIENTATIONS : [category];
    ok(vs.length === expected.length && setKey(vs.map(v => v.transform)) === setKey(expected), 'MISSING_OR_DUPLICATE_NUISANCE');
    for (const v of vs) {
      ok(v.row.id === original.id && v.row.band === original.band && v.row.regime === original.regime, 'NUISANCE_UNIT_OR_STRATUM_CHANGED');
      ok(setKey(Object.keys(v.actionMap)) === setKey(original.menu) && setKey(Object.values(v.actionMap)) === setKey(v.row.menu), 'INCOMPLETE_ACTION_BIJECTION');
      ok(new Set(Object.values(v.actionMap)).size === original.menu.length, 'NONBIJECTIVE_ACTION_MAP');
      ok(original.truth.length === original.menu.length && v.row.truth.length === v.row.menu.length, 'MISSING_NUISANCE_TRUTH');
      ok(setKey(original.truth.map(x => x.id)) === setKey(original.menu) && setKey(v.row.truth.map(x => x.id)) === setKey(v.row.menu), 'NUISANCE_TRUTH_MENU_MISMATCH');
      ok(original.truth.every(t => v.row.truth.find(x => x.id === v.actionMap[t.id])?.utility === t.utility), 'NUISANCE_TRUTH_CHANGED');
      // Identity renaming may legitimately change lexical decisions. Measure it; do not force equal selections.
      Object.values(v.row.selections).forEach(ids => legal(ids, v.row.menu));
      verifyScoring(v.row);
    }
    byCategory[category] = Object.fromEntries(['RB', 'RN'].map(key => {
      const baseline = key === 'RB' ? 'B' : 'N', diff = r => r.metrics.R.nreg - r.metrics[baseline].nreg;
      return [key, Math.max(...vs.map(v => Math.abs(diff(original) - diff(v.row))))];
    }));
  }
  return { values: byCategory, independentUnitCount: 1, variantsAreIndependentWorlds: false };
}
// Handcrafted public-view fixture transforms. These do not certify generation/rendering of native twins.
export function transformSyntheticFixture(f, category, transform) {
  fixtureOnly(f);
  ok(['D4', 'IDENTITY', 'ORDER'].includes(category), 'UNKNOWN_NUISANCE');
  const v = structuredClone(f.publicView), originalMenu = v.surface.map(e => e.actionId);
  const actionMap = Object.fromEntries(originalMenu.map((id, i) => [id, category === 'IDENTITY' ? `opaque-${originalMenu.length - i}` : id]));
  if (category === 'D4') {
    ok(ORIENTATIONS.includes(transform) && v.visibleMap.width === v.visibleMap.height, 'INVALID_D4_FIXTURE');
    const size = v.visibleMap.width, cell = p => orientCell(transform, p, size), terrain = [...v.visibleMap.terrain];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const p = cell({ x, y }); v.visibleMap.terrain[p.y * size + p.x] = terrain[y * size + x]; }
    v.visibleMap.entities = v.visibleMap.entities.map(e => ({ ...e, position: cell(e.position) }));
    v.state.actor.observedPosition = cell(v.state.actor.observedPosition);
    v.state.entities = v.state.entities.map(e => ({ ...e, observedPosition: cell(e.observedPosition) }));
    v.surface = v.surface.map(e => ({ ...e, action: orientAction(transform, e.action, size) }));
  }
  if (category === 'IDENTITY') {
    const identities = new Set([v.state.actor.entityId, ...v.observation.metadata.canonicalState.entities.map(e => e.id), ...v.observation.metadata.objectives.flatMap(o => [o.id, o.entityId])]);
    const map = Object.fromEntries([...identities].sort().map((id, i) => [id, `entity-${identities.size - i}`]));
    const rename = x => typeof x === 'string' ? (map[x] ?? x) : Array.isArray(x) ? x.map(rename) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, val]) => [k, rename(val)])) : x;
    Object.assign(v, rename(v));
    v.surface = v.surface.map((e, i) => ({ ...e, actionId: actionMap[originalMenu[i]] }));
  }
  if (category === 'ORDER') v.surface.reverse();
  return { fixture: { ...f, publicView: v, releaseSyntheticTruth: args => f.releaseSyntheticTruth(args).map(t => ({ ...t, id: actionMap[t.id] })) }, actionMap };
}
export function runtimeIdentity() {
  return { versions: { ...process.versions }, platform: `${process.platform}/${process.arch}`, execArgv: [...process.execArgv], nodeBinarySha256: createHash('sha256').update(readFileSync(process.execPath)).digest('hex') };
}
export function assertRuntimeIdentity(expected, observed = runtimeIdentity()) {
  ok(expected && expected.versions && expected.platform && Array.isArray(expected.execArgv) && /^[a-f0-9]{64}$/.test(expected.nodeBinarySha256 ?? ''), 'EXACT_RUNTIME_CONTRACT_REQUIRED');
  ok(digest(expected) === digest(observed), 'RUNTIME_IDENTITY_MISMATCH'); return true;
}
export function campaignEntryPoint() { throw Error('EXECUTION_DISABLED_NO_ACTIVE_REGISTRATION_NO_AUTHORIZED_NATIVE_OR_SEALED_INPUT'); }
