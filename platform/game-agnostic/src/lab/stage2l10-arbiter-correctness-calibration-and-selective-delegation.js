/* Stage 2L.10 — Arbiter correctness calibration and selective delegation (R0, shadow only).
 *
 * THE MEASURED FAILURE THIS REMEDIATES. Stage 2L.9 established that the Stage 2L.7
 * Arbiter can prove an expert packet is AUTHENTIC — bound, fresh, in-runtime,
 * schema-legal, causally certified, head-eligible — and still have no idea whether
 * the expert is RIGHT. Measured on 20,500 cases: delegation happened at essentially
 * the same rate when the expert was correct (Oracle 0.7155) as when it was wrong
 * (Oracle 0.7193), a correctness discrimination of -0.0038. Harm followed: a 4.46%
 * harmful-change rate against an inherited 1.00% ceiling.
 *
 * THE DISTINCTION THIS STAGE ADDS. Evidence validity and expert correctness
 * confidence are different questions and are now asked separately. Stage 2L.7
 * answers the first and is imported byte-frozen; it still holds the veto. Stage
 * 2L.10 asks the second, and only ever SUBTRACTS delegations:
 *
 *     delegate(2L10) is a strict subset of delegate(2L7)
 *
 * so every inherited protection survives by construction. The Stage 2L.7 arbiter
 * runs first, unmodified, on a pristine Stage 2L.7 input; when it returns Prime,
 * Stage 2L.10 returns Prime. Stage 2L.10 can only turn a delegation into an
 * abstention, never the reverse. That property is asserted, not assumed.
 *
 * HOW CORRECTNESS CONFIDENCE IS OBTAINED. Not by consulting the answer. Each expert
 * emits a CORRECTNESS ATTESTATION carrying only signals it computed about its own
 * assessment, digest-sealed and bound to the same decision context as its evidence
 * packet. Those signals map to a deterministic uncertainty bucket, and each bucket
 * carries an empirically measured reliability drawn ONLY from the calibration
 * corpus. A bucket delegates only if its calibrated reliability clears a floor that
 * was fixed a priori from the inherited harm ceiling. A bucket that was never
 * calibrated, or that falls short, abstains. Default is Prime.
 *
 * WHAT THE CALIBRATION FOUND. Oracle's endpoint-derived direction claim can be
 * cross-checked against its own full-window and recent-window regression slopes;
 * that coherence separates its correct from its incorrect calls. Nexus's structural
 * analysis is exact but cannot certify that the structurally critical entity is the
 * utility-optimal one, and no decision-time signal it emits moves with that. So
 * Nexus abstains — a measured result, not a design preference.
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

export const STAGE2L10_STAGE = 'STAGE2L10_ARBITER_CORRECTNESS_CALIBRATION_AND_SELECTIVE_DELEGATION';

/* Frozen predecessors. Stage 2L.10 changes none of them. */
export const STAGE2L10_STAGE2L9_CERTIFICATION_HASH = 'e2c068666c5c160840ab94feaf9c973f9d60f94495f05787d3a06cd4c3997b1b';
export const STAGE2L10_STAGE2L9_EVIDENCE_DIGEST = '87548f427f25f74be2d867a49add445f6cb939e12a96f019ff31c6ba79a1e5ce';
export const STAGE2L10_STAGE2L9_OWNER_SHA256 = 'ec80274f55630cfd96da413786d3dbe8af9c7ee99ac583041fe5538bf6a20a81';
export const STAGE2L10_STAGE2L7_OWNER_SHA256 = '5047dc0576b8242c00a1f73729c4b0bc49fc1d181eac22bc90896d2cf5cccc00';
export const STAGE2L10_STAGE2L8_OWNER_SHA256 = '0e9e09c3d853237365ebbd42512ba3f18bb4ee6577db554bd9c15588eb7f70e0';
export const STAGE2L10_ARBITER_RULE_DIGEST = STAGE2L7_ARBITER_RULE_DIGEST;
export const STAGE2L10_FAIL_CLOSED_MATRIX_DIGEST = STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST;

/* Inherited bounds. Stage 2L.10 tightens nothing and loosens nothing. */
export const STAGE2L10_MAX_HARMFUL_CHANGE_RATE = 0.01;
export const STAGE2L10_MAX_CORRECT_PRIME_BREAK_RATE = 0.01;

/* A priori gate, fixed before any calibration measurement was taken and derived
 * from the inherited ceiling rather than from data: a bucket may authorise
 * delegation only if the expert was correct on at least 99% of that bucket's
 * calibration delegation opportunities, mirroring the <=1% harm ceiling. It is
 * NOT swept, NOT tuned, and NOT expert-specific. What IS expert-specific is the
 * measured reliability table each expert's own signals produce. */
export const STAGE2L10_MIN_BUCKET_RELIABILITY = 0.99;

/* A bucket seen fewer times than this during calibration is treated as
 * uncalibrated and therefore abstains. Unknown state denies. */
export const STAGE2L10_MIN_BUCKET_SAMPLES = 60;

/* Corpus sizes. Calibration and holdout are disjoint in seed domain, variant
 * range and case-id prefix. */
export const STAGE2L10_CALIBRATION_ORACLE_CASES = 3000;
export const STAGE2L10_CALIBRATION_NEXUS_CASES = 3000;
export const STAGE2L10_CALIBRATION_CONTROL_CASES = 200;
export const STAGE2L10_CALIBRATION_ADVERSARIAL_CASES = 50;
export const STAGE2L10_HOLDOUT_ORACLE_CASES = 7000;
export const STAGE2L10_HOLDOUT_NEXUS_CASES = 7000;
export const STAGE2L10_HOLDOUT_CONTROL_CASES = 500;
export const STAGE2L10_HOLDOUT_ADVERSARIAL_CASES = 250;
export const STAGE2L10_MIN_HOLDOUT_CASES = 20000;

/* Declared, reported corpus parameter, inherited unchanged from Stage 2L.9: how
 * often the constructed single point of failure is also the utility-optimal
 * entity. Nexus decision errors arise from the complement. This is deliberately
 * NOT correlated with anything Nexus can observe — that is the property Stage
 * 2L.9 measured, and rigging it here would manufacture a pass. */
export const STAGE2L10_NEXUS_ALIGNMENT_RATE = 0.7;

const CALIBRATION_SEED = 0x5347324c313043n; // "SG2L10C"
const HOLDOUT_SEED = 0x5347324c313048n;     // "SG2L10H"
const ORACLE_LABELS = deepFreeze(['UP', 'DOWN', 'STABLE']);
const SLOPE_SCALE = 1000000;

function identity(payload) { return `sha256:${sha256(payload)}`; }
function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function clamp(value) { return Math.min(1, Math.max(0, Number(value.toFixed(6)))); }
function micro(value) { return Number.isFinite(value) ? Math.round(value * SLOPE_SCALE) : 0; }
function signOf(value) { return value > 0 ? 1 : value < 0 ? -1 : 0; }
function percentile(values, proportion) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * proportion) - 1))] ?? 0;
}

export const STAGE2L10_SPLITS = deepFreeze(['CALIBRATION', 'HOLDOUT']);
const SPLIT_SEED = deepFreeze({ CALIBRATION: CALIBRATION_SEED, HOLDOUT: HOLDOUT_SEED });

export const STAGE2L10_CONTROL_GROUPS = deepFreeze([
  'PRIME_ONLY_CONTROL',
  'ORACLE_RELEVANT_CONTROL',
  'NEXUS_RELEVANT_CONTROL',
  'ORACLE_IRRELEVANT_CONTROL',
  'NEXUS_IRRELEVANT_CONTROL',
  'BOTH_WRONG_CONTROL',
  'NO_EXPERT_INFORMATION_CONTROL',
]);

export const STAGE2L10_ADVERSARIAL_CONTROLS = deepFreeze([
  'SE_MISSING_EVIDENCE', 'SE_MALFORMED_EVIDENCE', 'SE_STALE_EVIDENCE',
  'SE_CROSS_RUNTIME', 'SE_CROSS_OBSERVATION', 'SE_CROSS_CAMPAIGN',
  'SE_AMBIGUOUS_ACTION_BINDING', 'SE_AMBIGUOUS_CHANNEL_ENTITY_BINDING',
  'SE_ILLEGAL_ACTION', 'SE_UNKNOWN_SCHEMA', 'SE_UNKNOWN_RULE',
  'SE_CONFLICTING_DUPLICATE',
]);

/* Stage 2L.10 adds adversarial controls aimed at the NEW surface: the
 * attestation itself. Each must fail closed to Prime. */
export const STAGE2L10_ATTESTATION_CONTROLS = deepFreeze([
  'AT_MISSING_ATTESTATION',
  'AT_MALFORMED_ATTESTATION',
  'AT_STALE_ATTESTATION',
  'AT_CROSS_RUNTIME_ATTESTATION',
  'AT_UNBOUND_EVIDENCE_DIGEST',
  'AT_FORGED_SIGNALS',
  'AT_DUPLICATE_ATTESTATION',
  'AT_WRONG_EXPERT_ATTESTATION',
  'AT_UNKNOWN_SIGNAL_KIND',
]);

export const STAGE2L10_MARGIN_BANDS = deepFreeze([
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
 * Independent ground truth. Drawn from its own seeded stream per split; never
 * reads expert output, Arbiter output, or any attestation.
 * ------------------------------------------------------------------------- */

export function stage2L10GroundTruth(split, index) {
  const random = createSeededRandom(deriveSeed(SPLIT_SEED[split], `STAGE2L10_INDEPENDENT_GROUND_TRUTH_${split}`, index));
  const primeCorrect = random() < 0.5;
  const bandIndex = Math.floor(random() * STAGE2L10_MARGIN_BANDS.length);
  const supportInTieBand = random() < 0.85;
  const nexusAligned = random() < STAGE2L10_NEXUS_ALIGNMENT_RATE;
  const regimeIndex = Math.floor(random() * STAGE2L10_ORACLE_REGIMES.length);
  const graphShapeIndex = Math.floor(random() * 4);
  return deepFreeze({
    split,
    index,
    primeCorrect,
    band: STAGE2L10_MARGIN_BANDS[bandIndex],
    margin: BAND_MARGIN[STAGE2L10_MARGIN_BANDS[bandIndex]],
    supportInTieBand,
    nexusAligned,
    regimeIndex,
    graphShapeIndex,
    generator: 'STAGE2L10_INDEPENDENT_GROUND_TRUTH_V1',
  });
}

/* ---------------------------------------------------------------------------
 * Real Oracle: fresh histories whose true regime is fixed by the generator.
 *
 * Six regimes are inherited from Stage 2L.9 so the failure surface stays
 * comparable. Five are new and were chosen to attack the very signal this stage
 * proposes, in both directions — regimes where Oracle is RIGHT but its slopes
 * look incoherent (a utility cost for the gate), and regimes where Oracle is
 * WRONG while its slopes look perfectly coherent (a residual harm the gate
 * cannot catch). A corpus that only contained cases the gate handles would
 * manufacture its own pass.
 * ------------------------------------------------------------------------- */

function linear(drift, noise, variant, base = 0.5) {
  return Array.from({ length: 14 }, (unused, tick) => {
    const oscillation = noise === 0 ? 0 : ((((tick * 7 + variant * 3) % 5) - 2) / 2) * noise;
    return clamp(base + drift * (tick - 6.5) + oscillation);
  });
}

export const STAGE2L10_ORACLE_REGIMES = deepFreeze([
  /* Inherited from Stage 2L.9, unchanged. */
  { name: 'STRONG_RISE', truth: 'UP', inherited: true, build: (variant) => linear(0.030, 0.000, variant) },
  { name: 'STRONG_FALL', truth: 'DOWN', inherited: true, build: (variant) => linear(-0.030, 0.000, variant) },
  { name: 'EXACT_FLAT', truth: 'STABLE', inherited: true, build: (variant) => linear(0.000, 0.000, variant) },
  { name: 'WEAK_RISE', truth: 'UP', inherited: true, build: (variant) => linear(0.004, 0.006, variant) },
  { name: 'WEAK_FALL', truth: 'DOWN', inherited: true, build: (variant) => linear(-0.004, 0.006, variant) },
  { name: 'ZERO_DRIFT_OSCILLATION', truth: 'STABLE', inherited: true, build: (variant) => linear(0.000, 0.030, variant) },

  /* New. Oracle is CORRECT here but its recent window contradicts its claim, so
   * a coherence gate abstains and loses a good delegation. Utility cost, not a
   * safety cost — and it must be paid visibly. */
  {
    name: 'LATE_REVERSAL_NET_RISE',
    truth: 'UP',
    inherited: false,
    build: (variant) => {
      const rise = Array.from({ length: 10 }, (unused, tick) => 0.40 + 0.030 * tick + ((variant % 3) - 1) * 0.002);
      const fall = Array.from({ length: 4 }, (unused, tick) => rise[9] - 0.020 * (tick + 1));
      return [...rise, ...fall].map(clamp);
    },
  },

  /* New. A mean-reverting process with zero long-run drift, observed during a
   * late displacement. The 14-tick window cannot reveal the reversion, so Oracle
   * reads a real trend where there is none: WRONG, with full and recent slopes
   * that agree. This is the residual-harm regime the gate is expected to miss. */
  {
    name: 'MEAN_REVERTING_LATE_DISPLACEMENT',
    truth: 'STABLE',
    inherited: false,
    build: (variant) => {
      const flat = Array.from({ length: 10 }, () => 0.50 + ((variant % 3) - 1) * 0.001);
      const ramp = Array.from({ length: 4 }, (unused, tick) => flat[9] + 0.015 * (tick + 1));
      return [...flat, ...ramp].map(clamp);
    },
  },

  /* New. A genuine strong trend buried in heavy noise. Oracle should be right and
   * the gate should still let it through; over-abstention would show up here. */
  { name: 'NOISY_STRONG_RISE', truth: 'UP', inherited: false, build: (variant) => linear(0.025, 0.020, variant) },

  /* New. Drift an order of magnitude below the noise floor: genuinely
   * unresolvable from 14 ticks. Neither confident correctness nor confident
   * error — the case abstention exists for. */
  { name: 'MICRO_DRIFT_UP', truth: 'UP', inherited: false, build: (variant) => linear(0.0005, 0.012, variant) },
  { name: 'MICRO_DRIFT_DOWN', truth: 'DOWN', inherited: false, build: (variant) => linear(-0.0005, 0.012, variant) },

  /* New. Two stable levels joined by one step. No trend exists in either regime,
   * so the truth is STABLE, but endpoint differencing reads a large rise. */
  {
    name: 'STEP_LEVEL_SHIFT',
    truth: 'STABLE',
    inherited: false,
    build: (variant) => [
      ...Array.from({ length: 7 }, () => 0.42 + ((variant % 3) - 1) * 0.001),
      ...Array.from({ length: 7 }, () => 0.58 + ((variant % 3) - 1) * 0.001),
    ].map(clamp),
  },
]);

function oracleHistory(regime, variant) {
  return regime.build(variant).map((value, tick) => ({ tick, channels: { alpha: value } }));
}

/**
 * Drive the certified Oracle V2 assembly and return both its classification and
 * the self-reported signals it will later attest to. Nothing here reads the
 * regime's truth: `trueRegime` is carried for scoring only and never reaches the
 * attestation, the Arbiter input, or any runtime path.
 */
export function measureOracleClassification(split, caseId, regime, variant) {
  const input = {
    caseId: `${caseId}-oracle`,
    task: 'direction',
    family: `STAGE2L10_${regime.name}`,
    observationHistory: oracleHistory(regime, variant),
    channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: 0.76 } },
    source: `STAGE2L10_${split}`,
  };
  const observationIdentity = identity({ caseId, corpus: `STAGE2L10_ORACLE_${split}` });
  const assessment = assembleOracleV2(input, { observationIdentity });
  const head = assessment.heads.direction;
  const observation = head.observation ?? {};
  const signal = ORACLE_LABELS.includes(head.semanticOutput) ? head.semanticOutput : 'STABLE';
  return {
    signal,
    trueRegime: regime.truth,
    correct: signal === regime.truth,
    confidence: head.confidence,
    supported: head.supported === true,
    /* The attested signals: Oracle's own claim, cross-checked against Oracle's
     * own two slope estimates. Fixed-point integers so the bucket boundary is
     * exact and platform-independent. */
    signals: deepFreeze({
      kind: 'ORACLE_DIRECTION_SLOPE_COHERENCE_V1',
      head: 'direction',
      supported: head.supported === true,
      claim: signal,
      confidence: head.confidence,
      fullSlopeMicro: micro(observation.fullSlope),
      recentSlopeMicro: micro(observation.recentSlope),
      samples: Number.isFinite(observation.samples) ? observation.samples : 0,
      historySufficiency: assessment.historySufficiency,
    }),
    historyDigest: identity({ caseId, history: input.observationHistory }),
    observationIdentity,
  };
}

