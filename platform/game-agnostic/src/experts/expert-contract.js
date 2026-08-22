/* Sentinel Grid — Stage 2G shared expert contract (R0).
 *
 * One contract, shared by Sentinel Oracle (temporal) and Sentinel Nexus (relational).
 * Experts observe canonical inputs and emit bounded advisory signals. They cannot
 * dispatch, mutate, or authorize anything: the output is inert frozen data.
 *
 * DETERMINISM DOCTRINE (why this differs from legacy AZL azl-oracle/azl-relational):
 * ECMAScript does not specify the results of Math.tanh, Math.exp, Math.log or
 * Math.pow beyond "implementation-approximated". Two conforming engines may differ
 * in the last ULP, which would move a portability digest and break the repository's
 * cross-platform evidence doctrine. Stage 2G therefore uses only IEEE-754
 * correctly-rounded operations (+, -, *, /, Math.sqrt) and emits every signal as a
 * fixed-point INTEGER in micro-units. Floats never reach a digest.
 *
 * Legacy experts also read a wall clock (U.now()) for staleness. Stage 2G takes no
 * clock: recency is expressed as integer tick deltas carried by the input itself.
 */

import { sha256, deepFreeze } from '../core/determinism.js';
import { ContractError } from '../core/errors.js';
import { PROHIBITED_EXECUTION_SURFACE } from '../core/constants.js';
import { defaultAuthorityPolicy, assertEvaluationOnly } from '../core/authority.js';

export const EXPERT_CONTRACT_VERSION = 1;

/** Signals are integers in micro-units: 1_000_000 represents 1.0. */
export const SIGNAL_SCALE = 1000000;
export const SIGNAL_MIN = -SIGNAL_SCALE;
export const SIGNAL_MAX = SIGNAL_SCALE;

/** Bounded input limits. Exceeding them truncates deterministically, never throws. */
export const MAX_HISTORY_FRAMES = 512;
export const MAX_CHANNELS = 64;
export const MAX_ENTITIES = 512;
export const MAX_EDGES = 4096;
export const MAX_LEGAL_ACTIONS = 256;
export const MAX_RATIONALE_CODES = 32;

const R0_AUTHORITY = deepFreeze({
  tier: 'R0',
  canDispatch: false,
  canMutateLiveWorld: false,
  canIssueAuthorityTokens: false,
});

/** The exact authority block every Stage 2G expert output must carry. */
export function expertAuthority() {
  return R0_AUTHORITY;
}

