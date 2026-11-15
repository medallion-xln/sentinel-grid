// H-W1 DEV I-0 (1 of 2): source and contract integrity. READ-ONLY on the repository; writes only its own evidence file.
// Locates and hashes the arm-stress selection rule from the bytes of its source, verifies the machine-readable H-W1 contract
// against its prose, freezes the transformation / comparator / evaluator / exclusion sources by import closure, and checks the
// R0 runtime-identity discrepancy for overlap with this study. Nothing is reconstructed from narrative.
// Usage: node i0-source-integrity.mjs [--write]   (--write records evidence/I0_SOURCE_INTEGRITY.json once, only if every gate passes)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { candidates, DRAWS } from '../stage3h-safety-feasibility-v1/search.mjs';
import { S0_HASH } from '../stage3h-canonical-v1/baseline.mjs';
import { SOURCES as NEXUS_SOURCES } from '../stage3h-canonical-v1/adapters.mjs';
import { loadStrictIndex } from '../stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), GA = resolve(LANE, '..'), ROOT = resolve(GA, '../..');
const git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }).trimEnd();
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const blobId = (b) => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const repoRel = (abs) => relative(ROOT, abs);
const BASE_COMMIT = '8d15408195b469b1ec5a7162e1bf6b16efb9b1aa';
const V4_RULE_HASH = 'c53826da908510a6eceae626a3c7463195b648c95962f32b9e2774b8324be021';

// ---- git state of a file: tracked?, present at BASE_COMMIT?, byte-identical to it? --------------------------------------
const lsTree = (rev) => new Map(git(['ls-tree', '-r', rev]).split('\n').map((l) => l.match(/^\d+ \w+ ([0-9a-f]{40})\t(.*)$/)).map((m) => [m[2], m[1]]));
const baseTree = lsTree(BASE_COMMIT), headTree = lsTree('HEAD');
// The 31 protected sources live in the working tree as an untracked overlay and are not on main. Identities only (path -> sha256) are read here.
const protectedSha = new Map(readFileSync(resolve(ROOT, '.git/custody/protected-identities.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))
  .map((l) => { const c = l.split('\t'); return [c.find((x) => x.includes('/')), c.find((x) => /^[0-9a-f]{64}$/.test(x))]; }));
function fileRecord(abs) {
  const bytes = readFileSync(abs), rel = repoRel(abs), sha = sha256(bytes), inHead = headTree.get(rel);
  if (protectedSha.has(rel)) return { path: rel, bytes: bytes.length, sha256: sha, tracked: inHead !== undefined, protectedOverlay: true, matchesRecordedProtectedIdentity: protectedSha.get(rel) === sha, sinceBase: 'PROTECTED_OVERLAY_NOT_ON_MAIN' };
  const blob = blobId(bytes), atBase = baseTree.get(rel);
  return { path: rel, bytes: bytes.length, sha256: sha, gitBlob: blob, tracked: inHead !== undefined, workingTreeMatchesHead: inHead === blob,
    sinceBase: atBase === undefined ? 'ADDED_AFTER_BASE' : atBase === blob ? 'UNCHANGED_SINCE_BASE' : 'MODIFIED_SINCE_BASE' };
}

// ---- static import closure (relative specifiers only; node builtins are not source) -----------------------------------
const IMPORT_RE = /(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"\n]+)['"]/g;
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const resolveSpec = (from, spec) => [spec, `${spec}.js`, `${spec}.mjs`].map((s) => resolve(dirname(from), s)).find((p) => existsSync(p) && statSync(p).isFile());
function closure(roots) {
  const seen = new Set(), unresolved = [], stack = roots.map((r) => { const p = resolve(GA, r); if (!existsSync(p)) throw Error(`MISSING_ROOT ${r}`); return p; });
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
    if (!/\.m?js$/.test(f)) continue;
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(IMPORT_RE)) { const p = resolveSpec(f, m[1]); p ? stack.push(p) : unresolved.push({ from: repoRel(f), spec: m[1] }); }
  }
  return { files: [...seen].sort().map(fileRecord), unresolved };
}
const setHash = (files) => sha256(files.map((f) => `${f.path}\t${f.sha256}`).join('\n'));

// ---- exact bytes of one named function (line based, brace counted) -----------------------------------------------------
function fnBytes(rel, name) {
  const lines = readFileSync(resolve(ROOT, rel), 'utf8').split('\n'), i = lines.findIndex((l) => new RegExp(`^(export )?(async )?function ${name}\\b`).test(l));
  if (i < 0) throw Error(`FUNCTION_NOT_FOUND ${rel}#${name}`);
  let depth = 0, seen = false, j = i;
  for (; j < lines.length; j++) { for (const ch of lines[j]) { if (ch === '{') { depth++; seen = true; } else if (ch === '}') depth--; } if (seen && depth === 0) break; }
  const text = lines.slice(i, j + 1).join('\n') + '\n';
  return { path: rel, name, startLine: i + 1, endLine: j + 1, bytes: Buffer.byteLength(text), sha256: sha256(text) };
}

