#!/usr/bin/env node
/* Stage 3F.6-CR — confirmatory reconciliation plan: historical inventory, erratum reconciliation, canonical claim map,
 * Decision Evaluation Contract v1, Stage 3G inherited-requirements candidate, exit criteria and immutable-fact candidate.
 *
 *   node scripts/stage3f6cr-plan.mjs            build and write the frozen plan artifacts
 *   node scripts/stage3f6cr-plan.mjs --check    rebuild and require byte-identical artifacts (never writes)
 *
 * Reconciliation only: no measurement is re-derived here and nothing scientific is changed. Every claim is bound to an
 * exact field of a committed certificate (path, certificationHash, expected value); a binding that does not hold fails
 * the build. Determinism: the output depends only on committed files.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const top = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
export const OUT = 'artifacts/stage3f6cr-confirmatory-reconciliation';
export const PLAN_PATH = `${OUT}/stage3f6cr-reconciliation-plan.json`;
export const CLAIM_MAP_PATH = `${OUT}/stage3f6cr-claim-map.json`;
export const CONTRACT_PATH = `${OUT}/sentinel-decision-evaluation-contract-v1.json`;
export const REVERIFICATION_PATH = `${OUT}/stage3f6cr-erratum-reverification.json`;
export const AUTHORITY = Object.freeze({ tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });

/* ------------------------------------------------------------ certificates */
export const CERT = Object.freeze({
  S3F6: 'artifacts/stage3f6-prediction-reliability/stage3f6-certification-result.json',
  S3F6R: 'artifacts/stage3f6r-runtime-parity-remediation/stage3f6r-certification-result.json',
  S3F6S: 'artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json',
  S3F6C: 'artifacts/stage3f6c-deployable-router/stage3f6c-certification-result.json',
  S3F6A: 'artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json',
  S3F6T: 'artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json',
  S3F6W: 'artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json',
  S3F6D: 'artifacts/stage3f6d-decision-rule/stage3f6d-certification-result.json',
  S3F6P: 'artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json',
  P1: 'artifacts/stage3f6p1-nexus-remediation/stage3f6p1-certification-result.json',
  P1A: 'artifacts/stage3f6p1a-nexus-spatial/stage3f6p1a-certification-result.json',
  P1B: 'artifacts/stage3f6p1b-directional-symmetry/stage3f6p1b-certification-result.json',
  P1C: 'artifacts/stage3f6p1c-symmetric-benchmark/stage3f6p1c-certification-result.json',
  P1D: 'artifacts/stage3f6p1d-symmetric-corpus/stage3f6p1d-certification-result.json',
  P1E: 'artifacts/stage3f6p1e-policy-requalification/stage3f6p1e-certification-result.json',
  TSYM: 'artifacts/stage3f6tsym-router-value/stage3f6tsym-certification-result.json',
  P1ASYM: 'artifacts/stage3f6p1asym-free-action/stage3f6p1asym-certification-result.json',
  P1SYM: 'artifacts/stage3f6p1sym-nexus-requalification/stage3f6p1sym-certification-result.json',
  WSYM: 'artifacts/stage3f6wsym-risk-requalification/stage3f6wsym-certification-result.json',
  DSYM: 'artifacts/stage3f6dsym-decision-rule/stage3f6dsym-certification-result.json',
  DSYM_FREEZE: 'artifacts/stage3f6dsym-decision-rule/stage3f6dsym-analysis-freeze.json',
  RP: 'artifacts/stage3frp-reproducibility-portability/stage3frp-certification-result.json',
  ERRATUM: 'artifacts/stage3f6-errata/erratum-stage3f6-prediction-reliability.json',
});
const certHash = (key) => { const d = readJson(CERT[key]); return d.certificationHash ?? d.analysisFreezeHash ?? d.erratumHash ?? hex(readFileSync(at(CERT[key]))); };
export function lookup(object, jsonPath) {
  let v = object;
  for (const part of jsonPath.match(/\.[^.[\]]+|\[\d+\]/g) ?? []) {
    if (v === undefined || v === null) return undefined;
    v = part.startsWith('[') ? v[Number(part.slice(1, -1))] : v[part.slice(1)];
  }
  return v;
}
/** An evidence binding: this field of this certificate holds this value. */
const bind = (key, jsonPath, expect) => ({ certificate: CERT[key], certificationHash: certHash(key), path: jsonPath, expect });
export function verifyBinding(b, readFn = readJson) {
  const doc = readFn(b.certificate);
  const hash = doc.certificationHash ?? doc.analysisFreezeHash ?? doc.erratumHash ?? hex(readFileSync(at(b.certificate)));
  const actual = lookup(doc, b.path);
  return { holds: hash === b.certificationHash && JSON.stringify(actual) === JSON.stringify(b.expect), hash, actual };
}

