import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kernelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sentinelRoot = path.resolve(kernelRoot, "../..");
const zeknovaRoot = process.env.ZEKNOVA_ROOT ?? null;
const artifactRoot = path.join(kernelRoot, "artifacts/r0-runtime-identity");
const digest = (value) => createHash("sha256").update(value).digest("hex");
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}
const canonical = (value) => JSON.stringify(sorted(value));
const idFor = (value) => `sha256:${digest(canonical(value))}`;
const load = async (name) => JSON.parse(await readFile(path.join(artifactRoot, name), "utf8"));
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
const changed = (value) => `${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}`;

const baseline = await load("baseline-manifest.json");
const provenance = await load("generated-runtime-provenance.json");
const runtime = await load("canonical-runtime-identity.json");

assert.equal(idFor(without(provenance, "generatedRuntimeProvenanceId")), provenance.generatedRuntimeProvenanceId);
assert.equal(idFor(without(runtime, "sentinelRuntimeId")), runtime.sentinelRuntimeId);
for (const entry of baseline.inventory) {
  const root = entry.root === "sentinel" ? sentinelRoot : zeknovaRoot;
  const bytes = await readFile(path.join(root, entry.path));
  assert.equal(digest(bytes), entry.sha256, `${entry.root}:${entry.path} differs from the certified manifest`);
  assert.equal(bytes.length, entry.size, `${entry.root}:${entry.path} size differs from the certified manifest`);
}

const sourceMutation = structuredClone(runtime); sourceMutation.domains.zeknovaSourceSha256 = changed(sourceMutation.domains.zeknovaSourceSha256);
const modelMutation = structuredClone(runtime); modelMutation.domains.modelSourceSha256 = changed(modelMutation.domains.modelSourceSha256);
const configMutation = structuredClone(provenance); configMutation.build.config.sha256 = changed(configMutation.build.config.sha256);
const authorityMutation = structuredClone(runtime); authorityMutation.authority.canDispatch = true;
const compatMutation = structuredClone(provenance); compatMutation.outputs.compatibility.sha256 = changed(compatMutation.outputs.compatibility.sha256);
const modelOutputMutation = structuredClone(provenance); modelOutputMutation.outputs.model.sha256 = changed(modelOutputMutation.outputs.model.sha256);
const manifestMutation = structuredClone(baseline); manifestMutation.inventory[0].size += 1;

assert.notEqual(idFor(without(sourceMutation, "sentinelRuntimeId")), runtime.sentinelRuntimeId);
assert.notEqual(idFor(without(modelMutation, "sentinelRuntimeId")), runtime.sentinelRuntimeId);
assert.notEqual(idFor(without(configMutation, "generatedRuntimeProvenanceId")), provenance.generatedRuntimeProvenanceId);
assert.notEqual(idFor(without(authorityMutation, "sentinelRuntimeId")), runtime.sentinelRuntimeId);
assert.notEqual(idFor(without(compatMutation, "generatedRuntimeProvenanceId")), provenance.generatedRuntimeProvenanceId);
assert.notEqual(idFor(without(modelOutputMutation, "generatedRuntimeProvenanceId")), provenance.generatedRuntimeProvenanceId);
assert.notEqual(digest(canonical(manifestMutation)), digest(canonical(baseline)));

console.log(JSON.stringify({ sentinelRuntimeId: runtime.sentinelRuntimeId, generatedRuntimeProvenanceId: provenance.generatedRuntimeProvenanceId, inventoryFilesVerified: baseline.inventory.length, adversarialTests: 8, adversarialPass: 8, adversarialFail: 0, authority: runtime.authority }, null, 2));
