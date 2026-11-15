// Gate 0.2 — the kernel inference graph is evaluator-free; the audit catches a planted violation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { auditInferenceGraph } from '../infra/graph-audit.mjs';

const LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), tmp = mkdtempSync(join(tmpdir(), 'sk1-graph-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));
test('inference closure: lane-local files only, node:crypto only, no forbidden token', () => { const r = auditInferenceGraph(LANE); assert.deepEqual(r.violations, []); assert.equal(r.evaluatorFree, true); assert.equal(r.fileCount, 12); assert.ok(r.files.every((f) => /^(kernel|adapters|api)\//.test(f.rel))); });
test('negative controls: an evaluator import, an engine import, a clock and a file read are each flagged', () => {
  for (const d of ['kernel', 'adapters', 'api']) cpSync(resolve(LANE, d), join(tmp, d), { recursive: true }); mkdirSync(join(tmp, 'infra'), { recursive: true }); writeFileSync(join(tmp, 'infra/evaluate.mjs'), 'export const x = 1;\n');
  const patch = (rel, extra) => { const base = resolve(LANE, rel); cpSync(base, join(tmp, rel)); writeFileSync(join(tmp, rel), extra + '\n' + require_(base)); };
  const require_ = (p) => String(readFileSyncSafe(p));
  patch('kernel/risk.mjs', "import { x } from '../infra/evaluate.mjs';"); let v = auditInferenceGraph(tmp).violations; assert.ok(v.some((x) => x.kind === 'IMPORT_LEAVES_INFERENCE_DIRECTORIES' && x.file === 'kernel/risk.mjs'));
  patch('kernel/risk.mjs', "import { hashWorld } from '../../src/forge/kernel.js';"); v = auditInferenceGraph(tmp).violations; assert.ok(v.some((x) => x.kind === 'IMPORT_LEAVES_INFERENCE_DIRECTORIES'));
  patch('kernel/risk.mjs', "import { readFileSync } from 'node:fs';\nconst t = Date.now();"); v = auditInferenceGraph(tmp).violations; assert.ok(v.some((x) => x.kind === 'FORBIDDEN_IMPORT' && x.value === 'node:fs')); assert.ok(v.some((x) => x.kind === 'FORBIDDEN_TOKEN' && x.value === 'Date.now'));
  patch('adapters/forge/features.mjs', 'const r = Math.random();'); assert.ok(auditInferenceGraph(tmp).violations.some((x) => x.kind === 'FORBIDDEN_TOKEN' && x.value === 'Math.random'));
});
import { readFileSync as readFileSyncSafe } from 'node:fs';
