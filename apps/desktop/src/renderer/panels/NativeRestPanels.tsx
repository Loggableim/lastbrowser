import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Brain,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  Folder,
  Gauge,
  Grid2X2,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  Users
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import { canCallSidekickApi } from '../runtime-readiness.js';
import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
type AnyRecord = Record<string, unknown>;
type ApiState = {
  data: AnyRecord | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

function useApiState(loader: () => Promise<AnyRecord>, deps: React.DependencyList, enabled = true): ApiState {
  const [data, setData] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setLoading(true);
    try {
      setData(await loader());
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

function isReady(serviceStatus: ServiceStatus | null): boolean {
  return canCallSidekickApi(serviceStatus);
}

function arrayFrom(payload: AnyRecord | null, keys: string[]): AnyRecord[] {
  if (!payload) return [];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  const firstArray = Object.values(payload).find(Array.isArray);
  return Array.isArray(firstArray) ? firstArray.filter(isRecord) : [];
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function titleOf(item: AnyRecord, fallback = 'Untitled'): string {
  return text(item.name || item.title || item.label || item.slug || item.id || item.path, fallback);
}

function idOf(item: AnyRecord): string {
  return text(item.slug || item.id || item.name || item.path || titleOf(item));
}

function jsonPreview(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

function NativeHeader({
  icon,
  title,
  kicker,
  detail,
  loading,
  ready,
  onRefresh
}: {
  icon: React.ReactNode;
  title: string;
  kicker: string;
  detail: string;
  loading?: boolean;
  ready: boolean;
  onRefresh?: () => Promise<void>;
}): JSX.Element {
  return (
    <header className="native-rest-header">
      <div className="native-rest-title">
        <div className="native-rest-icon">{icon}</div>
        <div>
          <span className="eyebrow">{kicker}</span>
          <h1>{title}</h1>
          <p>{detail}</p>
        </div>
      </div>
      <div className="native-rest-header-actions">
        <span className={`native-rest-pill ${ready ? 'ready' : 'starting'}`}>
          <span className={ready ? 'status-dot ready' : 'status-dot'} />
          {ready ? 'Online' : 'Starting'}
        </span>
        {onRefresh && (
          <button type="button" className="secondary-action compact" onClick={() => void onRefresh()} disabled={!ready || loading}>
            {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            <span>Refresh</span>
          </button>
        )}
      </div>
    </header>
  );
}

function ErrorLine({ error }: { error: string }): JSX.Element | null {
  return error ? <div className="workspace-error">{error}</div> : null;
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }): JSX.Element {
  return (
    <div className="native-rest-empty">
      {icon}
      <span>{label}</span>
    </div>
  );
}

export function NativeSkillsMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const skillsState = useApiState(() => window.lastbrowser.sidekick.listSkills(), [ready], ready);
  const skills = arrayFrom(skillsState.data, ['skills', 'items', 'files']);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Library');
  const [selectedName, setSelectedName] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [content, setContent] = useState('');
  const [editorError, setEditorError] = useState('');
  const filtered = skills.filter((skill) => jsonPreview(skill).toLowerCase().includes(query.toLowerCase()));
  const selectedSkill = filtered.find((skill) => idOf(skill) === selectedName || text(skill.name) === selectedName) || filtered[0] || null;
  const linkedFiles = isRecord(selectedSkill?.linked_files)
    ? Object.keys(selectedSkill.linked_files)
    : arrayFrom(isRecord(selectedSkill?.linked_files) ? selectedSkill.linked_files : null, ['files']).map(idOf);

  useEffect(() => {
    setSection(activeContextItem || 'Library');
  }, [activeContextItem]);

  const visibleSkills = section === 'Create skill'
    ? filtered.slice(0, 1)
    : section === 'Linked files' && selectedSkill
      ? [selectedSkill]
      : filtered;

  useEffect(() => {
    if (!selectedName && filtered[0]) setSelectedName(text(filtered[0].name || idOf(filtered[0])));
  }, [filtered, selectedName]);

  useEffect(() => {
    if (!ready || !selectedName) return;
    const request = selectedFile
      ? { name: selectedName, file: selectedFile }
      : { name: selectedName, path: text(selectedSkill?.path) || undefined };
    void window.lastbrowser.sidekick.getSkillContent({ name: request.name, file: request.file, path: request.path }).then((payload) => {
      setContent(text(payload.content || payload.text || payload.markdown));
      setEditorError('');
    }).catch((error) => setEditorError(error instanceof Error ? error.message : String(error)));
  }, [ready, selectedFile, selectedName, selectedSkill]);

  async function save(): Promise<void> {
    if (!selectedName) return;
    await window.lastbrowser.sidekick.saveSkill({
      name: selectedName,
      category: text(selectedSkill?.category),
      path: text(selectedSkill?.path) || undefined,
      content
    });
    await skillsState.refresh();
  }

  async function createSkill(): Promise<void> {
    const name = window.prompt('Skill name', 'custom-skill');
    if (!name?.trim()) return;
    setSelectedName(name.trim());
    setSelectedFile('');
    setContent('# New Skill\n\nDescribe when Sidekick should use this skill.\n');
  }

  async function removeSkill(): Promise<void> {
    if (!selectedName || !window.confirm(`Delete ${selectedName}?`)) return;
    await window.lastbrowser.sidekick.deleteSkill({ name: selectedName, path: text(selectedSkill?.path) || undefined });
    setSelectedName('');
    setSelectedFile('');
    setContent('');
    await skillsState.refresh();
  }

  return (
    <section className="browser-main native-rest-main skills-main">
      <NativeHeader icon={<Sparkles size={21} />} title="Skills" kicker="Native Skills" detail="Skill library, linked files and SKILL.md editing through the local Sidekick API." loading={skillsState.loading} ready={ready} onRefresh={skillsState.refresh} />
      <AdvancedWebUiTools panel="skills" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {['Library', 'Editor', 'Linked files', 'Create skill'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <div className="native-rest-split">
        <aside className="integration-list">
          <div className="native-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills..." /></div>
          <button type="button" className="new-session-button" onClick={() => void createSkill()} disabled={!ready}><Plus size={15} />New skill</button>
          {visibleSkills.map((skill) => (
            <button key={idOf(skill)} type="button" className={`integration-row ${idOf(skill) === selectedName ? 'active' : ''}`} onClick={() => { setSelectedName(text(skill.name || idOf(skill))); setSelectedFile(''); }}>
              <img src={brandAssets.sidebarIcons.skills} alt="" />
              <span>{titleOf(skill, idOf(skill))}</span>
              <small>{text(skill.path || skill.category || skill.source)}</small>
            </button>
          ))}
          {!visibleSkills.length && <EmptyState icon={<Sparkles size={22} />} label={ready ? 'No skills found.' : 'Sidekick is starting.'} />}
        </aside>
        <main className="native-rest-editor">
          <ErrorLine error={skillsState.error || editorError} />
          <div className="native-rest-editor-head">
            <strong>{section}: {selectedFile || selectedName || 'Select a skill'}</strong>
            <div className="native-card-actions">
              <button type="button" onClick={() => void save()} disabled={!ready || !selectedName || Boolean(selectedFile)}><Save size={13} /><span>Save SKILL.md</span></button>
              <button type="button" className="danger" onClick={() => void removeSkill()} disabled={!ready || !selectedName}><Trash2 size={13} /><span>Delete</span></button>
            </div>
          </div>
          <div className="skill-linked-files">
            <button type="button" className={!selectedFile ? 'active' : ''} onClick={() => setSelectedFile('')}>SKILL.md</button>
            {linkedFiles.map((file) => (
              <button key={file} type="button" className={file === selectedFile ? 'active' : ''} onClick={() => setSelectedFile(file)}>
                <FileText size={12} />
                <span>{file}</span>
              </button>
            ))}
          </div>
          <textarea className="code-editor" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Select or create a SKILL.md file." />
        </main>
      </div>
    </section>
  );
}

export function NativeAgentsMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const agentsState = useApiState(() => window.lastbrowser.sidekick.listAgents(), [ready], ready);
  const currentState = useApiState(() => window.lastbrowser.sidekick.getCurrentAgent(), [ready], ready);
  const splashState = useApiState(() => window.lastbrowser.sidekick.getAgentSplashStatus(), [ready], ready);
  const statsState = useApiState(() => window.lastbrowser.sidekick.getAgentStats(), [ready], ready);
  const activitiesState = useApiState(() => window.lastbrowser.sidekick.getAgentActivities({ limit: 50 }), [ready], ready);
  const profilesState = useApiState(() => window.lastbrowser.sidekick.getAgentProfiles(), [ready], ready);
  const workspacesState = useApiState(() => window.lastbrowser.sidekick.getAgentWorkspaces(), [ready], ready);
  const agents = arrayFrom(agentsState.data, ['agents', 'items']);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [sessions, setSessions] = useState<AnyRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [agentDetail, setAgentDetail] = useState<AnyRecord>({});
  const [agentMemory, setAgentMemory] = useState<AnyRecord>({});
  const [agentSoul, setAgentSoul] = useState<AnyRecord>({});
  const [chatText, setChatText] = useState('');
  const [command, setCommand] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Dashboard');
  const selectedAgent = agents.find((agent) => idOf(agent) === selectedSlug) || agents[0] || null;

  useEffect(() => {
    if (!selectedSlug && selectedAgent) setSelectedSlug(idOf(selectedAgent));
  }, [selectedAgent, selectedSlug]);

  useEffect(() => {
    setSection(activeContextItem || 'Dashboard');
  }, [activeContextItem]);

  const refreshAgentSessions = useCallback(async (): Promise<void> => {
    if (!ready || !selectedSlug) return;
    try {
      const payload = await window.lastbrowser.sidekick.listAgentSessions({ slug: selectedSlug });
      const nextSessions = arrayFrom(payload, ['sessions', 'items']);
      setSessions(nextSessions);
      setSelectedSessionId((current) => current || (nextSessions[0] ? idOf(nextSessions[0]) : ''));
      setError('');
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : String(sessionError));
    }
  }, [ready, selectedSlug]);

  useEffect(() => {
    void refreshAgentSessions();
  }, [refreshAgentSessions]);

  useEffect(() => {
    if (!ready || !selectedSlug) return;
    void Promise.all([
      window.lastbrowser.sidekick.getAgent({ slug: selectedSlug }),
      window.lastbrowser.sidekick.getAgentMemory({ slug: selectedSlug }),
      window.lastbrowser.sidekick.getAgentSoul({ slug: selectedSlug })
    ]).then(([detail, memory, soul]) => {
      setAgentDetail(detail);
      setAgentMemory(memory);
      setAgentSoul(soul);
    }).catch((agentError) => setError(agentError instanceof Error ? agentError.message : String(agentError)));
  }, [ready, selectedSlug]);

  useEffect(() => {
    return window.lastbrowser.sidekick.onAgentWorkspaceEvent((payload) => {
      const event = isRecord(payload.event) ? payload.event : payload;
      setEvents((current) => [...current.slice(-120), jsonPreview(event)]);
    });
  }, []);

  async function createAgentRecord(): Promise<void> {
    const slug = window.prompt('Agent slug', 'researcher');
    if (!slug?.trim()) return;
    const name = window.prompt('Agent name', slug.trim()) || slug.trim();
    await window.lastbrowser.sidekick.createAgent({ slug: slug.trim(), name });
    setSelectedSlug(slug.trim());
    await agentsState.refresh();
  }

  async function renameAgent(): Promise<void> {
    if (!selectedSlug) return;
    const name = window.prompt('Agent name', titleOf(selectedAgent || {}, selectedSlug));
    if (!name?.trim()) return;
    await window.lastbrowser.sidekick.updateAgent({ slug: selectedSlug, patch: { name: name.trim() } });
    await agentsState.refresh();
  }

  async function removeAgent(): Promise<void> {
    if (!selectedSlug || !window.confirm(`Delete agent ${selectedSlug}?`)) return;
    await window.lastbrowser.sidekick.deleteAgent({ slug: selectedSlug });
    setSelectedSlug('');
    await agentsState.refresh();
  }

  async function activateSelectedAgent(): Promise<void> {
    if (!selectedSlug) return;
    await window.lastbrowser.sidekick.activateAgent({ slug: selectedSlug });
    await window.lastbrowser.sidekick.setCurrentAgent({ slug: selectedSlug });
    await currentState.refresh();
    await agentsState.refresh();
  }

  async function saveSelectedProfile(): Promise<void> {
    if (!selectedSlug) return;
    await window.lastbrowser.sidekick.saveAgentProfile({
      slug: selectedSlug,
      profile: isRecord(agentDetail.profile) ? agentDetail.profile : agentDetail
    });
  }

  async function sendAgentChat(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedSlug || !chatText.trim()) return;
    const payload = await window.lastbrowser.sidekick.startAgentChat({
      slug: selectedSlug,
      sessionId: selectedSessionId,
      message: chatText.trim()
    });
    setChatText('');
    setSelectedSessionId(text(payload.session_id || payload.sessionId || selectedSessionId));
    await refreshAgentSessions();
  }

  async function startWorkspace(): Promise<void> {
    if (!selectedSlug || !selectedSessionId) return;
    await window.lastbrowser.sidekick.startAgentWorkspaceProcess({ slug: selectedSlug, sessionId: selectedSessionId });
    const result = await window.lastbrowser.sidekick.startAgentWorkspaceStream({ sessionId: selectedSessionId });
    setEvents((current) => [...current, `stream ${result.streamId} started`]);
  }

  async function sendCommand(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedSessionId || !command.trim()) return;
    await window.lastbrowser.sidekick.sendAgentWorkspaceCommand({ sessionId: selectedSessionId, command: command.trim() });
    setCommand('');
  }

  return (
    <section className="browser-main native-rest-main agents-main">
      <NativeHeader icon={<Bot size={21} />} title="Agents" kicker="Native Agents" detail="Dashboard, CRUD, sessions, agent chat and workspace terminal without a WebUI embed." loading={agentsState.loading} ready={ready} onRefresh={agentsState.refresh} />
      <AdvancedWebUiTools panel="agents" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {['Dashboard', 'Agents', 'Chat sessions', 'Workspace terminal', 'Create agent'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <section className="native-work-card detail-json-card">
        <header><strong>{section}</strong></header>
        <pre>{jsonPreview({
          agentCount: agents.length,
          sessionCount: sessions.length,
          activeAgent: selectedAgent ? titleOf(selectedAgent) : null,
          activeSessionId,
          currentAgent: currentState.data ? titleOf(currentState.data) : null,
          splash: splashState.data,
          stats: statsState.data
        })}</pre>
      </section>
      <div className="agent-dashboard">
        <aside className="integration-list">
          <div className="native-card-actions">
            <button type="button" onClick={() => void createAgentRecord()} disabled={!ready}><Plus size={13} /><span>Create</span></button>
            <button type="button" onClick={() => void renameAgent()} disabled={!ready || !selectedSlug}><Edit3 size={13} /><span>Edit</span></button>
            <button type="button" onClick={() => void activateSelectedAgent()} disabled={!ready || !selectedSlug}><CheckCircle2 size={13} /><span>Activate</span></button>
            <button type="button" className="danger" onClick={() => void removeAgent()} disabled={!ready || !selectedSlug}><Trash2 size={13} /><span>Delete</span></button>
          </div>
          <section className="agent-splash-status">
            <strong>Splash</strong>
            <span>{text(splashState.data?.status || splashState.data?.state || 'setup')}</span>
          </section>
          {agents.map((agent) => (
            <button key={idOf(agent)} type="button" className={`integration-row ${idOf(agent) === selectedSlug ? 'active' : ''}`} onClick={() => setSelectedSlug(idOf(agent))}>
              <img src={brandAssets.sidebarIcons.agents} alt="" />
              <span>{titleOf(agent)}</span>
              <small>{idOf(agent)} {currentState.data && idOf(currentState.data) === idOf(agent) ? 'active' : ''}</small>
            </button>
          ))}
          {!agents.length && <EmptyState icon={<Bot size={22} />} label={ready ? 'No agents configured.' : 'Sidekick is starting.'} />}
        </aside>
        <main className={`agent-main-grid ${section.toLowerCase().replace(/\s+/g, '-')}`}>
          <ErrorLine error={agentsState.error || statsState.error || activitiesState.error || profilesState.error || workspacesState.error || error} />
          {(section === 'Dashboard' || section === 'Agents' || section === 'Create agent') && (
            <section className="native-work-card agent-detail-card">
            <header>
              <h2>{selectedAgent ? titleOf(selectedAgent) : 'Select an agent'}</h2>
              <button type="button" onClick={() => void saveSelectedProfile()} disabled={!ready || !selectedSlug}><Save size={13} />Profile</button>
            </header>
            <div className="agent-stat-strip">
              {Object.entries(statsState.data || {}).slice(0, 4).map(([key, value]) => <span key={key}><strong>{String(value)}</strong>{key}</span>)}
            </div>
            <pre>{jsonPreview({ detail: agentDetail || selectedAgent, memory: agentMemory, soul: agentSoul })}</pre>
            <div className="compact-list">
              {arrayFrom(activitiesState.data, ['activities', 'items']).slice(0, 5).map((activity) => <article key={idOf(activity)}><strong>{titleOf(activity, 'Activity')}</strong><span>{text(activity.message || activity.detail || activity.type)}</span></article>)}
            </div>
            </section>
          )}
          {(section === 'Dashboard' || section === 'Chat sessions') && (
            <section className="native-work-card agent-chat-card">
            <header><strong>Agent Chat</strong><button type="button" onClick={() => void refreshAgentSessions()} disabled={!ready}><RefreshCw size={13} /></button></header>
            <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)}>
              {sessions.map((session) => <option key={idOf(session)} value={idOf(session)}>{titleOf(session, idOf(session))}</option>)}
            </select>
            <form onSubmit={(event) => void sendAgentChat(event)} className="inline-form">
              <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Message agent..." />
              <button type="submit" disabled={!ready || !selectedSlug || !chatText.trim()}><Send size={14} /></button>
            </form>
            <div className="agent-session-list">
              {sessions.map((session) => <button key={idOf(session)} type="button" onClick={() => setSelectedSessionId(idOf(session))}>{titleOf(session, idOf(session))}</button>)}
            </div>
            <pre>{jsonPreview({ profiles: profilesState.data, workspaces: workspacesState.data })}</pre>
          </section>
          )}
          {(section === 'Dashboard' || section === 'Workspace terminal') && (
            <section className="native-work-card agent-terminal">
            <header>
              <strong>Workspace Terminal</strong>
              <div className="native-card-actions">
                <button type="button" onClick={() => void startWorkspace()} disabled={!ready || !selectedSessionId}><Terminal size={13} /><span>Start</span></button>
                <button type="button" onClick={() => selectedSessionId && window.lastbrowser.sidekick.stopAgentWorkspace({ sessionId: selectedSessionId })} disabled={!ready || !selectedSessionId}><Trash2 size={13} /><span>Stop</span></button>
              </div>
            </header>
            <form onSubmit={(event) => void sendCommand(event)} className="inline-form">
              <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Command..." />
              <button type="submit" disabled={!ready || !selectedSessionId || !command.trim()}><Send size={14} /></button>
            </form>
            <pre>{events.length ? events.join('\n') : 'Terminal events will appear here.'}</pre>
          </section>
          )}
        </main>
      </div>
    </section>
  );
}

export function NativeProfilesMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const state = useApiState(() => window.lastbrowser.sidekick.listProfiles(), [ready], ready);
  const profiles = arrayFrom(state.data, ['profiles', 'items']);
  const [selected, setSelected] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Profiles');
  const current = profiles.find((profile) => idOf(profile) === selected) || profiles[0] || null;

  useEffect(() => {
    if (!selected && current) setSelected(idOf(current));
  }, [current, selected]);

  useEffect(() => {
    setSection(activeContextItem || 'Profiles');
  }, [activeContextItem]);

  async function create(): Promise<void> {
    const name = window.prompt('Profile name', 'default');
    if (!name?.trim()) return;
    const model = window.prompt('Model', 'gpt-5.5') || '';
    await window.lastbrowser.sidekick.createProfile({ name: name.trim(), model });
    setSelected(name.trim());
    await state.refresh();
  }

  async function activate(): Promise<void> {
    if (!selected) return;
    await window.lastbrowser.sidekick.switchProfile({ name: selected });
    await state.refresh();
  }

  async function remove(): Promise<void> {
    if (!selected || !window.confirm(`Delete profile ${selected}?`)) return;
    await window.lastbrowser.sidekick.deleteProfile({ name: selected });
    setSelected('');
    await state.refresh();
  }

  return (
    <section className="browser-main native-rest-main profiles-main">
      <NativeHeader icon={<Users size={21} />} title="Agent Profiles" kicker="Profiles" detail="Profile selection, defaults, gateway/model/workspace display and basic profile management." loading={state.loading} ready={ready} onRefresh={state.refresh} />
      <AdvancedWebUiTools panel="profiles" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {['Profiles', 'Active profile', 'Gateway', 'Model defaults'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <div className="native-rest-split">
        <aside className="integration-list">
          <button type="button" className="new-session-button" onClick={() => void create()} disabled={!ready}><Plus size={15} />New profile</button>
          {profiles.map((profile) => (
            <button key={idOf(profile)} type="button" className={`integration-row ${idOf(profile) === selected ? 'active' : ''}`} onClick={() => setSelected(idOf(profile))}>
              <img src={brandAssets.sidebarIcons.profiles} alt="" />
              <span>{titleOf(profile)}</span>
              <small>{text(profile.model || profile.gateway || profile.provider)}</small>
            </button>
          ))}
        </aside>
        <main className="native-rest-detail">
          <ErrorLine error={state.error} />
          <section className="native-work-card detail-json-card">
            <header>
              <strong>{section}: {current ? titleOf(current) : 'No profile selected'}</strong>
              <div className="native-card-actions">
                <button type="button" onClick={() => void activate()} disabled={!ready || !selected}><CheckCircle2 size={13} /><span>Activate</span></button>
                <button type="button" className="danger" onClick={() => void remove()} disabled={!ready || !selected}><Trash2 size={13} /><span>Delete</span></button>
              </div>
            </header>
            <pre>{jsonPreview(
              section === 'Gateway'
                ? { gateway: current?.gateway || current?.provider || state.data?.gateway || state.data?.provider || current }
                : section === 'Model defaults'
                  ? { model: current?.model || state.data?.default_model, defaults: current?.defaults || state.data?.defaults || state.data }
                  : section === 'Active profile'
                    ? { active: current, current: state.data?.current || state.data?.active || current }
                    : current || state.data || {}
            )}</pre>
          </section>
        </main>
      </div>
    </section>
  );
}

export function NativeMemoryMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const memoryState = useApiState(() => window.lastbrowser.sidekick.getMemory(), [ready], ready);
  const superState = useApiState(() => window.lastbrowser.sidekick.getSupermemoryStatus(), [ready], ready);
  const docsState = useApiState(() => window.lastbrowser.sidekick.listSupermemoryDocuments(), [ready], ready);
  const [section, setSection] = useState((activeContextItem || 'Core memory').toLowerCase().includes('user') ? 'user' : 'memory');
  const [focus, setFocus] = useState(activeContextItem || 'Core memory');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AnyRecord[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<AnyRecord | null>(null);
  const [documentDetail, setDocumentDetail] = useState<AnyRecord | null>(null);

  useEffect(() => {
    setFocus(activeContextItem || 'Core memory');
    setSection((activeContextItem || 'Core memory').toLowerCase().includes('user') ? 'user' : 'memory');
  }, [activeContextItem]);

  useEffect(() => {
    if (!memoryState.data) return;
    const value = memoryState.data[section] || (isRecord(memoryState.data.memory) ? memoryState.data.memory[section] : '');
    setDraft(typeof value === 'string' ? value : jsonPreview(value));
  }, [memoryState.data, section]);

  async function save(): Promise<void> {
    await window.lastbrowser.sidekick.writeMemory({ section, content: draft });
    await memoryState.refresh();
  }

  async function runSearch(kind: 'super' | 'hybrid'): Promise<void> {
    if (!search.trim()) return;
    const payload = kind === 'super'
      ? await window.lastbrowser.sidekick.searchSupermemory({ query: search.trim(), limit: 20 })
      : await window.lastbrowser.sidekick.hybridMemorySearch({ query: search.trim(), limit: 20 });
    setResults(arrayFrom(payload, ['results', 'documents', 'items']));
  }

  async function addDocument(): Promise<void> {
    const title = window.prompt('Document title', 'Memory note');
    if (!title?.trim()) return;
    const content = window.prompt('Document content', '') || '';
    await window.lastbrowser.sidekick.addSupermemoryDocument({ title: title.trim(), content });
    await docsState.refresh();
  }

  async function openDocument(item: AnyRecord): Promise<void> {
    setSelectedDocument(item);
    const payload = await window.lastbrowser.sidekick.getSupermemoryDocument({ id: idOf(item) });
    setDocumentDetail(payload);
  }

  async function forgetDocument(): Promise<void> {
    if (!selectedDocument || !window.confirm(`Forget ${titleOf(selectedDocument)}?`)) return;
    await window.lastbrowser.sidekick.forgetSupermemoryDocument({ id: idOf(selectedDocument) });
    setSelectedDocument(null);
    setDocumentDetail(null);
    await docsState.refresh();
  }

  return (
    <section className="browser-main native-rest-main memory-main">
      <NativeHeader icon={<Brain size={21} />} title="Memory" kicker="Memory" detail="Core memory sections, Supermemory status/list/search and hybrid search in native UI." loading={memoryState.loading} ready={ready} onRefresh={memoryState.refresh} />
      <AdvancedWebUiTools panel="memory" serviceStatus={serviceStatus} compact />
      <ErrorLine error={memoryState.error || superState.error || docsState.error} />
      <div className="native-card-actions insights-tabs">
        {['Core memory', 'User facts', 'Supermemory', 'Hybrid search'].map((item) => (
          <button
            key={item}
            type="button"
            className={item === focus ? 'active' : ''}
            onClick={() => {
              setFocus(item);
              setSection(item === 'User facts' ? 'user' : 'memory');
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="memory-grid">
        {(focus === 'Supermemory' || focus === 'Hybrid search') && (
          <section className="native-work-card memory-super">
            <header>
              <strong>{focus}</strong>
              <div className="native-card-actions">
                <button type="button" onClick={() => void addDocument()} disabled={!ready}><Plus size={13} />Add</button>
                <button type="button" className="danger" onClick={() => void forgetDocument()} disabled={!ready || !selectedDocument}><Trash2 size={13} />Forget</button>
              </div>
            </header>
            <pre>{jsonPreview(superState.data || {})}</pre>
            <div className="native-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search memory..." /></div>
            <div className="native-card-actions">
              <button type="button" onClick={() => void runSearch('super')} disabled={!ready || !search.trim()}><Search size={13} /><span>Super Search</span></button>
              <button type="button" onClick={() => void runSearch('hybrid')} disabled={!ready || !search.trim()}><Sparkles size={13} /><span>Hybrid Search</span></button>
            </div>
            <div className="compact-list">
              {[...results, ...arrayFrom(docsState.data, ['documents', 'items']).slice(0, results.length ? 0 : 8)].map((item) => (
                <article key={idOf(item)} className={idOf(item) === idOf(selectedDocument || {}) ? 'active' : ''} onClick={() => void openDocument(item)}><strong>{titleOf(item)}</strong><span>{text(item.content || item.text || item.id)}</span></article>
              ))}
            </div>
            <pre>{documentDetail ? jsonPreview(documentDetail) : 'Select a Supermemory document to inspect the full payload.'}</pre>
          </section>
        )}
        <section className="native-work-card memory-editor">
          <header>
            <div className="settings-section-nav">
              {['memory', 'user'].map((item) => <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>)}
            </div>
            <button type="button" onClick={() => void save()} disabled={!ready}><Save size={13} />Save</button>
          </header>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
        </section>
        {!(focus === 'Supermemory' || focus === 'Hybrid search') && (
          <section className="native-work-card memory-super">
            <header>
              <strong>Supermemory</strong>
              <div className="native-card-actions">
                <button type="button" onClick={() => void addDocument()} disabled={!ready}><Plus size={13} />Add</button>
                <button type="button" className="danger" onClick={() => void forgetDocument()} disabled={!ready || !selectedDocument}><Trash2 size={13} />Forget</button>
              </div>
            </header>
            <pre>{jsonPreview(superState.data || {})}</pre>
            <div className="native-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search memory..." /></div>
            <div className="native-card-actions">
              <button type="button" onClick={() => void runSearch('super')} disabled={!ready || !search.trim()}><Search size={13} /><span>Super Search</span></button>
              <button type="button" onClick={() => void runSearch('hybrid')} disabled={!ready || !search.trim()}><Sparkles size={13} /><span>Hybrid Search</span></button>
            </div>
            <div className="compact-list">
              {[...results, ...arrayFrom(docsState.data, ['documents', 'items']).slice(0, results.length ? 0 : 8)].map((item) => (
                <article key={idOf(item)} className={idOf(item) === idOf(selectedDocument || {}) ? 'active' : ''} onClick={() => void openDocument(item)}><strong>{titleOf(item)}</strong><span>{text(item.content || item.text || item.id)}</span></article>
              ))}
            </div>
            <pre>{documentDetail ? jsonPreview(documentDetail) : 'Select a Supermemory document to inspect the full payload.'}</pre>
          </section>
        )}
      </div>
    </section>
  );
}

export function NativeInsightsMain({
  serviceStatus,
  activeContextItem
}: {
  serviceStatus: ServiceStatus | null;
  activeContextItem: string;
}): JSX.Element {
  const ready = isReady(serviceStatus);
  const [days, setDays] = useState(14);
  const [section, setSection] = useState(activeContextItem || 'Usage');
  const insights = useApiState(() => window.lastbrowser.sidekick.getInsights({ days }), [ready, days], ready);
  const wiki = useApiState(() => window.lastbrowser.sidekick.getWikiStatus(), [ready], ready);
  const normalizedSection = section.toLowerCase();
  const metricEntries = Object.entries(insights.data || {})
    .filter(([key, value]) => {
      if (typeof value !== 'number' && typeof value !== 'string') return false;
      if (normalizedSection === 'models') return /model|provider/i.test(key);
      if (normalizedSection === 'cost') return /cost|token|usage|bill/i.test(key);
      return true;
    })
    .slice(0, 10);

  useEffect(() => {
    setSection(activeContextItem || 'Usage');
  }, [activeContextItem]);

  return (
    <section className="browser-main native-rest-main insights-main">
      <NativeHeader icon={<Gauge size={21} />} title="Insights" kicker="Observability" detail="Activity, token/cost/model metrics and LLM wiki status from the existing backend." loading={insights.loading} ready={ready} onRefresh={insights.refresh} />
      <AdvancedWebUiTools panel="insights" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {['Usage', 'Models', 'Cost', 'LLM wiki'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <div className="native-card-actions"><select value={days} onChange={(event) => setDays(Number(event.target.value))}>{[7, 14, 30, 90].map((value) => <option key={value} value={value}>{value} days</option>)}</select></div>
      <ErrorLine error={insights.error || wiki.error} />
      <div className="metric-grid">
        {metricEntries.map(([key, value]) => <article key={key} className="native-work-card metric-card"><span>{key}</span><strong>{String(value)}</strong></article>)}
        {!metricEntries.length && <EmptyState icon={<Gauge size={24} />} label={ready ? 'No metrics yet.' : 'Sidekick is starting.'} />}
      </div>
      {normalizedSection === 'llm wiki' || normalizedSection === 'wiki' ? (
        <section className="native-work-card detail-json-card"><header><strong>LLM Wiki Status</strong></header><pre>{jsonPreview(wiki.data || {})}</pre></section>
      ) : (
        <section className="native-work-card detail-json-card"><header><strong>{section}</strong></header><pre>{jsonPreview(normalizedSection === 'models' ? { models: insights.data?.models || insights.data?.model_stats || insights.data?.providers || {} } : normalizedSection === 'cost' ? { cost: insights.data?.cost || insights.data?.billing || insights.data?.usage || {} } : insights.data || {})}</pre></section>
      )}
    </section>
  );
}

export function NativeLogsMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const [file, setFile] = useState('agent');
  const [tail, setTail] = useState(200);
  const [severity, setSeverity] = useState('');
  const [wrap, setWrap] = useState(true);
  const [auto, setAuto] = useState(false);
  const [section, setSection] = useState(activeContextItem || 'Agent');
  const logs = useApiState(() => window.lastbrowser.sidekick.getLogs({ file, tail }), [ready, file, tail], ready);
  const lines = text(logs.data?.text || logs.data?.logs || logs.data?.content).split(/\r?\n/).filter((line) => !severity || line.toLowerCase().includes(severity.toLowerCase()));

  useEffect(() => {
    const nextSection = activeContextItem || 'Agent';
    setSection(nextSection);
    const nextFile = nextSection === 'WebUI' ? 'webui' : nextSection === 'Errors' ? 'errors' : nextSection === 'Gateway' ? 'gateway' : 'agent';
    setFile(nextFile);
  }, [activeContextItem]);

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => void logs.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [auto, logs]);

  return (
    <section className="browser-main native-rest-main logs-main">
      <NativeHeader icon={<FileText size={21} />} title="Logs" kicker="Observability" detail="Log file selection, tail size, severity filter, wrap and auto-refresh." loading={logs.loading} ready={ready} onRefresh={logs.refresh} />
      <AdvancedWebUiTools panel="logs" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {['Agent', 'WebUI', 'Errors', 'Gateway'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => { setSection(item); setFile(item === 'WebUI' ? 'webui' : item === 'Errors' ? 'errors' : item === 'Gateway' ? 'gateway' : 'agent'); }}>{item}</button>
        ))}
      </div>
      <div className="log-toolbar native-work-card">
        <select value={file} onChange={(event) => setFile(event.target.value)}>{['agent', 'webui', 'errors', 'gateway'].map((item) => <option key={item}>{item}</option>)}</select>
        <select value={tail} onChange={(event) => setTail(Number(event.target.value))}>{[100, 200, 500, 1000].map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <input value={severity} onChange={(event) => setSeverity(event.target.value)} placeholder="Filter severity/text" />
        <label><input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />Wrap</label>
        <label><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} />Auto</label>
      </div>
      <ErrorLine error={logs.error} />
      <pre className={`log-viewer ${wrap ? 'wrap' : ''}`}>{lines.join('\n') || 'No log lines loaded.'}</pre>
    </section>
  );
}

export function NativeGmailMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const accounts = useApiState(() => window.lastbrowser.sidekick.listGmailAccounts(), [ready], ready);
  const folders = useApiState(() => window.lastbrowser.sidekick.listGmailFolders(), [ready], ready);
  const [folder, setFolder] = useState('inbox');
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Inbox');
  const messages = useApiState(() => query.trim()
    ? window.lastbrowser.sidekick.searchGmailMessages({ query, max: 25 })
    : window.lastbrowser.sidekick.listGmailMessages({ folder, max: 25 }), [ready, folder, query], ready);
  const [selected, setSelected] = useState<AnyRecord | null>(null);
  const [detail, setDetail] = useState<AnyRecord | null>(null);
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });
  const mailItems = arrayFrom(messages.data, ['messages', 'threads', 'items']);

  useEffect(() => {
    const nextSection = activeContextItem || 'Inbox';
    setSection(nextSection);
    if (nextSection === 'Accounts') {
      setFolder('inbox');
      setQuery('');
    }
    if (nextSection === 'Search') {
      setQuery((current) => current || '');
    }
    if (nextSection === 'Inbox') {
      setQuery('');
      setFolder('inbox');
    }
  }, [activeContextItem]);

  async function openMessage(item: AnyRecord): Promise<void> {
    setSelected(item);
    setDetail(await window.lastbrowser.sidekick.readGmailMessage({ id: idOf(item), messageId: idOf(item), threadId: text(item.thread_id) }));
  }

  async function aiAction(action: 'summary' | 'draft' | 'task'): Promise<void> {
    const request = { id: idOf(selected || {}), messageId: idOf(selected || {}), threadId: text(selected?.thread_id), title: titleOf(selected || {}, 'Follow up') };
    const payload = action === 'summary'
      ? await window.lastbrowser.sidekick.summarizeGmailThread(request)
      : action === 'draft'
        ? await window.lastbrowser.sidekick.draftGmailReply({ ...request, variants: 3, instruction: 'Draft a concise reply.' })
        : await window.lastbrowser.sidekick.createGmailTask(request);
    setDetail(payload);
  }

  async function sendCompose(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!compose.to.trim() || !compose.body.trim()) return;
    const payload = await window.lastbrowser.sidekick.sendGmailMessage(compose);
    setDetail(payload);
    setCompose({ to: '', subject: '', body: '' });
    await messages.refresh();
  }

  async function deleteSelected(): Promise<void> {
    if (!selected || !window.confirm(`Delete ${titleOf(selected, 'message')}?`)) return;
    await window.lastbrowser.sidekick.deleteGmailMessage({ id: idOf(selected), messageId: idOf(selected), threadId: text(selected.thread_id) });
    setSelected(null);
    setDetail(null);
    await messages.refresh();
  }

  async function moveSelected(targetFolder: string): Promise<void> {
    if (!selected) return;
    await window.lastbrowser.sidekick.moveGmailMessage({ id: idOf(selected), messageId: idOf(selected), threadId: text(selected.thread_id), folder: targetFolder });
    await messages.refresh();
  }

  return (
    <section className="browser-main native-rest-main gmail-main">
      <NativeHeader icon={<Mail size={21} />} title="Gmail" kicker="Mail" detail="Accounts, folders, search, thread readout and AI actions with native controls." loading={messages.loading} ready={ready} onRefresh={messages.refresh} />
      <AdvancedWebUiTools panel="gmail" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {['Accounts', 'Inbox', 'Search', 'AI actions'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <div className="native-rest-split">
        <aside className="integration-list">
          <div className="native-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Gmail..." /></div>
          <select value={folder} onChange={(event) => setFolder(event.target.value)}>
            {['inbox', ...arrayFrom(folders.data, ['folders', 'labels']).map((item) => titleOf(item))].map((item) => <option key={item}>{item}</option>)}
          </select>
          {section !== 'Accounts' && mailItems.map((item) => <button key={idOf(item)} type="button" className="integration-row" onClick={() => void openMessage(item)}><Inbox size={18} /><span>{titleOf(item, 'Message')}</span><small>{text(item.from || item.sender || item.date)}</small></button>)}
          {!mailItems.length && section !== 'Accounts' && <EmptyState icon={<Mail size={22} />} label={ready ? 'No mail loaded.' : 'Sidekick is starting.'} />}
          {section === 'Accounts' && <EmptyState icon={<Mail size={22} />} label={ready ? 'Accounts overview selected.' : 'Sidekick is starting.'} />}
        </aside>
        <main className="native-rest-detail">
          <ErrorLine error={accounts.error || folders.error || messages.error} />
          <section className="native-work-card detail-json-card">
            <header>
              <strong>{section}: {selected ? titleOf(selected, 'Selected message') : 'Gmail detail'}</strong>
              <div className="native-card-actions">
                <button type="button" onClick={() => void aiAction('summary')} disabled={!selected}><Sparkles size={13} /><span>Summary</span></button>
                <button type="button" onClick={() => void aiAction('draft')} disabled={!selected}><Edit3 size={13} /><span>Draft</span></button>
                <button type="button" onClick={() => void aiAction('task')} disabled={!selected}><Plus size={13} /><span>Task</span></button>
                <button type="button" onClick={() => void moveSelected('archive')} disabled={!selected}><Inbox size={13} /><span>Archive</span></button>
                <button type="button" className="danger" onClick={() => void deleteSelected()} disabled={!selected}><Trash2 size={13} /><span>Delete</span></button>
              </div>
            </header>
            <pre>{jsonPreview(section === 'Accounts' ? accounts.data || {} : section === 'Search' ? { query, results: messages.data || {} } : detail || accounts.data || {})}</pre>
          </section>
          <form className="native-work-card gmail-compose" onSubmit={(event) => void sendCompose(event)}>
            <header><strong>Compose</strong><button type="submit" disabled={!ready || !compose.to.trim() || !compose.body.trim()}><Send size={13} />Send</button></header>
            <input value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} placeholder="To" />
            <input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} placeholder="Subject" />
            <textarea value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} placeholder="Message body" />
          </form>
        </main>
      </div>
    </section>
  );
}

export function NativeDiscordMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const guild = useApiState(() => window.lastbrowser.sidekick.getDiscordGuild(), [ready], ready);
  const channels = useApiState(() => window.lastbrowser.sidekick.listDiscordChannels(), [ready], ready);
  const channelTree = useApiState(() => window.lastbrowser.sidekick.listDiscordChannelsTree(), [ready], ready);
  const roles = useApiState(() => window.lastbrowser.sidekick.listDiscordRoles(), [ready], ready);
  const stats = useApiState(() => window.lastbrowser.sidekick.getDiscordStats(), [ready], ready);
  const botInfo = useApiState(() => window.lastbrowser.sidekick.getDiscordBotInfo(), [ready], ready);
  const warns = useApiState(() => window.lastbrowser.sidekick.getDiscordWarns(), [ready], ready);
  const [channelId, setChannelId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [purgeAmount, setPurgeAmount] = useState(10);
  const [selectedMember, setSelectedMember] = useState<AnyRecord | null>(null);
  const [section, setSection] = useState(activeContextItem || 'Guild');
  const members = useApiState(() => window.lastbrowser.sidekick.listDiscordMembers({ query: memberQuery }), [ready, memberQuery], ready);
  const messages = useApiState(() => channelId ? window.lastbrowser.sidekick.listDiscordMessages({ channelId, limit: 50 }) : Promise.resolve({}), [ready, channelId], ready && Boolean(channelId));
  const treeChannels = arrayFrom(channelTree.data, ['uncategorized', 'channels', 'items']);
  const categoryChannels = arrayFrom(channelTree.data, ['categories']).flatMap((category) => arrayFrom(category, ['channels']));
  const channelItems = [...treeChannels, ...categoryChannels, ...arrayFrom(channels.data, ['channels', 'items'])];

  useEffect(() => {
    if (!channelId && channelItems[0]) setChannelId(idOf(channelItems[0]));
  }, [channelId, channelItems]);

  useEffect(() => {
    setSection(activeContextItem || 'Guild');
  }, [activeContextItem]);

  async function send(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!channelId || !messageText.trim()) return;
    await window.lastbrowser.sidekick.sendDiscordMessage({ channelId, content: messageText.trim() });
    setMessageText('');
    await messages.refresh();
  }

  async function moderate(action: 'warn' | 'timeout' | 'kick' | 'ban' | 'untimeout' | 'unban'): Promise<void> {
    if (!selectedMember) return;
    const request = { userId: idOf(selectedMember), reason: 'Manual moderation', minutes: 10, deleteDays: 1 };
    if (action === 'warn') await window.lastbrowser.sidekick.warnDiscordMember(request);
    if (action === 'timeout') await window.lastbrowser.sidekick.timeoutDiscordMember(request);
    if (action === 'kick') await window.lastbrowser.sidekick.kickDiscordMember(request);
    if (action === 'ban') await window.lastbrowser.sidekick.banDiscordMember(request);
    if (action === 'untimeout') await window.lastbrowser.sidekick.untimeoutDiscordMember(request);
    if (action === 'unban') await window.lastbrowser.sidekick.unbanDiscordMember(request);
    await warns.refresh();
  }

  async function purgeChannel(): Promise<void> {
    if (!channelId || !window.confirm(`Delete up to ${purgeAmount} messages in this channel?`)) return;
    await window.lastbrowser.sidekick.purgeDiscordChannel({ channelId, amount: purgeAmount });
    await messages.refresh();
  }

  async function saveModerationConfig(): Promise<void> {
    await window.lastbrowser.sidekick.configureDiscord({
      action: 'save',
      values: { auto_mod_enabled: true, spam_timeout_minutes: 10 }
    });
  }

  return (
    <section className="browser-main native-rest-main discord-main">
      <NativeHeader icon={<Users size={21} />} title="Discord" kicker="Community" detail="Guild, channels, members, messages and moderation actions in native UI." loading={channels.loading} ready={ready} onRefresh={channels.refresh} />
      <AdvancedWebUiTools panel="discord" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {['Guild', 'Channels', 'Members', 'Moderation'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <div className="discord-grid">
        {section !== 'Members' && (
          <aside className="integration-list">
            {channelItems.map((channel) => <button key={idOf(channel)} type="button" className={`integration-row ${idOf(channel) === channelId ? 'active' : ''}`} onClick={() => setChannelId(idOf(channel))}><MessageSquare size={17} /><span>{titleOf(channel)}</span><small>{idOf(channel)}</small></button>)}
          </aside>
        )}
        <main className="native-work-card discord-messages">
          <ErrorLine error={guild.error || channels.error || channelTree.error || roles.error || stats.error || botInfo.error || warns.error || messages.error} />
          <header>
            <strong>{section}: {channelId || 'Channel'}</strong>
            <div className="native-card-actions discord-moderation">
              <input type="number" value={purgeAmount} min={1} max={100} onChange={(event) => setPurgeAmount(Number(event.target.value))} />
              <button type="button" className="danger" onClick={() => void purgeChannel()} disabled={!ready || !channelId}><Trash2 size={13} />Purge</button>
              <button type="button" onClick={() => void saveModerationConfig()} disabled={!ready}><Save size={13} />Config</button>
            </div>
          </header>
          <pre>{jsonPreview(section === 'Guild' ? { guild: guild.data, stats: stats.data, bot: botInfo.data, roles: roles.data } : section === 'Moderation' ? { selectedMember, warns: warns.data } : { channelId, messages: messages.data, roles: roles.data })}</pre>
          {section !== 'Guild' && section !== 'Moderation' && (
            <>
              <div className="compact-list">{arrayFrom(messages.data, ['messages', 'items']).map((item) => <article key={idOf(item)}><strong>{text(item.author || item.username || item.user)}</strong><span>{text(item.content || item.message)}</span></article>)}</div>
              <form className="inline-form" onSubmit={(event) => void send(event)}>
                <input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Send message..." />
                <button type="submit" disabled={!ready || !channelId || !messageText.trim()}><Send size={14} /></button>
              </form>
            </>
          )}
        </main>
        {section !== 'Guild' && (
          <aside className="native-work-card discord-members">
            <div className="native-search"><Search size={14} /><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search members..." /></div>
            {arrayFrom(members.data, ['members', 'items']).map((member) => (
              <article key={idOf(member)} className={idOf(member) === idOf(selectedMember || {}) ? 'active' : ''} onClick={() => setSelectedMember(member)}>
                <strong>{titleOf(member, idOf(member))}</strong>
                <div className="native-card-actions">
                  <button type="button" onClick={() => void moderate('warn')}><Shield size={13} />Warn</button>
                  <button type="button" onClick={() => void moderate('timeout')}><Terminal size={13} />Timeout</button>
                  <button type="button" onClick={() => void moderate('kick')}>Kick</button>
                  <button type="button" onClick={() => void moderate('ban')}>Ban</button>
                  <button type="button" onClick={() => void moderate('untimeout')}>Untimeout</button>
                  <button type="button" onClick={() => void moderate('unban')}>Unban</button>
                </div>
              </article>
            ))}
            <pre>{jsonPreview({ section, selectedMember, warns: warns.data })}</pre>
          </aside>
        )}
      </div>
    </section>
  );
}

type SidebarAppPanel = 'gmail' | 'discord';

function sidebarAppPanelForApp(app: AnyRecord): SidebarAppPanel | null {
  const candidate = text(app.id || app.app_id || app.slug || app.name || app.title || app.panel || '').toLowerCase();
  if (candidate.includes('gmail') || candidate.includes('mail')) return 'gmail';
  if (candidate.includes('discord')) return 'discord';
  return null;
}

export function NativeAppstoreMain({
  activeContextItem,
  serviceStatus,
  onInstalledSidebarApp,
  onUninstalledSidebarApp
}: {
  activeContextItem: string;
  serviceStatus: ServiceStatus | null;
  onInstalledSidebarApp: (panel: SidebarAppPanel) => void;
  onUninstalledSidebarApp: (panel: SidebarAppPanel) => void;
}): JSX.Element {
  const ready = isReady(serviceStatus);
  const [category, setCategory] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Home');
  const appsState = useApiState(() => window.lastbrowser.sidekick.listAppstore({ category }), [ready, category], ready);
  const updates = useApiState(() => window.lastbrowser.sidekick.getAppstoreUpdates(), [ready], ready);
  const sdk = useApiState(() => window.lastbrowser.sidekick.getAppstoreSdk(), [ready], ready);
  const apps = arrayFrom(appsState.data, ['apps', 'items', 'packages']);

  useEffect(() => {
    const nextSection = activeContextItem || 'Home';
    setSection(nextSection);
    setCategory(
      nextSection === 'Home' || nextSection === 'SDK' ? '' :
      nextSection === 'Categories' ? 'browser' :
      nextSection === 'My apps' ? 'community' :
      nextSection === 'Submit' ? 'productivity' :
      ''
    );
  }, [activeContextItem]);

  async function install(app: AnyRecord): Promise<void> {
    await window.lastbrowser.sidekick.installAppstoreApp({ appId: idOf(app) });
    const sidebarPanel = sidebarAppPanelForApp(app);
    if (sidebarPanel) onInstalledSidebarApp(sidebarPanel);
    await appsState.refresh();
  }

  async function uninstall(app: AnyRecord): Promise<void> {
    await window.lastbrowser.sidekick.uninstallAppstoreApp({ appId: idOf(app) });
    const sidebarPanel = sidebarAppPanelForApp(app);
    if (sidebarPanel) onUninstalledSidebarApp(sidebarPanel);
    await appsState.refresh();
  }

  return (
    <section className="browser-main native-rest-main appstore-main">
      <NativeHeader icon={<Package size={21} />} title="Appstore" kicker="Extensions" detail="Native home/category/my apps/sdk/submit surface backed by the appstore endpoints." loading={appsState.loading} ready={ready} onRefresh={appsState.refresh} />
      <AdvancedWebUiTools panel="appstore" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {['Home', 'Categories', 'My apps', 'SDK', 'Submit'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <div className="native-card-actions">
        {['', 'browser', 'ai', 'productivity', 'community'].map((item) => <button key={item || 'all'} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item || 'Home'}</button>)}
        <button type="button" onClick={() => window.lastbrowser.sidekick.updateAllAppstore()} disabled={!ready}><Download size={13} />Update all</button>
      </div>
      <ErrorLine error={appsState.error || updates.error || sdk.error} />
      <section className="native-work-card detail-json-card">
        <header><strong>{section}</strong></header>
        <pre>{jsonPreview({ category, appCount: apps.length, sdk: sdk.data, updates: updates.data })}</pre>
      </section>
      <div className="app-grid-native">
        {apps.map((app) => (
          <article key={idOf(app)} className="native-work-card app-card-native">
            <img src={brandAssets.sidebarIcons.appstore} alt="" />
            <strong>{titleOf(app)}</strong>
            <span>{text(app.description || app.summary || app.category)}</span>
            <div className="native-card-actions">
              <button type="button" onClick={() => void install(app)} disabled={!ready}><Plus size={13} />Install</button>
              <button type="button" className="danger" onClick={() => void uninstall(app)} disabled={!ready}><Trash2 size={13} />Remove</button>
            </div>
          </article>
        ))}
        {!apps.length && <EmptyState icon={<Grid2X2 size={24} />} label={ready ? 'No apps returned by backend.' : 'Sidekick is starting.'} />}
      </div>
      <section className="native-work-card detail-json-card"><header><strong>SDK / Updates</strong></header><pre>{jsonPreview({ sdk: sdk.data, updates: updates.data })}</pre></section>
    </section>
  );
}

export function NativeSettingsMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const state = useApiState(() => window.lastbrowser.sidekick.getSettings(), [ready], ready);
  const [section, setSection] = useState('conversation');
  const [draft, setDraft] = useState('{}');
  const settings = isRecord(state.data?.settings) ? state.data.settings : (state.data || {});
  const sectionKeys: Record<string, string[]> = {
    conversation: ['send_key', 'chat_mode', 'composer_mode', 'default_model', 'profile', 'bot_name'],
    appearance: ['theme', 'skin', 'font_size', 'sidebar_density', 'show_thinking'],
    preferences: ['language', 'notifications', 'sound', 'show_token_usage', 'busy_input_mode'],
    providers: ['provider', 'model_provider', 'gateway', 'api_redact_enabled', 'openai_codex_enabled'],
    plugins: ['plugins', 'enabled_plugins', 'gmail', 'discord'],
    system: ['check_for_updates', 'workspace_root', 'debug', 'password_enabled']
  };

  useEffect(() => {
    const normalized = activeContextItem.trim().toLowerCase();
    const match = Object.keys(sectionKeys).find((key) => key === normalized || key.toLowerCase() === normalized);
    if (match) setSection(match);
  }, [activeContextItem]);

  useEffect(() => {
    const scoped = Object.fromEntries((sectionKeys[section] || []).map((key) => [key, settings[key]]));
    setDraft(JSON.stringify(scoped, null, 2));
  }, [section, settings]);

  async function save(): Promise<void> {
    const patch = JSON.parse(draft || '{}') as AnyRecord;
    await window.lastbrowser.sidekick.saveSettings({ settings: { ...settings, ...patch } });
    await state.refresh();
  }

  function updateDraftField(key: string, value: unknown): void {
    let current: AnyRecord = {};
    try {
      current = JSON.parse(draft || '{}') as AnyRecord;
    } catch {
      current = {};
    }
    setDraft(JSON.stringify({ ...current, [key]: value }, null, 2));
  }

  return (
    <section className="browser-main native-rest-main settings-main">
      <NativeHeader icon={<Settings size={21} />} title="Settings" kicker="System" detail="Conversation, appearance, preferences, providers, plugins and system settings." loading={state.loading} ready={ready} onRefresh={state.refresh} />
      <AdvancedWebUiTools panel="settings" serviceStatus={serviceStatus} compact />
      <ErrorLine error={state.error} />
      <div className="settings-native-grid">
        <nav className="settings-section-nav native-work-card">
          {Object.keys(sectionKeys).map((item) => <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>)}
        </nav>
        <main className="native-work-card settings-editor">
          <header><strong>{section}</strong><button type="button" onClick={() => void save()} disabled={!ready}><Save size={13} />Save</button></header>
          <div className="settings-field-grid">
            {(sectionKeys[section] || []).map((key) => {
              let value: unknown = settings[key];
              try {
                value = (JSON.parse(draft || '{}') as AnyRecord)[key] ?? value;
              } catch {
                value = settings[key];
              }
              if (typeof value === 'boolean' || key.startsWith('show_') || key.endsWith('_enabled') || key === 'debug') {
                return (
                  <label key={key} className="settings-toggle">
                    <input type="checkbox" checked={Boolean(value)} onChange={(event) => updateDraftField(key, event.target.checked)} />
                    <span>{key}</span>
                  </label>
                );
              }
              if (key === 'theme' || key === 'send_key' || key === 'chat_mode' || key === 'composer_mode') {
                const options = key === 'theme'
                  ? ['dark', 'light', 'system']
                  : key === 'send_key'
                    ? ['enter', 'ctrl_enter', 'shift_enter']
                    : ['chat', 'plan', 'action'];
                return (
                  <label key={key}>
                    <span>{key}</span>
                    <select value={text(value)} onChange={(event) => updateDraftField(key, event.target.value)}>
                      {options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                );
              }
              return (
                <label key={key}>
                  <span>{key}</span>
                  <input value={text(value)} onChange={(event) => updateDraftField(key, event.target.value)} />
                </label>
              );
            })}
          </div>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
        </main>
      </div>
    </section>
  );
}
