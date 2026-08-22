/* Stage 2H.1 — action-discriminating expert context (R0).
 *
 * Stage 2H proved Prime can consume bounded expert context, but the adjustment was
 * a single root-level scalar added to every simulation regardless of which action
 * was selected: it could not discriminate between legal actions. Stage 2H.1 adds a
 * per-action layer on top of the SAME envelope and the SAME bounds.
 *
 * An expert may score an action. It may not execute one. The envelope carries no
 * dispatch surface, no callables, no authority fields, and can only ever reference
 * actions Prime already declared legal.
 *
 * Linkage between an action and expert evidence is supplied by the caller
 * (adapter / canonicalization boundary) as `actionLinks`. The experts never infer
 * game semantics; they consume a declared link to a channel or an entity.
 */

import { sha256, deepFreeze } from '../core/determinism.js';
import { ContractError } from '../core/errors.js';
import { actionKey } from '../core/contracts.js';
import {
  SIGNAL_SCALE,
  assertNoExecutionSurface,
  roundHalfAwayFromZero,
} from './expert-contract.js';
import { evaluateOracle } from './oracle.js';
import { evaluateNexus, NEXUS_EDGE_KINDS } from './nexus.js';
import {
  NEXUS_ADJUSTMENT_BOUND_MICRO,
  ORACLE_ADJUSTMENT_BOUND_MICRO,
  TOTAL_ADJUSTMENT_BOUND_MICRO,
  buildExpertContextEnvelope,
  validateExpertContextEnvelope,
} from './expert-context.js';

export const ACTION_CONTEXT_SCHEMA_VERSION = 1;

/** Bounds are inherited unchanged from Stage 2H. Stage 2H.1 does not widen them. */
export {
  ORACLE_ADJUSTMENT_BOUND_MICRO,
  NEXUS_ADJUSTMENT_BOUND_MICRO,
  TOTAL_ADJUSTMENT_BOUND_MICRO,
};

function assert(condition, message, code = 'ACTION_CONTEXT_ERROR') {
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

function scaleToBound(raw, bound) {
  return clampMicro(roundHalfAwayFromZero((raw * bound) / SIGNAL_SCALE), bound);
}

/* ---------------------------------------------------------------------------
 * Per-entity relational derivation
 *
 * Nexus emits aggregate signals only, and Stage 2G forbids changing it. So the
 * per-entity measures are derived here, from the SAME canonical state, using the
 * same normalization rules. Consistency is not assumed: buildExpertActionContext
 * re-runs the certified experts over the supplied inputs and rejects the build
 * unless their output digests reproduce exactly, so this derivation can never be
 * applied to a graph other than the one Nexus actually certified.
 * ------------------------------------------------------------------------- */

export function deriveEntityRelations(canonicalState) {
  const state = canonicalState ?? {};
  const rawEntities = Array.isArray(state.entities) ? state.entities : [];
  const seen = new Map();
  for (const entry of rawEntities) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id.length === 0) continue;
    if (seen.has(entry.id)) continue;
    seen.set(entry.id, { id: entry.id, critical: entry.critical === true, hostile: entry.hostile === true });
  }
  const ids = [...seen.keys()].sort();
  const relations = new Map(ids.map((id) => [id, {
    id,
    critical: seen.get(id).critical,
    hostile: seen.get(id).hostile,
    degree: 0,
    dependentCount: 0,
    dependencyCount: 0,
    supportedBy: 0,
    threatenedBy: 0,
  }]));

  const rawEdges = Array.isArray(state.relationships) ? state.relationships : [];
  const unique = new Map();
  for (const edge of rawEdges) {
    if (!isRecord(edge) || typeof edge.from !== 'string' || typeof edge.to !== 'string' || typeof edge.kind !== 'string') continue;
    if (!NEXUS_EDGE_KINDS.includes(edge.kind)) continue;
    if (!relations.has(edge.from) || !relations.has(edge.to)) continue;
    unique.set(`${edge.kind} ${edge.from} ${edge.to}`, edge);
  }
  for (const key of [...unique.keys()].sort()) {
    const edge = unique.get(key);
    const from = relations.get(edge.from);
    const to = relations.get(edge.to);
    from.degree += 1;
    to.degree += 1;
    if (edge.kind === 'depends') {
      from.dependencyCount += 1;
      to.dependentCount += 1;
    } else if (edge.kind === 'supports') {
      to.supportedBy += 1;
    } else if (edge.kind === 'threatens') {
      to.threatenedBy += 1;
    }
  }
  return { entityCount: ids.length, relations };
}

