#!/usr/bin/env node
/* STAGE_3F_FORMAL_FREEZE — the canonical, immutable Stage 3F inheritance boundary for Stage 3G.
 *
 *   node scripts/stage3f-freeze.mjs            build and write the formal freeze artifact
 *   node scripts/stage3f-freeze.mjs --check    rebuild and require a byte-identical artifact (never writes)
 *
 * Verify, bind, canonicalize, freeze. No measurement is derived here and no scientific conclusion is created or changed:
 * every frozen value is read from a committed, certified artifact (Stage 3F.6-CR certificate, claim map, Decision
 * Evaluation Contract v1, Stage 3F-RP contract and certificate, the symmetric-chain certificates, STAGE3F6-ERRATUM-001)
 * and the build fails closed if any of them disagrees. Governance declarations the certified record does not contain
 * (the expert roster, the check-mode invariant, the certifier-chain exception, the Stage 3G entry list in its split
 * form) are labelled as such, with their provenance.
 *
 * Hash-type discipline: every bound artifact carries two distinct, labelled identities —
 *   BOUND_SEMANTIC_HASH  the self-hash a certified document embeds (certificationHash, claimMapHash, contractHash, ...):
 *                        sha256 of JSON.stringify(document without that field); this is the scientific identifier the
 *                        certificate chain binds. null when the document embeds none.
 *   RAW_FILE_SHA256      sha256 of the committed file bytes (artifact integrity).
 * One is never substituted for the other.
 *
 * Deterministic: the output depends only on committed files and fixed commit identities.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FUTURE_CERTIFIER_PATTERN, INVARIANT_ID, enforceCheckModeReadOnly } from './certification/check-mode-guard.mjs';
import { CHECKS } from './reproducibility/stage3f-chain.mjs';
import { AUTHORITY, CERT, CLAIM_MAP_PATH, CONTRACT_PATH, PLAN_PATH, PREDECESSOR_CHAIN, decisionEvaluationContract, verifyBinding } from './stage3f6cr-plan.mjs';

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
const checkOnly = isMain && process.argv.includes('--check');
enforceCheckModeReadOnly({ checkOnly });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const top = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const rel = (f) => `platform/game-agnostic/${f}`;
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const serialise = (v) => `${JSON.stringify(v, null, 2)}\n`;
const git = (...a) => spawnSync('git', ['-C', top, ...a], { encoding: 'buffer', maxBuffer: 1 << 28 });

export const STAGE3F_FREEZE_VERSION = 'STAGE3F_FREEZE_V1';
export const OUT = 'artifacts/stage3f-freeze';
export const FREEZE_PATH = `${OUT}/stage3f-freeze.json`;
export const RESULT_PATH = `${OUT}/stage3f-freeze-certification-result.json`;
export const CR_CERTIFICATE = 'artifacts/stage3f6cr-confirmatory-reconciliation/stage3f6cr-certification-result.json';
export const CR_CERTIFIER = 'scripts/stage3f6cr-certify.mjs';
export const RP_CERTIFIER = 'scripts/certify-stage3frp-reproducibility-portability.mjs';
export const RP_CONTRACT = 'artifacts/stage3frp-reproducibility-portability/stage3frp-reproducibility-contract.json';
export const RP_ERRATUM = 'artifacts/stage3frp-reproducibility-portability/erratum-stage3f-portability.json';
export const CHECK_MODE_GUARD = 'scripts/certification/check-mode-guard.mjs';
export const MEASUREMENT_CERTIFIER_PATTERN = /^certify-stage3f(\d|6[a-z0-9]*)?-.*\.mjs$/; // Stage 3F-RP chain-coverage rule

/** The certified lineage, by full commit identity. */
export const LINEAGE = Object.freeze({
  CANONICAL_BRANCH: 'main',
  PRE_REPRODUCIBILITY_MAIN: '156f0ecdb3b3b90a06bf0dc4ea97b18e13c2410a', // Stage 3F.6-D-SYM certification
  STAGE3FRP_COMMIT: '5415e1365c5a01c3802030121c80f0bf69f1005a',
  CONFIRMATORY_PLAN_COMMIT: '890aa208ee08dec402f208629042fca7af1336c7',
  CONFIRMATORY_COMMIT: 'b5d195112243e88579f05a6f870139291e517ddc',
});
export const CANONICAL_PARENT_COMMIT = LINEAGE.CONFIRMATORY_COMMIT;
/** The only files the freeze stage may add or change on top of CANONICAL_PARENT_COMMIT. */
export const FREEZE_STAGE_FILES = Object.freeze([
  FREEZE_PATH, RESULT_PATH, CHECK_MODE_GUARD, 'scripts/stage3f-freeze.mjs', 'scripts/stage3f-freeze-certify.mjs',
  'tests/stage3f-freeze.test.js', 'docs/STAGE3F_FORMAL_FREEZE.md', 'package.json', 'README.md',
].map(rel));

/* ------------------------------------------------------------------ helpers */
function need(condition, message) { if (!condition) throw new Error(`STAGE3F_FREEZE: ${message}`); }
const rawSha256 = (f) => hex(readFileSync(at(f)));
/** A bound artifact: its embedded self-hash (verified to recompute) and its raw file hash, labelled distinctly. */
export function boundArtifact(file, field) {
  need(existsSync(at(file)), `missing ${file}`);
  const doc = readJson(file);
  if (field === null) return { file, BOUND_SEMANTIC_HASH: null, RAW_FILE_SHA256: rawSha256(file) };
  const { [field]: value, ...rest } = doc;
  need(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), `${file} has no ${field}`);
  need(hex(JSON.stringify(rest)) === value, `${file}: ${field} does not recompute from the document`);
  return { file, BOUND_SEMANTIC_HASH: { field, value }, RAW_FILE_SHA256: rawSha256(file) };
}
const semanticField = (file) => ['certificationHash', 'analysisFreezeHash', 'claimMapHash', 'contractHash', 'erratumHash', 'planHash'].find((k) => k in readJson(file)) ?? null;
const holds = (binding) => verifyBinding(binding).holds;
const sameBinding = (a, b) => a.certificate === b.certificate && a.certificationHash === b.certificationHash && a.path === b.path && JSON.stringify(a.expect) === JSON.stringify(b.expect);
const bindingsIn = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((b) => b && typeof b === 'object' && 'certificate' in b && 'path' in b);

