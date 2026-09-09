# Stage 3C-R.2 / 3C-R.3 — Learned Nexus: V1, V2A, V2B

Three trained candidates on `Qwen/Qwen3-0.6B` @ `c1899de2…`, and what they measured.
Every candidate is `TRAINED_OFFLINE_CANDIDATE`. None is certified, none can dispatch,
none is loaded by the live Router or Prime. Authority stays R0 throughout.

## The headline is a trap

| | V1 | V2A | V2B |
|---|---|---|---|
| VALIDATION accuracy | 0.7045 | **0.7106** | 0.4206 |
| Shortcut-adjusted gain | +0.0513 | +0.0574 | **−0.2326** |
| Relational-challenge accuracy | 0.0429 | 0.0536 | **0.2632** |
| Relational lift | −0.1527 | −0.1420 | **+0.0676** |

Read the top row alone and V2A is the best model. Read the bottom row and V2B is the
only one that learned anything about the graph. **Raw accuracy on this dataset is
almost entirely a measure of how willing a policy is to say `MOVE east`.**

## Why raw accuracy means so little here

`FORGE_DATASET_V2` is dominated by one action. In the 4,459-row Nexus TRAIN view the
optimal action is a `MOVE` **87.42%** of the time, and `MOVE:EAST` specifically
**45.68%** of the time. In VALIDATION that key is legal in 90.52% of records and
optimal in 63.27%.

So trivial policies score high, and the real bar is not greedy:

| Policy | VALIDATION | HOLDOUT | OOD |
|---|---|---|---|
| `ALWAYS_GLOBAL_MOST_COMMON` (hardcoded constant) | 0.6989 | 0.6890 | 0.8280 |
| `FIND_MOVE_EAST_THEN_SELECT` (semantic, index space) | 0.6532 | 0.6484 | 0.7938 |
| `CONSTANT_WITH_FALLBACK` | 0.6522 | 0.6470 | 0.7949 |
| heuristic greedy | 0.2527 | 0.2709 | 0.2448 |
| `NEXUS_RELATIONAL_SELECTOR_V1` | 0.2199 | 0.2266 | 0.2189 |
| random legal | 0.2234 | 0.2367 | 0.2230 |

**Any candidate must be reported against the shortcut baselines, not against greedy.**
A ~70% score is what a constant policy achieves.

## V1 — global action hash (`STAGE3CR2B-98000527aa50df4e81a7d06e`)

Target: `{"actionId": "<16-hex hash>", "confidence": 0..1}`.

V1 learned to emit one hash. 19 distinct predictions, top share 0.8662, entropy 0.7353
bits, confidence exactly 1.0 on all 6,509 outputs (calibration error 0.2957 →
**UNCALIBRATED**, all confidence gates are degenerate copies of learned-alone).

Isolated against the constant policy: 441 model-only-correct vs 102 constant-only-correct,
net **+339 records (+5.21 pts)** — and that decomposes into one real skill and one real
failure:

- 616 records where the dominant key was **illegal** → model picked otherwise, **75.16%** correct
- 253 records where it deviated **anyway** → **29.25%** correct, worse than the constant

So: a dominant action prior plus narrow legality-awareness. No relational reasoning.

## V2A — local action index (`STAGE3CR3A-ba12e6b1185754a5f5d49343`)

Target: `{"actionIndex": N}`, no confidence. Actions presented semantically, order
permuted per record by `ACTION_ORDER_POLICY_V2` (Fisher-Yates seeded from `recordHash`
only — reproducible, split-, reward- and optimality-independent).

**The representation fix worked mechanically and changed nothing behaviourally.**

Positional shortcuts died: `ALWAYS_INDEX_0` 0.2235, `INDEX_1` 0.2314, `MOST_COMMON_INDEX`
0.2129, `RANDOM_INDEX` 0.2243 — all indistinguishable from random legal (0.2234).
Parse rate, legality and in-range rate were **1.0 with zero out-of-range indices** across
19,944 predictions.

And the decisive diagnostic:

| | unique indices | top index | unique **actions** | top **action** |
|---|---|---|---|---|
| V2A VALIDATION | 13 | 0.1630 | 22 | **0.8646** |

Index diversity says "collapse solved". It wasn't. The model learned to *locate `MOVE east`
in a shuffled list* — strictly harder than memorising a hash — and arrived at the identical
policy: **97.9% of outputs were `MOVE`**.

## V2B — prior-controlled sampling (`STAGE3CR3B-f76b16d0c026a23238557ac2`)

