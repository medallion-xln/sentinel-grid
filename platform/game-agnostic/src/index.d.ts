export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface AdapterManifest {
  contractVersion: 1;
  gameId: string;
  adapterId: string;
  adapterVersion: string;
  deterministic: true;
  observationSchemas: Array<{ schemaId: string; schemaVersion: number; variableSize: boolean }>;
  capabilities: {
    imperfectInformation: boolean;
    stochasticTransitions: boolean;
    simultaneousActions: boolean;
    variableObservationSize: boolean;
  };
  authority: { tier: 'R0'; executionInterface: false };
  metadata?: Record<string, JsonValue>;
}

export interface ObservationPacket {
  contractVersion: 1;
  gameId: string;
  schemaId: string;
  schemaVersion: number;
  observerId: string;
  sequence: number;
  features: number[];
  featureShape?: number[];
  metadata: Record<string, JsonValue>;
}

export interface ActionDescriptor {
  actionId: string;
  actorId: string | null;
  target: JsonValue;
  parameters: Record<string, JsonValue>;
  metadata?: Record<string, JsonValue>;
}

export interface TransitionContext {
  observerId: string;
  seed: bigint;
  simulationIndex: number;
  random: () => number;
  mode: 'detached-simulation';
}

export interface TransitionResult<State> {
  state: State;
  reward: number;
  terminal: boolean;
  events: JsonValue[];
  info: Record<string, JsonValue>;
}

export interface OutcomePacket {
  scalar: number;
  terminal: boolean;
  vector: Record<string, number>;
  metadata: Record<string, JsonValue>;
}

export interface SnapshotImportContext {
  mode: 'detached-snapshot-ingestion';
  formatId: string;
  formatVersion: number;
  snapshotId: string;
  configuration: Readonly<Record<string, JsonValue>>;
}

export interface GameAdapter<State = unknown> {
  manifest(): AdapterManifest;
  initialState(seed: bigint | number | string): State;
  cloneState(state: State): State;
  observe(state: State, observerId: string): ObservationPacket;
  legalActions(state: State, observerId: string): ActionDescriptor[];
  step(state: State, action: ActionDescriptor, context: TransitionContext): TransitionResult<State>;
  isTerminal(state: State): boolean;
  outcome(state: State, observerId: string): OutcomePacket;
  importSnapshot?(payload: JsonValue, context: SnapshotImportContext): State;
}

export function defineAdapter<State>(adapter: GameAdapter<State>): Readonly<GameAdapter<State>>;
export function recommend<State>(args: {
  adapter: GameAdapter<State>;
  state: State;
  observerId: string;
  simulations?: number;
  seed?: bigint | number | string;
  cPuct?: number;
}): Readonly<Record<string, unknown>>;
export function runAdapterConformance<State>(adapter: GameAdapter<State>, options?: {
  seed?: bigint | number | string;
  observerId?: string;
  simulations?: number;
  cPuct?: number;
}): Record<string, unknown>;
export function replayRecommendation<State>(args: {
  adapter: GameAdapter<State>;
  state: State;
  recommendation: Record<string, any>;
}): Record<string, unknown>;
export function sha256(value: unknown): string;
export function stableStringify(value: unknown): string;
export function createSeededRandom(seed: bigint | number | string): () => number;

export interface DeterministicCheckEvidence {
  name: string;
  pass: boolean;
  [key: string]: unknown;
}

export interface AdapterDeterministicEvidence {
  evidenceVersion: 6;
  adapter: AdapterManifest | null;
  certification: Record<string, unknown> | null;
  pass: boolean;
  checks: DeterministicCheckEvidence[];
  deterministicEvidenceHash: string;
}

export interface DeterministicEvidence {
  evidenceVersion: 6;
  contractVersion: 1;
  kernelVersion: string;
  kernelScope: string;
  authority: 'R0';
  pass: boolean;
  evidenceReportCount: number;
  checkCount: number;
  failedCheckCount: number;
  reports: AdapterDeterministicEvidence[];
  deterministicEvidenceHash: string;
}

export interface ExecutionDiagnostics {
  diagnosticsVersion: 1;
  deterministicEvidenceHash: string;
  generatedAt: string;
  runtime: Record<string, unknown>;
  adapterReports: Array<Record<string, unknown>>;
  executionReportHash: string;
}

export interface VerificationReport {
  pass: boolean;
  evidenceReportCount: number;
  /** @deprecated Use evidenceReportCount. */
  adapterCount: number;
  checkCount: number;
  failedCheckCount: number;
  deterministicEvidenceHash: string;
  executionReportHash: string;
  deterministicEvidence: DeterministicEvidence;
  executionDiagnostics: ExecutionDiagnostics;
}

export const DETERMINISTIC_EVIDENCE_VERSION: 6;
export const EXECUTION_DIAGNOSTICS_VERSION: 1;
export function stripExecutionDiagnostics<T>(value: T): T;
export function buildAdapterDeterministicEvidence(report: Record<string, any>): AdapterDeterministicEvidence;
export function buildDeterministicEvidence(
  reports: Array<Record<string, any>>,
  options?: { kernelVersion?: string; kernelScope?: string; authority?: 'R0' },
): DeterministicEvidence;
export function buildExecutionDiagnostics(
  reports: Array<Record<string, any>>,
  options: { deterministicEvidenceHash: string; runtime?: Record<string, unknown>; generatedAt?: string },
): ExecutionDiagnostics;
export function createVerificationReport(
  reports: Array<Record<string, any>>,
  options?: {
    kernelVersion?: string;
    kernelScope?: string;
    authority?: 'R0';
    runtime?: Record<string, unknown>;
    generatedAt?: string;
  },
): VerificationReport;

export interface AdapterPackageDescriptor {
  packageRoot: string;
  packageName: string;
  packageVersion: string;
  packageSha256: string;
  packageFiles: Array<{ path: string; sha256: string }>;
  gameId: string;
  adapterId: string;
  adapterVersion: string;
  entry: string;
  entryAbsolute: string;
  entrySha256: string;
  factoryExport: string;
  configSchema: string;
  configSchemaAbsolute: string;
  configSchemaSha256: string;
  configurationSchema: Record<string, unknown>;
  certificationProfile: string;
  snapshotFormats: Array<{
    formatId: string;
    formatVersion: number;
    schema: string;
    schemaAbsolute: string;
    schemaSha256: string;
    schemaDocument: Record<string, unknown>;
    importerMethod: string;
  }>;
}

export interface AdapterLockEntry {
  packageName: string;
  packageVersion: string;
  packageSha256: string;
  entry: string;
  entrySha256: string;
  configSchema: string;
  configSchemaSha256: string;
  gameId: string;
  adapterId: string;
  adapterVersion: string;
  factoryExport: string;
  certificationProfile: string;
  snapshotFormats: Array<{
    formatId: string;
    formatVersion: number;
    schema: string;
    schemaSha256: string;
    importerMethod: string;
  }>;
  snapshotFormatsHash: string;
  configuration: Record<string, JsonValue>;
  configurationHash: string;
}

export interface AdapterLock {
  lockVersion: 2;
  contractVersion: 1;
  kernelVersion: string;
  packages: AdapterLockEntry[];
  lockHash: string;
}

