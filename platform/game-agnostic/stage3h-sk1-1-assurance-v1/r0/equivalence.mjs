// SK1.1 Phase 6 — behavioural equivalence of the assured envelope with the frozen SK1 decisions (evidence side; never
// imported by assured-api.mjs).
//
// Replays the PUBLIC request of every frozen SK1 VALIDATION class through the envelope and compares the result with the
// committed per-class record in stage3h-sk1-safety-kernel-v1/evidence/SK1_VALIDATION_RESULTS.json.
//   * This is decision replay, not evaluation: no world is generated, no outcome or evaluator truth is read
//     (`members[].truth` is never touched), no metric is computed and nothing is written.
//   * The class records are privileged local data (gitignored `work/`). In a clean checkout they are absent and the
//     replay reports UNAVAILABLE instead of failing.
//   * Only opaque aliases (SK1V-nnnn) leave this module.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPopulation } from '../../stage3h-sk1-safety-kernel-v1/infra/population.mjs';
import { forgeRequest } from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/features.mjs';
import { sha256 } from '../../stage3h-sk1-safety-kernel-v1/kernel/contract.mjs';
import { createAssuredApi, declarationFor, verifyEnvelope, SK1_LANE, AssuranceRejection } from './assured-api.mjs';

/** Provenance declared for the SK1 experiment's evidence: both experts were produced by the frozen Stage 3H development lock. */
export const SK1_EVIDENCE_SOURCES = Object.freeze({
  S0: Object.freeze({ producer: 'STAGE3H_FROZEN_DEV_LOCK_S0', projection: 'PUBLIC_SCORE' }),
  NEXUS: Object.freeze({ producer: 'STAGE3H_FROZEN_DEV_LOCK_NEXUS_ELSE_S0', projection: 'RECOMMENDATION_PROJECTION' }),
});
export const RESULT_FILE = resolve(SK1_LANE, 'evidence/SK1_VALIDATION_RESULTS.json');
export const validationDataPresent = () => existsSync(resolve(SK1_LANE, 'work/manifests/SK1_POPULATION_VALIDATION.json')) && existsSync(resolve(SK1_LANE, 'work/classes/VALIDATION'));
const sorted = (a) => [...a].sort((x, y) => x - y);

export function replayValidationThroughEnvelope() {
  if (!validationDataPresent()) return { available: false, reason: 'PRIVILEGED_VALIDATION_CLASS_RECORDS_ABSENT (clean checkout)' };
  const resultBytes = readFileSync(RESULT_FILE), stored = new Map(JSON.parse(resultBytes.toString('utf8')).perClass.map((p) => [p.id, p.sk1]));
  const { classes } = loadPopulation('VALIDATION', 'CHECK'), api = createAssuredApi({ game: 'forge' }), declaration = declarationFor('forge', SK1_EVIDENCE_SOURCES);
  const out = { available: true, resultSha256: sha256(resultBytes), classes: classes.length, served: 0, refusedByEnvelope: {}, decisionHashEqual: 0, kindEqual: 0, forcedSetEqual: 0, envelopeVerified: 0, recommend: 0, abstain: 0, mismatches: [] };
  const hashes = [];
  for (const c of classes) {
    const want = stored.get(c.id), r = forgeRequest(c.projection, c.evidence);
    let env;
    try { env = api.recommend(r.state, r.legalActions, r.advisoryEvidence, declaration); }
    catch (e) { if (!(e instanceof AssuranceRejection)) throw e; out.refusedByEnvelope[e.code] = (out.refusedByEnvelope[e.code] ?? 0) + 1; out.mismatches.push({ id: c.id, why: `REFUSED:${e.code}` }); continue; }
    out.served++;
    const d = env.record.recommendedActionOrAbstention, forced = sorted((d.kind === 'RECOMMEND' ? d.decisionSet : d.bestEffortNotRecommended?.decisionSet ?? []).map((a) => a.index));
    const okHash = env.decisionHash === want.decisionHash, okKind = d.kind === want.kind, okSet = JSON.stringify(forced) === JSON.stringify(sorted(want.forcedSet));
    out.decisionHashEqual += Number(okHash); out.kindEqual += Number(okKind); out.forcedSetEqual += Number(okSet); out.envelopeVerified += Number(verifyEnvelope(env).ok);
    out[d.kind === 'RECOMMEND' ? 'recommend' : 'abstain']++;
    if (!okHash || !okKind || !okSet) out.mismatches.push({ id: c.id, why: !okHash ? 'DECISION_HASH' : !okKind ? 'KIND' : 'FORCED_SET' });
    hashes.push([c.id, env.decisionHash]);
  }
  out.decisionDigest = sha256(JSON.stringify(hashes.sort((a, b) => (a[0] < b[0] ? -1 : 1))));
  out.equivalent = out.served === out.classes && out.decisionHashEqual === out.classes && out.kindEqual === out.classes && out.forcedSetEqual === out.classes && out.envelopeVerified === out.classes;
  out.mismatches = out.mismatches.slice(0, 10);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) console.log(JSON.stringify(replayValidationThroughEnvelope(), null, 1));
