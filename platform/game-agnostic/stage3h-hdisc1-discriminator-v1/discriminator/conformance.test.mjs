// H-DISC-1 conformance tests. Run: node --test discriminator/*.test.mjs
// (1) the inference-side contract module behaves exactly as the H-DISC-0 contract reference;
// (2) the derived Forge base returns exactly what the frozen SK1 featuriser returns;
// (3) the structural interaction check agrees with the matched-ablation contract's.
// Public fixtures and synthetic inputs. Public projections of local class records are used when present (no label is read).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as NEW from './contract.mjs';
import * as REF from '../../stage3h-hdisc0-design-v1/contract/pairwise-contract.mjs';
import { makeForgeFeaturizer as derived } from './forge-base/features.mjs';
import { makeForgeFeaturizer as frozen } from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/features.mjs';
import * as DK from './forge-base/projection-keys.mjs';
import * as FK from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/projection.mjs';
import { makeForgeEncoder, PROVISIONAL_VOCABULARY } from './forge-encoder.mjs';
import { assertEncoding } from './encoder.mjs';
import { hasCrossActionInteraction, layoutOf } from './pair-model.mjs';
import * as AC from '../protocol/ablation-contract.mjs';
import { pairTableWitness, additiveInPairFamily, additiveScoreWitness, relationWitness } from '../witness/nonadditivity.mjs';
import { forgeWitness, T_CYCLE, T_IIA } from '../witness/nonadditivity-gate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), SK1 = resolve(LANE, '../stage3h-sk1-safety-kernel-v1');
const FX = ['forge-request-recommend.json', 'forge-request-abstain.json'].map((f) => JSON.parse(readFileSync(resolve(SK1, 'demo/fixtures', f), 'utf8')));
const LOCAL = existsSync(resolve(SK1, 'work/manifests/SK1_POPULATION_EXPLORATION.json'));
const outcome = (f) => { try { return ['ok', JSON.stringify(f())]; } catch (e) { return ['throw', e.code ?? e.message]; } };

test('the inference contract module carries the H-DISC-0 identities and none of its label code', () => {
  assert.deepEqual(NEW.IDS, REF.IDS); assert.deepEqual(NEW.AUTHORITY, REF.AUTHORITY); assert.deepEqual(NEW.EPISTEMIC, REF.EPISTEMIC); assert.deepEqual(NEW.EVIDENCE, REF.EVIDENCE);
  for (const gone of ['actionLabel', 'pairLabel', 'LABEL_FAMILIES', 'createDiscriminator']) assert.equal(NEW[gone], undefined, gone);
  const src = readFileSync(resolve(HERE, 'contract.mjs'), 'utf8'); assert.ok(!/^\s*import\s/m.test(src)); assert.ok(!/meanNormalisedRegret|introducesVsS0|catastrophicMembers/.test(src));
});

