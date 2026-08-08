import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProductionRegistry } from './production-context.mjs';
import { certifyZekNovaSustainedShadow, evaluateZekNovaLiveCapture, DEFAULT_PRODUCTION_SHADOW_THRESHOLDS } from '../src/lab/zeknova-real-state-shadow.js';
const args = process.argv.slice(2);
const value = (flag, fallback = null) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; };
const fixtureDir = value('--fixtures');
const output = value('--output');
const requireProduction = args.includes('--require-production');
if (!fixtureDir) { console.error('Usage: node scripts/certify-zeknova-live-shadow.mjs --fixtures DIR [--output FILE] [--require-production]'); process.exit(2); }
const { registry } = await loadProductionRegistry();
const registration = registry.get('zeknova:zeknova-stage1az-shadow-adapter');
const files = (await readdir(path.resolve(fixtureDir)).catch(() => [])).filter((name) => name.endsWith('.json')).sort();
const records = [];
const failures = [];
for (const file of files) {
  try {
    const capture = JSON.parse(await readFile(path.join(path.resolve(fixtureDir), file), 'utf8'));
    const evaluation = evaluateZekNovaLiveCapture({ adapter: registration.adapter, manifest: registration.manifest, configuration: registration.configuration, capture });
    if (!evaluation.pass) failures.push({ file, error: 'Parity disagreement', agreement: evaluation.record.agreement });
    records.push(evaluation.record);
  } catch (error) { failures.push({ file, error: error.message }); }
}
let result;
if (files.length === 0) {
  result = { pass: false, status: 'pending-live-fixture-capture', fixtureCount: 0, productionPromotionEligible: false, authority: 'R0', failures: [] };
} else if (failures.length > 0) {
  result = { pass: false, status: 'live-parity-fail', fixtureCount: files.length, recordCount: records.length, productionPromotionEligible: false, authority: 'R0', failures };
} else {
  const report = certifyZekNovaSustainedShadow({ manifest: registration.manifest, records, thresholds: DEFAULT_PRODUCTION_SHADOW_THRESHOLDS, profileName: 'production-live-r0' });
  result = { pass: report.pass, status: report.status, fixtureCount: files.length, recordCount: records.length, productionPromotionEligible: report.certification.promotionEligible, authority: 'R0', summary: report.summary, checks: report.checks, failures };
}
if (output) { const resolved = path.resolve(output); await mkdir(path.dirname(resolved), { recursive: true }); await writeFile(resolved, `${JSON.stringify(result, null, 2)}\n`); }
console.log(JSON.stringify(result, null, 2));
if (requireProduction && !result.productionPromotionEligible) process.exitCode = 1;
else if (failures.length > 0) process.exitCode = 1;
