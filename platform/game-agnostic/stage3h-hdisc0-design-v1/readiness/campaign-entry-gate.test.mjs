// Campaign-entry gate and backup acceptance record — tests. Run: node --test readiness/*.test.mjs
// The gate logic is tested on SYNTHETIC facts: a fixture in which all seven conditions hold gives GO, and breaking any
// one of them, in every way the condition can break, gives NO_GO. The real repository is then evaluated read-only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGate, evaluateRepository, coreOf, CONDITIONS, READINESS_FILE, FORBIDDEN_IN_INFERENCE } from './campaign-entry-gate.mjs';
import { composeRecord, validateRecord, recordSelfHash, FOUR_CONDITIONS, RECORD_SCHEMA } from './backup/acceptance-record.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '../../../..');
/** Synthetic facts in which every condition is met. Not a description of any real state. */
const allGood = () => ({
  custody: { listReadable: true, identities: 31, present: 31, matching: 31, tracked: 0, guardManifestIntact: true },
  exclusions: { loaded: true, pinsPresent: true, pinProblems: [], selfcheck: { ok: true, positiveOk: true, negativeTotal: 163, negativePassed: 163 }, equivalence: { available: true, identical: true, probeMismatches: 0 } },
  environment: { issuedManifest: true, manifestBoundByDeclaration: true, verify: { ok: true, problems: [] }, runtimePinned: true, runtimeMatches: true },
  recovery: { recordPresent: true, recordTrackedAndUnmodified: true, validation: { ok: true, problems: [] } },
  protocol: { declared: true, freezeRecordPresent: true, freezeRecordTrackedAndUnmodified: true, status: 'FROZEN', protocolHashMatches: true, protocolTrackedAndUnmodified: true },
  source: { declared: true, closure: { files: 150, trackedModified: [], untrackedOther: [], unresolved: [], protectedNotBundleVerified: [] } },
  inference: { declared: true, implemented: true, audit: { files: 14, evaluatorFree: true, violations: [] } },
});
const [G1, G2, G3, G4, G5, G6, G7] = CONDITIONS;
const only = (gate, id) => { assert.equal(gate.decision, 'NO_GO'); assert.deepEqual(gate.failing, [id]); assert.ok(gate.conditions[id].reasons.length > 0, 'a failing condition states why'); };

test('SYNTHETIC: all seven conditions satisfied gives GO, and GO authorizes nothing', () => {
  const g = evaluateGate(allGood()); assert.equal(g.decision, 'GO'); assert.equal(g.passed, 7); assert.deepEqual(g.failing, []); assert.match(g.statement, /separate owner authorization/);
  assert.deepEqual(Object.keys(g.conditions), [...CONDITIONS]); assert.equal(CONDITIONS.length, 7);
});

