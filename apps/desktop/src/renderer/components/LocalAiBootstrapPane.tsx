import React,{useEffect,useRef,useState} from 'react';
import { ExternalLink,Loader2 } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';
import { IndependentAssistantClient } from '../independent-assistant-client.js';
import { newIndependentRequestId,type LocalAiBootstrapRequest,type LocalAiBootstrapStatus } from '../independent-contracts.js';
import type { DesktopLocaleId } from '../i18n/keys.js';
import { localAiBootstrapPanelLabel,retryRetryableOnce } from './local-ai-bootstrap-state.js';
import './local-ai-bootstrap.css';

const copy:Record<DesktopLocaleId,Readonly<Record<string,string>>>= {
  en:{title:'Optional local router download',description:'LastBrowser downloads one small router in the background. The files alone do not make local inference available.',loading:'Checking download status…',pending:'Download queued',downloading:'Downloading',verifying:'Verifying downloaded files…',cancelling:'Cancelling download…',complete:'Router files verified',cancelled:'Download cancelled',offline:'Download paused while offline',failed:'Download failed',retry:'Retry',cancel:'Cancel download',skip:'Hide this setup',license:'LFM Open License v1.0',commercial:'Commercial use is restricted for companies with annual revenue of USD 10 million or more.',verified:'Verified',downloaded:'Downloaded',unavailable:'Download status is unavailable. Check your connection and retry.',start:'Start download'},
  de:{title:'Optionaler Download des lokalen Routers',description:'LastBrowser lädt einen kleinen Router im Hintergrund. Die Dateien allein machen lokale Inferenz noch nicht verfügbar.',loading:'Downloadstatus wird geladen…',pending:'Download ist vorgemerkt',downloading:'Download läuft',verifying:'Dateien werden geprüft…',cancelling:'Download wird abgebrochen…',complete:'Routerdateien geprüft',cancelled:'Download abgebrochen',offline:'Download pausiert, solange keine Verbindung besteht',failed:'Download fehlgeschlagen',retry:'Erneut versuchen',cancel:'Download abbrechen',skip:'Einrichtung ausblenden',license:'LFM Open License v1.0',commercial:'Kommerzielle Nutzung ist für Unternehmen ab 10 Millionen US-Dollar Jahresumsatz eingeschränkt.',verified:'Geprüft',downloaded:'Heruntergeladen',unavailable:'Downloadstatus nicht verfügbar. Prüfe die Verbindung und versuche es erneut.',start:'Download starten'},
  it:{title:'Download facoltativo del router locale',description:'LastBrowser scarica un piccolo router in background. I file da soli non rendono disponibile l’inferenza locale.',pending:'Preparazione del download…',downloading:'Download in corso',verifying:'Verifica dei file…',cancelling:'Annullamento del download…',complete:'File del router verificati',cancelled:'Download annullato',offline:'Download in pausa senza connessione',failed:'Download non riuscito',retry:'Riprova il download',cancel:'Annulla download',skip:'Nascondi questa configurazione',license:'LFM Open License v1.0',commercial:'L’uso commerciale è limitato per aziende con ricavi annui pari o superiori a 10 milioni di USD.',verified:'Verificati',downloaded:'Scaricati',unavailable:'Impossibile leggere lo stato. Controlla la connessione e riprova.',start:'Avvia download'},
  es:{title:'Descarga opcional del enrutador local',description:'LastBrowser descarga un pequeño enrutador en segundo plano. Los archivos por sí solos no habilitan la inferencia local.',pending:'Preparando descarga…',downloading:'Descargando',verifying:'Verificando archivos…',cancelling:'Cancelando descarga…',complete:'Archivos del enrutador verificados',cancelled:'Descarga cancelada',offline:'Descarga en pausa sin conexión',failed:'La descarga falló',retry:'Reintentar descarga',cancel:'Cancelar descarga',skip:'Ocultar esta configuración',license:'LFM Open License v1.0',commercial:'El uso comercial está restringido para empresas con ingresos anuales de 10 millones de USD o más.',verified:'Verificados',downloaded:'Descargados',unavailable:'No se pudo leer el estado. Comprueba la conexión e inténtalo de nuevo.',start:'Iniciar descarga'},
  fr:{title:'Téléchargement facultatif du routeur local',description:'LastBrowser télécharge un petit routeur en arrière-plan. Les fichiers seuls ne rendent pas l’inférence locale disponible.',pending:'Préparation du téléchargement…',downloading:'Téléchargement',verifying:'Vérification des fichiers…',cancelling:'Annulation du téléchargement…',complete:'Fichiers du routeur vérifiés',cancelled:'Téléchargement annulé',offline:'Téléchargement en pause hors ligne',failed:'Échec du téléchargement',retry:'Réessayer le téléchargement',cancel:'Annuler le téléchargement',skip:'Masquer cette configuration',license:'LFM Open License v1.0',commercial:'L’usage commercial est limité pour les entreprises dont le chiffre d’affaires annuel atteint 10 millions USD.',verified:'Vérifiés',downloaded:'Téléchargés',unavailable:'Impossible de lire le statut. Vérifiez la connexion et réessayez.',start:'Démarrer le téléchargement'},
  'pt-BR':{title:'Download opcional do roteador local',description:'O LastBrowser baixa um pequeno roteador em segundo plano. Os arquivos sozinhos não habilitam a inferência local.',pending:'Preparando download…',downloading:'Baixando',verifying:'Verificando arquivos…',cancelling:'Cancelando download…',complete:'Arquivos do roteador verificados',cancelled:'Download cancelado',offline:'Download pausado sem conexão',failed:'Falha no download',retry:'Tentar download novamente',cancel:'Cancelar download',skip:'Ocultar esta configuração',license:'LFM Open License v1.0',commercial:'O uso comercial é restrito para empresas com receita anual de USD 10 milhões ou mais.',verified:'Verificados',downloaded:'Baixados',unavailable:'Não foi possível ler o status. Verifique a conexão e tente novamente.',start:'Iniciar download'},
  ru:{title:'Необязательная загрузка локального роутера',description:'LastBrowser загружает небольшой роутер в фоне. Сами файлы не обеспечивают локальный вывод.',pending:'Подготовка загрузки…',downloading:'Загрузка',verifying:'Проверка файлов…',cancelling:'Отмена загрузки…',complete:'Файлы роутера проверены',cancelled:'Загрузка отменена',offline:'Загрузка приостановлена без сети',failed:'Ошибка загрузки',retry:'Повторить загрузку',cancel:'Отменить загрузку',skip:'Скрыть эту настройку',license:'LFM Open License v1.0',commercial:'Коммерческое использование ограничено для компаний с годовой выручкой от 10 млн долларов США.',verified:'Проверено',downloaded:'Загружено',unavailable:'Не удалось прочитать статус. Проверьте соединение и повторите попытку.',start:'Начать загрузку'},
  ja:{title:'ローカルルーターの任意ダウンロード',description:'LastBrowser は小さなルーターをバックグラウンドでダウンロードします。ファイルだけではローカル推論を利用できません。',pending:'ダウンロードを準備中…',downloading:'ダウンロード中',verifying:'ファイルを検証中…',cancelling:'ダウンロードをキャンセル中…',complete:'ルーターファイルを検証しました',cancelled:'ダウンロードをキャンセルしました',offline:'オフラインのため一時停止中',failed:'ダウンロードに失敗しました',retry:'ダウンロードを再試行',cancel:'ダウンロードをキャンセル',skip:'この設定を閉じる',license:'LFM Open License v1.0',commercial:'年間売上高が 1,000 万米ドル以上の企業では商用利用に制限があります。',verified:'検証済み',downloaded:'ダウンロード済み',unavailable:'状態を取得できません。接続を確認して再試行してください。',start:'ダウンロードを開始'}
};
const sharedRouterCopy:Record<DesktopLocaleId,Readonly<{title:string;description:string}>>={
  en:{title:'App-wide optional router download',description:'Shared by the app, not tied to this Space. Router files alone do not enable local inference.'},
  de:{title:'Optionaler Router-Download für die ganze App',description:'Gilt für die ganze App und ist nicht an diesen Space gebunden. Routerdateien allein ermöglichen noch keine lokale Inferenz.'},
  it:{title:'Download facoltativo del router per tutta l’app',description:'Condiviso nell’app e non legato a questo Space. I file del router da soli non abilitano l’inferenza locale.'},
  es:{title:'Descarga opcional del enrutador para toda la aplicación',description:'Se comparte en toda la aplicación y no está vinculada a este espacio. Sus archivos no habilitan la inferencia local.'},
  fr:{title:'Téléchargement facultatif du routeur pour toute l’application',description:'Partagé dans toute l’application et non lié à cet espace. Ses fichiers seuls ne permettent pas l’inférence locale.'},
  'pt-BR':{title:'Download opcional do roteador para todo o app',description:'Compartilhado no aplicativo e não vinculado a este Space. Os arquivos sozinhos não habilitam a inferência local.'},
  ru:{title:'Необязательная загрузка маршрутизатора для всего приложения',description:'Общий для всего приложения и не привязан к этому пространству. Одни файлы не включают локальный вывод.'},
  ja:{title:'アプリ共通の任意ルーターダウンロード',description:'アプリ全体で共有され、この Space 固有ではありません。ファイルだけではローカル推論は有効になりません。'}
};
const active=new Set(['pending','downloading','verifying','cancelling']);
const MiB=1024*1024;
const loadingStatus:Record<DesktopLocaleId,string>={en:'Checking download status…',de:'Downloadstatus wird geladen…',it:'Caricamento dello stato del download…',es:'Consultando el estado de la descarga…',fr:'Vérification de l’état du téléchargement…','pt-BR':'Verificando o status do download…',ru:'Проверка состояния загрузки…',ja:'ダウンロード状況を確認中…'};

