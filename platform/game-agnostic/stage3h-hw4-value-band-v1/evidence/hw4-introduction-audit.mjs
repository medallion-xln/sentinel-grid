// H-W4 introduction-class audit (READ-ONLY). Reconstructs, from the FROZEN validation records only, the 32
// INTRODUCTION_VS_S0 and 65 INTRODUCTION_VS_NEXUS classes behind the H-W4 zero-introduction gate failure.
// No validation is re-executed: the class-level chosen actions are read from evidence/HW4_VALIDATION_RESULTS.json
// (candidates[].decisions, V1 arm; asserted identical to V2), the chosen keyV2 tie-set orbit is rebuilt from the
// stored public projection, and the FROZEN evaluator (hw1-eval.mjs evalClass) scores the recorded member truths.
// PRIVILEGED INPUTS (local, gitignored — never committed): work/classes/VALIDATION/*.json carry per-member
// evaluator truth; evidence/HW4_POPULATION_VALIDATION.json carries seeds/worldHashes. Outputs (CSV/MD) expose no
// hidden health, value, seeds or per-world state; the alias->private-id map is written to work/val/ (gitignored).
//   /opt/homebrew/bin/node evidence/hw4-introduction-audit.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keysV2 } from '../../stage3h-hw1-dev-v1/public-projection.mjs';
import { evalClass } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';

const LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const srcHash = (p) => sha256(readFileSync(p));

// ---- frozen evidence ----
const res = JSON.parse(readFileSync(resolve(LANE, 'evidence/HW4_VALIDATION_RESULTS.json'), 'utf8'));
const freeze = JSON.parse(readFileSync(resolve(LANE, 'evidence/HW4_CANDIDATE_FREEZE.json'), 'utf8'));
const [v1, v2] = res.candidates;
if (v1.arm !== 'V1_PUBLIC_ONLY' || v2.arm !== 'V2_PUBLIC_PLUS_VALUE_BAND') throw Error('ARM_ORDER_UNEXPECTED');
let flips = 0; for (let i = 0; i < res.validationClasses; i++) if (v1.decisions[i] !== v2.decisions[i]) flips++;
if (flips !== 0) throw Error('V1_V2_DECISION_FLIP:' + flips);
if (v1.introClassesVsS0.length !== 32 || v1.introClassesVsNexus.length !== 65) throw Error('FROZEN_COUNT_UNEXPECTED');

// ---- class records (privileged, local) in manifest order (the order run() evaluated) ----
const man = JSON.parse(readFileSync(resolve(LANE, 'evidence/HW4_POPULATION_VALIDATION.json'), 'utf8'));
const order = man.classes.map((c) => c.id);
const recs = new Map();
for (const f of ['0','1','2','3','4','5','6','7'].map((i) => resolve(LANE, `work/classes/VALIDATION/range-0-600-shard-${i}-of-8.json`)))
  for (const c of JSON.parse(readFileSync(f, 'utf8')).classes) recs.set(c.id, c);
if (order.length !== 600 || recs.size !== 600) throw Error('CLASS_RECORD_COUNT:' + recs.size);

// ---- independent recompute with the frozen evaluator ----
const rows = [];
for (let i = 0; i < 600; i++) {
  const c = recs.get(order[i]); if (!c) throw Error('MISSING_RECORD:' + order[i]);
  const chosen = v1.decisions[i];
  const keys = keysV2(c.projection);
  const orbit = keys.map((k, j) => (k === keys[chosen] ? j : -1)).filter((j) => j >= 0);
  const r = evalClass(c, orbit);
  if (r.illegal) throw Error('ILLEGAL_REPLAY:' + c.id);
  const type = c.projection.menu[chosen]?.type ?? 'UNKNOWN';
  const horizon = (c.cell.match(/H(\d+)/) ?? [])[0] ?? 'H?';
  rows.push({ alias: `HW4-VAL-${String(i).padStart(3, '0')}`, id: c.id, family: c.family, cell: c.cell, horizon,
    chosenIndex: chosen, chosenType: type, chosenActionId: c.menu[chosen], orbitSize: orbit.length,
    introS0: r.introB, introNexus: r.introN, introS0Members: r.introBMembers, introNexusMembers: r.introNMembers,
    introS0Base: r.introBBase, introNexusBase: r.introNBase, members: r.members,
    chosenCatAny: r.catAny, chosenCatBase: r.catBase, equalsS0: r.equalsB, equalsNexus: r.equalsN,
    nreg: r.nreg, nregWorst: r.nregWorst, nregS0: r.nregB, nregNexus: r.nregN });
}