/* ---------------------------------------------------------------------------
 * Real Nexus: fresh graphs with a construction-known critical structure.
 *
 * Four shapes are generated so the structural-determinacy buckets are genuinely
 * exercised. The semantic alignment draw is inherited from Stage 2L.9 unchanged
 * and stays independent of every structural feature — deliberately. Correlating
 * it with something Nexus can see would fabricate the signal this stage is
 * supposed to test for.
 * ------------------------------------------------------------------------- */

export const STAGE2L10_GRAPH_SHAPES = deepFreeze(['SINGLE_BRIDGE', 'REDUNDANT_PATH', 'TANDEM_BRIDGES', 'WIDE_FAN_BRIDGE']);

export function measureNexusAnalysis(split, caseId, variant, shapeIndex) {
  const shape = STAGE2L10_GRAPH_SHAPES[shapeIndex % STAGE2L10_GRAPH_SHAPES.length];
  const bridge = `s2l10-${caseId}-bridge`;
  const source = `s2l10-${caseId}-src`;
  const target = `s2l10-${caseId}-dst`;
  const spur = `s2l10-${caseId}-spur`;
  const second = `s2l10-${caseId}-second`;
  const entities = [{ id: source }, { id: bridge }, { id: target }, { id: spur }];
  const relationships = [
    { id: `${caseId}-e1`, from: source, to: bridge, kind: 'depends' },
    { id: `${caseId}-e2`, from: bridge, to: target, kind: 'depends' },
    { id: `${caseId}-e3`, from: spur, to: bridge, kind: 'depends' },
  ];
  if (shape === 'REDUNDANT_PATH') {
    relationships.push({ id: `${caseId}-e4`, from: source, to: target, kind: 'depends' });
  } else if (shape === 'TANDEM_BRIDGES') {
    entities.push({ id: second });
    relationships[1] = { id: `${caseId}-e2`, from: bridge, to: second, kind: 'depends' };
    relationships.push({ id: `${caseId}-e5`, from: second, to: target, kind: 'depends' });
  } else if (shape === 'WIDE_FAN_BRIDGE') {
    for (let leaf = 0; leaf < 4; leaf += 1) {
      entities.push({ id: `s2l10-${caseId}-leaf${leaf}` });
      relationships.push({ id: `${caseId}-f${leaf}`, from: `s2l10-${caseId}-leaf${leaf}`, to: bridge, kind: 'depends' });
    }
  }
  const caseEntry = {
    caseId,
    canonicalState: { entities, relationships },
    query: { source, target, edgeType: null, candidateType: 'node', candidateNodeId: bridge, candidateEdgeId: null },
    mutation: { type: 'NONE' },
  };
  const analysis = analyzeRelationalDelta(caseEntry);
  const spofNodes = analysis.spofNodes ?? [];
  const structural = analysis.structural ?? {};
  const redundancy = analysis.redundancy ?? {};
  return {
    analysis,
    shape,
    constructedBridge: bridge,
    spofNodes,
    supportedEntity: spofNodes.length > 0 ? spofNodes[0] : null,
    graphDigest: identity({ caseId, graph: { entities, relationships } }),
    entity: { entityId: bridge, entityType: 'bridge', canonicalKey: `bridge/${bridge}` },
    edges: [{ edgeId: `${caseId}-e2`, sourceEntityId: bridge, targetEntityId: shape === 'TANDEM_BRIDGES' ? second : target, relation: 'DIRECTED_SUPPORT' }],
    /* Nexus attests to what its graph analysis actually established, including —
     * critically — that it did NOT establish utility optimality. Structural
     * criticality and decision optimality are different claims, and Nexus can
     * only certify the first. */
    signals: deepFreeze({
      kind: 'NEXUS_STRUCTURAL_DETERMINACY_V1',
      candidateIsSpof: spofNodes.includes(bridge),
      spofNodeCount: spofNodes.length,
      spofEdgeCount: (analysis.spofEdges ?? []).length,
      criticalCount: (analysis.criticalEntities ?? []).length,
      bottleneckCount: (analysis.bottleneckEntities ?? []).length,
      componentCount: Number.isFinite(structural.componentCount) ? structural.componentCount : 0,
      entityCount: Number.isFinite(structural.entityCount) ? structural.entityCount : entities.length,
      edgeCount: Number.isFinite(structural.edgeCount) ? structural.edgeCount : relationships.length,
      redundantPathPresent: redundancy.redundant === true,
      reachableWithoutCandidate: redundancy.reachableWithoutNode === true,
      /* The honest declaration. Nexus's relational analysis is exact, but nothing
       * in it certifies that the structurally critical entity is the utility-
       * optimal action. Stage 2L.9 measured exactly this gap. */
      semanticOptimalityCertified: false,
    }),
  };
}

/* ---------------------------------------------------------------------------
 * The correctness attestation contract.
 *
 * A separate packet from the Stage 2L.7 evidence packet, on purpose. Stage 2L.7's
 * validator matches its key set EXACTLY, so nothing can be smuggled into it and
 * nothing about Stage 2L.7 changes. The attestation carries the same eight-field
 * decision binding, so it inherits every staleness, cross-runtime, cross-campaign
 * and cross-observation protection for free, and it additionally names the exact
 * evidence packet it speaks for.
 * ------------------------------------------------------------------------- */

export const STAGE2L10_ATTESTATION_CONTRACT = 'SENTINEL_GRID_EXPERT_CORRECTNESS_ATTESTATION_V1';
export const STAGE2L10_INPUT_CONTRACT = 'SENTINEL_GRID_CALIBRATED_SELECTIVE_DELEGATION_INPUT_V1';

export const STAGE2L10_ORACLE_SIGNAL_KEYS = deepFreeze(['kind', 'head', 'supported', 'claim', 'confidence', 'fullSlopeMicro', 'recentSlopeMicro', 'samples', 'historySufficiency']);
export const STAGE2L10_NEXUS_SIGNAL_KEYS = deepFreeze(['kind', 'candidateIsSpof', 'spofNodeCount', 'spofEdgeCount', 'criticalCount', 'bottleneckCount', 'componentCount', 'entityCount', 'edgeCount', 'redundantPathPresent', 'reachableWithoutCandidate', 'semanticOptimalityCertified']);
const ATTESTATION_KEYS = deepFreeze(['schemaVersion', 'contract', 'expert', 'decisionBinding', 'evidencePacketDigest', 'measurementRuleIdentity', 'signals', 'advisoryOnly', 'actionGeneration', 'attestationDigest']);

/* Signal keys the runtime is allowed to see. Anything naming an outcome, a truth
 * action, a case identity or an index is forbidden, and a test asserts it. */
export const STAGE2L10_FORBIDDEN_RUNTIME_KEYS = deepFreeze([
  'truthAction', 'expertCorrect', 'primeCorrect', 'correct', 'beneficial', 'harmful',
  'selectedCorrect', 'caseId', 'index', 'variant', 'stratum', 'regime', 'label', 'outcome', 'split',
]);

export const STAGE2L10_ORACLE_MEASUREMENT_RULE = deepFreeze({
  schemaVersion: 1,
  id: 'ORACLE_DIRECTION_SLOPE_COHERENCE_V1',
  basis: 'ORACLE_V2_DIRECTION_HEAD_SELF_REPORTED_OBSERVATION',
  crossChecks: ['ENDPOINT_CLAIM_VS_FULL_WINDOW_SLOPE', 'ENDPOINT_CLAIM_VS_RECENT_WINDOW_SLOPE', 'RECENT_WINDOW_DOMINANCE'],
  readsGroundTruth: false,
  readsArbiterOutput: false,
  actionSelection: false,
  advisoryOnly: true,
});
export const STAGE2L10_NEXUS_MEASUREMENT_RULE = deepFreeze({
  schemaVersion: 1,
  id: 'NEXUS_STRUCTURAL_DETERMINACY_V1',
  basis: 'NEXUS_RELATIONAL_DELTA_SELF_REPORTED_STRUCTURE',
  crossChecks: ['CANDIDATE_CRITICALITY', 'PATH_REDUNDANCY', 'CRITICAL_SET_CARDINALITY'],
  declaresSemanticOptimality: false,
  readsGroundTruth: false,
  readsArbiterOutput: false,
  actionSelection: false,
  advisoryOnly: true,
});
export const STAGE2L10_ORACLE_MEASUREMENT_RULE_IDENTITY = identity(STAGE2L10_ORACLE_MEASUREMENT_RULE);
export const STAGE2L10_NEXUS_MEASUREMENT_RULE_IDENTITY = identity(STAGE2L10_NEXUS_MEASUREMENT_RULE);

