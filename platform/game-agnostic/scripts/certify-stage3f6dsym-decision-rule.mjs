#!/usr/bin/env node
/* Stage 3F.6-D-SYM certification. All fitting is DEV-only; CAL chooses constants; fresh splits only evaluate. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeededRandom, sha256 } from '../src/core/determinism.js';
import { DecisionRule, calibrateProbabilities, decide } from '../src/stage3f/decision-rule-v1.js';
import { ROUTED_POLICIES, availablePolicies, bestPolicySet, policyRouterHash, quantile, scorePolicies } from '../src/stage3f/policy-router-v1.js';
import { evidenceFor } from './generate-stage3f6p1e-policy-evidence.mjs';
import { buildFreeze, routerRow } from './stage3f6dsym-freeze.mjs';
import { EVALUATION_FILES, FRESH_PATH, MANIFEST_PATH, frozenGate, priorLineage, seedAudit } from './generate-stage3f6dsym-confirmatory.mjs';
import { DIAGNOSTIC_POLICY_SET_HASH, FREEZE_PATH, HEADLINE_POLICY_SET_HASH, OUT, PLAN, PLAN_HASH, PLAN_PATH, SEED_PLAN, SEED_PLAN_HASH } from './stage3f6dsym-analysis-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const checkOnly = process.argv.includes('--check');
const RESULT = `${OUT}/stage3f6dsym-certification-result.json`;
const RES = 'RESOURCE_PRESERVING_V1', NEX = 'NEXUS_SELECTOR', OBJ = 'OBJECTIVE_TARGETING_V1', THR = 'THREAT_COVERING_V1';
const SPECIALISTS = [NEX, OBJ, THR];
const RULES = ['BEST_SINGLE_POLICY','SIMPLE_CASCADE','ARGMAX_ROUTER','EXPECTED_REGRET_ROUTER','CLASS_WEIGHTED_ROUTER',
  'EXPECTED_VALUE_ROUTER','NEXUS_THRESHOLD_ROUTER','PERFECT_SELECTOR_REFERENCE'];
const RULE_MAP = { ARGMAX_ROUTER: DecisionRule.A_ARGMAX, EXPECTED_REGRET_ROUTER: DecisionRule.C_EXPECTED_REGRET,
  CLASS_WEIGHTED_ROUTER: DecisionRule.B_CLASS_WEIGHTED, EXPECTED_VALUE_ROUTER: DecisionRule.D_EXPECTED_VALUE,
  NEXUS_THRESHOLD_ROUTER: DecisionRule.E_NEXUS_THRESHOLD };
const SOURCE = { [RES]: RES, [NEX]: 'NEXUS_SELECTOR_V1', [OBJ]: OBJ, [THR]: THR };
const round = (x) => typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : x;
const roundDeep = (x) => Array.isArray(x) ? x.map(roundDeep) : x && typeof x === 'object'
  ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, roundDeep(v)])) : round(x);
const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const rate = (a, fn) => a.length ? a.filter(fn).length / a.length : null;
const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });

const planFile = readJson(PLAN_PATH), freeze = readJson(FREEZE_PATH), recomputedFreeze = buildFreeze();
const freezeReproduced = JSON.stringify(freeze) === JSON.stringify(recomputedFreeze);
const manifest = readJson(MANIFEST_PATH);
const freshText = gunzipSync(readFileSync(at(FRESH_PATH))).toString('utf8');
const fresh = freshText.split('\n').filter(Boolean).map((line) => JSON.parse(line));
const prior = priorLineage();
const priorAudit = seedAudit(prior.rows);
const priorHashes = { record: new Set(prior.rows.map((r) => r.recordHash)), world: new Set(prior.rows.map((r) => r.worldHash)),
  topology: new Set(prior.rows.map((r) => r.topologyHash)) };
const model = { family: freeze.model.family, policies: ROUTED_POLICIES, featureKeys: freeze.model.featureKeys,
  mu: freeze.model.mu, sd: freeze.model.sd, W: freeze.model.W };
const groups = { HOLDOUT: fresh.filter((r) => r.partition === 'DSYM_HOLDOUT'), OOD: fresh.filter((r) => r.partition === 'DSYM_OOD') };
const rows = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map(routerRow)]));
const decisionRuleHash = sha256({ historical: planFile.historicalInventory.methodology, rules: PLAN.rules, criteria: PLAN.decisionCriteria });
const scoreCache = new Map();
function scored(r) {
  if (!scoreCache.has(r.recordHash)) {
    const s = scorePolicies(model, r);
    scoreCache.set(r.recordHash, { available: s.available,
      probabilities: calibrateProbabilities(s.probabilities, s.available, freeze.cal.temperature) });
  }
  return scoreCache.get(r.recordHash);
}
function choose(rule, r) {
  if (rule === 'BEST_SINGLE_POLICY') return r.chosen[freeze.cal.bestSingle] === null ? null : freeze.cal.bestSingle;
  if (rule === 'SIMPLE_CASCADE') return freeze.cal.cascade.find((p) => r.chosen[p] !== null) ?? null;
  if (rule === 'PERFECT_SELECTOR_REFERENCE') return bestPolicySet(r).best[0] ?? null;
  return decide(RULE_MAP[rule], { ...scored(r), classWeights: freeze.classWeights.weights,
    costMatrix: freeze.costMatrix, valueMatrix: freeze.valueMatrix, nexusThreshold: freeze.cal.nexusThreshold }).policy;
}
const nr = (r, p) => r.maxRegret > 0 ? r.regret[p] / r.maxRegret : 0;
const outcomes = (subset, rule) => subset.map((r) => { const p = choose(rule, r); return p === null ? { p: null, accuracy: 0, regret: null, normalizedRegret: null, catastrophic: 0 }
  : { p, accuracy: r.correct[p], regret: r.regret[p], normalizedRegret: nr(r, p), catastrophic: r.regret[p] >= 100 ? 1 : 0 }; });
function metrics(subset, rule) {
  const o = outcomes(subset, rule); const acting = o.filter((x) => x.p !== null); const dist = Object.fromEntries([...ROUTED_POLICIES, 'ABSTAIN'].map((p) => [p, rate(o, (x) => (x.p ?? 'ABSTAIN') === p)]));
  const [topPolicy, topShare] = Object.entries(dist).filter(([p]) => p !== 'ABSTAIN').sort((a, b) => b[1] - a[1])[0];
  const bestSetShare = rate(subset, (r) => bestPolicySet(r).best.includes(topPolicy));
  return { n: subset.length, actionAccuracy: mean(o.map((x) => x.accuracy)), meanRegret: mean(acting.map((x) => x.regret)),
    p95Regret: quantile(acting.map((x) => x.regret).sort((a, b) => a - b), .95),
    normalizedRegret: mean(acting.map((x) => x.normalizedRegret)), catastrophicErrorRate: mean(o.map((x) => x.catastrophic)),
    abstention: dist.ABSTAIN, selectionDistribution: dist, topPolicy, topShare, topPolicyBestSetShare: bestSetShare,
    collapsed: topShare > 0.9,
    pathologicalCollapse: topShare > 0.9 && topShare > bestSetShare + 0.05 };
}
function paired(subset, a, b, label) {
  const d = subset.map((r) => { const p = choose(a, r), q = choose(b, r); if (p === null || q === null) return null;
    return { accuracy: r.correct[p] - r.correct[q], regret: r.regret[p] - r.regret[q], normalizedRegret: nr(r, p) - nr(r, q),
      catastrophic: Number(r.regret[p] >= 100) - Number(r.regret[q] >= 100) }; }).filter(Boolean);
  const keys = ['accuracy','regret','normalizedRegret','catastrophic']; const means = Object.fromEntries(keys.map((k) => [k, mean(d.map((x) => x[k]))]));
  const distributions = Object.fromEntries(keys.map((k) => [k, []]));
  const rng = createSeededRandom(BigInt(`0x${hex(label).slice(0, 12)}`));
  for (let bidx = 0; bidx < 1000; bidx += 1) {
    const sums = Object.fromEntries(keys.map((k) => [k, 0]));
    for (let j = 0; j < d.length; j += 1) { const x = d[Math.floor(rng() * d.length)]; for (const k of keys) sums[k] += x[k]; }
    for (const k of keys) distributions[k].push(sums[k] / d.length);
  }
  const ci = Object.fromEntries(keys.map((k) => { const s = distributions[k].sort((x, y) => x - y); return [k, [quantile(s, .025), quantile(s, .975)]]; }));
  return { n: d.length, delta: means, ci95: ci, episodesImproved: d.filter((x) => x.regret < 0).length, episodesWorsened: d.filter((x) => x.regret > 0).length };
}
function specialistHarm(subset, rule, specialist) {
  const selected = subset.filter((r) => choose(rule, r) === specialist);
  const signed = selected.map((r) => ({ r, value: r.regret[RES] - r.regret[specialist], correct: bestPolicySet(r).best.includes(specialist) }));
  const falseRows = selected.filter((r) => !bestPolicySet(r).best.includes(specialist));
  const added = falseRows.map((r) => r.regret[specialist] - bestPolicySet(r).bestRegret).sort((a, b) => a - b);
  return { selected: selected.length,
    regretSavedWhenCorrectlySelected: signed.filter((x) => x.correct && x.value > 0).reduce((a, x) => a + x.value, 0),
    regretSavedByPartialImprovement: signed.filter((x) => !x.correct && x.value > 0).reduce((a, x) => a + x.value, 0),
    regretAddedWhenIncorrectlySelected: -signed.filter((x) => !x.correct && x.value < 0).reduce((a, x) => a + x.value, 0),
    netValue: signed.reduce((a, x) => a + x.value, 0), falseSelectionRate: selected.length ? falseRows.length / selected.length : null,
    falseSelectionP95Added: quantile(added, .95), episodesImproved: signed.filter((x) => x.value > 0).length,
    episodesWorsened: signed.filter((x) => x.value < 0).length };
}
function slices(subset, field) {
  const keys = [...new Set(subset.map(field))].sort();
  return Object.fromEntries(keys.map((key) => { const part = subset.filter((r) => field(r) === key);
    return [key, Object.fromEntries(RULES.filter((r) => r !== 'PERFECT_SELECTOR_REFERENCE').map((rule) => [rule, { n: part.length,
      actionAccuracy: metrics(part, rule).actionAccuracy, meanRegret: metrics(part, rule).meanRegret }]))]; }));
}
function symmetryAudit() {
  const audit = {};
  for (const [name, original] of Object.entries(groups)) {
    const sample = original.filter((r) => r.equivariance !== null).slice(0, 64);
    const evidence = sample.map(evidenceFor); const byHash = new Map(evidence.map((e) => [e.recordHash, e]));
    audit[name] = Object.fromEntries(RULES.filter((r) => r !== 'PERFECT_SELECTOR_REFERENCE').map((rule) => {
      let d4 = 0, d4N = 0, id = 0, idN = 0, order = 0, d4Acc = 0, idAcc = 0, originalAcc = 0,
        d4Decision = 0, idDecision = 0;
      for (const raw of sample) {
        const row = routerRow(raw), selected = choose(rule, row), ev = byHash.get(raw.recordHash);
        if (selected === null) continue;
        const policy = selected === NEX ? 'NEXUS_SELECTOR_V1' : selected;
        const action = raw.policies[policy];
        originalAcc += raw.actions[action]?.o ?? 0;
        const mutated = (choices, suffix) => {
          const chosen = {}, regret = {}, correct = {};
          for (const [slot, key] of Object.entries(SOURCE)) {
            chosen[slot] = choices[key];
            if (choices[key] !== null) { regret[slot] = raw.actions[choices[key]].r; correct[slot] = raw.actions[choices[key]].o; }
          }
          return { ...row, recordHash: `${row.recordHash}:${suffix}`, chosen, regret, correct };
        };
        for (const [transform, twin] of Object.entries(ev.twins ?? {})) {
          d4N += 1; const m = mutated(twin, transform); const changed = choose(rule, m);
          if (changed === selected) d4Decision += 1;
          const key = changed === null ? null : twin[SOURCE[changed]];
          if (key === action) d4 += 1; d4Acc += raw.actions[key]?.o ?? 0;
        }
        for (const [index, permutation] of ev.idPermuted.entries()) {
          idN += 1; const m = mutated(permutation, `id${index}`); const changed = choose(rule, m);
          if (changed === selected) idDecision += 1;
          const key = changed === null ? null : permutation[SOURCE[changed]];
          if (key === action) id += 1; idAcc += raw.actions[key]?.o ?? 0;
        }
        if (RULE_MAP[rule]) {
          const s = scored(row); const p = decide(RULE_MAP[rule], { ...s, available: [...s.available].reverse(), classWeights: freeze.classWeights.weights,
            costMatrix: freeze.costMatrix, valueMatrix: freeze.valueMatrix, nexusThreshold: freeze.cal.nexusThreshold }).policy;
          if (p === selected) order += 1;
        } else order += 1;
      }
      return [rule, { sampled: sample.length, D4DecisionEquivariance: d4N ? d4Decision / d4N : null,
        D4ActionEquivariance: d4N ? d4 / d4N : null,
        D4ActionAccuracyDelta: d4N ? d4Acc / d4N - originalAcc / sample.length : null,
        idPermutationDecisionAgreement: idN ? idDecision / idN : null,
        idPermutationActionAgreement: idN ? id / idN : null, idPermutationAccuracyDelta: idN ? idAcc / idN - originalAcc / sample.length : null,
        candidateOrderDecisionAgreement: sample.length ? order / sample.length : null,
        coreD4Invariant: rate(sample, (r) => Object.values(r.equivariance).every((t) => t.coreFeatureInvariant === 1)) }];
    }));
  }
  return audit;
}

const evaluations = {};
for (const [name, subset] of Object.entries(rows)) {
  const ruleMetrics = Object.fromEntries(RULES.map((r) => [r, metrics(subset, r)]));
  const comparisons = Object.fromEntries(RULES.filter((r) => !['BEST_SINGLE_POLICY','PERFECT_SELECTOR_REFERENCE'].includes(r)).map((r) => [r, {
    vsBestSingle: paired(subset, r, 'BEST_SINGLE_POLICY', `${name}:${r}:best`),
    vsCascade: paired(subset, r, 'SIMPLE_CASCADE', `${name}:${r}:cascade`) }]));
  const harm = Object.fromEntries(RULES.filter((r) => !['BEST_SINGLE_POLICY','PERFECT_SELECTOR_REFERENCE'].includes(r)).map((r) => [r,
    Object.fromEntries(SPECIALISTS.map((p) => [p, specialistHarm(subset, r, p)]))]));
  evaluations[name] = { ruleMetrics, comparisons, harm, orientationSlices: slices(subset, (r) => r.orientation),
    curriculumSlices: slices(subset, (r) => r.combination.level) };
}
const symmetry = symmetryAudit();
const orientationGap = Object.fromEntries(Object.entries(evaluations).map(([part, e]) => [part,
  Object.fromEntries(RULES.filter((r) => r !== 'PERFECT_SELECTOR_REFERENCE').map((rule) => {
    const values = Object.values(e.orientationSlices).map((s) => s[rule].actionAccuracy);
    return [rule, Math.max(...values) - Math.min(...values)];
  }))]));
const headlineCandidates = ['ARGMAX_ROUTER','EXPECTED_REGRET_ROUTER','CLASS_WEIGHTED_ROUTER','EXPECTED_VALUE_ROUTER','NEXUS_THRESHOLD_ROUTER'];
const headline = headlineCandidates.sort((a, b) => freeze.cal.calRules[RULE_MAP[a]].meanRegret - freeze.cal.calRules[RULE_MAP[b]].meanRegret
  || freeze.cal.calRules[RULE_MAP[b]].accuracy - freeze.cal.calRules[RULE_MAP[a]].accuracy)[0];
const H = evaluations.HOLDOUT, O = evaluations.OOD;
function criterion(comparison) {
  const { delta: d, ci95: ci } = comparison;
  const accPositive = d.accuracy >= .02 && ci.accuracy[0] > 0 && ci.normalizedRegret[0] <= 0;
  const regretPositive = d.normalizedRegret <= -.02 && ci.normalizedRegret[1] < 0 && ci.accuracy[1] >= 0;
  const catastrophicWorse = ci.catastrophic[0] > 0;
  return { accPositive, regretPositive, material: (accPositive || regretPositive) && !catastrophicWorse,
    tradeoff: (ci.accuracy[1] < 0 && ci.normalizedRegret[1] < 0) || (ci.accuracy[0] > 0 && ci.normalizedRegret[0] > 0),
    catastrophicWorse };
}
const judgments = Object.fromEntries(headlineCandidates.map((rule) => { const hb = criterion(H.comparisons[rule].vsBestSingle), hc = criterion(H.comparisons[rule].vsCascade);
  const ob = criterion(O.comparisons[rule].vsBestSingle), oc = criterion(O.comparisons[rule].vsCascade);
  const hcRaw = H.ruleMetrics[rule], ocRaw = O.ruleMetrics[rule];
  const oodWorse = O.comparisons[rule].vsBestSingle.ci95.accuracy[1] < 0 || O.comparisons[rule].vsBestSingle.ci95.normalizedRegret[0] > 0
    || O.comparisons[rule].vsBestSingle.ci95.catastrophic[0] > 0;
  const ood = oodWorse ? 'REVERSES' : ocRaw.collapsed ? 'COLLAPSES' : hb.material && hc.material && ob.material && oc.material ? 'SURVIVES'
    : hb.material || hc.material ? 'DEGRADES' : 'INSUFFICIENT_EVIDENCE';
  return [rule, { holdoutVsBest: hb, holdoutVsCascade: hc, oodVsBest: ob, oodVsCascade: oc, ood,
    collapsedHoldout: hcRaw.collapsed, collapsedOOD: ocRaw.collapsed }];
}));
const headlineJudgment = judgments[headline];
const nuisanceStable = Object.values(symmetry).every((part) => {
  const h = part[headline], b = part.BEST_SINGLE_POLICY;
  return h.D4DecisionEquivariance === 1 && h.idPermutationDecisionAgreement === 1 && h.candidateOrderDecisionAgreement === 1
    && Math.abs(h.D4ActionAccuracyDelta - b.D4ActionAccuracyDelta) <= .02
    && Math.abs(h.idPermutationAccuracyDelta - b.idPermutationAccuracyDelta) <= .02;
});
const specialistAcceptable = SPECIALISTS.every((p) => {
  const h = H.harm[headline][p]; return h.netValue >= 0 && h.episodesWorsened <= h.episodesImproved
    && (h.falseSelectionP95Added ?? 0) <= H.ruleMetrics.BEST_SINGLE_POLICY.p95Regret;
});
const material = headlineJudgment.holdoutVsBest.material && headlineJudgment.holdoutVsCascade.material
  && headlineJudgment.ood === 'SURVIVES' && !headlineJudgment.collapsedHoldout && !headlineJudgment.collapsedOOD && specialistAcceptable && nuisanceStable;
const policyCompetent = H.ruleMetrics.PERFECT_SELECTOR_REFERENCE.actionAccuracy >= .5
  && O.ruleMetrics.PERFECT_SELECTOR_REFERENCE.actionAccuracy >= .5;
const historicalClaims = {
  expectedRegretAdvantage: judgments.EXPECTED_REGRET_ROUTER.holdoutVsBest.material ? 'SURVIVES'
    : H.comparisons.EXPECTED_REGRET_ROUTER.vsBestSingle.delta.regret < 0 ? 'PARTIALLY_SURVIVES' : 'INVALIDATED',
  classWeightingEffect: H.comparisons.CLASS_WEIGHTED_ROUTER.vsBestSingle.delta.normalizedRegret > 0 ? 'SURVIVES' : 'INVALIDATED',
  nexusCapture: H.harm.EXPECTED_REGRET_ROUTER[NEX].selected < H.harm.ARGMAX_ROUTER[NEX].selected ? 'SURVIVES' : 'INVALIDATED',
  falseSelectionHarm: H.harm[headline][NEX].regretAddedWhenIncorrectlySelected >= H.harm[headline][NEX].regretSavedWhenCorrectlySelected
    ? 'SURVIVES' : H.harm[headline][NEX].regretAddedWhenIncorrectlySelected > 0 ? 'PARTIALLY_SURVIVES' : 'INVALIDATED',
  resourceBaselineDominance: H.ruleMetrics.BEST_SINGLE_POLICY.topPolicy === RES && !headlineJudgment.holdoutVsBest.material ? 'SURVIVES' : 'INVALIDATED',
  oodSurvival: headlineJudgment.ood === 'SURVIVES' ? 'SURVIVES' : headlineJudgment.ood === 'COLLAPSES' ? 'PARTIALLY_SURVIVES' : 'INVALIDATED',
  materiality: material ? 'INVALIDATED' : 'SURVIVES', collapse: headlineJudgment.collapsedHoldout || headlineJudgment.collapsedOOD ? 'SURVIVES' : 'INVALIDATED',
};
const freezeHead = manifest.generatedAtHead;
const freezeAtGeneration = freezeHead && git('show', `${freezeHead}:platform/game-agnostic/${FREEZE_PATH}`).status === 0
  && git('show', `${freezeHead}:platform/game-agnostic/${PLAN_PATH}`).status === 0
  && git('ls-tree', '-r', '--name-only', freezeHead, '--', `platform/game-agnostic/${MANIFEST_PATH}`).stdout.trim() === ''
  && git('merge-base', '--is-ancestor', freezeHead, 'HEAD').status === 0;
const predecessorFiles = { P1C: 'stage3f6p1c-symmetric-benchmark/stage3f6p1c-certification-result.json',
  P1D: 'stage3f6p1d-symmetric-corpus/stage3f6p1d-certification-result.json',
  P1E: 'stage3f6p1e-policy-requalification/stage3f6p1e-certification-result.json',
  TSYM: 'stage3f6tsym-router-value/stage3f6tsym-certification-result.json',
  P1ASYM: 'stage3f6p1asym-free-action/stage3f6p1asym-certification-result.json',
  P1SYM: 'stage3f6p1sym-nexus-requalification/stage3f6p1sym-certification-result.json',
  WSYM: 'stage3f6wsym-risk-requalification/stage3f6wsym-certification-result.json',
  historicalD: 'stage3f6d-decision-rule/stage3f6d-certification-result.json' };
const predecessorBound = Object.entries(predecessorFiles).every(([k, f]) => readJson(`artifacts/${f}`).certificationHash === PLAN.predecessors[k]);
const integrity = {
  planBound: planFile.planHash === PLAN_HASH && freeze.planHash === PLAN_HASH,
  freezeReproduced, freezeHashBound: manifest.analysisFreezeHash === freeze.analysisFreezeHash,
  seedBound: freeze.seedPlanHash === SEED_PLAN_HASH && manifest.seedPlanHash === SEED_PLAN_HASH,
  policyBound: freeze.headlinePolicySetHash === HEADLINE_POLICY_SET_HASH && freeze.diagnosticPolicySetHash === DIAGNOSTIC_POLICY_SET_HASH
    && manifest.headlinePolicySetHash === HEADLINE_POLICY_SET_HASH,
  decisionRuleBound: freeze.decisionRuleHash === decisionRuleHash && manifest.decisionRuleHash === decisionRuleHash,
  contentBound: manifest.contentHash === hex(freshText), countBound: rows.HOLDOUT.length === SEED_PLAN.sizes.HOLDOUT && rows.OOD.length === SEED_PLAN.sizes.OOD,
  seedDisjoint: Object.values(priorAudit).filter(Array.isArray).every((a) => a.length === 0) && priorAudit.duplicateCount === 0,
  usedSeedsBound: JSON.stringify(manifest.stats.HOLDOUT.seedsUsed) === JSON.stringify(SEED_PLAN.declared.HOLDOUT)
    && JSON.stringify(manifest.stats.OOD.seedsUsed) === JSON.stringify(SEED_PLAN.declared.OOD)
    && groups.HOLDOUT.every((r) => SEED_PLAN.declared.HOLDOUT.includes(r.combination.seed))
    && groups.OOD.every((r) => SEED_PLAN.declared.OOD.includes(r.combination.seed)),
  priorDisjoint: ['record','world','topology'].every((k) => fresh.every((r) => !priorHashes[k].has(r[`${k}Hash`]))),
  internalDisjoint: ['record','world','topology'].every((k) => new Set(fresh.map((r) => r[`${k}Hash`])).size === fresh.length),
  freshGate: frozenGate().length === 0, generatedAfterFreeze: Boolean(freezeAtGeneration), predecessorBound,
  stage3f6ErratumPresent: readJson('artifacts/stage3f6-errata/erratum-stage3f6-prediction-reliability.json').erratumId === 'STAGE3F6-ERRATUM-001',
  modelBound: policyRouterHash(model) === freeze.model.routerHash,
  allAvailable: Object.values(rows).every((sub) => sub.every((r) => r.chosen[RES] !== null && ROUTED_POLICIES.every((p) =>
    r.chosen[p] === null || availablePolicies(r).includes(p)))),
  benchmarkSymmetric: fresh.filter((r) => r.equivariance !== null).every((r) => Object.values(r.equivariance).every((t) =>
    ['legal','optimal','regret','label','coreFeatureInvariant'].every((k) => t[k] === 1))),
  benchmarkBound: JSON.stringify(manifest.benchmark) === JSON.stringify(readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').benchmark),
  R0: PLAN.authority.tier === 'R0' && !PLAN.authority.canDispatch && !PLAN.authority.canMutateLiveWorld && !PLAN.authority.onlineLearningEnabled && !PLAN.authority.promotedToLiveRuntime,
};
const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/stage3f6dsym-decision-rule.test.js'],
  { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
const testCount = Number(/^# pass (\d+)$/m.exec(tests.stdout ?? '')?.[1] ?? 0);
const testsPass = tests.status === 0 && testCount > 0;
const status = Object.values(integrity).every(Boolean) && testsPass ? 'PASS' : 'FAIL';
const payload = roundDeep({ schemaVersion: 1, stage: PLAN.stage, status, planHash: PLAN_HASH,
  seedPlanHash: SEED_PLAN_HASH, analysisFreezeHash: freeze.analysisFreezeHash, headlinePolicySetHash: HEADLINE_POLICY_SET_HASH,
  diagnosticPolicySetHash: DIAGNOSTIC_POLICY_SET_HASH, decisionRuleHash, modelHash: freeze.model.routerHash,
  data: { contentHash: manifest.contentHash, generatedAtHead: manifest.generatedAtHead, stats: manifest.stats, seedAudit: manifest.seedAudit,
    priorLineage: manifest.priorLineage }, freeze: { costMatrixHash: freeze.costMatrixHash, temperature: freeze.cal.temperature,
    nexusThreshold: freeze.cal.nexusThreshold, bestSingle: freeze.cal.bestSingle, cascade: freeze.cal.cascade, headlineRule: headline },
  evaluations, symmetry, orientationGap, judgments, historicalClaims,
  diagnostics: { W_ENRICHED_ROUTER: { status: 'NOT_APPLICABLE', reason: 'W-SYM valid risk signal is uncalibrated and OOD-unstable; fitting an enriched router here would add a new routing intervention outside decision-rule requalification' } },
  conclusion: {
    primary: material ? 'DECISION_RULE_VALUE_CONFIRMED' : 'DECISION_RULE_VALUE_NOT_MATERIAL',
    D_REQUALIFIED: status === 'PASS', DECISION_RULE_VALUE_MEASURED: true, DECISION_RULE_VALUE_MATERIAL: material,
    DECISION_RULE_ACCURACY_POSITIVE: headlineJudgment.holdoutVsBest.accPositive,
    DECISION_RULE_REGRET_POSITIVE: headlineJudgment.holdoutVsBest.regretPositive,
    DECISION_RULE_OOD_STABLE: headlineJudgment.ood === 'SURVIVES',
    DECISION_RULE_COLLAPSES: headlineJudgment.collapsedHoldout || headlineJudgment.collapsedOOD,
    FALSE_SELECTION_HARM_ACCEPTABLE: specialistAcceptable,
    NUISANCE_VALUE_STABLE: nuisanceStable, POLICY_SET_COMPETENT: policyCompetent,
    DECISION_RULE_LOGIC_USEFUL_FOR_3G: material && policyCompetent, ROUTER_2_0_JUSTIFIED: false,
    READY_FOR_3F_CONFIRMATORY_RERUN: status === 'PASS', READY_FOR_3F_FREEZE: false, READY_FOR_STAGE3G: false,
  }, integrity, tests: { passed: testsPass, count: testCount }, authority: PLAN.authority,
  sourceHashes: Object.fromEntries(EVALUATION_FILES.filter((f) => f.endsWith('.mjs') || f.endsWith('.js')).map((f) => [f, hex(readFileSync(at(f)))])) });
payload.certificationHash = hex(JSON.stringify(payload));
const latencyUs = Object.fromEntries(RULES.map((rule) => {
  const t = performance.now(); for (const row of rows.HOLDOUT) {
    if (RULE_MAP[rule]) scoreCache.delete(row.recordHash);
    choose(rule, row);
  }
  return [rule, (performance.now() - t) * 1000 / rows.HOLDOUT.length];
}));
if (checkOnly) {
  const stored = readJson(RESULT); const reproduced = JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6DSYM_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash,
    recomputedHash: payload.certificationHash, failedIntegrity: Object.entries(integrity).filter(([, v]) => !v).map(([k]) => k), tests: payload.tests, latencyUs }));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash,
    failedIntegrity: Object.entries(integrity).filter(([, v]) => !v).map(([k]) => k), headline, conclusion: payload.conclusion, latencyUs }));
  if (status !== 'PASS') process.exitCode = 1;
}
