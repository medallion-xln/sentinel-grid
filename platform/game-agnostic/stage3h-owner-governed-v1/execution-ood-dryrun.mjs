// Pre-execution integrity dry run (development-only diagnostic; consumes no registered world). The registered connector
// was validated on in-distribution development worlds only. This runs the frozen connector-v3 row pipeline (with all
// nuisance twins) on one already-spent 3H.1-F world per OOD cell (seeds outside the registration; worlds in the 9,407
// exclusion set), recording every thrown integrity error. No outcome summary is computed. Writes one evidence file (wx).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeExclusive } from '../stage3h-ascii-competence-v1/guard.mjs';
import { nativeRowV3 } from './connector-v3.mjs';
import { LANE, GA } from './inherit.mjs';
const out = {};
for (const pop of ['OOD_LEVEL', 'OOD_ROLES', 'OOD_OBJECTIVES', 'OOD_SHAPES']) {
  const r = JSON.parse(readFileSync(resolve(GA, 'stage3h1f-development/results', pop, 'rows.json'), 'utf8')), rows = Array.isArray(r) ? r : r.rows;
  const s = JSON.parse(readFileSync(resolve(GA, 'stage3h1f-development/results', pop, 'summary.json'), 'utf8'));
  const key = (c) => [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/'), seen = new Map();
  for (const x of [...rows.map((y) => y.combo), ...s.rejections.map((y) => y.combo)]) if (!seen.has(key(x))) seen.set(key(x), x);
  const t = { cells: seen.size, rows: 0, rejected: 0, errors: {}, examples: [], msMax: 0 };
  for (const c of seen.values()) {
    const { panel, ...axes } = c, t0 = performance.now();
    try { const res = nativeRowV3({ population: 'DRYRUN_' + pop, cell: key(c), ...axes }, { seen: new Set() }); if (res.rejected) t.rejected++; else t.rows++; }
    catch (e) { t.errors[e.message] = (t.errors[e.message] ?? 0) + 1; if (t.examples.length < 3) t.examples.push({ cell: key(c), error: e.message }); }
    t.msMax = Math.max(t.msMax, performance.now() - t0);
  }
  out[pop] = t; console.error(pop, JSON.stringify(t));
}
const total = Object.values(out).reduce((n, t) => n + Object.values(t.errors).reduce((a, b) => a + b, 0), 0);
writeExclusive(resolve(LANE, 'evidence/execution-0364164c/ood-connector-dryrun.json'), { schema: 'STAGE3H_PRE_EXECUTION_OOD_CONNECTOR_DRYRUN_V1', registration: '0364164cb05e140da6265c89d830388b84dafed7ef5f3abf47ad6afb2833b01f', source: 'stage3h1f-development OOD combos (spent, excluded seeds)', populations: out, integrityErrors: total, verdict: total === 0 ? 'NO_CONNECTOR_ABORT_IN_ANY_OOD_CELL' : 'CONNECTOR_ABORTS_ON_OOD', registeredWorldsGenerated: 0, outcomeSummariesComputed: false, authority: 'R0' });
console.log(JSON.stringify({ integrityErrors: total, populations: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { cells: v.cells, rows: v.rows, rejected: v.rejected, errors: v.errors, msMax: Math.round(v.msMax) }])) }, null, 1));