/* ------------------------------------------------------------ bound record */
function certifiedRecord() {
  const cr = readJson(CR_CERTIFICATE);
  need(cr.stage === 'STAGE_3F_6_CR_CONFIRMATORY_RECONCILIATION' && cr.status === 'PASS', 'Stage 3F.6-CR certificate is not PASS');
  need(cr.conclusion.STAGE3F_SCIENTIFIC_COMPLETE === true && cr.conclusion.READY_FOR_3F_FREEZE === true, 'Stage 3F.6-CR does not declare Stage 3F scientifically complete and ready to freeze');
  need(Object.values(cr.exitCriteria).every((v) => v === true) && Object.values(cr.checks).every((v) => v === true), 'a Stage 3F.6-CR exit criterion or check is false');
  const plan = readJson(PLAN_PATH);
  const claimMap = readJson(CLAIM_MAP_PATH);
  const contract = readJson(CONTRACT_PATH);
  need(plan.planHash === cr.plan.planHash && cr.plan.freezeCommit === LINEAGE.CONFIRMATORY_PLAN_COMMIT, 'plan is not the one the certificate binds');
  need(claimMap.claimMapHash === cr.claimMap.claimMapHash && plan.claimMap.claimMapHash === cr.claimMap.claimMapHash, 'claim map does not match the certificate');
  need(contract.contractHash === cr.decisionEvaluationContract.contractHash && rawSha256(CONTRACT_PATH) === cr.decisionEvaluationContract.fileSha256, 'contract does not match the certificate');
  for (const [f, sha] of Object.entries(cr.artifactHashes)) need(rawSha256(f) === sha, `${f} changed since Stage 3F.6-CR`);
  return { cr, plan, claimMap, contract };
}

/* ---------------------------------------------------------- symmetric chain */
const CHAIN_KEYS = Object.freeze({ '3F6P1C': 'P1C', '3F6P1D': 'P1D', '3F6P1E': 'P1E', T_SYM: 'TSYM', P1A_SYM: 'P1ASYM', P1_SYM: 'P1SYM', W_SYM: 'WSYM', D_SYM_FREEZE: 'DSYM_FREEZE', D_SYM: 'DSYM' });
function symmetricChain(cr) {
  const rp = readJson(CERT.RP);
  need(JSON.stringify(PREDECESSOR_CHAIN) === JSON.stringify(Object.keys(CHAIN_KEYS)), 'predecessor chain differs from Stage 3F.6-CR');
  const stages = Object.fromEntries(PREDECESSOR_CHAIN.map((id) => {
    const file = CERT[CHAIN_KEYS[id]];
    const record = boundArtifact(file, semanticField(file));
    need(rp.requalification[id]?.storedHash === record.BOUND_SEMANTIC_HASH.value && rp.requalification[id]?.canonicalStatus === 'BYTE_EXACT', `${id} is not BYTE_EXACT under the canonical profile in Stage 3F-RP`);
    const direct = cr.predecessors.checks.find((c) => c.id === id);
    if (direct) need(direct.status === 'BYTE_EXACT' && direct.storedHash === record.BOUND_SEMANTIC_HASH.value, `${id} did not reproduce in Stage 3F.6-CR`);
    const chainEntry = CHECKS.find((c) => c.id === id);
    need(chainEntry && chainEntry.result === file, `${id} is not sealed in the Stage 3F chain at ${file}`);
    return [id, record];
  }));
  /* Transitive coverage: a byte-identical recomputation of a certificate that records its predecessor gate as true
   * implies every gated predecessor reproduced during that recomputation. */
  const gate = (key) => readJson(CERT[key]).predecessorChecks;
  const coverage = {
    W_SYM: { gate: gate('WSYM'), reproducesTransitively: ['P1_SYM'] },
    P1_SYM: { gate: gate('P1SYM'), reproducesTransitively: ['P1A_SYM'] },
    P1A_SYM: { gate: gate('P1ASYM'), reproducesTransitively: ['3F6P1C', '3F6P1D', '3F6P1E', 'T_SYM'] },
    T_SYM: { gate: gate('TSYM'), reproducesTransitively: ['3F6P1C', '3F6P1D', '3F6P1E'] },
    '3F6P1E': { gate: gate('P1E'), reproducesTransitively: ['3F6P1C', '3F6P1D'] },
  };
  for (const [id, c] of Object.entries(coverage)) need(Object.entries(c.gate).filter(([k]) => k !== 'note').every(([, v]) => v === true), `${id} does not record its predecessor gate as reproduced`);
  const SYMMETRIC_CHAIN_ROOT_HASH = hex(JSON.stringify(Object.fromEntries(Object.entries(stages).map(([id, r]) => [id, r.BOUND_SEMANTIC_HASH.value]))));
  return {
    order: PREDECESSOR_CHAIN, stages, SYMMETRIC_CHAIN_ROOT_HASH,
    reproducedBy: {
      direct: ['W_SYM', 'D_SYM_FREEZE', 'D_SYM'], via: `${CR_CERTIFIER} --check (scripts/reproducibility/verify-stage3f.mjs --check --only=W_SYM,D_SYM_FREEZE,D_SYM, canonical profile)`,
      transitiveGates: coverage,
      rule: 'W_SYM byte-exact => P1_SYM reproduced => P1A_SYM reproduced => 3F6P1C, 3F6P1D, 3F6P1E and T_SYM reproduced; every stage of the chain is recomputed on each freeze --check.',
    },
  };
}

