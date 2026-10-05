import React,{useEffect,useRef,useState} from 'react';
import { useDesktopI18n } from '../i18n.js';
import { assistantScopeKey,newIndependentRequestId,type IndependentScope } from '../independent-contracts.js';
import { IndependentAssistantClient } from '../independent-assistant-client.js';
import { isLocalRoleResponse } from '../../main/local-ai-role-profile.js';
import { localAiChatCandidateCopy } from '../i18n/local-ai-copy.js';
import { isLocalAiRuntimeResponse,localAiRuntimePendingKey,localAiRuntimeReceiptKey,readLocalAiRuntimePending,runtimeResponseMatches,
  type LocalAiRuntimePending,type LocalAiRuntimeRequest,type LocalAiRuntimeResponse,type LocalAiRuntimeReview } from '../local-ai-runtime-contracts.js';
import './local-ai-setup.css';

const artifactId='LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0';
const artifactRevision='9969000761ce34de907bf20017cbfc3d52d6eaf9';
type Phase='idle'|'qualifying'|'running'|'ready'|'failed';
type Props=Readonly<{scope:IndependentScope;client:IndependentAssistantClient;planDigest:string;ready:boolean;complete:boolean}>;

export function LocalAiChatQualification({scope,client,planDigest,ready,complete}:Props):React.JSX.Element|null{
  const {locale}=useDesktopI18n(),copy=localAiChatCandidateCopy(locale),scopeId=assistantScopeKey(scope);
  const consentKey='lastbrowser.localAiChatConsent:'+scope.backendProfileId+':'+scope.spaceId+':'+scope.browserProfileId+':'+planDigest;
  const identity=JSON.stringify([scopeId,planDigest]),current=useRef(identity),mounted=useRef(true),lock=useRef(false),startedRef=useRef(false),pollCount=useRef(0);
  const [phase,setPhase]=useState<Phase>('idle'),[pending,setPending]=useState<LocalAiRuntimePending|null>(null),[failureCode,setFailureCode]=useState('');
  current.current=identity;
  const live=(captured:string)=>mounted.current&&current.current===captured;
  function readPending():LocalAiRuntimePending|null{
    try{if(window.localStorage.getItem('lastbrowser.localAiChatPlan:'+scopeId)!==planDigest)return null;
      return readLocalAiRuntimePending(scope,window.localStorage)||readLocalAiRuntimePending(scope,window.localStorage,'receipt');}catch{return null;}
  }
  function savePending(value:LocalAiRuntimePending|null){
    const key=localAiRuntimePendingKey(scope);
    try{if(value){window.localStorage.setItem(key,JSON.stringify(value));window.localStorage.setItem('lastbrowser.localAiChatPlan:'+scopeId,planDigest);}
      else{window.localStorage.removeItem(key);window.localStorage.removeItem('lastbrowser.localAiChatPlan:'+scopeId);}}catch{}
    setPending(value);
  }
  async function runtime(request:LocalAiRuntimeRequest):Promise<LocalAiRuntimeResponse>{
    const answer=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'runtime',request}});
    if(!answer.ok||!isLocalAiRuntimeResponse(answer.value)||!runtimeResponseMatches(answer.value,request,scope))throw Error('runtime_unavailable');
    return answer.value;
  }
  async function bindChatAnswer(captured:string){
    const [draftAnswer,readAnswer]=await Promise.all([
      client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'roleProfile',request:{operation:'draft',planDigest}}}),
      client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'roleProfile',request:{operation:'read'}}})
    ]);
    if(!live(captured)||!draftAnswer.ok||!isLocalRoleResponse(draftAnswer.value)||draftAnswer.value.operation!=='draft'
      ||!readAnswer.ok||!isLocalRoleResponse(readAnswer.value)||readAnswer.value.operation!=='read')throw Error('role_profile_unavailable');
    const draft=draftAnswer.value.profile,prior=readAnswer.value.profile;
    const choice=draft.choices.find(row=>row.task==='chat.answer'&&row.artifactId===artifactId&&row.artifactRevision===artifactRevision&&row.state==='prepared');
    if(!choice)throw Error('chat_answer_not_prepared');
    const selections=[...prior.selections.filter(item=>item.task!=='chat.answer'),{task:'chat.answer' as const,artifactId,contextTokens:1024}];
    const confirmed=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'roleProfile',request:{operation:'confirm',choice:{
      expectedRevision:draft.expectedRevision,setupRevision:draft.setupRevision,planDigest,clientRequestId:newIndependentRequestId(),selections
    }}}});
    const confirmedValue=confirmed.ok&&isLocalRoleResponse(confirmed.value)&&confirmed.value.operation==='confirm'?confirmed.value:null;
    if(!live(captured)||!confirmedValue||!confirmedValue.profile.selections.some(item=>item.task==='chat.answer'&&item.artifactId===artifactId&&item.contextTokens===1024)
      ||prior.selections.some(item=>item.task!=='chat.answer'&&!confirmedValue.profile.selections.some(saved=>saved.task===item.task&&saved.artifactId===item.artifactId&&saved.contextTokens===item.contextTokens)))
      throw Error('role_profile_confirmation_failed');
  }
  async function finish(value:LocalAiRuntimeResponse,captured:string,saved:LocalAiRuntimePending){
    if(!('productChatQualified'in value)||value.operation!=='bootstrap'&&value.operation!=='receipt'||value.state!=='complete'
      ||value.productChatQualified!==true||value.suite!=='chat-quality-v1'||value.operationVerified!==true||value.qualityPassed!==true||value.sloPassed!==true
      ||value.synthetic!==false||value.samples!==3||value.contextCapacityVerified!==true||value.memoryEnvelopeVerified!==true)throw Error('quality_not_qualified');
    try{window.localStorage.setItem(localAiRuntimeReceiptKey(scope),JSON.stringify(saved));}catch{}
    await bindChatAnswer(captured);if(!live(captured))return;
    const capability=await runtime({operation:'capability'});
    if(capability.operation!=='capability'||capability.state!=='ready'||capability.artifactId!==artifactId||capability.artifactRevision!==artifactRevision
      ||!capability.capabilities.includes('local_short_chat')||!capability.capabilities.includes('deterministic_auto_short_chat')
      ||capability.qualityVerified!==true||capability.contextTokens!==1024||capability.maxOutputTokens!==48||capability.parallelRequests!==1
      ||capability.maxRamBytes!==805306368||capability.maxSeconds!==25)throw Error('capability_unavailable');
    if(!live(captured))return;
    savePending(null);try{window.localStorage.setItem(consentKey,'complete');}catch{}setPhase('ready');
  }
  async function pollReceipt(saved:LocalAiRuntimePending,captured:string){
    const receipt=await runtime({operation:'receipt',purposeDigest:saved.purposeDigest,clientRequestId:saved.clientRequestId});
    if(!live(captured))return;
    if(receipt.operation!=='receipt')throw Error('invalid_receipt');
    if(receipt.state==='running'){setPhase('running');return;}
    if(receipt.state==='complete'){await finish(receipt,captured,saved);return;}
    if(receipt.state==='unknown'){
      const retried=await runtime({operation:'bootstrap',purposeDigest:saved.purposeDigest,clientRequestId:saved.clientRequestId});
      if(!live(captured))return;
      if(retried.operation==='bootstrap'&&retried.state==='complete'){await finish(retried,captured,saved);return;}
      if(retried.operation==='bootstrap'&&retried.state==='running'){pollCount.current=0;setPhase('running');return;}
    }
    throw Error('qualification_failed');
  }
  async function run(){
    if(lock.current||!ready||!complete)return;lock.current=true;const captured=identity;setPhase('qualifying');
    try{
      const saved=readPending();
      if(saved&&saved.artifactId===artifactId&&saved.role==='chat'){setPending(saved);await pollReceipt(saved,captured);return;}
      const scan=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'scan'}});
      if(!live(captured)||!scan.ok||!('scan'in scan.value))throw Error('hardware_scan_failed');
      const reviewed=await runtime({operation:'review',artifactId,role:'chat',clientRequestId:newIndependentRequestId()});
      if(!live(captured)||reviewed.operation!=='review'||!('purposeDigest'in reviewed)||!('artifactId'in reviewed)||!('expiresAt'in reviewed))throw Error('runtime_review_failed');
      const review=reviewed as LocalAiRuntimeReview&{operation:'review';purposeDigest:string;available:false;operationVerified:false};
      if(review.artifactId!==artifactId||review.artifactRevision!==artifactRevision||review.role!=='chat'||review.contextTokens!==1024
        ||review.budgetSeconds>25||review.ramLimitBytes>805306368)throw Error('runtime_review_failed');
      const request:LocalAiRuntimePending={purposeDigest:review.purposeDigest,expiresAt:review.expiresAt,artifactId,role:'chat',clientRequestId:newIndependentRequestId()};
      savePending(request);
      const tested=await runtime({operation:'bootstrap',purposeDigest:request.purposeDigest,clientRequestId:request.clientRequestId});
      if(!live(captured))return;
      if(tested.operation==='bootstrap'&&tested.state==='complete'){await finish(tested,captured,request);return;}
      if(tested.operation==='bootstrap'&&tested.state==='running'){pollCount.current=0;setPhase('running');return;}
      if(tested.operation==='bootstrap'&&tested.state==='failed'&&tested.reasonCode)throw Error(tested.reasonCode);
      throw Error('qualification_failed');
    }catch(error){if(live(captured)){const code=error instanceof Error?error.message:'';setFailureCode(/^[a-z0-9_]{1,96}$/.test(code)?code:'local_ai_qualification_failed');setPhase('failed');}}
    finally{lock.current=false;if(live(captured))startedRef.current=true;}
  }
  useEffect(()=>{mounted.current=true;startedRef.current=false;setPhase('idle');const saved=readPending();setPending(saved);
    return()=>{mounted.current=false;};},[identity]);
  useEffect(()=>{if(!ready||!complete||!pending||phase!=='running')return;const captured=identity;let active=true,polling=false;
    const timer=window.setInterval(()=>{if(lock.current||polling)return;if(++pollCount.current>30){setPhase('failed');return;}polling=true;void runtime({operation:'receipt',purposeDigest:pending.purposeDigest,clientRequestId:pending.clientRequestId})
      .then(async value=>{if(!active||!live(captured))return;if(value.operation==='receipt'&&value.state==='running')return setPhase('running');
        if(value.operation==='receipt'&&value.state==='complete'){lock.current=true;try{await finish(value,captured,pending);}catch{if(live(captured))setPhase('failed');}finally{lock.current=false;}return;}
        setPhase('failed');}).catch(()=>{if(active&&live(captured))setPhase('failed');}).finally(()=>{polling=false;});},2000);
    return()=>{active=false;window.clearInterval(timer);};},[identity,ready,complete,pending?.clientRequestId,phase]);
  useEffect(()=>{if(!ready||!complete||startedRef.current||phase!=='idle')return;let authorization='';try{authorization=window.localStorage.getItem(consentKey)??'';}catch{}
    if(authorization==='authorized'){startedRef.current=true;void run();}
    else if(authorization==='complete'){startedRef.current=true;void runtime({operation:'capability'}).then(value=>{
      if(!live(identity))return;if(value.operation==='capability'&&value.state==='ready'&&value.artifactId===artifactId&&value.artifactRevision===artifactRevision
        &&value.planDigest===planDigest&&value.qualityVerified&&value.contextTokens===1024&&value.maxOutputTokens===48&&value.parallelRequests===1
        &&value.maxRamBytes===805306368&&value.maxSeconds===25&&value.capabilities.includes('local_short_chat')&&value.capabilities.includes('deterministic_auto_short_chat'))setPhase('ready');
      else setPhase('failed');}).catch(()=>{if(live(identity))setPhase('failed');});}},[identity,ready,complete,phase]);
  if(!complete)return null;
  const failureMessage=failureCode==='runtime_bootstrap_ram_reserve_exceeded'?copy.lowRam:copy.failed;
  return <section className="local-ai-runtime" data-local-ai-qualification={phase} data-local-ai-scope={scopeId} data-error-code={phase==='failed'?failureCode:undefined}>
    <p role="status" aria-live="polite">{phase==='ready'?copy.qualified:phase==='qualifying'||phase==='running'?copy.qualifying:phase==='failed'?failureMessage:copy.notReady}</p>
    {phase==='failed'&&failureCode&&<details><summary>{copy.technicalDetails}</summary><code>{failureCode}</code></details>}
    {phase==='failed'&&<button type="button" disabled={!ready||!complete} onClick={()=>void run()}>{copy.retry}</button>}
  </section>;
}