export interface AdapterRegistration<State = unknown> {
  identity: string;
  adapter: GameAdapter<State>;
  manifest: AdapterManifest;
  configuration: Readonly<Record<string, JsonValue>>;
  configurationHash: string;
  packageName: string;
  packageVersion: string;
  packageSha256: string;
  entrySha256: string;
  configSchemaSha256: string;
  certificationProfile: string;
  snapshotFormats: Readonly<Array<{
    formatId: string;
    formatVersion: number;
    schema: string;
    schemaSha256: string;
    schemaDocument: Record<string, unknown>;
    importerMethod: string;
  }>>;
  snapshotFormatsHash: string;
  lockHash: string;
}

export const ADAPTER_LOCK_VERSION: 2;
export const CERTIFICATION_PROFILES: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
export function validateConfigurationSchema(schema: Record<string, unknown>): Record<string, unknown>;
export function validateSchemaValue(
  value: JsonValue,
  schema: Record<string, unknown>,
  path?: string,
  options?: { applyDefaults?: boolean },
): JsonValue;
export function validateJsonDocument(
  schema: Record<string, unknown>,
  document: JsonValue,
  path?: string,
): JsonValue;
export function resolveAdapterConfiguration(
  schema: Record<string, unknown>,
  configuration?: Record<string, JsonValue>,
): Readonly<Record<string, JsonValue>>;
export function getCertificationProfile(name: string): Readonly<Record<string, unknown>>;
export function validateProfileCompatibility(manifest: AdapterManifest, profileName: string): Readonly<Record<string, unknown>>;
export function computeAdapterPackageIntegrity(packageRoot: string): Promise<Readonly<{
  entries: Array<{ path: string; sha256: string }>;
  packageSha256: string;
}>>;
export function inspectAdapterPackage(packageRoot: string): Promise<Readonly<AdapterPackageDescriptor>>;
export function discoverAdapterPackages(args: { roots: string[] }): Promise<Readonly<AdapterPackageDescriptor[]>>;
export function createAdapterLock(
  descriptors: AdapterPackageDescriptor[],
  configurations?: Record<string, Record<string, JsonValue>>,
): Readonly<AdapterLock>;
export function validateAdapterLock(lock: AdapterLock): AdapterLock;
export function readAdapterLock(file: string): Promise<AdapterLock>;
export function writeAdapterLock(file: string, lock: AdapterLock): Promise<AdapterLock>;
export function findLockedAdapter(lock: AdapterLock, descriptor: AdapterPackageDescriptor): AdapterLockEntry;
export function verifyDescriptorAgainstLock(descriptor: AdapterPackageDescriptor, lock: AdapterLock): AdapterLockEntry;

export class ProductionAdapterRegistry {
  constructor(args: { lock: AdapterLock });
  readonly lockHash: string;
  discover(args: { roots: string[] }): Promise<Readonly<AdapterPackageDescriptor[]>>;
  registerPackage<State = unknown>(descriptor: AdapterPackageDescriptor): Promise<Readonly<AdapterRegistration<State>>>;
  get<State = unknown>(identity: string): Readonly<AdapterRegistration<State>>;
  list(): Readonly<Array<{
    identity: string;
    gameId: string;
    adapterId: string;
    adapterVersion: string;
    packageName: string;
    packageVersion: string;
    certificationProfile: string;
    configurationHash: string;
    snapshotFormatCount: number;
    snapshotFormatsHash: string;
  }>>;
  certify(identity: string, options?: {
    seed?: bigint | number | string;
    observerId?: string;
    simulations?: number;
    cPuct?: number;
  }): Record<string, unknown>;
}

export const SNAPSHOT_CONTRACT_VERSION: 1;

export interface SnapshotEnvelope {
  snapshotContractVersion: 1;
  gameId: string;
  adapterId: string;
  adapterVersion: string;
  snapshotId: string;
  formatId: string;
  formatVersion: number;
  observers: string[];
  payload: JsonValue;
  metadata: Record<string, JsonValue>;
}

export interface SnapshotRecord {
  snapshotContractVersion: 1;
  handle: string;
  identity: string;
  snapshotId: string;
  gameId: string;
  adapterId: string;
  adapterVersion: string;
  adapterManifest: AdapterManifest;
  formatId: string;
  formatVersion: number;
  envelopeHash: string;
  payloadHash: string;
  importedStateHash: string;
  terminal: boolean;
  observers: Array<{
    observerId: string;
    observationHash: string;
    featureCount: number;
    legalActionsHash: string;
    legalActionCount: number;
    outcomeHash: string;
  }>;
  source: {
    sourceType: string;
    sourceByteLength: number | null;
    sourceBytesSha256: string | null;
  };
  provenance: Record<string, string>;
  authority: { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false };
}

export function validateSnapshotEnvelope(envelope: SnapshotEnvelope): Readonly<SnapshotEnvelope>;
export function snapshotFormatKey(format: { formatId: string; formatVersion: number }): string;
export function validateSnapshotFormatDescriptor(format: Record<string, unknown>, path?: string): Record<string, unknown>;
export function findSnapshotFormat(registration: AdapterRegistration, envelope: SnapshotEnvelope): Record<string, unknown>;

export class ProductionSnapshotIngestion {
  constructor(args: {
    registry: ProductionAdapterRegistry;
    allowedRoots?: string[];
    maxBytes?: number;
    maxRecords?: number;
    maxObserversPerSnapshot?: number;
    maxFeatureCountPerObserver?: number;
    maxLegalActionsPerObserver?: number;
  });
  readonly maxBytes: number;
  readonly limits: Readonly<{
    maxRecords: number;
    maxObserversPerSnapshot: number;
    maxFeatureCountPerObserver: number;
    maxLegalActionsPerObserver: number;
  }>;
  usage(): Readonly<{ records: number; states: number; limits: Record<string, number> }>;
  ingestFile(args: { identity: string; file: string }): Promise<Readonly<SnapshotRecord>>;
  ingestEnvelope(args: {
    identity: string;
    envelope: SnapshotEnvelope;
    source?: { sourceType?: string; sourceByteLength?: number; sourceBytesSha256?: string };
  }): Readonly<SnapshotRecord>;
  ingestBatch(entries: Array<{ identity: string; file?: string; envelope?: SnapshotEnvelope; source?: Record<string, unknown> }>, options?: { continueOnError?: boolean }): Promise<Readonly<{
    pass: boolean; successes: Array<Record<string, unknown>>; failures: Array<Record<string, unknown>>; usage: Record<string, unknown>;
  }>>;
  recommend(args: {
    handle: string;
    observerId: string;
    simulations?: number;
    seed?: bigint | number | string;
    cPuct?: number;
  }): Readonly<{
    snapshot: SnapshotRecord;
    recommendation: Record<string, unknown>;
    recommendationHash: string;
  }>;
  get(handle: string): Readonly<SnapshotRecord>;
  list(): Readonly<SnapshotRecord[]>;
  release(handle: string): boolean;
  releaseAll(): number;
}

export function runProductionConformanceExpansion(args: Record<string, unknown>): Promise<Record<string, unknown>>;

export function buildSnapshotCertificationReport(
  record: SnapshotRecord,
  recommendation?: Record<string, any>,
): Record<string, unknown>;


