// SK1.1 Phase 6 — the twelve verification items, exercised through the assured envelope on the committed public demo
// fixtures (clean-checkout runnable). Where the frozen kernel behaves differently from the envelope, the frozen
// behaviour is asserted too, so each recorded finding (F1-F7) has a reproducing test. Nothing here modifies the frozen
// lane, and no test reads an outcome or evaluator truth.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecommendationApi } from '../../stage3h-sk1-safety-kernel-v1/api/recommend.mjs';
import { createKernel } from '../../stage3h-sk1-safety-kernel-v1/kernel/index.mjs';
import { digest } from '../../stage3h-sk1-safety-kernel-v1/kernel/contract.mjs';
import { D4_FRAMES } from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/projection.mjs';
import { syntheticProjection, syntheticEvidence, toyModel, forgeRequest } from '../../stage3h-sk1-safety-kernel-v1/tests/helpers.mjs';
import { createAssuredApi, declarationFor, verifyEnvelope, assertMenuIntegrity, assertOutputLabels, assertNumericSerialization, assertRecordHash, separatedView, tieSummary,
  looksLikeExecution, looksPrivileged, ASSURED_API_VERSION, LABELS, REQUIRED_AUTHORITY, PINS } from './assured-api.mjs';
import { fixture, clone, decl, serve, rejects, setOf, deepFreeze, permuteMenu, relabelNodes, frameRequest, semanticsOf, rescueRequest, SOURCES } from './test-helpers.mjs';

const api = createAssuredApi({ game: 'forge' }), frozen = createRecommendationApi({ game: 'forge' });
const REC = fixture('recommend'), ABS = fixture('abstain');
const frozenCall = (rq, options) => frozen.recommend(rq.state, rq.legalActions, rq.advisoryEvidence, options);
const numbersIn = (v) => (typeof v === 'number' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(numbersIn) : []);

// ------------------------------------------------------------------------------------------- 01 menu integrity
test('[P6-01 menu-integrity] every lawful action is inspected and ranked exactly once; the decision refers only to the menu', () => {
  for (const rq of [REC, ABS]) { const env = serve(api, rq), n = rq.legalActions.length, r = env.record;
    assert.deepEqual(r.rankedActions.map((a) => a.index).sort((a, b) => a - b), [...Array(n).keys()]);
    assert.ok(r.rankedActions.every((a) => a.type === rq.legalActions[a.index].type));
    assert.equal(r.legalActionMenu.size, n); assert.equal(r.legalActionMenu.complete, true); assert.match(r.legalActionMenu.identity, /^[0-9a-f]{64}$/);
    assert.equal(env.assurance.view.deterministicallyEstablished.length, n); assert.equal(env.assurance.checks.LEGAL_MENU_COMPLETE, true);
    assert.ok(setOf(r).every((i) => i >= 0 && i < n)); }
  assert.equal(serve(api, ABS).record.recommendedActionOrAbstention.decisionSet.length, 0);
});
test('[P6-01 menu-integrity] negative controls: a dropped, duplicated, retyped or out-of-menu action is refused', () => {
  const good = () => clone(serve(api, REC).record), abst = () => clone(serve(api, ABS).record), bad = (rec, rq = REC) => rejects(() => assertMenuIntegrity(rq.legalActions, rec), 'MENU_INTEGRITY_VIOLATION');
  assert.doesNotThrow(() => assertMenuIntegrity(REC.legalActions, good())); assert.doesNotThrow(() => assertMenuIntegrity(ABS.legalActions, abst()));
  let r = good(); r.rankedActions.pop(); bad(r);
  r = good(); r.rankedActions[1].index = r.rankedActions[0].index; bad(r);
  r = good(); r.rankedActions[0].type = 'ATTACK'; bad(r);
  r = good(); r.recommendedActionOrAbstention.decisionSet[0].index = 99; bad(r);
  r = good(); r.recommendedActionOrAbstention.decisionSet = []; bad(r);
  r = good(); r.legalActionMenu.complete = false; bad(r);
  r = good(); r.rankedActions.find((a) => a.index === 4).risk.upperBound = 0.9; bad(r); // "recommended" above the frozen criterion
  r = good(); r.rankedActions.find((a) => a.index === 4).constraintOutcome.excluded = true; bad(r); // "recommended" although excluded
  r = good(); r.rankedActions.reverse(); bad(r); // rank order broken
  r = abst(); r.recommendedActionOrAbstention.decisionSet = [{ index: 0, type: ABS.legalActions[0].type }]; bad(r, ABS); // an abstention that selects
  r = abst(); r.recommendedActionOrAbstention.bestEffortNotRecommended.note = 'recommended'; bad(r, ABS); // best effort not labelled
});
test('[P6-01 menu-integrity] inputs are never mutated: deep-frozen requests are served', () => {
  for (const rq of [REC, ABS]) { const f = deepFreeze(clone(rq)), before = digest(f), env = serve(api, f, deepFreeze(decl())); assert.equal(digest(f), before); assert.equal(env.assurance.checks.INPUTS_NOT_MUTATED, true); assert.equal(env.record.sourceIdentity.requestHash, before); }
});