/* ---------------------------------------------------------------------------
 * Per-action expert scoring
 * ------------------------------------------------------------------------- */

/**
 * Oracle scores an action by the temporal state of the channels it addresses.
 *
 * A persistently deteriorating channel raises the score of an action that
 * addresses it. A reversed or stabilized trend removes that preference entirely,
 * so Oracle cannot keep rewarding an obsolete response. Volatility subtracts,
 * making an action riskier under unstable history. Insufficient history scores 0.
 */
export function deriveOracleActionMicro(oracleSignals, channels) {
  if (oracleSignals.sufficientHistory !== SIGNAL_SCALE) return { micro: 0, codes: ['ORACLE_ACTION_NO_HISTORY'] };
  if (!Array.isArray(channels) || channels.length === 0) return { micro: 0, codes: ['ORACLE_ACTION_UNLINKED'] };

  const codes = new Set();
  let total = 0;
  let counted = 0;
  for (const channel of [...channels].sort()) {
    const direction = oracleSignals[`channel:${channel}:direction`];
    if (direction === undefined) { codes.add('ORACLE_ACTION_UNKNOWN_CHANNEL'); continue; }
    const persistence = oracleSignals[`channel:${channel}:persistence`] ?? 0;
    const volatility = oracleSignals[`channel:${channel}:volatility`] ?? 0;

    const addressBenefit = direction < 0 ? persistence : 0;
    if (direction < 0) codes.add('ORACLE_ACTION_ADDRESSES_DECLINE');
    else if (direction > 0) codes.add('ORACLE_ACTION_TREND_REVERSED');
    else codes.add('ORACLE_ACTION_TREND_FLAT');
    if (volatility > 0) codes.add('ORACLE_ACTION_VOLATILITY_RISK');

    total += addressBenefit - volatility;
    counted += 1;
  }
  if (counted === 0) return { micro: 0, codes: [...codes] };
  const raw = roundHalfAwayFromZero(total / counted);
  return { micro: scaleToBound(raw, ORACLE_ADJUSTMENT_BOUND_MICRO), codes: [...codes] };
}

/**
 * Nexus scores an action by the relational standing of the entity it targets.
 *
 * Criticality (how much depends on it), unmet threat and bottleneck degree raise
 * the score. Redundant support paths lower apparent criticality. An isolated node
 * lowers it. An unlinked action, or an absent graph, scores 0 — no fabricated
 * preference.
 */
export function deriveNexusActionMicro({ entityCount, relations }, entityId) {
  if (typeof entityId !== 'string' || entityId.length === 0) return { micro: 0, codes: ['NEXUS_ACTION_UNLINKED'] };
  if (entityCount === 0) return { micro: 0, codes: ['NEXUS_ACTION_NO_GRAPH'] };
  const entity = relations.get(entityId);
  if (!entity) return { micro: 0, codes: ['NEXUS_ACTION_UNKNOWN_ENTITY'] };

  const codes = new Set();
  const denominator = entityCount > 1 ? entityCount - 1 : 1;
  let criticality = roundHalfAwayFromZero((entity.dependentCount * SIGNAL_SCALE) / denominator);
  if (criticality > SIGNAL_SCALE) criticality = SIGNAL_SCALE;
  if (criticality > 0) codes.add('NEXUS_ACTION_CRITICAL_DEPENDENCY');
  if (entity.critical) codes.add('NEXUS_ACTION_DECLARED_CRITICAL');

  // A redundant support path means the node is less of a single point of failure.
  if (entity.supportedBy >= 2) {
    criticality = roundHalfAwayFromZero(criticality / 2);
    codes.add('NEXUS_ACTION_REDUNDANT_SUPPORT');
  }

  let threat = 0;
  if (entity.threatenedBy > 0) {
    threat = entity.supportedBy === 0 ? SIGNAL_SCALE : roundHalfAwayFromZero(SIGNAL_SCALE / 2);
    codes.add(entity.supportedBy === 0 ? 'NEXUS_ACTION_UNSUPPORTED_THREAT' : 'NEXUS_ACTION_SUPPORTED_THREAT');
  }

  let isolation = 0;
  if (entity.degree === 0) {
    isolation = SIGNAL_SCALE;
    codes.add('NEXUS_ACTION_ISOLATED');
  }
  if (entity.degree >= 3) codes.add('NEXUS_ACTION_BOTTLENECK');

  const raw = clampMicro(criticality + threat - isolation, SIGNAL_SCALE);
  return { micro: scaleToBound(raw, NEXUS_ADJUSTMENT_BOUND_MICRO), codes: [...codes] };
}

