"""SENTINEL_NEXUS_TEMPLATE_V1 inference — matches Soup's alpaca->chat training text exactly."""
import os, sys, json, time, argparse, re, torch
from transformers import AutoModelForCausalLM, AutoTokenizer

ap = argparse.ArgumentParser()
ap.add_argument("--prompts", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--adapter", default=None)
ap.add_argument("--batch", type=int, default=16)
ap.add_argument("--max-new", type=int, default=40)
a = ap.parse_args()

base = os.environ.get("SENTINEL_BASE_MODEL_PATH", "./models/Qwen3-0.6B")

if torch.cuda.is_available():
    DEV, DTYPE = "cuda", torch.bfloat16
elif torch.backends.mps.is_available():
    DEV, DTYPE = "mps", torch.bfloat16
else:
    DEV, DTYPE = "cpu", torch.float32
print(f"device={DEV} dtype={DTYPE}", flush=True)
tok = AutoTokenizer.from_pretrained(base, local_files_only=True)
tok.padding_side = "left"
if tok.pad_token is None: tok.pad_token = tok.eos_token
model = AutoModelForCausalLM.from_pretrained(base, local_files_only=True, dtype=DTYPE)
if a.adapter:
    from peft import PeftModel
    model = PeftModel.from_pretrained(model, a.adapter)
model = model.to(DEV).eval()

rows = [json.loads(l) for l in open(a.prompts) if l.strip()]
done = set()
if os.path.exists(a.out):
    for l in open(a.out):
        try: done.add(json.loads(l)["recordHash"])
        except Exception: pass
rows = [r for r in rows if r["recordHash"] not in done]
print(f"to generate: {len(rows)} (resuming, {len(done)} already done)", flush=True)

JSON_RE = re.compile(r'\{[^{}]*"actionIndex"[^{}]*\}')
def parse(text):
    t = text.split("</think>")[-1]
    m = JSON_RE.search(t) or JSON_RE.search(text)
    if not m: return None
    try: return json.loads(m.group(0))
    except Exception: return None

t0 = time.time(); n = 0
with open(a.out, "a") as fh:
    for i in range(0, len(rows), a.batch):
        chunk = rows[i:i+a.batch]
        texts = [tok.apply_chat_template([{"role":"user","content":r["instruction"]}],
                 tokenize=False, add_generation_prompt=True) for r in chunk]
        enc = tok(texts, return_tensors="pt", padding=True, add_special_tokens=False).to(DEV)
        with torch.no_grad():
            out = model.generate(**enc, max_new_tokens=a.max_new, do_sample=False,
                                 pad_token_id=tok.pad_token_id)
        gen = out[:, enc["input_ids"].shape[1]:]
        for r, g in zip(chunk, gen):
            raw = tok.decode(g, skip_special_tokens=True)
            fh.write(json.dumps({"recordHash": r["recordHash"], "raw": raw, "answer": parse(raw)}) + "\n")
        fh.flush(); n += len(chunk)
        if (i // a.batch) % 10 == 0:
            el = time.time()-t0
            print(f"  {n}/{len(rows)}  {n/el:.2f} ex/s  eta {(len(rows)-n)/max(n/el,1e-9)/60:.1f} min", flush=True)
def _peak_gb():
    if DEV == "cuda": return torch.cuda.max_memory_allocated()/1e9
    if DEV == "mps":  return torch.mps.driver_allocated_memory()/1e9
    return 0.0
print(f"DONE {n} in {time.time()-t0:.0f}s  peak={_peak_gb():.2f}GB", flush=True)
