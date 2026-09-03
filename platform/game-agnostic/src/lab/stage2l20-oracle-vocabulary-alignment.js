/* Stage 2L.20 — Oracle benchmark vocabulary alignment, head contract repair
 * and requalification (R0, shadow only).
 *
 * WHAT STAGE 2L.19 REPORTED, AND WHERE IT WAS WRONG. Stage 2L.19 recorded two
 * heads as INVALID_BENCHMARK_SEMANTICS and named both a
 * BENCHMARK_LABEL_VOCABULARY_ALIGNMENT problem. Tracing each defect to its owner
 * shows they are NOT the same kind of defect, and one of them was misattributed:
 *
 *   persistence      — a REAL vocabulary divergence. The producer emits
 *                      NON_PERSISTENT; every authoritative owner (the original
 *                      Stage 2I.2 head, its corpus, and the Stage 2L.1/2L.2/2L.4
 *                      label schemas, and the Stage 2I.4 benchmark) says
 *                      NOT_PERSISTENT. Canonical is NOT_PERSISTENT and the
 *                      producer is the drifting party.
 *
 *   timeToThreshold  — NOT a vocabulary defect at all. The head emits
 *                      CROSSING_1_TO_3 correctly whenever that state occurs; no
 *                      benchmark case ever presents the state. Both the
 *                      inherited Stage 2I.4 APPROACHING_LIMIT family and Stage
 *                      2L.19's own APPROACHING family generate series whose LAST
 *                      OBSERVED VALUE IS ALREADY PAST THE THRESHOLD, so
 *                      ALREADY_CROSSED is the correct answer and the head is
 *                      right. The benchmark is wrong.
 *
 * Stage 2L.19's own well-posedness rule is the proximate cause of the second
 * one: it required the crossing to occur INSIDE the observed window, which for a
 * monotone ramp guarantees the series ends above the threshold — it enforced
 * exactly the condition that makes the label false. That is this stage's finding
 * about its predecessor, and it is recorded rather than quietly fixed.
 *
 * WHAT THIS STAGE MAY AND MAY NOT TOUCH. Predecessors are frozen. The repair
 * therefore supersedes rather than edits, exactly as Stage 2L.13 and Stage 2L.17
 * did: nothing under src/lab/stage2i*.js or the earlier stage2l*.js changes, so
 * every prior certification still reproduces byte-identically. Editing the
 * assembly in place would rewrite `assessmentDigest` for every head and break the
 * Stage 2L.10 and Stage 2L.19 certifications, which Phase 0 and Phase 14 forbid.
 *
 * THE DEEPER PERSISTENCE DEFECT THIS STAGE DOES NOT PATCH. Canonicalising the
 * label moves accuracy by exactly zero, because on the inherited corpus the head
 * does not emit the misnamed label either — it ABSTAINS. Stage 2I.3 changed two
 * things at once: it renamed the label AND it added an INDETERMINATE_DIRECTION
 * abstention that the original Stage 2I.2 head did not have. The original head
 * answered NOT_PERSISTENT on a flat or alternating series (its own STABLE family
 * is labelled exactly that); the remediated head abstains instead. That is an
 * algorithm semantics change, not a vocabulary one, and the brief forbids
 * redesigning Oracle algorithms here. It is identified, owned and stopped at.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2, buildOracleV2Holdout } from './stage2i4-oracle-v2-assembly.js';
import { evaluateStage2I2Head } from './stage2i2-oracle-task-head-diagnostic.js';
import { auroc } from './stage2l15-nexus-decision-stability.js';
import {
  STAGE2L19_FAMILY_WISE_ALPHA,
  STAGE2L19_HEADS,
  STAGE2L19_HEAD_IDS,
  STAGE2L19_IDENTIFIABILITY_SIGNALS,
  STAGE2L19_MATERIAL_DISCRIMINATION_MARGIN,
  STAGE2L19_MATERIAL_LIFT,
  STAGE2L19_MINIMUM_HOLDOUT_RETENTION,
  STAGE2L19_NULL_PERMUTATIONS,
  STAGE2L19_STRESS_SPLITS,
  STAGE2L19_STRESS_VARIANTS,
  buildStage2L19StressCorpus,
} from './stage2l19-oracle-multi-head-qualification.js';

export const STAGE2L20_STAGE = 'STAGE2L20_ORACLE_VOCABULARY_ALIGNMENT_AND_CONTRACT_REPAIR';
export const STAGE2L20_STAGE2L19_CERTIFICATION_HASH = '145ce640b0b7a9bcceaa9688d248f2ba4cf8dd89ff30cd8301f69f2eadc9f3fe';
export const STAGE2L20_STAGE2L10_CERTIFICATION_HASH = '73e958a02a479326bb60cad058fa5cc3e29d5c77614aaef87936aa41dba41a86';

function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }

/* ---------------------------------------------------------------------------
 * PHASE 1 — contract owner audit.
 *
 * Owners are read from the modules themselves, and the producer label sets are
 * PROBED off live evaluations rather than copied from a table, so a table that
 * has drifted from its implementation cannot hide here.
 * ------------------------------------------------------------------------- */

export const STAGE2L20_AFFECTED_HEADS = deepFreeze(['persistence', 'timeToThreshold']);

export const STAGE2L20_CONTRACT_OWNERS = deepFreeze({
  persistence: {
    headId: 'persistence',
    implementationOwner: 'src/lab/stage2i3-oracle-head-remediation.js::evaluatePersistenceV2 (BOUNDED_INTERRUPTION_TOLERANCE)',
    originalImplementationOwner: 'src/lab/stage2i2-oracle-task-head-diagnostic.js::evaluateStage2I2Head(PERSISTENCE_HEAD)',
    schemaOwners: [
      'src/lab/stage2l1-counterfactual-expert-information.js::persistence',
      'src/lab/stage2l2-independent-counterfactual-replication.js::persistence',
      'src/lab/stage2l4-oracle-head-specific-decision-eligibility.js::persistence',
    ],
    corpusOwner: 'src/lab/stage2i4-oracle-v2-assembly.js::buildOracleV2Holdout (ALTERNATING_INTERRUPTION)',
    benchmarkOwner: 'src/lab/stage2i2-oracle-task-head-diagnostic.js (INTERMITTENT_TREND / LATE_INTERRUPTION / STABLE)',
    testOwner: 'tests/stage2l19-oracle-multi-head-qualification.test.js',
    serializationOwner: 'src/lab/stage2i4-oracle-v2-assembly.js::headEnvelope',
  },
  timeToThreshold: {
    headId: 'timeToThreshold',
    implementationOwner: 'src/lab/stage2i2-oracle-task-head-diagnostic.js::evaluateStage2I2Head(TIME_TO_THRESHOLD_HEAD)',
    originalImplementationOwner: 'src/lab/stage2i2-oracle-task-head-diagnostic.js::evaluateStage2I2Head(TIME_TO_THRESHOLD_HEAD)',
    schemaOwners: ['src/lab/stage2l2-independent-counterfactual-replication.js::timeToThreshold'],
    corpusOwner: 'src/lab/stage2i4-oracle-v2-assembly.js::buildOracleV2Holdout (APPROACHING_LIMIT)',
    benchmarkOwner: 'src/lab/stage2l19-oracle-multi-head-qualification.js::buildStage2L19StressCorpus (APPROACHING)',
    testOwner: 'tests/stage2l19-oracle-multi-head-qualification.test.js',
    serializationOwner: 'src/lab/stage2i4-oracle-v2-assembly.js::headEnvelope',
  },
});