const GA_REL = repoRel(GA), P = (p) => `${GA_REL}/${p}`;
const gates = {};

// ============================== 1. arm-stress selection rule ==========================================================
const SEARCH = P('stage3h-safety-feasibility-v1/search.mjs');
const rule = fnBytes(SEARCH, 'candidates');
const searchLines = readFileSync(resolve(ROOT, SEARCH), 'utf8').split('\n');
const helpers = { same: searchLines[18] + '\n', DRAWS: searchLines[19] + '\n' };
const withHelpers = searchLines.slice(18, rule.endLine).join('\n') + '\n';
const searchRec = fileRecord(resolve(ROOT, SEARCH));
const rowFiles = {};
for (const set of ['DEV288', 'FRESH_EXPLORE', 'FRESH_CHECK']) {
  const dir = resolve(GA, 'stage3h-failure-diagnosis-v1/dev-runs', set);
  rowFiles[set] = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().map((f) => { const b = readFileSync(resolve(dir, f)); return { file: `${set}/${f}`, bytes: b.length, rows: b.toString('utf8').trim().split('\n').length, sha256: sha256(b) }; });
}
const t0 = Date.now(), cands = candidates(), bySet = {}, byReason = {};
for (const c of cands) { bySet[c.set] = (bySet[c.set] ?? 0) + 1; byReason[c.reason] = (byReason[c.reason] ?? 0) + 1; }
const inspectedIdentities = cands.map((c) => `${c.set}\t${c.row.idx}\t${c.row.seed}\t${c.row.worldHash}\t${c.reason}`);
const lastCommit = git(['log', '-1', '--format=%H %cs %s', '--', SEARCH]);
const strict = loadStrictIndex(GA);
const isExcludedWorld = (h) => (strict.index.worlds.has ? strict.index.worlds.has(h) : h in strict.index.worlds);
const armStress = {
  ruleSource: { path: SEARCH, function: 'candidates', startLine: rule.startLine, endLine: rule.endLine, bytes: rule.bytes, ARM_STRESS_RULE_HASH: rule.sha256,
    text: searchLines.slice(rule.startLine - 1, rule.endLine).join('\n') + '\n' },
  helperHashes: { same: sha256(helpers.same), DRAWS: sha256(helpers.DRAWS), ruleWithHelpersLines19to31: sha256(withHelpers) },
  sourceFile: { sha256: searchRec.sha256, gitBlob: searchRec.gitBlob, tracked: searchRec.tracked, workingTreeMatchesHead: searchRec.workingTreeMatchesHead, sinceBase: searchRec.sinceBase, lastCommit },
  governingVersion: { baseCommit: BASE_COMMIT, draws: DRAWS, selection: 'H2 band; Nexus applies (no abstention); N != B as sets; S0 introduces vs N, or both arms regret in [40,160]' },
  inputRowFiles: rowFiles,
  rowFilesAreTrackedInGit: false, rowFileNote: 'dev-runs row files are untracked and git-ignored; their sha256 is recorded here as the rule inputs',
  admitted: { total: cands.length, bySet, byReason, loadMs: Date.now() - t0, identitiesSha256: sha256(inspectedIdentities.join('\n')) },
  allAdmittedWorldsInStrictExclusionIndex: cands.every((c) => isExcludedWorld(c.row.worldHash)),
};
gates.armStressRuleLocatedExactBytes = rule.startLine === 22 && rule.endLine === 31 && /^export function candidates\(\)/.test(readFileSync(resolve(ROOT, SEARCH), 'utf8').split('\n')[21]);
gates.armStressRuleReproduces341 = cands.length === 341 && bySet.DEV288 === 3 && bySet.FRESH_EXPLORE === 153 && bySet.FRESH_CHECK === 185 && byReason.NEAR_THRESHOLD === 301 && byReason.INTRO_AND_NEAR === 28 && byReason.INTRO === 12;
gates.armStressSourceCommittedOnMainAndUnmodified = searchRec.tracked && searchRec.workingTreeMatchesHead && searchRec.sinceBase === 'ADDED_AFTER_BASE';
gates.armStressRuleTextHashesToRecordedHash = sha256(armStress.ruleSource.text) === rule.sha256 && Buffer.byteLength(armStress.ruleSource.text) === rule.bytes;
gates.inspectedClassesAllSpent = armStress.allAdmittedWorldsInStrictExclusionIndex;

