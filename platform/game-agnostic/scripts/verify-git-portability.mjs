#!/usr/bin/env node
/* Git portability proof.
 *
 * Builds an isolated copy containing ONLY Git-tracked files plus the declared commit candidates (never .DS_Store,
 * never generated corpora, never node_modules, never a virtualenv), then runs canonical certification, Stage 3F
 * tests, and the Observatory inside that copy with a filesystem guard watching for ephemeral-path reads.
 *
 * The isolated copy lives under the OS temp directory. That is a test environment, not part of the project: the
 * proof is that the PROJECT never reads an ephemeral path, and the guard's positive control shows it would notice.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const keep = process.argv.includes('--keep');
const packageRelative = path.relative(repositoryRoot, root);

/* Paths that must never enter a commit or the isolated copy. */
export const EXCLUDED_FROM_COMMIT = [
  /(^|\/)\.DS_Store$/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.venv[^/]*(\/|$)/,
  /(^|\/)__pycache__(\/|$)/,
  /evaluation-corpus\.jsonl\.gz$/,
];
const excluded = (relative) => EXCLUDED_FROM_COMMIT.some((pattern) => pattern.test(relative));

const git = (...args) => {
  const result = spawnSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
};

export function commitCandidates() {
  const tracked = git('ls-files').split('\n').filter(Boolean);
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
  const modified = git('diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
  return {
    tracked: tracked.filter((file) => !excluded(file)),
    untracked: untracked.filter((file) => !excluded(file)),
    excludedTracked: tracked.filter(excluded),
    excludedUntracked: untracked.filter(excluded),
    modified: modified.filter((file) => !excluded(file)),
    modifiedExcluded: modified.filter(excluded),
  };
}

function buildIsolatedCopy(files) {
  const copyRoot = mkdtempSync(path.join(os.tmpdir(), 'sentinel-grid-portability-'));
  for (const relative of files) {
    const source = path.join(repositoryRoot, relative);
    if (!existsSync(source)) continue;
    const target = path.join(copyRoot, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target);
  }
  return copyRoot;
}

function runInCopy(copyRoot, logPath, label, command, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: path.join(copyRoot, packageRelative), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', SENTINEL_PORTABILITY_GUARD_LOG: logPath, SENTINEL_PORTABILITY_GUARD_LABEL: label,
      NODE_OPTIONS: `--import=${path.join(copyRoot, packageRelative, 'scripts', 'git-portability-fs-guard.mjs')}` },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const metric = (name) => Number(output.match(new RegExp(`(?:ℹ|#) ${name} (\\d+)`))?.[1] ?? -1);
  return { label, command, exitStatus: result.status, testsPass: metric('pass'), testsFail: metric('fail'),
    tail: output.trim().split('\n').slice(-3).join(' | ').slice(0, 400) };
}

function main() {
  const candidates = commitCandidates();
  const files = [...candidates.tracked, ...candidates.untracked];
  const copyRoot = buildIsolatedCopy(files);
  const logPath = path.join(copyRoot, 'guard-log.jsonl');
  writeFileSync(logPath, '');
  const runs = [];

  runs.push(runInCopy(copyRoot, logPath, 'POSITIVE_CONTROL', 'positive control', ['scripts/git-portability-positive-control.mjs']));
  runs.push(runInCopy(copyRoot, logPath, 'STAGE3F_TESTS', 'node --test (Stage 3D/3E recovery + Stage 3F suites)', ['--test',
    'tests/stage3de-recovery-canonicalization.test.js', 'tests/stage3f-world-state-v1.test.js', 'tests/stage3f1-causal-trace-v1.test.js',
    'tests/stage3f2-environment-calibration-v1.test.js', 'tests/stage3f3-counterfactual-veto-ledger-v1.test.js',
    'tests/stage3f4-shadow-experience-buffer-v1.test.js', 'tests/stage3f5-integrated-live-shadow-v1.test.js',
    'tests/stage3f6-prediction-reliability-v1.test.js', 'tests/stage3f6r-runtime-parity.test.js', 'tests/git-portability.test.js']));
  for (const [label, script] of [['STAGE3F0_CHECK', 'certify-stage3f0-world-state-contract.mjs'], ['STAGE3F1_CHECK', 'certify-stage3f1-causal-trace.mjs'],
    ['STAGE3F2_CHECK', 'certify-stage3f2-environment-calibration.mjs'], ['STAGE3F3_CHECK', 'certify-stage3f3-counterfactual-veto-ledger.mjs'],
    ['STAGE3F4_CHECK', 'certify-stage3f4-shadow-experience-buffer.mjs']]) {
    runs.push(runInCopy(copyRoot, logPath, label, `${script} --check`, [`scripts/${script}`, '--check']));
  }
  runs.push(runInCopy(copyRoot, logPath, 'OBSERVATORY_WORLD', 'observatory --view WORLD', ['scripts/sentinel-observatory-v2.mjs', '--view', 'WORLD']));
  runs.push(runInCopy(copyRoot, logPath, 'OBSERVATORY_PREDICTION', 'observatory --view PREDICTION (no corpus in a fresh clone)',
    ['scripts/sentinel-observatory-v2.mjs', '--view', 'PREDICTION']));

  const guardRecords = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const positiveControl = guardRecords.find((entry) => entry.label === 'POSITIVE_CONTROL');
  const projectRecords = guardRecords.filter((entry) => entry.label !== 'POSITIVE_CONTROL');
  const violations = projectRecords.flatMap((entry) => entry.violations);
  const summary = {
    copyRoot: keep ? copyRoot : '(removed)',
    filesCopied: files.length,
    excludedFromCopy: { tracked: candidates.excludedTracked, untracked: candidates.excludedUntracked },
    nodeModulesRequired: false,
    guardInterceptionVerified: Boolean(positiveControl && positiveControl.violations.length > 0 && positiveControl.selfTestIntercepted),
    positiveControlViolations: positiveControl?.violations ?? [],
    externalTempDependencyCount: violations.length,
    externalTempDependencies: [...new Set(violations)].sort(),
    runs,
    gitOnlyReplayPass: runs.every((run) => run.exitStatus === 0) && violations.length === 0
      && Boolean(positiveControl && positiveControl.violations.length > 0),
  };
  if (!keep) rmSync(copyRoot, { recursive: true, force: true });
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.gitOnlyReplayPass) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
