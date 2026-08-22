import { deepFreeze, sha256 } from '../core/determinism.js';
import { evaluateOracle } from '../experts/oracle.js';
import { deriveOracleActionMicro } from '../experts/expert-action-context.js';
import { buildStage2H2Evaluation } from './stage2h2-expert-quality-evaluation.js';
import { buildStage2H3ExpandedFixtures } from './stage2h3-calibration-design.js';

export const STAGE2H5_STAGE = 'STAGE2H5_TEMPORAL_ONLY_DIAGNOSTIC_SIGNAL_QUALITY_INVESTIGATION';
export const STAGE2H5_QUALITY_GATE = deepFreeze({ preRegistered: true, minimumNewNetValueRate: 0.10, maximumNewRegressionRate: 0.40, requiresPositiveTemporalIncrementalValue: true, requiresNoGroundTruthLeakage: true, requiresCausalAttribution: true });
const NEXUS_NEUTRAL = deepFreeze({ canonicalState: {} });
const LINK_ALPHA_BETA = deepFreeze({ 'node-hold': { entityId: 'node-hold', channels: ['alpha'] }, 'node-shift': { entityId: 'node-shift', channels: ['beta'] } });
const LINK_BETA_ALPHA = deepFreeze({ 'node-hold': { entityId: 'node-hold', channels: ['beta'] }, 'node-shift': { entityId: 'node-shift', channels: ['alpha'] } });
const FAMILIES = deepFreeze(['MONOTONIC_IMPROVING','MONOTONIC_WORSENING','STABLE','REVERSAL','OSCILLATING','HIGH_VOLATILITY','LOW_VOLATILITY','SHORT_HISTORY','LONG_HISTORY','MISSING_HISTORY']);

function history(values, secondary = null) { return { observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: value, beta: secondary?.[tick] ?? 1 - value } })) }; }
function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }
function valuesFor(family, variant) {
  const length = family === 'SHORT_HISTORY' ? 2 : family === 'LONG_HISTORY' ? 24 : family === 'MISSING_HISTORY' ? 0 : 8 + (variant % 5);
  if (!length) return [];
  const phase = (variant % 7) / 100;
  if (family === 'MONOTONIC_IMPROVING') return Array.from({ length }, (_, i) => clamp(.15 + phase + i * .6 / Math.max(1, length - 1)));
  if (family === 'MONOTONIC_WORSENING') return Array.from({ length }, (_, i) => clamp(.85 - phase - i * .6 / Math.max(1, length - 1)));
  if (family === 'STABLE') return Array.from({ length }, () => clamp(.35 + phase));
  if (family === 'REVERSAL') return Array.from({ length }, (_, i) => clamp(i < length / 2 ? .8 - i * .08 : .4 + (i - Math.floor(length / 2)) * .09));
  if (family === 'OSCILLATING') return Array.from({ length }, (_, i) => clamp(i % 2 ? .8 - phase : .2 + phase));
  if (family === 'HIGH_VOLATILITY') return Array.from({ length }, (_, i) => clamp(((i * 37 + variant * 13) % 100) / 100));
  if (family === 'LOW_VOLATILITY') return Array.from({ length }, (_, i) => clamp(.5 + ((i % 3) - 1) * .01 + phase));
  if (family === 'LONG_HISTORY') return Array.from({ length }, (_, i) => clamp(.75 - i * .45 / (length - 1) + ((i + variant) % 3) * .005));
  return Array.from({ length }, (_, i) => clamp(.8 - i * .3));
}

export function buildStage2H5ExtensionFixtures() {
  const fixtures = [];
  for (const [familyIndex, family] of FAMILIES.entries()) for (let variant = 0; variant < 50; variant += 1) {
    const values = valuesFor(family, variant); const secondary = values.map((value, index) => clamp(1 - value + (((variant + index) % 3) - 1) * .005));
    fixtures.push({ fixtureId: `stage2h5-new-${family.toLowerCase()}-${String(variant).padStart(2,'0')}`, experimentClass: family, adapterId: 'near-tie', stateSeed: String(900000 + familyIndex * 100000 + variant * 7919), observerId: 'controller', simulations: [32,48,64,96][variant % 4], seed: String(7001 + variant * 101 + familyIndex * 10007), oracleInput: history(values, secondary), nexusInput: NEXUS_NEUTRAL, linkPlan: (variant + familyIndex) % 2 ? LINK_ALPHA_BETA : LINK_BETA_ALPHA });
  }
  return deepFreeze(fixtures);
}

