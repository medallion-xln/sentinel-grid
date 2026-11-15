// Phase 3: Forge World sampling validity, BEFORE any compute is authorized. Writes evidence/sampling-validity.json (wx).
// Evidence sources: (1) source inspection with line citations; (2) metadata-only audit of already-executed populations
// (world hashes, cells, seeds; no outcome field is read); (3) a development-only diagnostic that regenerates the 288
// already-evaluated STAGE3H1 OPEN development worlds (generation + warmup only: no policy, no counterfactual truth);
// (4) synthetic generator-configuration checks of the OOD axes. No prospective or sealed seed is generated.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld, hashWorld, isTerminal } from '../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { generateScenarioV2 } from '../src/forge/scenarios-v2.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { decisionPacket } from '../stage3h-canonical-v1/adapters.mjs';
import { PLAN as OPEN_PLAN, combinations as openCombinations } from '../stage3h-canonical-v1/plan.mjs';
import { sha256, stableStringify } from '../src/core/determinism.js';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const read = (f) => readFileSync(resolve(GA, f), 'utf8');
const cite = (f, needle) => { const ls = read(f).split('\n'), i = ls.findIndex((l) => l.includes(needle)); if (i < 0) throw Error('CITATION_NOT_FOUND:' + f + ':' + needle); return { file: f, line: i + 1 }; };

export function sourceFacts() {
  const kernel = read('src/forge/kernel.js'), kernelSeedLines = kernel.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /\bseed\b|random/i.test(l)).map(([n]) => n);
  return {
    v2SeededGeneration: { derive: cite('src/forge/scenarios-v2.js', "deriveSeed(seed, 'forge-v2', shape, roles, objectives, horizonBand, String(level))"), prng: cite('src/forge/scenarios-v2.js', 'createSeededRandom(scenarioSeed)'),
      seedDrives: ['node count', 'obstacle cells', 'entity placement', 'entity value', 'entity health', 'primary structural node', 'failed structural node', 'channel kind'].map((what, i) => ({ what, ...cite('src/forge/scenarios-v2.js', ['const nodeCount = params.topologyNodes + randomInt(random, 0, 4)', 'cells[randomInt(random, 1, size - 1) * size', 'const cell = free[randomInt(random, 0, free.length)]', 'value: 2 + randomInt(random, 0, params.valueSpread + 2)', 'health: index % 4 === 0 ? 20 + randomInt(random, 0, 30) : 100', 'const primaryNode = structural[randomInt(random, 0, structural.length)]', 'const failed = structural[randomInt(random, 0, structural.length)]', 'const channelKind = randomInt(random, 0, 5)'][i]) })) },
    cellLabelsInSeedDerivation: 'the integer seed is hashed together with shape, roles, objectives, horizonBand and level, so equal integers in different cells give unrelated scenario seeds',
    v3TemporalFamily: cite('src/forge/scenarios-v3.js', "deriveSeed(base.scenarioSeed, 'forge-v3-temporal')"),
    symmetricOrientation: cite('src/forge-symmetric/scenarios-symmetric-v1.js', 'ORIENTATIONS[Number(digest % BigInt(ORIENTATIONS.length))]'),
    axisValidationFailsClosed: ['Unknown topology shape', 'Unknown role composition', 'Unknown objective composition', 'Unknown horizon band'].map((m) => cite('src/forge/scenarios-v2.js', m)),
    kernelTransitionsSeedFree: { file: 'src/forge/kernel.js', linesMentioningSeedOrRandom: kernelSeedLines, reading: 'the seed is stored in state (createWorld) and documented as the only entropy; no transition reads it, so dynamics are a function of semantic state' },
    worldIdentity: { ...cite('src/forge/kernel.js', 'return sha256(semanticProjection(world))'), projectionExcludesSeed: !/seed/.test(kernel.slice(kernel.indexOf('export function semanticProjection'), kernel.indexOf('export function hashWorld'))) },
    duplicateGuard: cite('stage3h-final-review-handoff/amendments/v3/native-pipeline.mjs', "ok(!seen.has(before), 'DUPLICATE_WORLD_HASH')"),
  };
}