export const ZEKNOVA_LIVE_CAPTURE_VERSION: 1;
export const ZEKNOVA_SHADOW_RECORD_VERSION: 2;
export const ZEKNOVA_SHADOW_CERTIFICATION_VERSION: 1;
export const DEFAULT_PRODUCTION_SHADOW_THRESHOLDS: Readonly<Record<string, number>>;
export interface ZekNovaLiveCaptureContext { sessionId: string; sequence: number; factionId: string; biomeId: string; missionId: string; missionPhase: string; tensionBand: string; infrastructureBand: string; tick: number; }
export interface ZekNovaLiveCapture { captureVersion: 1; captureId: string; capturedAt?: string; source?: Record<string, JsonValue>; context: ZekNovaLiveCaptureContext; envelope: SnapshotEnvelope; legacyEvidence: Record<string, any>; }
export interface Stage2FQualificationIdentity { identityEnvelopeVersion: 1; sentinelRuntimeId: string; generatedRuntimeProvenanceId: string; stage2fCampaignId: string; sessionId: string; samplingIdentity: string; recordSchemaVersion: 2; collectorSchemaVersion: 2; authorityTier: 'R0'; evidenceMode: 'QUALIFICATION' | 'DRY_RUN'; qualificationEligible: boolean; [key: string]: unknown; }
export interface ZekNovaShadowRecord { shadowRecordVersion: 1 | 2; captureId: string; qualificationIdentity?: Stage2FQualificationIdentity; context: ZekNovaLiveCaptureContext; sourceStateHash: string; observerId: string; simulations: number; selectedActionKey: string; legacySelectedActionKey: string; agreement: Record<string, boolean>; pass: boolean; authority: { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false }; recordHash: string; [key: string]: unknown; }
export function validateZekNovaLiveCapture(capture: ZekNovaLiveCapture): ZekNovaLiveCapture;
export function evaluateZekNovaLiveCapture(args: { adapter: GameAdapter<any>; manifest: AdapterManifest; configuration: Readonly<Record<string, JsonValue>>; capture: ZekNovaLiveCapture; }): { pass: boolean; record: ZekNovaShadowRecord; diagnostics: Record<string, unknown> };
export function validateShadowRecord(record: ZekNovaShadowRecord): ZekNovaShadowRecord;
export function summarizeShadowRecords(records: ZekNovaShadowRecord[]): Readonly<Record<string, unknown>>;
export function certifyZekNovaSustainedShadow(args: { manifest: AdapterManifest; records: ZekNovaShadowRecord[]; thresholds?: Readonly<Record<string, number>>; profileName?: string; }): Readonly<Record<string, any>>;
export function buildZekNovaShadowFrameworkCertification(args: { manifest: AdapterManifest; evaluations: Array<{ pass: boolean; record: ZekNovaShadowRecord }>; }): Readonly<Record<string, any>>;


export const ZEKNOVA_SESSION_MANIFEST_VERSION: 2;
export const ZEKNOVA_CAMPAIGN_CERTIFICATION_VERSION: 2;
export const ZEKNOVA_CANDIDATE_EVALUATION_VERSION: 1;
export const ZEKNOVA_CONTROLLED_DECISION_VERSION: 1;
export const DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS: Readonly<Record<string, number>>;
export const DEFAULT_CONTROLLED_CANDIDATE_THRESHOLDS: Readonly<Record<string, number>>;
export interface ZekNovaSessionManifest { manifestVersion: 1 | 2; sessionId: string; stage2fCampaignId?: string; sentinelRuntimeId?: string; generatedRuntimeProvenanceId?: string; environmentId: string; repositoryHead: string; runtimeBuildHash: string; collectorId: string; startedAt: string; endedAt: string; recordCount: number; entriesHash: string; authority: { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false }; manifestHash: string; [key: string]: unknown; }
export interface ZekNovaCandidateEvaluationRecord { candidateEvaluationVersion: 1; candidateId: string; engineId: string; captureId: string; sessionId: string; sourceStateHash: string; selectedActionKey: string; pass: boolean; authority: { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false }; candidateRecordHash: string; [key: string]: unknown; }
export function buildZekNovaSessionManifest(args: { sessionId: string; environmentId: string; repositoryHead: string; runtimeBuildHash: string; collectorId: string; startedAt: string; endedAt: string; records: ZekNovaShadowRecord[]; campaignManifest?: Record<string, any> }): Readonly<ZekNovaSessionManifest>;
export function validateZekNovaSessionManifest(manifest: ZekNovaSessionManifest, records: ZekNovaShadowRecord[], options?: { campaignManifest?: Record<string, any> }): ZekNovaSessionManifest;
export function reconcileStage2FEvidence(args: { records: ZekNovaShadowRecord[]; sessionManifests?: ZekNovaSessionManifest[]; campaignManifest?: Record<string, any> }): Readonly<Record<string, any>>;
export function certifyZekNovaSustainedShadowCampaign(args: { manifest: AdapterManifest; records: ZekNovaShadowRecord[]; sessionManifests?: ZekNovaSessionManifest[]; campaignManifest?: Record<string, any>; thresholds?: Readonly<Record<string, number>>; profileName?: string }): Readonly<Record<string, any>>;
export function evaluateControlledCandidateRecommendation(args: { shadowRecord: ZekNovaShadowRecord; candidateRecommendation: Record<string, any> }): Readonly<ZekNovaCandidateEvaluationRecord>;
export function validateCandidateEvaluationRecord(record: ZekNovaCandidateEvaluationRecord): ZekNovaCandidateEvaluationRecord;
export function certifyControlledCandidateEvaluation(args: { manifest: AdapterManifest; campaignCertification: Record<string, any>; candidateRecords: ZekNovaCandidateEvaluationRecord[]; thresholds?: Readonly<Record<string, number>> }): Readonly<Record<string, any>>;
export function buildControlledNextStageDecisionPacket(args: { campaignCertification: Record<string, any>; candidateCertification: Record<string, any> }): Readonly<Record<string, any>>;
export function buildStage2FFrameworkCertification(args: { manifest: AdapterManifest; replayRecords: ZekNovaShadowRecord[] }): Readonly<Record<string, any>>;
export const STAGE2F_CAMPAIGN_MANIFEST_VERSION: 1;
export const STAGE2F_QUALIFICATION_IDENTITY_VERSION: 1;
export const STAGE2F_RECORD_SCHEMA_VERSION: 2;
export const STAGE2F_COLLECTOR_SCHEMA_VERSION: 2;
export const STAGE2F_SESSION_MANIFEST_VERSION: 2;
export function buildStage2FCampaignManifest(args: Record<string, any>): Readonly<Record<string, any>>;
export function validateStage2FCampaignManifest(manifest: Record<string, any>, options?: Record<string, any>): Record<string, any>;
export function buildStage2FQualificationIdentity(args: Record<string, any>): Readonly<Stage2FQualificationIdentity>;
export function validateStage2FQualificationIdentity(identity: Stage2FQualificationIdentity, options: Record<string, any>): Stage2FQualificationIdentity;

export const EXPERT_CONTRACT_VERSION: 1;
export const SIGNAL_SCALE: 1000000;
export const MAX_HISTORY_FRAMES: number;
export const MAX_ENTITIES: number;
export const MAX_EDGES: number;
export interface ExpertAuthority { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false; canIssueAuthorityTokens: false }
export interface ExpertOutput {
  expertContractVersion: 1;
  expertId: string;
  expertVersion: number;
  inputDigest: string;
  signalScale: 1000000;
  signals: Readonly<Record<string, number>>;
  confidence: number;
  rationaleCodes: readonly string[];
  authority: ExpertAuthority;
  advisoryOnly: true;
  outputDigest: string;
}
export interface ExpertInput {
  canonicalState?: Record<string, any> | null;
  observationHistory?: Array<{ tick: number; channels: Record<string, number> }> | null;
  legalActions?: Array<Record<string, any>> | null;
  context?: Record<string, any> | null;
}
export function expertAuthority(): ExpertAuthority;
export function isExactR0AuthorityBlock(value: unknown): boolean;
export function assertNoExecutionSurface<T>(value: T, path?: string): T;
export function normalizeExpertInput(input: ExpertInput): Readonly<Record<string, any>>;
export function computeInputDigest(normalizedInput: Readonly<Record<string, any>>): string;
export function buildExpertOutput(args: { expertId: string; expertVersion: number; normalizedInput: Readonly<Record<string, any>>; signals: Record<string, number>; confidence: number; rationaleCodes: string[] }): Readonly<ExpertOutput>;
export function validateExpertOutput(output: ExpertOutput): ExpertOutput;

