import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Edit3,
  ListChecks,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2
} from 'lucide-react';
import { canCallSidekickApi } from '../runtime-readiness.js';
import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';
import { jsonPreview } from './NativeRestPanels.js';
import type { DesktopChatMessage, DesktopSessionDetail } from '../shell-state.js';

export type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
export type CronJobSummary = Awaited<ReturnType<typeof window.lastbrowser.sidekick.listCrons>>['jobs'][number];
export type KanbanBoardResponse = Awaited<ReturnType<typeof window.lastbrowser.sidekick.getKanbanBoard>>;
export type KanbanColumnSummary = NonNullable<KanbanBoardResponse['columns']>[number];
export type KanbanTaskSummary = NonNullable<KanbanColumnSummary['tasks']>[number];

export type TodoItem = {
  id?: string;
  content?: string;
  title?: string;
  status?: string;
};

export function cronScheduleLabel(job: CronJobSummary): string {
  if (job.schedule_display) return String(job.schedule_display);
  if (typeof job.schedule === 'string') return job.schedule;
  return String(job.schedule?.expression || '');
}

export function cronStatus(job: CronJobSummary): string {
  if (job.last_error) return 'error';
  return String(job.last_status || job.state || 'active');
}

export function formatMaybeDate(value: string | number | null | undefined): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function kanbanColumnLabel(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function kanbanTaskTitle(task: KanbanTaskSummary): string {
  return task.title || task.summary || task.id || 'Task';
}

export function kanbanTaskBody(task: KanbanTaskSummary): string {
  return task.body || task.description || task.prompt || '';
}

export function extractTodosFromSession(
  activeSession: DesktopSessionDetail | null,
  messages: DesktopChatMessage[]
): TodoItem[] {
  const source = Array.isArray(activeSession?.messages) && activeSession.messages.length
    ? activeSession.messages
    : messages;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const message = source[index];
    if (message?.role !== 'tool') continue;
    try {
      const parsed = JSON.parse(String(message.content || '{}')) as { todos?: TodoItem[] };
      if (Array.isArray(parsed.todos)) return parsed.todos;
    } catch {
      // Ignore non-todo tool payloads.
    }
  }
  return [];
}

export function normalizeTodoStatus(status: string | undefined): string {
  const value = String(status || 'pending').toLowerCase();
  if (value === 'done') return 'completed';
  if (value === 'active' || value === 'running') return 'in_progress';
  return value;
}

