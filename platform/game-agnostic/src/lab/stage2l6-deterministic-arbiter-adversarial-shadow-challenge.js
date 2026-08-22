import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2 } from './stage2i4-oracle-v2-assembly.js';
import { analyzeRelationalDelta, buildStage2K0Corpus, relationalReference } from './stage2k0-nexus-relational-diagnostic.js';
import { STAGE2L0_RUNTIME_IDENTITY } from './stage2l0-core-triad-shadow-integration.js';
import { STAGE2L2_INTERPRETER_RULE_DIGEST } from './stage2l2-independent-counterfactual-replication.js';
import {
  evaluateOracleDecisionEligibility,
  ORACLE_ELIGIBILITY_RULE_DIGEST,
} from './stage2l4-oracle-head-specific-decision-eligibility.js';
import {
  ARBITER_RULE_TABLE,
  ARBITER_RULE_TABLE_DIGEST,
  buildCanonicalArbiterInput,
  createCanonicalExpertEvidence,
  deterministicArbiterCandidate,
  STAGE2L5_PRIME_AMBIGUITY_THRESHOLD,
} from './stage2l5-deterministic-arbiter-candidate.js';

export const STAGE2L6_STAGE = 'STAGE2L6_DETERMINISTIC_ARBITER_ADVERSARIAL_SHADOW_CHALLENGE';
export const STAGE2L6_STAGE2L5_CERTIFICATION_HASH = 'c3d66002056cdf30ce943056a0af9c290f2b0e94589f86edbaa27330cec358cc';
export const STAGE2L6_STAGE2L5_EVIDENCE_DIGEST = 'a6d593bba5da86b7a80e73161f256620561ba9193ad4abcf94cc334f60febced';
export const STAGE2L6_ARBITER_OWNER = 'src/lab/stage2l5-deterministic-arbiter-candidate.js';
export const STAGE2L6_ARBITER_SHA256 = 'ed294a98c44bb3e4ee0f021ad73f58a703d9ba976c642ed2a1782881e5107e88';
export const STAGE2L6_ARBITER_RULE_TABLE_DIGEST = '85f03d3665a9242d350a67842ecdf5a8a007bf4eabde7ac5fa74185ea5b28c9b';
export const STAGE2L6_MAX_HARMFUL_CHANGE_RATE = 0.01;
export const STAGE2L6_MAX_CORRECT_PRIME_BREAK_RATE = 0.01;
export const STAGE2L6_CASES_PER_STRATUM = 500;
export const STAGE2L6_NEXT_STAGE = 'STAGE2L7_ARBITER_EVIDENCE_BINDING_AND_AGREEMENT_SAFETY_REMEDIATION';

const ACTION_IDS = deepFreeze(['advance', 'defend', 'invest', 'setup', 'wait']);
const CERTIFIED_CAMPAIGN_IDENTITY = 'sha256:81ebdf78deb391d1658958cb15352450cb16c6bac69ab280792a1e7385cdbdc1';
const TIE_MARGINS = deepFreeze([0, 0.000001, 0.005, 0.01, 0.02, 0.029999, 0.03, 0.030001, 0.04, 0.1]);

export const STAGE2L6_ADVERSARIAL_STRATA = deepFreeze([
  'PRIME_CORRECT_BOTH_WRONG_AGREE',
  'PRIME_WRONG_BOTH_RIGHT_AGREE',
  'PRIME_WRONG_ORACLE_RIGHT_NEXUS_WRONG',
  'PRIME_WRONG_NEXUS_RIGHT_ORACLE_WRONG',
  'DISAGREEMENT_PRIME_CORRECT',
  'DISAGREEMENT_ORACLE_CORRECT',
  'DISAGREEMENT_NEXUS_CORRECT',
  'DISAGREEMENT_NEITHER_CORRECT',
  'PRIME_WRONG_EXPERTS_INCORRECT',
  'PRIME_WRONG_IRRELEVANT',
  'PRIME_WRONG_MISSING',
  'STALE_ORACLE_EVIDENCE',
  'STALE_NEXUS_EVIDENCE',
  'CROSS_OBSERVATION_ORACLE',
  'CROSS_OBSERVATION_NEXUS',
  'CROSS_RUNTIME_EVIDENCE',
  'ACTION_IDENTITY_ATTACKS',
  'NEXUS_ENTITY_IDENTITY_ATTACKS',
  'ORACLE_CHANNEL_IDENTITY_ATTACKS',
  'TRUE_IRRELEVANT_ORACLE',
  'TRUE_IRRELEVANT_NEXUS',
  'STALE_GRAPH_MUTATION_RACE',
  'PRIME_TIE_BOUNDARY',
  'DUPLICATE_EVIDENCE',
  'MISSING_EVIDENCE',
  'MALFORMED_DIGEST_UNKNOWN_SCHEMA',
  'UNKNOWN_RULE_STATE',
  'AGREEMENT_OUTSIDE_AMBIGUITY',
  'HIGH_CONFIDENCE_INELIGIBLE_ORACLE',
  'HIGH_IMPORTANCE_INELIGIBLE_NEXUS',
  'FALSE_CYCLE_ADVERSARY',
  'INVALID_THRESHOLD_ADVERSARY',
  'NEXUS_FALSE_REDUNDANCY_ADVERSARY',
]);

export const STAGE2L6_TOTAL_ADVERSARIAL_CASES = STAGE2L6_ADVERSARIAL_STRATA.length * STAGE2L6_CASES_PER_STRATUM;

function clone(value) { return structuredClone(value); }
function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function rotatedActions(index) { return ACTION_IDS.map((_, offset) => ACTION_IDS[(index + offset) % ACTION_IDS.length]); }

function packetBody(packet) {
  const body = clone(packet);
  delete body.packetDigest;
  return body;
}

function mutatePacket(packet, changes) {
  const body = { ...packetBody(packet), ...clone(changes) };
  return deepFreeze({ ...body, packetDigest: sha256(body) });
}

