import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as N from '../src/core/canonical-numerics-v1.js';
import { PINNED_REWRITES, codeOnly, guardSource, nonCanonicalExponentiation } from '../scripts/reproducibility/exponentiation-guard.mjs';
import { classify, diffLeaves, ulpDistance } from '../scripts/reproducibility/certificate-diff.mjs';
import { CHECKS, EVIDENCE } from '../scripts/reproducibility/stage3f-chain.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeUrl = pathToFileURL(path.join(root, 'scripts/reproducibility/canonical-runtime.mjs')).href;
const runChild = (source, env = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', source],
  { cwd: root, encoding: 'utf8', env: { ...process.env, SENTINEL_GA_ROOT: root, NODE_OPTIONS: `--import=${runtimeUrl}`, ...env } });

/* ------------------------------------------------------------- numerics */

test('golden vectors reproduce bit for bit on this host', () => {
  const r = N.verifyGolden();
  assert.equal(r.checked >= 40, true);
  assert.deepEqual(r.failures, []);
});

test('fma rounds once: exact against a BigInt reference, including cancellation', () => {
  assert.equal(N.fma(0.1, 10, -1), 5.551115123125783e-17); // separately rounded: 0
  assert.equal(N.fma(1 + Number.EPSILON, 1 - Number.EPSILON, -1), -(Number.EPSILON * Number.EPSILON));
  assert.equal(N.fma(2, 3, 4), 10);
  assert.equal(N.fma(0, 5, -0), 0);
});

test('exp: IEEE special cases and the contracted-polynomial difference', () => {
  assert.equal(N.exp(0), 1);
  assert.equal(N.exp(1), Math.E);
  assert.equal(N.exp(Infinity), Infinity);
  assert.equal(N.exp(-Infinity), 0);
  assert.ok(Number.isNaN(N.exp(NaN)));
  assert.equal(N.exp(710), Infinity);
  assert.equal(N.exp(-746), 0);
  const fused = N.CANONICAL_NUMERICS_GOLDEN.filter((g) => g[0] === 'exp');
  assert.ok(fused.length >= 4, 'golden exp vectors are the inputs where fused and separate fdlibm differ');
});

test('log / log2: special cases', () => {
  for (const f of [N.log, N.log2]) {
    assert.equal(f(1), 0);
    assert.equal(f(0), -Infinity);
    assert.equal(f(-0), -Infinity);
    assert.ok(Number.isNaN(f(-1)));
    assert.equal(f(Infinity), Infinity);
  }
  assert.equal(N.log2(8), 3);
  assert.equal(N.log2(Number.MIN_VALUE), -1074);
});

test('pow: ECMAScript special cases agree with the engine (exact in every engine)', () => {
  const enginePow = new Function('a', 'b', 'return a ** b'); // deliberate: the engine's own operator, outside the load guard
  const values = [0, -0, 1, -1, 2, -2, 0.5, Infinity, -Infinity, NaN, 5e-324, 3];
  for (const x of values) for (const y of values) {
    if (Number.isFinite(x) && x !== 0 && Number.isFinite(y) && ![0, 1, 2, 0.5, -1].includes(y) && Math.abs(x) !== 1) continue; // general case: not engine-exact
    assert.ok(Object.is(N.pow(x, y), enginePow(x, y)), `pow(${x}, ${y})`);
  }
});

test('pow: correctly rounded values verified with independent 60-digit decimal arithmetic', () => {
  // Each case is one where fdlibm pow (Node <= 24) or glibc pow (Node >= 25 on Linux) returns a neighbouring double.
  assert.equal(N.pow(0.010950210769842927, 0.6666666666666666), 0.049311511986182326);
  assert.equal(N.pow(48.66064794844205, 0.25), 2.6411585438829452);
  assert.equal(N.pow(0.5549189448287218, -7.216831956971466), 70.12168511760555);
  assert.equal(N.pow(47.83717729781313, 8.7931359392079), 589395462523534);
  assert.equal(N.pow(0.25, 1.5), 0.125);
  assert.equal(N.pow(-2, 3), -8);
  assert.equal(N.pow(2, -1074), 5e-324);
  assert.equal(N.pow(1.5, 2000), Infinity);
});

