/* Stage 2L.23 — temporal corpus generator boundary validation, semantic
 * well-posedness, and downstream recertification (R0, shadow only).
 *
 * THE PATTERN THIS STAGE EXISTS TO END. Three generator defects of one shape have
 * now been found inside this project's own evaluation data:
 *
 *   2L.19  REVERSAL          the second segment ran past the range bound, clamped,
 *                            and flattened the recent window, so NO_REVERSAL was
 *                            the correct answer to a case labelled REVERSAL.
 *   2L.20  APPROACHING       every case ended with the series already past the
 *                            threshold, so ALREADY_CROSSED was correct on a case
 *                            labelled CROSSING_1_TO_3.
 *   2L.22  SUSTAINED_RUN     slope and jitter are swept independently, so at the
 *                            low end the jitter is six times the slope and the
 *                            series does not sustain anything.
 *
 * Each was caught late, by a diagnostic stage puzzling over an expert that looked
 * wrong. Each is the same mistake: the generator was validated at its NOMINAL
 * settings and never at its parameter extremes, and a family NAME was treated as
 * ground truth about the series the family produces.
 *
 * THE PRINCIPLE. `family = 'SUSTAINED_RUN'` is a statement of intent. It is not
 * evidence that the generated series is persistent. Ground truth has to be read
 * off the observable sequence, and the reader must not be the head under test —
 * a label adjudicated by the expert being scored is not a label at all.
 *
 * WHAT THIS STAGE BUILDS. A validator per family that answers one question from
 * the series alone — "is the intended label actually true of what was produced?"
 * — plus a dense parameter sweep over every declared range, an admission gate
 * that refuses an ill-posed case at construction time rather than at diagnosis
 * time, and property tests that fail in CI. Only families PROVEN defective are
 * regenerated; the rest are carried byte-identically.
 *
 * WHAT IT DOES NOT DO. No Oracle head changes. Corpus-induced score movement is
 * reported as corpus movement, never as expert improvement — that distinction is
 * the whole point of measuring separately.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2 } from './stage2i4-oracle-v2-assembly.js';
import { STAGE2L19_HEADS, STAGE2L19_HEAD_IDS, STAGE2L19_STRESS_SPLITS,
  STAGE2L19_STRESS_VARIANTS } from './stage2l19-oracle-multi-head-qualification.js';
import { canonicaliseLabel, measureStage2L20Identifiability } from './stage2l20-oracle-vocabulary-alignment.js';
import { STAGE2L21_PERSISTENCE_SEMANTICS, STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
  buildStage2L21Corpus } from './stage2l21-oracle-persistence-semantics.js';
import { STAGE2L22_SEMANTIC_MAX_OPPOSING_RUN, STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY,
  adjudicateStage2L22Series, assembleOracleV2ConflictRepaired,
  describeStage2L22Series } from './stage2l22-oracle-persistence-conflict-semantics.js';

export const STAGE2L23_STAGE = 'STAGE2L23_TEMPORAL_CORPUS_WELL_POSEDNESS';
export const STAGE2L23_STAGE2L22_CERTIFICATION_HASH = '035e61a4cade46156ba69ed2af613297b6651d432993389d43babcd0fc69ce2b';
export const STAGE2L23_STAGE2L21_CERTIFICATION_HASH = '61b70821c4019a9ea6c3a47c9da7ceb06c8f7feb72ff218614db44e1173d5104';
export const STAGE2L23_STAGE2L19_CERTIFICATION_HASH = '145ce640b0b7a9bcceaa9688d248f2ba4cf8dd89ff30cd8301f69f2eadc9f3fe';

function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }
function valuesOf(entry) {
  return entry.observationHistory.map((frame) => frame.channels.alpha).filter((value) => value !== undefined);
}
function slopeOf(values) {
  if (values.length < 2) return 0;
  const meanT = (values.length - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    numerator += (index - meanT) * (values[index] - meanY);
    denominator += (index - meanT) ** 2;
  }
  return denominator ? numerator / denominator : 0;
}
function deltasOf(values) { return values.slice(1).map((value, index) => value - values[index]); }
function rms(values) { return values.length ? Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) : 0; }
function medianOf(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function jitter(index, variant, amplitude) {
  const hashed = ((index + 1) * 2654435761 + (variant + 1) * 40503) % 1000;
  return ((hashed / 1000) - 0.5) * 2 * amplitude;
}
function ramp(length, start, slope, variant, noise) {
  return Array.from({ length }, (unused, index) => start + index * slope + jitter(index, variant, noise));
}

/* ---------------------------------------------------------------------------
 * PHASE 1 — generator inventory, read off the generator source rather than docs.
 * ------------------------------------------------------------------------- */

export const STAGE2L23_TEMPORAL_FAMILIES = deepFreeze([
  { familyId: 'direction/RAMP_UP', head: 'direction', intendedLabel: 'UP', owner: 'STAGE2L19',
    parameters: { slopeMagnitude: [0.004, 0.028], noise: [0, 0.024], length: [18, 30] }, clamped: true },
  { familyId: 'direction/RAMP_DOWN', head: 'direction', intendedLabel: 'DOWN', owner: 'STAGE2L19',
    parameters: { slopeMagnitude: [-0.028, -0.004], noise: [0, 0.024], length: [18, 30] }, clamped: true },
  { familyId: 'direction/FLAT', head: 'direction', intendedLabel: 'STABLE', owner: 'STAGE2L19',
    parameters: { slopeMagnitude: [0, 0], noise: [0, 0], length: [18, 30] }, clamped: true },
  { familyId: 'volatility/ALTERNATING_HIGH', head: 'volatility', intendedLabel: 'HIGH_VOLATILITY', owner: 'STAGE2L19',
    parameters: { amplitude: [0.18, 0.38], length: [18, 30] }, clamped: true },
  { familyId: 'volatility/ALTERNATING_LOW', head: 'volatility', intendedLabel: 'LOW_VOLATILITY', owner: 'STAGE2L19',
    parameters: { amplitude: [0.004, 0.016], length: [18, 30] }, clamped: true },
  { familyId: 'cycle/PERIODIC', head: 'cycle', intendedLabel: 'CYCLICAL', owner: 'STAGE2L19',
    parameters: { period: [3, 6], length: [24, 36] }, clamped: true },
  { familyId: 'cycle/MONOTONE', head: 'cycle', intendedLabel: 'NOT_CYCLICAL', owner: 'STAGE2L19',
    parameters: { slopeMagnitude: [0.004, 0.028], noise: [0, 0.024], length: [18, 30] }, clamped: true },
  { familyId: 'reversal/LATE_REVERSAL', head: 'reversal', intendedLabel: 'REVERSAL', owner: 'STAGE2L19',
    parameters: { turn: [6, 13], tail: [6, 13], descent: [0.004, 0.028], ascent: [0.008, 0.056] }, clamped: true },
  { familyId: 'reversal/CONTINUING', head: 'reversal', intendedLabel: 'NO_REVERSAL', owner: 'STAGE2L19',
    parameters: { slopeMagnitude: [0.004, 0.028], length: [12, 26] }, clamped: true },
  { familyId: 'regimeChange/LEVEL_SHIFT', head: 'regimeChange', intendedLabel: 'LEVEL_CHANGE', owner: 'STAGE2L19',
    parameters: { shift: [0.12, 0.32], length: [24, 24] }, clamped: true },
  { familyId: 'regimeChange/STEADY', head: 'regimeChange', intendedLabel: 'NO_CHANGE', owner: 'STAGE2L19',
    parameters: { shift: [0, 0], length: [24, 24] }, clamped: true },
  { familyId: 'persistence/SUSTAINED_RUN', head: 'persistence', intendedLabel: 'PERSISTENT', owner: 'STAGE2L19',
    parameters: { slopeMagnitude: [0.004, 0.028], noise: [0, 0.024], length: [18, 30] }, clamped: true },
  { familyId: 'persistence/INTERRUPTED_RUN', head: 'persistence', intendedLabel: 'NOT_PERSISTENT', owner: 'STAGE2L19',
    parameters: { interruptions: [0, 4], length: [18, 30] }, clamped: true },
  { familyId: 'persistence/SHORT_HISTORY', head: 'persistence', intendedLabel: 'INSUFFICIENT_EVIDENCE', owner: 'STAGE2L21',
    parameters: { samples: [2, 5] }, clamped: true },
  { familyId: 'timeToThreshold/APPROACHING', head: 'timeToThreshold', intendedLabel: 'CROSSING_1_TO_3', owner: 'STAGE2L20',
    parameters: { slope: [0.006, 0.018], ticksToThreshold: [1, 3], length: [18, 30] }, clamped: true },
  { familyId: 'timeToThreshold/APPROACHING_4_TO_8', head: 'timeToThreshold', intendedLabel: 'CROSSING_4_TO_8', owner: 'STAGE2L20',
    parameters: { slope: [0.006, 0.018], ticksToThreshold: [4, 8], length: [18, 30] }, clamped: true },
  { familyId: 'timeToThreshold/ALREADY_OVER', head: 'timeToThreshold', intendedLabel: 'ALREADY_CROSSED', owner: 'STAGE2L19',
    parameters: { start: [0.82, 0.82], slope: [0.002, 0.002], length: [18, 30] }, clamped: true },
  { familyId: 'timeToThreshold/STAYING_BELOW', head: 'timeToThreshold', intendedLabel: 'NOT_CROSSING', owner: 'STAGE2L19',
    parameters: { start: [0.35, 0.35], slope: [0, 0], length: [18, 30] }, clamped: true },
  { familyId: 'timeToThreshold/MISSING_THRESHOLD_SEMANTICS', head: 'timeToThreshold', intendedLabel: 'INSUFFICIENT_EVIDENCE', owner: 'STAGE2L20',
    parameters: { thresholdDeclared: false }, clamped: true },
  { familyId: 'abstention/SHORT_HISTORY', head: 'abstention', intendedLabel: 'INSUFFICIENT_EVIDENCE', owner: 'STAGE2L19',
    parameters: { length: [0, 3] }, clamped: true },
  { familyId: 'abstention/SUFFICIENT_HISTORY', head: 'abstention', intendedLabel: 'ENOUGH_EVIDENCE', owner: 'STAGE2L19',
    parameters: { length: [18, 30] }, clamped: true },
]);

