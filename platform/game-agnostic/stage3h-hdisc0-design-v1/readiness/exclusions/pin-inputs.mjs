// HDISC_PORTABLE_EXCLUSIONS_V1 — pin the loader, its inputs and the context it produces.
//   node readiness/exclusions/pin-inputs.mjs            print the pins that would be written
//   node readiness/exclusions/pin-inputs.mjs --write    create readiness/exclusions/input-pins.json (exclusive)
//   node readiness/exclusions/pin-inputs.mjs verify     compare the working tree with the stored pins; writes nothing
// Pins may be WRITTEN only in a working tree where the historical loader can be imported and where the portable context
// is identical to the historical one. A clean checkout can then VERIFY the pins without the historical loader: equal
// pins mean the portable loader is reading the same records, with the same code, that were shown equivalent here.
import { readFileSync, openSync, writeSync, closeSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadPortableExclusions, contextIdentity, inputFiles, verifyInputPins, LOADER_ID, GA_DEFAULT } from './portable-exclusions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), sha = (b) => createHash('sha256').update(b).digest('hex');
export const PINS_FILE = resolve(HERE, 'input-pins.json'), PINS_SCHEMA = 'HDISC_EXCLUSION_INPUT_PINS_V1';
export const sourceHashes = () => ({ 'portable-exclusions.mjs': sha(readFileSync(resolve(HERE, 'portable-exclusions.mjs'))), 'selfcheck.mjs': sha(readFileSync(resolve(HERE, 'selfcheck.mjs'))) });

/** Compare the present loader source, inputs and context with stored pins. Needs no historical loader. */
export function verifyPins(pins, ga = GA_DEFAULT) {
  const problems = []; if (!pins || pins.schema !== PINS_SCHEMA) return ['PINS_MISSING_OR_UNKNOWN_SCHEMA'];
  const { selfSha256, ...rest } = pins; if (selfSha256 !== sha(JSON.stringify(rest))) problems.push('PINS_RECORD_ALTERED');
  const src = sourceHashes(); for (const [f, h] of Object.entries(pins.loaderSource)) if (src[f] !== h) problems.push(`LOADER_SOURCE_CHANGED:${f}`);
  problems.push(...verifyInputPins(pins.inputs, ga));
  if (!problems.length) { let id = null; try { id = contextIdentity(loadPortableExclusions({ ga })).identitySha256; } catch (e) { problems.push('LOAD_FAILED:' + String(e.message).slice(0, 80)); } if (id && id !== pins.contextIdentitySha256) problems.push('CONTEXT_IDENTITY_CHANGED'); }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'print';
  if (mode === 'verify') { const p = existsSync(PINS_FILE) ? JSON.parse(readFileSync(PINS_FILE, 'utf8')) : null, problems = verifyPins(p); console.log(JSON.stringify({ mode, problems }, null, 1)); console.log(problems.length ? 'HDISC_EXCLUSION_PINS_VERIFY_FAILED' : 'HDISC_EXCLUSION_PINS_VERIFY_PASS'); if (problems.length) process.exitCode = 1; }
  else {
    const { loadSuccessorExclusions } = await import('../../../stage3h-sk1-safety-kernel-v1/successor/exclusions-v2.mjs'); // working tree only
    const portable = contextIdentity(loadPortableExclusions()), historical = contextIdentity(loadSuccessorExclusions());
    if (portable.identitySha256 !== historical.identitySha256) throw Error('PORTABLE_CONTEXT_DIFFERS_FROM_HISTORICAL_CONTEXT_PINS_REFUSED');
    const head = execFileSync('/usr/bin/git', ['-C', resolve(GA_DEFAULT, '../..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const rec = { schema: PINS_SCHEMA, loaderId: LOADER_ID, pinnedAtHead: head, statement: 'At this commit, in a working tree where the historical successor loader can be imported, the portable context was identical to the historical one. These pins bind the loader source, every input record and the resulting context identity.',
      loaderSource: sourceHashes(), contextIdentitySha256: portable.identitySha256, historicalContextIdentitySha256: historical.identitySha256, forbiddenBlocks: portable.forbiddenBlocks, registries: portable.registries, strictCounts: { ...portable.strict.counts, excludedBlocks: portable.strict.counts.excludedBlocks }, inputs: inputFiles() };
    rec.selfSha256 = sha(JSON.stringify(rec)); const text = JSON.stringify(rec, null, 1) + '\n';
    console.log(JSON.stringify({ mode, contextIdentitySha256: rec.contextIdentitySha256, inputs: rec.inputs.length, forbiddenBlocks: rec.forbiddenBlocks }, null, 1));
    if (mode === '--write') { const fd = openSync(PINS_FILE, 'wx'); writeSync(fd, text); closeSync(fd); console.log('written readiness/exclusions/input-pins.json'); }
  }
}