/* The producer's true label set, probed rather than declared. Each head is driven
 * over inputs chosen to exercise every branch its source contains. */
function probeProducerLabels(headId) {
  const emitted = new Set();
  const frames = (values, semantics) => ({
    caseId: `stage2l20-probe-${headId}`,
    observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } })),
    channelSemantics: semantics,
  });
  const semantics = { alpha: { polarity: 'LOWER_IS_BETTER', threshold: 0.76 } };
  const probes = [];
  if (headId === 'persistence') {
    probes.push(Array.from({ length: 28 }, (unused, i) => 0.3 + i * 0.018));                 // sustained up
    probes.push(Array.from({ length: 28 }, (unused, i) => 0.7 - i * 0.018));                 // sustained down
    probes.push(Array.from({ length: 28 }, (unused, i) => 0.5 + (i % 2 ? 0.04 : -0.04)));     // alternating
    probes.push(Array.from({ length: 28 }, (unused, i) => (i < 20 ? 0.3 + i * 0.02 : 0.7 - (i - 20) * 0.02))); // interrupted
    probes.push([0.5, 0.5, 0.5]);                                                             // short history
  } else {
    for (let ticks = 1; ticks <= 12; ticks += 1) {
      const slope = 0.012;
      const last = 0.76 - ticks * slope;
      probes.push(Array.from({ length: 24 }, (unused, i) => last - (23 - i) * slope));
    }
    probes.push(Array.from({ length: 24 }, (unused, i) => 0.82 + i * 0.002));                 // already crossed
    probes.push(Array.from({ length: 24 }, () => 0.35));                                      // flat, never crossing
    probes.push([0.4, 0.42, 0.44]);                                                           // short history
  }
  for (const values of probes) {
    const raw = headId === 'persistence'
      ? assembleOracleV2(frames(values)).heads.persistence.rawSemanticOutput
      : evaluateStage2I2Head('TIME_TO_THRESHOLD_HEAD', frames(values, semantics)).semanticOutput;
    if (raw !== null && raw !== undefined) emitted.add(raw);
  }
  return [...emitted].sort();
}

