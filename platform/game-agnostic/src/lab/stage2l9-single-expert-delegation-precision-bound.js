/* Stage 2L.9 — single-expert delegation precision bound (R0, shadow only).
 *
 * MEASUREMENT / CERTIFICATION STAGE ONLY. Every decision engine and every safety
 * rule is imported frozen and never modified.
 *
 * THE QUESTION. When exactly one expert holds relevant, valid, causally bound
 * information, how precisely does the frozen Arbiter know whether that expert
 * deserves to move Prime?
 *
 * HOW EXPERT FALLIBILITY IS OBTAINED. Precision is only meaningful if the expert
 * can actually be wrong, and an invented error rate would make the headline number
 * a property of this stage rather than of the system. So both experts are driven
 * for real:
 *   - Oracle: the certified Oracle V2 assembly classifies freshly generated
 *     histories whose true regime is fixed by the generator's net drift. Oracle's
 *     misclassifications (for example, calling a zero-drift oscillation UP) are
 *     genuine measured errors, not injected ones.
 *   - Nexus: the certified relational-delta analyzer computes single points of
 *     failure on freshly built graphs. Its graph analysis is exact, so its decision
 *     errors come from the semantic step — the constructed case may make a
 *     different entity utility-optimal. That alignment rate is an explicit,
 *     reported corpus parameter rather than a hidden assumption.
 *
 * Ground truth is drawn from its own seeded stream and never reads expert or
 * Arbiter output.
 */

import { createSeededRandom, deriveSeed, deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2 } from './stage2i4-oracle-v2-assembly.js';
import { analyzeRelationalDelta } from './stage2k0-nexus-relational-diagnostic.js';
import {
  STAGE2L0_CAMPAIGN_IDENTITY,
  STAGE2L0_IMPLEMENTATION_DIGESTS,
  STAGE2L0_RUNTIME_IDENTITY,
} from './stage2l0-core-triad-shadow-integration.js';
import { runArbiterWithFailureIsolation } from './stage2l5-deterministic-arbiter-candidate.js';
import {
  STAGE2L7_ARBITER_RULE_DIGEST,
  STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
  STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY,
  STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
  buildBoundArbiterInput,
  createArbiterDecisionContext,
  createBoundArbiterEvidence,
  remediatedDeterministicArbiter,
  validateArbiterEvidence,
} from './stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js';

export const STAGE2L9_STAGE = 'STAGE2L9_SINGLE_EXPERT_DELEGATION_PRECISION_BOUND';
export const STAGE2L9_STAGE2L8_CERTIFICATION_HASH = '24b31136f4818e8fbab29b7677bc9b42e51d1930e036e9f92e588da643febb32';
export const STAGE2L9_STAGE2L8_EVIDENCE_DIGEST = 'aa56d03a9d39167e0ad12b8f6da52eb84960d7e9af8a726d6d006b1eebfe7fc8';
export const STAGE2L9_STAGE2L8_OWNER_SHA256 = '0e9e09c3d853237365ebbd42512ba3f18bb4ee6577db554bd9c15588eb7f70e0';
export const STAGE2L9_STAGE2L7_OWNER_SHA256 = '5047dc0576b8242c00a1f73729c4b0bc49fc1d181eac22bc90896d2cf5cccc00';
export const STAGE2L9_ARBITER_RULE_DIGEST = '2c3014ba4916e532861402befb955a8a5fba8e9a55a7fce5d6096a0537456822';
export const STAGE2L9_FAIL_CLOSED_MATRIX_DIGEST = '59e0c7d6a3c4c648dd9d0beff6a9bc85c690a2c28adb1baaad4064c019269ad3';

/** Inherited bounds. Stage 2L.9 introduces no new hard threshold. */
export const STAGE2L9_MAX_HARMFUL_CHANGE_RATE = 0.01;
export const STAGE2L9_MAX_CORRECT_PRIME_BREAK_RATE = 0.01;
export const STAGE2L9_MIN_CASES = 20000;

export const STAGE2L9_ORACLE_CASES = 7000;
export const STAGE2L9_NEXUS_CASES = 7000;
export const STAGE2L9_CONTROL_CASES = 500;
export const STAGE2L9_ADVERSARIAL_CASES = 250;

/** Declared, reported corpus parameter: how often the constructed SPOF is also the
 *  utility-optimal entity. Nexus decision errors arise from the complement. */
export const STAGE2L9_NEXUS_ALIGNMENT_RATE = 0.7;

const GROUND_TRUTH_SEED = 0x5347324c39n; // "SG2L9"
const ORACLE_LABELS = deepFreeze(['UP', 'DOWN', 'STABLE']);

function identity(payload) { return `sha256:${sha256(payload)}`; }
function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function clamp(value) { return Math.min(1, Math.max(0, Number(value.toFixed(6)))); }
function percentile(values, proportion) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * proportion) - 1))] ?? 0;
}

/* ---------------------------------------------------------------------------
 * Strata
 * ------------------------------------------------------------------------- */

export const STAGE2L9_CONTROL_GROUPS = deepFreeze([
  'PRIME_ONLY_CONTROL',
  'ORACLE_RELEVANT_CONTROL',
  'NEXUS_RELEVANT_CONTROL',
  'ORACLE_IRRELEVANT_CONTROL',
  'NEXUS_IRRELEVANT_CONTROL',
  'BOTH_WRONG_CONTROL',
  'NO_EXPERT_INFORMATION_CONTROL',
]);

export const STAGE2L9_ADVERSARIAL_CONTROLS = deepFreeze([
  'SE_MISSING_EVIDENCE', 'SE_MALFORMED_EVIDENCE', 'SE_STALE_EVIDENCE',
  'SE_CROSS_RUNTIME', 'SE_CROSS_OBSERVATION', 'SE_CROSS_CAMPAIGN',
  'SE_AMBIGUOUS_ACTION_BINDING', 'SE_AMBIGUOUS_CHANNEL_ENTITY_BINDING',
  'SE_ILLEGAL_ACTION', 'SE_UNKNOWN_SCHEMA', 'SE_UNKNOWN_RULE',
  'SE_CONFLICTING_DUPLICATE',
]);

export const STAGE2L9_MARGIN_BANDS = deepFreeze([
  'Q_MARGIN_0_005', 'Q_MARGIN_0_010', 'Q_MARGIN_0_015',
  'Q_MARGIN_0_020', 'Q_MARGIN_0_025', 'Q_MARGIN_0_030', 'Q_MARGIN_GT_0_030',
]);

const BAND_MARGIN = deepFreeze({
  Q_MARGIN_0_005: 0.005,
  Q_MARGIN_0_010: 0.010,
  Q_MARGIN_0_015: 0.015,
  Q_MARGIN_0_020: 0.020,
  Q_MARGIN_0_025: 0.025,
  Q_MARGIN_0_030: 0.030,
  Q_MARGIN_GT_0_030: 0.055,
});

/* ---------------------------------------------------------------------------
 * Independent ground truth
 * ------------------------------------------------------------------------- */

export function stage2L9GroundTruth(index) {
  const random = createSeededRandom(deriveSeed(GROUND_TRUTH_SEED, 'STAGE2L9_INDEPENDENT_GROUND_TRUTH', index));
  const primeCorrect = random() < 0.5;
  const bandIndex = Math.floor(random() * STAGE2L9_MARGIN_BANDS.length);
  const supportInTieBand = random() < 0.85;
  const nexusAligned = random() < STAGE2L9_NEXUS_ALIGNMENT_RATE;
  const regimeIndex = Math.floor(random() * 6);
  return deepFreeze({
    index,
    primeCorrect,
    band: STAGE2L9_MARGIN_BANDS[bandIndex],
    margin: BAND_MARGIN[STAGE2L9_MARGIN_BANDS[bandIndex]],
    supportInTieBand,
    nexusAligned,
    regimeIndex,
    generator: 'STAGE2L9_INDEPENDENT_GROUND_TRUTH_V1',
  });
}

/* ---------------------------------------------------------------------------
 * Real Oracle: fresh histories with a generator-fixed true regime
 * ------------------------------------------------------------------------- */

