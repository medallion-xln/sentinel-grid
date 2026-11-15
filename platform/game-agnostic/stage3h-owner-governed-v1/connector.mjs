// Native Forge World connector for STAGE3H_OWNER_GOVERNED_QUALIFICATION_V1.
// Binds the frozen V3 row contract to the frozen native functions WITHOUT changing either:
//   generation/warmup/admission  = stage3h1d confirm-core / V3 native-pipeline ports (identical calls, identical order)
//   policy lock                  = V3 runner.lockFrozenPolicies logic (Nexus packet, S0 full view, selectSets), equality-tested
//   scoring / introductions      = V3 runner.scoreSyntheticTruth (imported, unchanged)
//   nuisance values              = nuisance.mjs (V3 nuisanceDependence for D4/ORDER; amendment O-2 for IDENTITY) over NATIVE twins built from frozen
//                                  functions: orientWorld (D4), renameEntities (IDENTITY), surface+semantics reversal (ORDER)
// Every decision is locked before any counterfactual truth is computed. No public simulator call is made by any arm.
import { createWorld, hashWorld, isTerminal } from '../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { evaluateCounterfactualsSymmetricV1 } from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { ORIENTATIONS, orientWorld, orientAction, canonicalActionKey } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { observableView, renameEntities } from '../scripts/stage3g/evidence.mjs';
import { decisionPacket, invokeNexus } from '../stage3h-canonical-v1/adapters.mjs';
import { currentBaseline, S0_HASH } from '../stage3h-canonical-v1/baseline.mjs';
import { selectSets } from '../stage3h-activation-readiness-v2/runner-design.mjs';
import { scoreSyntheticTruth, digest } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { nuisanceOwnerV1 } from './nuisance.mjs';
import { deepFreeze, sha256, stableStringify } from '../src/core/determinism.js';

export const CONNECTOR_ID = 'STAGE3H_OWNER_GOVERNED_NATIVE_CONNECTOR_V1';
export const PROVENANCE = 'FORGE_NATIVE_OWNER_GOVERNED_V1';
const ok = (v, m) => { if (!v) throw Error(m); };
const setKey = (ids) => JSON.stringify([...ids].sort());
const bandOf = (steps) => (steps === 1 ? 'H0' : steps === 4 ? 'H2' : null);

/** Frozen policy lock on a native public view: identical logic and call order to V3 runner.lockFrozenPolicies. */
export function nativeLock(publicView, band) {
  ok(['H0', 'H2'].includes(band), 'OUTSIDE_FROZEN_DOMAIN');
  const view = deepFreeze(structuredClone(publicView)), before = digest(view);
  const packet = decisionPacket(view.observation, view.surface, { evaluationSteps: band === 'H0' ? 1 : 4 });
  const menu = packet.legalActions.map((a) => a.actionId);
  ok(menu.length && new Set(menu).size === menu.length && setKey(menu) === setKey(view.surface.map((a) => a.actionId)), 'NATIVE_MENU_MISMATCH');
  const started = performance.now();
  const nexus = invokeNexus(packet), baseline = currentBaseline(view), elapsedMs = performance.now() - started;
  ok(elapsedMs <= 1000 && baseline.modelHash === S0_HASH, 'COMPUTE_LIMIT_OR_SOURCE_MISMATCH');
  const selections = selectSets(band, baseline.selected, nexus.recommendedAction ? [nexus.recommendedAction] : null);
  for (const ids of Object.values(selections)) ok(Array.isArray(ids) && ids.length && new Set(ids).size === ids.length && ids.every((id) => menu.includes(id)), 'ILLEGAL_OR_DUPLICATE_SELECTION');
  ok(digest(view) === before, 'PUBLIC_INPUT_MUTATED');
  return { selections, menu, band, regime: packet.regime[0], decisionsHash: digest(selections), publicEnvelopeHashByArm: { R: before, B: before, N: before },
    compute: { S0Calls: 1, NexusCalls: 1, chargedCallsEachArm: { S0: 1, Nexus: 1 }, publicSimulatorCalls: 0, budgetMs: 1000, elapsedMs } };
}

