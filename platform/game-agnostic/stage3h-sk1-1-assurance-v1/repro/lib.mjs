// SK1.1 Phase 1 — shared, side-effect-free helpers for the reproducibility inventory, the clean-checkout probe and the
// backup manifest. Nothing here writes, chmods, generates a world or reads evaluator truth: it hashes files and reads
// source text to trace imports. Imports: node builtins only.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const GIT = '/usr/bin/git';
export const SK11_LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GA = resolve(SK11_LANE, '..'), REPO = resolve(GA, '../..');
export const SK1_LANE = resolve(GA, 'stage3h-sk1-safety-kernel-v1'), SK1_REL = 'platform/game-agnostic/stage3h-sk1-safety-kernel-v1';
export const INVENTORY_FILE = resolve(SK11_LANE, 'evidence/SK1_1_REPRO_INVENTORY.json');
export const sha = (b) => createHash('sha256').update(b).digest('hex');
export const fileSha = (p) => sha(readFileSync(p));
export const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const posix = (p) => p.split(sep).join('/');

export const CLASS = Object.freeze({ EQ: 'TRACKED_EQUALS_HEAD', MOD: 'TRACKED_MODIFIED', PROT: 'UNTRACKED_CUSTODY_PROTECTED', OTHER: 'UNTRACKED_OTHER', MISSING: 'MISSING' });

// ---------------------------------------------------------------------------------------------------------------
// Static import tracing
// ---------------------------------------------------------------------------------------------------------------
const RE_FROM = /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s+['"]([^'"]+)['"]/g, RE_SIDE = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g, RE_DYN_LIT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, RE_DYN_ANY = /\bimport\(/g;

/** Import specifiers of one source text: { static: [...], dynamicLiteral: [...], dynamicNonLiteral: n }. */
export function importsOf(src) {
  const stat = [...src.matchAll(RE_FROM), ...src.matchAll(RE_SIDE)].map((m) => m[1]), dyn = [...src.matchAll(RE_DYN_LIT)].map((m) => m[1]);
  return { static: [...new Set(stat)], dynamicLiteral: [...new Set(dyn)], dynamicNonLiteral: [...src.matchAll(RE_DYN_ANY)].length - [...src.matchAll(RE_DYN_LIT)].length };
}

/**
 * Transitive closure of relative imports from `entries` (absolute paths). Returns a Map: absolute path ->
 * { sha256 | null (missing), importedBy: [abs...], bare: [node builtins / packages], dynamicNonLiteral }.
 * A missing file is recorded, never skipped silently.
 */
export function traceClosure(entries, { read = (p) => readFileSync(p, 'utf8'), exists = existsSync } = {}) {
  const seen = new Map();
  const walk = (abs, from) => {
    const hit = seen.get(abs); if (hit) { if (from && !hit.importedBy.includes(from)) hit.importedBy.push(from); return; }
    const node = { sha256: null, importedBy: from ? [from] : [], bare: [], dynamicNonLiteral: 0 }; seen.set(abs, node);
    if (!exists(abs)) return;
    const src = read(abs), im = importsOf(src); node.sha256 = sha(src); node.dynamicNonLiteral = im.dynamicNonLiteral;
    for (const s of [...im.static, ...im.dynamicLiteral]) { if (s.startsWith('.')) walk(resolve(dirname(abs), s), abs); else node.bare.push(s); }
  };
  for (const e of entries) walk(e, null);
  return seen;
}

// ---------------------------------------------------------------------------------------------------------------
// Git and custody facts (read-only)
// ---------------------------------------------------------------------------------------------------------------
export function gitFacts(repo = REPO) {
  const git = (...a) => execFileSync(GIT, ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 29 });
  const tracked = new Set(git('ls-files', '-z').split('\0').filter(Boolean));
  const memo = new Map(), headSha = (rel) => { if (!memo.has(rel)) { let h = null; try { h = sha(execFileSync(GIT, ['-C', repo, 'show', `HEAD:${rel}`], { maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'ignore'] })); } catch { h = null; } memo.set(rel, h); } return memo.get(rel); };
  const ignored = (rels) => { if (!rels.length) return new Set(); try { return new Set(execFileSync(GIT, ['-C', repo, 'check-ignore', '--stdin', '-z'], { input: rels.join('\0'), encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean)); } catch (e) { return new Set(String(e.stdout ?? '').split('\0').filter(Boolean)); } };
  return { git, tracked, headSha, ignored, head: git('rev-parse', 'HEAD').trim(), branch: git('branch', '--show-current').trim() };
}