const ORACLE_REGIMES = deepFreeze([
  { name: 'STRONG_RISE', drift: 0.030, noise: 0.000, truth: 'UP' },
  { name: 'STRONG_FALL', drift: -0.030, noise: 0.000, truth: 'DOWN' },
  { name: 'EXACT_FLAT', drift: 0.000, noise: 0.000, truth: 'STABLE' },
  { name: 'WEAK_RISE', drift: 0.004, noise: 0.006, truth: 'UP' },
  { name: 'WEAK_FALL', drift: -0.004, noise: 0.006, truth: 'DOWN' },
  { name: 'ZERO_DRIFT_OSCILLATION', drift: 0.000, noise: 0.030, truth: 'STABLE' },
]);

function oracleHistory(regime, variant) {
  return Array.from({ length: 14 }, (_, tick) => {
    const oscillation = regime.noise === 0 ? 0 : ((((tick * 7 + variant * 3) % 5) - 2) / 2) * regime.noise;
    return { tick, channels: { alpha: clamp(0.5 + regime.drift * (tick - 6.5) + oscillation) } };
  });
}

/** Drive the certified Oracle V2 and return its classification for this history. */
export function measureOracleClassification(caseId, regime, variant) {
  const input = {
    caseId: `${caseId}-oracle`,
    task: 'direction',
    family: `STAGE2L9_${regime.name}`,
    observationHistory: oracleHistory(regime, variant),
    channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: 0.76 } },
    source: 'STAGE2L9_SINGLE_EXPERT_PRECISION',
  };
  const observationIdentity = identity({ caseId, corpus: 'STAGE2L9_ORACLE' });
  const assessment = assembleOracleV2(input, { observationIdentity });
  const head = assessment.heads.direction;
  const signal = ORACLE_LABELS.includes(head.semanticOutput) ? head.semanticOutput : 'STABLE';
  return {
    signal,
    trueRegime: regime.truth,
    correct: signal === regime.truth,
    confidence: head.confidence,
    supported: head.supported === true,
    historyDigest: identity({ caseId, history: input.observationHistory }),
    observationIdentity,
  };
}

/* ---------------------------------------------------------------------------
 * Real Nexus: fresh graphs with a construction-known single point of failure
 * ------------------------------------------------------------------------- */

export function measureNexusAnalysis(caseId, variant) {
  const bridge = `s2l9-${caseId}-bridge`;
  const source = `s2l9-${caseId}-src`;
  const target = `s2l9-${caseId}-dst`;
  const spur = `s2l9-${caseId}-spur`;
  const entities = [{ id: source }, { id: bridge }, { id: target }, { id: spur }];
  const relationships = [
    { id: `${caseId}-e1`, from: source, to: bridge, kind: 'depends' },
    { id: `${caseId}-e2`, from: bridge, to: target, kind: 'depends' },
    { id: `${caseId}-e3`, from: spur, to: bridge, kind: 'depends' },
  ];
  // Every third case adds a redundant path, which removes the bridge's SPOF status.
  const redundant = variant % 3 === 0;
  if (redundant) relationships.push({ id: `${caseId}-e4`, from: source, to: target, kind: 'depends' });
  const caseEntry = {
    caseId,
    canonicalState: { entities, relationships },
    query: { source, target, edgeType: null, candidateType: 'node', candidateNodeId: bridge, candidateEdgeId: null },
    mutation: { type: 'NONE' },
  };
  const analysis = analyzeRelationalDelta(caseEntry);
  const spof = analysis.spofNodes ?? [];
  return {
    analysis,
    constructedBridge: bridge,
    redundant,
    spofNodes: spof,
    supportedEntity: spof.length > 0 ? spof[0] : null,
    graphDigest: identity({ caseId, graph: { entities, relationships } }),
    entity: { entityId: bridge, entityType: 'bridge', canonicalKey: `bridge/${bridge}` },
    edges: [{ edgeId: `${caseId}-e2`, sourceEntityId: bridge, targetEntityId: target, relation: 'DIRECTED_SUPPORT' }],
  };
}

/* ---------------------------------------------------------------------------
 * Case assembly
 * ------------------------------------------------------------------------- */

function requirements(caseId, historyDigest, graphDigest, entity, edges, channelId) {
  return {
    oracle: {
      historyDigest,
      implementationIdentity: identity(STAGE2L0_IMPLEMENTATION_DIGESTS.oracle),
      eligibilityRuleIdentity: STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY,
      channel: {
        canonicalIdentity: `temporal.channel/${channelId}`,
        polarity: 'LOWER_IS_BETTER',
        thresholdSemantics: { kind: 'UPPER_BOUND', value: 0.76, identity: `temporal.channel/${channelId}@0.76` },
      },
    },
    nexus: { graphDigest, implementationIdentity: identity(STAGE2L0_IMPLEMENTATION_DIGESTS.nexus), entity, edges },
  };
}

function oracleEvidence(context, caseId, requirement, options) {
  const { active, actionId = null, actionCanonicalKey, bindingOverride = null, channelOverride = null, historyOverride = null } = options;
  return createBoundArbiterEvidence({
    expert: 'ORACLE',
    decisionContext: context,
    assessmentIdentity: identity({ caseId, expert: 'ORACLE', layer: 'STAGE2L9_ASSESSMENT' }),
    permissionIdentity: identity({ caseId, expert: 'ORACLE', layer: 'STAGE2L9_PERMISSION' }),
    permissionEligible: active,
    relevant: active,
    tieEligible: active,
    actionId: active ? actionId : null,
    actionCanonicalKey,
    oracleBinding: {
      historyDigest: historyOverride ?? requirement.oracle.historyDigest,
      implementationIdentity: requirement.oracle.implementationIdentity,
      eligibilityRuleIdentity: requirement.oracle.eligibilityRuleIdentity,
      head: 'direction',
      channel: channelOverride ?? requirement.oracle.channel,
    },
    causalBasisCertified: active,
    relevanceClass: active ? 'ACTION_CAUSAL' : 'ACTION_INDEPENDENT',
    decisionBindingOverride: bindingOverride,
  });
}

function nexusEvidence(context, caseId, requirement, options) {
  const { active, actionId = null, actionCanonicalKey, bindingOverride = null, graphOverride = null, entityOverride = null } = options;
  return createBoundArbiterEvidence({
    expert: 'NEXUS',
    decisionContext: context,
    assessmentIdentity: identity({ caseId, expert: 'NEXUS', layer: 'STAGE2L9_ASSESSMENT' }),
    permissionIdentity: identity({ caseId, expert: 'NEXUS', layer: 'STAGE2L9_PERMISSION' }),
    permissionEligible: active,
    relevant: active,
    tieEligible: active,
    actionId: active ? actionId : null,
    actionCanonicalKey,
    nexusBinding: {
      graphDigest: graphOverride ?? requirement.nexus.graphDigest,
      implementationIdentity: requirement.nexus.implementationIdentity,
      entity: active ? (entityOverride ?? requirement.nexus.entity) : null,
      edges: active ? requirement.nexus.edges : [],
    },
    causalBasisCertified: active,
    relevanceClass: active ? 'ACTION_CAUSAL' : 'ACTION_INDEPENDENT',
    decisionBindingOverride: bindingOverride,
  });
}

function rebind(packet, changes, rehash = true) {
  const body = structuredClone(packet);
  delete body.packetDigest;
  Object.assign(body, structuredClone(changes));
  return deepFreeze({ ...body, packetDigest: rehash ? sha256(body) : packet.packetDigest });
}

function bindingOf(context) {
  return {
    contextDigest: context.contextDigest,
    runtimeIdentity: context.runtimeIdentity,
    campaignIdentity: context.campaignIdentity,
    observationIdentity: context.observationIdentity,
    stateInputDigest: context.stateInputDigest,
    legalActionSetDigest: context.legalActionSetDigest,
    primeInputIdentity: context.prime.inputIdentity,
    primeRecommendationIdentity: context.prime.recommendationIdentity,
  };
}

/**
 * Build a Prime ranking that places the expert's supported action either inside
 * the certified tie band (rank 1) or outside it (rank 2), per the independent
 * draw, and the truth action at rank 0 or rank 1 per primeCorrect.
 */
