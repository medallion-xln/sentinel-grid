/* Stage 2L.16 — Nexus residual error decomposition.
 *
 * A diagnostic stage earns trust in exactly two ways: by proving it changed
 * nothing, and by proving its measuring instrument is faithful. These tests
 * attack both, plus the leakage and reproducibility claims the diagnosis rests on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STAGE2L16_STAGE,
  STAGE2L16_CORPUS,
  STAGE2L16_SPLIT_BOUNDS,
  STAGE2L16_HIGH_CONFIDENCE_RISK,
  STAGE2L16_HIGH_CONFIDENCE_MARGIN,
  STAGE2L16_ERROR_CLASSES,
  STAGE2L16_CLASS_PRECEDENCE,
  STAGE2L16_MECHANISMS,
  STAGE2L16_REMEDIATION_CANDIDATES,
  STAGE2L16_FEASIBILITY_CLASSES,
  STAGE2L16_FORBIDDEN_IN_PREDICATES,
  STAGE2L16_VALUE_DIFFUSE_CONCENTRATION,
  indexStage2L16World,
  propagatedDelivery,
  nexusLocallyBlocked,
  stronglyConnectedComponents,
  valueConcentration,
  buildStage2L16Row,
  classifyStage2L16Error,
  bypassRestsOnDeadSubstitute,
  inThresholdGap,
  rerankWithDelta,
  explainStage2L16Case,
  verifyStage2L16OrderingInvariance,
  buildStage2L16PortabilityDigest,
  certifyStage2L16,
} from '../src/lab/stage2l16-nexus-residual-error-decomposition.js';
import { evaluateValueAwareNexus, STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD } from '../src/lab/stage2l13-value-aware-nexus.js';
import { STAGE2L12_AVAILABILITY_THRESHOLD } from '../src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js';
import { STAGE2L15_RELIABILITY_FLOOR } from '../src/lab/stage2l15-nexus-decision-stability.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l16-nexus-residual-error-decomposition');
const stored = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l16-certification-result.json'), 'utf8'));

/* Building the full corpus takes a while; a handful of live rows is enough for
 * the structural tests, and the stored certification covers the population ones. */
const sampleRows = [];
for (let variant = 0; sampleRows.length < 60 && variant < 400; variant += 1) {
  const row = buildStage2L16Row(variant);
  if (row !== null) sampleRows.push(row);
}

/* --------------------------------------------------------------------------
 * The central claim: nothing changed.
 * ------------------------------------------------------------------------ */

test('the stage declares and measures that Nexus behaviour is unchanged', () => {
  assert.equal(stored.nexusBehaviorChanged, false);
  assert.equal(stored.behaviour.behaviourUnchanged, true);
  assert.ok(stored.behaviour.compared > 0);
  assert.equal(stored.behaviour.identical, stored.behaviour.compared);
  assert.equal(stored.freeze.nexusExpertChanged, false);
  assert.equal(stored.freeze.arbiterChanged, false);
  assert.equal(stored.freeze.benchmarkUnchanged, true);
});

test('replaying the frozen expert reproduces every recorded recommendation', () => {
  for (const row of sampleRows.slice(0, 30)) {
    const replay = evaluateValueAwareNexus(row.world, row.legalActions, { inheritedSignals: false });
    assert.equal(replay.recommendedActionId, row.chosenActionId);
    assert.equal(replay.signals.nexusTopRiskAdjustment, row.signals.nexusTopRiskAdjustment);
    assert.equal(replay.signals.nexusUtilityMargin, row.signals.nexusUtilityMargin);
  }
});

test('no reliability floor is redeclared and no delegation path is exported', () => {
  const source = readFileSync(path.join(root, 'src/lab/stage2l16-nexus-residual-error-decomposition.js'), 'utf8');
  assert.equal(/STAGE2L16_RELIABILITY_FLOOR\s*=/.test(source), false);
  assert.equal(/export function\s+\w*[Dd]elegat/.test(source), false);
  assert.equal(STAGE2L15_RELIABILITY_FLOOR, 0.99);
  assert.equal(stored.freeze.reliabilityFloorLowered, false);
  assert.equal(stored.freeze.newConfidenceThresholdsIntroduced, false);
});