/* ---------------------------------------------------------------- erratum */
function erratumRecord(cr, plan) {
  const e = readJson(CERT.ERRATUM);
  need(e.erratumId === 'STAGE3F6-ERRATUM-001' && e.historicalArtifactModified === false, 'STAGE3F6-ERRATUM-001 missing or altered');
  const record = boundArtifact(CERT.ERRATUM, null);
  need(plan.erratumReconciliation.erratumSha256 === record.RAW_FILE_SHA256 && cr.erratumReconciliation.ERRATUM_PRESENT_AND_UNMODIFIED === true && cr.erratumReconciliation.ERRATUM_RECONCILED === true, 'erratum not reconciled by Stage 3F.6-CR');
  const historical = readJson(CERT.S3F6);
  const historicalStatus = CHECKS.find((c) => c.id === '3F6').historicalStatus;
  need(/^SUPERSEDED_NOT_REPRODUCIBLE_AT_ANY_COMMIT/.test(historicalStatus) && readJson(CERT.RP).requalification['3F6'].canonicalStatus === 'NOT_REPRODUCED_DOCUMENTED_BEFORE_REMEDIATION', 'historical Stage 3F.6 must stay documented as not reproducible');
  return {
    erratumId: e.erratumId, record, hashType: 'RAW_FILE_SHA256 (the erratum embeds no self-hash; this is the identity Stage 3F.6-CR binds as erratumSha256)',
    historicalStage3F6: { certificate: boundArtifact(CERT.S3F6, 'certificationHash'), status: historicalStatus, REPRODUCIBLE: false,
      rule: 'The historical Stage 3F.6 certificate is not reproducible at any commit and is never re-run as though it were; the erratum is part of the frozen record.' },
    reconciliation: cr.erratumReconciliation.classifications,
  };
}

/* --------------------------------------------------------- immutable facts */
const FACT_ORDER = ['RESOURCE_SHORTCUT_DEPENDENT', 'NEXUS_V1_REPRESENTATION_BLOCKED', 'NEXUS_V1_POLICY_LIMITED', 'NEXUS_V2_SHORTCUT_DEPENDENT', 'GENUINE_RELATIONAL_VALUE_MEASURED',
  'EXPERT_COMPLEMENTARITY_EXISTS', 'EXPERT_COMPLEMENTARITY_ROUTABLE', 'ROUTER_VALUE_MATERIAL', 'ROUTER_2_0_JUSTIFIED', 'RISK_SIGNAL_VALUE_MATERIAL', 'DECISION_RULE_VALUE_MATERIAL',
  'STATE_REPRESENTATION_SUFFICIENT', 'SPATIAL_STATE_REQUIRED', 'ACTION_SEMANTICS_REQUIRED', 'TRANSITION_PREDICTION_REQUIRED', 'POLICY_QUALITY_PRIMARY_BOTTLENECK', 'FALSE_SELECTION_HARM_ACCEPTABLE', 'AUTHORITY'];
export const EXPECTED_FACTS = Object.freeze({
  RESOURCE_SHORTCUT_DEPENDENT: true, NEXUS_V1_REPRESENTATION_BLOCKED: true, NEXUS_V1_POLICY_LIMITED: true, NEXUS_V2_SHORTCUT_DEPENDENT: true, GENUINE_RELATIONAL_VALUE_MEASURED: false,
  EXPERT_COMPLEMENTARITY_EXISTS: true, EXPERT_COMPLEMENTARITY_ROUTABLE: false, ROUTER_VALUE_MATERIAL: false, ROUTER_2_0_JUSTIFIED: false, RISK_SIGNAL_VALUE_MATERIAL: false,
  DECISION_RULE_VALUE_MATERIAL: false, STATE_REPRESENTATION_SUFFICIENT: false, SPATIAL_STATE_REQUIRED: true, ACTION_SEMANTICS_REQUIRED: true, TRANSITION_PREDICTION_REQUIRED: false,
  POLICY_QUALITY_PRIMARY_BOTTLENECK: true, FALSE_SELECTION_HARM_ACCEPTABLE: false, AUTHORITY: 'R0',
});
/** The claim-map claim each fact belongs to (the fact and the claim share at least one evidence binding). */
const FACT_CLAIM = Object.freeze({
  RESOURCE_SHORTCUT_DEPENDENT: 'RESOURCE_COMPETENCE', NEXUS_V1_REPRESENTATION_BLOCKED: 'NEXUS_V1_COMPETENCE', NEXUS_V1_POLICY_LIMITED: 'NEXUS_V1_COMPETENCE',
  NEXUS_V2_SHORTCUT_DEPENDENT: 'NEXUS_V2_COMPETENCE', GENUINE_RELATIONAL_VALUE_MEASURED: 'GENUINE_RELATIONAL_VALUE', EXPERT_COMPLEMENTARITY_EXISTS: 'EXPERT_COMPLEMENTARITY',
  EXPERT_COMPLEMENTARITY_ROUTABLE: 'COMPLEMENTARITY_ROUTABILITY', ROUTER_VALUE_MATERIAL: 'ROUTER_VALUE', ROUTER_2_0_JUSTIFIED: 'ROUTER_VALUE', RISK_SIGNAL_VALUE_MATERIAL: 'RISK_STATE_VALUE',
  DECISION_RULE_VALUE_MATERIAL: 'DECISION_RULE_VALUE', STATE_REPRESENTATION_SUFFICIENT: 'STATE_REPRESENTATION_SUFFICIENCY', SPATIAL_STATE_REQUIRED: 'SPATIAL_OBSERVABILITY',
  ACTION_SEMANTICS_REQUIRED: 'ACTION_SEMANTICS', TRANSITION_PREDICTION_REQUIRED: 'TRANSITION_PREDICTION_NEED', POLICY_QUALITY_PRIMARY_BOTTLENECK: 'POLICY_QUALITY_BOTTLENECK',
  FALSE_SELECTION_HARM_ACCEPTABLE: 'FALSE_SELECTION_HARM', AUTHORITY: 'AUTHORITY',
});
export const QUALIFICATIONS = Object.freeze({
  TRANSITION_PREDICTION_REQUIRED: {
    means: 'transition prediction is not the first demonstrated bottleneck; only one-step successor value has been measured.',
    doesNotMean: 'multistep predictive world models have been disproven.',
  },
  POLICY_QUALITY_PRIMARY_BOTTLENECK: {
    means: 'policy quality dominates selection/routing limitations on the certified corpus.',
    doesNotMean: 'policy quality is the primary bottleneck beyond the certified corpus (not generalized beyond that evidence).',
  },
});
function immutableFacts({ cr, plan, claimMap }) {
  const candidate = plan.immutableFactsCandidate;
  const certified = cr.immutableFactsCandidate;
  const keys = Object.keys(candidate).filter((k) => k !== 'qualification');
  need(JSON.stringify(keys) === JSON.stringify(FACT_ORDER) && JSON.stringify(Object.keys(certified)) === JSON.stringify(FACT_ORDER), 'immutable-fact set differs from the Stage 3F.6-CR candidate');
  const facts = {};
  for (const k of FACT_ORDER) {
    need(candidate[k].value === EXPECTED_FACTS[k] && certified[k].value === EXPECTED_FACTS[k] && certified[k].supported === true, `${k} does not match the confirmed claim map`);
    need(candidate[k].evidence.length > 0 && candidate[k].evidence.every(holds), `${k}: an evidence binding does not hold`);
    const claim = claimMap.claims.find((c) => c.id === FACT_CLAIM[k]);
    need(claim && candidate[k].evidence.some((b) => bindingsIn(claim.evidence).some((c) => sameBinding(b, c))), `${k} is not supported by claim ${FACT_CLAIM[k]} of the claim map`);
    facts[k] = { value: EXPECTED_FACTS[k], claim: { id: claim.id, classification: claim.classification }, evidence: candidate[k].evidence };
  }
  for (const k of Object.keys(QUALIFICATIONS)) need(typeof candidate.qualification[k] === 'string', `${k} qualification missing from Stage 3F.6-CR`);
  return {
    factSetId: 'STAGE3F_IMMUTABLE_FACTS_V1',
    source: { certificate: CR_CERTIFICATE, CONFIRMATORY_CERTIFICATE_HASH: cr.certificationHash, certificatePath: '.immutableFactsCandidate', plan: PLAN_PATH, planHash: plan.planHash, claimMapHash: claimMap.claimMapHash },
    values: Object.fromEntries(FACT_ORDER.map((k) => [k, EXPECTED_FACTS[k]])),
    facts,
    qualifications: Object.fromEntries(Object.entries(QUALIFICATIONS).map(([k, q]) => [k, { ...q, certifiedQualification: candidate.qualification[k] }])),
    scope: 'Facts about the certified Stage 3F corpus and experts (FORGE_SYMMETRIC_V2 lineage, sealed HOLDOUT/OOD) under R0. They are not claims about other corpora, games or future representations.',
  };
}