// --------------------------------------------------------------------------------------- 02 evidence provenance
test('[P6-02 evidence-provenance] the envelope records declared sources, contract, validation status and an evidence digest', () => {
  const p = serve(api, REC).assurance.evidenceProvenance;
  assert.equal(p.contract, 'SK1_ADVISORY_EVIDENCE_V1'); assert.equal(p.present, true); assert.deepEqual(p.expertsPresent, ['NEXUS', 'S0']); assert.deepEqual(p.kinds, { NEXUS: 'RECOMMENDATION_PROJECTION', S0: 'PUBLIC_SCORE' });
  assert.deepEqual(p.declaredSources, clone(SOURCES)); assert.equal(p.evidenceDigest, digest(REC.advisoryEvidence)); assert.deepEqual(p.kernelValidation, { status: 'VALID', issues: [] });
  assert.equal(p.authenticated, false); assert.equal(p.verification, 'DECLARED_BY_CALLER_NOT_AUTHENTICATED'); // declared, not proven
});
test('[P6-02 evidence-provenance] evidence without a matching source declaration is refused', () => {
  rejects(() => serve(api, REC, decl({ evidenceSources: null })), 'EVIDENCE_PROVENANCE_MISSING');
  rejects(() => serve(api, REC, decl({ evidenceSources: { S0: SOURCES.S0 } })), 'EVIDENCE_PROVENANCE_MISMATCH');
  rejects(() => serve(api, REC, decl({ evidenceSources: { ...clone(SOURCES), NEXUS: { producer: 'x', projection: 'PUBLIC_SCORE' } } })), 'EVIDENCE_PROVENANCE_MISMATCH');
  rejects(() => serve(api, REC, decl({ evidenceSources: { ...clone(SOURCES), S0: { producer: '', projection: 'PUBLIC_SCORE' } } })), 'EVIDENCE_PROVENANCE_MISSING');
  rejects(() => serve(api, REC, decl({ evidenceSources: { ...clone(SOURCES), S0: { ...SOURCES.S0, signature: 'abc' } } })), 'EVIDENCE_PROVENANCE_MISMATCH');
  rejects(() => serve(api, { ...REC, advisoryEvidence: null }, decl()), 'EVIDENCE_SOURCES_DECLARED_WITHOUT_EVIDENCE');
});
test('[P6-02 evidence-provenance] absent evidence passes through to the frozen abstention; nothing is invented', () => {
  const env = serve(api, { ...REC, advisoryEvidence: null }, decl({ evidenceSources: null })), d = env.record.recommendedActionOrAbstention;
  assert.equal(d.kind, 'ABSTAIN'); assert.equal(d.reason, 'ABSTAIN_NO_SUPPORTED_RISK_ESTIMATE'); assert.equal(env.record.evidence.status, 'ABSENT');
  assert.equal(env.assurance.evidenceProvenance.present, false); assert.equal(env.assurance.evidenceProvenance.verification, 'NO_EVIDENCE_SUPPLIED'); assert.equal(env.assurance.view.empiricalEstimates.length, 0);
  assert.equal(env.decisionHash, frozenCall({ ...REC, advisoryEvidence: null }).decisionHash);
});

// ------------------------------------------------------------------------ 03 risk vs deterministic separation
test('[P6-03 separation] deterministic constraint outcomes, empirical estimates and unknown items are disjoint sections', () => {
  const env = serve(api, REC), v = env.assurance.view;
  assert.deepEqual(Object.keys(v).sort(), ['deterministicallyEstablished', 'empiricalEstimates', 'statement', 'unsupportedOrUnknown']);
  assert.ok(v.deterministicallyEstablished.every((a) => numbersIn({ ...a, index: null }).length === 0), 'no risk number in the deterministic section');
  assert.ok(v.empiricalEstimates.length > 0 && v.empiricalEstimates.every((a) => a.kind === 'EMPIRICAL_ESTIMATE' && a.basis === 'LEARNED_FROM_FINITE_DEVELOPMENT_DATA_NOT_A_GUARANTEE'));
  assert.ok(v.empiricalEstimates.every((a) => !('establishedConstraints' in a) && !('violatedHardConstraints' in a)));
  for (const a of v.empiricalEstimates) assert.equal(a.withinFrozenRiskCriterion, a.riskUpperBound <= PINS.model.ranking.tau);
  // an estimate is never worded as an established property: no "safe" label anywhere in what the envelope adds
  assert.ok(!/safe(?!ty)/i.test(JSON.stringify(env.assurance)), 'the assurance block never calls an action safe');
  assert.equal(env.record.safetyAssessment.status, 'EMPIRICAL_ESTIMATE_NOT_A_GUARANTEE'); assert.ok(env.record.rankedActions.every((a) => a.risk.kind === 'EMPIRICAL_ESTIMATE'));
});
test('[P6-03 separation] a hard public constraint excludes an action deterministically; its estimate stays an estimate and it is never selected', () => {
  const rq = clone(REC); rq.legalActions[0].energyAfter = -1; // PROTECT would leave negative energy: publicly established, deterministic
  const env = serve(api, rq), det = env.assurance.view.deterministicallyEstablished.find((a) => a.index === 0);
  assert.equal(det.excludedByPublicConstraint, true); assert.deepEqual(det.violatedHardConstraints, ['ENERGY_AFTER_NON_NEGATIVE']); assert.ok(!setOf(env.record).includes(0));
  assert.equal(env.assurance.view.deterministicallyEstablished.filter((a) => a.excludedByPublicConstraint).length, 1, 'nothing else is removed');
  assert.equal(env.record.rankedActions.at(-1).index, 0); assert.equal(env.record.rankedActions.length, rq.legalActions.length);
});