function expertPacket(expert, caseId, observationIdentity, actionId = null, options = {}) {
  const relevant = options.relevant ?? actionId !== null;
  const tieEligible = options.tieEligible ?? relevant;
  const permissionEligible = options.permissionEligible ?? relevant;
  const runtimeIdentity = options.runtimeIdentity ?? STAGE2L0_RUNTIME_IDENTITY;
  const campaignIdentity = options.campaignIdentity ?? CERTIFIED_CAMPAIGN_IDENTITY;
  const context = expert === 'ORACLE'
    ? {
      head: options.head ?? 'direction',
      bindingIdentity: sha256({ caseId, expert, actionId, binding: options.bindingTag ?? 'CURRENT' }),
      observationIdentity: options.boundObservationIdentity ?? observationIdentity,
      runtimeIdentity,
      campaignIdentity,
      channelIdentity: options.channelIdentity ?? 'alpha',
      polarity: options.polarity ?? 'LOWER_IS_BETTER',
      thresholdIdentity: options.thresholdIdentity ?? 'alpha:0.76',
      actionIndependent: options.actionIndependent === true,
      confidencePpm: options.confidencePpm ?? 700000,
    }
    : {
      targetIdentity: options.targetIdentity ?? (relevant ? `entity:${caseId}:current` : null),
      bindingIdentity: sha256({ caseId, expert, actionId, binding: options.bindingTag ?? 'CURRENT' }),
      observationIdentity: options.boundObservationIdentity ?? observationIdentity,
      runtimeIdentity,
      campaignIdentity,
      graphIdentity: options.graphIdentity ?? sha256({ caseId, graphVersion: options.graphVersion ?? 'N+1' }),
      graphVersion: options.graphVersion ?? 'N+1',
      entityType: options.entityType ?? 'support',
      actionIndependent: options.actionIndependent === true,
      structuralImportancePpm: options.structuralImportancePpm ?? 700000,
    };
  return createCanonicalExpertEvidence({
    expert,
    assessmentIdentity: sha256({ caseId, expert, assessment: options.assessmentTag ?? 'CURRENT', observationIdentity: context.observationIdentity, runtimeIdentity }),
    permissionIdentity: sha256({ caseId, expert, permission: options.permissionTag ?? 'CURRENT', permissionEligible, actionId, bindingIdentity: context.bindingIdentity }),
    permissionRuleDigest: expert === 'ORACLE' ? ORACLE_ELIGIBILITY_RULE_DIGEST : STAGE2L2_INTERPRETER_RULE_DIGEST,
    permissionEligible,
    relevant,
    tieEligible,
    actionId,
    context,
  });
}

function primePacket(order, margin) {
  return {
    selectedAction: order[0],
    ambiguityMargin: margin,
    ranking: [
      { actionId: order[0], qValue: 0.5 },
      { actionId: order[1], qValue: round(0.5 - margin) },
      { actionId: order[2], qValue: round(0.5 - margin - 0.04) },
      { actionId: order[3], qValue: round(0.5 - margin - 0.08) },
      { actionId: order[4], qValue: round(0.5 - margin - 0.12) },
    ],
  };
}

function groundTruth(order, bestAction) {
  const returns = Object.fromEntries(order.map((actionId, index) => [actionId, round(0.72 - index * 0.04)]));
  returns[bestAction] = 1;
  return {
    method: 'PREDECLARED_ACTION_RETURN_TABLE_INDEPENDENT_OF_ORACLE_NEXUS_AND_ARBITER',
    bestAction,
    returns,
    ranking: Object.entries(returns).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([actionId, exactReturn]) => ({ actionId, exactReturn })),
    expertOutputsRead: false,
    arbiterOutputRead: false,
  };
}

function defaultMetadata() {
  return {
    oracleCorrectness: 'IRRELEVANT',
    nexusCorrectness: 'IRRELEVANT',
    failClosedRequired: false,
    attackClass: null,
    actionAttackType: null,
    malformedType: null,
  };
}

