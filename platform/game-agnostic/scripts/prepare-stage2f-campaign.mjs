import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage2FCampaignManifest, validateStage2FCampaignManifest } from '../src/lab/zeknova-stage2f-identity.js';
import { DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS } from '../src/lab/zeknova-controlled-evaluation.js';

const kernelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(kernelRoot, 'artifacts', 'r0-runtime-identity');
const args = process.argv.slice(2);
const get = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const output = path.resolve(get('--output', path.join(artifactRoot, 'stage2f-campaign-manifest.json')));
const runtimeIdentity = JSON.parse(await readFile(path.join(artifactRoot, 'canonical-runtime-identity.json'), 'utf8'));
const generatedRuntimeProvenance = JSON.parse(await readFile(path.join(artifactRoot, 'generated-runtime-provenance.json'), 'utf8'));
let campaignStartTime = get('--start-time');
if (!campaignStartTime) {
  try {
    const existing = validateStage2FCampaignManifest(JSON.parse(await readFile(output, 'utf8')), { runtimeIdentity, generatedRuntimeProvenance });
    if (existing.campaignState === 'PREPARED' && existing.campaignMode === 'QUALIFICATION') campaignStartTime = existing.campaignStartTime;
  } catch { /* a stale or missing campaign cannot donate identity inputs */ }
}
campaignStartTime ??= new Date().toISOString();
const manifest = buildStage2FCampaignManifest({
  runtimeIdentity,
  generatedRuntimeProvenance,
  campaignStartTime,
  qualificationThresholdPolicy: DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS,
  campaignMode: 'QUALIFICATION',
  campaignState: 'PREPARED',
});
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  stage2fCampaignId: manifest.stage2fCampaignId,
  sentinelRuntimeId: manifest.sentinelRuntimeId,
  generatedRuntimeProvenanceId: manifest.generatedRuntimeProvenanceId,
  campaignState: manifest.campaignState,
  campaignMode: manifest.campaignMode,
  qualificationEligible: manifest.qualificationEligible,
  campaignManifestHash: manifest.campaignManifestHash,
}, null, 2));
