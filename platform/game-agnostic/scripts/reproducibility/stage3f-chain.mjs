/* The Stage 3F evidence and certification chain, as data (consumed by verify-stage3f.mjs and the Stage 3F-RP
 * certifier). Commands run from platform/game-agnostic. Order within `EVIDENCE` respects `after`. */

const shards = (script, n, extra = '') => ({
  parallel: Array.from({ length: n }, (_, k) => `node ${script} --shard=${k} --shards=${n}${extra}`),
  then: `node ${script} --merge --shards=${n}`,
});

/** Gitignored deterministic payloads. Each is verified against the committed manifest content hash. */
export const EVIDENCE = Object.freeze([
  { id: '3F6_EVALUATION_CORPUS', after: [], run: ['node scripts/generate-stage3f6-evaluation-corpus.mjs'], payloads: ['artifacts/stage3f6-prediction-reliability/evaluation-corpus.jsonl.gz'] },
  { id: '3F6C_CORPUS', after: [], run: ['node scripts/generate-stage3f6c-corpus.mjs'], payloads: ['artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'] },
  { id: '3F6A_PROPOSALS', after: ['3F6C_CORPUS'], run: ['node scripts/generate-stage3f6a-proposals.mjs'], payloads: ['artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz'] },
  { id: '3F6T_CONFIRMATORY', after: ['3F6C_CORPUS'], run: ['node scripts/generate-stage3f6t-confirmatory.mjs'], payloads: ['artifacts/stage3f6t-policy-router/confirmatory-holdout-ood.jsonl.gz'] },
  { id: '3F6W_RISK_EVIDENCE', after: ['3F6C_CORPUS'], run: ['node scripts/generate-stage3f6w-risk-evidence.mjs'], payloads: ['artifacts/stage3f6w-risk-state/risk-evidence.jsonl.gz'] },
  { id: '3F6D_CONFIRMATORY', after: ['3F6T_CONFIRMATORY'], run: ['node scripts/generate-stage3f6d-confirmatory.mjs'], payloads: ['artifacts/stage3f6d-decision-rule/confirmatory-holdout-ood.jsonl.gz'] },
  { id: '3F6P_POLICY_EVIDENCE', after: ['3F6A_PROPOSALS'], run: ['node scripts/generate-stage3f6p-policy-evidence.mjs'], payloads: ['artifacts/stage3f6p-policy-quality/policy-evidence.jsonl.gz'] },
  { id: '3F6P1_NEXUS_DEV', after: ['3F6A_PROPOSALS'], run: ['node scripts/generate-stage3f6p1-nexus-evidence.mjs --partition=DEV'], payloads: ['artifacts/stage3f6p1-nexus-remediation/nexus-evidence-dev.jsonl.gz'] },
  { id: '3F6P1_NEXUS_CAL', after: ['3F6P1_NEXUS_DEV'], run: ['node scripts/generate-stage3f6p1-nexus-evidence.mjs --partition=CAL'], payloads: ['artifacts/stage3f6p1-nexus-remediation/nexus-evidence-cal.jsonl.gz'] },
  { id: '3F6P1A_SPATIAL_DEV', after: ['3F6A_PROPOSALS'], run: ['node scripts/generate-stage3f6p1a-spatial-evidence.mjs --partition=DEV'], payloads: ['artifacts/stage3f6p1a-nexus-spatial/spatial-evidence-dev.jsonl.gz'] },
  { id: '3F6P1B_SYMMETRY', after: ['3F6C_CORPUS'], run: [shards('scripts/generate-stage3f6p1b-symmetry-evidence.mjs', 4)], payloads: ['artifacts/stage3f6p1b-directional-symmetry/symmetry-evidence-dev.jsonl.gz'] },
  { id: '3F6P1C_SYMMETRIC_DEV', after: [], run: [shards('scripts/generate-stage3f6p1c-symmetric-evidence.mjs', 4)], payloads: ['artifacts/stage3f6p1c-symmetric-benchmark/symmetric-dev-evidence.jsonl.gz'] },
  { id: '3F6P1D_SYMMETRIC_CORPUS', after: [], run: [shards('scripts/generate-stage3f6p1d-symmetric-corpus.mjs', 8)], payloads: ['artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1.jsonl.gz'] },
  { id: '3F6P1E_POLICY_OPEN', after: ['3F6P1D_SYMMETRIC_CORPUS'], run: ['node scripts/generate-stage3f6p1e-policy-evidence.mjs --partitions=DEV,CAL'], payloads: ['artifacts/stage3f6p1e-policy-requalification/policy-evidence-open.jsonl.gz'] },
  { id: '3F6P1E_POLICY_SEALED', after: ['3F6P1E_POLICY_OPEN'], run: ['node scripts/generate-stage3f6p1e-policy-evidence.mjs --partitions=HOLDOUT,OOD'], payloads: ['artifacts/stage3f6p1e-policy-requalification/policy-evidence-sealed.jsonl.gz'] },
  { id: '3F6TSYM_FRESH', after: ['3F6P1E_POLICY_SEALED'], run: ['node scripts/generate-stage3f6tsym-confirmatory.mjs --verify'], payloads: ['artifacts/stage3f6tsym-router-value/fresh-confirmatory.jsonl.gz'] },
  { id: '3F6P1ASYM_FRESH', after: ['3F6TSYM_FRESH'], run: ['node scripts/generate-stage3f6p1asym-confirmatory.mjs --verify'], payloads: ['artifacts/stage3f6p1asym-free-action/fresh-confirmatory.jsonl.gz'] },
  { id: '3F6P1SYM_FRESH', after: ['3F6P1ASYM_FRESH'], run: ['node scripts/generate-stage3f6p1sym-confirmatory.mjs --verify'], payloads: ['artifacts/stage3f6p1sym-nexus-requalification/fresh-confirmatory.jsonl.gz'] },
  { id: '3F6WSYM_FRESH', after: ['3F6P1SYM_FRESH'], run: ['node scripts/generate-stage3f6wsym-confirmatory.mjs --verify'], payloads: ['artifacts/stage3f6wsym-risk-requalification/fresh-confirmatory.jsonl.gz'] },
  { id: '3F6DSYM_FRESH', after: ['3F6WSYM_FRESH'], run: ['node scripts/generate-stage3f6dsym-confirmatory.mjs --verify'], payloads: ['artifacts/stage3f6dsym-decision-rule/fresh-confirmatory.jsonl.gz'] },
]);

