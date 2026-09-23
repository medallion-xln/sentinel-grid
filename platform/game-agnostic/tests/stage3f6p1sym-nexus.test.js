import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRIOR_SEEDS, POLICY_SOURCES, SCORERS, STAGE3F6P1SYM_PLAN, STAGE3F6P1SYM_PLAN_HASH, STAGE3F6P1SYM_PLAN_PATH, STAGE3F6P1SYM_POLICIES, STAGE3F6P1SYM_POLICY_HASH,
  STAGE3F6P1SYM_SEED_PLAN, STAGE3F6P1SYM_SEED_PLAN_HASH,
} from '../scripts/stage3f6p1sym-analysis-plan.mjs';
import { FRESH_PARTITIONS, OPEN_REPORT_PATH, combinationsFor, freshGate, readPriorLineage, seedAudit } from '../scripts/generate-stage3f6p1sym-confirmatory.mjs';
import { nexusEvidence } from '../scripts/stage3f6p1sym-evidence.mjs';
import { readCorpus } from '../scripts/generate-stage3f6p1e-policy-evidence.mjs';
import { NEXUS_V2_CANDIDATE_HASH } from '../src/stage3f/nexus-selector-v2-candidate.js';
import { CANDIDATE_SCHEMA, CANDIDATE_SCHEMA_HASH, DEPLOYABLE_BLOCKS, ENTITY_KINDS, claimVerdict, deployableCandidateBlocks, nexusClassification } from '../src/stage3f/nexus-requalification-v1.js';
import { sha256 } from '../src/core/determinism.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (r) => path.join(root, r);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const json = (r) => JSON.parse(readFileSync(at(r), 'utf8'));
const corpus = readCorpus();
const dev = corpus.filter((r) => r.partition === 'DEV');

test('1. plan, seed-plan, policy and candidate-schema hashes are deterministic and bound to the frozen plan file', () => {
  assert.equal(sha256(STAGE3F6P1SYM_PLAN), STAGE3F6P1SYM_PLAN_HASH);
  assert.equal(sha256(STAGE3F6P1SYM_SEED_PLAN), STAGE3F6P1SYM_SEED_PLAN_HASH);
  assert.equal(sha256(STAGE3F6P1SYM_POLICIES), STAGE3F6P1SYM_POLICY_HASH);
  assert.equal(sha256(CANDIDATE_SCHEMA), CANDIDATE_SCHEMA_HASH);
  const f = json(STAGE3F6P1SYM_PLAN_PATH);
  assert.equal(f.planHash, STAGE3F6P1SYM_PLAN_HASH); assert.equal(f.seedPlanHash, STAGE3F6P1SYM_SEED_PLAN_HASH); assert.equal(f.policyHash, STAGE3F6P1SYM_POLICY_HASH);
  assert.equal(f.candidateSchemaHash, CANDIDATE_SCHEMA_HASH);
});

test('2. the new sealed seed space is disjoint from every prior seed, from itself and from every prior row', () => {
  for (const s of [2001, 2011, 2021, 2022, 2023, 2031, 2032, 2033, 1, 11, 611, 1011]) assert.ok(PRIOR_SEEDS.includes(s), `prior seed ${s} enumerated`);
  const { rows, sources } = readPriorLineage();
  assert.deepEqual(sources.map((s) => [s.name, s.rows]), [['P.1D', 20000], ['T-SYM', 12000], ['P.1A-SYM', 12000]]);
  const a = seedAudit(rows);
  assert.deepEqual(a.overlapWithPriorSeeds, []); assert.deepEqual(a.usedByPriorRows, []); assert.deepEqual(a.holdoutOodOverlap, []); assert.equal(a.duplicates, 0);
});

test('3. canonical combination order uses only declared seeds and the declared levels', () => {
  for (const [, source] of Object.entries(FRESH_PARTITIONS)) {
    const c = combinationsFor(source);
    assert.ok(c.every((x) => STAGE3F6P1SYM_SEED_PLAN.declared[source].includes(x.seed) && STAGE3F6P1SYM_SEED_PLAN.levels[source].includes(x.level)));
    assert.equal(c[0].seed, STAGE3F6P1SYM_SEED_PLAN.declared[source][0]);
  }
});