function attestationBinding(context) {
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

export function createCorrectnessAttestation({ expert, decisionContext, evidencePacketDigest, signals, decisionBindingOverride = null, measurementRuleIdentityOverride = null }) {
  const body = {
    schemaVersion: 1,
    contract: STAGE2L10_ATTESTATION_CONTRACT,
    expert,
    decisionBinding: decisionBindingOverride ?? attestationBinding(decisionContext),
    evidencePacketDigest,
    measurementRuleIdentity: measurementRuleIdentityOverride
      ?? (expert === 'ORACLE' ? STAGE2L10_ORACLE_MEASUREMENT_RULE_IDENTITY : STAGE2L10_NEXUS_MEASUREMENT_RULE_IDENTITY),
    signals: structuredClone(signals),
    advisoryOnly: true,
    actionGeneration: false,
  };
  return deepFreeze({ ...body, attestationDigest: sha256(body) });
}

function attestationSort(left, right) {
  return String(left?.expert).localeCompare(String(right?.expert))
    || String(left?.attestationDigest).localeCompare(String(right?.attestationDigest));
}

/**
 * Build a Stage 2L.10 input. The Stage 2L.7 input is nested pristine and is what
 * the frozen Stage 2L.7 arbiter is handed; attestations ride alongside.
 */
export function buildStage2L10Input({ decisionContext, prime, expertEvidence = [], attestations = [] }) {
  const boundArbiterInput = buildBoundArbiterInput({ decisionContext, prime, expertEvidence });
  const body = {
    schemaVersion: 1,
    contract: STAGE2L10_INPUT_CONTRACT,
    shadowOnly: true,
    boundArbiterInput,
    correctnessAttestations: [...attestations].sort(attestationSort),
  };
  return deepFreeze({ ...body, inputDigest: sha256(body) });
}

/* ---------------------------------------------------------------------------
 * Uncertainty buckets. Pure functions of attested signals and frozen calibration
 * parameters. No corpus, no case identity, no outcome.
 * ------------------------------------------------------------------------- */

export const STAGE2L10_ORACLE_BUCKETS = deepFreeze([
  'ORACLE_UNSUPPORTED_HEAD',
  'ORACLE_STABLE_EXACT',
  'ORACLE_STABLE_UNSTEADY',
  'ORACLE_DIRECTIONAL_FULL_WINDOW_FLAT',
  'ORACLE_DIRECTIONAL_CONTRADICTED',
  'ORACLE_DIRECTIONAL_RECENT_DOMINATED',
  'ORACLE_DIRECTIONAL_COHERENT',
]);

export const STAGE2L10_NEXUS_BUCKETS = deepFreeze([
  'NEXUS_NO_STRUCTURAL_CRITICALITY',
  'NEXUS_REDUNDANT_PATH',
  'NEXUS_MULTIPLE_CRITICAL_NODES',
  'NEXUS_WIDE_FAN_CRITICAL',
  'NEXUS_SOLE_CRITICAL_NODE',
]);

export function oracleUncertaintyBucket(signals, params) {
  if (signals?.kind !== 'ORACLE_DIRECTION_SLOPE_COHERENCE_V1') return null;
  if (signals.supported !== true || signals.historySufficiency !== 'ENOUGH_EVIDENCE') return 'ORACLE_UNSUPPORTED_HEAD';
  const full = signals.fullSlopeMicro;
  const recent = signals.recentSlopeMicro;
  if (signals.claim === 'STABLE') return full === 0 && recent === 0 ? 'ORACLE_STABLE_EXACT' : 'ORACLE_STABLE_UNSTEADY';
  const want = signals.claim === 'UP' ? 1 : -1;
  // The full window must carry a claim-sized trend at all before it can back a claim.
  if (Math.abs(full) < params.minFullSlopeMicro || signOf(full) === 0) return 'ORACLE_DIRECTIONAL_FULL_WINDOW_FLAT';
  // Either window pointing the other way contradicts the endpoint claim outright.
  if (signOf(full) !== want || signOf(recent) !== want) return 'ORACLE_DIRECTIONAL_CONTRADICTED';
  // Integer comparison keeps the boundary exact and platform-independent.
  if (Math.abs(recent) * params.ratioDenominator > Math.abs(full) * params.ratioNumerator) return 'ORACLE_DIRECTIONAL_RECENT_DOMINATED';
  return 'ORACLE_DIRECTIONAL_COHERENT';
}

/* A priori structural preconditions, declared before any measurement and never
 * swept. A bucket in which the expert's OWN output disclaims a basis for the
 * claim can never authorise delegation, however reliable it happens to measure.
 * Calibration observed ORACLE_UNSUPPORTED_HEAD at reliability 1.0 — Oracle was in
 * fact right every time its abstention head called the window insufficient — and
 * it is still refused here. Delegation must be positively justified by evidence
 * the expert stands behind; a high score on evidence it disowns is a coincidence,
 * not a justification. This rule only ever removes delegations. */
export const STAGE2L10_STRUCTURALLY_INELIGIBLE_BUCKETS = deepFreeze([
  'ORACLE_UNSUPPORTED_HEAD',
  'ORACLE_STABLE_UNSTEADY',
  'NEXUS_NO_STRUCTURAL_CRITICALITY',
]);

export function bucketStructurallyEligible(bucket) {
  return bucket !== null && !STAGE2L10_STRUCTURALLY_INELIGIBLE_BUCKETS.includes(bucket);
}

export function nexusUncertaintyBucket(signals, params) {
  if (signals?.kind !== 'NEXUS_STRUCTURAL_DETERMINACY_V1') return null;
  if (signals.candidateIsSpof !== true) return 'NEXUS_NO_STRUCTURAL_CRITICALITY';
  if (signals.redundantPathPresent === true || signals.reachableWithoutCandidate === true) return 'NEXUS_REDUNDANT_PATH';
  if (signals.spofNodeCount > 1) return 'NEXUS_MULTIPLE_CRITICAL_NODES';
  if (signals.entityCount >= params.minWideFanEntityCount) return 'NEXUS_WIDE_FAN_CRITICAL';
  return 'NEXUS_SOLE_CRITICAL_NODE';
}

export function uncertaintyBucketFor(expert, signals, calibration) {
  if (expert === 'ORACLE') return oracleUncertaintyBucket(signals, calibration.oracle.parameters);
  if (expert === 'NEXUS') return nexusUncertaintyBucket(signals, calibration.nexus.parameters);
  return null;
}

/* ---------------------------------------------------------------------------
 * Calibration.
 *
 * Parameters are chosen ONLY from the calibration corpus, by a selection rule
 * declared here in full before any measurement is read, and are then frozen. The
 * runtime arbiter reads the frozen table and never touches a corpus. A test
 * asserts that re-deriving from the calibration corpus reproduces the frozen
 * table byte-for-byte, so the freeze cannot silently drift.
 * ------------------------------------------------------------------------- */

/* Declared candidate ladders. Fixed in advance; the sweep may only choose from them. */
export const STAGE2L10_RATIO_LADDER = deepFreeze([
  { ratioNumerator: 3, ratioDenominator: 2 },
  { ratioNumerator: 2, ratioDenominator: 1 },
  { ratioNumerator: 3, ratioDenominator: 1 },
  { ratioNumerator: 5, ratioDenominator: 1 },
  { ratioNumerator: 8, ratioDenominator: 1 },
  { ratioNumerator: 12, ratioDenominator: 1 },
]);
export const STAGE2L10_MIN_FULL_SLOPE_LADDER = deepFreeze([0, 250, 500, 1000, 2000]);
export const STAGE2L10_WIDE_FAN_LADDER = deepFreeze([6, 7, 8]);

/* Declared selection rule, fixed before measurement:
 *   1. keep only candidates whose delegating bucket is calibrated
 *      (>= STAGE2L10_MIN_BUCKET_SAMPLES opportunities) AND reaches
 *      STAGE2L10_MIN_BUCKET_RELIABILITY;
 *   2. among those, maximise calibration delegation opportunities recovered;
 *   3. break ties toward the MORE conservative candidate — smaller slope ratio
 *      first, then larger full-window slope floor.
 * If nothing qualifies, the expert delegates nothing. */
function selectCandidate(candidates) {
  const qualifying = candidates.filter((entry) => entry.qualifies);
  if (qualifying.length === 0) return null;
  return qualifying.slice().sort((left, right) => right.opportunities - left.opportunities
    || (left.ratioNumerator * right.ratioDenominator) - (right.ratioNumerator * left.ratioDenominator)
    || right.minFullSlopeMicro - left.minFullSlopeMicro)[0];
}

function bucketTable(observations, bucketNames) {
  return Object.fromEntries(bucketNames.map((bucket) => {
    const subset = observations.filter((entry) => entry.bucket === bucket);
    const correct = subset.filter((entry) => entry.expertCorrect).length;
    const calibrated = subset.length >= STAGE2L10_MIN_BUCKET_SAMPLES;
    const reliability = subset.length === 0 ? null : round(ratio(correct, subset.length));
    return [bucket, {
      opportunities: subset.length,
      expertCorrect: correct,
      expertWrong: subset.length - correct,
      reliability,
      calibrated,
      structurallyEligible: bucketStructurallyEligible(bucket),
      /* Unknown state denies, and so does a bucket the expert's own output
       * disclaims. Both conditions must hold before delegation is authorised. */
      delegates: bucketStructurallyEligible(bucket)
        && calibrated
        && reliability !== null
        && reliability >= STAGE2L10_MIN_BUCKET_RELIABILITY,
    }];
  }));
}

/* Prime protection analysis: does delegation harm concentrate in any Prime
 * ambiguity band? The answer is measured, not assumed. The frozen margin is the
 * largest band under which calibration delegations that passed the reliability
 * gate were harm-free. */
function primeProtectionMargin(observations) {
  const passing = observations.filter((entry) => entry.gatePassed);
  const bandHarm = STAGE2L10_MARGIN_BANDS.map((band) => {
    const subset = passing.filter((entry) => entry.band === band);
    const harmful = subset.filter((entry) => entry.wouldHarm).length;
    return { band, marginMicro: micro(BAND_MARGIN[band]), delegations: subset.length, harmfulDelegations: harmful, harmRate: round(ratio(harmful, subset.length)) };
  });
  const ceiling = micro(STAGE2L7_PRIME_AMBIGUITY_THRESHOLD);
  const firstHarmful = bandHarm.find((entry) => entry.harmfulDelegations > 0 && entry.marginMicro <= ceiling);
  return {
    bandHarm,
    // No band showed harm => the inherited ambiguity threshold stays the only margin gate.
    primeProtectionMarginMicro: firstHarmful ? firstHarmful.marginMicro - 1 : ceiling,
    marginRestrictionAddedBeyondInherited: Boolean(firstHarmful),
  };
}

/**
 * Derive the calibration from the CALIBRATION corpus alone. Never call this with
 * holdout rows; `assertCalibrationSplit` enforces it.
 */
export function deriveStage2L10Calibration(rows = runStage2L10Base(buildStage2L10Corpus('CALIBRATION'))) {
  for (const row of rows) {
    if (row.split !== 'CALIBRATION') throw new Error('STAGE2L10_CALIBRATION_SPLIT_VIOLATION');
  }
  /* Only rows the frozen Stage 2L.7 arbiter would actually delegate on can teach
   * anything about delegation. Everything else is already Prime. */
  const opportunities = rows.filter((row) => row.baseDelegated);
  const oracleRows = opportunities.filter((row) => row.attestedExpert === 'ORACLE' && row.attestedSignals !== null);
  const nexusRows = opportunities.filter((row) => row.attestedExpert === 'NEXUS' && row.attestedSignals !== null);

  const oracleCandidates = [];
  for (const { ratioNumerator, ratioDenominator } of STAGE2L10_RATIO_LADDER) {
    for (const minFullSlopeMicro of STAGE2L10_MIN_FULL_SLOPE_LADDER) {
      const params = { ratioNumerator, ratioDenominator, minFullSlopeMicro };
      const observed = oracleRows.map((row) => ({ bucket: oracleUncertaintyBucket(row.attestedSignals, params), expertCorrect: row.expertCorrect }));
      const coherent = observed.filter((entry) => entry.bucket === 'ORACLE_DIRECTIONAL_COHERENT');
      const correct = coherent.filter((entry) => entry.expertCorrect).length;
      const reliability = coherent.length === 0 ? null : round(ratio(correct, coherent.length));
      oracleCandidates.push({
        ratioNumerator,
        ratioDenominator,
        minFullSlopeMicro,
        opportunities: coherent.length,
        reliability,
        qualifies: bucketStructurallyEligible('ORACLE_DIRECTIONAL_COHERENT')
          && coherent.length >= STAGE2L10_MIN_BUCKET_SAMPLES
          && reliability !== null && reliability >= STAGE2L10_MIN_BUCKET_RELIABILITY,
      });
    }
  }
  const oracleChoice = selectCandidate(oracleCandidates);
  const oracleParameters = oracleChoice === null
    // Nothing qualified: fail closed with the most conservative ladder entry; the
    // bucket table below will then authorise nothing.
    ? { ratioNumerator: STAGE2L10_RATIO_LADDER[0].ratioNumerator, ratioDenominator: STAGE2L10_RATIO_LADDER[0].ratioDenominator, minFullSlopeMicro: STAGE2L10_MIN_FULL_SLOPE_LADDER.at(-1) }
    : { ratioNumerator: oracleChoice.ratioNumerator, ratioDenominator: oracleChoice.ratioDenominator, minFullSlopeMicro: oracleChoice.minFullSlopeMicro };

  const nexusCandidates = STAGE2L10_WIDE_FAN_LADDER.map((minWideFanEntityCount) => {
    const params = { minWideFanEntityCount };
    const observed = nexusRows.map((row) => ({ bucket: nexusUncertaintyBucket(row.attestedSignals, params), expertCorrect: row.expertCorrect }));
    const best = STAGE2L10_NEXUS_BUCKETS.map((bucket) => {
      const subset = observed.filter((entry) => entry.bucket === bucket);
      const correct = subset.filter((entry) => entry.expertCorrect).length;
      const reliability = subset.length === 0 ? null : round(ratio(correct, subset.length));
      return { bucket, opportunities: subset.length, reliability, qualifies: bucketStructurallyEligible(bucket) && subset.length >= STAGE2L10_MIN_BUCKET_SAMPLES && reliability !== null && reliability >= STAGE2L10_MIN_BUCKET_RELIABILITY };
    });
    const qualifying = best.filter((entry) => entry.qualifies);
    return {
      minWideFanEntityCount,
      ratioNumerator: 1,
      ratioDenominator: 1,
      minFullSlopeMicro: 0,
      opportunities: qualifying.reduce((sum, entry) => sum + entry.opportunities, 0),
      qualifies: qualifying.length > 0,
      buckets: best,
    };
  });
  const nexusChoice = selectCandidate(nexusCandidates);
  const nexusParameters = { minWideFanEntityCount: nexusChoice === null ? STAGE2L10_WIDE_FAN_LADDER[0] : nexusChoice.minWideFanEntityCount };

  const oracleObservations = oracleRows.map((row) => ({
    bucket: oracleUncertaintyBucket(row.attestedSignals, oracleParameters),
    expertCorrect: row.expertCorrect,
    band: row.band,
    wouldHarm: row.basePrimeCorrect && !row.expertCorrect,
  }));
  const nexusObservations = nexusRows.map((row) => ({
    bucket: nexusUncertaintyBucket(row.attestedSignals, nexusParameters),
    expertCorrect: row.expertCorrect,
    band: row.band,
    wouldHarm: row.basePrimeCorrect && !row.expertCorrect,
  }));
  const oracleBuckets = bucketTable(oracleObservations, STAGE2L10_ORACLE_BUCKETS);
  const nexusBuckets = bucketTable(nexusObservations, STAGE2L10_NEXUS_BUCKETS);
  const oracleProtection = primeProtectionMargin(oracleObservations.map((entry) => ({ ...entry, gatePassed: oracleBuckets[entry.bucket]?.delegates === true })));
  const nexusProtection = primeProtectionMargin(nexusObservations.map((entry) => ({ ...entry, gatePassed: nexusBuckets[entry.bucket]?.delegates === true })));

  const derived = {
    calibrationVersion: 1,
    stage: STAGE2L10_STAGE,
    minBucketReliability: STAGE2L10_MIN_BUCKET_RELIABILITY,
    minBucketSamples: STAGE2L10_MIN_BUCKET_SAMPLES,
    oracle: {
      parameters: { ...oracleParameters, primeProtectionMarginMicro: oracleProtection.primeProtectionMarginMicro },
      measurementRuleIdentity: STAGE2L10_ORACLE_MEASUREMENT_RULE_IDENTITY,
      buckets: oracleBuckets,
      delegatingBuckets: STAGE2L10_ORACLE_BUCKETS.filter((bucket) => oracleBuckets[bucket].delegates),
      primeProtection: oracleProtection,
      sweep: oracleCandidates,
      selected: oracleChoice,
    },
    nexus: {
      parameters: { ...nexusParameters, primeProtectionMarginMicro: nexusProtection.primeProtectionMarginMicro },
      measurementRuleIdentity: STAGE2L10_NEXUS_MEASUREMENT_RULE_IDENTITY,
      buckets: nexusBuckets,
      delegatingBuckets: STAGE2L10_NEXUS_BUCKETS.filter((bucket) => nexusBuckets[bucket].delegates),
      primeProtection: nexusProtection,
      sweep: nexusCandidates,
      selected: nexusChoice,
    },
    calibrationCorpus: {
      split: 'CALIBRATION',
      cases: rows.length,
      delegationOpportunities: opportunities.length,
      oracleOpportunities: oracleRows.length,
      nexusOpportunities: nexusRows.length,
      corpusDigest: sha256(rows.map((row) => ({ caseId: row.caseId, bucketInput: row.attestedSignals }))),
    },
  };
  return deepFreeze({ ...derived, calibrationDigest: sha256(derived) });
}

/* ---------------------------------------------------------------------------
 * The Stage 2L.10 arbiter.
 *
 * Stage 2L.7 runs first, frozen, on a pristine Stage 2L.7 input and keeps its
 * veto. Stage 2L.10 may only convert one of its delegations into an abstention.
 * ------------------------------------------------------------------------- */

const INPUT_KEYS = deepFreeze(['schemaVersion', 'contract', 'shadowOnly', 'boundArbiterInput', 'correctnessAttestations', 'inputDigest']);

function sameKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, slot) => key === expected[slot]);
}
function digestIdentity(value) { return typeof value === 'string' && /^(sha256:)?[a-f0-9]{64}$/.test(value); }
function exact(left, right) { return sha256(left) === sha256(right); }
function integer(value) { return Number.isInteger(value); }

function validateSignals(expert, signals) {
  if (expert === 'ORACLE') {
    if (!sameKeys(signals, STAGE2L10_ORACLE_SIGNAL_KEYS)) return 'ORACLE_SIGNAL_SCHEMA_UNKNOWN';
    if (signals.kind !== 'ORACLE_DIRECTION_SLOPE_COHERENCE_V1') return 'ORACLE_SIGNAL_KIND_UNKNOWN';
    if (signals.head !== 'direction') return 'ORACLE_SIGNAL_HEAD_UNKNOWN';
    if (typeof signals.supported !== 'boolean') return 'ORACLE_SIGNAL_SUPPORT_INVALID';
    if (!ORACLE_LABELS.includes(signals.claim)) return 'ORACLE_SIGNAL_CLAIM_UNKNOWN';
    if (!integer(signals.confidence) || signals.confidence < 0) return 'ORACLE_SIGNAL_CONFIDENCE_INVALID';
    if (!integer(signals.fullSlopeMicro) || !integer(signals.recentSlopeMicro)) return 'ORACLE_SIGNAL_SLOPE_NOT_FIXED_POINT';
    if (!integer(signals.samples) || signals.samples < 0) return 'ORACLE_SIGNAL_SAMPLES_INVALID';
    if (typeof signals.historySufficiency !== 'string') return 'ORACLE_SIGNAL_SUFFICIENCY_INVALID';
    return null;
  }
  if (!sameKeys(signals, STAGE2L10_NEXUS_SIGNAL_KEYS)) return 'NEXUS_SIGNAL_SCHEMA_UNKNOWN';
  if (signals.kind !== 'NEXUS_STRUCTURAL_DETERMINACY_V1') return 'NEXUS_SIGNAL_KIND_UNKNOWN';
  for (const key of ['candidateIsSpof', 'redundantPathPresent', 'reachableWithoutCandidate', 'semanticOptimalityCertified']) {
    if (typeof signals[key] !== 'boolean') return `NEXUS_SIGNAL_${key.toUpperCase()}_INVALID`;
  }
  for (const key of ['spofNodeCount', 'spofEdgeCount', 'criticalCount', 'bottleneckCount', 'componentCount', 'entityCount', 'edgeCount']) {
    if (!integer(signals[key]) || signals[key] < 0) return `NEXUS_SIGNAL_${key.toUpperCase()}_INVALID`;
  }
  return null;
}

