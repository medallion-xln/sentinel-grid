export {
  CONTRACT_VERSION,
  KERNEL_VERSION,
  RECOMMENDATION_VERSION,
  ROOT_PUCT_ENGINE_ID,
  SNAPSHOT_CONTRACT_VERSION,
} from './core/constants.js';

export {
  SentinelGridError,
  ContractError,
  AuthorityError,
  ConformanceError,
  ReplayError,
  SnapshotIngestionError,
} from './core/errors.js';

export {
  canonicalize,
  stableStringify,
  sha256,
  normalizeSeed,
  deriveSeed,
  createSeededRandom,
  seededUnitFloat,
  randomInt,
  deepFreeze,
} from './core/determinism.js';

export {
  validateAdapterManifest,
  validateObservationPacket,
  validateActionDescriptor,
  validateLegalActions,
  validateTransitionResult,
  validateOutcomePacket,
  validateAdapter,
  validateJsonValue,
  findProhibitedExecutionMembers,
  actionKey,
  assertActionIsLegal,
} from './core/contracts.js';

export {
  AuthorityTier,
  defaultAuthorityPolicy,
  assertEvaluationOnly,
  denyExecution,
} from './core/authority.js';

export { defineAdapter } from './sdk/define-adapter.js';
export { replayRecommendation } from './sdk/replay.js';
export { recommend } from './prime/root-puct.js';
export { runAdapterConformance } from './lab/conformance.js';
export {
  DETERMINISTIC_EVIDENCE_VERSION,
  EXECUTION_DIAGNOSTICS_VERSION,
  stripExecutionDiagnostics,
  buildAdapterDeterministicEvidence,
  buildDeterministicEvidence,
  buildExecutionDiagnostics,
  createVerificationReport,
} from './lab/evidence.js';

export {
  validateConfigurationSchema,
  resolveAdapterConfiguration,
  validateJsonDocument,
  validateSchemaValue,
} from './sdk/config-schema.js';
export {
  CERTIFICATION_PROFILES,
  getCertificationProfile,
  validateProfileCompatibility,
} from './sdk/certification-profiles.js';
export {
  computeAdapterPackageIntegrity,
  inspectAdapterPackage,
  discoverAdapterPackages,
} from './sdk/package-discovery.js';
export {
  ADAPTER_LOCK_VERSION,
  createAdapterLock,
  validateAdapterLock,
  readAdapterLock,
  writeAdapterLock,
  findLockedAdapter,
  verifyDescriptorAgainstLock,
} from './sdk/lockfile.js';
export { ProductionAdapterRegistry } from './sdk/adapter-registry.js';

export {
  snapshotFormatKey,
  validateSnapshotFormatDescriptor,
  validateSnapshotEnvelope,
  findSnapshotFormat,
} from './sdk/snapshot-contract.js';
export {
  ProductionSnapshotIngestion,
  buildSnapshotCertificationReport,
} from './sdk/snapshot-ingestion.js';

export { runProductionConformanceExpansion } from './lab/production-conformance.js';

export {
  ZEKNOVA_LIVE_CAPTURE_VERSION,
  ZEKNOVA_SHADOW_RECORD_VERSION,
  ZEKNOVA_SHADOW_CERTIFICATION_VERSION,
  DEFAULT_PRODUCTION_SHADOW_THRESHOLDS,
  validateZekNovaLiveCapture,
  evaluateZekNovaLiveCapture,
  validateShadowRecord,
  summarizeShadowRecords,
  certifyZekNovaSustainedShadow,
  buildZekNovaShadowFrameworkCertification,
} from './lab/zeknova-real-state-shadow.js';

export {
  ZEKNOVA_SESSION_MANIFEST_VERSION,
  ZEKNOVA_CAMPAIGN_CERTIFICATION_VERSION,
  ZEKNOVA_CANDIDATE_EVALUATION_VERSION,
  ZEKNOVA_CONTROLLED_DECISION_VERSION,
  DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS,
  DEFAULT_CONTROLLED_CANDIDATE_THRESHOLDS,
  buildZekNovaSessionManifest,
  validateZekNovaSessionManifest,
  certifyZekNovaSustainedShadowCampaign,
  evaluateControlledCandidateRecommendation,
  validateCandidateEvaluationRecord,
  certifyControlledCandidateEvaluation,
  buildControlledNextStageDecisionPacket,
  buildStage2FFrameworkCertification,
} from './lab/zeknova-controlled-evaluation.js';