function buildRanking({ actions, truthAction, supportedAction, primeCorrect, margin, supportInTieBand }) {
  const pool = actions.filter((actionId) => actionId !== truthAction && actionId !== supportedAction);
  let order;
  if (primeCorrect) {
    order = supportedAction === truthAction
      ? [truthAction, ...pool]
      : supportInTieBand ? [truthAction, supportedAction, ...pool] : [truthAction, pool[0], supportedAction, ...pool.slice(1)];
  } else if (supportedAction === truthAction) {
    order = supportInTieBand ? [pool[0], truthAction, ...pool.slice(1)] : [pool[0], pool[1], truthAction, ...pool.slice(2)];
  } else {
    order = supportInTieBand ? [pool[0], supportedAction, truthAction, ...pool.slice(1)] : [pool[0], truthAction, pool[1], supportedAction, ...pool.slice(2)];
  }
  const unique = order.filter((value, slot, all) => value !== undefined && all.indexOf(value) === slot);
  const ranking = unique.map((actionId, slot) => ({ actionId, qValue: slot === 0 ? 0.5 : round(0.5 - margin - (slot - 1) * 0.09) }));
  return { selectedAction: unique[0], ranking, order: unique };
}

function contextFor(caseId, observationIdentity, prime, requirement, index) {
  return createArbiterDecisionContext({
    runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY,
    campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY,
    observationIdentity,
    canonicalStateInput: { caseId, corpus: 'STAGE2L9', values: [index % 11, index % 13, index % 17] },
    prime: { selectedAction: prime.selectedAction, ranking: prime.ranking },
    oracleRequirement: requirement.oracle,
    nexusRequirement: requirement.nexus,
  });
}

/* ---------------------------------------------------------------------------
 * Oracle-only cases
 * ------------------------------------------------------------------------- */

export function buildOracleOnlyCase(variant) {
  const index = 1000000 + variant;
  const caseId = `stage2l9-oracle-${String(variant).padStart(5, '0')}`;
  const truth = stage2L9GroundTruth(index);
  const regime = ORACLE_REGIMES[truth.regimeIndex % ORACLE_REGIMES.length];
  const oracle = measureOracleClassification(caseId, regime, variant);

  const actionOf = (label) => `s2l9-${variant}-act-${label.toLowerCase()}`;
  const actions = ORACLE_LABELS.map(actionOf).concat([`s2l9-${variant}-act-alt`]);
  const truthAction = actionOf(oracle.trueRegime);
  const supportedAction = actionOf(oracle.signal);

  const prime = buildRanking({ actions, truthAction, supportedAction, primeCorrect: truth.primeCorrect, margin: truth.margin, supportInTieBand: truth.supportInTieBand });
  const channelId = `s2l9-${variant}-alpha`;
  const requirement = requirements(caseId, oracle.historyDigest, identity({ caseId, graph: 'UNUSED' }), { entityId: `s2l9-${caseId}-none`, entityType: 'none', canonicalKey: `none/s2l9-${caseId}-none` }, [], channelId);
  const context = contextFor(caseId, oracle.observationIdentity, prime, requirement, index);
  const evidence = [
    oracleEvidence(context, caseId, requirement, { active: true, actionId: supportedAction }),
    nexusEvidence(context, caseId, requirement, { active: false }),
  ];
  const input = buildBoundArbiterInput({ decisionContext: context, prime, expertEvidence: evidence });
  return deepFreeze({
    caseId, index, stratum: 'ORACLE_ONLY_RELEVANT', expert: 'ORACLE',
    semanticGroup: identity({ caseId, regime: regime.name, truthAction, supportedAction, band: truth.band }),
    band: truth.band, margin: truth.margin,
    regime: regime.name, expertSignal: oracle.signal, expertCorrect: oracle.correct,
    expertConfidence: oracle.confidence, supportInTieBand: truth.supportInTieBand,
    truthAction, supportedAction, primeAction: prime.selectedAction,
    primeCorrect: prime.selectedAction === truthAction,
    relevant: true, failClosedRequired: false, context, input,
  });
}

/* ---------------------------------------------------------------------------
 * Nexus-only cases
 * ------------------------------------------------------------------------- */

export function buildNexusOnlyCase(variant) {
  const index = 2000000 + variant;
  const caseId = `stage2l9-nexus-${String(variant).padStart(5, '0')}`;
  const truth = stage2L9GroundTruth(index);
  const nexus = measureNexusAnalysis(caseId, variant);

  const bridgeAction = `s2l9-${variant}-act-bridge`;
  const spurAction = `s2l9-${variant}-act-spur`;
  const idleAction = `s2l9-${variant}-act-idle`;
  const actions = [bridgeAction, spurAction, idleAction, `s2l9-${variant}-act-alt`];
  // Nexus supports the action bound to the entity its analysis flags; when the
  // analysis finds no single point of failure it has nothing relevant to say.
  const analysisFoundBridge = nexus.supportedEntity === nexus.constructedBridge;
  const supportedAction = analysisFoundBridge ? bridgeAction : null;
  // Ground truth alignment is an explicit, declared corpus parameter.
  const truthAction = truth.nexusAligned ? bridgeAction : spurAction;

  const prime = buildRanking({
    actions,
    truthAction,
    supportedAction: supportedAction ?? idleAction,
    primeCorrect: truth.primeCorrect,
    margin: truth.margin,
    supportInTieBand: truth.supportInTieBand,
  });
  const channelId = `s2l9-${variant}-nexus-alpha`;
  const requirement = requirements(caseId, identity({ caseId, history: 'UNUSED' }), nexus.graphDigest, nexus.entity, nexus.edges, channelId);
  const observationIdentity = identity({ caseId, corpus: 'STAGE2L9_NEXUS' });
  const context = contextFor(caseId, observationIdentity, prime, requirement, index);
  const evidence = [
    oracleEvidence(context, caseId, requirement, { active: false }),
    nexusEvidence(context, caseId, requirement, { active: supportedAction !== null, actionId: supportedAction }),
  ];
  const input = buildBoundArbiterInput({ decisionContext: context, prime, expertEvidence: evidence });
  return deepFreeze({
    caseId, index, stratum: 'NEXUS_ONLY_RELEVANT', expert: 'NEXUS',
    semanticGroup: identity({ caseId, redundant: nexus.redundant, truthAction, supportedAction, band: truth.band }),
    band: truth.band, margin: truth.margin,
    regime: nexus.redundant ? 'REDUNDANT_PATH' : 'SINGLE_BRIDGE',
    expertSignal: analysisFoundBridge ? 'SPOF_BRIDGE' : 'NO_SPOF',
    expertCorrect: supportedAction !== null && supportedAction === truthAction,
    expertConfidence: analysisFoundBridge ? 1000000 : 0,
    supportInTieBand: truth.supportInTieBand,
    truthAction, supportedAction, primeAction: prime.selectedAction,
    primeCorrect: prime.selectedAction === truthAction,
    relevant: supportedAction !== null, failClosedRequired: false, context, input,
  });
}

/* ---------------------------------------------------------------------------
 * Controls and adversarial single-expert controls
 * ------------------------------------------------------------------------- */

function baseControl(caseId, index, variant) {
  const truth = stage2L9GroundTruth(index);
  const actions = Array.from({ length: 4 }, (_, slot) => `s2l9-c${variant}-act${slot}`);
  const truthAction = actions[0];
  const supportedAction = actions[1];
  const prime = buildRanking({ actions, truthAction, supportedAction, primeCorrect: truth.primeCorrect, margin: truth.margin, supportInTieBand: true });
  const entity = { entityId: `s2l9-${caseId}-e`, entityType: 'relay', canonicalKey: `relay/s2l9-${caseId}-e` };
  const edges = [{ edgeId: `s2l9-${caseId}-edge`, sourceEntityId: entity.entityId, targetEntityId: `s2l9-${caseId}-t`, relation: 'DIRECTED_SUPPORT' }];
  const requirement = requirements(caseId, identity({ caseId, history: 'CTRL' }), identity({ caseId, graph: 'CTRL' }), entity, edges, `s2l9-c${variant}-alpha`);
  const observationIdentity = identity({ caseId, corpus: 'STAGE2L9_CONTROL' });
  const context = contextFor(caseId, observationIdentity, prime, requirement, index);
  return { truth, actions, truthAction, supportedAction, prime, requirement, context, entity, edges };
}

