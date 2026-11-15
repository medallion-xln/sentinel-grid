// Phase 9: prospective qualification protocol for STAGE3H_ASCII_COMPETENCE_BENCHMARK_V1 (PROPOSED, NOT REGISTERED).
// Self-governed by the human project owner; NOT externally independently reviewed (stated in the protocol).
// Sample sizes are fixed here from worst-case variance bounds, not from development outcomes; no post-result resizing.
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { LANE, BENCHMARK_ID, writeExclusive, assertSoleWriter, verifyInheritance, laneClosure } from './guard.mjs';
import { GAMES, ARMS } from './arms.mjs';
import { METRIC_SPEC, NORMALIZED_REGRET, mdePaired, inverseNormal } from './metrics.mjs';
import { PROPOSED, PROPOSED_STATUS, NAMESPACE_SPAN, DEV_SEEDS, PRIOR_DENY, DISCLOSED_PRE_DESIGN_PROBES, namespacesDisjoint } from './population.mjs';

const N_FACTORY_HOLDOUT_PER_TIER = 1500, N_FACTORY_OOD_PER_TIER = 500, N_COMPETENCE_PER_TIER = 100;
const tostPower = (n, margin, sd = 1, alpha = 0.025) => { const z = margin * Math.sqrt(n) / sd - inverseNormal(1 - alpha); const Phi = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2); return 0.5 * (1 + Math.sign(x) * e); }; return Math.max(0, 2 * Phi(z) - 1); };