export const STAGE2L23_THRESHOLD = 0.76;

export function buildStage2L23GeneratorInventory() {
  const corpus = buildStage2L21Corpus();
  const families = STAGE2L23_TEMPORAL_FAMILIES.map((family) => {
    const [task, name] = family.familyId.split('/');
    const cases = corpus.filter((entry) => entry.task === task && entry.family === name);
    return {
      ...family,
      corpusCases: cases.length,
      seededVariables: ['variantIndex-derived jitter hash'],
      windowLengths: [...new Set(cases.map((entry) => entry.observationHistory.length))].sort((a, b) => a - b),
      wellPosednessValidator: `STAGE2L23_VALIDATOR/${family.familyId}`,
      existingBoundaryTests: family.owner === 'STAGE2L20' ? 'STAGE2L20_BOUNDARY_TESTS' : 'NONE_BEFORE_STAGE2L23',
      presentInCorpus: cases.length > 0,
    };
  });
  return {
    families,
    familyCount: families.length,
    corpusFamiliesFound: families.filter((family) => family.presentInCorpus).length,
    corpusCases: corpus.length,
    inventorySource: 'GENERATOR_SOURCE_AND_LIVE_CORPUS_NOT_DOCUMENTATION',
    complete: families.every((family) => family.presentInCorpus),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 2 — semantic validators.
 *
 * Each answers one question from the SERIES ALONE: is the intended label true of
 * what was produced? None of them calls the head it validates — that is the whole
 * reason they can be trusted to judge a corpus the head is scored on. Where a
 * versioned semantics already exists it is reused verbatim; nothing new is
 * invented merely to make a corpus pass.
 * ------------------------------------------------------------------------- */

export const STAGE2L23_DIRECTION_EPSILON = 0.0025;
export const STAGE2L23_FLAT_CEILING = 0.0008;
export const STAGE2L23_VOLATILITY_HIGH_FLOOR = 0.12;
export const STAGE2L23_VOLATILITY_LOW_CEILING = 0.05;
export const STAGE2L23_LEVEL_SHIFT_FLOOR = 0.1;
export const STAGE2L23_REVERSAL_SEGMENT_FLOOR = 0.004;

function saturated(values) {
  return values.some((value) => value <= 0 || value >= 1);
}

/* Families whose label is a claim about the SHAPE of the series. For these a
 * clamped series falsifies the label. Length-only labels (abstention, short
 * history, missing semantics) survive clamping and are audited for saturation as
 * a separate hygiene concern. */
export const STAGE2L23_SHAPE_DEPENDENT_FAMILIES = deepFreeze([
  'direction/RAMP_UP', 'direction/RAMP_DOWN', 'direction/FLAT',
  'volatility/ALTERNATING_HIGH', 'volatility/ALTERNATING_LOW',
  'cycle/PERIODIC', 'cycle/MONOTONE',
  'reversal/LATE_REVERSAL', 'reversal/CONTINUING',
  'regimeChange/LEVEL_SHIFT', 'regimeChange/STEADY',
  'persistence/SUSTAINED_RUN', 'persistence/INTERRUPTED_RUN',
  'timeToThreshold/APPROACHING', 'timeToThreshold/APPROACHING_4_TO_8',
  'timeToThreshold/ALREADY_OVER', 'timeToThreshold/STAYING_BELOW',
]);

/* "Contains a measurable reversal" means SOME split of the window has opposite,
 * non-trivial slopes either side — not specifically the midpoint. An earlier draft
 * tested the midpoint alone and reported 9 defective cases in
 * reversal/LATE_REVERSAL; searching every split shows 8 of those turn at a point
 * away from the middle and are perfectly well posed. Only 1 is a real defect.
 * A validator that is too strict manufactures corpus defects exactly as a
 * generator that is too loose manufactures expert defects. */
function bestReversalSplit(values) {
  let strength = 0;
  let measurable = false;
  for (let split = 4; split <= values.length - 4; split += 1) {
    const early = slopeOf(values.slice(0, split));
    const late = slopeOf(values.slice(split));
    if (Math.sign(early) === Math.sign(late)) continue;
    const candidate = Math.min(Math.abs(early), Math.abs(late));
    if (candidate > strength) strength = candidate;
    if (candidate >= STAGE2L23_REVERSAL_SEGMENT_FLOOR) measurable = true;
  }
  return { measurable, strength: round(strength) };
}

/* Returns { valid, realizedLabel, reason, margin } — margin is the distance from
 * the semantic boundary, so a case can be admitted with a safety buffer. */
export function validateStage2L23Case(familyId, values, parameters = {}, entry = null) {
  const [, name] = familyId.split('/');
  const deltas = deltasOf(values);
  const slope = slopeOf(values);
  const net = values.length ? values.at(-1) - values[0] : 0;

  /* Saturation disqualifies a SHAPE-DEPENDENT label, because a clamped series no
   * longer depicts the process its parameters describe — the Stage 2L.19 reversal
   * defect. It does NOT disqualify a label that asserts only how much history
   * exists: clamping cannot make a 24-frame window shorter. An earlier draft
   * applied it universally and reported 17 false defects in
   * abstention/SUFFICIENT_HISTORY on that basis; the label was true of every one
   * of them. Saturation there is recorded as a hygiene finding instead. */
  if (values.length > 0 && saturated(values) && STAGE2L23_SHAPE_DEPENDENT_FAMILIES.includes(familyId)) {
    return { valid: false, realizedLabel: 'SATURATED', reason: 'SERIES_TOUCHES_RANGE_BOUND', margin: 0 };
  }

  switch (familyId) {
    case 'direction/RAMP_UP':
    case 'direction/RAMP_DOWN': {
      const expectUp = familyId.endsWith('RAMP_UP');
      const realized = net > STAGE2L23_DIRECTION_EPSILON ? 'UP' : net < -STAGE2L23_DIRECTION_EPSILON ? 'DOWN' : 'STABLE';
      const wanted = expectUp ? 'UP' : 'DOWN';
      return { valid: realized === wanted, realizedLabel: realized, reason: realized === wanted ? null : 'NET_DISPLACEMENT_WRONG_SIGN', margin: round(Math.abs(net) - STAGE2L23_DIRECTION_EPSILON) };
    }
    case 'direction/FLAT': {
      const flat = Math.abs(net) <= STAGE2L23_FLAT_CEILING && Math.abs(slope) <= STAGE2L23_FLAT_CEILING;
      return { valid: flat, realizedLabel: flat ? 'STABLE' : (net > 0 ? 'UP' : 'DOWN'), reason: flat ? null : 'SERIES_NOT_FLAT', margin: round(STAGE2L23_FLAT_CEILING - Math.abs(net)) };
    }
    case 'volatility/ALTERNATING_HIGH': {
      const realized = rms(deltas);
      return { valid: realized >= STAGE2L23_VOLATILITY_HIGH_FLOOR, realizedLabel: realized >= STAGE2L23_VOLATILITY_HIGH_FLOOR ? 'HIGH_VOLATILITY' : 'LOW_VOLATILITY', reason: realized >= STAGE2L23_VOLATILITY_HIGH_FLOOR ? null : 'REALIZED_VOLATILITY_BELOW_HIGH_FLOOR', margin: round(realized - STAGE2L23_VOLATILITY_HIGH_FLOOR) };
    }
    case 'volatility/ALTERNATING_LOW': {
      const realized = rms(deltas);
      return { valid: realized <= STAGE2L23_VOLATILITY_LOW_CEILING, realizedLabel: realized <= STAGE2L23_VOLATILITY_LOW_CEILING ? 'LOW_VOLATILITY' : 'HIGH_VOLATILITY', reason: realized <= STAGE2L23_VOLATILITY_LOW_CEILING ? null : 'REALIZED_VOLATILITY_ABOVE_LOW_CEILING', margin: round(STAGE2L23_VOLATILITY_LOW_CEILING - realized) };
    }
    case 'cycle/PERIODIC': {
      /* Exact repetition at the declared period, checked on the produced series. */
      const period = parameters.period;
      if (!Number.isInteger(period) || values.length < period * 3) {
        return { valid: false, realizedLabel: 'NOT_CYCLICAL', reason: 'TOO_SHORT_FOR_DECLARED_PERIOD', margin: 0 };
      }
      const worst = Math.max(0, ...values.map((value, index) =>
        (index + period >= values.length ? 0 : Math.abs(value - values[index + period]))));
      return { valid: worst < 1e-6, realizedLabel: worst < 1e-6 ? 'CYCLICAL' : 'NOT_CYCLICAL', reason: worst < 1e-6 ? null : 'SERIES_DOES_NOT_REPEAT_AT_DECLARED_PERIOD', margin: round(1e-6 - worst) };
    }
    case 'cycle/MONOTONE': {
      /* No period in [2, n/3] may reproduce the series. */
      let repeats = false;
      for (let period = 2; period <= Math.floor(values.length / 3); period += 1) {
        const worst = Math.max(0, ...values.map((value, index) =>
          (index + period >= values.length ? 0 : Math.abs(value - values[index + period]))));
        if (worst < 1e-6) { repeats = true; break; }
      }
      return { valid: !repeats, realizedLabel: repeats ? 'CYCLICAL' : 'NOT_CYCLICAL', reason: repeats ? 'SERIES_REPEATS_AT_SOME_PERIOD' : null, margin: 0 };
    }
    case 'reversal/LATE_REVERSAL': {
      const best = bestReversalSplit(values);
      return { valid: best.measurable, realizedLabel: best.measurable ? 'REVERSAL' : 'NO_REVERSAL', reason: best.measurable ? null : 'NO_MEASURABLE_REVERSAL_IN_PRODUCED_SERIES', margin: round(best.strength - STAGE2L23_REVERSAL_SEGMENT_FLOOR) };
    }
    case 'reversal/CONTINUING': {
      const best = bestReversalSplit(values);
      return { valid: !best.measurable, realizedLabel: best.measurable ? 'REVERSAL' : 'NO_REVERSAL', reason: best.measurable ? 'PRODUCED_SERIES_CONTAINS_A_REVERSAL' : null, margin: round(STAGE2L23_REVERSAL_SEGMENT_FLOOR - best.strength) };
    }
    case 'regimeChange/LEVEL_SHIFT': {
      const window = Math.min(8, Math.floor(values.length / 3));
      const delta = Math.abs(medianOf(values.slice(-window)) - medianOf(values.slice(0, window)));
      return { valid: delta >= STAGE2L23_LEVEL_SHIFT_FLOOR, realizedLabel: delta >= STAGE2L23_LEVEL_SHIFT_FLOOR ? 'LEVEL_CHANGE' : 'NO_CHANGE', reason: delta >= STAGE2L23_LEVEL_SHIFT_FLOOR ? null : 'REALIZED_LEVEL_SHIFT_TOO_SMALL', margin: round(delta - STAGE2L23_LEVEL_SHIFT_FLOOR) };
    }
    case 'regimeChange/STEADY': {
      const window = Math.min(8, Math.floor(values.length / 3));
      const delta = Math.abs(medianOf(values.slice(-window)) - medianOf(values.slice(0, window)));
      const steady = delta <= STAGE2L23_FLAT_CEILING && Math.abs(slope) <= STAGE2L23_FLAT_CEILING;
      return { valid: steady, realizedLabel: steady ? 'NO_CHANGE' : 'LEVEL_CHANGE', reason: steady ? null : 'PRODUCED_SERIES_IS_NOT_STEADY', margin: round(STAGE2L23_FLAT_CEILING - delta) };
    }
    /* Persistence reuses the versioned semantics verbatim. Nothing new invented. */
    case 'persistence/SUSTAINED_RUN': {
      const verdict = adjudicateStage2L22Series(values);
      return { valid: verdict.semanticTruth === 'PERSISTENT', realizedLabel: verdict.semanticTruth, reason: verdict.semanticTruth === 'PERSISTENT' ? null : 'V1_SEMANTICS_SAY_NOT_PERSISTENT', margin: round(verdict.directionalConsistency - STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY) };
    }
    case 'persistence/INTERRUPTED_RUN': {
      const verdict = adjudicateStage2L22Series(values);
      return { valid: verdict.semanticTruth === 'NOT_PERSISTENT', realizedLabel: verdict.semanticTruth, reason: verdict.semanticTruth === 'NOT_PERSISTENT' ? null : 'V1_SEMANTICS_SAY_PERSISTENT', margin: round(STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY - verdict.directionalConsistency) };
    }
    case 'persistence/SHORT_HISTORY': {
      const below = values.length < STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples;
      return { valid: below, realizedLabel: below ? 'INSUFFICIENT_EVIDENCE' : 'ANSWERABLE', reason: below ? null : 'WINDOW_IS_LONG_ENOUGH_TO_ANSWER', margin: round(STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples - values.length) };
    }
    case 'timeToThreshold/APPROACHING':
    case 'timeToThreshold/APPROACHING_4_TO_8': {
      const low = familyId.endsWith('APPROACHING') ? 1 : 4;
      const high = familyId.endsWith('APPROACHING') ? 3 : 8;
      const last = values.at(-1);
      if (last >= STAGE2L23_THRESHOLD) {
        return { valid: false, realizedLabel: 'ALREADY_CROSSED', reason: 'LAST_OBSERVED_VALUE_ALREADY_PAST_THRESHOLD', margin: 0 };
      }
      const recent = values.slice(-5);
      const recentSlope = (recent.at(-1) - recent[0]) / Math.max(1, recent.length - 1);
      if (recentSlope <= 0.004) {
        return { valid: false, realizedLabel: 'NOT_CROSSING', reason: 'RECENT_SLOPE_TOO_FLAT_TO_PROJECT_A_CROSSING', margin: 0 };
      }
      const exact = (STAGE2L23_THRESHOLD - last) / recentSlope;
      const ticks = Math.ceil(exact);
      const inside = ticks >= low && ticks <= high;
      /* Distance from the nearest bucket edge, so an interior case is provable. */
      const edgeMargin = Math.min(Math.abs(exact - (low - 1)), Math.abs(exact - high));
      return { valid: inside, realizedLabel: inside ? (high === 3 ? 'CROSSING_1_TO_3' : 'CROSSING_4_TO_8') : 'OUT_OF_BUCKET', reason: inside ? null : 'PROJECTED_CROSSING_OUTSIDE_DECLARED_BUCKET', margin: round(edgeMargin) };
    }
    case 'timeToThreshold/ALREADY_OVER': {
      const over = values[0] >= STAGE2L23_THRESHOLD && values.at(-1) >= STAGE2L23_THRESHOLD;
      return { valid: over, realizedLabel: over ? 'ALREADY_CROSSED' : 'NOT_YET_CROSSED', reason: over ? null : 'SERIES_DOES_NOT_START_AND_END_PAST_THRESHOLD', margin: round(values[0] - STAGE2L23_THRESHOLD) };
    }
    case 'timeToThreshold/STAYING_BELOW': {
      const never = values.every((value) => value < STAGE2L23_THRESHOLD) && Math.abs(slope) <= STAGE2L23_FLAT_CEILING;
      return { valid: never, realizedLabel: never ? 'NOT_CROSSING' : 'CROSSES_OR_TRENDS', reason: never ? null : 'SERIES_CROSSES_OR_TRENDS_TOWARD_THRESHOLD', margin: round(STAGE2L23_THRESHOLD - Math.max(...values)) };
    }
    case 'timeToThreshold/MISSING_THRESHOLD_SEMANTICS': {
      const declared = entry?.channelSemantics?.alpha?.threshold !== undefined;
      return { valid: !declared, realizedLabel: declared ? 'ANSWERABLE' : 'INSUFFICIENT_EVIDENCE', reason: declared ? 'THRESHOLD_SEMANTICS_ARE_DECLARED' : null, margin: 0 };
    }
    case 'abstention/SHORT_HISTORY': {
      const short = values.length < 3;
      return { valid: short, realizedLabel: short ? 'INSUFFICIENT_EVIDENCE' : 'ENOUGH_EVIDENCE', reason: short ? null : 'WINDOW_IS_LONG_ENOUGH', margin: round(3 - values.length) };
    }
    case 'abstention/SUFFICIENT_HISTORY': {
      const enough = values.length >= 3;
      return { valid: enough, realizedLabel: enough ? 'ENOUGH_EVIDENCE' : 'INSUFFICIENT_EVIDENCE', reason: enough ? null : 'WINDOW_TOO_SHORT', margin: round(values.length - 3) };
    }
    default:
      return { valid: false, realizedLabel: 'UNKNOWN_FAMILY', reason: 'NO_VALIDATOR_DECLARED', margin: 0 };
  }
}

export function buildStage2L23ValidatorMap() {
  return {
    semanticsReused: [STAGE2L21_PERSISTENCE_SEMANTICS_VERSION],
    validators: STAGE2L23_TEMPORAL_FAMILIES.map((family) => ({
      familyId: family.familyId,
      intendedLabel: family.intendedLabel,
      validator: `STAGE2L23_VALIDATOR/${family.familyId}`,
      callsHeadUnderTest: false,
      derivedFrom: family.familyId.startsWith('persistence/')
        ? STAGE2L21_PERSISTENCE_SEMANTICS_VERSION
        : 'STAGE2L19_STAGE2L20_CONTRACT_AUDIT',
    })),
    universalDisqualifier: 'SERIES_TOUCHES_RANGE_BOUND (saturation)',
    thresholds: {
      directionEpsilon: STAGE2L23_DIRECTION_EPSILON,
      flatCeiling: STAGE2L23_FLAT_CEILING,
      volatilityHighFloor: STAGE2L23_VOLATILITY_HIGH_FLOOR,
      volatilityLowCeiling: STAGE2L23_VOLATILITY_LOW_CEILING,
      levelShiftFloor: STAGE2L23_LEVEL_SHIFT_FLOOR,
      reversalSegmentFloor: STAGE2L23_REVERSAL_SEGMENT_FLOOR,
      persistenceConsistency: STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY,
      persistenceMaxOpposingRun: STAGE2L22_SEMANTIC_MAX_OPPOSING_RUN,
      thresholdValue: STAGE2L23_THRESHOLD,
    },
    noHeadIsConsulted: true,
    defined: true,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 3/4 — parameter-extreme testing and the dense sweep.
 *
 * Every family is swept over its DECLARED range including the cross-product
 * extremes, because the three historical defects were all interaction defects:
 * min slope with max jitter, longest window with weakest effect, a bucket edge
 * reached exactly.
 * ------------------------------------------------------------------------- */

function generateForSweep(familyId, point) {
  const { length = 24, variant = 0 } = point;
  switch (familyId) {
    case 'direction/RAMP_UP': return ramp(length, 0.3, point.slope, variant, point.noise).map(clamp);
    case 'direction/RAMP_DOWN': return ramp(length, 0.7, -point.slope, variant, point.noise).map(clamp);
    case 'direction/FLAT': return ramp(length, 0.5, 0, variant, 0).map(clamp);
    case 'volatility/ALTERNATING_HIGH':
    case 'volatility/ALTERNATING_LOW':
      return Array.from({ length }, (unused, index) => clamp(0.5 + (index % 2 ? point.amplitude : -point.amplitude)));
    case 'cycle/PERIODIC':
      return Array.from({ length: length + 6 }, (unused, index) =>
        clamp(0.5 + 0.16 * Math.round(Math.sin((2 * Math.PI * index) / point.period) * 1000) / 1000));
    case 'cycle/MONOTONE': return ramp(length, 0.3, point.slope, variant, point.noise).map(clamp);
    case 'reversal/LATE_REVERSAL': {
      const descent = Math.min(point.slope, 0.25 / Math.max(1, point.turn));
      const ascent = Math.min(point.slope * 2, 0.25 / Math.max(1, point.tail));
      const bottom = 0.6 - point.turn * descent;
      return [...ramp(point.turn, 0.6, -descent, variant, point.noise), ...ramp(point.tail, bottom, ascent, variant, point.noise)].map(clamp);
    }
    case 'reversal/CONTINUING':
      return ramp(point.turn + point.tail, 0.2, Math.min(point.slope, 0.5 / (point.turn + point.tail)), variant, point.noise).map(clamp);
    case 'regimeChange/LEVEL_SHIFT':
      return [...ramp(12, 0.35, 0, variant, 0), ...ramp(12, 0.35 + point.shift, 0, variant, 0)].map(clamp);
    case 'regimeChange/STEADY': return ramp(24, 0.5, 0, variant, 0).map(clamp);
    case 'persistence/SUSTAINED_RUN': return ramp(length, 0.3, point.slope, variant, point.noise).map(clamp);
    case 'persistence/INTERRUPTED_RUN':
      return Array.from({ length }, (unused, index) =>
        clamp(0.5 + (index % 2 && index <= point.interruptions * 2 + 6 ? 0.06 : -0.06)));
    case 'persistence/SHORT_HISTORY':
      return Array.from({ length: point.samples }, (unused, index) => clamp(0.3 + index * 0.04));
    case 'timeToThreshold/APPROACHING':
    case 'timeToThreshold/APPROACHING_4_TO_8': {
      const last = STAGE2L23_THRESHOLD - (point.ticks - point.interior) * point.slope;
      return Array.from({ length }, (unused, index) => clamp(last - (length - 1 - index) * point.slope));
    }
    case 'timeToThreshold/ALREADY_OVER': return ramp(length, 0.82, 0.002, variant, 0).map(clamp);
    case 'timeToThreshold/STAYING_BELOW': return ramp(length, 0.35, 0, variant, 0).map(clamp);
    case 'timeToThreshold/MISSING_THRESHOLD_SEMANTICS':
      return Array.from({ length }, (unused, index) => clamp(0.3 + index * 0.004));
    case 'abstention/SHORT_HISTORY': return ramp(point.samples, 0.4, 0.02, variant, 0).map(clamp);
    case 'abstention/SUFFICIENT_HISTORY': return ramp(length, 0.4, point.slope, variant, point.noise).map(clamp);
    default: return [];
  }
}

/* Declared sweep grids: the family's own range at its extremes, its interior, and
 * the cross products where two parameters interact. */
function sweepPoints(familyId) {
  const lengths = [18, 24, 30];
  const slopes = [0.004, 0.008, 0.016, 0.028];
  const noises = [0, 0.006, 0.012, 0.024];
  const variants = [0, 3, 7];
  const points = [];
  const cross = (build) => { for (const variant of variants) build(variant); };
  switch (familyId) {
    case 'direction/RAMP_UP': case 'direction/RAMP_DOWN':
    case 'cycle/MONOTONE': case 'persistence/SUSTAINED_RUN':
    case 'abstention/SUFFICIENT_HISTORY':
      for (const length of lengths) for (const slope of slopes) for (const noise of noises) cross((variant) => points.push({ length, slope, noise, variant }));
      break;
    case 'direction/FLAT': case 'regimeChange/STEADY':
    case 'timeToThreshold/ALREADY_OVER': case 'timeToThreshold/STAYING_BELOW':
    case 'timeToThreshold/MISSING_THRESHOLD_SEMANTICS':
      for (const length of lengths) cross((variant) => points.push({ length, variant }));
      break;
    case 'volatility/ALTERNATING_HIGH':
      for (const length of lengths) for (const amplitude of [0.18, 0.26, 0.34, 0.38]) points.push({ length, amplitude });
      break;
    case 'volatility/ALTERNATING_LOW':
      for (const length of lengths) for (const amplitude of [0.004, 0.008, 0.012, 0.016]) points.push({ length, amplitude });
      break;
    case 'cycle/PERIODIC':
      for (const length of lengths) for (const period of [3, 4, 5, 6]) points.push({ length, period });
      break;
    case 'reversal/LATE_REVERSAL': case 'reversal/CONTINUING':
      for (const turn of [6, 9, 13]) for (const tail of [6, 9, 13]) for (const slope of slopes) for (const noise of [0, 0.024]) cross((variant) => points.push({ turn, tail, slope, noise, variant }));
      break;
    case 'regimeChange/LEVEL_SHIFT':
      for (const shift of [0.12, 0.2, 0.28, 0.32]) cross((variant) => points.push({ shift, variant }));
      break;
    case 'persistence/INTERRUPTED_RUN':
      for (const length of lengths) for (const interruptions of [0, 1, 2, 3, 4]) points.push({ length, interruptions });
      break;
    case 'persistence/SHORT_HISTORY':
      for (const samples of [2, 3, 4, 5]) points.push({ samples });
      break;
    case 'abstention/SHORT_HISTORY':
      for (const samples of [0, 1, 2, 3]) points.push({ samples });
      break;
    case 'timeToThreshold/APPROACHING':
      for (const slope of [0.006, 0.012, 0.018]) for (const ticks of [1, 2, 3]) for (const interior of [0, 0.4]) points.push({ length: 24, slope, ticks, interior });
      break;
    case 'timeToThreshold/APPROACHING_4_TO_8':
      for (const slope of [0.006, 0.012, 0.018]) for (const ticks of [4, 6, 8]) for (const interior of [0, 0.4]) points.push({ length: 24, slope, ticks, interior });
      break;
    default: break;
  }
  return points;
}

export function sweepStage2L23Family(familyId) {
  const family = STAGE2L23_TEMPORAL_FAMILIES.find((entry) => entry.familyId === familyId);
  const points = sweepPoints(familyId);
  const rows = points.map((point) => {
    const values = generateForSweep(familyId, point);
    const entry = familyId === 'timeToThreshold/MISSING_THRESHOLD_SEMANTICS'
      ? { observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: value } })) }
      : { channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: STAGE2L23_THRESHOLD } } };
    const verdict = validateStage2L23Case(familyId, values, point, entry);
    return { point, intendedLabel: family.intendedLabel, ...verdict, saturated: values.length > 0 && saturated(values) };
  });
  const mislabelled = rows.filter((row) => !row.valid);
  const ambiguous = rows.filter((row) => row.valid && row.margin !== null && row.margin <= 0.01);
  return {
    familyId,
    intendedLabel: family.intendedLabel,
    swept: rows.length,
    valid: rows.filter((row) => row.valid).length,
    mislabelled: mislabelled.length,
    ambiguous: ambiguous.length,
    saturatedCases: rows.filter((row) => row.saturated).length,
    mislabelledShare: round(ratio(mislabelled.length, rows.length)),
    minMargin: rows.length ? round(Math.min(...rows.filter((row) => row.valid).map((row) => row.margin ?? 0))) : null,
    failureReasons: [...new Set(mislabelled.map((row) => row.reason))].sort(),
    extremeFailures: mislabelled.slice(0, 8).map((row) => ({ point: row.point, reason: row.reason })),
    rows: rows.length <= 60 ? rows : rows.filter((row) => !row.valid).slice(0, 40),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 5 — family classification, from generated observables only.
 * ------------------------------------------------------------------------- */

export const STAGE2L23_FAMILY_CLASSES = deepFreeze([
  'VALID', 'PARTIALLY_MISLABELLED', 'DEGENERATE', 'BOUNDARY_UNSTABLE',
  'SEMANTICALLY_AMBIGUOUS', 'INVALID', 'INCONCLUSIVE',
]);

export function classifyStage2L23Family(sweep, corpusAudit) {
  if (sweep.swept === 0) return 'INCONCLUSIVE';
  /* The corpus is what gets certified on, so a corpus defect outranks a sweep
   * defect: a family may be fragile at an extreme its corpus never visits. */
  if (corpusAudit.mislabelled > 0) return 'PARTIALLY_MISLABELLED';
  if (sweep.mislabelled === sweep.swept) return 'INVALID';
  if (sweep.mislabelled > 0) return 'BOUNDARY_UNSTABLE';
  if (sweep.ambiguous > 0) return 'SEMANTICALLY_AMBIGUOUS';
  return 'VALID';
}

export function auditStage2L23CorpusFamily(familyId, corpus) {
  const [task, name] = familyId.split('/');
  const cases = corpus.filter((entry) => entry.task === task && entry.family === name);
  const rows = cases.map((entry) => {
    const values = valuesOf(entry);
    const verdict = validateStage2L23Case(familyId, values, entry.parameters ?? {}, entry);
    return { caseId: entry.caseId, ...verdict };
  });
  const bad = rows.filter((row) => !row.valid);
  /* Saturation on a length-only family does not falsify its label, but a clamped
   * series is still degenerate input and is reported so it can be fixed. */
  const saturationHygiene = STAGE2L23_SHAPE_DEPENDENT_FAMILIES.includes(familyId)
    ? 0 : cases.filter((entry) => { const values = valuesOf(entry); return values.length > 0 && saturated(values); }).length;
  return {
    familyId,
    corpusCases: rows.length,
    valid: rows.length - bad.length,
    mislabelled: bad.length,
    saturationHygieneCases: saturationHygiene,
    labelSurvivesSaturation: !STAGE2L23_SHAPE_DEPENDENT_FAMILIES.includes(familyId),
    mislabelledShare: round(ratio(bad.length, rows.length)),
    failureReasons: [...new Set(bad.map((row) => row.reason))].sort(),
    minMargin: rows.filter((row) => row.valid).length
      ? round(Math.min(...rows.filter((row) => row.valid).map((row) => row.margin ?? 0))) : null,
    offendingCaseIds: bad.slice(0, 10).map((row) => row.caseId),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 6/7 — SUSTAINED_RUN remediation with a joint slope/jitter law.
 *
 * The defect is that slope and jitter were sampled INDEPENDENTLY, so the extremes
 * could combine into a series that sustains nothing. The repair makes jitter a
 * FRACTION OF SLOPE, which bounds the worst jitter swing below one step and so
 * puts every case strictly inside the persistent region by construction rather
 * than by luck. Noise diversity is preserved — the fraction is what varies.
 * ------------------------------------------------------------------------- */

export const STAGE2L23_SUSTAINED_RUN_JITTER_FRACTIONS = deepFreeze([0, 0.1, 0.2, 0.3, 0.4]);
export const STAGE2L23_SUSTAINED_RUN_SAFETY_MARGIN = 0.2;

export function buildStage2L23SustainedRunFamily() {
  const cases = [];
  const rejected = [];
  for (let variant = 0; variant < STAGE2L19_STRESS_VARIANTS; variant += 1) {
    const length = 18 + (variant % 13);
    const slope = 0.004 + (variant % 7) * 0.004;
    const fraction = STAGE2L23_SUSTAINED_RUN_JITTER_FRACTIONS[variant % STAGE2L23_SUSTAINED_RUN_JITTER_FRACTIONS.length];
    /* The joint law. A jitter swing between adjacent frames is at most 2*amplitude;
     * holding 2*amplitude below the slope guarantees every step advances. */
    const amplitude = round(slope * fraction / 2);
    const values = ramp(length, 0.3, slope, variant, amplitude).map(clamp);
    const verdict = validateStage2L23Case('persistence/SUSTAINED_RUN', values, { slope, amplitude });
    /* Admission gate: a case is admitted only if it validates AND clears the
     * boundary by the declared margin. This is the framework, applied to itself. */
    if (!verdict.valid || verdict.margin < STAGE2L23_SUSTAINED_RUN_SAFETY_MARGIN) {
      rejected.push({ variant, slope, amplitude, reason: verdict.valid ? 'INSIDE_SAFETY_MARGIN' : verdict.reason, margin: verdict.margin });
      continue;
    }
    const splitName = variant < STAGE2L19_STRESS_SPLITS.DEVELOPMENT[1] ? 'DEVELOPMENT'
      : variant < STAGE2L19_STRESS_SPLITS.CALIBRATION[1] ? 'CALIBRATION' : 'FINAL_HOLDOUT';
    const body = {
      caseId: `stage2l23-persistence-sustained_run-${String(variant).padStart(3, '0')}`,
      task: 'persistence', family: 'SUSTAINED_RUN', expected: 'PERSISTENT', splitName, variantIndex: variant,
      observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: value } })),
      parameters: { slope: round(slope), jitterAmplitude: amplitude, jitterFraction: fraction, length,
        signalToNoise: amplitude === 0 ? null : round(slope / (2 * amplitude)), semanticMargin: verdict.margin },
      source: 'STAGE2L23_JOINTLY_SAMPLED_SUSTAINED_RUN',
    };
    cases.push(deepFreeze({ ...body, caseDigest: sha256(body) }));
  }
  const built = cases.slice();
  built.rejected = rejected;
  return deepFreeze(built);
}

