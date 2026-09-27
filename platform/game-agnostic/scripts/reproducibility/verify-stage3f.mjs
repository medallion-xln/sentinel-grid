#!/usr/bin/env node
/* Canonical Stage 3F reproducibility procedure (one command per phase, from a clean clone).
 *
 *   node scripts/reproducibility/verify-stage3f.mjs --rebuild-evidence   rebuild every gitignored payload, verify hashes
 *   node scripts/reproducibility/verify-stage3f.mjs --check              run every Stage 3F certifier --check
 *   node scripts/reproducibility/verify-stage3f.mjs --all                both, in that order
 *   node scripts/reproducibility/verify-stage3f.mjs --verify-evidence    hash-verify existing payloads only (no rebuild)
 * Options:
 *   --native          run each check under the host's own Math (diagnostic; not the certification profile). The
 *                     check's own process uses host Math; its predecessor checks and tests run canonically, so
 *                     each stage's own numerical sensitivity is measured without a cascade of predecessor failures.
 *                     Evidence steps run entirely under host Math.
 *   --only=ID,ID      restrict to these evidence / check ids
 *   --jobs=N          parallel evidence steps (default: min(4, CPUs))
 *   --capture         record certificate payloads serialised by each check (for stored-vs-recomputed diffs)
 *   --pure-canonical  ignore declared record profiles: run every check under the canonical profile exactly
 *   --label=NAME      name for this run's log directory and report (default: the mode)
 *   --report=PATH     where to write the JSON report (default build/reproducibility/report-<label>.json)
 *
 * Every child process runs with SENTINEL_READONLY=1: a verification can never change a tracked file. The run ends
 * by asserting `git status --porcelain` is unchanged. The report lives under build/ (gitignored).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { CHECKS, EVIDENCE } from './stage3f-chain.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.SENTINEL_GA_ROOT ?? path.join(here, '..', '..'));
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const flag = (name) => process.argv.includes(`--${name}`);
const native = flag('native');
const only = arg('only')?.split(',').filter(Boolean) ?? null;
const jobs = Number(arg('jobs') ?? Math.min(4, os.cpus().length));
const doRebuild = flag('rebuild-evidence') || flag('all');
const verifyOnly = flag('verify-evidence');
const doCheck = flag('check') || flag('all');
if (!doRebuild && !doCheck && !verifyOnly) { process.stderr.write('usage: --rebuild-evidence | --check | --all  [--native] [--only=..] [--jobs=N] [--capture]\n'); process.exit(2); }
const mode = native ? 'native' : 'canonical';
const label = arg('label') ?? mode;
if (!/^[a-z0-9-]+$/.test(label)) { process.stderr.write('--label must match [a-z0-9-]+\n'); process.exit(2); }
const runDir = path.join(root, 'build', 'reproducibility', `run-${label}`);
const reportPath = path.resolve(arg('report') ?? path.join(root, 'build', 'reproducibility', `report-${label}.json`));
rmSync(runDir, { recursive: true, force: true });
mkdirSync(runDir, { recursive: true });
const hex = (b) => createHash('sha256').update(b).digest('hex');
const log = (m) => process.stderr.write(`[verify-stage3f] ${m}\n`);

const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const statusBefore = git('status', '--porcelain', '--untracked-files=no').stdout;
const head = git('rev-parse', 'HEAD').stdout.trim();

const runtimeUrl = pathToFileURL(path.join(here, 'canonical-runtime.mjs')).href;
function childEnv(logDir, topOnly = false, powModel = null) {
  const env = { ...process.env, SENTINEL_READONLY: '1', SENTINEL_GA_ROOT: root, SENTINEL_REPRO_LOG: logDir };
  if (powModel) env.SENTINEL_POW_MODEL = powModel; else delete env.SENTINEL_POW_MODEL;
  if (flag('capture')) env.SENTINEL_REPRO_CAPTURE = '1';
  const options = (env.NODE_OPTIONS ?? '').split(/\s+/).filter((o) => o && !o.includes('canonical-runtime.mjs'));
  options.push(`--import=${runtimeUrl}`); // always: the read-only guard applies in every mode
  // Historical certifiers parse TAP summaries from `node --test`; Node >= 23 defaults to the spec reporter.
  if (!options.some((o) => o.startsWith('--test-reporter'))) options.push('--test-reporter=tap');
  if (native) env.SENTINEL_NUMERICS = topOnly ? 'native-top' : 'native'; else delete env.SENTINEL_NUMERICS;
  env.NODE_OPTIONS = options.join(' ');
  return env;
}
function exec(command, logDir, topOnly = false, powModel = null) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, { cwd: root, shell: true, env: childEnv(logDir, topOnly, powModel) });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ command, code, seconds: (Date.now() - started) / 1000, stdout, stderr }));
  });
}
/** The last complete top-level JSON object printed on stdout (checks print exactly one summary object). */
function lastJson(text) {
  const t = text.trim();
  let found = null;
  for (let i = t.indexOf('{'); i >= 0; i = t.indexOf('{', i + 1)) {
    if (i > 0 && t[i - 1] !== '\n') continue;
    try { found = JSON.parse(t.slice(i)); break; } catch { /* not the trailing object */ }
  }
  return found;
}
function events(logDir, ownScript = null) {
  const out = { processes: 0, blocked: [], identicalSkipped: 0, captured: [], own: [] };
  if (!existsSync(logDir)) return out;
  for (const f of readdirSync(logDir).filter((x) => x.endsWith('.json'))) {
    const e = JSON.parse(readFileSync(path.join(logDir, f), 'utf8'));
    out.processes += 1;
    if (ownScript !== null && e.script === ownScript) out.own.push(...e.events.map((ev) => ({ event: ev.event, file: ev.file })));
    for (const ev of e.events) { if (ev.event === 'TRACKED_MUTATION_BLOCKED') out.blocked.push(ev); else out.identicalSkipped += 1; }
    for (const c of e.captured ?? []) out.captured.push({ script: e.script, argv: e.argv, payload: c });
  }
  return out;
}
function payloadStatus(payload) {
  const manifestPath = payload.replace(/\.jsonl\.gz$/, '-manifest.json');
  const manifest = JSON.parse(readFileSync(path.join(root, manifestPath), 'utf8'));
  const expected = String(manifest.contentHash ?? manifest.corpusDigest).replace(/^sha256:/, ''); // 3F.6 names it corpusDigest
  if (!existsSync(path.join(root, payload))) return { payload, manifest: manifestPath, expected, actual: null, reproduced: false };
  const actual = hex(gunzipSync(readFileSync(path.join(root, payload))));
  return { payload, manifest: manifestPath, expected, actual, reproduced: actual === expected };
}

