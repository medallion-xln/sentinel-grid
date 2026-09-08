/* Stage 2L.18 — high-confidence tail diagnosis.
 *
 * The stage's central claim is a NEGATIVE one: no bounded decision-time rule
 * separates the wrong tail from the correct tail beyond chance. A negative claim
 * is only worth anything if the search that failed was honest, so these tests
 * attack the search, the null it was judged against, and the guard against
 * mistaking a tiny sample for a result.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STAGE2L18_STAGE,
  STAGE2L18_FROZEN_RULE_ID,
  STAGE2L18_FROZEN_RULE_TERMS,
  STAGE2L18_SECONDARY_BAND_ID,
  STAGE2L18_FEATURES,
  STAGE2L18_FORBIDDEN_IN_FEATURES,
  STAGE2L18_MATCH_TIERS,
  STAGE2L18_ACTION_KINDS,
  STAGE2L18_IDENTIFIABILITY_STATUSES,
  STAGE2L18_FEASIBILITY_CLASSES,
  STAGE2L18_MAX_CONJUNCTION_WIDTH,
  STAGE2L18_NULL_PERMUTATIONS,
  STAGE2L18_MIN_RULE_SUPPORT,
  STAGE2L18_MIN_RULE_WRONG,
  stage2L18InFrozenRule,
  stage2L18InSecondaryBand,
  buildStage2L18PortabilityDigest,
} from '../src/lab/stage2l18-high-confidence-tail-diagnosis.js';
import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l18-nexus-high-confidence-tail-diagnosis');
const stored = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l18-certification-result.json'), 'utf8'));
const inherited = JSON.parse(readFileSync(path.join(root,
  'artifacts/stage2l17-live-substitute-and-hold-remediation/stage2l17-certification-result.json'), 'utf8'));

/* --------------------------------------------------------------------------
 * The stage changed nothing.
 * ------------------------------------------------------------------------ */

test('Nexus decision behaviour is unchanged and measured to be so', () => {
  assert.equal(stored.nexusBehaviorChanged, false);
  assert.equal(stored.behaviour.behaviourUnchanged, true);
  assert.ok(stored.behaviour.compared > 0);
  assert.equal(stored.behaviour.identical, stored.behaviour.compared);
  assert.equal(stored.freeze.nexusExpertChanged, false);
  assert.equal(stored.freeze.arbiterChanged, false);
  assert.equal(stored.freeze.primeChanged, false);
});

test('the confidence rule is the inherited one, not a new search', () => {
  assert.equal(STAGE2L18_FROZEN_RULE_ID, inherited.calibration.delegatingRuleId);
  assert.equal(stored.freeze.confidenceRuleUnchanged, true);
  assert.equal(stored.freeze.newConfidenceSearchIntroduced, false);
  assert.equal(stored.freeze.reliabilityFloorLowered, false);
  assert.equal(STAGE2L14_RELIABILITY_FLOOR, 0.99);
});

