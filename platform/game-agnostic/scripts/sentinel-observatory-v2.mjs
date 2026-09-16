#!/usr/bin/env node
/* Read-only ASCII Observatory CLI with the Stage 3F.6 PREDICTION view.
 * The seven Stage 3F.5 views render exactly as `scripts/sentinel-observatory.mjs` does (that certified script is
 * left untouched). PREDICTION runs a small bounded Stage 3F.6 evaluation on frozen Stage 3E decision points and
 * reads certified aggregates from the Stage 3F.6 artifact when present. Nothing here can dispatch or mutate. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { createBoundedTelemetryProducer, createReadOnlyAsciiObservatory } from '../src/stage3f/ascii-observatory-v1.js';
import { createForgeIntegratedCalibration, projectIntegratedTelemetry, runIntegratedLiveShadowCampaign } from '../src/stage3f/integrated-live-shadow-v1.js';
import { PredictionObservatoryView, createPredictionObservatory } from '../src/stage3f/prediction-observatory-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '..');
const artifactDirectory = path.join(root, 'artifacts', 'stage3f6-prediction-reliability');
const arg = (name, fallback = null) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const view = String(arg('--view', PredictionObservatoryView.WORLD)).toUpperCase();

function certifiedAggregate() {
  const file = path.join(artifactDirectory, 'stage3f6-certification-result.json');
  if (!existsSync(file)) return { status: 'UNKNOWN_NOT_CERTIFIED' };
  try {
    const result = JSON.parse(readFileSync(file, 'utf8'));
    return { status: result.status, ...result.observatoryAggregate };
  } catch { return { status: 'UNKNOWN_UNREADABLE_ARTIFACT' }; }
}

async function predictionFrames(producer, count) {
  const [{ buildRecordV2 }, E, P] = await Promise.all([import('../src/forge/record-v2.js'),
    import('../src/stage3f/prediction-reliability-episode-v1.js'), import('../src/stage3f/prediction-reliability-v1.js')]);
  const corpusFile = path.join(artifactDirectory, 'evaluation-corpus.jsonl.gz');
  const freezeFile = path.join(artifactDirectory, 'stage3f6-evaluation-freeze.json');
  if (!existsSync(corpusFile)) return 'corpus=UNAVAILABLE (run npm run stage3f6:generate)';
  const cases = gunzipSync(readFileSync(corpusFile)).toString('utf8').trim().split('\n').map((text) => JSON.parse(text))
    .filter((entry) => entry.partition === 'HOLDOUT')
    .sort((a, b) => P.stableDigest(`STAGE3F6_LAYER_B:${a.recordHash}`).localeCompare(P.stableDigest(`STAGE3F6_LAYER_B:${b.recordHash}`)))
    .slice(0, count);
  let thresholds = null;
  try { thresholds = JSON.parse(readFileSync(freezeFile, 'utf8')).designDerived.noveltyThresholds; } catch { thresholds = null; }
  let novelty = () => 'UNKNOWN';
  if (thresholds) {
    const model = JSON.parse(readFileSync(path.join(root, 'artifacts', 'stage3e-routability-intelligence', 'lr-model.json'), 'utf8'));
    const devRows = JSON.parse(readFileSync(path.join(root, 'artifacts', 'stage3e-routability-intelligence', 'replay-fixtures', 'matrix-ROUTABILITY_HOLDOUT.json'), 'utf8'));
    const devReference = JSON.parse(readFileSync(path.join(root, 'artifacts', 'stage3e-routability-intelligence', 'replay-fixtures', 'matrix-ROUTABILITY_DEV.json'), 'utf8'));
    const byHash = new Map(devRows.map((row) => [row.recordHash, row.f]));
    const references = P.standardizedMatrix(devReference.map((row) => row.f), model);
    novelty = (entry) => { const f = byHash.get(entry.recordHash); if (!f) return 'UNKNOWN';
      return P.noveltyBucket(P.nearestReferenceDistances(P.standardizedMatrix([f], model), references)[0], thresholds); };
  }
  const calibration = createForgeIntegratedCalibration(); const aggregate = certifiedAggregate();
  for (const entry of cases) {
    const built = buildRecordV2({ ...entry.combination, seed: Number(entry.combination.seed) }, entry.ood);
    const run = E.runStage3F6Episode({ world: built.world, calibration });
    const evidence = E.evaluateStage3F6Episode({ run, calibration, novelty: novelty(entry) });
    producer.offer({ ...projectIntegratedTelemetry(run.result), prediction: E.projectPredictionTelemetry(evidence, aggregate) });
  }
  return `corpus=${cases.length} HOLDOUT decision points`;
}

if (!Object.values(PredictionObservatoryView).includes(view)) {
  process.stderr.write(`Unknown view ${view}. Use ${Object.values(PredictionObservatoryView).join(', ')}.\n`); process.exitCode = 2;
} else if (view !== PredictionObservatoryView.PREDICTION) {
  const producer = createBoundedTelemetryProducer({ capacity: Number(arg('--capacity', 32)) });
  const observatory = createReadOnlyAsciiObservatory(producer);
  const campaign = runIntegratedLiveShadowCampaign({ telemetrySink: producer });
  process.stdout.write(`${observatory.render({ view, fullIds: process.argv.includes('--full-ids') })}\n\n`);
  process.stdout.write(`campaign=${campaign.campaignHash}\nframes=${producer.snapshot().stats.size} dropped=${producer.snapshot().stats.dropped}\n`);
  process.stdout.write('presentation-only=true authority=R0 dispatch=false mutate=false\n');
} else {
  const producer = createBoundedTelemetryProducer({ capacity: Number(arg('--capacity', 32)) });
  const observatory = createPredictionObservatory(producer);
  if (process.argv.includes('--disconnect')) producer.disconnect();
  const source = await predictionFrames(producer, Math.max(1, Math.min(8, Number(arg('--episodes', 3)))));
  process.stdout.write(`${observatory.render({ view, index: Number(arg('--index', -1)) })}\n\n`);
  process.stdout.write(`${source}\nframes=${producer.snapshot().stats.size} dropped=${producer.snapshot().stats.dropped}\n`);
  process.stdout.write('presentation-only=true authority=R0 dispatch=false mutate=false\n');
}
