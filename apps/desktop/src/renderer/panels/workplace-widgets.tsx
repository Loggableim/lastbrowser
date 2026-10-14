import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Clock, Plus, Trash2, StickyNote, Puzzle, ExternalLink } from 'lucide-react';
import { usePanelStore } from '../stores/usePanelStore.js';
import { defaultWorkplaceLayout, parseWorkplaceLayout, type WorkplaceLayout, type WorkplaceWidgetId } from './workplace-layout.js';

export type { WorkplaceWidgetId } from './workplace-layout.js';
export type WorkplaceState = { layout: WorkplaceLayout; enabled: Record<WorkplaceWidgetId, boolean>; notes: string; tasks: Array<{ id: string; text: string; done: boolean }>; focus: { duration: number; remaining: number; deadline: number | null } };
const defaults = (): WorkplaceState => ({ layout: defaultWorkplaceLayout(), enabled: { search: true, spaces: true, recent: true, bookmarks: true, speedDial: true, quickActions: true, notes: true, tasks: false, focus: true }, notes: '', tasks: [], focus: { duration: 25, remaining: 25 * 60000, deadline: null } });
const changedEvent = 'lastbrowser:workplace-changed';
function read(key: string): WorkplaceState {
  const base = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (!raw || typeof raw !== 'object') return base;
    for (const id of Object.keys(base.enabled) as WorkplaceWidgetId[]) if (typeof raw.enabled?.[id] === 'boolean') base.enabled[id] = raw.enabled[id];
    base.layout = parseWorkplaceLayout(raw.layout);
    base.notes = typeof raw.notes === 'string' ? raw.notes.slice(0, 12000) : '';
    base.tasks = Array.isArray(raw.tasks) ? raw.tasks.filter((task: any) => task && typeof task.id === 'string' && typeof task.text === 'string' && typeof task.done === 'boolean').slice(0, 80) : [];
    if (raw.focus && Number.isFinite(raw.focus.duration) && raw.focus.duration >= 1 && raw.focus.duration <= 180) {
      base.focus.duration = raw.focus.duration;
      base.focus.remaining = Number.isFinite(raw.focus.remaining) && raw.focus.remaining >= 0 ? Math.min(raw.focus.remaining, 180 * 60000) : raw.focus.duration * 60000;
      base.focus.deadline = Number.isFinite(raw.focus.deadline) && raw.focus.deadline > 0 ? raw.focus.deadline : null;
    }
  } catch { /* Optional local widgets work without persisted data. */ }
  return base;
}
export function useWorkplaceState(key: string): [WorkplaceState, (change: (previous: WorkplaceState) => WorkplaceState) => void, boolean] {
  const initial = useMemo(() => read(key), [key]);
  const [local, setLocal] = useState({ key, value: initial });
  const [storageError, setStorageError] = useState(false);
  const value = local.key === key ? local.value : initial;
  useEffect(() => {
    setStorageError(false);
    const refresh = () => setLocal({ key, value: read(key) });
    const storage = (event: StorageEvent) => { if (!event.key || event.key === key) refresh(); };
    const custom = (event: Event) => { if ((event as CustomEvent<string>).detail === key) refresh(); };
    window.addEventListener('storage', storage); window.addEventListener(changedEvent, custom);
    return () => { window.removeEventListener('storage', storage); window.removeEventListener(changedEvent, custom); };
  }, [key]);
  return [value, change => {
    const next = change(value); setLocal({ key, value: next });
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(false); window.dispatchEvent(new CustomEvent(changedEvent, { detail: key })); }
    catch { setStorageError(true); }
  }, storageError];
}
export function openWorkplaceHub(): void { usePanelStore.getState().setExtensionHubTab('skills'); usePanelStore.getState().setExtensionHubOpen(true); }
export function WorkplaceUtilityWidgets({ state, update, now, german, only }: { state: WorkplaceState; update: (change: (previous: WorkplaceState) => WorkplaceState) => void; now: number; german: boolean; only?: 'notes' | 'tasks' | 'focus' }): JSX.Element {
  const [taskInput, setTaskInput] = useState('');
  const remaining = state.focus.deadline === null ? state.focus.remaining : Math.max(0, state.focus.deadline - now);
  const seconds = Math.ceil(remaining / 1000);
  const running = state.focus.deadline !== null && remaining > 0;
  return <>
    {state.enabled.notes && (!only || only === 'notes') && <section className="workplace-tile" data-tone="purple"><h2><StickyNote size={16} />{german ? 'Notizen' : 'Notes'}</h2>
      <textarea aria-label={german ? 'Lokale Space-Notizen' : 'Local Space notes'} value={state.notes} maxLength={12000} placeholder={german ? 'Gedanken für diesen Arbeitsplatz …' : 'Thoughts for this workspace …'} onChange={event => update(previous => ({ ...previous, notes: event.target.value }))} />
      <small>{german ? 'Lokal · nur in diesem Profil und Space' : 'Local · only in this profile and Space'}</small></section>}
    {state.enabled.tasks && (!only || only === 'tasks') && <section className="workplace-tile" data-tone="orange"><h2><CheckSquare size={16} />{german ? 'Aufgaben' : 'Tasks'}</h2>
      <div className="workplace-task-list">{state.tasks.map(task => <div key={task.id} className="workplace-task"><label><input type="checkbox" checked={task.done} onChange={() => update(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, done: !item.done } : item) }))} /><span className={task.done ? 'is-done' : ''}>{task.text}</span></label>
      <button type="button" aria-label={german ? 'Aufgabe löschen' : 'Delete task'} onClick={() => update(previous => ({ ...previous, tasks: previous.tasks.filter(item => item.id !== task.id) }))}><Trash2 size={13} /></button></div>)}
      {!state.tasks.length && <p>{german ? 'Was möchtest du erledigen?' : 'What would you like to finish?'}</p>}</div>
      <form className="workplace-task-add" onSubmit={event => { event.preventDefault(); if (!taskInput.trim() || state.tasks.length >= 80) return; update(previous => ({ ...previous, tasks: [...previous.tasks, { id: crypto.randomUUID(), text: taskInput.trim(), done: false }] })); setTaskInput(''); }}>
      <input value={taskInput} maxLength={280} aria-label={german ? 'Neue Aufgabe' : 'New task'} placeholder={german ? 'Neue Aufgabe' : 'New task'} onChange={event => setTaskInput(event.target.value)} /><button type="submit" disabled={!taskInput.trim() || state.tasks.length >= 80} aria-label={german ? 'Hinzufügen' : 'Add'}><Plus size={15} /></button></form>{state.tasks.length >= 80 && <small>{german ? 'Maximal 80 Aufgaben. Lösche einen Eintrag, um Platz zu schaffen.' : 'Maximum 80 tasks. Delete an entry to make room.'}</small>}</section>}
    {state.enabled.focus && (!only || only === 'focus') && <section className="workplace-tile workplace-focus" data-tone="green"><h2><Clock size={16} />{german ? 'Fokuszeit' : 'Focus timer'}</h2>
      <output aria-label={german ? 'Verbleibende Fokuszeit' : 'Remaining focus time'}>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</output>
      <p role="status">{running ? (german ? 'Zeit für deine nächste Aufgabe' : 'Time for your next task') : state.focus.deadline !== null ? (german ? 'Fokuszeit abgeschlossen' : 'Focus session complete') : (german ? 'Dein ruhiger Arbeitsblock' : 'Your quiet work session')}</p>
      <div className="workplace-focus-controls"><label>{german ? 'Minuten' : 'Minutes'} <input type="number" min={1} max={180} value={state.focus.duration} disabled={running} onChange={event => { const duration = Math.max(1, Math.min(180, Number(event.target.value) || 25)); update(previous => ({ ...previous, focus: { duration, remaining: duration * 60000, deadline: null } })); }} /></label>
      <button type="button" onClick={() => update(previous => ({ ...previous, focus: running ? { ...previous.focus, remaining: Math.max(0, (previous.focus.deadline || now) - Date.now()), deadline: null } : { ...previous.focus, deadline: Date.now() + (remaining > 0 ? remaining : previous.focus.duration * 60000) } }))}>{running ? (german ? 'Pause' : 'Pause') : (german ? 'Starten' : 'Start')}</button>
      <button type="button" onClick={() => update(previous => ({ ...previous, focus: { ...previous.focus, remaining: previous.focus.duration * 60000, deadline: null } }))}>{german ? 'Zurücksetzen' : 'Reset'}</button></div></section>}
  </>;
}
export function WorkplacePlugins({ german }: { german: boolean }): JSX.Element {
  const [items, setItems] = useState<Array<{ id: string; name: string; enabled: boolean }>>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let mounted = true; void window.lastbrowser.extensions.list().then(result => { if (mounted) setItems(Array.isArray(result) ? result.map(item => ({ id: item.id, name: item.name, enabled: item.enabled })) : []); }).catch(reason => { if (mounted) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (mounted) setLoading(false); }); return () => { mounted = false; }; }, []);
  return <section className="workplace-plugins"><header><div><h2><Puzzle size={18} />{german ? 'Erweiterungen & Skills' : 'Extensions & skills'}</h2><p>{german ? 'Deine installierten Browser-Erweiterungen. Skills und Verbindungen verwaltest du im Hub.' : 'Your installed browser extensions. Manage skills and connections in the Hub.'}</p></div><button type="button" onClick={openWorkplaceHub}><ExternalLink size={15} />Extension & Skill Hub</button></header>
    {loading && <p role="status">{german ? 'Erweiterungen werden geladen …' : 'Loading extensions …'}</p>}{error && <p role="alert">{error}</p>}
    {!loading && !error && !items.length && <p>{german ? 'Noch keine Browser-Erweiterungen installiert.' : 'No browser extensions installed yet.'}</p>}
    <div className="workplace-grid">{items.map(item => <article className="workplace-tile" data-tone="purple" key={item.id}><h2><Puzzle size={16} />{item.name}</h2><p>{item.enabled ? (german ? 'Aktiviert' : 'Enabled') : (german ? 'Deaktiviert' : 'Disabled')}</p><button type="button" onClick={() => { usePanelStore.getState().setExtensionHubTab('webextensions'); usePanelStore.getState().setExtensionHubOpen(true); }}>{german ? 'Im Hub verwalten' : 'Manage in Hub'}</button></article>)}</div>
  </section>;
}
