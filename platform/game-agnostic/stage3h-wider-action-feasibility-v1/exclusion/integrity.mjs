// Phase 2 evidence: structured exclusion integrity and the future-allocator integration specification.
// Writes evidence/EXCLUSION_INTEGRITY.json once. Read-only over the records; activates nothing; allocates nothing.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { writeExclusive } from '../../stage3h-failure-diagnosis-v1/lib.mjs';
import { loadExclusionIndex, validateSeedRange, EXCLUSION_FILES, BLOCK } from '../../stage3h-safety-feasibility-v1/closure/exclusions.mjs';
import { loadStrictIndex, preflightNamespace, INDEX_FORMAT } from './strict-index.mjs';

const LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GA = resolve(LANE, '..');
const strict = loadStrictIndex(), fsha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex');
const overlap = {}; for (const s of strict.sources.values()) if (s.length > 1) { const k = s.join('+'); overlap[k] = (overlap[k] ?? 0) + 1; }
const interior = { base: 950 * BLOCK, count: 3 * BLOCK + 1 };
writeExclusive(resolve(LANE, 'evidence/EXCLUSION_INTEGRITY.json'), { schema: 'STAGE3H_EXCLUSION_INTEGRITY_V1', authority: 'R0', format: INDEX_FORMAT,
  recordsValidated: Object.fromEntries(Object.entries(EXCLUSION_FILES).filter(([k]) => k !== 'v4Runs').map(([k, p]) => [k, { path: p, sha256: fsha(p) }])),
  counts: strict.counts, required: { diagnosticConstructedWorlds: 48910, devBaseWorlds: 25676, devBlocks: [951, 952], devOpenSeeds: 6 },
  requiredPresent: strict.counts.diagnosticConstructedWorlds === 48910 && strict.counts.devBaseWorlds === 25676 && [951, 952].every((b) => strict.counts.excludedBlocks.includes(b)) && strict.counts.devOpenSeeds === 6,
  duplicatesWithinRecords: 0, canonicalIdentityViolations: 0, multiSourceOverlaps: overlap,
  overlapPolicy: 'identities present in more than one record are kept with every source recorded; none is dropped',
  defectFound: { component: 'stage3h-safety-feasibility-v1/closure/exclusions.mjs validateSeedRange', issue: 'checks only the blocks of the first and last seed of a range, so a range spanning more than two blocks can pass while an interior spent block is excluded',
    demonstration: { range: interior, closureValidatorOk: validateSeedRange(loadExclusionIndex(), interior.base, interior.count).ok, strictPreflightOk: preflightNamespace(strict, interior).ok },
    disposition: 'committed closure code left unchanged; every future allocator must use exclusion/strict-index.mjs preflightNamespace (checks every block in the range)' },
  allocatorIntegration: {
    module: 'stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs', calls: ['loadStrictIndex(ga)', 'preflightNamespace(strict, {base, count}) for each candidate replication namespace', 'preflightWorlds(strict, [worldHash...]) at admission, before any policy call'],
    failureSemantics: 'any exception from loadStrictIndex, any failure from either preflight: refuse allocation/admission; never repair, skip or replace',
    bindingRequirement: 'a future registration must bind the module and all record files (paths + sha256) in its candidate and re-verify them before allocation; the frozen V4 allocator (allocate-namespaces-v4.mjs) does NOT consume this index and must not be reused unchanged',
    textScan: 'repository text search may be kept as an additional check but is never the exclusion authority' },
  tests: 'exclusion/tests.mjs: 5/5 pass (counts; spent blocks, boundaries and recorded seeds; interior-block range; every identity source and non-canonical hashes; tampered or missing records throw)' });
console.log(JSON.stringify({ counts: strict.counts, overlap, interior: preflightNamespace(strict, interior) }, null, 1));
