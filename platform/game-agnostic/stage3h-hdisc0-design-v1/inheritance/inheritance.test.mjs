// STAGE 3H H-DISC-0 Gate 0 — tests for the inheritance verifier. Run: node --test inheritance/*.test.mjs
// Unit tests are pure and each has a negative control. The integration tests recompute the static core against the
// repository (read-only, about half a minute); they do not execute the long check modes or suites — those are run by
// `verify-inheritance.mjs --write` and recorded in the evidence file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { EXPECT, VERDICT_SOURCES, ROSTER_SOURCES, RUN_SUPPORTS, SCHEMA, EVIDENCE_FILE, dig, keyLine, rosterConst, parseTestSummary, orderedAncestry, verdictRow, rosterVerdict, pinsByLane, status, verifyAgainst, overall, buildCore } from './verify-inheritance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '../../../..');
const git = (...a) => execFileSync('/usr/bin/git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();

test('keyLine: reads a KEY=VALUE line; NEGATIVE CONTROL: absent key and conflicting values are not accepted', () => {
  const text = 'intro\nSTATUS=CLOSED\nCLASSIFICATION=H_W1_DEV_VALIDATION_NOT_QUALIFIED\nSTATIC_IMPORT_CONTRACT=FAIL\nnot STATUS=OPEN inline\n';
  assert.equal(keyLine(text, 'STATUS'), 'CLOSED'); assert.equal(keyLine(text, 'STATIC_IMPORT_CONTRACT'), 'FAIL');
  assert.equal(keyLine(text, 'MISSING_KEY'), null); assert.equal(keyLine('STATUS=CLOSED\nSTATUS=OPEN\n', 'STATUS'), 'AMBIGUOUS'); assert.equal(keyLine('STATUS=CLOSED\nSTATUS=CLOSED\n', 'STATUS'), 'CLOSED');
  assert.equal(keyLine('H_W4B_CLASSIFICATION=D\n', 'CLASSIFICATION'), null, 'a longer key must not satisfy a shorter one');
});

test('verdictRow: a verdict is accepted only when the tracked record says exactly the expected string', () => {
  const j = { kind: 'json', at: 'ownerAdjudication.BOUNDED_SELECTOR_QUALIFICATION', expect: 'NOT_QUALIFIED' };
  assert.deepEqual(verdictRow(j, JSON.stringify({ ownerAdjudication: { BOUNDED_SELECTOR_QUALIFICATION: 'NOT_QUALIFIED' } })), { ok: true, found: 'NOT_QUALIFIED' });
  // negative controls: a changed verdict, a missing field, a missing line
  assert.deepEqual(verdictRow(j, JSON.stringify({ ownerAdjudication: { BOUNDED_SELECTOR_QUALIFICATION: 'QUALIFIED' } })), { ok: false, found: 'QUALIFIED' });
  assert.deepEqual(verdictRow(j, JSON.stringify({ ownerAdjudication: {} })), { ok: false, found: null });
  assert.deepEqual(verdictRow({ kind: 'line', at: 'STATIC_IMPORT_CONTRACT', expect: 'FAIL' }, 'STATIC_IMPORT_CONTRACT=PASS\n'), { ok: false, found: 'PASS' });
  assert.deepEqual(verdictRow({ kind: 'line', at: 'STATIC_IMPORT_CONTRACT', expect: 'FAIL' }, 'nothing here\n'), { ok: false, found: null });
  assert.equal(dig({ a: { b: 1 } }, 'a.b'), 1); assert.equal(dig({ a: null }, 'a.b'), undefined);
});

test('every predecessor study has at least one machine-readable and one closure source, and none expects a positive verdict', () => {
  for (const st of ['V4', 'H-W1', 'H-W4', 'H-W4B']) assert.ok(VERDICT_SOURCES.filter((s) => s.study === st).length >= 2, st);
  for (const s of VERDICT_SOURCES) assert.ok(!/^(QUALIFIED|PASS|A)$/.test(s.expect), `${s.study} ${s.at}`);
  assert.ok(VERDICT_SOURCES.some((s) => s.study === 'H-W1' && s.at === 'STATIC_IMPORT_CONTRACT' && s.expect === 'FAIL'));
  assert.ok(VERDICT_SOURCES.some((s) => s.study === 'H-W4B' && s.at === 'valueBandPolicyLine' && s.expect === 'CLOSED'));
});

test('parseTestSummary: counts and failing test names; NEGATIVE CONTROL: a truncated report yields nulls', () => {
  const ok = parseTestSummary('✔ a (1.2ms)\n✔ b (3ms)\nℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\n');
  assert.deepEqual(ok, { tests: 2, pass: 2, fail: 0, skipped: 0, failing: [] });
  const bad = parseTestSummary('✔ a (1ms)\n✖ INTEGRATION inventory verify against the working tree: no drift (3602.73ms)\nℹ tests 65\nℹ pass 64\nℹ fail 1\nℹ skipped 0\n\n✖ failing tests:\n\n✖ INTEGRATION inventory verify against the working tree: no drift (3602.73ms)\n');
  assert.equal(bad.tests, 65); assert.equal(bad.pass, 64); assert.equal(bad.fail, 1); assert.deepEqual(bad.failing, ['INTEGRATION inventory verify against the working tree: no drift']);
  assert.deepEqual(parseTestSummary('crashed before the summary'), { tests: null, pass: null, fail: null, skipped: null, failing: [] });
});

test('orderedAncestry: the stage commits must each be a strict ancestor of the next; NEGATIVE CONTROLS', () => {
  const order = ['a', 'b', 'c', 'd'], isAnc = (x, y) => order.indexOf(x) < order.indexOf(y), mk = (ids) => ids.map((id) => ({ id, full: id }));
  assert.equal(orderedAncestry(mk(['a', 'b', 'c', 'd']), isAnc), true);
  assert.equal(orderedAncestry(mk(['a', 'c', 'b', 'd']), isAnc), false, 'wrong order');
  assert.equal(orderedAncestry(mk(['a', 'b', 'b', 'd']), isAnc), false, 'a repeated commit is not a strict ancestor');
  assert.equal(orderedAncestry([{ id: 'a', full: 'a' }, { id: 'zz', full: null }], isAnc), false, 'an unresolvable commit');
});

test('rosterConst and rosterVerdict: nine named experts, every definition identical; NEGATIVE CONTROLS', () => {
  const nine = [...EXPECT.roster];
  assert.equal(nine.length, 9); assert.equal(new Set(nine).size, 9); assert.ok(!nine.includes('Arbiter') && !nine.includes('Router'), 'the Arbiter is infrastructure, not an expert');
  assert.deepEqual(rosterConst("export const ROSTER = Object.freeze(['Prime', 'Vanguard', 'Oracle', 'Nexus', 'Horizon', 'Archimedes', 'Alexandria', 'Picasso', 'Forge']);"), nine);
  assert.deepEqual(rosterConst("export const ROSTER = deepFreeze(['Prime', \"Vanguard\"]);"), ['Prime', 'Vanguard']); assert.equal(rosterConst('const NOTHING = 1;'), null);
  assert.equal(rosterVerdict([{ file: 'a', names: nine }, { file: 'b', names: [...nine] }]).ok, true);
  const tenth = rosterVerdict([{ file: 'a', names: nine }, { file: 'b', names: [...nine, 'Expert10'] }]); assert.equal(tenth.ok, false); assert.deepEqual(tenth.disagreeing.map((d) => d.file), ['b']);
  assert.equal(rosterVerdict([{ file: 'a', names: nine.slice(0, 8) }]).ok, false, 'a missing expert');
  assert.equal(rosterVerdict([{ file: 'a', names: [nine[1], nine[0], ...nine.slice(2)] }]).ok, false, 'a reordered roster is a different record');
  assert.equal(rosterVerdict([{ file: 'a', names: null }]).ok, false, 'an unreadable definition'); assert.equal(rosterVerdict([]).ok, false, 'no definition at all');
  assert.ok(ROSTER_SOURCES.length >= 3 && ROSTER_SOURCES[0].file === 'artifacts/stage3f-freeze/stage3f-freeze.json');
});

test('pinsByLane and status: each lane is filed under the revision it pins; a failed or unmeasured check is never VERIFIED', () => {
  const p = pinsByLane([{ file: 'stage3h-hw1-dev-v1/evidence/I5.json', old: true, cut: false }, { file: 'stage3h-hw4-value-band-v1/evidence/F.json', old: false, cut: true }, { file: 'stage3h-hw4-value-band-v1/H_W4B.md', old: true, cut: true }]);
  assert.deepEqual(p['stage3h-hw1-dev-v1'], { OLD: ['stage3h-hw1-dev-v1/evidence/I5.json'], CUT: [], BOTH: [] }); assert.deepEqual(p['stage3h-hw4-value-band-v1'].CUT, ['stage3h-hw4-value-band-v1/evidence/F.json']); assert.deepEqual(p['stage3h-hw4-value-band-v1'].BOTH, ['stage3h-hw4-value-band-v1/H_W4B.md']);
  assert.equal(status(true), 'VERIFIED'); assert.equal(status(false), 'DIFFERS'); assert.equal(status(true, false), 'NOT_VERIFIED'); assert.equal(status(false, false), 'NOT_VERIFIED');
});

test('verifyAgainst and overall: NEGATIVE CONTROLS — a tampered record, a changed status, a failed run and a wrong schema are each reported', () => {
  const core = { items: { '03_X': { title: 't', status: 'VERIFIED', evidence: { sha256: 'aa' } }, '06_Y': { title: 'u', status: 'VERIFIED', evidence: { rows: [{ file: 'f', found: 'NOT_QUALIFIED' }] } } } }, stored = { schema: SCHEMA, core: structuredClone(core) };
  assert.deepEqual(verifyAgainst(stored, core), { ok: true, drift: [], failed: [] });
  const t1 = structuredClone(stored); t1.core.items['06_Y'].evidence.rows[0].found = 'QUALIFIED'; const r1 = verifyAgainst(t1, core); assert.equal(r1.ok, false); assert.ok(r1.drift.some((d) => d.includes('06_Y') && d.includes('QUALIFIED')));
  const c2 = structuredClone(core); c2.items['03_X'].status = 'DIFFERS'; const r2 = verifyAgainst(stored, c2); assert.equal(r2.ok, false); assert.deepEqual(r2.failed, ['03_X:DIFFERS']);
  assert.equal(verifyAgainst({ schema: 'OTHER', core }, core).ok, false); assert.equal(verifyAgainst(null, core).ok, false);
  const runsOk = { sk1Check: { asExpected: true }, sk11Suite: { asExpected: true } }, runsBad = { sk1Check: { asExpected: false }, sk11Suite: { asExpected: true } };
  assert.equal(overall(core, runsOk).gate0, 'PASS'); assert.equal(overall(core, null).gate0, 'STATIC_CORE_ONLY', 'without the runs the gate is not declared passed');
  const o = overall(core, runsBad); assert.equal(o.gate0, 'FAIL'); assert.deepEqual(o.itemsWeakenedByAFailedRun, [`${RUN_SUPPORTS.sk1Check} (run sk1Check)`]); assert.equal(overall(c2, runsOk).gate0, 'FAIL');
});

test('expectations are the inherited identities and nothing more favourable', () => {
  assert.equal(EXPECT.baseHead, 'eb75dff868bf526720cb8d13b70f5643fed49e64'); assert.equal(EXPECT.sk1.classification, 'B_SAFETY_KERNEL_MATERIAL_IMPROVEMENT_NOT_QUALIFIED'); assert.equal(EXPECT.sk2f.classification, 'B_SELECTIVE_ASSURANCE_FEASIBILITY_UNSUPPORTED');
  assert.equal(EXPECT.sk1.modelHash, 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b'); assert.deepEqual(EXPECT.sk11.suite, { tests: 65, pass: 64, fail: 1 }, 'the dated-inventory test is expected to fail after the import cut; it is not hidden');
  assert.deepEqual(EXPECT.stageCommits.map((c) => c[1]), ['179922dd', '16ae5c21', '17318b03', 'eb75dff8']); assert.deepEqual(EXPECT.readiness, { protectedFilesOutsideGit: 29, gitignoredDataFiles: 19, forbiddenBlocks: 114 });
});

let CORE = null; const core = async () => (CORE ??= await buildCore());

test('INTEGRATION: every Gate 0 item verifies against the repository, and none of the five readiness limitations is reported as resolved', async () => {
  const { core: c, volatile } = await core(), I = c.items;
  assert.equal(Object.keys(I).length, 11); for (const [k, v] of Object.entries(I)) assert.equal(v.status, 'VERIFIED', k);
  assert.equal(I['03_SK1_CLASSIFICATION_AND_IDENTITIES'].evidence.safetyKernelDevQualified, false); assert.equal(I['05_SK2_F_CLASSIFICATION'].evidence.recordedAttribution.publicSafeActionIdentifiability, 'NOT_ESTABLISHED');
  assert.equal(I['06_PREDECESSOR_VERDICTS'].evidence.rows.length, VERDICT_SOURCES.length); for (const r of I['06_PREDECESSOR_VERDICTS'].evidence.rows) { assert.ok(r.matches && r.tracked && r.equalsHead, `${r.study} ${r.where}`); assert.match(r.sha256, /^[0-9a-f]{64}$/); assert.match(r.introducedIn, /^[0-9a-f]{8}$/); }
  assert.equal(I['10_NINE_EXPERT_ROSTER'].evidence.expertCount, 9); assert.equal(I['10_NINE_EXPERT_ROSTER'].evidence.expert10Added, false); assert.deepEqual(I['10_NINE_EXPERT_ROSTER'].evidence.pathsChangedSinceSk1Base, []);
  const F = I['11_MANDATORY_READINESS_FINDINGS'].evidence;
  assert.equal(F.finding1.resolved, false); assert.equal(F.finding1.protectedFilesInTheEvaluationClosure, 29); assert.equal(F.finding1.presentInHeadTree, 0);
  assert.equal(F.finding2.resolved, false); assert.equal(F.finding2.filesNeededByCheckMode, 19); assert.equal(F.finding2.confirmedIgnoredByGit, 19);
  assert.equal(F.finding3.resolved, false); assert.equal(F.finding3.importableFromCommittedSourceAlone, false); for (const p of F.finding3.cleanExportProbe) { assert.equal(p.linksFromCommittedSourceAlone, false); assert.equal(p.errorCode, 'ERR_MODULE_NOT_FOUND'); assert.equal(p.firstUnresolvedModule, 'stage3h-canonical-v1/adapters.mjs'); assert.equal(p.closureFilesNotInHead.length, 29); }
  assert.equal(F.finding4.resolved, false); assert.equal(F.finding4.independentBackupVerified, false);
  assert.match(String(F.finding5.resolved), /^PARTLY/); assert.equal(F.finding5.headCarries, 'CUT'); assert.equal(F.finding5.hw1PinsOnlyTheOldRevision, true);
  assert.equal(F.readinessVerdictOfSk2F, 'NOT_READY'); assert.match(volatile.head, /^[0-9a-f]{40}$/);
});

test('INTEGRATION: the verifier wrote nothing and staged nothing; the clean-export probe left no directory behind', async () => {
  const before = { head: git('rev-parse', 'HEAD'), index: git('diff', '--cached', '--name-only'), pp: git('hash-object', 'platform/game-agnostic/stage3h-hw1-dev-v1/public-projection.mjs') };
  const probeDirs = () => new Set(readdirSync(realpathSync(tmpdir())).filter((n) => n.startsWith('hdisc0-clean-'))), dirsBefore = probeDirs();
  await buildCore();
  for (const d of probeDirs()) assert.ok(dirsBefore.has(d), `clean-export probe left ${d} behind`);
  assert.deepEqual({ head: git('rev-parse', 'HEAD'), index: git('diff', '--cached', '--name-only'), pp: git('hash-object', 'platform/game-agnostic/stage3h-hw1-dev-v1/public-projection.mjs') }, before); assert.equal(before.index, '');
  const outside = git('status', '--porcelain', '--', 'platform/game-agnostic/stage3h-sk1-safety-kernel-v1', 'platform/game-agnostic/stage3h-sk1-1-assurance-v1', 'platform/game-agnostic/stage3h-sk2f-feasibility-v1'); assert.equal(outside, '', 'no earlier lane was touched');
});

test('INTEGRATION: the stored evidence equals a recomputation and carries identities only', { skip: existsSync(EVIDENCE_FILE) ? false : 'evidence/HDISC0_INHERITANCE.json has not been written yet' }, async () => {
  const stored = JSON.parse(readFileSync(EVIDENCE_FILE, 'utf8')), { core: c } = await core(), v = verifyAgainst(stored, c);
  assert.deepEqual(v.drift, []); assert.deepEqual(v.failed, []); assert.equal(stored.schema, SCHEMA); assert.equal(stored.authority, 'R0');
  assert.equal(stored.summary.gate0, 'PASS'); assert.equal(stored.summary.allItemsVerified, true); assert.equal(stored.summary.allRunsAsExpected, true);
  assert.deepEqual(Object.keys(stored.runs).sort(), Object.keys(RUN_SUPPORTS).sort()); for (const [k, r] of Object.entries(stored.runs)) assert.equal(r.asExpected, true, k);
  assert.deepEqual({ tests: stored.runs.sk1Suite.actual.tests, pass: stored.runs.sk1Suite.actual.pass, fail: stored.runs.sk1Suite.actual.fail }, EXPECT.sk1.suite);
  assert.deepEqual({ tests: stored.runs.sk2fSuite.actual.tests, pass: stored.runs.sk2fSuite.actual.pass, fail: stored.runs.sk2fSuite.actual.fail }, EXPECT.sk2f.suite);
  const FORBIDDEN = /^(seed|seeds|worldHash|sourceStateHash|truth|truths|utility|utilities|hiddenValue|hiddenHealth|hiddenState|members)$/;
  const scan = (x, path) => { if (Array.isArray(x)) x.forEach((y, i) => scan(y, `${path}[${i}]`)); else if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) { assert.ok(!FORBIDDEN.test(k), `privileged key ${path}.${k}`); scan(y, `${path}.${k}`); } }; scan(stored, '$');
});
