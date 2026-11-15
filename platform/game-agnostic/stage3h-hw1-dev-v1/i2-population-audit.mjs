// H-W1 I-2 population audit, run after BOTH populations are frozen. Reads manifests and sealed registries only (no class data, no validation outcome). It re-runs the real admission
// path on every frozen class, proves the populations are disjoint on every axis the contract names, checks the 5% origin-family cap, the freeze order (by file birth time), that no
// HOLDOUT world exists, and records the limitations that must travel with the populations.
//   node i2-population-audit.mjs [--write]   writes evidence/I2_POPULATION_AUDIT.json only if every gate passes
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { preflightWorlds } from '../stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs';
import { LANE, BLOCK, PER_BLOCK, FORBIDDEN_BLOCKS, loadAllocation, loadExclusions, admission } from './i2-allocator.mjs';
import { loadManifest, classDir } from './i2-population.mjs';
import { loadRegistry, registryIndex, matchPcd } from './i2-registry.mjs';
import { MINIMUM } from './i2-freeze.mjs';

const ev = (f) => resolve(LANE, 'evidence', f), sha = (b) => createHash('sha256').update(b).digest('hex'), file = (f) => sha(readFileSync(resolve(LANE, f)));
const gates = [], gate = (name, pass, detail) => gates.push({ name, pass: Boolean(pass), detail });
const alloc = loadAllocation(), ex = loadManifest('EXPLORATION'), va = loadManifest('VALIDATION'), pops = { EXPLORATION: ex, VALIDATION: va };
const exRegPath = ev('I2_REGISTRY_EXPLORATION.json'), vaRegPath = ev('I2_REGISTRY_VALIDATION.json'), exReg = loadRegistry(exRegPath), vaReg = loadRegistry(vaRegPath);
const exCtx = loadExclusions(), vaCtx = loadExclusions([exRegPath]), spentIdx = registryIndex([...exCtx.regs]);
const all = Object.entries(pops).flatMap(([p, m]) => m.classes.map((c) => ({ ...c, p })));