test('the canonical module uses no engine-approximated operation', () => {
  const source = readFileSync(path.join(root, 'src/core/canonical-numerics-v1.js'), 'utf8');
  const code = codeOnly(source);
  assert.equal(/Math\.(exp|log|log2|log10|log1p|expm1|pow|sin|cos|tan|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\s*\(/.test(code), false);
  assert.deepEqual(nonCanonicalExponentiation(source), []);
  assert.equal(/\*\*/.test(code), false);
});

/* ------------------------------------------------------ exponentiation guard */

test('lexer: only real exponentiation counts', () => {
  const src = [
    "const a = b ** c;",
    "const s = 'x ** y'; const t = `** ${'q'} **`; // z ** w",
    "/* p ** q */ const r = /\\*\\*/g;",
    "const sq = v ** 2; const lit = 2 ** 20; const d = v ** 2.5;",
  ].join('\n');
  const found = nonCanonicalExponentiation(src).map((f) => f.line);
  assert.deepEqual(found, [1, 4]);
});

test('guard: pinned rewrite applies exactly once and a new site fails closed', () => {
  const file = 'src/stage3f/decision-rule-v1.js';
  const source = readFileSync(path.join(root, file), 'utf8');
  const pin = PINNED_REWRITES[file];
  const rewritten = guardSource(file, source);
  assert.equal(rewritten.includes(pin.to), true);
  assert.equal(rewritten.includes(pin.from), false);
  assert.throws(() => guardSource('src/new.js', 'export const f = (a, b) => a ** b;'), /non-canonical exponentiation/);
  assert.throws(() => guardSource(file, source.replace(pin.from, 'x')), /expected 1 occurrence/);
});

test('guard: every repository module loads under the guard (the pinned site is the only non-exact `**`)', () => {
  const walk = (d, out = []) => { for (const e of readdirSync(path.join(root, d), { withFileTypes: true })) {
    const p = `${d}/${e.name}`; if (e.isDirectory()) { if (!['build', 'node_modules'].includes(e.name)) walk(p, out); } else if (/\.m?js$/.test(e.name)) out.push(p);
  } return out; };
  const failures = [];
  for (const f of [...walk('src'), ...walk('scripts'), ...walk('tests')]) {
    if (f.startsWith('scripts/reproducibility/')) continue;
    try { guardSource(f, readFileSync(path.join(root, f), 'utf8')); } catch (e) { failures.push(`${f}: ${e.message}`); }
  }
  // Two pre-Stage-3F scripts carry `**` inside markdown text the lexer correctly ignores; nothing may fail.
  assert.deepEqual(failures, []);
});

test('pinned rewrite targets the committed file bytes', () => {
  const { createHash } = globalThis.process.getBuiltinModule('node:crypto');
  for (const [file, pin] of Object.entries(PINNED_REWRITES)) {
    assert.equal(createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex'), pin.sha256, file);
  }
});

/* ---------------------------------------------------------------- runtime */

test('runtime installs the profile and routes `**` through canonical pow in pinned modules', () => {
  const r = runChild(`
    import * as N from ${JSON.stringify(pathToFileURL(path.join(root, 'src/core/canonical-numerics-v1.js')).href)};
    const { calibrateProbabilities } = await import(${JSON.stringify(pathToFileURL(path.join(root, 'src/stage3f/decision-rule-v1.js')).href)});
    const { ROUTED_POLICIES } = await import(${JSON.stringify(pathToFileURL(path.join(root, 'src/stage3f/policy-router-v1.js')).href)});
    const [a, b] = ROUTED_POLICIES;
    const probs = Object.fromEntries(ROUTED_POLICIES.map((p) => [p, 0])); probs[a] = 0.010950210769842927; probs[b] = 0.3;
    const got = calibrateProbabilities(probs, [a, b], 1.5)[a];
    const ra = N.pow(probs[a], 1 / 1.5), rb = N.pow(probs[b], 1 / 1.5);
    console.log(JSON.stringify({ exp: Math.exp === N.exp, log: Math.log === N.log, pow: Math.pow === N.pow, calibrated: Object.is(got, ra / (ra + rb)), profile: process.env.SENTINEL_NUMERICS }));
  `);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { exp: true, log: true, pow: true, calibrated: true });
});

test('read-only guard: a differing write to a tracked file is blocked, an identical one is a no-op, untracked passes', () => {
  const logDir = path.join(root, 'build', 'reproducibility', 'test-readonly');
  rmSync(logDir, { recursive: true, force: true });
  const target = path.join(root, 'package.json');
  const before = readFileSync(target);
  const r = runChild(`
    import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
    import { writeFile } from 'node:fs/promises';
    writeFileSync(${JSON.stringify(target)}, 'MUTATED');
    await writeFile(${JSON.stringify(target)}, readFileSync(${JSON.stringify(target)}));
    mkdirSync(${JSON.stringify(logDir)}, { recursive: true });
    writeFileSync(${JSON.stringify(path.join(logDir, 'untracked.txt'))}, 'ok');
  `, { SENTINEL_READONLY: '1', SENTINEL_REPRO_LOG: logDir });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readFileSync(target), before);
  assert.equal(existsSync(path.join(logDir, 'untracked.txt')), true);
  const events = readdirSync(logDir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(path.join(logDir, f), 'utf8')).events);
  assert.deepEqual(events.map((e) => e.event).sort(), ['TRACKED_MUTATION_BLOCKED', 'TRACKED_WRITE_IDENTICAL_SKIPPED']);
  rmSync(logDir, { recursive: true, force: true });
  rmSync(path.join(root, 'build', 'reproducibility', 'blocked-writes'), { recursive: true, force: true });
});

