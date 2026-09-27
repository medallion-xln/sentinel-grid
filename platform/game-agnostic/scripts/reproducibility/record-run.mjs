#!/usr/bin/env node
/* Normalise a verify-stage3f.mjs report into a committed, timing-free platform record.
 *
 *   node scripts/reproducibility/record-run.mjs --report=build/reproducibility/report-canonical.json --label=<label>
 *        [--diff=build/reproducibility/run-native]   (adds the certificate-diff of a --capture run)
 * Writes artifacts/stage3frp-reproducibility-portability/platform-runs/<label>.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.SENTINEL_GA_ROOT ?? path.join(here, '..', '..'));
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const label = arg('label');
if (!label || !/^[a-z0-9-]+$/.test(label) || !arg('report')) { process.stderr.write('usage: --report=PATH --label=[a-z0-9-]+ [--diff=RUN_DIR]\n'); process.exit(2); }
const report = JSON.parse(readFileSync(path.resolve(arg('report')), 'utf8'));

export const normalise = (r) => ({
  schemaVersion: 1, label, procedure: r.procedure, mode: r.mode, numericsProfile: r.numericsProfile, head: r.head,
  host: { platform: r.host.platform, arch: r.host.arch, node: r.host.node, v8: r.host.v8, cpuModel: r.host.cpuModel },
  trackedTreeUnchanged: r.trackedTreeUnchanged, pass: r.pass,
  evidence: r.evidence.map((e) => ({ id: e.id, status: e.status, payloads: (e.payloads ?? []).map((p) => ({ payload: p.payload, expected: p.expected, actual: p.actual })),
    trackedMutationsBlocked: (e.trackedMutationsBlocked ?? []).map((b) => b.file) })),
  checks: r.checks.map((c) => ({ id: c.id, status: c.status, storedHash: c.storedHash, recomputedHash: c.recomputedHash, exitCode: c.exitCode,
    ownCheckModeTrackedWrites: c.ownCheckModeTrackedWrites ?? [], trackedMutationsBlocked: (c.trackedMutationsBlocked ?? []).map((b) => b.file) })),
});
const record = normalise(report);
if (arg('diff')) {
  const d = spawnSync(process.execPath, [path.join(here, 'certificate-diff.mjs'), `--run=${arg('diff')}`, `--out=${path.join(root, 'build', 'reproducibility', `diff-${label}.json`)}`],
    { cwd: root, encoding: 'utf8', env: { ...process.env, SENTINEL_GA_ROOT: root } });
  if (d.status !== 0) { process.stderr.write(d.stderr); process.exit(1); }
  record.certificateDiff = JSON.parse(readFileSync(path.join(root, 'build', 'reproducibility', `diff-${label}.json`), 'utf8')).stages;
}
const outDir = path.join(root, 'artifacts', 'stage3frp-reproducibility-portability', 'platform-runs');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, `${label}.json`), `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ label, checks: record.checks.length, evidence: record.evidence.length, pass: record.pass }));
