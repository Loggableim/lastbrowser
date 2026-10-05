import React from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { LocalAiSetupPane } from '../src/renderer/components/LocalAiSetupPane.js';

const calls:unknown[]=[];
const date=()=>new Date().toISOString();
const measured=(value:number)=>({value,status:'measured',source:'controlled-probe',observedAt:date()});
const unknown={value:null,status:'unknown',source:'controlled-probe',observedAt:date()};
const inventory={schemaVersion:1,hardware:{schemaVersion:1,scanId:'inventory-controlled',observedAt:date(),os:'win32',arch:'x64',cpuName:'Controlled Test CPU',physicalCores:null,logicalCores:16,cpuFeatures:[],cpuFeaturesVerified:false,
  ramTotalBytes:measured(32*1024**3),ramAvailableBytes:measured(12*1024**3),diskFreeBytes:measured(100*1024**3),adapters:[{adapterId:'controlled-gpu',name:'Controlled GPU',vendor:'test',dedicatedBytes:measured(8*1024**3),sharedSystemMemory:null,memoryPoolId:'unknown-memory-topology',processBudgetBytes:unknown,processUsageBytes:unknown}]},gpuFeatureStatus:{cuda:'unknown'},probeIssues:[]};
let failNextInventory=false;
Object.defineProperty(window,'lastbrowser',{configurable:true,value:{independent:{request:async(request:unknown)=>{
  calls.push(request);const input=request as {operation:string;payload:unknown};
  if(input.operation==='localAiBootstrap')return{ok:true,value:{schemaVersion:1,installKey:'router-lfm2.5-230m-qad-q4_0-v1',revision:0,state:'idle',jobId:null,attempt:0,downloadedBytes:0,verifiedBytes:0,totalBytes:149091630,
    artifactId:'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0',artifactRevision:'b27f8147d98080b0d6f063ff41de6e381ea9a530',sha256:'e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292',
    licenseLabel:'LFM Open License v1.0',licenseUrl:'https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/b27f8147d98080b0d6f063ff41de6e381ea9a530/LICENSE',commercialThresholdUsd:10000000,
    executionUnavailable:true,errorCode:null,updatedAt:date()}};
  if(input.operation==='localAiHardwareInventory'){
    if(failNextInventory){failNextInventory=false;return{ok:false,error:{schemaVersion:1,code:'temporarily_unavailable',message:'Controlled probe failure',retryable:true}};}
    return{ok:true,value:inventory};
  }
  throw new Error(`Unexpected renderer request: ${input.operation}`);
}},system:{openExternal:async()=>{}}}});
(window as Window&{__localAiSmoke?:Record<string,unknown>}).__localAiSmoke={calls,failNext:()=>{failNextInventory=true;}};
localStorage.setItem('lastbrowser.locale','en');localStorage.setItem('lastbrowser.localAiBootstrap.dismissed.v1','1');
createRoot(document.getElementById('root')!).render(<DesktopI18nProvider><LocalAiSetupPane browserProfileId="controlled" workspacePath="" ready={false} keepGlobalRouterStatusVisible/></DesktopI18nProvider>);
