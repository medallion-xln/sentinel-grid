// SK1.1 Phase 1 — file-read tracer (a `node --import` preload, used only by the clean-checkout probe).
// Records which paths a process READS or PROBES through node:fs, so that the data dependencies of a command are
// measured instead of assumed. It observes; it never changes a result: every wrapped call returns or throws exactly
// what the original did. It records paths and success only, never contents.
// Enabled only when SK11_READ_TRACE_DIR is set; the trace is written there (outside the repository) at process exit.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';

const dir = process.env.SK11_READ_TRACE_DIR;
if (dir) {
  const hit = new Set(), miss = new Set(), writeFileSync = fs.writeFileSync;
  const note = (p, ok) => { let s; try { s = typeof p === 'string' ? p : p instanceof URL ? p.pathname : Buffer.isBuffer(p) ? p.toString() : null; } catch { s = null; } if (s !== null) (ok ? hit : miss).add(resolve(s)); };
  const wrap = (name, okOf = () => true) => { const orig = fs[name]; if (typeof orig !== 'function') return; fs[name] = function (p, ...rest) { let r; try { r = orig.call(this, p, ...rest); } catch (e) { note(p, false); throw e; } note(p, okOf(r)); return r; }; };
  for (const n of ['readFileSync', 'readdirSync', 'statSync', 'lstatSync', 'accessSync', 'realpathSync']) wrap(n, (r) => r !== undefined || n === 'accessSync');
  wrap('existsSync', (r) => r === true);
  const openOrig = fs.openSync; fs.openSync = function (p, flags, ...rest) { let r; try { r = openOrig.call(this, p, flags, ...rest); } catch (e) { if (flags === undefined || /^r/.test(String(flags))) note(p, false); throw e; } if (flags === undefined || /^r/.test(String(flags))) note(p, true); return r; };
  for (const n of ['readFile', 'readdir', 'stat', 'access']) { const orig = fs.promises[n]; if (typeof orig === 'function') fs.promises[n] = function (p, ...rest) { return orig.call(this, p, ...rest).then((r) => { note(p, true); return r; }, (e) => { note(p, false); throw e; }); }; }
  syncBuiltinESMExports();
  process.on('exit', () => { try { writeFileSync(resolve(dir, `trace-${process.pid}.json`), JSON.stringify({ argv: process.argv.slice(1), hit: [...hit].sort(), miss: [...miss].sort() })); } catch { /* tracing must never change an exit status */ } });
}
