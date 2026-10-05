import type { IndependentWaitingQuestion } from '../independent-contracts.js';
import type { IndependentAssistantController } from '../independent-assistant-controller.js';
import type { DesktopLocaleId } from '../i18n/keys.js';
import { useDesktopI18n } from '../i18n.js';
import { IndependentClarification, type ClarificationLabels } from './IndependentClarification.js';

/** Human control labels are separate from provider-supplied question text. */
export const clarificationLabels: Record<DesktopLocaleId, ClarificationLabels> = {
  en: { title: 'This task needs your answer', answer: 'Your answer', submit: 'Submit answer', sending: 'Sending…', sent: 'Answer accepted. The task can continue.', failed: 'The answer could not be submitted. Refresh the task status.' },
  de: { title: 'Dieser Auftrag braucht deine Antwort', answer: 'Deine Antwort', submit: 'Antwort senden', sending: 'Wird gesendet…', sent: 'Antwort angenommen. Der Auftrag kann weiterarbeiten.', failed: 'Die Antwort konnte nicht gesendet werden. Aufgabenstatus erneut laden.' },
  es: { title: 'Esta tarea necesita tu respuesta', answer: 'Tu respuesta', submit: 'Enviar respuesta', sending: 'Enviando…', sent: 'Respuesta aceptada. La tarea puede continuar.', failed: 'No se pudo enviar la respuesta. Actualiza el estado de la tarea.' },
  fr: { title: 'Cette tâche attend votre réponse', answer: 'Votre réponse', submit: 'Envoyer la réponse', sending: 'Envoi…', sent: 'Réponse acceptée. La tâche peut continuer.', failed: 'La réponse n’a pas pu être envoyée. Actualisez l’état de la tâche.' },
  it: { title: 'Questa attività richiede la tua risposta', answer: 'La tua risposta', submit: 'Invia risposta', sending: 'Invio…', sent: 'Risposta accettata. L’attività può continuare.', failed: 'Impossibile inviare la risposta. Aggiorna lo stato dell’attività.' },
  'pt-BR': { title: 'Esta tarefa precisa da sua resposta', answer: 'Sua resposta', submit: 'Enviar resposta', sending: 'Enviando…', sent: 'Resposta aceita. A tarefa pode continuar.', failed: 'Não foi possível enviar a resposta. Atualize o status da tarefa.' },
  ru: { title: 'Для этой задачи нужен ваш ответ', answer: 'Ваш ответ', submit: 'Отправить ответ', sending: 'Отправка…', sent: 'Ответ принят. Задача может продолжить работу.', failed: 'Не удалось отправить ответ. Обновите состояние задачи.' },
  ja: { title: 'このタスクには回答が必要です', answer: '回答', submit: '回答を送信', sending: '送信中…', sent: '回答が受け付けられました。タスクを続行できます。', failed: '回答を送信できませんでした。タスクの状態を更新してください。' },
};

export function IndependentRunClarification({ waiting, controller, onAccepted }: {
  waiting: IndependentWaitingQuestion; controller: IndependentAssistantController; onAccepted?: () => void;
}): React.JSX.Element {
  const { locale } = useDesktopI18n();
  return <IndependentClarification waiting={waiting} labels={clarificationLabels[locale]} onSubmit={async (scope, payload) => {
    const response = await controller.request({ schemaVersion: 1, operation: 'runControl', scope, payload });
    if (!response.ok) throw new Error(clarificationLabels[locale].failed);
    await controller.poll(scope);
    onAccepted?.();
  }} />;
}
