import React,{useEffect,useId,useRef,useState} from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, Cpu, Database, HardDrive, Loader2, Monitor, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { filterStoreModels, formatStoreBytes, storeEmptyState, storeModelStatus, storeNextAction, summarizeStoreHardware } from './model-store-presentation.js';
import type {IndependentAssistantClient} from '../independent-assistant-client.js';
import {newIndependentRequestId,type IndependentScope} from '../independent-contracts.js';
import type {ModelStoreRequest,StoreView,StoreModel} from '../model-store-contracts.js';
import './local-model-store.css';

const bytes = formatStoreBytes;
const active=(s:string)=>['pending','running','downloading','verifying','stopping'].includes(s);
const reasons:Record<string,string>={hardware_scan_required:'Hardware-Scan erforderlich',hardware_scan_stale:'Hardware-Scan veraltet',
  runtime_compatibility_unknown:'Gebündelte Runtime noch nicht qualifiziert',artifact_qualification_incomplete:'Downloadartefakt noch nicht vollständig qualifiziert',
  cpu_features_unknown:'CPU-Instruktionen noch nicht bestätigt',hardware_measurement_unknown:'Speicherwerte fehlen',
  insufficient_available_ram:'Zu wenig freier RAM einschließlich Systemreserve',insufficient_disk_staging:'Zu wenig freier Speicher für Download und Prüfung',
  model_parameter_count_unknown:'Gesamtparameterzahl noch ungeklärt',model_parameter_count_invalid:'Ungültige Parameterangabe'};