export const ORACLE_EXPERT_ID: 'sentinel-oracle-temporal';
export const ORACLE_EXPERT_VERSION: 1;
export function evaluateOracle(input: ExpertInput): Readonly<ExpertOutput>;
export const oracleManifest: Readonly<Record<string, unknown>>;

export const NEXUS_EXPERT_ID: 'sentinel-nexus-relational';
export const NEXUS_EXPERT_VERSION: 1;
export const NEXUS_EDGE_KINDS: readonly ['depends', 'supports', 'threatens'];
export function evaluateNexus(input: ExpertInput): Readonly<ExpertOutput>;
export const nexusManifest: Readonly<Record<string, unknown>>;

export const STAGE2G_STAGE_ID: 'STAGE2G_ORACLE_NEXUS_R0';
export const STAGE2G_EVIDENCE_VERSION: 1;
export const STAGE2G_CERTIFICATION_VERSION: 1;
export const STAGE2G_ORACLE_CASES: ReadonlyArray<{ caseId: string; input: ExpertInput }>;
export const STAGE2G_NEXUS_CASES: ReadonlyArray<{ caseId: string; input: ExpertInput }>;
export interface Stage2GEvidenceRecord {
  stage2gEvidenceVersion: 1;
  stage: 'STAGE2G_ORACLE_NEXUS_R0';
  evidenceClass: string;
  sentinelRuntimeId: string;
  generatedRuntimeProvenanceId: string;
  stage2fCampaignId: string;
  sessionId: string;
  samplingIdentity: string;
  observationId: string;
  recordId: string;
  expertId: string;
  expertVersion: number;
  expertInputDigest: string;
  expertOutputDigest: string;
  authority: ExpertAuthority;
  advisoryOnly: true;
  consumedBy: 'shadow-evaluation-only';
  countsTowardStage2FQualification: false;
  evidenceHash: string;
  [key: string]: unknown;
}
export function buildStage2GEvidenceRecord(args: { qualificationIdentity: Record<string, any>; observationId: string; recordId: string; expertOutput: ExpertOutput; evidenceClass?: string }): Readonly<Stage2GEvidenceRecord>;
export function validateStage2GEvidenceRecord(record: Stage2GEvidenceRecord, options?: { campaignManifest?: Record<string, any> }): Stage2GEvidenceRecord;
export function runExpertDeterminismGate(expertId: string, cases: ReadonlyArray<{ caseId: string; input: ExpertInput }>): Readonly<Record<string, any>>;
export function runStage2GNegativeGates(args: { qualificationIdentity: Record<string, any>; campaignManifest: Record<string, any>; baselineOutput: ExpertOutput }): Array<{ name: string; rejected: boolean; code: string | null }>;
export function certifyStage2GExperts(args: { campaignManifest: Record<string, any>; sessionId?: string | null; samplingIdentity?: string | null }): { certification: Readonly<Record<string, any>>; records: ReadonlyArray<Stage2GEvidenceRecord>; qualificationIdentity: Readonly<Record<string, any>> };
export function buildStage2GPortabilityDigest(): { digest: string; witnesses: Readonly<Record<string, any>> };

export const EXPERT_CONTEXT_SCHEMA_VERSION: 1;
export const ORACLE_ADJUSTMENT_BOUND_MICRO: number;
export const NEXUS_ADJUSTMENT_BOUND_MICRO: number;
export const TOTAL_ADJUSTMENT_BOUND_MICRO: number;
export const CONTEXT_FEATURE_NAMES: readonly string[];
export interface ExpertContextEnvelope {
  schemaVersion: 1;
  stage: 'STAGE2H_SHADOW_EXPERT_CONSUMPTION';
  observationId: string;
  sentinelRuntimeId: string;
  generatedRuntimeProvenanceId: string;
  stage2fCampaignId: string;
  oracle: Readonly<Record<string, any>>;
  nexus: Readonly<Record<string, any>>;
  contextFeatures: Readonly<Record<string, number>>;
  adjustmentMicro: number;
  oracleAdjustmentMicro: number;
  nexusAdjustmentMicro: number;
  authority: ExpertAuthority;
  advisoryOnly: true;
  finalRecommendationOwner: 'PRIME';
  oracleRole: 'ADVISORY_CONTEXT';
  nexusRole: 'ADVISORY_CONTEXT';
  carriesActionSelection: false;
  carriesActionPriors: false;
  contextDigest: string;
}
export function deriveContextFeatures(args: { oracleSignals: Record<string, number>; nexusSignals: Record<string, number> }): Record<string, number>;
export function computeContextAdjustmentMicro(features: Record<string, number>): { oracleMicro: number; nexusMicro: number; totalMicro: number; oracleClamped: boolean; nexusClamped: boolean; totalClamped: boolean };
export function buildExpertContextEnvelope(args: { qualificationIdentity: Record<string, any>; observationId: string; oracleOutput: ExpertOutput; nexusOutput: ExpertOutput }): Readonly<ExpertContextEnvelope>;
export function validateExpertContextEnvelope(envelope: ExpertContextEnvelope, options?: { campaignManifest?: Record<string, any>; qualificationIdentity?: Record<string, any> }): ExpertContextEnvelope;
export function resolveExpertContextAdjustment(envelope: ExpertContextEnvelope, options?: Record<string, any>): { adjustmentMicro: number; adjustment: number; contextDigest: string };

export const STAGE2H_STAGE_ID: 'STAGE2H_SHADOW_EXPERT_CONSUMPTION';
export const STAGE2H_CERTIFICATION_VERSION: 1;
export const STAGE2H_CONTEXT_SCENARIOS: ReadonlyArray<Record<string, any>>;
export const STAGE2H_SEARCH_FIXTURES: ReadonlyArray<Record<string, any>>;
export function buildScenarioEnvelope(args: { qualificationIdentity: Record<string, any>; scenario: Record<string, any> }): Readonly<ExpertContextEnvelope>;
export function compareFixture(args: { fixture: Record<string, any>; envelope: ExpertContextEnvelope }): Readonly<Record<string, any>>;
export function runBaselineModeGate(): Readonly<Record<string, any>>;
export function runStage2HNegativeGates(args: { campaignManifest: Record<string, any>; envelope: ExpertContextEnvelope }): Array<{ name: string; rejected: boolean; code: string | null }>;
export function certifyStage2HPrimeContext(args: { campaignManifest: Record<string, any>; sessionId?: string | null; samplingIdentity?: string | null }): { certification: Readonly<Record<string, any>>; qualificationIdentity: Readonly<Record<string, any>> };
export function buildStage2HPortabilityDigest(args: { campaignManifest: Record<string, any> }): { digest: string; witnesses: Readonly<Record<string, any>> };