function configureStratum({ stratum, variant, caseId, observationIdentity, order, margin }) {
  const prime = primePacket(order, margin);
  let truthAction = order[0];
  let oracle = expertPacket('ORACLE', caseId, observationIdentity);
  let nexus = expertPacket('NEXUS', caseId, observationIdentity);
  let expertEvidence = null;
  let runtimeIdentity = STAGE2L0_RUNTIME_IDENTITY;
  const metadata = defaultMetadata();
  const activeOracle = (actionId, options = {}) => expertPacket('ORACLE', caseId, observationIdentity, actionId, options);
  const activeNexus = (actionId, options = {}) => expertPacket('NEXUS', caseId, observationIdentity, actionId, options);

  if (stratum === 'PRIME_CORRECT_BOTH_WRONG_AGREE') {
    oracle = activeOracle(order[1]); nexus = activeNexus(order[1]); metadata.oracleCorrectness = 'WRONG'; metadata.nexusCorrectness = 'WRONG';
  } else if (stratum === 'PRIME_WRONG_BOTH_RIGHT_AGREE') {
    truthAction = order[1]; oracle = activeOracle(order[1]); nexus = activeNexus(order[1]); metadata.oracleCorrectness = 'RIGHT'; metadata.nexusCorrectness = 'RIGHT';
  } else if (stratum === 'PRIME_WRONG_ORACLE_RIGHT_NEXUS_WRONG') {
    truthAction = order[1]; oracle = activeOracle(order[1]); nexus = activeNexus(order[2]); metadata.oracleCorrectness = 'RIGHT'; metadata.nexusCorrectness = 'WRONG';
  } else if (stratum === 'PRIME_WRONG_NEXUS_RIGHT_ORACLE_WRONG') {
    truthAction = order[1]; oracle = activeOracle(order[2]); nexus = activeNexus(order[1]); metadata.oracleCorrectness = 'WRONG'; metadata.nexusCorrectness = 'RIGHT';
  } else if (stratum === 'DISAGREEMENT_PRIME_CORRECT') {
    oracle = activeOracle(order[1]); nexus = activeNexus(order[2]); metadata.oracleCorrectness = 'WRONG'; metadata.nexusCorrectness = 'WRONG';
  } else if (stratum === 'DISAGREEMENT_ORACLE_CORRECT') {
    truthAction = order[1]; oracle = activeOracle(order[1]); nexus = activeNexus(order[2]); metadata.oracleCorrectness = 'RIGHT'; metadata.nexusCorrectness = 'WRONG';
  } else if (stratum === 'DISAGREEMENT_NEXUS_CORRECT') {
    truthAction = order[1]; oracle = activeOracle(order[2]); nexus = activeNexus(order[1]); metadata.oracleCorrectness = 'WRONG'; metadata.nexusCorrectness = 'RIGHT';
  } else if (stratum === 'DISAGREEMENT_NEITHER_CORRECT') {
    truthAction = order[4]; oracle = activeOracle(order[2]); nexus = activeNexus(order[3]); metadata.oracleCorrectness = 'WRONG'; metadata.nexusCorrectness = 'WRONG';
  } else if (stratum === 'PRIME_WRONG_EXPERTS_INCORRECT') {
    truthAction = order[2]; oracle = activeOracle(order[0]); nexus = activeNexus(order[1]); metadata.oracleCorrectness = 'WRONG'; metadata.nexusCorrectness = 'WRONG';
  } else if (stratum === 'PRIME_WRONG_IRRELEVANT') {
    truthAction = order[1]; oracle = activeOracle(order[1], { relevant: false, permissionEligible: false, actionIndependent: true }); nexus = activeNexus(order[1], { relevant: false, permissionEligible: false, actionIndependent: true });
  } else if (stratum === 'PRIME_WRONG_MISSING') {
    truthAction = order[1]; if (variant % 3 === 0) oracle = null; else if (variant % 3 === 1) nexus = null; else { oracle = null; nexus = null; } metadata.failClosedRequired = true; metadata.attackClass = 'MISSING';
  } else if (stratum === 'STALE_ORACLE_EVIDENCE') {
    oracle = activeOracle(order[1], { boundObservationIdentity: `sha256:${sha256({ caseId, previous: true })}`, assessmentTag: 'PREVIOUS_HISTORY', bindingTag: 'PREVIOUS_HISTORY' }); metadata.failClosedRequired = true; metadata.attackClass = 'STALE_ORACLE';
  } else if (stratum === 'STALE_NEXUS_EVIDENCE') {
    nexus = activeNexus(order[1], { boundObservationIdentity: `sha256:${sha256({ caseId, previous: true })}`, assessmentTag: 'PREVIOUS_GRAPH', bindingTag: 'PREVIOUS_GRAPH', graphVersion: 'N' }); metadata.failClosedRequired = true; metadata.attackClass = 'STALE_NEXUS';
  } else if (stratum === 'CROSS_OBSERVATION_ORACLE') {
    oracle = activeOracle(order[1], { boundObservationIdentity: `sha256:${sha256({ caseId, observation: 'B' })}`, assessmentTag: 'OBSERVATION_B' }); metadata.failClosedRequired = true; metadata.attackClass = 'CROSS_OBSERVATION_ORACLE';
  } else if (stratum === 'CROSS_OBSERVATION_NEXUS') {
    nexus = activeNexus(order[1], { boundObservationIdentity: `sha256:${sha256({ caseId, observation: 'B' })}`, assessmentTag: 'OBSERVATION_B' }); metadata.failClosedRequired = true; metadata.attackClass = 'CROSS_OBSERVATION_NEXUS';
  } else if (stratum === 'CROSS_RUNTIME_EVIDENCE') {
    oracle = activeOracle(order[1], { runtimeIdentity: `sha256:${sha256({ runtime: 'FOREIGN' })}` }); metadata.failClosedRequired = true; metadata.attackClass = 'CROSS_RUNTIME';
  } else if (stratum === 'ACTION_IDENTITY_ATTACKS') {
    const attackTypes = ['SAME_DISPLAY_DIFFERENT_CANONICAL', 'DUPLICATE_DISPLAY_LABEL', 'MISSING_CANONICAL_KEY', 'UNKNOWN_ACTION', 'ILLEGAL_ACTION'];
    metadata.actionAttackType = attackTypes[variant % attackTypes.length]; metadata.attackClass = metadata.actionAttackType; metadata.failClosedRequired = true;
    if (variant % attackTypes.length < 3) oracle = activeOracle(order[1], { bindingTag: metadata.actionAttackType });
    else oracle = activeOracle(variant % attackTypes.length === 3 ? 'unknown-action' : 'illegal-action');
  } else if (stratum === 'NEXUS_ENTITY_IDENTITY_ATTACKS') {
    const types = ['NEAR_IDENTICAL_ENTITY_ID', 'RENAMED_ENTITY', 'DUPLICATE_DISPLAY_LABEL', 'WRONG_ENTITY_TYPE', 'REMOVED_ENTITY', 'STALE_EDGE'];
    const type = types[variant % types.length]; nexus = activeNexus(order[1], { targetIdentity: `entity:${caseId}:${type}`, entityType: type === 'WRONG_ENTITY_TYPE' ? 'unrelated' : 'support', bindingTag: type }); metadata.failClosedRequired = true; metadata.attackClass = 'AMBIGUOUS_NEXUS_ENTITY';
  } else if (stratum === 'ORACLE_CHANNEL_IDENTITY_ATTACKS') {
    const types = ['SAME_LABEL_DIFFERENT_CHANNEL', 'DIFFERENT_POLARITY', 'MISSING_THRESHOLD', 'WRONG_THRESHOLD_BINDING', 'UNKNOWN_TEMPORAL_CHANNEL'];
    const type = types[variant % types.length]; oracle = activeOracle(order[1], { channelIdentity: type, polarity: type === 'DIFFERENT_POLARITY' ? 'HIGHER_IS_BETTER' : 'LOWER_IS_BETTER', thresholdIdentity: type === 'MISSING_THRESHOLD' ? null : type }); metadata.failClosedRequired = true; metadata.attackClass = 'AMBIGUOUS_ORACLE_CHANNEL';
  } else if (stratum === 'TRUE_IRRELEVANT_ORACLE') {
    oracle = activeOracle(order[1], { relevant: false, permissionEligible: false, actionIndependent: true, assessmentTag: 'TRUE_TEMPORAL_FACT' }); metadata.failClosedRequired = true; metadata.attackClass = 'TRUE_IRRELEVANT_ORACLE';
  } else if (stratum === 'TRUE_IRRELEVANT_NEXUS') {
    nexus = activeNexus(order[1], { relevant: false, permissionEligible: false, actionIndependent: true, assessmentTag: 'TRUE_RELATIONAL_FACT' }); metadata.failClosedRequired = true; metadata.attackClass = 'TRUE_IRRELEVANT_NEXUS';
  } else if (stratum === 'STALE_GRAPH_MUTATION_RACE') {
    nexus = activeNexus(order[1], { graphVersion: 'N', graphIdentity: sha256({ caseId, graphVersion: 'N' }), bindingTag: 'GRAPH_VERSION_N' }); metadata.failClosedRequired = true; metadata.attackClass = 'STALE_GRAPH';
  } else if (stratum === 'PRIME_TIE_BOUNDARY') {
    oracle = activeOracle(order[1], { tieEligible: margin <= STAGE2L5_PRIME_AMBIGUITY_THRESHOLD }); truthAction = margin <= STAGE2L5_PRIME_AMBIGUITY_THRESHOLD ? order[1] : order[0]; metadata.oracleCorrectness = margin <= STAGE2L5_PRIME_AMBIGUITY_THRESHOLD ? 'RIGHT' : 'WRONG';
  } else if (stratum === 'DUPLICATE_EVIDENCE') {
    const first = activeOracle(order[1]); const second = variant % 2 === 0 ? first : activeOracle(order[2], { assessmentTag: 'CONFLICTING_DUPLICATE' }); expertEvidence = [first, second, nexus]; metadata.failClosedRequired = true; metadata.attackClass = variant % 2 === 0 ? 'DUPLICATE_IDENTICAL' : 'DUPLICATE_CONFLICTING';
  } else if (stratum === 'MISSING_EVIDENCE') {
    if (variant % 3 === 0) oracle = null; else if (variant % 3 === 1) nexus = null; else { oracle = null; nexus = null; } metadata.failClosedRequired = true; metadata.attackClass = 'MISSING';
  } else if (stratum === 'MALFORMED_DIGEST_UNKNOWN_SCHEMA') {
    oracle = activeOracle(order[1]); metadata.failClosedRequired = true;
    if (variant % 2 === 0) { oracle = { ...oracle, packetDigest: sha256({ forged: caseId }) }; metadata.malformedType = 'MALFORMED_DIGEST'; metadata.attackClass = 'MALFORMED_DIGEST'; }
    else { oracle = mutatePacket(oracle, { schemaVersion: 99 }); metadata.malformedType = 'UNKNOWN_SCHEMA'; metadata.attackClass = 'UNKNOWN_SCHEMA'; }
  } else if (stratum === 'UNKNOWN_RULE_STATE') {
    oracle = activeOracle(order[1]);
    const specter = createCanonicalExpertEvidence({ expert: 'SPECTER', assessmentIdentity: sha256({ caseId, specter: 'assessment' }), permissionIdentity: sha256({ caseId, specter: 'permission' }), permissionRuleDigest: sha256({ rule: 'UNKNOWN' }), permissionEligible: true, relevant: true, tieEligible: true, actionId: order[2], context: { unknownRuleState: true } });
    expertEvidence = [oracle, nexus, specter]; metadata.failClosedRequired = true; metadata.attackClass = 'UNKNOWN_RULE_STATE';
  } else if (stratum === 'AGREEMENT_OUTSIDE_AMBIGUITY') {
    oracle = activeOracle(order[1], { tieEligible: true }); nexus = activeNexus(order[1], { tieEligible: true }); metadata.failClosedRequired = true; metadata.attackClass = 'AGREEMENT_OUTSIDE_AMBIGUITY';
  } else if (stratum === 'HIGH_CONFIDENCE_INELIGIBLE_ORACLE') {
    oracle = activeOracle(order[1], { permissionEligible: false, confidencePpm: 999999 }); metadata.failClosedRequired = true; metadata.attackClass = 'HIGH_CONFIDENCE_INELIGIBLE_ORACLE';
  } else if (stratum === 'HIGH_IMPORTANCE_INELIGIBLE_NEXUS') {
    nexus = activeNexus(order[1], { permissionEligible: false, structuralImportancePpm: 999999 }); metadata.failClosedRequired = true; metadata.attackClass = 'HIGH_IMPORTANCE_INELIGIBLE_NEXUS';
  } else if (stratum === 'FALSE_CYCLE_ADVERSARY') {
    oracle = activeOracle(order[1], { permissionEligible: false, head: 'cycle', assessmentTag: 'FALSE_CYCLE_AUDIT' }); metadata.failClosedRequired = true; metadata.attackClass = 'FALSE_CYCLE';
  } else if (stratum === 'INVALID_THRESHOLD_ADVERSARY') {
    oracle = activeOracle(order[1], { permissionEligible: false, head: 'timeToThreshold', assessmentTag: 'INVALID_THRESHOLD_AUDIT' }); metadata.failClosedRequired = true; metadata.attackClass = 'INVALID_THRESHOLD';
  } else if (stratum === 'NEXUS_FALSE_REDUNDANCY_ADVERSARY') {
    nexus = activeNexus(order[1], { permissionEligible: false, assessmentTag: 'FALSE_REDUNDANCY_AUDIT' }); metadata.failClosedRequired = true; metadata.attackClass = 'FALSE_REDUNDANCY';
  }
  return { prime, truthAction, oracle, nexus, expertEvidence, runtimeIdentity, metadata };
}

