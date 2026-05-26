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
  Users,
  X
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

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCompactNumber(value: unknown, fallback = '—'): string {
  const parsed = toNumber(value, Number.NaN);
  if (!Number.isFinite(parsed)) return fallback;
  try {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(parsed);
  } catch {
    return String(parsed);
  }
}

function formatMoney(value: unknown, fallback = '—'): string {
  const parsed = toNumber(value, Number.NaN);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed === 0) return '$0';
  return `$${parsed.toFixed(parsed < 1 ? 4 : 2)}`;
}

function percentValue(part: unknown, total: unknown): string {
  const whole = toNumber(total, 0);
  if (!whole) return '0%';
  const ratio = Math.max(0, Math.min(100, Math.round((toNumber(part, 0) / whole) * 100)));
  return `${ratio}%`;
}

function appstoreSettingType(value: unknown): 'checkbox' | 'number' | 'text' {
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';
  return 'text';
}

export function jsonPreview(value: unknown): string {
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

type SettingsSectionId = 'conversation' | 'appearance' | 'preferences' | 'providers' | 'plugins' | 'system';

type SettingsSectionMeta = {
  title: string;
  description: string;
  icon: React.ReactNode;
};

const SETTINGS_SKINS = [
  { key: 'default', name: 'Default', colors: ['#FFD700', '#FFBF00', '#CD7F32'] },
  { key: 'ares', name: 'Ares', colors: ['#FF4444', '#CC3333', '#992222'] },
  { key: 'mono', name: 'Mono', colors: ['#CCCCCC', '#999999', '#666666'] },
  { key: 'slate', name: 'Slate', colors: ['#334155', '#475569', '#64748b'] },
  { key: 'poseidon', name: 'Poseidon', colors: ['#0EA5E9', '#0284C7', '#0369A1'] },
  { key: 'sisyphus', name: 'Sisyphus', colors: ['#A78BFA', '#8B5CF6', '#7C3AED'] },
  { key: 'charizard', name: 'Charizard', colors: ['#FB923C', '#F97316', '#EA580C'] },
  { key: 'sienna', name: 'Sienna', colors: ['#D97757', '#C06A49', '#9A523A'] },
  { key: 'matrix', name: 'Matrix', colors: ['#00FF41', '#00DD33', '#55CC55'] }
] as const;

const SETTINGS_LANGUAGES = [
  { value: 'auto', label: 'System / Auto' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'it', label: 'Italiano' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'pt-BR', label: 'Português (Brasil)' }
] as const;

const SETTINGS_SECTIONS: Record<SettingsSectionId, SettingsSectionMeta> = {
  conversation: {
    title: 'Conversation',
    description: 'Default model, send key and assistant identity.',
    icon: <MessageSquare size={16} />
  },
  appearance: {
    title: 'Appearance',
    description: 'Theme, skin, font sizing and message layout.',
    icon: <Sparkles size={16} />
  },
  preferences: {
    title: 'Preferences',
    description: 'Language, notifications and chat behavior.',
    icon: <Gauge size={16} />
  },
  providers: {
    title: 'Providers',
    description: 'Provider defaults and model routing settings.',
    icon: <Brain size={16} />
  },
  plugins: {
    title: 'Plugins',
    description: 'Installed app integrations and plugin inventory.',
    icon: <Package size={16} />
  },
  system: {
    title: 'System',
    description: 'Access control, auth, update checks and diagnostics.',
    icon: <Shield size={16} />
  }
};

function SettingsCard({
  title,
  description,
  action,
  children
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="settings-card native-work-card">
      <header className="settings-card-header">
        <div>
          <strong>{title}</strong>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      <div className="settings-card-body">{children}</div>
    </section>
  );
}

function SettingsField({
  label,
  description,
  children
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="settings-field">
      <span>{label}</span>
      {children}
      {description && <small>{description}</small>}
    </label>
  );
}

function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  disabled
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <label className="settings-toggle-card">
      <span className="settings-toggle-card-main">
        <span>{label}</span>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function settingsText(value: unknown, fallback = ''): string {
  return value === undefined || value === null ? fallback : String(value);
}

function settingsBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }
  return fallback;
}

function settingsCsv(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => settingsText(item).trim()).filter(Boolean).join(', ');
  return settingsText(value);
}

function normalizeAppearanceTheme(value: string): 'light' | 'dark' | 'system' {
  const normalized = value.trim().toLowerCase();
  return normalized === 'light' || normalized === 'system' ? normalized : 'dark';
}

function normalizeAppearanceSkin(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized || 'default';
}

function parseSettingsCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanSettingsPayload(payload: AnyRecord): AnyRecord {
  const next = { ...payload };
  delete next.auth_enabled;
  delete next.logged_in;
  delete next.auth_just_enabled;
  delete next.password_env_var;
  delete next.webui_version;
  delete next.agent_version;
  delete next.success;
  return next;
}