/* ------------------------------------------------- Phase 1: historical 3F.6 */
function historicalInventory() {
  const c = readJson(CERT.S3F6);
  const git = (...a) => spawnSync('git', ['-C', top, ...a], { encoding: 'buffer', maxBuffer: 1 << 26 });
  const runtimeFiles = ['platform/game-agnostic/src/stage3f/integrated-live-shadow-v1.js', 'platform/game-agnostic/src/lab/stage3de-recovery-canonicalization.js',
    'platform/game-agnostic/scripts/canonicalize-stage3de-recovery.mjs'];
  const runtime = Object.fromEntries(runtimeFiles.map((f) => [f, hex(git('show', `2ee28987f123c8d543b03341199738c6de40c5b8^:${f}`).stdout)]));
  return {
    HISTORICAL_3F6_CERTIFICATE_HASH: c.certificationHash,
    HISTORICAL_3F6_STATUS: c.status,
    HISTORICAL_3F6_RUNTIME: {
      identity: 'Stage 3F.5 integrated live-shadow runtime before the Stage 3F.6-R remediation (the transient pre-2ee28987 state the erratum identifies)',
      stage3f5CertificationHash: c.inherited.stage3f5CertificationHash, stage3eRouterFreezeHash: c.inherited.stage3eRouterFreezeHash,
      preRemediationRuntimeFileHashes: runtime, HISTORICAL_3F6_RUNTIME_HASH: hex(JSON.stringify(runtime)),
      note: 'The certifier and test bytes that produced the certificate exist in no commit (erratum causedBy); the runtime files above are the pre-remediation bytes the erratum restores to reproduce every measurement section.',
    },
    HISTORICAL_3F6_POLICY_SET: {
      evaluated: 'The integrated runtime recommendation path only: the incumbent runtime greedy action (sole executor) and the frozen Stage 3E router (P(GREEDY_SAFE), logistic over 51 features) routing between GREEDY and the learned Nexus route. No deployable specialist policy set was evaluated; policy sets begin at Stage 3F.6-A.',
    },
    HISTORICAL_3F6_FEATURE_SET: { contract: c.contract.id, contractHash: c.contract.hash, methodologyHash: c.contract.methodologyHash,
      router: 'Stage 3E Feature Contract v2 (51 features, including horizon-rollout information — later classified non-deployable by Stage 3F.6-S)', worldState: 'World State v1' },
    HISTORICAL_3F6_CLAIMS: [
      { id: 'H01', topic: 'prediction reliability', claim: 'Contract-path router (canonical Stage 3E equation) replays Stage 3E exactly; HOLDOUT precision at tau 0.9 is 0.780 (Wilson lower 0.733, coverage 0.058; HOLDOUT quarantined), OOD 0.910.', evidence: bind('S3F6', '.exitCriteria.STAGE3E_CONTRACT_REPLAY_EXACT', true) },
      { id: 'H02', topic: 'Router / runtime', claim: 'Runtime-path router precision 0.245 on HOLDOUT, ECE 0.575; 99.5% of runtime false-safes attributed to RUNTIME_ROUTER_EQUATION_DIVERGENCE (bias read from w[0]).', evidence: bind('S3F6', '.diagnosis.runtimeFalseSafeTotal', 2990) },
      { id: 'H03', topic: 'prediction reliability', claim: 'No reliability tier is evidence-supported on any path (no CAL operating point reaches Wilson lower >= 0.80 at n >= 200).', evidence: bind('S3F6', '.roadmap.blockers[6]', 'NO_EVIDENCED_RELIABILITY_TIER_ON_HOLDOUT') },
      { id: 'H04', topic: 'prediction reliability', claim: 'Decision-time one-step consequence predictions are exact (1.000), by construction: they read the authoritative simulator (privileged).', evidence: bind('S3F6', '.exitCriteria.ONE_STEP_RELIABILITY_MEASURED', true) },
      { id: 'H05', topic: 'prediction reliability', claim: 'No non-privileged next-state, failure, transition, counterfactual or multistep predictor exists.', evidence: bind('S3F6', '.roadmap.blockers[5]', 'NO_NON_PRIVILEGED_NEXT_STATE_OR_MULTISTEP_PREDICTOR') },
      { id: 'H06', topic: 'prediction reliability', claim: 'Reference World State baseline: exact 0.80 on non-identity facts, approximate-or-better 0.992; energy errors are calibration errors.', evidence: bind('S3F6', '.layerB.sealed.worldStateBaseline.overallNonIdentity.exactAccuracy', 0.8) },
      { id: 'H07', topic: 'OOD / novelty', claim: 'Contract reliability falls with novelty while confidence rises (false-safe 0.098 familiar -> 0.203 strongly novel).', evidence: bind('S3F6', '.exitCriteria.NOVEL_STATE_RELIABILITY_MEASURED', true) },
      { id: 'H08', topic: 'Nexus', claim: 'Nexus confidence: insufficient evidence — it measures observed structure, not correctness.', evidence: bind('S3F6', '.predictionInventory[9].availability', 'INSUFFICIENT_EVIDENCE') },
      { id: 'H09', topic: 'representation', claim: 'World State v1 is an information subset of the Stage 3E features and is 92% ambiguous; the full world state determines the label.', evidence: bind('S3F6', '.diagnosis.supported.B_STATE_REPRESENTATION_LIMITED.supported', true) },
      { id: 'H10', topic: 'diagnosis', claim: 'Recorded share-rule diagnosis: primary C_PREDICTION_LIMITED, secondary A_ROUTER_LIMITED (later corrected prospectively to G_MIXED_LIMITATION_RUNTIME_PARITY_CONFOUNDED).', evidence: bind('S3F6', '.diagnosis.primary', 'C_PREDICTION_LIMITED') },
      { id: 'H11', topic: 'regret / router', claim: 'Contract false-safe total 75 versus runtime false-safe total 2990 on the measured partitions.', evidence: bind('S3F6', '.diagnosis.contractFalseSafeTotal', 75) },
      { id: 'H12', topic: 'reproducibility', claim: 'The certificate reproduces from the repository (--check).', evidence: bind('ERRATUM', '.claimsWithdrawn[0]', 'the Stage 3F.6 certificate reproduces from the repository') },
      { id: 'H13', topic: 'authority', claim: 'R0; non-dispatching; incumbent sole executor; no training.', evidence: bind('S3F6', '.authority.tier', 'R0') },
      { id: 'H14', topic: 'policy competence / RESOURCE', claim: 'NOT_CLAIMED: Stage 3F.6 evaluated no specialist policy, no RESOURCE policy and no regret of a policy set.', evidence: null },
    ],
  };
}