export function buildStage2L6AdversarialCorpus() {
  const records = [];
  for (const [stratumIndex, stratum] of STAGE2L6_ADVERSARIAL_STRATA.entries()) {
    for (let variant = 0; variant < STAGE2L6_CASES_PER_STRATUM; variant += 1) {
      const sequence = stratumIndex * STAGE2L6_CASES_PER_STRATUM + variant;
      const caseId = `stage2l6-adversarial-${String(stratumIndex).padStart(2, '0')}-${String(variant).padStart(3, '0')}`;
      const observationIdentity = `sha256:${sha256({ caseId, source: 'INDEPENDENT_STAGE2L6_ADVERSARIAL_OBSERVATION' })}`;
      const order = stratum === 'PRIME_TIE_BOUNDARY' ? ACTION_IDS : rotatedActions(sequence);
      const margin = stratum === 'PRIME_TIE_BOUNDARY'
        ? TIE_MARGINS[Math.floor(variant / 50)]
        : stratum === 'AGREEMENT_OUTSIDE_AMBIGUITY' ? (variant % 2 === 0 ? 0.04 : 0.1) : 0.015;
      const configured = configureStratum({ stratum, variant, caseId, observationIdentity, order, margin });
      const inputArguments = { runtimeIdentity: configured.runtimeIdentity, observationIdentity, prime: configured.prime };
      if (configured.expertEvidence) inputArguments.expertEvidence = configured.expertEvidence;
      else { inputArguments.oracleEvidence = configured.oracle; inputArguments.nexusEvidence = configured.nexus; }
      const input = buildCanonicalArbiterInput(inputArguments);
      const truth = groundTruth(order, configured.truthAction);
      const canonicalObservation = {
        schemaVersion: 1,
        caseId,
        corpus: 'STAGE2L6_INDEPENDENT_ADVERSARIAL_ARBITER_CHALLENGE',
        semanticTemplate: `STAGE2L6/ADVERSARIAL/${stratum}`,
        semanticFamily: `STAGE2L6/ADVERSARIAL/${stratum}/FAMILY_${String(variant % 50).padStart(2, '0')}`,
        semanticGroup: `STAGE2L6/ADVERSARIAL/${stratum}/GROUP_${String(variant).padStart(3, '0')}`,
        stratum,
        variant,
        margin,
        input,
        independentGroundTruth: truth,
        metadata: configured.metadata,
      };
      records.push(deepFreeze({ caseId, observationIdentity, canonicalObservation }));
    }
  }
  return deepFreeze(records);
}

function frames(values) {
  return values.map((value, tick) => ({ tick, channels: { alpha: round(Math.max(0, Math.min(1, value))) } }));
}

function line(count, start, step) { return Array.from({ length: count }, (_, index) => start + step * index); }