/* ---------------------------------------------- Decision Evaluation Contract */
const TOURNAMENT_RULE = 'No learned world model may win the Stage 3I tournament solely because it has the lowest reconstruction, latent, or next-state prediction loss. Ranking is by DDV on sealed HOLDOUT and OOD, then TCA, then CR; FPE and CAD are reported diagnostics and never decide a ranking on their own.';
function decisionContract({ cr, contract }) {
  const rebuilt = decisionEvaluationContract();
  need(serialise(rebuilt) === readFileSync(at(CONTRACT_PATH), 'utf8'), 'the committed contract differs from its builder');
  const atPlanCommit = git('show', `${LINEAGE.CONFIRMATORY_PLAN_COMMIT}:${rel(CONTRACT_PATH)}`);
  need(atPlanCommit.status === 0 && hex(atPlanCommit.stdout) === rawSha256(CONTRACT_PATH), 'the contract changed after it was frozen at the confirmatory plan commit');
  need(contract.status === 'SPECIFICATION_ONLY' && contract.implementsWorldModel === false, 'the contract must remain specification only');
  need(JSON.stringify(Object.keys(contract.metrics)) === JSON.stringify(['FPE', 'CAD', 'CR', 'DDV', 'TCA']), 'contract metric set changed');
  need(contract.canonicalRule === 'LOWER FACTUAL PREDICTION LOSS DOES NOT IMPLY BETTER DECISION VALUE.', 'canonical rule changed');
  need(contract.tournamentRule === TOURNAMENT_RULE, 'tournament rule changed');
  return {
    contractId: contract.contractId, record: boundArtifact(CONTRACT_PATH, 'contractHash'), frozenAtCommit: LINEAGE.CONFIRMATORY_PLAN_COMMIT, modifiedByFreeze: false,
    certifiedBinding: { certificate: CR_CERTIFICATE, contractHash: cr.decisionEvaluationContract.contractHash, fileSha256: cr.decisionEvaluationContract.fileSha256 },
    metrics: Object.fromEntries(Object.entries(contract.metrics).map(([k, m]) => [k, m.name])),
    principles: {
      DDV: 'Downstream Decision Value is the primary future model-selection criterion.',
      TCA: 'Trust-Conditioned Advantage is the primary future trust-gated decision-value criterion.',
      CR: 'Counterfactual Regret measures value lost through incorrect counterfactual ranking.',
      CAD: 'Counterfactual Action Discrimination measures whether candidate futures remain distinguishable.',
      FPE: 'Factual Prediction Error is diagnostic and does not establish useful planning competence on its own.',
      ranking: 'As frozen in the contract: DDV on sealed HOLDOUT and OOD, then TCA, then CR; FPE and CAD never decide a ranking on their own.',
    },
    canonicalRule: contract.canonicalRule,
    tournamentRule: contract.tournamentRule,
    stage3iRule: 'A Stage 3I world model may not win solely because it achieves lower reconstruction, latent, or factual prediction loss.',
    worldModelImplementedHere: false,
  };
}

