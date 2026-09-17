#!/usr/bin/env node
/* STAGE_3F_6_P_1B — Forge directional symmetry audit (bounded benchmark/environment diagnostic).
 *
 * Question: would the same decision, rotated or reflected into another orientation, preserve its optimal-action
 * semantics? If not, exactly why — and is Stage 3F.6-P.1A's EAST advantage intentional, an accidental generation
 * asymmetry, an action-identity/ordering artifact, a topology artifact, a resource/objective placement artifact, or
 * a mixture?
 *
 * DEV only. Every rule is in the analysis plan, hashed before the symmetry evidence was generated. Historical
 * generators, kernel, oracle, corpora, evidence and policies are read, never written. Privileged geometry is used for
 * diagnosis only. `--check` requires byte-identical reproduction.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { POLICY_SET_HASH } from '../src/stage3f/policy-router-v1.js';
import { forgeActionKey } from '../src/forge/kernel.js';
import { observedThreatStructure } from '../src/stage3f/deployable-action-proposal-v1.js';
import { FORGE_SYMMETRY_TRANSFORM_CONTRACT_HASH, SYMMETRY_TRANSFORM_IDS, transformDirection } from '../src/stage3f/forge-symmetry-transform-v1.js';
import { STAGE3F6P1B_PLAN, STAGE3F6P1B_PLAN_HASH, STAGE3F6P1B_PLAN_PATH } from './stage3f6p1b-analysis-plan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const OUT = 'artifacts/stage3f6p1b-directional-symmetry';
const RESULT = `${OUT}/stage3f6p1b-certification-result.json`;
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const at = (r) => path.join(root, r);
const readText = (r) => readFileSync(at(r), 'utf8');
const readJson = (r) => JSON.parse(readText(r));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const rate = (list, fn) => (list.length ? list.filter(fn).length / list.length : null);
const K16 = (k) => k.slice(0, 16);
const DIRECTIONS = ['EAST', 'NORTH', 'SOUTH', 'WEST'];
const DELTA = { NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] };
const NON_IDENTITY = SYMMETRY_TRANSFORM_IDS.filter((t) => t !== 'IDENTITY');
const AXIS_PRESERVING = ['ROTATE_180', 'REFLECT_X', 'REFLECT_Y'];
const plan = STAGE3F6P1B_PLAN;

/* ------------------------------------------------------------------ inputs */
const gz = async (r) => gunzipSync(await readFile(at(r))).toString('utf8');
const spatialManifest = readJson('artifacts/stage3f6p1a-nexus-spatial/spatial-evidence-dev-manifest.json');
const spatialText = await gz('artifacts/stage3f6p1a-nexus-spatial/spatial-evidence-dev.jsonl.gz');
const spatialRows = spatialText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const symManifest = readJson(`${OUT}/symmetry-evidence-dev-manifest.json`);
const symText = await gz(`${OUT}/symmetry-evidence-dev.jsonl.gz`);
const symRows = symText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const storedPlan = readJson(STAGE3F6P1B_PLAN_PATH);
const integrity = {
  planFileMatchesPlan: storedPlan.planHash === STAGE3F6P1B_PLAN_HASH,
  evidenceBoundToPlan: symManifest.planHash === STAGE3F6P1B_PLAN_HASH,
  symmetryEvidence: hex(symText) === symManifest.contentHash,
  spatialEvidenceReadOnly: hex(spatialText) === spatialManifest.contentHash && spatialManifest.contentHash === '98b5671241a44d301b17ad2275d31dd363467cb2beb01e6ae16623342758e9b5',
  corpusSource: symManifest.sourceCorpusHash === readJson('artifacts/stage3f6c-deployable-router/confirmatory-corpus-manifest.json').contentHash,
  allDevEvaluated: symManifest.evaluated === 4000 && symManifest.devRows === 4000 && symManifest.rebuildMismatches === 0,
  devOnly: symManifest.partition === 'DEV' && spatialRows.every((r) => r.partition === 'DEV'),
};