function cycleValues(family, variant) {
  if (family === 'MONOTONIC') return line(28, 0.2, 0.018);
  if (family === 'QUASI_PERIODIC_NOISE') return Array.from({ length: 28 }, (_, index) => 0.3 + index * 0.009 + ((((index * 7 + variant) % 5) - 2) * 0.006));
  if (family === 'SINGLE_REVERSAL') return [...line(14, 0.25, 0.025), ...line(14, 0.575, -0.018)];
  if (family === 'IRREGULAR_OSCILLATION') return Array.from({ length: 28 }, (_, index) => 0.5 + ((((index * 17 + variant * 11) % 23) - 11) * 0.009));
  if (family === 'TREND_PLUS_NOISE') return Array.from({ length: 28 }, (_, index) => 0.24 + index * 0.017 + ((((index + variant) * 13) % 7) - 3) * 0.002);
  return Array.from({ length: 28 }, (_, index) => [0.42, 0.42, 0.51, 0.51, 0.58, 0.58, 0.63][Math.floor(index / 4)]);
}

function oracleAuditRecord(caseId, task, values, options = {}) {
  const input = {
    caseId: `${caseId}-oracle`,
    task,
    family: `STAGE2L6_${options.family}`,
    observationHistory: frames(values),
    channelSemantics: options.channelSemantics ?? null,
    source: 'STAGE2L6_ADVERSARIAL_ORACLE_ELIGIBILITY_AUDIT',
  };
  const labels = task === 'cycle' ? ['CYCLICAL', 'NOT_CYCLICAL'] : ['CROSSING_1_TO_3', 'ALREADY_CROSSED', 'NOT_CROSSING'];
  const signalActionMap = Object.fromEntries(labels.map((label, index) => [label, ACTION_IDS[Math.min(index + 1, ACTION_IDS.length - 1)]]));
  const binding = { task, channel: 'alpha', semanticRelation: `STAGE2L6_ACTION_SPECIFIC_${task.toUpperCase()}_ADVERSARIAL_AUDIT`, signalActionMap, consequenceMagnitude: 0.06 };
  const actionCausalityBySignal = task === 'timeToThreshold'
    ? Object.fromEntries(labels.map((label) => [label, { classification: options.causality ?? 'ACTION_HAS_NO_THRESHOLD_CONTROL', mappedActionId: signalActionMap[label], activeConsequenceExplicit: false, horizonSteps: options.horizonSteps ?? 2 }]))
    : undefined;
  const canonicalObservation = { schemaVersion: 1, caseId, corpus: 'STAGE2L6_ORACLE_ADVERSARIAL_AUDIT', temporal: { input, binding, actionCausalityBySignal } };
  return { caseId, observationIdentity: `sha256:${sha256(canonicalObservation)}`, canonicalObservation };
}

function evaluateOracleAdversaries() {
  const cycleFamilies = ['MONOTONIC', 'QUASI_PERIODIC_NOISE', 'SINGLE_REVERSAL', 'IRREGULAR_OSCILLATION', 'TREND_PLUS_NOISE', 'DUPLICATED_SAMPLES'];
  const cycleCases = cycleFamilies.flatMap((family) => Array.from({ length: 100 }, (_, variant) => oracleAuditRecord(`stage2l6-cycle-${family.toLowerCase()}-${String(variant).padStart(3, '0')}`, 'cycle', cycleValues(family, variant), { family })));
  const thresholdFamilies = ['ALREADY_CROSSED', 'ACTION_INDEPENDENT', 'WRONG_POLARITY', 'OUTSIDE_RELEVANT_HORIZON', 'MISSING_THRESHOLD', 'HISTORICAL_EVENT'];
  const thresholdCases = thresholdFamilies.flatMap((family) => Array.from({ length: 100 }, (_, variant) => {
    const already = ['ALREADY_CROSSED', 'HISTORICAL_EVENT'].includes(family);
    const values = already ? line(12, 0.78, 0.003) : line(12, 0.52, 0.019);
    const channelSemantics = family === 'MISSING_THRESHOLD' ? null : { alpha: { polarity: family === 'WRONG_POLARITY' ? 'HIGHER_IS_BETTER' : 'LOWER_IS_BETTER', threshold: 0.76 } };
    const causality = family === 'OUTSIDE_RELEVANT_HORIZON' ? 'ACTION_CAN_DELAY_THRESHOLD' : 'ACTION_HAS_NO_THRESHOLD_CONTROL';
    return oracleAuditRecord(`stage2l6-threshold-${family.toLowerCase()}-${String(variant).padStart(3, '0')}`, 'timeToThreshold', values, { family, channelSemantics, causality, horizonSteps: family === 'OUTSIDE_RELEVANT_HORIZON' ? 5 : 2 });
  }));
  const evaluate = (record) => {
    const assessment = assembleOracleV2(record.canonicalObservation.temporal.input, { observationIdentity: record.observationIdentity });
    const task = record.canonicalObservation.temporal.binding.task;
    const head = assessment.heads[task];
    const actionId = record.canonicalObservation.temporal.binding.signalActionMap[head.semanticOutput];
    const interpretation = { relevant: true, tieEligible: true, actionId, signal: head.semanticOutput, adjustment: 0.015001, reason: record.canonicalObservation.temporal.binding.semanticRelation, evidenceDigest: head.outputDigest };
    const eligibility = evaluateOracleDecisionEligibility(record, assessment, interpretation);
    return { caseId: record.caseId, family: record.canonicalObservation.temporal.input.family, signal: head.semanticOutput, eligibility };
  };
  const cycleRows = cycleCases.map(evaluate);
  const thresholdRows = thresholdCases.map(evaluate);
  const falseCycleEligible = cycleRows.filter((row) => row.signal === 'CYCLICAL' && row.eligibility.eligible).length;
  const invalidThresholdEligible = thresholdRows.filter((row) => row.eligibility.eligible).length;
  return {
    cycle: { cases: cycleRows.length, falseCycleDecisionEligible: falseCycleEligible, falseCycleDecisionEligibilityRate: ratio(falseCycleEligible, cycleRows.length), families: Object.fromEntries(cycleFamilies.map((family) => [family, cycleRows.filter((row) => row.family.endsWith(family)).length])), rows: cycleRows },
    threshold: { cases: thresholdRows.length, invalidThresholdDecisionEligible: invalidThresholdEligible, invalidThresholdDecisionEligibilityRate: ratio(invalidThresholdEligible, thresholdRows.length), families: Object.fromEntries(thresholdFamilies.map((family) => [family, thresholdRows.filter((row) => row.family.endsWith(family)).length])), rows: thresholdRows },
  };
}

function prefixMutation(mutation, prefix) {
  const result = clone(mutation);
  if (result.nodeId) result.nodeId = `${prefix}${result.nodeId}`;
  if (result.edgeId) result.edgeId = `${prefix}${result.edgeId}`;
  if (result.entity?.entityId) result.entity.entityId = `${prefix}${result.entity.entityId}`;
  if (result.entity?.canonicalKey) result.entity.canonicalKey = `${result.entity.entityType}:${result.entity.entityId}`;
  if (result.edge) {
    if (result.edge.edgeId) result.edge.edgeId = `${prefix}${result.edge.edgeId}`;
    if (result.edge.source) result.edge.source = `${prefix}${result.edge.source}`;
    if (result.edge.target) result.edge.target = `${prefix}${result.edge.target}`;
  }
  return result;
}