// ----------------------------------------------------------------------------------------- 04 unknown state
test('[P6-04 unknown-state] a missing public field the frozen kernel reports: no estimate is invented, the abstention passes through', () => {
  const rq = clone(REC); delete rq.state.projection.actor.energy;
  const env = serve(api, rq), v = env.assurance.view;
  assert.equal(env.record.recommendedActionOrAbstention.kind, 'ABSTAIN'); assert.equal(env.record.recommendedActionOrAbstention.reason, 'ABSTAIN_NO_SUPPORTED_RISK_ESTIMATE');
  assert.equal(v.empiricalEstimates.length, 0); assert.equal(v.unsupportedOrUnknown.length, rq.legalActions.length); assert.ok(v.unsupportedOrUnknown.every((a) => a.riskStatus === 'UNSUPPORTED_MISSING_INFORMATION' && a.riskEstimateAvailable === false));
  assert.equal(env.decisionHash, frozenCall(rq).decisionHash);
});
test('[P6-04 unknown-state] uncertain effects and unestablished preconditions are listed as unknown, not as established', () => {
  const rq = clone(REC); rq.legalActions[1].eff = ['ACTOR_DISPLACEMENT:EU', 'ENERGY_DELTA:E1', 'TICK_ADVANCE:E1']; rq.legalActions[1].pre = [...rq.legalActions[1].pre, 'DESTINATION_FREE_OF_HIDDEN_HAZARD:NOT_OBSERVED'];
  const v = serve(api, rq).assurance.view, u = v.unsupportedOrUnknown.find((a) => a.index === 1), d = v.deterministicallyEstablished.find((a) => a.index === 1);
  assert.deepEqual(u.uncertainEffects, ['ACTOR_DISPLACEMENT']); assert.deepEqual(u.unknownConstraints, ['DESTINATION_FREE_OF_HIDDEN_HAZARD']);
  assert.ok(!d.deterministicEffects.includes('ACTOR_DISPLACEMENT')); assert.ok(!d.establishedConstraints.some((c) => c.code === 'DESTINATION_FREE_OF_HIDDEN_HAZARD'));
  assert.equal(d.excludedByPublicConstraint, false, 'an unknown precondition never removes a lawful action');
});
test('[P6-04 unknown-state] FINDING F3: the frozen kernel gives an out-of-vocabulary action type or entity kind a SUPPORTED estimate; the envelope refuses', () => {
  const a = clone(REC); a.legalActions[0].type = 'TELEPORT';
  assert.equal(frozenCall(a).rankedActions.find((x) => x.index === 0).riskStatus, 'ESTIMATED', 'frozen behaviour, recorded not patched');
  rejects(() => serve(api, a), 'INPUT_OUTSIDE_ADAPTER_VOCABULARY');
  const b = clone(REC); b.state.projection.nodes[REC.legalActions[0].target].kind = 'WORMHOLE';
  assert.equal(frozenCall(b).rankedActions.find((x) => x.index === 0).riskStatus, 'ESTIMATED'); rejects(() => serve(api, b), 'INPUT_OUTSIDE_ADAPTER_VOCABULARY');
});
test('[P6-04 unknown-state] FINDING F4: fields the frozen featurizer silently imputes are refused by the envelope', () => {
  const a = clone(REC); delete a.state.projection.terrainCounts;
  assert.ok(frozenCall(a).rankedActions.every((x) => x.riskStatus === 'ESTIMATED'), 'frozen: absent terrain counts become zero hazard cells'); rejects(() => serve(api, a), 'REQUIRED_PUBLIC_FIELD_MISSING');
  const b = clone(REC); delete b.state.projection.history.channels;
  assert.ok(frozenCall(b).rankedActions.every((x) => x.riskStatus === 'ESTIMATED')); rejects(() => serve(api, b), 'REQUIRED_PUBLIC_FIELD_MISSING');
  const c = clone(REC); c.legalActions.forEach((x) => delete x.destTerrain);
  assert.ok(frozenCall(c).rankedActions.every((x) => x.riskStatus === 'ESTIMATED')); rejects(() => serve(api, c), 'REQUIRED_PUBLIC_FIELD_MISSING');
  const d = clone(REC), untargeted = d.state.projection.nodes.findIndex((_, i) => !REC.legalActions.some((x) => x.target === i || x.dependent === i)); delete d.state.projection.nodes[untargeted].flags.threatened;
  assert.ok(frozenCall(d).rankedActions.every((x) => x.riskStatus === 'ESTIMATED'), 'frozen: a missing flag on an untargeted entity counts as false'); rejects(() => serve(api, d), 'REQUIRED_PUBLIC_FIELD_MISSING');
  const e = clone(REC); e.state.extra = 1; rejects(() => serve(api, e), 'UNKNOWN_STATE_FIELD');
  const f = clone(REC); f.legalActions[0].note = 'x'; rejects(() => serve(api, f), 'UNKNOWN_ACTION_FIELD');
  const g = clone(REC); g.legalActions[0].target = 999; rejects(() => serve(api, g), 'ACTION_REFERENCE_OUTSIDE_STATE');
});

