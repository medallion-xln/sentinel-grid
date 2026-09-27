#!/usr/bin/env node
/* Run one script under the canonical verification runtime, read-only.
 *
 *   node scripts/reproducibility/run-canonical.mjs <script.mjs> [args...]
 *
 * The npm `:check` / `:verify` entry points for Stage 3F use this wrapper: the child (and every process it spawns)
 * computes under SENTINEL_CANONICAL_NUMERICS_V1 and cannot change a tracked file. The wrapper's exit status is the
 * script's, or 3 if the tracked tree changed anyway (it never should).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const [script, ...args] = process.argv.slice(2);
if (!script) { process.stderr.write('usage: run-canonical.mjs <script.mjs> [args...]\n'); process.exit(2); }
const status = () => spawnSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).stdout;
const before = status();
const options = (process.env.NODE_OPTIONS ?? '').split(/\s+/).filter((o) => o && !o.includes('canonical-runtime.mjs'));
options.push(`--import=${pathToFileURL(path.join(here, 'canonical-runtime.mjs')).href}`);
if (!options.some((o) => o.startsWith('--test-reporter'))) options.push('--test-reporter=tap'); // certifiers parse TAP summaries
const run = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit',
  env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`, NODE_OPTIONS: options.join(' '), SENTINEL_READONLY: '1', SENTINEL_GA_ROOT: root } });
if (status() !== before) { process.stderr.write('[run-canonical] tracked files changed during a read-only run\n'); process.exit(3); }
process.exit(run.status ?? 1);
