import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FUTURE_CERTIFIER_PATTERN, INVARIANT_ID } from '../scripts/certification/check-mode-guard.mjs';
import { CHECKS } from '../scripts/reproducibility/stage3f-chain.mjs';
import { CR_CERTIFICATE, CR_CERTIFIER, EXPECTED_FACTS, EXPERTS, FREEZE_PATH, INFRASTRUCTURE, LINEAGE, MEASUREMENT_CERTIFIER_PATTERN, QUALIFICATIONS, RESULT_PATH, buildFreeze }
  from '../scripts/stage3f-freeze.mjs';
import { AUTHORITY, CLAIM_MAP_PATH, CONTRACT_PATH, decisionEvaluationContract } from '../scripts/stage3f6cr-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const top = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const serialise = (v) => `${JSON.stringify(v, null, 2)}\n`;
const frozen = existsSync(at(FREEZE_PATH));
const freeze = buildFreeze();
const guardUrl = pathToFileURL(at('scripts/certification/check-mode-guard.mjs')).href;
const runtimeUrl = pathToFileURL(at('scripts/reproducibility/canonical-runtime.mjs')).href;
const status = () => spawnSync('git', ['-C', top, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).stdout;
const child = (source, env = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', ...env } });

test('the freeze builds deterministically and matches the committed artifact byte for byte', { skip: !frozen && 'freeze artifact not yet written' }, () => {
  assert.equal(serialise(buildFreeze()), serialise(freeze));
  assert.equal(readFileSync(at(FREEZE_PATH), 'utf8'), serialise(freeze));
  const { freezeHash, ...rest } = readJson(FREEZE_PATH);
  assert.equal(freezeHash, hex(JSON.stringify(rest)));
});

test('the freeze binds the certified Stage 3F.6-CR record on the canonical lineage', () => {
  const cr = readJson(CR_CERTIFICATE);
  assert.equal(cr.status, 'PASS');
  assert.equal(cr.conclusion.STAGE3F_SCIENTIFIC_COMPLETE, true);
  assert.equal(freeze.lineage.CANONICAL_BRANCH, 'main');
  assert.equal(freeze.lineage.CANONICAL_PARENT_COMMIT, LINEAGE.CONFIRMATORY_COMMIT);
  assert.equal(freeze.bound.CONFIRMATORY_CERTIFICATE_HASH.value, 'd78186b8b828171635d47ac5757d5ac6aa113aa1058c490e98395730c7cfb7e2');
  assert.equal(freeze.bound.CONFIRMATORY_CERTIFICATE_HASH.value, cr.certificationHash);
  assert.equal(freeze.bound.STAGE3FRP_CERTIFICATE_HASH.value, '30f4fd3478da7097d309390dd64438026fe536a94ba18a07f9fe31e176d49b5a');
  assert.equal(freeze.newScientificEvidence, false);
  assert.equal(freeze.measurementStage, false);
  assert.equal(freeze.stage3gStarted, false);
});

test('immutable facts: exactly the confirmed 18, equal to the certified candidate, each supported by a claim-map claim', () => {
  const cr = readJson(CR_CERTIFICATE);
  const f = freeze.sections.immutableFacts;
  assert.deepEqual(f.values, { ...EXPECTED_FACTS });
  assert.equal(Object.keys(f.values).length, 18);
  for (const [k, v] of Object.entries(f.values)) {
    assert.equal(cr.immutableFactsCandidate[k].value, v, k);
    assert.equal(cr.immutableFactsCandidate[k].supported, true, k);
    assert.ok(f.facts[k].evidence.length > 0, k);
    assert.ok(readJson(CLAIM_MAP_PATH).claims.some((c) => c.id === f.facts[k].claim.id), k);
  }
  assert.equal(freeze.bound.IMMUTABLE_FACTS_HASH, hex(JSON.stringify(f)));
});

test('fact qualifications are preserved exactly and are not generalized', () => {
  const q = freeze.sections.immutableFacts.qualifications;
  assert.equal(q.TRANSITION_PREDICTION_REQUIRED.means, 'transition prediction is not the first demonstrated bottleneck; only one-step successor value has been measured.');
  assert.equal(q.TRANSITION_PREDICTION_REQUIRED.doesNotMean, 'multistep predictive world models have been disproven.');
  assert.equal(q.POLICY_QUALITY_PRIMARY_BOTTLENECK.means, 'policy quality dominates selection/routing limitations on the certified corpus.');
  assert.match(q.POLICY_QUALITY_PRIMARY_BOTTLENECK.doesNotMean, /not generalized beyond that evidence/);
  assert.deepEqual(Object.keys(q), Object.keys(QUALIFICATIONS));
  for (const k of Object.keys(q)) assert.equal(typeof q[k].certifiedQualification, 'string', k);
});

test('hash-type discipline: bound semantic hashes and raw file hashes are both recorded, labelled and never substituted', () => {
  const b = freeze.bound;
  assert.equal(b.CLAIM_MAP_BOUND_SEMANTIC_HASH, '97e556f502ea42d818f1764e17314ef6cc6f435214ba52fd3a9680e897026350');
  assert.equal(b.CLAIM_MAP_RAW_FILE_SHA256, hex(readFileSync(at(CLAIM_MAP_PATH))));
  assert.notEqual(b.CLAIM_MAP_BOUND_SEMANTIC_HASH, b.CLAIM_MAP_RAW_FILE_SHA256);
  assert.equal(b.DECISION_EVALUATION_CONTRACT_BOUND_SEMANTIC_HASH, '10c301884539c5cfb21d95795191217b98762a98aacfab8eab4207c87cbec90e');
  assert.equal(b.DECISION_EVALUATION_CONTRACT_RAW_FILE_SHA256, hex(readFileSync(at(CONTRACT_PATH))));
  assert.notEqual(b.DECISION_EVALUATION_CONTRACT_BOUND_SEMANTIC_HASH, b.DECISION_EVALUATION_CONTRACT_RAW_FILE_SHA256);
  assert.equal(b.ERRATUM_HASH.type, 'RAW_FILE_SHA256');
  assert.equal(b.ERRATUM_HASH.BOUND_SEMANTIC_HASH, null);
  for (const [k, v] of Object.entries(b)) if (/_HASH$/.test(k) && v && typeof v === 'object' && 'type' in v) assert.ok(['BOUND_SEMANTIC_HASH', 'RAW_FILE_SHA256'].includes(v.type), k);
  const records = [];
  const walk = (v) => { if (v && typeof v === 'object') { if ('RAW_FILE_SHA256' in v && 'BOUND_SEMANTIC_HASH' in v && 'file' in v) records.push(v); Object.values(v).forEach(walk); } };
  walk(freeze.sections);
  assert.ok(records.length >= 15);
  for (const r of records) {
    assert.equal(r.RAW_FILE_SHA256, hex(readFileSync(at(r.file))), r.file);
    if (r.BOUND_SEMANTIC_HASH === null) continue;
    const { [r.BOUND_SEMANTIC_HASH.field]: value, ...rest } = readJson(r.file);
    assert.equal(r.BOUND_SEMANTIC_HASH.value, value, r.file);
    assert.equal(hex(JSON.stringify(rest)), value, `${r.file} semantic hash recomputes`);
    assert.notEqual(r.BOUND_SEMANTIC_HASH.value, r.RAW_FILE_SHA256, r.file);
  }
});

test('Decision Evaluation Contract v1 is bound unchanged since it was frozen', () => {
  const d = freeze.sections.decisionEvaluationContract;
  assert.equal(readFileSync(at(CONTRACT_PATH), 'utf8'), serialise(decisionEvaluationContract()));
  const g = spawnSync('git', ['-C', top, 'show', `${LINEAGE.CONFIRMATORY_PLAN_COMMIT}:platform/game-agnostic/${CONTRACT_PATH}`], { encoding: 'buffer' });
  assert.equal(g.status, 0);
  assert.equal(hex(g.stdout), hex(readFileSync(at(CONTRACT_PATH))));
  assert.deepEqual(d.metrics, { FPE: 'FACTUAL_PREDICTION_ERROR', CAD: 'COUNTERFACTUAL_ACTION_DISCRIMINATION', CR: 'COUNTERFACTUAL_REGRET', DDV: 'DOWNSTREAM_DECISION_VALUE', TCA: 'TRUST_CONDITIONED_ADVANTAGE' });
  assert.equal(d.canonicalRule, 'LOWER FACTUAL PREDICTION LOSS DOES NOT IMPLY BETTER DECISION VALUE.');
  assert.match(d.stage3iRule, /may not win solely because it achieves lower reconstruction, latent, or factual prediction loss/);
  assert.equal(d.modifiedByFreeze, false);
  assert.equal(d.worldModelImplementedHere, false);
});

test('reproducibility contract: canonical numerics required, scientific and byte reproducibility kept distinct', () => {
  const r = freeze.sections.reproducibilityContract;
  assert.equal(r.SENTINEL_CANONICAL_NUMERICS_V1_REQUIRED, true);
  assert.equal(r.CANONICAL_NUMERICS_PROFILE, 'SENTINEL_CANONICAL_NUMERICS_V1');
  assert.equal(r.SCIENTIFIC_REPRODUCIBILITY, true);
  assert.equal(r.BYTE_REPRODUCIBILITY, true);
  assert.equal(r.BYTE_REPRODUCIBILITY_CONDITION, 'ONLY_UNDER_SENTINEL_CANONICAL_NUMERICS_V1');
  assert.equal(r.HOST_NATIVE_MATH_BYTE_CANONICAL, false);
  assert.equal(r.NODE22_CERTIFIED, true);
  assert.equal(r.NODE26_CERTIFIED, true);
  assert.notEqual(r.distinction.SCIENTIFIC_REPRODUCIBILITY, r.distinction.BYTE_REPRODUCIBILITY);
  assert.equal(r.profile.moduleSha256, hex(readFileSync(at('src/core/canonical-numerics-v1.js'))));
});

test('Stage 3G entry requirements: exact frozen list, planned items not mandatory, unsupported items excluded', () => {
  const r = freeze.sections.stage3gEntryRequirements;
  assert.deepEqual(Object.keys(r.required), ['OBSERVABLE_ENTITY_STATE_REQUIRED', 'ACTOR_RELATIVE_SPATIAL_REPRESENTATION_REQUIRED', 'ACTION_RELATIVE_SPATIAL_REPRESENTATION_REQUIRED',
    'STRUCTURED_ACTION_SEMANTICS_REQUIRED', 'PREDICTION_LIFECYCLE_REQUIRED', 'COUNTERFACTUAL_DISCRIMINATION_EVALUATION_REQUIRED', 'COUNTERFACTUAL_REGRET_EVALUATION_REQUIRED',
    'DOWNSTREAM_DECISION_VALUE_EVALUATION_REQUIRED', 'STAGE_WISE_FAILURE_ATTRIBUTION_REQUIRED', 'EPISTEMIC_PROVENANCE_REQUIRED']);
  for (const v of Object.values(r.required)) assert.equal(v.value, true);
  assert.deepEqual(Object.fromEntries(Object.entries(r.planned).map(([k, v]) => [k, [v.value, v.mandatoryImplementation]])),
    { WORLD_MODEL_TRUST_GATE: ['PLANNED', false], TASK_STATE_CONTAMINATION_TRACKING: ['PLANNED', false] });
  assert.deepEqual(Object.fromEntries(Object.entries(r.notRequired).map(([k, v]) => [k, v.value])),
    { LARGE_LEARNED_WORLD_MODEL: false, JEPA_REQUIRED: false, GENERATIVE_WORLD_MODEL_REQUIRED: false, ROUTER_2_0_REQUIRED: false, EXPERT_10_REQUIRED: false, AUTHORITY_INCREASE_REQUIRED: false });
  const sources = new Set([...Object.values(r.required), ...Object.values(r.planned)].map((v) => v.source));
  for (const q of readJson('artifacts/stage3f6cr-confirmatory-reconciliation/stage3f6cr-reconciliation-plan.json').inheritedRequirements.requirements) assert.ok(sources.has(q.id), q.id);
  assert.equal(freeze.bound.STAGE3G_ENTRY_REQUIREMENTS_HASH, hex(JSON.stringify(r)));
});

test('epistemic provenance is required but no level schema is frozen', () => {
  const e = freeze.sections.epistemicProvenance;
  assert.equal(e.EPISTEMIC_PROVENANCE_REQUIRED, true);
  assert.equal(e.EPISTEMIC_LEVEL_SCHEMA, 'TO_BE_DEFINED_IN_STAGE3G');
  assert.equal(e.E0_E5_TAXONOMY_FROZEN, false);
  assert.equal(e.repositoryContractExists, false);
  assert.doesNotMatch(JSON.stringify(e), /"E[0-5]"\s*:/);
  assert.equal(freeze.sections.stage3gEntryRequirements.required.EPISTEMIC_PROVENANCE_REQUIRED.EPISTEMIC_LEVEL_SCHEMA, 'TO_BE_DEFINED_IN_STAGE3G');
});

test('architecture: exactly nine experts, Forge unchanged, infrastructure is not an expert, no Expert #10', () => {
  const a = freeze.sections.architectureRoster;
  assert.equal(a.EXPERT_COUNT, 9);
  assert.deepEqual(a.experts, ['Prime', 'Vanguard', 'Oracle', 'Nexus', 'Horizon', 'Archimedes', 'Alexandria', 'Picasso', 'Forge']);
  assert.deepEqual(a.experts, [...EXPERTS]);
  assert.equal(new Set(a.experts).size, 9);
  assert.deepEqual(a.infrastructureNotExperts, [...INFRASTRUCTURE]);
  for (const i of a.infrastructureNotExperts) assert.ok(!a.experts.includes(i), i);
  assert.equal(a.rules.EXPERT_10_ADDED, false);
  assert.match(a.rules.FORGE, /^EXPERT/);
  assert.equal(a.rules.FORGE_WORLD, 'INFRASTRUCTURE');
  assert.equal(freeze.bound.ARCHITECTURE_ROSTER_HASH, hex(JSON.stringify(a)));
});

test('authority stays R0 and Stage 3F completion implies no promotion', () => {
  const a = freeze.sections.authorityState;
  assert.deepEqual([a.AUTHORITY, a.CAN_DISPATCH, a.CAN_MUTATE_LIVE_WORLD, a.ONLINE_LEARNING_ENABLED, a.PROMOTED_TO_LIVE_RUNTIME], ['R0', false, false, false, false]);
  assert.deepEqual(a.canonicalForm, AUTHORITY);
  assert.equal(a.STAGE3F_COMPLETION_IMPLIES_PROMOTION, false);
  assert.deepEqual(freeze.authority, AUTHORITY);
  assert.equal(freeze.bound.AUTHORITY_STATE_HASH, hex(JSON.stringify(a)));
});

test('certifier-chain exception: the CR certifier keeps its name outside the chain; every measurement certifier stays inside', () => {
  const c = freeze.sections.certifierChainException;
  assert.equal(c.CR_CERTIFIER, 'scripts/stage3f6cr-certify.mjs');
  assert.equal(c.CR_CERTIFIER, CR_CERTIFIER);
  assert.ok(existsSync(at(CR_CERTIFIER)));
  assert.equal(c.CERTIFIER_CHAIN_EXCEPTION_DOCUMENTED, true);
  assert.equal(c.renamed, false);
  assert.equal(MEASUREMENT_CERTIFIER_PATTERN.test(path.basename(CR_CERTIFIER)), false);
  assert.ok(!CHECKS.some((k) => k.run.includes(CR_CERTIFIER)));
  const scripts = readdirSync(at('scripts'));
  for (const f of scripts.filter((x) => MEASUREMENT_CERTIFIER_PATTERN.test(x) && !x.includes('stage3frp'))) assert.ok(CHECKS.some((k) => k.run.includes(`scripts/${f}`)), f);
  for (const f of ['stage3f-freeze.mjs', 'stage3f-freeze-certify.mjs']) assert.equal(MEASUREMENT_CERTIFIER_PATTERN.test(f), false, f);
});

test('the symmetric chain and the erratum are bound; historical Stage 3F.6 stays not reproducible', () => {
  const s = freeze.sections.symmetricChain;
  assert.deepEqual(s.order, ['3F6P1C', '3F6P1D', '3F6P1E', 'T_SYM', 'P1A_SYM', 'P1_SYM', 'W_SYM', 'D_SYM_FREEZE', 'D_SYM']);
  assert.deepEqual(freeze.bound.SYMMETRIC_CHAIN_ROOT_HASHES, Object.fromEntries(Object.entries(s.stages).map(([id, r]) => [id, r.BOUND_SEMANTIC_HASH.value])));
  assert.equal(freeze.sections.erratum.erratumId, 'STAGE3F6-ERRATUM-001');
  assert.equal(freeze.sections.erratum.historicalStage3F6.REPRODUCIBLE, false);
  assert.match(freeze.sections.erratum.historicalStage3F6.status, /^SUPERSEDED_NOT_REPRODUCIBLE_AT_ANY_COMMIT/);
});

/* ------------------------------------------------ CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE */

test('check-mode guard: every tracked write is refused (identical rewrites included); untracked build output passes', () => {
  const target = at('package.json');
  const before = readFileSync(target);
  const scratch = at('build/stage3f-freeze/guard-test');
  rmSync(scratch, { recursive: true, force: true });
  const r = child(`
    import { writeFileSync, readFileSync, mkdirSync, rmSync, renameSync, appendFileSync, openSync } from 'node:fs';
    import { writeFile, rm } from 'node:fs/promises';
    import { enforceCheckModeReadOnly } from ${JSON.stringify(guardUrl)};
    const guard = enforceCheckModeReadOnly({ checkOnly: true });
    const refused = [];
    const attempt = async (name, fn) => { try { await fn(); } catch (e) { if (/${INVARIANT_ID}/.test(e.message)) refused.push(name); else throw e; } };
    await attempt('identical', () => writeFileSync(${JSON.stringify(target)}, readFileSync(${JSON.stringify(target)})));
    await attempt('differing', () => writeFileSync(${JSON.stringify(target)}, 'MUTATED'));
    await attempt('append', () => appendFileSync(${JSON.stringify(target)}, 'x'));
    await attempt('async', () => writeFile(${JSON.stringify(target)}, 'MUTATED'));
    await attempt('rename', () => renameSync(${JSON.stringify(target)}, ${JSON.stringify(path.join(scratch, 'moved'))}));
    await attempt('open', () => openSync(${JSON.stringify(target)}, 'r+'));
    await attempt('rm-dir', () => rm(${JSON.stringify(at('scripts'))}, { recursive: true }));
    mkdirSync(${JSON.stringify(scratch)}, { recursive: true });
    writeFileSync(${JSON.stringify(path.join(scratch, 'untracked.json'))}, '{}');
    console.log(JSON.stringify({ refused, attempts: guard.attempts().length }));
  `);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { refused: ['identical', 'differing', 'append', 'async', 'rename', 'open', 'rm-dir'], attempts: 7 });
  assert.deepEqual(readFileSync(target), before);
  assert.ok(existsSync(path.join(scratch, 'untracked.json')));
  rmSync(scratch, { recursive: true, force: true });
});

test('check-mode guard: a tracked change that bypasses fs still fails the process at exit (throwaway repository)', () => {
  const repo = at('build/stage3f-freeze/guard-repo');
  rmSync(repo, { recursive: true, force: true });
  mkdirSync(repo, { recursive: true });
  const g = (...a) => spawnSync('git', ['-C', repo, '-c', 'user.email=freeze@test', '-c', 'user.name=freeze-test', ...a], { encoding: 'utf8' });
  assert.equal(g('init', '-q').status, 0);
  spawnSync(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(repo, 'tracked.txt'))}, 'a')`]);
  assert.equal(g('add', 'tracked.txt').status, 0);
  assert.equal(g('commit', '-q', '-m', 'init').status, 0);
  const run = (mutate) => spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { enforceCheckModeReadOnly } from ${JSON.stringify(guardUrl)};
    import { spawnSync } from 'node:child_process';
    enforceCheckModeReadOnly({ checkOnly: true, cwd: ${JSON.stringify(repo)} });
    if (${mutate}) spawnSync(process.execPath, ['-e', "require('fs').appendFileSync(${JSON.stringify(path.join(repo, 'tracked.txt')).replace(/"/g, '\\"')}, 'b')"]);
  `], { cwd: repo, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  assert.equal(run(false).status, 0);
  const changed = run(true);
  assert.equal(changed.status, 3);
  assert.match(changed.stderr, new RegExp(INVARIANT_ID));
  rmSync(repo, { recursive: true, force: true });
  const inactive = child(`import { enforceCheckModeReadOnly } from ${JSON.stringify(guardUrl)}; console.log(JSON.stringify(enforceCheckModeReadOnly({ checkOnly: false }).active));`);
  assert.equal(inactive.stdout.trim(), 'false');
});

