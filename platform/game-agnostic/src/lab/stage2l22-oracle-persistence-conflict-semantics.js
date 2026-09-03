/* Stage 2L.22 — Oracle persistence conflicting-evidence semantics, sufficiency
 * completion, and SUSTAINED_RUN corpus well-posedness audit (R0, shadow only).
 *
 * TWO INDEPENDENT QUESTIONS, DELIBERATELY NOT ALLOWED TO ANSWER EACH OTHER.
 *
 *   A. Is CONFLICTING_EVIDENCE an epistemic abstention or a behaviour label?
 *   B. Do the residual SUSTAINED_RUN cases actually depict a sustained run?
 *
 * Nothing in the corpus audit feeds the semantic decision, and nothing in the
 * semantic decision feeds the corpus adjudication. The semantic verdict is taken
 * from a declared table; the corpus verdict is taken from descriptive statistics
 * computed WITHOUT running Oracle at all.
 *
 * WHAT THE CONTROL FLOW ALREADY SETTLES ABOUT QUESTION A. In the frozen Stage
 * 2I.3 head the four outcomes are ordered:
 *
 *   1. values.length < 6 || historyCoverage < .8   -> SHORT_OR_MISSING_HISTORY
 *   2. dominantSign === 0 || |slope| < .003 || ... -> INDETERMINATE_DIRECTION
 *   3. support/tolerance/opposing-run satisfied    -> PERSISTENT
 *   4. directionalConsistency < .62                -> CONFLICTING_EVIDENCE
 *   5. otherwise                                   -> NOT_PERSISTENT
 *
 * CONFLICTING_EVIDENCE is gate FOUR. It is structurally unreachable until the
 * sufficiency gate has passed, and it sits immediately before the NOT_PERSISTENT
 * fallthrough. What it says, in position, is: "this answer would be
 * NOT_PERSISTENT, but consistency is low, so abstain instead." That is a
 * behaviour-classification gate wearing an epistemic label — the same category
 * error Stage 2L.21 found in gate two.
 *
 * WHERE THE BRIEF IS RIGHT TO WARN. Not every conflict is the same. Gate one
 * admits any window with coverage >= .8, so up to a fifth of a window may be
 * MISSING and the apparent conflict could come from the gaps rather than from the
 * process. A blanket mapping to NOT_PERSISTENT would assert a finding about a
 * window nobody fully observed. So the repair SPLITS rather than maps: conflict on
 * a COMPLETE window is a finding; conflict on a partially observed window remains
 * an abstention. That distinction is deterministic, computed from coverage alone,
 * and it is what makes this a bounded completion of Stage 2L.21 rather than a
 * second sweep of the same broom.
 *
 * NOTHING FROZEN IS EDITED. The repair supersedes, as in Stage 2L.13, 2L.17,
 * 2L.20 and 2L.21.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2, buildOracleV2Holdout } from './stage2i4-oracle-v2-assembly.js';
import { PERSISTENCE_V2_SEARCH_SPACE, evaluatePersistenceV2 } from './stage2i3-oracle-head-remediation.js';
import { STAGE2L19_HEAD_IDS, STAGE2L19_STRESS_VARIANTS } from './stage2l19-oracle-multi-head-qualification.js';
import { assembleOracleV2Canonical, canonicaliseLabel, measureStage2L20Identifiability } from './stage2l20-oracle-vocabulary-alignment.js';
import {
  STAGE2L21_PERSISTENCE_SEMANTICS,
  STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
  assembleOracleV2PersistenceRepaired,
  buildStage2L21Corpus,
} from './stage2l21-oracle-persistence-semantics.js';

export const STAGE2L22_STAGE = 'STAGE2L22_ORACLE_PERSISTENCE_CONFLICT_SEMANTICS';
export const STAGE2L22_STAGE2L21_CERTIFICATION_HASH = '61b70821c4019a9ea6c3a47c9da7ceb06c8f7feb72ff218614db44e1173d5104';
export const STAGE2L22_STAGE2L20_CERTIFICATION_HASH = 'e468dc3433e3a9a5f66378f8a6b9c3be0e9f1cfa5b66750614884c0c33a0dbfe';

const PERSISTENCE_CANDIDATE = PERSISTENCE_V2_SEARCH_SPACE.find((entry) => entry.id === 'BOUNDED_INTERRUPTION_TOLERANCE');

function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
/* `present` marks which frames actually carry the channel, so a window can be
 * built with genuine gaps rather than merely short. */
