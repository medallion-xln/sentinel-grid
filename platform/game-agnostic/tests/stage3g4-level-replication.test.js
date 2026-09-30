import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256, stableStringify } from '../src/core/determinism.js';
import { forgeWorldAdapter } from '../src/forge/adapter.js';
import { OBSERVABLE_OPTION_FEATURES_SCHEMA, OBSERVABLE_OPTION_FEATURES_SCHEMA_HASH, OBS_OPTION_COLUMNS, observableOptionFeatures } from '../src/stage3g/observable-option-features-v1.js';
import { readCorpus } from '../scripts/generate-stage3f6p1e-policy-evidence.mjs';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { isEligible, stage3g4Evidence } from '../scripts/stage3g4/evidence.mjs';
import { FIT_MANIFEST_PATH, HORIZON_BANDS, LEVELS, PLAN, PLAN_HASH, PLAN_PATH, PRIMARY_MODELS, RULES, SEED_PLAN } from '../scripts/stage3g4/plan.mjs';
import { DIAGNOSTICS as G3_DIAGNOSTICS, SCORERS as G3_SCORERS, SEED_PLAN as G3_SEED_PLAN } from '../scripts/stage3g3/plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (f) => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
const DEV = readCorpus().filter((r) => r.partition === 'DEV' && isEligible(r));

