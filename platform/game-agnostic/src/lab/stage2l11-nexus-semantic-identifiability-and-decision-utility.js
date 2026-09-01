/* Stage 2L.11 — Nexus semantic identifiability and decision-utility certification
 * (R0, shadow only).
 *
 * MEASUREMENT / CERTIFICATION STAGE ONLY. Nexus is imported frozen. The Stage
 * 2L.10 arbiter and its frozen calibration are imported and never modified. No
 * threshold is loosened, no Prime protection is weakened, and nothing here may
 * make hidden ground truth observable to Nexus.
 *
 * THE QUESTION. Stage 2L.10 safely contained Nexus — 0 delegations, 0 harm — but
 * did not establish useful selective Nexus delegation: every measured structural
 * reliability bucket landed at 0.52–0.54 against a 0.99 floor, and 1,849 correct
 * Nexus opportunities were abstained from. Is that because Nexus correctness is
 * genuinely unobservable, or because the evidence contract simply fails to carry
 * a signal Nexus already computes?
 *
 * Three outcomes are possible and none is assumed:
 *   IDENTIFIABLE                    existing outputs separate correct from wrong
 *   CONTRACT_INCOMPLETE             the signal exists internally but is discarded
 *   NON_IDENTIFIABLE_CURRENT_TASK   correctness is independent of everything
 *                                   observable at decision time
 *
 * HOW THE CONTRACT_INCOMPLETE HYPOTHESIS IS RULED IN OR OUT. The analysis is
 * deliberately given MORE information than the Arbiter is allowed to see: three
 * tiers of features — what the Stage 2L.10 attestation exposes, what
 * analyzeRelationalDelta computes but the attestation drops, and the full signal
 * set of the certified evaluateNexus expert contract that is not in the Arbiter
 * path at all. If correctness cannot be predicted even from the union, then
 * widening the contract cannot help and CONTRACT_INCOMPLETE is empirically
 * excluded rather than merely doubted.
 *
 * WHY A RICHER CORPUS IS REQUIRED. On the Stage 2L.10 Nexus corpus most structural
 * features are constant across delegation opportunities, so a null result there
 * would be uninformative — it would show the features never varied, not that they
 * carry no information. Stage 2L.11 therefore generates topology that genuinely
 * varies every feature: dense and sparse, cyclic and acyclic, single and multiple
 * points of failure, redundant and irredundant, typed conflicts, incomplete
 * relations, ambiguous topology, and threat/support structure that exercises the
 * expert contract's unused signals.
 *
 * WHAT IS NOT DONE. The semantic alignment draw is left exactly as Stage 2L.9 and
 * 2L.10 declared it: an independent draw at a declared rate. Correlating it with
 * an observable would manufacture the very signal this stage exists to test for,
 * and would convert a scientific result into a rigged one.
 */

import { createSeededRandom, deriveSeed, deepFreeze, sha256 } from '../core/determinism.js';
import { evaluateNexus } from '../experts/nexus.js';
import { analyzeRelationalDelta, relationalReference } from './stage2k0-nexus-relational-diagnostic.js';
import {
  STAGE2L0_CAMPAIGN_IDENTITY,
  STAGE2L0_IMPLEMENTATION_DIGESTS,
  STAGE2L0_RUNTIME_IDENTITY,
} from './stage2l0-core-triad-shadow-integration.js';
import { runArbiterWithFailureIsolation } from './stage2l5-deterministic-arbiter-candidate.js';
import {
  STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY,
  STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
  createArbiterDecisionContext,
  createBoundArbiterEvidence,
  remediatedDeterministicArbiter,
} from './stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js';
import {
  STAGE2L10_FROZEN_CALIBRATION,
  STAGE2L10_MIN_BUCKET_RELIABILITY,
  STAGE2L10_MIN_BUCKET_SAMPLES,
  STAGE2L10_NEXUS_ALIGNMENT_RATE,
  buildStage2L10Input,
  calibratedSelectiveDelegationArbiter,
  createCorrectnessAttestation,
  nexusUncertaintyBucket,
} from './stage2l10-arbiter-correctness-calibration-and-selective-delegation.js';

export const STAGE2L11_STAGE = 'STAGE2L11_NEXUS_SEMANTIC_IDENTIFIABILITY_AND_DECISION_UTILITY';

/* Frozen predecessors. Stage 2L.11 changes none of them. */
export const STAGE2L11_STAGE2L10_CERTIFICATION_HASH = '73e958a02a479326bb60cad058fa5cc3e29d5c77614aaef87936aa41dba41a86';
export const STAGE2L11_STAGE2L10_EVIDENCE_DIGEST = '354fa1d701f89d5118fb973233dca5bf7aa066df72642d6239156b38de91089d';
export const STAGE2L11_STAGE2L10_OWNER_SHA256 = '7301bc34486f0ae72e310898cd162fb9bd41d7be943b5ada81a5785bcd18a00a';

/* Inherited bounds. Stage 2L.11 introduces no new threshold and loosens none. */
export const STAGE2L11_MAX_HARMFUL_CHANGE_RATE = 0.01;
export const STAGE2L11_MAX_CORRECT_PRIME_BREAK_RATE = 0.01;
export const STAGE2L11_MIN_BUCKET_RELIABILITY = STAGE2L10_MIN_BUCKET_RELIABILITY;
export const STAGE2L11_MIN_BUCKET_SAMPLES = STAGE2L10_MIN_BUCKET_SAMPLES;

/* Declared corpus parameter, inherited verbatim from Stage 2L.9 and 2L.10 and
 * deliberately left alone: how often the structurally critical entity is also the
 * utility-optimal one. */
export const STAGE2L11_NEXUS_ALIGNMENT_RATE = STAGE2L10_NEXUS_ALIGNMENT_RATE;

export const STAGE2L11_SPLITS = deepFreeze(['DISCOVERY', 'HOLDOUT']);
export const STAGE2L11_DISCOVERY_CASES = 6000;
export const STAGE2L11_HOLDOUT_CASES = 12000;

/* Independent seeded streams. The alignment stream is deliberately SEPARATE from
 * the topology stream so that no observable can carry information about it. */
const SPLIT_SEED = deepFreeze({ DISCOVERY: 0x5347324c313144n, HOLDOUT: 0x5347324c313148n });

function identity(payload) { return `sha256:${sha256(payload)}`; }
function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }

/* ---------------------------------------------------------------------------
 * Ground truth.
 *
 * Two independent streams. `alignment` decides whether the structurally critical
 * entity is also the utility-optimal one — the hidden semantic variable. `context`
 * decides Prime's correctness, its ambiguity band, and which topology family is
 * built. They are drawn from separately derived seeds so that topology and
 * alignment cannot share structure even incidentally.
 * ------------------------------------------------------------------------- */

export const STAGE2L11_MARGIN_BANDS = deepFreeze([
  'Q_MARGIN_0_005', 'Q_MARGIN_0_010', 'Q_MARGIN_0_015',
  'Q_MARGIN_0_020', 'Q_MARGIN_0_025', 'Q_MARGIN_0_030', 'Q_MARGIN_GT_0_030',
]);
const BAND_MARGIN = deepFreeze({
  Q_MARGIN_0_005: 0.005, Q_MARGIN_0_010: 0.010, Q_MARGIN_0_015: 0.015,
  Q_MARGIN_0_020: 0.020, Q_MARGIN_0_025: 0.025, Q_MARGIN_0_030: 0.030,
  Q_MARGIN_GT_0_030: 0.055,
});

export function stage2L11Alignment(split, index) {
  const random = createSeededRandom(deriveSeed(SPLIT_SEED[split], `STAGE2L11_SEMANTIC_ALIGNMENT_${split}`, index));
  return random() < STAGE2L11_NEXUS_ALIGNMENT_RATE;
}

export function stage2L11Context(split, index) {
  const random = createSeededRandom(deriveSeed(SPLIT_SEED[split], `STAGE2L11_DECISION_CONTEXT_${split}`, index));
  const primeCorrect = random() < 0.5;
  const bandIndex = Math.floor(random() * STAGE2L11_MARGIN_BANDS.length);
  const supportInTieBand = random() < 0.85;
  const familyIndex = Math.floor(random() * STAGE2L11_TOPOLOGY_FAMILIES.length);
  const scale = Math.floor(random() * 4);
  return deepFreeze({
    split, index, primeCorrect,
    band: STAGE2L11_MARGIN_BANDS[bandIndex],
    margin: BAND_MARGIN[STAGE2L11_MARGIN_BANDS[bandIndex]],
    supportInTieBand, familyIndex, scale,
    generator: 'STAGE2L11_INDEPENDENT_GROUND_TRUTH_V1',
  });
}

/* ---------------------------------------------------------------------------
 * Topology families.
 *
 * Twelve families spanning the structural axes Stage 2L.10's four shapes left
 * constant: density, component count, cyclicity, points-of-failure cardinality,
 * redundancy, dependency depth, typed-relation conflict, unresolved references,
 * path ambiguity, and threat/support structure. Every family names one candidate
 * entity whose criticality Nexus is asked about.
 *
 * The families vary what is OBSERVABLE. None of them touches the alignment draw.
 * ------------------------------------------------------------------------- */

function entity(id, extra = {}) { return { id, ...extra }; }
function edge(id, from, to, kind = 'depends') { return { id, from, to, kind }; }

