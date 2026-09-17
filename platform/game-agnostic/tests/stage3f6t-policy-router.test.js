import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';

import {
  POLICY_SET, POLICY_SET_HASH, ROUTED_POLICIES, STAGE3F6T_METHODOLOGY, availablePolicies, bestLabel, bestPolicySet,
  evaluateStrategy, falseSelectionHarm, fitPolicyRouter, oracleGainCaptured, pairedBootstrap, policyRouterHash,
  routeEpisode, scorePolicies, selectionConfusion,
} from '../src/stage3f/policy-router-v1.js';
import {
  DEPLOYABLE_FEATURES, DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_PROFILES, DeployableProfile,
} from '../src/stage3f/deployable-feature-contract-v1.js';
import { sha256 } from '../src/core/determinism.js';

const file = (relative) => new URL(`../${relative}`, import.meta.url);
const hex = (value) => createHash('sha256').update(value).digest('hex');
const gz = (relative) => gunzipSync(readFileSync(file(relative))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const CORE_KEYS = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort();
const certifierSource = readFileSync(file('scripts/certify-stage3f6t-policy-router.mjs'), 'utf8');
const stage3f6a = JSON.parse(readFileSync(file('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json'), 'utf8'));
const stage3f6c = JSON.parse(readFileSync(file('artifacts/stage3f6c-deployable-router/stage3f6c-certification-result.json'), 'utf8'));
const stage3f6s = JSON.parse(readFileSync(file('artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'), 'utf8'));

/* DEV rows, joined exactly as the certifier joins them (development data only). */
const corpus = gz('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz');
const proposals = new Map(gz('artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz').map((r) => [r.recordHash, r]));
const dev = corpus.filter((r) => r.partition === 'DEV').slice(0, 600).map((r) => {
  const p = proposals.get(r.recordHash);
  return { ...r, chosen: p.chosen, correct: p.correct, regret: p.regret };
});
const CONFIRMATORY = 'artifacts/stage3f6t-policy-router/confirmatory-holdout-ood.jsonl.gz';
const CONFIRMATORY_MANIFEST = 'artifacts/stage3f6t-policy-router/confirmatory-holdout-ood-manifest.json';

/* Synthetic episode builder for exact behavioural checks. */
const episode = ({ regret, chosen, core = {} }) => ({
  core: Object.fromEntries(CORE_KEYS.map((k) => [k, core[k] ?? 0])),
  chosen: Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, v])),
  regret,
  correct: Object.fromEntries(Object.entries(regret).map(([k, v]) => [k, v === null ? null : (v === 0 ? 1 : 0)])),
});

/* ---------------- A. frozen policy set ---------------- */

test('1. Stage 3F.6-A policy definitions are byte-identical to what was certified', () => {
  const source = 'src/stage3f/deployable-action-proposal-v1.js';
  assert.equal(hex(readFileSync(file(source))), stage3f6a.sourceHashes[source]);
  assert.equal(POLICY_SET.policiesModified, false);
  assert.equal(POLICY_SET.policiesAdded, false);
  assert.deepEqual([...ROUTED_POLICIES], ['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1']);
});

test('2. the policy-set hash is deterministic and key-order invariant', () => {
  const reorder = (value) => {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort().reverse()) out[key] = reorder(value[key]);
      return out;
    }
    return value;
  };
  assert.equal(sha256(reorder(JSON.parse(JSON.stringify(POLICY_SET)))), POLICY_SET_HASH);
  assert.equal(POLICY_SET_HASH.length, 64);
});

/* ---------------- B. input contract ---------------- */

test('3. the router input is bound to the certified Stage 3F.6-S feature contract', () => {
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT_HASH, stage3f6s.contract.hash);
  assert.equal(CORE_KEYS.length, 30);
  assert.equal(STAGE3F6T_METHODOLOGY.inputProfile, 'DEPLOYABLE_CORE');
});

test('4. no simulator feature enters the primary router', () => {
  for (const id of CORE_KEYS) {
    const def = DEPLOYABLE_FEATURES.find((f) => f.featureId === id);
    assert.equal(def.requiredCapabilities.includes('SIMULATOR_ONE_STEP'), false, id);
    assert.equal(def.multiStepRollout, false, id);
  }
});

test('5. no V2B feature enters the primary router', () => {
  for (const id of CORE_KEYS) {
    assert.equal(DEPLOYABLE_FEATURES.find((f) => f.featureId === id).requiredCapabilities.includes('EXPERT_V2B'), false, id);
  }
});

/* ---------------- C. training discipline ---------------- */

