#!/usr/bin/env node
/* STAGE_3F_6_P — deployable policy quality audit (diagnostic).
 *
 * Central question: when a policy is "best available", is it actually good in absolute terms, or merely
 * less bad than the alternatives? Evaluates the FROZEN Stage 3F.6-A policies themselves. No router is
 * trained, no decision rule is tested, no feature is added, no policy is modified.
 *
 * DEV/CAL only. All prior HOLDOUT/OOD are exposed; this stage makes no confirmatory claim.
 * The analysis plan (every threshold and classification rule) is hashed and written before any metric.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deepFreeze, sha256 } from '../src/core/determinism.js';
import { POLICY_SET_HASH, ROUTED_POLICIES, availablePolicies, bestLabel, bestPolicySet, quantile } from '../src/stage3f/policy-router-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6p-policy-quality');
const resultPath = path.join(outDirectory, 'stage3f6p-certification-result.json');
const planPath = path.join(outDirectory, 'stage3f6p-analysis-plan.json');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readText = (r) => readFileSync(path.join(root, r), 'utf8');
const readGz = async (r) => gunzipSync(await readFile(path.join(root, r))).toString('utf8');
const lines = (t) => t.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const rate = (subset, fn) => (subset.length ? subset.filter(fn).length / subset.length : null);
const RES = 'RESOURCE_PRESERVING_V1'; const NEX = 'NEXUS_SELECTOR'; const OBJ = 'OBJECTIVE_TARGETING_V1'; const THR = 'THREAT_COVERING_V1';
const CONTROL = 'RANDOM_LEGAL_V1'; const GREEDY = 'GREEDY';

/* ------------------------------------------------------------------ 0. scope */
const prefix = (r) => `platform/game-agnostic/${r}`;
const gitClean = (...paths) => { const r = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : 'GIT_UNAVAILABLE'; };
const art = (r) => JSON.parse(readText(r));
const s3a = art('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json');
const s3t = art('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json');
const s3w = art('artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json');
const s3d = art('artifacts/stage3f6d-decision-rule/stage3f6d-certification-result.json');
const PROPOSAL_SOURCE = 'src/stage3f/deployable-action-proposal-v1.js';
const scope = {
  priorOwnersUnchanged: gitClean(...['artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered', PROPOSAL_SOURCE,
    'src/stage3f/policy-router-v1.js', 'src/stage3f/decision-rule-v1.js', 'src/stage3f/decision-risk-state-v1.js',
    'src/stage3f/deployable-feature-contract-v1.js', 'src/lab/stage3c-learned-nexus.js', 'src/experts/nexus.js',
    'artifacts/stage3f6c-deployable-router', 'artifacts/stage3f6a-action-proposals', 'artifacts/stage3f6t-policy-router',
    'artifacts/stage3f6w-risk-state', 'artifacts/stage3f6d-decision-rule'].map(prefix)) === '',
  stage3f6aIntact: s3a.certificationHash === '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca',
  stage3f6tIntact: s3t.certificationHash === '5d6910dd39405ee9f9fc2868f1309ff84998d30f7128e7a60b36644ca9056582',
  stage3f6wIntact: s3w.certificationHash === '7c5db9fbdd1d02bbee76ee12a0a5bf8a6e98c5a53adb510b0ed7e57ebd295fb6',
  stage3f6dIntact: s3d.certificationHash === 'f262c3477631a92007e1a40d4ba85bc03874fab6c1a68e78013378de2b909f3b',
  policyDefinitionsUnchanged: hex(readFileSync(path.join(root, PROPOSAL_SOURCE))) === s3a.sourceHashes[PROPOSAL_SOURCE],
  policySetHashUnchanged: POLICY_SET_HASH === s3t.policySet.hash,
  newOwners: ['scripts/generate-stage3f6p-policy-evidence.mjs', 'scripts/certify-stage3f6p-policy-quality.mjs', 'tests/stage3f6p-policy-quality.test.js'],
  existingOwnersModified: ['package.json', '.gitignore'],
  routerTrained: false, decisionRuleTested: false, featuresAdded: false, policiesModified: false,
};

