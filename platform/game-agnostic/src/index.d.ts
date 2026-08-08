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
export const ZEKNOVA_SHADOW_RECORD_VERSION: 1;
export const ZEKNOVA_SHADOW_CERTIFICATION_VERSION: 1;
export const DEFAULT_PRODUCTION_SHADOW_THRESHOLDS: Readonly<Record<string, number>>;
export interface ZekNovaLiveCaptureContext { sessionId: string; sequence: number; factionId: string; biomeId: string; missionId: string; missionPhase: string; tensionBand: string; infrastructureBand: string; tick: number; }
export interface ZekNovaLiveCapture { captureVersion: 1; captureId: string; capturedAt?: string; source?: Record<string, JsonValue>; context: ZekNovaLiveCaptureContext; envelope: SnapshotEnvelope; legacyEvidence: Record<string, any>; }
export interface ZekNovaShadowRecord { shadowRecordVersion: 1; captureId: string; context: ZekNovaLiveCaptureContext; sourceStateHash: string; observerId: string; simulations: number; selectedActionKey: string; legacySelectedActionKey: string; agreement: Record<string, boolean>; pass: boolean; authority: { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false }; recordHash: string; [key: string]: unknown; }
export function validateZekNovaLiveCapture(capture: ZekNovaLiveCapture): ZekNovaLiveCapture;
export function evaluateZekNovaLiveCapture(args: { adapter: GameAdapter<any>; manifest: AdapterManifest; configuration: Readonly<Record<string, JsonValue>>; capture: ZekNovaLiveCapture; }): { pass: boolean; record: ZekNovaShadowRecord; diagnostics: Record<string, unknown> };
export function validateShadowRecord(record: ZekNovaShadowRecord): ZekNovaShadowRecord;
export function summarizeShadowRecords(records: ZekNovaShadowRecord[]): Readonly<Record<string, unknown>>;
export function certifyZekNovaSustainedShadow(args: { manifest: AdapterManifest; records: ZekNovaShadowRecord[]; thresholds?: Readonly<Record<string, number>>; profileName?: string; }): Readonly<Record<string, any>>;
export function buildZekNovaShadowFrameworkCertification(args: { manifest: AdapterManifest; evaluations: Array<{ pass: boolean; record: ZekNovaShadowRecord }>; }): Readonly<Record<string, any>>;


export const ZEKNOVA_SESSION_MANIFEST_VERSION: 1;
export const ZEKNOVA_CAMPAIGN_CERTIFICATION_VERSION: 1;
export const ZEKNOVA_CANDIDATE_EVALUATION_VERSION: 1;
export const ZEKNOVA_CONTROLLED_DECISION_VERSION: 1;
export const DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS: Readonly<Record<string, number>>;
export const DEFAULT_CONTROLLED_CANDIDATE_THRESHOLDS: Readonly<Record<string, number>>;
export interface ZekNovaSessionManifest { manifestVersion: 1; sessionId: string; environmentId: string; repositoryHead: string; runtimeBuildHash: string; collectorId: string; startedAt: string; endedAt: string; recordCount: number; entriesHash: string; authority: { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false }; manifestHash: string; [key: string]: unknown; }
export interface ZekNovaCandidateEvaluationRecord { candidateEvaluationVersion: 1; candidateId: string; engineId: string; captureId: string; sessionId: string; sourceStateHash: string; selectedActionKey: string; pass: boolean; authority: { tier: 'R0'; canDispatch: false; canMutateLiveWorld: false }; candidateRecordHash: string; [key: string]: unknown; }
export function buildZekNovaSessionManifest(args: { sessionId: string; environmentId: string; repositoryHead: string; runtimeBuildHash: string; collectorId: string; startedAt: string; endedAt: string; records: ZekNovaShadowRecord[] }): Readonly<ZekNovaSessionManifest>;
export function validateZekNovaSessionManifest(manifest: ZekNovaSessionManifest, records: ZekNovaShadowRecord[]): ZekNovaSessionManifest;
export function certifyZekNovaSustainedShadowCampaign(args: { manifest: AdapterManifest; records: ZekNovaShadowRecord[]; sessionManifests?: ZekNovaSessionManifest[]; thresholds?: Readonly<Record<string, number>>; profileName?: string }): Readonly<Record<string, any>>;
export function evaluateControlledCandidateRecommendation(args: { shadowRecord: ZekNovaShadowRecord; candidateRecommendation: Record<string, any> }): Readonly<ZekNovaCandidateEvaluationRecord>;
export function validateCandidateEvaluationRecord(record: ZekNovaCandidateEvaluationRecord): ZekNovaCandidateEvaluationRecord;
export function certifyControlledCandidateEvaluation(args: { manifest: AdapterManifest; campaignCertification: Record<string, any>; candidateRecords: ZekNovaCandidateEvaluationRecord[]; thresholds?: Readonly<Record<string, number>> }): Readonly<Record<string, any>>;
export function buildControlledNextStageDecisionPacket(args: { campaignCertification: Record<string, any>; candidateCertification: Record<string, any> }): Readonly<Record<string, any>>;
export function buildStage2FFrameworkCertification(args: { manifest: AdapterManifest; replayRecords: ZekNovaShadowRecord[] }): Readonly<Record<string, any>>;