const report = { schemaVersion: 1, procedure: 'STAGE3F_CANONICAL_REPRODUCIBILITY_PROCEDURE_V1', mode, head,
  numericsProfile: native ? 'HOST_NATIVE' : 'SENTINEL_CANONICAL_NUMERICS_V1', pureCanonical: !native && flag('pure-canonical'),
  host: { platform: process.platform, arch: process.arch, node: process.version, v8: process.versions.v8, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model ?? null },
  evidence: [], checks: [] };

/* ------------------------------------------------------------- evidence */
if (doRebuild) {
  const steps = EVIDENCE.filter((s) => only === null || only.includes(s.id));
  const done = new Map(); const running = new Map();
  const ready = (s) => s.after.every((a) => done.has(a) || !steps.some((x) => x.id === a));
  const runStep = async (s) => {
    const logDir = path.join(runDir, 'evidence', s.id);
    const results = [];
    for (const r of s.run) {
      if (typeof r === 'string') results.push(await exec(r, logDir));
      else { results.push(...await Promise.all(r.parallel.map((c) => exec(c, logDir)))); results.push(await exec(r.then, logDir)); }
    }
    const payloads = s.payloads.map(payloadStatus);
    const ev = events(logDir);
    const ok = results.every((x) => x.code === 0) && payloads.every((p) => p.reproduced) && ev.blocked.length === 0;
    log(`${ok ? 'OK  ' : 'FAIL'} evidence ${s.id} (${results.reduce((a, x) => a + x.seconds, 0).toFixed(0)}s)`);
    return { id: s.id, status: ok ? 'BYTE_EXACT' : 'NOT_REPRODUCED', exitCodes: results.map((x) => x.code), payloads,
      trackedMutationsBlocked: ev.blocked, stderrTail: ok ? undefined : results.map((x) => x.stderr.slice(-600)).join('\n') };
  };
  while (done.size < steps.length) {
    for (const s of steps) if (!done.has(s.id) && !running.has(s.id) && running.size < jobs && ready(s)) running.set(s.id, runStep(s).then((r) => { done.set(s.id, r); running.delete(s.id); }));
    if (running.size === 0) break;
    await Promise.race(running.values());
  }
  report.evidence = steps.map((s) => done.get(s.id) ?? { id: s.id, status: 'NOT_RUN' });
}