test('6. training never reads HOLDOUT or OOD', () => {
  assert.match(certifierSource, /SEALED_PARTITION_ACCESS_BEFORE_FREEZE/);
  const fitIndex = certifierSource.indexOf('fitPolicyRouter(dev, CORE_KEYS)');
  const freezeIndex = certifierSource.indexOf('evaluationFreeze = { ...freezePayload');
  const holdoutIndex = certifierSource.indexOf("sealedRows('HOLDOUT')");
  assert.ok(fitIndex > 0 && freezeIndex > fitIndex && holdoutIndex > freezeIndex, 'sealed rows reachable before fit/freeze');
  // The exposed Stage 3F.6-C sealed partitions are never joined for training or evaluation.
  assert.equal(/joinTraining\('HOLDOUT'\)|joinTraining\('OOD'\)/.test(certifierSource), false);
  if (existsSync(file(CONFIRMATORY))) {
    const devIds = new Set(corpus.filter((r) => r.partition === 'DEV' || r.partition === 'CAL').map((r) => r.recordHash));
    for (const row of gz(CONFIRMATORY)) assert.equal(devIds.has(row.recordHash), false);
  }
});

test('7. an unavailable (abstaining) policy can never be selected', () => {
  const model = fitPolicyRouter(dev, CORE_KEYS, { iterations: 50 });
  const row = episode({
    chosen: { RESOURCE_PRESERVING_V1: 'a'.repeat(16), NEXUS_SELECTOR: null, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null },
    regret: { RESOURCE_PRESERVING_V1: 10, NEXUS_SELECTOR: null, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null },
  });
  assert.deepEqual(availablePolicies(row), ['RESOURCE_PRESERVING_V1']);
  const scored = scorePolicies(model, row);
  assert.equal(scored.selected, 'RESOURCE_PRESERVING_V1');
  assert.equal(scored.probabilities.NEXUS_SELECTOR, 0);
  assert.equal(scored.probabilities.THREAT_COVERING_V1, 0);
  for (const threshold of [0, 0.99]) {
    const routed = routeEpisode(model, row, { threshold, fallbackPolicy: 'NEXUS_SELECTOR' });
    assert.equal(routed.selectedPolicy, 'RESOURCE_PRESERVING_V1', `threshold ${threshold} selected an unavailable policy`);
  }
});

test('8. tie labels are preserved and handled deterministically', () => {
  const row = episode({
    chosen: { RESOURCE_PRESERVING_V1: 'a', NEXUS_SELECTOR: 'b', OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: 'c' },
    regret: { RESOURCE_PRESERVING_V1: 5, NEXUS_SELECTOR: 5, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: 9 },
  });
  const { best, bestRegret } = bestPolicySet(row);
  assert.deepEqual(best, ['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR']);
  assert.equal(bestRegret, 5);
  assert.equal(bestLabel(row), 'TIE');
  const again = bestPolicySet(row);
  assert.deepEqual(again.best, best);
});

test('9. training is deterministic', () => {
  const a = fitPolicyRouter(dev, CORE_KEYS, { iterations: 200 });
  const b = fitPolicyRouter(dev, CORE_KEYS, { iterations: 200 });
  assert.deepEqual(a.W, b.W);
  assert.deepEqual(a.mu, b.mu);
});

test('10. the router hash is deterministic and sensitive to the weights', () => {
  const a = fitPolicyRouter(dev, CORE_KEYS, { iterations: 200 });
  const b = fitPolicyRouter(dev, CORE_KEYS, { iterations: 200 });
  const c = fitPolicyRouter(dev, CORE_KEYS, { iterations: 201 });
  assert.equal(policyRouterHash(a), policyRouterHash(b));
  assert.notEqual(policyRouterHash(a), policyRouterHash(c));
});

test('11. evaluation replay is deterministic, including the seeded bootstrap', () => {
  const model = fitPolicyRouter(dev, CORE_KEYS, { iterations: 200 });
  const choose = (row) => routeEpisode(model, row, { threshold: 0, fallbackPolicy: 'RESOURCE_PRESERVING_V1' }).selectedPolicy;
  assert.equal(JSON.stringify(evaluateStrategy(dev, choose)), JSON.stringify(evaluateStrategy(dev, choose)));
  const b1 = pairedBootstrap(dev, choose, () => 'RESOURCE_PRESERVING_V1', { resamples: 100 });
  const b2 = pairedBootstrap(dev, choose, () => 'RESOURCE_PRESERVING_V1', { resamples: 100 });
  assert.deepEqual(b1, b2);
});

/* ---------------- D. required comparisons ---------------- */

test('12. the best-single-policy comparison is computed and is the headline', () => {
  assert.match(certifierSource, /headlineComparison: 'ROUTED_POLICY_SET vs ALWAYS_RESOURCE_PRESERVING_V1'/);
  assert.match(certifierSource, /routerMinusBestSingle/);
  const rows = [
    episode({ chosen: { RESOURCE_PRESERVING_V1: 'a', NEXUS_SELECTOR: 'b', OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null },
      regret: { RESOURCE_PRESERVING_V1: 0, NEXUS_SELECTOR: 10, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null } }),
    episode({ chosen: { RESOURCE_PRESERVING_V1: 'a', NEXUS_SELECTOR: 'b', OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null },
      regret: { RESOURCE_PRESERVING_V1: 20, NEXUS_SELECTOR: 0, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null } }),
  ];
  const resource = evaluateStrategy(rows, () => 'RESOURCE_PRESERVING_V1');
  assert.equal(resource.accuracy, 0.5);
  assert.equal(resource.meanRegret, 10);
});

