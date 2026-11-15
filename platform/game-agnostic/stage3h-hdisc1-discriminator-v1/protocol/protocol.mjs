// STAGE3H-H-DISC-1 — registration-READY prospective protocol: builder and validator (authority R0).
//   node protocol/protocol.mjs            build in memory, validate, print a summary
//   node protocol/protocol.mjs --write    create protocol/HDISC1_PROTOCOL.json (exclusive)
//   node protocol/protocol.mjs verify     rebuild from tracked records and compare byte-for-byte with the stored file
//
// STATUS OF WHAT THIS PRODUCES: REGISTRATION_READY_NOT_FROZEN_NOT_REGISTERED_NOT_AUTHORIZED.
// It is a fully specified design. It is not a freeze record, it binds no population, it allocates no block and no
// seed, and it authorises nothing. A freeze is a separate, committed, hash-bound record made after owner
// authorisation and a GO from the campaign-entry gate.
//
// Every arm, ladder rung, endpoint, decision class and protocol step is taken from the tracked H-DISC-0 documents;
// tests compare this file's output with those documents. Identity values marked KNOWN_NOW are READ from tracked
// records at build time, never typed in. Nothing is trained, generated or evaluated. Node built-ins plus three tracked,
// pure modules (the H-DISC-0 power functions and contract reference, and the ablation contract in this directory).
import { readFileSync, openSync, writeSync, closeSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { pairedPower, discordance } from '../../stage3h-hdisc0-design-v1/analysis/design-evidence.mjs';
import { IDS as HDISC0_IDS, AUTHORITY, EVIDENCE as HDISC0_EVIDENCE } from '../../stage3h-hdisc0-design-v1/contract/pairwise-contract.mjs';
import { CONTRACT_ID as ABLATION_CONTRACT_ID, LADDER, CONTRASTS, DIMENSIONS, BEST_REACHABLE, ESSENTIAL_CONTRAST, FAMILIES, LABEL_FAMILIES, LEARNER_FAMILY, PAIR_SAMPLING_RULE, ATTRIBUTION, LICENSED_CLAIMS, NEVER_LICENSED } from './ablation-contract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GA = resolve(HERE, '../..');
export const PROTOCOL_FILE = resolve(HERE, 'HDISC1_PROTOCOL.json');
export const STATUS = 'REGISTRATION_READY_NOT_FROZEN_NOT_REGISTERED_NOT_AUTHORIZED', CAMPAIGN = 'STAGE3H-H-DISC-1', BASE_HEAD = '1ad0ea5a32c59dc5f97f2d4d9829f06e120015eb';
export const PLANNED = Object.freeze({ validationClasses: 900, explorationClasses: 1000, holdoutClasses: 0 });
const sha = (b) => createHash('sha256').update(b).digest('hex'), rel = (p) => resolve(GA, p), read = (p) => readFileSync(rel(p), 'utf8'), readJ = (p) => JSON.parse(read(p)), fileSha = (p) => sha(readFileSync(rel(p)));
const r4 = (x) => Math.round(x * 1e4) / 1e4, r6 = (x) => Math.round(x * 1e6) / 1e6;
/** Canonical JSON (sorted keys) for the self-hash. */
const stable = (v) => (v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}');

const F = { // tracked records the protocol reads
  prereg: 'stage3h-hdisc0-design-v1/H_DISC_0_PREREGISTRATION_DRAFT.md', statPlan: 'stage3h-hdisc0-design-v1/H_DISC_0_STATISTICAL_PLAN.md', architecture: 'stage3h-hdisc0-design-v1/H_DISC_0_ARCHITECTURE.md',
  designEvidence: 'stage3h-hdisc0-design-v1/evidence/HDISC0_DESIGN_EVIDENCE.json', contractRef: 'stage3h-hdisc0-design-v1/contract/pairwise-contract.mjs', exclusionPins: 'stage3h-hdisc0-design-v1/readiness/exclusions/input-pins.json',
  sk1Results: 'stage3h-sk1-safety-kernel-v1/evidence/SK1_VALIDATION_RESULTS.json', sk1Freeze: 'stage3h-sk1-safety-kernel-v1/evidence/SK1_EXPERIMENT_FREEZE.json', sk1Demo: 'stage3h-sk1-safety-kernel-v1/evidence/SK1_DEMO_RECORD.json',
  sk1Model: 'stage3h-sk1-safety-kernel-v1/models/SK1_MODEL.json', sk1Custody: 'stage3h-sk1-safety-kernel-v1/evidence/SK1_CUSTODY_MANIFEST.json', sk1Ledger: 'stage3h-sk1-safety-kernel-v1/evidence/SK1_SPEND_LEDGER.json',
  sk1Registry: 'stage3h-sk1-safety-kernel-v1/infra/exclusion-registry.json', sk11Inventory: 'stage3h-sk1-1-assurance-v1/evidence/SK1_1_REPRO_INVENTORY.json', ablation: 'stage3h-hdisc1-discriminator-v1/protocol/ablation-contract.mjs' };

// ---------------------------------------------------------------- parsing the tracked H-DISC-0 text
const clean = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim(), cells = (line) => line.split('|').slice(1, -1).map(clean);
const rowsMatching = (md, re) => md.split('\n').filter((l) => re.test(l)).map(cells);
export function readHdisc0() {
  const md = read(F.prereg), hyp = md.split('\n').filter((l) => l.startsWith('> ')).map((l) => l.slice(2)).join(' ');
  return { hypothesis: clean(hyp), arms: rowsMatching(md, /^\| [A-F] \|/).map(([arm, policy, role]) => ({ arm, policy, role })),
    ladder: rowsMatching(md, /^\| M(0|1|2|3a|3 = F) \|/).map(([arm, label, information, objective, isolates]) => ({ arm: arm.replace(' = F', ''), label, information, objective, isolates })),
    decisionRule: rowsMatching(md, /^\| `H_DISC_[A-Z_]+` \|/).map(([classification, condition]) => ({ classification, condition })),
    onePass: rowsMatching(md, /^\| \d+ \| /).map(([step, action, boundBy]) => ({ step: Number(step), action, boundBy })),
    primaryEndpoints: rowsMatching(md.slice(md.indexOf('### Primary policy endpoints'), md.indexOf('### Mechanism endpoints')), /^\| [a-zA-Z*]/).filter((r) => r[0] !== 'endpoint').map(([endpoint, arms, role]) => ({ endpoint, arms, role })),
    mechanismEndpoints: rowsMatching(md.slice(md.indexOf('### Mechanism endpoints'), md.indexOf('## 6.')), /^\| [a-zA-Z*]/).filter((r) => r[0] !== 'endpoint').map(([endpoint, definition]) => ({ endpoint, definition })) };
}

// ---------------------------------------------------------------- exact power at the planned size
function powerAt900(p0, phi) {
  const N = PLANNED.validationClasses, eff = (d) => Math.floor(N / d), cell = (d, red, model) => { const x = discordance(p0, p0 * (1 - red), model, phi); return r4(pairedPower(eff(d), x.pb, x.pc)); };
  const half = (d, red, model) => { const x = discordance(p0, p0 * (1 - red), model, phi), diff = x.pc - x.pb, v = (x.pb + x.pc - diff * diff) / eff(d); return { expectedDifference: r6(diff), halfWidth95: r6(1.959964 * Math.sqrt(v)), oneSidedUpper95Offset: r6(1.644854 * Math.sqrt(v)), expectedDiscordantClasses: r4(eff(d) * (x.pb + x.pc)) }; };
  const mdr = (d, model) => { let lo = 0, hi = 0.999; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2, x = discordance(p0, p0 * (1 - mid), model, phi); if (pairedPower(eff(d), x.pb, x.pc) >= 0.8) hi = mid; else lo = mid; } return r4(hi); };
  const DE = [1, 1.5, 2], REDS = [0.4, 0.5, 0.6], MODELS = ['INDEPENDENT', 'EMPIRICAL_ASSOCIATION'], zero = (p) => r6(Math.exp(N * Math.log1p(-p)));
  return { validationClasses: N, test: 'one-sided exact sign (McNemar) test on discordant classes, alpha 0.05; effective classes = classes / design effect', baselineTopChoiceUnsafeRate: p0, associationPhi: phi, planningDesignEffect: 1.5,
    power: Object.fromEntries(MODELS.map((m) => [m, Object.fromEntries(DE.map((d) => [`designEffect_${d}`, Object.fromEntries(REDS.map((red) => [`reduction_${red}`, cell(d, red, m)]))]))])),
    smallestDetectableRelativeReductionAt80PercentPower: Object.fromEntries(MODELS.map((m) => [m, Object.fromEntries(DE.map((d) => [`designEffect_${d}`, mdr(d, m)]))])),
    pairedEffectSizeInterval: { note: 'expected half-width of the two-sided 95% interval for the paired difference in top-choice unsafe rate (F minus D), normal approximation on effective classes, for a true halving; the reported interval is the origin-family cluster bootstrap',
      halving: Object.fromEntries(MODELS.map((m) => [m, Object.fromEntries(DE.map((d) => [`designEffect_${d}`, half(d, 0.5, m)]))])) },
    expectedCounts: { sk1FailureClasses: r4(N * p0), hdiscFailureClassesUnderAHalving: r4(N * p0 / 2) },
    absoluteQualificationIsNotMadeLikely: { statement: 'Nine hundred classes improve the power to detect a relative effect. They do not make absolute qualification likely: Contract A requires zero introductions, and more classes make zero harder to observe, not easier.',
      probabilityOfZeroIntroductionsIn900: Object.fromEntries([0.065, 0.0325, 0.01, 0.005, 0.002, 0.001, 0.0005].map((p) => [String(p), zero(p)])), rateNeededForEvenOddsOfZero: r6(1 - Math.pow(0.5, 1 / N)), rateNeededFor80PercentChanceOfZero: r6(1 - Math.pow(0.8, 1 / N)) } };
}

