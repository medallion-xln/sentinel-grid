import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CORE_IDS, HISTORICAL_W, HISTORICAL_W_HASH, STAGE3F6WSYM_PLAN, STAGE3F6WSYM_PLAN_HASH, STAGE3F6WSYM_PLAN_PATH, STAGE3F6WSYM_SEED_PLAN, STAGE3F6WSYM_SEED_PLAN_HASH,
} from '../scripts/stage3f6wsym-analysis-plan.mjs';
import { FRESH_PARTITIONS, OPEN_REPORT_PATH, combinationsFor, freshGate, readPriorLineage, seedAudit } from '../scripts/generate-stage3f6wsym-confirmatory.mjs';
import { riskEvidence } from '../scripts/stage3f6wsym-evidence.mjs';
import { readCorpus } from '../scripts/generate-stage3f6p1e-policy-evidence.mjs';
import { DECISION_RISK_STATE_CONTRACT_HASH, RISK_STATE_FIELDS, extractDecisionRiskState } from '../src/stage3f/decision-risk-state-v1.js';
import { bootstrapPlan } from '../src/stage3f/policy-requalification-v1.js';
import {
  RISK_FIELD_IDS, classifyWField, compactRisk, contractFlags, incrementVerdict, pairedAurocDelta, riskClassification,
} from '../src/stage3f/risk-requalification-v1.js';
import { sha256 } from '../src/core/determinism.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (r) => path.join(root, r);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const json = (r) => JSON.parse(readFileSync(at(r), 'utf8'));
const corpus = readCorpus();
const dev = corpus.filter((r) => r.partition === 'DEV');

test('1. plan, seed-plan and historical-W hashes are deterministic and bound to the frozen plan file', () => {
  assert.equal(sha256(STAGE3F6WSYM_PLAN), STAGE3F6WSYM_PLAN_HASH);
  assert.equal(sha256(STAGE3F6WSYM_SEED_PLAN), STAGE3F6WSYM_SEED_PLAN_HASH);
  assert.equal(sha256(HISTORICAL_W), HISTORICAL_W_HASH);
  const f = json(STAGE3F6WSYM_PLAN_PATH);
  assert.equal(f.planHash, STAGE3F6WSYM_PLAN_HASH); assert.equal(sha256(f.seedPlan), STAGE3F6WSYM_SEED_PLAN_HASH); assert.equal(sha256(f.historicalW), HISTORICAL_W_HASH);
});

test('2. the sealed seeds are disjoint from every prior seed, from each other and from all 56000 prior rows', () => {
  for (const s of [2001, 2011, 2021, 2022, 2023, 2031, 2032, 2033, 3021, 3031, 1, 11, 611, 1011]) assert.ok(STAGE3F6WSYM_SEED_PLAN.priorSeeds.includes(s), `prior seed ${s} enumerated`);
  const { rows, sources } = readPriorLineage();
  assert.deepEqual(sources.map((s) => [s.name, s.rows]), [['P.1D', 20000], ['T-SYM', 12000], ['P.1A-SYM', 12000], ['P.1-SYM', 12000]]);
  const a = seedAudit(rows);
  assert.deepEqual(a.overlapWithPriorSeeds, []); assert.deepEqual(a.usedByPriorRows, []); assert.deepEqual(a.holdoutOodOverlap, []); assert.equal(a.duplicates, 0);
});

test('3. canonical combination order uses only declared seeds and levels, first seed first', () => {
  for (const [, source] of Object.entries(FRESH_PARTITIONS)) {
    const c = combinationsFor(source);
    assert.ok(c.every((x) => STAGE3F6WSYM_SEED_PLAN.declared[source].includes(x.seed) && STAGE3F6WSYM_SEED_PLAN.levels[source].includes(x.level)));
    assert.equal(c[0].seed, STAGE3F6WSYM_SEED_PLAN.declared[source][0]);
  }
  assert.deepEqual([combinationsFor('HOLDOUT')[0].seed, combinationsFor('OOD')[0].seed], [3022, 3032]);
});

