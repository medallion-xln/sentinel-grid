import { deepFreeze, deriveSeed, sha256 } from '../core/determinism.js';
import { generateScenarioV3 } from '../forge/scenarios-v3.js';
import { FORGE_WARMUP_TARGET_TICKS } from '../forge/warmup.js';
import { ORIENTATIONS, orientScenarioConfig } from './orientation-symmetric-v1.js';

/* ===========================================================================
 * STAGE_3F_6_P_1C — FORGE_SCENARIO_GENERATOR_SYMMETRIC_V1
 *
 * A SUPERSEDING generator in the established discipline: it does not edit `scenarios-v2.js` or
 * `scenarios-v3.js`, it wraps them. Every structural decision — topology, roles, objectives, horizon band,
 * level, entity placement, relations, channel — comes from the frozen V3 generator at the same seed, so V1
 * and V2/V3 corpora still reproduce byte-identically.
 *
 * It repairs exactly one proven defect (Stage 3F.6-P.1B): the V2 generator places the actor's `material`
 * resource with a fixed EAST-first candidate order (scenarios-v2.js placeNear), which made EAST optimal in
 * 78% of worlds. The canonical geometry is kept and the whole scenario is then rotated or reflected by a
 * SEED-BOUND element of D4, so the leftover placement preference is spread evenly over the four cardinal
 * directions instead of always pointing east.
 *
 * Deterministic, reproducible, seed-bound. No wall-clock, no ambient randomness: the orientation is derived
 * from the scenario seed alone.
 * ========================================================================= */

export const FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID = 'FORGE_SCENARIO_GENERATOR_SYMMETRIC_V1';
export const FORGE_SYMMETRIC_BENCHMARK_ID = 'FORGE_SYMMETRIC_V2';
const ORIENTATION_SALT = 'forge-symmetric-orientation-v1';

/** The seed-bound orientation of a scenario: a pure function of its frozen V3 scenario seed. */
export function orientationForScenario(scenarioSeed) {
  const digest = deriveSeed(scenarioSeed, ORIENTATION_SALT);
  return ORIENTATIONS[Number(digest % BigInt(ORIENTATIONS.length))];
}

export function generateScenarioSymmetricV1({ shape, roles, objectives, horizonBand, level, seed, warmupTicks = FORGE_WARMUP_TARGET_TICKS }) {
  const base = generateScenarioV3({ shape, roles, objectives, horizonBand, level, seed, warmupTicks });
  const orientation = orientationForScenario(base.scenarioSeed);
  const oriented = orientScenarioConfig(orientation, base);
  return {
    ...oriented,
    generator: 'symmetric-v1',
    benchmarkId: FORGE_SYMMETRIC_BENCHMARK_ID,
    generatorId: FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID,
    scenarioVersion: FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID,
    orientation,
    baseScenarioVersion: base.scenarioVersion,
  };
}

export const FORGE_SCENARIO_GENERATOR_SYMMETRIC_CONTRACT = deepFreeze({
  generatorId: FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID,
  benchmarkId: FORGE_SYMMETRIC_BENCHMARK_ID,
  basedOn: 'generateScenarioV3 (frozen, unmodified) over generateScenarioV2 (frozen, unmodified)',
  repairedDefect: 'fixed EAST-first candidate order in placeNear, measured at EAST 78 / WEST 17 / SOUTH 4 / NORTH 1 percent',
  orientationAlgorithm: 'canonical geometry, then a seed-bound D4 orientation: ORIENTATIONS[deriveSeed(scenarioSeed, salt) mod 8]',
  orientationSalt: ORIENTATION_SALT,
  seedBinding: 'the frozen V3 scenarioSeed; no wall-clock, no ambient randomness, no per-run state',
  unchanged: ['topology', 'roles', 'objectives', 'horizon band', 'level', 'relations', 'entity identities and values', 'temporal channel', 'energy budget'],
  historicalGeneratorsModified: false,
  note: 'orientation is applied to geometry only; distances, adjacency and every relational fact are preserved',
});
export const FORGE_SCENARIO_GENERATOR_SYMMETRIC_CONTRACT_HASH = sha256(FORGE_SCENARIO_GENERATOR_SYMMETRIC_CONTRACT);
