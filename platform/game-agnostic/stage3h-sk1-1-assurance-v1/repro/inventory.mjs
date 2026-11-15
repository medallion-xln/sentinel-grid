// SK1.1 Phase 1 — reproducibility inventory of Stage 3H-SK1. Non-mutating: it reads, hashes and compares.
//   /opt/homebrew/bin/node repro/inventory.mjs                 print a summary (nothing is written)
//   /opt/homebrew/bin/node repro/inventory.mjs --write         create evidence/SK1_1_REPRO_INVENTORY.json (exclusive; runs the clean-checkout probe)
//   /opt/homebrew/bin/node repro/inventory.mjs verify          recompute and compare with the tracked inventory, the SK1 experiment
//                                                              freeze and the custody records; writes nothing; exit 1 on any drift
// It answers, from the files themselves: which source the SK1 inference path and the SK1 evaluation path depend on;
// which of that is committed, modified, custody-protected or missing; which data exists only locally; and whether the
// committed hashes of the frozen experiment still describe what is on disk.
// It never chmods, never generates a world, never reads evaluator truth into its output, and records identities
// (paths, sizes, modes, sha256) only — no seeds, world hashes or per-class coordinates.
import { readFileSync, existsSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GIT, REPO, GA, SK1_LANE, SK1_REL, INVENTORY_FILE, CLASS, sha, fileSha, readJ, posix, traceClosure, gitFacts, protectedIdentities, classify, listFiles, stable, deepDiff, compareHashRecord } from './lib.mjs';
import { runProbe, EVALUATION_ENTRIES, INFERENCE_ENTRIES, TEST_FILES } from './clean-checkout-probe.mjs';

export const SCHEMA = 'SK1_1_REPRO_INVENTORY_V1';
const GA_REL = 'platform/game-agnostic', ga = (rel) => rel.replace(`${GA_REL}/`, '');
const GRAPH_ENTRIES = ['api/recommend.mjs', 'api/host.mjs', 'kernel/index.mjs', 'adapters/forge/features.mjs', 'adapters/rescue/adapter.mjs']; // = infra/graph-audit.mjs ENTRY_POINTS
const CODE_DIRS = ['kernel', 'adapters/forge', 'adapters/rescue', 'api', 'infra']; // = infra/run.mjs CODE_DIRS
const digest = (rows, key = 'file') => sha(rows.map((r) => `${r[key]}:${r.sha256}`).sort().join('\n'));
const countBy = (rows, f) => rows.reduce((o, r) => { const k = f(r); o[k] = (o[k] ?? 0) + 1; return o; }, {});
const LOCAL_ROLE = { manifests: 'PRIVATE_POPULATION_MANIFESTS (seeds, world hashes, class list)', classes: 'CLASS_RECORDS (public projection, comparator sets, evaluator truth)', audit: 'IDENTITY_AUDIT_SHARDS (no truth; merged into the result)',
  pool: 'ADMISSION_POOL', screen: 'SCREENING_ADMISSION_RECORDS', 'dev-fixture': 'DEVELOPMENT_FIXTURE (spent H-W4 exploration classes)', 'dev-model': 'DEVELOPMENT_MODEL_COPIES', logs: 'RUN_LOGS (not an input)' };

