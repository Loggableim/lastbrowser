import React, { useEffect, useState } from 'react';
import { useDesktopI18n } from '../i18n.js';
import type { DesktopLocaleId } from '../i18n/keys.js';
import type { IndependentAssistantController } from '../independent-assistant-controller.js';
import {
  assistantScopeKey, sameAssistantScope, type ActivitySnapshot, type AgentDefinitionView, type IndependentScope, type RunState,
} from '../independent-contracts.js';
import { sessionTitle, shortSessionId, type DesktopSessionSummary } from '../shell-state.js';
import { useSpaceAssistantStore } from '../stores/useSpaceAssistantStore.js';

const activityCopy: Record<DesktopLocaleId, { tasks: string; unavailable: string; created: string; updated: string }> = {
  en: { tasks: 'Running and waiting tasks', unavailable: 'Task activity is unavailable.', created: 'Created', updated: 'Updated' },
  de: { tasks: 'Laufende und wartende Aufgaben', unavailable: 'Die Aufgabenaktivität ist nicht verfügbar.', created: 'Erstellt', updated: 'Aktualisiert' },
  es: { tasks: 'Tareas activas y en espera', unavailable: 'La actividad de las tareas no está disponible.', created: 'Creada', updated: 'Actualizada' },
  fr: { tasks: 'Tâches en cours et en attente', unavailable: 'L’activité des tâches est indisponible.', created: 'Créée', updated: 'Mise à jour' },
  it: { tasks: 'Attività in corso e in attesa', unavailable: 'Lo stato delle attività non è disponibile.', created: 'Creata', updated: 'Aggiornata' },
  'pt-BR': { tasks: 'Tarefas em execução e em espera', unavailable: 'A atividade das tarefas está indisponível.', created: 'Criada', updated: 'Atualizada' },
  ru: { tasks: 'Текущие и ожидающие задачи', unavailable: 'Активность задач недоступна.', created: 'Создана', updated: 'Обновлена' },
  ja: { tasks: '実行中と待機中のタスク', unavailable: 'タスクのアクティビティを取得できません。', created: '作成日時', updated: '更新日時' },
};

const runningStates = new Set<RunState>(['running', 'pausing', 'cancelling']);
const waitingStates = new Set<RunState>(['queued', 'waiting_for_user', 'waiting_for_approval', 'paused']);

export interface AssistantActivityProps {
  scope?: IndependentScope;
  controller?: IndependentAssistantController;
  sessions?: readonly DesktopSessionSummary[];
  onSelectSession?: (sessionId: string) => void;
  onOpenTask?: (sessionId: string) => void;
}

type AssistantActivityViewProps = Omit<AssistantActivityProps, 'controller'> & {
  activity?: ActivitySnapshot | null;
  unavailable?: boolean;
  definitions?: readonly AgentDefinitionView[];
  onRefresh?: () => void;
};

export function AssistantActivityView({
  scope, activity, unavailable, definitions, sessions, onSelectSession, onOpenTask, onRefresh,
}: AssistantActivityViewProps): React.JSX.Element {
  const { t, locale } = useDesktopI18n();
  const copy = activityCopy[locale];
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const snapshot = scope && activity && sameAssistantScope(scope, activity.scope) ? activity : null;
  const state = snapshot?.sourceState ?? (unavailable || !scope || activity ? 'unavailable' : 'loading');
  const runs = state === 'unavailable' ? [] : (snapshot?.runs ?? [])
    .filter(run => scope && sameAssistantScope(run.scope, scope) && (runningStates.has(run.state) || waitingStates.has(run.state)))
    .sort((left, right) => Number(runningStates.has(right.state)) - Number(runningStates.has(left.state)) ||
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const recent = sessions?.filter(session => !session.archived).slice(0, 5);
  const sessionNames = new Map(sessions?.map(session => [session.session_id, sessionTitle(session)]));
  const taskNames = new Map(definitions?.map(definition => [definition.definitionId, definition.title]));

  return <>
    <section className="native-work-card">
      <header>
        <h2>{copy.tasks}</h2>
        {onRefresh && state !== 'live' && state !== 'loading' &&
          <button type="button" onClick={onRefresh}>{t('common.retry')}</button>}
      </header>
      {state === 'loading' && <p role="status">{t('common.loading')}</p>}
      {state === 'unavailable' && <p role="status">{copy.unavailable}</p>}
      {state === 'stale' && <p role="status">{t('spaceAssistant.stale')}</p>}
      {state === 'live' && !runs.length && <p>{t('spaceAssistant.noActivity')}</p>}
      {!!runs.length && <div className="compact-list">
        {runs.map(run => {
          const sessionId = run.targetSessionId;
          const title = taskNames.get(run.definitionId) || (sessionId && sessionNames.get(sessionId)) || shortSessionId(run.runId);
          return <article key={`${assistantScopeKey(run.scope)}:${run.runId}`}>
            <details>
              <summary><strong dir="auto">{title}</strong>{' · '}<span>{t(`spaceAssistant.${run.state}`)}</span></summary>
              <dl>
                <dt>{copy.created}</dt>
                <dd><time dateTime={run.createdAt}>{dateTime.format(new Date(run.createdAt))}</time></dd>
                <dt>{copy.updated}</dt>
                <dd><time dateTime={run.updatedAt}>{dateTime.format(new Date(run.updatedAt))}</time></dd>
              </dl>
              {onOpenTask && sessionId && state === 'live' &&
                <button type="button" onClick={() => onOpenTask(sessionId)}>{t('spaceAssistant.openChat')}</button>}
            </details>
          </article>;
        })}
      </div>}
    </section>
    <section className="native-work-card">
      <header><h2>{t('sidebar.drawer.recentSessions')}</h2></header>
      {!recent && <p role="status">{t('common.loading')}</p>}
      {recent?.length === 0 && <p>{t('sidebar.drawer.noSessions')}</p>}
      {!!recent?.length && <div className="agent-session-list">
        {recent.map(session => onSelectSession
          ? <button key={session.session_id} type="button" dir="auto" onClick={() => onSelectSession(session.session_id)}>{sessionTitle(session)}</button>
          : <p key={session.session_id} dir="auto">{sessionTitle(session)}</p>)}
      </div>}
    </section>
  </>;
}

export function AssistantActivity({ scope, controller, ...props }: AssistantActivityProps): React.JSX.Element {
  const scopeKey = scope ? assistantScopeKey(scope) : null;
  const entry = useSpaceAssistantStore(state => scopeKey ? state.entries[scopeKey] : undefined);
  const [definitions, setDefinitions] = useState<{ scopeKey: string; items: readonly AgentDefinitionView[] }>();
  useEffect(() => {
    if (!scope || !scopeKey || !controller) return;
    let mounted = true;
    const release = controller.observe(scope);
    void controller.request({ schemaVersion: 1, operation: 'definitions', scope, payload: { action: 'list' } }).then(result => {
      if (mounted && result.ok && 'definitions' in result.value) {
        setDefinitions({ scopeKey, items: result.value.definitions });
      }
    });
    return () => { mounted = false; release(); };
  }, [scopeKey, controller]);

  return <AssistantActivityView
    {...props}
    scope={scope}
    activity={entry?.activity}
    unavailable={!controller || !!entry?.error}
    definitions={definitions?.scopeKey === scopeKey ? definitions.items : undefined}
    onRefresh={scope && controller ? () => { void controller.poll(scope); } : undefined}
  />;
}