/**
 * Certification checks, in lineage order. `result` is the stored certificate the check reproduces.
 * `historicalStatus` records a status that was documented before this remediation (never inferred here).
 * `recordProfile` declares where a historical certificate's arithmetic of record differs from the canonical profile.
 * Only one stage needs it: Stage 3F.6-D was certified before its host moved to V8 14, so its temperature grid used
 * fdlibm pow (Stage 3F.6-D-SYM, certified later, used the C library's pow, which correct rounding reproduces). The
 * declaration was established experimentally (root-cause records); it is used only to verify that sealed record.
 * `hostNativeFailClosed` marks a stage whose code refuses to run unless a fitted model is byte-identical to a stored
 * one: under host-native numerics it stops before producing any output, so it cannot be compared at Level A/B.
 */
export const CHECKS = Object.freeze([
  { id: '3F0', run: 'node scripts/certify-stage3f0-world-state-contract.mjs --check', result: 'artifacts/stage3f0-world-state-contract/stage3f0-certification-result.json' },
  { id: '3F1', run: 'node scripts/certify-stage3f1-causal-trace.mjs --check', result: 'artifacts/stage3f1-causal-trace/stage3f1-certification-result.json' },
  { id: '3F2', run: 'node scripts/certify-stage3f2-environment-calibration.mjs --check', result: 'artifacts/stage3f2-environment-calibration/stage3f2-certification-result.json' },
  { id: '3F3', run: 'node scripts/certify-stage3f3-counterfactual-veto-ledger.mjs --check', result: 'artifacts/stage3f3-counterfactual-veto-ledger/stage3f3-certification-result.json' },
  { id: '3F4', run: 'node scripts/certify-stage3f4-shadow-experience-buffer.mjs --check', result: 'artifacts/stage3f4-shadow-experience-buffer/stage3f4-certification-result.json' },
  { id: '3F5', run: 'node scripts/certify-stage3f5-integrated-live-shadow.mjs --check', result: 'artifacts/stage3f5-integrated-live-shadow/stage3f5-certification-result.json',
    historicalStatus: 'SUPERSEDED_BY_3F6R (artifacts/stage3f6r-runtime-parity-remediation/erratum-stage3f5-integrated-live-shadow.json)' },
  { id: '3F6', run: 'node scripts/certify-stage3f6-prediction-reliability.mjs --check', result: 'artifacts/stage3f6-prediction-reliability/stage3f6-certification-result.json',
    historicalStatus: 'SUPERSEDED_NOT_REPRODUCIBLE_AT_ANY_COMMIT (artifacts/stage3f6-errata/erratum-stage3f6-prediction-reliability.json)' },
  { id: '3F6R', run: 'node scripts/certify-stage3f6r-runtime-parity.mjs --check', result: 'artifacts/stage3f6r-runtime-parity-remediation/stage3f6r-certification-result.json' },
  { id: '3F6S', run: 'node scripts/certify-stage3f6s-deployable-feature-contract.mjs --check', result: 'artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json' },
  { id: '3F6C', run: 'node scripts/certify-stage3f6c-deployable-router.mjs --check', result: 'artifacts/stage3f6c-deployable-router/stage3f6c-certification-result.json', fittedModels: true },
  { id: '3F6A', run: 'node scripts/certify-stage3f6a-action-proposals.mjs --check', result: 'artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json' },
  { id: '3F6T', run: 'node scripts/certify-stage3f6t-policy-router.mjs --check', result: 'artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json', fittedModels: true },
  { id: '3F6W', run: 'node scripts/certify-stage3f6w-risk-state.mjs --check', result: 'artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json', fittedModels: true },
  { id: '3F6D', run: 'node scripts/certify-stage3f6d-decision-rule.mjs --check', result: 'artifacts/stage3f6d-decision-rule/stage3f6d-certification-result.json', fittedModels: true,
    recordProfile: { powModel: 'FDLIBM_FUSED', reason: 'certified under V8 <= 13 (fdlibm pow); canonical correctly rounded pow differs by 1 ULP in one temperature-grid cross-entropy' } },
  { id: '3F6P', run: 'node scripts/certify-stage3f6p-policy-quality.mjs --check', result: 'artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json', fittedModels: true },
  { id: '3F6P1', run: 'node scripts/certify-stage3f6p1-nexus-remediation.mjs --check', result: 'artifacts/stage3f6p1-nexus-remediation/stage3f6p1-certification-result.json' },
  { id: '3F6P1A', run: 'node scripts/certify-stage3f6p1a-nexus-spatial.mjs --check', result: 'artifacts/stage3f6p1a-nexus-spatial/stage3f6p1a-certification-result.json' },
  { id: '3F6P1B', run: 'node scripts/certify-stage3f6p1b-directional-symmetry.mjs --check', result: 'artifacts/stage3f6p1b-directional-symmetry/stage3f6p1b-certification-result.json' },
  { id: '3F6P1C', run: 'node scripts/certify-stage3f6p1c-symmetric-benchmark.mjs --check', result: 'artifacts/stage3f6p1c-symmetric-benchmark/stage3f6p1c-certification-result.json' },
  { id: '3F6P1D', run: 'node scripts/certify-stage3f6p1d-symmetric-corpus.mjs --check', result: 'artifacts/stage3f6p1d-symmetric-corpus/stage3f6p1d-certification-result.json' },
  { id: '3F6P1E', run: 'node scripts/certify-stage3f6p1e-policy-requalification.mjs --check', result: 'artifacts/stage3f6p1e-policy-requalification/stage3f6p1e-certification-result.json', fittedModels: true },
  { id: 'T_SYM', run: 'node scripts/certify-stage3f6tsym-router-value.mjs --check', result: 'artifacts/stage3f6tsym-router-value/stage3f6tsym-certification-result.json', fittedModels: true },
  { id: 'P1A_SYM', run: 'node scripts/certify-stage3f6p1asym-free-action.mjs --check', result: 'artifacts/stage3f6p1asym-free-action/stage3f6p1asym-certification-result.json', fittedModels: true },
  { id: 'P1_SYM', run: 'node scripts/certify-stage3f6p1sym-nexus.mjs --check', result: 'artifacts/stage3f6p1sym-nexus-requalification/stage3f6p1sym-certification-result.json', fittedModels: true },
  { id: 'W_SYM', run: 'node scripts/certify-stage3f6wsym-risk.mjs --check', result: 'artifacts/stage3f6wsym-risk-requalification/stage3f6wsym-certification-result.json', fittedModels: true },
  { id: 'D_SYM_FREEZE', run: 'node scripts/stage3f6dsym-freeze.mjs --check', result: 'artifacts/stage3f6dsym-decision-rule/stage3f6dsym-analysis-freeze.json', fittedModels: true,
    hostNativeFailClosed: 'buildFreeze() asserts the refitted DEV router is byte-identical to the stored T-SYM routerHash (scripts/stage3f6dsym-freeze.mjs:39) and throws otherwise' },
  { id: 'D_SYM', run: 'node scripts/certify-stage3f6dsym-decision-rule.mjs --check', result: 'artifacts/stage3f6dsym-decision-rule/stage3f6dsym-certification-result.json', fittedModels: true,
    hostNativeFailClosed: 'buildFreeze() asserts the refitted DEV router is byte-identical to the stored T-SYM routerHash (scripts/stage3f6dsym-freeze.mjs:39) and throws otherwise' },
]);