test('4. the risk module and W evidence helper are byte-identical to the Stage 3F.6-W certificate; the contract is unchanged', () => {
  for (const [f, h] of Object.entries(HISTORICAL_W.certifiedSourceHashes)) assert.equal(hex(readFileSync(at(f))), h, f);
  assert.equal(DECISION_RISK_STATE_CONTRACT_HASH, json('artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json').riskStateContract.hash);
  for (const f of RISK_STATE_FIELDS) assert.deepEqual(Object.values(contractFlags(f.fieldId)), [false, false, false, false], f.fieldId);
});

test('5. the open-phase report is plan-bound, DEV/CAL only, reproduces the T-SYM router, and the fresh gate opens only on committed files', () => {
  const o = json(OPEN_REPORT_PATH);
  assert.equal(o.planHash, STAGE3F6WSYM_PLAN_HASH); assert.deepEqual(o.partitions, ['DEV', 'CAL']); assert.equal(o.noSealedRowScored, true);
  assert.equal(o.routers.fitDeterministic, true); assert.equal(o.routers.baseRouterIsTsymRouter, true);
  const { reportHash, ...body } = o; assert.equal(hex(JSON.stringify(body)), reportHash);
  assert.deepEqual(freshGate(), []);
});

test('6. evidence replays deterministically; risk is D4-invariant while absolute actor position is not', () => {
  const r = dev.find((x) => x.equivariance !== null && x.core['relational.threatenedEntityCount'] > 0) ?? dev.find((x) => x.equivariance !== null);
  const a = riskEvidence(r); const b = riskEvidence(r);
  assert.deepEqual(a, b);
  for (const k of ['world', 'surface', 'choices', 'relabel']) assert.equal(a.fidelity[k], 1, k);
  for (const t of Object.values(a.twins)) for (const id of RISK_FIELD_IDS) assert.equal(t.risk[id], 1, id);
  assert.ok(Object.values(a.twins).some((t) => t.spatial === 0), 'a D4 twin moves the absolute actor position');
});

const synthetic = () => ({
  observation: null,
  legalActions: [{ actionId: 'x9', actionType: 'PROTECT', targetEntityId: 'c', parameters: {} }, { actionId: 'x1', actionType: 'RETREAT', targetEntityId: null, parameters: {} },
    { actionId: 'x5', actionType: 'WAIT', targetEntityId: null, parameters: {} }],
});

test('7. risk extraction reads identities and list order nowhere', () => {
  const r = dev[0]; const e = riskEvidence(r);
  assert.equal(e.fidelity.relabel, 1);
  const s = synthetic();
  const base = compactRisk(extractDecisionRiskState(s));
  const relabelled = compactRisk(extractDecisionRiskState({ ...s, legalActions: [...s.legalActions].reverse().map((a, i) => ({ ...a, actionId: `z${i}` })) }));
  assert.deepEqual(relabelled, base);
  assert.equal(base.value['risk.retreatOptionCount'], 1);
});

test('8. feature-validity classification follows the predeclared precedence (mutation-sensitive)', () => {
  const none = { NON_DEPLOYABLE: false, ORACLE_ONLY: false, ROLLOUT_REQUIRED: false, FUTURE_STATE_REQUIRED: false, LEAKED: false, UNAVAILABLE: false, DIVERGENT: false,
    SHORTCUT_CORRELATED: false, REDUNDANT: false };
  assert.equal(classifyWField(none).class, 'DEPLOYABLE');
  assert.equal(classifyWField({ ...none, REDUNDANT: true }).class, 'REDUNDANT');
  assert.equal(classifyWField({ ...none, REDUNDANT: true, SHORTCUT_CORRELATED: true }).class, 'SHORTCUT_CORRELATED');
  assert.equal(classifyWField({ ...none, SHORTCUT_CORRELATED: true, UNAVAILABLE: true }).class, 'UNAVAILABLE');
  assert.equal(classifyWField({ ...none, UNAVAILABLE: true, LEAKED: true }).class, 'LEAKED');
  assert.equal(classifyWField({ ...none, LEAKED: true, ORACLE_ONLY: true }).class, 'ORACLE_ONLY');
  assert.deepEqual(classifyWField({ ...none, LEAKED: true, REDUNDANT: true }).failing, ['LEAKED', 'REDUNDANT']);
});

