// Gate 0.2 — the lane-local projection is a faithful, import-free derivation; the uncommitted H-W1 import cut is verified independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { orientDirection, DIRECTION_DELTAS, ORIENTATIONS } from '../../src/forge-symmetric/orientation-symmetric-v1.js';
import { FORGE_ACTION_TYPE_NAMES, FORGE_ENTITY_TYPE_NAMES } from '../../src/forge/contract.js';
import { D4_ELEMENTS } from '../../stage3h-hw1-dev-v1/transforms.mjs';
import * as hw1 from '../../stage3h-hw1-dev-v1/public-projection.mjs';
import * as lane from '../adapters/forge/projection.mjs';
import { ACTION_TYPES, ENTITY_KINDS } from '../adapters/forge/features.mjs';
import { derive } from '../infra/derive-projection.mjs';
import { syntheticProjection } from './helpers.mjs';

const LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), sha = (s) => createHash('sha256').update(s).digest('hex');
test('embedded orientation tables equal the engine module', () => { assert.deepEqual([...lane.D4_FRAMES], [...ORIENTATIONS]);
  for (const t of ORIENTATIONS) { const ex = DIRECTION_DELTAS[orientDirection(t, 'EAST')], ey = DIRECTION_DELTAS[orientDirection(t, 'SOUTH')]; for (const [x, y] of [[1, 0], [0, 1], [2, -3], [-1, 4]]) assert.deepEqual(lane.D4_LINEAR[t](x, y), [ex[0] * x + ey[0] * y, ex[1] * x + ey[1] * y]); } });
test('embedded vocabularies equal the engine contract', () => { assert.deepEqual([...ACTION_TYPES], [...FORGE_ACTION_TYPE_NAMES]); assert.deepEqual([...ENTITY_KINDS], [...FORGE_ENTITY_TYPE_NAMES]); });
test('the H-W1 import cut is identity-preserving: transforms.D4_ELEMENTS IS the orientation constant', () => { assert.equal(D4_ELEMENTS, ORIENTATIONS); });
test('lane-local and frozen modules agree on keys, frames, symmetry and canonical order', () => { const P = syntheticProjection();
  assert.deepEqual(lane.keysV2(P), hw1.keysV2(P)); assert.deepEqual(lane.canonicalActionKeys(P).keys, hw1.canonicalActionKeys(P).keys); assert.deepEqual(lane.symmetryReport(P).fixedActions, hw1.symmetryReport(P).fixedActions);
  for (const t of ORIENTATIONS) assert.equal(JSON.stringify(lane.frameProjection(P, t)), JSON.stringify(hw1.frameProjection(P, t))); assert.deepEqual(lane.READ_PATHS, hw1.READ_PATHS); });
test('the committed derived file is exactly what the derivation produces, and matches its provenance record', () => { const file = readFileSync(resolve(LANE, 'adapters/forge/projection.mjs'), 'utf8'), prov = JSON.parse(readFileSync(resolve(LANE, 'evidence/SK1_PROJECTION_PROVENANCE.json'), 'utf8'));
  assert.equal(sha(file), prov.derivedSha256.fromCommittedHead); assert.equal(prov.identicalFromBothRevisions, true);
  assert.equal(derive(readFileSync(resolve(LANE, '../stage3h-hw1-dev-v1/public-projection.mjs'), 'utf8')).text, file); assert.deepEqual([...file.matchAll(/^import\s.*$/gm)].map((m) => m[0]), ["import { createHash } from 'node:crypto';"]); });
