import React,{useRef,useState} from 'react';
import { useDesktopI18n } from '../i18n.js';
import { sameAssistantScope,type IndependentScope } from '../independent-contracts.js';
import { requestNativeChatControl,useNativeChatControls,type NativeChatPending } from '../native-chat-control.js';
import { nativeChatControlCopy } from '../i18n/native-chat-control-copy.js';
export function NativeChatPendingControls({scope,sessionId,browserProfileId,workspacePath}:Readonly<{scope:IndependentScope;sessionId:string;browserProfileId:string;workspacePath:string}>):React.JSX.Element{
  const {locale}=useDesktopI18n(),copy=nativeChatControlCopy(locale);
  const records=useNativeChatControls(state=>state.records),[answers,setAnswers]=useState<Record<string,string>>({}),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState('');
  const lock=useRef(false),mounted=useRef(true);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function respond(streamId:string,pending:NativeChatPending,choice?:'once'|'session'|'always'|'deny',response?:string){
    if(lock.current)return;lock.current=true;setBusy(pending.requestId);setError('');
    try{const ack=await requestNativeChatControl(window.lastbrowser.sidekick.controlChat,{sessionId,streamId,workspacePath,browserProfileId,command:pending.kind,
        requestId:pending.requestId,...(choice?{choice}:{}),...(response!==undefined?{response}:{})},scope);
      if(!mounted.current)return;if(ack.accepted){useNativeChatControls.getState().remove(streamId,pending.requestId);setAnswers(values=>{const next={...values};delete next[pending.requestId];return next;});}
      else setError(copy.unavailable);
    }catch{if(mounted.current)setError(copy.unavailable);}finally{lock.current=false;if(mounted.current)setBusy(null);}
  }
  return <section className="native-pending-controls">{error&&<p role="alert">{error}</p>}
    {Object.values(records).filter(row=>row.binding.sessionId===sessionId&&row.binding.browserProfileId===browserProfileId&&row.binding.workspacePath===workspacePath&&sameAssistantScope(row.binding.scope,scope)).flatMap(row=>row.pending.map(pending=>
      <article className="approval-card" key={`${row.binding.streamId}:${pending.requestId}`} data-native-request-id={pending.requestId}>
        <strong>{copy[pending.kind]}</strong>{pending.description&&<p>{pending.description}</p>}{pending.command&&<pre>{pending.command}</pre>}{pending.question&&<p>{pending.question}</p>}
        {pending.kind==='approval'?<div className="approval-card-actions">{(['once','session','always','deny'] as const).map(choice=><button key={choice} type="button" disabled={busy!==null} onClick={()=>{void respond(row.binding.streamId,pending,choice);}}>{copy[choice]}</button>)}</div>:
          <form onSubmit={event=>{event.preventDefault();const response=answers[pending.requestId]?.trim();if(response)void respond(row.binding.streamId,pending,undefined,response);}}>
            {pending.choices?.map(choice=><button key={choice} type="button" disabled={busy!==null} onClick={()=>setAnswers(values=>({...values,[pending.requestId]:choice}))}>{choice}</button>)}
            <label className="space-assistant-field"><span>{copy.answer}</span><textarea maxLength={16384} value={answers[pending.requestId]??''} disabled={busy!==null} onChange={event=>setAnswers(values=>({...values,[pending.requestId]:event.target.value}))}/></label>
            <button type="submit" disabled={busy!==null||!answers[pending.requestId]?.trim()}>{copy.send}</button>
          </form>}
      </article>))}</section>;
}
import './native-chat-controls.css';
