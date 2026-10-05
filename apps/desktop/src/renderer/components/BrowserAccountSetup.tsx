import React,{useEffect,useRef,useState} from 'react';
import { useDesktopI18n } from '../i18n.js';
import { assistantScopeKey,newIndependentRequestId,type BrowserAccountFlow,type CapabilityConnection,type IndependentOperations,type IndependentScope } from '../independent-contracts.js';
import { normalizedBrowserAccountOrigin } from '../independent-assistant-client.js';
import type { IndependentAssistantController } from '../independent-assistant-controller.js';
import { browserAccountCopy,browserAccountRecoveryCopy } from '../i18n/browser-account-copy.js';
import { independentBrowserConfirmationCopy,independentBrowserSessionCopy } from '../i18n/independent-browser-copy.js';
const recoveryKey=(scope:IndependentScope)=>`lastbrowser.browserAccountFlow:${assistantScopeKey(scope)}`;
const pendingStartKey=(scope:IndependentScope)=>`lastbrowser.browserAccountStart:${assistantScopeKey(scope)}`;
export type BrowserAccountPendingStart=Readonly<{schemaVersion:1;origin:string;clientRequestId:string}>;
export function readBrowserAccountPendingStart(scope:IndependentScope,storage:Pick<Storage,'getItem'>):BrowserAccountPendingStart|null {
  try{const raw=storage.getItem(pendingStartKey(scope));if(!raw)return null;const value:unknown=JSON.parse(raw);
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const row=value as Record<string,unknown>;
    if(row.schemaVersion!==1||typeof row.origin!=='string'||normalizedBrowserAccountOrigin(row.origin)!==row.origin
      ||typeof row.clientRequestId!=='string'||!/^([a-f\d]{8}-){1}[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(row.clientRequestId)
      ||Object.keys(row).some(key=>!['schemaVersion','origin','clientRequestId'].includes(key)))return null;
    return{schemaVersion:1,origin:row.origin,clientRequestId:row.clientRequestId};
  }catch{return null;}
}
export function readBrowserAccountRecovery(scope:IndependentScope,storage:Pick<Storage,'getItem'>):string|null {
  try{const value=storage.getItem(recoveryKey(scope));return value&&/^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value)?value:null;}catch{return null;}
}
export function BrowserAccountSetup({scope,controller,connections,onChanged}:Readonly<{scope:IndependentScope;controller:IndependentAssistantController;
  connections:readonly CapabilityConnection[];onChanged:()=>void}>):React.JSX.Element {
  const {locale}=useDesktopI18n(),copy=browserAccountCopy(locale),recoveryCopy=browserAccountRecoveryCopy[locale];
  const [origin,setOrigin]=useState(''),[label,setLabel]=useState(''),[flow,setFlow]=useState<BrowserAccountFlow|null>(null);
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[logout,setLogout]=useState<CapabilityConnection|null>(null);
  const [pendingStart,setPendingStart]=useState<BrowserAccountPendingStart|null>(null);
  const lock=useRef(false),mounted=useRef(true),retry=useRef<{signature:string;requestId:string}|null>(null);
  const act=async(payload:IndependentOperations['browserConnection']['payload'])=>{
    if(lock.current)return;lock.current=true;setPending(true);setError('');
    try{const result=await controller.request({schemaVersion:1,operation:'browserConnection',scope,payload});
      if(!mounted.current)return;
      if(!result.ok){setError(copy.unavailable);return;}
      setFlow(result.value);setLogout(null);
      if(payload.action==='start'){setPendingStart(null);try{window.localStorage.removeItem(pendingStartKey(scope));}catch{}}
      if(!['starting','awaiting_user','revoking'].includes(result.value.setupStatus))retry.current=null;
      try{if(['starting','awaiting_user'].includes(result.value.setupStatus))window.localStorage.setItem(recoveryKey(scope),result.value.flowId);
        else window.localStorage.removeItem(recoveryKey(scope));}catch{}
      onChanged();
    }finally{lock.current=false;if(mounted.current)setPending(false);}
  };
  useEffect(()=>{mounted.current=true;const saved=readBrowserAccountPendingStart(scope,window.localStorage);setPendingStart(saved);if(saved)setOrigin(saved.origin);
    const flowId=readBrowserAccountRecovery(scope,window.localStorage);if(flowId)void act({action:'poll',flowId});
    return()=>{mounted.current=false;};},[controller]);
  useEffect(()=>{if(!flow||!['starting','awaiting_user','revoking'].includes(flow.setupStatus))return;
    const flowId=flow.flowId;let current=true,polling=false;
    const timer=window.setInterval(()=>{if(polling||lock.current)return;polling=true;
      void controller.request({schemaVersion:1,operation:'browserConnection',scope,payload:{action:'poll',flowId}}).then(result=>{
        if(!current||!mounted.current)return;
        if(result.ok){setFlow(result.value);if(!['starting','awaiting_user','revoking'].includes(result.value.setupStatus)){try{window.localStorage.removeItem(recoveryKey(scope));}catch{}onChanged();}}
        else setError(copy.unavailable);
      }).finally(()=>{polling=false;});},1000);
    return()=>{current=false;window.clearInterval(timer);};},[flow?.flowId,flow?.setupStatus,controller]);
  const ongoing=Boolean(flow&&['starting','awaiting_user','revoking'].includes(flow.setupStatus));
  function requestId(signature:string){if(retry.current?.signature!==signature)retry.current={signature,requestId:newIndependentRequestId()};return retry.current.requestId;}
  function start(value:BrowserAccountPendingStart){
    if(lock.current)return;setPendingStart(value);
    try{window.localStorage.setItem(pendingStartKey(scope),JSON.stringify(value));}catch{}
    void act({action:'start',origin:value.origin,clientRequestId:value.clientRequestId});
  }
  return <section className="space-assistant-card browser-account-setup" aria-label={copy.title}>
    <strong>{copy.title}</strong><p>{independentBrowserSessionCopy[locale]}</p><p>{copy.noGrant}</p>
    {error&&<p role="alert">{error}</p>}
    {pendingStart&&<section className="space-assistant-card" data-browser-start-recovery="true"><p role="status">{recoveryCopy.unknown}</p><strong>{pendingStart.origin}</strong>
      <button type="button" disabled={pending} onClick={()=>start(pendingStart)}>{recoveryCopy.retry}</button></section>}
    <form onSubmit={event=>{event.preventDefault();const normalized=normalizedBrowserAccountOrigin(origin.trim());if(!normalized){setError(copy.invalidOrigin);return;}
      if(!pendingStart)start({schemaVersion:1,origin:normalized,clientRequestId:requestId(`start:${normalized}`)});}}>
      <label className="space-assistant-field"><span>{copy.origin}</span><input type="url" value={origin} disabled={pending||ongoing||!!pendingStart} placeholder="https://example.com" onChange={event=>setOrigin(event.target.value)}/></label>
      <button type="submit" disabled={pending||ongoing||!!pendingStart||!origin.trim()}>{copy.start}</button>
    </form>
    {flow&&<section className="space-assistant-card" data-browser-account-flow={flow.flowId}>
      <strong>{flow.origin}</strong><p role="status">{copy[flow.setupStatus]}</p>
      {flow.setupStatus==='user_confirmed'&&<p>{independentBrowserConfirmationCopy[locale]}</p>}
      {flow.setupStatus==='awaiting_user'&&<><label className="space-assistant-field"><span>{copy.label}</span><input value={label} maxLength={80} disabled={pending} onChange={event=>setLabel(event.target.value)}/></label>
        <button type="button" disabled={pending} onClick={()=>{void act({action:'confirm',flowId:flow.flowId,expectedRevision:flow.revision,clientRequestId:requestId(`confirm:${flow.flowId}:${flow.revision}:${label.trim()}`),...(label.trim()?{accountLabel:label.trim()}:{})});}}>{copy.confirm}</button></>}
      {ongoing&&<button type="button" disabled={pending} onClick={()=>{void act({action:'cancel',flowId:flow.flowId});}}>{copy.cancel}</button>}
      <button type="button" disabled={pending} onClick={()=>{void act({action:'poll',flowId:flow.flowId});}}>{copy.refresh}</button>
    </section>}
    {connections.filter(connection=>connection.authenticationStatus==='user_confirmed').map(connection=><div key={connection.connectionId} className="space-assistant-card">
      <strong>{connection.title||connection.origin||connection.connectionId}</strong><button type="button" disabled={pending||ongoing} onClick={()=>setLogout(connection)}>{copy.logout}</button>
    </div>)}
    {logout&&<section className="space-assistant-card" role="group" aria-label={copy.logoutReview}><p>{copy.clearScope}</p>
      <button type="button" disabled={pending} onClick={()=>{void act({action:'logout',connectionId:logout.connectionId,expectedRevision:logout.revision,clientRequestId:requestId(`logout:${logout.connectionId}:${logout.revision}`)});}}>{copy.logoutReview}</button>
      <button type="button" disabled={pending} onClick={()=>setLogout(null)}>{copy.cancel}</button>
    </section>}
  </section>;
}