/* ------------------------------------------------------------------ 2. direction vocabulary */
const moveKey = (direction) => forgeActionKey({ actionType: 'MOVE', actorId: 'actor', target: null, parameters: { direction } });
const keyOrder = [...DIRECTIONS].sort((a, b) => (moveKey(a) < moveKey(b) ? -1 : 1));
const lowestIdentityConsistent = spatialRows.every((r) => {
  const moves = r.decisionInput.legalActions.filter((a) => a.actionType === 'MOVE');
  if (!moves.length) return true;
  const lowest = [...moves].sort((a, b) => (a.actionId < b.actionId ? -1 : 1))[0].parameters.direction;
  return lowest === keyOrder.find((d) => moves.some((m) => m.parameters.direction === d))
    && moves.every((m) => m.actionId === moveKey(m.parameters.direction));
});
const vocabulary = {
  directions: Object.fromEntries(DIRECTIONS.map((d) => [d, { delta: DELTA[d], actionKey: moveKey(d),
    identityRule: 'forgeActionKey = sha256(stableStringify([actionType, actorId, target, parameters]))',
    actionIdConstruction: `descriptor { actionId: "forge/move", actionType: "MOVE", actorId: "actor", target: null, parameters: { direction: "${d}" } }` }])),
  enumerationOrder: 'kernel legalActions iterates Object.keys(FORGE_MOVE_DIRECTIONS).sort() = EAST, NORTH, SOUTH, WEST, and only if the cell is unblocked',
  legalActionInsertionOrder: 'MOVE, RESTORE, PROTECT, REINFORCE/REPAIR, BYPASS, BUILD, TRANSFER, COLLECT, ATTACK, RETREAT, WAIT; then the whole list is re-sorted by action key',
  hashOrderInteraction: 'every consumer that breaks ties by action identity sees MOVE keys in hash order, which is fixed across worlds because the key depends only on type, actor id ("actor"), null target and direction name',
  keyOrder,
  actorIdAlwaysActor: spatialRows.every((r) => r.decisionInput.canonicalState.entities.some((e) => e.id === 'actor' && e.kind === 'ACTOR')),
  LOWEST_IDENTITY_MOVE_IS_EAST_WHEN_LEGAL: keyOrder[0] === 'EAST' && lowestIdentityConsistent,
  proof: `sha256 key order ${keyOrder.join(' < ')} holds for every world (actor id is always "actor"); every DEV row's lowest-identity MOVE is the first legal direction in that order`,
};

/* ------------------------------------------------------------------ 3/4. distributions (P.1A DEV evidence, read-only) */
const energyCuts = (() => { const e = spatialRows.map((r) => r.decisionInput.observationFeatures[2]).sort((a, b) => a - b); return [e[Math.floor(e.length / 3)], e[Math.floor((2 * e.length) / 3)]]; })();
const region = (r) => { const a = r.privilegedDiagnostic.entities.actor; const w = r.privilegedDiagnostic.grid.width; const h = r.privilegedDiagnostic.grid.height;
  const third = (v, n, lo, mid, hi) => (v < n / 3 ? lo : v >= (2 * n) / 3 ? hi : mid);
  return `${third(a.y, h, 'NORTH', 'MIDDLE', 'SOUTH')}_${third(a.x, w, 'WEST', 'CENTER', 'EAST')}`; };
const groupers = {
  scenarioFamily_roles: (r) => r.combination.roles, level: (r) => r.combination.level, topology: (r) => r.combination.shape, objective: (r) => r.combination.objectives,
  horizonBand: (r) => r.combination.horizonBand,
  resourcePressureBand: (r) => { const e = r.decisionInput.observationFeatures[2]; return e <= energyCuts[0] ? 'LOW_ENERGY' : e <= energyCuts[1] ? 'MID_ENERGY' : 'HIGH_ENERGY'; },
  actorStartRegion: region,
};
const directionStats = (rows) => {
  const legal = (r, d) => r.decisionInput.legalActions.find((a) => a.actionType === 'MOVE' && a.parameters.direction === d);
  const optimal = (r, d) => { const m = legal(r, d); return m ? r.labels.actions[K16(m.actionId)].o === 1 : false; };
  const moveOptimalRows = rows.filter((r) => DIRECTIONS.some((d) => optimal(r, d)));
  const tieCounts = {}; for (const r of moveOptimalRows) { const n = DIRECTIONS.filter((d) => optimal(r, d)).length; tieCounts[n] = (tieCounts[n] ?? 0) + 1; }
  const coOptimal = {}; for (const r of moveOptimalRows) { const set = DIRECTIONS.filter((d) => optimal(r, d)); if (set.length > 1) { const k = set.join('+'); coOptimal[k] = (coOptimal[k] ?? 0) + 1; } }
  return {
    rows: rows.length, moveOptimalRows: moveOptimalRows.length,
    P_OPTIMAL_ALL_ROWS: Object.fromEntries(DIRECTIONS.map((d) => [d, rate(rows, (r) => optimal(r, d))])),
    P_OPTIMAL_MOVE_OPTIMAL_ROWS: Object.fromEntries(DIRECTIONS.map((d) => [d, rate(moveOptimalRows, (r) => optimal(r, d))])),
    P_LEGAL: Object.fromEntries(DIRECTIONS.map((d) => [d, rate(rows, (r) => Boolean(legal(r, d)))])),
    P_OPTIMAL_GIVEN_LEGAL: Object.fromEntries(DIRECTIONS.map((d) => [d, rate(rows.filter((r) => legal(r, d)), (r) => optimal(r, d))])),
    optimalMoveDirectionCountPerMoveOptimalRow: tieCounts, coOptimalDirectionSets: coOptimal,
    P_MULTIPLE_DIRECTIONS_OPTIMAL: rate(moveOptimalRows, (r) => DIRECTIONS.filter((d) => optimal(r, d)).length > 1),
  };
};
const distributions = {
  energyBandCuts: energyCuts,
  overall: directionStats(spatialRows),
  byGroup: Object.fromEntries(Object.entries(groupers).map(([name, fn]) => [name, Object.fromEntries([...new Set(spatialRows.map(fn))].sort()
    .map((v) => { const s = directionStats(spatialRows.filter((r) => fn(r) === v)); return [v, { rows: s.rows, moveOptimalRows: s.moveOptimalRows, P_OPTIMAL_MOVE_OPTIMAL_ROWS: s.P_OPTIMAL_MOVE_OPTIMAL_ROWS, P_OPTIMAL_GIVEN_LEGAL: s.P_OPTIMAL_GIVEN_LEGAL }]; }))])),
};

