/* Sentinel Forge World — Stage 3B.1 warm-up-aware scenario generator.
 *
 * A SUPERSEDING generator, in the same discipline as every predecessor: it does
 * not edit `scenarios-v2.js`, it wraps it. Every structural decision — topology,
 * roles, objectives, horizon band, level, entity placement, relations — comes
 * from the frozen Stage 3B generator, unchanged, at the same seed. Stage 3B
 * reproduces byte-identically because nothing it owns was touched.
 *
 * V3 changes exactly two things, and both are SCENARIO CONSTRUCTION, decided
 * before any world exists. Neither is history:
 *
 *   1. HORIZON. The warm-up spends ticks, and a scenario that spends its horizon
 *      standing still is not the scenario the curriculum posed. `maxTicks` is
 *      extended by the warm-up target so that the horizon REMAINING at the
 *      decision point is exactly the horizon Stage 3B gave the decision. Measured,
 *      not asserted: the certification checks remaining === the V2 maxTicks.
 *
 *   2. THE TEMPORAL CHANNEL. Stage 3B declared a channel of 8 to 22 samples, which
 *      is shorter than the warm-up. `currentFrame()` clamps past the end of a
 *      series, so a warm-up longer than the channel observes the same value over
 *      and over — length without information, and worse, a flat history the Oracle
 *      would correctly read as STABLE. V3 declares the channel over the whole
 *      timeline it will actually be observed across, so every warm-up tick reads a
 *      genuine, distinct, pre-declared value. The world still lives every frame;
 *      the channel is authoritative state, exactly as the Stage 3A kernel comment
 *      insists ("the series has to be the thing the simulator owns").
 *
 * The channel families are declared, integer, and named for what they ARE, but
 * nothing downstream is allowed to trust the name: Stage 3B.1 validates each
 * realized history against the family by measuring it.
 */

import { createSeededRandom, deepFreeze, deriveSeed, randomInt } from '../core/determinism.js';
import { assertForge } from './contract.js';
import { generateScenarioV2 } from './scenarios-v2.js';
import { FORGE_WARMUP_TARGET_TICKS } from './warmup.js';

export const FORGE_SCENARIO_V3_VERSION = 'forge-scenarios-v3';
export const FORGE_CURRICULUM_V3_VERSION = 'FORGE_CURRICULUM_V3';
export const FORGE_DATASET_V3_CHANNEL_ID = 'primary';

/* The channel lives in integer 0..100. Integer arithmetic is the determinism
 * guarantee everywhere else in Forge, and a bounded domain means the Oracle head
 * vocabulary sees the same numeric range in every world. */
export const FORGE_CHANNEL_DOMAIN_MIN = 0;
export const FORGE_CHANNEL_DOMAIN_MAX = 100;

export const FORGE_TEMPORAL_FAMILIES = deepFreeze([
  { id: 'MONOTONIC_RISE', description: 'a single sustained upward trend' },
  { id: 'MONOTONIC_FALL', description: 'a single sustained downward trend' },
  { id: 'LATE_REVERSAL', description: 'a trend that turns and runs the other way' },
  { id: 'PERIODIC_CYCLE', description: 'a repeating four-tick pattern' },
  { id: 'LEVEL_SHIFT', description: 'one level, then a step to another level' },
  { id: 'HIGH_VOLATILITY', description: 'large alternating swings around a drift' },
  { id: 'FLAT', description: 'no movement at all' },
]);
export const FORGE_TEMPORAL_FAMILY_IDS = deepFreeze(FORGE_TEMPORAL_FAMILIES.map((entry) => entry.id));

const clampChannel = (value) => (value < FORGE_CHANNEL_DOMAIN_MIN ? FORGE_CHANNEL_DOMAIN_MIN
  : value > FORGE_CHANNEL_DOMAIN_MAX ? FORGE_CHANNEL_DOMAIN_MAX : value);

/** Integer ramp from lo to hi across exactly `count` samples. */
function ramp(count, lo, hi) {
  const series = [];
  const span = count > 1 ? count - 1 : 1;
  for (let index = 0; index < count; index += 1) {
    series.push(clampChannel(lo + Math.floor(((hi - lo) * index) / span)));
  }
  return series;
}

/**
 * Build the declared channel for a scenario.
 *
 * `count` is the number of samples the world will actually observe: the warm-up
 * ticks plus the decision horizon plus the tick-zero frame. Amplitudes are chosen
 * so each family clears the head thresholds it is supposed to exercise — a cycle
 * needs amplitude >= 0.08 and a volatile series >= 0.12 in the heads' normalized
 * units, which in this 0..100 domain are 8 and 12.
 */
