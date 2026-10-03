import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../appearance.css';
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  Grid2X2,
  Info,
  Loader2,
  LogIn,
  Package,
  Plus,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Stethoscope,
  Terminal,
  Trash2,
  Users,
  Wrench,
  X,
  XCircle
} from 'lucide-react';
import { GeminiAccountsPanel } from './GeminiAccountsPanel.js';
import { MailPluginSettings } from './MailPluginSettings.js';
import { TeamworkSettingsPanel } from './TeamworkSettingsPanel.js';
import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';
import { cloudProviderOptions, openProviderOAuthUrl, type OnboardingStatus, type ProviderOption } from '../setup-state.js';
import { providerPresentation } from '../provider-presentation.js';
import { requestProviderModelCatalog } from '../provider-settings.js';
import { localizedProviderDescription } from '../i18n/provider-descriptions.js';
import { providerVerification } from '../provider-verification.js';
import { getProviderChatEvidence } from '../provider-chat-evidence.js';
import { clearBrowserDataWithFeedback } from '../utils/clear-browser-data.js';
import { copyDoctorOutput, runDoctorExclusively } from '../utils/doctor-dashboard.js';
import { searchEngines } from '../tabs.js';
import { computeAccentTokens } from '../App.js';
import { type ExtensionRecord, type ExtensionPreset } from '../bridge.js';
import { useDesktopI18n } from '../i18n.js';
import type { DoctorReport } from '../shell-state.js';
import type { DesktopTranslationKey } from '../i18n/keys.js';
import {
  usePanelStore,
  type ZenExitDefaultMode,
  type ActionBarDock,
  type ThemeAccent,
  type GlassLevel,
  type UiDensity,
  type NovaDockPosition,
  type NovaDockAnimation,
  type NovaDockPreset
} from '../stores/usePanelStore.js';
import { DEFAULT_VISION_IMPAIRED_CONFIG } from '../stores/a11y-config.js';
import { AccessibilityTestCard } from '../components/AccessibilityTestCard.js';
import { ProfileSwitcher } from '../components/HeaderComponents.js';
import type { BrowserProfile } from '../profiles.js';
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
  toNumber,
  formatCompactNumber,
  formatMoney,
  percentValue,
  appstoreSettingType,
  jsonPreview,
  NativeHeader,
  ErrorLine,
  EmptyState
} from './RestPanelShared.js';

function showToast(message: string): void {
  if (typeof (window as unknown as { showToast?: (msg: string) => void }).showToast === 'function') {
    (window as unknown as { showToast: (msg: string) => void }).showToast(message);
  } else {
    console.log('[Toast]', message);
  }
}

export type SidebarAppPanel = 'gmail' | 'discord';

export function sidebarAppPanelForApp(app: AnyRecord): SidebarAppPanel | null {
  const candidate = text(app.id || app.app_id || app.slug || app.name || app.title || app.panel || '').toLowerCase();
  if (candidate.includes('gmail') || candidate.includes('mail')) return 'gmail';
  if (candidate.includes('discord')) return 'discord';
  return null;
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry).trim()).filter(Boolean);
}

type OpenRouterModelOption = { id: string; label: string };

function normalizeOpenRouterModels(value: unknown): OpenRouterModelOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = text(entry.id || entry.model).trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: text(entry.label || entry.name || id).trim() || id }];
  });
}

type NormalizedAppstoreRecord = {
  id: string;
  key: string;
  name: string;
  category: string;
  developer: string;
  description: string;
  fullDescription: string;
  version: string;
  size: string;
  icon: string;
  tags: string[];
  screenshots: string[];
  installed: boolean;
  updateAvailable: boolean;
  settingsUrl: string;
  featured: boolean;
  pinned: boolean;
  recommended: boolean;
  status: AnyRecord | null;
  [field: string]: unknown;
};

export function normalizeAppstoreRecord(app: AnyRecord): NormalizedAppstoreRecord {
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
    featured: Boolean(app.featured),
    pinned: Boolean(app.pinned),
    recommended: Boolean(app.recommended),
    status: isRecord(app.status) ? app.status : null
  };
}

export type SettingsSectionId = 'conversation' | 'appearance' | 'preferences' | 'providers' | 'teamwork' | 'plugins' | 'system';

export type SettingsSectionMeta ={
  title: string;
  description: string;
  icon: React.ReactNode;
};

