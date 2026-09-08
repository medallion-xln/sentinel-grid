/* Stage 2L.17 — live-substitute validation and do-nothing baseline.
 *
 * An expert-remediation stage earns trust by proving three things: that the
 * defect it claims to fix was real, that its measuring baseline is the frozen
 * expert and not a drifting copy of it, and that the improvement was not bought
 * by importing the answer key or by loosening a threshold.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STAGE2L17_EXPERT_ID,
  STAGE2L17_VARIANTS,
  STAGE2L17_SELECTED_VARIANT,
  STAGE2L17_REMEDIATION_MODEL,
  STAGE2L17_NEXUS_OPERATIONAL_THRESHOLD,
  evaluateStage2L17Nexus,
  buildStage2L17Index,
  substituteWouldCarry,
  summariseSubstitutes,
  estimateHoldBaseline,
  alreadyDelivering,
} from '../src/lab/stage2l17-live-substitute-hold-nexus.js';
import {
  STAGE2L17_STAGE,
  STAGE2L17_ABLATION_VARIANTS,
  STAGE2L17_ADVERSARIAL_CASES,
  STAGE2L17_FORBIDDEN_IN_EXPERT,
  buildStage2L17AuditWorld,
  STAGE2L17_AUDIT_ACTIONS,
  runStage2L17Audits,
  runStage2L17AdversarialSuite,
  buildStage2L17RuleSet,
  buildStage2L17Row,
} from '../src/lab/stage2l17-live-substitute-hold-remediation.js';
import { evaluateValueAwareNexus, STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD } from '../src/lab/stage2l13-value-aware-nexus.js';
import { deriveGroundTruth } from '../src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js';
import { STAGE2L14_RELIABILITY_FLOOR, STAGE2L14_MAX_HARMFUL_CHANGE_RATE } from '../src/lab/stage2l14-nexus-confidence-calibration.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l17-live-substitute-and-hold-remediation');
const stored = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l17-certification-result.json'), 'utf8'));

const sampleRows = [];
for (let variant = 0; sampleRows.length < 80 && variant < 500; variant += 1) {
  const row = buildStage2L17Row(variant);
  if (row !== null) sampleRows.push(row);
}

/* --------------------------------------------------------------------------
 * The baseline must BE the frozen expert, not a copy that drifted.
 * ------------------------------------------------------------------------ */

test('the INHERITED variant reproduces the frozen Stage 2L.13 expert exactly', () => {
  for (const row of sampleRows) {
    const frozen = evaluateValueAwareNexus(row.world, row.legalActions, { inheritedSignals: false });
    const replica = evaluateStage2L17Nexus(row.world, row.legalActions, { variant: 'INHERITED' });
    assert.equal(replica.recommendedActionId, frozen.recommendedActionId);
    assert.deepEqual(replica.ranked, frozen.ranked);
    for (const key of Object.keys(frozen.signals)) {
      assert.deepEqual(replica.signals[key], frozen.signals[key], `signal ${key} drifted`);
    }
  }
});

test('the certification gates on that faithfulness', () => {
  assert.equal(stored.expertReproducesInherited, true);
  assert.equal(stored.ablation.inheritedVariantFaithful, true);
  const inherited = stored.ablation.results.find((entry) => entry.variant === 'INHERITED');
  assert.equal(inherited.reproducesInheritedRate, 1);
  assert.equal(inherited.fixes, 0);
  assert.equal(inherited.breaks, 0);
});

test('the frozen expert file was not edited', () => {
  const baseline = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l17-baseline-audit.json'), 'utf8'));
  const owner = baseline.freeze.owners.find((entry) => entry.path.includes('stage2l13-value-aware-nexus.js'));
  assert.equal(owner.unchanged, true);
  assert.equal(baseline.freeze.allUnchanged, true);
  assert.equal(stored.freeze.inheritedExpertPreserved, true);
});

/* --------------------------------------------------------------------------
 * The defect was real, and is repaired.
 * ------------------------------------------------------------------------ */

