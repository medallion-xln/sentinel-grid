// Phase 1 gate: O-2 nuisance contract validation, development worlds only (288 STAGE3H1 OPEN worlds, already evaluated).
// Answers the owner's seven questions for the IDENTITY twin bound by candidate 18ff522c, and validates the proposed
// observation-only correction O-2R. Writes evidence/o2-gate.json (wx). No prospective seed, no sealed data.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { hashWorld } from '../src/forge/kernel.js';
import { evaluateCounterfactualsSymmetricV1 } from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { canonicalActionKey } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { observableView, renameEntities } from '../scripts/stage3g/evidence.mjs';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { scoreSyntheticTruth, nuisanceDependence } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { nativeTwins, nativeLock } from './connector.mjs';
import { identityViewTwin, changedPaths, IDENTITY_VIEW_ID } from './identity-view.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const cite = (f, needle) => { const ls = readFileSync(resolve(GA, f), 'utf8').split('\n'), i = ls.findIndex((l) => l.includes(needle)); if (i < 0) throw Error('CITE:' + needle); return f + ':' + (i + 1); };
const truthOf = (world, horizon) => evaluateCounterfactualsSymmetricV1(world, { horizon }).branches.map((b) => ({ id: b.actionKey, utility: b.totalScalar }));
const rowOf = (id, lock, truth) => ({ id, band: lock.band, regime: lock.regime, selections: lock.selections, menu: lock.menu, truth, metrics: scoreSyntheticTruth(lock.selections, lock.menu, truth).metrics });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const t = { worlds: 0, v1: { operatesOn: 'NATIVE_WORLD', nativeTruthChanged: 0, retreatDestinationChanged: 0, nonRetreatKeyMapped: 0, nonRetreatActions: 0, menuSemanticBijection: 0, twinLocksLegal: 0 },
    o2r: { worldUntouched: 0, twinLocksLegal: 0, handleBijection: 0, retreatPreservedExactly: 0, retreatPresent: 0, onlyIdentityFieldsChanged: 0, inverseRestoresOriginal: 0, v3NuisanceDependenceUnchangedPasses: 0 }, changedKeySet: new Set(), byBand: {} };
  for (const c of openCombos().map(({ panel, ...x }) => x)) {
    const warm = runCalibratedWarmup(c.seed, (w) => generateScenarioSymmetricV1({ ...c, warmupTicks: w })), world = warm.world, horizon = warm.scenarioConfig.horizon, band = c.horizonBand;
    const before = hashWorld(world), view = observableView(world), lock = nativeLock(view, band), truth = truthOf(world, horizon), size = world.grid.width;
    t.worlds++; const b = (t.byBand[band] ??= { worlds: 0, v1NativeTruthChanged: 0, v1RetreatChanged: 0 }); b.worlds++;
    // Candidate 18ff522c IDENTITY twin (native world renamed, view and truth regenerated from the renamed world).
    const all = nativeTwins(world, view, band, horizon), id = all.find((v) => v.category === 'IDENTITY');
    if (id.lock.selections) t.v1.twinLocksLegal++;
    const T = Object.fromEntries(id.truth.map((x) => [x.id, x.utility]));
    if (truth.some((x) => T[id.actionMap[x.id]] !== x.utility)) { t.v1.nativeTruthChanged++; b.v1NativeTruthChanged++; }
    // Retreat destination in the renamed native world vs the original.
    const origRetreat = view.surface.find((e) => e.actionType === 'RETREAT');
    const ids = [...new Set(world.entities.map((e) => e.id))].sort(), map = Object.fromEntries(ids.map((x, i) => [x, 'entity-' + (ids.length - i)]));
    const iv = observableView(renameEntities(world, (x) => map[x] ?? x));
    const ir = iv.surface.find((e) => e.actionType === 'RETREAT');
    if (origRetreat && ir && (origRetreat.action.parameters.toX !== ir.action.parameters.toX || origRetreat.action.parameters.toY !== ir.action.parameters.toY)) { t.v1.retreatDestinationChanged++; b.v1RetreatChanged++; }
    let semantic = true;
    for (const e of view.surface) {
      if (e.actionType === 'RETREAT') { if (!ir || ir.action.parameters.toX !== e.action.parameters.toX || ir.action.parameters.toY !== e.action.parameters.toY) semantic = false; continue; }
      t.v1.nonRetreatActions++;
      const k = canonicalActionKey('R0', { ...e.action, actorId: map[e.action.actorId] ?? e.action.actorId, target: e.action.target ? { ...e.action.target, id: map[e.action.target.id] ?? e.action.target.id } : e.action.target }, size);
      if (iv.surface.some((x) => x.actionId === k)) t.v1.nonRetreatKeyMapped++; else semantic = false;
    }
    if (semantic) t.v1.menuSemanticBijection++;
    // Proposed O-2R: observation-only identity twin, original truth mapped through the handle bijection.
    const o = identityViewTwin(view);
    if (hashWorld(world) === before) t.o2r.worldUntouched++;
    const ol = nativeLock(o.view, band); if (ol.selections.R.every((x) => ol.menu.includes(x))) t.o2r.twinLocksLegal++;
    const vals = Object.values(o.actionMap); if (new Set(vals).size === vals.length && JSON.stringify([...vals].sort()) === JSON.stringify([...ol.menu].sort())) t.o2r.handleBijection++;
    if (origRetreat) { t.o2r.retreatPresent++; const tr = o.view.surface.find((e) => e.actionType === 'RETREAT'); if (tr && tr.actionId === o.actionMap[origRetreat.actionId] && tr.action.parameters.toX === origRetreat.action.parameters.toX && tr.action.parameters.toY === origRetreat.action.parameters.toY) t.o2r.retreatPreservedExactly++; }
    const paths = changedPaths(view, o.view); for (const p of paths) t.changedKeySet.add(p.replace(/\[\]/g, '[]'));
    const inv = Object.fromEntries(Object.entries(o.entityMap).map(([a, z]) => [z, a])), back = (x) => (typeof x === 'string' ? (inv[x] ?? x) : Array.isArray(x) ? x.map(back) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, val]) => [k, back(val)])) : x);
    const restored = back(o.view), handleBack = Object.fromEntries(Object.entries(o.actionMap).map(([a, z]) => [z, a])); restored.surface = restored.surface.map((e) => ({ ...e, actionId: handleBack[e.actionId] }));
    if (JSON.stringify(restored) === JSON.stringify(view)) t.o2r.inverseRestoresOriginal++;
    const twinTruth = truth.map((x) => ({ id: o.actionMap[x.id], utility: x.utility })), original = rowOf('u', lock, truth);
    const variants = [...all.filter((v) => v.category !== 'IDENTITY').map((v) => ({ category: v.category, transform: v.transform, actionMap: v.actionMap, row: rowOf('u', v.lock, v.truth) })),
      { category: 'IDENTITY', transform: 'IDENTITY', actionMap: o.actionMap, row: rowOf('u', ol, twinTruth) }];
    try { nuisanceDependence(original, variants); t.o2r.v3NuisanceDependenceUnchangedPasses++; } catch (e) { t.o2r.lastError = e.message; }
  }
  const changedKeys = [...t.changedKeySet].sort(); delete t.changedKeySet;
  const allowedLeaf = /\.(id|entityId|actorId|from|to|targetEntityId|actionId)$/;
  t.o2r.onlyIdentityFieldsChanged = changedKeys.every((p) => allowedLeaf.test(p)) ? t.worlds : 0;
  const v1Pass = t.v1.nativeTruthChanged === 0 && t.v1.menuSemanticBijection === t.worlds;
  const o2rPass = Object.entries(t.o2r).filter(([k]) => !['retreatPresent', 'retreatPreservedExactly', 'lastError'].includes(k)).every(([, v]) => v === t.worlds) && t.o2r.retreatPreservedExactly === t.o2r.retreatPresent;
  const out = {
    schema: 'STAGE3H_OWNER_GOVERNED_O2_GATE_V1', inheritanceHead: inh.head, population: 'STAGE3H1_CANONICAL_OPEN_NATIVE_V1 (development only)',
    sourceCause: { actionKey: cite('src/forge/kernel.js', 'return sha256([action.actionType, action.actorId, action.target, action.parameters])'), retreatTieBreak: cite('src/forge-symmetric/action-surface-symmetric-v1.js', 'const chosen = scored.filter((s) => s.distance === furthest).sort(byKey)[0]'), evaluatorOrder: cite('src/forge-symmetric/counterfactual-symmetric-v1.js', 'branches.sort((a, b) => (a.canonicalKey < b.canonicalKey'), candidateTwin: cite('stage3h-owner-governed-v1/connector.mjs', 'iw = renameEntities(world, name)') },
    questions: {
      '1_entityRenamingChangesNativeTruth': `YES: ${t.v1.nativeTruthChanged}/${t.worlds} development worlds (retreat mapped by type); retreat destination changed in ${t.v1.retreatDestinationChanged}/${t.worlds}`,
      '2_candidateNuisanceOperatesOnObservationsOnly': 'NO: candidate 18ff522c renames the NATIVE WORLD (renameEntities) and regenerates view, surface and truth from it',
      '3_publicInputsRemainLegal': `YES for the twin's own menu (${t.v1.twinLocksLegal}/${t.worlds}); but the twin menu is a different native action set where retreat moved`,
      '4_actionIdentitiesMapBijectively': `NOT SEMANTICALLY: full semantic bijection in ${t.v1.menuSemanticBijection}/${t.worlds}; the candidate forces the map by pairing RETREAT with RETREAT`,
      '5_retreatAndExceptionalActionsMapCorrectly': `NO: ${t.v1.retreatDestinationChanged} worlds pair the original retreat with a retreat to a different cell; all ${t.v1.nonRetreatKeyMapped}/${t.v1.nonRetreatActions} non-retreat actions map by renamed key`,
      '6_originalTruthUsedConsistently': 'PARTLY: O-2 scores against original truth, but the twin decisions were taken in a different native world (different menu and dynamics), so decisions and truth refer to different worlds',
      '7_statisticMeasuresOnlyTheDeclaredInvariance': 'NO: it confounds identity-label sensitivity with a change of native world',
    },
    gateCandidate18ff522c: v1Pass ? 'PASS' : 'NUISANCE_CONTRACT_BLOCKED',
    tallies: t, o2rChangedValuePaths: changedKeys,
    proposedCorrectionO2R: { id: IDENTITY_VIEW_ID, label: 'OBSERVATION_ONLY_IDENTITY_PERTURBATION', definition: 'V3 transformSyntheticFixture IDENTITY applied verbatim to the native public view: entity-id string values renamed, action handles made opaque; native world unchanged; original native truth mapped through the handle bijection; V3 nuisanceDependence used unchanged (O-2 withdrawn)', validation: o2rPass ? 'PASS' : 'FAIL' },
    authority: 'R0', newWorldPopulationsCreated: false, prospectiveSeedsTouched: false,
  };
  writeExclusive(resolve(LANE, 'evidence/o2-gate.json'), out);
  console.log(JSON.stringify({ gate: out.gateCandidate18ff522c, questions: out.questions, o2r: out.proposedCorrectionO2R.validation, tallies: t, changedKeys }, null, 1));
}
