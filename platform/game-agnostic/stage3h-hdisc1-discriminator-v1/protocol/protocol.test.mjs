// STAGE3H-H-DISC-1 protocol — tests. Run: node --test protocol/*.test.mjs
// The protocol is compared with the TRACKED H-DISC-0 text and records, read independently here, not with constants
// from the builder. Nothing is trained, generated or evaluated; no population identity exists to be read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build, validate, serialise, seal, STATUS, PLANNED, PROTOCOL_FILE } from './protocol.mjs';
import { pairedPower, discordance } from '../../stage3h-hdisc0-design-v1/analysis/design-evidence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GA = resolve(HERE, '../..'), HDISC0 = resolve(GA, 'stage3h-hdisc0-design-v1');
const sha = (b) => createHash('sha256').update(b).digest('hex'), STORED_TEXT = readFileSync(PROTOCOL_FILE, 'utf8'), P = JSON.parse(STORED_TEXT), clone = () => structuredClone(P);
const MD = readFileSync(resolve(HDISC0, 'H_DISC_0_PREREGISTRATION_DRAFT.md'), 'utf8'), strip = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim(), row = (line) => line.split('|').slice(1, -1).map(strip);

test('the stored protocol is valid, is exactly what the builder produces from tracked records, and is ready but not frozen', () => {
  assert.deepEqual(validate(P), []); assert.equal(serialise(build()), STORED_TEXT);
  assert.equal(P.status, 'REGISTRATION_READY_NOT_FROZEN_NOT_REGISTERED_NOT_AUTHORIZED'); assert.equal(P.status, STATUS); assert.equal(P.campaignId, 'STAGE3H-H-DISC-1'); assert.equal(P.authority, 'R0');
  assert.deepEqual([P.frozen, P.registered, P.authorized], [false, false, false]);
  assert.equal(P.readiness.PREREGISTRATION_READY, true); assert.equal(P.readiness.PREREGISTRATION_FROZEN, false); assert.equal(P.readiness.PREREGISTRATION_REGISTERED, false); assert.equal(P.readiness.CAMPAIGN_AUTHORIZED, false);
  for (const banned of ['training', 'world generation', 'block or seed allocation', 'validation', 'holdout']) assert.ok(P.notAuthorizedByThisDocument.includes(banned), banned);
  assert.equal(P.derivedFrom.hdisc0PreregistrationDraft.sha256, sha(readFileSync(resolve(HDISC0, 'H_DISC_0_PREREGISTRATION_DRAFT.md')))); assert.equal(P.derivedFrom.matchedAblationContract.sha256, sha(readFileSync(resolve(HERE, 'ablation-contract.mjs'))));
});