/** Protected-source identities recorded by the custody control (identities only; no contents). */
export function protectedIdentities(repo = REPO) {
  const f = resolve(repo, '.git/custody/protected-identities.tsv'); if (!existsSync(f)) return null;
  return readFileSync(f, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')).filter((c) => c.length >= 5).map((c) => ({ path: c[1], blob: c[2], sha256: c[3], size: Number(c[4]) }));
}

/**
 * Classify one repo-relative path. facts: { tracked:Set, headSha(rel), protectedMap:Map(path->sha256) }.
 * current: sha256 of the working file, or null when it does not exist.
 */
export function classify(rel, current, facts) {
  if (current === null) return { class: CLASS.MISSING };
  if (facts.tracked.has(rel)) { const h = facts.headSha(rel); return h === current ? { class: CLASS.EQ } : { class: CLASS.MOD, headSha256: h }; }
  if (facts.protectedMap.has(rel)) return { class: CLASS.PROT, matchesProtectedIdentity: facts.protectedMap.get(rel) === current };
  return { class: CLASS.OTHER };
}

// ---------------------------------------------------------------------------------------------------------------
// File listings and comparison
// ---------------------------------------------------------------------------------------------------------------
/** Every file below dir (recursive), sorted, as { path (relative to base), size, mode, sha256 | null when unreadable }. Never chmods. */
export function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [], walk = (d) => { for (const n of readdirSync(d).sort()) { const p = resolve(d, n), st = statSync(p); if (st.isDirectory()) walk(p); else { let h = null; try { h = fileSha(p); } catch { h = null; } out.push({ path: posix(relative(base, p)), size: st.size, mode: (st.mode & 0o777).toString(8).padStart(3, '0'), sha256: h }); } } };
  walk(dir); return out;
}

/** Deterministic JSON: object keys sorted. */
export function stable(v) { return Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v ?? null); }

/** Paths at which two JSON values differ (bounded list). Arrays of {path|file} rows are compared by that key. */
export function deepDiff(a, b, path = '$', out = [], limit = 200) {
  if (out.length >= limit) return out;
  const keyOf = (x) => (x && typeof x === 'object' ? x.path ?? x.file ?? null : null);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length && b.length && a.every((x) => keyOf(x) !== null) && b.every((x) => keyOf(x) !== null)) {
      const A = new Map(a.map((x) => [keyOf(x), x])), B = new Map(b.map((x) => [keyOf(x), x]));
      for (const k of new Set([...A.keys(), ...B.keys()])) { if (!A.has(k)) out.push(`${path}[${k}]: ADDED`); else if (!B.has(k)) out.push(`${path}[${k}]: REMOVED`); else deepDiff(A.get(k), B.get(k), `${path}[${k}]`, out, limit); }
    } else if (a.length !== b.length) out.push(`${path}: length ${a.length} -> ${b.length}`);
    else a.forEach((x, i) => deepDiff(x, b[i], `${path}[${i}]`, out, limit));
  } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (!(k in a)) out.push(`${path}.${k}: ADDED`); else if (!(k in b)) out.push(`${path}.${k}: REMOVED`); else deepDiff(a[k], b[k], `${path}.${k}`, out, limit); }
  } else if (stable(a) !== stable(b)) out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  return out;
}

/** Compare a { relPath: sha256 } record against the files below root. Returns drift rows; empty means equal. */
export function compareHashRecord(record, root, hash = (p) => (existsSync(p) ? fileSha(p) : null)) {
  return Object.entries(record).map(([f, want]) => ({ file: f, recorded: want, current: hash(resolve(root, f)) })).filter((r) => r.recorded !== r.current);
}
