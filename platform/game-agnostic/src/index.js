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
  reconcileStage2FEvidence,
  certifyZekNovaSustainedShadowCampaign,
  evaluateControlledCandidateRecommendation,
  validateCandidateEvaluationRecord,
  certifyControlledCandidateEvaluation,
  buildControlledNextStageDecisionPacket,
  buildStage2FFrameworkCertification,
} from './lab/zeknova-controlled-evaluation.js';

export {
  STAGE2F_CAMPAIGN_MANIFEST_VERSION,
  STAGE2F_QUALIFICATION_IDENTITY_VERSION,
  STAGE2F_RECORD_SCHEMA_VERSION,
  STAGE2F_COLLECTOR_SCHEMA_VERSION,
  STAGE2F_SESSION_MANIFEST_VERSION,
  buildStage2FCampaignManifest,
  validateStage2FCampaignManifest,
  buildStage2FQualificationIdentity,
  validateStage2FQualificationIdentity,
} from './lab/zeknova-stage2f-identity.js';

export {
  EXPERT_CONTRACT_VERSION,
  SIGNAL_SCALE,
  MAX_HISTORY_FRAMES,
  MAX_ENTITIES,
  MAX_EDGES,
  expertAuthority,
  isExactR0AuthorityBlock,
  assertNoExecutionSurface,
  normalizeExpertInput,
  computeInputDigest,
  buildExpertOutput,
  validateExpertOutput,
} from './experts/expert-contract.js';

export {
  ORACLE_EXPERT_ID,
  ORACLE_EXPERT_VERSION,
  evaluateOracle,
  oracleManifest,
} from './experts/oracle.js';

export {
  NEXUS_EXPERT_ID,
  NEXUS_EXPERT_VERSION,
  NEXUS_EDGE_KINDS,
  evaluateNexus,
  nexusManifest,
} from './experts/nexus.js';

export {
  STAGE2G_STAGE_ID,
  STAGE2G_EVIDENCE_VERSION,
  STAGE2G_CERTIFICATION_VERSION,
  STAGE2G_ORACLE_CASES,
  STAGE2G_NEXUS_CASES,
  buildStage2GEvidenceRecord,
  validateStage2GEvidenceRecord,
  runExpertDeterminismGate,
  runStage2GNegativeGates,
  certifyStage2GExperts,
  buildStage2GPortabilityDigest,
} from './lab/stage2g-expert-certification.js';

export {
  EXPERT_CONTEXT_SCHEMA_VERSION,
  ORACLE_ADJUSTMENT_BOUND_MICRO,
  NEXUS_ADJUSTMENT_BOUND_MICRO,
  TOTAL_ADJUSTMENT_BOUND_MICRO,
  CONTEXT_FEATURE_NAMES,
  deriveContextFeatures,
  computeContextAdjustmentMicro,
  buildExpertContextEnvelope,
  validateExpertContextEnvelope,
  resolveExpertContextAdjustment,
} from './experts/expert-context.js';

export {
  STAGE2H_STAGE_ID,
  STAGE2H_CERTIFICATION_VERSION,
  STAGE2H_CONTEXT_SCENARIOS,
  STAGE2H_SEARCH_FIXTURES,
  buildScenarioEnvelope,
  compareFixture,
  runBaselineModeGate,
  runStage2HNegativeGates,
  certifyStage2HPrimeContext,
  buildStage2HPortabilityDigest,
} from './lab/stage2h-prime-context-certification.js';

export {
  ACTION_CONTEXT_SCHEMA_VERSION,
  deriveEntityRelations,
  deriveOracleActionMicro,
  deriveNexusActionMicro,
  canonicalLegalActionKeys,
  buildExpertActionContext,
  validateExpertActionContext,
  resolveActionAdjustmentMicro,
  resolveExpertContext,
} from './experts/expert-action-context.js';

export {
  STAGE2H1_STAGE_ID,
  STAGE2H1_CERTIFICATION_VERSION,
  STAGE2H1_FIXTURES,
  buildActionLinks,
  buildArmContext,
  measureFixture,
  runStage2H1NegativeGates,
  certifyStage2H1ActionContext,
  buildStage2H1PortabilityDigest,
} from './lab/stage2h1-action-context-certification.js';