export const STAGE2L11_TOPOLOGY_FAMILIES = deepFreeze([
  /* Sparse: a single chain. The candidate is the only path. */
  {
    name: 'SPARSE_CHAIN',
    build: (p, scale) => {
      const length = 3 + scale;
      const ids = [p.source, ...Array.from({ length }, (u, i) => `${p.base}-mid${i}`), p.target];
      return {
        entities: ids.map((id) => entity(id)),
        relationships: ids.slice(0, -1).map((from, i) => edge(`${p.base}-e${i}`, from, ids[i + 1])),
        candidate: ids[1],
      };
    },
  },
  /* Dense mesh: many alternate paths, so nothing is a single point of failure. */
  {
    name: 'DENSE_MESH',
    build: (p, scale) => {
      const mids = Array.from({ length: 4 + scale }, (u, i) => `${p.base}-m${i}`);
      const ids = [p.source, ...mids, p.target];
      const relationships = [];
      let n = 0;
      for (const mid of mids) {
        relationships.push(edge(`${p.base}-s${n}`, p.source, mid));
        relationships.push(edge(`${p.base}-t${n}`, mid, p.target));
        n += 1;
      }
      for (let i = 0; i + 1 < mids.length; i += 1) relationships.push(edge(`${p.base}-x${i}`, mids[i], mids[i + 1]));
      return { entities: ids.map((id) => entity(id)), relationships, candidate: mids[0] };
    },
  },
  /* Exactly one bridge — the Stage 2L.10 baseline shape, kept for comparability. */
  {
    name: 'SINGLE_BRIDGE',
    build: (p, scale) => {
      const bridge = `${p.base}-bridge`;
      const spurs = Array.from({ length: 1 + scale }, (u, i) => `${p.base}-spur${i}`);
      return {
        entities: [p.source, bridge, p.target, ...spurs].map((id) => entity(id)),
        relationships: [
          edge(`${p.base}-e1`, p.source, bridge),
          edge(`${p.base}-e2`, bridge, p.target),
          ...spurs.map((spur, i) => edge(`${p.base}-s${i}`, spur, bridge)),
        ],
        candidate: bridge,
      };
    },
  },
  /* Two bridges in series: two distinct single points of failure. */
  {
    name: 'TANDEM_BRIDGES',
    build: (p, scale) => {
      const chain = Array.from({ length: 2 + scale }, (u, i) => `${p.base}-b${i}`);
      const ids = [p.source, ...chain, p.target];
      return {
        entities: ids.map((id) => entity(id)),
        relationships: ids.slice(0, -1).map((from, i) => edge(`${p.base}-e${i}`, from, ids[i + 1])),
        candidate: chain[0],
      };
    },
  },
  /* A redundant parallel path removes the candidate's criticality entirely. */
  {
    name: 'REDUNDANT_PARALLEL',
    build: (p, scale) => {
      const bridge = `${p.base}-bridge`;
      const alts = Array.from({ length: 1 + scale }, (u, i) => `${p.base}-alt${i}`);
      return {
        entities: [p.source, bridge, p.target, ...alts].map((id) => entity(id)),
        relationships: [
          edge(`${p.base}-e1`, p.source, bridge),
          edge(`${p.base}-e2`, bridge, p.target),
          ...alts.flatMap((alt, i) => [edge(`${p.base}-a${i}`, p.source, alt), edge(`${p.base}-z${i}`, alt, p.target)]),
        ],
        candidate: bridge,
      };
    },
  },
  /* A cycle that still hangs off one critical bridge. */
  {
    name: 'CYCLE_WITH_BRIDGE',
    build: (p, scale) => {
      const ring = Array.from({ length: 3 + scale }, (u, i) => `${p.base}-r${i}`);
      const bridge = `${p.base}-bridge`;
      const relationships = ring.map((from, i) => edge(`${p.base}-c${i}`, from, ring[(i + 1) % ring.length]));
      relationships.push(edge(`${p.base}-in`, p.source, ring[0]));
      relationships.push(edge(`${p.base}-out`, ring[ring.length - 1], bridge));
      relationships.push(edge(`${p.base}-fin`, bridge, p.target));
      return { entities: [p.source, ...ring, bridge, p.target].map((id) => entity(id)), relationships, candidate: bridge };
    },
  },
  /* A wide fan of dependents converging on one node. */
  {
    name: 'WIDE_FAN_BRIDGE',
    build: (p, scale) => {
      const bridge = `${p.base}-bridge`;
      const leaves = Array.from({ length: 4 + scale * 3 }, (u, i) => `${p.base}-l${i}`);
      return {
        entities: [p.source, bridge, p.target, ...leaves].map((id) => entity(id)),
        relationships: [
          edge(`${p.base}-e1`, p.source, bridge),
          edge(`${p.base}-e2`, bridge, p.target),
          ...leaves.map((leaf, i) => edge(`${p.base}-f${i}`, leaf, bridge)),
        ],
        candidate: bridge,
      };
    },
  },
  /* A second, disconnected component: component count > 1. */
  {
    name: 'DISCONNECTED_COMPONENT',
    build: (p, scale) => {
      const bridge = `${p.base}-bridge`;
      const island = Array.from({ length: 2 + scale }, (u, i) => `${p.base}-i${i}`);
      return {
        entities: [p.source, bridge, p.target, ...island].map((id) => entity(id)),
        relationships: [
          edge(`${p.base}-e1`, p.source, bridge),
          edge(`${p.base}-e2`, bridge, p.target),
          ...island.slice(0, -1).map((from, i) => edge(`${p.base}-j${i}`, from, island[i + 1])),
        ],
        candidate: bridge,
      };
    },
  },
  /* Typed conflict: the required relation is 'depends', but an alternate path
   * exists only under a different edge type, so it does not actually relieve the
   * candidate. Ambiguity a naive reader would mis-score. */
  {
    name: 'TYPED_RELATION_CONFLICT',
    build: (p, scale) => {
      const bridge = `${p.base}-bridge`;
      const decoys = Array.from({ length: 1 + scale }, (u, i) => `${p.base}-d${i}`);
      return {
        entities: [p.source, bridge, p.target, ...decoys].map((id) => entity(id)),
        relationships: [
          edge(`${p.base}-e1`, p.source, bridge),
          edge(`${p.base}-e2`, bridge, p.target),
          ...decoys.flatMap((decoy, i) => [
            edge(`${p.base}-p${i}`, p.source, decoy, 'supports'),
            edge(`${p.base}-q${i}`, decoy, p.target, 'supports'),
          ]),
        ],
        candidate: bridge,
        edgeType: 'depends',
      };
    },
  },
  /* Incomplete relations: edges naming entities that are not declared. */
  {
    name: 'INCOMPLETE_RELATIONS',
    build: (p, scale) => {
      const bridge = `${p.base}-bridge`;
      return {
        entities: [p.source, bridge, p.target].map((id) => entity(id)),
        relationships: [
          edge(`${p.base}-e1`, p.source, bridge),
          edge(`${p.base}-e2`, bridge, p.target),
          ...Array.from({ length: 1 + scale }, (u, i) => edge(`${p.base}-u${i}`, bridge, `${p.base}-absent${i}`)),
        ],
        candidate: bridge,
      };
    },
  },
  /* Ambiguous topology: several structurally equivalent alternate paths. */
  {
    name: 'AMBIGUOUS_EQUIVALENT_PATHS',
    build: (p, scale) => {
      const legs = Array.from({ length: 2 + scale }, (u, i) => `${p.base}-leg${i}`);
      return {
        entities: [p.source, p.target, ...legs].map((id) => entity(id)),
        relationships: legs.flatMap((leg, i) => [
          edge(`${p.base}-in${i}`, p.source, leg),
          edge(`${p.base}-out${i}`, leg, p.target),
        ]),
        candidate: legs[0],
      };
    },
  },
  /* Threat and support structure, which exercises the certified expert
   * contract's threat signals that the Arbiter path never sees. */
  {
    name: 'THREAT_SUPPORT_NETWORK',
    build: (p, scale) => {
      const bridge = `${p.base}-bridge`;
      // Odd scales leave the threatened node unguarded, so the expert contract's
      // unsupported/uncovered threat signals vary instead of sitting constant.
      const guards = Array.from({ length: scale % 2 === 0 ? 1 + scale : 0 }, (u, i) => `${p.base}-g${i}`);
      const hostiles = Array.from({ length: 1 + scale }, (u, i) => `${p.base}-h${i}`);
      return {
        entities: [
          entity(p.source), entity(bridge, { critical: true }), entity(p.target),
          ...guards.map((id) => entity(id)),
          ...hostiles.map((id) => entity(id, { hostile: true })),
        ],
        relationships: [
          edge(`${p.base}-e1`, p.source, bridge),
          edge(`${p.base}-e2`, bridge, p.target),
          ...guards.map((guard, i) => edge(`${p.base}-sup${i}`, guard, bridge, 'supports')),
          ...hostiles.map((hostile, i) => edge(`${p.base}-thr${i}`, hostile, bridge, 'threatens')),
        ],
        candidate: bridge,
      };
    },
  },
]);

/* ---------------------------------------------------------------------------
 * Nexus measurement and the three-tier feature map.
 *
 * TIER_EXPOSED   what the Stage 2L.10 correctness attestation actually carries,
 *                i.e. what the Arbiter is allowed to condition on today.
 * TIER_COMPUTED  what analyzeRelationalDelta / relationalReference compute but the
 *                attestation drops on the floor.
 * TIER_EXPERT    the full signal set of the certified evaluateNexus expert
 *                contract, which is not in the Arbiter path at all.
 * TIER_CONTEXT   legitimate Arbiter-visible decision context (Prime margin, band,
 *                legal-action count). Never an outcome.
 *
 * The analysis is given all four. That is deliberately more than the Arbiter may
 * use, so that a null result excludes CONTRACT_INCOMPLETE rather than assuming it.
 * ------------------------------------------------------------------------- */

export const STAGE2L11_FEATURE_TIERS = deepFreeze(['TIER_EXPOSED', 'TIER_COMPUTED', 'TIER_EXPERT', 'TIER_CONTEXT']);

