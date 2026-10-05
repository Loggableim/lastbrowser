import React,{useEffect,useRef,useState} from 'react';
import { useDesktopI18n } from '../i18n.js';
import { localAiCopy,localAiReason } from '../i18n/local-ai-copy.js';
import { localRoleLabels } from '../i18n/local-ai-role-copy.js';
import { localRoleTasks,type LocalRoleChoice,type LocalRoleDraft,type LocalRoleSelection } from '../../main/local-ai-role-profile.js';
import { assistantScopeKey,newIndependentRequestId,type IndependentScope,type IndependentBridge } from '../independent-contracts.js';

/** Save explicit task preferences; this grants no execution or cloud rights. */
export function LocalAiRoleBindings({scope,planDigest,client}:Readonly<{scope:IndependentScope;planDigest:string;client:Pick<IndependentBridge,'request'>}>):React.JSX.Element{
  const {locale}=useDesktopI18n(),copy=localAiCopy(locale),labels=localRoleLabels(locale);
  const identity=JSON.stringify([assistantScopeKey(scope),planDigest]),current=useRef(identity),mounted=useRef(true),lock=useRef(false);
  const pending=useRef<LocalRoleChoice|null>(null);
  const [draft,setDraft]=useState<LocalRoleDraft|null>(null),[selected,setSelected]=useState<readonly LocalRoleSelection[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(false),[saved,setSaved]=useState(false);
  current.current=identity;
  useEffect(()=>{mounted.current=true;setDraft(null);setSelected([]);setSaved(false);pending.current=null;return()=>{mounted.current=false;};},[identity]);
  const live=(captured:string)=>mounted.current&&current.current===captured;
  async function review(){
    if(lock.current||pending.current)return;const captured=identity;lock.current=true;setBusy(true);setError(false);
    try{
      const results=await Promise.all([
        client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'roleProfile',request:{operation:'draft',planDigest}}}),
        client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'roleProfile',request:{operation:'read'}}}),
      ]);
      if(!live(captured))return;
      const result=results[0],prior=results[1];
      if(!result.ok||!('kind'in result.value)||result.value.kind!=='role_profile'||result.value.operation!=='draft'){setError(true);return;}
      const value=result.value.profile;setDraft(value);setSaved(false);
      const previous=prior.ok&&'kind'in prior.value&&prior.value.kind==='role_profile'&&prior.value.operation==='read'?prior.value.profile.selections:[];
      setSelected(localRoleTasks.flatMap(task=>{
        const old=previous.find(s=>s.task===task&&value.choices.some(c=>c.task===task&&c.artifactId===s.artifactId&&c.state==='prepared'));
        const first=value.choices.find(c=>c.task===task&&c.state==='prepared');
        return old?[old]:first?[{task,artifactId:first.artifactId,contextTokens:task==='chat.answer'?1024:task.startsWith('memory.')||task.startsWith('retrieval.')?512:2048}]:[];
      }));
    }catch{if(live(captured))setError(true);}finally{lock.current=false;if(live(captured))setBusy(false);}
  }
  async function confirm(){
    if(lock.current||!draft||(!pending.current&&!selected.length))return;const captured=identity;
    pending.current??={expectedRevision:draft.expectedRevision,setupRevision:draft.setupRevision,planDigest,clientRequestId:newIndependentRequestId(),selections:selected.map(s=>({...s}))};
    lock.current=true;setBusy(true);setError(false);
    try{
      const result=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'roleProfile',request:{operation:'confirm',choice:pending.current}}});
      if(!live(captured))return;
      if(result.ok&&'kind'in result.value&&result.value.kind==='role_profile'&&result.value.operation==='confirm'){
        setSelected(result.value.profile.selections);pending.current=null;setSaved(true);setDraft(null);
      }else{if(!result.ok&&!result.error.retryable&&result.error.code!=='invalid_response')pending.current=null;setError(true);}
    }catch{if(live(captured))setError(true);}finally{lock.current=false;if(live(captured))setBusy(false);}
  }
  return <details><summary>{copy.roles}</summary><p>{copy.noAuto}</p><p>{copy.filesOnly}</p>
    <button type="button" disabled={busy||Boolean(pending.current)} onClick={()=>void review()}>{copy.review}</button>
    {error&&<p role="alert">{copy.unavailable}</p>}{saved&&<p role="status">{copy.preferences}</p>}
    {draft&&localRoleTasks.map((task,index)=>{
      const choices=draft.choices.filter(c=>c.task===task);if(!choices.length)return null;
      const selection=selected.find(s=>s.task===task);
      return <label className="local-ai-role" key={task}>{labels[index]}<select disabled={busy||Boolean(pending.current)} value={selection?.artifactId??''}
        onChange={event=>{const artifactId=event.target.value;setSelected(values=>[...values.filter(s=>s.task!==task),...(artifactId?[{task,artifactId,contextTokens:selection?.contextTokens??(task.startsWith('memory.')||task.startsWith('retrieval.')?512:2048)}]:[])]);}}>
        <option value="">—</option>{choices.map(c=><option key={c.artifactId} value={c.artifactId} disabled={c.state!=='prepared'}>{c.artifactId}{c.state==='blocked'?` · ${copy.unavailable}`:''}</option>)}</select>
        {selection&&<input type="number" aria-label={`${labels[index]} ${copy.context}`} min={task==='chat.answer'?1024:128} max={task==='chat.answer'?1024:4096} disabled={busy||Boolean(pending.current)} value={selection.contextTokens}
          onChange={event=>setSelected(values=>values.map(s=>s.task===task?{...s,contextTokens:Number(event.target.value)}:s))}/>}
        {choices.filter(c=>c.state==='blocked').flatMap(c=>c.reasonCodes.map(code=><span key={`${c.artifactId}:${code}`}>{localAiReason(locale,code)}</span>))}
      </label>;
    })}
    {draft&&<button type="button" disabled={busy||(!pending.current&&(!selected.length||selected.some(s=>!Number.isInteger(s.contextTokens)||s.contextTokens<128||s.contextTokens>4096)))} onClick={()=>void confirm()}>{copy.select}</button>}
  </details>;
}