test('the inherited expert credits a BYPASS whose substitutes cannot carry', () => {
  for (const spec of [
    { substituteAvailable: true, substituteHasCapacity: false },
    { substituteAvailable: true, substituteDependencyMet: false },
  ]) {
    const world = buildStage2L17AuditWorld(spec);
    const actions = [...STAGE2L17_AUDIT_ACTIONS];
    const frozen = evaluateValueAwareNexus(world, actions, { inheritedSignals: false });
    const entry = frozen.scored.find((item) => item.actionId === 'a-bypass-t');
    assert.ok(entry.relationalBenefit > 0, 'the inherited expert must credit the dead bypass');
    assert.equal(frozen.recommendedActionId, 'a-bypass-t');
    assert.notEqual(deriveGroundTruth(world, actions).optimalActionId, 'a-bypass-t');
  }
});

test('the remediated expert withholds credit from a dead substitute', () => {
  for (const spec of [
    { substituteAvailable: true, substituteHasCapacity: false },
    { substituteAvailable: true, substituteDependencyMet: false },
    { substituteAvailable: true, substituteHasCapacity: false, secondSubstitute: { available: true, hasCapacity: false } },
  ]) {
    const world = buildStage2L17AuditWorld(spec);
    const actions = [...STAGE2L17_AUDIT_ACTIONS];
    const remediated = evaluateStage2L17Nexus(world, actions, {});
    const entry = remediated.scored.find((item) => item.actionId === 'a-bypass-t');
    assert.equal(entry.relationalBenefit, 0);
    assert.equal(entry.bypassSupportValid, false);
    assert.equal(remediated.recommendedActionId, deriveGroundTruth(world, actions).optimalActionId);
  }
});

test('a merely UNAVAILABLE substitute still counts, because BYPASS repairs that', () => {
  /* The trap Stage 2L.16's probe fell into. Judging usability by current delivery
   * would reject the one case the action exists to handle. */
  const world = buildStage2L17AuditWorld({ substituteAvailable: false });
  const actions = [...STAGE2L17_AUDIT_ACTIONS];
  assert.equal(deriveGroundTruth(world, actions).optimalActionId, 'a-bypass-t');
  const remediated = evaluateStage2L17Nexus(world, actions, {});
  assert.equal(remediated.recommendedActionId, 'a-bypass-t');
  const index = buildStage2L17Index(world);
  assert.equal(substituteWouldCarry(index, 's'), true);
});

test('one live substitute among dead ones is enough', () => {
  const world = buildStage2L17AuditWorld({
    substituteAvailable: true, substituteHasCapacity: false,
    secondSubstitute: { available: false, hasCapacity: true },
  });
  const index = buildStage2L17Index(world);
  const summary = summariseSubstitutes(index, 't');
  assert.equal(summary.substituteCount, 2);
  assert.equal(summary.liveSubstituteCount, 1);
  assert.equal(summary.bypassSupportValid, true);
  assert.equal(summary.bypassReason, 'LIVE_SUBSTITUTE_AVAILABLE');
});

test('the audit records both defects as reproduced before repair', () => {
  const audits = runStage2L17Audits(deriveGroundTruth);
  assert.equal(audits.liveSubstituteDefectReproduced, true);
  assert.equal(audits.liveSubstituteDefectRepaired, true);
  assert.equal(audits.holdBaselineDefectReproduced, true);
  assert.equal(stored.audits.liveSubstituteDefectReproduced, true);
  assert.equal(stored.audits.holdBaselineDefectReproduced, true);
});

test('substitute usability ignores availability but not capacity or dependencies', () => {
  const index = buildStage2L17Index(buildStage2L17AuditWorld({ substituteAvailable: false }));
  assert.equal(substituteWouldCarry(index, 's'), true, 'unavailable is repairable by BYPASS');
  const starved = buildStage2L17Index(buildStage2L17AuditWorld({ substituteHasCapacity: false }));
  assert.equal(substituteWouldCarry(starved, 's'), false);
  const blocked = buildStage2L17Index(buildStage2L17AuditWorld({ substituteDependencyMet: false }));
  assert.equal(substituteWouldCarry(blocked, 's'), false);
  assert.equal(substituteWouldCarry(index, 'does-not-exist'), false);
});

/* --------------------------------------------------------------------------
 * The do-nothing baseline.
 * ------------------------------------------------------------------------ */

