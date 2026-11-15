// Structural and failure-injection tests for STAGE3H_ASCII_COMPETENCE_BENCHMARK_V1. node --test tests.mjs
// Engineering validation only. Uses DEVELOPMENT seeds only; never materializes a proposed prospective seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { create, packet, step, observe, replay, verifyReplay } from '../ascii-suite/v32/kernel.mjs';
import { episode as v32Episode } from '../ascii-suite/v32/runner.mjs';
import { hash, clone } from '../ascii-suite/v3/common.mjs';
import { verifyInheritance, ROSTER } from './guard.mjs';
import { createArm, ARMS, GAMES } from './arms.mjs';
import { runEpisode, runPaired, REGIME_RULES, TIME_RULES, INVALID } from './harness.mjs';
import { auditObserver, forbiddenPaths, PERTURB } from './observer.mjs';
import { pairedBootstrap, holm, mcnemarExact, clopperPearsonUpper, catastropheVeto, tostEquivalent, comparePaired, signTest, METRIC_SPEC, NORMALIZED_REGRET, mdePaired, pairsRequired } from './metrics.mjs';
import { buildInventory, expertMatrix } from './inventory.mjs';
import { DEV_SEEDS, DEV_FAMILY, PROPOSED, namespacesDisjoint, prospectiveSeed } from './population.mjs';

const S = DEV_SEEDS[0], F = DEV_FAMILY;
const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('inheritance: 14,447 protected files, ASCII sources, milestones, frozen rule and roster unchanged', () => {
  const v = verifyInheritance();
  assert.equal(v.canonicalProtectedCount, 14447); assert.equal(v.asciiSourcesUnchanged, true); assert.equal(v.extraSourcesUnchanged, true);
  assert.equal(v.allMilestonesAncestors, true); assert.equal(v.frozenRuleHashMatches, true); assert.equal(v.oraclePath, 'CLOSED_CONTRACT_NOT_TESTABLE'); assert.equal(v.rosterPreserved, true);
});

test('harness incumbent arm reproduces the v32 runner exactly (actions, outcome, metrics) on fast levels', () => {
  for (const [game, tier] of [['factory', 1], ['factory', 3], ['cards', 2], ['rescue', 1], ['fighter', 1], ['roguelike', 1]]) {
    const r = runEpisode({ game, tier, seed: S, family: F, arm: 'INCUMBENT_STRONG_V32' }, { verify: false });
    const v = v32Episode({ game, tier, seed: S, family: F, policy: 'STRONG' }, { verify: false });
    assert.equal(r.outcome, v.outcome, game); assert.equal(r.ticks, v.ticks, game); assert.equal(hash(r.metrics), hash(v.metrics), game);
  }
});

test('paired arms share an identical initial world but no mutable state; outcomes attributable per arm', () => {
  const p = runPaired({ game: 'factory', tier: 2, seed: S, family: F }, ['STRONGEST_NATIVE', 'FIXED_WAIT', 'UNIFORM_RANDOM']);
  assert.ok(p.initialHash); assert.equal(p.results.STRONGEST_NATIVE.initialHash, p.results.FIXED_WAIT.initialHash);
  assert.notEqual(p.results.STRONGEST_NATIVE.actionHash, p.results.FIXED_WAIT.actionHash);
  assert.equal(p.results.FIXED_WAIT.metrics.success, false, 'WAIT must fail factory (v32 PLAN safety rule)');
  const again = runPaired({ game: 'factory', tier: 2, seed: S, family: F }, ['FIXED_WAIT', 'STRONGEST_NATIVE']);
  assert.equal(again.results.STRONGEST_NATIVE.finalStateHash, p.results.STRONGEST_NATIVE.finalStateHash, 'order of arms cannot matter');
});

