import { sameAssistantScope,type IndependentScope } from './independent-contracts.js';
// Keep the public purpose contract identical to the installed Main broker.
export type LocalAiRuntimeRequest=Readonly<import('../main/local-ai-controller.js').LocalAiRuntimeRequest>;
export type LocalAiRuntimeReview=import('../main/local-ai-controller.js').LocalAiRuntimeReview;
export type LocalAiRuntimeHandle=import('../main/local-ai-controller.js').LocalAiRuntimeHandle;
export type LocalAiRuntimeBenchmark=import('../main/local-ai-controller.js').LocalAiRuntimeBenchmark;
export type LocalAiRuntimeSetupManifest=import('../main/local-ai-controller.js').LocalAiRuntimeSetupManifest;
export type LocalAiRuntimeResponse=import('../main/local-ai-controller.js').LocalAiRuntimeResponse;
export type LocalAiRuntimePending=Readonly<{purposeDigest:string;clientRequestId:string;artifactId:string;role:LocalAiRuntimeReview['role'];expiresAt:string}>;
const roles=['encoder','retrieve','embed','extract','agent','chat','vision'];
const role=(value:unknown):value is LocalAiRuntimeReview['role']=>typeof value==='string'&&roles.includes(value);
const ref=(value:unknown):value is string=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=512&&!/[\x00-\x1f]/.test(value);
const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const integer=(value:unknown):value is number=>number(value)&&Number.isSafeInteger(value);
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value);
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f\d]{64}$/.test(value);
const time=(value:unknown):value is string=>ref(value)&&Number.isFinite(Date.parse(value));
function isIndependentRecord(value:unknown):value is Record<string,any>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function isIndependentScope(value:unknown):value is IndependentScope{return isIndependentRecord(value)&&uuid(value.backendProfileId)&&uuid(value.spaceId)
  &&typeof value.browserProfileId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value.browserProfileId);}
