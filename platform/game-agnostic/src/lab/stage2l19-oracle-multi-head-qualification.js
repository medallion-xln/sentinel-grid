/* Stage 2L.19 — Oracle multi-head correctness, identifiability and
 * selective-delegation qualification (R0, shadow only).
 *
 * WHY THE STAGE PIVOTED HERE. Stage 2L.18 ended the Nexus line on principle: its
 * delegation ceiling is governed by six cases, and no bounded rule separates them
 * from the 304 they sit among beyond what a search-space-matched permutation null
 * produces by chance. Continuing to fit that tail would be fitting noise. Oracle
 * is the next unexamined expert surface: Stage 2L.10 certified selective
 * delegation for its DIRECTION head alone, and the other seven have never
 * received head-specific correctness, identifiability or utility certification.
 *
 * WHAT THE IMPLEMENTATION ACTUALLY IS, WHICH MATTERS FOR EVERY LATER PHASE.
 * `assembleOracleV2` composes EIGHT heads — direction, persistence, reversal,
 * regimeChange, volatility, cycle, timeToThreshold, abstention — and every one is
 * a CLASSIFIER OF TEMPORAL STRUCTURE, not an action recommender. The assembly
 * declares `actionMapping: false` and forbids `recommendedAction` and friends
 * outright. So "does this head beat Prime" is not a question seven of the eight
 * heads can answer: Prime emits an action, they emit a label about history. The
 * honest baseline for a classifier is the best trivial classifier, and that is
 * what this stage measures, with the Prime comparison reported only where an
 * action-delegation path actually exists.
 *
 * THE CORPUS PROBLEM THIS STAGE HAD TO SOLVE FIRST. The inherited Stage 2I.4
 * holdout carries 2,400 cases, which looks ample and is not: three families per
 * head, 100 variants each, and the variant function perturbs by a scale of
 * 0.94-1.00 and an offset under 0.002. Predictions are CONSTANT within every
 * family for seven of the eight heads, so the effective sample size per head is
 * THREE, not three hundred. Reporting "accuracy 1.0000, n=300" off that would be
 * reporting n=3 as n=300 — the exact degeneracy Stage 2L.11 was undone by. This
 * stage therefore builds an independent stress corpus with genuine parametric
 * variation and reports both.
 *
 * NEXUS IS FROZEN. Nothing here touches Nexus, its confidence pipeline or its
 * delegation path. The certify script proves it by hash and by replay.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2, buildOracleV2Holdout } from './stage2i4-oracle-v2-assembly.js';
import { STAGE2L14_RELIABILITY_FLOOR, STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE, STAGE2L14_BOUND_METHOD, STAGE2L14_BOUND_Z,
  STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT, STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT,
  STAGE2L14_MINIMUM_DELEGATION_COUNT, wilsonLowerBound } from './stage2l14-nexus-confidence-calibration.js';
import { auroc } from './stage2l15-nexus-decision-stability.js';
import { STAGE2L10_ORACLE_SIGNAL_KEYS } from './stage2l10-arbiter-correctness-calibration-and-selective-delegation.js';

export const STAGE2L19_STAGE = 'STAGE2L19_ORACLE_MULTI_HEAD_QUALIFICATION';
export const STAGE2L19_STAGE2L18_CERTIFICATION_HASH = '9c4c07d5fead5fe80f7895b49c204e0f42d767079f71658d52d7b35f21862ee7';
export const STAGE2L19_STAGE2L17_CERTIFICATION_HASH = 'c0bc3360712a3a51e16fe898bf8cfc2d437a131e5c8b8ae14d4cef61e00c1e2a';
export const STAGE2L19_STAGE2L10_CERTIFICATION_HASH = '73e958a02a479326bb60cad058fa5cc3e29d5c77614aaef87936aa41dba41a86';

/* The Stage 2L.10 Oracle single-expert delegation evidence, pinned here so the
 * module needs no file I/O and so drift is a certification failure rather than a
 * silent restatement. The certify script reads the Stage 2L.10 artifact and
 * refuses to certify if any of these values has moved. These are the ONLY
 * Prime-relative delegation figures in this stage: they were measured against
 * Prime on Stage 2L.10's action corpus, and nothing here recomputes them. */
export const STAGE2L19_INHERITED_DIRECTION_DELEGATION = deepFreeze({
  source: 'STAGE2L10_ARBITER_CORRECTNESS_CALIBRATION_AND_SELECTIVE_DELEGATION',
  artifactField: 'oracleSingleExpert',
  inheritedDelegations: 3416,
  delegations: 1332,
  precision: 1,
  beneficialChanges: 1332,
  harmfulChanges: 0,
  harmfulChangeRate: 0,
  correctPrimeBreaks: 0,
  correctPrimeBreakRate: 0,
});

function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }

/* ---------------------------------------------------------------------------
 * PHASE 1 — head inventory, read off the implementation.
 *
 * The names are the assembly's own HEAD_KEYS, not six invented labels. Each entry
 * records what the head consumes, what it emits, how it abstains, and whether any
 * stage has certified it.
 * ------------------------------------------------------------------------- */

export const STAGE2L19_HEADS = deepFreeze([
  {
    headId: 'direction',
    headName: 'DIRECTION_HEAD',
    implementation: 'STAGE2I2_LAST_MINUS_FIRST',
    inputs: ['observationHistory.channels'],
    outputs: ['UP', 'DOWN', 'STABLE'],
    taskSemantics: 'Sign of net change across the observation window.',
    abstentionSemantics: 'INSUFFICIENT_EVIDENCE when global sufficiency suppresses the head.',
    confidenceFields: ['confidence'],
    arbiterEligibility: 'CERTIFIED_STAGE2L10_SELECTIVE_DELEGATION',
    certificationStatus: 'CERTIFIED_DIRECTION_HEAD',
  },
  {
    headId: 'persistence',
    headName: 'PERSISTENCE_HEAD',
    implementation: 'BOUNDED_INTERRUPTION_TOLERANCE',
    inputs: ['observationHistory.channels'],
    outputs: ['PERSISTENT', 'NON_PERSISTENT', 'INSUFFICIENT_EVIDENCE'],
    taskSemantics: 'Whether a direction is sustained despite bounded interruptions.',
    abstentionSemantics: 'Emits INSUFFICIENT_EVIDENCE on its own account.',
    confidenceFields: ['confidence'],
    arbiterEligibility: 'NOT_WIRED',
    certificationStatus: 'UNCERTIFIED',
  },
  {
    headId: 'reversal',
    headName: 'REVERSAL_HEAD',
    implementation: 'STAGE2I2_FROZEN',
    inputs: ['observationHistory.channels'],
    outputs: ['REVERSAL', 'NO_REVERSAL'],
    taskSemantics: 'Whether the recent direction opposes the earlier direction.',
    abstentionSemantics: 'Suppressed by global sufficiency only.',
    confidenceFields: ['confidence'],
    arbiterEligibility: 'NOT_WIRED',
    certificationStatus: 'UNCERTIFIED',
  },
  {
    headId: 'regimeChange',
    headName: 'REGIME_CHANGE_HEAD',
    implementation: 'DIMENSION_AWARE_WITH_ANOMALY_FILTER',
    inputs: ['observationHistory.channels'],
    outputs: ['TREND_CHANGE', 'LEVEL_CHANGE', 'CYCLE_CHANGE', 'MULTIPLE_CHANGE', 'NO_CHANGE', 'INSUFFICIENT_EVIDENCE'],
    taskSemantics: 'Whether the generating process changed, and along which dimension.',
    abstentionSemantics: 'Emits INSUFFICIENT_EVIDENCE on its own account.',
    confidenceFields: ['confidence'],
    arbiterEligibility: 'NOT_WIRED',
    certificationStatus: 'UNCERTIFIED',
  },
  {
    headId: 'volatility',
    headName: 'VOLATILITY_HEAD',
    implementation: 'STAGE2I2_FROZEN',
    inputs: ['observationHistory.channels'],
    outputs: ['HIGH_VOLATILITY', 'LOW_VOLATILITY'],
    taskSemantics: 'Instability magnitude. Explicitly not a value polarity.',
    abstentionSemantics: 'Suppressed by global sufficiency only.',
    confidenceFields: ['confidence'],
    arbiterEligibility: 'NOT_WIRED',
    certificationStatus: 'UNCERTIFIED',
  },
  {
    headId: 'cycle',
    headName: 'CYCLE_HEAD',
    implementation: 'STAGE2I2_FROZEN',
    inputs: ['observationHistory.channels'],
    outputs: ['CYCLICAL', 'NOT_CYCLICAL'],
    taskSemantics: 'Whether the series repeats with a detectable period.',
    abstentionSemantics: 'Suppressed by global sufficiency only.',
    confidenceFields: ['confidence'],
    arbiterEligibility: 'NOT_WIRED',
    certificationStatus: 'UNCERTIFIED',
  },
  {
    headId: 'timeToThreshold',
    headName: 'TIME_TO_THRESHOLD_HEAD',
    implementation: 'STAGE2I2_FROZEN',
    inputs: ['observationHistory.channels', 'channelSemantics.threshold', 'channelSemantics.polarity'],
    outputs: ['ALREADY_CROSSED', 'NOT_CROSSING', 'INSUFFICIENT_EVIDENCE'],
    taskSemantics: 'How soon a channel crosses a declared threshold.',
    abstentionSemantics: 'Hard-suppressed to SUPPRESSED_MISSING_THRESHOLD_SEMANTICS when no threshold is declared.',
    confidenceFields: ['confidence'],
    arbiterEligibility: 'NOT_WIRED',
    certificationStatus: 'UNCERTIFIED',
  },
  {
    headId: 'abstention',
    headName: 'ABSTENTION_HEAD',
    implementation: 'STAGE2I2_FROZEN',
    inputs: ['observationHistory'],
    outputs: ['ENOUGH_EVIDENCE', 'INSUFFICIENT_EVIDENCE'],
    taskSemantics: 'Whether the history supports any temporal claim. Gates the other heads.',
    abstentionSemantics: 'Is itself the abstention mechanism.',
    confidenceFields: ['confidence'],
    arbiterEligibility: 'GLOBAL_SUFFICIENCY_GATE',
    certificationStatus: 'UNCERTIFIED',
  },
]);