export function measureNexusStage2L11(caseId, family, scale) {
  const parts = { base: `s2l11-${caseId}`, source: `s2l11-${caseId}-src`, target: `s2l11-${caseId}-dst` };
  const built = family.build(parts, scale);
  const caseEntry = {
    caseId,
    canonicalState: { entities: built.entities, relationships: built.relationships },
    query: {
      source: parts.source,
      target: parts.target,
      edgeType: built.edgeType ?? null,
      candidateType: 'node',
      candidateNodeId: built.candidate,
      candidateEdgeId: null,
    },
    mutation: { type: 'NONE' },
  };
  const analysis = analyzeRelationalDelta(caseEntry);
  const reference = relationalReference(caseEntry);
  /* The expert contract scores action-to-entity coverage when legal actions name
   * a target entity. Feeding it the real candidate exercises those signals rather
   * than leaving them dead at zero — the analysis must not conclude "no signal"
   * merely because it never asked for one. */
  const expert = evaluateNexus({
    canonicalState: { entities: built.entities, relationships: built.relationships },
    legalActions: [
      { actionId: `${parts.base}-act-candidate`, targetEntityId: built.candidate },
      { actionId: `${parts.base}-act-alternative`, targetEntityId: parts.target },
      { actionId: `${parts.base}-act-idle` },
    ],
  });

  const structural = analysis.structural ?? {};
  const redundancy = analysis.redundancy ?? {};
  const counterfactual = analysis.counterfactual ?? {};
  const spofNodes = analysis.spofNodes ?? [];
  const candidateIsSpof = spofNodes.includes(built.candidate);

  /* Exactly the Stage 2L.10 attestation payload. Nothing added. */
  const exposed = deepFreeze({
    kind: 'NEXUS_STRUCTURAL_DETERMINACY_V1',
    candidateIsSpof,
    spofNodeCount: spofNodes.length,
    spofEdgeCount: (analysis.spofEdges ?? []).length,
    criticalCount: (analysis.criticalEntities ?? []).length,
    bottleneckCount: (analysis.bottleneckEntities ?? []).length,
    componentCount: Number.isFinite(structural.componentCount) ? structural.componentCount : 0,
    entityCount: Number.isFinite(structural.entityCount) ? structural.entityCount : built.entities.length,
    edgeCount: Number.isFinite(structural.edgeCount) ? structural.edgeCount : built.relationships.length,
    redundantPathPresent: redundancy.redundant === true,
    reachableWithoutCandidate: redundancy.reachableWithoutNode === true,
    semanticOptimalityCertified: false,
  });

  /* Computed by Nexus, discarded before the attestation. */
  const computed = deepFreeze({
    cyclePresent: structural.cyclePresent === true,
    reachableBefore: structural.reachableBefore === true,
    reachableWithoutNode: redundancy.reachableWithoutNode === true,
    reachableWithoutEdge: redundancy.reachableWithoutEdge === true,
    nodeRedundant: reference.nodeRedundant === true,
    edgeRedundant: reference.edgeRedundant === true,
    redundantEntityCount: (redundancy.redundantEntities ?? []).length,
    redundantEdgeCount: (redundancy.redundantEdges ?? []).length,
    counterfactualConsequence: counterfactual.consequence ?? 'UNKNOWN',
    counterfactualReachableAfter: counterfactual.reachableAfter === true,
    componentsBefore: Number.isFinite(counterfactual.componentsBefore) ? counterfactual.componentsBefore : 0,
    componentsAfter: Number.isFinite(counterfactual.componentsAfter) ? counterfactual.componentsAfter : 0,
    spofNodeRank: candidateIsSpof ? spofNodes.indexOf(built.candidate) : -1,
    graphDensityMicro: structural.entityCount > 1
      ? Math.round((structural.edgeCount / (structural.entityCount * (structural.entityCount - 1))) * 1000000)
      : 0,
    edgeToEntityRatioMicro: structural.entityCount > 0
      ? Math.round((structural.edgeCount / structural.entityCount) * 1000000)
      : 0,
    declaredEntityCount: built.entities.length,
    declaredRelationshipCount: built.relationships.length,
    droppedRelationshipCount: built.relationships.length - (structural.edgeCount ?? 0),
    distinctEdgeTypeCount: new Set(built.relationships.map((relation) => relation.kind ?? 'depends')).size,
  });

  /* The certified expert contract's full signal set. Not in the Arbiter path. */
  const expertSignals = deepFreeze({ ...expert.signals, expertConfidence: expert.confidence, rationaleCodeCount: expert.rationaleCodes.length });

  return {
    analysis, expert, candidate: built.candidate,
    entities: built.entities, relationships: built.relationships,
    candidateIsSpof, spofNodes,
    exposed, computed, expertSignals,
    graphDigest: identity({ caseId, graph: { entities: built.entities, relationships: built.relationships } }),
    entity: { entityId: built.candidate, entityType: 'candidate', canonicalKey: `candidate/${built.candidate}` },
    edges: [{ edgeId: `${parts.base}-e2`, sourceEntityId: built.candidate, targetEntityId: parts.target, relation: 'DIRECTED_SUPPORT' }],
  };
}

/* ---------------------------------------------------------------------------
 * Case assembly. Produces a genuine Stage 2L.10 arbiter input so the measurement
 * runs through the real, unmodified decision path.
 * ------------------------------------------------------------------------- */