// --------------------------------------------------------------------------------------- 05 malformed evidence
test('[P6-05 malformed-evidence] structurally malformed evidence is refused at the envelope', () => {
  const mk = (f) => { const rq = clone(REC); f(rq.advisoryEvidence); return rq; }, bad = (f, code = 'MALFORMED_EVIDENCE') => rejects(() => serve(api, mk(f)), code);
  bad((e) => { e.experts.S0.scores[0] = '1'; }); bad((e) => { e.experts.S0.scores.pop(); }); bad((e) => { e.experts.S0.topSet = []; }); bad((e) => { e.experts.S0.topSet = [99]; });
  bad((e) => { delete e.experts.NEXUS; }); bad((e) => { delete e.experts.S0; }); bad((e) => { e.experts.NEXUS.abstain = 'no'; }); bad((e) => { e.experts.NEXUS.rationaleCodes = [1]; }); bad((e) => { e.experts.NEXUS.reason = { a: 1 }; });
  bad((e) => { e.experts.EXPERT_X = { advice: 'take action 1' }; }); bad((e) => { delete e.experts; }); // the frozen kernel would ignore and report an unknown expert (PARTIAL); the envelope refuses it
  bad((e) => { e.experts.ORACLE_X = { advice: 'take action 1' }; }, 'PRIVILEGED_FIELD_IN_REQUEST'); // an "oracle" expert is refused as privileged before its shape is looked at
  bad((e) => { e.contract = 'SOMETHING_ELSE'; }, 'EVIDENCE_CONTRACT_MISMATCH');
  rejects(() => serve(api, { ...REC, advisoryEvidence: [] }), 'MALFORMED_EVIDENCE'); rejects(() => serve(api, { ...REC, advisoryEvidence: 'S0 says 4' }), 'MALFORMED_EVIDENCE');
});
test('[P6-05 malformed-evidence] contradictory evidence the frozen validator rates INVALID is refused, not served as an abstention', () => {
  const a = clone(REC); a.advisoryEvidence.experts.S0.topSet = [3]; // the lowest-scored action declared "top"
  assert.equal(frozenCall(a).evidence.status, 'INVALID'); assert.equal(frozenCall(a).recommendedActionOrAbstention.kind, 'ABSTAIN'); rejects(() => serve(api, a), 'EVIDENCE_NOT_VALID');
  const b = clone(REC); b.advisoryEvidence.experts.NEXUS.recommendedType = 'ATTACK'; // not in the legal menu
  assert.ok(frozenCall(b).evidence.issues.includes('NEXUS_TYPE_NOT_IN_LEGAL_MENU')); rejects(() => serve(api, b), 'EVIDENCE_NOT_VALID');
  const c = clone(REC); c.advisoryEvidence.experts.NEXUS.abstain = true; rejects(() => serve(api, c), 'EVIDENCE_NOT_VALID'); // abstains but recommends
});
test('[P6-05 malformed-evidence] FINDING F5: the frozen validator accepts a wrong expert `kind` and unknown extra fields; the envelope refuses', () => {
  const a = clone(REC); a.advisoryEvidence.experts.S0.kind = 'ORACLE_ROLLOUT';
  assert.equal(frozenCall(a).evidence.status, 'VALID', 'frozen behaviour, recorded not patched'); assert.equal(frozenCall(a).recommendedActionOrAbstention.kind, 'RECOMMEND'); rejects(() => serve(api, a), 'MALFORMED_EVIDENCE');
  const b = clone(REC); b.advisoryEvidence.experts.S0.handles = ['E7']; assert.equal(frozenCall(b).evidence.status, 'VALID'); rejects(() => serve(api, b), 'MALFORMED_EVIDENCE');
  const c = clone(REC); c.advisoryEvidence.source = 'anything'; assert.equal(frozenCall(c).evidence.status, 'VALID'); rejects(() => serve(api, c), 'MALFORMED_EVIDENCE');
  const d = clone(REC); delete d.advisoryEvidence.experts.NEXUS.kind; assert.equal(frozenCall(d).evidence.status, 'VALID'); rejects(() => serve(api, d), 'MALFORMED_EVIDENCE');
});

// ----------------------------------------------------------------------------------- 06 stable action semantics
test('[P6-06 stable-semantics] the same action keeps its constraints, tier and estimates under menu order, relabelling and all D4 frames', () => {
  for (const rq of [REC, ABS]) {
    const base = serve(api, rq).record, n = rq.legalActions.length, nodes = rq.state.projection.nodes.length;
    const order = [...Array(n).keys()].reverse(), perm = [...Array(nodes).keys()].map((i) => (i * 7 + 3) % nodes);
    assert.equal(new Set(perm).size, nodes);
    const transforms = [['MENU_ORDER', permuteMenu(rq, order)], ['RELABEL', relabelNodes(rq, perm)], ...D4_FRAMES.map((t) => [`D4_${t}`, frameRequest(rq, t)])];
    for (const [name, t] of transforms) {
      const rec = serve(api, t.rq).record;
      assert.equal(rec.recommendedActionOrAbstention.kind, base.recommendedActionOrAbstention.kind, name); assert.equal(rec.recommendedActionOrAbstention.reason, base.recommendedActionOrAbstention.reason, name);
      assert.deepEqual(setOf(rec), setOf(base).map(t.newIndexOf).sort((a, b) => a - b), name);
      for (let i = 0; i < n; i++) assert.deepEqual(semanticsOf(rec, t.newIndexOf(i)), semanticsOf(base, i), `${name} action ${i}`);
      if (!name.startsWith('D4_')) { assert.equal(rec.legalActionMenu.identity, base.legalActionMenu.identity, name); for (let i = 0; i < n; i++) assert.equal(rec.rankedActions.find((a) => a.index === t.newIndexOf(i)).key, base.rankedActions.find((a) => a.index === i).key); }
    }
  }
});