export const SETTINGS_SKINS = [
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

export const SETTINGS_LANGUAGES = [
  { value: 'auto', label: 'System / Auto' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'it', label: 'Italiano' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'ru', label: 'Русский' }
] as const;

export const SETTINGS_SECTIONS: Record<SettingsSectionId, SettingsSectionMeta> ={
  conversation: {
    title: 'Conversation',
    description: 'Default model, send key and assistant identity.',
    icon: <MessageSquareIcon size={16} />
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
  teamwork: {
    title: 'KI-Orchestrierung',
    description: 'Multi-Agent Teamwork, Smart Track (Single Track) & kuratierte Modellwand.',
    icon: <Users size={16} />
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

const SETTINGS_SECTION_COPY: Record<SettingsSectionId, { title: DesktopTranslationKey; description: DesktopTranslationKey }> ={
  conversation: { title: 'settings.sections.conversation', description: 'settings.sectionDescriptions.conversation' },
  appearance: { title: 'settings.sections.appearance', description: 'settings.sectionDescriptions.appearance' },
  preferences: { title: 'settings.sections.preferences', description: 'settings.sectionDescriptions.preferences' },
  providers: { title: 'settings.sections.providers', description: 'settings.sectionDescriptions.providers' },
  teamwork: { title: 'settings.sections.teamwork', description: 'settings.sectionDescriptions.teamwork' },
  plugins: { title: 'settings.sections.plugins', description: 'settings.sectionDescriptions.plugins' },
  system: { title: 'settings.sections.system', description: 'settings.sectionDescriptions.system' }
};

function MessageSquareIcon({ size }: { size: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function SettingsCard({
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

export function SettingsField({
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

export function SettingsToggle({
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

export function settingsText(value: unknown, fallback = ''): string {
  return value === undefined || value === null ? fallback : String(value);
}

export function settingsBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }
  return fallback;
}

export function settingsCsv(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => settingsText(item).trim()).filter(Boolean).join(', ');
  return settingsText(value);
}

export function normalizeAppearanceTheme(value: string): 'light' | 'dark' | 'system' | 'oled' | 'vision-impaired' {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'light' || normalized === 'system' || normalized === 'oled' || normalized === 'vision-impaired') return normalized;
  return 'dark';
}

export function normalizeAppearanceSkin(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized || 'default';
}

export function parseSettingsCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function cleanSettingsPayload(payload: AnyRecord): AnyRecord {
  const next ={ ...payload };
  delete next.auth_enabled;
  delete next.logged_in;
  delete next.auth_just_enabled;
  delete next.password_env_var;
  delete next.webui_version;
  delete next.agent_version;
  delete next.success;
  return next;
}

export function applyDesktopAppearancePreview(
  themeValue: string,
  skinValue: string,
  fontSizeValue: string = 'default',
  messageLayoutValue: string = 'bubbles',
  syntaxThemeValue: string = '',
  accentColorValue: string = ''
): void {
  if (typeof document === 'undefined') return;
  const theme = normalizeAppearanceTheme(themeValue);
  const resolvedTheme = theme === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  const skin = normalizeAppearanceSkin(skinValue);
  const fontSize = String(fontSizeValue || 'default').trim().toLowerCase() || 'default';
  const messageLayout = String(messageLayoutValue || 'bubbles').trim().toLowerCase() || 'bubbles';
  const syntaxTheme = String(syntaxThemeValue || '').trim();
  const accentColor = String(accentColorValue || '').trim().toLowerCase();

  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = theme;
  root.dataset.skin = skin;
  root.dataset.fontSize = fontSize;
  root.dataset.messageLayout = messageLayout;
  root.dataset.syntaxTheme = syntaxTheme;

  root.classList.toggle('theme-light', resolvedTheme === 'light');
  root.classList.toggle('theme-dark', resolvedTheme === 'dark');
  root.classList.toggle('theme-oled', resolvedTheme === 'oled');
  root.classList.toggle('theme-vision-impaired', resolvedTheme === 'vision-impaired');
  root.classList.toggle('theme-system', theme === 'system');
  root.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark';

  if ((skin === 'custom' || accentColor) && accentColor.startsWith('#')) {
    const tokens = computeAccentTokens(accentColor);
    if (tokens) {
      root.style.setProperty('--user-accent-primary', tokens.primary);
      root.style.setProperty('--user-accent-glow', tokens.glow);
      root.style.setProperty('--user-accent-hover', tokens.hover);
      root.style.setProperty('--user-accent-text', tokens.text);
      root.style.setProperty('--accent-primary', tokens.primary);
      root.style.setProperty('--accent-glow', tokens.glow);
      root.style.setProperty('--accent-hover', tokens.hover);
      root.style.setProperty('--accent-rgb', tokens.rgbStr);
    } else {
      root.style.removeProperty('--user-accent-primary');
      root.style.removeProperty('--user-accent-glow');
      root.style.removeProperty('--user-accent-hover');
      root.style.removeProperty('--user-accent-text');
      root.style.removeProperty('--accent-primary');
      root.style.removeProperty('--accent-glow');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--accent-rgb');
    }
  } else {
    root.style.removeProperty('--user-accent-primary');
    root.style.removeProperty('--user-accent-glow');
    root.style.removeProperty('--user-accent-hover');
    root.style.removeProperty('--user-accent-text');
    root.style.removeProperty('--accent-primary');
    root.style.removeProperty('--accent-glow');
    root.style.removeProperty('--accent-hover');
    root.style.removeProperty('--accent-rgb');
  }
}

export function NativeInsightsMain({
  serviceStatus,
  activeContextItem
}: {
  serviceStatus: ServiceStatus | null;
  activeContextItem: string;
}): JSX.Element {
  const { t } = useDesktopI18n();
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
    { label: t('insights.sessions'), value: formatCompactNumber(insightData.total_sessions || insightData.sessions)},
    { label: t('insights.messages'), value: formatCompactNumber(insightData.total_messages || insightData.messages)},
    { label: t('insights.tokens'), value: formatCompactNumber(insightData.total_tokens || insightData.tokens)},
    { label: t('insights.cost'), value: formatMoney(insightData.total_cost || insightData.cost)}
  ];
  const tokenBreakdown = [
    { label: t('insights.input'), value: formatCompactNumber(insightData.total_input_tokens || insightData.input_tokens)},
    { label: t('insights.output'), value: formatCompactNumber(insightData.total_output_tokens || insightData.output_tokens)},
    { label: t('insights.averagePerSession'), value: formatCompactNumber(insightData.average_tokens_per_session || insightData.avg_tokens_per_session)},
    { label: t('insights.weeklyTotal'), value: formatCompactNumber(insightData.weekly_tokens || insightData.period_tokens)}
  ];
  const sections = [
    { id: 'Usage', label: t('insights.usage') },
    { id: 'Models', label: t('insights.models') },
    { id: 'Cost', label: t('insights.cost') },
    { id: 'LLM wiki', label: t('insights.llmWiki') }
  ];
  const sectionLabel = sections.find((item) => item.id.toLowerCase() === section.toLowerCase())?.label || section;

  useEffect(() => {
    setSection(activeContextItem || 'Usage');
  }, [activeContextItem]);

  return (
    <section className="browser-main native-rest-main insights-main">
      <NativeHeader icon={<Gauge size={21} />} title={t('insights.title')} kicker={t('insights.kicker')} detail={t('insights.detail')} loading={insights.loading} ready={ready} onRefresh={insights.refresh} />
      <AdvancedWebUiTools panel="insights" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {sections.map((item) => (
          <button key={item.id} type="button" className={item.id === section ? 'active' : ''} onClick={() => setSection(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className="native-card-actions">
        <select value={days} aria-label={t('insights.daysCount', { count: days })} onChange={(event) => setDays(Number(event.target.value))}>{[7, 14, 30, 90].map((value) => <option key={value} value={value}>{t('insights.daysCount', { count: value })}</option>)}</select>
      </div>
      <ErrorLine error={insights.error || wiki.error} />
      <div className="insights-panel-grid">
        <aside className="insights-panel-column">
          <section className="native-work-card detail-json-card">
            <header><strong>{t('insights.overview')}</strong></header>
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
            <header><strong>{t('insights.systemHealth')}</strong></header>
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
              <EmptyState icon={<Gauge size={24} />} label={ready ? t('insights.noSystemHealth') : t('insights.sidekickStarting')} />
            )}
          </section>
          <section className="native-work-card detail-json-card">
            <header><strong>{t('insights.llmWikiStatus')}</strong></header>
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
            <header><strong>{sectionLabel}</strong></header>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))' }}>
              {metricEntries.map(([key, value]) => (
                <article key={key} className="metric-card">
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </article>
              ))}
              {!metricEntries.length && <EmptyState icon={<Gauge size={24} />} label={ready ? t('insights.noMetrics') : t('insights.sidekickStarting')} />}
            </div>
          </section>
          <div className="insights-card-row">
            <section className="native-work-card detail-json-card">
              <header><strong>{t('insights.dailyTokens')}</strong></header>
              {dailyRows.length ? (
                <div className="insights-bar-list">
                  {dailyRows.slice(0, 8).map((row, index) => {
                    const input = toNumber(row.input_tokens || row.input || row.tokens_in || row.tokens_input);
                    const output = toNumber(row.output_tokens || row.output || row.tokens_out || row.tokens_output);
                    const total = Math.max(input + output, toNumber(row.total_tokens || row.tokens || 0));
                    return (
                      <article key={idOf(row) || `${index}`} className="insights-bar-row">
                        <span className="insights-bar-label">{text(row.date || row.day || row.label || t('insights.day', { day: index + 1 }))}</span>
                        <div className="insights-bar-track">
                          <div className="insights-bar-fill insights-bar-output" style={{ width: percentValue(output, total)}} />
                          <div className="insights-bar-fill insights-bar-input" style={{ width: percentValue(input, total)}} />
                        </div>
                        <span className="insights-bar-value">{formatCompactNumber(total)}</span>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={<Gauge size={24} />} label={ready ? t('insights.noDailyUsage') : t('insights.sidekickStarting')} />
              )}
            </section>
            <section className="native-work-card detail-json-card">
              <header><strong>{t('insights.models')}</strong></header>
              {modelRows.length ? (
                <div className="insights-model-list">
                  {modelRows.slice(0, 8).map((row) => (
                    <article key={idOf(row)} className="insights-model-row">
                      <strong>{titleOf(row, t('insights.model'))}</strong>
                      <span>{t('insights.sessionsCount', { count: formatCompactNumber(row.sessions || row.usage || row.requests) })}</span>
                      <span>{t('insights.tokensCount', { count: formatCompactNumber(row.total_tokens || row.tokens || row.input_tokens || row.output_tokens) })}</span>
                      <span>{formatMoney(row.cost || row.total_cost || row.usage_cost)}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Gauge size={24} />} label={ready ? t('insights.noModelData') : t('insights.sidekickStarting')} />
              )}
            </section>
          </div>
          <section className="native-work-card detail-json-card">
            <header><strong>{t('insights.tokenBreakdown')}</strong></header>
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
            <header><strong>{t('insights.activityByHour')}</strong></header>
            {hourRows.length ? (
              <div className="insights-bar-list">
                {hourRows.slice(0, 8).map((row, index) => (
                  <article key={idOf(row) || `${index}`} className="insights-bar-row">
                    <span className="insights-bar-label">{text(row.hour ?? row.time ?? row.label ?? index).padStart(2, '0')}</span>
                    <div className="insights-bar-track">
                      <div className="insights-bar-fill insights-bar-input" style={{ width: percentValue(row.sessions || row.count || row.total || 0, hourRows.reduce((max, item) => Math.max(max, toNumber(item.sessions || item.count || item.total || 0)), 0))}} />
                    </div>
                    <span className="insights-bar-value">{formatCompactNumber(row.sessions || row.count || row.total || 0)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Gauge size={24} />} label={ready ? t('insights.noHourlyActivity') : t('insights.sidekickStarting')} />
            )}
          </section>
        </main>
      </div>
    </section>
  );
}

export function NativeLogsMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const { t } = useDesktopI18n();
  const ready = isReady(serviceStatus);
  const [file, setFile] = useState('agent');
  const [tail, setTail] = useState(200);
  const [severity, setSeverity] = useState('');
  const [wrap, setWrap] = useState(true);
  const [auto, setAuto] = useState(false);
  const [section, setSection] = useState(activeContextItem || 'Agent');
  const logs = useApiState(() => window.lastbrowser.sidekick.getLogs({ file, tail }), [ready, file, tail], ready);
  const lines = (Array.isArray(logs.data?.lines) ? logs.data.lines.map(String) : text(logs.data?.text || logs.data?.logs || logs.data?.content).split(/\r?\n/)).filter((line) => !severity || line.toLowerCase().includes(severity.toLowerCase()));
  const logSections = [
    { id: 'Agent', label: t('logs.agent') },
    { id: 'WebUI', label: t('logs.webUi') },
    { id: 'Errors', label: t('logs.errors') },
    { id: 'Gateway', label: t('logs.gateway') }
  ];

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
      <NativeHeader icon={<FileText size={21} />} title={t('logs.title')} kicker={t('logs.kicker')} detail={t('logs.detail')} loading={logs.loading} ready={ready} onRefresh={logs.refresh} />
      <AdvancedWebUiTools panel="logs" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {logSections.map((item) => (
          <button key={item.id} type="button" className={item.id === section ? 'active' : ''} onClick={() => { setSection(item.id); setFile(item.id === 'WebUI' ? 'webui' : item.id === 'Errors' ? 'errors' : item.id === 'Gateway' ? 'gateway' : 'agent'); }}>{item.label}</button>
        ))}
      </div>
      <div className="log-toolbar native-work-card">
        <select value={file} onChange={(event) => setFile(event.target.value)}>{['agent', 'webui', 'errors', 'gateway'].map((item) => <option key={item}>{item}</option>)}</select>
        <select value={tail} onChange={(event) => setTail(Number(event.target.value))}>{[100, 200, 500, 1000].map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <input value={severity} onChange={(event) => setSeverity(event.target.value)} placeholder={t('logs.filterPlaceholder')} aria-label={t('logs.severity')} />
        <label><input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />{t('logs.wrap')}</label>
        <label><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} />{t('logs.autoRefresh')}</label>
      </div>
      <ErrorLine error={logs.error} />
      <pre className={`log-viewer ${wrap ? 'wrap' : ''}`}>{lines.join('\n') || t('logs.noLinesLoaded')}</pre>
    </section>
  );
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
  const apps = useMemo<NormalizedAppstoreRecord[]>(() => arrayFrom(appsState.data, ['apps', 'items', 'packages']).map(normalizeAppstoreRecord), [appsState.data]);

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
    { label: 'Catalog', value: formatCompactNumber(apps.length)},
    { label: 'Installed', value: formatCompactNumber(installedApps.length)},
    { label: 'Updates', value: formatCompactNumber(updateCount)},
    { label: 'Sidebar apps', value: formatCompactNumber(sidebarAppApps.length)}
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
    await window.lastbrowser.sidekick.installAppstoreApp({ appId: idOf(app)});
    const sidebarPanel = sidebarAppPanelForApp(app);
    if (sidebarPanel) onInstalledSidebarApp(sidebarPanel);
    await refreshAll();
  }

  async function uninstall(app: AnyRecord): Promise<void> {
    await window.lastbrowser.sidekick.uninstallAppstoreApp({ appId: idOf(app)});
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
                    { label: 'SDK entries', value: formatCompactNumber(arrayFrom(sdk.data, ['items', 'entries', 'tools']).length || Object.keys(sdk.data || {}).length)},
                    { label: 'Installed apps', value: formatCompactNumber(installedApps.length)},
                    { label: 'Updates available', value: formatCompactNumber(updateCount)}
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
                      <input type="number" value={String(value)} onChange={(event) => setSettingsDraft((current) => ({ ...current, [key]: event.target.value === '' ? 0 : Number(event.target.value)}))} />
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

export function DoctorDashboard({ onReopenSetup }: { onReopenSetup?: () => void }): JSX.Element {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doctorRunInProgress = useRef(false);

  const runDoctor = async (fix = false) => {
    await runDoctorExclusively(doctorRunInProgress, async () => {
      if (fix) setFixing(true);
      else setLoading(true);
      setError(null);
      try {
        if (!window.lastbrowser?.doctor?.run) {
          throw new Error('Doctor API is not available in desktop shell.');
        }
        const res = await window.lastbrowser.doctor.run({ fix });
        setReport(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        setFixing(false);
      }
    });
  };

  useEffect(() => {
    void runDoctor(false);
  }, []);

  const handleCopyRaw = async () => {
    if (!report?.rawOutput) return;
    setError(null);
    try {
      const didCopy = await copyDoctorOutput(report.rawOutput, navigator.clipboard);
      if (!didCopy) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setCopied(false);
      setError(`Bericht konnte nicht in die Zwischenablage kopiert werden: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // sidekick doctor uses exit 1 for warnings and 2 for failures. Treating all
  // non-zero codes as failures made optional integrations appear critical.
  const hasFailures = (report?.summary?.failures ?? 0) > 0 || Boolean(report && report.exitCode !== 0 && report.exitCode !== 1);
  const hasWarnings = (report?.summary?.warnings ?? 0) > 0 || report?.exitCode === 1;

  return (
    <SettingsCard
      title="System-Diagnose (sidekick doctor)"
      description="Ganzheitliche Diagnose der Python-Laufzeitumgebung, KI-Inferenz-Provider, Toolchains, Datenbanken und Konfigurationen."
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '6px', padding: '2px' }}>
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              style={{
                border: 'none',
                background: viewMode === 'visual' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: viewMode === 'visual' ? '#38bdf8' : 'rgba(232, 242, 255, 0.6)',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Visual
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              style={{
                border: 'none',
                background: viewMode === 'raw' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: viewMode === 'raw' ? '#38bdf8' : 'rgba(232, 242, 255, 0.6)',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Terminal size={12} />
              Raw Log
            </button>
          </div>
          <button
            type="button"
            className="secondary-action compact"
            onClick={() => void runDoctor(false)}
            disabled={loading || fixing}
            title="Diagnose neu ausführen"
          >
            {loading ? <Loader2 size={14} className="spin" /> : <Stethoscope size={14} />}
            <span>{loading ? 'Prüfe…' : 'Diagnose'}</span>
          </button>
          <button
            type="button"
            className="secondary-action compact"
            onClick={() => void runDoctor(true)}
            disabled={loading || fixing}
            title="sidekick doctor --fix ausführen"
          >
            {fixing ? <Loader2 size={14} className="spin" /> : <Wrench size={14} />}
            <span>{fixing ? 'Repariere…' : 'Auto-Fix'}</span>
          </button>
        </div>
      }
    >
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '10px 14px', color: '#f87171', fontSize: '13px', marginBottom: '14px' }}>
          {error}
        </div>
      )}

      {loading && !report && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px', color: 'rgba(232, 242, 255, 0.6)', gap: '10px' }}>
          <Loader2 size={18} className="spin" />
          <span>Führe System-Diagnose aus (`sidekick doctor`)…</span>
        </div>
      )}

      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Summary Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderRadius: '8px',
            background: hasFailures
              ? 'rgba(239, 68, 68, 0.08)'
              : hasWarnings
              ? 'rgba(245, 158, 11, 0.08)'
              : 'rgba(34, 197, 94, 0.08)',
            border: `1px solid ${
              hasFailures
                ? 'rgba(239, 68, 68, 0.3)'
                : hasWarnings
                ? 'rgba(245, 158, 11, 0.3)'
                : 'rgba(34, 197, 94, 0.3)'
            }`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {hasFailures ? (
                <XCircle size={20} style={{ color: '#ef4444' }} />
              ) : hasWarnings ? (
                <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
              ) : (
                <CheckCircle2 size={20} style={{ color: '#22c55e' }} />
              )}
              <div>
                <strong style={{
                  color: hasFailures ? '#f87171' : hasWarnings ? '#fbbf24' : '#4ade80',
                  fontSize: '13px',
                  display: 'block'
                }}>
                  {hasFailures
                    ? 'Fehler erkannt'
                    : hasWarnings
                    ? 'Warnungen oder optionale Komponenten – keine blockierenden Fehler'
                    : 'System bereit – Alle Kernprüfungen bestanden'}
                </strong>
                <span style={{ fontSize: '11px', color: 'rgba(232, 242, 255, 0.5)' }}>
                  Letzter Durchlauf: {new Date(report.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#4ade80',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '3px 9px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 600
              }}>
                ✓ {report.summary.passed} Passed
              </span>
              <span style={{
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '3px 9px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 600
              }}>
                ⚠ {report.summary.warnings} Warnings
              </span>
              <span style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '3px 9px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 600
              }}>
                ✗ {report.summary.failures} Errors
              </span>
            </div>
          </div>

          {/* Issues Box */}
          {report.issues.length > 0 && (
            <div style={{
              background: hasFailures ? 'rgba(239, 68, 68, 0.06)' : 'rgba(245, 158, 11, 0.06)',
              border: `1px solid ${hasFailures ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ color: hasFailures ? '#f87171' : '#fbbf24', fontSize: '13px' }}>
                  {hasFailures ? 'Erforderliche Maßnahmen' : 'Empfohlene Maßnahmen'} ({report.issues.length}):
                </strong>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="secondary-action compact"
                    onClick={() => void runDoctor(true)}
                    disabled={fixing || loading}
                    style={{ fontSize: '11px' }}
                  >
                    <Wrench size={12} />
                    <span>Auto-Fix ausführen</span>
                  </button>
                  {onReopenSetup && (
                    <button
                      type="button"
                      className="secondary-action compact"
                      onClick={onReopenSetup}
                      style={{ fontSize: '11px' }}
                    >
                      <Sparkles size={12} />
                      <span>Setup-Assistent</span>
                    </button>
                  )}
                </div>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {report.issues.map((issue, idx) => (
                  <li key={idx} style={{ color: hasFailures ? '#fecaca' : 'rgba(232, 242, 255, 0.85)', fontSize: '12px' }}>
                    <code>{issue}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mode Switch Content */}
          {viewMode === 'visual' ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '12px'
            }}>
              {report.categories.map((category) => {
                const isCatWarn = category.status === 'warn';
                return (
                  <div
                    key={category.name}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${
                        category.status === 'fail'
                          ? 'rgba(239, 68, 68, 0.25)'
                          : isCatWarn
                          ? 'rgba(245, 158, 11, 0.25)'
                          : 'rgba(255, 255, 255, 0.08)'
                      }`,
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '6px' }}>
                      <strong style={{ fontSize: '12px', color: '#e8f2ff' }}>
                        {category.name}
                      </strong>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: category.status === 'fail'
                          ? 'rgba(239, 68, 68, 0.2)'
                          : isCatWarn
                          ? 'rgba(245, 158, 11, 0.2)'
                          : 'rgba(34, 197, 94, 0.2)',
                        color: category.status === 'fail'
                          ? '#f87171'
                          : isCatWarn
                          ? '#fbbf24'
                          : '#4ade80'
                      }}>
                        {category.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {category.checks.map((check, checkIdx) => (
                        <div
                          key={checkIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '8px',
                            fontSize: '11px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                            {check.type === 'ok' && (
                              <CheckCircle2 size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                            )}
                            {check.type === 'warn' && (
                              <AlertTriangle size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                            )}
                            {check.type === 'fail' && (
                              <XCircle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
                            )}
                            {check.type === 'info' && (
                              <Info size={13} style={{ color: '#38bdf8', flexShrink: 0 }} />
                            )}
                            <span style={{
                              color: check.type === 'fail' ? '#f87171' : 'rgba(232, 242, 255, 0.9)',
                              wordBreak: 'break-word'
                            }}>
                              {check.text}
                            </span>
                          </div>

                          {check.detail && (
                            <span style={{
                              fontSize: '10px',
                              color: check.type === 'fail'
                                ? '#fca5a5'
                                : check.type === 'warn'
                                ? '#fde68a'
                                : 'rgba(232, 242, 255, 0.45)',
                              background: 'rgba(255, 255, 255, 0.04)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              whiteSpace: 'normal',
                              overflowWrap: 'anywhere',
                              textAlign: 'right',
                              flexShrink: 1,
                              maxWidth: '55%'
                            }}>
                              {check.detail}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              background: 'rgba(8, 12, 20, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '14px',
              position: 'relative'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '8px'
              }}>
                <button
                  type="button"
                  className="secondary-action compact"
                  onClick={handleCopyRaw}
                  style={{ fontSize: '11px' }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copied ? 'Kopiert!' : 'Log kopieren'}</span>
                </button>
              </div>
              <pre style={{
                margin: 0,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                fontSize: '11px',
                lineHeight: 1.45,
                color: '#e2e8f0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '450px',
                overflowY: 'auto'
              }}>
                {report.rawOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  );
}

export function ExtensionsSettingsSection(): JSX.Element {
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [presets, setPresets] = useState<ExtensionPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [cwsInput, setCwsInput] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      if (window.lastbrowser?.extensions) {
        const [extList, presetList] = await Promise.all([
          window.lastbrowser.extensions.list(),
          window.lastbrowser.extensions.presets()
        ]);
        setExtensions(extList);
        setPresets(presetList);
      }
    } catch (err) {
      console.error('Failed to load extensions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleInstallPreset = async (preset: ExtensionPreset) => {
    setInstallingId(preset.id);
    try {
      await window.lastbrowser.extensions.installCws(preset.cwsId);
      showToast(`${preset.name} installed successfully!`);
      await loadData();
    } catch (err) {
      showToast(`Failed to install ${preset.name}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleInstallCws = async (e: FormEvent) => {
    e.preventDefault();
    if (!cwsInput.trim()) return;
    setInstallingId('custom-cws');
    try {
      const rec = await window.lastbrowser.extensions.installCws(cwsInput.trim());
      showToast(`${rec.name} installed from Web Store!`);
      setCwsInput('');
      await loadData();
    } catch (err) {
      showToast(`Installation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleInstallUnpacked = async () => {
    try {
      const dir = await window.lastbrowser.extensions.chooseDir();
      if (!dir) return;
      setInstallingId('unpacked');
      const rec = await window.lastbrowser.extensions.installUnpacked(dir);
      showToast(`Loaded unpacked extension: ${rec.name}`);
      await loadData();
    } catch (err) {
      showToast(`Failed to load extension: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleToggle = async (ext: ExtensionRecord) => {
    try {
      await window.lastbrowser.extensions.toggle({ id: ext.id, enabled: !ext.enabled });
      await loadData();
    } catch (err) {
      showToast(`Toggle failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleToggleIncognito = async (ext: ExtensionRecord) => {
    try {
      await window.lastbrowser.extensions.toggleIncognito({ id: ext.id, allow: !ext.allowInIncognito });
      await loadData();
    } catch (err) {
      showToast(`Failed to update incognito setting: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRemove = async (ext: ExtensionRecord) => {
    if (!window.confirm(`Remove extension "${ext.name}"?`)) return;
    try {
      await window.lastbrowser.extensions.remove(ext.id);
      showToast(`Extension "${ext.name}" removed.`);
      await loadData();
    } catch (err) {
      showToast(`Failed to remove extension: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const installedCwsIds = new Set(extensions.map((e) => e.id.toLowerCase()));

  return (
    <div className="extensions-settings-content">
      {/* Curated Store Presets */}
      <SettingsCard
        title="Curated Extension Store"
        description="Top open-source and privacy extensions verified for Manifest V3 and Lastbrowser."
      >
        <div className="extension-store-grid">
          {presets.map((preset) => {
            const isInstalled = installedCwsIds.has(preset.cwsId.toLowerCase());
            const isBusy = installingId === preset.id;
            return (
              <div key={preset.id} className="extension-store-card">
                <div className="extension-store-card-header">
                  <span className="extension-store-icon">{preset.icon}</span>
                  <div className="extension-store-info">
                    <div className="extension-store-title-row">
                      <strong>{preset.name}</strong>
                      {preset.badge && <span className="extension-badge">{preset.badge}</span>}
                    </div>
                    <small className="extension-store-author">by {preset.author} · {preset.category}</small>
                  </div>
                </div>
                <p className="extension-store-desc">{preset.description}</p>
                <div className="extension-store-actions">
                  {preset.homepageUrl && (
                    <a
                      href={preset.homepageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="extension-link-btn"
                      title="Visit homepage"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <button
                    type="button"
                    className={`secondary-action compact ${isInstalled ? 'installed' : 'primary-accent'}`}
                    disabled={isInstalled || isBusy}
                    onClick={() => void handleInstallPreset(preset)}
                  >
                    {isBusy ? (
                      <Loader2 size={13} className="spin" />
                    ) : isInstalled ? (
                      <>
                        <Check size={13} />
                        <span>Installed</span>
                      </>
                    ) : (
                      <>
                        <Download size={13} />
                        <span>Add to Lastbrowser</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsCard>

      {/* Developer & Direct Install */}
      <SettingsCard
        title="Install from Chrome Web Store or Local Disk"
        description="Paste any Chrome Web Store link or load an unpacked extension directory."
      >
        <div className="extension-install-bar">
          <form className="extension-cws-form" onSubmit={(e) => void handleInstallCws(e)}>
            <input
              type="text"
              placeholder="Paste Chrome Web Store URL or 32-character Extension ID…"
              value={cwsInput}
              onChange={(e) => setCwsInput(e.target.value)}
              className="extension-cws-input"
            />
            <button
              type="submit"
              className="primary-action compact"
              disabled={!cwsInput.trim() || installingId === 'custom-cws'}
            >
              {installingId === 'custom-cws' ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
              <span>Install</span>
            </button>
          </form>
          <div className="extension-install-divider">or</div>
          <button
            type="button"
            className="secondary-action compact extension-unpacked-btn"
            onClick={() => void handleInstallUnpacked()}
            disabled={installingId === 'unpacked'}
          >
            {installingId === 'unpacked' ? <Loader2 size={13} className="spin" /> : <FolderOpen size={14} />}
            <span>Load unpacked extension…</span>
          </button>
        </div>
      </SettingsCard>

      {/* Installed Extensions List */}
      <SettingsCard
        title={`Installed Extensions (${extensions.length})`}
        description="Manage active extensions, permissions, and incognito window access."
        action={
          <button
            type="button"
            className="secondary-action compact"
            onClick={() => void loadData()}
            title="Refresh extensions list"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
        }
      >
        {loading ? (
          <EmptyState icon={<Loader2 size={16} className="spin" />} label="Loading extensions…" />
        ) : extensions.length === 0 ? (
          <div className="extension-empty-list">
            <Puzzle size={28} className="extension-empty-icon" />
            <p>No extensions installed yet.</p>
            <small>Choose an extension from the curated store above or load your own unpacked folder.</small>
          </div>
        ) : (
          <div className="extension-installed-list">
            {extensions.map((ext) => (
              <div key={ext.id} className={`extension-installed-card ${ext.enabled ? 'is-enabled' : 'is-disabled'}`}>
                <div className="extension-card-main">
                  <div className="extension-card-icon-wrap">
                    {ext.iconDataUrl ? (
                      <img src={ext.iconDataUrl} alt="" className="extension-custom-icon" />
                    ) : (
                      <Puzzle size={22} className="extension-fallback-icon" />
                    )}
                  </div>
                  <div className="extension-card-details">
                    <div className="extension-card-title-row">
                      <strong className="extension-card-name">{ext.name}</strong>
                      <span className="extension-version-pill">v{ext.version}</span>
                      <span className="extension-mv-pill">MV{ext.manifestVersion}</span>
                      {ext.source === 'unpacked' && <span className="extension-source-pill">unpacked</span>}
                    </div>
                    {ext.description && <p className="extension-card-desc">{ext.description}</p>}
                    {ext.permissions && ext.permissions.length > 0 && (
                      <div className="extension-permissions-row">
                        <small>Permissions:</small>
                        {ext.permissions.slice(0, 5).map((perm) => (
                          <span key={perm} className="extension-perm-tag">{perm}</span>
                        ))}
                        {ext.permissions.length > 5 && (
                          <span className="extension-perm-tag">+{ext.permissions.length - 5} more</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="extension-card-actions">
                  <label className="extension-incognito-label" title="Allow this extension in private/incognito tabs">
                    <input
                      type="checkbox"
                      checked={ext.allowInIncognito}
                      onChange={() => void handleToggleIncognito(ext)}
                    />
                    <span>Allow in Private</span>
                  </label>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={ext.enabled}
                    className={`extension-toggle-switch ${ext.enabled ? 'active' : ''}`}
                    onClick={() => void handleToggle(ext)}
                    title={ext.enabled ? 'Disable extension' : 'Enable extension'}
                  >
                    <span className="toggle-thumb" />
                  </button>

                  <button
                    type="button"
                    className="extension-delete-btn"
                    onClick={() => void handleRemove(ext)}
                    title={`Remove ${ext.name}`}
                    aria-label={`Remove ${ext.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}

/**
 * Vision-Impaired Mode 2.0 settings card (docs/visionimpaired.md §11 Phase 1).
 * Every control subscribes live to the store (no getState() bindings — the
 * phase13 contract test forbids them for a11y* fields).
 */
function VisionImpairedSettingsCard(): JSX.Element {
  const { t } = useDesktopI18n();
  const vi = usePanelStore((s) => s.visionImpaired);
  const setVisionImpaired = usePanelStore((s) => s.setVisionImpaired);

  return (
    <SettingsCard
      title={t('settings.panels.appearance.viModeTitle')}
      description={t('settings.panels.appearance.viModeDescription')}
      action={
        <button
          type="button"
          className="secondary-action compact"
          onClick={() => setVisionImpaired({ ...DEFAULT_VISION_IMPAIRED_CONFIG })}
        >
          {t('settings.panels.appearance.viReset')}
        </button>
      }
    >
      <div className="settings-field-grid">
        <SettingsToggle
          label={t('settings.panels.appearance.viEnable')}
          description={t('settings.panels.appearance.viEnableDescription')}
          checked={vi.enabled}
          onChange={(val) => setVisionImpaired({ enabled: val })}
        />
        <SettingsField label={t('settings.panels.appearance.viFont')} description={t('settings.panels.appearance.viFontDescription')}>
          <select
            value={vi.fontFamily}
            onChange={(e) => setVisionImpaired({ fontFamily: e.target.value as typeof vi.fontFamily })}
            aria-label={t('settings.panels.appearance.viFont')}
          >
            <option value="system">{t('settings.panels.appearance.viFontSystem')}</option>
            <option value="atkinson">{t('settings.panels.appearance.viFontAtkinson')}</option>
            <option value="lexend">{t('settings.panels.appearance.viFontLexend')}</option>
            <option value="opendyslexic">{t('settings.panels.appearance.viFontOpenDyslexic')}</option>
          </select>
        </SettingsField>
        <SettingsToggle
          label={t('settings.panels.appearance.viEnhancedSpacing')}
          description={t('settings.panels.appearance.viEnhancedSpacingDescription')}
          checked={vi.enhancedSpacing}
          onChange={(val) => setVisionImpaired({ enhancedSpacing: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viBoldWeight')}
          description={t('settings.panels.appearance.viBoldWeightDescription')}
          checked={vi.boldWeight}
          onChange={(val) => setVisionImpaired({ boldWeight: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viNoEllipsis')}
          description={t('settings.panels.appearance.viNoEllipsisDescription')}
          checked={vi.noEllipsisWrap}
          onChange={(val) => setVisionImpaired({ noEllipsisWrap: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viBionicReading')}
          description={t('settings.panels.appearance.viBionicReadingDescription')}
          checked={vi.bionicReading}
          onChange={(val) => setVisionImpaired({ bionicReading: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viSmartInvert')}
          description={t('settings.panels.appearance.viSmartInvertDescription')}
          checked={vi.smartInvertWebview}
          onChange={(val) => setVisionImpaired({ smartInvertWebview: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viAntiHalation')}
          description={t('settings.panels.appearance.viAntiHalationDescription')}
          checked={vi.antiHalation}
          onChange={(val) => setVisionImpaired({ antiHalation: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viSoftContrast')}
          description={t('settings.panels.appearance.viSoftContrastDescription')}
          checked={vi.softContrastText}
          onChange={(val) => setVisionImpaired({ softContrastText: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viReduceMotion')}
          description={t('settings.panels.appearance.viReduceMotionDescription')}
          checked={vi.reduceMotionStrict}
          onChange={(val) => setVisionImpaired({ reduceMotionStrict: val })}
        />
        <SettingsField label={t('settings.panels.appearance.viMinTarget')} description={t('settings.panels.appearance.viMinTargetDescription')}>
          <select
            value={String(vi.minClickTargetSize)}
            onChange={(e) => setVisionImpaired({ minClickTargetSize: Number(e.target.value) as 48 | 56 | 64 })}
            aria-label={t('settings.panels.appearance.viMinTarget')}
          >
            <option value="48">48px</option>
            <option value="56">56px</option>
            <option value="64">64px</option>
          </select>
        </SettingsField>
        <SettingsField label={t('settings.panels.appearance.viPalette')}>
          <select
            value={vi.palette}
            onChange={(e) => setVisionImpaired({ palette: e.target.value as typeof vi.palette })}
            aria-label={t('settings.panels.appearance.viPalette')}
          >
            <option value="ambra-matte">{t('settings.panels.appearance.viPaletteAmbra')}</option>
            <option value="onyx-cyan">{t('settings.panels.appearance.viPaletteOnyx')}</option>
            <option value="ivory-navy">{t('settings.panels.appearance.viPaletteIvory')}</option>
            <option value="monochrom-high">{t('settings.panels.appearance.viPaletteMonochrom')}</option>
          </select>
        </SettingsField>
        <SettingsField label={t('settings.panels.appearance.viCvdFilter')}>
          <select
            value={vi.colorVisionFilter}
            onChange={(e) => setVisionImpaired({ colorVisionFilter: e.target.value as typeof vi.colorVisionFilter })}
            aria-label={t('settings.panels.appearance.viCvdFilter')}
          >
            <option value="none">{t('settings.panels.appearance.viCvdNone')}</option>
            <option value="protanopia">{t('settings.panels.appearance.viCvdProtanopia')}</option>
            <option value="deuteranopia">{t('settings.panels.appearance.viCvdDeuteranopia')}</option>
            <option value="tritanopia">{t('settings.panels.appearance.viCvdTritanopia')}</option>
            <option value="achromatopsia">{t('settings.panels.appearance.viCvdAchromatopsia')}</option>
          </select>
        </SettingsField>
        <SettingsField label={t('settings.panels.appearance.viCursorSize')}>
          <select
            value={vi.cursorSize}
            onChange={(e) => setVisionImpaired({ cursorSize: e.target.value as typeof vi.cursorSize })}
            aria-label={t('settings.panels.appearance.viCursorSize')}
          >
            <option value="normal">{t('settings.panels.appearance.viCursorNormal')}</option>
            <option value="large">{t('settings.panels.appearance.viCursorLarge')}</option>
            <option value="huge">{t('settings.panels.appearance.viCursorHuge')}</option>
            <option value="mega">{t('settings.panels.appearance.viCursorMega')}</option>
          </select>
        </SettingsField>
        <SettingsToggle
          label={t('settings.panels.appearance.viShakeToLocate')}
          description={t('settings.panels.appearance.viShakeToLocateDescription')}
          checked={vi.shakeToLocate}
          onChange={(val) => setVisionImpaired({ shakeToLocate: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viLoupe')}
          description={t('settings.panels.appearance.viLoupeDescription')}
          checked={vi.cursorLoupeEnabled}
          onChange={(val) => setVisionImpaired({ cursorLoupeEnabled: val })}
        />
        <SettingsField label={t('settings.panels.appearance.viLoupePosition')}>
          <select
            value={vi.cursorLoupePosition}
            onChange={(e) => setVisionImpaired({ cursorLoupePosition: e.target.value as typeof vi.cursorLoupePosition })}
            aria-label={t('settings.panels.appearance.viLoupePosition')}
          >
            <option value="top">{t('settings.panels.appearance.viLoupePosTop')}</option>
            <option value="bottom">{t('settings.panels.appearance.viLoupePosBottom')}</option>
            <option value="left">{t('settings.panels.appearance.viLoupePosLeft')}</option>
            <option value="right">{t('settings.panels.appearance.viLoupePosRight')}</option>
          </select>
        </SettingsField>
        <SettingsField label={t('settings.panels.appearance.viLoupeSize')}>
          <select
            value={String(vi.cursorLoupeSize)}
            onChange={(e) => setVisionImpaired({ cursorLoupeSize: Number(e.target.value) as 120 | 180 | 240 })}
            aria-label={t('settings.panels.appearance.viLoupeSize')}
          >
            <option value="120">120px</option>
            <option value="180">180px</option>
            <option value="240">240px</option>
          </select>
        </SettingsField>
        <SettingsField label={t('settings.panels.appearance.viLoupeFactor')}>
          <select
            value={String(vi.cursorLoupeFactor)}
            onChange={(e) => setVisionImpaired({ cursorLoupeFactor: Number(e.target.value) as 1.5 | 2.0 | 3.0 | 4.0 })}
            aria-label={t('settings.panels.appearance.viLoupeFactor')}
          >
            <option value="1.5">1.5×</option>
            <option value="2">2.0×</option>
            <option value="3">3.0×</option>
            <option value="4">4.0×</option>
          </select>
        </SettingsField>
        <SettingsToggle
          label={t('settings.panels.appearance.viSuperTabs')}
          description={t('settings.panels.appearance.viSuperTabsDescription')}
          checked={vi.superSizedVerticalTabs}
          onChange={(val) => setVisionImpaired({ superSizedVerticalTabs: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viEnlargedTopBar')}
          description={t('settings.panels.appearance.viEnlargedTopBarDescription')}
          checked={vi.enlargedTopBar}
          onChange={(val) => setVisionImpaired({ enlargedTopBar: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viSplitMagnifier')}
          description={t('settings.panels.appearance.viSplitMagnifierDescription')}
          checked={vi.splitScreenMagnifier}
          onChange={(val) => setVisionImpaired({ splitScreenMagnifier: val })}
        />
        <SettingsToggle
          label={t('settings.panels.appearance.viAudioChime')}
          description={t('settings.panels.appearance.viAudioChimeDescription')}
          checked={vi.copilotAudioChime}
          onChange={(val) => setVisionImpaired({ copilotAudioChime: val })}
        />
      </div>
      <AccessibilityTestCard />
    </SettingsCard>
  );
}

export function normalizeSettingsSectionId(value: string): SettingsSectionId | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'extensions') return 'plugins';
  return (Object.keys(SETTINGS_SECTIONS) as SettingsSectionId[]).find((key) => key === normalized) ?? null;
}

export function mergeAppearanceSettings(
  apiPayload: unknown,
  desktopSettings: unknown
): AnyRecord {
  const apiSettings = isRecord(apiPayload)
    ? (isRecord(apiPayload.settings) ? apiPayload.settings : apiPayload)
    : {};
  return {
    ...apiSettings,
    ...(isRecord(desktopSettings) ? desktopSettings : {})
  };
}

/**
 * Serialize settings writes and coalesce queued snapshots. Writes contain the
 * complete settings object, so once an in-flight write finishes only the
 * latest pending snapshot is needed. This prevents a burst of appearance edits
 * from delaying the final selected theme behind stale intermediate payloads.
 */
export function createOrderedSettingsWriter<T>(write: (value: T) => Promise<unknown>): (value: T) => Promise<unknown> {
  type Waiter = { resolve: (result: unknown) => void; reject: (error: unknown) => void };
  type PendingWrite = { value: T; waiters: Waiter[] };
  let pending: PendingWrite | null = null;
  let writing = false;

  const drain = (): void => {
    if (writing || !pending) return;
    writing = true;
    const current = pending;
    pending = null;

    void Promise.resolve()
      .then(() => write(current.value))
      .then((result) => current.waiters.forEach(({ resolve }) => resolve(result)))
      .catch((error: unknown) => current.waiters.forEach(({ reject }) => reject(error)))
      .finally(() => {
        writing = false;
        drain();
      });
  };

  return (value: T) => new Promise<unknown>((resolve, reject) => {
    if (pending) {
      pending.value = value;
      pending.waiters.push({ resolve, reject });
    } else {
      pending = { value, waiters: [{ resolve, reject }] };
    }
    drain();
  });
}

/** Keep the newest full settings snapshot until Sidekick is healthy. */
export function createReadinessAwareSettingsWriter<T>(write: (value: T) => Promise<unknown>): {
  setReady: (ready: boolean) => Promise<void>;
  enqueue: (value: T) => Promise<boolean>;
} {
  let ready = false;
  let writing = false;
  let hasPending = false;
  let pending: T | undefined;

  const flush = async (): Promise<void> => {
    if (!ready || writing || !hasPending) return;
    writing = true;
    const value = pending as T;
    hasPending = false;
    try {
      await write(value);
    } catch (error) {
      if (!hasPending) {
        pending = value;
        hasPending = true;
      }
      throw error;
    } finally {
      writing = false;
    }
    if (hasPending) await flush();
  };

  return {
    async setReady(nextReady) {
      ready = nextReady;
      await flush();
    },
    async enqueue(value) {
      pending = value;
      hasPending = true;
      if (!ready) return false;
      await flush();
      return !hasPending;
    }
  };
}

export function NativeSettingsMain({ workspacePath = '', serviceStatus, activeContextItem, onboardingStatus, onReopenSetup, searchEngineId, onSearchEngineChange, desktopSettings, profiles, activeProfileId, onSelectProfile, onCreateProfile, onRenameProfile, onDeleteProfile }: { workspacePath?: string; serviceStatus: ServiceStatus | null; activeContextItem: string; onboardingStatus: OnboardingStatus | null; onReopenSetup: () => void; searchEngineId: string; onSearchEngineChange: (id: string) => void; desktopSettings?: AnyRecord | null; profiles: BrowserProfile[]; activeProfileId: string; onSelectProfile: (profileId: string) => void; onCreateProfile: (name: string) => void; onRenameProfile: (profileId: string, name: string) => void; onDeleteProfile: (profileId: string) => void }): JSX.Element {
  const { t, locale, setLocale } = useDesktopI18n();
  const ready = isReady(serviceStatus);
  const settingsState = useApiState(() => window.lastbrowser.sidekick.getSettings(), [ready], ready);
  const modelsState = useApiState(() => window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/models' }), [ready], ready);
  const authState = useApiState(() => window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/auth/status' }), [ready], ready);
  const pluginsState = useApiState(() => window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/plugins' }), [ready], ready);
  const updatesState = useApiState(() => window.lastbrowser.updates.status(), [], true);
  const [section, setSection] = useState<SettingsSectionId>('conversation');
  const [draft, setDraft] = useState<AnyRecord>({});
  const draftRef = useRef<AnyRecord>({});
  const [passwordDraft, setPasswordDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ollamaModalProviderId, setOllamaModalProviderId] = useState<string | null>(null);
  const [ollamaModalLabel, setOllamaModalLabel] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaKey, setOllamaKey] = useState('');
  const [ollamaTestResult, setOllamaTestResult] = useState('');
  const [openRouterModalOpen, setOpenRouterModalOpen] = useState(false);
  const [openRouterConfigProvider, setOpenRouterConfigProvider] = useState<'openrouter' | 'alibaba'>('openrouter');
  const [alibabaBaseUrl, setAlibabaBaseUrl] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [openRouterHasSavedKey, setOpenRouterHasSavedKey] = useState(false);
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModelOption[]>([]);
  const [openRouterSelectedModels, setOpenRouterSelectedModels] = useState<string[]>([]);
  const [openRouterHasSavedSelection, setOpenRouterHasSavedSelection] = useState(false);
  const [openRouterDefaultModel, setOpenRouterDefaultModel] = useState('');
  const [openRouterLoading, setOpenRouterLoading] = useState(false);
  const [openRouterSaving, setOpenRouterSaving] = useState(false);
  const [openRouterError, setOpenRouterError] = useState('');
  const [codexConnect, setCodexConnect] = useState<{
    status: 'starting' | 'pending' | 'success' | 'error' | 'expired' | 'cancelled';
    flowId?: string;
    userCode?: string;
    message: string;
    pollIntervalSeconds?: number;
    expiresAt?: number;
  } | null>(null);


  const [zenExitMode, setZenExitModeState] = useState<ZenExitDefaultMode>(() => {
    try {
      const val = window.localStorage.getItem('lastbrowser.zenExitDefaultMode.v1') as ZenExitDefaultMode;
      if (val === 'slim' || val === 'expanded') return val;
    } catch {}
    return 'slim';
  });

  const [actionBarDock, setActionBarDockState] = useState<ActionBarDock>(() => {
    try {
      const val = window.localStorage.getItem('lastbrowser.actionBarDock.v1') as ActionBarDock;
      if (val && ['top-left', 'top-center', 'top-right', 'bottom-center', 'free'].includes(val)) return val;
    } catch {}
    return 'top-left';
  });

  const themeAccent = usePanelStore((s) => s.themeAccent);
  const glassLevel = usePanelStore((s) => s.glassLevel);
  const uiDensity = usePanelStore((s) => s.uiDensity);
  const a11yHighContrast = usePanelStore((s) => s.a11yHighContrast);
  const a11yDyslexicFont = usePanelStore((s) => s.a11yDyslexicFont);
  const a11yMinFontSize = usePanelStore((s) => s.a11yMinFontSize);
  const a11yUiZoom = usePanelStore((s) => s.a11yUiZoom);
  const a11yFocusRings = usePanelStore((s) => s.a11yFocusRings);
  const dockSettings = usePanelStore((s) => s.dockSettings);
  const setDockSettings = usePanelStore((s) => s.setDockSettings);
  const applyDockPreset = usePanelStore((s) => s.applyDockPreset);
  const resetFloatingDockPos = usePanelStore((s) => s.resetFloatingDockPos);
  const sidebarMode = usePanelStore((s) => s.sidebarMode);

  const [defaultBrowserStatus, setDefaultBrowserStatus] = useState<boolean | null>(null);
  const [cdpPreference, setCdpPreference] = useState<{ enabled: boolean; active: boolean } | null>(null);
  const [cdpPreferenceSaving, setCdpPreferenceSaving] = useState(false);
  const [cdpRestartDismissed, setCdpRestartDismissed] = useState(false);
  const settingsWriterRef = useRef<((value: AnyRecord) => Promise<unknown>) | null>(null);
  if (!settingsWriterRef.current) {
    settingsWriterRef.current = createOrderedSettingsWriter((payload) =>
      window.lastbrowser.sidekick.saveSettings({ settings: payload })
    );
  }
  const readinessWriterRef = useRef<ReturnType<typeof createReadinessAwareSettingsWriter<AnyRecord>> | null>(null);
  if (!readinessWriterRef.current) {
    readinessWriterRef.current = createReadinessAwareSettingsWriter(async (payload) => {
      await settingsWriterRef.current?.(payload);
      window.dispatchEvent(new CustomEvent('lastbrowser:settings-changed', { detail: payload }));
      setDirty(false);
    });
  }

  useEffect(() => {
    void readinessWriterRef.current?.setReady(ready).catch((error: unknown) => {
      console.error('[SystemPanels] Deferred settings save error:', error);
      setDirty(true);
    });
  }, [ready]);

  useEffect(() => {
    let active = true;
    void window.lastbrowser?.cdp?.getPreference?.().then((value) => {
      if (active) setCdpPreference(value);
    }).catch(() => {
      if (active) setCdpPreference({ enabled: false, active: false });
    });
    return () => { active = false; };
  }, []);

  const setCdpEnabled = async (enabled: boolean) => {
    if (!window.lastbrowser?.cdp?.savePreference) return;
    setCdpPreferenceSaving(true);
    try {
      const result = await window.lastbrowser.cdp.savePreference({ enabled });
      if (!result.ok) throw new Error(result.error || 'Could not save browser automation preference');
      setCdpPreference({ enabled: result.enabled === true, active: result.active === true });
      setCdpRestartDismissed(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save browser automation preference');
    } finally {
      setCdpPreferenceSaving(false);
    }
  };

  useEffect(() => {
    let active = true;
    void window.lastbrowser?.system?.isDefaultBrowser?.().then((isDef) => {
      if (active) setDefaultBrowserStatus(isDef);
    });
    return () => { active = false; };
  }, []);

  const handleSetDefaultBrowser = async () => {
    try {
      await window.lastbrowser?.system?.setDefaultBrowser?.();
      showToast(t('settings.panels.preferences.defaultBrowserOpened'));
      setTimeout(async () => {
        const isDef = await window.lastbrowser?.system?.isDefaultBrowser?.();
        if (typeof isDef === 'boolean') setDefaultBrowserStatus(isDef);
      }, 1500);
    } catch {
      showToast(t('settings.panels.preferences.defaultBrowserError'));
    }
  };

  // The desktop event stream receives each successful auto-save before the
  // settings query is refreshed. Prefer that current snapshot over the query's
  // still-stale result so the draft hydration below cannot flash back to the
  // previous skin/theme immediately after a click.
  const settings = mergeAppearanceSettings(settingsState.data, desktopSettings);

  useEffect(() => {
    if (!desktopSettings || !settingsState.error) return;
    if (/auth|unauthorized/i.test(settingsState.error)) return;
    void settingsState.refresh();
  }, [desktopSettings, settingsState.error, settingsState.refresh]);

  const autoUpdateChecksEnabled = settingsBoolean(draft.check_for_updates ?? settings.check_for_updates, true);
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
  const providerOptions = useMemo(() => cloudProviderOptions(onboardingStatus), [onboardingStatus]);
  const fallbackState = useApiState(() => window.lastbrowser.sidekick.getFallbackModel(), [ready], ready);
  const fallbackModelConfig = isRecord(fallbackState.data?.fallback_model) ? fallbackState.data.fallback_model : {};
  const fallbackModel = settingsText(fallbackModelConfig.model, '');
  const refreshSettingsData = useCallback(async () => {
    await Promise.allSettled([
      settingsState.refresh(),
      modelsState.refresh(),
      authState.refresh(),
      pluginsState.refresh(),
      fallbackState.refresh()
    ]);
  }, [settingsState.refresh, modelsState.refresh, authState.refresh, pluginsState.refresh, fallbackState.refresh]);

  useEffect(() => {
    const match = normalizeSettingsSectionId(activeContextItem);
    if (match) setSection(match);
  }, [activeContextItem]);

  useEffect(() => {
    if (settingsState.loading) return;
    const hydratedDraft = cleanSettingsPayload(settings);
    draftRef.current = hydratedDraft;
    setDraft(hydratedDraft);
    setPasswordDraft('');
    setDirty(false);
  }, [settingsState.data, settingsState.loading, desktopSettings]);

  useEffect(() => {
    applyDesktopAppearancePreview(
      settingsText(draft.theme ?? settings.theme, 'dark'),
      settingsText(draft.skin ?? settings.skin, 'default'),
      settingsText(draft.font_size ?? settings.font_size, 'default'),
      settingsText(draft.message_layout ?? settings.message_layout, 'bubbles'),
      settingsText(draft.syntax_theme ?? settings.syntax_theme, ''),
      settingsText(draft.accent_color ?? settings.accent_color, '')
    );
  }, [
    draft.skin, draft.theme, draft.font_size, draft.message_layout, draft.syntax_theme, draft.accent_color,
    settings.skin, settings.theme, settings.font_size, settings.message_layout, settings.syntax_theme, settings.accent_color
  ]);

  const autoSaveTimerRef = useRef<number | null>(null);

  const persistSettings = useCallback(async (updatedDraft: AnyRecord) => {
    try {
      const payload = cleanSettingsPayload({
        ...settings,
        ...updatedDraft
      });
      payload.bot_name = settingsText(payload.bot_name, 'Nova').trim() || 'Nova';
      payload.language = settingsText(payload.language, 'en');
      payload.theme = settingsText(payload.theme, 'dark');
      payload.skin = settingsText(payload.skin, 'default');
      payload.accent_color = settingsText(payload.accent_color, '');
      payload.font_size = settingsText(payload.font_size, 'default');
      payload.default_zoom = Number(payload.default_zoom) || 100;
      payload.message_layout = settingsText(payload.message_layout, 'bubbles');
      payload.syntax_theme = settingsText(payload.syntax_theme, '');
      payload.sound_enabled = settingsBoolean(payload.sound_enabled, true);
      payload.notifications_enabled = settingsBoolean(payload.notifications_enabled, true);
      payload.show_token_usage = settingsBoolean(payload.show_token_usage, false);
      payload.show_tps = settingsBoolean(payload.show_tps, false);
      payload.simplified_tool_calling = settingsBoolean(payload.simplified_tool_calling, true);
      payload.show_thinking = settingsBoolean(payload.show_thinking, false);
      payload.show_cli_sessions = settingsBoolean(payload.show_cli_sessions, false);
      payload.sync_to_insights = settingsBoolean(payload.sync_to_insights, false);
      payload.check_for_updates = settingsBoolean(payload.check_for_updates, true);

      // Instant local storage fast-path for appearance
      try {
        if (payload.theme) window.localStorage.setItem('lastbrowser.theme', String(payload.theme));
        if (payload.skin) window.localStorage.setItem('lastbrowser.skin', String(payload.skin));
        if (payload.font_size) window.localStorage.setItem('lastbrowser.font_size', String(payload.font_size));
        if (payload.message_layout) window.localStorage.setItem('lastbrowser.message_layout', String(payload.message_layout));
      } catch {}

      const saved = await readinessWriterRef.current?.enqueue(payload);
      if (saved) setDirty(false);
      else setDirty(true);
    } catch (err) {
      console.error('[SystemPanels] Auto-save error:', err);
    }
  }, [settings, ready]);

  function updateDraftField(key: string, value: unknown, autoPersist = true): void {
    window.dispatchEvent(new Event('lastbrowser:settings-draft-changed'));
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraft(next);
    if (autoPersist) {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = window.setTimeout(() => {
        void persistSettings(next);
      }, 150);
    } else {
      setDirty(true);
    }
  }

  function updateDraftToggle(key: string, value: boolean, autoPersist = true): void {
    updateDraftField(key, value, autoPersist);
  }

  function restoreDraft(): void {
    const restoredDraft = cleanSettingsPayload(settings);
    draftRef.current = restoredDraft;
    setDraft(restoredDraft);
    setPasswordDraft('');
    setDirty(false);
  }

  async function save(): Promise<void> {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const payload = cleanSettingsPayload({
        ...settings,
        ...draftRef.current
      });
      payload.bot_name = settingsText(payload.bot_name, 'Nova').trim() || 'Nova';
      if (passwordDraft.trim()) {
        payload._set_password = passwordDraft.trim();
      }
      payload.language = settingsText(payload.language, 'en');
      payload.theme = settingsText(payload.theme, 'dark');
      payload.skin = settingsText(payload.skin, 'default');
      payload.accent_color = settingsText(payload.accent_color, '');
      payload.font_size = settingsText(payload.font_size, 'default');
      payload.default_zoom = Number(payload.default_zoom) || 100;
      payload.message_layout = settingsText(payload.message_layout, 'bubbles');
      payload.syntax_theme = settingsText(payload.syntax_theme, '');
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
      await settingsWriterRef.current?.(payload);
      const chosenModel = settingsText(payload.default_model, '').trim();
      if (chosenModel && chosenModel !== settingsText(settings.default_model, '').trim()) {
        await window.lastbrowser.sidekick.setDefaultModel({ model: chosenModel });
        await modelsState.refresh();
      }
      window.dispatchEvent(new CustomEvent('lastbrowser:settings-changed', { detail: payload }));
      setDirty(false);
      setPasswordDraft('');
      await refreshSettingsData();
    } catch (error) {
      showToast(`Settings save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function disableAuth(): Promise<void> {
    if (!ready || saving || !loggedIn) return;
    if (!window.confirm('Disable authentication for this instance?')) return;
    setSaving(true);
    try {
      const result = await window.lastbrowser.sidekick.saveSettings({ settings: { _clear_password: true } });
      if (result.auth_enabled !== false) {
        throw new Error(t('settings.panels.system.authDisableNotConfirmed'));
      }
      const confirmedAuth = await window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/auth/status' });
      if (confirmedAuth.auth_enabled !== false) {
        throw new Error(t('settings.panels.system.authDisableNotConfirmed'));
      }
      // Reflect the server-confirmed status immediately. The parallel settings
      // refresh is best-effort and can fail independently, which previously
      // left the button showing "Disable authentication" after a successful
      // password removal.
      authState.setData(confirmedAuth);
      window.dispatchEvent(new CustomEvent('lastbrowser:settings-changed', { detail: { _clear_password: true } }));
      setPasswordDraft('');
      await refreshSettingsData();
      showToast(t('settings.panels.system.authDisabled'));
    } catch (error) {
      showToast(`${t('settings.panels.system.disableAuthFailed')} ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function signOut(): Promise<void> {
    if (!ready) return;
    try {
      await window.lastbrowser.sidekick.requestWebui({ method: 'POST', path: '/api/auth/logout', body: {} });
      await authState.refresh();
      await window.lastbrowser.sidekick.lockAccessWindows();
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

  useEffect(() => {
    if (codexConnect?.status !== 'pending' || !codexConnect.flowId) return;
    let cancelled = false;
    let timer: number;
    let transientFailures = 0;
    const flowId = codexConnect.flowId;
    const expiresAt = codexConnect.expiresAt;
    const poll = async (): Promise<void> => {
      if (expiresAt && Date.now() >= expiresAt * 1000) {
        setCodexConnect((current) => current?.flowId === flowId
          ? { ...current, status: 'expired', message: t('settings.panels.providers.codexExpired') }
          : current);
        return;
      }
      try {
        const response = await window.lastbrowser.sidekick.pollOAuth(flowId);
        if (cancelled) return;
        if (response.status === 'success') {
          setCodexConnect((current) => current?.flowId === flowId
            ? { ...current, status: 'success', message: t('firstRun.oauthSuccess', { provider: 'ChatGPT Codex' }) }
            : current);
          await Promise.allSettled([modelsState.refresh(), settingsState.refresh()]);
          return;
        }
        if (response.status !== 'pending') {
          setCodexConnect((current) => current?.flowId === flowId
            ? { ...current, status: response.status === 'expired' || response.status === 'cancelled' ? response.status : 'error', message: response.error || t('settings.panels.providers.codexIncomplete') }
            : current);
          return;
        }
        transientFailures = 0;
        timer = window.setTimeout(() => void poll(), Math.max(1200, (codexConnect.pollIntervalSeconds || 5) * 1000));
      } catch (error) {
        if (cancelled) return;
        transientFailures += 1;
        setCodexConnect((current) => current?.flowId === flowId
          ? { ...current, message: t('settings.panels.providers.codexRetrying', { error: error instanceof Error ? error.message : String(error) }) }
          : current);
        timer = window.setTimeout(() => void poll(), Math.min(15000, 1000 * 2 ** Math.min(transientFailures, 4)));
      }
    };
    timer = window.setTimeout(() => void poll(), Math.max(1200, (codexConnect.pollIntervalSeconds || 5) * 1000));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [codexConnect?.status, codexConnect?.flowId, codexConnect?.pollIntervalSeconds, codexConnect?.expiresAt]);

  async function startProviderConnect(option: ProviderOption): Promise<void> {
    if (['google-gemini-cli', 'gemini-cli-acp'].includes(option.id)) {
      showToast('Gemini CLI subscription access for consumer accounts changed on June 18, 2026. See the Gemini subscription information panel.');
      return;
    }
    if (!option.oauthProvider) return;
    const isCodex = option.oauthProvider === 'openai-codex';
    let startedFlowId = '';
    if (isCodex) setCodexConnect({ status: 'starting', message: t('firstRun.startingLogin', { provider: 'ChatGPT Codex' }) });
    try {
      const response = await window.lastbrowser.sidekick.startOAuth({ provider: option.oauthProvider });
      startedFlowId = String(response.flow_id || '');
      if (response.error) throw new Error(String(response.error));
      const url = String(response.verification_uri || response.auth_url || '');
      if (response.status === 'success') {
        if (isCodex) setCodexConnect({ status: 'success', message: t('firstRun.oauthSuccess', { provider: 'ChatGPT Codex' }) });
        showToast(`${option.label} credentials found and connected.`);
        await modelsState.refresh();
        return;
      }
      if (!url) throw new Error('Sidekick returned no sign-in URL.');
      if (isCodex) {
        if (!response.flow_id) throw new Error('Sidekick returned no OAuth flow ID.');
        setCodexConnect({
          status: 'pending',
          flowId: response.flow_id,
          userCode: response.user_code,
          pollIntervalSeconds: response.poll_interval_seconds,
          expiresAt: response.expires_at,
          message: response.user_code
            ? t('firstRun.oauthPromptCode', { provider: 'ChatGPT Codex' })
            : t('firstRun.oauthPromptWindow', { provider: 'ChatGPT Codex' })
        });
      }
      const opened = await openProviderOAuthUrl(option.oauthProvider, url, {
        openExternal: window.lastbrowser.system?.openExternal,
        openConnectWindow: window.lastbrowser.auth?.openConnectWindow
      });
      if (!opened) throw new Error('Lastbrowser could not open the sign-in page.');
      showToast(t('firstRun.oauthPromptCode', { provider: option.label }));
    } catch (error) {
      if (isCodex && startedFlowId) {
        await window.lastbrowser.sidekick.cancelOAuth({ flowId: startedFlowId, provider: 'openai-codex' }).catch(() => null);
      }
      const message = `${t('settings.panels.providers.connectionError')}: ${error instanceof Error ? error.message : String(error)}`;
      if (isCodex) setCodexConnect({ status: 'error', message });
      showToast(message);
    }
  }

  async function cancelCodexConnect(): Promise<void> {
    const flowId = codexConnect?.flowId;
    setCodexConnect({ status: 'cancelled', message: t('settings.panels.providers.codexCancelled') });
    if (flowId) {
      await window.lastbrowser.sidekick.cancelOAuth({ flowId, provider: 'openai-codex' }).catch(() => null);
    }
  }

  async function loadOpenRouterModelCatalog(
    keyToSave = openRouterKey,
    existingKeyAvailable = openRouterHasSavedKey,
    savedSelection?: { ids: string[]; configured: boolean; defaultModel: string },
    providerId: 'openrouter' | 'alibaba' = openRouterConfigProvider,
    baseUrl = alibabaBaseUrl
  ): Promise<void> {
    setOpenRouterLoading(true);
    setOpenRouterError('');
    try {
      const nextKey = keyToSave.trim();
      const catalog = await requestProviderModelCatalog({
        providerId,
        apiKey: nextKey,
        hasSavedKey: existingKeyAvailable,
        baseUrl
      }, (request) => window.lastbrowser.sidekick.requestWebui(request));
      if (nextKey) {
        setOpenRouterKey('');
        setOpenRouterHasSavedKey(true);
      }
      const models = normalizeOpenRouterModels(catalog);
      if (!models.length) {
        setOpenRouterModels([]);
        throw new Error(t(providerId === 'alibaba' ? 'settings.panels.providers.alibabaNoModels' : 'settings.panels.providers.openrouterNoModels'));
      }
      setOpenRouterModels(models);
      const priorSelection = savedSelection?.ids ?? openRouterSelectedModels;
      const hasSelection = savedSelection?.configured ?? openRouterHasSavedSelection;
      // A discovered catalog can contain paid models. Require an explicit
      // selection instead of enabling every paid route on the first scan.
      const nextSelection = priorSelection.length || hasSelection ? priorSelection : [];
      const preferredDefault = savedSelection?.defaultModel || openRouterDefaultModel;
      const availableDefault = nextSelection.find((id) => models.some((model) => model.id === id)) || '';
      setOpenRouterSelectedModels(nextSelection);
      setOpenRouterDefaultModel(
        preferredDefault && nextSelection.includes(preferredDefault) && models.some((model) => model.id === preferredDefault)
          ? preferredDefault
          : availableDefault || nextSelection[0] || ''
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      const message = code === 'alibaba-base-url-required'
        ? t('settings.panels.providers.alibabaBaseUrlRequired')
        : code === 'alibaba-https-required'
          ? t('settings.panels.providers.alibabaHttpsRequired')
          : code === 'provider-key-required'
            ? t(providerId === 'alibaba' ? 'settings.panels.providers.alibabaKeyRequired' : 'settings.panels.providers.openrouterKeyRequired')
            : code;
      setOpenRouterError(message);
    } finally {
      setOpenRouterLoading(false);
    }
  }

  async function openOpenRouterSettings(providerId: 'openrouter' | 'alibaba' = 'openrouter'): Promise<void> {
    setOpenRouterConfigProvider(providerId);
    setOpenRouterKey('');
    setOpenRouterModels([]);
    setOpenRouterSelectedModels([]);
    setOpenRouterHasSavedSelection(false);
    setOpenRouterError('');
    setOpenRouterDefaultModel(settingsText(modelsState.data?.default_model || settings.default_model, ''));
    setOpenRouterModalOpen(true);
    try {
      const response = await window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/providers' });
      const entries = Array.isArray(response.providers) ? response.providers.filter(isRecord) : [];
      const provider = entries.find((entry) => settingsText(entry.id).toLowerCase() === providerId);
      const providerBaseUrl = settingsText(provider?.base_url, '');
      if (providerId === 'alibaba') setAlibabaBaseUrl(providerBaseUrl);
      const configuredModels = normalizeOpenRouterModels(provider?.models).map((model) => model.id);
      const hasConfiguredSelection = Boolean(provider?.models_configured) || configuredModels.length > 0;
      const hasKey = Boolean(provider?.has_key);
      const currentDefaultModel = settingsText(modelsState.data?.default_model || settings.default_model, '');
      setOpenRouterHasSavedKey(hasKey);
      setOpenRouterHasSavedSelection(hasConfiguredSelection);
      setOpenRouterSelectedModels(configuredModels);
      if (hasKey) {
        await loadOpenRouterModelCatalog('', true, {
          ids: configuredModels,
          configured: hasConfiguredSelection,
          defaultModel: currentDefaultModel
        }, providerId, providerId === 'alibaba' ? providerBaseUrl : alibabaBaseUrl);
      }
    } catch (error) {
      setOpenRouterError(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveOpenRouterSettings(): Promise<void> {
    if (openRouterSaving) return;
    const selectedModels = [...new Set(openRouterSelectedModels)];
    if (!selectedModels.length) {
      setOpenRouterError(t(openRouterConfigProvider === 'alibaba' ? 'settings.panels.providers.alibabaSelectAtLeastOne' : 'settings.panels.providers.openrouterSelectAtLeastOne'));
      return;
    }
    if (!openRouterHasSavedKey && !openRouterKey.trim()) {
      setOpenRouterError(t(openRouterConfigProvider === 'alibaba' ? 'settings.panels.providers.alibabaKeyRequired' : 'settings.panels.providers.openrouterKeyRequired'));
      return;
    }
    if (openRouterConfigProvider === 'alibaba') {
      try {
        if (new URL(alibabaBaseUrl.trim()).protocol !== 'https:') throw new Error();
      } catch {
        setOpenRouterError(t('settings.panels.providers.alibabaBaseUrlRequired'));
        return;
      }
    }
    setOpenRouterSaving(true);
    setOpenRouterError('');
    try {
      const selectedDefault = selectedModels.includes(openRouterDefaultModel)
        ? openRouterDefaultModel
        : selectedModels[0];
      const body: Record<string, unknown> = { provider: openRouterConfigProvider, models: selectedModels };
      if (openRouterKey.trim()) body.api_key = openRouterKey.trim();
      if (openRouterConfigProvider === 'alibaba') body.base_url = alibabaBaseUrl.trim();
      await window.lastbrowser.sidekick.requestWebui({ method: 'POST', path: '/api/providers', body });
      await window.lastbrowser.sidekick.saveSettings({
        settings: {
          ...cleanSettingsPayload(settings),
          provider: openRouterConfigProvider,
          base_url: openRouterConfigProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' : alibabaBaseUrl.trim(),
          default_model: selectedDefault
        }
      });
      await window.lastbrowser.sidekick.setDefaultModel({ model: selectedDefault });
      await settingsState.refresh();
      await modelsState.refresh();
      setOpenRouterModalOpen(false);
      showToast(t('settings.panels.providers.connectionSuccess'));
    } catch (error) {
      setOpenRouterError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpenRouterSaving(false);
    }
  }

  async function switchProvider(providerId: string): Promise<void> {
    setSaving(true);
    try {
      await window.lastbrowser.sidekick.saveSettings({
        settings: { ...cleanSettingsPayload(settings), provider: providerId }
      });
      await settingsState.refresh();
      await modelsState.refresh();
      showToast(`Active provider set to ${providerId}.`);
    } catch (error) {
      showToast(`Could not switch provider: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveFallbackModel(modelId: string): Promise<void> {
    setSaving(true);
    try {
      await window.lastbrowser.sidekick.setFallbackModel({ model: modelId });
      await fallbackState.refresh();
      showToast(modelId ? `Fallback model set to ${modelId}.` : 'Fallback model cleared.');
    } catch (error) {
      showToast(`Could not save fallback: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
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
      return <EmptyState icon={<Loader2 size={16} className="spin" />} label={t('settings.panels.plugins.loading')} />;
    }
    if (pluginsState.error) {
      return <div className="workspace-error">{pluginsState.error}</div>;
    }
    const plugins = pluginList;
    if (!plugins.length) {
      return <EmptyState icon={<Package size={16} />} label={t('settings.panels.plugins.empty')} />;
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
        title={t('settings.title')}
        kicker={t('settings.system')}
        detail={t('settings.detail')}
        loading={settingsState.loading}
        ready={ready}
        onRefresh={refreshSettingsData}
      />
      <ErrorLine error={settingsState.error || authState.error || pluginsState.error} />

      <div className="settings-native-grid">
        <nav className="settings-section-nav native-work-card">
          {sectionList.map(([key, meta]) => (
            <button key={key} type="button" className={key === section ? 'active settings-section-button' : 'settings-section-button'} onClick={() => setSection(key)}>
              <span className="settings-section-button-icon">{meta.icon}</span>
              <span className="settings-section-button-text">
                <strong>{t(SETTINGS_SECTION_COPY[key].title)}</strong>
                <small>{t(SETTINGS_SECTION_COPY[key].description)}</small>
              </span>
            </button>
          ))}
        </nav>

        <main className="native-work-card settings-editor settings-panel-scroll">
          <header className="settings-editor-head">
            <div>
              <strong>{t(SETTINGS_SECTION_COPY[section].title)}</strong>
              <span>{t(SETTINGS_SECTION_COPY[section].description)}</span>
            </div>
            <div className="settings-editor-actions">
              <span className={`native-rest-pill ${dirty ? '' : 'ready'}`}>
                <span className={`status-dot ${dirty ? '' : 'ready'}`} />
                {dirty ? t('settings.status.unsaved') : t('settings.status.saved')}
              </span>
              <button type="button" className="secondary-action compact" onClick={() => void restoreDraft()} disabled={!ready || !dirty}>
                <RefreshCw size={15} />
                <span>{t('settings.reset')}</span>
              </button>
              <button type="button" className="secondary-action compact" onClick={() => void save()} disabled={!ready || saving || !dirty}>
                {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                <span>{t('settings.save')}</span>
              </button>
            </div>
          </header>

          <div className="settings-panel-stack">
            {section === 'conversation' && (
              <>
                <SettingsCard
                  title={t('settings.panels.conversation.defaults')}
                  description={t('settings.panels.conversation.routingDescription')}
                  action={<span className="settings-badge">{t('settings.panels.conversation.providerBadge', { provider: activeProvider || '—' })}</span>}
                >
                  <div className="settings-field-grid">
                    <SettingsField label={t('settings.panels.conversation.defaultModel')} description={t('settings.panels.conversation.defaultModelDescription')}>
                      {renderModelOptions()}
                    </SettingsField>
                    <SettingsField label={t('settings.panels.conversation.sendKey')} description={t('settings.panels.conversation.sendKeyDescription')}>
                      <select value={settingsText(draft.send_key ?? settings.send_key, 'enter')} onChange={(event) => updateDraftField('send_key', event.target.value)}>
                        <option value="enter">{t('settings.panels.conversation.enterNewline')}</option>
                        <option value="ctrl+enter">{t('settings.panels.conversation.ctrlEnterNewline')}</option>
                      </select>
                    </SettingsField>
                    <SettingsField label={t('settings.panels.conversation.chatMode')} description={t('settings.panels.conversation.chatModeDescription')}>
                      <select value={settingsText(draft.chat_mode ?? settings.chat_mode, 'chat')} onChange={(event) => updateDraftField('chat_mode', event.target.value)}>
                        <option value="chat">{t('settings.panels.conversation.chat')}</option>
                        <option value="plan">{t('settings.panels.conversation.plan')}</option>
                        <option value="action">{t('settings.panels.conversation.action')}</option>
                      </select>
                    </SettingsField>
                    <SettingsField label={t('settings.panels.conversation.composerMode')} description={t('settings.panels.conversation.composerModeDescription')}>
                      <select value={settingsText(draft.composer_mode ?? settings.composer_mode, 'action')} onChange={(event) => updateDraftField('composer_mode', event.target.value)}>
                        <option value="action">{t('settings.panels.conversation.action')}</option>
                        <option value="plan">{t('settings.panels.conversation.plan')}</option>
                        <option value="chat">{t('settings.panels.conversation.chat')}</option>
                      </select>
                    </SettingsField>
                    <SettingsField label={t('settings.panels.conversation.profile')} description={t('settings.panels.conversation.profileDescription')}>
                      <input value={settingsText(draft.profile ?? settings.profile, '')} onChange={(event) => updateDraftField('profile', event.target.value)} placeholder={t('settings.panels.conversation.defaultPlaceholder')} />
                    </SettingsField>
                    <SettingsField label={t('settings.panels.conversation.assistantName')} description={t('settings.panels.conversation.assistantNameDescription')}>
                      <input value={settingsText(draft.bot_name ?? settings.bot_name, 'Nova')} onChange={(event) => updateDraftField('bot_name', event.target.value)} placeholder="Nova" />
                    </SettingsField>
                  </div>
                </SettingsCard>

                <SettingsCard
                  title={t('settings.panels.conversation.fallbackModel')}
                  description={t('settings.panels.conversation.fallbackDescription')}
                  action={fallbackModel ? <span className="settings-badge">{t('settings.panels.conversation.active')}</span> : <span className="settings-badge">{t('settings.panels.conversation.none')}</span>}
                >
                  <div className="settings-field-grid">
                    <SettingsField label={t('settings.panels.conversation.fallbackModel')} description={t('settings.panels.conversation.fallbackDisableDescription')}>
                      <select
                        value={fallbackModel}
                        onChange={(event) => void saveFallbackModel(event.target.value)}
                        disabled={!ready || saving}
                      >
                        <option value="">{t('settings.panels.conversation.none')}</option>
                        {modelGroups.map((group) => {
                          const providerLabel = settingsText(group.provider || group.provider_id || 'Provider');
                          const models = Array.isArray(group.models) ? group.models.filter(isRecord) : [];
                          return (
                            <optgroup key={`fb-${providerLabel}`} label={providerLabel}>
                              {models.map((model) => {
                                const id = settingsText(model.id || model.name || model.label);
                                return <option key={id} value={id}>{settingsText(model.label || model.name || model.id)}</option>;
                              })}
                            </optgroup>
                          );
                        })}
                      </select>
                    </SettingsField>
                  </div>
                  <p className="settings-hint">{t('settings.panels.conversation.fallbackHint')}</p>
                </SettingsCard>
              </>
            )}

            {section === 'appearance' && (
              <>
                <SettingsCard title={t('settings.panels.appearance.cardModern')} description={t('settings.panels.appearance.zenDescription')}>
                  <div className="settings-modern-layout-config">
                    {/* Zen Exit Default Mode */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>{t('settings.panels.appearance.zenTitle')}</strong>
                        <small>{t('settings.panels.appearance.zenDescription')}</small>
                      </div>
                      <div className="settings-segmented-group">
                        <button
                          type="button"
                          className={zenExitMode === 'slim' ? 'settings-seg-btn active' : 'settings-seg-btn'}
                          onClick={() => {
                            setZenExitModeState('slim');
                            usePanelStore.getState().setZenExitDefaultMode('slim');
                            if (sidebarMode !== 'hidden') {
                              usePanelStore.getState().setSidebarMode('slim');
                            }
                          }}
                        >
                          {t('settings.panels.appearance.compactDock')}
                        </button>
                        <button
                          type="button"
                          className={zenExitMode === 'expanded' ? 'settings-seg-btn active' : 'settings-seg-btn'}
                          onClick={() => {
                            setZenExitModeState('expanded');
                            usePanelStore.getState().setZenExitDefaultMode('expanded');
                            if (sidebarMode !== 'hidden') {
                              usePanelStore.getState().setSidebarMode('expanded');
                            }
                          }}
                        >
                          {t('settings.panels.appearance.fullSidebar')} (240px)
                        </button>
                      </div>
                    </div>

                    {/* Action Bar Docking Preference */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>{t('settings.panels.appearance.actionBarTitle')}</strong>
                        <small>{t('settings.panels.appearance.actionBarDescription')}</small>
                      </div>
                      <div className="settings-dock-buttons-row">
                        {[
                          { id: 'topbar', label: t('settings.panels.appearance.actionTopbar') },
                          { id: 'sidebar', label: t('settings.panels.appearance.actionSidebar') },
                          { id: 'bottom', label: t('settings.panels.appearance.actionBottom') },
                          { id: 'top-left', label: t('settings.panels.appearance.actionTopLeft') },
                          { id: 'top-right', label: t('settings.panels.appearance.actionTopRight') },
                          { id: 'free', label: t('settings.panels.appearance.actionFloating') }
                        ].map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            className={actionBarDock === d.id || (d.id === 'bottom' && actionBarDock === 'bottom-center') ? 'settings-dock-btn active' : 'settings-dock-btn'}
                            onClick={() => {
                              const typed = d.id as ActionBarDock;
                              setActionBarDockState(typed);
                              usePanelStore.getState().setActionBarDock(typed);
                            }}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard
                  title={t('settings.panels.appearance.dockTitle')}
                  description={t('settings.panels.appearance.dockDescription')}
                >
                  <div className="settings-modern-layout-config">
                    {/* 1-Klick-Presets */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>{t('settings.panels.appearance.presets')}</strong>
                        <small>{t('settings.panels.appearance.presetsDescription')}</small>
                      </div>
                      <div className="settings-dock-buttons-row" style={{ flexWrap: 'wrap' }}>
                        {[
                          { id: 'bottom-dock', label: `🌟 ${t('settings.panels.appearance.presetNovaBottom')}` },
                          { id: 'classic-left', label: `📐 ${t('settings.panels.appearance.presetClassicLeft')}` },
                          { id: 'floating-widget', label: `🎈 ${t('settings.panels.appearance.presetFloating')}` },
                          { id: 'minimalist-autohide', label: `⚡ ${t('settings.panels.appearance.presetMinimal')}` }
                        ].map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="settings-dock-btn"
                            onClick={() => applyDockPreset(p.id as NovaDockPreset)}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dock Position */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>{t('settings.panels.appearance.dockPosition')}</strong>
                        <small>{t('settings.panels.appearance.dockPositionDescription')}</small>
                      </div>
                      <div className="settings-segmented-group">
                        {[
                          { id: 'left', label: t('settings.panels.appearance.left')},
                          { id: 'right', label: t('settings.panels.appearance.right')},
                          { id: 'bottom', label: t('settings.panels.appearance.bottom')},
                          { id: 'top', label: t('settings.panels.appearance.top')},
                          { id: 'floating', label: t('settings.panels.appearance.floating')}
                        ].map((pos) => (
                          <button
                            key={pos.id}
                            type="button"
                            className={dockSettings.position === pos.id ? 'settings-seg-btn active' : 'settings-seg-btn'}
                            onClick={() => setDockSettings({ position: pos.id as NovaDockPosition })}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* If floating: Orientation and Reset position */}
                    {dockSettings.position === 'floating' && (
                      <div className="settings-field-row">
                        <div className="settings-field-info">
                          <strong>{t('settings.panels.appearance.floatingPosition')}</strong>
                          <small>{t('settings.panels.appearance.floatingPositionDescription')}</small>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div className="settings-segmented-group">
                            <button
                              type="button"
                              className={dockSettings.orientation === 'horizontal' ? 'settings-seg-btn active' : 'settings-seg-btn'}
                              onClick={() => setDockSettings({ orientation: 'horizontal' })}
                            >
                              {t('settings.panels.appearance.horizontal')}
                            </button>
                            <button
                              type="button"
                              className={dockSettings.orientation === 'vertical' ? 'settings-seg-btn active' : 'settings-seg-btn'}
                              onClick={() => setDockSettings({ orientation: 'vertical' })}
                            >
                              {t('settings.panels.appearance.vertical')}
                            </button>
                          </div>
                          <button
                            type="button"
                            className="secondary-action compact"
                            onClick={resetFloatingDockPos}
                            title={t('settings.panels.appearance.resetFloatingPosition')}
                          >
                            <RotateCcw size={13} />
                            <span>{t('settings.panels.appearance.resetFloatingPosition')}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Auto-Hide Toggle */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>{t('settings.panels.appearance.autoHide')}</strong>
                        <small>{t('settings.panels.appearance.autoHideDescription')}</small>
                      </div>
                      <div className="settings-segmented-group">
                        <button
                          type="button"
                          className={dockSettings.autoHide ? 'settings-seg-btn active' : 'settings-seg-btn'}
                          onClick={() => setDockSettings({ autoHide: true })}
                        >
                          {t('settings.panels.appearance.enabled')}
                        </button>
                        <button
                          type="button"
                          className={!dockSettings.autoHide ? 'settings-seg-btn active' : 'settings-seg-btn'}
                          onClick={() => setDockSettings({ autoHide: false })}
                        >
                          Deaktiviert
                        </button>
                      </div>
                    </div>

                    {/* Reveal Animation Style & Duration */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>{t('settings.panels.appearance.animation')}</strong>
                        <small>{t('settings.panels.appearance.animationDescription', { duration: dockSettings.animationDuration })}</small>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div className="settings-segmented-group">
                          {[
                            { id: 'slide', label: t('settings.panels.appearance.animationSlide')},
                            { id: 'fade', label: t('settings.panels.appearance.animationFade')},
                            { id: 'instant', label: t('settings.panels.appearance.animationInstant')}
                          ].map((anim) => (
                            <button
                              key={anim.id}
                              type="button"
                              className={dockSettings.animation === anim.id ? 'settings-seg-btn active' : 'settings-seg-btn'}
                              onClick={() => setDockSettings({ animation: anim.id as NovaDockAnimation })}
                            >
                              {anim.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="600"
                          step="50"
                          value={dockSettings.animationDuration}
                          onChange={(e) => setDockSettings({ animationDuration: Number(e.target.value)})}
                          style={{ width: '110px' }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{dockSettings.animationDuration} ms</span>
                      </div>
                    </div>

                    {/* Fisheye Magnification Sliders */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>{t('settings.panels.appearance.fisheye')} ({t('settings.panels.appearance.focusIcon')}: {dockSettings.magnification}x, {t('settings.panels.appearance.neighborIcons')}: {dockSettings.neighborScale}x)</strong>
                        <small>{t('settings.panels.appearance.fisheyeDescription')}</small>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('settings.panels.appearance.focusIcon')}</label>
                          <input
                            type="range"
                            min="1.0"
                            max="2.0"
                            step="0.05"
                            value={dockSettings.magnification}
                            onChange={(e) => setDockSettings({ magnification: Number(e.target.value)})}
                            style={{ width: '100px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('settings.panels.appearance.neighborIcons')}</label>
                          <input
                            type="range"
                            min="1.0"
                            max="1.5"
                            step="0.05"
                            value={dockSettings.neighborScale}
                            onChange={(e) => setDockSettings({ neighborScale: Number(e.target.value)})}
                            style={{ width: '100px' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard title={t('settings.panels.appearance.accentGlassTitle')} description={t('settings.panels.appearance.accentGlassDescription')}>
                  <div className="settings-modern-appearance-grid">
                    {/* Theme Accents */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>{t('settings.panels.appearance.accentTitle')}</strong>
                        <small>{t('settings.panels.appearance.accentDescription')}</small>
                      </div>
                      <div className="settings-accent-palette">
                        {[
                          { id: 'neon-cyan', name: t('settings.panels.appearance.accentNeon'), color: '#00d9ff' },
                          { id: 'electric-violet', name: t('settings.panels.appearance.accentViolet'), color: '#a855f7' },
                          { id: 'emerald-flow', name: t('settings.panels.appearance.accentEmerald'), color: '#10b981' },
                          { id: 'solar-amber', name: t('settings.panels.appearance.accentAmber'), color: '#f59e0b' },
                          { id: 'monochrome-slate', name: t('settings.panels.appearance.accentSlate'), color: '#94a3b8' }
                        ].map((acc) => (
                          <button
                            key={acc.id}
                            type="button"
                            className={`settings-accent-btn ${themeAccent === acc.id ? 'active' : ''}`}
                            onClick={() => {
                              usePanelStore.getState().setThemeAccent(acc.id as ThemeAccent);
                              // Preset accents and legacy skins used separate
                              // settings. Clear a previously selected custom
                              // skin so its inline color cannot mask this choice.
                              updateDraftField('skin', 'default');
                              updateDraftField('accent_color', '');
                            }}
                            title={acc.name}
                          >
                            <span className="accent-swatch" style={{ background: acc.color, boxShadow: `0 0 10px ${acc.color}66` }} />
                            <span>{acc.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Glassmorphism Levels */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>{t('settings.panels.appearance.glassTitle')}</strong>
                        <small>{t('settings.panels.appearance.glassDescription')}</small>
                      </div>
                      <div className="settings-segmented-group">
                        {[
                          { id: 'solid', label: t('settings.panels.appearance.glassSolid') },
                          { id: 'subtle', label: t('settings.panels.appearance.glassSubtle') },
                          { id: 'modern', label: t('settings.panels.appearance.glassModern') },
                          { id: 'deep', label: t('settings.panels.appearance.glassDeep') }
                        ].map((gl) => (
                          <button
                            key={gl.id}
                            type="button"
                            className={`settings-seg-btn ${glassLevel === gl.id ? 'active' : ''}`}
                            onClick={() => usePanelStore.getState().setGlassLevel(gl.id as GlassLevel)}
                          >
                            {gl.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* UI Density */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>{t('settings.panels.appearance.densityTitle')}</strong>
                        <small>{t('settings.panels.appearance.densityDescription')}</small>
                      </div>
                      <div className="settings-segmented-group">
                        {[
                          { id: 'compact', label: t('settings.panels.appearance.densityCompact') },
                          { id: 'standard', label: t('settings.panels.appearance.densityStandard') },
                          { id: 'comfortable', label: t('settings.panels.appearance.densityComfortable') }
                        ].map((den) => (
                          <button
                            key={den.id}
                            type="button"
                            className={`settings-seg-btn ${uiDensity === den.id ? 'active' : ''}`}
                            onClick={() => usePanelStore.getState().setUiDensity(den.id as UiDensity)}
                          >
                            {den.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard title={t('settings.panels.appearance.themeTitle')} description={t('settings.panels.appearance.themeDescription')}>
                  <div className="settings-theme-grid">
                    <button
                      type="button"
                      className={settingsText(draft.theme ?? settings.theme, 'dark') === 'dark' ? 'settings-theme-btn active' : 'settings-theme-btn'}
                      onClick={() => updateDraftField('theme', 'dark')}
                    >
                      <span className="settings-theme-preview settings-theme-preview-dark" />
                      <strong>{t('settings.panels.appearance.themeDark')}</strong>
                      <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>{t('settings.panels.appearance.themeDarkSubtitle')}</span>
                    </button>
                    <button
                      type="button"
                      className={settingsText(draft.theme ?? settings.theme, 'dark') === 'light' ? 'settings-theme-btn active' : 'settings-theme-btn'}
                      onClick={() => updateDraftField('theme', 'light')}
                    >
                      <span className="settings-theme-preview settings-theme-preview-light" />
                      <strong>{t('settings.panels.appearance.themeLight')}</strong>
                      <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>{t('settings.panels.appearance.themeLightSubtitle')}</span>
                    </button>
                    <button
                      type="button"
                      className={settingsText(draft.theme ?? settings.theme, 'dark') === 'oled' ? 'settings-theme-btn active' : 'settings-theme-btn'}
                      onClick={() => updateDraftField('theme', 'oled')}
                    >
                      <span className="settings-theme-preview" style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.3)' }} />
                      <strong>{t('settings.panels.appearance.themeOled')}</strong>
                      <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>{t('settings.panels.appearance.themeOledSubtitle')}</span>
                    </button>
                    <button
                      type="button"
                      className={settingsText(draft.theme ?? settings.theme, 'dark') === 'system' ? 'settings-theme-btn active' : 'settings-theme-btn'}
                      onClick={() => updateDraftField('theme', 'system')}
                    >
                      <span className="settings-theme-preview settings-theme-preview-system" />
                      <strong>{t('settings.panels.appearance.themeSystem')}</strong>
                      <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>{t('settings.panels.appearance.themeSystemSubtitle')}</span>
                    </button>
                    <button
                      type="button"
                      className={settingsText(draft.theme ?? settings.theme, 'dark') === 'vision-impaired' ? 'settings-theme-btn active' : 'settings-theme-btn'}
                      onClick={() => updateDraftField('theme', 'vision-impaired')}
                    >
                      <span
                        className="settings-theme-preview"
                        style={{ background: 'linear-gradient(135deg, #000000 55%, #FFD700 55%, #FFD700 70%, #00FFFF 70%)', border: '2px solid #FFFFFF' }}
                      />
                      <strong>{t('settings.panels.appearance.themeVisionImpaired')}</strong>
                      <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>{t('settings.panels.appearance.themeVisionImpairedSubtitle')}</span>
                    </button>
                  </div>
                </SettingsCard>

                <SettingsCard title={t('settings.panels.appearance.skinsTitle')} description={t('settings.panels.appearance.skinsDescription')}>
                  <div className="settings-skin-grid">
                    {SETTINGS_SKINS.map((skin) => (
                      <button
                        key={skin.key}
                        type="button"
                        className={settingsText(draft.skin ?? settings.skin, 'default').toLowerCase() === skin.key ? 'settings-skin-btn active' : 'settings-skin-btn'}
                        onClick={() => {
                          updateDraftField('skin', skin.key);
                          updateDraftField('accent_color', '');
                        }}
                      >
                        <div className="settings-skin-dots">
                          {skin.colors.map((color) => <span key={color} style={{ background: color }} />)}
                        </div>
                        <strong>{skin.name}</strong>
                      </button>
                    ))}
                  </div>

                  <div className="settings-custom-color-card" style={{ marginTop: 14, padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--lb-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="color"
                        value={settingsText(draft.accent_color ?? settings.accent_color, '#0ea5e9') || '#0ea5e9'}
                        onChange={(e) => {
                          updateDraftField('skin', 'custom');
                          updateDraftField('accent_color', e.target.value);
                        }}
                        style={{ width: 34, height: 34, padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer', background: 'transparent' }}
                        title={t('settings.panels.appearance.customAccent')}
                      />
                      <div>
                        <strong style={{ display: 'block', fontSize: 13 }}>{t('settings.panels.appearance.customAccent')}</strong>
                        <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>{t('settings.panels.appearance.customAccentDescription')}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="text"
                        value={settingsText(draft.accent_color ?? settings.accent_color, '')}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          updateDraftField('skin', 'custom');
                          updateDraftField('accent_color', val);
                        }}
                        placeholder="#0ea5e9"
                        maxLength={7}
                        style={{ width: 85, padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', borderRadius: 6, border: '1px solid var(--lb-border)', background: 'var(--lb-bg-alt)', color: 'var(--lb-text)' }}
                      />
                      <button
                        type="button"
                        className={settingsText(draft.skin ?? settings.skin, 'default') === 'custom' ? 'secondary-action compact active' : 'secondary-action compact'}
                        onClick={() => {
                          updateDraftField('skin', 'custom');
                          if (!draft.accent_color && !settings.accent_color) {
                            updateDraftField('accent_color', '#0ea5e9');
                          }
                        }}
                      >
                        {t('settings.panels.appearance.activate')}
                      </button>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard title={t('settings.panels.appearance.typographyTitle')} description={t('settings.panels.appearance.typographyDescription')}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--lb-text)' }}>
                      {t('settings.panels.appearance.fontSize')}
                    </label>
                    <div className="settings-size-grid">
                      {[
                        ['small', t('settings.panels.appearance.fontSmall')],
                        ['default', t('settings.panels.appearance.fontDefault')],
                        ['large', t('settings.panels.appearance.fontLarge')],
                        ['xlarge', t('settings.panels.appearance.fontXLarge')]
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={settingsText(draft.font_size ?? settings.font_size, 'default') === value ? 'settings-size-btn active' : 'settings-size-btn'}
                          onClick={() => updateDraftField('font_size', value)}
                        >
                          <span style={{ fontSize: value === 'small' ? 12 : value === 'default' ? 14 : value === 'large' ? 16 : 18 }}>Aa</span>
                          <strong>{label}</strong>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--lb-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <strong style={{ display: 'block', fontSize: 13 }}>{t('settings.panels.appearance.defaultZoom')}</strong>
                        <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>{t('settings.panels.appearance.defaultZoomDescription')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, minWidth: 44, textAlign: 'right' }}>
                          {Number(draft.default_zoom ?? settings.default_zoom) || 100}%
                        </span>
                        <button
                          type="button"
                          className="secondary-action compact"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => updateDraftField('default_zoom', 100)}
                          title={t('settings.panels.appearance.resetZoom')}
                        >
                          100%
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={80}
                      max={150}
                      step={5}
                      value={Number(draft.default_zoom ?? settings.default_zoom) || 100}
                      onChange={(e) => updateDraftField('default_zoom', Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--lb-muted)', marginTop: 4 }}>
                      <span>80%</span>
                      <span>{t('settings.panels.appearance.zoomDefault')}</span>
                      <span>125%</span>
                      <span>150%</span>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard title={t('settings.panels.appearance.messageLayoutTitle')} description={t('settings.panels.appearance.messageLayoutDescription')}>
                  <div className="settings-layout-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
                    {[
                      { key: 'bubbles', title: t('settings.panels.appearance.bubbles'), desc: t('settings.panels.appearance.bubblesDescription'), icon: '💬' },
                      { key: 'compact', title: t('settings.panels.appearance.compactStream'), desc: t('settings.panels.appearance.compactStreamDescription'), icon: '📄' },
                      { key: 'expanded', title: t('settings.panels.appearance.documentCanvas'), desc: t('settings.panels.appearance.documentCanvasDescription'), icon: '📖' }
                    ].map((item) => {
                      const isActive = settingsText(draft.message_layout ?? settings.message_layout, 'bubbles') === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={isActive ? 'settings-theme-btn active' : 'settings-theme-btn'}
                          onClick={() => updateDraftField('message_layout', item.key)}
                          style={{ padding: '12px 10px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4 }}
                        >
                          <span style={{ fontSize: 18 }}>{item.icon}</span>
                          <strong style={{ fontSize: 13 }}>{item.title}</strong>
                          <span style={{ fontSize: 11, color: 'var(--lb-muted)', lineHeight: 1.3 }}>{item.desc}</span>
                        </button>
                      );
                    })}
                  </div>

                  <SettingsField label={t('settings.panels.appearance.syntaxTheme')} description={t('settings.panels.appearance.syntaxThemeDescription')}>
                    <select value={settingsText(draft.syntax_theme ?? settings.syntax_theme, '')} onChange={(event) => updateDraftField('syntax_theme', event.target.value)}>
                      <option value="">{t('settings.panels.appearance.themeDefault')}</option>
                      <option value="tomorrow-night">{t('settings.panels.appearance.tomorrowNight')}</option>
                      <option value="one-dark">{t('settings.panels.appearance.oneDark')}</option>
                      <option value="github-light">{t('settings.panels.appearance.githubLight')}</option>
                    </select>
                  </SettingsField>
                </SettingsCard>

                {dirty && (
                  <div className="settings-floating-action-bar" style={{ position: 'sticky', bottom: 12, zIndex: 10, padding: '10px 16px', borderRadius: 10, background: 'var(--lb-surface-strong)', border: '1px solid var(--accent-primary)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="status-dot" style={{ background: 'var(--accent-primary)' }} />
                      <span style={{ fontSize: 12, fontWeight: 500 }} role={!ready ? 'status' : undefined}>
                        {ready ? t('settings.panels.appearance.livePreview') : t('insights.sidekickStarting')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button type="button" className="secondary-action compact" onClick={() => void restoreDraft()} disabled={!ready || !dirty}>
                        {t('settings.panels.appearance.resetDraft')}
                      </button>
                      <button type="button" className="primary-action compact" onClick={() => void save()} disabled={!ready || saving || !dirty} style={{ background: 'var(--accent-primary)', color: 'var(--accent-text, #ffffff)' }}>
                        {saving ? t('settings.panels.appearance.saving') : t('settings.panels.appearance.saveSettings')}
                      </button>
                    </div>
                  </div>
                )}

                <SettingsCard title={t('settings.panels.appearance.sessionView')} description={t('settings.panels.appearance.sessionViewDescription')}>
                  <div className="settings-field-grid">
                    <SettingsToggle
                      label={t('settings.panels.appearance.keepFileTree')}
                      description={t('settings.panels.appearance.keepFileTreeDescription')}
                      checked={settingsBoolean(draft.workspace_panel_open ?? settings.workspace_panel_open, true)}
                      onChange={(value) => updateDraftToggle('workspace_panel_open', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.appearance.sessionJump')}
                      description={t('settings.panels.appearance.sessionJumpDescription')}
                      checked={settingsBoolean(draft.session_jump_buttons ?? settings.session_jump_buttons, false)}
                      onChange={(value) => updateDraftToggle('session_jump_buttons', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.appearance.infiniteScroll')}
                      description={t('settings.panels.appearance.infiniteScrollDescription')}
                      checked={settingsBoolean(draft.session_endless_scroll ?? settings.session_endless_scroll, false)}
                      onChange={(value) => updateDraftToggle('session_endless_scroll', value)}
                    />
                  </div>
                </SettingsCard>
              </>
            )}

            {section === 'preferences' && (
              <>
                <SettingsCard
                  title={t('settings.panels.preferences.browserProfiles')}
                  description={t('settings.panels.preferences.browserProfilesDescription')}
                >
                  <ProfileSwitcher
                    profiles={profiles}
                    activeProfileId={activeProfileId}
                    onSelect={onSelectProfile}
                    onCreate={onCreateProfile}
                    onRename={onRenameProfile}
                    onDelete={onDeleteProfile}
                  />
                </SettingsCard>

                <SettingsCard
                  title={t('settings.panels.preferences.searchEngine')}
                  description={t('settings.panels.preferences.searchEngineDescription')}
                >
                  <div className="settings-field-grid">
                    <SettingsField label={t('settings.panels.preferences.engine')} description={t('settings.panels.preferences.engineDescription')}>
                      <select
                        value={searchEngineId}
                        onChange={(event) => onSearchEngineChange(event.target.value)}
                      >
                        {searchEngines.map((engine) => (
                          <option key={engine.id} value={engine.id}>{engine.label}</option>
                        ))}
                      </select>
                    </SettingsField>
                  </div>
                </SettingsCard>

                <SettingsCard
                  title={t('settings.panels.preferences.defaultBrowser')}
                  description={t('settings.panels.preferences.defaultBrowserDescription')}
                >
                  <div className="settings-field-grid">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '16px' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                          {defaultBrowserStatus === true
                            ? t('settings.panels.preferences.defaultBrowserConfigured')
                            : defaultBrowserStatus === false
                            ? t('settings.panels.preferences.defaultBrowserNotConfigured')
                            : t('settings.panels.preferences.defaultBrowserChecking')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={handleSetDefaultBrowser}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                      >
                        <ExternalLink size={14} />
                        {defaultBrowserStatus === true ? t('settings.panels.preferences.openWindowsSettings') : t('settings.panels.preferences.makeDefaultBrowser')}
                      </button>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard
                  title={t('settings.panels.preferences.dataCacheTitle')}
                  description={t('settings.panels.preferences.dataCacheDescription')}
                >
                  <div className="settings-field-grid">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '16px' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                          {t('settings.panels.preferences.dataCachePolicy')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={async () => {
                          if (window.confirm(t('settings.panels.preferences.clearConfirm'))) {
                            const clearData = window.lastbrowser?.browser?.clearData;
                            await clearBrowserDataWithFeedback(
                              clearData
                                ? () => clearData({ cache: true, cookies: true, storage: true })
                                : undefined,
                              (cleared) => showToast(t(cleared
                                ? 'settings.panels.preferences.clearSuccess'
                                : 'settings.panels.preferences.clearError'))
                            );
                          }
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                      >
                        <Trash2 size={14} />
                        {t('settings.panels.preferences.clearNow')}
                      </button>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard title={t('settings.panels.preferences.defaults')} description={t('settings.panels.preferences.defaultsDescription')}>
                  <div className="settings-field-grid">
                    <SettingsField label={t('settings.panels.preferences.language')} description={t('settings.panels.preferences.languageDescription')}>
                      <select
                        value={settingsText(draft.language ?? settings.language, 'en')}
                        onChange={(event) => {
                          updateDraftField('language', event.target.value);
                          // Update the React catalog immediately; its provider persists and syncs the locale to main.
                          setLocale(event.target.value);
                        }}
                      >
                        {SETTINGS_LANGUAGES.map((language) => (
                          <option key={language.value} value={language.value}>{language.label}</option>
                        ))}
                      </select>
                    </SettingsField>
                    <SettingsField label={t('settings.panels.preferences.sidebarDensity')} description={t('settings.panels.preferences.sidebarDensityDescription')}>
                      <select value={settingsText(draft.sidebar_density ?? settings.sidebar_density, 'compact') === 'detailed' ? 'detailed' : 'compact'} onChange={(event) => updateDraftField('sidebar_density', event.target.value)}>
                        <option value="compact">{t('settings.panels.preferences.compact')}</option>
                        <option value="detailed">{t('settings.panels.preferences.detailed')}</option>
                      </select>
                    </SettingsField>
                    <SettingsField label={t('settings.panels.preferences.busyInput')} description={t('settings.panels.preferences.busyInputDescription')}>
                      <select value={settingsText(draft.busy_input_mode ?? settings.busy_input_mode, 'queue')} onChange={(event) => updateDraftField('busy_input_mode', event.target.value)}>
                        <option value="queue">{t('settings.panels.preferences.queue')}</option>
                        <option value="interrupt">{t('settings.panels.preferences.interrupt')}</option>
                        <option value="steer">{t('settings.panels.preferences.steer')}</option>
                      </select>
                    </SettingsField>
                    <SettingsField label={t('settings.panels.preferences.adaptiveTitle')} description={t('settings.panels.preferences.adaptiveTitleDescription')}>
                      <select value={settingsText(draft.auto_title_refresh_every ?? settings.auto_title_refresh_every, '0')} onChange={(event) => updateDraftField('auto_title_refresh_every', event.target.value)}>
                        <option value="0">{t('settings.panels.preferences.off')}</option>
                        <option value="5">{t('settings.panels.preferences.every5')}</option>
                        <option value="10">{t('settings.panels.preferences.every10')}</option>
                        <option value="20">{t('settings.panels.preferences.every20')}</option>
                      </select>
                    </SettingsField>
                  </div>
                </SettingsCard>

                <SettingsCard title={t('settings.panels.notifications.title')} description={t('settings.panels.notifications.description')}>
                  <div className="settings-field-grid">
                    <SettingsToggle
                      label={t('settings.panels.notifications.sound')}
                      description={t('settings.panels.notifications.soundDescription')}
                      checked={settingsBoolean(draft.sound_enabled ?? settings.sound_enabled, true)}
                      onChange={(value) => updateDraftToggle('sound_enabled', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.notifications.browser')}
                      description={t('settings.panels.notifications.browserDescription')}
                      checked={settingsBoolean(draft.notifications_enabled ?? settings.notifications_enabled, true)}
                      onChange={(value) => updateDraftToggle('notifications_enabled', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.notifications.tokenUsage')}
                      description={t('settings.panels.notifications.tokenUsageDescription')}
                      checked={settingsBoolean(draft.show_token_usage ?? settings.show_token_usage, false)}
                      onChange={(value) => updateDraftToggle('show_token_usage', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.notifications.tokenSpeed')}
                      description={t('settings.panels.notifications.tokenSpeedDescription')}
                      checked={settingsBoolean(draft.show_tps ?? settings.show_tps, false)}
                      onChange={(value) => updateDraftToggle('show_tps', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.notifications.compactActivity')}
                      description={t('settings.panels.notifications.compactActivityDescription')}
                      checked={settingsBoolean(draft.simplified_tool_calling ?? settings.simplified_tool_calling, true)}
                      onChange={(value) => updateDraftToggle('simplified_tool_calling', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.notifications.reasoning')}
                      description={t('settings.panels.notifications.reasoningDescription')}
                      checked={settingsBoolean(draft.show_thinking ?? settings.show_thinking, false)}
                      onChange={(value) => updateDraftToggle('show_thinking', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.notifications.otherSessions')}
                      description={t('settings.panels.notifications.otherSessionsDescription')}
                      checked={settingsBoolean(draft.show_cli_sessions ?? settings.show_cli_sessions, false)}
                      onChange={(value) => updateDraftToggle('show_cli_sessions', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.notifications.syncUsage')}
                      description={t('settings.panels.notifications.syncUsageDescription')}
                      checked={settingsBoolean(draft.sync_to_insights ?? settings.sync_to_insights, false)}
                      onChange={(value) => updateDraftToggle('sync_to_insights', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.notifications.updates')}
                      description={t('settings.panels.notifications.updatesDescription')}
                      checked={autoUpdateChecksEnabled}
                      onChange={(value) => updateDraftToggle('check_for_updates', value)}
                    />
                  </div>
                </SettingsCard>
                {/* === Accessibility Card === */}
                <SettingsCard title={t('settings.panels.appearance.accessibility')} description={t('settings.panels.appearance.accessibilityDescription')}>
                  <div className="settings-field-grid">
                    <SettingsToggle
                      label={t('settings.panels.appearance.highContrast')}
                      description={t('settings.panels.appearance.highContrastDescription')}
                      checked={a11yHighContrast}
                      onChange={(val) => { usePanelStore.getState().setA11yHighContrast(val); }}
                    />
                    <SettingsToggle
                      label={t('settings.panels.appearance.dyslexicFont')}
                      description={t('settings.panels.appearance.dyslexicFontDescription')}
                      checked={a11yDyslexicFont}
                      onChange={(val) => { usePanelStore.getState().setA11yDyslexicFont(val); }}
                    />
                    <SettingsField label={t('settings.panels.appearance.minimumFontSize')} description={t('settings.panels.appearance.minimumFontSizeDescription')}>
                      <select
                        value={String(a11yMinFontSize)}
                        onChange={(e) => { usePanelStore.getState().setA11yMinFontSize(Number(e.target.value)); }}
                      >
                        <option value="0">{t('settings.panels.appearance.offDefault')}</option>
                        <option value="14">14px</option>
                        <option value="16">16px</option>
                        <option value="18">18px</option>
                        <option value="20">20px</option>
                      </select>
                    </SettingsField>
                    <SettingsField
                      label={`${t('settings.panels.appearance.uiZoom')}: ${a11yUiZoom}%`}
                      description={t('settings.panels.appearance.uiZoomDescription')}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="range"
                          min={80}
                          max={150}
                          step={5}
                          value={a11yUiZoom}
                          onChange={(e) => { usePanelStore.getState().setA11yUiZoom(Number(e.target.value)); }}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => { usePanelStore.getState().setA11yUiZoom(100); }}
                          style={{ fontSize: 11, padding: '2px 8px' }}
                        >
                          {t('settings.reset')}
                        </button>
                      </div>
                    </SettingsField>
                    <SettingsToggle
                      label={t('settings.panels.appearance.focusRings')}
                      description={t('settings.panels.appearance.focusRingsDescription')}
                      checked={a11yFocusRings}
                      onChange={(val) => { usePanelStore.getState().setA11yFocusRings(val); }}
                    />
                  </div>
                </SettingsCard>
                {/* === Vision-Impaired Mode 2.0 Card === */}
                <VisionImpairedSettingsCard />
              </>
            )}


            {section === 'providers' && (
              <>
                <SettingsCard
                  title={t('settings.panels.providers.title')}
                  description={t('settings.panels.providers.description')}
                  action={<span className="settings-badge">{activeProvider || t('settings.panels.providers.noneActive')}</span>}
                >
                  {modelsState.loading && <EmptyState icon={<Loader2 size={16} className="spin" />} label={t('settings.panels.providers.loading')} />}
                  {modelsState.error && <div className="workspace-error">{modelsState.error}</div>}
                  {!modelsState.loading && (
                    <div className="provider-status-list">
                      {providerOptions.map((option) => {
                        const meta = providerPresentation(option.id);
                        const chatEvidence = getProviderChatEvidence(option.id, window.localStorage);
                        // Catalog groups can contain static/offline fallback
                        // models. Their presence is not a successful provider probe.
                        const verification = providerVerification(option.id, {
                          successfulChat: Boolean(chatEvidence),
                          modelId: chatEvidence?.modelId,
                        });
                        const isActive = option.id === activeProvider;
                        return (
                          <div key={option.id} className={`provider-status-row ${isActive ? 'active' : ''}`}>
                            <span className="provider-mark" style={{ background: meta.color }}>{meta.mark}</span>
                            <span className="provider-copy">
                              <strong>{option.label}</strong>
                              <small>{localizedProviderDescription(option.id, locale)}</small>
                              <small className={`provider-verification-note ${verification.verified ? 'verified' : 'untested'}`}>
                                {t(verification.statusKey)}
                              </small>
                              {verification.modelId && (
                                <small className="provider-verification-evidence">{verification.modelId}</small>
                              )}
                              {verification.evidenceKey && (
                                <small className="provider-verification-evidence">{t(verification.evidenceKey)}</small>
                              )}
                            </span>
                            {isActive && <span className="provider-badge">{t('settings.panels.providers.active')}</span>}
                            {option.oauthProvider && option.id !== 'antigravity' && (
                              <button
                                type="button"
                                className="secondary-action compact"
                                onClick={() => void startProviderConnect(option)}
                                disabled={!ready || (option.id === 'openai-codex' && ['starting', 'pending'].includes(codexConnect?.status || ''))}
                              >
                                <LogIn size={14} />
                                <span>{t('settings.panels.providers.connect')}</span>
                              </button>
                            )}
                            {option.id === 'antigravity' && (
                              <div className="provider-antigravity-accounts">
                                <GeminiAccountsPanel sidekickReady={ready} />
                              </div>
                            )}
                            {option.id === 'openai-codex' && codexConnect && (
                              <div className="provider-connect-status" role="status" aria-live="polite">
                                <span>{codexConnect.message}</span>
                                {codexConnect.status === 'pending' && codexConnect.userCode && (
                                  <button type="button" className="secondary-action compact" onClick={() => void navigator.clipboard?.writeText(codexConnect.userCode || '')}>
                                    <Copy size={14} /> {codexConnect.userCode}
                                  </button>
                                )}
                                {codexConnect.status === 'pending' && (
                                  <button type="button" className="secondary-action compact" onClick={() => void cancelCodexConnect()}>
                                    {t('settings.panels.providers.cancel')}
                                  </button>
                                )}
                              </div>
                            )}
                            {['openrouter', 'alibaba'].includes(option.id) ? (
                              <button
                                type="button"
                                className="secondary-action compact"
                                onClick={() => void openOpenRouterSettings(option.id as 'openrouter' | 'alibaba')}
                                disabled={!ready || saving}
                              >
                                <Settings size={14} />
                                <span>{t('settings.panels.providers.configure')}</span>
                              </button>
                            ) : ['ollama', 'ollama-cloud'].includes(option.id) ? (
                              <button
                                type="button"
                                className="secondary-action compact"
                                onClick={() => {
                                  const defaultUrl = option.id === 'ollama-cloud' ? 'https://ollama.com/v1' : 'http://localhost:11434';
                                  const providerConfigs = isRecord(settings.providers) ? settings.providers : {};
                                  const configuredProvider = providerConfigs[option.id];
                                  const providerConfig: AnyRecord = isRecord(configuredProvider) ? configuredProvider : {};
                                  const currentProviderSettings = activeProvider === option.id ? settings : providerConfig;
                                  setOllamaModalProviderId(option.id);
                                  setOllamaModalLabel(option.label || option.id);
                                  setOllamaUrl(settingsText(currentProviderSettings.base_url, defaultUrl));
                                  setOllamaKey('');
                                  setOllamaTestResult('');
                                }}
                                disabled={!ready || saving}
                              >
                                <Settings size={14} />
                                <span>{t('settings.panels.providers.configure')}</span>
                              </button>
                            ) : !isActive && (
                              <button
                                type="button"
                                className="secondary-action compact"
                                onClick={() => void switchProvider(option.id)}
                                disabled={!ready || saving}
                              >
                                <span>{t('settings.panels.providers.use')}</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SettingsCard>

                {openRouterModalOpen && (
                  <div className="settings-modal-overlay" onClick={() => setOpenRouterModalOpen(false)}>
                    <div className="settings-modal-box" onClick={(event) => event.stopPropagation()}>
                      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>{openRouterConfigProvider === 'alibaba' ? 'Alibaba Cloud (DashScope)' : 'OpenRouter'} {t('settings.panels.providers.configure')}</h3>
                      <p className="settings-hint" style={{ margin: '0 0 12px' }}>
                        {t(openRouterConfigProvider === 'alibaba' ? 'settings.panels.providers.alibabaKeyHint' : 'settings.panels.providers.openrouterKeyHint')}
                      </p>
                      {openRouterConfigProvider === 'alibaba' && <>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('settings.panels.providers.baseUrl')}</label>
                        <input
                          type="url"
                          value={alibabaBaseUrl}
                          onChange={(event) => setAlibabaBaseUrl(event.target.value)}
                          placeholder={t('settings.panels.providers.alibabaBaseUrlPlaceholder')}
                          style={{ width: '100%', marginBottom: 10 }}
                        />
                      </>}
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('settings.panels.providers.apiKey')}</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={openRouterKey}
                        onChange={(event) => setOpenRouterKey(event.target.value)}
                        placeholder={openRouterHasSavedKey
                          ? t('settings.panels.providers.openrouterKeyPlaceholder')
                          : t('settings.panels.providers.cloudKeyPlaceholder')}
                        style={{ width: '100%', marginBottom: 10 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ fontSize: 12 }}>{t('settings.panels.providers.openrouterChooseModels')}</strong>
                        <button
                          type="button"
                          className="secondary-action compact"
                          onClick={() => void loadOpenRouterModelCatalog()}
                          disabled={openRouterLoading || openRouterSaving || (!openRouterHasSavedKey && !openRouterKey.trim())}
                        >
                          {openRouterLoading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                          <span>{t(openRouterHasSavedKey
                            ? 'settings.panels.providers.openrouterRefreshModels'
                            : 'settings.panels.providers.openrouterLoadModels')}</span>
                        </button>
                      </div>
                      {openRouterLoading && <EmptyState icon={<Loader2 size={15} className="spin" />} label={t('settings.panels.providers.loadingModels')} />}
                      {!openRouterLoading && !openRouterError && openRouterModels.length === 0 && (
                        <p className="settings-hint">{openRouterHasSavedKey || openRouterKey.trim()
                          ? t(openRouterConfigProvider === 'alibaba' ? 'settings.panels.providers.alibabaNoModels' : 'settings.panels.providers.openrouterNoModels')
                          : t(openRouterConfigProvider === 'alibaba' ? 'settings.panels.providers.alibabaKeyRequired' : 'settings.panels.providers.openrouterKeyRequired')}</p>
                      )}
                      {openRouterModels.length > 0 && (
                        <>
                          <div style={{ maxHeight: 230, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '6px 10px', marginBottom: 12 }}>
                            {[
                              ...openRouterModels,
                              ...openRouterSelectedModels
                                .filter((id) => !openRouterModels.some((model) => model.id === id))
                                .map((id) => ({ id, label: `${id} (${t('settings.panels.providers.openrouterUnavailable')})` }))
                            ].map((model) => {
                              const checked = openRouterSelectedModels.includes(model.id);
                              return (
                                <label key={model.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12, cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => {
                                      const next = event.target.checked
                                        ? [...openRouterSelectedModels, model.id]
                                        : openRouterSelectedModels.filter((id) => id !== model.id);
                                      setOpenRouterSelectedModels(next);
                                      if (!next.includes(openRouterDefaultModel)) {
                                        setOpenRouterDefaultModel(next[0] || '');
                                      }
                                    }}
                                  />
                                  <span>{model.label}</span>
                                </label>
                              );
                            })}
                          </div>
                          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5 }}>
                            {t('settings.panels.providers.default')}
                          </label>
                          <select
                            value={openRouterDefaultModel}
                            onChange={(event) => setOpenRouterDefaultModel(event.target.value)}
                            disabled={!openRouterSelectedModels.length}
                            style={{ width: '100%', marginBottom: 12 }}
                          >
                            {openRouterModels
                              .filter((model) => openRouterSelectedModels.includes(model.id))
                              .map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                          </select>
                        </>
                      )}
                      {openRouterError && <div className="workspace-error" role="alert" style={{ marginBottom: 10 }}>{openRouterError}</div>}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className="secondary-action compact" onClick={() => setOpenRouterModalOpen(false)}>
                          {t('settings.panels.providers.cancel')}
                        </button>
                        <button
                          type="button"
                          className="primary-action compact"
                          disabled={openRouterSaving || openRouterLoading || openRouterModels.length === 0 || openRouterSelectedModels.length === 0}
                          onClick={() => void saveOpenRouterSettings()}
                        >
                          {openRouterSaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                          <span>{t('settings.panels.providers.saveActivate')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Ollama Config Modal */}
                {ollamaModalProviderId && (
                  <div className="settings-modal-overlay" onClick={() => setOllamaModalProviderId(null)}>
                    <div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
                      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{t('settings.panels.providers.configure')} {ollamaModalLabel}</h3>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('settings.panels.providers.baseUrl')}</label>
                      <input
                        type="url"
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        placeholder={ollamaModalProviderId === 'ollama-cloud' ? 'https://ollama.com/v1' : 'http://localhost:11434'}
                        style={{ width: '100%', marginBottom: 8 }}
                      />
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('settings.panels.providers.apiKey')} {ollamaModalProviderId === 'ollama-cloud' ? t('settings.panels.providers.apiKeyRequired') : t('settings.panels.providers.apiKeyOptional')}</label>
                      <input
                        type="password"
                        value={ollamaKey}
                        onChange={(e) => setOllamaKey(e.target.value)}
                        placeholder={ollamaModalProviderId === 'ollama-cloud' ? t('settings.panels.providers.cloudKeyPlaceholder') : t('settings.panels.providers.localKeyPlaceholder')}
                        style={{ width: '100%', marginBottom: 12 }}
                      />
                      {ollamaTestResult && (
                      <div style={{ fontSize: 12, marginBottom: 8, color: ollamaTestResult.startsWith('✓') ? 'var(--accent-primary)' : '#ff6b6b' }}>
                          {ollamaTestResult}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="secondary-action compact"
                          onClick={async () => {
                            setOllamaTestResult(t('settings.panels.providers.testing'));
                            try {
                              const isCloud = ollamaModalProviderId === 'ollama-cloud';
                              const result = await window.lastbrowser.sidekick.requestWebui({
                                method: 'POST',
                                path: '/api/providers/test',
                                body: {
                                  provider: ollamaModalProviderId,
                                  base_url: ollamaUrl.trim(),
                                  api_key: ollamaKey.trim()
                                }
                              });
                              if (result.ok) {
                                setOllamaTestResult(`✓ ${t('settings.panels.providers.connectionSuccess')} — ${isCloud ? 'Ollama Cloud' : 'Ollama'}`);
                              } else {
                                setOllamaTestResult(`✗ ${t('settings.panels.providers.connectionError')}: ${String(result.error || t('common.error'))}`);
                              }
                            } catch (err) {
                              setOllamaTestResult(`✗ ${t('settings.panels.providers.connectionError')}: ${err instanceof Error ? err.message : String(err)}`);
                            }
                          }}
                        >
                          {t('settings.panels.providers.testConnection')}
                        </button>
                        <button type="button" className="secondary-action compact" onClick={() => setOllamaModalProviderId(null)}>
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="primary-action compact"
                          disabled={!ollamaUrl.trim() || saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              if (ollamaKey.trim()) {
                                await window.lastbrowser.sidekick.requestWebui({
                                  method: 'POST',
                                  path: '/api/providers',
                                  body: {
                                    provider: ollamaModalProviderId,
                                    api_key: ollamaKey.trim()
                                  }
                                });
                              }
                              await window.lastbrowser.sidekick.saveSettings({
                                settings: {
                                  ...cleanSettingsPayload(settings),
                                  provider: ollamaModalProviderId,
                                  base_url: ollamaUrl.trim()
                                }
                              });
                              await settingsState.refresh();
                              await modelsState.refresh();
                              showToast(`${ollamaModalLabel} configured. URL: ${ollamaUrl.trim()}`);
                              setOllamaModalProviderId(null);
                            } catch (error) {
                              showToast(`Could not configure Ollama: ${error instanceof Error ? error.message : String(error)}`);
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          {t('settings.panels.providers.saveActivate')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <SettingsCard title={t('settings.panels.providers.modelCatalog')} description={t('settings.panels.providers.modelCatalogDescription')}>

                  {modelsState.loading && <EmptyState icon={<Loader2 size={16} className="spin" />} label={t('settings.panels.providers.loadingModels')} />}
                  {modelsState.error && <div className="workspace-error">{modelsState.error}</div>}
                  {!modelsState.loading && !modelsState.error && (
                    <div className="settings-model-summary">
                      <span className="settings-badge">{t('settings.panels.providers.default')}: {settingsText(modelsState.data?.default_model, '—')}</span>
                      <span className="settings-badge">{t('settings.panels.providers.activeProvider')}: {activeProvider || '—'}</span>
                      <span className="settings-badge">{t('settings.panels.providers.groups')}: {modelGroups.length}</span>
                    </div>
                  )}
                </SettingsCard>

                <SettingsCard title={t('settings.panels.providers.advancedRouting')} description={t('settings.panels.providers.advancedRoutingDescription')}>
                  <div className="settings-field-grid">
                    <SettingsField label={t('settings.panels.providers.provider')} description={t('settings.panels.providers.providerDescription')}>
                      <input value={settingsText(draft.provider ?? settings.provider, '')} onChange={(event) => updateDraftField('provider', event.target.value)} placeholder="openai-codex" />
                    </SettingsField>
                    <SettingsField label={t('settings.panels.providers.modelProvider')} description={t('settings.panels.providers.modelProviderDescription')}>
                      <input value={settingsText(draft.model_provider ?? settings.model_provider, '')} onChange={(event) => updateDraftField('model_provider', event.target.value)} placeholder="openai-codex" />
                    </SettingsField>
                    <SettingsField label={t('settings.panels.providers.gateway')} description={t('settings.panels.providers.gatewayDescription')}>
                      <input value={settingsText(draft.gateway ?? settings.gateway, '')} onChange={(event) => updateDraftField('gateway', event.target.value)} placeholder="default" />
                    </SettingsField>
                    <SettingsField label={t('settings.panels.providers.openaiCodex')} description={t('settings.panels.providers.openaiCodexDescription')}>
                      <select value={settingsBoolean(draft.openai_codex_enabled ?? settings.openai_codex_enabled, false) ? 'true' : 'false'} onChange={(event) => updateDraftField('openai_codex_enabled', event.target.value === 'true')}>
                        <option value="false">{t('settings.panels.providers.disabled')}</option>
                        <option value="true">{t('settings.panels.providers.enabled')}</option>
                      </select>
                    </SettingsField>
                    <SettingsField label={t('settings.panels.providers.apiRedaction')} description={t('settings.panels.providers.apiRedactionDescription')}>
                      <select value={settingsBoolean(draft.api_redact_enabled ?? settings.api_redact_enabled, true) ? 'true' : 'false'} onChange={(event) => updateDraftField('api_redact_enabled', event.target.value === 'true')}>
                        <option value="true">{t('settings.panels.providers.enabled')}</option>
                        <option value="false">{t('settings.panels.providers.disabled')}</option>
                      </select>
                    </SettingsField>
                  </div>
                </SettingsCard>

              </>
            )}

            {section === 'teamwork' && (
              <TeamworkSettingsPanel />
            )}

            {section === 'plugins' && (
              <>
                <ExtensionsSettingsSection />
                <MailPluginSettings workspace={workspacePath} ready={ready} />
                <SettingsCard title={t('settings.panels.plugins.connectedApps')} description={t('settings.panels.plugins.connectedAppsDescription')}>
                  <div className="settings-field-grid">
                    <SettingsToggle
                      label={t('settings.panels.plugins.discordVisible')}
                      description={t('settings.panels.plugins.appstoreOnly')}
                      checked={settingsBoolean(draft.discord ?? settings.discord, false)}
                      onChange={(value) => updateDraftToggle('discord', value)}
                    />
                    <SettingsField label={t('settings.panels.plugins.enabledPlugins')} description={t('settings.panels.plugins.enabledPluginsDescription')}>
                      <input value={settingsCsv(draft.enabled_plugins ?? settings.enabled_plugins)} onChange={(event) => updateDraftField('enabled_plugins', event.target.value)} placeholder={t('settings.panels.plugins.keysPlaceholder')} />
                    </SettingsField>
                  </div>
                </SettingsCard>
                <SettingsCard title={t('settings.panels.plugins.installedInventory')} description={t('settings.panels.plugins.inventoryDescription')}>
                  {renderPluginsList()}
                </SettingsCard>
              </>
            )}


            {section === 'system' && (
              <>
                <DoctorDashboard onReopenSetup={onReopenSetup} />

                <SettingsCard
                  title={t('settings.panels.system.setupAssistant')}
                  description={t('settings.panels.system.setupAssistantDescription')}
                >
                  <div className="settings-system-actions">
                    <button
                      type="button"
                      className="secondary-action compact"
                      onClick={onReopenSetup}
                    >
                      <Sparkles size={15} />
                      <span>{t('settings.panels.system.openSetupAssistant')}</span>
                    </button>
                  </div>
                  <p className="settings-hint">{t('settings.panels.system.setupHint')}</p>
                </SettingsCard>

                <SettingsCard
                  title={t('settings.panels.system.accessUpdates')}
                  description={t('settings.panels.system.accessUpdatesDescription')}
                  action={
                    <div className="settings-system-badges">
                      <span className="settings-badge">WebUI: {webuiVersion}</span>
                      <span className="settings-badge">Agent: {agentVersion}</span>
                    </div>
                  }
                >
                  <div className="settings-field-grid">
                    <SettingsField label={t('settings.panels.system.accessPassword')} description={t('settings.panels.system.passwordKeepDescription')}>
                      <input
                        type="password"
                        value={passwordDraft}
                        disabled={passwordEnvLocked}
                        onChange={(event) => {
                          setPasswordDraft(event.target.value);
                          setDirty(true);
                        }}
                        placeholder={passwordEnvLocked ? t('settings.panels.system.lockedByEnvironment') : t('settings.panels.system.enterNewPassword')}
                      />
                    </SettingsField>
                    <SettingsField label={t('settings.panels.system.workspaceRoot')} description={t('settings.panels.system.workspaceRootDescription')}>
                      <input value={settingsText(draft.workspace_root ?? settings.workspace_root, '')} onChange={(event) => updateDraftField('workspace_root', event.target.value)} placeholder={settingsText(serviceStatus?.runtimeDir, '')} />
                    </SettingsField>
                    <SettingsToggle
                      label={t('settings.panels.system.debugMode')}
                      description={t('settings.panels.system.debugModeDescription')}
                      checked={settingsBoolean(draft.debug ?? settings.debug, false)}
                      onChange={(value) => updateDraftToggle('debug', value)}
                    />
                    <SettingsToggle
                      label={t('settings.panels.system.authEnabled')}
                      description={authEnabled ? t('settings.panels.system.authActive') : t('settings.panels.system.authDisabled')}
                      checked={authEnabled}
                      onChange={() => void 0}
                      disabled
                    />
                  </div>
                  {passwordEnvLocked && (
                    <div className="settings-env-lock">
                    {t('settings.panels.system.environmentPasswordNotice')}
                    </div>
                  )}
                  <div className="settings-system-actions">
                    <button type="button" className="secondary-action compact" onClick={() => void checkUpdates()} disabled={!ready || updatesState.loading}>
                      {updatesState.loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                      <span>{t('settings.panels.system.checkUpdates')}</span>
                    </button>
                    <button type="button" className="secondary-action compact" onClick={() => void signOut()} disabled={!ready || !loggedIn}>
                      <Shield size={15} />
                      <span>{t('settings.panels.system.signOut')}</span>
                    </button>
                    <button type="button" className="secondary-action compact" onClick={() => void disableAuth()} disabled={!ready || !authEnabled || !loggedIn || passwordEnvLocked}>
                      <Trash2 size={15} />
                      <span>{t(passwordEnvLocked ? 'settings.panels.system.lockedByEnvironment' : authEnabled ? 'settings.panels.system.disableAuth' : 'settings.panels.system.authDisabled')}</span>
                    </button>
                  </div>
                  {authEnabled && !loggedIn && !passwordEnvLocked && (
                    <p className="settings-hint">{t('settings.panels.system.authDisableLoginRequired')}</p>
                  )}
                  <div className="settings-system-status">
                    <span className={`settings-badge ${updateAvailable ? 'warning' : ''}`}>{t('settings.panels.system.updateState', { state: updateState })}</span>
                    {updateCurrentVersion && <span className="settings-badge">{t('settings.panels.system.currentVersion', { version: updateCurrentVersion })}</span>}
                    {updateAvailableVersion && <span className="settings-badge">{t('settings.panels.system.availableVersion', { version: updateAvailableVersion })}</span>}
                    {updateMessage && <span className="settings-badge">{updateMessage}</span>}
                  </div>
                </SettingsCard>

                <SettingsCard
                  title={t('settings.panels.system.sidekickRuntime')}
                  description={t('settings.panels.system.sidekickRuntimeDescription')}
                >
                  <div className="settings-system-status">
                    <span className="settings-badge">
                      {t('settings.panels.system.version', { version: agentVersion })}
                    </span>
                    <span className="settings-badge">{t('settings.panels.system.updatedWithLastbrowser')}</span>
                  </div>
                </SettingsCard>

                <SettingsCard
                  title={t('settings.panels.system.browserAutomation')}
                  description={t('settings.panels.system.browserAutomationDescription')}
                >
                  <SettingsToggle
                    label={t('settings.panels.system.browserAutomationEnabled')}
                    description={t('settings.panels.system.browserAutomationEnabledDescription')}
                    checked={cdpPreference?.enabled ?? false}
                    disabled={cdpPreference === null || cdpPreferenceSaving}
                    onChange={(enabled) => void setCdpEnabled(enabled)}
                  />
                  {cdpPreference && cdpPreference.enabled !== cdpPreference.active && !cdpRestartDismissed && (
                    <div className="settings-system-actions" role="status">
                      <span className="settings-hint">{t('settings.panels.system.browserAutomationRestartRequired')}</span>
                      <button
                        type="button"
                        className="primary-action compact"
                        onClick={() => void window.lastbrowser?.cdp?.restart?.()}
                      >
                        <RefreshCw size={14} />
                        <span>{t('settings.panels.system.browserAutomationRestartNow')}</span>
                      </button>
                      <button
                        type="button"
                        className="secondary-action compact"
                        onClick={() => setCdpRestartDismissed(true)}
                      >
                        <span>{t('settings.panels.system.browserAutomationRestartLater')}</span>
                      </button>
                    </div>
                  )}
                </SettingsCard>

                <SettingsCard title={t('settings.panels.system.developerApiTools')} description={t('settings.panels.system.developerApiToolsDescription')}>
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
