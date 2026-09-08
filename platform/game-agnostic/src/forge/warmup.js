/* Sentinel Forge World — Stage 3B.1 temporal warm-up contract.
 *
 * Stage 3B measured a corpus-construction defect and recorded it rather than
 * papering over it: ORACLE_AXIS_UNREACHABLE. Decisions were captured at tick 0,
 * where `world.history` holds exactly one frame, against an Oracle that needs
 * three before it will say anything at all. Every Oracle case abstained, and the
 * router-usefulness ground truth collapsed to 0.0268 as a result.
 *
 * This module repairs that defect the only way that does not fabricate history:
 * the world is EVOLVED. A scenario is initialized, the deterministic kernel is
 * stepped, each state is observed, and the decision is only captured once the
 * required temporal context actually exists. Nothing is appended to
 * `world.history` from outside; every frame in it was lived.
 *
 * Two rules govern the design, and both cut against simply picking a big number:
 *
 *   1. The warm-up length comes from what makes each intended temporal family
 *      SEMANTICALLY MEASURABLE, not from what clears ORACLE_MIN_FRAMES. Clearing
 *      the floor at three frames would leave six of the eight heads abstaining
 *      and would have looked like a fix.
 *
 *   2. A warm-up that changes the task is invalid. The warm-up may let the world
 *      evolve; it may not quietly hand the decision a different problem than the
 *      curriculum posed. So the warm-up is TRUNCATED, per scenario, at the last
 *      tick that provably preserves the task, and the residue is reported by
 *      name instead of being engineered away.
 *
 * Nothing here modifies Prime, Nexus, Oracle, Router, Arbiter or ZekNova, and
 * nothing here gives a Sentinel recommendation any influence over the simulator:
 * the warm-up policy is fixed and declared in advance, and the only action it
 * ever plays is WAIT.
 */

import { deepFreeze } from '../core/determinism.js';
import { assertForge } from './contract.js';
import { createWorld, forgeActionKey, isTerminal, legalActions, step, topologyHash } from './kernel.js';

export const FORGE_WARMUP_VERSION = 'FORGE_TEMPORAL_WARMUP_V1';
export const FORGE_WARMUP_CONTRACT_VERSION = 1;

/* ---------------------------------------------------------------------------
 * PHASE 1 — Oracle temporal contract, read off the implementations.
 *
 * Every `requiredFrames` below is the literal guard in the head's own code, not
 * a number chosen here. `windowSemantics` records what the head does with the
 * frames once it has enough of them, which is the part that decides whether a
 * head is merely ANSWERING or actually MEASURING.
 * ------------------------------------------------------------------------- */