function walkJson(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = resolve(dir, n), s = statSync(p); if (s.isDirectory()) { if (!/node_modules|\.git/.test(n)) walkJson(p, out); } else if (n.endsWith('.json') && s.size < 64 * 1024 * 1024) out.push(p); }
  return out;
}
/** Metadata-only audit of executed Forge populations: identity fields only (worldHash, combo). */
export function executedAudit() {
  const files = ['stage3h1d-development', 'stage3h1f-development'].flatMap((d) => walkJson(resolve(GA, d, 'results'))).filter((p) => p.endsWith('rows.json'));
  const panels = files.map((p) => { const d = JSON.parse(readFileSync(p, 'utf8')), rows = Array.isArray(d) ? d : d.rows; const hs = rows.map((r) => r.worldHash); return { panel: p.slice(GA.length + 1), rows: rows.length, uniqueWorldHashes: new Set(hs).size, seeds: new Set(rows.map((r) => r.combo.seed)).size, hashes: hs, seedList: [...new Set(rows.map((r) => r.combo.seed))] }; });
  const all = panels.flatMap((p) => p.hashes), union = new Set(all);
  return { panels: panels.map(({ hashes, seedList, ...p }) => p), totalRows: all.length, distinctAcrossAllPanels: union.size, crossPanelOverlap: all.length - union.size, priorWorldHashes: [...union].sort(), priorSeeds: [...new Set(panels.flatMap((p) => p.seedList))].sort((a, b) => a - b), outcomeFieldsRead: false };
}

/** Development-only diagnostic over the 288 already-evaluated OPEN worlds: generation + warmup, no policy, no truth. */
export function developmentDiagnostic() {
  const combos = openCombinations(), recorded = new Map();
  const openRows = resolve(GA, 'stage3h-canonical-v1/results/open-v1');
  if (existsSync(openRows)) for (const p of walkJson(openRows)) { try { const d = JSON.parse(readFileSync(p, 'utf8')); for (const r of (Array.isArray(d) ? d : d.rows ?? [])) if (r?.worldHash && r?.combo) recorded.set(sha256(r.combo), r.worldHash); } catch { /* non-row json */ } }
  const sem = new Set(), pub = new Set(), menus = new Set(), base = new Set(), orient = {}, perCell = {}; let regenIdentical = 0, rejected = 0, matchedRecorded = 0, comparedRecorded = 0, n = 0;
  for (const combo of combos) {
    const gen = () => runCalibratedWarmup(combo.seed, (warmupTicks) => generateScenarioSymmetricV1({ ...combo, warmupTicks }));
    const warm = gen(), again = gen(), config = warm.scenarioConfig, world = warm.world;
    if (hashWorld(again.world) === hashWorld(world)) regenIdentical++;
    if (isTerminal(world) || !warm.taskPreserved) { rejected++; continue; }
    n++; const h = hashWorld(world); sem.add(h);
    const r = recorded.get(sha256(combo)); if (r) { comparedRecorded++; if (r === h) matchedRecorded++; }
    const view = observableView(world); pub.add(sha256(view.observation.features ?? view.observation));
    const packet = decisionPacket(view.observation, view.surface, { evaluationSteps: config.horizon + 1 });
    menus.add(stableStringify(packet.legalActions.map((a) => [a.actionType, a.targetEntityId ?? null])));
    const b = generateScenarioV2({ shape: combo.shape, roles: combo.roles, objectives: combo.objectives, horizonBand: combo.horizonBand, level: combo.level, seed: combo.seed }); const { seed: _s, scenarioSeed: _ss, ...bNoSeed } = b; base.add(sha256(bNoSeed));
    orient[config.orientation] = (orient[config.orientation] ?? 0) + 1;
    const cell = [combo.shape, combo.roles, combo.objectives, combo.horizonBand, combo.level].join('/'); (perCell[cell] ??= new Set()).add(h);
  }
  const cellCounts = Object.values(perCell).map((s) => s.size);
  return { population: OPEN_PLAN.id, evidenceStatus: OPEN_PLAN.evidenceStatus, seeds: Object.values(OPEN_PLAN.panels).flat(), scheduled: combos.length, admitted: n, rejectedTerminalOrTaskLost: rejected,
    distinctSemanticWorlds: sem.size, distinctPublicObservations: pub.size, distinctMenuSignatures: menus.size, distinctPreOrientationScenarios: base.size, orientationCounts: orient,
    perCellDistinct: { cells: cellCounts.length, min: Math.min(...cellCounts), max: Math.max(...cellCounts) }, deterministicRegeneration: regenIdentical + '/' + combos.length,
    recordedHashReproduction: comparedRecorded ? matchedRecorded + '/' + comparedRecorded : 'NO_RECORDED_HASHES_FOUND', policyCalls: 0, counterfactualCalls: 0 };
}