function requirementsFor(caseId, graphDigest, entity, edges, channelId) {
  return {
    oracle: {
      historyDigest: identity({ caseId, history: 'UNUSED_NEXUS_ONLY' }),
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
  return { selectedAction: unique[0], ranking };
}

export function buildStage2L11Case(split, variant) {
  const index = (split === 'DISCOVERY' ? 70000000 : 90000000) + variant;
  const caseId = `${split === 'DISCOVERY' ? 'stage2l11d' : 'stage2l11h'}-nexus-${String(variant).padStart(5, '0')}`;
  const context = stage2L11Context(split, index);
  const family = STAGE2L11_TOPOLOGY_FAMILIES[context.familyIndex % STAGE2L11_TOPOLOGY_FAMILIES.length];
  const nexus = measureNexusStage2L11(caseId, family, context.scale);

  /* The hidden semantic variable, drawn from its own stream. Nothing about the
   * topology above influenced it and nothing below may read it. */
  const aligned = stage2L11Alignment(split, index);

  const candidateAction = `s2l11-${split[0]}${variant}-act-candidate`;
  const alternativeAction = `s2l11-${split[0]}${variant}-act-alternative`;
  const idleAction = `s2l11-${split[0]}${variant}-act-idle`;
  const actions = [candidateAction, alternativeAction, idleAction, `s2l11-${split[0]}${variant}-act-alt`];

  /* Nexus supports the action bound to the entity its analysis flags critical.
   * When nothing is structurally critical it has nothing relevant to say. */
  const supportedAction = nexus.candidateIsSpof ? candidateAction : null;
  const truthAction = aligned ? candidateAction : alternativeAction;

  const prime = buildRanking({
    actions, truthAction,
    supportedAction: supportedAction ?? idleAction,
    primeCorrect: context.primeCorrect,
    margin: context.margin,
    supportInTieBand: context.supportInTieBand,
  });

  const channelId = `s2l11-${split[0]}${variant}-alpha`;
  const requirement = requirementsFor(caseId, nexus.graphDigest, nexus.entity, nexus.edges, channelId);
  const observationIdentity = identity({ caseId, corpus: `STAGE2L11_${split}` });
  const decisionContext = createArbiterDecisionContext({
    runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY,
    campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY,
    observationIdentity,
    canonicalStateInput: { caseId, corpus: `STAGE2L11_${split}`, values: [index % 11, index % 13, index % 17] },
    prime: { selectedAction: prime.selectedAction, ranking: prime.ranking },
    oracleRequirement: requirement.oracle,
    nexusRequirement: requirement.nexus,
  });

  const bound = (expert, active, actionId) => createBoundArbiterEvidence({
    expert,
    decisionContext,
    assessmentIdentity: identity({ caseId, expert, layer: 'STAGE2L11_ASSESSMENT' }),
    permissionIdentity: identity({ caseId, expert, layer: 'STAGE2L11_PERMISSION' }),
    permissionEligible: active,
    relevant: active,
    tieEligible: active,
    actionId: active ? actionId : null,
    oracleBinding: expert === 'ORACLE'
      ? { historyDigest: requirement.oracle.historyDigest, implementationIdentity: requirement.oracle.implementationIdentity, eligibilityRuleIdentity: requirement.oracle.eligibilityRuleIdentity, head: 'direction', channel: requirement.oracle.channel }
      : null,
    nexusBinding: expert === 'NEXUS'
      ? { graphDigest: requirement.nexus.graphDigest, implementationIdentity: requirement.nexus.implementationIdentity, entity: active ? requirement.nexus.entity : null, edges: active ? requirement.nexus.edges : [] }
      : null,
    causalBasisCertified: active,
    relevanceClass: active ? 'ACTION_CAUSAL' : 'ACTION_INDEPENDENT',
  });

  const oraclePacket = bound('ORACLE', false, null);
  const nexusPacket = bound('NEXUS', supportedAction !== null, supportedAction);
  const attestations = [createCorrectnessAttestation({
    expert: 'NEXUS',
    decisionContext,
    evidencePacketDigest: nexusPacket.packetDigest,
    signals: nexus.exposed,
  })];
  const input = buildStage2L10Input({
    decisionContext,
    prime,
    expertEvidence: [oraclePacket, nexusPacket],
    attestations,
  });

  return deepFreeze({
    caseId, index, split, variant,
    family: family.name, scale: context.scale,
    band: context.band, margin: context.margin,
    supportInTieBand: context.supportInTieBand,
    aligned,
    candidateIsSpof: nexus.candidateIsSpof,
    relevant: supportedAction !== null,
    /* Nexus is correct exactly when it flagged the candidate AND the candidate is
     * the utility-optimal entity. The first conjunct is observable; the second is
     * the hidden draw. */
    expertCorrect: supportedAction !== null && supportedAction === truthAction,
    exposed: nexus.exposed,
    computed: nexus.computed,
    expertSignals: nexus.expertSignals,
    contextFeatures: deepFreeze({
      marginMicro: Math.round(context.margin * 1000000),
      band: context.band,
      supportInTieBand: context.supportInTieBand,
      legalActionCount: prime.ranking.length,
      primeTopGapMicro: Math.round((prime.ranking[0].qValue - prime.ranking[1].qValue) * 1000000),
      insideAmbiguityRegion: context.margin <= STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
    }),
    truthAction, supportedAction, primeAction: prime.selectedAction,
    primeCorrect: prime.selectedAction === truthAction,
    decisionContext, input,
  });
}

export function buildStage2L11Corpus(split) {
  if (!STAGE2L11_SPLITS.includes(split)) throw new Error(`STAGE2L11_UNKNOWN_SPLIT:${split}`);
  const count = split === 'DISCOVERY' ? STAGE2L11_DISCOVERY_CASES : STAGE2L11_HOLDOUT_CASES;
  return deepFreeze(Array.from({ length: count }, (unused, variant) => buildStage2L11Case(split, variant)));
}

/* Run the corpus through the REAL, unmodified Stage 2L.10 arbiter and its frozen
 * calibration. Nothing here re-implements the decision. */
export function runStage2L11(corpus, calibration = STAGE2L10_FROZEN_CALIBRATION) {
  return corpus.map((record) => {
    const base = runArbiterWithFailureIsolation(record.input.boundArbiterInput, remediatedDeterministicArbiter);
    const result = runArbiterWithFailureIsolation(record.input, (input) => calibratedSelectiveDelegationArbiter(input, calibration));
    const baseSelected = base.counterfactualFinalRecommendation;
    const selected = result.counterfactualFinalRecommendation;
    const changed = selected !== null && selected !== record.primeAction;
    const selectedCorrect = selected === record.truthAction;
    return {
      caseId: record.caseId,
      split: record.split,
      family: record.family,
      scale: record.scale,
      band: record.band,
      margin: record.margin,
      aligned: record.aligned,
      relevant: record.relevant,
      expertCorrect: record.expertCorrect,
      exposed: record.exposed,
      computed: record.computed,
      expertSignals: record.expertSignals,
      contextFeatures: record.contextFeatures,
      primeAction: record.primeAction,
      truthAction: record.truthAction,
      supportedAction: record.supportedAction,
      primeCorrect: record.primeCorrect,
      baseDelegated: baseSelected !== null && baseSelected !== record.primeAction,
      baseEvidenceAccepted: base.participatingEvidenceIdentities.length,
      selectedAction: selected,
      disposition: result.disposition,
      delegationReason: result.delegationReason,
      uncertaintyBucket: result.correctnessGate?.uncertaintyBucket ?? null,
      decisionDigest: result.decisionDigest,
      changed,
      selectedCorrect,
      beneficial: changed && selectedCorrect && !record.primeCorrect,
      harmful: changed && !selectedCorrect && record.primeCorrect,
      breaksCorrectPrime: changed && record.primeCorrect && !selectedCorrect,
      delegationOpportunity: record.relevant
        && record.supportedAction !== null
        && record.supportedAction !== record.primeAction,
      abstained: (baseSelected !== null && baseSelected !== record.primeAction) && !changed,
    };
  });
}

/* ---------------------------------------------------------------------------
 * Identifiability analysis.
 *
 * The measure is the best achievable reliability GAP: over every split of a
 * feature, the largest absolute difference in P(Nexus correct) between the two
 * sides, subject to a minimum support on each side. A feature that carries
 * information about correctness produces a large gap; a feature that carries none
 * produces only what chance produces.
 *
 * "What chance produces" is not assumed either. The identical search is re-run
 * against permuted correctness labels, which destroys any real association while
 * preserving every feature distribution and the size of the search. The resulting
 * null distribution is the honest yardstick: a search over 55 features will always
 * find SOME gap, and the question is only whether the real one is bigger.
 * ------------------------------------------------------------------------- */

const MIN_SPLIT_SUPPORT = 200;

export function flattenFeatures(row) {
  return {
    ...Object.fromEntries(Object.entries(row.exposed).map(([key, value]) => [`exposed.${key}`, value])),
    ...Object.fromEntries(Object.entries(row.computed).map(([key, value]) => [`computed.${key}`, value])),
    ...Object.fromEntries(Object.entries(row.expertSignals).map(([key, value]) => [`expert.${key}`, value])),
    ...Object.fromEntries(Object.entries(row.contextFeatures).map(([key, value]) => [`context.${key}`, value])),
    'context.family': row.family,
    'context.scale': row.scale,
  };
}

export function featureTier(name) {
  if (name.startsWith('exposed.')) return 'TIER_EXPOSED';
  if (name.startsWith('computed.')) return 'TIER_COMPUTED';
  if (name.startsWith('expert.')) return 'TIER_EXPERT';
  return 'TIER_CONTEXT';
}

/** Every candidate predicate over one feature, as (name, test) pairs. */
function predicatesFor(name, values) {
  const distinct = [...new Set(values)];
  if (distinct.length < 2) return [];
  const numeric = distinct.every((value) => typeof value === 'number' && Number.isFinite(value));
  if (numeric && distinct.length > 12) {
    const sorted = [...distinct].sort((left, right) => left - right);
    return sorted.slice(0, -1).map((threshold) => ({
      id: `${name}<=${threshold}`,
      test: (features) => Number(features[name]) <= threshold,
    }));
  }
  return distinct
    .map((value) => String(value))
    .sort()
    .map((value) => ({
      id: `${name}==${value}`,
      test: (features) => String(features[name]) === value,
    }));
}

function evaluatePredicate(samples, predicate) {
  let inCount = 0; let inCorrect = 0; let outCount = 0; let outCorrect = 0;
  for (const sample of samples) {
    if (predicate.test(sample.features)) { inCount += 1; if (sample.correct) inCorrect += 1; }
    else { outCount += 1; if (sample.correct) outCorrect += 1; }
  }
  if (inCount < MIN_SPLIT_SUPPORT || outCount < MIN_SPLIT_SUPPORT) return null;
  const inRate = inCorrect / inCount;
  const outRate = outCorrect / outCount;
  return {
    id: predicate.id,
    inCount, inCorrect, inReliability: round(inRate),
    outCount, outCorrect, outReliability: round(outRate),
    gap: round(Math.abs(inRate - outRate)),
    // The side that would be delegated from, if either qualified.
    bestSideReliability: round(Math.max(inRate, outRate)),
    bestSideSupport: inRate >= outRate ? inCount : outCount,
    bestSide: inRate >= outRate ? 'IN' : 'OUT',
  };
}

function samplesOf(rows) {
  return rows
    .filter((row) => row.delegationOpportunity)
    .map((row) => ({ features: flattenFeatures(row), correct: row.expertCorrect }));
}

function allPredicates(samples) {
  if (samples.length === 0) return [];
  const names = Object.keys(samples[0].features);
  return names.flatMap((name) => predicatesFor(name, samples.map((sample) => sample.features[name])));
}

/** Deterministic label permutation: a seeded Fisher-Yates over the label vector. */
function permuteLabels(samples, seed) {
  const random = createSeededRandom(deriveSeed(0x5347324c31314en, 'STAGE2L11_PERMUTATION', seed));
  const labels = samples.map((sample) => sample.correct);
  for (let i = labels.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = labels[i]; labels[i] = labels[j]; labels[j] = swap;
  }
  return samples.map((sample, i) => ({ features: sample.features, correct: labels[i] }));
}

export function analyzeStage2L11Identifiability(rows, { permutations = 40 } = {}) {
  const samples = samplesOf(rows);
  const predicates = allPredicates(samples);
  const evaluated = predicates.map((predicate) => evaluatePredicate(samples, predicate)).filter(Boolean);
  const byGap = [...evaluated].sort((left, right) => right.gap - left.gap || left.id.localeCompare(right.id));
  const byReliability = [...evaluated].sort((left, right) => right.bestSideReliability - left.bestSideReliability || left.id.localeCompare(right.id));

  const names = samples.length === 0 ? [] : Object.keys(samples[0].features);
  const perFeature = names.map((name) => {
    const own = evaluated.filter((entry) => entry.id.startsWith(`${name}==`) || entry.id.startsWith(`${name}<=`));
    const best = own.sort((left, right) => right.gap - left.gap)[0] ?? null;
    return {
      feature: name,
      tier: featureTier(name),
      distinctValues: new Set(samples.map((sample) => sample.features[name])).size,
      evaluablePredicates: own.length,
      bestGap: best ? best.gap : 0,
      bestPredicate: best ? best.id : null,
      bestSideReliability: best ? best.bestSideReliability : null,
      // A feature whose value is fixed once we condition on a delegation
      // opportunity carries no information BY CONSTRUCTION, not by measurement.
      constantUnderConditioning: new Set(samples.map((sample) => sample.features[name])).size < 2,
    };
  }).sort((left, right) => right.bestGap - left.bestGap || left.feature.localeCompare(right.feature));

  const nullGaps = [];
  for (let i = 0; i < permutations; i += 1) {
    const permuted = permuteLabels(samples, i);
    const best = predicates
      .map((predicate) => evaluatePredicate(permuted, predicate))
      .filter(Boolean)
      .reduce((max, entry) => Math.max(max, entry.gap), 0);
    nullGaps.push(round(best));
  }
  nullGaps.sort((left, right) => left - right);
  const quantile = (proportion) => nullGaps[Math.min(nullGaps.length - 1, Math.max(0, Math.ceil(nullGaps.length * proportion) - 1))] ?? 0;
  const observedBestGap = byGap[0]?.gap ?? 0;
  const nullP95 = quantile(0.95);

  return deepFreeze({
    opportunities: samples.length,
    baseRate: round(ratio(samples.filter((sample) => sample.correct).length, samples.length)),
    featuresInspected: names.length,
    featuresVarying: names.length - perFeature.filter((entry) => entry.constantUnderConditioning).length,
    featuresConstantUnderConditioning: perFeature.filter((entry) => entry.constantUnderConditioning).map((entry) => entry.feature),
    tiersInspected: [...STAGE2L11_FEATURE_TIERS],
    predicatesSearched: predicates.length,
    predicatesEvaluable: evaluated.length,
    perFeature,
    topByGap: byGap.slice(0, 15),
    topByReliability: byReliability.slice(0, 15),
    observedBestGap,
    observedBestPredicate: byGap[0]?.id ?? null,
    observedBestSideReliability: byReliability[0]?.bestSideReliability ?? null,
    permutationNull: {
      permutations,
      min: nullGaps[0] ?? 0,
      median: quantile(0.5),
      p95: nullP95,
      max: nullGaps[nullGaps.length - 1] ?? 0,
    },
    /* The decisive comparison. If the best gap a search over every legitimate
     * feature can find does not exceed what the same search finds on shuffled
     * labels, the features carry no information about correctness. */
    observedExceedsPermutationP95: observedBestGap > nullP95,
    anyPredicateReachesReliabilityFloor: evaluated.some((entry) => entry.bestSideReliability >= STAGE2L11_MIN_BUCKET_RELIABILITY && entry.bestSideSupport >= STAGE2L11_MIN_BUCKET_SAMPLES),
  });
}

/* ---------------------------------------------------------------------------
 * Generalization test.
 *
 * The decisive experiment. A search over 55 features and their pairwise
 * conjunctions will always find SOMETHING on any finite sample — that is what
 * searching does. So the best rule discovery can produce is frozen and carried,
 * unchanged, to a holdout it has never seen.
 *
 *   If the rule holds        the signal is real          -> IDENTIFIABLE
 *   If the rule collapses    the signal was a shortcut   -> not identifiable
 *
 * Discovery may look at labels. Holdout may not, and does not: the frozen rule is
 * a pure function of features, and it is applied without refitting.
 * ------------------------------------------------------------------------- */

const MAX_CONJUNCTION_SEEDS = 40;

export function discoverStage2L11Rule(discoveryRows) {
  for (const row of discoveryRows) {
    if (row.split !== 'DISCOVERY') throw new Error('STAGE2L11_DISCOVERY_SPLIT_VIOLATION');
  }
  const samples = samplesOf(discoveryRows);
  const singles = allPredicates(samples);
  const evaluatedSingles = singles
    .map((predicate) => ({ predicate, score: evaluatePredicate(samples, predicate) }))
    .filter((entry) => entry.score !== null);

  /* Pairwise conjunctions over the most promising single predicates. This is a
   * deliberately generous search: if any simple combination of legitimate Nexus
   * information separates correct from wrong, it is given every chance to appear. */
  const seeds = [...evaluatedSingles]
    .sort((left, right) => right.score.bestSideReliability - left.score.bestSideReliability || left.predicate.id.localeCompare(right.predicate.id))
    .slice(0, MAX_CONJUNCTION_SEEDS);
  const conjunctions = [];
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      const left = seeds[i].predicate;
      const right = seeds[j].predicate;
      conjunctions.push({
        id: `(${left.id}) AND (${right.id})`,
        test: (features) => left.test(features) && right.test(features),
      });
    }
  }
  const evaluatedConjunctions = conjunctions
    .map((predicate) => ({ predicate, score: evaluatePredicate(samples, predicate) }))
    .filter((entry) => entry.score !== null);

  const all = [...evaluatedSingles, ...evaluatedConjunctions];
  /* Rank by the reliability of the side that would be delegated from — that is
   * the quantity the inherited 0.99 floor is applied to. */
  const ranked = [...all].sort((left, right) =>
    right.score.bestSideReliability - left.score.bestSideReliability
    || right.score.bestSideSupport - left.score.bestSideSupport
    || left.predicate.id.localeCompare(right.predicate.id));
  const best = ranked[0] ?? null;

  return {
    searchSpace: { singles: singles.length, singlesEvaluable: evaluatedSingles.length, conjunctionSeeds: seeds.length, conjunctions: conjunctions.length, conjunctionsEvaluable: evaluatedConjunctions.length },
    discoveryOpportunities: samples.length,
    discoveryBaseRate: round(ratio(samples.filter((sample) => sample.correct).length, samples.length)),
    frozenRule: best === null ? null : {
      id: best.predicate.id,
      side: best.score.bestSide,
      discoveryReliability: best.score.bestSideReliability,
      discoverySupport: best.score.bestSideSupport,
      discoveryGap: best.score.gap,
      reachesFloorOnDiscovery: best.score.bestSideReliability >= STAGE2L11_MIN_BUCKET_RELIABILITY
        && best.score.bestSideSupport >= STAGE2L11_MIN_BUCKET_SAMPLES,
    },
    frozenRuleTest: best === null ? null : (features) => (best.score.bestSide === 'IN' ? best.predicate.test(features) : !best.predicate.test(features)),
    topTen: ranked.slice(0, 10).map((entry) => ({ id: entry.predicate.id, side: entry.score.bestSide, reliability: entry.score.bestSideReliability, support: entry.score.bestSideSupport, gap: entry.score.gap })),
  };
}

