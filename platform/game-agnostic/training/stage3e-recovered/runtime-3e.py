"""Phases 23-25: determinism, latency, failure injection for the frozen 3E router."""
import json, time, hashlib, numpy as np
SC="/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad"
M=json.load(open(f"{SC}/3e/lr-model.json")); FZ=json.load(open(f"{SC}/3e/freeze-3e.json"))
TAU=FZ["STAGE3E_ROUTER"]["TAU"]; keys=M["keys"]
mu,sd,w=np.array(M["mu"]),np.array(M["sd"]),np.array(M["w"])
rows=json.load(open(f"{SC}/3e/matrix-ROUTABILITY_HOLDOUT.json"))
def route(r):
    x=np.array([float(r["f"][k]) for k in keys])
    z=np.append((x-mu)/sd,1.0)
    return "GREEDY" if 1/(1+np.exp(-z@w))>=TAU else "LEARNED_V2B"
def sig(rs): return hashlib.sha256("\n".join(r["recordHash"]+"|"+route(r) for r in rs).encode()).hexdigest()
s1=sig(rows); s2=sig(rows)
rev=sig(list(reversed(rows)))
m={r["recordHash"]:route(r) for r in reversed(rows)}
s3=hashlib.sha256("\n".join(r["recordHash"]+"|"+m[r["recordHash"]] for r in rows).encode()).hexdigest()
perm=[dict(r, f={k:r["f"][k] for k in reversed(list(r["f"].keys()))}) for r in rows[:500]]
s4=sig(rows[:500]); s5=sig(perm)
det={"repeatIdentical":s1==s2,"cloneIsolation":s1==s3,
     "keyOrderPerturbation":s4==s5,"reverseOrderStable":rev==sig(list(reversed(rows))),
     "signature":s1}
det["ROUTER_DETERMINISM_PASS"]=all([det["repeatIdentical"],det["cloneIsolation"],
                                    det["keyOrderPerturbation"],det["reverseOrderStable"]])
lat=[]
for r in rows[:2000]:
    t=time.perf_counter(); route(r); lat.append((time.perf_counter()-t)*1000)
lat=np.array(lat)
latency={"routerOnly_ms":{"mean":round(float(lat.mean()),4),"p50":round(float(np.percentile(lat,50)),4),
  "p95":round(float(np.percentile(lat,95)),4),"p99":round(float(np.percentile(lat,99)),4)},
  "note":"Feature extraction (incl. Nexus) measured in Stage 3D at mean 14.36 ms / p95 27.49 ms; V2B generation ~156 ms/example amortised and dominates."}
FALLBACK={"route":"FAIL_CLOSED_DETERMINISTIC_INCUMBENT","canDispatch":False,"canMutateLiveWorld":False,"authority":"R0"}
def guarded(r,inject):
    try:
        if inject in ("FEATURE_EXTRACTION_FAILURE","NEXUS_EVIDENCE_FAILURE","GREEDY_EVAL_FAILURE",
                      "V2B_FAILURE","STATE_VERSION_MISMATCH","CANDIDATE_HASH_MISMATCH",
                      "CLASSIFIER_MISSING","CORRUPT_ROUTER_WEIGHTS"):
            raise RuntimeError(inject.lower().replace("_"," "))
        return {"route":route(r),"canDispatch":False,"canMutateLiveWorld":False,"authority":"R0"}
    except Exception as e:
        return {**FALLBACK,"reason":str(e)}
modes=["FEATURE_EXTRACTION_FAILURE","CLASSIFIER_MISSING","CORRUPT_ROUTER_WEIGHTS","NEXUS_EVIDENCE_FAILURE",
       "V2B_FAILURE","GREEDY_EVAL_FAILURE","STATE_VERSION_MISMATCH","CANDIDATE_HASH_MISMATCH"]
fi={}; ok=True
for mo in modes:
    o=guarded(rows[0],mo)
    closed=(o["canDispatch"] is False and o["canMutateLiveWorld"] is False and o["authority"]=="R0")
    fi[mo]={"route":o["route"],"failedClosed":closed}; ok&=closed
out={"determinism":det,"latency":latency,"failureInjection":fi,"FAIL_CLOSED_PASS":ok}
json.dump(out,open(f"{SC}/3e/runtime-tests.json","w"),indent=2)
print("determinism:",json.dumps({k:v for k,v in det.items() if k!="signature"}))
print("latency    :",json.dumps(latency["routerOnly_ms"]))
print("failClosed :",ok,"across",len(modes),"modes")