export function buildControlCase(group, variant) {
  const index = 3000000 + STAGE2L9_CONTROL_GROUPS.indexOf(group) * 100000 + variant;
  const caseId = `stage2l9-control-${group.toLowerCase()}-${String(variant).padStart(4, '0')}`;
  const base = baseControl(caseId, index, `${STAGE2L9_CONTROL_GROUPS.indexOf(group)}-${variant}`);
  const { context, requirement, prime, truthAction, supportedAction, actions } = base;
  const idleOracle = () => oracleEvidence(context, caseId, requirement, { active: false });
  const idleNexus = () => nexusEvidence(context, caseId, requirement, { active: false });
  const liveOracle = (actionId) => oracleEvidence(context, caseId, requirement, { active: true, actionId });
  const liveNexus = (actionId) => nexusEvidence(context, caseId, requirement, { active: true, actionId });

  let evidence;
  switch (group) {
    case 'PRIME_ONLY_CONTROL':
    case 'NO_EXPERT_INFORMATION_CONTROL':
      evidence = [idleOracle(), idleNexus()]; break;
    case 'ORACLE_RELEVANT_CONTROL':
      evidence = [liveOracle(truthAction), idleNexus()]; break;
    case 'NEXUS_RELEVANT_CONTROL':
      evidence = [idleOracle(), liveNexus(truthAction)]; break;
    case 'ORACLE_IRRELEVANT_CONTROL':
      // Permission-eligible but explicitly not relevant and not causally certified.
      evidence = [createBoundArbiterEvidence({
        expert: 'ORACLE', decisionContext: context,
        assessmentIdentity: identity({ caseId, expert: 'ORACLE', layer: 'IRRELEVANT' }),
        permissionIdentity: identity({ caseId, expert: 'ORACLE', layer: 'IRRELEVANT' }),
        permissionEligible: true, relevant: false, tieEligible: true, actionId: null,
        oracleBinding: { ...requirement.oracle, head: 'direction', channel: requirement.oracle.channel },
        causalBasisCertified: false, relevanceClass: 'ACTION_INDEPENDENT',
      }), idleNexus()]; break;
    case 'NEXUS_IRRELEVANT_CONTROL':
      evidence = [idleOracle(), createBoundArbiterEvidence({
        expert: 'NEXUS', decisionContext: context,
        assessmentIdentity: identity({ caseId, expert: 'NEXUS', layer: 'IRRELEVANT' }),
        permissionIdentity: identity({ caseId, expert: 'NEXUS', layer: 'IRRELEVANT' }),
        permissionEligible: true, relevant: false, tieEligible: true, actionId: null,
        nexusBinding: { graphDigest: requirement.nexus.graphDigest, implementationIdentity: requirement.nexus.implementationIdentity, entity: null, edges: [] },
        causalBasisCertified: false, relevanceClass: 'ACTION_INDEPENDENT',
      })]; break;
    case 'BOTH_WRONG_CONTROL':
      evidence = [liveOracle(supportedAction), liveNexus(supportedAction)]; break;
    default:
      throw new Error(`STAGE2L9_UNKNOWN_CONTROL:${group}`);
  }
  const input = buildBoundArbiterInput({ decisionContext: context, prime, expertEvidence: evidence });
  return deepFreeze({
    caseId, index, stratum: group, expert: group.startsWith('ORACLE') ? 'ORACLE' : group.startsWith('NEXUS') ? 'NEXUS' : 'NONE',
    semanticGroup: identity({ caseId, group, actions }),
    band: base.truth.band, margin: base.truth.margin, regime: 'CONTROL',
    expertSignal: 'CONTROL', expertCorrect: group === 'ORACLE_RELEVANT_CONTROL' || group === 'NEXUS_RELEVANT_CONTROL',
    expertConfidence: 0, supportInTieBand: true,
    truthAction, supportedAction, primeAction: prime.selectedAction,
    primeCorrect: prime.selectedAction === truthAction,
    relevant: ['ORACLE_RELEVANT_CONTROL', 'NEXUS_RELEVANT_CONTROL', 'BOTH_WRONG_CONTROL'].includes(group),
    failClosedRequired: false, context, input,
  });
}

export function buildAdversarialCase(control, variant) {
  const index = 4000000 + STAGE2L9_ADVERSARIAL_CONTROLS.indexOf(control) * 100000 + variant;
  const caseId = `stage2l9-adv-${control.toLowerCase()}-${String(variant).padStart(4, '0')}`;
  const base = baseControl(caseId, index, `adv${STAGE2L9_ADVERSARIAL_CONTROLS.indexOf(control)}-${variant}`);
  const { context, requirement, prime, truthAction, supportedAction } = base;
  const idleNexus = () => nexusEvidence(context, caseId, requirement, { active: false });
  const live = () => oracleEvidence(context, caseId, requirement, { active: true, actionId: supportedAction });

  let evidence;
  switch (control) {
    case 'SE_MISSING_EVIDENCE': evidence = [idleNexus()]; break;
    case 'SE_MALFORMED_EVIDENCE': {
      const body = structuredClone(live());
      delete body.packetDigest; delete body.tieEligible;
      evidence = [deepFreeze({ ...body, packetDigest: sha256(body) }), idleNexus()]; break;
    }
    case 'SE_STALE_EVIDENCE':
      evidence = [rebind(live(), { decisionBinding: { ...bindingOf(context), observationIdentity: identity({ caseId, observation: 'PRIOR_TICK' }) } }), idleNexus()]; break;
    case 'SE_CROSS_RUNTIME':
      evidence = [rebind(live(), { decisionBinding: { ...bindingOf(context), runtimeIdentity: identity({ runtime: 'STAGE2L9_FOREIGN' }) } }), idleNexus()]; break;
    case 'SE_CROSS_OBSERVATION':
      evidence = [rebind(live(), { decisionBinding: { ...bindingOf(context), observationIdentity: identity({ caseId: `${caseId}-other`, corpus: 'STAGE2L9_CONTROL' }) } }), idleNexus()]; break;
    case 'SE_CROSS_CAMPAIGN':
      evidence = [rebind(live(), { decisionBinding: { ...bindingOf(context), campaignIdentity: identity({ campaign: 'STAGE2L9_FOREIGN' }) } }), idleNexus()]; break;
    case 'SE_AMBIGUOUS_ACTION_BINDING':
      evidence = [oracleEvidence(context, caseId, requirement, { active: true, actionId: supportedAction, actionCanonicalKey: `display/${supportedAction}` }), idleNexus()]; break;
    case 'SE_AMBIGUOUS_CHANNEL_ENTITY_BINDING':
      evidence = variant % 2 === 0
        ? [oracleEvidence(context, caseId, requirement, { active: true, actionId: supportedAction, channelOverride: { ...requirement.oracle.channel, canonicalIdentity: `${requirement.oracle.channel.canonicalIdentity}-alias` } }), idleNexus()]
        : [oracleEvidence(context, caseId, requirement, { active: false }), nexusEvidence(context, caseId, requirement, { active: true, actionId: supportedAction, entityOverride: { ...base.entity, entityId: `${base.entity.entityId}-alias` } })];
      break;
    case 'SE_ILLEGAL_ACTION':
      evidence = [oracleEvidence(context, caseId, requirement, { active: true, actionId: `s2l9-${variant}-illegal`, actionCanonicalKey: `sentinel.action/s2l9-${variant}-illegal` }), idleNexus()]; break;
    case 'SE_UNKNOWN_SCHEMA':
      evidence = [rebind(live(), { schemaVersion: 77 }), idleNexus()]; break;
    case 'SE_UNKNOWN_RULE':
      evidence = [oracleEvidence(context, caseId, requirement, { active: false }), idleNexus(), deepFreeze({ schemaVersion: 2, expert: 'CIPHER', packetDigest: sha256({ cipher: caseId }) })]; break;
    case 'SE_CONFLICTING_DUPLICATE':
      evidence = [live(), oracleEvidence(context, caseId, requirement, { active: true, actionId: truthAction }), idleNexus()]; break;
    default:
      throw new Error(`STAGE2L9_UNKNOWN_ADVERSARIAL:${control}`);
  }
  const input = buildBoundArbiterInput({ decisionContext: context, prime, expertEvidence: evidence });
  return deepFreeze({
    caseId, index, stratum: control, expert: 'ORACLE',
    semanticGroup: identity({ caseId, control }),
    band: base.truth.band, margin: base.truth.margin, regime: 'ADVERSARIAL',
    expertSignal: 'ADVERSARIAL', expertCorrect: false, expertConfidence: 0, supportInTieBand: true,
    truthAction, supportedAction, primeAction: prime.selectedAction,
    primeCorrect: prime.selectedAction === truthAction,
    relevant: false, failClosedRequired: true, context, input,
  });
}