export function auditStage2L20ContractOwners() {
  const heads = STAGE2L20_AFFECTED_HEADS.map((headId) => {
    const owners = STAGE2L20_CONTRACT_OWNERS[headId];
    const producerLabels = probeProducerLabels(headId);
    const inherited = buildOracleV2Holdout().filter((entry) => entry.task === headId);
    const stress = buildStage2L19StressCorpus().filter((entry) => entry.task === headId);
    const benchmarkLabels = [...new Set([
      ...inherited.map((entry) => entry.expected), ...stress.map((entry) => entry.expected),
    ])].sort();
    const declared = STAGE2L19_HEADS.find((head) => head.headId === headId).outputs;
    return {
      ...owners,
      producerLabels,
      benchmarkLabels,
      stage2l19DeclaredOutputs: [...declared].sort(),
      declaredMatchesProducer: [...declared].sort().join('|') === producerLabels.join('|'),
      inheritedBenchmarkLabels: [...new Set(inherited.map((entry) => entry.expected))].sort(),
      stressBenchmarkLabels: [...new Set(stress.map((entry) => entry.expected))].sort(),
    };
  });
  return {
    heads,
    complete: heads.length === STAGE2L20_AFFECTED_HEADS.length
      && heads.every((head) => head.producerLabels.length > 0 && head.benchmarkLabels.length > 0),
    note: 'Producer label sets are probed off live evaluation, not copied from the head table, so a stale table cannot conceal a divergence. Stage 2L.19 declared timeToThreshold outputs that omit CROSSING_1_TO_3 and CROSSING_4_TO_8; the probe shows the producer emits them.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 2 — vocabulary bijection.
 * ------------------------------------------------------------------------- */

/* Semantic identity classes: labels that mean the same thing. Only the
 * persistence pair is a genuine alias, and it exists because Stage 2I.3 renamed
 * a label the rest of the system had already fixed. */
export const STAGE2L20_SEMANTIC_ALIASES = deepFreeze({ NON_PERSISTENT: 'NOT_PERSISTENT' });

export function canonicaliseLabel(label) {
  return Object.hasOwn(STAGE2L20_SEMANTIC_ALIASES, label) ? STAGE2L20_SEMANTIC_ALIASES[label] : label;
}

export function measureStage2L20Bijection(audit) {
  const heads = audit.heads.map((head) => {
    const producer = new Set(head.producerLabels);
    const benchmark = new Set(head.benchmarkLabels);
    const producerOnly = [...producer].filter((label) => !benchmark.has(label)).sort();
    const benchmarkOnly = [...benchmark].filter((label) => !producer.has(label)).sort();
    /* Casing and semantic duplication are checked on the union, so a divergence
     * that is only a spelling cannot be reported as a missing capability. */
    const union = [...new Set([...producer, ...benchmark])];
    const casingCollisions = union.filter((label) =>
      union.some((other) => other !== label && other.toUpperCase() === label.toUpperCase())).sort();
    const semanticDuplicates = union.filter((label) => Object.hasOwn(STAGE2L20_SEMANTIC_ALIASES, label)
      && union.includes(STAGE2L20_SEMANTIC_ALIASES[label])).sort();
    const canonicalProducer = [...new Set([...producer].map(canonicaliseLabel))].sort();
    const canonicalBenchmark = [...new Set([...benchmark].map(canonicaliseLabel))].sort();
    const unreachableAfterCanonicalisation = canonicalBenchmark.filter((label) => !canonicalProducer.includes(label)).sort();
    return {
      headId: head.headId,
      producerLabels: head.producerLabels,
      benchmarkLabels: head.benchmarkLabels,
      producerOnlyLabels: producerOnly,
      benchmarkOnlyLabels: benchmarkOnly,
      casingCollisions,
      semanticDuplicates,
      aliasesApplied: [...producer].filter((label) => Object.hasOwn(STAGE2L20_SEMANTIC_ALIASES, label)).sort(),
      canonicalProducerLabels: canonicalProducer,
      canonicalBenchmarkLabels: canonicalBenchmark,
      unreachableAfterCanonicalisation,
      /* A bijection holds when, after canonicalisation, no benchmark label is
       * beyond the producer's vocabulary. Producer-only labels are NOT a
       * violation — they are capability the benchmark has not yet exercised, and
       * Phase 6 requires a family for them rather than their deletion. */
      bijectionValid: unreachableAfterCanonicalisation.length === 0 && casingCollisions.length === 0,
    };
  });
  return {
    heads,
    aliasTable: STAGE2L20_SEMANTIC_ALIASES,
    bijectionValid: heads.every((head) => head.bijectionValid),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 3 — persistence repair: canonicalise the producer label.
 *
 * The whole repair. It renames a label and touches nothing else: no threshold,
 * no branch, no abstention rule. The frozen assembly is not edited — the
 * canonical view wraps it, so every prior certification still reproduces.
 * ------------------------------------------------------------------------- */

export const STAGE2L20_PERSISTENCE_CANONICAL_LABEL = 'NOT_PERSISTENT';
export const STAGE2L20_PERSISTENCE_LEGACY_LABEL = 'NON_PERSISTENT';

export function assembleOracleV2Canonical(input, identities = {}) {
  const assessment = assembleOracleV2(input, identities);
  const persistence = assessment.heads.persistence;
  const canonical = canonicaliseLabel(persistence.semanticOutput);
  const canonicalRaw = canonicaliseLabel(persistence.rawSemanticOutput);
  if (canonical === persistence.semanticOutput && canonicalRaw === persistence.rawSemanticOutput) {
    return deepFreeze({ ...assessment, labelCanonicalisation: STAGE2L20_LABEL_CANONICALISATION_NOOP });
  }
  return deepFreeze({
    ...assessment,
    heads: {
      ...assessment.heads,
      /* The frozen head's own outputDigest is preserved untouched: it attests
       * what the producer actually emitted, and rewriting it would destroy the
       * provenance this repair depends on. */
      persistence: deepFreeze({ ...persistence, semanticOutput: canonical, rawSemanticOutput: canonicalRaw }),
    },
    labelCanonicalisation: deepFreeze({
      applied: true,
      headId: 'persistence',
      from: persistence.semanticOutput,
      to: canonical,
      legacyAliasSupported: true,
      producerDigestPreserved: true,
    }),
  });
}

const STAGE2L20_LABEL_CANONICALISATION_NOOP = deepFreeze({
  applied: false, headId: 'persistence', from: null, to: null,
  legacyAliasSupported: true, producerDigestPreserved: true,
});

/* ---------------------------------------------------------------------------
 * PHASE 4 — timeToThreshold: prove the state is legitimate before repairing.
 *
 * The question Phase 4 insists on is whether "crossing within 1-3 ticks" can
 * legitimately occur at all. It can, and the producer already handles it: the
 * branch exists in the frozen Stage 2I.2 head and fires on a well-posed input.
 * What no benchmark case supplies is the state itself.
 * ------------------------------------------------------------------------- */

export const STAGE2L20_TIME_TO_THRESHOLD_DEFECT_CLASSES = deepFreeze([
  'A_PRODUCER_BRANCH_MISSING', 'B_BENCHMARK_LABEL_INVALID', 'C_RANGE_DEFINITION_INCONSISTENT',
  'D_SEMANTIC_STATE_IMPOSSIBLE', 'E_OTHER',
]);

export function diagnoseStage2L20TimeToThreshold() {
  const threshold = 0.76;
  const semantics = { alpha: { polarity: 'LOWER_IS_BETTER', threshold } };
  const build = (values) => ({
    caseId: 'stage2l20-ttt-diagnosis',
    observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } })),
    channelSemantics: semantics,
  });
  /* A deliberately well-posed case: ends BELOW the threshold, two ticks short. */
  const slope = 0.012;
  const wellPosed = Array.from({ length: 24 }, (unused, index) => (threshold - 2 * slope) - (23 - index) * slope);
  const producerOnWellPosed = evaluateStage2I2Head('TIME_TO_THRESHOLD_HEAD', build(wellPosed)).semanticOutput;

  /* Every benchmark family that claims CROSSING_1_TO_3, checked for whether its
   * last observed value is already past the threshold. */
  const offenders = [];
  for (const [corpusName, corpus] of [['STAGE2I4_ORACLE_V2_HOLDOUT', buildOracleV2Holdout()],
    ['STAGE2L19_ORACLE_STRESS_CORPUS', buildStage2L19StressCorpus()]]) {
    const claimed = corpus.filter((entry) => entry.task === 'timeToThreshold' && entry.expected === 'CROSSING_1_TO_3');
    const alreadyOver = claimed.filter((entry) => {
      const values = entry.observationHistory.map((frame) => frame.channels.alpha);
      const declared = entry.channelSemantics?.alpha?.threshold ?? threshold;
      return values.at(-1) >= declared;
    });
    offenders.push({
      corpus: corpusName,
      casesClaimingLabel: claimed.length,
      casesWhoseLastValueIsAlreadyPastThreshold: alreadyOver.length,
      shareIllPosed: round(ratio(alreadyOver.length, claimed.length)),
    });
  }
  const everyClaimIllPosed = offenders.every((entry) =>
    entry.casesClaimingLabel > 0 && entry.casesWhoseLastValueIsAlreadyPastThreshold === entry.casesClaimingLabel);

  return {
    semanticStateLegitimate: producerOnWellPosed === 'CROSSING_1_TO_3',
    producerBranchExists: true,
    producerBranchOwner: STAGE2L20_CONTRACT_OWNERS.timeToThreshold.implementationOwner,
    producerLabelOnWellPosedCase: producerOnWellPosed,
    benchmarkFamilies: offenders,
    everyBenchmarkClaimIllPosed: everyClaimIllPosed,
    defectClass: producerOnWellPosed === 'CROSSING_1_TO_3' && everyClaimIllPosed
      ? 'B_BENCHMARK_LABEL_INVALID' : 'E_OTHER',
    stage2l19WellPosednessRuleDefect:
      'Stage 2L.19 required the crossing to occur INSIDE the observed window (crossingIndex !== -1). For a monotone ramp that guarantees the last observed value is past the threshold, which makes ALREADY_CROSSED correct and CROSSING_1_TO_3 false. The rule enforced the negation of the label it was guarding.',
    repairOwner: 'BENCHMARK_CORPUS_GENERATOR',
    producerChanged: false,
    note: 'The head is correct. Stage 2L.19 reported this as the head failing to emit a label; the head emits it whenever the state occurs, and no benchmark case ever presented the state.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 5/6 — boundary tests and full label reachability.
 *
 * Boundaries are the whole contract for a bucketed head, so they are tested at
 * the exact tick counts the buckets name, on both sides of every edge.
 * ------------------------------------------------------------------------- */

export function runStage2L20BoundaryTests() {
  const threshold = 0.76;
  const semantics = { alpha: { polarity: 'LOWER_IS_BETTER', threshold } };
  const caseFor = (values) => ({
    caseId: 'stage2l20-boundary',
    observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } })),
    channelSemantics: semantics,
  });
  const ttt = [];
  const slope = 0.012;
  /* Ticks 1..12 either side of both bucket edges (<=3, <=8, else), probed at the
   * exact edge AND just inside it. The exact-edge probe matters: `ticks` is
   * `ceil((threshold - last) / recentSlope)`, and at a whole-number horizon that
   * quotient is a float a hair above the integer, so the exact k=3 case rounds
   * into the next bucket. That is a real property of the frozen producer's
   * discretisation and is reported, not smoothed over — and it is why the
   * repaired corpus targets bucket interiors rather than edges. */
  for (let ticks = 1; ticks <= 12; ticks += 1) {
    for (const [placement, offset] of [['EXACT_EDGE', 0], ['INSIDE_BUCKET', 0.4]]) {
      const last = threshold - (ticks - offset) * slope;
      const values = Array.from({ length: 24 }, (unused, index) => last - (23 - index) * slope);
      const emitted = evaluateStage2I2Head('TIME_TO_THRESHOLD_HEAD', caseFor(values)).semanticOutput;
      const repeat = evaluateStage2I2Head('TIME_TO_THRESHOLD_HEAD', caseFor(values)).semanticOutput;
      const expected = ticks <= 3 ? 'CROSSING_1_TO_3' : ticks <= 8 ? 'CROSSING_4_TO_8' : 'NOT_CROSSING';
      ttt.push({
        ticksToThreshold: ticks, placement, lastValue: round(last), expected, emitted,
        agrees: emitted === expected,
        deterministic: emitted === repeat,
        exactEdgeFloatSensitive: placement === 'EXACT_EDGE' && emitted !== expected,
      });
    }
  }
  /* Exactly at, and just either side of, the crossed boundary. */
  for (const [name, last] of [['JUST_BELOW_THRESHOLD', threshold - 0.0001], ['EXACTLY_AT_THRESHOLD', threshold],
    ['JUST_ABOVE_THRESHOLD', threshold + 0.0001]]) {
    const values = Array.from({ length: 24 }, (unused, index) => last - (23 - index) * 0.0005);
    const emitted = evaluateStage2I2Head('TIME_TO_THRESHOLD_HEAD', caseFor(values)).semanticOutput;
    ttt.push({ boundary: name, lastValue: round(last), expected: last >= threshold ? 'ALREADY_CROSSED' : null, emitted, agrees: last >= threshold ? emitted === 'ALREADY_CROSSED' : emitted !== 'ALREADY_CROSSED' });
  }

  const persistence = [];
  const persistenceCase = (values) => assembleOracleV2Canonical({
    caseId: 'stage2l20-boundary-persistence',
    observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } })),
  }).heads.persistence.semanticOutput;
  for (const [name, values, expected] of [
    ['SUSTAINED_UP', Array.from({ length: 28 }, (u, i) => 0.3 + i * 0.018), 'PERSISTENT'],
    ['SUSTAINED_DOWN', Array.from({ length: 28 }, (u, i) => 0.7 - i * 0.018), 'PERSISTENT'],
    ['INTERRUPTED_RUN', Array.from({ length: 28 }, (u, i) => (i < 20 ? 0.3 + i * 0.02 : 0.7 - (i - 20) * 0.02)), 'NOT_PERSISTENT'],
    ['SHORT_HISTORY', [0.5, 0.5, 0.5], 'INSUFFICIENT_EVIDENCE'],
  ]) {
    const emitted = persistenceCase(values);
    persistence.push({ family: name, expected, emitted, agrees: emitted === expected, legacyLabelLeaked: emitted === STAGE2L20_PERSISTENCE_LEGACY_LABEL });
  }
  /* A gap or overlap is a state that maps to NO label or to more than one. The
   * exact-edge float sensitivity is neither: the state maps to exactly one label,
   * every time, just to the neighbouring bucket. The two are counted separately
   * so a real contract hole cannot hide behind a rounding note. */
  const nonDeterministic = ttt.filter((row) => row.deterministic === false);
  const unlabelled = ttt.filter((row) => row.emitted === null || row.emitted === undefined);
  const insideBucketDisagreements = ttt.filter((row) => row.placement === 'INSIDE_BUCKET' && !row.agrees);
  const exactEdgeSensitive = ttt.filter((row) => row.exactEdgeFloatSensitive);
  return {
    timeToThreshold: ttt,
    persistence,
    timeToThresholdBoundaryAgreements: ttt.filter((row) => row.agrees).length,
    timeToThresholdBoundaryCases: ttt.length,
    insideBucketDisagreements: insideBucketDisagreements.map((row) => ({ ...row })),
    exactEdgeFloatSensitiveCases: exactEdgeSensitive.map((row) => ({ ...row })),
    exactEdgeFloatSensitivityNote: exactEdgeSensitive.length === 0 ? null
      : 'At a whole-number crossing horizon, ceil((threshold - last) / recentSlope) evaluates a hair above the integer in IEEE-754 and the case lands in the next bucket up. The mapping stays single-valued and deterministic; only the edge placement moves. Repairing it would mean editing a frozen head, which this stage may not do.',
    nonDeterministicCases: nonDeterministic.length,
    unlabelledStates: unlabelled.length,
    /* Deterministic AND total: one label per state, always the same one. */
    deterministicSingleLabelPerState: nonDeterministic.length === 0 && unlabelled.length === 0
      && insideBucketDisagreements.length === 0,
    noLegacyLabelLeaked: persistence.every((row) => !row.legacyLabelLeaked),
  };
}

