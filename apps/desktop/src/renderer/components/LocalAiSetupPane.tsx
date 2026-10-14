import React, { useEffect, useRef, useState } from 'react';
import { useDesktopI18n } from '../i18n.js';
import { localAiCopy } from '../i18n/local-ai-copy.js';
import { IndependentAssistantClient } from '../independent-assistant-client.js';
import type { IndependentScope } from '../independent-contracts.js';
import { ProfileResolutionPending } from '../profile-resolution.js';
import { LocalModelStore } from './LocalModelStore.js';
import './local-ai-setup.css';

type Props=Readonly<{workspacePath:string;browserProfileId:string;backendProfileName?:string|null;ready:boolean;onSkipped?:()=>void;keepGlobalRouterStatusVisible?:boolean}>;

/** Browsing is scoped independently of whether this candidate bundles inference. */
export function LocalAiSetupPane({workspacePath,browserProfileId,backendProfileName,ready,onSkipped}:Props):React.JSX.Element{
  const {locale}=useDesktopI18n(),copy=localAiCopy(locale);
  const de=locale==='de';
  const [client]=useState(()=>typeof window !== 'undefined' && window.lastbrowser?.independent ? new IndependentAssistantClient(window.lastbrowser.independent) : null);
  const key=JSON.stringify([browserProfileId,workspacePath||null,backendProfileName||null,ready]);
  const currentKey=useRef(key);currentKey.current=key;
  const [binding,setBinding]=useState<{key:string;scope:IndependentScope}|null>(null);
  const [error,setError]=useState<{key:string;text:string}|null>(null);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let alive=true;
    setBinding(null);setError(null);
    if(!ready||!browserProfileId||!backendProfileName||!client)return;
    const timeout=window.setTimeout(()=>{
      if(alive&&currentKey.current===key){alive=false;setError({key,text:de?'Das Profil konnte noch nicht zugeordnet werden. Bitte erneut versuchen.':'The profile could not be resolved yet. Please retry.'});}
    },15_000);
    void client.request({schemaVersion:1,operation:'resolveScope',backendProfileName,
      payload:{browserProfileId,workspacePath:workspacePath||null}}).then(result=>{
        if(!alive||currentKey.current!==key)return;
        if(!result.ok)throw new Error(result.error.message);
        if(result.value.scope.browserProfileId!==browserProfileId||(result.value.backendProfileName&&result.value.backendProfileName!==backendProfileName))throw new Error(de?'Die Profilzuordnung hat sich geändert.':'The profile binding changed.');
        setBinding({key,scope:result.value.scope});
      }).catch(reason=>{
        if(alive&&currentKey.current===key)setError({key,text:reason instanceof Error?reason.message:String(reason)});
      }).finally(()=>window.clearTimeout(timeout));
    return()=>{alive=false;window.clearTimeout(timeout);};
  },[key,client,retry,de]);
  const resolved=binding?.key===key?binding.scope:null;
  const visibleError=error?.key===key?error.text:'';
  return <section className="local-ai-setup" aria-label={copy.title} data-local-ai-status={resolved?'catalog':'pending'}>
    {!backendProfileName?<ProfileResolutionPending/>:resolved&&client?<LocalModelStore key={key} scope={resolved} client={client} ready={ready}/>:<div aria-live="polite">
      <h2>{copy.title}</h2>
      <p role={visibleError?'alert':'status'}>{visibleError||(de?(ready?'Modellkatalog wird deinem Profil zugeordnet…':'Der lokale Dienst wird vorbereitet…'):(ready?'Binding the model catalog to your profile…':'Preparing the local service…'))}</p>
      {!!visibleError&&<button type="button" onClick={()=>setRetry(value=>value+1)}>{de?'Erneut versuchen':'Retry'}</button>}
    </div>}
    {onSkipped&&<button type="button" onClick={onSkipped}>{de?'Weiter ohne lokales Modell':'Continue without a local model'}</button>}
  </section>;
}