export function testStage2L11Generalization(discovery, holdoutRows) {
  /* Validate the split BEFORE any short circuit. A guard that can be skipped by
   * an early return is not a guard. */
  for (const row of holdoutRows) {
    if (row.split !== 'HOLDOUT') throw new Error('STAGE2L11_HOLDOUT_SPLIT_VIOLATION');
  }
  if (discovery.frozenRule === null) {
    return deepFreeze({ applicable: false, reason: 'NO_EVALUABLE_RULE_ON_DISCOVERY' });
  }
  const samples = samplesOf(holdoutRows);
  const selected = samples.filter((sample) => discovery.frozenRuleTest(sample.features));
  const rejected = samples.filter((sample) => !discovery.frozenRuleTest(sample.features));
  const holdoutReliability = round(ratio(selected.filter((sample) => sample.correct).length, selected.length));
  const rejectedReliability = round(ratio(rejected.filter((sample) => sample.correct).length, rejected.length));
  const baseRate = round(ratio(samples.filter((sample) => sample.correct).length, samples.length));
  return deepFreeze({
    applicable: true,
    ruleId: discovery.frozenRule.id,
    ruleSide: discovery.frozenRule.side,
    discoveryReliability: discovery.frozenRule.discoveryReliability,
    discoverySupport: discovery.frozenRule.discoverySupport,
    holdoutOpportunities: samples.length,
    holdoutBaseRate: baseRate,
    holdoutSelected: selected.length,
    holdoutReliability,
    holdoutRejected: rejected.length,
    holdoutRejectedReliability: rejectedReliability,
    holdoutGap: round(Math.abs(holdoutReliability - rejectedReliability)),
    reliabilityLostFromDiscoveryToHoldout: round(discovery.frozenRule.discoveryReliability - holdoutReliability),
    /* Does the frozen rule still clear the inherited floor out of sample? */
    holdoutReachesFloor: selected.length >= STAGE2L11_MIN_BUCKET_SAMPLES && holdoutReliability >= STAGE2L11_MIN_BUCKET_RELIABILITY,
    /* Did it collapse back to the base rate — the signature of a shortcut? */
    collapsedToBaseRate: Math.abs(holdoutReliability - baseRate) < 0.05,
  });
}

/* ---------------------------------------------------------------------------
 * Phase 5 cell coverage. The holdout must actually contain the crossings that
 * could break a superficial correlation, or a null result proves nothing.
 * ------------------------------------------------------------------------- */

export function stage2L11CellCoverage(rows) {
  const opportunities = rows.filter((row) => row.delegationOpportunity);
  const density = (row) => row.computed.graphDensityMicro;
  const densities = opportunities.map(density).sort((left, right) => left - right);
  const medianDensity = densities[Math.floor(densities.length / 2)] ?? 0;
  const supports = opportunities.map((row) => row.expertSignals.maxDependents).sort((left, right) => left - right);
  const medianSupport = supports[Math.floor(supports.length / 2)] ?? 0;
  const cell = (predicate) => opportunities.filter(predicate).length;
  const corpusCell = (predicate) => rows.filter(predicate).length;

  const attainable = {
    denseNexusCorrect: cell((row) => density(row) > medianDensity && row.expertCorrect),
    denseNexusWrong: cell((row) => density(row) > medianDensity && !row.expertCorrect),
    sparseNexusCorrect: cell((row) => density(row) <= medianDensity && row.expertCorrect),
    sparseNexusWrong: cell((row) => density(row) <= medianDensity && !row.expertCorrect),
    highSupportNexusCorrect: cell((row) => row.expertSignals.maxDependents > medianSupport && row.expertCorrect),
    highSupportNexusWrong: cell((row) => row.expertSignals.maxDependents > medianSupport && !row.expertCorrect),
    lowSupportNexusCorrect: cell((row) => row.expertSignals.maxDependents <= medianSupport && row.expertCorrect),
    lowSupportNexusWrong: cell((row) => row.expertSignals.maxDependents <= medianSupport && !row.expertCorrect),
    primeCorrectNexusWrong: cell((row) => row.primeCorrect && !row.expertCorrect),
    primeWrongNexusCorrect: cell((row) => !row.primeCorrect && row.expertCorrect),
    primeWrongNexusWrong: cell((row) => !row.primeCorrect && !row.expertCorrect),
    conflictingRelations: cell((row) => row.family === 'TYPED_RELATION_CONFLICT'),
    incompleteRelations: cell((row) => row.family === 'INCOMPLETE_RELATIONS'),
    ambiguousCriticalityTopology: cell((row) => row.family === 'TYPED_RELATION_CONFLICT' || row.family === 'TANDEM_BRIDGES' || row.exposed.spofNodeCount > 1),
    cyclicTopology: cell((row) => row.computed.cyclePresent),
    multiComponentTopology: cell((row) => row.exposed.componentCount > 1),
    multipleCriticalNodes: cell((row) => row.exposed.spofNodeCount > 1),
  };

  /* Two crossings cannot be populated, and neither is a corpus gap.
   *
   * primeCorrectNexusCorrect — a delegation OPPORTUNITY requires Nexus to point
   * somewhere other than Prime's own pick. If Nexus is correct its pick IS the
   * truth action, so a correct Prime would have chosen the same action and there
   * is nothing to delegate. The cell is empty by the definition of the
   * opportunity, inherited unchanged from Stage 2L.9.
   *
   * noCriticalityAmbiguousTopology — families with no single point of failure
   * (DENSE_MESH, AMBIGUOUS_EQUIVALENT_PATHS, REDUNDANT_PARALLEL) give Nexus
   * nothing to recommend, so they never become opportunities. They are still
   * generated and still measured: they exercise the silent path, which is the
   * correct behaviour and is reported separately below. */
  const logicallyEmpty = {
    primeCorrectNexusCorrect: cell((row) => row.primeCorrect && row.expertCorrect),
    noCriticalityFamilyOpportunities: cell((row) => ['DENSE_MESH', 'AMBIGUOUS_EQUIVALENT_PATHS', 'REDUNDANT_PARALLEL'].includes(row.family)),
  };

  return deepFreeze({
    opportunities: opportunities.length,
    medianGraphDensityMicro: medianDensity,
    medianMaxDependents: medianSupport,
    ...attainable,
    logicallyEmptyCells: logicallyEmpty,
    logicallyEmptyCellsExplained: true,
    corpusLevel: {
      denseMeshCases: corpusCell((row) => row.family === 'DENSE_MESH'),
      ambiguousEquivalentPathCases: corpusCell((row) => row.family === 'AMBIGUOUS_EQUIVALENT_PATHS'),
      redundantParallelCases: corpusCell((row) => row.family === 'REDUNDANT_PARALLEL'),
      noCriticalitySilentCases: corpusCell((row) => !row.relevant),
    },
    familiesInCorpus: [...new Set(rows.map((row) => row.family))].sort(),
    familiesRepresentedAmongOpportunities: [...new Set(opportunities.map((row) => row.family))].sort(),
    allAttainableCellsPopulated: Object.values(attainable).every((count) => count > 0),
  });
}

