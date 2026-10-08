import React,{useEffect,useRef,useState} from 'react';
import type {IndependentAssistantClient} from '../independent-assistant-client.js';
import {newIndependentRequestId,type IndependentScope} from '../independent-contracts.js';
import type {ModelStoreRequest,StoreView,StoreModel} from '../model-store-contracts.js';
import './local-model-store.css';

const bytes=(n:number|null)=>n===null?'Unbekannt':`${(n/1024**3).toFixed(1)} GiB`;
const active=(s:string)=>['pending','running','downloading','verifying','stopping'].includes(s);
const reasons:Record<string,string>={hardware_scan_required:'Hardware-Scan erforderlich',hardware_scan_stale:'Hardware-Scan veraltet',
  runtime_compatibility_unknown:'Gebündelte Runtime noch nicht qualifiziert',artifact_qualification_incomplete:'Downloadartefakt noch nicht vollständig qualifiziert',
  cpu_features_unknown:'CPU-Instruktionen noch nicht bestätigt',hardware_measurement_unknown:'Speicherwerte fehlen',
  insufficient_available_ram:'Zu wenig freier RAM einschließlich Systemreserve',insufficient_disk_staging:'Zu wenig freier Speicher für Download und Prüfung',
  commercial_lastbrowser_license_required:'Kommerzielle LastBrowser-Lizenz erforderlich',model_parameter_count_unknown:'Gesamtparameterzahl noch ungeklärt'};