test('ranking, matrix checks, request boundary, evidence and provenance: identical results and identical refusals on a battery', () => {
  const act = (key, extra = {}) => ({ key, type: 'T', descriptor: {}, ...extra }), M = (rows) => rows;
  const matrices = [[[0.5, 0.8, 0.3], [0.2, 0.5, 0.6], [0.7, 0.4, 0.5]], [[0.5, 0.9, 0.1], [0.1, 0.5, 0.9], [0.9, 0.1, 0.5]], [[0.5, 0.5], [0.5, 0.5]], [[0.5, null, 0.7], [null, 0.5, null], [0.3, null, 0.5]], [[0.5]], [[0.5, 0.8], [0.3, 0.5]], [[0.5, 1.2], [-0.2, 0.5]], [[0.4, 0.8], [0.2, 0.5]], [[0.5, null], [0.2, 0.5]]];
  const menus = [(n) => Array.from({ length: n }, (_, i) => act(`k${i}`)), (n) => Array.from({ length: n }, (_, i) => act(`k${i}`, { excluded: i === 0 })), (n) => Array.from({ length: n }, (_, i) => act('same', { signature: `s${n - i}` })), (n) => Array.from({ length: n }, (_, i) => act(`k${i}`, { excluded: true }))];
  let compared = 0; for (const P of matrices) for (const mk of menus) { const a = mk(P.length); assert.deepEqual(outcome(() => NEW.rankMenu(a, M(P))), outcome(() => REF.rankMenu(a, M(P)))); assert.deepEqual(outcome(() => NEW.assertComparisonMatrix(P, P.length)), outcome(() => REF.assertComparisonMatrix(P, P.length))); compared++; }
  const requests = [{ state: { a: 1 } }, { state: { truth: 1 } }, { state: { World_Hash: 1 } }, { execute: true }, { doDispatch: 1 }, { legalActions: [{ key: 'k', type: 'T', id: 3, descriptor: {} }] }, { legalActions: [{ key: 'k', type: 'T', descriptor: { handle: 'x' } }] }, { state: { introducesVsNexus: true } }, { run: 1 }, { state: { nested: { deep: { seed: 4 } } } }];
  for (const r of requests) { assert.deepEqual(outcome(() => NEW.assertPublicRequest(r)), outcome(() => REF.assertPublicRequest(r))); compared++; }
  const ev = { contract: 'SK1_ADVISORY_EVIDENCE_V1', experts: { S0: { kind: 'PUBLIC_SCORE' }, NEXUS: { kind: 'RECOMMENDATION_PROJECTION' } } };
  for (const e of [ev, null, { ...ev, contract: 'X' }, { ...ev, experts: { ...ev.experts, V: { kind: 'PUBLIC_SCORE' } } }, { ...ev, experts: { S0: { kind: 'ORACLE' } } }, [], 'x']) { assert.deepEqual(outcome(() => NEW.assertSupportedEvidence(e)), outcome(() => REF.assertSupportedEvidence(e))); compared++; }
  const H = (c) => c.repeat(64), prov = { discriminatorId: NEW.IDS.discriminator, sourceHash: H('a'), modelHash: H('b'), observationContract: { id: 'X', version: '1' }, labelContract: NEW.IDS.labelContract, trainingPopulationDigest: H('c'), exclusionRegistryHash: H('d'), preregistrationHash: H('e'), qualification: { status: 'NOT_QUALIFIED' } };
  for (const p of [prov, null, { ...prov, modelHash: 'x' }, { ...prov, qualification: { status: 'QUALIFIED' } }, { ...prov, discriminatorId: 'Y' }, (({ sourceHash: _s, ...rest }) => rest)(prov)]) { assert.deepEqual(outcome(() => NEW.assertProvenance(p)), outcome(() => REF.assertProvenance(p))); compared++; }
  assert.ok(compared >= 59);
});

const sameFeaturisation = (state, legalActions, evidence, a, b) => { const x = outcome(() => { const F = a(state, legalActions, evidence); return { rows: F.rows, keys: F.keys, signatures: F.signatures, selectable: F.selectable, constraints: F.constraints, annotations: F.annotations, evidence: F.evidence, schema: F.schema }; }), y = outcome(() => { const F = b(state, legalActions, evidence); return { rows: F.rows, keys: F.keys, signatures: F.signatures, selectable: F.selectable, constraints: F.constraints, annotations: F.annotations, evidence: F.evidence, schema: F.schema }; }); return x[0] === y[0] && x[1] === y[1]; };
test('the derived Forge base is current and returns exactly what the frozen SK1 featuriser returns', () => {
  assert.match(execFileSync(process.execPath, [resolve(LANE, 'audit/derive-forge-base.mjs'), 'verify'], { encoding: 'utf8' }), /HDISC1_FORGE_BASE_VERIFY_PASS/);
  const d = derived(PROVISIONAL_VOCABULARY), f = frozen(PROVISIONAL_VOCABULARY); assert.deepEqual(d.schema, f.schema);
  for (const fx of FX) { assert.ok(sameFeaturisation(fx.state, fx.legalActions, fx.advisoryEvidence, d, f)); assert.ok(sameFeaturisation(fx.state, fx.legalActions, null, d, f)); const P = { ...fx.state.projection, menu: fx.legalActions };
    for (const t of FK.D4_FRAMES) { const a = FK.frameProjection(P, t), b = DK.frameProjection(P, t); assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.deepEqual(DK.keysV2(a), FK.keysV2(a)); assert.deepEqual(DK.canonicalActionKeys(a), FK.canonicalActionKeys(a)); assert.deepEqual(DK.symmetryReport(a), FK.symmetryReport(a)); } }
  // the view extractor and its tracer are in the frozen module and absent from the derived one
  for (const gone of ['projectPublic', 'traceReads', 'READ_PATHS', 'EXCLUDED_FIELDS', 'unallowedReads']) { assert.notEqual(FK[gone], undefined, gone); assert.equal(DK[gone], undefined, gone); }
  assert.deepEqual(Object.keys(DK).sort(), Object.keys(FK).filter((k) => !['projectPublic', 'traceReads', 'READ_PATHS', 'EXCLUDED_FIELDS', 'unallowedReads'].includes(k)).sort());
});

