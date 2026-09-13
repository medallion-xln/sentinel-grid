import json, numpy as np
SC="/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad"
M=json.load(open(f"{SC}/3e/lr-model.json"))
keys,mu,sd,w=M["keys"],np.array(M["mu"]),np.array(M["sd"]),np.array(M["w"])
rows=json.load(open(f"{SC}/3e/matrix-ROUTABILITY_CAL.json"))
X=np.array([[float(r["f"][k]) for k in keys] for r in rows])
p=1/(1+np.exp(-np.hstack([(X-mu)/sd,np.ones((len(X),1))])@w))
gOk=np.array([r["greedyOk"] for r in rows]); lOk=np.array([r["learnedOk"] for r in rows])
gRe=np.array([r["greedyReg"] if r["greedyReg"] is not None else np.nan for r in rows])
lRe=np.array([r["learnedReg"] if r["learnedReg"] is not None else np.nan for r in rows])
print("  tau   coverage  hybridAcc  hybridRegret   (V2B alone: acc %.4f regret %.2f)"%(lOk.mean(),np.nanmean(lRe)))
for tau in [0.5,0.6,0.7,0.8,0.85,0.9,0.92,0.95]:
    r=p>=tau
    acc=np.where(r,gOk,lOk).mean(); reg=np.nanmean(np.where(r,gRe,lRe))
    print(f"  {tau:<5} {r.mean():>8.4f} {acc:>10.4f} {reg:>13.2f}")