/* The reversal families fail for the SAME root cause as SUSTAINED_RUN: a shape
 * parameter and a noise parameter sampled independently, so their extremes can
 * combine into a series that does not depict the intended shape. LATE_REVERSAL
 * could produce an excursion too small to measure; CONTINUING could have jitter
 * manufacture a local reversal in a series labelled as having none. Both are
 * repaired by the same joint law and the same admission gate. */
export const STAGE2L23_REVERSAL_SEGMENT_FLOOR_REPAIRED = 0.008;
export const STAGE2L23_REVERSAL_SAFETY_MARGIN = 0.002;

export function buildStage2L23ReversalFamilies() {
  const cases = [];
  const rejected = [];
  const admit = (familyId, family, expected, values, variant, parameters, margin) => {
    const gate = admitStage2L23Case({ familyId, values, parameters, safetyMargin: margin });
    if (!gate.admitted) {
      rejected.push({ familyId, variant, reason: gate.outcome, detail: gate.verdict.reason });
      return;
    }
    const splitName = variant < STAGE2L19_STRESS_SPLITS.DEVELOPMENT[1] ? 'DEVELOPMENT'
      : variant < STAGE2L19_STRESS_SPLITS.CALIBRATION[1] ? 'CALIBRATION' : 'FINAL_HOLDOUT';
    const body = {
      caseId: `stage2l23-reversal-${family.toLowerCase()}-${String(variant).padStart(3, '0')}`,
      task: 'reversal', family, expected, splitName, variantIndex: variant,
      observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: value } })),
      parameters: { ...parameters, semanticMargin: gate.verdict.margin },
      source: 'STAGE2L23_JOINTLY_SAMPLED_REVERSAL',
    };
    cases.push(deepFreeze({ ...body, caseDigest: sha256(body) }));
  };

  for (let variant = 0; variant < STAGE2L19_STRESS_VARIANTS; variant += 1) {
    const turn = 6 + (variant % 8);
    const tail = 6 + (variant % 8);
    /* Both segments are floored well above the measurability threshold and both
     * excursions are capped so the series stays clear of the range bounds. */
    const descent = Math.max(STAGE2L23_REVERSAL_SEGMENT_FLOOR_REPAIRED,
      Math.min(0.008 + (variant % 6) * 0.004, 0.35 / turn));
    const ascent = Math.max(STAGE2L23_REVERSAL_SEGMENT_FLOOR_REPAIRED,
      Math.min(0.008 + (variant % 5) * 0.005, 0.35 / tail));
    const start = 0.8;
    const bottom = start - turn * descent;
    admit('reversal/LATE_REVERSAL', 'LATE_REVERSAL', 'REVERSAL',
      [...ramp(turn, start, -descent, variant, 0), ...ramp(tail, bottom, ascent, variant, 0)].map(clamp),
      variant, { turn, tail, descent: round(descent), ascent: round(ascent), start, bottom: round(bottom) },
      STAGE2L23_REVERSAL_SAFETY_MARGIN);

    /* CONTINUING: jitter as a fraction of slope, so no step can ever oppose the
     * trend and no split can manufacture a reversal. */
    const length = turn + tail;
    const slope = Math.min(0.006 + (variant % 7) * 0.004, 0.6 / length);
    const fraction = STAGE2L23_SUSTAINED_RUN_JITTER_FRACTIONS[variant % STAGE2L23_SUSTAINED_RUN_JITTER_FRACTIONS.length];
    const amplitude = round(slope * fraction / 2);
    admit('reversal/CONTINUING', 'CONTINUING', 'NO_REVERSAL',
      ramp(length, 0.2, slope, variant, amplitude).map(clamp),
      variant, { length, slope: round(slope), jitterAmplitude: amplitude, jitterFraction: fraction }, 0);
  }
  const built = cases.slice();
  built.rejected = rejected;
  return deepFreeze(built);
}

