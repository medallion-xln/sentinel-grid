import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionKey } from '../src/core/contracts.js';
import { sha256 } from '../src/core/determinism.js';
import {
  legacyLegalActions,
  legacyMask,
  legacyObservation,
  legacyOutcome,
  legacyRecommend,
  legacyStep,
  legacyTargets,
} from '../src/compat/zeknova-stage1az-legacy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(root, 'config/zeknova-parity-runs.json'), 'utf8'));
const fixtures = [];
for (const run of config.fixtures) {
  const envelope = JSON.parse(await readFile(path.join(root, run.file), 'utf8'));
  const state = envelope.payload;
  const seed = BigInt(run.seed);
  const actions = legacyLegalActions(state, run.observerId).sort((a, b) => actionKey(a).localeCompare(actionKey(b)));
  const transitions = actions.map((action, index) => {
    const result = legacyStep(state, action, {
      seed,
      simulationIndex: index,
      stochasticAmplitude: 0.015,
    });
    return {
      actionKey: actionKey(action),
      stateHash: sha256(result.state),
      reward: result.reward,
      terminal: result.terminal,
    };
  });
  const recommendation = legacyRecommend({
    state,
    observerId: run.observerId,
    seed,
    simulations: run.simulations,
    cPuct: run.cPuct,
    stochasticAmplitude: 0.015,
  });
  fixtures.push({
    fixtureId: run.fixtureId,
    snapshotId: envelope.snapshotId,
    observerId: run.observerId,
    seed: run.seed,
    simulations: run.simulations,
    cPuct: run.cPuct,
    sourceStateHash: sha256(state),
    observationHash: sha256(legacyObservation(state, run.observerId)),
    legalMask: legacyMask(state, run.observerId),
    legalMaskHash: sha256(legacyMask(state, run.observerId)),
    targetSlotsHash: sha256(legacyTargets(state, run.observerId)),
    legalActionKeys: actions.map(actionKey),
    transitions,
    outcomeScalar: legacyOutcome(state, run.observerId),
    recommendation,
  });
}
const payload = {
  parityBaselineVersion: 1,
  sourceLineage: 'Stage 1A-Z',
  engineIdentity: config.engineIdentity,
  observationFeatureCount: 592,
  actionCatalog: [
    'stabilize','scout_region','intercept_contact','fortify_known_route','repair_known_structure','share_intelligence',
  ],
  fixtureCount: fixtures.length,
  fixtures,
};
const output = { ...payload, baselineHash: sha256(payload) };
await writeFile(path.join(root, 'parity/zeknova-stage1az/legacy-baseline.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ pass: true, fixtureCount: fixtures.length, baselineHash: output.baselineHash }, null, 2));