test('1. plan bound; seed families are the reserved Stage 3G.3 seeds, crossed with every level; 5023/5033 untouched; fit seed fresh', () => {
  assert.equal(json(PLAN_PATH).planHash, PLAN_HASH); assert.equal(sha256(PLAN), PLAN_HASH);
  assert.deepEqual(SEED_PLAN.families, { A: 5022, B: 5032 });
  assert.ok(G3_SEED_PLAN.reservedForLaterStage3G.HOLDOUT.includes(5022) && G3_SEED_PLAN.reservedForLaterStage3G.OOD.includes(5032));
  for (const s of [5022, 5032, 6011]) assert.ok(!SEED_PLAN.priorSeedSpaces.includes(s), `${s} unused before`);
  assert.deepEqual(SEED_PLAN.stillReserved.stage3g3, [5023, 5033]);
  assert.deepEqual(LEVELS, [0, 1, 2, 3, 4, 5, 6, 7]); assert.deepEqual(HORIZON_BANDS, ['H0', 'H1', 'H2', 'H3', 'H4']);
  assert.deepEqual(PLAN.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
});

test('2. level-balance audit of the open fit set: every (level, band) cell holds its quota', () => {
  const m = json(FIT_MANIFEST_PATH); const cells = m.stats.STAGE3G4_FIT.cells;
  assert.equal(Object.keys(cells).length, LEVELS.length * HORIZON_BANDS.length);
  for (const c of Object.values(cells)) assert.equal(c.admitted, SEED_PLAN.quotas.fitPerLevelBand);
  assert.equal(m.rows, LEVELS.length * HORIZON_BANDS.length * SEED_PLAN.quotas.fitPerLevelBand);
  assert.deepEqual(m.seedAudit.priorRowOverlap, []);
});

test('3. the frozen Stage 3G.3 diagnostics are reused unchanged, and the label-leak guard is kept', () => {
  assert.deepEqual(PRIMARY_MODELS.reused.NEW_LINEAR, G3_SCORERS.NEW_LINEAR.spec); assert.deepEqual(PRIMARY_MODELS.reused.NEW_INTERACTION, G3_SCORERS.NEW_INTERACTION.spec);
  for (const k of ['D_ONE_STEP', 'D_H2', 'D_H3', 'D_H4', 'D_OPTION']) assert.deepEqual(PRIMARY_MODELS.reused[k], G3_DIAGNOSTICS[k]);
  assert.match(RULES.PARTIAL, /h \+ 1 > k/);
  assert.match(PRIMARY_MODELS.new.D_SEARCH_D1.fitRows, /PARTIAL_2/); assert.match(PRIMARY_MODELS.new.D_SEARCH_D2.fitRows, /PARTIAL_3/);
});

test('4. observable option features are E1, deterministic and read only the observable view', () => {
  assert.equal(sha256(OBSERVABLE_OPTION_FEATURES_SCHEMA), OBSERVABLE_OPTION_FEATURES_SCHEMA_HASH);
  assert.ok(OBS_OPTION_COLUMNS.every((c) => c.class === 'DETERMINISTICALLY_DERIVED'));
  const src = readFileSync(path.join(root, 'src/stage3g/observable-option-features-v1.js'), 'utf8');
  assert.ok(![...src.matchAll(/from '([^']+)'/g)].some((m) => /kernel|counterfactual|reward|symmetric|stage3g3|stage3g4/.test(m[1])));
  const world = forgeWorldAdapter.initialState().world; world.grid = { width: 5, height: 5, cells: new Array(25).fill(0) };
  const v = observableView(world); const f = observableOptionFeatures({ state: v.state, visibleMap: v.visibleMap, semantics: v.semantics });
  const east = v.semantics.findIndex((s) => s.actionType === 'MOVE' && s.parameters.direction === 'EAST');
  assert.deepEqual(f[east], [4, 4, 0, 4, 0, 4], 'open centre cell, no hostile, no hazard');
  const wait = v.semantics.findIndex((s) => s.actionType === 'WAIT'); assert.equal(f[wait][3], 4);
  assert.equal(stableStringify(f), stableStringify(observableOptionFeatures({ state: v.state, visibleMap: v.visibleMap, semantics: v.semantics })));
});

test('5. bounded search: depth 0 is the one-step value, exhaustive search never trails the greedy branch, and it is D4-invariant', () => {
  const rows = DEV.filter((r) => r.equivariance !== null).slice(0, 3);
  for (const row of rows) {
    const ev = stage3g4Evidence(row);
    assert.equal(ev.searchFidelity, 1);
    for (const c of ev.candidates) for (let d = 0; d <= 2; d += 1) assert.ok(c.search[d] >= c.T[d], 'max over sequences >= the greedy continuation');
    assert.ok(Object.values(ev.twinSearch).every((x) => x === 1)); assert.ok(Object.values(ev.twinObsOption).every((x) => x === 1));
    assert.ok(Object.values(ev.twinTemporal).every((x) => x === 1)); assert.equal(ev.idPermutationNew, 1);
  }
  const d3 = stage3g4Evidence(DEV[40], { integrity: false, depth3: true });
  for (const c of d3.candidates) { assert.equal(c.search.length, 4); assert.ok(c.search[3] >= c.T[3]); }
});

test('6. Stage 3G.4 scripts install the check-mode guard; the top-level stage3g script set is untouched', () => {
  for (const f of ['plan-cli.mjs', 'generate.mjs', 'certify.mjs']) {
    const s = readFileSync(path.join(root, 'scripts/stage3g4', f), 'utf8');
    assert.match(s, /import \{[^}]*enforceCheckModeReadOnly[^}]*\} from '\.\.\/certification\/check-mode-guard\.mjs'/, f);
    assert.match(s, /enforceCheckModeReadOnly\(\{ checkOnly/, f);
  }
  const top = readdirSync(path.join(root, 'scripts')).filter((f) => /stage3g/.test(f) && f.endsWith('.mjs')).sort();
  assert.deepEqual(top, ['certify-stage3g-predictive-integrity.mjs', 'generate-stage3g-sealed.mjs', 'stage3g-plan.mjs']);
});

test('7. privileged futures and search never reach a runtime-facing contract', () => {
  for (const f of ['src/stage3g/observable-entity-state-v1.js', 'src/stage3g/action-semantics-v1.js', 'src/stage3g/prediction-lifecycle-v1.js', 'src/stage3g/observable-option-features-v1.js']) {
    const s = readFileSync(path.join(root, f), 'utf8');
    assert.ok(![...s.matchAll(/from '([^']+)'/g)].some((m) => /stage3g3|stage3g4|counterfactual|reward-v2|action-surface-symmetric/.test(m[1])), f);
  }
});
