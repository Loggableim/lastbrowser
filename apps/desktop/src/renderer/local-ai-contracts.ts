import { sameAssistantScope,type IndependentScope } from './independent-contracts.js';
import { isModelStoreResponse,type ModelStoreResponse,type ModelStoreRequest } from './model-store-contracts.js';
import { isLocalAiRuntimeResponse,type LocalAiRuntimeResponse,type LocalAiRuntimeRequest } from './local-ai-runtime-contracts.js';
import { isLocalRoleResponse,type LocalRoleRequest,type LocalRoleResponse } from '../main/local-ai-role-profile.js';
export type LocalAiPreset='lightweight'|'balanced'|'max_local'|'hybrid'|'custom';
export type LocalAiRole='encoder'|'retrieve'|'embed'|'extract'|'agent'|'vision';
export type LocalAiRecommendationRole=LocalAiRole|'chat';
export type LocalAiArtifactRole=LocalAiRole|'chat';
export const localAiPresets:readonly LocalAiPreset[]=['lightweight','balanced','max_local','hybrid','custom'];
export const localAiRoles:readonly LocalAiRole[]=['encoder','retrieve','embed','extract','agent','vision'];
const localAiArtifactRoles:readonly LocalAiArtifactRole[]=[...localAiRoles,'chat'];
const localAiRecommendationRoles:readonly LocalAiRecommendationRole[]=[...localAiRoles,'chat'];
export type LocalAiMeasurement=Readonly<{value:number|null;status:'measured'|'estimated'|'unknown'|'unavailable';source:string;observedAt:string}>;
export type LocalAiHardware=Readonly<{schemaVersion:1;scanId:string;observedAt:string;os:string;arch:string;cpuName:string|null;
  physicalCores:number|null;logicalCores:number|null;cpuFeatures:readonly string[];cpuFeaturesVerified:boolean;
  ramTotalBytes:LocalAiMeasurement;ramAvailableBytes:LocalAiMeasurement;diskFreeBytes:LocalAiMeasurement;
  adapters:readonly Readonly<{adapterId:string;name:string;vendor:string|null;sharedSystemMemory:boolean|null;memoryPoolId:string;
    dedicatedBytes:LocalAiMeasurement;processBudgetBytes:LocalAiMeasurement;processUsageBytes:LocalAiMeasurement}>[]}>;
export type LocalAiHardwareInventory=Readonly<{schemaVersion:1;hardware:LocalAiHardware;gpuFeatureStatus:Readonly<Record<string,string>>;probeIssues:readonly string[]}>;
export type LocalAiArtifact=Readonly<{artifactId:string;provider:string;modelId:string;revision:string|null;format:'gguf'|'onnx'|'safetensors';
  quantization:string|null;architecture:string|null;roles:readonly LocalAiArtifactRole[];manifestComplete:boolean;licenseRef:string|null;licenseDigest:string|null;
  contextLimit:number|null;requiresTaskHead:boolean;taskHeadRef:string|null;requiresProjector:boolean;
  files:readonly Readonly<{relativePath:string;bytes:number|null;sha256:string|null;sourceUrl:string;kind:'weights'|'projector'|'tokenizer'|'head'|'license'|'config'}>[]}>;
export type LocalAiCatalog=Readonly<{revision:string;observedAt:string;artifacts:readonly LocalAiArtifact[]}>;
export type LocalAiRecommendation=Readonly<{artifactId:string;role:LocalAiRecommendationRole;contextTokens:number;parallelRequests:number;qualityTier:'lite'|'balanced'|'max'|null;
  runtimeBuildRef:string|null;placement:'cpu'|'gpu'|null;adapterId:string|null;support:'supported'|'unsupported'|'unknown';
  suitability:'recommended'|'usable'|'slow'|'insufficient_resources'|'unmeasured';selectable:boolean;allocationReady:boolean;downloadReady:boolean;
  downloadBytes:number|null;peakRamBytes:number|null;peakGpuBytes:number|null;reasonCodes:readonly string[];evidenceRefs:readonly string[]}>;
export type LocalAiRecommendationResult=Readonly<{schemaVersion:1;hardwareScanId:string;catalogRevision:string;requestedPreset:LocalAiPreset;
  automaticRecommendation:LocalAiPreset|null;state:'proposed'|'needs_diagnostics'|'unavailable';recommendations:readonly LocalAiRecommendation[];
  selectedArtifactIds:readonly string[];maxSimultaneousModels:number;cloudAllowed:boolean;reasonCodes:readonly string[];chatQualificationCandidate?:LocalAiChatQualificationCandidate|null}>;