// -------------------------------------------------------------------------------------- 07 deterministic ties
test('[P6-07 ties] equivalent actions are returned together and the result does not depend on menu position', () => {
  const top = setOf(serve(api, REC).record)[0], n = REC.legalActions.length, dup = clone(REC);
  dup.legalActions.push(clone(REC.legalActions[top])); dup.advisoryEvidence.experts.S0.scores.push(REC.advisoryEvidence.experts.S0.scores[top]); dup.advisoryEvidence.experts.S0.topSet = [top, n];
  const env = serve(api, dup), d = env.record.recommendedActionOrAbstention;
  assert.equal(d.kind, 'RECOMMEND'); assert.deepEqual(setOf(env.record), [top, n]); assert.equal(d.tieNote, 'TIE_RESOLVED_WITHIN_EQUIVALENT_ACTIONS');
  assert.deepEqual({ ...env.assurance.tie, assuredRepresentative: null, rule: null }, { decisionSetSize: 2, distinctActionsInSet: 1, indistinguishableDistinctActions: false, singleActionIdentified: true, assuredRepresentative: null, rule: null });
  const order = [...Array(n + 1).keys()].reverse(), t = permuteMenu(dup, order);
  assert.deepEqual(setOf(serve(api, t.rq).record), [top, n].map(t.newIndexOf).sort((a, b) => a - b));
});
test('[P6-07 ties] FINDING F7: exactly tied DISTINCT actions — the frozen `representative` is a listing artefact; the envelope names no single action', () => {
  const { model, feat } = toyModel({ mutate: (m) => { m.heads.regret.bags[0].trees = []; m.heads.risk.bags.forEach((b) => { b.trees = []; }); } }); // a model that cannot tell actions apart (synthetic)
  const r = forgeRequest(syntheticProjection(), syntheticEvidence()), rec = createKernel({ featurizer: feat, model }).recommend(r.state, r.legalActions, r.advisoryEvidence), d = rec.recommendedActionOrAbstention;
  assert.equal(d.decisionSet.length, 5); assert.equal(d.indistinguishableDistinctActions, true); assert.notEqual(d.representative, null, 'frozen record still names a representative');
  const tie = tieSummary(rec); assert.equal(tie.indistinguishableDistinctActions, true); assert.equal(tie.singleActionIdentified, false); assert.equal(tie.assuredRepresentative, null);
  const rev = forgeRequest({ ...syntheticProjection(), menu: [...syntheticProjection().menu].reverse() }, { ...syntheticEvidence(), experts: { ...syntheticEvidence().experts, S0: { kind: 'PUBLIC_SCORE', scores: [...syntheticEvidence().experts.S0.scores].reverse(), topSet: [1] } } });
  assert.equal(createKernel({ featurizer: feat, model }).recommend(rev.state, rev.legalActions, rev.advisoryEvidence).recommendedActionOrAbstention.decisionSet.length, 5, 'the whole set under any menu order');
});
test('[P6-07 ties] repeated calls give byte-identical envelopes', () => { for (const rq of [REC, ABS]) { const h = new Set(Array.from({ length: 5 }, () => serve(api, rq).envelopeHash)); assert.equal(h.size, 1); } });

// --------------------------------------------------------------------- 08 confidence / uncertainty serialization
test('[P6-08 serialization] an envelope survives a JSON round trip unchanged and still verifies; every number is finite', () => {
  for (const rq of [REC, ABS, { ...REC, advisoryEvidence: null }]) { const env = serve(api, rq, rq.advisoryEvidence ? decl() : decl({ evidenceSources: null })), back = JSON.parse(JSON.stringify(env));
    assert.deepEqual(back, env); assert.deepEqual(verifyEnvelope(back), { ok: true, decisionHashConsistent: true, envelopeHashConsistent: true, labelled: true }); assert.ok(numbersIn(env).every(Number.isFinite)); }
});
test('[P6-08 serialization] probabilities are in [0,1], spreads non-negative, bounds ordered; the bound is labelled a heuristic, not a calibrated interval', () => {
  const env = serve(api, REC), u = env.assurance.uncertainty;
  for (const a of env.assurance.view.empiricalEstimates) { assert.ok(a.riskEstimate >= 0 && a.riskEstimate <= 1 && a.riskUpperBound >= a.riskEstimate && a.riskUpperBound <= 1 && a.ensembleSpread >= 0); }
  assert.equal(u.boundKind, 'HEURISTIC_UPPER_BOUND_NOT_A_CALIBRATED_CONFIDENCE_INTERVAL'); assert.equal(u.method, 'FAMILY_BOOTSTRAP_BAG_SPREAD_V1'); assert.deepEqual(u.riskCriterion, { tau: 0.2, tierWidth: 0.1, z: 1, oodPenalty: 0.05 });
  assert.equal(u.marginToCriterion, 0.2 - u.bestRiskUpperBound); assert.ok(u.marginToCriterion >= 0); assert.ok(serve(api, ABS).assurance.uncertainty.marginToCriterion < 0);
  assert.ok(u.topRanked.distanceToNearestTierBoundary >= 0 && u.topRanked.distanceToNearestTierBoundary <= 0.05 + 1e-12);
});
test('[P6-08 serialization] negative controls: out-of-range, non-finite or mislabelled values are refused', () => {
  const good = () => clone(serve(api, REC).record), at = (r) => r.rankedActions[0];
  assert.doesNotThrow(() => assertNumericSerialization(good()));
  let r = good(); at(r).risk.upperBound = 1.2; rejects(() => assertNumericSerialization(r), 'PROBABILITY_OUT_OF_RANGE');
  r = good(); at(r).risk.estimate = -0.01; rejects(() => assertNumericSerialization(r), 'PROBABILITY_OUT_OF_RANGE');
  r = good(); at(r).risk.spread = -0.1; rejects(() => assertNumericSerialization(r), 'UNCERTAINTY_OUT_OF_RANGE');
  r = good(); at(r).risk.upperBound = at(r).risk.estimate / 2; rejects(() => assertNumericSerialization(r), 'UNCERTAINTY_OUT_OF_RANGE');
  r = good(); at(r).expectedRegret.estimate = Number.NaN; rejects(() => assertNumericSerialization(r), 'NON_FINITE_NUMBER_IN_RECORD');
  r = good(); at(r).risk.kind = 'GUARANTEE'; rejects(() => assertNumericSerialization(r), 'RISK_NOT_LABELLED_EMPIRICAL');
  r = good(); at(r).riskStatus = 'UNSUPPORTED_NO_MODEL'; rejects(() => assertNumericSerialization(r), 'UNSUPPORTED_ACTION_CARRIES_AN_ESTIMATE');
});