export const ORACLE_HEAD_TEMPORAL_CONTRACT = deepFreeze([
  {
    headId: 'direction',
    requiredFrames: 3,
    temporalField: 'channel level, first vs last',
    samplingAssumption: 'One frame per tick, evenly spaced. Sign of net change over the whole window.',
    windowSemantics: 'LAST_MINUS_FIRST over the full window; no sub-window.',
    missingHistoryBehaviour: 'Returns null (no semantic output) below three usable samples.',
    measurableAtFrames: 3,
    source: 'stage2i2-oracle-task-head-diagnostic.js: values.length < 3 => null',
  },
  {
    headId: 'volatility',
    requiredFrames: 4,
    temporalField: 'first differences of the channel',
    samplingAssumption: 'Adjacent frames are one tick apart, so a difference is a rate.',
    windowSemantics: 'RMS of all first differences over the window.',
    missingHistoryBehaviour: 'SHORT_HISTORY, semantic output null.',
    measurableAtFrames: 4,
    source: 'stage2i2: VOLATILITY_HEAD values.length < 4 => SHORT_HISTORY',
  },
  {
    headId: 'timeToThreshold',
    requiredFrames: 4,
    temporalField: 'channel level and recent slope against a DECLARED threshold',
    samplingAssumption: 'Recent slope extrapolates linearly in ticks.',
    windowSemantics: 'Slope of the last five samples; ticks-to-cross is a division.',
    missingHistoryBehaviour: 'MISSING_THRESHOLD_OR_HISTORY. Hard-suppressed when the scenario declares no threshold semantics, regardless of history length.',
    measurableAtFrames: 5,
    source: 'stage2i2: TIME_TO_THRESHOLD_HEAD requires channelSemantics.threshold + polarity and values.length >= 4',
  },
  {
    headId: 'abstention',
    requiredFrames: 5,
    temporalField: 'sample count, channel coverage, full vs recent slope agreement, volatility',
    samplingAssumption: 'Coverage is measured against the number of frames offered, so a partially populated channel is visible as such.',
    windowSemantics: 'Gate: >= 5 samples AND coverage >= 0.8 AND no full/recent slope conflict AND volatility < 0.14.',
    missingHistoryBehaviour: 'INSUFFICIENT_EVIDENCE. This head IS the abstention mechanism.',
    measurableAtFrames: 5,
    source: 'stage2i2: ABSTENTION_HEAD enough = values.length >= 5 && coverage >= 0.8 && !conflict && !noisy',
  },
  {
    headId: 'persistence',
    requiredFrames: 6,
    temporalField: 'signs of first differences, longest opposing run, full vs recent slope',
    samplingAssumption: 'A run of same-signed differences is a sustained direction; interruptions are bounded, not fatal.',
    windowSemantics: 'Dominant sign share over all differences, tolerant of bounded interruption.',
    missingHistoryBehaviour: 'INSUFFICIENT_EVIDENCE with SHORT_OR_MISSING_HISTORY; also requires coverage >= 0.8.',
    measurableAtFrames: 6,
    source: 'stage2i3-oracle-head-remediation.js: values.length < 6 || coverage < .8',
  },
  {
    headId: 'reversal',
    requiredFrames: 8,
    temporalField: 'prior-segment slope vs tail-segment slope',
    samplingAssumption: 'The window splits into a prior stretch and a tail of about four ticks.',
    windowSemantics: 'cut = max(3, n - 4); prior slope over [0, cut), tail slope over [cut - 1, n). Both must be materially non-flat.',
    missingHistoryBehaviour: 'SHORT_HISTORY, semantic output null.',
    measurableAtFrames: 9,
    source: 'stage2i2: REVERSAL_HEAD values.length < 8 => SHORT_HISTORY',
  },
  {
    headId: 'cycle',
    requiredFrames: 8,
    temporalField: 'lagged autocorrelation of the channel',
    samplingAssumption: 'A period is a whole number of ticks; a lag of L needs n - L paired points to be worth anything.',
    windowSemantics: 'Best correlation over lags 2..min(8, floor(n/2)); needs amplitude >= 0.08 as well.',
    missingHistoryBehaviour: 'SHORT_HISTORY, semantic output null.',
    measurableAtFrames: 18,
    measurableAtFramesReason: 'The head will search a lag of 8 only once floor(n/2) >= 8, i.e. n >= 16, and a lag-8 correlation on 16 points rests on 8 pairs. At n >= 18 the deepest lag it can select is supported by at least ten pairs.',
    source: 'stage2i2: CYCLE_HEAD values.length < 8 => SHORT_HISTORY; lag <= min(8, floor(n/2))',
  },
  {
    headId: 'regimeChange',
    requiredFrames: 18,
    temporalField: 'level, slope, volatility and cycle statistics of a prior window vs a recent window',
    samplingAssumption: 'The two windows describe different stretches of the same process, so they must not overlap.',
    windowSemantics: 'window = min(8, floor(n/3)); prior = first `window` samples, recent = last `window` samples.',
    missingHistoryBehaviour: 'INSUFFICIENT_EVIDENCE with SHORT_OR_MISSING_HISTORY; also requires coverage >= 0.8.',
    measurableAtFrames: 24,
    measurableAtFramesReason: 'The guard admits the head at n = 18, but window = floor(n/3) is only 6 there: the head answers on windows narrower than the 8 it is built for. floor(n/3) reaches 8 at n = 24, which is the first length at which the head compares two full, disjoint eight-sample windows.',
    source: 'stage2i3-oracle-head-remediation.js: values.length < 18 || coverage < .8; window = min(8, floor(values.length / 3))',
  },
]);