// ============================== 2. V4 historical rule vs the prospective comparator contract ===========================
const guardText = readFileSync(resolve(GA, 'stage3h-ascii-competence-v1/guard.mjs'), 'utf8');
const v3 = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8'));
const V4_RULE = { H0: 'NEXUS_ELSE_S0', H2: 'S0' };
const v4Hash = sha256(JSON.stringify(V4_RULE, Object.keys(V4_RULE).sort()));
const guardConst = guardText.match(/FROZEN_RULE_HASH = '([0-9a-f]{64})'/)?.[1];
const v4 = {
  id: 'V4_FROZEN_BAND_RULE', rule: V4_RULE, ruleHash: V4_RULE_HASH,
  reproducedBy: 'sha256(JSON.stringify(rule, Object.keys(rule).sort())) (stage3h-ascii-competence-v1/guard.mjs line 51)', recomputed: v4Hash,
  guardConstant: guardConst, contractV3RuleHash: v3.ruleHash, contractV3Rule: v3.rule, comparatorModelHash: v3.comparatorModelHash,
  role: 'HISTORICAL V4 selector contract: one band-conditional arm (H0 -> Nexus-else-S0, H2 -> S0). Final negative verdict. Not the arm-stress selection rule and not a comparator of H-W1.',
};
gates.v4RuleHashReproduced = v4Hash === V4_RULE_HASH && guardConst === V4_RULE_HASH && v3.ruleHash === V4_RULE_HASH && JSON.stringify(v3.rule) === JSON.stringify(V4_RULE);
gates.v4RuleNotSubstitutedForArmStressRule = rule.sha256 !== V4_RULE_HASH && v4Hash !== rule.sha256;

// ============================== 3. contract JSON vs prose ==============================================================
const CJ = resolve(GA, 'stage3h-wider-action-feasibility-v1/H_W1_CONTRACT.json'), CM = resolve(GA, 'stage3h-wider-action-feasibility-v1/H_W1_CONTRACT.md');
const jsonBytes = readFileSync(CJ), C = JSON.parse(jsonBytes), M = readFileSync(CM, 'utf8'), jtxt = JSON.stringify(C);
const contractSha = sha256(jsonBytes);
const rows = [], chk = (id, jsonSays, mdSays, pass) => rows.push({ id, json: jsonSays, md: mdSays, pass: Boolean(pass) });
const th = C.hypothesis.thresholds, pop = C.populations, cb = C.evaluation.computeBudget, inv = C.evaluation.invariance;
const bound = (n) => Number((1 - 0.05 ** (1 / n)).toFixed(5)), bound4 = (n) => Number((1 - 0.05 ** (1 / n)).toFixed(4));
chk('contract.sha256-recorded-in-md', contractSha, M.match(/sha256 `([0-9a-f]{64})`/)?.[1], M.includes(contractSha));
chk('policyIdentity', C.policyIdentity, 'STAGE3H_WIDER_ACTION_POLICY_W1 is a research artifact, not a tenth expert', M.includes(C.policyIdentity) && /not a tenth expert/.test(M) && /not a tenth expert/.test(C.note));
chk('introductions.vsS0=0 and vsNexusElseS0=0', [th.introductionsVsS0, th.introductionsVsNexusElseS0], 'zero observed catastrophe introductions against both frozen comparators', th.introductionsVsS0 === 0 && th.introductionsVsNexusElseS0 === 0 && /zero observed catastrophe introductions against both/.test(M));
chk('meanNregReduction>=0.02 per comparator', th.meanNregReductionVsEachComparatorMin, 'reduces mean normalized regret by at least 0.02 relative to each', th.meanNregReductionVsEachComparatorMin === 0.02 && /at least 0\.02 relative to each/.test(M));
chk('regret rule: point <= -0.02 and one-sided 95% cluster-bootstrap UB < 0', th.regretEvidenceRule, '<= -0.02 and the one-sided 95% cluster-bootstrap upper bound < 0', /<= -0\.02/.test(th.regretEvidenceRule) && /one-sided 95% cluster-bootstrap/.test(th.regretEvidenceRule) && /<= -0\.02[\s\S]{0,40}one-sided 95% cluster-bootstrap upper bound < 0/.test(M));
chk('bootstrap resamples 10,000', /10,?000/.test(jtxt), /10,000 resamples/.test(M), /10,?000/.test(jtxt) && /10,000 resamples/.test(M));
chk('catastrophe = regret >= 100', C.hypothesis.catastrophe, 'catastrophe = frozen evaluator regret >= 100', /regret >= 100/.test(C.hypothesis.catastrophe) && /regret >= 100/.test(M));
chk('policy class: one legal action, no abstention, no randomization', C.hypothesis.policyClass, 'returns exactly one legal menu action. It never abstains and never randomizes', /exactly one/.test(C.hypothesis.policyClass) && /exactly one\s+legal menu action\.\s+It never abstains and never randomizes/.test(M));
for (const [k, min, tgt, rx] of [['exploration', 1000, undefined, /Exploration[^\n]*\|\s*1,000\s*\|/], ['validation', 300, 600, /Validation[^\n]*300 \(target 600\)/], ['holdout', 300, 600, /Holdout[^\n]*300 \(target 600\)/]])
  chk(`population.${k}`, { minClasses: pop[k].minClasses, targetClasses: pop[k].targetClasses }, rx.source, pop[k].minClasses === min && pop[k].targetClasses === tgt && rx.test(M));
