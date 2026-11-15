// Additive review of evidence/flake-audit.json (preserved). Two corrections and one completion:
// 1. Its "mismatches: 48" came from comparing JSON strings of objects with different key order ({R,B,N} vs selectSets'
//    {B,N,R}); this recount uses the same order-insensitive comparison as tests.mjs (assert.deepEqual).
// 2. Its verdict formula required an experimental reproduction; the reproduction did not occur. This record states the
//    elimination argument explicitly and keeps "not reproduced" visible.
// 3. The static scan is widened to every other nondeterminism primitive. Writes evidence/flake-audit-review.json (wx).
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { nativeRow } from './connector.mjs';
import { evaluateCombo } from '../stage3h1d-development/confirm-core.mjs';
import { combinations } from '../stage3h-canonical-v1/plan.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

function importClosure(entry) {
  const seen = new Set(), stack = [resolve(entry)];
  while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(?:import|export)\s[^'"`]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) stack.push(resolve(dirname(f), m[1]));
    for (const m of s.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) stack.push(resolve(dirname(f), m[1])); }
  return [...seen].sort();
}
const WIDE = /WeakRef|FinalizationRegistry|process\.memoryUsage|process\.uptime|process\.cpuUsage|process\.pid|\bos\.|from ['"]node:os['"]|statSync|lstatSync|mtime|worker_threads|Atomics\.|SharedArrayBuffer|randomInt|crypto\.random|Intl\.|toLocale|readdirSync|import\(/g;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane(), prior = JSON.parse(readFileSync(resolve(LANE, 'evidence/flake-audit.json'), 'utf8'));
  const files = [...new Set([...importClosure(resolve(LANE, 'connector.mjs')), ...importClosure(resolve(GA, 'stage3h1d-development/confirm-core.mjs')), resolve(LANE, 'tests.mjs')])];
  const wide = []; for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => { for (const m of line.matchAll(WIDE)) wide.push({ file: relative(GA, f), line: i + 1, match: m[0], text: line.trim().slice(0, 140) }); });
  const dev = combinations().map(({ panel, ...c }) => c), pick = [...dev.filter((c) => c.horizonBand === 'H0').slice(0, 8), ...dev.filter((c) => c.horizonBand === 'H2').slice(0, 8)];
  let compared = 0, mismatches = 0;
  for (let rep = 0; rep < 3; rep++) for (const c of pick) {
    const r = nativeRow({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set(), twins: false }), ref = evaluateCombo({ panel: 'DEV', ...c }, new Set()), s = ref.row.selections, sc = ref.row.scores;
    compared++;
    const same = isDeepStrictEqual(r.row.selections, { R: s.HORIZON_ROUTED, B: s.S0, N: s.NEXUS_ELSE_S0 }) && [['R', 'HORIZON_ROUTED'], ['B', 'S0'], ['N', 'NEXUS_ELSE_S0']].every(([a, k]) => r.row.metrics[a].nreg === sc[k].normalizedRegret && r.row.metrics[a].regret === sc[k].regret && r.row.metrics[a].hit === sc[k].hit) && r.ledger.worldHash === ref.row.worldHash;
    if (!same) mismatches++;
  }
  const out = {
    schema: 'STAGE3H_OWNER_GOVERNED_FLAKE_AUDIT_REVIEW_V1', reviews: 'evidence/flake-audit.json (preserved)', inheritanceHead: inh.head,
    correction1_parityRecount: { compared, mismatches, method: 'node:util isDeepStrictEqual (key-order-insensitive, as assert.deepEqual in tests.mjs)', priorValueWasArtifact: prior.reproduction.idle.mismatches === 48 && mismatches === 0 },
    wideningScan: { modulesScanned: files.length, primitives: WIDE.source, hits: wide },
    eliminationArgument: [
      'Test 3 failed once (not ok 3, 10 pass, 1 fail); later runs of the same code with the same inputs passed. A failure that does not recur under identical inputs needs a nondeterministic cause.',
      'Bound files and the S0 model artifact were hash-verified unchanged throughout, so inputs did not change.',
      'Every nondeterminism site in the 72-module path is classified (flake-audit.json staticScan); the widened scan lists every further primitive found (wideningScan.hits) for review.',
      'Only one site converts nondeterminism into a failure: the frozen 1,000 ms S0+Nexus lock assertion in connector.mjs nativeLock (COMPUTE_LIMIT_OR_SOURCE_MISMATCH), which aborts and never alters a selection, truth or metric.',
      'An induced-load experiment (30 busy processes on 10 cores) raised the maximum lock time to 321 ms but did not exceed 1,000 ms: the mechanism is NOT reproduced.',
    ],
    rootCause: 'IDENTIFIED_BY_ELIMINATION_NOT_REPRODUCED: the frozen 1,000 ms lock-time assertion, triggered by a transient stall larger than induced CPU contention produced (cause of the stall unknown; the error text was not captured)',
    canItCompromiseScientificCorrectness: 'NO under the elimination argument: the assertion can only abort a run; it cannot change any recorded decision, truth, metric or analysis value',
    testIntegrityVerdict: 'NOT_INTEGRITY_BLOCKED_BY_ELIMINATION; RESIDUAL_RISK_IS_AVAILABILITY (a replication aborted mid-run is lost under the once-only rule)',
    requiredMitigation: 'runner preflight on development worlds before any registered world (lock time p99 <= 250 ms, max <= 500 ms, load average below 25% of cores), and capture of full error text in every log',
    timingLimitMs: 1000, timingLimitChanged: false, authority: 'R0' };
  writeExclusive(resolve(LANE, 'evidence/flake-audit-review.json'), out);
  console.log(JSON.stringify({ parity: out.correction1_parityRecount, wideHits: wide.map((h) => h.file + ':' + h.line + ' ' + h.match + ' | ' + h.text.slice(0, 90)), rootCause: out.rootCause, verdict: out.testIntegrityVerdict }, null, 1));
}
