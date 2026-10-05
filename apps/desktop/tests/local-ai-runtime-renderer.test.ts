import { describe,expect,it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { LocalAiRuntimeNotices } from '../src/renderer/components/LocalAiRuntimeNotices.js';
import { IndependentAssistantClient } from '../src/renderer/independent-assistant-client.js';
import { isLocalAiRuntimeRequest,isLocalAiRuntimeResponse,isLocalAiRuntimeSetupManifest,localAiRuntimePendingKey,localAiRuntimeReceiptKey,readLocalAiRuntimePending,runtimeResponseMatches } from '../src/renderer/local-ai-runtime-contracts.js';
import { isLocalAiResponse } from '../src/renderer/local-ai-contracts.js';
import { localAiRuntimeCopy,localAiRuntimeReason } from '../src/renderer/i18n/local-ai-runtime-copy.js';
import { localAiRuntimeNoticeCopy } from '../src/renderer/i18n/local-ai-runtime-notice-copy.js';
const scope={backendProfileId:'3a8557d4-aa81-41dd-aad1-0108fdab2b42',spaceId:'d34b83d7-32c6-4c30-bd02-04c6c80db6b7',browserProfileId:'runtime-controlled'};
const requestId='3a8557d4-aa81-41dd-aad1-0108fdab2b45',purposeDigest='a'.repeat(64),envelope={schemaVersion:1,scope} as const;
const review={...envelope,operation:'review',purposeDigest,expiresAt:new Date(Date.now()+30000).toISOString(),artifactId:'controlled:extract',artifactRevision:'b'.repeat(40),role:'extract',contextTokens:4096,parallelRequests:1,budgetSeconds:20,ramLimitBytes:1024*1024*1024,runtimeBuildRef:'controlled-cpu',available:false,operationVerified:false} as const;
const complete={...envelope,operation:'receipt',state:'complete',clientRequestId:requestId,purposeDigest,available:false,evidenceRef:'controlled-evidence',observedAt:new Date().toISOString(),coldStartMs:10,p95Ms:5,samples:1,peakObservedResidentBytes:1024,operationShapeVerified:true,synthetic:true,suite:null,operationVerified:false,qualityPassed:null,sloPassed:null,recommendationEligible:false,contextCapacityVerified:false,memoryEnvelopeVerified:false,productChatQualified:false} as const;
describe('Local runtime human purpose and receipt boundaries',()=>{
 it('requires bounded reviews and rejects fabricated availability, quality or full context proofs',()=>{
  expect(isLocalAiRuntimeResponse(review)).toBe(true);expect(isLocalAiResponse(complete)).toBe(true);
  for(const change of [{contextTokens:64000},{parallelRequests:2},{budgetSeconds:31},{available:true}])expect(isLocalAiRuntimeResponse({...review,...change})).toBe(false);
  for(const change of [{qualityPassed:true},{sloPassed:true},{recommendationEligible:true},{contextCapacityVerified:true},{memoryEnvelopeVerified:true},{samples:2},{peakObservedResidentBytes:0}])expect(isLocalAiRuntimeResponse({...complete,...change})).toBe(false);
 });
 it('uses read-only receipts with the original identity and rejects foreign scope or different purpose',async()=>{
  const calls:unknown[]=[];const client=new IndependentAssistantClient({request:async request=>{calls.push(request);return {ok:true,value:complete};}});
  const request={operation:'receipt',clientRequestId:requestId,purposeDigest} as const;
  expect(isLocalAiRuntimeRequest(request)).toBe(true);
  await expect(client.request({schemaVersion:1,scope,operation:'localAi',payload:{action:'runtime',request}})).resolves.toMatchObject({ok:true,value:{state:'complete'}});
  expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({payload:{request:{operation:'receipt',clientRequestId:requestId}}});
  expect(runtimeResponseMatches(complete,request,{...scope,browserProfileId:'foreign'})).toBe(false);
  expect(runtimeResponseMatches(complete,{...request,purposeDigest:'c'.repeat(64)},scope)).toBe(false);
  expect(runtimeResponseMatches(complete,{...request,clientRequestId:requestId.replaceAll('-','')},scope)).toBe(true);
  const foreign=new IndependentAssistantClient({request:async()=>({ok:true,value:{...complete,scope:{...scope,spaceId:scope.backendProfileId}}})});
  await expect(foreign.request({schemaVersion:1,scope,operation:'localAi',payload:{action:'runtime',request}})).resolves.toMatchObject({ok:false,error:{code:'invalid_response'}});
 });
 it('keeps unknown and running receipts unavailable without pretending that an absent result has failed',()=>{
  const value={...envelope,operation:'receipt',clientRequestId:requestId,purposeDigest,state:'unknown',available:false};
  expect(isLocalAiRuntimeResponse(value)).toBe(true);expect(isLocalAiRuntimeResponse({...value,state:'running'})).toBe(false);
  expect(isLocalAiRuntimeResponse({...value,state:'running',executionUnavailable:true})).toBe(true);
  expect(isLocalAiRuntimeResponse({...value,state:'failed',executionUnavailable:true,reasonCode:'runtime_bootstrap_failed'})).toBe(true);
  expect(isLocalAiRuntimeRequest({operation:'receipt',clientRequestId:requestId,purposeDigest,cacheRoot:'caller-path'})).toBe(false);
 });
 it('retains only scoped request metadata across reload, including expired reviews, without granting launch authority',()=>{
  const pending={purposeDigest,clientRequestId:requestId,artifactId:review.artifactId,role:review.role,expiresAt:'2020-01-01T00:00:00Z'};
  const values=new Map([[localAiRuntimePendingKey(scope),JSON.stringify(pending)]]),storage={getItem:(key:string)=>values.get(key)??null};
  expect(readLocalAiRuntimePending(scope,storage)).toEqual(pending);
  expect(readLocalAiRuntimePending({...scope,browserProfileId:'other'},storage)).toBeNull();
  values.set(localAiRuntimeReceiptKey(scope),JSON.stringify(pending));expect(readLocalAiRuntimePending(scope,storage,'receipt')).toEqual(pending);
  values.set(localAiRuntimePendingKey(scope),JSON.stringify({...pending,privateHumanAction:true}));expect(readLocalAiRuntimePending(scope,storage)).toBeNull();
 });
 it('rejects duplicate process handles and cannot equate unload requested with process stopped',()=>{
  const handle={handleId:requestId,artifactId:review.artifactId,artifactRevision:review.artifactRevision,role:'extract',state:'evicting',revision:2,available:false,synthetic:true,reasonCode:null,coldStartMs:null};
  expect(isLocalAiRuntimeResponse({...envelope,operation:'inspect',handles:[handle]})).toBe(true);
  expect(isLocalAiRuntimeResponse({...envelope,operation:'inspect',handles:[handle,{...handle,handleId:requestId.replaceAll('-','')}]})).toBe(false);
  expect(isLocalAiRuntimeResponse({...envelope,operation:'unload',handleId:requestId,stopped:false})).toBe(true);
  expect(isLocalAiRuntimeResponse({...envelope,operation:'unload',handleId:requestId,stopped:'requested'})).toBe(false);
 });
 it('explains recovery and technical evidence in every supported language',()=>{
  for(const locale of ['en','de','es','fr','it','pt-BR','ru','ja'] as const){expect(Object.values(localAiRuntimeCopy(locale)).every(text=>typeof text==='string'&&text.length>0)).toBe(true);
   expect(localAiRuntimeReason(locale,'runtime_release_license_closure_unverified')).not.toBe(localAiRuntimeReason(locale,'runtime_native_assets_unavailable'));}
  expect(localAiRuntimeCopy('ja').technical).toContain('未検証');expect(localAiRuntimeCopy('de').retry).toBe('Vorhandenes Testergebnis prüfen');
 });
 it('accepts compact official attribution without fabricating licensing or execution closure',()=>{
  const component={name:'Controlled component',licenseLabel:'MIT',noticeId:'controlled-notice',sourceUrl:'https://github.com/ggml-org/llama.cpp/releases/tag/controlled'};
  const summary={schemaVersion:1,runtimeBuildRef:'controlled-cpu',sourceBundleVerified:true,verifiedPayloadCount:1,components:[component],licenseClosureVerified:false,msvcDependencyClosureVerified:false,executionUnavailable:true,missingPrerequisites:['license_closure_unverified']};
  const setupManifest={schemaVersion:1,runtimeBuildRef:'controlled-cpu',noticeSummary:summary,available:false,executionUnavailable:true,skipAvailable:true,existingProviderAvailable:true,reasonCode:'local_runtime_dependency_and_license_closure_unverified'};
  expect(isLocalAiRuntimeSetupManifest(setupManifest)).toBe(true);expect(isLocalAiRuntimeResponse({...envelope,operation:'inspect',handles:[],setupManifest})).toBe(true);
  expect(isLocalAiRuntimeSetupManifest({...setupManifest,noticeSummary:{...summary,licenseClosureVerified:true}})).toBe(false);
  expect(isLocalAiRuntimeSetupManifest({...setupManifest,noticeSummary:{...summary,components:[{...component,sourceUrl:'https://untrusted.invalid/source'}]}})).toBe(false);
  expect(isLocalAiRuntimeSetupManifest({...setupManifest,noticeSummary:{...summary,rawSourceDump:'Not a public attribution field'}})).toBe(false);
  expect(isLocalAiRuntimeSetupManifest({...setupManifest,noticeSummary:{...summary,components:[{...component,sourceUrl:null,noticeText:'MIT license text'}]}})).toBe(true);
  expect(isLocalAiRuntimeSetupManifest({...setupManifest,noticeSummary:{...summary,components:[{...component,noticeText:42}]}})).toBe(false);
  expect(isLocalAiRuntimeSetupManifest({...setupManifest,noticeSummary:{...summary,components:[{...component,noticeText:'x'.repeat(65537)}]}})).toBe(false);
  expect(isLocalAiRuntimeSetupManifest({...setupManifest,noticeSummary:{...summary,components:Array.from({length:5},(_,index)=>({...component,noticeId:`notice-${index}`,noticeText:'x'.repeat(52500)}))}})).toBe(false);
  const legacy={...setupManifest,noticeSummary:{...summary,components:[component]}};
  expect(isLocalAiRuntimeSetupManifest(legacy)).toBe(true);
  const maliciousText='<img src=x onerror=alert(1)>';
  const maliciousManifest={...setupManifest,noticeSummary:{...summary,components:[{...component,sourceUrl:null,noticeText:maliciousText}]}};
  const rendered=renderToStaticMarkup(React.createElement(DesktopI18nProvider,null,
    React.createElement(LocalAiRuntimeNotices,{manifest:maliciousManifest})));
  expect(rendered).toContain('&lt;img src=x onerror=alert(1)&gt;');expect(rendered).not.toContain('<img');
  for(const locale of ['en','de','es','fr','it','pt-BR','ru','ja'] as const)expect(Object.values(localAiRuntimeNoticeCopy(locale)).every(text=>text.length>0)).toBe(true);
 });
});