function validateAttestation(attestation, context, expert) {
  if (attestation === undefined || attestation === null) return { valid: false, reason: 'ATTESTATION_MISSING' };
  if (!sameKeys(attestation, ATTESTATION_KEYS)) return { valid: false, reason: 'ATTESTATION_SCHEMA_FIELDS_UNKNOWN' };
  const { attestationDigest, ...body } = attestation;
  if (!digestIdentity(attestationDigest) || sha256(body) !== attestationDigest) return { valid: false, reason: 'ATTESTATION_DIGEST_INVALID' };
  if (attestation.schemaVersion !== 1 || attestation.contract !== STAGE2L10_ATTESTATION_CONTRACT) return { valid: false, reason: 'ATTESTATION_CONTRACT_UNKNOWN' };
  if (attestation.expert !== expert) return { valid: false, reason: 'ATTESTATION_EXPERT_MISMATCH' };
  if (attestation.advisoryOnly !== true || attestation.actionGeneration !== false) return { valid: false, reason: 'ATTESTATION_AUTHORITY_ROLE_INVALID' };
  // Inherits staleness, cross-runtime, cross-campaign and cross-observation
  // rejection from the identical eight-field binding Stage 2L.7 uses.
  if (!exact(attestation.decisionBinding, attestationBinding(context))) return { valid: false, reason: 'ATTESTATION_DECISION_BINDING_MISMATCH' };
  const expectedRule = expert === 'ORACLE' ? STAGE2L10_ORACLE_MEASUREMENT_RULE_IDENTITY : STAGE2L10_NEXUS_MEASUREMENT_RULE_IDENTITY;
  if (attestation.measurementRuleIdentity !== expectedRule) return { valid: false, reason: 'ATTESTATION_UNKNOWN_MEASUREMENT_RULE' };
  if (!digestIdentity(attestation.evidencePacketDigest)) return { valid: false, reason: 'ATTESTATION_EVIDENCE_DIGEST_INVALID' };
  const signalFault = validateSignals(expert, attestation.signals);
  if (signalFault !== null) return { valid: false, reason: signalFault };
  return { valid: true, reason: 'ATTESTATION_VALID' };
}

/**
 * Decide whether a Stage 2L.7 delegation is positively justified. Default deny:
 * every path that is not an explicit, calibrated, sufficiently reliable bucket
 * returns an abstention.
 */
export function evaluateDelegationConfidence(input, base, calibration) {
  const deny = (reason, detail = {}) => ({ delegate: false, reason, expert: null, bucket: null, reliability: null, ...detail });
  if (!sameKeys(input, INPUT_KEYS)) return deny('delegation_abstained_input_schema_unknown');
  const { inputDigest, ...body } = input;
  if (!digestIdentity(inputDigest) || sha256(body) !== inputDigest) return deny('delegation_abstained_input_digest_invalid');
  if (input.schemaVersion !== 1 || input.contract !== STAGE2L10_INPUT_CONTRACT || input.shadowOnly !== true) return deny('delegation_abstained_input_contract_invalid');
  const context = input.boundArbiterInput?.decisionContext;
  if (!context) return deny('delegation_abstained_decision_context_absent');

  const participating = base.participatingEvidenceIdentities ?? [];
  if (participating.length !== 1) return deny('delegation_abstained_participating_evidence_not_single');
  const expert = participating[0].expert;
  const evidencePacketDigest = participating[0].packetDigest;

  const attestations = Array.isArray(input.correctnessAttestations) ? input.correctnessAttestations : null;
  if (attestations === null) return deny('delegation_abstained_attestations_malformed');
  const experts = attestations.map((entry) => entry?.expert);
  if (new Set(experts).size !== experts.length) return deny('delegation_abstained_duplicate_attestation');
  const attestation = attestations.find((entry) => entry?.expert === expert);
  if (attestation === undefined) return deny(`${expert.toLowerCase()}_correctness_attestation_absent`);

  const validation = validateAttestation(attestation, context, expert);
  if (!validation.valid) return deny(`delegation_abstained_${validation.reason.toLowerCase()}`);
  // The attestation must speak for the exact packet the Arbiter actually accepted.
  if (attestation.evidencePacketDigest !== evidencePacketDigest) return deny('delegation_abstained_attestation_not_bound_to_accepted_evidence');

  const table = expert === 'ORACLE' ? calibration.oracle : calibration.nexus;
  const bucket = uncertaintyBucketFor(expert, attestation.signals, calibration);
  if (bucket === null) return deny('delegation_abstained_uncertainty_bucket_underivable', { expert });
  const entry = table.buckets[bucket];
  if (entry === undefined) return deny('delegation_abstained_uncertainty_bucket_unknown', { expert, bucket });
  if (!entry.structurallyEligible) return deny(`${expert.toLowerCase()}_bucket_structurally_ineligible_abstain`, { expert, bucket, reliability: entry.reliability });
  if (!entry.calibrated) return deny(`${expert.toLowerCase()}_bucket_uncalibrated_abstain`, { expert, bucket, reliability: entry.reliability });
  if (!entry.delegates) {
    return deny(expert === 'ORACLE' ? 'oracle_temporal_support_insufficient' : 'nexus_relational_support_insufficient',
      { expert, bucket, reliability: entry.reliability });
  }

  /* Prime protection. Prime is the decision owner; an override must clear both a
   * calibrated reliability floor AND the calibrated margin band in which that
   * reliability was actually observed. */
  const marginMicro = micro(input.boundArbiterInput.prime.ambiguityMargin);
  if (marginMicro > table.parameters.primeProtectionMarginMicro) {
    return deny('prime_protection_margin_triggered', { expert, bucket, reliability: entry.reliability, marginMicro });
  }
  return {
    delegate: true,
    reason: expert === 'ORACLE' ? 'oracle_temporal_support_sufficient_reliability_above_threshold' : 'nexus_relational_support_sufficient_reliability_above_threshold',
    expert,
    bucket,
    reliability: entry.reliability,
    marginMicro,
    calibratedOpportunities: entry.opportunities,
  };
}

function stage2L10Output(input, base, selectedAction, disposition, reason, gate, calibration) {
  const primeAction = base.primeBaselineRecommendation;
  const body = {
    schemaVersion: 1,
    candidate: 'CALIBRATED_SELECTIVE_DELEGATION_ARBITER',
    shadowOnly: true,
    primaryDecisionEngine: 'PRIME',
    inheritedArbiter: 'STAGE2L7_EVIDENCE_IDENTITY_BOUND_DEFAULT_DENY_ARBITER',
    inheritedRuleTableDigest: STAGE2L7_ARBITER_RULE_DIGEST,
    inheritedFailClosedMatrixDigest: STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
    inheritedDecisionDigest: base.decisionDigest,
    inheritedAppliedRule: base.appliedRule,
    inheritedRecommendation: base.counterfactualFinalRecommendation,
    inheritedDecisionChanged: base.decisionChanged,
    calibrationDigest: calibration.calibrationDigest,
    disposition,
    delegationReason: reason,
    correctnessGate: gate === null ? null : {
      expert: gate.expert ?? null,
      uncertaintyBucket: gate.bucket ?? null,
      calibratedReliability: gate.reliability ?? null,
      minBucketReliability: calibration.minBucketReliability,
      ambiguityMarginMicro: gate.marginMicro ?? null,
      primeProtectionMarginMicro: gate.expert === 'ORACLE' ? calibration.oracle.parameters.primeProtectionMarginMicro
        : gate.expert === 'NEXUS' ? calibration.nexus.parameters.primeProtectionMarginMicro : null,
      calibratedOpportunities: gate.calibratedOpportunities ?? null,
    },
    primeBaselineRecommendation: primeAction,
    counterfactualFinalRecommendation: selectedAction,
    decisionChanged: selectedAction !== null && selectedAction !== primeAction,
    // Stage 2L.10 can only ever shrink the inherited delegation set.
    strictRefinementOfInherited: !(selectedAction !== null && selectedAction !== primeAction) || base.decisionChanged,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
    actionGenerated: false,
    worldMutation: false,
    dispatch: false,
    learnedRouting: false,
  };
  return deepFreeze({ ...body, decisionDigest: sha256(body) });
}