export type LocalAiChatQualificationCandidate=Readonly<{artifactId:string;artifactRevision:string;
  state:'ready_to_download'|'unsupported_platform'|'disk_measurement_required'|'disk_space_insufficient'|'ram_measurement_required'|'ram_reserve_insufficient';
  contextTokens:1024;maxOutputTokens:48;parallelRequests:1;maxRamBytes:805306368;maxSeconds:25;downloadBytes:number;requiredDiskBytes:number;
  availableDiskBytes:number|null;availableRamBytes:number|null;reasonCodes:readonly string[];qualifiedForDevice:false;productAvailable:false;executionUnavailable:true}>;
export type LocalAiPreferences=Readonly<{schemaVersion:1;scope:IndependentScope;revision:number;decision:'undecided'|'local'|'skip';
  preset:LocalAiPreset|null;artifactIds:readonly string[];updatedAt:string|null}>;
export type LocalAiPlan=Readonly<{schemaVersion:1;scope:IndependentScope;planId:string;setupRevision:number;catalogRevision:string;
  artifacts:readonly LocalAiArtifact[];totalBytes:number;createdAt:string;executionUnavailable:true;planDigest:string}>;
export type LocalAiConsent=Readonly<{scope:IndependentScope;planDigest:string;licenseDigests:readonly string[];clientRequestId:string;confirmedAt:string;authority:'private_human_action'}>;
export type LocalAiJob=Readonly<{schemaVersion:1;scope:IndependentScope;jobId:string;planDigest:string;revision:number;
  state:'pending'|'running'|'downloading'|'verifying'|'stopping'|'complete'|'cancelled'|'interrupted'|'failed';totalBytes:number;
  downloadedBytes:number|null;verifiedBytes:number|null;createdAt:string;updatedAt:string;errorCode:string|null;executionUnavailable:true}>;
export type LocalAiSetupRequest=Readonly<{operation:'get'}>|Readonly<{operation:'select';choice:Readonly<{expectedRevision:number;clientRequestId:string;
  decision:'local'|'skip';preset?:LocalAiPreset;artifactIds?:readonly string[]}>}>|Readonly<{operation:'plan';expectedRevision:number;clientRequestId:string}>
  |Readonly<{operation:'confirm';planDigest:string;licenseDigests:readonly string[];clientRequestId:string}>
  |Readonly<{operation:'start';planDigest:string;clientRequestId:string}>|Readonly<{operation:'cancel';jobId:string;clientRequestId:string}>
  |Readonly<{operation:'status';jobId?:string|null}>;
export type LocalAiPayload=Readonly<{action:'catalog'|'scan'}>|Readonly<{action:'recommend';scanId:string;preset:LocalAiPreset;contextTokens:number;
  parallelRequests?:number;maxParallelModels?:number;optInRoles?:readonly LocalAiRole[];roleBudgets?:readonly Readonly<{role:LocalAiRole;contextTokens:number;parallelRequests:number}>[];
  customArtifactIds?:readonly string[];maxRamBytes?:number|null;maxGpuBytes?:number|null}>|Readonly<{action:'setup';request:LocalAiSetupRequest}>|Readonly<{action:'runtime';request:LocalAiRuntimeRequest}>|Readonly<{action:'roleProfile';request:LocalRoleRequest}>|Readonly<{action:'store';request:ModelStoreRequest}>;
type Envelope=Readonly<{schemaVersion:1;scope:IndependentScope}>;
export type LocalAiResponse=Envelope&(Readonly<{catalog:LocalAiCatalog}>|Readonly<{scan:Readonly<{schemaVersion:1;scope:IndependentScope;hardware:LocalAiHardware;gpuFeatureStatus:Readonly<Record<string,string>>;probeIssues:readonly string[]}>;
  runtimes:readonly Readonly<{buildRef:string;state:'verified'|'detected'|'unavailable'|'unknown';managed:'in_tree'|'external';os:string;arch:string}>[];availableComputeSlots:number;skipAvailable:true;existingProviderAvailable:true}>
  |Readonly<{result:LocalAiRecommendationResult;skipAvailable:true;existingProviderAvailable:true}>
  |Readonly<{operation:LocalAiSetupRequest['operation'];skipAvailable:true;existingProviderAvailable:true;preferences?:LocalAiPreferences;plan?:LocalAiPlan;consent?:LocalAiConsent;job?:LocalAiJob;jobs?:readonly LocalAiJob[]}>
  |LocalAiRuntimeResponse|LocalRoleResponse|ModelStoreResponse);