test('every certification script from the Stage 3F freeze onward installs the check-mode guard', () => {
  const scripts = readdirSync(at('scripts')).filter((f) => FUTURE_CERTIFIER_PATTERN.test(f));
  assert.ok(scripts.includes('stage3f-freeze.mjs') && scripts.includes('stage3f-freeze-certify.mjs'));
  for (const f of scripts) {
    const s = readFileSync(at(`scripts/${f}`), 'utf8');
    assert.match(s, /import \{[^}]*enforceCheckModeReadOnly[^}]*\} from '\.\/certification\/check-mode-guard\.mjs'/, `${f} imports the guard`);
    assert.match(s, /enforceCheckModeReadOnly\(\{ checkOnly/, `${f} installs the guard`);
  }
  for (const historical of ['certify-stage3f6d-decision-rule.mjs', 'stage3f6cr-certify.mjs', 'certify-stage3frp-reproducibility-portability.mjs']) assert.equal(FUTURE_CERTIFIER_PATTERN.test(historical), false, historical);
  for (const future of ['certify-stage3g-entity-state.mjs', 'stage3g-plan.mjs', 'certify-stage4-prime.mjs']) assert.equal(FUTURE_CERTIFIER_PATTERN.test(future), true, future);
});

test('the freeze --check runs read-only: zero tracked-write attempts and an unchanged tracked tree', { skip: !frozen && 'freeze artifact not yet written' }, () => {
  const logDir = at('build/stage3f-freeze/readonly-log');
  rmSync(logDir, { recursive: true, force: true });
  mkdirSync(logDir, { recursive: true });
  const before = status();
  const r = spawnSync(process.execPath, ['scripts/stage3f-freeze.mjs', '--check'], { cwd: root, encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: `--import=${runtimeUrl}`, SENTINEL_READONLY: '1', SENTINEL_REPRO_LOG: logDir } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).reproduced, true);
  assert.equal(status(), before);
  const events = readdirSync(logDir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(path.join(logDir, f), 'utf8')).events);
  assert.deepEqual(events, []);
  rmSync(logDir, { recursive: true, force: true });
});