function assert(condition, message, code = 'EXPERT_CONTRACT_ERROR') {
  if (!condition) {
    const error = new ContractError(message);
    error.code = code;
    throw error;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/* ---------------------------------------------------------------------------
 * Deterministic fixed-point arithmetic
 * ------------------------------------------------------------------------- */

/** Round half away from zero. Math.round alone is asymmetric for negatives. */
export function roundHalfAwayFromZero(value) {
  assert(Number.isFinite(value), 'Cannot round a non-finite value', 'EXPERT_NONFINITE');
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Bounded squash into (-1, 1) using only division: x / (1 + |x|).
 * Replaces Math.tanh, which is not bit-portable across engines.
 */
export function squash(value) {
  assert(Number.isFinite(value), 'Cannot squash a non-finite value', 'EXPERT_NONFINITE');
  const magnitude = value < 0 ? -value : value;
  return value / (1 + magnitude);
}

/** Clamp a real to [-1, 1] and quantize to integer micro-units. */
export function quantizeUnit(value) {
  assert(Number.isFinite(value), 'Cannot quantize a non-finite value', 'EXPERT_NONFINITE');
  const clamped = value > 1 ? 1 : value < -1 ? -1 : value;
  const scaled = roundHalfAwayFromZero(clamped * SIGNAL_SCALE);
  return scaled > SIGNAL_MAX ? SIGNAL_MAX : scaled < SIGNAL_MIN ? SIGNAL_MIN : scaled;
}

/** Squash an unbounded real, then quantize. */
export function quantizeSquashed(value) {
  return quantizeUnit(squash(value));
}

/** Quantize a ratio already known to be in [0, 1]. */
export function quantizeRatio(numerator, denominator) {
  assert(Number.isFinite(numerator) && Number.isFinite(denominator), 'Ratio operands must be finite', 'EXPERT_NONFINITE');
  if (denominator === 0) return 0;
  return quantizeUnit(numerator / denominator);
}

/** Every emitted signal must be an integer inside the bounded micro-unit range. */
export function assertSignalInteger(name, value) {
  assert(Number.isInteger(value), `Signal ${name} must be an integer in micro-units`, 'EXPERT_SIGNAL_NOT_INTEGER');
  assert(value >= SIGNAL_MIN && value <= SIGNAL_MAX, `Signal ${name} is outside the bounded range`, 'EXPERT_SIGNAL_OUT_OF_RANGE');
  return value;
}

/* ---------------------------------------------------------------------------
 * Authority isolation
 * ------------------------------------------------------------------------- */

/**
 * True only for the exact canonical R0 denial block. The denial block necessarily
 * contains keys like canDispatch, which the execution-surface scan would otherwise
 * flag. Exempting only this exact shape keeps the gate strict: a forged or altered
 * authority block does not match, so it is scanned and rejected.
 */
export function isExactR0AuthorityBlock(value) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== 4) return false;
  if (keys.join(',') !== 'canDispatch,canIssueAuthorityTokens,canMutateLiveWorld,tier') return false;
  return value.tier === 'R0'
    && value.canDispatch === false
    && value.canMutateLiveWorld === false
    && value.canIssueAuthorityTokens === false;
}

/**
 * Reject any executable handle, or any key naming an execution surface, anywhere
 * in a payload. This is what stops an expert from smuggling out a dispatch path.
 */
export function assertNoExecutionSurface(value, path = '$', seen = new WeakSet()) {
  if (value === null) return value;
  const type = typeof value;
  if (type === 'function' || type === 'symbol') {
    assert(false, `${path} must not contain an executable handle (${type})`, 'EXPERT_EXECUTION_SURFACE');
  }
  if (type !== 'object') return value;
  assert(!seen.has(value), `${path} must not be cyclic`, 'EXPERT_CYCLIC');
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoExecutionSurface(entry, `${path}[${index}]`, seen));
    seen.delete(value);
    return value;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'authority' && isExactR0AuthorityBlock(entry)) continue;
    for (const pattern of PROHIBITED_EXECUTION_SURFACE) {
      assert(!pattern.test(key), `${path}.${key} names a prohibited execution surface`, 'EXPERT_EXECUTION_SURFACE');
    }
    assertNoExecutionSurface(entry, `${path}.${key}`, seen);
  }
  seen.delete(value);
  return value;
}

/* ---------------------------------------------------------------------------
 * Input normalization
 * ------------------------------------------------------------------------- */

function normalizeChannels(frameChannels, path) {
  assert(isRecord(frameChannels), `${path}.channels must be an object`, 'EXPERT_INPUT_INVALID');
  const names = Object.keys(frameChannels).sort();
  assert(names.length <= MAX_CHANNELS, `${path}.channels exceeds MAX_CHANNELS`, 'EXPERT_INPUT_TOO_LARGE');
  const normalized = {};
  for (const name of names) {
    const raw = frameChannels[name];
    assert(typeof raw === 'number' && Number.isFinite(raw), `${path}.channels.${name} must be a finite number`, 'EXPERT_INPUT_INVALID');
    normalized[name] = raw;
  }
  return normalized;
}

/**
 * Normalize observation history into a deterministic, bounded, tick-ordered series.
 * Optional: absent history is legal and yields an insufficiency signal, not a throw.
 */