chk('twin draws 40 (exploration, validation)', [pop.exploration.twinDraws, pop.validation.twinDraws], '40 draws', pop.exploration.twinDraws === 40 && pop.validation.twinDraws === 40 && (M.match(/\| 40 draws \|/g) ?? []).length === 2);
chk('holdout twin family 40 + 120 salted + corners', pop.holdout.twinDraws, '40 standard + 120 independently salted + up to 64 hidden-support corner settings', /40/.test(pop.holdout.twinDraws) && /120/.test(pop.holdout.twinDraws) && /40 standard \+ 120 independently salted \+ up to 64/.test(M));
chk('maxCandidates 20', pop.validation.maxCandidates, 'at most 20 candidates', pop.validation.maxCandidates === 20 && /at most 20 candidates/.test(M));
chk('holdout generated only after freeze', pop.holdout.generatedOnlyAfterFreeze, 'Holdout generation happens after the freeze', pop.holdout.generatedOnlyAfterFreeze === true && /Holdout generation happens after the freeze/.test(M));
chk('origin family cap 5%', pop.originFamilyCap, 'No topology x resource x objective family exceeds 5%', /5%/.test(pop.originFamilyCap) && /exceeds 5% of any population/.test(M));
chk('inspected 341 classes (3 / 153 / 185)', pop.inspectedClasses, '341 inspected classes', /341/.test(pop.inspectedClasses) && /DEV288 3/.test(pop.inspectedClasses) && /951 153/.test(pop.inspectedClasses) && /952 185/.test(pop.inspectedClasses) && /The 341 inspected classes/.test(M));
for (const [key, n, md] of [['n299', 299, /n=299 gives <= 1\.0%/], ['n300', 300, /300: 0\.99%/], ['n341', 341, /341: 0\.87%/], ['n600', 600, /600: 0\.50%/]])
  chk(`bound ${key} = 1-0.05^(1/n)`, { json: C.boundsTable[key], recomputed: bound(n) }, md.source, C.boundsTable[key] === bound(n) && md.test(M));
chk('bound per-class twins 67 / 161', { json: [C.boundsTable.perClassTwins67, C.boundsTable.perClassTwins161], recomputed: [bound4(67), bound4(161)] }, 'about 4.4% (1.8% at 161 twins)', C.boundsTable.perClassTwins67 === bound4(67) && C.boundsTable.perClassTwins161 === bound4(161) && /about 4\.4%/.test(M) && /1\.8% at 161 twins/.test(M));
chk('invariance tolerance 0', inv.tolerance, 'tolerance 0', inv.tolerance === 0 && /\(tolerance 0/.test(M));
chk('invariance relabel: identityViewTwinV2 + 5 random', inv.relabel, 'identityViewTwinV2 plus 5 random relabellings', /identityViewTwinV2/.test(inv.relabel) && /5 random/.test(inv.relabel) && /identityViewTwinV2` plus 5 random relabellings/.test(M));
chk('invariance menu order: 5 random + reverse', inv.menuOrder, '5 random permutations plus the reverse', /5 random permutations plus reverse/.test(inv.menuOrder) && /5 random permutations plus the reverse/.test(M));
chk('invariance D4: 7 non-identity', inv.d4, '7 non-identity transforms', /7 non-identity/.test(inv.d4) && /7 non-identity transforms/.test(M));
chk('compute budget', cb, 'median <= 100 ms, max <= 1 s, 300,000 labelled worlds, 2 GiB work files, >= 8 GiB free, no network',
  cb.nativeSimulatorCallsAtDecision === 0 && cb.decisionTimeMedianMs === 100 && cb.decisionTimeMaxMs === 1000 && cb.maxLabelledWorldsTotal === 300000 && cb.maxWorkDiskGiB === 2 && cb.minFreeDiskGiBToStart === 8 && cb.network === 'none'
  && /median <= 100 ms and max <= 1 s/.test(M) && /300,000 labelled worlds/.test(M) && /2 GiB of work files/.test(M) && /at\s+least 8 GiB free/.test(M) && /No network/.test(M));
const audit = C.actionIdentity.fieldAuditRequired, auditText = JSON.stringify(audit);
chk('field audit names', audit, 'resourceFlag, observationTimestamp, provenance, sequence', ['resourceFlag', 'observationTimestamp', 'provenance', 'sequence'].every((f) => auditText.includes(f) && M.includes(`\`${f}\``)) && audit.length === 4);
chk('BYPASS collisions idx 6236 5593 6198', C.actionIdentity.knownCollisionsResolved, 'indices 6236 and 6198 (FRESH_CHECK) and 5593 (FRESH_EXPLORE)', ['6236', '5593', '6198'].every((i) => C.actionIdentity.knownCollisionsResolved.includes(i) && M.includes(i)));
chk('keyV1 omits dependent/toX/toY', C.actionIdentity.keyV1, 'keyV1 (type, displacement, target block, params excluding dependent, toX, toY)', /dependent/.test(C.actionIdentity.keyV1) && /toX/.test(C.actionIdentity.keyV1) && /params excluding `dependent`, `toX`, `toY`/.test(M));
chk('keyV2 adds dependent block + actor-relative toX/toY', C.actionIdentity.keyV2, 'keyV2 adds the dependent\'s public attribute block (and actor-relative toX/toY)', /dependent/.test(C.actionIdentity.keyV2) && /toX/.test(C.actionIdentity.keyV2) && /actor-relative `toX\/toY`/.test(M));
chk('residual duplicates = symmetric orbit (worst-case cat, uniform-expectation regret)', C.actionIdentity.residualDuplicates, 'selects an orbit, not a member; worst case catastrophe; uniform expectation regret; no lexical tie-break', /orbit/.test(C.actionIdentity.residualDuplicates) && /selects an orbit, not a member/.test(M) && /worst case/.test(M) && /uniform expectation/.test(M));
chk('inputs.permitted has 5 and inputs.forbidden has 7 categories', [C.inputs.permitted.length, C.inputs.forbidden.length], 'Permitted: 5 items; Forbidden: 7 items',
  C.inputs.permitted.length === 5 && C.inputs.forbidden.length === 7
  && M.match(/\*\*Permitted:\*\*([\s\S]*?)\*\*Forbidden/)[1].split(';').length === 5 && M.match(/\*\*Forbidden:\*\*([\s\S]*?)\n\n/)[1].split(';').length === 7);