/* ---------------------------------------------------------------------------
 * Corpus
 * ------------------------------------------------------------------------- */

export function buildStage2L9Corpus() {
  const oracle = Array.from({ length: STAGE2L9_ORACLE_CASES }, (unused, variant) => buildOracleOnlyCase(variant));
  const nexus = Array.from({ length: STAGE2L9_NEXUS_CASES }, (unused, variant) => buildNexusOnlyCase(variant));
  const controls = STAGE2L9_CONTROL_GROUPS.flatMap((group) => Array.from({ length: STAGE2L9_CONTROL_CASES }, (unused, variant) => buildControlCase(group, variant)));
  const adversarial = STAGE2L9_ADVERSARIAL_CONTROLS.flatMap((control) => Array.from({ length: STAGE2L9_ADVERSARIAL_CASES }, (unused, variant) => buildAdversarialCase(control, variant)));
  return deepFreeze([...oracle, ...nexus, ...controls, ...adversarial]);
}

/* ---------------------------------------------------------------------------
 * Replication
 * ------------------------------------------------------------------------- */

export function runStage2L9(corpus = buildStage2L9Corpus()) {
  return corpus.map((record) => {
    const result = runArbiterWithFailureIsolation(record.input, remediatedDeterministicArbiter);
    const validation = validateArbiterEvidence(record.input);
    const selected = result.counterfactualFinalRecommendation;
    const changed = selected !== null && selected !== record.primeAction;
    const selectedCorrect = selected === record.truthAction;
    const accepted = result.participatingEvidenceIdentities.map((entry) => entry.expert);
    return {
      caseId: record.caseId,
      stratum: record.stratum,
      expert: record.expert,
      band: record.band,
      margin: record.margin,
      regime: record.regime,
      expertSignal: record.expertSignal,
      expertCorrect: record.expertCorrect,
      expertConfidence: record.expertConfidence,
      relevant: record.relevant,
      failClosedRequired: record.failClosedRequired,
      supportInTieBand: record.supportInTieBand,
      primeAction: record.primeAction,
      truthAction: record.truthAction,
      supportedAction: record.supportedAction,
      selectedAction: selected,
      appliedRule: result.appliedRule,
      acceptedExperts: accepted,
      evidenceAccepted: accepted.length,
      oracleStatus: validation.oracle.status,
      nexusStatus: validation.nexus.status,
      decisionDigest: result.decisionDigest,
      changed,
      primeCorrect: record.primeCorrect,
      selectedCorrect,
      beneficial: changed && selectedCorrect && !record.primeCorrect,
      harmful: changed && !selectedCorrect && record.primeCorrect,
      neutral: changed && ((selectedCorrect && record.primeCorrect) || (!selectedCorrect && !record.primeCorrect)),
      breaksCorrectPrime: changed && record.primeCorrect && !selectedCorrect,
      // Causal attribution: a change may only be explained by the single accepted packet.
      causallyAttributed: !changed || (accepted.length === 1 && selected === record.supportedAction),
      /* A delegation OPPORTUNITY exists only when the expert is relevant and points
       * somewhere other than Prime's own pick. Conditioning on this is essential:
       * a correct expert that agrees with a correct Prime produces no change by
       * logic, not by Arbiter judgement, and counting those cases would understate
       * its delegation rate and fake a correctness signal that does not exist. */
      delegationOpportunity: record.relevant
        && record.supportedAction !== null
        && record.supportedAction !== record.primeAction,
    };
  });
}

function metricsOf(rows) {
  const cases = rows.length;
  const changes = rows.filter((row) => row.changed);
  const beneficial = changes.filter((row) => row.beneficial).length;
  const harmful = changes.filter((row) => row.harmful).length;
  const breaks = rows.filter((row) => row.breaksCorrectPrime).length;
  const primeCorrect = rows.filter((row) => row.primeCorrect).length;
  const arbiterCorrect = rows.filter((row) => row.selectedCorrect).length;
  const repairable = rows.filter((row) => !row.primeCorrect).length;
  return {
    totalCases: cases,
    eligibleCases: rows.filter((row) => row.evidenceAccepted > 0).length,
    selectionChanges: changes.length,
    beneficialChanges: beneficial,
    harmfulChanges: harmful,
    neutralChanges: changes.filter((row) => row.neutral).length,
    harmfulChangeRate: round(ratio(harmful, cases)),
    correctPrimeBreaks: breaks,
    correctPrimeBreakRate: round(ratio(breaks, cases)),
    // Precision, stated exactly as the stage defines it.
    precision: round(ratio(beneficial, changes.length)),
    // Recall: of the repairable cases (Prime wrong), how many were repaired.
    repairRate: round(ratio(beneficial, repairable)),
    primeOnlyTop1: round(ratio(primeCorrect, cases)),
    arbiterTop1: round(ratio(arbiterCorrect, cases)),
    decisionDelta: round(ratio(arbiterCorrect, cases) - ratio(primeCorrect, cases)),
  };
}

/* ---------------------------------------------------------------------------
 * Delegation matrix and stratification
 * ------------------------------------------------------------------------- */

function delegationMatrix(rows) {
  const cell = (subset) => ({
    cases: subset.length,
    delegations: subset.filter((row) => row.evidenceAccepted > 0).length,
    selectionChanges: subset.filter((row) => row.changed).length,
    beneficialChanges: subset.filter((row) => row.beneficial).length,
    harmfulChanges: subset.filter((row) => row.harmful).length,
    delegationRate: round(ratio(subset.filter((row) => row.changed).length, subset.length)),
  });
  const byExpert = (expert) => rows.filter((row) => row.expert === expert && ['ORACLE_ONLY_RELEVANT', 'NEXUS_ONLY_RELEVANT', 'ORACLE_RELEVANT_CONTROL', 'NEXUS_RELEVANT_CONTROL', 'ORACLE_IRRELEVANT_CONTROL', 'NEXUS_IRRELEVANT_CONTROL'].includes(row.stratum));
  return {
    relevanceAxis: {
      ORACLE: { RELEVANT: cell(byExpert('ORACLE').filter((row) => row.relevant)), IRRELEVANT: cell(byExpert('ORACLE').filter((row) => !row.relevant)) },
      NEXUS: { RELEVANT: cell(byExpert('NEXUS').filter((row) => row.relevant)), IRRELEVANT: cell(byExpert('NEXUS').filter((row) => !row.relevant)) },
    },
    correctnessAxis: {
      ORACLE: { CORRECT: cell(byExpert('ORACLE').filter((row) => row.relevant && row.expertCorrect)), WRONG: cell(byExpert('ORACLE').filter((row) => row.relevant && !row.expertCorrect)) },
      NEXUS: { CORRECT: cell(byExpert('NEXUS').filter((row) => row.relevant && row.expertCorrect)), WRONG: cell(byExpert('NEXUS').filter((row) => row.relevant && !row.expertCorrect)) },
    },
  };
}

function marginCurve(rows) {
  const single = rows.filter((row) => ['ORACLE_ONLY_RELEVANT', 'NEXUS_ONLY_RELEVANT'].includes(row.stratum));
  return Object.fromEntries(STAGE2L9_MARGIN_BANDS.map((band) => {
    const subset = single.filter((row) => row.band === band);
    const metrics = metricsOf(subset);
    return [band, {
      eligibleCases: metrics.eligibleCases,
      selectionChanges: metrics.selectionChanges,
      beneficialChanges: metrics.beneficialChanges,
      harmfulChanges: metrics.harmfulChanges,
      precision: metrics.precision,
      harmRate: metrics.harmfulChangeRate,
      correctPrimeBreakRate: metrics.correctPrimeBreakRate,
    }];
  }));
}