const BREAKS = {
  [G1]: [(f) => { f.custody.matching = 30; }, (f) => { f.custody.present = 30; }, (f) => { f.custody.tracked = 1; }, (f) => { f.custody.guardManifestIntact = false; }, (f) => { f.custody.listReadable = false; }, (f) => { f.custody.identities = 0; f.custody.present = 0; f.custody.matching = 0; }, (f) => { delete f.custody; }],
  [G2]: [(f) => { f.exclusions.loaded = false; }, (f) => { f.exclusions.pinsPresent = false; }, (f) => { f.exclusions.pinProblems = ['CHANGED:x']; }, (f) => { f.exclusions.selfcheck.positiveOk = false; }, (f) => { f.exclusions.selfcheck.negativePassed = 162; }, (f) => { f.exclusions.selfcheck.negativeTotal = 0; f.exclusions.selfcheck.negativePassed = 0; }, (f) => { f.exclusions.equivalence = { available: true, identical: false, probeMismatches: 1 }; }, (f) => { f.exclusions.equivalence = {}; }, (f) => { delete f.exclusions; }],
  [G3]: [(f) => { f.environment.issuedManifest = false; }, (f) => { f.environment.manifestBoundByDeclaration = false; }, (f) => { f.environment.verify = { ok: false, problems: ['ENTRY_ALTERED:x'] }; }, (f) => { f.environment.verify = null; }, (f) => { f.environment.runtimePinned = false; }, (f) => { f.environment.runtimeMatches = false; }, (f) => { delete f.environment; }],
  [G4]: [(f) => { f.recovery.recordPresent = false; }, (f) => { f.recovery.recordTrackedAndUnmodified = false; }, (f) => { f.recovery.validation = { ok: false, problems: ['NOT_A_DIFFERENT_DEVICE_RESTORE:REHEARSAL'] }; }, (f) => { f.recovery.validation = null; }, (f) => { delete f.recovery; }],
  [G5]: [(f) => { f.protocol.declared = false; }, (f) => { f.protocol.freezeRecordPresent = false; }, (f) => { f.protocol.freezeRecordTrackedAndUnmodified = false; }, (f) => { f.protocol.status = 'DRAFT'; }, (f) => { f.protocol.status = 'NONE'; }, (f) => { f.protocol.protocolHashMatches = false; }, (f) => { f.protocol.protocolTrackedAndUnmodified = false; }, (f) => { delete f.protocol; }],
  [G6]: [(f) => { f.source.declared = false; }, (f) => { f.source.closure.trackedModified = ['a.mjs']; }, (f) => { f.source.closure.untrackedOther = ['b.mjs']; }, (f) => { f.source.closure.unresolved = ['c.mjs']; }, (f) => { f.source.closure.protectedNotBundleVerified = ['p.mjs']; }, (f) => { f.source.closure.files = 0; }, (f) => { f.source.closure = null; }, (f) => { delete f.source; }],
  [G7]: [(f) => { f.inference.declared = false; }, (f) => { f.inference.implemented = false; f.inference.audit = null; }, (f) => { f.inference.audit.evaluatorFree = false; f.inference.audit.violations = ['EVALUATOR_OR_PRIVILEGED_MODULE:infra/evaluate.mjs']; }, (f) => { f.inference.audit.violations = ['CUSTODY_PROTECTED_MODULE:x']; }, (f) => { f.inference.audit.files = 0; }, (f) => { f.inference.audit = null; }, (f) => { delete f.inference; }],
};
for (const id of CONDITIONS) test(`NEGATIVE CONTROL: ${id} alone forces NO_GO, in every way it can fail (${BREAKS[id].length})`, () => { for (const brk of BREAKS[id]) { const f = allGood(); brk(f); only(evaluateGate(f), id); } });

test('NEGATIVE CONTROL: missing, empty or malformed facts never produce GO', () => {
  for (const f of [undefined, null, {}, { custody: {} }, 'GO', 7]) { const g = evaluateGate(f); assert.equal(g.decision, 'NO_GO'); assert.equal(g.failing.length, 7); }
  const f = allGood(); f.custody.matching = '31'; assert.equal(evaluateGate(f).decision, 'NO_GO', 'a string is not a count');
  const t = allGood(); for (const k of Object.keys(t)) t[k] = true; assert.equal(evaluateGate(t).decision, 'NO_GO', 'conditions cannot be asserted as booleans');
});

test('NOT_APPLICABLE_YET counts as not passed, and a draft protocol is not a frozen one', () => {
  const f = allGood(); f.inference = { declared: true, implemented: false, audit: null }; const g = evaluateGate(f); only(g, G7); assert.ok(g.conditions[G7].reasons.some((r) => r.startsWith('NOT_APPLICABLE_YET')));
  const p = allGood(); p.protocol.status = 'DRAFT'; assert.ok(evaluateGate(p).conditions[G5].reasons.some((r) => r === 'PROTOCOL_STATUS_IS_NOT_FROZEN:DRAFT'));
});

test('equivalence that cannot be re-measured is accepted only together with matching pins', () => {
  const a = allGood(); a.exclusions.equivalence = { available: false, reason: 'clean checkout' }; assert.equal(evaluateGate(a).decision, 'GO');
  const b = allGood(); b.exclusions.equivalence = { available: false }; b.exclusions.pinProblems = ['LOADER_SOURCE_CHANGED:portable-exclusions.mjs']; only(evaluateGate(b), G2);
});

