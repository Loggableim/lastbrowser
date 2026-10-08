import React,{useEffect,useRef,useState} from 'react';
import { useDesktopI18n } from '../i18n.js';
import { IndependentAssistantClient } from '../independent-assistant-client.js';
import { assistantScopeKey,newIndependentRequestId,type IndependentScope } from '../independent-contracts.js';
import type { LocalAiHardwareInventory } from '../local-ai-contracts.js';
import { localAiScanFresh,localAiPresets,localAiRoles,type LocalAiCatalog,type LocalAiJob,type LocalAiPayload,type LocalAiPlan,
  type LocalAiPreferences,type LocalAiPreset,type LocalAiRecommendationResult,type LocalAiResponse,type LocalAiRole } from '../local-ai-contracts.js';
import { localAiChatCandidateCopy,localAiCopy,localAiReason,localAiSetupCopy } from '../i18n/local-ai-copy.js';
import { advanceLocalAiSetupScopeEpoch,isLocalAiSetupRequestCurrent,localAiSetupRequestOwner,readLocalAiSetupMode,resolveSimpleRecommendationPreset,simpleLocalAiActionsAvailable,withLocalAiScanTimeout,writeLocalAiSetupMode,type LocalAiSetupMode } from './local-ai-setup-preference.js';
import './local-ai-setup.css';
import { LocalAiRuntimeControls } from './LocalAiRuntimeControls.js';
import { LocalAiRoleBindings } from './LocalAiRoleBindings.js';
import { LocalAiBootstrapPane } from './LocalAiBootstrapPane.js';
import { LocalAiChatQualification } from './LocalAiChatQualification.js';
import { LocalModelStore } from './LocalModelStore.js';
import { retryRetryableOnce } from './local-ai-bootstrap-state.js';
type Scan=Extract<LocalAiResponse,{scan:unknown}>;
type Props=Readonly<{workspacePath:string;browserProfileId:string;backendProfileName?:string|null;ready:boolean;onSkipped?:()=>void;keepGlobalRouterStatusVisible?:boolean}>;
const SCAN_TIMEOUT_MS=20000;
const activeJob=(job:LocalAiJob)=>['pending','running','downloading','verifying','stopping'].includes(job.state);
const initialContexts:Record<LocalAiRole,number>={encoder:4096,retrieve:512,embed:512,extract:4096,agent:4096,vision:4096};
export function LocalAiSetupPane({workspacePath,browserProfileId,backendProfileName,ready,onSkipped,keepGlobalRouterStatusVisible=false}:Props):React.JSX.Element{
  const {locale}=useDesktopI18n(),copy=localAiCopy(locale),modeCopy=localAiSetupCopy(locale),key=JSON.stringify([workspacePath,browserProfileId,backendProfileName||'']);
  const [client]=useState(()=>new IndependentAssistantClient(window.lastbrowser.independent));
  const [bound,setBound]=useState<{key:string;scope:IndependentScope}|null>(null),[catalog,setCatalog]=useState<LocalAiCatalog|null>(null),[scan,setScan]=useState<Scan|null>(null),[inventory,setInventory]=useState<LocalAiHardwareInventory|null>(null),[inventoryError,setInventoryError]=useState('');
  const [result,setResult]=useState<LocalAiRecommendationResult|null>(null),[preferences,setPreferences]=useState<LocalAiPreferences|null>(null),[jobs,setJobs]=useState<readonly LocalAiJob[]>([]);
  const [preset,setPreset]=useState<LocalAiPreset>('balanced'),[context,setContext]=useState(4096),[parallel,setParallel]=useState(1),[roles,setRoles]=useState<readonly LocalAiRole[]>([]);
  const [contexts,setContexts]=useState(initialContexts),[files,setFiles]=useState<readonly string[]>([]),[fileMode,setFileMode]=useState(false);
  const [plan,setPlan]=useState<LocalAiPlan|null>(null),[consent,setConsent]=useState(false),[confirmed,setConfirmed]=useState<string|null>(null);
  const [detailMode,setDetailMode]=useState<LocalAiSetupMode>('simple'),[scanState,setScanState]=useState<'idle'|'checking'|'ready'|'timeout'|'failed'>('idle'),[inventoryState,setInventoryState]=useState<'idle'|'checking'|'ready'|'timeout'|'failed'>('idle');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[setupErrorCode,setSetupErrorCode]=useState<string|null>(null),[now,setNow]=useState(Date.now());
  const [skipped,setSkipped]=useState(false),skipRequested=useRef(false),[includeChatCandidate,setIncludeChatCandidate]=useState(false);
  const scopeEpoch=useRef({key,epoch:0});
  scopeEpoch.current=advanceLocalAiSetupScopeEpoch(scopeEpoch.current,key);
  const requestOwner=localAiSetupRequestOwner(scopeEpoch.current);
  const current=useRef(requestOwner);current.current=requestOwner;const mounted=useRef(true),lock=useRef<string|null>(null),inventoryLock=useRef<string|null>(null),scopedScanReady=useRef(false),retry=useRef<{signature:string;id:string}|null>(null);
  const pendingLoads=useRef(new Map<string,Promise<void>>());
  const scope=bound?.key===requestOwner?bound.scope:null;
  const bytes=(value:number|null)=>{if(value===null)return copy.unknown;const unit=value>=1024**3?1024**3:value>=1024**2?1024**2:value>=1024?1024:1;
    const suffix=unit===1024**3?'GiB':unit===1024**2?'MiB':unit===1024?'KiB':'B';
    return `${new Intl.NumberFormat(locale,{maximumFractionDigits:unit===1?0:1}).format(value/unit)} ${suffix}`;};
  const identity=(signature:string)=>{if(retry.current?.signature!==signature)retry.current={signature,id:newIndependentRequestId()};return retry.current.id;};
  const selection=(scanId:string,presetOverride:LocalAiPreset=preset):LocalAiPayload=>({action:'recommend',scanId,preset:presetOverride,contextTokens:context,parallelRequests:parallel,maxParallelModels:1,optInRoles:roles,
    roleBudgets:localAiRoles.map(role=>({role,contextTokens:contexts[role],parallelRequests:parallel})),...(presetOverride==='custom'?{customArtifactIds:files}:{})});
  useEffect(()=>{setDetailMode(scope?readLocalAiSetupMode(scope,window.localStorage):'simple');},[scope?assistantScopeKey(scope):'']);
  function changeMode(value:LocalAiSetupMode){setDetailMode(value);if(value==='simple'&&(preset==='max_local'||preset==='custom'))setPreset('balanced');if(scope)writeLocalAiSetupMode(scope,value,window.localStorage);}
  const live=(captured:string)=>isLocalAiSetupRequestCurrent(captured,current.current,mounted.current);
  function accept(value:LocalAiResponse){
    if('catalog'in value)setCatalog(value.catalog);
    if('scan'in value)setScan(value);
    if('result'in value){setResult(value.result);}
    if('operation'in value&&'skipAvailable'in value){if(value.preferences){setPreferences(value.preferences);setPlan(null);setConsent(false);setConfirmed(null);}
      if(value.plan){setPlan(value.plan);setConsent(false);setConfirmed(null);}
      if(value.consent)setConfirmed(value.consent.planDigest);
      if(value.job)setJobs(rows=>[...rows.filter(row=>row.jobId!==value.job!.jobId),value.job!]);if(value.jobs)setJobs(value.jobs);}
  }
  async function request(payload:LocalAiPayload){
    if(!scope||lock.current)return;const captured=requestOwner;lock.current=captured;setBusy(true);setError('');
    try{const response=await client.request({schemaVersion:1,operation:'localAi',scope,payload});if(!live(captured))return;
      if(response.ok)accept(response.value);
      else setError(response.error.code==='local_ai_scan_stale'?copy.fresh:modeCopy.serviceFailed);
    }catch{if(live(captured))setError(modeCopy.serviceFailed);
    }finally{if(lock.current===captured)lock.current=null;if(live(captured))setBusy(false);}
  }
  async function recommendForSimpleScan(targetScope:IndependentScope,scanId:string,captured:string){
    const first=await client.request({schemaVersion:1,operation:'localAi',scope:targetScope,payload:selection(scanId,'balanced')});
    if(!live(captured))return;if(!first.ok||!('result'in first.value)){setError(modeCopy.scanFailed);return;}
    const recommended=resolveSimpleRecommendationPreset(first.value.result.automaticRecommendation);
    if(recommended!==first.value.result.requestedPreset){
      const matched=await client.request({schemaVersion:1,operation:'localAi',scope:targetScope,payload:selection(scanId,recommended)});
      if(!live(captured))return;if(!matched.ok||!('result'in matched.value)){setError(modeCopy.scanFailed);return;}
      setPreset(recommended);accept(matched.value);return;
    }
    setPreset(recommended);accept(first.value);
  }
  async function scanScopedRecommendation(){
    if(!scope||!ready||lock.current||scopedScanReady.current)return;const captured=requestOwner;lock.current=captured;setBusy(true);setError('');setScanState('checking');
    try{
      const response=await withLocalAiScanTimeout(client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'scan'}}),SCAN_TIMEOUT_MS);
      if(!live(captured))return;
      if(!response.ok){const timedOut=response.error.code==='local_ai_hardware_timeout';setScanState(timedOut?'timeout':'failed');
        setError(timedOut?modeCopy.scanTimeout:response.error.code==='local_ai_scan_stale'?copy.fresh:modeCopy.scanFailed);return;}
      if(!('scan'in response.value)){setScanState('failed');setError(modeCopy.scanFailed);return;}
      accept(response.value);scopedScanReady.current=true;setScanState('ready');
      if(detailMode==='simple')await recommendForSimpleScan(scope,response.value.scan.hardware.scanId,captured);
    }catch(error){if(live(captured)){const timedOut=error instanceof Error&&error.message==='local_ai_hardware_scan_timeout';setScanState(timedOut?'timeout':'failed');setError(timedOut?modeCopy.scanTimeout:modeCopy.scanFailed);}
    }finally{if(lock.current===captured)lock.current=null;if(live(captured))setBusy(false);}
  }
  async function scanHardware(refreshRecommendation=false){
    if(inventoryLock.current)return;const captured=requestOwner;inventoryLock.current=captured;setInventoryError('');setInventoryState('checking');
    try{const response=await withLocalAiScanTimeout(client.request({schemaVersion:1,operation:'localAiHardwareInventory',payload:{}}),SCAN_TIMEOUT_MS);
      if(!live(captured))return;if(!response.ok){setInventoryState(response.error.code==='local_ai_hardware_timeout'?'timeout':'failed');setInventoryError(response.error.code==='local_ai_hardware_timeout'?modeCopy.scanTimeout:response.error.message||modeCopy.scanFailed);return;}
      setInventory(response.value);setInventoryState('ready');
      // The initial mount already resolves a scoped scan through load(). Keep
      // the independent inventory probe from racing that request; only an
      // explicit retry should also refresh the scoped recommendation.
      if(refreshRecommendation&&ready&&scope)await scanScopedRecommendation();
    }catch(error){if(live(captured)){setInventoryState(error instanceof Error&&error.message==='local_ai_hardware_scan_timeout'?'timeout':'failed');setInventoryError(modeCopy.scanFailed);}}
    finally{if(inventoryLock.current===captured)inventoryLock.current=null;}
  }
  async function beginSimpleSetup(includeCandidate=includeChatCandidate){
    const candidateId=result?.chatQualificationCandidate?.artifactId;
    const baseSelection=fileMode?files:result?.selectedArtifactIds??[];
    const planSelection=includeCandidate&&candidateId&&result?.chatQualificationCandidate?.state==='ready_to_download'
      ?[...new Set([...baseSelection,candidateId])]:baseSelection;
    const fail=(code:string,message=modeCopy.serviceFailed)=>{setIncludeChatCandidate(false);setSetupErrorCode(code.replace(/[^a-zA-Z0-9_.:-]/g,'_').slice(0,96));setError(message);};
    if(!scope){fail('local_ai_scope_unresolved');return;}
    if(!preferences){fail('local_ai_preferences_unavailable');return;}
    if(!result){fail('local_ai_recommendation_unavailable');return;}
    if(!fresh){fail('local_ai_scan_stale',copy.fresh);setScanState('checking');void scanScopedRecommendation();return;}
    if(includeCandidate){
      const candidate=result.chatQualificationCandidate;
      if(!candidate?.artifactId){fail('local_ai_candidate_id_missing');return;}
      if(candidate.state!=='ready_to_download'){fail(`local_ai_candidate_${candidate.state}`);return;}
      const artifact=catalog?.artifacts.find(item=>item.artifactId===candidate.artifactId);
      if(!artifact){fail('local_ai_candidate_catalog_artifact_missing');return;}
      if(!artifact.manifestComplete){fail('local_ai_candidate_manifest_incomplete');return;}
    }
    if(!(selectionValid||includeCandidate)){fail('local_ai_selection_unavailable');return;}
    if(lock.current){fail('local_ai_setup_busy',modeCopy.checking);return;}
    const captured=requestOwner;lock.current=captured;setBusy(true);setError('');setSetupErrorCode(null);
    try{
      const choice=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'setup',request:{operation:'select',choice:{decision:'local',preset,artifactIds:planSelection,
        expectedRevision:preferences.revision,clientRequestId:identity(`simple-select:${preferences.revision}:${preset}`)}}}});
      if(!live(captured))return;if(!choice.ok){fail(`local_ai_setup_select_${choice.error.code}`);return;}accept(choice.value);
      if(!('preferences'in choice.value)||!choice.value.preferences){fail('local_ai_setup_select_invalid_response');return;}
      const updatedPreferences=choice.value.preferences;
      const planned=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'setup',request:{operation:'plan',expectedRevision:updatedPreferences.revision,
        clientRequestId:identity(`simple-plan:${updatedPreferences.revision}`)}}});
      if(!live(captured))return;if(planned.ok)accept(planned.value);else fail(`local_ai_setup_plan_${planned.error.code}`);
    }catch{if(live(captured))fail('local_ai_setup_exception');}finally{if(lock.current===captured)lock.current=null;if(live(captured))setBusy(false);}
  }
  async function confirmAndStartSimple(){
    if(!scope||!plan||!consent||lock.current)return;const captured=requestOwner;lock.current=captured;setBusy(true);setError('');
    try{const confirmedResponse=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'setup',request:{operation:'confirm',planDigest:plan.planDigest,
      licenseDigests:[...new Set(plan.artifacts.flatMap(artifact=>artifact.licenseDigest?[artifact.licenseDigest]:[]))],clientRequestId:identity(`confirm:${plan.planDigest}`)}}});
      if(!live(captured))return;if(!confirmedResponse.ok){setSetupErrorCode(`local_ai_setup_confirm_${confirmedResponse.error.code}`);setError(modeCopy.serviceFailed);return;}accept(confirmedResponse.value);
      if(plan.artifacts.some(artifact=>artifact.artifactId==='LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0'))
        try{window.localStorage.setItem('lastbrowser.localAiChatConsent:'+scope.backendProfileId+':'+scope.spaceId+':'+scope.browserProfileId+':'+plan.planDigest,'authorized');}catch{}
      const started=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'setup',request:{operation:'start',planDigest:plan.planDigest,clientRequestId:identity(`start:${plan.planDigest}`)}}});
      if(!live(captured))return;if(started.ok)accept(started.value);else{setSetupErrorCode(`local_ai_setup_start_${started.error.code}`);setError(modeCopy.serviceFailed);}
    }catch{if(live(captured)){setSetupErrorCode('local_ai_setup_confirm_exception');setError(modeCopy.serviceFailed);}}finally{if(lock.current===captured)lock.current=null;if(live(captured))setBusy(false);}
  }
  async function load(){
    if(!ready||pendingLoads.current.has(requestOwner))return pendingLoads.current.get(requestOwner);const captured=requestOwner;setBusy(true);setError('');
    const work=(async()=>{
      const resolved=await retryRetryableOnce(()=>client.request({schemaVersion:1,operation:'resolveScope',payload:{workspacePath:workspacePath||null,browserProfileId},
        ...(backendProfileName?{backendProfileName}:{})}));
      if(!live(captured))return;if(!resolved.ok){setError(modeCopy.serviceFailed);return;}const scoped=resolved.value.scope;setBound({key:captured,scope:scoped});
      const answers=await Promise.all([{action:'catalog'},{action:'setup',request:{operation:'get'}},{action:'setup',request:{operation:'status'}}].map(payload=>
        retryRetryableOnce(()=>client.request({schemaVersion:1,operation:'localAi',scope:scoped,payload:payload as LocalAiPayload}))));
      if(!live(captured))return;
      for(const answer of answers){if(answer.ok)accept(answer.value);else setError(modeCopy.serviceFailed);}
      const savedSetup=answers[1];
      const savedSetupPreferences=savedSetup.ok&&'operation'in savedSetup.value&&savedSetup.value.operation==='get'
        ?savedSetup.value.preferences:undefined;
      if(savedSetupPreferences?.decision==='local'
        &&savedSetupPreferences.artifactIds.includes('LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0')){
        setIncludeChatCandidate(true);
        const restoredPlan=await retryRetryableOnce(()=>client.request({schemaVersion:1,operation:'localAi',scope:scoped,payload:{action:'setup',request:{operation:'plan',
          expectedRevision:savedSetupPreferences.revision,clientRequestId:identity(`restore-plan:${savedSetupPreferences.revision}`)}}}));
        if(!live(captured))return;if(restoredPlan.ok)accept(restoredPlan.value);else setError(modeCopy.serviceFailed);
      }
      // An explicit Skip remains the user's decision even when the initial
      // read-only scan has not returned its saved CAS revision yet.
      if(skipRequested.current&&live(captured)){
        const saved=answers.find(answer=>answer.ok&&'operation'in answer.value&&'skipAvailable'in answer.value&&answer.value.preferences);
        if(saved?.ok&&'operation'in saved.value&&'skipAvailable'in saved.value&&saved.value.preferences){const prefs=saved.value.preferences;
          const response=await client.request({schemaVersion:1,operation:'localAi',scope:scoped,payload:{action:'setup',request:{operation:'select',choice:{decision:'skip',expectedRevision:prefs.revision,clientRequestId:identity(`skip:${prefs.revision}`)}}}});
          if(live(captured)){if(response.ok)accept(response.value);else setError(modeCopy.serviceFailed);}}
      }
      const savedPreferences=answers.find(answer=>answer.ok&&'operation'in answer.value&&'skipAvailable'in answer.value&&answer.value.preferences);
      const savedJobs=answers.find(answer=>answer.ok&&'operation'in answer.value&&'skipAvailable'in answer.value&&Array.isArray(answer.value.jobs));
      const candidateChatId='LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0';
      if(savedPreferences?.ok&&'operation'in savedPreferences.value&&'skipAvailable'in savedPreferences.value&&savedPreferences.value.preferences?.decision==='local'
        &&savedPreferences.value.preferences.artifactIds.includes(candidateChatId)&&savedJobs?.ok&&'operation'in savedJobs.value&&'skipAvailable'in savedJobs.value){
        const restoredPlan=await client.request({schemaVersion:1,operation:'localAi',scope:scoped,payload:{action:'setup',request:{operation:'plan',
          expectedRevision:savedPreferences.value.preferences.revision,clientRequestId:identity('restore-plan:'+savedPreferences.value.preferences.revision)}}});
        if(live(captured)&&restoredPlan.ok&&'plan'in restoredPlan.value){const restoredValue=restoredPlan.value;
          if(restoredValue.plan&&savedJobs.value.jobs?.some(job=>job.state==='complete'&&job.planDigest===restoredValue.plan!.planDigest))accept(restoredValue);}
      }
      if(!skipRequested.current&&savedPreferences?.ok&&'operation'in savedPreferences.value&&'skipAvailable'in savedPreferences.value
        &&(savedPreferences.value.preferences?.decision==='undecided'||savedPreferences.value.preferences?.decision==='skip')&&live(captured)){
        setScanState('checking');
        try{
          const scanResponse=await withLocalAiScanTimeout(client.request({schemaVersion:1,operation:'localAi',scope:scoped,payload:{action:'scan'}}),SCAN_TIMEOUT_MS);
          if(!live(captured))return;
          if(!scanResponse.ok||!('scan'in scanResponse.value)){const timedOut=!scanResponse.ok&&scanResponse.error.code==='local_ai_hardware_timeout';
            setScanState(timedOut?'timeout':'failed');setError(timedOut?modeCopy.scanTimeout:modeCopy.scanFailed);return;}
          accept(scanResponse.value);scopedScanReady.current=true;setScanState('ready');
          await recommendForSimpleScan(scoped,scanResponse.value.scan.hardware.scanId,captured);
        }catch(error){if(live(captured)){const timedOut=error instanceof Error&&error.message==='local_ai_hardware_scan_timeout';setScanState(timedOut?'timeout':'failed');setError(timedOut?modeCopy.scanTimeout:modeCopy.scanFailed);}}
      }
    })();pendingLoads.current.set(requestOwner,work);
    try{await work;}catch{if(live(captured))setError(modeCopy.serviceFailed);}finally{if(pendingLoads.current.get(captured)===work)pendingLoads.current.delete(captured);if(live(captured))setBusy(false);}
  }
  useEffect(()=>{mounted.current=true;skipRequested.current=false;scopedScanReady.current=false;setSkipped(false);setBound(null);setCatalog(null);setScan(null);setInventory(null);setInventoryError('');setInventoryState('idle');setScanState('idle');setResult(null);setPreferences(null);setJobs([]);setPlan(null);setConsent(false);setConfirmed(null);setFiles([]);setIncludeChatCandidate(false);retry.current=null;
    void scanHardware();void load();return()=>{mounted.current=false;};},[key,ready]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{
    if(!scope||!jobs.some(activeJob))return;const captured=requestOwner;let active=true,polling=false;
    const timer=window.setInterval(()=>{if(polling||lock.current)return;polling=true;void client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'setup',request:{operation:'status'}}})
      .then(response=>{if(!active||!live(captured))return;if(response.ok)accept(response.value);else setError(modeCopy.serviceFailed);}).finally(()=>{polling=false;});},1000);
    return()=>{active=false;window.clearInterval(timer);};},[scope&&assistantScopeKey(scope),jobs.some(activeJob),requestOwner]);
  const fresh=Boolean(scan&&localAiScanFresh(scan.scan.hardware,now)),recommendedSelection=fileMode?files:result?.selectedArtifactIds??[];
  const chatCandidate=result?.chatQualificationCandidate??null;
  const selected=detailMode==='simple'&&!fileMode&&includeChatCandidate&&chatCandidate?.state==='ready_to_download'
    ?[...new Set([...recommendedSelection,chatCandidate.artifactId])]:recommendedSelection;
  const selectionValid=Boolean(selected.length>0&&fresh&&selected.every(id=>{const chat=id===chatCandidate?.artifactId;
    const candidate=result?.recommendations.find(item=>item.artifactId===id);
    const artifact=catalog?.artifacts.find(item=>item.artifactId===id);
    return Boolean(artifact?.manifestComplete&&(chat?chatCandidate?.state==='ready_to_download':candidate&&candidate.selectable&&candidate.support==='supported'&&candidate.allocationReady&&candidate.downloadReady));})
    &&(fileMode||result?.requestedPreset===preset));
  const inventoryMeasurement=(value:LocalAiHardwareInventory['hardware']['ramAvailableBytes'])=>`${bytes(value.value)} · ${copy[value.status==='unknown'?'unknown':value.status]}`;
  if(skipped)return <section className="local-ai-setup" aria-label={copy.title}><h2>{copy.title}</h2><p>{copy.skip}</p>{scope&&<LocalModelStore key={assistantScopeKey(scope)} scope={scope} client={client} ready={ready}/>}{detailMode==='advanced'&&<LocalAiBootstrapPane compact keepVisible={keepGlobalRouterStatusVisible}/>}
    <button type="button" disabled={busy} onClick={()=>{skipRequested.current=false;setSkipped(false);void load();}}>{modeCopy.scanRetry}</button></section>;
  const visiblePresets:readonly LocalAiPreset[]=detailMode==='simple'?['lightweight','balanced','hybrid']:localAiPresets;
  return <section className="local-ai-setup" aria-label={copy.title}><h2>{copy.title}</h2><p>{copy.noAuto}</p>
    {scope&&<LocalModelStore key={assistantScopeKey(scope)} scope={scope} client={client} ready={ready}/>}
    <div className="local-ai-mode" role="group" aria-label={copy.title}>
      <button type="button" aria-pressed={detailMode==='simple'} onClick={()=>changeMode('simple')}>{modeCopy.simple}</button>
      <button type="button" aria-pressed={detailMode==='advanced'} onClick={()=>changeMode('advanced')}>{modeCopy.advanced}</button>
    </div>
    <p>{detailMode==='simple'?modeCopy.simpleHelp:modeCopy.advancedHelp}</p>
      {error&&<p role="alert" data-error-code={setupErrorCode??undefined}>{error}</p>}
    <div className="local-ai-steps">
    <section className="local-ai-step" data-state={inventory?'complete':inventoryState==='checking'?'active':'idle'} aria-labelledby="local-ai-step-check">
      <header><span>1</span><div><h3 id="local-ai-step-check">{modeCopy.stepCheck}</h3><p>{modeCopy.stepCheckHelp}</p></div></header>
      <div className="local-ai-actions"><button type="button" disabled={inventoryState==='checking'} aria-busy={inventoryState==='checking'} onClick={()=>{setError('');void scanHardware(true);}}>
        {inventoryState==='checking'?modeCopy.checking:inventoryState==='timeout'||inventoryState==='failed'?modeCopy.scanRetry:copy.scan}</button>
      <button type="button" disabled={busy} onClick={()=>{skipRequested.current=true;setSkipped(true);onSkipped?.();if(scope&&preferences&&!busy)void request({action:'setup',request:{operation:'select',choice:{decision:'skip',expectedRevision:preferences.revision,
        clientRequestId:identity(`skip:${preferences.revision}`)}}});}}>{modeCopy.noLocalAi}</button></div>
      {inventoryState==='checking'&&<p role="status" aria-live="polite">{modeCopy.checking}</p>}{inventoryError&&<p role="alert">{inventoryError}</p>}
      {inventory&&<div className="local-ai-hardware"><strong>{inventory.hardware.cpuName??copy.unknown}</strong><span>{inventory.hardware.os} · {inventory.hardware.arch}</span>
        <p role="status" aria-live="polite">{modeCopy.scanReady}</p>
        {detailMode==='advanced'&&<><p>{copy.ram}: {inventoryMeasurement(inventory.hardware.ramAvailableBytes)} · {copy.disk}: {inventoryMeasurement(inventory.hardware.diskFreeBytes)}</p>
        {inventory.hardware.adapters.map(adapter=><p key={adapter.adapterId}>{adapter.name} · {copy.gpu}: {inventoryMeasurement(adapter.processBudgetBytes)}</p>)}</>}
        <time dateTime={inventory.hardware.observedAt}>{new Date(inventory.hardware.observedAt).toLocaleString(locale)}</time>
        {inventory.probeIssues.length>0&&detailMode==='advanced'&&<details className="local-ai-advanced"><summary>{modeCopy.diagnostics}</summary><ul>{inventory.probeIssues.map(issue=><li key={issue}>{issue}</li>)}</ul></details>}
      </div>}
      {!ready&&<p role="status" className="local-ai-muted">{modeCopy.assistantNotReady}</p>}
    </section>
    <section className="local-ai-step" data-state={result?.state==='proposed'?'complete':busy?'active':'idle'} aria-labelledby="local-ai-step-recommend">
      <header><span>2</span><div><h3 id="local-ai-step-recommend">{modeCopy.stepRecommend}</h3><p>{modeCopy.stepRecommendHelp}</p></div></header>
      {result&&<article className="local-ai-model" aria-live="polite"><strong>{detailMode==='simple'&&chatCandidate?.state==='ready_to_download'?localAiChatCandidateCopy(locale).title:modeCopy.recommendedForDevice}</strong>
        <p>{detailMode==='simple'&&chatCandidate?.state==='ready_to_download'?localAiChatCandidateCopy(locale).eligible:result.automaticRecommendation?copy[result.automaticRecommendation]:result.state==='unavailable'?modeCopy.noSupportedRecommendation:copy.unknown}</p>
        {result.automaticRecommendation==='lightweight'&&<p>{modeCopy.lightweightHelp}</p>}{result.automaticRecommendation==='balanced'&&<p>{modeCopy.balancedHelp}</p>}{result.automaticRecommendation==='hybrid'&&<p>{modeCopy.hybridHelp}</p>}
        {detailMode==='advanced'&&result.recommendations.filter(item=>result.selectedArtifactIds.includes(item.artifactId)).map(item=>{const artifact=catalog?.artifacts.find(row=>row.artifactId===item.artifactId);return <p key={`${item.artifactId}:${item.role}`}>{artifact?.modelId??item.artifactId} · {item.role==='chat'?localAiChatCandidateCopy(locale).title:copy[item.role]} · {item.downloadBytes===null?copy.unknown:bytes(item.downloadBytes)}</p>;})}
        {(detailMode==='advanced'||chatCandidate?.state!=='ready_to_download')&&result.reasonCodes.slice(0,2).map(code=><p key={code}>{localAiReason(locale,code)}</p>)}
        {detailMode==='simple'&&chatCandidate&&<article className="local-ai-model" data-local-ai-chat-candidate={chatCandidate.state}>
          {chatCandidate.state==='ready_to_download'?<><p>{localAiChatCandidateCopy(locale).eligible}</p>
            {!includeChatCandidate&&<button type="button" disabled={busy||!preferences} onClick={()=>{setIncludeChatCandidate(true);void beginSimpleSetup(true);}}>{localAiChatCandidateCopy(locale).setup}</button>}
          </>:<p>{localAiChatCandidateCopy(locale).blocked}</p>}
        </article>}
      </article>}
      {!ready&&<p role="status" className="local-ai-muted">{modeCopy.recommendationWaiting}</p>}
      {ready&&!result&&scanState!=='checking'&&<p role="status" className="local-ai-muted">{modeCopy.recommendationWaiting}</p>}
    </section>
    <section className="local-ai-step" data-state={plan?(jobs.some(job=>job.planDigest===plan.planDigest&&job.state==='complete')?'complete':'active'):'idle'} aria-labelledby="local-ai-step-setup">
      <header><span>3</span><div><h3 id="local-ai-step-setup">{modeCopy.stepSetup}</h3><p>{modeCopy.stepSetupHelp}</p></div></header>
      {!ready&&<p role="status" className="local-ai-muted">{modeCopy.assistantNotReady}</p>}
      <p role="status" className="local-ai-muted">{copy.filesOnly}</p>
      {detailMode==='advanced'&&<LocalAiBootstrapPane compact keepVisible={keepGlobalRouterStatusVisible}/>}
    {scope&&catalog&&simpleLocalAiActionsAvailable(detailMode,result?.state??null,selectionValid,Boolean(preferences))&&<fieldset disabled={busy}><legend>{copy.title}</legend>
      {detailMode==='advanced'&&<details className="local-ai-advanced"><summary>{modeCopy.modelDetails}</summary><div className="local-ai-presets">{visiblePresets.map(value=><label key={value}><input type="radio" name={`local-ai-preset-${key}`} checked={preset===value} onChange={()=>{setPreset(value);setResult(null);}}/>
        <span><strong>{copy[value]}</strong></span></label>)}</div>
      {preset==='hybrid'&&<p>{copy.cloud}</p>}</details>}
      {detailMode==='advanced'&&<details className="local-ai-advanced"><summary>{modeCopy.resourceDetails}</summary><div className="local-ai-inputs"><label>{copy.context}<input type="number" min={1} max={1048576} value={context} onChange={event=>{setContext(Number(event.target.value));setResult(null);}}/></label>
        <label>{copy.parallel}<input type="number" min={1} max={32} value={parallel} onChange={event=>{setParallel(Number(event.target.value));setResult(null);}}/></label></div>
      <details><summary>{copy.roles}</summary>{localAiRoles.map(role=><label className="local-ai-role" key={role}><input type="checkbox" checked={roles.includes(role)} onChange={()=>{setRoles(values=>values.includes(role)?values.filter(value=>value!==role):[...values,role]);setResult(null);}}/>
        <span>{copy[role]}</span><input aria-label={`${copy[role]} ${copy.context}`} type="number" min={1} max={1048576} value={contexts[role]} onChange={event=>{setContexts(values=>({...values,[role]:Number(event.target.value)}));setResult(null);}}/></label>)}</details></details>}
      {detailMode==='advanced'&&<button type="button" disabled={!fresh||context<1||parallel<1||Object.values(contexts).some(value=>value<1)} onClick={()=>{if(scan)void request(selection(scan.scan.hardware.scanId));}}>{copy.recommend}</button>}
        {result&&detailMode==='advanced'&&<details className="local-ai-advanced"><summary>{modeCopy.recommendedForDevice}</summary><p role="status">{copy.automatic}: {result.automaticRecommendation?copy[result.automaticRecommendation]:copy.unknown}</p>
        {result.reasonCodes.map(code=><p key={code}>{localAiReason(locale,code)}</p>)}
        {detailMode==='advanced'&&result.recommendations.map(item=><article className="local-ai-model" key={`${item.artifactId}:${item.role}`}>
          <label><input type="checkbox" checked={result.selectedArtifactIds.includes(item.artifactId)} disabled={!item.selectable||item.support==='unsupported'}
            onChange={()=>setResult(value=>value?{...value,selectedArtifactIds:value.selectedArtifactIds.includes(item.artifactId)?value.selectedArtifactIds.filter(id=>id!==item.artifactId):[...value.selectedArtifactIds,item.artifactId]}:null)}/>
            <strong>{item.artifactId}</strong></label><p>{item.role==='chat'?localAiChatCandidateCopy(locale).title:copy[item.role]} · {copy[item.support==='unknown'?'unknown':item.support]} · {copy[item.suitability]}</p>
          <p>{copy.ram}: {bytes(item.peakRamBytes)} · {copy.gpu}: {bytes(item.peakGpuBytes)}</p>
          <ul>{item.reasonCodes.map(code=><li key={code}>{localAiReason(locale,code)}</li>)}</ul>
        </article>)}</details>}
      {detailMode==='advanced'&&<details><summary>{copy.review}</summary><p>{copy.filesOnly}</p><label><input type="checkbox" checked={fileMode} onChange={event=>setFileMode(event.target.checked)}/>{copy.review}</label>
        {fileMode&&catalog?.artifacts.map(artifact=><label className="local-ai-file" key={artifact.artifactId}><input type="checkbox" disabled={!artifact.manifestComplete} checked={files.includes(artifact.artifactId)}
          onChange={()=>setFiles(ids=>ids.includes(artifact.artifactId)?ids.filter(id=>id!==artifact.artifactId):[...ids,artifact.artifactId])}/><span>{artifact.modelId} · {artifact.quantization??artifact.format}{!artifact.manifestComplete&&` · ${copy.unsupported}`}</span></label>)}</details>}
      {detailMode==='advanced'?<button type="button" disabled={!selectionValid||!preferences} onClick={()=>{if(preferences)void request({action:'setup',request:{operation:'select',choice:{decision:'local',preset:fileMode?'custom':preset,artifactIds:selected,
        expectedRevision:preferences.revision,clientRequestId:identity(`select:${preferences.revision}:${preset}:${JSON.stringify(selected)}`)}}});}}>{copy.select}</button>
      :includeChatCandidate&&chatCandidate?.state==='ready_to_download'?<p role="status">{copy.review}</p>
      :<button type="button" disabled={!selectionValid||!preferences||result?.state!=='proposed'} onClick={()=>void beginSimpleSetup(false)}>{copy.select}</button>}
    </fieldset>}
    {detailMode==='simple'&&chatCandidate?.state!=='ready_to_download'&&!simpleLocalAiActionsAvailable(detailMode,result?.state??null,selectionValid,Boolean(preferences))&&<p role="status">
      {!ready?modeCopy.assistantNotReady:busy?modeCopy.checking:result?.state==='proposed'&&!selectionValid?copy.fresh:modeCopy.noSupportedRecommendation}
    </p>}
    {preferences&&detailMode==='advanced'&&<section><p>{copy.preferences}: {preferences.decision==='skip'?copy.skip:preferences.preset?copy[preferences.preset]:copy.unknown}</p>
      {preferences.decision==='local'&&preferences.artifactIds.length>0&&<button type="button" disabled={busy} onClick={()=>{void request({action:'setup',request:{operation:'plan',expectedRevision:preferences.revision,clientRequestId:identity(`plan:${preferences.revision}`)}});}}>{copy.review}</button>}</section>}
    {(detailMode==='advanced'||detailMode==='simple')&&plan&&<section className="local-ai-plan"><h3>{copy.review} · {bytes(plan.totalBytes)}</h3><p>{copy.filesOnly}</p>
      {plan.artifacts.map(artifact=><article className="local-ai-model" key={artifact.artifactId}><strong>{artifact.modelId}</strong>
        {detailMode==='advanced'&&<><p>{artifact.revision}</p>{artifact.files.map(file=><p key={file.relativePath}><span>{file.relativePath} · {bytes(file.bytes)}</span><code>{file.sha256}</code></p>)}</>}
        {artifact.licenseRef&&<button type="button" onClick={()=>{if(artifact.licenseRef)void window.lastbrowser.system.openExternal(artifact.licenseRef);}}>{copy.license}</button>}</article>)}
      <label className="local-ai-file"><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/>{copy.consent}
        {plan.artifacts.some(artifact=>artifact.artifactId==='LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0')&&<> {localAiChatCandidateCopy(locale).consent}</>}</label>
      {detailMode==='simple'?<button type="button" disabled={busy||!consent||confirmed===plan.planDigest} onClick={()=>void confirmAndStartSimple()}>{copy.start}</button>:<><button type="button" disabled={busy||!consent||confirmed===plan.planDigest} onClick={()=>{void request({action:'setup',request:{operation:'confirm',planDigest:plan.planDigest,
        licenseDigests:[...new Set(plan.artifacts.flatMap(artifact=>artifact.licenseDigest?[artifact.licenseDigest]:[]))],clientRequestId:identity(`confirm:${plan.planDigest}`)}});}}>{copy.confirm}</button>
      <button type="button" disabled={busy||confirmed!==plan.planDigest||!consent} onClick={()=>{void request({action:'setup',request:{operation:'start',planDigest:plan.planDigest,clientRequestId:identity(`start:${plan.planDigest}`)}});}}>{copy.start}</button></>}
    </section>}
    {!!jobs.length&&<section><button type="button" disabled={busy} onClick={()=>{void request({action:'setup',request:{operation:'status'}});}}>{copy.refresh}</button>
      {jobs.map(job=><article className="local-ai-model" key={job.jobId} data-local-ai-job={job.jobId}><strong>{copy[job.state]}</strong><time dateTime={job.updatedAt}>{new Date(job.updatedAt).toLocaleString(locale)}</time>
        <p>{copy.downloaded}: {bytes(job.downloadedBytes)} / {bytes(job.totalBytes)} · {copy.verified}: {bytes(job.verifiedBytes)}</p><p>{copy.filesOnly}</p>
        {activeJob(job)&&<button type="button" disabled={busy||job.state==='stopping'} onClick={()=>{void request({action:'setup',request:{operation:'cancel',jobId:job.jobId,clientRequestId:identity(`cancel:${job.jobId}`)}});}}>{copy.cancel}</button>}
        {['cancelled','interrupted','failed'].includes(job.state)&&<button type="button" disabled={busy} onClick={()=>{void request({action:'setup',request:{operation:'start',planDigest:job.planDigest,clientRequestId:identity(`restart:${job.jobId}:${job.revision}`)}});}}>{copy.start}</button>}
      </article>)}</section>}
    {detailMode==='simple'&&scope&&plan&&plan.artifacts.some(artifact=>artifact.artifactId==='LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0')
      &&<LocalAiChatQualification key={assistantScopeKey(scope)+':'+plan.planDigest} scope={scope} client={client} planDigest={plan.planDigest} ready={ready}
        complete={jobs.some(job=>job.planDigest===plan.planDigest&&job.state==='complete')}/>}
    {detailMode==='advanced'&&scope&&catalog&&<LocalAiRuntimeControls key={assistantScopeKey(scope)} scope={scope} client={client} catalog={catalog} jobs={jobs} ready={ready} selectionRevision={preferences?.revision} onScan={value=>setScan(value)}/>}
    {detailMode==='advanced'&&scope&&plan&&confirmed===plan.planDigest&&<LocalAiRoleBindings key={`${assistantScopeKey(scope)}:${plan.planDigest}`} scope={scope} planDigest={plan.planDigest} client={client}/>}
    </section>
    </div>
  </section>;
}
