import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const STAGE3DE_ROOT = path.resolve(here, '..', '..');
const stage3dArtifacts = path.join(STAGE3DE_ROOT, 'artifacts', 'stage3d-hybrid-shadow-qualification');
const stage3eArtifacts = path.join(STAGE3DE_ROOT, 'artifacts', 'stage3e-routability-intelligence');
const lineagePath = path.join(STAGE3DE_ROOT, 'artifacts', 'stage3de-recovery-canonicalization', 'lineage-record.json');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const round = (value, digits) => Number(value.toFixed(digits));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const nanMean = (values) => mean(values.filter((value) => value !== null && !Number.isNaN(value)));

function pythonHashes(file, kind) {
  const program = String.raw`
import hashlib,json,sys
p,kind=sys.argv[1:]
x=json.load(open(p))
def h(v): return hashlib.sha256(json.dumps(v,sort_keys=True).encode()).hexdigest()
if kind=='stage3d':
  body=dict(x); body.pop('STAGE3D_HYBRID_FREEZE_HASH')
  print(json.dumps({'freeze':h(body),'router':h(x['ROUTER_RULE'])}))
elif kind=='stage3e':
  body=dict(x); body.pop('STAGE3E_ROUTER_FREEZE_HASH')
  router=dict(x['STAGE3E_ROUTER']); router.pop('standardisation')
  print(json.dumps({'freeze':h(body),'router':h(router)}))
elif kind=='v2b':
  body=dict(x); body.pop('V2B_FREEZE_HASH')
  print(json.dumps({'freeze':h(body)}))
`;
  const result = spawnSync('python3', ['-c', program, file, kind], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`python hash replay failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

async function featureContractHashes(matrixDev) {
  const stage3dSourcePath = path.join(STAGE3DE_ROOT, 'training', 'stage3d-recovered', 'features.mjs');
  const learnedNexusUrl = pathToFileURL(path.join(STAGE3DE_ROOT, 'src', 'lab', 'stage3c-learned-nexus.js')).href;
  const rewriteAbsoluteImports = (source) => source.replace(/from '([^']+)'/g, (statement, specifier) => {
    if (specifier.endsWith('/src/lab/stage3c-learned-nexus.js')) return `from '${learnedNexusUrl}'`;
    if (specifier.startsWith('/')) return `from '${pathToFileURL(specifier).href}'`;
    return statement;
  });
  const stage3dSource = rewriteAbsoluteImports(readFileSync(stage3dSourcePath, 'utf8'));
  const stage3d = await import(`data:text/javascript;base64,${Buffer.from(stage3dSource).toString('base64')}`);
  const stage3dHash = sha256(`${stage3d.FEATURE_CONTRACT_V1.join(',')}|${stage3d.extract.toString()}`);

  const stage3eSourcePath = path.join(STAGE3DE_ROOT, 'training', 'stage3e-recovered', 'features-v2.mjs');
  const recoveredStage3dImport = /\/private\/tmp\/claude-501\/[^']+\/scratchpad\/3d\/features\.mjs/g;
  const source = rewriteAbsoluteImports(readFileSync(stage3eSourcePath, 'utf8')
    .replace(recoveredStage3dImport, pathToFileURL(stage3dSourcePath).href));
  const stage3e = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const orderedKeys = Object.keys(matrixDev[0].f);
  const stage3eHash = sha256(`${orderedKeys.join(',')}|${stage3e.extractV2.toString()}`);
  return { stage3dHash, stage3eHash, featureCount: orderedKeys.length };
}

function scoreRows(rows, model) {
  const bias = model.w.at(-1);
  return rows.map((row) => {
    let z = bias;
    for (let index = 0; index < model.keys.length; index += 1) {
      z += ((Number(row.f[model.keys[index]]) - model.mu[index]) / model.sd[index]) * model.w[index];
    }
    return 1 / (1 + Math.exp(-z));
  });
}

function wilsonLower(k, n, z = 1.96) {
  if (n === 0) return 0;
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  return Math.max(0, ((p + (z * z) / (2 * n))
    - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denominator);
}

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * quantile;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function replayFinal(rows, model, freeze, split) {
  const probabilities = scoreRows(rows, model);
  const route = probabilities.map((value) => value >= freeze.STAGE3E_ROUTER.TAU);
  const stage3dRoute = rows.map((row) => Number(row.f.immediateMargin) >= 20);
  const y = rows.map((row) => row.y);
  const greedyOk = rows.map((row) => row.greedyOk);
  const learnedOk = rows.map((row) => row.learnedOk);
  const greedyReg = rows.map((row) => row.greedyReg);
  const learnedReg = rows.map((row) => row.learnedReg);
  const choose = (mask, a, b) => mask.map((selected, index) => selected ? a[index] : b[index]);
  const routedN = route.filter(Boolean).length;
  const safeRouted = route.reduce((count, selected, index) => count + (selected ? y[index] : 0), 0);
  const hybridOk = choose(route, greedyOk, learnedOk);
  const hybridReg = choose(route, greedyReg, learnedReg);
  const stage3dOk = choose(stage3dRoute, greedyOk, learnedOk);
  const stage3dReg = choose(stage3dRoute, greedyReg, learnedReg);
  const oracleOk = y.map((safe, index) => safe === 1 ? greedyOk[index] : learnedOk[index]);
  const oracleReg = y.map((safe, index) => safe === 1 ? greedyReg[index] : learnedReg[index]);
  const result = {
    split,
    n: rows.length,
    targetPrevalence: round(mean(y), 4),
    router: {
      tau: freeze.STAGE3E_ROUTER.TAU,
      routedN,
      precision: routedN ? round(safeRouted / routedN, 4) : 0,
      wilsonLower: round(wilsonLower(safeRouted, routedN), 4),
      coverage: round(routedN / rows.length, 4),
      falseSafeCount: routedN - safeRouted,
      meetsEvidenceFloor: routedN >= freeze.MIN_ROUTED_N,
    },
    policies: {
      GREEDY_ALONE: { acc: round(mean(greedyOk), 4), regret: round(nanMean(greedyReg), 2) },
      V2B_ALONE: { acc: round(mean(learnedOk), 4), regret: round(nanMean(learnedReg), 2) },
      STAGE3D_HYBRID_margin20: {
        acc: round(mean(stage3dOk), 4),
        regret: round(nanMean(stage3dReg), 2),
        precision: round(mean(y.filter((unused, index) => stage3dRoute[index])), 4),
        coverage: round(stage3dRoute.filter(Boolean).length / rows.length, 4),
      },
      STAGE3E_HYBRID: { acc: round(mean(hybridOk), 4), regret: round(nanMean(hybridReg), 2) },
      ORACLE_GREEDY_SAFE: { acc: round(mean(oracleOk), 4), regret: round(nanMean(oracleReg), 2) },
    },
  };
  result.deltas = {
    hybridMinusV2B_acc: round(mean(hybridOk) - mean(learnedOk), 4),
    hybridMinusV2B_regret: round(nanMean(hybridReg) - nanMean(learnedReg), 2),
    hybridMinusStage3D_acc: round(mean(hybridOk) - mean(stage3dOk), 4),
  };
  const falseSafeIndexes = route
    .map((selected, index) => selected && y[index] === 0 ? index : -1)
    .filter((index) => index >= 0);
  if (falseSafeIndexes.length > 0) {
    const falseSafeGreedyRegret = falseSafeIndexes.map((index) => greedyReg[index]).filter((value) => value !== null);
    result.falseSafeHarm = {
      count: falseSafeIndexes.length,
      meanRegret: round(mean(falseSafeGreedyRegret), 2),
      p95Regret: round(percentile(falseSafeGreedyRegret, 0.95), 2),
      worstRegret: round(Math.max(...falseSafeGreedyRegret), 2),
      v2bWouldHaveRegret: round(nanMean(falseSafeIndexes.map((index) => learnedReg[index])), 2),
    };
  }
  result.routabilityGap = {
    oracleAcc: result.policies.ORACLE_GREEDY_SAFE.acc,
    runtimeAcc: result.policies.STAGE3E_HYBRID.acc,
    accuracyGap: round(result.policies.ORACLE_GREEDY_SAFE.acc - result.policies.STAGE3E_HYBRID.acc, 4),
    regretGap: round(result.policies.STAGE3E_HYBRID.regret - result.policies.ORACLE_GREEDY_SAFE.regret, 2),
  };
  return { result, probabilities };
}

function replayCalibration(rows, probabilities, floor) {
  const y = rows.map((row) => row.y);
  const curve = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.92, 0.95, 0.97, 0.98, 0.99, 0.995].map((tau) => {
    const selected = probabilities.map((value) => value >= tau);
    const n = selected.filter(Boolean).length;
    const k = selected.reduce((sum, on, index) => sum + (on ? y[index] : 0), 0);
    return {
      tau,
      n,
      precision: n ? round(k / n, 4) : 0,
      wilson: round(wilsonLower(k, n), 4),
      coverage: round(n / rows.length, 4),
    };
  });
  return { curve, floor };
}

function replayDeterminism(rows, model, tau) {
  const routesFor = (input) => scoreRows(input, model)
    .map((probability) => probability >= tau ? 'GREEDY' : 'LEARNED_V2B');
  const signatureFor = (input, routes) => sha256(input
    .map((row, index) => `${row.recordHash}|${routes[index]}`).join('\n'));
  const firstRoutes = routesFor(rows);
  const signature = signatureFor(rows, firstRoutes);
  const clone = structuredClone(rows);
  const cloneSignature = signatureFor(clone, routesFor(clone));
  const reversed = [...rows].reverse();
  const reversedRoutes = routesFor(reversed);
  const routeByRecord = new Map(reversed.map((row, index) => [row.recordHash, reversedRoutes[index]]));
  const orderingSignature = sha256(rows.map((row) => `${row.recordHash}|${routeByRecord.get(row.recordHash)}`).join('\n'));
  const permutedKeys = rows.slice(0, 500).map((row) => ({
    ...row,
    f: Object.fromEntries(Object.entries(row.f).reverse()),
  }));
  const keyOrderOriginal = signatureFor(rows.slice(0, 500), firstRoutes.slice(0, 500));
  const keyOrderPermuted = signatureFor(permutedKeys, routesFor(permutedKeys));
  return {
    signature,
    repeatIdentical: signature === signatureFor(rows, routesFor(rows)),
    cloneIsolation: signature === cloneSignature,
    keyOrderPerturbation: keyOrderOriginal === keyOrderPermuted,
    orderingPerturbation: signature === orderingSignature,
  };
}

export const STAGE3D_V2B_ADAPTER_DIRECTORY_ENV = 'SENTINEL_STAGE3D_V2B_ADAPTER_DIRECTORY';

/** Canonical candidate identity: the composite of the in-repo manifest's per-file hashes. */
function manifestCompositeHash(manifest) {
  const lines = Object.keys(manifest.adapterFileHashes ?? {}).filter((name) => name !== 'training-summary.json').sort()
    .map((name) => `${name}  ${manifest.adapterFileHashes[name]}`);
  return sha256(`${lines.join('\n')}\n`);
}

/**
 * Optional, non-gating adapter byte verification. Canonical certification never consults ephemeral scratch state
 * (including lineage.recoveredSourcePath); bytes are compared only when an operator explicitly points
 * SENTINEL_STAGE3D_V2B_ADAPTER_DIRECTORY at an archived copy of the adapter files.
 */
function verifyAdapterBytes(manifest, expected, directory = process.env[STAGE3D_V2B_ADAPTER_DIRECTORY_ENV] ?? null) {
  const base = { gating: false, source: directory === null ? 'NOT_REQUESTED' : 'EXPLICIT_OPT_IN', manifestCompositeHash: manifestCompositeHash(manifest) };
  if (directory === null || !existsSync(directory)) return { ...base, status: 'NOT_VERIFIED_ARCHIVE_UNAVAILABLE', hash: null, matches: null, files: [] };
  const files = readdirSync(directory).filter((name) => name !== 'training-summary.json').sort();
  const hash = sha256(`${files.map((name) => `${name}  ${sha256(readFileSync(path.join(directory, name)))}`).join('\n')}\n`);
  return { ...base, status: hash === expected ? 'ADAPTER_BYTES_VERIFIED' : 'ADAPTER_BYTES_MISMATCH', hash, matches: hash === expected, files };
}

export async function certifyRecoveredStage3DE() {
  const lineage = readJson(lineagePath);
  const expectedLineageHash = lineage.lineageRecordHash;
  const lineageBody = { ...lineage };
  delete lineageBody.lineageRecordHash;
  const checks = [];
  const check = (name, holds, details = undefined) => {
    checks.push({ name, holds: Boolean(holds), ...(details === undefined ? {} : { details }) });
  };

  check('lineage-record-self-hash', sha256(JSON.stringify(lineageBody)) === expectedLineageHash);
  for (const entry of lineage.inventory.filter((item) => item.canonicalPath)) {
    const canonical = path.join(STAGE3DE_ROOT, entry.canonicalPath);
    check(`canonical-byte-identity:${entry.recoveredPath}`, existsSync(canonical)
      && sha256(readFileSync(canonical)) === entry.sha256);
  }

  const known = lineage.knownHashes;
  const stage3dFreeze = readJson(path.join(stage3dArtifacts, 'freeze-3d.json'));
  const stage3eFreeze = readJson(path.join(stage3eArtifacts, 'freeze-3e.json'));
  const v2bManifest = readJson(path.join(STAGE3DE_ROOT, 'training', 'stage3cr3', 'identity', 'candidate-manifest-v2b.json'));
  const v2bFreeze = readJson(path.join(STAGE3DE_ROOT, 'training', 'stage3cr3', 'identity', 'freeze-v2b.json'));
  const matrixNames = ['DEV', 'CAL', 'HOLDOUT', 'OOD'];
  const matrices = Object.fromEntries(matrixNames.map((name) => [name, readJson(path.join(
    stage3eArtifacts, 'replay-fixtures', `matrix-ROUTABILITY_${name}.json`,
  ))]));

  const stage3dPython = pythonHashes(path.join(stage3dArtifacts, 'freeze-3d.json'), 'stage3d');
  const stage3ePython = pythonHashes(path.join(stage3eArtifacts, 'freeze-3e.json'), 'stage3e');
  const v2bPython = pythonHashes(path.join(STAGE3DE_ROOT, 'training', 'stage3cr3', 'identity', 'freeze-v2b.json'), 'v2b');
  const features = await featureContractHashes(matrices.DEV);
  const adapter = verifyAdapterBytes(v2bManifest, known.STAGE3D_V2B_CANDIDATE_HASH);

  check('stage3d-v2b-candidate-hash', v2bManifest.CANDIDATE_ARTIFACT_HASH === known.STAGE3D_V2B_CANDIDATE_HASH
    && adapter.manifestCompositeHash === known.STAGE3D_V2B_CANDIDATE_HASH);
  check('stage3d-v2b-freeze-hash', v2bFreeze.V2B_FREEZE_HASH === known.STAGE3D_V2B_FREEZE_HASH
    && v2bPython.freeze === known.STAGE3D_V2B_FREEZE_HASH);
  check('stage3d-feature-contract-hash', features.stage3dHash === stage3dFreeze.RUNTIME_FEATURE_CONTRACT_HASH);
  check('stage3d-router-hash', stage3dPython.router === stage3dFreeze.ROUTER_RULE_HASH);
  check('stage3d-freeze-hash', stage3dPython.freeze === known.STAGE3D_HYBRID_FREEZE_HASH);
  check('stage3e-router-hash', stage3ePython.router === known.STAGE3E_ROUTER_HASH);
  check('stage3e-freeze-hash', stage3ePython.freeze === known.STAGE3E_ROUTER_FREEZE_HASH);
  check('stage3e-feature-contract-hash', features.stage3eHash === known.FEATURE_CONTRACT_V2_HASH);
  check('stage3e-feature-count', features.featureCount === 51);
  check('stage3e-corpus-hash', stage3eFreeze.corpusHash === known.STAGE3E_CORPUS_HASH);
  check('label-leakage-closed', stage3dFreeze.LABEL_LEAKAGE === false);

  const splitSpec = readJson(path.join(stage3eArtifacts, 'split-spec.json'));
  const splitIdSets = [];
  for (const name of matrixNames) {
    const splitName = `ROUTABILITY_${name}`;
    const rows = matrices[name];
    const splitHash = sha256(rows.map((row) => row.recordHash).join('\n'));
    check(`stage3e-split-hash:${splitName}`, rows.length === splitSpec.splits[splitName].n
      && splitHash === splitSpec.splits[splitName].hash);
    splitIdSets.push(new Set(rows.map((row) => row.recordHash)));
  }
  let leakage = 0;
  for (let a = 0; a < splitIdSets.length; a += 1) {
    for (let b = a + 1; b < splitIdSets.length; b += 1) {
      for (const id of splitIdSets[a]) if (splitIdSets[b].has(id)) leakage += 1;
    }
  }
  check('stage3e-split-leakage', leakage === 0 && splitSpec.splitLeakageCount === 0);

  const model = readJson(path.join(stage3eArtifacts, 'lr-model.json'));
  const replay = {};
  for (const name of ['HOLDOUT', 'OOD']) {
    const splitName = `ROUTABILITY_${name}`;
    const measured = replayFinal(matrices[name], model, stage3eFreeze, splitName);
    const stored = readJson(path.join(stage3eArtifacts, `final-${splitName}.json`));
    replay[name] = measured;
    check(`stage3e-${name.toLowerCase()}-replay`, isDeepStrictEqual(measured.result, stored));
  }

  const calProbabilities = scoreRows(matrices.CAL, model);
  const calibration = replayCalibration(matrices.CAL, calProbabilities, stage3eFreeze.MIN_ROUTED_N);
  const storedCalibration = readJson(path.join(stage3eArtifacts, 'cal-calibration.json'));
  check('stage3e-calibration-replay', isDeepStrictEqual(calibration.curve, storedCalibration.curve)
    && calibration.floor === storedCalibration.floor);

  const runtime = readJson(path.join(stage3eArtifacts, 'runtime-tests.json'));
  const determinism = replayDeterminism(matrices.HOLDOUT, model, stage3eFreeze.STAGE3E_ROUTER.TAU);
  check('stage3e-determinism-replay', determinism.signature === runtime.determinism.signature
    && determinism.repeatIdentical && determinism.cloneIsolation
    && determinism.keyOrderPerturbation && determinism.orderingPerturbation
    && runtime.determinism.ROUTER_DETERMINISM_PASS === true);
  check('stage3e-failure-injection', runtime.FAIL_CLOSED_PASS === true
    && Object.values(runtime.failureInjection).every((entry) => entry.failedClosed === true));

  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  check('authority-firewall', authority.tier === 'R0'
    && authority.canDispatch === false && authority.canMutateLiveWorld === false
    && /R0 preserved/.test(stage3eFreeze.STAGE3E_ROUTER.failClosed));

  const stage3dSplit = readJson(path.join(stage3dArtifacts, 'split-spec.json'));
  for (const name of ['DEV', 'CAL', 'HOLDOUT', 'OOD']) {
    const fixture = readJson(path.join(stage3dArtifacts, 'replay-fixtures', `splitids-ROUTER_${name}.json`));
    check(`stage3d-split-identity:${name}`, fixture.n === stage3dSplit.splits[`ROUTER_${name}`].n
      && fixture.hash === stage3dSplit.splits[`ROUTER_${name}`].hash
      && sha256(fixture.recordIds.join('\n')) === fixture.hash);
  }
  check('stage3d-rule-replayed-on-stage3e-holdout', replay.HOLDOUT.result.policies.STAGE3D_HYBRID_margin20.acc === 0.4392
    && replay.HOLDOUT.result.policies.STAGE3D_HYBRID_margin20.regret === 42.64);
  check('stage3d-rule-replayed-on-stage3e-ood', replay.OOD.result.policies.STAGE3D_HYBRID_margin20.acc === 0.4622
    && replay.OOD.result.policies.STAGE3D_HYBRID_margin20.regret === 60.62);

  const failures = checks.filter((entry) => !entry.holds);
  return {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    checks,
    failures,
    hashes: {
      stage3dV2bCandidate: v2bManifest.CANDIDATE_ARTIFACT_HASH,
      stage3dV2bFreeze: v2bPython.freeze,
      stage3dHybridFreeze: stage3dPython.freeze,
      stage3eRouterFreeze: stage3ePython.freeze,
      stage3eRouter: stage3ePython.router,
      featureContractV2: features.stage3eHash,
      stage3eCorpus: stage3eFreeze.corpusHash,
    },
    replay: {
      holdout: replay.HOLDOUT.result,
      ood: replay.OOD.result,
      determinismSignature: determinism.signature,
      failureInjectionPass: runtime.FAIL_CLOSED_PASS,
    },
    preservation: lineage.preservation,
    adapter,
    authority,
    lineageRecordHash: expectedLineageHash,
  };
}