export function LocalModelStore({scope,client,ready}:{scope:IndependentScope;client:IndependentAssistantClient;ready:boolean}):React.JSX.Element{
  const [view,setView]=useState<StoreView|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [showLarge,setShowLarge]=useState(false),[showUnknown,setShowUnknown]=useState(false),[query,setQuery]=useState(''),[publisher,setPublisher]=useState('');
  const [detail,setDetail]=useState<string|null>(null),[consent,setConsent]=useState(''),[mode,setMode]=useState<'quick'|'standard'>('quick');
  const [chatText,setChatText]=useState(''),[chatResult,setChatResult]=useState(''),[chatBusy,setChatBusy]=useState(false),[receipt,setReceipt]=useState<unknown>(null);
  const mounted=useRef(true),generation=useRef(0),inFlight=useRef(false),importInput=useRef<HTMLInputElement>(null);
  const scopeKey=JSON.stringify(scope);
  async function request(data:ModelStoreRequest,quiet=false){
    if(!ready||!mounted.current)return;
    const requestGeneration=generation.current;
    if(!quiet){setBusy(true);setError('');}
    try{
      const response=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'store',request:data}});
      if(!mounted.current||requestGeneration!==generation.current)return;
      if(!response.ok){if(!quiet)setError(`Lokale KI: ${response.error.code}`);return;}
      if(!('kind'in response.value)||response.value.kind!=='model_store'){if(!quiet)setError('Ungültige Store-Antwort');return;}
      setView(response.value.store);return response.value.storeResult;
    }catch{if(mounted.current&&requestGeneration===generation.current&&!quiet)setError('Lokale KI nicht erreichbar. Es wurde kein Cloud-Ersatz verwendet.');}
    finally{if(mounted.current&&requestGeneration===generation.current&&!quiet)setBusy(false);}
  }
  useEffect(()=>{mounted.current=true;generation.current++;setView(null);setDetail(null);setReceipt(null);setChatText('');setChatResult('');setChatBusy(false);setBusy(false);setError('');void request({operation:'view'});return()=>{mounted.current=false;generation.current++;};},[ready,scopeKey]);
  const running=view?.jobs.some(j=>active(j.state))??false;
  useEffect(()=>{
    if(!running)return;
    const timer=window.setInterval(()=>{if(inFlight.current)return;inFlight.current=true;void request({operation:'view'},true).finally(()=>{inFlight.current=false;});},1500);
    return()=>window.clearInterval(timer);
  },[running,scopeKey]);
  const models=view?.models??[],selected=models.find(m=>m.id===detail),chosen=models.find(m=>m.active);
  const visible=models.filter(m=>!publisher||m.publisher===publisher).filter(m=>(m.name+' '+m.publisher+' '+m.description).toLowerCase().includes(query.toLowerCase()))
    .filter(m=>m.installed||m.eligibility.state==='likely_suitable'||m.eligibility.state==='too_large'&&showLarge||m.eligibility.state==='unknown'&&showUnknown);
  async function downloadExport(id:string){
    const result=await request({operation:'export',receiptId:id});if(!result)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`lastbrowser-benchmark-${id}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function importFile(file:File){
    if(file.size>4*1024*1024){setError('Import darf höchstens 4 MiB groß sein.');return;}
    try{await request({operation:'import',receipt:JSON.parse(await file.text())});}catch{setError('Import ist kein gültiges JSON.');}
  }
  function card(model:StoreModel){return <article className="local-model-card" key={model.id}>
    <div className="local-model-monogram" aria-hidden="true">{model.publisher.slice(0,2).toUpperCase()}</div>
    <h4>{model.name}</h4><p>{model.publisher} · {model.quantization??'Variante ungeklärt'}</p>
    <p>{model.deviceConfirmed?'Auf diesem PC bestätigt':'Ungetestetes Artefakt'} · {model.installed?'Installiert':'Nicht installiert'}</p>
    <dl><dt>Gesamtparameter</dt><dd>{model.totalParameters===null?'Unbekannt':`${(model.totalParameters/1e9).toFixed(2)} B`}</dd>
      <dt>Download</dt><dd>{bytes(model.downloadBytes)}</dd><dt>RAM empfohlen (Schätzung)</dt><dd>{bytes(model.recommendedRamBytes)}</dd>
      <dt>VRAM empfohlen</dt><dd>{bytes(model.recommendedVramBytes)}</dd><dt>Kontext maximal</dt><dd>{model.contextLimit?.toLocaleString()??'Unbekannt'} Tokens</dd></dl>
    {model.commercialRequired&&<p className="local-model-license">Kommerzielle LastBrowser-Lizenz erforderlich</p>}
    <p>{model.eligibility.state==='likely_suitable'?'Voraussichtlich geeignet':model.eligibility.state==='too_large'?'Zu groß':'Kompatibilität ungeklärt'}</p>
    <button type="button" onClick={()=>{setDetail(model.id);setConsent('');}}>Details / Aktionen</button>
  </article>;}
  return <section className="local-model-store" aria-label="Lokaler Modell-Store">
    <h3>Lokaler Modell-Store</h3><p>Für deinen PC auswählen, installieren und nachvollziehbar testen. Alle Benchmarks verwenden synthetische Daten; Tools werden niemals ausgeführt.</p>
    <button type="button" disabled={!ready||busy} onClick={()=>void request({operation:'scan'})}>Hardware scannen</button>
    {Boolean(view?.hardware)&&<details><summary>Hardware-Snapshot</summary><pre>{JSON.stringify(view?.hardware,null,2)}</pre></details>}
    <p>CPU-Ausführung wird separat bewertet. Unbekannter GPU-Support ist keine VRAM-Empfehlung. Größenbedarf gilt für konkrete Gewichte und 4K Kontext.</p>
    <div className="local-model-filters"><label>Modelle suchen <input value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label>Herausgeber <select value={publisher} onChange={e=>setPublisher(e.target.value)}><option value="">Alle</option>{[...new Set(models.map(m=>m.publisher))].map(p=><option key={p}>{p}</option>)}</select></label>
      <label><input type="checkbox" checked={showLarge} onChange={e=>setShowLarge(e.target.checked)}/> Auch zu große Modelle anzeigen</label>
      <label><input type="checkbox" checked={showUnknown} onChange={e=>setShowUnknown(e.target.checked)}/> Kompatibilität ungeklärt anzeigen</label></div>
    {!!error&&<p role="alert">{error}</p>}
    {!visible.length&&<p>Keine qualifizierten Vorschläge. Hardware scannen oder ungeklärte Modelle mit Begründung anzeigen.</p>}
    <div className="local-model-grid">{visible.map(card)}</div>
    {selected&&<section className="local-model-details" aria-label="Modelldetails"><h4>{selected.name}</h4><p>{selected.description}</p>
      <p>{selected.runtimeReason}. {selected.memoryPolicy}. Empfohlener Kontext: {selected.recommendedContext??'unbekannt'} Tokens.</p>
      <p>Modelllizenz: {selected.licenseLabel}. Die LastBrowser-Lizenz ersetzt keine Herausgeberbedingungen.</p>
      <p>Quelle: <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Herausgeber</a> · Revision {selected.revision??'unbekannt'}</p>
      <ul>{selected.eligibility.reasons.map(r=><li key={r}>{reasons[r]??r}</li>)}</ul>
      {selected.historicalEvidence&&<p>Historischer Vergleich: {selected.historicalEvidence.contentPassed}/{selected.historicalEvidence.tasks} Inhalt, {selected.historicalEvidence.strictPassed}/{selected.historicalEvidence.tasks} strikt. {selected.historicalEvidence.device}, {selected.historicalEvidence.configuration}. Kein Nachweis für dieses Downloadartefakt, kleine CPU oder LastBrowser-Paket.</p>}
      {selected.licenseText&&<details><summary>Herausgeber-Lizenz lesen</summary><pre>{selected.licenseText}</pre></details>}
      {!selected.installed&&<><label><input type="checkbox" checked={consent===selected.id} onChange={e=>setConsent(e.target.checked?selected.id:'')}/> Diese Herausgeber-Lizenz akzeptieren</label>
        <button type="button" disabled={busy||running||!selected.eligibility.allowed||consent!==selected.id||!selected.licenseDigest} onClick={()=>void request({operation:'install',modelId:selected.id,licenseDigest:selected.licenseDigest!,requestId:newIndependentRequestId()})}>Installieren · {bytes(selected.downloadBytes)}</button>
        <button type="button" disabled={busy||running||!selected.eligibility.allowed||consent!==selected.id||!selected.licenseDigest} onClick={()=>void request({operation:'importModel',modelId:selected.id,licenseDigest:selected.licenseDigest!,requestId:newIndependentRequestId()})}>Vorhandene gepinnte GGUF importieren</button></>}
      {selected.installed&&<><label>Benchmark <select value={mode} onChange={e=>setMode(e.target.value as 'quick'|'standard')}><option value="quick">Kurztest: 6 Aufgaben</option><option value="standard">Standard: 16 Aufgaben × 3</option></select></label>
        <p>{mode==='standard'?'Bis zu 144 Minuten Anfragebudget, zusätzlich Laden/Aufwärmen.':'Bis zu 4,5 Minuten Anfragebudget, zusätzlich Laden.'} 4K Kontext, 768 Ausgabetokens, seriell.</p>
        <button type="button" disabled={busy||running||!selected.eligibility.allowed} onClick={()=>void request({operation:'benchmark',modelId:selected.id,mode,requestId:newIndependentRequestId()})}>Benchmark starten</button>
        <button type="button" disabled={busy||running||!selected.deviceConfirmed||!selected.eligibility.allowed} onClick={()=>void request({operation:'activate',modelId:selected.id})}>Für lokalen Settings-Chat aktivieren</button>
        <button type="button" disabled={busy||running} onClick={()=>void request({operation:'remove',modelId:selected.id})}>Eigene Installation entfernen</button></>}
      <button type="button" onClick={()=>setDetail(null)}>Details schließen</button></section>}
    {!!view?.jobs.length&&<section><h4>Aufträge</h4>{view.jobs.map(j=><article key={j.id}><p>{j.modelId}: {j.state} · {j.operation==='install'?bytes(j.downloadedBytes):`${j.progress}/${j.total}`} {j.error??''}</p>
      {active(j.state)&&<button type="button" onClick={()=>void request({operation:'cancel',jobId:j.id})}>Stoppen</button>}</article>)}</section>}
    <section><h4>Ergebnisse / Vergleich</h4><button type="button" onClick={()=>importInput.current?.click()}>Ergebnisse importieren</button>
      <input ref={importInput} hidden type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];if(file)void importFile(file);e.target.value='';}}/>
      <div className="local-model-comparison"><table><thead><tr><th>Modell / Lauf</th><th>Inhalt</th><th>Format</th><th>Technik</th><th>Median</th><th>Empfehlung</th><th>Aktionen</th></tr></thead>
        <tbody>{view?.history.map(r=><tr key={r.id}><td>{r.modelId}<br/>{r.mode} · {r.origin} · {new Date(r.createdAt*1000).toLocaleString()}</td>
          <td>{r.counts.content}/{r.sampleCount}</td><td>{r.counts.format}/{r.sampleCount}</td><td>{r.counts.technical}/{r.sampleCount}</td><td>{r.medianResponseMs===null?'Unbekannt':`${Math.round(r.medianResponseMs)} ms`}</td>
          <td>{r.recommendation==='chat_candidate'?'Chat-Kandidat':r.origin==='imported'?'Fremder Gerätebeleg':'Keine Empfehlung'}{r.unsafeToolOrSecurityFailure?' · Tool/Sicherheitsfehler':''}</td>
          <td><button type="button" onClick={()=>void downloadExport(r.id)}>Export</button><button type="button" onClick={()=>void request({operation:'export',receiptId:r.id}).then(setReceipt)}>Antworten</button>
            <button type="button" onClick={()=>void request({operation:'deleteHistory',receiptId:r.id})}>Löschen</button></td></tr>)}</tbody></table></div>
      {receipt!==null&&<details open><summary>Unveränderte Antworten und Bewertung</summary><pre>{JSON.stringify(receipt,null,2)}</pre><button type="button" onClick={()=>setReceipt(null)}>Schließen</button></details>}
      <p>Importe bestätigen diesen PC nicht. Keine automatische Agentenfreigabe. Tokens/s, erster sichtbarer Token und Speicherpeak bleiben ohne entsprechende Messung unbekannt.</p>
    </section>
    {chosen&&<section><h4>Lokaler Settings-Chat · {chosen.name}</h4><p>Bewusst aktiviertes Modell, nur Text. Kein Cloud-Fallback und keine Tools. Die produktive AUTO-/Agentenrolle benötigt eigene Qualifikation.</p>
      <textarea maxLength={8192} value={chatText} onChange={e=>setChatText(e.target.value)} aria-label="Lokale Nachricht"/>
      <button type="button" disabled={chatBusy||!chatText.trim()} onClick={()=>{setChatBusy(true);void request({operation:'chat',text:chatText}).then(result=>{if(mounted.current&&result&&typeof result==='object'&&'text'in result)setChatResult(String(result.text));}).finally(()=>{if(mounted.current)setChatBusy(false);});}}>Senden</button>
      {chatBusy&&<button type="button" onClick={()=>void request({operation:'stopChat'})}>Stoppen</button>}<pre>{chatResult}</pre></section>}
    <p>Über 100B Gesamtparameter: kommerzielle LastBrowser-Lizenz erforderlich, auch MoE. Genau 100B ausgenommen. Aktuell ist kein kommerzieller Lizenzverifier angebunden; Freischaltung bleibt gesperrt.</p>
  </section>;
}
