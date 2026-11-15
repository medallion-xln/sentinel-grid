// Phase 0: scientific inheritance (read-only; writes evidence/phase0.json once). No sealed V4 row is read.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { inheritance } from '../stage3h-safety-feasibility-v1/closure/inheritance.mjs';
import { loadExclusionIndex, validateSeedRange, excludedWorld } from '../stage3h-safety-feasibility-v1/closure/exclusions.mjs';
import { FROZEN_RULE, FROZEN_RULE_HASH } from '../stage3h-ascii-competence-v1/guard.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), GA = resolve(LANE, '..'), ROOT = resolve(GA, '../..');
const git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const inh = inheritance();
const safety = resolve(GA, 'stage3h-safety-feasibility-v1');
const closure = readFileSync(resolve(safety, 'CLOSURE.md'), 'utf8').match(/^CLASSIFICATION=(.+)$/m)[1];
const safetyUnchanged = git(['status', '--porcelain', '--untracked-files=all', '--', 'platform/game-agnostic/stage3h-safety-feasibility-v1']) === '' && git(['diff', '--name-only', 'ac9daeb5c96c5cd0b1b8dadc8c7aa9be51dce958', '--', 'platform/game-agnostic/stage3h-safety-feasibility-v1']) === '';
const witnesses = JSON.parse(execFileSync(process.execPath, ['closure/reproduce-witnesses.mjs'], { cwd: safety, encoding: 'utf8', maxBuffer: 64 << 20 }));
const idx = loadExclusionIndex(), ids = JSON.parse(readFileSync(resolve(GA, 'stage3h-failure-diagnosis-v1/evidence/reproducibility/DEV_WORLD_IDENTITIES.json'), 'utf8'));
const contract = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8'));
const out = { schema: 'STAGE3H_WIDER_ACTION_PHASE0_V1', authority: 'R0', head: git(['rev-parse', 'HEAD']),
  v4: inh.v4, nineExperts: inh.roster, frozenSelector: { rule: contract.rule, ruleHash: contract.ruleHash, matchesFrozen: contract.ruleHash === FROZEN_RULE_HASH && JSON.stringify(contract.rule) === JSON.stringify(FROZEN_RULE) },
  nativeForgeWorldV2: inh.nativeForgeWorldV2, protectedFiles: inh.protectedFiles, authorityConstant: inh.authority,
  scientificResultB: { classification: closure, preserved: closure.startsWith('B. TWO_ARM_IMPOSSIBILITY_PROVEN_FOR_ADMISSIBLE_NATIVE_STATE_DOMAIN_ONLY'), safetyLaneUnchangedSinceAc9daeb5: safetyUnchanged },
  witnesses: { reproduced: witnesses.valid, allValidReproduce: witnesses.allValidReproduce },
  devExclusions: { spentBlocksRejected: [951, 952].every((b) => !validateSeedRange(idx, b * 1e9, 12768).ok), openSeedsRejected: ids.devOpenSeeds.every((s) => !validateSeedRange(idx, s, 1).ok),
    devBaseWorldsExcluded: Object.values(ids.sets).every((s) => s.worldByIdx.every((x) => x.startsWith('REJECTED:') || excludedWorld(idx, x))) },
  diagnosisUnchanged: inh.failureDiagnosis.unchangedSince8d154081, reproducibilityManifest: inh.reproducibilityManifest };
out.pass = inh.pass && out.frozenSelector.matchesFrozen && out.scientificResultB.preserved && safetyUnchanged && witnesses.valid === 9 && witnesses.allValidReproduce
  && out.devExclusions.spentBlocksRejected && out.devExclusions.openSeedsRejected && out.devExclusions.devBaseWorldsExcluded;
if (!existsSync(resolve(LANE, 'evidence'))) mkdirSync(resolve(LANE, 'evidence'));
writeExclusive(resolve(LANE, 'evidence/phase0.json'), out);
console.log(JSON.stringify(out, null, 1));