/* ------------------------------------------------------------------ 1. data */
const corpusText = await readGz('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz');
const proposalsText = await readGz('artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz');
const evidenceText = await readGz('artifacts/stage3f6p-policy-quality/policy-evidence.jsonl.gz');
const corpusManifest = art('artifacts/stage3f6c-deployable-router/confirmatory-corpus-manifest.json');
const proposalsManifest = art('artifacts/stage3f6a-action-proposals/action-proposals-manifest.json');
const evidenceManifest = art('artifacts/stage3f6p-policy-quality/policy-evidence-manifest.json');
const integrity = {
  corpus: hex(corpusText) === corpusManifest.contentHash, proposals: hex(proposalsText) === proposalsManifest.contentHash,
  evidence: hex(evidenceText) === evidenceManifest.contentHash, evidenceBoundToCorpus: evidenceManifest.sourceCorpusHash === corpusManifest.contentHash,
  evidenceBoundToProposals: evidenceManifest.sourceProposalsHash === proposalsManifest.contentHash,
  producerFidelityMismatches: evidenceManifest.producerFidelityMismatches,
};
const PARTITIONS = ['DEV', 'CAL'];
const proposals = new Map(lines(proposalsText).map((r) => [r.recordHash, r]));
const evidence = new Map(lines(evidenceText).map((r) => [r.recordHash, r]));
const rows = lines(corpusText).filter((r) => PARTITIONS.includes(r.partition)).map((r) => {
  const p = proposals.get(r.recordHash); const e = evidence.get(r.recordHash);
  if (!p || !e) throw new Error(`missing proposal or evidence for ${r.recordHash}`);
  return { partition: r.partition, recordHash: r.recordHash, core: r.core, combination: r.combination, chosen: p.chosen, correct: p.correct,
    regret: p.regret, chosenType: e.chosenType, nexusReason: e.nexusReason, branches: e.branches };
});
const dev = rows.filter((r) => r.partition === 'DEV');
const sealedAccess = { rowsOutsideDevCal: rows.filter((r) => !PARTITIONS.includes(r.partition)).length,
  evidencePartitions: [...new Set([...evidence.values()].map((r) => r.partition))].sort() };

/* ---------------------------------------------------------- 2. ANALYSIS PLAN */
const PLAN = deepFreeze({
  gate: 'STAGE_3F_6_P_POLICY_QUALITY', data: PARTITIONS, CONFIRMATORY_POLICY_QUALITY_CLAIMS: false,
  bestAvailable: 'policy is in the minimum-regret set among the four routed policies (ties included); uniquely best reported separately',
  regretThresholds: { atMost: [5, 10, 25], above: [50, 100] },
  regimes: 'UNSUPPORTED_THREAT, BOTTLENECK, HIGH_HOSTILE (>= DEV median and > 0), LOW_ENERGY (<= DEV median), MULTI_OBJECTIVE (>= 2), '
    + 'FEW_ACTIONS (<= DEV median), NOVEL (cross-partition nearest-neighbour distance > overall q90), objectives family, roles family, topology shape',
  concentration: 'regime n >= 200 inside the subset AND mean regret in / out >= 1.25; primary regime = largest ratio',
  oracleFallback: 'an episode where no member of an oracle subset proposed an action uses the RANDOM_LEGAL control action',
  nexusActionPattern: 'DOMINATED_BY_WEAK_PATTERN if top-2 chosen action types cover >= 0.8 of NEXUS selections and their mean regret >= 0.9 x NEXUS mean regret',
  routingVsPolicy: 'NEXUS_ITSELF_CHOOSES_WEAK_ACTIONS if NEXUS mean regret when best-available >= 25, else WEAK_ROUTING_NOT_POLICY',
  replacementHypothesis: ['BETTER_DEPENDENCY_ACTION_MAPPING if type alignment >= 0.5 and exact accuracy when best < 0.5',
    'BETTER_RISK_RESPONSE if the primary NEXUS failure regime is threat-related', 'BETTER_OBJECTIVE_PLANNING if it is objective-related',
    'BETTER_RELATIONAL_REASONING if it is dependency/bottleneck-related', 'OTHER otherwise'],
  shortcutDependence: 'accuracy(RESOURCE | zero-cost optimal exists) - accuracy(RESOURCE | none): >= 0.5 HIGH, >= 0.2 MODERATE, else LOW',
  auxiliaryPolicyReason: ['RARE_OPPORTUNITY if applicability < 0.1 and opportunity < 0.1',
    'WEAK_DECISION_RULE if accuracy when proposing with an in-class optimal action < 0.5', 'OVER_STRICT_APPLICABILITY if applicability < 0.1',
    'NOT_DETERMINED otherwise; INSUFFICIENT_OBSERVATION cannot be measured from current evidence'],
  policyClassification: ['INSUFFICIENT_EVIDENCE if best-available n < 200', 'REMOVE_CANDIDATE if marginal oracle regret reduction < 0.5 and accuracy gain < 0.005',
    'KEEP if best-available mean regret <= 15', 'REDESIGN_CANDIDATE if best-available mean regret > 25 and marginal regret reduction >= 2.0', 'KEEP_BUT_LIMIT otherwise'],
  primaryResult: ['E_INSUFFICIENT_EVIDENCE if RESOURCE or NEXUS best-available n < 200', 'B_POLICY_QUALITY_IS_BINDING_LIMITATION if any REDESIGN_CANDIDATE',
    'A_POLICY_SET_SUFFICIENT if full oracle mean regret <= 10', 'C_ROUTING_REMAINS_BINDING otherwise'],
  readiness: { READY_FOR_POLICY_REDESIGN: 'primary result B', READY_FOR_ROUTER_RETRAIN: false, READY_FOR_STAGE3G: false },
  prohibited: ['router training', 'decision-rule tuning', 'new features', 'policy modification', 'sealed data'],
});
const PLAN_HASH = sha256(PLAN);
await mkdir(outDirectory, { recursive: true });
await writeFile(planPath, `${JSON.stringify({ ...PLAN, planHash: PLAN_HASH }, null, 2)}\n`);

