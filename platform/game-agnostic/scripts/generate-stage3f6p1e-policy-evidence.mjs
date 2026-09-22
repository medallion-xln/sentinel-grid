#!/usr/bin/env node
/* STAGE_3F_6_P_1E — policy evidence for SYMMETRIC POLICY REQUALIFICATION.
 *
 * Rebuilds every stored FORGE_SYMMETRIC_V2 corpus row from its combination and re-runs the UNMODIFIED policies on
 * exactly the surface Stage 3F.6-P.1D presented (the symmetric legal surface in canonical-frame order). It captures
 * what the corpus does not store (confidence, abstain reason, NEXUS preference reason) and three diagnostic re-runs:
 *   ID_REVERSED   action identities relabelled in reverse lexicographic order, the choice mapped back;
 *   ID_PERMUTED   8 seeded random relabellings, each mapped back;
 *   D4 twins      on the corpus equivariance sample, the policy on each transformed world, mapped back by the inverse.
 * Relabelling changes nothing a policy may legitimately read; it only moves the identity tie-break.
 *
 * Fidelity is exact: world hash, distinct action keys and every stored choice must be reproduced.
 * No counterfactual is evaluated here and no metric is computed.
 *
 * Sealing: `--partitions=DEV,CAL` writes the open evidence; `--partitions=HOLDOUT,OOD` writes the sealed evidence and
 * refuses to run unless the analysis plan and the open-phase report are committed at HEAD.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { hashWorld } from '../src/forge/kernel.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { symmetricLegalActions } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import { INVERSE_ORIENTATION, TRANSFORM_EQUIVALENT, canonicalActionKey, canonicalOrientation, orientAction, orientWorld } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { proposeAll } from '../src/stage3f/deployable-action-proposal-v1.js';
import { nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { nexusSelectorV2Candidate } from '../src/stage3f/nexus-selector-v2-candidate.js';
import { seededUniform } from '../src/stage3f/policy-requalification-v1.js';
import { STAGE3F6P1E_OUT, STAGE3F6P1E_PLAN, STAGE3F6P1E_PLAN_HASH, STAGE3F6P1E_PLAN_PATH, STAGE3F6P1E_POLICY_SET, STAGE3F6P1E_POLICY_SET_HASH } from './stage3f6p1e-analysis-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const K16 = (k) => k.slice(0, 16);
const CORPUS = 'artifacts/stage3f6p1d-symmetric-corpus';
export const DEPLOYABLE = STAGE3F6P1E_POLICY_SET.categories.DEPLOYABLE;
export const STORED = [...DEPLOYABLE, 'RANDOM_LEGAL_V1'];
export const PERMUTATION_SEEDS = 8;
export const TWIN_TRANSFORMS = ['ROTATE_90', 'ROTATE_180', 'ROTATE_270', 'REFLECT_X', 'REFLECT_Y'];
export const OPEN_PARTITIONS = ['DEV', 'CAL'];
export const SEALED_PARTITIONS = ['HOLDOUT', 'OOD'];
export const OPEN_REPORT_PATH = `${STAGE3F6P1E_OUT}/stage3f6p1e-open-phase-report.json`;
export const evidencePath = (phase) => `${STAGE3F6P1E_OUT}/policy-evidence-${phase}.jsonl.gz`;
export const evidenceManifestPath = (phase) => `${STAGE3F6P1E_OUT}/policy-evidence-${phase}-manifest.json`;

/** The surface Stage 3F.6-P.1D gave every policy: symmetric legal actions, identities in the R0 frame, canonical-frame order. */
export function policySurface(world) {
  const frame = canonicalOrientation(world).orientation; const size = world.grid.width;
  return symmetricLegalActions(world, frame)
    .map((action) => ({ action, order: canonicalActionKey(frame, action, size), actionId: canonicalActionKey('R0', action, size) }))
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
    .map((e) => ({ actionId: e.actionId, actionType: e.action.actionType, targetEntityId: e.action.target?.id ?? null, action: e.action }));
}

