/* Stage 3B.1 — temporal warm-up, Oracle reachability and corpus V2 lineage.
 *
 * The tests that matter here are the ones that would catch the stage cheating:
 * a warm-up that fabricates history, a warm-up that quietly changes the task, a
 * warm-up length chosen to clear a minimum, a family validated by its own name,
 * and a lineage that overwrites its parent.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FORGE_TEMPORAL_WARMUP_V1, FORGE_WARMUP_MINIMUM_TO_CLEAR_GUARDS, FORGE_WARMUP_TARGET_TICKS,
  ORACLE_HEAD_IDS, ORACLE_HEAD_TEMPORAL_CONTRACT, WARMUP_DECISION_STATES,
  measureRealizedSeries, oracleHeadReachability, replayTemporalWarmup, runCalibratedWarmup,
  runTemporalWarmup, taskDelta, taskSignature, validateTemporalFamily,
} from '../src/forge/warmup.js';
import {
  FORGE_TEMPORAL_FAMILY_IDS, buildTemporalChannel, declareChannelSemantics, generateScenarioV3,
} from '../src/forge/scenarios-v3.js';
import { toOracleHeadInput, FORGE_ORACLE_CHANNEL_MAPPING, ORACLE_HEAD_CHANNEL_NAME } from '../src/forge/oracle-surface.js';
import {
  FORGE_DATASET_V2_LINEAGE, FORGE_DATASET_V2_PARENT, FORGE_DATASET_V2_VERSION, splitForTopologyV2,
} from '../src/forge/dataset-v2.js';
import { FORGE_DATASET_VERSION, splitForTopology } from '../src/forge/dataset.js';
import { generateScenarioV2 } from '../src/forge/scenarios-v2.js';
import { createWorld, hashWorld, observe } from '../src/forge/kernel.js';
import { evaluateOracle } from '../src/experts/oracle.js';
import { assembleOracleV2 } from '../src/lab/stage2i4-oracle-v2-assembly.js';
import {
  STAGE3B1_INHERITED_BASELINE, STAGE3B1_TRAINING_CAMPAIGN_SPEC, auditOracleTemporalContract,
  auditTemporalFamilies, compareLineages, evaluateOracleHeads,
} from '../src/lab/stage3b1-temporal-warmup.js';

const axes = {
  shape: 'redundant_network', roles: 'redundant', objectives: 'restore_infrastructure',
  horizonBand: 'H3', level: 3, seed: 1,
};
const build = (warmupTicks) => generateScenarioV3({ ...axes, warmupTicks });

/* ---------------------------------------------------------------------------
 * The warm-up length is derived, not chosen to clear a minimum.
 * ------------------------------------------------------------------------- */

test('the warm-up target exceeds the length that merely clears every head guard', () => {
  assert.equal(FORGE_WARMUP_MINIMUM_TO_CLEAR_GUARDS, 18);
  assert.equal(FORGE_WARMUP_TARGET_TICKS, 24);
  assert.ok(FORGE_WARMUP_TARGET_TICKS > FORGE_WARMUP_MINIMUM_TO_CLEAR_GUARDS);
});

test('every head records a required length and a length at which it actually measures', () => {
  assert.equal(ORACLE_HEAD_TEMPORAL_CONTRACT.length, 8);
  for (const head of ORACLE_HEAD_TEMPORAL_CONTRACT) {
    assert.ok(head.measurableAtFrames >= head.requiredFrames, head.headId);
    assert.ok(head.temporalField.length > 0, head.headId);
    assert.ok(head.missingHistoryBehaviour.length > 0, head.headId);
    assert.ok(head.source.length > 0, head.headId);
  }
});

test('regimeChange is the binding head and is not measurable at its own guard', () => {
  const regime = ORACLE_HEAD_TEMPORAL_CONTRACT.find((head) => head.headId === 'regimeChange');
  assert.equal(regime.requiredFrames, 18);
  assert.equal(regime.measurableAtFrames, 24);
  const atGuard = oracleHeadReachability(18);
  assert.equal(atGuard.heads.regimeChange.guardCleared, true);
  assert.equal(atGuard.heads.regimeChange.semanticallyMeasurable, false);
});

