// Stage 3H decision-value closure: information value of the proposed ASCII Factory campaign (protocol 9737339c).
// Uses ONLY existing development evidence, source citations, and deterministic re-derivation of decision traces of the
// already-evaluated development worlds (each trace is checked against the recorded actionHash). No new world population,
// no prospective seed, no performance campaign. Writes DECISION.json exclusively.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { create, packet, step, terminal, observe } from '../ascii-suite/v32/kernel.mjs';
import { hash } from '../ascii-suite/v3/common.mjs';
import { publicGraph } from '../ascii-suite/v31/sentinel.mjs';
import { evaluateNexus } from '../src/experts/nexus.js';
import { V1, verifyV1 } from './inherit.mjs';
import { createArm } from '../stage3h-ascii-competence-v1/arms.mjs';
import { inverseNormal } from '../stage3h-ascii-competence-v1/metrics.mjs';
import { writeExclusive, assertSoleWriter, rawHash } from '../stage3h-ascii-competence-v1/guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GA = resolve(HERE, '..');
const dev = JSON.parse(readFileSync(resolve(V1, 'evidence/dev-run.json'), 'utf8'));
const protocol = JSON.parse(readFileSync(resolve(V1, 'evidence/protocol.json'), 'utf8')).protocol;
const SEED = dev.seeds[0];
const STRATA = { DEV_NORMAL: { family: dev.family, sensor: 'NORMAL' }, DEV_FACTORY_DELAYED: { family: dev.family, sensor: 'DELAYED' }, DEV_FACTORY_PARTIAL: { family: dev.family, sensor: 'PARTIAL' }, DEV_FACTORY_MISSING: { family: dev.family, sensor: 'MISSING' }, DEV_FACTORY_MIRRORED: { family: dev.family + '_MIRRORED', sensor: 'NORMAL' } };
const ARMS4 = ['STRONGEST_NATIVE', 'NEXUS_REPAIR_OVER_STRONGEST_V1', 'SENTINEL_V31_AS_IS', 'V31_FALLBACK_ABLATION'];
const factoryRows = dev.rows.filter((r) => r.spec.game === 'factory');
const recorded = (stratum, tier, seed, arm) => factoryRows.find((r) => r.stratum === stratum && r.spec.tier === tier && r.spec.seed === seed)?.results[arm];

// 1. Effective independent world count from existing evidence: identical content and identical trajectories across seeds.
function seedInvariance() {
  const strip = (w) => { const i = structuredClone(w.inner); delete i.seed; delete i.rng; return i; };
  const out = {};
  for (const [stratum, s] of Object.entries(STRATA)) for (const tier of [1, 2, 3]) {
    const content = new Set(dev.seeds.map((seed) => hash(strip(create('factory', seed, tier, { family: s.family, sensor: s.sensor })))));
    const traj = Object.fromEntries(ARMS4.map((a) => [a, new Set(dev.seeds.map((seed) => recorded(stratum, tier, seed, a)?.actionHash)).size]));
    out[stratum + ':t' + tier] = { distinctWorldContents: content.size, distinctTrajectoriesPerArm: traj };
  }
  const lines = readFileSync(resolve(GA, 'ascii-suite/v32/strategic-extension.mjs'), 'utf8').split('\n');
  const line = (needle, from = 0) => lines.findIndex((l, i) => i >= from && l.includes(needle)) + 1;
  return { perStratumTier: out, distinctFactoryWorldsEvaluated: Object.values(out).filter((v) => v.distinctWorldContents === 1).length,
    source: { file: 'ascii-suite/v32/strategic-extension.mjs', sha256: rawHash(resolve(GA, 'ascii-suite/v32/strategic-extension.mjs')).slice(0, 16),
      configureFactorySignature: { line: line('function configureFactory(w,tier,family)'), text: 'function configureFactory(w,tier,family): no seed parameter, no RNG call' },
      familyMirror: { line: line("family.includes('MIRROR')", 29), effect: "x -> 22-x reflection when the family label contains 'MIRROR'" },
      familyRelay: { line: line("family.includes('DOGLEG')||family.includes('OOD')", 29), effect: "storage->delivery relay topology when the family label contains 'DOGLEG' or 'OOD'" },
      call: { line: line("game==='factory')configureFactory(w,tier,family)") }, strategicRng: 'factory worlds carry no rng field; v32 factory step and sensors are deterministic' } };
}