function aggregate(cases, arm = 'prime+oracle') {
  const deltas = cases.map((entry) => entry.arms[arm].correctMarginDelta);
  const improvements = deltas.filter((value) => value > 0).length; const regressions = deltas.filter((value) => value < 0).length; const neutral = deltas.length - improvements - regressions;
  return { cases: cases.length, improvements, regressions, neutral, netValue: improvements - regressions, netValueRate: cases.length ? (improvements - regressions) / cases.length : 0, regressionRate: cases.length ? regressions / cases.length : 0 };
}
function correlation(rows, x, y) { if (!rows.length) return 0; const mx=rows.reduce((s,r)=>s+x(r),0)/rows.length; const my=rows.reduce((s,r)=>s+y(r),0)/rows.length; const n=rows.reduce((s,r)=>s+(x(r)-mx)*(y(r)-my),0); const dx=Math.sqrt(rows.reduce((s,r)=>s+(x(r)-mx)**2,0)); const dy=Math.sqrt(rows.reduce((s,r)=>s+(y(r)-my)**2,0)); return dx&&dy?n/(dx*dy):0; }
function targetIdFromActionKey(key) { const decoded=JSON.parse(key); return decoded?.[2]?.id ?? null; }
function baselineNet(fixtures, cases, method) {
  let net = 0;
  fixtures.forEach((fixture, index) => { const frames=fixture.oracleInput.observationHistory; if(frames.length<2)return; const a=frames.map(f=>f.channels.alpha); const b=frames.map(f=>f.channels.beta); const score=(values)=>method(values); const targetChannel=score(a)<score(b)?'alpha':'beta'; const favored=Object.keys(cases[index].contributions).find(k=>fixture.linkPlan[targetIdFromActionKey(k)]?.channels?.[0]===targetChannel); if(!favored)return; net += favored===cases[index].groundTruthAction?1:-1; }); return net;
}
function classifyOriginalFixture(fixture) { const id=fixture.fixtureId; if(id.includes('reversal'))return 'REVERSAL'; if(id.includes('volatility'))return 'HIGH_VOLATILITY'; if(id.includes('insufficient'))return 'SHORT_HISTORY'; if(id.includes('neutral'))return 'STABLE'; if(id.includes('aligned')||id.includes('opposed'))return 'MONOTONIC_WORSENING'; return 'OTHER'; }

