import React,{useEffect,useRef,useState} from 'react';
import { assistantScopeKey,newIndependentRequestId,type IndependentScope } from '../independent-contracts.js';
import { nativeGoalMigrationCopy } from '../i18n/native-goal-migration-copy.js';
import type { DesktopLocaleId } from '../i18n/keys.js';
import { requestNativeGoalMigration,readGoalMigrationPending,saveGoalMigrationPending,NativeGoalMigrationError,
  type NativeGoalMigrationReview,type GoalMigrationPending,type NativeGoalMigrationRequest } from '../native-goal-migration-client.js';
export function NativeGoalMigrationControls({scope,sessionId,workspacePath,browserProfileId,locale,blocked,onComplete}:Readonly<{
  scope:IndependentScope;sessionId:string;workspacePath:string;browserProfileId:string;locale:DesktopLocaleId;blocked:boolean;onComplete:()=>void;
}>):React.JSX.Element{
  const copy=nativeGoalMigrationCopy(locale),identity=JSON.stringify([assistantScopeKey(scope),sessionId,workspacePath,browserProfileId]);
  const current=useRef(identity);current.current=identity;
  const [review,setReview]=useState<NativeGoalMigrationReview|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[complete,setComplete]=useState(false);
  const [retry,setRetry]=useState<GoalMigrationPending|null>(null),lock=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;setReview(null);setRetry(readGoalMigrationPending(scope,sessionId,window.localStorage));setError('');setComplete(false);
    return()=>{mounted.current=false;};},[identity]);
  const binding={sessionId,workspacePath,browserProfileId,spaceScope:scope};
  async function act(request:NativeGoalMigrationRequest){
    if(lock.current||blocked)return;lock.current=true;setPending(true);setError('');const captured=identity;
    try{const response=await requestNativeGoalMigration(value=>window.lastbrowser.sidekick.goalMigration(value),request);
      if(!mounted.current||current.current!==captured)return;
      if('goal'in response){setReview(response);return;}
      saveGoalMigrationPending(scope,sessionId,null,window.localStorage);setRetry(null);setComplete(true);onComplete();
    }catch(reason){if(mounted.current&&current.current===captured){const code=reason instanceof NativeGoalMigrationError?reason.code:'';
      setError(code==='resource_busy'?copy.busy:code==='stale_revision'||code==='scope_mismatch'?copy.changed:copy.unavailable);}}
    finally{lock.current=false;if(mounted.current&&current.current===captured)setPending(false);}
  }
  function migrate(value:GoalMigrationPending){
    if(lock.current||blocked)return;setRetry(value);saveGoalMigrationPending(scope,sessionId,value,window.localStorage);
    void act({...binding,action:'migrate',expectedSourceRevision:value.sourceRevision,expectedSourceDigest:value.sourceDigest,clientRequestId:value.clientRequestId});
  }
  return <section className="persistent-goal-controls native-goal-migration" aria-label={copy.title}>
    <strong>{copy.title}</strong><p>{copy.explain}</p>
    {error&&<p role="alert">{error}</p>}{complete&&<p role="status">{copy.success}</p>}
    {!complete&&<>
      {retry&&<p role="status">{copy.unknown}</p>}
      <button type="button" disabled={pending||blocked} onClick={()=>void act({...binding,action:'review'})}>{copy.review}</button>
      {review&&<div className="native-goal-migration-review"><strong>{copy.original}</strong><p>{review.goal.goal}</p>
        <p>{copy.revision}: {review.sourceRevision}</p><p>{copy.namespace}: <code>{review.sourceNamespace}</code></p><p>{copy.target}: <code>{review.targetNamespace}</code></p>
        {review.targetConflict&&<p role="status">{copy.conflict}</p>}
        {!retry&&<button type="button" disabled={pending||blocked||review.targetConflict} onClick={()=>migrate({sourceDigest:review.sourceDigest,sourceRevision:review.sourceRevision,clientRequestId:newIndependentRequestId()})}>{copy.migrate}</button>}
      </div>}
      {retry&&<button type="button" disabled={pending||blocked} onClick={()=>migrate(retry)}>{copy.retry}</button>}
    </>}
  </section>;
}
