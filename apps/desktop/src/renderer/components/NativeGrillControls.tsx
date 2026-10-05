import React,{useEffect,useRef,useState} from 'react';
import { useDesktopI18n } from '../i18n.js';
import { nativeGrillCopy } from '../i18n/native-grill-copy.js';
import type { GrillQuestion,NativeGrillMutation,NativeGrillState } from '../native-grill-client.js';
import './native-chat-controls.css';
export function NativeGrillControls({state,history=[],initialObjective='',busy,loading,error,modeRevision,fallback,onMutation,onAsk,onRefresh}:Readonly<{
  state:NativeGrillState|null;history?:readonly NativeGrillState[];initialObjective?:string;busy:boolean;loading:boolean;error:string;modeRevision:number;
  fallback:boolean;onMutation:(action:NativeGrillMutation)=>Promise<NativeGrillState|null>;onAsk:(message:string)=>boolean|void;onRefresh:()=>void;
}>):React.JSX.Element{
  const {locale,t}=useDesktopI18n(),copy=nativeGrillCopy(locale);
  const [objective,setObjective]=useState(initialObjective),[choice,setChoice]=useState<string|null>(null),[answer,setAnswer]=useState(''),[editing,setEditing]=useState<string|null>(null);
  const [pending,setPending]=useState(false),[askPending,setAskPending]=useState(false),lock=useRef(false),asking=useRef<number|null>(null),mounted=useRef(true),answerInput=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const active=state?.questions.find(question=>question.answer===null),question=state?.questions.find(question=>question.questionId===editing)??active;
  const identity=question?`${question.questionId}:${question.revision}`:null;
  useEffect(()=>{setChoice(question?.answer?.kind==='choice'?question.answer.choiceId:null);setAnswer(question?.answer?.kind==='text'?question.answer.text:'');},[identity]);
  useEffect(()=>{if(asking.current!==null&&(busy||error||state?.revision!==asking.current)){asking.current=null;setAskPending(false);}},[busy,error,state?.revision]);
  const modeChanged=Boolean(state&&state.modeRevision!==modeRevision),disabled=busy||loading||pending||askPending||modeChanged;
  async function act(action:NativeGrillMutation,next=false){
    if(lock.current||busy||loading||pending||modeChanged&&action.action!=='start'&&action.action!=='resume')return;lock.current=true;setPending(true);
    try{const actual=await onMutation(action);if(!mounted.current||!actual)return;
      setEditing(null);setChoice(null);setAnswer('');
      if(next&&actual.status==='asking'&&!actual.questions.some(question=>question.answer===null))onAsk(action.action==='start'?action.objective:copy.nextPrompt);
    }finally{lock.current=false;if(mounted.current)setPending(false);}
  }
  function edit(question:GrillQuestion){setEditing(question.questionId);setChoice(question.answer?.kind==='choice'?question.answer.choiceId:null);setAnswer(question.answer?.kind==='text'?question.answer.text:'');requestAnimationFrame(()=>answerInput.current?.focus());}
  function askNext(){if(disabled||asking.current!==null||!state)return;asking.current=state.revision;setAskPending(true);try{if(onAsk(copy.nextPrompt)===false){asking.current=null;setAskPending(false);}}catch{asking.current=null;setAskPending(false);}}
  return <section className="space-assistant-card native-grill-controls" aria-label={copy.title}>
    <h3>{copy.title}</h3><p>{copy.noGrant}</p>{error&&<p role="alert">{error}</p>}
    <button type="button" disabled={busy||pending} onClick={onRefresh}>{t('common.refresh')}</button>
    {modeChanged&&<><p role="status">{copy.modeChanged}</p>{state?.status!=='finished'&&<button type="button" disabled={busy||loading||pending} onClick={()=>{if(!lock.current){lock.current=true;setPending(true);void onMutation({action:'resume'}).finally(()=>{lock.current=false;if(mounted.current)setPending(false);});}}}>{copy.resume}</button>}</>}{fallback&&<p role="status">{copy.manual}</p>}
    {(busy||askPending)&&<p role="status">{copy.questionPending}</p>}
    {(!state||state.status==='finished')&&<form onSubmit={event=>{event.preventDefault();if(objective.trim())void act({action:'start',objective:objective.trim()},true);}}>
      <label className="space-assistant-field"><span>{copy.objective}</span><textarea value={objective} maxLength={8192} disabled={busy||loading||pending} onChange={event=>setObjective(event.target.value)} dir="auto"/></label>
      <button type="submit" disabled={busy||loading||pending||!objective.trim()}>{copy.start}</button>
    </form>}{state&&<>
      <p dir="auto">{state.objective}</p>
      {state.status==='finished'?<p role="status">{copy.finished}</p>:<>
        {question&&(state.status==='asking'||editing)?<form onSubmit={event=>{event.preventDefault();if(!choice&&!answer.trim())return;
          void act({action:'answer',questionId:question.questionId,questionRevision:question.revision,...(choice?{choiceId:choice}:{text:answer.trim()})},!editing);}} data-grill-question={question.questionId}>
          <fieldset disabled={disabled}><legend dir="auto">{question.prompt}</legend><div className="space-interview-options">
            {question.options.map(option=><label className={`space-interview-option ${choice===option.id?'selected':''}`} key={option.id}>
              <input type="radio" name={`grill-${question.questionId}`} checked={choice===option.id} onChange={()=>{setChoice(option.id);setAnswer('');}}/><span dir="auto">{option.label}</span>
            </label>)}
          </div><label className="space-assistant-field"><span>{copy.answer}</span><textarea ref={answerInput} value={answer} maxLength={8192} onChange={event=>{setAnswer(event.target.value);setChoice(null);}} dir="auto"/></label>
          <button type="submit" disabled={!choice&&!answer.trim()}>{editing?t('spaceAssistant.sendAnswer'):copy.send}</button>
          {!editing&&<button type="button" onClick={()=>{void act({action:'skip',questionId:question.questionId,questionRevision:question.revision},true);}}>{copy.skip}</button>}
          {editing&&<button type="button" onClick={()=>setEditing(null)}>{copy.back}</button>}</fieldset>
        </form>:state.status==='asking'&&<button type="button" disabled={disabled} onClick={askNext}>{copy.next}</button>}
        <div className="space-assistant-controls">{state.status==='asking'&&<button type="button" disabled={disabled} onClick={()=>{void act({action:'review'});}}>{copy.review}</button>}
          {state.status==='review'&&<button type="button" disabled={disabled} onClick={()=>{void act({action:'resume'});}}>{copy.resume}</button>}
          {state.canFinish&&<button type="button" disabled={disabled} onClick={()=>{void act({action:'finish'});}}>{copy.finish}</button>}
        </div>
      </>}
      {!!state.coverage.length&&<section aria-label={copy.coverage}><strong>{copy.coverage}</strong>{state.coverage.map(topic=><p key={topic.topicId} dir="auto">{topic.label}: {copy[topic.status]}</p>)}</section>}
      {!!state.summary.length&&<details open={state.status==='review'}><summary>{copy.history}</summary>{state.summary.map(summary=>{
        const actual=state.questions.find(question=>question.questionId===summary.questionId);return <article className="space-interview-answer" key={summary.questionId}><p dir="auto"><strong>{summary.prompt}</strong></p>
          <p dir="auto">{summary.answer??copy[summary.status==='skipped'?'skipped':'unresolved']}</p>
          {state.status!=='finished'&&actual&&actual.answer&&<button type="button" disabled={disabled} onClick={()=>edit(actual)}>{copy.correct}</button>}
        </article>;})}</details>}
    </>}
    {!!history.length&&<details className="native-grill-history"><summary>{copy.history}</summary>{history.map(item=><article className="space-interview-answer" key={item.revision}>
      <strong dir="auto">{item.objective}</strong>{item.summary.map(row=><div key={row.questionId}><p dir="auto">{row.prompt}</p><p dir="auto">{row.answer??copy[row.status==='skipped'?'skipped':'unresolved']}</p></div>)}
    </article>)}</details>}
  </section>;
}
