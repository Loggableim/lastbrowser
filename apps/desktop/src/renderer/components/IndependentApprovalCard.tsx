import React,{useEffect,useRef,useState} from 'react';
import { useDesktopI18n } from '../i18n.js';
import { assistantScopeKey,newIndependentRequestId,type ApprovalView,type IndependentScope } from '../independent-contracts.js';
import type { IndependentAssistantController } from '../independent-assistant-controller.js';
import { independentApprovalCopy } from '../i18n/independent-approval-copy.js';
export function IndependentApprovalCard({approval,controller,spaceName,stale=false,onRefresh,onOpenChat}:Readonly<{approval:ApprovalView;controller:IndependentAssistantController;
 spaceName:string;stale?:boolean;onRefresh:()=>Promise<void>|void;onOpenChat?:(sessionId:string,scope:IndependentScope)=>void}>):React.JSX.Element{
 const {t,locale}=useDesktopI18n(),copy=independentApprovalCopy(locale),identity=JSON.stringify([assistantScopeKey(approval.scope),approval.approvalId,approval.actionDigest,approval.permissionRevision,approval.ownerKind==='native_chat'?approval.controlEpoch:null]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(false),[now,setNow]=useState(Date.now());
 const lock=useRef(false),mounted=useRef(true),current=useRef(identity);current.current=identity;
 useEffect(()=>{mounted.current=true;setError(false);setBusy(false);lock.current=false;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>{mounted.current=false;window.clearInterval(timer);};},[identity]);
 const expired=approval.state==='expired'||Date.parse(approval.expiresAt)<=now,native=approval.ownerKind==='native_chat';
 async function decide(approved:boolean){
  if(lock.current||stale||expired||approval.state!=='pending')return;lock.current=true;setBusy(true);setError(false);const captured=identity;
  try{const result=await controller.request({schemaVersion:1,operation:'approve',scope:approval.scope,payload:{approvalId:approval.approvalId,approved,
   actionDigest:approval.actionDigest,expectedPermissionRevision:approval.permissionRevision,...(native?{expectedControlEpoch:approval.controlEpoch}:{}),clientRequestId:newIndependentRequestId()}});
   if(!mounted.current||current.current!==captured)return;if(!result.ok)setError(true);await onRefresh();
  }catch{if(mounted.current&&current.current===captured)setError(true);}
  finally{if(mounted.current&&current.current===captured){lock.current=false;setBusy(false);}}
 }
 return <article className="space-assistant-card" data-independent-approval={approval.approvalId}>
  <strong>{t('spaceAssistant.waiting_for_approval')}</strong><p>{copy[native?'chat':'run']}</p>
  <code>{native?approval.sessionId:approval.runId}</code><p dir="auto">{spaceName} · {approval.targetSummary}</p><p>{approval.effect}</p>
  <p>{copy.expires}: <time dateTime={approval.expiresAt}>{new Date(approval.expiresAt).toLocaleString(locale)}</time></p>
  {expired&&<p role="status">{copy.expired}</p>}{error&&<p role="alert">{copy.changed}</p>}
  {native&&onOpenChat&&<button type="button" onClick={()=>onOpenChat(approval.sessionId,approval.scope)}>{t('spaceAssistant.openChat')}</button>}
  {[true,false].map(approved=><button key={String(approved)} type="button" disabled={busy||stale||expired||approval.state!=='pending'} onClick={()=>void decide(approved)}>{t(approved?'spaceAssistant.approve':'spaceAssistant.deny')}</button>)}
  {error&&<button type="button" disabled={busy} onClick={()=>void onRefresh()}>{t('common.retry')}</button>}
 </article>;
}
