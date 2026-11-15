// Native connector V3 (proposed correction O-2R.1; requires owner approval). Derived from connector-v2.mjs by explicit
// substitution: the IDENTITY twin uses identity-view-v2.mjs (handles opaque everywhere). Everything else is identical.
// Original V2 header follows.
// Native connector V2 (proposed correction O-2R; requires renewed owner approval). Differs from connector.mjs ONLY in the
// IDENTITY nuisance twin: V2 uses the observation-only V3 IDENTITY transform (identity-view.mjs) on the native public view,
// with the native world untouched and the original native truth mapped through the handle bijection. ORDER is also
// observation-only and uses the original truth. D4 remains a native world orientation with recomputed truth, asserted
// truth-invariant. Nuisance values come from V3 runner.nuisanceDependence UNCHANGED (amendment O-2 withdrawn).
// connector.mjs (bound by candidate 18ff522c) is imported, never edited.
import { createWorld, hashWorld, isTerminal } from '../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { evaluateCounterfactualsSymmetricV1 } from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { ORIENTATIONS, orientWorld, orientAction, canonicalActionKey } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { scoreSyntheticTruth, nuisanceDependence, digest } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { sha256 } from '../src/core/determinism.js';
import { nativeLock, PROVENANCE } from './connector.mjs';
import { identityViewTwinV2 as identityViewTwin, IDENTITY_VIEW_V2_ID as IDENTITY_VIEW_ID } from './identity-view-v2.mjs';

export const CONNECTOR_V3_ID = 'STAGE3H_OWNER_GOVERNED_NATIVE_CONNECTOR_V3_O2R1';
const ok = (v, m) => { if (!v) throw Error(m); };
const setKey = (ids) => JSON.stringify([...ids].sort());
const bandOf = (steps) => (steps === 1 ? 'H0' : steps === 4 ? 'H2' : null);
function nativeTruth(world, horizon, menu) {
  const t = evaluateCounterfactualsSymmetricV1(world, { horizon });
  ok(setKey(menu) === setKey(t.branches.map((b) => b.actionKey)), 'ACTION_SURFACE_MISMATCH');
  ok(t.branches.every((b) => Number.isFinite(b.totalScalar) && Number.isFinite(b.regret)), 'INVALID_NATIVE_TRUTH');
  return t.branches.map((b) => ({ id: b.actionKey, utility: b.totalScalar }));
}
const row = (id, lock, truth) => ({ id, band: lock.band, regime: lock.regime, selections: lock.selections, menu: lock.menu, truth, metrics: scoreSyntheticTruth(lock.selections, lock.menu, truth).metrics });

/** Nuisance twins V2: D4 native (truth recomputed), IDENTITY and ORDER observation-only (original truth mapped). */
export function nativeTwinsV3(world, view, band, horizon, truth, id) {
  const size = world.grid.width, variants = [];
  for (const t of ORIENTATIONS) {
    const tw = orientWorld(t, world), lock = nativeLock(observableView(tw), band);
    const actionMap = Object.fromEntries(view.surface.map((e) => [e.actionId, canonicalActionKey('R0', orientAction(t, e.action, size), size)]));
    variants.push({ category: 'D4', transform: t, actionMap, row: row(id, lock, nativeTruth(tw, horizon, lock.menu)), mode: 'NATIVE_WORLD_ORIENTATION' });
  }
  const iv = identityViewTwin(view), il = nativeLock(iv.view, band);
  variants.push({ category: 'IDENTITY', transform: 'IDENTITY', actionMap: iv.actionMap, row: row(id, il, truth.map((x) => ({ id: iv.actionMap[x.id], utility: x.utility }))), mode: 'OBSERVATION_ONLY' });
  const ov = { ...view, surface: [...view.surface].reverse(), semantics: [...view.semantics].reverse() }, ol = nativeLock(ov, band);
  variants.push({ category: 'ORDER', transform: 'ORDER', actionMap: Object.fromEntries(view.surface.map((e) => [e.actionId, e.actionId])), row: row(id, ol, truth), mode: 'OBSERVATION_ONLY' });
  return variants;
}

/** One scheduled world -> one analysis row + ledger entry, or an unreplaced rejection (same contract as connector.mjs). */
export function nativeRowV3(combo, ctx) {
  const { seed, population, cell, ...axes } = combo;
  const warm = runCalibratedWarmup(seed, (warmupTicks) => generateScenarioSymmetricV1({ ...axes, seed, warmupTicks })), config = warm.scenarioConfig;
  const initial = createWorld(seed, config), validation = validateScenarioV2(initial, config), world = warm.world;
  const id = sha256({ population, ...combo });
  if (!validation.valid || isTerminal(world) || !warm.taskPreserved) return { rejected: { id, population, cell, band: axes.horizonBand, reason: !validation.valid ? 'VALIDATOR_INVALID' : isTerminal(world) ? 'TERMINAL_AFTER_WARMUP' : 'TASK_NOT_PRESERVED' } };
  const before = hashWorld(world);
  ok(!ctx.seen.has(before), 'DUPLICATE_WORLD_HASH'); ctx.seen.add(before);
  if (ctx.prior?.has(before)) return { rejected: { id, population, cell, band: axes.horizonBand, reason: 'PRIOR_WORLD_EXCLUDED' } };
  const view = observableView(world), band = bandOf(config.horizon + 1);
  ok(band === axes.horizonBand, 'PACKET_HORIZON_MISMATCH');
  const lock = nativeLock(view, band), decisionsHash = lock.decisionsHash;
  // All R/B/N decisions are locked. Only now is evaluator truth computed (original, then D4 twins).
  const truth = nativeTruth(world, config.horizon, lock.menu);
  ok(digest(lock.selections) === decisionsHash && hashWorld(world) === before, 'TRUTH_RELEASE_MUTATED_SOURCE_OR_SELECTION');
  const scored = scoreSyntheticTruth(lock.selections, lock.menu, truth), original = row(id, lock, truth);
  const variants = ctx.twins === false ? null : nativeTwinsV3(world, view, band, config.horizon, truth, id);
  if (variants) ok(hashWorld(world) === before, 'NUISANCE_TWIN_MUTATED_SOURCE_WORLD');
  const nuisance = variants ? nuisanceDependence(original, variants).values : null;
  return {
    row: { provenance: PROVENANCE, id, cell, band, regime: lock.regime, selections: lock.selections, menu: lock.menu, truth, metrics: scored.metrics,
      introductionB: scored.introductionB, introductionN: scored.introductionN, nuisance, nuisanceModes: { D4: 'NATIVE_WORLD_ORIENTATION', IDENTITY: IDENTITY_VIEW_ID, ORDER: 'OBSERVATION_ONLY' }, decisionsHash, publicEnvelopeHashByArm: lock.publicEnvelopeHashByArm, compute: lock.compute },
    ledger: { id, population, cell, seed, worldHash: before, orientation: config.orientation, warmupTicks: warm.warmupTicks, truncated: warm.truncated ?? null },
  };
}