`PRIOR_CONTROL_POLICY_V1`: cap each optimal-action **family** at 20% of the natural
dataset size (891), allow bounded repetition up to 3× a family's natural count.

Capping by *family* (`MOVE:EAST`, `MOVE:WEST`, …) rather than by *type* is the point:
"any MOVE" is worth only 0.2752 as a shortcut, but `MOVE:EAST` specifically is worth
0.6532. Capping families forces a **direction** choice, and direction cannot be picked
without reading the world.

| | natural | controlled |
|---|---|---|
| MOVE:EAST share | 0.4568 | **0.1698** |
| MOVE total share | 0.8742 | 0.6792 |
| action-type entropy | 0.7355 | **1.3888** |
| rows / unique sources | 4,459 / 4,459 | 5,247 / 3,293 |

Evaluation splits were **not** rebalanced. Topology and graph-size distributions are
preserved within ~1pt; horizon composition shifted (`HORIZON_ALIGNED` 0.072 → 0.1835)
because non-MOVE optima are relatively more common in aligned cases — declared, not corrected.

Result: behaviour genuinely changed. Top action share **0.8646 → 0.3985**, unique
canonical actions **22 → 41**, canonical entropy **0.7636 → 2.4032**.

And the complementarity against the deterministic selector on challenge cases **flipped**:

| | V2_ONLY_CORRECT | NEXUS_ONLY_CORRECT |
|---|---|---|
| V2A | 56 | 312 |
| V2B | **310** | 245 |

## Causal chain

- **V1 → V2A** (representation only): relational lift −0.1527 → −0.1420. Essentially nothing.
- **V2A → V2B** (label prior only): relational lift −0.1420 → **+0.0676**. First positive value in the campaign.

**The label prior was the primary limit, not the representation.** The representation fix
was still necessary — it is what made the prior fix expressible — but alone it bought nothing.

V2B still trails greedy (0.3275) on challenge cases, so this is not yet a strong relational
reasoner. Nothing here indicates model capacity is the binding constraint: a 0.6B model that
reliably locates a specific semantic action in a shuffled list is incentive-limited, not
capacity-limited. **Do not scale model size on this evidence.**

## The horizon finding

Reproduced across two candidates and three splits:

| | HORIZON_ALIGNED | HORIZON_DEPENDENT |
|---|---|---|
| `NEXUS_RELATIONAL_SELECTOR_V1` | 0.8552 / 0.8429 / 0.9009 | **0.0007 / 0.0008 / 0.0007** |
| V1 learned | 0.6389 / 0.6254 / 0.7839 | 0.7267 / 0.7292 / 0.8467 |

The deterministic selector is excellent where the horizon aligns and **collapses entirely**
where it does not. This is the strongest complementarity signal in the campaign.
`HORIZON_ROUTING_HYPOTHESIS_SUPPORTED=true` — recorded as evidence for a future
**predeclared** stage. No router was built here.

## Reproducing

```bash
node scripts/generate-stage3b1-corpus.mjs && node scripts/generate-stage3b1-corpus.mjs --pilot
npm run forge:stage3b1:check                     # must be reproduced=true
node training/stage3cr3/audit-train.mjs          # Phase 1 label audit
node training/stage3cr3/build-v2-action-index.mjs   <outdir>   # V2A view
node training/stage3cr3/build-v2b-prior-controlled.mjs <outdir> # V2B view
node training/stage3cr3/v2-baselines.mjs <SPLIT> <outdir> [v1gen]
python training/stage3cr3/train_fixed.py --data <sft.jsonl> --out <adapter> \
    --epochs 2 --lr 1e-4 --accum 16 --max-len 512 --seed 20260908
python training/stage3cr3/infer_v2.py --prompts <prompts> --adapter <adapter> --out <gen>
node training/stage3cr3/score-v2.mjs <SPLIT> <gen> <out.json> [v1gen]
```

Adapters (49 MB each) are **not** committed; they are identified by hash in
`identity/candidate-manifest-*.json` and regenerable from the frozen configs and seed.
MPS training is not bitwise deterministic, so expect close-but-not-identical adapters.

Execution note: `train_fixed.py` pads every sequence to a fixed 512. Soup 0.74.0 passes
`packing` as an `SFTTrainer` kwarg while pinned TRL 0.29.1 accepts it only on `SFTConfig`,
so Soup's packing path cannot run on this stack; without it, variable-length `bs=1`
training grows the MPS caching allocator 6.20 → 10.49 GB over 30 micro-steps and stalls.
Fixed padding holds it flat at 6.39 GB. **Soup was not modified** and remains the dataset
format authority.
