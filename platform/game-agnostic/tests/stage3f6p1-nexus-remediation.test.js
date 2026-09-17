import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { POLICY_SET, POLICY_SET_HASH } from '../src/stage3f/policy-router-v1.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import {
  NEXUS_SELECTOR_V2_CANDIDATE_ID, NEXUS_V2_CANDIDATE_HASH, NEXUS_V2_REMEDIATION, nexusSelectorV2Candidate, nexusV1RankingEquivalent,
} from '../src/stage3f/nexus-selector-v2-candidate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (r) => path.join(root, r);
const text = (r) => readFileSync(at(r), 'utf8');
const json = (r) => JSON.parse(text(r));
const hex = (v) => createHash('sha256').update(v).digest('hex');
const gz = (r) => gunzipSync(readFileSync(at(r))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const OUT = 'artifacts/stage3f6p1-nexus-remediation';
const CANDIDATE = 'src/stage3f/nexus-selector-v2-candidate.js';
const V1_SOURCE = 'src/lab/stage3c-learned-nexus.js';
const freeze = json(`${OUT}/stage3f6p1-candidate-freeze.json`);
const devRows = gz(`${OUT}/nexus-evidence-dev.jsonl.gz`);
const calRows = gz(`${OUT}/nexus-evidence-cal.jsonl.gz`);
const calManifest = json(`${OUT}/nexus-evidence-cal-manifest.json`);
const candidateCode = text(CANDIDATE).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const certifierCode = text('scripts/certify-stage3f6p1-nexus-remediation.mjs').replace(/\/\*[\s\S]*?\*\//g, '');
const K = (id) => id.slice(0, 16);

function v1(decisionInput) {
  const { canonicalState, legalActions } = decisionInput;
  const nexus = evaluateNexus({ canonicalState, legalActions: legalActions.map((e) => ({ actionId: e.actionId, targetEntityId: e.targetEntityId })) });
  const sel = nexusRelationalSelector({ branches: legalActions.map((e) => ({ actionKey: e.actionId, actionType: e.actionType })) }, nexus);
  return sel.abstain ? null : sel.actionId;
}
const POISON = ['optimalSet', 'regret', 'labels', 'outcome', 'nextState', 'scalarReward', 'branches', 'correct', 'futureState', 'resultingStateHash'];
function poisoned(decisionInput) {
  const accessed = [];
  const trap = (o) => { for (const k of POISON) Object.defineProperty(o, k, { enumerable: true, get() { accessed.push(k); throw new Error(`LEAK:${k}`); } }); return o; };
  return { accessed, input: trap({ canonicalState: decisionInput.canonicalState, legalActions: decisionInput.legalActions.map((a) => trap({ ...a })) }) };
}
function importClosure(entry) {
  const seen = new Set();
  const walk = (f) => { if (seen.has(f)) return; seen.add(f); for (const m of readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*'(\.[^']+)'/g)) walk(path.resolve(path.dirname(f), m[1])); };
  walk(at(entry));
  return [...seen].map((f) => path.relative(root, f));
}

/* synthetic threat-driven world: hostile h threatens infrastructure a (unsupported) */
const world = {
  canonicalState: {
    entities: [{ id: 'a', kind: 'INFRASTRUCTURE', hostile: false, critical: false }, { id: 'actor', kind: 'ACTOR', hostile: false, critical: false },
      { id: 'b', kind: 'RESOURCE', hostile: false, critical: false }, { id: 'c', kind: 'POWER_SOURCE', hostile: false, critical: false },
      { id: 'h', kind: 'HOSTILE', hostile: true, critical: false }],
    relationships: [{ from: 'a', to: 'c', kind: 'depends' }, { from: 'b', to: 'c', kind: 'depends' }, { from: 'h', to: 'a', kind: 'threatens' }],
  },
  legalActions: [
    { actionId: '1111', actionType: 'PROTECT', targetEntityId: 'b' },
    { actionId: '2222', actionType: 'PROTECT', targetEntityId: 'a' },
    { actionId: '3333', actionType: 'MOVE', targetEntityId: null },
    { actionId: '4444', actionType: 'WAIT', targetEntityId: null },
  ],
};

test('1. NEXUS V1 is byte-identical and still reproduces its certified choices', () => {
  const head = spawnSync('git', ['-C', path.resolve(root, '..', '..'), 'show', `HEAD:platform/game-agnostic/${V1_SOURCE}`], { encoding: 'buffer' });
  assert.equal(head.status, 0);
  assert.equal(hex(readFileSync(at(V1_SOURCE))), hex(head.stdout));
  assert.equal(hex(readFileSync(at(V1_SOURCE))), freeze.historicalV1.sourceHash);
  assert.equal(freeze.devEvidence.v1FidelityMismatches, 0);
  assert.equal(calManifest.v1FidelityMismatches, 0);
});

test('2. predecessor certificates are intact', () => {
  const expected = {
    'artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json': '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca',
    'artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json': '5d6910dd39405ee9f9fc2868f1309ff84998d30f7128e7a60b36644ca9056582',
    'artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json': '7c5db9fbdd1d02bbee76ee12a0a5bf8a6e98c5a53adb510b0ed7e57ebd295fb6',
    'artifacts/stage3f6d-decision-rule/stage3f6d-certification-result.json': 'f262c3477631a92007e1a40d4ba85bc03874fab6c1a68e78013378de2b909f3b',
    'artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json': '3cd670113c2ffd3ad40e1113b77d492943b226bfcdb1730c3b60a15de679a585',
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(json(file).certificationHash, hash, file);
});

test('3. the candidate is deterministic', () => {
  for (const row of calRows.slice(0, 300)) {
    assert.equal(JSON.stringify(nexusSelectorV2Candidate(row.decisionInput)), JSON.stringify(nexusSelectorV2Candidate(structuredClone(row.decisionInput))));
  }
  assert.equal(freeze.candidate.candidateHash, NEXUS_V2_CANDIDATE_HASH);
  assert.equal(freeze.candidate.sourceHash, hex(readFileSync(at(CANDIDATE))));
});

test('4. no outcome access', () => {
  assert.equal(/\b(nextState|resultingStateHash|futureOutcome|terminalOutcome)\b|\.outcome\b/.test(candidateCode), false);
  for (const row of calRows.slice(0, 200)) {
    const { accessed, input } = poisoned(row.decisionInput);
    nexusSelectorV2Candidate(input);
    assert.equal(accessed.filter((k) => ['outcome'].includes(k)).length, 0);
  }
});

test('5. no regret access', () => {
  assert.equal(/\.(regret|scalarReward|immediateScalar|optimalScalar)\b|\bregret\s*[[(]/.test(candidateCode), false);
  for (const row of calRows.slice(0, 200)) {
    const { accessed, input } = poisoned(row.decisionInput);
    nexusSelectorV2Candidate(input);
    assert.equal(accessed.filter((k) => ['regret', 'scalarReward'].includes(k)).length, 0);
  }
});

test('6. no optimalSet access', () => {
  assert.equal(/\.(optimalSet|labels|correct)\b|\bbuildTarget\s*\(/.test(candidateCode), false);
  for (const row of calRows.slice(0, 200)) {
    const { accessed, input } = poisoned(row.decisionInput);
    const out = nexusSelectorV2Candidate(input);
    assert.deepEqual(accessed, []);
    assert.equal(JSON.stringify(out), JSON.stringify(nexusSelectorV2Candidate(row.decisionInput)));
  }
});

test('7. no rollout', () => {
  assert.equal(/\b(rollForwardV2|evaluateCounterfactualsV2|recommend|rollout)\s*\(/.test(candidateCode), false);
  assert.equal(NEXUS_V2_REMEDIATION.prohibited.includes('rollout'), true);
});

test('8. no simulator, even transitively', () => {
  const closure = importClosure(CANDIDATE);
  assert.equal(closure.some((f) => /^src\/(forge|prime|lab)\//.test(f)), false, closure.join(','));
  assert.equal(/\b(step|cloneState|cloneWorld|transition)\s*\(/.test(candidateCode), false);
});

test('9. no future state: decision inputs carry only the observed relational state and the legal surface', () => {
  for (const row of [...devRows.slice(0, 500), ...calRows.slice(0, 500)]) {
    assert.deepEqual(Object.keys(row.decisionInput).sort(), ['canonicalState', 'legalActions']);
    assert.ok(Object.keys(row.decisionInput.canonicalState).every((k) => ['entities', 'relationships'].includes(k)));
    assert.ok(row.decisionInput.legalActions.every((a) => Object.keys(a).every((k) => ['actionId', 'actionType', 'targetEntityId'].includes(k))));
  }
});

test('10. policy-set owners other than NEXUS are unchanged', () => {
  const a = json('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json');
  const src = 'src/stage3f/deployable-action-proposal-v1.js';
  assert.equal(hex(readFileSync(at(src))), a.sourceHashes[src]);
  assert.equal(POLICY_SET_HASH, json('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json').policySet.hash);
});

test('11. target mapping is deterministic and follows observed threat', () => {
  assert.equal(nexusSelectorV2Candidate(world).action.targetEntityId, 'a');
  assert.equal(nexusSelectorV2Candidate({ ...world, legalActions: [...world.legalActions].reverse() }).action.targetEntityId, 'a');
  assert.equal(v1(world), '1111', 'V1 protects the unthreatened entity first by action identity');
  for (const row of calRows.slice(0, 200)) {
    const shuffled = { ...row.decisionInput, legalActions: [...row.decisionInput.legalActions].reverse() };
    assert.equal(nexusSelectorV2Candidate(shuffled).action?.actionId ?? null, nexusSelectorV2Candidate(row.decisionInput).action?.actionId ?? null);
  }
});

test('12. action-type mapping is deterministic: unthreatened PROTECT is inadmissible, everything else is V1', () => {
  const noThreatenedTarget = { ...world, legalActions: world.legalActions.filter((a) => a.actionId !== '2222') };
  assert.equal(nexusSelectorV2Candidate(noThreatenedTarget).action.actionType, 'MOVE');
  assert.equal(v1(noThreatenedTarget), '1111');
  for (const row of devRows.slice(0, 1500)) assert.equal(nexusV1RankingEquivalent(row.decisionInput), v1(row.decisionInput));
  assert.equal(freeze.candidate.gateDisabledEquivalenceMismatchesOnDev, 0);
});

test('13. V1/V2 DEV metrics reproduce the freeze', () => {
  let n = 0; let o1 = 0; let o2 = 0; let r1 = 0; let r2 = 0;
  for (const row of devRows) {
    const a1 = v1(row.decisionInput); if (a1 === null) continue;
    const a2 = nexusSelectorV2Candidate(row.decisionInput).action.actionId;
    n += 1; o1 += row.labels.actions[K(a1)].o; o2 += row.labels.actions[K(a2)].o; r1 += row.labels.actions[K(a1)].r; r2 += row.labels.actions[K(a2)].r;
  }
  const d = freeze.devComparison;
  assert.equal(n, d.nexusProposingN);
  assert.equal(o1 / n, d.V1.accuracy); assert.equal(o2 / n, d.V2.accuracy);
  assert.equal(r1 / n, d.V1.meanRegret); assert.equal(r2 / n, d.V2.meanRegret);
});

test('14. the candidate is not promoted', () => {
  const out = nexusSelectorV2Candidate(world);
  assert.equal(out.producerId, NEXUS_SELECTOR_V2_CANDIDATE_ID);
  assert.equal(out.candidateOnly, true); assert.equal(out.promotedToLiveRuntime, false); assert.equal(out.decisionTime, true);
  assert.deepEqual([...POLICY_SET.routedPolicies], ['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1']);
  const grep = spawnSync('grep', ['-rl', 'nexus-selector-v2-candidate', 'src'], { cwd: root, encoding: 'utf8' });
  assert.equal(grep.stdout.trim(), '', 'no runtime source imports the candidate');
});

test('15. authority stays R0', () => {
  assert.deepEqual({ ...NEXUS_V2_REMEDIATION.authority }, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, promotedToLiveRuntime: false, candidateOnly: true });
  assert.match(certifierCode, /tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false/);
});

test('16. no online learning', () => {
  assert.equal(/onlineLearningEnabled:\s*true/.test(certifierCode + candidateCode), false);
  assert.equal(/^let\s|^var\s/m.test(candidateCode), false, 'the candidate holds no mutable module state');
  assert.match(certifierCode, /READY_FOR_STAGE3G: false/);
});

test('17. CAL stayed sealed until the candidate freeze', () => {
  assert.equal(calManifest.candidateFreezeBinding.freezeHash, freeze.freezeHash);
  assert.equal(calManifest.candidateFreezeBinding.candidateSourceHash, freeze.candidate.sourceHash);
  assert.match(text('scripts/generate-stage3f6p1-nexus-evidence.mjs'), /CAL_SEALED: the candidate freeze does not exist yet/);
  assert.equal(JSON.stringify(freeze).includes(calManifest.contentHash), false);
  assert.ok(calRows.every((r) => r.partition === 'CAL') && devRows.every((r) => r.partition === 'DEV'));
});