test('historical check-mode exceptions are documented, not retrofitted', () => {
  const c = freeze.sections.checkModeInvariant;
  assert.equal(c.CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE, true);
  const audit = readJson('artifacts/stage3frp-reproducibility-portability/stage3frp-certification-result.json').checkModeAudit;
  const writers = Object.entries(audit).filter(([, a]) => a.CHECK_MODE_WRITES_TRACKED_FILES).map(([f]) => f);
  assert.deepEqual(c.historicalExceptions.certifiers.map((x) => x.certifier), writers);
  for (const x of c.historicalExceptions.certifiers) {
    assert.equal(x.retrofitted, false);
    assert.equal(x.certifierRawSha256, hex(readFileSync(at(x.certifier))), x.certifier);
    assert.equal(FUTURE_CERTIFIER_PATTERN.test(path.basename(x.certifier)), false, x.certifier);
  }
});

test('the freeze certificate, when present, is self-consistent and marks Stage 3G ready only on PASS', () => {
  if (!existsSync(at(RESULT_PATH))) return;
  const c = readJson(RESULT_PATH);
  const { certificationHash, ...rest } = c;
  assert.equal(certificationHash, hex(JSON.stringify(rest)));
  assert.equal(c.conclusion.STAGE3F_STATUS === 'FROZEN', c.status === 'PASS');
  assert.equal(c.conclusion.READY_FOR_STAGE3G, c.status === 'PASS');
  assert.equal(c.conclusion.STAGE3G_STARTED, false);
  assert.deepEqual(c.authority, AUTHORITY);
});

test('freeze sources contain no nondeterminism and no world-model or expert code', () => {
  for (const f of ['scripts/stage3f-freeze.mjs', 'scripts/stage3f-freeze-certify.mjs', 'scripts/certification/check-mode-guard.mjs']) {
    const s = readFileSync(at(f), 'utf8');
    assert.doesNotMatch(s, /Math\.random|Date\.now|new Date\(|performance\.now|os\.hostname|process\.version\b/, f);
    assert.doesNotMatch(s, /from '\.\.\/src\/(stage3f|lab)\//, f);
  }
});
