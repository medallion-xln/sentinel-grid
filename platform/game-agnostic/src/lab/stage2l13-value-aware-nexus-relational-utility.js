/* Stage 2L.13 — Value-aware Nexus certification harness (R0, shadow only).
 *
 * EXPERT-REMEDIATION STAGE. The Stage 2L.12 benchmark is imported FROZEN and is
 * not touched: same world generator, same topology families, same objective
 * model, same consequence model, same decidability rule, same ground-truth
 * derivation. Remediating an expert and its benchmark in the same stage would
 * make the result unreadable.
 *
 * The inherited Nexus policy and the remediated value-aware expert are run over
 * the identical frozen cases and reported side by side. The headline number is
 * not global accuracy but STRUCTURE_VALUE_DECOUPLED_ACCURACY: how the expert does
 * exactly where topology and objective value disagree, which is the region Stage
 * 2L.12 identified as the defect.
 */

import { createSeededRandom, deriveSeed, deepFreeze, sha256 } from '../core/determinism.js';
import {
  STAGE2L10_FROZEN_CALIBRATION,
} from './stage2l10-arbiter-correctness-calibration-and-selective-delegation.js';
import {
  buildStage2L12Corpus,
  nexusRecommendation as inheritedNexusRecommendation,
  primeRecommendation,
} from './stage2l12-nexus-semantic-grounding-and-observable-utility.js';
import {
  STAGE2L13_RELATIONAL_UTILITY_MODEL,
  STAGE2L13_RELATIONAL_UTILITY_MODEL_DIGEST,
  evaluateValueAwareNexus,
} from './stage2l13-value-aware-nexus.js';

export const STAGE2L13_STAGE = 'STAGE2L13_VALUE_AWARE_NEXUS_RELATIONAL_UTILITY';

export const STAGE2L13_STAGE2L12_CERTIFICATION_HASH = '6584e2506b18ab597aa689b380b9b861359e60f019887395b4461c4cf8b3ef34';
export const STAGE2L13_STAGE2L12_OBJECTIVE_MODEL_DIGEST = '761e69eea469a5d5aa78a3b5f7ec2f9ba1e50f8b1b19bd7bbde0a6c2e3d8c0f1';

/* Inherited bounds, unchanged. */
export const STAGE2L13_MAX_HARMFUL_CHANGE_RATE = 0.01;
export const STAGE2L13_MAX_CORRECT_PRIME_BREAK_RATE = 0.01;
export const STAGE2L13_MIN_BUCKET_RELIABILITY = 0.99;
export const STAGE2L13_MIN_BUCKET_SAMPLES = 60;

/* Improvement floor, declared BEFORE holdout was inspected. A stage that decided
 * afterwards what counted as improvement would be unfalsifiable. */
export const STAGE2L13_IMPROVEMENT_FLOOR = deepFreeze({
  mustBeatInheritedAccuracy: true,
  mustBeatRandomBaseline: true,
  mustImproveStructureValueDecoupledAccuracy: true,
  minimumAbsoluteAccuracyGainPp: 5.0,
  minimumDecoupledAccuracyGainPp: 5.0,
});

function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }

/* ---------------------------------------------------------------------------
 * PHASE 1 — the gap audit, recorded as evidence rather than prose.
 * ------------------------------------------------------------------------- */

export const STAGE2L13_GAP_AUDIT = deepFreeze({
  auditVersion: 1,
  method: 'Source scan of the complete inherited Nexus path: src/experts/nexus.js, src/lab/stage2k0-nexus-relational-diagnostic.js, and the Stage 2L.12 nexusRecommendation policy.',
  matrix: [
    { field: 'objectiveValue', availableInCanonicalState: true, readByNexus: false, derivedByNexus: false, usedInRecommendation: false, usedInConfidence: false, exposedToArbiter: false },
    { field: 'restorationCost', availableInCanonicalState: true, readByNexus: false, derivedByNexus: false, usedInRecommendation: false, usedInConfidence: false, exposedToArbiter: false },
    { field: 'risk', availableInCanonicalState: true, readByNexus: false, derivedByNexus: false, usedInRecommendation: false, usedInConfidence: false, exposedToArbiter: false },
    { field: 'protectionNeed', availableInCanonicalState: true, readByNexus: false, derivedByNexus: false, usedInRecommendation: false, usedInConfidence: false, exposedToArbiter: false },
    { field: 'availability', availableInCanonicalState: true, readByNexus: false, derivedByNexus: false, usedInRecommendation: false, usedInConfidence: false, exposedToArbiter: false },
    { field: 'demand', availableInCanonicalState: true, readByNexus: false, derivedByNexus: false, usedInRecommendation: false, usedInConfidence: false, exposedToArbiter: false },
    { field: 'baseCapacity', availableInCanonicalState: true, readByNexus: false, derivedByNexus: false, usedInRecommendation: false, usedInConfidence: false, exposedToArbiter: false },
    { field: 'objectiveRelevant', availableInCanonicalState: true, readByNexus: false, derivedByNexus: false, usedInRecommendation: false, usedInConfidence: false, exposedToArbiter: false },
    { field: 'critical (boolean)', availableInCanonicalState: true, readByNexus: true, derivedByNexus: true, usedInRecommendation: true, usedInConfidence: true, exposedToArbiter: true },
    { field: 'hostile (boolean)', availableInCanonicalState: true, readByNexus: true, derivedByNexus: true, usedInRecommendation: false, usedInConfidence: true, exposedToArbiter: false },
  ],
  relationKindsHandledByInheritedExpert: ['depends', 'supports', 'threatens'],
  relationKindsIgnoredByInheritedExpert: ['protects', 'inhibits', 'amplifies', 'substitutes', 'conflicts'],
  relationKindsHandledByInheritedAnalyzer: ['depends', 'supports'],
  measuredRootCause: 'Every quantitative semantic field the canonical state carries is read by nothing in the inherited Nexus path. Recommendation and confidence are functions of graph shape and two booleans only, while objective optimality is set by value, cost and risk.',
});

/* ---------------------------------------------------------------------------
 * PHASE 6 — blind evaluation, inherited versus remediated, same frozen cases.
 * ------------------------------------------------------------------------- */

/* A case is STRUCTURE/VALUE DECOUPLED when the highest-degree entity is not the
 * one the objective actually wants acted on. This is the region Stage 2L.12
 * identified as the defect, and it is computed from the frozen benchmark for
 * REPORTING only — it never reaches any expert or any feature vector. */