const ref=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=4096;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value);
const boolean=(value:unknown):value is boolean=>typeof value==='boolean';
const bytes=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const positive=(value:unknown):value is number=>bytes(value)&&value>0;
const at=(value:unknown):value is string=>ref(value)&&Number.isFinite(Date.parse(value));
const nullable=(value:unknown,guard:(v:unknown)=>boolean)=>value===null||guard(value);
const strings=(value:unknown):value is readonly string[]=>Array.isArray(value)&&value.every(ref);
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f\d]{64}$/.test(value);
const options=(value:unknown,values:readonly string[])=>typeof value==='string'&&values.includes(value);
function isIndependentRecord(value:unknown):value is Record<string,any>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function isIndependentScope(value:unknown):value is IndependentScope{return isIndependentRecord(value)&&uuid(value.backendProfileId)&&uuid(value.spaceId)
  &&typeof value.browserProfileId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value.browserProfileId);}
const unique=(value:readonly string[])=>new Set(value).size===value.length;
function measurement(v:unknown):v is LocalAiMeasurement{return isIndependentRecord(v)&&nullable(v.value,bytes)&&options(v.status,['measured','estimated','unknown','unavailable'])&&ref(v.source)&&at(v.observedAt)
  &&(['unknown','unavailable'].includes(String(v.status))?v.value===null:bytes(v.value));}
function artifact(v:unknown):v is LocalAiArtifact{return isIndependentRecord(v)&&ref(v.artifactId)&&ref(v.provider)&&ref(v.modelId)&&nullable(v.revision,ref)
  &&options(v.format,['gguf','onnx','safetensors'])&&nullable(v.quantization,ref)&&nullable(v.architecture,ref)&&strings(v.roles)&&v.roles.length>0&&unique(v.roles)&&v.roles.every(role=>localAiArtifactRoles.includes(role as LocalAiArtifactRole))
  &&typeof v.manifestComplete==='boolean'&&nullable(v.licenseRef,ref)&&nullable(v.licenseDigest,sha)&&nullable(v.contextLimit,positive)
  &&typeof v.requiresTaskHead==='boolean'&&nullable(v.taskHeadRef,ref)&&typeof v.requiresProjector==='boolean'&&Array.isArray(v.files)&&v.files.every(file=>isIndependentRecord(file)
    &&ref(file.relativePath)&&!file.relativePath.startsWith('/')&&!file.relativePath.includes('..')&&!file.relativePath.includes(':')&&nullable(file.bytes,bytes)&&nullable(file.sha256,sha)
    &&ref(file.sourceUrl)&&file.sourceUrl.startsWith('https://')&&options(file.kind,['weights','projector','tokenizer','head','license','config']))
  &&(!v.manifestComplete||typeof v.revision==='string'&&/^[a-f\d]{40}$/.test(v.revision)&&sha(v.licenseDigest)&&ref(v.licenseRef)
    &&v.files.every(file=>{if(!bytes(file.bytes)||!sha(file.sha256))return false;const expected=`https://huggingface.co/${v.modelId}/resolve/${v.revision}/${file.relativePath}`;
      if(file.kind!=='license')return file.sourceUrl===expected;
      const raw=`https://huggingface.co/${v.modelId}/raw/${v.revision}/LICENSE`,blob=`https://huggingface.co/${v.modelId}/blob/${v.revision}/LICENSE`;
      return file.relativePath==='LICENSE'&&file.sha256===v.licenseDigest&&(file.sourceUrl===expected||file.sourceUrl===raw)
        &&(v.licenseRef===expected||v.licenseRef===raw||v.licenseRef===blob);})
    &&v.files.filter(file=>file.kind==='license').length===1&&v.files.some(file=>file.kind==='license'&&file.relativePath==='LICENSE'&&file.sha256===v.licenseDigest));}
