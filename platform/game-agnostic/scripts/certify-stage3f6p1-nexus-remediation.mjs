#!/usr/bin/env node
/* STAGE_3F_6_P_1 — NEXUS risk-response remediation (narrow substage of Stage 3F.6-P).
 *
 * Question: can a minimal, deployable change to NEXUS's action-type mapping materially improve its
 * absolute quality while preserving its relational role?
 *
 * Two phases, strictly ordered:
 *   --freeze   DEV only. Audits the historical V1 logic (decision table, action-type confusion, target
 *              mapping, threat regimes, representation audit), measures the candidate on DEV, and writes
 *              the candidate freeze: candidate source + hash, and every CAL materiality, distinctiveness,
 *              policy-set and classification rule. Refused if CAL evidence already exists.
 *   (default)  Requires the freeze and CAL evidence generated AFTER it (the CAL manifest binds the freeze
 *              hash). Re-derives the freeze from DEV byte-for-byte, evaluates CAL exactly once, classifies.
 *   --check    Recomputes everything and requires byte-identical reproduction.
 *
 * Diagnostic DEV/CAL substage. Prior HOLDOUT/OOD are exposed and never read. No router, threshold,
 * decision rule, feature or other policy is touched. The candidate is never promoted.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deepFreeze, sha256 } from '../src/core/determinism.js';
import { POLICY_SET_HASH, bestPolicySet, pairedBootstrap, quantile } from '../src/stage3f/policy-router-v1.js';
import { observedThreatStructure } from '../src/stage3f/deployable-action-proposal-v1.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import {
  NEXUS_SELECTOR_V2_CANDIDATE_ID, NEXUS_V1_DECISION_TABLE, NEXUS_V2_CANDIDATE_HASH, NEXUS_V2_REMEDIATION,
  nexusSelectorV2Candidate, nexusV1RankingEquivalent,
} from '../src/stage3f/nexus-selector-v2-candidate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const OUT = 'artifacts/stage3f6p1-nexus-remediation';
const FREEZE = `${OUT}/stage3f6p1-candidate-freeze.json`;
const RESULT = `${OUT}/stage3f6p1-certification-result.json`;
const CANDIDATE_SOURCE = 'src/stage3f/nexus-selector-v2-candidate.js';
const V1_SOURCE = 'src/lab/stage3c-learned-nexus.js';
const PROPOSAL_SOURCE = 'src/stage3f/deployable-action-proposal-v1.js';
const mode = process.argv.includes('--freeze') ? 'FREEZE' : process.argv.includes('--check') ? 'CHECK' : 'CERTIFY';
const skipTests = process.argv.includes('--skip-tests');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const at = (r) => path.join(root, r);
const readText = (r) => readFileSync(at(r), 'utf8');
const readJson = (r) => JSON.parse(readText(r));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const sorted = (v) => [...v].sort((a, b) => a - b);
const K = (id) => id.slice(0, 16);
const RES = 'RESOURCE_PRESERVING_V1'; const OBJ = 'OBJECTIVE_TARGETING_V1'; const THR = 'THREAT_COVERING_V1';
const REPORT_TYPES = ['MOVE', 'PROTECT', 'TRANSFER', 'BUILD', 'COLLECT', 'RETREAT', 'REINFORCE', 'REPAIR', 'RESTORE', 'BYPASS', 'ATTACK', 'WAIT', 'OTHER'];
const NONCOMMITTAL = new Set(['MOVE', 'RETREAT', 'WAIT']);

/* ------------------------------------------------------------------ plan */
const EVALUATION_PLAN = deepFreeze({
  data: { design: 'DEV only', evaluation: 'CAL exactly once, after this freeze', exposedAndUnused: ['prior HOLDOUT', 'prior OOD'] },
  comparisonBasis: 'paired over episodes where NEXUS V1 proposes; V2 keeps V1 abstention so coverage is identical',
  bestAvailable: 'minimum-regret set among RESOURCE, NEXUS, OBJECTIVE, THREAT (ties kept); V1-best uses V1 in the set, V2-best uses V2',
  oracle: 'minimum regret among proposing members of the policy set; RANDOM_LEGAL control action when none proposes',
  bootstrap: { resamples: 1000, seed: '3647', method: 'paired, policy-router-v1#pairedBootstrap' },
  materiality: { meanRegretDeltaAtMost: -5.0, accuracyDeltaAtLeast: 0.05, regretCiUpperBelow: 0, accuracyCiLowerAbove: 0,
    p95NotWorse: true, pRegretAbove100NotWorse: true },
  distinctiveness: { highResourceCollinearityAtLeast: 0.5, policyCollapseAtLeast: 0.8,
    rolePreserved: 'V2-RESOURCE agreement < 0.5 (V2 must not make the same decision as RESOURCE on most of its decisions)' },
  policySetValue: { preserved: 'ORACLE_WITH_V2 mean regret <= ORACLE_WITH_V1 mean regret' },
  absoluteQuality: { keepGradeWhenBestMeanRegretAtMost: 15, source: 'Stage 3F.6-P KEEP bar' },
  representationAudit: { relationalCeilingImprovementBelow: 5.0, moveOptimalShareAtLeast: 0.5, moveDirectionSpreadAtLeast: 25,
    meaning: 'even perfect choice among entity-targeted actions is not material, and the available gain lies in MOVE, whose value depends on a direction NEXUS inputs cannot observe' },
  classificationPrecedence: [
    'F_INSUFFICIENT_EVIDENCE if CAL NEXUS-proposing n < 200',
    'C_PROTECT_BIAS_NOT_PRIMARY_CAUSE if PROTECT carries < 0.5 of V1 DEV regret',
    'A_NEXUS_ACTION_MAPPING_MATERIALLY_IMPROVED if CAL material AND role preserved AND policy-set value preserved AND V2-best mean regret <= 15',
    'B_NEXUS_IMPROVED_BUT_STILL_ABSOLUTELY_WEAK if CAL material AND role preserved AND policy-set value preserved',
    'D_REMEDIATION_REQUIRES_MISSING_REPRESENTATION if the DEV representation audit holds',
    'E_NO_SAFE_MINIMAL_REMEDIATION_FOUND otherwise',
  ],
  readiness: { READY_FOR_FRESH_NEXUS_CONFIRMATION: 'primary result A or B', NEXUS_REMEDIATION_BLOCKED_BY_REPRESENTATION: 'primary result D',
    READY_FOR_ROUTER_RETRAIN: false, READY_FOR_STAGE3G: false },
});