test('read-only Sentinel shadow cannot affect gameplay (identical trajectory to the acting controller)', () => {
  for (const [game, tier] of [['factory', 3], ['rescue', 1], ['cards', 1], ['fighter', 1]]) {
    const p = runPaired({ game, tier, seed: S, family: F }, ['STRONGEST_NATIVE', 'SHADOW_SENTINEL_READONLY']);
    assert.equal(p.divergence['STRONGEST_NATIVE~SHADOW_SENTINEL_READONLY'], 'IDENTICAL', game);
    assert.ok(p.results.SHADOW_SENTINEL_READONLY.expertCalls > 0, 'experts were actually invoked');
  }
});

test('exact ablation: v31 Sentinel equals its own fallback whenever Nexus never fires', () => {
  for (const [game, tier] of [['rescue', 1], ['roguelike', 1], ['cards', 1], ['factory', 1]]) {
    const p = runPaired({ game, tier, seed: S, family: F }, ['SENTINEL_V31_AS_IS', 'V31_FALLBACK_ABLATION']);
    if (p.results.SENTINEL_V31_AS_IS.nexusFired === 0) assert.equal(p.divergence['SENTINEL_V31_AS_IS~V31_FALLBACK_ABLATION'], 'IDENTICAL', game);
  }
});

test('declared Nexus adapter equals the strongest controller when Nexus does not change an action', () => {
  const p = runPaired({ game: 'factory', tier: 1, seed: S, family: F }, ['STRONGEST_NATIVE', 'NEXUS_REPAIR_OVER_STRONGEST_V1']);
  const a = p.results.NEXUS_REPAIR_OVER_STRONGEST_V1;
  if (a.nexusChanged === 0) assert.equal(p.divergence['STRONGEST_NATIVE~NEXUS_REPAIR_OVER_STRONGEST_V1'], 'IDENTICAL');
  assert.throws(() => createArm('NEXUS_REPAIR_OVER_STRONGEST_V1', 'pong'), /ARM_INAPPLICABLE/);
  assert.throws(() => createArm('SENTINEL_V31_AS_IS', 'racing'), /ARM_INAPPLICABLE/);
});

test('observer contract passes on sampled levels (purity, binding, masks, freezing, sensors, replay, no leakage)', () => {
  for (const [game, tier] of [['factory', 1], ['cards', 1], ['fighter', 2], ['platformer', 3], ['rescue', 2], ['roguelike', 1], ['pong', 1], ['racing', 1]]) {
    const a = auditObserver(game, tier, S, F, { steps: 60 });
    assert.equal(a.pass, true, game + ':' + a.failed.join(','));
  }
});

test('leakage detector: injected privileged values are flagged; explicit withholding (null/WITHHELD) is not', () => {
  assert.deepEqual(forbiddenPaths({ a: { seed: 7 } }), ['$.a.seed']);
  assert.deepEqual(forbiddenPaths({ windZones: [{ strength: null }], caps: { privateStyle: 'WITHHELD' } }), []);
  assert.deepEqual(forbiddenPaths({ deck: [] }), ['$.deck']);
});

test('counterfactual invariance is sensitive: public perturbation changes observation, privileged does not', () => {
  const w = create('cards', S, 1, { family: F }), o = observe(w);
  const priv = PERTURB.cards(w, o); assert.notEqual(hash(priv.world.inner), hash(w.inner)); assert.equal(hash(observe(priv.world)), hash(o));
  const pub = clone(w); pub.inner.clues -= 1; assert.notEqual(hash(observe(pub)), hash(o), 'detector must see a public change');
  const f = create('fighter', S, 2, { family: F }), fo = observe(f), fp = PERTURB.fighter(f, fo); assert.equal(hash(observe(fp.world)), hash(fo));
});