test('on local public projections: identical featurisation, every action supported, encoder invariant under D4, shared context really shared', { skip: LOCAL ? false : 'local SK1 class records (work/) are not present in this checkout' }, async () => {
  const { loadPopulation } = await import('../../stage3h-sk1-safety-kernel-v1/infra/population.mjs'), { forgeRequest } = await import('../../stage3h-sk1-safety-kernel-v1/adapters/forge/features.mjs');
  const classes = loadPopulation('EXPLORATION', 'DEVELOPMENT').classes, d = derived(PROVISIONAL_VOCABULARY), f = frozen(PROVISIONAL_VOCABULARY), enc = makeForgeEncoder(), ci = enc.schema.context.map((nm) => f.schema.names.indexOf(nm)); let actions = 0, frames = 0;
  classes.forEach((c, q) => { const r = forgeRequest(c.projection, c.evidence); assert.ok(sameFeaturisation(r.state, r.legalActions, r.advisoryEvidence, d, f), c.id); // truth is never read: only projection, menu and evidence
    const e = enc(r.state, r.legalActions, r.advisoryEvidence); assertEncoding(e, r.legalActions.length); assert.ok(e.supported.every(Boolean), c.id); actions += e.n;
    const F = f(r.state, r.legalActions, r.advisoryEvidence); for (const j of ci) assert.ok(F.rows.every((row) => row[j] === F.rows[0][j]), `${c.id}:${f.schema.names[j]}`);
    if (q % 10 === 0) { const bySig = (x) => JSON.stringify(x.signatures.map((s, i) => [s, x.descriptors[i]]).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))), ref = bySig(e);
      for (const t of FK.D4_FRAMES) { const Pt = FK.frameProjection(c.projection, t), rq = forgeRequest(Pt, c.evidence), et = enc(rq.state, rq.legalActions, rq.advisoryEvidence); assert.equal(bySig(et), ref, `${c.id}:${t}`); assert.deepEqual(et.context, e.context); frames++;
        for (let i = 0; i < Math.min(3, e.n); i++) for (let j = 0; j < Math.min(3, e.n); j++) if (i !== j) assert.deepEqual(et.relation(i, j), e.relation(i, j), `${c.id}:${t}:relation`); } } });
  assert.equal(classes.length, 1000); assert.equal(actions, 8895); assert.equal(frames, 800);
});

test('the structural interaction check agrees with the matched-ablation contract on every witness', () => {
  const enc = makeForgeEncoder();
  for (const [name, p, expected] of [['cycle', pairTableWitness(T_CYCLE), true], ['third-alternative', pairTableWitness(T_IIA), true], ['additive in the pair family', additiveInPairFamily([0, 1, 2]), false], ['relation', relationWitness(), true], ['forge', forgeWitness(enc), true]]) {
    const L = layoutOf(p), mine = hasCrossActionInteraction(p); assert.equal(mine.crossActionPath, expected, name); assert.equal(AC.hasCrossActionInteraction(p, { d: L.d, r: L.r, k: L.k }), mine.crossActionPath, name); assert.equal(AC.hasPairRelationSplit(p, { d: L.d, r: L.r, k: L.k }), mine.relationSplit, name); }
  assert.equal(hasCrossActionInteraction(additiveScoreWitness([0, 1])).value, false); assert.equal(AC.FAMILIES.pair, 'HDISC_ANTISYMMETRISED_PAIR_TREE_ENSEMBLE_V1'); assert.equal(AC.FAMILIES.additive, 'HDISC_ADDITIVE_POINTWISE_TREE_ENSEMBLE_V1');
  assert.equal(AC.inputWidth(AC.FAMILIES.pair, { d: 4, r: 3, k: 1 }), layoutOf(forgeWitness(enc)).width);
});
