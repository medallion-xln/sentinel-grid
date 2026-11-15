// Gate 0.3 — runner integrity negative controls. These need the local, privileged development fixture and the
// custody-protected comparator sources, so they are SKIPPED in a clean checkout (and say so).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GA = resolve(LANE, '..'), WORK = resolve(LANE, 'work');
const have = existsSync(resolve(WORK, 'dev-fixture')) && existsSync(resolve(WORK, 'dev-model/SK1_MODEL.json')) && existsSync(resolve(GA, 'stage3h-canonical-v1/adapters.mjs')) && existsSync(resolve(GA, 'stage3h-hw4-value-band-v1/work/classes/EXPLORATION'));
const opt = { skip: have ? false : 'needs local privileged development data and the custody-protected comparator sources' };
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
let ctx = null;
async function load() { if (ctx) return ctx;
  const { loadForgeKernel } = await import('../api/host.mjs'), { auditClass } = await import('../infra/audit-class.mjs'), { mergeAudit } = await import('../infra/run.mjs'), { evaluate } = await import('../infra/evaluate.mjs'), { makePolicy } = await import('../../stage3h-hw4-value-band-v1/hw4-policy.mjs');
  const hw4 = await import('../../stage3h-hw4-value-band-v1/hw4-allocator.mjs'), { populationOfFamily } = await import('../infra/common.mjs');
  const host = loadForgeKernel(resolve(WORK, 'dev-model/SK1_MODEL.json')), noev = loadForgeKernel(resolve(WORK, 'dev-model/SK1_MODEL_NO_EVIDENCE.json'));
  const dir = resolve(GA, 'stage3h-hw4-value-band-v1/work/classes/EXPLORATION'), spent = readJ(resolve(dir, readdirSync(dir).sort()[0])).classes.filter((c) => c.status === 'OK' && populationOfFamily(c.family) === 'EXPLORATION').slice(0, 4);
  const alloc = hw4.loadAllocation(), ex = hw4.loadExclusions(), sched = new Map(), comboFor = (b, k) => { if (!sched.has(b)) sched.set(b, new Map(hw4.blockSchedule(ex, 'EXPLORATION', b, alloc).map((c) => [c.k, c]))); return sched.get(b).get(k); };
  const fixture = readdirSync(resolve(WORK, 'dev-fixture')).sort().flatMap((f) => readJ(resolve(WORK, 'dev-fixture', f)).classes).slice(0, 80);
  const c10 = makePolicy(readJ(resolve(GA, 'stage3h-hw4-value-band-v1/models/V1_PUBLIC_ONLY_C10_BASE_SAFE_FIRST.json')));
  return (ctx = { host, noev, auditClass, mergeAudit, evaluate, c10, spent, comboFor, fixture });
}
test('identity audit on spent development classes: kernel is invariant; all three shortcut controls are caught', opt, async () => { const c = await load();
  const recs = c.spent.map((s, i) => c.auditClass({ id: `SPENT-${i}`, worldHash: s.worldHash }, c.comboFor(s.block, s.k), c.host.kernel, c.host.featurizer)), a = c.mergeAudit(recs, recs.map((r) => r.id));
  for (const t of ['RELABEL', 'MENU', 'D4', 'HIDDEN']) { assert.ok(a.identity.set[t].n > 0, t); assert.equal(a.identity.set[t].bad, 0, `decision-set violations under ${t}`); assert.equal(a.identity.kind[t].bad, 0, `recommend/abstain flips under ${t}`); }
  assert.equal(a.totals.illegal, 0); assert.equal(a.totals.repeatMismatch, 0); assert.equal(a.totals.poisonMismatch, 0); assert.equal(a.totals.featureFrameMismatch, 0); assert.deepEqual(a.totals.unallowedReads, []); assert.ok(a.totals.maxReadPaths > 0); assert.equal(a.totals.evidenceNotValidOnSomeView, 0);
  for (const [name, ctl] of Object.entries(a.controls)) for (const d of ctl.detectedOn) assert.ok(d.bad > 0, `negative control ${name} must be detected on ${d.test}`);
});
test('an identity shortcut inside a kernel-shaped policy is caught by the audit', opt, async () => { const c = await load(), s = c.spent[0];
  const cheat = { recommend: (state, actions) => ({ decisionHash: 'x', rankedActions: actions.map((_, i) => ({ index: i })), evidence: { status: 'VALID' }, recommendedActionOrAbstention: { kind: 'RECOMMEND', decisionSet: [{ index: 0 }] } }) }; // always the first menu position
  const r = c.auditClass({ id: 'CHEAT', worldHash: s.worldHash }, c.comboFor(s.block, s.k), cheat, c.host.featurizer); assert.ok(r.byTest.MENU.bad > 0); });
test('evaluation: the kernel only ever receives public fields; malformed outputs are counted illegal, not repaired', opt, async () => { const c = await load(), seen = [];
  const spy = { recommend: (s, a, e, o) => { seen.push(JSON.stringify([s, a, e])); return c.host.kernel.recommend(s, a, e, o); } }, res = c.evaluate({ classes: c.fixture, kernel: spy, kernelNoEvidence: c.noev.kernel, c10: c.c10, audit: null });
  assert.ok(seen.length >= c.fixture.length); for (const s of seen) assert.ok(!/"(truth|members|worldHash|seed|utility|regret)"/.test(s));
  assert.equal(res.policies.SK1_AS_SPECIFIED.illegalDecisions, 0); assert.equal(res.reproducibility.identical, true); assert.equal(res.classes, c.fixture.length); assert.equal(res.executionValid, null); assert.match(res.classification, /^[BC]_/);
  assert.equal(res.policies.S0.introVsS0, 0); assert.equal(res.policies.NEXUS.introVsNexus, 0); assert.equal(res.perClass.length, c.fixture.length); assert.ok(res.perClass.every((p) => /^FX-/.test(p.id)));
  const broken = { recommend: (s, a, e) => { const r = c.host.kernel.recommend(s, a, e); return { ...r, recommendedActionOrAbstention: { kind: 'RECOMMEND', decisionSet: [{ index: a.length + 3 }] } }; } };
  const bad = c.evaluate({ classes: c.fixture.slice(0, 10), kernel: broken, kernelNoEvidence: c.noev.kernel, c10: c.c10, audit: null }); assert.equal(bad.policies.SK1_AS_SPECIFIED.illegalDecisions, 10); assert.equal(bad.gatesAsSpecified.ZERO_ILLEGAL_ACTIONS, false); assert.equal(bad.safetyKernelDevQualified, false);
});
test('intentional leakage is rejected at the kernel boundary', opt, async () => { const c = await load(), { forgeRequest } = await import('../adapters/forge/features.mjs'), f = c.fixture[0], r = forgeRequest(f.projection, f.evidence);
  assert.throws(() => c.host.kernel.recommend({ ...r.state, members: f.members }, r.legalActions, r.advisoryEvidence), /PRIVILEGED_FIELD_IN_REQUEST/); assert.throws(() => c.host.kernel.recommend(r.state, r.legalActions.map((a, i) => ({ ...a, truth: f.members[0].truth[i] })), r.advisoryEvidence), /PRIVILEGED_FIELD_IN_REQUEST/);
  assert.throws(() => c.host.kernel.recommend(r.state, r.legalActions, { ...r.advisoryEvidence, oracle: { best: 0 } }), /PRIVILEGED_FIELD_IN_REQUEST/); });