// ---- exact-count + source parity checks (stop on any mismatch) ----
const s0Set = rows.filter((r) => r.introS0), nexSet = rows.filter((r) => r.introNexus);
const frozenS0 = new Set(v1.introClassesVsS0), frozenNex = new Set(v1.introClassesVsNexus);
const recomputedS0 = new Set(s0Set.map((r) => r.id)), recomputedNex = new Set(nexSet.map((r) => r.id));
let parity = true;
for (const id of frozenS0) if (!recomputedS0.has(id)) { parity = false; console.error('S0_MISMATCH_RECOMPUTE_MISSING:' + id); }
for (const id of frozenNex) if (!recomputedNex.has(id)) { parity = false; console.error('NEXUS_MISMATCH_RECOMPUTE_MISSING:' + id); }
if (s0Set.length !== 32 || nexSet.length !== 65 || !parity) { console.error('HW4_INTRODUCTION_AUDIT_COUNT_MISMATCH'); process.exit(1); }

// ---- overlap + failure breakdown ----
const both = s0Set.filter((r) => r.introNexus), s0Only = s0Set.filter((r) => !r.introNexus), nexOnly = nexSet.filter((r) => !r.introS0);
const unique = [...s0Set, ...nexOnly], passBoth = 600 - unique.length;
if (s0Only.length + both.length !== 32 || nexOnly.length + both.length !== 65 || unique.length + passBoth !== 600) throw Error('SET_ARITHMETIC_FAIL');
const baseS0 = unique.filter((r) => r.introS0Base).length, baseNex = unique.filter((r) => r.introNexusBase).length;
const twinOnlyS0 = s0Set.filter((r) => !r.introS0Base).length, twinOnlyNex = nexSet.filter((r) => !r.introNexusBase).length;
const byType = (set, key) => { const m = {}; for (const r of set) m[r.chosenType] = (m[r.chosenType] ?? 0) + 1; return m; };
const moveS0 = s0Set.filter((r) => r.chosenType === 'MOVE').length, moveNex = nexSet.filter((r) => r.chosenType === 'MOVE').length;

// ---- CSV (shareable: alias, class id, action identity, flags, aggregates; NO seeds/worldHash/truth vectors) ----
const csvHead = 'alias,class_id,family,horizon,chosen_action_type,chosen_action_id,chosen_index,orbit_size,introduction_vs_s0,introduction_vs_nexus,intro_members_s0,intro_members_nexus,intro_on_base_s0,intro_on_base_nexus,chosen_catastrophe_any_member,chosen_catastrophe_base,equals_s0,equals_nexus,mean_nreg_chosen,worst_class_nreg,mean_nreg_s0,mean_nreg_nexus,v1_v2_decision_flip';
const csv = [csvHead, ...unique.map((r) => [r.alias, r.id, r.family, r.horizon, r.chosenType, r.chosenActionId, r.chosenIndex, r.orbitSize,
  r.introS0, r.introNexus, r.introS0Members, r.introNexusMembers, r.introS0Base, r.introNexusBase, r.chosenCatAny, r.chosenCatBase,
  r.equalsS0, r.equalsNexus, r.nreg.toFixed(6), r.nregWorst.toFixed(6), r.nregS0.toFixed(6), r.nregNexus.toFixed(6), 0].join(','))].join('\n') + '\n';
writeFileSync(resolve(LANE, 'evidence/HW4_INTRODUCTION_CLASSES.csv'), csv);

