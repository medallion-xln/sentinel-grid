import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256 } from '../src/core/determinism.js';
import { buildStage2H2Evaluation, STAGE2H2_ARMS } from '../src/lab/stage2h2-expert-quality-evaluation.js';
import { STAGE2H2_QUALITY_GATE } from '../src/lab/stage2h2-quality-gate.js';

const campaign = JSON.parse(await readFile(new URL('../artifacts/stage2f-successor-r0/stage2f-campaign-manifest.json', import.meta.url)));
const build = () => buildStage2H2Evaluation({ campaignManifest: campaign });

test('quality gate is pre-registered at conservative frozen thresholds', () => {
  assert.equal(STAGE2H2_QUALITY_GATE.registeredBeforeEvaluation, true);
  assert.equal(STAGE2H2_QUALITY_GATE.maximumCombinedHarmfulSelectionChangeRate, .05);
  assert.equal(STAGE2H2_QUALITY_GATE.maximumNoSignalRegressionRate, .01);
  assert.equal(STAGE2H2_QUALITY_GATE.maximumStrongPrimePreferenceHarmRate, .01);
});

test('corpus has complete canonical bindings and four arms', () => {
  const result = build();
  assert.ok(result.cases.length >= 10);
  for (const entry of result.cases) {
    for (const field of ['caseId', 'population', 'runtimeIdentity', 'campaignId', 'stateDigest', 'legalActionDigest', 'groundTruthAction', 'oracleInputDigest', 'oracleOutputDigest', 'nexusInputDigest', 'nexusOutputDigest', 'expertActionContextDigest']) assert.ok(entry[field]);
    assert.deepEqual(Object.keys(entry.arms), STAGE2H2_ARMS);
  }
});

test('ground truth is deterministic transition reward and independent of experts', () => {
  const result = build();
  assert.equal(result.groundTruth.deterministic, true);
  assert.equal(result.groundTruth.independentOfOracleNexus, true);
  assert.equal(result.groundTruth.owner, 'ADAPTER_STEP_TRANSITION_REWARD');
});

test('metrics, harms, calibration, margins and offline bounds are complete', () => {
  const result = build();
  assert.equal(result.boundSensitivity.length, 5);
  assert.equal(result.allHarmfulChangesExplained, true);
  assert.equal(result.confidence.oracle.length, 5);
  assert.equal(result.confidence.nexus.length, 5);
  assert.equal(result.margins.length, 5);
  assert.equal(result.harmfulCases.length, result.effects.combined.harmfulChanges);
});

test('replay is byte-equivalent and authority stays R0', () => {
  const first = build(); const second = build();
  assert.equal(sha256(first), sha256(second));
  assert.deepEqual(first.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
  assert.equal(first.finalRecommendationOwner, 'PRIME');
});
