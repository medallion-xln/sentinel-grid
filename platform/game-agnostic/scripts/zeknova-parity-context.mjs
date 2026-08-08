import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, loadProductionRegistry } from './production-context.mjs';
import { runZekNovaBehavioralParity } from '../src/lab/zeknova-parity.js';

export async function loadZekNovaBehavioralParity() {
  const { registry, lock } = await loadProductionRegistry();
  const registration = registry.get('zeknova:zeknova-stage1az-shadow-adapter');
  const parityConfig = JSON.parse(await readFile(path.join(root, 'config/zeknova-parity-runs.json'), 'utf8'));
  const baseline = JSON.parse(await readFile(path.join(root, 'parity/zeknova-stage1az/legacy-baseline.json'), 'utf8'));
  const fixtures = [];
  for (const run of parityConfig.fixtures) {
    fixtures.push({ run, envelope: JSON.parse(await readFile(path.join(root, run.file), 'utf8')) });
  }
  const report = runZekNovaBehavioralParity({
    adapter: registration.adapter,
    manifest: registration.manifest,
    configuration: registration.configuration,
    fixtures,
    baseline,
  });
  return { registration, lock, report, baseline, fixtures };
}