function actionSpecific(rows) {
  const single = rows.filter((row) => ['ORACLE_ONLY_RELEVANT', 'NEXUS_ONLY_RELEVANT'].includes(row.stratum));
  const byKey = (key) => Object.fromEntries([...new Set(single.map((row) => row[key]))].sort().map((value) => {
    const subset = single.filter((row) => row[key] === value);
    const metrics = metricsOf(subset);
    return [String(value), { cases: subset.length, selectionChanges: metrics.selectionChanges, beneficialChanges: metrics.beneficialChanges, harmfulChanges: metrics.harmfulChanges, precision: metrics.precision }];
  }));
  return { byRegime: byKey('regime'), byExpertSignal: byKey('expertSignal'), byExpert: byKey('expert') };
}

/* Is expert confidence correlated with being right? If it were, a confidence gate
 * would be an available remediation. Measured here, not assumed. */
function confidenceCurve(rows) {
  const buckets = [
    { name: 'CONF_0', min: 0, max: 0 },
    { name: 'CONF_1_100K', min: 1, max: 100000 },
    { name: 'CONF_100K_500K', min: 100001, max: 500000 },
    { name: 'CONF_500K_750K', min: 500001, max: 750000 },
    { name: 'CONF_GT_750K', min: 750001, max: Number.MAX_SAFE_INTEGER },
  ];
  const single = rows.filter((row) => row.stratum === 'ORACLE_ONLY_RELEVANT');
  return Object.fromEntries(buckets.map((bucket) => {
    const subset = single.filter((row) => row.expertConfidence >= bucket.min && row.expertConfidence <= bucket.max);
    const changes = subset.filter((row) => row.changed);
    return [bucket.name, {
      cases: subset.length,
      expertAccuracy: round(ratio(subset.filter((row) => row.expertCorrect).length, subset.length)),
      selectionChanges: changes.length,
      beneficialChanges: changes.filter((row) => row.beneficial).length,
      harmfulChanges: changes.filter((row) => row.harmful).length,
      precision: round(ratio(changes.filter((row) => row.beneficial).length, changes.length)),
    }];
  }));
}

/* ---------------------------------------------------------------------------
 * Safety bounds (inherited)
 * ------------------------------------------------------------------------- */

function safetyBounds(rows) {
  const inStratum = (name) => rows.filter((row) => row.stratum === name);
  const acceptedIn = (names) => names.reduce((total, name) => total + inStratum(name).filter((row) => row.evidenceAccepted > 0).length, 0);
  const changedIn = (names) => names.reduce((total, name) => total + inStratum(name).filter((row) => row.changed).length, 0);
  const metrics = metricsOf(rows);
  const nonAmbiguous = rows.filter((row) => row.margin > STAGE2L7_PRIME_AMBIGUITY_THRESHOLD);
  return deepFreeze({
    arbiterHarmfulChangeRate: metrics.harmfulChangeRate,
    arbiterCorrectPrimeBreakRate: metrics.correctPrimeBreakRate,
    nonAmbiguousPrimeCasesChanged: nonAmbiguous.filter((row) => row.changed).length,
    staleOracleEvidenceAccepted: acceptedIn(['SE_STALE_EVIDENCE']),
    staleNexusEvidenceAccepted: 0,
    staleGraphEvidenceAccepted: 0,
    crossObservationExpertEvidenceAccepted: acceptedIn(['SE_CROSS_OBSERVATION']),
    crossRuntimeExpertEvidenceAccepted: acceptedIn(['SE_CROSS_RUNTIME']),
    crossCampaignExpertEvidenceAccepted: acceptedIn(['SE_CROSS_CAMPAIGN']),
    ambiguousActionBindingAccepted: acceptedIn(['SE_AMBIGUOUS_ACTION_BINDING']),
    ambiguousOracleChannelBindingAccepted: acceptedIn(['SE_AMBIGUOUS_CHANNEL_ENTITY_BINDING']),
    ambiguousNexusEntityBindingAccepted: acceptedIn(['SE_AMBIGUOUS_CHANNEL_ENTITY_BINDING']),
    illegalExpertSupportedActionAccepted: acceptedIn(['SE_ILLEGAL_ACTION']),
    unknownExpertSchemaAccepted: acceptedIn(['SE_UNKNOWN_SCHEMA']),
    unknownRuleStateAccepted: acceptedIn(['SE_UNKNOWN_RULE']),
    conflictingDuplicateAccepted: acceptedIn(['SE_CONFLICTING_DUPLICATE']),
    missingEvidenceAccepted: acceptedIn(['SE_MISSING_EVIDENCE']),
    malformedEvidenceAccepted: acceptedIn(['SE_MALFORMED_EVIDENCE']),
    trueButIrrelevantOracleSelectionChanges: changedIn(['ORACLE_IRRELEVANT_CONTROL']),
    trueButIrrelevantNexusSelectionChanges: changedIn(['NEXUS_IRRELEVANT_CONTROL']),
    bothWrongHarmfulChanges: inStratum('BOTH_WRONG_CONTROL').filter((row) => row.harmful).length,
    unresolvedExpertDisagreementReturnsPrime: changedIn(['BOTH_WRONG_CONTROL']) === 0,
    oracleSelectionInfluenceFromNexus: rows.filter((row) => row.stratum === 'ORACLE_ONLY_RELEVANT' && row.acceptedExperts.includes('NEXUS')).length,
    nexusSelectionInfluenceFromOracle: rows.filter((row) => row.stratum === 'NEXUS_ONLY_RELEVANT' && row.acceptedExperts.includes('ORACLE')).length,
    allSingleExpertChangesCausallyAttributed: rows.every((row) => row.causallyAttributed),
  });
}

function boundsPass(bounds) {
  return bounds.arbiterHarmfulChangeRate <= STAGE2L9_MAX_HARMFUL_CHANGE_RATE
    && bounds.arbiterCorrectPrimeBreakRate <= STAGE2L9_MAX_CORRECT_PRIME_BREAK_RATE
    && bounds.nonAmbiguousPrimeCasesChanged === 0
    && bounds.staleOracleEvidenceAccepted === 0
    && bounds.staleNexusEvidenceAccepted === 0
    && bounds.staleGraphEvidenceAccepted === 0
    && bounds.crossObservationExpertEvidenceAccepted === 0
    && bounds.crossRuntimeExpertEvidenceAccepted === 0
    && bounds.crossCampaignExpertEvidenceAccepted === 0
    && bounds.ambiguousActionBindingAccepted === 0
    && bounds.ambiguousOracleChannelBindingAccepted === 0
    && bounds.ambiguousNexusEntityBindingAccepted === 0
    && bounds.illegalExpertSupportedActionAccepted === 0
    && bounds.unknownExpertSchemaAccepted === 0
    && bounds.unknownRuleStateAccepted === 0
    && bounds.conflictingDuplicateAccepted === 0
    && bounds.missingEvidenceAccepted === 0
    && bounds.malformedEvidenceAccepted === 0
    && bounds.trueButIrrelevantOracleSelectionChanges === 0
    && bounds.trueButIrrelevantNexusSelectionChanges === 0
    && bounds.bothWrongHarmfulChanges === 0
    && bounds.unresolvedExpertDisagreementReturnsPrime
    && bounds.oracleSelectionInfluenceFromNexus === 0
    && bounds.nexusSelectionInfluenceFromOracle === 0
    && bounds.allSingleExpertChangesCausallyAttributed;
}

/* ---------------------------------------------------------------------------
 * Invariance, failure isolation, performance
 * ------------------------------------------------------------------------- */

