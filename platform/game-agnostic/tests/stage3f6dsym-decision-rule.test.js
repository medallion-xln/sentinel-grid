import test from 'node:test';
import assert from 'node:assert/strict';
import { DecisionRule, decide } from '../src/stage3f/decision-rule-v1.js';
import { HEADLINE, DIAGNOSTIC, PLAN, PLAN_HASH, SEED_PLAN, SEED_PLAN_HASH } from '../scripts/stage3f6dsym-analysis-plan.mjs';
import { sha256 } from '../src/core/determinism.js';

test('D-SYM freeze contract binds a clean, disjoint seed block and excludes V2 from the headline', () => {
  assert.equal(sha256(PLAN), PLAN_HASH);
  assert.equal(sha256(SEED_PLAN), SEED_PLAN_HASH);
  assert.deepEqual(SEED_PLAN.declared, { HOLDOUT: [3023], OOD: [3033] });
  const declared = [...SEED_PLAN.declared.HOLDOUT, ...SEED_PLAN.declared.OOD];
  assert.equal(declared.some((s) => SEED_PLAN.priorSeedSpaces.includes(s)), false);
  assert.equal(new Set(declared).size, declared.length);
  assert.deepEqual(HEADLINE, ['RESOURCE_PRESERVING_V1','NEXUS_SELECTOR_V1','OBJECTIVE_TARGETING_V1','THREAT_COVERING_V1']);
  assert.equal(HEADLINE.includes('NEXUS_SELECTOR_V2_CANDIDATE'), false);
  assert.equal(DIAGNOSTIC.includes('NEXUS_SELECTOR_V2_CANDIDATE'), true);
});

test('historical decision rules ignore candidate presentation order and never select unavailable policies', () => {
  const available = ['RESOURCE_PRESERVING_V1','NEXUS_SELECTOR','OBJECTIVE_TARGETING_V1'];
  const probabilities = { RESOURCE_PRESERVING_V1: .4, NEXUS_SELECTOR: .35, OBJECTIVE_TARGETING_V1: .25, THREAT_COVERING_V1: 0 };
  const classWeights = { RESOURCE_PRESERVING_V1: .2, NEXUS_SELECTOR: .6, OBJECTIVE_TARGETING_V1: .2, THREAT_COVERING_V1: 0 };
  const regimes = [...available, 'THREAT_COVERING_V1'];
  const costMatrix = Object.fromEntries(available.map((p, i) => [p, Object.fromEntries(regimes.map((q) => [q, i + 1]))]));
  const valueMatrix = Object.fromEntries(available.map((p, i) => [p, Object.fromEntries(regimes.map((q) => [q, 3 - i]))]));
  const args = { probabilities, available, classWeights, costMatrix, valueMatrix, nexusThreshold: .3 };
  for (const rule of Object.values(DecisionRule)) {
    const a = decide(rule, args).policy;
    const b = decide(rule, { ...args, available: [...available].reverse() }).policy;
    assert.equal(a, b, rule);
    assert.ok(available.includes(a), rule);
  }
  assert.equal(decide(DecisionRule.C_EXPECTED_REGRET, args).policy, 'RESOURCE_PRESERVING_V1');
  assert.equal(decide(DecisionRule.B_CLASS_WEIGHTED, args).policy, 'NEXUS_SELECTOR');
  assert.equal(decide(DecisionRule.A_ARGMAX, { ...args, available: [] }).status, 'ABSTAIN');
});

test('the rule hash cannot erase the accuracy and OOD guards', () => {
  assert.match(PLAN.decisionCriteria.material, /accuracy gain/);
  assert.match(PLAN.decisionCriteria.mixedTradeoff, /TRADEOFF/);
  assert.match(PLAN.decisionCriteria.ood, /REVERSES/);
  assert.equal(PLAN.authority.tier, 'R0');
  assert.equal(PLAN.authority.canDispatch, false);
});