test('the inference audit patterns reject evaluator, training and privileged-data modules', () => {
  const hit = (p) => FORBIDDEN_IN_INFERENCE.some((re) => re.test(p));
  for (const p of ['platform/game-agnostic/stage3h-hw1-dev-v1/hw1-eval.mjs', 'x/infra/evaluate.mjs', 'x/infra/train.mjs', 'x/work/classes/a.json', 'src/forge-symmetric/counterfactual-symmetric-v1.js', 'stage3h-failure-diagnosis-v1/lib.mjs', 'stage3h-hw1-dev-v1/transforms.mjs', 'x/infra/dataset.mjs']) assert.ok(hit(p), p);
  for (const p of ['x/kernel/risk.mjs', 'x/adapters/forge/features.mjs', 'x/api/recommend.mjs', 'stage3h-hw1-dev-v1/public-projection.mjs']) assert.ok(!hit(p), p);
});

// ---------------------------------------------------------------- backup acceptance record
const HEAD = 'a'.repeat(40), restoreOutput = (over = {}) => JSON.stringify({ result: 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET', conditions: Object.fromEntries(FOUR_CONDITIONS.map((c) => [c, true])), restore: { label: 'RESTORE_ON_DIFFERENT_DEVICE', filesChecked: 400, missing: 0, mismatched: 0, refsChecked: 12, refsWrong: 0, fsckOk: true }, ...over }, null, 1);
const record = (over = {}, out = restoreOutput()) => composeRecord({ restoreOutputText: out, head: HEAD, scopeSha256: 'b'.repeat(64), bundleBytes: 123, mediumLabel: 'SYNTHETIC FIXTURE MEDIUM', encryption: 'AES-256_SPARSEBUNDLE', attestedBy: 'Synthetic Fixture Owner', recordedAt: '2026-01-01T00:00:00.000Z', ...over });
const problems = (r, opts) => validateRecord(r, opts).problems;

test('SYNTHETIC: a record composed from a passing different-device restore validates', () => {
  const r = record(); assert.equal(r.schema, RECORD_SCHEMA); assert.deepEqual(problems(r), []); assert.equal(r.recordSha256, recordSelfHash(r)); assert.equal(r.medium.detachedAfterVerification, true); assert.match(r.restoreVerify.outputSha256, /^[0-9a-f]{64}$/);
  const anc = (a, b) => a === b || (a === 'c'.repeat(40) && b === HEAD) || (a === HEAD && b === 'd'.repeat(40));
  assert.deepEqual(problems(r, { isAncestor: anc, currentHead: 'd'.repeat(40), mustContain: ['c'.repeat(40)] }), []);
});

test('NEGATIVE CONTROLS: a rehearsal, an unmet condition, a missing attestation, an unencrypted or attached medium, or an altered record never validates', () => {
  const rehearsal = JSON.parse(restoreOutput()); rehearsal.restore.label = 'REHEARSAL'; rehearsal.conditions[FOUR_CONDITIONS[0]] = false; rehearsal.result = 'ACCEPTANCE_NOT_MET';
  const p1 = problems(record({}, JSON.stringify(rehearsal))); assert.ok(p1.includes('RESTORE_VERIFY_RESULT_NOT_ALL_FOUR') && p1.includes('NOT_A_DIFFERENT_DEVICE_RESTORE:REHEARSAL') && p1.includes(`ACCEPTANCE_CONDITION_NOT_MET:${FOUR_CONDITIONS[0]}`));
  for (const c of FOUR_CONDITIONS) { const o = JSON.parse(restoreOutput()); o.conditions[c] = false; assert.ok(problems(record({}, JSON.stringify(o))).includes(`ACCEPTANCE_CONDITION_NOT_MET:${c}`), c); }
  { const o = JSON.parse(restoreOutput()); o.conditions[FOUR_CONDITIONS[3]] = false; assert.ok(problems(record({}, JSON.stringify(o))).includes('MEDIUM_NOT_ATTESTED_DETACHED')); }
  { const o = JSON.parse(restoreOutput()); o.restore.mismatched = 1; assert.ok(problems(record({}, JSON.stringify(o))).includes('RESTORED_FILES_DO_NOT_MATCH')); }
  { const o = JSON.parse(restoreOutput()); o.restore.fsckOk = false; assert.ok(problems(record({}, JSON.stringify(o))).includes('RESTORED_REPOSITORY_DOES_NOT_MATCH')); }
  assert.ok(problems(record({ attestedBy: '' })).includes('OWNER_ATTESTATION_MISSING')); assert.ok(problems(record({ encryption: 'NONE' })).includes('MEDIUM_NOT_ENCRYPTED')); assert.ok(problems(record({ head: 'main' })).includes('SOURCE_HEAD_INVALID')); assert.ok(problems(record({ scopeSha256: 'x' })).includes('SCOPE_SHA256_INVALID'));
  const t = record(); t.attestedBy.role = 'MODEL'; assert.ok(problems(t).includes('RECORD_ALTERED') && problems(t).includes('OWNER_ATTESTATION_MISSING'));
  const u = record(); u.restoreVerify.restore.label = 'RESTORE_ON_DIFFERENT_DEVICE '; assert.ok(problems(u).includes('RECORD_ALTERED'));
  const m = record(); m.medium.class = 'CLOUD'; m.recordSha256 = recordSelfHash(m); assert.deepEqual(problems(m), ['MEDIUM_NOT_OFFLINE_EXTERNAL']);
  assert.deepEqual(problems(null), ['RECORD_MISSING_OR_UNKNOWN_SCHEMA']); assert.deepEqual(problems({ schema: 'OTHER' }), ['RECORD_MISSING_OR_UNKNOWN_SCHEMA']);
});

test('NEGATIVE CONTROLS: a backup outside the current history, or older than the frozen protocol, does not count', () => {
  const r = record(), none = () => false; assert.ok(problems(r, { isAncestor: none, currentHead: 'd'.repeat(40) }).includes('BACKED_UP_HEAD_IS_NOT_IN_THE_CURRENT_HISTORY'));
  assert.ok(problems(r, { isAncestor: (a, b) => a === HEAD && b === 'd'.repeat(40), currentHead: 'd'.repeat(40), mustContain: ['e'.repeat(40)] }).some((p) => p.startsWith('BACKUP_PREDATES_REQUIRED_COMMIT:')));
});

// ---------------------------------------------------------------- the real repository, read-only
const IN_GIT = existsSync(resolve(REPO, '.git'));
test('REAL REPOSITORY, read-only: the gate is NO_GO; custody and exclusion enforcement pass; the other five do not', { skip: IN_GIT ? false : 'not inside a git work tree' }, async () => {
  const { gate, facts, core } = await evaluateRepository(); assert.equal(gate.decision, 'NO_GO');
  assert.equal(gate.conditions[G2].status, 'PASS', gate.conditions[G2].reasons.join(';')); assert.equal(facts.exclusions.forbiddenBlocks, 114); assert.equal(facts.exclusions.selfcheck.negativePassed, facts.exclusions.selfcheck.negativeTotal);
  for (const id of [G3, G4, G5, G7]) assert.equal(gate.conditions[id].status, 'FAIL', id);
  assert.equal(facts.recovery.recordPresent, false, 'no backup acceptance record exists'); assert.equal(facts.environment.issuedManifest, false); assert.notEqual(facts.protocol.status, 'FROZEN'); assert.equal(facts.inference.implemented, false);
  if (facts.custody.listReadable) { assert.equal(gate.conditions[G1].status, 'PASS'); assert.equal(facts.custody.identities, 31); assert.equal(facts.custody.tracked, 0); assert.equal(facts.environment.informationalLocalScope.counts.PROTECTED_SOURCE, 31); assert.equal(facts.environment.informationalLocalScope.sk1EvaluationClosureProtectedFiles, 29); }
  if (existsSync(READINESS_FILE)) { const stored = JSON.parse(readFileSync(READINESS_FILE, 'utf8')); assert.deepEqual(stored.core, JSON.parse(JSON.stringify(core))); assert.equal(stored.BACKUP_VERIFIED, false); assert.equal(stored.gate.decision, 'NO_GO');
    const text = JSON.stringify(stored); assert.ok(!/"(seed|seeds|worldHash|truth|utility)"\s*:/.test(text), 'identities only'); }
});