chk('forbidden mentions digests, seeds, oracle, simulator, handles', C.inputs.forbidden.map((s) => String(s).slice(0, 48)), 'integrity digests; seeds; oracle; simulator; handles',
  [/worldHash/, /seed/i, /oracle/i, /simulator|rollout/i, /handle/i].every((r) => r.test(JSON.stringify(C.inputs.forbidden)) && r.test(M.match(/\*\*Forbidden:\*\*([\s\S]*?)\n\n/)[1])));
chk('comparator-input rule: re-run on transformed view; unstable projection counts against policy', C.inputs.comparatorInputRule, 'both re-run on every transformed view ... counted against the policy', /re-run/i.test(C.inputs.comparatorInputRule) && /re-run on every transformed view/.test(M) && /counted against the policy/.test(M));
chk('claims C1-C4 present; C3 not claimed', Object.keys(C.claims), 'C1 C2 C3 C4', ['C1', 'C2', 'C3', 'C4'].every((k) => C.claims[k] && M.includes(`| ${k} `)) && /NOT CLAIM/i.test(C.claims.C3) && /\*\*not claimed\*\*/.test(M));
chk('nothing implemented or authorised at definition time', Object.values(C.notDone).every((v) => v === false), 'Nothing here implements, trains or evaluates a selector', Object.values(C.notDone).every((v) => v === false) && /Nothing here implements, trains or evaluates/.test(M));
chk('exclusion: layer1 strict-index, layer2 PCD', [C.exclusion.layer1.slice(0, 60), C.exclusion.layer2.slice(0, 60)], 'Layer 1 strict-index.mjs; Layer 2 public-class digest (PCD)', /strict-index/.test(C.exclusion.layer1) && /PCD|public-class digest/.test(C.exclusion.layer2) && /strict-index\.mjs/.test(M) && /public-class digest \(PCD\)/.test(M));
const contractFailures = rows.filter((r) => !r.pass);
// Recorded and expected, not defects: the contract was written when main was the original baseline; the owner authorised the two evidence commits.
const expectedSupersession = [{ field: 'ownerDecisions.CURRENT_MAIN', contract: C.ownerDecisions.CURRENT_MAIN, actualMain: git(['rev-parse', 'main']), reason: 'the owner authorised committing the custody-audit and wider-action lanes (0fa84a77, 2937efb7) on top of the baseline; both are additions-only' }];
const planNumbering = {
  contractMdPlan: { 'I-0': 'rerun closure audit; locate and hash selection rule; verify comparators, S0 public score, D4 equivariance; build transform tools with negative controls', 'I-1': 'keyV2, field audit, residual-collision check, static no-hidden-fields extractor', 'I-2': 'PCD exclusion index, tests, spent-source coverage', 'I-3': 'allocate three fresh blocks; reserve holdout block; population plan hash', 'I-4': 'generate and label exploration and validation; exploration statistics', 'I-5': 'develop <= 20 candidates on exploration; one validation evaluation each; freeze', 'I-6': 'holdout (separate authorisation)' },
  authorisationPlan: { 'I-0': 'contract and source integrity', 'I-1': 'public-only action representation', 'I-2': 'research data and evaluation integrity (exclusion binding, allocation, population assignment)', 'I-3': 'bounded policy implementation', 'I-4': 'DEV exploration and training', 'I-5': 'one-pass DEV validation', 'I-6': 'NOT AUTHORISED' },
  resolution: 'The authorisation governs the content and order of steps; H_W1_CONTRACT.json governs thresholds and populations. The md plan table is a numbering difference, not a threshold difference.',
};
gates.contractJsonMatchesProse = contractFailures.length === 0;