test('4. policy definitions are hash-bound; V2 is byte-identical to the historically certified candidate', () => {
  for (const f of POLICY_SOURCES) assert.equal(hex(readFileSync(at(f))), STAGE3F6P1SYM_POLICIES.sourceSha256[f], f);
  assert.equal(NEXUS_V2_CANDIDATE_HASH, STAGE3F6P1SYM_POLICIES.remediated.historicalCandidateHash);
  assert.equal(STAGE3F6P1SYM_POLICIES.sourceSha256['src/stage3f/nexus-selector-v2-candidate.js'], STAGE3F6P1SYM_POLICIES.remediated.historicalSourceHash);
});

test('5. the open-phase report is plan-bound, DEV/CAL only, and the fresh gate opens only on committed files', () => {
  const o = json(OPEN_REPORT_PATH);
  assert.equal(o.planHash, STAGE3F6P1SYM_PLAN_HASH); assert.deepEqual(o.partitions, ['DEV', 'CAL']); assert.equal(o.noSealedRowScored, true); assert.equal(o.fitDeterministic, true);
  const { reportHash, ...body } = o; assert.equal(hex(JSON.stringify(body)), reportHash);
  assert.deepEqual(freshGate(), []);
});

test('6. evidence replays deterministically and reproduces the stored choices; features are D4-equivariant on twins', () => {
  const r = dev.find((x) => x.equivariance !== null);
  const a = nexusEvidence(r); const b = nexusEvidence(r);
  assert.deepEqual(a, b);
  for (const k of ['world', 'surface', 'choices', 'candidateSet']) assert.equal(a.fidelity[k], 1, k);
  for (const t of Object.values(a.twinFeatures)) { assert.equal(t.depEqual, 1); assert.equal(t.privEqual, 1); assert.equal(t.reasonSame, 1); }
});

test('7. candidate-order shuffle never changes a Nexus choice', () => {
  for (const r of dev.slice(0, 25)) {
    const e = nexusEvidence(r);
    assert.equal(e.shuffleChoices.NEXUS_SELECTOR_V1, r.policies.NEXUS_SELECTOR_V1);
    assert.equal(e.shuffleChoices.NEXUS_SELECTOR_V2_CANDIDATE, r.policies.NEXUS_SELECTOR_V2_CANDIDATE);
  }
});

const synthetic = () => ({
  observation: { features: {}, metadata: { canonicalState: {
    entities: [{ id: 'actor', kind: 'ACTOR', hostile: false, critical: false }, { id: 'h', kind: 'HOSTILE', hostile: true, critical: false },
      { id: 'c', kind: 'CIVILIAN', hostile: false, critical: true }, { id: 'r', kind: 'RESOURCE', hostile: false, critical: false }],
    relationships: [{ from: 'h', to: 'c', kind: 'threatens' }] } } },
  legalActions: [{ actionId: 'x9', actionType: 'PROTECT', targetEntityId: 'c', parameters: {} }, { actionId: 'x1', actionType: 'PROTECT', targetEntityId: 'r', parameters: {} },
    { actionId: 'x5', actionType: 'WAIT', targetEntityId: null, parameters: {} }],
});

test('8. target features read the observed relational state; identities and list order never matter', () => {
  const s = synthetic();
  const f = deployableCandidateBlocks(s, (a) => a.actionId, 'THREAT_DRIVEN_PREFERENCE');
  const kindIndex = (k) => 1 + ENTITY_KINDS.indexOf(k);
  const threatened = f.get('x9'); const unthreatened = f.get('x1');
  assert.equal(threatened.TARGET[kindIndex('CIVILIAN')], 1); assert.equal(unthreatened.TARGET[kindIndex('RESOURCE')], 1);
  assert.equal(threatened.TARGET[1 + ENTITY_KINDS.length + 2], 1, 'threatenedBy = 1'); assert.equal(threatened.TARGET[1 + ENTITY_KINDS.length + 5], 1, 'unsupported threatened');
  assert.deepEqual([threatened.NEXUS[1], unthreatened.NEXUS[1]], [1, 0], 'V2 gate admits only the threatened PROTECT');
  assert.equal(f.get('x5').TARGET[0], 0);
  const relabelled = { ...s, legalActions: [...s.legalActions].reverse().map((a, i) => ({ ...a, actionId: `z${i}`, orig: a.actionId })) };
  const g = deployableCandidateBlocks(relabelled, (a) => a.orig, 'THREAT_DRIVEN_PREFERENCE');
  for (const k of ['x9', 'x1', 'x5']) assert.deepEqual(g.get(k), f.get(k));
});

