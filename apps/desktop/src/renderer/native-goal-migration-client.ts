import { isIndependentRecord,isIndependentScope } from './independent-assistant-client.js';
import { assistantScopeKey,sameAssistantScope,type IndependentScope } from './independent-contracts.js';
type Binding=Readonly<{sessionId:string;workspacePath:string;browserProfileId:string;spaceScope:IndependentScope}>;
export type NativeGoalMigrationRequest=Binding&(Readonly<{action:'review'}>|Readonly<{action:'migrate';expectedSourceRevision:number;expectedSourceDigest:string;clientRequestId:string}>);
export type NativeGoalMigrationReview=Readonly<{schemaVersion:1;scope:IndependentScope;sessionId:string;sourceNamespace:string;targetNamespace:string;
  sourceDigest:string;sourceClaimsDigest:string;sourceRevision:number;goal:Readonly<{goal:string;status:'paused';revision:number;turnsUsed:number|null;maxTurns:number|null}>;
  targetDigest:string|null;targetConflict:boolean;continuationStarted:false}>;
export type NativeGoalMigrationResult=Readonly<{schemaVersion:1;scope:IndependentScope;sessionId:string;sourceNamespace:string;targetNamespace:string;
  sourceDigest:string;goalRevision:number;state:'migrated';continuationStarted:false;replayed?:boolean}>;
export type GoalMigrationPending=Readonly<{sourceDigest:string;sourceRevision:number;clientRequestId:string}>;
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f\d]{64}$/.test(value);
const revision=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value);
const key=(scope:IndependentScope,sessionId:string)=>`lastbrowser.goalMigration:${assistantScopeKey(scope)}:${sessionId}`;
export function readGoalMigrationPending(scope:IndependentScope,sessionId:string,storage:Pick<Storage,'getItem'>):GoalMigrationPending|null{
  try{const raw=storage.getItem(key(scope,sessionId));if(!raw)return null;const value:unknown=JSON.parse(raw);
    return isIndependentRecord(value)&&Object.keys(value).length===3&&digest(value.sourceDigest)&&revision(value.sourceRevision)&&uuid(value.clientRequestId)
      ?{sourceDigest:value.sourceDigest,sourceRevision:value.sourceRevision,clientRequestId:value.clientRequestId}:null;
  }catch{return null;}
}
export function saveGoalMigrationPending(scope:IndependentScope,sessionId:string,value:GoalMigrationPending|null,storage:Pick<Storage,'setItem'|'removeItem'>):void{
  try{if(value)storage.setItem(key(scope,sessionId),JSON.stringify(value));else storage.removeItem(key(scope,sessionId));}catch{}
}
export class NativeGoalMigrationError extends Error{constructor(readonly code:string){super(code);this.name='NativeGoalMigrationError';}}
export async function requestNativeGoalMigration(transport:(request:NativeGoalMigrationRequest)=>Promise<Record<string,unknown>>,
  request:NativeGoalMigrationRequest):Promise<NativeGoalMigrationReview|NativeGoalMigrationResult>{
  const value=await transport(request);
  if(value.ok!==true)throw new NativeGoalMigrationError(typeof value.error_code==='string'?value.error_code:'unconfirmed');
  if(!isIndependentRecord(value)||value.schemaVersion!==1||!isIndependentScope(value.scope)||!sameAssistantScope(value.scope,request.spaceScope)
    ||value.sessionId!==request.sessionId||typeof value.sourceNamespace!=='string'||!/^lbws-[a-f\d]{32}$/.test(value.sourceNamespace)
    ||typeof value.targetNamespace!=='string'||!/^[a-z\d][a-z\d_-]*$/.test(value.targetNamespace)||value.targetNamespace.startsWith('lbws-')
    ||!digest(value.sourceDigest)||value.continuationStarted!==false)throw new NativeGoalMigrationError('invalid_response');
  const common={schemaVersion:1 as const,scope:value.scope,sessionId:value.sessionId,sourceNamespace:value.sourceNamespace,
    targetNamespace:value.targetNamespace,sourceDigest:value.sourceDigest,continuationStarted:false as const};
  if(request.action==='review'){
    const goal=value.goal;
    if(!revision(value.sourceRevision)||!digest(value.sourceClaimsDigest)||!(value.targetDigest===null||digest(value.targetDigest))
      ||typeof value.targetConflict!=='boolean'||value.targetConflict!==(value.targetDigest!==null)||!isIndependentRecord(goal)
      ||typeof goal.goal!=='string'||!goal.goal.trim()||goal.status!=='paused'||(goal.revision??0)!==value.sourceRevision
      ||goal.turns_used!==undefined&&!revision(goal.turns_used)||goal.max_turns!==undefined&&goal.max_turns!==null&&(!revision(goal.max_turns)||goal.max_turns===0))throw new NativeGoalMigrationError('invalid_response');
    return {...common,sourceRevision:value.sourceRevision,sourceClaimsDigest:value.sourceClaimsDigest,targetDigest:value.targetDigest,targetConflict:value.targetConflict,
      goal:{goal:goal.goal,status:'paused',revision:value.sourceRevision,turnsUsed:typeof goal.turns_used==='number'?goal.turns_used:null,maxTurns:typeof goal.max_turns==='number'?goal.max_turns:null}};
  }
  if(value.state!=='migrated'||value.goalRevision!==request.expectedSourceRevision||value.sourceDigest!==request.expectedSourceDigest
    ||value.replayed!==undefined&&typeof value.replayed!=='boolean')throw new NativeGoalMigrationError('invalid_response');
  return {...common,state:'migrated',goalRevision:request.expectedSourceRevision,...(value.replayed===true?{replayed:true}:{})};
}