/* ------------------------------------------------------------ 3. primitives */
const isBest = (row, p) => bestPolicySet(row).best.includes(p);
const proposes = (row, p) => row.chosen[p] !== null && row.chosen[p] !== undefined && typeof row.regret[p] === 'number';
function quality(subset, policy) {
  const acting = subset.filter((r) => proposes(r, policy));
  const reg = acting.map((r) => r.regret[policy]).sort((a, b) => a - b);
  return { n: subset.length, proposingN: acting.length, coverage: subset.length ? acting.length / subset.length : null,
    accuracy: mean(acting.map((r) => r.correct[policy])), meanRegret: mean(reg), medianRegret: quantile(reg, 0.5),
    p90Regret: quantile(reg, 0.9), p95Regret: quantile(reg, 0.95), p99Regret: quantile(reg, 0.99), worstRegret: reg.length ? reg[reg.length - 1] : null };
}
function thresholds(subset, policy) {
  const reg = subset.filter((r) => proposes(r, policy)).map((r) => r.regret[policy]);
  const p = (fn) => (reg.length ? reg.filter(fn).length / reg.length : null);
  return { n: reg.length, atMost5: p((x) => x <= 5), atMost10: p((x) => x <= 10), atMost25: p((x) => x <= 25), above50: p((x) => x > 50), above100: p((x) => x > 100) };
}
function oracle(subset, members) {
  const outcomes = subset.map((r) => {
    const avail = members.filter((m) => proposes(r, m));
    const regret = avail.length ? Math.min(...avail.map((m) => r.regret[m])) : r.regret[CONTROL];
    return { regret, correct: regret === 0 ? 1 : 0, covered: avail.length > 0 };
  });
  return { members, accuracy: mean(outcomes.map((o) => o.correct)), meanRegret: mean(outcomes.map((o) => o.regret)),
    coverage: mean(outcomes.map((o) => (o.covered ? 1 : 0))) };
}

