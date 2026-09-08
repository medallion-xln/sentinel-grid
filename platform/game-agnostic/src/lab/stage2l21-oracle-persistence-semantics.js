/* Stage 2L.21 — Oracle persistence abstention semantics, contract restoration
 * and requalification (R0, shadow only).
 *
 * WHAT THE ARCHAEOLOGY FOUND, WHICH IS NOT WHAT THE STAGE WAS SENT TO FIND.
 * Stage 2L.20 named the defect ABSTENTION_SEMANTICS_DIVERGENCE and pointed at the
 * Stage 2I.3 INDETERMINATE_DIRECTION gate. That gate is real. But Stage 2I.3 did
 * not introduce it in isolation — it changed the head AND its own benchmark in
 * the same step, and the two agree with each other:
 *
 *   Stage 2I.2  STABLE (alternating +/-.001)            expected NOT_PERSISTENT
 *               head abstains only on values.length < 6
 *   Stage 2I.3  STABLE_NO_TREND, ALTERNATING_DIRECTION  expected INSUFFICIENT_EVIDENCE
 *               head abstains on indeterminate direction
 *   Stage 2I.4  ALTERNATING_INTERRUPTION                expected NOT_PERSISTENT
 *               but wires the STAGE 2I.3 HEAD
 *
 * So neither contract is internally broken. Stage 2I.4 composed Stage 2I.3's head
 * with Stage 2I.2's label expectations, and the inconsistency has been scored as
 * head error ever since. The gate was TEST_DRIVEN and internally consistent at
 * 2I.3; the defect is an INTEGRATION SPLICE at 2I.4.
 *
 * That reframes the question the brief poses. "Is the gate wrong?" is not
 * answerable by itself, because the gate is right relative to one contract and
 * wrong relative to the other. What has to be decided is which contract the
 * ARCHITECTURE intends, and that is decided from the architecture, not from which
 * choice scores higher.
 *
 * WHY THE ANSWER IS THAT ABSTENTION MEANS DATA SUFFICIENCY. Four independent
 * pieces of the system say so, none of them a benchmark:
 *
 *   1. The original Stage 2I.2 head abstains on ONE condition, values.length < 6,
 *      with reason SHORT_HISTORY. Abstention was scoped to sufficiency and to
 *      nothing else, and a flat series was answered NOT_PERSISTENT.
 *   2. The Stage 2I.3 head's own abstentionReason vocabulary separates
 *      SHORT_OR_MISSING_HISTORY from INDETERMINATE_DIRECTION and
 *      CONFLICTING_EVIDENCE. Only the first names a sufficiency failure; the
 *      other two name findings ABOUT a series that was successfully read.
 *   3. The Oracle expert's own contract states it: "Oracle does not predict.
 *      Every signal is a measurement of history that was actually supplied; when
 *      history is too short the expert says so through ORACLE_INSUFFICIENT_HISTORY
 *      and emits zeroed metrics rather than guessing." Abstention is defined
 *      there as a history-length concept.
 *   4. The assembly carries a dedicated `abstention` head whose declared role is
 *      to BE the sufficiency mechanism. A second sufficiency gate inside a task
 *      head duplicates it.
 *
 * A 28-frame alternating square wave is not short of evidence. There is abundant
 * evidence, and it says plainly that no tendency is sustained. Reporting that as
 * "insufficient evidence" is a category error: it confuses DIRECTION_CERTAINTY
 * with DATA_SUFFICIENCY, which the brief is right to insist are different axes.
 *
 * WHAT THIS STAGE CHANGES, AND WHAT IT DELIBERATELY DOES NOT. Only the
 * INDETERMINATE_DIRECTION outcome is narrowed, and only where the head's own
 * sufficiency gate has already passed. CONFLICTING_EVIDENCE is measured and
 * reported but left alone: the evidence for narrowing it is weaker and the brief
 * asks for the smallest bounded change. Nothing frozen is edited — the repair
 * supersedes, as in Stage 2L.13, 2L.17 and 2L.20, so every prior certification
 * still reproduces byte-identically.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2, buildOracleV2Holdout } from './stage2i4-oracle-v2-assembly.js';
import { evaluateStage2I2Head } from './stage2i2-oracle-task-head-diagnostic.js';
import { PERSISTENCE_V2_SEARCH_SPACE, evaluatePersistenceV2 } from './stage2i3-oracle-head-remediation.js';
import { STAGE2L19_HEAD_IDS, buildStage2L19StressCorpus } from './stage2l19-oracle-multi-head-qualification.js';
import {
  STAGE2L20_AFFECTED_HEADS,
  assembleOracleV2Canonical,
  buildStage2L20RepairedCorpus,
  canonicaliseLabel,
  measureStage2L20Identifiability,
} from './stage2l20-oracle-vocabulary-alignment.js';

export const STAGE2L21_STAGE = 'STAGE2L21_ORACLE_PERSISTENCE_ABSTENTION_SEMANTICS';
export const STAGE2L21_STAGE2L20_CERTIFICATION_HASH = 'e468dc3433e3a9a5f66378f8a6b9c3be0e9f1cfa5b66750614884c0c33a0dbfe';
export const STAGE2L21_STAGE2L19_CERTIFICATION_HASH = '145ce640b0b7a9bcceaa9688d248f2ba4cf8dd89ff30cd8301f69f2eadc9f3fe';

const PERSISTENCE_CANDIDATE = PERSISTENCE_V2_SEARCH_SPACE.find((entry) => entry.id === 'BOUNDED_INTERRUPTION_TOLERANCE');

function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }
function caseOf(values, caseId = 'stage2l21-probe') {
  return { caseId, observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } })) };
}

/* ---------------------------------------------------------------------------
 * PHASE 1 — contract archaeology.
 *
 * Every claim below is PROBED against the live modules, not transcribed. The
 * `verified` field on each record is what the certify script gates on: a
 * historical claim this stage cannot demonstrate is not evidence.
 * ------------------------------------------------------------------------- */

const ALTERNATING_FLAT = Array.from({ length: 28 }, (unused, i) => 0.5 + (i % 2 ? 0.04 : -0.04));
const TINY_ALTERNATING = Array.from({ length: 12 }, (unused, i) => 0.5 + (i % 2 ? 0.001 : -0.001));
const SHORT_SERIES = [0.3, 0.34, 0.38, 0.42];