// ------------------------------------------------------------------------------------ 09 decision-hash reproduction
test('[P6-09 decision-hash] the envelope passes the frozen decision hash through unchanged and reproduces it on replay', () => {
  for (const rq of [REC, ABS]) { const env = serve(api, rq), inner = frozenCall(rq);
    assert.equal(env.decisionHash, inner.decisionHash); assert.equal(env.record.decisionHash, inner.decisionHash); assert.deepEqual(env.record, inner, 'the inner record is passed through unchanged');
    const rep = api.replay({ ...rq, declaration: decl() }, { decisionHash: env.decisionHash, envelopeHash: env.envelopeHash });
    assert.deepEqual(rep, { reproduced: true, decisionHashReproduced: true, envelopeHashReproduced: true, decisionHash: env.decisionHash, envelopeHash: env.envelopeHash });
    assert.equal(api.replay({ ...rq, declaration: decl() }, { decisionHash: env.decisionHash, envelopeHash: '0'.repeat(64) }).reproduced, false);
    assert.equal(api.replay({ ...rq, declaration: decl() }, { decisionHash: '0'.repeat(64), envelopeHash: env.envelopeHash }).decisionHashReproduced, false);
    rejects(() => api.replay({ ...rq, declaration: decl() }, { decisionHash: env.decisionHash }), 'REPLAY_EXPECTATION_INCOMPLETE'); }
});
test('[P6-09 decision-hash] negative controls: a tampered record or a tampered assurance block is detected offline', () => {
  const env = clone(serve(api, REC));
  let t = clone(env); t.record.rankedActions[0].risk.estimate += 1e-9; assert.deepEqual([verifyEnvelope(t).ok, verifyEnvelope(t).decisionHashConsistent], [false, false]); rejects(() => assertRecordHash(t.record), 'DECISION_HASH_MISMATCH');
  t = clone(env); t.assurance.checks.LEGAL_MENU_COMPLETE = false; assert.deepEqual([verifyEnvelope(t).ok, verifyEnvelope(t).decisionHashConsistent, verifyEnvelope(t).envelopeHashConsistent], [false, true, false]);
  t = clone(env); t.qualification = 'QUALIFIED'; assert.equal(verifyEnvelope(t).ok, false); assert.equal(verifyEnvelope(t).labelled, false);
  t = clone(env); t.record.decisionHash = 'xyz'; rejects(() => assertRecordHash(t.record), 'DECISION_HASH_MALFORMED'); assert.equal(verifyEnvelope({}).ok, false);
});

// ----------------------------------------------------------------------------------- 10 execute / mutate refusal
test('[P6-10 refusal] every request for an effect is refused with a stable code; the API has no path that acts', () => {
  rejects(() => serve(api, REC, decl({ mode: 'EXECUTE' })), 'EXECUTION_OR_MUTATION_REQUESTED'); rejects(() => serve(api, REC, decl({ mode: 'recommend' })), 'EXECUTION_OR_MUTATION_REQUESTED'); rejects(() => serve(api, REC, decl({ mode: undefined })), 'EXECUTION_OR_MUTATION_REQUESTED');
  for (const k of ['execute', 'Execute', 'EXECUTE', 'executeAction', 'doDispatch', 'dispatchNow', 'autoApply', 'mutation', 'commitAction', 'perform', 'run', 'enact', 'act', 'sendToWorld', 'write_back'])
    rejects(() => serve(api, REC, decl({ [k]: true })), 'EXECUTION_OR_MUTATION_REQUESTED');
  rejects(() => serve(api, REC, decl({ tau: 0.9 })), 'UNKNOWN_DECLARATION_KEY'); rejects(() => serve(api, REC, decl({ intent: 'EXECUTE' })), 'UNKNOWN_DECLARATION_KEY'); // a silent threshold override or intent is not accepted either
  const a = clone(REC); a.legalActions[0].params.Execute = true; rejects(() => serve(api, a), 'EXECUTION_OR_MUTATION_REQUESTED');
  const b = clone(REC); b.state.projection.actor.autoApply = 1; rejects(() => serve(api, b), 'EXECUTION_OR_MUTATION_REQUESTED');
  const c = clone(REC); c.advisoryEvidence.experts.S0.dispatchTo = 'world'; rejects(() => serve(api, c), 'EXECUTION_OR_MUTATION_REQUESTED');
  for (const m of ['execute', 'dispatch', 'mutate', 'apply', 'commit', 'act']) rejects(() => api[m](REC), 'EXECUTION_OR_MUTATION_REQUESTED');
  rejects(() => api.recommend(REC.state, REC.legalActions, REC.advisoryEvidence, decl(), { execute: true }), 'UNEXPECTED_ARGUMENT');
  assert.deepEqual(Object.keys(api).sort(), ['act', 'apply', 'commit', 'describe', 'dispatch', 'execute', 'mutate', 'recommend', 'replay', 'verify']); assert.ok(Object.isFrozen(api));
  assert.deepEqual(api.describe().capabilities, ['recommend', 'replay', 'verify', 'describe']);
});
test('[P6-10 refusal] FINDING F1/F2: the frozen key scan is exact and case-sensitive; variants pass it and are caught only by the envelope', () => {
  for (const k of ['Execute', 'EXECUTE', 'executeAction', 'doDispatch', 'autoApply', 'mutation', 'commitAction', 'perform', 'run', 'enact']) {
    assert.equal(frozenCall(REC, { [k]: true }).decisionHash, frozenCall(REC).decisionHash, `frozen API silently accepts options.${k} (it still executes nothing)`); assert.equal(looksLikeExecution(k), true); }
  assert.equal(frozenCall(REC, { tau: 0.9 }).uncertainty.riskCriterion.tau, 0.2, 'frozen API silently ignores an unknown option');
  for (const k of ['Truth', 'world_hash', 'WorldHash', 'hidden_health', 'Seed', 'groundTruth', 'trueUtility', 'evaluatorTruth', 'rngSeed', 'privileged']) {
    const rq = clone(REC); rq.state.projection.actor[k] = 1;
    assert.deepEqual(setOf(frozenCall(rq)), setOf(frozenCall(REC)), `frozen kernel accepts actor.${k}; the decision does not use it`); assert.equal(looksPrivileged(k), true); rejects(() => serve(api, rq), 'PRIVILEGED_FIELD_IN_REQUEST'); }
  for (const k of ['type', 'actor', 'target', 'cost', 'recommendedType', 'rationaleCodes', 'observationContract', 'risk', 'knownSites', 'threatened', 'TRAVERSABLE']) { assert.equal(looksLikeExecution(k), false, k); assert.equal(looksPrivileged(k), false, k); }
  rejects(() => api.recommend(REC.state, REC.legalActions, REC.advisoryEvidence, decl({ evidenceSources: { ...clone(SOURCES), S0: { ...SOURCES.S0, seed: 1 } } })), 'PRIVILEGED_FIELD_IN_REQUEST');
});