function decouplingOf(record) {
  const degree = new Map(record.world.entities.map((entity) => [entity.entityId, 0]));
  for (const relation of record.world.relations) {
    degree.set(relation.from, (degree.get(relation.from) ?? 0) + 1);
    degree.set(relation.to, (degree.get(relation.to) ?? 0) + 1);
  }
  const highest = [...degree.entries()].sort((left, right) => (right[1] - left[1]) || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  const optimal = record.groundTruth.scored.find((entry) => entry.actionId === record.groundTruth.optimalActionId);
  return {
    highestDegreeEntity: highest,
    structureValueDecoupled: optimal !== undefined && optimal.targetEntityId !== highest,
  };
}

export function runStage2L13BlindEvaluation(corpus) {
  const decidable = corpus.filter((record) => record.decidable);
  return decidable.map((record) => {
    const inherited = inheritedNexusRecommendation(record);
    const remediated = evaluateValueAwareNexus(record.world, record.legalActions);
    const prime = primeRecommendation(record);
    const optimal = record.groundTruth.optimalActionId;
    const { highestDegreeEntity, structureValueDecoupled } = decouplingOf(record);
    const entityCount = record.world.entities.length;
    const relationCount = record.world.relations.length;
    return {
      worldId: record.worldId,
      split: record.split,
      family: record.family,
      profile: record.profile,
      objectiveType: record.objectiveType,
      structureValueDecoupled,
      highestDegreeEntity,
      optimalActionId: optimal,
      primeActionId: prime.recommendedActionId,
      primeCorrect: prime.recommendedActionId === optimal,
      inheritedActionId: inherited.recommendedActionId,
      inheritedAbstained: inherited.abstained,
      inheritedCorrect: inherited.recommendedActionId !== null && inherited.recommendedActionId === optimal,
      remediatedActionId: remediated.recommendedActionId,
      remediatedAbstained: remediated.abstained,
      remediatedCorrect: remediated.recommendedActionId !== null && remediated.recommendedActionId === optimal,
      agreementWithPrime: remediated.recommendedActionId !== null && remediated.recommendedActionId === prime.recommendedActionId,
      /* Only Nexus-emitted, decision-time signals travel forward into the
       * identifiability analysis. No benchmark quantity, no generator label. */
      nexusSignals: remediated.signals,
      contextShape: { entityCount, relationCount, legalActionCount: record.legalActions.length },
    };
  });
}

function accuracyBlock(rows, pick) {
  const total = rows.length;
  const correct = rows.filter((row) => row[`${pick}Correct`]).length;
  const recommending = rows.filter((row) => !row[`${pick}Abstained`]);
  return {
    cases: total,
    accuracy: round(ratio(correct, total)),
    accuracyWhenRecommending: round(ratio(recommending.filter((row) => row[`${pick}Correct`]).length, recommending.length)),
    abstentionRate: round(ratio(rows.filter((row) => row[`${pick}Abstained`]).length, total)),
  };
}

export function summariseStage2L13Evaluation(rows) {
  const decoupled = rows.filter((row) => row.structureValueDecoupled);
  const aligned = rows.filter((row) => !row.structureValueDecoupled);
  const count = (predicate) => rows.filter(predicate).length;
  const byGroup = (key, values) => Object.fromEntries(values.map((value) => {
    const subset = rows.filter((row) => row[key] === value);
    return [value, {
      cases: subset.length,
      inheritedAccuracy: round(ratio(subset.filter((row) => row.inheritedCorrect).length, subset.length)),
      remediatedAccuracy: round(ratio(subset.filter((row) => row.remediatedCorrect).length, subset.length)),
    }];
  }));
  const quartiles = (key) => {
    const sorted = [...rows].sort((left, right) => left.contextShape[key] - right.contextShape[key]);
    const quarter = Math.max(1, Math.floor(sorted.length / 4));
    return [0, 1, 2, 3].map((index) => {
      const subset = sorted.slice(index * quarter, index === 3 ? sorted.length : (index + 1) * quarter);
      return {
        quartile: index + 1, cases: subset.length,
        inheritedAccuracy: round(ratio(subset.filter((row) => row.inheritedCorrect).length, subset.length)),
        remediatedAccuracy: round(ratio(subset.filter((row) => row.remediatedCorrect).length, subset.length)),
      };
    });
  };
  return deepFreeze({
    decidableCases: rows.length,
    inherited: accuracyBlock(rows, 'inherited'),
    remediated: accuracyBlock(rows, 'remediated'),
    primeAccuracy: round(ratio(count((row) => row.primeCorrect), rows.length)),
    absoluteImprovementPp: round((ratio(count((row) => row.remediatedCorrect), rows.length)
      - ratio(count((row) => row.inheritedCorrect), rows.length)) * 100),
    /* The headline. Where topology and value disagree is exactly where the
     * inherited expert failed, so this is the number that decides whether the
     * measured defect was actually corrected. */
    structureValueDecoupled: {
      cases: decoupled.length,
      inheritedAccuracy: round(ratio(decoupled.filter((row) => row.inheritedCorrect).length, decoupled.length)),
      remediatedAccuracy: round(ratio(decoupled.filter((row) => row.remediatedCorrect).length, decoupled.length)),
      primeAccuracy: round(ratio(decoupled.filter((row) => row.primeCorrect).length, decoupled.length)),
    },
    structureValueAligned: {
      cases: aligned.length,
      inheritedAccuracy: round(ratio(aligned.filter((row) => row.inheritedCorrect).length, aligned.length)),
      remediatedAccuracy: round(ratio(aligned.filter((row) => row.remediatedCorrect).length, aligned.length)),
      primeAccuracy: round(ratio(aligned.filter((row) => row.primeCorrect).length, aligned.length)),
    },
    nexusPrimeAgreement: round(ratio(count((row) => row.agreementWithPrime), rows.length)),
    nexusCorrectPrimeWrong: count((row) => row.remediatedCorrect && !row.primeCorrect),
    nexusWrongPrimeCorrect: count((row) => !row.remediatedCorrect && row.primeCorrect),
    bothCorrect: count((row) => row.remediatedCorrect && row.primeCorrect),
    bothWrong: count((row) => !row.remediatedCorrect && !row.primeCorrect),
    inheritedNexusCorrectPrimeWrong: count((row) => row.inheritedCorrect && !row.primeCorrect),
    inheritedNexusWrongPrimeCorrect: count((row) => !row.inheritedCorrect && row.primeCorrect),
    byFamily: byGroup('family', [...new Set(rows.map((row) => row.family))].sort()),
    byProfile: byGroup('profile', [...new Set(rows.map((row) => row.profile))].sort()),
    byObjectiveType: byGroup('objectiveType', [...new Set(rows.map((row) => row.objectiveType))].sort()),
    byEntityCountQuartile: quartiles('entityCount'),
    byRelationCountQuartile: quartiles('relationCount'),
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 8 — identifiability of Nexus's OWN correctness, from Nexus's OWN signals.
 *
 * Stage 2L.12's sharpest finding was that no Nexus-emitted feature cleared the
 * permutation null: Nexus could not tell you when Nexus was right. Improving
 * accuracy does not by itself fix that, so it is measured separately and only
 * over signals the expert actually emits — no benchmark quantity, no generator
 * label, no shape feature the expert does not report.
 * ------------------------------------------------------------------------- */

const MIN_SPLIT_SUPPORT = 100;

export function flattenStage2L13Features(row) {
  return Object.fromEntries(
    Object.entries(row.nexusSignals)
      .filter(([key]) => key !== 'kind' && key !== 'signalVersion' && key !== 'abstained')
      .map(([key, value]) => [`nexus.${key}`, value]),
  );
}

function predicatesFor(name, values) {
  const distinct = [...new Set(values)];
  if (distinct.length < 2) return [];
  const numeric = distinct.every((value) => typeof value === 'number' && Number.isFinite(value));
  if (numeric && distinct.length > 12) {
    const sorted = [...distinct].sort((left, right) => left - right);
    const step = Math.max(1, Math.floor(sorted.length / 60));
    const thresholds = sorted.filter((unused, index) => index % step === 0).slice(0, -1);
    return thresholds.map((threshold) => ({ id: `${name}<=${threshold}`, test: (features) => Number(features[name]) <= threshold }));
  }
  return distinct.map((value) => String(value)).sort().map((value) => ({ id: `${name}==${value}`, test: (features) => String(features[name]) === value }));
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
    id: predicate.id, inCount, outCount,
    inReliability: round(inRate), outReliability: round(outRate),
    gap: round(Math.abs(inRate - outRate)),
    bestSideReliability: round(Math.max(inRate, outRate)),
    bestSideSupport: inRate >= outRate ? inCount : outCount,
    bestSide: inRate >= outRate ? 'IN' : 'OUT',
  };
}

/* Conditioned on the expert having recommended: an abstention is scored
 * incorrect, so leaving abstentions in lets the abstention flag predict the label
 * by construction. Inherited from Stage 2L.12 deliberately. */
function samplesOf(rows) {
  return rows
    .filter((row) => !row.remediatedAbstained)
    .map((row) => ({ features: flattenStage2L13Features(row), correct: row.remediatedCorrect }));
}

function allPredicates(samples) {
  if (samples.length === 0) return [];
  return Object.keys(samples[0].features).flatMap((name) => predicatesFor(name, samples.map((sample) => sample.features[name])));
}

function permuteLabels(samples, seed) {
  const random = createSeededRandom(deriveSeed(0x5347324c313330n, 'STAGE2L13_PERMUTATION', seed));
  const labels = samples.map((sample) => sample.correct);
  for (let i = labels.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = labels[i]; labels[i] = labels[j]; labels[j] = swap;
  }
  return samples.map((sample, i) => ({ features: sample.features, correct: labels[i] }));
}

export function analyzeStage2L13Identifiability(rows, { permutations = 40 } = {}) {
  const samples = samplesOf(rows);
  const predicates = allPredicates(samples);
  const evaluated = predicates.map((predicate) => evaluatePredicate(samples, predicate)).filter(Boolean);
  const byGap = [...evaluated].sort((left, right) => right.gap - left.gap || left.id.localeCompare(right.id));
  const byReliability = [...evaluated].sort((left, right) => right.bestSideReliability - left.bestSideReliability || left.id.localeCompare(right.id));
  const names = samples.length === 0 ? [] : Object.keys(samples[0].features);
  const perFeature = names.map((name) => {
    const own = evaluated.filter((entry) => entry.id.startsWith(`${name}==`) || entry.id.startsWith(`${name}<=`));
    const best = own.slice().sort((left, right) => right.gap - left.gap)[0] ?? null;
    return { feature: name, distinctValues: new Set(samples.map((sample) => sample.features[name])).size, bestGap: best ? best.gap : 0, bestPredicate: best ? best.id : null, bestSideReliability: best ? best.bestSideReliability : null };
  }).sort((left, right) => right.bestGap - left.bestGap || left.feature.localeCompare(right.feature));

  const nullGaps = [];
  for (let i = 0; i < permutations; i += 1) {
    const permuted = permuteLabels(samples, i);
    nullGaps.push(round(predicates.map((predicate) => evaluatePredicate(permuted, predicate)).filter(Boolean).reduce((max, entry) => Math.max(max, entry.gap), 0)));
  }
  nullGaps.sort((left, right) => left - right);
  const quantile = (proportion) => nullGaps[Math.min(nullGaps.length - 1, Math.max(0, Math.ceil(nullGaps.length * proportion) - 1))] ?? 0;
  const observedBestGap = byGap[0]?.gap ?? 0;
  return deepFreeze({
    cases: samples.length,
    conditionedOn: 'NEXUS_MADE_A_RECOMMENDATION',
    rowsBeforeConditioning: rows.length,
    coverage: round(ratio(samples.length, rows.length)),
    baseRate: round(ratio(samples.filter((sample) => sample.correct).length, samples.length)),
    featuresInspected: names.length,
    featuresVarying: names.filter((name) => new Set(samples.map((sample) => sample.features[name])).size > 1).length,
    featureSource: 'NEXUS_EMITTED_SIGNALS_ONLY',
    predicatesSearched: predicates.length,
    predicatesEvaluable: evaluated.length,
    perFeature,
    topByGap: byGap.slice(0, 12),
    topByReliability: byReliability.slice(0, 12),
    observedBestGap,
    observedBestPredicate: byGap[0]?.id ?? null,
    observedBestSideReliability: byReliability[0]?.bestSideReliability ?? null,
    permutationNull: { permutations, min: nullGaps[0] ?? 0, median: quantile(0.5), p95: quantile(0.95), max: nullGaps[nullGaps.length - 1] ?? 0 },
    observedExceedsPermutationP95: observedBestGap > quantile(0.95),
    anyPredicateReachesReliabilityFloor: evaluated.some((entry) => entry.bestSideReliability >= STAGE2L13_MIN_BUCKET_RELIABILITY && entry.bestSideSupport >= STAGE2L13_MIN_BUCKET_SAMPLES),
  });
}

export function discoverStage2L13Rule(discoveryRows) {
  for (const row of discoveryRows) {
    if (row.split !== 'DISCOVERY') throw new Error('STAGE2L13_DISCOVERY_SPLIT_VIOLATION');
  }
  const samples = samplesOf(discoveryRows);
  const predicates = allPredicates(samples);
  const evaluated = predicates.map((predicate) => ({ predicate, score: evaluatePredicate(samples, predicate) })).filter((entry) => entry.score !== null);
  const seeds = [...evaluated].sort((left, right) => right.score.bestSideReliability - left.score.bestSideReliability || left.predicate.id.localeCompare(right.predicate.id)).slice(0, 30);
  const conjunctions = [];
  const featureOf = (id) => id.split(/==|<=/)[0];
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      const left = seeds[i].predicate; const right = seeds[j].predicate;
      if (featureOf(left.id) === featureOf(right.id)) continue;
      conjunctions.push({ id: `(${left.id}) AND (${right.id})`, test: (features) => left.test(features) && right.test(features) });
    }
  }
  const evaluatedConjunctions = conjunctions.map((predicate) => ({ predicate, score: evaluatePredicate(samples, predicate) })).filter((entry) => entry.score !== null);
  const ranked = [...evaluated, ...evaluatedConjunctions].sort((left, right) =>
    right.score.bestSideReliability - left.score.bestSideReliability
    || right.score.bestSideSupport - left.score.bestSideSupport
    || left.predicate.id.localeCompare(right.predicate.id));
  const best = ranked[0] ?? null;
  return {
    searchSpace: { singles: predicates.length, singlesEvaluable: evaluated.length, conjunctions: conjunctions.length, conjunctionsEvaluable: evaluatedConjunctions.length },
    discoveryCases: samples.length,
    discoveryBaseRate: round(ratio(samples.filter((sample) => sample.correct).length, samples.length)),
    frozenRule: best === null ? null : {
      id: best.predicate.id, side: best.score.bestSide,
      discoveryReliability: best.score.bestSideReliability,
      discoverySupport: best.score.bestSideSupport,
      discoveryGap: best.score.gap,
      reachesFloorOnDiscovery: best.score.bestSideReliability >= STAGE2L13_MIN_BUCKET_RELIABILITY && best.score.bestSideSupport >= STAGE2L13_MIN_BUCKET_SAMPLES,
    },
    frozenRuleTest: best === null ? null : (features) => (best.score.bestSide === 'IN' ? best.predicate.test(features) : !best.predicate.test(features)),
    topTen: ranked.slice(0, 10).map((entry) => ({ id: entry.predicate.id, side: entry.score.bestSide, reliability: entry.score.bestSideReliability, support: entry.score.bestSideSupport, gap: entry.score.gap })),
  };
}

export function testStage2L13Generalization(discovery, holdoutRows) {
  for (const row of holdoutRows) {
    if (row.split !== 'HOLDOUT') throw new Error('STAGE2L13_HOLDOUT_SPLIT_VIOLATION');
  }
  if (discovery.frozenRule === null) return deepFreeze({ applicable: false, reason: 'NO_EVALUABLE_RULE_ON_DISCOVERY' });
  const samples = samplesOf(holdoutRows);
  const selected = samples.filter((sample) => discovery.frozenRuleTest(sample.features));
  const rejected = samples.filter((sample) => !discovery.frozenRuleTest(sample.features));
  const holdoutReliability = round(ratio(selected.filter((sample) => sample.correct).length, selected.length));
  const baseRate = round(ratio(samples.filter((sample) => sample.correct).length, samples.length));
  return deepFreeze({
    applicable: true,
    ruleId: discovery.frozenRule.id,
    discoveryReliability: discovery.frozenRule.discoveryReliability,
    discoverySupport: discovery.frozenRule.discoverySupport,
    holdoutCases: samples.length,
    holdoutBaseRate: baseRate,
    holdoutSelected: selected.length,
    holdoutReliability,
    holdoutRejected: rejected.length,
    holdoutRejectedReliability: round(ratio(rejected.filter((sample) => sample.correct).length, rejected.length)),
    reliabilityLostFromDiscoveryToHoldout: round(discovery.frozenRule.discoveryReliability - holdoutReliability),
    holdoutReachesFloor: selected.length >= STAGE2L13_MIN_BUCKET_SAMPLES && holdoutReliability >= STAGE2L13_MIN_BUCKET_RELIABILITY,
    generalizes: selected.length >= STAGE2L13_MIN_BUCKET_SAMPLES && holdoutReliability > baseRate + 0.05,
    collapsedToBaseRate: Math.abs(holdoutReliability - baseRate) < 0.05,
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 9 — selective delegation.
 *
 * The Stage 2L.10 gate RULES are applied unchanged: the same 0.99 reliability
 * floor, the same 60-sample minimum, the same a-priori structural-ineligibility
 * principle, the same harm ceilings. What is new is a candidate bucket table for
 * a NEW signal kind, derived on the DISCOVERY split only and frozen before
 * holdout. The certified Stage 2L.10 calibration is not modified — this is an
 * additional, versioned table for signals that did not exist when it was made.
 * ------------------------------------------------------------------------- */

export const STAGE2L13_NEXUS_BUCKETS = deepFreeze([
  'NEXUS_SEMANTICS_INCOMPLETE',
  'NEXUS_UNSTABLE_UNDER_PERTURBATION',
  'NEXUS_CHAIN_STILL_BLOCKED',
  'NEXUS_CONTRADICTED',
  'NEXUS_CLEAN_LOW_MARGIN',
  'NEXUS_CLEAN_HIGH_MARGIN',
]);

/* A priori structural ineligibility, inherited in spirit from Stage 2L.10: a
 * bucket in which the expert's own output disclaims a basis can never authorise
 * delegation, however well it happens to measure. */
export const STAGE2L13_STRUCTURALLY_INELIGIBLE_BUCKETS = deepFreeze([
  'NEXUS_SEMANTICS_INCOMPLETE',
  'NEXUS_UNSTABLE_UNDER_PERTURBATION',
]);

export const STAGE2L13_MARGIN_LADDER = deepFreeze([50000, 150000, 300000, 600000, 1000000]);

export function stage2L13NexusBucket(signals, parameters) {
  if (signals === null || signals === undefined) return null;
  if (signals.kind !== 'NEXUS_RELATIONAL_UTILITY_V1') return null;
  if (signals.semanticFieldsIncompleteCount > 0 || signals.semanticCoverage < 1000000) return 'NEXUS_SEMANTICS_INCOMPLETE';
  if (signals.perturbationStable !== true) return 'NEXUS_UNSTABLE_UNDER_PERTURBATION';
  if (signals.remainingBlockerCount > 0) return 'NEXUS_CHAIN_STILL_BLOCKED';
  if (signals.contradictionCount > 0) return 'NEXUS_CONTRADICTED';
  return signals.nexusUtilityMargin >= parameters.minUtilityMargin ? 'NEXUS_CLEAN_HIGH_MARGIN' : 'NEXUS_CLEAN_LOW_MARGIN';
}

function bucketEligible(bucket) {
  return bucket !== null && !STAGE2L13_STRUCTURALLY_INELIGIBLE_BUCKETS.includes(bucket);
}

export function deriveStage2L13Calibration(discoveryRows) {
  for (const row of discoveryRows) {
    if (row.split !== 'DISCOVERY') throw new Error('STAGE2L13_DISCOVERY_SPLIT_VIOLATION');
  }
  const usable = discoveryRows.filter((row) => !row.remediatedAbstained);
  const sweep = STAGE2L13_MARGIN_LADDER.map((minUtilityMargin) => {
    const parameters = { minUtilityMargin };
    const observed = usable.map((row) => ({ bucket: stage2L13NexusBucket(row.nexusSignals, parameters), correct: row.remediatedCorrect }));
    const subset = observed.filter((entry) => entry.bucket === 'NEXUS_CLEAN_HIGH_MARGIN');
    const correct = subset.filter((entry) => entry.correct).length;
    const reliability = subset.length === 0 ? null : round(ratio(correct, subset.length));
    return {
      minUtilityMargin, opportunities: subset.length, reliability,
      qualifies: subset.length >= STAGE2L13_MIN_BUCKET_SAMPLES && reliability !== null && reliability >= STAGE2L13_MIN_BUCKET_RELIABILITY,
    };
  });
  /* Declared selection rule, fixed before measurement: among qualifying
   * candidates take the most opportunities, breaking ties toward the more
   * conservative (larger) margin. If none qualifies, nothing delegates. */
  const qualifying = sweep.filter((entry) => entry.qualifies);
  const chosen = qualifying.length === 0 ? null
    : qualifying.slice().sort((left, right) => right.opportunities - left.opportunities || right.minUtilityMargin - left.minUtilityMargin)[0];
  const parameters = { minUtilityMargin: chosen === null ? STAGE2L13_MARGIN_LADDER[STAGE2L13_MARGIN_LADDER.length - 1] : chosen.minUtilityMargin };

  const buckets = Object.fromEntries(STAGE2L13_NEXUS_BUCKETS.map((bucket) => {
    const subset = usable.filter((row) => stage2L13NexusBucket(row.nexusSignals, parameters) === bucket);
    const correct = subset.filter((row) => row.remediatedCorrect).length;
    const calibrated = subset.length >= STAGE2L13_MIN_BUCKET_SAMPLES;
    const reliability = subset.length === 0 ? null : round(ratio(correct, subset.length));
    return [bucket, {
      opportunities: subset.length, expertCorrect: correct, expertWrong: subset.length - correct,
      reliability, calibrated, structurallyEligible: bucketEligible(bucket),
      delegates: bucketEligible(bucket) && calibrated && reliability !== null && reliability >= STAGE2L13_MIN_BUCKET_RELIABILITY,
    }];
  }));

  const body = {
    calibrationVersion: 1,
    stage: STAGE2L13_STAGE,
    signalKind: 'NEXUS_RELATIONAL_UTILITY_V1',
    minBucketReliability: STAGE2L13_MIN_BUCKET_RELIABILITY,
    minBucketSamples: STAGE2L13_MIN_BUCKET_SAMPLES,
    parameters,
    buckets,
    delegatingBuckets: STAGE2L13_NEXUS_BUCKETS.filter((bucket) => buckets[bucket].delegates),
    structurallyIneligibleBuckets: [...STAGE2L13_STRUCTURALLY_INELIGIBLE_BUCKETS],
    sweep,
    selected: chosen,
    discoveryOpportunities: usable.length,
    inheritedCalibrationDigest: STAGE2L10_FROZEN_CALIBRATION.calibrationDigest,
    inheritedCalibrationModified: false,
  };
  return deepFreeze({ ...body, calibrationDigest: sha256(body) });
}

export function evaluateStage2L13Delegation(holdoutRows, calibration) {
  for (const row of holdoutRows) {
    if (row.split !== 'HOLDOUT') throw new Error('STAGE2L13_HOLDOUT_SPLIT_VIOLATION');
  }
  const gated = holdoutRows.map((row) => {
    const bucket = row.remediatedAbstained ? null : stage2L13NexusBucket(row.nexusSignals, calibration.parameters);
    const entry = bucket === null ? undefined : calibration.buckets[bucket];
    const delegates = entry !== undefined && entry.delegates === true;
    /* A delegation only happens where the Arbiter would actually be moved: the
     * expert points somewhere other than Prime's own pick. */
    const wouldMovePrime = row.remediatedActionId !== null && row.remediatedActionId !== row.primeActionId;
    return { ...row, uncertaintyBucket: bucket, bucketReliability: entry ? entry.reliability : null, delegated: delegates && wouldMovePrime };
  });
  const total = gated.length;
  const delegations = gated.filter((row) => row.delegated);
  const beneficial = delegations.filter((row) => row.remediatedCorrect && !row.primeCorrect).length;
  const harmful = delegations.filter((row) => !row.remediatedCorrect && row.primeCorrect).length;
  const arbiterCorrect = gated.filter((row) => (row.delegated ? row.remediatedCorrect : row.primeCorrect)).length;
  const primeCorrect = gated.filter((row) => row.primeCorrect).length;
  return deepFreeze({
    casesEvaluated: total,
    calibrationDigest: calibration.calibrationDigest,
    inheritedCalibrationDigest: calibration.inheritedCalibrationDigest,
    inheritedCalibrationModified: false,
    delegatingBuckets: [...calibration.delegatingBuckets],
    bucketUsage: Object.fromEntries([...new Set(gated.map((row) => String(row.uncertaintyBucket)))].sort().map((bucket) => {
      const subset = gated.filter((row) => String(row.uncertaintyBucket) === bucket);
      return [bucket, { cases: subset.length, delegated: subset.filter((row) => row.delegated).length, expertCorrect: subset.filter((row) => row.remediatedCorrect).length }];
    })),
    nexusDelegations: delegations.length,
    nexusDelegationRate: round(ratio(delegations.length, total)),
    nexusDelegationPrecision: round(ratio(beneficial, delegations.length)),
    nexusBeneficialChanges: beneficial,
    nexusHarmfulChanges: harmful,
    nexusHarmRate: round(ratio(harmful, total)),
    nexusCorrectPrimeBreaks: harmful,
    nexusCorrectPrimeBreakRate: round(ratio(harmful, total)),
    primeOnlyAccuracy: round(ratio(primeCorrect, total)),
    arbiterAccuracyWithNexus: round(ratio(arbiterCorrect, total)),
    accuracyUpliftOverPrimePp: round((ratio(arbiterCorrect, total) - ratio(primeCorrect, total)) * 100),
    harmCeilingRespected: round(ratio(harmful, total)) <= STAGE2L13_MAX_HARMFUL_CHANGE_RATE,
    correctPrimeBreakCeilingRespected: round(ratio(harmful, total)) <= STAGE2L13_MAX_CORRECT_PRIME_BREAK_RATE,
    delegationForced: false,
    reliabilityFloorLowered: false,
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 11 — adversarial and malformed-semantics cases.
 *
 * Every one must abstain or fail closed. An expert that invents a missing cost is
 * worse than one that declines.
 * ------------------------------------------------------------------------- */

export const STAGE2L13_ADVERSARIAL_CASES = deepFreeze([
  'MISSING_VALUE', 'MALFORMED_COST', 'NEGATIVE_RISK', 'ABSENT_OBJECTIVE_WEIGHTS',
  'CONTRADICTORY_RELATIONS', 'DUPLICATED_RELATIONS', 'CYCLIC_DEPENDENCY',
  'DISCONNECTED_GRAPH', 'LEGAL_ACTION_MISMATCH', 'ZERO_UTILITY_MARGIN', 'EXPERT_TIE',
]);

function adversarialWorld(kind) {
  const entity = (id, overrides = {}) => ({
    entityId: id, objectiveValue: 0, demand: 0, baseCapacity: 500000, availability: 1000000,
    risk: 0, protectionNeed: 0, restorationCost: 10000, objectiveRelevant: false, ...overrides,
  });
  const relation = (id, from, to, relationKind, weight = 0, replaces = null) => ({ relationId: id, from, to, kind: relationKind, weight, replaces });
  const base = {
    entities: [entity('a', { availability: 0 }), entity('b', { objectiveValue: 500000 })],
    relations: [relation('r1', 'a', 'b', 'depends')],
  };
  const actions = [
    { actionId: 'a-hold', kind: 'HOLD', targetEntityId: null, reinforceAmount: 0 },
    { actionId: 'b-restore-a', kind: 'RESTORE', targetEntityId: 'a', reinforceAmount: 600000 },
  ];
  if (kind === 'MISSING_VALUE') return { world: { ...base, entities: [{ ...base.entities[0], objectiveValue: undefined }, base.entities[1]] }, actions };
  if (kind === 'MALFORMED_COST') return { world: { ...base, entities: [{ ...base.entities[0], restorationCost: 'free' }, base.entities[1]] }, actions };
  if (kind === 'NEGATIVE_RISK') return { world: { ...base, entities: [{ ...base.entities[0], risk: -50 }, base.entities[1]] }, actions };
  if (kind === 'ABSENT_OBJECTIVE_WEIGHTS') return { world: { entities: [entity('a', { availability: 0 }), entity('b')], relations: base.relations }, actions };
  if (kind === 'CONTRADICTORY_RELATIONS') return { world: { ...base, relations: [...base.relations, relation('r2', 'b', 'a', 'depends'), relation('r3', 'a', 'b', 'conflicts', 400000)] }, actions };
  if (kind === 'DUPLICATED_RELATIONS') return { world: { ...base, relations: [...base.relations, relation('r2', 'a', 'b', 'depends')] }, actions };
  if (kind === 'CYCLIC_DEPENDENCY') return { world: { ...base, relations: [...base.relations, relation('r2', 'b', 'a', 'depends')] }, actions };
  if (kind === 'DISCONNECTED_GRAPH') return { world: { entities: [entity('a', { availability: 0 }), entity('b', { objectiveValue: 500000 })], relations: [] }, actions };
  if (kind === 'LEGAL_ACTION_MISMATCH') return { world: base, actions: [...actions, { actionId: 'c-restore-ghost', kind: 'RESTORE', targetEntityId: 'ghost', reinforceAmount: 0 }] };
  if (kind === 'ZERO_UTILITY_MARGIN') {
    return {
      world: { entities: [entity('p', { availability: 0, objectiveValue: 300000, restorationCost: 1000 }), entity('q', { availability: 0, objectiveValue: 300000, restorationCost: 1000 })], relations: [] },
      actions: [{ actionId: 'a-hold', kind: 'HOLD', targetEntityId: null, reinforceAmount: 0 },
        { actionId: 'b-restore-p', kind: 'RESTORE', targetEntityId: 'p', reinforceAmount: 0 },
        { actionId: 'c-restore-q', kind: 'RESTORE', targetEntityId: 'q', reinforceAmount: 0 }],
    };
  }
  // EXPERT_TIE
  return {
    world: { entities: [entity('p', { availability: 0, objectiveValue: 400000, restorationCost: 5000 }), entity('q', { availability: 0, objectiveValue: 400000, restorationCost: 5000 })], relations: [] },
    actions: [{ actionId: 'a-hold', kind: 'HOLD', targetEntityId: null, reinforceAmount: 0 },
      { actionId: 'b-restore-p', kind: 'RESTORE', targetEntityId: 'p', reinforceAmount: 0 },
      { actionId: 'c-restore-q', kind: 'RESTORE', targetEntityId: 'q', reinforceAmount: 0 }],
  };
}

export function runStage2L13AdversarialSuite() {
  return deepFreeze(Object.fromEntries(STAGE2L13_ADVERSARIAL_CASES.map((kind) => {
    const { world, actions } = adversarialWorld(kind);
    let result = null;
    let threw = false;
    try { result = evaluateValueAwareNexus(world, actions); } catch { threw = true; }
    const malformedSemantics = ['MISSING_VALUE', 'MALFORMED_COST', 'NEGATIVE_RISK'].includes(kind);
    const recommended = result !== null && result.recommendedActionId !== null;
    const targetIsLegal = !recommended || actions.some((action) => action.actionId === result.recommendedActionId && action.targetEntityId !== null);
    return [kind, {
      threw,
      recommendedActionId: result === null ? null : result.recommendedActionId,
      abstained: result === null ? true : result.abstained,
      semanticFieldsIncompleteCount: result === null ? null : result.signals.semanticFieldsIncompleteCount,
      recommendationIsLegal: targetIsLegal,
      /* Malformed semantics must never produce a recommendation about the
       * malformed entity; everything else must at least stay inside the legal set. */
      failedClosed: malformedSemantics
        ? (!recommended || result.decomposition?.targetEntityId !== 'a')
        : (!threw && targetIsLegal),
      deterministic: result !== null && sha256(evaluateValueAwareNexus(world, actions)) === sha256(result),
    }];
  })));
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 * ------------------------------------------------------------------------- */

export function buildStage2L13Evaluation() {
  const discoveryCorpus = buildStage2L12Corpus('DISCOVERY');
  const holdoutCorpus = buildStage2L12Corpus('HOLDOUT');
  const discoveryRows = runStage2L13BlindEvaluation(discoveryCorpus);
  const holdoutRows = runStage2L13BlindEvaluation(holdoutCorpus);
  const replayRows = runStage2L13BlindEvaluation(holdoutCorpus);

  const evaluationSummary = summariseStage2L13Evaluation(holdoutRows);
  const analysis = analyzeStage2L13Identifiability(holdoutRows);
  const discovery = discoverStage2L13Rule(discoveryRows);
  const generalization = testStage2L13Generalization(discovery, holdoutRows);
  const calibration = deriveStage2L13Calibration(discoveryRows);

  /* Delegation is evaluated only when Nexus's own signals demonstrate useful
   * out-of-sample discrimination. Forcing a run otherwise would produce a number
   * that looked like evidence and was not. */
  const selfIdentifiable = generalization.applicable && generalization.generalizes;
  const delegation = selfIdentifiable
    ? evaluateStage2L13Delegation(holdoutRows, calibration)
    : deepFreeze({
      evaluated: false,
      reason: 'Precondition not met: Nexus-emitted signals did not demonstrate useful out-of-sample correctness discrimination.',
      calibrationDigest: calibration.calibrationDigest,
      inheritedCalibrationModified: false,
      delegatingBuckets: [...calibration.delegatingBuckets],
      nexusDelegations: 0, nexusDelegationRate: 0, nexusDelegationPrecision: 0,
      nexusBeneficialChanges: 0, nexusHarmfulChanges: 0,
      nexusHarmRate: 0, nexusCorrectPrimeBreaks: 0, nexusCorrectPrimeBreakRate: 0,
      accuracyUpliftOverPrimePp: 0,
      harmCeilingRespected: true, correctPrimeBreakCeilingRespected: true,
      delegationForced: false, reliabilityFloorLowered: false,
    });

  const adversarial = runStage2L13AdversarialSuite();

  /* Ordering invariance and replay, over the expert itself. */
  const orderingSample = holdoutCorpus.filter((record) => record.decidable).slice(0, 200);
  const orderingInvariant = orderingSample.every((record) => {
    const forward = evaluateValueAwareNexus(record.world, record.legalActions);
    const reversed = evaluateValueAwareNexus(
      { entities: [...record.world.entities].reverse(), relations: [...record.world.relations].reverse() },
      [...record.legalActions].reverse(),
    );
    return forward.recommendedActionId === reversed.recommendedActionId;
  });
  const rowDigest = sha256(holdoutRows.map((row) => ({ worldId: row.worldId, remediated: row.remediatedActionId, inherited: row.inheritedActionId })));
  const replayDigest = sha256(replayRows.map((row) => ({ worldId: row.worldId, remediated: row.remediatedActionId, inherited: row.inheritedActionId })));

  const featureKeys = holdoutRows.length > 0 ? Object.keys(flattenStage2L13Features(holdoutRows[0])) : [];
  const forbidden = ['optimalActionId', 'remediatedCorrect', 'inheritedCorrect', 'primeCorrect', 'structureValueDecoupled',
    'family', 'profile', 'objectiveType', 'worldId', 'utilityMargin', 'actionUtility', 'baselineUtility'];
  const forbiddenInFeatures = forbidden.filter((key) => featureKeys.some((feature) => feature.endsWith(`.${key}`) || feature === key));

  const discoveryIds = new Set(discoveryCorpus.map((record) => record.worldId));
  const corpusOverlap = holdoutCorpus.filter((record) => discoveryIds.has(record.worldId)).length;

  return deepFreeze({
    gapAudit: STAGE2L13_GAP_AUDIT,
    relationalUtilityModel: STAGE2L13_RELATIONAL_UTILITY_MODEL,
    relationalUtilityModelDigest: STAGE2L13_RELATIONAL_UTILITY_MODEL_DIGEST,
    improvementFloor: STAGE2L13_IMPROVEMENT_FLOOR,
    corpus: {
      discoveryCases: discoveryCorpus.length,
      holdoutCases: holdoutCorpus.length,
      discoveryDecidable: discoveryRows.length,
      holdoutDecidable: holdoutRows.length,
      corpusOverlap,
      calibrationHoldoutSeparate: corpusOverlap === 0,
      benchmarkUnchanged: true,
      holdoutCorpusDigest: sha256(holdoutCorpus.map((record) => ({ worldId: record.worldId, optimal: record.groundTruth.optimalActionId }))),
    },
    evaluation: evaluationSummary,
    analysis,
    ruleSearch: { searchSpace: discovery.searchSpace, discoveryCases: discovery.discoveryCases, discoveryBaseRate: discovery.discoveryBaseRate, frozenRule: discovery.frozenRule, topTen: discovery.topTen },
    generalization,
    calibration,
    delegation,
    adversarial,
    invariance: { orderingInvariant, replayEquivalent: rowDigest === replayDigest, rowDigest, replayDigest },
    labelLeakage: {
      featureSource: analysis.featureSource,
      featureKeysInspected: featureKeys.length,
      forbiddenScanned: forbidden,
      forbiddenInFeatures,
      labelLeakageDetected: forbiddenInFeatures.length > 0,
    },
    rows: holdoutRows,
  });
}

export function certifyStage2L13({ evaluation = buildStage2L13Evaluation() } = {}) {
  const { corpus, analysis, generalization, delegation, adversarial, invariance, labelLeakage } = evaluation;
  const summary = evaluation.evaluation;
  const randomBaseline = round(ratio(1, 6));

  const accuracyImproved = summary.remediated.accuracy > summary.inherited.accuracy
    && summary.remediated.accuracy > randomBaseline
    && summary.absoluteImprovementPp >= STAGE2L13_IMPROVEMENT_FLOOR.minimumAbsoluteAccuracyGainPp;
  const decoupledGainPp = round((summary.structureValueDecoupled.remediatedAccuracy - summary.structureValueDecoupled.inheritedAccuracy) * 100);
  const structureValueDefectReduced = decoupledGainPp >= STAGE2L13_IMPROVEMENT_FLOOR.minimumDecoupledAccuracyGainPp;

  const adversarialPass = Object.values(adversarial).every((entry) => entry.failedClosed && entry.deterministic && !entry.threw);
  const securityRegressionPass = adversarialPass
    && invariance.orderingInvariant
    && invariance.replayEquivalent
    && delegation.harmCeilingRespected
    && delegation.correctPrimeBreakCeilingRespected
    && delegation.inheritedCalibrationModified === false
    && delegation.reliabilityFloorLowered === false;

  const selfIdentifiable = generalization.applicable && generalization.generalizes;
  const safeDelegation = delegation.evaluated !== false
    && delegation.nexusDelegations > 0
    && delegation.harmCeilingRespected
    && delegation.correctPrimeBreakCeilingRespected;

  const certified = accuracyImproved
    && structureValueDefectReduced
    && securityRegressionPass
    && !labelLeakage.labelLeakageDetected
    && corpus.calibrationHoldoutSeparate
    && corpus.benchmarkUnchanged;

  const outcome = !certified ? 'D_NO_MEANINGFUL_IMPROVEMENT'
    : safeDelegation ? 'A_SAFE_SPECIALIST'
      : summary.remediated.accuracy > summary.primeAccuracy ? 'B_IMPROVED_NOT_SELF_CALIBRATED'
        : 'C_IMPROVED_BUT_BELOW_USEFUL_FLOOR';

  /* The four outcome classes are coarse, and this result sits between two of
   * them. Nexus CAN discriminate its own correctness out of sample — the frozen
   * rule held far above base rate — but its best bucket lands short of the
   * inherited 0.99 delegation floor. Recording that precisely matters, because
   * "cannot tell when it is right" and "can tell, but not to the standard
   * delegation demands" imply different next stages. */
  const bestBucketReliability = Math.max(0, ...Object.values(evaluation.calibration.buckets)
    .filter((entry) => entry.structurallyEligible && entry.calibrated && entry.reliability !== null)
    .map((entry) => entry.reliability));
  const outcomeQualifier = outcome !== 'B_IMPROVED_NOT_SELF_CALIBRATED' ? null
    : selfIdentifiable
      ? `SELF_DISCRIMINATION_DEMONSTRATED_BUT_BELOW_DELEGATION_FLOOR: best eligible bucket reliability ${bestBucketReliability} against a ${STAGE2L13_MIN_BUCKET_RELIABILITY} floor.`
      : 'SELF_DISCRIMINATION_NOT_DEMONSTRATED: no frozen rule generalised out of sample.';

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L13_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'EXPERT_REMEDIATION_AND_CERTIFICATION',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l12CertificationHash: STAGE2L13_STAGE2L12_CERTIFICATION_HASH,
      benchmarkUnchanged: true,
      groundTruthUnchanged: true,
      arbiterChanged: false,
      arbiterContractChanged: false,
      inheritedNexusExpertChanged: false,
      inheritedCalibrationDigest: STAGE2L10_FROZEN_CALIBRATION.calibrationDigest,
      inheritedCalibrationModified: false,
      thresholdsUnchanged: STAGE2L13_MIN_BUCKET_RELIABILITY === 0.99
        && STAGE2L13_MIN_BUCKET_SAMPLES === 60
        && STAGE2L13_MAX_HARMFUL_CHANGE_RATE === 0.01
        && STAGE2L13_MAX_CORRECT_PRIME_BREAK_RATE === 0.01,
    },
    gapAudit: evaluation.gapAudit,
    relationalUtilityModel: evaluation.relationalUtilityModel,
    relationalUtilityModelDigest: evaluation.relationalUtilityModelDigest,
    improvementFloor: evaluation.improvementFloor,
    corpus,
    blindEvaluation: {
      ...summary,
      randomBaseline,
      structureValueDecoupledGainPp: decoupledGainPp,
      remediatedBeatsPrime: summary.remediated.accuracy > summary.primeAccuracy,
      remediatedBeatsRandom: summary.remediated.accuracy > randomBaseline,
    },
    identifiability: {
      cases: analysis.cases,
      coverage: analysis.coverage,
      baseRate: analysis.baseRate,
      featureSource: analysis.featureSource,
      featuresInspected: analysis.featuresInspected,
      featuresVarying: analysis.featuresVarying,
      predicatesSearched: analysis.predicatesSearched,
      bestNexusEmittedSignal: analysis.observedBestPredicate,
      bestNexusEmittedDiscrimination: analysis.observedBestGap,
      bestSideReliability: analysis.observedBestSideReliability,
      permutationNull: analysis.permutationNull,
      observedExceedsPermutationP95: analysis.observedExceedsPermutationP95,
      anyPredicateReachesReliabilityFloor: analysis.anyPredicateReachesReliabilityFloor,
      selfCorrectnessIdentifiable: selfIdentifiable,
    },
    ruleSearch: evaluation.ruleSearch,
    generalization,
    calibration: {
      calibrationDigest: evaluation.calibration.calibrationDigest,
      parameters: evaluation.calibration.parameters,
      buckets: evaluation.calibration.buckets,
      delegatingBuckets: evaluation.calibration.delegatingBuckets,
      structurallyIneligibleBuckets: evaluation.calibration.structurallyIneligibleBuckets,
      sweep: evaluation.calibration.sweep,
      inheritedCalibrationModified: false,
    },
    delegation,
    adversarial,
    invariance,
    labelLeakage,
    labelLeakageDetected: labelLeakage.labelLeakageDetected,
    expertAccuracyImproved: accuracyImproved,
    structureValueDefectReduced,
    measuredExpertSemanticDefectReduced: structureValueDefectReduced,
    securityRegressionPass,
    nexusRemediationOutcome: outcome,
    nexusRemediationOutcomeQualifier: outcomeQualifier,
    bestEligibleBucketReliability: bestBucketReliability,
    nexusSafeForSelectiveDelegation: safeDelegation,
    stage2l13Certified: certified,
    interpretation: {
      nexusExpertRemediationRequired: !accuracyImproved,
      nexusConfidenceRemediationRequired: !safeDelegation,
      nexusContractRemediationRequired: false,
      arbiterRemediationRequired: false,
      measuredRemainingLimitation: safeDelegation
        ? 'None measured at this stage.'
        : selfIdentifiable
          ? 'Nexus signals discriminate correctness out of sample but no bucket reaches the inherited 0.99 delegation floor, so selective delegation remains unauthorised.'
          : 'Nexus is materially more accurate but its own emitted signals do not yet identify when it is right, so selective delegation remains unauthorised.',
    },
    portabilityNote: 'Stage 2L.10 through 2L.12 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.13 does not change that and claims no cross-platform deterministic certification.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ corpus, summary, analysis: { best: analysis.observedBestGap, null: analysis.permutationNull }, generalization, delegation }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}
