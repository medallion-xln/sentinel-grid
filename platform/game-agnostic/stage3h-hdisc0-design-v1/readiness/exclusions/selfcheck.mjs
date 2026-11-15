// HDISC_PORTABLE_EXCLUSIONS_V1 — self-check: one positive demonstration and a battery of negative controls.
// Imports only node built-ins and the portable loader, so it runs unchanged in a clean checkout of committed source.
//   node readiness/exclusions/selfcheck.mjs [--ga <platform/game-agnostic root>]
// Tampering controls work on a private temporary copy of the loader's 26 tracked input files. Nothing in the
// repository is written. All candidate identities are synthetic; no population is allocated.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, unlinkSync, chmodSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadPortableExclusions, blockFailures, admission, contamination, inputFiles, contextIdentity, GA_DEFAULT, REGISTRY_REL, LEDGER_REL, SEALED, EXCLUSION_FILES, SK1_LANE_REL, LOADER_ID } from './portable-exclusions.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex'), readJ = (p) => JSON.parse(readFileSync(p, 'utf8')), hashOf = (rec) => { const { hash, ...rest } = rec; return sha(JSON.stringify(rest)); };
const synth = (label) => sha('HDISC_SYNTHETIC_IDENTITY|' + label);

/** Private copy of the loader's inputs, laid out like platform/game-agnostic. */
export function makeSandbox(ga = GA_DEFAULT) {
  const root = mkdtempSync(join(tmpdir(), 'hdisc-excl-')), files = inputFiles(ga).map((r) => r.file);
  // sources may be read-only; the private copies are made writable so they can be tampered with
  const put = (f) => { const to = resolve(root, f); mkdirSync(dirname(to), { recursive: true }); if (existsSync(to)) { chmodSync(to, 0o644); unlinkSync(to); } copyFileSync(resolve(ga, f), to); chmodSync(to, 0o644); };
  for (const f of files) put(f);
  return { root, files, restore: put, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
const thrown = (fn) => { try { fn(); return null; } catch (e) { return String(e.message); } };

export function runSelfCheck({ ga = GA_DEFAULT } = {}) {
  const ctx = loadPortableExclusions({ ga }), controls = [], add = (group, name, expected, got) => controls.push({ group, name, expected: String(expected), got: got === null ? null : String(got), ok: got !== null && new RegExp(expected).test(String(got)) });
  // ---------- positive: clean synthetic candidates are admitted
  const cleanBlock = [...Array(900).keys()].map((i) => i + 100).find((b) => blockFailures(ctx, b).length === 0);
  const clean = Array.from({ length: 12 }, (_, i) => ({ id: `SYN-${i}`, block: cleanBlock, worldHash: synth('world|' + i), memberHashes: [synth('member|' + i + '|a'), synth('member|' + i + '|b')], fine: synth('fine|' + i), coarse: synth('coarse|' + i) }));
  const positive = { synthetic: true, candidateClasses: clean.length, blockUsedForTheProbe: cleanBlock, blockAccepted: blockFailures(ctx, cleanBlock).length === 0, everyAdmissionAccepted: clean.every((c) => admission(ctx, c.worldHash, { fine: c.fine, coarse: c.coarse }).ok === true), contaminationReport: contamination(ctx, clean),
    note: 'The probe block is only the first block the context does not reject. It is not an allocation and not a recommendation.' };
  positive.ok = positive.blockAccepted && positive.everyAdmissionAccepted && positive.contaminationReport.length === 0;
  const base = clean[0];
  // ---------- negative: spent, retired and rejected blocks
  for (const [b, why] of [[901, 'SPENT_HW4B_SCREENED_OBSERVATIONAL'], [910, 'SPENT_HW4B_SCREENED_OBSERVATIONAL'], [911, 'RETIRED_HW4B_RESERVE_NEVER_GENERATED'], [913, 'RETIRED_HW4B_RESERVE_NEVER_GENERATED'], [914, 'RETIRED_HW4B_RESERVE_NEVER_GENERATED'], [801, 'SPENT_SK1_SCREENED'], [827, 'SPENT_SK1_SCREENED'], [813, 'REPOSITORY_TEXT_HIT'], [828, 'RETIRED_SK1_RESERVE_NEVER_GENERATED'], [837, 'RETIRED_SK1_RESERVE_NEVER_GENERATED'],
    [731, 'REGISTRATION_0364164C'], [733, 'REGISTRATION_7C41BA89'], [951, 'SPENT_DEV_FRESH_EXPLORE'], [941, 'SPENT_HW4_EXPLORATION'], [960, 'SPENT_HW4_VALIDATION'], [961, 'SPENT_HW1_EXPLORATION'], [977, 'SPENT_HW1_VALIDATION']]) {
    add('BLOCK', `block ${b}`, `^FORBIDDEN_BLOCK_${b}:${why}$`, blockFailures(ctx, b)[0] ?? null);
    const rep = contamination(ctx, [{ ...base, id: 'NEG', block: b }]); add('BLOCK', `population on block ${b}`, '^FORBIDDEN_BLOCK$', rep[0]?.reason ?? null);
  }
  let every = true; for (let b = 801; b <= 837; b++) every &&= blockFailures(ctx, b).length > 0; for (let b = 901; b <= 914; b++) every &&= blockFailures(ctx, b).length > 0;
  add('BLOCK', 'every block 801-837 and 901-914', '^true$', every);
  for (const b of [99, 1000, 12.5, -1, NaN]) add('BLOCK', `malformed block ${b}`, '^NOT_A_12_DIGIT_BLOCK$', blockFailures(ctx, b)[0] ?? null);
  // ---------- negative: strict world identities, one per recorded source
  for (const tag of ['PRIOR', 'V4_SEALED', 'DEV_BASE', 'DIAGNOSTIC_CONSTRUCTED']) { let h = null; for (const [k, s] of ctx.strict.sources) if (s.includes(tag)) { h = k; break; }
    add('WORLD', `spent world from ${tag}`, '^STRICT_WORLD_INDEX$', h && admission(ctx, h, { fine: base.fine, coarse: base.coarse }).reason);
    add('WORLD', `population containing a ${tag} world`, '^STRICT_WORLD_INDEX$', h && (contamination(ctx, [{ ...base, id: 'NEG', worldHash: h }])[0]?.reason ?? null));
    add('WORLD', `member world from ${tag}`, '^STRICT_WORLD_INDEX$', h && (contamination(ctx, [{ ...base, id: 'NEG', memberHashes: [h] }])[0]?.reason ?? null)); }
  add('WORLD', 'non-canonical world hash', '^STRICT_WORLD_INDEX$', admission(ctx, 'not-a-hash', { fine: base.fine, coarse: base.coarse }).reason);
  // ---------- negative: a spent public-class identity from every sealed registry and every SK1 registry, at both key levels
  for (const reg of ctx.regs) { const withFine = reg.entries.filter((e) => e.fine), picks = [reg.entries[0], reg.entries[reg.entries.length >> 1], reg.entries[reg.entries.length - 1]];
    for (const e of picks) { add('IDENTITY', `${reg.name} coarse ${e.id === picks[0].id ? 'first' : e.id === picks[2].id ? 'last' : 'middle'}`, '^PCD_COARSE_MATCH$', admission(ctx, base.worldHash, { fine: synth('x'), coarse: e.coarse }).reason);
      add('IDENTITY', `${reg.name} population coarse`, '^PCD_MATCH$', contamination(ctx, [{ ...base, id: 'NEG', fine: synth('x'), coarse: e.coarse }])[0]?.reason ?? null); }
    if (withFine.length) { const e = withFine[withFine.length >> 1]; add('IDENTITY', `${reg.name} fine`, '^PCD_FINE_MATCH$', admission(ctx, base.worldHash, { fine: e.fine, coarse: synth('y') }).reason); } }
  // ---------- negative: tampered, missing and unknown records (on a private copy)
  const sb = makeSandbox(ga), at = (f) => resolve(sb.root, f), load = () => loadPortableExclusions({ ga: sb.root });
  try {
    add('RECORD', 'untouched private copy loads', '^LOADED$', thrown(load) ?? 'LOADED');
    const tamper = (name, file, expected, mutate) => { mutate(at(file)); add('RECORD', name, expected, thrown(load)); sb.restore(file); };
    const edit = (fn) => (p) => { const j = readJ(p); fn(j); writeFileSync(p, JSON.stringify(j)); }, flip = (p) => { const b = readFileSync(p); b[b.length >> 1] ^= 1; writeFileSync(p, b); };
    for (const [name, file] of SEALED) tamper(`sealed registry ${name} altered by one bit`, file, `^(SEALED_REGISTRY_FILE_CHANGED:${name}|PCD_REGISTRY_INVALID)`, flip);
    for (const [name, file] of SEALED.slice(0, 2)) tamper(`sealed registry ${name} missing`, file, `^SEALED_REGISTRY_MISSING:${name}$`, (p) => unlinkSync(p));
    const led = readJ(at(LEDGER_REL)), sk1Regs = [led.populations.EXPLORATION.registry, led.populations.VALIDATION.registry, led.unusedRegistry.file].map((f) => `${SK1_LANE_REL}/${f}`);
    for (const f of sk1Regs) { tamper(`SK1 registry ${f.split('/').pop()} altered by one bit`, f, '^SK1_REGISTRY_FILE_CHANGED:', flip); tamper(`SK1 registry ${f.split('/').pop()} missing`, f, '^SK1_REGISTRY_MISSING:', (p) => unlinkSync(p)); }
    tamper('exclusion registry: a forbidden block silently removed', REGISTRY_REL, '^SK1_EXCLUSION_REGISTRY_TAMPERED$', edit((j) => { delete j.forbiddenBlocks[905]; }));
    tamper('exclusion registry: a forbidden block removed and the record re-hashed', REGISTRY_REL, '^SK1_EXCLUSION_REGISTRY_MISSING_BLOCK:905$', edit((j) => { delete j.forbiddenBlocks[905]; j.hash = hashOf(j); }));
    tamper('exclusion registry: a retired block re-labelled as available and re-hashed', REGISTRY_REL, '^SK1_EXCLUSION_REGISTRY_MISSING_BLOCK:913$', edit((j) => { j.forbiddenBlocks[913] = 'AVAILABLE'; j.hash = hashOf(j); }));
    tamper('exclusion registry: unknown schema', REGISTRY_REL, '^SK1_EXCLUSION_REGISTRY_TAMPERED$', edit((j) => { j.schema = 'SK1_EXCLUSION_REGISTRY_V2'; j.hash = hashOf(j); }));
    tamper('exclusion registry: failClosed switched off and re-hashed', REGISTRY_REL, '^SK1_EXCLUSION_REGISTRY_TAMPERED$', edit((j) => { j.failClosed = false; j.hash = hashOf(j); }));
    tamper('exclusion registry: a sealed registry dropped and re-hashed', REGISTRY_REL, '^SK1_EXCLUSION_REGISTRY_SEALED_SET_CHANGED', edit((j) => { j.sealedRegistries.pop(); j.hash = hashOf(j); }));
    tamper('exclusion registry: strict-index counts edited and re-hashed', REGISTRY_REL, '^STRICT_INDEX_COUNTS_CHANGED$', edit((j) => { j.strictIndex.counts.distinctExcludedWorlds -= 1; j.hash = hashOf(j); }));
    tamper('exclusion registry: missing', REGISTRY_REL, '^SK1_EXCLUSION_REGISTRY_MISSING$', (p) => unlinkSync(p));
    tamper('exclusion registry: unreadable', REGISTRY_REL, '^SK1_EXCLUSION_REGISTRY_UNREADABLE$', (p) => writeFileSync(p, '{not json'));
    tamper('spend ledger: missing', LEDGER_REL, '^SK1_SPEND_LEDGER_MISSING$', (p) => unlinkSync(p));
    tamper('spend ledger: unknown schema', LEDGER_REL, '^SK1_SPEND_LEDGER_INVALID$', edit((j) => { j.schema = 'SK1_SPEND_LEDGER_V2'; }));
    tamper('spend ledger: a screened block dropped', LEDGER_REL, '^SK1_SPEND_LEDGER_BLOCK_LIST_CHANGED$', edit((j) => { j.blocks.screenedAndSpent.pop(); }));
    tamper('spend ledger: a block status removed', LEDGER_REL, '^SK1_SPEND_LEDGER_BLOCK_LIST_CHANGED$', edit((j) => { delete j.statuses[837]; }));
    tamper('spend ledger: a registry hash replaced', LEDGER_REL, '^SK1_REGISTRY_FILE_CHANGED:', edit((j) => { j.unusedRegistry.sha256 = '0'.repeat(64); }));
    // a sealed registry with an unknown schema, re-pinned in the exclusion registry so that only the schema check can stop it
    { const [name, file] = SEALED[0]; edit((j) => { j.schema = 'STAGE3H_HW1_I2_PCD_REGISTRY_V2'; })(at(file)); edit((j) => { j.sealedRegistries[0].sha256 = sha(readFileSync(at(file))); j.hash = hashOf(j); })(at(REGISTRY_REL)); add('RECORD', `sealed registry ${name}: unknown schema, re-pinned`, '^PCD_REGISTRY_INVALID:SCHEMA$', thrown(load)); sb.restore(file); sb.restore(REGISTRY_REL); }
    { const [name, file] = SEALED[3]; edit((j) => { j.entries.pop(); j.count -= 1; })(at(file)); edit((j) => { j.sealedRegistries[3].sha256 = sha(readFileSync(at(file))); j.hash = hashOf(j); })(at(REGISTRY_REL)); add('RECORD', `sealed registry ${name}: an identity removed, re-pinned`, '^PCD_REGISTRY_INVALID:SEAL_MISMATCH$', thrown(load)); sb.restore(file); sb.restore(REGISTRY_REL); }
    tamper('strict index: a prior world hash removed', EXCLUSION_FILES.prior, '^EXCLUSION_INDEX_INVALID:PRIOR_COUNT$', edit((j) => { j.priorWorldHashes.pop(); }));
    tamper('strict index: prior record with an unknown schema', EXCLUSION_FILES.prior, '^EXCLUSION_INDEX_INVALID:PRIOR_SCHEMA$', edit((j) => { j.schema = 'X'; }));
    tamper('strict index: a diagnostic world hash removed', EXCLUSION_FILES.diagnostic, '^EXCLUSION_INDEX_INVALID:LEDGER_DIGEST$', edit((j) => { j.constructedWorldHashes.pop(); }));
    tamper('strict index: DEV identities altered', EXCLUSION_FILES.devIdentities, '^EXCLUSION_INDEX_INVALID:', edit((j) => { j.devOpenSeeds.pop(); }));
    tamper('strict index: DEV identities missing', EXCLUSION_FILES.devIdentities, '^EXCLUSION_INDEX_INVALID:MISSING_FILE:', (p) => unlinkSync(p));
    const ledgerFile = sb.files.find((f) => f.endsWith('.ledger.json'));
    tamper('strict index: a sealed V4 world removed', ledgerFile, '^(STRICT_INDEX_COUNTS_CHANGED|EXCLUSION_INDEX_INVALID:)', edit((j) => { j.pop(); }));
    tamper('strict index: a duplicated V4 world', ledgerFile, '^EXCLUSION_INDEX_INVALID:DUPLICATE_HASH:v4$', edit((j) => { j.push(j[0]); }));
    add('RECORD', 'private copy loads again after every restore', '^LOADED$', thrown(load) ?? 'LOADED');
  } finally { sb.dispose(); }
  const byGroup = {}; for (const c of controls) { const g = (byGroup[c.group] ??= { controls: 0, rejectedAsExpected: 0 }); g.controls++; g.rejectedAsExpected += Number(c.ok); }
  const failed = controls.filter((c) => !c.ok);
  return { loader: LOADER_ID, contextIdentitySha256: contextIdentity(ctx).identitySha256, positive, negativeControls: { total: controls.length, passed: controls.length - failed.length, byGroup, failed }, ok: positive.ok && failed.length === 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--ga'), res = runSelfCheck(i > 0 ? { ga: resolve(process.argv[i + 1]) } : {});
  console.log(JSON.stringify(res, null, 1)); console.log(res.ok ? 'HDISC_PORTABLE_EXCLUSIONS_SELFCHECK_PASS' : 'HDISC_PORTABLE_EXCLUSIONS_SELFCHECK_FAILED'); if (!res.ok) process.exitCode = 1;
}
