// R0 integration of the discriminator. No evaluator, training or outcome access.
// Equal top actions stay a set. Abstention is never repaired into a policy choice.
export const CANDIDATE_ID='SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V2_CANDIDATE';
export function createCandidateKernel(discriminator){
 if(typeof discriminator?.compare!=='function')throw Error('DISCRIMINATOR_REQUIRED');
 const recommend=(state,legalActions,evidence=null)=>{
  const r=discriminator.compare(state,legalActions,evidence),top=r.decision.kind==='TOP_SET'?r.decision.topSet:[];
  const decisionSet=top.map(a=>typeof a==='number'?{index:a}:a);
  return Object.freeze({kernelId:CANDIDATE_ID,status:r.status,qualification:r.qualification,authority:r.authority,
   rankedActions:r.rankedActions,evidence:r.evidence,uncertainty:r.uncertainty,decisionHash:r.decisionDigest,
   recommendedActionOrAbstention:decisionSet.length?{kind:'RECOMMEND',decisionSet}:{kind:'ABSTAIN',reason:r.decision.reason},comparison:r});
 };
 const refuse=()=>{throw Error('EXECUTION_OR_MUTATION_REQUESTED');};
 return Object.freeze({recommend,execute:refuse,dispatch:refuse,mutate:refuse});
}