export const ORACLE_HEAD_IDS = deepFreeze(ORACLE_HEAD_TEMPORAL_CONTRACT.map((head) => head.headId));

/**
 * The warm-up target, DERIVED rather than chosen.
 *
 * The binding head is regimeChange. Its guard passes at 18 frames, so 17 warm-up
 * ticks would clear every documented minimum and would be exactly the mistake the
 * stage brief names: the head would emit labels computed from six-sample windows
 * instead of the eight-sample windows it is built around. `measurableAtFrames`
 * for regimeChange is 24; the warm-up therefore targets 24 observed frames, which
 * a warm-up of 24 ticks delivers as 25 (the tick-0 frame plus one per tick).
 */
export const FORGE_WARMUP_MINIMUM_TO_CLEAR_GUARDS = Math.max(
  ...ORACLE_HEAD_TEMPORAL_CONTRACT.map((head) => head.requiredFrames),
);
export const FORGE_WARMUP_FRAMES_FOR_MEASURABILITY = Math.max(
  ...ORACLE_HEAD_TEMPORAL_CONTRACT.map((head) => head.measurableAtFrames),
);
export const FORGE_WARMUP_TARGET_TICKS = FORGE_WARMUP_FRAMES_FOR_MEASURABILITY;

/** Frames a head needs, and whether a given realized history supplies them. */
export function oracleHeadReachability(frameCount) {
  const heads = {};
  for (const head of ORACLE_HEAD_TEMPORAL_CONTRACT) {
    heads[head.headId] = {
      requiredFrames: head.requiredFrames,
      measurableAtFrames: head.measurableAtFrames,
      guardCleared: frameCount >= head.requiredFrames,
      semanticallyMeasurable: frameCount >= head.measurableAtFrames,
    };
  }
  return { frameCount, heads };
}

/* ---------------------------------------------------------------------------
 * PHASE 2 — the warm-up specification.
 * ------------------------------------------------------------------------- */

export const FORGE_TEMPORAL_WARMUP_V1 = deepFreeze({
  id: FORGE_WARMUP_VERSION,
  contractVersion: FORGE_WARMUP_CONTRACT_VERSION,
  targetTicks: FORGE_WARMUP_TARGET_TICKS,
  minimumToClearGuards: FORGE_WARMUP_MINIMUM_TO_CLEAR_GUARDS,
  actionPolicy: 'WAIT_ONLY',
  actionPolicyRationale:
    'WAIT is the only action that expresses "let the world run" without the warm-up making choices the decision is supposed to make. It costs zero energy, moves nothing, and takes no objective step, so any change observed during warm-up is the world evolving, never the warm-up playing.',
  environmentalEvolution:
    'Whatever the frozen kernel does on any tick: hazard terrain damage, hostile degradation through `attacks` relations, tick and horizon advance. The warm-up neither adds nor suppresses dynamics.',
  observationCapture: 'One frame per tick, produced by the kernel through currentFrame(), pushed by the kernel inside step().',
  historyUpdate: 'Kernel-owned. Nothing in this module writes to world.history.',
  decisionCapturePoint: 'After the warm-up terminates, at the first tick where the required temporal context exists and the task is still the task.',
  truncationRule:
    'The warm-up stops at the last tick whose world still satisfies the task-preservation predicate. A truncated warm-up is recorded with its cause; the heads it can no longer support abstain and say so.',
  neverDoes: deepFreeze([
    'append frames to history',
    'mutate world state outside step()',
    'consult a Sentinel expert',
    'let a recommendation influence the simulator',
    'vary with wall-clock time or randomness',
  ]),
});

/* ---------------------------------------------------------------------------
 * PHASE 3 — the task-preservation predicate.
 *
 * "Did the task change" is deliberately about DISCRETE events, not about drift.
 * A defended node losing five health is the world evolving; the same node
 * becoming unavailable is a different decision problem. The predicate below is
 * the stage brief's own list: killed entities, completed objectives, changed
 * legal actions, consumed resources, moved actors, changed structure.
 * ------------------------------------------------------------------------- */