// ---- protected alias map (gitignored) ----
mkdirSync(resolve(LANE, 'work/val'), { recursive: true });
writeFileSync(resolve(LANE, 'work/val/introduction-class-alias-map.json'), JSON.stringify({
  labels: ['RESEARCH_ONLY_IDENTITY_JOIN', 'NOT_POLICY_INPUT', 'GITIGNORED'], generatedFrom: 'work/classes/VALIDATION (privileged)',
  map: unique.map((r) => { const c = recs.get(r.id); return { alias: r.alias, id: r.id, worldHash: c.worldHash, seed: c.seed }; })
}, null, 1));

// ---- MD tables ----
const fmt = (r) => `| ${r.alias} | ${r.id} | ${r.family} | ${r.horizon} | ${r.chosenType} | ${r.chosenActionId.slice(0, 12)}… | ${r.orbitSize} | ${r.introS0Members}/${r.members} | ${r.chosenCatBase ? 'base' : 'twin-only'} | ${r.nreg.toFixed(3)} | ${r.nregS0.toFixed(3)} | ${r.equalsS0 ? 'yes' : 'no'} |`;
const fmtN = (r) => `| ${r.alias} | ${r.id} | ${r.family} | ${r.horizon} | ${r.chosenType} | ${r.chosenActionId.slice(0, 12)}… | ${r.orbitSize} | ${r.introNexusMembers}/${r.members} | ${r.introNexusBase ? 'base' : 'twin-only'} | ${r.nreg.toFixed(3)} | ${r.nregNexus.toFixed(3)} | ${r.equalsNexus ? 'yes' : 'no'} |`;
const tableA = ['| alias | class | origin family | horizon | chosen action | action id | orbit | intro members (S0) | base/twin | nreg chosen | nreg S0 | equals S0 |', '|---|---|---|---|---|---|---|---|---|---|---|---|', ...s0Set.map(fmt)].join('\n');
const tableB = ['| alias | class | origin family | horizon | chosen action | action id | orbit | intro members (Nexus) | base/twin | nreg chosen | nreg Nexus | equals Nexus |', '|---|---|---|---|---|---|---|---|---|---|---|---|', ...nexSet.map(fmtN)].join('\n');
const tableC = ['| alias | class | chosen action | intro members S0 | intro members Nexus | base/twin | note |', '|---|---|---|---|---|---|---|',
  ...both.map((r) => `| ${r.alias} | ${r.id} | ${r.chosenType} | ${r.introS0Members}/${r.members} | ${r.introNexusMembers}/${r.members} | ${r.introS0Base ? 'base' : 'twin-only'} | catastrophic for both comparators |`)].join('\n');
