#!/usr/bin/env node
import {
  ObservatoryView, createBoundedTelemetryProducer, createReadOnlyAsciiObservatory,
} from '../src/stage3f/ascii-observatory-v1.js';
import { runIntegratedLiveShadowCampaign } from '../src/stage3f/integrated-live-shadow-v1.js';

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1];
};
const view = String(arg('--view', ObservatoryView.WORLD)).toUpperCase();
if (!Object.values(ObservatoryView).includes(view)) {
  process.stderr.write(`Unknown view ${view}. Use ${Object.values(ObservatoryView).join(', ')}.\n`); process.exitCode = 2;
} else {
  const producer = createBoundedTelemetryProducer({ capacity: Number(arg('--capacity', 32)) });
  const observatory = createReadOnlyAsciiObservatory(producer);
  const campaign = runIntegratedLiveShadowCampaign({ telemetrySink: producer });
  process.stdout.write(`${observatory.render({ view, fullIds: process.argv.includes('--full-ids') })}\n\n`);
  process.stdout.write(`campaign=${campaign.campaignHash}\nframes=${producer.snapshot().stats.size} dropped=${producer.snapshot().stats.dropped}\n`);
  process.stdout.write('presentation-only=true authority=R0 dispatch=false mutate=false\n');
}