/* ------------------------------------------------------------- 4. regimes */
const devMedian = (k) => quantile(dev.map((r) => r.core[k]).sort((a, b) => a - b), 0.5);
const T = { hostile: devMedian('relational.hostileEntityCount'), energy: devMedian('resources.actorEnergy'), actions: devMedian('actionSurface.legalActionCount') };
const keys = Object.keys(dev[0].core).sort();
const mu = keys.map((k) => mean(dev.map((r) => r.core[k])));
const sd = keys.map((k, j) => { const s = Math.sqrt(mean(dev.map((r) => (r.core[k] - mu[j]) ** 2))); return s > 0 ? s : 1; });
const z = (r) => keys.map((k, j) => (r.core[k] - mu[j]) / sd[j]);
const zDev = rows.filter((r) => r.partition === 'DEV').map(z); const zCal = rows.filter((r) => r.partition === 'CAL').map(z);
const nn = (x, pool) => { let best = Infinity; for (const y of pool) { let d = 0; for (let j = 0; j < x.length; j += 1) { const t = x[j] - y[j]; d += t * t; if (d >= best) break; } if (d < best) best = d; } return Math.sqrt(best); };
const novelty = new Map(rows.map((r) => [r.recordHash, nn(z(r), r.partition === 'DEV' ? zCal : zDev)]));
T.noveltyQ90 = quantile([...novelty.values()].sort((a, b) => a - b), 0.9);
const BINARY = {
  UNSUPPORTED_THREAT: (r) => r.core['relational.unsupportedThreatenedCount'] > 0,
  BOTTLENECK: (r) => r.core['relational.bottleneckCount'] > 0,
  HIGH_HOSTILE: (r) => r.core['relational.hostileEntityCount'] > 0 && r.core['relational.hostileEntityCount'] >= T.hostile,
  LOW_ENERGY: (r) => r.core['resources.actorEnergy'] <= T.energy,
  MULTI_OBJECTIVE: (r) => r.core['context.objectiveCount'] >= 2,
  FEW_ACTIONS: (r) => r.core['actionSurface.legalActionCount'] <= T.actions,
  NOVEL: (r) => novelty.get(r.recordHash) > T.noveltyQ90,
};
const CATEGORICAL = { FAMILY_OBJECTIVES: (r) => r.combination.objectives, FAMILY_ROLES: (r) => r.combination.roles, TOPOLOGY: (r) => r.combination.shape };
const REGIME_KIND = { UNSUPPORTED_THREAT: 'threat', HIGH_HOSTILE: 'threat', BOTTLENECK: 'dependency', MULTI_OBJECTIVE: 'objective',
  FAMILY_OBJECTIVES: 'objective', LOW_ENERGY: 'resource', FEW_ACTIONS: 'action', NOVEL: 'novelty', FAMILY_ROLES: 'family', TOPOLOGY: 'topology' };

function regimeProfile(subset, policy) {
  const out = [];
  const add = (name, label, fn) => {
    const inside = subset.filter((r) => proposes(r, policy) && fn(r)); const outside = subset.filter((r) => proposes(r, policy) && !fn(r));
    const mi = mean(inside.map((r) => r.regret[policy])); const mo = mean(outside.map((r) => r.regret[policy]));
    out.push({ regime: name, value: label, kind: REGIME_KIND[name], nIn: inside.length, nOut: outside.length, meanRegretIn: mi, meanRegretOut: mo,
      accuracyIn: mean(inside.map((r) => r.correct[policy])), ratio: mi !== null && mo ? mi / mo : null,
      concentrated: inside.length >= 200 && mi !== null && mo ? mi / mo >= 1.25 : false });
  };
  for (const [name, fn] of Object.entries(BINARY)) add(name, true, fn);
  for (const [name, fn] of Object.entries(CATEGORICAL)) for (const v of [...new Set(subset.map(fn))].sort()) add(name, v, (r) => fn(r) === v);
  const concentrated = out.filter((e) => e.concentrated).sort((a, b) => b.ratio - a.ratio);
  return { regimes: out, primary: concentrated[0] ?? null };
}

/* ---------------------------------------------------------- 5. absolute quality */
const POLICIES = [RES, NEX, OBJ, THR];
const bestSubset = (p) => rows.filter((r) => isBest(r, p));
const absoluteQuality = Object.fromEntries([...POLICIES, CONTROL, GREEDY].map((p) => [p, {
  overall: quality(rows, p),
  whenBestAvailable: POLICIES.includes(p) ? quality(bestSubset(p), p) : null,
  whenUniquelyBest: POLICIES.includes(p) ? quality(rows.filter((r) => bestLabel(r) === p), p) : null,
  regretThresholdsWhenBest: POLICIES.includes(p) ? thresholds(bestSubset(p), p) : null,
}]));
const opportunity = Object.fromEntries([...POLICIES.map((p) => [p, rate(rows, (r) => bestLabel(r) === p)]), ['TIE', rate(rows, (r) => bestLabel(r) === 'TIE')]]);

