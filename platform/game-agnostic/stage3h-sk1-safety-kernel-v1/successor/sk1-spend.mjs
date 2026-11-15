// SK1 spend ledger. After the one-pass run, records what SK1 itself consumed so that no later stage can treat it as
// fresh: the screened blocks, the two frozen populations, and the admitted-but-unselected screening identities (sealed
// under opaque aliases). Read-only on existing files; no seed, schedule index or world hash is written to a tracked file.
//   /opt/homebrew/bin/node successor/sk1-spend.mjs [--write]
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sealRegistry, loadRegistry } from '../../stage3h-hw1-dev-v1/i2-registry.mjs';
import { loadAllocation } from '../infra/allocator.mjs';
import { buildPool } from '../infra/pool.mjs';
import { SCREEN_DIR } from '../infra/screen.mjs';
import { manifestPath, registryPath, RESULT_FILE } from '../infra/population.mjs';
import { LANE, EVIDENCE, sha, fileSha, readJ, fail, writeExclusive, exists } from '../infra/common.mjs';

if (!exists(RESULT_FILE)) fail('RUN_THE_VALIDATION_FIRST');
const alloc = loadAllocation(), pool = buildPool(), screened = pool.blocksScreened, reserve = alloc.blocks.filter((b) => !screened.includes(b));
const selected = new Set(['EXPLORATION', 'VALIDATION'].flatMap((p) => readJ(manifestPath(p)).classes.map((c) => c.worldHash)));
const admitted = readdirSync(SCREEN_DIR).sort().flatMap((n) => readJ(resolve(SCREEN_DIR, n)).admitted), byHash = new Map(admitted.map((a) => [a.worldHash, a]));
const unused = [...byHash.values()].filter((a) => !selected.has(a.worldHash)).sort((x, y) => (sha(x.worldHash) < sha(y.worldHash) ? -1 : 1));
const reg = sealRegistry('SK1_SCREENED_UNUSED', unused.map((a, i) => ({ id: `SK1U-${String(i + 1).padStart(4, '0')}`, source: 'SK1_SCREENED_UNUSED', fine: a.fine, coarse: a.coarse })));
const REG_FILE = resolve(EVIDENCE, 'SK1_REGISTRY_SCREENED_UNUSED.json'), res = readJ(RESULT_FILE);
const ledger = { schema: 'SK1_SPEND_LEDGER_V1', authority: 'R0', stage: 'STAGE3H-SK1', labels: ['NO_SEED_IDENTITIES', 'OPAQUE_ALIASES'], generatedAt: new Date().toISOString(), allocationHash: alloc.hash,
  blocks: { screenedAndSpent: screened, reserveNeverGenerated: reserve, rejectedAtPreflight: [813] },
  statuses: { ...Object.fromEntries(screened.map((b) => [b, 'SPENT_SK1_SCREENED'])), ...Object.fromEntries(reserve.map((b) => [b, 'RETIRED_SK1_RESERVE_NEVER_GENERATED'])), 813: 'REPOSITORY_TEXT_HIT' },
  screening: { worldsScreened: pool.worldsScreened, admittedIdentities: byHash.size, selectedForPopulations: selected.size, admittedButUnselected: unused.length, funnelCounts: pool.funnel, dropped: pool.dropped },
  populations: { EXPLORATION: { classes: readJ(manifestPath('EXPLORATION')).classCount, use: 'SPENT_FOR_DEVELOPMENT', registry: 'evidence/SK1_REGISTRY_EXPLORATION.json', registrySha256: fileSha(registryPath('EXPLORATION')) },
    VALIDATION: { classes: readJ(manifestPath('VALIDATION')).classCount, use: 'SPENT_ONE_PASS_VALIDATION', evaluatedOnce: res.evaluatedOnce === true, resultSha256: fileSha(RESULT_FILE), registry: 'evidence/SK1_REGISTRY_VALIDATION.json', registrySha256: fileSha(registryPath('VALIDATION')) } },
  unusedRegistry: { file: 'evidence/SK1_REGISTRY_SCREENED_UNUSED.json', seal: reg.seal, count: reg.count },
  rules: ['Every world screened by SK1 is spent observational evidence: its comparator outcomes were read by the screening rule. None is fresh, whether or not it was selected or evaluated.', 'The VALIDATION population has been evaluated once and may not be used for selection, tuning or a second evaluation of any candidate.',
    'Screened-but-not-admitted worlds are protected at block level only; the listed blocks must stay forbidden.', 'The unscreened reserve is retired with this lane to avoid a later allocated-but-unused ambiguity.'],
  enforcement: { loader: 'successor/exclusions-v2.mjs loadSuccessorExclusions()', note: 'The SK1 exclusion registry (infra/exclusion-registry.json) is hash-bound by the experiment freeze and is not edited. A later allocator must obtain its context from the successor loader, which adds these blocks and the three SK1 registries and fails closed.' } };
console.log(JSON.stringify({ screened: screened.length, reserve, worlds: pool.worldsScreened, admitted: byHash.size, selected: selected.size, unused: unused.length, seal: reg.seal }, null, 0));
if (process.argv.includes('--write')) { writeExclusive(REG_FILE, reg); loadRegistry(REG_FILE); ledger.unusedRegistry.sha256 = fileSha(REG_FILE); writeExclusive(resolve(EVIDENCE, 'SK1_SPEND_LEDGER.json'), ledger); console.log('written evidence/SK1_REGISTRY_SCREENED_UNUSED.json, evidence/SK1_SPEND_LEDGER.json'); }