export function LocalAiBootstrapPane({compact=false,keepVisible=false}:{compact?:boolean;keepVisible?:boolean}):React.JSX.Element|null{
  const {locale}=useDesktopI18n(),words=copy[locale],client=useRef<IndependentAssistantClient|null>(null);
  const [status,setStatus]=useState<LocalAiBootstrapStatus|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[hidden,setHidden]=useState(false);
  const mounted=useRef(true),lock=useRef(false);
  if(!client.current)client.current=new IndependentAssistantClient(window.lastbrowser.independent);
  const bytes=(value:number)=>`${new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(value/MiB)} MiB`;
  async function request(payload:LocalAiBootstrapRequest,retryTransient=false){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{const send=()=>client.current!.request({schemaVersion:1,operation:'localAiBootstrap',payload});const answer=retryTransient?await retryRetryableOnce(send):await send();
      if(!mounted.current)return;if(!answer.ok){if(payload.action==='status')setStatus(null);setError(words.unavailable);return;}setStatus(answer.value);
    }catch{if(mounted.current){if(payload.action==='status')setStatus(null);setError(words.unavailable);}}finally{lock.current=false;if(mounted.current)setBusy(false);}
  }
  useEffect(()=>{mounted.current=true;if(!keepVisible)try{if(window.localStorage.getItem('lastbrowser.localAiBootstrap.dismissed.v1')==='1')setHidden(true);}catch{}void request({action:'status'},true);return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(!status||!active.has(status.state))return;const timer=window.setInterval(()=>{if(!lock.current)void request({action:'status'});},1200);return()=>window.clearInterval(timer);},[status?.state]);
  if(hidden)return null;
  const progress=status?Math.min(100,Math.floor(status.downloadedBytes/status.totalBytes*100)):0;
  const stateLabel=localAiBootstrapPanelLabel(status?.state??null,busy,error,{loading:loadingStatus[locale],unavailable:words.unavailable,states:words});
  const panelTitle=keepVisible?sharedRouterCopy[locale].title:words.title,panelDescription=keepVisible?sharedRouterCopy[locale].description:words.description;
  if(compact)return <section className="local-ai-bootstrap local-ai-bootstrap-compact" aria-labelledby="local-ai-bootstrap-title" data-global-router-status={keepVisible?'true':undefined}>
    <div className="local-ai-bootstrap-heading"><div><h4 id="local-ai-bootstrap-title">{panelTitle}</h4><p>{panelDescription}</p></div>{busy&&<Loader2 size={16} className="spin" aria-hidden="true"/>}</div>
    {error&&<p role="alert">{error}</p>}
    <div className="local-ai-download-row"><span role="status" aria-live="polite">{stateLabel}{status?.state==='downloading'?` · ${bytes(status.downloadedBytes)} / ${bytes(status.totalBytes)}`:''}</span>
      {status&&<progress max={status.totalBytes} value={status.downloadedBytes} aria-label={stateLabel}/>}</div>
    <details><summary>{words.license}</summary>{status&&<p className="local-ai-bootstrap-license"><a href={status.licenseUrl} target="_blank" rel="noreferrer">{words.license} <ExternalLink size={12}/></a><span>{words.commercial}</span></p>}</details>
    <div className="local-ai-bootstrap-actions">
      {status&&active.has(status.state)&&status.jobId&&status.state!=='cancelling'&&<button type="button" disabled={busy} onClick={()=>void request({action:'cancel',jobId:status.jobId!,clientRequestId:newIndependentRequestId()})}>{words.cancel}</button>}
      {status&&['offline','failed','cancelled'].includes(status.state)&&<button type="button" disabled={busy} onClick={()=>void request({action:'retry',clientRequestId:newIndependentRequestId()})}>{words.retry}</button>}
      {status?.state==='idle'&&<button type="button" disabled={busy} onClick={()=>void request({action:'start',clientRequestId:newIndependentRequestId()})}>{words.start}</button>}
      {error&&!status&&<button type="button" disabled={busy} onClick={()=>void request({action:'status'})}>{words.retry}</button>}
      {!keepVisible&&<button type="button" disabled={busy} onClick={()=>{try{window.localStorage.setItem('lastbrowser.localAiBootstrap.dismissed.v1','1');}catch{}setHidden(true);}}>{words.skip}</button>}
    </div>
  </section>;
  return <section className="local-ai-bootstrap" aria-labelledby="local-ai-bootstrap-title">
    <div className="local-ai-bootstrap-heading"><div><h3 id="local-ai-bootstrap-title">{panelTitle}</h3><p>{panelDescription}</p></div>{busy&&<Loader2 size={16} className="spin" aria-hidden="true"/>}</div>
    {error&&<p role="alert">{error}</p>}
    <p role="status" aria-live="polite">{stateLabel}{status?.state==='downloading'?` · ${bytes(status.downloadedBytes)} / ${bytes(status.totalBytes)}`:''}</p>
    {status&&<div className="local-ai-bootstrap-progress"><progress max={status.totalBytes} value={status.downloadedBytes} aria-label={stateLabel}/>
      <span>{words.downloaded}: {bytes(status.downloadedBytes)} · {words.verified}: {bytes(status.verifiedBytes)}</span></div>}
    {status&&<p className="local-ai-bootstrap-license"><a href={status.licenseUrl} target="_blank" rel="noreferrer">{words.license} <ExternalLink size={12}/></a><span>{words.commercial}</span></p>}
    <div className="local-ai-bootstrap-actions">
      {status&&active.has(status.state)&&status.jobId&&status.state!=='cancelling'&&<button type="button" disabled={busy} onClick={()=>void request({action:'cancel',jobId:status.jobId!,clientRequestId:newIndependentRequestId()})}>{words.cancel}</button>}
      {status&&['offline','failed','cancelled'].includes(status.state)&&<button type="button" disabled={busy} onClick={()=>void request({action:'retry',clientRequestId:newIndependentRequestId()})}>{words.retry}</button>}
      {status?.state==='idle'&&<button type="button" disabled={busy} onClick={()=>void request({action:'start',clientRequestId:newIndependentRequestId()})}>{words.start}</button>}
      {error&&!status&&<button type="button" disabled={busy} onClick={()=>void request({action:'status'})}>{words.retry}</button>}
      {!keepVisible&&<button type="button" disabled={busy} onClick={()=>{try{window.localStorage.setItem('lastbrowser.localAiBootstrap.dismissed.v1','1');}catch{}setHidden(true);}}>{words.skip}</button>}
    </div>
  </section>;
}