test('9. paired AUROC increments: identical scorers give zero, a strictly better scorer is significant, bars are the historical W bars', () => {
  const n = 400; const y = Array.from({ length: n }, (_, i) => (i % 2));
  const noise = Array.from({ length: n }, (_, i) => ((i * 7919) % 101) / 101);
  const good = y.map((v, i) => v + 0.5 * noise[i]);
  const plan = bootstrapPlan(n, 'test');
  const same = pairedAurocDelta(noise, noise, y, plan);
  assert.equal(same.delta, 0); assert.deepEqual(same.ci95, [0, 0]); assert.equal(incrementVerdict(same).significant, false);
  const better = pairedAurocDelta(noise, good, y, plan);
  assert.ok(better.delta > 0.3 && better.ci95[0] > 0); assert.deepEqual(incrementVerdict(better), { significant: true, material: true });
  assert.deepEqual(incrementVerdict({ delta: 0.019, ci95: [0.001, 0.03] }), { significant: true, material: false });
  assert.deepEqual(incrementVerdict({ delta: 0.03, ci95: [-0.001, 0.06] }), { significant: false, material: false });
});

test('10. risk classification follows the predeclared precedence (mutation-sensitive)', () => {
  const base = { insufficient: false, genuine: false, shortcutCorrelated: false, weak: false, redundant: false, notRoutable: true, routerValueNotMaterial: true, oodUnstable: false, proxy: false };
  assert.equal(riskClassification(base).primary, 'RISK_SIGNAL_ABSENT');
  assert.equal(riskClassification({ ...base, shortcutCorrelated: true }).primary, 'RISK_SIGNAL_SHORTCUT_CORRELATED');
  assert.equal(riskClassification({ ...base, shortcutCorrelated: true, redundant: true }).primary, 'RISK_SIGNAL_REDUNDANT');
  assert.equal(riskClassification({ ...base, redundant: true, weak: true }).primary, 'RISK_SIGNAL_WEAK');
  assert.equal(riskClassification({ ...base, weak: true, genuine: true }).primary, 'GENUINE_RISK_SIGNAL');
  assert.equal(riskClassification({ ...base, genuine: true, insufficient: true }).primary, 'INSUFFICIENT_EVIDENCE');
  const l = riskClassification({ ...base, weak: true, oodUnstable: true, proxy: true }).labels;
  for (const k of ['RISK_SIGNAL_WEAK', 'RISK_SIGNAL_NOT_ROUTABLE', 'ROUTER_VALUE_NOT_MATERIAL', 'OOD_UNSTABLE', 'PROXY_OF_HIDDEN_GEOMETRY']) assert.ok(l.includes(k), k);
  assert.ok(!riskClassification({ ...base, weak: true }).labels.includes('RISK_SIGNAL_ABSENT'));
});

test('11. headline routers read CORE and valid risk only; no hidden temporary paths, no larger model, R0 intact', () => {
  const o = json(OPEN_REPORT_PATH);
  for (const [name, r] of Object.entries(o.routers.fitted)) {
    if (r.status === 'NOT_EVALUATED') continue;
    assert.ok(r.keys.every((k) => CORE_IDS.includes(k) || o.validDeployableWFeatureSet.includes(k)), name);
  }
  assert.ok(o.validDeployableWFeatureSet.every((id) => o.featureAudit[id].class === 'DEPLOYABLE' && id.startsWith('risk.')));
  for (const f of ['scripts/stage3f6wsym-analysis-plan.mjs', 'scripts/generate-stage3f6wsym-confirmatory.mjs', 'scripts/stage3f6wsym-evidence.mjs',
    'scripts/certify-stage3f6wsym-risk.mjs', 'src/stage3f/risk-requalification-v1.js']) {
    const s = readFileSync(at(f), 'utf8');
    assert.ok(!/\/tmp\/|\/private\/|tmpdir\(|scratchpad/.test(s), f);
    assert.ok(!/from '[^']*(jepa|neural|tensorflow|onnx|world-model)/i.test(s), f);
  }
  assert.deepEqual(STAGE3F6WSYM_PLAN.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
});