/* ----------------------------------------------- Phase 2: erratum reconciliation */
function erratumReconciliation(reverification) {
  const r = reverification.findings;
  return {
    erratumId: 'STAGE3F6-ERRATUM-001', erratumFile: CERT.ERRATUM, erratumSha256: hex(readFileSync(at(CERT.ERRATUM))), erratumModified: false,
    reverification: { file: REVERIFICATION_PATH, sha256: hex(readFileSync(at(REVERIFICATION_PATH))), findings: r },
    provenanceFindings: {
      PRODUCED_BY_TRANSIENT_RUNTIME_STATE: { reconfirmed: r.MEASUREMENTS_FAITHFUL_TO_PRE_REMEDIATION_RUNTIME && r.NOT_REPRODUCIBLE_AT_HEAD, evidence: 'recomputation at HEAD differs; with only the three pre-2ee28987 runtime files restored every measurement section is identical' },
      NO_COMMIT_CONTAINS_PRODUCER_CERTIFIER_COMBINATION: { reconfirmed: r.PRE_REMEDIATION_RESIDUAL_SECTIONS !== null && r.PRE_REMEDIATION_RESIDUAL_SECTIONS.length > 0 && r.PRE_REMEDIATION_RESIDUALS_WITHIN_ERRATUM_DISCLOSURE === true,
        evidence: 'with the pre-remediation runtime restored the certificate still differs, and only in the fields the erratum discloses (status, predecessor environment diagnosis and blockers, tests 104/106 and the exit criteria they drive, certifier/test source hashes). Leaf counts differ by diff tool (erratum 17, this re-verification counts each predecessor flag, diagnosis field and shifted blocker index); the categories match.' },
      AT_HEAD_DIFFERENCE_MATCHES_ERRATUM: { reconfirmed: reverification.atHead.differingFields === r.ERRATUM_RECORDED_AT_HEAD_DIFFERING_FIELDS, evidence: 'the recomputation at HEAD differs from the stored certificate in exactly the number of fields the erratum recorded' },
      MEASUREMENTS_FAITHFUL_TO_TRANSIENT_RUNTIME: { reconfirmed: r.MEASUREMENTS_FAITHFUL_TO_PRE_REMEDIATION_RUNTIME, evidence: 'every measurement section identical under the pre-remediation runtime' },
      REPRODUCIBILITY_AND_CURRENT_RUNTIME_CLAIMS_WITHDRAWN: { reconfirmed: true, evidence: bind('ERRATUM', '.claimsWithdrawn[1]', 'Stage 3F.6 runtime (Layer B) reliability figures describe the current, remediated runtime') },
      LATER_SYMMETRIC_CHAIN_NOT_CONTAMINATED: { reconfirmed: true, evidence: 'the erratum covered 3F.6-A..P.1E; for T-SYM, P.1A-SYM, P.1-SYM, W-SYM and D-SYM (certified later) no stage runs the Stage 3F.6 --check or consumes its measurements: T-SYM and W-SYM import only STAGE3F6_METHODOLOGY.catastrophicRegret from src/stage3f/prediction-reliability-v1.js (unchanged since 2ee28987), and D-SYM only checks the erratum is present' },
    },
    claims: [
      { id: 'E1', erratumText: 'withdrawn: the Stage 3F.6 certificate reproduces from the repository', classification: 'STILL_APPLIES', reason: 'Stage 3F.6 --check is NOT_REPRODUCED in every Stage 3F-RP run (documented before remediation) and in this re-verification; the withdrawal stands.', evidence: bind('RP', '.requalification.3F6.canonicalStatus', 'NOT_REPRODUCED_DOCUMENTED_BEFORE_REMEDIATION') },
      { id: 'E2', erratumText: 'withdrawn: Layer B runtime reliability figures describe the current, remediated runtime', classification: 'STILL_APPLIES', reason: 'The runtime changed in 3F.6-R; the Layer B figures describe only the pre-remediation runtime.', evidence: bind('S3F6R', '.status', 'PASS') },
      { id: 'E3', erratumText: 'valid: the Stage 3F.6 measurements as a record of the pre-remediation runtime', classification: 'STILL_APPLIES', reason: 'Independently re-verified in this stage (every measurement section identical under the restored pre-remediation runtime).', evidence: null },
      { id: 'E4', erratumText: 'valid: the runtime-binding defects Stage 3F.6 discovered', classification: 'RESOLVED', reason: 'Corrected and certified by Stage 3F.6-R (router, feature and abstention parity), which reproduces byte for byte.', evidence: bind('RP', '.requalification.3F6R.canonicalStatus', 'BYTE_EXACT') },
      { id: 'E5', erratumText: 'valid: R0 authority', classification: 'STILL_APPLIES', reason: 'R0 intact in every Stage 3F certificate.', evidence: bind('DSYM', '.authority.tier', 'R0') },
      { id: 'E6', erratumText: 'symmetric chain not contaminated', classification: 'STILL_APPLIES', reason: 'Extended here to the five SYM stages certified after the erratum (see provenanceFindings).', evidence: bind('ERRATUM', '.symmetricChainContamination.contaminated', false) },
      { id: 'E7', erratumText: 'confirmatory rerun still required: new HOLDOUT/OOD on a disjoint seed space against the remediated runtime', classification: 'SUPERSEDED',
        reason: 'The object that rerun would have re-measured — the privileged Stage 3E router inside the integrated runtime — was classified non-deployable by Stage 3F.6-S. The question was re-asked on the deployable contract with fresh, seed-disjoint, topology-excluding data by Stage 3F.6-C (seeds 401-403/411) and 3F.6-T (601-603/611), and on the independent symmetric lineage (P.1D) with sealed fresh partitions through D-SYM. No Stage 3G input depends on the privileged runtime router. Explicitly NOT re-measured: the privileged runtime router and the reference World State baseline on fresh splits (not inherited).',
        evidence: bind('S3F6C', '.dataset.spec.seedSpaceDisjointFromPriorStages', true) },
      { id: 'E8', erratumText: 'recorded diagnosis C_PREDICTION_LIMITED (corrected prospectively to G_MIXED_LIMITATION_RUNTIME_PARITY_CONFOUNDED / H_INSUFFICIENT_EVIDENCE)', classification: 'INVALIDATED_BY_NEW_EVIDENCE',
        reason: 'Router-vs-representation is no longer insufficient evidence: P.1A-SYM and P.1-SYM show the binding limitation is partial observability of task-entity positions and missing action semantics (H2), while one-step successor prediction adds only +0.013 / +0.002; prediction is not the primary limit.',
        evidence: bind('P1ASYM', '.roadmap.TRANSITION_PREDICTION_REQUIRED', false) },
    ],
  };
}

