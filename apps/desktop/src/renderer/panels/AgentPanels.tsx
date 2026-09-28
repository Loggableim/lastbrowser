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
import { useDesktopI18n } from '../i18n.js';
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
  const { t } = useDesktopI18n();
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
  const sectionTitle = section === 'Create skill'
    ? t('skills.createSkill')
    : section === 'Linked files'
      ? t('agentPanels.linkedFiles')
      : section === 'Editor'
        ? t('agentPanels.editor')
        : t('skills.title');

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
    const name = window.prompt(t('agentPanels.skillNamePrompt'), 'custom-skill');
    if (!name?.trim()) return;
    setSelectedName(name.trim());
    setSelectedFile('');
    setSkillCategoryDraft('');
    setContent(t('agentPanels.newSkillTemplate'));
  }

  async function removeSkill(): Promise<void> {
    if (!selectedName || !window.confirm(t('agentPanels.deleteSkillConfirm', { name: selectedName }))) return;
    await window.lastbrowser.sidekick.deleteSkill({ name: selectedName, path: text(selectedSkill?.path) || undefined });
    setSelectedName('');
    setSelectedFile('');
    setContent('');
    await skillsState.refresh();
  }

  return (
    <section className="browser-main native-rest-main skills-main">
      <NativeHeader icon={<Sparkles size={21} />} title={t('skills.title')} kicker={t('skills.kicker')} detail={t('skills.detail')} loading={skillsState.loading} ready={ready} onRefresh={skillsState.refresh} />
      <AdvancedWebUiTools panel="skills" serviceStatus={serviceStatus} compact />
      {bundledCatalog && <section className="native-work-card detail-json-card"><header><strong>{t('agentPanels.bundledCatalog')}</strong></header><pre>{t('agentPanels.bundledCatalogDescription')}</pre></section>}
      <div className="native-card-actions insights-tabs">
        {[
          ['Library', t('skills.title')],
          ['Editor', t('agentPanels.editor')],
          ['Linked files', t('agentPanels.linkedFiles')],
          ['Create skill', t('skills.createSkill')]
        ].map(([item, label]) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{label}</button>
        ))}
      </div>
      {skillCategories.length > 0 && (
        <div className="native-card-actions insights-tabs skill-category-tabs">
          <button type="button" className={!selectedCategory ? 'active' : ''} onClick={() => setSelectedCategory('')}>{t('agentPanels.all')}</button>
          {skillCategories.map((category) => (
            <button key={category} type="button" className={selectedCategory === category ? 'active' : ''} onClick={() => setSelectedCategory((current) => current === category ? '' : category)}>
              {category}
            </button>
          ))}
        </div>
      )}
      <div className="native-rest-split">
        <aside className="integration-list">
          <div className="native-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('skills.searchPlaceholder')} /></div>
          <button type="button" className="new-session-button" onClick={() => void createSkill()} disabled={!ready}><Plus size={15} />{t('skills.new')}</button>
          {visibleSkills.map((skill) => (
            <button key={idOf(skill)} type="button" className={`integration-row ${idOf(skill) === selectedName ? 'active' : ''}`} onClick={() => { setSelectedName(text(skill.name || idOf(skill))); setSelectedFile(''); }}>
              <img src={brandAssets.sidebarIcons.skills} alt="" />
              <span>{titleOf(skill, idOf(skill))}</span>
              <small>{text(skill.path || skill.category || skill.source)}</small>
            </button>
          ))}
          {!visibleSkills.length && <EmptyState icon={<Sparkles size={22} />} label={ready ? t('skills.empty') : t('agentPanels.noSkillsStarting')} />}
        </aside>
        <main className="native-rest-editor">
          <ErrorLine error={skillsState.error || editorError} />
          <div className="native-rest-editor-head">
            <strong>{sectionTitle}: {selectedFile || selectedName || t('agentPanels.noSkillSelected')}</strong>
            <div className="native-card-actions">
              <button type="button" onClick={() => void save()} disabled={!ready || !selectedName || Boolean(selectedFile)}><Save size={13} /><span>{t('agentPanels.saveSkill')}</span></button>
              <button type="button" className="danger" onClick={() => void removeSkill()} disabled={!ready || !selectedName || text(selectedSkill?.source) === 'bundled'}><Trash2 size={13} /><span>{t('skills.delete')}</span></button>
            </div>
          </div>
          <div className="settings-field-grid">
            <label className="settings-field">
              <span>{t('agentPanels.category')}</span>
              <input value={skillCategoryDraft} onChange={(event) => setSkillCategoryDraft(event.target.value)} placeholder={t('agentPanels.category')} />
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
          <textarea className="code-editor" value={content} onChange={(event) => setContent(event.target.value)} placeholder={t('agentPanels.selectSkillFilePlaceholder')} />
        </main>
      </div>
    </section>
  );
}

