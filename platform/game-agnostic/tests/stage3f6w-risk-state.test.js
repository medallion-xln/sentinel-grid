import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

import {
  DECISION_RISK_STATE_CONTRACT, DECISION_RISK_STATE_CONTRACT_HASH, RISK_STATE_FIELDS, RiskFieldStatus, extractDecisionRiskState,
} from '../src/stage3f/decision-risk-state-v1.js';
import { DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_PROFILES, DeployableProfile } from '../src/stage3f/deployable-feature-contract-v1.js';
import { auroc, fitLogisticRegression, scoreMatrix } from '../src/stage3f/deployable-router-v1.js';
import { bestLabel } from '../src/stage3f/policy-router-v1.js';
import { ObservationDegradation, degradeObservation } from '../src/stage3f/prediction-reliability-v1.js';
import { buildRecordV2 } from '../src/forge/record-v2.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { sha256 } from '../src/core/determinism.js';

const file = (relative) => new URL(`../${relative}`, import.meta.url);
const hex = (value) => createHash('sha256').update(value).digest('hex');
const text = (relative) => readFileSync(file(relative), 'utf8');
const gz = (relative) => gunzipSync(readFileSync(file(relative))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const riskSource = strip(text('src/stage3f/decision-risk-state-v1.js'));
const certifierSource = text('scripts/certify-stage3f6w-risk-state.mjs');
const generatorSource = text('scripts/generate-stage3f6w-risk-evidence.mjs');
const corpus = gz('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz');
const devRows = corpus.filter((r) => r.partition === 'DEV');

function decision(row) {
  const c = row.combination;
  const b = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
  const state = forgeAdapterState(b.world);
  const descriptors = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
  const legalActions = forgeLegalActions(state.world).map((a) => ({ actionId: forgeActionKey(a), actionType: a.actionType, targetEntityId: a.target?.id ?? null }));
  return { state, descriptors, legalActions, observation: forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID) };
}
const threatened = (() => {
  for (const row of devRows.slice(0, 200)) {
    const d = decision(row);
    if (extractDecisionRiskState(d).fields['risk.threatRelationCount'].value > 0) return d;
  }
  return null;
})();

/* ---------------- A. predecessors ---------------- */

test('1. predecessor certification hashes are intact', () => {
  const t = JSON.parse(text('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json'));
  const a = JSON.parse(text('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json'));
  const s = JSON.parse(text('artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'));
  assert.equal(t.certificationHash, '5d6910dd39405ee9f9fc2868f1309ff84998d30f7128e7a60b36644ca9056582');
  assert.equal(a.certificationHash, '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca');
  assert.equal(s.certificationHash, '825084e9ef58fb5fcb27a29bee4d8a9f3b7983aed1cf0d2b1719be3b5f604b35');
  assert.equal(hex(readFileSync(file('src/stage3f/policy-router-v1.js'))), t.sourceHashes['src/stage3f/policy-router-v1.js']);
});

/* ---------------- B. contract ---------------- */

test('2. risk extraction is deterministic', () => {
  assert.ok(threatened, 'no DEV decision with an observed threat in the first 200 rows');
  assert.equal(JSON.stringify(extractDecisionRiskState(threatened)), JSON.stringify(extractDecisionRiskState(threatened)));
});

test('3. the risk contract hash is deterministic and key-order invariant', () => {
  const reorder = (v) => (Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().reverse().map((k) => [k, reorder(v[k])])) : v);
  assert.equal(sha256(reorder(JSON.parse(JSON.stringify(DECISION_RISK_STATE_CONTRACT)))), DECISION_RISK_STATE_CONTRACT_HASH);
  for (const f of RISK_STATE_FIELDS) {
    for (const key of ['semantic', 'source', 'epistemicCategory', 'provenance', 'requiredCalibration', 'missingSemantics']) {
      assert.ok(typeof f[key] === 'string' && f[key].length > 0, `${f.fieldId} lacks ${key}`);
    }
  }
});

/* ---------------- C. static leakage ---------------- */