// ------------------------------------------------------------------------------ 11 contract-version mismatch
test('[P6-11 contract-version] a missing or mismatching contract declaration fails closed before the kernel is called', () => {
  rejects(() => api.recommend(REC.state, REC.legalActions, REC.advisoryEvidence), 'CONTRACT_DECLARATION_MISSING'); rejects(() => serve(api, REC, null), 'CONTRACT_DECLARATION_MISSING'); rejects(() => serve(api, REC, []), 'CONTRACT_DECLARATION_MISSING');
  rejects(() => serve(api, REC, decl({ apiVersion: 'SK1_R0_API_V1' })), 'API_VERSION_MISMATCH'); rejects(() => serve(api, REC, decl({ apiVersion: 'SK1_R0_ASSURED_API_V1_2' })), 'API_VERSION_MISMATCH');
  rejects(() => serve(api, REC, decl({ requestContract: 'SENTINEL_PUBLIC_DECISION_REQUEST_V2' })), 'REQUEST_CONTRACT_MISMATCH');
  rejects(() => serve(api, REC, decl({ observationContract: { id: 'STAGE3H_PUBLIC_DECISION_INFORMATION_V1', version: 'HW1_PUBLIC_PROJECTION_V2' } })), 'OBSERVATION_CONTRACT_MISMATCH');
  rejects(() => serve(api, REC, decl({ observationContract: undefined })), 'OBSERVATION_CONTRACT_MISMATCH');
  rejects(() => serve(api, REC, decl({ evidenceContract: 'SK1_ADVISORY_EVIDENCE_V2' })), 'EVIDENCE_CONTRACT_MISMATCH');
  const noEc = decl(); delete noEc.evidenceContract; rejects(() => serve(api, REC, noEc), 'EVIDENCE_CONTRACT_MISMATCH');
  const a = clone(REC); a.state.observationContract.version = 'HW1_PUBLIC_PROJECTION_V2'; rejects(() => serve(api, a), 'OBSERVATION_CONTRACT_MISMATCH');
  assert.equal(frozenCall(a).recommendedActionOrAbstention.kind, 'ABSTAIN', 'frozen kernel also fails closed here: no model applies, it abstains'); assert.ok(frozenCall(a).rankedActions.every((x) => x.riskStatus === 'UNSUPPORTED_NO_MODEL'));
  const b = clone(REC); b.state.projection.version = 'HW1_PUBLIC_PROJECTION_V2'; rejects(() => serve(api, b), 'OBSERVATION_CONTRACT_MISMATCH');
  assert.equal(frozenCall(b).recommendedActionOrAbstention.kind, 'RECOMMEND', 'the frozen featurizer does not compare projection.version with the contract version (finding F4)');
  const c = clone(REC); c.advisoryEvidence.contract = 'SK1_ADVISORY_EVIDENCE_V2'; rejects(() => serve(api, c), 'EVIDENCE_CONTRACT_MISMATCH');
  assert.equal(api.describe().assuredApiVersion, ASSURED_API_VERSION); assert.deepEqual(api.describe().contracts.kernel, { id: 'SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V1', version: '1.0.0' });
});
test('[P6-11 contract-version] adapters are not interchangeable: a request for one game is refused by the other', () => {
  const rescue = createAssuredApi({ game: 'rescue' }), r = rescueRequest();
  rejects(() => rescue.recommend(REC.state, REC.legalActions, null, declarationFor('rescue')), 'OBSERVATION_CONTRACT_MISMATCH'); rejects(() => api.recommend(r.state, r.legalActions, null, declarationFor('forge')), 'OBSERVATION_CONTRACT_MISMATCH');
  rejects(() => rescue.recommend(r.state, r.legalActions, clone(REC.advisoryEvidence), declarationFor('rescue')), 'EVIDENCE_NOT_SUPPORTED_BY_ADAPTER'); rejects(() => createAssuredApi({ game: 'chess' }), 'UNKNOWN_GAME_ADAPTER');
});