test('native-top: host Math in the checked process, canonical in its children', () => {
  const r = runChild(`
    import { spawnSync } from 'node:child_process';
    const child = spawnSync(process.execPath, ['-e', 'console.log(Math.exp.name)'], { encoding: 'utf8' });
    console.log(JSON.stringify({ own: Math.exp.name, child: child.stdout.trim() }));
  `, { SENTINEL_NUMERICS: 'native-top' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { own: 'exp', child: 'exp' });
  const own = runChild('console.log(String(Math.exp).includes("[native code]"))', { SENTINEL_NUMERICS: 'native-top' });
  assert.equal(own.stdout.trim(), 'true');
  const kid = runChild(`import { spawnSync } from 'node:child_process';
    console.log(spawnSync(process.execPath, ['-e', 'console.log(String(Math.exp).includes("[native code]"))'], { encoding: 'utf8' }).stdout.trim());`, { SENTINEL_NUMERICS: 'native-top' });
  assert.equal(kid.stdout.trim(), 'false');
});

/* ----------------------------------------------------------- chain / diff */

test('the chain covers every Stage 3F certifier and every gitignored Stage 3F payload', () => {
  const certifiers = readdirSync(path.join(root, 'scripts')).filter((f) => /^certify-stage3f(\d|6[a-z0-9]*)?-.*\.mjs$/.test(f) && !f.includes('stage3frp'));
  for (const f of certifiers) assert.ok(CHECKS.some((c) => c.run.includes(`scripts/${f}`)), `missing check ${f}`);
  const gitignore = readFileSync(path.join(root, '..', '..', '.gitignore'), 'utf8').split('\n')
    .filter((l) => /^platform\/game-agnostic\/artifacts\/stage3f.*\.jsonl\.gz$/.test(l)).map((l) => l.replace('platform/game-agnostic/', ''));
  for (const payload of gitignore) assert.ok(EVIDENCE.some((e) => e.payloads.includes(payload)), `missing evidence ${payload}`);
  const ids = new Set(EVIDENCE.map((e) => e.id));
  for (const e of EVIDENCE) for (const a of e.after) assert.ok(ids.has(a), `${e.id} depends on unknown ${a}`);
});

test('runner pins every child process to the runner Node binary', () => {
  const dir = path.join(root, 'build', 'reproducibility', 'test-node-pin');
  rmSync(dir, { recursive: true, force: true });
  // A decoy `node` first on PATH: any child resolved by name instead of pinned would fail.
  mkdirSync(path.join(dir, 'bin'), { recursive: true });
  writeFileSync(path.join(dir, 'bin', 'node'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/reproducibility/verify-stage3f.mjs'), '--check', '--only=3F0', '--label=test-node-pin', `--report=${path.join(dir, 'r.json')}`],
    { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(dir, 'bin')}${path.delimiter}${process.env.PATH}`, SENTINEL_GA_ROOT: root } });
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(readFileSync(path.join(dir, 'r.json'), 'utf8'));
  assert.equal(report.checks[0].status, 'BYTE_EXACT');
  assert.equal(report.trackedTreeUnchanged, true);
  rmSync(dir, { recursive: true, force: true });
  rmSync(path.join(root, 'build', 'reproducibility', 'run-test-node-pin'), { recursive: true, force: true });
});

test('record profiles are rare, explicit and limited to known pow models', () => {
  const declared = CHECKS.filter((c) => c.recordProfile);
  assert.deepEqual(declared.map((c) => c.id), ['3F6D']);
  for (const c of declared) {
    assert.ok(['FDLIBM_FUSED', 'FDLIBM_SEPARATE'].includes(c.recordProfile.powModel));
    assert.ok(c.recordProfile.reason.length > 20);
  }
});

test('runtime honours a declared record pow model and rejects unknown ones', () => {
  const ok = runChild('console.log(Math.pow(0.010950210769842927, 0.6666666666666666))', { SENTINEL_POW_MODEL: 'FDLIBM_SEPARATE' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(Number(ok.stdout.trim()), 0.04931151198618232); // fdlibm, not the correctly rounded 0.049311511986182326
  const bad = runChild('console.log(1)', { SENTINEL_POW_MODEL: 'LIBM' });
  assert.equal(bad.status, 72);
});

test('certificate diff: categories and ULP distance', () => {
  assert.equal(ulpDistance(1, 1 + Number.EPSILON), 1);
  assert.equal(ulpDistance(-0, 0), 0);
  assert.equal(classify('.training.routerHash', 'a', 'b'), 'MODEL_HASH_DIFFERENCE');
  assert.equal(classify('.candidate.weights.w[3]', 1, 2), 'MODEL_PARAMETER_DIFFERENCE');
  assert.equal(classify('.holdout.ece', 0.1, 0.2), 'METRIC_DIFFERENCE');
  assert.equal(classify('.x.evidence', 'ECE 0.07248874758821679 bound', 'ECE 0.07248874758821681 bound'), 'METRIC_DIFFERENCE');
  assert.equal(classify('.classification.primaryResult', 'A', 'B'), 'CLASSIFICATION_DIFFERENCE');
  assert.equal(classify('.roadmap.readyForStage3G', true, false), 'CONCLUSION_DIFFERENCE');
  assert.equal(classify('.certificationHash', 'a', 'b'), 'CERTIFICATE_HASH_DIFFERENCE');
  assert.equal(diffLeaves({ a: [1, 2], b: 'x' }, { a: [1, 2], b: 'x' }).length, 0);
});