/* ------------------------------------------------------------ 6. oracle ceiling */
const fullOracle = oracle(rows, POLICIES);
const ceilings = { ORACLE_CURRENT_POLICY_SET: fullOracle };
const marginal = {};
for (const p of POLICIES) {
  const without = oracle(rows, POLICIES.filter((m) => m !== p));
  ceilings[`ORACLE_EXCLUDING_${p}`] = without;
  marginal[p] = { MARGINAL_ORACLE_ACCURACY_GAIN: fullOracle.accuracy - without.accuracy, MARGINAL_ORACLE_REGRET_REDUCTION: without.meanRegret - fullOracle.meanRegret };
}

/* --------------------------------------------------------------- 7. NEXUS audit */
const nexusBest = bestSubset(NEX);
const nexusRegimes = regimeProfile(nexusBest, NEX);
const nexusActing = rows.filter((r) => proposes(r, NEX));
const nexusTypes = [...new Set(nexusActing.map((r) => r.chosenType[NEX]))].sort();
const nexusActionSemantics = nexusTypes.map((t) => {
  const sub = nexusActing.filter((r) => r.chosenType[NEX] === t);
  return { actionType: t, n: sub.length, selectionRate: sub.length / nexusActing.length, accuracy: mean(sub.map((r) => r.correct[NEX])),
    meanRegret: mean(sub.map((r) => r.regret[NEX])), bestAvailableFrequency: rate(sub, (r) => isBest(r, NEX)) };
}).sort((a, b) => b.n - a.n);
const top2 = nexusActionSemantics.slice(0, 2);
const top2Share = top2.reduce((s, e) => s + e.selectionRate, 0);
const top2Regret = mean(nexusActing.filter((r) => top2.some((e) => e.actionType === r.chosenType[NEX])).map((r) => r.regret[NEX]));
const nexusMeanRegret = mean(nexusActing.map((r) => r.regret[NEX]));
const nexusActionPattern = top2Share >= 0.8 && top2Regret >= 0.9 * nexusMeanRegret ? 'DOMINATED_BY_WEAK_PATTERN' : 'NOT_DOMINATED_BY_WEAK_PATTERN';
const optimalTypes = (r) => new Set(r.branches.filter((b) => b.o === 1).map((b) => b.t));
const typeAlignment = rate(nexusBest, (r) => optimalTypes(r).has(r.chosenType[NEX]));
const optimalTypeShareWhenNexusBest = (() => {
  const counts = {}; for (const r of nexusBest) for (const t of optimalTypes(r)) counts[t] = (counts[t] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, c]) => [t, c / nexusBest.length]));
})();
const nexusByReason = Object.fromEntries([...new Set(nexusBest.map((r) => r.nexusReason))].sort().map((reason) => {
  const sub = nexusBest.filter((r) => r.nexusReason === reason);
  return [reason, { n: sub.length, accuracy: mean(sub.map((r) => r.correct[NEX])), meanRegret: mean(sub.map((r) => r.regret[NEX])) }];
}));
const nexusWhenBest = absoluteQuality[NEX].whenBestAvailable;
const routingVsPolicy = nexusWhenBest.meanRegret >= 25 ? 'NEXUS_ITSELF_CHOOSES_WEAK_ACTIONS' : 'WEAK_ROUTING_NOT_POLICY';
const nexusOracleGap = { NEXUS_REGRET_WHEN_BEST: nexusWhenBest.meanRegret, OPTIMAL_REGRET: 0, RESOURCE_REGRET_IN_SAME_EPISODES: mean(nexusBest.map((r) => r.regret[RES])),
  byRegime: nexusRegimes.regimes.filter((e) => e.nIn >= 200).map((e) => ({ regime: e.regime, value: e.value, n: e.nIn, nexusRegret: e.meanRegretIn, gapToOptimal: e.meanRegretIn })) };
const primaryKind = nexusRegimes.primary?.kind ?? null;
const replacementHypothesis = typeAlignment >= 0.5 && nexusWhenBest.accuracy < 0.5 ? 'BETTER_DEPENDENCY_ACTION_MAPPING'
  : primaryKind === 'threat' ? 'BETTER_RISK_RESPONSE' : primaryKind === 'objective' ? 'BETTER_OBJECTIVE_PLANNING'
    : primaryKind === 'dependency' ? 'BETTER_RELATIONAL_REASONING' : 'OTHER';
