// Phase 1 (eight-game inventory) and Phase 7 (nine-expert applicability), computed from source and live native calls.
// Reuses the source-cited v33.1 inventory artifact (win/loss/timeout/step/terminal citations) by hash, and adds the
// Stage 3H fields: public vs privileged state, regime/time labels, counterfactual availability, Sentinel integration.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { create, packet, observe, metrics } from '../ascii-suite/v32/kernel.mjs';
import { LEVELS } from '../ascii-suite/v32/catalog.mjs';
import { publicGraph } from '../ascii-suite/v31/sentinel.mjs';
import { evaluateNexus } from '../src/experts/nexus.js';
import { evaluateOracle } from '../src/experts/oracle.js';
import { GA, LANE, rawHash, readJson, writeExclusive, assertSoleWriter, verifyInheritance, ROSTER } from './guard.mjs';
import { GAMES, LEGACY_GAMES, STRONGEST_KIND, ARMS } from './arms.mjs';
import { REGIME_RULES, TIME_RULES } from './harness.mjs';
import { PERTURB } from './observer.mjs';
import { METRIC_SPEC, NORMALIZED_REGRET } from './metrics.mjs';

const V331_INV = 'ascii-quality-v33_1/artifacts/ASCII_V33_1_INVENTORY_V1.json';
const V331_RESULT = 'ascii-quality-v33_1/RESULT.json';
export const INVENTORY_DEV_SEED = 0x5e3a0000;
const OWNER = { pong: 'ascii-suite/worlds/pong.mjs + ascii-suite/v32/legacy-extension.mjs', platformer: 'ascii-suite/worlds/platformer.mjs + ascii-suite/v32/legacy-extension.mjs', fighter: 'ascii-suite/worlds/fighter.mjs + ascii-suite/v32/legacy-extension.mjs', racing: 'ascii-suite/worlds/racing.mjs + ascii-suite/v32/legacy-extension.mjs', rescue: 'ascii-suite/v3/kernel.mjs + ascii-suite/v32/strategic-extension.mjs', cards: 'ascii-suite/v3/kernel.mjs + ascii-suite/v32/strategic-extension.mjs', factory: 'ascii-suite/v3/kernel.mjs + ascii-suite/v32/strategic-extension.mjs', roguelike: 'ascii-suite/v3/kernel.mjs + ascii-suite/v32/strategic-extension.mjs' };
const HAZARDS = { pong: 'spin, acceleration, noisy delayed ball channel, two-ball mode, adaptive shot opponent; Advanced 1/3 have no constructive win witness', platformer: 'gaps, spikes, patrols, moving platforms, timed hazards, key/switch/gate dependencies, tier-3 wind (strength withheld)', fighter: 'startup/active/recovery frames, cross-ups, hidden opponent style, equal reaction latency', racing: 'grip limit, wet corners, barriers, car contact, rotated starting grid decides first place (v33.1)', rescue: 'hidden threats/civilians, deadlines, relocations with timestamped intel, closures, multiple extractions', cards: 'own hand concealed, scarce clues, deck exhaustion, private partner clue priorities', factory: 'broken/disconnected chains, shared ore/power/credits, quotas/deadlines, equipment disruptions', roguelike: 'unknown geometry, hidden traps, adjacent enemies, scarce healing, keys/gates, cyclic hazards, final artifact' };