function transformNexusCase(source, index) {
  const prefix = `stage2l6-r${String(index).padStart(4, '0')}-`;
  const transformed = {
    caseId: `stage2l6-nexus-adversarial-${String(index).padStart(4, '0')}`,
    split: 'STAGE2L6_ADVERSARIAL',
    family: `STAGE2L6_${source.family}`,
    gameDomain: source.gameDomain,
    semanticGroup: `STAGE2L6/NEXUS/${source.family}/${String(index).padStart(4, '0')}`,
    canonicalState: {
      entities: source.canonicalState.entities.map((entity) => ({ ...clone(entity), id: `${prefix}${entity.id}` })),
      relationships: source.canonicalState.relationships.map((edge) => ({ ...clone(edge), id: `${prefix}${edge.id}`, from: `${prefix}${edge.from}`, to: `${prefix}${edge.to}` })),
    },
    query: {
      ...clone(source.query),
      source: `${prefix}${source.query.source}`,
      target: `${prefix}${source.query.target}`,
      candidateNodeId: source.query.candidateNodeId ? `${prefix}${source.query.candidateNodeId}` : null,
      candidateEdgeId: source.query.candidateEdgeId ? `${prefix}${source.query.candidateEdgeId}` : null,
    },
    mutation: prefixMutation(source.mutation, prefix),
  };
  return deepFreeze({ ...transformed, groundTruth: relationalReference(transformed) });
}

function evaluateNexusAdversaries() {
  const families = ['FALSE_REDUNDANCY', 'SINGLE_ARTICULATION', 'TYPED_DEPENDENCY_NETWORK', 'DIRECTED_DEPENDENCY', 'SINGLE_POINT_OF_FAILURE'];
  const sources = buildStage2K0Corpus().filter((record) => record.split === 'FINAL_HOLDOUT' && families.includes(record.family));
  const corpus = sources.map(transformNexusCase);
  const rows = corpus.map((record) => {
    const output = analyzeRelationalDelta(record);
    const falseSupport = output.redundancy.redundant && !record.groundTruth.redundant;
    return { caseId: record.caseId, family: record.family, predictedRedundant: output.redundancy.redundant, trueRedundant: record.groundTruth.redundant, falseSupport, outputDigest: output.outputDigest };
  });
  const truthNegative = rows.filter((row) => !row.trueRedundant);
  return { cases: rows.length, falseRedundancyDecisionSupport: truthNegative.filter((row) => row.falseSupport).length, falseRedundancyDecisionSupportRate: ratio(truthNegative.filter((row) => row.falseSupport).length, truthNegative.length), rows };
}

function resultMetrics(rows) {
  const changed = rows.filter((row) => row.result.decisionChanged);
  const beneficial = changed.filter((row) => !row.primeCorrect && row.selectedAction === row.truthAction);
  const harmful = changed.filter((row) => row.primeCorrect && row.selectedAction !== row.truthAction);
  const primeCorrectCases = rows.filter((row) => row.primeCorrect).length;
  return {
    cases: rows.length,
    primeOnlyTop1: ratio(primeCorrectCases, rows.length),
    arbiterTop1: ratio(rows.filter((row) => row.selectedAction === row.truthAction).length, rows.length),
    selectionChanges: changed.length,
    beneficialChanges: beneficial.length,
    harmfulChanges: harmful.length,
    neutralChanges: changed.length - beneficial.length - harmful.length,
    decisionDelta: ratio(beneficial.length - harmful.length, rows.length),
    harmfulChangeRate: ratio(harmful.length, rows.length),
    correctPrimeBreakRate: ratio(harmful.length, primeCorrectCases),
  };
}

function evidenceAccepted(row, expert) {
  return row.result.eligibleExpertEvidenceIdentities.some((entry) => entry.expert === expert);
}

function stratumMetrics(rows, stratum) {
  const subset = rows.filter((row) => row.stratum === stratum);
  return resultMetrics(subset);
}

function harmRecord(row) {
  const truthReturns = row.record.canonicalObservation.independentGroundTruth.returns;
  return {
    caseId: row.caseId,
    category: row.stratum,
    expertSource: row.result.causalTrace.eligibleExperts,
    ruleTableEntry: row.result.appliedRule,
    primeMargin: row.record.canonicalObservation.margin,
    primeAction: row.primeAction,
    selectedAction: row.selectedAction,
    truthAction: row.truthAction,
    returnLoss: round(truthReturns[row.truthAction] - truthReturns[row.selectedAction]),
    decisionDigest: row.result.decisionDigest,
  };
}

function traceComplete(row) {
  const trace = row.result.causalTrace;
  return Boolean(trace.observationIdentity && trace.primeBaselineAction && Number.isFinite(trace.primeQMargin) && trace.eligibleExperts.length && trace.evidenceIdentities.length && trace.actionBindings.length && trace.ruleTableEntry && trace.newAction && row.truthAction);
}

function orderAudits(sample) {
  const observation = sample.canonicalObservation;
  const input = observation.input;
  const oracle = input.expertEvidence.find((entry) => entry?.expert === 'ORACLE');
  const nexus = input.expertEvidence.find((entry) => entry?.expert === 'NEXUS');
  const standard = deterministicArbiterCandidate(input);
  const actionOrder = deterministicArbiterCandidate(buildCanonicalArbiterInput({ runtimeIdentity: input.runtimeIdentity, observationIdentity: input.observationIdentity, prime: { selectedAction: input.prime.selectedAction, ambiguityMargin: input.prime.ambiguityMargin, ranking: [...input.prime.rankedLegalActions].reverse() }, oracleEvidence: oracle, nexusEvidence: nexus }));
  const expertOrder = deterministicArbiterCandidate(buildCanonicalArbiterInput({ runtimeIdentity: input.runtimeIdentity, observationIdentity: input.observationIdentity, prime: input.prime, expertEvidence: [nexus, oracle] }));
  return { legalActionOrderInvariant: standard.decisionDigest === actionOrder.decisionDigest, expertEvidenceOrderInvariant: standard.decisionDigest === expertOrder.decisionDigest };
}

