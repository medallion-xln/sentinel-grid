// Phases 4-5 aggregation. Usage: node analyse.mjs -> evidence/WIDER_ACTION_FEASIBILITY.json (once).
// Verdict rule, fixed before the merged numbers were read:
//   any analysed class with an EMPTY introduction-free intersection     -> B. WIDER_ACTION_SAFETY_CONFLICT_FOUND
//   else, if the in-class offline minimax choice retains material value  -> A. WIDER_ACTION_PUBLIC_ONLY_RESEARCH_FEASIBLE
//        (mean nreg below both frozen arms by >= 0.02 over the classes where an arm introduces a catastrophe)
//   else                                                                  -> D. INCONCLUSIVE
// C (observability limit) is not decidable without learning a policy; it is reported as an open question.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { candidates } from '../stage3h-safety-feasibility-v1/search.mjs';
import { DEFINITIONS, QUESTION } from './contract.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), dir = resolve(LANE, 'work/intersect');
const rows = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().flatMap((f) => readFileSync(resolve(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null), count = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
const q = (xs, p) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
if (rows.length !== candidates().length) throw Error('INCOMPLETE_SHARDS');
const armFail = rows.filter((r) => !r.s0IntroFreeAll || !r.nexusIntroFreeAll), conflict = rows.filter((r) => r.twoArmConflict), withOracle = rows.filter((r) => r.oracle);
const summarise = (rs) => ({ classes: rs.length, emptyIntroFree: rs.filter((r) => r.introFreeAllEmpty).length, emptySafeAll: rs.filter((r) => r.safeAllEmpty).length,
  oracleInArms: rs.filter((r) => r.oracle?.inArms).length, oracleOutsideArms: rs.filter((r) => r.oracle && !r.oracle.inArms).length,
  meanOracleNreg: mean(rs.filter((r) => r.oracle).map((r) => r.oracle.meanNreg)), meanS0Nreg: mean(rs.map((r) => r.arms.meanNregB)), meanNexusNreg: mean(rs.map((r) => r.arms.meanNregN)),
  meanDeltaVsS0: mean(rs.filter((r) => r.oracle).map((r) => r.oracle.meanDeltaVsB)), meanDeltaVsNexus: mean(rs.filter((r) => r.oracle).map((r) => r.oracle.meanDeltaVsN)),
  meanBestOfGap: mean(rs.filter((r) => r.oracle).map((r) => r.oracle.meanBestOfGap)), oracleMaxNregQuantiles: { p50: q(rs.filter((r) => r.oracle).map((r) => r.oracle.maxNreg), 0.5), p90: q(rs.filter((r) => r.oracle).map((r) => r.oracle.maxNreg), 0.9), max: q(rs.filter((r) => r.oracle).map((r) => r.oracle.maxNreg), 1) },
  safetyCostClasses: rs.filter((r) => !r.unconstrained.introFreeAll).length, meanSafetyCostMaxNreg: mean(rs.filter((r) => r.oracle && !r.unconstrained.introFreeAll).map((r) => r.oracle.maxNreg - r.unconstrained.maxNreg)) });
const features = (rs, key) => count(rs.map((r) => String(r.publicFeatures[key])));
const purity = (key) => { const vals = [...new Set(rows.map((r) => String(r.publicFeatures[key])))]; return Object.fromEntries(vals.map((v) => { const g = rows.filter((r) => String(r.publicFeatures[key]) === v); return [v, { classes: g.length, armFailing: g.filter((r) => !r.s0IntroFreeAll || !r.nexusIntroFreeAll).length }]; })); };
const all = summarise(rows), failing = summarise(armFail);
const verdict = all.emptyIntroFree > 0 ? 'B. WIDER_ACTION_SAFETY_CONFLICT_FOUND'
  : failing.meanDeltaVsS0 <= -0.02 && failing.meanDeltaVsNexus <= -0.02 ? 'A. WIDER_ACTION_PUBLIC_ONLY_RESEARCH_FEASIBLE' : 'D. INCONCLUSIVE';
const out = { schema: 'STAGE3H_WIDER_ACTION_FEASIBILITY_V1', authority: 'R0', question: QUESTION, definitions: DEFINITIONS,
  population: { classes: rows.length, source: 'the 341 admissible-state equivalence classes of the safety-feasibility search (H2, Nexus applicable, N != B, S0 introducing vs N or both regrets in [40,160]); twin families rebuilt identically; spent DEV seeds only', worldsLabelled: rows.reduce((a, r) => a + r.worlds, 0),
    bias: 'near-threshold and introduction classes only, i.e. where the two frozen arms are most likely to fail; classes far from the threshold were not analysed' },
  all, armFailingClasses: failing, twoArmConflictClasses: summarise(conflict),
  identity: { semanticKeysUniqueAllClasses: rows.every((r) => r.identity.semanticKeysUnique), relabelStableAllClasses: rows.every((r) => r.identity.relabelStable) },
  hiddenRisk: { classesWithAnyVaryingCatastropheStatus: rows.filter((r) => r.hiddenRisk.actionsWithVaryingCatastropheStatus > 0).length, meanActionsWithVaryingCatastropheStatus: mean(rows.map((r) => r.hiddenRisk.actionsWithVaryingCatastropheStatus)),
    classesWithMoreThanOneOptimalSet: rows.filter((r) => r.hiddenRisk.distinctOptimalSets > 1).length, classesWhereIntroFreeStatusVaries: rows.filter((r) => r.hiddenRisk.actionsWithVaryingIntroFreeStatus > 0).length },
  oracleActionTypes: count(withOracle.map((r) => r.oracle.type)), oracleTypeEqualsS0Type: withOracle.filter((r) => r.publicFeatures.s0Types.includes(r.oracle.type) && !r.oracle.inArms).length,
  publicFeatures: { armFailingByRegime: purity('regime'), armFailingByNexusType: purity('nexusType'), armFailingByS0Type: purity('s0Types'), regimeAll: features(rows, 'regime') },
  emptyIntersectionClasses: rows.filter((r) => r.introFreeAllEmpty).map((r) => ({ set: r.set, idx: r.idx, cell: r.cell, worlds: r.worlds })),
  verdict, verdictRule: 'B if any empty introduction-free intersection; else A if, over arm-failing classes, the offline minimax choice is >= 0.02 nreg below both frozen arms; else D',
  caveats: ['finite twin families sample the admissible hidden-state support; a non-empty intersection on tested worlds is not universal safety', 'the minimax choice is an offline, privileged in-class oracle; it is not a policy and not deployable', 'the analysed classes are a biased sample of hard cases', 'C (observability limit) remains open: whether lawful public features predict the introduction-free set can only be tested prospectively'] };
writeExclusive(resolve(LANE, 'evidence/WIDER_ACTION_FEASIBILITY.json'), out);
console.log(JSON.stringify({ verdict, all, armFailing: failing, conflict: out.twoArmConflictClasses, identity: out.identity, hiddenRisk: out.hiddenRisk, oracleTypes: out.oracleActionTypes, oracleTypeEqualsS0Type: out.oracleTypeEqualsS0Type, empty: out.emptyIntersectionClasses, regime: out.publicFeatures.armFailingByRegime, nexusType: out.publicFeatures.armFailingByNexusType }, null, 1));
