/* Stage 2H — bounded expert context envelope (R0).
 *
 * Extends the Stage 2G expert contract rather than introducing a parallel
 * abstraction. Oracle and Nexus outputs are folded into ONE frozen envelope that
 * Prime may consume as bounded evaluation context.
 *
 * Decision ownership is unchanged. The envelope carries no action, no target, no
 * priors and no callable handle: it cannot name an action, so it cannot select or
 * dispatch one. Prime remains the sole producer of a recommendation.
 *
 * All arithmetic is integer fixed-point in micro-units (SIGNAL_SCALE = 1e6),
 * using only IEEE-754 correctly-rounded operations. No wall clock, no RNG.
 */

import { sha256, deepFreeze } from '../core/determinism.js';
import { ContractError } from '../core/errors.js';
import {
  SIGNAL_SCALE,
  assertNoExecutionSurface,
  roundHalfAwayFromZero,
  validateExpertOutput,
} from './expert-contract.js';
import { ORACLE_EXPERT_ID } from './oracle.js';
import { NEXUS_EXPERT_ID } from './nexus.js';

export const EXPERT_CONTEXT_SCHEMA_VERSION = 1;

/* Documented adjustment bounds, in micro-units of Prime's evaluation value.
 *
 * 0.02 per expert and 0.03 combined. The combined bound is deliberately LESS than
 * the sum of the individual bounds (0.04) so the total clamp is a real, reachable
 * guard rather than arithmetic decoration, and can be proven by test.
 *
 * These bounds exist so expert context cannot overwhelm Prime's own evaluation.
 * Raising them is a certification change, not a tuning change. */
export const ORACLE_ADJUSTMENT_BOUND_MICRO = 20000;
export const NEXUS_ADJUSTMENT_BOUND_MICRO = 20000;
export const TOTAL_ADJUSTMENT_BOUND_MICRO = 30000;

/** The fixed, bounded context feature set. Order is fixed; count never varies. */
export const CONTEXT_FEATURE_NAMES = Object.freeze([
  'temporalRisk',
  'temporalOpportunity',
  'stability',
  'volatility',
  'dependencyRisk',
  'criticality',
  'supportStrength',
  'isolationRisk',
]);

