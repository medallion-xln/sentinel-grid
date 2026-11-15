// H-DISC-1R Phase 7 synthetic R0 decision-inspection demonstration. READ-ONLY against the repository.
// It calls the existing frozen SK1 API and the existing untrained H-DISC API on a tracked public demo fixture and
// assembles ONE inspection record that keeps every component's output separate. It computes no combined score, picks
// no action, and names no component as decision owner unless a certified path actually binds it. Writes nothing.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const GA = process.argv[2], which = process.argv[3] ?? 'recommend'; if (!GA) throw Error('usage: inspect-demo.mjs <platform/game-agnostic> [recommend|abstain]');
const L1 = resolve(GA, 'stage3h-hdisc1-discriminator-v1'), SK1 = resolve(GA, 'stage3h-sk1-safety-kernel-v1');
const { loadForgeKernel } = await import(resolve(SK1, 'api/host.mjs'));
const { createDiscriminatorApi } = await import(resolve(L1, 'api/discriminator-api.mjs'));
const readJ = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8'));
const stable = (v) => (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v ?? null));
const sha = (s) => createHash('sha256').update(s).digest('hex');

const fixturePath = `stage3h-sk1-safety-kernel-v1/demo/fixtures/forge-request-${which}.json`, f = readJ(fixturePath), n = f.legalActions.length;
const sk1 = loadForgeKernel().kernel.recommend(f.state, f.legalActions, f.advisoryEvidence);
const hd = createDiscriminatorApi({ game: 'forge' }).compare(f.state, f.legalActions, f.advisoryEvidence);
const arbiter = readJ('artifacts/stage2l10-arbiter-correctness-calibration-and-selective-delegation/stage2l10-certification-result.json');
const roster = readJ('stage3h-ascii-competence-v1/evidence/expert-applicability.json');
const sk1Result = 'B: SAFETY_KERNEL_MATERIAL_IMPROVEMENT_NOT_QUALIFIED (stage3h-sk1-safety-kernel-v1/SK1_RESULT.md)';
const typeOf = (i) => f.legalActions[i].type, setTypes = (s) => s.map((a) => typeOf(a.index ?? a));

// Expert status FOR THIS REQUEST (Forge World public projection, SK1_ADVISORY_EVIDENCE_V1). Sourced, not asserted.
const expertStatus = {
  Nexus: { status: 'PRESENT_AS_ADVISORY_EVIDENCE', detail: `recommends type ${f.advisoryEvidence.experts.NEXUS.recommendedType ?? 'none'}; enters SK1 as features only`, source: 'SK1_ADVISORY_EVIDENCE_V1' },
  Oracle: { status: 'NOT_PRESENT', detail: 'temporal advisory only; not part of SK1_ADVISORY_EVIDENCE_V1; Oracle action contract closed as not testable', source: 'stage3h-ascii-competence-v1 matrix' },
  Prime: { status: 'NOT_APPLICABLE', detail: 'ROOT-PUCT needs known-simulator successors; no binding over this public projection', source: 'stage3h-ascii-competence-v1 matrix' },
  Vanguard: { status: 'NOT_APPLICABLE', detail: 'colony-codec only; checkpoint untrained (3H.16)', source: 'stage3h-ascii-competence-v1 matrix' },
  Horizon: { status: 'NOT_APPLICABLE', detail: 'colony-codec only', source: 'stage3h-ascii-competence-v1 matrix' },
  Archimedes: { status: 'NOT_IMPLEMENTED', detail: 'NO_IMPLEMENTATION_FOUND (3H.2-R)', source: 'stage3h-ascii-competence-v1 matrix' },
  Alexandria: { status: 'NOT_APPLICABLE', detail: 'no retrieval task', source: 'stage3h-ascii-competence-v1 matrix' },
  Picasso: { status: 'NOT_APPLICABLE', detail: 'no image task', source: 'stage3h-ascii-competence-v1 matrix' },
  Forge: { status: 'NOT_APPLICABLE', detail: 'coding/RSI expert; no engineering task in a decision', source: 'stage3h-ascii-competence-v1 matrix' },
};
if (roster.roster.length !== 9 || roster.roster.some((e) => !expertStatus[e])) throw Error('ROSTER_MISMATCH');

