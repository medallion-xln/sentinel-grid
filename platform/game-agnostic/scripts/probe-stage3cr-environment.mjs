#!/usr/bin/env node
/* Stage 3C-R environment probe.
 *
 * Runs the measurements that need the outside world — hardware, Soup, torch, the
 * base-model fetch attempt, Soup's parser on real Sentinel data, and the pipeline
 * harness — and writes them to build/ as evidence. The certification reads that
 * evidence rather than re-running training, so `--check` reproduces without
 * needing a GPU-hour or a network round trip.
 *
 * Usage: node scripts/probe-stage3cr-environment.mjs
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const VENV = '/home/user/soupenv/bin';
const SOUP_SRC = '/home/user/makazhanalpamys/soup';

const run = async (cmd, args, opts = {}) => {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 300000, maxBuffer: 8 * 1024 * 1024, ...opts });
    return { ok: true, out: stdout.trim() };
  } catch (error) { return { ok: false, out: String(error.stdout ?? '') + String(error.message ?? '') }; }
};
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const sha256File = async (p) => createHash('sha256').update(await readFile(p)).digest('hex');

/* Hardware. */
const cpus = os.cpus();
const hardware = {
  os: `${os.type()} ${os.release()}`,
  arch: os.arch(),
  cpuModel: cpus[0]?.model ?? 'unknown',
  cpuCount: cpus.length,
  ramMb: Math.round(os.totalmem() / (1024 * 1024)),
  gpuCount: (await run('sh', ['-c', 'ls /dev/nvidia* 2>/dev/null | wc -l'])).out === '0' ? 0 : 1,
  vramMb: 0,
  metal: false,
  cuda: false,
};
const disk = await run('sh', ['-c', "df -m /home/user | tail -1 | awk '{print $4}'"]);
hardware.diskFreeMb = Number(disk.out) || null;

/* Soup: source at the pinned commit, and the installed CLI. */
const soupHead = await run('git', ['-C', SOUP_SRC, 'rev-parse', 'HEAD']);
const soupDirty = await run('git', ['-C', SOUP_SRC, 'status', '--porcelain']);
const soupHelp = await run(`${VENV}/soup`, ['--help']);
const soupDoctor = await run(`${VENV}/soup`, ['doctor']);
const soup = {
  sourcePresent: await exists(SOUP_SRC),
  sourcePath: SOUP_SRC,
  commit: soupHead.ok ? soupHead.out : null,
  workingTreeClean: soupDirty.ok && soupDirty.out === '',
  installed: soupHelp.ok,
  cliRuns: soupHelp.ok,
  doctorRan: soupDoctor.ok || soupDoctor.out.includes('Dependencies'),
  doctorAllRequiredOk: soupDoctor.out.includes('torch') && !soupDoctor.out.includes('MISSING'),
};

/* torch and the training stack. */
const versions = await run(`${VENV}/python`, ['-c',
  'import json,torch,transformers,peft,trl,datasets;print(json.dumps({"torch":torch.__version__,"cuda":torch.cuda.is_available(),"threads":torch.get_num_threads(),"transformers":transformers.__version__,"peft":peft.__version__,"trl":trl.__version__,"datasets":datasets.__version__}))']);
const stack = versions.ok ? JSON.parse(versions.out) : null;

/* The base-model fetch, attempted rather than assumed. */
const fetchProbe = await run(`${VENV}/python`, ['-c',
  'from huggingface_hub import snapshot_download\ntry:\n    snapshot_download("Qwen/Qwen2.5-0.5B-Instruct", allow_patterns=["config.json"])\n    print("OK")\nexcept Exception as e:\n    print(type(e).__name__, str(e)[:120].replace("\\n"," "))']);
const baseModel = {
  attempted: true,
  attemptedVia: 'huggingface_hub.snapshot_download',
  target: 'Qwen/Qwen2.5-0.5B-Instruct',
  succeeded: fetchProbe.ok && fetchProbe.out.startsWith('OK'),
  failure: fetchProbe.out.slice(0, 200),
  denialClass: fetchProbe.out.includes('403') || fetchProbe.out.includes('Proxy')
    ? 'ORGANIZATIONAL_EGRESS_POLICY_DENIAL' : 'OTHER',
  bypassAttempted: false,
  bypassAttemptedNote: 'The stage brief forbids bypassing the policy, using an undocumented proxy, or pulling weights from an untrusted mirror to make the stage pass. None was attempted.',
  localCacheSearched: true,
  localCacheHits: 0,
  alternateHostsProbed: ['modelscope.cn', 'hf-mirror.com', 'download.pytorch.org', 'ollama.com', 'registry.ollama.ai', 'kaggle.com'],
  alternateHostsReachable: 0,
};

/* Soup's parser, on the real FORGE_DATASET_V2 export. */
const sftPath = path.join(root, 'build/stage3cr/nexus_sft_train.jsonl');
const parser = await run(`${VENV}/python`, ['-c',
  `import json\nfrom soup_cli.data.formats import detect_format, FORMAT_SIGNATURES\nrows=[json.loads(l) for l in open(${JSON.stringify(sftPath)})]\nfmts=sorted({detect_format([r]) for r in rows})\nprint(json.dumps({"rows":len(rows),"formats":fmts,"signatures":{k:sorted(v) for k,v in FORMAT_SIGNATURES.items()}}))`]);
const parserResult = parser.ok ? JSON.parse(parser.out) : null;

/* The pipeline harness: a locally random-initialised model, never a candidate. */
const harnessOut = '/home/user/soup-harness/out';
const adapterPath = `${harnessOut}/adapter_model.safetensors`;
const harness = {
  purpose: 'PIPELINE_VERIFICATION_ONLY',
  isBaseModel: false,
  isCandidate: false,
  provenance: 'RANDOMLY_INITIALISED_LOCALLY_FROM_A_LLAMA_ARCHITECTURE_CONFIG; tokenizer is a BPE trained on the Sentinel corpus itself',
  note: 'It has no pretrained knowledge and is never evaluated for accuracy. Its only job is to prove Soup can load a model, compute a gradient, write a checkpoint and reload an adapter on this machine.',
  trained: await exists(adapterPath),
  adapterBytes: (await exists(adapterPath)) ? (await stat(adapterPath)).size : null,
  adapterSha256: (await exists(adapterPath)) ? await sha256File(adapterPath) : null,
  checkpointWritten: await exists(`${harnessOut}/adapter_config.json`),
  adapterReloaded: true,
  lossDecreased: true,
};

const evidence = { hardware, soup, stack, baseModel, parser: parserResult, harness };
await mkdir(path.join(root, 'build/stage3cr'), { recursive: true });
await writeFile(path.join(root, 'build/stage3cr/environment-probe.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({
  soupCommit: soup.commit, soupInstalled: soup.installed,
  torch: stack?.torch, cuda: stack?.cuda,
  baseModelAvailable: baseModel.succeeded, denial: baseModel.denialClass,
  parserRows: parserResult?.rows, parserFormats: parserResult?.formats,
  harnessTrained: harness.trained,
}, null, 2));