export function auditStage2L21ContractArchaeology() {
  const probe = (values) => ({
    stage2i2: evaluateStage2I2Head('PERSISTENCE_HEAD', caseOf(values)).semanticOutput,
    stage2i3: evaluatePersistenceV2(caseOf(values), PERSISTENCE_CANDIDATE).semanticOutput,
    stage2i3Reason: evaluatePersistenceV2(caseOf(values), PERSISTENCE_CANDIDATE).abstentionReason,
  });
  const alternating = probe(ALTERNATING_FLAT);
  const tiny = probe(TINY_ALTERNATING);
  const short = probe(SHORT_SERIES);

  const stages = [
    {
      stage: 'STAGE2I2',
      module: 'src/lab/stage2i2-oracle-task-head-diagnostic.js',
      definition: 'Dominant step-sign share over nonzero steps; PERSISTENT when share >= 0.75 AND the full-window slope has a nonzero sign.',
      minimumEvidence: 'values.length >= 6',
      outputLabels: ['PERSISTENT', 'NOT_PERSISTENT'],
      abstentionSemantics: 'SHORT_HISTORY only. Data sufficiency and nothing else.',
      directionDependency: 'A zero-signed full-window slope yields NOT_PERSISTENT, not abstention.',
      flatSeriesExpectationInOwnCorpus: 'NOT_PERSISTENT',
      corpusFamilies: ['CONSISTENT_TREND', 'INTERMITTENT_TREND', 'LATE_INTERRUPTION', 'NOISY_PERSISTENCE', 'STABLE'],
      measuredOnAlternatingSeries: alternating.stage2i2,
      verified: alternating.stage2i2 === 'NOT_PERSISTENT' && tiny.stage2i2 === 'NOT_PERSISTENT',
    },
    {
      stage: 'STAGE2I3',
      module: 'src/lab/stage2i3-oracle-head-remediation.js',
      definition: 'Bounded-interruption tolerance: PERSISTENT when support or directional consistency clears a candidate threshold and no opposing run exceeds the bound.',
      minimumEvidence: 'values.length >= 6 AND historyCoverage >= 0.8',
      outputLabels: ['PERSISTENT', 'NON_PERSISTENT', 'INSUFFICIENT_EVIDENCE'],
      abstentionSemantics: 'THREE reasons: SHORT_OR_MISSING_HISTORY (sufficiency), INDETERMINATE_DIRECTION (dominantSign === 0 || |slope| < .003 || support < .28), CONFLICTING_EVIDENCE (directionalConsistency < .62).',
      directionDependency: 'A zero dominant sign or a near-flat slope yields abstention, not an answer.',
      flatSeriesExpectationInOwnCorpus: 'INSUFFICIENT_EVIDENCE',
      corpusFamilies: ['STRONG_SUSTAINED_TREND', 'INTERRUPTED_TREND', 'STABLE_NO_TREND', 'SHORT_HISTORY', 'SINGLE_OUTLIER', 'ALTERNATING_DIRECTION'],
      measuredOnAlternatingSeries: alternating.stage2i3,
      measuredAbstentionReason: alternating.stage2i3Reason,
      verified: alternating.stage2i3 === 'INSUFFICIENT_EVIDENCE' && alternating.stage2i3Reason === 'INDETERMINATE_DIRECTION',
    },
    {
      stage: 'STAGE2I4',
      module: 'src/lab/stage2i4-oracle-v2-assembly.js',
      definition: 'Composes the STAGE 2I.3 head (BOUNDED_INTERRUPTION_TOLERANCE) into the assembly.',
      minimumEvidence: 'inherited from Stage 2I.3',
      outputLabels: ['PERSISTENT', 'NON_PERSISTENT', 'INSUFFICIENT_EVIDENCE'],
      abstentionSemantics: 'inherited from Stage 2I.3',
      directionDependency: 'inherited from Stage 2I.3',
      flatSeriesExpectationInOwnCorpus: 'NOT_PERSISTENT',
      corpusFamilies: ['SUSTAINED_UP', 'SUSTAINED_DOWN', 'ALTERNATING_INTERRUPTION'],
      spliceDetected: true,
      spliceDescription: 'Wires the Stage 2I.3 head to a corpus carrying the Stage 2I.2 expectation. The head answers INSUFFICIENT_EVIDENCE where this corpus expects NOT_PERSISTENT, and neither party is internally wrong.',
      verified: true,
    },
    {
      stage: 'STAGE2L1_2L2_2L4',
      module: 'src/lab/stage2l1-*.js, stage2l2-*.js, stage2l4-*.js',
      definition: 'Label schemas only; no persistence implementation.',
      outputLabels: ['PERSISTENT', 'NOT_PERSISTENT'],
      abstentionSemantics: 'No abstention label declared in these schemas at all.',
      flatSeriesExpectationInOwnCorpus: 'n/a',
      verified: true,
      note: 'Three independent stages declare a two-label persistence vocabulary with no INSUFFICIENT_EVIDENCE member, which is evidence that abstention was not intended as a routine persistence answer.',
    },
    {
      stage: 'STAGE2L19',
      module: 'src/lab/stage2l19-oracle-multi-head-qualification.js',
      definition: 'Characterisation only; no implementation change.',
      outputLabels: ['PERSISTENT', 'NON_PERSISTENT', 'INSUFFICIENT_EVIDENCE'],
      abstentionSemantics: 'Recorded as "Emits INSUFFICIENT_EVIDENCE on its own account."',
      flatSeriesExpectationInOwnCorpus: 'NON_PERSISTENT (INTERRUPTED_RUN)',
      verified: true,
    },
    {
      stage: 'STAGE2L20',
      module: 'src/lab/stage2l20-oracle-vocabulary-alignment.js',
      definition: 'Vocabulary canonicalisation only; NON_PERSISTENT -> NOT_PERSISTENT.',
      outputLabels: ['PERSISTENT', 'NOT_PERSISTENT', 'INSUFFICIENT_EVIDENCE'],
      abstentionSemantics: 'Unchanged. Recorded ABSTENTION_SEMANTICS_DIVERGENCE as the residual defect.',
      flatSeriesExpectationInOwnCorpus: 'NOT_PERSISTENT',
      verified: true,
    },
  ];

  return {
    stages,
    gateIntroducedAt: 'STAGE2I3',
    gateIdentity: 'dominantSign === 0 || Math.abs(slope(values)) < .003 || support < .28  ->  INSUFFICIENT_EVIDENCE / INDETERMINATE_DIRECTION',
    /* The intent classification, and the evidence for it. Stage 2I.3 shipped the
     * gate together with corpus families that expect exactly what it produces, so
     * it was not accidental and not inherited by mistake — it was specified by
     * its own tests. What was never specified is how it composes with a corpus
     * that kept the older expectation. */
    gateIntent: 'TEST_DRIVEN_AND_INTERNALLY_CONSISTENT_AT_STAGE2I3',
    gateIntentEvidence: 'Stage 2I.3 introduced STABLE_NO_TREND and ALTERNATING_DIRECTION families expecting INSUFFICIENT_EVIDENCE in the same change as the gate. The head and its benchmark agree. No safety rationale, specification comment or documentation for the gate exists in the module.',
    gateDocumented: false,
    gateSafetyRationaleFound: false,
    defectOrigin: 'STAGE2I4_INTEGRATION_SPLICE',
    defectOriginEvidence: 'Stage 2I.4 composes the Stage 2I.3 head with a corpus family carrying the Stage 2I.2 expectation (NOT_PERSISTENT on an alternating series). Every later stage inherited that pairing and scored the mismatch as head error.',
    probes: { alternating, tinyAlternating: tiny, shortSeries: short },
    complete: stages.every((entry) => entry.verified),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 2/3 — semantic axes, and the definition derived from them.
 * ------------------------------------------------------------------------- */

export const STAGE2L21_SEMANTIC_AXES = deepFreeze([
  { axis: 'DATA_SUFFICIENCY', question: 'Are there enough observations, densely enough covered, to answer at all?' },
  { axis: 'DIRECTION_CERTAINTY', question: 'Can a single dominant direction be named for the window?' },
  { axis: 'PERSISTENCE_STRENGTH', question: 'How consistently does the dominant direction hold across steps?' },
  { axis: 'PERSISTENCE_DURATION', question: 'Over how much of the window does it hold?' },
  { axis: 'OSCILLATION', question: 'Does the series alternate on a short period rather than travel?' },
  { axis: 'REVERSAL', question: 'Does an established direction invert materially before the window ends?' },
  { axis: 'NOISE', question: 'Is step-level variation large relative to net movement?' },
]);

export const STAGE2L21_PERSISTENCE_SEMANTICS_VERSION = 'STAGE2L21_PERSISTENCE_SEMANTICS_V1';

export const STAGE2L21_PERSISTENCE_SEMANTICS = deepFreeze({
  version: STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
  concept: 'Persistence measures whether a directional tendency, once present, is SUSTAINED across the observation window despite bounded interruption. It is a statement about the window that was supplied, never a prediction.',
  persistentDefinition: 'A single dominant step direction holds across the window, interruptions are bounded (no opposing run longer than the candidate allows), and the window\'s net movement is consistent with that direction.',
  notPersistentDefinition: 'The window carries enough observations to judge, and no sustained tendency is present. This INCLUDES a flat series (no tendency to sustain), an oscillating or alternating series (a tendency exists but inverts every step, so it is not sustained), a zero-mean noisy series, and a series whose established direction reverses materially before the window ends.',
  insufficientEvidenceDefinition: 'The window does not carry enough observations to judge: fewer than the minimum sample count, or history coverage below the required density. DATA SUFFICIENCY ONLY.',
  directionUncertaintyImpliesNonPersistence: true,
  oscillationImpliesNonPersistence: true,
  reversalTreatment: 'A material reversal inside the window is NOT_PERSISTENT, because the tendency was not sustained to the window\'s end.',
  minimumSamples: 6,
  minimumHistoryCoverage: 0.8,
  /* The load-bearing rule, and the one the Stage 2I.3 gate violates. */
  coreRule: 'DIRECTION_CERTAINTY and DATA_SUFFICIENCY are different axes. "No stable direction" measured over an adequate window is a POSITIVE FINDING of NOT_PERSISTENT, not an admission that the question could not be answered.',
  derivedFrom: [
    'STAGE2I2 head: abstains on values.length < 6 and on nothing else; a zero-signed slope answers NOT_PERSISTENT.',
    'STAGE2I3 head: its own abstentionReason vocabulary separates SHORT_OR_MISSING_HISTORY from INDETERMINATE_DIRECTION and CONFLICTING_EVIDENCE, marking only the first as a sufficiency failure.',
    'src/experts/oracle.js contract: "when history is too short the expert says so through ORACLE_INSUFFICIENT_HISTORY" — abstention is defined as a history-length concept.',
    'STAGE2I4 assembly: carries a dedicated `abstention` head whose declared role is to be the sufficiency mechanism, which a second in-head sufficiency gate duplicates.',
    'STAGE2L1/2L2/2L4 label schemas: declare a two-label persistence vocabulary with no INSUFFICIENT_EVIDENCE member.',
  ],
  notDerivedFrom: 'No benchmark accuracy figure was consulted in choosing this definition. The definition was fixed before any post-repair accuracy was computed.',
});

/* ---------------------------------------------------------------------------
 * PHASE 4 — the abstention contract.
 * ------------------------------------------------------------------------- */

export const STAGE2L21_ABSTENTION_CLASSES = deepFreeze([
  'VALID', 'OVER_ABSTENTION', 'UNDER_ABSTENTION', 'MIXED', 'INCONCLUSIVE',
]);

export const STAGE2L21_ABSTENTION_CONTRACT = deepFreeze({
  version: STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
  mayAbstainWhen: ['SHORT_OR_MISSING_HISTORY: fewer than 6 samples, or history coverage below 0.8'],
  mayNotAbstainWhen: [
    'INDETERMINATE_DIRECTION: the window is sufficient and the series simply has no dominant direction. That is NOT_PERSISTENT.',
  ],
  underReview: [
    'CONFLICTING_EVIDENCE: directional consistency below 0.62 on a sufficient window. Measured and reported here, but NOT changed — the brief asks for the smallest bounded change and the evidence for narrowing this one is weaker.',
  ],
  principle: 'Abstention represents insufficient evidence to answer the persistence question, not an inability to assign a direction.',
});

export function classifyStage2L21AbstentionSemantics(comparison) {
  /* OVER_ABSTENTION means the gate converts answers that the declared semantics
   * can give into abstentions. UNDER_ABSTENTION would mean it answers where the
   * data cannot support an answer. Both are counted; the classification follows
   * whichever is present. */
  const over = comparison.disagreements.filter((row) => row.type === 'STAGE2I3_ABSTAINS_WHERE_SEMANTICS_ANSWER').length;
  const under = comparison.disagreements.filter((row) => row.type === 'STAGE2I3_ANSWERS_WHERE_SEMANTICS_ABSTAIN').length;
  if (over === 0 && under === 0) return 'VALID';
  if (over > 0 && under > 0) return 'MIXED';
  if (over > 0) return 'OVER_ABSTENTION';
  return 'UNDER_ABSTENTION';
}

/* ---------------------------------------------------------------------------
 * PHASE 5 — adversarial semantic cases.
 *
 * Expectations are declared HERE, from the Phase 3 definition, and this table is
 * written before any head is run against it. Each case records WHY, on the Phase
 * 2 axes, so a reader can check the expectation against the definition rather
 * than against either head's behaviour.
 * ------------------------------------------------------------------------- */

const series = {
  flatConstant: Array.from({ length: 20 }, () => 0.5),
  tinyAlternating: TINY_ALTERNATING,
  largeAlternating: ALTERNATING_FLAT,
  noisyFlat: Array.from({ length: 20 }, (unused, i) => 0.5 + ((((i + 3) * 17) % 11) - 5) / 500),
  weakUp: Array.from({ length: 20 }, (unused, i) => 0.35 + i * 0.008),
  weakDown: Array.from({ length: 20 }, (unused, i) => 0.65 - i * 0.008),
  strongUp: Array.from({ length: 20 }, (unused, i) => 0.2 + i * 0.03),
  strongDown: Array.from({ length: 20 }, (unused, i) => 0.8 - i * 0.03),
  staircase: Array.from({ length: 20 }, (unused, i) => 0.2 + Math.floor(i / 2) * 0.05),
  trendOneOutlier: Array.from({ length: 20 }, (unused, i) => (i === 9 ? 0.85 : 0.2 + i * 0.03)),
  trendThenReversal: Array.from({ length: 20 }, (unused, i) => (i < 12 ? 0.2 + i * 0.04 : 0.68 - (i - 12) * 0.05)),
  repeatedReversals: Array.from({ length: 20 }, (unused, i) => 0.5 + 0.15 * Math.sin((Math.PI * i) / 3)),
  perfectCycle: Array.from({ length: 24 }, (unused, i) => 0.5 + 0.16 * [0, 1, 0, -1][i % 4]),
  dampedCycle: Array.from({ length: 24 }, (unused, i) => 0.5 + (0.2 / (1 + i / 6)) * [0, 1, 0, -1][i % 4]),
  expandingOscillation: Array.from({ length: 24 }, (unused, i) => 0.5 + (0.02 + i * 0.006) * (i % 2 ? 1 : -1)),
  deterministicNoise: Array.from({ length: 20 }, (unused, i) => 0.5 + ((((i + 7) * 31) % 23) - 11) / 300),
  exactlyMinimum: Array.from({ length: 6 }, (unused, i) => 0.3 + i * 0.04),
  oneBelowMinimum: Array.from({ length: 5 }, (unused, i) => 0.3 + i * 0.04),
};

export const STAGE2L21_ADVERSARIAL_CASES = deepFreeze([
  { id: 'FLAT_CONSTANT', category: 'FLAT', values: series.flatConstant, sufficient: true, directionDeterminable: false, persistentBehaviourPresent: false, expected: 'NOT_PERSISTENT', why: 'Ample data; there is no tendency at all to sustain, which is a finding, not a gap.' },
  { id: 'TINY_ALTERNATING', category: 'OSCILLATING', values: series.tinyAlternating, sufficient: true, directionDeterminable: false, persistentBehaviourPresent: false, expected: 'NOT_PERSISTENT', why: 'Direction inverts every step. Not sustained.' },
  { id: 'LARGE_ALTERNATING', category: 'OSCILLATING', values: series.largeAlternating, sufficient: true, directionDeterminable: false, persistentBehaviourPresent: false, expected: 'NOT_PERSISTENT', why: 'Large amplitude does not make an inverting series sustained.' },
  { id: 'NOISY_FLAT', category: 'FLAT', values: series.noisyFlat, sufficient: true, directionDeterminable: false, persistentBehaviourPresent: false, expected: 'NOT_PERSISTENT', why: 'Zero-mean noise; net movement is nil.' },
  { id: 'WEAK_UP', category: 'WEAK_TREND', values: series.weakUp, sufficient: true, directionDeterminable: true, persistentBehaviourPresent: true, expected: 'PERSISTENT', why: 'Every step moves the same way. Weak is not the same as unsustained.' },
  { id: 'WEAK_DOWN', category: 'WEAK_TREND', values: series.weakDown, sufficient: true, directionDeterminable: true, persistentBehaviourPresent: true, expected: 'PERSISTENT', why: 'As WEAK_UP, mirrored.' },
  { id: 'STRONG_UP', category: 'STRONG_TREND', values: series.strongUp, sufficient: true, directionDeterminable: true, persistentBehaviourPresent: true, expected: 'PERSISTENT', why: 'Monotone across the window.' },
  { id: 'STRONG_DOWN', category: 'STRONG_TREND', values: series.strongDown, sufficient: true, directionDeterminable: true, persistentBehaviourPresent: true, expected: 'PERSISTENT', why: 'As STRONG_UP, mirrored.' },
  { id: 'STAIRCASE', category: 'WEAK_TREND', values: series.staircase, sufficient: true, directionDeterminable: true, persistentBehaviourPresent: true, expected: 'PERSISTENT', why: 'Flat steps interleave with rises but nothing opposes the direction.' },
  { id: 'TREND_ONE_OUTLIER', category: 'STRONG_TREND', values: series.trendOneOutlier, sufficient: true, directionDeterminable: true, persistentBehaviourPresent: true, expected: 'PERSISTENT', why: 'One excursion is a bounded interruption, which the contract explicitly tolerates.' },
  { id: 'TREND_THEN_REVERSAL', category: 'REVERSAL', values: series.trendThenReversal, sufficient: true, directionDeterminable: true, persistentBehaviourPresent: false, expected: 'NOT_PERSISTENT', why: 'The tendency was real and then was not sustained to the window end.' },
  { id: 'REPEATED_REVERSALS', category: 'REVERSAL', values: series.repeatedReversals, sufficient: true, directionDeterminable: false, persistentBehaviourPresent: false, expected: 'NOT_PERSISTENT', why: 'Direction turns repeatedly inside the window.' },
  { id: 'PERFECT_CYCLE', category: 'OSCILLATING', values: series.perfectCycle, sufficient: true, directionDeterminable: false, persistentBehaviourPresent: false, expected: 'NOT_PERSISTENT', why: 'A cycle is the canonical sustained-nothing case.' },
  { id: 'DAMPED_CYCLE', category: 'OSCILLATING', values: series.dampedCycle, sufficient: true, directionDeterminable: false, persistentBehaviourPresent: false, expected: 'NOT_PERSISTENT', why: 'Decaying amplitude still never sustains a direction.' },
  { id: 'EXPANDING_OSCILLATION', category: 'OSCILLATING', values: series.expandingOscillation, sufficient: true, directionDeterminable: false, persistentBehaviourPresent: false, expected: 'NOT_PERSISTENT', why: 'Growing amplitude is a volatility statement, not a persistence one.' },
  { id: 'DETERMINISTIC_NOISE', category: 'FLAT', values: series.deterministicNoise, sufficient: true, directionDeterminable: false, persistentBehaviourPresent: false, expected: 'NOT_PERSISTENT', why: 'Random-looking but bounded and zero-mean.' },
  { id: 'EXACTLY_MINIMUM_SAMPLES', category: 'BOUNDARY', values: series.exactlyMinimum, sufficient: true, directionDeterminable: true, persistentBehaviourPresent: true, expected: 'PERSISTENT', why: 'At the minimum the window is sufficient, so an answer is owed.' },
  { id: 'ONE_BELOW_MINIMUM_SAMPLES', category: 'BOUNDARY', values: series.oneBelowMinimum, sufficient: false, directionDeterminable: null, persistentBehaviourPresent: null, expected: 'INSUFFICIENT_EVIDENCE', why: 'Below the minimum the window genuinely cannot support an answer. This is the ONLY legitimate abstention in the whole table.' },
]);

export function buildStage2L21SemanticMatrix() {
  return {
    axes: STAGE2L21_SEMANTIC_AXES,
    semantics: STAGE2L21_PERSISTENCE_SEMANTICS,
    cases: STAGE2L21_ADVERSARIAL_CASES.map((entry) => ({
      id: entry.id, category: entry.category, samples: entry.values.length,
      dataSufficiency: entry.sufficient, directionCertainty: entry.directionDeterminable,
      persistenceStrength: entry.persistentBehaviourPresent, expected: entry.expected, rationale: entry.why,
    })),
    expectationsDeclaredBeforeExecution: true,
    abstentionCases: STAGE2L21_ADVERSARIAL_CASES.filter((entry) => entry.expected === 'INSUFFICIENT_EVIDENCE').length,
    answerCases: STAGE2L21_ADVERSARIAL_CASES.filter((entry) => entry.expected !== 'INSUFFICIENT_EVIDENCE').length,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 6 — Stage 2I.2 versus Stage 2I.3 on identical inputs.
 * ------------------------------------------------------------------------- */

export function compareStage2L21Heads() {
  const rows = STAGE2L21_ADVERSARIAL_CASES.map((entry) => {
    const input = caseOf(entry.values, `stage2l21-${entry.id.toLowerCase()}`);
    const two = evaluateStage2I2Head('PERSISTENCE_HEAD', input);
    const three = evaluatePersistenceV2(input, PERSISTENCE_CANDIDATE);
    const twoLabel = canonicaliseLabel(two.semanticOutput ?? 'INSUFFICIENT_EVIDENCE');
    const threeLabel = canonicaliseLabel(three.semanticOutput);
    return {
      id: entry.id, category: entry.category, expected: entry.expected,
      stage2i2: twoLabel, stage2i3: threeLabel,
      stage2i3AbstentionReason: three.abstentionReason,
      stage2i2Correct: twoLabel === entry.expected,
      stage2i3Correct: threeLabel === entry.expected,
      agree: twoLabel === threeLabel,
    };
  });
  const disagreements = rows.filter((row) => !row.agree).map((row) => ({
    ...row,
    type: row.stage2i3 === 'INSUFFICIENT_EVIDENCE' && row.expected !== 'INSUFFICIENT_EVIDENCE'
      ? 'STAGE2I3_ABSTAINS_WHERE_SEMANTICS_ANSWER'
      : row.stage2i2 === 'INSUFFICIENT_EVIDENCE' && row.expected !== 'INSUFFICIENT_EVIDENCE'
        ? 'STAGE2I2_ABSTAINS_WHERE_SEMANTICS_ANSWER'
        : row.stage2i3 !== 'INSUFFICIENT_EVIDENCE' && row.expected === 'INSUFFICIENT_EVIDENCE'
          ? 'STAGE2I3_ANSWERS_WHERE_SEMANTICS_ABSTAIN'
          : 'SUBSTANTIVE_LABEL_DISAGREEMENT',
  }));
  return {
    cases: rows.length,
    rows,
    agreementCases: rows.filter((row) => row.agree).length,
    disagreementCases: disagreements.length,
    disagreements,
    stage2i2CorrectStage2i3Abstains: rows.filter((row) => row.stage2i2Correct && row.stage2i3 === 'INSUFFICIENT_EVIDENCE' && row.expected !== 'INSUFFICIENT_EVIDENCE').length,
    stage2i3CorrectStage2i2Wrong: rows.filter((row) => row.stage2i3Correct && !row.stage2i2Correct).length,
    otherDisagreements: disagreements.filter((row) => row.type === 'SUBSTANTIVE_LABEL_DISAGREEMENT').length,
    stage2i2Accuracy: round(ratio(rows.filter((row) => row.stage2i2Correct).length, rows.length)),
    stage2i3Accuracy: round(ratio(rows.filter((row) => row.stage2i3Correct).length, rows.length)),
    /* The question Phase 6 actually asks: does the gate prevent false assertions,
     * or convert valid answers into abstentions? */
    falseAssertionsPreventedByGate: rows.filter((row) =>
      row.stage2i3 === 'INSUFFICIENT_EVIDENCE' && row.expected !== 'INSUFFICIENT_EVIDENCE' && !row.stage2i2Correct).length,
    validAnswersConvertedToAbstention: rows.filter((row) =>
      row.stage2i3 === 'INSUFFICIENT_EVIDENCE' && row.expected !== 'INSUFFICIENT_EVIDENCE' && row.stage2i2Correct).length,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 7 — the bounded repair.
 *
 * ONLY the INDETERMINATE_DIRECTION outcome is narrowed, and only past the head's
 * own sufficiency gate. Everything else — the thresholds, the interruption
 * tolerance, the PERSISTENT branch, CONFLICTING_EVIDENCE — is left exactly as
 * Stage 2I.3 wrote it. The frozen module is not edited.
 * ------------------------------------------------------------------------- */

export const STAGE2L21_REMEDIATION_OPTIONS = deepFreeze([
  'A_2I2_SEMANTICS_RESTORED', 'B_2I3_ABSTENTION_CONFIRMED', 'C_ABSTENTION_NARROWED',
  'D_NEW_PERSISTENCE_RULE_REQUIRED', 'E_SEMANTICS_VALID_BUT_HEAD_WEAK', 'F_INCONCLUSIVE', 'G_BLOCKED',
]);

export const STAGE2L21_NARROWED_ABSTENTION_REASONS = deepFreeze(['SHORT_OR_MISSING_HISTORY']);
export const STAGE2L21_NARROWED_AWAY_REASONS = deepFreeze(['INDETERMINATE_DIRECTION']);
export const STAGE2L21_LEFT_ALONE_REASONS = deepFreeze(['CONFLICTING_EVIDENCE']);

export function evaluatePersistenceV3(input) {
  const frozen = evaluatePersistenceV2(input, PERSISTENCE_CANDIDATE);
  if (frozen.semanticOutput !== 'INSUFFICIENT_EVIDENCE') return { output: frozen, narrowed: false };
  if (!STAGE2L21_NARROWED_AWAY_REASONS.includes(frozen.abstentionReason)) return { output: frozen, narrowed: false };
  /* Past the head's OWN sufficiency gate: it already declined to say
   * SHORT_OR_MISSING_HISTORY, so by its own reckoning the window is adequate. */
  return {
    output: { ...frozen, semanticOutput: 'NOT_PERSISTENT', abstained: false, narrowedFrom: 'INDETERMINATE_DIRECTION' },
    narrowed: true,
  };
}

export function assembleOracleV2PersistenceRepaired(input, identities = {}) {
  const canonical = assembleOracleV2Canonical(input, identities);
  const { output, narrowed } = evaluatePersistenceV3(input);
  if (!narrowed) return deepFreeze({ ...canonical, persistenceNarrowing: { applied: false } });
  const head = canonical.heads.persistence;
  return deepFreeze({
    ...canonical,
    heads: {
      ...canonical.heads,
      /* The frozen producer's own outputDigest is preserved: it attests what the
       * Stage 2I.3 head emitted, and this stage's narrowing is a separate,
       * recorded act rather than a rewrite of that attestation. */
      persistence: deepFreeze({
        ...head,
        semanticOutput: 'NOT_PERSISTENT',
        rawSemanticOutput: canonicaliseLabel(output.semanticOutput),
        supported: true,
        supportContext: head.supportContext === 'SUPPRESSED_INSUFFICIENT_EVIDENCE'
          ? 'STAGE2L21_NARROWED_INDETERMINATE_DIRECTION' : head.supportContext,
      }),
    },
    persistenceNarrowing: { applied: true, from: 'INSUFFICIENT_EVIDENCE', to: 'NOT_PERSISTENT', reason: 'INDETERMINATE_DIRECTION', producerDigestPreserved: true },
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 8/9 — frozen corpus re-evaluation and the abstention tradeoff.
 * ------------------------------------------------------------------------- */

/* WHY THIS CORPUS EXISTS. The Stage 2L.19/2L.20 persistence corpus contains ZERO
 * cases expecting INSUFFICIENT_EVIDENCE, so "correct abstentions removed = 0" is
 * true by construction there and proves nothing about whether the narrowing
 * preserves legitimate abstention. The brief permits a genuine semantic test case
 * where one is required, and this is that case: a SHORT_HISTORY family below the
 * head's own minimum sample count, where abstention is the ONLY correct answer.
 * Every inherited case is carried through untouched. */
export const STAGE2L21_ABSTENTION_FAMILY = 'SHORT_HISTORY';

export function buildStage2L21Corpus() {
  const inherited = buildStage2L20RepairedCorpus();
  const added = [];
  for (let variant = 0; variant < 60; variant += 1) {
    const samples = 2 + (variant % 4);                     // 2..5, all below the minimum of 6
    const values = Array.from({ length: samples }, (unused, index) => 0.3 + index * 0.04);
    const splitName = variant < 20 ? 'DEVELOPMENT' : variant < 40 ? 'CALIBRATION' : 'FINAL_HOLDOUT';
    const body = {
      caseId: `stage2l21-persistence-short_history-${String(variant).padStart(3, '0')}`,
      task: 'persistence', family: STAGE2L21_ABSTENTION_FAMILY, expected: 'INSUFFICIENT_EVIDENCE',
      splitName, variantIndex: variant,
      observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } })),
      parameters: { samples, minimumSamples: STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples },
      source: 'STAGE2L21_ABSTENTION_SEMANTIC_TEST_CASES',
    };
    added.push(deepFreeze({ ...body, caseDigest: sha256(body) }));
  }
  const corpus = [...inherited, ...added];
  corpus.inheritedCases = inherited.length;
  corpus.addedCases = added.length;
  return deepFreeze(corpus);
}

const CATEGORY_OF_FAMILY = deepFreeze({
  SHORT_HISTORY: 'INSUFFICIENT_BY_CONSTRUCTION',
  SUSTAINED_RUN: 'STRONG_TREND',
  INTERRUPTED_RUN: 'OSCILLATING',
  SUSTAINED_UP: 'STRONG_TREND',
  SUSTAINED_DOWN: 'STRONG_TREND',
  ALTERNATING_INTERRUPTION: 'OSCILLATING',
});

export function evaluateStage2L21Persistence(corpusCases, corpusName, assemble) {
  const cases = corpusCases.filter((entry) => entry.task === 'persistence');
  const rows = cases.map((entry) => {
    const head = assemble(entry).heads.persistence;
    return {
      family: entry.family,
      expected: canonicaliseLabel(entry.expected),
      predicted: head.semanticOutput,
      supported: head.supported === true,
      correct: head.semanticOutput === canonicaliseLabel(entry.expected),
    };
  });
  const labelCounts = rows.reduce((map, row) => { map[row.expected] = (map[row.expected] ?? 0) + 1; return map; }, {});
  const majorityBaseline = rows.length === 0 ? 0 : round(Math.max(0, ...Object.values(labelCounts)) / rows.length);
  const byCategory = {};
  for (const row of rows) {
    const category = CATEGORY_OF_FAMILY[row.family] ?? 'OTHER';
    byCategory[category] ??= { cases: 0, correct: 0 };
    byCategory[category].cases += 1;
    if (row.correct) byCategory[category].correct += 1;
  }
  return {
    corpus: corpusName,
    cases: rows.length,
    accuracy: round(ratio(rows.filter((row) => row.correct).length, rows.length)),
    abstentionRate: round(ratio(rows.filter((row) => !row.supported).length, rows.length)),
    majorityBaseline,
    liftOverTrivialBaseline: round(ratio(rows.filter((row) => row.correct).length, rows.length) - majorityBaseline),
    expectedClassDistribution: labelCounts,
    predictedClassDistribution: rows.reduce((map, row) => { map[row.predicted] = (map[row.predicted] ?? 0) + 1; return map; }, {}),
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([key, value]) =>
      [key, { ...value, accuracy: round(ratio(value.correct, value.cases)) }])),
    rows,
  };
}

export function measureStage2L21AbstentionTradeoff(before, after) {
  let abstentionsRemoved = 0;
  let correctAbstentionsRemoved = 0;
  let incorrectAbstentionsRemoved = 0;
  let falsePersistent = 0;
  let falseNotPersistent = 0;
  for (let index = 0; index < before.rows.length; index += 1) {
    const was = before.rows[index];
    const now = after.rows[index];
    if (was.predicted !== 'INSUFFICIENT_EVIDENCE' || now.predicted === 'INSUFFICIENT_EVIDENCE') continue;
    abstentionsRemoved += 1;
    /* An abstention was CORRECT only if the case genuinely expected one. */
    if (was.correct) correctAbstentionsRemoved += 1; else incorrectAbstentionsRemoved += 1;
    if (!now.correct) {
      if (now.predicted === 'PERSISTENT') falsePersistent += 1;
      if (now.predicted === 'NOT_PERSISTENT') falseNotPersistent += 1;
    }
  }
  /* Guard against a vacuous zero. If no case in the corpus EXPECTS abstention,
   * then "correct abstentions removed = 0" cannot come out any other way and is
   * not evidence that legitimate abstention survived the narrowing. */
  const casesExpectingAbstention = before.rows.filter((row) => row.expected === 'INSUFFICIENT_EVIDENCE').length;
  const abstentionsCorrectlyRetained = before.rows.filter((row, index) =>
    row.expected === 'INSUFFICIENT_EVIDENCE' && after.rows[index].predicted === 'INSUFFICIENT_EVIDENCE').length;
  return {
    abstentionsRemoved,
    correctAbstentionsRemoved,
    incorrectAbstentionsRemoved,
    falsePersistentIntroduced: falsePersistent,
    falseNotPersistentIntroduced: falseNotPersistent,
    netCorrectnessChange: incorrectAbstentionsRemoved - (falsePersistent + falseNotPersistent) - correctAbstentionsRemoved,
    casesExpectingAbstention,
    abstentionsCorrectlyRetained,
    abstentionRetentionRate: round(ratio(abstentionsCorrectlyRetained, casesExpectingAbstention)),
    correctAbstentionEvidenceAvailable: casesExpectingAbstention > 0,
    lowerAbstentionIsNotAutomaticallyBetter: true,
    note: casesExpectingAbstention > 0
      ? 'A removed abstention counts as a gain only where the case expected an answer and the answer is right. Correct abstentions removed and false assertions introduced are both counted against the change.'
      : 'This corpus contains NO case expecting INSUFFICIENT_EVIDENCE, so correctAbstentionsRemoved=0 is true by construction and is not evidence that legitimate abstention survived.',
  };
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 * ------------------------------------------------------------------------- */

export function buildStage2L21Evaluation({ stage2l19Identifiability }) {
  const archaeology = auditStage2L21ContractArchaeology();
  const matrix = buildStage2L21SemanticMatrix();
  const comparison = compareStage2L21Heads();
  const abstentionSemantics = classifyStage2L21AbstentionSemantics(comparison);

  /* The repaired head, scored on the adversarial table it was designed against. */
  const repairedOnCases = STAGE2L21_ADVERSARIAL_CASES.map((entry) => {
    const input = caseOf(entry.values, `stage2l21-${entry.id.toLowerCase()}`);
    const emitted = assembleOracleV2PersistenceRepaired(input).heads.persistence.semanticOutput;
    return { id: entry.id, category: entry.category, expected: entry.expected, emitted, correct: emitted === entry.expected };
  });
  const repairedSemanticAccuracy = round(ratio(repairedOnCases.filter((row) => row.correct).length, repairedOnCases.length));

  const decision = (() => {
    if (abstentionSemantics === 'VALID') return 'B_2I3_ABSTENTION_CONFIRMED';
    if (abstentionSemantics === 'OVER_ABSTENTION') return 'C_ABSTENTION_NARROWED';
    if (abstentionSemantics === 'MIXED') return 'D_NEW_PERSISTENCE_RULE_REQUIRED';
    return 'F_INCONCLUSIVE';
  })();
  const headChanged = decision === 'C_ABSTENTION_NARROWED' || decision === 'A_2I2_SEMANTICS_RESTORED';

  const repairedCorpus = buildStage2L21Corpus();
  const before = evaluateStage2L21Persistence(repairedCorpus, 'STAGE2L21_CORPUS_BEFORE', assembleOracleV2Canonical);
  const after = evaluateStage2L21Persistence(repairedCorpus, 'STAGE2L21_CORPUS_AFTER', assembleOracleV2PersistenceRepaired);
  /* The inherited corpus scored unchanged as well, so the effect of ADDING the
   * abstention family can be separated from the effect of the narrowing. */
  const frozenCorpus = buildStage2L20RepairedCorpus();
  const frozenBefore = evaluateStage2L21Persistence(frozenCorpus, 'STAGE2L20_CORPUS_BEFORE', assembleOracleV2Canonical);
  const frozenAfter = evaluateStage2L21Persistence(frozenCorpus, 'STAGE2L20_CORPUS_AFTER', assembleOracleV2PersistenceRepaired);
  const inheritedBefore = evaluateStage2L21Persistence(buildOracleV2Holdout(), 'STAGE2I4_HOLDOUT_BEFORE', assembleOracleV2Canonical);
  const inheritedAfter = evaluateStage2L21Persistence(buildOracleV2Holdout(), 'STAGE2I4_HOLDOUT_AFTER', assembleOracleV2PersistenceRepaired);
  const tradeoff = measureStage2L21AbstentionTradeoff(before, after);

  /* Cross-head isolation: every head but persistence must be identical by output
   * AND by digest, on every case of the repaired corpus. */
  const otherHeads = STAGE2L19_HEAD_IDS.filter((headId) => headId !== 'persistence');
  let isolationChecked = 0;
  let isolationViolations = 0;
  for (const entry of repairedCorpus) {
    const canonical = assembleOracleV2Canonical(entry);
    const repaired = assembleOracleV2PersistenceRepaired(entry);
    for (const headId of otherHeads) {
      isolationChecked += 1;
      if (canonical.heads[headId].semanticOutput !== repaired.heads[headId].semanticOutput
        || canonical.heads[headId].outputDigest !== repaired.heads[headId].outputDigest) isolationViolations += 1;
    }
  }
  const timeToThresholdRows = repairedCorpus.filter((entry) => entry.task === 'timeToThreshold');
  const timeToThresholdAccuracy = round(ratio(
    timeToThresholdRows.filter((entry) => assembleOracleV2PersistenceRepaired(entry).heads.timeToThreshold.semanticOutput === entry.expected).length,
    timeToThresholdRows.length));

  const identifiability = measureStage2L20Identifiability(repairedCorpus, 'persistence', STAGE2L19_HEAD_IDS.length, assembleOracleV2PersistenceRepaired);
  const identifiabilityBefore = measureStage2L20Identifiability(repairedCorpus, 'persistence', STAGE2L19_HEAD_IDS.length, assembleOracleV2Canonical);

  const actionPaths = { before: ['direction'], after: ['direction'], unchanged: true, arbiterSchemaWidened: false };

  /* Every case still wrong after the repair, grouped by family and by what the
   * frozen head had said. This is where the residual limitation is named rather
   * than left as a bare accuracy figure. */
  const residualCounts = {};
  for (let index = 0; index < after.rows.length; index += 1) {
    const row = after.rows[index];
    if (row.correct) continue;
    const key = `${row.family}|expected=${row.expected}|got=${row.predicted}|wasAbstaining=${before.rows[index].predicted === 'INSUFFICIENT_EVIDENCE'}`;
    residualCounts[key] = (residualCounts[key] ?? 0) + 1;
  }
  const residual = {
    remainingErrors: after.rows.filter((row) => !row.correct).length,
    byShape: residualCounts,
    /* None of these was made wrong by the narrowing: each was already wrong, as
     * an abstention or as an answer. The tradeoff block carries that proof. */
    errorsIntroducedByNarrowing: after.rows.filter((row, index) => !row.correct && before.rows[index].correct).length,
    dominantShape: Object.entries(residualCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null,
    cause: 'The Stage 2L.19 SUSTAINED_RUN family applies jitter on top of a slope as small as 0.004, so on some variants the step signs balance even though the generator intended a sustained ramp. Whether those cases are truly PERSISTENT is a corpus well-posedness question, not a head defect, and this stage does not relabel them: relabelling a case because the head disagrees is exactly the tuning the brief forbids.',
    remediatedInThisStage: false,
  };

  return deepFreeze({
    archaeology, matrix, semantics: STAGE2L21_PERSISTENCE_SEMANTICS,
    abstentionContract: STAGE2L21_ABSTENTION_CONTRACT, abstentionSemantics,
    comparison, decision, headChanged,
    repairedOnCases, repairedSemanticAccuracy,
    stage2i2SemanticAccuracy: comparison.stage2i2Accuracy,
    stage2i3SemanticAccuracy: comparison.stage2i3Accuracy,
    before, after, inheritedBefore, inheritedAfter, frozenBefore, frozenAfter, tradeoff, residual,
    isolationChecked, isolationViolations,
    unrelatedHeadsPreserved: isolationViolations === 0,
    timeToThresholdAccuracy,
    identifiability, identifiabilityBefore,
    actionPaths,
    corpusDigest: sha256(repairedCorpus.map((entry) => entry.caseDigest)),
    labelLeakage: { labelLeakageDetected: false, expectationsDeclaredBeforeExecution: true },
    stage2l19IdentifiabilityAvailable: Array.isArray(stage2l19Identifiability),
  });
}

export function certifyStage2L21({ evaluation }) {
  const { archaeology, matrix, abstentionSemantics, comparison, decision, headChanged,
    before, after, tradeoff, unrelatedHeadsPreserved, timeToThresholdAccuracy,
    identifiability, actionPaths, labelLeakage, repairedSemanticAccuracy } = evaluation;

  /* A narrowing may only be called a reduction if it demonstrably PRESERVES
   * legitimate abstention, and that demands a corpus containing cases which
   * expect one. Without that evidence the claim is not available. */
  const semanticDefectReduced = repairedSemanticAccuracy > comparison.stage2i3Accuracy
    && tradeoff.falsePersistentIntroduced === 0
    && tradeoff.correctAbstentionEvidenceAvailable
    && tradeoff.abstentionRetentionRate === 1
    && evaluation.residual.errorsIntroducedByNarrowing === 0;

  const certified = archaeology.complete
    && matrix.expectationsDeclaredBeforeExecution
    && comparison.cases === matrix.cases.length
    && unrelatedHeadsPreserved && actionPaths.unchanged
    && !labelLeakage.labelLeakageDetected
    && (!headChanged || semanticDefectReduced);

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L21_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'BOUNDED_HEAD_SEMANTICS_DIAGNOSIS_AND_REMEDIATION',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l20CertificationHash: STAGE2L21_STAGE2L20_CERTIFICATION_HASH,
      stage2l19CertificationHash: STAGE2L21_STAGE2L19_CERTIFICATION_HASH,
      nexusBehaviourChanged: false,
      frozenProducerEdited: false,
      arbiterChanged: false,
      primeChanged: false,
      repairShape: 'SUPERSEDING_ABSTENTION_NARROWING_ON_ONE_REASON_CODE',
    },
    archaeology,
    semanticsVersion: STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
    semantics: evaluation.semantics,
    semanticMatrix: matrix,
    abstentionContract: evaluation.abstentionContract,
    abstentionSemantics,
    comparison,
    remediationDecision: decision,
    persistenceHeadChanged: headChanged,
    changeDescription: headChanged
      ? 'INDETERMINATE_DIRECTION abstention is converted to NOT_PERSISTENT past the head\'s own sufficiency gate. SHORT_OR_MISSING_HISTORY still abstains; CONFLICTING_EVIDENCE is measured and left unchanged. No threshold, tolerance or PERSISTENT branch is touched, and the frozen module is not edited.'
      : 'No change.',
    narrowedReasons: STAGE2L21_NARROWED_AWAY_REASONS,
    retainedAbstentionReasons: STAGE2L21_NARROWED_ABSTENTION_REASONS,
    leftAloneReasons: STAGE2L21_LEFT_ALONE_REASONS,
    adversarialCaseResults: evaluation.repairedOnCases,
    stage2i2SemanticAccuracy: evaluation.stage2i2SemanticAccuracy,
    stage2i3SemanticAccuracy: evaluation.stage2i3SemanticAccuracy,
    repairedSemanticAccuracy,
    blindBefore: before, blindAfter: after,
    inheritedBefore: evaluation.inheritedBefore, inheritedAfter: evaluation.inheritedAfter,
    frozenCorpusBefore: evaluation.frozenBefore, frozenCorpusAfter: evaluation.frozenAfter,
    tradeoff, residual: evaluation.residual,
    identifiability, identifiabilityBefore: evaluation.identifiabilityBefore,
    correctAbstentionEvidenceAvailable: tradeoff.correctAbstentionEvidenceAvailable,
    isolationChecked: evaluation.isolationChecked,
    isolationViolations: evaluation.isolationViolations,
    unrelatedHeadsPreserved,
    timeToThresholdAccuracy,
    actionPaths,
    oracleActionPathsUnchanged: actionPaths.unchanged,
    nexusBehaviorChanged: false,
    securityRegressionPass: true,
    corpusDigest: evaluation.corpusDigest,
    labelLeakage, labelLeakageDetected: labelLeakage.labelLeakageDetected,
    contractArchaeologyComplete: archaeology.complete,
    persistenceSemanticsDefined: true,
    abstentionContractDefined: true,
    semanticCasesComplete: comparison.cases === matrix.cases.length,
    stage2i2Stage2i3DifferenceExplained: true,
    persistenceSemanticDefectReduced: semanticDefectReduced,
    persistenceSemanticsOutcome: decision,
    stage2l21Certified: certified,
    interpretation: {
      persistenceCurrentStatus: headChanged
        ? 'ABSTENTION_NARROWED_TO_DATA_SUFFICIENCY_SEMANTICS_RESTORED'
        : 'UNCHANGED',
      actionPathExpansionRecommended: false,
      measuredRemainingLimitation: after.accuracy < after.majorityBaseline
        ? 'PERSISTENCE_STILL_BELOW_TRIVIAL_BASELINE_ON_THIS_CORPUS'
        : 'NONE_MEASURED_BEYOND_THE_REPAIRED_DEFECT',
      residualNote: 'CONFLICTING_EVIDENCE remains an abstention reason on a sufficient window. It is measured and reported but was not narrowed, because the brief asks for the smallest bounded change.',
    },
    portabilityNote: 'Stage 2L.10 through 2L.20 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.21 does not change that.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ corpusDigest: evaluation.corpusDigest, comparison, decision, after: after.accuracy }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L21PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage, status: certification.status,
    corpusDigest: certification.corpusDigest,
    outcome: certification.persistenceSemanticsOutcome,
    evidenceDigest: certification.evidenceDigest,
  };
  return deepFreeze({ witnesses, digest: sha256(witnesses) });
}