/* -------------------------------------------------------- Phase 3: claim map */
const SURVIVES = 'SURVIVES'; const PARTIAL = 'PARTIALLY_SURVIVES'; const INVALID = 'INVALIDATED'; const SUPERSEDED = 'SUPERSEDED';
const NOT_RETESTABLE = 'NOT_RETESTABLE'; const INSUFFICIENT = 'INSUFFICIENT_EVIDENCE';
function claimMap() {
  return [
    { id: 'RESOURCE_COMPETENCE', historical: 'Stage 3F.6-P: RESOURCE_PRESERVING_V1 KEEP (Forge V1 accuracy 0.612)', classification: INVALID,
      current: 'SHORTCUT_DEPENDENT: HOLDOUT 0.256 (+0.050 over uniform) is the zero-cost prior plus a fixed absolute-direction tie-break; RESOURCE is exactly the lowest-identity zero-cost action.',
      evidence: [bind('S3F6P', '.classification.RESOURCE_PRESERVING_V1', 'KEEP'), bind('P1E', '.historicalComparison.RESOURCE_PRESERVING_V1.conclusion', 'INVALIDATED'), bind('P1E', '.classification.RESOURCE_PRESERVING_V1.class', 'SHORTCUT_DEPENDENT')] },
    { id: 'RESOURCE_SHORTCUT_DEPENDENCE', historical: 'Stage 3F.6-P: RESOURCE_FORGE_SHORTCUT_DEPENDENT', classification: SURVIVES,
      current: 'Confirmed on the symmetric benchmark and on fresh sealed partitions: accuracy 0.303 vs 0.252 with identities reversed; +0.39 in the orientations that keep EAST as EAST.',
      evidence: [bind('S3F6P', '.diagnosis.secondaryResult', 'RESOURCE_FORGE_SHORTCUT_DEPENDENT+ORACLE_CEILING_LIMITED'), bind('P1ASYM', '.roadmap.CURRENT_POLICY_SHORTCUT_CONFIRMED', true)] },
    { id: 'NEXUS_V1_COMPETENCE', historical: 'Stage 3F.6-P: NEXUS_SELECTOR REDESIGN_CANDIDATE', classification: SURVIVES,
      current: 'REDESIGN_CANDIDATE: below chance overall (0.170, -0.037 vs uniform) but uniquely right when a costly action is optimal; REPRESENTATION_BLOCKED and POLICY_LOGIC_LIMITED (PROTECT in 90% of decisions, type right 17%).',
      evidence: [bind('P1E', '.historicalComparison.NEXUS_SELECTOR_V1.conclusion', 'SURVIVES'), bind('P1SYM', '.nexusClassification.NEXUS_SELECTOR_V1.holds.REPRESENTATION_BLOCKED', true), bind('P1SYM', '.nexusClassification.NEXUS_SELECTOR_V1.holds.POLICY_LOGIC_LIMITED', true)] },
    { id: 'NEXUS_V2_COMPETENCE', historical: 'Stage 3F.6-P.1: V2 candidate materially improves NEXUS standalone (D_REMEDIATION_REQUIRES_MISSING_REPRESENTATION)', classification: PARTIAL,
      current: 'The standalone gain over V1 is real with tie-breaks randomised (+0.138 HOLDOUT) but comes from choosing MOVE with a fixed-EAST direction shortcut; V2 is SHORTCUT_DEPENDENT and lowers the policy-set ceiling 0.397 -> 0.351. The representation diagnosis survives.',
      evidence: [bind('P1SYM', '.roadmap.HISTORICAL_P1_SURVIVES', 'PARTIAL'), bind('P1SYM', '.nexusClassification.NEXUS_SELECTOR_V2_CANDIDATE.holds.SHORTCUT_DEPENDENT', true), bind('P1E', '.classification.NEXUS_SELECTOR_V2_CANDIDATE.class', 'SHORTCUT_DEPENDENT')] },
    { id: 'OBJECTIVE_COMPETENCE', historical: 'Stage 3F.6-P: OBJECTIVE_TARGETING_V1 INSUFFICIENT_EVIDENCE', classification: SUPERSEDED,
      current: 'KEEP_BUT_LIMIT: 0.268 accuracy at 0.079 coverage (+0.088 vs uniform), LOW_COVERAGE and OOD_DEGRADES (0.125 on OOD); on OOD its specialist selections add more regret than they save.',
      evidence: [bind('S3F6P', '.classification.OBJECTIVE_TARGETING_V1', 'INSUFFICIENT_EVIDENCE'), bind('P1E', '.classification.OBJECTIVE_TARGETING_V1.class', 'KEEP_BUT_LIMIT')] },
    { id: 'THREAT_COMPETENCE', historical: 'Stage 3F.6-P: THREAT_COVERING_V1 INSUFFICIENT_EVIDENCE', classification: INSUFFICIENT,
      current: 'Still INSUFFICIENT_EVIDENCE (n = 158 proposing on HOLDOUT, coverage 0.026); where it proposes it is accurate (0.367) but the evidence floor is not met.',
      evidence: [bind('P1E', '.classification.THREAT_COVERING_V1.class', 'INSUFFICIENT_EVIDENCE'), bind('P1E', '.historicalComparison.THREAT_COVERING_V1.conclusion', 'SURVIVES')] },
    { id: 'EXPERT_COMPLEMENTARITY', historical: 'Stage 3F.6-A: policy set sufficient; oracle bound shows recoverable value', classification: SURVIVES,
      current: 'EXPERT_COMPLEMENTARITY_EXISTS: a perfect selector beats RESOURCE by +0.137 accuracy on fresh sealed HOLDOUT (95% CI 0.129-0.146).',
      evidence: [bind('TSYM', '.roadmap.EXPERT_COMPLEMENTARITY_EXISTS', true), bind('TSYM', '.partitions.FRESH_HOLDOUT.headroom.HEADROOM_AVAILABLE_ACCURACY', 0.137)] },
    { id: 'COMPLEMENTARITY_ROUTABILITY', historical: 'Stage 3F.6-A: ready for router retrain over the deployable set', classification: INVALID,
      current: 'EXPERT_COMPLEMENTARITY_NOT_ROUTABLE: deployable features predict when RESOURCE is structurally wrong (AUROC 0.863 / 0.921) but not when NEXUS V1 beats RESOURCE in general (0.596 / 0.532).',
      evidence: [bind('S3F6A', '.roadmap.readyForRouterRetrain', true), bind('TSYM', '.conclusion.primary', 'EXPERT_COMPLEMENTARITY_NOT_ROUTABLE'), bind('TSYM', '.roadmap.EXPERT_COMPLEMENTARITY_ROUTABLE', false)] },
    { id: 'ROUTER_VALUE', historical: 'Stage 3F.6-T: B_ROUTING_STATISTICALLY_BETTER_BUT_NOT_MATERIAL, LOW oracle-gain capture', classification: SURVIVES,
      current: 'ROUTER_VALUE_MATERIAL=false: the refitted historical router routes 77% to NEXUS V1, lowering regret (-4.6) but costing -0.058 accuracy; it captures -42% of the accuracy headroom. ROUTER_2_0_JUSTIFIED=false.',
      evidence: [bind('S3F6T', '.classification.routerValueConclusion', 'LOW'), bind('TSYM', '.roadmap.ROUTER_VALUE_MATERIAL', false), bind('TSYM', '.roadmap.ROUTER_2_0_JUSTIFIED', false)] },
    { id: 'RISK_STATE_VALUE', historical: 'Stage 3F.6-W: B_CURRENT_RISK_SIGNALS_INSUFFICIENT', classification: PARTIAL,
      current: 'RISK_SIGNAL_WEAK, SHORTCUT_CORRELATED, OOD_UNSTABLE, PROXY_OF_HIDDEN_GEOMETRY; headline B reproduces exactly and 10 of 13 retestable claims survive; the W router gain is threshold, not information. No genuine risk signal measured.',
      evidence: [bind('S3F6W', '.classification.primaryResult', 'B_CURRENT_RISK_SIGNALS_INSUFFICIENT'), bind('WSYM', '.roadmap.HISTORICAL_W_SURVIVES', 'PARTIAL'), bind('WSYM', '.classification.primary', 'RISK_SIGNAL_WEAK'), bind('WSYM', '.roadmap.RISK_SIGNAL_IMPROVES_DECISIONS', false)] },
    { id: 'DECISION_RULE_VALUE', historical: 'Stage 3F.6-D: B_COST_SENSITIVE_RULE_BETTER_BUT_NOT_MATERIAL', classification: PARTIAL,
      current: 'DECISION_RULE_VALUE_MATERIAL=false survives; the historical OOD survival and class-weighting effect are invalidated (the CAL-selected rule reverses on OOD: -0.0675 accuracy).',
      evidence: [bind('S3F6D', '.diagnosis.primaryResult', 'B_COST_SENSITIVE_RULE_BETTER_BUT_NOT_MATERIAL'), bind('DSYM', '.conclusion.DECISION_RULE_VALUE_MATERIAL', false), bind('DSYM', '.conclusion.DECISION_RULE_OOD_STABLE', false)] },
    { id: 'POLICY_SET_CEILING', historical: 'Stage 3F.6-P: a perfect router over the Forge V1 set reaches only 16.17 mean regret', classification: SUPERSEDED,
      current: 'On the symmetric lineage a perfect selector reaches 0.397 accuracy on HOLDOUT (0.400 fresh HOLDOUT) and 0.359 on OOD; the policy set is not competent (POLICY_SET_COMPETENT=false). V2 lowers the ceiling to 0.351.',
      evidence: [bind('P1E', '.complementarity.HOLDOUT.HISTORICAL_ROUTED.oracle.accuracy', 0.397), bind('TSYM', '.partitions.FRESH_HOLDOUT.strategies.PERFECT_POLICY_SELECTOR.accuracy', 0.400167), bind('DSYM', '.conclusion.POLICY_SET_COMPETENT', false)] },
    { id: 'FALSE_SELECTION_HARM', historical: 'Stage 3F.6-D: specialist false selections add material regret', classification: PARTIAL,
      current: 'FALSE_SELECTION_HARM_ACCEPTABLE=false: large harm remains (OOD NEXUS false picks add 103,767 regret against a 120,901 saving; OOD OBJECTIVE is net harmful), though some specialists are net positive.',
      evidence: [bind('DSYM', '.conclusion.FALSE_SELECTION_HARM_ACCEPTABLE', false)] },
    { id: 'OOD_STABILITY', historical: 'Stage 3F.6: contract-path OOD precision 0.910 (privileged Stage 3E features)', classification: SUPERSEDED,
      current: 'No Stage 3F routing, risk or decision-rule gain is OOD-stable: the decision rule reverses on OOD, the risk signal is OOD_UNSTABLE, the best deployable candidate scorer is OOD_UNSTABLE, the W router is worse than best single on OOD; single-policy accuracies replicate except OBJECTIVE (OOD_DEGRADES). The historical OOD precision used non-deployable features.',
      evidence: [bind('DSYM', '.conclusion.DECISION_RULE_OOD_STABLE', false), bind('WSYM', '.roadmap.RISK_SIGNAL_OOD_STABLE', false), bind('S3F6S', '.status', 'PASS')] },
    { id: 'STATE_REPRESENTATION_SUFFICIENCY', historical: 'Stage 3F.6: World State v1 92% ambiguous; router-vs-representation H_INSUFFICIENT_EVIDENCE', classification: SUPERSEDED,
      current: 'STATE_REPRESENTATION_SUFFICIENT=false, now decided: deployable state and state+candidate representations are REPRESENTATION_INSUFFICIENT; the same scorer with privileged task-entity positions reaches 0.806 / 0.915.',
      evidence: [bind('S3F6', '.diagnosis.supported.B_STATE_REPRESENTATION_LIMITED.supported', true), bind('P1ASYM', '.roadmap.DEPLOYABLE_STATE_SUFFICIENT', false), bind('P1ASYM', '.roadmap.DEPLOYABLE_CANDIDATE_REPRESENTATION_SUFFICIENT', false)] },
    { id: 'SPATIAL_OBSERVABILITY', historical: 'Stage 3F.6: relationships and spatial state carry no predictions; spatial observation changes invisible to features', classification: SURVIVES,
      current: 'SPATIAL_STATE_REQUIRED=true: 98-99% of remaining free-action errors are separated by where the objective entity or materials are; privileged geometry of where movement leads relative to task entities lifts accuracy to 0.755 / 0.902 and risk AUROC by +0.21 to +0.43.',
      evidence: [bind('P1SYM', '.roadmap.SPATIAL_STATE_REQUIRED', true), bind('P1ASYM', '.roadmap.PREDICTIVE_REPRESENTATION_REQUIRED', true)] },
    { id: 'ACTION_SEMANTICS', historical: 'not measured before the symmetric chain', classification: SURVIVES,
      current: 'ACTION_SEMANTICS_REQUIRED=true: the missing capability belongs to observation and action-semantics infrastructure (what a MOVE does relative to task entities), not to Nexus relational scope.',
      evidence: [bind('P1ASYM', '.roadmap.ACTION_SEMANTICS_REQUIRED', true), bind('P1SYM', '.roadmap.ACTION_SEMANTICS_REQUIRED', true)] },
    { id: 'TRANSITION_PREDICTION_NEED', historical: 'Stage 3F.6: recorded primary diagnosis C_PREDICTION_LIMITED', classification: INVALID,
      current: 'TRANSITION_PREDICTION_REQUIRED=false as the first bottleneck: one-step successor information adds +0.013 (free action) and +0.002 (Nexus). Only single-step successors were tested; multistep prediction was not measured.',
      evidence: [bind('S3F6', '.diagnosis.primary', 'C_PREDICTION_LIMITED'), bind('P1ASYM', '.roadmap.TRANSITION_PREDICTION_REQUIRED', false), bind('P1SYM', '.roadmap.TRANSITION_PREDICTION_REQUIRED', false)] },
    { id: 'PREDICTION_RELIABILITY', historical: 'Stage 3F.6: no evidence-supported reliability tier; runtime-path figures (precision 0.245, ECE 0.575)', classification: PARTIAL,
      current: 'No evidence-grounded reliability tier survives on the deployable contract with fresh seeds (3F.6-C: B_CORE_HAS_SIGNAL_BUT_NOT_SELECTIVE_RELIABILITY, NO_CAL_OPERATING_POINT). The runtime-path figures are superseded by the 3F.6-R remediation; one-step predictions remain simulator-exact and privileged (no non-privileged consequence predictor exists).',
      evidence: [bind('S3F6', '.roadmap.blockers[6]', 'NO_EVIDENCED_RELIABILITY_TIER_ON_HOLDOUT'), bind('S3F6C', '.resultClassification.primaryResult', 'B_CORE_HAS_SIGNAL_BUT_NOT_SELECTIVE_RELIABILITY')] },
    { id: 'NON_PRIVILEGED_PREDICTOR_GAP', historical: 'Stage 3F.6: CAPABILITY_GAP=NO_NON_PRIVILEGED_CONSEQUENCE_PREDICTOR', classification: SURVIVES,
      current: 'No non-privileged consequence predictor was built or measured in Stage 3F; the gap stands and is the object of the Decision Evaluation Contract.',
      evidence: [bind('S3F6R', '.stage3f6.currentDiagnosis.CAPABILITY_GAP', 'NO_NON_PRIVILEGED_CONSEQUENCE_PREDICTOR')] },
    { id: 'POLICY_QUALITY_BOTTLENECK', historical: 'Stage 3F.6-P: B_POLICY_QUALITY_IS_BINDING_LIMITATION', classification: SURVIVES,
      current: 'POLICY_QUALITY_PRIMARY_BOTTLENECK=true relative to selection: the policy set loses 0.600 accuracy even under perfect selection, imperfect selection only 0.137. The policies are limited by missing observable spatial state and action semantics (H2), not by policy logic, except NEXUS V1 policy logic.',
      evidence: [bind('S3F6P', '.diagnosis.primaryResult', 'B_POLICY_QUALITY_IS_BINDING_LIMITATION'), bind('TSYM', '.roadmap.POLICY_QUALITY_REMAINS_PRIMARY_BOTTLENECK', true)] },
    { id: 'GENUINE_RELATIONAL_VALUE', historical: 'Stage 3F.6-P.1 / P.1A: no entity-targeted relational action closes the gap', classification: SURVIVES,
      current: 'GENUINE_RELATIONAL_VALUE_MEASURED=false: no observable relational regime shows V1 or V2 beating both uniform and RESOURCE; where targeted entities are adds 0.000.',
      evidence: [bind('P1SYM', '.roadmap.GENUINE_RELATIONAL_VALUE_MEASURED', false)] },
    { id: 'HISTORICAL_RUNTIME_ROUTER_RELIABILITY', historical: 'Stage 3F.6 Layer B runtime-path reliability of the Stage 3F.5 integrated runtime', classification: NOT_RETESTABLE,
      current: 'The measured runtime no longer exists (remediated in 3F.6-R); its figures remain a faithful record of the pre-remediation runtime only.',
      evidence: [bind('ERRATUM', '.claimsWithdrawn[1]', 'Stage 3F.6 runtime (Layer B) reliability figures describe the current, remediated runtime')] },
    { id: 'AUTHORITY', historical: 'R0 throughout', classification: SURVIVES, current: 'R0, non-dispatching, no live-world mutation, no online learning, no runtime promotion.',
      evidence: [bind('DSYM', '.authority.tier', 'R0'), bind('TSYM', '.authority.tier', 'R0')] },
  ];
}