test('9. the deployable scorer and derivation read no privileged or future information', () => {
  assert.deepEqual(SCORERS.NX_DEPLOYABLE.blocks, DEPLOYABLE_BLOCKS);
  assert.ok(DEPLOYABLE_BLOCKS.every((b) => CANDIDATE_SCHEMA.blocks[b].class === 'DEPLOYABLE'));
  assert.ok(SCORERS.NX_RELATIONAL_ONLY.blocks.every((b) => DEPLOYABLE_BLOCKS.includes(b)) && !SCORERS.NX_RELATIONAL_ONLY.blocks.includes('GEOMETRY'));
  for (const [name, spec] of Object.entries(SCORERS)) if (!['NX_DEPLOYABLE', 'NX_RELATIONAL_ONLY'].includes(name)) assert.ok(spec.class.startsWith('DIAGNOSTIC'), name);
  const src = readFileSync(at('src/stage3f/nexus-requalification-v1.js'), 'utf8');
  const derivation = src.split('export function deployableCandidateBlocks')[1].split('export function privilegedCandidateBlocks')[0];
  assert.ok(!/world|\.position|entities\.find|immediateScalar|regret|orientation/.test(derivation));
});

test('10. claim verdicts and the Nexus classification follow the predeclared decision lists (mutation-sensitive)', () => {
  assert.equal(claimVerdict({ survives: true }), 'SURVIVES'); assert.equal(claimVerdict({ survives: false, partial: true }), 'PARTIALLY_SURVIVES');
  assert.equal(claimVerdict({ survives: false }), 'INVALIDATED'); assert.equal(claimVerdict({ testable: false, survives: true }), 'NOT_RETESTABLE');
  const base = { proposingN: 5000, nuisanceDependence: false, genuineRelational: false, representationBlocked: false, policyLogicLimited: false, marginalAccuracyGain: 0.1, accuracyWhenBest: 0.3 };
  assert.equal(nexusClassification(base).primary, 'REDESIGN_CANDIDATE');
  assert.equal(nexusClassification({ ...base, accuracyWhenBest: 0.7 }).primary, 'WEAK_BUT_DISTINCT');
  assert.equal(nexusClassification({ ...base, marginalAccuracyGain: 0.01 }).primary, 'REDUNDANT');
  assert.equal(nexusClassification({ ...base, representationBlocked: true, policyLogicLimited: true }).primary, 'REPRESENTATION_BLOCKED');
  assert.ok(nexusClassification({ ...base, representationBlocked: true, policyLogicLimited: true }).labels.includes('POLICY_LOGIC_LIMITED'));
  assert.equal(nexusClassification({ ...base, nuisanceDependence: true, genuineRelational: true }).primary, 'SHORTCUT_DEPENDENT');
  assert.equal(nexusClassification({ ...base, proposingN: 10 }).primary, 'INSUFFICIENT_EVIDENCE');
});

test('11. no hidden temporary paths, no larger model, R0 intact', () => {
  for (const f of ['scripts/stage3f6p1sym-analysis-plan.mjs', 'scripts/generate-stage3f6p1sym-confirmatory.mjs', 'scripts/stage3f6p1sym-evidence.mjs',
    'scripts/certify-stage3f6p1sym-nexus.mjs', 'src/stage3f/nexus-requalification-v1.js']) {
    const s = readFileSync(at(f), 'utf8');
    assert.ok(!/\/tmp\/|\/private\/|tmpdir\(|scratchpad/.test(s), f);
    assert.ok(!/from '[^']*(jepa|neural|tensorflow|onnx|world-model)/i.test(s), f);
  }
  assert.deepEqual(STAGE3F6P1SYM_PLAN.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
});
