#!/usr/bin/env node
// Confirms that a re-run after non-behavioural changes reproduced every episode exactly (action-sequence and final-state hashes).
import { readFileSync, writeFileSync } from 'node:fs';
const games = ['pong', 'platformer', 'fighter', 'racing'], out = { schema: 'ASCII_WORLDS_2_RERUN_VERIFICATION_V1', games: {} };
for (const g of games) {
  const a = JSON.parse(readFileSync(new URL(`../results/run1/eval-${g}.json`, import.meta.url))), b = JSON.parse(readFileSync(new URL(`../results/eval-${g}.json`, import.meta.url)));
  const ea = [...a.episodes, ...a.phase5], eb = [...b.episodes, ...b.phase5];
  out.games[g] = { compared: ea.length, sameCount: ea.length === eb.length, identicalActionSequences: ea.filter((e, i) => eb[i]?.actionSequenceHash === e.actionSequenceHash).length,
    identicalFinalStates: ea.filter((e, i) => eb[i]?.finalStateHash === e.finalStateHash).length, run1SourceClosure: a.provenance.sourceClosureHash, run2SourceClosure: b.provenance.sourceClosureHash,
    preregistrationUnchanged: a.preregistrationSha256 === b.preregistrationSha256 };
}
out.allIdentical = Object.values(out.games).every(x => x.sameCount && x.identicalActionSequences === x.compared && x.identicalFinalStates === x.compared && x.preregistrationUnchanged);
writeFileSync(new URL('../results/rerun-verification.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