export function calibratedSelectiveDelegationArbiter(input, calibration = STAGE2L10_FROZEN_CALIBRATION) {
  const base = remediatedDeterministicArbiter(input?.boundArbiterInput);
  const primeAction = base.primeBaselineRecommendation;
  /* Stage 2L.7 kept Prime — through the ambiguity gate, the fail-closed matrix,
   * disagreement, consensus, or plain absence of valid evidence. Stage 2L.10 has
   * nothing to add and never overrides that. */
  if (!base.decisionChanged) {
    return stage2L10Output(input, base, base.counterfactualFinalRecommendation, 'PRIME_RETAINED', 'prime_retained_by_inherited_arbiter', null, calibration);
  }
  const gate = evaluateDelegationConfidence(input, base, calibration);
  if (!gate.delegate) return stage2L10Output(input, base, primeAction, 'ABSTAIN_FROM_DELEGATION', gate.reason, gate, calibration);
  return stage2L10Output(input, base, base.counterfactualFinalRecommendation, 'DELEGATE', gate.reason, gate, calibration);
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
    assessmentIdentity: identity({ caseId, expert: 'ORACLE', layer: 'STAGE2L10_ASSESSMENT' }),
    permissionIdentity: identity({ caseId, expert: 'ORACLE', layer: 'STAGE2L10_PERMISSION' }),
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
    assessmentIdentity: identity({ caseId, expert: 'NEXUS', layer: 'STAGE2L10_ASSESSMENT' }),
    permissionIdentity: identity({ caseId, expert: 'NEXUS', layer: 'STAGE2L10_PERMISSION' }),
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

function bindingOf(context) { return attestationBinding(context); }

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

function contextFor(split, caseId, observationIdentity, prime, requirement, index) {
  return createArbiterDecisionContext({
    runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY,
    campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY,
    observationIdentity,
    canonicalStateInput: { caseId, corpus: `STAGE2L10_${split}`, values: [index % 11, index % 13, index % 17] },
    prime: { selectedAction: prime.selectedAction, ranking: prime.ranking },
    oracleRequirement: requirement.oracle,
    nexusRequirement: requirement.nexus,
  });
}

const SPLIT_BASE = deepFreeze({ CALIBRATION: 10000000, HOLDOUT: 50000000 });
function caseIndex(split, family, variant) { return SPLIT_BASE[split] + family * 1000000 + variant; }
function casePrefix(split) { return split === 'CALIBRATION' ? 'stage2l10c' : 'stage2l10h'; }

/* --------------------------- Oracle-only cases --------------------------- */

export function buildOracleOnlyCase(split, variant) {
  const index = caseIndex(split, 1, variant);
  const caseId = `${casePrefix(split)}-oracle-${String(variant).padStart(5, '0')}`;
  const truth = stage2L10GroundTruth(split, index);
  const regime = STAGE2L10_ORACLE_REGIMES[truth.regimeIndex % STAGE2L10_ORACLE_REGIMES.length];
  const oracle = measureOracleClassification(split, caseId, regime, variant);

  const actionOf = (label) => `s2l10-${split[0]}${variant}-act-${label.toLowerCase()}`;
  const actions = ORACLE_LABELS.map(actionOf).concat([`s2l10-${split[0]}${variant}-act-alt`]);
  const truthAction = actionOf(oracle.trueRegime);
  const supportedAction = actionOf(oracle.signal);

  const prime = buildRanking({ actions, truthAction, supportedAction, primeCorrect: truth.primeCorrect, margin: truth.margin, supportInTieBand: truth.supportInTieBand });
  const channelId = `s2l10-${split[0]}${variant}-alpha`;
  const requirement = requirements(caseId, oracle.historyDigest, identity({ caseId, graph: 'UNUSED' }), { entityId: `s2l10-${caseId}-none`, entityType: 'none', canonicalKey: `none/s2l10-${caseId}-none` }, [], channelId);
  const context = contextFor(split, caseId, oracle.observationIdentity, prime, requirement, index);
  const oraclePacket = oracleEvidence(context, caseId, requirement, { active: true, actionId: supportedAction });
  const evidence = [oraclePacket, nexusEvidence(context, caseId, requirement, { active: false })];
  const attestations = [createCorrectnessAttestation({ expert: 'ORACLE', decisionContext: context, evidencePacketDigest: oraclePacket.packetDigest, signals: oracle.signals })];
  const input = buildStage2L10Input({ decisionContext: context, prime, expertEvidence: evidence, attestations });
  return deepFreeze({
    caseId, index, split, stratum: 'ORACLE_ONLY_RELEVANT', expert: 'ORACLE',
    semanticGroup: identity({ caseId, regime: regime.name, truthAction, supportedAction, band: truth.band }),
    band: truth.band, margin: truth.margin,
    regime: regime.name, regimeInherited: regime.inherited,
    expertSignal: oracle.signal, expertCorrect: oracle.correct, expertConfidence: oracle.confidence,
    attestedExpert: 'ORACLE', attestedSignals: oracle.signals,
    supportInTieBand: truth.supportInTieBand,
    truthAction, supportedAction, primeAction: prime.selectedAction,
    primeCorrect: prime.selectedAction === truthAction,
    relevant: true, failClosedRequired: false, attestationDefect: false,
    context, input,
  });
}

/* ---------------------------- Nexus-only cases ---------------------------- */

export function buildNexusOnlyCase(split, variant) {
  const index = caseIndex(split, 2, variant);
  const caseId = `${casePrefix(split)}-nexus-${String(variant).padStart(5, '0')}`;
  const truth = stage2L10GroundTruth(split, index);
  const nexus = measureNexusAnalysis(split, caseId, variant, truth.graphShapeIndex);

  const bridgeAction = `s2l10-${split[0]}${variant}-act-bridge`;
  const spurAction = `s2l10-${split[0]}${variant}-act-spur`;
  const idleAction = `s2l10-${split[0]}${variant}-act-idle`;
  const actions = [bridgeAction, spurAction, idleAction, `s2l10-${split[0]}${variant}-act-alt`];
  const analysisFoundBridge = nexus.supportedEntity === nexus.constructedBridge;
  const supportedAction = analysisFoundBridge ? bridgeAction : null;
  // Declared corpus parameter, inherited from Stage 2L.9 and independent of every
  // structural signal Nexus can observe.
  const truthAction = truth.nexusAligned ? bridgeAction : spurAction;

  const prime = buildRanking({
    actions, truthAction,
    supportedAction: supportedAction ?? idleAction,
    primeCorrect: truth.primeCorrect, margin: truth.margin, supportInTieBand: truth.supportInTieBand,
  });
  const channelId = `s2l10-${split[0]}${variant}-nexus-alpha`;
  const requirement = requirements(caseId, identity({ caseId, history: 'UNUSED' }), nexus.graphDigest, nexus.entity, nexus.edges, channelId);
  const observationIdentity = identity({ caseId, corpus: `STAGE2L10_NEXUS_${split}` });
  const context = contextFor(split, caseId, observationIdentity, prime, requirement, index);
  const nexusPacket = nexusEvidence(context, caseId, requirement, { active: supportedAction !== null, actionId: supportedAction });
  const evidence = [oracleEvidence(context, caseId, requirement, { active: false }), nexusPacket];
  const attestations = [createCorrectnessAttestation({ expert: 'NEXUS', decisionContext: context, evidencePacketDigest: nexusPacket.packetDigest, signals: nexus.signals })];
  const input = buildStage2L10Input({ decisionContext: context, prime, expertEvidence: evidence, attestations });
  return deepFreeze({
    caseId, index, split, stratum: 'NEXUS_ONLY_RELEVANT', expert: 'NEXUS',
    semanticGroup: identity({ caseId, shape: nexus.shape, truthAction, supportedAction, band: truth.band }),
    band: truth.band, margin: truth.margin,
    regime: nexus.shape, regimeInherited: nexus.shape === 'SINGLE_BRIDGE' || nexus.shape === 'REDUNDANT_PATH',
    expertSignal: analysisFoundBridge ? 'SPOF_BRIDGE' : 'NO_SPOF',
    expertCorrect: supportedAction !== null && supportedAction === truthAction,
    expertConfidence: analysisFoundBridge ? 1000000 : 0,
    attestedExpert: 'NEXUS', attestedSignals: nexus.signals,
    supportInTieBand: truth.supportInTieBand,
    truthAction, supportedAction, primeAction: prime.selectedAction,
    primeCorrect: prime.selectedAction === truthAction,
    relevant: supportedAction !== null, failClosedRequired: false, attestationDefect: false,
    context, input,
  });
}

/* ----------------------- Controls and adversarial ------------------------ */

/* A synthetic, unambiguously coherent Oracle signal set. Used only by controls
 * that need the correctness gate to be satisfied so that any abstention is
 * attributable to the defect under test rather than to weak evidence. */
const COHERENT_ORACLE_SIGNALS = deepFreeze({
  kind: 'ORACLE_DIRECTION_SLOPE_COHERENCE_V1',
  head: 'direction',
  supported: true,
  claim: 'UP',
  confidence: 750000,
  fullSlopeMicro: 30000,
  recentSlopeMicro: 30000,
  samples: 14,
  historySufficiency: 'ENOUGH_EVIDENCE',
});

const CERTAIN_NEXUS_SIGNALS = deepFreeze({
  kind: 'NEXUS_STRUCTURAL_DETERMINACY_V1',
  candidateIsSpof: true, spofNodeCount: 1, spofEdgeCount: 2, criticalCount: 1, bottleneckCount: 1,
  componentCount: 1, entityCount: 4, edgeCount: 3,
  redundantPathPresent: false, reachableWithoutCandidate: false, semanticOptimalityCertified: false,
});

function baseControl(split, caseId, index, variant) {
  const truth = stage2L10GroundTruth(split, index);
  const actions = Array.from({ length: 4 }, (unused, slot) => `s2l10-c${variant}-act${slot}`);
  const truthAction = actions[0];
  const supportedAction = actions[1];
  const prime = buildRanking({ actions, truthAction, supportedAction, primeCorrect: truth.primeCorrect, margin: truth.margin, supportInTieBand: true });
  const entity = { entityId: `s2l10-${caseId}-e`, entityType: 'relay', canonicalKey: `relay/s2l10-${caseId}-e` };
  const edges = [{ edgeId: `s2l10-${caseId}-edge`, sourceEntityId: entity.entityId, targetEntityId: `s2l10-${caseId}-t`, relation: 'DIRECTED_SUPPORT' }];
  const requirement = requirements(caseId, identity({ caseId, history: 'CTRL' }), identity({ caseId, graph: 'CTRL' }), entity, edges, `s2l10-c${variant}-alpha`);
  const observationIdentity = identity({ caseId, corpus: `STAGE2L10_CONTROL_${split}` });
  const context = contextFor(split, caseId, observationIdentity, prime, requirement, index);
  return { truth, actions, truthAction, supportedAction, prime, requirement, context, entity, edges };
}

function attestFor(expert, context, packet, signals) {
  return createCorrectnessAttestation({ expert, decisionContext: context, evidencePacketDigest: packet.packetDigest, signals });
}

export function buildControlCase(split, group, variant) {
  const index = caseIndex(split, 3 + STAGE2L10_CONTROL_GROUPS.indexOf(group), variant);
  const caseId = `${casePrefix(split)}-control-${group.toLowerCase()}-${String(variant).padStart(4, '0')}`;
  const base = baseControl(split, caseId, index, `${STAGE2L10_CONTROL_GROUPS.indexOf(group)}-${variant}`);
  const { context, requirement, prime, truthAction, supportedAction, actions } = base;
  const idleOracle = () => oracleEvidence(context, caseId, requirement, { active: false });
  const idleNexus = () => nexusEvidence(context, caseId, requirement, { active: false });

  let evidence;
  let attestations = [];
  switch (group) {
    case 'PRIME_ONLY_CONTROL':
    case 'NO_EXPERT_INFORMATION_CONTROL':
      evidence = [idleOracle(), idleNexus()]; break;
    case 'ORACLE_RELEVANT_CONTROL': {
      const packet = oracleEvidence(context, caseId, requirement, { active: true, actionId: truthAction });
      evidence = [packet, idleNexus()];
      attestations = [attestFor('ORACLE', context, packet, COHERENT_ORACLE_SIGNALS)];
      break;
    }
    case 'NEXUS_RELEVANT_CONTROL': {
      const packet = nexusEvidence(context, caseId, requirement, { active: true, actionId: truthAction });
      evidence = [idleOracle(), packet];
      attestations = [attestFor('NEXUS', context, packet, CERTAIN_NEXUS_SIGNALS)];
      break;
    }
    case 'ORACLE_IRRELEVANT_CONTROL':
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
    case 'BOTH_WRONG_CONTROL': {
      const oraclePacket = oracleEvidence(context, caseId, requirement, { active: true, actionId: supportedAction });
      const nexusPacket = nexusEvidence(context, caseId, requirement, { active: true, actionId: supportedAction });
      evidence = [oraclePacket, nexusPacket];
      attestations = [attestFor('ORACLE', context, oraclePacket, COHERENT_ORACLE_SIGNALS), attestFor('NEXUS', context, nexusPacket, CERTAIN_NEXUS_SIGNALS)];
      break;
    }
    default:
      throw new Error(`STAGE2L10_UNKNOWN_CONTROL:${group}`);
  }
  const input = buildStage2L10Input({ decisionContext: context, prime, expertEvidence: evidence, attestations });
  return deepFreeze({
    caseId, index, split, stratum: group,
    expert: group.startsWith('ORACLE') ? 'ORACLE' : group.startsWith('NEXUS') ? 'NEXUS' : 'NONE',
    semanticGroup: identity({ caseId, group, actions }),
    band: base.truth.band, margin: base.truth.margin, regime: 'CONTROL', regimeInherited: true,
    expertSignal: 'CONTROL',
    expertCorrect: group === 'ORACLE_RELEVANT_CONTROL' || group === 'NEXUS_RELEVANT_CONTROL',
    expertConfidence: 0,
    attestedExpert: group === 'ORACLE_RELEVANT_CONTROL' ? 'ORACLE' : group === 'NEXUS_RELEVANT_CONTROL' ? 'NEXUS' : null,
    attestedSignals: group === 'ORACLE_RELEVANT_CONTROL' ? COHERENT_ORACLE_SIGNALS : group === 'NEXUS_RELEVANT_CONTROL' ? CERTAIN_NEXUS_SIGNALS : null,
    supportInTieBand: true,
    truthAction, supportedAction, primeAction: prime.selectedAction,
    primeCorrect: prime.selectedAction === truthAction,
    relevant: ['ORACLE_RELEVANT_CONTROL', 'NEXUS_RELEVANT_CONTROL', 'BOTH_WRONG_CONTROL'].includes(group),
    failClosedRequired: false, attestationDefect: false,
    context, input,
  });
}

export function buildAdversarialCase(split, control, variant) {
  const index = caseIndex(split, 12 + STAGE2L10_ADVERSARIAL_CONTROLS.indexOf(control), variant);
  const caseId = `${casePrefix(split)}-adv-${control.toLowerCase()}-${String(variant).padStart(4, '0')}`;
  const base = baseControl(split, caseId, index, `adv${STAGE2L10_ADVERSARIAL_CONTROLS.indexOf(control)}-${variant}`);
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
      evidence = [rebind(live(), { decisionBinding: { ...bindingOf(context), runtimeIdentity: identity({ runtime: 'STAGE2L10_FOREIGN' }) } }), idleNexus()]; break;
    case 'SE_CROSS_OBSERVATION':
      evidence = [rebind(live(), { decisionBinding: { ...bindingOf(context), observationIdentity: identity({ caseId: `${caseId}-other`, corpus: `STAGE2L10_CONTROL_${split}` }) } }), idleNexus()]; break;
    case 'SE_CROSS_CAMPAIGN':
      evidence = [rebind(live(), { decisionBinding: { ...bindingOf(context), campaignIdentity: identity({ campaign: 'STAGE2L10_FOREIGN' }) } }), idleNexus()]; break;
    case 'SE_AMBIGUOUS_ACTION_BINDING':
      evidence = [oracleEvidence(context, caseId, requirement, { active: true, actionId: supportedAction, actionCanonicalKey: `display/${supportedAction}` }), idleNexus()]; break;
    case 'SE_AMBIGUOUS_CHANNEL_ENTITY_BINDING':
      evidence = variant % 2 === 0
        ? [oracleEvidence(context, caseId, requirement, { active: true, actionId: supportedAction, channelOverride: { ...requirement.oracle.channel, canonicalIdentity: `${requirement.oracle.channel.canonicalIdentity}-alias` } }), idleNexus()]
        : [oracleEvidence(context, caseId, requirement, { active: false }), nexusEvidence(context, caseId, requirement, { active: true, actionId: supportedAction, entityOverride: { ...base.entity, entityId: `${base.entity.entityId}-alias` } })];
      break;
    case 'SE_ILLEGAL_ACTION':
      evidence = [oracleEvidence(context, caseId, requirement, { active: true, actionId: `s2l10-${variant}-illegal`, actionCanonicalKey: `sentinel.action/s2l10-${variant}-illegal` }), idleNexus()]; break;
    case 'SE_UNKNOWN_SCHEMA':
      evidence = [rebind(live(), { schemaVersion: 77 }), idleNexus()]; break;
    case 'SE_UNKNOWN_RULE':
      evidence = [oracleEvidence(context, caseId, requirement, { active: false }), idleNexus(), deepFreeze({ schemaVersion: 2, expert: 'CIPHER', packetDigest: sha256({ cipher: caseId }) })]; break;
    case 'SE_CONFLICTING_DUPLICATE':
      evidence = [live(), oracleEvidence(context, caseId, requirement, { active: true, actionId: truthAction }), idleNexus()]; break;
    default:
      throw new Error(`STAGE2L10_UNKNOWN_ADVERSARIAL:${control}`);
  }
  /* A fully valid, maximally confident attestation rides along on every one of
   * these. If Stage 2L.10 ever rescued an attack the inherited Arbiter rejected,
   * this is where it would show. */
  const attestations = [createCorrectnessAttestation({ expert: 'ORACLE', decisionContext: context, evidencePacketDigest: sha256({ caseId, attack: control }), signals: COHERENT_ORACLE_SIGNALS })];
  const input = buildStage2L10Input({ decisionContext: context, prime, expertEvidence: evidence, attestations });
  return deepFreeze({
    caseId, index, split, stratum: control, expert: 'ORACLE',
    semanticGroup: identity({ caseId, control }),
    band: base.truth.band, margin: base.truth.margin, regime: 'ADVERSARIAL', regimeInherited: true,
    expertSignal: 'ADVERSARIAL', expertCorrect: false, expertConfidence: 0,
    attestedExpert: null, attestedSignals: null, supportInTieBand: true,
    truthAction, supportedAction, primeAction: prime.selectedAction,
    primeCorrect: prime.selectedAction === truthAction,
    relevant: false, failClosedRequired: true, attestationDefect: false,
    context, input,
  });
}

/* ------------------- Attacks on the attestation surface ------------------- */

/* These cases carry evidence the inherited Arbiter accepts and would delegate on,
 * with a Prime margin fixed inside the ambiguity region, so that the ONLY reason
 * an abstention can occur is the attestation defect under test. */
export function buildAttestationAttackCase(split, control, variant) {
  const index = caseIndex(split, 24 + STAGE2L10_ATTESTATION_CONTROLS.indexOf(control), variant);
  const caseId = `${casePrefix(split)}-att-${control.toLowerCase()}-${String(variant).padStart(4, '0')}`;
  const actions = Array.from({ length: 4 }, (unused, slot) => `s2l10-at${variant}-act${slot}`);
  const truthAction = actions[0];
  const supportedAction = actions[1];
  const margin = 0.010;
  const prime = buildRanking({ actions, truthAction, supportedAction, primeCorrect: true, margin, supportInTieBand: true });
  const entity = { entityId: `s2l10-${caseId}-e`, entityType: 'relay', canonicalKey: `relay/s2l10-${caseId}-e` };
  const edges = [{ edgeId: `s2l10-${caseId}-edge`, sourceEntityId: entity.entityId, targetEntityId: `s2l10-${caseId}-t`, relation: 'DIRECTED_SUPPORT' }];
  const requirement = requirements(caseId, identity({ caseId, history: 'ATT' }), identity({ caseId, graph: 'ATT' }), entity, edges, `s2l10-at${variant}-alpha`);
  const observationIdentity = identity({ caseId, corpus: `STAGE2L10_ATTESTATION_${split}` });
  const context = contextFor(split, caseId, observationIdentity, prime, requirement, index);
  const oraclePacket = oracleEvidence(context, caseId, requirement, { active: true, actionId: supportedAction });
  const nexusPacket = nexusEvidence(context, caseId, requirement, { active: false });
  const evidence = [oraclePacket, nexusPacket];
  const sound = () => attestFor('ORACLE', context, oraclePacket, COHERENT_ORACLE_SIGNALS);

  let attestations;
  switch (control) {
    case 'AT_MISSING_ATTESTATION': attestations = []; break;
    case 'AT_MALFORMED_ATTESTATION': {
      const body = structuredClone(sound());
      delete body.attestationDigest; delete body.measurementRuleIdentity;
      attestations = [deepFreeze({ ...body, attestationDigest: sha256(body) })]; break;
    }
    case 'AT_STALE_ATTESTATION':
      attestations = [createCorrectnessAttestation({
        expert: 'ORACLE', decisionContext: context, evidencePacketDigest: oraclePacket.packetDigest, signals: COHERENT_ORACLE_SIGNALS,
        decisionBindingOverride: { ...attestationBinding(context), observationIdentity: identity({ caseId, observation: 'PRIOR_TICK' }) },
      })]; break;
    case 'AT_CROSS_RUNTIME_ATTESTATION':
      attestations = [createCorrectnessAttestation({
        expert: 'ORACLE', decisionContext: context, evidencePacketDigest: oraclePacket.packetDigest, signals: COHERENT_ORACLE_SIGNALS,
        decisionBindingOverride: { ...attestationBinding(context), runtimeIdentity: identity({ runtime: 'STAGE2L10_FOREIGN' }) },
      })]; break;
    case 'AT_UNBOUND_EVIDENCE_DIGEST':
      attestations = [attestFor('ORACLE', context, nexusPacket, COHERENT_ORACLE_SIGNALS)]; break;
    case 'AT_FORGED_SIGNALS': {
      // Signals rewritten after sealing; the digest is left untouched.
      const original = sound();
      const body = structuredClone(original);
      delete body.attestationDigest;
      body.signals = { ...COHERENT_ORACLE_SIGNALS, fullSlopeMicro: 90000, recentSlopeMicro: 90000 };
      attestations = [deepFreeze({ ...body, attestationDigest: original.attestationDigest })]; break;
    }
    case 'AT_DUPLICATE_ATTESTATION':
      attestations = [sound(), createCorrectnessAttestation({
        expert: 'ORACLE', decisionContext: context, evidencePacketDigest: oraclePacket.packetDigest,
        signals: { ...COHERENT_ORACLE_SIGNALS, claim: 'DOWN', fullSlopeMicro: -30000, recentSlopeMicro: -30000 },
      })]; break;
    case 'AT_WRONG_EXPERT_ATTESTATION':
      attestations = [attestFor('NEXUS', context, oraclePacket, CERTAIN_NEXUS_SIGNALS)]; break;
    case 'AT_UNKNOWN_SIGNAL_KIND':
      attestations = [attestFor('ORACLE', context, oraclePacket, { ...COHERENT_ORACLE_SIGNALS, kind: 'ORACLE_UNREGISTERED_SIGNAL_V9' })]; break;
    default:
      throw new Error(`STAGE2L10_UNKNOWN_ATTESTATION_CONTROL:${control}`);
  }
  const input = buildStage2L10Input({ decisionContext: context, prime, expertEvidence: evidence, attestations });
  return deepFreeze({
    caseId, index, split, stratum: control, expert: 'ORACLE',
    semanticGroup: identity({ caseId, control }),
    band: 'Q_MARGIN_0_010', margin, regime: 'ATTESTATION_ATTACK', regimeInherited: false,
    expertSignal: 'ATTESTATION_ATTACK', expertCorrect: false, expertConfidence: 0,
    attestedExpert: null, attestedSignals: null, supportInTieBand: true,
    truthAction, supportedAction, primeAction: prime.selectedAction,
    primeCorrect: prime.selectedAction === truthAction,
    relevant: true, failClosedRequired: false, attestationDefect: true,
    context, input,
  });
}

