// Clean-clone check of the ACTIVE successor registration, run INSIDE a fresh clone of the registration commit after the
// policy-protected bound sources are overlaid from the local byte-preserving package. Recomputes the registration and
// candidate hashes, every bound source, the approval and allocation records, both schedules, runner acceptance and the
// witness rejection. Generates no registered world. Usage (from the clone's lane): node clone-verify-activation-v4.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stableStringify, sha256 } from '../src/core/determinism.js';
import { schedule, scheduleHash } from './connector.mjs';
import { nativeRowV4 } from './connector-v4.mjs';
import { loadV4, V4_REGISTRATION } from './campaign-v4.mjs';
import { WITNESS } from './menu-validity-fixtures.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), GA = resolve(LANE, '..');
const J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8')), fsha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex');
const hashOf = (r) => { const { registrationHash: _h, ...b } = r; return sha256(stableStringify(b)); };
const reg = J('registration/ACTIVE_REGISTRATION_V4.json'), cand = J('registration/REGISTRATION_CANDIDATE_V4.json');
const contract = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8'));
const mismatched = Object.entries(reg.bindings.sources).filter(([p, h]) => !existsSync(resolve(GA, p)) || fsha(p) !== h).map(([p]) => p);
let runnerAccepts = false; try { runnerAccepts = loadV4(V4_REGISTRATION).registrationHash === reg.registrationHash; } catch { runnerAccepts = false; }
const w = nativeRowV4(WITNESS, { seen: new Set() });
const out = {
  registrationHashRecomputed: hashOf(reg) === reg.registrationHash, registrationHash: reg.registrationHash, status: reg.status,
  candidateHashRecomputed: hashOf(cand) === cand.registrationHash && reg.activatesCandidate === cand.registrationHash, boundSources: Object.keys(reg.bindings.sources).length, boundSourceMismatches: mismatched,
  approvalRecordMatches: fsha(reg.ownerApproval.record.file) === reg.ownerApproval.record.sha256, allocationRecordMatches: fsha(reg.namespaceAllocation.record.file) === reg.namespaceAllocation.record.sha256,
  scheduleHashesRecomputed: ['A', 'B'].every((r) => scheduleHash(schedule(contract.populations, reg.namespaces[r])) === reg.scheduleHashes[r]), namespaces: reg.namespaces,
  runnerAccepts, witnessRejected: w.rejected?.reason === 'NATIVE_MENU_INVALID' && w.rejected.invalidViews === 11,
  noExecutionAuthorization: !existsSync(resolve(LANE, 'registration/EXECUTION_AUTHORIZATION_V4.json')), noRunDirectory: !existsSync(resolve(LANE, 'runs', reg.registrationHash.slice(0, 16))), registeredWorldsGenerated: 0,
};
out.verdict = out.registrationHashRecomputed && out.status === 'ACTIVE_OWNER_GOVERNED' && out.candidateHashRecomputed && mismatched.length === 0 && out.approvalRecordMatches && out.allocationRecordMatches && out.scheduleHashesRecomputed && runnerAccepts && out.witnessRejected && out.noExecutionAuthorization && out.noRunDirectory ? 'CLEAN_CLONE_REPRODUCIBLE' : 'CLEAN_CLONE_MISMATCH';
console.log(JSON.stringify(out, null, 1));
