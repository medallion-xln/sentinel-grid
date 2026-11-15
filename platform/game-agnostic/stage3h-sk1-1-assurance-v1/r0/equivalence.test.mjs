// SK1.1 Phase 6 — the envelope changes no SK1 decision.
//   * committed demo fixtures: always (clean-checkout runnable)
//   * all 600 frozen SK1 VALIDATION classes: when the privileged local class records are present; skipped otherwise
// The second test replays PUBLIC requests and compares decision hashes with the committed per-class record. It reads no
// outcome, computes no metric and writes nothing: it is replay verification, not an evaluation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAssuredApi, SK1_LANE } from './assured-api.mjs';
import { replayValidationThroughEnvelope, validationDataPresent, SK1_EVIDENCE_SOURCES } from './equivalence.mjs';
import { fixture, serve, SOURCES } from './test-helpers.mjs';

test('[P6-EQ] demo fixtures: the envelope returns the decision hashes committed in SK1_DEMO_RECORD.json', () => {
  const demo = JSON.parse(readFileSync(resolve(SK1_LANE, 'evidence/SK1_DEMO_RECORD.json'), 'utf8')), api = createAssuredApi({ game: 'forge' });
  assert.equal(demo.decisions.length, 2);
  for (const d of demo.decisions) { const env = serve(api, fixture(d.fixture)); assert.equal(env.decisionHash, d.decisionHash, d.fixture); assert.equal(env.record.recommendedActionOrAbstention.kind, d.kind); }
  assert.deepEqual(SK1_EVIDENCE_SOURCES, SOURCES);
});
test('[P6-EQ] all 600 frozen validation classes: same decision hash, kind and forced set as the committed SK1 result; none refused', { skip: validationDataPresent() ? false : 'privileged validation class records are absent (clean checkout) — replay not possible here' }, () => {
  const r = replayValidationThroughEnvelope();
  assert.equal(r.resultSha256, '239c16bc210adef28e7cdef40ecd14298625ee26e08c13f45ad146988a3622b1', 'the committed SK1 result file is unchanged');
  assert.deepEqual({ classes: r.classes, served: r.served, refused: r.refusedByEnvelope, hash: r.decisionHashEqual, kind: r.kindEqual, set: r.forcedSetEqual, verified: r.envelopeVerified, recommend: r.recommend, abstain: r.abstain, mismatches: r.mismatches },
    { classes: 600, served: 600, refused: {}, hash: 600, kind: 600, set: 600, verified: 600, recommend: 304, abstain: 296, mismatches: [] });
  assert.equal(r.equivalent, true);
});
