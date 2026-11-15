// Clean-clone reproducibility check, run INSIDE a fresh clone of the registration commit after the protected bound sources
// (untracked by project policy) are overlaid from the local byte-preserving package. Verifies identities and recomputes
// schedules and a 12-world development spot check of the O-2R.1 transform. Generates no registered world.
// Usage (from the clone's platform/game-agnostic/stage3h-owner-governed-v1): node clone-verify.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stableStringify, sha256 } from '../src/core/determinism.js';
import { schedule, scheduleHash } from './connector.mjs';
import { identityViewTwinV2 } from './identity-view-v2.mjs';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { hashWorld } from '../src/forge/kernel.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { combinations } from '../stage3h-canonical-v1/plan.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), GA = resolve(LANE, '..');
const J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8')), fsha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex');
const reg = J('registration/ACTIVE_REGISTRATION_V3.json'), cand = J('registration/REGISTRATION_CANDIDATE_V3.json');
const hashOf = (r) => { const { registrationHash: _h, ...b } = r; return sha256(stableStringify(b)); };
const contract = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8'));
const mismatched = Object.entries(reg.bindings.sources).filter(([p, h]) => fsha(p) !== h).map(([p]) => p);
const strings = (x, o = []) => { if (typeof x === 'string') o.push(x); else if (Array.isArray(x)) x.forEach((v) => strings(v, o)); else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, o)); return o; };
let spot = 0, spotOk = 0;
for (const c of combinations().map(({ panel, ...x }) => x).filter((_, i) => i % 24 === 0)) {
  spot++; const w = runCalibratedWarmup(c.seed, (t) => generateScenarioSymmetricV1({ ...c, warmupTicks: t })).world, before = hashWorld(w), v = observableView(w), o = identityViewTwinV2(v), handles = new Set(v.surface.map((e) => e.actionId));
  if (hashWorld(w) === before && !strings(o.view).some((s) => handles.has(s)) && o.view.semantics.every((s, i) => s.ACTION_ID === o.view.surface[i].actionId)) spotOk++;
}
const out = { registrationHashRecomputed: hashOf(reg) === reg.registrationHash, registrationHash: reg.registrationHash, candidateHashRecomputed: hashOf(cand) === cand.registrationHash && reg.activatesCandidate === cand.registrationHash,
  boundSources: Object.keys(reg.bindings.sources).length, boundSourceMismatches: mismatched, approvalRecordMatches: fsha(reg.ownerApproval.record.file) === reg.ownerApproval.record.sha256,
  scheduleHashesRecomputed: ['A', 'B'].every((r) => scheduleHash(schedule(contract.populations, reg.namespaces[r])) === reg.scheduleHashes[r]), o2r1SpotCheck: spotOk + '/' + spot, registeredWorldsGenerated: 0 };
out.verdict = out.registrationHashRecomputed && out.candidateHashRecomputed && mismatched.length === 0 && out.approvalRecordMatches && out.scheduleHashesRecomputed && spotOk === spot ? 'CLEAN_CLONE_REPRODUCIBLE' : 'CLEAN_CLONE_MISMATCH';
console.log(JSON.stringify(out, null, 1));