// ---------------------------------------------------------------- the must-freeze manifest
function mustFreeze() {
  const fz = readJ(F.sk1Freeze), demo = readJ(F.sk1Demo), model = readJ(F.sk1Model), res = readJ(F.sk1Results), inv = readJ(F.sk11Inventory), pins = readJ(F.exclusionPins), known = (item, value, source, note) => ({ item, status: 'KNOWN_NOW', value, source, ...(note ? { note } : {}) }), later = (item, boundBy, extra = {}) => ({ item, status: 'TO_BE_BOUND_AT_FREEZE', boundBy, ...extra });
  const d0 = demo.decisions[0];
  return [
    // contracts and frozen reference identities that already exist in tracked records
    known('observation contract', model.observationContract, `${F.sk1Model} #observationContract`),
    known('advisory evidence contract', model.evidenceContract, `${F.sk1Model} #evidenceContract`),
    known('discriminator identity', HDISC0_IDS.discriminator, `${F.contractRef} #IDS.discriminator`),
    known('pairwise comparator contract', HDISC0_IDS.pairContract, `${F.contractRef} #IDS.pairContract`),
    known('safety label contract', HDISC0_IDS.labelContract, `${F.contractRef} #IDS.labelContract`),
    known('menu ranking contract', HDISC0_IDS.rankingContract, `${F.contractRef} #IDS.rankingContract`),
    known('H-DISC-0 contract reference, source sha256', fileSha(F.contractRef), `sha256 of ${F.contractRef}`),
    known('H-DISC-0 pre-registration draft, sha256', fileSha(F.prereg), `sha256 of ${F.prereg}`),
    known('H-DISC-0 statistical plan, sha256', fileSha(F.statPlan), `sha256 of ${F.statPlan}`),
    known('H-DISC-0 design evidence, sha256', fileSha(F.designEvidence), `sha256 of ${F.designEvidence}`),
    known('arm D and E: frozen SK1 model hash', fz.models.SK1.modelHash, `${F.sk1Freeze} #models.SK1.modelHash`),
    known('arm D and E: frozen SK1 model file sha256', fz.models.SK1.sha256, `${F.sk1Freeze} #models.SK1.sha256`),
    known('arm D and E: frozen SK1 ranking parameters', fz.models.SK1.ranking, `${F.sk1Freeze} #models.SK1.ranking`),
    known('arm D and E: frozen SK1 kernel source hash', d0.kernelSourceHash, `${F.sk1Demo} #decisions[0].kernelSourceHash`),
    known('arm D and E: frozen SK1 Forge adapter source hash', d0.adapterSourceHash, `${F.sk1Demo} #decisions[0].adapterSourceHash`),
    known('arm D provenance: SK1 experiment freeze sha256', fileSha(F.sk1Freeze), `sha256 of ${F.sk1Freeze}`),
    known('arm D provenance: SK1 validation results sha256', fileSha(F.sk1Results), `sha256 of ${F.sk1Results}`),
    known('arm C: frozen H-W4 C10 model sha256', fz.models.C10.sha256, `${F.sk1Freeze} #models.C10.sha256`),
    known('arms A and B: frozen comparator source closure (29 custody-protected files; identity only)', inv.core.sourceIdentities.frozenComparators.closureSha256, `${F.sk11Inventory} #core.sourceIdentities.frozenComparators.closureSha256`, 'the files are outside git; to be re-verified against an issued evidence bundle at freeze'),
    known('frozen evaluator definitions, source closure', inv.core.sourceIdentities.frozenEvaluatorDefinitions.closureSha256, `${F.sk11Inventory} #core.sourceIdentities.frozenEvaluatorDefinitions.closureSha256`, 'measured at 179922dd; to be re-measured at freeze'),
    known('SK1 feature set (ladder arms M0 and M1), schema id', model.schema.id, `${F.sk1Model} #schema.id`),
    known('Contract A gate constants', res.rules, `${F.sk1Results} #rules`),
    known('cluster-bootstrap generator and resamples', { bootstrapSeed: res.rules.bootstrapSeed, resamples: res.rules.resamples }, `${F.sk1Results} #rules`),
    known('portable exclusion loader pins, file sha256', fileSha(F.exclusionPins), `sha256 of ${F.exclusionPins}`),
    known('portable exclusion loader and self-check, source sha256', pins.loaderSource, `${F.exclusionPins} #loaderSource`),
    known('exclusion context identity', pins.contextIdentitySha256, `${F.exclusionPins} #contextIdentitySha256`),
    known('forbidden blocks in the exclusion context (count)', pins.forbiddenBlocks, `${F.exclusionPins} #forbiddenBlocks`),
    known('SK1 exclusion registry file sha256', fz.exclusionRegistrySha256, `${F.sk1Freeze} #exclusionRegistrySha256`),
    known('SK1 spend ledger sha256', fileSha(F.sk1Ledger), `sha256 of ${F.sk1Ledger}`),
    known('SK1 custody manifest sha256', fileSha(F.sk1Custody), `sha256 of ${F.sk1Custody}`),
    known('runtime: node version', res.node, `${F.sk1Results} #node`, 'the only runtime SK1 results were produced and observed on'),
    known('runtime: platform', inv.platform, `${F.sk11Inventory} #platform`),
    // identities that do not exist yet, or that only the owner can create
    later('discriminator inference closure: entry point, file list and source sha256 (H_DISC_1_SOURCE_HASH)', 'H-DISC-1 implementation, committed; audited from committed source'),
    later('public decision-state encoder: M2 per-action descriptor schema id', 'H-DISC-1 implementation', { requires: 'public-only inputs; invariant to relabelling, menu order and D4; the four-menu feature collision removed' }),
    later('public decision-state encoder: pair-relation (rho) schema id', 'H-DISC-1 implementation'),
    later('public decision-state encoder: menu-context schema id', 'H-DISC-1 implementation'),
    later('pair model family implementation', 'H-DISC-1 implementation', { expectedIdentifier: FAMILIES.pair }),
    later('additive control family implementation', 'H-DISC-1 implementation', { expectedIdentifier: FAMILIES.additive }),
    later('matched ablation contract, source sha256', 'this lane, once committed', { expectedIdentifier: ABLATION_CONTRACT_ID, currentSha256: fileSha(F.ablation) }),
    later('this protocol, protocolSha256', 'the freeze record'),
    later('kernel identity and source hash', 'implementation of the kernel candidate', { expectedIdentifier: 'SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V2_CANDIDATE' }),
    later('learner configuration: grid, shared-configuration rule and the configuration it selects', 'owner confirmation of the proposed rule; then the training record'),
    later('trained model hashes: M0, M1, M2, M3a, M3 (= F)', 'training record, exploration only', { expectedIdentifier: 'HDISC_FORGE_PAIRWISE_V1 for F' }),
    later('capacity record and structural check of every trained arm', 'training record'),
    later('training and tuning code, source sha256', 'campaign infrastructure, not yet built'),
    later('campaign evaluation runner, source closure sha256', 'campaign infrastructure, not yet built'),
    later('identity-audit code, source sha256', 'campaign infrastructure, not yet built'),
    later('analysis code for the primary test, intervals and attribution, source sha256', 'campaign infrastructure, not yet built'),
    later('allocation record for the HDISC1 namespace', 'successor allocator through the exclusion loader, after authorisation', { note: 'no block is proposed or implied here' }),
    later('family split rule parameters', 'final allocation review', { expectedIdentifier: 'HDISC1_FAMILY_SPLIT_V1' }),
    later('EXPLORATION population summary, registry and class-list digest', 'population freeze'),
    later('VALIDATION population summary, registry and class-list digest', 'population freeze; outcomes locked'),
    later('re-estimated planning inputs (baseline, design effect, failure association)', 'exploration, out of fold, before validation classes are generated'),
    later('evidence-bundle manifest sha256', 'OWNER: issue a bundle on approved offline storage'),
    later('backup acceptance record sha256', 'OWNER: restore-verified backup on a different device'),
    later('campaign declaration and campaign-entry gate record (GO)', 'campaign-entry gate'),
    later('experiment freeze record', 'step 7 of the one-pass protocol'),
  ];
}