export const ACTION_CONTEXT_SCHEMA_VERSION: 1;
export interface ExpertActionContext {
  actionContextSchemaVersion: 1;
  stage: 'STAGE2H1_ACTION_DISCRIMINATING_EXPERT_CONTEXT';
  observationId: string;
  sentinelRuntimeId: string;
  stage2fCampaignId: string;
  oracleOutputDigest: string;
  nexusOutputDigest: string;
  global: ExpertContextEnvelope;
  legalActionKeys: readonly string[];
  actions: Readonly<Record<string, {
    oracleAdjustmentMicro: number;
    nexusAdjustmentMicro: number;
    combinedAdjustmentMicro: number;
    rationaleCodes: readonly string[];
    link: { entityId: string | null; channels: readonly string[] };
  }>>;
  authority: ExpertAuthority;
  advisoryOnly: true;
  finalRecommendationOwner: 'PRIME';
  actionContextDigest: string;
}
export function deriveEntityRelations(canonicalState: Record<string, any> | null): { entityCount: number; relations: Map<string, Record<string, any>> };
export function deriveOracleActionMicro(oracleSignals: Record<string, number>, channels: readonly string[]): { micro: number; codes: string[] };
export function deriveNexusActionMicro(relations: { entityCount: number; relations: Map<string, any> }, entityId: string | null): { micro: number; codes: string[] };
export function canonicalLegalActionKeys(legalActions: ReadonlyArray<Record<string, any>>): string[];
export function buildExpertActionContext(args: { qualificationIdentity: Record<string, any>; observationId: string; oracleInput?: Record<string, any>; nexusInput?: Record<string, any>; legalActions: ReadonlyArray<Record<string, any>>; actionLinks?: Record<string, { entityId?: string | null; channels?: readonly string[] }> | null }): Readonly<ExpertActionContext>;
export function validateExpertActionContext(envelope: ExpertActionContext, options?: Record<string, any>): ExpertActionContext;
export function resolveActionAdjustmentMicro(envelope: ExpertActionContext, key: string): number;
export function resolveExpertContext(expertContext: Record<string, any>, options?: { legalActions?: ReadonlyArray<Record<string, any>> | null; campaignManifest?: Record<string, any> | null }): Readonly<Record<string, any>>;

export const STAGE2H1_STAGE_ID: 'STAGE2H1_ACTION_DISCRIMINATING_EXPERT_CONTEXT';
export const STAGE2H1_CERTIFICATION_VERSION: 1;
export const STAGE2H1_FIXTURES: ReadonlyArray<Record<string, any>>;
export function buildActionLinks(legalActions: ReadonlyArray<Record<string, any>>, linkPlan: Record<string, any>): Record<string, any>;
export function buildArmContext(args: { qualificationIdentity: Record<string, any>; fixture: Record<string, any>; arm: string }): Readonly<ExpertActionContext>;
export function measureFixture(args: { qualificationIdentity: Record<string, any>; fixture: Record<string, any> }): Readonly<Record<string, any>>;
export function runStage2H1NegativeGates(args: { qualificationIdentity: Record<string, any>; campaignManifest: Record<string, any> }): Array<{ name: string; rejected: boolean; code: string | null }>;
export function certifyStage2H1ActionContext(args: { campaignManifest: Record<string, any>; sessionId?: string | null; samplingIdentity?: string | null }): { certification: Readonly<Record<string, any>>; qualificationIdentity: Readonly<Record<string, any>> };
export function buildStage2H1PortabilityDigest(args: { campaignManifest: Record<string, any> }): { digest: string; witnesses: Readonly<Record<string, any>> };

export const WORLD_STATE_SCHEMA_VERSION: 1;
export const WORLD_STATE_CONTRACT_ID: 'SENTINEL_WORLD_STATE_V1';
export const WORLD_STATE_SECTIONS: readonly [
  'entities', 'resources', 'objectives', 'relationships', 'spatialState',
  'temporalState', 'constraints', 'recentEvents',
];
export const EpistemicCategory: Readonly<{
  OBSERVED: 'OBSERVED'; DERIVED: 'DERIVED'; PREDICTED: 'PREDICTED'; UNKNOWN: 'UNKNOWN';
}>;
export const EvidenceAuthority: Readonly<{
  AUTHORITATIVE_OBSERVATION: 'AUTHORITATIVE_OBSERVATION';
  VALIDATED_DERIVATION: 'VALIDATED_DERIVATION';
  CALIBRATED_PREDICTION: 'CALIBRATED_PREDICTION';
  GENERATED_HYPOTHESIS: 'GENERATED_HYPOTHESIS';
  UNKNOWN: 'UNKNOWN';
}>;
export type WorldStateEpistemicCategory = typeof EpistemicCategory[keyof typeof EpistemicCategory];
export type WorldStateEvidenceAuthority = typeof EvidenceAuthority[keyof typeof EvidenceAuthority];
export interface WorldStateEnvironment { identity: string; version: string }
export interface WorldStateFact {
  path: readonly string[];
  category: WorldStateEpistemicCategory;
  authority: WorldStateEvidenceAuthority;
  value: unknown;
  confidence: number | null;
  uncertainty: Readonly<Record<string, unknown>>;
  provenance: Readonly<Record<string, unknown>>;
  factId: `sha256:${string}`;
}
export interface WorldStateSnapshot {
  contractId: 'SENTINEL_WORLD_STATE_V1';
  schemaVersion: 1;
  environment: Readonly<WorldStateEnvironment>;
  time: Readonly<{ logicalTime: number; timestamp: string | null; timestampStatus: 'OBSERVED' | 'UNKNOWN' }>;
  facts: readonly Readonly<WorldStateFact>[];
  nonAuthoritativeEvidence: readonly Readonly<WorldStateFact>[];
  sections: Readonly<Record<string, readonly string[]>>;
  epistemicCategories: typeof EpistemicCategory;
  authorityPrecedence: readonly WorldStateEvidenceAuthority[];
  authority: ExpertAuthority & Readonly<Record<string, unknown>>;
  snapshotId: `sha256:${string}`;
}
export class WorldStateContractError extends Error { details?: Record<string, unknown> }
export function createWorldStateFact(args: {
  path: string | readonly string[];
  category: WorldStateEpistemicCategory;
  authority: WorldStateEvidenceAuthority;
  value: unknown;
  confidence: number | null;
  uncertainty: Record<string, unknown>;
  provenance: Record<string, unknown>;
}): Readonly<WorldStateFact>;
export function createUnknownWorldStateFact(args: {
  path: string | readonly string[];
  environment: WorldStateEnvironment;
  sourceId: string;
  evidenceId: string;
  reason: string;
}): Readonly<WorldStateFact>;
export function createWorldStateSnapshot(args: {
  environment: WorldStateEnvironment;
  logicalTime: number;
  timestamp?: string | null;
  facts: readonly WorldStateFact[];
}): Readonly<WorldStateSnapshot>;
export function verifyWorldStateSnapshot(snapshot: WorldStateSnapshot): true;
export function serializeWorldStateSnapshot(snapshot: WorldStateSnapshot): string;
export function readWorldStateFact(snapshot: WorldStateSnapshot, path: string | readonly string[]): Readonly<WorldStateFact>;