/** Every requalified policy on one surface. Returns full action ids (null = abstain) with confidence and reasons. */
export function decideAll(observation, surface) {
  const legal = surface.map((e) => ({ actionId: e.actionId, actionType: e.actionType, targetEntityId: e.targetEntityId }));
  const out = {};
  for (const p of proposeAll({ observation, legalActions: legal })) {
    out[p.producerId] = { id: p.action?.actionId ?? null, conf: p.confidence, why: p.abstainReason };
  }
  const canonicalState = observation.metadata.canonicalState;
  const nexus = evaluateNexus({ canonicalState, legalActions: legal.map((e) => ({ actionId: e.actionId, targetEntityId: e.targetEntityId })) });
  const v1 = nexusRelationalSelector({ branches: legal.map((e) => ({ actionKey: e.actionId, actionType: e.actionType })) }, nexus);
  out.NEXUS_SELECTOR_V1 = { id: v1.abstain ? null : v1.actionId, conf: v1.confidence, why: v1.reason ?? null };
  const v2 = nexusSelectorV2Candidate({ canonicalState, legalActions: legal });
  out.NEXUS_SELECTOR_V2_CANDIDATE = { id: v2.action?.actionId ?? null, conf: v2.confidence,
    why: v2.action === null ? v2.abstainReason : v2.evidence.preference, protectExcluded: v2.evidence.protectActionsExcludedByGate };
  return out;
}

