// SK1 supplement — introductions measured with the frozen H-W4 C10 policy AS THE COMPARATOR.
// POST HOC and DESCRIPTIVE: this statistic was requested in the owner's result schema but was not one of the outputs
// prespecified in SK1_DESIGN_FREEZE.md. It uses the frozen introduction predicate and the decisions already stored in
// SK1_VALIDATION_RESULTS.json; no decision is recomputed, nothing is selected, and it changes no gate or classification.
//   /opt/homebrew/bin/node analysis/supplement-vs-c10.mjs [--write]
import { resolve } from 'node:path';
import { evalClass } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { loadPopulation, RESULT_FILE } from '../infra/population.mjs';
import { EVIDENCE, readJ, fileSha, writeExclusive } from '../infra/common.mjs';

const res = readJ(RESULT_FILE), { classes } = loadPopulation('VALIDATION', 'CHECK'), by = new Map(res.perClass.map((p) => [p.id, p]));
const vs = (cls, cand, comp) => evalClass({ ...cls, B: comp, N: comp }, cand); // introB = introduction of cand against comp
let forced = 0, forcedBase = 0, decided = 0, decidedN = 0, reverse = 0, reverseDecided = 0, identical = 0;
for (const c of classes) { const p = by.get(c.id), a = vs(c, p.sk1.forcedSet, p.c10.set), b = vs(c, p.c10.set, p.sk1.forcedSet);
  if (a.equalsB) identical++; if (a.introB) { forced++; if (a.introBBase) forcedBase++; } if (b.introB) reverse++;
  if (p.sk1.kind === 'RECOMMEND') { decidedN++; if (a.introB) decided++; if (b.introB) reverseDecided++; } }
const out = { schema: 'SK1_SUPPLEMENT_VS_C10_V1', authority: 'R0', stage: 'STAGE3H-SK1', labels: ['POST_HOC', 'DESCRIPTIVE', 'NOT_A_GATE', 'OWNER_REQUESTED_FIELD'], generatedAt: new Date().toISOString(), resultSha256: fileSha(RESULT_FILE), classes: classes.length,
  definition: 'class-level introduction of policy X against policy Y: X is catastrophic in at least one member world where Y is not (identical decision sets never introduce)',
  sk1ForcedChoiceIntroducesAgainstC10: { classes: forced, onBaseWorld: forcedBase }, c10IntroducesAgainstSk1ForcedChoice: { classes: reverse },
  sk1AsSpecifiedIntroducesAgainstC10: { classes: decided, decidedClasses: decidedN }, c10IntroducesAgainstSk1OnDecidedClasses: { classes: reverseDecided, decidedClasses: decidedN }, identicalDecisionSets: identical };
console.log(JSON.stringify(out, null, 1));
if (process.argv.includes('--write')) { writeExclusive(resolve(EVIDENCE, 'SK1_SUPPLEMENT_VS_C10.json'), out); console.log('written evidence/SK1_SUPPLEMENT_VS_C10.json'); }