test('value already flowing is not credited to an intervention', () => {
  const world = buildStage2L17AuditWorld({ targetAvailable: true, substituteAvailable: true });
  const index = buildStage2L17Index(world);
  assert.equal(alreadyDelivering(index, 'v'), true);
  const baseline = estimateHoldBaseline(index);
  assert.ok(baseline.estimatedDeliveredValue > 0);
  assert.equal(baseline.estimatedRecoverableValue, 0);
  assert.equal(baseline.nothingToRecover, true);
});

test('the hold baseline reports recoverable value when something is broken', () => {
  const index = buildStage2L17Index(buildStage2L17AuditWorld({ targetAvailable: false, substituteAvailable: false }));
  const baseline = estimateHoldBaseline(index);
  assert.ok(baseline.estimatedRecoverableValue > 0);
  assert.equal(baseline.nothingToRecover, false);
  assert.equal(baseline.holdBaselineSchema, 'NEXUS_HOLD_BASELINE_V1');
});

/* --------------------------------------------------------------------------
 * Ablation discipline.
 * ------------------------------------------------------------------------ */

test('every declared variant was measured', () => {
  assert.deepEqual(stored.ablation.results.map((entry) => entry.variant).sort(),
    [...STAGE2L17_ABLATION_VARIANTS].sort());
  for (const entry of stored.ablation.results) {
    assert.equal(entry.netErrorsEliminated, entry.fixes - entry.breaks);
    assert.ok(Object.hasOwn(STAGE2L17_VARIANTS, entry.variant));
  }
});

test('the selected variant is the one the evidence supports, not the fullest one', () => {
  assert.equal(stored.ablation.selectionMatchesEvidence, true);
  assert.equal(stored.variantSelected, stored.ablation.bestByNet);
  assert.equal(STAGE2L17_SELECTED_VARIANT, stored.variantSelected);
  const selected = stored.ablation.results.find((entry) => entry.variant === stored.variantSelected);
  for (const entry of stored.ablation.results) {
    assert.ok(selected.netErrorsEliminated >= entry.netErrorsEliminated,
      `${entry.variant} beats the selected variant`);
  }
});

test('a variant that degraded accuracy is reported as degrading it', () => {
  const abstain = stored.ablation.results.find((entry) => entry.variant === 'HOLD_ABSTAIN_ONLY');
  if (abstain.netErrorsEliminated < 0) {
    assert.notEqual(stored.variantSelected, 'HOLD_ABSTAIN_ONLY');
    assert.notEqual(stored.variantSelected, 'BOTH');
    assert.equal(stored.ablation.combiningEverythingIsBest, false);
  }
});

test('the reason abstention cannot help here is recorded, not hidden', () => {
  assert.equal(stored.ablation.holdIsNeverOptimal, true);
  assert.match(stored.ablation.note, /decidability-filtered/);
  const model = STAGE2L17_REMEDIATION_MODEL.corrections.find((entry) => entry.id === 'DO_NOTHING_BASELINE_ABSTENTION');
  assert.equal(model.selected, false);
  assert.match(model.notSelectedBecause, /untestable on this corpus rather than disproven/);
});

/* --------------------------------------------------------------------------
 * No benchmark copying.
 * ------------------------------------------------------------------------ */

test('the expert imports no benchmark module and names no ground-truth symbol', () => {
  const source = readFileSync(path.join(root, 'src/lab/stage2l17-live-substitute-hold-nexus.js'), 'utf8');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  for (const specifier of imports) {
    assert.ok(!/stage2l12|stage2l14|stage2l15|stage2l16/.test(specifier), `forbidden import ${specifier}`);
  }
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const symbol of STAGE2L17_FORBIDDEN_IN_EXPERT) {
    assert.ok(!new RegExp(`\\b${symbol}\\b`).test(code), `expert code names ${symbol}`);
  }
  assert.equal(stored.freeze.groundTruthUnchanged, true);
  assert.equal(STAGE2L17_REMEDIATION_MODEL.importsBenchmarkScoring, false);
});

test('the expert threshold is the inherited one, not the world\'s', () => {
  /* Aligning it with the world's 600000 would be reading the answer key. */
  assert.equal(STAGE2L17_NEXUS_OPERATIONAL_THRESHOLD, STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD);
  assert.equal(STAGE2L17_NEXUS_OPERATIONAL_THRESHOLD, 500000);
});

/* --------------------------------------------------------------------------
 * Inherited thresholds and methodology.
 * ------------------------------------------------------------------------ */