// 2. Deterministic trace re-derivation of the recorded development worlds (verified against recorded actionHash).
function trace(stratum, tier, arm) {
  const s = STRATA[stratum]; let w = create('factory', SEED, tier, { family: s.family, sensor: s.sensor });
  const pol = createArm(arm, 'factory'), ids = [], types = {}, events = []; let repairsOffered = 0, maxEdges = 0, nexusStructural = 0, nexusFired = 0;
  while (!terminal(w) && ids.length < 6000) {
    const p = packet(w), d = pol.decide(p), o = observe(w);
    const reps = p.actions.filter((a) => a.type === 'REPAIR'); if (reps.length) repairsOffered++;
    maxEdges = Math.max(maxEdges, o.edges.length);
    if (reps.length && p.observation) { const nx = evaluateNexus({ canonicalState: publicGraph(p.observation), legalActions: p.actions.map((a) => ({ actionId: a.id, targetEntityId: a.parameters?.id ?? null })) }); if (nx.rationaleCodes.some((c) => ['NEXUS_CRITICAL_DEPENDENCY', 'NEXUS_BOTTLENECK', 'NEXUS_UNSUPPORTED_THREAT', 'NEXUS_CYCLE_DETECTED'].includes(c)) && !nx.rationaleCodes.includes('NEXUS_NO_RELATIONSHIPS')) nexusStructural++; }
    if (d.nexusFired) nexusFired++;
    if (d.nexusChanged) events.push({ tick: w.inner.tick, strongestAction: d.fallbackActionId, nexusAction: d.action.id, offeredRepairs: reps.map((a) => a.id), brokenNodes: o.nodes.filter((n) => n.broken).map((n) => n.id), sensorMissing: p.observation === null });
    types[d.action.type] = (types[d.action.type] ?? 0) + 1; ids.push(d.action.id); w = step(w, p, d.action);
  }
  const rec = recorded(stratum, tier, SEED, arm);
  return { arm, stratum, tier, actionHashMatchesRecorded: hash(ids) === rec?.actionHash, result: w.inner.result, delivered: w.inner.delivered, required: w.inner.required, ticks: w.inner.tick,
    actionTypes: types, ticksWithRepairOffered: repairsOffered, maxBuiltEdges: maxEdges, ticksNexusStructuralWithRepair: nexusStructural, nexusFired, nexusChangedEvents: events, ids };
}
function attribution() {
  const all = [];
  for (const stratum of Object.keys(STRATA)) for (const tier of [1, 2, 3]) {
    const t = Object.fromEntries(ARMS4.map((a) => [a, trace(stratum, tier, a)]));
    // For each Nexus change: did the strongest controller perform the Nexus-chosen repair later, and when?
    for (const e of t.NEXUS_REPAIR_OVER_STRONGEST_V1.nexusChangedEvents) { const k = t.STRONGEST_NATIVE.ids.indexOf(e.nexusAction, e.tick); e.strongestPerformsSameRepairAtOrAfterDecision = k; e.delayTicks = k >= 0 ? k - e.tick : null; e.nexusChangeIsReordering = k >= 0; }
    for (const x of Object.values(t)) delete x.ids;
    all.push({ stratum, tier, ...t });
  }
  const A = all.map((r) => r.STRONGEST_NATIVE), N = all.map((r) => r.NEXUS_REPAIR_OVER_STRONGEST_V1), S = all.map((r) => r.SENTINEL_V31_AS_IS), F = all.map((r) => r.V31_FALLBACK_ABLATION);
  const changes = N.flatMap((n) => n.nexusChangedEvents.map((e) => ({ stratum: n.stratum, tier: n.tier, ...e })));
  return {
    tracesMatchRecordedEvidence: all.every((r) => ARMS4.every((a) => r[a].actionHashMatchesRecorded)), distinctWorlds: all.length,
    A_strongNativePerformsWell: { success: A.filter((x) => x.result === 'SUCCESS').length, of: A.length },
    B_nexusNoObservedIncrementalBenefit: { changedDecisions: changes.length, worldsWithChange: new Set(changes.map((c) => c.stratum + c.tier)).size, successChanged: N.filter((n, i) => n.result !== A[i].result).length, changes,
      allChangesAreReorderingsOfRepairsTheStrongestControllerAlsoPerforms: changes.every((c) => c.nexusChangeIsReordering) },
    C_fallbackPlannerFailure: { sentinelV31Success: S.filter((x) => x.result === 'SUCCESS').length, ablationSuccess: F.filter((x) => x.result === 'SUCCESS').length, of: S.length,
      v31EqualsAblationTrajectory: all.filter((r) => recorded(r.stratum, r.tier, SEED, 'SENTINEL_V31_AS_IS').actionHash === recorded(r.stratum, r.tier, SEED, 'V31_FALLBACK_ABLATION').actionHash).length,
      nexusFiredInV31: S.reduce((n, x) => n + x.nexusFired, 0), maxBuiltEdgesInV31: Math.max(...S.map((x) => x.maxBuiltEdges)), ticksRepairOfferedInV31: S.reduce((n, x) => n + x.ticksWithRepairOffered, 0),
      ticksNexusStructuralWithRepairInV31: S.reduce((n, x) => n + x.ticksNexusStructuralWithRepair, 0),
      v31ActionTypes: S.reduce((m, x) => { for (const [k, v] of Object.entries(x.actionTypes)) m[k] = (m[k] ?? 0) + v; return m; }, {}),
      strongestActionTypes: A.reduce((m, x) => { for (const [k, v] of Object.entries(x.actionTypes)) m[k] = (m[k] ?? 0) + v; return m; }, {}),
      v31Results: [...new Set(S.map((x) => x.result))], v31DeliveredOfRequired: S.map((x) => x.delivered + '/' + x.required) },
    perWorld: all,
  };
}

