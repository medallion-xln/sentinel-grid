#!/usr/bin/env node
/* Stage 3F reproducibility — root-cause experiments (re-runnable; needs the 3F.6-C and P.1D payloads).
 *
 *   node scripts/reproducibility/root-cause-experiments.mjs [--out=PATH]
 *
 * E1  math-library conformance: the separately rounded fdlibm exp port against this host's Math.exp, and the
 *     fused variant against it (how often clang's arm64 contraction changes a result, and by how much).
 * E2  Stage 3F.6-C DEV refit under host / separate / fused exp, against the stored coreRouterHash and coefficients.
 * E3  symmetric DEV refit (the T-SYM / D-SYM router) under the same three, against the stored T-SYM routerHash.
 * E4  D-SYM CAL temperature grid under each pow model, against the eight stored cross-entropies.
 * Every experiment swaps Math.exp explicitly and restores it; it never writes a repository file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as canonical from '../../src/core/canonical-numerics-v1.js';
import { expFused, expSeparate, pow as powSeparate, powFused } from './fdlibm-variants.mjs';
import { ulpDistance } from './certificate-diff.mjs';

const root = path.resolve(process.env.SENTINEL_GA_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const at = (f) => path.join(root, f);
const json = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const hostExp = Math.exp;
const withExp = (fn, body) => { Math.exp = fn; try { return body(); } finally { Math.exp = hostExp; } };
const EXPS = { HOST_NATIVE: hostExp, FDLIBM_SEPARATE: expSeparate, FDLIBM_FUSED_CANONICAL: expFused };
const coefficientComparison = (fitted, stored) => ({
  bitIdentical: fitted.every((v, i) => Object.is(v, stored[i])),
  maxUlp: Math.max(...fitted.map((v, i) => Math.abs(ulpDistance(v, stored[i])))),
  maxAbs: Math.max(...fitted.map((v, i) => Math.abs(v - stored[i]))),
  maxRel: Math.max(...fitted.map((v, i) => (v === stored[i] ? 0 : Math.abs(v - stored[i]) / Math.max(Math.abs(v), Math.abs(stored[i]))))),
});
function lcg(seed) { let s = BigInt(seed); return () => { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return Number(s >> 11n) / 2 ** 53; }; }

const result = { schemaVersion: 1, experiment: 'STAGE3F_REPRODUCIBILITY_ROOT_CAUSE_V1',
  host: { platform: process.platform, arch: process.arch, node: process.version, v8: process.versions.v8,
    v8FlagUseStdMathPow: spawnSync(process.execPath, ['--v8-options'], { encoding: 'utf8' }).stdout.includes('--use-std-math-pow') } };

/* E1 */
{
  const r = lcg(12345); const n = 300000; let hostMismatch = 0; let fusedDiff = 0; let maxFusedUlp = 0;
  for (let i = 0; i < n; i += 1) {
    const x = (r() * 2 - 1) * [40, 3, 700][i % 3];
    if (!Object.is(expSeparate(x), hostExp(x))) hostMismatch += 1;
    const d = Math.abs(ulpDistance(expSeparate(x), expFused(x))); if (d) { fusedDiff += 1; maxFusedUlp = Math.max(maxFusedUlp, d); }
  }
  result.E1_EXP_CONFORMANCE = { inputs: n, separatePortVsHostMathExpMismatches: hostMismatch, fusedVsSeparateDifferences: fusedDiff,
    fusedVsSeparateRate: fusedDiff / n, fusedVsSeparateMaxUlp: maxFusedUlp,
    reading: hostMismatch === 0 ? 'this host evaluates Math.exp exactly as separately rounded fdlibm' : 'this host does not evaluate Math.exp as separately rounded fdlibm' };
}

