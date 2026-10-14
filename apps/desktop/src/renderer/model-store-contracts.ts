import type { IndependentScope } from './independent-contracts.js';
export type ModelStoreRequest={operation:'view'|'scan'|'stopChat'}|{operation:'install'|'importModel';modelId:string;requestId:string;licenseDigest:string}
  |{operation:'benchmark';modelId:string;requestId:string;mode:'quick'|'standard';backend?:'cpu'|'vulkan';referenceImageAssetId?:string;audioAssetId?:string}|{operation:'cancel';jobId:string}
  |{operation:'activate'|'remove';modelId:string}|{operation:'export'|'deleteHistory';receiptId:string}
  |{operation:'import';receipt:unknown}|{operation:'chat';text:string}
  |{operation:'generate';modelId:string;requestId:string;prompt:string;width:number;height:number;steps:number;seed:number;frames?:number;fps?:number;referenceImageAssetId?:string;audioAssetId?:string}
  |{operation:'readMedia';jobId:string;assetId:string}
  |{operation:'pickMediaInput';modelId:string;kind:'reference_image'|'audio_wav'}|{operation:'releaseMediaInput';assetId:string};
export type StoreMediaInput={assetId:string;name:string;mimeType:string;width?:number;height?:number;durationMs?:number};
export type StoreMediaBounds={width:{min:number;max:number;step:number};height:{min:number;max:number;step:number};
  steps:{min:number;max:number;default:number};frames?:{min:number;max:number;step:number};fps?:{min:number;max:number;default:number};requiredInputs?:Array<'reference_image'|'audio_wav'>};
export type StoreExecution={state:'browse_only'|'download_qualified'|'installed_verified'|'device_runtime_verified'|'chat_or_media_qualified';
  kind:'text'|'image'|'video';downloadAllowed:boolean;benchmarkAllowed:boolean;activateAllowed:boolean;executeAllowed:boolean;
  reasonCodes:string[];engineId?:string;backend?:'cpu'|'vulkan';availableBackends?:Array<'cpu'|'vulkan'>;media?:StoreMediaBounds};
export type StoreMediaResult={kind:'image'|'video';assets:Array<{id:string;mimeType:string;width:number;height:number;frames?:number;fps?:number}>};
export type StoreMediaReadResult={mimeType:string;dataBase64:string};
export type StoreModelCuration={modelId:string;name:string;publisher:string;category:'text'|'image'|'video';
  vramClass:string;quantization:string;estimatedVramGiB:[number,number];estimatedRamGiB:[number,number];
  estimatedDownloadGiB:[number,number];recommendedGpuGiB:number;engine:string;innovation:string;
  useCases:string[];strengths:string[];limitations:string[];license:'apache-2.0'|'mit';sourceUrl:string;priority:boolean};
export type StoreModel={id:string;name:string;publisher:string;description:string;tier:string;sourceUrl:string;revision:string|null;
  curated?:boolean;curation?:StoreModelCuration;execution?:StoreExecution;
  totalParameters:number|null;contextLimit:number|null;recommendedContext:number|null;downloadBytes:number|null;
  recommendedRamBytes:number|null;recommendedVramBytes:number|null;memoryPolicy:string;quantization:string|null;
  runtimeStatus:string;runtimeReason:string;testStatus:string;historicalEvidence:null|{contentPassed:number;strictPassed:number;tasks:number;device:string;configuration:string;transferAllowed:false;smallCpuConfirmed:false};
  licenseLabel:string;licenseText:string|null;licenseDigest:string|null;gated:boolean;installQualified:boolean;
  commercialRequired:boolean|null;tasks:string[];eligibility:{state:string;reasons:string[];allowed:boolean};
  installed:null|{artifactSha256:string;bytes:number;revision:string;verifiedAt:number};active:boolean;deviceConfirmed:boolean};
export type StoreJob={id:string;operation:string;modelId:string;state:string;mode:string;progress:number;total:number;downloadedBytes:number;error:string|null;receiptId?:string;result?:StoreMediaResult};
export type StoreReceipt={id:string;modelId:string;artifactSha256:string;suite:string;mode:string;origin:string;createdAt:number;
  coldStartMs:number;medianResponseMs:number|null;counts:Record<string,number>;sampleCount:number;state:string;
  recommendation:string;unsafeToolOrSecurityFailure:boolean;measurementLimitations:string[]};
export type StoreView={catalogRevision:string;models:StoreModel[];hardware:unknown;jobs:StoreJob[];history:StoreReceipt[];
  readOnly?:boolean;availabilityReason?:string;
  entitlement:{largeModelsAllowed:boolean;status:string;threshold:number};suite:{version:string;sha256:string;cases:number;quickCases:number;standardRepeats:number}};