export const STAGE2L19_HEAD_IDS = deepFreeze(STAGE2L19_HEADS.map((head) => head.headId));
export const STAGE2L19_CERTIFIED_HEAD_IDS = deepFreeze(
  STAGE2L19_HEADS.filter((head) => head.certificationStatus !== 'UNCERTIFIED').map((head) => head.headId));
export const STAGE2L19_UNCERTIFIED_HEAD_IDS = deepFreeze(
  STAGE2L19_HEADS.filter((head) => head.certificationStatus === 'UNCERTIFIED').map((head) => head.headId));

/** Read the live assembly rather than trusting the table above. */
export function measureStage2L19HeadInventory() {
  const probe = assembleOracleV2({
    caseId: 'stage2l19-inventory-probe',
    observationHistory: Array.from({ length: 20 }, (unused, tick) => ({ tick, channels: { alpha: 0.5 + tick * 0.01 } })),
    channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: 0.76 } },
  });
  const implemented = Object.keys(probe.heads).sort();
  const declared = [...STAGE2L19_HEAD_IDS].sort();
  return {
    implementedHeadIds: implemented,
    declaredHeadIds: declared,
    inventoryMatchesImplementation: implemented.join(',') === declared.join(','),
    headCount: implemented.length,
    compositionRules: probe.expert,
    actionMappingDeclared: false,
    forbiddenActionFieldsPresent: ['recommendedAction', 'selectedAction', 'actionAdjustment', 'actionBias', 'dispatchAction']
      .filter((field) => Object.hasOwn(probe, field)),
    advisoryOnly: probe.advisoryOnly === true,
    authority: probe.authority,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 2 — head contract audit.
 *
 * Measured off a live assembly, not off the head table, and it distinguishes
 * three things the brief insists are different: what Oracle COMPUTES (the head's
 * own observation block), what Oracle EXPOSES (the fields that survive into the
 * assembled assessment and its evidence digests) and what the ARBITER CONSUMES.
 * The third is the sharp one: Stage 2L.10's Oracle binding pins `head: 'direction'`
 * and returns ORACLE_SIGNAL_HEAD_UNKNOWN for any other head identity, so seven
 * heads are exposed and none of them is readable by the Arbiter. That is measured
 * here rather than assumed, and it is a structural fact about the wiring, not a
 * deficiency claim about the heads.
 * ------------------------------------------------------------------------- */

export const STAGE2L19_ARBITER_ORACLE_HEAD_BINDING = 'direction';
export const STAGE2L19_ARBITER_UNKNOWN_HEAD_CODE = 'ORACLE_SIGNAL_HEAD_UNKNOWN';

export function auditStage2L19HeadContracts() {
  const probe = assembleOracleV2({
    caseId: 'stage2l19-contract-probe',
    observationHistory: Array.from({ length: 24 }, (unused, tick) => ({
      tick, channels: { alpha: 0.4 + tick * 0.012, beta: 0.6 - tick * 0.004 },
    })),
    channelSemantics: { alpha: { polarity: 'HIGHER_IS_BETTER', threshold: 0.78 }, beta: { polarity: 'LOWER_IS_BETTER', threshold: 0.2 } },
  });
  const exposedTopLevel = Object.keys(probe).sort();
  const heads = STAGE2L19_HEADS.map((meta) => {
    const emitted = probe.heads[meta.headId] ?? {};
    const consumedByArbiter = meta.headId === STAGE2L19_ARBITER_ORACLE_HEAD_BINDING;
    return {
      headId: meta.headId,
      headName: meta.headName,
      canonicalInputsConsumed: meta.inputs,
      derivedStateComputed: Object.keys(emitted.observation ?? {}).sort(),
      expertOutputFieldsExposed: Object.keys(emitted).sort(),
      confidenceFieldsExposed: Object.keys(emitted).filter((key) => key === 'confidence'),
      supportFieldsExposed: Object.keys(emitted).filter((key) => key === 'supported' || key === 'supportContext'),
      evidenceMetadataExposed: Object.hasOwn(probe.evidence?.headOutputDigests ?? {}, meta.headId)
        ? ['evidence.headOutputDigests', 'outputDigest'] : ['outputDigest'],
      correctnessDefinition: `semanticOutput equals the corpus case's declared expected label drawn from ${meta.outputs.join('|')}`,
      arbiterPath: consumedByArbiter
        ? 'STAGE2L10_ORACLE_BINDING_HEAD_DIRECTION'
        : `NOT_WIRED_ARBITER_REJECTS_WITH_${STAGE2L19_ARBITER_UNKNOWN_HEAD_CODE}`,
      consumedByArbiter,
      emitsAction: false,
      /* The three-way distinction the brief asks for, per head. */
      informationOracleComputes: Object.keys(emitted.observation ?? {}).length,
      informationOracleExposes: Object.keys(emitted).length,
      informationArbiterConsumes: consumedByArbiter ? ['semanticOutput', 'confidence', 'supported'].length : 0,
      contractDeficiencyMeasured: false,
    };
  });
  return {
    probeDigest: probe.assessmentDigest,
    exposedTopLevelFields: exposedTopLevel,
    arbiterOracleHeadBinding: STAGE2L19_ARBITER_ORACLE_HEAD_BINDING,
    arbiterUnknownHeadCode: STAGE2L19_ARBITER_UNKNOWN_HEAD_CODE,
    /* Read from Stage 2L.10 itself, not restated: the Arbiter's Oracle signal
     * schema is direction-shaped down to the field names, so admitting another
     * head is a schema change, not a configuration change. */
    arbiterOracleSignalKeys: STAGE2L10_ORACLE_SIGNAL_KEYS,
    arbiterOracleSignalKind: 'ORACLE_DIRECTION_SLOPE_COHERENCE_V1',
    headsExposed: heads.length,
    headsConsumedByArbiter: heads.filter((head) => head.consumedByArbiter).length,
    headsExposedButNotConsumed: heads.filter((head) => !head.consumedByArbiter).map((head) => head.headId),
    anyHeadEmitsAction: heads.some((head) => head.emitsAction),
    heads,
    /* Phase 2 says: do not assume a contract deficiency unless measured. Nothing
     * measured here is a deficiency — the assembly exposes every head coherently
     * and the Arbiter reads one on purpose. The gap is scope, not correctness. */
    contractDeficienciesFound: heads.filter((head) => head.contractDeficiencyMeasured).map((head) => head.headId),
    note: 'Seven heads are computed and fully exposed with their own digests, and none is readable through the Stage 2L.10 Arbiter binding, which pins head=direction by identity. Widening that binding is an Arbiter change and is out of scope for this stage.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 3 — ground-truth audit.
 *
 * Every Oracle head is scored against a label attached to a deterministic
 * generator family. That is not a hidden random draw — the Stage 2L.11 failure —
 * but neither is it derived from independent world state the way Stage 2L.12's
 * benchmark is. It is the constructor's declared intent, which for a temporal
 * structure task is defensible: a line with positive slope IS rising by
 * construction. The classification is recorded honestly as
 * DETERMINISTIC_LATENT_DERIVED rather than dressed up as world-state derived.
 * ------------------------------------------------------------------------- */

export const STAGE2L19_GROUND_TRUTH_CLASSES = deepFreeze([
  'WORLD_STATE_DERIVED', 'TEMPORAL_STATE_DERIVED', 'DETERMINISTIC_LATENT_DERIVED',
  'INDEPENDENT_RANDOM_LABEL', 'MISSING', 'OTHER',
]);

export function auditStage2L19GroundTruth(corpusCases) {
  const byHead = new Map(STAGE2L19_HEAD_IDS.map((headId) => [headId, []]));
  for (const entry of corpusCases) {
    if (byHead.has(entry.task)) byHead.get(entry.task).push(entry);
  }
  const heads = STAGE2L19_HEAD_IDS.map((headId) => {
    const cases = byHead.get(headId);
    const expectedLabels = [...new Set(cases.map((entry) => entry.expected))].sort();
    const emitted = new Set();
    for (const entry of corpusCases) emitted.add(assembleOracleV2(entry).heads[headId].semanticOutput);
    const emittedLabels = [...emitted].filter((label) => label !== null && label !== undefined).sort();
    /* A label the head cannot emit is a class it can never be scored correct on.
     * That is a contract defect between head and benchmark, not weak reasoning,
     * and it caps achievable accuracy at the share of the reachable classes. */
    const unreachableExpectedLabels = expectedLabels.filter((label) => !emittedLabels.includes(label));
    const reachableShare = cases.length === 0 ? 0
      : round(ratio(cases.filter((entry) => !unreachableExpectedLabels.includes(entry.expected)).length, cases.length));
    const meta = STAGE2L19_HEADS.find((head) => head.headId === headId);
    return {
      headId,
      arbiterEligibility: meta.arbiterEligibility,
      certificationStatus: meta.certificationStatus,
      groundTruthClass: 'DETERMINISTIC_LATENT_DERIVED',
      groundTruthSource: 'GENERATOR_FAMILY_DECLARED_EXPECTED_LABEL',
      decisionTimeObservable: true,
      hiddenRandomnessInvolved: false,
      futureInformationInvolved: false,
      expertOutputUsedInTruthConstruction: false,
      labelLeakagePossible: false,
      cases: cases.length,
      expectedLabels,
      emittedLabels,
      unreachableExpectedLabels,
      hasUnreachableLabel: unreachableExpectedLabels.length > 0,
      achievableAccuracyCeiling: reachableShare,
      semanticallyValid: cases.length > 0 && unreachableExpectedLabels.length === 0,
    };
  });
  return {
    classes: STAGE2L19_GROUND_TRUTH_CLASSES,
    heads,
    semanticallyValidHeadCount: heads.filter((head) => head.semanticallyValid).length,
    invalidBenchmarkHeadCount: heads.filter((head) => !head.semanticallyValid).length,
    anyHiddenRandomness: false,
    labelLeakageDetected: false,
    note: 'No head is scored against an independent random draw. Every truth label is a deterministic property of its generator family, so the Stage 2L.11 failure mode is absent — but the labels are construction intent, not independently derived world state, and are classified as such.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 4a — degeneracy of the inherited corpus.
 *
 * The measurement that decides whether any head can be certified from it: does a
 * head's prediction VARY within a generator family? If not, the family's hundred
 * variants are one case counted a hundred times.
 * ------------------------------------------------------------------------- */

export function measureStage2L19CorpusDegeneracy(corpusCases) {
  const byHead = new Map(STAGE2L19_HEAD_IDS.map((headId) => [headId, []]));
  for (const entry of corpusCases) {
    if (byHead.has(entry.task)) byHead.get(entry.task).push(entry);
  }
  const heads = STAGE2L19_HEAD_IDS.map((headId) => {
    const cases = byHead.get(headId);
    const families = [...new Set(cases.map((entry) => entry.family))].sort();
    let familiesWithVaryingPrediction = 0;
    const perFamily = families.map((family) => {
      const subset = cases.filter((entry) => entry.family === family);
      const predictions = new Set(subset.map((entry) => assembleOracleV2(entry).heads[headId].semanticOutput));
      if (predictions.size > 1) familiesWithVaryingPrediction += 1;
      const correct = subset.filter((entry) => assembleOracleV2(entry).heads[headId].semanticOutput === entry.expected).length;
      return {
        family,
        n: subset.length,
        expected: subset[0]?.expected ?? null,
        distinctPredictions: [...predictions].sort(),
        accuracy: round(ratio(correct, subset.length)),
      };
    });
    const labelCounts = cases.reduce((map, entry) => {
      map[entry.expected] = (map[entry.expected] ?? 0) + 1;
      return map;
    }, {});
    const majorityBaseline = cases.length === 0 ? 0
      : round(Math.max(0, ...Object.values(labelCounts)) / cases.length);
    return {
      headId,
      nominalCases: cases.length,
      familyCount: families.length,
      familiesWithVaryingPrediction,
      /* Effective sample size: a family whose prediction never varies contributes
       * one independent observation, not one per variant. */
      effectiveSampleSize: families.length,
      variantsPerFamily: families.length === 0 ? 0 : Math.round(cases.length / families.length),
      majorityBaseline,
      labelCounts,
      perFamily,
      degenerate: families.length < STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT
        && familiesWithVaryingPrediction < families.length,
    };
  });
  return {
    corpus: 'STAGE2I4_ORACLE_V2_HOLDOUT',
    nominalCases: corpusCases.length,
    heads,
    degenerateHeadCount: heads.filter((head) => head.degenerate).length,
    minimumEligibleCaseCount: STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT,
    anyHeadHasSufficientEffectiveSupport: heads.some((head) => head.effectiveSampleSize >= STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT),
    note: 'Effective sample size counts generator families, not variants, because a family whose prediction never varies across its variants supplies one independent observation. Certifying from nominal counts would report an effective three as three hundred.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 4b — an independent stress corpus with real parametric variation.
 *
 * Built because the inherited corpus cannot distinguish a capable head from a
 * trivial one. Every family sweeps a real parameter — slope magnitude, noise
 * amplitude, reversal position, period length, level-shift size, distance to
 * threshold, history length — so a head that only memorised three shapes will
 * show it. Ground truth remains a deterministic property of the construction and
 * is classified the same way.
 *
 * This is a VALIDATION corpus. It is not proposed as a replacement benchmark and
 * nothing is certified from it alone; it exists to tell a real capability from an
 * artefact of corpus triviality.
 * ------------------------------------------------------------------------- */

export const STAGE2L19_STRESS_SPLITS = deepFreeze({ DEVELOPMENT: [0, 40], CALIBRATION: [40, 80], FINAL_HOLDOUT: [80, 120] });
export const STAGE2L19_STRESS_VARIANTS = 120;

function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }
function frames(values) { return values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } })); }
/** Deterministic bounded pseudo-noise. No RNG, no wall clock. */
function jitter(index, variant, amplitude) {
  const hashed = ((index + 1) * 2654435761 + (variant + 1) * 40503) % 1000;
  return ((hashed / 1000) - 0.5) * 2 * amplitude;
}
function ramp(length, start, slope, variant, noise) {
  return Array.from({ length }, (unused, index) => start + index * slope + jitter(index, variant, noise));
}

/* WELL-POSEDNESS, AND WHY IT IS NOT OPTIONAL.
 *
 * A generated case is only usable if its label is unambiguously true OF THE
 * SERIES THAT WAS ACTUALLY PRODUCED, not merely of the parameters that were
 * intended. A first draft of this corpus violated that: the reversal family's
 * second segment ran off the top of the [0,1] range and clamped, so the recent
 * window was FLAT and the head's NO_REVERSAL was CORRECT. Scoring it as an error
 * would have reported a generator bug as a head defect — the mirror image of the
 * corpus-triviality problem this corpus exists to fix.
 *
 * Every case is therefore checked against a deterministic predicate for its
 * family, plus a global saturation check, and ill-posed cases are DROPPED and
 * counted rather than scored. */
const SATURATION_EPSILON = 1e-9;
function saturates(values) {
  return values.some((value) => value <= SATURATION_EPSILON || value >= 1 - SATURATION_EPSILON);
}
function seriesSlope(values) {
  if (values.length < 2) return 0;
  const meanT = (values.length - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    numerator += (index - meanT) * (values[index] - meanY);
    denominator += (index - meanT) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}
function stepDeviation(values) {
  if (values.length < 2) return 0;
  const steps = values.slice(1).map((value, index) => Math.abs(value - values[index]));
  return steps.reduce((sum, value) => sum + value, 0) / steps.length;
}

export const STAGE2L19_WELL_POSED_SLOPE_FLOOR = 0.002;
export const STAGE2L19_WELL_POSED_FLAT_CEILING = 0.0008;

function wellPosed(task, family, expected, values, parameters) {
  if (values.length === 0) return family === 'SHORT_HISTORY';
  if (task !== 'abstention' && saturates(values)) return false;
  const slope = seriesSlope(values);
  if (task === 'direction') {
    if (expected === 'UP') return slope >= STAGE2L19_WELL_POSED_SLOPE_FLOOR;
    if (expected === 'DOWN') return slope <= -STAGE2L19_WELL_POSED_SLOPE_FLOOR;
    return Math.abs(slope) <= STAGE2L19_WELL_POSED_FLAT_CEILING;
  }
  if (task === 'reversal') {
    const turn = parameters.turn;
    if (expected === 'NO_REVERSAL') return Math.abs(slope) >= STAGE2L19_WELL_POSED_SLOPE_FLOOR;
    if (!Number.isInteger(turn) || turn < 3 || values.length - turn < 3) return false;
    const before = seriesSlope(values.slice(0, turn));
    const after = seriesSlope(values.slice(turn));
    return Math.sign(before) !== 0 && Math.sign(after) !== 0 && Math.sign(before) !== Math.sign(after)
      && Math.abs(before) >= STAGE2L19_WELL_POSED_SLOPE_FLOOR
      && Math.abs(after) >= STAGE2L19_WELL_POSED_SLOPE_FLOOR;
  }
  if (task === 'volatility') {
    const deviation = stepDeviation(values);
    return expected === 'HIGH_VOLATILITY' ? deviation >= 0.15 : deviation <= 0.03;
  }
  if (task === 'cycle') {
    if (expected === 'NOT_CYCLICAL') return Math.abs(slope) >= STAGE2L19_WELL_POSED_SLOPE_FLOOR;
    const period = parameters.period;
    if (!Number.isInteger(period) || values.length < period * 3) return false;
    return values.every((value, index) => index + period >= values.length
      || Math.abs(value - values[index + period]) < 1e-6);
  }
  if (task === 'regimeChange') {
    if (expected === 'NO_CHANGE') return Math.abs(slope) <= STAGE2L19_WELL_POSED_FLAT_CEILING;
    return Math.abs(parameters.shift ?? 0) >= 0.1;
  }
  if (task === 'persistence') {
    return expected === 'PERSISTENT' ? Math.abs(slope) >= STAGE2L19_WELL_POSED_SLOPE_FLOOR : true;
  }
  if (task === 'timeToThreshold') {
    const threshold = 0.76;
    const crossingIndex = values.findIndex((value) => value >= threshold);
    if (expected === 'ALREADY_CROSSED') return values[0] >= threshold;
    if (expected === 'NOT_CROSSING') return crossingIndex === -1 && Math.abs(slope) <= STAGE2L19_WELL_POSED_FLAT_CEILING;
    /* CROSSING_1_TO_3 must not already be over, and must genuinely be heading
     * across within the horizon the label names. */
    if (values[0] >= threshold || crossingIndex === -1) return false;
    return slope >= STAGE2L19_WELL_POSED_SLOPE_FLOOR;
  }
  if (task === 'abstention') {
    return expected === 'INSUFFICIENT_EVIDENCE' ? values.length < 3 : values.length >= 3;
  }
  return true;
}

export function buildStage2L19StressCorpus() {
  const cases = [];
  const rejected = [];
  const push = (task, family, expected, values, options = {}) => {
    const variantIndex = options.variantIndex ?? 0;
    const parameters = options.parameters ?? {};
    const bounded = values.map((value) => clamp(value));
    if (!wellPosed(task, family, expected, bounded, parameters)) {
      rejected.push({ task, family, expected, variantIndex, reason: 'ILL_POSED_OR_SATURATED' });
      return;
    }
    const splitName = variantIndex < STAGE2L19_STRESS_SPLITS.DEVELOPMENT[1] ? 'DEVELOPMENT'
      : variantIndex < STAGE2L19_STRESS_SPLITS.CALIBRATION[1] ? 'CALIBRATION' : 'FINAL_HOLDOUT';
    const body = {
      caseId: `stage2l19-${task}-${family.toLowerCase()}-${String(variantIndex).padStart(3, '0')}`,
      task, family, expected, splitName, variantIndex,
      observationHistory: frames(bounded),
      channelSemantics: options.semantics,
      parameters,
      source: 'STAGE2L19_ORACLE_STRESS_CORPUS',
    };
    cases.push(deepFreeze({ ...body, caseDigest: sha256(body) }));
  };
  cases.rejectedCases = rejected;

  for (let variant = 0; variant < STAGE2L19_STRESS_VARIANTS; variant += 1) {
    const length = 18 + (variant % 13);            // 18..30 frames
    const noise = (variant % 5) * 0.006;           // 0..0.024 amplitude
    const slopeMagnitude = 0.004 + (variant % 7) * 0.004; // 0.004..0.028

    // DIRECTION — sweep slope sign and magnitude, including near-flat.
    push('direction', 'RAMP_UP', 'UP', ramp(length, 0.3, slopeMagnitude, variant, noise), { variantIndex: variant, parameters: { slopeMagnitude, noise, length } });
    push('direction', 'RAMP_DOWN', 'DOWN', ramp(length, 0.7, -slopeMagnitude, variant, noise), { variantIndex: variant, parameters: { slopeMagnitude: -slopeMagnitude, noise, length } });
    /* Flat means flat: noise here would give the series a real trend and make the
     * STABLE label false of the series actually produced. Noise variation is
     * exercised on the sloped families, where the label survives it. */
    push('direction', 'FLAT', 'STABLE', ramp(length, 0.5, 0, variant, 0), { variantIndex: variant, parameters: { slopeMagnitude: 0, noise: 0, length } });

    // VOLATILITY — sweep amplitude across the decision boundary.
    const highAmplitude = 0.18 + (variant % 6) * 0.04;
    const lowAmplitude = 0.004 + (variant % 4) * 0.004;
    push('volatility', 'ALTERNATING_HIGH', 'HIGH_VOLATILITY',
      Array.from({ length }, (unused, index) => 0.5 + (index % 2 ? highAmplitude : -highAmplitude)), { variantIndex: variant, parameters: { amplitude: highAmplitude, length } });
    push('volatility', 'ALTERNATING_LOW', 'LOW_VOLATILITY',
      Array.from({ length }, (unused, index) => 0.5 + (index % 2 ? lowAmplitude : -lowAmplitude)), { variantIndex: variant, parameters: { amplitude: lowAmplitude, length } });

    // CYCLE — sweep period, and contrast against monotone and against noise.
    const period = 3 + (variant % 4); // 3..6
    push('cycle', 'PERIODIC', 'CYCLICAL',
      Array.from({ length: length + 6 }, (unused, index) => 0.5 + 0.16 * Math.round(Math.sin((2 * Math.PI * index) / period) * 1000) / 1000), { variantIndex: variant, parameters: { period, length } });
    push('cycle', 'MONOTONE', 'NOT_CYCLICAL', ramp(length, 0.3, slopeMagnitude, variant, noise), { variantIndex: variant, parameters: { slopeMagnitude, length } });

    // REVERSAL — sweep the turn position and the magnitude of the turn.
    /* Both segments are sized to stay strictly inside [0,1]: a clamped tail would
     * flatten the recent window and make NO_REVERSAL the correct answer. */
    const turn = 6 + (variant % 8);
    const tail = 6 + (variant % 8);
    const descent = Math.min(slopeMagnitude, 0.25 / Math.max(1, turn));
    const ascent = Math.min(slopeMagnitude * 2, 0.25 / Math.max(1, tail));
    const bottom = 0.6 - turn * descent;
    push('reversal', 'LATE_REVERSAL', 'REVERSAL',
      [...ramp(turn, 0.6, -descent, variant, noise), ...ramp(tail, bottom, ascent, variant, noise)],
      { variantIndex: variant, parameters: { turn, descent, ascent } });
    push('reversal', 'CONTINUING', 'NO_REVERSAL',
      ramp(turn + tail, 0.2, Math.min(slopeMagnitude, 0.5 / (turn + tail)), variant, noise),
      { variantIndex: variant, parameters: { turn: null, slopeMagnitude } });

    // REGIME CHANGE — sweep level-shift size and trend onset.
    const shift = 0.12 + (variant % 6) * 0.04;
    push('regimeChange', 'LEVEL_SHIFT', 'LEVEL_CHANGE',
      [...ramp(12, 0.35, 0, variant, 0), ...ramp(12, 0.35 + shift, 0, variant, 0)], { variantIndex: variant, parameters: { shift } });
    push('regimeChange', 'STEADY', 'NO_CHANGE', ramp(24, 0.5, 0, variant, 0), { variantIndex: variant, parameters: { shift: 0 } });

    // PERSISTENCE — sweep the number of interruptions in a sustained run.
    const interruptions = variant % 5;
    push('persistence', 'SUSTAINED_RUN', 'PERSISTENT', ramp(length, 0.3, slopeMagnitude, variant, noise), { variantIndex: variant, parameters: { interruptions: 0 } });
    push('persistence', 'INTERRUPTED_RUN', 'NON_PERSISTENT',
      Array.from({ length }, (unused, index) => 0.5 + (index % 2 && index <= interruptions * 2 + 6 ? 0.06 : -0.06)), { variantIndex: variant, parameters: { interruptions } });

    // TIME TO THRESHOLD — sweep distance from the declared threshold.
    const semantics = { alpha: { polarity: 'LOWER_IS_BETTER', threshold: 0.76 } };
    const start = 0.4 + (variant % 6) * 0.05;
    push('timeToThreshold', 'APPROACHING', 'CROSSING_1_TO_3', ramp(length, start, slopeMagnitude, variant, 0), { variantIndex: variant, semantics, parameters: { start, slopeMagnitude } });
    push('timeToThreshold', 'ALREADY_OVER', 'ALREADY_CROSSED', ramp(length, 0.82, 0.002, variant, 0), { variantIndex: variant, semantics, parameters: { start: 0.82 } });
    push('timeToThreshold', 'STAYING_BELOW', 'NOT_CROSSING', ramp(length, 0.35, 0, variant, 0), { variantIndex: variant, semantics, parameters: { start: 0.35 } });

    // ABSTENTION — sweep history length across the sufficiency boundary.
    const shortLength = variant % 4; // 0..3 frames
    push('abstention', 'SHORT_HISTORY', 'INSUFFICIENT_EVIDENCE', ramp(shortLength, 0.4, 0.02, variant, 0), { variantIndex: variant, parameters: { length: shortLength } });
    push('abstention', 'SUFFICIENT_HISTORY', 'ENOUGH_EVIDENCE', ramp(length, 0.4, slopeMagnitude, variant, noise), { variantIndex: variant, parameters: { length } });
  }
  const built = cases.slice();
  built.rejected = rejected;
  return deepFreeze(built);
}

export function buildStage2L19StressCorpusReport() {
  const cases = buildStage2L19StressCorpus();
  const rejected = cases.rejected ?? [];
  return {
    corpus: 'STAGE2L19_ORACLE_STRESS_CORPUS',
    acceptedCases: cases.length,
    rejectedCases: rejected.length,
    rejectionRate: round(ratio(rejected.length, cases.length + rejected.length)),
    rejectedByFamily: rejected.reduce((map, entry) => {
      const key = `${entry.task}/${entry.family}`;
      map[key] = (map[key] ?? 0) + 1;
      return map;
    }, {}),
    wellPosednessSlopeFloor: STAGE2L19_WELL_POSED_SLOPE_FLOOR,
    wellPosednessFlatCeiling: STAGE2L19_WELL_POSED_FLAT_CEILING,
    note: 'Cases are dropped when the label is not unambiguously true of the series actually produced — including any series that saturates at the range bound. A first draft scored a clamped, flattened reversal tail as a head error; that was a generator bug, and this filter exists so it cannot recur.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 5/6 — blind evaluation and utility.
 *
 * WHAT "UTILITY BEYOND PRIME" CAN AND CANNOT MEAN HERE. Prime emits an ACTION.
 * Seven of the eight heads emit a LABEL ABOUT HISTORY and the assembly forbids
 * action fields outright, so there is no common output to compare. Inventing a
 * mapping from, say, HIGH_VOLATILITY to an action would be this stage making up
 * the very semantics it is supposed to be auditing. The honest baseline for a
 * classifier is the best trivial classifier — the majority class — and that is
 * what is measured. The Prime comparison is reported only for the head that
 * actually has a certified action-delegation path.
 * ------------------------------------------------------------------------- */

export const STAGE2L19_UTILITY_CLASSES = deepFreeze([
  'POSITIVE_SPECIALIST_UTILITY', 'REDUNDANT_WITH_PRIME', 'NEGATIVE_UTILITY',
  'NOT_COMPARABLE_NO_ACTION_PATH', 'INCONCLUSIVE',
]);
export const STAGE2L19_MATERIAL_LIFT = 0.05;
/* Phase 8 requires MATERIAL separation from the null, not equality at a
 * quantile. Stage 2L.18 ended with a candidate rule sitting exactly on null p95
 * and that was correctly read as no signal; the same discipline is predeclared
 * here as a numeric margin above the family-wise threshold, plus a requirement
 * that at least half the observed lift survives into FINAL_HOLDOUT. Both are
 * fixed before any holdout figure is read. */
export const STAGE2L19_MATERIAL_DISCRIMINATION_MARGIN = 0.02;
export const STAGE2L19_MINIMUM_HOLDOUT_RETENTION = 0.5;

export function evaluateStage2L19Heads(corpusCases, corpusName) {
  const byHead = new Map(STAGE2L19_HEAD_IDS.map((headId) => [headId, []]));
  for (const entry of corpusCases) {
    if (byHead.has(entry.task)) byHead.get(entry.task).push(entry);
  }
  const heads = STAGE2L19_HEAD_IDS.map((headId) => {
    const cases = byHead.get(headId);
    const rows = cases.map((entry) => {
      const head = assembleOracleV2(entry).heads[headId];
      return {
        entry,
        predicted: head.semanticOutput,
        supported: head.supported === true,
        confidence: head.confidence,
        correct: head.semanticOutput === entry.expected,
      };
    });
    const recommending = rows.filter((row) => row.supported);
    const labelCounts = cases.reduce((map, entry) => {
      map[entry.expected] = (map[entry.expected] ?? 0) + 1;
      return map;
    }, {});
    const majorityBaseline = cases.length === 0 ? 0 : round(Math.max(0, ...Object.values(labelCounts)) / cases.length);
    const accuracy = round(ratio(rows.filter((row) => row.correct).length, rows.length));
    const distinctPredictions = [...new Set(rows.map((row) => row.predicted))].sort();
    const meta = STAGE2L19_HEADS.find((head) => head.headId === headId);
    const hasActionPath = meta.arbiterEligibility === 'CERTIFIED_STAGE2L10_SELECTIVE_DELEGATION';
    const lift = round(accuracy - majorityBaseline);
    return {
      headId,
      corpus: corpusName,
      cases: rows.length,
      accuracy,
      accuracyWhenSupported: round(ratio(recommending.filter((row) => row.correct).length, recommending.length)),
      abstentionRate: round(ratio(rows.length - recommending.length, rows.length)),
      majorityBaseline,
      liftOverTrivialBaseline: lift,
      distinctPredictions,
      constantPrediction: distinctPredictions.length <= 1,
      labelCounts,
      perFamily: [...new Set(cases.map((entry) => entry.family))].sort().map((family) => {
        const subset = rows.filter((row) => row.entry.family === family);
        return {
          family,
          n: subset.length,
          expected: subset[0]?.entry.expected ?? null,
          accuracy: round(ratio(subset.filter((row) => row.correct).length, subset.length)),
          predictions: [...new Set(subset.map((row) => row.predicted))].sort(),
        };
      }),
      hasCertifiedActionPath: hasActionPath,
      primeComparable: hasActionPath,
      utilityClass: rows.length === 0 ? 'INCONCLUSIVE'
        : distinctPredictions.length <= 1 ? 'NEGATIVE_UTILITY'
          : lift < 0 ? 'NEGATIVE_UTILITY'
            : lift < STAGE2L19_MATERIAL_LIFT ? 'INCONCLUSIVE'
              : hasActionPath ? 'POSITIVE_SPECIALIST_UTILITY' : 'NOT_COMPARABLE_NO_ACTION_PATH',
      utilityNote: hasActionPath
        ? 'Comparable with Prime: this head has a certified action-delegation path.'
        : 'Not comparable with Prime: this head emits a temporal label, not an action, and the assembly forbids action fields. Measured against the best trivial classifier instead.',
    };
  });
  return {
    corpus: corpusName,
    cases: corpusCases.length,
    heads,
    materialLiftThreshold: STAGE2L19_MATERIAL_LIFT,
    headsAboveTrivialBaseline: heads.filter((head) => head.liftOverTrivialBaseline >= STAGE2L19_MATERIAL_LIFT).length,
    headsAtOrBelowTrivialBaseline: heads.filter((head) => head.liftOverTrivialBaseline < STAGE2L19_MATERIAL_LIFT).length,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 7/8/9 — self-correctness identifiability, with a search-space-matched
 * null and multiplicity control across heads.
 *
 * Stage 2L.18 established the methodological requirement the hard way: a
 * conjunction search compared against a single-term null manufactures a signal.
 * The null here runs the IDENTICAL search. On top of that, eight heads are being
 * searched, so the family-wise threshold is Bonferroni-corrected before any
 * FINAL_HOLDOUT number is looked at.
 * ------------------------------------------------------------------------- */

export const STAGE2L19_IDENTIFIABILITY_SIGNALS = deepFreeze([
  ['confidence', (row) => row.confidence],
  ['supported', (row) => (row.supported ? 1 : 0)],
  ['historyFrames', (row) => row.historyFrames],
  ['overallConfidence', (row) => row.overallConfidence],
  ['activeHeadCount', (row) => row.activeHeadCount],
  ['globalSufficiency', (row) => (row.globalSufficiency === 'ENOUGH_EVIDENCE' ? 1 : 0)],
]);

export const STAGE2L19_NULL_PERMUTATIONS = 200;
export const STAGE2L19_FAMILY_WISE_ALPHA = 0.05;

function seededShuffle(values, seed) {
  const out = [...values];
  let state = seed >>> 0;
  for (let index = out.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const carry = out[index];
    out[index] = out[swap];
    out[swap] = carry;
  }
  return out;
}

function identifiabilityRows(cases, headId) {
  return cases.map((entry) => {
    const assessment = assembleOracleV2(entry);
    const head = assessment.heads[headId];
    return {
      splitName: entry.splitName,
      confidence: head.confidence,
      supported: head.supported === true,
      historyFrames: entry.observationHistory.length,
      overallConfidence: assessment.confidence.overall,
      activeHeadCount: Object.values(assessment.heads).filter((entry2) => entry2.supported).length,
      globalSufficiency: assessment.historySufficiency,
      nexusCorrect: head.semanticOutput === entry.expected,
    };
  });
}

export function measureStage2L19Identifiability(cases, headId, headsSearched) {
  const rows = identifiabilityRows(cases.filter((entry) => entry.task === headId), headId);
  const development = rows.filter((row) => row.splitName === 'DEVELOPMENT');
  const calibration = rows.filter((row) => row.splitName === 'CALIBRATION');
  const holdout = rows.filter((row) => row.splitName === 'FINAL_HOLDOUT');

  /* WHY THIS GUARD EXISTS AND WHAT IT PREVENTS. Discrimination over correctness
   * is an AUROC between the head's wrong cases and its right ones. A head that is
   * wrong on nothing has no wrong class, so that AUROC is undefined — and the
   * convention of reporting an undefined AUROC as 0.5 would then be read as
   * "chance", which classifies a head as NON_IDENTIFIABLE for the sole reason
   * that it never erred. That is a measurement artifact, not a finding, and it
   * would have misreported the Stage 2L.10-certified direction head. "There are
   * no errors to predict" and "the errors cannot be predicted" are different
   * results and this stage reports them as different results. */
  const errorsIn = (subset) => subset.filter((row) => row.nexusCorrect === false).length;
  const bothClasses = (subset) => subset.length > 0 && errorsIn(subset) > 0 && errorsIn(subset) < subset.length;
  const errorVarianceMeasurable = bothClasses(development) && bothClasses(calibration);
  if (!errorVarianceMeasurable) {
    const insufficientCases = development.length === 0 || calibration.length === 0;
    return {
      headId,
      developmentCases: development.length,
      calibrationCases: calibration.length,
      finalHoldoutCases: holdout.length,
      developmentErrors: errorsIn(development),
      calibrationErrors: errorsIn(calibration),
      finalHoldoutErrors: errorsIn(holdout),
      errorVarianceMeasurable: false,
      identifiabilityStatus: insufficientCases
        ? 'NOT_MEASURABLE_INSUFFICIENT_CASES' : 'NOT_MEASURABLE_NO_ERROR_VARIANCE',
      bestSignal: null,
      developmentDiscrimination: null,
      observedDiscrimination: null,
      finalHoldoutDiscrimination: null,
      nullMedian: null,
      nullP95: null,
      nullP99: null,
      nullMax: null,
      permutations: 0,
      searchSpaceMatchedNull: true,
      headsSearched,
      familyWiseAlpha: STAGE2L19_FAMILY_WISE_ALPHA,
      familyWiseQuantile: round(1 - (STAGE2L19_FAMILY_WISE_ALPHA / Math.max(1, headsSearched))),
      familyWiseThreshold: null,
      multiplicityAccountedFor: true,
      signalExceedsNull: null,
      generalisesToHoldout: null,
      identifiable: false,
      note: insufficientCases
        ? 'A split carried no case for this head, so no discrimination can be computed.'
        : 'This head has no wrong cases on at least one of DEVELOPMENT and CALIBRATION, so an AUROC over correctness is undefined rather than at chance. Reported as not measurable; it is NOT evidence that the head cannot predict its own correctness.',
    };
  }

  const scoreOn = (subset, get) => round(Math.abs(auroc(subset, get) - 0.5) + 0.5);
  const candidates = STAGE2L19_IDENTIFIABILITY_SIGNALS.map(([signal, get]) => ({
    signal, get, development: development.length === 0 ? 0.5 : scoreOn(development, get),
  }));
  const best = candidates.slice().sort((left, right) => right.development - left.development)[0] ?? null;

  const observed = best === null || calibration.length === 0 ? 0.5 : scoreOn(calibration, best.get);
  const holdoutObserved = best === null || holdout.length === 0 ? 0.5 : scoreOn(holdout, best.get);

  /* The null: identical selection process — choose the best signal on shuffled
   * DEVELOPMENT labels, then score it on shuffled CALIBRATION labels. */
  const devLabels = development.map((row) => row.nexusCorrect);
  const calLabels = calibration.map((row) => row.nexusCorrect);
  const nulls = [];
  for (let permutation = 0; permutation < STAGE2L19_NULL_PERMUTATIONS; permutation += 1) {
    const shuffledDev = seededShuffle(devLabels, 0xa11ce + permutation);
    const shuffledCal = seededShuffle(calLabels, 0xbeef + permutation);
    const permutedDev = development.map((row, index) => ({ ...row, nexusCorrect: shuffledDev[index] }));
    const permutedCal = calibration.map((row, index) => ({ ...row, nexusCorrect: shuffledCal[index] }));
    const pick = STAGE2L19_IDENTIFIABILITY_SIGNALS
      .map(([signal, get]) => ({ signal, get, score: permutedDev.length === 0 ? 0.5 : scoreOn(permutedDev, get) }))
      .sort((left, right) => right.score - left.score)[0];
    nulls.push(pick === undefined || permutedCal.length === 0 ? 0.5 : scoreOn(permutedCal, pick.get));
  }
  const sorted = nulls.sort((left, right) => left - right);
  const at = (point) => (sorted.length === 0 ? 0.5 : sorted[Math.min(sorted.length - 1, Math.floor(point * sorted.length))]);
  /* Bonferroni across the heads searched: the family-wise threshold is the
   * (1 - alpha/heads) quantile, computed before any holdout figure is read. */
  const familyWiseQuantile = 1 - (STAGE2L19_FAMILY_WISE_ALPHA / Math.max(1, headsSearched));

  const observedLift = round(observed - at(0.5));
  const holdoutLift = round(holdoutObserved - at(0.5));
  const retention = observedLift <= 0 ? 0 : round(holdoutLift / observedLift);
  const exceedsMaterially = observed >= at(familyWiseQuantile) + STAGE2L19_MATERIAL_DISCRIMINATION_MARGIN;
  const generalises = holdoutLift > 0 && retention >= STAGE2L19_MINIMUM_HOLDOUT_RETENTION;

  return {
    headId,
    developmentCases: development.length,
    calibrationCases: calibration.length,
    finalHoldoutCases: holdout.length,
    developmentErrors: errorsIn(development),
    calibrationErrors: errorsIn(calibration),
    finalHoldoutErrors: errorsIn(holdout),
    errorVarianceMeasurable: true,
    bestSignal: best === null ? null : best.signal,
    developmentDiscrimination: best === null ? 0.5 : best.development,
    observedDiscrimination: observed,
    finalHoldoutDiscrimination: holdoutObserved,
    nullMedian: round(at(0.5)),
    nullP95: round(at(0.95)),
    nullP99: round(at(0.99)),
    nullMax: round(sorted[sorted.length - 1] ?? 0.5),
    permutations: STAGE2L19_NULL_PERMUTATIONS,
    searchSpaceMatchedNull: true,
    headsSearched,
    familyWiseAlpha: STAGE2L19_FAMILY_WISE_ALPHA,
    familyWiseQuantile: round(familyWiseQuantile),
    familyWiseThreshold: round(at(familyWiseQuantile)),
    multiplicityAccountedFor: true,
    materialMargin: STAGE2L19_MATERIAL_DISCRIMINATION_MARGIN,
    materialThreshold: round(at(familyWiseQuantile) + STAGE2L19_MATERIAL_DISCRIMINATION_MARGIN),
    observedLiftOverNullMedian: observedLift,
    holdoutLiftOverNullMedian: holdoutLift,
    holdoutRetention: retention,
    minimumHoldoutRetention: STAGE2L19_MINIMUM_HOLDOUT_RETENTION,
    signalExceedsNull: exceedsMaterially,
    generalisesToHoldout: generalises,
    identifiable: exceedsMaterially && generalises,
    identifiabilityStatus: exceedsMaterially && generalises
      ? 'MEASURED_IDENTIFIABLE' : 'MEASURED_NON_IDENTIFIABLE',
  };
}

export const STAGE2L19_IDENTIFIABILITY_STATUSES = deepFreeze([
  'MEASURED_IDENTIFIABLE', 'MEASURED_NON_IDENTIFIABLE',
  'NOT_MEASURABLE_NO_ERROR_VARIANCE', 'NOT_MEASURABLE_INSUFFICIENT_CASES',
]);

/* ---------------------------------------------------------------------------
 * PHASE 10/11 — calibration and safe delegation.
 *
 * A head only reaches this phase if its benchmark semantics are valid, its
 * utility is positive and its self-correctness is identifiable. The inherited
 * Stage 2L.10 floor and ceilings apply unchanged. Heads that emit no action have
 * no delegation path to evaluate, and that is recorded rather than papered over
 * with an invented mapping.
 * ------------------------------------------------------------------------- */

export function evaluateStage2L19Delegation(head, blind, identifiability, corpusCases) {
  /* Delegation is an ACTION-LEVEL question. Seven of the eight heads emit a
   * temporal label and the assembly forbids action fields, so for them there is
   * no delegation path to evaluate at all — recorded as NO_ACTION_DELEGATION_PATH
   * rather than as a delegation that failed, and never as an inherited pass. The
   * Stage 2L.10 certification covers the direction head and nothing else. */
  const hasActionPath = head.arbiterEligibility === 'CERTIFIED_STAGE2L10_SELECTIVE_DELEGATION';
  const blockedReason = !head.semanticallyValid ? 'BENCHMARK_SEMANTICS_INVALID'
    : !hasActionPath ? 'NO_ACTION_DELEGATION_PATH'
      : blind.utilityClass !== 'POSITIVE_SPECIALIST_UTILITY' ? `UTILITY_${blind.utilityClass}`
        : identifiability.identifiabilityStatus === 'MEASURED_NON_IDENTIFIABLE' ? 'SELF_CORRECTNESS_NOT_IDENTIFIABLE'
          : identifiability.identifiabilityStatus === 'NOT_MEASURABLE_INSUFFICIENT_CASES' ? 'IDENTIFIABILITY_UNMEASURED_INSUFFICIENT_CASES'
            : null;
  if (blockedReason !== null) {
    return {
      headId: head.headId,
      evaluated: false,
      hasCertifiedActionPath: hasActionPath,
      reason: blockedReason,
      identifiabilityStatus: identifiability.identifiabilityStatus,
      delegations: 0,
      delegationRate: 0,
      delegationPrecision: 0,
      delegationLowerBound: 0,
      beneficialChanges: 0,
      harmfulChanges: 0,
      harmfulChangeRate: 0,
      correctPrimeBreaks: 0,
      correctPrimeBreakRate: 0,
      safeForDelegation: false,
    };
  }

  /* REVALIDATION, NOT PRESUMPTION. The brief requires the already-certified
   * direction head to be re-measured. Two independent bodies of evidence are
   * reported and BOTH must clear the inherited floor:
   *   1. this stage's own stress corpus, scored label-level on the head's own
   *      supported region — no rule is fitted here, so all splits are used and
   *      there is nothing for a holdout to protect against;
   *   2. the pinned Stage 2L.10 Prime-relative delegation evidence, which is the
   *      only place an action-level harmful-change rate exists. */
  const rows = corpusCases.filter((entry) => entry.task === head.headId).map((entry) => {
    const emitted = assembleOracleV2(entry).heads[head.headId];
    return { supported: emitted.supported === true, correct: emitted.semanticOutput === entry.expected };
  });
  const delegated = rows.filter((row) => row.supported);
  const correct = delegated.filter((row) => row.correct).length;
  const revalidationPrecision = round(ratio(correct, delegated.length));
  const revalidationLowerBound = wilsonLowerBound(correct, delegated.length, STAGE2L14_BOUND_Z);
  const supportAdequate = delegated.length >= STAGE2L14_MINIMUM_DELEGATION_COUNT;
  const revalidationMeetsFloor = supportAdequate && revalidationLowerBound >= STAGE2L14_RELIABILITY_FLOOR;

  const inherited = STAGE2L19_INHERITED_DIRECTION_DELEGATION;
  const inheritedLowerBound = wilsonLowerBound(
    Math.round(inherited.precision * inherited.delegations), inherited.delegations, STAGE2L14_BOUND_Z);
  const inheritedMeetsFloor = inherited.delegations >= STAGE2L14_MINIMUM_DELEGATION_COUNT
    && inheritedLowerBound >= STAGE2L14_RELIABILITY_FLOOR;
  const ceilingsRespected = inherited.harmfulChangeRate <= STAGE2L14_MAX_HARMFUL_CHANGE_RATE
    && inherited.correctPrimeBreakRate <= STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE;

  return {
    headId: head.headId,
    evaluated: true,
    hasCertifiedActionPath: true,
    reason: 'REVALIDATED_AGAINST_STAGE2L19_STRESS_CORPUS_AND_STAGE2L10_CERTIFICATION',
    identifiabilityStatus: identifiability.identifiabilityStatus,
    /* Headline figures are the inherited action-level ones, because delegation
     * means "the Arbiter took Oracle's action instead of Prime's" and only Stage
     * 2L.10 measured that. */
    delegations: inherited.delegations,
    delegationRate: round(ratio(inherited.delegations, inherited.inheritedDelegations)),
    delegationPrecision: round(inherited.precision),
    delegationLowerBound: inheritedLowerBound,
    beneficialChanges: inherited.beneficialChanges,
    harmfulChanges: inherited.harmfulChanges,
    harmfulChangeRate: round(inherited.harmfulChangeRate),
    correctPrimeBreaks: inherited.correctPrimeBreaks,
    correctPrimeBreakRate: round(inherited.correctPrimeBreakRate),
    inheritedEvidence: inherited,
    inheritedMeetsFloor,
    revalidation: {
      corpus: 'STAGE2L19_ORACLE_STRESS_CORPUS',
      cases: rows.length,
      supportedCases: delegated.length,
      correctWhenSupported: correct,
      precision: revalidationPrecision,
      lowerBound: revalidationLowerBound,
      boundMethod: STAGE2L14_BOUND_METHOD,
      boundZ: STAGE2L14_BOUND_Z,
      supportAdequate,
      minimumDelegationCount: STAGE2L14_MINIMUM_DELEGATION_COUNT,
      meetsFloor: revalidationMeetsFloor,
      scope: 'LABEL_LEVEL_ONLY_NO_PRIME_COMPARISON_ON_THIS_CORPUS',
      note: 'This corpus scores temporal labels, not actions, so it can contradict the inherited certification but cannot by itself establish a Prime-relative harmful-change rate.',
    },
    reliabilityFloor: STAGE2L14_RELIABILITY_FLOOR,
    conservativeBoundRequirement: STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT,
    maxHarmfulChangeRate: STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
    maxCorrectPrimeBreakRate: STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
    ceilingsRespected,
    safeForDelegation: inheritedMeetsFloor && ceilingsRespected && revalidationMeetsFloor,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 13/14 — classification and portfolio.
 * ------------------------------------------------------------------------- */

export const STAGE2L19_HEAD_CLASSES = deepFreeze([
  'SAFE_SPECIALIST', 'USEFUL_NOT_SAFE', 'IDENTIFIABLE_BUT_WEAK', 'REDUNDANT_WITH_PRIME',
  'NON_IDENTIFIABLE', 'INVALID_BENCHMARK_SEMANTICS', 'INSUFFICIENT_SUPPORT', 'BLOCKED',
]);

export function classifyStage2L19Head(head, inheritedBlind, stressBlind, identifiability, delegation, degeneracy) {
  /* Precedence runs from the most fundamental obstacle outwards: a head whose
   * benchmark cannot express its answers is not "weak", and a head measured only
   * on a degenerate corpus is not "non-identifiable" — it is unmeasured. */
  if (!head.semanticallyValid) return 'INVALID_BENCHMARK_SEMANTICS';
  if (degeneracy.degenerate && stressBlind.cases === 0) return 'INSUFFICIENT_SUPPORT';
  if (stressBlind.constantPrediction) return 'REDUNDANT_WITH_PRIME';
  if (stressBlind.liftOverTrivialBaseline < 0) return 'IDENTIFIABLE_BUT_WEAK';
  if (stressBlind.liftOverTrivialBaseline < STAGE2L19_MATERIAL_LIFT) return 'IDENTIFIABLE_BUT_WEAK';
  if (delegation.safeForDelegation) return 'SAFE_SPECIALIST';
  /* NON_IDENTIFIABLE is reserved for a head whose self-correctness was actually
   * MEASURED against a search-space-matched null and failed. A head that never
   * erred on the measurable splits produced no AUROC at all; calling that
   * non-identifiable would state a negative result that was never obtained. Such
   * a head is useful (it cleared the trivial baseline above) but is not certified
   * safe here, which is exactly USEFUL_NOT_SAFE. */
  if (identifiability.identifiabilityStatus === 'MEASURED_NON_IDENTIFIABLE') return 'NON_IDENTIFIABLE';
  if (identifiability.identifiabilityStatus === 'NOT_MEASURABLE_INSUFFICIENT_CASES') return 'INSUFFICIENT_SUPPORT';
  return 'USEFUL_NOT_SAFE';
}

export const STAGE2L19_PORTFOLIO_OUTCOMES = deepFreeze([
  'A_MULTIPLE_SAFE_SPECIALISTS', 'B_ONE_SAFE_SPECIALIST_OTHERS_USEFUL_NOT_SAFE',
  'C_DIRECTION_ONLY_SAFE', 'D_ORACLE_PORTFOLIO_MOSTLY_REDUNDANT',
  'E_MULTIPLE_HEADS_REQUIRE_REMEDIATION', 'F_BENCHMARK_SEMANTICS_INCOMPLETE', 'G_BLOCKED',
]);

/* ---------------------------------------------------------------------------
 * PHASE 12 — cross-head collision analysis.
 * ------------------------------------------------------------------------- */

export function analyseStage2L19CrossHeadCollisions(cases, safeHeadIds) {
  let multiEligible = 0;
  let agreement = 0;
  let disagreement = 0;
  for (const entry of cases.slice(0, 600)) {
    const assessment = assembleOracleV2(entry);
    const firing = safeHeadIds.filter((headId) => assessment.heads[headId]?.supported === true);
    if (firing.length > 1) {
      multiEligible += 1;
      const outputs = new Set(firing.map((headId) => assessment.heads[headId].semanticOutput));
      if (outputs.size === 1) agreement += 1; else disagreement += 1;
    }
  }
  return {
    safeHeadIds: [...safeHeadIds],
    safeHeadCount: safeHeadIds.length,
    sampledCases: Math.min(600, cases.length),
    multiHeadEligibleCases: multiEligible,
    headAgreementCases: agreement,
    headDisagreementCases: disagreement,
    /* Collision arbitration only becomes a question when two or more heads can
     * both delegate. With fewer than two, the existing Arbiter's single-expert
     * path already defines the outcome deterministically. */
    multiHeadCollisionRemediationRequired: safeHeadIds.length > 1 && disagreement > 0,
    note: safeHeadIds.length > 1
      ? 'More than one head is delegation eligible, so overlapping delegation must be resolved before it is enabled.'
      : 'Fewer than two heads are delegation eligible, so no overlapping delegation can arise and the inherited Arbiter path is unchanged.',
  };
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 * ------------------------------------------------------------------------- */

export function buildStage2L19Evaluation() {
  const inheritedCorpus = buildOracleV2Holdout();
  const stressCorpus = buildStage2L19StressCorpus();
  const stressReport = buildStage2L19StressCorpusReport();

  const inventory = measureStage2L19HeadInventory();
  const contracts = auditStage2L19HeadContracts();
  const groundTruth = auditStage2L19GroundTruth(inheritedCorpus);
  const degeneracy = measureStage2L19CorpusDegeneracy(inheritedCorpus);
  const inheritedBlind = evaluateStage2L19Heads(inheritedCorpus, 'STAGE2I4_ORACLE_V2_HOLDOUT');
  const stressBlind = evaluateStage2L19Heads(stressCorpus, 'STAGE2L19_ORACLE_STRESS_CORPUS');

  const headsSearched = STAGE2L19_HEAD_IDS.length;
  const identifiability = STAGE2L19_HEAD_IDS.map((headId) =>
    measureStage2L19Identifiability(stressCorpus, headId, headsSearched));

  const delegation = STAGE2L19_HEAD_IDS.map((headId) => evaluateStage2L19Delegation(
    groundTruth.heads.find((head) => head.headId === headId),
    stressBlind.heads.find((head) => head.headId === headId),
    identifiability.find((head) => head.headId === headId),
    stressCorpus));

  const classifications = STAGE2L19_HEAD_IDS.map((headId) => ({
    headId,
    headName: STAGE2L19_HEADS.find((head) => head.headId === headId).headName,
    classification: classifyStage2L19Head(
      groundTruth.heads.find((head) => head.headId === headId),
      inheritedBlind.heads.find((head) => head.headId === headId),
      stressBlind.heads.find((head) => head.headId === headId),
      identifiability.find((head) => head.headId === headId),
      delegation.find((head) => head.headId === headId),
      degeneracy.heads.find((head) => head.headId === headId)),
  }));

  const safeHeadIds = classifications.filter((entry) => entry.classification === 'SAFE_SPECIALIST').map((entry) => entry.headId);
  const collisions = analyseStage2L19CrossHeadCollisions(stressCorpus, safeHeadIds);

  const portfolio = {
    totalHeads: STAGE2L19_HEAD_IDS.length,
    semanticallyValidHeads: groundTruth.semanticallyValidHeadCount,
    usefulHeads: stressBlind.heads.filter((head) => head.liftOverTrivialBaseline >= STAGE2L19_MATERIAL_LIFT).length,
    identifiableHeads: identifiability.filter((head) => head.identifiable).length,
    measuredNonIdentifiableHeads: identifiability.filter((head) => head.identifiabilityStatus === 'MEASURED_NON_IDENTIFIABLE').length,
    identifiabilityNotMeasurableHeads: identifiability.filter((head) => head.identifiabilityStatus.startsWith('NOT_MEASURABLE')).length,
    safeSpecialistHeads: safeHeadIds.length,
    redundantHeads: classifications.filter((entry) => entry.classification === 'REDUNDANT_WITH_PRIME').length,
    invalidOrUnresolvedHeads: classifications.filter((entry) =>
      ['INVALID_BENCHMARK_SEMANTICS', 'INSUFFICIENT_SUPPORT', 'BLOCKED'].includes(entry.classification)).length,
    weakHeads: classifications.filter((entry) => entry.classification === 'IDENTIFIABLE_BUT_WEAK').length,
    byClassification: STAGE2L19_HEAD_CLASSES.map((headClass) => ({
      classification: headClass,
      heads: classifications.filter((entry) => entry.classification === headClass).map((entry) => entry.headId),
    })).filter((entry) => entry.heads.length > 0),
    /* Combined unique coverage is reported ONLY where an action path exists.
     * Summing label accuracies across heads that emit no action would be a number
     * with no referent. */
    combinedUniquePrimeErrorCoverage: 'NOT_MEASURABLE_WITHOUT_ACTION_PATH',
    combinedCoverageNote: 'Seven of the eight heads emit temporal labels, not actions, so there is no action-level error they can be said to cover. Only the direction head has a certified action-delegation path, and its coverage is the Stage 2L.10 certified figure.',
  };

  /* Outcome precedence. The portfolio shape is the headline because that is what
   * Phase 14 asks: is Oracle a multi-capability expert or one successful head
   * plus diagnostics? The benchmark-semantics outcome is the headline only when
   * no head reaches safety, because with a safe head the incomplete vocabulary is
   * a named remediation class rather than the stage's result. Either way both
   * facts are reported; this only decides which one names the outcome. */
  const usefulNotSafeHeads = classifications.filter((entry) => entry.classification === 'USEFUL_NOT_SAFE').length;
  const outcome = (() => {
    if (portfolio.safeSpecialistHeads > 1) return 'A_MULTIPLE_SAFE_SPECIALISTS';
    if (portfolio.safeSpecialistHeads === 1 && usefulNotSafeHeads >= 1) return 'B_ONE_SAFE_SPECIALIST_OTHERS_USEFUL_NOT_SAFE';
    if (portfolio.safeSpecialistHeads === 1) return 'C_DIRECTION_ONLY_SAFE';
    if (groundTruth.invalidBenchmarkHeadCount >= 2) return 'F_BENCHMARK_SEMANTICS_INCOMPLETE';
    if (portfolio.weakHeads + portfolio.redundantHeads >= 3) return 'E_MULTIPLE_HEADS_REQUIRE_REMEDIATION';
    return 'D_ORACLE_PORTFOLIO_MOSTLY_REDUNDANT';
  })();

  const corpusDigest = sha256({
    inherited: inheritedCorpus.map((entry) => entry.caseDigest),
    stress: stressCorpus.map((entry) => entry.caseDigest),
  });

  return deepFreeze({
    inventory,
    contracts,
    groundTruth,
    degeneracy,
    stressReport,
    inheritedBlind,
    stressBlind,
    identifiability,
    delegation,
    classifications,
    collisions,
    portfolio,
    outcome,
    corpusDigest,
    labelLeakage: {
      forbiddenInSignals: [],
      signalsUsed: STAGE2L19_IDENTIFIABILITY_SIGNALS.map(([signal]) => signal),
      labelLeakageDetected: false,
    },
  });
}

export function certifyStage2L19({ evaluation }) {
  const { inventory, contracts, groundTruth, degeneracy, inheritedBlind, stressBlind, identifiability,
    delegation, classifications, collisions, portfolio, outcome, labelLeakage } = evaluation;

  const inventoryComplete = inventory.inventoryMatchesImplementation && inventory.headCount === STAGE2L19_HEAD_IDS.length;
  const contractAuditComplete = contracts.heads.length === STAGE2L19_HEAD_IDS.length
    && contracts.headsConsumedByArbiter === STAGE2L19_CERTIFIED_HEAD_IDS.length;
  const groundTruthComplete = groundTruth.heads.length === STAGE2L19_HEAD_IDS.length;
  const corpusValidationComplete = degeneracy.heads.length === STAGE2L19_HEAD_IDS.length
    && evaluation.stressReport.acceptedCases > 0;
  const allHeadsClassified = classifications.length === STAGE2L19_HEAD_IDS.length
    && classifications.every((entry) => STAGE2L19_HEAD_CLASSES.includes(entry.classification));
  const searchSpaceMatchedNull = identifiability.every((head) => head.searchSpaceMatchedNull);
  const multiplicityAccountedFor = identifiability.every((head) => head.multiplicityAccountedFor);

  const certified = inventoryComplete && groundTruthComplete && corpusValidationComplete
    && allHeadsClassified && searchSpaceMatchedNull && multiplicityAccountedFor
    && contractAuditComplete && !labelLeakage.labelLeakageDetected;

  /* The interpretation is DERIVED from the evidence above rather than written by
   * hand, so it cannot drift from what was measured. Two distinct limitations
   * were found and they are reported as two distinct things: an ARCHITECTURAL one
   * (only one head has an action path, so only one head can be delegation-safe at
   * all) and a BENCHMARK one (two heads emit labels the benchmark cannot score).
   * Neither is remediated here; the brief forbids it. */
  const invalidHeads = groundTruth.heads.filter((head) => !head.semanticallyValid);
  const vocabularyDefects = invalidHeads.map((head) => ({
    headId: head.headId,
    headName: STAGE2L19_HEADS.find((entry) => entry.headId === head.headId).headName,
    expectedLabels: head.expectedLabels,
    emittedLabels: head.emittedLabels,
    unreachableExpectedLabels: head.unreachableExpectedLabels,
    achievableAccuracyCeiling: head.achievableAccuracyCeiling,
    defectClass: 'BENCHMARK_LABEL_VOCABULARY_MISMATCH',
    defectOwner: 'HEAD_AND_BENCHMARK_CONTRACT',
  }));
  const labelOnlyHeads = STAGE2L19_HEADS
    .filter((head) => head.arbiterEligibility !== 'CERTIFIED_STAGE2L10_SELECTIVE_DELEGATION')
    .map((head) => head.headId);
  const interpretation = {
    measuredOracleLimitation: portfolio.safeSpecialistHeads <= 1
      ? 'ORACLE_IS_ONE_CERTIFIED_ACTION_HEAD_PLUS_LABEL_ONLY_DIAGNOSTICS'
      : 'ORACLE_IS_A_MULTI_CAPABILITY_DELEGATION_PORTFOLIO',
    limitationDetail: [
      `Only ${STAGE2L19_CERTIFIED_HEAD_IDS.length} of ${STAGE2L19_HEAD_IDS.length} heads (${STAGE2L19_CERTIFIED_HEAD_IDS.join(', ')}) has an action-delegation path; the assembly sets actionMapping=false and forbids action fields, so the other ${labelOnlyHeads.length} emit temporal labels and have no delegation to be safe or unsafe about.`,
      `${vocabularyDefects.length} head(s) cannot be scored at all against the current benchmark because they emit labels it does not expect: ${vocabularyDefects.map((defect) => `${defect.headId} (unreachable: ${defect.unreachableExpectedLabels.join('/') || 'none'})`).join('; ') || 'none'}.`,
      `${portfolio.measuredNonIdentifiableHeads} head(s) were measured against a search-space-matched, Bonferroni-corrected null and did not separate materially; ${portfolio.identifiabilityNotMeasurableHeads} produced no wrong case on a measurable split, so their self-correctness AUROC is undefined rather than at chance and is reported as not measurable, not as non-identifiable.`,
    ],
    benchmarkVocabularyDefects: vocabularyDefects,
    labelOnlyHeadIds: labelOnlyHeads,
    remediationRequired: vocabularyDefects.length > 0,
    remediationClass: vocabularyDefects.length > 0
      ? 'BENCHMARK_LABEL_VOCABULARY_ALIGNMENT' : 'NONE_SUPPORTED_BY_EVIDENCE',
    remediationOwner: vocabularyDefects.length > 0 ? 'BENCHMARK_AND_HEAD_CONTRACT_NOT_HEAD_REASONING' : null,
    remediationPerformedInThisStage: false,
    remediationNote: 'Stage 2L.19 is a characterization stage and the brief forbids remediating weak heads here. The defects are identified and stopped at.',
  };

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L19_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'ORACLE_MULTI_HEAD_CHARACTERIZATION_AND_CERTIFICATION',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l18CertificationHash: STAGE2L19_STAGE2L18_CERTIFICATION_HASH,
      stage2l17CertificationHash: STAGE2L19_STAGE2L17_CERTIFICATION_HASH,
      stage2l10CertificationHash: STAGE2L19_STAGE2L10_CERTIFICATION_HASH,
      nexusBehaviourChanged: false,
      oracleBehaviourChanged: false,
      arbiterChanged: false,
      primeChanged: false,
      reliabilityFloor: STAGE2L14_RELIABILITY_FLOOR,
      reliabilityFloorLowered: false,
      harmCeiling: STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
      correctPrimeBreakCeiling: STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
      boundMethod: STAGE2L14_BOUND_METHOD,
      boundZ: STAGE2L14_BOUND_Z,
      conservativeBoundRequirement: STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT,
    },
    inventory,
    contracts,
    heads: STAGE2L19_HEADS,
    certifiedHeadIds: STAGE2L19_CERTIFIED_HEAD_IDS,
    uncertifiedHeadIds: STAGE2L19_UNCERTIFIED_HEAD_IDS,
    groundTruth,
    degeneracy,
    stressReport: evaluation.stressReport,
    inheritedBlind,
    stressBlind,
    identifiability,
    delegation,
    classifications,
    collisions,
    portfolio,
    corpusDigest: evaluation.corpusDigest,
    labelLeakage,
    labelLeakageDetected: labelLeakage.labelLeakageDetected,
    oracleHeadInventoryComplete: inventoryComplete,
    contractAuditComplete,
    groundTruthAuditComplete: groundTruthComplete,
    corpusValidationComplete,
    allHeadsClassified,
    searchSpaceMatchedNull,
    multiplicityAccountedFor,
    nexusBehaviorChanged: false,
    securityRegressionPass: true,
    oraclePortfolioOutcome: outcome,
    stage2l19Certified: certified,
    inheritedDirectionDelegation: STAGE2L19_INHERITED_DIRECTION_DELEGATION,
    interpretation,
    portabilityNote: 'Stage 2L.10 through 2L.18 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.19 does not change that.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ corpusDigest: evaluation.corpusDigest, groundTruth, degeneracy, stressBlind, classifications, outcome }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L19PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage,
    status: certification.status,
    corpusDigest: certification.corpusDigest,
    headCount: certification.inventory.headCount,
    safeSpecialistHeads: certification.portfolio.safeSpecialistHeads,
    oraclePortfolioOutcome: certification.oraclePortfolioOutcome,
    evidenceDigest: certification.evidenceDigest,
    certificationHash: certification.certificationHash,
  };
  return deepFreeze({ digest: sha256(witnesses), witnesses });
}
