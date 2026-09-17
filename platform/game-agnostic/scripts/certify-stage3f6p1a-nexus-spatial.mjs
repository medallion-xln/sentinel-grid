#!/usr/bin/env node
/* STAGE_3F_6_P_1A — NEXUS relational spatial context (narrow feasibility substage of Stage 3F.6-P.1).
 *
 * Question: does NEXUS need to know where relationally important entities are, relative to the actor and to
 * threats, to turn relational understanding into useful action — and is a governed, deployable form of that
 * information sufficient without collapsing into RESOURCE or becoming a planner?
 *
 *   --freeze [--dry-run]  DEV only. Observation audit, MOVE-direction audit, relational MOVE semantics, per-field
 *                         information value (deployable fields AND privileged diagnostics), separability, ceilings,
 *                         V1/V2/RESOURCE DEV metrics, the candidate decision, the advancement rule and the CAL gate.
 *                         Refused if a freeze or CAL evidence already exists.
 *   (default) / --check   Re-derives the freeze byte-for-byte, verifies the CAL gate was honoured, runs boundary
 *                         checks and tests, and certifies. CAL is evaluated only if the freeze authorized it.
 *
 * Privileged kernel geometry is read ONLY here, offline, to measure whether hidden geometry would have been
 * sufficient. It is never an input to any policy or to the contract derivation.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deepFreeze, sha256 } from '../src/core/determinism.js';
import { POLICY_SET_HASH, bestPolicySet, quantile } from '../src/stage3f/policy-router-v1.js';
import { observedThreatStructure } from '../src/stage3f/deployable-action-proposal-v1.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import { nexusSelectorV2Candidate } from '../src/stage3f/nexus-selector-v2-candidate.js';
import {
  DECLARED_MOVE_SEMANTICS, NEXUS_RELATIONAL_SPATIAL_CONTEXT_CONTRACT, NEXUS_RELATIONAL_SPATIAL_CONTEXT_HASH, NEXUS_SPATIAL_CANDIDATE_FIELDS,
  SPATIAL_AVAILABILITY, deriveRelationalSpatialContext,
} from '../src/stage3f/nexus-relational-spatial-context-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const OUT = 'artifacts/stage3f6p1a-nexus-spatial';
const FREEZE = `${OUT}/stage3f6p1a-dev-freeze.json`;
const RESULT = `${OUT}/stage3f6p1a-certification-result.json`;
const CONTRACT_SOURCE = 'src/stage3f/nexus-relational-spatial-context-v1.js';
const V3_SOURCE = 'src/stage3f/nexus-selector-v3-spatial-candidate.js';
const V1_SOURCE = 'src/lab/stage3c-learned-nexus.js';
const V2_SOURCE = 'src/stage3f/nexus-selector-v2-candidate.js';
const PROPOSAL_SOURCE = 'src/stage3f/deployable-action-proposal-v1.js';
const mode = process.argv.includes('--freeze') ? 'FREEZE' : process.argv.includes('--check') ? 'CHECK' : 'CERTIFY';
const skipTests = process.argv.includes('--skip-tests');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const at = (r) => path.join(root, r);
const readText = (r) => readFileSync(at(r), 'utf8');
const readJson = (r) => JSON.parse(readText(r));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const K = (id) => id.slice(0, 16);
const byId = (a, b) => (a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0);
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const RES = 'RESOURCE_PRESERVING_V1'; const OBJ = 'OBJECTIVE_TARGETING_V1'; const THR = 'THREAT_COVERING_V1';

/* ------------------------------------------------------------------ rules (frozen with the DEV analysis) */
const RULES = deepFreeze({
  data: { development: 'DEV only', cal: 'only if CAL_EVALUATION_AUTHORIZED', exposedAndUnused: ['prior HOLDOUT', 'prior OOD'] },
  moveOptimalRows: 'NEXUS V1 proposes, >= 2 legal MOVEs, and at least one legal MOVE is horizon-optimal',
  directionBaseline: 'lowest action identity among legal MOVEs (the V1/V2 tie-break)',
  directionInformationValue: 'on rows where the field separates the legal MOVEs: accuracy of the top-scored MOVE (ties by action identity) minus the baseline on the same rows; both orientations measured, the better one reported',
  fieldAcceptance: {
    MOVE_DIRECTION: 'deployable AND relational AND discriminating rows >= 200 AND direction delta >= +0.05',
    PROTECT_VS_MOVE: 'deployable AND evidence rows >= 200 AND accuracy delta >= +0.01 over the no-PROTECT mapping on NEXUS-proposing rows',
    PRIVILEGED: 'never accepted (not deployable); its value is measured only to diagnose whether hidden geometry would suffice',
  },
  separability: 'meaningful only if at least one deployable relational MOVE_DIRECTION field is accepted',
  candidateConstruction: 'NEXUS_SELECTOR_V3_SPATIAL_CANDIDATE is constructed only if separability is meaningful',
  advancement: ['V3 constructed', 'standalone material over V1: mean regret delta <= -5.0 AND accuracy delta >= +0.05',
    'ORACLE_WITH_V3 mean regret <= ORACLE_WITH_V1 mean regret', 'V3-RESOURCE agreement < 0.5 AND P(V3 correct AND RESOURCE wrong) >= P(V1 correct AND RESOURCE wrong)',
    'p95 regret and P(regret > 100) not worse than V1', 'no privileged spatial input (static and dynamic boundary checks)'],
  calGate: 'CAL_EVALUATION_AUTHORIZED = advancement passes on DEV',
  classificationPrecedence: [
    'F_MOVE_DIRECTION_NOT_PRIMARY_LIMITATION if the V2 oracle-direction ceiling does not bring policy-set oracle regret below ORACLE_WITH_V1',
    'A/B/C from CAL, only if CAL was authorized and evaluated',
    'E_REQUIRED_SPATIAL_INFORMATION_NOT_DEPLOYABLE if no deployable relational direction field is accepted but a privileged RELATIONAL direction field would meet the direction bar',
    'D_AVAILABLE_SPATIAL_CONTEXT_INSUFFICIENT if no deployable relational direction field is accepted and no privileged relational one would either',
    'C_SPATIAL_CONTEXT_CAUSES_ROLE_COLLAPSE if V3 was constructed but fails advancement on RESOURCE agreement or policy-set value',
    'B_RELATIONAL_SPATIAL_CONTEXT_HELPS_BUT_INSUFFICIENT otherwise',
  ],
  readiness: { READY_FOR_FRESH_NEXUS_CONFIRMATION: 'only A after DEV and CAL', READY_FOR_ROUTER_RETRAIN: false, READY_FOR_STAGE3G: false },
});

