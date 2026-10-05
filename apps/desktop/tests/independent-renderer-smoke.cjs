#!/usr/bin/env node
/* Real Castlabs renderer/callback probe with a deterministic transport. No Main/Python/provider E2E claim. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const fixture = String.raw`
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpaceAssistantPanel } from './src/renderer/components/SpaceAssistantPanel';
import { NativeChatMain as NativeChatMainComponent } from './src/renderer/panels/NativeChatMain';
import { NativeBrowserStartPage } from './src/renderer/panels/NativeBrowserStartPage';
import { LocalAiSetupPane } from './src/renderer/components/LocalAiSetupPane';
import { useNativeChatControls } from './src/renderer/native-chat-control';
import { requestNativePersistentGoalCommand } from './src/renderer/persistent-goal-command';
import './src/renderer/styles.css';
import { IndependentActivityOverview } from './src/renderer/components/IndependentActivityOverview';
import { IndependentAssistantClient } from './src/renderer/independent-assistant-client';
import { IndependentAssistantController } from './src/renderer/independent-assistant-controller';
import { useSpaceAssistantStore } from './src/renderer/stores/useSpaceAssistantStore';
import { assistantScopeKey } from './src/renderer/independent-contracts';
import { DesktopI18nProvider, useDesktopI18n } from './src/renderer/i18n';
localStorage.setItem('lastbrowser.locale', 'en');
const id = () => crypto.randomUUID(), at = () => new Date().toISOString();
const backend = id();
const scopes = { A: {backendProfileId:backend,spaceId:id(),browserProfileId:'controlled'}, B: {backendProfileId:backend,spaceId:id(),browserProfileId:'controlled'} };
const activity = scope => ({schemaVersion:1,scope,observedAt:at(),watermark:0,sourceState:'live',lastSuccessfulAt:null,runs:[],dispatches:[],activeChats:[{sessionId:'work-'+scope.spaceId.slice(0,8),observedAt:at()}],schedules:[],approvals:[]});
const initial = scope => ({schemaVersion:1,scope,conversationId:id(),revision:1,messages:[],interview:null,confirmedProfile:null,providerReady:true,provider:'controlled-provider',model:'controlled-model',activity:activity(scope)});
const snapshots = { A:initial(scopes.A), B:initial(scopes.B) };
const models = {A:{model:'model-a',provider:'controlled-provider',revision:1},B:{model:'model-b',provider:'controlled-provider',revision:1}};
const modelGroups=[{provider:'Controlled provider',provider_id:'controlled-provider',configured:true,models:['model-a','model-b'].map(id=>({id,label:id,supportsIndependent:true}))},{provider:'Local',provider_id:'custom:local',configured:true,models:[{id:'gemma4:31b',label:'Literal local model',supportsIndependent:true,reasoning_efforts:['low','high']}],extra_models:[{id:'extra-local-model',label:'Extra local model',supportsIndependent:true,reasoning_efforts:['medium']}]},{provider:'Offline provider',provider_id:'offline-provider',configured:false,models:[{id:'offline-model',label:'Unavailable model',supportsIndependent:true}]},{provider:'Orchestration',provider_id:'',configured:true,models:[{id:'teamwork',label:'Teamwork',supportsIndependent:false}]}];
const queues = { A:[], B:[] }, sequences={A:0,B:0}, calls=[];
const question = revision => ({schemaVersion:1,kind:'question',basedOnRevision:revision,topic:'purpose',prompt:'What should this Space help with?',options:[{id:'research',label:'Research'},{id:'work',label:'Work'},{id:'personal',label:'Personal'}],allowFreeText:true,selection:'single',understood:[],profilePatch:{}});
const permissions = {revision:1,browserOrigins:[],networkOrigins:[],connectorBindings:[],allowedWorkspaceRoots:[],allowedEffects:[],rawCdp:false,terminal:false,desktop:false};
const permissionStates={A:{...permissions,networkOrigins:['https://network.controlled.invalid'],allowedWorkspaceRoots:['C:\\controlled\\a'],allowedEffects:['send']},B:structuredClone(permissions)},delays={preview:0,permission:0};
const connections={A:{revision:1,credential:false},B:{revision:1,credential:false}},bindings={A:[],B:[]},definitions={A:[],B:[]},flows={},browserFlows={A:[],B:[]},browserStarts={};
const traceOrder=[];
const browserFaults={loseAck:false,restarted:false},nativeGoalFaults={error:null,delay:0},migrationFaults={loseAck:false},migrationCopies={},migrationReceipts={};
const localArtifact={artifactId:'controlled:files',provider:'Controlled',modelId:'Controlled/LocalAI',revision:'a'.repeat(40),format:'gguf',quantization:'controlled',architecture:null,roles:['agent','extract'],manifestComplete:true,licenseRef:'https://huggingface.co/Controlled/LocalAI/resolve/'+ 'a'.repeat(40)+'/LICENSE',licenseDigest:'b'.repeat(64),contextLimit:4096,requiresTaskHead:false,taskHeadRef:null,requiresProjector:false,files:[{relativePath:'model.gguf',bytes:64,sha256:'c'.repeat(64),sourceUrl:'https://huggingface.co/Controlled/LocalAI/resolve/'+ 'a'.repeat(40)+'/model.gguf',kind:'weights'},{relativePath:'LICENSE',bytes:32,sha256:'b'.repeat(64),sourceUrl:'https://huggingface.co/Controlled/LocalAI/resolve/'+ 'a'.repeat(40)+'/LICENSE',kind:'license'}]};
const localPreferences=name=>({schemaVersion:1,scope:scopes[name],revision:0,decision:'undecided',preset:null,artifactIds:[],updatedAt:null});
const localState={A:{preferences:localPreferences('A'),jobs:[],plan:null,consent:null},B:{preferences:localPreferences('B'),jobs:[],plan:null,consent:null}};
const localScans={};
const localRuntime={A:{handles:[],receipts:{},review:null},B:{handles:[],receipts:{},review:null}},runtimeFaults={loseAck:false,unknownReceipt:false,reviewReason:'runtime_release_license_closure_unverified'};
const browserCapability=name=>({capabilityId:'browser.account',title:'Agent browser accounts',connectionKind:'browser_account',supportedTasks:['browser.account.use'],status:browserFlows[name].some(f=>f.setupStatus==='user_confirmed')?'configured':'not_configured',evidenceKind:'explicit_user_confirmation',connections:browserFlows[name].filter(f=>['user_confirmed','revoked'].includes(f.setupStatus)).map(f=>({connectionId:f.connectionId,title:f.accountLabel||f.origin,origin:f.origin,revision:f.revision,status:f.setupStatus==='user_confirmed'?'configured':'reauth_required',configurationStatus:f.setupStatus==='user_confirmed'?'configured':'not_configured',authenticationStatus:f.setupStatus==='user_confirmed'?'user_confirmed':'unknown',healthStatus:'unknown',installed:true,adapterAvailable:f.setupStatus==='user_confirmed',setupActions:[],partitionKind:'dedicated_agent',accountSource:'explicit_agent_login'}))});
const capability = name => ({capabilityId:'assistant.conversation',title:'Model conversation',supportedTasks:['conversation','agent_reasoning'],connectionKind:'provider',status:'configured',evidenceKind:'configuration',connections:[
  {connectionId:'provider:custom:local',providerId:'custom:local',title:'Controlled local connection',revision:connections[name].revision,status:'configured',configurationStatus:'configured',authenticationStatus:connections[name].credential?'credential_present':'unknown',healthStatus:'not_checked',installed:true,adapterAvailable:true,setupActions:[{kind:'settings',availability:'available',providerId:'custom:local'}]},
  {connectionId:'provider:codex',providerId:'codex',title:'Controlled OAuth connection',revision:1,status:'not_configured',configurationStatus:'not_configured',authenticationStatus:'required',healthStatus:'not_checked',installed:true,adapterAvailable:true,setupActions:[{kind:'oauth',availability:'available',providerId:'codex'}]}
]});
const bindingView=name=>({scope:scopes[name],permissions:copy(permissionStates[name]),connectionBindings:copy(bindings[name]),browser:null});
const definitionList=name=>({schemaVersion:1,scope:scopes[name],definitions:copy(definitions[name]),schedules:definitions[name].filter(d=>d.schedule).map(d=>({definitionId:d.definitionId,definitionRevision:d.revision,enabled:d.enabled,nextRunAt:d.enabled?'2026-10-05T09:00:00Z':null})),observedAt:at()});
const key = scope => scope?.spaceId===scopes.A.spaceId ? 'A' : 'B';
const copy = value => structuredClone(value);
let foreign=false;
const transport={request:async request=>{
  const name=key(request.scope), state=snapshots[name], payload=request.payload;
  calls.push(copy(request));
  switch(request.operation){
    case 'localAiHardwareInventory': {const measurement={value:null,status:'unknown',source:'controlled-probe',observedAt:at()};return{ok:true,value:{schemaVersion:1,hardware:{schemaVersion:1,scanId:'controlled-global-inventory',observedAt:at(),os:'win32',arch:'x64',cpuName:'Controlled CPU',physicalCores:null,logicalCores:32,cpuFeatures:[],cpuFeaturesVerified:false,ramTotalBytes:measurement,ramAvailableBytes:measurement,diskFreeBytes:measurement,adapters:[]},gpuFeatureStatus:{cuda:'unknown'},probeIssues:[]}};}
    case 'localAiBootstrap': return {ok:true,value:{schemaVersion:1,installKey:'router-lfm2.5-230m-qad-q4_0-v1',revision:0,state:'idle',jobId:null,attempt:0,downloadedBytes:0,verifiedBytes:0,totalBytes:149091630,artifactId:'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0',artifactRevision:'b27f8147d98080b0d6f063ff41de6e381ea9a530',sha256:'e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292',licenseLabel:'LFM Open License v1.0',licenseUrl:'https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/b27f8147d98080b0d6f063ff41de6e381ea9a530/LICENSE',commercialThresholdUsd:10000000,executionUnavailable:true,errorCode:null,updatedAt:at()}};
    case 'resolveScope': {const label=request.payload.workspacePath.endsWith('a')?'A':'B';return {ok:true,value:{schemaVersion:1,scope:scopes[label],spaceName:'Space '+label,workspacePath:request.payload.workspacePath,bindingRevision:1,setupStatus:'confirmed'}};}
    case 'modelSelection': {
      const model=models[name];if(payload.action==='set'){assertRevision(payload,model.revision);traceOrder.push('space-model:'+payload.model);model.model=payload.model;model.provider=payload.provider;model.revision++;}
      return {ok:true,value:{schemaVersion:1,scope:state.scope,...copy(model),configured:true,supportsIndependent:model.model!=='teamwork',...(model.model==='teamwork'?{reasonCode:'independent_orchestration_not_supported'}:{}),groups:copy(modelGroups),providers:[{id:'offline-provider',display_name:'Offline provider',has_key:false,oauth_connected:false,auth_state:'not_configured',provider_available:false,models:[]}]}};
    }
    case 'assistantSnapshot': await new Promise(r=>setTimeout(r,65)); return {ok:true,value:copy(state)};
    case 'assistantReset': {
      assertRevision(payload,state.revision);
      const digest='a'.repeat(64);
      if(payload.mode==='apply'){
        if(payload.previewDigest!==digest)throw Error('Controlled reset review mismatch');
        state.interview=null;state.revision++;
        if(payload.action==='reset_assistant'){state.confirmedProfile=null;state.messages=[];}
        return{ok:true,value:{schemaVersion:1,scope:state.scope,action:payload.action,revision:state.revision,interviewRevision:10,conversationId:state.conversationId,confirmedProfileId:state.confirmedProfile?.profileId??null,previewDigest:digest}};
      }
      return{ok:true,value:{schemaVersion:1,scope:state.scope,action:payload.action,expectedRevision:state.revision,conversationId:state.conversationId,previewDigest:digest,
        removedInterviewMessages:3,removedConversationMessages:payload.action==='reset_assistant'?state.messages.length:0,removedAnswerRecords:state.interview?.answers.length??0,clearedCachedStates:2,
        removedProfileFields:payload.action==='reset_assistant'?Object.keys(state.confirmedProfile?.values??{}):[],removedDraftFields:Object.keys(state.interview?.draft??{}),preservedProfileFields:payload.action==='reset_assistant'?[]:Object.keys(state.confirmedProfile?.values??{}),confirmedProfileId:state.confirmedProfile?.profileId??null,
        preservedSnapshotCount:1,preservedSnapshotEvidenceCount:1,preservedDefinitions:definitions[name].map(d=>({definitionId:d.definitionId,title:d.title,revision:d.revision,enabled:d.enabled,scheduled:!!d.schedule})),
        preservedRuns:state.activity.runs.map(r=>({runId:r.runId,definitionId:r.definitionId,state:r.state,stateRevision:r.stateRevision,controlEpoch:r.controlEpoch})),preservedConnections:bindings[name].map(b=>({bindingId:b.bindingId,connectionId:b.connectionId,capabilityId:b.capabilityId,revision:b.revision,status:b.status})),preservedSchedules:[],
        permissionRevision:permissionStates[name].revision,permissionControlEpoch:0,browserBindingRevision:1}};
    }
    case 'activity': return {ok:true,value:{...copy(state.activity),observedAt:at(),watermark:sequences[name]}};
    case 'runControl': {
      const run=state.activity.runs.find(r=>r.runId===payload.runId), question=state.activity.clarificationQuestions?.find(q=>q.runId===payload.runId);
      if(payload.command!=='answer'||!question||payload.questionIdentity!==question.questionIdentity||payload.controlEpoch!==run.controlEpoch)throw Error('Controlled clarification identity mismatch');
      assertRevision(payload,run.stateRevision);await new Promise(r=>setTimeout(r,120));
      run.state='running';run.stateRevision++;run.checkpointId=null;run.waitingFor=null;state.activity.clarificationQuestions=[];
      return{ok:true,value:copy(run)};
    }
    case 'events': {
      if(foreign){foreign=false;return {ok:true,value:{events:[{schemaVersion:1,eventId:id(),scope:scopes.B,seq:sequences[name]+1,at:at(),kind:'assistant',payload:{delta:'FOREIGN'}}],snapshot:null,watermark:sequences[name]+1,resyncRequired:false}};}
      return {ok:true,value:{events:copy(queues[name].filter(e=>e.seq>payload.after)),snapshot:null,watermark:sequences[name],resyncRequired:false}};
    }
    case 'capabilities': return {ok:true,value:{schemaVersion:1,scope:state.scope,observedAt:at(),entries:[capability(name),browserCapability(name)]}};
    case 'localAi': {
      const current=localState[name],envelope={schemaVersion:1,scope:scopes[name]},common={...envelope,skipAvailable:true,existingProviderAvailable:true};
      if(payload.action==='runtime'){
        const request=payload.request,runtime=localRuntime[name],reply={...envelope,operation:request.operation};await new Promise(resolve=>setTimeout(resolve,80));
        if(request.operation==='inspect')return{ok:true,value:{...reply,handles:copy(runtime.handles)}};
        if(request.operation==='receipt'){const saved=runtime.receipts[request.clientRequestId];if(saved&&saved.purposeDigest!==request.purposeDigest)throw Error('Runtime purpose changed');
          return{ok:true,value:saved&&!runtimeFaults.unknownReceipt?{...copy(saved),operation:'receipt'}:{...reply,clientRequestId:request.clientRequestId,purposeDigest:request.purposeDigest,state:'unknown',available:false}};}
        if(request.operation==='review'){
          if(runtimeFaults.reviewReason)return{ok:true,value:{...reply,available:false,executionUnavailable:true,reasonCode:runtimeFaults.reviewReason}};
          runtime.review={...reply,purposeDigest:'e'.repeat(64),expiresAt:new Date(Date.now()+30000).toISOString(),artifactId:request.artifactId,artifactRevision:localArtifact.revision,role:request.role,contextTokens:1024,parallelRequests:1,budgetSeconds:20,ramLimitBytes:1024*1024*1024,runtimeBuildRef:'controlled-cpu',available:false,operationVerified:false};return{ok:true,value:copy(runtime.review)};}
        if(request.operation==='bootstrap'){
          if(!runtime.review||runtime.review.purposeDigest!==request.purposeDigest)throw Error('Runtime review missing');
          const saved=runtime.receipts[request.clientRequestId];if(saved)return{ok:true,value:copy(saved)};
          const result={...reply,state:'complete',clientRequestId:request.clientRequestId,purposeDigest:request.purposeDigest,available:false,evidenceRef:'controlled-evidence',observedAt:at(),coldStartMs:10,p95Ms:5,samples:1,peakObservedResidentBytes:1024,operationShapeVerified:true,synthetic:true,qualityPassed:null,sloPassed:null,recommendationEligible:false,contextCapacityVerified:false,memoryEnvelopeVerified:false};runtime.receipts[request.clientRequestId]=result;
          runtime.handles.push({handleId:id(),artifactId:runtime.review.artifactId,artifactRevision:runtime.review.artifactRevision,role:runtime.review.role,state:'ready',revision:1,available:false,synthetic:true,reasonCode:null,coldStartMs:10});
          if(runtimeFaults.loseAck){runtimeFaults.loseAck=false;throw Error('Controlled runtime ACK lost');}return{ok:true,value:copy(result)};
        }
        const handle=runtime.handles.find(handle=>handle.handleId===request.handleId);if(!handle)throw Error('Foreign runtime handle');handle.state='evicting';handle.revision++;return{ok:true,value:{...reply,handleId:handle.handleId,stopped:false}};
      }
      if(payload.action==='catalog')return{ok:true,value:{...envelope,catalog:{revision:'controlled-catalog',observedAt:at(),artifacts:[copy(localArtifact)]}}};
      if(payload.action==='scan'){const scanId=id(),measurement={value:null,status:'unknown',source:'controlled-probe',observedAt:at()};const hardware={schemaVersion:1,scanId,observedAt:at(),os:'win32',arch:'x64',cpuName:'Controlled CPU',physicalCores:16,logicalCores:32,cpuFeatures:[],cpuFeaturesVerified:false,ramTotalBytes:measurement,ramAvailableBytes:measurement,diskFreeBytes:measurement,adapters:[]};localScans[name]=hardware;return{ok:true,value:{...common,scan:{schemaVersion:1,scope:scopes[name],hardware,gpuFeatureStatus:{cuda:'unknown'},probeIssues:[]},runtimes:[{buildRef:'controlled:inference-unavailable',state:'unavailable',managed:'in_tree',os:'win32',arch:'x64'}],availableComputeSlots:0}};}
      if(payload.action==='recommend')return{ok:true,value:{...common,result:{schemaVersion:1,hardwareScanId:payload.scanId,catalogRevision:'controlled-catalog',requestedPreset:payload.preset,automaticRecommendation:'balanced',state:'proposed',recommendations:[{artifactId:localArtifact.artifactId,role:'agent',contextTokens:payload.contextTokens,parallelRequests:payload.parallelRequests??1,qualityTier:'balanced',runtimeBuildRef:'controlled-cpu',placement:'cpu',adapterId:null,support:'supported',suitability:'recommended',selectable:true,allocationReady:true,downloadReady:true,downloadBytes:96,peakRamBytes:1024,peakGpuBytes:null,reasonCodes:[],evidenceRefs:['controlled-test-evidence']},{artifactId:'controlled:unsupported-model',role:'retrieve',contextTokens:payload.contextTokens,parallelRequests:1,qualityTier:null,runtimeBuildRef:null,placement:null,adapterId:null,support:'unsupported',suitability:'insufficient_resources',selectable:false,allocationReady:false,downloadReady:false,downloadBytes:null,peakRamBytes:null,peakGpuBytes:null,reasonCodes:['runtime_missing'],evidenceRefs:[]}],selectedArtifactIds:[localArtifact.artifactId],maxSimultaneousModels:1,cloudAllowed:false,reasonCodes:[]}}};
      const request=payload.request;await new Promise(resolve=>setTimeout(resolve,80));const response={...common,operation:request.operation};
      if(request.operation==='get')return{ok:true,value:{...response,preferences:copy(current.preferences)}};
      if(request.operation==='select'){assertRevision(request.choice,current.preferences.revision);current.preferences={...current.preferences,revision:current.preferences.revision+1,decision:request.choice.decision,preset:request.choice.preset??null,artifactIds:copy(request.choice.artifactIds??[]),updatedAt:at()};return{ok:true,value:{...response,preferences:copy(current.preferences)}};}
      if(request.operation==='plan'){assertRevision(request,current.preferences.revision);current.plan={schemaVersion:1,scope:scopes[name],planId:id(),setupRevision:current.preferences.revision,catalogRevision:'controlled-catalog',artifacts:[copy(localArtifact)],totalBytes:96,createdAt:at(),executionUnavailable:true,planDigest:'d'.repeat(64)};return{ok:true,value:{...response,plan:copy(current.plan)}};}
      if(request.operation==='confirm'){if(request.planDigest!==current.plan.planDigest||JSON.stringify(request.licenseDigests)!==JSON.stringify([localArtifact.licenseDigest]))throw Error('Actual reviewed license mismatch');current.consent={scope:scopes[name],planDigest:request.planDigest,licenseDigests:copy(request.licenseDigests),clientRequestId:request.clientRequestId,confirmedAt:at(),authority:'private_human_action'};return{ok:true,value:{...response,consent:copy(current.consent)}};}
      if(request.operation==='start'){if(current.consent?.planDigest!==request.planDigest)throw Error('No actual consent');const job={schemaVersion:1,scope:scopes[name],jobId:id(),planDigest:request.planDigest,revision:1,state:'downloading',totalBytes:96,downloadedBytes:16,verifiedBytes:null,createdAt:at(),updatedAt:at(),errorCode:null,executionUnavailable:true};current.jobs.push(job);return{ok:true,value:{...response,job:copy(job)}};}
      if(request.operation==='cancel'){const job=current.jobs.find(job=>job.jobId===request.jobId);if(!job)throw Error('Foreign job');job.state='stopping';job.revision++;job.updatedAt=at();return{ok:true,value:{...response,job:copy(job)}};}
      return{ok:true,value:{...response,jobs:copy(current.jobs)}};
    }
    case 'browserConnection': {
      if(payload.action==='start'){const old=browserStarts[payload.clientRequestId];if(old){if(old.origin!==payload.origin||old.scope.spaceId!==state.scope.spaceId)throw Error('Idempotency conflict');
          if(browserFaults.restarted){old.setupStatus='interrupted';old.reasonCode='setup_owner_restarted';old.revision++;browserFaults.restarted=false;}return{ok:true,value:copy(old)};}
        await new Promise(r=>setTimeout(r,100));navigation.browserLogins++;const flowId=id(),flow={schemaVersion:1,scope:state.scope,flowId,connectionId:'browser_account:'+flowId,origin:payload.origin,revision:2,setupStatus:'awaiting_user',permissionRevision:permissionStates[name].revision,permissionEpoch:0,createdAt:at(),updatedAt:at(),expiresAt:new Date(Date.now()+600000).toISOString(),partitionKind:'dedicated_agent',accountSource:'explicit_agent_login',authenticationStatus:'unknown',healthStatus:'unknown',evidenceKind:'owned_login_target'};
        browserFlows[name].push(flow);browserStarts[payload.clientRequestId]=flow;if(browserFaults.loseAck){browserFaults.loseAck=false;throw Error('Controlled acknowledgement lost');}return{ok:true,value:copy(flow)};}
      const flow=browserFlows[name].find(f=>payload.action==='logout'?f.connectionId===payload.connectionId:f.flowId===payload.flowId);if(!flow)throw Error('Foreign browser flow');
      if(payload.action==='confirm'){assertRevision(payload,flow.revision);await new Promise(r=>setTimeout(r,100));flow.revision++;flow.setupStatus='user_confirmed';flow.authenticationStatus='user_confirmed';flow.evidenceKind='explicit_user_confirmation';if(payload.accountLabel)flow.accountLabel=payload.accountLabel;}
      if(payload.action==='cancel'){flow.setupStatus='cancelled';flow.revision++;flow.authenticationStatus='unknown';}
      if(payload.action==='logout'){assertRevision(payload,flow.revision);for(const old of browserFlows[name].filter(f=>f.setupStatus==='user_confirmed')){old.setupStatus='revoked';old.authenticationStatus='unknown';old.evidenceKind='owned_login_target';old.revision++;}
        for(const b of bindings[name].filter(b=>b.connectionKind==='browser_account')){b.status='revoked';b.revision++;}}
      flow.updatedAt=at();return{ok:true,value:copy(flow)};
    }
    case 'bindings': {
      if(payload.action==='bind') {const old=bindings[name].find(b=>b.capabilityId===payload.capabilityId&&b.connectionId===payload.connectionId),browser=payload.capabilityId==='browser.account',account=browserFlows[name].find(f=>f.connectionId===payload.connectionId);assertRevision(payload,old?.revision??0);bindings[name]=[...bindings[name].filter(b=>b!==old),{bindingId:old?.bindingId??id(),scope:state.scope,capabilityId:payload.capabilityId,connectionId:payload.connectionId,revision:(old?.revision??0)+1,status:'active',permittedUse:copy(payload.permittedUse),connectionRevision:browser?account.revision:connections[name].revision,connectionKind:browser?'browser_account':'provider',updatedAt:at()}];}
      if(payload.action==='revoke') {const old=bindings[name].find(b=>b.bindingId===payload.bindingId);assertRevision(payload,old.revision);old.revision++;old.status='revoked';old.updatedAt=at();}
      return {ok:true,value:bindingView(name)};
    }
    case 'connectionSetup': {
      if(payload.action==='start') {const oauth=payload.connectionId==='provider:codex',flow={schemaVersion:1,scope:state.scope,flowId:id(),connectionId:payload.connectionId,providerId:oauth?'codex':'custom:local',setupStatus:oauth?'awaiting_user':'settings_required',revision:1,createdAt:at(),updatedAt:at(),expiresAt:new Date(Date.now()+300000).toISOString(),evidence:{source:'setup_worker',configurationStatus:oauth?'not_configured':'configured',authenticationStatus:oauth?'pending':'unknown',healthStatus:'not_checked',observedAt:at()},nextStep:oauth?{kind:'oauth',authorizationUrl:'https://auth.openai.com/oauth/authorize?controlled=true',requiresUserNavigation:true}:{kind:'human_form',backendProfileId:backend,connectionId:payload.connectionId,providerId:'custom:local',expectedConnectionRevision:connections[name].revision,fields:['apiKey','baseUrl','model']}};flows[flow.flowId]=flow;return{ok:true,value:copy(flow)};}
      const flow=flows[payload.flowId];if(payload.action==='cancel'){flow.setupStatus='cancelled';flow.revision++;delete flow.nextStep;}return{ok:true,value:copy(flow)};
    }
    case 'connectionConfigure': {
      if(payload.expectedConnectionRevision!==connections[name].revision)throw Error('Controlled connection CAS mismatch');
      await new Promise(r=>setTimeout(r,100));connections[name].revision++;connections[name].credential=Boolean(payload.configuration.apiKey);
      return{ok:true,value:{schemaVersion:1,scope:state.scope,connectionId:payload.connectionId,providerId:'custom:local',applied:true,connectionRevision:connections[name].revision,configurationStatus:'configured',authenticationStatus:connections[name].credential?'credential_present':'unknown',healthStatus:'not_checked'}};
    }
    case 'definitions': {
      if(payload.action==='list')return{ok:true,value:definitionList(name)};
      if(payload.action==='save') {const draft=copy(payload.draft),old=definitions[name].find(d=>d.definitionId===draft.definitionId);assertRevision(payload,old?.revision??null);if(payload.userIntent.length>64000)throw Error('Control source too long');
        const definition={schemaVersion:1,...draft,definitionId:old?.definitionId??id(),scope:state.scope,revision:(old?.revision??0)+1,provider:{...draft.provider,providerConfigRef:'controlled-digest',configRevision:1,contextLength:65536},profileSnapshotRef:state.confirmedProfile?.profileId??null,activationConversationId:state.conversationId,activationMessageId:id(),capabilityRefs:draft.connectionBindings.map(b=>b.capabilityId),createdAt:old?.createdAt??at()};definitions[name]=[definition,...definitions[name].filter(d=>d.definitionId!==definition.definitionId)];return{ok:true,value:{schemaVersion:1,scope:state.scope,definition:copy(definition)}};
      }
      const definition=definitions[name].find(d=>d.definitionId===payload.definitionId);assertRevision(payload,definition.revision);
      if(payload.action==='disable'){definition.revision++;definition.enabled=false;return{ok:true,value:{schemaVersion:1,scope:state.scope,definition:copy(definition)}};}
      if(payload.expectedPermissionRevision!==permissionStates[name].revision)throw Error('Controlled permission CAS mismatch');
      const dispatch={schemaVersion:1,dispatchId:id(),scope:state.scope,state:'started',assistantConversationId:state.conversationId,sourceMessageId:id(),targetSessionId:'work-'+id(),runId:id(),reasonCode:null,createdAt:at(),updatedAt:at()};
      const run={schemaVersion:1,runId:dispatch.runId,dispatchId:dispatch.dispatchId,scope:state.scope,definitionId:definition.definitionId,definitionRevision:definition.revision,state:'queued',stateRevision:1,reasonCode:null,createdAt:at(),updatedAt:at(),assistantProfileRevision:state.confirmedProfile?.revision??null,targetSessionId:dispatch.targetSessionId,checkpointId:null,resultRef:null,controlEpoch:0,counters:{toolCalls:0,providerRequests:0,activeSeconds:0,measuredTokens:null},waitingFor:null};state.activity.runs.push(run);state.activity.dispatches.push(dispatch);return{ok:true,value:{schemaVersion:1,scope:state.scope,dispatch:copy(dispatch)}};
    }
    case 'permissions': {
      const current=permissionStates[name];
      if(payload.action){assertRevision(payload,current.revision);await new Promise(r=>setTimeout(r,delays.permission));Object.assign(current,payload.action==='grant'?copy(payload.permissions):copy(permissions),{revision:current.revision+1});}
      return{ok:true,value:copy(current)};
    }
    case 'openBrowser': await new Promise(r=>setTimeout(r,delays.preview));return{ok:true,value:{schemaVersion:1,kind:'preview',runId:payload.runId,leaseId:id(),navigationEpoch:0,permissionEpoch:permissionStates[name].revision,mimeType:'image/png',base64:'AA==',observedAt:at()}};
    case 'interviewStart': state.revision++; state.interview={schemaVersion:1,interviewId:id(),scope:state.scope,revision:1,stage:'interview',locale:payload.locale,questionId:id(),question:question(1),answers:[],draft:payload.seed??{},understood:[],unresolvedTopics:['purpose','help','style'],review:null,modelError:'controlled_manual_fallback',manualFallback:true}; break;
    case 'interviewAnswer': {
      assertRevision(payload,state.interview.revision);
      const answer={schemaVersion:1,answerId:id(),questionId:payload.questionId,topic:state.interview.question.topic,question:copy(state.interview.question),selectedOptionIds:payload.selectedOptionIds,freeText:payload.freeText,text:[...payload.selectedOptionIds,payload.freeText].filter(Boolean).join(' / '),clientRequestId:payload.clientRequestId,replacesAnswerId:payload.replacesAnswerId,at:at()};
      state.interview.answers.push(answer); state.interview.revision++; state.interview.questionId=id(); state.interview.question=question(state.interview.revision);state.interview.draft={purpose:answer.text};state.interview.understood=[{topic:'purpose',summary:answer.text,answerIds:[answer.answerId]}];state.revision++;break;
    }
    case 'interviewReview': assertRevision(payload,state.interview.revision);state.interview.revision++;state.interview.stage='review';state.interview.questionId=null;state.interview.question=null;state.interview.review={schemaVersion:1,kind:'review',basedOnRevision:state.interview.revision,summary:'Review your preferences before confirming.',missingTopics:['help','style'],completionReason:'user_finished',understood:copy(state.interview.understood),profilePatch:copy(state.interview.draft)};state.revision++;break;
    case 'interviewConfirm': assertRevision(payload,state.interview.revision);state.interview.revision++;state.interview.stage='confirmed';state.interview.draft=copy(payload.values);state.confirmedProfile={schemaVersion:1,profileId:id(),scope:state.scope,revision:1,status:'confirmed',values:copy(payload.values),recordedAt:at(),confirmedAt:at(),sourceAnswerIds:state.interview.answers.map(a=>a.answerId)};state.revision++;break;
    case 'assistantTurn': {
      assertRevision(payload,state.revision);const turnId=id(),sourceMessageId=id();
      const source={id:sourceMessageId,role:'user',content:payload.message,at:at(),turnId,clientRequestId:payload.clientRequestId};
      const reply={id:id(),role:'assistant',content:'',at:at(),turnId,pending:payload.message!=='pause this task'};
      if(payload.message==='pause this task'){reply.content='Controlled actual target question';reply.controlStatus='choose_target';reply.controlResults=[];
        reply.controlResolution={kind:'clarification',scope:state.scope,humanTurnId:turnId,sourceMessageId,originalText:source.content,command:'pause',requestDigest:'c'.repeat(64),reason:'choose_target',
          candidates:state.activity.runs.map((r,index)=>({runId:r.runId,dispatchId:r.dispatchId,title:'Controlled task '+(index+1),state:r.state,expectedRevision:r.stateRevision,controlEpoch:r.controlEpoch}))};}
      state.messages.push(source,reply);state.revision++;break;
    }
    case 'assistantControl': {
      if(Object.keys(payload).length!==7)throw Error('Unexpected human control fields');
      const reply=state.messages.find(m=>m.controlResolution?.humanTurnId===payload.humanTurnId),resolution=reply?.controlResolution;
      const source=state.messages.find(m=>m.id===payload.sourceMessageId&&m.role==='user'&&m.turnId===payload.humanTurnId);
      const candidate=resolution?.candidates.find(c=>c.runId===payload.runId),run=state.activity.runs.find(r=>r.runId===payload.runId);
      if(!source||source.content!==resolution.originalText||resolution.sourceMessageId!==source.id||payload.requestDigest!==resolution.requestDigest
        ||!candidate||candidate.expectedRevision!==payload.expectedRevision||candidate.controlEpoch!==payload.controlEpoch||run.controlEpoch!==candidate.controlEpoch||run.stateRevision!==candidate.expectedRevision)throw Error('Controlled human target binding mismatch');
      await new Promise(r=>setTimeout(r,120));run.state='pausing';run.stateRevision++;run.controlEpoch++;
      reply.controlResolution={...resolution,kind:'proposal',candidates:[candidate],requestDigest:'d'.repeat(64),reason:'chosen_target'};
      reply.controlStatus='completed';reply.controlResults=[copy(run)];state.revision++;
      return{ok:true,value:{...copy(state),controlOutcome:{status:'completed',results:[copy(run)]}}};
    }
    case 'cancelAssistantTurn': assertRevision(payload,state.revision);state.messages=state.messages.map(m=>m.turnId===payload.turnId&&m.role==='assistant'?{...m,pending:false,content:'Stopped by user'}:m);state.revision++;return {ok:true,value:{cancelled:true,turnId:payload.turnId}};
    case 'globalActivity': return {ok:true,value:{schemaVersion:1,backendProfileId:backend,observedAt:at(),spaces:Object.entries(scopes).map(([name,scope])=>({spaceName:'Space '+name,scope,workspacePath:'C:\\controlled\\'+name.toLowerCase(),activity:{...copy(snapshots[name].activity),observedAt:at(),watermark:sequences[name]}}))}};
    default: throw new Error('Unexpected controlled operation '+request.operation);
  }
  return {ok:true,value:copy(state)};
}};
function assertRevision(payload,revision){if(payload.expectedRevision!==revision)throw new Error('Controlled CAS mismatch '+payload.expectedRevision+' / '+revision);}
const controller=new IndependentAssistantController(new IndependentAssistantClient(transport));
const nativeCalls=[],nativeListeners=new Set(),nativeModes={A:{schemaVersion:1,mode:'action',lifetime:'chat',revision:0},B:{schemaVersion:1,mode:'action',lifetime:'chat',revision:0}},nativeGoalRevisions={A:4,B:2};
const nativeSessions=Object.fromEntries(['A','B'].map(name=>[name,{session_id:'native-'+name.toLowerCase(),space_scope:scopes[name],workspace:'C:\\controlled\\'+name.toLowerCase(),goal:null,messages:[{role:'user',content:'Real parent request in controlled transport'}]}]));
const nativeChildren=Object.fromEntries(['A','B'].map(name=>[name,[1,2].map(index=>({schemaVersion:1,scope:scopes[name],parentSessionId:nativeSessions[name].session_id,parentTurnId:'parent-'+name.toLowerCase(),subagentId:'child-'+name.toLowerCase()+'-'+index,parentSubagentId:null,childSessionId:'child-session-'+name.toLowerCase()+'-'+index,depth:1,model:{provider:'controlled-provider',model:'model-'+name.toLowerCase()},status:'running',revision:1,watermark:1,observedAt:at(),messages:[{id:'answer:child-'+name.toLowerCase()+'-'+index,role:'assistant',content:'Genuine child '+index+' answer',at:at()}],sourceActuality:'partial'}))]));
const nativeName=request=>request.workspacePath.endsWith('a')?'A':'B';
const nativePolicies=Object.fromEntries(['A','B'].map(name=>[name,{schemaVersion:1,scope:scopes[name],sessionId:nativeSessions[name].session_id,revision:0,mode:'fixed',allowedModels:[],orchestrator:null,cloudPolicy:'deny',allowedCloudDataClasses:[],budget:{requestsPerMinute:6,tokensPerMinute:100000,maxConcurrent:1,maxCostMicrousdPerMinute:null,maxOutputTokens:2048},updatedAt:at()}]));
const autoAvailability={A:false,B:false};
const nativeGrills={A:null,B:null},nativeGrillHistory={A:[],B:[]},grillReceipts={},grillFaults={error:null};
const grillView=state=>state?{...copy(state),coverage:state.topics.map(topic=>({topicId:topic.id,label:topic.label,status:state.questions.some(q=>q.topicId===topic.id&&q.answer&&q.answer.kind!=='skipped')?'answered':state.questions.some(q=>q.topicId===topic.id&&q.answer)?'skipped':'unresolved'})),summary:state.questions.map(q=>({questionId:q.questionId,prompt:q.prompt,answer:q.answer?.kind==='choice'?q.options.find(o=>o.id===q.answer.choiceId).label:q.answer?.kind==='text'?q.answer.text:null,status:q.answer?.kind??'unanswered'})),canFinish:state.status!=='finished'}:null;
window.lastbrowser={independent:transport,system:{openExternal:async()=>{navigation.signIn++}},sidekick:{requestWebui:async()=>({}),setDefaultModel:async()=>{throw Error('Global default must not be written')},
 grill:async request=>{nativeCalls.push({operation:'grill',...copy(request)});const name=nativeName(request),state=nativeGrills[name];
   if(request.action==='get')return{ok:true,grill:grillView(state),grillHistory:nativeGrillHistory[name].map(grillView)};
   if(grillFaults.error){const error=grillFaults.error;grillFaults.error=null;return{ok:false,error};}
   if(grillReceipts[request.clientRequestId])return{ok:true,replayed:true,commandRevision:grillReceipts[request.clientRequestId],grill:grillView(state)};
   assertRevision(request,state?.revision??0);await new Promise(r=>setTimeout(r,70));
   if(request.action==='start'){if(state&&state.status!=='finished')throw Error('Actual Grill already started');if(state)nativeGrillHistory[name].push(copy(state));
     nativeGrills[name]={schemaVersion:1,scope:scopes[name],sessionId:nativeSessions[name].session_id,revision:(state?.revision??0)+1,modeRevision:nativeModes[name].revision,status:'asking',objective:request.objective,topics:[],questions:[]};}
   else{if(request.action==='answer'||request.action==='skip'){const question=state.questions.find(q=>q.questionId===request.questionId);if(!question||question.revision!==request.questionRevision)throw Error('Actual question CAS');
       question.answer=request.action==='skip'?{kind:'skipped',choiceId:null,text:null}:request.choiceId?{kind:'choice',choiceId:request.choiceId,text:null}:{kind:'text',choiceId:null,text:request.text};question.revision++;}
     else state.status={review:'review',resume:'asking',finish:'finished'}[request.action];if(request.action==='resume')state.modeRevision=nativeModes[name].revision;state.revision++;}
   const updated=nativeGrills[name];grillReceipts[request.clientRequestId]=updated.revision;nativeSessions[name].grill_state=grillView(updated);return{ok:true,grill:grillView(updated)};},
 controlChat:async request=>{nativeCalls.push({operation:'controlChat',...copy(request)});const name=nativeName(request);await new Promise(resolve=>setTimeout(resolve,80));const session=nativeSessions[name];
   if(request.command==='approval'||request.command==='clarify'){const pending=session.native_controls?.pendingControls.find(entry=>entry.requestId===request.requestId&&entry.type===request.command);if(!pending)throw Error('Exact request missing');session.native_controls.pendingControls=session.native_controls.pendingControls.filter(entry=>entry!==pending);}
   return{schemaVersion:1,scope:scopes[name],sessionId:request.sessionId,streamId:request.streamId,accepted:true,state:['cancel','pause'].includes(request.command)?'stopping':'submitted'};},
 onChatStreamEvent:callback=>{nativeListeners.add(callback);return()=>nativeListeners.delete(callback)},
 childHistory:async request=>{nativeCalls.push({operation:'childHistory',...copy(request)});const name=nativeName(request);return{schemaVersion:1,scope:scopes[name],parentSessionId:nativeSessions[name].session_id,parentTurns:['parent-'+name.toLowerCase()],runs:copy(nativeChildren[name]),events:[],resyncNeeded:false}},
 modelPolicy:async request=>{nativeCalls.push({operation:'modelPolicy',...copy(request)});const name=nativeName(request),policy=nativePolicies[name];
   if(request.action==='set'){assertRevision(request,policy.revision);await new Promise(r=>setTimeout(r,100));Object.assign(policy,copy(request.draft),{revision:policy.revision+1,updatedAt:at()});traceOrder.push('policy-mode:'+policy.mode);}
   return{schemaVersion:1,scope:scopes[name],sessionId:nativeSessions[name].session_id,policy:copy(policy),status:policy.allowedModels.map(pair=>({provider:pair.provider,snapshots:[{schemaVersion:1,provider:'observed-alias',groupKey:'actual-shared-group',observedAt:at(),observedRequestId:null,source:'response_headers',buckets:[{resource:'tokens',limit:100,remaining:null,resetAt:null}],retryAt:null,actionRequired:false,statusCode:200,stale:true}]})),executionAvailability:{available:autoAvailability[name],sealedWorker:autoAvailability[name],managedCallAuthorizer:false,...(!autoAvailability[name]?{reasonCode:'native_auto_execution_adapter_required'}:{})}};},
 chatMode:async request=>{nativeCalls.push({operation:'chatMode',...copy(request)});const name=nativeName(request),mode=nativeModes[name];
   if(request.action==='set'){assertRevision(request,mode.revision);await new Promise(r=>setTimeout(r,120));mode.mode=request.mode;mode.lifetime=request.lifetime;mode.revision++;}
   return{ok:true,mode:copy(mode),capabilities:{plan:true,grill_me:true,boost:true,goal:true,gquota:false,plugins:false},session:copy(nativeSessions[name])};},
 goalMigration:async request=>{nativeCalls.push({operation:'goalMigration',...copy(request)});const name=nativeName(request),session=nativeSessions[name],revision=nativeGoalRevisions[name];
   const common={ok:true,schemaVersion:1,scope:scopes[name],sessionId:session.session_id,sourceNamespace:'lbws-'+ 'b'.repeat(32),targetNamespace:'research',sourceDigest:'a'.repeat(64),continuationStarted:false};
   if(request.action==='review')return{...common,sourceRevision:revision,sourceClaimsDigest:'c'.repeat(64),goal:copy(session.goal),targetDigest:migrationCopies[name]?'a'.repeat(64):null,targetConflict:!!migrationCopies[name]};
   if(request.expectedSourceRevision!==revision||request.expectedSourceDigest!==common.sourceDigest||!request.clientRequestId)throw Error('Exact migration CAS missing');
   if(!migrationReceipts[request.clientRequestId]){migrationReceipts[request.clientRequestId]={name,revision};migrationCopies[name]=(migrationCopies[name]||0)+1;}
   else if(migrationReceipts[request.clientRequestId].name!==name||migrationReceipts[request.clientRequestId].revision!==revision)throw Error('Migration UUID conflict');
   if(migrationFaults.loseAck){migrationFaults.loseAck=false;throw Error('Controlled lost migration ACK after target copy');}
   session.goal={...session.goal,space:'research'};return{...common,goalRevision:revision,state:'migrated'};
 },
 goalCommand:async request=>{nativeCalls.push({operation:'goalCommand',...copy(request)});const name=nativeName(request),session=nativeSessions[name];
   if(request.args!=='status'&&nativeGoalFaults.error){const error=nativeGoalFaults.error;nativeGoalFaults.error=null;nativeGoalRevisions[name]++;session.goal={...session.goal,revision:nativeGoalRevisions[name],...(error==='goal_owned_by_run'?{continuation_owner:'independent_run'}:{})};return{ok:false,error};}
   if(request.args!=='status'&&nativeGoalFaults.delay)await new Promise(resolve=>setTimeout(resolve,nativeGoalFaults.delay));
   if(request.args!=='status'){assertRevision(request,nativeGoalRevisions[name]);if(!request.clientRequestId)throw Error('Missing actual Goal request identity');nativeGoalRevisions[name]++;
     if(request.args==='pause'||request.args==='resume')session.goal={...session.goal,status:request.args==='pause'?'paused':'active',revision:nativeGoalRevisions[name]};
     else if(request.args==='clear')session.goal=null;
     else session.goal={session_id:session.session_id,goal:request.args,status:'active',revision:nativeGoalRevisions[name],turns_used:0,max_turns:3,pending_judge:false,continuation_owner:'legacy_chat'};}
   return{ok:true,action:request.args==='status'?'status':'set',revision:nativeGoalRevisions[name],goal:copy(session.goal)};}
}};
const navigation={entered:0,workChats:0,spaceLinks:0,closed:0,overviewClosed:0,signIn:0,createdSessions:0,browserLogins:0,sent:[]};
let choose,showNative,showStart,showLocal,showAssistant,chooseLocale,activateNative,refreshNative,remountNative,remountAssistant;
function NativeChatMain(props){const [mount,setMount]=useState(0);remountNative=()=>setMount(value=>value+1);return <NativeChatMainComponent key={mount} {...props}/>;}
function LocaleBinding(){const{setLocale}=useDesktopI18n();chooseLocale=setLocale;return null;}
function Fixture(){
 const [name,setName]=useState('A'),[open,setOpen]=useState(true),[assistantEpoch,setAssistantEpoch]=useState(0),[overview,setOverview]=useState(false),[native,setNative]=useState(false),[start,setStart]=useState(false),[local,setLocal]=useState(false),[nativeActive,setNativeActive]=useState(false),[nativeText,setNativeText]=useState(''),[,setNativeEpoch]=useState(0);choose=setName;showNative=()=>{setNative(true);setLocal(false)};showStart=()=>{setNative(false);setLocal(false);setStart(true)};showLocal=()=>{setNative(false);setStart(false);setLocal(true)};showAssistant=()=>{setNative(false);setStart(false);setLocal(false);setOpen(true)};activateNative=()=>setNativeActive(true);refreshNative=()=>setNativeEpoch(value=>value+1);remountAssistant=()=>setAssistantEpoch(value=>value+1);
 const selection={schemaVersion:1,scope:scopes[name],spaceName:'Space '+name,workspacePath:'C:\\controlled\\'+name.toLowerCase(),bindingRevision:1,setupStatus:'legacy'};
 return <DesktopI18nProvider><LocaleBinding/><main><h1>Controlled Lastbrowser renderer probe</h1><p>Real mounted components; deterministic backend responses.</p>
  {open&&<SpaceAssistantPanel key={assistantEpoch} selection={selection} controller={controller} beginSetup={name==='A'} onClose={()=>{navigation.closed++;setOpen(false)}} onOpenWorkChat={()=>navigation.workChats++} onOpenGlobalOverview={()=>setOverview(true)} onEnterSpace={()=>{navigation.entered++}} onOpenProviderSettings={()=>{}} />}
 {overview&&<IndependentActivityOverview scope={scopes[name]} controller={controller} onClose={()=>{navigation.overviewClosed++;setOverview(false)}} onOpenSpace={async()=>{navigation.spaceLinks++}}/>}
 {native&&<NativeChatMain activeSession={nativeActive?copy(nativeSessions[name]):null} activeSessionId={nativeActive?nativeSessions[name].session_id:null} busy={false} chatError="" messages={nativeActive?nativeSessions[name].messages:[]} runState="idle" composerMode="action" composerText={nativeText} serviceStatus={{sidekick:'ready',webuiHealth:'ready',webuiUrl:'http://controlled.invalid'}} sessionLoading={false} setupModel="" activeSpacePath={selection.workspacePath} activeBrowserProfileId="controlled" showTokenUsage={false} showTps={false} showThinking={false} simplifiedToolCalling={true} latestTurnUsage={null} onComposerMode={()=>{}} onComposerText={setNativeText} onCreateSession={()=>navigation.createdSessions++} onSend={message=>{navigation.sent.push({scope:name,message});setNativeText('')}} onStop={()=>{}} onCommandAction={async action=>{if(action.kind==='goal_command'){await requestNativePersistentGoalCommand(request=>window.lastbrowser.sidekick.goalCommand(request),action.args,{sessionId:action.context.sessionId,profileId:action.context.profileId,browserProfileId:action.context.browserProfileId,workspace:action.context.spacePath,expectedRevision:action.expectedRevision,clientRequestId:action.clientRequestId});refreshNative();}}}/>}
 {start&&<NativeBrowserStartPage bookmarks={[]} visits={[]} spaces={[{path:selection.workspacePath,name:'Space '+name,emoji:'🧪'}]} activeSpacePath={selection.workspacePath} activeProfileId="controlled" onNavigate={()=>{}} onSelectSpace={()=>navigation.spaceLinks++} onAddSpace={(path,name)=>{navigation.createdSpace={path,name}}}/>}
 {local&&<LocalAiSetupPane key={name} browserProfileId="controlled" workspacePath={selection.workspacePath} ready={true}/>}
 </main></DesktopI18nProvider>;
}
window.__independentSmoke={scopes,snapshots,models,connections,bindings,definitions,permissionStates,delays,calls,navigation,nativeCalls,nativeModes,nativeSessions,nativeChildren,activateNative:()=>activateNative(),childDelta:(name,index,delta,foreign=false)=>{const child=nativeChildren[name][index];const event={...copy(child),kind:'answer_delta',sequence:child.watermark+1,payload:{delta},at:at()};delete event.messages;if(foreign)event.scope=scopes[name==='A'?'B':'A'];else{child.messages[0].content+=delta;child.watermark++;child.revision++;}for(const listener of nativeListeners)listener({streamId:child.parentTurnId,event:'subagent_event',data:{childEvent:event}});},locale:value=>chooseLocale(value),showNative:()=>showNative(),showStart:()=>showStart(),select:name=>choose(name),entry:name=>copy(useSpaceAssistantStore.getState().entries[assistantScopeKey(scopes[name])]),poll:name=>controller.poll(scopes[name]),load:name=>controller.load(scopes[name]),dispose:()=>controller.dispose(),foreign:()=>{foreign=true},delta:(name,delta,stale=false)=>{
 const state=snapshots[name],assistant=state.messages.findLast(m=>m.role==='assistant'),user=state.messages.find(m=>m.role==='user'&&m.turnId===assistant?.turnId);
 if(!stale&&assistant?.pending)assistant.content+=delta;
 queues[name].push({schemaVersion:1,eventId:id(),scope:scopes[name],seq:++sequences[name],at:at(),kind:'assistant',payload:{conversationId:state.conversationId,turnId:assistant.turnId,requestId:user.clientRequestId,delta,revision:stale?state.revision-1:state.revision}});
}};
Object.assign(window.__independentSmoke,{browserFlows,browserFaults,nativeGoalFaults,nativeGoalRevisions,nativePolicies,autoAvailability,traceOrder,localState,localScans,localRuntime,runtimeFaults,showLocal:()=>showLocal(),showAssistant:()=>showAssistant(),showNativeAgain:()=>showNative(),refreshNative:()=>refreshNative(),controlRecovery:()=>{
  useNativeChatControls.setState({records:{}});nativeSessions.A.native_controls={schemaVersion:1,scope:scopes.A,sessionId:nativeSessions.A.session_id,streamId:'native-a',writerGeneration:id(),processExited:false,status:'running',pendingControls:[]};
  const snapshot=nativeSessions.A.native_controls;snapshot.pendingControls=[{schemaVersion:1,type:'approval',requestId:'approval-exact-a',scope:scopes.A,sessionId:nativeSessions.A.session_id,streamId:'native-a',writerGeneration:snapshot.writerGeneration,data:{command:'controlled write',description:'Controlled approval'}},{schemaVersion:1,type:'clarify',requestId:'question-exact-a',scope:scopes.A,sessionId:nativeSessions.A.session_id,streamId:'native-a',writerGeneration:snapshot.writerGeneration,data:{question:'Which controlled file?',choices_offered:['First','Second']}}];refreshNative();
}});
Object.assign(window.__independentSmoke,{nativeGrills,nativeGrillHistory,grillFaults,grillQuestion:(name,invalid=null)=>{
  const state=nativeGrills[name],snapshot=nativeSessions[name].native_controls;let value=grillView(state);
  if(!invalid){const index=state.questions.length+1,topicId='topic-'+index;state.topics.push({id:topicId,label:'Actual topic '+index});state.questions.push({questionId:'question-'+index,revision:0,topicId,prompt:'Controlled actual question '+index,options:[1,2,3,4].slice(0,index%2?3:4).map(i=>({id:'option-'+i,label:'Actual option '+i})),allowFreeText:true,answer:null});state.revision++;value=grillView(state);nativeSessions[name].grill_state=value;const question=state.questions.at(-1);nativeSessions[name].messages=[...nativeSessions[name].messages,{role:'assistant',content:question.prompt,grill_question:{questionId:question.questionId,revision:question.revision}}];refreshNative();}
  const context={schemaVersion:1,scope:scopes[name],sessionId:nativeSessions[name].session_id,streamId:snapshot.streamId,writerGeneration:snapshot.writerGeneration};
  const data={...copy(context),grill:value};if(invalid==='foreign')data.scope=scopes[name==='A'?'B':'A'];if(invalid==='generation')data.writerGeneration=id();
  if(invalid==='shape')data.grill={...value,questions:[{...value.questions[0],options:[{id:'only',label:'Only one fake option'}]}]};
  for(const listener of nativeListeners)listener({streamId:context.streamId,event:'grill',nativeContext:context,data});
},grillFallback:name=>{const snapshot=nativeSessions[name].native_controls,context={schemaVersion:1,scope:scopes[name],sessionId:nativeSessions[name].session_id,streamId:snapshot.streamId,writerGeneration:snapshot.writerGeneration};
  nativeSessions[name].messages=[...nativeSessions[name].messages,{role:'assistant',content:'Genuine unstructured model answer for manual clarification.',grill_fallback:{reason:'invalid_structured_question',streamId:context.streamId,writerGeneration:context.writerGeneration}}];refreshNative();for(const listener of nativeListeners)listener({streamId:context.streamId,event:'grill_fallback',nativeContext:context,data:{...copy(context),reason:'invalid_structured_question',readableText:'Genuine unstructured model answer for manual clarification.'}});
}});
Object.assign(window.__independentSmoke,{migrationFaults,migrationCopies,migrationReceipts,remountNative:()=>remountNative(),remountAssistant:()=>remountAssistant(),sendStreamEvent:payload=>{for(const listener of nativeListeners)listener(payload);},bindStream:(name,streamId)=>{const session=nativeSessions[name];session.active_stream_id=streamId;if(streamId){useNativeChatControls.getState().bind({scope:scopes[name],sessionId:session.session_id,streamId,workspacePath:'C:\\controlled\\'+name.toLowerCase(),browserProfileId:'controlled'});}refreshNative();}});
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
`;

async function parent() {
  const root = path.resolve(__dirname, '../../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-independent-renderer-'));
  try {
    require('esbuild').buildSync({ stdin: { contents: fixture, loader: 'tsx', resolveDir: path.join(root, 'apps/desktop') },
      bundle: true, platform: 'browser', format: 'iife', target: 'chrome130', loader:{'.woff2':'dataurl'}, outfile: path.join(temp, 'fixture.js') });
    for(const file of ['lastbrowser-logo.png','sidekick-avatar.png'])fs.copyFileSync(path.join(root,'brand/assets',file),path.join(temp,file));
    fs.writeFileSync(path.join(temp, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:"><link rel="stylesheet" href="fixture.css"><style>:root{--bg:#10141b;--bg-primary:#10141b;--bg-secondary:#18212d;--bg-tertiary:#202c3a;--text:#edf3fa;--text-primary:#edf3fa;--text-secondary:#b8c5d5;--border:#35445a;--border-color:#35445a;--accent:#82b6ff;--accent-color:#82b6ff}body{margin:0;background:#10141b;color:#edf3fa;font:15px system-ui}main{padding:24px}main>.space-assistant{position:absolute;right:24px;top:24px;height:calc(100vh - 48px);width:520px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const selectedMode=['--ux-only','--child-only','--goal-only','--model-picker-only','--local-ai-only'].find(mode=>process.argv.includes(mode));
    const child = spawn(require('electron'), [__filename, '--electron-child', temp, ...(selectedMode?[selectedMode]:[])], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '', stdout = '';
    child.stdout.on('data', value => { stdout += value.toString(); });
    child.stderr.on('data', value => { stderr += value.toString(); });
    const timer = setTimeout(() => child.kill(), 55000);
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    clearTimeout(timer);
    if (fs.existsSync(path.join(temp, 'phases.jsonl'))) process.stdout.write(fs.readFileSync(path.join(temp, 'phases.jsonl'), 'utf8'));
    assert.equal(result.code, 0, `Renderer probe failed ${JSON.stringify(result)}: ${stderr.slice(-7000)} ${stdout.slice(-2000)}`);
    process.stdout.write(JSON.stringify({ phase: 'parent:passed', installedPackage: require('electron/package.json').version, pid: child.pid,
      evidence: 'real mounted React components and clicks in installed Castlabs; deterministic purpose bridge transport; no full Main/Python/model E2E' })+'\n');
  } finally {
    const resolved = path.resolve(temp);
    assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert(path.basename(resolved).startsWith('lastbrowser-independent-renderer-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
async function electronChild(temp, mode='') {
  const { app, BrowserWindow } = require('electron');
  const root = path.resolve(__dirname, '../../..');
  app.setPath('userData', path.join(temp, 'user-data'));
  const log = (phase, detail = {}) => fs.appendFileSync(path.join(temp, 'phases.jsonl'), JSON.stringify({ phase, at: new Date().toISOString(), ...detail })+'\n');
  let window;
  const timeout = setTimeout(() => { log('watchdog'); app.exit(72); }, 45000);
  try {
    await app.whenReady();
    window = new BrowserWindow({ show: false, width: 1440, height: 1040, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
    window.webContents.on('console-message', event => { if (event.level >= 2) log('renderer-console', { level: event.level, message: event.message }); });
    await window.loadFile(path.join(temp, 'index.html'));
    const run = code => window.webContents.executeJavaScript(code).catch(error=>{throw Error(`${error.message}; probe ${code.slice(0,160)}`);});
    const until = async (code, message) => { const end=Date.now()+6000; while(Date.now()<end) { if(await run(code))return; await new Promise(r=>setTimeout(r,30)); } log('timeout-state',await run(`({backendInterview:window.__independentSmoke.snapshots.A.interview?.stage??null,backendRevision:window.__independentSmoke.snapshots.A.revision,entryInterview:window.__independentSmoke.entry('A').snapshot?.interview?.stage??null,entryRevision:window.__independentSmoke.entry('A').snapshot?.revision,loading:window.__independentSmoke.entry('A').loading,busy:window.__independentSmoke.entry('A').busy,error:window.__independentSmoke.entry('A').error?.code,setupOpen:document.querySelector('.space-assistant-setup')?.open,setupSections:[...document.querySelectorAll('.space-assistant-subdisclosure')].map(d=>({open:d.open,summary:d.querySelector('summary')?.textContent})),headings:[...document.querySelectorAll('.space-assistant-scroll h3')].map(h=>h.textContent),goalCalls:window.__independentSmoke.nativeCalls.filter(c=>c.operation==='goalCommand').slice(-5),goalB:window.__independentSmoke.nativeSessions.B.goal,goalUi:document.querySelector('.native-chat-main')?.textContent.slice(-800),resetModes:window.__independentSmoke.calls.filter(c=>c.operation==='assistantReset').map(c=>({mode:c.payload.mode,revision:c.payload.expectedRevision})),formError:document.querySelector('.independent-assistant-reset [role=alert]')?.textContent})`));throw new Error(message); };
    const button = (text, selector = 'button') => run(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button '+${JSON.stringify(text)});if(b.disabled)throw Error('Disabled button '+${JSON.stringify(text)});b.click()})()`);
    const input = (selector, value) => run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    const openSetupSection = index => run(`(()=>{const panel=document.querySelector('.space-assistant-setup');if(!panel)throw Error('Setup disclosure missing');if(!panel.open)panel.querySelector(':scope > summary').click();const section=panel.querySelectorAll('.space-assistant-subdisclosure')[${index}];if(!section)throw Error('Setup section missing: '+${index});if(!section.open)section.querySelector('summary').click()})()`);
    const capture = async name => {await new Promise(resolve=>setTimeout(resolve,200));const destination=path.join(root,'apps/desktop/dist',name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());return destination;};
    const key=async(keyCode,modifiers=[])=>{window.show();window.focus();window.webContents.focus();window.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});if(keyCode==='Enter')window.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers});window.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await new Promise(resolve=>setTimeout(resolve,40));window.hide();};
    if(mode){
      await until(`typeof window.__independentSmoke?.select==='function'`, 'Controlled fixture did not initialize');
      await run(`window.__independentSmoke.select('B')`);
      await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space B'&&!!window.__independentSmoke.entry('B')?.snapshot&&!window.__independentSmoke.entry('B')?.loading`, 'B Space Assistant did not load');
      await until(`!document.querySelector('.space-assistant-setup').open&&!document.querySelector('.space-assistant-activity').open`, 'Space scope change did not restore simple conversation defaults');
      await run(`(()=>{const panel=document.querySelector('[data-testid=space-assistant-panel]');panel.style.width='100%';panel.style.insetInline='0'})()`);window.setContentSize(320,700);
      await until(`innerWidth===320`, '320px assistant viewport did not apply');
      assert(await run(`(()=>{const p=document.querySelector('[data-testid=space-assistant-panel]')?.getBoundingClientRect(),c=document.querySelector('.space-assistant-composer')?.getBoundingClientRect(),i=document.querySelector('.space-assistant-composer textarea')?.getBoundingClientRect();return !!p&&!!c&&!!i&&p.left>=0&&p.right<=innerWidth&&c.left>=0&&c.right<=innerWidth&&c.bottom<=innerHeight&&i.width>0&&i.bottom<=innerHeight})()`));
      await run(`document.querySelector('.space-assistant-composer textarea').focus()`);assert(await run(`document.activeElement===document.querySelector('.space-assistant-composer textarea')`));
      assert(await run(`window.__independentSmoke.entry('B').snapshot.activity.activeChats.length>0`));
      await run(`document.querySelector('.space-assistant-activity > summary').click()`);
      assert(await run(`document.querySelectorAll('.space-assistant-activity-content .space-assistant-card').length===window.__independentSmoke.entry('B').snapshot.activity.activeChats.length`));
      await run(`document.querySelector('.space-assistant-activity > summary').click();window.__independentSmoke.remountAssistant()`);
      await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space B'&&!document.querySelector('.space-assistant-setup').open&&!document.querySelector('.space-assistant-activity').open`, 'Remount restored wrong scope activity or UI mode');
      log('space-assistant-simple-ux:passed',{scopeReset:true,setupClosed:true,activityClosedByDefault:true,actualActiveChatsRendered:true,composerVisibleAndFocusedAt320px:true,remountSameScope:true});
      if(mode==='--local-ai-only'){
        window.setContentSize(1440,1040);await run(`window.__independentSmoke.select('A');window.__independentSmoke.showLocal()`);
        await until(`document.querySelector('.local-ai-step')?.textContent.includes('Controlled CPU')`, 'Independent hardware inventory did not render');
        await until(`document.querySelector('.local-ai-step[aria-labelledby="local-ai-step-recommend"]')?.textContent.includes('Controlled/LocalAI')`, 'Scoped recommendation did not render a model and role');
        assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='localAiHardwareInventory').length`),1);
        assert.equal(await run(`window.__independentSmoke.calls.find(c=>c.operation==='localAiHardwareInventory').scope===undefined`),true);
        assert(await run(`document.querySelector('.local-ai-step[aria-labelledby="local-ai-step-recommend"]').textContent.includes('Agent')`));
        assert(await run(`document.querySelector('.local-ai-step[aria-labelledby="local-ai-step-recommend"]').textContent.includes('96 B')`));
        assert(await run(`document.querySelector('.local-ai-step[aria-labelledby="local-ai-step-setup"]').textContent.includes('Downloaded files alone do not make inference available')`));
        let simpleSetupClicks=0;
        await button('Save preference','.local-ai-step[aria-labelledby="local-ai-step-setup"] button');simpleSetupClicks++;
        await until(`!!document.querySelector('.local-ai-plan')`, 'Simple recommendation did not prepare a review');
        assert(await run(`[...document.querySelectorAll('.local-ai-plan button')].find(button=>button.textContent==='Start download').disabled`));
        await run(`document.querySelector('.local-ai-plan input[type=checkbox]').click()`);simpleSetupClicks++;
        await button('Start download','.local-ai-plan button');simpleSetupClicks++;
        await until(`!!document.querySelector('[data-local-ai-job]')`, 'Three-click simple setup did not start its reviewed download');
        assert.equal(simpleSetupClicks,3);
        assert(await run(`document.querySelector('[data-local-ai-job]').textContent.includes('16 B / 96 B')`));
        await button('Cancel','.local-ai-setup [data-local-ai-job] button');
        await until(`document.querySelector('[data-local-ai-job]').textContent.includes('Stopping')`, 'Cancellation did not preserve the stopping state');
        await run(`(()=>{const job=window.__independentSmoke.localState.A.jobs[0];job.state='cancelled';job.revision++;job.updatedAt=new Date().toISOString()})()`);
        await until(`document.querySelector('[data-local-ai-job]').textContent.includes('Cancelled')`, 'Actual cancelled response did not update the setup UI');
        await button('Start download','.local-ai-setup [data-local-ai-job] button');
        await until(`window.__independentSmoke.localState.A.jobs.length===2&&document.querySelectorAll('[data-local-ai-job]').length===2`, 'Cancelled download did not retry against the same reviewed plan');
        assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='localAi'&&c.payload.action==='setup'&&c.payload.request.operation==='start').length`),2);
        log('local-ai-simple-flow:passed',{threeUserActionsToReviewedFileDownload:true,exactConsentRequired:true,progressVisible:true,cancelWaitsForBackendState:true,cancelledJobRetryUsesSamePlan:true,inferenceUnavailableStated:true,controlledTransportOnly:true});
        await button('Advanced','.local-ai-mode button');
        await until(`[...document.querySelectorAll('.local-ai-model')].some(model=>model.textContent.includes('controlled:unsupported-model'))`, 'Advanced recommendations did not render model support controls');
        assert.equal(await run(`!![...document.querySelectorAll('.local-ai-advanced .local-ai-model input')].find(input=>input.closest('.local-ai-model')?.textContent.includes('controlled:unsupported-model')&&input.disabled)`),true);
        assert.equal(await run(`!![...document.querySelectorAll('.local-ai-advanced .local-ai-model input')].find(input=>input.closest('.local-ai-model')?.textContent.includes('controlled:files')&&!input.disabled)`),true);
        assert.equal(await run(`window.__independentSmoke.localState.A.preferences.decision`),'local');
        log('local-ai-advanced-ui:passed',{unsupportedSelectionBlocked:true,simpleChoiceRetainedInAdvanced:true,controlledTransportOnly:true});
        await run(`window.__independentSmoke.select('B')`);
        await until(`document.querySelector('.local-ai-step[aria-labelledby="local-ai-step-recommend"]')?.textContent.includes('Controlled/LocalAI')&&window.__independentSmoke.localState.B.preferences.decision==='undecided'`, 'Second Space did not mount its own undecided Local AI setup');
        assert.equal(await run(`window.__independentSmoke.localState.B.jobs.length`),0);
        await button('Continue without local AI','.local-ai-step button');
        await until(`window.__independentSmoke.localState.B.preferences.decision==='skip'`, 'Second Space Local AI choice did not persist');
        await run(`window.__independentSmoke.select('A')`);
        await until(`document.querySelectorAll('[data-local-ai-job]').length===2&&window.__independentSmoke.localState.A.preferences.decision==='local'`, 'Returning to the original Space did not recover its local choice and download history');
        log('local-ai-space-isolation:passed',{spaceBStartsUndecided:true,spaceBSkipPersisted:true,spaceAChoiceAndJobsRecovered:true,controlledTransportOnly:true});
        assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='localAi'&&c.payload.action==='setup'&&c.payload.request.operation==='start').length`),2);
        log('local-ai-three-step-ui:passed',{automaticScopeFreeScan:true,scopeBoundRecommendation:true,modelRoleShown:true,unsupportedSelectionBlocked:true,simpleChoiceRetainedInAdvanced:true,noPlanOrDownloadWithoutReview:true});
        await run(`window.__independentSmoke.dispose()`);clearTimeout(timeout);window.destroy();app.quit();return;
      }
      if(mode==='--model-picker-only'){
        window.setContentSize(1440,1040);await run(`window.__independentSmoke.select('A');window.__independentSmoke.showNative()`);
        await until(`document.querySelector('.composer-model select')?.value==='@controlled-provider:model-a'`, 'Native chat did not mount for model picker UI');
        await run(`window.__independentSmoke.activateNative()`);
        await until(`!!document.querySelector('#composer-manual-models')===false&&!!document.querySelector('[aria-label="Reasoning depth"]')`, 'Native model controls did not load');
        await button('Choose model manually','.composer-command-button');
        await until(`!!document.querySelector('#composer-manual-models')`, 'Manual model catalog did not open');
        assert(await run(`document.querySelector('#composer-manual-models').textContent.includes('Extra local model')`));
        assert(await run(`document.querySelector('#composer-manual-models').textContent.includes('Unavailable in this build')`));
        assert.equal(await run(`[...document.querySelectorAll('#composer-manual-models button')].find(button=>button.textContent.includes('Unavailable model')).disabled`),true);
        await input('#composer-manual-models input[type=search]','Extra local');
        assert.equal(await run(`document.querySelectorAll('#composer-manual-models button').length`),1);
        await input('#composer-manual-models input[type=search]','Literal local');
        await run(`(()=>[...document.querySelectorAll('#composer-manual-models button')].find(button=>button.textContent.includes('Literal local model')).click())()`);
        await until(`window.__independentSmoke.models.A.model==='gemma4:31b'&&document.querySelector('.composer-model select')?.value==='@custom:local:gemma4:31b'`, 'Manual literal model selection did not commit to its provider');
        assert(await run(`document.activeElement===document.querySelector('.composer-toolbar button[aria-controls="composer-manual-models"]')`));
        assert.deepEqual(await run(`[...document.querySelector('[aria-label="Reasoning depth"]').options].map(option=>option.value)`),['','low','high']);
        await run(`(()=>{const select=document.querySelector('[aria-label="Reasoning depth"]');select.value='high';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        assert.equal(await run(`document.querySelector('[aria-label="Reasoning depth"]').value`),'high');
        await button('Choose model manually','.composer-command-button');await key('Escape');
        assert.equal(await run(`document.querySelector('#composer-manual-models')`),null);
        assert(await run(`document.activeElement===document.querySelector('.composer-toolbar button[aria-controls="composer-manual-models"]')`));
        await run(`(()=>{const picker=document.querySelector('.composer-model select');picker.value='teamwork';picker.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        await until(`document.querySelector('.composer-model select')?.value==='teamwork'`, 'Orchestration model selection failed');
        const mutations=await run(`window.__independentSmoke.calls.filter(c=>c.operation==='modelSelection'&&c.payload.action==='set')`);
        assert.equal(mutations.length,2);assert(mutations.every(c=>c.scope.spaceId===mutations[0].scope.spaceId));
        log('native-model-picker-interaction:passed',{literalIds:true,capturedScope:true,providerQualified:true,orchestrationPreserved:true,reasoningSelection:true,focusRestoration:true,escapeDismissal:true});
        await run(`window.__independentSmoke.dispose()`);clearTimeout(timeout);window.destroy();app.quit();return;
      }
      if(mode==='--child-only'){
        window.setContentSize(1440,1040);await run(`window.__independentSmoke.select('A');window.__independentSmoke.showNative()`);
        await until(`document.querySelector('.composer-model select')?.value==='@controlled-provider:model-a'`, 'Native chat did not mount for child stream UI');
        await run(`window.__independentSmoke.activateNative()`);await until(`document.querySelectorAll('.child-run-bubble').length===2`, 'Two controlled child runs did not render');
        assert(await run(`[...document.querySelectorAll('.child-run-bubble')].every(b=>!b.open)`));
        await run(`document.querySelector('.child-run-bubble summary').click();window.__independentSmoke.childDelta('A',0,'LIVE ONE');window.__independentSmoke.childDelta('A',1,'LIVE TWO')`);
        await until(`document.querySelectorAll('.child-run-bubble')[0].textContent.includes('LIVE ONE')&&document.querySelectorAll('.child-run-bubble')[1].textContent.includes('LIVE TWO')`, 'Separate child streams did not update');
        await run(`document.querySelector('.child-run-bubble summary').click()`);assert.equal(await run(`document.querySelector('.child-run-bubble').open`),false);
        await run(`window.__independentSmoke.childDelta('A',0,'AFTER COLLAPSE')`);await new Promise(resolve=>setTimeout(resolve,60));assert.equal(await run(`document.querySelector('.child-run-bubble').open`),false);
        await run(`document.querySelector('.child-run-bubble summary').focus()`);await key('Enter');assert.equal(await run(`document.querySelector('.child-run-bubble').open`),true);
        assert(await run(`document.querySelector('.child-run-bubble').textContent.includes('AFTER COLLAPSE')`));
        log('child-bubbles-ui:passed',{twoIndependentStreams:true,collapsedDefault:true,liveUpdateDoesNotAutoOpen:true,keyboardEnterOpens:true});
        await run(`window.__independentSmoke.dispose()`);clearTimeout(timeout);window.destroy();app.quit();return;
      }
      if(mode==='--goal-only'){
        window.setContentSize(1440,1040);await run(`window.__independentSmoke.select('A');window.__independentSmoke.showNative()`);
        await until(`document.querySelector('.composer-model select')?.value==='@controlled-provider:model-a'`, 'Native chat did not mount for Goal UI');
        assert.equal(await run(`document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"]').length`),0,'Goal UI must remain hidden in a new chat until explicitly requested');
        await run(`(()=>{const original=window.lastbrowser.sidekick.goalCommand;window.__independentSmoke.goalStatusDelayMs=1500;window.lastbrowser.sidekick.goalCommand=async request=>{if(request.args==='status'&&window.__independentSmoke.goalStatusDelayMs){const delay=window.__independentSmoke.goalStatusDelayMs;window.__independentSmoke.goalStatusDelayMs=0;await new Promise(resolve=>setTimeout(resolve,delay))}return original(request)}})()`);
        await run(`window.__independentSmoke.activateNative()`);await new Promise(resolve=>setTimeout(resolve,120));
        assert.equal(await run(`document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"]').length`),0,'No persisted goal or explicit /goal means no GoalControls');
        await button('/','.composer-command-button');await run(`(()=>{const b=[...document.querySelectorAll('.chat-command-menu button')].find(x=>x.querySelector('strong')?.textContent==='/goal');if(!b)throw Error('/goal missing');b.click()})()`);
        await until(`!!document.querySelector('.persistent-goal-controls[aria-label="Persistent goal"] textarea')`, '/goal did not open the editor');
        await input('.persistent-goal-controls[aria-label="Persistent goal"] textarea','Persisted controlled goal');await until(`!!document.querySelector('.persistent-goal-controls form button[type=submit]:not(:disabled)')`, 'Goal submit not enabled');
        await button('Start','.persistent-goal-controls form button[type=submit]');
        await until(`document.querySelector('.persistent-goal-objective')?.textContent==='Persisted controlled goal'`, 'Goal command was not projected after submit');
        await button('Edit','.persistent-goal-controls[aria-label="Persistent goal"] button');await input('.persistent-goal-controls[aria-label="Persistent goal"] textarea','Transient A draft');
        await run(`window.__independentSmoke.select('B')`);await until(`document.querySelector('.composer-model select')?.value==='@controlled-provider:model-b'&&!document.querySelector('.persistent-goal-controls textarea')`, 'Transient Goal draft leaked across Scope');
        assert.equal(await run(`document.querySelector('.persistent-goal-objective')?.textContent??null`),null);
        await run(`window.__independentSmoke.select('A')`);await until(`document.querySelector('.persistent-goal-objective')?.textContent==='Persisted controlled goal'&&!document.querySelector('.persistent-goal-controls textarea')`, 'Saved Goal missing after Scope return');
        await run(`window.__independentSmoke.remountNative()`);await until(`document.querySelector('.persistent-goal-objective')?.textContent==='Persisted controlled goal'`, 'Saved Goal missing after NativeChatMain remount');
        log('goal-controls-ui:passed',{hiddenForNewChat:true,slashGoalOpens:true,unsavedDraftScopeLocal:true,savedGoalRestoredAfterSwitch:true,savedGoalRestoredAfterRemount:true});
        await run(`window.__independentSmoke.dispose()`);clearTimeout(timeout);window.destroy();app.quit();return;
      }
      await run(`window.__independentSmoke.dispose()`);clearTimeout(timeout);window.destroy();app.quit();return;
    }
    await until(`document.querySelectorAll('.space-interview input[type=radio]').length===3`, 'StrictMode did not resume/start the interview');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='interviewStart').length`), 1);
    assert(await run(`document.querySelector('.space-interview [role=status]')?.textContent.length>0`));
    await run(`document.querySelector('.space-interview input[type=radio]').click()`);
    await input('.space-interview textarea', 'Free answer is equally valid');
    await button('Send answer');
    await until(`window.__independentSmoke.snapshots.A.interview.answers.length===1&&!window.__independentSmoke.entry('A').busy`, 'Answer was not accepted');
    const answered = await run(`window.__independentSmoke.calls.find(c=>c.operation==='interviewAnswer').payload`);
    assert.equal(answered.freeText, 'Free answer is equally valid'); assert.deepEqual(answered.selectedOptionIds, ['research']);
    await button('Review profile');
    await until(`document.querySelectorAll('.space-interview textarea').length===4`, 'Review inputs missing');
    await input('.space-interview textarea', 'Corrected purpose in review');
    await button('Confirm preferences');
    await until(`window.__independentSmoke.snapshots.A.confirmedProfile?.values.purpose==='Corrected purpose in review'&&!window.__independentSmoke.entry('A').busy`, 'Confirmed correction missing');
    assert.equal(await run(`window.__independentSmoke.navigation.entered`), 0);
    await button('Connections and plugins', '.space-interview button');
    await until(`[...document.querySelectorAll('.space-assistant-scroll h3')].some(h=>h.textContent==='Connections and plugins')`, 'Explicit setup continuation failed');
    log('interview:passed', { threeOptions: true, equalFreeText: true, manualFallback: true, reviewCorrection: true, noAutoNavigation: true, strictModeSingleStart: true });
    const localConnection='[data-connection-id="provider:custom:local"]';
    await until(`!!document.querySelector(${JSON.stringify(localConnection)})`, 'Real connection metadata missing');
    assert(await run(`document.querySelector(${JSON.stringify(localConnection)}).textContent.includes('health has not been verified')`));
    await button('Set up connection', localConnection+' button');
    await until(`!!document.querySelector('[data-testid=independent-connection-form]')`, 'Profile-bound human form missing');
    await until(`document.activeElement===document.querySelector('[data-testid=independent-connection-form] input[type=password]')`, 'Explicit setup did not focus its visible form');
    await capture('independent-connections-smoke.png');
    const controlledCredential='controlled'+'credential';
    await input('[data-testid=independent-connection-form] input[type=password]',controlledCredential);
    await input('[data-testid=independent-connection-form] input[type=url]','http://127.0.0.1:43210');
    await input('[data-testid=independent-connection-form] input:not([type])','gemma4:31b');
    await run(`document.querySelector('[data-testid=independent-connection-form]').requestSubmit()`);
    await until(`document.querySelector('[data-testid=independent-connection-form] input[type=password]')?.value===''`, 'Private credential was not cleared before acknowledgement');
    await until(`window.__independentSmoke.connections.A.revision===2&&!document.querySelector('[data-testid=independent-connection-form]')`, 'Bound configuration acknowledgement missing');
    assert.equal(await run(`window.__independentSmoke.connections.B.revision`),1);
    assert(!await run(`Object.values(localStorage).some(value=>value.includes(${JSON.stringify(controlledCredential)}))`));
    assert(!await run(`window.__independentSmoke.snapshots.A.messages.some(m=>m.content.includes(${JSON.stringify(controlledCredential)}))`));
    await run(`document.querySelectorAll(${JSON.stringify(localConnection+' input[type=checkbox]')})[1].click()`);
    await button('Allow in this Space',localConnection+' button');
    await until(`window.__independentSmoke.bindings.A[0]?.status==='active'`, 'Explicit permitted-use binding missing');
    assert.deepEqual(await run(`window.__independentSmoke.bindings.A[0].permittedUse`),['agent_reasoning']);
    const oauthConnection='[data-connection-id="provider:codex"]';
    await button('Set up connection',oauthConnection+' button');
    await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Open sign-in page')`, 'Explicit OAuth next step missing');
    assert.equal(await run(`window.__independentSmoke.navigation.signIn`),0);
    await button('Open sign-in page');
    assert.equal(await run(`window.__independentSmoke.navigation.signIn`),1);
    await button('Cancel this sign-in');
    await until(`[...document.querySelectorAll('[role=status]')].some(e=>e.textContent.includes('cancelled'))`, 'OAuth cancellation did not acknowledge');
    log('connections:passed',{boundHumanConfiguration:true,cas:true,credentialClearedBeforeAck:true,noCredentialChatOrStorage:true,otherSpaceUnchanged:true,explicitPermittedUse:true,noAutomaticOAuthNavigation:true});
    await input('.browser-account-setup input[type=url]','https://accounts.controlled.invalid');
    await run(`(()=>{const form=document.querySelector('.browser-account-setup form');form.requestSubmit();form.requestSubmit()})()`);
    await until(`window.__independentSmoke.browserFlows.A.length===1&&!!document.querySelector('[data-browser-account-flow]')`, 'Explicit account setup did not acknowledge');
    assert.equal(await run(`window.__independentSmoke.navigation.browserLogins`),1);
    assert.equal(await run(`window.__independentSmoke.browserFlows.A[0].setupStatus`),'awaiting_user');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='browserConnection'&&c.payload.action==='confirm').length`),0);
    await run(`window.__independentSmoke.select('B')`);
    await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space B'`, 'Account setup Scope B did not render');
    await run(`window.__independentSmoke.select('A')`);
    await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space A'`, 'Account setup Scope A did not restore');
    await openSetupSection(1);
    await until(`!!document.querySelector('[data-browser-account-flow]')`, 'Known owned account flow did not recover on remount');
    assert.equal(await run(`window.__independentSmoke.navigation.browserLogins`),1);
    await input('.browser-account-setup [data-browser-account-flow] input','Controlled account');
    await run(`(()=>{const b=[...document.querySelectorAll('.browser-account-setup button')].find(b=>b.textContent==='I have signed in here');b.click();b.click()})()`);
    await until(`window.__independentSmoke.browserFlows.A[0].setupStatus==='user_confirmed'`, 'Human confirmation did not acknowledge');
    log('account-confirmation-state',await run(`({flow:window.__independentSmoke.browserFlows.A[0].setupStatus,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent),capabilityReads:window.__independentSmoke.calls.filter(c=>c.operation==='capabilities').length})`));
    await new Promise(resolve=>setTimeout(resolve,120));
    log('account-catalog-state',await run(`({connections:[...document.querySelectorAll('[data-connection-id]')].map(e=>e.dataset.connectionId),alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent),browserText:document.querySelector('.browser-account-setup')?.textContent,scope:document.querySelector('.space-assistant-header span')?.textContent,recentOperations:window.__independentSmoke.calls.slice(-8).map(c=>({operation:c.operation,scope:c.scope.spaceId,action:c.payload?.action}))})`));
    await until(`!!document.querySelector('[data-connection-id^="browser_account:"]')`, 'Human confirmation did not populate actual catalog');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='browserConnection'&&c.payload.action==='confirm').length`),1);
    assert.equal(await run(`window.__independentSmoke.bindings.A.filter(b=>b.connectionKind==='browser_account').length`),0);
    assert.deepEqual(await run(`window.__independentSmoke.permissionStates.A.browserOrigins`),[]);
    await run(`document.querySelector('[data-connection-id^="browser_account:"] input[type=checkbox]').click()`);
    await button('Allow in this Space','[data-connection-id^="browser_account:"] button');
    await until(`window.__independentSmoke.bindings.A.some(b=>b.connectionKind==='browser_account'&&b.status==='active')`, 'Explicit account use binding did not persist');
    await button('Sign out','.browser-account-setup button');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='browserConnection'&&c.payload.action==='logout').length`),0);
    assert(await run(`document.querySelector('.browser-account-setup [role=group]').textContent.includes('entire task-browser session')`));
    await button('Confirm sign-out','.browser-account-setup button');
    await until(`window.__independentSmoke.browserFlows.A[0].setupStatus==='revoked'`, 'Actual account logout did not acknowledge');
    await until(`!document.querySelector('.browser-account-setup input[type=url]').disabled`, 'Account form stayed busy after logout');
    await input('.browser-account-setup input[type=url]','https://accounts.controlled.invalid');
    await button('Open sign-in window','.browser-account-setup button');
    await until(`window.__independentSmoke.navigation.browserLogins===2`, 'New explicit setup reused a terminated request identity');
    await button('Cancel setup','.browser-account-setup button');
    await until(`window.__independentSmoke.browserFlows.A[1].setupStatus==='cancelled'`, 'Owned account setup did not cancel');
    assert.equal(await run(`window.__independentSmoke.browserFlows.B.length`),0);
    const browserCalls=await run(`window.__independentSmoke.calls.filter(c=>c.operation==='browserConnection')`);
    assert(browserCalls.every(c=>!['leaseId','mainProof','partitionKey','targetId'].some(k=>k in c.payload)));
    log('browser-account-ui:passed',{explicitOrigin:true,noAutoConfirmation:true,knownFlowRecoveryOnly:true,noAutoWindowOnRemount:true,humanConfirmationCAS:true,doubleClicksBlocked:true,separateUseBinding:true,noActionPermissionsInferred:true,reviewedScopeLogout:true,ownCancellation:true,otherSpaceUnchanged:true,noPrivateMainProof:true});
    for(const restarted of [false,true]){
      await until(`!document.querySelector('.browser-account-setup input[type=url]').disabled`, 'Account form did not settle before unknown outcome');
      const before=await run(`window.__independentSmoke.navigation.browserLogins`);
      await run(`window.__independentSmoke.browserFaults.loseAck=true`);
      await button('Open sign-in window','.browser-account-setup button');
      await until(`!!document.querySelector('[data-browser-start-recovery] button:not(:disabled)')&&window.__independentSmoke.navigation.browserLogins===${before+1}`, 'Unknown start did not retain a recoverable request');
      const first=await run(`window.__independentSmoke.calls.filter(c=>c.operation==='browserConnection'&&c.payload.action==='start').at(-1).payload`);
      await run(`window.__independentSmoke.select('B')`);await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space B'`, 'Unknown start did not detach from A');
      await run(`window.__independentSmoke.select('A')`);await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space A'`, 'Unknown start did not return to A');
      await openSetupSection(1);
      await until(`!!document.querySelector('[data-browser-start-recovery]')`, 'Pending UUID did not survive remount');
      assert.equal(await run(`window.__independentSmoke.navigation.browserLogins`),before+1);
      await run(`window.__independentSmoke.browserFaults.restarted=${restarted}`);
      await run(`document.querySelector('[data-browser-start-recovery] button').focus()`);await key('Enter');
      await until(`!document.querySelector('[data-browser-start-recovery]')&&document.querySelector('[data-browser-account-flow]')?.textContent.includes(${JSON.stringify(restarted?'Setup interrupted':'Waiting for your sign-in')})`, 'Same request did not recover actual outcome');
      const replay=await run(`window.__independentSmoke.calls.filter(c=>c.operation==='browserConnection'&&c.payload.action==='start').at(-1).payload`);
      assert.deepEqual(replay,first);assert.equal(await run(`window.__independentSmoke.navigation.browserLogins`),before+1);
      if(!restarted){await button('Cancel setup','.browser-account-setup button');await until(`!document.querySelector('.browser-account-setup input[type=url]').disabled`, 'Recovered setup did not cancel');}
    }
    log('browser-start-recovery:passed',{lostAcknowledgement:true,explicitSameUuidReplay:true,remountMetadata:true,noDuplicateWindow:true,scopeIsolation:true,mainRestartInterruptedView:true,noAutoConfirmation:true});
    await openSetupSection(2);
    await until(`!!document.querySelector('[data-testid=independent-definition-form] fieldset:not(:disabled)')`, 'Definition form did not load');
    await capture('independent-definitions-smoke.png');
    await input('[data-testid=independent-definition-form] input[maxlength="500"]','Controlled scheduled task');
    await input('[data-testid=independent-definition-form] textarea[required]','Controlled task instruction. '.repeat(3000).slice(0,64000));
    await input('[data-testid=independent-definition-form] textarea:not([required])','Verified source summary');
    await input('[data-testid=independent-definition-form] input[type=number]','3');
    await run(`(()=>{const labels=[...document.querySelectorAll('[data-testid=independent-definition-form] label')];labels.find(e=>e.textContent.includes('provider:custom:local')).querySelector('input').click();labels.find(e=>e.textContent.trim()==='Run on a schedule').querySelector('input').click()})()`);
    await input('[data-testid=independent-definition-form] input[placeholder]','0 9 * * 1-5');
    await run(`(()=>{const label=[...document.querySelectorAll('[data-testid=independent-definition-form] label')].find(e=>e.textContent.startsWith('IANA time zone'));const e=label.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Europe/Vienna');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await button('Save task','[data-testid=independent-definition-form] button');
    await until(`window.__independentSmoke.definitions.A.length===1&&!document.querySelector('[data-testid=independent-definition-form] fieldset').disabled`, 'Definition save did not acknowledge');
    const saved=await run(`window.__independentSmoke.definitions.A[0]`);
    assert.equal(saved.instruction.length,64000);assert.equal(saved.budget.maxToolCalls,3);assert.equal(saved.schedule.timezone,'Europe/Vienna');assert.equal(saved.schedule.missedPolicy,'skip');
    assert.equal(saved.connectionBindings.length,1);assert.equal(saved.connectionBindings[0].connectionRevision,2);
    assert.deepEqual(saved.permissionScope.allowedEffects,[]);assert.deepEqual(saved.permissionScope.browserOrigins,[]);
    assert.equal(await run(`window.__independentSmoke.definitions.B.length`),0);
    assert((await run(`window.__independentSmoke.calls.find(c=>c.operation==='definitions'&&c.payload.action==='save').payload.userIntent.length`))<64000);
    assert.equal(await run(`document.querySelector('[data-definition-id] time')?.dateTime`),'2026-10-05T09:00:00Z');
    await button('Start task now','[data-definition-id] button');
    await until(`window.__independentSmoke.entry('A').activity.runs.length===1&&!document.querySelector('[data-testid=independent-definition-form] fieldset').disabled`, 'Actual independent task dispatch missing');
    assert.equal(await run(`window.__independentSmoke.navigation.workChats`),0);
    await button('Disable future starts','[data-definition-id] button');
    await until(`window.__independentSmoke.definitions.A[0].enabled===false&&!document.querySelector('[data-definition-id] time')`, 'Definition disable did not acknowledge');
    assert.equal(await run(`window.__independentSmoke.snapshots.A.activity.runs[0].state`),'queued');
    log('definitions:passed',{fullInstructionPreserved:true,boundedControlSource:true,explicitConnectionReference:true,noImplicitPermissions:true,actualSchedulerProjection:true,casStart:true,noAutoOpenWorkChat:true,disableKeepsExistingRun:true});
    await run(`(()=>{const s=window.__independentSmoke.snapshots.A,r=s.activity.runs[0];r.state='waiting_for_user';r.stateRevision++;r.checkpointId=crypto.randomUUID();r.controlEpoch++;r.waitingFor={kind:'clarification',resourceId:null,expiresAt:null};s.activity.clarificationQuestions=[{schemaVersion:1,scope:r.scope,runId:r.runId,questionIdentity:r.checkpointId,question:'Which controlled destination should I use?',expectedRevision:r.stateRevision,controlEpoch:r.controlEpoch}];return window.__independentSmoke.load('A')})()`);
    await until(`!!document.querySelector('.independent-clarification textarea')`, 'Actual waiting question did not render');
    assert.equal(await run(`document.querySelector('.independent-clarification button').disabled`),true);
    await input('.independent-clarification textarea','Use the explicitly selected destination.');
    await run(`document.querySelector('.independent-clarification').requestSubmit();document.querySelector('.independent-clarification').requestSubmit()`);
    await until(`window.__independentSmoke.snapshots.A.activity.runs[0].state==='running'&&!document.querySelector('.independent-clarification')`, 'Bound clarification answer did not resume projection');
    const answerControls=await run(`window.__independentSmoke.calls.filter(c=>c.operation==='runControl')`);
    assert.equal(answerControls.length,1);assert.equal(answerControls[0].payload.command,'answer');assert.equal(answerControls[0].payload.answer,'Use the explicitly selected destination.');
    assert.equal(answerControls[0].scope.spaceId,await run(`window.__independentSmoke.scopes.A.spaceId`));
    assert.equal(await run(`window.__independentSmoke.snapshots.B.activity.runs.length`),0);
    log('clarification:passed',{actualQuestionIdentity:true,boundRevisionAndEpoch:true,doubleSubmitBlocked:true,otherSpaceUnchanged:true,noAutomaticAnswer:true});
    await run(`(()=>{const s=window.__independentSmoke.snapshots.A,r=s.activity.runs[0];s.activity.runProgress=[{schemaVersion:1,scope:r.scope,runId:r.runId,targetSessionId:r.targetSessionId,progressRevision:2,observedAt:new Date().toISOString(),runState:r.state,counters:r.counters,budget:window.__independentSmoke.definitions.A[0].budget,text:'Actual SDK output supplied by this controlled transport.',textTruncated:false,source:'sdk_output_text'}];return window.__independentSmoke.load('A')})()`);
    await until(`document.querySelector('[data-progress-run-id]')?.textContent.includes('Actual SDK output')`, 'Snapshot SDK output did not render');
    assert(await run(`document.querySelector('[data-progress-run-id] dl')?.textContent.includes('/3')`));
    log('run-progress:passed',{authoritativeSnapshotText:true,scopeRunSessionBound:true,observedBudgetCounters:true});
    await until(`!!document.querySelector(${JSON.stringify(localConnection)})`, 'Connections did not remount');
    await button('Revoke Space access',localConnection+' button');
    await until(`window.__independentSmoke.bindings.A[0].status==='revoked'`, 'Binding revocation missing');
    assert.equal(await run(`window.__independentSmoke.bindings.B.length`),0);
    await input('[data-testid=independent-browser-permissions] textarea','https://browser.controlled.invalid');
    await run(`document.querySelector('[data-testid=independent-browser-permissions]').requestSubmit();document.querySelector('[data-testid=independent-browser-permissions]').requestSubmit()`);
    await until(`window.__independentSmoke.permissionStates.A.revision===2&&!document.querySelector('[data-testid=independent-browser-permissions] fieldset').disabled`, 'Browser permissions did not acknowledge');
    const browserGrant=await run(`window.__independentSmoke.calls.filter(c=>c.operation==='permissions'&&c.payload.action==='grant')`);
    assert.equal(browserGrant.length,1);assert.deepEqual(browserGrant[0].payload.permissions.networkOrigins,['https://network.controlled.invalid']);
    assert.deepEqual(browserGrant[0].payload.permissions.allowedWorkspaceRoots,['C:\\controlled\\a']);assert(browserGrant[0].payload.permissions.allowedEffects.includes('send'));
    assert.equal(await run(`window.__independentSmoke.permissionStates.B.revision`),1);
    await run(`window.__independentSmoke.delays.preview=200`);
    await button('View browser','[data-run-id] button');
    await run(`window.__independentSmoke.select('B')`);
    await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space B'&&!!window.__independentSmoke.entry('B')?.snapshot&&!window.__independentSmoke.entry('B').loading`, 'B scope did not bind for preview race');
    await until(`!document.querySelector('.space-assistant-setup').open&&!document.querySelector('.space-assistant-activity').open`, 'Scope change did not restore conversation with disclosures closed');
    assert.equal(await run(`document.querySelectorAll('.space-assistant-tabs').length`),0);
    await run(`(()=>{const panel=document.querySelector('[data-testid=space-assistant-panel]');panel.style.width='100%';panel.style.insetInline='0'})()`);
    window.setContentSize(320,700);
    await until(`innerWidth===320`, '320px assistant viewport did not apply');
    assert(await run(`(()=>{const panel=document.querySelector('[data-testid=space-assistant-panel]'),composer=document.querySelector('.space-assistant-composer'),textarea=composer?.querySelector('textarea');if(!panel||!composer||!textarea)return false;const p=panel.getBoundingClientRect(),c=composer.getBoundingClientRect(),i=textarea.getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&c.left>=0&&c.right<=innerWidth&&c.bottom<=innerHeight&&i.width>0&&i.bottom<=innerHeight})()`), '320px composer must remain fully inside the panel and viewport');
    await run(`document.querySelector('.space-assistant-composer textarea').focus()`);
    assert(await run(`document.activeElement===document.querySelector('.space-assistant-composer textarea')`));
    assert(await run(`window.__independentSmoke.entry('B').snapshot.activity.activeChats.length>0`));
    await run(`document.querySelector('.space-assistant-activity > summary').click()`);
    assert(await run(`document.querySelector('.space-assistant-activity').open`));
    assert(await run(`document.querySelectorAll('.space-assistant-activity-content .space-assistant-card').length===window.__independentSmoke.entry('B').snapshot.activity.activeChats.length`));
    await run(`document.querySelector('.space-assistant-activity > summary').click()`);
    window.setContentSize(1440,1040);
    await new Promise(resolve=>setTimeout(resolve,250));
    assert.equal(await run(`document.querySelectorAll('[data-testid=space-assistant-panel] figure').length`),0);
    await run(`window.__independentSmoke.select('A')`);
    await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space A'&&!window.__independentSmoke.entry('A').loading`, 'A scope did not bind for permission race');
    await openSetupSection(1);
    await until(`!!document.querySelector('[data-testid=independent-browser-permissions] textarea')`, 'A browser form did not bind');
    await input('[data-testid=independent-browser-permissions] textarea','https://delayed.controlled.invalid');
    await run(`window.__independentSmoke.delays.permission=200;document.querySelector('[data-testid=independent-browser-permissions]').requestSubmit();window.__independentSmoke.select('B')`);
    await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space B'&&!window.__independentSmoke.entry('B').loading&&!!document.querySelector('[data-testid=independent-browser-permissions] textarea')`, 'B browser form did not bind');
    await new Promise(resolve=>setTimeout(resolve,250));
    assert.equal(await run(`document.querySelector('[data-testid=independent-browser-permissions] textarea').value`),'');
    assert.equal(await run(`window.__independentSmoke.permissionStates.B.revision`),1);
    log('local-scope-races:passed',{latePreviewRejected:true,latePermissionUiRejected:true,otherRightsPreserved:true,doubleGrantBlocked:true});
    await run(`window.__independentSmoke.select('A')`);
    await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space A'&&!window.__independentSmoke.entry('A').loading`, 'A scope did not restore after local races');
    await openSetupSection(0);
    await run(`document.querySelector('.independent-reset-section summary').click()`);
    const profileBefore=await run(`JSON.stringify(window.__independentSmoke.snapshots.A.confirmedProfile)`);
    await run(`(()=>{const b=[...document.querySelectorAll('.independent-assistant-reset button')].find(b=>b.textContent==='Review impact');b.click();b.click()})()`);
    await until(`[...document.querySelectorAll('.independent-assistant-reset button')].some(b=>b.textContent==='Confirm the reviewed change'&&!b.disabled)`, 'Real reset impact did not render');
    assert(await run(`document.querySelector('.independent-assistant-reset')?.textContent.includes('Controlled scheduled task')`));
    assert(await run(`document.querySelector('.independent-assistant-reset')?.textContent.includes('Run profile snapshots')`));
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='assistantReset').length`),1);
    await run(`(()=>{const b=[...document.querySelectorAll('.independent-assistant-reset button')].find(b=>b.textContent==='Confirm the reviewed change');b.click();b.click()})()`);
    await until(`window.__independentSmoke.entry('A').snapshot.interview===null&&!window.__independentSmoke.entry('A').loading`, 'Reset did not reload actual state');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='assistantReset').length`),2);
    assert.equal(await run(`JSON.stringify(window.__independentSmoke.snapshots.A.confirmedProfile)`),profileBefore);
    assert.equal(await run(`window.__independentSmoke.snapshots.A.activity.runs[0].state`),'running');
    assert.equal(await run(`window.__independentSmoke.definitions.A.length`),1);
    assert.equal(await run(`window.__independentSmoke.navigation.entered`),0);
    log('assistant-reset:passed',{previewBeforeApply:true,doubleClicksBlocked:true,actualStateRefetched:true,profilePreserved:true,existingRunPreserved:true,definitionPreserved:true,noNavigation:true});
    await run(`(()=>{const s=window.__independentSmoke.snapshots.A,first=s.activity.runs[0];s.activity.runs.push({...structuredClone(first),runId:crypto.randomUUID(),dispatchId:crypto.randomUUID(),targetSessionId:'controlled-second-chat'});return window.__independentSmoke.load('A')})()`);
    await input('#space-assistant-composer','pause this task');await run(`document.querySelector('.space-assistant-composer').requestSubmit()`);
    await until(`document.querySelectorAll('.independent-control-choice button:not(:disabled)').length===2`, 'Actual control candidates did not render');
    await run(`(()=>{const s=window.__independentSmoke.snapshots.A;s.activity.runs[0].stateRevision++;return window.__independentSmoke.load('A')})()`);
    await until(`document.querySelectorAll('.independent-control-choice button:not(:disabled)').length===0`, 'Stale control target stayed actionable');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='assistantControl').length`),0);
    await input('#space-assistant-composer','pause this task');await run(`document.querySelector('.space-assistant-composer').requestSubmit()`);
    await until(`document.querySelectorAll('.independent-control-choice button:not(:disabled)').length===2`, 'Fresh target choice did not render');
    const unchangedControlRun=await run(`JSON.stringify(window.__independentSmoke.snapshots.A.activity.runs[0])`);
    await run(`(()=>{const buttons=[...document.querySelectorAll('.independent-control-choice button:not(:disabled)')],last=buttons.at(-1);last.click();last.click()})()`);
    await until(`window.__independentSmoke.snapshots.A.messages.findLast(m=>m.role==='assistant').controlStatus==='completed'&&!window.__independentSmoke.entry('A').busy`, 'Human control did not acknowledge');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='assistantControl').length`),1);
    assert.equal(await run(`JSON.stringify(window.__independentSmoke.snapshots.A.activity.runs[0])`),unchangedControlRun);
    assert.equal(await run(`window.__independentSmoke.snapshots.A.activity.runs[1].state`),'pausing');
    assert.equal(await run(`window.__independentSmoke.calls.find(c=>c.operation==='assistantControl').payload.runId`),await run(`window.__independentSmoke.snapshots.A.activity.runs[1].runId`));
    assert.equal(await run(`window.__independentSmoke.navigation.workChats`),0);
    await until(`document.querySelector('.independent-message-control')?.textContent.includes('permissions changed')`, 'Stale original reply was not retained');
    log('human-control:passed',{actualHumanSource:true,explicitCandidateChoice:true,staleChoiceBlocked:true,doubleClickBlocked:true,actualRunAck:true,otherRunUnchanged:true,noNavigation:true});
    await run(`(()=>{const s=window.__independentSmoke.snapshots.A;s.activity.runs.pop();return window.__independentSmoke.load('A')})()`);
    await input('#space-assistant-composer', 'Task A');
    await until(`!!document.querySelector('.space-assistant-composer button[type=submit]:not(:disabled)')`, 'A composer did not finish loading');
    await run(`document.querySelector('.space-assistant-composer').requestSubmit()`);
    await until(`!!window.__independentSmoke.entry('A').turnId&&!window.__independentSmoke.entry('A').inFlightRequestId`, 'A pending turn missing');
    await run(`window.__independentSmoke.select('B')`);
    await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space B'&&!!window.__independentSmoke.entry('B')?.snapshot`, 'B mount failed');
    await input('#space-assistant-composer', 'Task B');
    await until(`!!document.querySelector('.space-assistant-composer button[type=submit]:not(:disabled)')`, 'B composer did not finish loading');
    await run(`document.querySelector('.space-assistant-composer').requestSubmit()`);
    await until(`!!window.__independentSmoke.entry('B').turnId&&!window.__independentSmoke.entry('B').inFlightRequestId`, 'B pending turn missing');
    await run(`window.__independentSmoke.delta('A','Answer A');window.__independentSmoke.delta('B','Answer B');Promise.all([window.__independentSmoke.poll('A'),window.__independentSmoke.poll('B')])`);
    assert.equal(await run(`window.__independentSmoke.entry('A').streamingMessage?.content`), 'Answer A');
    assert.equal(await run(`window.__independentSmoke.entry('B').streamingMessage?.content`), 'Answer B');
    await until(`[...document.querySelectorAll('.space-assistant-message.assistant')].some(m=>m.textContent.includes('Answer B'))`, 'B live answer did not render');
    await run(`window.__independentSmoke.select('A')`);
    await until(`document.querySelector('.space-assistant-space-name')?.textContent==='Space A'&&[...document.querySelectorAll('.space-assistant-message.assistant')].some(m=>m.textContent.includes('Answer A'))`, 'A stream did not survive switching');
    await button('Stop', '.space-assistant-composer button');
    await until(`!window.__independentSmoke.entry('A').busy`, 'A cancellation did not finish');
    assert.equal(await run(`window.__independentSmoke.entry('B').busy`), true);
    await run(`window.__independentSmoke.delta('A','STALE',true);window.__independentSmoke.poll('A')`);
    assert.equal(await run(`window.__independentSmoke.entry('A').snapshot.messages.findLast(m=>m.role==='assistant').content`), 'Stopped by user');
    assert(!await run(`document.querySelector('.space-assistant-message.assistant')?.textContent.includes('STALE')`));
    const bBefore = await run(`window.__independentSmoke.entry('B').snapshot.messages.findLast(m=>m.role==='assistant').content`);
    await run(`window.__independentSmoke.foreign();window.__independentSmoke.poll('A')`);
    assert.equal(await run(`window.__independentSmoke.entry('A').error?.code`), 'invalid_response');
    assert.equal(await run(`window.__independentSmoke.entry('B').snapshot.messages.findLast(m=>m.role==='assistant').content`), bBefore);
    log('two-scopes:passed', { liveDeltas: true, scopeSwitchPreservesPending: true, cancelOnlyOwnTurn: true, staleDeltaRejected: true, foreignEventRejected: true });
    await button('All Spaces');
    await until(`document.querySelectorAll('[role=dialog] .space-assistant-card').length===2`, 'Global activity missing');
    await new Promise(resolve => setTimeout(resolve, 200));
    const shot = await capture('independent-renderer-smoke.png');
    await run(`document.querySelector('[role=dialog] .space-assistant-header button').click()`);
    await until(`!document.querySelector('[role=dialog]')`, 'Overview did not close');
    await run(`document.querySelector('[data-testid=space-assistant-panel] .space-assistant-header button').click()`);
    await until(`!document.querySelector('[data-testid=space-assistant-panel]')`, 'Panel did not close');
    assert.equal(await run(`window.__independentSmoke.entry('B').busy`), true);
    const counts = await run(`({cancels:window.__independentSmoke.calls.filter(c=>c.operation==='cancelAssistantTurn').length,runControls:window.__independentSmoke.calls.filter(c=>c.operation==='runControl').length,navigation:window.__independentSmoke.navigation})`);
    assert.equal(counts.cancels,1);assert.equal(counts.runControls,1);assert.equal(counts.navigation.entered,0);assert.equal(counts.navigation.closed,1);assert.equal(counts.navigation.overviewClosed,1);
    await run(`window.__independentSmoke.showNative()`);
    await until(`document.querySelector('.composer-model select')?.value==='@controlled-provider:model-a'`, 'Native bound model A was not loaded');
    assert.equal(await run(`document.querySelectorAll('.persistent-goal-controls').length`),0,'No active native session must not show GoalControls');
    await button('Choose model manually','.composer-command-button');
    await until(`!!document.querySelector('#composer-manual-models')`, 'Manual model catalog did not open');
    assert(await run(`document.querySelector('#composer-manual-models').textContent.includes('Extra local model')`));
    assert(await run(`document.querySelector('#composer-manual-models').textContent.includes('Unavailable in this build')`));
    assert.equal(await run(`[...document.querySelectorAll('#composer-manual-models button')].find(button=>button.textContent.includes('Unavailable model')).disabled`),true);
    await input('#composer-manual-models input[type=search]','Extra local');
    assert.equal(await run(`document.querySelectorAll('#composer-manual-models button').length`),1);
    await input('#composer-manual-models input[type=search]','Literal local');
    await run(`(()=>[...document.querySelectorAll('#composer-manual-models button')].find(button=>button.textContent.includes('Literal local model')).click())()`);
    await until(`window.__independentSmoke.models.A.model==='gemma4:31b'&&document.querySelector('.composer-model select')?.value==='@custom:local:gemma4:31b'`, 'Manual literal model selection did not commit to its provider');
    assert(await run(`document.activeElement===document.querySelector('.composer-toolbar button[aria-controls="composer-manual-models"]')`));
    assert.deepEqual(await run(`[...document.querySelector('[aria-label="Reasoning depth"]').options].map(option=>option.value)`),['','low','high']);
    await run(`(()=>{const select=document.querySelector('[aria-label="Reasoning depth"]');select.value='high';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    assert.equal(await run(`document.querySelector('[aria-label="Reasoning depth"]').value`),'high');
    await button('Choose model manually','.composer-command-button');
    await key('Escape');
    assert.equal(await run(`document.querySelector('#composer-manual-models')`),null);
    assert(await run(`document.activeElement===document.querySelector('.composer-toolbar button[aria-controls="composer-manual-models"]')`));
    await button('/','.composer-command-button');
    await until(`!!document.querySelector('.chat-command-menu [role=listbox]')`, 'Native purpose command menu did not render');
    assert(await run(`[...document.querySelectorAll('.chat-command-menu [role=option]')].filter(x=>['/plan','/goal','/grill-me','/boost'].includes(x.querySelector('strong')?.textContent)).every(x=>x.getAttribute('aria-disabled')==='true')`));
    await input('.chat-command-menu input', 'model');
    await run(`document.querySelector('.chat-command-menu input').focus()`);
    await key('Enter');
    await until(`document.activeElement===document.querySelector('.composer-model select')&&!document.querySelector('.chat-command-menu')`, 'Model command did not focus actual model picker');
    await button('/','.composer-command-button');
    await run(`(()=>{const button=[...document.querySelectorAll('.chat-command-menu button')].find(b=>b.querySelector('strong')?.textContent==='/new');button.click()})()`);
    await until(`window.__independentSmoke.navigation.createdSessions===1&&!document.querySelector('.chat-command-menu')`, 'New conversation command did not use its native callback');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='assistantTurn').length`),4);
    log('native-command-host:passed',{actualModelPicker:true,nativeNewSessionCallback:true,noShellReload:true,noAgentCommandPrompt:true,backendModesFailClosed:true});
    await run(`(()=>{const picker=document.querySelector('.composer-model select');picker.value='@custom:local:gemma4:31b';picker.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await until(`window.__independentSmoke.models.A.model==='gemma4:31b'&&document.querySelector('.composer-model select')?.value==='@custom:local:gemma4:31b'`, 'Native literal model choice did not commit');
    assert.equal(await run(`window.__independentSmoke.models.A.provider`),'custom:local');
    await run(`window.__independentSmoke.select('B')`);
    await until(`document.querySelector('.composer-model select')?.value==='@controlled-provider:model-b'`, 'Native model B changed or did not load');
    await run(`window.__independentSmoke.select('A')`);
    await until(`document.querySelector('.composer-model select')?.value==='@custom:local:gemma4:31b'`, 'A durable preference did not restore');
    await run(`(()=>{const picker=document.querySelector('.composer-model select');picker.value='teamwork';picker.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await until(`document.querySelector('.composer-model select')?.value==='teamwork'&&[...document.querySelectorAll('.chat-status-message')].some(x=>x.textContent.includes('normal chats'))`, 'Orchestration preference or limitation explanation missing');
    const modelMutations=await run(`window.__independentSmoke.calls.filter(c=>c.operation==='modelSelection'&&c.payload.action==='set')`);
    assert.equal(modelMutations.length,2);assert(modelMutations.every(c=>c.scope.spaceId===modelMutations[0].scope.spaceId));
    log('native-model-picker:passed',{literalIds:true,capturedScope:true,otherSpaceUnchanged:true,orchestrationPreserved:true,mutations:modelMutations.map(c=>({model:c.payload.model,provider:c.payload.provider,expectedRevision:c.payload.expectedRevision}))});
    await run(`window.__independentSmoke.activateNative()`);
    await until(`[...document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"] button')].some(b=>b.textContent==='Start'&&!b.disabled)`, 'Actual absent Goal revision was not loaded');
    for(const[name,mode,lifetime]of [['plan','plan','chat'],['grill-me','grill_me','chat'],['boost','boost','next_turn']]){
      await button('/','.composer-command-button');
      await run(`(()=>{const b=[...document.querySelectorAll('.chat-command-menu button')].find(b=>b.querySelector('strong')?.textContent===${JSON.stringify('/'+name)});b.click();b.click()})()`);
      await until(`window.__independentSmoke.nativeModes.A.mode===${JSON.stringify(mode)}&&!!document.querySelector('.persistent-goal-controls[role=status]')`, 'Actual mode mutation did not confirm '+name);
      assert.equal(await run(`window.__independentSmoke.nativeModes.A.lifetime`),lifetime);
      await run(`document.querySelector('.persistent-goal-controls[role=status] button').click()`);
      await until(`window.__independentSmoke.nativeModes.A.mode==='action'&&!document.querySelector('.persistent-goal-controls[role=status]')`, 'Actual mode did not clear');
    }
    const modeRequests=await run(`window.__independentSmoke.nativeCalls.filter(c=>c.operation==='chatMode'&&c.action==='set')`);
    assert.equal(modeRequests.length,6);assert.deepEqual(modeRequests.map(r=>r.expectedRevision),[0,1,2,3,4,5]);
    assert(modeRequests.every(r=>r.sessionId==='native-a'&&r.browserProfileId==='controlled'&&r.clientRequestId&&!('spaceScope'in r)&&!('profile'in r)));
    await button('/','.composer-command-button');
    await run(`[...document.querySelectorAll('.chat-command-menu button')].find(b=>b.querySelector('strong')?.textContent==='/goal').click()`);
    await until(`!!document.querySelector('.persistent-goal-controls[aria-label="Persistent goal"] textarea')`, 'Goal command did not open actual editor');
    await input('.persistent-goal-controls[aria-label="Persistent goal"] textarea','Finish the actual controlled objective');
    await run(`document.querySelector('.persistent-goal-controls[aria-label="Persistent goal"] form').requestSubmit()`);
    await until(`document.querySelector('.persistent-goal-objective')?.textContent==='Finish the actual controlled objective'`, 'Actual Goal was not displayed after creation');
    await button('Edit','.persistent-goal-controls[aria-label="Persistent goal"] button');
    await input('.persistent-goal-controls[aria-label="Persistent goal"] textarea','Unsent draft must stay with A');
    await run(`window.__independentSmoke.select('B')`);
    await until(`document.querySelector('.composer-model select')?.value==='@controlled-provider:model-b'&&!document.querySelector('.persistent-goal-controls textarea')`, 'Unsaved Goal editor leaked into B');
    assert.equal(await run(`document.querySelector('.persistent-goal-objective')?.textContent??null`),null,'Saved A goal must not appear in B');
    await run(`window.__independentSmoke.select('A')`);
    await until(`document.querySelector('.persistent-goal-objective')?.textContent==='Finish the actual controlled objective'&&!document.querySelector('.persistent-goal-controls textarea')`, 'A goal was not restored while transient editor stayed closed');
    await run(`window.__independentSmoke.remountNative()`);
    await until(`document.querySelector('.persistent-goal-objective')?.textContent==='Finish the actual controlled objective'`, 'Actual Goal was not restored from saved state after remount');
    await until(`!![...document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"] button')].find(b=>b.textContent==='Pause'&&!b.disabled)`, 'Pause button not available after remount');
    await button('Pause','.persistent-goal-controls[aria-label="Persistent goal"] button');
    await until(`[...document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"] button')].some(b=>b.textContent==='Resume'&&!b.disabled)`, 'Actual Goal pause did not refresh');
    await button('Resume','.persistent-goal-controls[aria-label="Persistent goal"] button');
    await until(`window.__independentSmoke.nativeSessions.A.goal.status==='active'`, 'Actual Goal resume did not dispatch');
    const goalRequests=await run(`window.__independentSmoke.nativeCalls.filter(c=>c.operation==='goalCommand'&&c.args!=='status')`);
    assert.deepEqual(goalRequests.map(r=>r.expectedRevision),[4,5,6]);assert(goalRequests.every(r=>r.sessionId==='native-a'&&r.browserProfileId==='controlled'&&r.clientRequestId));
    log('native-mode-goal:passed',{actualCapabilities:true,confirmedModeCAS:modeRequests.map(r=>r.expectedRevision),boostNextTurn:true,absentGoalRevision:4,actualGoalCreatePauseResume:true,noInventedRevision:true,noDuplicateModeMutation:true});
    await until(`!![...document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"] button')].find(b=>b.textContent==='End'&&!b.disabled)`, 'Goal controls still pending after resume');
    await run(`window.__independentSmoke.nativeGoalFaults.delay=120;(()=>{const b=[...document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"] button')].find(b=>b.textContent==='End');b.click();b.click()})()`);
    await until(`!window.__independentSmoke.nativeSessions.A.goal&&!![...document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"] button')].find(b=>b.textContent==='Start'&&!b.disabled)`, 'Actual Clear did not refresh');
    assert.equal(await run(`window.__independentSmoke.nativeCalls.filter(c=>c.operation==='goalCommand'&&c.args==='clear').length`),1);
    await button('Start','.persistent-goal-controls[aria-label="Persistent goal"] button');await input('.persistent-goal-controls[aria-label="Persistent goal"] textarea','Goal conflict recovery');
    await run(`document.querySelector('.persistent-goal-controls[aria-label="Persistent goal"] form').requestSubmit()`);
    await until(`document.querySelector('.persistent-goal-objective')?.textContent==='Goal conflict recovery'`, 'Goal restart did not acknowledge');
    await run(`window.__independentSmoke.nativeGoalFaults.error='goal_revision_conflict'`);await button('Pause','.persistent-goal-controls[aria-label="Persistent goal"] button');
    await until(`document.querySelector('.native-chat-main')?.textContent.includes('The goal changed.')`, 'CAS conflict was reported as success');
    assert.equal(await run(`window.__independentSmoke.nativeSessions.A.goal.status`),'active');
    await until(`!![...document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"] button')].find(b=>b.textContent==='Pause'&&!b.disabled)`, 'Actual CAS revision did not refresh');
    await button('Pause','.persistent-goal-controls[aria-label="Persistent goal"] button');await until(`!![...document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"] button')].find(b=>b.textContent==='Resume'&&!b.disabled)`, 'Human retry did not apply actual revision');
    await run(`window.__independentSmoke.nativeGoalFaults.error='goal_owned_by_run'`);await button('Resume','.persistent-goal-controls[aria-label="Persistent goal"] button');
    await until(`document.querySelector('.native-chat-main')?.textContent.includes('An independent run owns this goal.')&&document.querySelector('.persistent-goal-controls[aria-label="Persistent goal"]')?.textContent.includes('Continuation is controlled')`, 'Owner mismatch did not explain the real controller');
    assert(await run(`[...document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"] button')].filter(b=>b.textContent!=='Refresh').every(b=>b.disabled)`));
    await run(`window.__independentSmoke.nativeSessions.A.goal.continuation_owner='legacy_chat';window.__independentSmoke.nativeGoalFaults.delay=0;window.__independentSmoke.refreshNative()`);
    log('native-goal-edges:passed',{actualClearCAS:true,doubleClearBlocked:true,conflictNotSuccess:true,actualRevisionRefresh:true,humanRetryOnly:true,realOwnerMismatchExplained:true});
    const migrationSentBefore=await run(`window.__independentSmoke.navigation.sent.length`);
    await run(`(()=>{const fixture=window.__independentSmoke;fixture.nativeGoalRevisions.A++;fixture.nativeSessions.A.goal={...fixture.nativeSessions.A.goal,goal:'Preserve the controlled original paused goal',status:'active',revision:fixture.nativeGoalRevisions.A,space:'lbws-'+ 'b'.repeat(32)};fixture.refreshNative()})()`);
    await until(`!![...document.querySelectorAll('.persistent-goal-controls[aria-label="Persistent goal"] button')].find(b=>b.textContent==='Pause'&&!b.disabled)`, 'Active legacy goal cannot be explicitly paused');
    await button('Pause','.persistent-goal-controls[aria-label="Persistent goal"] button');
    await until(`!!document.querySelector('.native-goal-migration')`, 'Actual paused legacy status did not offer goal migration');
    assert.equal(await run(`window.__independentSmoke.nativeCalls.filter(c=>c.operation==='goalMigration').length`),0);
    await button('Review original goal','.native-goal-migration button');
    await until(`document.querySelector('.native-goal-migration-review')?.textContent.includes('Preserve the controlled original paused goal')`, 'Migration review lacks actual original goal');
    await run(`window.__independentSmoke.migrationFaults.loseAck=true`);
    await button('Confirm migration','.native-goal-migration button');
    await until(`document.querySelector('.native-goal-migration')?.textContent.includes('outcome is unconfirmed')&&!document.querySelector('.native-goal-migration button').disabled`, 'Unknown migration ACK did not retain retry');
    await run(`window.__independentSmoke.remountNative()`);
    await until(`!![...document.querySelectorAll('.native-goal-migration button')].find(b=>b.textContent==='Retry the same migration'&&!b.disabled)`, 'Scoped migration UUID did not recover after remount');
    await button('Retry the same migration','.native-goal-migration button');
    await until(`!document.querySelector('.native-goal-migration')&&window.__independentSmoke.nativeSessions.A.goal.space==='research'`, 'Migration ACK did not refresh the actual native goal');
    const migrationCalls=await run(`window.__independentSmoke.nativeCalls.filter(c=>c.operation==='goalMigration'&&c.action==='migrate')`);
    assert.equal(migrationCalls.length,2);assert.equal(migrationCalls[0].clientRequestId,migrationCalls[1].clientRequestId);
    assert.equal(await run(`window.__independentSmoke.migrationCopies.A`),1);assert.equal(await run(`window.__independentSmoke.navigation.sent.length`),migrationSentBefore);
    assert.equal(await run(`window.__independentSmoke.nativeSessions.A.goal.status`),'paused');
    log('native-goal-migration:passed',{explicitPause:true,noAutoReview:true,originalGoalVisible:true,unknownAckSameUuidAfterRemount:true,oneTargetCopy:true,actualGoalStatusRefresh:true,noAutoResume:true});
    await until(`document.querySelectorAll('.child-run-bubble').length===2`, 'Two real child snapshots did not render');
    assert(await run(`[...document.querySelectorAll('.child-run-bubble')].every(b=>!b.open)`));
    await run(`document.querySelector('.child-run-bubble summary').click()`);
    await run(`window.__independentSmoke.childDelta('A',0,' LIVE A');window.__independentSmoke.childDelta('A',1,' LIVE B');window.__independentSmoke.childDelta('A',0,' FOREIGN',true)`);
    await until(`document.querySelectorAll('.child-run-bubble')[0].textContent.includes('LIVE A')&&document.querySelectorAll('.child-run-bubble')[1].textContent.includes('LIVE B')`, 'Independent child answer streams did not update');
    assert(!await run(`document.querySelector('.chat-transcript').textContent.includes('FOREIGN')`));
    assert(!await run(`[...document.querySelectorAll('.chat-message')].some(m=>m.textContent.includes('LIVE A')||m.textContent.includes('LIVE B'))`));
    await run(`document.querySelector('.child-run-bubble summary').click()`);
    assert.equal(await run(`document.querySelector('.child-run-bubble').open`), false, 'Bubble did not collapse on manual click');
    await run(`window.__independentSmoke.childDelta('A',0,' TOKEN-AFTER-COLLAPSE')`);
    await new Promise(r => setTimeout(r, 60));
    assert.equal(await run(`document.querySelector('.child-run-bubble').open`), false, 'Bubble did not remain collapsed after incoming stream tokens');
    await run(`document.querySelector('.child-run-bubble summary').focus()`);
    await key('Enter');
    assert.equal(await run(`document.querySelector('.child-run-bubble').open`), true, 'Keyboard Enter did not reopen collapsed bubble');
    assert(await run(`document.querySelector('.child-run-bubble').textContent.includes('TOKEN-AFTER-COLLAPSE')`));
    await run(`(()=>{const content=document.querySelector('.child-run-message');const range=document.createRange();range.selectNodeContents(content);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range)})()`);
    const selectedChild=await run(`document.getSelection().toString()`),scrollBefore=await run(`document.querySelector('.chat-transcript').scrollTop`);
    await run(`window.__independentSmoke.childDelta('A',0,' SELECTED-LIVE')`);await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(await run(`document.getSelection().toString()`),selectedChild);assert.equal(await run(`document.querySelector('.chat-transcript').scrollTop`),scrollBefore);
    assert(!await run(`document.querySelector('.child-run-message').textContent.includes('SELECTED-LIVE')`));
    await run(`document.getSelection().removeAllRanges()`);await until(`document.querySelector('.child-run-message').textContent.includes('SELECTED-LIVE')`, 'Genuine buffered child text did not resume after selection');
    log('native-child-keyboard-selection:passed',{keyboardDisclosure:true,openStateSurvivesUpdates:true,selectedTextPreserved:true,noScrollDuringSelection:true,latestActualTextAfterSelection:true});
    await run(`window.__independentSmoke.select('B')`);
    await until(`document.querySelectorAll('.child-run-bubble').length===2&&document.querySelector('.child-run-bubble').textContent.includes('model-b')`, 'Child recovery did not follow bound chat B');
    assert(!await run(`document.querySelector('.chat-transcript').textContent.includes('LIVE A')`));
    await run(`window.__independentSmoke.select('A')`);
    await until(`document.querySelector('.child-run-bubble')?.textContent.includes('LIVE A')`, 'Actual child history did not restore after scope switch');
    log('native-child-streams:passed',{twoActiveChildren:true,collapsedDisclosure:true,separateGenuineAnswers:true,foreignScopeRejected:true,parentTextUnchanged:true,recoveredAfterSpaceSwitch:true,actualParentTurn:'parent-a'});
    await until(`!!document.querySelector('.model-policy-controls')&&document.querySelector('.composer-model option[value="__lastbrowser_auto_policy__"]')?.disabled`, 'Unproven AUTO was not disabled');
    assert.equal(await run(`window.__independentSmoke.nativeCalls.filter(c=>c.operation==='modelPolicy'&&c.action==='set').length`),0);
    await run(`document.querySelector('.model-policy-controls summary').click()`);
    await run(`(()=>{const p=document.querySelector('.model-policy-controls');const select=p.querySelector('select');select.value='auto';select.dispatchEvent(new Event('change',{bubbles:true}));p.querySelector('.model-policy-models input').click()})()`);
    await run(`(()=>{const p=document.querySelector('.model-policy-controls');const select=p.querySelectorAll('select')[1];select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));p.querySelector('form').requestSubmit();p.querySelector('form').requestSubmit()})()`);
    await until(`window.__independentSmoke.nativePolicies.A.mode==='auto'&&document.querySelector('.composer-model select').value==='__lastbrowser_auto_policy__'`, 'Explicit AUTO policy save did not confirm');
    assert.deepEqual(await run(`window.__independentSmoke.nativePolicies.A.allowedCloudDataClasses`),[]);
    assert.equal(await run(`window.__independentSmoke.nativePolicies.A.cloudPolicy`),'deny');
    assert(await run(`document.querySelector('.model-policy-controls').textContent.includes('Outdated observation')&&document.querySelector('.model-policy-controls').textContent.includes('Remaining: Unknown')`));
    assert.equal(await run(`window.__independentSmoke.nativeCalls.filter(c=>c.operation==='modelPolicy'&&c.action==='set').length`),1);
    await run(`window.__independentSmoke.autoAvailability.A=true`);
    await button('Refresh','.model-policy-controls>button');
    await until(`document.querySelector('.composer-model option[value="__lastbrowser_auto_policy__"]')?.disabled===false`, 'Actual execution availability did not enable AUTO');
    await until(`document.querySelector('.model-policy-decision')?.textContent.includes('Decision not yet known')`, 'Unproven AUTO decision was not unknown');
    assert(await run(`document.querySelector('.model-policy-decision')?.textContent.includes('Configured preference')`));
    await run(`window.__independentSmoke.bindStream('A','native-turn-stream-1')`);
    await run(`window.__independentSmoke.sendStreamEvent({event:'done',streamId:'native-turn-stream-1',nativeContext:{sessionId:'native-a',streamId:'native-turn-stream-1'},data:{session:{session_id:'native-a'},provider_evidence:{provider_id:'controlled-provider',model_id:'model-a',successful_chat:true}}})`);
    await until(`document.querySelector('.model-policy-decision')?.textContent.includes('controlled-provider · model-a')`, 'Turn 1 observed decision was not displayed');
    await run(`window.__independentSmoke.bindStream('A',null)`);
    await run(`window.__independentSmoke.select('B')`);
    await until(`document.querySelector('.composer-model select')?.value==='@controlled-provider:model-b'`, 'Scope B did not mount');
    assert(!await run(`document.body.textContent.includes('controlled-provider · model-a')`), 'Decision leaked into Space B');
    await run(`window.__independentSmoke.select('A')`);
    await until(`document.querySelector('.model-policy-decision')?.textContent.includes('controlled-provider · model-a')`, 'Decision A was not restored on switch back');
    await run(`window.__independentSmoke.bindStream('A','native-turn-stream-2')`);
    await run(`window.__independentSmoke.sendStreamEvent({event:'token',streamId:'native-turn-stream-1',data:{session:{session_id:'native-a'},delta:'delayed token'}});window.__independentSmoke.sendStreamEvent({event:'done',streamId:'native-turn-stream-1',data:{session:{session_id:'native-a'},provider_evidence:{provider_id:'controlled-provider',model_id:'stale-model-1',successful_chat:true}}})`);
    await new Promise(resolve=>setTimeout(resolve,80));
    assert(!await run(`document.body.textContent.includes('stale-model-1')`), 'Stale completion from Stream 1 was mistakenly accepted');
    await run(`window.__independentSmoke.sendStreamEvent({event:'done',streamId:'native-turn-stream-2',nativeContext:{sessionId:'native-a',streamId:'native-turn-stream-2'},data:{session:{session_id:'native-a'},provider_evidence:{provider_id:'controlled-provider',model_id:'model-turn-2',successful_chat:true}}})`);
    await until(`document.querySelector('.model-policy-decision')?.textContent.includes('model-turn-2')`, 'Valid Stream 2 decision was not accepted');
    await run(`(()=>{const picker=document.querySelector('.composer-model select');picker.value='@custom:local:gemma4:31b';picker.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await until(`window.__independentSmoke.nativePolicies.A.mode==='fixed'&&document.querySelector('.composer-model select').value==='@custom:local:gemma4:31b'`, 'Fixed model switch did not follow actual policy ACK');
    assert.deepEqual(await run(`window.__independentSmoke.traceOrder.slice(-2)`),['policy-mode:fixed','space-model:gemma4:31b']);
    const policyCalls=await run(`window.__independentSmoke.nativeCalls.filter(c=>c.operation==='modelPolicy'&&c.action==='set')`);
    assert.deepEqual(policyCalls.map(c=>c.expectedRevision),[0,1]);assert(policyCalls.every(c=>c.clientRequestId&&c.sessionId==='native-a'&&!('spaceScope'in c)&&!('profile'in c)));
    assert.equal(await run(`window.__independentSmoke.nativePolicies.B.revision`),0);
    log('native-auto-policy:passed',{getReadOnly:true,unprovenExecutionDisabled:true,explicitActualModelAllowlist:true,noAutoSDKModel:true,explicitUserCAS:true,doubleSaveBlocked:true,cloudDeniedByDefault:true,nullableStaleQuotaHonest:true,actualGateEnablesOption:true,fixedPolicyAckBeforeModelChoice:true,otherSpaceUnchanged:true});
    await run(`window.__independentSmoke.controlRecovery()`);
    await until(`document.querySelectorAll('[data-native-request-id]').length===2`, 'Native controls did not recover exact persisted IDs');
    await run(`(()=>{const b=[...document.querySelectorAll('[data-native-request-id="approval-exact-a"] button')].find(b=>b.textContent==='Allow once');b.click();b.click()})()`);
    await until(`!document.querySelector('[data-native-request-id="approval-exact-a"]')`, 'Exact native approval did not acknowledge');
    await button('Second','[data-native-request-id="question-exact-a"] button');
    await run(`(()=>{const form=document.querySelector('[data-native-request-id="question-exact-a"] form');form.requestSubmit();form.requestSubmit()})()`);
    await until(`!document.querySelector('[data-native-request-id="question-exact-a"]')`, 'Exact native clarification did not acknowledge');
    const nativeControls=await run(`window.__independentSmoke.nativeCalls.filter(c=>c.operation==='controlChat')`);
    assert.equal(nativeControls.length,2);assert.equal(nativeControls[0].requestId,'approval-exact-a');assert.equal(nativeControls[1].requestId,'question-exact-a');assert.equal(nativeControls[1].response,'Second');
    assert(nativeControls.every(call=>call.streamId==='native-a'&&call.sessionId==='native-a'&&call.browserProfileId==='controlled'&&!('spaceScope'in call)));
    log('native-pending-controls:passed',{actualPersistedScopeStreamWriterIds:true,noFIFO:true,exactApproval:true,exactClarification:true,doubleSubmitBlocked:true,otherSpaceUnchanged:true});
    const pendingLocaleButtons={en:'Allow once',de:'Einmal erlauben',it:'Consenti una volta',es:'Permitir una vez',fr:'Autoriser une fois','pt-BR':'Permitir uma vez',ru:'Разрешить один раз',ja:'今回だけ許可'};
    for(const[locale,once]of Object.entries(pendingLocaleButtons)){
      await run(`window.__independentSmoke.locale(${JSON.stringify(locale)});window.__independentSmoke.controlRecovery()`);
      await until(`document.documentElement.lang===${JSON.stringify(locale)}&&document.querySelector('[data-native-request-id="approval-exact-a"]')?.textContent.includes(${JSON.stringify(once)})`, 'Localized native pending controls missing');
      await run(`(()=>{const b=[...document.querySelectorAll('[data-native-request-id="approval-exact-a"] button')].find(b=>b.textContent===${JSON.stringify(once)});b.focus()})()`);await key('Enter');
      await until(`!document.querySelector('[data-native-request-id="approval-exact-a"]')`, 'Keyboard approval did not use actual request ID');
      await input('[data-native-request-id="question-exact-a"] textarea','Equal keyboard free text '+locale);
      await run(`document.querySelector('[data-native-request-id="question-exact-a"] textarea').focus()`);await key('Tab');
      assert(await run(`document.activeElement.matches('[data-native-request-id="question-exact-a"] button[type=submit]')`));await key('Enter');
      await until(`!document.querySelector('[data-native-request-id="question-exact-a"]')`, 'Keyboard free-text clarification did not acknowledge');
      await run(`document.querySelector('.composer-command-button').focus()`);await key('Enter');await until(`document.querySelector('.chat-command-menu input')===document.activeElement`, 'Slash search did not receive keyboard focus');
      await key('Escape');await until(`!document.querySelector('.chat-command-menu')&&document.activeElement.matches('.composer-input-row>textarea')`, 'Slash Escape did not return composer focus');
    }
    await run(`window.__independentSmoke.locale('en');window.__independentSmoke.controlRecovery()`);await until(`document.querySelectorAll('[data-native-request-id]').length===2`, 'Native pending Scope race setup failed');
    await run(`(()=>{document.querySelector('[data-native-request-id="approval-exact-a"] button').click();window.__independentSmoke.select('B')})()`);
    await until(`document.querySelector('.native-chat-main')&&!document.querySelector('[data-native-request-id="approval-exact-a"]')`, 'Late A approval leaked into B');
    await new Promise(resolve=>setTimeout(resolve,120));assert(!await run(`document.querySelector('[data-native-request-id="question-exact-a"]')`));
    await run(`window.__independentSmoke.select('A')`);await until(`!!document.querySelector('[data-native-request-id="question-exact-a"]')&&!document.querySelector('[data-native-request-id="approval-exact-a"]')`, 'Actual accepted A approval did not recover without FIFO');
    await input('.composer-input-row>textarea','日本語の入力を確認');await run(`(()=>{const e=document.querySelector('.composer-input-row>textarea');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,keyCode:229,bubbles:true}))})()`);
    assert.equal(await run(`window.__independentSmoke.navigation.sent.length`),0);await key('Enter');await until(`window.__independentSmoke.navigation.sent.length===1`, 'Confirmed Japanese Enter did not send genuine composer text');
    assert.equal(await run(`window.__independentSmoke.navigation.sent[0].message`),'日本語の入力を確認');
    window.setContentSize(320,1000);await run(`window.__independentSmoke.locale('ja');window.__independentSmoke.controlRecovery()`);
    await until(`innerWidth===320&&document.querySelector('[data-native-request-id="approval-exact-a"]')?.textContent.includes('今回だけ許可')`, 'Japanese narrow pending UI did not render');
    assert(await run(`[...document.querySelectorAll('.native-pending-controls input,.native-pending-controls textarea,.native-pending-controls button')].every(e=>e.getBoundingClientRect().right<=innerWidth&&e.getBoundingClientRect().left>=0)`));
    await run(`document.querySelector('.native-pending-controls').scrollIntoView({block:'start'})`);
    const pendingShot=await capture('independent-renderer-ja-320-pending-smoke.png');window.setContentSize(1440,1040);await run(`window.__independentSmoke.locale('en')`);
    log('native-keyboard-locales:passed',{languages:Object.keys(pendingLocaleButtons),exactKeyboardApproval:true,equalFreeText:true,escapeReturnsComposerFocus:true,lateAckScopePreserved:true,composingEnterBlocked:true,confirmedEnterWorks:true,japanese320:true,screenshot:pendingShot});
    await input('.composer-input-row>textarea','/grill-me Clarify an actual scoped objective');
    await run(`document.querySelector('.chat-composer').requestSubmit()`);
    await until(`document.querySelector('.native-grill-controls textarea')?.value==='Clarify an actual scoped objective'&&!document.querySelector('.native-grill-controls textarea').disabled`, 'Actual Grill objective form missing');
    const grillSentBefore=await run(`window.__independentSmoke.navigation.sent.length`);
    await run(`(()=>{const b=[...document.querySelectorAll('.native-grill-controls button')].find(b=>b.textContent==='Start clarification');b.click();b.click()})()`);
    await until(`window.__independentSmoke.nativeGrills.A?.revision===1&&window.__independentSmoke.navigation.sent.length===${grillSentBefore+1}`, 'Explicit Grill start did not acknowledge then ask');
    assert.equal(await run(`window.__independentSmoke.nativeCalls.filter(c=>c.operation==='grill'&&c.action==='start').length`),1);
    await run(`window.__independentSmoke.grillQuestion('A')`);await until(`!!document.querySelector('[data-grill-question="question-1"]')`, 'Actual 3-option Grill question missing');
    assert.equal(await run(`document.querySelectorAll('[data-grill-question="question-1"] input[type=radio]').length`),3);
    await run(`window.__independentSmoke.grillQuestion('A','foreign');window.__independentSmoke.grillQuestion('A','generation');window.__independentSmoke.grillQuestion('A','shape')`);
    assert.equal(await run(`document.querySelectorAll('[data-grill-question="question-1"] input[type=radio]').length`),3);
    await input('[data-grill-question="question-1"] textarea','Equal free-text answer');await run(`document.querySelector('[data-grill-question="question-1"] textarea').focus()`);await key('Tab');await key('Enter');
    await until(`window.__independentSmoke.nativeGrills.A.questions[0].answer?.text==='Equal free-text answer'&&!document.querySelector('[data-grill-question="question-1"]')`, 'Grill free text did not use actual question CAS');
    await run(`window.__independentSmoke.grillQuestion('A')`);await until(`document.querySelectorAll('[data-grill-question="question-2"] input[type=radio]').length===4`, 'Actual 4-option Grill question missing');
    await run(`document.querySelector('[data-grill-question="question-2"] input[type=radio]').click()`);
    await run(`document.querySelector('[data-grill-question="question-2"]').requestSubmit()`);
    await until(`window.__independentSmoke.nativeGrills.A.questions[1].answer?.choiceId==='option-1'&&!document.querySelector('[data-grill-question="question-2"]')`, 'Grill literal option did not persist');
    await button('Review answers','.native-grill-controls button');await until(`window.__independentSmoke.nativeGrills.A.status==='review'&&document.querySelector('.native-grill-controls details')?.open`, 'Actual Grill review missing');
    const correctionSentBefore=await run(`window.__independentSmoke.navigation.sent.length`);
    await until(`!![...document.querySelectorAll('.native-grill-controls button')].find(b=>b.textContent==='Correct answer'&&!b.disabled)`, 'Actual correction control remained locked');
    await button('Correct answer','.native-grill-controls button');await input('[data-grill-question="question-1"] textarea','Corrected genuine answer');
    await run(`document.querySelector('[data-grill-question="question-1"]').requestSubmit()`);await until(`window.__independentSmoke.nativeGrills.A.questions[0].answer?.text==='Corrected genuine answer'&&!document.querySelector('[data-grill-question="question-1"]')`, 'Actual corrected answer did not update');
    assert.equal(await run(`window.__independentSmoke.navigation.sent.length`),correctionSentBefore);
    await until(`!![...document.querySelectorAll('.native-grill-controls button')].find(b=>b.textContent==='Finish clarification'&&!b.disabled)`, 'Grill finish still busy');
    const grillNavBefore=await run(`({entered:window.__independentSmoke.navigation.entered,spaces:window.__independentSmoke.navigation.spaceLinks,sent:window.__independentSmoke.navigation.sent.length})`);
    await button('Finish clarification','.native-grill-controls button');await until(`window.__independentSmoke.nativeGrills.A.status==='finished'&&document.querySelector('.native-grill-controls')?.textContent.includes('Clarification finished')`, 'Actual Grill finish missing');
    assert.deepEqual(await run(`({entered:window.__independentSmoke.navigation.entered,spaces:window.__independentSmoke.navigation.spaceLinks,sent:window.__independentSmoke.navigation.sent.length})`),grillNavBefore);
    assert.equal(await run(`window.__independentSmoke.nativeModes.A.mode`),'grill_me');
    await until(`!document.querySelector('.native-grill-controls textarea').disabled`, 'Finished clarification did not allow explicit new objective');
    await input('.native-grill-controls textarea','Second actual interview');await run(`document.querySelector('.native-grill-controls form').requestSubmit()`);
    await until(`window.__independentSmoke.nativeGrills.A.objective==='Second actual interview'&&document.querySelector('.native-grill-history')?.textContent.includes('Corrected genuine answer')`, 'Completed Grill history not retained');
    await run(`window.__independentSmoke.grillQuestion('A');window.__independentSmoke.select('B')`);await until(`!document.querySelector('[data-grill-question="question-1"]')`, 'Grill question leaked into B');
    await run(`window.__independentSmoke.select('A')`);await until(`document.querySelectorAll('[data-grill-question="question-1"] input[type=radio]').length===3`, 'Actual Grill GET did not recover unanswered question');
    await input('.composer-input-row>textarea','/grill-me off');await run(`document.querySelector('.chat-composer').requestSubmit()`);await until(`!document.querySelector('.native-grill-controls')`, 'Actual Grill removal did not acknowledge');
    await input('.composer-input-row>textarea','/grill-me');await run(`document.querySelector('.chat-composer').requestSubmit()`);
    await until(`document.querySelector('.native-grill-controls')?.textContent.includes('earlier chat mode')&&!![...document.querySelectorAll('.native-grill-controls button')].find(b=>b.textContent==='Continue clarification'&&!b.disabled)`, 'Mode change did not require explicit Grill resume');
    await button('Continue clarification','.native-grill-controls button');await until(`window.__independentSmoke.nativeGrills.A.modeRevision===window.__independentSmoke.nativeModes.A.revision&&!document.querySelector('[data-grill-question="question-1"] textarea').disabled`, 'Explicit resume did not bind current mode revision');
    await run(`window.__independentSmoke.grillFaults.error='grill_revision_conflict'`);await input('.composer-input-row>textarea','Keep this answer on CAS conflict');await run(`document.querySelector('.chat-composer').requestSubmit()`);
    await until(`document.querySelector('.native-grill-controls')?.textContent.includes('The questions changed.')`, 'Grill CAS conflict not explained');
    assert.equal(await run(`document.querySelector('.composer-input-row>textarea').value`),'Keep this answer on CAS conflict');
    assert.equal(await run(`window.__independentSmoke.nativeGrills.A.questions[0].answer`),null);
    await until(`!document.querySelector('[data-grill-question="question-1"] textarea').disabled`, 'Grill conflict did not refresh actual question');
    await run(`document.querySelector('.chat-composer').requestSubmit()`);await until(`window.__independentSmoke.nativeGrills.A.questions[0].answer?.text==='Keep this answer on CAS conflict'&&document.querySelector('.composer-input-row>textarea').value===''`, 'Main composer free text bypassed actual Grill state');
    await run(`window.__independentSmoke.grillFallback('A')`);await until(`document.querySelector('.native-grill-controls')?.textContent.includes('did not return a valid structured question')&&document.querySelector('.chat-transcript')?.textContent.includes('Genuine unstructured model answer')`, 'Readable actual Grill fallback missing');
    assert.equal(await run(`document.querySelectorAll('.native-grill-controls input[type=radio]').length`),0);
    await run(`window.__independentSmoke.select('B')`);await until(`!document.querySelector('.native-grill-controls')`, 'Fallback leaked into another Space');
    await run(`window.__independentSmoke.select('A');window.__independentSmoke.remountNative()`);await until(`document.querySelector('.native-grill-controls')?.textContent.includes('did not return a valid structured question')`, 'Persisted actual fallback hint did not recover after remount');
    const nextSentBefore=await run(`window.__independentSmoke.navigation.sent.length`);await run(`(()=>{const b=[...document.querySelectorAll('.native-grill-controls button')].find(b=>b.textContent==='Ask the next question');b.click();b.click()})()`);
    assert.equal(await run(`window.__independentSmoke.navigation.sent.length`),nextSentBefore+1);
    await run(`window.__independentSmoke.grillQuestion('A')`);await until(`document.querySelectorAll('[data-grill-question="question-2"] input[type=radio]').length===4`, 'Grill recovery after fallback missing');
    const grillAnswerLabels={en:'Your own answer',de:'Deine eigene Antwort',es:'Tu propia respuesta',fr:'Votre propre réponse',it:'La tua risposta libera','pt-BR':'Sua própria resposta',ru:'Ваш свободный ответ',ja:'自由回答'};
    for(const [locale,label]of Object.entries(grillAnswerLabels)){await run(`window.__independentSmoke.locale(${JSON.stringify(locale)})`);await until(`document.querySelector('[data-grill-question="question-2"]')?.textContent.includes(${JSON.stringify(label)})`, 'Localized equal Grill free-text choice missing');}
    window.setContentSize(320,1000);await until(`innerWidth===320`, 'Grill Japanese narrow size missing');await run(`document.querySelector('.native-grill-controls').scrollIntoView({block:'start'})`);
    assert(await run(`[...document.querySelectorAll('.native-grill-controls textarea,.native-grill-controls button,.native-grill-controls fieldset')].every(e=>e.getBoundingClientRect().right<=innerWidth&&e.getBoundingClientRect().left>=0)`));
    const grillShot=await capture('independent-renderer-ja-320-grill-smoke.png');window.setContentSize(1440,1040);await run(`window.__independentSmoke.locale('en')`);
    log('native-grill:passed',{explicitStartAfterActualModeACK:true,noDuplicateStart:true,threeAndFourOptions:true,equalKeyboardFreeText:true,actualChoice:true,correctionDoesNotAsk:true,reviewAndFinish:true,finishNoNavigationOrModeChange:true,completedHistory:true,scopeRecovery:true,explicitModeRebind:true,composerSharesAnswerAPI:true,CASPreservesAnswer:true,foreignGenerationAndShapeRejected:true,genuineFallbackNoFabricatedOptions:true,languages:Object.keys(grillAnswerLabels),japanese320:true,screenshot:grillShot});
    await run(`window.__independentSmoke.showLocal()`);
    await until(`document.querySelector('.local-ai-step')?.textContent.includes('Controlled CPU')`, 'Scope-free hardware inventory did not load in setup flow');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='localAiHardwareInventory').length`),1);
    assert.equal(await run(`window.__independentSmoke.calls.find(c=>c.operation==='localAiHardwareInventory').scope===undefined`),true);
    await button('Advanced','.local-ai-mode button');
    await until(`!!document.querySelector('.local-ai-model input:disabled')&&document.querySelector('.local-ai-setup')?.textContent.includes('Runtime is missing or unverified')`, 'Actual unavailable runtime was not explained');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='localAi'&&c.payload.action==='scan').length`),1);
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='localAi'&&c.payload.action==='setup'&&c.payload.request.operation==='start').length`),0);
    assert(await run(`document.querySelector('.local-ai-setup').textContent.includes('Unknown')`));
    await run(`(()=>{const detail=[...document.querySelectorAll('.local-ai-setup details')].find(e=>e.querySelector('summary').textContent==='Review files');detail.open=true;detail.querySelector('input').click()})()`);
    await run(`document.querySelector('.local-ai-file input[type=checkbox]').click()`);
    await button('Save preference','.local-ai-setup button');
    await until(`window.__independentSmoke.localState.A.preferences.revision===1&&!document.querySelector('.local-ai-setup fieldset').disabled`, 'Explicit local file preference did not persist');
    await button('Review files','.local-ai-setup>section button');
    await until(`!!document.querySelector('.local-ai-plan')`, 'Pinned file review did not render');
    assert(await run(`document.querySelector('.local-ai-plan code').textContent.length===64`));
    assert(await run(`[...document.querySelectorAll('.local-ai-plan button')].find(b=>b.textContent==='Start download').disabled`));
    await run(`document.querySelector('.local-ai-plan input[type=checkbox]').click()`);
    await button('Confirm consent','.local-ai-plan button');
    await until(`![...document.querySelectorAll('.local-ai-plan button')].find(b=>b.textContent==='Start download').disabled`, 'Actual consent ACK did not enable explicit start');
    await run(`(()=>{const b=[...document.querySelectorAll('.local-ai-plan button')].find(b=>b.textContent==='Start download');b.click();b.click()})()`);
    await until(`!!document.querySelector('[data-local-ai-job]')`, 'Actual download job did not render');
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='localAi'&&c.payload.action==='setup'&&c.payload.request.operation==='start').length`),1);
    await run(`window.__independentSmoke.select('B')`);
    await until(`!!document.querySelector('.local-ai-setup')&&window.__independentSmoke.localScans.B`, 'Local AI B did not load');
    await until(`![...document.querySelectorAll('.local-ai-setup button')].find(button=>button.textContent==='Skip / use existing provider').disabled`, 'Skip was not available after scoped preference load');
    await button('Skip / use existing provider','.local-ai-setup button');
    await until(`window.__independentSmoke.localState.B.preferences.decision==='skip'`, 'Skip did not persist in B');
    await run(`window.__independentSmoke.select('A')`);
    await until(`!!document.querySelector('[data-local-ai-job]')`, 'Actual download did not recover on return');
    assert.equal(await run(`document.querySelector('.local-ai-plan')`),null);
    await button('Cancel','.local-ai-setup [data-local-ai-job] button');
    await until(`document.querySelector('[data-local-ai-job]').textContent.includes('Stopping')`, 'Stopping was incorrectly treated as cancelled');
    await run(`(()=>{const job=window.__independentSmoke.localState.A.jobs[0];job.state='cancelled';job.revision++;job.updatedAt=new Date().toISOString()})()`);
    await until(`document.querySelector('[data-local-ai-job]').textContent.includes('Cancelled')`, 'Actual cancelled state did not poll');
    assert(await run(`document.querySelector('.local-ai-setup').textContent.includes('Downloaded files alone do not make inference available')`));
    const localRequests=await run(`window.__independentSmoke.calls.filter(c=>c.operation==='localAi')`);
    assert(localRequests.every(call=>!['cacheRoot','hardware','privateHumanAction','authority'].some(field=>field in call.payload)));
    log('local-ai-ui:passed',{hardwareStrictModeSingleScan:true,unsupportedDisabled:true,unknownGpuNoFakeBenchmark:true,noAutoDownload:true,explicitPreferenceCAS:true,pinnedFilesReview:true,licenseConsentThenStart:true,doubleStartBlocked:true,jobsRecoverAfterRemount:true,newReviewAfterRemount:true,stoppingUntilActualCancelled:true,separateSpaceSkip:true,executionUnavailableHonest:true});
    // This section tests mounted production React controls against typed,
    // deterministic results. It does not prove a model or native process ran.
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='localAi'&&c.payload.action==='runtime'&&c.payload.request.operation==='bootstrap').length`),0);
    await run(`(()=>{const job=window.__independentSmoke.localState.A.jobs[0];job.state='complete';job.revision++;job.updatedAt=new Date().toISOString()})()`);
    await button('Refresh','.local-ai-setup>section button');
    await until(`document.querySelector('[data-local-ai-job]').textContent.includes('Files verified')`, 'Completed download evidence did not refresh');
    await run(`(()=>{const selects=document.querySelectorAll('.local-ai-runtime select');selects[0].value='controlled:files';selects[0].dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await run(`(()=>{const select=document.querySelectorAll('.local-ai-runtime select')[1];select.value='extract';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until(`![...document.querySelectorAll('.local-ai-runtime button')].find(button=>button.textContent.includes('Review local test')).disabled`, 'Runtime review did not enable after completed files');
    await button('Fresh hardware scan · Review local test','.local-ai-runtime button');
    await until(`document.querySelector('.local-ai-runtime').textContent.includes('File manifest, checksum or license is incomplete')`, 'Runtime license limitation was not explained');
    assert.equal(await run(`document.querySelector('[data-local-ai-runtime-review]')`),null);
    await run(`window.__independentSmoke.runtimeFaults.reviewReason=''`);await button('Fresh hardware scan · Review local test','.local-ai-runtime button');
    await until(`!!document.querySelector('[data-local-ai-runtime-review]')`, 'Exact runtime purpose was not reviewed');
    assert(await run(`document.querySelector('[data-local-ai-runtime-review]').textContent.includes('CPU')&&document.querySelector('[data-local-ai-runtime-review]').textContent.includes('1024')`));
    assert.equal(await run(`window.__independentSmoke.calls.filter(c=>c.operation==='localAi'&&c.payload.action==='runtime'&&c.payload.request.operation==='bootstrap').length`),0);
    await run(`window.__independentSmoke.runtimeFaults.loseAck=true;window.__independentSmoke.runtimeFaults.unknownReceipt=true;(()=>{const button=[...document.querySelectorAll('[data-local-ai-runtime-review] button')].find(button=>button.textContent==='Start local test');button.click();button.click()})()`);
    await until(`!!document.querySelector('[data-local-ai-runtime-recovery] button:not(:disabled)')`, 'Unknown runtime ACK lost its request identity');
    const bootstrapRequest=await run(`window.__independentSmoke.calls.find(call=>call.operation==='localAi'&&call.payload.action==='runtime'&&call.payload.request.operation==='bootstrap').payload.request`);
    await run(`window.__independentSmoke.select('B')`);await until(`document.querySelector('.local-ai-runtime')?.dataset.localAiRuntimeScope===JSON.stringify(Object.values(window.__independentSmoke.scopes.B))`, 'Runtime B did not mount');
    assert.equal(await run(`document.querySelector('[data-local-ai-runtime-recovery]')`),null);
    await run(`window.__independentSmoke.select('A')`);await until(`document.querySelector('.local-ai-runtime')?.dataset.localAiRuntimeScope===JSON.stringify(Object.values(window.__independentSmoke.scopes.A))&&!!document.querySelector('[data-local-ai-runtime-recovery] button:not(:disabled)')`, 'Original runtime request did not survive remount');
    assert(await run(`[...document.querySelectorAll('.local-ai-runtime button')].find(button=>button.textContent.includes('Review local test')).disabled`));
    await button('Check the existing test result','.local-ai-runtime button');
    await until(`!!document.querySelector('[data-local-ai-runtime-recovery] button:not(:disabled)')`, 'Unknown read-only receipt did not remain unconfirmed');
    await run(`window.__independentSmoke.runtimeFaults.unknownReceipt=false`);await button('Check the existing test result','.local-ai-runtime button');
    await until(`!!document.querySelector('[data-local-ai-runtime-benchmark]')&&!document.querySelector('[data-local-ai-runtime-recovery]')`, 'Historical technical result did not recover');
    assert(await run(`document.querySelector('[data-local-ai-runtime-benchmark]').textContent.includes('Synthetic test evidence')&&document.querySelector('[data-local-ai-runtime-benchmark]').textContent.includes('remain unverified')`));
    const runtimeCalls=await run(`window.__independentSmoke.calls.filter(call=>call.operation==='localAi'&&call.payload.action==='runtime')`);
    assert.equal(runtimeCalls.filter(call=>call.payload.request.operation==='bootstrap').length,1);
    assert(runtimeCalls.filter(call=>call.payload.request.operation==='receipt').every(call=>call.payload.request.clientRequestId===bootstrapRequest.clientRequestId&&call.payload.request.purposeDigest===bootstrapRequest.purposeDigest));
    await button('Refresh process status','.local-ai-runtime button');await until(`!!document.querySelector('[data-local-ai-runtime-handle] button:not(:disabled)')`, 'Scoped runtime process did not display');
    await button('Cancel','.local-ai-runtime [data-local-ai-runtime-handle] button');await until(`document.querySelector('[data-local-ai-runtime-handle]').textContent.includes('Stopping')`, 'Unload false was incorrectly displayed as stopped');
    await run(`(()=>{const handle=window.__independentSmoke.localRuntime.A.handles[0];handle.state='stopped';handle.revision++})()`);await until(`document.querySelector('[data-local-ai-runtime-handle]').textContent.includes('Process stopped')`, 'Actual stopped process observation did not refresh');
    const runtimeRecoveryLabels={en:'Check the existing test result',de:'Vorhandenes Testergebnis prüfen',es:'Consultar el resultado existente',fr:'Consulter le résultat existant',it:'Controlla il risultato esistente','pt-BR':'Consultar o resultado existente',ru:'Проверить существующий результат',ja:'既存のテスト結果を確認'};
    for(const locale of Object.keys(runtimeRecoveryLabels)){await run(`window.__independentSmoke.locale(${JSON.stringify(locale)})`);await until(`document.querySelector('.local-ai-runtime')?.textContent.length>0`, 'Localized runtime controls missing');}
    window.setContentSize(320,1000);await until(`innerWidth===320`, 'Runtime narrow viewport missing');await run(`document.querySelector('[data-local-ai-runtime-benchmark]').scrollIntoView({block:'center'})`);
    assert(await run(`[...document.querySelectorAll('.local-ai-runtime button,.local-ai-runtime select,.local-ai-runtime article')].every(element=>element.getBoundingClientRect().left>=0&&element.getBoundingClientRect().right<=innerWidth)`));
    const runtimeShot=await capture('independent-renderer-ja-320-local-runtime-smoke.png');window.setContentSize(1440,1040);await run(`window.__independentSmoke.locale('en')`);
    log('local-ai-runtime-ui:passed',{controlledTransportOnly:true,noInferenceClaim:true,scanThenReviewThenSeparateStart:true,licenseGateExplained:true,doubleStartBlocked:true,unknownIdentitySurvivesRemount:true,readOnlyReceiptRecovery:true,otherScopeUnaffected:true,unloadWaitsActualStopped:true,syntheticEvidenceMarked:true,japanese320:true,screenshot:runtimeShot});
    await run(`window.__independentSmoke.showNativeAgain()`);
    await run(`window.__independentSmoke.locale('ja')`);
    await until(`document.documentElement.lang==='ja'&&!!document.querySelector('[aria-label="推論の深さ"]')`, 'Japanese locale or reasoning picker did not render');
    assert.equal(await run(`localStorage.getItem('lastbrowser.locale')`),'ja');
    assert(await run(`document.querySelector('.native-chat')?.textContent.includes('新しい')||document.body.textContent.includes('新しい')`));
    const japaneseShot=await capture('independent-renderer-ja-smoke.png');
    assert(await run(`(()=>{const p=document.querySelector('[aria-label="推論の深さ"]');return p.getBoundingClientRect().right<=innerWidth&&p.getBoundingClientRect().left>=0})()`));
    log('japanese:passed',{persistedLocale:true,localizedComposer:true,reasoningPickerFits:true,screenshot:japaneseShot});
    window.setContentSize(320,1000);
    await until(`innerWidth===320`, '320px native viewport did not apply');
    await run(`document.querySelector('.model-policy-controls').open=true`);
    assert(await run(`(()=>{const p=document.querySelector('.model-policy-controls');const inputs=[...p.querySelectorAll('select,input')];return p.getBoundingClientRect().right<=innerWidth&&p.getBoundingClientRect().left>=0&&inputs.every(input=>input.getBoundingClientRect().right<=innerWidth&&input.getBoundingClientRect().left>=0)})()`));
    assert(await run(`document.querySelector('.model-policy-controls').textContent.includes('クラウドの使用')`));
    const narrowShot=await capture('independent-renderer-ja-320-policy-smoke.png');
    log('japanese-auto-320:passed',{viewport:320,realFormControlsFit:true,localizedPolicy:true,screenshot:narrowShot});
    await run(`window.__independentSmoke.showLocal()`);
    await until(`!!document.querySelector('.local-ai-model input:disabled')`, 'Japanese Local AI did not load');
    await run(`document.querySelector('.local-ai-setup details').open=true`);
    assert(await run(`(()=>{const p=document.querySelector('.local-ai-setup');return p.textContent.includes('ローカルAI')&&[...p.querySelectorAll('input,button')].every(input=>input.getBoundingClientRect().right<=innerWidth&&input.getBoundingClientRect().left>=0)})()`));
    const local320=await capture('independent-renderer-ja-320-local-ai-smoke.png');
    await run(`window.__independentSmoke.showAssistant()`);
    await until(`!!document.querySelector('.space-assistant-setup')&&!window.__independentSmoke.entry('A').loading`, 'Japanese Assistant did not restore');
    await openSetupSection(1);
    await until(`!!document.querySelector('.browser-account-setup')`, 'Japanese Browseraccount form did not render');
    assert(await run(`(()=>{const p=document.querySelector('.browser-account-setup');return !p.textContent.includes('Task-browser accounts')&&[...p.querySelectorAll('input,button')].every(input=>input.getBoundingClientRect().right<=innerWidth&&input.getBoundingClientRect().left>=0)})()`));
    await run(`document.querySelector('.browser-account-setup').scrollIntoView({block:'start'})`);
    log('japanese-local-browser-320:passed',{viewport:320,localizedLocalAi:true,localizedOwnBrowser:true,actualInputsFit:true,localAiScreenshot:local320,browserScreenshot:await capture('independent-renderer-ja-320-browser-account-smoke.png')});
    window.setContentSize(1440,1040);
    await run(`window.__independentSmoke.showStart()`);
    const startLocales={en:['Active','No tabs','Own session'],de:['Aktiv','Keine Tabs','Eigene Session'],it:['Attivo','Nessuna scheda','Sessione separata'],es:['Activo','Sin pestañas','Sesión propia'],fr:['Actif','Aucun onglet','Session distincte'],'pt-BR':['Ativo','Nenhuma aba','Sessão própria'],ru:['Активен','Нет вкладок','Отдельная сессия'],ja:['有効','タブなし','個別のセッション']};
    for(const[locale,labels]of Object.entries(startLocales)){
      await run(`window.__independentSmoke.locale(${JSON.stringify(locale)})`);
      await until(`document.documentElement.lang===${JSON.stringify(locale)}&&!!document.querySelector('[data-testid=browser-start-spaces-hub]')`, 'Startpage locale did not render');
      const text=await run(`document.querySelector('[data-testid=browser-start-spaces-hub]').textContent`);
      for(const label of labels)assert(text.includes(label),locale+' missing '+label);
      if(locale!=='de')for(const stale of ['Keine Tabs','Eigene Session','Neuer Space'])assert(!text.includes(stale),locale+' stale German '+stale);
    }
    await run(`document.querySelector('.startpage-space-add-card').click()`);
    await input('#startpage-space-name-input','調査');
    await run(`document.querySelector('.startpage-modal-form').requestSubmit()`);
    await until(`window.__independentSmoke.navigation.createdSpace?.name==='調査'`, 'Japanese Space name did not submit');
    assert.equal(await run(`window.__independentSmoke.navigation.createdSpace.path`),'workspaces/調査');
    const startShot=await capture('independent-renderer-ja-startpage-smoke.png');
    log('startpage-locales:passed',{languages:Object.keys(startLocales),spaceStatesLocalized:true,noGermanCrossLocale:true,japaneseSpacePath:true,screenshot:startShot});
    await run(`window.__independentSmoke.dispose()`);
    log('passed', { electron: process.versions.electron, screenshot: shot, counts:await run(`({cancels:window.__independentSmoke.calls.filter(c=>c.operation==='cancelAssistantTurn').length,runControls:window.__independentSmoke.calls.filter(c=>c.operation==='runControl').length,navigation:window.__independentSmoke.navigation})`) });
    clearTimeout(timeout);window.destroy();app.quit();
  } catch (error) { log('failed', { message:error.message, stack:error.stack });clearTimeout(timeout);window?.destroy();app.exit(1); }
}
if (process.argv.includes('--electron-child')) void electronChild(process.argv[process.argv.indexOf('--electron-child')+1],process.argv.slice(process.argv.indexOf('--electron-child')+2).find(value=>['--ux-only','--child-only','--goal-only','--model-picker-only','--local-ai-only'].includes(value))||'');
else void parent().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
