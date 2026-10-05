import { isIndependentRecord,isIndependentScope } from './independent-assistant-client.js';
import { sameAssistantScope,type IndependentScope } from './independent-contracts.js';
export type GrillAnswer=Readonly<{kind:'choice';choiceId:string;text:null}|{kind:'text';choiceId:null;text:string}|{kind:'skipped';choiceId:null;text:null}>;
export type GrillQuestion=Readonly<{questionId:string;revision:number;topicId:string;prompt:string;options:readonly Readonly<{id:string;label:string}>[];allowFreeText:true;answer:GrillAnswer|null}>;
export type NativeGrillState=Readonly<{schemaVersion:1;scope:IndependentScope;sessionId:string;revision:number;modeRevision:number;status:'asking'|'review'|'finished';objective:string;
  topics:readonly Readonly<{id:string;label:string}>[];questions:readonly GrillQuestion[];
  coverage:readonly Readonly<{topicId:string;label:string;status:'answered'|'skipped'|'unresolved'}>[];
  summary:readonly Readonly<{questionId:string;prompt:string;answer:string|null;status:'unanswered'|'choice'|'text'|'skipped'}>[];canFinish:boolean}>;
type Binding=Readonly<{sessionId:string;workspacePath:string;browserProfileId:string}>;
export type NativeGrillMutation=Readonly<{action:'start';objective:string;topics?:readonly Readonly<{id:string;label:string}>[]}>
  |Readonly<{action:'answer';questionId:string;questionRevision:number;choiceId:string;text?:never}>
  |Readonly<{action:'answer';questionId:string;questionRevision:number;text:string;choiceId?:never}>
  |Readonly<{action:'skip';questionId:string;questionRevision:number}>
  |Readonly<{action:'review'|'resume'|'finish'}>;