test('the reliability floor and harm ceilings are untouched', () => {
  assert.equal(STAGE2L14_RELIABILITY_FLOOR, 0.99);
  assert.equal(STAGE2L14_MAX_HARMFUL_CHANGE_RATE, 0.01);
  assert.equal(stored.freeze.reliabilityFloorLowered, false);
  assert.equal(stored.freeze.reliabilityFloor, 0.99);
  assert.equal(stored.freeze.confidenceMethodologyInherited, true);
  assert.equal(stored.calibration.methodology, 'STAGE2L14_AND_STAGE2L15_INHERITED_UNCHANGED');
});

test('no fixed-point reasoning entered the expert', () => {
  assert.equal(stored.freeze.fixedPointReasoningAdded, false);
  assert.equal(stored.fixedPoint.implementedInExpert, false);
  assert.equal(STAGE2L17_REMEDIATION_MODEL.usesFixedPointReasoning, false);
  const source = readFileSync(path.join(root, 'src/lab/stage2l17-live-substitute-hold-nexus.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/for\s*\(\s*let\s+pass/.test(code), 'the expert must contain no propagation loop');
});

test('the confidence rule set is the inherited ladder', () => {
  const rules = buildStage2L17RuleSet();
  assert.equal(rules.length, stored.calibration.ruleCount);
  for (const rule of rules) assert.match(rule.id, /^[A-Za-z0-9_ >=<&.]+$/);
});

/* --------------------------------------------------------------------------
 * Measured improvement.
 * ------------------------------------------------------------------------ */

test('accuracy improved and net errors were eliminated', () => {
  assert.ok(stored.blind.after.accuracy > stored.blind.before.accuracy);
  assert.ok(stored.taxonomy.netErrorsEliminated > 0);
  assert.equal(stored.taxonomy.netErrorsEliminated,
    stored.taxonomy.errorsEliminated - stored.taxonomy.newErrorsIntroduced);
  assert.equal(stored.taxonomy.relabellingOnly, false);
  assert.equal(stored.taxonomy.totalErrorsAfter,
    stored.taxonomy.totalErrorsBefore - stored.taxonomy.netErrorsEliminated);
});

test('both targeted defect regions improved', () => {
  assert.ok(stored.blind.after.deadSubstituteRegion.accuracy > stored.blind.before.deadSubstituteRegion.accuracy);
  assert.ok(stored.blind.after.worseThanHoldErrorRate < stored.blind.before.worseThanHoldErrorRate);
  assert.ok(stored.blind.after.bypassToRestoreErrorCount < stored.blind.before.bypassToRestoreErrorCount);
  assert.equal(stored.liveSubstituteRemediationPass, true);
  assert.equal(stored.holdBaselineRemediationPass, true);
});

test('the taxonomy replay used the Stage 2L.16 classifier unchanged', () => {
  assert.equal(stored.taxonomy.classifier, 'STAGE2L16_UNCHANGED');
  const substitute = stored.taxonomy.movement.find((entry) => entry.errorClass === 'SUBSTITUTE_MISVALUATION');
  assert.ok(substitute.after < substitute.before, 'the targeted class must shrink');
});

test('a dominant class that was merely promoted is not called newly exposed', () => {
  if (stored.taxonomy.dominantClassChanged && stored.taxonomy.dominantAfterWasAlreadyProminent) {
    assert.equal(stored.taxonomy.newlyExposedDominantClass, false);
    assert.notEqual(stored.nexusRemediationOutcome, 'F_NEW_DOMINANT_DEFECT_EXPOSED');
  }
});

test('Prime is unchanged and reproduces the inherited figure', () => {
  assert.equal(stored.delegation.primeOnlyAccuracy, 0.399512);
  assert.equal(stored.freeze.primeChanged, false);
  assert.equal(stored.freeze.arbiterChanged, false);
});

/* --------------------------------------------------------------------------
 * Adversarial and safety.
 * ------------------------------------------------------------------------ */

test('every adversarial probe fails closed and stays isolated', () => {
  const suite = runStage2L17AdversarialSuite();
  assert.equal(Object.keys(suite).length, STAGE2L17_ADVERSARIAL_CASES.length);
  for (const [name, result] of Object.entries(suite)) {
    assert.equal(result.threw, false, `${name} threw instead of failing closed`);
    assert.equal(result.failsClosed, true, `${name} did not fail closed`);
  }
  assert.equal(stored.securityRegressionPass, true);
});

test('a malformed or unknown condition never produces a confident dead bypass', () => {
  const suite = runStage2L17AdversarialSuite();
  for (const name of ['DEAD_SUBSTITUTE_LOOKS_STRUCTURALLY_VALID', 'DUPLICATE_SUBSTITUTES', 'MALFORMED_SUBSTITUTE_STATE']) {
    assert.notEqual(suite[name].recommendedActionId, 'a-bypass-t');
  }
});

test('an unknown variant is rejected rather than silently defaulted', () => {
  const world = buildStage2L17AuditWorld({});
  assert.throws(() => evaluateStage2L17Nexus(world, [...STAGE2L17_AUDIT_ACTIONS], { variant: 'NOT_A_VARIANT' }),
    /STAGE2L17_UNKNOWN_VARIANT/);
});

test('replay determinism and ordering invariance hold', () => {
  assert.equal(stored.invariance.replayEquivalent, true);
  assert.equal(stored.invariance.orderingInvariant, true);
  for (const row of sampleRows.slice(0, 20)) {
    const reversed = {
      entities: [...row.world.entities].reverse().map((entity) => ({ ...entity })),
      relations: [...row.world.relations].reverse().map((relation) => ({ ...relation })),
    };
    const forward = evaluateStage2L17Nexus(row.world, row.legalActions, {});
    const backward = evaluateStage2L17Nexus(reversed, [...row.legalActions].reverse(), {});
    assert.equal(backward.recommendedActionId, forward.recommendedActionId);
  }
});

test('the expert stays advisory at R0', () => {
  const result = evaluateStage2L17Nexus(buildStage2L17AuditWorld({}), [...STAGE2L17_AUDIT_ACTIONS], {});
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.actionGeneration, false);
  assert.deepEqual(result.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false });
  assert.equal(result.expertId, STAGE2L17_EXPERT_ID);
});