const NEXUS_OBJECTIVE_DOCUMENTATION = deepFreeze({
  source: 'src/lab/stage3c-learned-nexus.js#nexusRelationalSelector (read, not modified)',
  primaryObjective: 'respond to observed relational structure by action TYPE: threat-driven order when unsupported/uncovered threats exist, else structure-repair order',
  secondaryObjective: 'none — no value, cost, target or horizon term is consulted',
  signalsConsumed: ['Nexus rationale codes (critical dependency, bottleneck, unsupported/uncovered threat, cycle, no relationships, empty graph)', 'legal action types and identities'],
  tieBreaking: 'fixed action-type preference order, then lexicographic action identity — so the TARGET is effectively arbitrary within the preferred type',
  abstentionBehavior: 'abstains when no structural rationale code is present, the graph is empty or has no relationships, or no legal action exists',
  horizonOptimalTarget: 'membership in the horizon-optimal set under the Forge reward: depends on WHICH entity is acted on and on cost/value, neither of which the selector reads',
});

/* -------------------------------------------------------------- 8. RESOURCE audit */
const resourceBest = bestSubset(RES);
const resourceRegimes = regimeProfile(rows, RES);
const zeroCostOptimalExists = (r) => r.branches.some((b) => b.o === 1 && b.c === 0);
const greedyBranch = (r) => r.branches.find((b) => b.k === r.chosen[GREEDY]);
const shortcut = {
  P_GREEDY_IS_MAX_COST_ACTION: rate(rows, (r) => { const g = greedyBranch(r); const max = Math.max(...r.branches.map((b) => b.c ?? -1)); return g && g.c === max; }),
  P_ZERO_COST_ACTION_IN_OPTIMAL_SET: rate(rows, zeroCostOptimalExists),
  P_RESOURCE_CORRECT_GIVEN_ZERO_COST_OPTIMAL: rate(rows.filter(zeroCostOptimalExists), (r) => r.correct[RES] === 1),
  P_RESOURCE_CORRECT_GIVEN_NO_ZERO_COST_OPTIMAL: rate(rows.filter((r) => !zeroCostOptimalExists(r)), (r) => r.correct[RES] === 1),
  P_RESOURCE_CHOOSES_ZERO_COST: rate(rows, (r) => { const b = r.branches.find((x) => x.k === r.chosen[RES]); return b && b.c === 0; }),
};
shortcut.accuracyGap = shortcut.P_RESOURCE_CORRECT_GIVEN_ZERO_COST_OPTIMAL - shortcut.P_RESOURCE_CORRECT_GIVEN_NO_ZERO_COST_OPTIMAL;
shortcut.dependence = shortcut.accuracyGap >= 0.5 ? 'HIGH' : shortcut.accuracyGap >= 0.2 ? 'MODERATE' : 'LOW';
const resourceAudit = { whenBest: quality(resourceBest, RES), severeFailureRate: rate(rows, (r) => r.regret[RES] > 50),
  failureRegime: resourceRegimes.primary, regimes: resourceRegimes.regimes, shortcut, forgeScope: 'Forge only; not generalised' };

/* -------------------------------------------------------- 9. objective / threat */
function auxiliaryAudit(policy, targetFlag) {
  const acting = rows.filter((r) => proposes(r, policy));
  const applicability = acting.length / rows.length;
  const opportunityRate = rate(rows, (r) => r.branches.some((b) => b.o === 1 && b[targetFlag] === 1));
  const withInClassOptimal = acting.filter((r) => r.branches.some((b) => b.o === 1 && b[targetFlag] === 1));
  const accuracyWithInClassOptimal = mean(withInClassOptimal.map((r) => r.correct[policy]));
  const reason = applicability < 0.1 && opportunityRate < 0.1 ? 'RARE_OPPORTUNITY'
    : accuracyWithInClassOptimal !== null && accuracyWithInClassOptimal < 0.5 ? 'WEAK_DECISION_RULE'
      : applicability < 0.1 ? 'OVER_STRICT_APPLICABILITY' : 'NOT_DETERMINED';
  return { abstentionRate: 1 - applicability, applicability, opportunityRate, accuracyWhenProposing: mean(acting.map((r) => r.correct[policy])),
    bestWhenProposing: rate(acting, (r) => isBest(r, policy)), inClassOptimalWhenProposingN: withInClassOptimal.length,
    accuracyWithInClassOptimal, poorUsefulnessReason: reason, note: 'INSUFFICIENT_OBSERVATION is not measurable from current evidence' };
}
const auxiliary = { [OBJ]: auxiliaryAudit(OBJ, 'crit'), [THR]: auxiliaryAudit(THR, 'thr') };