export function taskSignature(world) {
  return {
    entities: [...world.entities].map((entity) => entity.id).sort().join(','),
    available: [...world.entities].filter((entity) => entity.available).map((entity) => entity.id).sort().join(','),
    relations: [...world.relations].map((relation) => `${relation.type} ${relation.from} ${relation.to}`).sort().join(','),
    objectives: [...world.objectives].map((objective) => `${objective.id}:${objective.satisfied === true}`).sort().join(','),
    positions: [...world.entities].map((entity) => `${entity.id}@${entity.position.x},${entity.position.y}`).sort().join(','),
    energy: String(world.constraints.energy ?? 0),
    topology: topologyHash(world),
    legalActions: legalActions(world).map(forgeActionKey).sort().join(','),
  };
}

export const TASK_SIGNATURE_FIELDS = deepFreeze([
  'entities', 'available', 'relations', 'objectives', 'positions', 'energy', 'topology', 'legalActions',
]);

/** Which named parts of the task changed between two worlds. Empty means none. */
export function taskDelta(before, after) {
  return TASK_SIGNATURE_FIELDS.filter((field) => before[field] !== after[field]);
}

export const WARMUP_STOP_REASONS = deepFreeze([
  'TARGET_REACHED',
  'TASK_CHANGED',
  'WORLD_TERMINAL',
  'NO_WAIT_ACTION',
]);

/* ---------------------------------------------------------------------------
 * PHASE 6 — the decision-point contract.
 * ------------------------------------------------------------------------- */

export const WARMUP_DECISION_STATES = deepFreeze([
  'WORLD_INITIALIZED',
  'WARMUP_COMPLETE',
  'HISTORY_VALID',
  'SEMANTIC_ADMISSION_PASS',
  'DECISION_CAPTURED',
]);

/**
 * Run the warm-up.
 *
 * Returns the world at the decision point together with everything needed to
 * reproduce and audit it: the realized frames, the tick count actually reached,
 * why it stopped, and whether the task survived.
 */
export function runTemporalWarmup(seed, scenarioConfig, { targetTicks = FORGE_WARMUP_TARGET_TICKS } = {}) {
  assertForge(Number.isInteger(targetTicks) && targetTicks >= 0, 'targetTicks must be a non-negative integer', { targetTicks });

  const initial = createWorld(seed, scenarioConfig);
  const baseline = taskSignature(initial);

  let world = initial;
  let accepted = initial;
  let ticks = 0;
  let stopReason = 'TARGET_REACHED';
  let taskDeltaFields = [];

  for (let tick = 0; tick < targetTicks; tick += 1) {
    if (isTerminal(world)) { stopReason = 'WORLD_TERMINAL'; break; }
    const wait = legalActions(world).find((action) => action.actionType === 'WAIT');
    if (wait === undefined) { stopReason = 'NO_WAIT_ACTION'; break; }

    const result = step(world, wait);
    world = result.state;
    if (result.terminal) { stopReason = 'WORLD_TERMINAL'; break; }

    const delta = taskDelta(baseline, taskSignature(world));
    if (delta.length > 0) { stopReason = 'TASK_CHANGED'; taskDeltaFields = delta; break; }

    accepted = world;
    ticks = tick + 1;
  }

  const frameCount = accepted.history.length;
  const observedChannelFrames = new Set(accepted.history.map((frame) => JSON.stringify(frame.channels))).size;
  /* Exhaustion is CLAMPING, not repetition. A periodic or flat family repeats
   * values on purpose, and counting that as exhaustion would condemn two of the
   * declared temporal families for behaving exactly as declared. What actually
   * costs information is currentFrame() running off the end of a declared series
   * and returning its last value forever, so that is what is measured. */
  const channelLengths = Object.values(scenarioConfig.channels ?? {}).map((series) => series.length);
  const shortestChannel = channelLengths.length === 0 ? 0 : Math.min(...channelLengths);
  const channelClamped = channelLengths.length > 0 && accepted.tick > shortestChannel - 1;

  return {
    world: accepted,
    warmupVersion: FORGE_WARMUP_VERSION,
    targetTicks,
    warmupTicks: ticks,
    truncated: ticks < targetTicks,
    stopReason,
    taskChangedFields: taskDeltaFields,
    taskPreserved: taskDelta(baseline, taskSignature(accepted)).length === 0,
    frameCount,
    distinctChannelFrames: observedChannelFrames,
    shortestChannelLength: shortestChannel,
    channelClamped,
    remainingHorizon: accepted.maxTicks - accepted.tick,
    reachability: oracleHeadReachability(frameCount),
    decisionState: 'WARMUP_COMPLETE',
  };
}

