#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const ZEKNOVA = path.resolve(
  ROOT,
  '..',
  'zeknova-shared-gaming-experience'
);

const MANIFEST_PATH = path.join(
  ROOT,
  'docs/governance/',
  'stage1az1-recovered-lineage-certification-manifest.json'
);

const HISTORICAL_MANIFEST_PATH = path.join(
  ROOT,
  'docs/governance/',
  'stage1az1-sentinel-prime-policy-evaluation-manifest.json'
);

const STAGE2_MANIFEST_PATH = path.join(
  ROOT,
  'docs/governance/',
  'stage1az2-prime-search-diagnosis-improvement-manifest.json'
);

const S_PORTABILITY = path.join(
  ROOT,
  'sgrid-lab/tests/stage1az1-portability-report.js'
);

const Z_PORTABILITY = path.join(
  ZEKNOVA,
  'tests/stage1az1-portability-report.cjs'
);

const IDENTITY_CONTRACT = path.join(
  ZEKNOVA,
  'azl/zeknova-identity-contract-v1.js'
);

const PACKAGE_JSON = path.join(ZEKNOVA, 'package.json');

const EXPECTED = {
  provisionalManifest:
    '09e53e61e315d18e4f69a17ba3c0dc7219238856cf1fbea21bb35db0ffb0e5be',
  historicalManifest:
    '4fa945f338ab495168c54d4762a6aaf6b026092818e0979e59d89a232d3669c0',
  sentinelDigest:
    '1e1c565d3817ba2cc5d8d5bb68ce4e6ea016340fa603992b7fbe32b7d7736897',
  historicalZeknovaDigest:
    'fadf30db72caf7cdafc1d834f4ff279af24e78879b2d6ac0a78378ba1da034c9',
  currentZeknovaDigest:
    '01ca569dc542adf9e31a8d74b69750107f4cbf7da35d85a6109fbe71f0f9b517',
  historicalPackage:
    'f6536b55bd89c8e623dbd3479a234df8e7a1568685b6ca7898b8bd61cb3e9be6',
  currentPackage:
    '63fc9f06fce89f42463c2a64c06f3342ee8e6b62264e555391c46cc17ec56ac1',
};

const sha = value =>
  crypto.createHash('sha256').update(value).digest('hex');

const fileSha = file => sha(fs.readFileSync(file));

const run = file =>
  childProcess.execFileSync(
    process.execPath,
    [file],
    { encoding: 'utf8' }
  );

const extractDigest = (output, label) => {
  const expression = new RegExp(
    '^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + ': ([0-9a-f]{64})$',
    'm'
  );

  const match = output.match(expression);

  assert.ok(match, 'Digest marker missing: ' + label);

  return match[1];
};

let checks = 0;

const test = (name, callback) => {
  callback();
  checks += 1;
  console.log('  PASS ' + name);
};

const recovered = JSON.parse(
  fs.readFileSync(MANIFEST_PATH, 'utf8')
);

const historical = JSON.parse(
  fs.readFileSync(HISTORICAL_MANIFEST_PATH, 'utf8')
);

const stage2 = JSON.parse(
  fs.readFileSync(STAGE2_MANIFEST_PATH, 'utf8')
);

const sentinelOutput = run(S_PORTABILITY);
const zeknovaOutput = run(Z_PORTABILITY);

const sentinelDigest = extractDigest(
  sentinelOutput,
  'Sentinel Stage 1A-Z.1 digest'
);

const zeknovaDigest = extractDigest(
  zeknovaOutput,
  'ZekNova Stage 1A-Z.1 digest'
);

const marker = '\nZekNova Stage 1A-Z.1 digest: ';
const markerIndex = zeknovaOutput.lastIndexOf(marker);

assert.ok(markerIndex >= 0);

const zeknovaReport = JSON.parse(
  zeknovaOutput.slice(0, markerIndex)
);

vm.runInThisContext(
  fs.readFileSync(IDENTITY_CONTRACT, 'utf8'),
  { filename: IDENTITY_CONTRACT }
);