test('the audit reports the chosen length as exceeding the minimum', () => {
  const audit = auditOracleTemporalContract();
  assert.equal(audit.lengthNotChosenToClearMinimum, true);
  assert.equal(audit.channelVocabularyDefect.oracleModified, false);
  assert.equal(audit.channelVocabularyDefect.headsModified, false);
});

/* ---------------------------------------------------------------------------
 * History is lived, never appended.
 * ------------------------------------------------------------------------- */

test('the warm-up module never writes to world.history', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/forge/warmup.js', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/history\s*\.\s*push/.test(code));
  assert.ok(!/\.history\s*=/.test(code));
});

test('the warm-up never imports an expert or Prime', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/forge/warmup.js', import.meta.url), 'utf8');
  const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  assert.ok(!specifiers.some((entry) => /experts\/|prime\//.test(entry)));
});

test('each warm-up frame carries its own tick, in order, one per tick', () => {
  const warmup = runCalibratedWarmup(1, build);
  const history = warmup.world.history;
  assert.equal(history.length, warmup.warmupTicks + 1);
  history.forEach((frame, index) => assert.equal(frame.tick, index));
});

test('the warm-up plays only WAIT', () => {
  assert.equal(FORGE_TEMPORAL_WARMUP_V1.actionPolicy, 'WAIT_ONLY');
});

/* ---------------------------------------------------------------------------
 * The task survives the warm-up.
 * ------------------------------------------------------------------------- */

test('warm-up preserves the task signature it started from', () => {
  const warmup = runCalibratedWarmup(1, build);
  const config = warmup.scenarioConfig;
  const initial = createWorld(1, config);
  assert.deepEqual(taskDelta(taskSignature(initial), taskSignature(warmup.world)), []);
  assert.equal(warmup.taskPreserved, true);
});

test('the decision receives exactly the horizon the base scenario declared', () => {
  for (const horizonBand of ['H0', 'H2', 'H4']) {
    const axesForBand = { ...axes, horizonBand };
    const buildBand = (warmupTicks) => generateScenarioV3({ ...axesForBand, warmupTicks });
    const warmup = runCalibratedWarmup(1, buildBand);
    const base = generateScenarioV2(axesForBand);
    assert.equal(warmup.world.maxTicks - warmup.world.tick, base.maxTicks, horizonBand);
  }
});

test('a truncated warm-up still leaves the declared horizon, not a longer one', () => {
  /* A role mix with hostiles truncates; the calibration pass exists so the extra
   * horizon the truncation would otherwise leave behind is never handed over. */
  const contested = { ...axes, roles: 'defended' };
  const buildContested = (warmupTicks) => generateScenarioV3({ ...contested, warmupTicks });
  const warmup = runCalibratedWarmup(1, buildContested);
  const base = generateScenarioV2(contested);
  assert.equal(warmup.world.maxTicks - warmup.world.tick, base.maxTicks);
});

test('the channel is never clamped: warm-up never observes a repeat caused by running out of series', () => {
  const warmup = runCalibratedWarmup(1, build);
  assert.equal(warmup.channelClamped, false);
});

test('a warm-up longer than the declared channel would clamp, and is detected', () => {
  const short = { ...generateScenarioV3({ ...axes, warmupTicks: 24 }), channels: { primary: [10, 20, 30, 40] } };
  const warmup = runTemporalWarmup(1, { ...short, maxTicks: 60 }, { targetTicks: 10 });
  assert.equal(warmup.channelClamped, true);
});

/* ---------------------------------------------------------------------------
 * Determinism over every frame, not just the endpoint.
 * ------------------------------------------------------------------------- */

test('replay reproduces every warm-up frame, not only the decision state', () => {
  const first = runCalibratedWarmup(1, build);
  const replay = replayTemporalWarmup(1, first.scenarioConfig, { ...first, targetTicks: first.warmupTicks });
  assert.equal(replay.allFramesIdentical, true);
  assert.equal(replay.framesIdentical, replay.frameCount);
  assert.ok(replay.frameCount > 1);
});

test('two independent runs produce the same decision-point world hash', () => {
  assert.equal(hashWorld(runCalibratedWarmup(1, build).world), hashWorld(runCalibratedWarmup(1, build).world));
});

/* ---------------------------------------------------------------------------
 * The family is validated by measurement, never by its name.
 * ------------------------------------------------------------------------- */

test('family validation is head-free and rejects a mislabelled series', () => {
  const flat = new Array(25).fill(50);
  assert.equal(validateTemporalFamily('FLAT', flat).holds, true);
  assert.equal(validateTemporalFamily('MONOTONIC_RISE', flat).holds, false);
  assert.equal(validateTemporalFamily('LEVEL_SHIFT', flat).holds, false);
  assert.equal(validateTemporalFamily('HIGH_VOLATILITY', flat).holds, false);
});

test('every declared family builds a series that realises it over the observed window', () => {
  for (const family of FORGE_TEMPORAL_FAMILY_IDS) {
    const series = buildTemporalChannel(family, 60, 3, 24).slice(0, 25);
    assert.equal(validateTemporalFamily(family, series).holds, true, family);
  }
});

test('measurement of a realized series is arithmetic, not a label lookup', () => {
  const measured = measureRealizedSeries([10, 20, 30, 40]);
  assert.equal(measured.monotoneUp, true);
  assert.equal(measured.monotoneDown, false);
  assert.equal(measured.netChange, 30);
  assert.equal(measured.range, 30);
});

test('the family audit does not treat an unrealised family as ground truth', () => {
  const audit = auditTemporalFamilies([
    { temporalFamily: 'FLAT', temporalFamilyRealized: true, warmupTicks: 24 },
    { temporalFamily: 'LEVEL_SHIFT', temporalFamilyRealized: false, warmupTicks: 2 },
  ]);
  assert.equal(audit.realized, 1);
  assert.equal(audit.byFamily.LEVEL_SHIFT.realisationRate, 0);
  assert.equal(audit.byFamily.LEVEL_SHIFT.shortWarmup, 1);
});

/* ---------------------------------------------------------------------------
 * The Oracle axis is actually reached.
 * ------------------------------------------------------------------------- */

test('the generic Oracle abstains at tick zero and does not after warm-up', () => {
  const config = generateScenarioV3({ ...axes, warmupTicks: 24 });
  const atZero = evaluateOracle({ observationHistory: observe(createWorld(1, config)).observationHistory });
  assert.ok(atZero.rationaleCodes.includes('ORACLE_INSUFFICIENT_HISTORY'));

  const warmed = runCalibratedWarmup(1, build);
  const after = evaluateOracle({ observationHistory: observe(warmed.world).observationHistory });
  assert.ok(!after.rationaleCodes.includes('ORACLE_INSUFFICIENT_HISTORY'));
});

test('the eight-head assembly abstains on a Forge channel and reaches it through the declared mapping', () => {
  const warmed = runCalibratedWarmup(1, build);
  const history = observe(warmed.world).observationHistory;

  const unmapped = assembleOracleV2({ observationHistory: history });
  assert.equal(unmapped.heads.direction.supported, false);

  const mapped = assembleOracleV2(toOracleHeadInput(history, 'primary', warmed.scenarioConfig.channelSemantics.primary));
  assert.equal(mapped.heads.direction.supported, true);
  assert.notEqual(mapped.heads.direction.semanticOutput, null);
});

test('the channel mapping normalises against the declared domain, never the observed range', () => {
  const history = [
    { tick: 0, channels: { primary: 20 } },
    { tick: 1, channels: { primary: 40 } },
  ];
  const input = toOracleHeadInput(history, 'primary');
  assert.equal(input.observationHistory[0].channels[ORACLE_HEAD_CHANNEL_NAME], 0.2);
  assert.equal(input.observationHistory[1].channels[ORACLE_HEAD_CHANNEL_NAME], 0.4);
  assert.match(FORGE_ORACLE_CHANNEL_MAPPING.normalization, /DECLARED|declared/);
});

test('the threshold head is unreachable without declared semantics and reachable with them', () => {
  const warmed = runCalibratedWarmup(1, build);
  const history = observe(warmed.world).observationHistory;
  const without = assembleOracleV2(toOracleHeadInput(history, 'primary'));
  assert.equal(without.heads.timeToThreshold.semanticOutput, 'INSUFFICIENT_EVIDENCE');
  const semantics = declareChannelSemantics(warmed.scenarioConfig.channels.primary);
  const withSemantics = assembleOracleV2(toOracleHeadInput(history, 'primary', semantics));
  assert.notEqual(withSemantics.heads.timeToThreshold.semanticOutput, null);
});

test('per-head evaluation is never collapsed into a single number', () => {
  const records = ORACLE_HEAD_IDS.length === 0 ? [] : [{
    oracleGenericSufficient: true,
    oracleHeads: Object.fromEntries(ORACLE_HEAD_IDS.map((headId) => [headId,
      { output: 'UP', supported: true, framesSufficient: true, guardCleared: true }])),
  }];
  const evaluated = evaluateOracleHeads(records);
  assert.equal(evaluated.neverCollapsed, true);
  assert.equal(Object.keys(evaluated.heads).length, 8);
  assert.equal(evaluated.knownHeadProperty.headModified, false);
});

/* ---------------------------------------------------------------------------
 * Lineage.
 * ------------------------------------------------------------------------- */

test('V2 declares V1 as its immutable parent and does not reuse its version string', () => {
  assert.equal(FORGE_DATASET_V2_VERSION, 'FORGE_DATASET_V2');
  assert.equal(FORGE_DATASET_V2_PARENT, FORGE_DATASET_VERSION);
  assert.notEqual(FORGE_DATASET_V2_VERSION, FORGE_DATASET_VERSION);
  assert.equal(FORGE_DATASET_V2_LINEAGE.parentImmutable, true);
  assert.equal(FORGE_DATASET_V2_LINEAGE.parentArtifactsModified, false);
  assert.equal(FORGE_DATASET_V2_LINEAGE.changeClass, 'CORPUS_CONSTRUCTION');
});

test('V2 splits are recomputed, not inherited: some topology lands elsewhere', () => {
  const digests = Array.from({ length: 200 }, (unused, index) => `${index}`.padStart(64, 'a'));
  const moved = digests.filter((digest) => splitForTopology(digest) !== splitForTopologyV2(digest));
  assert.ok(moved.length > 0, 'V2 split assignment must not be identical to V1');
  for (const digest of digests) assert.ok(['TRAIN', 'VALIDATION', 'HOLDOUT'].includes(splitForTopologyV2(digest)));
});

test('a V1/V2 comparison is attributed to the corpus and never to a model', () => {
  const comparison = compareLineages(
    { oracleCases: 0, oracleSufficientRate: 0, routerAlignment: 0.0268, oracleFramesVisibleAtDecision: 1, primeOptimumRate: 0.2207, primeLegalRate: 1, nexusStructuralRate: 1, horizonAlignedOptimumRate: 0.8684, horizonDependentOptimumRate: 0 },
    { oracleCases: 290, oracleSufficientRate: 0.96, routerAlignment: 0.9, oracleFramesVisibleAtDecisionMax: 25, primeOptimumRate: 0.22, primeLegalRate: 1, nexusStructuralRate: 1, horizonAlignedOptimumRate: 0.86, horizonDependentOptimumRate: 0 },
  );
  assert.equal(comparison.attribution, 'CORPUS_EFFECT');
  assert.equal(comparison.modelsFrozen, true);
  assert.match(comparison.attributionNote, /model improvement would be false/);
});

/* ---------------------------------------------------------------------------
 * Authority and scope.
 * ------------------------------------------------------------------------- */

test('the inherited Stage 3B baseline is pinned, including the defect it recorded', () => {
  assert.equal(STAGE3B1_INHERITED_BASELINE.oracleCases, 0);
  assert.equal(STAGE3B1_INHERITED_BASELINE.routerAlignment, 0.0268);
  assert.equal(STAGE3B1_INHERITED_BASELINE.historyFramesAtDecision, 1);
  assert.equal(STAGE3B1_INHERITED_BASELINE.authority, 'R0');
  assert.equal(STAGE3B1_INHERITED_BASELINE.canDispatch, false);
});

test('no training is started and Soup never replaces an expert', () => {
  assert.equal(STAGE3B1_TRAINING_CAMPAIGN_SPEC.trainingStarted, false);
  assert.equal(STAGE3B1_TRAINING_CAMPAIGN_SPEC.soupInvokedForTraining, false);
  assert.equal(STAGE3B1_TRAINING_CAMPAIGN_SPEC.routerTrained, false);
  assert.equal(STAGE3B1_TRAINING_CAMPAIGN_SPEC.governance.replacesSentinelExpert, false);
  assert.equal(STAGE3B1_TRAINING_CAMPAIGN_SPEC.governance.authorityTier, 'R0');
  assert.equal(STAGE3B1_TRAINING_CAMPAIGN_SPEC.governance.canDispatch, false);
  assert.equal(STAGE3B1_TRAINING_CAMPAIGN_SPEC.governance.canMutateLiveWorld, false);
});

test('the decision-point contract names every state it passes through', () => {
  assert.deepEqual(WARMUP_DECISION_STATES, [
    'WORLD_INITIALIZED', 'WARMUP_COMPLETE', 'HISTORY_VALID', 'SEMANTIC_ADMISSION_PASS', 'DECISION_CAPTURED',
  ]);
});

/* ---------------------------------------------------------------------------
 * The scope fence must be able to fail.
 *
 * A fence that passes on the shipping source proves nothing on its own — it might
 * be incapable of rejecting anything. Each mutant below is a violation the stage
 * brief forbids by name, injected into a copy of the real source; the fence must
 * catch every one, and must not fire on the source as shipped.
 * ------------------------------------------------------------------------- */

test('the scope fence catches every forbidden mutation and clears the shipping source', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/forge/warmup.js', import.meta.url), 'utf8');
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const importsOf = (text) => [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  const violates = (text) => {
    const code = strip(text);
    return importsOf(code).some((entry) => /experts\/|prime\//.test(entry))
      || /evaluateNexus|evaluateOracle|recommend\(/.test(code)
      || /history\s*\.\s*push|history\s*=\s*\[/.test(code)
      || /world\.(entities|relations|objectives|constraints|tick|channels)\s*=/.test(code)
      || /tier:\s*'R[1-5]'|AuthorityTier\.R[1-5]/.test(code);
  };

  const mutants = [
    ['WARMUP_IMPORTS_ORACLE', source.replace("import { assertForge } from './contract.js';", "import { assertForge } from './contract.js';\nimport { evaluateOracle } from '../experts/oracle.js';")],
    ['WARMUP_PUSHES_HISTORY', source.replace('  let ticks = 0;', '  let ticks = 0;\n  world.history.push({ tick: -1, channels: {} });')],
    ['WARMUP_MUTATES_WORLD', source.replace('  let ticks = 0;', '  let ticks = 0;\n  world.tick = 5;')],
    ['WARMUP_CALLS_RECOMMEND', source.replace('  let ticks = 0;', '  let ticks = 0;\n  const chosen = recommend({});')],
    ['WARMUP_RAISES_AUTHORITY', source.replace("  actionPolicy: 'WAIT_ONLY',", "  actionPolicy: 'WAIT_ONLY',\n  tier: 'R2',")],
  ];

  for (const [name, body] of mutants) {
    assert.notEqual(body, source, `${name} did not apply — the anchor moved`);
    assert.equal(violates(body), true, `${name} was not caught by the fence`);
  }
  assert.equal(violates(source), false, 'the fence fires on the shipping source');
});

test('training exports are drawn from TRAIN only, never from holdout or OOD', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../scripts/certify-stage3b1-temporal-warmup.mjs', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  /* The leakage measurement checks that the SPLITS do not overlap; it cannot see
   * an export that reads across them. So the scoping is pinned here instead. */
  assert.match(code, /const trainRecords = corpus\.records\.filter\(\(record\) => record\.split === 'TRAIN'\)/);
  for (const exporter of ['exportSftV2', 'exportPreferenceV2', 'exportRlV2']) {
    assert.match(code, new RegExp(`${exporter}\\(trainRecords`), `${exporter} must export from trainRecords`);
    assert.ok(!new RegExp(`${exporter}\\(corpus\\.records`).test(code), `${exporter} must not export the whole corpus`);
  }
});

test('the exported manifest records which split it came from', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(
    new URL('../artifacts/stage3b1-temporal-warmup/stage3b1-dataset-export-manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.exportedFrom, 'TRAIN');
  assert.equal(manifest.datasetVersion, 'FORGE_DATASET_V2');
  assert.equal(manifest.allRowsTaggedV2, true);
  assert.ok(manifest.exportedRecords > 0);
});

test('a shortened warm-up reports as truncated, against the ORIGINAL target', () => {
  /* The calibration pass asks for exactly the length the probe proved safe, so the
   * final run always meets its own target. Reporting that as "not truncated" would
   * make every shortened warm-up invisible in the audit. */
  const contested = (warmupTicks) => generateScenarioV3({ ...axes, roles: 'defended', warmupTicks });
  const shortened = runCalibratedWarmup(1, contested);
  assert.equal(shortened.calibrationPasses, 2);
  assert.ok(shortened.warmupTicks < FORGE_WARMUP_TARGET_TICKS);
  assert.equal(shortened.truncated, true);
  assert.equal(shortened.shortenedBelowTarget, true);
  assert.equal(shortened.stopReason, 'TASK_CHANGED');
  assert.ok(shortened.taskChangedFields.length > 0, 'a truncation must name what would have changed');
  assert.equal(shortened.taskPreserved, true);

  const full = runCalibratedWarmup(1, build);
  assert.equal(full.calibrationPasses, 1);
  assert.equal(full.truncated, false);
  assert.equal(full.shortenedBelowTarget, false);
  assert.equal(full.warmupTicks, FORGE_WARMUP_TARGET_TICKS);
});

/* ---------------------------------------------------------------------------
 * Shard independence.
 * ------------------------------------------------------------------------- */

test('a record is a pure function of its axes, so the shard that built it cannot matter', async () => {
  const { buildRecordV2 } = await import('../src/forge/record-v2.js');
  const combination = { shape: 'chain', roles: 'bare', objectives: 'restore_infrastructure', horizonBand: 'H2', level: 2, seed: 1 };
  const first = buildRecordV2(combination, false);
  const second = buildRecordV2(combination, false);
  assert.equal(first.admitted, true);
  assert.equal(first.record.recordHash, second.record.recordHash);
  assert.equal(first.record.worldHash, second.record.worldHash);
  assert.equal(first.record.warmupTicks, second.record.warmupTicks);
  assert.equal(first.stoppedAt, 'DECISION_CAPTURED');
});

test('the generator and the certification share one record builder', async () => {
  const { readFile } = await import('node:fs/promises');
  const generator = await readFile(new URL('../scripts/generate-stage3b1-corpus.mjs', import.meta.url), 'utf8');
  /* If these were two copies of the same logic they could drift apart, and the
   * shard-independence check would compare a record to a rebuild of itself under
   * different code while still reporting a match. */
  assert.match(generator, /import \{ DECISION_STAGES, buildRecordV2 \} from '\.\.\/src\/forge\/record-v2\.js'/);
  assert.ok(!/function buildRecord\(/.test(generator), 'the generator must not carry its own record builder');
});

test('the record carries the temporal provenance a later reader needs', async () => {
  const { buildRecordV2 } = await import('../src/forge/record-v2.js');
  const { record } = buildRecordV2({ shape: 'chain', roles: 'bare', objectives: 'restore_infrastructure', horizonBand: 'H2', level: 2, seed: 1 }, false);
  for (const field of [
    'warmupVersion', 'warmupTicks', 'warmupTargetTicks', 'warmupTruncated', 'warmupStopReason',
    'warmupTaskPreserved', 'historyFrames', 'decisionHorizonRemaining', 'horizonPreservedExactly',
    'temporalFamily', 'temporalFamilyRealized', 'oracleGenericSufficient', 'oracleHeads',
  ]) {
    assert.ok(Object.hasOwn(record, field), `record is missing ${field}`);
  }
  assert.equal(record.recordVersion, 'FORGE_DATASET_V2');
  assert.equal(record.horizonPreservedExactly, true);
  assert.equal(Object.keys(record.oracleHeads).length, 8);
});