gate('MINIMUM_POPULATIONS_MET', ex.classCount >= MINIMUM.EXPLORATION && va.classCount >= MINIMUM.VALIDATION && ex.meetsMinimum && va.meetsMinimum, { exploration: ex.classCount, validation: va.classCount, minimum: MINIMUM });
gate('MANIFESTS_BIND_THE_FROZEN_ALLOCATION', ex.allocationHash === alloc.hash && va.allocationHash === alloc.hash, { allocationHash: alloc.hash });
const blocksOf = (m) => [...new Set(m.classes.map((c) => c.block))].sort((a, b) => a - b);
gate('SEED_BLOCKS_ARE_ALLOCATED_DISJOINT_AND_NOT_FORBIDDEN', blocksOf(ex).every((b) => alloc.populations.EXPLORATION.blocks.includes(b)) && blocksOf(va).every((b) => alloc.populations.VALIDATION.blocks.includes(b)) && !blocksOf(ex).some((b) => blocksOf(va).includes(b)) && ![...blocksOf(ex), ...blocksOf(va)].some((b) => FORBIDDEN_BLOCKS[b]), { exploration: blocksOf(ex), validation: blocksOf(va) });
gate('SEEDS_ARE_UNIQUE_AND_INSIDE_THEIR_BLOCK', new Set(all.map((c) => c.seed)).size === all.length && all.every((c) => Math.floor(c.seed / BLOCK) === c.block && c.seed % BLOCK < PER_BLOCK), { classes: all.length });
const strictFail = all.filter((c) => !preflightWorlds(exCtx.strict, [c.worldHash]).ok).length;
gate('BASE_WORLD_HASHES_ARE_UNIQUE_DISJOINT_AND_UNSPENT', new Set(all.map((c) => c.worldHash)).size === all.length && strictFail === 0, { distinct: new Set(all.map((c) => c.worldHash)).size, spentHits: strictFail });
const readmit = all.filter((c) => !admission(c.p === 'EXPLORATION' ? exCtx : vaCtx, c.worldHash, { fine: c.fine, coarse: c.coarse }).ok).length;
gate('EVERY_FROZEN_CLASS_PASSES_THE_REAL_ADMISSION_PATH_AGAIN', readmit === 0, { rejected: readmit });
const set = (m, k) => new Set(m.classes.map((c) => c[k])), inter = (a, b) => [...a].filter((x) => b.has(x)).length;
gate('PCD_DIGESTS_ARE_DISJOINT_ACROSS_POPULATIONS_AND_UNIQUE_WITHIN', inter(set(ex, 'coarse'), set(va, 'coarse')) === 0 && inter(set(ex, 'fine'), set(va, 'fine')) === 0 && set(ex, 'coarse').size === ex.classCount && set(va, 'coarse').size === va.classCount, { coarseOverlap: inter(set(ex, 'coarse'), set(va, 'coarse')), fineOverlap: inter(set(ex, 'fine'), set(va, 'fine')) });
const spentHits = all.filter((c) => matchPcd(spentIdx, { fine: c.fine, coarse: c.coarse }).length).length;
gate('NO_CLASS_MATCHES_THE_STUDIED_341_OR_ANY_DEV_H2_WORLD_BY_PCD', spentHits === 0, { classesChecked: all.length, matches: spentHits, registries: spentIdx.seals });
const famOf = (c) => c.cell.split('/').slice(0, 3).join('/'), share = (m) => { const f = new Map(); for (const c of m.classes) f.set(famOf(c), (f.get(famOf(c)) ?? 0) + 1); return { families: f.size, maxCount: Math.max(...f.values()), maxShare: Math.max(...f.values()) / m.classCount }; };
gate('ORIGIN_FAMILY_CAP_5_PERCENT_PER_POPULATION', share(ex).maxShare <= 0.05 && share(va).maxShare <= 0.05, { exploration: share(ex), validation: share(va) });
gate('NO_MEMBER_WORLD_IS_SHARED_BETWEEN_POPULATIONS', va.crossPopulation?.overlaps === 0 && va.crossPopulation.validationMemberWorlds > 0, va.crossPopulation);
gate('POPULATION_REGISTRIES_ARE_SEALED_AND_BIND_THE_MANIFESTS', exReg.count === ex.classCount && vaReg.count === va.classCount && exReg.seal === ex.registry.seal && vaReg.seal === va.registry.seal && sha(readFileSync(exRegPath)) === ex.registry.sha256 && sha(readFileSync(vaRegPath)) === va.registry.sha256, { exploration: exReg.seal, validation: vaReg.seal });
const screens = readdirSync(resolve(LANE, 'work/i2/screen')).filter((n) => /^(EXPLORATION|VALIDATION|HOLDOUT)-\d+-shard-/.test(n)), screenBlocks = (pop) => [...new Set(screens.filter((n) => n.startsWith(pop + '-')).map((n) => Number(n.split('-')[1])))];
gate('NO_HOLDOUT_WORLD_WAS_GENERATED', alloc.holdout.allocated === false && alloc.holdout.generated === 0 && !screens.some((n) => n.startsWith('HOLDOUT')) && !existsSync(classDir('HOLDOUT')) && screenBlocks('EXPLORATION').every((b) => alloc.populations.EXPLORATION.blocks.includes(b)) && screenBlocks('VALIDATION').every((b) => alloc.populations.VALIDATION.blocks.includes(b)), { exploration: screenBlocks('EXPLORATION'), validation: screenBlocks('VALIDATION') });
const born = (f) => statSync(f).birthtimeMs, exRegBorn = born(exRegPath), vaScreens = screens.filter((n) => n.startsWith('VALIDATION-')).map((n) => born(resolve(LANE, 'work/i2/screen', n)));
gate('EXPLORATION_WAS_REGISTERED_BEFORE_ANY_VALIDATION_WORLD_WAS_SCREENED', Date.parse(ex.frozenAt) < Date.parse(va.frozenAt) && vaScreens.length > 0 && vaScreens.every((t) => t > exRegBorn), { explorationRegistryCreated: new Date(exRegBorn).toISOString(), validationShardsChecked: vaScreens.length, earliestValidationShard: new Date(Math.min(...vaScreens)).toISOString() });
const locked = va.dataFiles.every((d) => (statSync(resolve(classDir('VALIDATION'), d.file)).mode & 0o777) === 0);
gate('VALIDATION_OUTCOME_FILES_ARE_PROCEDURALLY_LOCKED', locked, { files: va.dataFiles.length, note: 'mode 000; procedural only, the owner can chmod. loadPopulation throws unless HW1_PHASE=I5.' });
const bySource = {}; for (const tags of exCtx.strict.sources.values()) bySource[tags[0]] = (bySource[tags[0]] ?? 0) + 1;