const projectedReport = JSON.parse(
  JSON.stringify(zeknovaReport)
);

projectedReport.artifacts.package.sha256 =
  EXPECTED.historicalPackage;

const projectedDigest = sha(
  globalThis.ZekNovaIdentityContract.canonicalStringify(
    projectedReport
  )
);

test(
  'recovered phase exact',
  () => assert.equal(recovered.phase, 'Stage 1A-Z.1-R')
);

test(
  'recovered certification status exact',
  () => assert.equal(
    recovered.status,
    'certified-recovered-lineage'
  )
);

test(
  'historical manifest retained provisional',
  () => assert.equal(
    historical.status,
    'provisional-linux-only'
  )
);

test(
  'historical local manifest bytes unchanged',
  () => assert.equal(
    fileSha(HISTORICAL_MANIFEST_PATH),
    EXPECTED.provisionalManifest
  )
);

test(
  'historical frozen hash preserved as evidence',
  () => assert.equal(
    recovered.historicalLineage
      .originalFrozenManifestSha256,
    EXPECTED.historicalManifest
  )
);

test(
  'historical frozen bytes not falsely restored',
  () => assert.equal(
    recovered.historicalLineage
      .originalFrozenManifestByteRestored,
    false
  )
);

test(
  'Stage1AZ2 historical inheritance retained',
  () => assert.equal(
    stage2.inherits.stage1az1_manifest_sha256,
    EXPECTED.historicalManifest
  )
);

test(
  'Sentinel current digest exact',
  () => assert.equal(
    sentinelDigest,
    EXPECTED.sentinelDigest
  )
);

test(
  'ZekNova current digest exact',
  () => assert.equal(
    zeknovaDigest,
    EXPECTED.currentZeknovaDigest
  )
);

test(
  'current package hash exact',
  () => assert.equal(
    fileSha(PACKAGE_JSON),
    EXPECTED.currentPackage
  )
);

test(
  'portability report package hash exact',
  () => assert.equal(
    zeknovaReport.artifacts.package.sha256,
    EXPECTED.currentPackage
  )
);

test(
  'historical digest recovered by package-only projection',
  () => assert.equal(
    projectedDigest,
    EXPECTED.historicalZeknovaDigest
  )
);

test(
  'package-only drift declared',
  () => assert.equal(
    recovered.driftClassification.packageOnlyDriftProven,
    true
  )
);

test(
  'behavioral artifact drift denied',
  () => assert.equal(
    recovered.driftClassification.behavioralArtifactDrift,
    false
  )
);

test(
  'historical A6 remains failed',
  () => assert.equal(
    recovered.historicalLineage.historicalA6.result,
    'FAIL'
  )
);

test(
  'historical A6 exact count retained',
  () => assert.deepEqual(
    {
      total:
        recovered.historicalLineage.historicalA6.total,
      passed:
        recovered.historicalLineage.historicalA6.passed,
      failed:
        recovered.historicalLineage.historicalA6.failed,
    },
    { total: 65, passed: 64, failed: 1 }
  )
);

test(
  'Sentinel authority remains false',
  () => assert.equal(
    recovered.authority.sentinelAuthority,
    false
  )
);

test(
  'production authority remains false',
  () => assert.equal(
    recovered.authority.productionAuthority,
    false
  )
);

test(
  'incumbent remains sole executor',
  () => assert.equal(
    recovered.authority.incumbentScriptedAiSoleExecutor,
    true
  )
);

test(
  'strategic competence remains uncertified',
  () => assert.equal(
    recovered.claims.strategicCompetenceCertified,
    false
  )
);

test(
  'production deployment remains uncertified',
  () => assert.equal(
    recovered.claims.productionDeploymentCertified,
    false
  )
);

test(
  'live shadow evidence remains absent',
  () => assert.equal(
    recovered.claims.liveShadowEvidenceCollected,
    false
  )
);

console.log(
  `A6-R RECOVERED-LINEAGE CERTIFICATION PASS `
  + `(${checks}/${checks})`
);