// -----------------------------------------------------------------------------------------------------------------
/** Hash comparisons of the SK1 experiment freeze against the files on disk (a read-only restatement of run.mjs checkFreeze). */
export function freezeChecks(fr, { lane = SK1_LANE, gaDir = GA, work = resolve(lane, 'work') } = {}) {
  const h = (p) => (existsSync(p) ? fileSha(p) : null), checks = [], add = (name, drift, n) => checks.push({ name, items: n, ok: drift.length === 0, drift });
  const present = CODE_DIRS.flatMap((d) => (existsSync(resolve(lane, d)) ? readdirSync(resolve(lane, d)).filter((n) => /\.(mjs|json)$/.test(n)).sort().map((n) => `${d}/${n}`) : []));
  add('CODE_FILE_SET_EQUALS_FROZEN_SET', [...present.filter((f) => !(f in fr.codeHashes)).map((f) => ({ file: f, problem: 'NOT_IN_FREEZE' })), ...Object.keys(fr.codeHashes).filter((f) => !present.includes(f)).map((f) => ({ file: f, problem: 'MISSING' }))], present.length);
  add('CODE_HASHES', compareHashRecord(fr.codeHashes, lane), Object.keys(fr.codeHashes).length);
  add('EVALUATION_DEPENDENCY_HASHES', compareHashRecord(fr.evaluationDependencies, gaDir), Object.keys(fr.evaluationDependencies).length);
  add('MODEL_FILES', [['SK1', resolve(lane, fr.models.SK1.file)], ['SK1_NO_EVIDENCE', resolve(lane, fr.models.SK1_NO_EVIDENCE.file)], ['C10', resolve(gaDir, fr.models.C10.file)]].map(([k, p]) => ({ file: k, recorded: fr.models[k].sha256, current: h(p) })).filter((r) => r.recorded !== r.current), 3);
  const pop = []; for (const P of ['EXPLORATION', 'VALIDATION']) { pop.push({ file: `evidence/SK1_POPULATION_${P}.json`, recorded: fr.populations[P].summarySha256, current: h(resolve(lane, `evidence/SK1_POPULATION_${P}.json`)) }, { file: `evidence/SK1_REGISTRY_${P}.json`, recorded: fr.populations[P].registrySha256, current: h(resolve(lane, `evidence/SK1_REGISTRY_${P}.json`)) }); }
  add('POPULATION_SUMMARIES_AND_REGISTRIES', pop.filter((r) => r.recorded !== r.current), pop.length);
  const data = fr.populations.VALIDATION.dataFiles.map((d) => ({ file: `work/classes/VALIDATION/${d.file}`, recorded: d.sha256, current: h(resolve(work, 'classes/VALIDATION', d.file)) }));
  add('VALIDATION_DATA_FILES (local, gitignored)', data.filter((r) => r.recorded !== r.current), data.length);
  const single = [['evidence/SK1_NAMESPACE_ALLOCATION.json', fr.allocationSha256], ['infra/exclusion-registry.json', fr.exclusionRegistrySha256], ['evidence/SK1_TRAINING_RECORD.json', fr.trainingRecordSha256], ['SK1_DESIGN_FREEZE.md', fr.designFreezeSha256]].map(([f, want]) => ({ file: f, recorded: want, current: h(resolve(lane, f)) }));
  add('ALLOCATION_EXCLUSION_REGISTRY_TRAINING_RECORD_DESIGN_FREEZE', single.filter((r) => r.recorded !== r.current), single.length);
  return checks;
}