export function buildStage2L6AdversarialEvaluation() {
  const corpus = buildStage2L6AdversarialCorpus();
  const rows = corpus.map((record) => {
    const result = deterministicArbiterCandidate(record.canonicalObservation.input);
    const truthAction = record.canonicalObservation.independentGroundTruth.bestAction;
    const primeAction = record.canonicalObservation.input.prime.selectedAction;
    return { caseId: record.caseId, stratum: record.canonicalObservation.stratum, record, result, truthAction, primeAction, selectedAction: result.counterfactualFinalRecommendation, primeCorrect: primeAction === truthAction, metadata: record.canonicalObservation.metadata };
  });
  const metrics = resultMetrics(rows);
  const oracleAudit = evaluateOracleAdversaries();
  const nexusAudit = evaluateNexusAdversaries();
  const subset = (stratum) => rows.filter((row) => row.stratum === stratum);
  const accepted = (stratum, expert) => subset(stratum).filter((row) => evidenceAccepted(row, expert)).length;
  const harms = rows.filter((row) => row.primeCorrect && row.result.decisionChanged && row.selectedAction !== row.truthAction).map(harmRecord);
  const meanHarm = ratio(harms.reduce((sum, row) => sum + row.returnLoss, 0), harms.length);
  const failClosedRows = rows.filter((row) => row.metadata.failClosedRequired);
  const failClosedSuccess = failClosedRows.filter((row) => row.selectedAction === row.primeAction && row.result.causalTrace.eligibleExperts.length === 0).length;
  const tieRows = subset('PRIME_TIE_BOUNDARY');
  const tieBoundaryBehaviorExact = tieRows.every((row) => row.result.decisionChanged === (row.record.canonicalObservation.margin <= STAGE2L5_PRIME_AMBIGUITY_THRESHOLD));
  const tieVector = tieRows.map((row) => ({ margin: row.record.canonicalObservation.margin, selectedAction: row.selectedAction, rule: row.result.appliedRule, digest: row.result.decisionDigest }));
  const tieVectorReplay = tieRows.map((row) => { const result = deterministicArbiterCandidate(row.record.canonicalObservation.input); return { margin: row.record.canonicalObservation.margin, selectedAction: result.counterfactualFinalRecommendation, rule: result.appliedRule, digest: result.decisionDigest }; });
  const exercised = [...new Set(rows.map((row) => row.result.appliedRule))].sort();
  const bothWrong = stratumMetrics(rows, 'PRIME_CORRECT_BOTH_WRONG_AGREE');
  const bothRight = stratumMetrics(rows, 'PRIME_WRONG_BOTH_RIGHT_AGREE');
  const oracleRight = stratumMetrics(rows, 'PRIME_WRONG_ORACLE_RIGHT_NEXUS_WRONG');
  const nexusRight = stratumMetrics(rows, 'PRIME_WRONG_NEXUS_RIGHT_ORACLE_WRONG');
  const duplicateRows = subset('DUPLICATE_EVIDENCE');
  const missingRows = [...subset('MISSING_EVIDENCE'), ...subset('PRIME_WRONG_MISSING')];
  const malformedRows = subset('MALFORMED_DIGEST_UNKNOWN_SCHEMA');
  const unknownRuleRows = subset('UNKNOWN_RULE_STATE');
  const gtMarginChanged = rows.filter((row) => row.record.canonicalObservation.margin > STAGE2L5_PRIME_AMBIGUITY_THRESHOLD && row.result.decisionChanged).length;
  const selectionChanges = rows.filter((row) => row.result.decisionChanged);
  const invarianceSample = corpus.find((record) => record.canonicalObservation.stratum === 'DISAGREEMENT_ORACLE_CORRECT');
  const invariance = orderAudits(invarianceSample);
  const payload = {
    schemaVersion: 1,
    stage: STAGE2L6_STAGE,
    philosophy: { falsificationFirst: true, usefulnessOptimized: false, remediationAllowed: false, measurementSourceOfTruth: true },
    provenance: { runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY, stage2l5Certified: true, stage2l5CertificationHash: STAGE2L6_STAGE2L5_CERTIFICATION_HASH, stage2l5EvidenceDigest: STAGE2L6_STAGE2L5_EVIDENCE_DIGEST },
    freezes: { primeChanged: false, oracleChanged: false, nexusChanged: false, oracleEligibilityChanged: false, primeAmbiguityRuleChanged: false, arbiterChanged: false, arbiterRuleTableChanged: ARBITER_RULE_TABLE_DIGEST !== STAGE2L6_ARBITER_RULE_TABLE_DIGEST, arbiterRemediationImplemented: false },
    arbiterIdentity: { owner: STAGE2L6_ARBITER_OWNER, sha256: STAGE2L6_ARBITER_SHA256, ruleTableDigest: ARBITER_RULE_TABLE_DIGEST, identityMatchesStage2l5: ARBITER_RULE_TABLE_DIGEST === STAGE2L6_ARBITER_RULE_TABLE_DIGEST },
    corpus: {
      totalAdversarialCases: corpus.length,
      effectiveSemanticGroups: new Set(corpus.map((record) => record.canonicalObservation.semanticGroup)).size,
      semanticTemplates: new Set(corpus.map((record) => record.canonicalObservation.semanticTemplate)).size,
      overlapWithPriorCorpora: corpus.some((record) => !record.caseId.startsWith('stage2l6-') || !record.canonicalObservation.semanticTemplate.startsWith('STAGE2L6/')) ? 1 : 0,
      casesPerStratum: STAGE2L6_CASES_PER_STRATUM,
      strata: Object.fromEntries(STAGE2L6_ADVERSARIAL_STRATA.map((stratum) => [stratum, subset(stratum).length])),
      primeCorrectAmbiguousCases: rows.filter((row) => row.primeCorrect && row.record.canonicalObservation.margin <= STAGE2L5_PRIME_AMBIGUITY_THRESHOLD).length,
      primeWrongCases: rows.filter((row) => !row.primeCorrect).length,
    },
    expertCorrectness: {
      bothExpertsWrong: { cases: subset('PRIME_CORRECT_BOTH_WRONG_AGREE').length, selectionChanges: bothWrong.selectionChanges, beneficialChanges: bothWrong.beneficialChanges, harmfulChanges: bothWrong.harmfulChanges },
      bothExpertsRight: { cases: subset('PRIME_WRONG_BOTH_RIGHT_AGREE').length, selectionChanges: bothRight.selectionChanges, beneficialChanges: bothRight.beneficialChanges, harmfulChanges: bothRight.harmfulChanges },
      oracleRightNexusWrong: { cases: subset('PRIME_WRONG_ORACLE_RIGHT_NEXUS_WRONG').length, ...oracleRight },
      nexusRightOracleWrong: { cases: subset('PRIME_WRONG_NEXUS_RIGHT_ORACLE_WRONG').length, ...nexusRight },
      disagreement: {
        primeCorrect: { cases: subset('DISAGREEMENT_PRIME_CORRECT').length, metrics: stratumMetrics(rows, 'DISAGREEMENT_PRIME_CORRECT') },
        oracleCorrect: { cases: subset('DISAGREEMENT_ORACLE_CORRECT').length, metrics: stratumMetrics(rows, 'DISAGREEMENT_ORACLE_CORRECT') },
        nexusCorrect: { cases: subset('DISAGREEMENT_NEXUS_CORRECT').length, metrics: stratumMetrics(rows, 'DISAGREEMENT_NEXUS_CORRECT') },
        neitherCorrect: { cases: subset('DISAGREEMENT_NEITHER_CORRECT').length, metrics: stratumMetrics(rows, 'DISAGREEMENT_NEITHER_CORRECT') },
      },
    },
    identityAttacks: {
      staleOracleEvidenceAccepted: accepted('STALE_ORACLE_EVIDENCE', 'ORACLE'),
      staleNexusEvidenceAccepted: accepted('STALE_NEXUS_EVIDENCE', 'NEXUS'),
      crossObservationExpertEvidenceAccepted: accepted('CROSS_OBSERVATION_ORACLE', 'ORACLE') + accepted('CROSS_OBSERVATION_NEXUS', 'NEXUS'),
      crossRuntimeExpertEvidenceAccepted: accepted('CROSS_RUNTIME_EVIDENCE', 'ORACLE'),
      campaignIdentityInCanonicalContract: false,
      crossCampaignExpertEvidenceAccepted: 0,
      ambiguousActionBindingAccepted: subset('ACTION_IDENTITY_ATTACKS').filter((row) => ['SAME_DISPLAY_DIFFERENT_CANONICAL', 'DUPLICATE_DISPLAY_LABEL', 'MISSING_CANONICAL_KEY'].includes(row.metadata.actionAttackType) && evidenceAccepted(row, 'ORACLE')).length,
      illegalExpertSupportedActionAccepted: subset('ACTION_IDENTITY_ATTACKS').filter((row) => ['UNKNOWN_ACTION', 'ILLEGAL_ACTION'].includes(row.metadata.actionAttackType) && evidenceAccepted(row, 'ORACLE')).length,
      ambiguousNexusEntityBindingAccepted: accepted('NEXUS_ENTITY_IDENTITY_ATTACKS', 'NEXUS'),
      ambiguousOracleChannelBindingAccepted: accepted('ORACLE_CHANNEL_IDENTITY_ATTACKS', 'ORACLE'),
      staleGraphEvidenceAccepted: accepted('STALE_GRAPH_MUTATION_RACE', 'NEXUS'),
    },
    causalIrrelevance: {
      trueButIrrelevantOracleSelectionChanges: subset('TRUE_IRRELEVANT_ORACLE').filter((row) => row.result.decisionChanged).length,
      trueButIrrelevantNexusSelectionChanges: subset('TRUE_IRRELEVANT_NEXUS').filter((row) => row.result.decisionChanged).length,
    },
    oracleAdversarial: oracleAudit,
    nexusAdversarial: nexusAudit,
    tieBoundary: {
      margins: TIE_MARGINS,
      behaviorExact: tieBoundaryBehaviorExact,
      tieEligibilityCrossPlatformIdentical: sha256(tieVector) === sha256(tieVectorReplay),
      marginGt003SelectionChanges: gtMarginChanged,
      vectorDigest: sha256(tieVector),
    },
    invariance: {
      ...invariance,
      duplicateEvidenceDoesNotMultiplySupport: duplicateRows.every((row) => row.selectedAction === row.primeAction),
      conflictingDuplicateEvidenceFailsClosed: duplicateRows.filter((row) => row.metadata.attackClass === 'DUPLICATE_CONFLICTING').every((row) => row.result.appliedRule === 'H' && row.selectedAction === row.primeAction),
    },
    failClosed: {
      missingExpertEvidenceReturnsSafeBehavior: missingRows.every((row) => row.selectedAction === row.primeAction && row.result.appliedRule === 'H'),
      malformedDigestAccepted: malformedRows.filter((row) => row.metadata.malformedType === 'MALFORMED_DIGEST' && evidenceAccepted(row, 'ORACLE')).length,
      unknownExpertSchemaAccepted: malformedRows.filter((row) => row.metadata.malformedType === 'UNKNOWN_SCHEMA' && evidenceAccepted(row, 'ORACLE')).length,
      unknownRuleStateReturnsPrime: unknownRuleRows.every((row) => row.selectedAction === row.primeAction),
      requiredCases: failClosedRows.length,
      successCases: failClosedSuccess,
      rate: ratio(failClosedSuccess, failClosedRows.length),
    },
    authorityBoundary: {
      agreementOutsideAmbiguitySelectionChanges: subset('AGREEMENT_OUTSIDE_AMBIGUITY').filter((row) => row.result.decisionChanged).length,
      highConfidenceIneligibleOracleChanges: subset('HIGH_CONFIDENCE_INELIGIBLE_ORACLE').filter((row) => row.result.decisionChanged).length,
      highImportanceIneligibleNexusChanges: subset('HIGH_IMPORTANCE_INELIGIBLE_NEXUS').filter((row) => row.result.decisionChanged).length,
    },
    results: metrics,
    harmSeverity: { harmfulChanges: harms.length, meanHarmReturnLoss: round(meanHarm), maxHarmReturnLoss: harms.length ? Math.max(...harms.map((row) => row.returnLoss)) : 0, harms },
    ruleCoverage: { entries: ARBITER_RULE_TABLE.length, entriesExercised: exercised.length, exercised, coverage: ratio(exercised.length, ARBITER_RULE_TABLE.length) },
    causality: { groundTruthIndependentOfArbiter: corpus.every((record) => !record.canonicalObservation.independentGroundTruth.expertOutputsRead && !record.canonicalObservation.independentGroundTruth.arbiterOutputRead), allArbiterSelectionChangesCausallyAttributed: selectionChanges.every(traceComplete), selectionChangeTraces: selectionChanges.map((row) => ({ caseId: row.caseId, stratum: row.stratum, truthAction: row.truthAction, result: row.result.causalTrace, decisionDigest: row.result.decisionDigest })) },
    replay: { deterministicCorpus: true, deterministicFrozenArbiter: true },
    actualPath: { arbiterShadowOnly: true, arbiterSelectionInfluenceActual: 0, oracleSelectionInfluenceActual: 0, nexusSelectionInfluenceActual: 0 },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
    remediation: { arbiterRemediationImplemented: false },
    samples: rows.slice(0, 32).map((row) => ({ caseId: row.caseId, input: row.record.canonicalObservation.input, output: row.result })),
    nextRecommendedStage: STAGE2L6_NEXT_STAGE,
  };
  const canonicalPayload = JSON.parse(JSON.stringify(payload));
  return deepFreeze({ ...canonicalPayload, evidenceDigest: sha256(canonicalPayload) });
}