export function buildProtocol() {
  const nFactory = 3 * N_FACTORY_HOLDOUT_PER_TIER;
  return {
    id: BENCHMARK_ID + '_PROSPECTIVE_PROTOCOL', status: 'PROPOSED_NOT_REGISTERED', authority: 'R0',
    governance: { scientificAuthority: 'Human project owner (sole scientific reviewer)', externalIndependentReview: 'NOT_AVAILABLE', statement: 'This protocol is self-governed and has not been externally independently reviewed. Results under it are reproducible automated evidence, not independent confirmation.', relationToForgeWorldContract: 'Separate. The frozen Forge World sealed-qualification proposal (V3, 320a07da) stays inactive and is not completed, replaced or relabeled by this benchmark.' },
    scientificQuestion: 'Do existing Sentinel experts improve decisions and gameplay outcomes over the strongest native controllers under identical public information and legal actions?',
    splits: {
      DEVELOPMENT: { seeds: DEV_SEEDS, status: 'USED_IN_THIS_TASK_SPENT', disclosedPreDesignProbes: DISCLOSED_PRE_DESIGN_PROBES, use: 'harness validation only' },
      CALIBRATION: { ...PROPOSED.CALIBRATION, perTier: 50, games: ['factory'], use: 'variance description and runtime budgeting only; cannot change any N, margin or hypothesis' },
      HOLDOUT: { ...PROPOSED.HOLDOUT, perTierFactory: N_FACTORY_HOLDOUT_PER_TIER, perTierCompetence: N_COMPETENCE_PER_TIER, games: GAMES },
      STRUCTURAL_OOD: { strata: ['OOD_MIRRORED_GEOMETRY', 'OOD_SENSOR_DELAYED', 'OOD_SENSOR_PARTIAL', 'OOD_SENSOR_MISSING'].map((k) => ({ id: k, ...PROPOSED[k], perTier: N_FACTORY_OOD_PER_TIER, game: 'factory' })),
        limitation: 'Only factory has a native structural generator variation (MIRROR layout). The sensor strata are native observation-channel shifts, not structural composition shifts; they are labeled as such.' },
    },
    seedRule: { derivation: 'seed_i = base + i, 0 <= i < count (consecutive inside a 0x80000-wide namespace)', namespaceSpan: NAMESPACE_SPAN, namespacesDisjointFromPriorAndDev: namespacesDisjoint(), priorDenySets: Object.keys(PRIOR_DENY), materialized: false, status: PROPOSED_STATUS },
    samplingUnit: 'One world = (game, tier, seed, family, sensor). All arms are evaluated on every scheduled world (paired). Worlds are never replaced.',
    levels: 'All 24 ADVANCED_1..3 levels (catalog ASCII_WORLDS_3_2_EXTENSION_V1); equal weight per tier within a game; games are never pooled.',
    controllers: Object.fromEntries(Object.entries(ARMS).map(([k, v]) => [k, { role: v.role, games: v.games, source: v.source, expertsInvoked: v.expertsInvoked }])),
    eligibility: 'Every scheduled world is eligible. Exclusion only for an invalid status (illegal action, null action, policy exception, state mutation, replay failure) of any arm on that world; the world is excluded from that comparison for all arms, counted, never replaced.',
    metricOrientation: Object.fromEntries(GAMES.map((g) => [g, { primary: METRIC_SPEC[g].primary, secondary: METRIC_SPEC[g].secondary }])),
    normalizedRegret: NORMALIZED_REGRET,
    integrityControls: [
      'SHADOW_SENTINEL_READONLY trajectory IDENTICAL to STRONGEST_NATIVE on 100% of worlds',
      'SENTINEL_V31_AS_IS IDENTICAL to V31_FALLBACK_ABLATION on every world where Nexus never fires, and on 100% of rescue/cards/roguelike worlds (no action authority by source)',
      'NEXUS_REPAIR_OVER_STRONGEST_V1 IDENTICAL to STRONGEST_NATIVE on every world where Nexus changes no action',
      'every episode replays byte-identically (per-step native state hashes)', 'zero unoffered actions executed',
    ],
    primaryFamily: {
      game: 'factory', population: 'HOLDOUT, replication A and B separately', alphaOneSidedPerHypothesis: 0.025, multiplicity: 'Holm across P1-P3 within each replication; a claim requires the same conclusion in A and B independently',
      endpoint: 'success (native quota met), paired; exact McNemar for superiority; paired bootstrap (B=20000, percentile, seed 0x5eed5eed) for the difference in success rate',
      hypotheses: {
        P1_EXPERT_MARGINAL_VALUE: 'NEXUS_REPAIR_OVER_STRONGEST_V1 vs STRONGEST_NATIVE',
        P2_ABLATION_VALUE: 'SENTINEL_V31_AS_IS vs V31_FALLBACK_ABLATION',
        P3_SENTINEL_PATH_VS_STRONGEST: 'SENTINEL_V31_AS_IS vs STRONGEST_NATIVE',
      },
      decisionRules: {
        QUALIFIED_POSITIVE: 'Holm-adjusted one-sided superiority in A and in B, point difference >= +0.02, and catastrophe veto not triggered',
        QUALIFIED_NEGATIVE_NO_MATERIAL_VALUE: 'strict TOST equivalence within +/-0.05 (two one-sided 0.025 tests) in A and in B; or exact trajectory identity on every valid world in A and B (the expert was invoked on every decision and changed none)',
        QUALIFIED_NEGATIVE_HARM: 'Holm-adjusted one-sided inferiority in A and in B, or catastrophe veto triggered in both',
        INCONCLUSIVE: 'anything else, including disagreement between A and B; nonsignificance is never equivalence',
      },
      decisionCoverage: 'reported first: fraction of P0 decisions where Nexus changed the action; by observable regime and observable time-remaining band (descriptive)',
      power: { worstCasePairedSd: 1, nPairsPerReplication: nFactory, mdeSuperiority80: mdePaired(1, nFactory, 0.025, 0.8), tostPowerAtZeroEffect: tostPower(nFactory, 0.05), note: 'worst case (SD of a paired binary difference <= 1). If Nexus rarely changes actions the true SD is far smaller; that cannot be used to shrink N.' },
    },
    secondaryFamilies: {
      S1_STRUCTURAL_OOD: 'P1-P3 in each of the 4 factory OOD strata; Holm across 12 tests per replication; descriptive unless both replications agree',
      S2_FACTORY_SECONDARY_METRICS: 'timeToObjective, finalThroughput, resourceWaste, constraintViolations: paired bootstrap, Holm across metrics; descriptive',
      S3_CONTROLLER_COMPETENCE: 'STRONGEST_NATIVE vs RULE_V32, vs UNIFORM_RANDOM, vs FIXED_WAIT per game and tier on HOLDOUT (100 worlds per tier per replication); validates benchmark discrimination; NOT expert evidence',
      S4_COMPUTE: 'per-decision latency p50/p95/max and total, and expert calls per decision, per arm; overhead = adapter minus strongest',
    },
    catastropheVeto: { field: 'metrics().catastrophic (native)', rule: 'any catastrophe introduced by a Sentinel arm on a world where its comparator had none vetoes QUALIFIED_POSITIVE; additionally the one-sided 95% Clopper-Pearson upper bound on the introduction rate must be <= 0.02', zeroEvents: 'zero observed introductions establish only the upper bound' },
    invalidAndTimeout: { perDecisionLatencyFlagMs: 2000, perEpisodeDecisionLimit: 6000, rule: 'INCOMPLETE_DECISION_BUDGET is a valid outcome scored as non-success; invalid statuses exclude the world from that comparison; invalid rate > 1% in any replication makes that replication INCONCLUSIVE' },
    stopRules: 'No interim analysis and no efficacy stopping. Execute the complete A then B schedules once. Abort only on an integrity-control failure (classification CAMPAIGN_INVALID, all results reported). No rerun, retry or seed substitution after any outcome is seen.',
    independentReplay: 'Every episode replayed during the run; after both replications lock, replay a fixed deterministic 5% subset (worlds with seed index % 20 == 7) in a fresh process and compare actionHash/finalStateHash.',
    stage3hMapping: 'See evidence/exit-matrix.json. A positive ASCII result qualifies only the bounded claim named in its hypothesis; it does not complete Forge World qualification, establish canonical MoE gain, or certify Stage 3H.',
    prohibited: ['changing game rules or controllers', 'tuning arms after any holdout outcome', 'resizing samples', 'reusing development or prior seeds', 'pooling games', 'Oracle reopening', 'Router 2.0', 'training', 'tenth expert'],
  };
}
export const protocolHash = (p) => createHash('sha256').update(JSON.stringify(p)).digest('hex');

if (process.argv[1] === new URL(import.meta.url).pathname) {
  assertSoleWriter(); verifyInheritance();
  const p = buildProtocol(), h = protocolHash(p);
  writeExclusive(resolve(LANE, 'evidence/protocol.json'), { protocol: p, protocolSha256: h, laneClosure: laneClosure().hash });
  console.log(JSON.stringify({ protocolSha256: h, power: p.primaryFamily.power }));
}