export function LocalModelStore({scope,client,ready}:{scope:IndependentScope;client:IndependentAssistantClient;ready:boolean}):React.JSX.Element{
  const titleId = useId(), searchId = useId(), detailTitleId = useId();
  const detailRef = useRef<HTMLElement>(null), openerRef = useRef<HTMLButtonElement|null>(null);
  const [pendingOperation,setPendingOperation] = useState<string|null>(null);
  const [view,setView]=useState<StoreView|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [showLarge,setShowLarge]=useState(false),[showUnknown,setShowUnknown]=useState(false),[query,setQuery]=useState(''),[publisher,setPublisher]=useState('');
  const [detail,setDetail]=useState<string|null>(null),[consent,setConsent]=useState(''),[mode,setMode]=useState<'quick'|'standard'>('quick');
  const [chatText,setChatText]=useState(''),[chatResult,setChatResult]=useState(''),[chatBusy,setChatBusy]=useState(false),[receipt,setReceipt]=useState<unknown>(null);
  const mounted=useRef(true),generation=useRef(0),inFlight=useRef(false),importInput=useRef<HTMLInputElement>(null);
  const scopeKey=JSON.stringify(scope);
  async function request(data:ModelStoreRequest,quiet=false){
    if(!ready||!mounted.current)return;
    const requestGeneration=generation.current;
    if(!quiet){setBusy(true);setPendingOperation(data.operation);setError('');}
    try{
      const response=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'store',request:data}});
      if(!mounted.current||requestGeneration!==generation.current)return;
      if(!response.ok){if(!quiet)setError(`Lokale KI: ${response.error.code}`);return;}
      if(!('kind'in response.value)||response.value.kind!=='model_store'){if(!quiet)setError('Ungültige Store-Antwort');return;}
      setView(response.value.store);return response.value.storeResult;
    }catch{if(mounted.current&&requestGeneration===generation.current&&!quiet)setError('Lokale KI nicht erreichbar. Es wurde kein Cloud-Ersatz verwendet.');}
    finally{if(mounted.current&&requestGeneration===generation.current&&!quiet){setBusy(false);setPendingOperation(null);}}
  }
  useEffect(()=>{mounted.current=true;generation.current++;setView(null);setDetail(null);setReceipt(null);setChatText('');setChatResult('');setChatBusy(false);setBusy(false);setPendingOperation(null);setError('');void request({operation:'view'});return()=>{mounted.current=false;generation.current++;};},[ready,scopeKey]);
  const running=view?.jobs.some(j=>active(j.state))??false;
  useEffect(()=>{
    if(!running)return;
    const timer=window.setInterval(()=>{if(inFlight.current)return;inFlight.current=true;void request({operation:'view'},true).finally(()=>{inFlight.current=false;});},1500);
    return()=>window.clearInterval(timer);
  },[running,scopeKey]);
  const models=view?.models??[],selected=models.find(m=>m.id===detail),chosen=models.find(m=>m.active);
  const filters = { query, publisher, showLarge, showUnknown };
  const visible = filterStoreModels(models, filters);
  const hardware = summarizeStoreHardware(view?.hardware);
  const emptyState = storeEmptyState(models, filters, view?.hardware);
  const suitableCount = models.filter(model => model.eligibility.state === 'likely_suitable').length;
  const scanPending = pendingOperation === 'scan';
  const hardwareStale = models.some(model => model.eligibility.reasons.includes('hardware_scan_stale'));
  useEffect(() => { if (detail) detailRef.current?.focus(); }, [detail]);
  function closeDetails() { setDetail(null); openerRef.current?.focus(); }
  function showAllModels() { setQuery('');setPublisher('');setShowUnknown(true);setShowLarge(true); }
  async function downloadExport(id:string){
    const result=await request({operation:'export',receiptId:id});if(!result)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`lastbrowser-benchmark-${id}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function importFile(file:File){
    if(file.size>4*1024*1024){setError('Import darf höchstens 4 MiB groß sein.');return;}
    try{await request({operation:'import',receipt:JSON.parse(await file.text())});}catch{setError('Import ist kein gültiges JSON.');}
  }
  function card(model:StoreModel){return <article className="local-model-card" key={model.id} data-model-id={model.id}>
    <div className="local-model-card-heading"><div className="local-model-monogram" aria-hidden="true">{model.publisher.slice(0,2).toUpperCase()}</div>
      <div><p className="local-model-publisher">{model.publisher}</p><h4>{model.name}</h4></div></div>
    <span className={`local-model-status status-${model.active || model.deviceConfirmed ? 'confirmed' : model.eligibility.state}`}>
      {(model.active || model.deviceConfirmed) && <CheckCircle2 size={13} aria-hidden="true"/>}{storeModelStatus(model)}</span>
    <p className="local-model-card-description">{model.description}</p>
    <dl className="local-model-card-metrics"><div><dt>Downloadgröße</dt><dd>{bytes(model.downloadBytes)}</dd></div>
      <div><dt>RAM geschätzt</dt><dd>{bytes(model.recommendedRamBytes)}</dd></div></dl>
    <p className="local-model-card-variant">{model.quantization??'Variante ungeklärt'} · {model.totalParameters===null?'Parameter unbekannt':`${(model.totalParameters/1e9).toLocaleString('de-DE',{maximumFractionDigits:2})} Mrd. Parameter`}</p>
    <button className="local-model-card-action" type="button" aria-expanded={detail===model.id} aria-controls={`${detailTitleId}-panel`}
      onClick={event=>{openerRef.current=event.currentTarget;setDetail(model.id);setConsent('');}}>{storeNextAction(model)}<ArrowRight size={15} aria-hidden="true"/></button>
  </article>;}
  return <section className="local-model-store" aria-labelledby={titleId}>
    <header className="local-model-store-header"><div className="local-model-store-intro">
      <span className="local-model-eyebrow"><ShieldCheck size={14} aria-hidden="true"/> Lokale KI · auf deinem PC</span>
      <h3 id={titleId}>Finde dein lokales Modell</h3><p>PC prüfen, ein Modell auswählen und in Ruhe testen. Du entscheidest, was installiert wird.</p>
    </div><div className="local-model-scan-action"><button className="local-model-primary" type="button" disabled={!ready||busy}
      onClick={()=>void request({operation:'scan'})}>{scanPending?<Loader2 size={17} className="local-model-spin" aria-hidden="true"/>:<Cpu size={17} aria-hidden="true"/>}
      {scanPending?'Hardware wird geprüft…':hardware.scanned?'Hardware erneut prüfen':'Hardware scannen'}</button>
      <span role="status" aria-live="polite">{!ready?'Lokaler Dienst noch nicht bereit':scanPending?'Liest CPU und verfügbare Speicherwerte':hardwareStale?'Hardware-Scan veraltet · bitte erneut prüfen':hardware.scanned?'Hardware-Snapshot vorhanden':'Noch kein Hardware-Scan'}</span>
    </div></header>
    {!!error&&<p className="local-model-notice local-model-error" role="alert">{error}</p>}
    <section className="local-model-hardware" aria-label="Dein PC">
      <div className="local-model-section-heading"><h4>Dein PC</h4><span>{hardware.observedAt?`Snapshot vom ${new Date(hardware.observedAt).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}`:'Werte erscheinen nach deinem Scan'}</span></div>
      <div className="local-model-hardware-grid">
        <div><Cpu size={18} aria-hidden="true"/><dl><dt>Prozessor</dt><dd>{hardware.cpu}</dd></dl><small>{hardware.cores}</small></div>
        <div><Database size={18} aria-hidden="true"/><dl><dt>RAM verfügbar</dt><dd>{hardware.ramAvailable}</dd></dl><small>{hardware.ramTotal==='Unbekannt'?'Gesamtspeicher unbekannt':`${hardware.ramTotal} insgesamt`}</small></div>
        <div><Monitor size={18} aria-hidden="true"/><dl><dt>Grafikkarte</dt><dd>{hardware.gpu}</dd></dl><small>VRAM: {hardware.gpuMemory} · Unterstützung ungeklärt</small></div>
        <div><HardDrive size={18} aria-hidden="true"/><dl><dt>Speicherplatz frei</dt><dd>{hardware.diskFree}</dd></dl><small>Für Download und Prüfung</small></div>
      </div>
      {hardware.scanned&&<details className="local-model-advanced"><summary>Technische Hardware-Details <ChevronDown size={14} aria-hidden="true"/></summary>
        <p>Gemessene Werte beschreiben den Scanzeitpunkt. CPU-Ausführung wird separat bewertet; erkannte GPUs bestätigen keine Runtime-Unterstützung.</p><pre>{JSON.stringify(view?.hardware,null,2)}</pre></details>}
    </section>
    <section className="local-model-catalog" aria-label="Modellkatalog">
      <div className="local-model-section-heading"><div><h4>Modelle entdecken</h4><p>{models.length} im Katalog · {suitableCount} voraussichtlich geeignet</p></div>
        {(query||publisher||showUnknown||showLarge)&&<button className="local-model-text-button" type="button" onClick={()=>{setQuery('');setPublisher('');setShowUnknown(false);setShowLarge(false);}}>Filter zurücksetzen</button>}</div>
      <div className="local-model-search"><Search size={18} aria-hidden="true"/><label className="local-model-sr-only" htmlFor={searchId}>Modelle suchen</label>
        <input id={searchId} type="search" placeholder="Nach Modell oder Herausgeber suchen…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <details className="local-model-filter-details"><summary><SlidersHorizontal size={15} aria-hidden="true"/> Filter und weitere Modelle <ChevronDown size={14} aria-hidden="true"/></summary>
        <div className="local-model-filters"><label>Herausgeber <select value={publisher} onChange={e=>setPublisher(e.target.value)}><option value="">Alle Herausgeber</option>{[...new Set(models.map(m=>m.publisher))].map(p=><option key={p}>{p}</option>)}</select></label>
          <label><input type="checkbox" checked={showUnknown} onChange={e=>setShowUnknown(e.target.checked)}/> Modelle mit ungeklärter Kompatibilität</label>
          <label><input type="checkbox" checked={showLarge} onChange={e=>setShowLarge(e.target.checked)}/> Modelle mit zu hohem Speicherbedarf</label></div>
      </details>
      <p className="local-model-result-count" role="status" aria-live="polite">{busy&&pendingOperation==='view'?'Katalog wird geladen…':`${visible.length} ${visible.length===1?'Modell':'Modelle'} angezeigt`}</p>
      {!visible.length&&!busy&&<div className="local-model-empty" data-empty-state={emptyState}>
        <div className="local-model-empty-icon" aria-hidden="true">{emptyState==='scan_missing'?<Cpu size={26}/>:<Search size={26}/>}</div>
        <h5>{emptyState==='scan_missing'?'Dein PC ist noch nicht geprüft':emptyState==='filtered'?'Kein Modell passt zu diesen Filtern':emptyState==='compatibility_unknown'?'Kompatibilität noch ungeklärt':'Der Katalog ist noch nicht verfügbar'}</h5>
        <p>{emptyState==='scan_missing'?'Scanne deine Hardware für eine Einschätzung. Du kannst vorher schon den Katalog ansehen.':emptyState==='filtered'?'Ändere die Suche oder zeige auch Modelle mit ungeklärter Kompatibilität an.':emptyState==='compatibility_unknown'?'Die Hardware-, Lizenz- oder Runtime-Prüfung ist noch offen. Die Voraussetzungen findest du bei jedem Modell.':'Prüfe, ob der lokale Dienst bereit ist, und lade die Ansicht erneut.'}</p>
        {models.length>0?<button type="button" className="local-model-secondary" onClick={showAllModels}>Alle Modelle ansehen <ArrowRight size={15} aria-hidden="true"/></button>:<button type="button" disabled={!ready||busy} onClick={()=>void request({operation:'view'})}>Ansicht neu laden</button>}
      </div>}
      {showUnknown&&<p className="local-model-catalog-note">Ungeklärte Modelle sind zum Entdecken sichtbar. Eine Installation wird erst nach den erforderlichen Prüfungen freigegeben.</p>}
      <div className="local-model-grid">{visible.map(card)}</div>
    </section>
    {selected&&<section ref={detailRef} id={`${detailTitleId}-panel`} tabIndex={-1} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();closeDetails();}}} className="local-model-details" aria-labelledby={detailTitleId}><div className="local-model-section-heading"><div><span className="local-model-eyebrow">{selected.publisher}</span><h4 id={detailTitleId}>{selected.name}</h4></div><button type="button" onClick={closeDetails}>Details schließen</button></div><p>{selected.description}</p>
      <details className="local-model-advanced"><summary>Voraussetzungen und technische Details <ChevronDown size={14} aria-hidden="true"/></summary><p>{selected.runtimeReason}. {selected.memoryPolicy}. Empfohlener Kontext: {selected.recommendedContext??'unbekannt'} Tokens.</p>
      <p>Modelllizenz: {selected.licenseLabel}. Die LastBrowser-Lizenz ersetzt keine Herausgeberbedingungen.</p>
      <p>Quelle: <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Herausgeber</a> · Revision {selected.revision??'unbekannt'}</p>
      <ul>{selected.eligibility.reasons.map(r=><li key={r}>{reasons[r]??r}</li>)}</ul>
      {selected.historicalEvidence&&<p>Historischer Vergleich: {selected.historicalEvidence.contentPassed}/{selected.historicalEvidence.tasks} Inhalt, {selected.historicalEvidence.strictPassed}/{selected.historicalEvidence.tasks} strikt. {selected.historicalEvidence.device}, {selected.historicalEvidence.configuration}. Kein Nachweis für dieses Downloadartefakt, kleine CPU oder LastBrowser-Paket.</p>}
      <dl className="local-model-detail-metrics"><dt>Kontext maximal</dt><dd>{selected.contextLimit?.toLocaleString('de-DE')??'Unbekannt'} Tokens</dd><dt>VRAM empfohlen</dt><dd>{bytes(selected.recommendedVramBytes)}</dd></dl></details>
      {selected.eligibility.reasons.length>0&&<p className="local-model-notice">Noch nicht freigegeben: {selected.eligibility.reasons.map(reason=>reasons[reason]??reason).join(' · ')}. Details oben erklären die Voraussetzungen.</p>}
      {selected.licenseText&&<details><summary>Herausgeber-Lizenz lesen</summary><pre>{selected.licenseText}</pre></details>}
      {!selected.installed&&<><label><input type="checkbox" checked={consent===selected.id} onChange={e=>setConsent(e.target.checked?selected.id:'')}/> Diese Herausgeber-Lizenz akzeptieren</label>
        <button className="local-model-primary" type="button" disabled={!ready||busy||running||!selected.eligibility.allowed||consent!==selected.id||!selected.licenseDigest} onClick={()=>void request({operation:'install',modelId:selected.id,licenseDigest:selected.licenseDigest!,requestId:newIndependentRequestId()})}>Installieren · {bytes(selected.downloadBytes)}</button>
        <button type="button" disabled={busy||running||!selected.eligibility.allowed||consent!==selected.id||!selected.licenseDigest} onClick={()=>void request({operation:'importModel',modelId:selected.id,licenseDigest:selected.licenseDigest!,requestId:newIndependentRequestId()})}>Vorhandene gepinnte GGUF importieren</button></>}
      {selected.installed&&<><label>Benchmark <select value={mode} onChange={e=>setMode(e.target.value as 'quick'|'standard')}><option value="quick">Kurztest: 6 Aufgaben</option><option value="standard">Standard: 16 Aufgaben × 3</option></select></label>
        <p>{mode==='standard'?'Bis zu 144 Minuten Anfragebudget, zusätzlich Laden/Aufwärmen.':'Bis zu 4,5 Minuten Anfragebudget, zusätzlich Laden.'} 4K Kontext, 768 Ausgabetokens, seriell.</p>
        <button type="button" disabled={busy||running||!selected.eligibility.allowed} onClick={()=>void request({operation:'benchmark',modelId:selected.id,mode,requestId:newIndependentRequestId()})}>Benchmark starten</button>
        <button type="button" disabled={busy||running||!selected.deviceConfirmed||!selected.eligibility.allowed} onClick={()=>void request({operation:'activate',modelId:selected.id})}>Für lokalen Settings-Chat aktivieren</button>
        <button type="button" disabled={busy||running} onClick={()=>void request({operation:'remove',modelId:selected.id})}>Eigene Installation entfernen</button></>}
      </section>}
    {!!view?.jobs.length&&<section className="local-model-jobs"><h4>Aufträge</h4>{view.jobs.map(j=><article className="local-model-job" key={j.id}><p>{models.find(model=>model.id===j.modelId)?.name??j.modelId}: {j.state} · {j.operation==='install'?bytes(j.downloadedBytes):`${j.progress}/${j.total}`} {j.error??''}</p>
      {active(j.state)&&<progress aria-label={`Fortschritt ${j.modelId}`} value={j.operation==='install'?(models.find(model=>model.id===j.modelId)?.downloadBytes?j.downloadedBytes:undefined):(j.total>0?j.progress:undefined)} max={j.operation==='install'?(models.find(model=>model.id===j.modelId)?.downloadBytes??undefined):(j.total>0?j.total:undefined)}/>}

      {active(j.state)&&<button type="button" onClick={()=>void request({operation:'cancel',jobId:j.id})}>Stoppen</button>}</article>)}</section>}
    <details className="local-model-results" open={Boolean(view?.history.length)}><summary>Ergebnisse und Vergleich <span>{view?.history.length??0} Läufe</span><ChevronDown size={15} aria-hidden="true"/></summary><div className="local-model-results-body"><p>Benchmarks verwenden synthetische Aufgaben und führen keine Tools aus.</p><button type="button" onClick={()=>importInput.current?.click()}>Ergebnisse importieren</button>
      <input ref={importInput} hidden type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];if(file)void importFile(file);e.target.value='';}}/>
      <div className="local-model-comparison"><table><thead><tr><th>Modell / Lauf</th><th>Inhalt</th><th>Format</th><th>Technik</th><th>Median</th><th>Empfehlung</th><th>Aktionen</th></tr></thead>
        <tbody>{view?.history.map(r=><tr key={r.id}><td>{r.modelId}<br/>{r.mode} · {r.origin} · {new Date(r.createdAt*1000).toLocaleString()}</td>
          <td>{r.counts.content}/{r.sampleCount}</td><td>{r.counts.format}/{r.sampleCount}</td><td>{r.counts.technical}/{r.sampleCount}</td><td>{r.medianResponseMs===null?'Unbekannt':`${Math.round(r.medianResponseMs)} ms`}</td>
          <td>{r.recommendation==='chat_candidate'?'Chat-Kandidat':r.origin==='imported'?'Fremder Gerätebeleg':'Keine Empfehlung'}{r.unsafeToolOrSecurityFailure?' · Tool/Sicherheitsfehler':''}</td>
          <td><button type="button" onClick={()=>void downloadExport(r.id)}>Export</button><button type="button" onClick={()=>void request({operation:'export',receiptId:r.id}).then(setReceipt)}>Antworten</button>
            <button type="button" onClick={()=>void request({operation:'deleteHistory',receiptId:r.id})}>Löschen</button></td></tr>)}</tbody></table></div>
      {receipt!==null&&<details open><summary>Unveränderte Antworten und Bewertung</summary><pre>{JSON.stringify(receipt,null,2)}</pre><button type="button" onClick={()=>setReceipt(null)}>Schließen</button></details>}
      <p>Importe bestätigen diesen PC nicht. Keine automatische Agentenfreigabe. Tokens/s, erster sichtbarer Token und Speicherpeak bleiben ohne entsprechende Messung unbekannt.</p>
    </div></details>
    {chosen&&<section className="local-model-chat"><h4>Lokaler Settings-Chat · {chosen.name}</h4><p>Bewusst aktiviertes Modell, nur Text. Kein Cloud-Fallback und keine Tools. Die produktive AUTO-/Agentenrolle benötigt eigene Qualifikation.</p>
      <textarea maxLength={8192} value={chatText} onChange={e=>setChatText(e.target.value)} aria-label="Lokale Nachricht"/>
      <button type="button" disabled={chatBusy||!chatText.trim()} onClick={()=>{setChatBusy(true);void request({operation:'chat',text:chatText}).then(result=>{if(mounted.current&&result&&typeof result==='object'&&'text'in result)setChatResult(String(result.text));}).finally(()=>{if(mounted.current)setChatBusy(false);});}}>Senden</button>
      {chatBusy&&<button type="button" onClick={()=>void request({operation:'stopChat'})}>Stoppen</button>}<pre>{chatResult}</pre></section>}
    <details className="local-model-policy"><summary>Lizenz, Messgrenzen und lokale Ausführung <ChevronDown size={14} aria-hidden="true"/></summary><p>LastBrowser erhebt keine Lizenzgebühr nach Modellgröße. Installation und Ausführung hängen weiterhin von Herausgeberlizenz, Hardwareeignung und qualifizierter Runtime ab.</p><p>Größenbedarf gilt für konkrete Gewichte und 4K Kontext. Unbekannter GPU-Support ist keine VRAM-Empfehlung.</p></details>
  </section>;
}