function assert(condition, message, code = 'EXPERT_CONTEXT_ERROR') {
  if (!condition) {
    const error = new ContractError(message);
    error.code = code;
    throw error;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampMicro(value, bound) {
  return value > bound ? bound : value < -bound ? -bound : value;
}

/** Bounded non-negative ratio in micro-units. */
function ratioMicro(numerator, denominator) {
  if (denominator <= 0) return 0;
  const scaled = roundHalfAwayFromZero((numerator * SIGNAL_SCALE) / denominator);
  return scaled < 0 ? 0 : scaled > SIGNAL_SCALE ? SIGNAL_SCALE : scaled;
}

/* ---------------------------------------------------------------------------
 * Feature derivation
 * ------------------------------------------------------------------------- */

/**
 * Oracle signals → temporal context features.
 * Insufficient history contributes nothing: an expert that cannot see does not vote.
 */
function deriveOracleFeatures(signals) {
  const sufficient = signals.sufficientHistory === SIGNAL_SCALE;
  if (!sufficient) {
    return { temporalRisk: 0, temporalOpportunity: 0, stability: 0, volatility: 0 };
  }

  // Net signed trend across analyzed channels; keys are iterated in sorted order.
  let directionSum = 0;
  let directionCount = 0;
  for (const name of Object.keys(signals).sort()) {
    if (name.startsWith('channel:') && name.endsWith(':direction')) {
      directionSum += signals[name];
      directionCount += 1;
    }
  }
  const netTrend = directionCount === 0 ? 0 : roundHalfAwayFromZero(directionSum / directionCount);
  const volatility = signals.maxVolatility ?? 0;

  return {
    temporalRisk: netTrend < 0 ? -netTrend : 0,
    temporalOpportunity: netTrend > 0 ? netTrend : 0,
    // stability is the exact complement of volatility, so it is reported but NOT
    // weighted in the adjustment below: weighting both would double-count one fact.
    stability: SIGNAL_SCALE - volatility,
    volatility,
  };
}

/** Nexus signals → relational context features. */
function deriveNexusFeatures(signals) {
  const entityCount = signals.entityCount ?? 0;
  if (entityCount <= 0) {
    return { dependencyRisk: 0, criticality: 0, supportStrength: 0, isolationRisk: 0 };
  }
  const threatened = signals.threatenedEntityCount ?? 0;
  const unsupported = signals.unsupportedThreatenedCount ?? 0;
  return {
    dependencyRisk: ratioMicro((signals.unresolvedDependencyCount ?? 0) + (signals.cycleNodeCount ?? 0), entityCount),
    criticality: ratioMicro(signals.criticalDependencyCount ?? 0, entityCount),
    supportStrength: threatened <= 0 ? 0 : ratioMicro(threatened - unsupported, threatened),
    isolationRisk: signals.isolatedRatio ?? 0,
  };
}

/** Derive the complete fixed feature set from two certified expert outputs. */
export function deriveContextFeatures({ oracleSignals, nexusSignals }) {
  const features = { ...deriveOracleFeatures(oracleSignals), ...deriveNexusFeatures(nexusSignals) };
  const ordered = {};
  for (const name of CONTEXT_FEATURE_NAMES) {
    const value = features[name] ?? 0;
    assert(Number.isInteger(value) && value >= 0 && value <= SIGNAL_SCALE,
      `Context feature ${name} must be an integer in [0, SIGNAL_SCALE]`, 'EXPERT_CONTEXT_FEATURE_INVALID');
    ordered[name] = value;
  }
  return ordered;
}

/* ---------------------------------------------------------------------------
 * Bounded adjustment
 * ------------------------------------------------------------------------- */

/**
 * Fixed-point bounded adjustment derived from the context features.
 *
 * Neutral-at-zero by construction: an all-zero feature set yields exactly 0, so a
 * neutral context leaves Prime's evaluation bit-identical.
 *
 * `stability` is intentionally absent from both sums — see deriveOracleFeatures.
 */
export function computeContextAdjustmentMicro(features) {
  const oracleRaw = features.temporalOpportunity - features.temporalRisk - features.volatility;
  const nexusRaw = features.supportStrength - features.dependencyRisk - features.criticality - features.isolationRisk;

  const oracleMicro = clampMicro(
    roundHalfAwayFromZero((oracleRaw * ORACLE_ADJUSTMENT_BOUND_MICRO) / SIGNAL_SCALE),
    ORACLE_ADJUSTMENT_BOUND_MICRO,
  );
  const nexusMicro = clampMicro(
    roundHalfAwayFromZero((nexusRaw * NEXUS_ADJUSTMENT_BOUND_MICRO) / SIGNAL_SCALE),
    NEXUS_ADJUSTMENT_BOUND_MICRO,
  );
  const totalMicro = clampMicro(oracleMicro + nexusMicro, TOTAL_ADJUSTMENT_BOUND_MICRO);

  return {
    oracleMicro,
    nexusMicro,
    totalMicro,
    oracleClamped: Math.abs(oracleMicro) === ORACLE_ADJUSTMENT_BOUND_MICRO,
    nexusClamped: Math.abs(nexusMicro) === NEXUS_ADJUSTMENT_BOUND_MICRO,
    totalClamped: Math.abs(totalMicro) === TOTAL_ADJUSTMENT_BOUND_MICRO,
  };
}

/* ---------------------------------------------------------------------------
 * Envelope
 * ------------------------------------------------------------------------- */

function expertBlock(output, expectedExpertId) {
  const validated = validateExpertOutput(output);
  assert(validated.expertId === expectedExpertId, `Expected expert ${expectedExpertId}`, 'EXPERT_CONTEXT_IDENTITY_MISMATCH');
  return {
    expertId: validated.expertId,
    expertVersion: validated.expertVersion,
    expertContractVersion: validated.expertContractVersion,
    inputDigest: validated.inputDigest,
    outputDigest: validated.outputDigest,
    confidence: validated.confidence,
    signals: validated.signals,
  };
}

/**
 * Build the frozen Stage 2H context envelope from two certified expert outputs,
 * bound to the inherited Stage 2F qualification identity.
 *
 * contextDigest is self-excluding, matching repository convention.
 */
export function buildExpertContextEnvelope({ qualificationIdentity, observationId, oracleOutput, nexusOutput }) {
  assert(isRecord(qualificationIdentity), 'qualificationIdentity is required', 'MISSING_RUNTIME_BINDING');
  assert(typeof observationId === 'string' && observationId.length > 0, 'observationId is required');

  const oracle = expertBlock(oracleOutput, ORACLE_EXPERT_ID);
  const nexus = expertBlock(nexusOutput, NEXUS_EXPERT_ID);
  const contextFeatures = deriveContextFeatures({ oracleSignals: oracle.signals, nexusSignals: nexus.signals });
  const adjustment = computeContextAdjustmentMicro(contextFeatures);

  const body = {
    schemaVersion: EXPERT_CONTEXT_SCHEMA_VERSION,
    stage: 'STAGE2H_SHADOW_EXPERT_CONSUMPTION',
    observationId,
    // Inherited Stage 2F provenance, copied verbatim.
    sentinelRuntimeId: qualificationIdentity.sentinelRuntimeId,
    generatedRuntimeProvenanceId: qualificationIdentity.generatedRuntimeProvenanceId,
    stage2fCampaignId: qualificationIdentity.stage2fCampaignId,
    sessionId: qualificationIdentity.sessionId,
    samplingIdentity: qualificationIdentity.samplingIdentity,
    oracle,
    nexus,
    signalScale: SIGNAL_SCALE,
    contextFeatures,
    adjustmentBounds: {
      oracleMicro: ORACLE_ADJUSTMENT_BOUND_MICRO,
      nexusMicro: NEXUS_ADJUSTMENT_BOUND_MICRO,
      totalMicro: TOTAL_ADJUSTMENT_BOUND_MICRO,
    },
    adjustmentMicro: adjustment.totalMicro,
    oracleAdjustmentMicro: adjustment.oracleMicro,
    nexusAdjustmentMicro: adjustment.nexusMicro,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
    advisoryOnly: true,
    // Explicit, machine-checkable statement of what this envelope is not.
    finalRecommendationOwner: 'PRIME',
    oracleRole: 'ADVISORY_CONTEXT',
    nexusRole: 'ADVISORY_CONTEXT',
    carriesActionSelection: false,
    carriesActionPriors: false,
  };
  assertNoExecutionSurface(body, 'expertContext');
  return deepFreeze({ ...body, contextDigest: `sha256:${sha256(body)}` });
}

/**
 * Re-verify an envelope end to end. Features and adjustment are RECOMPUTED from
 * the carried expert signals, so a hand-edited feature or adjustment is rejected
 * rather than trusted.
 */
export function validateExpertContextEnvelope(envelope, { campaignManifest = null, qualificationIdentity = null } = {}) {
  assert(isRecord(envelope), 'Expert context envelope is required', 'MISSING_RUNTIME_BINDING');
  assert(envelope.schemaVersion === EXPERT_CONTEXT_SCHEMA_VERSION, 'Unknown expert context schema version', 'UNKNOWN_SCHEMA');
  assert(envelope.advisoryOnly === true, 'Expert context must be advisory only', 'AUTHORITY_MISMATCH');
  assert(envelope.finalRecommendationOwner === 'PRIME', 'Prime must remain the recommendation owner', 'AUTHORITY_MISMATCH');
  assert(envelope.carriesActionSelection === false && envelope.carriesActionPriors === false,
    'Expert context must not carry action selection or priors', 'AUTHORITY_MISMATCH');
  assert(envelope.authority?.tier === 'R0'
    && envelope.authority?.canDispatch === false
    && envelope.authority?.canMutateLiveWorld === false
    && envelope.authority?.canIssueAuthorityTokens === false,
    'Expert context authority must remain exact R0', 'AUTHORITY_MISMATCH');
  assert(envelope.signalScale === SIGNAL_SCALE, 'signalScale mismatch', 'EXPERT_CONTEXT_ERROR');

  assertNoExecutionSurface(envelope, 'expertContext');

  // The envelope must not smuggle an action under any name.
  for (const forbidden of ['action', 'actionKey', 'selected', 'selectedAction', 'priors', 'prior', 'targetEntityId']) {
    assert(!(forbidden in envelope), `Expert context must not carry ${forbidden}`, 'EXPERT_CONTEXT_CARRIES_ACTION');
  }

  assert(envelope.oracle?.expertId === ORACLE_EXPERT_ID, 'Oracle block identity mismatch', 'EXPERT_CONTEXT_IDENTITY_MISMATCH');
  assert(envelope.nexus?.expertId === NEXUS_EXPERT_ID, 'Nexus block identity mismatch', 'EXPERT_CONTEXT_IDENTITY_MISMATCH');
  for (const block of [envelope.oracle, envelope.nexus]) {
    assert(typeof block.inputDigest === 'string' && /^sha256:[a-f0-9]{64}$/.test(block.inputDigest), 'expert inputDigest invalid', 'EXPERT_DIGEST_INVALID');
    assert(typeof block.outputDigest === 'string' && /^sha256:[a-f0-9]{64}$/.test(block.outputDigest), 'expert outputDigest invalid', 'EXPERT_DIGEST_INVALID');
    assert(isRecord(block.signals), 'expert signals missing', 'EXPERT_CONTEXT_ERROR');
  }

  // Provenance must match the inherited Stage 2F identity when one is supplied.
  const reference = qualificationIdentity ?? (campaignManifest
    ? {
        sentinelRuntimeId: campaignManifest.sentinelRuntimeId,
        generatedRuntimeProvenanceId: campaignManifest.generatedRuntimeProvenanceId,
        stage2fCampaignId: campaignManifest.stage2fCampaignId,
      }
    : null);
  if (reference) {
    assert(envelope.sentinelRuntimeId === reference.sentinelRuntimeId, 'Sentinel runtime identity mismatch', 'RUNTIME_ID_MISMATCH');
    assert(envelope.generatedRuntimeProvenanceId === reference.generatedRuntimeProvenanceId, 'Generated provenance mismatch', 'PROVENANCE_ID_MISMATCH');
    assert(envelope.stage2fCampaignId === reference.stage2fCampaignId, 'Stage2F campaign identity mismatch', 'CAMPAIGN_ID_MISMATCH');
  }

  // Recompute rather than trust.
  const features = deriveContextFeatures({ oracleSignals: envelope.oracle.signals, nexusSignals: envelope.nexus.signals });
  for (const name of CONTEXT_FEATURE_NAMES) {
    assert(envelope.contextFeatures?.[name] === features[name], `Context feature ${name} does not match the carried expert signals`, 'EXPERT_CONTEXT_TAMPERED');
  }
  const adjustment = computeContextAdjustmentMicro(features);
  assert(envelope.adjustmentMicro === adjustment.totalMicro, 'Context adjustment does not match its features', 'EXPERT_CONTEXT_TAMPERED');
  assert(envelope.oracleAdjustmentMicro === adjustment.oracleMicro, 'Oracle adjustment mismatch', 'EXPERT_CONTEXT_TAMPERED');
  assert(envelope.nexusAdjustmentMicro === adjustment.nexusMicro, 'Nexus adjustment mismatch', 'EXPERT_CONTEXT_TAMPERED');

  // Bounds are enforced here too, so a forged bound block cannot widen the clamp.
  assert(envelope.adjustmentBounds?.oracleMicro === ORACLE_ADJUSTMENT_BOUND_MICRO
    && envelope.adjustmentBounds?.nexusMicro === NEXUS_ADJUSTMENT_BOUND_MICRO
    && envelope.adjustmentBounds?.totalMicro === TOTAL_ADJUSTMENT_BOUND_MICRO,
    'Expert context adjustment bounds were altered', 'EXPERT_CONTEXT_BOUND_ALTERED');
  assert(Number.isInteger(envelope.adjustmentMicro)
    && Math.abs(envelope.adjustmentMicro) <= TOTAL_ADJUSTMENT_BOUND_MICRO,
    'Expert context adjustment exceeds its documented bound', 'EXPERT_CONTEXT_BOUND_EXCEEDED');

  const { contextDigest, ...body } = envelope;
  assert(`sha256:${sha256(body)}` === contextDigest, 'Expert context digest does not match its body', 'EXPERT_CONTEXT_DIGEST_MISMATCH');
  return envelope;
}

/**
 * Resolve the scalar Prime applies to its evaluation values.
 * Validates first: an unvalidated envelope never reaches Prime's arithmetic.
 */
export function resolveExpertContextAdjustment(envelope, options = {}) {
  const validated = validateExpertContextEnvelope(envelope, options);
  return {
    adjustmentMicro: validated.adjustmentMicro,
    adjustment: validated.adjustmentMicro / SIGNAL_SCALE,
    contextDigest: validated.contextDigest,
  };
}
