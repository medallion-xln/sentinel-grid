// SK1 Gate 0.2 — static audit of the Safety Kernel inference dependency graph.
// Walks the TRANSITIVE import closure of the inference entry points and enforces:
//   * every import is a relative path that stays inside this lane's kernel/, adapters/ or api/ directories, or node:crypto
//   * only api/host.mjs may additionally import node:fs, node:path and node:url (it loads the frozen model and hashes sources)
//   * no file, network, clock, random, environment or process API token in kernel/ or adapters/
//   * nothing from infra/, analysis/, tests/, evidence/, work/ or any other lane (so no evaluator, population, label or
//     tooling module can be reached)
// This audit covers the NEW kernel only. It does not change, and says nothing new about, the static-import status of
// the frozen H-W1 / H-W4 policies at committed HEAD, which remains FAIL as recorded in the H-W4B closure.
//   /opt/homebrew/bin/node infra/graph-audit.mjs [--root <lane dir>] [--write]
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex');
export const ENTRY_POINTS = ['api/recommend.mjs', 'api/host.mjs', 'kernel/index.mjs', 'adapters/forge/features.mjs', 'adapters/rescue/adapter.mjs'];
const ALLOWED_DIR = /^(kernel|adapters|api)\//, HOST = 'api/host.mjs', HOST_NODE = new Set(['node:fs', 'node:path', 'node:url']);
const TOKEN = /\b(readFileSync|readFile|writeFileSync|writeFile|appendFile|openSync|fetch|XMLHttpRequest|Math\.random|Date\.now|new Date|performance\.now|process\.env|process\.argv|child_process|require\s*\(|eval\s*\(|import\s*\()/g;

/** root: a lane directory (the working lane, or a clean export of the committed lane). */
export function auditInferenceGraph(root, entries = ENTRY_POINTS) {
  const files = new Map(), violations = [];
  const walk = (abs) => { if (files.has(abs)) return; const rel = relative(root, abs);
    if (!existsSync(abs)) { violations.push({ file: rel, kind: 'MISSING_FILE' }); return; }
    const src = readFileSync(abs, 'utf8'), specs = [...src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    files.set(abs, { rel, sha256: sha(src), imports: specs });
    if (!ALLOWED_DIR.test(rel)) violations.push({ file: rel, kind: 'FILE_OUTSIDE_INFERENCE_DIRECTORIES' });
    for (const s of specs) {
      if (s === 'node:crypto' || (rel === HOST && HOST_NODE.has(s))) continue;
      if (!s.startsWith('.')) { violations.push({ file: rel, kind: 'FORBIDDEN_IMPORT', value: s }); continue; }
      const target = resolve(dirname(abs), s), trel = relative(root, target);
      if (trel.startsWith('..') || !ALLOWED_DIR.test(trel)) { violations.push({ file: rel, kind: 'IMPORT_LEAVES_INFERENCE_DIRECTORIES', value: s }); continue; }
      walk(target);
    }
    if (rel !== HOST) for (const t of new Set([...src.matchAll(TOKEN)].map((m) => m[1].replace(/\s*\($/, '(')))) violations.push({ file: rel, kind: 'FORBIDDEN_TOKEN', value: t });
  };
  for (const e of entries) walk(resolve(root, e));
  const list = [...files.values()].sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return { rule: 'inference closure stays inside kernel/, adapters/, api/; node:crypto everywhere; node:fs/path/url in api/host.mjs only; no file/network/clock/random/env/process token outside the host', entryPoints: entries, files: list, fileCount: list.length,
    closureSha256: sha(list.map((f) => `${f.rel}:${f.sha256}`).join('\n')), violations, evaluatorFree: violations.length === 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--root'), LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), root = i > 0 ? resolve(process.argv[i + 1]) : LANE, r = auditInferenceGraph(root);
  console.log(JSON.stringify({ root: i > 0 ? 'explicit' : 'working lane', fileCount: r.fileCount, files: r.files.map((f) => f.rel), closureSha256: r.closureSha256, violations: r.violations, evaluatorFree: r.evaluatorFree }, null, 1));
  if (!r.evaluatorFree) process.exitCode = 1;
}