/* ------------------------------------------------------ reproducibility */
function reproducibilityContract() {
  const rp = readJson(CERT.RP);
  const c = readJson(RP_CONTRACT);
  need(rp.status === 'PASS' && c.contractHash === rp.contract.contractHash, 'Stage 3F-RP contract is not the certified one');
  const conclusions = { SCIENTIFIC_RESULTS_REPRODUCE: true, BYTE_REPRODUCIBILITY_PORTABLE: true, BYTE_REPRODUCIBILITY_PORTABLE_UNDER_HOST_NATIVE_MATH: false,
    CANONICAL_NUMERICS_PROFILE_REQUIRED: true, CHECK_MODE_READ_ONLY: true, FRESH_CLONE_CERTIFIABLE: true, STAGE3F_REPRODUCIBILITY_BLOCKER_RESOLVED: true };
  for (const [k, v] of Object.entries(conclusions)) need(rp.conclusions[k] === v, `Stage 3F-RP conclusion ${k} is not ${v}`);
  const required = Object.keys(rp.requiredStages);
  const majorOf = Object.fromEntries(rp.platformMatrix.map((p) => [p.label, p.host.node.split('.')[0]]));
  const certifiedMajors = [...new Set(rp.platformMatrix.filter((p) => p.mode === 'canonical').map((p) => p.label)
    .filter((label) => required.every((id) => rp.requalification[id]?.underCanonicalProfile?.[label] === 'BYTE_EXACT' || rp.requalification[id]?.underPureCanonicalProfile?.[label] === 'BYTE_EXACT'))
    .map((label) => majorOf[label]))].sort();
  need(certifiedMajors.includes('v22') && certifiedMajors.includes('v26') && rp.checks.CANONICAL_ON_AT_LEAST_TWO_NODE_MAJORS === true, 'Node 22 and Node 26 are not both certified under the canonical profile');
  return {
    contractId: c.contractId,
    SENTINEL_CANONICAL_NUMERICS_V1_REQUIRED: true,
    CANONICAL_NUMERICS_PROFILE: c.numericsProfile.id,
    profile: { module: c.numericsProfile.module, moduleSha256: c.numericsProfile.moduleSha256, goldenVectors: c.numericsProfile.goldenVectors, goldenSha256: c.numericsProfile.goldenSha256, runtime: 'scripts/reproducibility/canonical-runtime.mjs', runtimeSha256: rawSha256('scripts/reproducibility/canonical-runtime.mjs') },
    SCIENTIFIC_REPRODUCIBILITY: true,
    BYTE_REPRODUCIBILITY: true,
    BYTE_REPRODUCIBILITY_CONDITION: 'ONLY_UNDER_SENTINEL_CANONICAL_NUMERICS_V1',
    HOST_NATIVE_MATH_BYTE_CANONICAL: false,
    NODE22_CERTIFIED: certifiedMajors.includes('v22'),
    NODE26_CERTIFIED: certifiedMajors.includes('v26'),
    certifiedNodeMajors: certifiedMajors,
    distinction: {
      SCIENTIFIC_REPRODUCIBILITY: c.levels.LEVEL_A_SCIENTIFIC_REPRODUCIBILITY,
      BYTE_REPRODUCIBILITY: c.levels.LEVEL_C_BYTE_REPRODUCIBILITY,
      rule: 'Scientific reproducibility (identical data, decisions, classifications and conclusions) holds under host-native numerics as well; byte reproducibility of certificates holds only under SENTINEL_CANONICAL_NUMERICS_V1. Host-native math never changes a scientific conclusion in the Stage 3F-RP evidence, and it never certifies.',
    },
    requiredLevel: c.requiredLevel,
    stage3frpConclusions: conclusions,
    contract: boundArtifact(RP_CONTRACT, 'contractHash'),
    certificate: boundArtifact(CERT.RP, 'certificationHash'),
    portabilityErratum: { erratumId: readJson(RP_ERRATUM).erratumId, record: boundArtifact(RP_ERRATUM, 'erratumHash') },
  };
}

/* ------------------------------------------------ check-mode invariant */
function checkModeInvariant() {
  const rp = readJson(CERT.RP);
  const historical = Object.entries(rp.checkModeAudit).filter(([, a]) => a.CHECK_MODE_WRITES_TRACKED_FILES)
    .map(([certifier, a]) => ({ certifier, certifierRawSha256: rawSha256(certifier), filesWritten: a.filesWritten, underStage3frpGuard: a.underGuard, retrofitted: false }));
  return {
    [INVARIANT_ID]: true,
    appliesTo: 'every certification or verification --check path introduced from the Stage 3F freeze onward',
    may: ['read tracked state', 'rebuild explicitly gitignored ephemeral payloads', 'recompute results', 'compare hashes'],
    mayNot: ['rewrite tracked plans', 'rewrite tracked freeze artifacts', 'rewrite tracked manifests', 'change source', 'alter tracked certification artifacts'],
    enforcement: {
      guard: { file: CHECK_MODE_GUARD, RAW_FILE_SHA256: rawSha256(CHECK_MODE_GUARD), entryPoint: 'enforceCheckModeReadOnly({ checkOnly })',
        behaviour: 'in check mode any write, append, rename, copy-over, truncation, deletion or open-for-write of a git-tracked path throws (identical rewrites included); the tracked tree must be unchanged at exit or the process exits 3' },
      futureCertifierPattern: FUTURE_CERTIFIER_PATTERN.source,
      test: 'tests/stage3f-freeze.test.js (every script matching futureCertifierPattern installs the guard; the freeze --check runs with zero tracked-write attempts)',
      runtime: 'scripts/reproducibility/run-canonical.mjs (SENTINEL_READONLY=1) additionally blocks differing writes for every Stage 3F check',
    },
    historicalExceptions: {
      source: { certificate: CERT.RP, certificationHash: rp.certificationHash, path: '.checkModeAudit' },
      rule: 'Documented, not rewritten: these frozen Stage 3F certifiers write tracked freeze/plan artifacts in --check. Under the Stage 3F-RP guard identical rewrites are skipped and differing rewrites are blocked, so no tracked file changes. Retrofitting them would change certified source hashes.',
      certifiers: historical,
    },
    source: 'Governance rule declared by the Stage 3F freeze from the Stage 3F-RP check-mode audit; not a scientific claim.',
  };
}