test('the module declares no floor and exports no delegation path', () => {
  const source = readFileSync(path.join(root, 'src/lab/stage2l18-high-confidence-tail-diagnosis.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(code), false);
  assert.equal(/export function\s+\w*[Dd]elegat/.test(code), false);
});

/* --------------------------------------------------------------------------
 * The tail population, and its size.
 * ------------------------------------------------------------------------ */

test('the frozen rule is applied exactly as its terms declare', () => {
  const row = (risk, margin, variance) => ({
    signals: { nexusTopRiskAdjustment: risk, nexusUtilityMargin: margin },
    stability: { nexusMarginVariance: variance },
  });
  const { minRisk, minMargin, maxMarginVariance } = STAGE2L18_FROZEN_RULE_TERMS;
  assert.equal(stage2L18InFrozenRule(row(minRisk, minMargin, maxMarginVariance)), true);
  assert.equal(stage2L18InFrozenRule(row(minRisk - 1, minMargin, maxMarginVariance)), false);
  assert.equal(stage2L18InFrozenRule(row(minRisk, minMargin - 1, maxMarginVariance)), false);
  assert.equal(stage2L18InFrozenRule(row(minRisk, minMargin, maxMarginVariance + 1)), false);
});

test('the secondary band is a strict superset of the frozen rule', () => {
  const row = (risk, margin, variance) => ({
    signals: { nexusTopRiskAdjustment: risk, nexusUtilityMargin: margin },
    stability: { nexusMarginVariance: variance },
  });
  const inside = row(500000, 200000, 10000);
  assert.equal(stage2L18InFrozenRule(inside), true);
  assert.equal(stage2L18InSecondaryBand(inside), true);
  const relaxed = row(500000, 200000, 999999);
  assert.equal(stage2L18InFrozenRule(relaxed), false);
  assert.equal(stage2L18InSecondaryBand(relaxed), true, 'the band drops only the variance term');
  assert.equal(STAGE2L18_SECONDARY_BAND_ID, 'risk>=400000 & margin>=100000');
  assert.ok(stored.population.secondaryBand.total > stored.population.confidenceEligible);
});

test('the tail population decomposes consistently', () => {
  const tail = stored.population.primaryTail;
  assert.equal(tail.correct + tail.wrong, tail.total);
  assert.equal(tail.total, stored.population.confidenceEligible);
  assert.equal(tail.nexusCorrectPrimeWrong + tail.agreementCorrect, tail.correct);
  assert.equal(tail.nexusWrongPrimeCorrect + tail.agreementWrong, tail.wrong);
  assert.ok(stored.population.confidenceEligible <= stored.population.structurallyEligible);
  assert.ok(stored.population.delegationCandidates <= stored.population.confidenceEligible);
  const bySplit = Object.values(tail.bySplit).reduce((sum, entry) => sum + entry.n, 0);
  assert.equal(bySplit, tail.total);
});

test('the smallness of the tail is stated, not buried', () => {
  assert.equal(stored.population.highConfidenceWrongTotal, stored.population.primaryTail.wrong);
  if (stored.population.primaryTail.wrong < 30) {
    assert.equal(stored.population.sampleTooSmallForRates, true);
    assert.equal(stored.taxonomy.tailSharesAreCountsNotRates, true);
    assert.equal(stored.matchedControls.poweredForInference, false);
    assert.equal(stored.featureAudit.primaryTail.poweredForInference, false);
  }
});

test('every high-confidence wrong case carries a full explanation', () => {
  const corpus = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l18-tail-corpus.json'), 'utf8'));
  assert.equal(corpus.highConfidenceWrongExplanations.length, stored.population.primaryTail.wrong);
  for (const explanation of corpus.highConfidenceWrongExplanations) {
    assert.ok(explanation.nexusRecommendation !== null);
    assert.ok(explanation.optimalAction !== null);
    assert.notEqual(explanation.nexusRecommendation, explanation.optimalAction);
    assert.ok(explanation.nexusComponents !== null);
    assert.ok(Array.isArray(explanation.groundTruthRanking) && explanation.groundTruthRanking.length > 0);
    assert.ok(Array.isArray(explanation.nexusRanking));
    assert.ok(explanation.confidenceSignals.nexusTopRiskAdjustment >= STAGE2L18_FROZEN_RULE_TERMS.minRisk);
    assert.ok(explanation.confidenceSignals.nexusUtilityMargin >= STAGE2L18_FROZEN_RULE_TERMS.minMargin);
  }
  assert.equal(stored.tailCorpusComplete, true);
});

/* --------------------------------------------------------------------------
 * No leakage.
 * ------------------------------------------------------------------------ */

test('no feature reads an outcome', () => {
  const names = STAGE2L18_FEATURES.map(([name]) => name);
  for (const forbidden of STAGE2L18_FORBIDDEN_IN_FEATURES) {
    assert.ok(!names.includes(forbidden), `${forbidden} must not be a feature`);
  }
  assert.equal(stored.labelLeakageDetected, false);
  assert.deepEqual(stored.labelLeakage.forbiddenInFeatures, []);
  assert.ok(names.length >= 25, 'the audit must be broad enough to be a real search');
});

/* --------------------------------------------------------------------------
 * The search, and the null it is judged against. The decisive part.
 * ------------------------------------------------------------------------ */

test('the null searches the SAME space as the observed search', () => {
  /* An earlier draft compared a conjunction search against a single-term null,
   * which inflates the observed best relative to its threshold and manufactures
   * a signal. The two must explore the same space. */
  assert.equal(stored.nullAnalysis.searchSpace,
    'IDENTICAL_TO_OBSERVED_SEARCH_GREEDY_CONJUNCTION_UP_TO_WIDTH_3');
  assert.match(stored.nullAnalysis.note, /identical greedy conjunction search/);
  assert.ok(stored.nullAnalysis.permutations >= 100);
  assert.equal(stored.nullAnalysisComplete, true);
});

test('the null percentiles are ordered and non-degenerate', () => {
  const n = stored.nullAnalysis;
  assert.ok(n.nullMedian <= n.nullP95);
  assert.ok(n.nullP95 <= n.nullP99);
  assert.ok(n.nullP99 <= n.nullMax);
  assert.ok(n.nullMedian > 0, 'a null of zero would mean the search finds nothing even on real labels');
});

test('a signal must clear the null p99 and retain half its lift out of sample', () => {
  const v = stored.separabilityVerdict;
  assert.equal(v.lastSplitRetentionFloor, 0.5);
  const expected = stored.separability.ruleFound
    && stored.nullAnalysis.signalExceedsNullP99
    && v.ruleGeneralises;
  assert.equal(stored.separableSignal, expected);
});

test('the reported rule is judged by both criteria, and both are shown', () => {
  const v = stored.separabilityVerdict;
  assert.equal(typeof v.exceedsNullP95, 'boolean');
  assert.equal(typeof v.exceedsNullP99, 'boolean');
  assert.ok(v.calibrationRetention >= 0 && v.finalHoldoutRetention >= 0);
  if (!stored.separableSignal && stored.separability.ruleFound) {
    /* The honest failure mode: a rule was found, and it failed on the evidence
     * rather than by not being looked for. */
    assert.ok(!stored.nullAnalysis.signalExceedsNullP99 || !v.ruleGeneralises);
  }
});

test('the search was bounded and interpretable, not an opaque classifier', () => {
  assert.ok(STAGE2L18_MAX_CONJUNCTION_WIDTH <= 3);
  assert.equal(stored.separability.maxConjunctionWidth, STAGE2L18_MAX_CONJUNCTION_WIDTH);
  assert.equal(stored.separability.minRuleSupport, STAGE2L18_MIN_RULE_SUPPORT);
  assert.equal(stored.separability.minRuleWrong, STAGE2L18_MIN_RULE_WRONG);
  if (stored.separability.best !== null) {
    assert.match(stored.separability.best.id, /^[A-Za-z0-9_ >=<&.-]+$/);
    assert.ok(stored.separability.best.id.split(' & ').length <= STAGE2L18_MAX_CONJUNCTION_WIDTH);
  }
});

test('the search ran on three disjoint splits and never tuned on the holdout', () => {
  assert.equal(stored.threeWaySplitsDisjoint, true);
  assert.equal(stored.separability.splitsDisjoint, true);
  assert.ok(stored.separability.developmentCases > 0);
  assert.ok(stored.separability.calibrationCases > 0);
  assert.ok(stored.separability.finalHoldoutCases > 0);
});

test('the underpowered search is flagged as underpowered', () => {
  if (stored.separability.developmentWrong < 30) {
    assert.equal(stored.separability.developmentPoweredForSearch, false);
  }
});

/* --------------------------------------------------------------------------
 * The mechanism analyses.
 * ------------------------------------------------------------------------ */

test('matched controls are reported at every declared tier', () => {
  assert.equal(stored.matchedControls.tiers.length, STAGE2L18_MATCH_TIERS.length);
  const strict = stored.matchedControls.tiers[0];
  assert.equal(strict.tier, 'STRICT');
  assert.equal(stored.matchedControls.matchRate, strict.matchRate);
  for (const tier of stored.matchedControls.tiers) {
    assert.equal(tier.pairs.length, stored.population.primaryTail.wrong);
    assert.ok(tier.matchedWrongCases <= tier.pairs.length);
  }
  /* Looser tiers must match at least as many as stricter ones. */
  for (let index = 1; index < stored.matchedControls.tiers.length; index += 1) {
    assert.ok(stored.matchedControls.tiers[index].matchedWrongCases
      >= stored.matchedControls.tiers[index - 1].matchedWrongCases);
  }
  assert.equal(stored.matchedControlAnalysisComplete, true);
});

test('a propagation limit needs both prevalence and repair, not just prevalence', () => {
  const p = stored.propagation;
  const expected = p.highConfWrongPropagationRate > p.highConfCorrectPropagationRate
    && p.iterativeDiagnosticNetOnTail > 0;
  assert.equal(p.propagationLimitDetected, expected);
  assert.equal(p.integratedIntoExpert, false);
});

test('action homogeneity is reported as structural, not as a finding', () => {
  const a = stored.actions;
  if (a.tailIsActionHomogeneous) {
    assert.equal(a.actionKindsPresentInTail.length, 1);
    assert.match(a.homogeneityReason, /PROTECT-only by construction/);
    assert.equal(a.actionSpecificDefectDetected, false,
      'a region containing one action kind cannot evidence an action-specific defect');
  }
  for (const kind of STAGE2L18_ACTION_KINDS) {
    assert.ok(Object.hasOwn(a.tailByActionKind, kind));
  }
});

test('value diffusion is judged on the band, which has the positives for it', () => {
  const v = stored.valueDiffusion;
  const expected = v.secondaryBandWrongValueDiffuseRate > v.secondaryBandCorrectValueDiffuseRate * 1.25;
  assert.equal(v.valueModelLimitDetected, expected);
});

test('the tail taxonomy is the Stage 2L.16 classifier and is compared to the global one', () => {
  assert.equal(stored.taxonomy.classifier, 'STAGE2L16_UNCHANGED');
  const total = stored.taxonomy.tailByClass.reduce((sum, entry) => sum + entry.count, 0);
  assert.equal(total, stored.population.primaryTail.wrong);
  assert.equal(typeof stored.taxonomy.tailDominantMatchesGlobal, 'boolean');
  assert.ok(stored.taxonomy.globalDominantClass !== null);
});

test('counterfactual classes name what moved the case', () => {
  const c = stored.counterfactuals;
  const total = Object.values(c.classificationCounts).reduce((sum, value) => sum + value, 0);
  assert.equal(total, stored.population.primaryTail.wrong);
  assert.ok(!Object.hasOwn(c.classificationCounts, 'OTHER') || c.classificationCounts.OTHER === 0
    || c.costModelErrorCount + c.riskModelErrorCount >= 0);
  assert.equal(typeof c.everyCaseFixableByBoundedEdit, 'boolean');
});

/* --------------------------------------------------------------------------
 * Verdict and posture.
 * ------------------------------------------------------------------------ */

test('the identifiability status and feasibility are declared classes', () => {
  assert.ok(STAGE2L18_IDENTIFIABILITY_STATUSES.includes(stored.nexusTailIdentifiabilityStatus));
  assert.ok(STAGE2L18_FEASIBILITY_CLASSES.includes(stored.nexus099Feasibility));
  assert.ok(['A_SINGLE_TAIL_DEFECT_IDENTIFIED', 'B_MULTIPLE_TAIL_DEFECTS_IDENTIFIED',
    'C_TAIL_NOT_SEPARABLE', 'D_REPRESENTATION_LIMIT_IDENTIFIED', 'E_INCONCLUSIVE', 'F_BLOCKED']
    .includes(stored.stage2l18Outcome));
});

test('a non-separable verdict does not recommend a remediation', () => {
  if (!stored.separableSignal) {
    assert.notEqual(stored.stage2l18Outcome, 'A_SINGLE_TAIL_DEFECT_IDENTIFIED');
    assert.equal(stored.interpretation.nexusExpertRemediationRequired, false);
    assert.equal(stored.interpretation.nexusConfidenceRemediationRequired, false);
  }
});

test('certification does not require Nexus to reach 0.99', () => {
  assert.equal(stored.stage2l18Certified, true);
  assert.equal(stored.status, 'PASS');
  assert.equal(stored.delegationBoundaryCharacterized, true);
  assert.equal(stored.securityRegressionPass, true);
});

test('safety posture is unchanged: R0, shadow only, Prime owns the recommendation', () => {
  assert.equal(stored.stage, STAGE2L18_STAGE);
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

test('ordering invariance holds', () => {
  assert.equal(stored.invariance.orderingInvariant, true);
});

test('the inherited portability limitation is recorded, not remediated', () => {
  assert.match(stored.portabilityNote, /DIGEST_PRODUCED_SINGLE_PLATFORM/);
  const report = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l18-portability-report.json'), 'utf8'));
  assert.equal(report.portabilityStatus, 'DIGEST_PRODUCED_SINGLE_PLATFORM');
  assert.deepEqual(report.disagreeing, []);
});

test('the portability witness is a function of the certification alone', () => {
  assert.equal(buildStage2L18PortabilityDigest(stored).digest, buildStage2L18PortabilityDigest(stored).digest);
});

test('the null permutation count is the declared one', () => {
  assert.equal(stored.nullAnalysis.permutations, STAGE2L18_NULL_PERMUTATIONS);
});
