"""Phases 18-22: sealed-split evaluation of the FROZEN Stage 3E router."""
import json, sys, numpy as np
SC="/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad"
SPLIT=sys.argv[1]
M=json.load(open(f"{SC}/3e/lr-model.json")); FZ=json.load(open(f"{SC}/3e/freeze-3e.json"))
TAU=FZ["STAGE3E_ROUTER"]["TAU"]
keys,mu,sd,w=M["keys"],np.array(M["mu"]),np.array(M["sd"]),np.array(M["w"])
rows=json.load(open(f"{SC}/3e/matrix-{SPLIT}.json"))
X=np.array([[float(r["f"][k]) for k in keys] for r in rows])
p=1/(1+np.exp(-np.hstack([(X-mu)/sd,np.ones((len(X),1))])@w))
y=np.array([r["y"] for r in rows])
gOk=np.array([r["greedyOk"] for r in rows]); lOk=np.array([r["learnedOk"] for r in rows])
gRe=np.array([r["greedyReg"] if r["greedyReg"] is not None else np.nan for r in rows])
lRe=np.array([r["learnedReg"] if r["learnedReg"] is not None else np.nan for r in rows])
margin=np.array([float(r["f"]["immediateMargin"]) for r in rows])
def wil(k,n,z=1.96):
    if n==0: return 0.0
    q=k/n; d=1+z*z/n
    return max(0.0,((q+z*z/(2*n))-z*((q*(1-q)+z*z/(4*n))/n)**0.5)/d)
R=p>=TAU; n=int(R.sum()); k=int(y[R].sum())
out={"split":SPLIT,"n":len(y),"targetPrevalence":round(float(y.mean()),4),
 "router":{"tau":TAU,"routedN":n,"precision":round(k/n,4) if n else 0,
           "wilsonLower":round(wil(k,n),4),"coverage":round(n/len(y),4),
           "falseSafeCount":n-k,"meetsEvidenceFloor":n>=FZ["MIN_ROUTED_N"]}}
hyb=np.where(R,gOk,lOk); hybReg=np.where(R,gRe,lRe)
D=margin>=20   # frozen Stage 3D router, for comparison
out["policies"]={
 "GREEDY_ALONE":{"acc":round(float(gOk.mean()),4),"regret":round(float(np.nanmean(gRe)),2)},
 "V2B_ALONE":{"acc":round(float(lOk.mean()),4),"regret":round(float(np.nanmean(lRe)),2)},
 "STAGE3D_HYBRID_margin20":{"acc":round(float(np.where(D,gOk,lOk).mean()),4),
                            "regret":round(float(np.nanmean(np.where(D,gRe,lRe))),2),
                            "precision":round(float(y[D].mean()),4),"coverage":round(float(D.mean()),4)},
 "STAGE3E_HYBRID":{"acc":round(float(hyb.mean()),4),"regret":round(float(np.nanmean(hybReg)),2)},
 "ORACLE_GREEDY_SAFE":{"acc":round(float(np.where(y==1,gOk,lOk).mean()),4),
                       "regret":round(float(np.nanmean(np.where(y==1,gRe,lRe))),2)}}
out["deltas"]={"hybridMinusV2B_acc":round(float(hyb.mean()-lOk.mean()),4),
 "hybridMinusV2B_regret":round(float(np.nanmean(hybReg)-np.nanmean(lRe)),2),
 "hybridMinusStage3D_acc":round(float(hyb.mean()-np.where(D,gOk,lOk).mean()),4)}
fs=R&(y==0)   # PHASE 19 false-safe harm
if fs.sum():
    fr=gRe[fs]; fr=fr[~np.isnan(fr)]
    out["falseSafeHarm"]={"count":int(fs.sum()),"meanRegret":round(float(fr.mean()),2),
      "p95Regret":round(float(np.percentile(fr,95)),2),"worstRegret":round(float(fr.max()),2),
      "v2bWouldHaveRegret":round(float(np.nanmean(lRe[fs])),2)}
og=out["policies"]["ORACLE_GREEDY_SAFE"]
out["routabilityGap"]={"oracleAcc":og["acc"],"runtimeAcc":out["policies"]["STAGE3E_HYBRID"]["acc"],
 "accuracyGap":round(og["acc"]-out["policies"]["STAGE3E_HYBRID"]["acc"],4),
 "regretGap":round(out["policies"]["STAGE3E_HYBRID"]["regret"]-og["regret"],2)}
json.dump(out,open(f"{SC}/3e/final-{SPLIT}.json","w"),indent=2)
print(json.dumps(out,indent=1))
