#!/usr/bin/env node
/* DEV/CAL-only fitting and analysis freeze. It never opens a sealed partition. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { DEPLOYABLE_PROFILES, DeployableProfile } from '../src/stage3f/deployable-feature-contract-v1.js';
import { ROUTED_POLICIES, evaluateStrategy, fitPolicyRouter, policyRouterHash, scorePolicies } from '../src/stage3f/policy-router-v1.js';
import { STAGE3F6D_METHODOLOGY, DecisionRule, calibrateProbabilities, classWeightsFromDev, costMatrixHash, decide, matrixFromDev, softCrossEntropy } from '../src/stage3f/decision-rule-v1.js';
import { readCorpus } from './generate-stage3f6p1e-policy-evidence.mjs';
import { HEADLINE_POLICY_SET_HASH, DIAGNOSTIC_POLICY_SET_HASH, PLAN, PLAN_HASH, PLAN_PATH, FREEZE_PATH, OUT, SEED_PLAN_HASH } from './stage3f6dsym-analysis-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const RES = 'RESOURCE_PRESERVING_V1';
const source = { [RES]: RES, NEXUS_SELECTOR: 'NEXUS_SELECTOR_V1', OBJECTIVE_TARGETING_V1: 'OBJECTIVE_TARGETING_V1', THREAT_COVERING_V1: 'THREAT_COVERING_V1' };
export const FEATURES = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort();
export function routerRow(r) {
  const chosen = {}; const regret = {}; const correct = {};
  for (const [slot, p] of Object.entries(source)) {
    const k = r.policies[p]; chosen[slot] = k;
    if (k !== null) { regret[slot] = r.actions[k].r; correct[slot] = r.actions[k].o; }
  }
  return { partition: r.partition, recordHash: r.recordHash, combination: r.combination, orientation: r.orientation, core: r.core,
    label: r.label, actions: r.actions, chosen, regret, correct, maxRegret: Math.max(...Object.values(r.actions).map((a) => a.r)),
    equivariance: r.equivariance, policies: r.policies };
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
export function buildFreeze() {
  const corpus = readCorpus();
  const DEV = corpus.filter((r) => r.partition === 'DEV').map(routerRow);
  const CAL = corpus.filter((r) => r.partition === 'CAL').map(routerRow);
  const model = fitPolicyRouter(DEV, FEATURES);
  const routerHash = policyRouterHash(model);
  const tsym = JSON.parse(readFileSync(at('artifacts/stage3f6tsym-router-value/stage3f6tsym-open-phase-report.json'), 'utf8'));
  if (routerHash !== tsym.router.routerHash) throw new Error('symmetric DEV router differs from T-SYM frozen fit');
  const matrix = matrixFromDev(DEV); const weights = classWeightsFromDev(DEV);
  const probabilities = (row, T) => { const s = scorePolicies(model, row); return { available: s.available, probabilities: calibrateProbabilities(s.probabilities, s.available, T) }; };
  const tempGrid = STAGE3F6D_METHODOLOGY.temperatureGrid.map((T) => ({ T, crossEntropy: softCrossEntropy(CAL.map((row) => ({ row, probabilities: probabilities(row, T).probabilities }))) }));
  const temperature = [...tempGrid].sort((a, b) => a.crossEntropy - b.crossEntropy || a.T - b.T)[0].T;
  const choose = (rule, tau, row) => decide(rule, { ...probabilities(row, temperature), classWeights: weights.weights,
    costMatrix: matrix.cost, valueMatrix: matrix.value, nexusThreshold: tau }).policy;
  const nexusGrid = STAGE3F6D_METHODOLOGY.nexusThresholdGrid.map((tau) => { const e = evaluateStrategy(CAL, (r) => choose(DecisionRule.E_NEXUS_THRESHOLD, tau, r));
    return { tau, meanRegret: e.meanRegret, accuracy: e.accuracy }; });
  const nexusThreshold = [...nexusGrid].sort((a, b) => a.meanRegret - b.meanRegret || b.accuracy - a.accuracy || b.tau - a.tau)[0].tau;
  const bestCandidates = ROUTED_POLICIES.filter((p) => [DEV, CAL].every((part) => part.every((r) => r.chosen[p] !== null)))
    .map((p) => ({ policy: p, meanRegret: evaluateStrategy([...DEV, ...CAL], () => p).meanRegret }))
    .sort((a, b) => a.meanRegret - b.meanRegret || ROUTED_POLICIES.indexOf(a.policy) - ROUTED_POLICIES.indexOf(b.policy));
  const bestSingle = bestCandidates[0]?.policy;
  if (bestSingle !== tsym.router.bestSingle.policy) throw new Error('best-single selection differs from T-SYM');
  const calAccuracy = (p) => evaluateStrategy(CAL, () => p).accuracy;
  const cascade = [...ROUTED_POLICIES.filter((p) => p !== bestSingle && calAccuracy(p) > calAccuracy(bestSingle))
    .sort((a, b) => calAccuracy(b) - calAccuracy(a) || ROUTED_POLICIES.indexOf(a) - ROUTED_POLICIES.indexOf(b)), bestSingle];
  if (JSON.stringify(cascade) !== JSON.stringify(tsym.cascades.HEADLINE)) throw new Error('cascade selection differs from T-SYM');
  const confidenceGrid = tsym.router.calibration.grid;
  const threshold = tsym.router.calibration.threshold;
  const calRules = Object.fromEntries(Object.values(DecisionRule).map((rule) => [rule, evaluateStrategy(CAL, (r) => choose(rule, nexusThreshold, r))]));
  const headlineChoice = [DecisionRule.B_CLASS_WEIGHTED, DecisionRule.C_EXPECTED_REGRET, DecisionRule.D_EXPECTED_VALUE, DecisionRule.E_NEXUS_THRESHOLD]
    .sort((a, b) => calRules[a].meanRegret - calRules[b].meanRegret || calRules[b].accuracy - calRules[a].accuracy)[0];
  const freeze = { schemaVersion: 1, stage: PLAN.stage, planHash: PLAN_HASH, seedPlanHash: SEED_PLAN_HASH,
    headlinePolicySetHash: HEADLINE_POLICY_SET_HASH, diagnosticPolicySetHash: DIAGNOSTIC_POLICY_SET_HASH,
    decisionRuleHash: sha256({ historical: STAGE3F6D_METHODOLOGY, rules: PLAN.rules, criteria: PLAN.decisionCriteria }),
    corpusHash: PLAN.predecessors.corpusContentHash, devN: DEV.length, calN: CAL.length,
    model: { routerHash, featureKeys: model.featureKeys, mu: model.mu, sd: model.sd, W: model.W, family: model.family },
    costMatrix: matrix.cost, valueMatrix: matrix.value, costMatrixCells: matrix.cells, costMatrixHash: costMatrixHash(matrix), classWeights: weights,
    cal: { temperature, temperatureGrid: tempGrid, nexusThreshold, nexusGrid, bestSingle, cascade, confidenceGrid, threshold, calRules, headlineChoice },
    sealedUnopenedAtFreeze: true, authority: PLAN.authority };
  freeze.analysisFreezeHash = hex(JSON.stringify(freeze));
  return freeze;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const freeze = buildFreeze();
  await mkdir(at(OUT), { recursive: true });
  const planFile = JSON.parse(readFileSync(at(PLAN_PATH), 'utf8'));
  if (planFile.planHash !== PLAN_HASH) throw new Error('analysis plan file mismatch');
  const check = process.argv.includes('--check');
  if (check) {
    const stored = JSON.parse(readFileSync(at(FREEZE_PATH), 'utf8'));
    const reproduced = JSON.stringify(stored) === JSON.stringify(freeze);
    console.log(JSON.stringify({ reproduced, analysisFreezeHash: freeze.analysisFreezeHash, routerHash: freeze.model.routerHash }));
    if (!reproduced) process.exitCode = 1;
  } else {
    await writeFile(at(FREEZE_PATH), `${JSON.stringify(freeze, null, 2)}\n`);
    console.log(JSON.stringify({ analysisFreezeHash: freeze.analysisFreezeHash, routerHash: freeze.model.routerHash,
      temperature: freeze.cal.temperature, nexusThreshold: freeze.cal.nexusThreshold, bestSingle: freeze.cal.bestSingle,
      cascade: freeze.cal.cascade, headlineChoice: freeze.cal.headlineChoice }));
  }
}