/* ------------------------------------------ certifier-chain exception */
function certifierChainException() {
  const scripts = readdirSync(at('scripts'));
  const measurement = scripts.filter((f) => MEASUREMENT_CERTIFIER_PATTERN.test(f) && !f.includes('stage3frp'));
  need(measurement.every((f) => CHECKS.some((c) => c.run.includes(`scripts/${f}`))), 'a measurement certifier is missing from the sealed Stage 3F chain');
  const crName = path.basename(CR_CERTIFIER);
  need(existsSync(at(CR_CERTIFIER)) && !MEASUREMENT_CERTIFIER_PATTERN.test(crName) && !CHECKS.some((c) => c.run.includes(CR_CERTIFIER)), 'the CR certifier must stay outside the chain pattern');
  const cr = readJson(CR_CERTIFICATE);
  need(cr.sourceHashes[CR_CERTIFIER] === rawSha256(CR_CERTIFIER), 'the CR certifier changed since certification');
  const rp = readJson(CERT.RP);
  need(rp.sourceHashes['scripts/reproducibility/stage3f-chain.mjs'] === rawSha256('scripts/reproducibility/stage3f-chain.mjs'), 'the sealed Stage 3F chain changed');
  const freezeScripts = ['scripts/stage3f-freeze.mjs', 'scripts/stage3f-freeze-certify.mjs'];
  for (const f of freezeScripts) need(!MEASUREMENT_CERTIFIER_PATTERN.test(path.basename(f)), `${f} would enter the measurement-certifier pattern`);
  return {
    CR_CERTIFIER, CR_CERTIFIER_RAW_SHA256: rawSha256(CR_CERTIFIER), CERTIFIER_CHAIN_EXCEPTION_DOCUMENTED: true, renamed: false,
    measurementCertifierPattern: MEASUREMENT_CERTIFIER_PATTERN.source,
    crMatchesPattern: false, crIsChainLink: false,
    reason: 'Stage 3F-RP seals the Stage 3F chain (scripts/reproducibility/stage3f-chain.mjs) and its chain-coverage test requires every certify-stage3f* measurement certifier to be a link in it. The Stage 3F.6-CR certifier executes that chain itself (a meta-certifier), so it cannot be a link and is intentionally named outside the certify-stage3f* pattern. Renaming it for naming consistency would break the certified Stage 3F-RP chain rule; the exception is frozen instead.',
    otherMetaCertifiers: {
      [RP_CERTIFIER]: 'matches the pattern by name but is excluded explicitly by the Stage 3F-RP chain-coverage test (it certifies the chain)',
      'scripts/stage3f-freeze.mjs': 'freeze builder; outside the pattern', 'scripts/stage3f-freeze-certify.mjs': 'freeze certifier; runs the chain through the CR certifier; outside the pattern',
    },
    sealedChain: { file: 'scripts/reproducibility/stage3f-chain.mjs', RAW_FILE_SHA256: rawSha256('scripts/reproducibility/stage3f-chain.mjs'), sealedBy: CERT.RP },
    measurementCertifiersInChain: measurement.length,
  };
}

/* ------------------------------------------------ epistemic provenance */
function epistemicProvenance(plan) {
  const req = plan.inheritedRequirements.requirements.find((r) => r.id === 'EPISTEMIC_PROVENANCE');
  need(req && req.status === 'REQUIRED_PRINCIPLE_LEVELS_UNDEFINED' && req.evidence.every(holds), 'epistemic provenance requirement differs from Stage 3F.6-CR');
  return {
    EPISTEMIC_PROVENANCE_REQUIRED: true,
    EPISTEMIC_LEVEL_SCHEMA: 'TO_BE_DEFINED_IN_STAGE3G',
    E0_E5_TAXONOMY_FROZEN: false,
    repositoryContractExists: false,
    basis: req.basis,
    evidence: req.evidence,
    rule: 'Every input and prediction must declare its provenance (deployable, privileged/simulator, oracle). The level scale (E0-E5 or an equivalent) is not defined in the repository and is not frozen here; Stage 3G must define it before use.',
  };
}

/* -------------------------------------------- Stage 3G entry requirements */
const REQUIRED_ENTRY = [
  ['OBSERVABLE_ENTITY_STATE_REQUIRED', 'OBSERVABLE_ENTITY_STATE'],
  ['ACTOR_RELATIVE_SPATIAL_REPRESENTATION_REQUIRED', 'ACTOR_AND_ACTION_RELATIVE_SPATIAL_REPRESENTATION'],
  ['ACTION_RELATIVE_SPATIAL_REPRESENTATION_REQUIRED', 'ACTOR_AND_ACTION_RELATIVE_SPATIAL_REPRESENTATION'],
  ['STRUCTURED_ACTION_SEMANTICS_REQUIRED', 'STRUCTURED_ACTION_SEMANTICS'],
  ['PREDICTION_LIFECYCLE_REQUIRED', 'PREDICTION_LIFECYCLE'],
  ['COUNTERFACTUAL_DISCRIMINATION_EVALUATION_REQUIRED', 'COUNTERFACTUAL_DISCRIMINATION'],
  ['COUNTERFACTUAL_REGRET_EVALUATION_REQUIRED', 'COUNTERFACTUAL_REGRET'],
  ['DOWNSTREAM_DECISION_VALUE_EVALUATION_REQUIRED', 'DOWNSTREAM_DECISION_VALUE'],
  ['STAGE_WISE_FAILURE_ATTRIBUTION_REQUIRED', 'STAGE_WISE_FAILURE_ATTRIBUTION'],
  ['EPISTEMIC_PROVENANCE_REQUIRED', 'EPISTEMIC_PROVENANCE'],
];
const PLANNED_ENTRY = [['WORLD_MODEL_TRUST_GATE', 'WORLD_MODEL_TRUST_GATE'], ['TASK_STATE_CONTAMINATION_TRACKING', 'TASK_STATE_CONTAMINATION_TRACKING']];
const NOT_REQUIRED = [['LARGE_LEARNED_WORLD_MODEL', 'LARGE_LEARNED_WORLD_MODEL'], ['JEPA_REQUIRED', 'JEPA_DEPLOYMENT'], ['GENERATIVE_WORLD_MODEL_REQUIRED', 'GENERATIVE_WORLD_MODEL'],
  ['ROUTER_2_0_REQUIRED', 'ROUTER_2_0'], ['EXPERT_10_REQUIRED', 'EXPERT_10'], ['AUTHORITY_INCREASE_REQUIRED', 'AUTHORITY_INCREASE']];
