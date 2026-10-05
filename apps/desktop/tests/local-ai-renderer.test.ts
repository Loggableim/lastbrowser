import { describe,expect,it } from 'vitest';
import { desktopLocaleCatalogs } from '../src/renderer/i18n.js';
import { isChatQualificationCandidate,isLocalAiHardwareInventory,isLocalAiResponse,localAiScanFresh,type LocalAiHardware } from '../src/renderer/local-ai-contracts.js';
import { isLocalAiRuntimeResponse,runtimeResponseMatches } from '../src/renderer/local-ai-runtime-contracts.js';
import { IndependentAssistantClient } from '../src/renderer/independent-assistant-client.js';
import { localAiBootstrapPanelLabel,retryRetryableOnce } from '../src/renderer/components/local-ai-bootstrap-state.js';
import { localAiCopy,localAiReason,localAiSetupCopy } from '../src/renderer/i18n/local-ai-copy.js';
import { advanceLocalAiSetupScopeEpoch,isLocalAiSetupRequestCurrent,localAiSetupRequestOwner,readLocalAiSetupMode,resolveSimpleRecommendationPreset,simpleLocalAiActionsAvailable,withLocalAiScanTimeout,writeLocalAiSetupMode } from '../src/renderer/components/local-ai-setup-preference.js';
const scope={backendProfileId:'9cc9ed75-7731-4da4-88f1-af453a3dfdc3',spaceId:'9cc9ed75-7731-4da4-88f1-af453a3dfdc4',browserProfileId:'controlled'};
const time='2026-10-04T02:20:00Z';
const measurement={value:null,status:'unknown',source:'controlled-probe',observedAt:time};
const hardware={schemaVersion:1,scanId:'scan-a',observedAt:time,os:'win32',arch:'x64',cpuName:null,physicalCores:null,logicalCores:16,cpuFeatures:[],cpuFeaturesVerified:false,
  ramTotalBytes:measurement,ramAvailableBytes:measurement,diskFreeBytes:measurement,adapters:[]} as const;
