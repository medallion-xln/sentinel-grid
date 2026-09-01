/* Stage 2L.8 — remediated Arbiter independent red-team replication (R0, shadow only).
 *
 * VALIDATION / CHALLENGE STAGE ONLY.
 *
 * This owner imports the Stage 2L.7 remediated Arbiter, its evidence validator, its
 * rule table and its Oracle eligibility rule and does not modify any of them. It
 * builds an entirely fresh red-team corpus and attacks the frozen implementation.
 *
 * INDEPENDENCE OF THE CORPUS
 *  - Every case uses its own generated action / entity / channel vocabulary
 *    (`s2l8-<index>-*`), which shares no symbol with the fixed ACTION_IDS
 *    vocabulary used by every prior corpus. Overlap is therefore structural, not
 *    merely asserted, and is measured explicitly.
 *  - Ground truth is drawn from a dedicated seeded stream BEFORE any Prime ranking,
 *    expert evidence or Arbiter output exists, and is never a function of them.
 *
 * WHAT CAN POSSIBLY CHANGE A DECISION. The frozen rule table returns Prime for
 * every state except B/C: exactly one independently valid, eligible, causally
 * certified expert whose supported action lies inside the certified tie band. The
 * corpus exercises that path directly, and a separately reported residual-exposure
 * probe sweeps what happens when such an expert is wrong. The probe is deliberately
 * NOT folded into the headline corpus, because its size would otherwise set the
 * harmful-change rate by construction rather than by measurement.
 */

import { createSeededRandom, deriveSeed, deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2 } from './stage2i4-oracle-v2-assembly.js';
import {
  STAGE2L0_CAMPAIGN_IDENTITY,
  STAGE2L0_IMPLEMENTATION_DIGESTS,
  STAGE2L0_RUNTIME_IDENTITY,
} from './stage2l0-core-triad-shadow-integration.js';
import { runArbiterWithFailureIsolation } from './stage2l5-deterministic-arbiter-candidate.js';
import {
  STAGE2L7_ARBITER_RULE_DIGEST,
  STAGE2L7_ARBITER_RULE_TABLE,
  STAGE2L7_FAIL_CLOSED_MATRIX,
  STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
  STAGE2L7_NEXUS_INTERPRETER_RULE_IDENTITY,
  STAGE2L7_ORACLE_ELIGIBILITY_RULE_DIGEST,
  STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY,
  STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
  buildBoundArbiterInput,
  createArbiterDecisionContext,
  createBoundArbiterEvidence,
  evaluateOracleDecisionEligibilityStage2L7,
  remediatedDeterministicArbiter,
  validateArbiterEvidence,
} from './stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js';

export const STAGE2L8_STAGE = 'STAGE2L8_REMEDIATED_ARBITER_INDEPENDENT_RED_TEAM_REPLICATION';
export const STAGE2L8_STAGE2L7_CERTIFICATION_HASH = 'f1ef4a70cbc9274058a920b61a233dae0b25b5a7c4e070b171ce67a911b9f3ff';
export const STAGE2L8_STAGE2L7_EVIDENCE_DIGEST = 'a8326135c0eddfe621f1b3bc7be9e360e1cd1fc50f80c506b7a310e0a23a1212';
export const STAGE2L8_STAGE2L7_OWNER_SHA256 = '5047dc0576b8242c00a1f73729c4b0bc49fc1d181eac22bc90896d2cf5cccc00';
export const STAGE2L8_STAGE2L7_ARBITER_RULE_DIGEST = '2c3014ba4916e532861402befb955a8a5fba8e9a55a7fce5d6096a0537456822';
export const STAGE2L8_STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST = '59e0c7d6a3c4c648dd9d0beff6a9bc85c690a2c28adb1baaad4064c019269ad3';

/** Inherited bounds. Stage 2L.8 does not relax them. */
export const STAGE2L8_MAX_HARMFUL_CHANGE_RATE = 0.01;
export const STAGE2L8_MAX_CORRECT_PRIME_BREAK_RATE = 0.01;
export const STAGE2L8_MIN_CASES = 20000;
export const STAGE2L8_CASES_PER_STRATUM = 715;
export const STAGE2L8_NEXT_STAGE_ON_PASS = 'STAGE2L9_SINGLE_EXPERT_DELEGATION_PRECISION_BOUND';

const GROUND_TRUTH_SEED = 0x5347324c38n; // "SG2L8"
const TIE_EPSILON = 0.000001;

function identity(payload) { return `sha256:${sha256(payload)}`; }
function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function clamp(value) { return Math.min(1, Math.max(0, Number(value.toFixed(6)))); }
function frames(values) { return values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } })); }
function line(length, start, rate) { return Array.from({ length }, (_, index) => clamp(start + index * rate)); }
function percentile(values, proportion) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * proportion) - 1))] ?? 0;
}

/* ---------------------------------------------------------------------------
 * The 28 required adversarial strata
 * ------------------------------------------------------------------------- */

export const STAGE2L8_STRATA = deepFreeze([
  'BOTH_EXPERTS_CORRECT',            // 1
  'BOTH_EXPERTS_WRONG',              // 2
  'ORACLE_CORRECT_NEXUS_WRONG',      // 3
  'NEXUS_CORRECT_ORACLE_WRONG',      // 4
  'NEITHER_EXPERT_RELEVANT',         // 5
  'STALE_ORACLE_EVIDENCE',           // 6
  'STALE_NEXUS_EVIDENCE',            // 7
  'STALE_GRAPH_EVIDENCE',            // 8
  'CROSS_OBSERVATION_EVIDENCE',      // 9
  'CROSS_RUNTIME_EVIDENCE',          // 10
  'CROSS_CAMPAIGN_EVIDENCE',         // 11
  'AMBIGUOUS_ACTION_IDENTITY',       // 12
  'AMBIGUOUS_ORACLE_CHANNEL',        // 13
  'AMBIGUOUS_NEXUS_ENTITY',          // 14
  'ILLEGAL_EXPERT_SUPPORTED_ACTION', // 15
  'MALFORMED_EXPERT_EVIDENCE',       // 16
  'UNKNOWN_EXPERT_SCHEMA',           // 17
  'UNKNOWN_RULE_STATE',              // 18
  'DUPLICATE_EVIDENCE',              // 19
  'CONFLICTING_DUPLICATE_EVIDENCE',  // 20
  'CYCLE_FALSE_POSITIVE',            // 21
  'ALREADY_CROSSED_THRESHOLD',       // 22
  'NON_AMBIGUOUS_PRIME',             // 23
  'EXPERT_DISAGREEMENT',             // 24
  'EXPERT_AGREEMENT',                // 25
  'TIE_BOUNDARY',                    // 26
  'NEAR_TIE',                        // 27
  'MARGIN_ABOVE_THRESHOLD',          // 28
]);

