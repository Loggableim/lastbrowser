import React,{useEffect,useRef,useState} from 'react';
import { useDesktopI18n } from '../i18n.js';
import { assistantScopeKey,newIndependentRequestId,type IndependentScope } from '../independent-contracts.js';
import type { IndependentAssistantClient } from '../independent-assistant-client.js';
import type { LocalAiArtifact,LocalAiCatalog,LocalAiJob,LocalAiResponse } from '../local-ai-contracts.js';
import { isLocalAiRuntimeResponse,localAiRuntimePendingKey,localAiRuntimeReceiptKey,readLocalAiRuntimePending,type LocalAiRuntimeReview,type LocalAiRuntimeResponse,
  type LocalAiRuntimePending,type LocalAiRuntimeRequest,type LocalAiRuntimeHandle,type LocalAiRuntimeBenchmark,type LocalAiRuntimeSetupManifest } from '../local-ai-runtime-contracts.js';
import { localAiChatCandidateCopy,localAiCopy } from '../i18n/local-ai-copy.js';
import { localAiRuntimeCopy,localAiRuntimeReason } from '../i18n/local-ai-runtime-copy.js';
import { LocalAiRuntimeNotices } from './LocalAiRuntimeNotices.js';
type Scan=Extract<LocalAiResponse,{scan:unknown}>;
export function LocalAiRuntimeControls({scope,client,catalog,jobs,ready,selectionRevision,onScan}:Readonly<{scope:IndependentScope;client:IndependentAssistantClient;catalog:LocalAiCatalog;
  jobs:readonly LocalAiJob[];ready:boolean;selectionRevision?:number;onScan:(value:Scan)=>void}>):React.JSX.Element{
  const {locale}=useDesktopI18n(),copy=localAiRuntimeCopy(locale),base=localAiCopy(locale),identity=assistantScopeKey(scope);
  const [selected,setSelected]=useState(''),[role,setRole]=useState<LocalAiRuntimeReview['role']>('embed'),[review,setReview]=useState<LocalAiRuntimeReview|null>(null);
  const [handles,setHandles]=useState<readonly LocalAiRuntimeHandle[]>([]),[benchmark,setBenchmark]=useState<LocalAiRuntimeBenchmark|null>(null);
  const [pending,setPending]=useState<LocalAiRuntimePending|null>(null),[busy,setBusy]=useState(false),[reason,setReason]=useState(''),[now,setNow]=useState(Date.now());
  const [setupManifest,setSetupManifest]=useState<LocalAiRuntimeSetupManifest|null>(null);
  const [stopping,setStopping]=useState<readonly string[]>([]),[stopUnknown,setStopUnknown]=useState<readonly string[]>([]),[pendingState,setPendingState]=useState<'unknown'|'running'>('unknown');
  const lock=useRef(false),mounted=useRef(true),current=useRef(identity);current.current=identity;
  const unloadIds=useRef(new Map<string,string>());
  const completedDownload=jobs.some(job=>job.state==='complete');
  const candidates:readonly LocalAiArtifact[]=catalog.artifacts.filter(artifact=>artifact.manifestComplete);
  const roleLabel=(value:LocalAiRuntimeReview['role'])=>value==='chat'?localAiChatCandidateCopy(locale).title:base[value];
  const artifact=candidates.find(artifact=>artifact.artifactId===selected);
  const installedEvidence=completedDownload||handles.some(handle=>['downloaded','verified','loading','ready','evicting','stopped'].includes(handle.state));
  const live=(captured:string)=>mounted.current&&current.current===captured;
  const metadata=(kind:'pending'|'receipt'='pending')=>{try{return readLocalAiRuntimePending(scope,window.localStorage,kind);}catch{return null;}};
  function remember(value:LocalAiRuntimePending|null):boolean{
    try{const key=localAiRuntimePendingKey(scope);if(value){const serialized=JSON.stringify(value);window.localStorage.setItem(key,serialized);if(window.localStorage.getItem(key)!==serialized)return false;}
      else window.localStorage.removeItem(key);setPending(value);return true;
    }catch{if(!value)setPending(null);return false;}
  }
  function accept(value:LocalAiRuntimeResponse){
    if(value.operation==='inspect')setSetupManifest(value.setupManifest??null);
    if(value.operation==='receipt'&&'state'in value&&value.state!=='complete'){
      if(value.state==='unknown'||value.state==='running'){setPendingState(value.state);setReason('reasonCode'in value?value.reasonCode??'':'');}
      else{remember(null);setPendingState('unknown');setReason(value.reasonCode??`runtime_bootstrap_${value.state}`);}return;
    }
    if('executionUnavailable'in value){setReason(value.reasonCode);if(value.operation==='bootstrap'&&value.state){if(value.state==='running')setPendingState('running');else remember(null);}return;}
    setReason('');
    if(value.operation==='inspect'){
      setHandles(previous=>value.handles.map(handle=>{const old=previous.find(row=>row.handleId===handle.handleId);return old&&old.revision>handle.revision?old:handle;}));
      setStopping(ids=>ids.filter(id=>!value.handles.some(handle=>handle.handleId===id&&handle.state==='stopped')));
      setStopUnknown(ids=>ids.filter(id=>!value.handles.some(handle=>handle.handleId===id&&['stopped','evicting'].includes(handle.state))));
    }else if(value.operation==='review'){setReview(value);setBenchmark(null);}
    else if((value.operation==='bootstrap'||value.operation==='receipt')&&value.state==='complete'){
      // Persist only lookup metadata. Every visible result after reload is read
      // again from the actual scoped journal, never accepted from localStorage.
      const saved=pending??metadata();
      if(saved&&saved.purposeDigest===value.purposeDigest&&saved.clientRequestId.replaceAll('-','').toLowerCase()===value.clientRequestId.replaceAll('-','').toLowerCase())
        try{window.localStorage.setItem(localAiRuntimeReceiptKey(scope),JSON.stringify(saved));}catch{}
      setBenchmark(value);remember(null);setPendingState('unknown');setReview(null);
    }
    else if(value.operation==='unload'){
      setStopUnknown(ids=>ids.filter(id=>id!==value.handleId));
      setStopping(ids=>value.stopped?ids.filter(id=>id!==value.handleId):[...new Set([...ids,value.handleId])]);
      if(value.stopped)setHandles(rows=>rows.map(handle=>handle.handleId===value.handleId?{...handle,state:'stopped',available:false}:handle));
    }
  }
  async function call(request:LocalAiRuntimeRequest){
    const response=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'runtime',request}});
    if(!response.ok)throw Error(response.error.code);
    if(!isLocalAiRuntimeResponse(response.value))throw Error('invalid_response');return response.value;
  }
  async function act(request:LocalAiRuntimeRequest){
    if(lock.current||!ready)return;lock.current=true;setBusy(true);setReason('');const captured=identity;
    try{const value=await call(request);if(live(captured))accept(value);}
    catch(error){if(live(captured)){setReason(error instanceof Error?error.message:'runtime_unavailable');if(request.operation==='unload')setStopUnknown(ids=>[...new Set([...ids,request.handleId])]);}}
    finally{lock.current=false;if(live(captured))setBusy(false);}
  }
  async function reviewTest(){
    if(lock.current||pending||!artifact||!artifact.roles.includes(role)||!ready||!installedEvidence)return;
    lock.current=true;setBusy(true);setReason('');setReview(null);const captured=identity;
    try{
      const scanned=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'scan'}});
      if(!live(captured))return;if(!scanned.ok)throw Error(scanned.error.code);
      if(!('scan'in scanned.value))throw Error('invalid_response');onScan(scanned.value);
      const value=await call({operation:'review',artifactId:artifact.artifactId,role,clientRequestId:newIndependentRequestId()});
      if(live(captured))accept(value);
    }catch(error){if(live(captured))setReason(error instanceof Error?error.message:'runtime_unavailable');}
    finally{lock.current=false;if(live(captured))setBusy(false);}
  }
  function bootstrap(value:LocalAiRuntimePending){
    if(lock.current||!ready)return;if(!remember(value)){setReason('local_ai_runtime_request_storage_unavailable');return;}
    setPendingState('unknown');void act({operation:'bootstrap',purposeDigest:value.purposeDigest,clientRequestId:value.clientRequestId});
  }
  useEffect(()=>{mounted.current=true;const saved=metadata(),last=saved??metadata('receipt');setReview(null);setPending(saved);setPendingState('unknown');setHandles([]);setBenchmark(null);setSetupManifest(null);setStopping([]);setStopUnknown([]);unloadIds.current.clear();
    if(ready)void(async()=>{await act({operation:'inspect'});if(last&&live(identity))await act({operation:'receipt',purposeDigest:last.purposeDigest,clientRequestId:last.clientRequestId});})();
    return()=>{mounted.current=false;};},[identity,ready]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{setReview(null);},[selectionRevision,catalog.revision]);
  useEffect(()=>{if(!ready||!pending||pendingState!=='running')return;const captured=identity;let active=true,polling=false;
    const timer=window.setInterval(()=>{if(lock.current||polling)return;polling=true;void call({operation:'receipt',purposeDigest:pending.purposeDigest,clientRequestId:pending.clientRequestId})
      .then(value=>{if(active&&live(captured))accept(value);}).catch(()=>{if(active&&live(captured))setPendingState('unknown');}).finally(()=>{polling=false;});},2000);
    return()=>{active=false;window.clearInterval(timer);};},[identity,ready,pending?.clientRequestId,pendingState]);
  useEffect(()=>{
    if(!ready||!handles.some(handle=>['loading','ready','evicting'].includes(handle.state))&&!stopping.length&&!stopUnknown.length)return;
    let active=true,polling=false;const captured=identity;
    const timer=window.setInterval(()=>{if(lock.current||polling)return;polling=true;void call({operation:'inspect'}).then(value=>{if(active&&live(captured))accept(value);}).catch(()=>{if(active&&live(captured))setReason('runtime_unavailable');}).finally(()=>{polling=false;});},2000);
    return()=>{active=false;window.clearInterval(timer);};},[identity,ready,handles.some(handle=>['loading','ready','evicting'].includes(handle.state)),stopping.length,stopUnknown.length]);
  const expired=Boolean(review&&Date.parse(review.expiresAt)<=now),bytes=(value:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value/1024/1024)+' MiB';
  const stateLabel=(handle:LocalAiRuntimeHandle)=>stopping.includes(handle.handleId)?base.stopping:handle.state==='ready'?copy.loaded:handle.state==='stopped'?copy.stopped:
    handle.state==='evicting'?base.stopping:handle.state==='loading'?base.running:handle.state==='uninstalled'?base.unavailable:base[handle.state];
  return <section className="local-ai-runtime" aria-label={copy.title} data-local-ai-runtime-scope={identity}><h3>{copy.title}</h3><p>{copy.explain}</p><p>{copy.technical}</p>
    {reason&&<p role="status">{localAiRuntimeReason(locale,reason)}</p>}
    {setupManifest&&<LocalAiRuntimeNotices manifest={setupManifest}/>}
    {pending&&<article data-local-ai-runtime-recovery><p role="status">{pendingState==='running'?copy.running:copy.unknown}</p><strong>{pending.artifactId} · {roleLabel(pending.role)}</strong>
      <button type="button" disabled={busy||!ready} onClick={()=>void act({operation:'receipt',purposeDigest:pending.purposeDigest,clientRequestId:pending.clientRequestId})}>{copy.retry}</button></article>}
    <label className="local-ai-runtime-field">{copy.artifact}<select value={selected} disabled={busy||!!pending} onChange={event=>{setSelected(event.target.value);setRole(candidates.find(item=>item.artifactId===event.target.value)?.roles[0]??'embed');setReview(null);setReason('');}}>
      <option value="">{base.unknown}</option>{candidates.map(item=><option key={item.artifactId} value={item.artifactId}>{item.modelId} · {item.quantization??item.format}</option>)}
    </select></label>
    <label className="local-ai-runtime-field">{base.roles}<select value={role} disabled={busy||!!pending} onChange={event=>{const next=event.target.value;if(['encoder','retrieve','embed','extract','agent','chat','vision'].includes(next)){setRole(next as LocalAiRuntimeReview['role']);setReview(null);}}}>
      {(['encoder','retrieve','embed','extract','agent','chat','vision'] as const).map(value=><option key={value} value={value} disabled={!artifact?.roles.includes(value)}>{roleLabel(value)}</option>)}
    </select></label>
    <button type="button" disabled={busy||!ready||!!pending||!artifact||!artifact.roles.includes(role)||!installedEvidence} onClick={()=>void reviewTest()}>{copy.scan} · {copy.review}</button>
    {!installedEvidence&&<p>{copy.install}</p>}
    {!completedDownload&&!handles.length&&<p>{base.filesOnly}</p>}
    {review&&!pending&&<article className="local-ai-model" data-local-ai-runtime-review><strong>{review.artifactId}</strong><code>{review.artifactRevision}</code><p>{roleLabel(review.role)} · CPU</p>
      <p>{base.context}: {review.contextTokens} · {base.parallel}: {review.parallelRequests}</p><p>{copy.budget}: {review.budgetSeconds} s · {copy.reserve}: {bytes(review.ramLimitBytes)}</p><code>{review.runtimeBuildRef}</code>
      {expired&&<p role="status">{copy.expired}</p>}
      <button type="button" disabled={busy||!ready||expired} onClick={()=>bootstrap({purposeDigest:review.purposeDigest,expiresAt:review.expiresAt,artifactId:review.artifactId,role:review.role,clientRequestId:newIndependentRequestId()})}>{copy.start}</button>
    </article>}
    {benchmark&&<article className="local-ai-model" data-local-ai-runtime-benchmark><strong>{copy.complete}</strong><time dateTime={benchmark.observedAt}>{new Date(benchmark.observedAt).toLocaleString(locale)}</time>
      <p>{copy.cold}: {benchmark.coldStartMs} ms · {copy.latency}: {benchmark.p95Ms} ms</p><p>{copy.peak}: {bytes(benchmark.peakObservedResidentBytes)}</p>{benchmark.synthetic&&<p>{copy.synthetic}</p>}<p>{copy.technical}</p><code>{benchmark.evidenceRef}</code>
    </article>}
    <button type="button" disabled={busy||!ready} onClick={()=>void act({operation:'inspect'})}>{copy.inspect}</button>
    {!handles.length&&<p>{copy.noHandles}</p>}
    {stopping.some(handleId=>!handles.some(handle=>handle.handleId===handleId))&&<p role="status">{base.stopping} · {copy.stopUnknown}</p>}
    {stopUnknown.length>0&&<p role="status">{copy.stopUnknown}</p>}
    {handles.map(handle=><article className="local-ai-model" key={handle.handleId} data-local-ai-runtime-handle={handle.handleId}><strong>{handle.artifactId}</strong><p>{roleLabel(handle.role)} · {stateLabel(handle)}</p>
      {handle.reasonCode&&<p>{localAiRuntimeReason(locale,handle.reasonCode)}</p>}{handle.synthetic&&<p>{copy.synthetic}</p>}
      {['loading','ready','evicting'].includes(handle.state)&&<button type="button" disabled={busy||!ready} onClick={()=>{let id=unloadIds.current.get(handle.handleId);if(!id){id=newIndependentRequestId();unloadIds.current.set(handle.handleId,id);}void act({operation:'unload',handleId:handle.handleId,clientRequestId:id});}}>{base.cancel}</button>}
    </article>)}
  </section>;
}