/* ------------------------------- Corpus ---------------------------------- */

export function buildStage2L10Corpus(split) {
  if (!STAGE2L10_SPLITS.includes(split)) throw new Error(`STAGE2L10_UNKNOWN_SPLIT:${split}`);
  const calibration = split === 'CALIBRATION';
  const oracleCases = calibration ? STAGE2L10_CALIBRATION_ORACLE_CASES : STAGE2L10_HOLDOUT_ORACLE_CASES;
  const nexusCases = calibration ? STAGE2L10_CALIBRATION_NEXUS_CASES : STAGE2L10_HOLDOUT_NEXUS_CASES;
  const controlCases = calibration ? STAGE2L10_CALIBRATION_CONTROL_CASES : STAGE2L10_HOLDOUT_CONTROL_CASES;
  const adversarialCases = calibration ? STAGE2L10_CALIBRATION_ADVERSARIAL_CASES : STAGE2L10_HOLDOUT_ADVERSARIAL_CASES;
  const oracle = Array.from({ length: oracleCases }, (unused, variant) => buildOracleOnlyCase(split, variant));
  const nexus = Array.from({ length: nexusCases }, (unused, variant) => buildNexusOnlyCase(split, variant));
  const controls = STAGE2L10_CONTROL_GROUPS.flatMap((group) => Array.from({ length: controlCases }, (unused, variant) => buildControlCase(split, group, variant)));
  const adversarial = STAGE2L10_ADVERSARIAL_CONTROLS.flatMap((control) => Array.from({ length: adversarialCases }, (unused, variant) => buildAdversarialCase(split, control, variant)));
  const attestation = STAGE2L10_ATTESTATION_CONTROLS.flatMap((control) => Array.from({ length: adversarialCases }, (unused, variant) => buildAttestationAttackCase(split, control, variant)));
  return deepFreeze([...oracle, ...nexus, ...controls, ...adversarial, ...attestation]);
}

/* ------------------------------- Runners --------------------------------- */

function baseRow(record) {
  const base = runArbiterWithFailureIsolation(record.input.boundArbiterInput, remediatedDeterministicArbiter);
  const selected = base.counterfactualFinalRecommendation;
  return {
    caseId: record.caseId,
    split: record.split,
    stratum: record.stratum,
    expert: record.expert,
    band: record.band,
    margin: record.margin,
    regime: record.regime,
    regimeInherited: record.regimeInherited,
    expertSignal: record.expertSignal,
    expertCorrect: record.expertCorrect,
    attestedExpert: record.attestedExpert,
    attestedSignals: record.attestedSignals,
    relevant: record.relevant,
    failClosedRequired: record.failClosedRequired,
    attestationDefect: record.attestationDefect,
    supportInTieBand: record.supportInTieBand,
    primeAction: record.primeAction,
    truthAction: record.truthAction,
    supportedAction: record.supportedAction,
    basePrimeCorrect: record.primeCorrect,
    baseSelectedAction: selected,
    baseDelegated: selected !== null && selected !== record.primeAction,
    baseAcceptedExperts: base.participatingEvidenceIdentities.map((entry) => entry.expert),
    baseEvidenceAccepted: base.participatingEvidenceIdentities.length,
    baseDecisionDigest: base.decisionDigest,
  };
}

/** Base pass: the frozen Stage 2L.7 arbiter alone. Used to derive calibration. */
export function runStage2L10Base(corpus) {
  return corpus.map((record) => baseRow(record));
}

/** Full pass: Stage 2L.7 followed by the Stage 2L.10 correctness gate. */
export function runStage2L10(corpus, calibration = STAGE2L10_FROZEN_CALIBRATION) {
  return corpus.map((record) => {
    const row = baseRow(record);
    const result = runArbiterWithFailureIsolation(record.input, (input) => calibratedSelectiveDelegationArbiter(input, calibration));
    const selected = result.counterfactualFinalRecommendation;
    const changed = selected !== null && selected !== record.primeAction;
    const selectedCorrect = selected === record.truthAction;
    const primeCorrect = record.primeCorrect;
    return {
      ...row,
      selectedAction: selected,
      disposition: result.disposition,
      delegationReason: result.delegationReason,
      uncertaintyBucket: result.correctnessGate?.uncertaintyBucket ?? null,
      calibratedReliability: result.correctnessGate?.calibratedReliability ?? null,
      decisionDigest: result.decisionDigest,
      strictRefinementOfInherited: result.strictRefinementOfInherited,
      changed,
      primeCorrect,
      selectedCorrect,
      beneficial: changed && selectedCorrect && !primeCorrect,
      harmful: changed && !selectedCorrect && primeCorrect,
      neutral: changed && ((selectedCorrect && primeCorrect) || (!selectedCorrect && !primeCorrect)),
      breaksCorrectPrime: changed && primeCorrect && !selectedCorrect,
      causallyAttributed: !changed || (row.baseEvidenceAccepted === 1 && selected === record.supportedAction),
      /* A delegation OPPORTUNITY exists only where the expert is relevant and points
       * somewhere other than Prime's own pick. Conditioning on this is what makes
       * the discrimination metric meaningful: a correct expert agreeing with a
       * correct Prime produces no change by logic, not by judgement. Inherited
       * verbatim from Stage 2L.9 so the two stages remain comparable. */
      delegationOpportunity: record.relevant
        && record.supportedAction !== null
        && record.supportedAction !== record.primeAction,
      // Abstention is only meaningful where the inherited Arbiter wanted to delegate.
      abstained: row.baseDelegated && !changed,
    };
  });
}

/* ---------------------------------------------------------------------------
 * The frozen calibration.
 *
 * Only the decision-relevant subset of the derivation is frozen and read at
 * runtime: parameters, bucket reliability tables and the two floors. The sweep
 * and the selection trace live in the artifact, not in the decision path. A test
 * asserts that re-deriving from the calibration corpus reproduces this object
 * exactly, so the freeze can never silently drift from its evidence.
 * ------------------------------------------------------------------------- */

export function freezeCalibration(derived) {
  const expert = (side) => ({
    parameters: { ...derived[side].parameters },
    measurementRuleIdentity: derived[side].measurementRuleIdentity,
    buckets: Object.fromEntries(Object.entries(derived[side].buckets).map(([bucket, entry]) => [bucket, {
      opportunities: entry.opportunities,
      expertCorrect: entry.expertCorrect,
      expertWrong: entry.expertWrong,
      reliability: entry.reliability,
      calibrated: entry.calibrated,
      structurallyEligible: entry.structurallyEligible,
      delegates: entry.delegates,
    }])),
    delegatingBuckets: [...derived[side].delegatingBuckets],
  });
  const body = {
    calibrationVersion: derived.calibrationVersion,
    stage: derived.stage,
    minBucketReliability: derived.minBucketReliability,
    minBucketSamples: derived.minBucketSamples,
    oracle: expert('oracle'),
    nexus: expert('nexus'),
    calibrationCorpusDigest: derived.calibrationCorpus.corpusDigest,
    calibrationCases: derived.calibrationCorpus.cases,
    calibrationDelegationOpportunities: derived.calibrationCorpus.delegationOpportunities,
  };
  return deepFreeze({ ...body, calibrationDigest: sha256(body) });
}

export const STAGE2L10_FROZEN_CALIBRATION = freezeCalibration({
  calibrationVersion: 1,
  stage: STAGE2L10_STAGE,
  minBucketReliability: STAGE2L10_MIN_BUCKET_RELIABILITY,
  minBucketSamples: STAGE2L10_MIN_BUCKET_SAMPLES,
  oracle: {
    parameters: { ratioNumerator: 3, ratioDenominator: 2, minFullSlopeMicro: 500, primeProtectionMarginMicro: 30000 },
    measurementRuleIdentity: STAGE2L10_ORACLE_MEASUREMENT_RULE_IDENTITY,
    buckets: {
    ORACLE_UNSUPPORTED_HEAD: { opportunities: 82, expertCorrect: 82, expertWrong: 0, reliability: 1, calibrated: true, structurallyEligible: false, delegates: false },
    ORACLE_STABLE_EXACT: { opportunities: 117, expertCorrect: 117, expertWrong: 0, reliability: 1, calibrated: true, structurallyEligible: true, delegates: true },
    ORACLE_STABLE_UNSTEADY: { opportunities: 148, expertCorrect: 0, expertWrong: 148, reliability: 0, calibrated: true, structurallyEligible: false, delegates: false },
    ORACLE_DIRECTIONAL_FULL_WINDOW_FLAT: { opportunities: 202, expertCorrect: 0, expertWrong: 202, reliability: 0, calibrated: true, structurallyEligible: true, delegates: false },
    ORACLE_DIRECTIONAL_CONTRADICTED: { opportunities: 207, expertCorrect: 25, expertWrong: 182, reliability: 0.120773, calibrated: true, structurallyEligible: true, delegates: false },
    ORACLE_DIRECTIONAL_RECENT_DOMINATED: { opportunities: 265, expertCorrect: 55, expertWrong: 210, reliability: 0.207547, calibrated: true, structurallyEligible: true, delegates: false },
    ORACLE_DIRECTIONAL_COHERENT: { opportunities: 449, expertCorrect: 449, expertWrong: 0, reliability: 1, calibrated: true, structurallyEligible: true, delegates: true },
    },
    delegatingBuckets: ['ORACLE_STABLE_EXACT', 'ORACLE_DIRECTIONAL_COHERENT'],
  },
  nexus: {
    parameters: { minWideFanEntityCount: 6, primeProtectionMarginMicro: 30000 },
    measurementRuleIdentity: STAGE2L10_NEXUS_MEASUREMENT_RULE_IDENTITY,
    buckets: {
    NEXUS_NO_STRUCTURAL_CRITICALITY: { opportunities: 0, expertCorrect: 0, expertWrong: 0, reliability: null, calibrated: false, structurallyEligible: false, delegates: false },
    NEXUS_REDUNDANT_PATH: { opportunities: 0, expertCorrect: 0, expertWrong: 0, reliability: null, calibrated: false, structurallyEligible: true, delegates: false },
    NEXUS_MULTIPLE_CRITICAL_NODES: { opportunities: 364, expertCorrect: 190, expertWrong: 174, reliability: 0.521978, calibrated: true, structurallyEligible: true, delegates: false },
    NEXUS_WIDE_FAN_CRITICAL: { opportunities: 371, expertCorrect: 202, expertWrong: 169, reliability: 0.544474, calibrated: true, structurallyEligible: true, delegates: false },
    NEXUS_SOLE_CRITICAL_NODE: { opportunities: 349, expertCorrect: 183, expertWrong: 166, reliability: 0.524355, calibrated: true, structurallyEligible: true, delegates: false },
    },
    delegatingBuckets: [],
  },
  calibrationCorpus: {
    corpusDigest: '2ee292bb04ce7508f80cb913cc9d69bef380f4a23977ef6e41129a807d361155',
    cases: 8450,
    delegationOpportunities: 3004,
  },
});
export const STAGE2L10_CALIBRATION_IDENTITY = identity(STAGE2L10_FROZEN_CALIBRATION);

/* ---------------------------------------------------------------------------
 * Metrics. Definitions are inherited from Stage 2L.9 verbatim — same numerators,
 * same denominators — so the two stages are directly comparable and no bound is
 * met by redefining it.
 * ------------------------------------------------------------------------- */

function metricsOf(rows) {
  const cases = rows.length;
  const changes = rows.filter((row) => row.changed);
  const beneficial = changes.filter((row) => row.beneficial).length;
  const harmful = changes.filter((row) => row.harmful).length;
  const breaks = rows.filter((row) => row.breaksCorrectPrime).length;
  const primeCorrect = rows.filter((row) => row.primeCorrect).length;
  const arbiterCorrect = rows.filter((row) => row.selectedCorrect).length;
  const repairable = rows.filter((row) => !row.primeCorrect).length;
  const inheritedDelegations = rows.filter((row) => row.baseDelegated).length;
  return {
    totalCases: cases,
    eligibleCases: rows.filter((row) => row.baseEvidenceAccepted > 0).length,
    selectionChanges: changes.length,
    beneficialChanges: beneficial,
    harmfulChanges: harmful,
    neutralChanges: changes.filter((row) => row.neutral).length,
    harmfulChangeRate: round(ratio(harmful, cases)),
    correctPrimeBreaks: breaks,
    correctPrimeBreakRate: round(ratio(breaks, cases)),
    precision: round(ratio(beneficial, changes.length)),
    repairRate: round(ratio(beneficial, repairable)),
    primeOnlyTop1: round(ratio(primeCorrect, cases)),
    arbiterTop1: round(ratio(arbiterCorrect, cases)),
    decisionDelta: round(ratio(arbiterCorrect, cases) - ratio(primeCorrect, cases)),
    // Stage 2L.10 additions.
    inheritedDelegations,
    delegations: changes.length,
    delegationRate: round(ratio(changes.length, cases)),
    abstentions: rows.filter((row) => row.abstained).length,
    abstentionRate: round(ratio(rows.filter((row) => row.abstained).length, cases)),
    abstentionRateAmongInheritedDelegations: round(ratio(rows.filter((row) => row.abstained).length, inheritedDelegations)),
  };
}

/* The correctness confusion matrix the stage exists to produce, over delegation
 * opportunities only — the conditioning inherited from Stage 2L.9. */
function correctnessMatrix(rows) {
  const eligible = rows.filter((row) => row.delegationOpportunity);
  const cell = (correct, delegated) => eligible.filter((row) => row.expertCorrect === correct && row.changed === delegated).length;
  const expertCorrectDelegated = cell(true, true);
  const expertCorrectAbstained = cell(true, false);
  const expertWrongDelegated = cell(false, true);
  const expertWrongAbstained = cell(false, false);
  const correctTotal = expertCorrectDelegated + expertCorrectAbstained;
  const wrongTotal = expertWrongDelegated + expertWrongAbstained;
  const delegationRateWhenCorrect = round(ratio(expertCorrectDelegated, correctTotal));
  const delegationRateWhenWrong = round(ratio(expertWrongDelegated, wrongTotal));
  return {
    delegationOpportunities: eligible.length,
    expertCorrectDelegated,
    expertCorrectAbstained,
    expertWrongDelegated,
    expertWrongAbstained,
    delegationRateWhenCorrect,
    delegationRateWhenWrong,
    /* The real discrimination metric: how much more often delegation happens when
     * the expert is right than when it is wrong. Stage 2L.9 measured -0.0038 for
     * Oracle, i.e. none at all. */
    correctnessDiscrimination: round(delegationRateWhenCorrect - delegationRateWhenWrong),
    delegationPrecisionOverOpportunities: round(ratio(expertCorrectDelegated, expertCorrectDelegated + expertWrongDelegated)),
  };
}