/* ------------------------------------------------- Phase 4: Decision Evaluation Contract v1 */
export function decisionEvaluationContract() {
  const contract = {
    schemaVersion: 1, contractId: 'SENTINEL_DECISION_EVALUATION_CONTRACT_V1', status: 'SPECIFICATION_ONLY', implementsWorldModel: false,
    purpose: 'Fix, before any world model exists, how a predictive component will be judged in Stage 3G-3I: by the decisions it improves, not by how well it reconstructs the world.',
    canonicalRule: 'LOWER FACTUAL PREDICTION LOSS DOES NOT IMPLY BETTER DECISION VALUE.',
    tournamentRule: 'No learned world model may win the Stage 3I tournament solely because it has the lowest reconstruction, latent, or next-state prediction loss. Ranking is by DDV on sealed HOLDOUT and OOD, then TCA, then CR; FPE and CAD are reported diagnostics and never decide a ranking on their own.',
    metrics: {
      FPE: { name: 'FACTUAL_PREDICTION_ERROR', question: 'How accurately did Sentinel predict what actually happened after the executed action?',
        scope: 'Executed action only, at decision points where a prediction was recorded before execution.',
        measurement: 'Per predicted field: the Stage 3F.6 quality categories (EXACT, APPROXIMATELY_CORRECT, DIRECTIONALLY_CORRECT, WRONG, INCOMPARABLE, UNKNOWN) and a normalised error; aggregated per partition with Wilson intervals. INCOMPARABLE/UNKNOWN are counted, never scored.',
        guards: ['prediction must be recorded at decision time and bound to its outcome (no post-decision information)', 'privileged (simulator-derived) predictions are reported separately and never counted as learned prediction'] },
      CAD: { name: 'COUNTERFACTUAL_ACTION_DISCRIMINATION', question: 'Can Sentinel distinguish the predicted consequences of available alternative actions?',
        scope: 'Every legal action at decision points with authoritative counterfactual evaluation (oracle used only as ground truth, never as input).',
        measurement: 'Pairwise ordering concordance of predicted action values against authoritative counterfactual values (ties as ties); top-1 hit of the authoritative optimal set; AUROC of optimal versus non-optimal actions. Reported overall and within equal-cost candidate sets (the Stage 3F free-action regime).' },
      CR: { name: 'COUNTERFACTUAL_REGRET', question: 'How much decision value was lost because Sentinel ranked alternative futures incorrectly?',
        measurement: 'Authoritative value of the best action minus that of the action the component ranks first (uniform over tied top ranks): mean, normalised, p95 and catastrophic rate (regret >= STAGE3F6_METHODOLOGY.catastrophicRegret).' },
      DDV: { name: 'DOWNSTREAM_DECISION_VALUE', question: "Did using the predictive component improve Prime's final governed recommendation?",
        measurement: 'Paired ablation on sealed partitions: Prime with versus without the component. Action accuracy, normalised regret, catastrophic rate and false-selection harm, each with a paired 95% bootstrap interval.',
        materiality: 'Inherited Stage 3F bar: accuracy gain >= 0.02 or normalised-regret reduction >= 0.02 with the paired interval beyond zero and no significant worsening of the other; must hold on OOD; nuisance (D4, identity, candidate order) dependence of the increment <= 0.02; false-selection harm within its predeclared bound.' },
      TCA: { name: 'TRUST_CONDITIONED_ADVANTAGE', question: 'How much realized decision value is gained specifically on cases admitted by a future World-Model Trust Gate?',
        measurement: 'DDV restricted to cases the (future) World-Model Trust Gate admits, reported with admission coverage, plus the coverage-weighted advantage and the harm on admitted cases. Gate thresholds are frozen on CAL before any sealed exposure.',
        dependsOn: 'WORLD_MODEL_TRUST_GATE (planned, not specified here)' },
    },
    evaluationDiscipline: ['DEV fit, CAL selection, sealed HOLDOUT/OOD confirmation, predeclared before sealed exposure', 'D4, identity-permutation and candidate-order nuisance audits on every headline number (Stage 3F shortcut lesson)',
      'deployable versus privileged versus oracle provenance declared for every input and prediction', 'accuracy and regret always reported separately', `computed under SENTINEL_CANONICAL_NUMERICS_V1 and verified read-only (Stage 3F-RP)`],
    authority: AUTHORITY,
  };
  contract.contractHash = hex(JSON.stringify(contract));
  return contract;
}