// ============================== 4. frozen source set by import closure ==================================================
const CATEGORIES = {
  generatorAndNativeWorld: ['stage3h-safety-feasibility-v1/twins.mjs', 'stage3h-failure-diagnosis-v1/lib.mjs', 'stage3h-canonical-v1/plan.mjs', 'src/forge-symmetric/scenarios-symmetric-v1.js', 'src/forge/warmup.js', 'src/forge/validators-v2.js', 'src/forge/kernel.js', 'src/forge-symmetric/action-surface-symmetric-v1.js'],
  evaluatorRegretAndCatastrophe: ['src/forge-symmetric/counterfactual-symmetric-v1.js', 'src/forge/counterfactual-v2.js', 'src/forge/reward-v2.js', 'stage3h-activation-readiness-v2/runner-design.mjs', 'stage3h-wider-action-feasibility-v1/contract.mjs'],
  s0Comparator: ['stage3h-canonical-v1/baseline.mjs'],
  nexusComparator: ['stage3h-canonical-v1/adapters.mjs'],
  transformations: ['src/forge-symmetric/orientation-symmetric-v1.js', 'stage3h-owner-governed-v1/identity-view-v2.mjs', 'stage3h-hw1-dev-v1/transforms.mjs'],
  exclusionAuthority: ['stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs'],
  armStressSelection: ['stage3h-safety-feasibility-v1/search.mjs'],
  publicObservation: ['stage3h-safety-feasibility-v1/contract.mjs', 'scripts/stage3g/evidence.mjs'],
};
const frozen = {}, unresolvedAll = [], all = new Map();
for (const [name, roots] of Object.entries(CATEGORIES)) {
  const c = closure(roots); unresolvedAll.push(...c.unresolved.map((u) => ({ category: name, ...u })));
  for (const f of c.files) all.set(f.path, f);
  frozen[name] = { roots: roots.map(P), fileCount: c.files.length, closureSha256: setHash(c.files), paths: c.files.map((f) => f.path) };
}
const allFiles = [...all.values()].sort((a, b) => a.path.localeCompare(b.path));
const isLane = (f) => f.path.startsWith(`${GA_REL}/stage3h-hw1-dev-v1/`);
const laneFiles = allFiles.filter(isLane), nonLaneFiles = allFiles.filter((f) => !isLane(f));
const overlay = nonLaneFiles.filter((f) => f.protectedOverlay), onMain = nonLaneFiles.filter((f) => !f.protectedOverlay);
const changed = onMain.filter((f) => f.sinceBase === 'MODIFIED_SINCE_BASE'), added = onMain.filter((f) => f.sinceBase === 'ADDED_AFTER_BASE'), atBaseUnchanged = onMain.filter((f) => f.sinceBase === 'UNCHANGED_SINCE_BASE');
const untrackedNonLane = onMain.filter((f) => !f.tracked);
const modifiedInWorkingTree = onMain.filter((f) => f.tracked && !f.workingTreeMatchesHead);
const versionIds = {};
for (const f of allFiles.filter((x) => /\.m?js$/.test(x.path))) for (const m of readFileSync(resolve(ROOT, f.path), 'utf8').matchAll(/\b(FORGE_[A-Z0-9_]*_V\d+)\b/g)) (versionIds[m[1]] ??= new Set()).add(f.path);
const nativeVersionIds = Object.fromEntries(Object.entries(versionIds).sort().map(([k, v]) => [k, v.size]));
gates.importClosuresResolved = unresolvedAll.length === 0;
gates.frozenSourcesPresentAtBaseAreUnchanged = changed.length === 0 && modifiedInWorkingTree.length === 0 && atBaseUnchanged.length > 0;
gates.everyNonLaneSourceIsCommittedOrRecordedOverlay = untrackedNonLane.length === 0 && overlay.every((f) => f.matchesRecordedProtectedIdentity && !f.tracked);
// Not a gate: a clean checkout of main cannot run the comparators or the world plan. Recorded as a reproducibility limitation.
const overlayDependency = { files: overlay.length, paths: overlay.map((f) => f.path), allMatchRecordedIdentity: overlay.every((f) => f.matchesRecordedProtectedIdentity), onMain: false,
  consequence: 'S0, Nexus, the evidence/guard/metrics modules and the world plan (stage3h-canonical-v1, ascii-suite) exist only in the untracked protected overlay (and on retained refs). Reproducing this study needs that overlay present with the recorded sha256 values; a clean clone of main cannot run it.' };