const keys=(value:Record<string,unknown>,allowed:readonly string[])=>Object.keys(value).every(key=>allowed.includes(key));
const sameId=(left:string,right:string)=>left.replaceAll('-','').toLowerCase()===right.replaceAll('-','').toLowerCase();
export function isLocalAiRuntimeSetupManifest(value:unknown):value is LocalAiRuntimeSetupManifest{
  if(!isIndependentRecord(value)||!keys(value,['schemaVersion','runtimeBuildRef','noticeSummary','available','executionUnavailable','skipAvailable','existingProviderAvailable','reasonCode'])
    ||value.schemaVersion!==1||!ref(value.runtimeBuildRef)||value.available!==false||value.executionUnavailable!==true||value.skipAvailable!==true||value.existingProviderAvailable!==true||!ref(value.reasonCode))return false;
  if(value.noticeSummary===null)return true;const summary=value.noticeSummary;
  if(!isIndependentRecord(summary)||!keys(summary,['schemaVersion','runtimeBuildRef','sourceBundleVerified','verifiedPayloadCount','components','licenseClosureVerified','msvcDependencyClosureVerified','executionUnavailable','missingPrerequisites'])
    ||summary.schemaVersion!==1||summary.runtimeBuildRef!==value.runtimeBuildRef||typeof summary.sourceBundleVerified!=='boolean'||!integer(summary.verifiedPayloadCount)||summary.verifiedPayloadCount>128
    ||summary.licenseClosureVerified!==false||summary.msvcDependencyClosureVerified!==false||summary.executionUnavailable!==true
    ||!Array.isArray(summary.missingPrerequisites)||summary.missingPrerequisites.length>32||!summary.missingPrerequisites.every(ref)
    ||!Array.isArray(summary.components)||summary.components.length>32)return false;
  let totalNoticeBytes=0;
  const pinnedSourceUrl=(url:unknown)=>typeof url==='string'&&(
    /^https:\/\/github\.com\/ggml-org\/llama\.cpp\/releases\/tag\/[A-Za-z0-9._-]+$/.test(url)
    ||/^https:\/\/github\.com\/ggml-org\/llama\.cpp\/blob\/9bf55f4a3677af697d914d959eaa70f93cfdc494\/(?:LICENSE|vendor\/nlohmann\/json\.hpp|vendor\/cpp-httplib\/LICENSE)$/.test(url));
  const validComponents=summary.components.every(item=>{
    if(!isIndependentRecord(item)||!keys(item,['name','licenseLabel','noticeId','sourceUrl','noticeText'])||!ref(item.name)||!ref(item.licenseLabel)||!ref(item.noticeId)
      ||!(item.sourceUrl===null||pinnedSourceUrl(item.sourceUrl)))return false;
    if(item.noticeText===undefined)return true; // Older DTOs remain readable without full text.
    if(typeof item.noticeText!=='string'||!item.noticeText||item.noticeText.includes('\u0000'))return false;
    const bytes=new TextEncoder().encode(item.noticeText).length;
    totalNoticeBytes+=bytes;
    return bytes<=65536&&totalNoticeBytes<=262144;
  });
  return validComponents&&new Set(summary.components.map(item=>item.noticeId)).size===summary.components.length;
}
export function isLocalAiRuntimeRequest(value:unknown):value is LocalAiRuntimeRequest{
  if(!isIndependentRecord(value))return false;
  if(value.operation==='inspect'||value.operation==='capability')return keys(value,['operation']);
  if(!uuid(value.clientRequestId))return false;
  if(value.operation==='review')return keys(value,['operation','artifactId','role','clientRequestId'])&&ref(value.artifactId)&&role(value.role);
  if(value.operation==='bootstrap'||value.operation==='receipt')return keys(value,['operation','purposeDigest','clientRequestId'])&&sha(value.purposeDigest);
  return value.operation==='unload'&&keys(value,['operation','handleId','clientRequestId'])&&uuid(value.handleId);
}
export function isLocalAiRuntimeResponse(value:unknown):value is LocalAiRuntimeResponse{
  if(!isIndependentRecord(value)||value.schemaVersion!==1||!isIndependentScope(value.scope)||!['inspect','capability','review','bootstrap','receipt','unload'].includes(String(value.operation)))return false;
  const envelope=['schemaVersion','scope','operation'];
  if(value.operation==='capability'){
    const fields=['artifactId','artifactRevision','profileRevision','planDigest','adapterRef','runtimeBuildRef','hardwareScanId','qualityEvidenceRef','memoryEvidenceRef'];
    if(!keys(value,[...envelope,'state','reasonCode','capabilities',...fields,'qualityVerified','contextTokens','maxOutputTokens','parallelRequests','maxRamBytes','maxSeconds','releaseRedistributionVerified'])
      ||!['ready','unavailable'].includes(String(value.state))||!(value.reasonCode===null||ref(value.reasonCode))||!Array.isArray(value.capabilities)
      ||!value.capabilities.every(item=>['local_short_chat','deterministic_auto_short_chat'].includes(String(item)))
      ||new Set(value.capabilities).size!==value.capabilities.length)return false;
    if(value.state==='unavailable')return ref(value.reasonCode)&&value.capabilities.length===0&&fields.every(field=>value[field]===null)
      &&value.qualityVerified===false&&value.contextTokens===null&&value.maxOutputTokens===null&&value.parallelRequests===null
      &&value.maxRamBytes===null&&value.maxSeconds===null&&value.releaseRedistributionVerified===null;
    return value.reasonCode===null&&value.capabilities.length===2&&value.capabilities.includes('local_short_chat')&&value.capabilities.includes('deterministic_auto_short_chat')
      &&value.artifactId==='LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0'&&value.artifactRevision==='9969000761ce34de907bf20017cbfc3d52d6eaf9'
      &&fields.every(field=>ref(value[field]))&&value.qualityVerified===true&&value.contextTokens===1024&&value.maxOutputTokens===48
      &&value.parallelRequests===1&&value.maxRamBytes===805306368&&value.maxSeconds===25&&typeof value.releaseRedistributionVerified==='boolean';
  }
  if(value.setupManifest!==undefined&&(value.operation!=='inspect'||!isLocalAiRuntimeSetupManifest(value.setupManifest)))return false;
  if(value.operation==='receipt'&&value.state!=='complete')return keys(value,[...envelope,'state','clientRequestId','purposeDigest','available','executionUnavailable','reasonCode'])
    &&['unknown','running','interrupted','failed'].includes(String(value.state))&&uuid(value.clientRequestId)&&sha(value.purposeDigest)&&value.available===false
    &&(value.state==='unknown'?value.executionUnavailable===undefined:value.executionUnavailable===true)
    &&(value.reasonCode===undefined||ref(value.reasonCode));
  if(value.available===false&&value.executionUnavailable===true){
    if(!ref(value.reasonCode)||!keys(value,[...envelope,'available','executionUnavailable','reasonCode','handles','setupManifest','state','clientRequestId','purposeDigest']))return false;
    if(value.operation==='inspect')return Array.isArray(value.handles)&&value.handles.length===0;
    if(value.operation==='bootstrap')return ['running','interrupted','failed'].includes(String(value.state))&&uuid(value.clientRequestId)&&sha(value.purposeDigest);
    return value.state===undefined&&value.clientRequestId===undefined&&value.purposeDigest===undefined;
  }
  if(value.operation==='inspect')return keys(value,[...envelope,'handles','setupManifest'])&&Array.isArray(value.handles)&&value.handles.length<=64&&value.handles.every(handle=>
    isIndependentRecord(handle)&&keys(handle,['handleId','artifactId','artifactRevision','role','state','revision','available','synthetic','reasonCode','coldStartMs'])
    &&uuid(handle.handleId)&&ref(handle.artifactId)&&ref(handle.artifactRevision)&&roles.includes(String(handle.role))
    &&['uninstalled','downloaded','verified','loading','ready','evicting','stopped','failed'].includes(String(handle.state))&&integer(handle.revision)&&handle.revision>=1
    &&typeof handle.available==='boolean'&&typeof handle.synthetic==='boolean'&&(!handle.synthetic||handle.available===false)
    &&(handle.reasonCode===null||ref(handle.reasonCode))&&(handle.coldStartMs===null||number(handle.coldStartMs)))
    &&new Set(value.handles.map(handle=>handle.handleId.replaceAll('-','').toLowerCase())).size===value.handles.length;
  if(value.operation==='review')return keys(value,[...envelope,'purposeDigest','expiresAt','artifactId','artifactRevision','role','contextTokens','parallelRequests','budgetSeconds','ramLimitBytes','runtimeBuildRef','available','operationVerified'])
    &&sha(value.purposeDigest)&&time(value.expiresAt)&&ref(value.artifactId)&&ref(value.artifactRevision)&&roles.includes(String(value.role))
    &&integer(value.contextTokens)&&value.contextTokens>=1&&value.contextTokens<=4096&&value.parallelRequests===1
    &&number(value.budgetSeconds)&&value.budgetSeconds>0&&value.budgetSeconds<=30&&integer(value.ramLimitBytes)&&value.ramLimitBytes>0
    &&ref(value.runtimeBuildRef)&&value.available===false&&value.operationVerified===false;
  if(value.operation==='unload')return keys(value,[...envelope,'handleId','stopped'])&&uuid(value.handleId)&&typeof value.stopped==='boolean';
  return keys(value,[...envelope,'state','clientRequestId','purposeDigest','available','evidenceRef','observedAt','coldStartMs','p95Ms','samples','peakObservedResidentBytes',
    'operationShapeVerified','synthetic','suite','operationVerified','qualityPassed','sloPassed','recommendationEligible','contextCapacityVerified','memoryEnvelopeVerified','productChatQualified'])
    &&value.state==='complete'&&uuid(value.clientRequestId)&&sha(value.purposeDigest)&&value.available===false&&ref(value.evidenceRef)&&time(value.observedAt)
    &&number(value.coldStartMs)&&number(value.p95Ms)&&integer(value.samples)&&integer(value.peakObservedResidentBytes)&&value.peakObservedResidentBytes>0&&value.operationShapeVerified===true
    &&typeof value.synthetic==='boolean'&&(value.suite===null||ref(value.suite))&&typeof value.productChatQualified==='boolean'
    &&(value.productChatQualified===true
      ?value.suite==='chat-quality-v1'&&value.operationVerified===true&&value.synthetic===false&&value.qualityPassed===true&&value.sloPassed===true
        &&value.samples===3&&value.recommendationEligible===false&&value.contextCapacityVerified===true&&value.memoryEnvelopeVerified===true
      :value.operationVerified===false&&value.qualityPassed===null&&value.sloPassed===null&&value.recommendationEligible===false
        &&value.samples===1&&value.contextCapacityVerified===false&&value.memoryEnvelopeVerified===false);
}
export function runtimeResponseMatches(value:LocalAiRuntimeResponse,request:LocalAiRuntimeRequest,scope:IndependentScope):boolean{
  if(value.operation!==request.operation||!sameAssistantScope(value.scope,scope))return false;
  if(request.operation==='review'&&'artifactId'in value)return value.artifactId===request.artifactId&&'role'in value&&value.role===request.role;
  if(request.operation==='bootstrap'||request.operation==='receipt')return 'clientRequestId'in value&&typeof value.clientRequestId==='string'&&sameId(value.clientRequestId,request.clientRequestId)
    &&'purposeDigest'in value&&value.purposeDigest===request.purposeDigest;
  if(request.operation==='unload'&&'handleId'in value)return sameId(value.handleId,request.handleId);
  return true;
}
export const localAiRuntimePendingKey=(scope:IndependentScope)=>`lastbrowser.localAiRuntime:${scope.backendProfileId}:${scope.spaceId}:${scope.browserProfileId}`;
export const localAiRuntimeReceiptKey=(scope:IndependentScope)=>`${localAiRuntimePendingKey(scope)}:lastReceipt`;
export function readLocalAiRuntimePending(scope:IndependentScope,storage:Pick<Storage,'getItem'>,kind:'pending'|'receipt'='pending'):LocalAiRuntimePending|null{
  try{const raw=storage.getItem(kind==='pending'?localAiRuntimePendingKey(scope):localAiRuntimeReceiptKey(scope));if(!raw)return null;const value:unknown=JSON.parse(raw);
    return isIndependentRecord(value)&&keys(value,['purposeDigest','clientRequestId','artifactId','role','expiresAt'])&&sha(value.purposeDigest)&&uuid(value.clientRequestId)
      &&ref(value.artifactId)&&role(value.role)&&time(value.expiresAt)?{purposeDigest:value.purposeDigest,clientRequestId:value.clientRequestId,artifactId:value.artifactId,role:value.role,expiresAt:value.expiresAt}:null;
  }catch{return null;}
}
