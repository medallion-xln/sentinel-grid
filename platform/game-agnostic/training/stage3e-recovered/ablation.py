"""Phase 22: does deterministic Nexus evidence improve routability at all?"""
import json, numpy as np
SC="/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad"
def load(s):
    rows=json.load(open(f"{SC}/3e/matrix-{s}.json"))
    keys=sorted(rows[0]["f"].keys()); return rows,keys
def fit(rows,keys,use):
    X=np.array([[float(r["f"][k]) for k in use] for r in rows])
    y=np.array([r["y"] for r in rows],dtype=float)
    mu,sd=X.mean(0),X.std(0); sd[sd==0]=1
    Z=np.hstack([(X-mu)/sd,np.ones((len(X),1))]); w=np.zeros(Z.shape[1])
    for _ in range(4000):
        p=1/(1+np.exp(-Z@w)); w-=0.1*(Z.T@(p-y)/len(y)+1e-3*np.r_[w[:-1],0])
    return mu,sd,w
def apply(rows,use,mu,sd,w):
    X=np.array([[float(r["f"][k]) for k in use] for r in rows])
    return 1/(1+np.exp(-np.hstack([(X-mu)/sd,np.ones((len(X),1))])@w))
def wil(k,n,z=1.96):
    if n==0: return 0.0
    q=k/n; d=1+z*z/n
    return max(0.0,((q+z*z/(2*n))-z*((q*(1-q)+z*z/(4*n))/n)**0.5)/d)
dev,keys=load("ROUTABILITY_DEV"); hold,_=load("ROUTABILITY_HOLDOUT")
yH=np.array([r["y"] for r in hold])
nx=[k for k in keys if k.startswith("nx")]
res={}
for name,use in (("WITH_NEXUS",keys),("WITHOUT_NEXUS",[k for k in keys if not k.startswith("nx")])):
    mu,sd,w=fit(dev,use,use)
    p=apply(hold,use,mu,sd,w)
    row={}
    for tau in (0.5,0.9):
        R=p>=tau; n=int(R.sum()); k=int(yH[R].sum())
        row[f"tau{tau}"]={"precision":round(k/n,4) if n else 0,"wilson":round(wil(k,n),4),
                          "coverage":round(n/len(yH),4),"n":n}
    # AUROC on holdout
    o=np.argsort(p); ranks=np.empty(len(p)); ranks[o]=np.arange(1,len(p)+1)
    n1,n0=yH.sum(),len(yH)-yH.sum()
    row["holdoutAUROC"]=round(float((ranks[yH==1].sum()-n1*(n1+1)/2)/(n1*n0)),4)
    res[name]=row
    print(f"  {name:14s} AUROC {row['holdoutAUROC']}  tau0.5 prec {row['tau0.5']['precision']} cov {row['tau0.5']['coverage']}  tau0.9 prec {row['tau0.9']['precision']} cov {row['tau0.9']['coverage']}")
res["nexusFeatureCount"]=len(nx)
res["NEXUS_ROUTING_VALUE"]=round(res["WITH_NEXUS"]["holdoutAUROC"]-res["WITHOUT_NEXUS"]["holdoutAUROC"],4)
print(f"\n  NEXUS_ROUTING_VALUE (AUROC delta) = {res['NEXUS_ROUTING_VALUE']:+}")
json.dump(res,open(f"{SC}/3e/ablation.json","w"),indent=2)