/** Evaluator-only truth for a world, as {id, utility} over the offered menu (released only after decisions are locked). */
function nativeTruth(world, horizon, menu) {
  const t = evaluateCounterfactualsSymmetricV1(world, { horizon });
  ok(setKey(menu) === setKey(t.branches.map((b) => b.actionKey)), 'ACTION_SURFACE_MISMATCH');
  ok(t.branches.every((b) => Number.isFinite(b.totalScalar) && Number.isFinite(b.regret)), 'INVALID_NATIVE_TRUTH');
  return t.branches.map((b) => ({ id: b.actionKey, utility: b.totalScalar }));
}
const sizeOf = (world) => world.grid.width;
const renameAction = (action, name) => ({ ...action, actorId: name(action.actorId), target: action.target ? { ...action.target, id: name(action.target.id) } : action.target });

/** Native nuisance twins of one admitted world (each twin is the same unit, never an independent world). */
export function nativeTwins(world, view, band, horizon) {
  const size = sizeOf(world), variants = [];
  const evalTwin = (twinWorld, twinView, actionMap) => {
    const lock = nativeLock(twinView, band), truth = nativeTruth(twinWorld, horizon, lock.menu);
    return { lock, truth, actionMap };
  };
  for (const t of ORIENTATIONS) {
    const tw = orientWorld(t, world), tv = observableView(tw);
    const actionMap = Object.fromEntries(view.surface.map((e) => [e.actionId, canonicalActionKey('R0', orientAction(t, e.action, size), size)]));
    variants.push({ category: 'D4', transform: t, ...evalTwin(tw, tv, actionMap) });
  }
  const ids = [...new Set(world.entities.map((e) => e.id))].sort(), map = Object.fromEntries(ids.map((id, i) => [id, 'entity-' + (ids.length - i)]));
  const name = (id) => map[id] ?? id, iw = renameEntities(world, name), iv = observableView(iw);
  // O-2 correspondence: every action maps by its renamed canonical key, except RETREAT, whose native destination is
  // chosen with id-dependent tie-breaks; it maps to the twin's unique RETREAT (development: <=1 RETREAT per menu, 288/288).
  const ivMenu = new Set(iv.surface.map((e) => e.actionId)), twinRetreats = iv.surface.filter((e) => e.actionType === 'RETREAT');
  ok(twinRetreats.length <= 1 && view.surface.filter((e) => e.actionType === 'RETREAT').length <= 1, 'NON_UNIQUE_RETREAT');
  let retreatRemapped = false;
  const identityMap = Object.fromEntries(view.surface.map((e) => {
    const k = canonicalActionKey('R0', renameAction(e.action, name), size);
    if (ivMenu.has(k) || e.actionType !== 'RETREAT') return [e.actionId, k];
    ok(twinRetreats.length === 1, 'RETREAT_MISSING_IN_IDENTITY_TWIN'); retreatRemapped = true; return [e.actionId, twinRetreats[0].actionId];
  }));
  variants.push({ category: 'IDENTITY', transform: 'IDENTITY', retreatRemapped, ...evalTwin(iw, iv, identityMap) });
  const ov = { ...view, surface: [...view.surface].reverse(), semantics: [...view.semantics].reverse() };
  variants.push({ category: 'ORDER', transform: 'ORDER', ...evalTwin(world, ov, Object.fromEntries(view.surface.map((e) => [e.actionId, e.actionId]))) });
  return variants;
}

