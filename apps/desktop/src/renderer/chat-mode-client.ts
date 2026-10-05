import { isIndependentRecord,isIndependentScope } from './independent-assistant-client.js';
import { sameAssistantScope,type IndependentScope } from './independent-contracts.js';
import type { CommandCapabilities } from './CommandActionContracts.js';
import type { DesktopSessionDetail } from './shell-state.js';

export type ChatExecutionMode='action'|'plan'|'grill_me'|'boost';
export type ChatModeSettings=Readonly<{schemaVersion:1;mode:ChatExecutionMode;lifetime:'chat'|'next_turn';revision:number}>;
export type ChatModeRequest=Readonly<{action:'get';sessionId:string;workspacePath:string;browserProfileId:string}>
  |Readonly<{action:'set';sessionId:string;workspacePath:string;browserProfileId:string;mode:ChatExecutionMode;
    lifetime:'chat'|'next_turn';expectedRevision:number;clientRequestId:string}>;
export type ChatModeResponse=Readonly<{ok:true;mode:ChatModeSettings;capabilities:CommandCapabilities;
  session:DesktopSessionDetail&Readonly<{space_scope:IndependentScope}>}>;

export function isChatModeSettings(value:unknown):value is ChatModeSettings {
  return isIndependentRecord(value)&&value.schemaVersion===1&&['action','plan','grill_me','boost'].includes(String(value.mode))
    &&['chat','next_turn'].includes(String(value.lifetime))&&Number.isSafeInteger(value.revision)&&typeof value.revision==='number'&&value.revision>=0;
}
function isCommandCapabilities(value:unknown):value is CommandCapabilities {
  return isIndependentRecord(value)&&['plan','grill_me','boost','goal','gquota','plugins'].every(key=>typeof value[key]==='boolean');
}
function isChatModeResponse(value:unknown):value is ChatModeResponse {
  if(!isIndependentRecord(value)||value.ok!==true||!isChatModeSettings(value.mode)||!isCommandCapabilities(value.capabilities)
    ||!isIndependentRecord(value.session)||typeof value.session.session_id!=='string'||!value.session.session_id||!isIndependentScope(value.session.space_scope))return false;
  const session=value.session;
  return (session.model===undefined||session.model===null||typeof session.model==='string')
    &&(session.profile===undefined||typeof session.profile==='string')&&(session.workspace===undefined||typeof session.workspace==='string')
    &&(session.messages===undefined||Array.isArray(session.messages)&&session.messages.every(message=>isIndependentRecord(message)
      &&(message.role===undefined||typeof message.role==='string')&&(message.content===undefined||typeof message.content==='string')))
    &&(session.goal===undefined||session.goal===null||isIndependentRecord(session.goal))
    &&(session.chat_execution_mode===undefined||session.chat_execution_mode===null||isChatModeSettings(session.chat_execution_mode));
}
/** Main resolves profile/scope; UI never supplies Home, native scope, or actor. */
export async function requestChatMode(transport:(request:ChatModeRequest)=>Promise<unknown>,request:ChatModeRequest,
  scope:IndependentScope):Promise<ChatModeResponse> {
  const value=await transport(request);
  if(!isChatModeResponse(value)||value.session.session_id!==request.sessionId||!sameAssistantScope(value.session.space_scope,scope)
    ||request.browserProfileId!==scope.browserProfileId)throw new Error('chat_mode_response_invalid');
  return value;
}