function stage3gEntryRequirements({ cr, plan }) {
  const reqs = plan.inheritedRequirements;
  need(reqs.candidateId === 'STAGE3G_INHERITED_REQUIREMENTS_CANDIDATE_V1', 'requirements candidate differs');
  const byId = Object.fromEntries(reqs.requirements.map((r) => [r.id, r]));
  const covered = new Set([...REQUIRED_ENTRY, ...PLANNED_ENTRY].map(([, s]) => s));
  need(reqs.requirements.every((r) => covered.has(r.id)) && covered.size === reqs.requirements.length, 'every Stage 3F.6-CR inherited requirement must map to exactly the frozen entry list');
  const required = Object.fromEntries(REQUIRED_ENTRY.map(([id, source]) => {
    const r = byId[source];
    need(['REQUIRED', 'REQUIRED_PRINCIPLE_LEVELS_UNDEFINED'].includes(r.status) && cr.inheritedRequirements[source] === r.status && r.evidence.every(holds), `${id}: source ${source} is not certified as required`);
    return [id, { value: true, source: source, sourceStatus: r.status, basis: r.basis, evidence: r.evidence,
      ...(source === 'ACTOR_AND_ACTION_RELATIVE_SPATIAL_REPRESENTATION' ? { canonicalization: 'the single Stage 3F.6-CR requirement is named here by its two components (actor-relative and action-relative); no requirement is added' } : {}),
      ...(source === 'EPISTEMIC_PROVENANCE' ? { EPISTEMIC_LEVEL_SCHEMA: 'TO_BE_DEFINED_IN_STAGE3G' } : {}) }];
  }));
  const planned = Object.fromEntries(PLANNED_ENTRY.map(([id, source]) => {
    const r = byId[source];
    need(r.status === 'PLANNED' && cr.inheritedRequirements[source] === 'PLANNED', `${id} is not certified as planned`);
    return [id, { value: 'PLANNED', mandatoryImplementation: false, source, basis: r.basis, evidence: r.evidence }];
  }));
  const notRequired = Object.fromEntries(NOT_REQUIRED.map(([id, source]) => {
    need(typeof reqs.notEvidenceSupported[source] === 'string' && cr.notEvidenceSupported.includes(source), `${id}: ${source} is not recorded as not evidence-supported`);
    return [id, { value: false, source, reason: reqs.notEvidenceSupported[source] }];
  }));
  return {
    requirementsId: 'STAGE3G_ENTRY_REQUIREMENTS_V1', adoptedAsStage3GEntryRequirements: true,
    source: { certificate: CR_CERTIFICATE, CONFIRMATORY_CERTIFICATE_HASH: cr.certificationHash, candidateId: reqs.candidateId, plan: PLAN_PATH, planHash: plan.planHash },
    values: { ...Object.fromEntries(Object.keys(required).map((k) => [k, true])), ...Object.fromEntries(Object.keys(planned).map((k) => [k, 'PLANNED'])), ...Object.fromEntries(Object.keys(notRequired).map((k) => [k, false])) },
    required, planned, notRequired,
    rule: 'Stage 3G inherits these requirements; it does not inherit any implementation. Planned items are not mandatory implementations; not-required items stay outside the Stage 3F inheritance.',
  };
}

/* ---------------------------------------------------------- architecture */
export const EXPERTS = Object.freeze(['Prime', 'Vanguard', 'Oracle', 'Nexus', 'Horizon', 'Archimedes', 'Alexandria', 'Picasso', 'Forge']);
export const INFRASTRUCTURE = Object.freeze(['Router/Arbiter', 'world models', 'Forge World', 'evaluation/certification', 'memory stores', 'authority system']);
function architectureRoster(plan) {
  const roadmap = 'docs/TEN_STAGE_ROADMAP.md';
  need(typeof plan.inheritedRequirements.notEvidenceSupported.EXPERT_10 === 'string', 'Expert #10 must stay outside the Stage 3F inheritance');
  return {
    rosterId: 'SENTINEL_EXPERT_ROSTER_V1', EXPERT_COUNT: EXPERTS.length, experts: [...EXPERTS], infrastructureNotExperts: [...INFRASTRUCTURE],
    rules: { EXPERT_10_ADDED: false, FORGE: 'EXPERT (unchanged classification)', FORGE_WORLD: 'INFRASTRUCTURE', ROUTER_ARBITER: 'INFRASTRUCTURE' },
    provenance: {
      kind: 'GOVERNANCE_DECLARATION_BOUND_BY_STAGE3F_FREEZE',
      note: 'No machine-readable roster artifact existed in the repository before this freeze; the canonical roster is bound here as declared, not derived from a measurement. It is consistent with the certified record: Stage 3F.6-CR keeps EXPERT_10 outside the inheritance (no Stage 3F evidence).',
      supportingRecord: { file: PLAN_PATH, path: '.inheritedRequirements.notEvidenceSupported.EXPERT_10', value: plan.inheritedRequirements.notEvidenceSupported.EXPERT_10 },
      documentedDiscrepancy: { file: roadmap, RAW_FILE_SHA256: rawSha256(roadmap), text: 'the pre-Stage-3F roadmap lists "Strategist" among expert packets; it is not in the canonical roster and is not added or reclassified by this freeze' },
    },
  };
}

/* ------------------------------------------------------------- authority */
function authorityState(cr) {
  const sources = { [CR_CERTIFICATE]: cr.authority, [CERT.RP]: readJson(CERT.RP).authority, [CERT.DSYM]: readJson(CERT.DSYM).authority, [PLAN_PATH]: readJson(PLAN_PATH).authority };
  // Stage 3F-RP names the tier field `authority` instead of `tier`; values are compared, not field names.
  const normalise = (a) => ({ tier: a.tier ?? a.authority, canDispatch: a.canDispatch, canMutateLiveWorld: a.canMutateLiveWorld, onlineLearningEnabled: a.onlineLearningEnabled, promotedToLiveRuntime: a.promotedToLiveRuntime });
  for (const [f, a] of Object.entries(sources)) need(JSON.stringify(normalise(a)) === JSON.stringify(AUTHORITY), `${f} authority is not R0`);
  return {
    AUTHORITY: 'R0', CAN_DISPATCH: false, CAN_MUTATE_LIVE_WORLD: false, ONLINE_LEARNING_ENABLED: false, PROMOTED_TO_LIVE_RUNTIME: false,
    canonicalForm: AUTHORITY,
    STAGE3F_COMPLETION_IMPLIES_PROMOTION: false, AUTHORITY_PROGRAM: 'SEPARATE',
    verifiedAgainst: Object.keys(sources),
  };
}