/* ---------------------------------------------------------------------------
 * Envelope
 * ------------------------------------------------------------------------- */

function normalizeActionLinks(actionLinks, legalKeys) {
  if (actionLinks === undefined || actionLinks === null) return new Map();
  assert(isRecord(actionLinks), 'actionLinks must be an object', 'ACTION_CONTEXT_INVALID');
  assertNoExecutionSurface(actionLinks, 'actionLinks');
  const normalized = new Map();
  for (const key of Object.keys(actionLinks).sort()) {
    assert(legalKeys.has(key), 'actionLinks references an action that is not legal', 'ACTION_CONTEXT_ILLEGAL_ACTION');
    const link = actionLinks[key];
    assert(isRecord(link), 'each action link must be an object', 'ACTION_CONTEXT_INVALID');
    const entityId = link.entityId ?? null;
    assert(entityId === null || typeof entityId === 'string', 'link.entityId must be a string', 'ACTION_CONTEXT_INVALID');
    const channels = link.channels ?? [];
    assert(Array.isArray(channels) && channels.every((entry) => typeof entry === 'string'), 'link.channels must be strings', 'ACTION_CONTEXT_INVALID');
    normalized.set(key, { entityId, channels: [...channels].sort() });
  }
  return normalized;
}

/** Canonical, deterministic legal-action key list. Duplicates are rejected. */
export function canonicalLegalActionKeys(legalActions) {
  assert(Array.isArray(legalActions) && legalActions.length > 0, 'legalActions must be a non-empty array', 'ACTION_CONTEXT_INVALID');
  const keys = legalActions.map((action) => actionKey(action));
  const unique = new Set(keys);
  assert(unique.size === keys.length, 'legalActions contains duplicate canonical action keys', 'ACTION_CONTEXT_DUPLICATE_ACTION');
  return [...unique].sort();
}

/**
 * Build the Stage 2H.1 action-discriminating envelope.
 *
 * The Stage 2H envelope is embedded verbatim as `global`, so an action with no
 * declared link falls back to exactly the Stage 2H behaviour.
 */
