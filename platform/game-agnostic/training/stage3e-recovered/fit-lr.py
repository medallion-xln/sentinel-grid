"""Stage 3E Phase 12: ONE bounded classifier — logistic regression, DEV only.
Deterministic rules plateaued at 0.78-0.82 precision, which is the precondition."""
import json, sys, numpy as np
SC="/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad"
def load(s):
    rows=json.load(open(f"{SC}/3e/matrix-{s}.json"))
    keys=sorted(rows[0]["f"].keys())
    X=np.array([[float(r["f"][k]) for k in keys] for r in rows])
    y=np.array([r["y"] for r in rows], dtype=float)
    return rows,keys,X,y
rows,keys,X,y=load("ROUTABILITY_DEV")
mu,sd=X.mean(0),X.std(0); sd[sd==0]=1
Z=(X-mu)/sd
Z=np.hstack([Z,np.ones((len(Z),1))])
rng=np.random.default_rng(20260908)
w=np.zeros(Z.shape[1])
lr, L2 = 0.1, 1e-3
for it in range(4000):
    p=1/(1+np.exp(-Z@w))
    grad=Z.T@(p-y)/len(y) + L2*np.r_[w[:-1],0]
    w-=lr*grad
p=1/(1+np.exp(-Z@w))
auc=0.0
order=np.argsort(p); yy=y[order]
n1,n0=yy.sum(),len(yy)-yy.sum()
ranks=np.empty(len(yy)); ranks[order]=np.arange(1,len(yy)+1)
auc=(ranks[y==1].sum()-n1*(n1+1)/2)/(n1*n0)
print(f"DEV fitted: n={len(y)} features={len(keys)} AUROC={auc:.4f}")
top=sorted(zip(keys,w[:-1]), key=lambda t:-abs(t[1]))[:12]
print("top |weight| features:")
for k,v in top: print(f"   {k:26s} {v:+.4f}")
json.dump({"keys":keys,"mu":mu.tolist(),"sd":sd.tolist(),"w":w.tolist(),"devAUROC":float(auc)},
          open(f"{SC}/3e/lr-model.json","w"))
