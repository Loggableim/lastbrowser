import { useEffect,useRef,useState } from 'react';
import { IndependentAssistantClient,isIndependentRecord } from './independent-assistant-client.js';
import { sameAssistantScope,type IndependentScope } from './independent-contracts.js';
import { createChildRunState,recoverChildRun,reduceChildRunEvent,type ChildRunState } from './child-run-controller.js';
import { isChildRunEvent,readChildHistory } from './child-run-client.js';

export function useChildRunHistory(sessionId:string|null,workspacePath:string,browserProfileId:string,ready:boolean,backendProfileName?:string) {
  const viewKey=JSON.stringify([sessionId,workspacePath,browserProfileId,backendProfileName]);
  const [view,setView]=useState<{key:string;groups:readonly ChildRunState[];parentTurns:readonly string[];unavailable:boolean;resyncNeeded:boolean}|null>(null);
  const refresh=useRef<(turnId?:string)=>Promise<void>>(async()=>{});
  useEffect(()=>{
    setView(null);
    if(!ready||!sessionId||typeof window.lastbrowser.sidekick.childHistory!=='function')return;
    let current=true,pending=false,scope:IndependentScope|null=null;
    let groups:Record<string,ChildRunState>={},parentTurns:readonly string[]=[];
    const publish=(unavailable=false,resyncNeeded=false)=>{if(current)setView({key:viewKey,groups:parentTurns.map(turn=>groups[turn]).filter(Boolean),parentTurns,unavailable,resyncNeeded});};
    const client=new IndependentAssistantClient(window.lastbrowser.independent);
    const recover=async(parentTurnId?:string)=>{
      if(!current||pending)return;pending=true;
      try{
        if(!scope){const result=await client.request({schemaVersion:1,operation:'resolveScope',payload:{workspacePath:workspacePath||null,browserProfileId},backendProfileName});
          if(!result.ok)throw Error('child_scope_unavailable');scope=result.value.scope;}
        const afterSequence=Object.fromEntries(Object.values(groups).flatMap(group=>Object.values(group.children).map(entry=>[entry.snapshot.subagentId,entry.snapshot.watermark])));
        const body=await window.lastbrowser.sidekick.childHistory({sessionId,workspacePath,browserProfileId,...(parentTurnId?{parentTurnId}:{}),afterSequence});
        if(!current)return;
        const history=readChildHistory(body,scope,sessionId);parentTurns=history.parentTurns;
        for(const snapshot of history.runs){const old=groups[snapshot.parentTurnId]??createChildRunState({scope,parentSessionId:sessionId,parentTurnId:snapshot.parentTurnId});
          groups={...groups,[snapshot.parentTurnId]:recoverChildRun(old,snapshot)};}
        for(const event of history.events){const old=groups[event.parentTurnId]??createChildRunState({scope,parentSessionId:sessionId,parentTurnId:event.parentTurnId});
          groups={...groups,[event.parentTurnId]:reduceChildRunEvent(old,event)};}
        publish(false,history.resyncNeeded);
      }catch{publish(true);}finally{pending=false;}
    };
    refresh.current=recover;
    const off=window.lastbrowser.sidekick.onChatStreamEvent(payload=>{
      if(!current||!scope||!isIndependentRecord(payload)||payload.event!=='subagent_event'||!isIndependentRecord(payload.data)
        ||!isChildRunEvent(payload.data.childEvent))return;
      const event=payload.data.childEvent;
      if(payload.streamId!==event.parentTurnId||event.parentSessionId!==sessionId||!sameAssistantScope(event.scope,scope))return;
      if(!parentTurns.includes(event.parentTurnId)){void recover();return;}
      const old=groups[event.parentTurnId]??createChildRunState({scope,parentSessionId:sessionId,parentTurnId:event.parentTurnId});
      groups={...groups,[event.parentTurnId]:reduceChildRunEvent(old,event)};publish();
      if(Object.values(groups[event.parentTurnId].children).some(entry=>entry.requiresResync)||Object.keys(groups[event.parentTurnId].missing).length)void recover(event.parentTurnId);
    });
    void recover();const timer=window.setInterval(()=>{void recover();},2000);
    return()=>{current=false;off();window.clearInterval(timer);refresh.current=async()=>{};};
  },[viewKey,ready]);
  return {groups:view?.key===viewKey?view.groups:[],unavailable:view?.key===viewKey&&view.unavailable,
    parentTurns:view?.key===viewKey?view.parentTurns:[],
    resyncNeeded:view?.key===viewKey&&view.resyncNeeded,onResync:(turnId:string)=>{void refresh.current(turnId);}};
}
