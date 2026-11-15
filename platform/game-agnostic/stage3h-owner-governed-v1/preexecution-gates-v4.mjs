// Pre-execution gates for registration 7c41ba89 (Phase 0 of the owner execution authorization). Read-only apart from the
// write-once evidence file; consumes no replication, generates no registered world, runs no policy on any registered world.
// The runner's own O-5 preflight (load, concurrent process, lock-time margin) still runs at launch, before any directory exists.
// Writes evidence/execution-7c41ba89/preexecution-gates.json once; exits non-zero if any gate fails.
import { readFileSync, existsSync, statfsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadavg, cpus, totalmem } from 'node:os';
import { stableStringify, sha256 } from '../src/core/determinism.js';
import { assertRuntimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { selectSets } from '../stage3h-activation-readiness-v2/runner-design.mjs';
import { schedule, scheduleHash } from './connector.mjs';
import { nativeRowV4, CONNECTOR_V4_ID } from './connector-v4.mjs';
import { loadV4, V4_REGISTRATION, PREFLIGHT, O6_DECISION } from './campaign-v4.mjs';
import { WITNESS } from './menu-validity-fixtures.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const REG = '7c41ba89c5c63489b4b4b6351716889460996b688e8ab897197a64a6fb7014cc', REG_COMMIT = '01d4cc34cdee7f498f413396708f14acf13e2d33', CANDIDATE = 'd8a44ebd19f6dc5b833462435385680dcf2c3541a543a0e18f3fb81067307aad';
const ROOT = resolve(GA, '../..'), PFX = 'platform/game-agnostic/', git = (a, enc = 'utf8') => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: enc, maxBuffer: 256 * 1024 * 1024 });
const H = (b) => createHash('sha256').update(b).digest('hex'), J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8'));
assertSoleWriter(); const inh = verifyOwnerLane();
const OUT = resolve(LANE, 'evidence/execution-7c41ba89/preexecution-gates.json'); if (existsSync(OUT)) throw Error('ALREADY_RECORDED');

