/* Stored-versus-recomputed certificate comparison, leaf by leaf (Stage 3F reproducibility portability).
 *
 *   node scripts/reproducibility/certificate-diff.mjs --run=build/reproducibility/run-native [--out=PATH]
 *
 * Reads the payloads a `verify-stage3f.mjs --check --capture` run recorded and, for every stored Stage 3F artifact
 * it can pair, classifies each differing leaf. Pure data processing: no numerics beyond IEEE subtraction/division.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATEGORIES = Object.freeze(['DATA_HASH_DIFFERENCE', 'MODEL_PARAMETER_DIFFERENCE', 'MODEL_HASH_DIFFERENCE', 'METRIC_DIFFERENCE',
  'CLASSIFICATION_DIFFERENCE', 'CONCLUSION_DIFFERENCE', 'PREDECESSOR_HASH_DIFFERENCE', 'OPEN_REPORT_HASH_DIFFERENCE', 'CERTIFICATE_HASH_DIFFERENCE',
  'INTEGRITY_GATE_DIFFERENCE', 'GATE_CONSEQUENCE_DIFFERENCE']);

const dv = new DataView(new ArrayBuffer(8));
const ordinal = (x) => { dv.setFloat64(0, x); const b = dv.getBigInt64(0); return b < 0n ? -(b & 0x7fffffffffffffffn) : b; };
/** Signed distance in units in the last place between two finite doubles. */
export const ulpDistance = (a, b) => Number(ordinal(b) - ordinal(a));