/* ------------------------------------------------- Phase 5: Stage 3G inherited requirements */
function inheritedRequirements() {
  const req = (id, status, basis, evidence = []) => ({ id, status, basis, evidence });
  return {
    candidateId: 'STAGE3G_INHERITED_REQUIREMENTS_CANDIDATE_V1', frozenHere: true, adoptedBy3G: false,
    requirements: [
      req('EPISTEMIC_PROVENANCE', 'REQUIRED_PRINCIPLE_LEVELS_UNDEFINED', 'Every Stage 3F result turned on separating deployable, privileged (simulator) and oracle information (3F.6-S contract; privileged one-step predictions; oracle labels). The E0-E5 level scale is not defined anywhere in the repository; Stage 3G must define it before use.', [bind('S3F6S', '.status', 'PASS')]),
      req('OBSERVABLE_ENTITY_STATE', 'REQUIRED', 'The free-action decision is limited by partial observability of task-entity positions (P.1A-SYM H2).', [bind('P1ASYM', '.roadmap.DEPLOYABLE_STATE_SUFFICIENT', false)]),
      req('ACTOR_AND_ACTION_RELATIVE_SPATIAL_REPRESENTATION', 'REQUIRED', 'The recoverable gain is where movement leads relative to the task entities (P.1-SYM, W-SYM privileged geometry).', [bind('P1SYM', '.roadmap.SPATIAL_STATE_REQUIRED', true)]),
      req('STRUCTURED_ACTION_SEMANTICS', 'REQUIRED', 'Missing capability is observation and action-semantics infrastructure (P.1A-SYM, P.1-SYM).', [bind('P1ASYM', '.roadmap.ACTION_SEMANTICS_REQUIRED', true)]),
      req('PREDICTION_LIFECYCLE', 'REQUIRED', 'FPE requires predictions recorded at decision time and bound to outcomes; Stage 3F.6 found most prediction classes unavailable or with placeholder confidence.', [bind('S3F6', '.roadmap.blockers[5]', 'NO_NON_PRIVILEGED_NEXT_STATE_OR_MULTISTEP_PREDICTOR')]),
      req('COUNTERFACTUAL_DISCRIMINATION', 'REQUIRED', 'Policies fail to discriminate among equal-cost candidates (87-95% of states have an optimal zero-cost action).', [bind('P1ASYM', '.roadmap.FREE_ACTION_DECISION_MEASURED', true)]),
      req('COUNTERFACTUAL_REGRET', 'REQUIRED', 'Every Stage 3F verdict is regret-based; accuracy and regret diverge (T-SYM mixed trade-off).', [bind('TSYM', '.conclusion.primary', 'EXPERT_COMPLEMENTARITY_NOT_ROUTABLE')]),
      req('DOWNSTREAM_DECISION_VALUE', 'REQUIRED', 'Component gains did not become decision value: W router gain was threshold not information; decision-rule gains reversed on OOD.', [bind('WSYM', '.roadmap.RISK_SIGNAL_IMPROVES_DECISIONS', false), bind('DSYM', '.conclusion.DECISION_RULE_OOD_STABLE', false)]),
      req('WORLD_MODEL_TRUST_GATE', 'PLANNED', 'False-selection harm is unacceptable and confidence rose with novelty in Stage 3F.6; a gate is needed before any predictive component influences recommendations. Not specified here.', [bind('DSYM', '.conclusion.FALSE_SELECTION_HARM_ACCEPTABLE', false)]),
      req('TASK_STATE_CONTAMINATION_TRACKING', 'PLANNED', 'Direction, identity-order and layout shortcuts contaminated Forge V1 results until the symmetric lineage; contamination must be tracked, not rediscovered.', [bind('P1C', '.diagnosis.primaryResult', 'A_SYMMETRIC_BENCHMARK_CANDIDATE_CERTIFIED')]),
      req('STAGE_WISE_FAILURE_ATTRIBUTION', 'REQUIRED', 'Stage 3F only became diagnosable by separating feature derivation, equation, binding (3F.6), action type versus target (P.1-SYM) and threshold versus information (W-SYM).', [bind('S3F6R', '.status', 'PASS')]),
    ],
    notEvidenceSupported: {
      LARGE_LEARNED_WORLD_MODEL: 'no Stage 3F evidence; transition prediction is not the first bottleneck',
      JEPA_DEPLOYMENT: 'no Stage 3F evidence', GENERATIVE_WORLD_MODEL: 'no Stage 3F evidence',
      ROUTER_2_0: 'ROUTER_2_0_JUSTIFIED=false in T-SYM, P.1A-SYM, P.1-SYM, W-SYM and D-SYM', EXPERT_10: 'no Stage 3F evidence', AUTHORITY_INCREASE: 'R0 is required; nothing supports an increase',
      note: 'These stay outside the Stage 3F inherited-fact set.',
    },
  };
}