test('failure injection: illegal, null, throwing and packet-mutating policies are classified, never substituted', () => {
  const bad = (decide) => () => ({ decide });
  const ill = runEpisode({ game: 'factory', tier: 1, seed: S, family: F, arm: 'X' }, { armFactory: bad(() => ({ action: { id: 'FAKE', type: 'FAKE', parameters: {} } })) });
  assert.equal(ill.status, 'INVALID_ILLEGAL_ACTION'); assert.equal(ill.valid, false); assert.equal(ill.decisions, 0);
  const nul = runEpisode({ game: 'factory', tier: 1, seed: S, family: F, arm: 'X' }, { armFactory: bad(() => ({ action: null })) });
  assert.equal(nul.status, 'INVALID_NULL_ACTION');
  const thr = runEpisode({ game: 'factory', tier: 1, seed: S, family: F, arm: 'X' }, { armFactory: bad(() => { throw Error('boom'); }) });
  assert.equal(thr.status, 'INVALID_POLICY_EXCEPTION'); assert.match(thr.invalidDetail.error, /boom/);
  const mut = runEpisode({ game: 'factory', tier: 1, seed: S, family: F, arm: 'X' }, { checkPurity: true, armFactory: bad((p) => { p.observation.credits = 1e9; return { action: p.actions[0] }; }) });
  assert.equal(mut.status, 'INVALID_POLICY_EXCEPTION', 'deep-frozen packet rejects mutation');
  const again = runEpisode({ game: 'factory', tier: 1, seed: S, family: F, arm: 'X' }, { armFactory: bad(() => ({ action: { id: 'FAKE', type: 'FAKE', parameters: {} } })) });
  assert.equal(hash(again), hash(ill), 'invalid-case accounting is deterministic');
  for (const s of INVALID) assert.ok(typeof s === 'string');
});

test('decision budget yields INCOMPLETE_DECISION_BUDGET; tampered replay diverges', () => {
  const r = runEpisode({ game: 'pong', tier: 1, seed: S, family: F, arm: 'FIXED_WAIT' }, { decisionLimit: 25, verify: false });
  assert.equal(r.status, 'INCOMPLETE_DECISION_BUDGET'); assert.equal(r.decisions, 25);
  let w = create('factory', S, 1, { family: F }); const acts = []; const pol = createArm('STRONGEST_NATIVE', 'factory');
  for (let i = 0; i < 8; i++) { const p = packet(w), d = pol.decide(p); acts.push(d.action); w = step(w, p, d.action); }
  const rep = replay({ game: 'factory', seed: S, tier: 1, family: F, sensor: 'NORMAL' }, acts); assert.equal(verifyReplay(rep).pass, true);
  const tampered = { ...rep, hashes: [...rep.hashes] }; tampered.hashes[3] = '0'.repeat(64); assert.throws(() => verifyReplay(tampered), /REPLAY_DIVERGED/);
});

test('regime and time labels read only public observation fields', () => {
  for (const g of GAMES) {
    const o = observe(create(g, S, 1, { family: F }));
    if (REGIME_RULES[g]) assert.equal(typeof REGIME_RULES[g].label(o), 'string');
    if (TIME_RULES[g]) assert.ok(Number.isFinite(TIME_RULES[g].value(o)), g);
  }
  assert.equal(REGIME_RULES.factory.label({ nodes: [{ broken: true }] }), 'OBSERVED_DISRUPTION');
  assert.equal(REGIME_RULES.pong, null); assert.equal(TIME_RULES.racing, null);
});

test('statistics: deterministic bootstrap, Holm, exact McNemar/sign, Clopper-Pearson, strict TOST, catastrophe veto, MDE', () => {
  const d = [1, 0, 0, 1, -1, 0, 1, 1, 0, 0];
  assert.deepEqual(pairedBootstrap(d, { B: 2000 }), pairedBootstrap(d, { B: 2000 }));
  assert.deepEqual(holm([0.01, 0.04, 0.03]), [0.03, 0.06, 0.06]);
  assert.equal(mcnemarExact(10, 0).p, 2 / 1024); assert.ok(Math.abs(signTest([1, 1, 1]).p - 0.25) < 1e-12);
  assert.ok(Math.abs(clopperPearsonUpper(0, 100) - (1 - 0.05 ** (1 / 100))) < 1e-6);
  assert.equal(tostEquivalent({ lower: -0.05, upper: 0.05 }, 0.05), false, 'boundary-touching is not equivalence');
  assert.equal(tostEquivalent({ lower: -0.01, upper: 0.02 }, 0.05), true);
  const v = catastropheVeto([[true, false], [false, false], [false, true]]); assert.equal(v.introduced, 1); assert.equal(v.removed, 1); assert.equal(v.veto, true);
  assert.equal(catastropheVeto(Array.from({ length: 10 }, () => [false, false])).veto, true, 'zero events in 10 pairs is not proof of safety');
  assert.ok(Math.abs(mdePaired(1, 100) - 0.2486) < 1e-3); assert.equal(pairsRequired(1, 0.25), 99);
  assert.equal(METRIC_SPEC.racing.primary.orientation, -1); assert.equal(NORMALIZED_REGRET.status, 'NOT_DEFINED');
});