const keysOf = (o) => Object.keys(o ?? {}).sort();
export function buildInventory() {
  const v331 = readJson(resolve(GA, V331_INV)), result = readJson(resolve(GA, V331_RESULT));
  const unresolved = String(result.UNRESOLVED_DEFECTS).split(' ').filter(Boolean);
  const games = GAMES.map((game) => {
    const levels = LEVELS.filter((l) => l.game === game).map((l) => {
      const w = create(game, INVENTORY_DEV_SEED, l.tier, { family: 'S3H_ASCII_DEV' }), p = packet(w), o = p.observation;
      const graph = publicGraph(o), nexus = evaluateNexus({ canonicalState: graph, legalActions: p.actions.map((a) => ({ actionId: a.id, targetEntityId: a.parameters?.id ?? null })) });
      const src = v331.levels.find((x) => x.LEVEL === l.id);
      return { level: l.id, tier: l.tier, label: l.label, name: l.name, demand: l.demand, tickLimit: src?.TICK_LIMIT ?? null,
        actionTypesT0: [...new Set(p.actions.map((a) => a.type))], actionCountT0: p.actions.length,
        step: src?.STEP_FUNCTION ?? null, terminal: src?.TERMINAL_CONDITIONS ?? null, win: src?.WIN_LOGIC ?? null, loss: src?.LOSS_LOGIC ?? null, timeout: src?.TIMEOUT_LOGIC ?? null,
        v331Reachability: src?.KNOWN_REGRESSIONS ?? null, v331Unresolved: unresolved.filter((u) => u.startsWith(l.id + ':')),
        nexusT0: { graphEntities: graph.entities.length, graphRelationships: graph.relationships.length, rationaleCodes: nexus.rationaleCodes } };
    });
    const w = create(game, INVENTORY_DEV_SEED, 1, { family: 'S3H_ASCII_DEV' }), o = observe(w);
    const innerKeys = keysOf(w.inner), obsKeys = keysOf(o), extKeys = keysOf(w.inner.ext);
    const perturbable = [PERTURB.common(w, o)?.fields ?? [], PERTURB[game](w, o)?.fields ?? []].flat();
    return {
      game, nativeSimulationOwner: OWNER[game], ownerSha256: OWNER[game].split(' + ').map((f) => ({ file: f, sha256: rawHash(resolve(GA, f)).slice(0, 16) })),
      actor: game === 'cards' ? 'P0 plus native STRONG partners (P1..)' : game === 'rescue' ? 'selected team unit (SELECT_UNIT)' : 'P0',
      stateSchema: { innerKeys, extKeys }, observationSchema: { packet: 'V32_PUBLIC_PACKET_V1 {binding, observation, actions, sensor}', observationKeys: obsKeys },
      publicVersusPrivileged: { innerFieldsNotInObservation: innerKeys.filter((k) => !obsKeys.includes(k)), privilegedFieldsCounterfactuallyTested: perturbable,
        explicitWithholding: game === 'fighter' ? 'opponentCapabilities.privateStyle=WITHHELD' : game === 'platformer' ? 'windZones[].strength=null' : game === 'cards' ? 'own cards {concealed:true}' : game === 'factory' ? 'none: fully public management state' : 'line-of-sight/inspection-gated entities' },
      legalActions: { source: game === 'factory' || game === 'cards' || game === 'rescue' || game === 'roguelike' ? 'legalStrategic (parameterized)' : 'legalLegacy (typed)', perTier: levels.map((l) => ({ tier: l.tier, types: l.actionTypesT0, count: l.actionCountT0 })) },
      controllers: { incumbent: 'v32 STRONG (ascii-suite/v32/policy.mjs)', strongest: STRONGEST_KIND[game] ?? 'v32 STRONG', reference: 'v32 RULE' + (LEGACY_GAMES.includes(game) ? ' (controllers/index.mjs PRIMARY_BASELINE)' : ' (v3 RULE_BASELINE)'), floors: ['v32 WAIT', 'v32 RANDOM'],
        privilegedDiagnosticOnly: LEGACY_GAMES.includes(game) ? 'ROOT-PUCT incumbent (ascii-suite/prime.mjs) on the ASCII 2.0 engine only, simulator access, excluded from parity comparisons' : 'none' },
      rewardAndTerminal: { nativeMetricKeys: keysOf(metrics(w)), primaryMetric: METRIC_SPEC[game].primary, catastropheField: 'metrics().catastrophic', perLevel: levels.map((l) => ({ level: l.level, win: l.win, loss: l.loss, terminal: l.terminal, timeout: l.timeout })) },
      deterministicSeeds: 'uint32 seed; create(game, seed, tier, {family, sensor}) is a pure function of its arguments (observer audit sameSeedSameWorld)',
      replay: 'ascii-suite/v32/kernel.mjs#replay/verifyReplay (per-step inner-state hashes)',
      existingTests: ['ascii-suite/suite.test.mjs', 'ascii-suite/v3/tests.mjs', 'ascii-suite/v31/tests.mjs', 'ascii-suite/v32/tests.mjs', 'ascii-quality-v33_1/tests.mjs'],
      advancedFixtures: levels.map((l) => l.level),
      hazards: HAZARDS[game],
      observableRegime: REGIME_RULES[game] ? { field: REGIME_RULES[game].field } : 'NOT_DEFINED (no source-declared regime field)',
      observableTime: TIME_RULES[game] ? { field: TIME_RULES[game].field, note: 'public remaining-budget label, not a planning horizon' } : 'NOT_DEFINED',
      nativeCounterfactualEvaluator: NORMALIZED_REGRET,
      fullEpisodeEvaluation: 'FEASIBLE (terminal or tick-limit timeout in every level; v33.1 terminalReached 24/24)',
      sentinelObserverIntegration: { path: 'ascii-suite/v31/sentinel.mjs', graph: game === 'factory' ? 'nodes + built edges (o.edges)' : ['rescue', 'roguelike'].includes(game) ? 'actor/civilians/enemies, civilian->actor depends' : 'EMPTY (no declared relationship model; Nexus returns NEXUS_EMPTY_GRAPH)', nexusActionAuthority: game === 'factory' ? 'offered REPAIR only' : 'none', oracle: 'TEMPORAL_ADVISORY_ONLY_NOT_ACTION_SELECTOR' },
      isolatedRecommendationEvaluation: 'POSSIBLE: packets are deep-frozen pure functions of state; worlds are structuredClone-isolated; tested by observer audit and shadow non-interference',
      levels,
    };
  });
  return { schema: 'STAGE3H_ASCII_COMPETENCE_V1_INVENTORY', inheritedInventory: { file: V331_INV, sha256: rawHash(resolve(GA, V331_INV)) }, inheritedResult: { file: V331_RESULT, sha256: rawHash(resolve(GA, V331_RESULT)), verdict: result.ASCII_RECOVERY_VERDICT },
    gameCount: games.length, levelCount: games.reduce((n, g) => n + g.levels.length, 0), historicalValidationPreserved: 'v33/v33.1 results are cited, never rerun or relabeled; their seeds (271828..271839, 0x7c0000xx, 0x7c1000xx) are development-only', games, authority: 'R0' };
}