/* ------------------------------------------------- Phase 6/7: exit criteria and facts */
function exitCriteria() {
  return {
    SYMMETRY_CERTIFIED: [bind('P1C', '.diagnosis.primaryResult', 'A_SYMMETRIC_BENCHMARK_CANDIDATE_CERTIFIED'), bind('P1E', '.roadmap.SYMMETRY_CERTIFIED', true)],
    CORPUS_CLEAN: [bind('P1D', '.diagnosis.primaryResult', 'A_SYMMETRIC_CORPUS_LINEAGE_CERTIFIED'), bind('P1E', '.roadmap.CORPUS_LINEAGE_CLEAN', true)],
    CORPUS_SEALED: [bind('DSYM_FREEZE', '.sealedUnopenedAtFreeze', true), bind('P1D', '.roadmap.SYMMETRIC_CORPUS_CERTIFIED', true)],
    POLICY_RESULTS_REPRODUCIBLE: [bind('P1E', '.roadmap.POLICY_RESULTS_REPRODUCIBLE', true), bind('RP', '.conclusions.BYTE_REPRODUCIBILITY_PORTABLE', true)],
    EXPERT_DIVERSITY_MEASURED: [bind('P1E', '.roadmap.EXPERT_DIVERSITY_READY', true), bind('TSYM', '.roadmap.EXPERT_COMPLEMENTARITY_EXISTS', true)],
    ROUTER_VALUE_MEASURED: [bind('TSYM', '.roadmap.ROUTER_VALUE_MEASURED', true)],
    RISK_SIGNAL_VALUE_MEASURED: [bind('WSYM', '.roadmap.W_REQUALIFIED', true)],
    DECISION_RULE_VALUE_MEASURED: [bind('DSYM', '.conclusion.DECISION_RULE_VALUE_MEASURED', true)],
    SHORTCUTS_AUDITED: [bind('P1B', '.diagnosis.primaryResult', 'F_MIXTURE'), bind('P1ASYM', '.roadmap.CURRENT_POLICY_SHORTCUT_CONFIRMED', true), bind('P1SYM', '.nexusClassification.NEXUS_SELECTOR_V2_CANDIDATE.holds.SHORTCUT_DEPENDENT', true)],
    REPRESENTATION_GAP_MEASURED: [bind('P1ASYM', '.roadmap.FREE_ACTION_DECISION_MEASURED', true), bind('P1SYM', '.roadmap.NEXUS_REPRESENTATION_BLOCKED', true)],
    STAGE3F_REPRODUCIBILITY_PORTABLE: [bind('RP', '.conclusions.STAGE3F_REPRODUCIBILITY_BLOCKER_RESOLVED', true)],
    R0_INTACT: [bind('DSYM', '.authority.tier', 'R0'), bind('WSYM', '.authority.tier', 'R0'), bind('P1SYM', '.authority.tier', 'R0'), bind('P1ASYM', '.authority.tier', 'R0'), bind('TSYM', '.authority.tier', 'R0')],
  };
}
function immutableFactsCandidate() {
  const f = (value, ...evidence) => ({ value, evidence });
  return {
    RESOURCE_SHORTCUT_DEPENDENT: f(true, bind('P1E', '.classification.RESOURCE_PRESERVING_V1.class', 'SHORTCUT_DEPENDENT'), bind('P1ASYM', '.roadmap.CURRENT_POLICY_SHORTCUT_CONFIRMED', true)),
    NEXUS_V1_REPRESENTATION_BLOCKED: f(true, bind('P1SYM', '.nexusClassification.NEXUS_SELECTOR_V1.holds.REPRESENTATION_BLOCKED', true)),
    NEXUS_V1_POLICY_LIMITED: f(true, bind('P1SYM', '.nexusClassification.NEXUS_SELECTOR_V1.holds.POLICY_LOGIC_LIMITED', true)),
    NEXUS_V2_SHORTCUT_DEPENDENT: f(true, bind('P1SYM', '.nexusClassification.NEXUS_SELECTOR_V2_CANDIDATE.holds.SHORTCUT_DEPENDENT', true), bind('P1E', '.classification.NEXUS_SELECTOR_V2_CANDIDATE.class', 'SHORTCUT_DEPENDENT')),
    GENUINE_RELATIONAL_VALUE_MEASURED: f(false, bind('P1SYM', '.roadmap.GENUINE_RELATIONAL_VALUE_MEASURED', false)),
    EXPERT_COMPLEMENTARITY_EXISTS: f(true, bind('TSYM', '.roadmap.EXPERT_COMPLEMENTARITY_EXISTS', true)),
    EXPERT_COMPLEMENTARITY_ROUTABLE: f(false, bind('TSYM', '.roadmap.EXPERT_COMPLEMENTARITY_ROUTABLE', false)),
    ROUTER_VALUE_MATERIAL: f(false, bind('TSYM', '.roadmap.ROUTER_VALUE_MATERIAL', false)),
    ROUTER_2_0_JUSTIFIED: f(false, bind('TSYM', '.roadmap.ROUTER_2_0_JUSTIFIED', false), bind('DSYM', '.conclusion.ROUTER_2_0_JUSTIFIED', false)),
    RISK_SIGNAL_VALUE_MATERIAL: f(false, bind('WSYM', '.classification.primary', 'RISK_SIGNAL_WEAK'), bind('WSYM', '.roadmap.RISK_SIGNAL_IMPROVES_DECISIONS', false)),
    DECISION_RULE_VALUE_MATERIAL: f(false, bind('DSYM', '.conclusion.DECISION_RULE_VALUE_MATERIAL', false)),
    STATE_REPRESENTATION_SUFFICIENT: f(false, bind('P1ASYM', '.roadmap.DEPLOYABLE_STATE_SUFFICIENT', false)),
    SPATIAL_STATE_REQUIRED: f(true, bind('P1SYM', '.roadmap.SPATIAL_STATE_REQUIRED', true)),
    ACTION_SEMANTICS_REQUIRED: f(true, bind('P1ASYM', '.roadmap.ACTION_SEMANTICS_REQUIRED', true), bind('P1SYM', '.roadmap.ACTION_SEMANTICS_REQUIRED', true)),
    TRANSITION_PREDICTION_REQUIRED: f(false, bind('P1ASYM', '.roadmap.TRANSITION_PREDICTION_REQUIRED', false), bind('P1SYM', '.roadmap.TRANSITION_PREDICTION_REQUIRED', false)),
    POLICY_QUALITY_PRIMARY_BOTTLENECK: f(true, bind('TSYM', '.roadmap.POLICY_QUALITY_REMAINS_PRIMARY_BOTTLENECK', true), bind('DSYM', '.conclusion.POLICY_SET_COMPETENT', false)),
    FALSE_SELECTION_HARM_ACCEPTABLE: f(false, bind('DSYM', '.conclusion.FALSE_SELECTION_HARM_ACCEPTABLE', false)),
    AUTHORITY: f('R0', bind('DSYM', '.authority.tier', 'R0')),
    qualification: { TRANSITION_PREDICTION_REQUIRED: 'as the first bottleneck; only single-step successors were measured', POLICY_QUALITY_PRIMARY_BOTTLENECK: 'relative to selection; the policies are themselves limited by representation (H2)' },
  };
}