const EXPLORATION_DISCLOSURE = deepFreeze([
  'Before this freeze, DEV-only exploratory scripts (not certification inputs) screened six gate/fallback variants: PROTECT/REINFORCE/REPAIR gated on threatened targets with MOVE fallback; the same gated on threatened-or-critical-or-dependency targets; RETREAT-first fallback under hostiles; WAIT fallback; and PROTECT-only gating.',
  'Every variant that cut PROTECT improved standalone DEV accuracy and regret, and every one raised RESOURCE agreement (0.60-0.80) and worsened the DEV policy-set oracle. WAIT and RETREAT fallbacks were worse standalone.',
  'The frozen candidate is the most literal minimal change: V1 ranking unchanged, PROTECT admissible only on an observed-threatened target.',
  'The distinctiveness and policy-set-value rules below were written after these DEV values were seen; CAL is the first evaluation of them.',
]);

/* ------------------------------------------------------------ evidence */
async function loadPartition(partition) {
  const file = `${OUT}/nexus-evidence-${partition.toLowerCase()}.jsonl.gz`;
  const manifest = readJson(`${OUT}/nexus-evidence-${partition.toLowerCase()}-manifest.json`);
  const text = gunzipSync(await readFile(at(file))).toString('utf8');
  return { manifest, contentOk: hex(text) === manifest.contentHash, rows: text.split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
}

function v1Choice(decisionInput) {
  const { canonicalState, legalActions } = decisionInput;
  const nexus = evaluateNexus({ canonicalState, legalActions: legalActions.map((e) => ({ actionId: e.actionId, targetEntityId: e.targetEntityId })) });
  const sel = nexusRelationalSelector({ branches: legalActions.map((e) => ({ actionKey: e.actionId, actionType: e.actionType })) }, nexus);
  return { reason: sel.reason ?? null, action: sel.abstain ? null : legalActions.find((a) => a.actionId === sel.actionId) };
}

function evaluate(rows) {
  return rows.map((row) => {
    const { decisionInput, labels } = row;
    const v1 = v1Choice(decisionInput);
    const v2 = nexusSelectorV2Candidate(decisionInput);
    const lab = labels.actions;
    const pick = (key) => (key === null ? { r: null, o: null } : { r: lab[key].r, o: lab[key].o });
    const v1Key = v1.action ? K(v1.action.actionId) : null; const v2Key = v2.action ? K(v2.action.actionId) : null;
    const others = labels.others;
    const setRow = (nexusKey) => {
      const chosen = { [RES]: others[RES], NEXUS_SELECTOR: nexusKey, [OBJ]: others[OBJ], [THR]: others[THR] };
      const regret = {}; const correct = {};
      for (const [p, k] of Object.entries(chosen)) { regret[p] = k === null ? null : lab[k].r; correct[p] = k === null ? null : lab[k].o; }
      return { chosen, regret, correct };
    };
    return { row, v1, v2, v1Key, v2Key, V1: pick(v1Key), V2: pick(v2Key), control: lab[others.RANDOM_LEGAL_V1].r,
      setV1: setRow(v1Key), setV2: setRow(v2Key) };
  });
}

function quality(entries) {
  const r = sorted(entries.map((e) => e.r)); const n = r.length;
  return { n, accuracy: mean(entries.map((e) => e.o)), meanRegret: mean(r), medianRegret: quantile(r, 0.5), p95Regret: quantile(r, 0.95),
    p99Regret: quantile(r, 0.99), worstRegret: n ? r[n - 1] : null, pRegretAbove100: n ? r.filter((x) => x > 100).length / n : null };
}
function absolute(entries) {
  const r = entries.map((e) => e.r); const n = r.length; const p = (fn) => (n ? r.filter(fn).length / n : null);
  return { n, P_LE_5: p((x) => x <= 5), P_LE_10: p((x) => x <= 10), P_LE_25: p((x) => x <= 25), P_GT_50: p((x) => x > 50), P_GT_100: p((x) => x > 100) };
}
function oracle(ev, setKey) {
  const out = ev.map((e) => {
    const s = e[setKey]; const pool = Object.keys(s.chosen).filter((p) => s.chosen[p] !== null).map((p) => s.regret[p]);
    return pool.length ? Math.min(...pool) : e.control;
  });
  return { accuracy: mean(out.map((x) => (x === 0 ? 1 : 0))), meanRegret: mean(out) };
}

function compare(ev) {
  const acting = ev.filter((e) => e.v1.action !== null);
  const coverageMismatch = ev.filter((e) => (e.v1.action === null) !== (e.v2.action === null)).length;
  const typeRate = (which, type) => mean(acting.map((e) => (e[which].action.actionType === type ? 1 : 0)));
  const V1 = { ...quality(acting.map((e) => e.V1)), coverage: acting.length / ev.length, PROTECT_RATE: typeRate('v1', 'PROTECT'), MOVE_RATE: typeRate('v1', 'MOVE') };
  const V2 = { ...quality(acting.map((e) => e.V2)), coverage: acting.length / ev.length, PROTECT_RATE: typeRate('v2', 'PROTECT'), MOVE_RATE: typeRate('v2', 'MOVE') };
  const boot = pairedBootstrap(acting.map((e) => ({ regret: { V1: e.V1.r, V2: e.V2.r }, correct: { V1: e.V1.o, V2: e.V2.o } })),
    () => 'V2', () => 'V1', { resamples: EVALUATION_PLAN.bootstrap.resamples, seed: EVALUATION_PLAN.bootstrap.seed });
  const v1Best = acting.filter((e) => bestPolicySet(e.setV1).best.includes('NEXUS_SELECTOR'));
  const v2Best = acting.filter((e) => bestPolicySet(e.setV2).best.includes('NEXUS_SELECTOR'));
  const agree = (which, other) => mean(acting.map((e) => (e[which] === e.row.labels.others[other] ? 1 : 0)));
  const distinct = { V2_RESOURCE_AGREEMENT: agree('v2Key', RES), V2_GREEDY_AGREEMENT: agree('v2Key', 'GREEDY'),
    V1_RESOURCE_AGREEMENT: agree('v1Key', RES), V1_GREEDY_AGREEMENT: agree('v1Key', 'GREEDY'), V1_V2_AGREEMENT: mean(acting.map((e) => (e.v1Key === e.v2Key ? 1 : 0))) };
  distinct.HIGH_RESOURCE_COLLINEARITY = distinct.V2_RESOURCE_AGREEMENT >= EVALUATION_PLAN.distinctiveness.highResourceCollinearityAtLeast;
  distinct.POLICY_COLLAPSE = distinct.V2_RESOURCE_AGREEMENT >= EVALUATION_PLAN.distinctiveness.policyCollapseAtLeast;
  const withV1 = oracle(ev, 'setV1'); const withV2 = oracle(ev, 'setV2');
  const withoutNexus = oracle(ev.map((e) => ({ ...e, setV1: { ...e.setV1, chosen: { ...e.setV1.chosen, NEXUS_SELECTOR: null } } })), 'setV1');
  const m = EVALUATION_PLAN.materiality;
  const material = {
    regretDelta: V2.meanRegret - V1.meanRegret, accuracyDelta: V2.accuracy - V1.accuracy, regretCi95: boot.regretCi95, accuracyCi95: boot.accuracyCi95,
    regretOk: V2.meanRegret - V1.meanRegret <= m.meanRegretDeltaAtMost, accuracyOk: V2.accuracy - V1.accuracy >= m.accuracyDeltaAtLeast,
    ciOk: boot.regretCi95[1] < m.regretCiUpperBelow && boot.accuracyCi95[0] > m.accuracyCiLowerAbove,
    p95Ok: V2.p95Regret <= V1.p95Regret, tailOk: V2.pRegretAbove100 <= V1.pRegretAbove100,
  };
  material.MATERIAL = material.regretOk && material.accuracyOk && material.ciOk && material.p95Ok && material.tailOk;
  return {
    n: ev.length, nexusProposingN: acting.length, coverageMismatch, V1, V2, bootstrap: boot, materiality: material,
    whenV1Best: { n: v1Best.length, V1: quality(v1Best.map((e) => e.V1)), V2: quality(v1Best.map((e) => e.V2)) },
    whenV2Best: { n: v2Best.length, V2: quality(v2Best.map((e) => e.V2)), absolute: absolute(v2Best.map((e) => e.V2)) },
    distinctiveness: distinct,
    policySet: { ORACLE_WITH_V1: withV1, ORACLE_WITH_V2: withV2, ORACLE_WITHOUT_NEXUS: withoutNexus,
      ORACLE_REGRET_DELTA: withV2.meanRegret - withV1.meanRegret, ORACLE_ACCURACY_DELTA: withV2.accuracy - withV1.accuracy,
      VALUE_PRESERVED: withV2.meanRegret <= withV1.meanRegret },
  };
}

/* --------------------------------------------------------- DEV V1 audit */
const bucket = (t) => (REPORT_TYPES.includes(t) ? t : 'OTHER');
function devAudit(ev) {
  const acting = ev.filter((e) => e.v1.action !== null);
  const paths = {}; for (const e of ev) paths[e.v1.reason ?? 'ACTED'] = (paths[e.v1.reason ?? 'ACTED'] ?? 0) + 1;
  const availability = {};
  for (const e of ev) for (const t of new Set(e.row.decisionInput.legalActions.map((a) => a.actionType))) availability[t] = (availability[t] ?? 0) + 1;
  for (const t of Object.keys(availability)) availability[t] /= ev.length;

  const optTypes = (e) => new Set(e.row.decisionInput.legalActions.filter((a) => e.row.labels.actions[K(a.actionId)].o === 1).map((a) => a.actionType));
  const primaryOptimal = (e) => {
    const c = {}; for (const a of e.row.decisionInput.legalActions) if (e.row.labels.actions[K(a.actionId)].o === 1) c[a.actionType] = (c[a.actionType] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  };
  const confusion = {}; const perType = Object.fromEntries(REPORT_TYPES.map((t) => [t, { selected: 0, selectedInOptimal: 0, optimalPresent: 0, optimalAndSelected: 0, regret: [] }]));
  let typeOk = 0; let typeOkExact = 0;
  for (const e of acting) {
    const sel = e.v1.action.actionType; const ot = optTypes(e); const b = bucket(sel); const p = bucket(primaryOptimal(e));
    confusion[b] = confusion[b] ?? Object.fromEntries(REPORT_TYPES.map((t) => [t, 0])); confusion[b][p] += 1;
    perType[b].selected += 1; perType[b].regret.push(e.V1.r);
    const otb = new Set([...ot].map(bucket));
    if (otb.has(b)) perType[b].selectedInOptimal += 1;
    for (const t of otb) { perType[t].optimalPresent += 1; if (t === b) perType[t].optimalAndSelected += 1; }
    if (ot.has(sel)) { typeOk += 1; if (e.V1.o === 1) typeOkExact += 1; }
  }
  const actionTypeTable = Object.fromEntries(REPORT_TYPES.map((t) => { const x = perType[t]; return [t, { count: x.selected,
    precision: x.selected ? x.selectedInOptimal / x.selected : null, recall: x.optimalPresent ? x.optimalAndSelected / x.optimalPresent : null,
    meanRegret: mean(x.regret), optimalPresentShare: x.optimalPresent / acting.length }]; }));

  const regimeDefs = {
    NO_HOSTILE: (s, e) => !e.row.decisionInput.canonicalState.entities.some((x) => x.hostile),
    HOSTILE_PRESENT: (s, e) => e.row.decisionInput.canonicalState.entities.some((x) => x.hostile),
    UNSUPPORTED_THREATENED_ENTITY: (s) => s.unsupportedThreatened.size > 0,
    SUPPORTED_THREATENED_ENTITY: (s) => [...s.threatenedBy].some(([id, n]) => n > 0 && (s.supportedBy.get(id) ?? 0) > 0),
    DEPENDENCY_BOTTLENECK: (s, e) => e.codes.has('NEXUS_BOTTLENECK'),
    CRITICAL_ENTITY_THREATENED: (s) => [...s.criticalIds].some((id) => (s.threatenedBy.get(id) ?? 0) > 0),
    ACTOR_DIRECTLY_THREATENED: (s, e) => e.row.decisionInput.canonicalState.entities.some((x) => x.kind === 'ACTOR' && (s.threatenedBy.get(x.id) ?? 0) > 0),
    PROTECT_ON_THREATENED_TARGET_LEGAL: (s, e) => e.row.decisionInput.legalActions.some((a) => a.actionType === 'PROTECT' && (s.threatenedBy.get(a.targetEntityId) ?? 0) > 0),
  };
  const enriched = acting.map((e) => ({ e, s: observedThreatStructure(e.row.decisionInput.canonicalState),
    codes: new Set(evaluateNexus({ canonicalState: e.row.decisionInput.canonicalState, legalActions: e.row.decisionInput.legalActions.map((a) => ({ actionId: a.actionId, targetEntityId: a.targetEntityId })) }).rationaleCodes) }));
  const regimes = Object.entries(regimeDefs).map(([name, fn]) => {
    const sub = enriched.filter(({ e, s, codes }) => fn(s, { ...e, codes }));
    const share = (t) => mean(sub.map(({ e }) => (optTypes(e).has(t) ? 1 : 0)));
    return { regime: name, n: sub.length, optimalTypeShare: { MOVE: share('MOVE'), PROTECT: share('PROTECT'), RETREAT: share('RETREAT'), REPAIR: share('REPAIR'), REINFORCE: share('REINFORCE') },
      v1: { accuracy: mean(sub.map(({ e }) => e.V1.o)), meanRegret: mean(sub.map(({ e }) => e.V1.r)), protectRate: mean(sub.map(({ e }) => (e.v1.action.actionType === 'PROTECT' ? 1 : 0))) },
      v2: { accuracy: mean(sub.map(({ e }) => e.V2.o)), meanRegret: mean(sub.map(({ e }) => e.V2.r)) } };
  });
  const regimeEffect = (a, b) => { const x = regimes.find((r) => r.regime === a); const y = regimes.find((r) => r.regime === b); return { [a]: x.v1.meanRegret, [b]: y.v1.meanRegret, delta: x.v1.meanRegret - y.v1.meanRegret }; };

  const protectTargets = { threatened: [], unthreatened: [] };
  for (const { e, s } of enriched) for (const a of e.row.decisionInput.legalActions.filter((x) => x.actionType === 'PROTECT')) {
    protectTargets[(s.threatenedBy.get(a.targetEntityId) ?? 0) > 0 ? 'threatened' : 'unthreatened'].push(e.row.labels.actions[K(a.actionId)]);
  }
  const summarizeTargets = (list) => ({ n: list.length, pOptimal: mean(list.map((l) => l.o)), meanRegret: mean(list.map((l) => l.r)) });

  const totalRegret = acting.reduce((s, e) => s + e.V1.r, 0);
  const protectRegret = acting.filter((e) => e.v1.action.actionType === 'PROTECT').reduce((s, e) => s + e.V1.r, 0);
  const ceiling = acting.map((e) => Math.min(...e.row.decisionInput.legalActions.filter((a) => a.targetEntityId !== null && !NONCOMMITTAL.has(a.actionType)).map((a) => e.row.labels.actions[K(a.actionId)].r)));
  const moveRows = acting.map((e) => e.row.decisionInput.legalActions.filter((a) => a.actionType === 'MOVE').map((a) => e.row.labels.actions[K(a.actionId)])).filter((m) => m.length);
  const v1MeanRegret = mean(acting.map((e) => e.V1.r));
  const audit = {
    relationalTargetedActionCeiling: { meanRegret: mean(ceiling), accuracy: mean(ceiling.map((x) => (x === 0 ? 1 : 0))), improvementOverV1: v1MeanRegret - mean(ceiling) },
    moveOptimalShare: mean(acting.map((e) => (optTypes(e).has('MOVE') ? 1 : 0))),
    moveDirectionRegretSpread: mean(moveRows.map((m) => Math.max(...m.map((x) => x.r)) - Math.min(...m.map((x) => x.r)))),
    allMoveDirectionsEquivalentShare: mean(moveRows.map((m) => (new Set(m.map((x) => x.r)).size === 1 ? 1 : 0))),
    nexusInputsCarryPosition: false,
  };
  const ra = EVALUATION_PLAN.representationAudit;
  audit.HOLDS = audit.relationalTargetedActionCeiling.improvementOverV1 < ra.relationalCeilingImprovementBelow
    && audit.moveOptimalShare >= ra.moveOptimalShareAtLeast && audit.moveDirectionRegretSpread >= ra.moveDirectionSpreadAtLeast;

  return {
    decisionTable: NEXUS_V1_DECISION_TABLE, decisionPaths: paths, legalTypeAvailability: availability,
    protectDominance: {
      explanation: 'PROTECT is legal whenever energy >= 1 and any non-hostile unprotected entity is adjacent (legal in every DEV row). The only types ranked above it (REINFORCE in the threat order; REPAIR, SUBSTITUTE, REINFORCE, TRANSFER, COLLECT in the structure order) are rarely legal, SUBSTITUTE is not a Forge action type at all, and the target is never consulted, so the first legal PROTECT by action identity wins.',
      v1ProtectRate: mean(acting.map((e) => (e.v1.action.actionType === 'PROTECT' ? 1 : 0))), protectShareOfV1Regret: protectRegret / totalRegret,
      protectTargetEvidence: { threatenedTarget: summarizeTargets(protectTargets.threatened), unthreatenedTarget: summarizeTargets(protectTargets.unthreatened) },
    },
    confusion: { rows: 'V1 selected type', columns: 'primary optimal type (most optimal branches, ties alphabetical)', matrix: confusion },
    actionTypeTable,
    targetMapping: { P_CORRECT_TARGET_GIVEN_CORRECT_TYPE: typeOk ? typeOkExact / typeOk : null, correctTypeN: typeOk,
      typeAlignment: typeOk / acting.length, exactAccuracy: mean(acting.map((e) => e.V1.o)),
      whereProtectOnThreatenedTargetIsLegal: (() => {
        const sub = enriched.filter(({ e, s }) => e.row.decisionInput.legalActions.some((a) => a.actionType === 'PROTECT' && (s.threatenedBy.get(a.targetEntityId) ?? 0) > 0))
          .map(({ e }) => e).filter((e) => optTypes(e).has(e.v1.action.actionType));
        return { correctTypeN: sub.length, P_CORRECT_TARGET_GIVEN_CORRECT_TYPE: mean(sub.map((e) => e.V1.o)) };
      })() },
    regimes, HOSTILE_REGIME_EFFECT: regimeEffect('HOSTILE_PRESENT', 'NO_HOSTILE'),
    DEPENDENCY_REGIME_EFFECT: (() => { const b = regimes.find((r) => r.regime === 'DEPENDENCY_BOTTLENECK'); const nb = acting.filter((e) => !enriched.find((x) => x.e === e).codes.has('NEXUS_BOTTLENECK'));
      return { DEPENDENCY_BOTTLENECK: b.v1.meanRegret, NO_BOTTLENECK: mean(nb.map((e) => e.V1.r)), delta: b.v1.meanRegret - mean(nb.map((e) => e.V1.r)) }; })(),
    representationAudit: audit,
  };
}

/* ------------------------------------------------------------- freeze body */
async function buildFreeze() {
  const dev = await loadPartition('DEV');
  const ev = evaluate(dev.rows);
  const equivalence = ev.filter((e) => nexusV1RankingEquivalent(e.row.decisionInput) !== (e.v1.action?.actionId ?? null)).length;
  const body = {
    schemaVersion: 1, stage: 'STAGE_3F_6_P_1_NEXUS_RISK_RESPONSE_REMEDIATION', phase: 'CANDIDATE_FREEZE',
    devEvidence: { contentHash: dev.manifest.contentHash, contentVerified: dev.contentOk, rows: dev.rows.length, v1FidelityMismatches: dev.manifest.v1FidelityMismatches },
    historicalV1: { id: 'NEXUS_SELECTOR_V1', source: V1_SOURCE, sourceHash: hex(readFileSync(at(V1_SOURCE))), modified: false },
    candidate: { id: NEXUS_SELECTOR_V2_CANDIDATE_ID, source: CANDIDATE_SOURCE, sourceHash: hex(readFileSync(at(CANDIDATE_SOURCE))), candidateHash: NEXUS_V2_CANDIDATE_HASH,
      remediation: NEXUS_V2_REMEDIATION, gateDisabledEquivalenceMismatchesOnDev: equivalence },
    primaryHypothesis: 'NEXUS_ACTION_TYPE_MAPPING_IS_TOO_PROTECT_BIASED',
    devAudit: devAudit(ev), devComparison: compare(ev),
    evaluationPlan: EVALUATION_PLAN, explorationDisclosure: EXPLORATION_DISCLOSURE,
  };
  return JSON.parse(JSON.stringify({ ...body, freezeHash: sha256(body) }));
}

/* ================================================================= FREEZE */
if (mode === 'FREEZE') {
  if (existsSync(at(`${OUT}/nexus-evidence-cal.jsonl.gz`)) || existsSync(at(`${OUT}/nexus-evidence-cal-manifest.json`))) throw new Error('FREEZE_REFUSED: CAL evidence already exists');
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && existsSync(at(FREEZE))) throw new Error('FREEZE_REFUSED: a candidate freeze already exists and is immutable');
  const freeze = await buildFreeze();
  if (dryRun) { console.log(JSON.stringify({ dryRun: true, devAudit: freeze.devAudit, devComparison: freeze.devComparison, candidate: freeze.candidate.candidateHash }, null, 2)); process.exit(0); }
  await mkdir(at(OUT), { recursive: true });
  await writeFile(at(FREEZE), `${JSON.stringify(freeze, null, 2)}\n`);
  const d = freeze.devComparison;
  console.log(JSON.stringify({ freezeHash: freeze.freezeHash, candidateHash: freeze.candidate.candidateHash, candidateSourceHash: freeze.candidate.sourceHash,
    devV1: [d.V1.accuracy, d.V1.meanRegret], devV2: [d.V2.accuracy, d.V2.meanRegret], devMaterial: d.materiality.MATERIAL,
    devResourceAgreement: d.distinctiveness.V2_RESOURCE_AGREEMENT, devOracle: [d.policySet.ORACLE_WITH_V1.meanRegret, d.policySet.ORACLE_WITH_V2.meanRegret] }, null, 2));
  process.exit(0);
}

/* ====================================================== CERTIFY / CHECK */
const storedFreezeText = readText(FREEZE);
const storedFreeze = JSON.parse(storedFreezeText);
const rebuiltFreeze = await buildFreeze();
const cal = await loadPartition('CAL');
const calEv = evaluate(cal.rows);
const calComparison = compare(calEv);
const devAuditResult = storedFreeze.devAudit;

const gitClean = (...paths) => { const r = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths.map((p) => `platform/game-agnostic/${p}`)], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() === '' : false; };
const headBlobHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const cert = (r) => readJson(r).certificationHash;
const s3a = readJson('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json');
const s3t = readJson('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json');
const scope = {
  stage3f6aIntact: s3a.certificationHash === '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca',
  stage3f6tIntact: s3t.certificationHash === '5d6910dd39405ee9f9fc2868f1309ff84998d30f7128e7a60b36644ca9056582',
  stage3f6wIntact: cert('artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json') === '7c5db9fbdd1d02bbee76ee12a0a5bf8a6e98c5a53adb510b0ed7e57ebd295fb6',
  stage3f6dIntact: cert('artifacts/stage3f6d-decision-rule/stage3f6d-certification-result.json') === 'f262c3477631a92007e1a40d4ba85bc03874fab6c1a68e78013378de2b909f3b',
  stage3f6pIntact: cert('artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json') === '3cd670113c2ffd3ad40e1113b77d492943b226bfcdb1730c3b60a15de679a585',
  v1SourceUnchanged: hex(readFileSync(at(V1_SOURCE))) === headBlobHash(V1_SOURCE) && hex(readFileSync(at(V1_SOURCE))) === storedFreeze.historicalV1.sourceHash,
  otherPoliciesUnchanged: hex(readFileSync(at(PROPOSAL_SOURCE))) === s3a.sourceHashes[PROPOSAL_SOURCE],
  policySetHashUnchanged: POLICY_SET_HASH === s3t.policySet.hash,
  priorOwnersGitClean: gitClean(V1_SOURCE, 'src/experts/nexus.js', PROPOSAL_SOURCE, 'src/stage3f/policy-router-v1.js', 'src/stage3f/decision-rule-v1.js',
    'src/stage3f/decision-risk-state-v1.js', 'src/stage3f/deployable-feature-contract-v1.js', 'artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered',
    'artifacts/stage3f6c-deployable-router', 'artifacts/stage3f6a-action-proposals', 'artifacts/stage3f6t-policy-router', 'artifacts/stage3f6w-risk-state',
    'artifacts/stage3f6d-decision-rule', 'artifacts/stage3f6p-policy-quality', 'scripts/certify-stage3f6p-policy-quality.mjs', 'scripts/generate-stage3f6p-policy-evidence.mjs'),
  newOwners: [CANDIDATE_SOURCE, 'scripts/generate-stage3f6p1-nexus-evidence.mjs', 'scripts/certify-stage3f6p1-nexus-remediation.mjs', 'tests/stage3f6p1-nexus-remediation.test.js'],
  existingOwnersModified: ['package.json', '.gitignore'],
  routerTrained: false, routingThresholdsChanged: false, decisionRulesChanged: false, featuresAdded: false, otherPoliciesModified: false, v1ModifiedInPlace: false,
};