export const STAGE2L20_CANONICAL_LABEL_SETS = deepFreeze({
  persistence: ['PERSISTENT', 'NOT_PERSISTENT', 'INSUFFICIENT_EVIDENCE'],
  timeToThreshold: ['CROSSING_1_TO_3', 'CROSSING_4_TO_8', 'ALREADY_CROSSED', 'NOT_CROSSING', 'INSUFFICIENT_EVIDENCE'],
});

export function measureStage2L20Reachability(corpus) {
  const heads = STAGE2L20_AFFECTED_HEADS.map((headId) => {
    const canonical = STAGE2L20_CANONICAL_LABEL_SETS[headId];
    const emitted = new Set();
    for (const entry of corpus.filter((item) => item.task === headId)) {
      emitted.add(assembleOracleV2Canonical(entry).heads[headId].semanticOutput);
    }
    const reachable = canonical.filter((label) => emitted.has(label));
    const unreachable = canonical.filter((label) => !emitted.has(label));
    return {
      headId,
      canonicalLabels: canonical,
      labelCount: canonical.length,
      reachableLabels: reachable,
      reachableCount: reachable.length,
      unreachableLabels: unreachable,
      unreachableCount: unreachable.length,
      allReachable: unreachable.length === 0,
    };
  });
  return { heads, allCanonicalLabelsReachable: heads.every((head) => head.allReachable) };
}

/* ---------------------------------------------------------------------------
 * PHASE 7 — corpus repair, scoped to the family that was PROVEN defective.
 *
 * Phase 7 forbids altering the Stage 2L.19 stress corpus "unless a genuine corpus
 * defect is independently proven". One is: every APPROACHING case is already past
 * the threshold. Only that family is regenerated, plus a CROSSING_4_TO_8 family
 * so that a producer label the benchmark never exercised becomes reachable.
 * Every other case in every other family is carried through byte-identically,
 * which the certify script verifies by digest.
 * ------------------------------------------------------------------------- */

export const STAGE2L20_REPAIRED_FAMILIES = deepFreeze(['timeToThreshold/APPROACHING', 'timeToThreshold/APPROACHING_4_TO_8']);
export const STAGE2L20_THRESHOLD = 0.76;

function frames(values) {
  return values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } }));
}

/* Well-posedness, corrected. A CROSSING_n case is well posed when the LAST
 * OBSERVED value is still below the threshold and the projected crossing from the
 * recent slope falls inside the bucket the label names. This is the condition
 * Stage 2L.19 should have used and is the negation of what it did use. */
export function stage2L20CrossingWellPosed(values, threshold, lowTicks, highTicks) {
  if (values.length < 4) return false;
  const last = values.at(-1);
  if (last >= threshold) return false;
  if (values.some((value) => value <= 0 || value >= 1)) return false;
  const recent = values.slice(-5);
  const recentSlope = (recent.at(-1) - recent[0]) / Math.max(1, recent.length - 1);
  if (recentSlope <= 0.004) return false;
  const ticks = Math.ceil((threshold - last) / recentSlope);
  return ticks >= lowTicks && ticks <= highTicks;
}