test('paired comparison excludes and counts invalid worlds, and orients metrics', () => {
  const ok = (m, valid = true) => ({ valid, metrics: m });
  const rows = [{ results: { A: ok({ placement: 1, success: true }), B: ok({ placement: 3, success: false }) } }, { results: { A: ok({ placement: 2, success: true }, false), B: ok({ placement: 1, success: true }) } }];
  const c = comparePaired('racing', rows, 'A', 'B', { B: 500 });
  assert.equal(c.pairs, 1); assert.equal(c.excludedInvalid, 1); assert.equal(c.primary.mean, 2, 'lower placement is better');
});

test('inventory: eight games, 24 advanced levels, source owners hashed, regret marked NOT_DEFINED', () => {
  const inv = buildInventory();
  assert.equal(inv.gameCount, 8); assert.equal(inv.levelCount, 24);
  for (const g of inv.games) { assert.ok(g.ownerSha256.every((o) => o.sha256.length === 16)); assert.equal(g.nativeCounterfactualEvaluator.status, 'NOT_DEFINED'); }
});

test('expert applicability: nine-expert roster, no tenth expert, only Nexus/factory testable, Forge World rule not transferred', () => {
  const e = expertMatrix(buildInventory());
  assert.deepEqual(e.roster, ROSTER); assert.equal(e.tenthExpert, false);
  assert.deepEqual(e.incrementalValueTestablePairings, ['Nexus/factory']);
  assert.equal(e.forgeWorldRuleTransfer.status, 'NOT_TRANSFERRED');
  for (const g of GAMES) { assert.equal(e.matrix.Oracle[g].ACTION_COMPATIBLE, false); assert.equal(e.matrix.Prime[g].OBSERVATION_COMPATIBLE, false); assert.equal(e.matrix.Forge[g].TASK_APPLICABLE, false); assert.equal(e.matrix.Picasso[g].TASK_APPLICABLE, false); }
});

test('isolation by construction: arms and harness never import simulator construction into inference', () => {
  const arms = src('./arms.mjs');
  assert.ok(!/from '\.\.\/ascii-suite\/v32\/kernel\.mjs'/.test(arms), 'arms must not import the native kernel');
  assert.ok(!/root-puct/.test(arms.replace(/\/\/.*$/gm, '')), 'no privileged simulator controller in any arm');
  const h = src('./harness.mjs');
  assert.ok(/const p = packet\(w\)/.test(h) && /policies\[index\]\.decide\(p\)/.test(h) && !/decide\(w\b/.test(h), 'harness hands policies only the frozen packet');
  assert.ok(Object.values(ARMS).every((a) => !/ROOT|PUCT/.test(a.source)));
});

test('populations: prospective namespaces disjoint from all prior/dev seeds; prospective seeds never materialized here', () => {
  assert.equal(namespacesDisjoint(), true);
  assert.throws(() => prospectiveSeed(PROPOSED.HOLDOUT.A, 0x80000), /OUTSIDE_NAMESPACE/);
  for (const f of ['arms.mjs', 'harness.mjs', 'observer.mjs', 'dev-run.mjs', 'inventory.mjs']) assert.ok(!/prospectiveSeed\(|PROPOSED\./.test(src('./' + f)), f + ' must not touch prospective seeds');
});
