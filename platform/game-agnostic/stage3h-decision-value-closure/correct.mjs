// CORRECTION_V1 to DECISION.json (which is preserved unchanged). The closure's seed-invariance analysis compared only
// initial states with the seed field stripped. The v32 factory transition reads w.seed: at tiers 2-3 the failed
// production node at each fixed failure tick is production[(seed + tick) % production.length]. World identity therefore
// depends on the seed through seed mod L (L = production nodes). This file derives the exact distinct-world structure
// from that source rule and checks it against the recorded development trajectories. Seed arithmetic only: no world
// is created, no episode is run, no prospective seed is materialized as a world. Writes CORRECTION_V1.json exclusively.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { V1, verifyV1 } from './inherit.mjs';
import { writeExclusive, assertSoleWriter, rawHash } from '../stage3h-ascii-competence-v1/guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GA = resolve(HERE, '..');
const SRC = 'ascii-suite/v32/strategic-extension.mjs', src = readFileSync(resolve(GA, SRC), 'utf8').split('\n');
const lineOf = (needle) => src.findIndex((l) => l.includes(needle)) + 1;
// Source facts (each asserted against the file text).
const FAIL_RULE = 'production[(w.seed+w.tick)%production.length]', FAIL_TICKS = "e.tier>=2&&[15,45,...(e.tier===3?[90,145,210,290]:[])].includes(w.tick)";
for (const n of [FAIL_RULE, FAIL_TICKS, 'function configureFactory(w,tier,family)']) if (!lineOf(n)) throw Error('SOURCE_FACT_NOT_FOUND:' + n);
const L = { 1: null, 2: 4, 3: 9 }; // production nodes (FURNACE/ASSEMBLER[/CUTTER]) per line x lines: t1 2 (no failures), t2 2x2, t3 3x3
const dynamicKey = (seed, tier) => (L[tier] ? (seed >>> 0) % L[tier] : 0);
const distinctPerClass = 1 + L[2] + L[3];

const dev = JSON.parse(readFileSync(resolve(V1, 'evidence/dev-run.json'), 'utf8'));
const protocol = JSON.parse(readFileSync(resolve(V1, 'evidence/protocol.json'), 'utf8')).protocol;