export const CAUSAL_TRACE_SCHEMA_VERSION: 1;
export const CAUSAL_TRACE_CONTRACT_ID: 'SENTINEL_CAUSAL_TRACE_V1';
export const TraceRelationshipType: Readonly<{
  TEMPORAL_LINK: 'TEMPORAL_LINK'; DERIVATION_LINK: 'DERIVATION_LINK';
  DECISION_DEPENDENCY: 'DECISION_DEPENDENCY'; ACTION_BINDING: 'ACTION_BINDING';
  OUTCOME_BINDING: 'OUTCOME_BINDING'; CAUSAL_CLAIM: 'CAUSAL_CLAIM';
}>;
export const AttributionStatus: Readonly<{
  ESTABLISHED: 'ESTABLISHED'; SUPPORTED: 'SUPPORTED'; PLAUSIBLE: 'PLAUSIBLE';
  CONFLICTED: 'CONFLICTED'; UNKNOWN: 'UNKNOWN';
}>;
export const TraceLifecycleStatus: Readonly<{
  OPEN: 'OPEN'; ACTION_BOUND: 'ACTION_BOUND'; OUTCOME_BOUND: 'OUTCOME_BOUND';
  ATTRIBUTION_AVAILABLE: 'ATTRIBUTION_AVAILABLE'; INCOMPLETE: 'INCOMPLETE'; CONFLICTED: 'CONFLICTED';
}>;
export const ActionMatchStatus: Readonly<{
  MATCH: 'MATCH'; PARTIAL_MATCH: 'PARTIAL_MATCH'; DIFFERENT_ACTION: 'DIFFERENT_ACTION';
  NO_SENTINEL_RECOMMENDATION: 'NO_SENTINEL_RECOMMENDATION'; UNKNOWN: 'UNKNOWN';
}>;
export const FailureAttributionCategory: Readonly<{
  OBSERVATION_FAILURE: 'OBSERVATION_FAILURE';
  STATE_REPRESENTATION_FAILURE: 'STATE_REPRESENTATION_FAILURE';
  FEATURE_DERIVATION_FAILURE: 'FEATURE_DERIVATION_FAILURE';
  PREDICTION_FAILURE: 'PREDICTION_FAILURE'; ROUTING_FAILURE: 'ROUTING_FAILURE';
  RECOMMENDATION_FAILURE: 'RECOMMENDATION_FAILURE'; INCUMBENT_DIVERGENCE: 'INCUMBENT_DIVERGENCE';
  OUTCOME_ATTRIBUTION_UNCERTAIN: 'OUTCOME_ATTRIBUTION_UNCERTAIN';
  NO_FAILURE_DETERMINED: 'NO_FAILURE_DETERMINED'; UNKNOWN: 'UNKNOWN';
}>;
export type TraceRelationship = typeof TraceRelationshipType[keyof typeof TraceRelationshipType];
export type TraceAttributionStatus = typeof AttributionStatus[keyof typeof AttributionStatus];
export type CausalTraceLifecycleStatus = typeof TraceLifecycleStatus[keyof typeof TraceLifecycleStatus];
export type IncumbentActionMatchStatus = typeof ActionMatchStatus[keyof typeof ActionMatchStatus];
export type TraceFailureCategory = typeof FailureAttributionCategory[keyof typeof FailureAttributionCategory];
export interface TraceProvenance extends Record<string, unknown> {
  environmentIdentity: string;
  environmentVersion: string;
  sourceId: string;
  evidenceId: string;
}
export interface TraceAction extends Record<string, unknown> { actionId: string }
export interface ObservationTraceEvidence extends Record<string, unknown> {
  recordType: 'TRACE_OBSERVATION_EVIDENCE_V1';
  observationId: string;
  environment: Readonly<WorldStateEnvironment>;
  logicalTime: number;
  observationDigest: string;
  provenance: Readonly<TraceProvenance>;
  observationEvidenceId: `sha256:${string}`;
}
export interface FeatureDerivationTraceEvidence extends Record<string, unknown> {
  recordType: 'TRACE_FEATURE_DERIVATION_V1';
  environment: Readonly<WorldStateEnvironment>;
  worldStateSnapshotId: `sha256:${string}`;
  featureContract: Readonly<{ id: string; version: string; hash: string }>;
  featureValues: Readonly<Record<string, unknown>> | null;
  derivationDigest: string;
  implementation: Readonly<{ id: string; version: string; hash: string }>;
  provenance: Readonly<TraceProvenance>;
  featureDerivationId: `sha256:${string}`;
}
export interface PredictorTraceEvidence extends Record<string, unknown> {
  recordType: 'TRACE_PREDICTOR_EVIDENCE_V1';
  environment: Readonly<WorldStateEnvironment>;
  worldStateSnapshotId: `sha256:${string}`;
  predictor: Readonly<{ id: string; version: string }>;
  outputSummary: unknown;
  confidence: number;
  uncertainty: Readonly<Record<string, unknown>>;
  epistemicCategory: 'PREDICTED';
  provenance: Readonly<TraceProvenance>;
  predictorEvidenceId: `sha256:${string}`;
}
export interface RouterEvaluationTraceEvidence extends Record<string, unknown> {
  recordType: 'TRACE_ROUTER_EVALUATION_V1';
  environment: Readonly<WorldStateEnvironment>;
  featureDerivationId: `sha256:${string}`;
  predictorEvidenceIds: readonly `sha256:${string}`[];
  router: Readonly<{ id: string; version: string; hash: string }>;
  score: number;
  threshold: number;
  selectedRoute: string;
  fallback: Readonly<Record<string, unknown>>;
  provenance: Readonly<TraceProvenance>;
  routerEvaluationId: `sha256:${string}`;
}
export interface ShadowRecommendationTraceEvidence extends Record<string, unknown> {
  recordType: 'TRACE_SHADOW_RECOMMENDATION_V1';
  environment: Readonly<WorldStateEnvironment>;
  routerEvaluationId: `sha256:${string}`;
  proposedAction: Readonly<TraceAction> | null;
  recommendedPath: string;
  confidence: number | null;
  uncertainty: Readonly<Record<string, unknown>>;
  abstained: boolean;
  authority: Readonly<Record<string, unknown>> & { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false };
  dispatchPermitted: false;
  provenance: Readonly<TraceProvenance>;
  recommendationId: `sha256:${string}`;
}
export interface SentinelCausalTrace extends Record<string, unknown> {
  contractId: 'SENTINEL_CAUSAL_TRACE_V1';
  schemaVersion: 1;
  contractHash: string;
  traceId: `sha256:${string}`;
  traceDigest: `sha256:${string}`;
  environment: Readonly<WorldStateEnvironment>;
  logicalTime: number;
  decisionTimeEvent: Readonly<Record<string, unknown>>;
  attachments: readonly Readonly<Record<string, unknown>>[];
  edges: readonly Readonly<Record<string, unknown>>[];
  projection: Readonly<Record<string, unknown>>;
  authority: Readonly<Record<string, unknown>> & { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false };
}
export const CAUSAL_TRACE_CONTRACT: Readonly<Record<string, unknown>>;
export const CAUSAL_TRACE_CONTRACT_HASH: string;
export class CausalTraceContractError extends Error { details?: Record<string, unknown> }
export function createObservationEvidence(args: {
  observationId: string; environment: WorldStateEnvironment; logicalTime: number;
  observationDigest: string; provenance: TraceProvenance;
}): Readonly<ObservationTraceEvidence>;
export function createFeatureDerivationEvidence(args: {
  worldStateSnapshot: WorldStateSnapshot;
  featureContract: { id: string; version: string; hash: string };
  featureValues?: Record<string, unknown> | null; derivationDigest?: string | null;
  implementation: { id: string; version: string; hash: string }; provenance: TraceProvenance;
}): Readonly<FeatureDerivationTraceEvidence>;
export function createPredictorEvidence(args: {
  worldStateSnapshot: WorldStateSnapshot; predictor: { id: string; version: string };
  outputSummary: unknown; confidence: number; uncertainty: Record<string, unknown>; provenance: TraceProvenance;
}): Readonly<PredictorTraceEvidence>;
export function createRouterEvaluationEvidence(args: {
  featureDerivation: FeatureDerivationTraceEvidence; predictorEvidence?: readonly PredictorTraceEvidence[];
  router: { id: string; version: string; hash: string }; score: number; threshold: number;
  selectedRoute: string; fallback: Record<string, unknown>; provenance: TraceProvenance;
}): Readonly<RouterEvaluationTraceEvidence>;
export function createRecommendationEvidence(args: {
  routerEvaluation: RouterEvaluationTraceEvidence; proposedAction: TraceAction | null; recommendedPath: string;
  confidence: number | null; uncertainty: Record<string, unknown>; abstained?: boolean; provenance: TraceProvenance;
}): Readonly<ShadowRecommendationTraceEvidence>;
export function createTraceEdge(args: {
  environment: WorldStateEnvironment; sourceRef: string; targetRef: string; relationshipType: TraceRelationship;
  provenance: TraceProvenance; confidence?: number | null; attributionStatus: TraceAttributionStatus;
  causalBasis?: { method: string; evidenceRefs: readonly string[] } | null;
}): Readonly<Record<string, unknown>>;
export function createDecisionTimeTrace(args: {
  observationEvidence: ObservationTraceEvidence; worldStateSnapshot: WorldStateSnapshot;
  featureDerivation: FeatureDerivationTraceEvidence; predictorEvidence?: readonly PredictorTraceEvidence[];
  routerEvaluation: RouterEvaluationTraceEvidence; recommendation: ShadowRecommendationTraceEvidence;
}): Readonly<SentinelCausalTrace>;
export function verifyCausalTrace(trace: SentinelCausalTrace): true;
export function serializeCausalTrace(trace: SentinelCausalTrace): string;
export function attachIncumbentAction(trace: SentinelCausalTrace, args: {
  selectedAction: TraceAction; logicalTime: number; provenance: TraceProvenance;
}): Readonly<SentinelCausalTrace>;
export function attachOutcome(trace: SentinelCausalTrace, args: {
  actualStateSnapshot: WorldStateSnapshot; logicalTime: number; outcomeSummary: unknown;
  observationCompleteness: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN'; provenance: TraceProvenance;
}): Readonly<SentinelCausalTrace>;
export function attachAttribution(trace: SentinelCausalTrace, args: {
  status: TraceAttributionStatus; failureCategory: TraceFailureCategory; explanation: string;
  evidenceRefs: readonly string[]; confidence?: number | null;
  causalClaim?: { sourceRef: string; targetRef: string; basis: { method: string; evidenceRefs: readonly string[] } } | null;
  logicalTime: number; provenance: TraceProvenance;
}): Readonly<SentinelCausalTrace>;
export function attachInstrumentationFailure(trace: SentinelCausalTrace, args: {
  failureType: string; reason: string; logicalTime: number; provenance: TraceProvenance;
}): Readonly<SentinelCausalTrace>;

