import { describe,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { requestChatMode,type ChatModeRequest } from '../src/renderer/chat-mode-client.js';
import { requestNativePersistentGoalCommand,requestNativePersistentGoalControlWhileBusy } from '../src/renderer/persistent-goal-command.js';

const scope={backendProfileId:randomUUID(),spaceId:randomUUID(),browserProfileId:'work-browser'};
const at='2026-10-04T00:00:00Z';
const context={sessionId:'controlled-session',profileId:'ui-profile',workspace:'C:/controlled/work',browserProfileId:scope.browserProfileId};
const request:ChatModeRequest={action:'get',sessionId:context.sessionId,workspacePath:context.workspace,browserProfileId:scope.browserProfileId};
const response={ok:true,mode:{schemaVersion:1,mode:'action',lifetime:'chat',revision:0},capabilities:{plan:true,grill_me:true,boost:true,goal:true,gquota:false,plugins:false},
  session:{session_id:context.sessionId,space_scope:scope,workspace:context.workspace,goal:null,messages:[]}};
describe('actual native mode and Goal transports',()=>{
  it('accepts only actual scoped capability data and an actual legacy mode revision zero',async()=>{
    expect((await requestChatMode(async()=>response,request,scope)).mode.revision).toBe(0);
    for(const invalid of [{...response,ok:false},{...response,mode:{...response.mode,revision:-1}},
      {...response,mode:{...response.mode,mode:'unlimited_boost'}},{...response,capabilities:{...response.capabilities,boost:'yes'}},
      {...response,session:{...response.session,session_id:'different-chat'}},
      {...response,session:{...response.session,space_scope:{...scope,spaceId:randomUUID()}}},
      {...response,session:{...response.session,messages:[{content:{page:'not text'}}]}}]){
      await expect(requestChatMode(async()=>invalid,request,scope)).rejects.toThrow('chat_mode_response_invalid');
    }
    await expect(requestChatMode(async()=>response,{...request,browserProfileId:'different-browser'},scope)).rejects.toThrow('chat_mode_response_invalid');
  });
  it('preserves captured CAS and idempotency fields without native actor/scope/Home parameters',async()=>{
    const payload:ChatModeRequest={...request,action:'set',mode:'boost',lifetime:'next_turn',expectedRevision:0,clientRequestId:randomUUID()};
    const transport=vi.fn(async(_request:ChatModeRequest)=>({...response,mode:{...response.mode,mode:'boost',lifetime:'next_turn',revision:1}}));
    await requestChatMode(transport,payload,scope);expect(transport.mock.calls[0][0]).toEqual(payload);
    expect(transport.mock.calls[0][0]).not.toHaveProperty('spaceScope');expect(transport.mock.calls[0][0]).not.toHaveProperty('profile');
  });
  it('uses the dedicated Goal purpose call with captured browser profile, model, effort and actual revision',async()=>{
    const clientRequestId=randomUUID(),transport=vi.fn(async()=>({ok:true,goal:{revision:8},at}));
    await requestNativePersistentGoalCommand(transport,' pause ',{...context,model:'controlled-model',modelProvider:'controlled-provider',reasoningEffort:'high',expectedRevision:7,clientRequestId});
    expect(transport.mock.calls[0][0]).toEqual({sessionId:context.sessionId,args:'pause',workspacePath:context.workspace,browserProfileId:scope.browserProfileId,
      model:'controlled-model',modelProvider:'controlled-provider',reasoningEffort:'high',expectedRevision:7,clientRequestId});
    expect(transport.mock.calls[0][0]).not.toHaveProperty('profile');expect(transport.mock.calls[0][0]).not.toHaveProperty('spaceScope');
    await expect(requestNativePersistentGoalControlWhileBusy(transport,'/goal resume',true,context)).toBeNull();
  });
});