/** Re-run the policies with identities replaced by `alias(position)`; map each choice back to the true identity. */
function relabelled(observation, surface, aliasOf) {
  const aliased = surface.map((e, i) => ({ ...e, actionId: aliasOf(i) }));
  const back = new Map(aliased.map((e, i) => [e.actionId, surface[i].actionId]));
  const decided = decideAll(observation, aliased);
  return Object.fromEntries(DEPLOYABLE.map((p) => [p, decided[p].id === null ? null : K16(back.get(decided[p].id))]));
}
const pad = (n) => `a${String(n).padStart(5, '0')}`;
function reversedAlias(surface) {
  const order = surface.map((e, i) => i).sort((a, b) => (surface[a].actionId < surface[b].actionId ? -1 : surface[a].actionId > surface[b].actionId ? 1 : a - b));
  const alias = new Array(surface.length); order.forEach((i, rank) => { alias[i] = pad(surface.length - 1 - rank); });
  return (i) => alias[i];
}
function permutedAlias(surface, label) {
  const next = seededUniform(label);
  const perm = surface.map((e, i) => i);
  for (let i = perm.length - 1; i > 0; i -= 1) { const j = Math.floor(next() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  return (i) => pad(perm[i]);
}

const observe = (world) => forgeWorldAdapter.observe(forgeAdapterState(world), FORGE_OBSERVER_ID);

/** Evidence for one stored corpus row. */
export function evidenceFor(row) {
  const world = runCalibratedWarmup(row.combination.seed, (warmupTicks) => generateScenarioSymmetricV1({ ...row.combination, warmupTicks })).world;
  const surface = policySurface(world);
  const observation = observe(world);
  const decided = decideAll(observation, surface);
  const storedKeys = Object.keys(row.actions).sort();
  const rebuiltKeys = [...new Set(surface.map((e) => K16(e.actionId)))].sort();
  const choice = Object.fromEntries(STORED.map((p) => [p, decided[p].id === null ? null : K16(decided[p].id)]));
  const fidelity = {
    world: hashWorld(world) === row.worldHash ? 1 : 0,
    surface: JSON.stringify(storedKeys) === JSON.stringify(rebuiltKeys) ? 1 : 0,
    choices: STORED.every((p) => choice[p] === row.policies[p]) ? 1 : 0,
  };
  const policies = Object.fromEntries(STORED.map((p) => [p, { a: choice[p], conf: decided[p].conf, why: decided[p].why ?? null }]));
  policies.NEXUS_SELECTOR_V2_CANDIDATE.protectExcluded = decided.NEXUS_SELECTOR_V2_CANDIDATE.protectExcluded;
  const idReversed = relabelled(observation, surface, reversedAlias(surface));
  const idPermuted = Array.from({ length: PERMUTATION_SEEDS }, (_, s) => relabelled(observation, surface, permutedAlias(surface, `${row.recordHash}:${s}`)));

  let twins = null;
  if (row.equivariance !== null) {
    twins = {};
    const size = world.grid.width;
    for (const transform of TWIN_TRANSFORMS) {
      const orientation = TRANSFORM_EQUIVALENT[transform];
      const twin = orientWorld(orientation, world);
      const twinSurface = policySurface(twin);
      const twinDecided = decideAll(observe(twin), twinSurface);
      const byId = new Map(twinSurface.map((e) => [e.actionId, e.action]));
      twins[transform] = Object.fromEntries(DEPLOYABLE.map((p) => {
        const id = twinDecided[p].id;
        if (id === null) return [p, null];
        return [p, K16(canonicalActionKey('R0', orientAction(INVERSE_ORIENTATION[orientation], byId.get(id), size), size))];
      }));
    }
    fidelity.twinMapping = Object.values(twins).every((t) => Object.values(t).every((k) => k === null || k in row.actions)) ? 1 : 0;
  }
  return { recordHash: row.recordHash, partition: row.partition, fidelity, policies, idReversed, idPermuted, twins };
}

/* ------------------------------------------------------------------ sealing */
export function readCorpus() {
  const text = gunzipSync(readFileSync(path.join(root, CORPUS, 'symmetric-corpus-v1.jsonl.gz'))).toString('utf8');
  const manifest = JSON.parse(readFileSync(path.join(root, CORPUS, 'symmetric-corpus-v1-manifest.json'), 'utf8'));
  if (hex(text) !== manifest.contentHash || manifest.contentHash !== STAGE3F6P1E_PLAN.corpus.contentHash) throw new Error('CORPUS_MISMATCH: content hash differs from the plan');
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const headBytesHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };

/** Sealed evidence may only be generated once the plan and the open-phase report are committed, unchanged, at HEAD. */
export function sealedGate() {
  const failures = [];
  for (const file of [STAGE3F6P1E_PLAN_PATH, OPEN_REPORT_PATH, 'scripts/stage3f6p1e-analysis-plan.mjs']) {
    const local = hex(readFileSync(path.join(root, file)));
    if (headBytesHash(file) !== local) failures.push(`${file} is not committed unchanged at HEAD`);
  }
  const plan = JSON.parse(readFileSync(path.join(root, STAGE3F6P1E_PLAN_PATH), 'utf8'));
  if (plan.planHash !== STAGE3F6P1E_PLAN_HASH) failures.push('plan file hash differs from the plan module');
  const open = JSON.parse(readFileSync(path.join(root, OPEN_REPORT_PATH), 'utf8'));
  if (open.planHash !== STAGE3F6P1E_PLAN_HASH) failures.push('open-phase report is bound to a different plan');
  if (open.partitions.join(',') !== OPEN_PARTITIONS.join(',')) failures.push('open-phase report covers the wrong partitions');
  return failures;
}

async function main() {
  const partitions = (process.argv.find((a) => a.startsWith('--partitions='))?.split('=')[1] ?? '').split(',').filter(Boolean);
  const phase = partitions.join(',') === OPEN_PARTITIONS.join(',') ? 'open' : partitions.join(',') === SEALED_PARTITIONS.join(',') ? 'sealed' : null;
  if (phase === null) throw new Error('usage: --partitions=DEV,CAL | --partitions=HOLDOUT,OOD');
  if (phase === 'sealed') { const failures = sealedGate(); if (failures.length) throw new Error(`SEALED_GATE_CLOSED: ${failures.join('; ')}`); }
  const rows = readCorpus().filter((r) => partitions.includes(r.partition));
  rows.sort((a, b) => partitions.indexOf(a.partition) - partitions.indexOf(b.partition));
  const lines = [];
  for (const [i, row] of rows.entries()) {
    lines.push(JSON.stringify(evidenceFor(row)));
    if ((i + 1) % 1000 === 0) process.stderr.write(`[stage3f6p1e ${phase}] ${i + 1}/${rows.length}\n`);
  }
  const content = `${lines.join('\n')}\n`;
  const evidence = lines.map((l) => JSON.parse(l));
  const manifest = {
    schemaVersion: 1, stage: STAGE3F6P1E_PLAN.stage, phase, partitions, planHash: STAGE3F6P1E_PLAN_HASH, policySetHash: STAGE3F6P1E_POLICY_SET_HASH,
    corpusContentHash: STAGE3F6P1E_PLAN.corpus.contentHash, rows: evidence.length, contentHash: hex(content),
    fidelity: { world: evidence.filter((e) => e.fidelity.world === 1).length, surface: evidence.filter((e) => e.fidelity.surface === 1).length,
      choices: evidence.filter((e) => e.fidelity.choices === 1).length, twinRows: evidence.filter((e) => e.twins !== null).length,
      twinMapping: evidence.filter((e) => e.fidelity.twinMapping === 1).length },
    generator: 'scripts/generate-stage3f6p1e-policy-evidence.mjs', permutationSeeds: PERMUTATION_SEEDS, twinTransforms: TWIN_TRANSFORMS,
  };
  await mkdir(path.join(root, STAGE3F6P1E_OUT), { recursive: true });
  await writeFile(path.join(root, evidencePath(phase)), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(path.join(root, evidenceManifestPath(phase)), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