const sk1Decision = sk1.recommendedActionOrAbstention;
const rec = {
  schema: 'SENTINEL_R0_DECISION_INSPECTION_RECORD_V1_DRAFT',
  synthetic: { fixture: fixturePath, fixtureSha256: sha(readFileSync(resolve(GA, fixturePath))), note: 'tracked public demo fixture; not a scientific population' },
  request: { observationContract: f.state.observationContract, menuSize: n, menu: f.legalActions.map((a, i) => ({ index: i, type: a.type })), requestHash: sk1.sourceIdentity.requestHash },
  decisionOwner: { actual: 'HUMAN_OWNER', basis: 'Authority is R0 everywhere; no component can dispatch. The certified Prime/Arbiter path is not bound to this observation contract, so no certified component owns a decision here.' },
  selectedAction: { actual: null, note: 'Inspection only. No action was selected, dispatched or executed.' },
  advisoryEvidence: { contract: f.advisoryEvidence.contract, status: sk1.evidence.status, S0: { topTypes: setTypes(f.advisoryEvidence.experts.S0.topSet), scoresByIndex: f.advisoryEvidence.experts.S0.scores }, NEXUS: { abstain: f.advisoryEvidence.experts.NEXUS.abstain, recommendedType: f.advisoryEvidence.experts.NEXUS.recommendedType ?? null, reason: f.advisoryEvidence.experts.NEXUS.reason ?? null, rationaleCodes: f.advisoryEvidence.experts.NEXUS.rationaleCodes ?? [] }, expertsAgreeOnType: sk1.evidence.summary.expertsAgreeOnType },
  components: [
    { id: 'SK1', role: 'FROZEN_R0_RECOMMENDATION', connectedToCertifiedPath: false,
      output: { kind: sk1Decision.kind, decisionTypes: sk1Decision.kind === 'RECOMMEND' ? setTypes(sk1Decision.decisionSet) : [], reason: sk1Decision.reason ?? null,
        ranked: sk1.rankedActions.map((a) => ({ index: a.index, type: typeOf(a.index), rank: a.rank, risk: a.risk?.estimate ?? a.riskEstimate ?? null, riskUpper: a.risk?.upperBound ?? a.riskUpperBound ?? null, reasons: a.reasonCodes ?? a.reasons ?? [] })) },
      uncertainty: sk1.uncertainty, certification: { status: sk1.safetyAssessment.qualification.status, classification: sk1Result }, sourceIdentity: sk1.sourceIdentity, authority: sk1.authority, decisionHash: sk1.decisionHash },
    { id: 'H-DISC-1', role: 'UNTRAINED_CANDIDATE_SHADOW', connectedToCertifiedPath: false,
      output: { kind: hd.decision.kind, reason: hd.decision.reason ?? null, rankedCount: hd.rankedActions.length, menuComplete: hd.legalActionMenu.complete },
      uncertainty: { flags: hd.uncertainty.flags }, certification: { status: hd.qualification.status, statement: 'untrained; abstains on every request by construction' }, sourceIdentity: hd.sourceIdentity, authority: hd.authority, decisionHash: hd.decisionDigest },
    { id: 'PRIME', role: 'NOT_APPLICABLE_TO_THIS_REQUEST', connectedToCertifiedPath: true, output: null, reason: expertStatus.Prime.detail },
    { id: 'ARBITER', role: 'NOT_CONNECTED_TO_THIS_REQUEST', connectedToCertifiedPath: true, output: null,
      certification: { stage: arbiter.stage, certified: arbiter.stage2l10Certified, shadowOnly: arbiter.arbiterShadowOnly, finalRecommendationOwner: arbiter.finalRecommendationOwner, realDecisionDeltaMeasured: arbiter.realZeknovaDecisionDeltaMeasured, certificationHash: arbiter.certificationHash },
      reason: 'The certified Arbiter arbitrates NEXUS/ORACLE attestations inside the Stage 2 ZekNova shadow path; it has no binding to the Forge public projection or to SK1/H-DISC outputs.' },
  ],
  experts: Object.fromEntries(roster.roster.map((e) => [e, expertStatus[e]])),
  disagreement: { s0TopTypes: setTypes(f.advisoryEvidence.experts.S0.topSet), nexusType: f.advisoryEvidence.experts.NEXUS.recommendedType ?? null, sk1Types: sk1Decision.kind === 'RECOMMEND' ? setTypes(sk1Decision.decisionSet) : [], hdisc: hd.decision.kind },
  notComputed: ['a combined or unified score', 'a consensus action', 'any per-expert contribution weight (no such quantity exists in the current code)'],
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, primeArbiterPathChanged: false, sk1PolicyChanged: false, hdiscPromoted: false },
};
for (const c of rec.components) if (c.authority && (c.authority.canDispatch !== false || c.authority.canMutateLiveWorld !== false)) throw Error('AUTHORITY_VIOLATION:' + c.id);
rec.recordHash = sha(stable(rec));

