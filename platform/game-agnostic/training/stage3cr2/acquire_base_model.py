#!/usr/bin/env python3
"""Stage 3C-R.2 — acquire Qwen/Qwen3-0.6B at the PINNED revision and verify it.

Provenance is established from the artifact's own content, never from the
repository name: every file is hashed and compared against the frozen manifest in
base-model-provenance.json. A mismatch aborts.

    python training/stage3cr2/acquire_base_model.py ./models/Qwen3-0.6B
"""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROV = json.load(open(os.path.join(HERE, "base-model-provenance.json")))
DEST = sys.argv[1] if len(sys.argv) > 1 else "./models/Qwen3-0.6B"

ALLOW = ["config.json", "generation_config.json", "tokenizer.json",
         "tokenizer_config.json", "vocab.json", "merges.txt",
         "*.safetensors", "*.safetensors.index.json", "LICENSE", "README.md"]

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

def main():
    from huggingface_hub import snapshot_download
    print(f"repo     : {PROV['MODEL_ID']}")
    print(f"revision : {PROV['MODEL_REVISION']}")
    snapshot_download(repo_id=PROV["MODEL_ID"], revision=PROV["MODEL_REVISION"],
                      local_dir=DEST, allow_patterns=ALLOW)

    bad, missing = [], []
    for name, want in PROV["fileHashes"].items():
        p = os.path.join(DEST, name)
        if not os.path.exists(p):
            missing.append(name); continue
        got = sha256(p)
        if got != want:
            bad.append((name, want, got))

    manifest = "\n".join(f"{n}  {PROV['fileHashes'][n]}" for n in sorted(PROV["fileHashes"])) + "\n"
    agg = hashlib.sha256(manifest.encode()).hexdigest()

    print(json.dumps({
        "files_checked": len(PROV["fileHashes"]),
        "missing": missing,
        "hash_mismatches": [b[0] for b in bad],
        "BASE_MODEL_HASH_recomputed": agg,
        "BASE_MODEL_HASH_frozen": PROV["BASE_MODEL_HASH"],
        "PROVENANCE_VERIFIED": not bad and not missing and agg == PROV["BASE_MODEL_HASH"],
    }, indent=2))

    if bad or missing or agg != PROV["BASE_MODEL_HASH"]:
        print("STAGE3CR2_ABORT reason=BASE_MODEL_PROVENANCE_FAILURE", file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
