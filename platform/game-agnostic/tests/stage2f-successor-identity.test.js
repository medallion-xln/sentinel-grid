import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSuccessionEvent, buildSuccessorRuntimeIdentity, measureRuntimeInventory, verifyDeclaredRuntime, verifyHistoricalReplay } from '../src/lab/stage2f-successor-identity.js';
import { ZEKNOVA_ROOT_ENV, resolveZeknovaRoot } from '../src/core/zeknova-root.js';

const sentinelRoot = path.resolve(import.meta.dirname, '../../..');
const artifactRoot = path.resolve(import.meta.dirname, '../artifacts');
const json = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

/* The ZekNova binding is resolved ONCE, explicitly, through the contract. When it
 * is absent the dependent test skips with a named reason rather than failing with
 * an anonymous ENOENT from the first readFile — the distinction between "this
 * environment cannot run this check" and "this check found a defect" is the whole
 * point. The two tests below that need no ZekNova run unconditionally. */
const zeknova = await resolveZeknovaRoot();
const zeknovaRoot = zeknova.root;
const skipReason = zeknova.bound ? false
  : `${ZEKNOVA_ROOT_ENV} not bound (${zeknova.status}): ${zeknova.reason}`;

test('successor lineage is explicit and current inventory reproduces', { skip: skipReason }, async () => {
  const predecessorBaseline = await json(path.join(artifactRoot, 'r0-runtime-identity/baseline-manifest.json'));
  const predecessor = await json(path.join(artifactRoot, 'r0-runtime-identity/canonical-runtime-identity.json'));
  const baseline = await measureRuntimeInventory({ predecessorBaseline, sentinelRoot, zeknovaRoot });
  const event = buildSuccessionEvent({ predecessorRuntimeIdentity: predecessor, predecessorSourceSha256: 'a'.repeat(64), certifiedCopySha256: 'a'.repeat(64), successorSourceSha256: 'b'.repeat(64), sourceDiffDigest: 'c'.repeat(64), behavioralDiffEvidence: [{ test: 'ZEK-15' }] });
  const runtime = buildSuccessorRuntimeIdentity({ predecessorRuntimeIdentity: predecessor, baseline, successionEvent: event, generatedRuntimeProvenanceId: predecessor.generatedRuntimeProvenanceId, sentinelHead: 'sentinel-head', zeknovaHead: 'zeknova-head' });
  assert.notEqual(runtime.sentinelRuntimeId, predecessor.sentinelRuntimeId);
  assert.equal(runtime.predecessorRuntimeIdentity, predecessor.sentinelRuntimeId);
  assert.equal((await verifyDeclaredRuntime({ baseline, runtimeIdentity: runtime, sentinelRoot, zeknovaRoot })).declaredEqualsMeasured, true);
});

test('downstream live verification rejects a stale declared identity after owned bytes change', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'sentinel-successor-'));
  const roots = { sentinelRoot: path.join(temp, 'sentinel'), zeknovaRoot: path.join(temp, 'zeknova') };
  await mkdir(roots.sentinelRoot); await mkdir(roots.zeknovaRoot);
  await writeFile(path.join(roots.sentinelRoot, 'owned.js'), 'one');
  await writeFile(path.join(roots.sentinelRoot, 'compat.js'), 'compat');
  await writeFile(path.join(roots.sentinelRoot, 'model.js'), 'model');
  const predecessorBaseline = { inventory: [
    { root: 'sentinel', path: 'owned.js', role: 'telemetry', tracked: false },
    { root: 'sentinel', path: 'compat.js', role: 'generated-compatibility', tracked: false },
    { root: 'sentinel', path: 'model.js', role: 'generated-model', tracked: false },
  ] };
  const baseline = await measureRuntimeInventory({ predecessorBaseline, ...roots });
  const predecessor = { sentinelRuntimeId: `sha256:${'1'.repeat(64)}`, generatedRuntimeProvenanceId: `sha256:${'2'.repeat(64)}`, primeImplementation: 'prime', routerImplementation: 'router', providerBridgeVersion: 'bridge', collectorSchemaVersion: '2' };
  const event = buildSuccessionEvent({ predecessorRuntimeIdentity: predecessor, predecessorSourceSha256: 'a', certifiedCopySha256: 'a', successorSourceSha256: 'b', sourceDiffDigest: 'c', behavioralDiffEvidence: [] });
  const runtime = buildSuccessorRuntimeIdentity({ predecessorRuntimeIdentity: predecessor, baseline, successionEvent: event, generatedRuntimeProvenanceId: predecessor.generatedRuntimeProvenanceId, sentinelHead: 's', zeknovaHead: 'z' });
  await writeFile(path.join(roots.sentinelRoot, 'owned.js'), 'two');
  const verification = await verifyDeclaredRuntime({ baseline, runtimeIdentity: runtime, ...roots });
  assert.equal(verification.declaredEqualsMeasured, false);
  assert.equal(verification.measuredRuntimeIdentity, null);
});

test('predecessor is valid only as immutable historical replay', async () => {
  const predecessorBaseline = await json(path.join(artifactRoot, 'r0-runtime-identity/baseline-manifest.json'));
  const predecessor = await json(path.join(artifactRoot, 'r0-runtime-identity/canonical-runtime-identity.json'));
  const replay = verifyHistoricalReplay({ predecessorRuntimeIdentity: predecessor, predecessorBaseline });
  assert.equal(replay.historicalReplayValid, true);
  assert.equal(replay.validAsCurrentRuntime, false);
  assert.equal(replay.certificationMode, 'HISTORICAL_REPLAY');
});
