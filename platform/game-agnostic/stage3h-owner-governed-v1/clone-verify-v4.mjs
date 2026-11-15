// Clean-clone check for the SUCCESSOR CANDIDATE, run INSIDE a fresh clone of the commit that contains
// registration/REGISTRATION_CANDIDATE_V4.json, after the policy-protected bound sources (untracked by project policy) are
// overlaid from the local byte-preserving package. Recomputes the candidate and predecessor hashes, every bound source
// hash, the witness rejection, a 1-in-50 replay of the spent-world menu scan against the bound records, and the fixtures.
// Generates no registered world, allocates nothing, activates nothing. Usage (from the clone's lane): node clone-verify-v4.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stableStringify, sha256 } from '../src/core/determinism.js';
import { hashWorld } from '../src/forge/kernel.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { nativeRowV4, policyFacingViews, CONNECTOR_V4_ID } from './connector-v4.mjs';
import { validatePolicyFacingViews } from './menu-validity-v1.mjs';
import { runFixtures, WITNESS } from './menu-validity-fixtures.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), GA = resolve(LANE, '..');
const J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8')), fsha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex');
const hashOf = (r) => { const { registrationHash: _h, ...b } = r; return sha256(stableStringify(b)); };
const cand = J('registration/REGISTRATION_CANDIDATE_V4.json'), pred = J('registration/ACTIVE_REGISTRATION_V3.json');
const mismatched = Object.entries(cand.bindings.sources).filter(([p, h]) => !existsSync(resolve(GA, p)) || fsha(p) !== h).map(([p]) => p);
const witness = nativeRowV4(WITNESS, { seen: new Set() });
const bound = J('evidence/successor-v4/menu-scan-records.json').records;
let spot = 0, spotOk = 0;
for (const r of bound.filter((_, i) => i % 50 === 0)) {
  const axes = Object.fromEntries(r.cell.split('/').map((v, i) => [['shape', 'roles', 'objectives', 'horizonBand', 'level'][i], i === 4 ? Number(v) : v]));
  const w = runCalibratedWarmup(r.seed, (t) => generateScenarioSymmetricV1({ ...axes, seed: r.seed, warmupTicks: t })).world, v = observableView(w), verdict = validatePolicyFacingViews(policyFacingViews(w, v));
  spot++; if (hashWorld(w) === r.worldHash && v.surface.length === r.menuSize && (verdict.valid ? 'VALID' : verdict.reason) === r.verdict && verdict.invalidViews === r.invalidViews) spotOk++;
}
const fixtures = runFixtures();
const out = {
  candidateHashRecomputed: hashOf(cand) === cand.registrationHash, candidateHash: cand.registrationHash, candidateStatus: cand.status, connector: cand.connector === CONNECTOR_V4_ID,
  predecessorHashRecomputed: hashOf(pred) === pred.registrationHash && pred.registrationHash === cand.predecessor.registrationHash,
  boundSources: Object.keys(cand.bindings.sources).length, boundSourceMismatches: mismatched,
  witnessRejected: witness.rejected?.reason === 'NATIVE_MENU_INVALID' && witness.rejected.cause === 'DUPLICATE_ACTION_ID' && witness.rejected.invalidViews === 11,
  spentScanSpotReplay: spotOk + '/' + spot, fixtures: fixtures.filter((f) => f.pass).length + '/' + fixtures.length,
  nothingAllocatedOrActivated: ['registration/NAMESPACE_ALLOCATION_V4.json', 'registration/ACTIVE_REGISTRATION_V4.json', 'registration/EXECUTION_AUTHORIZATION_V4.json'].every((p) => !existsSync(resolve(LANE, p))),
  registeredWorldsGenerated: 0,
};
out.verdict = out.candidateHashRecomputed && out.candidateStatus === 'REGISTRATION_PENDING_OWNER_APPROVAL' && out.connector && out.predecessorHashRecomputed && mismatched.length === 0 && out.witnessRejected && spotOk === spot && fixtures.every((f) => f.pass) && out.nothingAllocatedOrActivated ? 'CLEAN_CLONE_REPRODUCIBLE' : 'CLEAN_CLONE_MISMATCH';
console.log(JSON.stringify(out, null, 1));