if (process.argv.includes('--json')) { console.log(JSON.stringify(rec, null, 1)); process.exit(0); }
const L = (a, b) => console.log(`  ${a.padEnd(Math.max(26, a.length + 2))}${b}`);
console.log('=== SENTINEL R0 DECISION INSPECTION (synthetic fixture, draft record V1) ===');
console.log(`request   ${rec.request.observationContract.id} · ${n} lawful actions · request ${rec.request.requestHash.slice(0, 12)}…`);
console.log(`owner     ${rec.decisionOwner.actual} — ${rec.decisionOwner.basis}`);
console.log(`selected  none (inspection only)`);
console.log('\nADVISORY EVIDENCE'); L('S0 top', rec.advisoryEvidence.S0.topTypes.join(',')); L('NEXUS', `${rec.advisoryEvidence.NEXUS.recommendedType ?? 'abstain'} (${rec.advisoryEvidence.NEXUS.reason ?? '-'})`); L('experts agree on type', String(rec.advisoryEvidence.expertsAgreeOnType));
console.log('\nCOMPONENTS (kept separate; no combined output)');
for (const c of rec.components) { const o = c.output; L(`${c.id} [${c.role}]`, o ? `${o.kind}${o.decisionTypes?.length ? ' ' + o.decisionTypes.join(',') : ''}${o.reason ? ' · ' + o.reason : ''}` : c.reason);
  if (c.certification) L('', `certification: ${c.certification.status ?? (c.certification.certified ? 'certified ' + c.certification.stage + (c.certification.shadowOnly ? ' (shadow only)' : '') : '-')}`);
  if (c.sourceIdentity) L('', `source: ${c.sourceIdentity.kernelSourceHash?.slice(0, 12) ?? c.sourceIdentity.sourceHash?.slice(0, 12)}… · model: ${c.sourceIdentity.modelHash?.slice(0, 12) ?? c.sourceIdentity.parametersHash ?? 'none'}${c.sourceIdentity.modelHash ? '…' : ''}`); }
console.log('\nSK1 RANKING (frozen, NOT_QUALIFIED; risk is an empirical estimate)');
for (const a of rec.components[0].output.ranked) L(`${a.rank + 1}. [${a.index}] ${a.type}`, `risk ${a.risk === null ? '-' : (a.risk * 100).toFixed(1) + '%'} · upper ${a.riskUpper === null ? '-' : (a.riskUpper * 100).toFixed(1) + '%'}`);
console.log('\nNINE-EXPERT ROSTER (for this request)'); for (const [e, s] of Object.entries(rec.experts)) L(e, `${s.status} — ${s.detail}`);
console.log(`\nauthority R0 · canDispatch=false · canMutateLiveWorld=false · recordHash ${rec.recordHash.slice(0, 16)}…`);
