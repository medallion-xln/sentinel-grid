import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdapterDeterministicEvidence,
  buildDeterministicEvidence,
  createVerificationReport,
  stripExecutionDiagnostics,
} from '../src/lab/evidence.js';

function report({ durationMs = 1, adapterOrder = 'normal', diagnosticNoise = {} } = {}) {
  const adapter = adapterOrder === 'normal'
    ? {
        contractVersion: 1,
        gameId: 'portable-fixture',
        adapterId: 'portable-fixture-adapter',
        adapterVersion: '1.0.0',
        authority: { tier: 'R0', executionInterface: false },
      }
    : {
        authority: { executionInterface: false, tier: 'R0' },
        adapterVersion: '1.0.0',
        adapterId: 'portable-fixture-adapter',
        gameId: 'portable-fixture',
        contractVersion: 1,
      };

  return {
    pass: true,
    adapter,
    checks: [
      {
        name: 'portable-check',
        pass: true,
        durationMs,
        stateHash: 'a'.repeat(64),
        nested: { beta: 2, alpha: 1, ...diagnosticNoise },
      },
    ],
  };
}

test('deterministic evidence ignores execution timing', () => {
  const left = buildDeterministicEvidence([report({ durationMs: 0.001 })]);
  const right = buildDeterministicEvidence([report({ durationMs: 9999.999 })]);
  assert.equal(left.deterministicEvidenceHash, right.deterministicEvidenceHash);
  assert.equal(JSON.stringify(left).includes('durationMs'), false);
});

test('runtime and platform differences change only execution report hash', () => {
  const reports = [report()];
  const mac = createVerificationReport(reports, {
    runtime: { node: 'v22.0.0', platform: 'darwin', arch: 'arm64', hostname: 'mac-a', pid: 101 },
    generatedAt: '2026-07-27T00:00:00.000Z',
  });
  const linux = createVerificationReport(reports, {
    runtime: { node: 'v20.0.0', platform: 'linux', arch: 'x64', hostname: 'linux-b', pid: 202 },
    generatedAt: '2026-07-28T00:00:00.000Z',
  });

  assert.equal(mac.deterministicEvidenceHash, linux.deterministicEvidenceHash);
  assert.notEqual(mac.executionReportHash, linux.executionReportHash);
});

test('object key ordering cannot change deterministic evidence hash', () => {
  const normal = buildDeterministicEvidence([report({ adapterOrder: 'normal' })]);
  const reordered = buildDeterministicEvidence([report({ adapterOrder: 'reordered' })]);
  assert.equal(normal.deterministicEvidenceHash, reordered.deterministicEvidenceHash);
});

test('diagnostic fields are recursively excluded from check evidence', () => {
  const noisy = report({
    diagnosticNoise: {
      runtime: { platform: 'darwin' },
      generatedAt: 'now',
      cwd: '/Users/example/project',
      localPath: '/tmp/output',
    },
  });
  const adapterEvidence = buildAdapterDeterministicEvidence(noisy);
  const encoded = JSON.stringify(adapterEvidence);
  assert.equal(encoded.includes('darwin'), false);
  assert.equal(encoded.includes('/Users/example'), false);
  assert.equal(encoded.includes('/tmp/output'), false);
});

test('stripExecutionDiagnostics preserves deterministic data', () => {
  assert.deepEqual(
    stripExecutionDiagnostics({ z: 3, durationMs: 9, nested: { b: 2, a: 1, platform: 'linux' } }),
    { nested: { a: 1, b: 2 }, z: 3 },
  );
});

test('deterministic evidence fixture is stable', () => {
  const evidence = buildDeterministicEvidence([report()]);
  assert.match(evidence.deterministicEvidenceHash, /^[a-f0-9]{64}$/);
  // This locks the canonical payload shape. Change only through an explicit
  // evidence-version migration.
  assert.equal(evidence.evidenceVersion, 7);
  assert.equal(evidence.contractVersion, 1);
  assert.equal(evidence.authority, 'R0');
  assert.equal(evidence.evidenceReportCount, 1);
  assert.equal('adapterCount' in evidence, false);
});