const typesS0 = byType(s0Set), typesNex = byType(nexSet);
const typeRows = [...new Set([...Object.keys(typesS0), ...Object.keys(typesNex)])].map((t) => `| ${t} | ${typesS0[t] ?? 0} | ${typesNex[t] ?? 0} |`).join('\n');
const horS0 = {}, horNex = {}; for (const r of s0Set) horS0[r.horizon] = (horS0[r.horizon] ?? 0) + 1; for (const r of nexSet) horNex[r.horizon] = (horNex[r.horizon] ?? 0) + 1;
const md = `# H-W4 catastrophe-introduction class audit (DEV validation, read-only)

Source: frozen one-pass validation \`HW4_VALIDATION_RESULTS.json\` (sha256 ${srcHash(resolve(LANE, 'evidence/HW4_VALIDATION_RESULTS.json')).slice(0, 16)}…,
${res.validationClasses} classes, ${res.memberWorlds} member worlds, ${res.families} origin families, result \`${res.result}\`).
Chosen actions replayed from the frozen decision records; orbits rebuilt from the stored public projections; outcomes
scored with the FROZEN evaluator (\`hw1-eval.mjs\`). Recomputed failure sets match the sealed lists exactly
(CLASS_LEVEL_SOURCE_PARITY = true). No validation was re-executed; no policy was modified.
Research-only identities (alias ↔ worldHash/seed) live in gitignored \`work/val/introduction-class-alias-map.json\`.

Failure definition (frozen): potentialIntroduction(chosen orbit, comparator orbit, truth) — identical sets never
introduce; otherwise the chosen orbit holds a catastrophic action (regret ≥ 100 vs member best) while the comparator
orbit holds a non-catastrophic one, in ≥1 member world of the class. Class nreg = equal-weight member mean.

## Table A — all ${s0Set.length} S0 introduction classes

${tableA}

## Table B — all ${nexSet.length} Nexus-else-S0 introduction classes

Comparator semantics: Nexus abstention falls back to S0 (frozen Nexus-else-S0); the class record's N orbit already
encodes the effective comparator decision. No raw-Nexus comparison is made on abstention worlds.

${tableB}

## Table C — overlapping classes (fail against BOTH comparators): ${both.length}

${tableC}

## Table D — failure breakdown

Sets: S0_ONLY=${s0Only.length}, NEXUS_ONLY=${nexOnly.length}, BOTH=${both.length}, UNIQUE=${unique.length}, PASS_BOTH=${passBoth} (checks: ${s0Only.length}+${both.length}=32 ✓; ${nexOnly.length}+${both.length}=65 ✓; ${unique.length}+${passBoth}=600 ✓).

Chosen-action family (counts of classes):

| action family | vs S0 | vs Nexus |
|---|---|---|
${typeRows}

Base-world vs twin-only: base failures S0 ${baseS0}/${s0Set.length}, Nexus ${baseNex}/${nexSet.length}; twin-only S0 ${twinOnlyS0}, Nexus ${twinOnlyNex}. Horizon split: S0 ${JSON.stringify(horS0)}, Nexus ${JSON.stringify(horNex)}.

## Interpretation

1. **Native action selection failure (the gate failure itself).** In every audited class the C10 chosen orbit holds at
   least one catastrophic action (member regret ≥ 100) while the comparator's orbit does not, in the listed member
   count. This is the frozen introduction predicate — no interpretation beyond it is claimed.
2. **Hidden-state-dependent safety.** Classes marked twin-only are safe on the base world and catastrophic only on
   public-content-equivalent twins: the introduced catastrophe depends on hidden state the public contract cannot
   distinguish. Base-failure classes are unsafe at the decision time base world itself.
3. **Comparator-specific differences.** ${both.length} classes are catastrophic against both comparators (the chosen
   action is regret-dominated in some member regardless of comparator); ${s0Only.length} fail only against S0 and
   ${nexOnly.length} only against Nexus-else-S0 — comparator identity matters for the residual tail.
4. **Horizon effects.** H0 vs H2 splits are recorded in Table D; the failure counts are dominated by the H2 screen rule
   population (the screen admitted stress classes primarily at H2), so horizon comparisons are confounded with
   population composition and are NOT causal claims.
5. **Base vs twin risk.** Twin-only failures dominate or not as recorded above; where twin-only, the base world is safe
   and the failure is a twin risk — consistent with prior stages (H-W1/H-W3) and chaotic member outcomes.
6. **Action tie handling.** orbit_size ${'>'} 1 marks classes where the chosen action's keyV2 tie-set (equivalent
   actions) was non-trivial; the frozen rule scores the whole orbit (worst case for catastrophe, uniform expectation for
   regret). equals_s0/equals_nexus mark classes where the chosen orbit is identical to the comparator's (never
   introducing by definition — none appear in these tables by construction unless tie-adjacent members differ).
7. **Candidate fallback behavior.** None: V1 and V2 have ZERO decision differences (600/600 identical chosen actions,
   ${flips} flips), so no candidate-fallback asymmetry exists. Every failure below is a property of the shared C10
   policy, NOT of the value band — none of this is evidence of a V2-specific safety benefit or harm.

V1_V2_DECISION_FLIPS=${flips}; V1_V2_SAFETY_EFFECT=0; ZERO_ILLEGAL_ACTIONS=true (0/28,800 audit decisions; 600/600 replay decisions legal).

## Source identities

- HW4_VALIDATION_RESULTS.json sha256: ${srcHash(resolve(LANE, 'evidence/HW4_VALIDATION_RESULTS.json'))}
- HW4_CANDIDATE_FREEZE.json sha256: ${srcHash(resolve(LANE, 'evidence/HW4_CANDIDATE_FREEZE.json'))}
- HW4_REGISTRY_EXPLORATION.json sha256: ${srcHash(resolve(LANE, 'evidence/HW4_REGISTRY_EXPLORATION.json'))}
- HW4_REGISTRY_VALIDATION.json sha256: ${srcHash(resolve(LANE, 'evidence/HW4_REGISTRY_VALIDATION.json'))}
- HW4_NAMESPACE_ALLOCATION.json sha256: ${srcHash(resolve(LANE, 'evidence/HW4_NAMESPACE_ALLOCATION.json'))}
- Freeze record sha256 (self-recorded): ${res.freezeRecordSha256}
- Validation class records: work/classes/VALIDATION range-0-600-shard-{0..7}-of-8.json (privileged, gitignored; sha256 per shard in HW4_INTRODUCTION_AUDIT_MANIFEST.json)
- Member worlds: 39,732 across 600 classes; truths are offline evaluator releases and are NOT reproduced in this report.
`;
writeFileSync(resolve(LANE, 'evidence/HW4_INTRODUCTION_AUDIT.md'), md);