export function normalizeObservationHistory(history) {
  if (history === undefined || history === null) return { frames: [], truncated: false };
  assert(Array.isArray(history), 'observationHistory must be an array when provided', 'EXPERT_INPUT_INVALID');
  const frames = history.map((frame, index) => {
    assert(isRecord(frame), `observationHistory[${index}] must be an object`, 'EXPERT_INPUT_INVALID');
    assert(Number.isInteger(frame.tick), `observationHistory[${index}].tick must be an integer`, 'EXPERT_INPUT_INVALID');
    return { tick: frame.tick, channels: normalizeChannels(frame.channels, `observationHistory[${index}]`) };
  });
  // Stable ascending sort by tick; ties keep arrival order.
  const ordered = frames
    .map((frame, index) => ({ frame, index }))
    .sort((a, b) => (a.frame.tick - b.frame.tick) || (a.index - b.index))
    .map((entry) => entry.frame);
  const truncated = ordered.length > MAX_HISTORY_FRAMES;
  // Keep the most recent frames when truncating.
  const bounded = truncated ? ordered.slice(ordered.length - MAX_HISTORY_FRAMES) : ordered;
  return { frames: bounded, truncated };
}

export function normalizeLegalActions(legalActions) {
  if (legalActions === undefined || legalActions === null) return [];
  assert(Array.isArray(legalActions), 'legalActions must be an array when provided', 'EXPERT_INPUT_INVALID');
  assert(legalActions.length <= MAX_LEGAL_ACTIONS, 'legalActions exceeds MAX_LEGAL_ACTIONS', 'EXPERT_INPUT_TOO_LARGE');
  return legalActions.map((action, index) => {
    assert(isRecord(action), `legalActions[${index}] must be an object`, 'EXPERT_INPUT_INVALID');
    assertNoExecutionSurface(action, `legalActions[${index}]`);
    return action;
  });
}

/**
 * Validate and normalize the shared expert input envelope.
 * Experts read only from the returned value, never from the caller's objects.
 */
export function normalizeExpertInput(input) {
  assert(isRecord(input), 'Expert input must be an object', 'EXPERT_INPUT_INVALID');
  const { canonicalState = null, observationHistory = null, legalActions = null, context = null } = input;
  assertNoExecutionSurface(canonicalState, 'canonicalState');
  assertNoExecutionSurface(context, 'context');
  assert(canonicalState === null || isRecord(canonicalState), 'canonicalState must be an object when provided', 'EXPERT_INPUT_INVALID');
  assert(context === null || isRecord(context), 'context must be an object when provided', 'EXPERT_INPUT_INVALID');
  const history = normalizeObservationHistory(observationHistory);
  const actions = normalizeLegalActions(legalActions);
  return deepFreeze({
    contractVersion: EXPERT_CONTRACT_VERSION,
    canonicalState: canonicalState === null ? null : structuredClone(canonicalState),
    observationHistory: history.frames,
    historyTruncated: history.truncated,
    legalActions: actions.map((action) => structuredClone(action)),
    context: context === null ? null : structuredClone(context),
  });
}

/** The digest of exactly what the expert consumed. */
export function computeInputDigest(normalizedInput) {
  return `sha256:${sha256(normalizedInput)}`;
}

/* ---------------------------------------------------------------------------
 * Output construction
 * ------------------------------------------------------------------------- */

/**
 * Build a frozen advisory output. The output digest is self-excluding: it is
 * computed over every field except outputDigest itself, matching the repository
 * convention that a document cannot contain its own hash.
 */