export function buildExpertActionContext({
  qualificationIdentity,
  observationId,
  oracleInput,
  nexusInput,
  legalActions,
  actionLinks = null,
}) {
  const oracleOutput = evaluateOracle(structuredClone(oracleInput ?? {}));
  const nexusOutput = evaluateNexus(structuredClone(nexusInput ?? {}));

  const globalEnvelope = buildExpertContextEnvelope({
    qualificationIdentity,
    observationId,
    oracleOutput,
    nexusOutput,
  });

  const legalKeys = new Set(canonicalLegalActionKeys(legalActions));
  const links = normalizeActionLinks(actionLinks, legalKeys);
  const entityRelations = deriveEntityRelations((nexusInput ?? {}).canonicalState);

  const actions = {};
  for (const key of [...legalKeys].sort()) {
    const link = links.get(key);
    if (!link) continue;
    const oracle = deriveOracleActionMicro(oracleOutput.signals, link.channels);
    const nexus = deriveNexusActionMicro(entityRelations, link.entityId);
    const combined = clampMicro(oracle.micro + nexus.micro, TOTAL_ADJUSTMENT_BOUND_MICRO);
    actions[key] = {
      oracleAdjustmentMicro: oracle.micro,
      nexusAdjustmentMicro: nexus.micro,
      combinedAdjustmentMicro: combined,
      rationaleCodes: [...new Set([...oracle.codes, ...nexus.codes])].sort(),
      link: { entityId: link.entityId, channels: link.channels },
    };
  }

  const body = {
    actionContextSchemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    stage: 'STAGE2H1_ACTION_DISCRIMINATING_EXPERT_CONTEXT',
    observationId,
    // Stage 2F provenance, inherited verbatim through the Stage 2H envelope.
    sentinelRuntimeId: globalEnvelope.sentinelRuntimeId,
    generatedRuntimeProvenanceId: globalEnvelope.generatedRuntimeProvenanceId,
    stage2fCampaignId: globalEnvelope.stage2fCampaignId,
    sessionId: globalEnvelope.sessionId,
    samplingIdentity: globalEnvelope.samplingIdentity,
    // Expert identity and digest binding.
    oracleExpertId: oracleOutput.expertId,
    oracleExpertVersion: oracleOutput.expertVersion,
    oracleInputDigest: oracleOutput.inputDigest,
    oracleOutputDigest: oracleOutput.outputDigest,
    nexusExpertId: nexusOutput.expertId,
    nexusExpertVersion: nexusOutput.expertVersion,
    nexusInputDigest: nexusOutput.inputDigest,
    nexusOutputDigest: nexusOutput.outputDigest,
    // Stage 2H envelope embedded verbatim.
    global: globalEnvelope,
    legalActionKeys: [...legalKeys].sort(),
    actions,
    adjustmentBounds: {
      oracleMicro: ORACLE_ADJUSTMENT_BOUND_MICRO,
      nexusMicro: NEXUS_ADJUSTMENT_BOUND_MICRO,
      totalMicro: TOTAL_ADJUSTMENT_BOUND_MICRO,
    },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
    advisoryOnly: true,
    finalRecommendationOwner: 'PRIME',
    oracleRole: 'ADVISORY_CONTEXT',
    nexusRole: 'ADVISORY_CONTEXT',
    carriesActionSelection: false,
    carriesActionPriors: false,
  };
  assertNoExecutionSurface(body, 'expertActionContext');
  return deepFreeze({ ...body, actionContextDigest: `sha256:${sha256(body)}` });
}

/**
 * Re-verify an action context. Every per-action adjustment is RECOMPUTED from the
 * certified expert outputs, and the expert outputs themselves are re-derived from
 * the supplied inputs when they are available, so nothing here can be hand-edited.
 */