if (verifyOnly) {
  report.evidence = EVIDENCE.filter((s) => only === null || only.includes(s.id)).map((s) => {
    const payloads = s.payloads.map(payloadStatus);
    const ok = payloads.every((p) => p.reproduced);
    log(`${ok ? 'OK  ' : 'FAIL'} evidence ${s.id} (verify only)`);
    return { id: s.id, status: ok ? 'BYTE_EXACT' : 'NOT_REPRODUCED', verifiedOnly: true, payloads, trackedMutationsBlocked: [] };
  });
}

/* ---------------------------------------------------------------- checks */
if (doCheck) {
  for (const c of CHECKS.filter((x) => only === null || only.includes(x.id))) {
    const logDir = path.join(runDir, 'checks', c.id);
    const powModel = !native && !flag('pure-canonical') ? (c.recordProfile?.powModel ?? null) : null;
    const r = await exec(c.run, logDir, true, powModel);
    const out = lastJson(r.stdout);
    const ev = events(logDir, c.run.split(' ')[1]);
    const stored = JSON.parse(readFileSync(path.join(root, c.result), 'utf8'));
    const reproduced = r.code === 0 && out?.reproduced === true; // every Stage 3F check prints { reproduced: boolean }
    const entry = { id: c.id, command: c.run, profile: native ? 'HOST_NATIVE' : powModel ? `CANONICAL+POW_${powModel}` : 'CANONICAL', exitCode: r.code, seconds: r.seconds, reproduced: reproduced && ev.blocked.length === 0,
      storedHash: stored.certificationHash ?? stored.analysisFreezeHash ?? null,
      recomputedHash: out?.recomputedHash ?? out?.certificationHash ?? out?.analysisFreezeHash ?? null,
      status: reproduced && ev.blocked.length === 0 ? 'BYTE_EXACT' : (c.historicalStatus ? 'NOT_REPRODUCED_DOCUMENTED_BEFORE_REMEDIATION' : 'NOT_REPRODUCED'),
      historicalStatus: c.historicalStatus ?? null, fittedModels: c.fittedModels === true,
      trackedMutationsBlocked: ev.blocked, trackedIdenticalWritesSkipped: ev.identicalSkipped, childProcesses: ev.processes,
      ownCheckModeTrackedWrites: ev.own };
    if (flag('capture')) entry.capturedPayloads = ev.captured.length;
    if (!entry.reproduced) entry.stdoutTail = r.stdout.slice(-800);
    report.checks.push(entry);
    log(`${entry.status.padEnd(44)} ${c.id} (${r.seconds.toFixed(0)}s)`);
  }
}

const statusAfter = git('status', '--porcelain', '--untracked-files=no').stdout;
report.trackedTreeUnchanged = statusAfter === statusBefore;
report.summary = {
  evidence: Object.fromEntries(['BYTE_EXACT', 'NOT_REPRODUCED', 'NOT_RUN'].map((s) => [s, report.evidence.filter((e) => e.status === s).length])),
  checks: Object.fromEntries([...new Set(report.checks.map((c) => c.status))].map((s) => [s, report.checks.filter((c) => c.status === s).length])),
  trackedMutationsBlocked: [...report.evidence, ...report.checks].reduce((a, x) => a + (x.trackedMutationsBlocked?.length ?? 0), 0),
};
report.pass = report.trackedTreeUnchanged && report.evidence.every((e) => e.status === 'BYTE_EXACT')
  && report.checks.every((c) => c.status === 'BYTE_EXACT' || c.status === 'NOT_REPRODUCED_DOCUMENTED_BEFORE_REMEDIATION');
mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass: report.pass, mode, head, host: report.host, summary: report.summary, trackedTreeUnchanged: report.trackedTreeUnchanged, report: path.relative(root, reportPath) }, null, 2));
process.exitCode = report.pass ? 0 : 1;