/** One scheduled world -> one analysis row + one identity-ledger entry, or an unreplaced rejection record. */
export function nativeRow(combo, ctx) {
  const { seed, population, cell, ...axes } = combo;
  const warm = runCalibratedWarmup(seed, (warmupTicks) => generateScenarioSymmetricV1({ ...axes, seed, warmupTicks })), config = warm.scenarioConfig;
  const initial = createWorld(seed, config), validation = validateScenarioV2(initial, config), world = warm.world;
  const id = sha256({ population, ...combo });
  if (!validation.valid || isTerminal(world) || !warm.taskPreserved) return { rejected: { id, population, cell, band: axes.horizonBand, reason: !validation.valid ? 'VALIDATOR_INVALID' : isTerminal(world) ? 'TERMINAL_AFTER_WARMUP' : 'TASK_NOT_PRESERVED' } };
  const before = hashWorld(world);
  ok(!ctx.seen.has(before), 'DUPLICATE_WORLD_HASH'); ctx.seen.add(before);
  if (ctx.prior?.has(before)) return { rejected: { id, population, cell, band: axes.horizonBand, reason: 'PRIOR_WORLD_EXCLUDED' } };
  const view = observableView(world), steps = config.horizon + 1, band = bandOf(steps);
  ok(band === axes.horizonBand, 'PACKET_HORIZON_MISMATCH');
  const lock = nativeLock(view, band), decisionsHash = lock.decisionsHash;
  // All R/B/N decisions are locked. Only now is evaluator truth computed (original, then twins).
  const truth = nativeTruth(world, config.horizon, lock.menu);
  ok(digest(lock.selections) === decisionsHash && hashWorld(world) === before, 'TRUTH_RELEASE_MUTATED_SOURCE_OR_SELECTION');
  const scored = scoreSyntheticTruth(lock.selections, lock.menu, truth);
  const original = { id, band, regime: lock.regime, selections: lock.selections, menu: lock.menu, truth, metrics: scored.metrics };
  const variants = ctx.twins === false ? null : nativeTwins(world, view, band, config.horizon).map((v) => ({ category: v.category, transform: v.transform, actionMap: v.actionMap, retreatRemapped: v.retreatRemapped ?? false,
    row: { id, band: v.lock.band, regime: v.lock.regime, selections: v.lock.selections, menu: v.lock.menu, truth: v.truth, metrics: scoreSyntheticTruth(v.lock.selections, v.lock.menu, v.truth).metrics } }));
  const nd = variants ? nuisanceOwnerV1(original, variants) : null, nuisance = nd ? nd.values : null, identityRetreatRemapped = variants ? variants.find((v) => v.category === 'IDENTITY').retreatRemapped : null;
  return {
    row: { provenance: PROVENANCE, id, cell, band, regime: lock.regime, selections: lock.selections, menu: lock.menu, truth, metrics: scored.metrics,
      introductionB: scored.introductionB, introductionN: scored.introductionN, nuisance, identityTruthInvariant: nd ? nd.identityTruthInvariant : null, identityRetreatRemapped, decisionsHash, publicEnvelopeHashByArm: lock.publicEnvelopeHashByArm, compute: lock.compute },
    ledger: { id, population, cell, seed, worldHash: before, orientation: config.orientation, warmupTicks: warm.warmupTicks, truncated: warm.truncated ?? null },
  };
}

/** Deterministic schedule from the frozen V3 population design: one unique integer seed per scheduled world. */
export function schedule(populations, base) {
  ok(Number.isSafeInteger(base) && base > 0, 'INVALID_NAMESPACE_BASE');
  const out = []; let k = 0;
  for (const [population, p] of Object.entries(populations)) {
    const a = p.axes;
    for (const shape of a.shapes) for (const roles of a.roles) for (const objectives of a.objectives) for (const horizonBand of a.horizonBands) for (const level of a.levels) {
      const cell = [shape, roles, objectives, horizonBand, level].join('/');
      for (let r = 0; r < p.repetitionsPerCell; r++) out.push({ population, cell, shape, roles, objectives, horizonBand, level, seed: base + k++ });
    }
  }
  return out;
}
export const scheduleHash = (s) => sha256(stableStringify(s));