// ---------------------------------------------------------------- the protocol
export function build() {
  const h0 = readHdisc0(), de = readJ(F.designEvidence), res = readJ(F.sk1Results), model = readJ(F.sk1Model), p0 = de.planningInputs.baselineTopChoiceUnsafeRate.planningValue, phi = de.planningInputs.failureCoOccurrenceOfTwoPublicPolicies.phi, sk1 = res.policies.SK1_FORCED_CHOICE;
  const gates = res.rules, manifest = mustFreeze(), cfg = model.estimator.config;
  const body = {
    schema: 'SENTINEL_PROSPECTIVE_PROTOCOL_V1', campaignId: CAMPAIGN, authority: AUTHORITY.state, status: STATUS, frozen: false, registered: false, authorized: false, preparedAtBaseHead: BASE_HEAD,
    notAuthorizedByThisDocument: ['training', 'world generation', 'block or seed allocation', 'population identities', 'validation', 'holdout', 'deployment', 'authority change', 'remote push'],
    derivedFrom: { hdisc0PreregistrationDraft: { file: F.prereg, sha256: fileSha(F.prereg) }, hdisc0StatisticalPlan: { file: F.statPlan, sha256: fileSha(F.statPlan) }, hdisc0Architecture: { file: F.architecture, sha256: fileSha(F.architecture) },
      hdisc0DesignEvidence: { file: F.designEvidence, sha256: fileSha(F.designEvidence) }, hdisc0ContractReference: { file: F.contractRef, sha256: fileSha(F.contractRef) }, matchedAblationContract: { id: ABLATION_CONTRACT_ID, file: F.ablation, sha256: fileSha(F.ablation) } },
    hypothesis: { id: 'H-DISC', statement: h0.hypothesis, testedAt: 'full coverage, no abstention', status: 'a hypothesis, not a claim of learnability' },
    identities: { campaign: CAMPAIGN, policyComponent: HDISC0_IDS.discriminator, kernel: 'SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V2_CANDIDATE', model: 'HDISC_FORGE_PAIRWISE_V1', contracts: { pairwiseComparator: HDISC0_IDS.pairContract, safetyLabel: HDISC0_IDS.labelContract, menuRanking: HDISC0_IDS.rankingContract, matchedAblation: ABLATION_CONTRACT_ID },
      observationContract: model.observationContract, evidenceContract: HDISC0_EVIDENCE.contract, modelFamilies: { learner: LEARNER_FAMILY, pair: FAMILIES.pair, additiveControl: FAMILIES.additive },
      allocationNamespace: { name: 'HDISC1', allocation: null, note: 'to be allocated by a successor allocator through the exclusion loader at freeze time; nothing is proposed here' }, classAliases: { exploration: 'HD1E-nnnn', validation: 'HD1V-nnnn', note: 'opaque; assigned at population freeze' },
      familySplitRule: { id: 'HDISC1_FAMILY_SPLIT_V1', form: 'VALIDATION when parseInt(sha256(ruleId + "|" + family).slice(0, 8), 16) mod m < t, else EXPLORATION', m: 'TO_BE_FIXED_AT_ALLOCATION_REVIEW', t: 'TO_BE_FIXED_AT_ALLOCATION_REVIEW', planningValidationShare: r4(PLANNED.validationClasses / (PLANNED.validationClasses + PLANNED.explorationClasses)) },
      structuredExclusions: { loader: 'HDISC_PORTABLE_EXCLUSIONS_V1 (or the historical successor loader, which gives the identical context)', contextIdentitySha256: readJ(F.exclusionPins).contextIdentitySha256, forbiddenBlocks: readJ(F.exclusionPins).forbiddenBlocks, registries: readJ(F.exclusionPins).registries.length } },
    populations: { status: 'PLANNING_VALUES_NOT_AN_ALLOCATION', VALIDATION: { classes: PLANNED.validationClasses, kind: 'fresh DEV classes', use: 'one pass', fixedBy: 'owner decision in the H-DISC-1 mandate' },
      EXPLORATION: { classes: PLANNED.explorationClasses, kind: 'fresh DEV classes', use: 'fitting and all model selection, out of fold by origin family', subjectTo: 'final power and allocation review; a different size is an owner decision recorded in the frozen protocol' }, HOLDOUT: { classes: PLANNED.holdoutClasses, note: 'not authorized' },
      rules: ['fresh classes only, generated after the freeze, through the same admission and screening rule as SK1', 'exploration and validation are origin-family-disjoint', 'at least 30 origin families on the validation side; no family above 5% of validation classes', 'eligibility decided from the public observation and the legal menu only, identically for every arm', 'validation outcome files locked from population freeze until the single run', 'every class is H2 under the SK1 schedule; no statement about other horizons', 'the screening rule selects classes that stress the comparators; rates do not transfer to an unscreened distribution'] },
    arms: h0.arms, armConditions: 'identical public observations, identical complete legal menus, identical evaluator definitions, identical population identities and the same compute accounting for every arm',
    armE: { abstentionDisposition: 'No recommendation is issued. Under R0 the human owner or the certified Arbiter decides without kernel input. Abstentions are counted and reported; they are never treated as safe and never enter the primary test.' },
    ablationLadder: { contract: ABLATION_CONTRACT_ID, arms: LADDER, contrasts: Object.fromEntries(Object.entries(CONTRASTS).map(([id, c]) => [id, { isolates: c.isolates, differsByDesign: c.designed, unavoidableDifferences: c.unavoidable, bestReachableVerdict: BEST_REACHABLE[id] }])), controlledDimensions: DIMENSIONS, essentialContrast: ESSENTIAL_CONTRAST, pairSamplingRule: PAIR_SAMPLING_RULE },
    endpoints: {
      primary: { id: 'UNIQUE_COMPARATOR_RELATIVE_INTRODUCTION_CLASSES_AT_FULL_COVERAGE', name: 'paired reduction in unique comparator-relative catastrophe-introduction classes versus frozen SK1 forced choice', hdisc0Name: h0.primaryEndpoints[0].endpoint, candidateArm: 'F', referenceArm: 'D', design: 'paired on the same fresh validation classes',
        unit: 'a validation class counts once if its first-ranked decision set introduces a catastrophe against S0 or against Nexus-else-S0 in at least one member world', coverage: 'full; no abstention' },
      comparatorSpecific: [{ id: 'INTRODUCTIONS_VS_S0', reported: 'for every arm; count, rate, paired difference F minus D with interval', role: 'Contract A gate for F (must be zero)' }, { id: 'INTRODUCTIONS_VS_NEXUS_ELSE_S0', reported: 'for every arm; count, rate, paired difference F minus D with interval', role: 'Contract A gate for F (must be zero)' }],
      policyEndpointsAsInHdisc0: h0.primaryEndpoints, mechanismEndpointsAsInHdisc0: h0.mechanismEndpoints, notValidationMaterial: 'The 83 H-W4 failures and the 39 SK1 forced-choice failures informed the design. No endpoint is computed on them.' },
    primaryTest: { hypotheses: { H0: "F's top-choice unsafe rate is not lower than D's", H1: 'it is lower' }, exactTest: 'one-sided exact sign (McNemar) test on discordant classes', alpha: 0.05, statistic: 'b = classes where D fails and F does not; c = classes where F fails and D does not; reject when b reaches the exact critical value for b + c',
      effectSize: { estimate: 'paired difference in top-choice unsafe rate, F minus D; and the relative reduction', interval: 'two-sided 95% origin-family cluster bootstrap', generator: gates.bootstrapSeed, resamples: gates.resamples },
      rejectionRule: 'H0 is rejected only if the exact sign test gives p <= 0.05 AND the one-sided 95% origin-family cluster-bootstrap upper bound of the paired difference (F minus D) is below 0', clusteringUnit: 'origin family' },
    absoluteQualification: { contract: 'CONTRACT_A_FULL_COVERAGE_DECISION_QUALIFICATION', unchanged: true, gates: { introductionsVsS0: gates.introductionsVsS0, introductionsVsNexus: gates.introductionsVsNexus, illegalActions: gates.illegalActions, completeLawfulDecisionCoverage: gates.completeCoverage, minMeanNregImprovementVsEachComparator: gates.minMeanNregImprovement, regretOneSided95FamilyClusteredUpperBoundBelow: gates.regretUpper95Below, identityAndD4Violations: gates.identityViolations, deterministicReplay: true, decisionMedianMsMax: gates.decisionMedianMsMax, decisionMaxMsMax: gates.decisionMaxMsMax, catastropheRegret: gates.catastropheRegret },
      source: `${F.sk1Results} #rules`, statement: 'A supported relative reduction with any remaining introduction is NOT_QUALIFIED. Relative improvement over SK1 is not evidence of absolute safety.' },
    multiplicity: { confirmatory: { tests: 1, test: 'F against D on the primary endpoint', alpha: 0.05, adjustment: 'none: one test' },
      secondaryFamilies: [{ family: 'COMPARATOR_SPECIFIC_SAFETY', tests: ['introductions against S0, F against D, paired', 'introductions against Nexus-else-S0, F against D, paired', 'top-choice catastrophe rate, F against D, paired'], adjustment: 'Holm, family alpha 0.05' },
        { family: 'REGRET', tests: ['mean normalised regret, F against C', 'non-inferiority of F to D within 0.02'], adjustment: 'Holm, family alpha 0.05', note: 'the Contract A regret gates against A and B are fixed gates, not members of a multiplicity family' },
        { family: 'PAIRWISE_ORDERING', tests: ['share of safe-unsafe pairs correctly ordered, F against D: overall; same action type; different action type'], adjustment: 'Holm, family alpha 0.05' }],
      mechanismFamily: { family: 'H_DISC_MECHANISM_QUALIFICATION', tests: Object.keys(CONTRASTS), adjustment: 'Holm, family alpha 0.05, separate from every policy family' },
      gatekeeping: 'Secondary and mechanism families are interpreted inferentially only if the confirmatory test rejects. Otherwise they are reported as descriptive.', descriptiveOnly: ['every endpoint by origin family', 'rescue and harm rates', 'consistency: withheld pairs, majority cycles, cycles at the top', 'twin sensitivity'] },
    mechanismQualification: { label: 'H_DISC_MECHANISM_QUALIFICATION', separateFromPolicyQualification: true, statement: 'This analysis asks WHY a difference arises. It never changes the policy classification, and the policy classification never depends on it.', essentialContrast: ESSENTIAL_CONTRAST, test: 'the primary paired test and interval, applied to the lower arm against the upper arm of each ladder contrast',
      precondition: 'the contrast verdict from assertMatchedContrast is FULLY_MATCHED or PARTIALLY_MATCHED and the trained pair arm passes the structural check', outcomes: Object.values(ATTRIBUTION), licensedClaims: LICENSED_CLAIMS, neverLicensed: NEVER_LICENSED,
      classification: { H_DISC_MECHANISM_SUPPORTED: `${ESSENTIAL_CONTRAST} is SUPPORTED`, H_DISC_MECHANISM_NOT_SUPPORTED: `${ESSENTIAL_CONTRAST} is NOT_SUPPORTED`, H_DISC_MECHANISM_UNRESOLVED: `${ESSENTIAL_CONTRAST} is UNRESOLVED`, H_DISC_MECHANISM_NOT_TESTABLE: `${ESSENTIAL_CONTRAST} is NOT_TESTABLE, including a vacuous M3a`, H_DISC_MECHANISM_NOT_APPLICABLE: 'F did not improve on D' },
      expectedPower: 'adjacent contrasts are powered only for large effects at 900 classes; UNRESOLVED is the likely outcome for a modest contribution and is not a negative finding' },
    decisionRule: { exactlyOne: h0.decisionRule, statedInAdvance: ['A supported reduction with any remaining introduction is NOT_QUALIFIED.', 'Relative improvement over SK1 is not evidence of absolute safety.', 'No result grants execution authority. The component stays R0.', 'A negative result does not authorize another campaign.'] },
    learnerConfiguration: { status: 'SPECIFIED_PROPOSED_FOR_OWNER_CONFIRMATION', learnerFamily: LEARNER_FAMILY, reference: { sk1TrainerConfiguration: cfg, source: `${F.sk1Model} #estimator.config` },
      grid: { id: 'HDISC1_CONFIGURATION_GRID_V1', bags: [cfg.bags], treesPerBag: [50, 100, 200], maxDepth: [2, 3, 4], learningRate: [0.05, 0.1], minLeaf: [cfg.minLeaf], lambda: [cfg.lambda], maxBins: [cfg.maxBins], configurations: 18 },
      sharedConfigurationRule: { id: 'HDISC1_SHARED_CONFIGURATION_RULE_V1', rule: 'Every ladder arm is fitted at every grid configuration, out of fold over five origin-family folds. ONE configuration is selected for all arms: the one minimising the sum over the five ladder arms of out-of-fold top-choice unsafe classes. Ties: smaller treesPerBag x maxDepth, then smaller learningRate.', consequence: 'equal tree budget and equal tuning effort for every arm by construction; no arm is tuned on its own',
        noteOnDvsM0: 'the D-to-M0 step is capacity-matched only if the selected configuration equals the SK1 risk-head budget; otherwise that step is NOT_TESTABLE and is reported so' },
      folds: { rule: 'HDISC1_FAMILY_FOLDS_V1', count: 5, unit: 'origin family' }, randomisation: { scheme: 'every pseudo-random stream is derived from a text label HDISC1|<arm>|<stage>|<head>; no numeric seed is stored or chosen', bagBootstrap: 'ORIGIN_FAMILY_BOOTSTRAP' },
      featureSubset: 'none: every declared input is available to the learner; no feature selection step exists', tieRule: 'exact ties in the ranking contract are returned as a set; no tie band or margin exists. Introducing one would be a protocol change and needs a new freeze',
      pairTraining: { samplingRule: PAIR_SAMPLING_RULE, definition: 'every unordered pair of selectable actions of each class once; pair weights normalised so each class carries the same total weight as in the pointwise arms' } },
    developmentRules: ['out-of-fold evaluation by origin-family folds for every choice', 'every tunable is chosen by a rule in the frozen protocol, applied to exploration data only', 'baseline rate, design effect and the association between F and D failures are re-estimated out of fold on exploration and reported before validation classes are generated', 'the validation size stays 900: re-estimated power is reported, it does not resize the campaign', 'evaluator labels are used for training and offline evaluation only; they never reach inference'],
    stopRules: [
      { id: 'STOP_ENTRY_GATE', when: 'before any step', condition: 'the campaign-entry gate does not return GO on all seven conditions', consequence: 'nothing begins: no allocation, no generation, no training', result: 'CAMPAIGN_READINESS=NO_GO' },
      { id: 'STOP_SUPPLY', when: 'final allocation review; again at each population freeze', condition: 'the allocated namespace cannot supply 1,000 exploration and 900 validation classes that are family-disjoint, with at least 30 validation families and no family above 5% of validation', consequence: 'stop before training (exploration) or before opening outcomes (validation); a smaller campaign needs a new owner decision and a new freeze', result: 'H_DISC_EXPERIMENT_BLOCKED_OR_INVALID' },
      { id: 'STOP_DEVELOPMENT', when: 'after training, before validation classes are generated', condition: "F's out-of-fold top-choice unsafe count on the exploration classes is not strictly below frozen D's count on the same classes", consequence: 'the campaign stops before validation and is reported as a development-stage negative', result: 'H_DISC_NO_SUPPORTED_ADVANTAGE (development stop; validation not run)' },
      { id: 'STOP_VACUOUS_PAIR_MODEL', when: 'after training', condition: 'the trained M3a has no root-to-leaf path that splits on both actions', consequence: 'the mechanism analysis is NOT_TESTABLE; the policy campaign may continue, and the report must say that F was not shown to be a non-additive model in substance', result: 'H_DISC_MECHANISM_NOT_TESTABLE' },
      { id: 'STOP_EXECUTION_VALIDITY', when: 'identity audit and the validation pass', condition: 'any execution-validity gate fails, a privileged read is detected, replay is not deterministic, or a frozen identity does not match', consequence: 'the result is invalid; outcomes are not interpreted', result: 'H_DISC_EXPERIMENT_BLOCKED_OR_INVALID' },
      { id: 'NO_INTERIM_LOOK', when: 'always', condition: 'one validation pass; a start marker; an exclusive result file', consequence: 'no interim analysis, no candidate replacement, no change of threshold, feature or rule after the experiment freeze', result: 'a second run is refused' },
    ],
    negativeResultRules: { wellPoweredNull: 'If the confirmatory test does not reject and the power re-estimated on exploration for a halving is at least 0.8, the result is recorded as evidence for a public-information limit at that effect size in these menus.', underPoweredNull: 'If re-estimated power is below 0.8 the non-rejection is recorded as inconclusive, not as evidence for a limit.',
      noAutomaticFollowUp: 'No result, positive or negative, authorizes another campaign, a larger sample, a changed target or a changed model.', noSoftening: 'The decision class is assigned by the rule fixed here. Post hoc subgroups, alternative endpoints and alternative thresholds are labelled exploratory and change nothing.' },
    executionValidity: ['allow-listed reads only', 'a poisoned privileged view gives identical decisions', 'zero illegal actions in the audit', 'features invariant under D4', 'every identity test exercised on every validation class', 'negative controls for handle order, menu position and hidden health all detected', 'the inference closure passes an evaluator-free graph audit from committed source', 'deterministic replay across two passes', 'a check mode that recomputes and writes nothing'],
    onePassProtocol: h0.onePass, afterStep7: 'No interim look. No candidate replacement. No change of threshold, feature or rule after step 7.',
    power: { planningInputs: { source: F.designEvidence, baselineTopChoiceUnsafeRate: p0, associationPhi: phi, measuredOn: 'spent or development data; planning assumptions to be re-estimated on fresh exploration', sk1ForcedChoiceOnHistoricalValidation: { introVsS0: sk1.introVsS0, introVsNexus: sk1.introVsNexus, classes: sk1.classes } }, at900: powerAt900(p0, phi) },
    sharpenings: [
      { id: 'S1', label: 'SHARPENED_NOT_CHANGED', topic: 'rejection rule of the primary test', hdisc0: 'test: one-sided exact sign (McNemar) test on discordant classes, alpha = 0.05; reported interval: origin-family cluster bootstrap of the paired difference', here: 'H0 is rejected only if the exact sign test gives p <= 0.05 AND the one-sided 95% origin-family cluster-bootstrap upper bound of the paired difference is below 0', why: 'the H-DISC-0 power model already divides classes by a design effect, which presumes a decision that respects clustering; the added condition can only make rejection harder' },
      { id: 'S2', label: 'SHARPENED_NOT_CHANGED', topic: 'what "matched" means for M2 against M3a', hdisc0: 'same label, same information, same learner family, same capacity budget, same compute budget; only the objective differs', here: 'equal tree budget and a shared compute ceiling; the objective differs by design; three differences cannot be removed (input width and antisymmetrisation; pairs as the training unit; quadratic pair evaluations) and are declared, so the best reachable verdict is PARTIALLY_MATCHED', why: 'H-DISC-0 itself says a contrast whose capacity or compute cannot be equalised is PARTIALLY_MATCHED' },
      { id: 'S3', label: 'SHARPENED_NOT_CHANGED', topic: 'the D-to-M0 step', hdisc0: 'M0 isolates new data only (against D)', here: 'under the fixed model-family interface M0 is ranked by the H-DISC ranking contract while D ranks by risk tier and a separate regret head, so the ranking contract changes together with the data; the step is PARTIALLY_MATCHED at best', why: 'the definition of M0 is unchanged; the attribution strength is stated honestly' },
      { id: 'S4', label: 'SHARPENED_NOT_CHANGED', topic: 'development stop rule', hdisc0: "if out-of-fold evidence on exploration does not show F's top-choice unsafe rate below D's on the same classes, the campaign stops before validation", here: "F's out-of-fold top-choice unsafe COUNT must be strictly below frozen D's count on the same exploration classes; no significance requirement; D is applied frozen", why: 'makes the rule mechanical' },
      { id: 'S5', label: 'SHARPENED_NOT_CHANGED', topic: 'attribution outcomes', hdisc0: 'SUPPORTED, NOT_SUPPORTED, or UNRESOLVED when the interval includes both zero and half the total effect', here: 'SUPPORTED: the test rejects and the clustered interval lies below zero. UNRESOLVED: the interval includes zero and half the total effect. NOT_SUPPORTED: it includes zero and excludes half the total effect. Two labels added for cases H-DISC-0 named in prose: NOT_TESTABLE and NOT_APPLICABLE_NO_TOTAL_EFFECT', why: 'makes the three outcomes computable' },
      { id: 'S6', label: 'SHARPENED_NOT_CHANGED', topic: 'equal capacity and equal tuning effort', hdisc0: 'an equal capacity budget; equal tuning effort: the same number of configurations tried by the same pre-registered rule', here: 'one configuration shared by all ladder arms, selected by a rule that sums out-of-fold failures over the arms', why: 'separate tuning per arm would let capacities differ and would break the matching' },
      { id: 'R1', label: 'RESOLVED_BY_OWNER_MANDATE', topic: 'validation size', hdisc0: '900 recommended; 600 only with a pre-registered 60% effect', here: '900 fresh DEV classes', why: 'fixed in the H-DISC-1 owner mandate; the 600-class alternative is dropped' },
    ],
    mustBeFrozenBeforeExecution: manifest,
    openItemsBeforeFreeze: [
      { item: 'implementation identities: discriminator inference closure, encoder schemas, model families', owner: 'H-DISC-1 implementation' }, { item: 'kernel candidate, training code, evaluation runner, identity audit and analysis code', owner: 'campaign infrastructure, not yet built' },
      { item: 'confirmation of the proposed learner grid and shared-configuration rule', owner: 'OWNER' }, { item: 'final power and allocation review: exploration size, family-split parameters, block and family supply', owner: 'OWNER with the allocator; no allocation is made here' },
      { item: 'an issued evidence bundle and a restore-verified backup', owner: 'OWNER' }, { item: 'a GO from the campaign-entry gate', owner: 'gate' }, { item: 'authorization to freeze, and separately to run', owner: 'OWNER' } ],
  };
  const known = manifest.filter((e) => e.status === 'KNOWN_NOW').length;
  body.readiness = { PREREGISTRATION_READY: true, basis: 'every design element is specified; what remains are identities to be bound at freeze, owner confirmations and owner authorization', PREREGISTRATION_FROZEN: false, PREREGISTRATION_REGISTERED: false, CAMPAIGN_AUTHORIZED: false, mustFreezeEntries: manifest.length, knownNow: known, toBeBoundAtFreeze: manifest.length - known };
  return { ...body, protocolSha256: sha(stable(body)) };
}