/* ------------------------------------------------------------------ 5. placement (privileged, diagnosis only) */
const placement = (() => {
  const groups = {};
  const add = (g, dx, dy) => { const x = (groups[g] = groups[g] ?? { n: 0, east: 0, west: 0, sameX: 0, south: 0, north: 0, sameY: 0, dx: 0, dy: 0, adjacent: { EAST: 0, WEST: 0, SOUTH: 0, NORTH: 0 } });
    x.n += 1; x.east += dx > 0; x.west += dx < 0; x.sameX += dx === 0; x.south += dy > 0; x.north += dy < 0; x.sameY += dy === 0; x.dx += dx; x.dy += dy;
    for (const d of DIRECTIONS) if (dx === DELTA[d][0] && dy === DELTA[d][1]) x.adjacent[d] += 1; };
  const spawn = { n: 0, xNorm: 0, yNorm: 0, distEast: 0, distWest: 0, distNorth: 0, distSouth: 0, regions: {} };
  for (const r of spatialRows) {
    const P = r.privilegedDiagnostic; const a = P.entities.actor; const W = P.grid.width; const H = P.grid.height;
    spawn.n += 1; spawn.xNorm += a.x / (W - 1); spawn.yNorm += a.y / (H - 1);
    spawn.distEast += W - 1 - a.x; spawn.distWest += a.x; spawn.distNorth += a.y; spawn.distSouth += H - 1 - a.y;
    const reg = region(r); spawn.regions[reg] = (spawn.regions[reg] ?? 0) + 1;
    const s = observedThreatStructure(r.decisionInput.canonicalState);
    for (const e of r.decisionInput.canonicalState.entities) {
      if (e.id === 'actor') continue; const p = P.entities[e.id]; const dx = p.x - a.x; const dy = p.y - a.y;
      if (e.id === 'material') add('RESOURCE_MATERIAL_NEAR_ACTOR', dx, dy);
      else if (e.kind === 'RESOURCE') add('RESOURCE_OTHER', dx, dy);
      if (e.critical) add('OBJECTIVE_CRITICAL', dx, dy);
      if (e.hostile) add('HOSTILE', dx, dy);
      if ((s.dependents.get(e.id) ?? 0) >= 2) add('DEPENDENCY_HUB', dx, dy);
      if (['POWER_SOURCE', 'DEPOT', 'REPAIR_TARGET', 'INFRASTRUCTURE'].includes(e.kind)) add('STRUCTURAL_TOPOLOGY_NODE', dx, dy);
      if (e.kind === 'CIVILIAN') add('CIVILIAN', dx, dy);
      if (e.kind === 'SUBSTITUTE') add('SUBSTITUTE', dx, dy);
      if (e.kind === 'BARRIER') add('BARRIER', dx, dy);
    }
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const code = P.grid.cells[y * W + x]; if (code === 2) add('HAZARD_CELL', x - a.x, y - a.y); if (code === 1) add('BLOCKED_TERRAIN_CELL', x - a.x, y - a.y);
    }
  }
  const out = Object.fromEntries(Object.entries(groups).sort().map(([g, x]) => {
    const ew = x.east / x.n - x.west / x.n; const sn = x.south / x.n - x.north / x.n;
    return [g, { n: x.n, P_EAST_OF_ACTOR: x.east / x.n, P_WEST_OF_ACTOR: x.west / x.n, P_SAME_COLUMN: x.sameX / x.n, P_SOUTH_OF_ACTOR: x.south / x.n,
      P_NORTH_OF_ACTOR: x.north / x.n, P_SAME_ROW: x.sameY / x.n, meanDx: x.dx / x.n, meanDy: x.dy / x.n, EAST_MINUS_WEST: ew, SOUTH_MINUS_NORTH: sn,
      adjacentShare: Object.fromEntries(DIRECTIONS.map((d) => [d, x.adjacent[d] / x.n])),
      ASYMMETRIC: x.n >= 200 && (Math.abs(ew) >= 0.05 || Math.abs(sn) >= 0.05) }];
  }));
  return { groups: out, actorSpawn: { n: spawn.n, meanXNormalised: spawn.xNorm / spawn.n, meanYNormalised: spawn.yNorm / spawn.n,
    meanDistanceToEastEdge: spawn.distEast / spawn.n, meanDistanceToWestEdge: spawn.distWest / spawn.n, meanDistanceToNorthEdge: spawn.distNorth / spawn.n,
    meanDistanceToSouthEdge: spawn.distSouth / spawn.n, regions: Object.fromEntries(Object.entries(spawn.regions).sort()) },
    positionsAtDecisionEqualSpawn: 'warm-up plays only WAIT and is truncated at any task change, which includes positions (warmup.js taskSignature)' };
})();

