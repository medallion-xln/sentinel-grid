// HDISC_PORTABLE_EXCLUSIONS_V1 — tests. Run: node --test readiness/exclusions/*.test.mjs
// Equivalence tests need the HISTORICAL loaders, which import only where the custody-protected overlay is present; in a
// clean checkout they are skipped with a message and the pinned-identity tests stand in for them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from './portable-exclusions.mjs';
import { runSelfCheck } from './selfcheck.mjs';
import { runCleanCheckoutProbe, importsOf } from './clean-checkout.mjs';
import { verifyPins, PINS_FILE, sourceHashes } from './pin-inputs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GA = P.GA_DEFAULT;
let H = null, Hsk1 = null, why = null;
try { H = await import('../../../stage3h-sk1-safety-kernel-v1/successor/exclusions-v2.mjs'); Hsk1 = await import('../../../stage3h-sk1-safety-kernel-v1/infra/exclusions.mjs'); } catch (e) { why = 'historical loaders cannot be imported here (' + String(e.message).split('\n')[0].slice(0, 90) + ')'; }
const needHistorical = { skip: H ? false : why }, IN_GIT = existsSync(resolve(GA, '../../.git'));
const ctx = P.loadPortableExclusions(), pins = existsSync(PINS_FILE) ? JSON.parse(readFileSync(PINS_FILE, 'utf8')) : null;

