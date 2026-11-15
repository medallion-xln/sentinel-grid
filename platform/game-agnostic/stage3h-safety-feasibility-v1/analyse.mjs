// Phase 3-4 aggregation of the contradiction search. Usage (from this lane): node analyse.mjs
// Writes evidence/feasibility.json once. Twin world hashes are checked against the structured exclusion records.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { candidates, DRAWS } from './search.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), GA = resolve(LANE, '..');
const rows = readdirSync(resolve(LANE, 'search')).filter((f) => f.endsWith('.jsonl')).sort().flatMap((f) => readFileSync(resolve(LANE, 'search', f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
const count = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
const expected = candidates().length;
const ids = JSON.parse(readFileSync(resolve(GA, 'stage3h-failure-diagnosis-v1/evidence/reproducibility/DEV_WORLD_IDENTITIES.json'), 'utf8'));
const prior = new Set(JSON.parse(readFileSync(resolve(GA, 'stage3h-owner-governed-v1/evidence/prior-world-exclusions.json'), 'utf8')).priorWorldHashes);
const v4 = new Set(); const runs = resolve(GA, 'stage3h-owner-governed-v1/runs/7c41ba89c5c63489');
for (const r of ['A', 'B']) for (const f of readdirSync(resolve(runs, r)).filter((n) => n.endsWith('.ledger.json'))) for (const e of JSON.parse(readFileSync(resolve(runs, r, f), 'utf8'))) v4.add(e.worldHash);
const dev = new Set(Object.values(ids.sets).flatMap((s) => s.worldByIdx));
const twinHashes = rows.flatMap((r) => (r.equivalentHashes ?? []).filter((h) => h !== r.worldHash));
const witnesses = rows.filter((r) => r.status === 'WITNESS');
const margin = (w) => Math.min(w.nIntroducesVsB.regretN - 100, 100 - w.nIntroducesVsB.regretB, w.bIntroducesVsN.regretB - 100, 100 - w.bIntroducesVsN.regretN);
const fieldsOf = (spec) => [...new Set(spec.map((s) => s.field))].sort().join('+') || 'NONE(BASE)';
const out = { schema: 'STAGE3H_SAFETY_FEASIBILITY_SEARCH_SUMMARY_V1', authority: 'R0', drawsPerClass: DRAWS,
  candidates: { expected, searched: rows.length, complete: rows.length === expected, byReason: count(rows.map((r) => r.reason)), bySet: count(rows.map((r) => r.set)) },
  statuses: count(rows.map((r) => r.status)),
  statusByReason: Object.fromEntries(['INTRO', 'INTRO_AND_NEAR', 'NEAR_THRESHOLD'].map((k) => [k, count(rows.filter((r) => r.reason === k).map((r) => r.status))])),
  twins: { built: rows.reduce((a, r) => a + (r.familySize ?? 0), 0), publicEquivalent: rows.reduce((a, r) => a + (r.equivalentTwins ?? 0), 0), notEquivalent: rows.reduce((a, r) => a + (r.notEquivalent ?? 0), 0),
    rejected: rows.reduce((m, r) => { for (const [k, v] of Object.entries(r.rejected ?? {})) m[k] = (m[k] ?? 0) + v; return m; }, {}), baseOutsideSupportModel: rows.filter((r) => r.status === 'BASE_OUTSIDE_SUPPORT_MODEL').length },
  twinWorldIdentity: { twinHashes: twinHashes.length, inPriorExclusions: twinHashes.filter((h) => prior.has(h)).length, inV4Ledgers: twinHashes.filter((h) => v4.has(h)).length, inDevIdentities: twinHashes.filter((h) => dev.has(h)).length,
    note: 'twins are DEV constructs from spent DEV seeds (blocks 951/952, DEV288); none is a prior, sealed or registered world' },
  witnesses: { classes: witnesses.length, byPopulationCell: witnesses.map((r) => ({ set: r.set, idx: r.idx, cell: r.cell, margin: margin(r.witness),
      w1Fields: fieldsOf(r.witness.nIntroducesVsB.spec), w2Fields: fieldsOf(r.witness.bIntroducesVsN.spec), w1: [r.witness.nIntroducesVsB.regretB, r.witness.nIntroducesVsB.regretN], w2: [r.witness.bIntroducesVsN.regretB, r.witness.bIntroducesVsN.regretN] })),
    marginAtLeast: Object.fromEntries([0, 1, 5, 10, 20].map((m) => [m, witnesses.filter((r) => margin(r.witness) >= m).length])) },
  oneSided: { classes: rows.filter((r) => r.status === 'ONE_SIDED').length, onlyBIntroducesVsN: rows.filter((r) => r.status === 'ONE_SIDED' && r.worldsWhereBIntroducesVsN > 0).length, onlyNIntroducesVsB: rows.filter((r) => r.status === 'ONE_SIDED' && r.worldsWhereNIntroducesVsB > 0).length },
  classesWhereSomeTwoArmMemberIsSafeOnTheWholeFamily: rows.filter((r) => r.classVerdict?.anyClassMemberSafe).length };
writeExclusive(resolve(LANE, 'evidence/feasibility.json'), out);
console.log(JSON.stringify({ ...out, witnesses: { classes: out.witnesses.classes, marginAtLeast: out.witnesses.marginAtLeast } }, null, 1));