function applyDesktopAppearancePreview(themeValue: string, skinValue: string): void {
  if (typeof document === 'undefined') return;
  const theme = normalizeAppearanceTheme(themeValue);
  const resolvedTheme = theme === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  const skin = normalizeAppearanceSkin(skinValue);
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = theme;
  root.dataset.skin = skin;
  root.classList.toggle('theme-light', resolvedTheme === 'light');
  root.classList.toggle('theme-dark', resolvedTheme !== 'light');
  root.classList.toggle('theme-system', theme === 'system');
  root.style.colorScheme = resolvedTheme;
}

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
  const insightData = isRecord(insights.data) ? insights.data : {};
  const wikiData = isRecord(wiki.data) ? wiki.data : {};
  const metricEntries = Object.entries(insightData)
    .filter(([key, value]) => {
      if (typeof value !== 'number' && typeof value !== 'string') return false;
      if (normalizedSection === 'models') return /model|provider/i.test(key);
      if (normalizedSection === 'cost') return /cost|token|usage|bill/i.test(key);
      return true;
    })
    .slice(0, 10);
  const dailyRows = arrayFrom(insightData, ['daily', 'daily_rows', 'daily_usage', 'activity_by_day', 'by_day']);
  const modelRows = arrayFrom(insightData, ['models', 'model_stats', 'provider_models']);
  const hourRows = arrayFrom(insightData, ['hours', 'by_hour', 'hourly', 'activity_by_hour']);
  const systemHealth = isRecord(insightData.system) ? insightData.system : isRecord(insightData.health) ? insightData.health : null;
  const overviewCards = [
    { label: 'Sessions', value: formatCompactNumber(insightData.total_sessions || insightData.sessions) },
    { label: 'Messages', value: formatCompactNumber(insightData.total_messages || insightData.messages) },
    { label: 'Tokens', value: formatCompactNumber(insightData.total_tokens || insightData.tokens) },
    { label: 'Cost', value: formatMoney(insightData.total_cost || insightData.cost) }
  ];
  const tokenBreakdown = [
    { label: 'Input', value: formatCompactNumber(insightData.total_input_tokens || insightData.input_tokens) },
    { label: 'Output', value: formatCompactNumber(insightData.total_output_tokens || insightData.output_tokens) },
    { label: 'Average / session', value: formatCompactNumber(insightData.average_tokens_per_session || insightData.avg_tokens_per_session) },
    { label: 'Weekly total', value: formatCompactNumber(insightData.weekly_tokens || insightData.period_tokens) }
  ];

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
      <div className="native-card-actions">
        <select value={days} onChange={(event) => setDays(Number(event.target.value))}>{[7, 14, 30, 90].map((value) => <option key={value} value={value}>{value} days</option>)}</select>
      </div>
      <ErrorLine error={insights.error || wiki.error} />
      <div className="insights-panel-grid">
        <aside className="insights-panel-column">
          <section className="native-work-card detail-json-card">
            <header><strong>Overview</strong></header>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {overviewCards.map((card) => (
                <article key={card.label} className="metric-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </div>
          </section>
          <section className="native-work-card detail-json-card">
            <header><strong>System health</strong></header>
            {systemHealth ? (
              <div className="compact-list">
                {Object.entries(systemHealth)
                  .filter(([, value]) => typeof value === 'number' || typeof value === 'string')
                  .slice(0, 6)
                  .map(([key, value]) => (
                    <article key={key}>
                      <strong>{key}</strong>
                      <span>{String(value)}</span>
                    </article>
                  ))}
              </div>
            ) : (
              <EmptyState icon={<Gauge size={24} />} label={ready ? 'No system health data.' : 'Sidekick is starting.'} />
            )}
          </section>
          <section className="native-work-card detail-json-card">
            <header><strong>LLM Wiki Status</strong></header>
            <div className="compact-list">
            {Object.entries(wikiData)
                .filter(([, value]) => typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')
                .slice(0, 6)
                .map(([key, value]) => (
                  <article key={key}>
                    <strong>{key}</strong>
                    <span>{String(value)}</span>
                  </article>
                ))}
            </div>
          </section>
        </aside>
        <main className="insights-panel-column">
          <section className="native-work-card detail-json-card">
            <header><strong>{section}</strong></header>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))' }}>
              {metricEntries.map(([key, value]) => (
                <article key={key} className="metric-card">
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </article>
              ))}
              {!metricEntries.length && <EmptyState icon={<Gauge size={24} />} label={ready ? 'No metrics yet.' : 'Sidekick is starting.'} />}
            </div>
          </section>
          <div className="insights-card-row">
            <section className="native-work-card detail-json-card">
              <header><strong>Daily tokens</strong></header>
              {dailyRows.length ? (
                <div className="insights-bar-list">
                  {dailyRows.slice(0, 8).map((row, index) => {
                    const input = toNumber(row.input_tokens || row.input || row.tokens_in || row.tokens_input);
                    const output = toNumber(row.output_tokens || row.output || row.tokens_out || row.tokens_output);
                    const total = Math.max(input + output, toNumber(row.total_tokens || row.tokens || 0));
                    return (
                      <article key={idOf(row) || `${index}`} className="insights-bar-row">
                        <span className="insights-bar-label">{text(row.date || row.day || row.label || `Day ${index + 1}`)}</span>
                        <div className="insights-bar-track">
                          <div className="insights-bar-fill insights-bar-output" style={{ width: percentValue(output, total) }} />
                          <div className="insights-bar-fill insights-bar-input" style={{ width: percentValue(input, total) }} />
                        </div>
                        <span className="insights-bar-value">{formatCompactNumber(total)}</span>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={<Gauge size={24} />} label={ready ? 'No daily usage data.' : 'Sidekick is starting.'} />
              )}
            </section>
            <section className="native-work-card detail-json-card">
              <header><strong>Models</strong></header>
              {modelRows.length ? (
                <div className="insights-model-list">
                  {modelRows.slice(0, 8).map((row) => (
                    <article key={idOf(row)} className="insights-model-row">
                      <strong>{titleOf(row, 'Model')}</strong>
                      <span>{formatCompactNumber(row.sessions || row.usage || row.requests)} sessions</span>
                      <span>{formatCompactNumber(row.total_tokens || row.tokens || row.input_tokens || row.output_tokens)} tokens</span>
                      <span>{formatMoney(row.cost || row.total_cost || row.usage_cost)}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Gauge size={24} />} label={ready ? 'No model data.' : 'Sidekick is starting.'} />
              )}
            </section>
          </div>
          <section className="native-work-card detail-json-card">
            <header><strong>Token breakdown</strong></header>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))' }}>
              {tokenBreakdown.map((card) => (
                <article key={card.label} className="metric-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </div>
            {normalizedSection === 'cost' ? (
              <pre>{jsonPreview(insightData.cost || insightData.billing || insightData.usage || {})}</pre>
            ) : null}
          </section>
          <section className="native-work-card detail-json-card">
            <header><strong>Activity by hour</strong></header>
            {hourRows.length ? (
              <div className="insights-bar-list">
                {hourRows.slice(0, 8).map((row, index) => (
                  <article key={idOf(row) || `${index}`} className="insights-bar-row">
                    <span className="insights-bar-label">{text(row.hour ?? row.time ?? row.label ?? index).padStart(2, '0')}</span>
                    <div className="insights-bar-track">
                      <div className="insights-bar-fill insights-bar-input" style={{ width: percentValue(row.sessions || row.count || row.total || 0, hourRows.reduce((max, item) => Math.max(max, toNumber(item.sessions || item.count || item.total || 0)), 0)) }} />
                    </div>
                    <span className="insights-bar-value">{formatCompactNumber(row.sessions || row.count || row.total || 0)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Gauge size={24} />} label={ready ? 'No hourly activity data.' : 'Sidekick is starting.'} />
            )}
          </section>
        </main>
      </div>
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry).trim()).filter(Boolean);
}

function normalizeAppstoreRecord(app: AnyRecord): AnyRecord {
  const installed = isRecord(app.status) ? app.status : {};
  return {
    ...app,
    id: text(app.id || app.app_id || app.slug || app.name || app.title || app.key),
    key: text(app.key || app.slug || app.id || app.app_id || app.name || app.title),
    name: text(app.name || app.title || app.label || app.slug || app.id || app.app_id, 'Untitled'),
    category: text(app.category || app.cat || app.group || 'general'),
    developer: text(app.developer || app.dev || app.author || app.publisher || 'Community'),
    description: text(app.description || app.summary || app.desc || ''),
    fullDescription: text(app.fullDesc || app.full_description || app.description || app.desc || ''),
    version: text(app.version || app.ver || installed.version_installed || installed.version || '?'),
    size: text(app.size || app.bytes || '—'),
    icon: text(app.icon || '🛍️'),
    tags: stringArray(app.tags),
    screenshots: stringArray(app.screenshots),
    installed: Boolean(installed.installed),
    updateAvailable: Boolean(app.update_available),
    settingsUrl: text(app.settings_url || ''),
    status: isRecord(app.status) ? app.status : null
  };
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
  const [section, setSection] = useState(activeContextItem || 'Home');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [submitManifest, setSubmitManifest] = useState(JSON.stringify({
    key: 'my_plugin',
    name: 'My Plugin',
    icon: '🧩',
    cat: 'Developer Tools',
    dev: 'Your Name',
    version: '0.1.0',
    description: 'Kurze Beschreibung der Integration.',
    setup_steps: []
  }, null, 2));
  const [submitStatus, setSubmitStatus] = useState('');
  const [settingsApp, setSettingsApp] = useState<AnyRecord | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AnyRecord>({});
  const [settingsError, setSettingsError] = useState('');
  const [settingsStatus, setSettingsStatus] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const appsState = useApiState(() => window.lastbrowser.sidekick.listAppstore({}), [ready], ready);
  const updates = useApiState(() => window.lastbrowser.sidekick.getAppstoreUpdates(), [ready], ready);
  const sdk = useApiState(() => window.lastbrowser.sidekick.getAppstoreSdk(), [ready], ready);
  const apps = useMemo(() => arrayFrom(appsState.data, ['apps', 'items', 'packages']).map(normalizeAppstoreRecord), [appsState.data]);

  const categories = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; count: number }>();
    for (const app of apps) {
      const key = text(app.category || 'general').toLowerCase();
      const label = text(app.category || 'General');
      const current = buckets.get(key) || { key, label, count: 0 };
      current.count += 1;
      buckets.set(key, current);
    }
    return Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [apps]);

  const installedApps = useMemo(() => apps.filter((app) => app.installed), [apps]);
  const featuredApps = useMemo(() => apps.filter((app) => Boolean((app.featured || app.pinned || app.recommended) as boolean)), [apps]);
  const recentApps = useMemo(() => apps.filter((app) => app.installed).slice(0, 6), [apps]);
  const updateCount = useMemo(() => apps.filter((app) => app.updateAvailable).length, [apps]);
  const sidebarAppApps = useMemo(() => installedApps.filter((app) => sidebarAppPanelForApp(app)), [installedApps]);
  const filteredApps = useMemo(() => {
    const query = search.trim().toLowerCase();
    return apps.filter((app) => {
      const matchesCategory = !selectedCategory || text(app.category).toLowerCase() === selectedCategory.toLowerCase();
      const matchesSection = section === 'My apps' ? app.installed : true;
      const haystack = [
        app.name,
        app.description,
        app.fullDescription,
        app.developer,
        app.category,
        app.tags.join(' ')
      ].join(' ').toLowerCase();
      const matchesSearch = !query || haystack.includes(query);
      return matchesCategory && matchesSection && matchesSearch;
    });
  }, [apps, search, section, selectedCategory]);
  const selectedApp = useMemo(() => (
    apps.find((app) => app.id === selectedAppId)
    || filteredApps[0]
    || apps[0]
    || null
  ), [apps, filteredApps, selectedAppId]);
  const appstoreOverview = [
    { label: 'Catalog', value: formatCompactNumber(apps.length) },
    { label: 'Installed', value: formatCompactNumber(installedApps.length) },
    { label: 'Updates', value: formatCompactNumber(updateCount) },
    { label: 'Sidebar apps', value: formatCompactNumber(sidebarAppApps.length) }
  ];

  useEffect(() => {
    const nextSection = activeContextItem || 'Home';
    setSection(nextSection);
    setSelectedCategory('');
  }, [activeContextItem]);

  useEffect(() => {
    if (!selectedAppId && selectedApp) setSelectedAppId(selectedApp.id);
  }, [selectedApp, selectedAppId]);

  async function refreshAll(): Promise<void> {
    await Promise.all([appsState.refresh(), updates.refresh(), sdk.refresh()]);
  }

  async function install(app: AnyRecord): Promise<void> {
    await window.lastbrowser.sidekick.installAppstoreApp({ appId: idOf(app) });
    const sidebarPanel = sidebarAppPanelForApp(app);
    if (sidebarPanel) onInstalledSidebarApp(sidebarPanel);
    await refreshAll();
  }

  async function uninstall(app: AnyRecord): Promise<void> {
    await window.lastbrowser.sidekick.uninstallAppstoreApp({ appId: idOf(app) });
    const sidebarPanel = sidebarAppPanelForApp(app);
    if (sidebarPanel) onUninstalledSidebarApp(sidebarPanel);
    await refreshAll();
  }

  async function openSettings(app: AnyRecord): Promise<void> {
    const settingsUrl = text(app.settingsUrl || app.settings_url || '');
    if (!settingsUrl) {
      setSettingsError('This app does not expose a settings endpoint.');
      setSettingsApp(app);
      setSettingsDraft({});
      setSettingsStatus('');
      return;
    }

    setSettingsApp(app);
    setSettingsDraft({});
    setSettingsError('');
    setSettingsStatus('Loading settings...');
    try {
      const payload = await window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: settingsUrl });
      setSettingsDraft(isRecord(payload) ? payload : {});
      setSettingsStatus('Ready');
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
      setSettingsStatus('');
    }
  }

  async function saveSettings(): Promise<void> {
    if (!settingsApp || settingsSaving) return;
    const settingsUrl = text(settingsApp.settingsUrl || settingsApp.settings_url || '');
    if (!settingsUrl) {
      setSettingsError('This app does not expose a settings endpoint.');
      return;
    }

    setSettingsSaving(true);
    setSettingsError('');
    setSettingsStatus('Saving...');
    try {
      const response = await window.lastbrowser.sidekick.requestWebui({
        method: 'POST',
        path: settingsUrl,
        body: settingsDraft
      });
      setSettingsStatus(text(response.message || response.status || 'Saved'));
      await refreshAll();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
      setSettingsStatus('');
    } finally {
      setSettingsSaving(false);
    }
  }

  function closeSettings(): void {
    setSettingsApp(null);
    setSettingsDraft({});
    setSettingsError('');
    setSettingsStatus('');
  }

  async function submitAppstoreManifest(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitStatus('');
    try {
      const manifest = JSON.parse(submitManifest || '{}') as Record<string, unknown>;
      const response = await window.lastbrowser.sidekick.submitAppstoreApp({ manifest });
      setSubmitStatus(text(response.message || response.status || 'Manifest submitted.'));
      await refreshAll();
    } catch (error) {
      setSubmitStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="browser-main native-rest-main appstore-main">
      <NativeHeader icon={<Package size={21} />} title="Appstore" kicker="Extensions" detail="Native home/category/my apps/sdk/submit surface backed by the appstore endpoints." loading={appsState.loading} ready={ready} onRefresh={appsState.refresh} />
      <div className="native-card-actions insights-tabs">
        {['Home', 'Categories', 'My apps', 'SDK', 'Submit'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => {
            setSection(item);
            if (item !== 'Categories') setSelectedCategory('');
          }}>{item}</button>
        ))}
        <button type="button" onClick={() => void window.lastbrowser.sidekick.updateAllAppstore()} disabled={!ready}><Download size={13} />Update all</button>
      </div>
      <ErrorLine error={appsState.error || updates.error || sdk.error} />
      <div className="appstore-panel-grid">
        <aside className="integration-list appstore-sidebar">
          <div className="native-search">
            <Search size={14} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search apps..." />
          </div>
          <section className="native-work-card detail-json-card appstore-summary-card">
            <header><strong>Catalog</strong></header>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {appstoreOverview.map((card) => (
                <article key={card.label} className="metric-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </div>
          </section>
          <div className="native-card-actions" style={{ padding: 0 }}>
            {categories.map((categoryItem) => (
              <button
                key={categoryItem.key}
                type="button"
                className={selectedCategory === categoryItem.key ? 'active' : ''}
                onClick={() => setSelectedCategory((current) => current === categoryItem.key ? '' : categoryItem.key)}
              >
                {categoryItem.label} <span style={{ opacity: .65 }}>({categoryItem.count})</span>
              </button>
            ))}
          </div>
          <div className="compact-list">
            {(section === 'My apps' ? installedApps : filteredApps).map((app) => (
              <article key={app.id} className={app.id === selectedAppId ? 'active' : ''} onClick={() => setSelectedAppId(app.id)}>
                <strong>{app.icon} {app.name}</strong>
                <span>{app.description || app.category || 'Appstore item'}</span>
              </article>
            ))}
            {!filteredApps.length && <EmptyState icon={<Grid2X2 size={24} />} label={ready ? 'No apps returned by backend.' : 'Sidekick is starting.'} />}
          </div>
        </aside>
        <main className="native-rest-detail appstore-main-column">
          {section === 'Home' && (
            <div className="appstore-home-grid">
              <section className="native-work-card detail-json-card">
                <header><strong>Home</strong></header>
                <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                  {appstoreOverview.map((card) => (
                    <article key={card.label} className="metric-card">
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                    </article>
                  ))}
                </div>
                <div className="appstore-badge-row">
                  {categories.slice(0, 4).map((categoryItem) => (
                    <button key={categoryItem.key} type="button" className={selectedCategory === categoryItem.key ? 'active' : ''} onClick={() => setSelectedCategory(categoryItem.key)}>
                      {categoryItem.label}
                    </button>
                  ))}
                </div>
              </section>
              <section className="native-work-card detail-json-card">
                <header><strong>Featured</strong></header>
                <div className="app-grid-native appstore-feature-grid">
                  {(featuredApps.length ? featuredApps : filteredApps).slice(0, 6).map((app) => (
                    <article key={app.id} className={`app-card-native ${app.id === selectedAppId ? 'active' : ''}`} onClick={() => setSelectedAppId(app.id)}>
                      <strong>{app.icon} {app.name}</strong>
                      <span>{app.description || app.category || 'Recommended app'}</span>
                      <div className="app-card-actions">
                        <button type="button" onClick={(event) => { event.stopPropagation(); void install(app); }} disabled={!ready || app.installed}><Plus size={13} />Install</button>
                        {app.settingsUrl && <button type="button" onClick={(event) => { event.stopPropagation(); void openSettings(app); }}><Settings size={13} />Settings</button>}
                        <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); void uninstall(app); }} disabled={!ready || !app.installed}><Trash2 size={13} />Remove</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section className="native-work-card detail-json-card">
                <header><strong>Recently installed</strong></header>
                <div className="app-grid-native">
                  {recentApps.slice(0, 6).map((app) => (
                    <article key={app.id} className={`app-card-native ${app.id === selectedAppId ? 'active' : ''}`} onClick={() => setSelectedAppId(app.id)}>
                      <strong>{app.icon} {app.name}</strong>
                      <span>{app.version} · {app.category || 'Appstore item'}</span>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
          {section === 'Categories' && (
            <section className="native-work-card detail-json-card">
              <header><strong>Categories</strong></header>
              <div className="app-grid-native">
                {categories.map((categoryItem) => (
                  <article key={categoryItem.key} className={`app-card-native ${selectedCategory === categoryItem.key ? 'active' : ''}`} onClick={() => setSelectedCategory((current) => current === categoryItem.key ? '' : categoryItem.key)}>
                    <strong>{categoryItem.label}</strong>
                    <span>{categoryItem.count} apps</span>
                  </article>
                ))}
              </div>
            </section>
          )}
          {section === 'My apps' && (
            <section className="native-work-card detail-json-card">
              <header><strong>My apps</strong></header>
              <div className="app-grid-native">
                {installedApps.map((app) => (
                  <article key={app.id} className={`app-card-native ${app.id === selectedAppId ? 'active' : ''}`} onClick={() => setSelectedAppId(app.id)}>
                    <strong>{app.icon} {app.name}</strong>
                    <span>{app.version} · {app.category || 'Installed app'}</span>
                    <div className="app-card-actions">
                      <button type="button" onClick={(event) => { event.stopPropagation(); void install(app); }} disabled={!ready || app.installed}><Plus size={13} />Install</button>
                      {app.settingsUrl && <button type="button" onClick={(event) => { event.stopPropagation(); void openSettings(app); }}><Settings size={13} />Settings</button>}
                      <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); void uninstall(app); }} disabled={!ready || !app.installed}><Trash2 size={13} />Remove</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {section === 'SDK' && (
            <div className="appstore-home-grid">
              <section className="native-work-card detail-json-card">
                <header><strong>SDK / Updates</strong></header>
                <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                  {[
                    { label: 'SDK entries', value: formatCompactNumber(arrayFrom(sdk.data, ['items', 'entries', 'tools']).length || Object.keys(sdk.data || {}).length) },
                    { label: 'Installed apps', value: formatCompactNumber(installedApps.length) },
                    { label: 'Updates available', value: formatCompactNumber(updateCount) }
                  ].map((card) => (
                    <article key={card.label} className="metric-card">
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                    </article>
                  ))}
                </div>
              </section>
              <section className="native-work-card detail-json-card">
                <header><strong>SDK payload</strong></header>
                <pre>{jsonPreview({ sdk: sdk.data, updates: updates.data })}</pre>
              </section>
            </div>
          )}
          {section === 'Submit' && (
            <form className="native-work-card detail-json-card" onSubmit={(event) => void submitAppstoreManifest(event)}>
              <header>
                <strong>Submit app</strong>
                <button type="submit" className="primary-action compact" disabled={!ready}><Send size={13} /><span>Submit</span></button>
              </header>
              <textarea className="code-editor" value={submitManifest} onChange={(event) => setSubmitManifest(event.target.value)} />
              {submitStatus && <div className="workspace-error">{submitStatus}</div>}
            </form>
          )}
          {selectedApp && (
            <section className="native-work-card detail-json-card">
              <header>
                <strong>{selectedApp.icon} {selectedApp.name}</strong>
                <div className="native-card-actions">
                  <button type="button" onClick={() => void install(selectedApp)} disabled={!ready || selectedApp.installed}><Plus size={13} />Install</button>
                  {selectedApp.settingsUrl && <button type="button" onClick={() => void openSettings(selectedApp)}><Settings size={13} />Settings</button>}
                  <button type="button" className="danger" onClick={() => void uninstall(selectedApp)} disabled={!ready || !selectedApp.installed}><Trash2 size={13} />Remove</button>
                </div>
              </header>
              <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                {[
                  { label: 'Category', value: selectedApp.category || 'General' },
                  { label: 'Developer', value: selectedApp.developer || 'Unknown' },
                  { label: 'Version', value: selectedApp.version || '—' },
                  { label: 'Installed', value: selectedApp.installed ? 'Yes' : 'No' },
                  { label: 'Updates', value: selectedApp.updateAvailable ? 'Available' : 'Up to date' }
                ].map((card) => (
                  <article key={card.label} className="metric-card">
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                  </article>
                ))}
              </div>
              <div className="compact-list">
                <article>
                  <strong>Description</strong>
                  <span>{selectedApp.fullDescription || selectedApp.description || 'No description available.'}</span>
                </article>
                <article>
                  <strong>Tags</strong>
                  <span>{selectedApp.tags.length ? selectedApp.tags.join(', ') : 'No tags'}</span>
                </article>
                <article>
                  <strong>Screenshots</strong>
                  <span>{selectedApp.screenshots.length ? selectedApp.screenshots.slice(0, 3).join(', ') : 'No screenshots'}</span>
                </article>
              </div>
            </section>
          )}
          {!selectedApp && <EmptyState icon={<Package size={24} />} label={ready ? 'Select an app to see details.' : 'Sidekick is starting.'} />}
        </main>
      </div>
      {settingsApp && (
        <div className="appstore-settings-overlay" role="dialog" aria-modal="true" onClick={() => closeSettings()}>
          <div className="appstore-settings-modal native-work-card detail-json-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{text(settingsApp.icon || '⚙️')} {titleOf(settingsApp)}</strong>
              <button type="button" onClick={() => closeSettings()}><X size={13} /><span>Close</span></button>
            </header>
            {settingsStatus && <div className="workspace-error">{settingsStatus}</div>}
            {settingsError && <div className="workspace-error">{settingsError}</div>}
            {Object.keys(settingsDraft).length ? (
              <div className="settings-field-grid">
                {Object.entries(settingsDraft).map(([key, value]) => (
                  <label key={key} className="settings-toggle">
                    <span>{key.replace(/_/g, ' ')}</span>
                    {appstoreSettingType(value) === 'checkbox' ? (
                      <input type="checkbox" checked={Boolean(value)} onChange={(event) => setSettingsDraft((current) => ({ ...current, [key]: event.target.checked }))} />
                    ) : appstoreSettingType(value) === 'number' ? (
                      <input type="number" value={String(value)} onChange={(event) => setSettingsDraft((current) => ({ ...current, [key]: event.target.value === '' ? 0 : Number(event.target.value) }))} />
                    ) : (
                      <input type="text" value={String(value)} onChange={(event) => setSettingsDraft((current) => ({ ...current, [key]: event.target.value }))} />
                    )}
                  </label>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Package size={24} />} label={settingsError || 'No settings returned by backend.'} />
            )}
            <div className="native-card-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="danger" onClick={() => closeSettings()}><Trash2 size={13} /><span>Cancel</span></button>
              <button type="button" onClick={() => void saveSettings()} disabled={!ready || settingsSaving || !settingsApp}><Save size={13} /><span>{settingsSaving ? 'Saving...' : 'Save'}</span></button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function NativeSettingsMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const settingsState = useApiState(() => window.lastbrowser.sidekick.getSettings(), [ready], ready);
  const modelsState = useApiState(() => window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/models' }), [ready], ready);
  const authState = useApiState(() => window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/auth/status' }), [ready], ready);
  const pluginsState = useApiState(() => window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/plugins' }), [ready], ready);
  const updatesState = useApiState(() => window.lastbrowser.updates.status(), [], true);
  const [section, setSection] = useState<SettingsSectionId>('conversation');
  const [draft, setDraft] = useState<AnyRecord>({});
  const [passwordDraft, setPasswordDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const settings = isRecord(settingsState.data?.settings) ? settingsState.data.settings : (settingsState.data || {});
  const authEnabled = settingsBoolean(authState.data?.auth_enabled, false);
  const loggedIn = settingsBoolean(authState.data?.logged_in, false);
  const passwordEnvLocked = settingsBoolean(settings.password_env_var, false);
  const modelGroups = arrayFrom(modelsState.data, ['groups']);
  const activeProvider = settingsText(modelsState.data?.active_provider, settingsText(settings.provider || settings.model_provider));
  const defaultModel = settingsText(draft.default_model ?? settings.default_model ?? modelsState.data?.default_model, '');
  const webuiVersion = settingsText(settings.webui_version, 'not detected');
  const agentVersion = settingsText(settings.agent_version, 'not detected');
  const updateState = settingsText(updatesState.data?.state, 'idle');
  const updateCurrentVersion = settingsText(updatesState.data?.currentVersion, '');
  const updateAvailableVersion = settingsText(updatesState.data?.availableVersion, '');
  const updateMessage = settingsText(updatesState.data?.message, '');
  const pluginList = arrayFrom(pluginsState.data, ['plugins', 'items']);

  useEffect(() => {
    const normalized = activeContextItem.trim().toLowerCase();
    const match = (Object.keys(SETTINGS_SECTIONS) as SettingsSectionId[]).find((key) => key === normalized);
    if (match) setSection(match);
  }, [activeContextItem]);

  useEffect(() => {
    if (settingsState.loading) return;
    setDraft(cleanSettingsPayload(settings));
    setPasswordDraft('');
    setDirty(false);
  }, [settingsState.data, settingsState.loading]);

  useEffect(() => {
    applyDesktopAppearancePreview(
      settingsText(draft.theme ?? settings.theme, 'dark'),
      settingsText(draft.skin ?? settings.skin, 'default')
    );
  }, [draft.skin, draft.theme, settings.skin, settings.theme]);

  function updateDraftField(key: string, value: unknown): void {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function updateDraftToggle(key: string, value: boolean): void {
    updateDraftField(key, value);
  }

  function restoreDraft(): void {
    setDraft(cleanSettingsPayload(settings));
    setPasswordDraft('');
    setDirty(false);
  }

  async function save(): Promise<void> {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const payload = cleanSettingsPayload({
        ...settings,
        ...draft
      });
      payload.bot_name = settingsText(payload.bot_name, 'Hermes').trim() || 'Hermes';
      if (passwordDraft.trim()) {
        payload._set_password = passwordDraft.trim();
      }
      payload.language = settingsText(payload.language, 'en');
      payload.theme = settingsText(payload.theme, 'dark');
      payload.skin = settingsText(payload.skin, 'default');
      payload.font_size = settingsText(payload.font_size, 'default');
      payload.send_key = settingsText(payload.send_key, 'enter');
      payload.busy_input_mode = ['queue', 'interrupt', 'steer'].includes(settingsText(payload.busy_input_mode)) ? payload.busy_input_mode : 'queue';
      payload.sidebar_density = settingsText(payload.sidebar_density, 'compact') === 'detailed' ? 'detailed' : 'compact';
      payload.auto_title_refresh_every = ['0', '5', '10', '20'].includes(settingsText(payload.auto_title_refresh_every)) ? settingsText(payload.auto_title_refresh_every) : '0';
      payload.session_jump_buttons = settingsBoolean(payload.session_jump_buttons, false);
      payload.session_endless_scroll = settingsBoolean(payload.session_endless_scroll, false);
      payload.show_token_usage = settingsBoolean(payload.show_token_usage, false);
      payload.show_tps = settingsBoolean(payload.show_tps, false);
      payload.show_cli_sessions = settingsBoolean(payload.show_cli_sessions, false);
      payload.sync_to_insights = settingsBoolean(payload.sync_to_insights, false);
      payload.check_for_updates = settingsBoolean(payload.check_for_updates, true);
      payload.sound_enabled = settingsBoolean(payload.sound_enabled, true);
      payload.notifications_enabled = settingsBoolean(payload.notifications_enabled, true);
      payload.simplified_tool_calling = settingsBoolean(payload.simplified_tool_calling, true);
      payload.api_redact_enabled = settingsBoolean(payload.api_redact_enabled, true);
      payload.openai_codex_enabled = settingsBoolean(payload.openai_codex_enabled, false);
      payload.show_thinking = settingsBoolean(payload.show_thinking, false);
      payload.debug = settingsBoolean(payload.debug, false);
      payload.enabled_plugins = parseSettingsCsv(settingsCsv(payload.enabled_plugins));
      payload.plugins = parseSettingsCsv(settingsCsv(payload.plugins));
      await window.lastbrowser.sidekick.saveSettings({ settings: payload });
      window.dispatchEvent(new CustomEvent('lastbrowser:settings-changed', { detail: payload }));
      setDirty(false);
      setPasswordDraft('');
      await settingsState.refresh();
      await authState.refresh();
    } catch (error) {
      showToast(`Settings save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function disableAuth(): Promise<void> {
    if (!ready || saving) return;
    if (!window.confirm('Disable authentication for this instance?')) return;
    setSaving(true);
    try {
      await window.lastbrowser.sidekick.saveSettings({ settings: { _clear_password: true } });
      window.dispatchEvent(new CustomEvent('lastbrowser:settings-changed', { detail: { _clear_password: true } }));
      setPasswordDraft('');
      await settingsState.refresh();
      await authState.refresh();
    } catch (error) {
      showToast(`Disable auth failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function signOut(): Promise<void> {
    if (!ready) return;
    try {
      await window.lastbrowser.sidekick.requestWebui({ method: 'POST', path: '/api/auth/logout', body: {} });
      await authState.refresh();
    } catch (error) {
      showToast(`Sign out failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function checkUpdates(): Promise<void> {
    await updatesState.refresh();
    try {
      await window.lastbrowser.updates.check();
      await updatesState.refresh();
    } catch (error) {
      showToast(`Update check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function renderModelOptions(): JSX.Element {
    if (!modelGroups.length) {
      return <input value={defaultModel} onChange={(event) => updateDraftField('default_model', event.target.value)} placeholder="model-id" />;
    }
    const hasCurrentModel = modelGroups.some((group) => {
      const models = Array.isArray(group.models) ? group.models.filter(isRecord) : [];
      return models.some((model) => settingsText(model.id || model.name || model.label) === defaultModel);
    });
    return (
      <select value={defaultModel} onChange={(event) => updateDraftField('default_model', event.target.value)}>
        {!defaultModel && <option value="">Server default</option>}
        {defaultModel && !hasCurrentModel && <option value={defaultModel}>{defaultModel}</option>}
        {modelGroups.map((group) => {
          const providerLabel = settingsText(group.provider || group.provider_id || 'Provider');
          const models = Array.isArray(group.models) ? group.models.filter(isRecord) : [];
          return (
            <optgroup key={`${providerLabel}-${settingsText(group.provider_id, providerLabel)}`} label={providerLabel}>
              {models.map((model) => (
                <option key={settingsText(model.id || model.name || model.label)} value={settingsText(model.id || model.name || model.label)}>
                  {settingsText(model.label || model.name || model.id)}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    );
  }

  function renderPluginsList(): JSX.Element {
    if (pluginsState.loading) {
      return <EmptyState icon={<Loader2 size={16} className="spin" />} label="Loading plugins…" />;
    }
    if (pluginsState.error) {
      return <div className="workspace-error">{pluginsState.error}</div>;
    }
    const plugins = pluginList;
    if (!plugins.length) {
      return <EmptyState icon={<Package size={16} />} label="No plugins are visible yet." />;
    }
    return (
      <div className="compact-list settings-plugin-list">
        {plugins.map((plugin) => {
          const enabled = plugin && plugin.enabled !== false;
          const hooks = Array.isArray(plugin?.hooks) ? plugin.hooks : [];
          return (
            <article key={idOf(plugin)}>
              <strong>{titleOf(plugin, 'Unnamed plugin')}</strong>
              <span>{settingsText(plugin.key || plugin.id || 'plugin')}{plugin.version ? ` · v${settingsText(plugin.version)}` : ''}</span>
              <span>{settingsText(plugin.description, 'No description provided.')}</span>
              <div className="plugin-hook-list">
                {hooks.length ? hooks.map((hook) => <span key={`${idOf(plugin)}-${settingsText(hook)}`} className="plugin-hook-badge">{settingsText(hook)}</span>) : <span className="plugin-hook-empty">No registered lifecycle hooks</span>}
              </div>
              <span className={`provider-card-badge ${enabled ? '' : 'plugin-card-badge-disabled'}`}>{enabled ? 'Enabled' : 'Disabled'}</span>
            </article>
          );
        })}
      </div>
    );
  }

  const sectionList = Object.entries(SETTINGS_SECTIONS) as Array<[SettingsSectionId, SettingsSectionMeta]>;
  const updateAvailable = updateState === 'available';

  return (
    <section className="browser-main native-rest-main settings-main">
      <NativeHeader
        icon={<Settings size={21} />}
        title="Settings"
        kicker="System"
        detail="Conversation, appearance, preferences, providers, plugins and system settings."
        loading={settingsState.loading}
        ready={ready}
        onRefresh={settingsState.refresh}
      />
      <ErrorLine error={settingsState.error || modelsState.error || authState.error || pluginsState.error} />

      <div className="settings-native-grid">
        <nav className="settings-section-nav native-work-card">
          {sectionList.map(([key, meta]) => (
            <button key={key} type="button" className={key === section ? 'active settings-section-button' : 'settings-section-button'} onClick={() => setSection(key)}>
              <span className="settings-section-button-icon">{meta.icon}</span>
              <span className="settings-section-button-text">
                <strong>{meta.title}</strong>
                <small>{meta.description}</small>
              </span>
            </button>
          ))}
        </nav>

        <main className="native-work-card settings-editor settings-panel-scroll">
          <header className="settings-editor-head">
            <div>
              <strong>{SETTINGS_SECTIONS[section].title}</strong>
              <span>{SETTINGS_SECTIONS[section].description}</span>
            </div>
            <div className="settings-editor-actions">
              <span className={`native-rest-pill ${dirty ? '' : 'ready'}`}>
                <span className={`status-dot ${dirty ? '' : 'ready'}`} />
                {dirty ? 'Unsaved' : 'Saved'}
              </span>
              <button type="button" className="secondary-action compact" onClick={() => void restoreDraft()} disabled={!ready || !dirty}>
                <RefreshCw size={15} />
                <span>Reset</span>
              </button>
              <button type="button" className="secondary-action compact" onClick={() => void save()} disabled={!ready || saving || !dirty}>
                {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                <span>Save</span>
              </button>
            </div>
          </header>

          <div className="settings-panel-stack">
            {section === 'conversation' && (
              <>
                <SettingsCard
                  title="Conversation defaults"
                  description="Model routing and composer behavior for new conversations."
                  action={<span className="settings-badge">Provider: {activeProvider || '—'}</span>}
                >
                  <div className="settings-field-grid">
                    <SettingsField label="Default model" description="Used for new conversations. Existing conversations keep their model.">
                      {renderModelOptions()}
                    </SettingsField>
                    <SettingsField label="Send key" description="Choose how Enter behaves in the composer.">
                      <select value={settingsText(draft.send_key ?? settings.send_key, 'enter')} onChange={(event) => updateDraftField('send_key', event.target.value)}>
                        <option value="enter">Enter (Shift+Enter for newline)</option>
                        <option value="ctrl+enter">Ctrl+Enter (Enter for newline)</option>
                      </select>
                    </SettingsField>
                    <SettingsField label="Chat mode" description="Default mode used when opening a new chat.">
                      <select value={settingsText(draft.chat_mode ?? settings.chat_mode, 'chat')} onChange={(event) => updateDraftField('chat_mode', event.target.value)}>
                        <option value="chat">Chat</option>
                        <option value="plan">Plan</option>
                        <option value="action">Action</option>
                      </select>
                    </SettingsField>
                    <SettingsField label="Composer mode" description="Default action on the composer toolbar.">
                      <select value={settingsText(draft.composer_mode ?? settings.composer_mode, 'action')} onChange={(event) => updateDraftField('composer_mode', event.target.value)}>
                        <option value="action">Action</option>
                        <option value="plan">Plan</option>
                        <option value="chat">Chat</option>
                      </select>
                    </SettingsField>
                    <SettingsField label="Profile" description="Profile used for new sessions.">
                      <input value={settingsText(draft.profile ?? settings.profile, '')} onChange={(event) => updateDraftField('profile', event.target.value)} placeholder="default" />
                    </SettingsField>
                    <SettingsField label="Assistant name" description="Display name across the UI.">
                      <input value={settingsText(draft.bot_name ?? settings.bot_name, 'Hermes')} onChange={(event) => updateDraftField('bot_name', event.target.value)} placeholder="Hermes" />
                    </SettingsField>
                  </div>
                </SettingsCard>
              </>
            )}

            {section === 'appearance' && (
              <>
                <SettingsCard title="Theme" description="Pick the visual theme and skin family.">
                  <div className="settings-theme-grid">
                    <button type="button" className={settingsText(draft.theme ?? settings.theme, 'dark') === 'dark' ? 'settings-theme-btn active' : 'settings-theme-btn'} onClick={() => updateDraftField('theme', 'dark')}>
                      <span className="settings-theme-preview settings-theme-preview-dark" />
                      <strong>Dark</strong>
                    </button>
                    <button type="button" className={settingsText(draft.theme ?? settings.theme, 'dark') === 'light' ? 'settings-theme-btn active' : 'settings-theme-btn'} onClick={() => updateDraftField('theme', 'light')}>
                      <span className="settings-theme-preview settings-theme-preview-light" />
                      <strong>Light</strong>
                    </button>
                    <button type="button" className={settingsText(draft.theme ?? settings.theme, 'dark') === 'system' ? 'settings-theme-btn active' : 'settings-theme-btn'} onClick={() => updateDraftField('theme', 'system')}>
                      <span className="settings-theme-preview settings-theme-preview-system" />
                      <strong>System</strong>
                    </button>
                  </div>
                </SettingsCard>

                <SettingsCard title="Skins and type" description="Accent skin and readable font scaling.">
                  <div className="settings-skin-grid">
                    {SETTINGS_SKINS.map((skin) => (
                      <button
                        key={skin.key}
                        type="button"
                        className={settingsText(draft.skin ?? settings.skin, 'default').toLowerCase() === skin.key ? 'settings-skin-btn active' : 'settings-skin-btn'}
                        onClick={() => updateDraftField('skin', skin.key)}
                      >
                        <div className="settings-skin-dots">
                          {skin.colors.map((color) => <span key={color} style={{ background: color }} />)}
                        </div>
                        <strong>{skin.name}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="settings-size-grid">
                    {[
                      ['small', 'Small'],
                      ['default', 'Default'],
                      ['large', 'Large']
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={settingsText(draft.font_size ?? settings.font_size, 'default') === value ? 'settings-size-btn active' : 'settings-size-btn'}
                        onClick={() => updateDraftField('font_size', value)}
                      >
                        <span>Aa</span>
                        <strong>{label}</strong>
                      </button>
                    ))}
                  </div>
                  <SettingsField label="Syntax theme" description="Code block theme for transcript and previews.">
                    <select value={settingsText(draft.syntax_theme ?? settings.syntax_theme, '')} onChange={(event) => updateDraftField('syntax_theme', event.target.value)}>
                      <option value="">Default</option>
                      <option value="tomorrow-night">Tomorrow Night</option>
                      <option value="one-dark">One Dark</option>
                      <option value="github-light">GitHub Light</option>
                    </select>
                  </SettingsField>
                </SettingsCard>

                <SettingsCard title="Session view" description="Defaults that affect the left sidebar and transcript layout.">
                  <div className="settings-field-grid">
                    <SettingsToggle
                      label="Keep file tree open"
                      description="Show the workspace file tree by default in chat."
                      checked={settingsBoolean(draft.workspace_panel_open ?? settings.workspace_panel_open, true)}
                      onChange={(value) => updateDraftToggle('workspace_panel_open', value)}
                    />
                    <SettingsToggle
                      label="Show session jump buttons"
                      description="Display floating start/end buttons in long sessions."
                      checked={settingsBoolean(draft.session_jump_buttons ?? settings.session_jump_buttons, false)}
                      onChange={(value) => updateDraftToggle('session_jump_buttons', value)}
                    />
                    <SettingsToggle
                      label="Infinite scroll history"
                      description="Load older messages automatically when scrolling upward."
                      checked={settingsBoolean(draft.session_endless_scroll ?? settings.session_endless_scroll, false)}
                      onChange={(value) => updateDraftToggle('session_endless_scroll', value)}
                    />
                  </div>
                </SettingsCard>
              </>
            )}

            {section === 'preferences' && (
              <>
                <SettingsCard title="Defaults" description="Language and chat behavior.">
                  <div className="settings-field-grid">
                    <SettingsField label="Language" description="User-facing UI language.">
                      <select value={settingsText(draft.language ?? settings.language, 'en')} onChange={(event) => updateDraftField('language', event.target.value)}>
                        {SETTINGS_LANGUAGES.map((language) => (
                          <option key={language.value} value={language.value}>{language.label}</option>
                        ))}
                      </select>
                    </SettingsField>
                    <SettingsField label="Sidebar density" description="How much metadata the sidebar shows.">
                      <select value={settingsText(draft.sidebar_density ?? settings.sidebar_density, 'compact') === 'detailed' ? 'detailed' : 'compact'} onChange={(event) => updateDraftField('sidebar_density', event.target.value)}>
                        <option value="compact">Compact</option>
                        <option value="detailed">Detailed</option>
                      </select>
                    </SettingsField>
                    <SettingsField label="Busy input mode" description="What happens when you send a message mid-run.">
                      <select value={settingsText(draft.busy_input_mode ?? settings.busy_input_mode, 'queue')} onChange={(event) => updateDraftField('busy_input_mode', event.target.value)}>
                        <option value="queue">Queue follow-up</option>
                        <option value="interrupt">Interrupt current turn</option>
                        <option value="steer">Steer mid-turn</option>
                      </select>
                    </SettingsField>
                    <SettingsField label="Adaptive title refresh" description="How often the session title should be regenerated.">
                      <select value={settingsText(draft.auto_title_refresh_every ?? settings.auto_title_refresh_every, '0')} onChange={(event) => updateDraftField('auto_title_refresh_every', event.target.value)}>
                        <option value="0">Off</option>
                        <option value="5">Every 5 exchanges</option>
                        <option value="10">Every 10 exchanges</option>
                        <option value="20">Every 20 exchanges</option>
                      </select>
                    </SettingsField>
                  </div>
                </SettingsCard>

                <SettingsCard title="Notifications and activity" description="Background visibility and response signaling.">
                  <div className="settings-field-grid">
                    <SettingsToggle
                      label="Notification sound"
                      description="Play a sound when a response completes."
                      checked={settingsBoolean(draft.sound_enabled ?? settings.sound_enabled, true)}
                      onChange={(value) => updateDraftToggle('sound_enabled', value)}
                    />
                    <SettingsToggle
                      label="Browser notifications"
                      description="Show desktop notifications while the tab is in the background."
                      checked={settingsBoolean(draft.notifications_enabled ?? settings.notifications_enabled, true)}
                      onChange={(value) => updateDraftToggle('notifications_enabled', value)}
                    />
                    <SettingsToggle
                      label="Show token usage"
                      description="Display token counts under assistant replies."
                      checked={settingsBoolean(draft.show_token_usage ?? settings.show_token_usage, false)}
                      onChange={(value) => updateDraftToggle('show_token_usage', value)}
                    />
                    <SettingsToggle
                      label="Show token speed (TPS)"
                      description="Display streaming tokens per second."
                      checked={settingsBoolean(draft.show_tps ?? settings.show_tps, false)}
                      onChange={(value) => updateDraftToggle('show_tps', value)}
                    />
                    <SettingsToggle
                      label="Compact tool activity"
                      description="Group thinking and tool calls into one collapsed activity section."
                      checked={settingsBoolean(draft.simplified_tool_calling ?? settings.simplified_tool_calling, true)}
                      onChange={(value) => updateDraftToggle('simplified_tool_calling', value)}
                    />
                    <SettingsToggle
                      label="Show reasoning"
                      description="Display the assistant's reasoning summaries when available."
                      checked={settingsBoolean(draft.show_thinking ?? settings.show_thinking, false)}
                      onChange={(value) => updateDraftToggle('show_thinking', value)}
                    />
                    <SettingsToggle
                      label="Show non-WebUI sessions"
                      description="Surface CLI, Telegram, Discord and Slack sessions in the list."
                      checked={settingsBoolean(draft.show_cli_sessions ?? settings.show_cli_sessions, false)}
                      onChange={(value) => updateDraftToggle('show_cli_sessions', value)}
                    />
                    <SettingsToggle
                      label="Sync usage to insights"
                      description="Mirror browser session usage into the insights store."
                      checked={settingsBoolean(draft.sync_to_insights ?? settings.sync_to_insights, false)}
                      onChange={(value) => updateDraftToggle('sync_to_insights', value)}
                    />
                    <SettingsToggle
                      label="Check for updates"
                      description="Show update banners and keep the local release feed current."
                      checked={settingsBoolean(draft.check_for_updates ?? settings.check_for_updates, true)}
                      onChange={(value) => updateDraftToggle('check_for_updates', value)}
                    />
                  </div>
                </SettingsCard>
              </>
            )}

            {section === 'providers' && (
              <>
                <SettingsCard
                  title="Provider defaults"
                  description="Provider routing and API redaction."
                  action={<span className="settings-badge">{activeProvider || 'No active provider'}</span>}
                >
                  <div className="settings-field-grid">
                    <SettingsField label="Provider" description="Top-level provider identifier.">
                      <input value={settingsText(draft.provider ?? settings.provider, '')} onChange={(event) => updateDraftField('provider', event.target.value)} placeholder="openai-codex" />
                    </SettingsField>
                    <SettingsField label="Model provider" description="Provider family used for model resolution.">
                      <input value={settingsText(draft.model_provider ?? settings.model_provider, '')} onChange={(event) => updateDraftField('model_provider', event.target.value)} placeholder="openai-codex" />
                    </SettingsField>
                    <SettingsField label="Gateway" description="Optional gateway / proxy identifier.">
                      <input value={settingsText(draft.gateway ?? settings.gateway, '')} onChange={(event) => updateDraftField('gateway', event.target.value)} placeholder="default" />
                    </SettingsField>
                    <SettingsField label="OpenAI Codex" description="Enable Codex-specific provider handling.">
                      <select value={settingsBoolean(draft.openai_codex_enabled ?? settings.openai_codex_enabled, false) ? 'true' : 'false'} onChange={(event) => updateDraftField('openai_codex_enabled', event.target.value === 'true')}>
                        <option value="false">Disabled</option>
                        <option value="true">Enabled</option>
                      </select>
                    </SettingsField>
                    <SettingsField label="API redaction" description="Hide sensitive data in API responses.">
                      <select value={settingsBoolean(draft.api_redact_enabled ?? settings.api_redact_enabled, true) ? 'true' : 'false'} onChange={(event) => updateDraftField('api_redact_enabled', event.target.value === 'true')}>
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                    </SettingsField>
                  </div>
                </SettingsCard>

                <SettingsCard title="Model catalog" description="Live `/api/models` payload mirrored from the backend.">
                  {modelsState.loading && <EmptyState icon={<Loader2 size={16} className="spin" />} label="Loading models…" />}
                  {modelsState.error && <div className="workspace-error">{modelsState.error}</div>}
                  {!modelsState.loading && !modelsState.error && (
                    <div className="settings-model-summary">
                      <span className="settings-badge">Default: {settingsText(modelsState.data?.default_model, '—')}</span>
                      <span className="settings-badge">Active provider: {activeProvider || '—'}</span>
                      <span className="settings-badge">Groups: {modelGroups.length}</span>
                    </div>
                  )}
                </SettingsCard>
              </>
            )}

            {section === 'plugins' && (
              <>
                <SettingsCard title="Connected apps" description="Installed app integrations and their current visibility.">
                  <div className="settings-field-grid">
                    <SettingsToggle
                      label="Gmail visible in sidebar"
                      description="Shown only when installed from the appstore."
                      checked={settingsBoolean(draft.gmail ?? settings.gmail, false)}
                      onChange={(value) => updateDraftToggle('gmail', value)}
                    />
                    <SettingsToggle
                      label="Discord visible in sidebar"
                      description="Shown only when installed from the appstore."
                      checked={settingsBoolean(draft.discord ?? settings.discord, false)}
                      onChange={(value) => updateDraftToggle('discord', value)}
                    />
                    <SettingsField label="Enabled plugins" description="Comma-separated plugin keys.">
                      <input value={settingsCsv(draft.enabled_plugins ?? settings.enabled_plugins)} onChange={(event) => updateDraftField('enabled_plugins', event.target.value)} placeholder="gmail,discord" />
                    </SettingsField>
                  </div>
                </SettingsCard>

                <SettingsCard title="Installed plugin inventory" description="What the backend currently exposes.">
                  {renderPluginsList()}
                </SettingsCard>
              </>
            )}

            {section === 'system' && (
              <>
                <SettingsCard
                  title="Access and updates"
                  description="Authentication, password control and package updates."
                  action={
                    <div className="settings-system-badges">
                      <span className="settings-badge">WebUI: {webuiVersion}</span>
                      <span className="settings-badge">Agent: {agentVersion}</span>
                    </div>
                  }
                >
                  <div className="settings-field-grid">
                    <SettingsField label="Access password" description="Leave blank to keep the current password.">
                      <input
                        type="password"
                        value={passwordDraft}
                        disabled={passwordEnvLocked}
                        onChange={(event) => {
                          setPasswordDraft(event.target.value);
                          setDirty(true);
                        }}
                        placeholder={passwordEnvLocked ? 'Locked by env var' : 'Enter new password…'}
                      />
                    </SettingsField>
                    <SettingsField label="Workspace root" description="Default workspace path for this install.">
                      <input value={settingsText(draft.workspace_root ?? settings.workspace_root, '')} onChange={(event) => updateDraftField('workspace_root', event.target.value)} placeholder={settingsText(serviceStatus?.runtimeDir, '')} />
                    </SettingsField>
                    <SettingsToggle
                      label="Debug mode"
                      description="Enable verbose diagnostics in the desktop shell."
                      checked={settingsBoolean(draft.debug ?? settings.debug, false)}
                      onChange={(value) => updateDraftToggle('debug', value)}
                    />
                    <SettingsToggle
                      label="Auth enabled"
                      description={authEnabled ? 'Authentication is currently active.' : 'Authentication is currently disabled.'}
                      checked={authEnabled}
                      onChange={() => void 0}
                      disabled
                    />
                  </div>
                  {passwordEnvLocked && (
                    <div className="settings-env-lock">
                      The HERMES_WEBUI_PASSWORD environment variable is set and overrides this password field.
                    </div>
                  )}
                  <div className="settings-system-actions">
                    <button type="button" className="secondary-action compact" onClick={() => void checkUpdates()} disabled={!ready || updatesState.loading}>
                      {updatesState.loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                      <span>Check updates</span>
                    </button>
                    <button type="button" className="secondary-action compact" onClick={() => void signOut()} disabled={!ready || !loggedIn}>
                      <Shield size={15} />
                      <span>Sign out</span>
                    </button>
                    <button type="button" className="secondary-action compact" onClick={() => void disableAuth()} disabled={!ready || !authEnabled || passwordEnvLocked}>
                      <Trash2 size={15} />
                      <span>Disable auth</span>
                    </button>
                  </div>
                  <div className="settings-system-status">
                    <span className={`settings-badge ${updateAvailable ? 'warning' : ''}`}>Update state: {updateState}</span>
                    {updateCurrentVersion && <span className="settings-badge">Current: {updateCurrentVersion}</span>}
                    {updateAvailableVersion && <span className="settings-badge">Available: {updateAvailableVersion}</span>}
                    {updateMessage && <span className="settings-badge">{updateMessage}</span>}
                  </div>
                </SettingsCard>

                <SettingsCard title="Developer API tools" description="Useful while bridging remaining WebUI endpoints.">
                  <AdvancedWebUiTools panel="settings" serviceStatus={serviceStatus} compact />
                </SettingsCard>
              </>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}
