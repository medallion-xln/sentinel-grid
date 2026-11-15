// Dormant native wiring and injectable ordering checks. No generator/evaluator is invoked on module load.
import { sha256, stableStringify } from '../../../src/core/determinism.js';
import { createWorld, hashWorld, isTerminal } from '../../../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../../../src/forge-symmetric/scenarios-symmetric-v1.js';
import { runCalibratedWarmup } from '../../../src/forge/warmup.js';
import { validateScenarioV2 } from '../../../src/forge/validators-v2.js';
import { evaluateCounterfactualsSymmetricV1 } from '../../../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { observableView } from '../../../scripts/stage3g/evidence.mjs';
import { decisionPacket, invokeNexus } from '../../../stage3h-canonical-v1/adapters.mjs';
import { currentBaseline, S0_HASH } from '../../../stage3h-canonical-v1/baseline.mjs';
import { selectSets } from '../../../stage3h-activation-readiness-v2/runner-design.mjs';
import { scoreSyntheticTruth, assertRuntimeIdentity, digest } from './runner.mjs';
const ok = (v, m) => { if (!v) throw Error(m); };
// No export or execution path binds these ports to a campaign. Activation requires a reviewed connector.
const nativePorts = Object.freeze({
  warmup: combo => runCalibratedWarmup(combo.seed, warmupTicks => generateScenarioSymmetricV1({ ...combo, warmupTicks })),
  initial: (combo, config) => createWorld(combo.seed, config),
  validate: validateScenarioV2, terminal: isTerminal, stateHash: hashWorld, publicView: observableView,
  packet: decisionPacket, nexus: invokeNexus, baseline: currentBaseline,
  truth: (world, config) => evaluateCounterfactualsSymmetricV1(world, { horizon: config.horizon }),
});
function rowPipeline(combo, seen, ports, runtime) {
  assertRuntimeIdentity(runtime);
  ok(['H0', 'H2'].includes(combo.horizonBand), 'OUTSIDE_FROZEN_DOMAIN');
  const warm = ports.warmup(combo), config = warm.scenarioConfig;
  const initial = ports.initial(combo, config), validation = ports.validate(initial, config), world = warm.world;
  const terminal = ports.terminal(world);
  if (!validation.valid || terminal || !warm.taskPreserved) return { rejected: true, reason: { validation, terminal, taskPreserved: warm.taskPreserved }, replacementAllowed: false };
  const before = ports.stateHash(world);
  ok(!seen.has(before), 'DUPLICATE_WORLD_HASH'); seen.add(before);
  const view = ports.publicView(world), publicHash = digest(view);
  const packet = ports.packet(view.observation, view.surface, { evaluationSteps: config.horizon + 1 });
  const band = packet.horizon.evaluationSteps === 1 ? 'H0' : packet.horizon.evaluationSteps === 4 ? 'H2' : null;
  ok(band === combo.horizonBand, 'PACKET_HORIZON_MISMATCH');
  const menu = packet.legalActions.map(a => a.actionId);
  ok(menu.length && new Set(menu).size === menu.length, 'INVALID_MENU');
  const start = performance.now(), nexus = ports.nexus(packet), baseline = ports.baseline(view), elapsedMs = performance.now() - start;
  ok(elapsedMs <= 1000 && baseline.modelHash === S0_HASH, 'COMPUTE_LIMIT_OR_MODEL_MISMATCH');
  const selections = selectSets(band, baseline.selected, nexus.recommendedAction ? [nexus.recommendedAction] : null);
  for (const ids of Object.values(selections)) ok(ids.length && new Set(ids).size === ids.length && ids.every(id => menu.includes(id)), 'ILLEGAL_SELECTION');
  ok(digest(view) === publicHash && ports.stateHash(world) === before, 'PUBLIC_POLICY_MUTATED_INPUT');
  const decisionsHash = digest(selections); // All R/B/N decisions locked before truth port.
  const truth = ports.truth(world, config);
  ok(digest(selections) === decisionsHash && ports.stateHash(world) === before, 'TRUTH_RELEASE_MUTATED_SOURCE_OR_SELECTION');
  ok(truth.branches.length === menu.length && stableStringify([...menu].sort()) === stableStringify(truth.branches.map(b => b.actionKey).sort()), 'ACTION_SURFACE_MISMATCH');
  ok(truth.branches.every(b => Number.isFinite(b.totalScalar) && Number.isFinite(b.regret)), 'INVALID_NATIVE_TRUTH');
  const utilities = truth.branches.map(b => ({ id: b.actionKey, utility: b.totalScalar }));
  const max = Math.max(...utilities.map(b => b.utility)), spread = max - Math.min(...utilities.map(b => b.utility));
  ok(truth.utilitySpread === spread && truth.branches.every(b => b.regret === max - b.totalScalar), 'NATIVE_TRUTH_REGRET_MISMATCH');
  const score = scoreSyntheticTruth(selections, menu, utilities);
  return { rejected: false, recordId: sha256(combo), worldHash: before, band, regime: packet.regime[0], selections, menu, decisionsHash,
    publicEnvelopeHashByArm: { R: publicHash, B: publicHash, N: publicHash }, ...score,
    compute: { S0Calls: 1, NexusCalls: 1, chargedCallsEachArm: { S0: 1, Nexus: 1 }, elapsedMs, budgetMs: 1000, publicSimulatorCalls: 0 },
    events: ['ADMISSION_PASS', 'ALL_DECISIONS_LOCKED', 'TRUTH_RELEASED'], warmup: { truncated: warm.truncated, ticks: warm.warmupTicks } };
}
export function validateSyntheticPipeline({ fixture, ports, seen = new Set(), runtime }) {
  ok(fixture?.synthetic === true && !('seed' in fixture) && !('world' in fixture) && !('seed' in fixture.combo) && ports !== nativePorts, 'HANDCRAFTED_PORT_FIXTURE_ONLY');
  ok(ports && Object.keys(nativePorts).every(k => typeof ports[k] === 'function' && ports[k] !== nativePorts[k]), 'REAL_NATIVE_PORTS_NOT_ALLOWED');
  return rowPipeline(fixture.combo, seen, ports, runtime);
}
export function campaignEntryPoint() { throw Error('EXECUTION_DISABLED_PENDING_REVIEW_RUNTIME_CUSTODY_REGISTRATION_AND_SEPARATE_AUTHORIZATION'); }