// 3. Protocol arithmetic: distinct worlds behind the scheduled pairs, precision, compute, information value.
function arithmetic(inv, attr) {
  const pf = protocol.primaryFamily, hold = protocol.splits.HOLDOUT, ood = protocol.splits.STRUCTURAL_OOD.strata;
  const relay = (f) => /DOGLEG|OOD/.test(f), mirror = (f) => /MIRROR/.test(f);
  const cls = (f, sensor) => (mirror(f) ? 'MIRROR' : 'PLAIN') + '+' + (relay(f) ? 'RELAY' : 'NO_RELAY') + '+' + (sensor ?? 'NORMAL');
  const devClasses = new Set(Object.values(STRATA).map((s) => cls(s.family, s.sensor)));
  const strata = [{ id: 'HOLDOUT', family: hold.family, sensor: 'NORMAL', perTier: hold.perTierFactory }, ...ood.map((o) => ({ id: o.id, family: o.family, sensor: o.sensor ?? 'NORMAL', perTier: o.perTier }))]
    .map((s) => ({ ...s, worldClass: cls(s.family, s.sensor), distinctWorlds: 3, scheduledPairsPerReplication: 3 * s.perTier, alreadyEvaluatedInDevelopment: devClasses.has(cls(s.family, s.sensor)) }));
  const scheduledPerRep = strata.reduce((n, s) => n + s.scheduledPairsPerReplication, 0), distinct = strata.reduce((n, s) => n + s.distinctWorlds, 0);
  // Compute: factory arm-episode wall time from the recorded development progress log (36 stress rows x 4 arms).
  const log = readFileSync(resolve(V1, 'evidence/dev-run.progress.log'), 'utf8').split('\n').filter(Boolean).map((l) => ({ i: +l.match(/^\[(\d+)\//)[1], s: +l.match(/ (\d+)s$/)[1], l }));
  const t72 = log.find((x) => x.i === 72).s, t108 = log.find((x) => x.i === 108).s, secPerArmEpisode = (t108 - t72) / (36 * 4);
  const armEpisodes = scheduledPerRep * 2 * 4, factoryHours = armEpisodes * secPerArmEpisode / 3600;
  const z = inverseNormal(0.975), nominalHalfWidthWorstCase = z / Math.sqrt(pf.power.nPairsPerReplication), correctHalfWidth = 'undefined: 3 deterministic paired differences per replication; no sampling variance exists to estimate';
  return {
    protocolSha256: '9737339c0f9c5ff1f30146b2239821e43f9eefb2d2e6e5967a0827d2455a1b6f', strata,
    scheduledFactoryPairsPerReplication: scheduledPerRep, scheduledFactoryPairsBothReplications: 2 * scheduledPerRep, distinctFactoryWorldsInCampaign: distinct,
    distinctWorldsAlreadyEvaluated: strata.filter((s) => s.alreadyEvaluatedInDevelopment).reduce((n, s) => n + s.distinctWorlds, 0),
    replicationBIndependentOfA: false, replicationNote: 'A and B namespaces differ only in seed; factory worlds do not depend on seed, and all arms are deterministic, so B reproduces A exactly',
    holdoutIsUnseen: false, holdoutNote: "HOLDOUT family 'S3H_ASCII_HOLDOUT' contains neither MIRROR nor OOD/DOGLEG: its three worlds are byte-identical in content to the evaluated DEV_NORMAL worlds",
    oodLabelingDefect: "Sensor strata use family 'S3H_ASCII_OOD_SENSOR', which contains 'OOD' and therefore also switches factory to relay topology: sensor shift and structural shift are confounded, contrary to the protocol text",
    effectiveIndependentWorldsPerReplication: { HOLDOUT: 3, STRUCTURAL_OOD: 12 },
    pseudoReplicationFactor: scheduledPerRep / distinct,
    precision: { nominalProtocolHalfWidth95WorstCase: nominalHalfWidthWorstCase, validHalfWidth: correctHalfWidth,
      consequence: 'Any bootstrap interval over the scheduled pairs would be false precision. Correctly analysed, the campaign is a census of 15 deterministic worlds (3 already evaluated): exact for those worlds, with no basis for generalization to a wider factory distribution because the generator has no seed variation.' },
    canDistinguishNegligibleFromInconclusive: 'NO in the generalizable sense. Within the 15-world census the effect is computed exactly; beyond it, nothing is estimable.',
    nexusIntervention: { perDecision: attr.B_nexusNoObservedIncrementalBenefit.changedDecisions + '/' + inv.decisionsDistinct, perDistinctWorld: attr.B_nexusNoObservedIncrementalBenefit.worldsWithChange + '/' + attr.distinctWorlds, inHoldoutClass: '0 changed decisions in the 3 DEV_NORMAL worlds (Nexus fired once per tier-3 world and chose the same repair as the strongest controller)' },
    ceiling: { strongestSuccess: attr.A_strongNativePerformsWell.success + '/' + attr.A_strongNativePerformsWell.of + ' distinct worlds', implication: 'success-rate superiority is impossible where the comparator already succeeds on every world; only harm or secondary-metric differences can appear' },
    floor: { sentinelV31Success: attr.C_fallbackPlannerFailure.sentinelV31Success + '/' + attr.C_fallbackPlannerFailure.of, implication: 'P3 compares a ceiling arm with a floor arm; its sign is fixed by the fallback planner, not by Nexus' },
    observedActionValueVariation: 'In the 2 distinct worlds where Nexus changed an action, success and ticks were unchanged; only secondary metrics moved slightly, in mixed directions (see attribution.changes and dev-run comparisons)',
    compute: { secondsPerFactoryArmEpisode: secPerArmEpisode, factoryArmEpisodes: armEpisodes, factoryHours, censusAlternative: { distinctWorlds: distinct, armEpisodes: distinct * 4, minutes: distinct * 4 * secPerArmEpisode / 60 },
      hoursPerDistinctInformativeIntervention: 'at most ' + (factoryHours / Math.max(1, attr.B_nexusNoObservedIncrementalBenefit.worldsWithChange)).toFixed(1) + ' h per distinct world with any Nexus change, if every OOD world behaved like development; each such world carries one deterministic data point' },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); if (existsSync(resolve(HERE, 'DECISION.json'))) throw Error('DECISION_ALREADY_WRITTEN');
  const inh = verifyV1(), inv = seedInvariance(), attr = attribution();
  inv.decisionsDistinct = attr.perWorld.reduce((n, r) => n + r.NEXUS_REPAIR_OVER_STRONGEST_V1.ticks, 0);
  const ar = arithmetic(inv, attr);
  const out = { schema: 'STAGE3H_DECISION_VALUE_CLOSURE_V1', inheritance: inh, effectiveWorlds: inv, attribution: attr, campaignArithmetic: ar, newWorldPopulationsCreated: false, prospectiveSeedsTouched: false, authority: 'R0' };
  writeExclusive(resolve(HERE, 'DECISION.json'), out);
  console.log(JSON.stringify({ inheritance: { head: inh.head, v1Commit: inh.v1Commit, protocolOk: inh.protocolHashMatches }, distinctEvaluated: inv.distinctFactoryWorldsEvaluated, traces: attr.tracesMatchRecordedEvidence, A: attr.A_strongNativePerformsWell, B: { ...attr.B_nexusNoObservedIncrementalBenefit, changes: attr.B_nexusNoObservedIncrementalBenefit.changes.length }, C: { ...attr.C_fallbackPlannerFailure, v31DeliveredOfRequired: undefined }, arithmetic: { ...ar, strata: ar.strata.map((s) => s.id + ':' + s.worldClass + ':seen=' + s.alreadyEvaluatedInDevelopment) } }, null, 1));
}
