import { create } from 'zustand';
import { isIndependentRecord,isIndependentScope } from './independent-assistant-client.js';
import { assistantScopeKey,sameAssistantScope,type IndependentScope } from './independent-contracts.js';

export type NativeChatControlRequest=Readonly<{sessionId:string;streamId:string;command:'cancel'|'pause'|'approval'|'clarify';
  workspacePath:string;browserProfileId:string;requestId?:string;choice?:'once'|'session'|'always'|'deny';response?:string}>;
export type NativeChatControlAck=Readonly<{schemaVersion:1;scope:IndependentScope;sessionId:string;streamId:string;accepted:boolean;state:'stopping'|'submitted'|'stale'}>;
export type NativeChatBinding=Readonly<{scope:IndependentScope;sessionId:string;streamId:string;workspacePath:string;browserProfileId:string}>;
export type NativeAutoRouteReceipt=Readonly<{turnId:string;provider:string;model:string;locality:'local'|'remote';reason:string}>;
export type NativeAutoRouteState=Readonly<{binding:NativeChatBinding;receipt:NativeAutoRouteReceipt}>;
export type NativeChatPending=Readonly<{requestId:string;kind:'approval'|'clarify';command?:string;description?:string;question?:string;choices?:readonly string[]}>;
type RecordView=Readonly<{binding:NativeChatBinding;pending:readonly NativeChatPending[];writerGeneration?:string;processExited?:boolean}>;
export type NativeControlSnapshot=Readonly<{schemaVersion:1;scope:IndependentScope;sessionId:string;streamId:string;writerGeneration:string;processExited:boolean;status:'running'|'stopping';
  pendingControls:readonly Readonly<{schemaVersion:1;type:'approval'|'clarify';requestId:string;scope:IndependentScope;sessionId:string;streamId:string;writerGeneration:string;data:Readonly<Record<string,unknown>>}>[]}>;
const id=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_:-]{1,200}$/.test(value);
export async function requestNativeChatControl(transport:(request:NativeChatControlRequest)=>Promise<unknown>,request:NativeChatControlRequest,scope:IndependentScope):Promise<NativeChatControlAck>{
  const value=await transport(request);
  if(!isIndependentRecord(value)||value.schemaVersion!==1||!isIndependentScope(value.scope)||!sameAssistantScope(value.scope,scope)
    ||value.sessionId!==request.sessionId||value.streamId!==request.streamId||typeof value.accepted!=='boolean'
    ||!(value.state==='stopping'||value.state==='submitted'||value.state==='stale'))throw Error('native_chat_control_invalid');
  if(value.accepted&&(request.command==='cancel'||request.command==='pause'?value.state!=='stopping':value.state!=='submitted'))throw Error('native_chat_control_invalid');
  return{schemaVersion:1,scope:value.scope,sessionId:request.sessionId,streamId:request.streamId,accepted:value.accepted,state:value.state};
}
export function nativeChatProcessExitConfirmed(event:unknown):boolean{
  return isIndependentRecord(event)&&isIndependentRecord(event.data)&&(event.data.processExited===true||event.event==='worker_exit');
}
const autoRouteReasons=new Set(['configured_orchestrator','first_eligible_allowed_model','observed_provider_headroom','fewest_active_claims',
  'fewest_recent_local_claims','fallback_after_admission_unavailable']);