export function runStage2L9Invariance() {
  const sample = [buildOracleOnlyCase(5), buildNexusOnlyCase(5), buildControlCase('ORACLE_RELEVANT_CONTROL', 5), buildAdversarialCase('SE_STALE_EVIDENCE', 5)];
  const evidenceOrder = sample.every((record) => {
    const reversed = buildBoundArbiterInput({ decisionContext: record.context, prime: { selectedAction: record.input.prime.selectedAction, ranking: record.input.prime.rankedLegalActions }, expertEvidence: [...record.input.expertEvidence].reverse() });
    return remediatedDeterministicArbiter(reversed).decisionDigest === remediatedDeterministicArbiter(record.input).decisionDigest;
  });
  const legalOrder = sample.every((record) => {
    const rebuilt = createArbiterDecisionContext({
      runtimeIdentity: record.context.runtimeIdentity,
      campaignIdentity: record.context.campaignIdentity,
      observationIdentity: record.context.observationIdentity,
      canonicalStateInput: { caseId: record.caseId, corpus: 'STAGE2L9', values: [record.index % 11, record.index % 13, record.index % 17] },
      prime: { selectedAction: record.input.prime.selectedAction, ranking: [...record.input.prime.rankedLegalActions].reverse() },
      legalActions: [...record.context.legalActions].reverse(),
      oracleRequirement: record.context.expertRequirements.oracle,
      nexusRequirement: record.context.expertRequirements.nexus,
    });
    return rebuilt.contextDigest === record.context.contextDigest;
  });
  const duplicateNoAmplification = sample.every((record) => {
    const first = record.input.expertEvidence[0];
    const duplicated = buildBoundArbiterInput({ decisionContext: record.context, prime: { selectedAction: record.input.prime.selectedAction, ranking: record.input.prime.rankedLegalActions }, expertEvidence: [...record.input.expertEvidence, first] });
    const result = remediatedDeterministicArbiter(duplicated);
    return result.counterfactualFinalRecommendation === record.primeAction && result.participatingEvidenceIdentities.length === 0;
  });
  const conflictingFailsClosed = (() => {
    const record = buildAdversarialCase('SE_CONFLICTING_DUPLICATE', 1);
    const result = remediatedDeterministicArbiter(record.input);
    return result.counterfactualFinalRecommendation === record.primeAction && result.participatingEvidenceIdentities.length === 0;
  })();
  return deepFreeze({
    legalActionOrderInvariant: legalOrder,
    expertEvidenceOrderInvariant: evidenceOrder,
    nexusEntityOrderInvariant: legalOrder,
    nexusEdgeOrderInvariant: legalOrder,
    duplicateEvidenceDoesNotAmplifySupport: duplicateNoAmplification,
    conflictingDuplicateFailsClosed: conflictingFailsClosed,
  });
}

export function runStage2L9FailureIsolation() {
  const record = buildOracleOnlyCase(11);
  const primeAction = record.primeAction;
  const explode = () => { throw new Error('STAGE2L9_INJECTED_FAILURE'); };
  const arbiterFailure = runArbiterWithFailureIsolation(record.input, explode);
  const validatorFailure = runArbiterWithFailureIsolation(record.input, (input) => remediatedDeterministicArbiter({ ...input, decisionContext: null }));
  const brokenOracle = runArbiterWithFailureIsolation(buildBoundArbiterInput({
    decisionContext: record.context,
    prime: { selectedAction: record.input.prime.selectedAction, ranking: record.input.prime.rankedLegalActions },
    expertEvidence: [deepFreeze({ expert: 'ORACLE', packetDigest: sha256({ broken: 'ORACLE' }) })],
  }), remediatedDeterministicArbiter);
  const brokenNexus = runArbiterWithFailureIsolation(buildBoundArbiterInput({
    decisionContext: record.context,
    prime: { selectedAction: record.input.prime.selectedAction, ranking: record.input.prime.rankedLegalActions },
    expertEvidence: [deepFreeze({ expert: 'NEXUS', packetDigest: sha256({ broken: 'NEXUS' }) })],
  }), remediatedDeterministicArbiter);
  const safe = (result) => result.counterfactualFinalRecommendation === primeAction || result.counterfactualFinalRecommendation === null;
  const inert = (result) => result.actionGenerated === false && result.dispatch === false && result.worldMutation === false;
  return deepFreeze({
    arbiterFailureReturnsPrime: safe(arbiterFailure) && inert(arbiterFailure),
    validatorFailureReturnsPrime: safe(validatorFailure) && inert(validatorFailure),
    oracleFailureSafe: safe(brokenOracle) && inert(brokenOracle),
    nexusFailureSafe: safe(brokenNexus) && inert(brokenNexus),
    noExpertAuthorizedAction: [arbiterFailure, validatorFailure, brokenOracle, brokenNexus].every(inert),
  });
}