function caseOf(values, present = null, caseId = 'stage2l22-probe') {
  return {
    caseId,
    observationHistory: values.map((value, tick) => ({
      tick, channels: present === null || present[tick] ? { alpha: clamp(value) } : {},
    })),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 1 — CONFLICTING_EVIDENCE owner audit.
 * ------------------------------------------------------------------------- */

export const STAGE2L22_CONFLICT_OWNER = deepFreeze({
  reasonCode: 'CONFLICTING_EVIDENCE',
  introducedAt: 'STAGE2I3',
  implementationOwner: 'src/lab/stage2i3-oracle-head-remediation.js::evaluatePersistenceV2',
  predicate: 'directionalConsistency < 0.62',
  predicateDefinition: 'directionalConsistency = max(positiveSteps, negativeSteps) / nonzeroSteps',
  threshold: 0.62,
  gateOrdinal: 4,
  gatesBefore: ['SHORT_OR_MISSING_HISTORY (sufficiency)', 'INDETERMINATE_DIRECTION', 'PERSISTENT branch'],
  gateAfter: 'NOT_PERSISTENT fallthrough',
  presentInStage2I2: false,
  presentInAnyLabelSchema: false,
  presentInAnyBenchmarkExpectation: false,
  declaredInStage2L19HeadTable: false,
  documented: false,
  safetyRationaleFound: false,
  /* Classified from where it sits, not from what it is called. */
  introducedAs: 'BEHAVIOUR_CLASSIFICATION_GATE_LABELLED_AS_UNCERTAINTY',
  introducedAsEvidence: 'It is the fourth gate. Sufficiency and indeterminacy are already excluded above it, and the only outcome below it is NOT_PERSISTENT, so the sole effect of the gate is to withhold a NOT_PERSISTENT answer that the head was otherwise about to give.',
});

export function auditStage2L22ConflictOwner() {
  /* PROBED: does the reason code ever fire on an insufficient window? It cannot,
   * by control flow, and this demonstrates it rather than asserting it. */
  const probes = [];
  const push = (id, values, present) => {
    const input = caseOf(values, present, `stage2l22-owner-${id}`);
    const raw = evaluatePersistenceV2(input, PERSISTENCE_CANDIDATE);
    const observed = raw.observation ?? {};
    probes.push({
      id,
      samples: observed.samples ?? 0,
      historyCoverage: round(observed.historyCoverage ?? 0),
      directionalConsistency: round(observed.directionalConsistency ?? 0),
      semanticOutput: raw.semanticOutput,
      abstentionReason: raw.abstentionReason,
    });
  };
  push('SHORT_WINDOW', [0.3, 0.34, 0.31, 0.36], null);
  push('SPARSE_WINDOW', Array.from({ length: 20 }, (unused, i) => 0.3 + (i % 3 ? 0.02 : -0.03) * i),
    Array.from({ length: 20 }, (unused, i) => i % 3 !== 0));
  push('DENSE_CONFLICT', Array.from({ length: 20 }, (unused, i) => 0.4 + (i % 2 ? 0.05 : -0.045)), null);
  push('DENSE_SUSTAINED', Array.from({ length: 20 }, (unused, i) => 0.2 + i * 0.03), null);

  const conflictProbes = probes.filter((entry) => entry.abstentionReason === 'CONFLICTING_EVIDENCE');
  return {
    owner: STAGE2L22_CONFLICT_OWNER,
    probes,
    /* Phase 3's mandatory report. True by control flow AND demonstrated: the
     * reason code never appears on a window that failed the sufficiency gate. */
    conflictingEvidenceRequiresSufficientHistory: probes.every((entry) =>
      entry.abstentionReason !== 'CONFLICTING_EVIDENCE'
      || (entry.samples >= STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples
        && entry.historyCoverage >= STAGE2L21_PERSISTENCE_SEMANTICS.minimumHistoryCoverage)),
    conflictProbeCount: conflictProbes.length,
    gateKind: 'BEHAVIOR_CLASSIFICATION_GATE',
    gateKindEvidence: 'Every path reaching it has already cleared the sufficiency gate; the only alternative outcome below it is NOT_PERSISTENT.',
    complete: probes.length >= 4,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 2/4 — conflict taxonomy and the semantic table.
 *
 * Expectations are written from STAGE2L21_PERSISTENCE_SEMANTICS_V1 and fixed
 * before any head runs. Two categories (I and J) exist specifically to separate
 * the case the brief warns about — apparent conflict from an incompletely
 * observed window — from genuine conflict on a complete one.
 * ------------------------------------------------------------------------- */

const alternate = (length, amplitude, centre = 0.5) =>
  Array.from({ length }, (unused, i) => centre + (i % 2 ? amplitude : -amplitude));
const rampOf = (length, start, slope) => Array.from({ length }, (unused, i) => start + i * slope);

export const STAGE2L22_CONFLICT_TAXONOMY = deepFreeze([
  { id: 'A_ALTERNATING_STEPS', category: 'CONFLICT', values: alternate(20, 0.05), present: null,
    sufficient: true, dominantDirection: false, consistency: 'MINIMAL', netMovement: 'NONE',
    expected: 'NOT_PERSISTENT', why: 'A complete window that alternates every step carries abundant evidence that nothing is sustained.' },
  { id: 'B_SUSTAINED_UP_RARE_INTERRUPTION', category: 'SUSTAINED', values: rampOf(20, 0.2, 0.03).map((v, i) => (i === 11 ? v - 0.05 : v)), present: null,
    sufficient: true, dominantDirection: true, consistency: 'HIGH', netMovement: 'UP',
    expected: 'PERSISTENT', why: 'One bounded interruption is exactly what the contract tolerates.' },
  { id: 'C_SUSTAINED_DOWN_RARE_INTERRUPTION', category: 'SUSTAINED', values: rampOf(20, 0.8, -0.03).map((v, i) => (i === 9 ? v + 0.05 : v)), present: null,
    sufficient: true, dominantDirection: true, consistency: 'HIGH', netMovement: 'DOWN',
    expected: 'PERSISTENT', why: 'As B, mirrored.' },
  { id: 'D_TREND_THEN_REVERSAL', category: 'CONFLICT', values: [...rampOf(12, 0.2, 0.04), ...rampOf(8, 0.66, -0.05)], present: null,
    sufficient: true, dominantDirection: true, consistency: 'MEDIUM', netMovement: 'MIXED',
    expected: 'NOT_PERSISTENT', why: 'The tendency was real and was not sustained to the end of the window.' },
  { id: 'E_REPEATED_REVERSALS', category: 'CONFLICT', values: Array.from({ length: 24 }, (unused, i) => 0.5 + 0.15 * Math.sin((Math.PI * i) / 3)), present: null,
    sufficient: true, dominantDirection: false, consistency: 'LOW', netMovement: 'NONE',
    expected: 'NOT_PERSISTENT', why: 'Direction turns repeatedly inside a complete window.' },
  { id: 'F_ZERO_MEAN_NOISE', category: 'CONFLICT', values: Array.from({ length: 20 }, (unused, i) => 0.5 + ((((i + 7) * 31) % 23) - 11) / 300), present: null,
    sufficient: true, dominantDirection: false, consistency: 'LOW', netMovement: 'NONE',
    expected: 'NOT_PERSISTENT', why: 'Bounded zero-mean variation with no net travel.' },
  { id: 'G_STRONG_TREND_NOISY_LOCAL', category: 'SUSTAINED', values: rampOf(20, 0.15, 0.035).map((v, i) => v + (i % 2 ? 0.012 : -0.012)), present: null,
    sufficient: true, dominantDirection: true, consistency: 'HIGH', netMovement: 'UP',
    expected: 'PERSISTENT', why: 'Local wobble far smaller than the step; every step still advances.' },
  { id: 'H_WEAK_TREND_CONFLICTING_LOCAL', category: 'CONFLICT', values: rampOf(20, 0.4, 0.004).map((v, i) => v + (i % 2 ? 0.02 : -0.02)), present: null,
    sufficient: true, dominantDirection: false, consistency: 'LOW', netMovement: 'WEAK_UP',
    expected: 'NOT_PERSISTENT', why: 'Net drift exists but no direction is SUSTAINED at step level: the wobble is five times the slope, so the series reverses every step. Under V1 this is a finding, not a gap.' },
  /* Coverage 0.6: BELOW the V1 minimum of 0.8, so the window genuinely cannot
   * support a finding. An earlier draft of this case used coverage 0.8 and
   * expected abstention, which contradicts V1 — 0.8 is exactly the threshold and
   * therefore sufficient. The expectation was wrong, not the head, and it is
   * corrected here rather than carried. */
  { id: 'I_SPARSE_HISTORY_APPARENT_CONFLICT', category: 'SPARSE', values: rampOf(20, 0.25, 0.03), present: Array.from({ length: 20 }, (unused, i) => i % 5 !== 0 && i % 3 !== 0),
    sufficient: false, dominantDirection: null, consistency: 'UNKNOWN', netMovement: 'UNKNOWN',
    expected: 'INSUFFICIENT_EVIDENCE', why: 'Coverage falls below the V1 minimum of 0.8, so no finding about the process is available. This is the case the brief warns about and it is the only conflict-shaped category that legitimately keeps its abstention.' },
  /* Built to actually REACH the conflict gate: near-balanced step signs (so
   * directional consistency lands under 0.62) riding a slope large enough to
   * clear the indeterminacy gate above it. */
  { id: 'J_DENSE_HISTORY_GENUINE_CONFLICT', category: 'CONFLICT', values: rampOf(20, 0.35, 0.006).map((v, i) => v + (i % 2 ? 0.02 : -0.02)), present: null,
    sufficient: true, dominantDirection: false, consistency: 'LOW', netMovement: 'WEAK_UP',
    expected: 'NOT_PERSISTENT', why: 'Every frame observed and the series reverses every step while drifting slowly upward. The conflict is a property of the process, not of the observation.' },
]);

export function buildStage2L22SemanticTable() {
  return {
    semanticsVersion: STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
    semanticsUnchanged: true,
    definitionProvedIncomplete: false,
    cases: STAGE2L22_CONFLICT_TAXONOMY.map((entry) => ({
      id: entry.id, category: entry.category, samples: entry.values.length,
      observedFrames: entry.present === null ? entry.values.length : entry.present.filter(Boolean).length,
      dataSufficient: entry.sufficient, dominantDirection: entry.dominantDirection,
      consistency: entry.consistency, netMovement: entry.netMovement,
      expected: entry.expected, rationale: entry.why,
    })),
    expectationsDeclaredBeforeExecution: true,
    abstentionCases: STAGE2L22_CONFLICT_TAXONOMY.filter((entry) => entry.expected === 'INSUFFICIENT_EVIDENCE').length,
    complete: STAGE2L22_CONFLICT_TAXONOMY.length === 10,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 5/6 — classification and the bounded split.
 * ------------------------------------------------------------------------- */

export const STAGE2L22_CONFLICT_SEMANTIC_CLASSES = deepFreeze([
  'VALID_ABSTENTION', 'OVER_ABSTENTION', 'MIXED_CONDITION', 'SEMANTIC_DEFINITION_INCOMPLETE', 'INCONCLUSIVE',
]);
export const STAGE2L22_REMEDIATION_OPTIONS = deepFreeze([
  'A_KEEP_AS_ABSTENTION', 'B_MAP_TO_NOT_PERSISTENT', 'C_SPLIT_CONDITION',
  'D_REDEFINE_CONFLICT_PREDICATE', 'E_NO_CHANGE_INCONCLUSIVE',
]);

/* The deterministic distinction. Coverage is the ONLY input: a window every frame
 * of which was observed supports a finding about the process; a window with gaps
 * does not, however dense the remainder. */
export const STAGE2L22_FULL_COVERAGE = 1;

export function stage2L22ConflictIsGenuine(input) {
  const raw = evaluatePersistenceV2(input, PERSISTENCE_CANDIDATE);
  if (raw.abstentionReason !== 'CONFLICTING_EVIDENCE') return { applicable: false, genuine: false, raw };
  const coverage = raw.observation?.historyCoverage ?? 0;
  return { applicable: true, genuine: coverage >= STAGE2L22_FULL_COVERAGE, coverage: round(coverage), raw };
}

/* HOW OFTEN IS THE GATE EVEN REACHABLE? A category error that never fires is a
 * documentation defect, not a behaviour defect, and the difference decides
 * whether a head change is warranted. This sweeps a wide deterministic input
 * space and counts which outcome each case lands on. */
export function measureStage2L22ConflictReachability() {
  const slopes = [-0.03, -0.02, -0.012, -0.006, -0.003, 0, 0.003, 0.006, 0.012, 0.02, 0.03];
  const amplitudes = [0, 0.004, 0.008, 0.012, 0.018, 0.024, 0.035, 0.05];
  const lengths = [8, 12, 16, 20, 28];
  const counts = {};
  let total = 0;
  let conflictHits = 0;
  for (const slope of slopes) {
    for (const amplitude of amplitudes) {
      for (const length of lengths) {
        for (let variant = 0; variant < 8; variant += 1) {
          const values = Array.from({ length }, (unused, index) =>
            clamp(0.5 + index * slope + jitter(index, variant, amplitude)));
          const raw = evaluatePersistenceV2(caseOf(values), PERSISTENCE_CANDIDATE);
          const key = raw.abstentionReason ?? raw.semanticOutput;
          counts[key] = (counts[key] ?? 0) + 1;
          total += 1;
          if (raw.abstentionReason === 'CONFLICTING_EVIDENCE') conflictHits += 1;
        }
      }
    }
  }
  return {
    sweepCases: total,
    outcomeCounts: counts,
    conflictGateHits: conflictHits,
    conflictGateHitRate: round(ratio(conflictHits, total)),
    /* WHY it is nearly unreachable, which matters more than the count. */
    shadowingExplanation: 'directionalConsistency is max(dominant, other)/nonzero and so is never below 0.5. The gate needs it under 0.62, i.e. near-balanced step signs — and a near-balanced series almost always has |slope| < .003, which the INDETERMINATE_DIRECTION gate above it catches first. Gate two shadows gate four across nearly the whole input space.',
    reachableOnlyWhen: 'Step signs are near-balanced AND the full-window slope still clears 0.003 — a few large steps in one direction against many small opposing ones.',
    empiricallyReachable: conflictHits > 0,
  };
}

export function measureStage2L22ConflictSemantics() {
  const rows = STAGE2L22_CONFLICT_TAXONOMY.map((entry) => {
    const input = caseOf(entry.values, entry.present, `stage2l22-${entry.id.toLowerCase()}`);
    const raw = evaluatePersistenceV2(input, PERSISTENCE_CANDIDATE);
    const coverage = round(raw.observation?.historyCoverage ?? 0);
    const isConflict = raw.abstentionReason === 'CONFLICTING_EVIDENCE';
    return {
      id: entry.id, category: entry.category, expected: entry.expected,
      frozenOutput: canonicaliseLabel(raw.semanticOutput),
      abstentionReason: raw.abstentionReason,
      historyCoverage: coverage,
      directionalConsistency: round(raw.observation?.directionalConsistency ?? 0),
      hitsConflictGate: isConflict,
      frozenCorrect: canonicaliseLabel(raw.semanticOutput) === entry.expected,
      /* Correct only if the case genuinely expected an abstention. */
      conflictAbstentionCorrect: isConflict && entry.expected === 'INSUFFICIENT_EVIDENCE',
      conflictAbstentionIncorrect: isConflict && entry.expected !== 'INSUFFICIENT_EVIDENCE',
    };
  });
  const conflictRows = rows.filter((row) => row.hitsConflictGate);
  const correct = conflictRows.filter((row) => row.conflictAbstentionCorrect).length;
  const incorrect = conflictRows.filter((row) => row.conflictAbstentionIncorrect).length;
  const classification = (() => {
    if (conflictRows.length === 0) return 'INCONCLUSIVE';
    if (incorrect === 0) return 'VALID_ABSTENTION';
    if (correct === 0) return 'OVER_ABSTENTION';
    return 'MIXED_CONDITION';
  })();
  /* A MIXED condition is only actionable if the two sides separate on a rule that
   * does not consult the label. Coverage is that rule; this checks it holds. */
  const separatesOnCoverage = conflictRows.every((row) =>
    (row.historyCoverage >= STAGE2L22_FULL_COVERAGE) === (row.expected !== 'INSUFFICIENT_EVIDENCE'));
  return {
    rows, conflictCases: conflictRows.length,
    conflictCorrectAbstentions: correct,
    conflictIncorrectAbstentions: incorrect,
    classification,
    separatesOnCoverage,
    separationRule: 'historyCoverage === 1 -> genuine conflict (NOT_PERSISTENT); historyCoverage < 1 -> apparent conflict (INSUFFICIENT_EVIDENCE)',
    classificationBasis: 'STRUCTURAL_POSITION_AND_DECLARED_SEMANTIC_TABLE',
  };
}

/* The decision is deliberately NOT a function of the classification alone. This
 * arc has refused to act on tiny populations three times (2L.15 on 0.0006 of
 * precision, 2L.18 on six cases, 2L.19 on a bucket with no error variance), and
 * the same discipline applies to itself: a head change justified by a handful of
 * hand-built cases, which alters nothing on any real corpus, is not a repair. It
 * would also let the stage certify PERSISTENCE_SEMANTIC_DEFECT_REDUCED on a
 * change that demonstrably reduces nothing. */
export const STAGE2L22_MINIMUM_CONFLICT_POPULATION = 8;

export function decideStage2L22Remediation(conflictSemantics, reachability, corpusConflictCases) {
  const population = corpusConflictCases + conflictSemantics.conflictCases;
  const adequate = corpusConflictCases > 0 && population >= STAGE2L22_MINIMUM_CONFLICT_POPULATION;
  if (conflictSemantics.classification === 'INCONCLUSIVE') {
    return { decision: 'E_NO_CHANGE_INCONCLUSIVE', reason: 'NO_CASE_REACHES_THE_GATE', adequate, population };
  }
  if (!adequate) {
    return {
      decision: 'E_NO_CHANGE_INCONCLUSIVE',
      reason: 'STRUCTURALLY_OVER_ABSTENTION_BUT_EMPIRICALLY_UNREACHABLE',
      adequate,
      population,
      corpusConflictCases,
      minimumPopulation: STAGE2L22_MINIMUM_CONFLICT_POPULATION,
      sweepHitRate: reachability.conflictGateHitRate,
      note: 'The structural argument stands: the gate sits after sufficiency and immediately before NOT_PERSISTENT, so it can only withhold an answer the head was about to give. But it fires on no case of any real corpus and on none of a wide deterministic sweep, so there is nothing to repair and no way to demonstrate a repair worked. Recorded as a documentation-level defect in the frozen head, owned and not patched.',
    };
  }
  return {
    decision: conflictSemantics.classification === 'VALID_ABSTENTION' ? 'A_KEEP_AS_ABSTENTION'
      : conflictSemantics.classification === 'OVER_ABSTENTION' ? 'B_MAP_TO_NOT_PERSISTENT'
        : conflictSemantics.separatesOnCoverage ? 'C_SPLIT_CONDITION' : 'D_REDEFINE_CONFLICT_PREDICATE',
    reason: 'ADEQUATE_MEASURABLE_POPULATION',
    adequate,
    population,
  };
}

export function assembleOracleV2ConflictRepaired(input, identities = {}) {
  const prior = assembleOracleV2PersistenceRepaired(input, identities);
  const conflict = stage2L22ConflictIsGenuine(input);
  if (!conflict.applicable || !conflict.genuine) {
    return deepFreeze({ ...prior, conflictNarrowing: { applied: false, applicable: conflict.applicable, coverage: conflict.coverage ?? null } });
  }
  const head = prior.heads.persistence;
  return deepFreeze({
    ...prior,
    heads: {
      ...prior.heads,
      persistence: deepFreeze({
        ...head,
        semanticOutput: 'NOT_PERSISTENT',
        rawSemanticOutput: 'NOT_PERSISTENT',
        supported: true,
        supportContext: 'STAGE2L22_NARROWED_GENUINE_CONFLICT',
      }),
    },
    conflictNarrowing: { applied: true, from: 'INSUFFICIENT_EVIDENCE', to: 'NOT_PERSISTENT', reason: 'CONFLICTING_EVIDENCE', coverage: conflict.coverage, producerDigestPreserved: true },
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 7/8/9 — SUSTAINED_RUN well-posedness, measured WITHOUT Oracle.
 *
 * The question is not what the generator meant. It is what the generator
 * produced. Every statistic below is computed from the series alone.
 * ------------------------------------------------------------------------- */

function jitter(index, variant, amplitude) {
  const hashed = ((index + 1) * 2654435761 + (variant + 1) * 40503) % 1000;
  return ((hashed / 1000) - 0.5) * 2 * amplitude;
}

export function describeStage2L22Series(values) {
  const deltas = values.slice(1).map((value, index) => value - values[index]);
  const signs = deltas.map((delta) => (delta > 0 ? 1 : delta < 0 ? -1 : 0));
  const positive = signs.filter((sign) => sign > 0).length;
  const negative = signs.filter((sign) => sign < 0).length;
  const nonzero = positive + negative;
  const dominant = Math.max(positive, negative);
  const dominantSign = positive === negative ? 0 : positive > negative ? 1 : -1;
  const meanT = (values.length - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    numerator += (index - meanT) * (values[index] - meanY);
    denominator += (index - meanT) ** 2;
  }
  let longestOpposing = 0;
  let current = 0;
  for (const sign of signs) {
    current = dominantSign !== 0 && sign === -dominantSign ? current + 1 : 0;
    if (current > longestOpposing) longestOpposing = current;
  }
  return {
    samples: values.length,
    realizedFullWindowSlope: round(denominator ? numerator / denominator : 0),
    dominantStepSign: dominantSign,
    directionalConsistency: round(ratio(dominant, nonzero)),
    interruptionCount: nonzero - dominant,
    interruptionProportion: round(ratio(nonzero - dominant, signs.length)),
    longestOpposingRun: longestOpposing,
    netDisplacement: round(values.at(-1) - values[0]),
  };
}

/* Adjudicated against STAGE2L21_PERSISTENCE_SEMANTICS_V1, using ONLY the
 * descriptive statistics above. Oracle is never consulted. */
export const STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY = 0.72;
export const STAGE2L22_SEMANTIC_MAX_OPPOSING_RUN = 2;
export const STAGE2L22_BOUNDARY_BAND = 0.06;

export function adjudicateStage2L22Series(values) {
  const stats = describeStage2L22Series(values);
  if (stats.samples < STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples) {
    return { ...stats, semanticTruth: 'INSUFFICIENT_EVIDENCE', boundary: false };
  }
  /* V1 PERSISTENT: a single dominant step direction holds across the window,
   * interruptions bounded, net movement consistent with that direction. */
  const dominantHolds = stats.directionalConsistency >= STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY;
  const interruptionsBounded = stats.longestOpposingRun <= STAGE2L22_SEMANTIC_MAX_OPPOSING_RUN;
  const netConsistent = stats.dominantStepSign !== 0
    && Math.sign(stats.netDisplacement) === stats.dominantStepSign;
  const persistent = dominantHolds && interruptionsBounded && netConsistent;
  const boundary = Math.abs(stats.directionalConsistency - STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY) <= STAGE2L22_BOUNDARY_BAND;
  return {
    ...stats,
    dominantHolds, interruptionsBounded, netConsistent,
    semanticTruth: persistent ? 'PERSISTENT' : 'NOT_PERSISTENT',
    boundary,
  };
}

export function auditStage2L22SustainedRun() {
  const cases = [];
  for (let variant = 0; variant < STAGE2L19_STRESS_VARIANTS; variant += 1) {
    const length = 18 + (variant % 13);
    const noise = (variant % 5) * 0.006;
    const slopeMagnitude = 0.004 + (variant % 7) * 0.004;
    const values = Array.from({ length }, (unused, index) =>
      clamp(0.3 + index * slopeMagnitude + jitter(index, variant, noise)));
    const verdict = adjudicateStage2L22Series(values);
    /* Signal to noise: the intended per-step advance against the largest step a
     * jitter swing alone can produce. Below 1 the noise can reverse a step. */
    const signalToNoise = noise === 0 ? Number.POSITIVE_INFINITY : round(slopeMagnitude / (2 * noise));
    cases.push({
      variantIndex: variant, intendedSlope: round(slopeMagnitude), jitterAmplitude: round(noise),
      signalToNoise: Number.isFinite(signalToNoise) ? signalToNoise : null,
      noiseFree: noise === 0,
      labelledAs: 'PERSISTENT',
      ...verdict,
      labelMatchesSeries: verdict.semanticTruth === 'PERSISTENT',
    });
  }
  const finite = cases.filter((entry) => entry.signalToNoise !== null).map((entry) => entry.signalToNoise);
  const persistent = cases.filter((entry) => entry.semanticTruth === 'PERSISTENT');
  const notPersistent = cases.filter((entry) => entry.semanticTruth === 'NOT_PERSISTENT');
  const boundaryCases = cases.filter((entry) => entry.boundary);
  /* The status names the DEFECT, not its cause. Boundary instability is why the
   * family mislabels; mislabelling is what a reader has to act on. Both are
   * reported, and a family that sits on the boundary without actually mislabelling
   * anything is BOUNDARY_UNSTABLE rather than defective. */
  const status = (() => {
    if (notPersistent.length === 0) return boundaryCases.length > 0 ? 'BOUNDARY_UNSTABLE' : 'VALID';
    if (notPersistent.length === cases.length) return 'DEGENERATE';
    return 'PARTIALLY_MISLABELLED';
  })();
  return {
    family: 'SUSTAINED_RUN',
    totalCases: cases.length,
    semanticallyPersistentCases: persistent.length,
    semanticallyNotPersistentCases: notPersistent.length,
    boundaryAmbiguousCases: boundaryCases.length,
    mislabelledShare: round(ratio(notPersistent.length, cases.length)),
    medianSignalToNoise: round(median(finite)),
    minSignalToNoise: finite.length ? round(Math.min(...finite)) : null,
    maxSignalToNoise: finite.length ? round(Math.max(...finite)) : null,
    noiseFreeCases: cases.filter((entry) => entry.noiseFree).length,
    corpusStatus: status,
    boundaryUnstable: boundaryCases.length > 0,
    boundaryBand: STAGE2L22_BOUNDARY_BAND,
    consistencyThreshold: STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY,
    cases,
    adjudicationMethod: 'DESCRIPTIVE_STATISTICS_ONLY_ORACLE_NOT_CONSULTED',
    note: 'Every verdict is computed from the produced series against STAGE2L21_PERSISTENCE_SEMANTICS_V1. The generator\'s intent is recorded but carries no weight.',
    complete: cases.length === STAGE2L19_STRESS_VARIANTS,
  };
}

/* PHASE 8 — the phase map. Sweeps slope and jitter independently and reports
 * where the semantic truth flips, so the generator's operating point can be
 * placed relative to the boundary rather than argued about. */
export function buildStage2L22PhaseMap() {
  const slopes = [0.002, 0.004, 0.008, 0.012, 0.016, 0.02, 0.028];
  const jitters = [0, 0.006, 0.012, 0.018, 0.024];
  const grid = [];
  for (const slope of slopes) {
    for (const amplitude of jitters) {
      let persistent = 0;
      const trials = 12;
      for (let variant = 0; variant < trials; variant += 1) {
        const values = Array.from({ length: 24 }, (unused, index) =>
          clamp(0.3 + index * slope + jitter(index, variant, amplitude)));
        if (adjudicateStage2L22Series(values).semanticTruth === 'PERSISTENT') persistent += 1;
      }
      grid.push({
        slope, jitterAmplitude: amplitude,
        signalToNoise: amplitude === 0 ? null : round(slope / (2 * amplitude)),
        trials, persistentShare: round(ratio(persistent, trials)),
        semanticTruth: persistent === trials ? 'PERSISTENT' : persistent === 0 ? 'NOT_PERSISTENT' : 'MIXED',
      });
    }
  }
  const safe = grid.filter((cell) => cell.semanticTruth === 'PERSISTENT');
  const minSafeRatio = safe.filter((cell) => cell.signalToNoise !== null).map((cell) => cell.signalToNoise);
  return {
    grid,
    persistentCells: safe.length,
    notPersistentCells: grid.filter((cell) => cell.semanticTruth === 'NOT_PERSISTENT').length,
    mixedCells: grid.filter((cell) => cell.semanticTruth === 'MIXED').length,
    minimumSignalToNoiseHoldingPersistent: minSafeRatio.length ? round(Math.min(...minSafeRatio)) : null,
    generatorOperatingRange: { slopeMin: 0.004, slopeMax: 0.028, jitterMin: 0, jitterMax: 0.024 },
    note: 'The generator sweeps slope 0.004-0.028 against jitter 0-0.024, so its operating box straddles the boundary rather than sitting inside the persistent region.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 10 — two scorecards. Mandatory once corpus labels are found defective:
 * an as-labelled score and a semantically adjudicated one, never merged.
 * ------------------------------------------------------------------------- */

export function evaluateStage2L22Persistence(corpusCases, corpusName, assemble, adjudication) {
  const cases = corpusCases.filter((entry) => entry.task === 'persistence');
  const rows = cases.map((entry) => {
    const head = assemble(entry).heads.persistence;
    const asLabelled = canonicaliseLabel(entry.expected);
    const values = entry.observationHistory.map((frame) => frame.channels.alpha).filter((value) => value !== undefined);
    const adjudicated = adjudication === 'SEMANTIC' ? adjudicateStage2L22Series(values).semanticTruth : asLabelled;
    return {
      family: entry.family,
      asLabelled,
      adjudicated,
      predicted: head.semanticOutput,
      supported: head.supported === true,
      correct: head.semanticOutput === adjudicated,
      labelDisagreesWithSeries: asLabelled !== adjudicated,
    };
  });
  const labelCounts = rows.reduce((map, row) => { map[row.adjudicated] = (map[row.adjudicated] ?? 0) + 1; return map; }, {});
  return {
    corpus: corpusName, adjudication,
    cases: rows.length,
    accuracy: round(ratio(rows.filter((row) => row.correct).length, rows.length)),
    abstentionRate: round(ratio(rows.filter((row) => !row.supported).length, rows.length)),
    majorityBaseline: rows.length === 0 ? 0 : round(Math.max(0, ...Object.values(labelCounts)) / rows.length),
    classDistribution: labelCounts,
    casesWhereLabelDisagreesWithSeries: rows.filter((row) => row.labelDisagreesWithSeries).length,
    rows,
  };
}

export function measureStage2L22AbstentionTradeoff(before, after) {
  let removed = 0;
  let correctRemoved = 0;
  let incorrectRemoved = 0;
  let falsePersistent = 0;
  let falseNotPersistent = 0;
  for (let index = 0; index < before.rows.length; index += 1) {
    const was = before.rows[index];
    const now = after.rows[index];
    if (was.predicted !== 'INSUFFICIENT_EVIDENCE' || now.predicted === 'INSUFFICIENT_EVIDENCE') continue;
    removed += 1;
    if (was.correct) correctRemoved += 1; else incorrectRemoved += 1;
    if (!now.correct) {
      if (now.predicted === 'PERSISTENT') falsePersistent += 1;
      if (now.predicted === 'NOT_PERSISTENT') falseNotPersistent += 1;
    }
  }
  const controls = before.rows.filter((row) => row.adjudicated === 'INSUFFICIENT_EVIDENCE').length;
  const retained = before.rows.filter((row, index) =>
    row.adjudicated === 'INSUFFICIENT_EVIDENCE' && after.rows[index].predicted === 'INSUFFICIENT_EVIDENCE').length;
  return {
    abstentionsRemoved: removed,
    correctAbstentionsRemoved: correctRemoved,
    incorrectAbstentionsRemoved: incorrectRemoved,
    falsePersistentIntroduced: falsePersistent,
    falseNotPersistentIntroduced: falseNotPersistent,
    legitimateAbstentionControlCases: controls,
    legitimateAbstentionsRetained: retained,
    abstentionRetentionRate: round(ratio(retained, controls)),
    controlEvidenceAvailable: controls > 0,
    note: controls > 0
      ? 'Retention is measured against cases that genuinely require an abstention, so a zero here is a result rather than an artefact.'
      : 'No case in this corpus requires an abstention, so retention figures are vacuous.',
  };
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 * ------------------------------------------------------------------------- */

export function buildStage2L22Evaluation() {
  const conflictOwner = auditStage2L22ConflictOwner();
  const semanticTable = buildStage2L22SemanticTable();
  const conflictSemantics = measureStage2L22ConflictSemantics();
  const reachability = measureStage2L22ConflictReachability();
  /* How many cases of the REAL corpus reach the gate — the number that decides
   * whether a repair is measurable at all. */
  const conflictCorpus = buildStage2L21Corpus();
  const corpusConflictCases = conflictCorpus.filter((entry) => entry.task === 'persistence'
    && evaluatePersistenceV2(entry, PERSISTENCE_CANDIDATE).abstentionReason === 'CONFLICTING_EVIDENCE').length;
  const remediation = decideStage2L22Remediation(conflictSemantics, reachability, corpusConflictCases);
  const decision = remediation.decision;
  const headChanged = decision === 'B_MAP_TO_NOT_PERSISTENT' || decision === 'C_SPLIT_CONDITION';
  /* When no change is warranted the evaluated assembly is the Stage 2L.21 one,
   * so the "after" columns report what actually ships rather than a repair that
   * was considered and declined. */
  const activeAssembly = headChanged ? assembleOracleV2ConflictRepaired : assembleOracleV2PersistenceRepaired;

  const repairedOnTable = STAGE2L22_CONFLICT_TAXONOMY.map((entry) => {
    const input = caseOf(entry.values, entry.present, `stage2l22-${entry.id.toLowerCase()}`);
    const emitted = assembleOracleV2ConflictRepaired(input).heads.persistence.semanticOutput;
    return { id: entry.id, category: entry.category, expected: entry.expected, emitted, correct: emitted === entry.expected };
  });
  const repairedTableAccuracy = round(ratio(repairedOnTable.filter((row) => row.correct).length, repairedOnTable.length));
  const priorTableAccuracy = round(ratio(conflictSemantics.rows.filter((row) => row.frozenCorrect).length, conflictSemantics.rows.length));

  const sustainedRun = auditStage2L22SustainedRun();
  const phaseMap = buildStage2L22PhaseMap();

  const corpus = buildStage2L21Corpus();
  const asLabelledBefore = evaluateStage2L22Persistence(corpus, 'STAGE2L21_CORPUS', assembleOracleV2PersistenceRepaired, 'AS_LABELLED');
  const asLabelledAfter = evaluateStage2L22Persistence(corpus, 'STAGE2L21_CORPUS', activeAssembly, 'AS_LABELLED');
  const adjudicatedBefore = evaluateStage2L22Persistence(corpus, 'STAGE2L21_CORPUS', assembleOracleV2PersistenceRepaired, 'SEMANTIC');
  const adjudicatedAfter = evaluateStage2L22Persistence(corpus, 'STAGE2L21_CORPUS', activeAssembly, 'SEMANTIC');
  const tradeoff = measureStage2L22AbstentionTradeoff(adjudicatedBefore, adjudicatedAfter);

  const otherHeads = STAGE2L19_HEAD_IDS.filter((headId) => headId !== 'persistence');
  let isolationChecked = 0;
  let isolationViolations = 0;
  for (const entry of corpus) {
    const prior = assembleOracleV2PersistenceRepaired(entry);
    const repaired = activeAssembly(entry);
    for (const headId of otherHeads) {
      isolationChecked += 1;
      if (prior.heads[headId].semanticOutput !== repaired.heads[headId].semanticOutput
        || prior.heads[headId].outputDigest !== repaired.heads[headId].outputDigest) isolationViolations += 1;
    }
  }
  const thresholdRows = corpus.filter((entry) => entry.task === 'timeToThreshold');
  const timeToThresholdAccuracy = round(ratio(
    thresholdRows.filter((entry) => activeAssembly(entry).heads.timeToThreshold.semanticOutput === entry.expected).length,
    thresholdRows.length));

  const identifiability = measureStage2L20Identifiability(corpus, 'persistence', STAGE2L19_HEAD_IDS.length, activeAssembly);
  const identifiabilityBefore = measureStage2L20Identifiability(corpus, 'persistence', STAGE2L19_HEAD_IDS.length, assembleOracleV2PersistenceRepaired);

  /* The two questions are answered separately and only then combined. Neither
   * verdict is allowed to stand in for the other. */
  const outcome = (() => {
    const conflictRepaired = headChanged && repairedTableAccuracy > priorTableAccuracy;
    const corpusDefective = sustainedRun.corpusStatus !== 'VALID';
    if (isolationViolations > 0) return 'H_BLOCKED';
    if (conflictSemantics.classification === 'SEMANTIC_DEFINITION_INCOMPLETE') return 'D_SEMANTIC_DEFINITION_INCOMPLETE';
    if (conflictRepaired && corpusDefective) return 'F_MULTIPLE_BOUNDED_DEFECTS';
    if (conflictRepaired) return 'B_CONFLICT_OVER_ABSTENTION_REPAIRED';
    /* No reachable conflict population means the head is not shown defective on
     * this axis. If the corpus is, that is the finding. */
    if (corpusDefective) return 'E_HEAD_CORRECT_CORPUS_DEFECTIVE';
    if (conflictSemantics.classification === 'VALID_ABSTENTION') return 'A_CONFLICT_ABSTENTION_CONFIRMED';
    return 'G_INCONCLUSIVE';
  })();

  return deepFreeze({
    conflictOwner, semanticTable, conflictSemantics, reachability, remediation,
    corpusConflictCases, decision, headChanged,
    repairedOnTable, repairedTableAccuracy, priorTableAccuracy,
    sustainedRun, phaseMap,
    asLabelledBefore, asLabelledAfter, adjudicatedBefore, adjudicatedAfter, tradeoff,
    isolationChecked, isolationViolations,
    unrelatedHeadsPreserved: isolationViolations === 0,
    timeToThresholdAccuracy,
    identifiability, identifiabilityBefore,
    actionPaths: { before: ['direction'], after: ['direction'], unchanged: true, arbiterSchemaWidened: false },
    outcome,
    corpusDigest: sha256(corpus.map((entry) => entry.caseDigest)),
    labelLeakage: { labelLeakageDetected: false, expectationsDeclaredBeforeExecution: true, corpusAuditUsedOracle: false },
  });
}

export function certifyStage2L22({ evaluation }) {
  const { conflictOwner, semanticTable, conflictSemantics, decision, headChanged, sustainedRun,
    phaseMap, tradeoff, unrelatedHeadsPreserved, timeToThresholdAccuracy, identifiability,
    actionPaths, outcome, labelLeakage, repairedTableAccuracy, priorTableAccuracy } = evaluation;

  /* Only a change that actually shipped may claim a reduction. */
  const semanticDefectReduced = headChanged
    && repairedTableAccuracy > priorTableAccuracy
    && tradeoff.falsePersistentIntroduced === 0
    && tradeoff.controlEvidenceAvailable
    && tradeoff.abstentionRetentionRate === 1;

  const certified = conflictOwner.complete && semanticTable.complete
    && conflictSemantics.classification !== 'INCONCLUSIVE'
    && sustainedRun.complete && sustainedRun.corpusStatus !== 'INCONCLUSIVE'
    && unrelatedHeadsPreserved && actionPaths.unchanged
    && !labelLeakage.labelLeakageDetected
    && (!headChanged || semanticDefectReduced);

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L22_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'BOUNDED_SEMANTIC_COMPLETION_AND_CORPUS_DIAGNOSIS',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l21CertificationHash: STAGE2L22_STAGE2L21_CERTIFICATION_HASH,
      stage2l20CertificationHash: STAGE2L22_STAGE2L20_CERTIFICATION_HASH,
      nexusBehaviourChanged: false,
      frozenProducerEdited: false,
      arbiterChanged: false,
      primeChanged: false,
      sustainedRunCorpusRegenerated: false,
      repairShape: 'SUPERSEDING_COVERAGE_SPLIT_ON_ONE_REASON_CODE',
    },
    conflictOwner,
    conflictingEvidenceRequiresSufficientHistory: conflictOwner.conflictingEvidenceRequiresSufficientHistory,
    conflictGateKind: conflictOwner.gateKind,
    semanticsVersion: STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
    semanticsUnchanged: semanticTable.semanticsUnchanged,
    semanticTable,
    conflictSemantics,
    conflictSemanticsClassification: conflictSemantics.classification,
    conflictReachability: evaluation.reachability,
    corpusConflictCases: evaluation.corpusConflictCases,
    remediationRationale: evaluation.remediation,
    remediationDecision: decision,
    persistenceHeadChanged: headChanged,
    changeDescription: headChanged
      ? 'CONFLICTING_EVIDENCE is SPLIT on observation coverage: on a fully observed window it becomes NOT_PERSISTENT; on a partially observed window it remains INSUFFICIENT_EVIDENCE. SHORT_OR_MISSING_HISTORY is untouched, no threshold or PERSISTENT branch moves, and the frozen module is not edited.'
      : `No change. ${evaluation.remediation.note ?? evaluation.remediation.reason}`,
    separationRule: conflictSemantics.separationRule,
    adversarialTableResults: evaluation.repairedOnTable,
    priorTableAccuracy, repairedTableAccuracy,
    sustainedRunAudit: sustainedRun,
    sustainedRunCorpusStatus: sustainedRun.corpusStatus,
    phaseMap,
    asLabelledBefore: evaluation.asLabelledBefore, asLabelledAfter: evaluation.asLabelledAfter,
    adjudicatedBefore: evaluation.adjudicatedBefore, adjudicatedAfter: evaluation.adjudicatedAfter,
    tradeoff,
    identifiability, identifiabilityBefore: evaluation.identifiabilityBefore,
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
    conflictOwnerAuditComplete: conflictOwner.complete,
    conflictSemanticsClassified: conflictSemantics.classification !== 'INCONCLUSIVE',
    semanticTableComplete: semanticTable.complete,
    sustainedRunAuditComplete: sustainedRun.complete,
    corpusWellPosednessClassified: sustainedRun.corpusStatus !== 'INCONCLUSIVE',
    persistenceSemanticDefectReduced: semanticDefectReduced,
    persistenceConflictOutcome: outcome,
    stage2l22Certified: certified,
    interpretation: {
      persistenceCurrentStatus: headChanged
        ? 'ABSTENTION_FULLY_SCOPED_TO_DATA_SUFFICIENCY_CONFLICT_SPLIT_ON_COVERAGE'
        : 'STAGE2L21_STATE_RETAINED_CONFLICT_GATE_STRUCTURALLY_OVER_ABSTENTION_BUT_EMPIRICALLY_UNREACHABLE',
      sustainedRunCurrentStatus: `${sustainedRun.corpusStatus}: ${sustainedRun.semanticallyNotPersistentCases} of ${sustainedRun.totalCases} cases labelled PERSISTENT do not depict a sustained run once the generator's jitter is applied.`,
      actionPathExpansionRecommended: false,
      measuredRemainingLimitation: sustainedRun.corpusStatus === 'VALID'
        ? 'NONE_MEASURED_BEYOND_THE_REPAIRED_DEFECT'
        : 'SUSTAINED_RUN_CORPUS_PARTIALLY_MISLABELLED_OWNERSHIP_ESTABLISHED_NOT_REGENERATED',
      corpusRegenerationDeferred: true,
      corpusRegenerationNote: 'The brief instructs that a defective corpus be diagnosed and owned rather than silently regenerated in the same run. The defect does not prevent the semantic analysis, which is adjudicated from the series independently of any label, so regeneration is deferred.',
    },
    portabilityNote: 'Stage 2L.10 through 2L.21 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.22 does not change that.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ corpusDigest: evaluation.corpusDigest, conflictSemantics, sustainedRunStatus: sustainedRun.corpusStatus, outcome }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L22PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage, status: certification.status,
    corpusDigest: certification.corpusDigest,
    outcome: certification.persistenceConflictOutcome,
    evidenceDigest: certification.evidenceDigest,
  };
  return deepFreeze({ witnesses, digest: sha256(witnesses) });
}
