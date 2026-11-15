// Successor A/B namespace allocation and collision-validation PROCEDURE. Prepared and bound by the successor candidate;
// NOT run during preparation. It refuses unless the owner has approved the exact successor candidate, and it writes
// registration/NAMESPACE_ALLOCATION_V4.json exactly once. The registration is activated only afterwards, binding that file.
// Rule: candidate namespace bases are whole blocks of 10^9 (base = block * 10^9, 12 digits), tried in increasing block
// order from FIRST_BLOCK; A takes the first block that passes every check and B the next one. Blocks 731 (the consumed
// replication-A namespace of registration 0364164c, excluded ENTIRELY, not only its 12,768 scheduled seeds) and 732
// (the unused predecessor B namespace, which is not a continuation and is never reused) are excluded.
// Checks for each range [base, base + 12768): no prior executed or development seed; no 12-digit integer of the range
// anywhere in the repository's .mjs/.js/.json text; A and B disjoint. World-level exclusion of the 9,407 prior world
// hashes is enforced at execution (PRIOR_WORLD_EXCLUDED, never replaced). Usage: node allocate-namespaces-v4.mjs <candidateSha256>
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schedule, scheduleHash } from './connector.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

export const BLOCK = 1_000_000_000;
export const FIRST_BLOCK = 733, LAST_BLOCK = 799;
export const EXCLUDED_BLOCKS = Object.freeze({ 731: 'consumed replication-A namespace of registration 0364164c (entire block)', 732: 'unused predecessor B namespace (not a continuation; never reused)' });
export const PER_REPLICATION = 12768;
export const ALLOCATION_FILE = 'registration/NAMESPACE_ALLOCATION_V4.json';

/** Failures of one candidate base against injected exclusion inputs (empty = usable). */
export function blockFailures(base, { perReplication = PER_REPLICATION, priorSeeds = [], excludedBlocks = Object.keys(EXCLUDED_BLOCKS).map(Number), textHits = [] } = {}) {
  if (!Number.isSafeInteger(base) || base % BLOCK !== 0 || String(base).length !== 12) return ['NOT_A_12_DIGIT_BLOCK_BASE'];
  const inRange = (v) => v >= base && v < base + perReplication, failures = [];
  if (excludedBlocks.includes(base / BLOCK)) failures.push('EXCLUDED_BLOCK_' + base / BLOCK);
  if (priorSeeds.some(inRange)) failures.push('PRIOR_SEED_IN_RANGE');
  if (textHits.some((h) => inRange(h.value))) failures.push('REPOSITORY_TEXT_HIT');
  return failures;
}
/** Pure validation of a proposed {A, B} plan: both bases usable and the two ranges disjoint. */
export function validateNamespacePlan({ A, B }, inputs = {}) {
  const perReplication = inputs.perReplication ?? PER_REPLICATION;
  const failures = [...blockFailures(A, inputs).map((f) => 'A:' + f), ...blockFailures(B, inputs).map((f) => 'B:' + f)];
  if (Number.isSafeInteger(A) && Number.isSafeInteger(B) && !(A + perReplication <= B || B + perReplication <= A)) failures.push('A_B_NOT_DISJOINT');
  return { ok: failures.length === 0, failures };
}

/** Every 12-digit integer in [lo, hi) appearing in repository .mjs/.js/.json text (node_modules and .git skipped). */
export function scanRepositoryText(dir, lo, hi, hits = []) {
  for (const n of readdirSync(dir)) {
    const p = resolve(dir, n); if (/node_modules|\.git$/.test(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) scanRepositoryText(p, lo, hi, hits);
    else if (/\.(mjs|js|json)$/.test(n) && s.size < 64 * 1024 * 1024) for (const m of readFileSync(p, 'utf8').matchAll(/\b\d{12}\b/g)) { const v = Number(m[0]); if (v >= lo && v < hi) hits.push({ file: relative(GA, p), value: v }); }
  }
  return hits;
}

export function allocate(candidateHash) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const out = resolve(LANE, ALLOCATION_FILE);
  if (existsSync(out)) throw Error('ALREADY_ALLOCATED');
  const cand = JSON.parse(readFileSync(resolve(LANE, 'registration/REGISTRATION_CANDIDATE_V4.json'), 'utf8'));
  if (cand.registrationHash !== candidateHash) throw Error('CANDIDATE_MISMATCH');
  const approvalPath = resolve(LANE, 'registration/OWNER_APPROVAL_' + candidateHash.slice(0, 8) + '.json');
  if (!existsSync(approvalPath)) throw Error('OWNER_APPROVAL_OF_SUCCESSOR_REQUIRED');
  const appr = JSON.parse(readFileSync(approvalPath, 'utf8'));
  if (appr.boundTo?.registrationCandidateHash !== candidateHash || !Object.values(appr.decisions ?? {}).length || !Object.values(appr.decisions).every((d) => d.approved === true && d.signatureOrTrustedApprovalReference)) throw Error('OWNER_APPROVAL_INCOMPLETE');
  const excl = JSON.parse(readFileSync(resolve(GA, cand.bindings.priorExclusions.file), 'utf8'));
  const priorSeeds = [...excl.priorSeeds, ...cand.namespaceAllocation.additionalPriorSeeds];
  const textHits = scanRepositoryText(GA, FIRST_BLOCK * BLOCK, (LAST_BLOCK + 1) * BLOCK);
  const passing = [];
  for (let b = FIRST_BLOCK; b <= LAST_BLOCK && passing.length < 2; b++) if (blockFailures(b * BLOCK, { priorSeeds, textHits }).length === 0) passing.push(b * BLOCK);
  if (passing.length < 2) throw Error('NO_FREE_NAMESPACE_BLOCKS');
  const plan = { A: passing[0], B: passing[1] }, check = validateNamespacePlan(plan, { priorSeeds, textHits });
  if (!check.ok) throw Error('NAMESPACE_COLLISION:' + JSON.stringify(check.failures));
  const contract = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8'));
  const plans = Object.fromEntries(Object.entries(plan).map(([r, b]) => [r, schedule(contract.populations, b)]));
  if (plans.A.length !== PER_REPLICATION || plans.B.length !== PER_REPLICATION) throw Error('SCHEDULE_SIZE');
  const record = { schema: 'STAGE3H_SUCCESSOR_NAMESPACE_ALLOCATION_V4', candidateHash, status: 'ALLOCATED_AFTER_OWNER_APPROVAL', rule: { BLOCK, FIRST_BLOCK, LAST_BLOCK, EXCLUDED_BLOCKS, PER_REPLICATION },
    namespaces: plan, scheduleHashes: { A: scheduleHash(plans.A), B: scheduleHash(plans.B) }, collisionAudit: { ...check, priorSeedsChecked: priorSeeds.length, repositoryTextHitsInCandidateBlocks: textHits },
    inheritanceHead: inh.head, worldsGenerated: 0, authority: 'R0' };
  writeExclusive(out, record);
  return record;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(allocate(process.argv[2]), null, 1));