const NOTES = {
  designLeak: 'Action-feature families and the arm-stress selection frame were chosen after observing the earlier offline oracle on the 341 spent classes. The populations are fresh, but the design is not blind to that evidence; any gain must be read as design-informed, not as an independent discovery.',
  notIndependentEvidence: 'The 341 studied public-observation classes are used here only as an exclusion set. They are not new independent evidence for any H-W1 claim.',
  selectionFrame: 'Both populations are selected by the arm-stress rule (hash 13a7ed68...): Nexus applies, B differs from N, and S0 introduces vs Nexus or both arms regrets lie in [40,160]. That rule reads comparator outcomes, so every population is conditioned on comparator behaviour. Results generalise only to this frame, the generator version, the rule hash and the seed namespace.',
  familyDefinition: 'Origin family = topology/resource-role/objective (first three parts of the schedule cell). It yields 91 families on the 341; adding the level part gives 150. The contract text mentions about 97; the discrepancy is recorded and the cap is applied on the coarser (stricter) three-part family.',
  coverage: 'World-hash exclusion covers all 109,082 recorded spent worlds and every spent seed and block. PCD (public-class) exclusion covers only what can be regenerated from unsealed material: the 12,844 admitted DEV H2 base worlds and the 341 studied classes. Sealed V4 worlds, prior-stage worlds and diagnostic-constructed worlds are excluded at world-hash and whole-seed-block level and were never regenerated, so a fresh world that is public-equivalent to one of them is not detectable here.',
  coarseDigestCost: 'The coarse PCD merges many worlds (12,844 DEV H2 worlds, 5,860 distinct coarse digests). Roughly 63% of scheduled H2 worlds were excluded for a coarse match before any outcome was computed, which is why many reserve blocks were needed.',
  overlayDependency: 'The comparators (S0 baseline, Nexus adapters) and the world plan live in an untracked local overlay and on retained refs. A clean clone of main cannot regenerate these populations or re-run the comparators. Reproducibility holds only on a checkout with the overlay.',
  proceduralLock: 'The validation outcome files are chmod 000 and gated by HW1_PHASE=I5. This guards against accidental use in I-3/I-4; it is not a cryptographic barrier.',
  sealNotSignature: 'Registry seals detect inconsistent edits; a writer who recomputes a seal can forge one. The seals are therefore also recorded in committed evidence.',
};
const out = { schema: 'STAGE3H_HW1_I2_POPULATION_AUDIT_V1', authority: 'R0', checkedAt: new Date().toISOString(), allocationHash: alloc.hash,
  populations: Object.fromEntries(Object.entries(pops).map(([p, m]) => [p, { classes: m.classCount, minimum: m.minimumClasses, target: m.targetClasses, blocks: blocksOf(m), families: share(m), classListDigest: m.classListDigest, registrySeal: m.registry.seal, labelledWorldsBuilt: m.build.labelledWorldsBuilt, frozenAt: m.frozenAt }])),
  holdout: { allocated: false, generated: 0 }, originFamilyLeakage: { sharedSeeds: 0, sharedBaseWorlds: 0, sharedMemberWorlds: va.crossPopulation?.overlaps, sharedBlocks: 0, sharedCoarsePcd: inter(set(ex, 'coarse'), set(va, 'coarse')), note: 'Family LABELS necessarily recur across populations (the generator has a finite set of origin families); what is disjoint is every lineage, seed, world and public class.' },
  strictIndexBySource: bySource, strictIndexCounts: exCtx.strict.counts, notes: NOTES,
  sourceHashes: Object.fromEntries(['i2-allocator.mjs', 'i2-screen.mjs', 'i2-screen-aggregate.mjs', 'i2-build-class.mjs', 'i2-freeze.mjs', 'i2-population.mjs', 'i2-population-audit.mjs'].map((f) => [f, file(f)])), gates, allPass: gates.every((g) => g.pass) };
console.log(JSON.stringify({ allPass: out.allPass, failed: gates.filter((g) => !g.pass), gates: gates.length, populations: out.populations }, null, 1));
if (process.argv.includes('--write')) { if (!out.allPass) throw Error('I2_POPULATION_AUDIT_NOT_RECORDED:FAILING'); writeExclusive(ev('I2_POPULATION_AUDIT.json'), out); console.log('recorded evidence/I2_POPULATION_AUDIT.json'); }