export function readNativeAutoRouteReceipt(value:unknown,binding:NativeChatBinding):NativeAutoRouteReceipt|null{
  if(!isIndependentRecord(value)||value.event!=='auto_route'||value.streamId!==binding.streamId||!isIndependentRecord(value.data)
    ||!isIndependentRecord(value.nativeContext))return null;
  const context=value.nativeContext,data=value.data;
  if(value.sessionId!==undefined&&value.sessionId!==binding.sessionId)return null;
  if(context.schemaVersion!==1||context.sessionId!==binding.sessionId||context.streamId!==binding.streamId||!id(context.writerGeneration)
    ||!isIndependentScope(context.scope)||!sameAssistantScope(context.scope,binding.scope)
    ||data.schemaVersion!==1||data.sessionId!==binding.sessionId||!isIndependentScope(data.scope)||!sameAssistantScope(data.scope,binding.scope)
    ||!Number.isSafeInteger(data.policyRevision)||Number(data.policyRevision)<1
    ||(data.route!=='orchestrator'&&data.route!=='model'))return null;
  const turnId=data.turnId;
  const selected=isIndependentRecord(data.selectedModel)?data.selectedModel:isIndependentRecord(data.selected_model)?data.selected_model:null;
  const provider=selected?.provider,model=selected?.model,locality=data.locality,reason=data.reason;
  if(!id(turnId)||typeof provider!=='string'||!provider.trim()||provider.length>80||typeof model!=='string'||!model.trim()||model.length>200||model.trim().toLowerCase()==='auto'
    ||(locality!=='local'&&locality!=='remote')||typeof reason!=='string'||!autoRouteReasons.has(reason))return null;
  return{turnId,provider:provider.trim(),model:model.trim(),locality,reason};
}
export function readNativeControlSnapshot(value:unknown,scope:IndependentScope,sessionId:string):NativeControlSnapshot|null{
  if(!isIndependentRecord(value)||value.schemaVersion!==1||!isIndependentScope(value.scope)||!sameAssistantScope(value.scope,scope)||value.sessionId!==sessionId||!id(value.streamId)
    ||!id(value.writerGeneration)||typeof value.processExited!=='boolean'||!['running','stopping'].includes(String(value.status))||!Array.isArray(value.pendingControls)||value.pendingControls.length>32)return null;
  const streamId=value.streamId,writerGeneration=value.writerGeneration;
  if(!value.pendingControls.every((entry):entry is NativeControlSnapshot['pendingControls'][number]=>isIndependentRecord(entry)&&entry.schemaVersion===1&&(entry.type==='approval'||entry.type==='clarify')&&id(entry.requestId)
    &&isIndependentScope(entry.scope)&&sameAssistantScope(entry.scope,scope)&&entry.sessionId===sessionId&&entry.streamId===streamId&&entry.writerGeneration===writerGeneration&&isIndependentRecord(entry.data)))return null;
  if(new Set(value.pendingControls.map(entry=>entry.requestId)).size!==value.pendingControls.length)return null;
  return{schemaVersion:1,scope:value.scope,sessionId,streamId,writerGeneration,processExited:value.processExited,status:value.status==='running'?'running':'stopping',pendingControls:value.pendingControls};
}
export function recoverNativeControls(snapshot:NativeControlSnapshot,binding:NativeChatBinding):void{
  if(snapshot.sessionId!==binding.sessionId||snapshot.streamId!==binding.streamId||!sameAssistantScope(snapshot.scope,binding.scope))return;
  const store=useNativeChatControls.getState();store.bind(binding);
  useNativeChatControls.setState(state=>({records:{...state.records,[binding.streamId]:{binding,pending:[],writerGeneration:snapshot.writerGeneration,processExited:snapshot.processExited}}}));
  if(!snapshot.processExited)for(const pending of snapshot.pendingControls)store.event({streamId:binding.streamId,event:pending.type,
    nativeContext:{schemaVersion:1,scope:snapshot.scope,sessionId:binding.sessionId,streamId:binding.streamId,writerGeneration:snapshot.writerGeneration},
    data:{...pending.data,requestId:pending.requestId,session_id:binding.sessionId}});
}
export const useNativeChatControls=create<{records:Readonly<Record<string,RecordView>>;activeStreamId:string|null;autoRoute:NativeAutoRouteState|null;bind:(binding:NativeChatBinding)=>void;
  event:(payload:unknown)=>void;remove:(streamId:string,requestId:string)=>void}>(set=>({records:{},
  activeStreamId:null,autoRoute:null,
  bind:binding=>set(state=>{const records={...state.records};while(Object.keys(records).length>=64)delete records[Object.keys(records)[0]];
    const saved=state.records[binding.streamId],same=saved&&saved.binding.sessionId===binding.sessionId&&sameAssistantScope(saved.binding.scope,binding.scope);
    records[binding.streamId]={binding,pending:same?saved.pending:[],writerGeneration:same?saved.writerGeneration:undefined,processExited:same?saved.processExited:false};
    return{records,activeStreamId:binding.streamId,autoRoute:same&&state.autoRoute?.binding.streamId===binding.streamId?state.autoRoute:null};}),
  remove:(streamId,requestId)=>set(state=>{const row=state.records[streamId];return row?{records:{...state.records,[streamId]:{...row,pending:row.pending.filter(entry=>entry.requestId!==requestId)}}}:state;}),
  event:payload=>set(state=>{
    if(!isIndependentRecord(payload)||!id(payload.streamId))return state;
    const row=state.records[payload.streamId];if(!row)return state;
    const context=payload.nativeContext;
    if(context!==undefined&&(!isIndependentRecord(context)||context.schemaVersion!==1||!isIndependentScope(context.scope)||!sameAssistantScope(context.scope,row.binding.scope)
      ||context.sessionId!==row.binding.sessionId||context.streamId!==row.binding.streamId||!id(context.writerGeneration)
      ||row.writerGeneration!==undefined&&context.writerGeneration!==row.writerGeneration))return state;
    const route=readNativeAutoRouteReceipt(payload,row.binding);
    if(route){
      const generation=isIndependentRecord(context)&&typeof context.writerGeneration==='string'?context.writerGeneration:'';
      if(row.processExited===true||state.activeStreamId!==payload.streamId||!generation)return state;
      return{...state,autoRoute:{binding:row.binding,receipt:route},records:{...state.records,[payload.streamId]:{...row,writerGeneration:generation}}};
    }
    if(nativeChatProcessExitConfirmed(payload)){return{records:{...state.records,[payload.streamId]:{...row,pending:[],processExited:true}}};}
    if(row.processExited===true)return state;
    if(!['approval','clarify'].includes(String(payload.event))||!isIndependentRecord(payload.data)||!id(payload.data.requestId))return state;
    const data=payload.data;if(!id(data.requestId))return state;if(data.session_id!==undefined&&data.session_id!==row.binding.sessionId)return state;
    const kind=payload.event as 'approval'|'clarify';
    if(kind==='clarify'&&(typeof data.question!=='string'||!data.question.trim()||data.question.length>16384))return state;
    if(kind==='approval'&&(typeof data.command!=='string'||data.command.length>16384))return state;
    const choices=data.choices??data.choices_offered;
    if(choices!==undefined&&choices!==null&&(!Array.isArray(choices)||choices.length>4||!choices.every(choice=>typeof choice==='string'&&choice.length<=4096)))return state;
    const pending:NativeChatPending={requestId:data.requestId,kind,...(typeof data.command==='string'?{command:data.command}:{}),
      ...(typeof data.description==='string'?{description:data.description.slice(0,16384)}:{}),...(typeof data.question==='string'?{question:data.question}:{}),
      ...(Array.isArray(choices)?{choices}: {})};
    if(row.pending.length>=32&&!row.pending.some(entry=>entry.requestId===pending.requestId))return state;
    return{records:{...state.records,[payload.streamId]:{...row,pending:[...row.pending.filter(entry=>entry.requestId!==pending.requestId),pending]}}};
  })
}));
export function nativePendingKey(binding:NativeChatBinding):string{return`${assistantScopeKey(binding.scope)}:${binding.sessionId}:${binding.streamId}`;}