test('the high-confidence region is inherited from Stage 2L.14, not invented here', () => {
  assert.equal(STAGE2L16_HIGH_CONFIDENCE_RISK, 500000);
  assert.equal(STAGE2L16_HIGH_CONFIDENCE_MARGIN, 200000);
  assert.equal(stored.freeze.highConfidenceRegionInherited.source, 'STAGE2L14');
});

/* --------------------------------------------------------------------------
 * The measuring instrument must be faithful.
 * ------------------------------------------------------------------------ */

test('the probe baseline reproduces the frozen expert on every case', () => {
  assert.equal(stored.probes.probeBaselineFaithful, true);
  const baseline = stored.probes.mechanisms.find((entry) => entry.id === 'M0_FROZEN_BASELINE');
  assert.equal(baseline.reproducesFrozenBaseline, 1);
  assert.equal(baseline.fixes, 0);
  assert.equal(baseline.breaks, 0);
});

test('a zero delta re-ranks to exactly the expert\'s own recommendation', () => {
  for (const row of sampleRows.slice(0, 40)) {
    assert.equal(rerankWithDelta(row.scored, () => 0), row.chosenActionId);
  }
});

test('every mechanism reports fixes, breaks and a net that agree', () => {
  for (const mechanism of stored.probes.mechanisms) {
    assert.equal(mechanism.net, mechanism.fixes - mechanism.breaks);
    assert.ok(mechanism.accuracy >= 0 && mechanism.accuracy <= 1);
    assert.ok(mechanism.errorShareFixed >= 0 && mechanism.errorShareFixed <= 1);
  }
  const ids = STAGE2L16_MECHANISMS.map((entry) => entry.id).sort();
  assert.deepEqual(stored.probes.mechanisms.map((entry) => entry.id).sort(), ids);
});

test('a probe that made things worse is reported as making things worse', () => {
  /* The risk-propagation probe is the honesty canary: a prevalent class whose
   * mechanism does not help must not be laundered into a recommendation. */
  const risk = stored.probes.mechanisms.find((entry) => entry.id === 'M4_RISK_PROPAGATION');
  if (risk.net <= 0) {
    assert.equal(stored.risk.nonlinearRiskDefectDetected, false);
    const candidate = stored.remediation.candidates.find((entry) => entry.mechanism === 'M4_RISK_PROPAGATION');
    assert.equal(candidate.improvesAccuracy, false);
    assert.notEqual(stored.remediation.topCandidate.mechanism, 'M4_RISK_PROPAGATION');
  }
});

/* --------------------------------------------------------------------------
 * No leakage: predicates must be computable at decision time.
 * ------------------------------------------------------------------------ */

test('classification never reads the optimal action or any outcome', () => {
  const source = readFileSync(path.join(root, 'src/lab/stage2l16-nexus-residual-error-decomposition.js'), 'utf8');
  const start = source.indexOf('export function classifyStage2L16Error');
  const body = source.slice(start, source.indexOf('\n}', start));
  for (const forbidden of ['optimalActionId', 'optimalUtility', 'nexusCorrect', 'primeCorrect', 'attribution', 'truth']) {
    assert.ok(!body.includes(forbidden), `classification must not read ${forbidden}`);
  }
  assert.equal(stored.labelLeakageDetected, false);
});

test('classifying a case does not depend on whether it was right', () => {
  /* The same predicate set applied to a CORRECT case must still return labels;
   * a taxonomy that only works on known errors is not decision-time computable. */
  const correct = sampleRows.find((row) => row.nexusCorrect && row.chosenActionId !== null);
  assert.ok(correct !== undefined);
  const result = classifyStage2L16Error(correct);
  assert.ok(Array.isArray(result.labels));
  assert.ok(STAGE2L16_ERROR_CLASSES.includes(result.dominant));
});

test('the forbidden-field list is non-empty and covers the outcome fields', () => {
  for (const field of ['optimalActionId', 'nexusCorrect', 'primeCorrect']) {
    assert.ok(STAGE2L16_FORBIDDEN_IN_PREDICATES.includes(field));
  }
});

/* --------------------------------------------------------------------------
 * Diagnostic primitives.
 * ------------------------------------------------------------------------ */

