// Diagnosis of evidence/o2r-gate.json (preserved, verdict O2R_GATE_FAIL) for candidate e70625d1. Development worlds only.
// Classifies each failing point and tests whether the unchanged fields can affect any frozen decision: the twin view is
// perturbed in exactly those fields and R/B/N selections are compared. Writes evidence/o2r-gate-diagnosis.json (wx).
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { nativeLock } from './connector.mjs';
import { identityViewTwin } from './identity-view.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const walk = (x, fn, p = '$') => { if (typeof x === 'string') fn('value', x, p); else if (Array.isArray(x)) x.forEach((v) => walk(v, fn, p + '[]')); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { fn('key', k, p + '.' + k); walk(v, fn, p + '.' + k); } };
const HASH_FIELDS = ['observation.metadata.worldHash', 'state.sourceStateHash', 'state.provenance.sourceStateHash'];
function scramble(view, handleMap) {
  const v = structuredClone(view), z = (s) => s.split('').reverse().join('');
  v.observation.metadata.worldHash = z(v.observation.metadata.worldHash); v.state.sourceStateHash = z(v.state.sourceStateHash);
  if (v.state.provenance) v.state.provenance.sourceStateHash = z(v.state.provenance.sourceStateHash);
  for (const e of v.state.entities ?? []) if (e.provenance) e.provenance.sourceStateHash = z(e.provenance.sourceStateHash);
  v.semantics = v.semantics.map((s) => ({ ...s, ACTION_ID: handleMap ? handleMap[s.ACTION_ID] : z(s.ACTION_ID), provenance: s.provenance ? { ...s.provenance, sourceStateHash: z(s.provenance.sourceStateHash) } : s.provenance }));
  return v;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane(), gate = JSON.parse(readFileSync(resolve(LANE, 'evidence/o2r-gate.json'), 'utf8'));
  const t = { worlds: 0, handleLeakWorlds: 0, handleLeakPaths: {}, nativeEntityIdsUnmapped: 0, nativeEntityIdSurvivors: 0, check4UncoveredValuesAreEntityIds: 0, check4UncoveredSample: new Set(), decisionsIdenticalWhenLeakedHandlesMadeConsistent: 0, decisionsIdenticalWhenFingerprintsScrambled: 0 };
  for (const c of openCombos().map(({ panel, ...x }) => x)) {
    t.worlds++;
    const world = runCalibratedWarmup(c.seed, (w) => generateScenarioSymmetricV1({ ...c, warmupTicks: w })).world, view = observableView(world), o = identityViewTwin(view), ents = new Set(world.entities.map((e) => e.id));
    const handles = new Set(view.surface.map((e) => e.actionId)); let leak = false;
    walk(o.view, (kind, s, p) => { if (kind === 'value' && handles.has(s)) { leak = true; t.handleLeakPaths[p] = (t.handleLeakPaths[p] ?? 0) + 1; } if (kind === 'value' && ents.has(s)) t.nativeEntityIdSurvivors++; });
    if (leak) t.handleLeakWorlds++;
    walk(view, (kind, s) => { if (kind === 'value' && ents.has(s) && !(s in o.entityMap)) t.nativeEntityIdsUnmapped++; });
    for (const f of gate.failures.filter((x) => x.seed === c.seed && x.check === '4_identifiersConsistentlyRenamed' && x.cell === [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/'))) for (const u of f.detail.uncovered) { if (ents.has(u)) t.check4UncoveredValuesAreEntityIds++; t.check4UncoveredSample.add(u); }
    const base = nativeLock(o.view, c.horizonBand).selections;
    const consistent = nativeLock({ ...o.view, semantics: o.view.semantics.map((s) => ({ ...s, ACTION_ID: o.actionMap[s.ACTION_ID] ?? s.ACTION_ID })) }, c.horizonBand).selections;
    if (JSON.stringify(consistent) === JSON.stringify(base)) t.decisionsIdenticalWhenLeakedHandlesMadeConsistent++;
    if (JSON.stringify(nativeLock(scramble(o.view, null), c.horizonBand).selections) === JSON.stringify(base)) t.decisionsIdenticalWhenFingerprintsScrambled++;
  }
  t.check4UncoveredSample = [...t.check4UncoveredSample].sort();
  const out = { schema: 'STAGE3H_OWNER_GOVERNED_O2R_GATE_DIAGNOSIS_V1', diagnoses: 'evidence/o2r-gate.json (preserved; verdict O2R_GATE_FAIL)', candidate: gate.candidate, inheritanceHead: inh.head, tallies: t,
    point4: t.nativeEntityIdsUnmapped === 0 && t.nativeEntityIdSurvivors === 0 && t.check4UncoveredValuesAreEntityIds === 0 ? 'CHECK_SPECIFICATION_ERROR: the flagged values are precondition codes in fields named id, not entity ids; every native entity id is renamed and none survives' : 'REAL_DEFECT',
    point5: t.handleLeakWorlds > 0 ? 'REAL_DEFECT: original action handles survive in semantics[].ACTION_ID, so twin handles are not opaque and semantics disagree with the surface' : 'NONE',
    decisionImpactOfPoint5: t.decisionsIdenticalWhenLeakedHandlesMadeConsistent === t.worlds ? 'NONE_OBSERVED: making ACTION_ID consistent changes no R/B/N selection in any development world (frozen contract: ACTION_ID is never a scoring input)' : 'DECISIONS_CHANGE',
    unchangedFingerprints: { fields: [...HASH_FIELDS, 'state.entities[].provenance.sourceStateHash', 'semantics[].provenance.sourceStateHash', 'schema hashes (identity-independent constants)'], status: 'pre-existing public provenance, not identifiers or handles', decisionInertness: t.decisionsIdenticalWhenFingerprintsScrambled + '/' + t.worlds + ' selections unchanged when scrambled' },
    candidateE70625d1: 'NUISANCE_CONTRACT_BLOCKED (point 5: handle opacity)', minimalCorrection: 'O-2R.1: apply the opaque handle map to every occurrence of an original action handle in the view (semantics[].ACTION_ID), exactly as entity ids are renamed everywhere; native world, truth and the V3 statistic unchanged', authority: 'R0' };
  writeExclusive(resolve(LANE, 'evidence/o2r-gate-diagnosis.json'), out);
  console.log(JSON.stringify({ point4: out.point4, point5: out.point5, impact: out.decisionImpactOfPoint5, fingerprints: out.unchangedFingerprints.decisionInertness, tallies: { ...t, check4UncoveredSample: t.check4UncoveredSample } }, null, 1));
}
