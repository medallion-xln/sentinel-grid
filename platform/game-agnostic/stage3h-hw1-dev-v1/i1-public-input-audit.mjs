// H-W1 I-1 public-input audit driver (R0, DEV fixtures only: the 341 spent classes are development fixtures, not independent evidence).
//   node i1-public-input-audit.mjs worker <i> <n>     audit classes k with k % n == i, write work/i1/shard-<i>-of-<n>.json (git-ignored)
//   node i1-public-input-audit.mjs aggregate [--write] merge shards, run the synthetic controls, evaluate every gate, record evidence/I1_PUBLIC_INPUT_AUDIT.json only if all pass
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { candidates } from '../stage3h-safety-feasibility-v1/search.mjs';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { PROJECTION_VERSION, KEY_VERSION, READ_PATHS, EXCLUDED_FIELDS } from './public-projection.mjs';
import { auditClass, BYPASS_TARGETS } from './i1-audit-class.mjs';
import { LEAKS } from './i1-audit-checks.mjs';
import { syntheticControls } from './i1-audit-synthetic.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), WORK = resolve(LANE, 'work/i1'), [mode, a, b] = process.argv.slice(2);
const sha = (f) => createHash('sha256').update(readFileSync(resolve(LANE, f))).digest('hex');

if (mode === 'worker') {
  const i = Number(a), n = Number(b), out = []; mkdirSync(WORK, { recursive: true });
  candidates().forEach((c, k) => { if (k % n === i) out.push({ ord: k, ...auditClass(c) }); });
  writeExclusive(resolve(WORK, `shard-${i}-of-${n}.json`), out);
  console.log(`shard ${i}/${n}: ${out.length} classes`);
} else if (mode === 'aggregate') {
  const total = candidates().length, rows = readdirSync(WORK).filter((f) => f.startsWith('shard-')).flatMap((f) => JSON.parse(readFileSync(resolve(WORK, f), 'utf8'))).sort((x, y) => x.ord - y.ord);
  if (rows.length !== total || rows.some((r, k) => r.ord !== k)) throw Error(`SHARDS_INCOMPLETE ${rows.length}/${total}`);
  const gates = [], gate = (name, pass, detail) => gates.push({ name, pass: Boolean(pass), detail });
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0), kinds = ['RELABEL', 'MENU', 'D4', 'HIDDEN'];
  const keyTot = Object.fromEntries(kinds.map((k) => [k, { twins: sum((r) => r.keys[k]?.twins ?? 0), pairs: sum((r) => r.keys[k]?.n ?? 0), realFailures: sum((r) => r.keys[k]?.real ?? 0) }]));
  const leakTot = Object.fromEntries(Object.keys(LEAKS).map((l) => [l, Object.fromEntries(kinds.map((k) => [k, sum((r) => r.keys[k]?.leaks[l] ?? 0)]))]));

  // field roles
  const kindRes = {}; rows.forEach((r) => r.fields.resourceByKind.forEach((s) => { const [k, v] = s.split(':'); (kindRes[k] ??= new Set()).add(v); }));
  const prov = new Set(rows.flatMap((r) => r.fields.provenanceConstants)), ticks = [...new Set(rows.map((r) => r.fields.tick))].sort((x, y) => x - y);
  const fields = { resourceFlag: { valuesByKind: Object.fromEntries(Object.entries(kindRes).map(([k, v]) => [k, [...v].sort()])), functionOfEntityKind: Object.values(kindRes).every((v) => v.size === 1), relabelInvariant: sum((r) => r.proj.RELABEL.bad) === 0 },
    observationTimestamp: { equalsObservationTick: rows.every((r) => r.fields.tick === r.fields.timestamp && r.fields.entityTimestampEqualsTick), distinctValuesAcrossClasses: ticks },
    provenance: { logicalTimeEqualsTick: rows.every((r) => r.fields.logicalTimeEqualsTick), digestIsStateHashOfView: rows.every((r) => r.fields.digestIsStateHash), constantFieldsDistinct: prov.size,
      digestDiffersAcrossHiddenTwins: sum((r) => r.proj.HIDDEN?.digestDiffers ?? 0), hiddenTwins: sum((r) => r.proj.HIDDEN?.n ?? 0), digestDiffersUnderD4: leakTot.SOURCE_STATE_HASH.D4 > 0 },
    sequence: { distinctValues: [...new Set(rows.map((r) => r.fields.sequence))], observerIdValues: [...new Set(rows.map((r) => r.fields.observerId))] } };
  gate('RESOURCEFLAG_IS_FUNCTION_OF_KIND_AND_RELABEL_INVARIANT', fields.resourceFlag.functionOfEntityKind && fields.resourceFlag.relabelInvariant, fields.resourceFlag);
  gate('OBSERVATION_TIMESTAMP_IS_THE_TICK_CLOCK', fields.observationTimestamp.equalsObservationTick && fields.provenance.logicalTimeEqualsTick, fields.observationTimestamp);
  gate('PROVENANCE_IS_DIGEST_PLUS_CONSTANTS', fields.provenance.digestIsStateHashOfView && fields.provenance.constantFieldsDistinct === 1, fields.provenance);
  gate('SEQUENCE_IS_CONSTANT', fields.sequence.distinctValues.length === 1 && fields.sequence.observerIdValues.length === 1, fields.sequence);

  // projection, key regression and collisions
  gate('PROJECTION_READS_ONLY_ALLOWLIST', rows.every((r) => r.unallowed.length === 0), { allowlistPaths: READ_PATHS.length, classes: rows.length });
  gate('KEYV1_EQUALS_SEMANTICKEY_BYTES', sum((r) => r.v1Bad) === 0, { actions: sum((r) => r.menu) });
  const bypass = BYPASS_TARGETS.map(([set, idx]) => rows.find((r) => r.set === set && r.idx === idx)?.bypass ? { set, idx, ...rows.find((r) => r.set === set && r.idx === idx).bypass } : { set, idx, missing: true });
  gate('KEYV2_RESOLVES_ALL_THREE_BYPASS_COLLISIONS', bypass.length === 3 && bypass.every((x) => !x.missing && x.keyV1Groups.some((g) => g.type === 'BYPASS') && x.keyV2Groups === 0 && x.keyV2Distinct), bypass);
  gate('KEYV1_COLLIDING_CLASSES_ARE_EXACTLY_THE_THREE', rows.filter((r) => r.dupV1 > 0).length === 3 && rows.filter((r) => r.dupV1 > 0).every((r) => BYPASS_TARGETS.some(([s, i]) => s === r.set && i === r.idx)), { keyV1CollidingClasses: rows.filter((r) => r.dupV1 > 0).map((r) => `${r.set}:${r.idx}`) });
  gate('KEYV2_UNIQUE_WITHIN_EVERY_SPENT_MENU', sum((r) => r.dupV2) === 0, { classes: rows.length });

  // invariance
  for (const k of kinds) gate(`KEYV2_INVARIANT_UNDER_${k}`, keyTot[k].realFailures === 0 && keyTot[k].pairs > 0, keyTot[k]);
  gate('PROJECTION_IDENTICAL_UNDER_RELABEL_AND_HIDDEN_TWINS', sum((r) => (r.proj.RELABEL?.bad ?? 0) + (r.proj.HIDDEN?.bad ?? 0)) === 0, { relabelTwins: sum((r) => r.proj.RELABEL.n), hiddenTwins: sum((r) => r.proj.HIDDEN?.n ?? 0), hiddenNonEquivalentSkipped: sum((r) => r.hiddenNonEquivalent) });
  const d4 = { lawfulTwins: sum((r) => r.d4Lawful), unlawfulTwins: sum((r) => r.d4Unlawful) };
  gate('D4_TWINS_ALL_LAWFUL_ON_AUDITED_CLASSES', d4.unlawfulTwins === 0, d4);
  const canon = { comparisons: sum((r) => r.canon.n), failures: sum((r) => r.canon.bad) };
  gate('CANONICAL_FRAME_AND_ORBITS_INVARIANT', canon.failures === 0 && canon.comparisons > 0, canon);

  // negative controls: every forbidden component and every naive tie-break must be caught; the real key and the I-1 selector must not be
  const caught = Object.fromEntries(Object.entries(leakTot).map(([l, t]) => [l, Object.entries(t).filter(([, c]) => c > 0).map(([k]) => k)]));
  gate('EVERY_IDENTITY_NEGATIVE_CONTROL_DETECTED', Object.values(caught).every((c) => c.length > 0), { detectedBy: caught, failures: leakTot });
  const selTot = {}; for (const r of rows) for (const [name, byKind] of Object.entries(r.select)) for (const [k, q] of Object.entries(byKind)) { const t = ((selTot[name] ??= {})[k] ??= { n: 0, bad: 0 }); t.n += q.n; t.bad += q.bad; }
  const selBad = (sel) => Object.entries(selTot).filter(([n]) => n.startsWith(sel + '/')).reduce((s, [, v]) => s + Object.values(v).reduce((x, q) => x + q.bad, 0), 0);
  gate('EQUIVARIANT_SELECTOR_HAS_ZERO_FAILURES', selBad('EQUIVARIANT') === 0, { totals: Object.fromEntries(Object.entries(selTot).filter(([n]) => n.startsWith('EQUIVARIANT/'))) });
  gate('NAIVE_TIEBREAKS_DETECTED', selBad('LEXICAL_KEYV2') > 0 && selBad('MENU_FIRST') > 0 && selBad('HANDLE_ALPHABETICAL') > 0, { lexicalKeyV2: selBad('LEXICAL_KEYV2'), menuFirst: selBad('MENU_FIRST'), handleAlphabetical: selBad('HANDLE_ALPHABETICAL') });

  // symmetry
  const sym = { classes: rows.length, symmetric: rows.filter((r) => r.sym.symmetric).length, nontrivialStabiliser: rows.filter((r) => r.sym.stabiliser.length > 1).length, nontrivialOrbitClasses: rows.filter((r) => r.sym.nontrivialOrbits > 0).length,
    nodeColoursNotDiscrete: rows.filter((r) => !r.sym.discrete).length, waitFixedEverywhere: rows.every((r) => r.sym.waitFixed), isoFailed: sum((r) => r.sym.isoFailed), fixedActionsMin: Math.min(...rows.map((r) => r.sym.fixed)), tieRates: { CONSTANT: 1, TYPE: rows.filter((r) => r.ties.TYPE > 1).length, COST: rows.filter((r) => r.ties.COST > 1).length } };
  gate('SYMMETRY_SEARCH_COMPLETE_AND_WAIT_ALWAYS_FIXED', sym.isoFailed === 0 && sym.waitFixedEverywhere && sym.fixedActionsMin >= 1, sym);
  const synth = syntheticControls(), sv = Object.values(synth);
  gate('SYNTHETIC_SYMMETRIC_ORBITS_SELECT_ONE_FIXED_ACTION_EQUIVARIANTLY', sv.every((c) => c.structureAsExpected && Object.entries(c.selectors).filter(([k]) => k.startsWith('EQUIVARIANT/')).every(([, q]) => q.chosenIsFixed && q.d4Bad === 0 && q.permBad === 0)),
    Object.fromEntries(sv.map((c) => [c.name, { stabiliser: c.stabiliser, orbitSizes: c.orbitSizes, fixed: c.fixed, equivariantChoice: c.selectors['EQUIVARIANT/TYPE'].chosen, preferredActionInNontrivialOrbit: c.preferredInNontrivialOrbit }])));
  gate('SYNTHETIC_NAIVE_SELECTORS_CAUGHT', sv.some((c) => Object.entries(c.selectors).some(([k, q]) => !k.startsWith('EQUIVARIANT/') && (!q.chosenIsFixed || q.d4Bad || q.permBad))), Object.fromEntries(sv.map((c) => [c.name, Object.fromEntries(Object.entries(c.selectors).filter(([k]) => !k.startsWith('EQUIVARIANT/')).map(([k, q]) => [k, `fixed=${q.chosenIsFixed} d4=${q.d4Bad}/${q.d4N} perm=${q.permBad}/${q.permN}`]))])));

  // comparators
  const cmpTot = {}; for (const r of rows) for (const [k, q] of Object.entries(r.comparators)) { const t = (cmpTot[k] ??= { n: 0, maxScoreDiff: 0 }); for (const [f, v] of Object.entries(q)) { if (f === 'maxScoreDiff') t.maxScoreDiff = Math.max(t.maxScoreDiff, v); else t[f] = (t[f] ?? 0) + v; } }
  const stable = (f) => Object.values(cmpTot).every((t) => t[f] === t.n), pick = Object.fromEntries(Object.entries(cmpTot).map(([k, t]) => [k, { n: t.n, exact: t.nexusPickExact, keyV2: t.nexusPickKeyV2 }]));
  gate('S0_AND_NEXUS_ABSTENTION_AND_CODES_STABLE_AT_KEY_LEVEL', ['s0TopSet', 's0ScoresExact', 'nexusAbstain', 'nexusCodes'].every(stable), cmpTot);
  const nexus = { pickStableUnderEveryTransform: stable('nexusPickExact'), pickKeyV2StableUnderEveryTransform: stable('nexusPickKeyV2'), selNStable: stable('selN'), byTransform: pick };
  const verdict = nexus.pickKeyV2StableUnderEveryTransform ? 'NEXUS_PICK_STABLE_AT_KEYV2' : 'NEXUS_EXACT_PICK_INADMISSIBLE_AS_FEATURE';
  const out = { schema: 'STAGE3H_HW1_I1_PUBLIC_INPUT_AUDIT_V1', authority: 'R0', checkedAt: new Date().toISOString(), head: execFileSync('/usr/bin/git', ['-C', resolve(LANE, '../../..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    note: 'DEV fixtures only: the 341 spent classes are not independent evidence.', projectionVersion: PROJECTION_VERSION, keyVersion: KEY_VERSION, classes: rows.length, actions: sum((r) => r.menu), sourceHashes: Object.fromEntries(['public-projection.mjs', 'transforms.mjs', 'i1-audit-checks.mjs', 'i1-audit-class.mjs', 'i1-audit-comparators.mjs', 'i1-audit-synthetic.mjs', 'i1-public-input-audit.mjs'].map((f) => [f, sha(f)])),
    excludedFields: EXCLUDED_FIELDS, fields, keyInvariance: keyTot, negativeControls: { leaks: leakTot, naiveSelectors: Object.fromEntries(Object.entries(selTot).filter(([n]) => !n.startsWith('EQUIVARIANT/'))) }, symmetry: sym, synthetic: synth, comparators: { totals: cmpTot, nexus, verdict },
    gates, allPass: gates.every((g) => g.pass), classTable: rows.map((r) => [r.set, r.idx, r.menu, r.nodes, r.sym.symmetric ? 1 : 0]) };
  console.log(JSON.stringify({ allPass: out.allPass, verdict, failed: gates.filter((g) => !g.pass).map((g) => ({ name: g.name, detail: g.detail })), sym, nexus: { ...nexus, byTransform: pick }, keyTot, caught }, null, 1));
  if (process.argv.includes('--write')) { if (!out.allPass) throw Error('I1_AUDIT_NOT_PASSING_NOT_RECORDED'); writeExclusive(resolve(LANE, 'evidence/I1_PUBLIC_INPUT_AUDIT.json'), out); console.log('recorded evidence/I1_PUBLIC_INPUT_AUDIT.json'); }
} else throw Error('USAGE: node i1-public-input-audit.mjs worker <i> <n> | aggregate [--write]');