/* static leakage audit on the candidate and its transitive imports */
const closure = (() => { const seen = new Set(); const walk = (f) => { if (seen.has(f)) return; seen.add(f); const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/(?:from|import)\s*'(\.[^']+)'/g)) walk(path.resolve(path.dirname(f), m[1])); }; walk(at(CANDIDATE_SOURCE));
  return [...seen].map((f) => path.relative(root, f)).sort(); })();
const candidateCode = readText(CANDIDATE_SOURCE).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const leakage = {
  FUTURE_OUTCOME_LEAKAGE: /\b(nextState|resultingStateHash|futureOutcome|terminalOutcome)\b|\.outcome\b/.test(candidateCode),
  REGRET_LEAKAGE: /\.(regret|scalarReward|immediateScalar|optimalScalar)\b|\bregret\s*[[(]/.test(candidateCode),
  OPTIMAL_LABEL_LEAKAGE: /\.(optimalSet|labels|correct)\b|\bbuildTarget\s*\(/.test(candidateCode),
  SIMULATOR_DEPENDENCE: closure.some((f) => /^src\/(forge|prime|lab)\//.test(f)) || /\b(step|cloneState|cloneWorld|transition)\s*\(/.test(candidateCode),
  ROLLOUT_DEPENDENCE: /\b(rollForwardV2|evaluateCounterfactualsV2|recommend|rollout)\s*\(/.test(candidateCode),
};
/* dynamic leakage probe: poisoned label fields on the decision input and on every legal action */
const POISON = ['optimalSet', 'regret', 'labels', 'outcome', 'nextState', 'scalarReward', 'branches', 'correct', 'futureState'];
let dynamicLeak = 0; let dynamicMismatch = 0;
for (const e of calEv.slice(0, 400)) {
  const trap = (o) => { for (const k of POISON) Object.defineProperty(o, k, { enumerable: true, get() { dynamicLeak += 1; throw new Error(`LEAK:${k}`); } }); return o; };
  const input = trap({ canonicalState: e.row.decisionInput.canonicalState, legalActions: e.row.decisionInput.legalActions.map((a) => trap({ ...a })) });
  try { if (JSON.stringify(nexusSelectorV2Candidate(input)) !== JSON.stringify(e.v2)) dynamicMismatch += 1; } catch { dynamicLeak += 1; }
}
const canonicalKeysOnly = [...cal.rows, ...[]].every((r) => Object.keys(r.decisionInput.canonicalState).every((k) => ['entities', 'relationships'].includes(k))
  && r.decisionInput.canonicalState.entities.every((x) => Object.keys(x).every((k) => ['id', 'kind', 'hostile', 'critical'].includes(k)))
  && r.decisionInput.legalActions.every((a) => Object.keys(a).every((k) => ['actionId', 'actionType', 'targetEntityId'].includes(k))));

/* classification (frozen precedence) */
const plan = storedFreeze.evaluationPlan;
const c = calComparison;
const rolePreserved = c.distinctiveness.V2_RESOURCE_AGREEMENT < plan.distinctiveness.highResourceCollinearityAtLeast;
const setPreserved = c.policySet.VALUE_PRESERVED;
let primaryResult;
if (c.nexusProposingN < 200) primaryResult = 'F_INSUFFICIENT_EVIDENCE';
else if (devAuditResult.protectDominance.protectShareOfV1Regret < 0.5) primaryResult = 'C_PROTECT_BIAS_NOT_PRIMARY_CAUSE';
else if (c.materiality.MATERIAL && rolePreserved && setPreserved) primaryResult = c.whenV2Best.V2.meanRegret <= plan.absoluteQuality.keepGradeWhenBestMeanRegretAtMost
  ? 'A_NEXUS_ACTION_MAPPING_MATERIALLY_IMPROVED' : 'B_NEXUS_IMPROVED_BUT_STILL_ABSOLUTELY_WEAK';
else if (devAuditResult.representationAudit.HOLDS) primaryResult = 'D_REMEDIATION_REQUIRES_MISSING_REPRESENTATION';
else primaryResult = 'E_NO_SAFE_MINIMAL_REMEDIATION_FOUND';
const secondary = [
  c.materiality.MATERIAL ? 'STANDALONE_MATERIAL_IMPROVEMENT' : 'STANDALONE_NOT_MATERIAL',
  c.distinctiveness.POLICY_COLLAPSE ? 'POLICY_COLLAPSE_TO_RESOURCE' : c.distinctiveness.HIGH_RESOURCE_COLLINEARITY ? 'HIGH_RESOURCE_COLLINEARITY' : null,
  setPreserved ? null : 'POLICY_SET_VALUE_REDUCED',
  c.distinctiveness.V1_GREEDY_AGREEMENT >= 0.8 ? 'V1_WAS_GREEDY_COLLINEAR' : null,
].filter(Boolean);

let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6p1-nexus-remediation.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

const checks = {
  PREDECESSORS_INTACT: scope.stage3f6aIntact && scope.stage3f6tIntact && scope.stage3f6wIntact && scope.stage3f6dIntact && scope.stage3f6pIntact,
  NEXUS_V1_UNCHANGED: scope.v1SourceUnchanged,
  V1_FIDELITY: cal.manifest.v1FidelityMismatches === 0 && storedFreeze.devEvidence.v1FidelityMismatches === 0,
  GATE_DISABLED_REPRODUCES_V1: storedFreeze.candidate.gateDisabledEquivalenceMismatchesOnDev === 0
    && calEv.every((e) => nexusV1RankingEquivalent(e.row.decisionInput) === (e.v1.action?.actionId ?? null)),
  OTHER_POLICIES_UNCHANGED: scope.otherPoliciesUnchanged && scope.policySetHashUnchanged,
  PRIOR_OWNERS_GIT_CLEAN: scope.priorOwnersGitClean,
  FREEZE_REPRODUCED: JSON.stringify(rebuiltFreeze, null, 2) === JSON.stringify(storedFreeze, null, 2),
  CANDIDATE_MATCHES_FREEZE: storedFreeze.candidate.sourceHash === hex(readFileSync(at(CANDIDATE_SOURCE))) && storedFreeze.candidate.candidateHash === NEXUS_V2_CANDIDATE_HASH,
  CAL_GENERATED_AFTER_FREEZE: cal.manifest.candidateFreezeBinding?.freezeHash === storedFreeze.freezeHash
    && cal.manifest.candidateFreezeBinding?.candidateSourceHash === storedFreeze.candidate.sourceHash,
  DATA_INTEGRITY: cal.contentOk && rebuiltFreeze.devEvidence.contentVerified && cal.rows.every((r) => r.partition === 'CAL'),
  COVERAGE_PRESERVED: c.coverageMismatch === 0,
  NO_LEAKAGE: Object.values(leakage).every((v) => v === false) && dynamicLeak === 0 && dynamicMismatch === 0 && canonicalKeysOnly,
  CANDIDATE_NOT_PROMOTED: calEv.every((e) => e.v2.candidateOnly === true && e.v2.promotedToLiveRuntime === false),
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

const payload = {
  schemaVersion: 1, stage: 'STAGE_3F_6_P_1_NEXUS_RISK_RESPONSE_REMEDIATION', status,
  freezeHash: storedFreeze.freezeHash, candidate: storedFreeze.candidate, CONFIRMATORY_CLAIMS: false,
  data: { DEV: storedFreeze.devEvidence, CAL: { contentHash: cal.manifest.contentHash, rows: cal.rows.length, freezeBinding: cal.manifest.candidateFreezeBinding } },
  devAudit: devAuditResult, dev: storedFreeze.devComparison, cal: calComparison,
  leakage, dynamicLeakageProbe: { rows: Math.min(400, calEv.length), poisonedFields: POISON, accesses: dynamicLeak, outputMismatches: dynamicMismatch, canonicalKeysOnly },
  candidateImportClosure: closure,
  diagnosis: {
    primaryResult, secondaryResult: secondary.join('+'), rolePreserved, policySetValuePreserved: setPreserved,
    NEXUS_REMEDIATION_BLOCKED_BY_REPRESENTATION: primaryResult === 'D_REMEDIATION_REQUIRES_MISSING_REPRESENTATION',
    nexusPolicyConclusion: primaryResult.startsWith('A') || primaryResult.startsWith('B')
      ? 'The PROTECT gate improves NEXUS while keeping it distinct and keeping policy-set value.'
      : `Gating reflexive PROTECT ${c.materiality.MATERIAL ? 'materially improves' : 'does not materially improve'} NEXUS standalone (CAL regret ${c.V1.meanRegret.toFixed(2)} -> ${c.V2.meanRegret.toFixed(2)}), `
        + `but V2 agrees with RESOURCE on ${(100 * c.distinctiveness.V2_RESOURCE_AGREEMENT).toFixed(1)}% of decisions and the policy-set oracle moves ${c.policySet.ORACLE_REGRET_DELTA >= 0 ? 'up' : 'down'} by ${Math.abs(c.policySet.ORACLE_REGRET_DELTA).toFixed(2)} regret. `
        + 'No entity-targeted relational action can close the gap; the gain lies in MOVE direction, which NEXUS inputs do not observe.',
  },
  evaluationPlan: plan, explorationDisclosure: storedFreeze.explorationDisclosure,
  scope, checks, tests: testMetrics,
  sourceHashes: Object.fromEntries(scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))])),
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
  roadmap: { READY_FOR_FRESH_NEXUS_CONFIRMATION: primaryResult.startsWith('A') || primaryResult.startsWith('B'), READY_FOR_ROUTER_RETRAIN: false, READY_FOR_STAGE3G: false },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (mode === 'CHECK') {
  const stored = readJson(RESULT);
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6P1_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    diagnosis: payload.diagnosis, roadmap: payload.roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