function bucketUsage(rows, buckets) {
  return Object.fromEntries(buckets.map((bucket) => {
    const subset = rows.filter((row) => row.uncertaintyBucket === bucket);
    return [bucket, {
      cases: subset.length,
      delegated: subset.filter((row) => row.changed).length,
      abstained: subset.filter((row) => row.abstained).length,
      expertCorrect: subset.filter((row) => row.expertCorrect).length,
      harmfulChanges: subset.filter((row) => row.harmful).length,
    }];
  }));
}

function regimeBreakdown(rows) {
  const names = [...new Set(rows.map((row) => row.regime))].sort();
  return Object.fromEntries(names.map((regime) => {
    const subset = rows.filter((row) => row.regime === regime);
    const delegated = subset.filter((row) => row.changed);
    return [regime, {
      cases: subset.length,
      expertCorrect: subset.filter((row) => row.expertCorrect).length,
      delegated: delegated.length,
      delegatedExpertCorrect: delegated.filter((row) => row.expertCorrect).length,
      beneficialChanges: delegated.filter((row) => row.beneficial).length,
      harmfulChanges: delegated.filter((row) => row.harmful).length,
      inherited: subset[0]?.regimeInherited === true,
    }];
  }));
}

function marginCurve(rows) {
  const single = rows.filter((row) => ['ORACLE_ONLY_RELEVANT', 'NEXUS_ONLY_RELEVANT'].includes(row.stratum));
  return Object.fromEntries(STAGE2L10_MARGIN_BANDS.map((band) => {
    const subset = single.filter((row) => row.band === band);
    const metrics = metricsOf(subset);
    return [band, {
      cases: metrics.totalCases,
      inheritedDelegations: metrics.inheritedDelegations,
      delegations: metrics.delegations,
      abstentions: metrics.abstentions,
      beneficialChanges: metrics.beneficialChanges,
      harmfulChanges: metrics.harmfulChanges,
      precision: metrics.precision,
    }];
  }));
}

function safetyBounds(rows) {
  const inStratum = (name) => rows.filter((row) => row.stratum === name);
  const acceptedIn = (names) => names.reduce((total, name) => total + inStratum(name).filter((row) => row.baseEvidenceAccepted > 0).length, 0);
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
    oracleSelectionInfluenceFromNexus: rows.filter((row) => row.stratum === 'ORACLE_ONLY_RELEVANT' && row.baseAcceptedExperts.includes('NEXUS')).length,
    nexusSelectionInfluenceFromOracle: rows.filter((row) => row.stratum === 'NEXUS_ONLY_RELEVANT' && row.baseAcceptedExperts.includes('ORACLE')).length,
    allSingleExpertChangesCausallyAttributed: rows.every((row) => row.causallyAttributed),
    /* New Stage 2L.10 surface: every attack on the attestation must abstain, and
     * Stage 2L.10 must never resurrect a delegation Stage 2L.7 refused. */
    attestationAttackDelegations: STAGE2L10_ATTESTATION_CONTROLS.reduce((total, control) => total + inStratum(control).filter((row) => row.changed).length, 0),
    attestationAttackInheritedDelegations: STAGE2L10_ATTESTATION_CONTROLS.reduce((total, control) => total + inStratum(control).filter((row) => row.baseDelegated).length, 0),
    delegationsNotAuthorisedByInheritedArbiter: rows.filter((row) => row.changed && !row.baseDelegated).length,
    strictRefinementOfInheritedArbiter: rows.every((row) => row.strictRefinementOfInherited),
  });
}

function boundsPass(bounds) {
  return bounds.arbiterHarmfulChangeRate <= STAGE2L10_MAX_HARMFUL_CHANGE_RATE
    && bounds.arbiterCorrectPrimeBreakRate <= STAGE2L10_MAX_CORRECT_PRIME_BREAK_RATE
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
    && bounds.allSingleExpertChangesCausallyAttributed
    && bounds.attestationAttackDelegations === 0
    && bounds.attestationAttackInheritedDelegations > 0
    && bounds.delegationsNotAuthorisedByInheritedArbiter === 0
    && bounds.strictRefinementOfInheritedArbiter;
}

/* ---------------------------------------------------------------------------
 * Label-leakage audit.
 *
 * Two independent checks, because "we did not intend to leak" is not evidence.
 *
 *   STRUCTURAL: no key anywhere in a Stage 2L.10 arbiter input may name an
 *   outcome, a truth action, a case identity, a corpus index or a split.
 *
 *   BEHAVIOURAL: across the whole holdout, the disposition must be a function of
 *   (uncertainty bucket, margin band, inherited delegation) ALONE. If knowing
 *   whether the expert was right could change the decision, some group keyed on
 *   those three would have to split by correctness. None may.
 * ------------------------------------------------------------------------- */

function collectKeys(value, into = new Set(), depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') return into;
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, into, depth + 1);
    return into;
  }
  for (const [key, entry] of Object.entries(value)) {
    into.add(key);
    collectKeys(entry, into, depth + 1);
  }
  return into;
}

export function auditStage2L10LabelLeakage(corpus, rows) {
  const sampled = corpus.slice(0, 250);
  const keys = sampled.reduce((into, record) => collectKeys(record.input, into), new Set());
  const forbiddenKeysPresent = STAGE2L10_FORBIDDEN_RUNTIME_KEYS.filter((key) => keys.has(key));

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.uncertaintyBucket}|${row.band}|${row.baseDelegated}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(row.disposition);
  }
  const splitGroups = [...groups.entries()].filter(([, dispositions]) => dispositions.size > 1).map(([key]) => key);

  /* A third, blunt check: the decision digest must never vary with correctness
   * once bucket, band and inherited delegation are fixed. */
  const digestGroups = new Map();
  for (const row of rows) {
    const key = `${row.uncertaintyBucket}|${row.band}|${row.baseDelegated}|${row.expertCorrect}`;
    if (!digestGroups.has(key)) digestGroups.set(key, new Set());
    digestGroups.get(key).add(row.disposition);
  }
  const correctnessSensitiveGroups = [...groups.keys()].filter((key) => {
    const withCorrect = digestGroups.get(`${key}|true`);
    const withWrong = digestGroups.get(`${key}|false`);
    if (!withCorrect || !withWrong) return false;
    return [...withCorrect].sort().join(',') !== [...withWrong].sort().join(',');
  });

  return deepFreeze({
    inputKeysInspected: keys.size,
    forbiddenRuntimeKeysScanned: [...STAGE2L10_FORBIDDEN_RUNTIME_KEYS],
    forbiddenKeysPresent,
    dispositionGroups: groups.size,
    dispositionGroupsSplitByAnything: splitGroups,
    correctnessSensitiveGroups,
    labelLeakageDetected: forbiddenKeysPresent.length > 0 || correctnessSensitiveGroups.length > 0,
  });
}

/* ---------------------------------------------------------------------------
 * Invariance, failure isolation, performance
 * ------------------------------------------------------------------------- */

export function runStage2L10Invariance() {
  const sample = [
    buildOracleOnlyCase('HOLDOUT', 5),
    buildNexusOnlyCase('HOLDOUT', 5),
    buildControlCase('HOLDOUT', 'ORACLE_RELEVANT_CONTROL', 5),
    buildAdversarialCase('HOLDOUT', 'SE_STALE_EVIDENCE', 5),
    buildAttestationAttackCase('HOLDOUT', 'AT_STALE_ATTESTATION', 5),
  ];
  const digestOf = (record, input) => calibratedSelectiveDelegationArbiter(input).decisionDigest;
  const evidenceOrder = sample.every((record) => {
    const reordered = buildStage2L10Input({
      decisionContext: record.context,
      prime: { selectedAction: record.input.boundArbiterInput.prime.selectedAction, ranking: record.input.boundArbiterInput.prime.rankedLegalActions },
      expertEvidence: [...record.input.boundArbiterInput.expertEvidence].reverse(),
      attestations: record.input.correctnessAttestations,
    });
    return digestOf(record, reordered) === digestOf(record, record.input);
  });
  const attestationOrder = sample.every((record) => {
    const reordered = buildStage2L10Input({
      decisionContext: record.context,
      prime: { selectedAction: record.input.boundArbiterInput.prime.selectedAction, ranking: record.input.boundArbiterInput.prime.rankedLegalActions },
      expertEvidence: record.input.boundArbiterInput.expertEvidence,
      attestations: [...record.input.correctnessAttestations].reverse(),
    });
    return digestOf(record, reordered) === digestOf(record, record.input);
  });
  const legalOrder = sample.every((record) => {
    const rebuilt = createArbiterDecisionContext({
      runtimeIdentity: record.context.runtimeIdentity,
      campaignIdentity: record.context.campaignIdentity,
      observationIdentity: record.context.observationIdentity,
      canonicalStateInput: { caseId: record.caseId, corpus: `STAGE2L10_${record.split}`, values: [record.index % 11, record.index % 13, record.index % 17] },
      prime: { selectedAction: record.input.boundArbiterInput.prime.selectedAction, ranking: [...record.input.boundArbiterInput.prime.rankedLegalActions].reverse() },
      legalActions: [...record.context.legalActions].reverse(),
      oracleRequirement: record.context.expertRequirements.oracle,
      nexusRequirement: record.context.expertRequirements.nexus,
    });
    return rebuilt.contextDigest === record.context.contextDigest;
  });
  const duplicateNoAmplification = sample.every((record) => {
    const first = record.input.boundArbiterInput.expertEvidence[0];
    const duplicated = buildStage2L10Input({
      decisionContext: record.context,
      prime: { selectedAction: record.input.boundArbiterInput.prime.selectedAction, ranking: record.input.boundArbiterInput.prime.rankedLegalActions },
      expertEvidence: [...record.input.boundArbiterInput.expertEvidence, first],
      attestations: record.input.correctnessAttestations,
    });
    const result = calibratedSelectiveDelegationArbiter(duplicated);
    return result.counterfactualFinalRecommendation === record.primeAction;
  });
  const duplicateAttestationFailsClosed = (() => {
    const record = buildAttestationAttackCase('HOLDOUT', 'AT_DUPLICATE_ATTESTATION', 1);
    const result = calibratedSelectiveDelegationArbiter(record.input);
    return result.counterfactualFinalRecommendation === record.primeAction && result.disposition === 'ABSTAIN_FROM_DELEGATION';
  })();
  const conflictingFailsClosed = (() => {
    const record = buildAdversarialCase('HOLDOUT', 'SE_CONFLICTING_DUPLICATE', 1);
    const result = calibratedSelectiveDelegationArbiter(record.input);
    return result.counterfactualFinalRecommendation === record.primeAction;
  })();
  return deepFreeze({
    legalActionOrderInvariant: legalOrder,
    expertEvidenceOrderInvariant: evidenceOrder,
    attestationOrderInvariant: attestationOrder,
    nexusEntityOrderInvariant: legalOrder,
    nexusEdgeOrderInvariant: legalOrder,
    duplicateEvidenceDoesNotAmplifySupport: duplicateNoAmplification,
    duplicateAttestationFailsClosed,
    conflictingDuplicateFailsClosed: conflictingFailsClosed,
  });
}

export function runStage2L10FailureIsolation() {
  const record = buildOracleOnlyCase('HOLDOUT', 11);
  const primeAction = record.primeAction;
  const explode = () => { throw new Error('STAGE2L10_INJECTED_FAILURE'); };
  const arbiterFailure = runArbiterWithFailureIsolation(record.input, explode);
  const gateFailure = runArbiterWithFailureIsolation(record.input, (input) => calibratedSelectiveDelegationArbiter(input, null));
  const brokenAttestation = runArbiterWithFailureIsolation(
    buildStage2L10Input({
      decisionContext: record.context,
      prime: { selectedAction: record.input.boundArbiterInput.prime.selectedAction, ranking: record.input.boundArbiterInput.prime.rankedLegalActions },
      expertEvidence: record.input.boundArbiterInput.expertEvidence,
      attestations: [deepFreeze({ expert: 'ORACLE', attestationDigest: sha256({ broken: 'ORACLE' }) })],
    }),
    (input) => calibratedSelectiveDelegationArbiter(input),
  );
  const brokenOracle = runArbiterWithFailureIsolation(
    buildStage2L10Input({
      decisionContext: record.context,
      prime: { selectedAction: record.input.boundArbiterInput.prime.selectedAction, ranking: record.input.boundArbiterInput.prime.rankedLegalActions },
      expertEvidence: [deepFreeze({ expert: 'ORACLE', packetDigest: sha256({ broken: 'ORACLE' }) })],
      attestations: record.input.correctnessAttestations,
    }),
    (input) => calibratedSelectiveDelegationArbiter(input),
  );
  const safe = (result) => result.counterfactualFinalRecommendation === primeAction || result.counterfactualFinalRecommendation === null;
  const inert = (result) => result.actionGenerated === false && result.dispatch === false && result.worldMutation === false;
  return deepFreeze({
    arbiterFailureReturnsPrime: safe(arbiterFailure) && inert(arbiterFailure),
    calibrationFailureReturnsPrime: safe(gateFailure) && inert(gateFailure),
    attestationFailureReturnsPrime: safe(brokenAttestation) && inert(brokenAttestation),
    oracleFailureSafe: safe(brokenOracle) && inert(brokenOracle),
    noExpertAuthorizedAction: [arbiterFailure, gateFailure, brokenAttestation, brokenOracle].every(inert),
  });
}

