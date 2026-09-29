import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256 } from '../src/core/determinism.js';
import { readCorpus } from '../scripts/generate-stage3f6p1e-policy-evidence.mjs';
import { CONTINUATION_STEPS, consequenceDepth, horizonStratum, isEligible, stage3g3Evidence } from '../scripts/stage3g3/evidence.mjs';
import { fitMlp, mlpHash, scoreMlp } from '../scripts/stage3g3/scorers.mjs';
import { DIAGNOSTICS, PLAN, PLAN_HASH, PLAN_PATH, SCORERS, SEED_PLAN, STAGE3G12_INHERITANCE } from '../scripts/stage3g3/plan.mjs';
import { SEED_PLAN as G12_SEED_PLAN } from '../scripts/stage3g/plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (f) => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
const DEV = readCorpus().filter((r) => r.partition === 'DEV' && isEligible(r));
const byHorizon = (h, n) => DEV.filter((r) => r.horizon === h).slice(0, n);

test('1. plan, seeds and inheritance are bound; no prior seed is reused', () => {
  const file = json(PLAN_PATH); assert.equal(file.planHash, PLAN_HASH);
  assert.equal(sha256(PLAN), PLAN_HASH);
  const all = [...SEED_PLAN.declared.HOLDOUT, ...SEED_PLAN.declared.OOD, ...SEED_PLAN.reservedForLaterStage3G.HOLDOUT, ...SEED_PLAN.reservedForLaterStage3G.OOD];
  for (const s of all) assert.ok(!SEED_PLAN.priorSeedSpaces.includes(s), `seed ${s} is fresh`);
  for (const s of [...G12_SEED_PLAN.declared.HOLDOUT, ...G12_SEED_PLAN.declared.OOD, 3023, 3033, 2033]) assert.ok(SEED_PLAN.priorSeedSpaces.includes(s));
  const g12 = json(STAGE3G12_INHERITANCE.CERTIFICATE_FILE);
  assert.equal(g12.certificationHash, STAGE3G12_INHERITANCE.CERTIFICATION_HASH); assert.equal(g12.status, 'PASS');
  assert.equal(g12.representation.REPRESENTATION_GAP_CLOSED, true); assert.equal(g12.representation.TRANSITION_PREDICTION_NOW_JUSTIFIED, false);
  assert.deepEqual(PLAN.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
  for (const d of Object.values(DIAGNOSTICS)) assert.equal(d.class, 'PRIVILEGED_UPPER_BOUND');
  assert.ok(['TYPE', 'CANDIDATE', 'GEOMETRY', 'GP', 'PAIRS'].every((b) => SCORERS.NEW_INTERACTION.spec.main.includes(b)));
});

test('2. rollout fidelity: the replayed oracle branch reproduces the stored label totals and the one-step values', () => {
  for (const h of [1, 3]) {
    for (const row of byHorizon(h, 12)) {
      const ev = stage3g3Evidence(row, { integrity: false });
      for (const c of ev.candidates) { assert.equal(c.T[h], row.actions[c.key].s, `h${h} T_${h + 1} = label total`); assert.equal(c.T[0], row.actions[c.key].i); }
      assert.equal(ev.rolloutFidelity.equal, ev.rolloutFidelity.checked);
    }
  }
});

test('3. label-leak guard: for label horizon h, T_{h+1} IS the label, so PARTIAL_k excludes those rows', () => {
  const row = byHorizon(1, 1)[0]; const ev = stage3g3Evidence(row, { integrity: false });
  const top = Math.max(...ev.candidates.map((c) => c.T[1]));
  assert.ok(ev.candidates.every((c) => (c.T[1] === top) === (c.o === 1)), 'T_2 ranks exactly the optimal set for a horizon-1 row');
  assert.match(PLAN.horizons.labelLeakGuard, /PARTIAL_k/);
  for (const k of [2, 3, 4]) assert.match(DIAGNOSTICS[`D_H${k}`].fitRows, new RegExp(`PARTIAL_${k}`));
});

test('4. consequence depth and diagnostic horizon strata', () => {
  const mk = (rows) => rows.map(([o, ...T]) => ({ o, T }));
  assert.equal(consequenceDepth(mk([[1, 5, 5, 5, 5, 5], [0, 1, 9, 9, 9, 9]])), 0);
  assert.equal(consequenceDepth(mk([[1, 1, 9, 9, 9, 9], [0, 5, 5, 5, 5, 5]])), 1);
  assert.equal(consequenceDepth(mk([[1, 1, 1, 9, 9, 9], [0, 5, 5, 5, 5, 5]])), 2);
  assert.equal(consequenceDepth(mk([[1, 1, 1, 1, 1, 1], [0, 5, 5, 5, 5, 5]])), CONTINUATION_STEPS + 1);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(horizonStratum), ['H0', 'H1', 'H2', 'H3', 'H3', 'H4']);
  for (const row of byHorizon(3, 8)) { const ev = stage3g3Evidence(row, { integrity: false }); assert.ok(ev.consequenceDepth <= 3, 'd never exceeds the label horizon'); }
});

