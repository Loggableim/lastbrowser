import { beforeEach,describe,expect,it,vi } from 'vitest';
import { nativeChatProcessExitConfirmed,requestNativeChatControl,useNativeChatControls,readNativeControlSnapshot,recoverNativeControls } from '../src/renderer/native-chat-control.js';
import { nativeChatControlCopy } from '../src/renderer/i18n/native-chat-control-copy.js';
const scope={backendProfileId:'9cc9ed75-7731-4da4-88f1-af453a3dfdc3',spaceId:'9cc9ed75-7731-4da4-88f1-af453a3dfdc4',browserProfileId:'controlled'};
const binding={scope,sessionId:'session-a',streamId:'stream-a',workspacePath:'C:\\controlled\\a',browserProfileId:'controlled'};
beforeEach(()=>useNativeChatControls.setState({records:{}}));
describe('native chat controls',()=>{
  it('uses the exact scoped accepted stream without providing backend actor fields',async()=>{
    const request={sessionId:binding.sessionId,streamId:binding.streamId,command:'approval' as const,workspacePath:binding.workspacePath,browserProfileId:binding.browserProfileId,requestId:'pending-a',choice:'once' as const};
    const transport=vi.fn(async()=>({schemaVersion:1,scope,sessionId:'session-a',streamId:'stream-a',accepted:true,state:'submitted'}));
    await expect(requestNativeChatControl(transport,request,scope)).resolves.toMatchObject({accepted:true,state:'submitted'});
    expect(transport).toHaveBeenCalledWith(request);expect(transport.mock.calls[0][0]).not.toHaveProperty('spaceScope');
    await expect(requestNativeChatControl(async()=>({...await transport(),scope:{...scope,browserProfileId:'foreign'}}),request,scope)).rejects.toThrow('native_chat_control_invalid');
    await expect(requestNativeChatControl(async()=>({...await transport(),streamId:'other'}),request,scope)).rejects.toThrow('native_chat_control_invalid');
  });
  it('retains exact pending IDs separately and rejects foreign streams/session events',()=>{
    const store=useNativeChatControls.getState();store.bind(binding);
    store.event({streamId:'foreign',event:'approval',data:{requestId:'wrong',command:'write'}});
    store.event({streamId:'stream-a',event:'clarify',data:{requestId:'wrong',session_id:'foreign',question:'No'}});
    store.event({streamId:'stream-a',event:'approval',data:{requestId:'approval-a',command:'write a'}});
    store.event({streamId:'stream-a',event:'clarify',data:{requestId:'question-a',question:'Which file?',choices:['First','Second']}});
    expect(useNativeChatControls.getState().records['stream-a'].pending.map(item=>item.requestId)).toEqual(['approval-a','question-a']);
    store.remove('stream-a','approval-a');expect(useNativeChatControls.getState().records['stream-a'].pending[0].requestId).toBe('question-a');
  });
  it('a cancellation ACK, worker finished, or early terminal is not OS process exit',()=>{
    const store=useNativeChatControls.getState();store.bind(binding);store.event({streamId:'stream-a',event:'clarify',data:{requestId:'question-a',question:'Which?'}});
    for(const event of ['cancel','stream_end','worker_finished','control_ack']){const payload={streamId:'stream-a',event,data:{state:'stopping'}};expect(nativeChatProcessExitConfirmed(payload)).toBe(false);store.event(payload);}
    expect(useNativeChatControls.getState().records['stream-a'].pending).toHaveLength(1);
    const final={streamId:'stream-a',event:'stream_end',data:{processExited:true}};expect(nativeChatProcessExitConfirmed(final)).toBe(true);store.event(final);
    expect(useNativeChatControls.getState().records['stream-a'].pending).toHaveLength(0);
  });
  it('has genuine localized controls in every desktop language',()=>{for(const locale of ['en','de','it','es','fr','pt-BR','ru','ja'] as const)expect(Object.values(nativeChatControlCopy(locale)).every(value=>value.length>0)).toBe(true);expect(nativeChatControlCopy('ja').clarify).toContain('質問');});
  it('recovers only exact persisted scope, session, stream and writer pending IDs',()=>{
    const snapshot={schemaVersion:1,scope,sessionId:'session-a',streamId:'stream-a',writerGeneration:'writer-a',processExited:false,status:'running',pendingControls:[
      {schemaVersion:1,type:'clarify',requestId:'question-a',scope,sessionId:'session-a',streamId:'stream-a',writerGeneration:'writer-a',data:{question:'Which?',choices_offered:['A','B']}}]};
    const decoded=readNativeControlSnapshot(snapshot,scope,'session-a');expect(decoded).not.toBeNull();if(decoded)recoverNativeControls(decoded,binding);
    expect(useNativeChatControls.getState().records['stream-a'].pending[0].choices).toEqual(['A','B']);
    expect(readNativeControlSnapshot({...snapshot,pendingControls:[{...snapshot.pendingControls[0],writerGeneration:'foreign'}]},scope,'session-a')).toBeNull();
    expect(readNativeControlSnapshot({...snapshot,scope:{...scope,browserProfileId:'foreign'}},scope,'session-a')).toBeNull();
  });
  it('rejects mismatched Main receipt generations/scopes and keeps terminal controls closed',()=>{
    const snapshot={schemaVersion:1 as const,scope,sessionId:binding.sessionId,streamId:binding.streamId,writerGeneration:'actual-writer',processExited:false,status:'running' as const,pendingControls:[]};
    recoverNativeControls(snapshot,binding);const store=useNativeChatControls.getState();
    const nativeContext={schemaVersion:1,scope,sessionId:binding.sessionId,streamId:binding.streamId,writerGeneration:snapshot.writerGeneration};
    for(const context of [{...nativeContext,writerGeneration:'stale-writer'},{...nativeContext,scope:{...scope,browserProfileId:'other'}},{...nativeContext,sessionId:'other'}])
      store.event({streamId:binding.streamId,event:'approval',nativeContext:context,data:{requestId:'wrong',command:'write'}});
    expect(useNativeChatControls.getState().records[binding.streamId].pending).toEqual([]);
    store.event({streamId:binding.streamId,event:'approval',nativeContext,data:{requestId:'actual',command:'write'}});
    expect(useNativeChatControls.getState().records[binding.streamId].pending).toHaveLength(1);
    store.event({streamId:binding.streamId,event:'stream_end',nativeContext,data:{processExited:true}});
    store.event({streamId:binding.streamId,event:'approval',nativeContext,data:{requestId:'late',command:'write'}});
    expect(useNativeChatControls.getState().records[binding.streamId].pending).toEqual([]);
    store.bind({...binding,scope:{...scope,browserProfileId:'other'},sessionId:'other'});
    expect(useNativeChatControls.getState().records[binding.streamId].processExited).toBe(false);
    expect(useNativeChatControls.getState().records[binding.streamId].pending).toEqual([]);
  });
});
