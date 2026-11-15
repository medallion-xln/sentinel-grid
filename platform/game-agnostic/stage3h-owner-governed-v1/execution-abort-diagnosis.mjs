// Post-abort diagnosis (development-only; consumes and regenerates NO registered world). Replication A of registration
// 0364164c aborted on NATIVE_MENU_MISMATCH in nativeLock for a registered world. Because decisionPacket copies the surface
// 1:1, that assertion fails only for an EMPTY menu or DUPLICATE action ids. This scans already-spent worlds (3H.1-D/F
// executed and rejected combos, plus the 288 development worlds): generation + public view only, no policy, no truth.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { isTerminal } from '../src/forge/kernel.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { writeExclusive } from '../stage3h-ascii-competence-v1/guard.mjs';
import { LANE, GA } from './inherit.mjs';
const combos = [];
for (const d of ['stage3h1d-development', 'stage3h1f-development']) for (const pop of readdirSync(resolve(GA, d, 'results'))) {
  const p = resolve(GA, d, 'results', pop); if (!statSync(p).isDirectory()) continue;
  const r = JSON.parse(readFileSync(resolve(p, 'rows.json'), 'utf8')), s = JSON.parse(readFileSync(resolve(p, 'summary.json'), 'utf8'));
  for (const x of [...(Array.isArray(r) ? r : r.rows).map((y) => y.combo), ...s.rejections.map((y) => y.combo)]) combos.push({ source: d + '/' + pop, ...x });
}
for (const c of openCombos()) combos.push({ source: 'stage3h-canonical-v1/OPEN', ...c });
const t = { scanned: 0, empty: 0, duplicate: 0, terminalAfterWarmup: 0, taskLost: 0, examples: [], byPopulation: {} };
for (const c of combos) {
  const { source, panel, ...axes } = c, warm = runCalibratedWarmup(c.seed, (w) => generateScenarioSymmetricV1({ ...axes, warmupTicks: w })), world = warm.world;
  t.scanned++; if (isTerminal(world)) { t.terminalAfterWarmup++; continue; } if (!warm.taskPreserved) { t.taskLost++; continue; }
  const ids = observableView(world).surface.map((e) => e.actionId), bp = (t.byPopulation[source] ??= { scanned: 0, empty: 0, duplicate: 0 }); bp.scanned++;
  const empty = ids.length === 0, dup = new Set(ids).size !== ids.length;
  if (empty) { t.empty++; bp.empty++; } if (dup) { t.duplicate++; bp.duplicate++; }
  if ((empty || dup) && t.examples.length < 8) { const counts = {}; for (const id of ids) counts[id] = (counts[id] ?? 0) + 1; t.examples.push({ source, cell: [axes.shape, axes.roles, axes.objectives, axes.horizonBand, axes.level].join('/'), empty, duplicatedIds: Object.entries(counts).filter(([, n]) => n > 1).map(([id, n]) => id.slice(0, 24) + ' x' + n), menuSize: ids.length }); }
}
const verdict = t.empty + t.duplicate > 0 ? 'DEFECT_CLASS_REPRODUCED_ON_SPENT_WORLDS' : 'NOT_REPRODUCED_ON_SPENT_WORLDS';
writeExclusive(resolve(LANE, 'evidence/execution-0364164c/abort-diagnosis.json'), { schema: 'STAGE3H_EXECUTION_ABORT_DIAGNOSIS_V1', registration: '0364164cb05e140da6265c89d830388b84dafed7ef5f3abf47ad6afb2833b01f', abortedReplication: 'A', error: 'NATIVE_MENU_MISMATCH (connector.mjs nativeLock, original world, before any truth)', possibleCauses: ['empty offered menu', 'duplicate action ids in the offered surface'], scan: t, verdict, registeredWorldsRegenerated: 0, authority: 'R0' });
console.log(JSON.stringify({ verdict, scanned: t.scanned, empty: t.empty, duplicate: t.duplicate, terminal: t.terminalAfterWarmup, taskLost: t.taskLost, examples: t.examples, byPopulation: Object.fromEntries(Object.entries(t.byPopulation).filter(([, v]) => v.empty + v.duplicate > 0)) }, null, 1));