test('4. the risk contract has no future-outcome access', () => {
  for (const p of [/\.step\(/, /\bnextState\b/, /\.resultingStateHash\b/, /\.transition\(/, /\.terminal\b/, /evaluateCounterfactuals/, /rollout\(/]) assert.equal(p.test(riskSource), false, String(p));
});

test('5. the risk contract has no regret access', () => {
  for (const p of [/\.regret\b/, /\.scalarReward\b/, /\.totalRewardVector\b/, /\.optimalScalar\b/]) assert.equal(p.test(riskSource), false, String(p));
});

test('6. the risk contract has no optimal-policy label access', () => {
  for (const p of [/\.optimalSet\b/, /\.optimalActionKey\b/, /\.correct\b/, /buildTarget/, /bestLabel/, /bestPolicySet/]) assert.equal(p.test(riskSource), false, String(p));
});

test('7. no sealed split is read', () => {
  for (const p of [/\.partition\b/, /HOLDOUT/, /\bOOD\b/, /\.recordHash\b/]) assert.equal(p.test(riskSource), false, String(p));
  assert.match(generatorSource, /STAGE3F6W_PARTITIONS = Object\.freeze\(\['DEV', 'CAL'\]\)/);
  assert.equal(/confirmatory-holdout-ood/.test(certifierSource), false, 'the certifier must not open the Stage 3F.6-T sealed splits');
  assert.match(certifierSource, /DEVELOPMENT_PARTITIONS = \['DEV', 'CAL'\]/);
  const manifest = JSON.parse(text('artifacts/stage3f6w-risk-state/risk-evidence-manifest.json'));
  assert.equal(manifest.sealedPartitionsRead, false);
  assert.deepEqual(Object.keys(manifest.counts).sort(), ['CAL', 'DEV']);
});

/* ---------------- D. dynamic behaviour ---------------- */

test('8. risk state is invariant to which future occurs', () => {
  const before = JSON.stringify(extractDecisionRiskState(threatened));
  const outcomes = new Set();
  for (const desc of threatened.descriptors) {
    const r = forgeWorldAdapter.step(forgeWorldAdapter.cloneState(threatened.state), desc, { observerId: FORGE_OBSERVER_ID });
    outcomes.add(`${r.reward}:${r.terminal}`);
  }
  assert.equal(JSON.stringify(extractDecisionRiskState(threatened)), before);
  assert.equal(JSON.stringify(extractDecisionRiskState({ observation: forgeWorldAdapter.observe(threatened.state, FORGE_OBSERVER_ID), legalActions: threatened.legalActions })), before);
});

test('9. degraded threat observation changes risk fields or makes them UNKNOWN', () => {
  const base = extractDecisionRiskState(threatened).fields;
  for (const mode of [ObservationDegradation.REMOVE_THREAT_INFORMATION, ObservationDegradation.HIDE_RELATIONSHIPS]) {
    const after = extractDecisionRiskState({ observation: degradeObservation(threatened.observation, mode), legalActions: threatened.legalActions }).fields;
    const moved = ['risk.threatRelationCount', 'risk.maxThreatPressure']
      .some((k) => after[k].status !== RiskFieldStatus.AVAILABLE || after[k].value !== base[k].value);
    assert.ok(moved, `${mode} left threat risk unchanged — it would be reading something other than the observation`);
  }
});

test('10. missing evidence is never zero, safe, or covered', () => {
  const absent = structuredClone(threatened.observation);
  delete absent.metadata.canonicalState.relationships;
  const noRel = extractDecisionRiskState({ observation: absent, legalActions: threatened.legalActions }).fields;
  assert.equal(noRel['risk.threatRelationCount'].status, RiskFieldStatus.UNKNOWN);
  assert.equal(noRel['risk.threatRelationCount'].value, null);
  const noActions = extractDecisionRiskState({ observation: threatened.observation, legalActions: null }).fields;
  assert.equal(noActions['risk.coveredThreatCount'].status, RiskFieldStatus.UNAVAILABLE);
  assert.equal(noActions['risk.retreatOptionCount'].value, null);
  const quiet = structuredClone(threatened.observation);
  quiet.metadata.canonicalState.relationships = [];
  const ratio = extractDecisionRiskState({ observation: quiet, legalActions: threatened.legalActions }).fields['risk.threatCoverageRatio'];
  assert.equal(ratio.status, RiskFieldStatus.NOT_APPLICABLE);
  assert.equal(ratio.value, null, 'coverage with no threatened entity must not be imputed');
  for (const f of Object.values(noRel)) if (f.status !== RiskFieldStatus.AVAILABLE) assert.equal(f.value, null, f.fieldId);
});

test('11. there is no hidden world-state bypass', () => {
  const before = JSON.stringify(extractDecisionRiskState(threatened));
  const mutated = forgeWorldAdapter.cloneState(threatened.state);
  for (const e of mutated.world.entities) if (e.type === 'HOSTILE') e.health = 0;
  mutated.world.relations = [];
  assert.equal(JSON.stringify(extractDecisionRiskState(threatened)), before, 'risk moved when only hidden world state changed');
  const foreign = extractDecisionRiskState({ observation: { ...threatened.observation, schemaId: 'foreign/observation' }, legalActions: threatened.legalActions }).fields;
  for (const k of ['risk.hostileAliveCount', 'risk.actorHealth', 'risk.threatRelationCount']) assert.equal(foreign[k].status, RiskFieldStatus.UNKNOWN, k);
  for (const p of [/state\.world/, /\bworld\./, /observationHistory/, /from '\.\.\/forge\//, /from '\.\.\/lab\//]) assert.equal(p.test(riskSource), false, String(p));
});

/* ---------------- E. contracts and analysis ---------------- */

test('12. the CORE feature contract is unchanged', () => {
  const s = JSON.parse(text('artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'));
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT_HASH, s.contract.hash);
  assert.equal(hex(readFileSync(file('src/stage3f/deployable-feature-contract-v1.js'))), s.sourceHashes['src/stage3f/deployable-feature-contract-v1.js']);
  assert.equal(DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds.length, 30);
  assert.match(certifierSource, /SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1_1/);
});

test('13. the incremental information test is deterministic', () => {
  const proposals = new Map(gz('artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz').map((r) => [r.recordHash, r]));
  const keys = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort();
  const rows = devRows.slice(0, 800).map((r) => ({ ...r, ...proposals.get(r.recordHash) }))
    .filter((r) => ['NEXUS_SELECTOR', 'RESOURCE_PRESERVING_V1'].includes(bestLabel(r)));
  const run = () => {
    const m = fitLogisticRegression(rows.map((r) => keys.map((k) => r.core[k])), rows.map((r) => (bestLabel(r) === 'NEXUS_SELECTOR' ? 1 : 0)), keys, { iterations: 300 });
    return auroc(scoreMatrix(m, rows.map((r) => keys.map((k) => r.core[k]))), rows.map((r) => (bestLabel(r) === 'NEXUS_SELECTOR' ? 1 : 0)));
  };
  assert.equal(run(), run());
});

test('14. rejected candidate fields are recorded with a reason', () => {
  assert.match(certifierSource, /NOT_USABLE_WITHOUT_IMPUTATION/);
  assert.match(certifierSource, /STRUCTURALLY_REDUNDANT/);
  assert.match(certifierSource, /NO_MEASURABLE_INCREMENT_ON_DEV/);
  assert.match(certifierSource, /rejectedFields: selection\.filter\(\(s\) => !s\.accepted\)/);
});

/* ---------------- F. authority ---------------- */

test('15. authority stays R0', () => {
  assert.equal(DECISION_RISK_STATE_CONTRACT.authority.tier, 'R0');
  assert.equal(DECISION_RISK_STATE_CONTRACT.authority.canDispatch, false);
  assert.equal(DECISION_RISK_STATE_CONTRACT.authority.canMutateLiveWorld, false);
  assert.equal(/canDispatch:\s*true|canMutateLiveWorld:\s*true/.test(certifierSource), false);
});

test('16. no router is promoted', () => {
  assert.match(certifierSource, /promoted: false, isRouterCandidate: false/);
  assert.match(certifierSource, /routerCandidatePromoted: false/);
  assert.equal(/promoted:\s*true/.test(certifierSource), false);
});

test('17. no online learning is enabled', () => {
  assert.match(certifierSource, /onlineLearningEnabled: false/);
  assert.equal(/onlineLearningEnabled:\s*true/.test(certifierSource), false);
});
