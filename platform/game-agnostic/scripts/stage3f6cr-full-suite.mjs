#!/usr/bin/env node
/* Stage 3F.6-CR — records the full repository test run bound by the confirmatory certificate.
 *
 *   node scripts/stage3f6cr-full-suite.mjs            (runs the suites, writes the record)
 *
 * Gating: the platform suite (`npm test` in platform/game-agnostic = `node --test`), run with the TAP reporter so its
 * summary can be parsed on every Node major. Disclosed, not gating (same convention as Stage 3F.6-D-SYM): the root AZL
 * overlay suite, which needs the absent sibling public_html/azl tree, and sgrid-lab's node tests, which carry older
 * frozen-status/hash assertion failures unrelated to Stage 3F. Only counts are recorded, so the record is stable.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const top = path.resolve(root, '..', '..');
const OUT = 'artifacts/stage3f6cr-confirmatory-reconciliation/stage3f6cr-full-suite.json';
const env = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` };
delete env.NODE_OPTIONS; delete env.NODE_TEST_CONTEXT;

function tap(cwd, args) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...args], { cwd, env, encoding: 'utf8', maxBuffer: 1 << 30 });
  const n = (k) => Number(new RegExp(`^# ${k} (\\d+)$`, 'm').exec(r.stdout ?? '')?.[1] ?? -1);
  return { exitCode: r.status, tests: n('tests'), pass: n('pass'), fail: n('fail'), skipped: n('skipped'), todo: n('todo'), cancelled: n('cancelled') };
}

process.stderr.write('[stage3f6cr] platform suite (node --test)\n');
const platform = { command: 'node --test --test-reporter=tap', cwd: 'platform/game-agnostic', ...tap(root, []) };
process.stderr.write('[stage3f6cr] disclosed: sgrid-lab node tests\n');
const sgridLab = { command: 'node --test --test-reporter=tap tests/', cwd: 'sgrid-lab', gating: false, ...tap(path.join(top, 'sgrid-lab'), ['tests/']) };
process.stderr.write('[stage3f6cr] disclosed: root AZL overlay suite\n');
const overlay = spawnSync(process.execPath, ['tests/run-node-tests.js'], { cwd: top, env, encoding: 'utf8', maxBuffer: 1 << 28 });
const rootOverlay = { command: 'node tests/run-node-tests.js', cwd: '.', gating: false, exitCode: overlay.status,
  cause: /Cannot find module/.test(overlay.stderr ?? '') ? 'MISSING_SIBLING_PUBLIC_HTML_AZL_TREE' : null };

const record = {
  schemaVersion: 1, stage: 'STAGE_3F_6_CR_CONFIRMATORY_RECONCILIATION', nodeMajor: Number(process.versions.node.split('.')[0]),
  platform, disclosed: { sgridLab, rootOverlay, note: 'Outside Stage 3F; disclosed, not gating, and not altered here.' },
};
writeFileSync(path.join(root, OUT), `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record, null, 2));
if (platform.fail !== 0 || platform.pass <= 0) process.exitCode = 1;