test('propagated delivery is a fixed point, not a single pass', () => {
  for (const row of sampleRows.slice(0, 20)) {
    const first = propagatedDelivery(row.world, row.index);
    const second = propagatedDelivery(row.world, row.index);
    assert.deepEqual([...first.delivering.entries()].sort(), [...second.delivering.entries()].sort());
    assert.ok(first.passes >= 1);
  }
  assert.ok(sampleRows.some((row) => row.propagationPasses > 1),
    'at least one world must require more than one pass, or the fixed point is vacuous');
});

test('propagation and the expert\'s local reading genuinely disagree somewhere', () => {
  /* If they never disagreed, SINGLE_PASS_APPROXIMATION would be an empty class. */
  assert.ok(sampleRows.some((row) => row.falseHealthyCount > 0 || row.falseBlockedCount > 0));
});

test('the local blocked test is the expert\'s, at the expert\'s threshold', () => {
  const entity = { availability: STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD - 1, baseCapacity: 10, demand: 5 };
  assert.equal(nexusLocallyBlocked(entity), true);
  assert.equal(nexusLocallyBlocked({ ...entity, availability: STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD }), false);
  assert.equal(nexusLocallyBlocked({ availability: 1000000, baseCapacity: 1, demand: 2 }), true);
});

test('the threshold gap is exactly the disagreement between expert and world', () => {
  assert.ok(STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD < STAGE2L12_AVAILABILITY_THRESHOLD);
  assert.equal(inThresholdGap({ availability: STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD }), true);
  assert.equal(inThresholdGap({ availability: STAGE2L12_AVAILABILITY_THRESHOLD - 1 }), true);
  assert.equal(inThresholdGap({ availability: STAGE2L12_AVAILABILITY_THRESHOLD }), false);
  assert.equal(inThresholdGap({ availability: STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD - 1 }), false);
});

test('strongly connected components find real cycles and no false ones', () => {
  for (const row of sampleRows.slice(0, 25)) {
    const components = stronglyConnectedComponents(row.index);
    assert.equal(components.entitiesInCycles, components.cyclicComponents.reduce((sum, entry) => sum + entry.length, 0));
    for (const component of components.cyclicComponents) assert.ok(component.length >= 1);
    const seen = new Set(components.components.flat());
    assert.equal(seen.size, row.world.entities.length, 'every entity belongs to exactly one component');
  }
});

test('value concentration is bounded and behaves at the extremes', () => {
  const single = valueConcentration({ entities: [{ objectiveValue: 100 }, { objectiveValue: 0 }], relations: [] });
  assert.equal(single.concentration, 1000000);
  assert.equal(single.bearers, 1);
  const spread = valueConcentration({ entities: Array.from({ length: 10 }, () => ({ objectiveValue: 10 })), relations: [] });
  assert.ok(spread.concentration < single.concentration);
  const none = valueConcentration({ entities: [{ objectiveValue: 0 }], relations: [] });
  assert.equal(none.totalValue, 0);
});

test('the dead-substitute predicate needs a substitute that exists but is down', () => {
  const row = sampleRows.find((entry) => entry.legalActions.some((action) => action.kind === 'BYPASS'));
  assert.ok(row !== undefined);
  for (const action of row.legalActions) {
    const flagged = bypassRestsOnDeadSubstitute(row, action.actionId);
    if (action.kind !== 'BYPASS') assert.equal(flagged, false, 'only BYPASS can rest on a substitute');
    if (flagged) {
      const substitutes = row.index.substitutesFor.get(action.targetEntityId) ?? [];
      assert.ok(substitutes.length > 0);
      assert.ok(!substitutes.some((substitute) => row.delivering.get(substitute.from) === true));
    }
  }
});

/* --------------------------------------------------------------------------
 * Taxonomy integrity.
 * ------------------------------------------------------------------------ */

test('precedence covers every class exactly once', () => {
  assert.deepEqual([...STAGE2L16_CLASS_PRECEDENCE].sort(), [...STAGE2L16_ERROR_CLASSES].sort());
  assert.equal(new Set(STAGE2L16_CLASS_PRECEDENCE).size, STAGE2L16_CLASS_PRECEDENCE.length);
});

test('every dominant class is a declared class and shares sum to one', () => {
  const total = stored.taxonomy.byDominantClass.reduce((sum, entry) => sum + entry.dominantCount, 0);
  assert.equal(total, stored.taxonomy.totalErrors);
  for (const entry of stored.taxonomy.byDominantClass) {
    assert.ok(STAGE2L16_ERROR_CLASSES.includes(entry.errorClass));
    assert.ok(entry.anyLabelCount >= entry.dominantCount, `${entry.errorClass} dominant exceeds any-label`);
  }
});

