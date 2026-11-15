// Successor preparation, Phase 5 (development-only; consumes and regenerates NO registered world). Runs the frozen
// predecessor connector (connector-v3, registration 0364164c) and the successor connector (connector-v4) on every
// already-spent world of one source and compares them: an accepted world must give the identical row and ledger
// (wall-clock row.compute.elapsedMs excluded, as in the registered replay rule), a V3 rejection the identical
// rejection, and the only permitted difference is V3 NATIVE_MENU_MISMATCH -> V4 NATIVE_MENU_INVALID. It also checks
// the frozen R/B/N identities (H0: R = N, H2: R = B), provenance and the O-2R.1 nuisance modes on every V4 row.
// Output: equality flags and row hashes only; no metric, regret or outcome summary is computed or written.
// A V3/V4 pair that throws the frozen 1,000 ms lock assertion is re-run (up to 2 more times) and the retry is recorded.
// Usage: node successor-parity.mjs <part> [dry]   part = CONFIRM_A|CONFIRM_B|IN_DISTRIBUTION_CONTROL|OOD_LEVEL|OOD_ROLES|OOD_OBJECTIVES|OOD_SHAPES|OPEN
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { stableStringify, sha256 } from '../src/core/determinism.js';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { nativeRowV3 } from './connector-v3.mjs';
import { nativeRowV4 } from './connector-v4.mjs';
import { PROVENANCE } from './connector.mjs';
import { IDENTITY_VIEW_V2_ID } from './identity-view-v2.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const PARTS = { CONFIRM_A: 'stage3h1d-development', CONFIRM_B: 'stage3h1d-development', IN_DISTRIBUTION_CONTROL: 'stage3h1f-development', OOD_LEVEL: 'stage3h1f-development', OOD_ROLES: 'stage3h1f-development', OOD_OBJECTIVES: 'stage3h1f-development', OOD_SHAPES: 'stage3h1f-development', OPEN: null };
const [part, dry] = process.argv.slice(2);
if (!Object.hasOwn(PARTS, part)) throw Error('USAGE: successor-parity.mjs <part> [dry]');
const J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8'));
let combos;
if (part === 'OPEN') combos = openCombos().map(({ panel, ...c }) => c);
else { const r = J(`${PARTS[part]}/results/${part}/rows.json`), s = J(`${PARTS[part]}/results/${part}/summary.json`); combos = [...(Array.isArray(r) ? r : r.rows).map((y) => y.combo), ...s.rejections.map((y) => y.combo)].map(({ panel, ...c }) => c); }
if (dry === 'dry') combos = combos.filter((_, i) => i % 100 === 0);

const strip = (row) => ({ ...row, compute: { ...row.compute, elapsedMs: null } });
const NUISANCE_MODES = { D4: 'NATIVE_WORLD_ORIENTATION', IDENTITY: IDENTITY_VIEW_V2_ID, ORDER: 'OBSERVATION_ONLY' };
const run = (fn, combo) => { try { const r = fn(combo, { seen: new Set() }); return r.rejected ? { kind: 'REJECTED', rejected: r.rejected } : { kind: 'ROW', row: r.row, ledger: r.ledger }; } catch (e) { return { kind: 'THREW', error: e.message }; } };
const TIMING = 'COMPUTE_LIMIT_OR_SOURCE_MISMATCH';

const records = [], t0 = Date.now();
for (const c of combos) {
  const cell = [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/'), combo = { population: 'SPENT_' + part, cell, ...c };
  let a, b, retries = 0;
  for (;;) { a = run(nativeRowV3, combo); b = run(nativeRowV4, combo); if ((a.error === TIMING || b.error === TIMING) && retries < 2) { retries++; continue; } break; }
  let relation, equal;
  if (a.kind === 'ROW') { relation = 'ACCEPTED'; equal = b.kind === 'ROW' && isDeepStrictEqual(strip(a.row), strip(b.row)) && isDeepStrictEqual(a.ledger, b.ledger); }
  else if (a.kind === 'REJECTED') { relation = 'V3_REJECTED:' + a.rejected.reason; equal = b.kind === 'REJECTED' && isDeepStrictEqual(a.rejected, b.rejected); }
  else if (a.error === 'NATIVE_MENU_MISMATCH') { relation = 'V3_MENU_ABORT'; equal = b.kind === 'REJECTED' && b.rejected.reason === 'NATIVE_MENU_INVALID'; }
  else { relation = 'V3_THREW:' + a.error; equal = b.kind === 'THREW' && b.error === a.error; }
  const row = b.kind === 'ROW' ? b.row : null, sel = row?.selections;
  const identities = row ? { armKeys: isDeepStrictEqual(Object.keys(sel).sort(), ['B', 'N', 'R']), rule: row.band === 'H0' ? isDeepStrictEqual(sel.R, sel.N) : row.band === 'H2' ? isDeepStrictEqual(sel.R, sel.B) : false,
    provenance: row.provenance === PROVENANCE, nuisanceModes: isDeepStrictEqual(row.nuisanceModes, NUISANCE_MODES), nuisanceValuesPresent: row.nuisance !== null && typeof row.nuisance === 'object' } : null;
  records.push({ seed: c.seed, cell, relation, v4: b.kind === 'ROW' ? 'ROW' : b.kind === 'REJECTED' ? 'REJECTED:' + b.rejected.reason + (b.rejected.cause ? '/' + b.rejected.cause : '') : 'THREW:' + b.error,
    equal, retries, identities, worldHash: row ? b.ledger.worldHash : null, rowSha256: row ? sha256(stableStringify(strip(row))) : null });
}
const count = (f) => records.filter(f).length, rel = {};
for (const r of records) rel[r.relation] = (rel[r.relation] ?? 0) + 1;
const out = {
  schema: 'STAGE3H_SUCCESSOR_CONNECTOR_PARITY_V1', part, source: PARTS[part] ? PARTS[part] + '/results/' + part : 'stage3h-canonical-v1/OPEN', worlds: records.length, wallMs: Date.now() - t0,
  relations: rel, unequal: records.filter((r) => !r.equal), accepted: count((r) => r.relation === 'ACCEPTED'), acceptedEqual: count((r) => r.relation === 'ACCEPTED' && r.equal),
  identityFailures: records.filter((r) => r.identities && !Object.values(r.identities).every(Boolean)), retriedPairs: count((r) => r.retries > 0), timingFailuresAfterRetry: count((r) => r.relation === 'V3_THREW:' + TIMING || r.v4 === 'THREW:' + TIMING),
  recordsSha256: sha256(stableStringify(records)), records, outcomeSummariesComputed: false, registeredWorldsGenerated: 0, authority: 'R0',
};
out.verdict = out.unequal.length === 0 && out.identityFailures.length === 0 && out.timingFailuresAfterRetry === 0 ? 'PARITY_EXACT' : 'PARITY_FAILURE';
console.log(JSON.stringify({ part, worlds: out.worlds, wallMs: out.wallMs, relations: rel, acceptedEqual: out.acceptedEqual + '/' + out.accepted, unequal: out.unequal.length, identityFailures: out.identityFailures.length, retriedPairs: out.retriedPairs, timingFailuresAfterRetry: out.timingFailuresAfterRetry, verdict: out.verdict }));
if (dry !== 'dry') {
  assertSoleWriter(); verifyOwnerLane();
  if (!existsSync(resolve(LANE, 'evidence/successor-v4/parity'))) mkdirSync(resolve(LANE, 'evidence/successor-v4/parity'));
  writeExclusive(resolve(LANE, 'evidence/successor-v4/parity', part + '.json'), out);
}