export function NativeAgentsMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const { t } = useDesktopI18n();
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
  const currentAgentTitle = currentState.data ? titleOf(currentState.data) : t('agentPanels.noAgentSelected');
  const selectedSession = sessions.find((session) => idOf(session) === selectedSessionId) || null;
  const dashboardCards = [
    { label: t('agentPanels.agents'), value: formatCompactNumber(agents.length) },
    { label: t('agentPanels.sessions'), value: formatCompactNumber(sessions.length) },
    { label: t('agentPanels.current'), value: currentAgentTitle },
    { label: t('agentPanels.splash'), value: text(splashState.data?.status || splashState.data?.state || t('agentPanels.setup')) }
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
    const slug = window.prompt(t('agentPanels.agentSlugPrompt'), 'researcher');
    if (!slug?.trim()) return;
    const name = window.prompt(t('agentPanels.agentNamePrompt'), slug.trim()) || slug.trim();
    await window.lastbrowser.sidekick.createAgent({ slug: slug.trim(), name });
    setSelectedSlug(slug.trim());
    await agentsState.refresh();
  }

  async function renameAgent(): Promise<void> {
    if (!selectedSlug) return;
    const name = window.prompt(t('agentPanels.agentNamePrompt'), titleOf(selectedAgent || {}, selectedSlug));
    if (!name?.trim()) return;
    await window.lastbrowser.sidekick.updateAgent({ slug: selectedSlug, patch: { name: name.trim() } });
    await agentsState.refresh();
  }

  async function removeAgent(): Promise<void> {
    if (!selectedSlug || !window.confirm(t('agentPanels.deleteAgentConfirm', { name: selectedSlug }))) return;
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
    setEvents((current) => [...current, t('agentPanels.streamStarted', { id: result.streamId })]);
  }

  async function sendCommand(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedSessionId || !command.trim()) return;
    await window.lastbrowser.sidekick.sendAgentWorkspaceCommand({ sessionId: selectedSessionId, command: command.trim() });
    setCommand('');
  }

  return (
    <section className="browser-main native-rest-main agents-main">
      <NativeHeader icon={<Bot size={21} />} title={t('agentPanels.agents')} kicker={t('agentPanels.agents')} detail={t('agentPanels.agentDetail')} loading={agentsState.loading} ready={ready} onRefresh={agentsState.refresh} />
      <AdvancedWebUiTools panel="agents" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {[
          ['Dashboard', t('agentPanels.dashboard')],
          ['Agents', t('agentPanels.agents')],
          ['Chat sessions', t('agentPanels.sessions')],
          ['Workspace terminal', t('agentPanels.workspaceTerminal')],
          ['Create agent', t('agentPanels.createAgent')]
        ].map(([item, label]) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{label}</button>
        ))}
      </div>
      <section className="native-work-card detail-json-card">
        <header>
          <strong>{section === 'Chat sessions' ? t('agentPanels.sessions') : section === 'Workspace terminal' ? t('agentPanels.workspaceTerminal') : section === 'Create agent' ? t('agentPanels.createAgent') : section === 'Dashboard' ? t('agentPanels.dashboard') : t('agentPanels.agents')}</strong>
          <div className="native-card-actions">
            <button type="button" onClick={() => void refreshAgentSessions()} disabled={!ready}><RefreshCw size={13} /><span>{t('agentPanels.sessions')}</span></button>
            <button type="button" onClick={() => void agentsState.refresh()} disabled={!ready}><RefreshCw size={13} /><span>{t('agentPanels.refreshAgents')}</span></button>
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
            <button type="button" onClick={() => void createAgentRecord()} disabled={!ready}><Plus size={13} /><span>{t('common.create')}</span></button>
            <button type="button" onClick={() => void renameAgent()} disabled={!ready || !selectedSlug}><Edit3 size={13} /><span>{t('agentPanels.edit')}</span></button>
            <button type="button" onClick={() => void activateSelectedAgent()} disabled={!ready || !selectedSlug}><CheckCircle2 size={13} /><span>{t('common.enable')}</span></button>
            <button type="button" className="danger" onClick={() => void removeAgent()} disabled={!ready || !selectedSlug}><Trash2 size={13} /><span>{t('common.delete')}</span></button>
          </div>
          <section className="agent-splash-status">
            <strong>{t('agentPanels.splash')}</strong>
            <span>{text(splashState.data?.status || splashState.data?.state || t('agentPanels.setup'))}</span>
          </section>
          {agents.map((agent) => (
            <button key={idOf(agent)} type="button" className={`integration-row ${idOf(agent) === selectedSlug ? 'active' : ''}`} onClick={() => setSelectedSlug(idOf(agent))}>
              <img src={brandAssets.sidebarIcons.agents} alt="" />
              <span>{titleOf(agent)}</span>
              <small>{idOf(agent)} {currentAgentId === idOf(agent) ? t('agentPanels.active') : ''}</small>
            </button>
          ))}
          {!agents.length && <EmptyState icon={<Bot size={22} />} label={ready ? t('agentPanels.emptyAgents') : t('agentPanels.noSkillsStarting')} />}
        </aside>
        <main className={`agent-main-grid ${section.toLowerCase().replace(/\s+/g, '-')}`}>
          <ErrorLine error={agentsState.error || statsState.error || activitiesState.error || profilesState.error || workspacesState.error || error} />
          {(section === 'Dashboard' || section === 'Agents' || section === 'Create agent') && (
            <section className="native-work-card agent-detail-card">
            <header>
              <h2>{selectedAgent ? titleOf(selectedAgent) : t('agentPanels.noAgentSelected')}</h2>
              <button type="button" onClick={() => void saveSelectedProfile()} disabled={!ready || !selectedSlug}><Save size={13} />{t('agentPanels.profile')}</button>
            </header>
            <div className="agent-stat-strip">
              {Object.entries(statsState.data || {}).slice(0, 4).map(([key, value]) => <span key={key}><strong>{String(value)}</strong>{key}</span>)}
            </div>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {[
                { label: t('agentPanels.selectedAgent'), value: selectedAgent ? titleOf(selectedAgent) : t('agentPanels.none') },
                { label: t('agentPanels.selectedSession'), value: selectedSession ? titleOf(selectedSession, selectedSessionId) : t('agentPanels.noSession') },
                { label: t('memory.title'), value: text(agentMemory.status || agentMemory.summary || t('agentPanels.available')) },
                { label: t('agentPanels.soul'), value: text(agentSoul.status || agentSoul.summary || t('agentPanels.available')) }
              ].map((card) => (
                <article key={card.label} className="metric-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </div>
            <div className="compact-list">
              {activityItems.slice(0, 5).map((activity) => <article key={idOf(activity)}><strong>{titleOf(activity, t('agentPanels.activity'))}</strong><span>{text(activity.message || activity.detail || activity.type)}</span></article>)}
            </div>
            </section>
          )}
          {(section === 'Dashboard' || section === 'Chat sessions') && (
            <section className="native-work-card agent-chat-card">
            <header><strong>{t('agentPanels.agentChat')}</strong><button type="button" onClick={() => void refreshAgentSessions()} disabled={!ready}><RefreshCw size={13} /></button></header>
            <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)}>
              {sessions.map((session) => <option key={idOf(session)} value={idOf(session)}>{titleOf(session, idOf(session))}</option>)}
            </select>
            <form onSubmit={(event) => void sendAgentChat(event)} className="inline-form">
              <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder={t('agentPanels.messageAgentPlaceholder')} />
              <button type="submit" disabled={!ready || !selectedSlug || !chatText.trim()}><Send size={14} /></button>
            </form>
            <div className="agent-session-list">
              {sessions.map((session) => <button key={idOf(session)} type="button" onClick={() => setSelectedSessionId(idOf(session))}>{titleOf(session, idOf(session))}</button>)}
            </div>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {[
                { label: t('agentPanels.profiles'), value: formatCompactNumber(profileItems.length) },
                { label: t('agentPanels.workspaces'), value: formatCompactNumber(workspaceItems.length) },
                { label: t('agentPanels.selectedSession'), value: selectedSession ? titleOf(selectedSession, selectedSessionId) : t('agentPanels.noSession') }
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
              <strong>{t('agentPanels.terminalTitle')}</strong>
              <div className="native-card-actions">
                <button type="button" onClick={() => void startWorkspace()} disabled={!ready || !selectedSessionId}><Terminal size={13} /><span>{t('agentPanels.startTerminal')}</span></button>
                <button type="button" onClick={() => selectedSessionId && window.lastbrowser.sidekick.stopAgentWorkspace({ sessionId: selectedSessionId })} disabled={!ready || !selectedSessionId}><Trash2 size={13} /><span>{t('agentPanels.stopTerminal')}</span></button>
              </div>
            </header>
            <form onSubmit={(event) => void sendCommand(event)} className="inline-form">
              <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={t('agentPanels.commandPlaceholder')} />
              <button type="submit" disabled={!ready || !selectedSessionId || !command.trim()}><Send size={14} /></button>
            </form>
            <pre>{events.length ? events.join('\n') : t('agentPanels.terminalEventsPlaceholder')}</pre>
          </section>
          )}
        </main>
      </div>
    </section>
  );
}

export function NativeProfilesMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const { t } = useDesktopI18n();
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
    const name = window.prompt(t('agentPanels.profileNamePrompt'), 'default');
    if (!name?.trim()) return;
    const model = window.prompt(t('agentPanels.profileDefaultModelPrompt'), 'gpt-5.5') || '';
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
    if (!selected || !window.confirm(t('agentPanels.deleteProfileConfirm', { name: selected }))) return;
    await window.lastbrowser.sidekick.deleteProfile({ name: selected });
    setSelected('');
    await state.refresh();
  }

  return (
    <section className="browser-main native-rest-main profiles-main">
      <NativeHeader icon={<Users size={21} />} title={t('sidebar.items.profiles.title')} kicker={t('agentPanels.profiles')} detail={t('agentPanels.profileDetail')} loading={state.loading} ready={ready} onRefresh={state.refresh} />
      <AdvancedWebUiTools panel="profiles" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {[
          ['Profiles', t('agentPanels.profiles')],
          ['Active profile', t('agentPanels.activeProfile')],
          ['Gateway', t('agentPanels.gateway')],
          ['Model defaults', t('agentPanels.modelDefaults')]
        ].map(([item, label]) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{label}</button>
        ))}
      </div>
      <div className="profile-overview-strip">
        <div className="profile-stat-box">
          <span className="profile-stat-label">{t('agentPanels.activeProfileLabel').toLocaleUpperCase()}</span>
          <strong className="profile-stat-value profile-active-name">{text(state.data?.active || (profiles.find((p) => p.is_active) ? idOf(profiles.find((p) => p.is_active)!) : 'default'))}</strong>
        </div>
        <div className="profile-stat-box">
          <span className="profile-stat-label">{t('agentPanels.totalProfilesLabel').toLocaleUpperCase()}</span>
          <strong className="profile-stat-value">{profiles.length}</strong>
        </div>
        <div className="profile-stat-box">
          <span className="profile-stat-label">{t('agentPanels.gatewayStatus').toLocaleUpperCase()}</span>
          <strong className="profile-stat-value">{current?.gateway_running ? t('agentPanels.gatewayOnline') : t('agentPanels.gatewayOffline')}</strong>
        </div>
        <div className="profile-stat-box" style={{ marginLeft: 'auto' }}>
          <button type="button" className="profile-create-quick-btn" onClick={() => void create()} disabled={!ready}>
            <Plus size={14} />
            <span>{t('agentPanels.createProfile')}</span>
          </button>
        </div>
      </div>
      <div className="native-rest-split">
        <aside className="integration-list">
          <button type="button" className="new-session-button" onClick={() => void create()} disabled={!ready}><Plus size={15} />{t('agentPanels.createProfile')}</button>
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
          <section className="native-work-card profile-detail-card">
            <header className="profile-card-header">
              <div className="profile-title-area">
                <strong className="profile-display-name">{current ? titleOf(current) : t('agentPanels.profileNotSelected')}</strong>
                {current && (idOf(current) === text(state.data?.active) || Boolean(current.is_active)) && (
                  <span className="profile-active-tag"><CheckCircle2 size={12} /> {t('agentPanels.activeTag')}</span>
                )}
                {Boolean(current?.is_default) && (
                  <span className="profile-default-tag">{t('agentPanels.defaultTag')}</span>
                )}
              </div>
              <div className="native-card-actions">
                <button
                  type="button"
                  onClick={() => void activate()}
                  disabled={!ready || !selected || idOf(current) === text(state.data?.active)}
                  title={t('agentPanels.activate')}
                >
                  <CheckCircle2 size={13} />
                  <span>{t('agentPanels.activate')}</span>
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void remove()}
                  disabled={!ready || !selected || Boolean(current?.is_default)}
                  title={t('common.delete')}
                >
                  <Trash2 size={13} />
                  <span>{t('common.delete')}</span>
                </button>
              </div>
            </header>

            {section === 'Profiles' && current && (
              <div className="profile-specs-grid">
                <div className="profile-spec-item">
                  <span className="spec-label">{t('agentPanels.model')}</span>
                  <strong className="spec-value">{text(current.model) || `gpt-5.5 (${t('agentPanels.defaultTag')})`}</strong>
                </div>
                <div className="profile-spec-item">
                  <span className="spec-label">{t('agentPanels.provider')}</span>
                  <strong className="spec-value">{text(current.provider) || t('agentPanels.fallbackModel')}</strong>
                </div>
                <div className="profile-spec-item">
                  <span className="spec-label">{t('agentPanels.skillsCountLabel')}</span>
                  <strong className="spec-value">{current.skill_count !== undefined ? t('agentPanels.skillsLoaded', { count: current.skill_count }) : t('agentPanels.skillsDefault')}</strong>
                </div>
                <div className="profile-spec-item">
                  <span className="spec-label">{t('agentPanels.environment')}</span>
                  <strong className="spec-value">{current.has_env ? t('agentPanels.environmentOwn') : t('agentPanels.environmentInherited')}</strong>
                </div>
                <div className="profile-spec-item full-width">
                  <span className="spec-label">{t('agentPanels.profilePath')}</span>
                  <code className="spec-code-path">{text(current.path) || `~/.lastbrowser/profiles/${idOf(current)}`}</code>
                </div>
              </div>
            )}

            {section === 'Active profile' && (
              <div className="profile-specs-grid">
                <div className="profile-spec-item">
                  <span className="spec-label">{t('agentPanels.activeSystemProfile')}</span>
                  <strong className="spec-value highlight-cyan">{text(state.data?.active || idOf(activeProfile) || 'default')}</strong>
                </div>
                <div className="profile-spec-item">
                  <span className="spec-label">{t('agentPanels.profileStatus')}</span>
                  <strong className="spec-value">{t('agentPanels.profileReadyStatus')}</strong>
                </div>
                <div className="profile-spec-item full-width">
                  <span className="spec-label">{t('agentPanels.hint')}</span>
                  <p className="spec-desc">{t('agentPanels.profilePurposeHint')}</p>
                </div>
              </div>
            )}

            {section === 'Gateway' && (
              <div className="profile-specs-grid">
                <div className="profile-spec-item">
                  <span className="spec-label">{t('agentPanels.gatewayLabel')}</span>
                  <strong className="spec-value">{current?.gateway_running ? t('agentPanels.gatewayConnected') : t('agentPanels.gatewayOffline')}</strong>
                </div>
                <div className="profile-spec-item">
                  <span className="spec-label">{t('agentPanels.gatewayBinding')}</span>
                  <strong className="spec-value">{text(current?.gateway || current?.provider) || t('agentPanels.gatewayLocalBridge')}</strong>
                </div>
                <div className="profile-spec-item full-width">
                  <span className="spec-label">{t('agentPanels.gatewayArchitectureTitle')}</span>
                  <p className="spec-desc">{t('agentPanels.gatewayArchitecture')}</p>
                </div>
              </div>
            )}

            {section === 'Model defaults' && (
              <div className="profile-specs-grid">
                <div className="profile-spec-item">
                  <span className="spec-label">{t('agentPanels.primaryModel')}</span>
                  <strong className="spec-value">{text(current?.model) || 'gpt-5.5'}</strong>
                </div>
                <div className="profile-spec-item">
                  <span className="spec-label">{t('agentPanels.fallbackModel')}</span>
                  <strong className="spec-value">gemini-2.5-flash</strong>
                </div>
                <div className="profile-spec-item full-width">
                  <span className="spec-label">{t('agentPanels.hint')}</span>
                  <p className="spec-desc">{t('agentPanels.resolveDescription')}</p>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </section>
  );
}