const reg = J('registration/ACTIVE_REGISTRATION_V4.json'), { registrationHash: _h, ...body } = reg;
const loaded = loadV4(V4_REGISTRATION); assertRuntimeIdentity(reg.bindings.runtime);
let ancestor = true; try { git(['merge-base', '--is-ancestor', REG_COMMIT, 'HEAD']); } catch { ancestor = false; }
const changedSince = git(['diff', '--name-only', REG_COMMIT, 'HEAD']).split('\n').filter(Boolean).map((f) => f.slice(PFX.length));
const contract = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8'));
const plans = Object.fromEntries(['A', 'B'].map((r) => [r, schedule(contract.populations, reg.namespaces[r])]));
const excl = J('evidence/prior-world-exclusions.json'), priorSeeds = new Set([...excl.priorSeeds, ...reg.namespaceAllocation.additionalPriorSeeds]);
const seeds = (r) => plans[r].map((x) => x.seed), block = (s) => Math.floor(s / 1e9);
const scanned = new Set(J('evidence/successor-v4/menu-scan-records.json').records.filter((r) => !r.preRejection).map((r) => r.worldHash));
const others = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n').filter((l) => /node .*(stage3h|campaign-v|--test)/.test(l) && !l.trim().startsWith(String(process.pid)));
const sel = { H0: selectSets('H0', ['b'], ['n']), H2: selectSets('H2', ['b'], ['n']) };
const w = nativeRowV4(WITNESS, { seen: new Set() });
const cc = J('evidence/activation-d8a44ebd/clean-clone-verification.json'), rv = J('evidence/execution-7c41ba89/recount-validation.json');
const fsStat = statfsSync(GA), freeDiskGiB = (fsStat.bavail * fsStat.bsize) / 2 ** 30;
const power = execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8' }).split('\n')[0];
const gates = {
  registrationIdentity: sha256(stableStringify(body)) === REG && reg.registrationHash === REG && ancestor && H(git(['show', REG_COMMIT + ':' + PFX + 'stage3h-owner-governed-v1/registration/ACTIVE_REGISTRATION_V4.json'], null)) === H(readFileSync(V4_REGISTRATION)),
  registrationUnchangedSinceCommit: !changedSince.includes('stage3h-owner-governed-v1/registration/ACTIVE_REGISTRATION_V4.json') && changedSince.every((f) => !Object.hasOwn(reg.bindings.sources, f)),
  activeStatus: reg.status === 'ACTIVE_OWNER_GOVERNED' && loaded.registrationHash === REG && reg.connector === CONNECTOR_V4_ID && reg.activatesCandidate === CANDIDATE,
  sevenOwnerApprovals: Object.keys(reg.ownerApproval.decisions).length === 7 && Object.values(reg.ownerApproval.decisions).every((d) => d.approved === true && d.signatureOrTrustedApprovalReference) && reg.ownerApproval.decisions[O6_DECISION].approved === true,
  boundSources237: Object.keys(reg.bindings.sources).length === 237,
  protectedFiles14447: inh.protectedCount === 14447 && inh.rosterPreserved && inh.frozenRuleHashMatches,
  frozenPoliciesAndIdentities: reg.frozenSelector.ruleHash === contract.ruleHash && JSON.stringify(sel.H0.R) === JSON.stringify(sel.H0.N) && JSON.stringify(sel.H2.R) === JSON.stringify(sel.H2.B),
  nativeForgeWorldV2: Object.keys(reg.bindings.sources).filter((f) => f.startsWith('src/')).length === 57 && git(['status', '--porcelain', '--', PFX + 'src']).trim() === '',
  nativeMenuValidation: w.rejected?.reason === 'NATIVE_MENU_INVALID' && w.rejected.invalidViews === 11 && reg.menuValidity.ownerApproved === true,
  namespacesDisjointAndReserved: reg.namespaces.A === 733e9 && reg.namespaces.B === 734e9 && ['A', 'B'].every((r) => scheduleHash(plans[r]) === reg.scheduleHashes[r] && plans[r].length === 12768)
    && seeds('A').every((s) => block(s) === 733) && seeds('B').every((s) => block(s) === 734) && !seeds('A').some((s) => new Set(seeds('B')).has(s)),
  blocks731And732Excluded: [...seeds('A'), ...seeds('B')].every((s) => ![731, 732].includes(block(s))) && Object.keys(reg.namespaceAllocation.excludedBlocks).join() === '731,732',
  priorExclusionLedgerComplete: H(readFileSync(resolve(GA, reg.bindings.priorExclusions.file))) === reg.bindings.priorExclusions.sha256 && excl.priorWorldHashes.length === 9407 && excl.priorWorldHashes.every((h) => scanned.has(h)) && [...seeds('A'), ...seeds('B')].every((s) => !priorSeeds.has(s)),
  replicationsUnusedAndUnconsumed: !existsSync(resolve(LANE, 'runs', REG.slice(0, 16))),
  noCompetingEvaluationProcess: others.length === 0,
  cleanCloneReproducible: cc.result.verdict === 'CLEAN_CLONE_REPRODUCIBLE' && cc.registrationHash === REG && cc.registrationCommit === REG_COMMIT,
  registeredOperationalLimits: PREFLIGHT.maxLoadFractionOfCores === 0.25 && PREFLIGHT.devLocks === 96 && PREFLIGHT.lockP99MaxMs === 250 && PREFLIGHT.lockMaxMs === 500 && readFileSync(resolve(LANE, 'connector.mjs'), 'utf8').includes('elapsedMs <= 1000'),
  recountContractFixed: rv.verdict === 'RECOUNT_REPRODUCES_REGISTERED_ADMISSION' && rv.compared === 9456 && rv.mismatches.length === 0,
  machineResources: freeDiskGiB >= 5 && /AC Power/.test(power) && totalmem() >= 8 * 2 ** 30,
};
const failed = Object.entries(gates).filter(([, v]) => !v).map(([k]) => k);
writeExclusive(OUT, { schema: 'STAGE3H_V4_PREEXECUTION_GATES_V1', registrationHash: REG, registrationCommit: REG_COMMIT, head: git(['rev-parse', 'HEAD']).trim(), inheritanceHead: inh.head, gates, failed,
  machineAtCheck: { load: loadavg().map((x) => +x.toFixed(2)), cores: cpus().length, loadLimit: PREFLIGHT.maxLoadFractionOfCores * cpus().length, freeDiskGiB: +freeDiskGiB.toFixed(1), totalMemGiB: +(totalmem() / 2 ** 30).toFixed(1), power },
  note: 'Machine load and the development lock-time margin are enforced again by the runner preflight at launch, before the replication directory is created.',
  verdict: failed.length === 0 ? 'PREEXECUTION_GATES_PASS' : 'PREEXECUTION_GATES_FAIL', replicationsConsumed: 0, registeredWorldsGenerated: 0, authority: 'R0' });
console.log(JSON.stringify({ verdict: failed.length === 0 ? 'PREEXECUTION_GATES_PASS' : 'PREEXECUTION_GATES_FAIL', failed, gates }, null, 1));
if (failed.length) process.exit(2);