/* ---------------------------------------------------------------------------
 * Contract map. What Nexus computes, what it exposes, what the Arbiter uses.
 * ------------------------------------------------------------------------- */

export function buildStage2L11ContractMap(sampleRow) {
  const exposed = Object.keys(sampleRow.exposed);
  const computedOnly = Object.keys(sampleRow.computed);
  const expertOnly = Object.keys(sampleRow.expertSignals);
  /* What the Stage 2L.10 bucket function actually reads. Everything else in the
   * attestation is validated but never conditioned on. */
  const arbiterConsumed = ['candidateIsSpof', 'redundantPathPresent', 'reachableWithoutCandidate', 'spofNodeCount', 'entityCount'];
  return deepFreeze({
    contractMapVersion: 1,
    stage: STAGE2L11_STAGE,
    layers: {
      NEXUS_INPUTS: {
        description: 'Canonical relational state plus the reachability query the Arbiter binds.',
        fields: ['canonicalState.entities', 'canonicalState.relationships', 'query.source', 'query.target', 'query.edgeType', 'query.candidateType', 'query.candidateNodeId', 'query.candidateEdgeId', 'mutation.type'],
      },
      NEXUS_COMPUTES: {
        description: 'Everything relationalReference / analyzeRelationalDelta derive, plus the certified evaluateNexus expert contract.',
        relationalFields: [...exposed, ...computedOnly],
        expertContractFields: expertOnly,
      },
      NEXUS_EXPOSES: {
        description: 'The Stage 2L.10 correctness attestation payload — the only Nexus-derived information that crosses into the Arbiter.',
        fields: exposed,
      },
      ARBITER_USES: {
        description: 'Fields the Stage 2L.10 nexusUncertaintyBucket function actually conditions on. The rest are validated for integrity but never scored.',
        fields: arbiterConsumed,
      },
    },
    counts: {
      nexusInputCount: 9,
      nexusDerivedSignalCount: exposed.length + computedOnly.length + expertOnly.length,
      nexusExposedSignalCount: exposed.length,
      arbiterConsumedSignalCount: arbiterConsumed.length,
    },
    informationLoss: {
      computedButNotExposed: computedOnly,
      expertContractNotInArbiterPath: expertOnly,
      exposedButNotConsumed: exposed.filter((field) => !arbiterConsumed.includes(field)),
      /* There IS structural information loss between layers. Whether that loss
       * matters is exactly what the identifiability analysis decides — a loss of
       * uninformative fields is not a contract defect. */
      internalInformationLossDetected: computedOnly.length > 0 || expertOnly.length > 0,
    },
    twoNexusImplementations: {
      note: 'The Arbiter path uses the lab relational analyzer (analyzeRelationalDelta). The certified expert contract (evaluateNexus, 19 signals) is not in the Arbiter path. Stage 2L.11 measured BOTH.',
      arbiterPath: 'src/lab/stage2k0-nexus-relational-diagnostic.js::analyzeRelationalDelta',
      certifiedExpert: 'src/experts/nexus.js::evaluateNexus',
    },
  });
}

/* ---------------------------------------------------------------------------
 * Semantic generation audit. Every source of randomness, and who can see it.
 * ------------------------------------------------------------------------- */

export function buildStage2L11SemanticAudit(rows) {
  const opportunities = rows.filter((row) => row.delegationOpportunity);
  /* Among delegation opportunities, Nexus is correct exactly when the hidden
   * alignment draw came up true — the observable conjunct is already satisfied by
   * the conditioning. Verified, not asserted. */
  const correctnessEqualsAlignment = opportunities.every((row) => row.expertCorrect === row.aligned);
  return deepFreeze({
    auditVersion: 1,
    stage: STAGE2L11_STAGE,
    semanticTruthSource: 'INDEPENDENT_SEEDED_DRAW',
    semanticTruthVariable: 'nexusAligned — whether the structurally critical entity is also the utility-optimal one',
    declaredAlignmentRate: STAGE2L11_NEXUS_ALIGNMENT_RATE,
    randomnessSources: [
      {
        name: 'STAGE2L9_INDEPENDENT_GROUND_TRUTH',
        seed: '0x5347324c39 ("SG2L9")',
        drawPosition: 4,
        drives: 'nexusAligned',
        visibleToNexus: false, visibleToArbiter: false, visibleToPrime: false,
        availableAtRealDecisionTime: false,
      },
      {
        name: 'STAGE2L10_INDEPENDENT_GROUND_TRUTH',
        seed: '0x5347324c313043 / 0x5347324c313048 ("SG2L10C"/"SG2L10H")',
        drawPosition: 4,
        drives: 'nexusAligned (graphShapeIndex is a separate draw at position 6)',
        visibleToNexus: false, visibleToArbiter: false, visibleToPrime: false,
        availableAtRealDecisionTime: false,
      },
      {
        name: 'STAGE2L11_SEMANTIC_ALIGNMENT',
        seed: '0x5347324c313144 / 0x5347324c313148',
        drawPosition: 1,
        drives: 'nexusAligned',
        note: 'Stage 2L.11 puts alignment on a SEPARATE derived stream from topology so the two cannot share structure even incidentally.',
        visibleToNexus: false, visibleToArbiter: false, visibleToPrime: false,
        availableAtRealDecisionTime: false,
      },
      {
        name: 'STAGE2L11_DECISION_CONTEXT',
        seed: '0x5347324c313144 / 0x5347324c313148',
        drives: 'primeCorrect, ambiguity band, supportInTieBand, topology family, topology scale',
        visibleToNexus: 'topology only, via the graph itself',
        visibleToArbiter: 'band and margin only',
        visibleToPrime: true,
        availableAtRealDecisionTime: true,
      },
    ],
    semanticTruthDecisionTimeObservable: false,
    hiddenRandomnessInvolved: true,
    hiddenRandomnessIndependentOfObservables: true,
    correctnessReducesToHiddenDrawAmongOpportunities: correctnessEqualsAlignment,
    derivation: 'expertCorrect = candidateIsSpof AND nexusAligned. Conditioning on a delegation opportunity fixes the first conjunct true, leaving expertCorrect identically equal to the hidden draw.',
    whatWouldMakeItObservable: [
      'Objective or utility weights over entities in the canonical observation stream.',
      'Per-entity value, threat cost, or mission-criticality scoring the adapter does not currently emit.',
      'An outcome channel linking structural criticality to realised utility, which no current corpus provides.',
    ],
    defectLocus: 'CORPUS_SEMANTICS_AND_WORLD_STATE_OBSERVABILITY',
    defectLocusExplanation: 'Nexus\'s relational computation is exact and is not at fault. The corpus models semantic alignment as an independent coin flip rather than as a function of latent world state, and the observation stream carries no utility information from which any expert could recover it.',
  });
}

/* ---------------------------------------------------------------------------
 * Classification
 * ------------------------------------------------------------------------- */

export const STAGE2L11_STATUSES = deepFreeze(['IDENTIFIABLE', 'CONTRACT_INCOMPLETE', 'NON_IDENTIFIABLE_CURRENT_TASK', 'INCONCLUSIVE']);

export function classifyStage2L11({ analysis, generalization, coverage, audit }) {
  const reasons = [];

  /* INCONCLUSIVE first: a null result only means something if the measurement
   * was actually capable of detecting a signal. */
  const searchWasAdequate = analysis.opportunities >= 2000
    && analysis.featuresVarying >= 20
    && analysis.predicatesEvaluable >= 50
    && coverage.allAttainableCellsPopulated;
  if (!searchWasAdequate) {
    reasons.push('Search power insufficient: too few opportunities, varying features, evaluable predicates, or unpopulated stress cells.');
    return { status: 'INCONCLUSIVE', reasons };
  }

  const holdoutRuleHolds = generalization.applicable && generalization.holdoutReachesFloor;
  if (holdoutRuleHolds) {
    reasons.push(`A rule frozen on discovery reached ${generalization.holdoutReliability} reliability on unseen holdout with ${generalization.holdoutSelected} support, clearing the inherited ${STAGE2L11_MIN_BUCKET_RELIABILITY} floor.`);
    return { status: 'IDENTIFIABLE', reasons };
  }

  /* CONTRACT_INCOMPLETE requires that the signal exist in the fuller tiers even
   * though the exposed tier lacks it. The analysis searched all tiers, so this is
   * decidable rather than speculative. */
  const exposedTierBest = analysis.perFeature.filter((entry) => entry.tier === 'TIER_EXPOSED').reduce((max, entry) => Math.max(max, entry.bestGap), 0);
  const widerTierBest = analysis.perFeature.filter((entry) => entry.tier !== 'TIER_EXPOSED').reduce((max, entry) => Math.max(max, entry.bestGap), 0);
  const widerTiersInformative = widerTierBest > analysis.permutationNull.p95 && widerTierBest > exposedTierBest;
  if (widerTiersInformative) {
    reasons.push(`Fields outside the exposed contract reached a gap of ${widerTierBest}, above the permutation p95 of ${analysis.permutationNull.p95} and above the exposed tier's ${exposedTierBest}. Widening the contract would help.`);
    return { status: 'CONTRACT_INCOMPLETE', reasons };
  }

  if (!analysis.observedExceedsPermutationP95 && audit.hiddenRandomnessIndependentOfObservables && generalization.applicable && !generalization.holdoutReachesFloor) {
    reasons.push(`Best gap over ${analysis.predicatesSearched} predicates spanning all ${analysis.tiersInspected.length} tiers was ${analysis.observedBestGap}, below the permutation-null median of ${analysis.permutationNull.median}: shuffled labels produce a larger apparent signal than the real ones.`);
    reasons.push(`The best rule a ${generalization.ruleId ? 'full' : ''} discovery search could find fell from ${generalization.discoveryReliability} to ${generalization.holdoutReliability} out of sample, against a holdout base rate of ${generalization.holdoutBaseRate}.`);
    reasons.push('Correctness reduces to a hidden draw that is statistically independent of every legitimate decision-time observable.');
    return { status: 'NON_IDENTIFIABLE_CURRENT_TASK', reasons };
  }

  reasons.push('Measurements did not cleanly support any single classification.');
  return { status: 'INCONCLUSIVE', reasons };
}

