// Fixed analysis, no model selection. Origin-family bootstrap uses the inherited generator and 10,000 resamples.
import { prng } from '../../stage3h-failure-diagnosis-v1/lib.mjs';
import { BOOTSTRAP_SEED,RESAMPLES } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
export function signTest(benefits,harms){
 if(![benefits,harms].every(x=>Number.isInteger(x)&&x>=0))throw Error('INVALID_DISCORDANT_COUNTS');
 const n=benefits+harms;if(!n || benefits===0)return 1;
 // Log-space recurrence avoids underflow at campaign-scale n.
 let logChoose=0,logs=[];for(let k=0;k<=n;k++){if(k>=benefits)logs.push(logChoose-n*Math.log(2));if(k<n)logChoose+=Math.log(n-k)-Math.log(k+1);}
 const max=Math.max(...logs);return Math.min(1,Math.exp(max)*logs.reduce((s,x)=>s+Math.exp(x-max),0));
}
export function interval(values,families){
 if(!values.length||values.length!==families.length||values.some(x=>!Number.isFinite(x)))throw Error('PAIRED_SAMPLE_INVALID');
 const map=new Map();values.forEach((v,i)=>{const r=map.get(families[i])??{n:0,sum:0};r.n++;r.sum+=v;map.set(families[i],r);});
 if(map.size<2)throw Error('CLUSTER_INTERVAL_NEEDS_MULTIPLE_FAMILIES');
 const groups=[...map].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,x])=>x),rnd=prng(BOOTSTRAP_SEED),samples=[];
 for(let b=0;b<RESAMPLES;b++){let sum=0,n=0;for(let i=0;i<groups.length;i++){const g=groups[Math.floor(rnd()*groups.length)];sum+=g.sum;n+=g.n;}samples.push(sum/n);}
 samples.sort((a,b)=>a-b);const q=p=>samples[Math.min(samples.length-1,Math.floor(p*samples.length))];
 return {point:values.reduce((a,b)=>a+b,0)/values.length,lower025:q(.025),upper975:q(.975),upper95:q(.95),families:map.size,resamples:RESAMPLES};
}
export function paired(candidate,reference,families){
 if(candidate.length!==reference.length||candidate.some(x=>x!==0&&x!==1)||reference.some(x=>x!==0&&x!==1))throw Error('PAIRED_BINARY_OUTCOMES_REQUIRED');
 const benefits=candidate.filter((x,i)=>x===0&&reference[i]===1).length,harms=candidate.filter((x,i)=>x===1&&reference[i]===0).length;
 const delta=interval(candidate.map((x,i)=>x-reference[i]),families),p=signTest(benefits,harms),d=reference.reduce((a,b)=>a+b,0),f=candidate.reduce((a,b)=>a+b,0);
 return {benefits,harms,p,delta,relativeReduction:d?(d-f)/d:null,reject:p<=.05&&delta.upper95<0};
}
export function holm(pvalues){const ordered=Object.entries(pvalues).sort((a,b)=>a[1]-b[1]),out={};let prev=0;ordered.forEach(([key,p],i)=>{if(!(p>=0&&p<=1))throw Error('INVALID_P_VALUE');prev=Math.max(prev,Math.min(1,p*(ordered.length-i)));out[key]=prev;});return out;}
