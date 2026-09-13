"""Phase 14/15: calibrate tau on CAL ONLY. Report full curve + reliability tiers."""
import json, numpy as np
SC="/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad"
M=json.load(open(f"{SC}/3e/lr-model.json"))
keys,mu,sd,w=M["keys"],np.array(M["mu"]),np.array(M["sd"]),np.array(M["w"])
def score(split):
    rows=json.load(open(f"{SC}/3e/matrix-{split}.json"))
    X=np.array([[float(r["f"][k]) for k in keys] for r in rows])
    Z=np.hstack([(X-mu)/sd, np.ones((len(X),1))])
    return rows, 1/(1+np.exp(-Z@w))
def wilson(k,n,z=1.96):
    if n==0: return 0.0
    p=k/n; d=1+z*z/n
    return max(0.0,((p+z*z/(2*n))-z*((p*(1-p)+z*z/(4*n))/n)**0.5)/d)
rows,p=score("ROUTABILITY_CAL")
y=np.array([r["y"] for r in rows])
print(f"CAL n={len(y)} prevalence={y.mean():.4f}")
print("\n  tau    routedN  precision  wilsonLB  coverage")
curve=[]
for tau in [0.5,0.6,0.7,0.8,0.85,0.9,0.92,0.95,0.97,0.98,0.99,0.995]:
    sel=p>=tau; n=int(sel.sum()); k=int(y[sel].sum())
    prec=k/n if n else 0.0
    curve.append({"tau":tau,"n":n,"precision":round(prec,4),"wilson":round(wilson(k,n),4),"coverage":round(n/len(y),4)})
    print(f"  {tau:<6} {n:>7} {prec:>10.4f} {wilson(k,n):>9.4f} {n/len(y):>9.4f}")
FLOOR=200
tiers={}
for target in [0.90,0.95,0.975,0.99]:
    best=None
    for tau in np.arange(0.50,0.999,0.002):
        sel=p>=tau; n=int(sel.sum())
        if n<FLOOR: continue
        k=int(y[sel].sum()); prec=k/n
        if prec>=target and (best is None or n>best["n"]):
            best={"tau":round(float(tau),3),"n":n,"precision":round(prec,4),
                  "wilson":round(wilson(k,n),4),"coverage":round(n/len(y),4)}
    tiers[str(target)]=best
print("\n  RELIABILITY TIERS (min routed n=200):")
for t,v in tiers.items():
    print(f"   >={t}: {v if v else 'NOT ACHIEVABLE at n>=200'}")
json.dump({"curve":curve,"tiers":tiers,"floor":FLOOR},open(f"{SC}/3e/cal-calibration.json","w"),indent=2)
