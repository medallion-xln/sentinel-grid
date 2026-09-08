#!/usr/bin/env node
/* Stage 3C-R.1 acquisition probe.
 *
 * Writes what was actually observed about local model inventory, acquisition
 * channels, and the supplied model path. It measures; it does not decide. The
 * certifier reads this file and applies the gate. */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSuppliedPath } from '../src/lab/stage3cr1-base-model-acquisition.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'stage3cr1');

function sh(cmd, args, timeout = 40000) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim() };
  } catch (error) {
    return { ok: false, out: '', error: String(error.message ?? error).slice(0, 200) };
  }
}

/* --- PHASE 1: local inventory, only in legitimate model locations. --------- */
const INVENTORY_LOCATIONS = [
  { id: 'HF_HUB_CACHE', path: path.join(process.env.HOME ?? '/root', '.cache/huggingface/hub') },
  { id: 'HF_CACHE', path: path.join(process.env.HOME ?? '/root', '.cache/huggingface') },
  { id: 'TORCH_CACHE', path: path.join(process.env.HOME ?? '/root', '.cache/torch') },
  { id: 'TRANSFORMERS_CACHE', path: path.join(process.env.HOME ?? '/root', '.cache/transformers') },
  { id: 'OLLAMA_MODELS', path: path.join(process.env.HOME ?? '/root', '.ollama/models') },
  { id: 'SOUP_HARNESS', path: '/home/user/soup-harness' },
];

function inventoryLocation(loc) {
  if (!existsSync(loc.path)) return { ...loc, present: false, entries: 0, artifacts: [] };
  const artifacts = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const names = entries.map((e) => e.name);
    if (names.includes('config.json')) {
      artifacts.push({ path: dir, files: names.slice().sort() });
    }
    for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
  };
  walk(loc.path, 0);
  return { ...loc, present: true, entries: readdirSync(loc.path).length, artifacts };
}

const inventory = INVENTORY_LOCATIONS.map(inventoryLocation);

/* --- PHASE 3: Ollama. ----------------------------------------------------- */
const ollamaBinary = sh('sh', ['-c', 'command -v ollama || true']);
const ollama = {
  installed: ollamaBinary.ok && ollamaBinary.out.length > 0,
  binary: ollamaBinary.out || null,
  storePresent: existsSync(path.join(process.env.HOME ?? '/root', '.ollama/models')),
  models: [],
  qwenFamilyPresent: false,
  classification: 'NOT_INSTALLED',
};
if (ollama.installed) {
  const listed = sh('ollama', ['list']);
  ollama.models = listed.ok ? listed.out.split('\n').slice(1).filter(Boolean) : [];
  ollama.qwenFamilyPresent = ollama.models.some((m) => /qwen/i.test(m));
  ollama.classification = ollama.models.length > 0 ? 'INFERENCE_ONLY_NOT_SOUP_TRAINABLE' : 'INSTALLED_NO_MODELS';
}

/* --- PHASE 4: channels. Each is probed; none is worked around. ------------- */
const CHANNELS = [
  { channel: 'PYPI', host: 'pypi.org', kind: 'PACKAGE_INDEX' },
  { channel: 'PYTHONHOSTED', host: 'files.pythonhosted.org', kind: 'PACKAGE_FILES' },
  { channel: 'GITHUB_GIT_ANONYMOUS', host: 'github.com', kind: 'GIT_READ', probe: 'git' },
  { channel: 'GITHUB_HTTP', host: 'github.com', kind: 'HTTP_DOWNLOAD', probePath: '/karpathy/llama2.c/archive/refs/heads/master.tar.gz' },
  { channel: 'GITHUB_API', host: 'api.github.com', kind: 'API' },
  { channel: 'GCS', host: 'storage.googleapis.com', kind: 'OBJECT_STORE' },
  { channel: 'S3', host: 's3.amazonaws.com', kind: 'OBJECT_STORE' },
  { channel: 'GITLAB', host: 'gitlab.com', kind: 'GIT_HOST' },
  { channel: 'HUGGINGFACE', host: 'huggingface.co', kind: 'MODEL_HOST' },
  { channel: 'HUGGINGFACE_CDN', host: 'cdn-lfs.huggingface.co', kind: 'MODEL_HOST' },
  { channel: 'HF_MIRROR', host: 'hf-mirror.com', kind: 'MODEL_HOST' },
  { channel: 'MODELSCOPE', host: 'modelscope.cn', kind: 'MODEL_HOST' },
  { channel: 'PYTORCH_DOWNLOAD', host: 'download.pytorch.org', kind: 'MODEL_HOST' },
  { channel: 'OLLAMA_REGISTRY', host: 'registry.ollama.ai', kind: 'MODEL_HOST' },
  { channel: 'KAGGLE', host: 'www.kaggle.com', kind: 'MODEL_HOST' },
  { channel: 'OPENAI_PUBLIC', host: 'openaipublic.blob.core.windows.net', kind: 'MODEL_HOST' },
  { channel: 'ZENODO', host: 'zenodo.org', kind: 'ARTIFACT_ARCHIVE' },
  { channel: 'ARCHIVE_ORG', host: 'archive.org', kind: 'ARTIFACT_ARCHIVE' },
  { channel: 'FIGSHARE', host: 'figshare.com', kind: 'ARTIFACT_ARCHIVE' },
];