/**
 * PHASE 7 — replay identity over EVERY warm-up frame, not just the endpoint.
 *
 * Reproducing the decision state alone would not prove the warm-up is
 * deterministic; it would only prove the endpoint is. This replays the whole
 * evolution and compares frame by frame.
 */
export function replayTemporalWarmup(seed, scenarioConfig, expected) {
  const replayed = runTemporalWarmup(seed, scenarioConfig, { targetTicks: expected.targetTicks });
  const frames = [];
  const expectedFrames = expected.world.history;
  const replayedFrames = replayed.world.history;
  const length = Math.max(expectedFrames.length, replayedFrames.length);
  for (let index = 0; index < length; index += 1) {
    const a = expectedFrames[index] ?? null;
    const b = replayedFrames[index] ?? null;
    frames.push({ index, identical: JSON.stringify(a) === JSON.stringify(b) });
  }
  return {
    frameCount: length,
    framesIdentical: frames.filter((frame) => frame.identical).length,
    allFramesIdentical: frames.every((frame) => frame.identical),
    ticksIdentical: replayed.warmupTicks === expected.warmupTicks,
    stopReasonIdentical: replayed.stopReason === expected.stopReason,
  };
}

/**
 * Two-pass warm-up: measure the safe length, then build the scenario around it.
 *
 * A truncated warm-up leaves the decision MORE horizon than the curriculum gave
 * it, because the scenario extended `maxTicks` by the full target and the world
 * only spent part of it. Extra horizon is as much a task change as too little —
 * a five-step problem handed twelve steps is a different problem — so the length
 * is measured on a probe first and the scenario is then declared with exactly
 * that much extra horizon. Both passes are pure functions of (seed, axes), so the
 * result is reproducible without carrying any state between them.
 *
 * `buildScenario(warmupTicks)` must return a scenario whose structure does not
 * depend on `warmupTicks`; only its horizon and channel length may.
 */
