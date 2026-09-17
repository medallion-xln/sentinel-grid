import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { evaluateNexus } from '../src/experts/nexus.js';
import { nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import { nexusSelectorV2Candidate } from '../src/stage3f/nexus-selector-v2-candidate.js';
import {
  Missing, NEXUS_RELATIONAL_SPATIAL_CONTEXT_CONTRACT, NEXUS_RELATIONAL_SPATIAL_CONTEXT_HASH, NEXUS_SPATIAL_CANDIDATE_FIELDS, deriveRelationalSpatialContext,
} from '../src/stage3f/nexus-relational-spatial-context-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (r) => path.join(root, r);
const text = (r) => readFileSync(at(r), 'utf8');
const json = (r) => JSON.parse(text(r));
const hex = (v) => createHash('sha256').update(v).digest('hex');
const OUT = 'artifacts/stage3f6p1a-nexus-spatial';
const CONTRACT = 'src/stage3f/nexus-relational-spatial-context-v1.js';
const freeze = json(`${OUT}/stage3f6p1a-dev-freeze.json`);
const p1Freeze = json('artifacts/stage3f6p1-nexus-remediation/stage3f6p1-candidate-freeze.json');
const devRows = gunzipSync(readFileSync(at(`${OUT}/spatial-evidence-dev.jsonl.gz`))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const contractCode = text(CONTRACT).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, '``');
const certifierCode = text('scripts/certify-stage3f6p1a-nexus-spatial.mjs').replace(/\/\*[\s\S]*?\*\//g, '');
const K = (id) => id.slice(0, 16);
const headHash = (r) => { const g = spawnSync('git', ['-C', path.resolve(root, '..', '..'), 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };

const POISON = ['optimalSet', 'regret', 'labels', 'outcome', 'nextState', 'futureState', 'scalarReward', 'privilegedDiagnostic', 'grid', 'position', 'cells', 'world', 'cost'];
function poisoned(di) {
  const accessed = [];
  const trap = (o) => { for (const k of POISON) Object.defineProperty(o, k, { enumerable: false, get() { accessed.push(k); throw new Error(`LEAK:${k}`); } }); return o; };
  const input = trap({ observationFeatures: di.observationFeatures,
    legalActions: di.legalActions.map((a) => trap({ ...a, parameters: trap({ ...(a.parameters ?? {}) }) })),
    canonicalState: trap({ entities: di.canonicalState.entities.map((e) => trap({ ...e })), relationships: di.canonicalState.relationships }) });
  return { accessed, input };
}
const features = (x, y) => [0, 4, 10, x, y, 100, 0, 3, 1, 0, 1, 0, 0];
const synthetic = (overrides = {}) => ({
  observationFeatures: features(2, 2),
  canonicalState: { entities: [{ id: 'a', kind: 'INFRASTRUCTURE', hostile: false, critical: true }, { id: 'h', kind: 'HOSTILE', hostile: true, critical: false }],
    relationships: [{ from: 'h', to: 'a', kind: 'threatens' }] },
  legalActions: [
    { actionId: 'm-n', actionType: 'MOVE', targetEntityId: null, parameters: { direction: 'NORTH' } },
    { actionId: 'm-e', actionType: 'MOVE', targetEntityId: null, parameters: { direction: 'EAST' } },
    { actionId: 'm-s', actionType: 'MOVE', targetEntityId: null, parameters: { direction: 'SOUTH' } },
    { actionId: 'm-w', actionType: 'MOVE', targetEntityId: null, parameters: { direction: 'WEST' } },
    { actionId: 'r', actionType: 'RETREAT', targetEntityId: null, parameters: { toX: 3, toY: 2 } },
    { actionId: 'p-a', actionType: 'PROTECT', targetEntityId: 'a', parameters: {} },
  ],
  ...overrides,
});

test('1. Stage 3F.6-P is intact', () => {
  assert.equal(json('artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json').certificationHash, '3cd670113c2ffd3ad40e1113b77d492943b226bfcdb1730c3b60a15de679a585');
});

test('2. Stage 3F.6-P.1 is intact', () => {
  assert.equal(json('artifacts/stage3f6p1-nexus-remediation/stage3f6p1-certification-result.json').certificationHash, '48462a169c88337a9f27315c3e10b83f615e077a8ba2dc6751fdf437351d31e4');
  assert.equal(p1Freeze.freezeHash, 'fb649ba894f5f51b1e9acb7523ea23c7b6feb1dbe00673fe6ab147df11550369');
});

test('3. NEXUS V1 is unchanged', () => {
  const file = 'src/lab/stage3c-learned-nexus.js';
  assert.equal(hex(readFileSync(at(file))), headHash(file));
  assert.equal(hex(readFileSync(at(file))), p1Freeze.historicalV1.sourceHash);
  assert.equal(freeze.preserved.NEXUS_SELECTOR_V1.sourceHash, p1Freeze.historicalV1.sourceHash);
});

test('4. NEXUS V2 candidate is unchanged', () => {
  const file = 'src/stage3f/nexus-selector-v2-candidate.js';
  assert.equal(hex(readFileSync(at(file))), headHash(file));
  assert.equal(hex(readFileSync(at(file))), p1Freeze.candidate.sourceHash);
  assert.equal(freeze.preserved.NEXUS_SELECTOR_V2_CANDIDATE.sourceHash, p1Freeze.candidate.sourceHash);
});

test('5. the spatial contract is deterministic and matches the freeze', () => {
  assert.equal(NEXUS_RELATIONAL_SPATIAL_CONTEXT_HASH, freeze.contract.hash);
  assert.equal(hex(readFileSync(at(CONTRACT))), freeze.frozenSources[CONTRACT]);
  assert.equal(NEXUS_SPATIAL_CANDIDATE_FIELDS.length, freeze.contract.candidateFieldCount);
  for (const f of NEXUS_SPATIAL_CANDIDATE_FIELDS) {
    for (const k of ['fieldId', 'semantic', 'source', 'epistemicCategory', 'decisionTime', 'requiredCapability', 'missingSemantics', 'derivation']) assert.ok(k in f, `${f.fieldId}.${k}`);
    assert.equal(f.decisionTime, true);
  }
  for (const row of devRows.slice(0, 300)) {
    assert.equal(JSON.stringify(deriveRelationalSpatialContext(row.decisionInput)), JSON.stringify(deriveRelationalSpatialContext(structuredClone(row.decisionInput))));
  }
});

test('6. no absolute hidden-map dependency', () => {
  assert.equal(/\.(grid|position|cells|world|privilegedDiagnostic)\b/.test(contractCode), false);
  for (const row of devRows.slice(0, 300)) {
    const { accessed, input } = poisoned(row.decisionInput);
    const out = deriveRelationalSpatialContext(input);
    assert.deepEqual(accessed, []);
    assert.equal(JSON.stringify(out), JSON.stringify(deriveRelationalSpatialContext(row.decisionInput)));
    assert.equal(/"(x|y|toX|toY)":/.test(JSON.stringify(out)), false, 'the context exposes relative steps only, never absolute cells');
  }
  assert.ok(NEXUS_SPATIAL_CANDIDATE_FIELDS.filter((f) => f.epistemicCategory === 'PRIVILEGED').every((f) => f.deployable === false));
});

test('7. no future state', () => {
  assert.equal(/\b(nextState|resultingStateHash|futureState|futurePosition)\b/.test(contractCode), false);
});

test('8. no regret access', () => {
  assert.equal(/\.(regret|scalarReward|immediateScalar|optimalScalar)\b/.test(contractCode), false);
});

test('9. no optimal label access', () => {
  assert.equal(/\.(optimalSet|labels|correct)\b|\bbuildTarget\s*\(/.test(contractCode), false);
  for (const row of devRows.slice(0, 200)) { const { accessed, input } = poisoned(row.decisionInput); deriveRelationalSpatialContext(input); assert.deepEqual(accessed, []); }
});

test('10. no simulator, even transitively', () => {
  const seen = new Set(); const walk = (f) => { if (seen.has(f)) return; seen.add(f); for (const m of readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*'(\.[^']+)'/g)) walk(path.resolve(path.dirname(f), m[1])); };
  walk(at(CONTRACT));
  const closure = [...seen].map((f) => path.relative(root, f));
  assert.equal(closure.some((f) => /^src\/(forge|prime|lab)\//.test(f)), false, closure.join(','));
  assert.equal(/\b(step|cloneState|cloneWorld|transition)\s*\(/.test(contractCode), false);
});

test('11. no rollout', () => {
  assert.equal(/\b(rollForwardV2|evaluateCounterfactualsV2|recommend|rollout)\s*\(/.test(contractCode), false);
});

test('12. MOVE direction derivation is deterministic and relative', () => {
  const out = deriveRelationalSpatialContext(synthetic());
  const byDir = Object.fromEntries(out.moves.map((m) => [m.moveDirection, m]));
  assert.deepEqual(out.retreatStep, { dx: 1, dy: 0 });
  assert.equal(byDir.EAST.moveAlignsWithRetreat, true); assert.equal(byDir.EAST.moveOpposesRetreat, false);
  assert.equal(byDir.WEST.moveOpposesRetreat, true); assert.equal(byDir.WEST.moveAlignsWithRetreat, false);
  assert.equal(byDir.NORTH.moveAlignsWithRetreat, false); assert.equal(byDir.NORTH.moveOpposesRetreat, false);
  const reversed = synthetic(); reversed.legalActions = [...reversed.legalActions].reverse();
  assert.equal(JSON.stringify(deriveRelationalSpatialContext(reversed)), JSON.stringify(out));
});

test('13. missing spatial evidence fails closed', () => {
  const noPos = deriveRelationalSpatialContext(synthetic({ observationFeatures: undefined }));
  assert.equal(noPos.actorCellEvidence, Missing.NO_POSITION_EVIDENCE);
  assert.ok(noPos.moves.every((m) => m.moveAlignsWithRetreat === Missing.NO_POSITION_EVIDENCE && m.moveOpposesRetreat === Missing.NO_POSITION_EVIDENCE));
  const zero = deriveRelationalSpatialContext(synthetic({ observationFeatures: features(0, 0), legalActions: synthetic().legalActions.map((a) => (a.actionType === 'RETREAT' ? { ...a, parameters: { toX: 1, toY: 0 } } : a)) }));
  assert.equal(zero.actorCellEvidence, 'OBSERVED', 'UNKNOWN_POSITION != ZERO_POSITION');
  assert.deepEqual(zero.retreatStep, { dx: 1, dy: 0 });
  const nonInteger = deriveRelationalSpatialContext(synthetic({ observationFeatures: [0, 4, 10, null, '2', 100] }));
  assert.equal(nonInteger.actorCellEvidence, Missing.NO_POSITION_EVIDENCE);
  const noRetreat = deriveRelationalSpatialContext(synthetic({ legalActions: synthetic().legalActions.filter((a) => a.actionType !== 'RETREAT') }));
  assert.ok(noRetreat.moves.every((m) => m.moveAlignsWithRetreat === Missing.UNKNOWN_HOSTILE_GEOMETRY), 'no RETREAT is unknown geometry, not "not away"');
  const farRetreat = deriveRelationalSpatialContext(synthetic({ legalActions: synthetic().legalActions.map((a) => (a.actionType === 'RETREAT' ? { ...a, parameters: { toX: 9, toY: 9 } } : a)) }));
  assert.equal(farRetreat.retreatStep, Missing.UNKNOWN_HOSTILE_GEOMETRY);
  const badDir = deriveRelationalSpatialContext(synthetic({ legalActions: [{ actionId: 'm', actionType: 'MOVE', targetEntityId: null, parameters: { direction: 'UP' } }] }));
  assert.equal(badDir.moves[0].moveDirection, Missing.UNKNOWN_DIRECTION);
  assert.equal(deriveRelationalSpatialContext({}).status, 'UNAVAILABLE');
  const noProtect = deriveRelationalSpatialContext(synthetic({ legalActions: synthetic().legalActions.filter((a) => a.actionType !== 'PROTECT') }));
  assert.equal(noProtect.protectEvidence.adjacentThreatenedEvidence, Missing.NO_ADJACENCY_EVIDENCE, 'UNOBSERVED_RELATION != ABSENT_RELATION');
  assert.equal(deriveRelationalSpatialContext(synthetic({ canonicalState: undefined })).protectEvidence, null);
});

test('14. the candidate cannot copy RESOURCE output', () => {
  assert.equal(existsSync(at('src/stage3f/nexus-selector-v3-spatial-candidate.js')), false, 'no V3 was constructed');
  assert.equal(freeze.decision.candidate.constructed, false);
  assert.equal(/DECLARED_ACTION_COST_MODEL|resourcePreservingProposal|cheapest|zeroCost|\.cost\b/.test(contractCode), false);
  assert.ok(NEXUS_RELATIONAL_SPATIAL_CONTEXT_CONTRACT.forbidden.includes('declared action cost (no cheapest / zero-cost choice)'));
  assert.ok(freeze.rules.advancement.some((r) => /V3-RESOURCE agreement < 0.5/.test(r)));
  const out = deriveRelationalSpatialContext(synthetic());
  assert.equal(/cost|cheap/i.test(JSON.stringify(out)), false);
});

test('15. policy-set oracle comparison is verified', () => {
  const others = ['RESOURCE_PRESERVING_V1', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1'];
  let s1 = 0; let s2 = 0;
  for (const row of devRows) {
    const di = row.decisionInput; const lab = row.labels.actions;
    const nexus = evaluateNexus({ canonicalState: di.canonicalState, legalActions: di.legalActions.map((a) => ({ actionId: a.actionId, targetEntityId: a.targetEntityId })) });
    const sel = nexusRelationalSelector({ branches: di.legalActions.map((a) => ({ actionKey: a.actionId, actionType: a.actionType })) }, nexus);
    const v2 = sel.abstain ? null : nexusSelectorV2Candidate({ canonicalState: di.canonicalState, legalActions: di.legalActions.map(({ actionId, actionType, targetEntityId }) => ({ actionId, actionType, targetEntityId })) });
    const pool = others.map((p) => row.labels.others[p]).filter(Boolean).map((k) => lab[k].r);
    const fallback = lab[row.labels.others.RANDOM_LEGAL_V1].r;
    const o = (extra) => { const all = extra === null ? pool : [...pool, extra]; return all.length ? Math.min(...all) : fallback; };
    s1 += o(sel.abstain ? null : lab[K(sel.actionId)].r);
    s2 += o(v2 === null ? null : lab[K(v2.action.actionId)].r);
  }
  assert.equal(s1 / devRows.length, freeze.analysis.policies.V1.oracleWith.meanRegret);
  assert.equal(s2 / devRows.length, freeze.analysis.policies.V2.oracleWith.meanRegret);
  assert.ok(freeze.analysis.policies.V2.oracleWith.meanRegret > freeze.analysis.policies.V1.oracleWith.meanRegret);
});

test('16. the stage remains R0', () => {
  assert.deepEqual({ ...NEXUS_RELATIONAL_SPATIAL_CONTEXT_CONTRACT.authority }, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
  assert.match(certifierCode, /tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false/);
});

test('17. no online learning', () => {
  assert.equal(/onlineLearningEnabled:\s*true/.test(certifierCode + contractCode), false);
  assert.equal(/^let\s|^var\s/m.test(contractCode), false, 'the contract holds no mutable module state');
  assert.match(certifierCode, /READY_FOR_STAGE3G: false/);
});

test('18. CAL stays sealed because DEV did not authorize it', () => {
  assert.equal(freeze.decision.calGate.CAL_EVALUATION_AUTHORIZED, false);
  assert.equal(existsSync(at(`${OUT}/spatial-evidence-cal.jsonl.gz`)), false);
  assert.equal(existsSync(at(`${OUT}/spatial-evidence-cal-manifest.json`)), false);
  const gate = spawnSync('node', ['scripts/generate-stage3f6p1a-spatial-evidence.mjs', '--partition=CAL'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(gate.status, 0);
  assert.match(gate.stderr, /CAL_SEALED: the DEV freeze does not authorize CAL evaluation/);
  assert.ok(devRows.every((r) => r.partition === 'DEV'));
});
