import type { IndependentScope } from './independent-contracts.js';
export type ModelStoreRequest={operation:'view'|'scan'|'stopChat'}|{operation:'install'|'importModel';modelId:string;requestId:string;licenseDigest:string}
  |{operation:'benchmark';modelId:string;requestId:string;mode:'quick'|'standard'}|{operation:'cancel';jobId:string}
  |{operation:'activate'|'remove';modelId:string}|{operation:'export'|'deleteHistory';receiptId:string}
  |{operation:'import';receipt:unknown}|{operation:'chat';text:string};
export type StoreModelCuration={modelId:string;name:string;publisher:string;category:'text'|'image'|'video';
  vramClass:string;quantization:string;estimatedVramGiB:[number,number];estimatedRamGiB:[number,number];
  estimatedDownloadGiB:[number,number];recommendedGpuGiB:number;engine:string;innovation:string;
  useCases:string[];strengths:string[];limitations:string[];license:'apache-2.0'|'mit';sourceUrl:string;priority:boolean};
export type StoreModel={id:string;name:string;publisher:string;description:string;tier:string;sourceUrl:string;revision:string|null;
  curated?:boolean;curation?:StoreModelCuration;
  totalParameters:number|null;contextLimit:number|null;recommendedContext:number|null;downloadBytes:number|null;
  recommendedRamBytes:number|null;recommendedVramBytes:number|null;memoryPolicy:string;quantization:string|null;
  runtimeStatus:string;runtimeReason:string;testStatus:string;historicalEvidence:null|{contentPassed:number;strictPassed:number;tasks:number;device:string;configuration:string;transferAllowed:false;smallCpuConfirmed:false};
  licenseLabel:string;licenseText:string|null;licenseDigest:string|null;gated:boolean;installQualified:boolean;
  commercialRequired:boolean|null;tasks:string[];eligibility:{state:string;reasons:string[];allowed:boolean};
  installed:null|{artifactSha256:string;bytes:number;revision:string;verifiedAt:number};active:boolean;deviceConfirmed:boolean};
export type StoreJob={id:string;operation:string;modelId:string;state:string;mode:string;progress:number;total:number;downloadedBytes:number;error:string|null;receiptId?:string};
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
    &&['totalParameters','contextLimit','recommendedContext','downloadBytes','recommendedRamBytes','recommendedVramBytes'].every(k=>numberOrNull(m[k]))
    &&(m.licenseText===null||typeof m.licenseText==='string')&&(m.licenseDigest===null||typeof m.licenseDigest==='string')
    &&strings(m.tasks)&&record(m.eligibility)&&strings(m.eligibility.reasons)&&typeof m.eligibility.state==='string'&&typeof m.eligibility.allowed==='boolean'
    &&typeof m.active==='boolean'&&typeof m.deviceConfirmed==='boolean'&&(m.installed===null||record(m.installed)&&typeof m.installed.artifactSha256==='string')
    &&(m.historicalEvidence===null||record(m.historicalEvidence)))
    &&Array.isArray(s.jobs)&&s.jobs.every((j:unknown)=>record(j)&&['id','operation','modelId','state','mode'].every(k=>typeof j[k]==='string')&&['progress','total','downloadedBytes'].every(k=>typeof j[k]==='number'))
    &&Array.isArray(s.history)&&s.history.every((r:unknown)=>record(r)&&['id','modelId','suite','mode','origin','state','recommendation'].every(k=>typeof r[k]==='string')&&record(r.counts)&&strings(r.measurementLimitations))
    &&record(s.entitlement)&&typeof s.entitlement.largeModelsAllowed==='boolean'&&record(s.suite)&&typeof s.suite.version==='string';
}
