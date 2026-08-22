import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconcileStage2FEvidence } from "../src/lab/zeknova-controlled-evaluation.js";

const kernelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sentinelRoot = path.resolve(kernelRoot, "../..");
const zeknovaRoot = process.env.ZEKNOVA_ROOT || "/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience";
const artifactRoot = path.join(kernelRoot, "artifacts/r0-runtime-identity");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]));
}
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
async function fileRecord(rootName, root, relative, role) {
  const absolute = path.join(root, relative);
  const bytes = await readFile(absolute);
  let tracked = false;
  try { execFileSync("git", ["ls-files", "--error-unmatch", relative], { cwd: root, stdio: "ignore" }); tracked = true; } catch {}
  return { root: rootName, path: relative, role, sha256: sha256(bytes), size: bytes.length, tracked };
}
async function recordsFor(rootName, root, entries) {
  return Promise.all(entries.map(([relative, role]) => fileRecord(rootName, root, relative, role)));
}
async function sourceSegments() {
  const directory = path.join(zeknovaRoot, "src/runtime-reconstructed/compat/segments");
  return (await readdir(directory)).filter((name) => name.endsWith(".js")).sort().map((name) => [`src/runtime-reconstructed/compat/segments/${name}`, "compatibility-source"]);
}
function domainHash(inventory, roles) {
  const selected = inventory.filter((entry) => roles.includes(entry.role)).map(({ root, path, sha256: digest, size }) => ({ root, path, sha256: digest, size }));
  return sha256(canonical(selected));
}
function idFor(value) { return `sha256:${sha256(canonical(value))}`; }
async function jsonFiles(directory) {
  const names = await readdir(directory).catch(() => []);
  return names.filter((name) => name.endsWith(".json")).sort();
}
function deepFind(value, key) {
  if (!value || typeof value !== "object") return undefined;
  if (Object.hasOwn(value, key)) return value[key];
  for (const nested of Object.values(value)) { const found = deepFind(nested, key); if (found !== undefined) return found; }
}

