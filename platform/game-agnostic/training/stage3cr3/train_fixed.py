"""LEARNED_NEXUS_SFT_V1 — fixed-length LoRA SFT.

Soup 0.74.0 passes `packing` as an SFTTrainer kwarg; pinned TRL 0.29.1 accepts it
only on SFTConfig, so Soup's packing path cannot run on this stack. Without packing,
variable-length sequences at batch_size=1 make the MPS caching allocator retain a
distinct buffer per distinct length: measured 6.20 -> 10.49 GB over 30 micro-steps
and still climbing, which exhausts a 16 GB machine and stalls training at step 12.
Padding every sequence to a constant 512 gives the allocator ONE shape: measured
flat at 6.42 -> 6.44 GB over the same 30 micro-steps.

Data, template, LoRA config, seed and optimizer settings match the frozen campaign.
"""
import argparse, json, math, os, random, time
import numpy as np, torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoModelForCausalLM, AutoTokenizer, get_linear_schedule_with_warmup
from peft import LoraConfig, get_peft_model

ap = argparse.ArgumentParser()
ap.add_argument("--data", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--epochs", type=int, default=2)
ap.add_argument("--lr", type=float, default=1e-4)
ap.add_argument("--accum", type=int, default=16)
ap.add_argument("--max-len", type=int, default=512)
ap.add_argument("--seed", type=int, default=20260908)
ap.add_argument("--limit", type=int, default=None)
ap.add_argument("--log-every", type=int, default=5)
a = ap.parse_args()

random.seed(a.seed); np.random.seed(a.seed); torch.manual_seed(a.seed)
DEV = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
DTYPE = torch.float32 if DEV == "cpu" else torch.bfloat16
base = os.environ["SENTINEL_BASE_MODEL_PATH"]
tok = AutoTokenizer.from_pretrained(base, local_files_only=True)

class DS(Dataset):
    def __init__(self, path, limit):
        self.rows = [json.loads(l) for l in open(path) if l.strip()]
        if limit: self.rows = self.rows[:limit]
    def __len__(self): return len(self.rows)
    def __getitem__(self, i):
        r = self.rows[i]
        msgs = [{"role": "user", "content": r["instruction"]},
                {"role": "assistant", "content": r["output"]}]
        full = tok.apply_chat_template(msgs, tokenize=False)
        prompt = tok.apply_chat_template([msgs[0]], tokenize=False, add_generation_prompt=True)
        f = tok(full, add_special_tokens=False)["input_ids"][:a.max_len]
        p = len(tok(prompt, add_special_tokens=False)["input_ids"])
        labels = [-100]*min(p, len(f)) + f[min(p, len(f)):]          # loss on completion only
        pad = a.max_len - len(f)                                      # FIXED length: one allocator shape
        return (torch.tensor(f + [tok.pad_token_id]*pad),
                torch.tensor([1]*len(f) + [0]*pad),
                torch.tensor(labels + [-100]*pad))

ds = DS(a.data, a.limit)
dl = DataLoader(ds, batch_size=1, shuffle=True,
                generator=torch.Generator().manual_seed(a.seed))
model = AutoModelForCausalLM.from_pretrained(base, local_files_only=True, dtype=DTYPE).to(DEV)
model = get_peft_model(model, LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05,
    target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
    task_type="CAUSAL_LM"))
trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
total = sum(p.numel() for p in model.parameters())
print(f"LoRA: {trainable:,} trainable / {total:,} total ({100*trainable/total:.2f}%)", flush=True)
model.train()
opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=a.lr)
steps = math.ceil(len(ds)*a.epochs/a.accum)
sched = get_linear_schedule_with_warmup(opt, int(0.03*steps), steps)
print(f"examples={len(ds)} epochs={a.epochs} optimizer_steps={steps} device={DEV}", flush=True)

def peak_gb():
    if DEV=="cuda": return torch.cuda.max_memory_allocated()/1e9
    if DEV=="mps":  return torch.mps.driver_allocated_memory()/1e9
    return 0.0

t0=time.time(); step=0; micro=0; run=[]; hist=[]; ntok=0; first=None; best=None
for ep in range(a.epochs):
    for ids, att, lab in dl:
        ids, att, lab = ids.to(DEV), att.to(DEV), lab.to(DEV)
        loss = model(input_ids=ids, attention_mask=att, labels=lab).loss / a.accum
        loss.backward(); run.append(loss.item()*a.accum); micro += 1
        ntok += int(att.sum().item())
        if micro % a.accum == 0:
            torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0)
            opt.step(); sched.step(); opt.zero_grad(); step += 1
            if step % a.log_every == 0 or step == 1:
                L = sum(run)/len(run); run=[]
                first = L if first is None else first
                best = L if best is None else min(best, L)
                el = time.time()-t0
                hist.append({"step": step, "loss": round(L,5), "lr": sched.get_last_lr()[0],
                             "elapsed_s": round(el,1), "mem_gb": round(peak_gb(),2)})
                print(f"step {step}/{steps} loss {L:.4f} lr {sched.get_last_lr()[0]:.2e} "
                      f"mem {peak_gb():.2f}GB {el/step:.1f}s/step eta {(steps-step)*el/step/60:.0f}min", flush=True)
os.makedirs(a.out, exist_ok=True)
model.save_pretrained(a.out)
tok.save_pretrained(a.out)
summary = {"examples": len(ds), "epochs": a.epochs, "optimizer_steps": step,
           "tokens_seen": ntok, "start_loss": first, "final_loss": hist[-1]["loss"] if hist else None,
           "min_loss": best, "wall_clock_s": round(time.time()-t0,1),
           "peak_mem_gb": round(peak_gb(),2), "device": DEV, "seed": a.seed,
           "trainable_params": trainable, "total_params": total, "history": hist}
json.dump(summary, open(os.path.join(a.out, "training-summary.json"), "w"), indent=2)
print("DONE " + json.dumps({k:v for k,v in summary.items() if k!="history"}), flush=True)