export function validateExpertActionContext(envelope, { campaignManifest = null, legalActions = null, oracleInput = null, nexusInput = null } = {}) {
  assert(isRecord(envelope), 'action context envelope is required', 'MISSING_RUNTIME_BINDING');
  assert(envelope.actionContextSchemaVersion === ACTION_CONTEXT_SCHEMA_VERSION, 'Unknown action context schema version', 'UNKNOWN_SCHEMA');
  assert(envelope.advisoryOnly === true, 'action context must be advisory only', 'AUTHORITY_MISMATCH');
  assert(envelope.finalRecommendationOwner === 'PRIME', 'Prime must remain the recommendation owner', 'AUTHORITY_MISMATCH');
  assert(envelope.carriesActionSelection === false && envelope.carriesActionPriors === false,
    'action context must not carry selection or priors', 'AUTHORITY_MISMATCH');
  assert(envelope.authority?.tier === 'R0'
    && envelope.authority?.canDispatch === false
    && envelope.authority?.canMutateLiveWorld === false
    && envelope.authority?.canIssueAuthorityTokens === false,
    'action context authority must remain exact R0', 'AUTHORITY_MISMATCH');
  assertNoExecutionSurface(envelope, 'expertActionContext');

  // The embedded Stage 2H envelope is validated by its own Stage 2H owner.
  validateExpertContextEnvelope(envelope.global, { campaignManifest });
  assert(envelope.sentinelRuntimeId === envelope.global.sentinelRuntimeId, 'runtime identity mismatch', 'RUNTIME_ID_MISMATCH');
  assert(envelope.stage2fCampaignId === envelope.global.stage2fCampaignId, 'campaign identity mismatch', 'CAMPAIGN_ID_MISMATCH');
  assert(envelope.oracleOutputDigest === envelope.global.oracle.outputDigest, 'oracle digest mismatch', 'EXPERT_DIGEST_MISMATCH');
  assert(envelope.nexusOutputDigest === envelope.global.nexus.outputDigest, 'nexus digest mismatch', 'EXPERT_DIGEST_MISMATCH');

  // Bounds cannot be widened by editing the envelope.
  assert(envelope.adjustmentBounds?.oracleMicro === ORACLE_ADJUSTMENT_BOUND_MICRO
    && envelope.adjustmentBounds?.nexusMicro === NEXUS_ADJUSTMENT_BOUND_MICRO
    && envelope.adjustmentBounds?.totalMicro === TOTAL_ADJUSTMENT_BOUND_MICRO,
    'action context bounds were altered', 'ACTION_CONTEXT_BOUND_ALTERED');

  // Action keys must be exactly the declared legal set, with no strays.
  assert(Array.isArray(envelope.legalActionKeys) && envelope.legalActionKeys.length > 0, 'legalActionKeys required', 'ACTION_CONTEXT_INVALID');
  const declared = new Set(envelope.legalActionKeys);
  assert(declared.size === envelope.legalActionKeys.length, 'duplicate legal action key', 'ACTION_CONTEXT_DUPLICATE_ACTION');
  if (legalActions) {
    const actual = canonicalLegalActionKeys(legalActions);
    assert(actual.length === envelope.legalActionKeys.length
      && actual.every((key, index) => key === envelope.legalActionKeys[index]),
      'action context legal set does not match the live legal actions', 'ACTION_CONTEXT_LEGAL_SET_MISMATCH');
  }
  assert(isRecord(envelope.actions), 'actions must be an object', 'ACTION_CONTEXT_INVALID');
  for (const key of Object.keys(envelope.actions)) {
    assert(declared.has(key), 'action context scores an action outside the legal set', 'ACTION_CONTEXT_ILLEGAL_ACTION');
    const entry = envelope.actions[key];
    assert(isRecord(entry), 'action entry must be an object', 'ACTION_CONTEXT_INVALID');
    assert(Number.isInteger(entry.oracleAdjustmentMicro) && Math.abs(entry.oracleAdjustmentMicro) <= ORACLE_ADJUSTMENT_BOUND_MICRO,
      'oracle action adjustment out of bound', 'ACTION_CONTEXT_BOUND_EXCEEDED');
    assert(Number.isInteger(entry.nexusAdjustmentMicro) && Math.abs(entry.nexusAdjustmentMicro) <= NEXUS_ADJUSTMENT_BOUND_MICRO,
      'nexus action adjustment out of bound', 'ACTION_CONTEXT_BOUND_EXCEEDED');
    assert(Number.isInteger(entry.combinedAdjustmentMicro) && Math.abs(entry.combinedAdjustmentMicro) <= TOTAL_ADJUSTMENT_BOUND_MICRO,
      'combined action adjustment out of bound', 'ACTION_CONTEXT_BOUND_EXCEEDED');
    assert(entry.combinedAdjustmentMicro === clampMicro(entry.oracleAdjustmentMicro + entry.nexusAdjustmentMicro, TOTAL_ADJUSTMENT_BOUND_MICRO),
      'combined adjustment does not match its parts', 'ACTION_CONTEXT_TAMPERED');
  }

  /* Strongest binding available: re-run the certified experts over the supplied
   * inputs and rebuild every per-action adjustment. This is what stops an action
   * adjustment from existing independently of its originating expert evaluation. */
  if (oracleInput !== null && nexusInput !== null) {
    const oracleOutput = evaluateOracle(structuredClone(oracleInput));
    const nexusOutput = evaluateNexus(structuredClone(nexusInput));
    assert(oracleOutput.outputDigest === envelope.oracleOutputDigest, 'oracle output does not reproduce from its input', 'EXPERT_DIGEST_MISMATCH');
    assert(nexusOutput.outputDigest === envelope.nexusOutputDigest, 'nexus output does not reproduce from its input', 'EXPERT_DIGEST_MISMATCH');
    const relations = deriveEntityRelations(nexusInput.canonicalState);
    for (const [key, entry] of Object.entries(envelope.actions)) {
      const oracle = deriveOracleActionMicro(oracleOutput.signals, entry.link?.channels ?? []);
      const nexus = deriveNexusActionMicro(relations, entry.link?.entityId ?? null);
      assert(entry.oracleAdjustmentMicro === oracle.micro, `oracle action adjustment for ${key} does not match its expert evidence`, 'ACTION_CONTEXT_TAMPERED');
      assert(entry.nexusAdjustmentMicro === nexus.micro, `nexus action adjustment for ${key} does not match its expert evidence`, 'ACTION_CONTEXT_TAMPERED');
    }
  }

  const { actionContextDigest, ...body } = envelope;
  assert(`sha256:${sha256(body)}` === actionContextDigest, 'action context digest does not match its body', 'ACTION_CONTEXT_DIGEST_MISMATCH');
  return envelope;
}