test('explained and unclassified shares are complementary', () => {
  assert.ok(Math.abs((stored.taxonomy.explainedShare + stored.taxonomy.unclassifiedShare) - 1) < 1e-6);
});

test('the high-confidence population is reported with its size, not just a rate', () => {
  assert.equal(stored.taxonomy.highConfidenceErrorCount, stored.population.highConfidenceWrong);
  if (stored.taxonomy.highConfidenceErrorCount < 30) {
    assert.equal(stored.taxonomy.highConfidenceSampleTooSmallForRates, true);
  }
  const total = stored.taxonomy.highConfidenceByDominantClass.reduce((sum, entry) => sum + entry.count, 0);
  assert.equal(total, stored.taxonomy.highConfidenceErrorCount);
});

test('scope and measured coverage are reported as different numbers', () => {
  assert.ok(Object.hasOwn(stored.feasibility, 'estimatedRemediableErrorShare'));
  assert.ok(Object.hasOwn(stored.feasibility, 'measuredErrorShareFixedByBestProbe'));
  assert.match(stored.feasibility.estimatedRemediableErrorShareMeaning, /NOT a predicted fix rate/);
  assert.ok(STAGE2L16_FEASIBILITY_CLASSES.includes(stored.nexus099Feasibility));
});

test('a marginal iterative result is flagged as marginal', () => {
  if (Math.abs(stored.cycles.iterativeDiagnosticNet) < 0.01 * stored.taxonomy.totalErrors) {
    assert.equal(stored.cycles.iterativeDiagnosticMarginal, true);
  }
});

/* --------------------------------------------------------------------------
 * Corpus, population and explanations.
 * ------------------------------------------------------------------------ */

test('the corpus covers the whole holdout and only decidable cases', () => {
  assert.equal(STAGE2L16_CORPUS.from, 0);
  assert.equal(STAGE2L16_CORPUS.to, 42000);
  assert.ok(stored.population.decidableCases > 10000);
  assert.equal(stored.residualErrorCorpusComplete, true);
  const splitTotal = Object.values(stored.population.bySplit).reduce((sum, entry) => sum + entry.cases, 0);
  assert.equal(splitTotal, stored.population.decidableCases);
});

test('per-split accuracy reproduces the figures the Nexus arc reported', () => {
  /* Stage 2L.13 measured 0.782551 on what Stage 2L.14 later called DEVELOPMENT. */
  assert.equal(stored.population.bySplit.DEVELOPMENT.accuracy, 0.782551);
  assert.equal(stored.population.bySplit.FINAL_HOLDOUT.accuracy, 0.795079);
});

test('the error population decomposes consistently', () => {
  const p = stored.population;
  assert.equal(p.totalNexusWrong + Math.round(p.nexusAccuracy * p.decidableCases), p.decidableCases);
  assert.equal(p.nexusWrongPrimeCorrect + p.nexusWrongPrimeWrong, p.totalNexusWrong);
  assert.ok(p.highConfidenceWrong <= p.structurallyEligibleWrong);
  assert.ok(p.structurallyEligibleWrong <= p.totalNexusWrong);
  assert.ok(p.abstainedWrong <= p.totalNexusWrong);
});

test('every high-confidence error carries a full explanation', () => {
  const corpus = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l16-residual-error-corpus.json'), 'utf8'));
  assert.equal(corpus.highConfidenceExplanations.length, stored.population.highConfidenceWrong);
  for (const explanation of corpus.highConfidenceExplanations) {
    assert.ok(explanation.nexusChose !== null);
    assert.ok(explanation.objectivelyOptimal !== null);
    assert.notEqual(explanation.nexusChose, explanation.objectivelyOptimal);
    assert.ok(explanation.nexusComponents !== null, 'the expert components must be shown');
    assert.ok(explanation.whyOptimalWon !== null, 'the objective decomposition must be shown');
    assert.ok(Array.isArray(explanation.groundTruthRanking) && explanation.groundTruthRanking.length > 0);
    assert.ok(STAGE2L16_ERROR_CLASSES.includes(explanation.dominantErrorClass));
  }
});