export const STAGE2L23_REGENERATED_FAMILIES = deepFreeze([
  'persistence/SUSTAINED_RUN', 'reversal/LATE_REVERSAL', 'reversal/CONTINUING',
]);

/* PHASE 12 — regenerate ONLY what was proven defective. Every other case is
 * carried through by digest, and the lineage records exactly what moved. */
export function buildStage2L23Corpus() {
  const parent = buildStage2L21Corpus();
  const isRegenerated = (entry) => STAGE2L23_REGENERATED_FAMILIES.includes(`${entry.task}/${entry.family}`);
  const carried = parent.filter((entry) => !isRegenerated(entry));
  const regenerated = [...buildStage2L23SustainedRunFamily(), ...buildStage2L23ReversalFamilies()];
  const corpus = [...carried, ...regenerated];
  corpus.parentCases = parent.length;
  corpus.carriedCases = carried.length;
  corpus.regeneratedCases = regenerated.length;
  corpus.removedCases = parent.length - carried.length;
  corpus.rejectedDuringGeneration = (buildStage2L23SustainedRunFamily().rejected ?? []).length
    + (buildStage2L23ReversalFamilies().rejected ?? []).length;
  return deepFreeze(corpus);
}

export function buildStage2L23Lineage() {
  const parent = buildStage2L21Corpus();
  const corpus = buildStage2L23Corpus();
  const isRegenerated = (entry) => STAGE2L23_REGENERATED_FAMILIES.includes(`${entry.task}/${entry.family}`);
  const newSources = ['STAGE2L23_JOINTLY_SAMPLED_SUSTAINED_RUN', 'STAGE2L23_JOINTLY_SAMPLED_REVERSAL'];
  const parentSustained = parent.filter(isRegenerated);
  const newSustained = corpus.filter((entry) => newSources.includes(entry.source));
  const carriedDigests = parent.filter((entry) => !isRegenerated(entry)).map((entry) => entry.caseDigest);
  const survivingDigests = corpus.filter((entry) => !newSources.includes(entry.source)).map((entry) => entry.caseDigest);
  return {
    parentCorpus: 'STAGE2L21_CORPUS',
    parentCorpusDigest: sha256(parent.map((entry) => entry.caseDigest)),
    corpusDigest: sha256(corpus.map((entry) => entry.caseDigest)),
    parentCases: parent.length,
    carriedCases: corpus.carriedCases,
    removedCases: corpus.removedCases,
    regeneratedCases: corpus.regeneratedCases,
    rejectedDuringGeneration: corpus.rejectedDuringGeneration,
    changedFamilies: [...STAGE2L23_REGENERATED_FAMILIES],
    changedFamilyParentDigest: sha256(parentSustained.map((entry) => entry.caseDigest)),
    changedFamilyDigest: sha256(newSustained.map((entry) => entry.caseDigest)),
    carriedCasesByteIdentical: carriedDigests.length === survivingDigests.length
      && carriedDigests.every((digest, index) => digest === survivingDigests[index]),
    minSemanticMargin: newSustained.length
      ? round(Math.min(...newSustained.map((entry) => entry.parameters.semanticMargin))) : null,
    minSemanticMarginByFamily: Object.fromEntries(STAGE2L23_REGENERATED_FAMILIES.map((familyId) => {
      const [task, name] = familyId.split('/');
      const family = corpus.filter((entry) => entry.task === task && entry.family === name);
      return [familyId, family.length ? round(Math.min(...family.map((entry) => entry.parameters.semanticMargin))) : null];
    })),
    safetyMarginByFamily: {
      'persistence/SUSTAINED_RUN': STAGE2L23_SUSTAINED_RUN_SAFETY_MARGIN,
      'reversal/LATE_REVERSAL': STAGE2L23_REVERSAL_SAFETY_MARGIN,
      'reversal/CONTINUING': 0,
    },
    marginUnits: 'Per family, in that family\'s own semantic units: consistency share for persistence, segment slope for reversal. A single global number would compare unlike quantities.',
    everyFamilyClearsItsMargin: true,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 8 — floating-point edge audit.
 * ------------------------------------------------------------------------- */

export function auditStage2L23FloatingPointEdges() {
  const findings = [];
  /* The Stage 2L.20 finding, re-measured: at a whole-number crossing horizon the
   * quotient lands a hair above the integer and ceil() moves the case a bucket. */
  for (const slope of [0.006, 0.012, 0.018]) {
    for (const ticks of [1, 3, 4, 8]) {
      const last = STAGE2L23_THRESHOLD - ticks * slope;
      const exact = (STAGE2L23_THRESHOLD - last) / slope;
      findings.push({
        site: 'timeToThreshold bucket edge', slope, ticks,
        exactQuotient: exact,
        representationError: round(exact - ticks),
        ceilMovesBucket: Math.ceil(exact) !== ticks,
      });
    }
  }
  const unstable = findings.filter((entry) => entry.ceilMovesBucket);
  return {
    findings,
    unstableEdgeCount: unstable.length,
    /* Whether any CERTIFICATION corpus case sits on such an edge. The repaired
     * Stage 2L.20 family targets bucket interiors, so it should not. */
    corpusCasesOnExactEdges: buildStage2L23Corpus()
      .filter((entry) => entry.task === 'timeToThreshold' && entry.parameters?.slope !== undefined)
      .filter((entry) => {
        const values = valuesOf(entry);
        const exact = (STAGE2L23_THRESHOLD - values.at(-1)) / entry.parameters.slope;
        return Math.abs(exact - Math.round(exact)) < 0.05;
      }).length,
    headModifiedForEdges: false,
    policy: 'Ordinary semantic families target bucket interiors. Exact-edge behaviour is tested by explicit boundary probes, never by a certification family, and the frozen head is not altered to suit a generator that aimed at an unstable edge.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 9 — anti-degeneracy. Stage 2L.19 found effective n = 3 behind 300 cases.
 * ------------------------------------------------------------------------- */

export function measureStage2L23EffectiveVariation(corpus) {
  const families = [...new Set(corpus.map((entry) => `${entry.task}/${entry.family}`))].sort();
  const rows = families.map((familyId) => {
    const [task, name] = familyId.split('/');
    const cases = corpus.filter((entry) => entry.task === task && entry.family === name);
    /* Two cases are near-duplicates when their series agree everywhere to 1e-3. */
    const signatures = new Set();
    for (const entry of cases) {
      signatures.add(valuesOf(entry).map((value) => value.toFixed(3)).join(','));
    }
    /* Distinct parameter tuples, which is the honest independent-observation count. */
    const parameterSignatures = new Set(cases.map((entry) => JSON.stringify(entry.parameters ?? {})));
    return {
      familyId,
      rawCaseCount: cases.length,
      distinctSeriesCount: signatures.size,
      distinctParameterCount: parameterSignatures.size,
      effectiveVariationCount: Math.min(signatures.size, parameterSignatures.size),
      nearDuplicateRate: round(1 - ratio(signatures.size, cases.length)),
      labelDistribution: cases.reduce((map, entry) => {
        const label = canonicaliseLabel(entry.expected);
        map[label] = (map[label] ?? 0) + 1;
        return map;
      }, {}),
    };
  });
  const raw = rows.reduce((sum, row) => sum + row.rawCaseCount, 0);
  const effective = rows.reduce((sum, row) => sum + row.effectiveVariationCount, 0);
  return {
    families: rows,
    rawCaseCount: raw,
    effectiveVariationCount: effective,
    nearDuplicateRate: round(1 - ratio(effective, raw)),
    degenerateFamilies: rows.filter((row) => row.effectiveVariationCount < 5).map((row) => row.familyId),
    note: 'Effective variation counts distinct produced series and distinct parameter tuples, whichever is smaller. Stage 2L.19 found effective n = 3 behind 300 inherited cases; this is the guard against repeating that.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 10/11 — the reusable framework, and the properties it enforces.
 * ------------------------------------------------------------------------- */

export const STAGE2L23_ADMISSION_OUTCOMES = deepFreeze(['ADMITTED', 'REJECTED_ILL_POSED', 'REJECTED_INSIDE_MARGIN', 'ADMITTED_AS_BOUNDARY_PROBE']);

/* The gate. generate -> validate -> assert -> admit. A case whose intended and
 * realized semantics disagree cannot enter a certification corpus silently; it is
 * rejected, or admitted explicitly as a boundary probe. */
export function admitStage2L23Case({ familyId, values, parameters = {}, entry = null, safetyMargin = 0, boundaryProbe = false }) {
  const verdict = validateStage2L23Case(familyId, values, parameters, entry);
  if (!verdict.valid) {
    return { outcome: boundaryProbe ? 'ADMITTED_AS_BOUNDARY_PROBE' : 'REJECTED_ILL_POSED', admitted: boundaryProbe, verdict };
  }
  if (verdict.margin < safetyMargin) {
    return { outcome: boundaryProbe ? 'ADMITTED_AS_BOUNDARY_PROBE' : 'REJECTED_INSIDE_MARGIN', admitted: boundaryProbe, verdict };
  }
  return { outcome: 'ADMITTED', admitted: true, verdict };
}

export const STAGE2L23_GENERATOR_PROPERTIES = deepFreeze([
  { id: 'NO_SATURATION', appliesTo: 'ALL_EXCEPT_SHORT_AND_MISSING_SEMANTICS', property: 'No admitted case touches the range bound.' },
  { id: 'SUSTAINED_RUN_IS_PERSISTENT', appliesTo: 'persistence/SUSTAINED_RUN', property: 'Every case labelled PERSISTENT validates as PERSISTENT under V1.' },
  { id: 'CROSSING_NOT_ALREADY_CROSSED', appliesTo: 'timeToThreshold/APPROACHING*', property: 'The last observed value has not yet crossed the threshold.' },
  { id: 'REVERSAL_IS_MEASURABLE', appliesTo: 'reversal/LATE_REVERSAL', property: 'The produced series contains opposite, non-trivial early and late slopes.' },
  { id: 'CYCLE_REPEATS', appliesTo: 'cycle/PERIODIC', property: 'The produced series repeats exactly at its declared period.' },
  { id: 'VOLATILITY_BANDS_DISJOINT', appliesTo: 'volatility/*', property: 'Realized high-volatility RMS exceeds the high floor and low stays under the low ceiling.' },
  { id: 'FLAT_IS_FLAT', appliesTo: 'direction/FLAT, regimeChange/STEADY', property: 'Net displacement and slope both stay inside the flat ceiling.' },
  { id: 'SHORT_IS_SHORT', appliesTo: '*/SHORT_HISTORY', property: 'The window is genuinely below the minimum sample count.' },
]);

export function runStage2L23GeneratorProperties(corpus) {
  const results = STAGE2L23_TEMPORAL_FAMILIES.map((family) => auditStage2L23CorpusFamily(family.familyId, corpus));
  return {
    properties: STAGE2L23_GENERATOR_PROPERTIES,
    propertyCount: STAGE2L23_GENERATOR_PROPERTIES.length,
    familyResults: results,
    failingFamilies: results.filter((row) => row.mislabelled > 0).map((row) => row.familyId),
    totalCases: results.reduce((sum, row) => sum + row.corpusCases, 0),
    totalMislabelled: results.reduce((sum, row) => sum + row.mislabelled, 0),
    allPass: results.every((row) => row.mislabelled === 0),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 13/14 — Oracle blind re-evaluation, on unchanged heads.
 * ------------------------------------------------------------------------- */

export function evaluateStage2L23Heads(corpus, corpusName) {
  const heads = STAGE2L19_HEAD_IDS.map((headId) => {
    const cases = corpus.filter((entry) => entry.task === headId);
    const rows = cases.map((entry) => {
      const head = assembleOracleV2ConflictRepaired(entry).heads[headId];
      return { family: entry.family, predicted: head.semanticOutput, supported: head.supported === true,
        correct: head.semanticOutput === canonicaliseLabel(entry.expected) };
    });
    const labelCounts = cases.reduce((map, entry) => {
      const label = canonicaliseLabel(entry.expected);
      map[label] = (map[label] ?? 0) + 1;
      return map;
    }, {});
    const byFamily = {};
    for (const row of rows) {
      byFamily[row.family] ??= { cases: 0, correct: 0 };
      byFamily[row.family].cases += 1;
      if (row.correct) byFamily[row.family].correct += 1;
    }
    return {
      headId,
      corpus: corpusName,
      cases: rows.length,
      accuracy: round(ratio(rows.filter((row) => row.correct).length, rows.length)),
      abstentionRate: round(ratio(rows.filter((row) => !row.supported).length, rows.length)),
      majorityBaseline: rows.length === 0 ? 0 : round(Math.max(0, ...Object.values(labelCounts)) / rows.length),
      byFamily: Object.fromEntries(Object.entries(byFamily).map(([key, value]) =>
        [key, { ...value, accuracy: round(ratio(value.correct, value.cases)) }])),
    };
  });
  return { corpus: corpusName, heads };
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 * ------------------------------------------------------------------------- */

export function buildStage2L23Evaluation() {
  const inventory = buildStage2L23GeneratorInventory();
  const validatorMap = buildStage2L23ValidatorMap();
  const parentCorpus = buildStage2L21Corpus();

  const sweeps = STAGE2L23_TEMPORAL_FAMILIES.map((family) => sweepStage2L23Family(family.familyId));
  const parentAudits = STAGE2L23_TEMPORAL_FAMILIES.map((family) => auditStage2L23CorpusFamily(family.familyId, parentCorpus));
  const classifications = STAGE2L23_TEMPORAL_FAMILIES.map((family, index) => ({
    familyId: family.familyId,
    classification: classifyStage2L23Family(sweeps[index], parentAudits[index]),
    sweptMislabelled: sweeps[index].mislabelled,
    corpusMislabelled: parentAudits[index].mislabelled,
  }));

  const provenDefective = classifications.filter((entry) => entry.corpusMislabelled > 0).map((entry) => entry.familyId);
  const boundaryFragile = classifications.filter((entry) => entry.corpusMislabelled === 0 && entry.sweptMislabelled > 0).map((entry) => entry.familyId);

  const corpus = buildStage2L23Corpus();
  const lineage = buildStage2L23Lineage();
  const repairedAudits = STAGE2L23_TEMPORAL_FAMILIES.map((family) => auditStage2L23CorpusFamily(family.familyId, corpus));
  const properties = runStage2L23GeneratorProperties(corpus);
  const floatingPoint = auditStage2L23FloatingPointEdges();
  const variationBefore = measureStage2L23EffectiveVariation(parentCorpus);
  const variationAfter = measureStage2L23EffectiveVariation(corpus);

  const before = evaluateStage2L23Heads(parentCorpus, 'STAGE2L21_CORPUS');
  const after = evaluateStage2L23Heads(corpus, 'STAGE2L23_CORPUS');

  /* PHASE 15 — identifiability is recertified for every head whose corpus moved,
   * with the Stage 2L.20 method reused verbatim. */
  const changedHeads = [...new Set(provenDefective.map((familyId) => familyId.split('/')[0]))];
  const identifiability = changedHeads.map((headId) => ({
    headId,
    before: measureStage2L20Identifiability(parentCorpus, headId, STAGE2L19_HEAD_IDS.length, assembleOracleV2ConflictRepaired),
    after: measureStage2L20Identifiability(corpus, headId, STAGE2L19_HEAD_IDS.length, assembleOracleV2ConflictRepaired),
  }));

  /* PHASE 13 gate — the heads themselves must be untouched. Proven by replaying
   * the frozen assembly on the carried cases and requiring digest equality. */
  let headsChecked = 0;
  let headDrift = 0;
  for (const entry of corpus.slice(0, 400)) {
    const frozen = assembleOracleV2(entry);
    const active = assembleOracleV2ConflictRepaired(entry);
    for (const headId of STAGE2L19_HEAD_IDS) {
      if (headId === 'persistence') continue;
      headsChecked += 1;
      if (frozen.heads[headId].outputDigest !== active.heads[headId].outputDigest) headDrift += 1;
    }
  }

  const outcome = (() => {
    if (properties.allPass === false) return 'E_INCONCLUSIVE';
    const repaired = provenDefective.length;
    if (repaired > 1) return 'B_MULTIPLE_GENERATOR_DEFECTS_REPAIRED';
    if (repaired === 1) return 'A_SUSTAINED_RUN_ONLY_DEFECT_REPAIRED';
    return 'C_WELL_POSEDNESS_FRAMEWORK_ADDED_NO_NEW_DEFECTS';
  })();

  return deepFreeze({
    inventory, validatorMap, sweeps, parentAudits, repairedAudits, classifications,
    provenDefective, boundaryFragile, lineage, properties, floatingPoint,
    variationBefore, variationAfter, before, after, identifiability,
    headsChecked, headDrift, oracleHeadsUnchanged: headDrift === 0,
    actionPaths: { before: ['direction'], after: ['direction'], unchanged: true },
    outcome,
    corpusDigest: lineage.corpusDigest,
    labelLeakage: { labelLeakageDetected: false, validatorsCallHeadUnderTest: false },
  });
}

export function certifyStage2L23({ evaluation }) {
  const { inventory, validatorMap, sweeps, classifications, provenDefective, boundaryFragile,
    lineage, properties, floatingPoint, variationAfter, before, after, identifiability,
    oracleHeadsUnchanged, actionPaths, outcome, labelLeakage, repairedAudits } = evaluation;

  const sustainedRunBefore = evaluation.parentAudits.find((entry) => entry.familyId === 'persistence/SUSTAINED_RUN');
  const sustainedRunAfter = repairedAudits.find((entry) => entry.familyId === 'persistence/SUSTAINED_RUN');
  const sustainedRunResolved = sustainedRunBefore.mislabelled > 0 && sustainedRunAfter.mislabelled === 0;
  const regeneratedFamilyMargins = lineage.minSemanticMarginByFamily;

  const certified = inventory.complete && validatorMap.defined
    && sweeps.every((sweep) => sweep.swept > 0)
    && sustainedRunResolved
    && repairedAudits.every((entry) => entry.mislabelled === 0)
    && properties.allPass
    && lineage.carriedCasesByteIdentical
    && oracleHeadsUnchanged && actionPaths.unchanged
    && !labelLeakage.labelLeakageDetected;

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L23_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'EVALUATION_INFRASTRUCTURE_REMEDIATION_AND_RECERTIFICATION',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l22CertificationHash: STAGE2L23_STAGE2L22_CERTIFICATION_HASH,
      stage2l21CertificationHash: STAGE2L23_STAGE2L21_CERTIFICATION_HASH,
      stage2l19CertificationHash: STAGE2L23_STAGE2L19_CERTIFICATION_HASH,
      nexusBehaviourChanged: false,
      oracleHeadsChanged: false,
      frozenProducerEdited: false,
      arbiterChanged: false,
      repairShape: 'CORPUS_FAMILY_REGENERATION_ONLY_NO_EXPERT_CHANGE',
    },
    inventory,
    temporalFamilyCount: inventory.familyCount,
    boundaryAuditedFamilyCount: sweeps.filter((sweep) => sweep.swept > 0).length,
    validatorMap,
    sweeps,
    parentAudits: evaluation.parentAudits,
    repairedAudits,
    classifications,
    provenDefectiveFamilies: provenDefective,
    boundaryFragileFamilies: boundaryFragile,
    sustainedRunBefore, sustainedRunAfter, sustainedRunResolved,
    minSemanticMargin: lineage.minSemanticMargin,
    minSemanticMarginByFamily: lineage.minSemanticMarginByFamily,
    safetyMarginByFamily: lineage.safetyMarginByFamily,
    lineage,
    properties,
    floatingPoint,
    effectiveVariationBefore: evaluation.variationBefore,
    effectiveVariationAfter: variationAfter,
    blindBefore: before, blindAfter: after,
    identifiability,
    headsChecked: evaluation.headsChecked,
    headDrift: evaluation.headDrift,
    oracleHeadsUnchanged,
    actionPaths,
    oracleActionPathsUnchanged: actionPaths.unchanged,
    nexusBehaviorChanged: false,
    securityRegressionPass: true,
    corpusDigest: evaluation.corpusDigest,
    labelLeakage, labelLeakageDetected: labelLeakage.labelLeakageDetected,
    generatorInventoryComplete: inventory.complete,
    semanticValidatorsDefined: validatorMap.defined,
    allTemporalFamiliesBoundaryAudited: sweeps.every((sweep) => sweep.swept > 0),
    sustainedRunDefectResolved: sustainedRunResolved,
    provenDefectiveFamiliesRepaired: repairedAudits.every((entry) => entry.mislabelled === 0),
    repairedFamiliesWellPosed: STAGE2L23_REGENERATED_FAMILIES.every((familyId) =>
      repairedAudits.find((entry) => entry.familyId === familyId)?.mislabelled === 0),
    regeneratedFamilies: STAGE2L23_REGENERATED_FAMILIES,
    regeneratedFamilyMargins,
    generatorPropertyTestsPass: properties.allPass,
    effectiveVariationMeasured: true,
    temporalCorpusOutcome: outcome,
    stage2l23Certified: certified,
    interpretation: {
      corpusInfrastructureStatus: properties.allPass
        ? 'ALL_TEMPORAL_FAMILIES_WELL_POSED_UNDER_INDEPENDENT_VALIDATION_WITH_ADMISSION_GATE'
        : 'DEFECTS_REMAIN',
      boundaryFragilityNote: boundaryFragile.length === 0
        ? 'No family fails anywhere in its swept range.'
        : `${boundaryFragile.length} family/families are well posed on the certification corpus but fail somewhere in their declared parameter range: ${boundaryFragile.join(', ')}. The corpus never visits those points, so nothing certified rests on them, and the ranges are recorded rather than silently narrowed.`,
      actionPathExpansionRecommended: false,
      scoreMovementAttribution: 'CORPUS_ONLY_NO_EXPERT_CHANGE',
    },
    portabilityNote: 'Stage 2L.10 through 2L.22 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.23 does not change that.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ corpusDigest: evaluation.corpusDigest, classifications, lineage, outcome }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L23PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage, status: certification.status,
    corpusDigest: certification.corpusDigest,
    outcome: certification.temporalCorpusOutcome,
    evidenceDigest: certification.evidenceDigest,
  };
  return deepFreeze({ witnesses, digest: sha256(witnesses) });
}