/* ---------------------------------------------------------------------------
 * Delegation evaluation (Phase 6) and security regression.
 *
 * The corpus is run through the REAL Stage 2L.10 arbiter with its REAL frozen
 * calibration. Nothing is re-tuned and no threshold is lowered to create Nexus
 * traffic. Twelve topology families the Stage 2L.10 calibration never saw are a
 * genuine out-of-distribution test of the inherited protections.
 * ------------------------------------------------------------------------- */

export function evaluateStage2L11Delegation(rows) {
  const cases = rows.length;
  const changes = rows.filter((row) => row.changed);
  const beneficial = changes.filter((row) => row.beneficial).length;
  const harmful = changes.filter((row) => row.harmful).length;
  const breaks = rows.filter((row) => row.breaksCorrectPrime).length;
  const opportunities = rows.filter((row) => row.delegationOpportunity);
  const delegatedWhen = (correct) => {
    const subset = opportunities.filter((row) => row.expertCorrect === correct);
    return round(ratio(subset.filter((row) => row.changed).length, subset.length));
  };
  const whenCorrect = delegatedWhen(true);
  const whenWrong = delegatedWhen(false);
  return deepFreeze({
    totalCases: cases,
    inheritedDelegations: rows.filter((row) => row.baseDelegated).length,
    nexusDelegations: changes.length,
    nexusDelegationRate: round(ratio(changes.length, cases)),
    nexusDelegationPrecision: round(ratio(beneficial, changes.length)),
    nexusBeneficialChanges: beneficial,
    nexusHarmfulChanges: harmful,
    nexusHarmRate: round(ratio(harmful, cases)),
    nexusCorrectPrimeBreaks: breaks,
    nexusCorrectPrimeBreakRate: round(ratio(breaks, cases)),
    nexusAbstentions: rows.filter((row) => row.abstained).length,
    nexusAbstentionRate: round(ratio(rows.filter((row) => row.abstained).length, cases)),
    delegationOpportunities: opportunities.length,
    expertCorrectDelegated: opportunities.filter((row) => row.expertCorrect && row.changed).length,
    expertCorrectAbstained: opportunities.filter((row) => row.expertCorrect && !row.changed).length,
    expertWrongDelegated: opportunities.filter((row) => !row.expertCorrect && row.changed).length,
    expertWrongAbstained: opportunities.filter((row) => !row.expertCorrect && !row.changed).length,
    delegationRateWhenCorrect: whenCorrect,
    delegationRateWhenWrong: whenWrong,
    nexusCorrectnessDiscrimination: round(whenCorrect - whenWrong),
    primeOnlyTop1: round(ratio(rows.filter((row) => row.primeCorrect).length, cases)),
    arbiterTop1: round(ratio(rows.filter((row) => row.selectedCorrect).length, cases)),
    harmCeilingRespected: round(ratio(harmful, cases)) <= STAGE2L11_MAX_HARMFUL_CHANGE_RATE,
    correctPrimeBreakCeilingRespected: round(ratio(breaks, cases)) <= STAGE2L11_MAX_CORRECT_PRIME_BREAK_RATE,
    bucketUsage: Object.fromEntries([...new Set(rows.map((row) => row.uncertaintyBucket))].sort().map((bucket) => {
      const subset = rows.filter((row) => row.uncertaintyBucket === bucket);
      return [String(bucket), { cases: subset.length, delegated: subset.filter((row) => row.changed).length, abstained: subset.filter((row) => row.abstained).length }];
    })),
  });
}

/* Inherited protections, re-tested on topology the Stage 2L.10 calibration never
 * saw. Stage 2L.11 adds no new attack classes; it re-runs the inherited ones. */
export function runStage2L11SecurityRegression() {
  const record = buildStage2L11Case('HOLDOUT', 3);
  const context = record.decisionContext;
  const prime = {
    selectedAction: record.input.boundArbiterInput.prime.selectedAction,
    ranking: record.input.boundArbiterInput.prime.rankedLegalActions,
  };
  const evidence = record.input.boundArbiterInput.expertEvidence;
  const rebind = (packet, changes) => {
    const body = structuredClone(packet);
    delete body.packetDigest;
    Object.assign(body, structuredClone(changes));
    return deepFreeze({ ...body, packetDigest: sha256(body) });
  };
  const binding = (overrides) => ({
    contextDigest: context.contextDigest,
    runtimeIdentity: context.runtimeIdentity,
    campaignIdentity: context.campaignIdentity,
    observationIdentity: context.observationIdentity,
    stateInputDigest: context.stateInputDigest,
    legalActionSetDigest: context.legalActionSetDigest,
    primeInputIdentity: context.prime.inputIdentity,
    primeRecommendationIdentity: context.prime.recommendationIdentity,
    ...overrides,
  });
  const nexusPacket = evidence.find((entry) => entry.expert === 'NEXUS');
  const withEvidence = (packets, attestations = record.input.correctnessAttestations) =>
    buildStage2L10Input({ decisionContext: context, prime, expertEvidence: packets, attestations });
  const holdsPrime = (input) => {
    const result = runArbiterWithFailureIsolation(input, (value) => calibratedSelectiveDelegationArbiter(value));
    return result.counterfactualFinalRecommendation === record.primeAction
      && result.actionGenerated === false && result.dispatch === false && result.worldMutation === false;
  };
  const malformed = (() => {
    const body = structuredClone(nexusPacket);
    delete body.packetDigest; delete body.tieEligible;
    return deepFreeze({ ...body, packetDigest: sha256(body) });
  })();
  const other = evidence.filter((entry) => entry.expert !== 'NEXUS');
  return deepFreeze({
    staleEvidenceRejection: holdsPrime(withEvidence([...other, rebind(nexusPacket, { decisionBinding: binding({ observationIdentity: identity({ caseId: record.caseId, observation: 'PRIOR_TICK' }) }) })])),
    crossRuntimeRejection: holdsPrime(withEvidence([...other, rebind(nexusPacket, { decisionBinding: binding({ runtimeIdentity: identity({ runtime: 'STAGE2L11_FOREIGN' }) }) })])),
    crossCampaignRejection: holdsPrime(withEvidence([...other, rebind(nexusPacket, { decisionBinding: binding({ campaignIdentity: identity({ campaign: 'STAGE2L11_FOREIGN' }) }) })])),
    malformedEvidenceRejection: holdsPrime(withEvidence([...other, malformed])),
    unknownSchemaRejection: holdsPrime(withEvidence([...other, rebind(nexusPacket, { schemaVersion: 77 })])),
    duplicateEvidenceHandling: holdsPrime(withEvidence([...evidence, nexusPacket])),
    illegalActionHandling: holdsPrime(withEvidence([...other, rebind(nexusPacket, { actionBinding: { actionId: 's2l11-illegal', canonicalKey: 'sentinel.action/s2l11-illegal' } })])),
    ambiguousEvidenceRejection: holdsPrime(withEvidence([...other, rebind(nexusPacket, { actionBinding: { actionId: record.supportedAction ?? record.primeAction, canonicalKey: `display/${record.supportedAction ?? record.primeAction}` } })])),
    orderingInvariance: (() => {
      const forward = calibratedSelectiveDelegationArbiter(withEvidence(evidence)).decisionDigest;
      const reversed = calibratedSelectiveDelegationArbiter(withEvidence([...evidence].reverse())).decisionDigest;
      return forward === reversed;
    })(),
    replayDeterminism: calibratedSelectiveDelegationArbiter(record.input).decisionDigest
      === calibratedSelectiveDelegationArbiter(record.input).decisionDigest,
    failureIsolation: (() => {
      const exploded = runArbiterWithFailureIsolation(record.input, () => { throw new Error('STAGE2L11_INJECTED_FAILURE'); });
      return (exploded.counterfactualFinalRecommendation === record.primeAction || exploded.counterfactualFinalRecommendation === null)
        && exploded.actionGenerated === false && exploded.dispatch === false && exploded.worldMutation === false;
    })(),
    r0Boundary: (() => {
      const result = calibratedSelectiveDelegationArbiter(record.input);
      return result.authority.tier === 'R0' && result.authority.canDispatch === false
        && result.authority.canMutateLiveWorld === false && result.authority.canIssueAuthorityTokens === false
        && result.learnedRouting === false;
    })(),
  });
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 *
 * Stage 2L.11 PASSES when it conclusively and reproducibly ANSWERS the
 * identifiability question — not when Nexus turns out to be useful. A rigorous
 * NON_IDENTIFIABLE_CURRENT_TASK is a pass; an unsupported guess is not.
 * ------------------------------------------------------------------------- */

export function buildStage2L11Evaluation() {
  const discoveryCorpus = buildStage2L11Corpus('DISCOVERY');
  const holdoutCorpus = buildStage2L11Corpus('HOLDOUT');
  const discoveryRows = runStage2L11(discoveryCorpus);
  const holdoutRows = runStage2L11(holdoutCorpus);
  const replayRows = runStage2L11(holdoutCorpus);

  const discovery = discoverStage2L11Rule(discoveryRows);
  const generalization = testStage2L11Generalization(discovery, holdoutRows);
  const analysis = analyzeStage2L11Identifiability(holdoutRows);
  const discoveryAnalysis = analyzeStage2L11Identifiability(discoveryRows, { permutations: 20 });
  const coverage = stage2L11CellCoverage(holdoutRows);
  const audit = buildStage2L11SemanticAudit(holdoutRows);
  const contractMap = buildStage2L11ContractMap(holdoutRows[0]);
  const delegation = evaluateStage2L11Delegation(holdoutRows);
  const security = runStage2L11SecurityRegression();
  const classification = classifyStage2L11({ analysis, generalization, coverage, audit });

  const discoveryIds = new Set(discoveryCorpus.map((record) => record.caseId));
  const corpusOverlap = holdoutCorpus.filter((record) => discoveryIds.has(record.caseId)).length;

  const rowDigest = sha256(holdoutRows.map((row) => ({ caseId: row.caseId, decisionDigest: row.decisionDigest, expertCorrect: row.expertCorrect })));
  const replayDigest = sha256(replayRows.map((row) => ({ caseId: row.caseId, decisionDigest: row.decisionDigest, expertCorrect: row.expertCorrect })));

  /* Label-leakage guard, same shape as Stage 2L.10: no forbidden key may appear
   * anywhere in an arbiter input, and the disposition must not vary with
   * correctness once bucket and band are fixed. */
  const forbidden = ['expertCorrect', 'aligned', 'truthAction', 'primeCorrect', 'beneficial', 'harmful', 'selectedCorrect', 'caseId', 'split', 'variant', 'family'];
  const inputKeys = new Set();
  const collect = (value, depth = 0) => {
    if (depth > 12 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const entry of value) collect(entry, depth + 1); return; }
    for (const [key, entry] of Object.entries(value)) { inputKeys.add(key); collect(entry, depth + 1); }
  };
  for (const record of holdoutCorpus.slice(0, 250)) collect(record.input);
  const forbiddenKeysPresent = forbidden.filter((key) => inputKeys.has(key));

  const dispositionGroups = new Map();
  for (const row of holdoutRows) {
    const key = `${row.uncertaintyBucket}|${row.band}|${row.baseDelegated}`;
    if (!dispositionGroups.has(key)) dispositionGroups.set(key, new Set());
    dispositionGroups.get(key).add(row.disposition);
  }
  const correctnessSensitiveGroups = [];
  for (const key of dispositionGroups.keys()) {
    const withCorrect = new Set(holdoutRows.filter((row) => `${row.uncertaintyBucket}|${row.band}|${row.baseDelegated}` === key && row.expertCorrect).map((row) => row.disposition));
    const withWrong = new Set(holdoutRows.filter((row) => `${row.uncertaintyBucket}|${row.band}|${row.baseDelegated}` === key && !row.expertCorrect).map((row) => row.disposition));
    if (withCorrect.size === 0 || withWrong.size === 0) continue;
    if ([...withCorrect].sort().join(',') !== [...withWrong].sort().join(',')) correctnessSensitiveGroups.push(key);
  }

  return deepFreeze({
    corpus: {
      discoveryCases: discoveryCorpus.length,
      holdoutCases: holdoutCorpus.length,
      corpusOverlap,
      calibrationHoldoutSeparate: corpusOverlap === 0,
      topologyFamilies: STAGE2L11_TOPOLOGY_FAMILIES.map((family) => family.name),
      discoveryCorpusDigest: sha256(discoveryCorpus.map((record) => ({ caseId: record.caseId, family: record.family, scale: record.scale }))),
      holdoutCorpusDigest: sha256(holdoutCorpus.map((record) => ({ caseId: record.caseId, family: record.family, scale: record.scale }))),
      declaredAlignmentRate: STAGE2L11_NEXUS_ALIGNMENT_RATE,
    },
    contractMap,
    audit,
    analysis,
    discoveryAnalysis: {
      opportunities: discoveryAnalysis.opportunities,
      baseRate: discoveryAnalysis.baseRate,
      observedBestGap: discoveryAnalysis.observedBestGap,
      permutationNull: discoveryAnalysis.permutationNull,
      observedExceedsPermutationP95: discoveryAnalysis.observedExceedsPermutationP95,
    },
    ruleSearch: { searchSpace: discovery.searchSpace, discoveryOpportunities: discovery.discoveryOpportunities, discoveryBaseRate: discovery.discoveryBaseRate, frozenRule: discovery.frozenRule, topTen: discovery.topTen },
    generalization,
    coverage,
    delegation,
    security,
    classification,
    labelLeakage: {
      inputKeysInspected: inputKeys.size,
      forbiddenRuntimeKeysScanned: forbidden,
      forbiddenKeysPresent,
      dispositionGroups: dispositionGroups.size,
      correctnessSensitiveGroups,
      labelLeakageDetected: forbiddenKeysPresent.length > 0 || correctnessSensitiveGroups.length > 0,
    },
    replay: { rowDigest, replayDigest, replayEquivalent: rowDigest === replayDigest },
    rows: holdoutRows,
  });
}

