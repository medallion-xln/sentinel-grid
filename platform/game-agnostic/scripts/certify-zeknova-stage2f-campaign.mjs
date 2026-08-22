import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProductionRegistry } from './production-context.mjs';
import {
  certifyZekNovaSustainedShadowCampaign,
  certifyControlledCandidateEvaluation,
  buildControlledNextStageDecisionPacket,
} from '../src/lab/zeknova-controlled-evaluation.js';

const args = process.argv.slice(2);
const get = (flag, fallback = null) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; };
const recordsDir = path.resolve(get('--records', './records'));
const sessionsDir = path.resolve(get('--sessions', './sessions'));
const candidatesDir = path.resolve(get('--candidates', './candidates'));
const outputFile = path.resolve(get('--output', './evidence/stage2f-latest.json'));
const campaignFile = path.resolve(get('--campaign', './artifacts/r0-runtime-identity/stage2f-campaign-manifest.json'));

async function loadJsonFiles(directory) {
  let names = [];
  try { names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort(); } catch { return []; }
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(directory, name), 'utf8'))));
}

const { registry } = await loadProductionRegistry();
const registration = registry.get('zeknova:zeknova-stage1az-shadow-adapter');
const records = await loadJsonFiles(recordsDir);
const sessionManifests = await loadJsonFiles(sessionsDir);
const candidateRecords = await loadJsonFiles(candidatesDir);
const campaignManifest = JSON.parse(await readFile(campaignFile, 'utf8'));
const campaign = certifyZekNovaSustainedShadowCampaign({ manifest: registration.manifest, records, sessionManifests, campaignManifest });
const candidate = certifyControlledCandidateEvaluation({ manifest: registration.manifest, campaignCertification: campaign, candidateRecords });
const decision = buildControlledNextStageDecisionPacket({ campaignCertification: campaign, candidateCertification: candidate });
const output = {
  pass: campaign.pass && candidate.pass,
  stage: 'Stage 2F-Z',
  campaign,
  candidate,
  decision,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
};
await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
if (!output.pass) process.exitCode = 1;
