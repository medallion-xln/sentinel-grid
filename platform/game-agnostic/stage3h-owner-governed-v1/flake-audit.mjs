// Phase 2: audit of the intermittent lane-test failure (tests.mjs test 3) observed on 2026-10-20. Writes
// evidence/flake-audit.json (wx). Method: (1) preserve the original record; (2) static scan of every module test 3
// executes for nondeterminism sources and classify which can throw; (3) controlled reproduction of the candidate
// mechanism under induced CPU contention (development worlds only); (4) impact matrix. The 1,000 ms limit is unchanged.
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { cpus, loadavg, totalmem } from 'node:os';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

function importClosure(entry) {
  const seen = new Set(), stack = [resolve(entry)];
  while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(?:import|export)\s[^'"`]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) stack.push(resolve(dirname(f), m[1])); }
  return [...seen].sort();
}
const SOURCES = /performance\.now\(|Date\.now\(|new Date\(|Math\.random\(|process\.hrtime|setTimeout\(|setInterval\(|randomUUID|getRandomValues|randomBytes|process\.env/g;
function staticScan() {
  const files = [...new Set([...importClosure(resolve(LANE, 'connector.mjs')), ...importClosure(resolve(GA, 'stage3h1d-development/confirm-core.mjs'))])];
  const hits = [];
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => { for (const m of line.matchAll(SOURCES)) hits.push({ file: relative(GA, f), line: i + 1, source: m[0], text: line.trim().slice(0, 160) }); });
  const CLASS = { 'stage3h-owner-governed-v1/connector.mjs': 'CLOCK_ASSERTION_THROWS_IN_TEST3_PATH (nativeLock ok(elapsedMs <= 1000))', 'stage3h-final-review-handoff/amendments/v3/runner.mjs': 'CLOCK_ASSERTION_NOT_IN_TEST3_PATH (V3 lockFrozenPolicies; used by test 2)', 'stage3h-canonical-v1/adapters.mjs': 'LATENCY_RECORDED_NOT_ASSERTED', 'stage3h-canonical-v1/baseline.mjs': 'LATENCY_RECORDED_NOT_ASSERTED', 'src/stage3f/prediction-reliability-v1.js': 'LATENCY_HELPER_RETURNS_MS_NO_ASSERTION', 'src/stage3f/world-state-v1.js': 'DETERMINISTIC_PARSE_OF_GIVEN_STRING_NOT_A_CLOCK_READ' };
  const classified = hits.map((h) => ({ ...h, class: CLASS[h.file] ?? 'UNCLASSIFIED' }));
  return { modulesScanned: files.length, nondeterminismSites: classified, unclassified: classified.filter((h) => h.class === 'UNCLASSIFIED').length, throwCapableInTest3Path: classified.filter((h) => h.class.startsWith('CLOCK_ASSERTION_THROWS')).map((h) => h.file + ':' + h.line) };
}
function workload(label) {
  // A child process running test 3's exact workload; reports every error instead of stopping at the first.
  const code = `
    import { nativeRow } from ${JSON.stringify(resolve(LANE, 'connector.mjs'))};
    import { evaluateCombo } from ${JSON.stringify(resolve(GA, 'stage3h1d-development/confirm-core.mjs'))};
    import { combinations } from ${JSON.stringify(resolve(GA, 'stage3h-canonical-v1/plan.mjs'))};
    const dev = combinations().map(({ panel, ...c }) => c), pick = [...dev.filter(c => c.horizonBand === 'H0').slice(0, 8), ...dev.filter(c => c.horizonBand === 'H2').slice(0, 8)];
    const errors = [], lockMs = []; let mismatches = 0;
    for (let rep = 0; rep < 3; rep++) for (const c of pick) {
      try { const r = nativeRow({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set(), twins: false }), ref = evaluateCombo({ panel: 'DEV', ...c }, new Set());
        lockMs.push(r.row.compute.elapsedMs);
        const s = ref.row.selections; if (JSON.stringify(r.row.selections) !== JSON.stringify({ R: s.HORIZON_ROUTED, B: s.S0, N: s.NEXUS_ELSE_S0 }) || r.row.metrics.R.nreg !== ref.row.scores.HORIZON_ROUTED.normalizedRegret) mismatches++;
      } catch (e) { errors.push(e.message); }
    }
    lockMs.sort((a, b) => a - b);
    console.log(JSON.stringify({ runs: 48, errors, mismatches, lockMsMax: lockMs.at(-1) ?? null, lockMsP50: lockMs[Math.floor(lockMs.length / 2)] ?? null }));`;
  return new Promise((ok) => { const p = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d)); p.on('close', () => ok({ label, ...(() => { try { return JSON.parse(out.trim().split('\n').pop()); } catch { return { parseError: (out + err).slice(-400) }; } })() })); });
}
function hogs(n) { const ps = []; for (let i = 0; i < n; i++) ps.push(spawn(process.execPath, ['-e', 'const end=Date.now()+900000;while(Date.now()<end){Math.sqrt(Math.random())}'], { stdio: 'ignore' })); return ps; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const scan = staticScan(), cores = cpus().length;
  const idle = await workload('NO_INDUCED_LOAD');
  const procs = hogs(cores * 3); await new Promise((r) => setTimeout(r, 1500)); const loadDuring = loadavg();
  const loaded = await workload('INDUCED_LOAD_' + cores * 3 + '_BUSY_PROCESSES');
  for (const p of procs) p.kill('SIGKILL');
  const computeErrors = (loaded.errors ?? []).filter((e) => e.includes('COMPUTE_LIMIT')).length, otherErrors = [...(idle.errors ?? []), ...(loaded.errors ?? [])].filter((e) => !e.includes('COMPUTE_LIMIT'));
  const out = {
    schema: 'STAGE3H_OWNER_GOVERNED_FLAKE_AUDIT_V1', inheritanceHead: inh.head,
    originalFailureRecord: { date: '2026-10-20', test: 'tests.mjs test 3: native rows reproduce the frozen confirmation core (selections and R/B/N scores) on development worlds', observed: 'not ok 3; # pass 10; # fail 1', command: 'node --test --test-reporter=tap tests-v2.mjs | grep ...; node --test --test-reporter=tap tests.mjs | grep -E "^(not ok|# (pass|fail))"', errorText: 'NOT_CAPTURED: the grep filter excluded the error lines', context: 'ran immediately after tests-v2.mjs in the same shell command; other desktop applications were running', subsequentPasses: 'later runs passed; they do not erase or explain the failure and are not used as evidence of absence' },
    staticScan: scan,
    classification: scan.unclassified === 0 && scan.throwCapableInTest3Path.length > 0 ? 'Every nondeterminism site in test 3\'s 72-module path is classified; the only one that can turn a clock reading into a failure is ' + scan.throwCapableInTest3Path.join(', ') + ' (the frozen 1,000 ms S0+Nexus lock assertion). All other test 3 assertions compare deterministic functions of fixed inputs.' : 'CLASSIFICATION_INCOMPLETE',
    reproduction: { cores, totalMemGiB: +(totalmem() / 2 ** 30).toFixed(1), loadAverageDuringInducedLoad: loadDuring, idle, loaded, computeLimitErrorsUnderLoad: computeErrors, nonTimingErrorsAnyCondition: otherErrors },
    rootCause: computeErrors > 0 ? 'REPRODUCED: under CPU contention the frozen 1,000 ms S0+Nexus lock-time assertion throws COMPUTE_LIMIT_OR_SOURCE_MISMATCH; no other failure mode appeared; this is the only clock-dependent throw in the test path' : 'NOT_REPRODUCED_UNDER_INDUCED_LOAD: the only clock-dependent throw site remains the 1,000 ms assertion, but the mechanism was not demonstrated',
    impact: { sourceIntegrity: 'NONE (bound hashes verified independently)', actionLegality: 'NONE (assertion precedes no action; legality checks are deterministic)', deterministicReplay: 'NONE for decisions, truth and metrics; rows record wall-clock compute.elapsedMs, so row-file bytes are not reproducible and replay must exclude timing fields', numericalAnalysis: 'NONE (analysis never reads timing fields)', nuisanceBijection: 'NONE', runtimeTiming: 'YES: an exceedance aborts the replication; its output directory already exists, so the once-only rule forbids a rerun and that replication is lost', registrationValidity: 'NONE' },
    integrityVerdict: computeErrors > 0 && otherErrors.length === 0 ? 'NOT_INTEGRITY_BLOCKED: fail-closed timing abort; cannot yield an incorrect result; execution-environment risk' : otherErrors.length ? 'INTEGRITY_BLOCKED: non-timing errors observed' : 'INTEGRITY_UNRESOLVED',
    timingLimitMs: 1000, timingLimitChanged: false,
    permittedExecutionEnvironment: { runtime: 'exactly the registration-bound Node binary, versions, platform and launch flags (plain `node campaign-*.mjs`, no flags)', host: 'the owner workstation that produced the bound runtime identity', load: 'no other CPU-intensive process; 1-minute load average below 25% of logical cores at start; no concurrent node test or stage writer', power: 'on AC power with sleep inhibited for the run (caffeinate)', process: 'single process, replications A then B sequentially', memory: 'analysis ceiling 1 GiB RSS and 30 min per replication (V3)', network: 'not required', preflight: 'runner preflight on development worlds must show S0+Nexus lock time p99 <= 250 ms and max <= 500 ms before any registered world is generated' },
    authority: 'R0' };
  writeExclusive(resolve(LANE, 'evidence/flake-audit.json'), out);
  console.log(JSON.stringify({ classification: out.classification, sites: scan.nondeterminismSites.map((h) => h.file + ':' + h.line + ' ' + h.source), idle, loaded: { ...loaded, errors: (loaded.errors ?? []).slice(0, 3), errorCount: (loaded.errors ?? []).length }, loadDuring, rootCause: out.rootCause, verdict: out.integrityVerdict }, null, 1));
}