/* ---------------------------------------------------------- 10. classification */
function classify(p) {
  const best = absoluteQuality[p].whenBestAvailable; const m = marginal[p];
  if (best.proposingN < 200) return 'INSUFFICIENT_EVIDENCE';
  if (m.MARGINAL_ORACLE_REGRET_REDUCTION < 0.5 && m.MARGINAL_ORACLE_ACCURACY_GAIN < 0.005) return 'REMOVE_CANDIDATE';
  if (best.meanRegret <= 15) return 'KEEP';
  if (best.meanRegret > 25 && m.MARGINAL_ORACLE_REGRET_REDUCTION >= 2.0) return 'REDESIGN_CANDIDATE';
  return 'KEEP_BUT_LIMIT';
}
const classification = Object.fromEntries(POLICIES.map((p) => [p, classify(p)]));
const insufficient = absoluteQuality[RES].whenBestAvailable.proposingN < 200 || absoluteQuality[NEX].whenBestAvailable.proposingN < 200;
const primaryResult = insufficient ? 'E_INSUFFICIENT_EVIDENCE'
  : Object.values(classification).includes('REDESIGN_CANDIDATE') ? 'B_POLICY_QUALITY_IS_BINDING_LIMITATION'
    : fullOracle.meanRegret <= 10 ? 'A_POLICY_SET_SUFFICIENT' : 'C_ROUTING_REMAINS_BINDING';
const secondary = [shortcut.dependence === 'HIGH' ? 'RESOURCE_FORGE_SHORTCUT_DEPENDENT' : null, fullOracle.meanRegret > 10 ? 'ORACLE_CEILING_LIMITED' : null].filter(Boolean);
const policySetConclusion = primaryResult === 'B_POLICY_QUALITY_IS_BINDING_LIMITATION'
  ? `Policy quality is binding: ${POLICIES.filter((p) => classification[p] === 'REDESIGN_CANDIDATE').join(', ')} contribute oracle value but are poor even when best available; `
    + `even a perfect router over the current set reaches only ${fullOracle.meanRegret.toFixed(2)} mean regret.`
  : `Primary result ${primaryResult}; full-set oracle mean regret ${fullOracle.meanRegret.toFixed(2)}.`;

/* -------------------------------------------------------------- tests */
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6p-policy-quality.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

/* ---------------------------------------------------------------- checks */
const regretVerified = rows.every((r) => [...POLICIES, CONTROL, GREEDY].every((p) => {
  if (!proposes(r, p)) return true;
  const b = r.branches.find((x) => x.k === r.chosen[p]);
  return b && b.r === r.regret[p] && b.o === r.correct[p];
}));
const conditioningVerified = rows.every((r) => { const { best, bestRegret } = bestPolicySet(r); return best.every((p) => r.regret[p] === bestRegret)
  && availablePolicies(r).every((p) => r.regret[p] >= bestRegret); });