/* E2 */
{
  const R = await import('../../src/stage3f/deployable-router-v1.js');
  const { DEPLOYABLE_PROFILES, DeployableProfile } = await import('../../src/stage3f/deployable-feature-contract-v1.js');
  const freeze = json('artifacts/stage3f6c-deployable-router/stage3f6c-evaluation-freeze.json');
  const keys = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort();
  const dev = gunzipSync(readFileSync(at('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((row) => row.partition === 'DEV');
  const X = dev.map((row) => keys.map((k) => row.core[k])); const y = dev.map((row) => row.y);
  result.E2_STAGE3F6C_ROUTER_REFIT = { storedCoreRouterHash: freeze.coreRouterHash, fits: {} };
  for (const [name, fn] of Object.entries(EXPS)) {
    const model = withExp(fn, () => R.fitLogisticRegression(X, y, keys));
    result.E2_STAGE3F6C_ROUTER_REFIT.fits[name] = { routerHash: R.routerHash(model), matchesStored: R.routerHash(model) === freeze.coreRouterHash,
      standardisationIdentical: JSON.stringify(model.mu) === JSON.stringify(freeze.coreWeights.mu) && JSON.stringify(model.sd) === JSON.stringify(freeze.coreWeights.sd),
      coefficients: coefficientComparison(model.w, freeze.coreWeights.w) };
  }
}

/* E3 */
const P = await import('../../src/stage3f/policy-router-v1.js');
const { routerRow, FEATURES } = await import('../stage3f6dsym-freeze.mjs');
const { readCorpus } = await import('../generate-stage3f6p1e-policy-evidence.mjs');
const corpus = readCorpus();
{
  const tsym = json('artifacts/stage3f6tsym-router-value/stage3f6tsym-open-phase-report.json');
  const dsym = json('artifacts/stage3f6dsym-decision-rule/stage3f6dsym-analysis-freeze.json');
  const DEV = corpus.filter((r) => r.partition === 'DEV').map(routerRow);
  result.E3_SYMMETRIC_ROUTER_REFIT = { storedTSymRouterHash: tsym.router.routerHash, fits: {} };
  for (const [name, fn] of Object.entries(EXPS)) {
    const model = withExp(fn, () => P.fitPolicyRouter(DEV, FEATURES));
    result.E3_SYMMETRIC_ROUTER_REFIT.fits[name] = { routerHash: P.policyRouterHash(model), matchesStored: P.policyRouterHash(model) === tsym.router.routerHash,
      coefficients: coefficientComparison(model.W.flat(), dsym.model.W.flat()) };
  }
}

/* E4 */
{
  const D = await import('../../src/stage3f/decision-rule-v1.js');
  const fz = json('artifacts/stage3f6dsym-decision-rule/stage3f6dsym-analysis-freeze.json');
  const model = { family: fz.model.family, policies: P.ROUTED_POLICIES, featureKeys: fz.model.featureKeys, mu: fz.model.mu, sd: fz.model.sd, W: fz.model.W };
  const CAL = corpus.filter((r) => r.partition === 'CAL').map(routerRow);
  const scored = withExp(expFused, () => CAL.map((row) => P.scorePolicies(model, row)));
  const POWS = { FDLIBM_SEPARATE_V8_12: powSeparate, FDLIBM_FUSED: powFused, CORRECTLY_ROUNDED_CANONICAL: canonical.pow, HOST_STAR_STAR: (a, b) => a ** b };
  const RP = P.ROUTED_POLICIES;
  result.E4_DSYM_TEMPERATURE_GRID = { storedGrid: fz.cal.temperatureGrid, powModels: {} };
  for (const [name, pw] of Object.entries(POWS)) {
    const grid = fz.cal.temperatureGrid.map(({ T, crossEntropy }) => {
      const values = CAL.map((row, i) => {
        const s = scored[i];
        const raised = Object.fromEntries(RP.map((p) => [p, s.available.includes(p) && s.probabilities[p] > 0 ? pw(s.probabilities[p], 1 / T) : 0]));
        const total = Object.values(raised).reduce((a, b) => a + b, 0);
        const w = D.regimeWeights(row);
        return -RP.reduce((acc, p) => acc + (w[p] > 0 ? w[p] * canonical.log(Math.max(1e-12, total > 0 ? raised[p] / total : 0)) : 0), 0);
      });
      const v = values.reduce((a, b) => a + b, 0) / values.length;
      return { T, reproduced: Object.is(v, crossEntropy), ulpFromStored: ulpDistance(crossEntropy, v) };
    });
    result.E4_DSYM_TEMPERATURE_GRID.powModels[name] = { allEightReproduced: grid.every((g) => g.reproduced), grid };
  }
}

result.conclusion = {
  exp: result.E2_STAGE3F6C_ROUTER_REFIT.fits.FDLIBM_FUSED_CANONICAL.matchesStored && result.E3_SYMMETRIC_ROUTER_REFIT.fits.FDLIBM_FUSED_CANONICAL.matchesStored
    ? 'Stored fitted-model hashes are reproduced bit for bit by fdlibm exp evaluated with fused multiply-add, and by nothing else tested.'
    : 'Fused fdlibm exp does NOT reproduce the stored fitted-model hashes on this run.',
  pow: result.E4_DSYM_TEMPERATURE_GRID.powModels.CORRECTLY_ROUNDED_CANONICAL.allEightReproduced
    ? 'The stored D-SYM temperature grid is reproduced by correctly rounded pow; fdlibm pow (V8 <= 13) does not reproduce it.'
    : 'Correctly rounded pow does NOT reproduce the stored D-SYM temperature grid on this run.',
};
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
if (out) writeFileSync(path.resolve(out), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, (k, v) => (k === 'storedGrid' || k === 'grid' ? undefined : v), 2));
