import { describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { isChildRunEvent,isChildRunSnapshot,readChildHistory } from '../src/renderer/child-run-client.js';
import { readNativeGoalStatus } from '../src/renderer/native-goal-client.js';
const scope={backendProfileId:randomUUID(),spaceId:randomUUID(),browserProfileId:'browser-a'};
const run={schemaVersion:1,scope,parentSessionId:'parent',parentTurnId:'accepted-stream',subagentId:'child-a',parentSubagentId:null,
  childSessionId:'child-session',depth:1,model:{provider:'controlled',model:'actual-model'},status:'running',revision:1,watermark:1,
  observedAt:'2026-10-04T00:00:00Z',messages:[{id:'child-session:1',role:'assistant',content:'actual SDK text',at:''}],sourceActuality:'partial'};
const history={schemaVersion:1,scope,parentSessionId:'parent',parentTurns:['accepted-stream'],runs:[run],events:[],resyncNeeded:false};
describe('child history purpose response guards',()=>{
  it('accepts actual partial text with missing historic timestamps, without manufacturing a timestamp',()=>{
    expect(isChildRunSnapshot(run)).toBe(true);expect(readChildHistory(history,scope,'parent').runs[0].messages[0].at).toBe('');
  });
  it('rejects foreign scope, parent, turn, duplicate identity, invalid models and unbounded messages',()=>{
    for(const bad of [{...history,scope:{...scope,spaceId:randomUUID()}},{...history,parentSessionId:'other'},
      {...history,parentTurns:['different-stream']},{...history,parentTurns:['accepted-stream','accepted-stream']},
      {...history,runs:[{...run,messages:[...run.messages,...run.messages]}]},
      {...history,runs:[run,run]}, {...history,runs:[{...run,model:'invented label'}]},{...history,runs:[{...run,messages:[{...run.messages[0],content:'x'.repeat(262145)}]}]}]){
      expect(()=>readChildHistory(bad,scope,'parent')).toThrow('child_history_invalid');
    }
  });
  it('requires a sequenced delta and binds embedded authoritative snapshots to the same turn',()=>{
    const event={...run,sequence:2,kind:'answer_delta',payload:{delta:'more genuine output'},at:run.observedAt};
    expect(isChildRunEvent(event)).toBe(true);expect(isChildRunEvent({...event,payload:{delta:34}})).toBe(false);
    expect(isChildRunEvent({...event,payload:{snapshot:{...run,watermark:2,parentTurnId:'other-turn'}}})).toBe(false);
    expect(isChildRunEvent({...event,payload:{snapshot:{...run,watermark:2,model:{provider:'foreign',model:'foreign'}}}})).toBe(false);
    expect(isChildRunEvent({...event,sequence:0})).toBe(false);
  });
});
describe('authoritative Goal revision',()=>{
  it('preserves a returned revision for an absent Goal and rejects guessed/inconsistent records',()=>{
    expect(readNativeGoalStatus({ok:true,action:'status',goal:null,revision:4},'parent')).toEqual({goal:null,revision:4});
    for(const bad of [{ok:true,action:'status',goal:null},{ok:true,action:'status',goal:null,revision:-1},
      {ok:true,action:'status',goal:{session_id:'other',revision:4},revision:4},
      {ok:true,action:'status',goal:{session_id:'parent',revision:3},revision:4}]){
      expect(()=>readNativeGoalStatus(bad,'parent')).toThrow('goal_status_invalid');
    }
  });
});