export const ENVIRONMENT_CALIBRATION_SCHEMA_VERSION: 1;
export const ENVIRONMENT_CALIBRATION_CONTRACT_ID: 'SENTINEL_ENVIRONMENT_CALIBRATION_V1';
export const CalibrationDomain: Readonly<{
  OBSERVATION_SEMANTICS: 'OBSERVATION_SEMANTICS'; ACTION_SEMANTICS: 'ACTION_SEMANTICS';
  RESOURCE_SEMANTICS: 'RESOURCE_SEMANTICS'; OBJECTIVE_SEMANTICS: 'OBJECTIVE_SEMANTICS';
  FAILURE_SEMANTICS: 'FAILURE_SEMANTICS'; CONSTRAINT_SEMANTICS: 'CONSTRAINT_SEMANTICS';
  TEMPORAL_SEMANTICS: 'TEMPORAL_SEMANTICS'; TRANSITION_SEMANTICS: 'TRANSITION_SEMANTICS';
}>;
export const CalibrationStatus: Readonly<{
  CALIBRATED: 'CALIBRATED'; PARTIALLY_CALIBRATED: 'PARTIALLY_CALIBRATED';
  INSUFFICIENT: 'INSUFFICIENT'; CONFLICTED: 'CONFLICTED'; UNKNOWN: 'UNKNOWN';
}>;
export const SemanticRelationType: Readonly<{
  EQUIVALENT: 'EQUIVALENT'; PARTIALLY_EQUIVALENT: 'PARTIALLY_EQUIVALENT'; RELATED: 'RELATED';
  INCOMPATIBLE: 'INCOMPATIBLE'; UNKNOWN: 'UNKNOWN';
}>;
export const ResourceDirectionality: Readonly<{
  INCREASE_DESIRABLE: 'INCREASE_DESIRABLE'; DECREASE_DESIRABLE: 'DECREASE_DESIRABLE';
  CONTEXT_DEPENDENT: 'CONTEXT_DEPENDENT'; NEUTRAL: 'NEUTRAL'; UNKNOWN: 'UNKNOWN';
}>;
export const RewardObjectiveRelationship: Readonly<{
  CERTIFIED_EQUIVALENT: 'CERTIFIED_EQUIVALENT'; RELATED: 'RELATED'; DISTINCT: 'DISTINCT'; UNKNOWN: 'UNKNOWN';
}>;
export const TransitionAssumption: Readonly<{
  DETERMINISTIC: 'DETERMINISTIC'; STOCHASTIC: 'STOCHASTIC';
  PARTIALLY_OBSERVABLE: 'PARTIALLY_OBSERVABLE'; ACTION_CONDITIONED: 'ACTION_CONDITIONED';
  EXTERNALLY_INFLUENCED: 'EXTERNALLY_INFLUENCED'; DELAYED_EFFECTS_POSSIBLE: 'DELAYED_EFFECTS_POSSIBLE';
  HIDDEN_STATE_POSSIBLE: 'HIDDEN_STATE_POSSIBLE'; NONSTATIONARY: 'NONSTATIONARY'; UNKNOWN: 'UNKNOWN';
}>;
export type EnvironmentCalibrationDomain = typeof CalibrationDomain[keyof typeof CalibrationDomain];
export type EnvironmentCalibrationStatus = typeof CalibrationStatus[keyof typeof CalibrationStatus];
export type EnvironmentSemanticRelation = typeof SemanticRelationType[keyof typeof SemanticRelationType];
export interface CalibrationEnvironmentIdentity extends Record<string, unknown> {
  recordType: 'SENTINEL_ENVIRONMENT_IDENTITY_V1';
  runtimeIdentity: string;
  environmentVersion: string;
  environmentFamily: string;
  environmentSchemaVersion: string;
  structuralSemantics: Readonly<{
    observationSchemaHash: string; actionSchemaHash: string; objectiveSchemaHash: string;
    transitionContractVersion: string;
  }>;
  environmentId: `sha256:${string}`;
}
export interface CalibrationProvenance extends Record<string, unknown> {
  environmentId: string;
  environmentVersion: string;
  sourceId: string;
  evidenceId: string;
}
export interface CalibrationEvidence extends Record<string, unknown> {
  recordType: 'SENTINEL_CALIBRATION_EVIDENCE_V1';
  environmentId: string;
  environmentVersion: string;
  domain: EnvironmentCalibrationDomain;
  claimTarget: string;
  claimType: string;
  claimValue: unknown;
  sourceReference: unknown;
  epistemicCategory: WorldStateEpistemicCategory;
  confidence: number | null;
  material: boolean;
  provenance: Readonly<CalibrationProvenance>;
  calibrationEvidenceId: `sha256:${string}`;
}
export interface SemanticDefinition extends Record<string, unknown> {
  recordType: 'SENTINEL_SEMANTIC_DEFINITION_V1';
  environmentId: string;
  environmentVersion: string;
  domain: EnvironmentCalibrationDomain;
  conceptId: string;
  conceptVersion: string;
  semantics: Readonly<Record<string, unknown>>;
  epistemicCategory: WorldStateEpistemicCategory;
  confidence: number | null;
  evidenceRefs: readonly string[];
  provenance: Readonly<CalibrationProvenance>;
  semanticDefinitionId: `sha256:${string}`;
}
export interface CalibrationDomainAssessment extends Record<string, unknown> {
  recordType: 'SENTINEL_CALIBRATION_DOMAIN_ASSESSMENT_V1';
  environmentId: string;
  environmentVersion: string;
  domain: EnvironmentCalibrationDomain;
  status: EnvironmentCalibrationStatus;
  confidence: number | null;
  evidenceRefs: readonly string[];
  provenance: Readonly<CalibrationProvenance>;
  domainAssessmentId: `sha256:${string}`;
}
export interface EnvironmentCalibration extends Record<string, unknown> {
  recordType: 'SENTINEL_ENVIRONMENT_CALIBRATION_RECORD_V1';
  contractId: 'SENTINEL_ENVIRONMENT_CALIBRATION_V1';
  schemaVersion: 1;
  contractHash: string;
  environmentIdentity: Readonly<CalibrationEnvironmentIdentity>;
  calibrationVersion: string;
  evidence: readonly Readonly<CalibrationEvidence>[];
  semanticDefinitions: readonly Readonly<SemanticDefinition>[];
  domainAssessments: readonly Readonly<CalibrationDomainAssessment>[];
  conflicts: readonly Readonly<Record<string, unknown>>[];
  overallStatus: EnvironmentCalibrationStatus;
  overallConfidence: number | null;
  structuralSimilarityImpliesSemanticEquivalence: false;
  rewardSignalImpliesObjectiveTruth: false;
  authority: Readonly<Record<string, unknown>> & { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false };
  calibrationId: `sha256:${string}`;
  calibrationDigest: `sha256:${string}`;
}
export const ENVIRONMENT_CALIBRATION_CONTRACT: Readonly<Record<string, unknown>>;
export const ENVIRONMENT_CALIBRATION_CONTRACT_HASH: string;
export class EnvironmentCalibrationContractError extends Error { details?: Record<string, unknown> }
export function createEnvironmentIdentity(args: {
  runtimeIdentity: string; environmentVersion: string; environmentFamily: string;
  environmentSchemaVersion: string; structuralSemantics: {
    observationSchemaHash: string; actionSchemaHash: string; objectiveSchemaHash: string;
    transitionContractVersion: string;
  };
}): Readonly<CalibrationEnvironmentIdentity>;
export function verifyEnvironmentIdentity(identity: CalibrationEnvironmentIdentity): true;
export function createCalibrationEvidence(args: {
  environmentIdentity: CalibrationEnvironmentIdentity; domain: EnvironmentCalibrationDomain;
  claimTarget: string; claimType: string; claimValue: unknown; sourceReference: unknown;
  epistemicCategory: WorldStateEpistemicCategory; confidence: number | null; material?: boolean;
  provenance: CalibrationProvenance;
}): Readonly<CalibrationEvidence>;
export function createSemanticDefinition(args: {
  environmentIdentity: CalibrationEnvironmentIdentity; domain: EnvironmentCalibrationDomain;
  conceptId: string; conceptVersion: string; semantics: Record<string, unknown>;
  epistemicCategory: WorldStateEpistemicCategory; confidence: number | null;
  evidenceRefs: readonly string[]; provenance: CalibrationProvenance;
}): Readonly<SemanticDefinition>;
export function createDomainAssessment(args: {
  environmentIdentity: CalibrationEnvironmentIdentity; domain: EnvironmentCalibrationDomain;
  status: EnvironmentCalibrationStatus; confidence: number | null;
  evidenceRefs: readonly string[]; provenance: CalibrationProvenance;
}): Readonly<CalibrationDomainAssessment>;
export function createEnvironmentCalibration(args: {
  environmentIdentity: CalibrationEnvironmentIdentity; calibrationVersion: string;
  evidence: readonly CalibrationEvidence[]; semanticDefinitions: readonly SemanticDefinition[];
  domainAssessments: readonly CalibrationDomainAssessment[];
}): Readonly<EnvironmentCalibration>;
export function verifyEnvironmentCalibration(calibration: EnvironmentCalibration): true;
export function serializeEnvironmentCalibration(calibration: EnvironmentCalibration): string;
export interface CalibrationSufficiencyRequirement {
  domain: EnvironmentCalibrationDomain; allowPartial?: boolean; minimumConfidence?: number;
}
export interface CalibrationSufficiencyResult extends Record<string, unknown> {
  calibrationId: string; sufficient: boolean; calibrationInsufficient: boolean;
  domainResults: readonly Readonly<Record<string, unknown>>[]; sufficiencyDigest: `sha256:${string}`;
}
export function evaluateCalibrationSufficiency(
  calibration: EnvironmentCalibration,
  requiredCapabilities: readonly (EnvironmentCalibrationDomain | CalibrationSufficiencyRequirement)[],
): Readonly<CalibrationSufficiencyResult>;
export function isCalibrationSufficient(
  calibration: EnvironmentCalibration,
  requiredCapabilities: readonly (EnvironmentCalibrationDomain | CalibrationSufficiencyRequirement)[],
): boolean;
export function lookupCalibrationSemantics(calibration: EnvironmentCalibration, args: {
  domain: EnvironmentCalibrationDomain; conceptId: string; conceptVersion?: string;
}): Readonly<Record<string, unknown>>;
export function createSemanticMapping(args: {
  sourceEnvironment: CalibrationEnvironmentIdentity; targetEnvironment: CalibrationEnvironmentIdentity;
  sourceConceptRef: string; targetConceptRef: string; relationType: EnvironmentSemanticRelation;
  confidence: number | null; evidenceRefs: readonly string[]; provenance: Record<string, unknown>;
}): Readonly<Record<string, unknown>>;
export function verifySemanticMapping(
  mapping: Record<string, unknown>, sourceEnvironment: CalibrationEnvironmentIdentity,
  targetEnvironment: CalibrationEnvironmentIdentity,
): true;
export function bindWorldStateCalibration(
  worldStateSnapshot: WorldStateSnapshot, calibration: EnvironmentCalibration,
): Readonly<Record<string, unknown>>;
export function bindCausalTraceCalibration(
  trace: SentinelCausalTrace, calibration: EnvironmentCalibration,
): Readonly<Record<string, unknown>>;
export function verifyWorldStateCalibrationBinding(
  binding: Record<string, unknown>, worldStateSnapshot: WorldStateSnapshot, calibration: EnvironmentCalibration,
): true;
export function verifyCausalTraceCalibrationBinding(
  binding: Record<string, unknown>, trace: SentinelCausalTrace, calibration: EnvironmentCalibration,
): true;