const NUMBER_TOKEN = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;
/* Boolean leaves that only compare fitted-model hashes for identity (reviewed individually, not by pattern). */
export const IDENTITY_COMPARISON_LEAVES = Object.freeze({
  '.routers.baseRouterIsTsymRouter': 'scripts/certify-stage3f6wsym-risk.mjs: BASE_ROUTER.routerHash === T-SYM routerHash && equal thresholds (thresholds are compared as their own leaves)',
});
/** Category of one differing leaf; `path` is a dotted JSON path. */
export function classify(leafPath, a, b) {
  const p = leafPath.toLowerCase();
  const parent = leafPath.slice(0, leafPath.lastIndexOf('.'));
  const last = leafPath.split('.').pop().replace(/\[\d+\]$/, '');
  if (last === 'certificationHash' && parent === '') return 'CERTIFICATE_HASH_DIFFERENCE';
  // A certificate's own byte-identity gates (e.g. checks.OPEN_PHASE_REPRODUCED) test reproduction, not science.
  if (/^\.checks\.[A-Z0-9_]*REPRODUC/.test(leafPath)) return 'INTEGRITY_GATE_DIFFERENCE';
  if (/reporthash|openreport|openphase/.test(p)) return 'OPEN_REPORT_HASH_DIFFERENCE';
  if (/predecessor|certificationhash|upstream/.test(p)) return 'PREDECESSOR_HASH_DIFFERENCE';
  if (leafPath in IDENTITY_COMPARISON_LEAVES) return 'MODEL_HASH_DIFFERENCE';
  if (/routerhash|modelhash|freezehash|replayhash|candidatehash|fithash|analysisfreeze/.test(p)) return 'MODEL_HASH_DIFFERENCE';
  if (/\.(w|W|mu|sd)\[|(^|\.)(weights|coreweights|classweights)(\.|\[|$)|featureimportance|\.weight$|\.model\.|\.models\./.test(leafPath)) return 'MODEL_PARAMETER_DIFFERENCE';
  if (/contenthash|partitionhash|payloadhash|corpushash/.test(p)) return 'DATA_HASH_DIFFERENCE';
  if (typeof a === 'number' && typeof b === 'number') return 'METRIC_DIFFERENCE';
  if (typeof a === 'string' && typeof b === 'string' && a.replace(NUMBER_TOKEN, '#') === b.replace(NUMBER_TOKEN, '#')) return 'METRIC_DIFFERENCE';
  if (/conclusion|roadmap|ready|justified|material|(^|\.)status$|verdict|answer|decision/.test(p)) return 'CONCLUSION_DIFFERENCE';
  return 'CLASSIFICATION_DIFFERENCE';
}

export function diffLeaves(stored, recomputed) {
  const out = [];
  const walk = (a, b, at) => {
    if (a === b || (typeof a === 'number' && typeof b === 'number' && Object.is(a, b))) return;
    if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
      const abs = Math.abs(a - b); const scale = Math.max(Math.abs(a), Math.abs(b));
      out.push({ path: at, category: classify(at, a, b), stored: a, recomputed: b, absDiff: abs, relDiff: scale === 0 ? 0 : abs / scale, ulpDiff: ulpDistance(a, b) });
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (const k of keys) walk(a[k], b[k], Array.isArray(a) ? `${at}[${k}]` : `${at}.${k}`);
      return;
    }
    out.push({ path: at, category: classify(at, a, b), stored: a ?? null, recomputed: b ?? null });
  };
  walk(stored, recomputed, '');
  // status / roadmap / conclusion flips are consequences of a failed reproduction gate only when that gate is the
  // sole differing check; otherwise they stay CONCLUSION_DIFFERENCE.
  const gateOnly = out.some((l) => l.category === 'INTEGRITY_GATE_DIFFERENCE')
    && !out.some((l) => l.path.startsWith('.checks.') && l.category !== 'INTEGRITY_GATE_DIFFERENCE');
  if (gateOnly) for (const l of out) if (l.category === 'CONCLUSION_DIFFERENCE' && /^\.(status|roadmap\.|conclusions?\.)/.test(l.path)) l.category = 'GATE_CONSEQUENCE_DIFFERENCE';
  return out;
}

export function summarize(leaves) {
  const categories = {};
  for (const name of CATEGORIES) categories[name] = { count: 0, maxAbsDiff: null, maxRelDiff: null, maxUlpDiff: null, examples: [] };
  for (const leaf of leaves) {
    const c = categories[leaf.category];
    c.count += 1;
    if (leaf.absDiff !== undefined) {
      c.maxAbsDiff = Math.max(c.maxAbsDiff ?? 0, leaf.absDiff);
      c.maxRelDiff = Math.max(c.maxRelDiff ?? 0, leaf.relDiff);
      c.maxUlpDiff = Math.max(c.maxUlpDiff ?? 0, Math.abs(leaf.ulpDiff));
    }
    if (c.examples.length < 6) c.examples.push(leaf.absDiff === undefined ? { path: leaf.path, stored: leaf.stored, recomputed: leaf.recomputed }
      : { path: leaf.path, stored: leaf.stored, recomputed: leaf.recomputed, absDiff: leaf.absDiff, relDiff: leaf.relDiff, ulpDiff: leaf.ulpDiff });
  }
  return categories;
}

/** Best-matching captured payload for a stored artifact: same top-level shape, fewest differing leaves. */
export function pair(stored, payloads) {
  const keys = Object.keys(stored);
  let best = null;
  for (const text of payloads) {
    let candidate; try { candidate = JSON.parse(text); } catch { continue; }
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    // A payload captured before its hash was attached is exactly the string the certifier hashed.
    if ('certificationHash' in stored && !('certificationHash' in candidate)) candidate.certificationHash = createHash('sha256').update(text).digest('hex');
    if (stored.stage !== undefined && candidate.stage !== stored.stage) continue;
    const shared = keys.filter((k) => k in candidate).length;
    if (shared < keys.length * 0.8 || Object.keys(candidate).length > keys.length + 2) continue;
    const leaves = diffLeaves(stored, candidate);
    // A check may also re-serialise the stored artifact it compares against; that echo is identical by definition.
    // When a differing candidate of the same shape exists, it is the recomputation, so it takes precedence.
    const rank = (x) => (x.leaves.length === 0 ? Infinity : x.leaves.length);
    if (best === null || rank({ leaves }) < rank(best)) best = { leaves, candidate };
  }
  return best;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(process.env.SENTINEL_GA_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const runDir = path.resolve(root, arg('run') ?? 'build/reproducibility/run-native');
  const { CHECKS } = await import('./stage3f-chain.mjs');
  const extra = { '3F6C': ['artifacts/stage3f6c-deployable-router/stage3f6c-evaluation-freeze.json'],
    '3F6T': ['artifacts/stage3f6t-policy-router/stage3f6t-evaluation-freeze.json'],
    T_SYM: ['artifacts/stage3f6tsym-router-value/stage3f6tsym-open-phase-report.json'],
    P1A_SYM: ['artifacts/stage3f6p1asym-free-action/stage3f6p1asym-open-phase-report.json'],
    P1_SYM: ['artifacts/stage3f6p1sym-nexus-requalification/stage3f6p1sym-open-phase-report.json'],
    W_SYM: ['artifacts/stage3f6wsym-risk-requalification/stage3f6wsym-open-phase-report.json'] };
  const stages = {};
  for (const check of CHECKS) {
    const dir = path.join(runDir, 'checks', check.id);
    if (!existsSync(dir)) continue;
    // Only the check's own top-level process: nested predecessor checks are paired under their own ids.
    const payloads = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')))
      .filter((e) => check.run.includes(e.script)).flatMap((e) => e.captured);
    const artifacts = {};
    // Tracked files the check tried to rewrite with different bytes: compare the would-be bytes directly.
    const top = path.resolve(root, '..', '..');
    for (const e of readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'))).filter((x) => check.run.includes(x.script))) {
      for (const ev of e.events.filter((x) => x.event === 'TRACKED_MUTATION_BLOCKED' && x.kept)) {
        const rel = path.relative(root, path.join(top, ev.file)).split(path.sep).join('/');
        const leaves = diffLeaves(JSON.parse(readFileSync(path.join(root, rel), 'utf8')), JSON.parse(readFileSync(path.join(root, ev.kept), 'utf8')));
        artifacts[rel] = { paired: true, source: 'BLOCKED_CHECK_MODE_WRITE', differingLeaves: leaves.length, byteIdentical: false, categories: summarize(leaves) };
      }
    }
    for (const file of [check.result, ...(extra[check.id] ?? [])]) {
      if (artifacts[file]) continue;
      const stored = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
      const best = pair(stored, payloads);
      artifacts[file] = best === null ? { paired: false }
        : { paired: true, differingLeaves: best.leaves.length, byteIdentical: best.leaves.length === 0, categories: summarize(best.leaves) };
    }
    stages[check.id] = artifacts;
  }
  const out = { schemaVersion: 1, runDirectory: path.relative(root, runDir), stages };
  const outPath = arg('out');
  if (outPath) writeFileSync(path.resolve(outPath), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([f, r]) => [path.basename(f),
    r.paired ? Object.fromEntries(Object.entries(r.categories).filter(([, c]) => c.count).map(([n, c]) => [n, c.count])) : 'UNPAIRED']))])), null, 1));
}