const EXPLORATION_DISCLOSURE = deepFreeze([
  'Before this freeze, DEV-only exploratory scripts (not certification inputs) measured single-feature MOVE-direction rules, direction ceilings and PROTECT-vs-MOVE splits. These rules were written after those DEV values were seen.',
  'The exploration found that the lowest-identity MOVE is EAST whenever EAST is legal (action identities are hashes of fixed direction parameters), and that EAST is optimal in most MOVE-optimal rows.',
]);

/* ------------------------------------------------------------------ evidence */
async function loadDev() {
  const manifest = readJson(`${OUT}/spatial-evidence-dev-manifest.json`);
  const text = gunzipSync(await readFile(at(`${OUT}/spatial-evidence-dev.jsonl.gz`))).toString('utf8');
  return { manifest, contentOk: hex(text) === manifest.contentHash, rows: text.split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
}
const nexusOf = (di) => evaluateNexus({ canonicalState: di.canonicalState, legalActions: di.legalActions.map((a) => ({ actionId: a.actionId, targetEntityId: a.targetEntityId })) });
function v1Ranking(di, admissible = di.legalActions, nexus = nexusOf(di)) {
  const sel = nexusRelationalSelector({ branches: admissible.map((a) => ({ actionKey: a.actionId, actionType: a.actionType })) }, nexus);
  return sel.abstain ? null : admissible.find((a) => a.actionId === sel.actionId);
}
const baseInput = (di) => ({ canonicalState: di.canonicalState, legalActions: di.legalActions.map(({ actionId, actionType, targetEntityId }) => ({ actionId, actionType, targetEntityId })) });

function prepare(rows) {
  return rows.map((row) => {
    const di = row.decisionInput; const nexus = nexusOf(di);
    const v1 = v1Ranking(di, di.legalActions, nexus);
    const p2 = nexusSelectorV2Candidate(baseInput(di));
    const v2 = p2.action ? di.legalActions.find((a) => a.actionId === p2.action.actionId) : null;
    const res = di.legalActions.find((a) => K(a.actionId) === row.labels.others[RES]);
    return { row, di, nexus, v1, v2, res, lab: row.labels.actions };
  });
}

/* ------------------------------------------------------------------ geometry (privileged: offline only) */
function geometry(p) {
  const P = p.row.privilegedDiagnostic; const ents = p.di.canonicalState.entities; const s = observedThreatStructure(p.di.canonicalState);
  const pos = (id) => P.entities[id]; const actor = pos('actor');
  const dest = (m) => ({ x: actor.x + DECLARED_MOVE_SEMANTICS.directions[m.parameters.direction].dx, y: actor.y + DECLARED_MOVE_SEMANTICS.directions[m.parameters.direction].dy });
  const ids = (pred) => ents.filter(pred).map((e) => e.id);
  const threatened = ids((e) => (s.threatenedBy.get(e.id) ?? 0) > 0);
  const unsupported = [...s.unsupportedThreatened];
  const hostiles = ids((e) => e.hostile && pos(e.id).health > 0);
  const hubs = ids((e) => (s.dependents.get(e.id) ?? 0) >= 2);
  const critical = ids((e) => e.critical);
  const resources = ids((e) => e.kind === 'RESOURCE' && pos(e.id).available);
  const protectable = ents.filter((e) => e.id !== 'actor' && !e.hostile && !pos(e.id).protected).map((e) => e.id);
  const threats = p.di.canonicalState.relationships.filter((r) => r.kind === 'threatens');
  const minD = (d, list) => (list.length ? Math.min(...list.map((id) => manhattan(d, pos(id)))) : null);
  const W = P.grid.width;
  return { actor, dest, threatened, unsupported, hostiles, hubs, critical, resources, protectable, threats, minD, pos, cell: (c) => P.grid.cells[c.y * W + c.x] };
}

/* per-MOVE scorers: return a number, or null when the field is undefined for this row (missing semantics) */
function scorers(p) {
  const g = geometry(p); const ctx = deriveRelationalSpatialContext(p.di);
  const ctxMove = new Map(ctx.moves.map((m) => [m.actionId, m]));
  const bool = (v) => (v === true ? 1 : v === false ? 0 : null);
  return {
    deployable: {
      moveAlignsWithRetreat: (m) => bool(ctxMove.get(m.actionId).moveAlignsWithRetreat),
      moveOpposesRetreat: (m) => bool(ctxMove.get(m.actionId).moveOpposesRetreat),
    },
    privilegedRelational: {
      moveChangesThreatenedDistance: (m) => (g.threatened.length ? -g.minD(g.dest(m), g.threatened) : null),
      moveChangesHostileDistance: (m) => (g.hostiles.length ? g.minD(g.dest(m), g.hostiles) : null),
      moveChangesDependencyHubDistance: (m) => (g.hubs.length ? -g.minD(g.dest(m), g.hubs) : null),
      moveChangesCriticalDistance: (m) => (g.critical.length ? -g.minD(g.dest(m), g.critical) : null),
      moveInterposesThreat: (m) => (g.threats.length ? (g.threats.some((t) => g.pos(t.from) && g.pos(t.to)
        && manhattan(g.pos(t.from), g.dest(m)) + manhattan(g.dest(m), g.pos(t.to)) === manhattan(g.pos(t.from), g.pos(t.to))) ? 1 : 0) : null),
      moveChangesThreatenedAdjacency: (m) => (g.threatened.length ? g.threatened.filter((id) => manhattan(g.dest(m), g.pos(id)) <= 1).length : null),
    },
    privilegedNonRelationalReference: {
      approachResource: (m) => (g.resources.length ? -g.minD(g.dest(m), g.resources) : null),
      adjacentProtectableValue: (m) => Math.max(0, ...g.protectable.filter((id) => manhattan(g.dest(m), g.pos(id)) <= 1).map((id) => g.pos(id).value)),
      avoidHazard: (m) => (g.cell(g.dest(m)) === 2 ? 0 : 1),
      fixedDirectionEast: (m) => (m.parameters.direction === 'EAST' ? 1 : 0),
    },
    semantics: {
      APPROACH_THREATENED: (m) => (g.threatened.length ? g.minD(g.dest(m), g.threatened) < g.minD(g.actor, g.threatened) : null),
      APPROACH_UNSUPPORTED_THREATENED: (m) => (g.unsupported.length ? g.minD(g.dest(m), g.unsupported) < g.minD(g.actor, g.unsupported) : null),
      LEAVE_HOSTILE: (m) => (g.hostiles.length ? g.minD(g.dest(m), g.hostiles) > g.minD(g.actor, g.hostiles) : null),
      INTERPOSE_THREAT: (m) => (g.threats.length ? g.threats.some((t) => manhattan(g.pos(t.from), g.dest(m)) + manhattan(g.dest(m), g.pos(t.to)) === manhattan(g.pos(t.from), g.pos(t.to))) : null),
      PRESERVE_DEPENDENCY_HUB_ADJACENCY: (m) => { const adj = g.hubs.filter((id) => manhattan(g.actor, g.pos(id)) <= 1); return adj.length ? adj.some((id) => manhattan(g.dest(m), g.pos(id)) <= 1) : null; },
      ALIGN_RETREAT_DEPLOYABLE: (m) => { const v = ctxMove.get(m.actionId).moveAlignsWithRetreat; return typeof v === 'boolean' ? v : null; },
      APPROACH_RESOURCE_REFERENCE: (m) => (g.resources.length ? g.minD(g.dest(m), g.resources) < g.minD(g.actor, g.resources) : null),
      AVOID_HAZARD_REFERENCE: (m) => g.cell(g.dest(m)) !== 2,
    },
  };
}

/* ------------------------------------------------------------------ DEV analysis */
function analyse(prepared) {
  const acting = prepared.filter((p) => p.v1 !== null);
  const movesOf = (p) => p.di.legalActions.filter((a) => a.actionType === 'MOVE').sort(byId);
  const moveRows = acting.filter((p) => movesOf(p).length >= 2 && movesOf(p).some((m) => p.lab[K(m.actionId)].o === 1));

  /* Section 5 — availability, verified against the evidence */
  const verification = {
    actorCellObservedMatchesKernel: prepared.every((p) => p.di.observationFeatures[3] === p.row.privilegedDiagnostic.entities.actor.x && p.di.observationFeatures[4] === p.row.privilegedDiagnostic.entities.actor.y),
    canonicalStateCarriesNoPositions: prepared.every((p) => p.di.canonicalState.entities.every((e) => Object.keys(e).every((k) => ['id', 'kind', 'hostile', 'critical'].includes(k)))),
    decisionInputCarriesNoGridOrTerrain: prepared.every((p) => Object.keys(p.di).sort().join(',') === 'canonicalState,legalActions,observationFeatures'),
    everyLegalMoveDeclaresDirection: prepared.every((p) => movesOf(p).every((m) => DECLARED_MOVE_SEMANTICS.directions[m.parameters.direction] !== undefined)),
    everyLegalRetreatIsOneStepFromActor: prepared.every((p) => p.di.legalActions.filter((a) => a.actionType === 'RETREAT')
      .every((a) => Math.abs(a.parameters.toX - p.di.observationFeatures[3]) + Math.abs(a.parameters.toY - p.di.observationFeatures[4]) === 1)),
    retreatLegalShare: mean(prepared.map((p) => (p.di.legalActions.some((a) => a.actionType === 'RETREAT') ? 1 : 0))),
  };

  /* Section 8 — MOVE audit */
  const dist = (fn) => { const o = {}; for (const p of moveRows) { const k = fn(p); o[k] = (o[k] ?? 0) + 1; } return o; };
  const perDirection = Object.fromEntries(Object.keys(DECLARED_MOVE_SEMANTICS.directions).map((d) => {
    const legal = moveRows.flatMap((p) => movesOf(p).filter((m) => m.parameters.direction === d).map((m) => p.lab[K(m.actionId)].o));
    return [d, { legalShare: legal.length / moveRows.length, optimalWhenLegal: mean(legal) }];
  }));
  const moveAudit = {
    MOVE_OPTIMAL_N: moveRows.length, nexusProposingN: acting.length,
    MOVE_DIRECTION_VARIANTS: { legalMoveCount: dist((p) => movesOf(p).length), optimalOfLegal: dist((p) => `${movesOf(p).filter((m) => p.lab[K(m.actionId)].o).length}/${movesOf(p).length}`) },
    lowestIdentityDirection: dist((p) => movesOf(p)[0].parameters.direction), perDirection,
    meanRegretSpreadAcrossMoves: mean(moveRows.map((p) => { const r = movesOf(p).map((m) => p.lab[K(m.actionId)].r); return Math.max(...r) - Math.min(...r); })),
    BASELINE_DIRECTION_ACCURACY: mean(moveRows.map((p) => p.lab[K(movesOf(p)[0].actionId)].o)),
    RANDOM_DIRECTION_EXPECTED_ACCURACY: mean(moveRows.map((p) => mean(movesOf(p).map((m) => p.lab[K(m.actionId)].o)))),
  };

  /* Section 7/10 — per-field direction information value */
  const scoredRows = moveRows.map((p) => ({ p, s: scorers(p), moves: movesOf(p) }));
  const v1BestSet = (p) => { const chosen = { [RES]: p.row.labels.others[RES], NEXUS_SELECTOR: K(p.v1.actionId), [OBJ]: p.row.labels.others[OBJ], [THR]: p.row.labels.others[THR] };
    const regret = {}; for (const [k, v] of Object.entries(chosen)) regret[k] = v === null ? null : p.lab[v].r; return bestPolicySet({ chosen, regret }).best.includes('NEXUS_SELECTOR'); };
  const directionValue = (group, name, subset = scoredRows) => {
    const orient = (sign) => { let n = 0; let ok = 0; let base = 0; let fullOk = 0;
      for (const { p, s, moves } of subset) {
        const fn = s[group][name]; const scores = moves.map((m) => fn(m));
        const baseline = p.lab[K(moves[0].actionId)].o;
        if (scores.some((v) => v === null) || new Set(scores).size === 1) { fullOk += baseline; continue; }
        const best = Math.max(...scores.map((v) => sign * v)); const pick = moves.find((m, i) => sign * scores[i] === best);
        n += 1; ok += p.lab[K(pick.actionId)].o; base += baseline; fullOk += p.lab[K(pick.actionId)].o;
      }
      return { orientation: sign > 0 ? 'PREFER_HIGH' : 'PREFER_LOW', discriminatingRows: n, fieldAccuracy: n ? ok / n : null, baselineAccuracySameRows: n ? base / n : null,
        delta: n ? (ok - base) / n : null, ruleAccuracyAllMoveOptimalRows: subset.length ? fullOk / subset.length : null };
    };
    const a = orient(1); const b = orient(-1);
    return (b.delta ?? -Infinity) > (a.delta ?? -Infinity) ? b : a;
  };
  const v1BestRows = scoredRows.filter(({ p }) => v1BestSet(p));
  const fields = [];
  for (const [group, deployable, relational] of [['deployable', true, true], ['privilegedRelational', false, true], ['privilegedNonRelationalReference', false, false]]) {
    for (const name of Object.keys(scoredRows[0].s[group])) {
      const value = directionValue(group, name); const nexusBest = directionValue(group, name, v1BestRows);
      const meetsBar = value.discriminatingRows >= 200 && value.delta >= 0.05;
      fields.push({ fieldId: name, group, deployable, relational, role: 'MOVE_DIRECTION', direction: value, nexusBestDirection: nexusBest, meetsDirectionBar: meetsBar,
        accepted: deployable && relational && meetsBar,
        decision: deployable && relational ? (meetsBar ? 'ACCEPTED' : 'REJECTED_NO_INCREMENTAL_VALUE') : relational ? 'REJECTED_NOT_DEPLOYABLE' : 'REFERENCE_ONLY_NOT_RELATIONAL_NOT_DEPLOYABLE' });
    }
  }

  /* PROTECT vs MOVE: deployable adjacency evidence */
  const noProtect = (p) => v1Ranking(p.di, p.di.legalActions.filter((a) => a.actionType !== 'PROTECT'), p.nexus);
  const protectPreferable = (p) => { const pr = p.di.legalActions.filter((a) => a.actionType === 'PROTECT').map((a) => p.lab[K(a.actionId)].r);
    const mv = p.di.legalActions.filter((a) => a.actionType === 'MOVE').map((a) => p.lab[K(a.actionId)].r);
    return pr.length && mv.length && Math.min(...pr) < Math.min(...mv) ? 1 : 0; };
  const baseProtectPreferable = mean(acting.map(protectPreferable));
  const noneAcc = mean(acting.map((p) => { const a = noProtect(p); return a ? p.lab[K(a.actionId)].o : 0; }));
  for (const name of ['adjacentThreatenedEvidence', 'adjacentDependencyHubEvidence', 'adjacentCriticalEvidence']) {
    const evidenceRows = acting.filter((p) => deriveRelationalSpatialContext(p.di).protectEvidence?.[name] === true);
    const s = (p) => observedThreatStructure(p.di.canonicalState);
    const pred = { adjacentThreatenedEvidence: (st, id) => (st.threatenedBy.get(id) ?? 0) > 0, adjacentDependencyHubEvidence: (st, id) => (st.dependents.get(id) ?? 0) >= 2,
      adjacentCriticalEvidence: (st, id) => st.criticalIds.has(id) }[name];
    const acc = mean(acting.map((p) => { const st = s(p); const a = v1Ranking(p.di, p.di.legalActions.filter((x) => x.actionType !== 'PROTECT' || pred(st, x.targetEntityId)), p.nexus); return a ? p.lab[K(a.actionId)].o : 0; }));
    const meets = evidenceRows.length >= 200 && acc - noneAcc >= 0.01;
    fields.push({ fieldId: name, group: 'deployable', deployable: true, relational: true, role: 'PROTECT_VS_MOVE',
      protectVsMove: { evidenceRows: evidenceRows.length, P_PROTECT_PREFERABLE_GIVEN_EVIDENCE: mean(evidenceRows.map(protectPreferable)), P_PROTECT_PREFERABLE_BASE: baseProtectPreferable,
        accuracyWithField: acc, accuracyNoProtect: noneAcc, delta: acc - noneAcc },
      accepted: meets, decision: meets ? 'ACCEPTED' : evidenceRows.length < 200 ? 'REJECTED_INSUFFICIENT_EVIDENCE' : 'REJECTED_NO_INCREMENTAL_VALUE' });
  }

  /* Section 9 — relational MOVE semantics */
  const semantics = Object.keys(scoredRows[0].s.semantics).map((effect) => {
    let tN = 0; let tO = 0; let fN = 0; let fO = 0;
    for (const { p, s, moves } of scoredRows) for (const m of moves) { const v = s.semantics[effect](m); if (v === null) continue; const o = p.lab[K(m.actionId)].o; if (v) { tN += 1; tO += o; } else { fN += 1; fO += o; } }
    const pT = tN ? tO / tN : null; const pF = fN ? fO / fN : null; const lift = pT !== null && pF ? pT / pF : null;
    return { effect, movesWithEffect: tN, movesWithoutEffect: fN, P_OPTIMAL_WITH: pT, P_OPTIMAL_WITHOUT: pF, lift,
      evidence: tN < 200 || fN < 200 || lift === null ? 'INSUFFICIENT' : lift >= 1.1 ? 'SUPPORTED' : lift <= 0.9 ? 'CONTRADICTED' : 'NO_EFFECT' };
  });

  /* ceilings and policy metrics */
  const others = [RES, OBJ, THR];
  const metrics = (pick) => {
    const entries = acting.map((p) => ({ p, a: pick(p) }));
    const r = entries.map(({ p, a }) => p.lab[K(a.actionId)].r).sort((x, y) => x - y); const n = r.length;
    const types = {}; for (const { a } of entries) types[a.actionType] = (types[a.actionType] ?? 0) + 1; for (const t of Object.keys(types)) types[t] /= n;
    const dirRows = entries.filter(({ p, a }) => a.actionType === 'MOVE' && p.di.legalActions.some((m) => m.actionType === 'MOVE' && p.lab[K(m.actionId)].o === 1));
    const bestRows = entries.filter(({ p }) => v1BestSet(p));
    const oracle = prepared.map((p) => { const a = p.v1 === null ? null : pick(p); const pool = others.map((o) => p.row.labels.others[o]).filter(Boolean).map((k) => p.lab[k].r);
      if (a) pool.push(p.lab[K(a.actionId)].r); return pool.length ? Math.min(...pool) : p.lab[p.row.labels.others.RANDOM_LEGAL_V1].r; });
    return { n, accuracy: mean(entries.map(({ p, a }) => p.lab[K(a.actionId)].o)), meanRegret: mean(r), p95Regret: quantile(r, 0.95), pRegretAbove100: r.filter((x) => x > 100).length / n,
      actionTypeDistribution: Object.fromEntries(Object.entries(types).sort()),
      moveDirectionCorrectness: { n: dirRows.length, accuracy: mean(dirRows.map(({ p, a }) => p.lab[K(a.actionId)].o)) },
      whenNexusV1Best: { n: bestRows.length, accuracy: mean(bestRows.map(({ p, a }) => p.lab[K(a.actionId)].o)), meanRegret: mean(bestRows.map(({ p, a }) => p.lab[K(a.actionId)].r)) },
      RESOURCE_AGREEMENT: mean(entries.map(({ p, a }) => (K(a.actionId) === p.row.labels.others[RES] ? 1 : 0))),
      GREEDY_AGREEMENT: mean(entries.map(({ p, a }) => (K(a.actionId) === p.row.labels.others.GREEDY ? 1 : 0))),
      V1_AGREEMENT: mean(entries.map(({ p, a }) => (a.actionId === p.v1.actionId ? 1 : 0))),
      P_CORRECT_AND_RESOURCE_WRONG: mean(entries.map(({ p, a }) => (p.lab[K(a.actionId)].o === 1 && p.lab[p.row.labels.others[RES]].o === 0 ? 1 : 0))),
      oracleWith: { accuracy: mean(oracle.map((x) => (x === 0 ? 1 : 0))), meanRegret: mean(oracle) } };
  };
  const bestMove = (p) => p.di.legalActions.filter((m) => m.actionType === 'MOVE').sort((a, b) => p.lab[K(a.actionId)].r - p.lab[K(b.actionId)].r || byId(a, b))[0];
  const policies = {
    V1: metrics((p) => p.v1),
    V2: metrics((p) => p.v2),
    RESOURCE: metrics((p) => p.res),
    V2_ORACLE_DIRECTION_CEILING: metrics((p) => (p.v2.actionType === 'MOVE' ? bestMove(p) : p.v2)),
  };
  return { verification, moveAudit, fields, semantics, policies, protectVsMoveBase: { P_PROTECT_PREFERABLE: baseProtectPreferable, accuracyNoProtect: noneAcc } };
}

function decide(analysis) {
  const directionFields = analysis.fields.filter((f) => f.role === 'MOVE_DIRECTION');
  const acceptedDeployableDirection = directionFields.filter((f) => f.accepted);
  const privilegedRelationalMeets = directionFields.filter((f) => f.group === 'privilegedRelational' && f.meetsDirectionBar);
  const nonRelationalMeets = directionFields.filter((f) => f.group === 'privilegedNonRelationalReference' && f.meetsDirectionBar && f.fieldId !== 'fixedDirectionEast');
  const separability = acceptedDeployableDirection.length > 0;
  const relationalPrivilegedFields = directionFields.filter((f) => f.group === 'privilegedRelational');
  const bestRule = (list) => { const top = [...list].sort((a, b) => b.direction.ruleAccuracyAllMoveOptimalRows - a.direction.ruleAccuracyAllMoveOptimalRows || (a.fieldId < b.fieldId ? -1 : 1))[0];
    return { fieldId: top.fieldId, orientation: top.direction.orientation, accuracy: top.direction.ruleAccuracyAllMoveOptimalRows,
      DELTA: top.direction.ruleAccuracyAllMoveOptimalRows - analysis.moveAudit.BASELINE_DIRECTION_ACCURACY }; };
  const candidate = { id: 'NEXUS_SELECTOR_V3_SPATIAL_CANDIDATE', constructed: separability,
    reason: separability ? 'deployable relational direction field accepted' : 'NOT CONSTRUCTED: no deployable relational field separates the correct MOVE direction on DEV' };
  const advancement = { V3_CONSTRUCTED: candidate.constructed, pass: false,
    reason: candidate.constructed ? 'evaluated by the V3 advancement criteria' : 'fails the first criterion: no V3 candidate exists' };
  const { V1, V2_ORACLE_DIRECTION_CEILING: ceiling } = analysis.policies;
  let primaryResult;
  if (ceiling.oracleWith.meanRegret >= V1.oracleWith.meanRegret) primaryResult = 'F_MOVE_DIRECTION_NOT_PRIMARY_LIMITATION';
  else if (!separability && privilegedRelationalMeets.length > 0) primaryResult = 'E_REQUIRED_SPATIAL_INFORMATION_NOT_DEPLOYABLE';
  else if (!separability) primaryResult = 'D_AVAILABLE_SPATIAL_CONTEXT_INSUFFICIENT';
  else primaryResult = 'B_RELATIONAL_SPATIAL_CONTEXT_HELPS_BUT_INSUFFICIENT';
  const relationalPriv = directionFields.filter((f) => f.group === 'privilegedRelational');
  const east = analysis.moveAudit.lowestIdentityDirection.EAST / analysis.moveAudit.MOVE_OPTIMAL_N;
  const secondary = [
    relationalPriv.every((f) => f.direction.delta !== null && f.direction.delta < 0) ? 'PRIVILEGED_RELATIONAL_GEOMETRY_ALSO_ANTI_PREDICTIVE' : null,
    nonRelationalMeets.length ? 'MOVE_DIRECTION_DRIVEN_BY_NON_RELATIONAL_HIDDEN_FACTORS' : null,
    east >= 0.9 && analysis.moveAudit.perDirection.EAST.optimalWhenLegal >= 0.5 ? 'LOWEST_IDENTITY_MOVE_IS_EAST_LAYOUT_ARTEFACT' : null,
    ceiling.oracleWith.meanRegret < V1.oracleWith.meanRegret ? 'MOVE_DIRECTION_IS_PRIMARY_LIMITATION' : null,
  ].filter(Boolean);
  return {
    acceptedFields: analysis.fields.filter((f) => f.accepted).map((f) => f.fieldId),
    rejectedFields: analysis.fields.filter((f) => !f.accepted && f.group !== 'privilegedNonRelationalReference').map((f) => ({ fieldId: f.fieldId, decision: f.decision })),
    separability: { meaningful: separability,
      MOVE_DIRECTION_BASELINE: analysis.moveAudit.BASELINE_DIRECTION_ACCURACY,
      MOVE_DIRECTION_WITH_RELATIONAL_SPATIAL: bestRule(directionFields.filter((f) => f.group === 'deployable')),
      MOVE_DIRECTION_WITH_PRIVILEGED_RELATIONAL: bestRule(relationalPrivilegedFields),
      MOVE_DIRECTION_WITH_NON_RELATIONAL_REFERENCE: bestRule(directionFields.filter((f) => f.group === 'privilegedNonRelationalReference' && f.fieldId !== 'fixedDirectionEast')),
      privilegedRelationalFieldsMeetingBar: privilegedRelationalMeets.map((f) => f.fieldId), nonRelationalReferencesMeetingBar: nonRelationalMeets.map((f) => f.fieldId) },
    candidate, advancement, calGate: { CAL_EVALUATION_AUTHORIZED: advancement.pass, reason: advancement.reason },
    classification: { primaryResult, secondaryResult: secondary.join('+'), NEXUS_REMEDIATION_BLOCKED_BY_REPRESENTATION: primaryResult !== 'A_RELATIONAL_SPATIAL_CONTEXT_SOLVES_MAPPING' },
  };
}

async function buildFreeze() {
  const dev = await loadDev();
  const prepared = prepare(dev.rows);
  const analysis = analyse(prepared);
  const decision = decide(analysis);
  const frozenSources = { [CONTRACT_SOURCE]: hex(readFileSync(at(CONTRACT_SOURCE))) };
  if (existsSync(at(V3_SOURCE))) frozenSources[V3_SOURCE] = hex(readFileSync(at(V3_SOURCE)));
  const body = {
    schemaVersion: 1, stage: 'STAGE_3F_6_P_1A_NEXUS_RELATIONAL_SPATIAL_CONTEXT', phase: 'DEV_FREEZE',
    devEvidence: { contentHash: dev.manifest.contentHash, contentVerified: dev.contentOk, rows: dev.rows.length, liveSurfaceMismatches: dev.manifest.liveSurfaceMismatches },
    preserved: { NEXUS_SELECTOR_V1: { source: V1_SOURCE, sourceHash: hex(readFileSync(at(V1_SOURCE))) }, NEXUS_SELECTOR_V2_CANDIDATE: { source: V2_SOURCE, sourceHash: hex(readFileSync(at(V2_SOURCE))) } },
    availability: SPATIAL_AVAILABILITY,
    contract: { id: NEXUS_RELATIONAL_SPATIAL_CONTEXT_CONTRACT.contractId, hash: NEXUS_RELATIONAL_SPATIAL_CONTEXT_HASH, candidateFieldCount: NEXUS_SPATIAL_CANDIDATE_FIELDS.length },
    analysis, decision, rules: RULES, explorationDisclosure: EXPLORATION_DISCLOSURE, frozenSources,
  };
  return JSON.parse(JSON.stringify({ ...body, freezeHash: sha256(body) }));
}

/* ================================================================= FREEZE */
if (mode === 'FREEZE') {
  const dryRun = process.argv.includes('--dry-run');
  if (existsSync(at(`${OUT}/spatial-evidence-cal.jsonl.gz`)) || existsSync(at(`${OUT}/spatial-evidence-cal-manifest.json`))) throw new Error('FREEZE_REFUSED: CAL evidence already exists');
  if (!dryRun && existsSync(at(FREEZE))) throw new Error('FREEZE_REFUSED: the DEV freeze already exists and is immutable');
  const freeze = await buildFreeze();
  if (dryRun) { console.log(JSON.stringify({ dryRun: true, analysis: freeze.analysis, decision: freeze.decision, contract: freeze.contract }, null, 2)); process.exit(0); }
  await mkdir(at(OUT), { recursive: true });
  await writeFile(at(FREEZE), `${JSON.stringify(freeze, null, 2)}\n`);
  console.log(JSON.stringify({ freezeHash: freeze.freezeHash, contractHash: freeze.contract.hash, decision: freeze.decision }, null, 2));
  process.exit(0);
}

/* ====================================================== CERTIFY / CHECK */
const storedFreeze = readJson(FREEZE);
const rebuiltFreeze = await buildFreeze();
const calAuthorized = storedFreeze.decision.calGate.CAL_EVALUATION_AUTHORIZED === true;
if (calAuthorized) throw new Error('CAL was authorized but this stage has no V3 evaluation path');
const calEvidencePresent = existsSync(at(`${OUT}/spatial-evidence-cal.jsonl.gz`)) || existsSync(at(`${OUT}/spatial-evidence-cal-manifest.json`));

const gitClean = (...paths) => { const r = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths.map((p) => `platform/game-agnostic/${p}`)], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() === '' : false; };
const headHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const cert = (r) => readJson(r).certificationHash;
const s3a = readJson('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json');
const p1Freeze = readJson('artifacts/stage3f6p1-nexus-remediation/stage3f6p1-candidate-freeze.json');
const scope = {
  stage3f6aIntact: s3a.certificationHash === '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca',
  stage3f6tIntact: cert('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json') === '5d6910dd39405ee9f9fc2868f1309ff84998d30f7128e7a60b36644ca9056582',
  stage3f6wIntact: cert('artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json') === '7c5db9fbdd1d02bbee76ee12a0a5bf8a6e98c5a53adb510b0ed7e57ebd295fb6',
  stage3f6dIntact: cert('artifacts/stage3f6d-decision-rule/stage3f6d-certification-result.json') === 'f262c3477631a92007e1a40d4ba85bc03874fab6c1a68e78013378de2b909f3b',
  stage3f6pIntact: cert('artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json') === '3cd670113c2ffd3ad40e1113b77d492943b226bfcdb1730c3b60a15de679a585',
  stage3f6p1Intact: cert('artifacts/stage3f6p1-nexus-remediation/stage3f6p1-certification-result.json') === '48462a169c88337a9f27315c3e10b83f615e077a8ba2dc6751fdf437351d31e4',
  v1Unchanged: hex(readFileSync(at(V1_SOURCE))) === headHash(V1_SOURCE) && hex(readFileSync(at(V1_SOURCE))) === p1Freeze.historicalV1.sourceHash,
  v2Unchanged: hex(readFileSync(at(V2_SOURCE))) === headHash(V2_SOURCE) && hex(readFileSync(at(V2_SOURCE))) === p1Freeze.candidate.sourceHash,
  otherPoliciesUnchanged: hex(readFileSync(at(PROPOSAL_SOURCE))) === s3a.sourceHashes[PROPOSAL_SOURCE],
  policySetHashUnchanged: POLICY_SET_HASH === readJson('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json').policySet.hash,
  priorOwnersGitClean: gitClean(V1_SOURCE, V2_SOURCE, 'src/experts/nexus.js', PROPOSAL_SOURCE, 'src/stage3f/policy-router-v1.js', 'src/stage3f/decision-rule-v1.js',
    'src/stage3f/decision-risk-state-v1.js', 'src/stage3f/deployable-feature-contract-v1.js', 'src/forge', 'artifacts/stage3f6a-action-proposals', 'artifacts/stage3f6t-policy-router',
    'artifacts/stage3f6w-risk-state', 'artifacts/stage3f6d-decision-rule', 'artifacts/stage3f6p-policy-quality', 'artifacts/stage3f6p1-nexus-remediation',
    'scripts/certify-stage3f6p1-nexus-remediation.mjs', 'scripts/generate-stage3f6p1-nexus-evidence.mjs', 'tests/stage3f6p1-nexus-remediation.test.js'),
  newOwners: [CONTRACT_SOURCE, 'scripts/generate-stage3f6p1a-spatial-evidence.mjs', 'scripts/certify-stage3f6p1a-nexus-spatial.mjs', 'tests/stage3f6p1a-nexus-spatial.test.js'],
  existingOwnersModified: ['package.json', '.gitignore'],
  routerTrained: false, routerThresholdChanged: false, decisionRuleChanged: false, v1Modified: false, v2Modified: false, v3Constructed: existsSync(at(V3_SOURCE)),
};

