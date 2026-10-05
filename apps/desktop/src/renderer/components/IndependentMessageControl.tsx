import { useEffect, useRef, useState } from 'react';
import type { DesktopLocaleId } from '../i18n/keys.js';
import { useDesktopI18n } from '../i18n.js';
import { assistantScopeKey, newIndependentRequestId, sameAssistantScope, type ActivitySnapshot, type AssistantMessage,
  type AssistantSnapshot, type AssistantControlCandidate } from '../independent-contracts.js';
import type { IndependentAssistantController } from '../independent-assistant-controller.js';
import { IndependentControlChoice, type ControlChoiceRequest } from './IndependentControlChoice.js';

type ControlCopy = Readonly<{ heading:string; explanation:string; choose:string; runId:string; state:string; completed:string;
  rejected:string; unknown:string; unsupported_manager:string; processing:string }>;
export const assistantControlCopy: Record<DesktopLocaleId,ControlCopy> = {
  en:{heading:'Choose the task',explanation:'Which of these actual tasks do you mean?',choose:'Control this task',runId:'Run',state:'Status',completed:'Control accepted. Current activity shows the resulting status.',rejected:'The task or its permissions changed. Check current activity and send a new request.',unknown:'Execution could not be confirmed. The command will not be resent. Check current activity.',unsupported_manager:'Safe task control is unavailable. No command was sent.',processing:'Checking the control request…'},
  de:{heading:'Auftrag auswählen',explanation:'Welchen dieser tatsächlichen Aufträge meinst du?',choose:'Diesen Auftrag steuern',runId:'Lauf',state:'Status',completed:'Steuerbefehl angenommen. Die aktuelle Aktivität zeigt den resultierenden Zustand.',rejected:'Auftrag oder Rechte haben sich geändert. Prüfe die aktuelle Aktivität und sende einen neuen Auftrag.',unknown:'Die Ausführung konnte nicht bestätigt werden. Der Befehl wird nicht erneut gesendet. Prüfe die aktuelle Aktivität.',unsupported_manager:'Die sichere Auftragssteuerung ist nicht verfügbar. Kein Befehl wurde gesendet.',processing:'Steuerauftrag wird geprüft…'},
  es:{heading:'Elegir la tarea',explanation:'¿A cuál de estas tareas reales te refieres?',choose:'Controlar esta tarea',runId:'Ejecución',state:'Estado',completed:'Control aceptado. La actividad actual muestra el estado resultante.',rejected:'La tarea o sus permisos cambiaron. Revisa la actividad actual y envía una nueva solicitud.',unknown:'No se pudo confirmar la ejecución. El comando no se reenviará. Revisa la actividad actual.',unsupported_manager:'El control seguro de tareas no está disponible. No se envió ningún comando.',processing:'Comprobando la solicitud de control…'},
  fr:{heading:'Choisir la tâche',explanation:'Laquelle de ces tâches réelles désignes-tu ?',choose:'Contrôler cette tâche',runId:'Exécution',state:'État',completed:'Commande acceptée. L’activité actuelle indique l’état résultant.',rejected:'La tâche ou ses autorisations ont changé. Consulte l’activité actuelle et envoie une nouvelle demande.',unknown:'L’exécution n’a pas pu être confirmée. La commande ne sera pas renvoyée. Consulte l’activité actuelle.',unsupported_manager:'Le contrôle sécurisé des tâches est indisponible. Aucune commande n’a été envoyée.',processing:'Vérification de la demande de contrôle…'},
  it:{heading:'Scegli l’attività',explanation:'A quale di queste attività reali ti riferisci?',choose:'Controlla questa attività',runId:'Esecuzione',state:'Stato',completed:'Comando accettato. L’attività corrente mostra lo stato risultante.',rejected:'L’attività o le autorizzazioni sono cambiate. Controlla l’attività corrente e invia una nuova richiesta.',unknown:'Non è stato possibile confermare l’esecuzione. Il comando non verrà reinviato. Controlla l’attività corrente.',unsupported_manager:'Il controllo sicuro delle attività non è disponibile. Nessun comando è stato inviato.',processing:'Verifica della richiesta di controllo…'},
  'pt-BR':{heading:'Escolher a tarefa',explanation:'A qual destas tarefas reais você se refere?',choose:'Controlar esta tarefa',runId:'Execução',state:'Estado',completed:'Comando aceito. A atividade atual mostra o estado resultante.',rejected:'A tarefa ou suas permissões mudaram. Confira a atividade atual e envie uma nova solicitação.',unknown:'Não foi possível confirmar a execução. O comando não será reenviado. Confira a atividade atual.',unsupported_manager:'O controle seguro de tarefas está indisponível. Nenhum comando foi enviado.',processing:'Verificando a solicitação de controle…'},
  ru:{heading:'Выбрать задачу',explanation:'Какую из этих реальных задач вы имеете в виду?',choose:'Управлять этой задачей',runId:'Запуск',state:'Состояние',completed:'Команда принята. Текущее состояние видно в активности.',rejected:'Задача или её разрешения изменились. Проверьте текущую активность и отправьте новый запрос.',unknown:'Выполнение не удалось подтвердить. Команда не будет отправлена повторно. Проверьте текущую активность.',unsupported_manager:'Безопасное управление задачами недоступно. Команда не была отправлена.',processing:'Проверка команды управления…'},
  ja:{heading:'作業を選択',explanation:'実際に実行中のどの作業を指していますか？',choose:'この作業を操作',runId:'実行',state:'状態',completed:'操作を受け付けました。最新の状態はアクティビティで確認できます。',rejected:'作業または権限が変更されました。現在のアクティビティを確認し、新しい依頼を送信してください。',unknown:'実行を確認できませんでした。コマンドは再送されません。現在のアクティビティを確認してください。',unsupported_manager:'安全な作業操作を利用できません。コマンドは送信されていません。',processing:'操作依頼を確認しています…'},
};

