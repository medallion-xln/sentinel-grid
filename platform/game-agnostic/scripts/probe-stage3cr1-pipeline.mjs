#!/usr/bin/env node
/* Stage 3C-R.1 Phase 0 pipeline probe.
 *
 * Stage 3C-R measured the training pipeline on a machine that no longer exists;
 * this container was reprovisioned. Re-running the loop is the whole point: a
 * pipeline that passed once on a machine that is gone is not evidence about this
 * one. Every step is executed, not assumed.
 *
 * The base is the Stage 3C-R pipeline harness — randomly initialised, no
 * pretrained provenance. It is NOT a base model and its output is NOT a candidate.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'stage3cr1');
const VENV = process.env.SENTINEL_SOUP_VENV ?? '/home/user/soupenv';
const HARNESS = process.env.SENTINEL_SOUP_HARNESS ?? '/home/user/soup-harness';
const SOUP_SRC = process.env.SENTINEL_SOUP_SRC ?? '/home/user/makazhanalpamys/soup';

function run(cmd, args, opts = {}) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout ?? 900000, cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }) };
  } catch (error) {
    return { ok: false, out: String(error.stdout ?? ''), error: String(error.message ?? error).slice(0, 400) };
  }
}

const py = path.join(VENV, 'bin', 'python');
const soup = path.join(VENV, 'bin', 'soup');
const evidence = { probeVersion: 1, venv: VENV, harness: HARNESS, soupSource: SOUP_SRC };

/* Stack. */
const stack = run(py, ['-c', 'import json,torch,transformers,peft,trl,datasets;print(json.dumps({"torch":torch.__version__,"cuda":torch.cuda.is_available(),"threads":torch.get_num_threads(),"transformers":transformers.__version__,"peft":peft.__version__,"trl":trl.__version__,"datasets":datasets.__version__}))'], { timeout: 180000 });
evidence.stack = stack.ok ? JSON.parse(stack.out.trim()) : null;
evidence.torchAvailable = stack.ok;

/* Soup identity, from its own checkout. */
const ver = run(soup, ['version'], { timeout: 120000 });
evidence.soupExecutable = ver.ok;
evidence.soupVersion = ver.ok ? (ver.out.match(/soup v([0-9.]+)/)?.[1] ?? null) : null;
const commit = run('git', ['-C', SOUP_SRC, 'rev-parse', 'HEAD'], { timeout: 60000 });
evidence.soupCommit = commit.ok ? commit.out.trim() : null;
const dirty = run('git', ['-C', SOUP_SRC, 'status', '--porcelain'], { timeout: 60000 });
evidence.soupWorkingTreeClean = dirty.ok && dirty.out.trim().length === 0;

/* Dataset parse — every row of the real export, through Soup's own detector. */
const trainJsonl = path.join(root, 'build/stage3cr/nexus_sft_train.jsonl');
const parse = run(py, ['-c', `
import json,sys
sys.path.insert(0, ${JSON.stringify(path.join(SOUP_SRC, 'src'))})
from soup_cli.data.formats import detect_format
rows=[json.loads(l) for l in open(${JSON.stringify(trainJsonl)})]
per={detect_format([r]) for r in rows}
print(json.dumps({"rows":len(rows),"whole":str(detect_format(rows)),"perRow":sorted(str(x) for x in per)}))
`], { timeout: 300000 });
evidence.datasetParse = parse.ok ? JSON.parse(parse.out.trim()) : null;
evidence.datasetParsePass = parse.ok && evidence.datasetParse.perRow.length === 1 && evidence.datasetParse.perRow[0] === 'alpaca';

/* Train loop, freshly executed. */
const outPath = path.join(HARNESS, 'out-phase0');
const cfg = path.join(HARNESS, 'soup-phase0.yaml');
const started = Date.now();
const train = existsSync(cfg) ? run(soup, ['train', '-c', cfg, '--yes'], { cwd: HARNESS, timeout: 900000 }) : { ok: false, out: '', error: 'PHASE0_CONFIG_ABSENT' };
evidence.trainWallSeconds = Number(((Date.now() - started) / 1000).toFixed(2));
evidence.trainLoopPass = train.ok;
const lossPair = train.out.match(/Loss:\s*([0-9.]+)\s*->\s*([0-9.]+)/);
evidence.lossStart = lossPair ? Number(lossPair[1]) : null;
evidence.lossEnd = lossPair ? Number(lossPair[2]) : null;
const sps = train.out.match(/'train_samples_per_second':\s*'([0-9.]+)'/);
evidence.trainSamplesPerSecond = sps ? Number(sps[1]) : null;
const steps = train.out.match(/'train_runtime':\s*'([0-9.]+)'/);
evidence.trainRuntimeSeconds = steps ? Number(steps[1]) : null;
if (!train.ok) evidence.trainError = train.error;

/* Checkpoint write, adapter reload, inference. */
const reload = run(py, ['-c', `
import json,hashlib,os,torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
base=${JSON.stringify(path.join(HARNESS, 'tiny-harness'))}; out=${JSON.stringify(outPath)}
tok=AutoTokenizer.from_pretrained(out)
m=PeftModel.from_pretrained(AutoModelForCausalLM.from_pretrained(base), out).eval()
with torch.no_grad():
    g=m.generate(**tok("select an action", return_tensors="pt"), max_new_tokens=8, do_sample=False)
p=os.path.join(out,'adapter_model.safetensors')
print(json.dumps({"adapterReload":True,"inference":True,"tokens":int(g.shape[-1]),
  "adapterBytes":os.path.getsize(p),
  "adapterSha256":hashlib.sha256(open(p,'rb').read()).hexdigest()}))
`], { timeout: 600000 });
const reloadJson = reload.ok ? JSON.parse(reload.out.trim().split('\n').pop()) : null;
evidence.checkpointWritePass = existsSync(path.join(outPath, 'adapter_model.safetensors'));
evidence.adapterReloadPass = reloadJson?.adapterReload === true;
evidence.inferencePass = reloadJson?.inference === true;
evidence.adapterBytes = reloadJson?.adapterBytes ?? null;
evidence.adapterSha256 = reloadJson?.adapterSha256 ?? null;
if (!reload.ok) evidence.reloadError = reload.error;

evidence.loraApplicationPass = evidence.trainLoopPass && evidence.adapterReloadPass;
evidence.pipelineAllPass = [
  evidence.soupExecutable, evidence.torchAvailable, evidence.datasetParsePass,
  evidence.trainLoopPass, evidence.loraApplicationPass, evidence.checkpointWritePass,
  evidence.adapterReloadPass, evidence.inferencePass,
].every(Boolean);

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'pipeline-probe.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({
  soupVersion: evidence.soupVersion, soupCommit: evidence.soupCommit,
  datasetParsePass: evidence.datasetParsePass, rows: evidence.datasetParse?.rows,
  trainLoopPass: evidence.trainLoopPass, loss: `${evidence.lossStart} -> ${evidence.lossEnd}`,
  adapterSha256: evidence.adapterSha256, pipelineAllPass: evidence.pipelineAllPass,
}, null, 2));
