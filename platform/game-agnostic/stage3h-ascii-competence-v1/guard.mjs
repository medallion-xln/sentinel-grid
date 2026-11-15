// STAGE3H_ASCII_COMPETENCE_BENCHMARK_V1 lane guard. Read-only over every predecessor.
// Chains the ASCII v33.1 inheritance check (14,447 canonical protected files, Stage 3F/3G baseline,
// 5,832 hashed ASCII sources) and additionally hash-binds every source this benchmark imports.
// Writers use exclusive 'wx' creation and refuse to run beside another writer of this lane.
import { readFileSync, existsSync, openSync, writeSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { verifyInheritance as verifyV331, walk } from '../ascii-quality-v33_1/guard.mjs';

export const LANE = dirname(fileURLToPath(import.meta.url));
export const GA = resolve(LANE, '..');
export const ROOT = resolve(GA, '../..');
export const BENCHMARK_ID = 'STAGE3H_ASCII_COMPETENCE_BENCHMARK_V1';
export const rawHash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const hashValue = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// Extra sources imported by this lane that the v33.1 snapshot does not cover.
export const EXTRA_SOURCES = Object.freeze([
  'ascii-quality-v33_1/policy-v33_1.mjs', 'ascii-quality-v33_1/platformer-planner-v2.mjs', 'ascii-quality-v33_1/controllers-v33_1.mjs',
  'ascii-quality-v33_1/guard.mjs', 'ascii-quality-v33_1/population.mjs', 'ascii-quality-v33_1/RESULT.json',
  'ascii-suite/v31/sentinel.mjs', 'ascii-suite/prime.mjs',
  'src/experts/nexus.js', 'src/experts/oracle.js', 'src/prime/root-puct.js',
  'stage3h-canonical-v1/nexus-selector-v1-port.mjs', 'stage3h-canonical-v1/guard.mjs',
  'stage3h2r-development/NINE_EXPERT_INVENTORY_V1.json',
  'stage3h-final-review-handoff/amendments/v3/contract-v3.json',
]);
export const extraHashes = () => Object.fromEntries(EXTRA_SOURCES.map((p) => [p, rawHash(resolve(GA, p))]));

// Inherited milestone commits (verified as ancestors of HEAD by verifyBaseline).
export const MILESTONES = Object.freeze({
  'Stage 3G freeze certification': 'dc74df69', 'Stage 3H.1-D confirmation evidence': '32ac6028', 'Stage 3H.1-F structural OOD evidence': '356b6b07',
  'Stage 3H.2-R expert inventory': '07b0c36b', 'Stage 3H.2-E': 'dd56fac8', 'Stage 3H.2-E1': 'd668c153', 'Stage 3H.2-E2 closure': '17acb064',
  'Oracle contract closure': '6add9434', 'Stage 3H sealed qualification V1': '83189f17', 'Stage 3H activation V2': '250f51ad',
  'Final review handoff': 'fcb9e8b9', 'Stage 3H activation V3': '320a07da', 'ASCII v33.1 lane': 'a65f40f',
});
export const FROZEN_RULE = Object.freeze({ H0: 'NEXUS_ELSE_S0', H2: 'S0' });
export const FROZEN_RULE_HASH = 'c53826da908510a6eceae626a3c7463195b648c95962f32b9e2774b8324be021';
export const ROSTER = Object.freeze(['Prime', 'Vanguard', 'Oracle', 'Nexus', 'Horizon', 'Archimedes', 'Alexandria', 'Picasso', 'Forge']);

const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
export function verifyBaseline() {
  const v331 = verifyV331();
  const ancestors = Object.fromEntries(Object.entries(MILESTONES).map(([k, c]) => {
    let ok = true; try { execFileSync('git', ['-C', ROOT, 'merge-base', '--is-ancestor', c, 'HEAD']); } catch { ok = false; }
    return [k, { commit: c, ancestorOfHead: ok }];
  }));
  const contract = readJson(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'));
  const ruleHash = createHash('sha256').update(JSON.stringify(contract.rule, Object.keys(contract.rule).sort())).digest('hex');
  const roster = readJson(resolve(GA, 'stage3h2r-development/NINE_EXPERT_INVENTORY_V1.json')).roster;
  const out = {
    head: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']),
    asciiSourcesUnchanged: v331.sourcesUnchanged, asciiSourceCount: v331.sourceCount,
    canonicalProtectedCount: v331.canonicalProtected.count, stage3fStage3gBaseline: v331.asciiBaseline,
    milestones: ancestors, allMilestonesAncestors: Object.values(ancestors).every((a) => a.ancestorOfHead),
    frozenRule: contract.rule, frozenRuleHashMatches: ruleHash === FROZEN_RULE_HASH && contract.ruleHash === FROZEN_RULE_HASH,
    oraclePath: contract.oraclePath, rosterPreserved: JSON.stringify(roster) === JSON.stringify(ROSTER), authority: 'R0',
  };
  if (!out.asciiSourcesUnchanged || out.canonicalProtectedCount !== 14447 || !out.allMilestonesAncestors || !out.frozenRuleHashMatches || !out.rosterPreserved || out.oraclePath !== 'CLOSED_CONTRACT_NOT_TESTABLE')
    throw Error('BASELINE_VERIFICATION_FAILED:' + JSON.stringify(out));
  return out;
}

const INHERITANCE = resolve(LANE, 'inheritance.json');
export function captureInheritance() {
  if (existsSync(INHERITANCE)) throw Error('INHERITANCE_ALREADY_CAPTURED');
  const snapshot = { schema: BENCHMARK_ID + '_INHERITANCE', baseline: verifyBaseline(), extraSources: extraHashes(), capturedBeforeAnyBenchmarkOutcome: true, authority: 'R0' };
  writeExclusive(INHERITANCE, snapshot);
  return snapshot;
}
export function verifyInheritance() {
  const snapshot = readJson(INHERITANCE), baseline = verifyBaseline(), now = extraHashes();
  const changed = Object.entries(snapshot.extraSources).filter(([p, h]) => now[p] !== h).map(([p]) => p);
  if (changed.length) throw Error('EXTRA_SOURCE_CHANGED:' + changed.join(','));
  return { ...baseline, extraSourcesUnchanged: true, extraSourceCount: Object.keys(now).length };
}

// Lane source closure: every executable file of this lane, hashed (evidence excluded).
export function laneClosure() {
  const files = Object.fromEntries(walk(LANE).filter((p) => /\.(mjs|js)$/.test(p) && !p.includes('/evidence/')).map((p) => [p.slice(LANE.length + 1), rawHash(p)]));
  return { files, hash: hashValue(files) };
}

const WRITER = /stage3h-ascii-competence-v1\/(dev-run|inventory|protocol|finalize)\.mjs/;
export function concurrentWriters() {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\n').filter(Boolean)
    .map((l) => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); return m && { pid: +m[1], ppid: +m[2], command: m[3] }; }).filter(Boolean);
  const mine = new Set([process.pid, process.ppid]);
  return rows.filter((p) => !mine.has(p.pid) && /(^|\/)node\b/.test(p.command.split(' ')[0]) && WRITER.test(p.command));
}
export function assertSoleWriter() { const o = concurrentWriters(); if (o.length) throw Error('CONCURRENT_WRITER:' + JSON.stringify(o)); }
export function writeExclusive(path, value) { const fd = openSync(path, 'wx'); writeSync(fd, JSON.stringify(value, null, 1) + '\n'); closeSync(fd); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv.includes('--capture') ? captureInheritance() : verifyInheritance();
  console.log(JSON.stringify({ ...out, extraSources: undefined, laneClosure: laneClosure().hash }, null, 1));
}