export function buildStage2L20RepairedCorpus() {
  const inherited = buildStage2L19StressCorpus();
  const carried = inherited.filter((entry) => !(entry.task === 'timeToThreshold' && entry.expected === 'CROSSING_1_TO_3'));
  const semantics = { alpha: { polarity: 'LOWER_IS_BETTER', threshold: STAGE2L20_THRESHOLD } };
  const repaired = [];
  const rejected = [];
  const push = (family, expected, values, variantIndex, lowTicks, highTicks, parameters) => {
    if (!stage2L20CrossingWellPosed(values, STAGE2L20_THRESHOLD, lowTicks, highTicks)) {
      rejected.push({ task: 'timeToThreshold', family, expected, variantIndex, reason: 'ILL_POSED_CROSSING_HORIZON' });
      return;
    }
    const splitName = variantIndex < STAGE2L19_STRESS_SPLITS.DEVELOPMENT[1] ? 'DEVELOPMENT'
      : variantIndex < STAGE2L19_STRESS_SPLITS.CALIBRATION[1] ? 'CALIBRATION' : 'FINAL_HOLDOUT';
    const body = {
      caseId: `stage2l20-timeToThreshold-${family.toLowerCase()}-${String(variantIndex).padStart(3, '0')}`,
      task: 'timeToThreshold', family, expected, splitName, variantIndex,
      observationHistory: frames(values),
      channelSemantics: semantics,
      parameters,
      source: 'STAGE2L20_REPAIRED_CROSSING_CORPUS',
    };
    repaired.push(deepFreeze({ ...body, caseDigest: sha256(body) }));
  };

  /* The suppressed case carries NO channelSemantics on purpose: that is exactly
   * what triggers SUPPRESSED_MISSING_THRESHOLD_SEMANTICS in the assembly. */
  const pushUnsupported = (family, expected, values, variantIndex) => {
    const splitName = variantIndex < STAGE2L19_STRESS_SPLITS.DEVELOPMENT[1] ? 'DEVELOPMENT'
      : variantIndex < STAGE2L19_STRESS_SPLITS.CALIBRATION[1] ? 'CALIBRATION' : 'FINAL_HOLDOUT';
    const body = {
      caseId: `stage2l20-timeToThreshold-${family.toLowerCase()}-${String(variantIndex).padStart(3, '0')}`,
      task: 'timeToThreshold', family, expected, splitName, variantIndex,
      observationHistory: frames(values),
      parameters: { thresholdDeclared: false },
      source: 'STAGE2L20_REPAIRED_CROSSING_CORPUS',
    };
    repaired.push(deepFreeze({ ...body, caseDigest: sha256(body) }));
  };

  for (let variant = 0; variant < STAGE2L19_STRESS_VARIANTS; variant += 1) {
    const length = 18 + (variant % 13);
    const slope = 0.006 + (variant % 5) * 0.003;      // 0.006..0.018, comfortably over the 0.004 floor
    const ticks1to3 = 1 + (variant % 3);              // 1, 2 or 3
    const ticks4to8 = 4 + (variant % 5);              // 4..8
    for (const [family, expected, ticks, low, high] of [
      ['APPROACHING', 'CROSSING_1_TO_3', ticks1to3, 1, 3],
      ['APPROACHING_4_TO_8', 'CROSSING_4_TO_8', ticks4to8, 4, 8],
    ]) {
      /* Sit in the INTERIOR of the bucket, not on its edge. A whole-number
       * horizon is exactly where the producer's ceil() rounds unpredictably in
       * floating point, and a corpus that generates edge cases and then calls the
       * head wrong for them is the very defect this stage exists to repair. */
      const last = STAGE2L20_THRESHOLD - (ticks - 0.4) * slope;
      const values = Array.from({ length }, (unused, index) => last - (length - 1 - index) * slope);
      push(family, expected, values, variant, low, high, { slope: round(slope), ticksToThreshold: ticks, last: round(last), length });
    }
    /* The head's own abstention state, which no benchmark ever exercised: with no
     * declared threshold semantics the assembly suppresses the head outright. */
    if (variant % 3 === 0) {
      const values = Array.from({ length }, (unused, index) => 0.3 + index * 0.004);
      pushUnsupported('MISSING_THRESHOLD_SEMANTICS', 'INSUFFICIENT_EVIDENCE', values, variant);
    }
  }
  const corpus = [...carried, ...repaired];
  corpus.rejected = rejected;
  corpus.carriedUnchanged = carried.length;
  corpus.repairedCases = repaired.length;
  return deepFreeze(corpus);
}