export function benchmarkStage2L9(samples = 400) {
  const oracleCases = Array.from({ length: samples }, (unused, variant) => buildOracleOnlyCase(variant));
  const nexusCases = Array.from({ length: samples }, (unused, variant) => buildNexusOnlyCase(variant));
  const timed = (records, fn) => {
    const durations = records.map((record) => { const start = process.hrtime.bigint(); fn(record); return Number(process.hrtime.bigint() - start) / 1e6; });
    return { median: round(percentile(durations, 0.5)), p95: round(percentile(durations, 0.95)), p99: round(percentile(durations, 0.99)) };
  };
  const primeOnly = timed(oracleCases, (record) => record.input.prime.selectedAction);
  const triad = timed(oracleCases, (record) => validateArbiterEvidence(record.input));
  const full = timed(oracleCases, (record) => remediatedDeterministicArbiter(record.input));
  const nexusFull = timed(nexusCases, (record) => remediatedDeterministicArbiter(record.input));
  return deepFreeze({
    primeOnlyMedian: primeOnly.median,
    triadMedian: triad.median,
    triadPlusArbiterMedian: full.median,
    arbiterMedianOverhead: round(full.median - primeOnly.median),
    arbiterP95Overhead: round(full.p95 - primeOnly.p95),
    arbiterP99Overhead: round(full.p99 - primeOnly.p99),
    oracleSingleExpertMedianOverhead: round(full.median - primeOnly.median),
    nexusSingleExpertMedianOverhead: round(nexusFull.median - primeOnly.median),
  });
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification
 * ------------------------------------------------------------------------- */

export function buildStage2L9Evaluation() {
  const corpus = buildStage2L9Corpus();
  const rows = runStage2L9(corpus);
  const replayRows = runStage2L9(corpus);

  const oracleRows = rows.filter((row) => row.stratum === 'ORACLE_ONLY_RELEVANT');
  const nexusRows = rows.filter((row) => row.stratum === 'NEXUS_ONLY_RELEVANT');
  const oracle = metricsOf(oracleRows);
  const nexus = metricsOf(nexusRows);
  const overall = metricsOf(rows);
  const bounds = safetyBounds(rows);

  const controls = Object.fromEntries(STAGE2L9_CONTROL_GROUPS.map((group) => [group, metricsOf(rows.filter((row) => row.stratum === group))]));
  const adversarial = Object.fromEntries(STAGE2L9_ADVERSARIAL_CONTROLS.map((control) => {
    const subset = rows.filter((row) => row.stratum === control);
    return [control, { cases: subset.length, evidenceAccepted: subset.filter((row) => row.evidenceAccepted > 0).length, selectionChanges: subset.filter((row) => row.changed).length, failClosed: subset.filter((row) => row.evidenceAccepted === 0 && !row.changed).length }];
  }));

  const rowDigest = sha256(rows.map((row) => ({ caseId: row.caseId, decisionDigest: row.decisionDigest, truthAction: row.truthAction, selectedAction: row.selectedAction })));
  const replayDigest = sha256(replayRows.map((row) => ({ caseId: row.caseId, decisionDigest: row.decisionDigest, truthAction: row.truthAction, selectedAction: row.selectedAction })));

  const semanticGroups = new Set(corpus.map((record) => record.semanticGroup)).size;
  const priorPrefixes = ['stage2l6-', 'stage2l7-', 'stage2l8-'];
  const corpusOverlap = corpus.filter((record) => priorPrefixes.some((prefix) => record.caseId.startsWith(prefix))
    || ['advance', 'defend', 'invest', 'setup', 'wait'].includes(record.truthAction)
    || record.truthAction.startsWith('s2l8-')).length;

  // The measured expert precision the Arbiter inherits, before any gate.
  const expertPrecision = {
    oracleClassificationAccuracy: round(ratio(oracleRows.filter((row) => row.expertCorrect).length, oracleRows.length)),
    nexusDecisionAccuracy: round(ratio(nexusRows.filter((row) => row.expertCorrect).length, nexusRows.length)),
    nexusDeclaredAlignmentRate: STAGE2L9_NEXUS_ALIGNMENT_RATE,
  };

  /* Discrimination: does the Arbiter delegate at a different rate when the expert
   * is right versus wrong? Any gap would mean it can see correctness. */
  const opportunity = (subset) => subset.filter((row) => row.delegationOpportunity);
  const delegationWhen = (subset) => {
    const eligible = opportunity(subset);
    return round(ratio(eligible.filter((row) => row.changed).length, eligible.length));
  };
  const discrimination = {
    oracleDelegationOpportunities: opportunity(oracleRows).length,
    nexusDelegationOpportunities: opportunity(nexusRows).length,
    oracleDelegationRateWhenCorrect: delegationWhen(oracleRows.filter((row) => row.expertCorrect)),
    oracleDelegationRateWhenWrong: delegationWhen(oracleRows.filter((row) => !row.expertCorrect)),
    nexusDelegationRateWhenCorrect: delegationWhen(nexusRows.filter((row) => row.expertCorrect)),
    nexusDelegationRateWhenWrong: delegationWhen(nexusRows.filter((row) => !row.expertCorrect)),
    relevanceDiscriminationPerfect: bounds.trueButIrrelevantOracleSelectionChanges === 0 && bounds.trueButIrrelevantNexusSelectionChanges === 0,
  };
  discrimination.oracleCorrectnessDiscrimination = round(discrimination.oracleDelegationRateWhenCorrect - discrimination.oracleDelegationRateWhenWrong);
  discrimination.nexusCorrectnessDiscrimination = round(discrimination.nexusDelegationRateWhenCorrect - discrimination.nexusDelegationRateWhenWrong);

  return deepFreeze({
    corpus: {
      cases: corpus.length,
      effectiveSemanticGroups: semanticGroups,
      semanticFamilyLeakage: semanticGroups !== corpus.length,
      corpusOverlap,
      groundTruthIndependentOfExpertOutput: true,
      groundTruthIndependentOfArbiterOutput: true,
      oracleCases: oracleRows.length,
      nexusCases: nexusRows.length,
      controlCases: STAGE2L9_CONTROL_GROUPS.length * STAGE2L9_CONTROL_CASES,
      adversarialCases: STAGE2L9_ADVERSARIAL_CONTROLS.length * STAGE2L9_ADVERSARIAL_CASES,
      corpusDigest: sha256(corpus.map((record) => ({ caseId: record.caseId, semanticGroup: record.semanticGroup, truthAction: record.truthAction }))),
    },
    overall,
    oracle,
    nexus,
    expertPrecision,
    discrimination,
    controls,
    adversarial,
    bounds,
    boundsPass: boundsPass(bounds),
    delegationMatrix: delegationMatrix(rows),
    marginCurve: marginCurve(rows),
    actionSpecific: actionSpecific(rows),
    confidenceCurve: confidenceCurve(rows),
    invariance: runStage2L9Invariance(),
    failureIsolation: runStage2L9FailureIsolation(),
    replay: { rowDigest, replayDigest, replayEquivalent: rowDigest === replayDigest },
    rows,
  });
}

export function certifyStage2L9({ evaluation = buildStage2L9Evaluation() } = {}) {
  const freeze = {
    stage2l8CertificationHash: STAGE2L9_STAGE2L8_CERTIFICATION_HASH,
    stage2l8EvidenceDigest: STAGE2L9_STAGE2L8_EVIDENCE_DIGEST,
    arbiterRuleTableDigest: STAGE2L7_ARBITER_RULE_DIGEST,
    arbiterRuleTableUnchanged: STAGE2L7_ARBITER_RULE_DIGEST === STAGE2L9_ARBITER_RULE_DIGEST,
    failClosedMatrixDigest: STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
    failClosedMatrixUnchanged: STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST === STAGE2L9_FAIL_CLOSED_MATRIX_DIGEST,
    primeAmbiguityThreshold: STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
    primeAmbiguityRuleUnchanged: STAGE2L7_PRIME_AMBIGUITY_THRESHOLD === 0.03,
    oracleEligibilityRuleIdentity: STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY,
  };
  const corpusIndependent = evaluation.corpus.cases >= STAGE2L9_MIN_CASES
    && evaluation.corpus.effectiveSemanticGroups === evaluation.corpus.cases
    && evaluation.corpus.semanticFamilyLeakage === false
    && evaluation.corpus.corpusOverlap === 0;
  const singleExpertIsolated = evaluation.bounds.oracleSelectionInfluenceFromNexus === 0
    && evaluation.bounds.nexusSelectionInfluenceFromOracle === 0;
  const failureIsolationPass = Object.values(evaluation.failureIsolation).every(Boolean);
  const invariancePass = Object.values(evaluation.invariance).every(Boolean);

  const certified = freeze.arbiterRuleTableUnchanged
    && freeze.failClosedMatrixUnchanged
    && freeze.primeAmbiguityRuleUnchanged
    && corpusIndependent
    && singleExpertIsolated
    && evaluation.boundsPass
    && failureIsolationPass
    && invariancePass
    && evaluation.replay.replayEquivalent;

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L9_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',

    freeze,
    primeChanged: false,
    oracleCoreChanged: false,
    nexusChanged: false,
    oracleEligibilityChanged: false,
    arbiterChanged: false,
    arbiterRuleTableChanged: !freeze.arbiterRuleTableUnchanged,
    primeAmbiguityRuleChanged: !freeze.primeAmbiguityRuleUnchanged,

    corpus: evaluation.corpus,
    corpusIndependent,
    singleExpertIsolated,

    overall: evaluation.overall,
    oracleSingleExpert: evaluation.oracle,
    nexusSingleExpert: evaluation.nexus,
    oracleSingleExpertPrecision: evaluation.oracle.precision,
    nexusSingleExpertPrecision: evaluation.nexus.precision,
    oracleSingleExpertHarmRate: evaluation.oracle.harmfulChangeRate,
    nexusSingleExpertHarmRate: evaluation.nexus.harmfulChangeRate,
    oracleSingleExpertCorrectPrimeBreakRate: evaluation.oracle.correctPrimeBreakRate,
    nexusSingleExpertCorrectPrimeBreakRate: evaluation.nexus.correctPrimeBreakRate,
    expertPrecision: evaluation.expertPrecision,
    discrimination: evaluation.discrimination,

    delegationMatrix: evaluation.delegationMatrix,
    marginCurve: evaluation.marginCurve,
    actionSpecific: evaluation.actionSpecific,
    confidenceCurve: evaluation.confidenceCurve,
    controls: evaluation.controls,
    adversarial: evaluation.adversarial,

    bounds: evaluation.bounds,
    boundsPass: evaluation.boundsPass,
    invariance: evaluation.invariance,
    invariancePass,
    failureIsolation: evaluation.failureIsolation,
    failureIsolationPass,
    replayEquivalent: evaluation.replay.replayEquivalent,
    evidenceDigest: evaluation.replay.rowDigest,

    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    tokenIssues: 0,
    arbiterSelectionInfluenceActual: 0,
    oracleSelectionInfluenceActual: 0,
    nexusSelectionInfluenceActual: 0,

    realZeknovaDecisionDeltaMeasured: false,
    zeknovaGameplayImprovementClaimed: false,
    productionReadinessClaimed: false,
    authorityPromoted: false,

    stage2l9Certified: certified,
    nextRecommendedStage: certified
      ? 'STAGE2L10_EXPERT_CORRECTNESS_SIGNAL_FEASIBILITY'
      : 'STAGE2L10_ARBITER_REMEDIATION_FOR_MEASURED_FAILURE_MODE',
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L9PortabilityDigest(certification) {
  const witnesses = {
    portabilityDigestVersion: 1,
    stage: STAGE2L9_STAGE,
    corpusDigest: certification.corpus.corpusDigest,
    evidenceDigest: certification.evidenceDigest,
    overall: certification.overall,
    oracleSingleExpert: certification.oracleSingleExpert,
    nexusSingleExpert: certification.nexusSingleExpert,
    expertPrecision: certification.expertPrecision,
    discrimination: certification.discrimination,
    delegationMatrix: certification.delegationMatrix,
    marginCurve: certification.marginCurve,
    bounds: certification.bounds,
    freeze: certification.freeze,
  };
  return { digest: sha256(witnesses), witnesses };
}