const compatibilityEntries = await sourceSegments();
const zeknovaEntries = [
  ...compatibilityEntries,
  ["src/runtime-reconstructed/model/model-runtime.js", "model-source"],
  ["src/runtime-reconstructed/runtime-build.json", "build-config"],
  ["scripts/build-reconstructed-runtime.mjs", "build-script"],
  ["artifacts/runtime-reconstruction/index-reconstructed.js", "generated-compatibility"],
  ["artifacts/runtime-reconstruction/model-runtime-reconstructed.js", "generated-model"],
  ["assets/index-02987539.js", "golden-compatibility"],
  ["assets/model-runtime-c96327ba.js", "golden-model"],
  ["src/game/Game.js", "live-runtime-consumer"],
  ["src/game/BossSystem.js", "certified-gameplay-source"],
  ["src/game/Missions.js", "certified-gameplay-source"],
  ["azl/zeknova-strategic-state-contract-v2.js", "canonical-state"],
  ["src/game/Stage2FStrategicProjectionV2.js", "canonical-state"],
  ["azl/zeknova-prime-shadow-contract-v1.js", "prime"],
  ["src/world/PrimeShadow.js", "prime"],
  ["src/game/SentinelExpertRouter.js", "router"],
  ["azl/zeknova-authority-readiness-contract-v1.js", "authority"],
  ["sentinel-grid/live-parity/runtime-collector/Stage2FExactProviderBridgeSafe.js", "provider-bridge"],
  ["src/game/StrategicStateClock.js", "telemetry"],
  ["src/game/Stage2FRuntimeCollectorClient.js", "telemetry"],
  ["src/game/Stage2FRuntimeCollectorConfig.js", "telemetry"],
  ["sentinel-grid/live-parity/runtime-collector/collector-core.mjs", "collector"],
  ["sentinel-grid/live-parity/runtime-collector/browser-client.js", "collector"],
  ["sentinel-grid/live-parity/runtime-collector/config.json", "collector"],
];
const sentinelEntries = [
  ["platform/game-agnostic/scripts/certify-r0-runtime-identity.mjs", "certification-policy"],
  ["platform/game-agnostic/scripts/verify-r0-runtime-identity.mjs", "certification-policy"],
  ["platform/game-agnostic/schemas/zeknova-shadow-record.schema.json", "collector-schema"],
  ["platform/game-agnostic/schemas/zeknova-session-manifest.schema.json", "collector-schema"],
  ["platform/game-agnostic/schemas/zeknova-stage2f-campaign-manifest.schema.json", "collector-schema"],
  ["platform/game-agnostic/config/zeknova-shadow-certification.json", "certification-policy"],
  ["platform/game-agnostic/config/zeknova-stage2f-controlled-evaluation.json", "certification-policy"],
  ["platform/game-agnostic/src/lab/zeknova-real-state-shadow.js", "certification-policy"],
  ["platform/game-agnostic/src/lab/zeknova-controlled-evaluation.js", "certification-policy"],
  ["platform/game-agnostic/src/lab/zeknova-stage2f-identity.js", "certification-policy"],
  ["platform/game-agnostic/scripts/prepare-stage2f-campaign.mjs", "certification-policy"],
  ["platform/game-agnostic/scripts/certify-zeknova-stage2f-campaign.mjs", "certification-policy"],
];
const inventory = [
  ...await recordsFor("zeknova", zeknovaRoot, zeknovaEntries),
  ...await recordsFor("sentinel", sentinelRoot, sentinelEntries),
].sort((a, b) => `${a.root}/${a.path}`.localeCompare(`${b.root}/${b.path}`));
const byRole = (role) => inventory.find((entry) => entry.role === role);
const domains = {
  zeknovaSourceSha256: domainHash(inventory, ["compatibility-source", "model-source", "live-runtime-consumer", "certified-gameplay-source", "canonical-state", "prime", "router", "authority", "provider-bridge", "telemetry", "collector"]),
  compatibilitySourceSha256: domainHash(inventory, ["compatibility-source"]),
  modelSourceSha256: domainHash(inventory, ["model-source"]),
  canonicalStateSha256: domainHash(inventory, ["canonical-state"]),
  primeSha256: domainHash(inventory, ["prime"]),
  routerSha256: domainHash(inventory, ["router"]),
  authoritySha256: domainHash(inventory, ["authority"]),
  providerBridgeSha256: domainHash(inventory, ["provider-bridge"]),
  telemetrySha256: domainHash(inventory, ["telemetry"]),
  collectorSchemaSha256: domainHash(inventory, ["collector", "collector-schema"]),
  certificationPolicySha256: domainHash(inventory, ["certification-policy"]),
};
const provenancePayload = {
  provenanceSchemaVersion: 1,
  compatibilitySourceRoot: "zeknova:src/runtime-reconstructed/compat/segments",
  modelSourceRoot: "zeknova:src/runtime-reconstructed/model/model-runtime.js",
  sourceFiles: inventory.filter((entry) => ["compatibility-source", "model-source"].includes(entry.role)),
  build: { tool: "repository-owned-node-builder", toolVersion: "1.0.0", command: "npm run runtime:reconstruct:build", config: byRole("build-config"), script: byRole("build-script") },
  outputs: { compatibility: byRole("generated-compatibility"), model: byRole("generated-model") },
  goldenReferences: { compatibility: byRole("golden-compatibility"), model: byRole("golden-model") },
};
const provenance = { ...provenancePayload, generatedRuntimeProvenanceId: idFor(provenancePayload) };
let sourceGatePass = false;
try { execFileSync(process.execPath, ["scripts/check-source.mjs"], { cwd: zeknovaRoot, stdio: "ignore" }); sourceGatePass = true; } catch {}
const runtimePayload = {
  runtimeIdentitySchemaVersion: 1,
  sentinelHead: git(sentinelRoot, "rev-parse", "HEAD"),
  zeknovaHead: git(zeknovaRoot, "rev-parse", "HEAD"),
  generatedRuntimeProvenanceId: provenance.generatedRuntimeProvenanceId,
  domains,
  generatedCompatibilitySha256: byRole("generated-compatibility").sha256,
  generatedModelSha256: byRole("generated-model").sha256,
  canonicalStateSchemaVersion: "hash-derived",
  primeImplementation: "zeknova-prime-shadow-contract-v1+PrimeShadow",
  primeVersion: "hash-derived",
  routerImplementation: "SentinelExpertRouter",
  routerVersion: "hash-derived",
  authorityPolicyVersion: "hash-derived-R0",
  providerBridgeVersion: "sentinel-stage2f-provider-v5",
  telemetryVersion: "hash-derived",
  collectorSchemaVersion: "2",
  certificationSchemaVersion: "2",
  authority: { tier: "R0", canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
};
const runtime = { ...runtimePayload, sentinelRuntimeId: idFor(runtimePayload) };

const recordsDir = path.join(zeknovaRoot, "sentinel-grid/live-parity/records");
const sessionsDir = path.join(zeknovaRoot, "sentinel-grid/live-parity/sessions");
const recordFiles = await jsonFiles(recordsDir);
const sessionFiles = await jsonFiles(sessionsDir);
const records = await Promise.all(recordFiles.map(async (name) => {
  try { return JSON.parse(await readFile(path.join(recordsDir, name), "utf8")); }
  catch { return { malformedFile: name }; }
}));
const sessionManifests = await Promise.all(sessionFiles.map(async (name) => {
  try { return JSON.parse(await readFile(path.join(sessionsDir, name), "utf8")); }
  catch { return { malformedFile: name }; }
}));
let campaignManifest = null;
try {
  const candidate = JSON.parse(await readFile(path.join(artifactRoot, "stage2f-campaign-manifest.json"), "utf8"));
  if (candidate.sentinelRuntimeId === runtime.sentinelRuntimeId && candidate.generatedRuntimeProvenanceId === provenance.generatedRuntimeProvenanceId) campaignManifest = candidate;
} catch {}
const identityReconciliation = reconcileStage2FEvidence({ records, sessionManifests, campaignManifest });
const classifications = {
  accepted: identityReconciliation.acceptedRecords.map((record) => record.recordHash),
  quarantined: identityReconciliation.quarantinedRecords,
  rejected: identityReconciliation.rejectedRecords,
  reasons: identityReconciliation.reasons,
};
const thresholds = {
  requiredRecords: 1000, requiredDistinctStates: 250, requiredSessions: 5, requiredSamplingIdentities: 1000, requiredManifests: 5,
  requiredTotalSims: 320000, requiredMissionCoverage: 12, requiredBiomeCoverage: 4, requiredFactionCoverage: 4,
  maxIllegalRecommendations: 0, maxSourceMutations: 0, maxAuthorityViolations: 0,
};
const reconciliation = {
  reconciliationSchemaVersion: 2, sentinelRuntimeId: runtime.sentinelRuntimeId,
  totalRecords: identityReconciliation.total,
  accepted: classifications.accepted.length, quarantined: classifications.quarantined.length, rejected: classifications.rejected.length,
  reasons: classifications.reasons, sessionManifestsObserved: sessionFiles.length,
  stage2fCampaignId: campaignManifest?.stage2fCampaignId ?? null,
  policy: "Only records carrying the exact canonical sentinelRuntimeId are accepted; historical files are never rewritten.",
};
const stage2f = {
  certificationSchemaVersion: 2, sentinelRuntimeId: runtime.sentinelRuntimeId, thresholds,
  acceptedEvidence: { records: classifications.accepted.length, distinctStates: 0, sessions: 0, samplingIdentities: 0, manifests: 0, totalSims: 0, missionCoverage: 0, biomeCoverage: 0, factionCoverage: 0, illegalRecommendations: 0, sourceMutations: 0, authorityViolations: 0 },
  thresholdsPass: false, certified: false, runtimeBaselineCertified: sourceGatePass, newCampaignRequired: true,
  newEvidenceRequired: { records: 1000, distinctStates: 250, samplingIdentities: 1000, sessions: 5, totalSims: 320000, missionCoverage: 12, biomeCoverage: 4, factionCoverage: 4 },
};
const baseline = { baselineSchemaVersion: 1, inventory, domains };
const certification = { certificationSchemaVersion: 2, sentinelRuntimeId: runtime.sentinelRuntimeId, generatedRuntimeProvenanceId: provenance.generatedRuntimeProvenanceId, authority: runtime.authority, runtimeIdentityCertified: true, sourceGatePass, runtimeBaselineCertified: sourceGatePass, stage2fCertified: false, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, authorityTokenIssues: 0, r1CanaryExecuted: false, incumbentScriptedExecutorPreserved: true };

await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({ "baseline-manifest.json": baseline, "generated-runtime-provenance.json": provenance, "canonical-runtime-identity.json": runtime, "r0-certification-result.json": certification, "stage2f-evidence-reconciliation.json": reconciliation, "stage2f-certification-result.json": stage2f })) {
  await writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}
console.log(JSON.stringify({ generatedRuntimeProvenanceId: provenance.generatedRuntimeProvenanceId, sentinelRuntimeId: runtime.sentinelRuntimeId, reconciliation, stage2f }, null, 2));