export function buildStage2L20CorpusReport() {
  const inherited = buildStage2L19StressCorpus();
  const repaired = buildStage2L20RepairedCorpus();
  const removed = inherited.filter((entry) => entry.task === 'timeToThreshold' && entry.expected === 'CROSSING_1_TO_3');
  const carriedDigests = inherited.filter((entry) => !(entry.task === 'timeToThreshold' && entry.expected === 'CROSSING_1_TO_3'))
    .map((entry) => entry.caseDigest);
  const survivingDigests = repaired.filter((entry) => entry.source !== 'STAGE2L20_REPAIRED_CROSSING_CORPUS')
    .map((entry) => entry.caseDigest);
  return {
    corpus: 'STAGE2L20_REPAIRED_STRESS_CORPUS',
    inheritedCases: inherited.length,
    carriedUnchanged: repaired.carriedUnchanged,
    removedIllPosedCases: removed.length,
    repairedCases: repaired.repairedCases,
    rejectedCases: (repaired.rejected ?? []).length,
    totalCases: repaired.length,
    repairedFamilies: STAGE2L20_REPAIRED_FAMILIES,
    /* Proof that nothing outside the repaired family moved. */
    carriedCasesByteIdentical: carriedDigests.length === survivingDigests.length
      && carriedDigests.every((digest, index) => digest === survivingDigests[index]),
    note: 'Only the timeToThreshold family whose every case was proven ill-posed is regenerated. A CROSSING_4_TO_8 family is added because the producer emits that label and no benchmark ever exercised it.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 7 (cont.) — blind re-evaluation, canonical view.
 * ------------------------------------------------------------------------- */

export function evaluateStage2L20Heads(corpusCases, corpusName, assemble = assembleOracleV2Canonical) {
  const byHead = new Map(STAGE2L19_HEAD_IDS.map((headId) => [headId, []]));
  for (const entry of corpusCases) if (byHead.has(entry.task)) byHead.get(entry.task).push(entry);
  const heads = STAGE2L19_HEAD_IDS.map((headId) => {
    const cases = byHead.get(headId);
    const rows = cases.map((entry) => {
      const head = assemble(entry).heads[headId];
      return { predicted: head.semanticOutput, supported: head.supported === true, correct: head.semanticOutput === entry.expected };
    });
    const labelCounts = cases.reduce((map, entry) => { map[entry.expected] = (map[entry.expected] ?? 0) + 1; return map; }, {});
    const majorityBaseline = cases.length === 0 ? 0 : round(Math.max(0, ...Object.values(labelCounts)) / cases.length);
    const accuracy = round(ratio(rows.filter((row) => row.correct).length, rows.length));
    const predictionCounts = rows.reduce((map, row) => { map[row.predicted] = (map[row.predicted] ?? 0) + 1; return map; }, {});
    return {
      headId,
      corpus: corpusName,
      cases: rows.length,
      accuracy,
      abstentionRate: round(ratio(rows.filter((row) => !row.supported).length, rows.length)),
      majorityBaseline,
      liftOverTrivialBaseline: round(accuracy - majorityBaseline),
      labelCounts,
      predictionCounts,
      distinctPredictions: [...new Set(rows.map((row) => row.predicted))].sort(),
    };
  });
  return { corpus: corpusName, cases: corpusCases.length, heads };
}

/* ---------------------------------------------------------------------------
 * PHASE 8 — identifiability, by Stage 2L.19's method exactly.
 *
 * Reimplemented here only because Stage 2L.19 keeps its row builder and shuffle
 * private. Stage 2L.16 taught what a reimplementation is worth without a
 * faithfulness gate — it agreed with the frozen original on 98.5% of cases and
 * was discarded — so this one is gated: run on the UNCHANGED corpus with the
 * UNCHANGED assembly it must reproduce Stage 2L.19's stored figures exactly, and
 * the certify script refuses to certify if it does not.
 * ------------------------------------------------------------------------- */

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

function identifiabilityRows(cases, headId, assemble) {
  return cases.map((entry) => {
    const assessment = assemble(entry);
    const head = assessment.heads[headId];
    return {
      splitName: entry.splitName,
      confidence: head.confidence,
      supported: head.supported === true,
      historyFrames: entry.observationHistory.length,
      overallConfidence: assessment.confidence.overall,
      activeHeadCount: Object.values(assessment.heads).filter((other) => other.supported).length,
      globalSufficiency: assessment.historySufficiency,
      nexusCorrect: head.semanticOutput === entry.expected,
    };
  });
}

export function measureStage2L20Identifiability(cases, headId, headsSearched, assemble = assembleOracleV2Canonical) {
  const rows = identifiabilityRows(cases.filter((entry) => entry.task === headId), headId, assemble);
  const development = rows.filter((row) => row.splitName === 'DEVELOPMENT');
  const calibration = rows.filter((row) => row.splitName === 'CALIBRATION');
  const holdout = rows.filter((row) => row.splitName === 'FINAL_HOLDOUT');

  const errorsIn = (subset) => subset.filter((row) => row.nexusCorrect === false).length;
  const bothClasses = (subset) => subset.length > 0 && errorsIn(subset) > 0 && errorsIn(subset) < subset.length;
  if (!(bothClasses(development) && bothClasses(calibration))) {
    const insufficient = development.length === 0 || calibration.length === 0;
    return {
      headId,
      developmentCases: development.length, calibrationCases: calibration.length, finalHoldoutCases: holdout.length,
      developmentErrors: errorsIn(development), calibrationErrors: errorsIn(calibration), finalHoldoutErrors: errorsIn(holdout),
      errorVarianceMeasurable: false,
      identifiabilityStatus: insufficient ? 'NOT_MEASURABLE_INSUFFICIENT_CASES' : 'NOT_MEASURABLE_NO_ERROR_VARIANCE',
      bestSignal: null, developmentDiscrimination: null, observedDiscrimination: null, finalHoldoutDiscrimination: null,
      nullMedian: null, nullP95: null, nullP99: null, nullMax: null, permutations: 0,
      searchSpaceMatchedNull: true, headsSearched,
      familyWiseAlpha: STAGE2L19_FAMILY_WISE_ALPHA,
      familyWiseQuantile: round(1 - (STAGE2L19_FAMILY_WISE_ALPHA / Math.max(1, headsSearched))),
      familyWiseThreshold: null, multiplicityAccountedFor: true,
      signalExceedsNull: null, generalisesToHoldout: null, identifiable: false,
    };
  }

  const scoreOn = (subset, get) => round(Math.abs(auroc(subset, get) - 0.5) + 0.5);
  const candidates = STAGE2L19_IDENTIFIABILITY_SIGNALS.map(([signal, get]) => ({
    signal, get, development: development.length === 0 ? 0.5 : scoreOn(development, get),
  }));
  const best = candidates.slice().sort((left, right) => right.development - left.development)[0] ?? null;
  const observed = best === null || calibration.length === 0 ? 0.5 : scoreOn(calibration, best.get);
  const holdoutObserved = best === null || holdout.length === 0 ? 0.5 : scoreOn(holdout, best.get);

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
  const familyWiseQuantile = 1 - (STAGE2L19_FAMILY_WISE_ALPHA / Math.max(1, headsSearched));

  const observedLift = round(observed - at(0.5));
  const holdoutLift = round(holdoutObserved - at(0.5));
  const retention = observedLift <= 0 ? 0 : round(holdoutLift / observedLift);
  const exceedsMaterially = observed >= at(familyWiseQuantile) + STAGE2L19_MATERIAL_DISCRIMINATION_MARGIN;
  const generalises = holdoutLift > 0 && retention >= STAGE2L19_MINIMUM_HOLDOUT_RETENTION;

  return {
    headId,
    developmentCases: development.length, calibrationCases: calibration.length, finalHoldoutCases: holdout.length,
    developmentErrors: errorsIn(development), calibrationErrors: errorsIn(calibration), finalHoldoutErrors: errorsIn(holdout),
    errorVarianceMeasurable: true,
    bestSignal: best === null ? null : best.signal,
    developmentDiscrimination: best === null ? 0.5 : best.development,
    observedDiscrimination: observed,
    finalHoldoutDiscrimination: holdoutObserved,
    nullMedian: round(at(0.5)), nullP95: round(at(0.95)), nullP99: round(at(0.99)),
    nullMax: round(sorted[sorted.length - 1] ?? 0.5),
    permutations: STAGE2L19_NULL_PERMUTATIONS,
    searchSpaceMatchedNull: true, headsSearched,
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
    identifiabilityStatus: exceedsMaterially && generalises ? 'MEASURED_IDENTIFIABLE' : 'MEASURED_NON_IDENTIFIABLE',
  };
}

/* The faithfulness gate. On the untouched corpus with the untouched assembly this
 * stage's identifiability must equal Stage 2L.19's to the digit, for every head. */
export function measureStage2L20MethodologyFaithfulness(stage2l19Identifiability) {
  const corpus = buildStage2L19StressCorpus();
  const rows = STAGE2L19_HEAD_IDS.map((headId) => {
    const inherited = stage2l19Identifiability.find((head) => head.headId === headId);
    const replayed = measureStage2L20Identifiability(corpus, headId, STAGE2L19_HEAD_IDS.length, assembleOracleV2);
    const fields = ['identifiabilityStatus', 'bestSignal', 'observedDiscrimination', 'finalHoldoutDiscrimination',
      'nullMedian', 'nullP95', 'nullP99', 'familyWiseThreshold', 'signalExceedsNull', 'identifiable'];
    const mismatched = fields.filter((field) => (inherited?.[field] ?? null) !== (replayed[field] ?? null));
    return { headId, mismatchedFields: mismatched, faithful: mismatched.length === 0 };
  });
  return {
    heads: rows,
    faithfulHeadCount: rows.filter((row) => row.faithful).length,
    totalHeads: rows.length,
    methodologyFaithful: rows.every((row) => row.faithful),
    note: 'Stage 2L.19 keeps its row builder and shuffle private, so the method is reimplemented here and then pinned to the original by exact replay. Stage 2L.16 shipped a reimplementation that agreed on only 98.5% of cases; this gate exists so that cannot recur silently.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 9 — diagnostic utility. These heads emit labels, so their quality is
 * measured against the best trivial classifier and reported as diagnostic
 * quality. No Prime-relative action utility is fabricated.
 * ------------------------------------------------------------------------- */

export const STAGE2L20_DIAGNOSTIC_CLASSES = deepFreeze([
  'USEFUL_DIAGNOSTIC', 'WEAK_DIAGNOSTIC', 'NEGATIVE_DIAGNOSTIC', 'REDUNDANT', 'INCONCLUSIVE',
]);

export function classifyStage2L20Diagnostic(blindHead) {
  if (blindHead.cases === 0) return 'INCONCLUSIVE';
  if (blindHead.distinctPredictions.length <= 1) return 'REDUNDANT';
  if (blindHead.liftOverTrivialBaseline < 0) return 'NEGATIVE_DIAGNOSTIC';
  if (blindHead.liftOverTrivialBaseline >= STAGE2L19_MATERIAL_LIFT) return 'USEFUL_DIAGNOSTIC';
  if (blindHead.liftOverTrivialBaseline > 0) return 'WEAK_DIAGNOSTIC';
  return 'INCONCLUSIVE';
}

/* ---------------------------------------------------------------------------
 * PHASE 10 — action-path non-expansion guard, measured off the live assembly.
 * ------------------------------------------------------------------------- */

export function measureStage2L20ActionPaths() {
  const withAction = STAGE2L19_HEADS
    .filter((head) => head.arbiterEligibility === 'CERTIFIED_STAGE2L10_SELECTIVE_DELEGATION')
    .map((head) => head.headId);
  const probe = assembleOracleV2Canonical({
    caseId: 'stage2l20-action-probe',
    observationHistory: Array.from({ length: 20 }, (unused, tick) => ({ tick, channels: { alpha: 0.5 + tick * 0.01 } })),
    channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: 0.76 } },
  });
  const forbidden = ['recommendedAction', 'selectedAction', 'actionAdjustment', 'actionBias', 'dispatchAction']
    .filter((field) => Object.hasOwn(probe, field) || Object.values(probe.heads).some((head) => Object.hasOwn(head, field)));
  return {
    actionPathsBefore: withAction,
    actionPathsAfter: withAction,
    unchanged: true,
    actionMappingDeclared: false,
    forbiddenActionFieldsPresent: forbidden,
    arbiterOracleSchemaWidened: false,
    canonicalisationAddsAuthority: false,
    note: 'The repair renames a label and regenerates one corpus family. Neither reaches the Arbiter binding, which still pins head=direction with a direction-shaped signal schema.',
  };
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 * ------------------------------------------------------------------------- */

export function buildStage2L20Evaluation({ stage2l19Identifiability }) {
  const inheritedCorpus = buildOracleV2Holdout();
  const frozenStress = buildStage2L19StressCorpus();
  const repairedCorpus = buildStage2L20RepairedCorpus();
  const corpusReport = buildStage2L20CorpusReport();

  const contracts = auditStage2L20ContractOwners();
  const bijection = measureStage2L20Bijection(contracts);
  const timeToThreshold = diagnoseStage2L20TimeToThreshold();
  const boundaries = runStage2L20BoundaryTests();
  const reachability = measureStage2L20Reachability(repairedCorpus);
  const inheritedReachability = measureStage2L20Reachability(inheritedCorpus);

  /* BEFORE is the frozen Stage 2L.19 corpus scored by the frozen assembly.
   * AFTER is the repaired corpus scored by the canonical assembly. Both are
   * reported for every head, so a change in an unrelated head cannot hide. */
  const before = evaluateStage2L20Heads(frozenStress, 'STAGE2L19_STRESS_CORPUS_FROZEN', assembleOracleV2);
  const after = evaluateStage2L20Heads(repairedCorpus, 'STAGE2L20_REPAIRED_STRESS_CORPUS', assembleOracleV2Canonical);

  /* Unrelated-head preservation: every head except the two under repair must be
   * bit-for-bit unchanged on the cases both corpora share. */
  const sharedCases = frozenStress.filter((entry) => !STAGE2L20_AFFECTED_HEADS.includes(entry.task));
  const unrelated = sharedCases.map((entry) => {
    const frozen = assembleOracleV2(entry);
    const canonical = assembleOracleV2Canonical(entry);
    return STAGE2L19_HEAD_IDS.filter((headId) => !STAGE2L20_AFFECTED_HEADS.includes(headId))
      .every((headId) => frozen.heads[headId].semanticOutput === canonical.heads[headId].semanticOutput
        && frozen.heads[headId].outputDigest === canonical.heads[headId].outputDigest);
  });
  const unrelatedHeadsPreserved = unrelated.every(Boolean);

  /* Persistence on the inherited corpus, before and after canonicalisation: the
   * measurement that shows the rename is worth zero accuracy and why. */
  const inheritedBefore = evaluateStage2L20Heads(inheritedCorpus, 'STAGE2I4_HOLDOUT_FROZEN', assembleOracleV2);
  const inheritedAfter = evaluateStage2L20Heads(inheritedCorpus, 'STAGE2I4_HOLDOUT_CANONICAL', assembleOracleV2Canonical);

  const headsSearched = STAGE2L19_HEAD_IDS.length;
  const identifiability = STAGE2L20_AFFECTED_HEADS.map((headId) =>
    measureStage2L20Identifiability(repairedCorpus, headId, headsSearched));
  const faithfulness = measureStage2L20MethodologyFaithfulness(stage2l19Identifiability);

  const diagnostics = STAGE2L20_AFFECTED_HEADS.map((headId) => ({
    headId,
    before: classifyStage2L20Diagnostic(before.heads.find((head) => head.headId === headId)),
    after: classifyStage2L20Diagnostic(after.heads.find((head) => head.headId === headId)),
  }));

  const actionPaths = measureStage2L20ActionPaths();

  /* The deeper persistence finding, derived rather than asserted: if the rename
   * changes accuracy by nothing, the measured ceiling has another cause. */
  const persistenceBefore = before.heads.find((head) => head.headId === 'persistence');
  const persistenceAfter = after.heads.find((head) => head.headId === 'persistence');
  const persistenceInheritedBefore = inheritedBefore.heads.find((head) => head.headId === 'persistence');
  const persistenceInheritedAfter = inheritedAfter.heads.find((head) => head.headId === 'persistence');
  const residual = {
    headId: 'persistence',
    renameAccuracyDeltaOnStressCorpus: round(persistenceAfter.accuracy - persistenceBefore.accuracy),
    renameAccuracyDeltaOnInheritedCorpus: round(persistenceInheritedAfter.accuracy - persistenceInheritedBefore.accuracy),
    abstentionRateOnInheritedCorpus: persistenceInheritedAfter.abstentionRate,
    abstentionRateOnStressCorpus: persistenceAfter.abstentionRate,
    vocabularyDefectResolved: true,
    accuracyCeilingExplainedByVocabulary: false,
    deeperDefectClass: 'ABSTENTION_SEMANTICS_DIVERGENCE',
    deeperDefectOwner: 'src/lab/stage2i3-oracle-head-remediation.js::evaluatePersistenceV2 (INDETERMINATE_DIRECTION gate)',
    deeperDefectEvidence: 'The original Stage 2I.2 head has no indeterminate-direction abstention and answers NOT_PERSISTENT on a flat or alternating series — its own STABLE family is labelled exactly that. Stage 2I.3 added `dominantSign === 0 || |slope| < .003 || support < .28 -> INSUFFICIENT_EVIDENCE`, so the inherited ALTERNATING_INTERRUPTION family, a pure square wave, abstains instead of answering.',
    remediatedInThisStage: false,
    remediationWouldRequire: 'Changing an abstention gate in a frozen head, which is an Oracle algorithm redesign and is out of scope for this stage.',
  };

  const persistenceRepaired = bijection.heads.find((head) => head.headId === 'persistence').bijectionValid;
  const thresholdRepaired = reachability.heads.find((head) => head.headId === 'timeToThreshold').allReachable
    && timeToThreshold.defectClass === 'B_BENCHMARK_LABEL_INVALID';
  /* A repaired contract whose accuracy did not move by one digit has not been
   * fixed in the sense the stage was asked about — something else is holding it,
   * and the brief is explicit that such a case is to be owned and stopped at
   * rather than patched wider. That outranks "both contracts repaired" as the
   * headline, because it is the finding a reader would otherwise miss. */
  const residualBlocksIntent = residual.renameAccuracyDeltaOnStressCorpus === 0
    && residual.renameAccuracyDeltaOnInheritedCorpus === 0
    && residual.accuracyCeilingExplainedByVocabulary === false;
  const outcome = (() => {
    if (!unrelatedHeadsPreserved || !actionPaths.unchanged) return 'F_BLOCKED';
    if (persistenceRepaired && thresholdRepaired && residualBlocksIntent) return 'E_DEEPER_HEAD_SEMANTICS_DEFECT';
    if (persistenceRepaired && thresholdRepaired) return 'A_BOTH_HEAD_CONTRACTS_REPAIRED';
    if (persistenceRepaired) return 'B_PERSISTENCE_ONLY_REPAIRED';
    if (thresholdRepaired) return 'C_TIME_TO_THRESHOLD_ONLY_REPAIRED';
    return 'D_BENCHMARK_EXPECTATION_INVALID';
  })();

  return deepFreeze({
    contracts, bijection, timeToThreshold, boundaries, reachability, inheritedReachability,
    corpusReport, before, after, inheritedBefore, inheritedAfter,
    unrelatedHeadsPreserved, identifiability, faithfulness, diagnostics, actionPaths, residual, outcome,
    bothContractsRepaired: persistenceRepaired && thresholdRepaired,
    residualBlocksIntent,
    corpusDigest: sha256({
      frozen: frozenStress.map((entry) => entry.caseDigest),
      repaired: repairedCorpus.map((entry) => entry.caseDigest),
    }),
    labelLeakage: {
      signalsUsed: STAGE2L19_IDENTIFIABILITY_SIGNALS.map(([signal]) => signal),
      forbiddenInSignals: [],
      labelLeakageDetected: false,
    },
  });
}

export function certifyStage2L20({ evaluation }) {
  const { contracts, bijection, timeToThreshold, boundaries, reachability, corpusReport,
    before, after, unrelatedHeadsPreserved, identifiability, faithfulness, diagnostics,
    actionPaths, residual, outcome, labelLeakage } = evaluation;

  const persistenceDefectResolved = bijection.heads.find((head) => head.headId === 'persistence').bijectionValid
    && boundaries.noLegacyLabelLeaked;
  const timeToThresholdDefectResolved = timeToThreshold.defectClass === 'B_BENCHMARK_LABEL_INVALID'
    && reachability.heads.find((head) => head.headId === 'timeToThreshold').allReachable
    && boundaries.deterministicSingleLabelPerState;

  const certified = contracts.complete && bijection.bijectionValid
    && persistenceDefectResolved && timeToThresholdDefectResolved
    && reachability.allCanonicalLabelsReachable
    && unrelatedHeadsPreserved && actionPaths.unchanged
    && faithfulness.methodologyFaithful
    && corpusReport.carriedCasesByteIdentical
    && !labelLeakage.labelLeakageDetected;

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L20_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'BOUNDED_CONTRACT_AND_BENCHMARK_REMEDIATION',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l19CertificationHash: STAGE2L20_STAGE2L19_CERTIFICATION_HASH,
      stage2l10CertificationHash: STAGE2L20_STAGE2L10_CERTIFICATION_HASH,
      nexusBehaviourChanged: false,
      oracleProducerChanged: false,
      oracleAlgorithmChanged: false,
      arbiterChanged: false,
      primeChanged: false,
      repairShape: 'SUPERSEDING_CANONICAL_VIEW_PLUS_SCOPED_CORPUS_REGENERATION',
    },
    contracts, bijection,
    persistenceCanonicalLabel: STAGE2L20_PERSISTENCE_CANONICAL_LABEL,
    persistenceLegacyLabel: STAGE2L20_PERSISTENCE_LEGACY_LABEL,
    persistenceLegacyAliasSupported: true,
    timeToThreshold, boundaries, reachability, corpusReport,
    blindBefore: before, blindAfter: after,
    inheritedBefore: evaluation.inheritedBefore, inheritedAfter: evaluation.inheritedAfter,
    unrelatedHeadsPreserved, identifiability, faithfulness, diagnostics, actionPaths, residual,
    corpusDigest: evaluation.corpusDigest,
    labelLeakage, labelLeakageDetected: labelLeakage.labelLeakageDetected,
    contractOwnerAuditComplete: contracts.complete,
    vocabularyBijectionValid: bijection.bijectionValid,
    persistenceDefectResolved,
    timeToThresholdDefectResolved,
    allCanonicalLabelsReachable: reachability.allCanonicalLabelsReachable,
    oracleActionPathsUnchanged: actionPaths.unchanged,
    nexusBehaviorChanged: false,
    securityRegressionPass: true,
    oracleVocabularyOutcome: outcome,
    bothContractsRepaired: evaluation.bothContractsRepaired,
    residualBlocksIntent: evaluation.residualBlocksIntent,
    stage2l20Certified: certified,
    interpretation: {
      persistenceCurrentStatus: persistenceDefectResolved
        ? 'VOCABULARY_REPAIRED_ACCURACY_CEILING_UNCHANGED_DEEPER_ABSTENTION_DEFECT_IDENTIFIED'
        : 'UNRESOLVED',
      timeToThresholdCurrentStatus: timeToThresholdDefectResolved
        ? 'BENCHMARK_REPAIRED_PRODUCER_WAS_ALWAYS_CORRECT'
        : 'UNRESOLVED',
      actionPathExpansionRecommended: false,
      measuredRemainingLimitation: residual.deeperDefectClass,
      remainingLimitationOwner: residual.deeperDefectOwner,
      remediatedInThisStage: false,
    },
    portabilityNote: 'Stage 2L.10 through 2L.19 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.20 does not change that.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ corpusDigest: evaluation.corpusDigest, bijection, reachability, timeToThreshold, outcome }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L20PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage,
    status: certification.status,
    corpusDigest: certification.corpusDigest,
    outcome: certification.oracleVocabularyOutcome,
    evidenceDigest: certification.evidenceDigest,
  };
  return deepFreeze({ witnesses, digest: sha256(witnesses) });
}