// ============================== 5. comparator identities =============================================================
const s0ModelPath = resolve(GA, 'artifacts/stage3g8-projection-disclosure/stage3g8-open-phase-report.json');
const s0Model = fileRecord(s0ModelPath);
const sel = fnBytes(P('stage3h-activation-readiness-v2/runner-design.mjs'), 'selectSets');
const comparators = {
  S0: { id: 'OBJECTIVE_PROGRESS_ONLY', modelHash: S0_HASH, modelFile: s0Model, entry: `${P('stage3h-canonical-v1/baseline.mjs')}#currentBaseline`, output: 'full top set of action handles', closureSha256: frozen.s0Comparator.closureSha256,
    assertedAtImport: 'baseline.mjs throws FROZEN_S0_MODEL_MISMATCH unless modelHash(model) === S0_HASH' },
  NEXUS_ELSE_S0: { source: NEXUS_SOURCES.Nexus, entry: `${P('stage3h-canonical-v1/adapters.mjs')}#invokeNexus`, output: 'one action handle (lexical tie-break among same-type actions) or abstention; S0 top set on abstention', closureSha256: frozen.nexusComparator.closureSha256 },
  scoringContract: { id: 'ARMS_B_N_SET_VALUED_ON_ORIGINAL_VIEW', B: 'S0 top set', N: 'Nexus pick, else B', selectSets: sel, note: 'comparator outputs used for SCORING are the frozen set-valued arms on the original view (as in the feasibility lane).' },
  policyInputContract: { id: 'IDENTITY_FREE_PROJECTIONS_RERUN_PER_VIEW', rule: C.inputs.comparatorInputRule, note: 'what the policy may SEE of a comparator: key-based projections only, recomputed on every transformed view; an unstable projection is excluded as a feature (decided at I-0 fixture gates).' },
  distinction: 'The prospective identity-free comparator contract (two independent arms, S0 and Nexus-else-S0, scored on every admitted class, projections re-run per view) is distinct from the historical V4 band rule (H0 -> Nexus-else-S0, H2 -> S0, one arm). No silent substitution: the V4 rule appears only as a recorded historical contract.',
};
gates.s0IdentityFrozen = s0Model.sinceBase === 'UNCHANGED_SINCE_BASE' && S0_HASH === '30a72416b8a7f0079155cd25908acbe8a2f69750759d106cf71609d77e1e8937' && v3.comparatorModelHash === S0_HASH;
gates.nexusIdentityFrozen = NEXUS_SOURCES.Nexus.id === 'sentinel-nexus-relational-v1+NEXUS_RELATIONAL_SELECTOR_V1' && NEXUS_SOURCES.Nexus.modelVersion === 'engine-v1/selector-v1/adapter-v1';

// ============================== 6. frozen function bytes (estimator, evaluator, rule) ==================================
const functionHashes = {
  regretAndCatastropheEstimator: fnBytes(P('stage3h-wider-action-feasibility-v1/contract.mjs'), 'worldLabels'),
  introductionPredicate: fnBytes(P('stage3h-activation-readiness-v2/runner-design.mjs'), 'potentialIntroduction'),
  evaluatorTruth: fnBytes(P('stage3h-failure-diagnosis-v1/lib.mjs'), 'evaluatorTruth'),
  armStressSelection: rule,
  nativeWorldBuilder: fnBytes(P('stage3h-safety-feasibility-v1/twins.mjs'), 'nativeWorld'),
  hiddenSupport: fnBytes(P('stage3h-safety-feasibility-v1/twins.mjs'), 'hiddenSupport'),
  twinFamily: fnBytes(P('stage3h-safety-feasibility-v1/twins.mjs'), 'twinFamily'),
  decisions: fnBytes(P('stage3h-safety-feasibility-v1/twins.mjs'), 'decisions'),
  orientAction: fnBytes(P('src/forge-symmetric/orientation-symmetric-v1.js'), 'orientAction'),
  orientWorld: fnBytes(P('src/forge-symmetric/orientation-symmetric-v1.js'), 'orientWorld'),
};

// ============================== 7. exclusion authority ==================================================================
const excl = {
  format: strict.format, counts: strict.counts, sources: strict.sources,
  blocksPresent: Object.fromEntries([731, 732, 733, 734, 951, 952].map((b) => [b, strict.index.blocks.has ? strict.index.blocks.has(b) : b in strict.index.blocks])),
  sourceClosureSha256: frozen.exclusionAuthority.closureSha256,
};
gates.exclusionAuthorityIntact = Object.values(excl.blocksPresent).every(Boolean) && strict.counts.distinctExcludedWorlds === 109082 && strict.counts.devOpenSeeds === 6 && strict.counts.multiSourceWorlds === 288;

