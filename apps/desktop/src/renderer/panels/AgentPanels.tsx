import React, { FormEvent, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import {
  Brain,
  CheckCircle2,
  Edit3,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Users
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import { useDesktopI18n } from '../i18n.js';
import { novaAssistantsCopy } from '../i18n/nova-assistants-copy.js';
import { bundledNovaAssistants } from '../nova-assistant-templates.js';
import type { IndependentScope } from '../independent-contracts.js';
import type { IndependentAssistantController } from '../independent-assistant-controller.js';
import type { DesktopSessionSummary } from '../shell-state.js';
import {
  deleteNovaAssistantProfile, novaAssistantInstructionsLimit, novaAssistantNameLimit,
  readNovaAssistantProfiles, saveNovaAssistantProfile, type NovaAssistantProfile,
} from '../nova-assistant-profiles.js';
import { AssistantActivity } from './AssistantActivity.js';
import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';
import { extractLinkedFiles, normalizeSkillCategories, normalizeSkillCategory } from './skill-categories.js';
import { MemoryPanelStateModel, memoryDocumentId, type MemorySection } from './memory-panel-state.js';
import { OptionalAiProfileContext, OptionalAiWorkspaceContext, useOptionalAiPolicy } from '../optional-ai-policy.js';
import { ProfileResolutionPending } from '../profile-resolution.js';
import { shellText } from '../i18n/shell-text.js';
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
  const skillCategories = normalizeSkillCategories(skillsState.data?.categories);
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
    const category = normalizeSkillCategory(skill.category).toLowerCase();
    const matchesCategory = !selectedCategory || category === selectedCategory.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  });
  const selectedSkill = filtered.find((skill) => idOf(skill) === selectedName || text(skill.name) === selectedName) || filtered[0] || null;
  const linkedFiles = extractLinkedFiles(selectedSkill?.linked_files);

  useEffect(() => {
    setSection(activeContextItem || 'Library');
  }, [activeContextItem]);

  useEffect(() => {
    setSkillCategoryDraft(normalizeSkillCategory(selectedSkill?.category));
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
      category: skillCategoryDraft.trim() || normalizeSkillCategory(selectedSkill?.category),
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
              <small>{text(skill.path) || normalizeSkillCategory(skill.category) || text(skill.source)}</small>
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

type AssistantsTab = 'assistants' | 'activity' | 'manage';
const assistantsTabs: AssistantsTab[] = ['assistants', 'activity', 'manage'];

type AssistantsMainProps = {
  serviceStatus: ServiceStatus | null;
  activeContextItem: string;
  browserProfileId: string;
  scope?: IndependentScope;
  controller?: IndependentAssistantController;
  sessions?: readonly DesktopSessionSummary[];
  selectedAssistantId?: string;
  onOpenAssistant?: (assistantId: string | null) => Promise<'opened' | 'cancelled' | 'failed'>;
  onSelectSession?: (sessionId: string) => void;
  onOpenTask?: (sessionId: string) => void;
};

function assistantsTabForContext(item: string): AssistantsTab {
  if (item === 'Activity' || item === 'Chat sessions') return 'activity';
  if (item === 'Manage' || item === 'Create agent' || item === 'Profiles') return 'manage';
  return 'assistants';
}

export function NativeAssistantsMain({
  serviceStatus, activeContextItem, browserProfileId, scope, controller, sessions, selectedAssistantId,
  onOpenAssistant, onSelectSession, onOpenTask
}: AssistantsMainProps): JSX.Element {
  const { locale, t } = useDesktopI18n();
  const copy = novaAssistantsCopy[locale];
  const optional = useOptionalAiPolicy(scope?.spaceId);
  const mayRun = optional.loaded && optional.policy.assistants_enabled;
  const ready = isReady(serviceStatus) && scope?.browserProfileId === browserProfileId;
  const tabsId = useId();
  const [tab, setTab] = useState<AssistantsTab>(() => assistantsTabForContext(activeContextItem));
  const [assistants, setAssistants] = useState<NovaAssistantProfile[]>(() => {
    if (typeof window === 'undefined' || !browserProfileId) return [];
    try { return readNovaAssistantProfiles(window.localStorage, browserProfileId); }
    catch { return []; }
  });
  const [draft, setDraft] = useState<NovaAssistantProfile | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const pendingOpen = useRef(false);
  const availableAssistants = [...bundledNovaAssistants(locale), ...assistants];
  const hasSelectedAssistant = availableAssistants.some((assistant) => assistant.id === selectedAssistantId);

  useEffect(() => { setTab(assistantsTabForContext(activeContextItem)); }, [activeContextItem]);

  async function openAssistant(id: string | null): Promise<void> {
    if (pendingOpen.current || !ready || !onOpenAssistant || (id !== null && !mayRun)) return;
    pendingOpen.current = true;
    setPending(true);
    setError('');
    try {
      if (await onOpenAssistant(id) === 'failed') setError(copy.unableToOpen);
    } catch {
      setError(copy.unableToOpen);
    } finally {
      pendingOpen.current = false;
      setPending(false);
    }
  }

  function saveAssistant(event: FormEvent): void {
    event.preventDefault();
    if (!draft?.name.trim() || !browserProfileId) return;
    try {
      setAssistants(saveNovaAssistantProfile(window.localStorage, browserProfileId, draft));
      setDraft(null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function removeAssistant(assistant: NovaAssistantProfile): void {
    if (!window.confirm(copy.remove.replace('{name}', () => assistant.name))) return;
    try {
      setAssistants(deleteNovaAssistantProfile(window.localStorage, browserProfileId, assistant.id));
      setDraft(null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <section className="browser-main native-rest-main assistants-main">
      <h1>{copy.assistants}</h1>
      <div className="native-card-actions insights-tabs" role="tablist" aria-label={copy.assistants}>
        {assistantsTabs.map((item, index) => (
          <button key={item} id={`${tabsId}-${item}`} type="button" role="tab" aria-selected={item === tab}
            aria-controls={`${tabsId}-panel`} tabIndex={item === tab ? 0 : -1} onClick={() => { setTab(item); setError(''); }}
            onKeyDown={(event) => {
              const previous = event.key === 'ArrowLeft';
              if (!previous && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const next = assistantsTabs[(index + (previous ? assistantsTabs.length - 1 : 1)) % assistantsTabs.length];
              setTab(next);
              setError('');
              document.getElementById(`${tabsId}-${next}`)?.focus();
            }}>{copy[item]}</button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`}>
        {tab === 'assistants' && (
          <section className="native-work-card">
            <p>{copy.space}</p>
            {optional.loaded && !mayRun && <p role="status">{copy.disabled}</p>}
            {optional.error && <p role="alert">{optional.error}</p>}
            <div className="native-card-actions">
              <button type="button" disabled={!ready || pending || !onOpenAssistant} onClick={() => void openAssistant(null)}>
                Nova{!hasSelectedAssistant && <small>{copy.selected}</small>}
              </button>
              {availableAssistants.map((assistant) => (
                <button key={assistant.id} type="button" disabled={!ready || !mayRun || pending || !onOpenAssistant}
                  onClick={() => void openAssistant(assistant.id)}>
                  {assistant.name}{selectedAssistantId === assistant.id && <small>{copy.selected}</small>}
                </button>
              ))}
            </div>
          </section>
        )}
        {tab === 'activity' && <AssistantActivity scope={scope} controller={controller} sessions={sessions}
          onSelectSession={onSelectSession} onOpenTask={onOpenTask} />}
        {tab === 'manage' && (
          <section className="native-work-card">
            <h2>{copy.profile}</h2>
            <button type="button" disabled={!browserProfileId} onClick={() => setDraft({ id: crypto.randomUUID(), name: '', instructions: '' })}>
              <Plus size={14} />{copy.add}
            </button>
            <ul className="assistants-list">
              {assistants.map((assistant) => (
                <li key={assistant.id}>
                  <button type="button" onClick={() => setDraft(assistant)}>{assistant.name}</button>
                  <button type="button" aria-label={copy.remove.replace('{name}', () => assistant.name)} onClick={() => removeAssistant(assistant)}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            {draft && (
              <form className="assistants-editor" onSubmit={saveAssistant}>
                <label>{t('agentPanels.agentNamePrompt')}
                  <input value={draft.name} required maxLength={novaAssistantNameLimit}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label>{copy.instructions}
                  <textarea value={draft.instructions} rows={6} maxLength={novaAssistantInstructionsLimit}
                    onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
                </label>
                <div className="native-card-actions">
                  <button type="submit" disabled={!draft.name.trim()}>{t('common.save')}</button>
                  <button type="button" onClick={() => setDraft(null)}>{t('common.cancel')}</button>
                </div>
              </form>
            )}
          </section>
        )}
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
  const profile = useContext(OptionalAiProfileContext);
  const workspacePath = useContext(OptionalAiWorkspaceContext);
  const { locale } = useDesktopI18n();
  if (!profile) return <ProfileResolutionPending />;
  if (workspacePath === null) return <section className="browser-main native-rest-main"><p role="status">{locale === 'de' ? 'Kein Space ausgewählt. Wähle einen Space, um dessen Gedächtnis zu öffnen.' : 'No Space selected. Select a Space to open its memory.'}</p></section>;
  return <ScopedMemoryMain key={`${profile}::${workspacePath}`} profile={profile} workspacePath={workspacePath} serviceStatus={serviceStatus} activeContextItem={activeContextItem} />;
}

function ScopedMemoryMain({ profile, workspacePath, serviceStatus, activeContextItem }: { profile: string; workspacePath: string; serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const { t, locale } = useDesktopI18n();
  const optional = useOptionalAiPolicy();
  const de = locale === 'de';
  const ready = isReady(serviceStatus);
  const [model] = useState(() => {
    const api = window.lastbrowser.sidekick;
    return new MemoryPanelStateModel({
      getMemory: () => api.getMemory({ profile, workspacePath }),
      writeMemory: request => api.writeMemory({ ...request, profile, workspacePath }),
      getSupermemoryStatus: () => api.getSupermemoryStatus({ profile, workspacePath }),
      listSupermemoryDocuments: () => api.listSupermemoryDocuments({ profile, workspacePath }),
      getSupermemoryDocument: request => api.getSupermemoryDocument({ ...request, profile, workspacePath }),
      searchSupermemory: request => api.searchSupermemory({ ...request, profile, workspacePath }),
      hybridMemorySearch: request => api.hybridMemorySearch({ ...request, profile, workspacePath }),
      addSupermemoryDocument: request => api.addSupermemoryDocument({ ...request, profile, workspacePath }),
      forgetSupermemoryDocument: request => api.forgetSupermemoryDocument({ ...request, profile, workspacePath })
    });
  });
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const [section, setSection] = useState<MemorySection>('memory');
  const [focus, setFocus] = useState('about');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentContent, setDocumentContent] = useState('');

  useEffect(() => {
    model.activate();
    if (ready) void model.refresh();
    return model.dispose;
  }, [model, ready]);
  useEffect(() => {
    setFocus(activeContextItem === 'Supermemory' || activeContextItem === 'Hybrid search' ? 'knowledge' : 'about');
    if (activeContextItem === 'User facts') setSection('user');
    else if (activeContextItem === 'Core memory') setSection('memory');
    model.clearSearch();
  }, [activeContextItem, model]);

  function selectFocus(item: string): void {
    setFocus(item);
    model.clearSearch();
  }
  async function addDocument(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (await model.add(documentTitle, documentContent)) {
      setAdding(false);
      setDocumentTitle('');
      setDocumentContent('');
    }
  }
  function forgetDocument(): void {
    if (!state.selected || !memoryDocumentId(state.selected)) return;
    if (window.confirm(t('agentPanels.forgetDocumentConfirm', { name: titleOf(state.selected) }))) void model.forget();
  }
  const items = state.searched ? state.results : state.documents;
  const documentCount = typeof state.status?.document_count === 'number' ? state.status.document_count : state.documents.length;
  const storageReady = state.status?.configured === true && state.status?.connected !== false;
  const mode = state.status?.tier === 'local_bm25' ? t('memory.keywordSearch') : text(state.status?.model || state.status?.tier);
  const canForget = !!memoryDocumentId(state.selected) && !!state.detail && !state.documentBusy;
  return (
    <section className="browser-main native-rest-main memory-main">
      <NativeHeader icon={<Brain size={21} />} title={de ? shellText(locale, "Gedächtnis & Wissen", "Memory and knowledge") : 'Memory & Knowledge'} kicker={de ? 'Deine Informationen' : 'Your information'}
        detail={de ? 'Du entscheidest, was dein Assistent verwenden darf.' : 'You decide what your assistant may use.'} loading={state.loading} ready={ready} onRefresh={model.refresh} />
      <p role="status">{optional.loaded ? optional.policy.enabled
        ? (de ? 'Gedächtnis aktiv' : 'Memory enabled')
        : (de ? 'Gedächtnis deaktiviert. Vorhandene Daten kannst du weiterhin ansehen, bearbeiten und löschen.' : 'Memory disabled. Existing data can still be reviewed, edited and deleted.')
        : (de ? 'Einstellungen werden geladen …' : 'Loading settings …')}</p>
      {optional.error && <p role="alert">{optional.error}</p>}
      <div aria-live="polite"><ErrorLine error={state.error} /></div>
      <div className="native-card-actions insights-tabs" role="tablist" aria-label={t('memory.title')}>
        {[
          ['about', de ? 'Über mich' : 'About me'], ['knowledge', de ? 'Wissen' : 'Knowledge'], ['controls', de ? 'Kontrolle' : 'Controls']
        ].map(([item, label]) => (
          <button key={item} type="button" role="tab" aria-selected={item === focus} className={item === focus ? 'active' : ''}
            onClick={() => selectFocus(item)}>{label}</button>
        ))}
      </div>
      {focus === 'controls' && <section className="native-work-card">
        <h3>{de ? 'Verwendung kontrollieren' : 'Control usage'}</h3>
        <label><input type="checkbox" checked={optional.policy.enabled} disabled={!optional.loaded || optional.busy}
          onChange={event => void optional.update({ enabled: event.target.checked })} /> {de ? 'Gedächtnis für KI-Antworten aktivieren' : 'Enable memory for AI responses'}</label>
        <p>{de ? 'Deaktivieren stoppt automatische Speicherung und Suche. Es löscht keine Daten.' : 'Disabling stops automatic storage and retrieval. It does not delete data.'}</p>
        <label><input type="checkbox" checked={optional.policy.cloud_search_enabled} disabled={!optional.loaded || optional.busy}
          onChange={event => void optional.update({ cloud_search_enabled: event.target.checked })} /> {de ? 'Cloud-Suche erlauben' : 'Allow cloud search'}</label>
        <p>{de ? 'Bei Cloud-Suche können Dokument- und Suchtexte an den konfigurierten externen Anbieter gesendet werden. Ohne Zustimmung bleibt die Suche lokal.' : 'Cloud search may send document and query text to the configured external provider. Without consent, search stays local.'}</p>
        <label>{de ? 'Geltungsbereich' : 'Scope'} <select value={optional.policy.scope} disabled={!optional.loaded || optional.busy}
          onChange={event => void optional.update({ scope: event.target.value as 'profile' | 'space' })}>
          {optional.policy.supported_scopes.map(scope => <option key={scope} value={scope}>{scope === 'profile' ? (de ? 'Aktives KI-Profil' : 'Active AI profile') : 'Space'}</option>)}
        </select></label>
        <p>{de ? 'Einzelne Dokumente löschst du unter Wissen. Fakten kannst du unter Über mich entfernen und speichern.' : 'Delete individual documents under Knowledge. Remove facts under About me and save.'}</p>
        <p>{de ? 'Kontextauszüge früherer Antworten bleiben im Chatverlauf gespeichert. Um sie zu entfernen, lösche den jeweiligen Chat.' : 'Context excerpts from earlier responses remain in chat history. Delete the corresponding chat to remove them.'}</p>
      </section>}
      <div className="memory-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {focus === 'about' && <section className="native-work-card memory-editor">
          <p>{de ? 'Vorlieben, wichtige Fakten und Notizen. Diese Angaben werden nur bei aktiviertem Gedächtnis verwendet.' : 'Preferences, important facts and notes. These details are used only when memory is enabled.'}</p>
          <header>
            <div className="settings-section-nav">
              {(['memory', 'user'] as const).map((item) => <button key={item} type="button"
                className={item === section ? 'active' : ''} aria-pressed={item === section}
                onClick={() => setSection(item)}>
                {item === 'user' ? (de ? 'Fakten über mich' : 'Facts about me') : (de ? 'Notizen & Vorlieben' : 'Notes & preferences')}
              </button>)}
            </div>
            <button type="button" onClick={() => void model.save(section)} disabled={!ready || !state.loaded || state.saving || !model.isDirty(section)}>
              <Save size={13} />{state.saving ? t('common.loading') : t('common.save')}
            </button>
          </header>
          <label className="memory-section-label" htmlFor="memory-note-editor">{t(section === 'user' ? 'memory.userFacts' : 'memory.coreMemory')}</label>
          <textarea id="memory-note-editor" value={state.drafts[section]} disabled={!ready || !state.loaded}
            onChange={(event) => model.setDraft(section, event.target.value)} />
          <p className="memory-edit-status" role="status">{model.isDirty(section) ? t('memory.unsavedChanges') : state.loaded ? t('memory.saved') : t('common.loading')}</p>
        </section>}
        {focus === 'knowledge' && <section className="native-work-card memory-super">
          <header>
            <strong>{de ? 'Deine Wissensbibliothek' : 'Your knowledge library'}</strong>
            <div className="native-card-actions">
              <button type="button" onClick={() => setAdding((value) => !value)} disabled={!ready || state.documentBusy}><Plus size={13} />{t('memory.add')}</button>
              <button type="button" className="danger" onClick={forgetDocument} disabled={!ready || !canForget}><Trash2 size={13} />{t('memory.forget')}</button>
            </div>
          </header>
          <p className="memory-storage-status" role="status">
            {state.loading && !state.status ? t('common.loading') : storageReady
              ? t('memory.documentCount', { count: documentCount }) : t('memory.storageUnavailable')}
          </p>
          {storageReady && mode && <p className="memory-edit-status">{t('memory.searchMode', { mode })}</p>}
          {adding && <form className="memory-document-form" onSubmit={(event) => void addDocument(event)}>
            <label>{t('memory.documentTitle')}<input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} required disabled={state.documentBusy} /></label>
            <label>{t('memory.documentContent')}<textarea value={documentContent} onChange={(event) => setDocumentContent(event.target.value)} required disabled={state.documentBusy} /></label>
            <div className="native-card-actions">
              <button type="submit" disabled={!ready || state.documentBusy || !documentTitle.trim() || !documentContent.trim()}>{t('common.save')}</button>
              <button type="button" onClick={() => setAdding(false)} disabled={state.documentBusy}>{t('common.cancel')}</button>
            </div>
          </form>}
          <form onSubmit={(event) => { event.preventDefault(); if (optional.loaded && optional.policy.enabled) void model.search(search, true); }}>
            <label className="native-search"><Search size={14} /><input value={search} aria-label={t('agentPanels.memorySearchPlaceholder')}
              onChange={(event) => { setSearch(event.target.value); model.clearSearch(); }} placeholder={t('agentPanels.memorySearchPlaceholder')} /></label>
            <div className="native-card-actions">
              <button type="submit" disabled={!ready || !optional.loaded || !optional.policy.enabled || state.searching || !search.trim()}><Search size={13} />{t('memory.search')}</button>
              {state.searched && <button type="button" onClick={() => { setSearch(''); model.clearSearch(); }}>{t('memory.clearSearch')}</button>}
            </div>
          </form>
          <strong>{state.searched ? t('memory.searchResults') : t('memory.documentLibrary')}</strong>
          <div className="compact-list memory-document-list" aria-live="polite">
            {state.searching ? <p>{t('common.loading')}</p> : items.length ? items.map((item, index) =>
              <button key={String(item.source || 'supermemory') + ':' + String(item.id || index)} type="button"
                className={state.selected === item ? 'active' : ''} onClick={() => void model.open(item)} disabled={state.documentBusy}>
                <strong>{titleOf(item)}</strong><small>{item.source === 'local' ? t('memory.localHit') : t('memory.documentHit')}</small>
                <span>{text(item.content || item.text).slice(0, 180)}</span>
              </button>) : <p>{t(state.searched ? 'memory.noResults' : 'memory.noDocuments')}</p>}
          </div>
          <section className="memory-document-detail" aria-live="polite">
            {state.documentBusy ? <p>{t('common.loading')}</p> : state.detail ? <>
              <strong>{titleOf(state.detail)}</strong>
              {state.detail.source === 'local' && <p>{t('memory.localHit')}</p>}
              <pre>{text(state.detail.content || state.detail.text)}</pre>
            </> : <p>{t('agentPanels.supermemorySelectDocument')}</p>}
          </section>
        </section>}
      </div>
    </section>
  );
}