/* ----------------------------------------------------------------- build */
const sectionHash = (v) => hex(JSON.stringify(v));
export function buildFreeze() {
  const record = certifiedRecord();
  const { cr, plan, claimMap } = record;
  const confirmatory = boundArtifact(CR_CERTIFICATE, 'certificationHash');
  need(confirmatory.BOUND_SEMANTIC_HASH.value === cr.certificationHash, 'confirmatory certificate hash');
  const claimMapRecord = boundArtifact(CLAIM_MAP_PATH, 'claimMapHash');
  const planRecord = boundArtifact(PLAN_PATH, 'planHash');
  const sections = {
    immutableFacts: immutableFacts(record),
    decisionEvaluationContract: decisionContract(record),
    reproducibilityContract: reproducibilityContract(),
    checkModeInvariant: checkModeInvariant(),
    certifierChainException: certifierChainException(),
    epistemicProvenance: epistemicProvenance(plan),
    stage3gEntryRequirements: stage3gEntryRequirements(record),
    architectureRoster: architectureRoster(plan),
    authorityState: authorityState(cr),
    symmetricChain: symmetricChain(cr),
    erratum: erratumRecord(cr, plan),
  };
  const erratum = sections.erratum.record;
  const dec = sections.decisionEvaluationContract.record;
  const freeze = {
    schemaVersion: 1, stage: 'STAGE_3F_FORMAL_FREEZE', STAGE3F_FREEZE_VERSION, measurementStage: false, newScientificEvidence: false, stage3gStarted: false,
    purpose: 'The canonical, immutable Stage 3F inheritance boundary for Stage 3G: verify, bind, canonicalize, freeze. No scientific conclusion is created or changed.',
    lineage: { ...LINEAGE, CANONICAL_PARENT_COMMIT },
    hashTypes: {
      BOUND_SEMANTIC_HASH: 'the self-hash a certified document embeds (e.g. certificationHash, claimMapHash, contractHash): sha256 of JSON.stringify(document without that field). The canonical scientific identifier bound by the certificate chain.',
      RAW_FILE_SHA256: 'sha256 of the committed file bytes. Artifact integrity only; never a substitute for a bound semantic hash.',
      SECTION_HASH: 'sha256 of JSON.stringify(section) for a section of this freeze (IMMUTABLE_FACTS_HASH and the other *_HASH values below).',
    },
    bound: {
      CANONICAL_PARENT_COMMIT,
      CONFIRMATORY_COMMIT: LINEAGE.CONFIRMATORY_COMMIT,
      CONFIRMATORY_CERTIFICATE_HASH: { type: 'BOUND_SEMANTIC_HASH', value: confirmatory.BOUND_SEMANTIC_HASH.value, RAW_FILE_SHA256: confirmatory.RAW_FILE_SHA256, file: CR_CERTIFICATE },
      CLAIM_MAP_BOUND_SEMANTIC_HASH: claimMapRecord.BOUND_SEMANTIC_HASH.value,
      CLAIM_MAP_RAW_FILE_SHA256: claimMapRecord.RAW_FILE_SHA256,
      DECISION_EVALUATION_CONTRACT_BOUND_SEMANTIC_HASH: dec.BOUND_SEMANTIC_HASH.value,
      DECISION_EVALUATION_CONTRACT_RAW_FILE_SHA256: dec.RAW_FILE_SHA256,
      STAGE3FRP_CERTIFICATE_HASH: { type: 'BOUND_SEMANTIC_HASH', value: sections.reproducibilityContract.certificate.BOUND_SEMANTIC_HASH.value, RAW_FILE_SHA256: sections.reproducibilityContract.certificate.RAW_FILE_SHA256 },
      ERRATUM_HASH: { type: 'RAW_FILE_SHA256', value: erratum.RAW_FILE_SHA256, BOUND_SEMANTIC_HASH: null, erratumId: sections.erratum.erratumId, file: erratum.file },
      SYMMETRIC_CHAIN_ROOT_HASHES: Object.fromEntries(Object.entries(sections.symmetricChain.stages).map(([id, r]) => [id, r.BOUND_SEMANTIC_HASH.value])),
      SYMMETRIC_CHAIN_ROOT_HASH: sections.symmetricChain.SYMMETRIC_CHAIN_ROOT_HASH,
      IMMUTABLE_FACTS_HASH: sectionHash(sections.immutableFacts),
      DECISION_EVALUATION_CONTRACT_SECTION_HASH: sectionHash(sections.decisionEvaluationContract),
      STAGE3G_ENTRY_REQUIREMENTS_HASH: sectionHash(sections.stage3gEntryRequirements),
      REPRODUCIBILITY_CONTRACT_HASH: sectionHash(sections.reproducibilityContract),
      CHECK_MODE_INVARIANT_HASH: sectionHash(sections.checkModeInvariant),
      CERTIFIER_CHAIN_EXCEPTION_HASH: sectionHash(sections.certifierChainException),
      EPISTEMIC_PROVENANCE_HASH: sectionHash(sections.epistemicProvenance),
      AUTHORITY_STATE_HASH: sectionHash(sections.authorityState),
      ARCHITECTURE_ROSTER_HASH: sectionHash(sections.architectureRoster),
      ERRATUM_SECTION_HASH: sectionHash(sections.erratum),
    },
    confirmatoryRecord: { certificate: confirmatory, claimMap: claimMapRecord, plan: planRecord, planCommit: LINEAGE.CONFIRMATORY_PLAN_COMMIT },
    sections,
    onCertificationPass: { STAGE3F_STATUS: 'FROZEN', STAGE3F_COMPLETION: '100%', READY_FOR_STAGE3G: true, STAGE3G_STARTED: false,
      rule: 'These values take effect only through a PASS certificate of this freeze (scripts/stage3f-freeze-certify.mjs).' },
    authority: AUTHORITY,
  };
  freeze.freezeHash = hex(JSON.stringify(freeze));
  return freeze;
}

if (isMain) {
  const freeze = buildFreeze();
  if (checkOnly) {
    const reproduced = existsSync(at(FREEZE_PATH)) && readFileSync(at(FREEZE_PATH), 'utf8') === serialise(freeze);
    console.log(JSON.stringify({ check: 'STAGE3F_FREEZE_ARTIFACT', reproduced, freezeHash: freeze.freezeHash, bound: freeze.bound }, null, 2));
    if (!reproduced) process.exitCode = 1;
  } else {
    await mkdir(at(OUT), { recursive: true });
    await writeFile(at(FREEZE_PATH), serialise(freeze));
    console.log(JSON.stringify({ freezeHash: freeze.freezeHash, bound: freeze.bound }, null, 2));
  }
}