function hardware(v:unknown):v is LocalAiHardware{return isIndependentRecord(v)&&v.schemaVersion===1&&ref(v.scanId)&&at(v.observedAt)&&ref(v.os)&&ref(v.arch)
  &&nullable(v.cpuName,ref)&&nullable(v.physicalCores,positive)&&nullable(v.logicalCores,positive)&&strings(v.cpuFeatures)&&typeof v.cpuFeaturesVerified==='boolean'
  &&measurement(v.ramTotalBytes)&&measurement(v.ramAvailableBytes)&&measurement(v.diskFreeBytes)&&Array.isArray(v.adapters)&&v.adapters.every(adapter=>isIndependentRecord(adapter)
    &&ref(adapter.adapterId)&&nullable(adapter.vendor,ref)&&nullable(adapter.sharedSystemMemory,boolean)&&ref(adapter.memoryPoolId)
    &&measurement(adapter.dedicatedBytes)&&measurement(adapter.processBudgetBytes)&&measurement(adapter.processUsageBytes));}
export function isLocalAiHardwareInventory(v:unknown):v is LocalAiHardwareInventory{return isIndependentRecord(v)&&Object.keys(v).every(key=>['schemaVersion','hardware','gpuFeatureStatus','probeIssues'].includes(key))
  &&v.schemaVersion===1&&hardware(v.hardware)
  &&isIndependentRecord(v.gpuFeatureStatus)&&Object.values(v.gpuFeatureStatus).every(value=>typeof value==='string')&&strings(v.probeIssues);}
function recommendation(v:unknown):v is LocalAiRecommendation{return isIndependentRecord(v)&&ref(v.artifactId)&&options(v.role,localAiRecommendationRoles)&&positive(v.contextTokens)&&positive(v.parallelRequests)
  &&nullable(v.qualityTier,value=>options(value,['lite','balanced','max']))&&nullable(v.runtimeBuildRef,ref)&&nullable(v.placement,value=>options(value,['cpu','gpu']))&&nullable(v.adapterId,ref)
  &&options(v.support,['supported','unsupported','unknown'])&&options(v.suitability,['recommended','usable','slow','insufficient_resources','unmeasured'])
  &&['selectable','allocationReady','downloadReady'].every(key=>typeof v[key]==='boolean')&&['downloadBytes','peakRamBytes','peakGpuBytes'].every(key=>nullable(v[key],bytes))
  &&strings(v.reasonCodes)&&strings(v.evidenceRefs)&&(!(v.support==='unsupported')||v.selectable===false&&v.allocationReady===false);}
function preferences(v:unknown,scope:IndependentScope):v is LocalAiPreferences{return isIndependentRecord(v)&&v.schemaVersion===1&&isIndependentScope(v.scope)&&sameAssistantScope(v.scope,scope)
  &&bytes(v.revision)&&options(v.decision,['undecided','local','skip'])&&nullable(v.preset,value=>options(value,localAiPresets))&&strings(v.artifactIds)&&unique(v.artifactIds)&&nullable(v.updatedAt,at);}
function plan(v:unknown,scope:IndependentScope):v is LocalAiPlan{return isIndependentRecord(v)&&v.schemaVersion===1&&isIndependentScope(v.scope)&&sameAssistantScope(v.scope,scope)
  &&ref(v.planId)&&positive(v.setupRevision)&&ref(v.catalogRevision)&&Array.isArray(v.artifacts)&&v.artifacts.length>0&&v.artifacts.every(artifact)&&bytes(v.totalBytes)&&at(v.createdAt)&&v.executionUnavailable===true&&sha(v.planDigest);}
function job(v:unknown,scope:IndependentScope):v is LocalAiJob{return isIndependentRecord(v)&&v.schemaVersion===1&&isIndependentScope(v.scope)&&sameAssistantScope(v.scope,scope)
  &&ref(v.jobId)&&sha(v.planDigest)&&positive(v.revision)&&options(v.state,['pending','running','downloading','verifying','stopping','complete','cancelled','interrupted','failed'])
  &&bytes(v.totalBytes)&&nullable(v.downloadedBytes,bytes)&&nullable(v.verifiedBytes,bytes)&&at(v.createdAt)&&at(v.updatedAt)&&nullable(v.errorCode,ref)&&v.executionUnavailable===true;}