test('arms A to F are the H-DISC-0 arms, read from the tracked document', () => {
  const rows = MD.split('\n').filter((l) => /^\| [A-F] \|/.test(l)).map(row); assert.equal(rows.length, 6);
  assert.deepEqual(P.arms, rows.map(([arm, policy, role]) => ({ arm, policy, role }))); assert.deepEqual(P.arms.map((a) => a.arm), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(P.arms[3].policy, 'frozen SK1, forced choice'); assert.equal(P.arms[3].role, 'the reference for the primary test'); assert.equal(P.arms[5].role, 'the candidate'); assert.match(P.arms[4].role, /never treated as safe/);
  const quote = MD.split('\n').filter((l) => l.startsWith('> ')).map((l) => l.slice(2)).join(' '); assert.equal(P.hypothesis.statement, strip(quote)); assert.match(P.hypothesis.status, /not a claim of learnability/);
});

test('the ablation ladder, the decision rule and the one-pass protocol are the H-DISC-0 ones', () => {
  const ladder = MD.split('\n').filter((l) => /^\| M(0|1|2|3a|3 = F) \|/.test(l)).map(row); assert.equal(ladder.length, 5);
  P.ablationLadder.arms.forEach((a, i) => { assert.equal(a.arm, ladder[i][0].replace(' = F', '')); assert.equal(a.label, ladder[i][1]); assert.equal(a.information, ladder[i][2]); assert.equal(a.objective, ladder[i][3]); assert.equal(a.isolates, ladder[i][4]); });
  assert.equal(P.ablationLadder.essentialContrast, 'M2_vs_M3a'); assert.equal(P.ablationLadder.contrasts.M2_vs_M3a.differsByDesign, 'TRAINING_OBJECTIVE'); assert.equal(P.ablationLadder.contrasts.M2_vs_M3a.bestReachableVerdict, 'PARTIALLY_MATCHED');
  assert.deepEqual(Object.keys(P.ablationLadder.contrasts.M2_vs_M3a.unavoidableDifferences).sort(), ['INFERENCE_BUDGET', 'MODEL_CAPACITY', 'OPTIMISATION_BUDGET']); assert.equal(P.ablationLadder.controlledDimensions.length, 9);
  const decisions = MD.split('\n').filter((l) => /^\| `H_DISC_[A-Z_]+` \|/.test(l)).map(row); assert.equal(decisions.length, 4); assert.deepEqual(P.decisionRule.exactlyOne, decisions.map(([classification, condition]) => ({ classification, condition })));
  const steps = MD.split('\n').filter((l) => /^\| \d+ \| /.test(l)).map(row); assert.equal(steps.length, 10); assert.deepEqual(P.onePassProtocol, steps.map(([step, action, boundBy]) => ({ step: Number(step), action, boundBy })));
  assert.match(P.onePassProtocol[0].action, /campaign-entry gate returns GO/); assert.match(P.afterStep7, /No interim look/);
});

test('the primary endpoint, the comparator endpoints and the test are as mandated', () => {
  const e = P.endpoints.primary; assert.equal(e.name, 'paired reduction in unique comparator-relative catastrophe-introduction classes versus frozen SK1 forced choice'); assert.equal(e.candidateArm, 'F'); assert.equal(e.referenceArm, 'D');
  assert.match(MD, new RegExp(e.hdisc0Name.replace(/[()]/g, '\\$&').slice(0, 60))); assert.deepEqual(P.endpoints.comparatorSpecific.map((x) => x.id), ['INTRODUCTIONS_VS_S0', 'INTRODUCTIONS_VS_NEXUS_ELSE_S0']);
  assert.equal(P.primaryTest.alpha, 0.05); assert.match(P.primaryTest.exactTest, /one-sided exact sign \(McNemar\)/); assert.match(P.primaryTest.effectSize.interval, /two-sided 95% origin-family cluster bootstrap/); assert.match(P.primaryTest.rejectionRule, /AND/);
  assert.equal(P.multiplicity.confirmatory.tests, 1); assert.ok(P.multiplicity.secondaryFamilies.length >= 3 && P.multiplicity.secondaryFamilies.every((f) => /Holm/.test(f.adjustment))); assert.match(P.multiplicity.gatekeeping, /only if the confirmatory test rejects/);
  assert.equal(P.mechanismQualification.label, 'H_DISC_MECHANISM_QUALIFICATION'); assert.equal(P.mechanismQualification.separateFromPolicyQualification, true); assert.equal(P.multiplicity.mechanismFamily.family, 'H_DISC_MECHANISM_QUALIFICATION'); assert.match(P.mechanismQualification.neverLicensed, /never licenses/);
  assert.deepEqual(Object.keys(P.mechanismQualification.classification), ['H_DISC_MECHANISM_SUPPORTED', 'H_DISC_MECHANISM_NOT_SUPPORTED', 'H_DISC_MECHANISM_UNRESOLVED', 'H_DISC_MECHANISM_NOT_TESTABLE', 'H_DISC_MECHANISM_NOT_APPLICABLE']);
});

test('the absolute qualification gates equal the tracked Contract A constants; 900 classes are not presented as making qualification likely', () => {
  const rules = JSON.parse(readFileSync(resolve(GA, 'stage3h-sk1-safety-kernel-v1/evidence/SK1_VALIDATION_RESULTS.json'), 'utf8')).rules, g = P.absoluteQualification.gates;
  assert.deepEqual(g, { introductionsVsS0: 0, introductionsVsNexus: 0, illegalActions: 0, completeLawfulDecisionCoverage: true, minMeanNregImprovementVsEachComparator: 0.02, regretOneSided95FamilyClusteredUpperBoundBelow: 0, identityAndD4Violations: 0, deterministicReplay: true, decisionMedianMsMax: 100, decisionMaxMsMax: 1000, catastropheRegret: 100 });
  assert.equal(g.introductionsVsS0, rules.introductionsVsS0); assert.equal(g.minMeanNregImprovementVsEachComparator, rules.minMeanNregImprovement); assert.equal(g.decisionMaxMsMax, rules.decisionMaxMsMax); assert.equal(P.absoluteQualification.unchanged, true); assert.match(P.absoluteQualification.statement, /NOT_QUALIFIED/);
  const z = P.power.at900.absoluteQualificationIsNotMadeLikely; assert.match(z.statement, /do not make absolute qualification likely/);
  for (const [rate, prob] of Object.entries(z.probabilityOfZeroIntroductionsIn900)) assert.ok(Math.abs(prob - Math.pow(1 - Number(rate), 900)) < 1e-6, rate);
  assert.ok(z.probabilityOfZeroIntroductionsIn900['0.0325'] < 1e-9 && z.probabilityOfZeroIntroductionsIn900['0.001'] < 0.5 && z.rateNeededForEvenOddsOfZero < 0.001);
});

test('populations are planning values: 900 validation, 1,000 exploration, no holdout, no allocation', () => {
  assert.deepEqual({ ...PLANNED }, { validationClasses: 900, explorationClasses: 1000, holdoutClasses: 0 }); assert.equal(P.populations.VALIDATION.classes, 900); assert.equal(P.populations.EXPLORATION.classes, 1000); assert.equal(P.populations.HOLDOUT.classes, 0);
  assert.equal(P.populations.status, 'PLANNING_VALUES_NOT_AN_ALLOCATION'); assert.match(P.populations.EXPLORATION.subjectTo, /final power and allocation review/); assert.equal(P.identities.allocationNamespace.allocation, null);
  assert.equal(P.identities.familySplitRule.m, 'TO_BE_FIXED_AT_ALLOCATION_REVIEW'); assert.equal(P.identities.classAliases.validation, 'HD1V-nnnn');
});

test('no block number, seed, world hash or population identity appears anywhere in the protocol', () => {
  assert.equal((STORED_TEXT.match(/\b\d{12}\b/g) ?? []).length, 0, 'a 12-digit seed-like number');
  assert.equal((STORED_TEXT.match(/(?<![0-9a-zA-Z.])(80[1-9]|8[12]\d|83[0-7]|90[1-9]|91[0-4]|73[12])(?![0-9a-zA-Z.])/g) ?? []).length, 0, 'a spent or retired block number');
  assert.ok(!/\b(SK1[EV]|HD1[EV])-\d{4}\b/.test(STORED_TEXT), 'a concrete class alias'); assert.ok(!/"(seed|seeds|block|blocks|worldHash|classListDigest|members|truth)"\s*:/.test(STORED_TEXT));
  // every 64-hex string is a declared record hash; when the privileged manifests are present, none is a world hash or a public-class key
  const declared = new Set(), walk = (v) => { if (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)) declared.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(P.derivedFrom); walk(P.mustBeFrozenBeforeExecution.map((e) => [e.value, e.currentSha256])); walk(P.identities.structuredExclusions); declared.add(P.protocolSha256);
  for (const m of STORED_TEXT.matchAll(/[0-9a-f]{64}/g)) assert.ok(declared.has(m[0]), `undeclared hash ${m[0].slice(0, 12)}`);
  const priv = new Set(); for (const pop of ['EXPLORATION', 'VALIDATION']) { const f = resolve(GA, `stage3h-sk1-safety-kernel-v1/work/manifests/SK1_POPULATION_${pop}.json`); if (existsSync(f)) for (const c of JSON.parse(readFileSync(f, 'utf8')).classes) for (const v of [c.worldHash, c.fine, c.coarse, c.projectionSha, c.membersDigest]) if (v) priv.add(String(v)); }
  for (const h of declared) assert.ok(!priv.has(h), 'a private identity is declared as a record hash');
});

test('the status cannot be made to read frozen, registered or authorized', () => {
  for (const edit of [(p) => { p.status = 'FROZEN'; }, (p) => { p.status = 'REGISTRATION_READY_AND_REGISTERED'; }, (p) => { p.frozen = true; }, (p) => { p.registered = true; }, (p) => { p.authorized = true; }, (p) => { p.readiness.PREREGISTRATION_FROZEN = true; }, (p) => { p.readiness.CAMPAIGN_AUTHORIZED = true; }]) {
    const t = clone(); edit(t); assert.ok(validate(t).includes('PROTOCOL_HASH_MISMATCH')); const resealed = validate(seal(t)); assert.ok(resealed.length > 0 && !resealed.includes('PROTOCOL_HASH_MISMATCH'), JSON.stringify(resealed)); }
});

test('tampering with the primary endpoint, the validation size, an absolute gate or an inherited definition is detected even after re-sealing', () => {
  const cases = { PRIMARY_ENDPOINT: [(p) => { p.endpoints.primary.referenceArm = 'C'; }, (p) => { p.endpoints.primary.id = 'MEAN_REGRET'; }, (p) => { p.endpoints.primary.coverage = 'selective'; }],
    VALIDATION_SIZE: [(p) => { p.populations.VALIDATION.classes = 600; }, (p) => { p.populations.VALIDATION.classes = 901; }], HOLDOUT_MUST_BE_ZERO: [(p) => { p.populations.HOLDOUT.classes = 100; }],
    ABSOLUTE_GATES_CHANGED: [(p) => { p.absoluteQualification.gates.introductionsVsS0 = 1; }, (p) => { p.absoluteQualification.gates.introductionsVsNexus = 2; }, (p) => { p.absoluteQualification.gates.completeLawfulDecisionCoverage = false; }, (p) => { p.absoluteQualification.gates.minMeanNregImprovementVsEachComparator = 0.01; }, (p) => { p.absoluteQualification.gates.decisionMaxMsMax = 5000; }, (p) => { p.absoluteQualification.unchanged = false; }],
    PRIMARY_TEST: [(p) => { p.primaryTest.alpha = 0.1; }, (p) => { p.primaryTest.rejectionRule = 'H0 is rejected if the exact sign test gives p <= 0.05'; }], ARMS_DIFFER_FROM_HDISC0: [(p) => { p.arms[3].policy = 'frozen SK1, selective'; }, (p) => { p.arms.pop(); }],
    LADDER_DIFFERS_FROM_HDISC0: [(p) => { p.ablationLadder.arms[3].objective = 'pointwise'; }, (p) => { p.ablationLadder.arms[2].information = 'SK1 feature set'; }], DECISION_RULE_DIFFERS_FROM_HDISC0: [(p) => { p.decisionRule.exactlyOne[1].condition = 'the primary paired test rejects H0'; }],
    ONE_PASS_PROTOCOL_DIFFERS_FROM_HDISC0: [(p) => { p.onePassProtocol.splice(0, 1); }], ALLOCATION_MUST_BE_EMPTY: [(p) => { p.identities.allocationNamespace.allocation = { first: 'x' }; }], MECHANISM_NOT_SEPARATE: [(p) => { p.mechanismQualification.separateFromPolicyQualification = false; }],
    MULTIPLICITY: [(p) => { p.multiplicity.confirmatory.tests = 3; }], STOP_RULES: [(p) => { p.stopRules = p.stopRules.filter((s) => s.id !== 'STOP_DEVELOPMENT'); }] };
  for (const [codeName, edits] of Object.entries(cases)) for (const edit of edits) { const t = clone(); edit(t); assert.ok(validate(t).includes('PROTOCOL_HASH_MISMATCH'), codeName); assert.ok(validate(seal(t)).includes(codeName), `${codeName}: ${JSON.stringify(validate(seal(t)))}`); }
  // planted identities
  for (const [edit, re] of [[(p) => { p.populations.VALIDATION.note = 'blocks 941 to 960'; }, /BLOCK_NUMBER_AT/], [(p) => { p.populations.VALIDATION.seed = 941000000017; }, /FORBIDDEN_KEY_AT|SEED_LIKE_NUMBER_AT/], [(p) => { p.populations.VALIDATION.first = 'HD1V-0001'; }, /CLASS_ALIAS_AT/], [(p) => { p.populations.VALIDATION.w = 'a'.repeat(64); }, /UNDECLARED_HASH_AT/]]) {
    const t = clone(); edit(t); assert.ok(validate(seal(t)).some((i) => re.test(i)), String(re)); }
});

test('every KNOWN_NOW identity equals the tracked record it names; nothing unbuilt is presented as known', async () => {
  const M = P.mustBeFrozenBeforeExecution, known = M.filter((e) => e.status === 'KNOWN_NOW'), later = M.filter((e) => e.status === 'TO_BE_BOUND_AT_FREEZE'); assert.equal(known.length + later.length, M.length); assert.equal(known.length, P.readiness.knownNow); assert.equal(later.length, P.readiness.toBeBoundAtFreeze);
  const pointer = (obj, ptr) => ptr.split(/\.|\[|\]/).filter(Boolean).reduce((o, k) => o?.[k], obj), subset = (a, b) => (a !== null && typeof a === 'object' && !Array.isArray(a) ? Object.keys(a).every((k) => JSON.stringify(a[k]) === JSON.stringify(b?.[k])) : JSON.stringify(a) === JSON.stringify(b));
  for (const e of known) { let actual;
    if (e.source.startsWith('sha256 of ')) actual = sha(readFileSync(resolve(GA, e.source.slice(10))));
    else { const [file, ptr] = e.source.split(' #'); assert.ok(existsSync(resolve(GA, file)), `${e.item}: ${file}`); actual = file.endsWith('.json') ? pointer(JSON.parse(readFileSync(resolve(GA, file), 'utf8')), ptr) : pointer(await import(pathToFileURL(resolve(GA, file)).href), ptr); }
    assert.ok(actual !== undefined, `${e.item}: nothing at ${e.source}`); assert.ok(subset(e.value, actual), `${e.item}: ${JSON.stringify(e.value)} != ${JSON.stringify(actual)}`); }
  // sources are tracked files (nothing is taken from privileged or untracked data)
  for (const e of known) { const file = e.source.startsWith('sha256 of ') ? e.source.slice(10) : e.source.split(' #')[0]; assert.ok(!file.includes('/work/') && !file.startsWith('stage3h-hdisc1-discriminator-v1/'), e.item); }
  for (const e of later) { assert.equal(e.value, undefined, e.item); assert.ok(e.boundBy.length > 5, e.item); }
  for (const needle of ['discriminator inference closure', 'encoder', 'pair model family', 'matched ablation contract', 'this protocol', 'trained model hashes', 'evaluation runner', 'allocation record', 'evidence-bundle manifest', 'backup acceptance record']) assert.ok(later.some((e) => e.item.includes(needle)), needle);
  for (const needle of ['frozen SK1 model hash', 'C10 model', 'comparator source closure', 'evaluator definitions', 'exclusion context identity', 'runtime: node version', 'contract reference']) assert.ok(known.some((e) => e.item.includes(needle)), needle);
  assert.equal(known.find((e) => e.item.includes('frozen SK1 model hash')).value, 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b');
});

test('power at 900 classes is exact, reproduces the H-DISC-0 record, and the stop and negative-result rules are fixed before training', () => {
  const a = P.power.at900, p0 = a.baselineTopChoiceUnsafeRate, phi = a.associationPhi, cell = (d, red, model) => { const x = discordance(p0, p0 * (1 - red), model, phi); return Math.round(pairedPower(Math.floor(900 / d), x.pb, x.pc) * 1e4) / 1e4; };
  for (const model of ['INDEPENDENT', 'EMPIRICAL_ASSOCIATION']) for (const d of [1, 1.5, 2]) for (const red of [0.4, 0.5, 0.6]) assert.equal(a.power[model][`designEffect_${d}`][`reduction_${red}`], cell(d, red, model));
  const rec = JSON.parse(readFileSync(resolve(HDISC0, 'evidence/HDISC0_DESIGN_EVIDENCE.json'), 'utf8')).power.recommendedPlan;
  assert.equal(rec.recommendedValidationClasses, 900); assert.equal(a.power.INDEPENDENT['designEffect_1.5']['reduction_0.5'], rec.powerAtRecommended.halving_independent); assert.equal(a.power.EMPIRICAL_ASSOCIATION['designEffect_1.5']['reduction_0.5'], rec.powerAtRecommended.halving_empiricalAssociation);
  assert.ok(a.power.INDEPENDENT['designEffect_2']['reduction_0.5'] < 0.8); // disclosed: under heavier clustering a halving is not at 80%
  const hw = a.pairedEffectSizeInterval.halving.INDEPENDENT['designEffect_1.5']; assert.ok(hw.halfWidth95 > 0.02 && hw.halfWidth95 < 0.03 && hw.expectedDifference + hw.oneSidedUpper95Offset < 0);
  assert.deepEqual(P.stopRules.map((s) => s.id), ['STOP_ENTRY_GATE', 'STOP_SUPPLY', 'STOP_DEVELOPMENT', 'STOP_VACUOUS_PAIR_MODEL', 'STOP_EXECUTION_VALIDITY', 'NO_INTERIM_LOOK']);
  assert.match(P.stopRules[2].when, /before validation classes are generated/); assert.match(P.negativeResultRules.wellPoweredNull, /public-information limit/); assert.match(P.negativeResultRules.noAutomaticFollowUp, /authorizes another campaign/);
  assert.equal(P.sharpenings.filter((s) => s.label === 'SHARPENED_NOT_CHANGED').length, 6); for (const s of P.sharpenings) assert.ok(s.hdisc0.length > 10 && s.here.length > 10 && s.why.length > 10, s.id);
  assert.equal(P.learnerConfiguration.status, 'SPECIFIED_PROPOSED_FOR_OWNER_CONFIRMATION'); assert.equal(P.learnerConfiguration.grid.configurations, P.learnerConfiguration.grid.treesPerBag.length * P.learnerConfiguration.grid.maxDepth.length * P.learnerConfiguration.grid.learningRate.length);
});