export function workspaceLabel(path?: string | null): string {
  if (!path || path === 'default') return 'default';
  const raw = String(path || '');
  const normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function NativeTasksMain({
  activeContextItem,
  serviceStatus
}: {
  activeContextItem: string;
  serviceStatus: ServiceStatus | null;
}): JSX.Element {
  const ready = canCallSidekickApi(serviceStatus);
  const [jobs, setJobs] = useState<CronJobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('0 9 * * *');
  const [prompt, setPrompt] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Scheduled jobs');
  const [dispatchState, setDispatchState] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!ready) return;
    setLoading(true);
    try {
      const result = await window.lastbrowser.sidekick.listCrons();
      setJobs(Array.isArray(result.jobs) ? result.jobs : []);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshDispatchState = useCallback(async (): Promise<void> => {
    if (!ready) return;
    try {
      setDispatchState(await window.lastbrowser.sidekick.getActiveDispatches());
    } catch {
      setDispatchState(null);
    }
  }, [ready]);

  useEffect(() => {
    void refreshDispatchState();
  }, [refreshDispatchState]);

  useEffect(() => {
    setSection(activeContextItem || 'Scheduled jobs');
  }, [activeContextItem]);

  const visibleJobs = jobs.filter((job) => {
    const paused = job.enabled === false || job.state === 'paused';
    if (section === 'Active') return !paused;
    if (section === 'Paused') return paused;
    return true;
  });

  async function createJob(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!prompt.trim() || !schedule.trim()) return;
    setLoading(true);
    try {
      await window.lastbrowser.sidekick.createCron({
        name: name.trim(),
        prompt: prompt.trim(),
        schedule: schedule.trim(),
        deliver: 'local'
      });
      setName('');
      setPrompt('');
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setLoading(false);
    }
  }

  async function editJob(job: CronJobSummary): Promise<void> {
    const nextName = window.prompt('Task name', job.name || '');
    if (nextName === null) return;
    const nextSchedule = window.prompt('Schedule', cronScheduleLabel(job));
    if (!nextSchedule?.trim()) return;
    const nextPrompt = window.prompt('Prompt', job.prompt || '');
    if (nextPrompt === null) return;
    try {
      await window.lastbrowser.sidekick.updateCron({
        jobId: job.id,
        name: nextName.trim(),
        schedule: nextSchedule.trim(),
        prompt: nextPrompt.trim()
      });
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    }
  }

  async function mutateJob(job: CronJobSummary, action: 'run' | 'pause' | 'resume' | 'delete'): Promise<void> {
    if (action === 'delete' && !window.confirm(`Delete "${job.name || job.id}"?`)) return;
    try {
      if (action === 'run') await window.lastbrowser.sidekick.runCron({ jobId: job.id });
      if (action === 'pause') await window.lastbrowser.sidekick.pauseCron({ jobId: job.id });
      if (action === 'resume') await window.lastbrowser.sidekick.resumeCron({ jobId: job.id });
      if (action === 'delete') await window.lastbrowser.sidekick.deleteCron({ jobId: job.id });
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }

  async function runDispatcher(): Promise<void> {
    if (!ready) return;
    await window.lastbrowser.sidekick.runDispatchOnce({ dryRun: false });
    await Promise.all([refresh(), refreshDispatchState()]);
  }

  return (
    <section className="browser-main native-work-main tasks-main">
      <header className="native-work-header">
        <div>
          <span className="eyebrow">Tasks</span>
          <h1>{section}</h1>
          <p>Native port of the WebUI Tasks panel. Jobs use the existing Sidekick cron backend.</p>
        </div>
        <button type="button" className="secondary-action compact" onClick={() => void refresh()} disabled={!ready || loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          <span>Refresh</span>
        </button>
        <button type="button" className="secondary-action compact" onClick={() => void runDispatcher()} disabled={!ready}>
          <Sparkles size={15} />
          <span>Run dispatcher</span>
        </button>
      </header>
      <div className="native-card-actions insights-tabs">
        {['Scheduled jobs', 'Active', 'Paused', 'History'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <form className="native-work-card native-task-form" onSubmit={(event) => void createJob(event)}>
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Daily review" />
        </label>
        <label>
          <span>Schedule</span>
          <input value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="0 9 * * *" />
        </label>
        <label className="wide">
          <span>Prompt</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What should Sidekick do on this schedule?" rows={3} />
        </label>
        <button type="submit" className="primary-action compact" disabled={!ready || loading || !prompt.trim() || !schedule.trim()}>
          <Plus size={15} />
          <span>New job</span>
        </button>
      </form>
      {error && <div className="workspace-error">{error}</div>}
      <AdvancedWebUiTools panel="tasks" serviceStatus={serviceStatus} compact />
      <section className="native-work-card detail-json-card">
        <header><strong>Dispatcher</strong></header>
        <pre>{jsonPreview(dispatchState || { active: [] })}</pre>
      </section>
      <div className="native-work-grid">
        {visibleJobs.map((job) => {
          const paused = job.enabled === false || job.state === 'paused';
          return (
            <article key={job.id} className="native-work-card task-card">
              <div className="task-card-head">
                <div>
                  <strong>{job.name || cronScheduleLabel(job) || job.id}</strong>
                  <span>{cronScheduleLabel(job) || 'manual'}</span>
                </div>
                <span className={`task-state ${paused ? 'paused' : cronStatus(job)}`}>{paused ? 'paused' : cronStatus(job)}</span>
              </div>
              <p>{job.prompt || job.last_error || 'No prompt preview available.'}</p>
              <div className="task-card-meta">
                <span>Next: {formatMaybeDate(job.next_run_at) || 'n/a'}</span>
                <span>Last: {formatMaybeDate(job.last_run_at) || 'never'}</span>
              </div>
              <div className="native-card-actions">
                <button type="button" onClick={() => void mutateJob(job, 'run')}><Sparkles size={13} /><span>Run</span></button>
                {paused ? (
                  <button type="button" onClick={() => void mutateJob(job, 'resume')}><CheckCircle2 size={13} /><span>Resume</span></button>
                ) : (
                  <button type="button" onClick={() => void mutateJob(job, 'pause')}><Minus size={13} /><span>Pause</span></button>
                )}
                <button type="button" onClick={() => void editJob(job)}><Edit3 size={13} /><span>Edit</span></button>
                <button type="button" className="danger" onClick={() => void mutateJob(job, 'delete')}><Trash2 size={13} /><span>Delete</span></button>
              </div>
            </article>
          );
        })}
        {!visibleJobs.length && (
          <div className="native-work-empty">
            <CalendarDays size={28} />
            <span>{ready ? 'No scheduled jobs yet.' : 'Sidekick runtime is starting.'}</span>
          </div>
        )}
      </div>
    </section>
  );
}

export function NativeKanbanMain({
  activeContextItem,
  activeSpacePath,
  serviceStatus
}: {
  activeContextItem: string;
  activeSpacePath: string;
  serviceStatus: ServiceStatus | null;
}): JSX.Element {
  const ready = canCallSidekickApi(serviceStatus);
  const [board, setBoard] = useState<KanbanBoardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('todo');
  const [section, setSection] = useState(activeContextItem || 'Board');
  const [dispatchState, setDispatchState] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!ready) return;
    setLoading(true);
    try {
      const result = await window.lastbrowser.sidekick.getKanbanBoard({ workspace: activeSpacePath || undefined });
      setBoard(result);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeSpacePath, ready]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshDispatchState = useCallback(async (): Promise<void> => {
    if (!ready) return;
    try {
      setDispatchState(await window.lastbrowser.sidekick.getActiveDispatches());
    } catch {
      setDispatchState(null);
    }
  }, [ready]);

  useEffect(() => {
    void refreshDispatchState();
  }, [refreshDispatchState]);

  useEffect(() => {
    setSection(activeContextItem || 'Board');
  }, [activeContextItem]);

  const columns = board?.columns?.length
    ? board.columns
    : ['triage', 'todo', 'ready', 'running', 'blocked', 'done'].map((name) => ({ name, tasks: [] }));
  const visibleColumns = section === 'Board'
    ? columns
    : columns.filter((column) => kanbanColumnLabel(column.name).toLowerCase() === section.toLowerCase() || column.name.toLowerCase() === section.toLowerCase());

  async function createTask(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      await window.lastbrowser.sidekick.createKanbanTask({
        title: title.trim(),
        body: body.trim(),
        status
      });
      setTitle('');
      setBody('');
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    }
  }

  async function moveTask(task: KanbanTaskSummary, nextStatus: string): Promise<void> {
    if (!task.id || !nextStatus) return;
    try {
      await window.lastbrowser.sidekick.updateKanbanTask({ taskId: task.id, status: nextStatus });
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    }
  }

  async function runDispatcher(): Promise<void> {
    if (!ready) return;
    await window.lastbrowser.sidekick.runDispatchOnce({ dryRun: false });
    await Promise.all([refresh(), refreshDispatchState()]);
  }

  return (
    <section className="browser-main native-work-main kanban-main">
      <header className="native-work-header">
        <div>
          <span className="eyebrow">Kanban</span>
          <h1>{section}</h1>
          <p>{activeSpacePath ? workspaceLabel(activeSpacePath) : 'Default workspace'} · native board view backed by `/api/kanban`.</p>
        </div>
        <button type="button" className="secondary-action compact" onClick={() => void refresh()} disabled={!ready || loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          <span>Refresh</span>
        </button>
        <button type="button" className="secondary-action compact" onClick={() => void runDispatcher()} disabled={!ready}>
          <Sparkles size={15} />
          <span>Run dispatcher</span>
        </button>
      </header>
      <div className="native-card-actions insights-tabs">
        {['Board', 'Triage', 'Running', 'Done'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <form className="native-work-card kanban-task-form" onSubmit={(event) => void createTask(event)}>
        <label>
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New task" />
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {columns.map((column) => <option key={column.name} value={column.name}>{kanbanColumnLabel(column.name)}</option>)}
          </select>
        </label>
        <label className="wide">
          <span>Description</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Task details" rows={2} />
        </label>
        <button type="submit" className="primary-action compact" disabled={!ready || !title.trim()}>
          <Plus size={15} />
          <span>Add task</span>
        </button>
      </form>
      {error && <div className="workspace-error">{error}</div>}
      <AdvancedWebUiTools panel="kanban" serviceStatus={serviceStatus} compact />
      <section className="native-work-card detail-json-card">
        <header><strong>Dispatcher</strong></header>
        <pre>{jsonPreview(dispatchState || { active: [] })}</pre>
      </section>
      <div className="native-kanban-board">
        {visibleColumns.map((column) => (
          <section key={column.name} className="native-kanban-column">
            <header>
              <span>{kanbanColumnLabel(column.name)}</span>
              <strong>{column.tasks?.length || 0}</strong>
            </header>
            <div className="native-kanban-cards">
              {(column.tasks || []).map((task) => (
                <article key={task.id} className="native-work-card kanban-card-native">
                  <small>{task.id}</small>
                  <strong>{kanbanTaskTitle(task)}</strong>
                  {kanbanTaskBody(task) && <p>{kanbanTaskBody(task)}</p>}
                  <div className="task-card-meta">
                    {task.assignee && <span>@{task.assignee}</span>}
                    {task.tenant && <span>{task.tenant}</span>}
                    {task.priority !== undefined && <span>P{String(task.priority)}</span>}
                  </div>
                  <select value={task.status || column.name} onChange={(event) => void moveTask(task, event.target.value)}>
                    {columns.map((target) => <option key={target.name} value={target.name}>{kanbanColumnLabel(target.name)}</option>)}
                  </select>
                </article>
              ))}
              {!column.tasks?.length && <div className="native-kanban-empty">Empty</div>}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export function TodoColumn({ title, todos }: { title: string; todos: TodoItem[] }): JSX.Element {
  return (
    <section className="native-work-card todo-column-native">
      <header>
        <span>{title}</span>
        <strong>{todos.length}</strong>
      </header>
      {todos.map((todo, index) => (
        <article key={todo.id || `${title}-${index}`} className={`todo-card ${normalizeTodoStatus(todo.status)}`}>
          {normalizeTodoStatus(todo.status) === 'completed' ? <CheckCircle2 size={15} /> : <Square size={15} />}
          <div>
            <strong>{todo.content || todo.title || 'Untitled todo'}</strong>
            <span>{todo.id || normalizeTodoStatus(todo.status)}</span>
          </div>
        </article>
      ))}
      {!todos.length && <div className="native-kanban-empty">Empty</div>}
    </section>
  );
}

export function NativeTodosMain({
  activeContextItem,
  activeSession,
  messages,
  serviceStatus
}: {
  activeContextItem: string;
  activeSession: DesktopSessionDetail | null;
  messages: DesktopChatMessage[];
  serviceStatus: ServiceStatus | null;
}): JSX.Element {
  const [section, setSection] = useState(activeContextItem || 'Pending');
  const todos = extractTodosFromSession(activeSession, messages);
  const pending = todos.filter((todo) => normalizeTodoStatus(todo.status) === 'pending');
  const inProgress = todos.filter((todo) => normalizeTodoStatus(todo.status) === 'in_progress');
  const completed = todos.filter((todo) => ['completed', 'cancelled'].includes(normalizeTodoStatus(todo.status)));
  useEffect(() => {
    setSection(activeContextItem || 'Pending');
  }, [activeContextItem]);
  const visibleTodos = section === 'In progress' ? inProgress : section === 'Completed / cancelled' ? completed : pending;

  return (
    <section className="browser-main native-work-main todos-main">
      <header className="native-work-header">
        <div>
          <span className="eyebrow">Todos</span>
          <h1>{section}</h1>
          <p>Native view of the latest todo state emitted in the active Sidekick session.</p>
        </div>
        <div className="todo-metrics">
          <span><strong>{todos.length}</strong> total</span>
          <span><strong>{pending.length + inProgress.length}</strong> active</span>
          <span><strong>{completed.length}</strong> done</span>
        </div>
      </header>
      <div className="native-card-actions insights-tabs">
        {['Pending', 'In progress', 'Completed / cancelled'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <div className="todos-columns-native">
        <TodoColumn title={section} todos={visibleTodos} />
      </div>
      <AdvancedWebUiTools panel="todos" serviceStatus={serviceStatus} compact />
      {!todos.length && (
        <div className="native-work-empty">
          <ListChecks size={28} />
          <span>No active todo state in this chat yet.</span>
        </div>
      )}
    </section>
  );
}