/* --------------------------------------------------------------------------
 * Delegation is a separate verdict from remediation.
 * ------------------------------------------------------------------------ */

test('expert remediation passing does not by itself certify delegation', () => {
  assert.equal(stored.expertRemediationPass, true);
  assert.equal(stored.stage2l17Certified, stored.expertRemediationPass);
  if (stored.delegation.nexusDelegationPrecision < STAGE2L14_RELIABILITY_FLOOR) {
    assert.equal(stored.reliabilityPass, false);
    assert.equal(stored.safeDelegationPass, false);
    assert.equal(stored.nexusSafeForSelectiveDelegation, false);
  }
});

test('delegation accounting is internally consistent', () => {
  const d = stored.delegation;
  assert.equal(d.correctPrimeBreaks, d.harmfulChanges);
  assert.ok(d.beneficialChanges + d.harmfulChanges <= d.nexusDelegations);
  assert.ok(d.harmfulOpportunitiesRejected <= d.harmfulOpportunities);
  assert.equal(d.reliabilityFloorLowered, false);
  assert.equal(d.delegationForced, false);
});

test('the outcome class is one of the declared classes', () => {
  assert.ok(['A_EXPERT_FIXED_AND_SAFE_DELEGATION_CERTIFIED', 'B_EXPERT_FIXED_DELEGATION_STILL_BELOW_FLOOR',
    'C_LIVE_SUBSTITUTE_FIXED_HOLD_REMAINS_LIMITING', 'D_HOLD_FIXED_SUBSTITUTE_REMAINS_LIMITING',
    'E_BOUNDED_REMEDIATION_INSUFFICIENT', 'F_NEW_DOMINANT_DEFECT_EXPOSED', 'G_BLOCKED']
    .includes(stored.nexusRemediationOutcome));
});

test('safety posture is unchanged: R0, shadow only, Prime owns the recommendation', () => {
  assert.equal(stored.stage, STAGE2L17_STAGE);
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

test('the inherited portability limitation is recorded, not remediated', () => {
  assert.match(stored.portabilityNote, /DIGEST_PRODUCED_SINGLE_PLATFORM/);
  const report = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l17-portability-report.json'), 'utf8'));
  assert.equal(report.portabilityStatus, 'DIGEST_PRODUCED_SINGLE_PLATFORM');
  assert.deepEqual(report.disagreeing, []);
});
