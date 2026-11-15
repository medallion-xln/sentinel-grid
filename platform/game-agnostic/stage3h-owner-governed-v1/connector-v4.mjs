// Native connector V4 (proposed amendment O-6 STAGE3H_NATIVE_MENU_VALIDITY_V1; requires new owner approval). A guard in
// front of the frozen connector-v3.mjs, which is imported and never edited. The guard reproduces V3's generation and
// admission inputs, builds every policy-facing view of the world (the original public view, the eight D4 orientation
// views, the O-2R.1 IDENTITY view and the ORDER view), and validates their menus BEFORE any policy call and before any
// truth exists. An invalid world returns one unreplaced rejection {reason: NATIVE_MENU_INVALID, cause}. Every other
// world (accepted, rejected for an earlier V3 reason, or aborting on a V3 integrity check) is passed to nativeRowV3
// verbatim, so its row, ledger, rejection or abort is exactly the V3 result.
import { createWorld, hashWorld, isTerminal } from '../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { ORIENTATIONS, orientWorld } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { sha256 } from '../src/core/determinism.js';
import { nativeRowV3 } from './connector-v3.mjs';
import { identityViewTwinV2 } from './identity-view-v2.mjs';
import { validatePolicyFacingViews, NATIVE_MENU_VALIDITY_ID, INVALID_REASON } from './menu-validity-v1.mjs';

export const CONNECTOR_V4_ID = 'STAGE3H_OWNER_GOVERNED_NATIVE_CONNECTOR_V4_MENU_VALIDITY';
const ok = (v, m) => { if (!v) throw Error(m); };
const bandOf = (steps) => (steps === 1 ? 'H0' : steps === 4 ? 'H2' : null);

/** Every view a policy is shown for one world, in fixed order; identical constructions to nativeRowV3/nativeTwinsV3. */
export function policyFacingViews(world, view) {
  return [
    { label: 'ORIGINAL', view },
    ...ORIENTATIONS.map((t) => ({ label: 'D4:' + t, view: observableView(orientWorld(t, world)) })),
    { label: 'IDENTITY', view: identityViewTwinV2(view).view },
    { label: 'ORDER', view: { ...view, surface: [...view.surface].reverse(), semantics: [...view.semantics].reverse() } },
  ];
}

/** One scheduled world -> V3 row/rejection/abort, or a pre-policy NATIVE_MENU_INVALID rejection. */
export function nativeRowV4(combo, ctx) {
  const { seed, population, cell, ...axes } = combo;
  const warm = runCalibratedWarmup(seed, (warmupTicks) => generateScenarioSymmetricV1({ ...axes, seed, warmupTicks })), config = warm.scenarioConfig;
  const initial = createWorld(seed, config), validation = validateScenarioV2(initial, config), world = warm.world;
  // Earlier V3 outcomes (validator, terminal, task, duplicate world, prior world, horizon mismatch) keep V3 precedence.
  if (!validation.valid || isTerminal(world) || !warm.taskPreserved) return nativeRowV3(combo, ctx);
  const before = hashWorld(world);
  if (ctx.seen.has(before) || ctx.prior?.has(before)) return nativeRowV3(combo, ctx);
  const view = observableView(world);
  if (bandOf(config.horizon + 1) !== axes.horizonBand) return nativeRowV3(combo, ctx);
  // Earliest lawful point: the post-warm-up world and all of its policy-facing views exist; no policy has been called.
  const verdict = validatePolicyFacingViews(policyFacingViews(world, view));
  ok(hashWorld(world) === before, 'MENU_VALIDATION_MUTATED_SOURCE_WORLD');
  if (verdict.valid) return nativeRowV3(combo, ctx);
  ctx.seen.add(before);
  return { rejected: { id: sha256({ population, ...combo }), population, cell, band: axes.horizonBand, reason: INVALID_REASON, cause: verdict.cause,
    firstInvalidView: verdict.firstInvalidView, invalidViews: verdict.invalidViews, views: verdict.views, rule: NATIVE_MENU_VALIDITY_ID } };
}
