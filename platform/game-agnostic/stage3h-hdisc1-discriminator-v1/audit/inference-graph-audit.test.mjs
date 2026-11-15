// H-DISC-1 static-audit tests. Run: node --test audit/*.test.mjs
// ADVERSARIAL: each control copies the real inference closure into a temporary directory, plants ONE forbidden
// dependency or capability, and requires the audit to name it. Nothing in the repository is modified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { auditInferenceGraph, stripComments, importsOf, runAudit } from './inference-graph-audit.mjs';
import { INFERENCE_CLOSURE, ENTRY_POINT, sourceIdentity } from '../api/host.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GA = resolve(HERE, '../..'), L = 'stage3h-hdisc1-discriminator-v1';
/** A private copy of the closure; `mutate(root)` may edit or add files. Returns the audit of the copy. */
function withCopy(mutate, { declared = INFERENCE_CLOSURE, protectedPaths = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hdisc1-adv-'));
  try { for (const f of INFERENCE_CLOSURE) { mkdirSync(dirname(resolve(dir, f)), { recursive: true }); cpSync(resolve(GA, f), resolve(dir, f)); } mutate(dir); return auditInferenceGraph({ root: dir, entry: ENTRY_POINT, declared, protectedPaths }); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const append = (dir, file, text) => { const p = resolve(dir, file); writeFileSync(p, readFileSync(p, 'utf8') + '\n' + text + '\n'); };
const put = (dir, file, text) => { const p = resolve(dir, file); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };
const codes = (a) => a.violations.map((v) => v.code);

test('the real closure audits clean, equals the declared list and matches the host source identity', () => {
  const a = auditInferenceGraph({ root: GA, entry: ENTRY_POINT, declared: INFERENCE_CLOSURE }); assert.deepEqual(a.violations, []); assert.equal(a.evaluatorFree, true); assert.equal(a.fileCount, 12);
  assert.deepEqual(a.files.map((f) => f.file), [...INFERENCE_CLOSURE].sort()); const id = sourceIdentity(); for (const f of a.files) assert.equal(id.files.find((x) => x.file === f.file).sha256, f.sha256);
  assert.deepEqual(withCopy(() => {}).violations, []); // the untouched copy is clean too, so every control below fails for its planted reason only
});

const CONTROLS = [
  ['an evaluator module is imported', (d) => { put(d, 'stage3h-sk1-safety-kernel-v1/infra/evaluate.mjs', 'export const evaluate = () => 0;'); append(d, `${L}/discriminator/index.mjs`, "import { evaluate } from '../../stage3h-sk1-safety-kernel-v1/infra/evaluate.mjs';"); }, ['FORBIDDEN_MODULE_REACHED', 'UNDECLARED_FILE_IN_CLOSURE']],
  ['the frozen evaluator definitions are imported', (d) => { put(d, 'stage3h-hw1-dev-v1/hw1-eval.mjs', 'export const evalClass = () => 0;'); append(d, `${L}/discriminator/pair-model.mjs`, "import { evalClass } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';"); }, ['FORBIDDEN_MODULE_REACHED']],
  ['a custody-protected module is imported', (d) => { put(d, 'stage3h-canonical-v1/adapters.mjs', 'export const x = 1;'); append(d, `${L}/discriminator/encoder.mjs`, "import { x } from '../../stage3h-canonical-v1/adapters.mjs';"); }, ['CUSTODY_PROTECTED_MODULE_REACHED', 'FORBIDDEN_MODULE_REACHED'], { protectedPaths: ['stage3h-canonical-v1/adapters.mjs'] }],
  ['the native engine is imported', (d) => { put(d, 'src/forge/kernel.js', 'export const createWorld = () => ({});'); append(d, `${L}/discriminator/forge-encoder.mjs`, "import { createWorld } from '../../src/forge/kernel.js';"); }, ['FORBIDDEN_MODULE_REACHED', 'NATIVE_EXECUTION_PRIMITIVE']],
  ['the frozen SK1 projection with its native-view extractor is imported again', (d) => { cpSync(resolve(GA, 'stage3h-sk1-safety-kernel-v1/adapters/forge/projection.mjs'), resolve(d, 'stage3h-sk1-safety-kernel-v1/adapters/forge/projection.mjs')); append(d, `${L}/discriminator/forge-encoder.mjs`, "import { keysV2 as k2 } from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/projection.mjs';"); }, ['UNDECLARED_FILE_IN_CLOSURE', 'PRIVILEGED_PROPERTY_READ', 'ARBITRARY_IDENTIFIER_READ']],
  ['a network module is imported', (d) => append(d, `${L}/discriminator/index.mjs`, "import http from 'node:http';"), ['FORBIDDEN_BUILTIN_OR_PACKAGE_IMPORT', 'NETWORK_ACCESS']],
  ['an npm package is imported', (d) => append(d, `${L}/discriminator/canonical.mjs`, "import axios from 'axios';"), ['FORBIDDEN_BUILTIN_OR_PACKAGE_IMPORT']],
  ['fetch is called', (d) => append(d, `${L}/discriminator/index.mjs`, "export const leak = (r) => fetch('https://example.invalid/', { method: 'POST', body: JSON.stringify(r) });"), ['NETWORK_ACCESS']],
  ['the environment is read', (d) => append(d, `${L}/discriminator/pair-model.mjs`, 'export const k = process.env.HDISC_KEY;'), ['PROCESS_OR_ENVIRONMENT_ACCESS']],
  ['a child process is spawned', (d) => append(d, `${L}/api/host.mjs`, "import { execFileSync } from 'node:child_process';"), ['FORBIDDEN_BUILTIN_OR_PACKAGE_IMPORT', 'PROCESS_OR_ENVIRONMENT_ACCESS']],
  ['randomness is used', (d) => append(d, `${L}/discriminator/contract.mjs`, 'export const coin = () => Math.random() < 0.5;'), ['CLOCK_OR_RANDOMNESS']],
  ['the clock is read', (d) => append(d, `${L}/discriminator/index.mjs`, 'export const now = () => Date.now();'), ['CLOCK_OR_RANDOMNESS']],
  ['code is loaded dynamically', (d) => append(d, `${L}/discriminator/index.mjs`, "export const load = (p) => import(p);"), ['DYNAMIC_CODE']],
  ['eval is used', (d) => append(d, `${L}/discriminator/encoder.mjs`, "export const run = (s) => eval(s);"), ['DYNAMIC_CODE']],
  ['the file system is imported outside the host', (d) => append(d, `${L}/discriminator/pair-model.mjs`, "import { readFileSync } from 'node:fs';"), ['FILE_SYSTEM_IMPORT_OUTSIDE_THE_HOST']],
  ['the host writes a file', (d) => append(d, `${L}/api/host.mjs`, "import { writeFileSync } from 'node:fs'; export const save = (p, t) => writeFileSync(p, t);"), ['FILE_WRITE']],
  ['evaluator truth is read', (d) => append(d, `${L}/discriminator/index.mjs`, 'export const peek = (cls) => cls.members[0].truth;'), ['PRIVILEGED_PROPERTY_READ']],
  ['a generator seed is read', (d) => append(d, `${L}/discriminator/forge-encoder.mjs`, 'export const s = (state) => state.seed;'), ['PRIVILEGED_PROPERTY_READ']],
  ['a private world hash is read', (d) => append(d, `${L}/discriminator/forge-encoder.mjs`, "export const w = (state) => state['worldHash'];"), ['PRIVILEGED_PROPERTY_READ']],
  ['hidden health is read', (d) => append(d, `${L}/discriminator/encoder.mjs`, 'export const h = (n) => n.hiddenHealth;'), ['PRIVILEGED_PROPERTY_READ']],
  ['a future outcome label is read', (d) => append(d, `${L}/discriminator/pair-model.mjs`, 'export const y = (a) => a.introducesVsNexus;'), ['PRIVILEGED_PROPERTY_READ']],
  ['an action handle is read', (d) => append(d, `${L}/discriminator/index.mjs`, 'export const tie = (a, b) => (a.handle < b.handle ? a : b);'), ['ARBITRARY_IDENTIFIER_READ']],
  ['a menu position is read', (d) => append(d, `${L}/discriminator/contract.mjs`, 'export const first = (a) => a.menuIndex === 0;'), ['ARBITRARY_IDENTIFIER_READ']],
  ['a native-world execution primitive appears', (d) => append(d, `${L}/api/discriminator-api.mjs`, 'export const go = (world, a) => applyAction(world, a);'), ['NATIVE_EXECUTION_PRIMITIVE']],
  ['a helper is imported without being declared', (d) => { put(d, `${L}/discriminator/extra.mjs`, 'export const z = 1;'); append(d, `${L}/discriminator/index.mjs`, "import { z } from './extra.mjs';"); }, ['UNDECLARED_FILE_IN_CLOSURE']],
  ['an imported module is missing', (d) => append(d, `${L}/discriminator/index.mjs`, "import { q } from './not-there.mjs';"), ['MODULE_NOT_FOUND', 'UNDECLARED_FILE_IN_CLOSURE']],
];
for (const [name, mutate, expected, opts] of CONTROLS) test(`adversarial control: ${name} -> rejected`, () => { const a = withCopy(mutate, opts); assert.equal(a.evaluatorFree, false, name); for (const c of expected) assert.ok(codes(a).includes(c), `${name}: expected ${c}, got ${codes(a).join(', ')}`); });

test('adversarial control: a declared file that is no longer reached is reported', () => {
  const a = withCopy(() => {}, { declared: [...INFERENCE_CLOSURE, `${L}/discriminator/ghost.mjs`] }); assert.ok(codes(a).includes('DECLARED_FILE_NOT_REACHED')); assert.equal(a.evaluatorFree, false);
});

test('comments cannot hide or trigger a finding; strings are kept', () => {
  assert.equal(stripComments("a = 1; // Math.random()\nb = 2; /* fetch( */ c = 'x // y';").replace(/\s+/g, ' ').trim(), "a = 1; b = 2; c = 'x // y';");
  const clean = withCopy((d) => append(d, `${L}/discriminator/index.mjs`, '// Math.random(), fetch(x), process.env, cls.members[0].truth, import(p)\n/* writeFileSync(a, b); eval(s) */')); assert.deepEqual(clean.violations, []);
  assert.deepEqual(importsOf("import a from './a.mjs';\nexport { b } from \"./b.mjs\";\nimport './c.mjs';\nconst s = 'import x from \"./not.mjs\"';").sort(), ['./a.mjs', './b.mjs', './c.mjs']);
});

test('a working-tree pass is never reported as a committed-source pass', async () => {
  const wt = await runAudit({ committed: false }); assert.equal(wt.WORKING_TREE_AUDIT, 'PASS'); assert.equal(wt.COMMITTED_SOURCE_AUDIT, 'NOT_RUN'); assert.equal(wt.core.EVALUATOR_FREE_INFERENCE, true); assert.equal(wt.core.H_DISC_1_SOURCE_HASH, sourceIdentity().sourceHash);
  const cs = await runAudit({ committed: true }); assert.ok(['PASS', 'FAIL_CLOSURE_NOT_COMMITTED_AT_HEAD'].includes(cs.COMMITTED_SOURCE_AUDIT));
  if (cs.COMMITTED_SOURCE_AUDIT === 'PASS') { assert.equal(cs.committedSource.allTrackedAndEqualToHead, true); assert.equal(cs.cleanExport.exportedOnlyTheClosureAndOneFixture, true); assert.equal(cs.cleanExport.liveCall.decision, 'ABSTAIN'); assert.equal(cs.cleanExport.liveCall.executeRefusedWith, 'EXECUTION_OR_MUTATION_REQUESTED'); assert.equal(cs.cleanExport.sourceHash, cs.core.H_DISC_1_SOURCE_HASH); }
  else assert.ok(cs.committedSource.notCommitted.length > 0); // before the lane is committed, the committed-source audit must refuse
});