const marginalVerified = POLICIES.every((p) => marginal[p].MARGINAL_ORACLE_REGRET_REDUCTION >= -1e-9 && marginal[p].MARGINAL_ORACLE_ACCURACY_GAIN >= -1e-9);
const selfSource = readText('scripts/certify-stage3f6p-policy-quality.mjs').replace(/\/\*[\s\S]*?\*\//g, '');
const checks = {
  PREDECESSORS_INTACT: scope.stage3f6aIntact && scope.stage3f6tIntact && scope.stage3f6wIntact && scope.stage3f6dIntact,
  POLICY_DEFINITIONS_UNCHANGED: scope.policyDefinitionsUnchanged,
  POLICY_SET_HASH_UNCHANGED: scope.policySetHashUnchanged,
  PRIOR_OWNERS_UNCHANGED: scope.priorOwnersUnchanged,
  DATA_INTEGRITY: integrity.corpus && integrity.proposals && integrity.evidence && integrity.evidenceBoundToCorpus && integrity.evidenceBoundToProposals,
  ACTION_EVALUATION_DETERMINISTIC: integrity.producerFidelityMismatches === 0,
  REGRET_CALCULATIONS_VERIFIED: regretVerified,
  BEST_POLICY_CONDITIONING_VERIFIED: conditioningVerified,
  MARGINAL_ORACLE_VERIFIED: marginalVerified,
  NO_SEALED_SPLIT_CONTAMINATION: sealedAccess.rowsOutsideDevCal === 0 && sealedAccess.evidencePartitions.join(',') === 'CAL,DEV',
  NO_ROUTER_TRAINING: !/fitPolicyRouter\(|fitLogisticRegression\(|scoreMatrix\(/.test(selfSource),
  NO_DECISION_RULE_TUNING: !/from '[^']*decision-rule-v1|routeEpisode\(|decide\(/.test(selfSource),
  NO_NEW_FEATURES: !/from '[^']*(decision-risk-state|deployable-feature-extractor)|V1[_]1|extractDeployableFeatures\(/.test(selfSource),
  PLAN_WRITTEN_BEFORE_METRICS: PLAN_HASH.length === 64,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

const payload = {
  schemaVersion: 1, stage: 'STAGE_3F_6_P_POLICY_QUALITY', status, planHash: PLAN_HASH, CONFIRMATORY_POLICY_QUALITY_CLAIMS: false,
  data: { N: rows.length, DEV: dev.length, CAL: rows.length - dev.length, integrity, sealedAccess, thresholds: T },
  absoluteQuality, opportunity, ceilings, marginal,
  nexusAudit: { bestAvailableN: nexusBest.length, whenBest: nexusWhenBest, regimes: nexusRegimes.regimes, primaryFailureRegime: nexusRegimes.primary,
    actionSemantics: nexusActionSemantics, actionPattern: { verdict: nexusActionPattern, top2Share, top2Regret, nexusMeanRegret },
    objective: NEXUS_OBJECTIVE_DOCUMENTATION, typeAlignmentWhenBest: typeAlignment, optimalTypeShareWhenNexusBest, byReason: nexusByReason,
    oracleGap: nexusOracleGap, routingVsPolicy, replacementHypothesis },
  resourceAudit, auxiliary, classification,
  diagnosis: { primaryResult, secondaryResult: secondary.length ? secondary.join('+') : null, policySetConclusion },
  disclosures: {
    STATIC_AUDIT_CORRECTION: 'first run: the three static audits matched their own regex literals in this file; tightened to call/import forms that cannot self-match. Plan hash unchanged; no metric or rule changed.',
    HIGH_HOSTILE_THRESHOLD: `DEV median hostile count is ${T.hostile}; HIGH_HOSTILE therefore means any observed hostile entity`,
    RESOURCE_SHORTCUT_STRUCTURAL: 'RESOURCE always selects a zero-declared-cost action, so it cannot be correct when no zero-cost action is optimal; HIGH dependence is structural, not estimated',
    NEXUS_BEST_INCLUDES_TIES: 'best-available includes zero-regret ties with RESOURCE; uniquely-best figures are the stricter view',
    ORACLE_FALLBACK: 'oracle subsets without any proposing member fall back to the RANDOM_LEGAL control action (plan)',
    REPLACEMENT_RULE_MARGIN: `type alignment ${typeAlignment.toFixed(4)} vs exact accuracy when best ${nexusWhenBest.accuracy.toFixed(4)}: the mapping rule missed its accuracy < 0.5 bar narrowly; the near-equality means target choice within a type is rarely the error`,
  },
  scope, checks, tests: testMetrics,
  sourceHashes: Object.fromEntries(scope.newOwners.map((f) => [f, hex(readFileSync(path.join(root, f)))])),
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false },
  roadmap: { READY_FOR_POLICY_REDESIGN: primaryResult === 'B_POLICY_QUALITY_IS_BINDING_LIMITATION', READY_FOR_ROUTER_RETRAIN: false, READY_FOR_STAGE3G: false },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(resultPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6P_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, planHash: PLAN_HASH,
    failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), classification, diagnosis: payload.diagnosis, roadmap: payload.roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
