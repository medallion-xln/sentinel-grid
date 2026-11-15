import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPEC, primarySpecs, familyKeys, interpretRegime, subgroupSupport, groupCells, estimate, bootstrap, metric, quantile, analyseSyntheticPanel, boundedDisposition } from './analysis.mjs';
import { lockFrozenPolicies, runSyntheticNative, scoreSyntheticTruth, admissionReport, nuisanceDependence, transformSyntheticFixture, runtimeIdentity, assertRuntimeIdentity, campaignEntryPoint, digest } from './runner.mjs';
import { selectSets, scoreSet } from '../../../stage3h-activation-readiness-v2/runner-design.mjs';
import { currentBaseline } from '../../../stage3h-canonical-v1/baseline.mjs';
import { decisionPacket, invokeNexus } from '../../../stage3h-canonical-v1/adapters.mjs';
import { orientAction, orientCell, ORIENTATIONS, INVERSE_ORIENTATION } from '../../../src/forge-symmetric/orientation-symmetric-v1.js';
import { validateSyntheticPipeline, campaignEntryPoint as nativeEntry } from './native-pipeline.mjs';
const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const names = []; function test(name, fn) { fn(); names.push(name); }
const near = (a, b) => assert(Math.abs(a - b) < 1e-11, `${a} != ${b}`);
const interval = (mean, lower, upper) => ({ inference: 'PERCENTILE_DESIGN_ONLY', mean, lower, upper });
export function fixture(id = 'fixture', band = 'H0', active = false) {
  const action = type => ({ actionType: type, actorId: 'actor', targetEntityId: null, parameters: type === 'MOVE' ? { direction: 'EAST' } : {} });
  const surface = ['WAIT', 'MOVE'].map((type, i) => ({ actionId: 'a' + i, actionType: type, targetEntityId: null, action: action(type) }));
  const entities = active ? [{ id: 't', kind: 'INFRASTRUCTURE', hostile: false, critical: true }, { id: 'u', kind: 'INFRASTRUCTURE', hostile: false, critical: false }] : [];
  const relationships = active ? [{ from: 'u', to: 't', kind: 'depends' }, { from: 't', to: 'u', kind: 'depends' }] : [];
  return { synthetic: true, id, cell: band, band, admission: { validatorValid: true, terminal: false, taskPreserved: true },
    publicView: { observation: { metadata: { canonicalState: { entities, relationships }, observationHistory: [], objectives: [] } },
      visibleMap: { width: 2, height: 2, terrain: ['OPEN', 'OPEN', 'OPEN', 'OPEN'], entities: [] },
      state: { observationTimestamp: 0, actor: { entityId: 'actor', observedPosition: { x: 0, y: 0 }, energy: 100, carriedMaterial: 0, ticksRemaining: 1 }, entities: [] }, surface },
    releaseSyntheticTruth: ({ events }) => { assert.equal(events.at(-1), 'ALL_DECISIONS_LOCKED'); return [{ id: 'a0', utility: 100 }, { id: 'a1', utility: 0 }]; } };
}
function row(id, band, effect = 5, regime = 'OBSERVED_THREAT') {
  const menu = ['b', 'n', 'low', 'high'], selections = selectSets(band, ['b'], ['n']);
  const truth = [{ id: 'b', utility: band === 'H0' ? 100 - effect : 100 }, { id: 'n', utility: band === 'H0' ? 100 : 100 - effect }, { id: 'low', utility: 0 }, { id: 'high', utility: 100 }];
  return { synthetic: true, id, cell: band, band, regime, selections, menu, truth, ...scoreSyntheticTruth(selections, menu, truth), nuisance: Object.fromEntries(['D4', 'IDENTITY', 'ORDER'].map(k => [k, { RB: 0, RN: 0 }])) };
}
test('V3 primary, thresholds, source rule and sample design remain identical to V2', () => {
  const v2 = J('../../../stage3h-activation-readiness-v2/contract-v2.json'), v3 = J('contract-v3.json');
  for (const k of ['rule', 'ruleHash', 'comparatorModelHash', 'primaryEstimands', 'primaryFamily', 'secondaryRegimeFamily', 'safetyFamily', 'nuisanceFamily', 'resamples', 'alphaPerPrimary', 'primaryQuantile', 'pointMateriality', 'populations', 'proposedWorlds', 'admissionRules', 'sourceContract']) assert.deepEqual(v3[k], v2[k], k);
  assert.deepEqual(primarySpecs().map(s => s.key), v3.primaryEstimands.map(s => s.key));
});
test('seven matrix rows explicitly align claims, equality, safety and certification', () => {
  const m = J('exit-matrix-v3.json'), rows = Object.fromEntries(m.rows.map(r => [r.id, r]));
  assert.equal(m.rows.length, 7); assert.equal(m.boundedQualificationImpliesStageCertification, false);
  assert.deepEqual(rows.expert_complementarity.primaryKeysRequired, primarySpecs().map(s => s.key));
  assert.deepEqual(rows.horizon_stratified_competence.primaryKeysRequired, ['A_H0_SPECIALIST', 'B_H2_AVOIDANCE']);
  assert(m.rows.every(r => !r.positiveNegativeCriteria.includes('both fixed primary contrasts') && !r.positiveNegativeCriteria.includes('subgroup-family correction')));
  assert(m.rows.every(r => r.currentClassification === 'CONTRACT_BLOCKED' && !r.scopeApproved));
});
test('all declared family keys are unique, complete, and exclude identity controls', () => {
  const f = familyKeys(); for (const [name, n] of [['P40', 40], ['REGIME40', 40], ['SAFETY30', 30], ['NUISANCE120', 120]]) { assert.equal(f[name].length, n); assert.equal(new Set(f[name]).size, n); }
  assert(!f.P40.some(k => k.includes('EXACT'))); assert.equal(SPEC.resamples, 20000);
});
test('80 disjoint directional rejection events prove the .10 union bound is sharp', () => {
  // Uniform integer U on 0..799: 40 disjoint benefit and 40 disjoint harm events, each P=1/800.
  const universe = Array.from({ length: 800 }, (_, i) => i);
  near(universe.filter(i => i < 40).length / 800, .05);
  near(universe.filter(i => i >= 40 && i < 80).length / 800, .05);
  near(universe.filter(i => i < 80).length / 800, .10);
  near(40 * (.05 / 40), .05); // Bonferroni needs no independence.
});
test('TOST intersection-union uses one true component null per false equivalence', () => {
  for (const theta of [-.1, -.02, .02, .1]) {
    const leftNullTrue = theta <= -.02, rightNullTrue = theta >= .02;
    assert(leftNullTrue || rightNullTrue);
    for (const rejectLeft of [false, true]) for (const rejectRight of [false, true]) {
      const equivalent = rejectLeft && rejectRight;
      assert(!equivalent || (leftNullTrue ? rejectLeft : rejectRight));
    }
  }
  near(40 * (.05 / 40), .05); // union over 40 selected true-null components, not 80 tails.
});
test('nonsignificance, noninferiority, equivalence and material harm are distinct', () => {
  const uncertain = interpretRegime(interval(0, -.04, .04)); assert(!uncertain.equivalent && !uncertain.benefit && !uncertain.harmAvoidance);
  const ni = interpretRegime(interval(-.01, -.08, .015)); assert(ni.harmAvoidance && !ni.equivalent && !ni.benefit);
  assert(interpretRegime(interval(0, -.01, .01)).equivalent);
  const boundary = interpretRegime(interval(0, -.02, .02)); assert(!boundary.equivalent && boundary.v2InclusiveContainmentDiagnostic);
  assert(interpretRegime(interval(-.03, -.05, -.01)).benefit);
  assert(interpretRegime(interval(.03, .01, .05)).materialHarm);
  assert(!interpretRegime({ inference: 'UNAVAILABLE' }).equivalent);
  assert.throws(() => interpretRegime(interval(0, .1, -.1)), /INVALID/);
});
test('actual frozen S0 and Nexus share source interfaces and fallback at H0/H2', () => {
  for (const active of [false, true]) for (const band of ['H0', 'H2']) {
    const f = fixture('native-interface', band, active), lock = lockFrozenPolicies(f);
    const p = decisionPacket(f.publicView.observation, f.publicView.surface, { evaluationSteps: band === 'H0' ? 1 : 4 });
    const n = invokeNexus(p), b = currentBaseline(f.publicView);
    assert.deepEqual(lock.selections.B, b.selected);
    assert.deepEqual(lock.selections.N, n.recommendedAction ? [n.recommendedAction] : b.selected);
    assert.deepEqual(lock.selections.R, band === 'H0' ? lock.selections.N : lock.selections.B);
    assert.equal(n.abstain, !active);
    assert.equal(lock.compute.S0Calls, 1); assert.equal(lock.compute.NexusCalls, 1);
    assert.deepEqual(lock.compute.chargedCallsEachArm, { S0: 1, Nexus: 1 }); assert.equal(lock.compute.publicSimulatorCalls, 0);
    assert.equal(lock.compute.columns, 60); assert.equal(lock.compute.conditionalSearchDepth, 2); assert.equal(lock.compute.conditionalSearchBudget, 512);
    assert.equal(new Set(Object.values(lock.publicEnvelopeHashByArm)).size, 1);
  }
});
test('validator, terminal and preservation rejections precede every policy/truth call', () => {
  for (const change of [{ validatorValid: false }, { terminal: true }, { taskPreserved: false }]) {
    const f = fixture(); f.admission = { ...f.admission, ...change, reason: 'HANDCRAFTED_REJECTION' };
    Object.defineProperty(f, 'publicView', { get() { throw Error('EARLY_POLICY_ACCESS'); } });
    f.releaseSyntheticTruth = () => { throw Error('EARLY_TRUTH_ACCESS'); };
    const r = runSyntheticNative(f); assert(r.rejected); assert.equal(r.publicPolicyCalls, 0); assert(!r.replacementAllowed);
  }
});
test('truth locked after all decisions and native menu omissions are rejected', () => {
  const r = runSyntheticNative(fixture()); assert.equal(r.events[1], 'ALL_DECISIONS_LOCKED');
  assert.throws(() => runSyntheticNative({ ...fixture(), world: {} }), /SYNTHETIC/);
  assert.throws(() => runSyntheticNative({ ...fixture(), seed: 'forbidden' }), /SYNTHETIC/);
  const f = fixture(); f.publicView.surface[1].actionId = 'a0'; assert.throws(() => runSyntheticNative(f), /MENU/);
  assert.throws(() => scoreSyntheticTruth(r.selections, r.menu, [{ id: 'a0', utility: 0 }]), /MENU/);
});
test('ties use complete uniform expectations, catastrophe threshold and zero-spread rules', () => {
  for (const gap of [0, 99, 100, 101]) {
    const t = [{ id: 'a', utility: gap }, { id: 'b', utility: 0 }], s = { R: ['a', 'b'], B: ['a'], N: ['b'] };
    const m = scoreSyntheticTruth(s, ['a', 'b'], t).metrics.R;
    near(m.regret, gap / 2); near(m.nreg, gap ? .5 : 0); near(m.cat, gap >= 100 ? .5 : 0); near(m.hit, gap ? .5 : 1);
    assert.deepEqual(m, scoreSet(['a', 'b'], t));
  }
});
test('worst support introduction veto preserves the shared same-set tie identity', () => {
  const t = [{ id: 'a', utility: 100 }, { id: 'b', utility: 0 }];
  assert.equal(scoreSyntheticTruth({ R: ['a', 'b'], B: ['a', 'b'], N: ['a'] }, ['a', 'b'], t).introductionB, false);
  assert.equal(scoreSyntheticTruth({ R: ['b'], B: ['a'], N: ['b'] }, ['a', 'b'], t).introductionB, true);
});
test('equal target cell weights differ from pooled row weighting', () => {
  const a = row('a', 'H0', 8), b = row('b', 'H2', 2), b2 = { ...b, id: 'b2' };
  near(estimate(groupCells([a, b, b2]), { metric: 'RB' }).mean, -.04);
  near(estimate(groupCells([a, b, b2]), { metric: 'RN' }).mean, -.01);
});
test('subgroup ratio uses original cells and sparse membership remains unmeasured', () => {
  const a = row('a', 'H0', 80), b = row('b', 'H0', 0, 'NO_OBSERVED_THREAT'), c = row('c', 'H2', 20);
  c.cell = 'other'; c.metrics.R.nreg = 0; c.metrics.B.nreg = .2;
  const cs = [[a, b, b], [c]]; near(estimate(cs, { metric: 'RB', regime: 'OBSERVED_THREAT' }).mean, -.35);
  assert(!subgroupSupport(cs, { regime: 'OBSERVED_THREAT' }).pass);
});
test('paired bootstrap preserves exact covariance and full-mixture dilution in every draw', () => {
  const cs = groupCells([row('a', 'H0', 1), row('b', 'H0', 9), row('c', 'H2', 2), row('d', 'H2', 8)]);
  const out = bootstrap(cs, primarySpecs(), { resamples: 20000, label: 'V3_HANDCRAFTED_ONLY' });
  for (const field of ['mean', 'lower', 'upper']) { near(out.C_FULL_VS_B[field], out.A_H0_SPECIALIST[field] / 2); near(out.D_FULL_VS_N[field], out.B_H2_AVOIDANCE[field] / 2); }
  assert.equal(out.A_H0_SPECIALIST.resamples, 20000); assert.equal(out.A_H0_SPECIALIST.family, 40);
});
test('undefined subgroup draws invalidate rather than disappear or become zero', () => {
  const out = bootstrap([[row('a', 'H0'), row('b', 'H0', 5, 'NO_OBSERVED_THREAT')]], [{ key: 'T', metric: 'RB', regime: 'OBSERVED_THREAT' }], { resamples: 1000 });
  assert.equal(out.T.inference, 'UNAVAILABLE_UNDEFINED_SUBGROUP_DRAW'); assert(out.T.invalidDrawsNotDropped);
});
test('false selection harm and privileged best-of gap cannot cancel signed gains', () => {
  const r = row('f', 'H0'); r.metrics.R.nreg = .4; r.metrics.B.nreg = .1; r.metrics.N.nreg = .7;
  near(metric(r, 'HARM_B'), .3); near(metric(r, 'HARM_N'), 0); near(metric(r, 'BEST_OF_GAP'), .3);
});
test('admission checks include per-band loss, missing rows and duplicate independent units', () => {
  const make = (band, n, rejects) => Array.from({ length: n }, (_, i) => ({ id: band + i, cell: band, band, rejected: i < rejects, ...(i < rejects ? { reason: 'VALIDATOR' } : {}) }));
  const schedule = { H0: { band: 'H0', scheduled: 1248 }, H2: { band: 'H2', scheduled: 1248 } };
  const valid = [...make('H0', 1248, 100), ...make('H2', 1248, 100)], pass = admissionReport(valid, schedule);
  assert(pass.pass); assert(pass.effectiveN >= 2100);
  const skew = [...make('H0', 1248, 200), ...make('H2', 1248, 0)], bad = admissionReport(skew, schedule);
  assert(bad.accepted / skew.length > .9 && !bad.perBand.H0.pass && !bad.pass);
  assert.throws(() => admissionReport(valid.slice(1), schedule), /UNRECONCILED/);
  assert.throws(() => admissionReport([valid[0], ...valid.slice(0, -1)], schedule), /DUPLICATE/);
});
test('frozen native action D4 maps/inverses preserve all handcrafted directions and destinations', () => {
  for (const o of ORIENTATIONS) for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
    assert.deepEqual(orientCell(INVERSE_ORIENTATION[o], orientCell(o, { x, y }, 5), 5), { x, y });
    const a = { actionType: 'RETREAT', parameters: { toX: x, toY: y } };
    assert.deepEqual(orientAction(INVERSE_ORIENTATION[o], orientAction(o, a, 5), 5), a);
  }
  for (const o of ORIENTATIONS) for (const direction of ['NORTH', 'SOUTH', 'EAST', 'WEST']) {
    const a = { actionType: 'MOVE', parameters: { direction } };
    assert.deepEqual(orientAction(INVERSE_ORIENTATION[o], orientAction(o, a, 5), 5), a);
  }
});
test('nuisance maxima measure legitimate selection changes without counting copies as worlds', () => {
  const original = row('unit', 'H0'), vs = [];
  for (const category of ['D4', 'IDENTITY', 'ORDER']) for (const transform of category === 'D4' ? ORIENTATIONS : [category]) {
    const r = structuredClone(original); if (transform === 'R90') { r.selections.R = ['low']; r.selections.N = ['low']; Object.assign(r, scoreSyntheticTruth(r.selections, r.menu, r.truth)); }
    vs.push({ category, transform, row: r, actionMap: Object.fromEntries(original.menu.map(id => [id, id])) });
  }
  const result = nuisanceDependence(original, vs); near(result.values.D4.RB, 1); assert.equal(result.independentUnitCount, 1);
  const corrupt = structuredClone(vs); corrupt[0].row.truth[0].utility++;
  assert.throws(() => nuisanceDependence(original, corrupt), /TRUTH_CHANGED/);
  assert.throws(() => nuisanceDependence(original, vs.slice(1)), /MISSING/);
});
test('actual frozen policies run through handcrafted D4, identity and order twins', () => {
  for (const active of [false, true]) for (const band of ['H0', 'H2']) {
    const f = fixture('public-view-twins', band, active), original = runSyntheticNative(f);
    original.truth = f.releaseSyntheticTruth({ events: ['ALL_DECISIONS_LOCKED'] });
    const vs = [];
    for (const category of ['D4', 'IDENTITY', 'ORDER']) for (const transform of category === 'D4' ? ORIENTATIONS : [category]) {
      const twin = transformSyntheticFixture(f, category, transform), r = runSyntheticNative(twin.fixture);
      r.truth = twin.fixture.releaseSyntheticTruth({ events: ['ALL_DECISIONS_LOCKED'] });
      vs.push({ category, transform, row: r, actionMap: twin.actionMap });
    }
    const got = nuisanceDependence(original, vs); assert.equal(got.independentUnitCount, 1);
    assert(Object.values(got.values).every(v => Number.isFinite(v.RB) && Number.isFinite(v.RN)));
  }
});
test('exact runtime identity covers binary, all versions, architecture and launch flags', () => {
  const identity = runtimeIdentity(); assert(assertRuntimeIdentity(identity));
  for (const change of [{ platform: 'different' }, { execArgv: ['--different'] }, { versions: { ...identity.versions, v8: 'other' } }, { nodeBinarySha256: '0'.repeat(64) }]) assert.throws(() => assertRuntimeIdentity({ ...identity, ...change }), /MISMATCH/);
  assert.throws(() => assertRuntimeIdentity({}), /REQUIRED/);
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
});
test('native pipeline order and source-faithful totalScalar scoring use opaque mock ports only', () => {
  const f = fixture(), calls = [], runtime = runtimeIdentity();
  const call = (name, value) => (...args) => { calls.push(name); return typeof value === 'function' ? value(...args) : value; };
  const ports = {
    warmup: call('warmup', { scenarioConfig: { horizon: 0 }, world: 'OPAQUE_HANDCRAFTED_TOKEN', taskPreserved: true, warmupTicks: 0, truncated: false }),
    initial: call('initial', 'OPAQUE_INITIAL_TOKEN'), validate: call('validate', { valid: true }), terminal: call('terminal', false),
    stateHash: call('stateHash', 'OPAQUE_HASH'), publicView: call('publicView', f.publicView),
    packet: call('packet', (...args) => decisionPacket(...args)), nexus: call('nexus', (...args) => invokeNexus(...args)), baseline: call('baseline', (...args) => currentBaseline(...args)),
    truth: call('truth', () => { assert(calls.includes('baseline')); return { utilitySpread: 100, branches: [{ actionKey: 'a0', totalScalar: 100, regret: 0 }, { actionKey: 'a1', totalScalar: 0, regret: 100 }] }; }),
  };
  const input = { fixture: { synthetic: true, combo: { horizonBand: 'H0' } }, ports, runtime }, seen = new Set();
  const r = validateSyntheticPipeline({ ...input, seen }); assert(!r.rejected); assert.equal(r.metrics.R.cat, r.metrics.N.cat);
  assert(calls.indexOf('validate') < calls.indexOf('nexus') && calls.indexOf('baseline') < calls.indexOf('truth'));
  assert.throws(() => validateSyntheticPipeline({ ...input, seen }), /DUPLICATE_WORLD_HASH/);
  const rejecting = { ...ports, validate: () => ({ valid: false }), nexus: () => { throw Error('MUST_NOT_CALL'); }, truth: () => { throw Error('MUST_NOT_CALL'); } };
  assert(validateSyntheticPipeline({ ...input, ports: rejecting }).rejected);
  const badTruth = { ...ports, truth: () => ({ utilitySpread: 1, branches: [{ actionKey: 'a0', totalScalar: 100, regret: 0 }, { actionKey: 'a1', totalScalar: 0, regret: 100 }] }) };
  assert.throws(() => validateSyntheticPipeline({ ...input, ports: badTruth }), /REGRET_MISMATCH/);
  assert.throws(nativeEntry, /EXECUTION_DISABLED/);
});
test('complete synthetic analysis uses all families and refuses to turn zero events into proof', () => {
  const report = analyseSyntheticPanel([row('h0a', 'H0'), row('h0b', 'H0', 5, 'NO_OBSERVED_THREAT'), row('h2a', 'H2'), row('h2b', 'H2', 5, 'NO_OBSERVED_THREAT')]);
  assert.equal(Object.keys(report.primaries).length, 4); assert.equal(Object.keys(report.regimes).length, 4); assert.equal(Object.keys(report.safety).length, 3); assert.equal(Object.keys(report.nuisance).length, 12);
  assert(Object.values(report.primaries).every(e => e.resamples === 20000));
  assert(Object.values(report.catastrophe).every(e => e.introductions === 0 && e.introductionUpper > .02 && !e.pass));
  assert(!report.numericCriteriaPass); assert.equal(report.decision, 'SYNTHETIC_ONLY_NO_QUALIFICATION');
  assert.equal(report.canonicalTCA, null); assert.equal(report.incumbentPrimeValue, null);
});
test('tampered identities, invalid metric ranges and missing nuisance values fail closed', () => {
  const rs = [row('a', 'H0'), row('b', 'H2')]; const wrong = structuredClone(rs); wrong[0].selections.R = ['b'];
  assert.throws(() => analyseSyntheticPanel(wrong, { resamples: 1000 }), /EXACT_CONTROL/);
  const nan = structuredClone(rs); nan[0].metrics.B.nreg = NaN; assert.throws(() => analyseSyntheticPanel(nan), /NONFINITE/);
  const missing = structuredClone(rs); delete missing[0].nuisance;
  assert.throws(() => analyseSyntheticPanel(missing, { resamples: 1000 }), /NUISANCE/);
});
test('nearest-rank multiplicity quantiles retain frozen finite Monte Carlo resolution', () => {
  const a = Array.from({ length: 20000 }, (_, i) => i);
  assert.equal(quantile(a, .99875), 19974); assert.equal(quantile(a, .00125), 24);
  assert.equal(quantile(a, 1 - .05 / 120), 19991);
});
test('review, scope, and campaign interfaces cannot self-promote or activate', () => {
  const s = J('scope-approval-record.json'); assert.equal(Object.keys(s.decisions).length, 5);
  assert(Object.values(s.decisions).every(d => !d.approved && d.actualDisposition === null && d.status === 'PENDING_HUMAN_AUTHORITY'));
  assert.equal(s.reviewerIdentity, null); assert.equal(s.reviewStatus, 'REVIEW_PENDING');
  assert.equal(boundedDisposition(), 'CONTRACT_BLOCKED'); assert.throws(campaignEntryPoint, /EXECUTION_DISABLED/);
});
console.log(JSON.stringify({ check: 'PASS', tests: names.length, testNames: names, fail: 0, nativeWorldsInstantiated: 0, nativePublicPolicyFixtureCallsOnly: true,
  campaignExecuted: false, seedsAllocated: false, sealedDataAccessed: false, independentMethodReview: 'REVIEW_PENDING', performanceEstablished: false }));
