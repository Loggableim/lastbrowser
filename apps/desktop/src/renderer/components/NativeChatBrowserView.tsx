import React,{useEffect,useRef,useState} from 'react';
import { useDesktopI18n } from '../i18n.js';
import { assistantScopeKey,newIndependentRequestId,sameAssistantScope,type ActivitySnapshot,type IndependentBridge,type IndependentScope,
  type NativeBrowserPreview,type NativeBrowserTakeover,type IndependentOperations } from '../independent-contracts.js';
import { useNativeChatControls } from '../native-chat-control.js';
import { nativeChatBrowserCopy } from '../i18n/native-chat-browser-copy.js';
import { independentBrowserSessionCopy } from '../i18n/independent-browser-copy.js';
import './native-chat-browser.css';

type Requester=Pick<IndependentBridge,'request'>;
type ActiveChat=ActivitySnapshot['activeChats'][number];

/** A read-only snapshot is the only source of browser ownership for a human takeover. */
export function NativeChatBrowserView({scope,sessionId,streamId,observedAt,active,client}:Readonly<{scope:IndependentScope;sessionId:string;streamId:string;
  observedAt:string;active:boolean;client:Requester}>):React.JSX.Element{
  const {locale}=useDesktopI18n(),copy=nativeChatBrowserCopy[locale];
  const identity=JSON.stringify([assistantScopeKey(scope),sessionId,streamId]);
  const [view,setView]=useState<NativeBrowserPreview|NativeBrowserTakeover|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<'unavailable'|'changed'|'unknown'|''>('');
  const record=useNativeChatControls(state=>state.records[streamId]);
  const current=useRef(identity),mounted=useRef(true),lock=useRef(false);
  const pending=useRef<IndependentOperations['takeoverNativeBrowser']['payload']|null>(null);
  current.current=identity;
  const knownRecordMatches=!record||(sameAssistantScope(record.binding.scope,scope)&&record.binding.sessionId===sessionId&&record.binding.streamId===streamId&&record.processExited!==true);
  const live=active&&knownRecordMatches;
  const liveRef=useRef(live);liveRef.current=live;
  const proofMatches=!view||!record?.writerGeneration||record.writerGeneration===view.owner.writerGeneration;
  const canTakeover=live&&proofMatches&&view?.kind==='native_browser_preview'&&view.writerAvailable&&view.state==='ready'&&!view.automationPaused;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setView(null);setError('');setBusy(false);pending.current=null;lock.current=false;},[identity]);
  const accepts=(captured:string)=>mounted.current&&current.current===captured&&liveRef.current;
  async function open(){
    if(lock.current||!live||pending.current)return;
    const captured=identity;lock.current=true;setBusy(true);setError('');
    try{
      const result=await client.request({schemaVersion:1,operation:'openNativeBrowser',scope,payload:{sessionId,streamId,clientRequestId:newIndependentRequestId()}});
      if(!accepts(captured))return;
      if(result.ok){setView(result.value);setError('');}else{setView(null);setError(result.error.code.includes('stale')||result.error.code.includes('owner')?'changed':'unavailable');}
    }catch{if(accepts(captured)){setView(null);setError('unavailable');}}
    finally{if(mounted.current&&current.current===captured){lock.current=false;setBusy(false);}}
  }
  async function takeover(){
    if(lock.current||!live||!proofMatches||(!pending.current&&!canTakeover))return;
    const captured=identity;
    if(!pending.current&&view)pending.current={sessionId,streamId,writerGeneration:view.owner.writerGeneration,writerLeaseId:view.owner.writerLeaseId,
      expectedControlRevision:view.controlRevision,expectedPermissionRevision:view.permissionRevision,expectedControlEpoch:view.controlEpoch,
      expectedNavigationEpoch:view.navigationEpoch,clientRequestId:newIndependentRequestId()};
    const request=pending.current;if(!request)return;
    lock.current=true;setBusy(true);setError('');
    try{
      const result=await client.request({schemaVersion:1,operation:'takeoverNativeBrowser',scope,payload:request});
      if(!accepts(captured))return;
      if(result.ok){setView(result.value);pending.current=null;}
      else if(result.error.retryable||result.error.code==='invalid_response'){setError('unknown');}
      else{pending.current=null;setView(null);setError('changed');}
    }catch{if(accepts(captured))setError('unknown');}
    finally{if(mounted.current&&current.current===captured){lock.current=false;setBusy(false);}}
  }
  return <section className="native-chat-browser" aria-label={copy.title} data-native-browser-session={sessionId}>
    <strong>{copy.title}</strong>
    <time dateTime={view?.observedAt??observedAt}>{new Date(view?.observedAt??observedAt).toLocaleString(locale)}</time>
    <div className="native-chat-browser-actions">
      <button type="button" disabled={busy||!live||Boolean(pending.current)} onClick={()=>void open()}>{view?copy.refresh:copy.view}</button>
      {pending.current?<button type="button" disabled={busy||!live||!proofMatches} onClick={()=>void takeover()}>{copy.retry}</button>
        :<button type="button" disabled={busy||!canTakeover} onClick={()=>void takeover()}>{copy.takeover}</button>}
      {view&&<button type="button" disabled={busy||Boolean(pending.current)} onClick={()=>setView(null)}>{copy.close}</button>}
    </div>
    {busy&&<p role="status">{copy.busy}</p>}
    {(!live||!proofMatches)&&<p role="status">{copy.stale}</p>}
    {error&&<p role="alert">{copy[error]}</p>}
    {view?.automationPaused&&live&&proofMatches&&<p role="status">{copy.paused}</p>}
    <p>{copy.effect}</p>
    {view&&<p>{independentBrowserSessionCopy[locale]}</p>}
    {view?.kind==='native_browser_preview'&&<figure>
      <img src={`data:${view.preview.mimeType};base64,${view.preview.base64}`} alt={copy.preview}/>
      <figcaption><time dateTime={view.preview.observedAt}>{new Date(view.preview.observedAt).toLocaleString(locale)}</time></figcaption>
    </figure>}
  </section>;
}

/** Work chats reuse actual Scope activity; a saved stream ID alone is insufficient. */
export function NativeChatBrowserActivity({scope,sessionId,client}:Readonly<{scope:IndependentScope;sessionId:string;client:Requester}>):React.JSX.Element|null{
  const identity=JSON.stringify([assistantScopeKey(scope),sessionId]),[row,setRow]=useState<ActiveChat|null>(null);
  useEffect(()=>{
    let current=true,inFlight=false;setRow(null);
    async function poll(){
      if(inFlight)return;inFlight=true;
      try{
        const result=await client.request({schemaVersion:1,operation:'activity',scope,payload:{}});
        if(current)setRow(result.ok&&result.value.sourceState==='live'
          ?result.value.activeChats.find(chat=>chat.sessionId===sessionId&&chat.sourceActuality==='live'&&Boolean(chat.activeStreamId))??null:null);
      }catch{if(current)setRow(null);}
      finally{inFlight=false;}
    }
    void poll();const timer=setInterval(()=>void poll(),1000);
    return()=>{current=false;clearInterval(timer);};
  },[identity,client]);
  return row?.activeStreamId?<NativeChatBrowserView key={`${identity}:${row.activeStreamId}`} scope={scope} sessionId={sessionId} streamId={row.activeStreamId}
    observedAt={row.observedAt} active={row.sourceActuality==='live'} client={client}/>:null;
}