test('5. temporal and option features are D4-equivariant and the Stage 3G.2 integrity probes still hold', () => {
  const rows = DEV.filter((r) => r.equivariance !== null && r.horizon >= 3).slice(0, 4);
  for (const row of rows) {
    const ev = stage3g3Evidence(row);
    assert.ok(Object.values(ev.twinTemporal).every((v) => v === 1));
    assert.equal(ev.idPermutationNew, 1); assert.equal(ev.poisonInvariant, 1); assert.equal(ev.newScanHits, 0);
  }
});

test('6. the small nonlinear control is deterministic and scores candidates independently of their order', () => {
  const groups = []; for (let g = 0; g < 40; g += 1) { const X = [0, 1, 2].map((i) => [i === g % 3 ? 1 : 0, (g * 7 + i) % 5, (g + i) % 2]); groups.push({ X, y: X.map((x) => (x[0] === 1 ? 1 : 0)) }); }
  const a = fitMlp(groups, 8, { iterations: 30, learningRate: 0.05, beta1: 0.9, beta2: 0.999, epsilon: 1e-8, l2: 1e-4, seed: 'T' });
  const b = fitMlp(groups, 8, { iterations: 30, learningRate: 0.05, beta1: 0.9, beta2: 0.999, epsilon: 1e-8, l2: 1e-4, seed: 'T' });
  assert.equal(mlpHash(a), mlpHash(b));
  const X = groups[0].X; const s = scoreMlp(a, X).scores; const r = scoreMlp(a, [...X].reverse()).scores.reverse();
  assert.deepEqual(r, s);
  assert.ok(!/\*\*/.test(readFileSync(path.join(root, 'scripts/stage3g3/scorers.mjs'), 'utf8').replace(/\/\*\*/g, '')), 'no exponent operator (canonical runtime)');
});

test('7. Stage 3G.3 scripts install the check-mode guard; the Stage 3G.1/3G.2 top-level script set is untouched', () => {
  for (const f of ['plan-cli.mjs', 'generate-sealed.mjs', 'certify.mjs']) {
    const s = readFileSync(path.join(root, 'scripts/stage3g3', f), 'utf8');
    assert.match(s, /import \{[^}]*enforceCheckModeReadOnly[^}]*\} from '\.\.\/certification\/check-mode-guard\.mjs'/, f);
    assert.match(s, /enforceCheckModeReadOnly\(\{ checkOnly/, f);
  }
  const top = readdirSync(path.join(root, 'scripts')).filter((f) => /stage3g/.test(f) && f.endsWith('.mjs')).sort();
  assert.deepEqual(top, ['certify-stage3g-predictive-integrity.mjs', 'generate-stage3g-sealed.mjs', 'stage3g-plan.mjs']);
});

test('8. privileged futures never reach a runtime-facing contract', () => {
  for (const f of ['src/stage3g/observable-entity-state-v1.js', 'src/stage3g/action-semantics-v1.js', 'src/stage3g/prediction-lifecycle-v1.js', 'src/stage3g/epistemic-provenance-v1.js']) {
    const s = readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/stage3g3|counterfactual-symmetric|counterfactual-v2|reward-v2/.test(s), f);
  }
});
