// Closure Phase 7: source/archive manifest and correction records. Usage: node closure/manifest.mjs
// Writes evidence/closure/SOURCE_AND_ARCHIVE_MANIFEST.json and evidence/closure/CORRECTIONS.json once.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeExclusive } from '../../stage3h-failure-diagnosis-v1/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), ROOT = resolve(GA, '../..');
const fsha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = resolve(d, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const tracked = new Set(git(['ls-files', '--', relative(ROOT, LANE)]).split('\n').filter(Boolean));

// lane files and the external modules the lane's scripts import (static, transitive through relative imports)
const laneFiles = walk(LANE).filter((p) => !relative(LANE, p).startsWith('work/')).map((p) => ({ path: relative(LANE, p), sha256: fsha(p), bytes: statSync(p).size, trackedAtHead: tracked.has(relative(ROOT, p)) })).sort((a, b) => a.path.localeCompare(b.path));
const seen = new Set(), queue = laneFiles.filter((f) => f.path.endsWith('.mjs')).map((f) => resolve(LANE, f.path));
while (queue.length) { const p = queue.pop(); if (seen.has(p)) continue; seen.add(p);
  for (const m of readFileSync(p, 'utf8').matchAll(/(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g)) { const q = resolve(dirname(p), m[1]); if (existsSync(q)) queue.push(q); } }
const external = [...seen].filter((p) => !p.startsWith(LANE + '/')).map((p) => ({ path: relative(GA, p), sha256: fsha(p), trackedAtHead: git(['ls-files', '--', relative(ROOT, p)]) !== '' })).sort((a, b) => a.path.localeCompare(b.path));
const workDir = resolve(LANE, 'work/ledger'), work = existsSync(workDir) ? readdirSync(workDir).sort().map((n) => ({ path: 'work/ledger/' + n, sha256: fsha(resolve(workDir, n)) })) : [];
writeExclusive(resolve(LANE, 'evidence/closure/SOURCE_AND_ARCHIVE_MANIFEST.json'), { schema: 'STAGE3H_SAFETY_CLOSURE_MANIFEST_V1', authority: 'R0', head: git(['rev-parse', 'HEAD']),
  laneFiles, externalModules: { count: external.length, allTracked: external.every((e) => e.trackedAtHead), files: external },
  rawEvidence: { search: 'search/shard-*-of-10.jsonl, committed by the owner in 8749fd44 (all twin-world identities of EQUIVALENT members; 1.9 MB)', logs: 'logs/search-*.log, committed in 8749fd44',
    rebuiltLedgerShards: { location: 'work/ledger (gitignored; deterministic rebuild by closure/ledger.mjs)', files: work, mergedInto: 'evidence/closure/DIAGNOSTIC_WORLD_EXCLUSIONS.json' },
    devRunsArchive: 'stage3h-failure-diagnosis-v1/archive/dev-runs-38f7c1d6.tar.gz (gitignored; sha256 in that lane evidence/reproducibility/ARCHIVE_VERIFICATION.json; same disk, not an independent copy)' },
  protectedSourceCustody: 'This lane commits no protected-source bytes. The 30 protected package files became tracked in the owner commit 8749fd44 (bytes equal their bound hashes; evidence/closure/inheritance.json).' });

writeExclusive(resolve(LANE, 'evidence/closure/CORRECTIONS.json'), { schema: 'STAGE3H_SAFETY_CLOSURE_CORRECTIONS_V1', authority: 'R0', records: [
  { id: 'C1', artifact: 'evidence/assumption-check.json', error: 'The first version reported classesWithRobustSafeActionOutsideArms = 0 because the aggregate read a misnamed field (robustSafeActionOutsideArms instead of robustSafeActionOutsideArmsExists).',
    correction: 'assumption-check.mjs fixed; file regenerated; per-class data identical; corrected value 9.', preservation: 'The erroneous file was deleted before any commit and its bytes were NOT preserved. Its only difference from the committed file is that aggregate value (0 instead of 9). This record replaces it.', impact: 'none on conclusions; RESULT.md reports the corrected value' },
  { id: 'C2', artifact: 'RESULT.md (feasibility study)', error: 'States "The lane is not committed."', correction: 'Superseded: the owner commit 8749fd44 committed the whole lane. RESULT.md is left unedited as the original record.', impact: 'none on conclusions' },
  { id: 'C3', artifact: 'RESULT.md and earlier summaries', error: 'Reported "22,022 twin worlds".', correction: '22,022 is the number of publicly equivalent twin RECORDS that differ from their base (22,024 equivalent records, 2 reproduce the base). Distinct equivalent non-base worlds: 21,998. All constructed twin records: 25,212 (22,024 equivalent + 3,188 not equivalent), 25,186 distinct non-base worlds; all are in DIAGNOSTIC_WORLD_EXCLUSIONS.json.', impact: 'counts only' },
  { id: 'C4', artifact: 'evidence/closure/ADMISSIBILITY.json perWitness FRESH_CHECK 1655 labelsReproduce=false', error: 'The audit compares the frozen metrics.mjs score().regret (mean over a selected set) with the search record\'s max-over-set regret; S0 returned the 2-action set {3,5} there.', correction: 'Introduction flags reproduce exactly in both worlds (w1: choosing N introduces vs B; w2: choosing B introduces vs N); max-over-set regrets 184/146 match the search record, means are 111/73. For the 9 valid witnesses every selection is a single action and both summaries coincide. 1655 remains invalid because member 5 of the S0 set is non-catastrophic in both worlds (regret 38 and 0).', impact: 'none; the invalid witness is excluded either way' },
] });
console.log(JSON.stringify({ laneFiles: laneFiles.length, externalModules: external.length, externalAllTracked: external.every((e) => e.trackedAtHead), work: work.length }, null, 1));