export function NativeMemoryMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const { t } = useDesktopI18n();
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
    const title = window.prompt(t('agentPanels.documentTitlePrompt'), t('memory.title'));
    if (!title?.trim()) return;
    const content = window.prompt(t('agentPanels.documentContentPrompt'), '') || '';
    await window.lastbrowser.sidekick.addSupermemoryDocument({ title: title.trim(), content });
    await docsState.refresh();
  }

  async function openDocument(item: AnyRecord): Promise<void> {
    setSelectedDocument(item);
    const payload = await window.lastbrowser.sidekick.getSupermemoryDocument({ id: idOf(item) });
    setDocumentDetail(payload);
  }

  async function forgetDocument(): Promise<void> {
    if (!selectedDocument || !window.confirm(t('agentPanels.forgetDocumentConfirm', { name: titleOf(selectedDocument) }))) return;
    await window.lastbrowser.sidekick.forgetSupermemoryDocument({ id: idOf(selectedDocument) });
    setSelectedDocument(null);
    setDocumentDetail(null);
    await docsState.refresh();
  }

  return (
    <section className="browser-main native-rest-main memory-main">
      <NativeHeader icon={<Brain size={21} />} title={t('memory.title')} kicker={t('memory.kicker')} detail={t('memory.detail')} loading={memoryState.loading} ready={ready} onRefresh={memoryState.refresh} />
      <AdvancedWebUiTools panel="memory" serviceStatus={serviceStatus} compact />
      <ErrorLine
        error={[memoryState.error, superState.error, docsState.error]
          .filter((err): err is string => Boolean(err && !err.toLowerCase().includes('not configured')))
          .join(' | ')}
      />
      <div className="native-card-actions insights-tabs">
        {[
          ['Core memory', t('memory.coreMemory')],
          ['User facts', t('memory.userFacts')],
          ['Supermemory', t('memory.supermemory')],
          ['Hybrid search', t('memory.hybridSearch')]
        ].map(([item, label]) => (
          <button
            key={item}
            type="button"
            className={item === focus ? 'active' : ''}
            onClick={() => {
              setFocus(item);
              setSection(item === 'User facts' ? 'user' : 'memory');
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="memory-grid">
        {(focus === 'Supermemory' || focus === 'Hybrid search') && (
          <section className="native-work-card memory-super">
            <header>
              <strong>{focus === 'Supermemory' ? t('memory.supermemory') : t('memory.hybridSearch')}</strong>
              <div className="native-card-actions">
                <button type="button" onClick={() => void addDocument()} disabled={!ready}><Plus size={13} />{t('memory.add')}</button>
                <button type="button" className="danger" onClick={() => void forgetDocument()} disabled={!ready || !selectedDocument}><Trash2 size={13} />{t('memory.forget')}</button>
              </div>
            </header>
            {superState.data?.configured === false ? (
              <div className="memory-unconfigured-note">
                <Brain size={16} />
                <span>{t('agentPanels.supermemoryNotConfigured')}</span>
              </div>
            ) : (
              <div className="memory-status-badge">
                <span className="online-dot" />
                <span>{t('agentPanels.supermemoryConnected', { count: arrayFrom(docsState.data, ['results', 'documents', 'items']).length })}</span>
              </div>
            )}
            <div className="native-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('agentPanels.memorySearchPlaceholder')} /></div>
            <div className="native-card-actions">
              <button type="button" onClick={() => void runSearch('super')} disabled={!ready || !search.trim()}><Search size={13} /><span>{t('memory.supermemory')} {t('memory.search')}</span></button>
              <button type="button" onClick={() => void runSearch('hybrid')} disabled={!ready || !search.trim()}><Sparkles size={13} /><span>{t('memory.hybridSearch')}</span></button>
            </div>
            <div className="compact-list">
              {[...results, ...arrayFrom(docsState.data, ['results', 'documents', 'items']).slice(0, results.length ? 0 : 8)].map((item) => (
                <article key={idOf(item)} className={idOf(item) === idOf(selectedDocument || {}) ? 'active' : ''} onClick={() => void openDocument(item)}><strong>{titleOf(item)}</strong><span>{text(item.content || item.text || item.id)}</span></article>
              ))}
            </div>
            <pre>{documentDetail ? jsonPreview(documentDetail) : t('agentPanels.supermemorySelectDocument')}</pre>
          </section>
        )}
        <section className="native-work-card memory-editor">
          <header>
            <div className="settings-section-nav">
              {[
                ['memory', t('memory.coreMemory')],
                ['user', t('memory.userFacts')]
              ].map(([item, label]) => <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{label}</button>)}
            </div>
            <button type="button" onClick={() => void save()} disabled={!ready}><Save size={13} />{t('common.save')}</button>
          </header>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
        </section>
        {!(focus === 'Supermemory' || focus === 'Hybrid search') && (
          <section className="native-work-card memory-super">
            <header>
              <strong>{t('memory.supermemory')}</strong>
              <div className="native-card-actions">
                <button type="button" onClick={() => void addDocument()} disabled={!ready}><Plus size={13} />{t('memory.add')}</button>
                <button type="button" className="danger" onClick={() => void forgetDocument()} disabled={!ready || !selectedDocument}><Trash2 size={13} />{t('memory.forget')}</button>
              </div>
            </header>
            <pre>{jsonPreview(superState.data || {})}</pre>
            <div className="native-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('agentPanels.memorySearchPlaceholder')} /></div>
            <div className="native-card-actions">
              <button type="button" onClick={() => void runSearch('super')} disabled={!ready || !search.trim()}><Search size={13} /><span>{t('memory.supermemory')} {t('memory.search')}</span></button>
              <button type="button" onClick={() => void runSearch('hybrid')} disabled={!ready || !search.trim()}><Sparkles size={13} /><span>{t('memory.hybridSearch')}</span></button>
            </div>
            <div className="compact-list">
              {[...results, ...arrayFrom(docsState.data, ['results', 'documents', 'items']).slice(0, results.length ? 0 : 8)].map((item) => (
                <article key={idOf(item)} className={idOf(item) === idOf(selectedDocument || {}) ? 'active' : ''} onClick={() => void openDocument(item)}><strong>{titleOf(item)}</strong><span>{text(item.content || item.text || item.id)}</span></article>
              ))}
            </div>
            <pre>{documentDetail ? jsonPreview(documentDetail) : t('agentPanels.supermemorySelectDocument')}</pre>
          </section>
        )}
      </div>
    </section>
  );
}