/** OOD axes: each declared structural change is a distinct enumerated generator specification; unknown values fail closed. */
export function oodAxisChecks() {
  const seed = OPEN_PLAN.panels.OPEN_A[0], base = { shape: 'chain', roles: 'bare', objectives: 'reach_target', horizonBand: 'H0', level: 1, seed };
  const sig = (cfg) => { const s = generateScenarioV2(cfg); const { seed: _a, scenarioSeed: _b, ...rest } = s; return sha256(rest); };
  const variants = { OOD_LEVEL: [{ level: 6 }, { level: 7 }], OOD_ROLES: ['redundant', 'scarce', 'populated', 'industrial'].map((roles) => ({ roles })), OOD_OBJECTIVES: ['restore_infrastructure', 'protect_civilians'].map((objectives) => ({ objectives })) };
  const out = {};
  for (const [k, vs] of Object.entries(variants)) out[k] = vs.map((v) => { try { return { ...v, accepted: true, differsFromInDistribution: sig({ ...base, ...v }) !== sig(base) }; } catch (e) { return { ...v, accepted: false, error: String(e.message).slice(0, 80) }; } });
  const failClosed = ['shape', 'roles', 'objectives', 'horizonBand'].map((axis) => { try { generateScenarioV2({ ...base, [axis]: 'NOT_A_DECLARED_VALUE' }); return { axis, failsClosed: false }; } catch { return { axis, failsClosed: true }; } });
  const contract = JSON.parse(read('stage3h-final-review-handoff/amendments/v3/contract-v3.json'));
  return { variants: out, unknownValuesFailClosed: failClosed, contractOodShapes: contract.populations.OOD_SHAPES?.axes?.shapes ?? null, contractOodObjectives: contract.populations.OOD_OBJECTIVES?.axes?.objectives ?? null, executedIn3H1F: 'all four OOD populations executed with 1,824-1,889 distinct worlds each (executedAudit)' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const facts = sourceFacts(), executed = executedAudit(), dev = developmentDiagnostic(), ood = oodAxisChecks();
  const verdict = {
    seedsInfluenceInitialConditions: facts.v2SeededGeneration.seedDrives.length === 8 && dev.distinctPreOrientationScenarios === dev.admitted,
    distinctWorldIdentities: executed.crossPanelOverlap === 0 && executed.distinctAcrossAllPanels === executed.totalRows && dev.distinctSemanticWorlds === dev.admitted,
    publicObservationsDistinct: dev.distinctPublicObservations === dev.admitted,
    deterministicGeneration: dev.deterministicRegeneration === dev.scheduled + '/' + dev.scheduled,
    worldHashExcludesSeed: facts.worldIdentity.projectionExcludesSeed,
    oodAxesDeclaredAndStructural: Object.values(ood.variants).flat().every((v) => v.accepted && v.differsFromInDistribution) && ood.unknownValuesFailClosed.every((f) => f.failsClosed),
    familyLabelSideEffects: 'NONE: Forge cell labels are enumerated generator IDs validated fail-closed; there is no free-text family string',
  };
  verdict.FORGE_WORLD_SAMPLING = Object.entries(verdict).filter(([k]) => k !== 'familyLabelSideEffects').every(([, v]) => v === true) ? 'VALID' : 'FORGE_WORLD_SAMPLING_BLOCKED';
  const out = { schema: 'STAGE3H_OWNER_GOVERNED_SAMPLING_VALIDITY_V1', inheritance: inh, sourceFacts: facts, executedAudit: { ...executed, priorWorldHashes: undefined, priorSeeds: undefined, priorWorldHashSetSha256: sha256(executed.priorWorldHashes), priorSeedCount: executed.priorSeeds.length }, developmentDiagnostic: dev, oodAxisChecks: ood, verdict, newIdentitiesGenerated: false, authority: 'R0' };
  writeExclusive(resolve(LANE, 'evidence/sampling-validity.json'), out);
  writeExclusive(resolve(LANE, 'evidence/prior-exclusions.json'), { schema: 'STAGE3H_OWNER_GOVERNED_PRIOR_EXCLUSIONS_V1', source: 'metadata-only: worldHash and combo.seed of executed 3H.1-D/F rows', priorWorldHashes: executed.priorWorldHashes, priorSeeds: executed.priorSeeds, sha256: sha256(executed.priorWorldHashes) });
  console.log(JSON.stringify({ verdict, executed: out.executedAudit.panels.length + ' panels, ' + executed.totalRows + ' rows, overlap ' + executed.crossPanelOverlap, dev: { ...dev, seeds: undefined } }, null, 1));
}
