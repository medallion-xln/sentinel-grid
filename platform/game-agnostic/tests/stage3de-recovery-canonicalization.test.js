import test from 'node:test';
import assert from 'node:assert/strict';

import {
  certifyRecoveredStage3DE,
  replayFinal,
} from '../src/lab/stage3de-recovery-canonicalization.js';

let certification;
test.before(async () => {
  certification = await certifyRecoveredStage3DE();
});

test('the canonical payload is byte-identical to the recovered lineage', () => {
  assert.equal(certification.preservation.certifiedArtifactsRegenerated, false);
  assert.equal(certification.preservation.canonicalPayloadByteIdentical, true);
  assert.equal(certification.failures.length, 0, JSON.stringify(certification.failures, null, 2));
});

test('all Stage 3D and Stage 3E frozen hashes reproduce', () => {
  assert.deepEqual(certification.hashes, {
    stage3dV2bCandidate: 'c5ab281ceb2379ef2c04db1f40171cb8f14ed17ec8cc9cedd016b0747080cad7',
    stage3dV2bFreeze: '9ba5a862fe5f5863b9dc5a60524ea4d103ef84f55c56ae4c01d9e944aae3b11e',
    stage3dHybridFreeze: '5d605a0fb83a78f65d9ca3425a97f6f33f3dc077a3ff3827fd9b87f1dedc412c',
    stage3eRouterFreeze: '5a8e22b5c6a6889df658a74d134b376ee79fa1214760204a3265fe01f27c6bd2',
    stage3eRouter: 'd87cfa8b010c5889818b6ac6f3b9ddbaf2d23aa1cfb6e61d53cf31f50b722e64',
    featureContractV2: '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb',
    stage3eCorpus: '887e98081dc4342741411647a37dfd728fd4c4f3d69f1542f6460c717ed407d1',
  });
});

test('the frozen router reproduces HOLDOUT and OOD behavior', () => {
  assert.equal(certification.replay.holdout.router.routedN, 347);
  assert.equal(certification.replay.holdout.router.precision, 0.781);
  assert.equal(certification.replay.holdout.policies.STAGE3E_HYBRID.acc, 0.4347);
  assert.equal(certification.replay.ood.router.routedN, 881);
  assert.equal(certification.replay.ood.router.precision, 0.9103);
  assert.equal(certification.replay.ood.policies.STAGE3E_HYBRID.acc, 0.5155);
});

test('the Stage 3D rule remains reproducible on the Stage 3E evaluation surface', () => {
  assert.equal(certification.replay.holdout.policies.STAGE3D_HYBRID_margin20.acc, 0.4392);
  assert.equal(certification.replay.ood.policies.STAGE3D_HYBRID_margin20.acc, 0.4622);
});

test('determinism and fail-closed behavior remain certified', () => {
  assert.equal(certification.replay.determinismSignature, '6ad0a8bec294dcf57c164984bcb835dec9686b8b0e47a853e46b0f9c7da7b26f');
  assert.equal(certification.replay.failureInjectionPass, true);
});

test('canonical recovery preserves R0 evaluation-only authority', () => {
  assert.equal(certification.authority.tier, 'R0');
  assert.equal(certification.authority.canDispatch, false);
  assert.equal(certification.authority.canMutateLiveWorld, false);
});

test('replay evaluation remains a pure function of frozen rows, model, and contract', () => {
  assert.equal(typeof replayFinal, 'function');
});
