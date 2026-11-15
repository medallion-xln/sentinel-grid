// SK1 Gate 3 — reasoning and generalisation test record. Runs the whole test suite, measures latency and memory of the
// FROZEN model on the committed demo requests, and records the second-game adapter status. Decision competence in the
// second game is NOT measured and NOT claimed.
//   /opt/homebrew/bin/node analysis/gate3-record.mjs [--write]
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRecommendationApi } from '../api/recommend.mjs';
import { auditInferenceGraph } from '../infra/graph-audit.mjs';
import { LANE, EVIDENCE, readJ, fileSha, writeExclusive } from '../infra/common.mjs';

const files = readdirSync(resolve(LANE, 'tests')).filter((n) => n.endsWith('.test.mjs')).sort(), suites = {};
for (const f of files) { const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', resolve(LANE, 'tests', f)], { encoding: 'utf8', cwd: LANE });
  const tests = [...r.stdout.matchAll(/^(not ok|ok) \d+ - (.*?)(?: # (SKIP|TODO).*)?$/gm)].map((m) => ({ name: m[2], result: m[3] === 'SKIP' ? 'SKIPPED' : m[1] === 'ok' ? 'PASS' : 'FAIL' }));
  suites[f] = { exit: r.status, tests: tests.length, pass: tests.filter((t) => t.result === 'PASS').length, fail: tests.filter((t) => t.result === 'FAIL').length, skipped: tests.filter((t) => t.result === 'SKIPPED').length, names: tests }; }
const api = createRecommendationApi({ game: 'forge' }), perf = {};
for (const which of ['recommend', 'abstain']) { const { note, ...rq } = readJ(resolve(LANE, `demo/fixtures/forge-request-${which}.json`)), ms = [], h0 = process.memoryUsage().heapUsed; let hash = null, same = true;
  for (let i = 0; i < 300; i++) { const t = performance.now(), rec = api.recommend(rq.state, rq.legalActions, rq.advisoryEvidence); ms.push(performance.now() - t); if (hash === null) hash = rec.decisionHash; else if (rec.decisionHash !== hash) same = false; }
  ms.sort((a, b) => a - b); perf[which] = { decisions: ms.length, medianMs: +ms[150].toFixed(3), p95Ms: +ms[285].toFixed(3), maxMs: +ms[299].toFixed(3), heapGrowthMiB: +((process.memoryUsage().heapUsed - h0) / 1048576).toFixed(2), deterministic: same, menuSize: rq.legalActions.length }; }
const g = auditInferenceGraph(LANE), all = Object.values(suites), total = (k) => all.reduce((s, x) => s + x[k], 0);
const need = { 'opaque identity permutations': /opaque identity permutation/, 'native menu-order permutations': /menu-order permutation/, 'applicable D4 transformations': /D4 frames/, 'missing observation fields': /missing observation field/, 'public-content-equivalent hidden twins': /identity audit on spent development classes/, 'unsupported expert outputs': /unsupported expert output/,
  'contradictory advisory evidence': /contradictory expert evidence/, 'risk-estimator uncertainty': /out-of-distribution numeric feature|risk above the frozen criterion/, 'missing safe-candidate predictions': /no model for the observation contract|novel category/, 'deterministic replay': /deterministic replay/, 'inference latency and memory limits': /latency and memory/ };
const names = all.flatMap((s) => s.names), coverage = Object.fromEntries(Object.entries(need).map(([k, re]) => { const hit = names.filter((t) => re.test(t.name)); return [k, { tests: hit.map((t) => t.name), result: hit.length && hit.every((t) => t.result === 'PASS') ? 'PASS' : hit.some((t) => t.result === 'FAIL') ? 'FAIL' : 'NOT_RUN' }]; }));
const model = readJ(resolve(LANE, 'models/SK1_MODEL.json'));
const out = { schema: 'SK1_GATE3_TESTS_V1', authority: 'R0', stage: 'STAGE3H-SK1 Gate 3', recordedAt: new Date().toISOString(), node: process.version, suites, totals: { tests: total('tests'), pass: total('pass'), fail: total('fail'), skipped: total('skipped') }, requiredCoverage: coverage,
  zeroProhibitedInferenceDependencies: g.evaluatorFree && g.violations.length === 0, inferenceClosure: { files: g.fileCount, closureSha256: g.closureSha256 }, frozenModel: { modelId: model.modelId, modelHash: model.modelHash, fileBytes: statSync(resolve(LANE, 'models/SK1_MODEL.json')).size, sha256: fileSha(resolve(LANE, 'models/SK1_MODEL.json')) },
  latencyAndMemoryWithFrozenModel: { budget: { medianMs: 100, maxMs: 1000 }, ...perf },
  secondGame: { game: 'reference-grid-rescue (src/adapters/reference-rescue)', adapter: 'adapters/rescue/adapter.mjs', mechanicsChanged: false, status: 'ADAPTER_CONSTRUCTED_API_PORTABLE', riskModel: 'NONE', kernelBehaviour: 'complete menu inspected and ranked on public semantics; every risk estimate UNSUPPORTED_NO_MODEL; abstains',
    decisionGain: 'NOT_MEASURED', statement: 'Architectural portability only. Forge catastrophe semantics were not transferred by assumption, no risk model was developed for this game, and no decision competence is claimed.' },
  identityAuditOnFreshClasses: 'reported with the Gate 4 result (every VALIDATION class, before any outcome is unlocked)',
  gate3: total('fail') === 0 && Object.values(coverage).every((c) => c.result === 'PASS') && g.evaluatorFree ? 'PASS' : 'FAIL' };
console.log(JSON.stringify({ totals: out.totals, coverage: Object.fromEntries(Object.entries(coverage).map(([k, v]) => [k, v.result])), perf, graph: g.evaluatorFree, gate3: out.gate3 }, null, 1));
if (process.argv.includes('--write')) { writeExclusive(resolve(EVIDENCE, 'SK1_GATE3_TESTS.json'), out); console.log('written evidence/SK1_GATE3_TESTS.json'); }