/** The stable, recomputable part of the inventory. */
export async function buildCore() {
  const facts = gitFacts(), prot = protectedIdentities() ?? [], protectedMap = new Map(prot.map((r) => [r.path, r.sha256])), F = { ...facts, protectedMap };
  const L = (f) => resolve(SK1_LANE, f), groups = { inference: [...new Set([...INFERENCE_ENTRIES, ...GRAPH_ENTRIES])], evaluation: EVALUATION_ENTRIES(), tests: TEST_FILES() };

  // ---- 1. code closure (static relative imports) per group, classified against HEAD and the custody record
  const byFile = new Map(), bare = new Set(), dynamic = [];
  for (const [g, entries] of Object.entries(groups)) for (const [abs, n] of traceClosure(entries.map(L))) { const rel = posix(relative(REPO, abs)), e = byFile.get(rel) ?? byFile.set(rel, { file: ga(rel), sha256: n.sha256, ...classify(rel, n.sha256, F), groups: [] }).get(rel); e.groups.push(g); n.bare.forEach((b) => bare.add(b)); if (n.dynamicNonLiteral && !dynamic.includes(ga(rel))) dynamic.push(ga(rel)); }
  const files = [...byFile.values()].sort((a, b) => (a.file < b.file ? -1 : 1));
  const perEntry = groups.evaluation.map((e) => { const rows = [...traceClosure([L(e)])].map(([abs, n]) => { const rel = posix(relative(REPO, abs)); return { file: ga(rel), sha256: n.sha256, ...classify(rel, n.sha256, F) }; });
    return { entry: e, files: rows.length, closureSha256: digest(rows), byClass: countBy(rows, (r) => r.class), reproducibleFromHeadAlone: rows.every((r) => r.class === CLASS.EQ) }; });
  const codeClosure = { method: 'transitive static relative imports (import/export ... from, side-effect import, literal dynamic import); node: builtins are not files', entryGroups: groups, fileCount: files.length, byClass: countBy(files, (r) => r.class),
    byGroupAndClass: Object.fromEntries(Object.keys(groups).map((g) => [g, countBy(files.filter((r) => r.groups.includes(g)), (r) => r.class)])), bareImports: [...bare].sort(), npmPackages: [...bare].filter((b) => !b.startsWith('node:')).sort(),
    filesWithNonLiteralDynamicImport: dynamic.sort(), perEvaluationEntry: perEntry, files };

  // ---- 2. source identities
  const sub = (name, definition, entries, pred = () => true) => { const rows = [...traceClosure(entries)].map(([abs, n]) => { const rel = posix(relative(REPO, abs)); return { file: ga(rel), sha256: n.sha256, ...classify(rel, n.sha256, F) }; }).filter(pred); return { name, definition, files: rows.length, byClass: countBy(rows, (r) => r.class), closureSha256: digest(rows) }; };
  const kernelRows = [...traceClosure(GRAPH_ENTRIES.map(L))].map(([abs, n]) => ({ file: posix(relative(SK1_LANE, abs)), sha256: n.sha256 })), gate0 = readJ(L('evidence/SK1_GATE0_INTEGRITY.json')), demo = readJ(L('evidence/SK1_DEMO_RECORD.json'));
  const dirHash = (d) => sha(readdirSync(L(d)).filter((n) => n.endsWith('.mjs')).sort().map((n) => `${d}/${n}:${fileSha(L(`${d}/${n}`))}`).join('\n')); // = api/host.mjs dirHash
  const sourceIdentities = {
    kernelInference: { definition: 'closure of infra/graph-audit.mjs ENTRY_POINTS, lane-relative', files: kernelRows.length, closureSha256: digest(kernelRows), equalsGate0RecordedClosure: digest(kernelRows) === gate0.cleanExport.inferenceGraph.closureSha256,
      kernelSourceHash: dirHash('kernel'), forgeAdapterSourceHash: dirHash('adapters/forge'), equalCommittedDemoRecord: demo.decisions.every((d) => d.kernelSourceHash === dirHash('kernel') && d.adapterSourceHash === dirHash('adapters/forge')) },
    nativeEngine: sub('nativeEngine', 'every file under platform/game-agnostic/src/ reached by the evaluation closure: the Forge World engine, its symmetric orientation and action surface, core contracts, the expert and Stage 3F/3G modules the frozen comparators call', groups.evaluation.map(L), (r) => r.file.startsWith('src/')),
    worldGenerationAndClassConstruction: sub('worldGenerationAndClassConstruction', 'closure of SK1 infra/allocator.mjs, screen.mjs, pool.mjs, build-class.mjs (which call the frozen H-W1 i2-screen / i2-build-class generators)', ['infra/allocator.mjs', 'infra/screen.mjs', 'infra/pool.mjs', 'infra/build-class.mjs'].map(L)),
    frozenEvaluatorDefinitions: sub('frozenEvaluatorDefinitions', 'closure of stage3h-hw1-dev-v1/hw1-eval.mjs (catastrophe, introduction, nreg, cluster bootstrap)', [resolve(GA, 'stage3h-hw1-dev-v1/hw1-eval.mjs')]),
    evaluationRun: sub('evaluationRun', 'closure of SK1 infra/run.mjs (freeze, audit, run, check)', [L('infra/run.mjs')]),
    training: sub('training', 'closure of SK1 infra/train.mjs', [L('infra/train.mjs')]),
    frozenComparators: sub('frozenComparators', 'custody-protected files in the evaluation closure: stage3h-canonical-v1 (S0 baseline, Nexus selector port, adapters, metrics, guard) and the ascii-suite modules they import', groups.evaluation.map(L), (r) => r.class === CLASS.PROT),
  };

  // ---- 3. decision-model files
  const modelRow = (label, abs, extra = {}) => { const rel = posix(relative(REPO, abs)), cur = existsSync(abs) ? fileSha(abs) : null; let hashOk = null; if (cur && label !== 'C10') { const { modelHash, ...rest } = readJ(abs); hashOk = sha(JSON.stringify(rest)) === modelHash; } return { model: label, file: ga(rel), sha256: cur, ...classify(rel, cur, F), ...(hashOk === null ? {} : { embeddedModelHashVerifies: hashOk }), ...extra }; };
  const fr = readJ(L('evidence/SK1_EXPERIMENT_FREEZE.json'));
  const models = [modelRow('SK1', L('models/SK1_MODEL.json'), { modelHash: fr.models.SK1.modelHash }), modelRow('SK1_NO_EVIDENCE', L('models/SK1_MODEL_NO_EVIDENCE.json'), { modelHash: fr.models.SK1_NO_EVIDENCE.modelHash }), modelRow('C10', resolve(GA, fr.models.C10.file))];

  // ---- 4. tracked SK1 records
  const laneTracked = facts.git('ls-files', '--', SK1_REL).split('\n').filter(Boolean), trackedRecords = laneTracked.filter((f) => /\/(evidence\/[^/]+\.json|[^/]+\.md|infra\/exclusion-registry\.json|demo\/fixtures\/[^/]+\.json)$/.test(f)).map((rel) => { const cur = existsSync(resolve(REPO, rel)) ? fileSha(resolve(REPO, rel)) : null; return { file: ga(rel), sha256: cur, size: cur ? statSync(resolve(REPO, rel)).size : null, ...classify(rel, cur, F) }; });
  const laneState = { trackedFiles: laneTracked.length, trackedFilesDifferingFromHead: laneTracked.filter((f) => !existsSync(resolve(REPO, f)) || fileSha(resolve(REPO, f)) !== facts.headSha(f)).map(ga), untrackedNotIgnored: facts.git('status', '--porcelain', '--', SK1_REL).split('\n').filter((l) => l.startsWith('??')).map((l) => ga(l.slice(3))) };

  // ---- 5. exclusion registries (identity checks here; the fail-closed loaders are exercised by exerciseExclusions())
  const reg = readJ(L('infra/exclusion-registry.json')), led = readJ(L('evidence/SK1_SPEND_LEDGER.json')), fileRow = (gaRel, recorded) => { const abs = resolve(GA, gaRel), rel = `${GA_REL}/${gaRel}`, cur = existsSync(abs) ? fileSha(abs) : null; return { file: gaRel, recordedSha256: recorded, sha256: cur, matchesRecorded: recorded === cur, ...classify(rel, cur, F) }; };
  const { hash: regHash, ...regRest } = reg;
  // pure JSON reading of the two tracked records: verifiable in a clean checkout, where the loaders themselves cannot be imported
  const forbiddenByRecords = { ...reg.forbiddenBlocks, ...led.statuses }, listed = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i).filter((b2) => typeof forbiddenByRecords[b2] === 'string').length;
  const exclusions = { registry: { file: `${ga(SK1_REL)}/infra/exclusion-registry.json`, sha256: fileSha(L('infra/exclusion-registry.json')), declaredHash: regHash, declaredHashVerifies: sha(JSON.stringify(regRest)) === regHash, failClosed: reg.failClosed, forbiddenBlocks: Object.keys(reg.forbiddenBlocks).length, strictIndexLoader: reg.strictIndex.loader },
    trackedRecordsAlone: { method: 'union of infra/exclusion-registry.json forbiddenBlocks and evidence/SK1_SPEND_LEDGER.json statuses, read as JSON without importing any loader', forbiddenBlocks: Object.keys(forbiddenByRecords).length, blocks901to914Listed: listed(901, 914), blocks801to837Listed: listed(801, 837) },
    sealedRegistries: reg.sealedRegistries.map((e) => ({ name: e.name, count: e.count, ...fileRow(e.file, e.sha256) })),
    successor: { loader: `${ga(SK1_REL)}/successor/exclusions-v2.mjs`, ledger: fileRow(`${ga(SK1_REL)}/evidence/SK1_SPEND_LEDGER.json`, null).sha256, blocksListed: [...led.blocks.screenedAndSpent, ...led.blocks.reserveNeverGenerated, ...led.blocks.rejectedAtPreflight].length,
      registries: [[led.populations.EXPLORATION.registry, led.populations.EXPLORATION.registrySha256], [led.populations.VALIDATION.registry, led.populations.VALIDATION.registrySha256], [led.unusedRegistry.file, led.unusedRegistry.sha256]].map(([f, h]) => fileRow(`${ga(SK1_REL)}/${f}`, h)) } };

  // ---- 6. gitignored local data (identities only)
  const work = L('work'), local = listFiles(work), trackedText = laneTracked.filter((f) => /\/evidence\/[^/]+\.json$/.test(f)).map((f) => readFileSync(resolve(REPO, f), 'utf8')).join('\n');
  const manifestText = local.filter((f) => f.path.startsWith('manifests/') && f.sha256 && trackedText.includes(f.sha256)).map((f) => readFileSync(resolve(work, f.path), 'utf8')).join('\n');
  const localFiles = local.map((f) => ({ path: `work/${f.path}`, size: f.size, mode: f.mode, sha256: f.sha256, boundBy: f.sha256 === null ? 'UNREADABLE' : trackedText.includes(f.sha256) ? 'TRACKED_SK1_EVIDENCE' : manifestText.includes(f.sha256) ? 'PRIVATE_MANIFEST_BOUND_BY_TRACKED_SUMMARY' : 'NO_TRACKED_HASH_BEFORE_THIS_INVENTORY' }));
  const top = (p) => p.split('/')[1], localData = { root: `${ga(SK1_REL)}/work/`, gitignored: facts.ignored([`${SK1_REL}/work/`]).size > 0, trackedAtHead: laneTracked.some((f) => f.startsWith(`${SK1_REL}/work/`)), present: existsSync(work), fileCount: localFiles.length, bytes: localFiles.reduce((s, f) => s + f.size, 0), listingSha256: sha(stable(localFiles)),
    groups: Object.fromEntries([...new Set(localFiles.map((f) => top(f.path)))].sort().map((g) => { const rows = localFiles.filter((f) => top(f.path) === g); return [g, { role: LOCAL_ROLE[g] ?? 'UNCLASSIFIED', files: rows.length, bytes: rows.reduce((s, f) => s + f.size, 0), modes: countBy(rows, (r) => r.mode), boundBy: countBy(rows, (r) => r.boundBy) }]; })),
    devModelDirectory: { note: 'work/dev-model holds development-stage models fitted on the spent H-W4 fixture; they are NOT the frozen models and are not an input of the frozen experiment', filesEqualToFrozenModels: ['SK1_MODEL.json', 'SK1_MODEL_NO_EVIDENCE.json'].filter((n) => existsSync(resolve(work, 'dev-model', n)) && fileSha(resolve(work, 'dev-model', n)) === fileSha(L(`models/${n}`))).length }, files: localFiles };

  // ---- 7. custody
  const custRec = readJ(L('evidence/SK1_CUSTODY_MANIFEST.json')), recOverlay = new Map(custRec.evaluationHarness.custodyProtectedOverlayDependencies.map((d) => [d.file, d.sha256])), inClosure = new Set(files.filter((r) => r.class === CLASS.PROT).map((r) => r.file));
  const guardFile = resolve(REPO, '.git/custody/GUARD_MANIFEST.sha256'), guard = existsSync(guardFile) ? readFileSync(guardFile, 'utf8').split('\n').filter(Boolean).map((l) => { const [h, f] = l.split(/\s+/); return { file: `.git/${f}`, recordedSha256: h, ok: existsSync(resolve(REPO, '.git', f)) && fileSha(resolve(REPO, '.git', f)) === h }; }) : null;
  const protectedRows = prot.map((r) => { const abs = resolve(REPO, r.path), cur = existsSync(abs) ? fileSha(abs) : null; return { file: ga(r.path), recordedSha256: r.sha256, present: cur !== null, matchesRecordedIdentity: cur === r.sha256, trackedAtHead: facts.tracked.has(r.path), inSk1EvaluationClosure: inClosure.has(ga(r.path)), equalsSk1CustodyManifest: recOverlay.has(ga(r.path)) ? recOverlay.get(ga(r.path)) === cur : null }; });
  const custody = { identityFile: '.git/custody/protected-identities.tsv (inside .git: not versioned, not cloned)', identityFilePresent: prot.length > 0, protectedIdentities: prot.length, present: protectedRows.filter((r) => r.present).length, matchingRecordedIdentity: protectedRows.filter((r) => r.matchesRecordedIdentity).length, trackedAtHead: protectedRows.filter((r) => r.trackedAtHead).length,
    inSk1EvaluationClosure: protectedRows.filter((r) => r.inSk1EvaluationClosure).length, closureFilesDifferingFromSk1CustodyManifest: protectedRows.filter((r) => r.equalsSk1CustodyManifest === false).map((r) => r.file), guardManifest: guard, guardManifestIntact: guard ? guard.every((g) => g.ok) : false,
    prePushHook: 'identity verified against GUARD_MANIFEST; not executed here. Its refusal of every push was last exercised by evidence/SK1_CUSTODY_MANIFEST.json (prePushRefusesEveryPush=' + custRec.custody.prePushRefusesEveryPush + ')', files: protectedRows };

  // ---- 8. the frozen experiment binding
  const res = readJ(L('evidence/SK1_VALIDATION_RESULTS.json')), checks = freezeChecks(fr);
  checks.push({ name: 'RESULT_BINDS_FREEZE_AND_MARKER', items: 2, ok: res.freezeSha256 === fileSha(L('evidence/SK1_EXPERIMENT_FREEZE.json')) && res.markerSha256 === fileSha(L('evidence/SK1_VALIDATION_RUN_MARKER.json')), drift: [] });
  const freezeBinding = { freezeFile: `${ga(SK1_REL)}/evidence/SK1_EXPERIMENT_FREEZE.json`, freezeSha256: fileSha(L('evidence/SK1_EXPERIMENT_FREEZE.json')), frozenAtRepoHead: fr.repoHead, evaluationDependenciesDifferingFromHeadAtFreeze: fr.evaluationDependenciesDifferingFromHead, resultSha256: fileSha(L('evidence/SK1_VALIDATION_RESULTS.json')), decisionDigest: res.reproducibility.decisionDigest, classification: res.classification, checks, allOk: checks.every((c) => c.ok) };

  // ---- 9. runtime requirements as recorded
  const pkg = readJ(resolve(GA, 'package.json')), train = readJ(L('evidence/SK1_TRAINING_RECORD.json'));
  const runtime = { recordedNode: { experimentFreeze: fr.node, validationResults: res.node, trainingRecord: train.node, gate0: gate0.node, demoRecord: demo.node }, packageEngines: pkg.engines ?? null, packageType: pkg.type ?? null, npmDependencies: Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }).length, versionPinFile: ['.nvmrc', '.node-version', `${GA_REL}/.nvmrc`].filter((f) => existsSync(resolve(REPO, f))),
    numerics: 'IEEE-754 doubles through V8 (Math.exp in the logit link, floating-point sums in the bagged trees and in the cluster bootstrap). No canonical-numerics layer, platform pin or cross-version determinism claim is recorded for SK1. Bit-exact reproduction has been observed on Node v26.7.0 / darwin-arm64 only.',
    toolAssumptions: ['/usr/bin/git', '/usr/bin/tar (probe only)', 'POSIX file modes (validation outcome locks are chmod 000/400)'] };

  return { codeClosure, sourceIdentities, models, laneState, trackedRecords, exclusions, localData, custody, freezeBinding, runtime };
}

