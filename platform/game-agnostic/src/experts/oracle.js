/* Sentinel Oracle — Stage 2G deterministic temporal expert (R0).
 *
 * Derives trend, rate of change, acceleration, persistence, volatility and
 * repeated-state structure from bounded certified observation history.
 *
 * Oracle does not predict. Every signal is a measurement of history that was
 * actually supplied; when history is too short the expert says so through
 * ORACLE_INSUFFICIENT_HISTORY and emits zeroed metrics rather than guessing.
 *
 * Game-agnostic: Oracle knows nothing about resources, threat or biomes. It reads
 * named numeric channels. Mapping a game's state onto channels is adapter work.
 */

import {
  EXPERT_CONTRACT_VERSION,
  SIGNAL_SCALE,
  buildExpertOutput,
  normalizeExpertInput,
  quantizeRatio,
  quantizeSquashed,
  quantizeUnit,
} from './expert-contract.js';

export const ORACLE_EXPERT_ID = 'sentinel-oracle-temporal';
export const ORACLE_EXPERT_VERSION = 1;

/** Minimum frames needed for slope and acceleration to be meaningful. */
export const ORACLE_MIN_FRAMES = 3;
/** Frames at which Oracle reports full confidence. */
export const ORACLE_CONFIDENCE_WINDOW = 16;

/* Documented gain constants. They only rescale before a bounded squash, and are
 * part of the expert version: changing one changes ORACLE_EXPERT_VERSION. */
const TREND_GAIN = 8;
const ACCEL_GAIN = 16;
const VOLATILITY_GAIN = 8;

const BOOL_TRUE = SIGNAL_SCALE;
const BOOL_FALSE = 0;

/** Ordinary least squares slope of y against t = 0..n-1, plus accel/vol/level. */
function channelStatistics(series) {
  const count = series.length;
  if (count < ORACLE_MIN_FRAMES) {
    return { sufficient: false, slope: 0, accel: 0, volatility: 0, level: count > 0 ? series[count - 1] : 0, persistence: 0 };
  }

  const meanT = (count - 1) / 2;
  let meanY = 0;
  for (let t = 0; t < count; t += 1) meanY += series[t];
  meanY /= count;

  let numerator = 0;
  let denominator = 0;
  for (let t = 0; t < count; t += 1) {
    const dt = t - meanT;
    numerator += dt * (series[t] - meanY);
    denominator += dt * dt;
  }
  const slope = denominator > 0 ? numerator / denominator : 0;

  // First differences drive acceleration, volatility and persistence.
  let sumSquaredDiff = 0;
  let accelSum = 0;
  let accelCount = 0;
  let previousDiff = null;
  let risingSteps = 0;
  let fallingSteps = 0;
  for (let t = 1; t < count; t += 1) {
    const diff = series[t] - series[t - 1];
    sumSquaredDiff += diff * diff;
    if (diff > 0) risingSteps += 1;
    else if (diff < 0) fallingSteps += 1;
    if (previousDiff !== null) {
      accelSum += diff - previousDiff;
      accelCount += 1;
    }
    previousDiff = diff;
  }
  const stepCount = count - 1;
  const volatility = Math.sqrt(sumSquaredDiff / stepCount);
  const accel = accelCount > 0 ? accelSum / accelCount : 0;
  const dominantSteps = risingSteps >= fallingSteps ? risingSteps : fallingSteps;
  const persistence = stepCount > 0 ? dominantSteps / stepCount : 0;

  return { sufficient: true, slope, accel, volatility, level: series[count - 1], persistence };
}

/** Union of channel names across frames, sorted for deterministic signal order. */
function collectChannelNames(frames) {
  const names = new Set();
  for (const frame of frames) {
    for (const name of Object.keys(frame.channels)) names.add(name);
  }
  return [...names].sort();
}

/** Adjacent frames whose full channel vector is byte-identical. */
function repeatedFrameRatio(frames, channelNames) {
  if (frames.length < 2) return 0;
  let repeats = 0;
  for (let index = 1; index < frames.length; index += 1) {
    let identical = true;
    for (const name of channelNames) {
      const previous = frames[index - 1].channels[name];
      const current = frames[index].channels[name];
      if (previous === undefined && current === undefined) continue;
      if (previous !== current) { identical = false; break; }
    }
    if (identical) repeats += 1;
  }
  return repeats / (frames.length - 1);
}

/**
 * Evaluate temporal structure over certified observation history.
 * Returns a frozen advisory output; never throws on merely sparse history.
 */