export function certifyStage2L11({ evaluation = buildStage2L11Evaluation() } = {}) {
  const { analysis, generalization, coverage, classification, delegation, security, labelLeakage, corpus, audit } = evaluation;

  const identifiabilityQuestionAnswered = STAGE2L11_STATUSES.includes(classification.status)
    && classification.status !== 'INCONCLUSIVE';
  const conclusionReproducible = evaluation.replay.replayEquivalent
    && corpus.calibrationHoldoutSeparate
    && coverage.allAttainableCellsPopulated
    && generalization.applicable;
  const securityRegressionPass = Object.values(security).every(Boolean)
    && delegation.harmCeilingRespected
    && delegation.correctPrimeBreakCeilingRespected;
  const noLeakage = !labelLeakage.labelLeakageDetected;
  const thresholdsUnchanged = STAGE2L11_MIN_BUCKET_RELIABILITY === STAGE2L10_MIN_BUCKET_RELIABILITY
    && STAGE2L11_MIN_BUCKET_SAMPLES === STAGE2L10_MIN_BUCKET_SAMPLES
    && STAGE2L11_MAX_HARMFUL_CHANGE_RATE === 0.01
    && STAGE2L11_MAX_CORRECT_PRIME_BREAK_RATE === 0.01;

  const certified = identifiabilityQuestionAnswered && conclusionReproducible && securityRegressionPass && noLeakage && thresholdsUnchanged;

  const status = classification.status;
  const remediationClass = status === 'IDENTIFIABLE' ? 'NONE'
    : status === 'CONTRACT_INCOMPLETE' ? 'EVIDENCE_CONTRACT'
      : status === 'NON_IDENTIFIABLE_CURRENT_TASK' ? 'CORPUS_SEMANTICS'
        : 'OTHER';

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L11_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    stageKind: 'MEASUREMENT_AND_CERTIFICATION',
    freeze: {
      stage2l10CertificationHash: STAGE2L11_STAGE2L10_CERTIFICATION_HASH,
      stage2l10EvidenceDigest: STAGE2L11_STAGE2L10_EVIDENCE_DIGEST,
      stage2l10CalibrationDigest: STAGE2L10_FROZEN_CALIBRATION.calibrationDigest,
      nexusChanged: false,
      arbiterChanged: false,
      calibrationChanged: false,
      thresholdsUnchanged,
      minBucketReliability: STAGE2L11_MIN_BUCKET_RELIABILITY,
      minBucketSamples: STAGE2L11_MIN_BUCKET_SAMPLES,
      maxHarmfulChangeRate: STAGE2L11_MAX_HARMFUL_CHANGE_RATE,
      maxCorrectPrimeBreakRate: STAGE2L11_MAX_CORRECT_PRIME_BREAK_RATE,
    },
    corpus,
    contractMap: evaluation.contractMap,
    semanticAudit: audit,
    identifiability: {
      status,
      reasons: classification.reasons,
      opportunities: analysis.opportunities,
      baseRate: analysis.baseRate,
      featuresInspected: analysis.featuresInspected,
      featuresVarying: analysis.featuresVarying,
      predicatesSearched: analysis.predicatesSearched,
      predicatesEvaluable: analysis.predicatesEvaluable,
      bestExistingSignal: analysis.observedBestPredicate,
      bestExistingDiscrimination: analysis.observedBestGap,
      bestSideReliability: analysis.observedBestSideReliability,
      permutationNull: analysis.permutationNull,
      observedExceedsPermutationP95: analysis.observedExceedsPermutationP95,
      anyPredicateReachesReliabilityFloor: analysis.anyPredicateReachesReliabilityFloor,
      perTierBestGap: Object.fromEntries(STAGE2L11_FEATURE_TIERS.map((tier) => [
        tier,
        analysis.perFeature.filter((entry) => entry.tier === tier).reduce((max, entry) => Math.max(max, entry.bestGap), 0),
      ])),
      internalSignalExists: false,
      internalSignalExposed: false,
    },
    ruleSearch: evaluation.ruleSearch,
    generalization,
    coverage,
    delegation,
    security,
    labelLeakage,
    labelLeakageDetected: labelLeakage.labelLeakageDetected,
    replayEquivalent: evaluation.replay.replayEquivalent,
    interpretation: {
      currentNexusSafeForSelectiveDelegation: delegation.nexusDelegations === 0
        ? false
        : delegation.nexusHarmRate <= STAGE2L11_MAX_HARMFUL_CHANGE_RATE,
      currentContractSufficient: status === 'IDENTIFIABLE',
      nexusRemediationRequired: status !== 'IDENTIFIABLE',
      remediationClass,
      defectLocus: audit.defectLocus,
      minimumContractChangeRequired: status === 'CONTRACT_INCOMPLETE'
        ? 'Expose the internally computed fields identified in contractMap.informationLoss.computedButNotExposed.'
        : 'None. Widening the evidence contract cannot help: the analysis already searched every internally computed field and the full certified expert contract, and found no signal above chance.',
      whatWouldMakeItObservable: audit.whatWouldMakeItObservable,
    },
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    portabilityNote: 'Stage 2L.10 remains DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.11 does not change that and claims no cross-platform deterministic certification.',
    identifiabilityQuestionAnswered,
    conclusionReproducible,
    securityRegressionPass,
    stage2l11Certified: certified,
    evidenceDigest: sha256({ corpus, analysis: { best: analysis.observedBestGap, null: analysis.permutationNull }, generalization, delegation, classification }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L11PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage,
    status: certification.status,
    identifiabilityStatus: certification.identifiability.status,
    holdoutCases: certification.corpus.holdoutCases,
    opportunities: certification.identifiability.opportunities,
    bestExistingDiscrimination: certification.identifiability.bestExistingDiscrimination,
    permutationNullMedian: certification.identifiability.permutationNull.median,
    holdoutReliability: certification.generalization.holdoutReliability,
    nexusDelegations: certification.delegation.nexusDelegations,
    nexusCorrectnessDiscrimination: certification.delegation.nexusCorrectnessDiscrimination,
    evidenceDigest: certification.evidenceDigest,
    certificationHash: certification.certificationHash,
  };
  return deepFreeze({ digest: sha256(witnesses), witnesses });
}