export {
  WORLD_STATE_SCHEMA_VERSION,
  WORLD_STATE_CONTRACT_ID,
  WORLD_STATE_SECTIONS,
  EpistemicCategory,
  EvidenceAuthority,
  WorldStateContractError,
  createWorldStateFact,
  createUnknownWorldStateFact,
  createWorldStateSnapshot,
  verifyWorldStateSnapshot,
  serializeWorldStateSnapshot,
  readWorldStateFact,
} from './stage3f/world-state-v1.js';

export {
  CAUSAL_TRACE_SCHEMA_VERSION,
  CAUSAL_TRACE_CONTRACT_ID,
  CAUSAL_TRACE_CONTRACT,
  CAUSAL_TRACE_CONTRACT_HASH,
  TraceRelationshipType,
  AttributionStatus,
  TraceLifecycleStatus,
  ActionMatchStatus,
  FailureAttributionCategory,
  CausalTraceContractError,
  createObservationEvidence,
  createFeatureDerivationEvidence,
  createPredictorEvidence,
  createRouterEvaluationEvidence,
  createRecommendationEvidence,
  createTraceEdge,
  createDecisionTimeTrace,
  verifyCausalTrace,
  serializeCausalTrace,
  attachIncumbentAction,
  attachOutcome,
  attachAttribution,
  attachInstrumentationFailure,
} from './stage3f/causal-trace-v1.js';

export {
  ENVIRONMENT_CALIBRATION_SCHEMA_VERSION,
  ENVIRONMENT_CALIBRATION_CONTRACT_ID,
  ENVIRONMENT_CALIBRATION_CONTRACT,
  ENVIRONMENT_CALIBRATION_CONTRACT_HASH,
  CalibrationDomain,
  CalibrationStatus,
  SemanticRelationType,
  ResourceDirectionality,
  RewardObjectiveRelationship,
  TransitionAssumption,
  EnvironmentCalibrationContractError,
  createEnvironmentIdentity,
  verifyEnvironmentIdentity,
  createCalibrationEvidence,
  createSemanticDefinition,
  createDomainAssessment,
  createEnvironmentCalibration,
  verifyEnvironmentCalibration,
  serializeEnvironmentCalibration,
  evaluateCalibrationSufficiency,
  isCalibrationSufficient,
  lookupCalibrationSemantics,
  createSemanticMapping,
  verifySemanticMapping,
  bindWorldStateCalibration,
  bindCausalTraceCalibration,
  verifyWorldStateCalibrationBinding,
  verifyCausalTraceCalibrationBinding,
} from './stage3f/environment-calibration-v1.js';

export {
  COUNTERFACTUAL_VETO_LEDGER_SCHEMA_VERSION,
  COUNTERFACTUAL_VETO_LEDGER_CONTRACT_ID,
  COUNTERFACTUAL_VETO_LEDGER_CONTRACT,
  COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH,
  LedgerActorType,
  ActionComparisonStatus,
  VetoDisposition,
  VetoReasonCategory,
  CounterfactualTiming,
  LedgerEvaluationStatus,
  LedgerLifecycleStatus,
  CounterfactualVetoLedgerContractError,
  createCounterfactualVetoLedger,
  verifyCounterfactualVetoLedger,
  serializeCounterfactualVetoLedger,
  attachLedgerSelectedAction,
  attachLedgerVeto,
  attachLedgerCounterfactual,
  attachLedgerActualOutcome,
  attachLedgerEvaluation,
} from './stage3f/counterfactual-veto-ledger-v1.js';

export {
  SHADOW_EXPERIENCE_SCHEMA_VERSION,
  SHADOW_EXPERIENCE_CONTRACT_ID,
  SHADOW_EXPERIENCE_CONTRACT,
  SHADOW_EXPERIENCE_CONTRACT_HASH,
  ExperienceValidationStatus,
  ExperienceEligibilityStatus,
  ExperiencePurpose,
  PredictionErrorStatus,
  OutcomeBindingStatus,
  ShadowExperienceContractError,
  createShadowExperience,
  verifyShadowExperience,
  serializeShadowExperience,
  attachExecutedAction,
  attachExperiencePrediction,
  attachExperienceActualOutcome,
  validateShadowExperience,
  evaluateExperienceEligibility,
  deriveExperiencePredictionError,
  createShadowExperienceBuffer,
  verifyShadowExperienceBuffer,
  appendExperienceToBuffer,
  freezeExperienceSnapshot,
  verifyFrozenExperienceSnapshot,
} from './stage3f/shadow-experience-buffer-v1.js';