export function evaluateOracle(input) {
  const normalized = normalizeExpertInput(input);
  const frames = normalized.observationHistory;
  const channelNames = collectChannelNames(frames);
  const rationaleCodes = new Set();

  if (normalized.historyTruncated) rationaleCodes.add('ORACLE_HISTORY_TRUNCATED');

  const signals = {};
  let analyzedChannels = 0;
  let partialChannels = 0;
  let maxAbsSlope = 0;
  let maxVolatility = 0;
  let anyRising = false;
  let anyFalling = false;
  let anyAccelerating = false;
  let anyDecelerating = false;
  let anyVolatile = false;

  for (const name of channelNames) {
    // Use only frames where the channel is present: partial history degrades, never throws.
    const series = [];
    for (const frame of frames) {
      const value = frame.channels[name];
      if (value !== undefined) series.push(value);
    }
    if (series.length < frames.length) partialChannels += 1;

    const stats = channelStatistics(series);
    if (stats.sufficient) analyzedChannels += 1;

    const slopeSignal = stats.sufficient ? quantizeSquashed(stats.slope * TREND_GAIN) : 0;
    const accelSignal = stats.sufficient ? quantizeSquashed(stats.accel * ACCEL_GAIN) : 0;
    const volatilitySignal = stats.sufficient ? quantizeSquashed(stats.volatility * VOLATILITY_GAIN) : 0;
    const persistenceSignal = stats.sufficient ? quantizeUnit(stats.persistence) : 0;
    const direction = slopeSignal > 0 ? SIGNAL_SCALE : slopeSignal < 0 ? -SIGNAL_SCALE : 0;

    signals[`channel:${name}:direction`] = direction;
    signals[`channel:${name}:slope`] = slopeSignal;
    signals[`channel:${name}:acceleration`] = accelSignal;
    signals[`channel:${name}:volatility`] = volatilitySignal;
    signals[`channel:${name}:persistence`] = persistenceSignal;
    signals[`channel:${name}:level`] = quantizeUnit(stats.level);

    const absSlope = slopeSignal < 0 ? -slopeSignal : slopeSignal;
    if (absSlope > maxAbsSlope) maxAbsSlope = absSlope;
    if (volatilitySignal > maxVolatility) maxVolatility = volatilitySignal;
    if (direction > 0) anyRising = true;
    if (direction < 0) anyFalling = true;
    if (accelSignal > 0) anyAccelerating = true;
    if (accelSignal < 0) anyDecelerating = true;
    if (volatilitySignal >= SIGNAL_SCALE / 2) anyVolatile = true;
  }

  const frameCount = frames.length;
  const sufficient = frameCount >= ORACLE_MIN_FRAMES && analyzedChannels > 0;
  const repeatRatio = repeatedFrameRatio(frames, channelNames);

  signals.historyFrameCount = frameCount;
  signals.channelCount = channelNames.length;
  signals.analyzedChannelCount = analyzedChannels;
  signals.partialChannelCount = partialChannels;
  signals.sufficientHistory = sufficient ? BOOL_TRUE : BOOL_FALSE;
  signals.maxAbsSlope = maxAbsSlope;
  signals.maxVolatility = maxVolatility;
  signals.repeatedStateRatio = quantizeUnit(repeatRatio);
  signals.tickSpan = frameCount > 0 ? frames[frameCount - 1].tick - frames[0].tick : 0;

  if (!sufficient) rationaleCodes.add('ORACLE_INSUFFICIENT_HISTORY');
  if (channelNames.length === 0) rationaleCodes.add('ORACLE_NO_CHANNELS');
  if (partialChannels > 0) rationaleCodes.add('ORACLE_PARTIAL_CHANNEL_HISTORY');
  if (sufficient) {
    if (anyRising) rationaleCodes.add('ORACLE_TREND_RISING');
    if (anyFalling) rationaleCodes.add('ORACLE_TREND_FALLING');
    if (!anyRising && !anyFalling) rationaleCodes.add('ORACLE_TREND_FLAT');
    if (anyAccelerating) rationaleCodes.add('ORACLE_ACCELERATING');
    if (anyDecelerating) rationaleCodes.add('ORACLE_DECELERATING');
    if (anyVolatile) rationaleCodes.add('ORACLE_VOLATILE');
    if (maxVolatility === 0) rationaleCodes.add('ORACLE_STABLE');
    if (repeatRatio > 0) rationaleCodes.add('ORACLE_REPEATED_STATE');
  }

  // Confidence grows with usable history and is never claimed without it.
  const usableFrames = frameCount > ORACLE_CONFIDENCE_WINDOW ? ORACLE_CONFIDENCE_WINDOW : frameCount;
  const confidence = sufficient ? quantizeRatio(usableFrames, ORACLE_CONFIDENCE_WINDOW) : 0;

  return buildExpertOutput({
    expertId: ORACLE_EXPERT_ID,
    expertVersion: ORACLE_EXPERT_VERSION,
    normalizedInput: normalized,
    signals,
    confidence,
    rationaleCodes: [...rationaleCodes],
  });
}

export const oracleManifest = Object.freeze({
  expertId: ORACLE_EXPERT_ID,
  expertVersion: ORACLE_EXPERT_VERSION,
  expertContractVersion: EXPERT_CONTRACT_VERSION,
  kind: 'deterministic-temporal',
  isLearned: false,
  usesRandomness: false,
  usesWallClock: false,
  authorityTier: 'R0',
});
