import { describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { isNativeGrillState,readNativeGrillEvent,readNativeGrillFallbackMarker,requestNativeGrill,type NativeGrillState } from '../src/renderer/native-grill-client.js';
import { nativeGrillCopy } from '../src/renderer/i18n/native-grill-copy.js';
const scope={backendProfileId:randomUUID(),spaceId:randomUUID(),browserProfileId:'controlled'};
const question={questionId:'question-a',revision:0,topicId:'goal',prompt:'Which result?',options:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],allowFreeText:true as const,answer:null};
const state:NativeGrillState={schemaVersion:1,scope,sessionId:'chat-a',revision:2,modeRevision:7,status:'asking',objective:'Clarify this task',topics:[{id:'goal',label:'Result'}],questions:[question],
  coverage:[{topicId:'goal',label:'Result',status:'unresolved'}],summary:[{questionId:question.questionId,prompt:question.prompt,answer:null,status:'unanswered'}],canFinish:true};
const binding={sessionId:state.sessionId,browserProfileId:scope.browserProfileId,workspacePath:'C:/controlled/a'};
describe('actual scoped structured Grill contracts',()=>{
  it('requires genuine 3–4 distinct options and equal free text with coherent authoritative summary/topic coverage',()=>{
    expect(isNativeGrillState(state)).toBe(true);
    for(const bad of [{...state,questions:[{...question,options:question.options.slice(0,2)}]},
      {...state,questions:[{...question,allowFreeText:false}]},{...state,questions:[{...question,options:[...question.options,{id:'a',label:'D'}]}]},
      {...state,questions:[question,{...question,questionId:'other'}]},{...state,summary:[{...state.summary[0],answer:'invented answer'}]},
      {...state,coverage:[{...state.coverage[0],status:'answered'}]},{...state,questions:[{...question,topicId:'foreign'}]}])expect(isNativeGrillState(bad)).toBe(false);
  });
  it('checks exact question revision and actual committed answer before an ACK can trigger the next question',async()=>{
    const request={...binding,action:'answer' as const,questionId:question.questionId,questionRevision:0,text:'My own result',expectedRevision:2,clientRequestId:randomUUID()};
    const answered:NativeGrillState={...state,revision:3,questions:[{...question,revision:1,answer:{kind:'text',choiceId:null,text:request.text}}],
      coverage:[{...state.coverage[0],status:'answered'}],summary:[{...state.summary[0],status:'text',answer:request.text}]};
    await expect(requestNativeGrill(async()=>({ok:true,grill:answered}),request,scope)).resolves.toMatchObject({grill:{revision:3}});
    for(const bad of [state,{...answered,scope:{...scope,spaceId:randomUUID()}},{...answered,questions:[{...answered.questions[0],revision:0}]}])
      await expect(requestNativeGrill(async()=>({ok:true,grill:bad}),request,scope)).rejects.toMatchObject({code:'grill_response_invalid'});
    await expect(requestNativeGrill(async()=>({ok:false,error:'grill_revision_conflict'}),request,scope)).rejects.toMatchObject({code:'grill_revision_conflict'});
  });
  it('accepts readonly absence and actual idempotent replay but refuses an invented zero revision or mismatched objective',async()=>{
    await expect(requestNativeGrill(async()=>({ok:true,grill:null}),{...binding,action:'get'},scope)).resolves.toEqual({ok:true,grill:null});
    const request={...binding,action:'start' as const,objective:state.objective,expectedRevision:0,clientRequestId:randomUUID()};
    await expect(requestNativeGrill(async()=>({ok:true,grill:state,replayed:true,commandRevision:1}),request,scope)).resolves.toMatchObject({replayed:true});
    for(const bad of [{ok:true,grill:{...state,objective:'foreign objective'}},{ok:true,grill:state,replayed:true},{ok:true,grill:{...state,revision:0}}])
      await expect(requestNativeGrill(async()=>bad,request,scope)).rejects.toMatchObject({code:'grill_response_invalid'});
  });
  it('uses Main-owned immutable stream provenance and rejects spoofed scope, generation or raw model JSON',()=>{
    const nativeContext={schemaVersion:1,scope,sessionId:state.sessionId,streamId:'stream-a',writerGeneration:randomUUID()};
    const data={...nativeContext,grill:state},event={streamId:'stream-a',event:'grill',nativeContext,data};
    expect(readNativeGrillEvent(event,scope,state.sessionId)).toEqual({kind:'grill',grill:state});
    for(const bad of [{...event,nativeContext:null},{...event,data:{...data,writerGeneration:randomUUID()}},{...event,data:{...data,scope:{...scope,spaceId:randomUUID()}}},
      {...event,data:{...data,grill:'{"grillQuestion":{}}'}},{...event,streamId:'stale-stream'}])expect(readNativeGrillEvent(bad,scope,state.sessionId)).toBeNull();
    expect(readNativeGrillEvent({...event,event:'grill_fallback',data:{...nativeContext,reason:'invalid_structured_question',readableText:'Actual model prose'}},scope,state.sessionId)).toMatchObject({kind:'grill_fallback',readableText:'Actual model prose'});
  });
  it('provides genuine localized question, review, finish and manual fallback controls in all eight languages',()=>{
    for(const locale of ['en','de','it','es','fr','pt-BR','ru','ja'] as const)expect(Object.values(nativeGrillCopy(locale)).every(value=>typeof value==='string'&&value.length>0)).toBe(true);
  });
  it('rehydrates only actual completed history from this session and scope',async()=>{
    const finished={...state,status:'finished' as const,canFinish:false};
    await expect(requestNativeGrill(async()=>({ok:true,grill:null,grillHistory:[finished]}),{...binding,action:'get'},scope)).resolves.toMatchObject({grillHistory:[finished]});
    for(const history of [[state],[finished,finished],[{...finished,sessionId:'foreign'}],[{...finished,scope:{...scope,spaceId:randomUUID()}}]])
      await expect(requestNativeGrill(async()=>({ok:true,grill:null,grillHistory:history}),{...binding,action:'get'},scope)).rejects.toMatchObject({code:'grill_response_invalid'});
  });
  it('uses only the persisted bounded fallback marker and cannot derive options or execution authority from prose',()=>{
    const marker={reason:'invalid_structured_question',streamId:randomUUID(),writerGeneration:randomUUID()};
    expect(readNativeGrillFallbackMarker(marker)).toEqual(marker);
    for(const bad of [{...marker,reason:'inferred'},{...marker,options:['A','B','C']},{...marker,streamId:''},{...marker,permission:true}])expect(readNativeGrillFallbackMarker(bad)).toBeNull();
    expect(readNativeGrillFallbackMarker('Model suggests options A B C')).toBeNull();
  });
});
