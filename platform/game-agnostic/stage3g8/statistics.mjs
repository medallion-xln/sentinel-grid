// Stage 3G.7 paired statistics with the Stage 3G.8 registered NI family and seed namespace.
import {seededUniform,quantile} from '../src/stage3f/policy-requalification-v1.js';
import {STATISTICS} from './plan.mjs';
export const mean=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:null;
export const summary=x=>({n:x.length,hit:mean(x.map(x=>x.hit)),regret:mean(x.map(x=>x.regret)),nreg:mean(x.map(x=>x.nreg)),catastrophic:mean(x.map(x=>x.catastrophic))});
/** reference vs primary on the same rows. hitGain = reference - primary; nregExcess = primary - reference. */
export function paired(reference,primary,key,{ni=false}={}){const n=primary.length;if(n!==reference.length)throw Error('PAIR');if(!n)return {n:0,NONINFERIOR:'NOT_TESTABLE',MATERIAL:false,HARMFUL:false};
 const h=reference.map((x,i)=>x.hit-primary[i].hit),nr=reference.map((x,i)=>primary[i].nreg-x.nreg),rng=seededUniform('STAGE3G8:'+key),hs=[],ns=[],reps=ni?STATISTICS.resamples:STATISTICS.descriptiveResamples;const constant=x=>x.every(v=>v===x[0]);
 if(constant(h)&&constant(nr)){hs.push(h[0]);ns.push(nr[0]);}else for(let r=0;r<reps;r++){let a=0,b=0;for(let i=0;i<n;i++){const j=Math.floor(rng()*n);a+=h[j];b+=nr[j];}hs.push(a/n);ns.push(b/n);}
 hs.sort((a,b)=>a-b);ns.sort((a,b)=>a-b);const alpha=STATISTICS.alpha/STATISTICS.niEndpointFamily,hit95=[quantile(hs,.025),quantile(hs,.975)],nr95=[quantile(ns,.025),quantile(ns,.975)];
 const out={n,hitGain:mean(h),hitGainCi95:hit95,nregExcess:mean(nr),nregExcessCi95:nr95,flipRate:mean(primary.map((x,i)=>x.keys!==reference[i].keys?1:0)),catastrophicChange:mean(reference.map((x,i)=>x.catastrophic-primary[i].catastrophic)),
  MATERIAL:mean(h)>=STATISTICS.hitMargin&&hit95[0]>0&&mean(nr)>=0,HARMFUL:mean(h)<=-STATISTICS.hitMargin&&hit95[1]<0&&mean(nr)<=0};
 if(ni){const hl=quantile(hs,alpha),hu=quantile(hs,1-alpha),nl=quantile(ns,alpha),nu=quantile(ns,1-alpha);Object.assign(out,{alphaPerEndpoint:alpha,hitDeficitBounds:[hl,hu],nregExcessBounds:[nl,nu],NONINFERIOR:n<STATISTICS.minN?'NOT_TESTABLE':hu<STATISTICS.hitMargin-1e-12&&nu<STATISTICS.nregMargin-1e-12?'PASS':hl>=STATISTICS.hitMargin-1e-12||nl>=STATISTICS.nregMargin-1e-12?'FAIL':'NOT_TESTABLE'});}
 return out;}
/** Replicated classification over two families for one comparison/stratum. */
export function replicated(a,b){if(!a||!b||a.n<STATISTICS.minN||b.n<STATISTICS.minN)return 'NOT_TESTABLE';if(a.MATERIAL&&b.MATERIAL)return 'MATERIAL';if(a.HARMFUL&&b.HARMFUL)return 'HARMFUL';return 'NOT_MATERIAL';}
/** One-sample mean with deterministic percentile interval (descriptive audit rates). */
export function meanInterval(x,key){const n=x.length;if(!n)return {n:0,mean:null,ci95:[null,null]};const rng=seededUniform('STAGE3G8:'+key),m=[];if(x.every(v=>v===x[0]))return {n,mean:x[0],ci95:[x[0],x[0]]};for(let r=0;r<STATISTICS.descriptiveResamples;r++){let s=0;for(let i=0;i<n;i++)s+=x[Math.floor(rng()*n)];m.push(s/n);}m.sort((a,b)=>a-b);return {n,mean:mean(x),ci95:[quantile(m,.025),quantile(m,.975)]};}