/** Load the working-tree exclusion loaders fail-closed and ask them about every retired block. Read-only. */
export async function exerciseExclusions() {
  try {
    const ex = await import(pathToFileURL(resolve(SK1_LANE, 'infra/exclusions.mjs')).href), su = await import(pathToFileURL(resolve(SK1_LANE, 'successor/exclusions-v2.mjs')).href);
    const ctx = ex.loadSk1Exclusions(), sctx = su.loadSuccessorExclusions(), range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i), rejected = (c, bs) => bs.filter((b) => /^FORBIDDEN_BLOCK_/.test(ex.blockFailures(c, b)[0] ?? ''));
    return { loadable: true, registryHash: ctx.registryHash, forbiddenBlocks: Object.keys(ctx.forbidden).length, blocks901to914Rejected: rejected(ctx, range(901, 914)).length, of901to914: 14, successorForbiddenBlocks: Object.keys(sctx.forbidden).length, blocks801to837RejectedBySuccessor: rejected(sctx, range(801, 837)).length, of801to837: 37, blocks901to914RejectedBySuccessor: rejected(sctx, range(901, 914)).length };
  } catch (e) { return { loadable: false, error: String(e.message).split(REPO).join('<repo>').slice(0, 300) }; }
}

/** Facts that change with the machine or the moment; reported, never compared. */
export function volatileFacts() {
  const facts = gitFacts(), prot = protectedIdentities() ?? [];
  const volumes = existsSync('/Volumes') ? readdirSync('/Volumes').filter((n) => !/^(Macintosh HD|Macintosh HD - Data|Recovery|Preboot|VM|Update|com\.apple\.TimeMachine\.localsnapshots)$/.test(n)) : [];
  let timeMachine; try { const o = execFileSync('/usr/bin/tmutil', ['destinationinfo'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); timeMachine = /No destinations configured/i.test(o) ? 'NO_DESTINATION_CONFIGURED' : 'DESTINATION_CONFIGURED'; } catch (e) { timeMachine = /No destinations configured/i.test(String(e.stdout) + String(e.stderr)) ? 'NO_DESTINATION_CONFIGURED' : 'NOT_DETERMINABLE'; }
  const refs = facts.git('for-each-ref', '--format=%(refname)').split('\n').filter(Boolean), blobs = new Set(prot.map((r) => r.blob));
  const inStore = prot.filter((r) => { try { execFileSync(GIT, ['-C', REPO, 'cat-file', '-e', r.blob], { stdio: 'ignore' }); return true; } catch { return false; } }).length;
  const reach = (ref) => facts.git('rev-list', '--objects', ref).split('\n').reduce((n, l) => n + (blobs.has(l.slice(0, 40)) ? 1 : 0), 0);
  const reachByRef = refs.map((r) => ({ ref: r.startsWith('refs/codex/') ? 'refs/codex/…' : r, protectedBlobsReachable: reach(r) }));
  let ahead = null; try { ahead = Number(facts.git('rev-list', '--count', 'origin/main..HEAD').trim()); } catch { ahead = null; }
  return { repoHead: facts.head, branch: facts.branch, node: process.version, platform: `${process.platform}-${process.arch}`,
    backup: { externalVolumes: volumes, timeMachine, candidateDestinationVisible: volumes.length > 0 || timeMachine === 'DESTINATION_CONFIGURED', independentBackupVerified: false,
      statement: 'No backup was created or restored by this stage. INDEPENDENT_BACKUP_VERIFIED stays false until a separate copy has been made AND restored AND verified with repro/backup-manifest.mjs.' },
    git: { refs: refs.length, remotes: facts.git('remote').split('\n').filter(Boolean), commitsAheadOfOriginMain: ahead, stashEntries: facts.git('stash', 'list').split('\n').filter(Boolean).length, remotePushAuthorized: false },
    protectedBlobs: { identities: prot.length, objectsPresentInLocalObjectStore: inStore, reachableFromHead: reach('HEAD'), reachableByRef: reachByRef.filter((r) => r.protectedBlobsReachable > 0),
      note: 'Observation only. Protected source is absent from the HEAD tree and from the history of main; where its blob objects survive in this clone they do so through other local refs. The probe and the inventory never read them from git.' } };
}

export function verdicts(core, probe, excl) {
  const A = probe?.stageA_headOnly, C = probe?.stageC_supplemented, inf = core.codeClosure.byGroupAndClass.inference, ev = core.codeClosure.byGroupAndClass.evaluation;
  if (!probe) return { CLEAN_CHECKOUT_INFERENCE_REPRODUCIBLE: 'NOT_PROBED', CLEAN_CHECKOUT_EVALUATION_REPRODUCIBLE: Object.keys(ev).every((k) => k === CLASS.EQ) ? 'NOT_PROBED' : false, EVALUATION_CHECK_REPRODUCIBLE_WITH_DECLARED_SUPPLEMENTS: 'NOT_PROBED', CLEAN_CHECKOUT_FULL_TEST_SUITE: 'NOT_PROBED',
    EXCLUSION_REGISTRY_ENFORCED_IN_WORKING_TREE: Boolean(excl?.loadable && excl.blocks901to914Rejected === 14 && excl.blocks801to837RejectedBySuccessor === 37), EXCLUSION_LOADER_LOADABLE_FROM_CLEAN_CHECKOUT: 'NOT_PROBED',
    SOURCE_CUSTODY_PASS: Boolean(core.custody.guardManifestIntact && core.custody.trackedAtHead === 0 && core.custody.matchingRecordedIdentity === core.custody.protectedIdentities && core.custody.closureFilesDifferingFromSk1CustodyManifest.length === 0), SK1_FROZEN_EXPERIMENT_UNCHANGED_ON_DISK: core.freezeBinding.allOk && core.laneState.trackedFilesDifferingFromHead.length === 0, INDEPENDENT_BACKUP_VERIFIED: false };
  return {
    CLEAN_CHECKOUT_INFERENCE_REPRODUCIBLE: Boolean(Object.keys(inf).every((k) => k === CLASS.EQ) && A && A.inferenceGraph.evaluatorFree && A.demo.every((d) => d.equalsCommittedDemoRecord && d.replayReproduced) && A.tests.files.filter((t) => /kernel|graph|second-game/.test(t.file)).every((t) => t.fail === 0 && t.pass === t.tests)),
    CLEAN_CHECKOUT_EVALUATION_REPRODUCIBLE: Boolean(Object.keys(ev).every((k) => k === CLASS.EQ) && A && A.checkMode.exit === 0),
    EVALUATION_CHECK_REPRODUCIBLE_WITH_DECLARED_SUPPLEMENTS: Boolean(C && C.check && C.check.pass),
    CLEAN_CHECKOUT_FULL_TEST_SUITE: A ? `${A.tests.totals.pass} pass, ${A.tests.totals.skipped} skipped, ${A.tests.files.filter((t) => t.exit !== 0).length} test files fail to load` : 'NOT_PROBED',
    EXCLUSION_REGISTRY_ENFORCED_IN_WORKING_TREE: Boolean(excl?.loadable && excl.blocks901to914Rejected === 14 && excl.blocks801to837RejectedBySuccessor === 37),
    EXCLUSION_LOADER_LOADABLE_FROM_CLEAN_CHECKOUT: A ? A.evaluationEntryPoints.find((e) => e.entry === 'infra/exclusions.mjs')?.node === 'IMPORTS' : null,
    SOURCE_CUSTODY_PASS: Boolean(core.custody.guardManifestIntact && core.custody.trackedAtHead === 0 && core.custody.matchingRecordedIdentity === core.custody.protectedIdentities && core.custody.closureFilesDifferingFromSk1CustodyManifest.length === 0),
    SK1_FROZEN_EXPERIMENT_UNCHANGED_ON_DISK: core.freezeBinding.allOk && core.laneState.trackedFilesDifferingFromHead.length === 0,
    INDEPENDENT_BACKUP_VERIFIED: false,
  };
}

/** Compare a stored inventory with a recomputed core. Returns { ok, drift, failedChecks }. Pure. */
export function verifyAgainst(stored, core, excl) {
  const drift = stored?.schema === SCHEMA ? deepDiff(stored.core, core) : ['$: inventory missing or wrong schema'];
  const failed = [...core.freezeBinding.checks.filter((c) => !c.ok).map((c) => `FREEZE:${c.name}`), ...(core.custody.guardManifestIntact ? [] : ['CUSTODY:GUARD_MANIFEST_NOT_INTACT']), ...(core.custody.trackedAtHead === 0 ? [] : ['CUSTODY:PROTECTED_PATH_TRACKED']),
    ...(core.custody.matchingRecordedIdentity === core.custody.protectedIdentities ? [] : ['CUSTODY:PROTECTED_FILE_DIFFERS_FROM_RECORDED_IDENTITY']), ...core.custody.closureFilesDifferingFromSk1CustodyManifest.map((f) => `CUSTODY:DIFFERS_FROM_SK1_CUSTODY_MANIFEST:${f}`),
    ...(core.exclusions.registry.declaredHashVerifies ? [] : ['EXCLUSIONS:REGISTRY_HASH']), ...(core.exclusions.trackedRecordsAlone && (core.exclusions.trackedRecordsAlone.blocks901to914Listed !== 14 || core.exclusions.trackedRecordsAlone.blocks801to837Listed !== 37) ? ['EXCLUSIONS:RETIRED_BLOCK_MISSING_FROM_TRACKED_RECORDS'] : []), ...core.exclusions.sealedRegistries.filter((r) => !r.matchesRecorded).map((r) => `EXCLUSIONS:SEALED_REGISTRY_CHANGED:${r.name}`), ...core.exclusions.successor.registries.filter((r) => !r.matchesRecorded).map((r) => `EXCLUSIONS:SK1_REGISTRY_CHANGED:${r.file}`),
    ...(excl && excl.loadable && (excl.blocks901to914Rejected !== 14 || excl.blocks801to837RejectedBySuccessor !== 37) ? ['EXCLUSIONS:RETIRED_BLOCK_NOT_REJECTED'] : []), ...(excl && !excl.loadable ? ['EXCLUSIONS:LOADER_NOT_LOADABLE'] : [])];
  return { ok: drift.length === 0 && failed.length === 0, drift, failedChecks: failed };
}

const summary = (core, v) => ({ closure: { files: core.codeClosure.fileCount, byClass: core.codeClosure.byClass, byGroup: core.codeClosure.byGroupAndClass, npmPackages: core.codeClosure.npmPackages }, sourceIdentities: Object.fromEntries(Object.entries(core.sourceIdentities).map(([k, s]) => [k, `${s.files} files ${s.closureSha256.slice(0, 12)} ${JSON.stringify(s.byClass ?? {})}`])),
  models: core.models.map((m) => `${m.model}:${m.class}`), lane: core.laneState, local: { files: core.localData.fileCount, bytes: core.localData.bytes, groups: Object.fromEntries(Object.entries(core.localData.groups).map(([g, x]) => [g, `${x.files} files, ${x.bytes} B, ${JSON.stringify(x.boundBy)}`])) },
  custody: { identities: core.custody.protectedIdentities, matching: core.custody.matchingRecordedIdentity, tracked: core.custody.trackedAtHead, inClosure: core.custody.inSk1EvaluationClosure, guardIntact: core.custody.guardManifestIntact }, freeze: core.freezeBinding.checks.map((c) => `${c.name}:${c.ok ? 'ok' : 'DRIFT'}(${c.items})`), verdicts: v });

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] === 'verify' ? 'verify' : process.argv.includes('--write') ? 'write' : 'print', core = await buildCore(), excl = await exerciseExclusions();
  if (mode === 'verify') {
    const stored = existsSync(INVENTORY_FILE) ? readJ(INVENTORY_FILE) : null, r = verifyAgainst(stored, core, excl);
    console.log(JSON.stringify({ mode: 'verify', wroteAnything: false, inventory: stored ? { coreSha256: stored.coreSha256, recomputedCoreSha256: sha(stable(core)), generatedAtHead: stored.repoHead } : null, exclusions: excl, freezeChecks: core.freezeBinding.checks.map((c) => `${c.name}:${c.ok ? 'ok' : 'DRIFT'}`), drift: r.drift, failedChecks: r.failedChecks, result: r.ok ? 'SK1_1_INVENTORY_VERIFY_PASS' : 'SK1_1_INVENTORY_VERIFY_FAILED' }, null, 1));
    if (!r.ok) process.exitCode = 1;
  } else {
    const probe = mode === 'write' && !process.argv.includes('--no-probe') ? runProbe({ log: (m) => console.error(`[probe] ${m}`) }) : null, vol = volatileFacts(), v = verdicts(core, probe, excl);
    console.log(JSON.stringify(summary(core, v), null, 1));
    if (mode === 'write') { const rec = { schema: SCHEMA, authority: 'R0', stage: 'STAGE3H-SK1.1 Phase 1', generatedAt: new Date().toISOString(), ...vol, disclosure: 'Identities only: paths, sizes, modes and sha256. No seed, world hash, per-class coordinate or evaluator truth. `core` is recomputable and is what `verify` compares; everything else is a dated observation.',
      verdicts: v, exclusionLoaders: excl, coreSha256: sha(stable(core)), core, cleanCheckoutProbe: probe };
      writeFileSync(INVENTORY_FILE, JSON.stringify(rec, null, 1) + '\n', { flag: 'wx' }); console.log('written ' + relative(REPO, INVENTORY_FILE)); }
  }
}