/* ------------------------------------------------------------------ 6. generator source audit (verified against live source) */
const SOURCE_FINDINGS = [
  { id: 'EAST_FIRST_ADJACENT_PLACEMENT', owner: 'src/forge/scenarios-v2.js', pattern: /const candidates = \[\s*\{ x: anchor\.position\.x \+ 1, y: anchor\.position\.y \}, \{ x: anchor\.position\.x - 1/, directional: true,
    category: 'OBJECTIVE_RESOURCE_PLACEMENT', lookFor: 'east-first fallback / fixed positive-x offset',
    note: 'placeNear tries x+1 (EAST), x-1 (WEST), y+1 (SOUTH), y-1 (NORTH) and takes candidates[0]; used for the "material" RESOURCE beside the actor' },
  { id: 'EAST_FIRST_CANDIDATE_SELECTION', owner: 'src/forge/scenarios-v2.js', pattern: /const cell = candidates\[0\];/, directional: true, category: 'OBJECTIVE_RESOURCE_PLACEMENT',
    lookFor: 'array insertion order', note: 'first free candidate wins, so EAST whenever that cell is free' },
  { id: 'MATERIAL_PLACED_NEAR_ACTOR', owner: 'src/forge/scenarios-v2.js', pattern: /placeNear\('material', 'RESOURCE', actor,/, directional: true, category: 'OBJECTIVE_RESOURCE_PLACEMENT',
    lookFor: 'objective/resource placement bias', note: 'declared intent is reachability ("Material the actor can reach"), not orientation' },
  { id: 'ROW_MAJOR_FREE_CELL_SCAN', owner: 'src/forge/scenarios-v2.js', pattern: /for \(let y = 0; y < size; y \+= 1\) \{\s*for \(let x = 0; x < size; x \+= 1\) \{/, directional: false, category: 'ITERATION_ORDER',
    lookFor: 'sorted-cell selection / iteration-order placement', note: 'row-major list, but the index is drawn uniformly, so no directional preference is expected (measured)' },
  { id: 'SYMMETRIC_INTERIOR_TERRAIN', owner: 'src/forge/scenarios-v2.js', pattern: /cells\[randomInt\(random, 1, size - 1\) \* size \+ randomInt\(random, 1, size - 1\)\] = 2;/, directional: false,
    category: 'TERRAIN', lookFor: 'fixed spawn corners / terrain boundaries', note: 'hazards drawn uniformly over the symmetric interior; square grid' },
  { id: 'MOVE_ENUMERATION_SORTED_NAMES', owner: 'src/forge/kernel.js', pattern: /for \(const name of Object\.keys\(FORGE_MOVE_DIRECTIONS\)\.sort\(\)\)/, directional: false, category: 'ACTION_ORDER',
    lookFor: 'canonical orientation / enumeration order', note: 'insertion order EAST, NORTH, SOUTH, WEST; erased by the final key sort' },
  { id: 'LEGAL_ACTIONS_SORTED_BY_HASH', owner: 'src/forge/kernel.js', pattern: /return actions\.sort\(\(a, b\) => \{\s*const ka = forgeActionKey\(a\);/, directional: true, category: 'ACTION_IDENTITY_ORDERING',
    lookFor: 'hash-order dependence', note: 'MOVE keys in fixed hash order EAST < SOUTH < WEST < NORTH' },
  { id: 'RETREAT_X_AXIS_FIRST', owner: 'src/forge/kernel.js', pattern: /const y = actor\.position\.y \+ \(dx !== 0 \? 0 : dy\);/, directional: true, category: 'KERNEL_AXIS_ORDER',
    lookFor: 'canonical orientation', note: 'RETREAT steps along x whenever the nearest hostile differs in x; not equivariant under 90-degree rotations' },
  { id: 'CONTINUATION_TIE_BREAK_BY_KEY', owner: 'src/forge/counterfactual-v2.js', pattern: /if \(best === null \|\| rank > best\.rank \|\| \(rank === best\.rank && key < best\.key\)\)/, directional: true, category: 'ACTION_IDENTITY_ORDERING',
    lookFor: 'hash-order dependence in labels', note: 'greedy continuation breaks rank ties by action key, so rollouts (and optimal sets) can depend on orientation' },
  { id: 'HORIZON_LABEL_KEY_SORT', owner: 'src/forge/counterfactual-v2.js', pattern: /const bestImmediateKey = \[\.\.\.immediateOptima\]\.sort\(\)\[0\];/, directional: true, category: 'ACTION_IDENTITY_ORDERING',
    lookFor: 'hash-order dependence in labels', note: 'greedyRegret label uses the lowest-key immediate optimum' },
  { id: 'GREEDY_BASELINE_TIE_BREAK_BY_KEY', owner: 'src/lab/stage3c-learned-nexus.js', pattern: /const best = \[\.\.\.branches\]\.sort\(\(a, b\) => \(b\.immediateScalar - a\.immediateScalar\)\s*\|\| \(a\.actionKey < b\.actionKey \? -1 : 1\)\)\[0\];/, directional: true,
    category: 'ACTION_IDENTITY_ORDERING', lookFor: 'hash-order dependence in labels and policy', note: 'GREEDY and GREEDY_SAFE break immediate ties by key' },
  { id: 'RESOURCE_TIE_BREAK_BY_KEY', owner: 'src/stage3f/deployable-action-proposal-v1.js', pattern: /\[\.\.\.priced\]\.sort\(\(a, b\) => a\.cost - b\.cost \|\| byActionId\(a\.action, b\.action\)\)\[0\]/, directional: true,
    category: 'ACTION_IDENTITY_ORDERING', lookFor: 'hash-order dependence in policy', note: 'cheapest action by key: EAST among zero-cost MOVEs' },
  { id: 'NEXUS_V2_TIE_BREAK_BY_KEY', owner: 'src/stage3f/nexus-selector-v2-candidate.js', pattern: /\|\| \(a\.actionId < b\.actionId \? -1 : a\.actionId > b\.actionId \? 1 : 0\)\);/, directional: true,
    category: 'ACTION_IDENTITY_ORDERING', lookFor: 'hash-order dependence in policy', note: 'V2 MOVE fallback takes the lowest key: EAST' },
  { id: 'WARMUP_WAIT_ONLY', owner: 'src/forge/warmup.js', pattern: /const wait = legalActions\(world\)\.find\(\(action\) => action\.actionType === 'WAIT'\);/, directional: false, category: 'NONE',
    lookFor: 'topology traversal / spawn drift', note: 'warm-up never moves anything' },
];
const lineOf = (text, re) => { const m = re.exec(text); return m ? text.slice(0, m.index).split('\n').length : null; };
const sourceAudit = SOURCE_FINDINGS.map((f) => { const text = readText(f.owner); const line = lineOf(text, f.pattern);
  return { id: f.id, owner: f.owner, line, found: line !== null, directional: f.directional, category: f.category, lookFor: f.lookFor, note: f.note }; });
const topologyHasNoGeometry = !/position|\.x\b|\.y\b|grid/.test(readText('src/forge/topology.js').replace(/\/\*[\s\S]*?\*\//g, ''));
const documentedDirectionalIntent = /(east|west|north|south|orientation|positive-x)[^\n]*(intended|by design|deliberate)/i.test(readText('src/forge/scenarios-v2.js'))
  || /(intended|by design|deliberate)[^\n]*(east|west|north|south|orientation)/i.test(readText('src/forge/scenarios-v2.js'));

/* ------------------------------------------------------------------ 8–11. symmetry evidence */
const perTransform = Object.fromEntries(SYMMETRY_TRANSFORM_IDS.map((t) => {
  const e = symRows.map((r) => r.transforms[t]); const valid = e.filter((x) => x.valid);
  const notEq = valid.filter((x) => !x.optimalSetEquivariant);
  const tieBreak = notEq.filter((x) => x.replica?.optimalSetEquivariant).length;
  const legalArtifact = notEq.filter((x) => !x.replica?.optimalSetEquivariant && !x.legalEquivariant).length;
  const unexplained = notEq.filter((x) => !x.replica?.optimalSetEquivariant && x.legalEquivariant).length;
  const fidelity = valid.filter((x) => x.replicaFidelityT !== null);
  const missingTypes = {}; for (const x of valid) for (const ty of [...x.legalMissingTypes, ...x.legalExtraTypes]) missingTypes[ty] = (missingTypes[ty] ?? 0) + 1;
  return [t, {
    n: e.length, TRANSFORMATION_VALID_RATE: valid.length / e.length,
    LEGAL_SURFACE_EQUIVARIANT_RATE: rate(valid, (x) => x.legalEquivariant), legalMismatchActionTypes: missingTypes,
    OPTIMAL_SET_EQUIVARIANT_RATE: rate(valid, (x) => x.optimalSetEquivariant),
    OPTIMAL_SET_EQUIVARIANT_RATE_WHERE_LEGAL_EQUIVARIANT: rate(valid.filter((x) => x.legalEquivariant), (x) => x.optimalSetEquivariant),
    REGRET_EQUIVARIANT_RATE: rate(valid, (x) => x.regretMismatches === 0), regretActionPairsCompared: valid.reduce((s, x) => s + x.regretCompared, 0),
    regretActionPairMismatches: valid.reduce((s, x) => s + x.regretMismatches, 0), maxAbsRegretDiff: Math.max(0, ...valid.map((x) => x.maxAbsRegretDiff)),
    attribution: { notEquivariant: notEq.length, TIE_BREAK_ARTIFACT: tieBreak, LEGAL_SURFACE_ARTIFACT: legalArtifact, UNEXPLAINED: unexplained },
    FRAME_CONSISTENT_REPLICA_EQUIVARIANT_RATE: valid.length ? (valid.length - notEq.length + tieBreak) / valid.length : null,
    replicaFidelityT: { sampled: fidelity.length, exact: fidelity.filter((x) => x.replicaFidelityT).length },
    labels: { GREEDY_SAFE_EQUIVARIANT_RATE: rate(valid, (x) => x.greedySafeEquivariant === 1), GREEDY_SAFE_DISAGREEMENTS: valid.filter((x) => x.greedySafeEquivariant !== 1).length,
      HORIZON_CLASS_EQUIVARIANT_RATE: rate(valid, (x) => x.horizonClassEquivariant === 1), HORIZON_CLASS_DISAGREEMENTS: valid.filter((x) => x.horizonClassEquivariant !== 1).length },
  }];
}));
const identity = perTransform.IDENTITY;
const controls = {
  IDENTITY_REPRODUCES_RECORDS: identity.OPTIMAL_SET_EQUIVARIANT_RATE === 1 && identity.REGRET_EQUIVARIANT_RATE === 1 && identity.LEGAL_SURFACE_EQUIVARIANT_RATE === 1,
  GREEDY_SAFE_MATCHES_CORPUS_LABEL: symRows.every((r) => r.greedySafeMatchesCorpus === 1),
  REPLICA_FIDELITY_W: { sampled: symRows.filter((r) => r.replicaFidelityW !== null).length, exact: symRows.filter((r) => r.replicaFidelityW === true).length },
  REPLICA_FIDELITY_T_ALL_EXACT: NON_IDENTITY.every((t) => perTransform[t].replicaFidelityT.exact === perTransform[t].replicaFidelityT.sampled),
};
controls.REPLICA_FIDELITY_EXACT = controls.REPLICA_FIDELITY_W.exact === controls.REPLICA_FIDELITY_W.sampled && controls.REPLICA_FIDELITY_T_ALL_EXACT;
const summary = {
  TRANSFORMATION_VALID: NON_IDENTITY.every((t) => perTransform[t].TRANSFORMATION_VALID_RATE === 1),
  OPTIMAL_SET_EQUIVARIANT: NON_IDENTITY.every((t) => perTransform[t].OPTIMAL_SET_EQUIVARIANT_RATE >= 0.99),
  REGRET_EQUIVARIANT: NON_IDENTITY.every((t) => perTransform[t].REGRET_EQUIVARIANT_RATE >= 0.99),
  LEGAL_SURFACE_EQUIVARIANT: NON_IDENTITY.every((t) => perTransform[t].LEGAL_SURFACE_EQUIVARIANT_RATE >= 0.99),
  FRAME_CONSISTENT_ENVIRONMENT_EQUIVARIANT_AXIS_PRESERVING: AXIS_PRESERVING.every((t) => perTransform[t].FRAME_CONSISTENT_REPLICA_EQUIVARIANT_RATE >= 0.99),
  TIE_BREAK_ARTIFACT_SHARE_AXIS_PRESERVING: AXIS_PRESERVING.reduce((s, t) => s + perTransform[t].attribution.TIE_BREAK_ARTIFACT, 0) / (AXIS_PRESERVING.length * symRows.length),
  UNEXPLAINED_TOTAL: NON_IDENTITY.reduce((s, t) => s + perTransform[t].attribution.UNEXPLAINED, 0),
};

const policyEquivariance = Object.fromEntries(symManifest.policies.map((p) => {
  const byT = Object.fromEntries(NON_IDENTITY.map((t) => [t, rate(symRows.filter((r) => r.transforms[t].valid), (r) => r.transforms[t].policies[p].equivariant === 1)]));
  return [p, { byTransform: byT, IDENTITY: rate(symRows, (r) => r.transforms.IDENTITY.policies[p].equivariant === 1), minimum: Math.min(...Object.values(byT)),
    DIRECTIONALLY_BIASED: Math.min(...Object.values(byT)) < 0.95 }];
}));

const eastRotation = Object.fromEntries(NON_IDENTITY.map((t) => {
  const rows = symRows.filter((r) => r.transforms[t].valid && r.transforms[t].eastOptimalW === 1);
  const mapped = transformDirection(t, 'EAST');
  const rotates = rate(rows, (r) => r.transforms[t].mappedEastOptimalT === 1);
  const fixed = rate(rows, (r) => r.transforms[t].directionOptimalT.EAST === 1);
  const moveRowsT = symRows.filter((r) => r.transforms[t].valid && r.transforms[t].moveOptimalRowT === 1);
  return [t, { eastOptimalInW: rows.length, EAST_MAPS_TO: mapped, P_MAPPED_DIRECTION_OPTIMAL_IN_TW: rotates, P_EAST_STILL_OPTIMAL_IN_TW: fixed,
    DIRECTION_ROTATES_WITH_WORLD: mapped === 'EAST' ? null : rotates >= 0.9 && rotates - fixed >= 0.3,
    rotatedCorpus: { moveOptimalRows: moveRowsT.length,
      LOWEST_IDENTITY_MOVE_ACCURACY: rate(moveRowsT.filter((r) => r.transforms[t].lowestIdentityMoveOptimalT !== null), (r) => r.transforms[t].lowestIdentityMoveOptimalT === 1),
      lowestIdentityDirection: Object.fromEntries(DIRECTIONS.map((d) => [d, rate(moveRowsT, (r) => r.transforms[t].lowestIdentityMoveDirectionT === d)])),
      P_OPTIMAL_MOVE_OPTIMAL_ROWS: Object.fromEntries(DIRECTIONS.map((d) => [d, rate(moveRowsT, (r) => r.transforms[t].directionOptimalT[d] === 1)])) } }];
}));
const identityMoveRows = symRows.filter((r) => r.transforms.IDENTITY.moveOptimalRowT === 1);
const identityBaseline = { moveOptimalRows: identityMoveRows.length,
  LOWEST_IDENTITY_MOVE_ACCURACY: rate(identityMoveRows.filter((r) => r.transforms.IDENTITY.lowestIdentityMoveOptimalT !== null), (r) => r.transforms.IDENTITY.lowestIdentityMoveOptimalT === 1) };
const rotatingTransforms = NON_IDENTITY.filter((t) => eastRotation[t].DIRECTION_ROTATES_WITH_WORLD !== null);
const EAST_OPTIMALITY_ROTATES_WITH_WORLD = rotatingTransforms.every((t) => eastRotation[t].DIRECTION_ROTATES_WITH_WORLD === true);

/* ------------------------------------------------------------------ classification (frozen plan) */
const pg = placement.groups;
const asym = (g) => pg[g]?.ASYMMETRIC === true;
const locatedGeneratorAsymmetry = sourceAudit.some((f) => f.found && f.directional && f.owner === 'src/forge/scenarios-v2.js');
const components = {
  A_INTENTIONAL_TASK_PROPERTY: documentedDirectionalIntent,
  B_ACCIDENTAL_SCENARIO_GENERATION_ASYMMETRY: locatedGeneratorAsymmetry && Object.values(pg).some((g) => g.ASYMMETRIC),
  C_ACTION_IDENTITY_ORDERING_ARTIFACT: vocabulary.LOWEST_IDENTITY_MOVE_IS_EAST_WHEN_LEGAL
    && (summary.TIE_BREAK_ARTIFACT_SHARE_AXIS_PRESERVING > 0.01 || ['GREEDY', 'RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR_V2_CANDIDATE'].some((p) => policyEquivariance[p].DIRECTIONALLY_BIASED)),
  D_TOPOLOGY_ORIENTATION_ARTIFACT: asym('STRUCTURAL_TOPOLOGY_NODE') || asym('OBJECTIVE_CRITICAL') || asym('DEPENDENCY_HUB'),
  E_OBJECTIVE_RESOURCE_PLACEMENT_ARTIFACT: (asym('RESOURCE_MATERIAL_NEAR_ACTOR') || asym('RESOURCE_OTHER') || asym('OBJECTIVE_CRITICAL')) && EAST_OPTIMALITY_ROTATES_WITH_WORLD,
};
const held = Object.entries(components).filter(([, v]) => v).map(([k]) => k);
const primaryResult = held.length >= 2 ? 'F_MIXTURE' : held.length === 1 ? held[0] : 'NONE_ESTABLISHED';

/* ------------------------------------------------------------------ scope, tests, checks */
const gitClean = (...paths) => { const r = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths.map((p) => `platform/game-agnostic/${p}`)], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() === '' : false; };
const cert = (r) => readJson(r).certificationHash;
const scope = {
  stage3f6pIntact: cert('artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json') === '3cd670113c2ffd3ad40e1113b77d492943b226bfcdb1730c3b60a15de679a585',
  stage3f6p1Intact: cert('artifacts/stage3f6p1-nexus-remediation/stage3f6p1-certification-result.json') === '48462a169c88337a9f27315c3e10b83f615e077a8ba2dc6751fdf437351d31e4',
  stage3f6p1aIntact: cert('artifacts/stage3f6p1a-nexus-spatial/stage3f6p1a-certification-result.json') === 'c4029ff96e617341b448ae5d4f1853f6d21186134a64ce6162acc755394f40be',
  stage3f6aIntact: cert('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json') === '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca',
  historicalOwnersGitClean: gitClean('src/forge', 'src/lab/stage3c-learned-nexus.js', 'src/experts', 'src/stage3f/deployable-action-proposal-v1.js', 'src/stage3f/nexus-selector-v2-candidate.js',
    'src/stage3f/nexus-relational-spatial-context-v1.js', 'src/stage3f/policy-router-v1.js', 'artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered',
    'artifacts/stage3f6c-deployable-router', 'artifacts/stage3f6a-action-proposals', 'artifacts/stage3f6t-policy-router', 'artifacts/stage3f6w-risk-state', 'artifacts/stage3f6d-decision-rule',
    'artifacts/stage3f6p-policy-quality', 'artifacts/stage3f6p1-nexus-remediation', 'artifacts/stage3f6p1a-nexus-spatial', 'scripts/generate-stage3f6c-corpus.mjs'),
  policySetHashUnchanged: POLICY_SET_HASH === readJson('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json').policySet.hash,
  newOwners: ['src/stage3f/forge-symmetry-transform-v1.js', 'scripts/stage3f6p1b-analysis-plan.mjs', 'scripts/generate-stage3f6p1b-symmetry-evidence.mjs',
    'scripts/certify-stage3f6p1b-directional-symmetry.mjs', 'tests/stage3f6p1b-directional-symmetry.test.js'],
  existingOwnersModified: ['package.json', '.gitignore'],
  nexusModified: false, routerTrained: false, spatialFeaturesAdded: false, generatorsModified: false, historicalEvidenceModified: false,
};
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6p1b-directional-symmetry.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}
const checks = {
  PREDECESSORS_INTACT: scope.stage3f6pIntact && scope.stage3f6p1Intact && scope.stage3f6p1aIntact && scope.stage3f6aIntact,
  HISTORICAL_OWNERS_UNCHANGED: scope.historicalOwnersGitClean && scope.policySetHashUnchanged,
  PLAN_BEFORE_EVIDENCE: integrity.planFileMatchesPlan && integrity.evidenceBoundToPlan,
  DATA_INTEGRITY: integrity.symmetryEvidence && integrity.spatialEvidenceReadOnly && integrity.corpusSource && integrity.allDevEvaluated && integrity.devOnly,
  SOURCE_FINDINGS_LOCATED: sourceAudit.every((f) => f.found),
  DIRECTION_IDENTITY_PROVEN: vocabulary.LOWEST_IDENTITY_MOVE_IS_EAST_WHEN_LEGAL && vocabulary.actorIdAlwaysActor,
  IDENTITY_CONTROL: controls.IDENTITY_REPRODUCES_RECORDS && controls.GREEDY_SAFE_MATCHES_CORPUS_LABEL,
  REPLICA_FIDELITY: controls.REPLICA_FIDELITY_EXACT,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

const payload = {
  schemaVersion: 1, stage: plan.stage, status, planHash: STAGE3F6P1B_PLAN_HASH, transformContractHash: FORGE_SYMMETRY_TRANSFORM_CONTRACT_HASH, CONFIRMATORY_CLAIMS: false,
  integrity, vocabulary, distributions, placement, sourceAudit: { findings: sourceAudit, topologyHasNoGeometry, documentedDirectionalIntent },
  equivariance: { perTransform, controls, summary }, policyEquivariance, eastRotation: { identityBaseline, byTransform: eastRotation, EAST_OPTIMALITY_ROTATES_WITH_WORLD },
  diagnosis: { components, primaryResult, componentsHeld: held,
    eastOptimalitySource: EAST_OPTIMALITY_ROTATES_WITH_WORLD ? 'SCENARIO_PLACEMENT (rotates with the world)' : 'NOT_SCENARIO_PLACEMENT_ALONE',
    eastBaselineSource: vocabulary.LOWEST_IDENTITY_MOVE_IS_EAST_WHEN_LEGAL ? 'ACTION_IDENTITY_ORDERING (lowest key = EAST, fixed across worlds)' : 'NOT_IDENTITY_ORDERING' },
  truncatedMissionNote: 'the stage mission text was received only through Section 11; later sections, including the required report template, were not received',
  scope, checks, tests: testMetrics,
  sourceHashes: Object.fromEntries(scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))])),
  authority: plan.authority,
  roadmap: { READY_FOR_FRESH_NEXUS_CONFIRMATION: false, READY_FOR_ROUTER_RETRAIN: false, READY_FOR_STAGE3G: false },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = readJson(RESULT);
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6P1B_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), diagnosis: payload.diagnosis }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
