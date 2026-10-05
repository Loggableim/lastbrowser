import React,{useEffect,useState} from 'react';
import { useDesktopI18n } from '../i18n.js';
import { canExecuteAutomaticPolicy,isModelPolicyBudget,modelPairKey,type ActualDecisionRecord,type ActualModelPair,type ModelPolicyDraft,type ModelPolicyResponse } from '../model-policy-client.js';
import { modelPolicyCopy,modelPolicyReason } from '../i18n/model-policy-copy.js';
import '../panels/chat-command-controls.css';
export type ModelPolicyCandidate=Readonly<{pair:ActualModelPair;label:string;providerLabel:string;available:boolean}>;
export function ModelPolicyControls({value,candidates,pending,error,open,onOpen,onSave,onRefresh,locale:propLocale,observedDecision}:Readonly<{
  value:ModelPolicyResponse;candidates:readonly ModelPolicyCandidate[];pending:boolean;error:string;open:boolean;onOpen:(open:boolean)=>void;
  onSave:(draft:ModelPolicyDraft)=>void;onRefresh:()=>void;locale?:import('../i18n/keys.js').DesktopLocaleId;
  observedDecision?:ActualDecisionRecord|null;
}>):React.JSX.Element {
  let contextLocale: import('../i18n/keys.js').DesktopLocaleId = 'en';
  try {
    contextLocale = useDesktopI18n().locale;
  } catch {}
  const locale = propLocale ?? contextLocale, copy = modelPolicyCopy(locale);
  const [mode,setMode]=useState(value.policy.mode),[models,setModels]=useState<readonly ActualModelPair[]>(value.policy.allowedModels);
  const [orchestrator,setOrchestrator]=useState<ActualModelPair|null>(value.policy.orchestrator);
  const [cloud,setCloud]=useState(value.policy.cloudPolicy),[data,setData]=useState(value.policy.allowedCloudDataClasses);
  const [budget,setBudget]=useState(value.policy.budget);
  useEffect(()=>{const policy=value.policy;setMode(policy.mode);setModels(policy.allowedModels);setOrchestrator(policy.orchestrator);
    setCloud(policy.cloudPolicy);setData(policy.allowedCloudDataClasses);setBudget(policy.budget);},[value.policy.revision,value.sessionId]);
  const allCandidates=[...candidates,...models.filter(pair=>!candidates.some(candidate=>modelPairKey(candidate.pair)===modelPairKey(pair)))
    .map(pair=>({pair,label:pair.model,providerLabel:pair.provider,available:false}))];
  const enabled=canExecuteAutomaticPolicy(value),valid=isModelPolicyBudget(budget)&&(mode!=='auto'||models.length>0);
  const formatter=new Intl.NumberFormat(locale),time=(at:string)=>new Date(at).toLocaleString(locale);
  return <details className="persistent-goal-controls model-policy-controls" open={open} onToggle={event=>onOpen(event.currentTarget.open)}>
    <summary>{copy.title} · {copy[value.policy.mode==='auto'?'automatic':'fixed']}</summary>
    <p role="status">{copy[enabled?'available':'unavailable']}{!enabled&&` · ${modelPolicyReason(locale,value.executionAvailability.reasonCode)}`}</p>
    <p className="space-assistant-note">{copy.privacy}</p>
    {value.policy.mode==='auto'&&<div className="model-policy-decision" role="status" aria-label={copy.actualDecision}>
      <p><strong>{copy.actualDecision}</strong>: {observedDecision ? `${observedDecision.provider} · ${observedDecision.model}${observedDecision.isHistorical ? ` (${copy.lastCompletedTurn})` : ''}` : copy.decisionUnknown}</p>
      <p><strong>{copy.configuredPreference}</strong>: {value.policy.orchestrator
        ? `${value.policy.orchestrator.provider} · ${value.policy.orchestrator.model} (${copy.decisionOrchestrator})`
        : value.policy.allowedModels.length>0
          ? `${value.policy.allowedModels[0].provider} · ${value.policy.allowedModels[0].model} (${copy.decisionAllowed})`
          : copy.unknown}</p>
    </div>}
    {error&&<p role="alert">{modelPolicyReason(locale,error)}</p>}
    <form onSubmit={event=>{event.preventDefault();if(valid&&!pending)onSave({mode,allowedModels:models,orchestrator,cloudPolicy:cloud,allowedCloudDataClasses:cloud==='allow'?data:[],budget});}}>
      <fieldset disabled={pending}>
        <label className="space-assistant-field"><span>{copy.mode}</span><select value={mode} onChange={event=>setMode(event.target.value==='auto'?'auto':'fixed')}><option value="fixed">{copy.fixed}</option><option value="auto">{copy.automatic}</option></select></label>
        <fieldset className="model-policy-models"><legend>{copy.models}</legend>
          {allCandidates.map(candidate=>{const selected=models.some(pair=>modelPairKey(pair)===modelPairKey(candidate.pair));return <label key={modelPairKey(candidate.pair)}>
            <input type="checkbox" checked={selected} disabled={!selected&&!candidate.available} onChange={()=>{
              if(selected){setModels(models.filter(pair=>modelPairKey(pair)!==modelPairKey(candidate.pair)));if(orchestrator&&modelPairKey(orchestrator)===modelPairKey(candidate.pair))setOrchestrator(null);}
              else if(candidate.available)setModels([...models,candidate.pair]);}}/>
            <span>{candidate.label} · {candidate.providerLabel}{!candidate.available&&` · ${copy.unknown}`}</span></label>;})}
          {mode==='auto'&&!models.length&&<p role="status">{copy.choose}</p>}
        </fieldset>
        <label className="space-assistant-field"><span>{copy.orchestrator}</span><select value={orchestrator?modelPairKey(orchestrator):''}
          onChange={event=>setOrchestrator(models.find(pair=>modelPairKey(pair)===event.target.value)??null)}><option value="">{copy.none}</option>{models.map(pair=><option key={modelPairKey(pair)} value={modelPairKey(pair)}>{pair.provider} · {pair.model}</option>)}</select></label>
        <label className="space-assistant-field"><span>{copy.cloud}</span><select value={cloud} onChange={event=>{const next=event.target.value==='allow'?'allow':'deny';setCloud(next);if(next==='deny')setData([]);}}><option value="deny">{copy.deny}</option><option value="allow">{copy.allow}</option></select></label>
        {cloud==='allow'&&<fieldset className="model-policy-models"><legend>{copy.data}</legend>{(['public','private','workspace','browsing'] as const).map(kind=><label key={kind}>
          <input type="checkbox" checked={data.includes(kind)} onChange={()=>setData(data.includes(kind)?data.filter(item=>item!==kind):[...data,kind])}/><span>{copy[kind]}</span></label>)}</fieldset>}
        <div className="model-policy-budget">{([['requestsPerMinute','rpm',1000],['tokensPerMinute','tpm',10000000],['maxConcurrent','concurrent',6],['maxOutputTokens','output',100000]] as const).map(([key,label,max])=><label key={key}>
          <span>{copy[label]}</span><input type="number" min={1} max={max} step={1} value={Number.isFinite(budget[key])?budget[key]:''} onChange={event=>setBudget({...budget,[key]:event.target.value===''?NaN:Number(event.target.value)})}/></label>)}
          <label><span>{copy.cost}</span><input type="number" min={0} max={1000} step="0.000001" value={budget.maxCostMicrousdPerMinute===null?'':budget.maxCostMicrousdPerMinute/1000000}
            onChange={event=>setBudget({...budget,maxCostMicrousdPerMinute:event.target.value===''?null:Math.round(Number(event.target.value)*1000000)})}/></label>
        </div>
        <button type="submit" disabled={!valid}>{copy.save}</button>
      </fieldset>
    </form>
    <button type="button" disabled={pending} onClick={onRefresh}>{copy.refresh}</button>
    {value.status.map(row=><section className="model-policy-limits" key={row.provider} aria-label={row.provider}>
      <strong>{row.provider}</strong>{!row.snapshots.length&&<p>{copy.unknown}</p>}
      {row.snapshots.map((snapshot,index)=><div key={`${snapshot.groupKey}:${snapshot.observedAt}:${index}`}>
        <p>{snapshot.provider!==row.provider&&`${snapshot.provider} · `}{snapshot.stale?`${copy.stale} · `:''}{copy.observed}: <time dateTime={snapshot.observedAt}>{time(snapshot.observedAt)}</time></p>
        {snapshot.actionRequired&&<p role="status">{copy.actionRequired}</p>}
        {!snapshot.buckets.length&&<p>{copy.unknown}</p>}
        {snapshot.buckets.map((bucket,index)=><p key={`${bucket.resource}:${index}`}>{copy[bucket.resource]} · {copy.remaining}: {bucket.remaining===null?copy.unknown:formatter.format(bucket.remaining)} · {copy.limit}: {bucket.limit===null?copy.unknown:formatter.format(bucket.limit)}{bucket.resetAt&&` · ${copy.reset}: ${time(bucket.resetAt)}`}</p>)}
      </div>)}
    </section>)}
  </details>;
}