export function isLocalAiResponse(v:unknown):v is LocalAiResponse{
  if(isIndependentRecord(v)&&v.kind==='role_profile')return isLocalRoleResponse(v);
  if(!isIndependentRecord(v)||v.schemaVersion!==1||!isIndependentScope(v.scope))return false;const scope=v.scope;
  if(v.kind==='model_store')return isModelStoreResponse(v);
  if(['inspect','capability','review','bootstrap','receipt','unload'].includes(String(v.operation)))return isLocalAiRuntimeResponse(v);
  if('catalog'in v)return isIndependentRecord(v.catalog)&&ref(v.catalog.revision)&&at(v.catalog.observedAt)&&Array.isArray(v.catalog.artifacts)&&v.catalog.artifacts.every(artifact)
    &&unique(v.catalog.artifacts.map(item=>item.artifactId));
  if(v.skipAvailable!==true||v.existingProviderAvailable!==true)return false;
  if('scan'in v)return isIndependentRecord(v.scan)&&v.scan.schemaVersion===1&&isIndependentScope(v.scan.scope)&&sameAssistantScope(v.scan.scope,scope)&&hardware(v.scan.hardware)
    &&isIndependentRecord(v.scan.gpuFeatureStatus)&&Object.values(v.scan.gpuFeatureStatus).every(value=>typeof value==='string')&&strings(v.scan.probeIssues)&&bytes(v.availableComputeSlots)
    &&Array.isArray(v.runtimes)&&v.runtimes.every(runtime=>isIndependentRecord(runtime)&&ref(runtime.buildRef)&&options(runtime.state,['verified','detected','unavailable','unknown'])&&options(runtime.managed,['in_tree','external'])&&ref(runtime.os)&&ref(runtime.arch));
  if('result'in v){const r=v.result;return isIndependentRecord(r)&&r.schemaVersion===1&&ref(r.hardwareScanId)&&ref(r.catalogRevision)&&options(r.requestedPreset,localAiPresets)
    &&nullable(r.automaticRecommendation,value=>options(value,localAiPresets))&&options(r.state,['proposed','needs_diagnostics','unavailable'])&&Array.isArray(r.recommendations)&&r.recommendations.every(recommendation)
    &&strings(r.selectedArtifactIds)&&unique(r.selectedArtifactIds)&&r.selectedArtifactIds.every(identity=>Array.isArray(r.recommendations)&&r.recommendations.some((item:unknown)=>recommendation(item)&&item.artifactId===identity&&item.selectable&&item.support!=='unsupported'))
    &&(r.chatQualificationCandidate===undefined||r.chatQualificationCandidate===null||isChatQualificationCandidate(r.chatQualificationCandidate))
    &&bytes(r.maxSimultaneousModels)&&typeof r.cloudAllowed==='boolean'&&strings(r.reasonCodes);}
  if(['get','select'].includes(String(v.operation)))return preferences(v.preferences,scope);
  if(v.operation==='plan')return plan(v.plan,scope);
  if(v.operation==='confirm')return isIndependentRecord(v.consent)&&isIndependentScope(v.consent.scope)&&sameAssistantScope(v.consent.scope,scope)&&sha(v.consent.planDigest)
    &&Array.isArray(v.consent.licenseDigests)&&v.consent.licenseDigests.every(sha)&&ref(v.consent.clientRequestId)&&at(v.consent.confirmedAt)&&v.consent.authority==='private_human_action';
  if(['start','cancel'].includes(String(v.operation)))return job(v.job,scope);
  return v.operation==='status'&&(job(v.job,scope)||Array.isArray(v.jobs)&&v.jobs.every(item=>job(item,scope)));
}
export function isChatQualificationCandidate(v:unknown):v is LocalAiChatQualificationCandidate{return isIndependentRecord(v)&&ref(v.artifactId)&&ref(v.artifactRevision)
  &&options(v.state,['ready_to_download','unsupported_platform','disk_measurement_required','disk_space_insufficient','ram_measurement_required','ram_reserve_insufficient'])
  &&v.contextTokens===1024&&v.maxOutputTokens===48&&v.parallelRequests===1&&v.maxRamBytes===805306368&&v.maxSeconds===25
  &&bytes(v.downloadBytes)&&bytes(v.requiredDiskBytes)&&nullable(v.availableDiskBytes,bytes)&&nullable(v.availableRamBytes,bytes)
  &&strings(v.reasonCodes)&&v.qualifiedForDevice===false&&v.productAvailable===false&&v.executionUnavailable===true;}
export function localAiScanFresh(hardware:LocalAiHardware,now=Date.now()):boolean{const age=now-Date.parse(hardware.observedAt);return age>=-2000&&age<=30000;}
