import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSeededRandom, sha256, stableStringify } from '../src/core/determinism.js';
import {
  CONTAMINATION_FLAGS, DIAGNOSTIC_AUTHORITY, EPISTEMIC_CLASSES, EPISTEMIC_SCHEMA, EPISTEMIC_SCHEMA_HASH, PROMOTION_RULES, RECORD_FIELDS, WORLD_STATE_V1_PROJECTION,
  admit, auditContamination, authoritativeDigest, createEpistemicRecord, createEpistemicState, deriveClass, derivationInputsHash, readAuthoritative, readProvisional,
  recordStatus, registerObservation, requestPromotion,
} from '../src/stage3g/epistemic-provenance-v1.js';
import { PLAN, PLAN_HASH, PLAN_PATH, STAGE3F_INHERITANCE } from '../scripts/stage3g/plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (f) => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
const hex = (v) => createHash('sha256').update(v).digest('hex');
const ENV = { identity: 'sentinel-forge-world', version: '1' };
const OBS = (t) => `obs-${t}`;
const src = (kind, sourceId = `${kind.toLowerCase()}-1`) => ({ sourceId, kind });
const e0 = (path, value, t, extra = {}) => createEpistemicRecord({ path, value, epistemicClass: 'E0', source: src('ENVIRONMENT_OBSERVATION'), sourceStateHash: OBS(t), timestamp: { logicalTime: t }, confidence: 1, ...extra });
const e3 = (path, value, t, target = t + 1) => createEpistemicRecord({ path, value, epistemicClass: 'E3', source: src('PREDICTIVE_MODEL'), sourceStateHash: OBS(t), timestamp: { logicalTime: t, targetTime: target }, confidence: 0.99 });
const withObs = (...times) => times.reduce((s, t) => registerObservation(s, { logicalTime: t, observationHash: OBS(t) }), createEpistemicState({ environment: ENV }));
const run = (state, records, opts = {}) => records.reduce((acc, r) => { const out = admit(acc.state, r, opts); acc.decisions.push(out.decision); acc.flags.push(...out.flags); acc.state = out.state; return acc; }, { state, decisions: [], flags: [] });