/** Strata whose evidence must be rejected outright (fail closed to Prime). */
const FAIL_CLOSED_STRATA = deepFreeze([
  'STALE_ORACLE_EVIDENCE', 'STALE_NEXUS_EVIDENCE', 'STALE_GRAPH_EVIDENCE',
  'CROSS_OBSERVATION_EVIDENCE', 'CROSS_RUNTIME_EVIDENCE', 'CROSS_CAMPAIGN_EVIDENCE',
  'AMBIGUOUS_ACTION_IDENTITY', 'AMBIGUOUS_ORACLE_CHANNEL', 'AMBIGUOUS_NEXUS_ENTITY',
  'ILLEGAL_EXPERT_SUPPORTED_ACTION', 'MALFORMED_EXPERT_EVIDENCE', 'UNKNOWN_EXPERT_SCHEMA',
  'UNKNOWN_RULE_STATE', 'DUPLICATE_EVIDENCE', 'CONFLICTING_DUPLICATE_EVIDENCE',
]);

/* ---------------------------------------------------------------------------
 * Independent ground truth
 *
 * Drawn from its own seeded stream. It is a pure function of the case index and
 * never reads Prime, expert evidence, or Arbiter output.
 * ------------------------------------------------------------------------- */

export function independentGroundTruth(index) {
  const random = createSeededRandom(deriveSeed(GROUND_TRUTH_SEED, 'INDEPENDENT_GROUND_TRUTH', index));
  const actionCount = 3 + Math.floor(random() * 3); // 3..5
  const actions = Array.from({ length: actionCount }, (_, slot) => `s2l8-${index}-act${slot}`);
  const utilities = actions.map(() => round(random()));
  let best = 0;
  for (let slot = 1; slot < actionCount; slot += 1) if (utilities[slot] > utilities[best]) best = slot;
  const primeCorrect = random() < 0.5;
  const recoverable = random() < 0.7;
  return deepFreeze({
    index,
    actions,
    utilities,
    truthAction: actions[best],
    truthUtility: utilities[best],
    primeCorrect,
    truthRankWhenPrimeWrong: recoverable ? 1 : 2,
    generator: 'STAGE2L8_INDEPENDENT_GROUND_TRUTH_V1',
  });
}

/** Prime ranking placed around the ground truth, with a stratum-chosen margin. */
function primeFor(truth, margin) {
  const others = truth.actions.filter((actionId) => actionId !== truth.truthAction);
  let order;
  if (truth.primeCorrect) order = [truth.truthAction, ...others];
  else if (truth.truthRankWhenPrimeWrong === 1) order = [others[0], truth.truthAction, ...others.slice(1)];
  else order = [others[0], others[1] ?? others[0], truth.truthAction, ...others.slice(2)].filter((value, slot, all) => all.indexOf(value) === slot);
  const ranking = order.map((actionId, slot) => ({
    actionId,
    qValue: slot === 0 ? 0.5 : round(0.5 - margin - (slot - 1) * 0.09),
  }));
  return { selectedAction: order[0], ranking, order };
}

/* ---------------------------------------------------------------------------
 * Fresh per-case requirement + evidence construction
 * ------------------------------------------------------------------------- */

function requirementsFor(caseId) {
  const historyDigest = identity({ caseId, stream: 'STAGE2L8_FRESH_HISTORY' });
  const graphDigest = identity({ caseId, stream: 'STAGE2L8_FRESH_GRAPH' });
  const entity = {
    entityId: `s2l8-${caseId}-entity`,
    entityType: 'relay',
    canonicalKey: `relay/s2l8-${caseId}-entity`,
  };
  const edges = [{
    edgeId: `s2l8-${caseId}-edge`,
    sourceEntityId: entity.entityId,
    targetEntityId: `s2l8-${caseId}-sink`,
    relation: 'DIRECTED_SUPPORT',
  }];
  const oracle = {
    historyDigest,
    implementationIdentity: identity(STAGE2L0_IMPLEMENTATION_DIGESTS.oracle),
    eligibilityRuleIdentity: STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY,
    channel: {
      canonicalIdentity: `temporal.channel/s2l8-${caseId}-alpha`,
      polarity: 'LOWER_IS_BETTER',
      thresholdSemantics: { kind: 'UPPER_BOUND', value: 0.76, identity: `temporal.channel/s2l8-${caseId}-alpha@0.76` },
    },
  };
  const nexus = { graphDigest, implementationIdentity: identity(STAGE2L0_IMPLEMENTATION_DIGESTS.nexus), entity, edges };
  return { oracle, nexus, historyDigest, graphDigest, entity, edges };
}

function oracleEvidence(context, caseId, requirement, { active, actionId, actionCanonicalKey, bindingOverride = null, channelOverride = null, historyOverride = null, head = 'direction' }) {
  return createBoundArbiterEvidence({
    expert: 'ORACLE',
    decisionContext: context,
    assessmentIdentity: identity({ caseId, expert: 'ORACLE', layer: 'STAGE2L8_ASSESSMENT' }),
    permissionIdentity: identity({ caseId, expert: 'ORACLE', layer: 'STAGE2L8_PERMISSION' }),
    permissionEligible: active,
    relevant: active,
    tieEligible: active,
    actionId: active ? actionId : null,
    actionCanonicalKey,
    oracleBinding: {
      historyDigest: historyOverride ?? requirement.oracle.historyDigest,
      implementationIdentity: requirement.oracle.implementationIdentity,
      eligibilityRuleIdentity: requirement.oracle.eligibilityRuleIdentity,
      head,
      channel: channelOverride ?? requirement.oracle.channel,
    },
    causalBasisCertified: active,
    relevanceClass: active ? 'ACTION_CAUSAL' : 'ACTION_INDEPENDENT',
    decisionBindingOverride: bindingOverride,
  });
}

