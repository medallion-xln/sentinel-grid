# Stage 3C-R — training environment provisioning

Status: **BLOCKED** — `F_TRAINING_ENVIRONMENT_STILL_BLOCKED`

## Three of four blockers are gone

| requirement | Stage 3C | Stage 3C-R | why it changed |
| --- | --- | --- | --- |
| `SOUP_INSTALLED` | false | true | STAGE3C_PROBE_WAS_WRONG |
| `TRAINING_RUNTIME` | false | true | INSTALLED_BY_THIS_STAGE |
| `ACCELERATOR_OR_VIABLE_CPU_BUDGET` | false | true | MEASURED_CPU_BUDGET_IS_VIABLE_FOR_A_SUB_BILLION_LORA_RUN |
| `BASE_MODEL_WEIGHTS` | false | false | STILL_DENIED_BY_ORGANIZATIONAL_EGRESS_POLICY |

## One of those is a correction, not a change in the world

Stage 3C probed `which soup`, which answers "is there an installed executable on PATH", not "is Soup available". A clean git checkout of Soup at the pinned commit was present outside the repository the whole time and the probe could not see it.

Stage 3C's **result** is not rewritten. Stage 3C was BLOCKED and remains BLOCKED in the historical record. It would have been BLOCKED on BASE_MODEL_WEIGHTS alone, so the corrected line does not change its outcome — but the line was wrong and is corrected here rather than quietly dropped.

## What now works

- Soup at the pinned commit `f07e07ed7edd548a4d1d9143f77af9027b1b7036`, clean tree, CLI runs, doctor passes
- torch `2.14.0+cu130`, transformers `5.16.1`, peft `0.20.0`, trl `0.29.1`
- environment class: **CPU_SMALL_MODEL_ONLY** (4 cores, 16075 MB RAM, no accelerator)
- Soup's parser reads **all 4459** rows of the real FORGE_DATASET_V2 export as `alpaca`
- the 12 Soup format signatures Stage 3A transcribed into the bridge match live Soup **exactly** — the first time that comparison has actually been run
- a full train loop completes: load, LoRA, gradient, checkpoint, adapter reload, inference

## What is still blocked

`BASE_MODEL_AVAILABLE`. `huggingface_hub.snapshot_download` returns ProxyError 403 Forbidden through the installed stack —
the same organizational egress denial curl saw. The brief forbids bypassing it,
using an undocumented proxy, or pulling weights from an untrusted mirror to make
the stage pass, and none of those was attempted. Every alternate host probed
(modelscope.cn, hf-mirror.com, download.pytorch.org, ollama.com, registry.ollama.ai, kaggle.com) was unreachable.

So no candidate exists, and no accuracy, regret, complementarity, hybrid or
generalization figure appears in these artifacts.

## The pipeline harness is not a candidate

It has no pretrained knowledge and is never evaluated for accuracy. Its only job is to prove Soup can load a model, compute a gradient, write a checkpoint and reload an adapter on this machine.

It is randomly initialised locally and its adapter (`21550fad0b01099b…`, 526384 bytes) is never scored.
Reporting its loss as a result would be reporting the arithmetic of a random model.

## Decisions taken that need no weights

- **Abstention**: option A_TRAIN_ACTION_SELECTION_WITHOUT_CLAIMING_ABSTENTION. FORGE_DATASET_V2 contains 20 negative controls in 50,860 TRAIN records. That is not enough signal to learn when to abstain, and a model trained on it that emitted an abstention would be guessing. The first candidate is asked to select an action, and the task contract drops the abstain field rather than carrying one nothing taught it to use.
- **Topology skew**: the sampler caps any shape at 0.12 of the sample, taking the largest share from **0.2798** to **0.1749**. TRAIN only; VALIDATION, HOLDOUT and OOD are untouched.
- **Task**: `LEARNED_NEXUS_ACTION_SELECTION_V1` — action selection, no abstain field. Removed relative to the Stage 3C contract, per the Phase 8 decision. A field the training data cannot teach is a field the model will fill with noise.
- **Targets**: ACCEPT_ANY_MEMBER_OF_OPTIMAL_SET_AT_EVALUATION; EXCLUDE_FROM_SINGLE_TARGET_SFT. A tie is the world saying two actions are worth the same. Training the sort order as if it were the answer teaches the sorting function, which is a fact about the code rather than about the world.
- **SFT dataset**: 4459 rows, `93c20fc679492cdb…`, TRAIN only.

## The inherited selector limitation, unchanged

This is NOT deterministic Nexus's relational accuracy. Nexus emits graph-level signals and no action at all; NEXUS_RELATIONAL_SELECTOR_V1 is one policy built on those signals, and its score is that policy's score. A different policy over the same signals could do better or worse without Nexus having changed.

## Authority

`AUTHORITY=R0`, `CAN_DISPATCH=false`, `CAN_MUTATE_LIVE_WORLD=false`. The firewall
rejects all 5 forbidden or unknown statuses and accepts the permitted control.
Deterministic Nexus remains the incumbent. `soup push` was never invoked.

Certification hash: `50e1b908443e8592b9321103cfe3b2ca8ccb1d441e7406001430136481822db4`

