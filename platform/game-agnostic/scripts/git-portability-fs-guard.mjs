/* Filesystem guard for the Git portability proof.
 *
 * Loaded with `node --import` so it patches fs BEFORE any project module binds its named imports. It records every
 * read of an ephemeral/session path and writes the record at exit. It never blocks a read: the point is to prove
 * that zero such reads happen, not to simulate their absence.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const promises = fs.promises;
const logPath = process.env.SENTINEL_PORTABILITY_GUARD_LOG ?? null;
const label = process.env.SENTINEL_PORTABILITY_GUARD_LABEL ?? 'unlabelled';
export const EPHEMERAL_PATTERN = /\/private\/tmp|claude-501|\/scratchpad(?:\/|$)/;

const violations = new Set();
const record = (api, target) => {
  const value = typeof target === 'string' ? target : (target && typeof target.toString === 'function' ? target.toString() : '');
  if (EPHEMERAL_PATTERN.test(value)) violations.add(`${api}:${value}`);
};

for (const name of ['readFileSync', 'existsSync', 'readdirSync', 'statSync', 'lstatSync', 'openSync', 'accessSync', 'realpathSync', 'createReadStream', 'opendirSync']) {
  const original = fs[name];
  if (typeof original !== 'function') continue;
  fs[name] = function guarded(target, ...rest) { record(name, target); return original.call(this, target, ...rest); };
}
for (const name of ['readFile', 'readdir', 'stat', 'lstat', 'access', 'open', 'opendir']) {
  const original = promises[name];
  if (typeof original !== 'function') continue;
  promises[name] = function guarded(target, ...rest) { record(`promises.${name}`, target); return original.call(this, target, ...rest); };
}

/* Self-test: prove the patch records through this module's own handle. */
const selfTestPath = '/private/tmp/claude-501/__sentinel_portability_guard_selftest__';
fs.existsSync(selfTestPath);
const selfTestIntercepted = violations.delete(`existsSync:${selfTestPath}`);

process.on('exit', () => {
  if (logPath === null) return;
  try {
    fs.appendFileSync(logPath, `${JSON.stringify({ label, selfTestIntercepted, violations: [...violations].sort() })}\n`);
  } catch { /* the guard must never fail the run it is observing */ }
});