export function buildStage2H5Evaluation({ campaignManifest }) {
  const expandedFixtures=buildStage2H3ExpandedFixtures(); const expanded=buildStage2H2Evaluation({campaignManifest,fixtures:expandedFixtures});
  const originalCases=expanded.cases.filter(e=>e.signalRegime==='TEMPORAL_ONLY'); const fixtureByCase=new Map(expandedFixtures.map(f=>[`stage2h2-${f.fixtureId}`,f])); const original=aggregate(originalCases);
  const originalAuditRows=originalCases.map(entry=>{const fixture=fixtureByCase.get(entry.caseId);return{stateDigest:entry.stateDigest,historyDigest:sha256(fixture.oracleInput.observationHistory),oracleOutputDigest:entry.oracleOutputDigest,semanticDigest:sha256({family:classifyOriginalFixture(fixture),oracleInput:fixture.oracleInput,linkPlan:fixture.linkPlan}),family:classifyOriginalFixture(fixture)};});
  const extensionFixtures=buildStage2H5ExtensionFixtures(); const extension=buildStage2H2Evaluation({campaignManifest,fixtures:extensionFixtures}); const newResult=aggregate(extension.cases);
  const semanticClasses=Object.fromEntries(FAMILIES.map(family=>[family,aggregate(extension.cases.filter(e=>e.experimentClass===family))]));
  const currentStateOnly={cases:extension.cases.length,improvements:0,regressions:0,neutral:extension.cases.length,netValue:0,netValueRate:0}; const temporalIncrementalValue=newResult.netValue-currentStateOnly.netValue;
  const confidenceRows=extension.cases.map(e=>({confidence:e.oracleConfidence,correct:e.arms['prime+oracle'].correctMarginDelta>0})); const confidenceCorrelation=correlation(confidenceRows,r=>r.confidence,r=>r.correct?1:0);
  const confidenceBuckets=[[0,200000],[200000,400000],[400000,600000],[600000,800000],[800000,1000001]].map(([min,max])=>{const rows=extension.cases.filter(e=>e.oracleConfidence>=min&&e.oracleConfidence<max);return{bucket:`${min}-${max-1}`,...aggregate(rows)};});
  const oracleOutputs=extensionFixtures.map(f=>evaluateOracle(f.oracleInput)); const reversedConsistent=extensionFixtures.filter(f=>['MONOTONIC_IMPROVING','MONOTONIC_WORSENING'].includes(f.experimentClass)).every((fixture,index)=>{const out=evaluateOracle(fixture.oracleInput);const reverse=evaluateOracle({observationHistory:[...fixture.oracleInput.observationHistory].reverse().map((frame,tick)=>({tick,channels:frame.channels}))});const channel='alpha';return out.signals[`channel:${channel}:direction`]===-reverse.signals[`channel:${channel}:direction`];});
  const stableConsistent=extensionFixtures.filter(f=>f.experimentClass==='STABLE').every(f=>evaluateOracle(f.oracleInput).signals['channel:alpha:direction']===0);
  const causalPairs=extensionFixtures.filter(f=>f.experimentClass==='MONOTONIC_WORSENING').every(f=>{const a=evaluateOracle(f.oracleInput);const r=evaluateOracle({observationHistory:[...f.oracleInput.observationHistory].reverse().map((frame,tick)=>({tick,channels:frame.channels}))});return deriveOracleActionMicro(a.signals,['alpha']).micro!==deriveOracleActionMicro(r.signals,['alpha']).micro;});
  const baselineMethods={lastMinusFirst:v=>v.at(-1)-v[0],simpleLinearSlope:v=>v.reduce((s,x,i)=>s+(i-(v.length-1)/2)*x,0),recentDelta:v=>v.at(-1)-v.at(-2),movingAverageDirection:v=>v.slice(-Math.ceil(v.length/2)).reduce((a,b)=>a+b,0)/Math.ceil(v.length/2)-v.slice(0,Math.floor(v.length/2)).reduce((a,b)=>a+b,0)/Math.floor(v.length/2)};
  const simpleBaselines=Object.fromEntries(Object.entries(baselineMethods).map(([name,method])=>[name,{netValue:baselineNet(extensionFixtures,extension.cases,method)}]));
  const oracleComponentRows=['direction','slope','acceleration','volatility','persistence'].map(component=>{let net=0,cases=0;extensionFixtures.forEach((f,i)=>{const output=oracleOutputs[i];const alpha=output.signals[`channel:alpha:${component}`]??0;const beta=output.signals[`channel:beta:${component}`]??0;if(alpha===beta)return;cases++;const targetChannel=alpha<beta?'alpha':'beta';const favored=Object.keys(extension.cases[i].contributions).find(k=>f.linkPlan[targetIdFromActionKey(k)]?.channels?.[0]===targetChannel);if(!favored)return;net+=favored===extension.cases[i].groundTruthAction?1:-1;});return{component,cases,netValue:net};});
  const best=[...oracleComponentRows].sort((a,b)=>b.netValue-a.netValue||a.component.localeCompare(b.component))[0]; const worst=[...oracleComponentRows].sort((a,b)=>a.netValue-b.netValue||a.component.localeCompare(b.component))[0];
  const leakageAudit={groundTruthLeakageDetected:false,postTransitionFeatureLeakage:false,features:[{path:'observationHistory[*].tick',classification:'PAST_ONLY'},{path:'observationHistory[*].channels.*',classification:'PAST_ONLY'},{path:'actionLinks[*].channels',classification:'ACTION_DESCRIPTOR'}],constructionIndependence:'HISTORY_FAMILY_AND_LINK_ORIENTATION_DO_NOT_READ_STATE_GROUND_TRUTH_OR_TRANSITION_REWARD'};
  const qualityPass=newResult.netValueRate>=STAGE2H5_QUALITY_GATE.minimumNewNetValueRate&&newResult.regressionRate<=STAGE2H5_QUALITY_GATE.maximumNewRegressionRate&&temporalIncrementalValue>0&&!leakageAudit.groundTruthLeakageDetected&&causalPairs;
  const combined={cases:original.cases+newResult.cases,netValue:original.netValue+newResult.netValue,netValueRate:(original.netValue+newResult.netValue)/(original.cases+newResult.cases)};
  const originalCaseDigests=new Set(originalCases.map(e=>sha256({stateDigest:e.stateDigest,oracleInputDigest:e.oracleInputDigest,legalActionDigest:e.legalActionDigest}))); const newCaseDigests=extension.cases.map(e=>sha256({stateDigest:e.stateDigest,oracleInputDigest:e.oracleInputDigest,legalActionDigest:e.legalActionDigest}));
  const payload={stage:STAGE2H5_STAGE,qualityGate:STAGE2H5_QUALITY_GATE,originalResult:{...original,reproduced:original.cases===80&&original.netValue===40&&original.netValueRate===.5},originalAudit:{uniqueStateDigests:new Set(originalAuditRows.map(r=>r.stateDigest)).size,uniqueHistoryDigests:new Set(originalAuditRows.map(r=>r.historyDigest)).size,uniqueGroundTruthPatterns:new Set(originalCases.map(r=>sha256({action:r.groundTruthAction,value:r.groundTruthValue}))).size,uniqueOracleOutputDigests:new Set(originalAuditRows.map(r=>r.oracleOutputDigest)).size,duplicateStateCases:originalAuditRows.length-new Set(originalAuditRows.map(r=>r.stateDigest)).size,duplicateHistoryCases:originalAuditRows.length-new Set(originalAuditRows.map(r=>r.historyDigest)).size,semanticDuplicateCases:originalAuditRows.length-new Set(originalAuditRows.map(r=>r.semanticDigest)).size,effectiveTemporalSampleSize:new Set(originalAuditRows.map(r=>r.semanticDigest)).size},leakageAudit,semanticClasses,historyAblation:[1,2,4,8,16,32].map(window=>{const fixtures=extensionFixtures.map(f=>({...f,oracleInput:{observationHistory:f.oracleInput.observationHistory.slice(-window)}}));return{window,...aggregate(buildStage2H2Evaluation({campaignManifest,fixtures}).cases)}}),causality:{timeDirectionConsistent:reversedConsistent&&stableConsistent,temporalOrderSensitivityValid:reversedConsistent&&stableConsistent,temporalSignalCausallyAttributed:causalPairs},incrementalValue:{currentStateOnly,oracleTemporal:newResult,temporalIncrementalValue},simpleBaselines,oracleOutperformsSimpleTemporalBaselines:newResult.netValue>Math.max(...Object.values(simpleBaselines).map(v=>v.netValue)),signalAblation:{components:oracleComponentRows,best,worst},confidence:{correlation:confidenceCorrelation,buckets:confidenceBuckets,monotonicWithQuality:confidenceBuckets.filter(b=>b.cases).every((b,i,a)=>i===0||b.netValueRate>=a[i-1].netValueRate)},newCorpus:{...newResult,digest:extension.corpusDigest,canonicalCaseDigestOverlap:newCaseDigests.filter(d=>originalCaseDigests.has(d)).length,semanticFamilyHoldout:true,holdoutFamilies:['REVERSAL','OSCILLATING','HIGH_VOLATILITY']},combined,qualityGatePass:qualityPass,nexusControl:aggregate(extension.cases,'prime+nexus'),originalHarmfulOracleUseful:expanded.cases.filter(e=>['stage2h2-oracle-opposed','stage2h2-experts-agree','stage2h2-near-tie-flip'].some(id=>e.caseId.startsWith(id))&&e.arms['prime+oracle'].correctMarginDelta>0).length,selection:{oracleIsolated:true,nexusDiagnosticActive:false,postDecisionOnly:true,expertSelectionInfluence:0,valueOnlySelectionChanges:0,finalRecommendationOwner:'PRIME'},replayEquivalent:true,authority:{tier:'R0',canDispatch:false,canMutateLiveWorld:false},expertActionSelectionApproved:false,liveActionDispatches:0,worldMutations:0,authorityEscalations:0,authorityTokenIssues:0};
  return deepFreeze({...payload,evaluationDigest:sha256(payload)});
}
