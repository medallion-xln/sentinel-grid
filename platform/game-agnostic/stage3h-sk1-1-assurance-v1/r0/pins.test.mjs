// SK1.1 Phase 6 — source pinning, evaluator-free import closure and their negative controls (clean-checkout runnable).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRecommendationApi } from '../../stage3h-sk1-safety-kernel-v1/api/recommend.mjs';
import { sha256 } from '../../stage3h-sk1-safety-kernel-v1/kernel/contract.mjs';
import { createAssuredApi, verifySourcePins, verifyInnerIdentity, PINS, SK1_LANE, REQUIRED_AUTHORITY } from './assured-api.mjs';
import { fixture, clone, rejects, serve } from './test-helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), freezeBytes = readFileSync(resolve(SK1_LANE, PINS.freezeRecord)), FREEZE = JSON.parse(freezeBytes.toString('utf8'));
const dirHash = (dir, hashes) => sha256(Object.keys(hashes).filter((f) => dirname(f) === dir && f.endsWith('.mjs')).sort().map((f) => `${f}:${hashes[f]}`).join('\n')); // the rule in the frozen api/host.mjs
const tmp = () => mkdtempSync(join(tmpdir(), 'sk1-1-r0-'));

test('[P6-PIN] every pinned literal equals the identity frozen in SK1_EXPERIMENT_FREEZE.json', () => {
  assert.equal(sha256(freezeBytes), PINS.freezeSha256);
  const inference = Object.keys(FREEZE.codeHashes).filter((f) => /^(kernel|adapters|api)\//.test(f) && f.endsWith('.mjs')).sort();
  assert.deepEqual(Object.keys(PINS.files).sort(), inference, 'the pins cover exactly the frozen inference files');
  assert.equal(inference.length, 12);
  for (const f of inference) assert.equal(PINS.files[f], FREEZE.codeHashes[f], f);
  assert.deepEqual({ file: PINS.model.file, sha256: PINS.model.sha256, modelHash: PINS.model.modelHash, ranking: { ...PINS.model.ranking } }, FREEZE.models.SK1);
  assert.equal(PINS.kernelSourceHash, dirHash('kernel', FREEZE.codeHashes)); assert.equal(PINS.adapterSourceHash.forge, dirHash('adapters/forge', FREEZE.codeHashes)); assert.equal(PINS.adapterSourceHash.rescue, dirHash('adapters/rescue', FREEZE.codeHashes));
});
test('[P6-PIN] the pins agree with the committed SK1 result and demo records', () => {
  const result = readFileSync(resolve(SK1_LANE, 'SK1_RESULT.md'), 'utf8'), demo = JSON.parse(readFileSync(resolve(SK1_LANE, 'evidence/SK1_DEMO_RECORD.json'), 'utf8'));
  assert.ok(result.includes(`SAFETY_KERNEL_SOURCE_HASH=${PINS.kernelSourceHash}`)); assert.ok(result.includes(PINS.model.modelHash)); assert.ok(result.includes('tierWidth 0.1, tau 0.2'));
  for (const d of demo.decisions) { assert.equal(d.kernelSourceHash, PINS.kernelSourceHash); assert.equal(d.adapterSourceHash, PINS.adapterSourceHash.forge); assert.equal(d.modelHash, PINS.model.modelHash); assert.equal(d.qualification, 'NOT_QUALIFIED'); }
});
test('[P6-PIN] the files on disk match the pins and the loaded inner API reports the pinned identity', () => {
  assert.deepEqual(verifySourcePins({ game: 'forge' }).filesVerified, 12); assert.equal(verifySourcePins({ game: 'rescue' }).model, null);
  const p = createAssuredApi({ game: 'forge' }).describe().pins;
  assert.deepEqual(p, { freezeRecord: PINS.freezeRecord, freezeSha256: PINS.freezeSha256, inferenceFilesVerified: 12, kernelSourceHash: PINS.kernelSourceHash, adapterSourceHash: PINS.adapterSourceHash.forge, modelSha256: PINS.model.sha256, modelHash: PINS.model.modelHash, verifiedAt: 'API_CONSTRUCTION' });
});
test('[P6-NC] negative control — tampered pin: one changed literal and the envelope refuses to serve', () => {
  const one = { ...PINS, files: { ...PINS.files, 'kernel/ranking.mjs': '0'.repeat(64) } }; rejects(() => verifySourcePins({ game: 'forge', pins: one }), 'SOURCE_PIN_MISMATCH');
  rejects(() => verifySourcePins({ game: 'forge', pins: { ...PINS, model: { ...PINS.model, sha256: '0'.repeat(64) } } }), 'MODEL_PIN_MISMATCH');
  rejects(() => verifySourcePins({ game: 'forge', pins: { ...PINS, model: { ...PINS.model, ranking: { ...PINS.model.ranking, tau: 0.5 } } } }), 'MODEL_PIN_MISMATCH');
  rejects(() => verifySourcePins({ game: 'forge', pins: { ...PINS, model: { ...PINS.model, qualification: 'QUALIFIED' } } }), 'QUALIFICATION_LABEL_MISMATCH');
});
test('[P6-NC] negative control — tampered source: a one-byte change in a copied kernel file is refused', () => {
  const dir = tmp();
  try {
    for (const f of [...Object.keys(PINS.files), PINS.model.file]) { mkdirSync(dirname(resolve(dir, f)), { recursive: true }); writeFileSync(resolve(dir, f), readFileSync(resolve(SK1_LANE, f))); }
    assert.equal(verifySourcePins({ lane: dir, game: 'forge' }).filesVerified, 12, 'a faithful copy verifies');
    writeFileSync(resolve(dir, 'kernel/ranking.mjs'), readFileSync(resolve(SK1_LANE, 'kernel/ranking.mjs'), 'utf8').replace('best.upper > cfg.tau', 'best.upper > 1'));
    rejects(() => verifySourcePins({ lane: dir, game: 'forge' }), 'SOURCE_PIN_MISMATCH');
    rmSync(resolve(dir, 'api/host.mjs')); rejects(() => verifySourcePins({ lane: dir, game: 'forge' }), 'SOURCE_PIN_MISMATCH');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('[P6-NC] FINDING F6: the frozen loader accepts any self-consistent model, including a relabelled one; the envelope serves the pinned bytes or nothing', () => {
  const dir = tmp();
  try {
    const { modelHash, ...rest } = JSON.parse(readFileSync(resolve(SK1_LANE, PINS.model.file), 'utf8'));
    rest.qualification = { status: 'QUALIFIED', statement: 'tampered label' }; rest.ranking = { ...rest.ranking, tau: 1 }; // relabel and disable the abstention criterion
    const forged = resolve(dir, 'forged-model.json'); writeFileSync(forged, JSON.stringify({ ...rest, modelHash: sha256(JSON.stringify(rest)) }));
    const frozen = createRecommendationApi({ game: 'forge', modelPath: forged }), rq = fixture('abstain'), rec = frozen.recommend(rq.state, rq.legalActions, rq.advisoryEvidence);
    assert.equal(rec.safetyAssessment.qualification.status, 'QUALIFIED', 'frozen behaviour, recorded not patched: the label is whatever the model file says');
    assert.equal(rec.recommendedActionOrAbstention.kind, 'RECOMMEND', 'and the forged criterion turns a frozen abstention into a recommendation');
    rejects(() => createAssuredApi({ game: 'forge', modelPath: forged }), 'MODEL_PIN_MISMATCH');
    const copy = resolve(dir, 'copy.json'); writeFileSync(copy, readFileSync(resolve(SK1_LANE, PINS.model.file)));
    assert.equal(serve(createAssuredApi({ game: 'forge', modelPath: copy }), rq).decisionHash, serve(createAssuredApi({ game: 'forge' }), rq).decisionHash, 'a byte-identical copy is the same model');
    rejects(() => createAssuredApi({ game: 'rescue', modelPath: copy }), 'MODEL_NOT_SUPPORTED_FOR_ADAPTER');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('[P6-NC] negative control — the identity reported by the loaded API is checked as well', () => {
  const d = () => clone(createRecommendationApi({ game: 'forge' }).describe());
  assert.doesNotThrow(() => verifyInnerIdentity(d(), 'forge'));
  let x = d(); x.sourceIdentity.kernelSourceHash = '0'.repeat(64); rejects(() => verifyInnerIdentity(x, 'forge'), 'SOURCE_PIN_MISMATCH');
  x = d(); x.sourceIdentity.adapterSourceHash = '0'.repeat(64); rejects(() => verifyInnerIdentity(x, 'forge'), 'SOURCE_PIN_MISMATCH');
  x = d(); x.model.modelHash = '0'.repeat(64); rejects(() => verifyInnerIdentity(x, 'forge'), 'MODEL_PIN_MISMATCH');
  x = d(); x.model.qualification.status = 'QUALIFIED'; rejects(() => verifyInnerIdentity(x, 'forge'), 'QUALIFICATION_LABEL_MISMATCH');
  x = d(); x.authority.canDispatch = true; rejects(() => verifyInnerIdentity(x, 'forge'), 'AUTHORITY_LABEL_MISMATCH');
  x = d(); x.apiVersion = 'SK1_R0_API_V2'; rejects(() => verifyInnerIdentity(x, 'forge'), 'INNER_API_VERSION_MISMATCH');
  x = d(); x.sourceIdentity.kernelVersion = '2.0.0'; rejects(() => verifyInnerIdentity(x, 'forge'), 'KERNEL_VERSION_MISMATCH');
  rejects(() => verifyInnerIdentity(d(), 'rescue'), 'SOURCE_PIN_MISMATCH'); assert.deepEqual(d().authority, { ...REQUIRED_AUTHORITY });
});
test('[P6-PIN] the envelope is evaluator-free: its import closure is itself plus the twelve pinned inference files', () => {
  const GA = resolve(SK1_LANE, '..'), seen = new Map(), builtins = new Set();
  const walk = (abs) => { if (seen.has(abs)) return; assert.ok(existsSync(abs), abs); const src = readFileSync(abs, 'utf8'); seen.set(abs, src);
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g)) { const s = m[1]; if (s.startsWith('node:')) builtins.add(s); else { assert.ok(s.startsWith('.'), `bare import ${s}`); walk(resolve(dirname(abs), s)); } } };
  walk(resolve(HERE, 'assured-api.mjs'));
  const files = [...seen.keys()].map((f) => relative(GA, f)).sort();
  assert.deepEqual(files, ['stage3h-sk1-1-assurance-v1/r0/assured-api.mjs', ...Object.keys(PINS.files).map((f) => `stage3h-sk1-safety-kernel-v1/${f}`)].sort());
  assert.ok(files.every((f) => !/\/(infra|analysis|tests|work|evidence|successor|demo)\//.test(f)), 'no evaluator, population, label or tooling module is reachable');
  assert.deepEqual([...builtins].sort(), ['node:crypto', 'node:fs', 'node:path', 'node:url']);
  const own = seen.get(resolve(HERE, 'assured-api.mjs'));
  for (const token of ['writeFileSync', 'appendFile', 'fetch(', 'child_process', 'Math.random', 'Date.now', 'new Date', 'process.env', 'eval(']) assert.ok(!own.includes(token), `envelope source must not contain ${token}`);
});