test('1. Stage 3F freeze and certificate hashes are bound, and the inherited facts are unchanged', () => {
  const freeze = json(STAGE3F_INHERITANCE.FREEZE_FILE); const cert = json(STAGE3F_INHERITANCE.CERTIFICATE_FILE);
  const { freezeHash, ...fb } = freeze; const { certificationHash, ...cb } = cert;
  assert.equal(freezeHash, '41748ff68ff16e6a137b53b72eb7203cb62aa0e761bf15c19f7a13b73d4b79a9');
  assert.equal(hex(JSON.stringify(fb)), freezeHash);
  assert.equal(certificationHash, '0fe5d3e24f71015b76f5997771f2474712d2764bc049fc2e90e0144f8d2a08ce');
  assert.equal(hex(JSON.stringify(cb)), certificationHash);
  assert.equal(cert.status, 'PASS'); assert.equal(cert.conclusion.STAGE3F_STATUS, 'FROZEN'); assert.equal(cert.conclusion.READY_FOR_STAGE3G, true);
  assert.equal(hex(JSON.stringify(freeze.sections.immutableFacts)), STAGE3F_INHERITANCE.IMMUTABLE_FACTS_HASH);
  assert.deepEqual(freeze.sections.immutableFacts.values, STAGE3F_INHERITANCE.FACTS);
  assert.equal(freeze.sections.epistemicProvenance.EPISTEMIC_LEVEL_SCHEMA, 'TO_BE_DEFINED_IN_STAGE3G');
  assert.deepEqual(freeze.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
});

test('2. the epistemic schema is deterministic, complete and bound to the committed plan', () => {
  assert.equal(sha256(EPISTEMIC_SCHEMA), EPISTEMIC_SCHEMA_HASH);
  assert.deepEqual(Object.keys(EPISTEMIC_CLASSES), ['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'EU']);
  for (const f of ['epistemicClass', 'source', 'sourceStateHash', 'timestamp', 'confidence', 'validity', 'invalidationReason', 'verificationStatus']) assert.ok(RECORD_FIELDS.includes(f), f);
  const r = e0(['entities', 'actor', 'x'], 3, 0);
  for (const f of RECORD_FIELDS) assert.ok(f in r, `record carries ${f}`);
  assert.equal(PROMOTION_RULES.length, 12);
  assert.deepEqual(Object.keys(CONTAMINATION_FLAGS), ['STALE_ASSUMPTION', 'UNSUPPORTED_ASSUMPTION', 'STALE_PLAN', 'CONTRADICTED_STATE', 'UNVERIFIED_STATE_PROMOTION']);
  const file = json(PLAN_PATH);
  assert.equal(file.planHash, PLAN_HASH); assert.equal(file.plan.schemas.epistemic.hash, EPISTEMIC_SCHEMA_HASH);
  assert.equal(PLAN.authority.tier, 'R0'); assert.equal(EPISTEMIC_SCHEMA.authority.canDispatch, false);
});

test('3. provenance: records are validated, immutable and content-addressed', () => {
  const a = e0(['entities', 'x'], 1, 0); const b = e0(['entities', 'x'], 1, 0);
  assert.equal(a.recordId, b.recordId); assert.ok(Object.isFrozen(a));
  assert.throws(() => createEpistemicRecord({ path: ['p'], value: 1, epistemicClass: 'E9', source: src('ENVIRONMENT_OBSERVATION'), sourceStateHash: 'h', timestamp: { logicalTime: 0 }, confidence: 1 }));
  assert.throws(() => createEpistemicRecord({ path: ['p'], value: 1, epistemicClass: 'E0', source: src('ENVIRONMENT_OBSERVATION'), sourceStateHash: 'h', timestamp: { logicalTime: 0 }, confidence: 0.5 }), /exact/);
  assert.throws(() => createEpistemicRecord({ path: ['p'], value: 1, epistemicClass: 'EU', source: src('MEMORY'), sourceStateHash: 'h', timestamp: { logicalTime: 0 }, confidence: null }), /EU/);
  assert.throws(() => createEpistemicRecord({ path: ['p'], value: 1, epistemicClass: 'E1', source: src('DETERMINISTIC_DERIVATION'), sourceStateHash: 'h', timestamp: { logicalTime: 0 }, confidence: 1 }), /derivation/);
  assert.throws(() => createEpistemicRecord({ path: ['p'], value: 1, epistemicClass: 'E0', source: { sourceId: 's', kind: 'NOPE' }, sourceStateHash: 'h', timestamp: { logicalTime: 0 }, confidence: 1 }));
  assert.throws(() => createEpistemicRecord({ path: ['p'], value: 1, epistemicClass: 'E0', source: src('ENVIRONMENT_OBSERVATION'), sourceStateHash: '', timestamp: { logicalTime: 0 }, confidence: 1 }));
  assert.equal(a.validity, 'VALID'); assert.equal(a.verificationStatus, 'NOT_REQUIRED'); assert.equal(e3(['p'], 1, 0).verificationStatus, 'UNVERIFIED');
  const tampered = { ...a, value: 2 };
  const out = admit(withObs(0), tampered); assert.equal(out.decision, 'REFUSED'); assert.equal(out.rule, 'RECORD_DIGEST');
});

test('4. a prediction never becomes authoritative: E3 stays provisional, re-labelling is refused and flagged', () => {
  const s0 = withObs(0, 1);
  const p = e3(['entities', 'h1', 'x'], 5, 0, 1);
  const out = admit(s0, p);
  assert.equal(out.decision, 'ADMITTED_PROVISIONAL');
  assert.equal(readAuthoritative(out.state, ['entities', 'h1', 'x']).epistemicClass, 'EU');
  assert.equal(readAuthoritative(out.state, ['entities', 'h1', 'x']).value, null);
  const asked = admit(s0, e3(['entities', 'h1', 'y'], 5, 0), { requestedLane: 'AUTHORITATIVE' });
  assert.equal(asked.decision, 'REFUSED'); assert.deepEqual(asked.flags, ['UNVERIFIED_STATE_PROMOTION']);
  const promo = requestPromotion(out.state, p.recordId, 'E0');
  assert.equal(promo.decision, 'REFUSED'); assert.equal(promo.rule, 'P1_CLASS_IMMUTABLE');
  assert.equal(promo.state.records[p.recordId].epistemicClass, 'E3');
  const high = createEpistemicRecord({ path: ['entities', 'h1', 'x'], value: 5, epistemicClass: 'E3', source: src('PREDICTIVE_MODEL'), sourceStateHash: OBS(0), timestamp: { logicalTime: 0 }, confidence: 1 });
  assert.equal(admit(out.state, high).decision, 'ADMITTED_PROVISIONAL', 'confidence 1 does not make a prediction authoritative');
  /* a model cannot label its prediction E0 */
  const fake = createEpistemicRecord({ path: ['entities', 'h1', 'x'], value: 5, epistemicClass: 'E0', source: src('PREDICTIVE_MODEL'), sourceStateHash: OBS(0), timestamp: { logicalTime: 0 }, confidence: 1 });
  const f = admit(s0, fake); assert.equal(f.decision, 'REFUSED'); assert.equal(f.rule, 'P1_CLASS_IMMUTABLE'); assert.deepEqual(f.flags, ['UNVERIFIED_STATE_PROMOTION']);
});

test('5. counterfactual and synthetic values never enter runtime state; synthetic cannot masquerade as observed', () => {
  const s0 = withObs(0);
  const cf = createEpistemicRecord({ path: ['entities', 'a', 'x'], value: 1, epistemicClass: 'E4', source: src('COUNTERFACTUAL_MODEL'), sourceStateHash: OBS(0), timestamp: { logicalTime: 0 }, confidence: 0.9 });
  assert.equal(admit(s0, cf).rule, 'P4_COUNTERFACTUAL_EXCLUDED');
  assert.deepEqual(admit(s0, cf, { requestedLane: 'AUTHORITATIVE' }).flags, ['UNVERIFIED_STATE_PROMOTION']);
  const syn = createEpistemicRecord({ path: ['entities', 'a', 'x'], value: 1, epistemicClass: 'E5', source: src('SYNTHETIC_GENERATOR'), sourceStateHash: OBS(0), timestamp: { logicalTime: 0 }, confidence: 1 });
  assert.equal(admit(s0, syn).rule, 'P5_SYNTHETIC_EXCLUDED');
  for (const kind of ['SYNTHETIC_GENERATOR', 'SIMULATOR_ORACLE']) {
    const masquerade = createEpistemicRecord({ path: ['entities', 'a', 'x'], value: 1, epistemicClass: 'E0', source: src(kind), sourceStateHash: OBS(0), timestamp: { logicalTime: 0 }, confidence: 1 });
    const out = admit(s0, masquerade); assert.equal(out.rule, 'P5_SYNTHETIC_EXCLUDED'); assert.deepEqual(out.flags, ['UNVERIFIED_STATE_PROMOTION']);
    assert.equal(readAuthoritative(out.state, ['entities', 'a', 'x']).epistemicClass, 'EU');
  }
  const priv = e0(['entities', 'a', 'x'], 1, 0, { access: 'PRIVILEGED' });
  assert.equal(admit(s0, priv).rule, 'P11_ACCESS');
  const oracle = e0(['entities', 'a', 'x'], 1, 0, { access: 'ORACLE' });
  assert.equal(admit(s0, oracle).rule, 'P11_ACCESS');
});

test('6. observations are bound to their source state: replayed or unregistered observations are refused', () => {
  const s = withObs(0, 1);
  const wrong = createEpistemicRecord({ path: ['e', 'x'], value: 1, epistemicClass: 'E0', source: src('ENVIRONMENT_OBSERVATION'), sourceStateHash: OBS(0), timestamp: { logicalTime: 1 }, confidence: 1 });
  assert.equal(admit(s, wrong).rule, 'P7_SOURCE_STATE_BINDING');
  const unregistered = e0(['e', 'x'], 1, 7);
  assert.equal(admit(s, unregistered).rule, 'P7_SOURCE_STATE_BINDING');
  assert.throws(() => registerObservation(s, { logicalTime: 1, observationHash: 'other' }), /already registered/);
});

test('7. recency: historical memory never overwrites a newer observation; equal-time conflicts contradict', () => {
  const s = withObs(1, 2, 3);
  const newer = e0(['e', 'x'], 5, 2); const older = e0(['e', 'x'], 4, 1);
  let r = run(s, [newer, older]);
  assert.deepEqual(r.decisions, ['ADMITTED_AUTHORITATIVE', 'RECORDED_HISTORICAL']);
  assert.equal(readAuthoritative(r.state, ['e', 'x']).value, 5);
  const memory = createEpistemicRecord({ path: ['e', 'x'], value: 4, epistemicClass: 'E0', source: src('MEMORY'), sourceStateHash: OBS(2), timestamp: { logicalTime: 2 }, confidence: 1 });
  r = run(r.state, [memory]); assert.deepEqual(r.decisions, ['RECORDED_HISTORICAL']); assert.equal(readAuthoritative(r.state, ['e', 'x']).value, 5);
  const conflict = createEpistemicRecord({ path: ['e', 'x'], value: 6, epistemicClass: 'E0', source: src('ENVIRONMENT_OBSERVATION', 'sensor-2'), sourceStateHash: OBS(2), timestamp: { logicalTime: 2 }, confidence: 1 });
  r = run(r.state, [conflict]); assert.deepEqual(r.decisions, ['CONTRADICTED']); assert.deepEqual(r.flags, ['CONTRADICTED_STATE']);
  const read = readAuthoritative(r.state, ['e', 'x']); assert.equal(read.epistemicClass, 'EU'); assert.equal(read.contradicted, true);
  r = run(r.state, [e0(['e', 'x'], 7, 3)]); assert.deepEqual(r.decisions, ['ADMITTED_AUTHORITATIVE']); assert.equal(readAuthoritative(r.state, ['e', 'x']).value, 7);
  const same = run(withObs(1), [e0(['e', 'y'], 1, 1), createEpistemicRecord({ path: ['e', 'y'], value: 1, epistemicClass: 'E0', source: src('ENVIRONMENT_OBSERVATION', 's2'), sourceStateHash: OBS(1), timestamp: { logicalTime: 1 }, confidence: 1 })]);
  assert.deepEqual(same.decisions, ['ADMITTED_AUTHORITATIVE', 'CORROBORATED']);
});

test('8. derivation taint: E1 only from valid E0/E1/E2 inputs; anything derived from a prediction stays a prediction', () => {
  assert.equal(deriveClass(['E0', 'E1']), 'E1'); assert.equal(deriveClass(['E0', 'E2']), 'E1'); assert.equal(deriveClass(['E0', 'E3']), 'E3');
  assert.equal(deriveClass(['E1', 'E4']), 'E4'); assert.equal(deriveClass(['E0', 'E5']), 'E5'); assert.throws(() => deriveClass([]));
  const s = withObs(0);
  const ax = e0(['actor', 'x'], 2, 0); const ex = e0(['e', 'x'], 5, 0); const p = e3(['e', 'future'], 6, 0);
  let r = run(s, [ax, ex, p]);
  const d = (inputs, cls = 'E1', hash = derivationInputsHash(inputs)) => createEpistemicRecord({ path: ['e', 'dx'], value: 3, epistemicClass: cls, source: src(cls === 'E1' ? 'DETERMINISTIC_DERIVATION' : 'PREDICTIVE_MODEL'),
    sourceStateHash: hash, timestamp: { logicalTime: 0 }, confidence: cls === 'E1' ? 1 : 0.9, derivation: { method: 'difference', inputRecordIds: inputs.map((x) => x.recordId) } });
  const ok = admit(r.state, d([ax, ex])); assert.equal(ok.decision, 'ADMITTED_AUTHORITATIVE');
  const tainted = admit(r.state, d([ax, p])); assert.equal(tainted.rule, 'P8_DERIVATION_TAINT'); assert.deepEqual(tainted.flags, ['UNVERIFIED_STATE_PROMOTION']);
  assert.equal(admit(r.state, d([ax, ex], 'E1', 'wrong')).rule, 'P8_DERIVATION_TAINT');
  const ghost = e0(['ghost'], 1, 0);
  assert.deepEqual(admit(r.state, d([ax, ghost])).flags, ['UNSUPPORTED_ASSUMPTION']);
  r = run(r.state, [d([ax, p], 'E3')]); assert.deepEqual(r.decisions, ['ADMITTED_PROVISIONAL'], 'honestly labelled, it is a prediction');
});

test('9. E2 requires a registered trusted verifier (the Forge registry is empty)', () => {
  const rec = (verifierId) => createEpistemicRecord({ path: ['e', 'x'], value: 1, epistemicClass: 'E2', source: src('TRUSTED_VERIFIER', verifierId), sourceStateHash: 'v', timestamp: { logicalTime: 0 }, confidence: 0.99, verification: { verifierId } });
  assert.equal(admit(withObs(0), rec('auditor')).rule, 'P9_TRUSTED_VERIFIER');
  const trusted = createEpistemicState({ environment: ENV, trustedVerifiers: ['auditor'] });
  assert.equal(admit(trusted, rec('auditor')).decision, 'ADMITTED_AUTHORITATIVE');
  assert.deepEqual(EPISTEMIC_SCHEMA.forgeTrustedVerifiers, []);
});

test('10. staleness: a newer observation supersedes, stales derived values and resolves predictions', () => {
  const s = withObs(0, 1);
  const ax = e0(['actor', 'x'], 2, 0); const ex = e0(['e', 'x'], 5, 0);
  const dx = createEpistemicRecord({ path: ['e', 'dx'], value: 3, epistemicClass: 'E1', source: src('DETERMINISTIC_DERIVATION'), sourceStateHash: derivationInputsHash([ax, ex]),
    timestamp: { logicalTime: 0 }, confidence: 1, derivation: { method: 'difference', inputRecordIds: [ax.recordId, ex.recordId] } });
  const right = e3(['e', 'x'], 6, 0, 1); const wrong = createEpistemicRecord({ path: ['e', 'x'], value: 9, epistemicClass: 'E3', source: src('PREDICTIVE_MODEL', 'm2'), sourceStateHash: OBS(0), timestamp: { logicalTime: 0, targetTime: 1 }, confidence: 0.8 });
  const later = e3(['e', 'x'], 7, 0, 5);
  let r = run(s, [ax, ex, dx, right, wrong, later]);
  r = run(r.state, [e0(['e', 'x'], 6, 1)]);
  assert.equal(recordStatus(r.state, ex.recordId).validity, 'SUPERSEDED');
  assert.equal(recordStatus(r.state, dx.recordId).validity, 'STALE'); assert.equal(recordStatus(r.state, dx.recordId).invalidationReason, 'INPUT_SUPERSEDED');
  assert.equal(recordStatus(r.state, right.recordId).verificationStatus, 'CONFIRMED');
  assert.equal(recordStatus(r.state, wrong.recordId).verificationStatus, 'REFUTED');
  assert.equal(recordStatus(r.state, later.recordId).verificationStatus, 'UNVERIFIED', 'a prediction about a later time is not resolved early');
  assert.equal(readAuthoritative(r.state, ['e', 'x']).value, 6, 'the authoritative value is the observation, not the confirmed prediction');
  assert.equal(readAuthoritative(r.state, ['e', 'x']).epistemicClass, 'E0');
  assert.equal(readProvisional(r.state, ['e', 'x']).length, 3);
});

test('11. task-state contamination flags are tracked, and they are diagnostics without authority', () => {
  const s = withObs(0, 1);
  const ax = e0(['actor', 'x'], 2, 0); const p = e3(['e', 'x'], 6, 0, 3);
  let r = run(s, [ax, p]);
  const plan = { paths: [['actor', 'x']], formedAgainstDigest: authoritativeDigest(r.state, [['actor', 'x']]) };
  const clean = auditContamination(r.state, { assumptions: [{ path: ['actor', 'x'], recordId: ax.recordId, usedAs: 'AUTHORITATIVE' }], plan });
  assert.equal(clean.contaminated, false);
  r = run(r.state, [e0(['actor', 'x'], 3, 1)]);
  r = run(r.state, [e3(['e', 'z'], 1, 1)], { requestedLane: 'AUTHORITATIVE' });
  const before = stableStringify(r.state);
  const audit = auditContamination(r.state, { assumptions: [
    { path: ['actor', 'x'], recordId: ax.recordId, usedAs: 'AUTHORITATIVE' },
    { path: ['e', 'x'], recordId: p.recordId, usedAs: 'AUTHORITATIVE' },
    { path: ['missing'], recordId: null, usedAs: 'AUTHORITATIVE' },
  ], plan });
  assert.equal(stableStringify(r.state), before, 'the audit never alters state');
  assert.ok(audit.flags.STALE_ASSUMPTION >= 1); assert.ok(audit.flags.UNSUPPORTED_ASSUMPTION >= 2); assert.equal(audit.flags.STALE_PLAN, 1);
  assert.ok(audit.flags.UNVERIFIED_STATE_PROMOTION >= 2);
  assert.equal(audit.authority, 'NONE'); assert.equal(audit.vote, false); assert.equal(audit.affectsDecision, false);
  assert.deepEqual(DIAGNOSTIC_AUTHORITY, { authority: 'NONE', vote: false, affectsDecision: false, note: 'contamination flags are diagnostics, not expert votes' });
  const conflict = run(withObs(0), [e0(['q'], 1, 0), createEpistemicRecord({ path: ['q'], value: 2, epistemicClass: 'E0', source: src('ENVIRONMENT_OBSERVATION', 's2'), sourceStateHash: OBS(0), timestamp: { logicalTime: 0 }, confidence: 1 })]);
  assert.equal(auditContamination(conflict.state, { assumptions: [{ path: ['q'], recordId: null, usedAs: 'AUTHORITATIVE' }] }).flags.CONTRADICTED_STATE, 1);
  assert.equal(readAuthoritative(r.state, ['actor', 'x']).value, 3, 'flags do not change what is read');
});

test('12. deterministic replay and a randomized promotion-safety property', () => {
  const classes = ['E0', 'E1', 'E3', 'E4', 'E5', 'EU']; const kinds = { E0: 'ENVIRONMENT_OBSERVATION', E1: 'DETERMINISTIC_DERIVATION', E3: 'PREDICTIVE_MODEL', E4: 'COUNTERFACTUAL_MODEL', E5: 'SYNTHETIC_GENERATOR', EU: 'MEMORY' };
  const sequence = (seed) => {
    const rand = createSeededRandom(seed); const out = [];
    for (let i = 0; i < 120; i += 1) {
      const cls = classes[Math.floor(rand() * classes.length)]; const t = Math.floor(rand() * 5); const p = ['a', 'b', 'c'][Math.floor(rand() * 3)];
      const masquerade = rand() < 0.1;
      if (cls === 'E1') continue;
      const eff = masquerade ? 'E0' : cls;
      out.push({ rec: createEpistemicRecord({ path: [p], value: eff === 'EU' ? null : Math.floor(rand() * 3), epistemicClass: eff,
        source: { sourceId: `s${Math.floor(rand() * 3)}`, kind: masquerade ? 'SYNTHETIC_GENERATOR' : kinds[cls] }, sourceStateHash: OBS(t), timestamp: { logicalTime: t, targetTime: t + 1 },
        confidence: eff === 'EU' ? null : eff === 'E0' ? 1 : 0.7 }), lane: rand() < 0.2 ? 'AUTHORITATIVE' : null });
    }
    return out;
  };
  for (const seed of [1, 2, 3, 4, 5]) {
    const go = () => sequence(seed).reduce((s, x) => admit(s, x.rec, { requestedLane: x.lane }).state, withObs(0, 1, 2, 3, 4));
    const a = go(); const b = go();
    assert.equal(stableStringify(a), stableStringify(b), 'byte-identical replay');
    const lastTime = {};
    for (const [key, slot] of Object.entries(a.slots)) {
      if (slot.authoritative === null) continue;
      const r = a.records[slot.authoritative];
      assert.ok(['E0', 'E1', 'E2'].includes(r.epistemicClass)); assert.equal(r.access, 'DEPLOYABLE');
      assert.ok(!['SYNTHETIC_GENERATOR', 'SIMULATOR_ORACLE'].includes(r.source.kind));
      const hist = slot.history.map((id) => a.records[id].timestamp.logicalTime);
      assert.ok(hist.every((t) => t <= r.timestamp.logicalTime), `${key}: history never newer than the authoritative record`);
      lastTime[key] = r.timestamp.logicalTime;
    }
  }
});

test('13. compatibility with SENTINEL_WORLD_STATE_V1: only the authoritative lane projects', () => {
  assert.equal(WORLD_STATE_V1_PROJECTION.E0.category, 'OBSERVED'); assert.equal(WORLD_STATE_V1_PROJECTION.E1.category, 'DERIVED');
  assert.equal(WORLD_STATE_V1_PROJECTION.EU.category, 'UNKNOWN'); assert.match(WORLD_STATE_V1_PROJECTION.E3, /NOT_PROJECTED/);
  for (const c of ['E2', 'E4', 'E5']) assert.equal(WORLD_STATE_V1_PROJECTION[c], null);
});
