import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Brain,
  CheckCircle2,
  Edit3,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Terminal,
  Trash2,
  Users
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';
import {
  type ServiceStatus,
  type AnyRecord,
  useApiState,
  isReady,
  arrayFrom,
  isRecord,
  text,
  titleOf,
  idOf,
  formatCompactNumber,
  jsonPreview,
  NativeHeader,
  ErrorLine,
  EmptyState
} from './RestPanelShared.js';

export function NativeSkillsMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const skillsState = useApiState(() => window.lastbrowser.sidekick.listSkills(), [ready], ready);
  const skills = arrayFrom(skillsState.data, ['skills', 'items', 'files']);
  const skillCategories = arrayFrom(skillsState.data, ['categories']).map((item) => text(item)).filter(Boolean);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Library');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [skillCategoryDraft, setSkillCategoryDraft] = useState('');
  const [content, setContent] = useState('');
  const [editorError, setEditorError] = useState('');
  const bundledCatalog = text(skillsState.data?.source) === 'bundled';
  const filtered = skills.filter((skill) => {
    const haystack = jsonPreview(skill).toLowerCase();
    const category = text(skill.category).toLowerCase();
    const matchesCategory = !selectedCategory || category === selectedCategory.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  });
  const selectedSkill = filtered.find((skill) => idOf(skill) === selectedName || text(skill.name) === selectedName) || filtered[0] || null;
  const linkedFiles = isRecord(selectedSkill?.linked_files)
    ? Object.keys(selectedSkill.linked_files)
    : arrayFrom(isRecord(selectedSkill?.linked_files) ? selectedSkill.linked_files : null, ['files']).map(idOf);

  useEffect(() => {
    setSection(activeContextItem || 'Library');
  }, [activeContextItem]);

  useEffect(() => {
    setSkillCategoryDraft(text(selectedSkill?.category));
  }, [selectedSkill?.category, selectedSkill?.name, selectedSkill?.path]);

  const visibleSkills = section === 'Create skill'
    ? filtered.slice(0, 1)
    : section === 'Linked files' && selectedSkill
      ? [selectedSkill]
      : filtered;

  useEffect(() => {
    if (!filtered.length) return;
    const currentMatches = filtered.some((skill) => idOf(skill) === selectedName || text(skill.name) === selectedName);
    if (!currentMatches) {
      setSelectedName(text(filtered[0].name || idOf(filtered[0])));
    }
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
      category: skillCategoryDraft.trim() || text(selectedSkill?.category),
      path: selectedSkill && text(selectedSkill?.source) === 'bundled' ? undefined : text(selectedSkill?.path) || undefined,
      content
    });
    await skillsState.refresh();
  }

  async function createSkill(): Promise<void> {
    const name = window.prompt('Skill name', 'custom-skill');
    if (!name?.trim()) return;
    setSelectedName(name.trim());
    setSelectedFile('');
    setSkillCategoryDraft('');
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
      {bundledCatalog && <section className="native-work-card detail-json-card"><header><strong>Bundled catalog</strong></header><pre>{'Showing the built-in skill catalog from the bundled Lastbrowser resources.\nEdits and new skills will be saved to the active profile skills directory.'}</pre></section>}
      <div className="native-card-actions insights-tabs">
        {['Library', 'Editor', 'Linked files', 'Create skill'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      {skillCategories.length > 0 && (
        <div className="native-card-actions insights-tabs skill-category-tabs">
          <button type="button" className={!selectedCategory ? 'active' : ''} onClick={() => setSelectedCategory('')}>All</button>
          {skillCategories.map((category) => (
            <button key={category} type="button" className={selectedCategory === category ? 'active' : ''} onClick={() => setSelectedCategory((current) => current === category ? '' : category)}>
              {category}
            </button>
          ))}
        </div>
      )}
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
              <button type="button" className="danger" onClick={() => void removeSkill()} disabled={!ready || !selectedName || text(selectedSkill?.source) === 'bundled'}><Trash2 size={13} /><span>Delete</span></button>
            </div>
          </div>
          <div className="settings-field-grid">
            <label className="settings-field">
              <span>Category</span>
              <input value={skillCategoryDraft} onChange={(event) => setSkillCategoryDraft(event.target.value)} placeholder="general" />
            </label>
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
  const currentAgentId = currentState.data ? idOf(currentState.data) : '';
  const currentAgentTitle = currentState.data ? titleOf(currentState.data) : 'No active agent';
  const selectedSession = sessions.find((session) => idOf(session) === selectedSessionId) || null;
  const dashboardCards = [
    { label: 'Agents', value: formatCompactNumber(agents.length) },
    { label: 'Sessions', value: formatCompactNumber(sessions.length) },
    { label: 'Current', value: currentAgentTitle },
    { label: 'Splash', value: text(splashState.data?.status || splashState.data?.state || 'setup') }
  ];
  const profileItems = arrayFrom(profilesState.data, ['profiles', 'items']);
  const workspaceItems = arrayFrom(workspacesState.data, ['workspaces', 'items']);
  const activityItems = arrayFrom(activitiesState.data, ['activities', 'items']);

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
        <header>
          <strong>{section}</strong>
          <div className="native-card-actions">
            <button type="button" onClick={() => void refreshAgentSessions()} disabled={!ready}><RefreshCw size={13} /><span>Sessions</span></button>
            <button type="button" onClick={() => void agentsState.refresh()} disabled={!ready}><RefreshCw size={13} /><span>Agents</span></button>
          </div>
        </header>
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {dashboardCards.map((card) => (
            <article key={card.label} className="metric-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>
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
              <small>{idOf(agent)} {currentAgentId === idOf(agent) ? 'active' : ''}</small>
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
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {[
                { label: 'Selected agent', value: selectedAgent ? titleOf(selectedAgent) : 'None' },
                { label: 'Selected session', value: selectedSession ? titleOf(selectedSession, selectedSessionId) : 'No session' },
                { label: 'Memory', value: text(agentMemory.status || agentMemory.summary || 'available') },
                { label: 'Soul', value: text(agentSoul.status || agentSoul.summary || 'available') }
              ].map((card) => (
                <article key={card.label} className="metric-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </div>
            <div className="compact-list">
              {activityItems.slice(0, 5).map((activity) => <article key={idOf(activity)}><strong>{titleOf(activity, 'Activity')}</strong><span>{text(activity.message || activity.detail || activity.type)}</span></article>)}
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
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {[
                { label: 'Profiles', value: formatCompactNumber(profileItems.length) },
                { label: 'Workspaces', value: formatCompactNumber(workspaceItems.length) },
                { label: 'Selected session', value: selectedSession ? titleOf(selectedSession, selectedSessionId) : 'No session' }
              ].map((card) => (
                <article key={card.label} className="metric-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </div>
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
  const activeProfile = current || profiles[0] || null;

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
      <section className="native-work-card detail-json-card">
        <header><strong>{section}</strong></header>
        <pre>{jsonPreview({
          profileCount: profiles.length,
          activeProfile: activeProfile ? titleOf(activeProfile) : null,
          section,
          hint: section === 'Gateway'
            ? 'Gateway settings and provider bindings for the active profile.'
            : section === 'Model defaults'
              ? 'Default model and fallback model data.'
              : section === 'Active profile'
                ? 'The selected profile that will be applied to the session.'
                : 'Browse and manage agent profiles.'
        })}</pre>
      </section>
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