export function buildExpertOutput({
  expertId,
  expertVersion,
  normalizedInput,
  signals,
  confidence,
  rationaleCodes,
}) {
  assert(typeof expertId === 'string' && expertId.length > 0, 'expertId is required', 'EXPERT_IDENTITY_INVALID');
  assert(Number.isInteger(expertVersion) && expertVersion >= 1, 'expertVersion must be a positive integer', 'EXPERT_IDENTITY_INVALID');
  assert(isRecord(signals), 'signals must be an object', 'EXPERT_OUTPUT_INVALID');
  assert(Array.isArray(rationaleCodes), 'rationaleCodes must be an array', 'EXPERT_OUTPUT_INVALID');
  assert(rationaleCodes.length <= MAX_RATIONALE_CODES, 'rationaleCodes exceeds MAX_RATIONALE_CODES', 'EXPERT_OUTPUT_INVALID');

  const orderedSignalNames = Object.keys(signals).sort();
  const orderedSignals = {};
  for (const name of orderedSignalNames) {
    orderedSignals[name] = assertSignalInteger(name, signals[name]);
  }

  assert(Number.isInteger(confidence) && confidence >= 0 && confidence <= SIGNAL_SCALE,
    'confidence must be an integer in [0, SIGNAL_SCALE]', 'EXPERT_OUTPUT_INVALID');

  const codes = [...rationaleCodes].sort();
  for (const code of codes) {
    assert(typeof code === 'string' && /^[A-Z0-9_]+$/.test(code), 'rationaleCodes must be uppercase identifier strings', 'EXPERT_OUTPUT_INVALID');
  }

  const body = {
    expertContractVersion: EXPERT_CONTRACT_VERSION,
    expertId,
    expertVersion,
    inputDigest: computeInputDigest(normalizedInput),
    signalScale: SIGNAL_SCALE,
    signals: orderedSignals,
    confidence,
    rationaleCodes: codes,
    authority: R0_AUTHORITY,
    advisoryOnly: true,
  };
  assertNoExecutionSurface(body, 'expertOutput');
  return deepFreeze({ ...body, outputDigest: `sha256:${sha256(body)}` });
}

/**
 * Independently re-verify an expert output: identity, bounds, authority, and a
 * recomputed self-excluding digest. Used by the certifier and the negative gates.
 */
export function validateExpertOutput(output) {
  assert(isRecord(output), 'Expert output must be an object', 'EXPERT_OUTPUT_INVALID');
  assert(output.expertContractVersion === EXPERT_CONTRACT_VERSION, 'Unknown expert contract version', 'EXPERT_UNKNOWN_CONTRACT');
  assert(typeof output.expertId === 'string' && output.expertId.length > 0, 'expertId is required', 'EXPERT_IDENTITY_INVALID');
  assert(Number.isInteger(output.expertVersion) && output.expertVersion >= 1, 'expertVersion must be a positive integer', 'EXPERT_IDENTITY_INVALID');
  assert(typeof output.inputDigest === 'string' && /^sha256:[a-f0-9]{64}$/.test(output.inputDigest), 'inputDigest must be a sha256 identity', 'EXPERT_DIGEST_INVALID');
  assert(typeof output.outputDigest === 'string' && /^sha256:[a-f0-9]{64}$/.test(output.outputDigest), 'outputDigest must be a sha256 identity', 'EXPERT_DIGEST_INVALID');
  assert(output.signalScale === SIGNAL_SCALE, 'signalScale must match the contract scale', 'EXPERT_OUTPUT_INVALID');
  assert(output.advisoryOnly === true, 'Expert output must declare advisoryOnly=true', 'EXPERT_OUTPUT_INVALID');
  assert(isRecord(output.signals), 'signals must be an object', 'EXPERT_OUTPUT_INVALID');
  for (const [name, value] of Object.entries(output.signals)) assertSignalInteger(name, value);
  assert(Number.isInteger(output.confidence) && output.confidence >= 0 && output.confidence <= SIGNAL_SCALE, 'confidence out of range', 'EXPERT_OUTPUT_INVALID');

  const authority = output.authority;
  assert(isRecord(authority)
    && authority.tier === 'R0'
    && authority.canDispatch === false
    && authority.canMutateLiveWorld === false
    && authority.canIssueAuthorityTokens === false,
    'Expert output authority must remain exact R0', 'EXPERT_AUTHORITY_MISMATCH');

  assertNoExecutionSurface(output, 'expertOutput');

  const { outputDigest, ...body } = output;
  assert(`sha256:${sha256(body)}` === outputDigest, 'Expert output digest does not match its body', 'EXPERT_DIGEST_MISMATCH');

  // The kernel authority policy itself must still be R0 whenever an output is trusted.
  assertEvaluationOnly(defaultAuthorityPolicy());
  return output;
}