// ============================== 8. R0 runtime-identity discrepancy: overlap with this study ============================
const r0Dir = resolve(GA, 'artifacts/r0-runtime-identity'), manifest = JSON.parse(readFileSync(resolve(r0Dir, 'baseline-manifest.json'), 'utf8')), r0Result = JSON.parse(readFileSync(resolve(r0Dir, 'r0-certification-result.json'), 'utf8'));
const studyPaths = new Set([...allFiles.map((f) => f.path), ...[s0Model.path, ...Object.values(strict.sources).map((s) => `${GA_REL}/${s.path}`), CJ, CM].map((p) => (p.startsWith('/') ? repoRel(p) : p))]);
for (const set of Object.values(rowFiles)) for (const f of set) studyPaths.add(`${GA_REL}/stage3h-failure-diagnosis-v1/dev-runs/${f.file}`);
const overlap = manifest.inventory.filter((e) => studyPaths.has(e.path)).map((e) => e.path);
const zeknovaNamed = [...studyPaths].filter((p) => /zeknova/i.test(p));
const r0 = {
  artifacts: Object.fromEntries(readdirSync(r0Dir).map((f) => [f, sha256(readFileSync(resolve(r0Dir, f)))])),
  manifestInventoryPaths: manifest.inventory.length, manifestDomains: Object.keys(manifest.domains ?? {}),
  r0Certification: r0Result, studyPathsChecked: studyPaths.size, overlapWithStudy: overlap, studyPathsNamedZeknova: zeknovaNamed,
  effectOnThisDevStudy: overlap.length === 0 && zeknovaNamed.length === 0 ? 'NONE: the baseline-manifest inventory (Prime/router/authority/provider-bridge runtime identity) shares no path with this study\'s import closure, data inputs or exclusion sources' : 'REVIEW_REQUIRED',
  claim: 'No runtime-identity certification is claimed or implied. FULL_STAGE3H_CERTIFIED stays false.',
};
gates.r0DriftDoesNotTouchDevStudy = overlap.length === 0 && zeknovaNamed.length === 0;

const pass = Object.values(gates).every(Boolean);
const out = { schema: 'H_W1_DEV_I0_SOURCE_INTEGRITY_V1', authority: 'R0', checkedAt: new Date().toISOString(), nodeVersion: process.version, baseCommit: BASE_COMMIT, head: git(['rev-parse', 'HEAD']),
  armStressRule: armStress, v4HistoricalRule: v4, comparators,
  contract: { path: repoRel(CJ), sha256: contractSha, mdSha256: sha256(readFileSync(CM)), crossChecks: rows.length, crossChecksFailed: contractFailures.length, failures: contractFailures, table: rows, expectedSupersession, planNumbering },
  frozenSources: { baseCommit: BASE_COMMIT, categories: frozen, nonLaneUniqueFiles: nonLaneFiles.length, nonLaneFilesSha256: setHash(nonLaneFiles),
    nonLaneFiles: nonLaneFiles.map((f) => ({ path: f.path, bytes: f.bytes, sha256: f.sha256, ...(f.protectedOverlay ? { protectedOverlay: true, matchesRecordedProtectedIdentity: f.matchesRecordedProtectedIdentity } : { gitBlob: f.gitBlob, sinceBase: f.sinceBase }) })),
    laneFilesAtI0: laneFiles.map((f) => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 })),
    nonLaneFilesChangedSinceBase: changed.map((f) => f.path), nonLaneFilesAddedAfterBase: added.map((f) => f.path), nonLaneUntracked: untrackedNonLane.map((f) => f.path), nonLaneModifiedInWorkingTree: modifiedInWorkingTree.map((f) => f.path),
    overlayDependency, unresolvedImports: unresolvedAll, nativeVersionIdentifiers: nativeVersionIds, functionBytes: functionHashes },
  exclusionAuthority: excl, r0RuntimeIdentity: r0, gates, pass,
  notes: ['Closure hashing follows static relative imports only. Data files read at runtime are recorded separately (S0 model json, exclusion sources, dev-runs rows, contract).', 'Lane files (stage3h-hw1-dev-v1) are new code written for this study; their I-0 hashes are recorded for orientation, and later lane changes are tracked by git, not by this record.', 'Overlay files are identified by path and sha256 only (no blob ids and no contents), consistent with committed precedent (ascii-quality-v33_1/inheritance.json).'] };
if (process.argv.includes('--write')) { if (!pass) throw Error('I0_SOURCE_INTEGRITY_NOT_CLEAN_NOT_RECORDED'); writeExclusive(resolve(LANE, 'evidence/I0_SOURCE_INTEGRITY.json'), out); }
console.log(JSON.stringify({ pass, gates, armStress: { ARM_STRESS_RULE_HASH: rule.sha256, lines: [rule.startLine, rule.endLine], admitted: armStress.admitted, sinceBase: searchRec.sinceBase, lastCommit },
  v4: { recomputed: v4Hash, matches: v4Hash === V4_RULE_HASH }, contract: { sha256: contractSha, checks: rows.length, failed: contractFailures.map((r) => r.id) },
  frozen: Object.fromEntries(Object.entries(frozen).map(([k, v]) => [k, { files: v.fileCount, sha: v.closureSha256.slice(0, 12) }])), nonLaneUniqueFiles: nonLaneFiles.length, overlay: { files: overlayDependency.files, allMatchRecordedIdentity: overlayDependency.allMatchRecordedIdentity },
  changedSinceBase: changed.map((f) => f.path), addedAfterBase: added.map((f) => f.path), untrackedNonLane: untrackedNonLane.map((f) => f.path), modifiedInWorkingTree: modifiedInWorkingTree.map((f) => f.path), unresolved: unresolvedAll,
  nativeVersionIds, exclusion: { counts: excl.counts, blocks: excl.blocksPresent }, r0: { overlap, zeknovaNamed, effect: r0.effectOnThisDevStudy } }, null, 1));
