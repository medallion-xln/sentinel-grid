// Closure Phase 2: the structured DIAGNOSTIC world-identity exclusion ledger. Usage: node closure/ledger-merge.mjs
// Merges the rebuilt safety-feasibility twin identities (work/ledger) and verifies them against the committed search
// records (every class's EQUIVALENT set must equal its committed equivalentHashes minus the base). Adds every other world
// the Stage 3H diagnosis line constructed (not merely observed): the failure-diagnosis hidden-health probe twins
// (h2-mechanism.mjs: one entity's health shifted, post-warm-up) and the D4-oriented DEV288 worlds (d4-contrast.mjs).
// DEV base worlds are referenced by hash of DEV_WORLD_IDENTITIES.json, not duplicated. Evaluator rollout states are not
// starting worlds and are not listed (as in every registered campaign). Writes evidence/closure/DIAGNOSTIC_WORLD_EXCLUSIONS.json.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { cloneWorld, hashWorld } from '../../src/forge/kernel.js';
import { ORIENTATIONS, orientWorld } from '../../src/forge-symmetric/orientation-symmetric-v1.js';
import { loadRows, comboOf } from '../../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { devWorld, writeExclusive } from '../../stage3h-failure-diagnosis-v1/lib.mjs';
import { worldsOf } from '../../stage3h-failure-diagnosis-v1/run-dev.mjs';
import { candidates } from '../search.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), ok = (v, m) => { if (!v) throw Error(m); };
const sha = (s) => createHash('sha256').update(s).digest('hex'), jsonl = (dir) => readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().flatMap((f) => readFileSync(resolve(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));

// --- 1. safety-feasibility twins, verified against the committed search records
const rebuilt = jsonl(resolve(LANE, 'work/ledger')), search = jsonl(resolve(LANE, 'search'));
ok(rebuilt.length === candidates().length && search.length === rebuilt.length, 'CLASS_COUNT');
const bySearch = new Map(search.map((r) => [r.set + '/' + r.idx, r]));
let mismatchedClasses = 0; const status = {};
for (const c of rebuilt) {
  const s = bySearch.get(c.set + '/' + c.idx), eq = c.worlds.filter((w) => w[2] === 'EQUIVALENT').map((w) => w[1]);
  for (const w of c.worlds) status[w[2]] = (status[w[2]] ?? 0) + 1;
  const committed = s.equivalentHashes.filter((h, i) => i > 0); // index 0 is the base world
  if (s.worldHash !== c.baseWorldHash || s.familySize !== c.familySize || JSON.stringify(eq) !== JSON.stringify(committed)) mismatchedClasses++;
}
ok(mismatchedClasses === 0, 'REBUILD_DOES_NOT_MATCH_COMMITTED_SEARCH:' + mismatchedClasses);
const twinHashes = [...new Set(rebuilt.flatMap((c) => c.worlds.filter((w) => w[1] && w[1] !== c.baseWorldHash).map((w) => w[1])))].sort();

// --- 2. failure-diagnosis hidden-health probe twins (h2-mechanism.mjs hiddenTwins: constructed whatever their equivalence)
const probeHashes = new Set(); let probes = 0;
for (const set of ['DEV288', 'FRESH_EXPLORE', 'FRESH_CHECK']) {
  const ev = JSON.parse(readFileSync(resolve(GA, `stage3h-failure-diagnosis-v1/evidence/h2-mechanism-${set}.json`), 'utf8')), rows = new Map(loadRows(set).map((r) => [r.idx, r]));
  for (const p of ['INTRO', 'REVERSE', 'CONTROL'].flatMap((k) => ev.probes[k])) {
    const w = devWorld(comboOf(rows.get(p.idx))); ok(!w.rejected, 'PROBE_REGEN'); probes++;
    for (const e of w.world.entities) {
      if (e.type === 'ACTOR' || e.type === 'CIVILIAN' || !(e.health > 0)) continue;
      for (const d of [-20, -10, -5, 5, 10, 20]) { const h = e.health + d; if (h < 1 || h > 100) continue; const tw = cloneWorld(w.world); tw.entities.find((x) => x.id === e.id).health = h; probeHashes.add(hashWorld(tw)); }
    }
  }
}
// --- 3. D4-oriented DEV288 worlds (d4-contrast.mjs)
const d4 = new Set(); let d4Worlds = 0;
for (const c of worldsOf('DEV288')) { const w = devWorld(c); if (w.rejected) continue; d4Worlds++; for (const t of ORIENTATIONS) d4.add(hashWorld(orientWorld(t, w.world))); }
// --- 4. reference to DEV base worlds
const idsPath = resolve(GA, 'stage3h-failure-diagnosis-v1/evidence/reproducibility/DEV_WORLD_IDENTITIES.json'), ids = JSON.parse(readFileSync(idsPath, 'utf8'));
const devBase = new Set(Object.values(ids.sets).flatMap((s) => s.worldByIdx.filter((x) => !x.startsWith('REJECTED:'))));
const constructed = [...new Set([...twinHashes, ...probeHashes, ...d4])].filter((h) => !devBase.has(h)).sort();
const ledger = { schema: 'STAGE3H_DIAGNOSTIC_WORLD_EXCLUSIONS_V1', authority: 'R0', status: 'SPENT_DIAGNOSTIC',
  rule: 'Every world identity listed here, every DEV base world in DEV_WORLD_IDENTITIES.json, every seed in blocks 951 and 952 (whole blocks) and the six OPEN development seeds is PERMANENTLY EXCLUDED from every future confirmatory population. Consumed by closure/exclusions.mjs.',
  seedExclusions: { wholeBlocks: [951, 952], devOpenSeeds: ids.devOpenSeeds, source: 'stage3h-failure-diagnosis-v1/evidence/reproducibility/DEV_WORLD_IDENTITIES.json' },
  devBaseWorlds: { file: 'stage3h-failure-diagnosis-v1/evidence/reproducibility/DEV_WORLD_IDENTITIES.json', sha256: sha(readFileSync(idsPath)), worlds: devBase.size },
  sources: {
    SAFETY_FEASIBILITY_TWINS: { classes: rebuilt.length, constructed: rebuilt.reduce((a, c) => a + c.familySize, 0), byStatus: status, distinctNonBaseHashes: twinHashes.length,
      verifiedAgainstCommittedSearch: true, note: 'rebuilt deterministically (twins.mjs/twinFamily, 40 draws); EQUIVALENT sets equal the committed search records class by class' },
    DIAGNOSIS_HIDDEN_HEALTH_PROBE_TWINS: { probeWorlds: probes, distinctHashes: probeHashes.size, constructor: 'stage3h-failure-diagnosis-v1/h2-mechanism.mjs hiddenTwins (one non-civilian, non-actor entity health +-5/10/20, post-warm-up)' },
    DIAGNOSIS_D4_ORIENTATIONS: { baseWorlds: d4Worlds, distinctHashes: d4.size, constructor: 'stage3h-failure-diagnosis-v1/d4-contrast.mjs orientWorld x 8' },
  },
  excludedEvaluatorRollouts: 'states visited inside evaluator rollouts are not starting worlds and are not listed (same convention as the registered campaigns)',
  constructedWorldHashes: constructed, constructedWorldHashesSha256: sha(JSON.stringify(constructed)) };
writeExclusive(resolve(LANE, 'evidence/closure/DIAGNOSTIC_WORLD_EXCLUSIONS.json'), ledger);
console.log(JSON.stringify({ ...ledger, constructedWorldHashes: constructed.length }, null, 1));