/**
 * Per-action adjustment resolver. Actions without a declared link fall back to the
 * Stage 2H global scalar, so behaviour degrades to Stage 2H rather than to zero.
 */
export function resolveActionAdjustmentMicro(envelope, key) {
  const entry = envelope.actions?.[key];
  if (entry) return entry.combinedAdjustmentMicro;
  return envelope.global.adjustmentMicro;
}

/* ---------------------------------------------------------------------------
 * Unified resolver used by Prime
 * ------------------------------------------------------------------------- */

/**
 * Resolve either a Stage 2H global envelope or a Stage 2H.1 action context into a
 * single per-action adjustment function plus the provenance block Prime records.
 *
 * A Stage 2H envelope resolves to the same constant for every action, which is
 * exactly its pre-Stage-2H.1 behaviour — Stage 2H stays bit-identical.
 */
export function resolveExpertContext(expertContext, { legalActions = null, campaignManifest = null } = {}) {
  assert(isRecord(expertContext), 'expertContext must be an object', 'ACTION_CONTEXT_INVALID');

  if (expertContext.actionContextSchemaVersion !== undefined) {
    const validated = validateExpertActionContext(expertContext, { campaignManifest, legalActions });
    return {
      kind: 'action-context',
      contextDigest: validated.actionContextDigest,
      adjustmentMicroFor: (key) => resolveActionAdjustmentMicro(validated, key),
      adjustmentFor: (key) => resolveActionAdjustmentMicro(validated, key) / SIGNAL_SCALE,
      packetBlock: {
        schemaVersion: validated.global.schemaVersion,
        actionContextSchemaVersion: validated.actionContextSchemaVersion,
        contextDigest: validated.global.contextDigest,
        actionContextDigest: validated.actionContextDigest,
        adjustmentMicro: validated.global.adjustmentMicro,
        scoredActionCount: Object.keys(validated.actions).length,
        legalActionCount: validated.legalActionKeys.length,
        oracleOutputDigest: validated.oracleOutputDigest,
        nexusOutputDigest: validated.nexusOutputDigest,
        sentinelRuntimeId: validated.sentinelRuntimeId,
        stage2fCampaignId: validated.stage2fCampaignId,
        finalRecommendationOwner: 'PRIME',
        oracleRole: 'ADVISORY_CONTEXT',
        nexusRole: 'ADVISORY_CONTEXT',
        affectedPriors: false,
        affectedLegalActions: false,
      },
    };
  }

  const validated = validateExpertContextEnvelope(expertContext, { campaignManifest });
  return {
    kind: 'global-context',
    contextDigest: validated.contextDigest,
    adjustmentMicroFor: () => validated.adjustmentMicro,
    adjustmentFor: () => validated.adjustmentMicro / SIGNAL_SCALE,
    packetBlock: {
      schemaVersion: validated.schemaVersion,
      contextDigest: validated.contextDigest,
      adjustmentMicro: validated.adjustmentMicro,
      oracleOutputDigest: validated.oracle.outputDigest,
      nexusOutputDigest: validated.nexus.outputDigest,
      sentinelRuntimeId: validated.sentinelRuntimeId,
      stage2fCampaignId: validated.stage2fCampaignId,
      finalRecommendationOwner: 'PRIME',
      oracleRole: 'ADVISORY_CONTEXT',
      nexusRole: 'ADVISORY_CONTEXT',
      affectedPriors: false,
      affectedLegalActions: false,
    },
  };
}