export function benchmarkStage2L10(samples = 400) {
  const oracleCases = Array.from({ length: samples }, (unused, variant) => buildOracleOnlyCase('HOLDOUT', variant));
  const nexusCases = Array.from({ length: samples }, (unused, variant) => buildNexusOnlyCase('HOLDOUT', variant));
  const timed = (records, fn) => {
    const durations = records.map((record) => { const start = process.hrtime.bigint(); fn(record); return Number(process.hrtime.bigint() - start) / 1e6; });
    return { median: round(percentile(durations, 0.5)), p95: round(percentile(durations, 0.95)), p99: round(percentile(durations, 0.99)) };
  };
  const primeOnly = timed(oracleCases, (record) => record.input.boundArbiterInput.prime.selectedAction);
  const inherited = timed(oracleCases, (record) => remediatedDeterministicArbiter(record.input.boundArbiterInput));
  const full = timed(oracleCases, (record) => calibratedSelectiveDelegationArbiter(record.input));
  const nexusFull = timed(nexusCases, (record) => calibratedSelectiveDelegationArbiter(record.input));
  return deepFreeze({
    primeOnlyMedian: primeOnly.median,
    inheritedArbiterMedian: inherited.median,
    calibratedArbiterMedian: full.median,
    correctnessGateMedianOverhead: round(full.median - inherited.median),
    arbiterMedianOverhead: round(full.median - primeOnly.median),
    arbiterP95Overhead: round(full.p95 - primeOnly.p95),
    arbiterP99Overhead: round(full.p99 - primeOnly.p99),
    nexusMedianOverhead: round(nexusFull.median - primeOnly.median),
  });
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification
 * ------------------------------------------------------------------------- */

export function buildStage2L10Evaluation({ calibration = STAGE2L10_FROZEN_CALIBRATION } = {}) {
  const holdout = buildStage2L10Corpus('HOLDOUT');
  const rows = runStage2L10(holdout, calibration);
  const replayRows = runStage2L10(holdout, calibration);

  const calibrationCorpus = buildStage2L10Corpus('CALIBRATION');
  const derivedCalibration = deriveStage2L10Calibration(runStage2L10Base(calibrationCorpus));
  const frozenReproduced = sha256(freezeCalibration(derivedCalibration)) === sha256(calibration);

  const oracleRows = rows.filter((row) => row.stratum === 'ORACLE_ONLY_RELEVANT');
  const nexusRows = rows.filter((row) => row.stratum === 'NEXUS_ONLY_RELEVANT');
  const overall = metricsOf(rows);
  const oracle = metricsOf(oracleRows);
  const nexus = metricsOf(nexusRows);
  const bounds = safetyBounds(rows);

  const controls = Object.fromEntries(STAGE2L10_CONTROL_GROUPS.map((group) => [group, metricsOf(rows.filter((row) => row.stratum === group))]));
  const adversarial = Object.fromEntries(STAGE2L10_ADVERSARIAL_CONTROLS.map((control) => {
    const subset = rows.filter((row) => row.stratum === control);
    return [control, {
      cases: subset.length,
      evidenceAccepted: subset.filter((row) => row.baseEvidenceAccepted > 0).length,
      selectionChanges: subset.filter((row) => row.changed).length,
      failClosed: subset.filter((row) => row.baseEvidenceAccepted === 0 && !row.changed).length,
    }];
  }));
  const attestationControls = Object.fromEntries(STAGE2L10_ATTESTATION_CONTROLS.map((control) => {
    const subset = rows.filter((row) => row.stratum === control);
    return [control, {
      cases: subset.length,
      // The inherited Arbiter wanted to delegate on every one of these.
      inheritedDelegations: subset.filter((row) => row.baseDelegated).length,
      selectionChanges: subset.filter((row) => row.changed).length,
      abstentions: subset.filter((row) => row.abstained).length,
      failClosed: subset.every((row) => !row.changed),
      abstentionReason: subset[0]?.delegationReason ?? null,
    }];
  }));

  const rowDigest = sha256(rows.map((row) => ({ caseId: row.caseId, decisionDigest: row.decisionDigest, truthAction: row.truthAction, selectedAction: row.selectedAction })));
  const replayDigest = sha256(replayRows.map((row) => ({ caseId: row.caseId, decisionDigest: row.decisionDigest, truthAction: row.truthAction, selectedAction: row.selectedAction })));

  const semanticGroups = new Set(holdout.map((record) => record.semanticGroup)).size;
  const calibrationIds = new Set(calibrationCorpus.map((record) => record.caseId));
  const corpusOverlap = holdout.filter((record) => calibrationIds.has(record.caseId)
    || ['stage2l6-', 'stage2l7-', 'stage2l8-', 'stage2l9-'].some((prefix) => record.caseId.startsWith(prefix))).length;

  const expertPrecision = {
    oracleClassificationAccuracy: round(ratio(oracleRows.filter((row) => row.expertCorrect).length, oracleRows.length)),
    nexusDecisionAccuracy: round(ratio(nexusRows.filter((row) => row.expertCorrect).length, nexusRows.length)),
    nexusDeclaredAlignmentRate: STAGE2L10_NEXUS_ALIGNMENT_RATE,
  };

  const oracleMatrix = correctnessMatrix(oracleRows);
  const nexusMatrix = correctnessMatrix(nexusRows);
  const combinedMatrix = correctnessMatrix([...oracleRows, ...nexusRows]);
  const discrimination = {
    oracle: oracleMatrix,
    nexus: nexusMatrix,
    combined: combinedMatrix,
    oracleCorrectnessDiscrimination: oracleMatrix.correctnessDiscrimination,
    nexusCorrectnessDiscrimination: nexusMatrix.correctnessDiscrimination,
    combinedCorrectnessDiscrimination: combinedMatrix.correctnessDiscrimination,
    relevanceDiscriminationPerfect: bounds.trueButIrrelevantOracleSelectionChanges === 0 && bounds.trueButIrrelevantNexusSelectionChanges === 0,
    /* Stage 2L.9's measured baseline, carried for direct comparison. */
    stage2l9OracleCorrectnessDiscrimination: -0.003844,
    stage2l9NexusCorrectnessDiscrimination: 0.003037,
  };

  return deepFreeze({
    corpus: {
      holdoutCases: holdout.length,
      calibrationCases: calibrationCorpus.length,
      effectiveSemanticGroups: semanticGroups,
      semanticFamilyLeakage: semanticGroups !== holdout.length,
      corpusOverlap,
      calibrationHoldoutSeparate: corpusOverlap === 0,
      groundTruthIndependentOfExpertOutput: true,
      groundTruthIndependentOfArbiterOutput: true,
      oracleCases: oracleRows.length,
      nexusCases: nexusRows.length,
      controlCases: STAGE2L10_CONTROL_GROUPS.length * STAGE2L10_HOLDOUT_CONTROL_CASES,
      adversarialCases: STAGE2L10_ADVERSARIAL_CONTROLS.length * STAGE2L10_HOLDOUT_ADVERSARIAL_CASES,
      attestationAttackCases: STAGE2L10_ATTESTATION_CONTROLS.length * STAGE2L10_HOLDOUT_ADVERSARIAL_CASES,
      oracleRegimes: STAGE2L10_ORACLE_REGIMES.map((regime) => regime.name),
      newStressRegimes: STAGE2L10_ORACLE_REGIMES.filter((regime) => !regime.inherited).map((regime) => regime.name),
      holdoutCorpusDigest: sha256(holdout.map((record) => ({ caseId: record.caseId, semanticGroup: record.semanticGroup, truthAction: record.truthAction }))),
      calibrationCorpusDigest: sha256(calibrationCorpus.map((record) => ({ caseId: record.caseId, semanticGroup: record.semanticGroup, truthAction: record.truthAction }))),
    },
    calibration: {
      frozenCalibrationDigest: calibration.calibrationDigest,
      derivedCalibrationDigest: derivedCalibration.calibrationDigest,
      frozenReproducedFromCalibrationCorpus: frozenReproduced,
      minBucketReliability: calibration.minBucketReliability,
      minBucketSamples: calibration.minBucketSamples,
      oracleParameters: calibration.oracle.parameters,
      nexusParameters: calibration.nexus.parameters,
      oracleBuckets: calibration.oracle.buckets,
      nexusBuckets: calibration.nexus.buckets,
      oracleDelegatingBuckets: calibration.oracle.delegatingBuckets,
      nexusDelegatingBuckets: calibration.nexus.delegatingBuckets,
      structurallyIneligibleBuckets: [...STAGE2L10_STRUCTURALLY_INELIGIBLE_BUCKETS],
      oraclePrimeProtection: derivedCalibration.oracle.primeProtection,
      nexusPrimeProtection: derivedCalibration.nexus.primeProtection,
      oracleSweep: derivedCalibration.oracle.sweep,
      nexusSweep: derivedCalibration.nexus.sweep,
      oracleSelected: derivedCalibration.oracle.selected,
      nexusSelected: derivedCalibration.nexus.selected,
    },
    overall,
    oracle,
    nexus,
    expertPrecision,
    discrimination,
    controls,
    adversarial,
    attestationControls,
    bounds,
    boundsPass: boundsPass(bounds),
    bucketUsage: { oracle: bucketUsage(oracleRows, STAGE2L10_ORACLE_BUCKETS), nexus: bucketUsage(nexusRows, STAGE2L10_NEXUS_BUCKETS) },
    regimeBreakdown: regimeBreakdown(oracleRows),
    marginCurve: marginCurve(rows),
    labelLeakage: auditStage2L10LabelLeakage(holdout, rows),
    invariance: runStage2L10Invariance(),
    failureIsolation: runStage2L10FailureIsolation(),
    replay: { rowDigest, replayDigest, replayEquivalent: rowDigest === replayDigest },
    rows,
  });
}

export function certifyStage2L10({ evaluation = buildStage2L10Evaluation() } = {}) {
  const { bounds, discrimination, corpus, calibration, overall, oracle, nexus, labelLeakage } = evaluation;

  const harmCeilingPass = bounds.arbiterHarmfulChangeRate <= STAGE2L10_MAX_HARMFUL_CHANGE_RATE
    && bounds.arbiterCorrectPrimeBreakRate <= STAGE2L10_MAX_CORRECT_PRIME_BREAK_RATE;

  /* Utility. A "never delegate" implementation fails all three clauses. */
  const utilityPass = overall.arbiterTop1 > overall.primeOnlyTop1
    && overall.beneficialChanges > overall.harmfulChanges
    && overall.delegations > 0;

  /* Correctness discrimination. Combined must be positive, at least one expert
   * must be strictly positive, and no expert may be negative. An expert whose
   * correctness is not identifiable abstains entirely and scores exactly zero —
   * that is the correct outcome for it, not a failure. */
  const perExpert = [discrimination.oracleCorrectnessDiscrimination, discrimination.nexusCorrectnessDiscrimination];
  const discriminationPass = discrimination.combinedCorrectnessDiscrimination > 0
    && perExpert.some((value) => value > 0)
    && perExpert.every((value) => value >= 0);

  const securityRegressionPass = evaluation.boundsPass
    && evaluation.invariance.legalActionOrderInvariant
    && evaluation.invariance.expertEvidenceOrderInvariant
    && evaluation.invariance.attestationOrderInvariant
    && evaluation.invariance.duplicateEvidenceDoesNotAmplifySupport
    && evaluation.invariance.duplicateAttestationFailsClosed
    && evaluation.invariance.conflictingDuplicateFailsClosed
    && evaluation.failureIsolation.arbiterFailureReturnsPrime
    && evaluation.failureIsolation.calibrationFailureReturnsPrime
    && evaluation.failureIsolation.attestationFailureReturnsPrime
    && evaluation.failureIsolation.oracleFailureSafe
    && evaluation.failureIsolation.noExpertAuthorizedAction
    && evaluation.replay.replayEquivalent;

  const methodologyPass = corpus.calibrationHoldoutSeparate
    && !corpus.semanticFamilyLeakage
    && !labelLeakage.labelLeakageDetected
    && calibration.frozenReproducedFromCalibrationCorpus
    && corpus.holdoutCases >= STAGE2L10_MIN_HOLDOUT_CASES;

  const certified = harmCeilingPass && utilityPass && discriminationPass && securityRegressionPass && methodologyPass;

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L10_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l7OwnerSha256: STAGE2L10_STAGE2L7_OWNER_SHA256,
      stage2l8OwnerSha256: STAGE2L10_STAGE2L8_OWNER_SHA256,
      stage2l9OwnerSha256: STAGE2L10_STAGE2L9_OWNER_SHA256,
      stage2l9CertificationHash: STAGE2L10_STAGE2L9_CERTIFICATION_HASH,
      stage2l9EvidenceDigest: STAGE2L10_STAGE2L9_EVIDENCE_DIGEST,
      inheritedArbiterRuleTableDigest: STAGE2L7_ARBITER_RULE_DIGEST,
      inheritedArbiterRuleTableUnchanged: STAGE2L7_ARBITER_RULE_DIGEST === STAGE2L10_ARBITER_RULE_DIGEST,
      inheritedFailClosedMatrixDigest: STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
      inheritedFailClosedMatrixUnchanged: STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST === STAGE2L10_FAIL_CLOSED_MATRIX_DIGEST,
      primeAmbiguityThreshold: STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
      oracleEligibilityRuleIdentity: STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY,
    },
    primeChanged: false,
    oracleCoreChanged: false,
    nexusChanged: false,
    inheritedArbiterChanged: false,
    remediationShape: 'STRICT_REFINEMENT_OF_INHERITED_DELEGATION_SET',
    corpus,
    calibration: {
      frozenCalibrationDigest: calibration.frozenCalibrationDigest,
      derivedCalibrationDigest: calibration.derivedCalibrationDigest,
      frozenReproducedFromCalibrationCorpus: calibration.frozenReproducedFromCalibrationCorpus,
      minBucketReliability: calibration.minBucketReliability,
      minBucketSamples: calibration.minBucketSamples,
      oracleParameters: calibration.oracleParameters,
      nexusParameters: calibration.nexusParameters,
      oracleDelegatingBuckets: calibration.oracleDelegatingBuckets,
      nexusDelegatingBuckets: calibration.nexusDelegatingBuckets,
      structurallyIneligibleBuckets: calibration.structurallyIneligibleBuckets,
    },
    labelLeakageDetected: labelLeakage.labelLeakageDetected,
    labelLeakage,
    overall,
    oracleSingleExpert: oracle,
    nexusSingleExpert: nexus,
    oracleSingleExpertPrecision: oracle.precision,
    nexusSingleExpertPrecision: nexus.precision,
    oracleSingleExpertHarmRate: oracle.harmfulChangeRate,
    nexusSingleExpertHarmRate: nexus.harmfulChangeRate,
    expertPrecision: evaluation.expertPrecision,
    discrimination,
    bucketUsage: evaluation.bucketUsage,
    regimeBreakdown: evaluation.regimeBreakdown,
    marginCurve: evaluation.marginCurve,
    controls: evaluation.controls,
    adversarial: evaluation.adversarial,
    attestationControls: evaluation.attestationControls,
    bounds,
    boundsPass: evaluation.boundsPass,
    invariance: evaluation.invariance,
    invariancePass: Object.values(evaluation.invariance).every(Boolean),
    failureIsolation: evaluation.failureIsolation,
    failureIsolationPass: Object.values(evaluation.failureIsolation).every(Boolean),
    replayEquivalent: evaluation.replay.replayEquivalent,
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    harmCeiling: STAGE2L10_MAX_HARMFUL_CHANGE_RATE,
    harmCeilingPass,
    utilityPass,
    correctnessDiscriminationPass: discriminationPass,
    securityRegressionPass,
    methodologyPass,
    stage2l10Certified: certified,
    evidenceDigest: sha256({
      corpus, overall, oracle, nexus, discrimination, bounds,
      calibration: calibration.frozenCalibrationDigest,
      replay: evaluation.replay.rowDigest,
    }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L10PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage,
    status: certification.status,
    holdoutCases: certification.corpus.holdoutCases,
    primeOnlyTop1: certification.overall.primeOnlyTop1,
    arbiterTop1: certification.overall.arbiterTop1,
    decisionDelta: certification.overall.decisionDelta,
    delegations: certification.overall.delegations,
    abstentions: certification.overall.abstentions,
    beneficialChanges: certification.overall.beneficialChanges,
    harmfulChanges: certification.overall.harmfulChanges,
    harmfulChangeRate: certification.overall.harmfulChangeRate,
    correctPrimeBreakRate: certification.overall.correctPrimeBreakRate,
    oracleCorrectnessDiscrimination: certification.discrimination.oracleCorrectnessDiscrimination,
    nexusCorrectnessDiscrimination: certification.discrimination.nexusCorrectnessDiscrimination,
    frozenCalibrationDigest: certification.calibration.frozenCalibrationDigest,
    evidenceDigest: certification.evidenceDigest,
    certificationHash: certification.certificationHash,
  };
  return deepFreeze({ digest: sha256(witnesses), witnesses });
}