export function hasHumanControlOrigin(message: AssistantMessage, snapshot: AssistantSnapshot): boolean {
  const resolution = message.controlResolution;
  return !!resolution && message.role === 'assistant' && message.turnId === resolution.humanTurnId
    && sameAssistantScope(resolution.scope,snapshot.scope)
    && snapshot.messages.some(source=>source.id===resolution.sourceMessageId && source.role==='user'
      && source.turnId===resolution.humanTurnId && source.content===resolution.originalText);
}
export function isCurrentControlCandidate(candidate: AssistantControlCandidate, activity: ActivitySnapshot | null | undefined): boolean {
  return activity?.sourceState==='live' && activity.runs.some(run=>run.runId===candidate.runId && run.dispatchId===candidate.dispatchId
    && run.stateRevision===candidate.expectedRevision && run.controlEpoch===candidate.controlEpoch && run.state===candidate.state);
}

export function IndependentMessageControl({ message,snapshot,activity,controller,busy }: Readonly<{
  message:AssistantMessage; snapshot:AssistantSnapshot; activity:ActivitySnapshot|null|undefined; controller:IndependentAssistantController; busy:boolean;
}>) {
  const {locale,t}=useDesktopI18n(), copy=assistantControlCopy[locale];
  const [submitting,setSubmitting]=useState(false), [error,setError]=useState(false);
  const locked=useRef(false), current=useRef(true), retry=useRef<{signature:string;requestId:string}|null>(null);
  const scopeKey=assistantScopeKey(snapshot.scope);
  useEffect(()=>{current.current=true;return()=>{current.current=false;};},[scopeKey]);
  const resolution=message.controlResolution;
  if(!resolution || resolution.kind==='conversation' || !hasHumanControlOrigin(message,snapshot)) return null;
  const sameActivity=!!activity && sameAssistantScope(activity.scope,snapshot.scope);
  const stale=!sameActivity || resolution.candidates.some(candidate=>!isCurrentControlCandidate(candidate,activity));
  async function choose(choice:ControlChoiceRequest) {
    const candidate=resolution?.candidates.find(candidate=>candidate.runId===choice.candidate.runId && candidate.expectedRevision===choice.candidate.expectedRevision
      && candidate.controlEpoch===choice.candidate.controlEpoch && candidate.dispatchId===choice.candidate.dispatchId);
    if(!resolution || !sameAssistantScope(choice.scope,snapshot.scope) || choice.humanTurnId!==resolution.humanTurnId
      || choice.originalText!==resolution.originalText || choice.command!==resolution.command || choice.requestDigest!==resolution.requestDigest
      || !candidate || !sameActivity || !isCurrentControlCandidate(candidate,activity) || locked.current || busy || message.pending
      || message.controlStatus!=='choose_target') return;
    locked.current=true;setSubmitting(true);setError(false);
    const signature=JSON.stringify([scopeKey,resolution.humanTurnId,resolution.requestDigest,choice.candidate.runId]);
    if(retry.current?.signature!==signature) retry.current={signature,requestId:newIndependentRequestId()};
    try {
      const result=await controller.chooseControl(snapshot.scope,{humanTurnId:resolution.humanTurnId,sourceMessageId:resolution.sourceMessageId,
        runId:choice.candidate.runId,expectedRevision:choice.candidate.expectedRevision,controlEpoch:choice.candidate.controlEpoch,
        requestDigest:resolution.requestDigest,clientRequestId:retry.current.requestId});
      if(current.current)setError(!result.ok);
      await controller.poll(snapshot.scope);
    } finally {locked.current=false;if(current.current)setSubmitting(false);}
  }
  const status=message.controlStatus;
  return <section className="independent-message-control" aria-label={copy.heading}>
    {message.pending || !status ? <p role="status">{copy.processing}</p> : status!=='choose_target' && <p role="status">{copy[status]}</p>}
    {status==='choose_target' && resolution.kind==='clarification' && resolution.command && <>
      <IndependentControlChoice scope={snapshot.scope} humanTurnId={resolution.humanTurnId} originalText={resolution.originalText}
        command={resolution.command} requestDigest={resolution.requestDigest}
        candidates={resolution.candidates.map(candidate=>({...candidate,state:t(`spaceAssistant.${candidate.state}`)}))}
        localizedLabels={copy} disabled={busy||submitting||!!message.pending||stale} onChoose={choice=>{
          const actual=resolution.candidates.find(candidate=>candidate.runId===choice.candidate.runId);
          if(actual)void choose({...choice,candidate:actual});
        }}/>
      {stale && <p role="status">{copy.rejected}</p>}
    </>}
    {message.controlResults?.map(run=><p key={run.runId}><code>{run.runId}</code> · {t(`spaceAssistant.${run.state}`)}</p>)}
    {error && <p role="alert">{t('spaceAssistant.stale')}</p>}
  </section>;
}