// ---- manifest with artifact + source hashes ----
const manifest = { schema: 'STAGE3H_HW4_INTRODUCTION_AUDIT_MANIFEST_V1', labels: ['RESEARCH_ONLY', 'NOT_POLICY_INPUT'],
  counts: { VALIDATION_CLASSES: 600, S0_INTRODUCTION_CLASSES: s0Set.length, NEXUS_INTRODUCTION_CLASSES: nexSet.length,
    S0_ONLY: s0Only.length, NEXUS_ONLY: nexOnly.length, BOTH_COMPARATORS: both.length, UNIQUE_FAILURE_CLASSES: unique.length,
    PASS_BOTH: passBoth, BASE_FAILURE_CLASSES_S0: baseS0, BASE_FAILURE_CLASSES_NEXUS: baseNex,
    TWIN_ONLY_FAILURE_CLASSES_S0: twinOnlyS0, TWIN_ONLY_FAILURE_CLASSES_NEXUS: twinOnlyNex,
    MOVE_FAILURES_VS_S0: moveS0, MOVE_FAILURES_VS_NEXUS: moveNex, PROTECT_FAILURES_VS_S0: typesS0.PROTECT ?? 0,
    PROTECT_FAILURES_VS_NEXUS: typesNex.PROTECT ?? 0, RESTORE_FAILURES_VS_S0: typesS0.RESTORE ?? 0,
    RESTORE_FAILURES_VS_NEXUS: typesNex.RESTORE ?? 0, RETREAT_FAILURES_VS_S0: typesS0.RETREAT ?? 0,
    RETREAT_FAILURES_VS_NEXUS: typesNex.RETREAT ?? 0, BYPASS_FAILURES_VS_S0: typesS0.BYPASS ?? 0,
    BYPASS_FAILURES_VS_NEXUS: typesNex.BYPASS ?? 0, V1_V2_DECISION_FLIPS: flips },
  artifacts: { csv: sha256(Buffer.from(csv)), md: sha256(Buffer.from(md)), script: srcHash(fileURLToPath(import.meta.url)) },
  sources: { validationResults: srcHash(resolve(LANE, 'evidence/HW4_VALIDATION_RESULTS.json')),
    candidateFreeze: srcHash(resolve(LANE, 'evidence/HW4_CANDIDATE_FREEZE.json')),
    registryExploration: srcHash(resolve(LANE, 'evidence/HW4_REGISTRY_EXPLORATION.json')),
    registryValidation: srcHash(resolve(LANE, 'evidence/HW4_REGISTRY_VALIDATION.json')),
    namespaceAllocation: srcHash(resolve(LANE, 'evidence/HW4_NAMESPACE_ALLOCATION.json')),
    classShards: Object.fromEntries(['0','1','2','3','4','5','6','7'].map((i) => [`range-0-600-shard-${i}-of-8.json`,
      srcHash(resolve(LANE, `work/classes/VALIDATION/range-0-600-shard-${i}-of-8.json`))])) } };
writeFileSync(resolve(LANE, 'evidence/HW4_INTRODUCTION_AUDIT_MANIFEST.json'), JSON.stringify(manifest, null, 1));
console.log(JSON.stringify(manifest.counts, null, 1));
console.log('HW4_INTRODUCTION_AUDIT_COMPLETE');