const FLAGS = ['IMPLEMENTED', 'CALLABLE', 'OBSERVATION_COMPATIBLE', 'ACTION_COMPATIBLE', 'TASK_APPLICABLE', 'BASELINE_AVAILABLE', 'INCREMENTAL_VALUE_TESTABLE'];
/** Nine-expert x eight-game applicability, from source and live probes on inventory development worlds. */
export function expertMatrix(inv) {
  const r2 = readJson(resolve(GA, 'stage3h2r-development/NINE_EXPERT_INVENTORY_V1.json'));
  const nexusProbe = Object.fromEntries(inv.games.map((g) => [g.game, g.levels.map((l) => l.nexusT0)]));
  const oracleOk = Object.fromEntries(GAMES.map((game) => { const w = create(game, INVENTORY_DEV_SEED, 1, { family: 'S3H_ASCII_DEV' }); const o = observe(w); const out = evaluateOracle({ observationHistory: [0, 1, 2].map((t) => ({ tick: t, channels: { x: 0, y: 0, health: 0, progress: 0, resources: 0 } })) }); return [game, { callable: !!out, abstain: !!out.abstain, observedKeys: Object.keys(o).length }]; }));
  const row = (expert, game) => {
    const f = Object.fromEntries(FLAGS.map((k) => [k, false])); let reason;
    f.BASELINE_AVAILABLE = true;
    if (expert === 'Nexus') {
      f.IMPLEMENTED = true; f.CALLABLE = true;
      const nonEmpty = nexusProbe[game].some((p) => p.graphEntities > 0);
      f.OBSERVATION_COMPATIBLE = nonEmpty;
      f.ACTION_COMPATIBLE = game === 'factory'; f.TASK_APPLICABLE = game === 'factory'; f.INCREMENTAL_VALUE_TESTABLE = game === 'factory';
      reason = game === 'factory' ? 'v31 binding lets Nexus own an offered public REPAIR; tested via SENTINEL_V31_AS_IS vs V31_FALLBACK_ABLATION and NEXUS_REPAIR_OVER_STRONGEST_V1 vs STRONGEST_NATIVE'
        : nonEmpty ? 'public graph is evaluated but the existing binding grants no action authority outside factory REPAIR; Sentinel action == fallback by construction (identity, not a measured zero)'
          : 'no declared relationship model: native Nexus returns NEXUS_EMPTY_GRAPH; INAPPLICABLE';
    } else if (expert === 'Oracle') {
      f.IMPLEMENTED = true; f.CALLABLE = oracleOk[game].callable; f.OBSERVATION_COMPATIBLE = true;
      reason = 'invoked on public channel history; source role TEMPORAL_ADVISORY_ONLY_NOT_ACTION_SELECTOR, so no action binding exists; Oracle path closed (CONTRACT_NOT_TESTABLE) and not reopened';
    } else if (expert === 'Prime') {
      f.IMPLEMENTED = true; f.CALLABLE = LEGACY_GAMES.includes(game);
      reason = LEGACY_GAMES.includes(game) ? 'incumbent ROOT-PUCT exists only on the ASCII 2.0 engine and requires known-simulator successors: violates public-information parity, so INAPPLICABLE for comparison; experimental synthesis never differed from its single input (3H.2-R)' : 'no ROOT-PUCT binding for this game; no Prime synthesis interface over ASCII packets';
    } else if (expert === 'Vanguard' || expert === 'Horizon') {
      f.IMPLEMENTED = true; reason = r2.experts[expert].TASK_APPLICABLE === false ? 'colony-codec only; frozen checkpoint is untrained initialization (3H.16); no ASCII observation codec' : 'colony-codec only (AZL); no ASCII observation codec or action decoder';
    } else if (expert === 'Archimedes') reason = 'NO_IMPLEMENTATION_FOUND (3H.2-R)';
    else if (expert === 'Alexandria') reason = 'TASK_NOT_APPLICABLE: no retrieval task or store in ASCII games';
    else if (expert === 'Picasso') reason = 'visual specialist; ASCII observations are structured text packets, no image task; may not alter rendering or mechanics';
    else if (expert === 'Forge') reason = 'coding/RSI expert; no engineering task in gameplay; may not rewrite native mechanics; Forge World is infrastructure, not this expert';
    return { ...f, reason };
  };
  const matrix = Object.fromEntries(ROSTER.map((e) => [e, Object.fromEntries(GAMES.map((g) => [g, row(e, g)]))]));
  const testable = ROSTER.flatMap((e) => GAMES.filter((g) => matrix[e][g].INCREMENTAL_VALUE_TESTABLE).map((g) => e + '/' + g));
  return { schema: 'STAGE3H_ASCII_EXPERT_APPLICABILITY_V1', flags: FLAGS, roster: ROSTER, rosterPreserved: ROSTER.length === 9, tenthExpert: false, matrix, incrementalValueTestablePairings: testable,
    forgeWorldRuleTransfer: { rule: 'H0->NEXUS_ELSE_S0, H2->S0', status: 'NOT_TRANSFERRED', reason: 'ASCII games declare no H0/H2 horizon bands and have no S0 60-column codec; no source-faithful action adapter exists, none is created' },
    nexusProbe, oracleProbe: oracleOk, inheritedInventoryHash: r2.inventoryHash, armsDeclared: Object.keys(ARMS) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); verifyInheritance();
  const inv = buildInventory(), ex = expertMatrix(inv);
  writeExclusive(resolve(LANE, 'evidence/inventory.json'), inv);
  writeExclusive(resolve(LANE, 'evidence/expert-applicability.json'), ex);
  console.log(JSON.stringify({ games: inv.gameCount, levels: inv.levelCount, testable: ex.incrementalValueTestablePairings }));
}
