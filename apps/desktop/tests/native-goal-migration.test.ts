import { randomUUID } from 'node:crypto';
import { describe,it,expect } from 'vitest';
import { requestNativeGoalMigration,readGoalMigrationPending,saveGoalMigrationPending } from '../src/renderer/native-goal-migration-client.js';
import { isNativeGoalMigrationRequired,NativeGoalCommandError } from '../src/renderer/native-goal-errors.js';
import { readNativeGoalStatus } from '../src/renderer/native-goal-client.js';
import { nativeGoalMigrationCopy } from '../src/renderer/i18n/native-goal-migration-copy.js';
const scope={backendProfileId:randomUUID(),spaceId:randomUUID(),browserProfileId:'browser-a'};
const binding={sessionId:'saved-chat',workspacePath:'C:/controlled/project',browserProfileId:scope.browserProfileId,spaceScope:scope};
const sourceDigest='a'.repeat(64),sourceNamespace='lbws-'+ 'b'.repeat(32);
const review={ok:true,schemaVersion:1,scope,sessionId:binding.sessionId,sourceNamespace,targetNamespace:'research',sourceDigest,
  sourceClaimsDigest:'c'.repeat(64),sourceRevision:7,goal:{goal:'Actual paused goal',status:'paused',revision:7,turns_used:3,max_turns:9},
  targetDigest:null,targetConflict:false,continuationStarted:false};
describe('actual native goal migration authority and recovery',()=>{
  it('decodes an actual paused review and exposes only goal fields, without implicit migration or resume',async()=>{
    const calls:unknown[]=[];
    const result=await requestNativeGoalMigration(async request=>{calls.push(request);return{...review,goal:{...review.goal,private_provider_metadata:'not for UI'}};},{...binding,action:'review'});
    expect(result).toMatchObject({sourceRevision:7,goal:{turnsUsed:3,maxTurns:9},continuationStarted:false});
    expect('goal'in result&&'private_provider_metadata'in result.goal).toBe(false);
    expect(calls).toEqual([{...binding,action:'review'}]);
  });
  it('rejects foreign ownership, active goals, invented revisions, unconfirmed copy, and fabricated conflict evidence',async()=>{
    for(const value of [{...review,scope:{...scope,spaceId:randomUUID()}},{...review,sessionId:'foreign'},
      {...review,goal:{...review.goal,status:'active'}},{...review,sourceRevision:8},{...review,continuationStarted:true},
      {...review,targetConflict:true},{...review,sourceDigest:'not-a-digest'}])
      await expect(requestNativeGoalMigration(async()=>value,{...binding,action:'review'})).rejects.toMatchObject({code:'invalid_response'});
  });
  it('binds a migration ACK to the exact reviewed digest, original revision and scope',async()=>{
    const request={...binding,action:'migrate' as const,expectedSourceRevision:7,expectedSourceDigest:sourceDigest,clientRequestId:randomUUID()};
    const response={ok:true,schemaVersion:1,scope,sessionId:binding.sessionId,sourceNamespace,targetNamespace:'research',sourceDigest,
      goalRevision:7,state:'migrated',continuationStarted:false,replayed:true};
    await expect(requestNativeGoalMigration(async()=>response,request)).resolves.toMatchObject({state:'migrated',goalRevision:7,replayed:true});
    for(const value of [{...response,goalRevision:8},{...response,sourceDigest:'f'.repeat(64)},{...response,continuationStarted:true}])
      await expect(requestNativeGoalMigration(async()=>value,request)).rejects.toMatchObject({code:'invalid_response'});
    await expect(requestNativeGoalMigration(async()=>({ok:false,error_code:'resource_busy'}),request)).rejects.toMatchObject({code:'resource_busy'});
  });
  it('retains the original UUID/digest after an unknown ACK and isolates reload recovery by exact scope/session',()=>{
    const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
    const pending={sourceDigest,sourceRevision:7,clientRequestId:randomUUID()};
    saveGoalMigrationPending(scope,binding.sessionId,pending,storage);
    expect(readGoalMigrationPending(scope,binding.sessionId,storage)).toEqual(pending);
    expect(readGoalMigrationPending({...scope,spaceId:randomUUID()},binding.sessionId,storage)).toBeNull();
    expect(readGoalMigrationPending(scope,'another-chat',storage)).toBeNull();
    saveGoalMigrationPending(scope,binding.sessionId,null,storage);
    expect(readGoalMigrationPending(scope,binding.sessionId,storage)).toBeNull();
  });
  it('recognizes only the trusted native mismatch error and localizes review/conflict/unknown retry in all eight languages',()=>{
    expect(isNativeGoalMigrationRequired(new NativeGoalCommandError('native_goal_migration_required'))).toBe(true);
    expect(isNativeGoalMigrationRequired(new Error("Error invoking remote method: Error: native_goal_migration_required"))).toBe(true);
    expect(isNativeGoalMigrationRequired('native_goal_migration_required')).toBe(false);
    expect(()=>readNativeGoalStatus({ok:false,error_code:'native_goal_migration_required'},binding.sessionId)).toThrow(NativeGoalCommandError);
    for(const locale of ['en','de','es','fr','it','pt-BR','ru','ja'] as const)
      expect(Object.values(nativeGoalMigrationCopy(locale)).every(value=>typeof value==='string'&&value.trim().length>0)).toBe(true);
  });
});