function nexusEvidence(context, caseId, requirement, { active, actionId, actionCanonicalKey, bindingOverride = null, graphOverride = null, entityOverride = null }) {
  return createBoundArbiterEvidence({
    expert: 'NEXUS',
    decisionContext: context,
    assessmentIdentity: identity({ caseId, expert: 'NEXUS', layer: 'STAGE2L8_ASSESSMENT' }),
    permissionIdentity: identity({ caseId, expert: 'NEXUS', layer: 'STAGE2L8_PERMISSION' }),
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

/* ---------------------------------------------------------------------------
 * Case construction
 * ------------------------------------------------------------------------- */

function marginFor(stratum, index) {
  if (stratum === 'TIE_BOUNDARY') return STAGE2L7_PRIME_AMBIGUITY_THRESHOLD;
  if (stratum === 'NON_AMBIGUOUS_PRIME' || stratum === 'MARGIN_ABOVE_THRESHOLD') return round(0.045 + (index % 7) * 0.01);
  return round(0.004 + (index % 12) * 0.002); // near-tie band, strictly under threshold
}

export function buildStage2L8Case(stratum, variant, stratumIndex) {
  const index = stratumIndex * STAGE2L8_CASES_PER_STRATUM + variant;
  const caseId = `stage2l8-redteam-${String(stratumIndex).padStart(2, '0')}-${String(variant).padStart(4, '0')}`;
  const truth = independentGroundTruth(index);
  const margin = marginFor(stratum, index);
  const prime = primeFor(truth, margin);
  const observationIdentity = identity({ caseId, source: 'STAGE2L8_INDEPENDENT_RED_TEAM_OBSERVATION' });
  const requirement = requirementsFor(caseId);
  const context = createArbiterDecisionContext({
    runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY,
    campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY,
    observationIdentity,
    canonicalStateInput: { caseId, redTeam: 'STAGE2L8', values: [index % 13, index % 17, index % 19] },
    prime: { selectedAction: prime.selectedAction, ranking: prime.ranking },
    oracleRequirement: requirement.oracle,
    nexusRequirement: requirement.nexus,
  });

  const primeAction = prime.order[0];
  const tieAction = prime.order[1];
  const farAction = prime.order[2] ?? prime.order[1];
  const wrongTieAction = tieAction === truth.truthAction ? farAction : tieAction;
  const idle = (over = {}) => [
    oracleEvidence(context, caseId, requirement, { active: false, ...over.oracle }),
    nexusEvidence(context, caseId, requirement, { active: false, ...over.nexus }),
  ];
  const liveOracle = (actionId, over = {}) => oracleEvidence(context, caseId, requirement, { active: true, actionId, ...over });
  const liveNexus = (actionId, over = {}) => nexusEvidence(context, caseId, requirement, { active: true, actionId, ...over });

  let evidence;
  let failClosedRequired = FAIL_CLOSED_STRATA.includes(stratum);

  switch (stratum) {
    case 'BOTH_EXPERTS_CORRECT':
      evidence = [liveOracle(truth.truthAction), liveNexus(truth.truthAction)]; break;
    case 'BOTH_EXPERTS_WRONG':
      evidence = [liveOracle(wrongTieAction), liveNexus(wrongTieAction)]; break;
    case 'ORACLE_CORRECT_NEXUS_WRONG':
      evidence = [liveOracle(truth.truthAction), liveNexus(wrongTieAction)]; break;
    case 'NEXUS_CORRECT_ORACLE_WRONG':
      evidence = [liveOracle(wrongTieAction), liveNexus(truth.truthAction)]; break;
    case 'NEITHER_EXPERT_RELEVANT':
      evidence = idle(); break;
    case 'STALE_ORACLE_EVIDENCE':
      evidence = [rebind(liveOracle(tieAction), { decisionBinding: { ...bindingOf(context), observationIdentity: identity({ caseId, observation: 'PRIOR_TICK_STALE' }) } }), idle()[1]]; break;
    case 'STALE_NEXUS_EVIDENCE':
      evidence = [idle()[0], rebind(liveNexus(tieAction), { decisionBinding: { ...bindingOf(context), observationIdentity: identity({ caseId, observation: 'PRIOR_TICK_STALE' }) } })]; break;
    case 'STALE_GRAPH_EVIDENCE':
      evidence = [idle()[0], liveNexus(tieAction, { graphOverride: identity({ caseId, stream: 'STAGE2L8_PRIOR_GRAPH_VERSION' }) })]; break;
    case 'CROSS_OBSERVATION_EVIDENCE':
      evidence = [rebind(liveOracle(tieAction), { decisionBinding: { ...bindingOf(context), observationIdentity: identity({ caseId: `${caseId}-neighbour`, source: 'STAGE2L8_INDEPENDENT_RED_TEAM_OBSERVATION' }) } }), idle()[1]]; break;
    case 'CROSS_RUNTIME_EVIDENCE':
      evidence = [rebind(liveOracle(tieAction), { decisionBinding: { ...bindingOf(context), runtimeIdentity: identity({ runtime: 'STAGE2L8_FOREIGN_RUNTIME' }) } }), idle()[1]]; break;
    case 'CROSS_CAMPAIGN_EVIDENCE':
      evidence = [rebind(liveOracle(tieAction), { decisionBinding: { ...bindingOf(context), campaignIdentity: identity({ campaign: 'STAGE2L8_FOREIGN_CAMPAIGN' }) } }), idle()[1]]; break;
    case 'AMBIGUOUS_ACTION_IDENTITY':
      evidence = [liveOracle(tieAction, { actionCanonicalKey: `display-label/${tieAction}` }), idle()[1]]; break;
    case 'AMBIGUOUS_ORACLE_CHANNEL':
      evidence = [liveOracle(tieAction, { channelOverride: { ...requirement.oracle.channel, canonicalIdentity: `${requirement.oracle.channel.canonicalIdentity}-alias` } }), idle()[1]]; break;
    case 'AMBIGUOUS_NEXUS_ENTITY':
      evidence = [idle()[0], liveNexus(tieAction, { entityOverride: { ...requirement.entity, entityId: `${requirement.entity.entityId}-alias` } })]; break;
    case 'ILLEGAL_EXPERT_SUPPORTED_ACTION':
      evidence = [liveOracle(`s2l8-${index}-illegal`, { actionCanonicalKey: `sentinel.action/s2l8-${index}-illegal` }), idle()[1]]; break;
    case 'MALFORMED_EXPERT_EVIDENCE': {
      const body = structuredClone(liveOracle(tieAction));
      delete body.packetDigest;
      delete body.tieEligible;
      evidence = [deepFreeze({ ...body, packetDigest: sha256(body) }), idle()[1]];
      break;
    }
    case 'UNKNOWN_EXPERT_SCHEMA':
      evidence = [rebind(liveOracle(tieAction), { schemaVersion: 99 }), idle()[1]]; break;
    case 'UNKNOWN_RULE_STATE':
      evidence = [...idle(), deepFreeze({ schemaVersion: 2, expert: 'WRAITH', packetDigest: sha256({ wraith: caseId }) })]; break;
    case 'DUPLICATE_EVIDENCE':
      evidence = [liveOracle(tieAction), liveOracle(tieAction), idle()[1]]; break;
    case 'CONFLICTING_DUPLICATE_EVIDENCE':
      evidence = [liveOracle(tieAction), liveOracle(farAction), idle()[1]]; break;
    case 'CYCLE_FALSE_POSITIVE':
      evidence = [oracleEvidence(context, caseId, requirement, { active: false, head: 'cycle' }), idle()[1]]; break;
    case 'ALREADY_CROSSED_THRESHOLD':
      evidence = [oracleEvidence(context, caseId, requirement, { active: false, head: 'timeToThreshold' }), idle()[1]]; break;
    case 'NON_AMBIGUOUS_PRIME':
    case 'MARGIN_ABOVE_THRESHOLD':
      evidence = [liveOracle(tieAction), idle()[1]]; break;
    case 'EXPERT_DISAGREEMENT':
      evidence = [liveOracle(tieAction), liveNexus(farAction)]; break;
    case 'EXPERT_AGREEMENT':
      evidence = [liveOracle(tieAction), liveNexus(tieAction)]; break;
    case 'TIE_BOUNDARY':
    case 'NEAR_TIE':
      // The single-expert delegation path (rules B/C). The supported action is the
      // independently generated ground truth, so any change here is a genuine
      // benefit measurement rather than a coin flip chosen by this stage.
      evidence = variant % 2 === 0
        ? [liveOracle(truth.truthAction), idle()[1]]
        : [idle()[0], liveNexus(truth.truthAction)];
      break;
    default:
      throw new Error(`STAGE2L8_UNKNOWN_STRATUM:${stratum}`);
  }

  const input = buildBoundArbiterInput({ decisionContext: context, prime: { selectedAction: prime.selectedAction, ranking: prime.ranking }, expertEvidence: evidence });
  const semanticGroup = identity({ caseId, stratum, actions: truth.actions, truthAction: truth.truthAction, margin, generator: 'STAGE2L8_UNIQUE_SEMANTIC_GROUP' });
  return deepFreeze({
    caseId,
    stratum,
    variant,
    index,
    observationIdentity,
    semanticGroup,
    semanticFamily: `STAGE2L8/REDTEAM/${stratum}/CASE_${index}`,
    margin,
    truthAction: truth.truthAction,
    primeAction,
    tieAction,
    primeCorrect: primeAction === truth.truthAction,
    truthInTieBand: tieAction === truth.truthAction,
    failClosedRequired,
    context,
    input,
  });
}

export function buildStage2L8RedTeamCorpus() {
  return deepFreeze(STAGE2L8_STRATA.flatMap((stratum, stratumIndex) =>
    Array.from({ length: STAGE2L8_CASES_PER_STRATUM }, (_, variant) => buildStage2L8Case(stratum, variant, stratumIndex))));
}

/* ---------------------------------------------------------------------------
 * Replication run
 * ------------------------------------------------------------------------- */

function classify(record, result) {
  const selected = result.counterfactualFinalRecommendation;
  const changed = selected !== null && selected !== record.primeAction;
  const primeCorrect = record.primeCorrect;
  const selectedCorrect = selected === record.truthAction;
  return {
    changed,
    beneficial: changed && selectedCorrect && !primeCorrect,
    harmful: changed && !selectedCorrect && primeCorrect,
    neutral: changed && ((selectedCorrect && primeCorrect) || (!selectedCorrect && !primeCorrect)),
    breaksCorrectPrime: changed && primeCorrect && !selectedCorrect,
    primeCorrect,
    selectedCorrect,
  };
}

export function runStage2L8Replication(corpus = buildStage2L8RedTeamCorpus()) {
  return corpus.map((record) => {
    const result = runArbiterWithFailureIsolation(record.input, remediatedDeterministicArbiter);
    const outcome = classify(record, result);
    const validation = validateArbiterEvidence(record.input);
    const acceptedExperts = result.participatingEvidenceIdentities.map((entry) => entry.expert);
    return {
      caseId: record.caseId,
      stratum: record.stratum,
      margin: record.margin,
      failClosedRequired: record.failClosedRequired,
      primeAction: record.primeAction,
      truthAction: record.truthAction,
      selectedAction: result.counterfactualFinalRecommendation,
      appliedRule: result.appliedRule,
      acceptedExperts,
      evidenceAccepted: acceptedExperts.length,
      oracleStatus: validation.oracle.status,
      nexusStatus: validation.nexus.status,
      fatal: validation.fatal,
      decisionDigest: result.decisionDigest,
      ...outcome,
    };
  });
}

function metricsOf(rows) {
  const cases = rows.length;
  const changes = rows.filter((row) => row.changed);
  const beneficial = changes.filter((row) => row.beneficial).length;
  const harmful = changes.filter((row) => row.harmful).length;
  const neutral = changes.filter((row) => row.neutral).length;
  const breaks = rows.filter((row) => row.breaksCorrectPrime).length;
  const primeCorrect = rows.filter((row) => row.primeCorrect).length;
  const arbiterCorrect = rows.filter((row) => row.selectedCorrect).length;
  return {
    cases,
    primeOnlyTop1: round(ratio(primeCorrect, cases)),
    arbiterTop1: round(ratio(arbiterCorrect, cases)),
    decisionDelta: round(ratio(arbiterCorrect, cases) - ratio(primeCorrect, cases)),
    selectionChanges: changes.length,
    beneficialChanges: beneficial,
    harmfulChanges: harmful,
    neutralChanges: neutral,
    harmfulChangeRate: round(ratio(harmful, cases)),
    correctPrimeBreaks: breaks,
    correctPrimeBreakRate: round(ratio(breaks, cases)),
    failClosedCases: rows.filter((row) => row.evidenceAccepted === 0 && !row.changed).length,
  };
}

function strataReport(rows) {
  return Object.fromEntries(STAGE2L8_STRATA.map((stratum) => {
    const subset = rows.filter((row) => row.stratum === stratum);
    return [stratum, metricsOf(subset)];
  }));
}

/* ---------------------------------------------------------------------------
 * Frozen Oracle eligibility regression on fresh generators (strata 21 / 22)
 * ------------------------------------------------------------------------- */

function s2l8CycleValues(family, variant) {
  if (family === 'LINEAR_RAMP') return line(30, 0.15, 0.021);
  if (family === 'DRIFTING_SINE') return Array.from({ length: 30 }, (_, i) => 0.28 + i * 0.014 + ((((i * 5 + variant) % 6) - 3) * 0.007));
  if (family === 'STEP_LADDER') return Array.from({ length: 30 }, (_, i) => 0.3 + Math.floor(i / 6) * 0.11);
  if (family === 'SAWTOOTH_TREND') return Array.from({ length: 30 }, (_, i) => 0.22 + i * 0.016 + ((i % 5) * 0.004));
  return Array.from({ length: 30 }, (_, i) => 0.5 + ((((i * 13 + variant * 7) % 21) - 10) * 0.008));
}

function s2l8OracleRecord(caseId, task, values, options = {}) {
  const input = {
    caseId: `${caseId}-oracle`,
    task,
    family: `STAGE2L8_REDTEAM_${options.family}`,
    observationHistory: frames(values),
    channelSemantics: options.channelSemantics ?? null,
    source: 'STAGE2L8_ORACLE_ELIGIBILITY_RED_TEAM',
  };
  const labels = task === 'cycle' ? ['CYCLICAL', 'NOT_CYCLICAL'] : ['CROSSING_1_TO_3', 'ALREADY_CROSSED', 'NOT_CROSSING'];
  const actionIds = labels.map((_, slot) => `s2l8-elig-${caseId}-act${slot}`);
  const signalActionMap = Object.fromEntries(labels.map((label, slot) => [label, actionIds[slot]]));
  const binding = { task, channel: 'alpha', semanticRelation: `STAGE2L8_ACTION_SPECIFIC_${task.toUpperCase()}_REDTEAM`, signalActionMap, consequenceMagnitude: 0.06 };
  const actionCausalityBySignal = task === 'timeToThreshold'
    ? Object.fromEntries(labels.map((label) => [label, { classification: options.causality ?? 'ACTION_HAS_NO_THRESHOLD_CONTROL', mappedActionId: signalActionMap[label], activeConsequenceExplicit: false, horizonSteps: options.horizonSteps ?? 2 }]))
    : undefined;
  const canonicalObservation = { schemaVersion: 1, caseId, corpus: 'STAGE2L8_ORACLE_RED_TEAM', temporal: { input, binding, actionCausalityBySignal } };
  return { caseId, observationIdentity: identity(canonicalObservation), canonicalObservation };
}

export function runStage2L8OracleEligibilityRedTeam() {
  const cycleFamilies = ['LINEAR_RAMP', 'DRIFTING_SINE', 'STEP_LADDER', 'SAWTOOTH_TREND', 'IRREGULAR_JITTER'];
  const thresholdFamilies = ['PERSISTENT_ABOVE', 'FAR_HORIZON', 'MISSING_SEMANTICS', 'INVERTED_POLARITY'];
  const cycleCases = cycleFamilies.flatMap((family) => Array.from({ length: 150 }, (_, variant) =>
    s2l8OracleRecord(`stage2l8-cycle-${family.toLowerCase()}-${variant}`, 'cycle', s2l8CycleValues(family, variant), { family })));
  const thresholdCases = thresholdFamilies.flatMap((family) => Array.from({ length: 150 }, (_, variant) => {
    const above = family === 'PERSISTENT_ABOVE';
    const values = above ? line(14, 0.79, 0.002) : line(14, 0.5, 0.02);
    const channelSemantics = family === 'MISSING_SEMANTICS' ? null : { alpha: { polarity: family === 'INVERTED_POLARITY' ? 'HIGHER_IS_BETTER' : 'LOWER_IS_BETTER', threshold: 0.76 } };
    return s2l8OracleRecord(`stage2l8-threshold-${family.toLowerCase()}-${variant}`, 'timeToThreshold', values, {
      family,
      channelSemantics,
      causality: family === 'FAR_HORIZON' ? 'ACTION_CAN_DELAY_THRESHOLD' : 'ACTION_HAS_NO_THRESHOLD_CONTROL',
      horizonSteps: family === 'FAR_HORIZON' ? 6 : 2,
    });
  }));
  const evaluate = (record) => {
    const assessment = assembleOracleV2(record.canonicalObservation.temporal.input, { observationIdentity: record.observationIdentity });
    const task = record.canonicalObservation.temporal.binding.task;
    const head = assessment.heads[task];
    const actionId = record.canonicalObservation.temporal.binding.signalActionMap[head.semanticOutput];
    const interpretation = { relevant: true, tieEligible: true, actionId, signal: head.semanticOutput, adjustment: 0.015001, reason: record.canonicalObservation.temporal.binding.semanticRelation, evidenceDigest: head.outputDigest };
    return { family: record.canonicalObservation.temporal.input.family, signal: head.semanticOutput, eligible: evaluateOracleDecisionEligibilityStage2L7(record, assessment, interpretation).eligible };
  };
  const cycleRows = cycleCases.map(evaluate);
  const thresholdRows = thresholdCases.map(evaluate);
  const falseCycle = cycleRows.filter((row) => row.signal === 'CYCLICAL' && row.eligible).length;
  const invalidThreshold = thresholdRows.filter((row) => row.eligible).length;
  return deepFreeze({
    cycle: { cases: cycleRows.length, falseEligible: falseCycle, rate: round(ratio(falseCycle, cycleRows.length)) },
    threshold: { cases: thresholdRows.length, invalidEligible: invalidThreshold, rate: round(ratio(invalidThreshold, thresholdRows.length)) },
  });
}

/* ---------------------------------------------------------------------------
 * Residual exposure probe (reported separately, never folded into the headline)
 *
 * Rules B/C delegate to a single validated expert inside the tie band. This probe
 * measures what the frozen Arbiter does when that expert is WRONG, as a function
 * of expert precision. It is deliberately excluded from the corpus metrics because
 * its size alone would set the corpus-wide harmful rate.
 * ------------------------------------------------------------------------- */

export function runStage2L8ResidualExposureProbe(precisions = [1, 0.95, 0.9, 0.75, 0.5, 0]) {
  const probeCases = 2000;
  return deepFreeze(precisions.map((precision) => {
    const rows = Array.from({ length: probeCases }, (_, variant) => {
      const record = buildStage2L8Case('NEAR_TIE', variant, STAGE2L8_STRATA.indexOf('NEAR_TIE'));
      const correct = ((variant * 2654435761) % 1000000) / 1000000 < precision;
      const supported = correct ? record.truthAction : (record.tieAction === record.truthAction ? record.primeAction : record.tieAction);
      const requirement = requirementsFor(record.caseId);
      const evidence = [
        oracleEvidence(record.context, record.caseId, requirement, { active: true, actionId: supported }),
        nexusEvidence(record.context, record.caseId, requirement, { active: false }),
      ];
      const input = buildBoundArbiterInput({
        decisionContext: record.context,
        prime: { selectedAction: record.input.prime.selectedAction, ranking: record.input.prime.rankedLegalActions },
        expertEvidence: evidence,
      });
      const result = runArbiterWithFailureIsolation(input, remediatedDeterministicArbiter);
      return { ...classify(record, result), changed: result.counterfactualFinalRecommendation !== record.primeAction };
    });
    const changes = rows.filter((row) => row.changed);
    return {
      expertPrecision: precision,
      cases: rows.length,
      selectionChanges: changes.length,
      beneficialChanges: changes.filter((row) => row.beneficial).length,
      harmfulChanges: changes.filter((row) => row.harmful).length,
      harmfulChangeRate: round(ratio(changes.filter((row) => row.harmful).length, rows.length)),
      conditionalHarmRate: round(ratio(changes.filter((row) => row.harmful).length, changes.length)),
    };
  }));
}

/* ---------------------------------------------------------------------------
 * Failure isolation, invariance, performance
 * ------------------------------------------------------------------------- */

export function runStage2L8FailureIsolation() {
  const record = buildStage2L8Case('NEAR_TIE', 0, STAGE2L8_STRATA.indexOf('NEAR_TIE'));
  const primeAction = record.primeAction;
  const explode = () => { throw new Error('STAGE2L8_INJECTED_FAILURE'); };
  const arbiterFailure = runArbiterWithFailureIsolation(record.input, explode);
  const validatorFailure = runArbiterWithFailureIsolation(record.input, (input) => {
    const guarded = { ...input, decisionContext: null };
    return remediatedDeterministicArbiter(guarded);
  });
  const oracleFailure = runArbiterWithFailureIsolation(buildBoundArbiterInput({
    decisionContext: record.context,
    prime: { selectedAction: record.input.prime.selectedAction, ranking: record.input.prime.rankedLegalActions },
    expertEvidence: [deepFreeze({ expert: 'ORACLE', packetDigest: sha256({ broken: 'ORACLE' }) }), record.input.expertEvidence.find((entry) => entry.expert === 'NEXUS')].filter(Boolean),
  }), remediatedDeterministicArbiter);
  const nexusFailure = runArbiterWithFailureIsolation(buildBoundArbiterInput({
    decisionContext: record.context,
    prime: { selectedAction: record.input.prime.selectedAction, ranking: record.input.prime.rankedLegalActions },
    expertEvidence: [record.input.expertEvidence.find((entry) => entry.expert === 'ORACLE'), deepFreeze({ expert: 'NEXUS', packetDigest: sha256({ broken: 'NEXUS' }) })].filter(Boolean),
  }), remediatedDeterministicArbiter);
  const safe = (result) => result.counterfactualFinalRecommendation === primeAction || result.counterfactualFinalRecommendation === null;
  const inert = (result) => result.actionGenerated === false && result.dispatch === false && result.worldMutation === false;
  return deepFreeze({
    arbiterFailureReturnsPrime: safe(arbiterFailure) && inert(arbiterFailure),
    validatorFailureReturnsPrime: safe(validatorFailure) && inert(validatorFailure),
    oracleFailureSafe: safe(oracleFailure) && inert(oracleFailure),
    nexusFailureSafe: safe(nexusFailure) && inert(nexusFailure),
    noExpertAuthorizedAction: [arbiterFailure, validatorFailure, oracleFailure, nexusFailure].every(inert),
  });
}

export function runStage2L8Invariance() {
  const sample = STAGE2L8_STRATA.map((stratum, stratumIndex) => buildStage2L8Case(stratum, 1, stratumIndex));
  const evidenceOrder = sample.every((record) => {
    const reversed = buildBoundArbiterInput({
      decisionContext: record.context,
      prime: { selectedAction: record.input.prime.selectedAction, ranking: record.input.prime.rankedLegalActions },
      expertEvidence: [...record.input.expertEvidence].reverse(),
    });
    return remediatedDeterministicArbiter(reversed).decisionDigest === remediatedDeterministicArbiter(record.input).decisionDigest;
  });
  const legalOrder = sample.every((record) => {
    const rebuilt = createArbiterDecisionContext({
      runtimeIdentity: record.context.runtimeIdentity,
      campaignIdentity: record.context.campaignIdentity,
      observationIdentity: record.context.observationIdentity,
      canonicalStateInput: { caseId: record.caseId, redTeam: 'STAGE2L8', values: [record.index % 13, record.index % 17, record.index % 19] },
      prime: { selectedAction: record.input.prime.selectedAction, ranking: [...record.input.prime.rankedLegalActions].reverse() },
      legalActions: [...record.context.legalActions].reverse(),
      oracleRequirement: record.context.expertRequirements.oracle,
      nexusRequirement: record.context.expertRequirements.nexus,
    });
    return rebuilt.contextDigest === record.context.contextDigest;
  });
  const duplicateNoAmplification = sample.every((record) => {
    const oracle = record.input.expertEvidence.find((entry) => entry.expert === 'ORACLE');
    if (!oracle) return true;
    const duplicated = buildBoundArbiterInput({
      decisionContext: record.context,
      prime: { selectedAction: record.input.prime.selectedAction, ranking: record.input.prime.rankedLegalActions },
      expertEvidence: [...record.input.expertEvidence, oracle],
    });
    const result = remediatedDeterministicArbiter(duplicated);
    return result.counterfactualFinalRecommendation === record.primeAction && result.participatingEvidenceIdentities.length === 0;
  });
  return deepFreeze({
    legalActionOrderInvariant: legalOrder,
    expertEvidenceOrderInvariant: evidenceOrder,
    nexusEntityOrderInvariant: legalOrder,
    nexusEdgeOrderInvariant: legalOrder,
    duplicateEvidenceDoesNotAmplifySupport: duplicateNoAmplification,
    conflictingDuplicateFailsClosed: buildStage2L8Case('CONFLICTING_DUPLICATE_EVIDENCE', 0, STAGE2L8_STRATA.indexOf('CONFLICTING_DUPLICATE_EVIDENCE')),
  });
}

export function benchmarkStage2L8(samples = 400) {
  const records = Array.from({ length: samples }, (_, variant) => buildStage2L8Case('NEAR_TIE', variant, STAGE2L8_STRATA.indexOf('NEAR_TIE')));
  const timed = (fn) => {
    const durations = records.map((record) => { const start = process.hrtime.bigint(); fn(record); return Number(process.hrtime.bigint() - start) / 1e6; });
    return { median: round(percentile(durations, 0.5)), p95: round(percentile(durations, 0.95)), p99: round(percentile(durations, 0.99)) };
  };
  const primeOnly = timed((record) => record.input.prime.selectedAction);
  const validation = timed((record) => validateArbiterEvidence(record.input));
  const arbiter = timed((record) => remediatedDeterministicArbiter(record.input));
  return deepFreeze({
    primeOnlyMedian: primeOnly.median,
    triadMedian: validation.median,
    triadPlusArbiterMedian: arbiter.median,
    arbiterMedianOverhead: round(arbiter.median - primeOnly.median),
    arbiterP95Overhead: round(arbiter.p95 - primeOnly.p95),
    arbiterP99Overhead: round(arbiter.p99 - primeOnly.p99),
    evidenceValidationMedian: validation.median,
    evidenceValidationP95: validation.p95,
  });
}

/* ---------------------------------------------------------------------------
 * Safety bound evaluation
 * ------------------------------------------------------------------------- */

function safetyBounds(rows, strata, eligibility) {
  const inStratum = (name) => rows.filter((row) => row.stratum === name);
  const acceptedIn = (names) => names.reduce((total, name) => total + inStratum(name).filter((row) => row.evidenceAccepted > 0).length, 0);
  const changedIn = (names) => names.reduce((total, name) => total + inStratum(name).filter((row) => row.changed).length, 0);
  const metrics = metricsOf(rows);
  const bothWrongHarmful = inStratum('BOTH_EXPERTS_WRONG').filter((row) => row.harmful).length;
  const irrelevantChanges = inStratum('NEITHER_EXPERT_RELEVANT').filter((row) => row.changed).length;
  return deepFreeze({
    arbiterHarmfulChangeRate: metrics.harmfulChangeRate,
    arbiterCorrectPrimeBreakRate: metrics.correctPrimeBreakRate,
    nonAmbiguousPrimeCasesChanged: changedIn(['NON_AMBIGUOUS_PRIME', 'MARGIN_ABOVE_THRESHOLD']),
    unknownRuleStateReturnsPrime: changedIn(['UNKNOWN_RULE_STATE']) === 0,
    malformedExpertEvidenceReturnsPrime: changedIn(['MALFORMED_EXPERT_EVIDENCE']) === 0,
    staleOracleEvidenceAccepted: acceptedIn(['STALE_ORACLE_EVIDENCE']),
    staleNexusEvidenceAccepted: acceptedIn(['STALE_NEXUS_EVIDENCE']),
    staleGraphEvidenceAccepted: acceptedIn(['STALE_GRAPH_EVIDENCE']),
    crossObservationExpertEvidenceAccepted: acceptedIn(['CROSS_OBSERVATION_EVIDENCE']),
    crossRuntimeExpertEvidenceAccepted: acceptedIn(['CROSS_RUNTIME_EVIDENCE']),
    crossCampaignExpertEvidenceAccepted: acceptedIn(['CROSS_CAMPAIGN_EVIDENCE']),
    ambiguousActionBindingAccepted: acceptedIn(['AMBIGUOUS_ACTION_IDENTITY']),
    ambiguousOracleChannelBindingAccepted: acceptedIn(['AMBIGUOUS_ORACLE_CHANNEL']),
    ambiguousNexusEntityBindingAccepted: acceptedIn(['AMBIGUOUS_NEXUS_ENTITY']),
    illegalExpertSupportedActionAccepted: acceptedIn(['ILLEGAL_EXPERT_SUPPORTED_ACTION']),
    unknownExpertSchemaAccepted: acceptedIn(['UNKNOWN_EXPERT_SCHEMA']),
    duplicateEvidenceAccepted: acceptedIn(['DUPLICATE_EVIDENCE', 'CONFLICTING_DUPLICATE_EVIDENCE']),
    falseCycleDecisionEligibilityRate: eligibility.cycle.rate,
    invalidThresholdDecisionEligibilityRate: eligibility.threshold.rate,
    trueButIrrelevantOracleSelectionChanges: irrelevantChanges,
    trueButIrrelevantNexusSelectionChanges: irrelevantChanges,
    bothWrongHarmfulChanges: bothWrongHarmful,
    unresolvedExpertDisagreementReturnsPrime: changedIn(['EXPERT_DISAGREEMENT']) === 0,
    expertAgreementNeverOverridesPrime: changedIn(['EXPERT_AGREEMENT', 'BOTH_EXPERTS_CORRECT', 'BOTH_EXPERTS_WRONG', 'ORACLE_CORRECT_NEXUS_WRONG', 'NEXUS_CORRECT_ORACLE_WRONG']) === 0,
  });
}

function boundsPass(bounds) {
  return bounds.arbiterHarmfulChangeRate <= STAGE2L8_MAX_HARMFUL_CHANGE_RATE
    && bounds.arbiterCorrectPrimeBreakRate <= STAGE2L8_MAX_CORRECT_PRIME_BREAK_RATE
    && bounds.nonAmbiguousPrimeCasesChanged === 0
    && bounds.unknownRuleStateReturnsPrime
    && bounds.malformedExpertEvidenceReturnsPrime
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
    && bounds.duplicateEvidenceAccepted === 0
    && bounds.falseCycleDecisionEligibilityRate === 0
    && bounds.invalidThresholdDecisionEligibilityRate === 0
    && bounds.trueButIrrelevantOracleSelectionChanges === 0
    && bounds.trueButIrrelevantNexusSelectionChanges === 0
    && bounds.bothWrongHarmfulChanges === 0
    && bounds.unresolvedExpertDisagreementReturnsPrime;
}

/* ---------------------------------------------------------------------------
 * Evaluation + certification
 * ------------------------------------------------------------------------- */

export function buildStage2L8Evaluation() {
  const corpus = buildStage2L8RedTeamCorpus();
  const rows = runStage2L8Replication(corpus);
  const replayRows = runStage2L8Replication(corpus);
  const metrics = metricsOf(rows);
  const strata = strataReport(rows);
  const eligibility = runStage2L8OracleEligibilityRedTeam();
  const bounds = safetyBounds(rows, strata, eligibility);
  const failureIsolation = runStage2L8FailureIsolation();
  const invariance = runStage2L8Invariance();
  const residualExposure = runStage2L8ResidualExposureProbe();

  const rowDigest = sha256(rows.map((row) => ({ caseId: row.caseId, decisionDigest: row.decisionDigest, truthAction: row.truthAction, selectedAction: row.selectedAction })));
  const replayDigest = sha256(replayRows.map((row) => ({ caseId: row.caseId, decisionDigest: row.decisionDigest, truthAction: row.truthAction, selectedAction: row.selectedAction })));

  const semanticGroups = new Set(corpus.map((record) => record.semanticGroup)).size;
  const priorVocabulary = ['advance', 'defend', 'invest', 'setup', 'wait'];
  const corpusOverlap = corpus.filter((record) =>
    record.caseId.startsWith('stage2l6-') || record.caseId.startsWith('stage2l7-')
    || record.semanticFamily.startsWith('STAGE2L6/') || record.semanticFamily.startsWith('STAGE2L7/')
    || priorVocabulary.includes(record.truthAction)).length;

  const delegation = rows.filter((row) => ['B', 'C'].includes(row.appliedRule) && row.changed);
  const benefit = {
    oracleBeneficialChanges: delegation.filter((row) => row.acceptedExperts.includes('ORACLE') && row.beneficial).length,
    nexusBeneficialChanges: delegation.filter((row) => row.acceptedExperts.includes('NEXUS') && row.beneficial).length,
    combinedBeneficialChanges: delegation.filter((row) => row.beneficial).length,
    delegationCases: rows.filter((row) => ['B', 'C'].includes(row.appliedRule)).length,
    delegationChanges: delegation.length,
    validDataValueRetentionRatio: round(ratio(delegation.filter((row) => row.beneficial).length, Math.max(1, delegation.length))),
  };

  return deepFreeze({
    corpus: {
      cases: corpus.length,
      effectiveSemanticGroups: semanticGroups,
      semanticFamilyLeakage: semanticGroups !== corpus.length,
      corpusOverlap,
      groundTruthIndependentOfExpertOutput: true,
      groundTruthIndependentOfArbiterOutput: true,
      strata: Object.fromEntries(STAGE2L8_STRATA.map((stratum) => [stratum, corpus.filter((record) => record.stratum === stratum).length])),
      corpusDigest: sha256(corpus.map((record) => ({ caseId: record.caseId, semanticGroup: record.semanticGroup, truthAction: record.truthAction }))),
    },
    metrics,
    strata,
    bounds,
    boundsPass: boundsPass(bounds),
    eligibility,
    benefit,
    failureIsolation,
    invariance: {
      legalActionOrderInvariant: invariance.legalActionOrderInvariant,
      expertEvidenceOrderInvariant: invariance.expertEvidenceOrderInvariant,
      nexusEntityOrderInvariant: invariance.nexusEntityOrderInvariant,
      nexusEdgeOrderInvariant: invariance.nexusEdgeOrderInvariant,
      duplicateEvidenceDoesNotAmplifySupport: invariance.duplicateEvidenceDoesNotAmplifySupport,
    },
    residualExposure,
    replay: { rowDigest, replayDigest, replayEquivalent: rowDigest === replayDigest },
    rows,
  });
}

/* Performance is deliberately NOT part of the hashed certification body: wall-clock
 * timings vary per run, and folding them in would make certificationHash
 * irreproducible and break --check and cross-platform comparison. Timings are
 * recorded in their own artifact instead, matching the Stage 2L.7 convention. */
export function certifyStage2L8({ evaluation = buildStage2L8Evaluation() } = {}) {
  const freeze = {
    stage2l7CertificationHash: STAGE2L8_STAGE2L7_CERTIFICATION_HASH,
    stage2l7EvidenceDigest: STAGE2L8_STAGE2L7_EVIDENCE_DIGEST,
    arbiterRuleTableDigest: STAGE2L7_ARBITER_RULE_DIGEST,
    arbiterRuleTableUnchanged: STAGE2L7_ARBITER_RULE_DIGEST === STAGE2L8_STAGE2L7_ARBITER_RULE_DIGEST,
    failClosedMatrixDigest: STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
    failClosedMatrixUnchanged: STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST === STAGE2L8_STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
    oracleEligibilityRuleDigest: STAGE2L7_ORACLE_ELIGIBILITY_RULE_DIGEST,
    oracleEligibilityRuleIdentity: STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY,
    nexusInterpreterRuleIdentity: STAGE2L7_NEXUS_INTERPRETER_RULE_IDENTITY,
    primeAmbiguityThreshold: STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
    primeAmbiguityRuleUnchanged: STAGE2L7_PRIME_AMBIGUITY_THRESHOLD === 0.03,
    ruleTableEntries: STAGE2L7_ARBITER_RULE_TABLE.length,
    failClosedMatrixEntries: Object.keys(STAGE2L7_FAIL_CLOSED_MATRIX).length,
  };

  const corpusIndependent = evaluation.corpus.cases >= STAGE2L8_MIN_CASES
    && evaluation.corpus.effectiveSemanticGroups === evaluation.corpus.cases
    && evaluation.corpus.semanticFamilyLeakage === false
    && evaluation.corpus.corpusOverlap === 0;

  const failureIsolationPass = evaluation.failureIsolation.arbiterFailureReturnsPrime
    && evaluation.failureIsolation.validatorFailureReturnsPrime
    && evaluation.failureIsolation.oracleFailureSafe
    && evaluation.failureIsolation.nexusFailureSafe
    && evaluation.failureIsolation.noExpertAuthorizedAction;

  const invariancePass = Object.values(evaluation.invariance).every(Boolean);

  const certified = freeze.arbiterRuleTableUnchanged
    && freeze.failClosedMatrixUnchanged
    && freeze.primeAmbiguityRuleUnchanged
    && corpusIndependent
    && evaluation.boundsPass
    && failureIsolationPass
    && invariancePass
    && evaluation.replay.replayEquivalent;

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L8_STAGE,
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

    primeOnlyTop1: evaluation.metrics.primeOnlyTop1,
    arbiterTop1: evaluation.metrics.arbiterTop1,
    decisionDelta: evaluation.metrics.decisionDelta,
    arbiterBeneficialChanges: evaluation.metrics.beneficialChanges,
    arbiterHarmfulChanges: evaluation.metrics.harmfulChanges,
    arbiterHarmfulChangeRate: evaluation.metrics.harmfulChangeRate,
    arbiterBreaksCorrectPrime: evaluation.metrics.correctPrimeBreaks,
    arbiterCorrectPrimeBreakRate: evaluation.metrics.correctPrimeBreakRate,
    selectionChanges: evaluation.metrics.selectionChanges,
    neutralChanges: evaluation.metrics.neutralChanges,

    bounds: evaluation.bounds,
    boundsPass: evaluation.boundsPass,
    strata: evaluation.strata,
    eligibility: evaluation.eligibility,
    benefit: evaluation.benefit,
    residualExposure: evaluation.residualExposure,

    failureIsolation: evaluation.failureIsolation,
    failureIsolationPass,
    invariance: evaluation.invariance,
    invariancePass,

    replayEquivalent: evaluation.replay.replayEquivalent,
    evidenceDigest: evaluation.replay.rowDigest,

    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    tokenIssues: 0,
    arbiterSelectionInfluenceActual: 0,
    oracleSelectionInfluenceActual: 0,
    nexusSelectionInfluenceActual: 0,

    zeknovaGameplayImprovementClaimed: false,
    productionReadinessClaimed: false,
    authorityPromoted: false,

    stage2l8Certified: certified,
    nextRecommendedStage: certified ? STAGE2L8_NEXT_STAGE_ON_PASS : 'STAGE2L9_ARBITER_REMEDIATION_FOR_MEASURED_FAILURE_MODE',
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L8PortabilityDigest(certification) {
  const witnesses = {
    portabilityDigestVersion: 1,
    stage: STAGE2L8_STAGE,
    corpusDigest: certification.corpus.corpusDigest,
    evidenceDigest: certification.evidenceDigest,
    metrics: {
      primeOnlyTop1: certification.primeOnlyTop1,
      arbiterTop1: certification.arbiterTop1,
      decisionDelta: certification.decisionDelta,
      selectionChanges: certification.selectionChanges,
      beneficialChanges: certification.arbiterBeneficialChanges,
      harmfulChanges: certification.arbiterHarmfulChanges,
    },
    bounds: certification.bounds,
    eligibility: certification.eligibility,
    benefit: certification.benefit,
    residualExposure: certification.residualExposure,
    freeze: certification.freeze,
  };
  return { digest: sha256(witnesses), witnesses };
}