function checkAgainstRecorded() {
  const rows = dev.rows.filter((r) => r.spec.game === 'factory'), byCell = {};
  for (const r of rows) { const k = r.stratum + ':t' + r.spec.tier; (byCell[k] ??= []).push(r); }
  const out = {};
  for (const [k, rs] of Object.entries(byCell)) {
    const tier = rs[0].spec.tier, keys = new Set(rs.map((r) => dynamicKey(r.spec.seed, tier)));
    const traj = new Set(rs.map((r) => r.results.STRONGEST_NATIVE.actionHash));
    out[k] = { predictedDistinct: keys.size, recordedDistinctStrongestTrajectories: traj.size, consistent: keys.size === traj.size };
  }
  return out;
}
function distinctDevWorlds() {
  const seen = new Map();
  for (const r of dev.rows.filter((r) => r.spec.game === 'factory')) { const k = r.stratum + ':t' + r.spec.tier + ':k' + dynamicKey(r.spec.seed, r.spec.tier); if (!seen.has(k)) seen.set(k, r); }
  const ws = [...seen.values()], g = (r, a) => r.results[a];
  return { distinctWorlds: ws.length, strongestSuccess: ws.filter((r) => g(r, 'STRONGEST_NATIVE').outcome === 'SUCCESS').length, v31Success: ws.filter((r) => g(r, 'SENTINEL_V31_AS_IS').outcome === 'SUCCESS').length,
    v31EqualsAblation: ws.filter((r) => g(r, 'SENTINEL_V31_AS_IS').actionHash === g(r, 'V31_FALLBACK_ABLATION').actionHash).length,
    nexusChangedDecisions: ws.reduce((n, r) => n + g(r, 'NEXUS_REPAIR_OVER_STRONGEST_V1').nexusChanged, 0), nexusDecisions: ws.reduce((n, r) => n + g(r, 'NEXUS_REPAIR_OVER_STRONGEST_V1').p0Decisions, 0),
    worldsWithNexusChange: ws.filter((r) => g(r, 'NEXUS_REPAIR_OVER_STRONGEST_V1').nexusChanged > 0).length,
    successChangedByNexus: ws.filter((r) => g(r, 'NEXUS_REPAIR_OVER_STRONGEST_V1').outcome !== g(r, 'STRONGEST_NATIVE').outcome).length,
    devNormalDistinct: ws.filter((r) => r.stratum === 'DEV_NORMAL').length };
}
function campaign() {
  const strata = [{ id: 'HOLDOUT', ...protocol.splits.HOLDOUT, perTier: protocol.splits.HOLDOUT.perTierFactory }, ...protocol.splits.STRUCTURAL_OOD.strata];
  const cover = (base, n) => Object.fromEntries([1, 2, 3].map((t) => [t, new Set(Array.from({ length: n }, (_, i) => dynamicKey(base + i, t))).size]));
  const devKeys = Object.fromEntries([1, 2, 3].map((t) => [t, new Set(dev.seeds.map((s) => dynamicKey(s, t)))]));
  const per = strata.map((s) => { const a = cover(s.A, s.perTier), b = cover(s.B, s.perTier); return { id: s.id, family: s.family, sensor: s.sensor ?? 'NORMAL', perTier: s.perTier, distinctWorldsA: a[1] + a[2] + a[3], distinctWorldsB: b[1] + b[2] + b[3], aAndBCoverIdenticalWorldSet: a[1] + a[2] + a[3] === distinctPerClass && b[1] + b[2] + b[3] === distinctPerClass }; });
  const holdoutOverlap = [1, 2, 3].reduce((n, t) => n + devKeys[t].size, 0);
  const scheduled = per.reduce((n, s) => n + 3 * s.perTier, 0), distinct = per.length * distinctPerClass;
  return { strata: per, distinctWorldsPerClass: distinctPerClass, distinctFactoryWorldsInCampaign: distinct, scheduledPairsPerReplication: scheduled, pseudoReplicationFactorPerReplication: scheduled / distinct,
    replicationBDuplicatesA: per.every((s) => s.aAndBCoverIdenticalWorldSet), holdoutWorldsAlreadyEvaluatedInDevelopment: holdoutOverlap + ' of ' + distinctPerClass,
    oodSensorConfoundStands: protocol.splits.STRUCTURAL_OOD.strata.filter((s) => /OOD/.test(s.family) && s.sensor).length + ' sensor strata also switch on relay topology' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); if (existsSync(resolve(HERE, 'CORRECTION_V1.json'))) throw Error('CORRECTION_ALREADY_WRITTEN');
  const inh = verifyV1();
  const out = { schema: 'STAGE3H_DECISION_VALUE_CLOSURE_CORRECTION_V1', corrects: { file: 'DECISION.json', sha256: rawHash(resolve(HERE, 'DECISION.json')), preservedUnchanged: true },
    error: 'DECISION.json and RESULT.txt claimed factory worlds are seed-invariant (15 distinct, HOLDOUT = 3 development worlds, B reproduces A exactly). The analysis stripped w.seed and compared initial states only; the transition reads w.seed at failure ticks.',
    source: { file: SRC, sha256: rawHash(resolve(GA, SRC)).slice(0, 16), failureRuleLine: lineOf(FAIL_RULE), failureTicksLine: lineOf(FAIL_TICKS), rule: 'tier>=2 failures at ticks {15,45} (+{90,145,210,290} at tier 3); failed node = production[(seed + tick) % L]', L },
    recordedConsistency: checkAgainstRecorded(), corrected: { development: distinctDevWorlds(), campaign: campaign() },
    decisionStillHolds: 'ASCII_CAMPAIGN_LOW_INFORMATION_VALUE', authority: 'R0', newWorldsCreated: false };
  if (!Object.values(out.recordedConsistency).every((c) => c.consistent)) throw Error('SOURCE_RULE_INCONSISTENT_WITH_RECORDED_TRAJECTORIES');
  out.inheritance = inh;
  writeExclusive(resolve(HERE, 'CORRECTION_V1.json'), out);
  console.log(JSON.stringify({ consistency: out.recordedConsistency, corrected: out.corrected }, null, 1));
}