test('an explanation names why Nexus preferred its pick and why the optimum won', () => {
  const error = sampleRows.find((row) => !row.nexusCorrect && row.chosenActionId !== null);
  assert.ok(error !== undefined);
  const explanation = explainStage2L16Case(error);
  assert.equal(explanation.variant, error.variant);
  assert.ok(Object.hasOwn(explanation.whyNexusPreferredItsChoice, 'creditedBenefit'));
  assert.ok(Object.hasOwn(explanation.whyNexusPreferredItsChoice, 'restsOnDeadSubstitute'));
  assert.ok(Object.hasOwn(explanation.whyOptimalWon, 'deliveredAdvantage'));
  assert.ok(explanation.optimalRankUnderNexus >= 0 || explanation.optimalRankUnderNexus === -1);
});

test('remediation candidates carry measured coverage, not assertions', () => {
  assert.equal(stored.remediation.candidates.length, STAGE2L16_REMEDIATION_CANDIDATES.length);
  for (const candidate of stored.remediation.candidates) {
    assert.equal(typeof candidate.measuredFixes, 'number');
    assert.equal(candidate.measuredNet, candidate.measuredFixes - candidate.measuredBreaks);
    assert.match(candidate.arbiterImpact, /^None\b/, 'no candidate may require an arbiter change');
  }
  assert.equal(stored.remediation.arbiterChangeRequired, false);
  assert.equal(stored.remediation.contractChangeRequired, false);
});

/* --------------------------------------------------------------------------
 * Safety posture, determinism, stored evidence.
 * ------------------------------------------------------------------------ */

test('the diagnostic is invariant to entity and relation ordering', () => {
  const result = verifyStage2L16OrderingInvariance(20);
  assert.equal(result.orderingInvariant, true);
  assert.ok(result.compared > 0);
  assert.equal(stored.ordering.orderingInvariant, true);
});

test('safety posture is unchanged: R0, shadow only, Prime owns the recommendation', () => {
  assert.equal(stored.stage, STAGE2L16_STAGE);
  assert.equal(stored.authority, 'R0');
  assert.equal(stored.canDispatch, false);
  assert.equal(stored.canMutateLiveWorld, false);
  assert.equal(stored.arbiterShadowOnly, true);
  assert.equal(stored.finalRecommendationOwner, 'PRIME');
  assert.equal(stored.liveActionDispatches, 0);
  assert.equal(stored.worldMutations, 0);
  assert.equal(stored.authorityEscalations, 0);
  assert.equal(stored.realZeknovaDecisionDeltaMeasured, false);
});

test('certification requires the diagnostic gates and nothing about Nexus reaching 0.99', () => {
  assert.equal(stored.residualErrorCorpusComplete, true);
  assert.equal(stored.errorTaxonomyReproducible, true);
  assert.equal(stored.rootCauseCoverageMeasured, true);
  assert.equal(stored.securityRegressionPass, true);
  assert.equal(stored.stage2l16Certified, true);
  assert.equal(stored.status, 'PASS');
});

test('the outcome class is one of the declared classes', () => {
  assert.ok(['A_SINGLE_DOMINANT_REMEDIABLE_DEFECT', 'B_MULTIPLE_BOUNDED_REMEDIABLE_DEFECTS',
    'C_DEEP_REASONING_LIMITATION', 'D_HETEROGENEOUS_TAIL_ERROR', 'E_INCONCLUSIVE', 'F_BLOCKED']
    .includes(stored.nexusResidualErrorOutcome));
});

test('the inherited portability limitation is recorded, not remediated', () => {
  assert.match(stored.portabilityNote, /DIGEST_PRODUCED_SINGLE_PLATFORM/);
  const report = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l16-portability-report.json'), 'utf8'));
  assert.equal(report.portabilityStatus, 'DIGEST_PRODUCED_SINGLE_PLATFORM');
  assert.deepEqual(report.disagreeing, []);
});

test('the portability witness is a function of the certification alone', () => {
  assert.equal(buildStage2L16PortabilityDigest(stored).digest, buildStage2L16PortabilityDigest(stored).digest);
});

test('the certification reproduces from a fresh evaluation', () => {
  const again = certifyStage2L16();
  assert.equal(again.certificationHash, stored.certificationHash);
  assert.equal(again.evidenceDigest, stored.evidenceDigest);
  assert.equal(again.corpusDigest, stored.corpusDigest);
});