export function buildTemporalChannel(family, count, level, warmupTicks = FORGE_WARMUP_TARGET_TICKS) {
  assertForge(FORGE_TEMPORAL_FAMILY_IDS.includes(family), 'Unknown temporal family', { family });
  assertForge(Number.isInteger(count) && count > 0, 'count must be a positive integer', { count });

  const amplitude = 10 + level * 2;
  /* Structural events belong INSIDE the window the decision will actually see.
   * A reversal placed at the midpoint of the whole timeline happens after the
   * warm-up ends, so the observed history is a plain monotonic ramp and the
   * family name is a claim about frames nobody looked at. The pivot is therefore
   * placed at roughly three fifths of the OBSERVED prefix. */
  const observed = Math.min(count, warmupTicks + 1);
  const pivot = Math.max(2, Math.floor((observed * 3) / 5));

  if (family === 'MONOTONIC_RISE') return ramp(count, 20, 88);
  if (family === 'MONOTONIC_FALL') return ramp(count, 88, 20);
  if (family === 'LATE_REVERSAL') {
    const up = ramp(pivot + 1, 24, 84);
    const down = ramp(count - pivot, 84, 24).slice(1);
    return [...up, ...down].slice(0, count);
  }
  if (family === 'PERIODIC_CYCLE') {
    const pattern = [0, 1, 0, -1];
    const series = [];
    for (let index = 0; index < count; index += 1) series.push(clampChannel(50 + amplitude * pattern[index % 4]));
    return series;
  }
  if (family === 'LEVEL_SHIFT') {
    const series = [];
    for (let index = 0; index < count; index += 1) series.push(clampChannel(index < pivot ? 30 : 30 + amplitude * 2));
    return series;
  }
  if (family === 'HIGH_VOLATILITY') {
    const series = [];
    for (let index = 0; index < count; index += 1) {
      const swing = index % 2 === 0 ? amplitude + 4 : -(amplitude + 4);
      series.push(clampChannel(50 + swing + Math.floor(index / 4)));
    }
    return series;
  }
  return new Array(count).fill(50);
}

/**
 * Declared channel semantics.
 *
 * The TIME_TO_THRESHOLD head is hard-suppressed when a scenario declares no
 * threshold, and Stage 3B declared none — which is why that head could never have
 * been measured on this corpus even with unlimited history. The threshold is a
 * property the SCENARIO declares about its own channel, fixed at construction from
 * the channel's declared range, never from what any expert later says about it.
 */
export function declareChannelSemantics(series) {
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  return {
    channelId: FORGE_DATASET_V3_CHANNEL_ID,
    domainMin: FORGE_CHANNEL_DOMAIN_MIN,
    domainMax: FORGE_CHANNEL_DOMAIN_MAX,
    observedMin: lo,
    observedMax: hi,
    /* Three quarters of the way up the declared range: high enough that a rising
     * channel has somewhere to cross to, low enough that a falling one has already
     * crossed. Neither depends on any head's output. */
    threshold: FORGE_CHANNEL_DOMAIN_MIN + Math.floor((FORGE_CHANNEL_DOMAIN_MAX - FORGE_CHANNEL_DOMAIN_MIN) * 3 / 4),
    polarity: 'HIGHER_IS_BETTER',
  };
}

/**
 * The V3 scenario: V2's structure, a horizon that survives the warm-up, and a
 * channel long enough to be observed the whole way.
 */
export function generateScenarioV3({ shape, roles, objectives, horizonBand, level, seed, warmupTicks = FORGE_WARMUP_TARGET_TICKS }) {
  const base = generateScenarioV2({ shape, roles, objectives, horizonBand, level, seed });

  const scenarioSeed = deriveSeed(base.scenarioSeed, 'forge-v3-temporal');
  const random = createSeededRandom(scenarioSeed);
  const family = FORGE_TEMPORAL_FAMILY_IDS[randomInt(random, 0, FORGE_TEMPORAL_FAMILY_IDS.length)];

  /* Every tick the world can ever reach: tick zero, the warm-up, and the full
   * decision horizon after it. The channel is never observed past its end, so
   * currentFrame() never clamps and no frame is a repeat of the one before it
   * unless the family itself repeats. */
  const observableTicks = warmupTicks + base.maxTicks + 1;
  const primary = buildTemporalChannel(family, observableTicks, level, warmupTicks);
  const channelSemantics = declareChannelSemantics(primary);

  return {
    ...base,
    generator: 'v3',
    family: `v3/${shape}/${roles}/${objectives}/${horizonBand}/${family}`,
    scenarioVersion: FORGE_SCENARIO_V3_VERSION,
    curriculumVersion: FORGE_CURRICULUM_V3_VERSION,
    temporalFamily: family,
    warmupTicks,
    /* The horizon the DECISION gets, preserved exactly: base.maxTicks. */
    decisionHorizon: base.maxTicks,
    baseMaxTicks: base.maxTicks,
    maxTicks: base.maxTicks + warmupTicks,
    channels: { [FORGE_DATASET_V3_CHANNEL_ID]: primary },
    channelSemantics: { [FORGE_DATASET_V3_CHANNEL_ID]: channelSemantics },
  };
}
