import type { IndependentScope } from './independent-contracts.js';
export type ModelStoreRequest={operation:'view'|'scan'|'stopChat'}|{operation:'install'|'importModel';modelId:string;requestId:string;licenseDigest:string}
  |{operation:'benchmark';modelId:string;requestId:string;mode:'quick'|'standard'}|{operation:'cancel';jobId:string}
  |{operation:'activate'|'remove';modelId:string}|{operation:'export'|'deleteHistory';receiptId:string}
  |{operation:'import';receipt:unknown}|{operation:'chat';text:string};
export type StoreModel={id:string;name:string;publisher:string;description:string;tier:string;sourceUrl:string;revision:string|null;
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
  entitlement:{largeModelsAllowed:boolean;status:string;threshold:number};suite:{version:string;sha256:string;cases:number;quickCases:number;standardRepeats:number}};
export type ModelStoreResponse={schemaVersion:1;scope:IndependentScope;kind:'model_store';operation:ModelStoreRequest['operation'];store:StoreView;storeResult:unknown};
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const strings=(v:unknown)=>Array.isArray(v)&&v.every(s=>typeof s==='string');
const numberOrNull=(v:unknown)=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function isModelStoreResponse(v:unknown):v is ModelStoreResponse {
  if(!record(v)||v.kind!=='model_store'||!record(v.store)||typeof v.operation!=='string')return false;
  const s=v.store;
  return typeof s.catalogRevision==='string'&&Array.isArray(s.models)&&s.models.length<=200&&s.models.every((m:unknown)=>record(m)
    &&['id','name','publisher','description','tier','sourceUrl','runtimeStatus','runtimeReason','testStatus','licenseLabel','memoryPolicy'].every(k=>typeof m[k]==='string')
    &&['totalParameters','contextLimit','recommendedContext','downloadBytes','recommendedRamBytes','recommendedVramBytes'].every(k=>numberOrNull(m[k]))
    &&(m.licenseText===null||typeof m.licenseText==='string')&&(m.licenseDigest===null||typeof m.licenseDigest==='string')
    &&strings(m.tasks)&&record(m.eligibility)&&strings(m.eligibility.reasons)&&typeof m.eligibility.state==='string'&&typeof m.eligibility.allowed==='boolean'
    &&typeof m.active==='boolean'&&typeof m.deviceConfirmed==='boolean'&&(m.installed===null||record(m.installed)&&typeof m.installed.artifactSha256==='string')
    &&(m.historicalEvidence===null||record(m.historicalEvidence)))
    &&Array.isArray(s.jobs)&&s.jobs.every((j:unknown)=>record(j)&&['id','operation','modelId','state','mode'].every(k=>typeof j[k]==='string')&&['progress','total','downloadedBytes'].every(k=>typeof j[k]==='number'))
    &&Array.isArray(s.history)&&s.history.every((r:unknown)=>record(r)&&['id','modelId','suite','mode','origin','state','recommendation'].every(k=>typeof r[k]==='string')&&record(r.counts)&&strings(r.measurementLimitations))
    &&record(s.entitlement)&&typeof s.entitlement.largeModelsAllowed==='boolean'&&record(s.suite)&&typeof s.suite.version==='string';
}