// ---------------------------------------------------------------- validator
const FORBIDDEN_KEY = /^(seed|seeds|block|blocks|blockRange|blockNumbers|worldHash|worldHashes|classIds|classListDigest|populationIdentity|populationIdentities|members|truth)$/;
/** Returns the list of problems; empty means the protocol is a valid registration-ready (not frozen) protocol. */
export function validate(p) {
  const issues = [], need = (code, ok) => { if (!ok) issues.push(code); }, h0 = readHdisc0(), rules = readJ(F.sk1Results).rules;
  if (!p || typeof p !== 'object') return ['PROTOCOL_NOT_AN_OBJECT'];
  const { protocolSha256, ...body } = p; need('PROTOCOL_HASH_MISMATCH', protocolSha256 === sha(stable(body)));
  need('STATUS_NOT_REGISTRATION_READY', p.status === STATUS); need('MUST_NOT_BE_FROZEN', p.frozen === false && p.readiness?.PREREGISTRATION_FROZEN === false); need('MUST_NOT_BE_REGISTERED', p.registered === false && p.readiness?.PREREGISTRATION_REGISTERED === false); need('MUST_NOT_BE_AUTHORIZED', p.authorized === false && p.readiness?.CAMPAIGN_AUTHORIZED === false);
  need('STATUS_TEXT_CLAIMS_FREEZE_OR_REGISTRATION', !/(^|_)(FROZEN|REGISTERED|AUTHORIZED)(_|$)/.test(String(p.status).replace(/NOT_FROZEN|NOT_REGISTERED|NOT_AUTHORIZED/g, '')));
  need('CAMPAIGN_ID', p.campaignId === CAMPAIGN); need('AUTHORITY_NOT_R0', p.authority === 'R0');
  need('VALIDATION_SIZE', p.populations?.VALIDATION?.classes === 900); need('EXPLORATION_SIZE', p.populations?.EXPLORATION?.classes === 1000); need('HOLDOUT_MUST_BE_ZERO', p.populations?.HOLDOUT?.classes === 0); need('ALLOCATION_MUST_BE_EMPTY', p.identities?.allocationNamespace?.allocation === null);
  need('ARMS_DIFFER_FROM_HDISC0', JSON.stringify(p.arms) === JSON.stringify(h0.arms) && h0.arms.length === 6);
  need('LADDER_DIFFERS_FROM_HDISC0', Array.isArray(p.ablationLadder?.arms) && p.ablationLadder.arms.length === 5 && p.ablationLadder.arms.every((a, i) => ['arm', 'label', 'information', 'objective', 'isolates'].every((k) => a[k] === h0.ladder[i][k])));
  need('ESSENTIAL_CONTRAST', p.ablationLadder?.essentialContrast === 'M2_vs_M3a' && p.mechanismQualification?.essentialContrast === 'M2_vs_M3a');
  const pe = p.endpoints?.primary; need('PRIMARY_ENDPOINT', pe?.id === 'UNIQUE_COMPARATOR_RELATIVE_INTRODUCTION_CLASSES_AT_FULL_COVERAGE' && pe.candidateArm === 'F' && pe.referenceArm === 'D' && /paired/.test(pe.design ?? '') && /full/.test(pe.coverage ?? ''));
  need('COMPARATOR_ENDPOINTS', JSON.stringify((p.endpoints?.comparatorSpecific ?? []).map((e) => e.id)) === JSON.stringify(['INTRODUCTIONS_VS_S0', 'INTRODUCTIONS_VS_NEXUS_ELSE_S0']));
  const t = p.primaryTest; need('PRIMARY_TEST', t?.alpha === 0.05 && /one-sided exact sign/.test(t.exactTest ?? '') && /cluster/.test(t.effectSize?.interval ?? '') && /AND/.test(t.rejectionRule ?? '') && t.effectSize?.generator === rules.bootstrapSeed && t.effectSize?.resamples === rules.resamples);
  const g = p.absoluteQualification?.gates ?? {}; need('ABSOLUTE_GATES_CHANGED', p.absoluteQualification?.unchanged === true && g.introductionsVsS0 === rules.introductionsVsS0 && g.introductionsVsNexus === rules.introductionsVsNexus && g.illegalActions === rules.illegalActions && g.completeLawfulDecisionCoverage === rules.completeCoverage
    && g.minMeanNregImprovementVsEachComparator === rules.minMeanNregImprovement && g.regretOneSided95FamilyClusteredUpperBoundBelow === rules.regretUpper95Below && g.identityAndD4Violations === rules.identityViolations && g.deterministicReplay === true && g.decisionMedianMsMax === rules.decisionMedianMsMax && g.decisionMaxMsMax === rules.decisionMaxMsMax && g.catastropheRegret === rules.catastropheRegret);
  need('MULTIPLICITY', p.multiplicity?.confirmatory?.tests === 1 && p.multiplicity?.mechanismFamily?.family === 'H_DISC_MECHANISM_QUALIFICATION' && (p.multiplicity?.secondaryFamilies ?? []).every((f) => /Holm/.test(f.adjustment)));
  need('MECHANISM_NOT_SEPARATE', p.mechanismQualification?.separateFromPolicyQualification === true);
  need('DECISION_RULE_DIFFERS_FROM_HDISC0', JSON.stringify(p.decisionRule?.exactlyOne) === JSON.stringify(h0.decisionRule) && h0.decisionRule.length === 4);
  need('ONE_PASS_PROTOCOL_DIFFERS_FROM_HDISC0', JSON.stringify(p.onePassProtocol) === JSON.stringify(h0.onePass) && h0.onePass.length === 10);
  need('STOP_RULES', ['STOP_ENTRY_GATE', 'STOP_SUPPLY', 'STOP_DEVELOPMENT', 'STOP_VACUOUS_PAIR_MODEL', 'STOP_EXECUTION_VALIDITY', 'NO_INTERIM_LOOK'].every((id) => (p.stopRules ?? []).some((s) => s.id === id)) && typeof p.negativeResultRules?.noAutomaticFollowUp === 'string');
  need('MUST_FREEZE_MANIFEST', Array.isArray(p.mustBeFrozenBeforeExecution) && p.mustBeFrozenBeforeExecution.length > 0 && p.mustBeFrozenBeforeExecution.every((e) => (e.status === 'KNOWN_NOW' && e.value !== undefined && e.value !== null && typeof e.source === 'string') || (e.status === 'TO_BE_BOUND_AT_FREEZE' && e.value === undefined && typeof e.boundBy === 'string')));
  need('POWER_AT_900', p.power?.at900?.validationClasses === 900 && typeof p.power.at900.absoluteQualificationIsNotMadeLikely?.statement === 'string');
  // no allocation, seed, world hash or population identity anywhere
  const allowedHex = new Set(); const collect = (v) => { if (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)) allowedHex.add(v); else if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') Object.values(v).forEach(collect); };
  collect(p.derivedFrom); collect((p.mustBeFrozenBeforeExecution ?? []).map((e) => [e.value, e.currentSha256])); collect(p.identities?.structuredExclusions); if (typeof p.protocolSha256 === 'string') allowedHex.add(p.protocolSha256);
  const scan = (v, path) => { if (typeof v === 'string') { for (const m of v.matchAll(/[0-9a-f]{64}/g)) if (!allowedHex.has(m[0])) issues.push(`UNDECLARED_HASH_AT:${path}`); if (/\b\d{12}\b/.test(v)) issues.push(`SEED_LIKE_NUMBER_AT:${path}`); if (/\b(SK1[EV]|HD1[EV])-\d{4}\b/.test(v)) issues.push(`CLASS_ALIAS_AT:${path}`); if (/\bblocks?\s+\d{3}\b|\b\d{3}\s*[–-]\s*\d{3}\b/.test(v)) issues.push(`BLOCK_NUMBER_AT:${path}`); }
    else if (typeof v === 'number') { if (Number.isInteger(v) && v >= 1e11) issues.push(`SEED_LIKE_NUMBER_AT:${path}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (FORBIDDEN_KEY.test(k)) issues.push(`FORBIDDEN_KEY_AT:${path}.${k}`); scan(x, `${path}.${k}`); } };
  scan(p, 'protocol');
  return issues;
}
export const serialise = (p) => JSON.stringify(p, null, 1) + '\n';
/** Recompute the self-hash of a protocol object (used by tests to show that a re-sealed tampered protocol is still refused). */
export const seal = (p) => { const { protocolSha256, ...body } = p; return { ...body, protocolSha256: sha(stable(body)) }; };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'print', p = build(), issues = validate(p), text = serialise(p);
  console.log(JSON.stringify({ mode, campaignId: p.campaignId, status: p.status, readiness: p.readiness, protocolSha256: p.protocolSha256, validationIssues: issues, powerAt900_halving: { independent: p.power.at900.power.INDEPENDENT, associated: p.power.at900.power.EMPIRICAL_ASSOCIATION } }, null, 1));
  if (issues.length) { console.log('HDISC1_PROTOCOL_INVALID'); process.exitCode = 1; }
  else if (mode === '--write') { const fd = openSync(PROTOCOL_FILE, 'wx'); writeSync(fd, text); closeSync(fd); console.log('written protocol/HDISC1_PROTOCOL.json'); }
  else if (mode === 'verify') { const same = existsSync(PROTOCOL_FILE) && readFileSync(PROTOCOL_FILE, 'utf8') === text; console.log(same ? 'HDISC1_PROTOCOL_VERIFY_PASS' : 'HDISC1_PROTOCOL_VERIFY_FAILED'); if (!same) process.exitCode = 1; }
  else if (mode !== 'print') throw Error('USAGE: node protocol/protocol.mjs [--write | verify]');
}
