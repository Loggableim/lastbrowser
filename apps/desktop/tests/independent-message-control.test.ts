import React from 'react';
import { randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe,expect,it,vi } from 'vitest';
import type { AssistantSnapshot,IndependentScope,RunView } from '../src/renderer/independent-contracts.js';
import { IndependentAssistantClient,isAssistantSnapshot } from '../src/renderer/independent-assistant-client.js';
import { IndependentAssistantController } from '../src/renderer/independent-assistant-controller.js';
import { createSpaceAssistantStore } from '../src/renderer/stores/useSpaceAssistantStore.js';
import { assistantControlCopy,hasHumanControlOrigin,isCurrentControlCandidate,IndependentMessageControl } from '../src/renderer/components/IndependentMessageControl.js';
import { DesktopI18nProvider,desktopLocaleIds } from '../src/renderer/i18n.js';
import { ChatTranscript,type ChatTranscriptProps } from '../src/renderer/panels/ChatComponents.js';

function controlled() {
  const at='2026-10-04T00:00:00Z', scope:IndependentScope={backendProfileId:randomUUID(),spaceId:randomUUID(),browserProfileId:'default'};
  const run:RunView={schemaVersion:1,scope,runId:randomUUID(),dispatchId:randomUUID(),definitionId:randomUUID(),definitionRevision:1,
    state:'running',stateRevision:3,controlEpoch:2,reasonCode:null,createdAt:at,updatedAt:at,assistantProfileRevision:null,
    targetSessionId:'controlled-chat',checkpointId:null,resultRef:null,counters:{toolCalls:0,providerRequests:1,activeSeconds:0,measuredTokens:null},waitingFor:null};
  const humanTurnId=randomUUID(),sourceMessageId=randomUUID(),originalText='pause this task';
  const candidate={runId:run.runId,dispatchId:run.dispatchId,title:'Controlled task',state:run.state,expectedRevision:run.stateRevision,controlEpoch:run.controlEpoch};
  const response={id:randomUUID(),role:'assistant' as const,content:'Actual backend control response',at,turnId:humanTurnId,
    controlResolution:{kind:'clarification' as const,scope,humanTurnId,sourceMessageId,originalText,command:'pause' as const,
      candidates:[candidate],requestDigest:'a'.repeat(64),reason:'choose_target'},controlStatus:'choose_target' as const,controlResults:[]};
  const snapshot:AssistantSnapshot={schemaVersion:1,scope,conversationId:randomUUID(),revision:4,
    messages:[{id:sourceMessageId,role:'user',content:originalText,at,turnId:humanTurnId},response],interview:null,confirmedProfile:null,
    providerReady:true,provider:'controlled-provider',model:'controlled-model',activity:{schemaVersion:1,scope,observedAt:at,watermark:1,sourceState:'live',lastSuccessfulAt:at,
      runs:[run],dispatches:[],activeChats:[],schedules:[],approvals:[]}};
  const payload={humanTurnId,sourceMessageId,runId:run.runId,expectedRevision:run.stateRevision,controlEpoch:run.controlEpoch,
    requestDigest:response.controlResolution.requestDigest,clientRequestId:randomUUID()};
  return {scope,run,response,snapshot,payload,candidate};
}
describe('human Assistant control presentation',()=>{
  it('requires an exact original human message and never trusts a model or foreign scope source',()=>{
    const f=controlled();expect(isAssistantSnapshot(f.snapshot)).toBe(true);expect(hasHumanControlOrigin(f.response,f.snapshot)).toBe(true);
    for(const messages of [f.snapshot.messages.slice(1),f.snapshot.messages.map(m=>m.role==='user'?{...m,role:'system'}:m),
      f.snapshot.messages.map(m=>m.role==='user'?{...m,content:'Different human request'}:m),
      f.snapshot.messages.map(m=>m.role==='user'?{...m,turnId:randomUUID()}:m)]) expect(isAssistantSnapshot({...f.snapshot,messages})).toBe(false);
    expect(isAssistantSnapshot({...f.snapshot,messages:[f.snapshot.messages[0],{...f.response,controlResolution:{...f.response.controlResolution,scope:{...f.scope,spaceId:randomUUID()}}}]})).toBe(false);
    expect(isAssistantSnapshot({...f.snapshot,messages:[f.snapshot.messages[0],{...f.response,controlResolution:{...f.response.controlResolution,candidates:[f.candidate,f.candidate]}}]})).toBe(false);
  });
  it('retains historical control replies but disables stale candidates after actual state or epoch changes',()=>{
    const f=controlled();expect(isCurrentControlCandidate(f.candidate,f.snapshot.activity)).toBe(true);
    const stale={...f.snapshot.activity,runs:[{...f.run,stateRevision:4,controlEpoch:3}]};
    expect(isAssistantSnapshot({...f.snapshot,activity:stale})).toBe(true);expect(isCurrentControlCandidate(f.candidate,stale)).toBe(false);
    expect(isCurrentControlCandidate(f.candidate,{...f.snapshot.activity,sourceState:'stale'})).toBe(false);
    const controller=new IndependentAssistantController(new IndependentAssistantClient({request:vi.fn()}));
    const html=renderToStaticMarkup(React.createElement(DesktopI18nProvider,null,React.createElement(IndependentMessageControl,{message:f.response,snapshot:f.snapshot,activity:stale,controller,busy:false})));
    expect(html).toContain('disabled=""');expect(html).toContain(assistantControlCopy.de.rejected);controller.dispose();
  });
  it('accepts only scoped control outcomes for the selected real run',async()=>{
    const f=controlled(), result={...f.run,state:'pausing' as const,stateRevision:4,controlEpoch:3};
    const acknowledgement={...f.snapshot,revision:5,messages:[f.snapshot.messages[0],{...f.response,controlStatus:'completed',controlResults:[result]}],
      controlOutcome:{status:'completed',results:[result]}};
    const request={schemaVersion:1 as const,operation:'assistantControl' as const,scope:f.scope,payload:f.payload};
    const client=(value:unknown)=>new IndependentAssistantClient({request:async()=>({ok:true,value})});
    expect((await client(acknowledgement).request(request)).ok).toBe(true);
    for(const invalid of [{...acknowledgement,controlOutcome:{status:'completed',results:[]}},
      {...acknowledgement,messages:[f.snapshot.messages[0],f.response]},
      {...acknowledgement,controlOutcome:{status:'completed',results:[{...result,runId:randomUUID()}]}},
      {...acknowledgement,controlOutcome:{status:'completed',results:[{...result,scope:{...f.scope,spaceId:randomUUID()}}]}},
      {...acknowledgement,controlOutcome:{status:'success',results:[result]}}])expect((await client(invalid).request(request)).ok).toBe(false);
    expect((await client(acknowledgement).request({...request,payload:{...f.payload,humanTurnId:randomUUID()}})).ok).toBe(false);
  });
  it('dispatches only the seven purpose-bound fields with stable client ID and captured scope',async()=>{
    const f=controlled(),store=createSpaceAssistantStore();store.getState().acceptSnapshot(f.scope,f.snapshot);
    const transport=vi.fn(async()=>({ok:true,value:{...f.snapshot,controlOutcome:{status:'choose_target',results:[]}}}));
    const controller=new IndependentAssistantController(new IndependentAssistantClient({request:transport}),store);
    await controller.chooseControl(f.scope,f.payload);
    expect(transport).toHaveBeenCalledTimes(1);expect(transport.mock.calls[0][0]).toEqual({schemaVersion:1,operation:'assistantControl',scope:f.scope,payload:f.payload});
    expect(Object.keys(f.payload).sort()).toEqual(['humanTurnId','sourceMessageId','runId','expectedRevision','controlEpoch','requestDigest','clientRequestId'].sort());
    controller.dispose();
  });
  it('has complete status and chooser labels for all eight actual desktop locales',()=>{
    for(const locale of desktopLocaleIds)for(const label of Object.values(assistantControlCopy[locale]))expect(label.trim()).toBeTruthy();
  });
});
describe('genuine independent partial Workchat output',()=>{
  const props:ChatTranscriptProps={activeSession:{session_id:'controlled-chat'},error:'',developerMessages:[],loading:false,
    messages:[{role:'assistant',content:'Genuine unfinished SDK output',isPartial:true,streaming:true}],pendingUserMessage:'',ready:true,
    showDeveloperTools:false,showTokenUsage:false,showTps:false,showThinking:false,simplifiedToolCalling:true,latestTurnUsage:null,
    onCreateSession:()=>{},serviceStatus:null};
  it('labels genuine partial text and spins only with a current running or pausing RunView',()=>{
    for(const state of ['running','pausing','paused','failed','completed',undefined] as const){
      const html=renderToStaticMarkup(React.createElement(DesktopI18nProvider,null,React.createElement(ChatTranscript,{...props,independentRunState:state})));
      expect(html).toContain('Teilausgabe');expect(html).toContain('Genuine unfinished SDK output');
      expect(html.includes('class="lucide lucide-loader-circle spin"')).toBe(state==='running'||state==='pausing');
    }
  });
});
