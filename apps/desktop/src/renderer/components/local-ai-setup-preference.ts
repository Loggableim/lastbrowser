import { assistantScopeKey,type IndependentScope } from '../independent-contracts.js';
import type { LocalAiPreset } from '../local-ai-contracts.js';

export type LocalAiSetupMode='simple'|'advanced';
export type LocalAiSetupScopeEpoch=Readonly<{key:string;epoch:number}>;
export function advanceLocalAiSetupScopeEpoch(current:LocalAiSetupScopeEpoch,key:string):LocalAiSetupScopeEpoch{
  return current.key===key?current:{key,epoch:current.epoch+1};
}
export function localAiSetupRequestOwner(scope:LocalAiSetupScopeEpoch):string{return `${scope.epoch}:${scope.key}`;}
export function resolveSimpleRecommendationPreset(automatic:LocalAiPreset|null):LocalAiPreset{return automatic??'balanced';}
export function simpleLocalAiActionsAvailable(mode:LocalAiSetupMode,recommendationState:string|null,selectionValid:boolean,hasPreferences:boolean):boolean{
  return mode==='advanced'||recommendationState==='proposed'&&selectionValid&&hasPreferences;
}
export function isLocalAiSetupRequestCurrent(captured:string,current:string,mounted:boolean):boolean{return mounted&&captured===current;}
export const localAiSetupModeKey=(scope:IndependentScope):string=>`lastbrowser.localAiSetup.mode.v1:${assistantScopeKey(scope)}`;

export function readLocalAiSetupMode(scope:IndependentScope,storage:Pick<Storage,'getItem'>):LocalAiSetupMode{
  try{return storage.getItem(localAiSetupModeKey(scope))==='advanced'?'advanced':'simple';}catch{return 'simple';}
}

export function writeLocalAiSetupMode(scope:IndependentScope,mode:LocalAiSetupMode,storage:Pick<Storage,'setItem'>):boolean{
  try{storage.setItem(localAiSetupModeKey(scope),mode);return true;}catch{return false;}
}

export function withLocalAiScanTimeout<T>(request:Promise<T>,timeoutMs:number):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('local_ai_hardware_scan_timeout')),timeoutMs);
    request.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
}