/* ------------------------------------------------------------------- build */
export const PREDECESSOR_CHAIN = Object.freeze(['3F6P1C', '3F6P1D', '3F6P1E', 'T_SYM', 'P1A_SYM', 'P1_SYM', 'W_SYM', 'D_SYM_FREEZE', 'D_SYM']);
export function buildArtifacts() {
  if (!existsSync(at(REVERIFICATION_PATH))) throw new Error(`missing ${REVERIFICATION_PATH}: run scripts/stage3f6cr-erratum-reverification.mjs --out=${REVERIFICATION_PATH}`);
  const reverification = JSON.parse(readFileSync(at(REVERIFICATION_PATH), 'utf8'));
  const contract = decisionEvaluationContract();
  const claims = claimMap();
  const erratum = erratumReconciliation(reverification);
  const claimMapDoc = { schemaVersion: 1, claimMapId: 'STAGE3F_CANONICAL_CLAIM_MAP_V1', classifications: [SURVIVES, PARTIAL, INVALID, SUPERSEDED, NOT_RETESTABLE, INSUFFICIENT], claims };
  claimMapDoc.claimMapHash = hex(JSON.stringify(claimMapDoc));
  const plan = {
    schemaVersion: 1, stage: 'STAGE_3F_6_CR_CONFIRMATORY_RECONCILIATION', measurementStage: false, authority: AUTHORITY,
    question: 'What do we now know with high confidence, and what exactly should Stage 3G inherit?',
    predecessorChain: PREDECESSOR_CHAIN, historical3F6: historicalInventory(), erratumReconciliation: erratum,
    claimMap: { file: CLAIM_MAP_PATH, claimMapHash: claimMapDoc.claimMapHash },
    decisionEvaluationContract: { file: CONTRACT_PATH, contractId: contract.contractId, contractHash: contract.contractHash },
    inheritedRequirements: inheritedRequirements(), exitCriteria: exitCriteria(), immutableFactsCandidate: immutableFactsCandidate(),
    rules: { freezeReadiness: 'READY_FOR_3F_FREEZE requires every exit criterion, every evidence binding, the full predecessor chain reproducing byte for byte, and the erratum reconciled. Weak policies and negative Router results do not block measurement-integrity completion.',
      stage3g: 'READY_FOR_STAGE3G stays false until the separate formal Stage 3F freeze commit exists.' },
  };
  plan.planHash = hex(JSON.stringify(plan));
  return { plan, claimMapDoc, contract };
}
/** Every binding in a plan (claims, erratum, requirements, criteria, facts). */
export function allBindings(plan, claimMapDoc) {
  const out = [];
  const visit = (v, where) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'certificate' in v && 'path' in v && 'expect' in v) { out.push({ where, binding: v }); return; }
    if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, `${where}.${k}`);
  };
  visit(plan, 'plan'); visit(claimMapDoc, 'claimMap');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { plan, claimMapDoc, contract } = buildArtifacts();
  const failures = allBindings(plan, claimMapDoc).filter(({ binding }) => !verifyBinding(binding).holds).map(({ where, binding }) => ({ where, ...binding, actual: verifyBinding(binding).actual }));
  if (failures.length) { console.error(JSON.stringify({ bindingFailures: failures }, null, 2)); process.exit(1); }
  const files = { [PLAN_PATH]: plan, [CLAIM_MAP_PATH]: claimMapDoc, [CONTRACT_PATH]: contract };
  const serialise = (v) => `${JSON.stringify(v, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const reproduced = Object.entries(files).every(([f, v]) => existsSync(at(f)) && readFileSync(at(f), 'utf8') === serialise(v));
    console.log(JSON.stringify({ check: 'STAGE3F6CR_PLAN', reproduced, planHash: plan.planHash, claimMapHash: claimMapDoc.claimMapHash, contractHash: contract.contractHash }));
    if (!reproduced) process.exitCode = 1;
  } else {
    await mkdir(at(OUT), { recursive: true });
    for (const [f, v] of Object.entries(files)) await writeFile(at(f), serialise(v));
    console.log(JSON.stringify({ planHash: plan.planHash, claimMapHash: claimMapDoc.claimMapHash, contractHash: contract.contractHash, bindings: allBindings(plan, claimMapDoc).length }));
  }
}
