import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, loadProductionRegistry } from './production-context.mjs';
import { buildZekNovaShadowFrameworkCertification, evaluateZekNovaLiveCapture } from '../src/lab/zeknova-real-state-shadow.js';

export async function loadZekNovaShadowFrameworkCertification() {
  const { registry, lock } = await loadProductionRegistry();
  const registration = registry.get('zeknova:zeknova-stage1az-shadow-adapter');
  const runs = JSON.parse(await readFile(path.join(root, 'config/zeknova-parity-runs.json'), 'utf8'));
  const baseline = JSON.parse(await readFile(path.join(root, 'parity/zeknova-stage1az/legacy-baseline.json'), 'utf8'));
  const phases = ['opening', 'midgame', 'late'];
  const tension = ['low', 'medium', 'high'];
  const infrastructure = ['fragile', 'developing', 'established'];
  const evaluations = [];
  const captures = [];
  for (let index = 0; index < runs.fixtures.length; index += 1) {
    const run = runs.fixtures[index];
    const envelope = JSON.parse(await readFile(path.join(root, run.file), 'utf8'));
    const legacyEvidence = baseline.fixtures.find((entry) => entry.fixtureId === run.fixtureId);
    const capture = {
      captureVersion: 1,
      captureId: `framework-replay-${String(index + 1).padStart(2, '0')}`,
      capturedAt: '2026-07-28T00:00:00.000Z',
      source: { kind: 'frozen-stage1az-replay', productionEligible: false },
      context: {
        sessionId: index < 3 ? 'framework-session-a' : 'framework-session-b',
        sequence: index,
        factionId: run.observerId,
        biomeId: run.observerId,
        missionId: `mission-${index + 1}`,
        missionPhase: phases[index % phases.length],
        tensionBand: tension[index % tension.length],
        infrastructureBand: infrastructure[(index + 1) % infrastructure.length],
        tick: envelope.payload.tick,
      },
      envelope,
      legacyEvidence,
    };
    captures.push(capture);
    evaluations.push(evaluateZekNovaLiveCapture({ adapter: registration.adapter, manifest: registration.manifest, configuration: registration.configuration, capture }));
  }
  const report = buildZekNovaShadowFrameworkCertification({ manifest: registration.manifest, evaluations });
  return { registration, lock, captures, evaluations, report };
}
