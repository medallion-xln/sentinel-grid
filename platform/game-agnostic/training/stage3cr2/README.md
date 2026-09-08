# Stage 3C-R.2 — Learned Nexus training campaign

`LEARNED_NEXUS_SFT_V1` — the first real learned Sentinel Grid expert candidate.

Campaign `STAGE3CR2-ca6847dafb04b823afd2f13a`. **Frozen.** One configuration, no sweep.

## Status

Everything through LoRA attach and live training **passed on an Apple M1 Pro / 16 GB**.
The run then stalled on system memory, not on model capability — see
`../../artifacts/stage3cr2-local-training/stage3cr2-compute-blocker.json`.

| Measured on M1 Pro (bs=1, seq≈320) | Value |
|---|---|
| Throughput | 1.04 s/step, 309 tok/s |
| Peak accelerator memory | 4.42 GB |
| Projected full run | ~2.6 h |
| Observed in practice | 19–21 s/optimizer-step for 12 steps, then swap thrash |

`batch_size=1` is a **measured constraint**. Qwen3's 151,936-token vocabulary makes the
full-sequence logits tensor dominate training memory: bs=2 collapsed to 48 tok/s at
11.3 GB, bs=4 hit OOM at 18.45 GiB. Effective batch is held at 16 by accumulation.

On a machine with ≥24 GB free (or any CUDA GPU) the ceiling disappears, and
`batch_size` may be raised — but that is a **new campaign identity**, not this one.
Re-freeze and re-hash if you change it.

## Nothing large is stored in git

The model re-downloads from its pinned revision and the corpora regenerate from pinned
seeds. That is the point of the lineage design.

| Artifact | Size | How it comes back |
|---|---|---|
| Qwen3-0.6B weights | 1.4 GB | `acquire_base_model.py` at pinned revision, hash-verified |
| Stage 3B/3B.1 corpora | 748 MB | `generate-stage3b1-corpus.mjs` — deterministic |
| SFT view + eval prompts | 12 MB | `export-stage3cr2-sft-view.mjs` — verified against frozen hash |
| Python stack | ~3 GB | `requirements.txt` |

## Resume

Run from a work directory; the config uses relative paths.

```bash
# 0. work dir
mkdir -p ~/stage3cr2 && cd ~/stage3cr2
export SENTINEL_GRID=/path/to/sentinel-grid/platform/game-agnostic

# 1. environment (Python 3.11 or 3.12; NOT 3.14 — torch has no wheel)
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r "$SENTINEL_GRID/training/stage3cr2/requirements.txt"
git clone https://github.com/MakazhanAlpamys/Soup.git soup
git -C soup checkout f07e07ed7edd548a4d1d9143f77af9027b1b7036
pip install -e soup
soup doctor      # bitsandbytes MISSING is expected and intended: LoRA, not QLoRA

# 2. base model, provenance-verified (aborts on any hash mismatch)
python "$SENTINEL_GRID/training/stage3cr2/acquire_base_model.py" ./models/Qwen3-0.6B

# 3. dataset lineage (deterministic; ~25 min, 4 workers)
cd "$SENTINEL_GRID"
node scripts/generate-stage3b1-corpus.mjs
node scripts/generate-stage3b1-corpus.mjs --pilot
npm run forge:stage3b1:check        # must report reproduced=true
node scripts/export-stage3cr2-sft-view.mjs ~/stage3cr2/campaign

# 4. train  (TRAIN split only; VALIDATION/HOLDOUT/OOD never touched)
cd ~/stage3cr2
soup train -c "$SENTINEL_GRID/training/stage3cr2/soup-nexus-sft-v1.yaml" \
           -n nexus-sft-v1 --yes 2>&1 | tee train.log

# 5. VALIDATION only — this is the sole model-selection surface
export SENTINEL_BASE_MODEL_PATH=./models/Qwen3-0.6B
python "$SENTINEL_GRID/training/stage3cr2/infer.py" \
    --prompts campaign/prompts-VALIDATION.jsonl \
    --adapter campaign/out-nexus-sft-v1 \
    --out gen-VALIDATION.jsonl --batch 32
node "$SENTINEL_GRID/scripts/evaluate-stage3cr2-candidate.mjs" \
    VALIDATION gen-VALIDATION.jsonl eval-VALIDATION.json

# 6. FREEZE: pick the candidate and ONE hybrid rule from eval-VALIDATION.json.
#    Record the chosen tau. After this point there is no more tuning.

# 7. only now open the sealed splits, passing the frozen tau
for S in HOLDOUT OOD; do
  python "$SENTINEL_GRID/training/stage3cr2/infer.py" \
      --prompts campaign/prompts-$S.jsonl --adapter campaign/out-nexus-sft-v1 \
      --out gen-$S.jsonl --batch 32
  node "$SENTINEL_GRID/scripts/evaluate-stage3cr2-candidate.mjs" \
      $S gen-$S.jsonl eval-$S.json <TAU>
done
```

`infer.py` resumes: it skips any `recordHash` already present in `--out`, so an
interrupted generation pass can be restarted without losing work.

## Discipline this campaign is bound to

- **TRAIN only for optimization.** The exporter aborts with `TRAINING_LEAKAGE` if the
  SFT view ever contains a non-TRAIN record, and aborts on any SFT hash drift.
- **HOLDOUT and OOD stay sealed until after the freeze.** Steps 5→6→7 are ordered for
  that reason; running step 7 early invalidates the generalization claim.
- **No trained abstention is claimed.** Only ~20 negative controls exist in 50,860 TRAIN
  records, so this candidate does structured action selection only.
- **The candidate is never certified here.** `TRAINED_OFFLINE_CANDIDATE` at most.
  Authority stays R0; it cannot dispatch, cannot mutate the world, is not loaded by the
  live Router or Prime, and the deterministic Nexus remains the incumbent.

## Baseline bar (300 VALIDATION records, deterministic policies)

| Policy | Optimal-set accuracy |
|---|---|
| Heuristic greedy | 21.3% |
| Random legal | 20.0% |
| Prime (MCTS, 24 sims) | 20.0% |
| `NEXUS_RELATIONAL_SELECTOR_V1` | 17.8% (19.7% abstention) |

The task is hard and the bar is real. A complementary candidate — one that is right
where the deterministic selector is wrong — is a legitimate success even if its
headline accuracy does not lead.

## Template

`SENTINEL_NEXUS_TEMPLATE_V1`: Soup converts the alpaca row to
`[user: instruction, assistant: output]` and applies Qwen3's chat template, which emits
an **empty `<think></think>` block** before the JSON. `infer.py` reproduces that exactly
and parses the JSON after `</think>`. Training and inference must not diverge here.