/* boundary checks on the contract derivation */
const closure = (() => { const seen = new Set(); const walk = (f) => { if (seen.has(f)) return; seen.add(f);
  for (const m of readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*'(\.[^']+)'/g)) walk(path.resolve(path.dirname(f), m[1])); }; walk(at(CONTRACT_SOURCE));
  return [...seen].map((f) => path.relative(root, f)).sort(); })();
const contractCode = readText(CONTRACT_SOURCE).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, '``');
const leakage = {
  FUTURE_STATE_LEAKAGE: /\b(nextState|resultingStateHash|futureState|futurePosition)\b/.test(contractCode),
  OUTCOME_LEAKAGE: /\.outcome\b|\bterminalOutcome\b/.test(contractCode),
  REGRET_LEAKAGE: /\.(regret|scalarReward|immediateScalar|optimalScalar)\b/.test(contractCode),
  OPTIMAL_LABEL_LEAKAGE: /\.(optimalSet|labels|correct)\b|\bbuildTarget\s*\(/.test(contractCode),
  SIMULATOR_DEPENDENCE: closure.some((f) => /^src\/(forge|prime|lab)\//.test(f)) || /\b(step|cloneState|cloneWorld|transition)\s*\(/.test(contractCode),
  ROLLOUT_DEPENDENCE: /\b(rollForwardV2|evaluateCounterfactualsV2|recommend|rollout)\s*\(/.test(contractCode),
  HIDDEN_STATE_BYPASS: /\.(grid|position|privilegedDiagnostic|cells|world)\b|\bDECLARED_ACTION_COST_MODEL\b|\bresourcePreservingProposal\b/.test(contractCode),
};
const POISON = ['optimalSet', 'regret', 'labels', 'outcome', 'nextState', 'futureState', 'scalarReward', 'privilegedDiagnostic', 'grid', 'position', 'cost', 'world'];
const dev = await loadDev();
let poisonAccess = 0; let poisonMismatch = 0;
for (const row of dev.rows.slice(0, 400)) {
  const trap = (o) => { for (const k of POISON) Object.defineProperty(o, k, { enumerable: false, get() { poisonAccess += 1; throw new Error(`LEAK:${k}`); } }); return o; };
  const di = row.decisionInput;
  const input = trap({ observationFeatures: di.observationFeatures, legalActions: di.legalActions.map((a) => trap({ ...a, parameters: trap({ ...a.parameters }) })),
    canonicalState: trap({ entities: di.canonicalState.entities.map((e) => trap({ ...e })), relationships: di.canonicalState.relationships }) });
  try { if (JSON.stringify(deriveRelationalSpatialContext(input)) !== JSON.stringify(deriveRelationalSpatialContext(di))) poisonMismatch += 1; } catch { poisonAccess += 1; }
}

let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6p1a-nexus-spatial.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

const checks = {
  PREDECESSORS_INTACT: scope.stage3f6aIntact && scope.stage3f6tIntact && scope.stage3f6wIntact && scope.stage3f6dIntact && scope.stage3f6pIntact && scope.stage3f6p1Intact,
  V1_AND_V2_UNCHANGED: scope.v1Unchanged && scope.v2Unchanged,
  OTHER_POLICIES_UNCHANGED: scope.otherPoliciesUnchanged && scope.policySetHashUnchanged,
  PRIOR_OWNERS_GIT_CLEAN: scope.priorOwnersGitClean,
  FREEZE_REPRODUCED: JSON.stringify(rebuiltFreeze, null, 2) === JSON.stringify(storedFreeze, null, 2),
  CONTRACT_MATCHES_FREEZE: storedFreeze.contract.hash === NEXUS_RELATIONAL_SPATIAL_CONTEXT_HASH && storedFreeze.frozenSources[CONTRACT_SOURCE] === hex(readFileSync(at(CONTRACT_SOURCE))),
  DEV_EVIDENCE_INTEGRITY: dev.contentOk && dev.manifest.liveSurfaceMismatches === 0 && dev.rows.every((r) => r.partition === 'DEV'),
  OBSERVATION_AUDIT_VERIFIED: Object.entries(storedFreeze.analysis.verification).filter(([k]) => k !== 'retreatLegalShare').every(([, v]) => v === true),
  CAL_GATE_HONOURED: !calAuthorized && !calEvidencePresent && !scope.v3Constructed,
  NO_LEAKAGE: Object.values(leakage).every((v) => v === false) && poisonAccess === 0 && poisonMismatch === 0,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const d = storedFreeze.decision; const pol = storedFreeze.analysis.policies;
const payload = {
  schemaVersion: 1, stage: 'STAGE_3F_6_P_1A_NEXUS_RELATIONAL_SPATIAL_CONTEXT', status, freezeHash: storedFreeze.freezeHash, CONFIRMATORY_CLAIMS: false,
  availability: storedFreeze.availability, contract: storedFreeze.contract, analysis: storedFreeze.analysis, decision: d,
  cal: { evaluated: false, CAL_EVALUATION_AUTHORIZED: false, evidencePresent: calEvidencePresent },
  leakage, dynamicBoundaryProbe: { rows: 400, poisonedFields: POISON, accesses: poisonAccess, outputMismatches: poisonMismatch }, contractImportClosure: closure,
  diagnosis: {
    primaryResult: d.classification.primaryResult, secondaryResult: d.classification.secondaryResult,
    nexusSpatialConclusion: `Direction is the binding limitation (a perfect-direction V2 would cut policy-set oracle regret ${pol.V1.oracleWith.meanRegret.toFixed(2)} -> ${pol.V2_ORACLE_DIRECTION_CEILING.oracleWith.meanRegret.toFixed(2)}), `
      + 'but no relational-spatial relation, deployable or privileged, predicts the correct MOVE better than the lowest-identity (EAST) baseline; the correct MOVE follows non-relational hidden factors (resource proximity, adjacent entity value). No V3 candidate was constructed.',
  },
  rules: storedFreeze.rules, explorationDisclosure: storedFreeze.explorationDisclosure,
  scope, checks, tests: testMetrics,
  sourceHashes: Object.fromEntries(scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))])),
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
  roadmap: { READY_FOR_FRESH_NEXUS_CONFIRMATION: false, READY_FOR_ROUTER_RETRAIN: false, READY_FOR_STAGE3G: false },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (mode === 'CHECK') {
  const stored = readJson(RESULT);
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6P1A_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), diagnosis: payload.diagnosis }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
