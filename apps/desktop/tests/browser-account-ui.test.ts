import { describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { IndependentAssistantClient,normalizedBrowserAccountOrigin } from '../src/renderer/independent-assistant-client.js';
import { browserAccountCopy,browserAccountUseCopy,browserAccountRecoveryCopy } from '../src/renderer/i18n/browser-account-copy.js';
import { independentBrowserConfirmationCopy } from '../src/renderer/i18n/independent-browser-copy.js';
import { readBrowserAccountRecovery,readBrowserAccountPendingStart } from '../src/renderer/components/BrowserAccountSetup.js';
import { assistantScopeKey } from '../src/renderer/independent-contracts.js';
const scope={backendProfileId:randomUUID(),spaceId:randomUUID(),browserProfileId:'browser-a'},flowId=randomUUID(),at='2026-10-04T00:00:00Z';
const flow={schemaVersion:1,scope,flowId,connectionId:'browser_account:'+flowId,origin:'https://accounts.controlled.invalid',revision:2,setupStatus:'awaiting_user',
  permissionRevision:1,permissionEpoch:0,createdAt:at,updatedAt:at,expiresAt:at,partitionKind:'dedicated_agent',accountSource:'explicit_agent_login',
  authenticationStatus:'unknown',healthStatus:'unknown',evidenceKind:'owned_login_target'};
const client=(value:unknown)=>new IndependentAssistantClient({request:async()=>({ok:true,value})});
describe('human browser account boundaries',()=>{
  it('accepts an owned login target and requires exact scope/flow/origin identity without private Main proofs',async()=>{
    const request={schemaVersion:1 as const,operation:'browserConnection' as const,scope,payload:{action:'poll' as const,flowId}};
    expect((await client(flow).request(request)).ok).toBe(true);
    for(const invalid of [{...flow,scope:{...scope,spaceId:randomUUID()}},{...flow,flowId:randomUUID()},
      {...flow,partitionKind:'user_browser'},{...flow,leaseId:randomUUID()},{...flow,mainProof:{}},
      {...flow,origin:flow.origin+'/login'},{...flow,authenticationStatus:'connected'},{...flow,setupStatus:'user_confirmed'},
      {...flow,connectionId:'provider:controlled'}])expect((await client(invalid).request(request)).ok).toBe(false);
    expect((await client(flow).request({schemaVersion:1,operation:'browserConnection',scope,payload:{action:'start',origin:'https://foreign.invalid',clientRequestId:randomUUID()}})).ok).toBe(false);
  });
  it('accepts only explicitly human-confirmed authentication evidence and the actual configured account catalog',async()=>{
    const confirmed={...flow,revision:3,setupStatus:'user_confirmed',authenticationStatus:'user_confirmed',evidenceKind:'explicit_user_confirmation'};
    expect((await client(confirmed).request({schemaVersion:1,operation:'browserConnection',scope,payload:{action:'confirm',flowId,expectedRevision:2,clientRequestId:randomUUID()}})).ok).toBe(true);
    const connection={connectionId:confirmed.connectionId,origin:flow.origin,revision:3,status:'configured',configurationStatus:'configured',authenticationStatus:'user_confirmed',healthStatus:'unknown',installed:true,adapterAvailable:true,setupActions:[],partitionKind:'dedicated_agent',accountSource:'explicit_agent_login'};
    const catalog={schemaVersion:1,scope,observedAt:at,entries:[{capabilityId:'browser.account',connectionKind:'browser_account',supportedTasks:['browser.account.use'],status:'configured',evidenceKind:'explicit_user_confirmation',connections:[connection]}]};
    expect((await client(catalog).request({schemaVersion:1,operation:'capabilities',scope,payload:{}})).ok).toBe(true);
    expect((await client({...catalog,entries:[{...catalog.entries[0],connections:[{...connection,accountSource:'copied_user_login'}]}]}).request({schemaVersion:1,operation:'capabilities',scope,payload:{}})).ok).toBe(false);
  });
  it('normalizes only exact human-entered origins and recovers only a non-authoritative ID under its own Scope key',()=>{
    expect(normalizedBrowserAccountOrigin('https://accounts.controlled.invalid:443/')).toBe(flow.origin);
    for(const bad of ['https://user:pass@accounts.controlled.invalid','https://accounts.controlled.invalid/login','https://accounts.controlled.invalid?grant=1','file:///C:/private'])expect(normalizedBrowserAccountOrigin(bad)).toBeNull();
    const storage={getItem:(key:string)=>key==='lastbrowser.browserAccountFlow:'+assistantScopeKey(scope)?flowId:null};
    expect(readBrowserAccountRecovery(scope,storage)).toBe(flowId);expect(readBrowserAccountRecovery({...scope,spaceId:randomUUID()},storage)).toBeNull();
    expect(readBrowserAccountRecovery(scope,{getItem:()=>'{"cookie":"forged"}'})).toBeNull();
  });
  it('explains setup, confirmation, independent permission and whole-Space sign-out in all eight locales',()=>{
    for(const locale of ['en','de','es','fr','it','pt-BR','ru','ja'] as const){
      expect(Object.values(browserAccountCopy(locale)).every(value=>typeof value==='string'&&value.length>0)).toBe(true);
      expect(browserAccountUseCopy[locale]).toBeTruthy();expect(independentBrowserConfirmationCopy[locale]).toBeTruthy();
      expect(browserAccountRecoveryCopy[locale].unknown).toBeTruthy();expect(browserAccountRecoveryCopy[locale].retry).toBeTruthy();
    }
  });
  it('recovers only the exact non-authoritative pending human start under its own Scope and rejects malformed metadata',()=>{
    const saved={schemaVersion:1,origin:flow.origin,clientRequestId:randomUUID()};
    const storage={getItem:(key:string)=>key==='lastbrowser.browserAccountStart:'+assistantScopeKey(scope)?JSON.stringify(saved):null};
    expect(readBrowserAccountPendingStart(scope,storage)).toEqual(saved);
    expect(readBrowserAccountPendingStart({...scope,spaceId:randomUUID()},storage)).toBeNull();
    for(const bad of [{...saved,origin:flow.origin+'/login'},{...saved,clientRequestId:'forged'},
      {...saved,scope},{...saved,permission:true},{...saved,leaseId:randomUUID()},null,'forged'])
      expect(readBrowserAccountPendingStart(scope,{getItem:()=>JSON.stringify(bad)})).toBeNull();
  });
});