export function runCalibratedWarmup(seed, buildScenario, { targetTicks = FORGE_WARMUP_TARGET_TICKS } = {}) {
  const probeConfig = buildScenario(targetTicks);
  const probe = runTemporalWarmup(seed, probeConfig, { targetTicks });

  if (!probe.truncated) {
    return {
      ...probe,
      scenarioConfig: probeConfig,
      calibratedTicks: targetTicks,
      calibrationPasses: 1,
      requestedTargetTicks: targetTicks,
      shortenedBelowTarget: false,
    };
  }

  const finalConfig = buildScenario(probe.warmupTicks);
  const final = runTemporalWarmup(seed, finalConfig, { targetTicks: probe.warmupTicks });
  return {
    ...final,
    scenarioConfig: finalConfig,
    calibratedTicks: probe.warmupTicks,
    calibrationPasses: 2,
    requestedTargetTicks: targetTicks,
    /* The second pass asks for exactly the length the probe proved safe, so it
     * always meets its own target and `truncated` on it is always false. Reporting
     * that as "not truncated" would hide every shortened warm-up behind the
     * calibration — so shortening is recorded against the ORIGINAL target, which is
     * the question anyone reading the audit is actually asking. */
    shortenedBelowTarget: probe.warmupTicks < targetTicks,
    truncated: probe.warmupTicks < targetTicks,
    stopReason: probe.stopReason,
    taskChangedFields: probe.taskChangedFields,
    probeStopReason: probe.stopReason,
    probeTaskChangedFields: probe.taskChangedFields,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 4 — temporal family validation, measured off the realized history.
 *
 * The generator NAMES a family. A name is not evidence — the same rule the
 * semantic admission gate has enforced since Stage 3A. These measurements are
 * deliberately head-free: none of them calls the Oracle or any head, so a head
 * agreeing with a family is a finding rather than a tautology.
 * ------------------------------------------------------------------------- */

export function measureRealizedSeries(series) {
  const n = series.length;
  if (n < 2) {
    return { samples: n, netChange: 0, monotoneUp: false, monotoneDown: false, alternationRatio: 0, meanAbsStep: 0, maxAbsStep: 0, splitLevelShift: 0, distinctValues: new Set(series).size, range: 0 };
  }
  const diffs = [];
  for (let index = 1; index < n; index += 1) diffs.push(series[index] - series[index - 1]);
  const signs = diffs.map((value) => (value > 0 ? 1 : value < 0 ? -1 : 0));
  const nonZero = signs.filter((value) => value !== 0);
  let flips = 0;
  for (let index = 1; index < nonZero.length; index += 1) if (nonZero[index] !== nonZero[index - 1]) flips += 1;
  const half = Math.floor(n / 2);
  const mean = (values) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);
  return {
    samples: n,
    netChange: series[n - 1] - series[0],
    monotoneUp: signs.every((value) => value >= 0) && signs.some((value) => value > 0),
    monotoneDown: signs.every((value) => value <= 0) && signs.some((value) => value < 0),
    alternationRatio: nonZero.length < 2 ? 0 : Number((flips / (nonZero.length - 1)).toFixed(4)),
    meanAbsStep: Number((diffs.reduce((sum, value) => sum + Math.abs(value), 0) / diffs.length).toFixed(4)),
    maxAbsStep: Math.max(...diffs.map((value) => Math.abs(value))),
    splitLevelShift: Number((mean(series.slice(half)) - mean(series.slice(0, half))).toFixed(4)),
    distinctValues: new Set(series).size,
    range: Math.max(...series) - Math.min(...series),
  };
}

/** Does the realized history actually exhibit the family the generator declared? */
export function validateTemporalFamily(family, series) {
  const measured = measureRealizedSeries(series);
  let holds = false;
  let criterion = '';
  switch (family) {
    case 'MONOTONIC_RISE':
      criterion = 'never steps down, and ends above where it started';
      holds = measured.monotoneUp && measured.netChange > 0;
      break;
    case 'MONOTONIC_FALL':
      criterion = 'never steps up, and ends below where it started';
      holds = measured.monotoneDown && measured.netChange < 0;
      break;
    case 'LATE_REVERSAL':
      criterion = 'rises and falls within the observed window, so it is neither monotone';
      holds = !measured.monotoneUp && !measured.monotoneDown && measured.range > 0
        && series.slice(0, Math.floor(series.length / 2)).some((value, index, arr) => index > 0 && value > arr[index - 1])
        && series.slice(Math.floor(series.length / 2)).some((value, index, arr) => index > 0 && value < arr[index - 1]);
      break;
    case 'PERIODIC_CYCLE':
      criterion = 'direction flips on nearly every step, with a real amplitude';
      holds = measured.alternationRatio >= 0.5 && measured.range >= 8;
      break;
    case 'LEVEL_SHIFT':
      criterion = 'the second half sits at a materially different level from the first';
      holds = Math.abs(measured.splitLevelShift) >= 8;
      break;
    case 'HIGH_VOLATILITY':
      criterion = 'steps are large in both directions';
      holds = measured.alternationRatio >= 0.5 && measured.meanAbsStep >= 12;
      break;
    case 'FLAT':
      criterion = 'the series never moves';
      holds = measured.distinctValues === 1;
      break;
    default:
      criterion = 'unknown family';
      holds = false;
  }
  return { family, holds, criterion, measured };
}