function probeChannel(c) {
  const url = `https://${c.host}${c.probePath ?? '/'}`;
  const r = sh('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '25', url], 35000);
  const code = Number.parseInt(r.out, 10);
  let status;
  if (!Number.isFinite(code) || code === 0) status = 'UNREACHABLE';
  else if (code === 403 || code === 407) status = 'DENIED_BY_POLICY';
  else status = 'AUTHORIZED';
  return { ...c, httpCode: Number.isFinite(code) ? code : 0, status, carriesAuthorizedModel: false };
}

const channels = CHANNELS.map(probeChannel);

/* The git lane is a different transport from HTTP and is probed as one: an
 * ls-remote that succeeds proves anonymous git reads work even when the same
 * host's HTTP download lane returns 403. */
const gitLane = sh('git', ['ls-remote', '--heads', 'https://github.com/karpathy/llama2.c'], 90000);
const gitChannel = channels.find((c) => c.channel === 'GITHUB_GIT_ANONYMOUS');
gitChannel.status = gitLane.ok ? 'AUTHORIZED' : 'UNREACHABLE';
gitChannel.gitLsRemote = gitLane.ok;
gitChannel.note = gitLane.ok
  ? 'Anonymous git read works. Git LFS objects are NOT served on this lane, so a repository that stores weights in LFS yields pointer stubs, not weights.'
  : 'Anonymous git read failed.';

/* The squatted-bucket finding, measured rather than remembered. */
const gcsListing = sh('curl', ['-sS', '--max-time', '25', 'https://storage.googleapis.com/storage/v1/b/gpt-2/o?maxResults=5'], 35000);
let squat = { probed: false };
if (gcsListing.ok) {
  try {
    const parsed = JSON.parse(gcsListing.out);
    const items = parsed.items ?? [];
    squat = {
      probed: true,
      bucket: 'gs://gpt-2',
      historicalUse: "the bucket openai/gpt-2's download_model.py once fetched from",
      objectCount: items.length,
      objectNames: items.map((i) => i.name),
      containsModelFiles: items.some((i) => /\.(ckpt|bin|safetensors|json)$/.test(i.name) && !/\.html$/.test(i.name)),
      firstObjectCreated: items[0]?.timeCreated ?? null,
      verdict: 'NAME_MATCHED_CONTENT_DID_NOT',
    };
  } catch { squat = { probed: true, parseFailed: true }; }
}

/* --- PHASE 6: the supplied path. Only where declared. --------------------- */
const supplied = readSuppliedPath(process.env);
const inspection = { ...supplied, exists: false, isDirectory: false, files: [], tokenizerPresent: false, architectures: [], provenance: {} };
if (supplied.declared) {
  inspection.exists = existsSync(supplied.path);
  if (inspection.exists) {
    inspection.isDirectory = statSync(supplied.path).isDirectory();
    if (inspection.isDirectory) {
      inspection.files = readdirSync(supplied.path).sort();
      inspection.tokenizerPresent = inspection.files.some((f) => ['tokenizer.json', 'tokenizer.model', 'vocab.json'].includes(f));
      if (inspection.files.includes('config.json')) {
        try {
          const cfg = JSON.parse(readFileSync(path.join(supplied.path, 'config.json'), 'utf8'));
          inspection.architectures = cfg.architectures ?? [];
          inspection.modelType = cfg.model_type ?? null;
        } catch { inspection.configUnreadable = true; }
      }
      const hashFile = (f) => createHash('sha256').update(readFileSync(path.join(supplied.path, f))).digest('hex');
      const weightFiles = inspection.files.filter((f) => f.endsWith('.safetensors') || f.endsWith('.bin'));
      inspection.provenance = {
        BASE_MODEL_PATH: supplied.path,
        CONFIG_HASH: inspection.files.includes('config.json') ? hashFile('config.json') : null,
        TOKENIZER_HASH: inspection.files.includes('tokenizer.json') ? hashFile('tokenizer.json') : null,
        WEIGHT_FILE_HASHES: weightFiles.map((f) => `${f}:${hashFile(f)}`),
        /* Everything below has to be DECLARED by whoever supplies the model. It
         * cannot be inferred from files on disk, and guessing it would be the
         * exact failure this envelope exists to prevent. */
        BASE_MODEL_ID: process.env.SENTINEL_BASE_MODEL_ID ?? null,
        BASE_MODEL_VERSION: process.env.SENTINEL_BASE_MODEL_VERSION ?? null,
        BASE_MODEL_SOURCE: process.env.SENTINEL_BASE_MODEL_SOURCE ?? null,
        BASE_MODEL_LICENSE: process.env.SENTINEL_BASE_MODEL_LICENSE ?? null,
        BASE_MODEL_PARAMETER_COUNT: Number.parseInt(process.env.SENTINEL_BASE_MODEL_PARAMETERS ?? '', 10) || null,
        AGGREGATE_MODEL_HASH: process.env.SENTINEL_BASE_MODEL_HASH ?? null,
      };
    }
  }
}

mkdirSync(outDir, { recursive: true });
const probe = { probeVersion: 1, inventory, ollama, channels, gitLane: gitChannel, squattedBucket: squat, suppliedModel: inspection };
writeFileSync(path.join(outDir, 'acquisition-probe.json'), `${JSON.stringify(probe, null, 2)}\n`);
console.log(JSON.stringify({
  inventoryArtifacts: inventory.reduce((n, l) => n + l.artifacts.length, 0),
  ollama: ollama.classification,
  authorizedChannels: channels.filter((c) => c.status === 'AUTHORIZED').map((c) => c.channel),
  deniedChannels: channels.filter((c) => c.status === 'DENIED_BY_POLICY').map((c) => c.channel),
  unreachableChannels: channels.filter((c) => c.status === 'UNREACHABLE').length,
  suppliedModelDeclared: supplied.declared,
}, null, 2));