const scan={schemaVersion:1,scope,scan:{schemaVersion:1,scope,hardware,gpuFeatureStatus:{cuda:'unknown'},probeIssues:[]},runtimes:[{buildRef:'in-tree:inference-unavailable',state:'unavailable',managed:'in_tree',os:'win32',arch:'x64'}],availableComputeSlots:0,skipAvailable:true,existingProviderAvailable:true};
const preferences={schemaVersion:1,scope,revision:0,decision:'undecided',preset:null,artifactIds:[],updatedAt:null};
describe('Local AI purpose UI contract',()=>{
  it('keeps the Local AI entry discoverable in Settings in every supported language',()=>{
    const titles={en:'AI & Local Models',de:'KI & lokale Modelle',it:'IA e modelli locali',es:'IA y modelos locales',fr:'IA et modèles locaux','pt-BR':'IA e modelos locais',ru:'ИИ и локальные модели',ja:'AI・ローカルモデル'} as const;
    for(const[locale,title]of Object.entries(titles)){
      expect(desktopLocaleCatalogs[locale as keyof typeof desktopLocaleCatalogs]['settings.sections.providers']).toBe(title);
      expect(desktopLocaleCatalogs[locale as keyof typeof desktopLocaleCatalogs]['settings.sectionDescriptions.providers']).toBeTruthy();
    }
  });
  it('accepts a scope-free read-only inventory with unknown budgets but rejects extra authority fields',()=>{
    const inventory={schemaVersion:1,hardware,gpuFeatureStatus:{webgpu:'enabled'},probeIssues:[]};
    expect(isLocalAiHardwareInventory(inventory)).toBe(true);
    const unknownAdapter={adapterId:'arc',name:'Intel Arc',vendor:'pci:8086',sharedSystemMemory:null,memoryPoolId:'unknown-memory-topology',
      dedicatedBytes:measurement,processBudgetBytes:measurement,processUsageBytes:measurement};
    expect(isLocalAiHardwareInventory({...inventory,hardware:{...hardware,adapters:[unknownAdapter]}})).toBe(true);
    expect(isLocalAiHardwareInventory({...inventory,scope})).toBe(false);
    expect(isLocalAiHardwareInventory({...inventory,hardware:{...hardware,ramAvailableBytes:{...measurement,value:128}}})).toBe(false);
  });
  it('keeps unknown hardware and unavailable runtime honest, with skip always available',()=>{
    expect(isLocalAiResponse(scan)).toBe(true);
    expect(isLocalAiResponse({...scan,scan:{...scan.scan,hardware:{...hardware,ramAvailableBytes:{...measurement,value:100}}}})).toBe(false);
    expect(isLocalAiResponse({...scan,scan:{...scan.scan,scope:{...scope,browserProfileId:'other'}}})).toBe(false);
    expect(localAiScanFresh(hardware as LocalAiHardware,Date.parse(time)+30000)).toBe(true);
    expect(localAiScanFresh(hardware as LocalAiHardware,Date.parse(time)+30001)).toBe(false);
  });
  it('rejects foreign nested preferences and claim that files make inference ready',()=>{
    const base={schemaVersion:1,scope,operation:'get',preferences,skipAvailable:true,existingProviderAvailable:true};expect(isLocalAiResponse(base)).toBe(true);
    expect(isLocalAiResponse({...base,preferences:{...preferences,scope:{...scope,browserProfileId:'foreign'}}})).toBe(false);
    const job={schemaVersion:1,scope,jobId:'job-a',planDigest:'a'.repeat(64),revision:1,state:'stopping',totalBytes:100,downloadedBytes:null,verifiedBytes:null,createdAt:time,updatedAt:time,errorCode:null,executionUnavailable:true};
    expect(isLocalAiResponse({...base,operation:'status',job})).toBe(true);
    expect(isLocalAiResponse({...base,operation:'status',job:{...job,executionUnavailable:false}})).toBe(false);
  });
  it('checks recommendation scan identity and purpose response kind',async()=>{
    const result={schemaVersion:1,hardwareScanId:'scan-b',catalogRevision:'catalog-a',requestedPreset:'balanced',automaticRecommendation:null,state:'unavailable',recommendations:[],selectedArtifactIds:[],maxSimultaneousModels:0,cloudAllowed:false,reasonCodes:['runtime_missing']};
    const client=new IndependentAssistantClient({request:async()=>({ok:true,value:{schemaVersion:1,scope,result,skipAvailable:true,existingProviderAvailable:true}})});
    await expect(client.request({schemaVersion:1,scope,operation:'localAi',payload:{action:'recommend',scanId:'scan-a',preset:'balanced',contextTokens:4096}})).resolves.toMatchObject({ok:false,error:{code:'invalid_response'}});
    await expect(client.request({schemaVersion:1,scope,operation:'localAi',payload:{action:'scan'}})).resolves.toMatchObject({ok:false,error:{code:'invalid_response'}});
  });
  it('accepts the real chat role in an otherwise unavailable recommendation with a download-only candidate',async()=>{
    const chatRecommendation={artifactId:'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0',role:'chat',contextTokens:1024,parallelRequests:1,
      qualityTier:null,runtimeBuildRef:null,placement:null,adapterId:null,support:'unknown',suitability:'unmeasured',selectable:false,allocationReady:false,
      downloadReady:false,downloadBytes:null,peakRamBytes:null,peakGpuBytes:null,reasonCodes:['runtime_missing'],evidenceRefs:[]};
    const candidate={artifactId:chatRecommendation.artifactId,artifactRevision:'9969000761ce34de907bf20017cbfc3d52d6eaf9',state:'ready_to_download',
      contextTokens:1024,maxOutputTokens:48,parallelRequests:1,maxRamBytes:805306368,maxSeconds:25,downloadBytes:219312832,requiredDiskBytes:350000000,
      availableDiskBytes:2000000000,availableRamBytes:4000000000,reasonCodes:[],qualifiedForDevice:false,productAvailable:false,executionUnavailable:true};
    const result={schemaVersion:1,hardwareScanId:'scan-a',catalogRevision:'catalog-a',requestedPreset:'balanced',automaticRecommendation:null,state:'unavailable',
      recommendations:[chatRecommendation],selectedArtifactIds:[],maxSimultaneousModels:0,cloudAllowed:false,reasonCodes:['role_unavailable:chat'],chatQualificationCandidate:candidate};
    const envelope={schemaVersion:1,scope,result,skipAvailable:true,existingProviderAvailable:true};
    expect(isLocalAiResponse(envelope)).toBe(true);
    const client=new IndependentAssistantClient({request:async()=>({ok:true,value:envelope})});
    await expect(client.request({schemaVersion:1,scope,operation:'localAi',payload:{action:'recommend',scanId:'scan-a',preset:'balanced',contextTokens:4096}}))
      .resolves.toMatchObject({ok:true,value:{result:{chatQualificationCandidate:{state:'ready_to_download'}}}});
  });
  it('decodes the pinned chat catalog license using the backend-approved raw URL and pinned license page',()=>{
    const modelId='LiquidAI/LFM2.5-350M-GGUF',revision='9969000761ce34de907bf20017cbfc3d52d6eaf9';
    const licenseDigest='5188f2b355da20647257a3156db5834c794e5fb5e6d8dc4d4cdbb3180e75b85b';
    const artifact={artifactId:`${modelId}:LFM2.5-350M-QAD-Q4_0`,provider:'LiquidAI',modelId,revision,format:'gguf',quantization:'Q4_0',architecture:'lfm2',roles:['chat'],
      manifestComplete:true,licenseRef:`https://huggingface.co/${modelId}/blob/${revision}/LICENSE`,licenseDigest,contextLimit:1024,requiresTaskHead:false,taskHeadRef:null,requiresProjector:false,
      files:[{relativePath:'LFM2.5-350M-QAD-Q4_0.gguf',bytes:219312832,sha256:'3d10b6ab8fc91a919534b9558e266255aca0bbc7f6d015963599aa9e74e05b1d',
        sourceUrl:`https://huggingface.co/${modelId}/resolve/${revision}/LFM2.5-350M-QAD-Q4_0.gguf`,kind:'weights'},
        {relativePath:'LICENSE',bytes:10596,sha256:licenseDigest,sourceUrl:`https://huggingface.co/${modelId}/raw/${revision}/LICENSE`,kind:'license'}]};
    const envelope={schemaVersion:1,scope,catalog:{revision:'liquid-public-metadata-2026-10-05.1',observedAt:time,artifacts:[artifact]}};
    expect(isLocalAiResponse(envelope)).toBe(true);
    expect(isLocalAiResponse({...envelope,catalog:{...envelope.catalog,artifacts:[{...artifact,files:artifact.files.map(file=>file.kind==='license'?{...file,sourceUrl:'https://example.invalid/LICENSE'}:file)}]}})).toBe(false);
  });
  it('matches confirmation UUIDs after the backend canonicalizes them to hex',async()=>{
    const planDigest='a'.repeat(64),licenseDigest='b'.repeat(64),clientRequestId='9cc9ed75-7731-4da4-88f1-af453a3dfdc3';
    const envelope={schemaVersion:1,scope,operation:'confirm',skipAvailable:true,existingProviderAvailable:true,consent:{scope,planDigest,licenseDigests:[licenseDigest],
      clientRequestId:clientRequestId.replaceAll('-',''),confirmedAt:time,authority:'private_human_action'}};
    const client=new IndependentAssistantClient({request:async()=>({ok:true,value:envelope})});
    await expect(client.request({schemaVersion:1,scope,operation:'localAi',payload:{action:'setup',request:{operation:'confirm',planDigest,licenseDigests:[licenseDigest],clientRequestId}}}))
      .resolves.toMatchObject({ok:true,value:{consent:{planDigest,authority:'private_human_action'}}});
    await expect(new IndependentAssistantClient({request:async()=>({ok:true,value:{...envelope,consent:{...envelope.consent,clientRequestId:'11111111111141118111111111111111'}}})})
      .request({schemaVersion:1,scope,operation:'localAi',payload:{action:'setup',request:{operation:'confirm',planDigest,licenseDigests:[licenseDigest],clientRequestId}}}))
      .resolves.toMatchObject({ok:false,error:{code:'invalid_response'}});
  });
  it('keeps the optional pinned chat model as a download candidate, never as a qualified runtime',()=>{
    const candidate={artifactId:'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0',artifactRevision:'9969000761ce34de907bf20017cbfc3d52d6eaf9',
      state:'ready_to_download',contextTokens:1024,maxOutputTokens:48,parallelRequests:1,maxRamBytes:805306368,maxSeconds:25,downloadBytes:350000000,
      requiredDiskBytes:700000000,availableDiskBytes:2000000000,availableRamBytes:3000000000,reasonCodes:['device_qualification_required_after_download'],
      qualifiedForDevice:false,productAvailable:false,executionUnavailable:true};
    expect(isChatQualificationCandidate(candidate)).toBe(true);
    expect(isChatQualificationCandidate({...candidate,productAvailable:true})).toBe(false);
    const result={schemaVersion:1,scope, result:{schemaVersion:1,hardwareScanId:'scan-a',catalogRevision:'catalog-a',requestedPreset:'balanced',automaticRecommendation:null,
      state:'proposed',recommendations:[],selectedArtifactIds:[],maxSimultaneousModels:0,cloudAllowed:false,reasonCodes:[],chatQualificationCandidate:candidate},skipAvailable:true,existingProviderAvailable:true};
    expect(isLocalAiResponse(result)).toBe(true);
    expect(isLocalAiResponse({...result,result:{...result.result,chatQualificationCandidate:{...candidate,qualifiedForDevice:true}}})).toBe(false);
  });
  it('accepts only bounded, scoped chat capability evidence',()=>{
    const capability={schemaVersion:1,scope,operation:'capability',state:'ready',reasonCode:null,capabilities:['local_short_chat','deterministic_auto_short_chat'],
      artifactId:'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0',artifactRevision:'9969000761ce34de907bf20017cbfc3d52d6eaf9',
      profileRevision:'profile-1',planDigest:'a'.repeat(64),adapterRef:'adapter-1',runtimeBuildRef:'runtime-1',hardwareScanId:'scan-1',
      qualityEvidenceRef:'quality-1',memoryEvidenceRef:'memory-1',qualityVerified:true,contextTokens:1024,maxOutputTokens:48,parallelRequests:1,
      maxRamBytes:805306368,maxSeconds:25,releaseRedistributionVerified:true};
    expect(isLocalAiRuntimeResponse(capability)).toBe(true);
    const wrongScope={...capability,scope:{...scope,browserProfileId:'foreign'}};
    expect(isLocalAiRuntimeResponse(wrongScope)).toBe(true);
    expect(runtimeResponseMatches(wrongScope,{operation:'capability'},scope)).toBe(false);
    expect(isLocalAiRuntimeResponse({...capability,contextTokens:4096})).toBe(false);
  });
  it('contains complete eight-language setup, download, stopping and failure explanations',()=>{
    for(const locale of ['en','de','it','es','fr','pt-BR','ru','ja'] as const){const copy=localAiCopy(locale);expect(Object.values(copy).every(value=>typeof value==='string'&&value.length>0)).toBe(true);
      const setup=localAiSetupCopy(locale);expect(Object.values(setup).every(value=>value.length>0)).toBe(true);
      expect(localAiReason(locale,'runtime_missing')).toBeTruthy();expect(localAiReason(locale,'hardware_snapshot_stale')).toBeTruthy();}
    expect(localAiCopy('ja').filesOnly).toContain('推論');expect(localAiCopy('de').stopping).toBe('Stoppt');
    expect(localAiCopy('de').noAuto).toContain('Weitere Modelle');
  });
  it('defaults to simple and persists detail mode independently for each Space',()=>{
    const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
    const otherScope={...scope,spaceId:'9cc9ed75-7731-4da4-88f1-af453a3dfdc5'};
    expect(readLocalAiSetupMode(scope,storage)).toBe('simple');
    expect(writeLocalAiSetupMode(scope,'advanced',storage)).toBe(true);
    expect(readLocalAiSetupMode(scope,storage)).toBe('advanced');
    expect(readLocalAiSetupMode(otherScope,storage)).toBe('simple');
    expect(readLocalAiSetupMode(scope,{getItem:()=>{throw Error('storage unavailable');}})).toBe('simple');
  });
  it('rejects a late result from A after A to B to A even though the selection key is A again',()=>{
    const a1=advanceLocalAiSetupScopeEpoch({key:'space-a:default',epoch:0},'space-a:default');
    const b=advanceLocalAiSetupScopeEpoch(a1,'space-b:research');
    const a2=advanceLocalAiSetupScopeEpoch(b,'space-a:default');
    expect(a2.epoch).toBe(a1.epoch+2);
    expect(localAiSetupRequestOwner(a2)).not.toBe(localAiSetupRequestOwner(a1));
    expect(isLocalAiSetupRequestCurrent(localAiSetupRequestOwner(a1),localAiSetupRequestOwner(a2),true)).toBe(false);
    expect(isLocalAiSetupRequestCurrent(localAiSetupRequestOwner(a2),localAiSetupRequestOwner(a2),true)).toBe(true);
  });
  it('makes a stalled hardware scan reject with a retryable timeout',async()=>{
    await expect(withLocalAiScanTimeout(new Promise<never>(()=>{}),1)).rejects.toThrow('local_ai_hardware_scan_timeout');
    await expect(withLocalAiScanTimeout(Promise.resolve('scan complete'),100)).resolves.toBe('scan complete');
  });
  it('binds Simple setup to the returned preset and rejects stale scoped completions',()=>{
    expect(resolveSimpleRecommendationPreset('lightweight')).toBe('lightweight');
    expect(resolveSimpleRecommendationPreset(null)).toBe('balanced');
    expect(isLocalAiSetupRequestCurrent('space-a','space-a',true)).toBe(true);
    expect(isLocalAiSetupRequestCurrent('space-a','space-b',true)).toBe(false);
    expect(isLocalAiSetupRequestCurrent('space-a','space-a',false)).toBe(false);
  });
  it('hides empty Simple actions when no supported setup exists, while preserving Advanced controls',()=>{
    expect(simpleLocalAiActionsAvailable('simple','unavailable',false,true)).toBe(false);
    expect(simpleLocalAiActionsAvailable('simple','proposed',false,true)).toBe(false);
    expect(simpleLocalAiActionsAvailable('simple','proposed',true,true)).toBe(true);
    expect(simpleLocalAiActionsAvailable('advanced','unavailable',false,false)).toBe(true);
  });
  it('accepts only the installation-wide pinned router status and never infers runtime readiness',async()=>{
    const status={schemaVersion:1,installKey:'router-lfm2.5-230m-qad-q4_0-v1',revision:1,state:'downloading',jobId:'9cc9ed75-7731-4da4-88f1-af453a3dfdc3',attempt:1,
      downloadedBytes:1024,verifiedBytes:0,totalBytes:149091630,artifactId:'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0',artifactRevision:'b27f8147d98080b0d6f063ff41de6e381ea9a530',
      sha256:'e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292',licenseLabel:'LFM Open License v1.0',
      licenseUrl:'https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/b27f8147d98080b0d6f063ff41de6e381ea9a530/LICENSE',commercialThresholdUsd:10000000,executionUnavailable:true,errorCode:null,updatedAt:'2026-10-05T12:30:00Z'};
    const makeClient=(value:unknown)=>new IndependentAssistantClient({request:async()=>({ok:true,value})});
    await expect(makeClient(status).request({schemaVersion:1,operation:'localAiBootstrap',payload:{action:'status'}})).resolves.toMatchObject({ok:true,value:{executionUnavailable:true,state:'downloading'}});
    await expect(makeClient({...status,state:'verifying',downloadedBytes:0,verifiedBytes:149081056}).request({schemaVersion:1,operation:'localAiBootstrap',payload:{action:'status'}})).resolves.toMatchObject({ok:true,value:{downloadedBytes:0,verifiedBytes:149081056}});
    await expect(makeClient({...status,sha256:'0'.repeat(64)}).request({schemaVersion:1,operation:'localAiBootstrap',payload:{action:'status'}})).resolves.toMatchObject({ok:false,error:{code:'invalid_response'}});
    await expect(makeClient({...status,updatedAt:'not-a-timestamp'}).request({schemaVersion:1,operation:'localAiBootstrap',payload:{action:'status'}})).resolves.toMatchObject({ok:false,error:{code:'invalid_response'}});
    await expect(makeClient({...status,state:'complete',downloadedBytes:149091630,verifiedBytes:149091629}).request({schemaVersion:1,operation:'localAiBootstrap',payload:{action:'status'}})).resolves.toMatchObject({ok:false,error:{code:'invalid_response'}});
  });
  it('shows one truthful bootstrap state after transient status errors and retries',()=>{
    const labels={loading:'Checking status',unavailable:'Status unavailable',states:{downloading:'Downloading',failed:'Download failed'}};
    expect(localAiBootstrapPanelLabel(null,true,'',labels)).toBe('Checking status');
    expect(localAiBootstrapPanelLabel(null,false,'request failed',labels)).toBe('Status unavailable');
    expect(localAiBootstrapPanelLabel(null,true,'',labels)).toBe('Checking status');
    expect(localAiBootstrapPanelLabel('downloading',false,'',labels)).toBe('Downloading');
    expect(localAiBootstrapPanelLabel('failed',false,'',labels)).toBe('Download failed');
  });
  it('retries one retryable initial status error and returns the decoded backend status',async()=>{
    const status={schemaVersion:1,installKey:'router-lfm2.5-230m-qad-q4_0-v1',revision:1,state:'downloading',jobId:'9cc9ed75-7731-4da4-88f1-af453a3dfdc3',attempt:1,
      downloadedBytes:0,verifiedBytes:149081056,totalBytes:149091630,artifactId:'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0',artifactRevision:'b27f8147d98080b0d6f063ff41de6e381ea9a530',
      sha256:'e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292',licenseLabel:'LFM Open License v1.0',
      licenseUrl:'https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/b27f8147d98080b0d6f063ff41de6e381ea9a530/LICENSE',commercialThresholdUsd:10000000,executionUnavailable:true,errorCode:null,updatedAt:time};
    let calls=0;
    const client=new IndependentAssistantClient({request:async()=>++calls===1?({ok:false,error:{schemaVersion:1,code:'temporarily_unavailable',message:'try again',retryable:true}}):({ok:true,value:status})});
    const answer=await retryRetryableOnce(()=>client.request({schemaVersion:1,operation:'localAiBootstrap',payload:{action:'status'}}),async()=>{});
    expect(calls).toBe(2);
    expect(answer).toMatchObject({ok:true,value:{state:'downloading',verifiedBytes:149081056}});
  });
});