export type ModelStoreResponse={schemaVersion:1;scope:IndependentScope;kind:'model_store';operation:ModelStoreRequest['operation'];store:StoreView;storeResult:unknown};
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const strings=(v:unknown)=>Array.isArray(v)&&v.every(s=>typeof s==='string');
const numberOrNull=(v:unknown)=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0;
const resourceRange=(v:unknown)=>Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=10000)&&v[0]<=v[1];
const mediaBound=(v:unknown,field:'step'|'default')=>record(v)&&[v.min,v.max,v[field]].every(n=>Number.isSafeInteger(n)&&n>0)&&v.min<=v.max;
export function isStoreExecution(v:unknown):v is StoreExecution {
  if(!record(v)||!['browse_only','download_qualified','installed_verified','device_runtime_verified','chat_or_media_qualified'].includes(v.state)
    ||!['text','image','video'].includes(v.kind)||!['downloadAllowed','benchmarkAllowed','activateAllowed','executeAllowed'].every(k=>typeof v[k]==='boolean')
    ||!strings(v.reasonCodes)||v.engineId!==undefined&&typeof v.engineId!=='string'
    ||v.backend!==undefined&&!['cpu','vulkan'].includes(v.backend)
    ||v.availableBackends!==undefined&&(!Array.isArray(v.availableBackends)||!v.availableBackends.every((b:unknown)=>b==='cpu'||b==='vulkan')))return false;
  return v.media===undefined||record(v.media)&&mediaBound(v.media.width,'step')&&mediaBound(v.media.height,'step')&&mediaBound(v.media.steps,'default')
    &&(v.media.frames===undefined||mediaBound(v.media.frames,'step'))&&(v.media.fps===undefined||mediaBound(v.media.fps,'default'))
    &&(v.media.requiredInputs===undefined||Array.isArray(v.media.requiredInputs)&&v.media.requiredInputs.every((kind:unknown)=>kind==='reference_image'||kind==='audio_wav'));
}
const isStoreMediaResult=(v:unknown)=>record(v)&&['image','video'].includes(v.kind)&&Array.isArray(v.assets)&&v.assets.length<=121
  &&v.assets.every((a:unknown)=>record(a)&&typeof a.id==='string'&&a.id.length>0&&a.id.length<=128&&a.mimeType==='image/png'
    &&Number.isSafeInteger(a.width)&&a.width>0&&a.width<=2048&&Number.isSafeInteger(a.height)&&a.height>0&&a.height<=2048
    &&(a.frames===undefined||Number.isSafeInteger(a.frames)&&a.frames>0&&a.frames<=121)
    &&(a.fps===undefined||Number.isSafeInteger(a.fps)&&a.fps>0&&a.fps<=60));
export function isStoreModelCuration(v:unknown):v is StoreModelCuration {
  if(!record(v)||!['text','image','video'].includes(v.category)||!['apache-2.0','mit'].includes(v.license)||typeof v.priority!=='boolean')return false;
  if(!['modelId','name','publisher','vramClass','quantization','engine','innovation','sourceUrl'].every(k=>typeof v[k]==='string'&&v[k].length>0&&v[k].length<=2000))return false;
  if(!['estimatedVramGiB','estimatedRamGiB','estimatedDownloadGiB'].every(k=>resourceRange(v[k]))
    ||typeof v.recommendedGpuGiB!=='number'||!Number.isFinite(v.recommendedGpuGiB)||v.recommendedGpuGiB<0||v.recommendedGpuGiB>10000)return false;
  if(!['useCases','strengths','limitations'].every(k=>strings(v[k])&&v[k].length<=30&&v[k].every((s:string)=>s.length>0&&s.length<=2000)))return false;
  try{const url=new URL(v.sourceUrl);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}
}
export function isModelStoreResponse(v:unknown):v is ModelStoreResponse {
  if(!record(v)||v.kind!=='model_store'||!record(v.store)||typeof v.operation!=='string')return false;
  const s=v.store;
  return (s.readOnly===undefined||typeof s.readOnly==='boolean')&&(s.availabilityReason===undefined||typeof s.availabilityReason==='string')
    &&typeof s.catalogRevision==='string'&&Array.isArray(s.models)&&s.models.length<=200&&s.models.every((m:unknown)=>record(m)
    &&['id','name','publisher','description','tier','sourceUrl','runtimeStatus','runtimeReason','testStatus','licenseLabel','memoryPolicy'].every(k=>typeof m[k]==='string')
    &&(m.curated===undefined||typeof m.curated==='boolean')&&(m.curation===undefined||isStoreModelCuration(m.curation)&&m.curation.modelId===m.id)
    &&(m.execution===undefined||isStoreExecution(m.execution))
    &&['totalParameters','contextLimit','recommendedContext','downloadBytes','recommendedRamBytes','recommendedVramBytes'].every(k=>numberOrNull(m[k]))
    &&(m.licenseText===null||typeof m.licenseText==='string')&&(m.licenseDigest===null||typeof m.licenseDigest==='string')
    &&strings(m.tasks)&&record(m.eligibility)&&strings(m.eligibility.reasons)&&typeof m.eligibility.state==='string'&&typeof m.eligibility.allowed==='boolean'
    &&typeof m.active==='boolean'&&typeof m.deviceConfirmed==='boolean'&&(m.installed===null||record(m.installed)&&typeof m.installed.artifactSha256==='string')
    &&(m.historicalEvidence===null||record(m.historicalEvidence)))
    &&Array.isArray(s.jobs)&&s.jobs.every((j:unknown)=>record(j)&&['id','operation','modelId','state','mode'].every(k=>typeof j[k]==='string')&&['progress','total','downloadedBytes'].every(k=>typeof j[k]==='number')&&(j.result===undefined||isStoreMediaResult(j.result)))
    &&Array.isArray(s.history)&&s.history.every((r:unknown)=>record(r)&&['id','modelId','suite','mode','origin','state','recommendation'].every(k=>typeof r[k]==='string')&&record(r.counts)&&strings(r.measurementLimitations))
    &&record(s.entitlement)&&typeof s.entitlement.largeModelsAllowed==='boolean'&&record(s.suite)&&typeof s.suite.version==='string';
}
