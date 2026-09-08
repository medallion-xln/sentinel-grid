# Stage 3C-R.1 — trusted base model acquisition

Status: **BLOCKED** — `E_NO_AUTHORIZED_BASE_MODEL_AVAILABLE`

## The blocker moved from four requirements to one, and stayed there

Stage 3C-R cleared Soup, torch and the CPU budget. This stage re-ran all of it in a
container that had been reprovisioned since — and every step passed again, producing
a LoRA adapter with the identical sha256 `21550fad0b01099b…`.
The pipeline is not the problem and has now been shown not to be the problem twice,
on two different machines.

## What was actually tried

| channel | status | what it means |
| --- | --- | --- |
| PyPI | AUTHORIZED | full simple index (886,683 packages) searched; no trainable causal LM |
| GitHub anonymous git | AUTHORIZED | works, but LFS objects are not served, so weights arrive as pointer stubs |
| GitHub HTTP / releases | DENIED (403) | release assets are not a channel at all |
| GCS / S3 | AUTHORIZED | object stores reachable; no authorized model bucket declared |
| model hosts (8) | DENIED or UNREACHABLE | huggingface.co, its CDN, mirrors, PyTorch, Ollama, Kaggle |
| artifact archives (3) | UNREACHABLE | Zenodo, archive.org, figshare |

huggingface.co and its CDN remain denied. No proxy bypass, URL rewriting, undocumented proxy, unauthorized mirror or third-party archive was used. An HF-owned alternate endpoint would have been the same evasion wearing a different hostname, and was not used either.

## The near miss worth keeping

**A BUCKET, REPOSITORY OR DIRECTORY NAME IS NEVER EVIDENCE OF WHAT IS INSIDE IT**

gs://gpt-2, the bucket OpenAI's own download_model.py once used, is reachable and now holds a single unrelated HTML file uploaded by a third party in 2026.

Matching on the bucket name would have pulled an attacker-controlled object into a training pipeline under the label "GPT-2, official". Nothing was downloaded from it.

Provenance is established from the artifact's own content, hashes and license, and from a publisher that can be named — never from where it happens to sit.

## The one artifact on this machine is ours, and the gate rejects it

The Stage 3C-R pipeline harness is HF-format and technically trainable, and it is still not a base model: it is randomly initialised with no publisher, no license and no version. The gate rejects it on provenance, which is the outcome that proves the gate does something.

Format class: `HF_TRAINABLE_CHECKPOINT`. Rejected on: PROVENANCE_INCOMPLETE.

## What is built and waiting

- provenance envelope: 10 required fields, aggregate hash derived from the parts so the two cannot disagree
- supplied-model path: `SENTINEL_BASE_MODEL_PATH` or `SENTINEL_BASE_MODEL`, validated for format, causal-LM architecture, tokenizer and complete provenance
- format classification: 8 classes, with inference-only formats decided before trainable ones so a stray config cannot promote a GGUF
- trainability contract: 9 steps, exercised end to end against the harness
- activation gate: 7 requirements opening directly into the frozen campaign, with no stage in between

## What did not run

The Stage 3C-R campaign. It is not redesigned, not partially run and not approximated.
`LEARNED_NEXUS_ACTION_SELECTION_V1` and the target contract are untouched, FORGE_DATASET_V2
(`4d1a2792…`) is unmodified, and VALIDATION, HOLDOUT and OOD were never opened.
No candidate exists, so no accuracy, regret, complementarity, hybrid or generalization
figure appears in these artifacts.

## Authority

`AUTHORITY=R0`, `CAN_DISPATCH=false`, `CAN_MUTATE_LIVE_WORLD=false`. Deterministic Nexus
remains the incumbent certified expert. No live runtime references a candidate, because
there is none.

Certification hash: `482f23bff9fb8c8a1f2310074e4dbf3e8145863fbe187706f6c0cb79237f7826`