export type NativeGrillRequest=Binding&(Readonly<{action:'get'}>|(NativeGrillMutation&Readonly<{expectedRevision:number;clientRequestId:string}>));
export type NativeGrillResponse=Readonly<{ok:true;grill:NativeGrillState|null;grillHistory?:readonly NativeGrillState[];replayed?:boolean;historical?:boolean;commandRevision?:number}>;
export type NativeGrillEvent=Readonly<{kind:'grill';grill:NativeGrillState}>|Readonly<{kind:'grill_fallback';reason:'invalid_structured_question'|'question_state_unavailable';readableText?:string}>;
export type NativeGrillFallbackMarker=Readonly<{reason:'invalid_structured_question'|'question_state_unavailable';streamId:string;writerGeneration:string}>;
const identity=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const revision=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const text=(value:unknown,max=8192):value is string=>typeof value==='string'&&Boolean(value.trim())&&value.length<=max;
export function isNativeGrillState(value:unknown):value is NativeGrillState {
  if(!isIndependentRecord(value)||value.schemaVersion!==1||!isIndependentScope(value.scope)||!identity(value.sessionId)||!revision(value.revision)||!revision(value.modeRevision)
    ||!['asking','review','finished'].includes(String(value.status))||!text(value.objective)||!Array.isArray(value.topics)||value.topics.length>128
    ||!value.topics.every((topic):topic is NativeGrillState['topics'][number]=>isIndependentRecord(topic)&&identity(topic.id)&&text(topic.label,512))
    ||new Set(value.topics.map(topic=>topic.id)).size!==value.topics.length||!Array.isArray(value.questions)||value.questions.length>256)return false;
  const topics=value.topics;
  if(!value.questions.every((question):question is GrillQuestion=>{
    if(!isIndependentRecord(question)||!identity(question.questionId)||!revision(question.revision)||!identity(question.topicId)||!topics.some(topic=>topic.id===question.topicId)
      ||!text(question.prompt)||question.allowFreeText!==true||!Array.isArray(question.options)||question.options.length<3||question.options.length>4
      ||!question.options.every((option):option is GrillQuestion['options'][number]=>isIndependentRecord(option)&&identity(option.id)&&text(option.label,512)))return false;
    const options=question.options;
    if(new Set(options.map(option=>option.id)).size!==options.length||new Set(options.map(option=>option.label.toLocaleLowerCase())).size!==options.length)return false;
    const answer=question.answer;
    return answer===null||isIndependentRecord(answer)&&(answer.kind==='choice'&&identity(answer.choiceId)&&options.some(option=>option.id===answer.choiceId)&&answer.text===null
      ||answer.kind==='text'&&text(answer.text)&&answer.choiceId===null||answer.kind==='skipped'&&answer.choiceId===null&&answer.text===null);
  })||new Set(value.questions.map(question=>question.questionId)).size!==value.questions.length||value.questions.filter(question=>question.answer===null).length>1)return false;
  const questions=value.questions;
  if(!Array.isArray(value.coverage)||value.coverage.length!==topics.length||new Set(value.coverage.map(row=>isIndependentRecord(row)?row.topicId:null)).size!==topics.length
    ||!value.coverage.every(row=>{if(!isIndependentRecord(row))return false;const topic=topics.find(topic=>topic.id===row.topicId);if(!topic||row.label!==topic.label)return false;
      const answers=questions.filter(question=>question.topicId===topic.id).map(question=>question.answer);
      return row.status===(answers.some(answer=>answer&&answer.kind!=='skipped')?'answered':answers.some(Boolean)?'skipped':'unresolved');}))return false;
  if(!Array.isArray(value.summary)||value.summary.length!==questions.length||new Set(value.summary.map(row=>isIndependentRecord(row)?row.questionId:null)).size!==questions.length
    ||!value.summary.every(row=>{if(!isIndependentRecord(row))return false;const question=questions.find(question=>question.questionId===row.questionId);if(!question||row.prompt!==question.prompt)return false;
      const answer=question.answer,expected=answer?.kind==='choice'?question.options.find(option=>option.id===answer.choiceId)?.label:answer?.kind==='text'?answer.text:null;
      return row.status===(answer?.kind??'unanswered')&&row.answer===expected;}))return false;
  return value.canFinish===(value.status!=='finished');
}
export class NativeGrillError extends Error {constructor(readonly code:string){super(code);this.name='NativeGrillError';}}
export function readNativeGrillFallbackMarker(value:unknown):NativeGrillFallbackMarker|null{
  return isIndependentRecord(value)&&Object.keys(value).length===3&&(value.reason==='invalid_structured_question'||value.reason==='question_state_unavailable')
    &&identity(value.streamId)&&identity(value.writerGeneration)?{reason:value.reason,streamId:value.streamId,writerGeneration:value.writerGeneration}:null;
}
function isNativeGrillHistory(value:unknown,scope:IndependentScope,sessionId:string):value is readonly NativeGrillState[]{
  return Array.isArray(value)&&value.length<=64&&value.every((item):item is NativeGrillState=>isNativeGrillState(item)&&item.status==='finished'&&item.sessionId===sessionId&&sameAssistantScope(item.scope,scope))
    &&new Set(value.map(item=>item.revision)).size===value.length;
}
/** nativeContext comes only from the purpose-bound Main reader; server event claims must match it. */
export function readNativeGrillEvent(payload:unknown,scope:IndependentScope,sessionId:string):NativeGrillEvent|null{
  if(!isIndependentRecord(payload)||!['grill','grill_fallback'].includes(String(payload.event))||!isIndependentRecord(payload.nativeContext)||!isIndependentRecord(payload.data))return null;
  const context=payload.nativeContext,data=payload.data;
  if(context.schemaVersion!==1||!isIndependentScope(context.scope)||!sameAssistantScope(context.scope,scope)||context.sessionId!==sessionId||context.streamId!==payload.streamId||!identity(context.writerGeneration)
    ||data.schemaVersion!==1||!isIndependentScope(data.scope)||!sameAssistantScope(data.scope,scope)||data.sessionId!==sessionId||data.streamId!==context.streamId||data.writerGeneration!==context.writerGeneration)return null;
  if(payload.event==='grill')return isNativeGrillState(data.grill)&&data.grill.sessionId===sessionId&&sameAssistantScope(data.grill.scope,scope)?{kind:'grill',grill:data.grill}:null;
  if(!['invalid_structured_question','question_state_unavailable'].includes(String(data.reason))||data.readableText!==undefined&&(typeof data.readableText!=='string'||data.readableText.length>8192))return null;
  return{kind:'grill_fallback',reason:data.reason==='invalid_structured_question'?'invalid_structured_question':'question_state_unavailable',...(typeof data.readableText==='string'?{readableText:data.readableText}:{})};
}
export async function requestNativeGrill(transport:(request:NativeGrillRequest)=>Promise<unknown>,request:NativeGrillRequest,scope:IndependentScope):Promise<NativeGrillResponse>{
  const value=await transport(request);
  if(isIndependentRecord(value)&&value.ok===false)throw new NativeGrillError(typeof value.error==='string'?value.error:'grill_unavailable');
  if(!isIndependentRecord(value)||value.ok!==true||!(value.grill===null||isNativeGrillState(value.grill)&&value.grill.sessionId===request.sessionId&&sameAssistantScope(value.grill.scope,scope))
    ||request.browserProfileId!==scope.browserProfileId||value.replayed!==undefined&&typeof value.replayed!=='boolean'||value.historical!==undefined&&typeof value.historical!=='boolean'
    ||value.commandRevision!==undefined&&!revision(value.commandRevision)
    ||value.grillHistory!==undefined&&!isNativeGrillHistory(value.grillHistory,scope,request.sessionId))throw new NativeGrillError('grill_response_invalid');
  if(request.action!=='get'){
    const actual=value.grill;
    if(actual===null||actual.revision<=request.expectedRevision||value.replayed===true&&(!revision(value.commandRevision)||value.commandRevision<=request.expectedRevision||value.commandRevision>actual.revision))throw new NativeGrillError('grill_response_invalid');
    if(value.replayed!==true){
      if(request.action==='start'&&actual.objective!==request.objective)throw new NativeGrillError('grill_response_invalid');
      if(['review','resume','finish'].includes(request.action)&&actual.status!==({review:'review',resume:'asking',finish:'finished'} as const)[request.action as 'review'|'resume'|'finish'])throw new NativeGrillError('grill_response_invalid');
      if(request.action==='answer'||request.action==='skip'){
        const question=actual.questions.find(question=>question.questionId===request.questionId),answer=question?.answer;
        if(!question||question.revision!==request.questionRevision+1||!answer||(request.action==='skip'?answer.kind!=='skipped':
          request.choiceId!==undefined?answer.kind!=='choice'||answer.choiceId!==request.choiceId:answer.kind!=='text'||answer.text!==request.text))throw new NativeGrillError('grill_response_invalid');
      }
    }
  }
  return{ok:true,grill:value.grill,...(isNativeGrillHistory(value.grillHistory,scope,request.sessionId)?{grillHistory:value.grillHistory}:{}),
    ...(typeof value.replayed==='boolean'?{replayed:value.replayed}:{}),...(typeof value.historical==='boolean'?{historical:value.historical}:{}),...(revision(value.commandRevision)?{commandRevision:value.commandRevision}:{})};
}
