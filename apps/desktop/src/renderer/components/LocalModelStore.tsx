import React,{useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Cpu, Database, Film, HardDrive, Image as ImageIcon, Loader2, MessageSquare, Monitor, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { assessStoreGpuEstimate, filterStoreModels, formatStoreBytes, formatStoreGiBRange, storeEmptyState, storeHardwareRecommendation, storeModelCategory, storeModelStatus, storeSourceUrl, summarizeStoreHardware } from './model-store-presentation.js';
import type {IndependentAssistantClient} from '../independent-assistant-client.js';
import {newIndependentRequestId,type IndependentScope} from '../independent-contracts.js';
import type {ModelStoreRequest,StoreView,StoreModel} from '../model-store-contracts.js';
import './local-model-store.css';
import { storeConsentKey, storeExecutionLabel, storeJobLabel, storeModelActions } from './model-store-actions.js';
import { LocalModelMediaForm, LocalModelMediaResult } from './LocalModelMedia.js';
import { useDesktopI18n } from '../i18n.js';
import { shellText } from '../i18n/shell-text.js';

const bytes = formatStoreBytes;
const active=(s:string)=>['pending','running','downloading','verifying','stopping'].includes(s);
const reasons:Record<string,string>={hardware_scan_required:'Hardware-Scan erforderlich',hardware_scan_stale:'Hardware-Scan veraltet',
  runtime_compatibility_unknown:'Gebündelte Runtime noch nicht qualifiziert',artifact_qualification_incomplete:'Downloadartefakt noch nicht vollständig qualifiziert',
  cpu_features_unknown:'CPU-Instruktionen noch nicht bestätigt',hardware_measurement_unknown:'Speicherwerte fehlen',
  insufficient_available_ram:'Zu wenig freier RAM einschließlich Systemreserve',insufficient_disk_staging:'Zu wenig freier Speicher für Download und Prüfung',
  model_parameter_count_unknown:'Gesamtparameterzahl noch ungeklärt',model_parameter_count_invalid:'Ungültige Parameterangabe'};
const operationErrors:Record<string,string>={
  local_ai_path_too_long:'Der Windows-Profilpfad ist für den Modellpfad zu lang. Verschiebe den Windows-Benutzerordner oder ändere den App-Datenspeicherort, bevor du ein Modell installierst oder startest. Die lokale Modellansicht bleibt verfügbar.',
};
const storeReasonEnglish: Record<string, string> = {
  hardware_scan_required: 'Hardware scan required',
  hardware_scan_stale: 'Hardware scan is stale',
  runtime_compatibility_unknown: 'Bundled runtime is not qualified yet',
  artifact_qualification_incomplete: 'Download artifact is not fully qualified yet',
  cpu_features_unknown: 'CPU instructions are not confirmed yet',
  hardware_measurement_unknown: 'Memory figures are missing',
  insufficient_available_ram: 'Not enough free RAM, including the system reserve',
  insufficient_disk_staging: 'Not enough free disk space for download and verification',
  model_parameter_count_unknown: 'Total parameter count is still unknown',
  model_parameter_count_invalid: 'Invalid parameter count',
  local_ai_path_too_long: 'The Windows profile path is too long for the model path. Move the Windows user folder or change the app data location before you install or start a model. The local model view stays available.'
};
function storeReasonText(locale: string, code: string): string {
  const german = reasons[code] || operationErrors[code];
  if (!german) return code;
  return shellText(locale, german, storeReasonEnglish[code] || german);
}
export function LocalModelStore({scope,client,ready}:{scope:IndependentScope;client:IndependentAssistantClient;ready:boolean}):React.JSX.Element{
  const { locale } = useDesktopI18n();
  const titleId = useId(), searchId = useId(), detailTitleId = useId();
  const detailRef = useRef<HTMLElement>(null), storeRef = useRef<HTMLElement>(null), openerRef = useRef<string|null>(null), restoreFocus = useRef(false);
  const [pendingOperation,setPendingOperation] = useState<string|null>(null);
  const [viewState,setViewState]=useState<{key:string;value:StoreView}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [showLarge,setShowLarge]=useState(false),[showUnknown,setShowUnknown]=useState(false),[query,setQuery]=useState(''),[publisher,setPublisher]=useState('');
  const [category,setCategory]=useState<'text'|'image'|'video'>('text');
  const [detail,setDetail]=useState<string|null>(null),[consent,setConsent]=useState(''),[mode,setMode]=useState<'quick'|'standard'>('quick');
  const [benchmarkBackend,setBenchmarkBackend]=useState<'cpu'|'vulkan'>('cpu');
  const [chatText,setChatText]=useState(''),[chatResult,setChatResult]=useState(''),[chatBusy,setChatBusy]=useState(false),[receipt,setReceipt]=useState<unknown>(null);
  const mounted=useRef(true),generation=useRef(0),inFlight=useRef(false),importInput=useRef<HTMLInputElement>(null);
  const scopeKey=JSON.stringify(scope);
  const currentScopeKey=useRef(scopeKey);currentScopeKey.current=scopeKey;
  const view=viewState?.key===scopeKey?viewState.value:null;
  async function request(data:ModelStoreRequest,quiet=false){
    if(!ready||!mounted.current)return;
    if(view?.readOnly&&!['view','scan'].includes(data.operation)){
      if(!quiet)setError(shellText(locale, "Diese Testversion bietet den Modellkatalog und Hardwarescan. Lokale Ausführung ist noch nicht freigegeben.", "This test build offers the model catalog and hardware scan. Local execution is not enabled yet."));
      return;
    }
    const requestGeneration=generation.current;
    if(!quiet){setBusy(true);setPendingOperation(data.operation);setError('');}
    try{
      const response=await client.request({schemaVersion:1,operation:'localAi',scope,payload:{action:'store',request:data}});
      if(!mounted.current||requestGeneration!==generation.current||currentScopeKey.current!==scopeKey)return;
      if(!response.ok){if(!quiet)setError(storeReasonText(locale, response.error.code) === response.error.code ? shellText(locale, `Lokale KI: ${response.error.code}`, `Local AI: ${response.error.code}`) : storeReasonText(locale, response.error.code));return;}
      if(!('kind'in response.value)||response.value.kind!=='model_store'){if(!quiet)setError(shellText(locale, "Ungültige Store-Antwort", "Invalid store response"));return;}
      setViewState({key:scopeKey,value:response.value.store});return response.value.storeResult;
    }catch{if(mounted.current&&requestGeneration===generation.current&&currentScopeKey.current===scopeKey&&!quiet)setError('Lokale KI nicht erreichbar. Es wurde kein Cloud-Ersatz verwendet.');}
    finally{if(mounted.current&&requestGeneration===generation.current&&currentScopeKey.current===scopeKey&&!quiet){setBusy(false);setPendingOperation(null);}}
  }
  useEffect(()=>{
    mounted.current=true;const lifecycle=++generation.current;
    setViewState(null);setDetail(null);setReceipt(null);setChatText('');setChatResult('');setChatBusy(false);setBusy(false);setPendingOperation(null);setError('');setShowLarge(false);setShowUnknown(false);
    void (async()=>{
      await request({operation:'view'});
      if(mounted.current&&generation.current===lifecycle&&currentScopeKey.current===scopeKey)await request({operation:'scan'});
    })();
    return()=>{mounted.current=false;generation.current++;};
  },[ready,scopeKey]);
  const running=view?.jobs.some(j=>active(j.state))??false;
  useEffect(()=>{
    if(!running)return;
    const timer=window.setInterval(()=>{if(inFlight.current)return;inFlight.current=true;void request({operation:'view'},true).finally(()=>{inFlight.current=false;});},1500);
    return()=>window.clearInterval(timer);
  },[running,scopeKey]);
  const models=view?.models??[],selected=models.find(m=>m.id===detail),chosen=models.find(m=>m.active);
  const selectedActions = selected ? storeModelActions(selected, !!view?.readOnly) : null;
  const chosenActions = chosen ? storeModelActions(chosen, !!view?.readOnly) : null;
  const benchmarkBackends: Array<'cpu'|'vulkan'> = selected?.execution?.availableBackends ?? ['cpu'];
  const effectiveBenchmarkBackend = benchmarkBackends.includes(benchmarkBackend) ? benchmarkBackend : benchmarkBackends[0] ?? 'cpu';
  const filters = { query, publisher, showLarge, showUnknown, category };
  const visible = filterStoreModels(models, filters,view?.hardware)
    .sort((a,b) => Number(!!b.installed)-Number(!!a.installed) || Number(!!b.curation?.priority)-Number(!!a.curation?.priority) || a.name.localeCompare(b.name,'de'));
  const hardware = summarizeStoreHardware(view?.hardware);
  const emptyState = storeEmptyState(models, filters, view?.hardware);
  const suitableCount = models.filter(model => storeHardwareRecommendation(model,view?.hardware).fit==='within').length;
  const scanPending = pendingOperation === 'scan';
  const hardwareStale = models.some(model => model.eligibility.reasons.includes('hardware_scan_stale'));
  useLayoutEffect(() => {
    if (detail) { detailRef.current?.focus({preventScroll:true}); detailRef.current?.scrollIntoView({block:'start'}); }
    else if (restoreFocus.current) {
      restoreFocus.current=false;
      const opener=[...(storeRef.current?.querySelectorAll<HTMLButtonElement>('[data-open-model]') || [])].find(button=>button.dataset.openModel===openerRef.current);
      opener?.focus({preventScroll:true}); opener?.scrollIntoView({block:'nearest'});
    }
  }, [detail]);
  function closeDetails() { restoreFocus.current=true;setDetail(null);setConsent(''); }
  useEffect(() => { setBenchmarkBackend('cpu'); }, [detail, scopeKey]);
  async function sendLocalChat() {
    if (chatBusy || !chosenActions?.execute || chosenActions.kind !== 'text' || !chatText.trim()) return;
    const epoch=generation.current, captured=scopeKey, text=chatText;
    setChatBusy(true);
    try {
      const result=await request({operation:'chat',text});
      if(mounted.current&&epoch===generation.current&&currentScopeKey.current===captured&&result&&typeof result==='object'&&'text'in result) {
        setChatResult(String(result.text)); setChatText(current => current===text?'':current);
      }
    } finally { if(mounted.current&&epoch===generation.current&&currentScopeKey.current===captured)setChatBusy(false); }
  }
  function showAllModels() { setQuery('');setPublisher('');setShowUnknown(true);setShowLarge(true); }
  async function downloadExport(id:string){
    const result=await request({operation:'export',receiptId:id});if(!result)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`lastbrowser-benchmark-${id}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function importFile(file:File){
    if(file.size>4*1024*1024){setError(shellText(locale, "Import darf höchstens 4 MiB groß sein.", "Import must be at most 4 MiB."));return;}
    try{await request({operation:'import',receipt:JSON.parse(await file.text())});}catch{setError('Import ist kein gültiges JSON.');}
  }
  function card(model:StoreModel){
    const curated=model.curation;
    const recommendation=storeHardwareRecommendation(model,view?.hardware),fit=recommendation.fit;
    return <article className="local-model-card" key={model.id} data-model-id={model.id}>
      <button className="local-model-card-open" type="button" data-open-model={model.id}
        aria-label={`${model.name}: Details ansehen`} onClick={()=>{openerRef.current=model.id;setDetail(model.id);setConsent('');}}>
        <span className="local-model-card-heading"><span className="local-model-monogram" aria-hidden="true">{model.publisher.slice(0,2).toUpperCase()}</span>
          <span><span className="local-model-publisher">{model.publisher}</span><strong>{model.name}</strong></span><ArrowRight size={16} aria-hidden="true"/></span>
        <span className="local-model-card-description">{curated?.useCases.slice(0,2).join(' · ') || model.description}</span>
        <span className="local-model-card-metrics"><span><span className="local-model-metric-label">Gewichte{model.downloadBytes===null?shellText(locale, " · geschätzt", " · estimated"):''}</span>
          <strong>{model.downloadBytes!==null?bytes(model.downloadBytes):formatStoreGiBRange(curated?.estimatedDownloadGiB)}</strong></span>
          <span><span className="local-model-metric-label">{shellText(locale, "GPU-Klasse · geschätzt", "GPU class · estimated")}</span><strong>{curated?`${curated.recommendedGpuGiB} GiB`:bytes(model.recommendedVramBytes)}</strong></span></span>
        <span className="local-model-card-states">
          <span className={`local-model-status status-${model.active || model.deviceConfirmed?'confirmed':model.eligibility.state}`}>
            {(model.active || model.deviceConfirmed) && <CheckCircle2 size={12} aria-hidden="true"/>}
            {model.execution ? storeExecutionLabel(model) : model.curated&&!model.installed&&!model.eligibility.allowed?'Nur entdecken':storeModelStatus(model)}</span>
          {fit==='outside'&&<span className="local-model-fit">{shellText(locale, "Über deiner Speicherklasse", "Above your memory class")}</span>}
          {fit==='within'&&<span className="local-model-fit">{recommendation.placement==='cpu'?shellText(locale, "Für Prozessor und freien Speicher geprüft", "Checked for CPU and free memory"):shellText(locale, "Speicherklasse passt · Schätzung", "Memory class fits · estimate")}</span>}
        </span>
      </button>
    </article>;
  }
  return <section ref={storeRef} className={`local-model-store${selected?' local-model-store--detail':''}`} aria-labelledby={selected?detailTitleId:titleId}>
    {view?.readOnly&&<p className="local-model-notice" role="status">{shellText(locale, "Katalog und Hardwarescan sind verfügbar. Lokale Ausführung ist in dieser Testversion noch nicht freigegeben; bestehende Installationen werden hier nicht geprüft.", "The catalog and hardware scan are available. Local execution is not enabled in this test build; existing installs are not checked here.")}</p>}
    {!selected&&<>
    <header className="local-model-store-header"><div className="local-model-store-intro">
      <span className="local-model-eyebrow"><ShieldCheck size={14} aria-hidden="true"/> Lokale KI · auf deinem PC</span>
      <h3 id={titleId}>Lokale Modelle entdecken</h3><p>{shellText(locale, "Eine kuratierte Auswahl für Text, Bilder und Video. Details zeigen, was ein Modell kann und was dein PC dafür braucht.", "A curated selection for text, images, and video. Details show what a model can do and what your PC needs.")}</p>
    </div><div className="local-model-scan-action"><button className="local-model-primary" type="button" disabled={!ready||busy}
      onClick={()=>void request({operation:'scan'})}>{scanPending?<Loader2 size={17} className="local-model-spin" aria-hidden="true"/>:<Cpu size={17} aria-hidden="true"/>}
      {scanPending?shellText(locale, "Hardware wird geprüft…", "Checking hardware…"):hardware.scanned?shellText(locale, "Hardware erneut prüfen", "Scan hardware again"):shellText(locale, "Hardware scannen", "Scan hardware")}</button>
      <span role="status" aria-live="polite">{!ready?shellText(locale, "Lokaler Dienst noch nicht bereit", "Local service is not ready yet"):scanPending?shellText(locale, "Liest CPU und verfügbare Speicherwerte", "Reading CPU and available memory"):hardwareStale?shellText(locale, "Hardware-Scan veraltet · bitte erneut prüfen", "Hardware scan is stale · please scan again"):hardware.scanned?shellText(locale, "Hardware-Snapshot vorhanden", "Hardware snapshot available"):shellText(locale, "Noch kein Hardware-Scan", "No hardware scan yet")}</span>
    </div></header>
    {!!error&&<p className="local-model-notice local-model-error" role="alert">{error}</p>}
    <section className="local-model-hardware" aria-label="Dein PC">
      <div className="local-model-section-heading"><h4>Dein PC</h4><span>{hardware.observedAt?`Snapshot vom ${new Date(hardware.observedAt).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}`:'Werte erscheinen nach deinem Scan'}</span></div>
      <div className="local-model-hardware-grid">
        <div><Cpu size={18} aria-hidden="true"/><dl><dt>Prozessor</dt><dd>{hardware.cpu}</dd></dl><small>{hardware.cores}</small></div>
        <div><Database size={18} aria-hidden="true"/><dl><dt>{shellText(locale, "RAM verfügbar", "RAM available")}</dt><dd>{hardware.ramAvailable}</dd></dl><small>{hardware.ramTotal==='Unbekannt'?shellText(locale, "Gesamtspeicher unbekannt", "Total memory unknown"):`${hardware.ramTotal} insgesamt`}</small></div>
        <div><Monitor size={18} aria-hidden="true"/><dl><dt>{shellText(locale, "Grafikkarte", "Graphics card")}</dt><dd>{hardware.gpu}</dd></dl><small>VRAM: {hardware.gpuMemory} · Unterstützung ungeklärt</small></div>
        <div><HardDrive size={18} aria-hidden="true"/><dl><dt>{shellText(locale, "Speicherplatz frei", "Free disk space")}</dt><dd>{hardware.diskFree}</dd></dl><small>{shellText(locale, "Für Download und Prüfung", "For download and verification")}</small></div>
      </div>
      {hardware.scanned&&<details className="local-model-advanced"><summary>Technische Hardware-Details <ChevronDown size={14} aria-hidden="true"/></summary>
        <p>{shellText(locale, "Gemessene Werte beschreiben den Scanzeitpunkt. CPU-Ausführung wird separat bewertet; erkannte GPUs bestätigen keine Runtime-Unterstützung.", "Measured values describe the moment of the scan. CPU execution is judged separately; a detected GPU does not confirm runtime support.")}</p><pre>{JSON.stringify(view?.hardware,null,2)}</pre></details>}
    </section>
    <section className="local-model-catalog" aria-label="Modellkatalog">
      <div className="local-model-section-heading"><div><h4>{hardware.scanned?'Kuratierte Auswahl':shellText(locale, "Kuratierte Auswahl · Hardware noch nicht geprüft", "Curated selection · hardware not scanned yet")}</h4><p>{models.length} im Katalog{ suitableCount>0?shellText(locale, ` · ${suitableCount} passen zur Speicherschätzung`, ` · ${suitableCount} fit the memory estimate`):''}</p></div>
        {(query||publisher||showUnknown||showLarge)&&<button className="local-model-text-button" type="button" onClick={()=>{setQuery('');setPublisher('');setShowUnknown(false);setShowLarge(false);}}>{shellText(locale, "Filter zurücksetzen", "Reset filters")}</button>}</div>
      <div className="local-model-search"><Search size={18} aria-hidden="true"/><label className="local-model-sr-only" htmlFor={searchId}>Modelle suchen</label>
        <input id={searchId} type="search" placeholder={shellText(locale, "Nach Modell oder Herausgeber suchen…", "Search by model or publisher…")} value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <nav className="local-model-category-tabs" role="tablist" aria-label="Modellart">
        {([['text','Text',MessageSquare],['image',shellText(locale, "Bilder", "Frames"),ImageIcon],['video','Video',Film]] as const).map(([id,label,Icon])=><button type="button" key={id}
          id={`${titleId}-${id}`} role="tab" aria-selected={category===id} aria-controls={`${titleId}-catalog`} tabIndex={category===id?0:-1}
          onClick={()=>setCategory(id)} onKeyDown={event=>{
            const tabs=['text','image','video'] as const;
            if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){
              event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(tabs.indexOf(id)+(event.key==='ArrowRight'?1:2))%3;
              setCategory(tabs[next]);document.getElementById(`${titleId}-${tabs[next]}`)?.focus();
            }
          }}><Icon size={15} aria-hidden="true"/>{label}<span>{models.filter(model=>storeModelCategory(model)===id).length}</span></button>)}
      </nav>
      <details className="local-model-filter-details"><summary><SlidersHorizontal size={15} aria-hidden="true"/> Filter und weitere Modelle <ChevronDown size={14} aria-hidden="true"/></summary>
        <div className="local-model-filters"><label>Herausgeber <select value={publisher} onChange={e=>setPublisher(e.target.value)}><option value="">Alle Herausgeber</option>{[...new Set(models.map(m=>m.publisher))].map(p=><option key={p}>{p}</option>)}</select></label>
          <label><input type="checkbox" checked={showLarge} onChange={e=>setShowLarge(e.target.checked)}/>{shellText(locale, "Auch nicht empfohlene und ungeprüfte Modelle anzeigen", "Also show models that are not recommended or not checked")}</label></div>
      </details>
      <p className="local-model-result-count" role="status" aria-live="polite">{busy&&pendingOperation==='view'?'Katalog wird geladen…':shellText(locale, `${visible.length} ${visible.length===1?'Modell':'Modelle'} angezeigt`, `${visible.length} ${visible.length===1?'model':'models'} shown`)}</p>
      {!visible.length&&!busy&&<div className="local-model-empty" data-empty-state={emptyState}>
        <div className="local-model-empty-icon" aria-hidden="true">{emptyState==='scan_missing'?<Cpu size={26}/>:<Search size={26}/>}</div>
        <h5>{emptyState==='scan_missing'?shellText(locale, "Dein PC ist noch nicht geprüft", "This PC has not been scanned yet"):emptyState==='filtered'?shellText(locale, "Kein Modell passt zu diesen Filtern", "No model matches these filters"):emptyState==='compatibility_unknown'?shellText(locale, "Kompatibilität noch ungeklärt", "Compatibility still unknown"):shellText(locale, "Der Katalog ist noch nicht verfügbar", "The catalog is not available yet")}</h5>
        <p>{emptyState==='scan_missing'?shellText(locale, "Scanne deine Hardware für eine Einschätzung. Du kannst vorher schon den Katalog ansehen.", "Scan your hardware for an estimate. You can browse the catalog first."):emptyState==='filtered'?shellText(locale, "Ändere die Suche oder zeige auch Modelle mit ungeklärter Kompatibilität an.", "Change the search, or also show models with unknown compatibility."):emptyState==='compatibility_unknown'?shellText(locale, "Die Hardware-, Lizenz- oder Runtime-Prüfung ist noch offen. Die Voraussetzungen findest du bei jedem Modell.", "Hardware, license, or runtime checks are still open. Each model lists its requirements."):shellText(locale, "Prüfe, ob der lokale Dienst bereit ist, und lade die Ansicht erneut.", "Check that the local service is ready, then reload this view.")}</p>
        {models.length>0?<button type="button" className="local-model-secondary" onClick={showAllModels}>Alle Modelle ansehen <ArrowRight size={15} aria-hidden="true"/></button>:<button type="button" disabled={!ready||busy} onClick={()=>void request({operation:'view'})}>Ansicht neu laden</button>}
      </div>}
      <p className="local-model-catalog-note">{shellText(locale, "Karten zeigen eine Speicherschätzung, keine bestätigte Ausführung. „Nur entdecken“ ist noch nicht direkt installierbar. Details per Klick.", "Cards show a memory estimate, not confirmed execution. “Discover only” cannot be installed directly yet. Click for details.")}</p>
      <div id={`${titleId}-catalog`} role="tabpanel" aria-labelledby={`${titleId}-${category}`} className="local-model-grid">{visible.map(card)}</div>
    </section>
    </>}
    {selected&&<section ref={detailRef} id={`${detailTitleId}-panel`} tabIndex={-1}
      onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();closeDetails();}}}
      className="local-model-details" aria-labelledby={detailTitleId}>
      <button type="button" className="local-model-back" onClick={closeDetails}><ArrowLeft size={16} aria-hidden="true"/>{shellText(locale, "Zur Übersicht", "Back to overview")}</button>
      <header className="local-model-detail-header"><span className="local-model-monogram" aria-hidden="true">{selected.publisher.slice(0,2).toUpperCase()}</span>
        <div><span className="local-model-eyebrow">{selected.publisher} · {storeModelCategory(selected)==='text'?'Text':storeModelCategory(selected)==='image'?shellText(locale, "Bilder", "Frames"):'Video'}</span>
          <h3 id={detailTitleId}>{selected.name}</h3><p>{selected.description}</p></div></header>
      {!!error&&<p className="local-model-notice local-model-error" role="alert">{error}</p>}
      <div className="local-model-detail-status"><span className="local-model-status">{storeExecutionLabel(selected)}</span>
        {selected.curation?.priority&&<span className="local-model-editorial">Redaktionell hervorgehoben</span>}</div>

      <div className="local-model-detail-layout">
        <div className="local-model-detail-main">
          {selected.curation?.innovation&&<section className="local-model-detail-section"><h4>Was dieses Modell besonders macht</h4><p>{selected.curation.innovation}</p></section>}
          <section className="local-model-detail-section"><h4>{shellText(locale, "Gut geeignet für", "Good for")}</h4>
            {(selected.curation?.useCases.length || selected.tasks.length)>0?<ul>{(selected.curation?.useCases.length?selected.curation.useCases:selected.tasks).map(item=><li key={item}>{item}</li>)}</ul>:<p>Noch keine Spezialisierung angegeben.</p>}
          </section>
          {!!selected.curation?.strengths.length&&<section className="local-model-detail-section"><h4>{shellText(locale, "Stärken", "Strengths")}</h4><ul>{selected.curation.strengths.map(item=><li key={item}>{item}</li>)}</ul></section>}
          <section className="local-model-detail-section"><h4>Grenzen</h4>
            {selected.curation?.limitations.length?<ul>{selected.curation.limitations.map(item=><li key={item}>{item}</li>)}</ul>:<p>{shellText(locale, "Für dieses Modell sind noch keine ergänzenden Einschränkungen dokumentiert.", "No extra limitations are documented for this model yet.")}</p>}
          </section>
          <section className="local-model-detail-section"><h4>{shellText(locale, "Lokale Ausführung", "Local execution")}</h4>
            <dl className="local-model-detail-facts"><div><dt>{shellText(locale, "Benötigte Software", "Required software")}</dt><dd>{selected.curation?.engine || shellText(locale, "Noch nicht angegeben", "Not specified yet")}</dd></div>
              <div><dt>{shellText(locale, "Ausführung in LastBrowser", "Execution in LastBrowser")}</dt><dd>{selected.runtimeReason || shellText(locale, "Noch nicht bestätigt", "Not confirmed yet")}</dd></div>
              <div><dt>Gewichtsvariante</dt><dd>{selected.quantization || selected.curation?.quantization || shellText(locale, "Noch nicht angegeben", "Not specified yet")}</dd></div>
              <div><dt>Empfohlener Kontext</dt><dd>{selected.recommendedContext?.toLocaleString('de-DE') || shellText(locale, "Noch nicht angegeben", "Not specified yet")}{selected.recommendedContext?' Tokens':''}</dd></div>
              <div><dt>Maximaler Modellkontext</dt><dd>{selected.contextLimit?.toLocaleString('de-DE') || shellText(locale, "Noch nicht angegeben", "Not specified yet")}{selected.contextLimit?' Tokens':''}</dd></div>
              <div><dt>Gesamtparameter</dt><dd>{selected.totalParameters===null?shellText(locale, "Noch nicht angegeben", "Not specified yet"):`${(selected.totalParameters/1e9).toLocaleString('de-DE',{maximumFractionDigits:2})} Mrd.`}</dd></div>
            </dl>
            <p className="local-model-catalog-note">{shellText(locale, "Eine unterstützte Modellfamilie oder ein passendes Speicherbudget bestätigt noch keine Ausführung in dieser LastBrowser-Version.", "A supported model family or a fitting memory budget does not yet confirm execution in this LastBrowser version.")}</p>
          </section>
          <section className="local-model-detail-section"><h4>Quellen & Lizenz</h4>
            <p><strong>{selected.licenseLabel}</strong>{selected.curation?.license && ` · ${selected.curation.license==='mit'?'MIT':'Apache 2.0'}`}</p>
            <div className="local-model-source-links">{[...new Set([storeSourceUrl(selected.curation?.sourceUrl),storeSourceUrl(selected.sourceUrl)].filter((url):url is string=>!!url))].map((url,index)=><a key={url} href={url} target="_blank" rel="noopener noreferrer">{index===0?'Modellkarte & Herausgeber':'Katalog-/Artefaktquelle'}<ArrowRight size={13} aria-hidden="true"/></a>)}</div>
            <p className="local-model-catalog-note">{shellText(locale, "Herausgeberangaben und redaktionelle Einschätzungen sind keine Messung auf deinem PC.", "Publisher notes and editorial judgments are not a measurement on your PC.")}</p>
            {selected.licenseText&&<details className="local-model-advanced"><summary>{shellText(locale, "Vollständige Herausgeber-Lizenz", "Full publisher license")}<ChevronDown size={14} aria-hidden="true"/></summary><pre>{selected.licenseText}</pre></details>}
          </section>
          <details className="local-model-advanced"><summary>Technische Voraussetzungen<ChevronDown size={14} aria-hidden="true"/></summary>
            <p>{selected.memoryPolicy}</p><p>Revision: {selected.revision || 'Noch nicht festgelegt'}</p>
            <ul>{selected.eligibility.reasons.map(reason=><li key={reason}>{storeReasonText(locale, reason)}</li>)}</ul>
            {selected.historicalEvidence&&<p>Historischer Vergleich: {selected.historicalEvidence.contentPassed}/{selected.historicalEvidence.tasks} Inhalt, {selected.historicalEvidence.strictPassed}/{selected.historicalEvidence.tasks} strikt. {selected.historicalEvidence.device}, {selected.historicalEvidence.configuration}. Kein Nachweis für dieses Downloadartefakt oder diesen PC.</p>}
          </details>
        </div>

        <aside className="local-model-detail-aside" aria-label="Speicherbedarf und Installation">
          <section className="local-model-detail-section local-model-estimates"><h4>Passt es auf meinen PC?</h4>
            <span className="local-model-estimate-label">{shellText(locale, "Schätzung · keine Messung", "Estimate · not a measurement")}</span>
            <dl className="local-model-detail-facts">
              <div><dt>Grafikkartenklasse</dt><dd>{selected.curation?`${selected.curation.recommendedGpuGiB} GiB`:shellText(locale, "Noch nicht angegeben", "Not specified yet")}</dd></div>
              <div><dt>{shellText(locale, "VRAM während der Nutzung", "VRAM while in use")}</dt><dd>{selected.curation?formatStoreGiBRange(selected.curation.estimatedVramGiB):bytes(selected.recommendedVramBytes)}</dd></div>
              <div><dt>{selected.curation?'RAM des gesamten PCs':'RAM empfohlen'}</dt><dd>{selected.curation?formatStoreGiBRange(selected.curation.estimatedRamGiB):bytes(selected.recommendedRamBytes)}</dd></div>
              <div><dt>{shellText(locale, "Paket / Gewichte · geschätzt", "Package / weights · estimated")}</dt><dd>{formatStoreGiBRange(selected.curation?.estimatedDownloadGiB)}</dd></div>
              {selected.downloadBytes!==null&&<div><dt>Konkreter Download</dt><dd>{bytes(selected.downloadBytes)}</dd></div>}
            </dl>
            <p className="local-model-catalog-note">{selected.curation?shellText(locale, "Die RAM-Spanne enthält bereits System und Browser. ", "The RAM range already includes the system and the browser. "):''}{storeModelCategory(selected)==='text'?shellText(locale, "VRAM-Schätzung: Text, 4K Kontext, eine Anfrage.", "VRAM estimate: text, 4K context, one request."):shellText(locale, "Die Medien-Schätzung gilt für die in den Grenzen beschriebene Konfiguration.", "The media estimate applies to the configuration described by these limits.")} Für die Grafikkarte bleiben mindestens 25 % Reserve eingeplant.</p>
            <p className="local-model-fit">{storeHardwareRecommendation(selected,view?.hardware).placement==='cpu'?shellText(locale, "Prozessor und freier Speicher wurden für diese Ausführung geprüft", "CPU and free memory were checked for this run"):!hardware.scanned?shellText(locale, "Hardware noch nicht geprüft", "Hardware not scanned yet"):assessStoreGpuEstimate(selected,view?.hardware)==='outside'?shellText(locale, "Außerhalb der erfassten Speicherklasse", "Outside the measured memory class"):assessStoreGpuEstimate(selected,view?.hardware)==='within'?shellText(locale, "Speicherklasse passt zur Schätzung · Ausführung noch separat prüfen", "Memory class fits the estimate · execution still needs a separate check"):shellText(locale, "Keine ausreichenden Messwerte für eine Zuordnung", "Not enough measurements to classify this")}</p>
          </section>

          <section className="local-model-detail-section local-model-install-panel"><h4>{selected.installed?'Deine Installation':'Auf diesem PC nutzen'}</h4>
            {!selected.installed&&!selectedActions?.download&&<p className="local-model-notice">{shellText(locale, "Zum Entdecken verfügbar. Für die Installation müssen Download, Lizenz und verfügbare Ausführung bestätigt sein.", "Available to explore. Install requires a confirmed download, license, and runnable build.")}</p>}
            {!!selectedActions?.reasons.length&&<details className="local-model-advanced"><summary>{shellText(locale, 'Was noch fehlt', 'What is still missing')}<ChevronDown size={14} aria-hidden="true"/></summary><ul>{selectedActions.reasons.map(reason=><li key={reason}>{storeReasonText(locale, reason)}</li>)}</ul></details>}
            {selectedActions?.download&&selected.licenseDigest&&<>
              <label><input type="checkbox" checked={consent===storeConsentKey(selected)} onChange={event=>setConsent(event.target.checked?storeConsentKey(selected):'')}/>Herausgeber-Lizenz akzeptieren</label>
              <button className="local-model-primary" type="button" disabled={!ready||busy||running||consent!==storeConsentKey(selected)}
                onClick={()=>void request({operation:'install',modelId:selected.id,licenseDigest:selected.licenseDigest!,requestId:newIndependentRequestId()})}>Installieren · {bytes(selected.downloadBytes)}</button>
              <button type="button" disabled={!ready||busy||running||consent!==storeConsentKey(selected)}
                onClick={()=>void request({operation:'importModel',modelId:selected.id,licenseDigest:selected.licenseDigest!,requestId:newIndependentRequestId()})}>Vorhandene gepinnte GGUF importieren</button>
            </>}
            {selected.installed&&<>
              <label>{shellText(locale, "Gerätetest", "Device test")}<select value={mode} onChange={event=>setMode(event.target.value as 'quick'|'standard')}><option value="quick">{shellText(locale, "Kurztest", "Quick test")}</option><option value="standard">{shellText(locale, "Ausführlicher Test", "Detailed test")}</option></select></label>
              {!!selected.execution?.availableBackends?.includes('vulkan')&&<label>{shellText(locale, "Ausführen mit", "Run with")}<select value={effectiveBenchmarkBackend} onChange={event=>setBenchmarkBackend(event.target.value as 'cpu'|'vulkan')}>{benchmarkBackends.map(backend=><option key={backend} value={backend}>{backend==='cpu'?'Prozessor':shellText(locale, "Grafikkarte", "Graphics card")}</option>)}</select></label>}
              <p className="local-model-catalog-note">Der Test prüft dieses Modell auf deinem PC. {selectedActions?.kind==='text'?'4K Kontext, eine Anfrage gleichzeitig.':shellText(locale, "Nur die für dieses Modell freigegebene Bild- oder Videokonfiguration.", "Only the image or video configuration approved for this model.")}</p>
              {selected.execution?.media?.requiredInputs?.length ? <p>{shellText(locale, "Wähle unten die benötigten Dateien aus und starte damit den Gerätetest.", "Choose the required files below, then start the device test.")}</p> : <button type="button" disabled={!ready||busy||running||!selectedActions?.benchmark} onClick={()=>void request({operation:'benchmark',modelId:selected.id,mode,backend:effectiveBenchmarkBackend,requestId:newIndependentRequestId()})}>Auf diesem PC testen</button>}
              {selectedActions?.kind==='text'&&<button type="button" disabled={!ready||busy||running||!selectedActions.activate} onClick={()=>void request({operation:'activate',modelId:selected.id})}>{shellText(locale, "Für lokalen Chat aktivieren", "Enable for local chat")}</button>}
              <button type="button" disabled={!ready||busy||running} onClick={()=>void request({operation:'remove',modelId:selected.id})}>Eigene Installation entfernen</button>
            </>}
            {selected.installed&&selectedActions?.kind!=='text'&&(selectedActions?.execute||selectedActions?.benchmark)&&<LocalModelMediaForm key={JSON.stringify([scopeKey,selected.id,selected.revision,selected.execution?.engineId,selected.execution?.media])}
              model={selected} request={request} disabled={!ready||busy||running} canGenerate={selectedActions.execute}
              canBenchmark={!!selected.execution?.media?.requiredInputs?.length&&selectedActions.benchmark} benchmarkMode={mode} backend={effectiveBenchmarkBackend}/>}
          </section>
        </aside>
      </div>
    </section>}
    {!!view?.jobs.length&&<section className="local-model-jobs"><h4>{shellText(locale, "Aufträge", "Jobs")}</h4>{view.jobs.map(j=><article className="local-model-job" key={j.id}><p>{models.find(model=>model.id===j.modelId)?.name??j.modelId}: {storeJobLabel(j.state)} · {j.operation==='install'?bytes(j.downloadedBytes):`${j.progress}/${j.total}`} {j.error??''}</p>
      {active(j.state)&&<progress aria-label={`Fortschritt ${j.modelId}`} value={j.operation==='install'?(models.find(model=>model.id===j.modelId)?.downloadBytes?j.downloadedBytes:undefined):(j.total>0?j.progress:undefined)} max={j.operation==='install'?(models.find(model=>model.id===j.modelId)?.downloadBytes??undefined):(j.total>0?j.total:undefined)}/>}

      {active(j.state)&&<button type="button" onClick={()=>void request({operation:'cancel',jobId:j.id})}>{shellText(locale, "Stoppen", "Stop")}</button>}
      {!!j.result?.assets.length&&<LocalModelMediaResult key={`${scopeKey}:${j.id}`} job={j} request={request}/>}</article>)}</section>}
    {!view?.readOnly&&<details className="local-model-results" open={Boolean(view?.history.length)}><summary>Ergebnisse und Vergleich <span>{view?.history.length??0} Läufe</span><ChevronDown size={15} aria-hidden="true"/></summary><div className="local-model-results-body"><p>{shellText(locale, "Benchmarks verwenden synthetische Aufgaben und führen keine Tools aus.", "Benchmarks use synthetic tasks and do not run tools.")}</p><button type="button" onClick={()=>importInput.current?.click()}>Ergebnisse importieren</button>
      <input ref={importInput} hidden type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];if(file)void importFile(file);e.target.value='';}}/>
      <div className="local-model-comparison"><table><thead><tr><th>Modell / Lauf</th><th>Inhalt</th><th>Format</th><th>Technik</th><th>Median</th><th>Empfehlung</th><th>Aktionen</th></tr></thead>
        <tbody>{view?.history.map(r=><tr key={r.id}><td>{r.modelId}<br/>{r.mode} · {r.origin} · {new Date(r.createdAt*1000).toLocaleString()}</td>
          <td>{r.counts.content}/{r.sampleCount}</td><td>{r.counts.format}/{r.sampleCount}</td><td>{r.counts.technical}/{r.sampleCount}</td><td>{r.medianResponseMs===null?'Unbekannt':`${Math.round(r.medianResponseMs)} ms`}</td>
          <td>{r.recommendation==='chat_candidate'?shellText(locale, "Chat-Kandidat", "Chat candidate"):r.origin==='imported'?shellText(locale, "Fremder Gerätebeleg", "Result from another device"):shellText(locale, "Keine Empfehlung", "No recommendation")}{r.unsafeToolOrSecurityFailure?shellText(locale, " · Tool/Sicherheitsfehler", " · tool/security failure"):''}</td>
          <td><button type="button" onClick={()=>void downloadExport(r.id)}>Export</button><button type="button" onClick={()=>void request({operation:'export',receiptId:r.id}).then(setReceipt)}>Antworten</button>
            <button type="button" onClick={()=>void request({operation:'deleteHistory',receiptId:r.id})}>{shellText(locale, "Löschen", "Delete")}</button></td></tr>)}</tbody></table></div>
      {receipt!==null&&<details open><summary>{shellText(locale, "Unveränderte Antworten und Bewertung", "Unchanged replies and score")}</summary><pre>{JSON.stringify(receipt,null,2)}</pre><button type="button" onClick={()=>setReceipt(null)}>{shellText(locale, "Schließen", "Close")}</button></details>}
      <p>{shellText(locale, "Importe bestätigen diesen PC nicht. Keine automatische Agentenfreigabe. Tokens/s, erster sichtbarer Token und Speicherpeak bleiben ohne entsprechende Messung unbekannt.", "Imports do not confirm this PC. There is no automatic agent approval. Tokens/s, time to first token, and peak memory stay unknown without that measurement.")}</p>
    </div></details>}
    {chosen&&chosenActions?.kind==='text'&&<section className="local-model-chat"><h4>Lokaler Chat · {chosen.name}</h4><p>Deine Nachricht bleibt auf diesem PC. Es werden keine Cloud-Modelle oder Werkzeuge verwendet.</p>
      <textarea maxLength={8192} value={chatText} onChange={e=>setChatText(e.target.value)} aria-label="Lokale Nachricht"/>
      <button type="button" disabled={!ready||chatBusy||!chosenActions.execute||!chatText.trim()} onClick={()=>void sendLocalChat()}>Senden</button>
      {chatBusy&&<button type="button" onClick={()=>void request({operation:'stopChat'})}>{shellText(locale, "Stoppen", "Stop")}</button>}<pre>{chatResult}</pre></section>}
    <details className="local-model-policy"><summary>{shellText(locale, "Lizenz, Messgrenzen und lokale Ausführung", "License, measurement limits, and local execution")}<ChevronDown size={14} aria-hidden="true"/></summary><p>{shellText(locale, "LastBrowser erhebt keine Lizenzgebühr nach Modellgröße. Installation und Ausführung hängen weiterhin von Herausgeberlizenz, Hardwareeignung und qualifizierter Runtime ab.", "LastBrowser does not charge a license fee by model size. Install and execution still depend on the publisher license, hardware fit, and a qualified runtime.")}</p><p>{shellText(locale, "Größenbedarf gilt für konkrete Gewichte und 4K Kontext. Unbekannter GPU-Support ist keine VRAM-Empfehlung.", "Size applies to specific weights and 4K context. Unknown GPU support is not a VRAM recommendation.")}</p></details>
  </section>;
}
