import { isIndependentRecord,isIndependentScope } from './independent-assistant-client.js';
import { sameAssistantScope,type IndependentScope } from './independent-contracts.js';
import type { ChildRunEvent,ChildRunSnapshot } from './child-run-contracts.js';

export type ChildHistoryRequest=Readonly<{sessionId:string;workspacePath:string;browserProfileId:string;parentTurnId?:string;afterSequence?:Readonly<Record<string,number>>}>;
export type ChildHistory=Readonly<{schemaVersion:1;scope:IndependentScope;parentSessionId:string;parentTurns:readonly string[];
  runs:readonly ChildRunSnapshot[];events:readonly ChildRunEvent[];resyncNeeded:boolean}>;
const statuses=['queued','running','waiting_for_approval','paused','completed','failed','cancelled','interrupted'];
const kinds=['started','answer_delta','tool','status','completed'];
const id=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_:-]{1,200}$/.test(value);
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const at=(value:unknown):value is string=>typeof value==='string'&&(value===''||Number.isFinite(Date.parse(value)));
function identity(value:Record<string,unknown>):boolean {
  return isIndependentScope(value.scope)&&id(value.parentSessionId)&&id(value.parentTurnId)&&id(value.subagentId)
    &&(value.parentSubagentId===null||id(value.parentSubagentId))&&(value.childSessionId===null||id(value.childSessionId))
    &&count(value.depth)&&value.depth<=16&&isIndependentRecord(value.model)&&typeof value.model.provider==='string'
    &&value.model.provider.length<=200&&typeof value.model.model==='string'&&value.model.model.length<=500;
}
export function isChildRunSnapshot(value:unknown):value is ChildRunSnapshot {
  return isIndependentRecord(value)&&value.schemaVersion===1&&identity(value)&&statuses.includes(String(value.status))
    &&count(value.revision)&&count(value.watermark)&&at(value.observedAt)&&value.observedAt!==''
    &&(value.title===undefined||typeof value.title==='string'&&value.title.length<=1000)
    &&(value.truncated===undefined||typeof value.truncated==='boolean')
    &&(value.sourceActuality===undefined||['persisted','partial','unavailable'].includes(String(value.sourceActuality)))
    &&Array.isArray(value.messages)&&value.messages.length<=128&&value.messages.every(message=>isIndependentRecord(message)
      &&id(message.id)&&['assistant','user','tool','system'].includes(String(message.role))&&typeof message.content==='string'
      &&message.content.length<=262144&&at(message.at))&&new Set(value.messages.map(message=>message.id)).size===value.messages.length;
}
export function isChildRunEvent(value:unknown):value is ChildRunEvent {
  if(!isIndependentRecord(value)||value.schemaVersion!==1||!identity(value)||!count(value.sequence)||value.sequence<1
    ||!kinds.includes(String(value.kind))||!at(value.at)||value.at===''||!isIndependentRecord(value.payload))return false;
  const payload=value.payload;
  if(payload.snapshot!==undefined){
    if(!isChildRunSnapshot(payload.snapshot))return false;
    const snapshot=payload.snapshot;
    if(snapshot.subagentId!==value.subagentId||snapshot.parentSessionId!==value.parentSessionId||snapshot.parentTurnId!==value.parentTurnId
      ||snapshot.parentSubagentId!==value.parentSubagentId||snapshot.childSessionId!==value.childSessionId||snapshot.depth!==value.depth
      ||!isIndependentRecord(value.model)||snapshot.model.provider!==value.model.provider||snapshot.model.model!==value.model.model
      ||!isIndependentScope(value.scope)||!sameAssistantScope(snapshot.scope,value.scope)||snapshot.watermark!==value.sequence)return false;
  }
  return (value.kind!=='answer_delta'||typeof payload.delta==='string'&&payload.delta.length<=65536)
    &&(payload.messageId===undefined||id(payload.messageId))&&(payload.status===undefined||statuses.includes(String(payload.status)));
}
export function readChildHistory(value:unknown,scope:IndependentScope,sessionId:string):ChildHistory {
  if(!isIndependentRecord(value)||value.schemaVersion!==1||!isIndependentScope(value.scope)||!sameAssistantScope(value.scope,scope)
    ||value.parentSessionId!==sessionId||!Array.isArray(value.parentTurns)||value.parentTurns.length>32||!value.parentTurns.every(id)
    ||new Set(value.parentTurns).size!==value.parentTurns.length||!Array.isArray(value.runs)||value.runs.length>128
    ||!Array.isArray(value.events)||value.events.length>65536||typeof value.resyncNeeded!=='boolean')throw Error('child_history_invalid');
  const parentTurns=value.parentTurns;
  const bound=(item:ChildRunSnapshot|ChildRunEvent)=>item.parentSessionId===sessionId&&sameAssistantScope(item.scope,scope)
    &&parentTurns.includes(item.parentTurnId);
  if(!value.runs.every(isChildRunSnapshot)||!value.events.every(isChildRunEvent)||!value.runs.every(bound)||!value.events.every(bound))throw Error('child_history_invalid');
  if(new Set(value.runs.map(run=>run.subagentId)).size!==value.runs.length)throw Error('child_history_invalid');
  return {schemaVersion:1,scope:value.scope,parentSessionId:sessionId,parentTurns,runs:value.runs,events:value.events,resyncNeeded:value.resyncNeeded};
}
