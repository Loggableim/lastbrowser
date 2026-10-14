import {describe,it,expect} from 'vitest';
import {providerDeployment,providerHostingLabel,providerPresentation} from '../src/renderer/provider-presentation.js';
import {isLocalStoreRuntimeCapability} from '../src/renderer/independent-assistant-client.js';
import {mapScopedModelPickerOptions,isLocalStoreModelQualified,canSelectNativeModel} from '../src/renderer/model-picker-options.js';
import {parseProviderModelId,qualifyModelForProvider,resolveLiteralCatalogModelSelection} from '../src/renderer/provider-model-selection.js';
import type {ScopedModelSelection,LocalStoreRuntimeCapability} from '../src/renderer/independent-contracts.js';

const scope={browserProfileId:'browser',backendProfileId:'profile',spaceId:'space'};
const runtime:LocalStoreRuntimeCapability={state:'ready',artifactId:'publisher/model',artifactRevision:'revision',bundleDigest:'a'.repeat(64),backend:'cpu',
  runtimeBuild:'build',runtimeDigest:'b'.repeat(64),evidenceRef:'receipt',toolCallingQualified:true,contextTokens:4096,maxOutputTokens:768,parallelRequests:1};
function selection(localRuntime:LocalStoreRuntimeCapability=runtime,available=true):ScopedModelSelection {
  return {schemaVersion:1,scope,revision:7,provider:'local-store',model:'publisher/model',configured:true,supportsIndependent:true,
    groups:[{provider_id:'local-store',provider:'LastBrowser Local AI',configured:true,deploymentKind:'local',models:[{
      id:'publisher/model',label:'Model',supportsIndependent:true,deploymentKind:'local',contextLength:4096,contextLengthSource:'local_catalog',modelSource:'local_catalog',localRuntime,
      nativeAvailability:{schemaVersion:1,provider:'local-store',model:'publisher/model',scope,selectionRevision:7,supported:available,available,reasonCode:available?null:'adapter_unsupported'}}]}]};
}
describe('managed local Store in normal picker',()=>{
  it('labels Store as on-device without Ollama or cloud authentication',()=>{
    expect(providerDeployment('local-store')).toBe('local');
    expect(providerHostingLabel('local-store','wrong cloud')).toContain('Local AI');
    expect(providerPresentation('local-store').category).toBe('local');
    expect(providerPresentation('local-store').keyHint).toContain('No API key');
  });
  it('preserves exact runtime metadata and actual4k context',()=>{
    const group=mapScopedModelPickerOptions(selection())[0],entry=group.models[0];
    expect(group.deployment).toBe('local');expect(entry.contextLength).toBe(4096);
    expect(entry.localRuntime).toEqual(runtime);expect(isLocalStoreModelQualified(group.providerId,entry)).toBe(true);
  });
  it('deviceproof never bypasses pending native SDK adapter gate',()=>{
    const entry=mapScopedModelPickerOptions(selection(runtime,false))[0].models[0];
    expect(isLocalStoreModelQualified('local-store',entry)).toBe(false);
    expect(canSelectNativeModel('local-store',entry.nativeAvailability)).toBe(false);
  });
  it('unavailable installed models remain visible but disabled with explanation',()=>{
    const entry=mapScopedModelPickerOptions(selection({state:'unavailable',reasonCode:'successful_device_benchmark_required'}))[0].models[0];
    expect(entry.supportsIndependent).toBe(false);expect(entry.label).toContain('Gerätetest fehlt');
    expect(isLocalStoreModelQualified('local-store',entry)).toBe(false);
  });
  it('unknown backend reasons do not turn into readiness',()=>{
    const entry=mapScopedModelPickerOptions(selection({state:'unavailable',reasonCode:'new_future_reason'}))[0].models[0];
    expect(entry.label).toContain('noch nicht bestätigt');expect(entry.supportsIndependent).toBe(false);
  });
  it.each([{toolCallingQualified:false},{artifactId:'other/model'},{contextTokens:8192}])('rejects incomplete or mismatched deviceproof %j',patch=>{
    const entry=mapScopedModelPickerOptions(selection({...runtime,...patch}))[0].models[0];
    expect(isLocalStoreModelQualified('local-store',entry)).toBe(false);expect(entry.supportsIndependent).toBe(false);
  });
  it('retains existing scope and revision binding gate',()=>{
    const data=selection();const entry=data.groups![0].models[0];
    const altered={...data,groups:[{...data.groups![0],models:[{...entry,nativeAvailability:{...entry.nativeAvailability!,scope:{...scope,spaceId:'other'}}}]}]};
    expect(isLocalStoreModelQualified('local-store',mapScopedModelPickerOptions(altered)[0].models[0])).toBe(false);
  });
  it('validates runtime fields rather than trusting arbitrary catalog metadata',()=>{
    expect(isLocalStoreRuntimeCapability(runtime)).toBe(true);
    expect(isLocalStoreRuntimeCapability({...runtime,runtimeDigest:'invalid'})).toBe(false);
    expect(isLocalStoreRuntimeCapability({...runtime,maxOutputTokens:4096})).toBe(false);
    expect(isLocalStoreRuntimeCapability({state:'ready'})).toBe(false);
  });
  it('keeps raw Store model identity in persistence and picker spelling',()=>{
    const groups=mapScopedModelPickerOptions(selection());
    const qualified=qualifyModelForProvider('publisher/model','local-store');
    expect(parseProviderModelId(qualified)).toEqual({provider:'local-store',model:'publisher/model'});
    expect(resolveLiteralCatalogModelSelection(qualified,groups)).toEqual({provider:'local-store',model:'publisher/model'});
  });
});
