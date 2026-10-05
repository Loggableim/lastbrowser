import { describe,expect,it } from 'vitest';
import { IndependentAssistantClient,isActivitySnapshot,isApproval } from '../src/renderer/independent-assistant-client.js';
import { independentApprovalCopy } from '../src/renderer/i18n/independent-approval-copy.js';
import { nativeGoalPausedReasonCopy,nativeGoalHumanAuthorizationErrorCopy,nativeGoalErrorCopy } from '../src/renderer/native-goal-errors.js';
const scope={backendProfileId:'8a8557d4-aa81-41dd-aad1-0108fdab2b42',spaceId:'834b83d7-32c6-4c30-bd02-04c6c80db6b7',browserProfileId:'approval-controlled'};
const owner={sessionId:'actual-chat',streamId:'actual-stream',writerGeneration:'actual-writer',writerLeaseId:'actual-lease'};
const approval={schemaVersion:1,scope,approvalId:'8a8557d4-aa81-41dd-aad1-0108fdab2b45',runId:null,ownerKind:'native_chat',ownerRef:owner,...owner,
 actionId:'8a8557d4-aa81-41dd-aad1-0108fdab2b46',controlEpoch:2,actionDigest:'a'.repeat(64),effect:'write',targetSummary:'Controlled browser form submission',permissionRevision:3,
 navigationEpoch:1,connectionRevision:null,expiresAt:new Date(Date.now()+10000).toISOString(),state:'pending',actorRef:null,connectionRevisions:{},leaseId:null,targetId:null,mainGeneration:null,runnerGeneration:null} as const;
describe('Native browser approval ownership in the renderer',()=>{
 it('admits a real native chat owner without fabricating an independent run',()=>{
  expect(isApproval(approval)).toBe(true);
  const activity={schemaVersion:1,scope,observedAt:new Date().toISOString(),watermark:0,sourceState:'live',lastSuccessfulAt:null,runs:[],dispatches:[],approvals:[],nativeApprovals:[approval],activeChats:[{sessionId:owner.sessionId,observedAt:new Date().toISOString()}],schedules:[]};
  expect(isActivitySnapshot(activity)).toBe(true);
  expect(isApproval({...approval,runId:approval.actionId})).toBe(false);expect(isApproval({...approval,ownerRef:{...owner,streamId:'foreign'}})).toBe(false);
  expect(isActivitySnapshot({...activity,approvals:[approval]})).toBe(false);
  expect(isActivitySnapshot({...activity,nativeApprovals:[{...approval,scope:{...scope,browserProfileId:'foreign'}}]})).toBe(false);
 });
 it('rejects missing epoch, writer binding, action identity and invalid connection revision',()=>{
  for(const change of [{controlEpoch:undefined},{writerLeaseId:''},{actionId:'fabricated'},{connectionRevisions:{connection:-1}}])expect(isApproval({...approval,...change})).toBe(false);
 });
 it('binds the approval acknowledgement to the exact digest, permission revision and control epoch',async()=>{
  const payload={approvalId:approval.approvalId,approved:true,actionDigest:approval.actionDigest,expectedPermissionRevision:approval.permissionRevision,expectedControlEpoch:approval.controlEpoch,clientRequestId:approval.actionId};
  const accepted=new IndependentAssistantClient({request:async()=>({ok:true,value:{...approval,state:'approved'}})});
  await expect(accepted.request({schemaVersion:1,operation:'approve',scope,payload})).resolves.toMatchObject({ok:true,value:{runId:null,ownerKind:'native_chat',state:'approved'}});
  for(const change of [{approvalId:approval.actionId},{actionDigest:'b'.repeat(64)},{permissionRevision:4},{controlEpoch:3}]){
   const client=new IndependentAssistantClient({request:async()=>({ok:true,value:{...approval,...change,state:'approved'}})});
   await expect(client.request({schemaVersion:1,operation:'approve',scope,payload})).resolves.toMatchObject({ok:false,error:{code:'invalid_response'}});
  }
 });
 it('keeps expiry and actual working chat descriptions available in all eight languages',()=>{
  for(const locale of ['en','de','es','fr','it','pt-BR','ru','ja'] as const)expect(Object.values(independentApprovalCopy(locale)).every(text=>typeof text==='string'&&text.length>0)).toBe(true);
  expect(independentApprovalCopy('ja').expired).toContain('期限切れ');
 });
 it('explains a genuinely paused older goal without creating new confirmation or resume authority',()=>{
  const code='native_goal_human_authorization_required';
  for(const locale of ['en','de','es','fr','it','pt-BR','ru','ja'] as const){const text=nativeGoalPausedReasonCopy(locale,code);expect(text).not.toBe(code);
   expect(nativeGoalHumanAuthorizationErrorCopy(locale,{error_code:code})).toBe(text);expect(nativeGoalErrorCopy(locale,new Error(code))).toBe(text);}
  expect(nativeGoalPausedReasonCopy('de','Actual unrelated reason')).toBe('Actual unrelated reason');
  expect(nativeGoalHumanAuthorizationErrorCopy('de',{error_code:'unrelated'})).toBeNull();
 });
});