test('the loader imports node built-ins only and reads tracked records only', () => {
  const imports = importsOf(readFileSync(resolve(HERE, 'portable-exclusions.mjs'), 'utf8')); assert.ok(imports.length > 0 && imports.every((s) => s.startsWith('node:')), imports.join(','));
  const files = P.inputFiles(); assert.equal(files.length, 26); assert.ok(files.every((r) => /^[0-9a-f]{64}$/.test(r.sha256)));
  assert.ok(files.every((r) => !/(^|\/)work\//.test(r.file) && !/stage3h-canonical-v1|ascii-suite/.test(r.file)), 'no privileged or protected path among the inputs');
});

test('EQUIVALENCE: the embedded constants equal the historical ones', needHistorical, async () => {
  const alloc = await import('../../../stage3h-owner-governed-v1/allocate-namespaces-v4.mjs'), pcd = await import('../../../stage3h-hw1-dev-v1/i2-pcd.mjs'), reg = await import('../../../stage3h-hw1-dev-v1/i2-registry.mjs');
  const common = await import('../../../stage3h-sk1-safety-kernel-v1/infra/common.mjs'), closure = await import('../../../stage3h-safety-feasibility-v1/closure/exclusions.mjs'), strict = await import('../../../stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs');
  assert.deepEqual(Object.keys(alloc.EXCLUDED_BLOCKS).map(Number), [...P.EXCLUDED_BLOCKS_0364164C]); assert.equal(pcd.PCD_VERSION, P.PCD_VERSION); assert.equal(reg.REGISTRY_SCHEMA, P.PCD_REGISTRY_SCHEMA);
  assert.equal(common.BLOCK, P.BLOCK); assert.equal(common.PER_BLOCK, P.PER_BLOCK); assert.equal(closure.BLOCK, P.BLOCK); assert.deepEqual({ ...closure.EXCLUSION_FILES }, { ...P.EXCLUSION_FILES }); assert.equal(strict.INDEX_FORMAT, P.INDEX_FORMAT); assert.equal(Hsk1.REGISTRY_SCHEMA, P.SK1_REGISTRY_SCHEMA);
});

test('EQUIVALENCE: the portable context is identical to loadSuccessorExclusions()', needHistorical, () => {
  const h = H.loadSuccessorExclusions(), a = P.contextIdentity(ctx), b = P.contextIdentity(h);
  assert.deepEqual(a, b); assert.equal(a.forbiddenBlocks, 114); assert.equal(a.registries.length, 10);
  assert.deepEqual(Object.entries(ctx.forbidden).sort(), Object.entries(h.forbidden).sort());
  assert.equal(ctx.strict.index.worlds.size, h.strict.index.worlds.size); assert.equal(ctx.strict.index.seeds.size, h.strict.index.seeds.size);
  assert.equal(JSON.stringify(ctx.registry), JSON.stringify(h.registry)); assert.equal(ctx.ledgerSha256, h.ledgerSha256); assert.equal(ctx.successorOf, h.successorOf);
});

test('EQUIVALENCE: identical verdicts on a battery of probe vectors', needHistorical, () => {
  const h = H.loadSuccessorExclusions(); let probes = 0; const same = (a, b, what) => { probes++; assert.deepEqual(a, b, what); };
  // every block the 12-digit rule admits, plus malformed ones
  for (let b = 90; b <= 1010; b++) same(P.blockFailures(ctx, b), H.blockFailures(h, b), 'block ' + b);
  for (const b of [0, -3, 12.5, NaN, 1e12, '801']) same(P.blockFailures(ctx, b), H.blockFailures(h, b), 'block ' + String(b));
  // every block touched by an individually excluded seed
  for (const b of new Set([...ctx.strict.index.seeds.keys()].map((s) => Math.floor(s / P.BLOCK)))) same(P.blockFailures(ctx, b), H.blockFailures(h, b), 'seed block ' + b);
  // spent world identities: a deterministic sample from every source
  const bySource = new Map(); for (const [hash, src] of ctx.strict.sources) { const k = src.join('+'), a = bySource.get(k) ?? bySource.set(k, []).get(k); if (a.length < 60) a.push(hash); }
  const clean = { fine: 'a'.repeat(64), coarse: 'b'.repeat(64) };
  for (const hashes of bySource.values()) for (const w of hashes) same(P.admission(ctx, w, clean), H.admission(h, w, clean), 'world');
  // spent public-class identities: a sample from every registry, at both key levels
  for (const reg of ctx.regs) { const step = Math.max(1, Math.floor(reg.entries.length / 40));
    for (let i = 0; i < reg.entries.length; i += step) { const e = reg.entries[i]; same(P.admission(ctx, 'c'.repeat(64), { fine: 'd'.repeat(64), coarse: e.coarse }), H.admission(h, 'c'.repeat(64), { fine: 'd'.repeat(64), coarse: e.coarse }), reg.name);
      if (e.fine) same(P.admission(ctx, 'c'.repeat(64), { fine: e.fine, coarse: 'd'.repeat(64) }), H.admission(h, 'c'.repeat(64), { fine: e.fine, coarse: 'd'.repeat(64) }), reg.name); } }
  // clean and malformed identities
  for (const w of ['e'.repeat(64), 'f'.repeat(64), 'not-a-hash', 'E'.repeat(64), null]) same(P.admission(ctx, w, clean), H.admission(h, w, clean), 'clean or malformed');
  // whole populations
  const e0 = ctx.regs[9].entries[0], prior = [...ctx.strict.sources.keys()][0];
  const pop = [{ id: 'A', block: 100, worldHash: 'e'.repeat(64), fine: clean.fine, coarse: clean.coarse }, { id: 'B', block: 905, worldHash: 'e'.repeat(64), fine: clean.fine, coarse: clean.coarse }, { id: 'C', block: 100, worldHash: prior, fine: clean.fine, coarse: clean.coarse },
    { id: 'D', block: 100, worldHash: 'e'.repeat(64), memberHashes: [prior], fine: clean.fine, coarse: clean.coarse }, { id: 'E', block: 100, worldHash: 'e'.repeat(64), fine: e0.fine, coarse: e0.coarse }, { id: e0.id, block: 100, worldHash: 'e'.repeat(64), fine: e0.fine, coarse: e0.coarse, ownRegistry: e0.source }, { id: 'G', block: 731, worldHash: 'e'.repeat(64), fine: clean.fine, coarse: clean.coarse }];
  same(P.contamination(ctx, pop), H.contamination(h, pop), 'population'); assert.ok(probes > 1500, 'probe vectors: ' + probes);
});

test('EQUIVALENCE: both loaders refuse the same tampered records with the same message', needHistorical, () => {
  // the historical loaders read fixed paths, so only the two records they accept as arguments can be compared directly
  const msg = (fn) => { try { fn(); return 'LOADED'; } catch (e) { return String(e.message); } }, tmp = mkdtempSync(join(tmpdir(), 'hdisc-eq-')), hashOf = (rec) => { const { hash, ...rest } = rec; return createHash('sha256').update(JSON.stringify(rest)).digest('hex'); };
  try {
    const led = () => JSON.parse(readFileSync(resolve(GA, P.LEDGER_REL), 'utf8')), reg = () => JSON.parse(readFileSync(resolve(GA, P.REGISTRY_REL), 'utf8')), put = (name, v) => { const p = join(tmp, name); writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v)); return p; };
    const ledgers = [['missing', join(tmp, 'none.json')], ['thinned', put('thin.json', (() => { const l = led(); l.blocks.screenedAndSpent.pop(); return l; })())], ['status removed', put('status.json', (() => { const l = led(); delete l.statuses[837]; return l; })())],
      ['registry hash replaced', put('reg.json', (() => { const l = led(); l.unusedRegistry.sha256 = '0'.repeat(64); return l; })())], ['unknown schema', put('schema.json', (() => { const l = led(); l.schema = 'SK1_SPEND_LEDGER_V2'; return l; })())], ['unreadable', put('bad.json', '{not json')], ['untouched copy', put('same.json', led())]];
    for (const [name, f] of ledgers) assert.equal(msg(() => P.loadPortableExclusions({ ledgerFile: f })), msg(() => H.loadSuccessorExclusions({ ledgerFile: f })), 'ledger ' + name);
    assert.equal(msg(() => P.loadPortableExclusions({ ledgerFile: ledgers[6][1] })), 'LOADED');
    const registries = [['missing', join(tmp, 'noreg.json')], ['block removed', put('r1.json', (() => { const r = reg(); delete r.forbiddenBlocks[905]; return r; })())], ['block removed, re-hashed', put('r2.json', (() => { const r = reg(); delete r.forbiddenBlocks[905]; r.hash = hashOf(r); return r; })())],
      ['unknown schema', put('r3.json', (() => { const r = reg(); r.schema = 'X'; r.hash = hashOf(r); return r; })())], ['sealed set changed', put('r4.json', (() => { const r = reg(); r.sealedRegistries.pop(); r.hash = hashOf(r); return r; })())], ['sealed sha changed', put('r5.json', (() => { const r = reg(); r.sealedRegistries[2].sha256 = '0'.repeat(64); r.hash = hashOf(r); return r; })())],
      ['sealed seal changed', put('r6.json', (() => { const r = reg(); r.sealedRegistries[4].seal = '0'.repeat(64); r.hash = hashOf(r); return r; })())], ['strict counts changed', put('r7.json', (() => { const r = reg(); r.strictIndex.counts.priorSeeds += 1; r.hash = hashOf(r); return r; })())], ['unreadable', put('r8.json', '{')]];
    // compare the SK1-level loader with the portable one reading the same registry file (the portable loader adds the three SK1 registries, which do not affect these refusals)
    for (const [name, f] of registries) { const a = msg(() => P.loadPortableExclusions({ registryFile: f })), b = msg(() => Hsk1.loadSk1Exclusions({ registryFile: f })); assert.equal(a, b, 'registry ' + name); assert.notEqual(a, 'LOADED', 'registry ' + name); }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('POSITIVE and NEGATIVE CONTROLS: clean synthetic candidates pass; every spent block, identity and tampered record is rejected', () => {
  const r = runSelfCheck(); assert.equal(r.positive.ok, true); assert.equal(r.positive.candidateClasses, 12); assert.deepEqual(r.negativeControls.failed, []);
  assert.ok(r.negativeControls.total >= 160); assert.equal(r.negativeControls.passed, r.negativeControls.total); assert.equal(r.ok, true);
  for (const g of ['BLOCK', 'WORLD', 'IDENTITY', 'RECORD']) assert.ok(r.negativeControls.byGroup[g].controls > 0 && r.negativeControls.byGroup[g].rejectedAsExpected === r.negativeControls.byGroup[g].controls, g);
});

test('NEGATIVE CONTROLS named in the mandate: blocks 901, 913, 801, 813, 837 and a retired block', () => {
  for (const [b, re] of [[901, /SPENT_HW4B_SCREENED_OBSERVATIONAL/], [913, /RETIRED_HW4B_RESERVE_NEVER_GENERATED/], [801, /SPENT_SK1_SCREENED/], [813, /REPOSITORY_TEXT_HIT/], [837, /RETIRED_SK1_RESERVE_NEVER_GENERATED/], [911, /RETIRED_HW4B_RESERVE_NEVER_GENERATED/]]) {
    assert.match(P.blockFailures(ctx, b)[0], re); assert.equal(P.contamination(ctx, [{ id: 'X', block: b, worldHash: 'e'.repeat(64), fine: 'a'.repeat(64), coarse: 'b'.repeat(64) }])[0].reason, 'FORBIDDEN_BLOCK'); }
  for (const reg of ctx.regs) { const e = reg.entries[reg.entries.length - 1]; assert.equal(P.admission(ctx, 'e'.repeat(64), { fine: 'a'.repeat(64), coarse: e.coarse }).reason, 'PCD_COARSE_MATCH', reg.name); }
  assert.deepEqual(ctx.regs.map((r) => r.name), ['STUDIED_341', 'DEV_H2_BASE_WORLDS', 'HW1_EXPLORATION', 'HW1_VALIDATION', 'HW4_EXPLORATION', 'HW4_VALIDATION', 'HW4B_SCREENED_DEV', 'SK1_EXPLORATION', 'SK1_VALIDATION', 'SK1_SCREENED_UNUSED']);
});

test('PINS: loader source, inputs and context identity equal the pinned ones; a changed pin is detected', { skip: pins ? false : 'input-pins.json has not been written yet' }, () => {
  assert.deepEqual(verifyPins(pins), []); assert.equal(pins.contextIdentitySha256, P.contextIdentity(ctx).identitySha256); assert.equal(pins.contextIdentitySha256, pins.historicalContextIdentitySha256); assert.deepEqual(pins.loaderSource, sourceHashes());
  const t1 = structuredClone(pins); t1.inputs[3].sha256 = '0'.repeat(64); assert.ok(verifyPins(t1).some((x) => x === 'PINS_RECORD_ALTERED') && verifyPins(t1).some((x) => x.startsWith('CHANGED:')));
  const t2 = structuredClone(pins); t2.inputs.pop(); assert.ok(verifyPins(t2).some((x) => x.startsWith('UNPINNED_INPUT:')));
  const t3 = structuredClone(pins); t3.loaderSource['portable-exclusions.mjs'] = '0'.repeat(64); assert.ok(verifyPins(t3).some((x) => x.startsWith('LOADER_SOURCE_CHANGED:')));
  assert.deepEqual(verifyPins(null), ['PINS_MISSING_OR_UNKNOWN_SCHEMA']); assert.deepEqual(verifyPins({ schema: 'X' }), ['PINS_MISSING_OR_UNKNOWN_SCHEMA']);
});

test('CLEAN CHECKOUT: exported from HEAD with no protected file and no work/ data, the portable loader enforces; the historical loaders do not import', { skip: IN_GIT ? false : 'not inside a git work tree' }, () => {
  const r = runCleanCheckoutProbe(); assert.equal(r.ok, true);
  assert.deepEqual(r.contents.protectedFilesPresent, []); assert.deepEqual(r.contents.workDataPresent, []); assert.deepEqual(r.contents.inputsNotTrackedAtHead, []); assert.equal(r.contents.trackedInputsExported, 26);
  assert.equal(r.closure.loaderImportsOnlyNodeBuiltins, true); assert.equal(r.selfcheck.ok, true); assert.equal(r.selfcheck.positiveOk, true); assert.equal(r.selfcheck.negativeControls.passed, r.selfcheck.negativeControls.total);
  assert.equal(r.selfcheck.contextIdentitySha256, P.contextIdentity(ctx).identitySha256, 'the export yields the same context as the working tree');
  for (const k of ['loadSk1Exclusions', 'loadSuccessorExclusions']) { const h = r.historicalLoadersInTheSameExport[k]; assert.equal(h.importable, false, k); if (H) { assert.equal(h.trackedAtHead, false); assert.equal(h.custodyProtected, true); assert.match(h.firstMissingModule, /stage3h-canonical-v1\/adapters\.mjs$/); } }
});