// --------------------------------------------------------------------------------------------- 12 output labels
test('[P6-12 labels] every response says R0, shadow mode, recommendation only, NOT_QUALIFIED — recommendation or abstention', () => {
  for (const rq of [REC, ABS]) { const env = serve(api, rq);
    assert.deepEqual(env.labels, ['R0', 'SHADOW_MODE', 'RECOMMENDATION_ONLY', 'NOT_QUALIFIED']); assert.deepEqual(env.labels, [...LABELS]); assert.equal(env.qualification, 'NOT_QUALIFIED'); assert.equal(env.deployment, 'SHADOW_MODE_NOT_PRODUCTION');
    assert.deepEqual(env.authority, { ...REQUIRED_AUTHORITY }); assert.deepEqual(env.record.authority, { ...REQUIRED_AUTHORITY }); assert.equal(env.record.safetyAssessment.qualification.status, 'NOT_QUALIFIED');
    assert.deepEqual({ c: env.scientificStatus.sk1Classification, q: env.scientificStatus.safetyKernelDevQualified, s: env.scientificStatus.selectiveContractCertified }, { c: 'B_SAFETY_KERNEL_MATERIAL_IMPROVEMENT_NOT_QUALIFIED', q: false, s: false });
    assert.equal(env.assurance.checks.OUTPUT_LABELS_ASSERTED, true); }
  const d = api.describe(); assert.equal(d.qualification, 'NOT_QUALIFIED'); assert.equal(d.inner.model.qualification.status, 'NOT_QUALIFIED'); assert.equal(d.authority.canDispatch, false); assert.equal(d.authority.canMutateLiveWorld, false);
});
test('[P6-12 labels] negative controls: a record that claims qualification, authority or certainty is refused', () => {
  const good = () => clone(serve(api, REC).record);
  assert.doesNotThrow(() => assertOutputLabels(good(), 'forge'));
  let r = good(); r.safetyAssessment.qualification.status = 'QUALIFIED'; rejects(() => assertOutputLabels(r, 'forge'), 'QUALIFICATION_LABEL_MISMATCH');
  r = good(); delete r.safetyAssessment.qualification; rejects(() => assertOutputLabels(r, 'forge'), 'QUALIFICATION_LABEL_MISMATCH');
  r = good(); r.authority.canDispatch = true; rejects(() => assertOutputLabels(r, 'forge'), 'AUTHORITY_LABEL_MISMATCH');
  r = good(); r.authority.canMutateLiveWorld = true; rejects(() => assertOutputLabels(r, 'forge'), 'AUTHORITY_LABEL_MISMATCH');
  r = good(); r.authority.state = 'R1'; rejects(() => assertOutputLabels(r, 'forge'), 'AUTHORITY_LABEL_MISMATCH');
  r = good(); r.safetyAssessment.status = 'GUARANTEED_SAFE'; rejects(() => assertOutputLabels(r, 'forge'), 'EPISTEMIC_STATUS_MISSING');
  r = good(); r.uncertainty.riskCriterion.tau = 0.9; rejects(() => assertOutputLabels(r, 'forge'), 'MODEL_PIN_MISMATCH');
  r = good(); r.sourceIdentity.modelHash = '0'.repeat(64); rejects(() => assertOutputLabels(r, 'forge'), 'MODEL_PIN_MISMATCH');
  r = good(); r.sourceIdentity.kernelSourceHash = '0'.repeat(64); rejects(() => assertOutputLabels(r, 'forge'), 'SOURCE_PIN_MISMATCH');
  r = good(); r.kernel.version = '1.1.0'; rejects(() => assertOutputLabels(r, 'forge'), 'KERNEL_VERSION_MISMATCH');
  r = good(); r.apiVersion = 'SK1_R0_API_V2'; rejects(() => assertOutputLabels(r, 'forge'), 'INNER_API_VERSION_MISMATCH');
});
test('[P6-12 labels] second game: no model, so NO_MODEL and an abstention — never a recommendation, never a qualification claim', () => {
  const rescue = createAssuredApi({ game: 'rescue' }), r = rescueRequest(), env = rescue.recommend(r.state, r.legalActions, null, declarationFor('rescue'));
  assert.equal(env.record.recommendedActionOrAbstention.kind, 'ABSTAIN'); assert.equal(env.record.safetyAssessment.qualification.status, 'NO_MODEL'); assert.equal(env.qualification, 'NOT_QUALIFIED'); assert.deepEqual(env.labels, [...LABELS]);
  assert.equal(env.assurance.view.empiricalEstimates.length, 0); assert.equal(env.assurance.view.unsupportedOrUnknown.length, 3); assert.equal(env.assurance.checks.PUBLIC_STATE_COMPLETE_AND_IN_VOCABULARY, 'NOT_APPLICABLE_FOR_ADAPTER');
  const fake = clone(env.record); fake.recommendedActionOrAbstention.kind = 'RECOMMEND'; rejects(() => assertOutputLabels(fake, 'rescue'), 'RECOMMENDATION_WITHOUT_MODEL');
  rejects(() => rescue.execute(), 'EXECUTION_OR_MUTATION_REQUESTED'); assert.deepEqual(verifyEnvelope(env).ok, true);
  assert.deepEqual(separatedView(env.record).deterministicallyEstablished.map((a) => a.type), env.record.rankedActions.map((a) => a.type));
});