test('13. the oracle-gain fraction is computed with correct semantics', () => {
  const captured = oracleGainCaptured({
    router: { accuracy: 0.7, meanRegret: 20 },
    bestSingle: { accuracy: 0.6, meanRegret: 25 },
    oracle: { accuracy: 0.8, meanRegret: 15 },
  });
  assert.ok(Math.abs(captured.accuracy - 0.5) < 1e-12);
  assert.ok(Math.abs(captured.regret - 0.5) < 1e-12);
  const none = oracleGainCaptured({ router: { accuracy: 0.6, meanRegret: 25 }, bestSingle: { accuracy: 0.6, meanRegret: 25 },
    oracle: { accuracy: 0.6, meanRegret: 25 } });
  assert.equal(none.accuracy, null, 'a zero denominator must not produce a fraction');
});

test('14. the policy-collapse metric is computed against the optimal distribution', () => {
  assert.match(certifierSource, /POLICY_COLLAPSE: topShare > COLLAPSE_RULE\.share && topShare > optimalShare \+ COLLAPSE_RULE\.optimalityMargin/);
  assert.equal(STAGE3F6T_METHODOLOGY.policyCollapseShare, 0.9);
});

test('15. false-selection harm measures regret added versus the best available policy', () => {
  const rows = [
    episode({ chosen: { RESOURCE_PRESERVING_V1: 'a', NEXUS_SELECTOR: 'b', OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null },
      regret: { RESOURCE_PRESERVING_V1: 30, NEXUS_SELECTOR: 10, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null } }),
    episode({ chosen: { RESOURCE_PRESERVING_V1: 'a', NEXUS_SELECTOR: 'b', OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null },
      regret: { RESOURCE_PRESERVING_V1: 0, NEXUS_SELECTOR: 5, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null } }),
  ];
  const harm = falseSelectionHarm(rows, () => 'RESOURCE_PRESERVING_V1');
  assert.equal(harm.falseSelections, 1);
  assert.equal(harm.meanAddedRegret, 20);
  assert.equal(harm.worst, 20);
  const confusion = selectionConfusion(rows, () => 'RESOURCE_PRESERVING_V1');
  assert.equal(confusion.recall.NEXUS_SELECTOR.selectedWhenUniquelyBest, 0);
  assert.equal(confusion.recall.RESOURCE_PRESERVING_V1.selectedWhenUniquelyBest, 1);
});

/* ---------------- E. confirmatory data ---------------- */

test('15b. fresh confirmatory splits match their manifest and are disjoint from all prior rows', () => {
  assert.ok(existsSync(file(CONFIRMATORY)), 'run npm run stage3f6t:generate first');
  const manifest = JSON.parse(readFileSync(file(CONFIRMATORY_MANIFEST), 'utf8'));
  const raw = gunzipSync(readFileSync(file(CONFIRMATORY))).toString('utf8');
  assert.equal(hex(raw), manifest.contentHash);
  assert.deepEqual(manifest.overlapWithPriorCorpus, { topology: 0, record: 0, state: 0 });
  assert.equal(manifest.internalOverlap.HOLDOUT_OOD_topology, 0);
  assert.deepEqual(manifest.counts, { HOLDOUT: 6000, OOD: 6000 });
  for (const seed of [...manifest.spec.holdout.seeds, ...manifest.spec.ood.seeds]) {
    assert.equal(manifest.spec.priorSeedSpaces.includes(seed), false);
  }
  const priorTopologies = new Set(corpus.map((r) => r.topologyHash));
  for (const row of raw.split('\n').filter(Boolean).slice(0, 2000).map((l) => JSON.parse(l))) {
    assert.equal(priorTopologies.has(row.topologyHash), false);
    assert.deepEqual(Object.keys(row.core).sort(), CORE_KEYS);
  }
});

/* ---------------- F. predecessors, authority, promotion ---------------- */

test('16. Stage 3F.6-A remains intact', () => {
  assert.equal(stage3f6a.status, 'PASS');
  assert.equal(stage3f6a.certificationHash, '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca');
});

test('17. Stage 3F.6-C remains intact', () => {
  assert.equal(stage3f6c.status, 'PASS');
  assert.equal(stage3f6c.certificationHash, '40ae3b415eeca2c1774a5f4ce2e2904bb189d4d83f98f26c1614eccce5dd0051');
});

test('18. authority stays R0 and non-dispatching', () => {
  assert.match(certifierSource, /tier: 'R0', canDispatch: false, canMutateLiveWorld: false/);
  assert.equal(/canDispatch:\s*true|canMutateLiveWorld:\s*true/.test(certifierSource), false);
});

test('19. no online learning is enabled', () => {
  assert.match(certifierSource, /onlineLearningEnabled: false/);
  assert.equal(/onlineLearningEnabled:\s*true/.test(certifierSource), false);
});

test('20. the candidate router is never promoted to the live runtime', () => {
  assert.match(certifierSource, /promotedToLiveRuntime: false/);
  assert.equal(/promotedToLiveRuntime:\s*true/.test(certifierSource), false);
  assert.match(certifierSource, /largerModelTrained: false/);
});
