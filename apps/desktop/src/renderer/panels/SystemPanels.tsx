import React, { FormEvent, useEffect, useMemo, useState } from 'react';
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
import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';
import { cloudProviderOptions, type OnboardingStatus, type ProviderOption } from '../setup-state.js';
import { providerPresentation } from '../provider-presentation.js';
import { searchEngines } from '../tabs.js';
import { computeAccentTokens } from '../App.js';
import { type ExtensionRecord, type ExtensionPreset } from '../bridge.js';
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

export function normalizeAppstoreRecord(app: AnyRecord): AnyRecord {
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

export type SettingsSectionId = 'conversation' | 'appearance' | 'preferences' | 'providers' | 'google-accounts' | 'extensions' | 'plugins' | 'system';

export type SettingsSectionMeta = {
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
  { value: 'pt-BR', label: 'Português (Brasil)' }
] as const;

export const SETTINGS_SECTIONS: Record<SettingsSectionId, SettingsSectionMeta> = {
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
  'google-accounts': {
    title: 'Google Accounts',
    description: 'Multi-account Google CLI / Antigravity OAuth & Round-Robin.',
    icon: <Users size={16} />
  },
  extensions: {
    title: 'Extensions',
    description: 'Chrome extensions, Manifest V3 add-ons, and content scripts.',
    icon: <Puzzle size={16} />
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

export function normalizeAppearanceTheme(value: string): 'light' | 'dark' | 'system' | 'oled' {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'light' || normalized === 'system' || normalized === 'oled') return normalized;
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

export function DoctorDashboard({ onReopenSetup }: { onReopenSetup?: () => void }): JSX.Element {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDoctor = async (fix = false) => {
    if (loading || fixing) return;
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
  };

  useEffect(() => {
    void runDoctor(false);
  }, []);

  const handleCopyRaw = () => {
    if (!report?.rawOutput) return;
    void navigator.clipboard.writeText(report.rawOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasFailures = (report?.summary?.failures ?? 0) > 0 || (report?.exitCode ?? 0) !== 0;
  const hasWarnings = (report?.summary?.warnings ?? 0) > 0;

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
                    ? 'Kritische Probleme / Fehler erkannt'
                    : hasWarnings
                    ? 'Warnungen erkannt – Optimierung empfohlen'
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
              background: 'rgba(245, 158, 11, 0.06)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ color: '#fbbf24', fontSize: '13px' }}>
                  Empfohlene Maßnahmen ({report.issues.length}):
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
                  <li key={idx} style={{ color: 'rgba(232, 242, 255, 0.85)', fontSize: '12px' }}>
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
                              whiteSpace: 'nowrap',
                              flexShrink: 0
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

export function NativeSettingsMain({ serviceStatus, activeContextItem, onboardingStatus, onReopenSetup, searchEngineId, onSearchEngineChange }: { serviceStatus: ServiceStatus | null; activeContextItem: string; onboardingStatus: OnboardingStatus | null; onReopenSetup: () => void; searchEngineId: string; onSearchEngineChange: (id: string) => void }): JSX.Element {
  const ready = isReady(serviceStatus);
  const settingsState = useApiState(() => window.lastbrowser.sidekick.getSettings(), [ready], ready);
  const modelsState = useApiState(() => window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/models' }), [ready], ready);
  const authState = useApiState(() => window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/auth/status' }), [ready], ready);
  const pluginsState = useApiState(() => window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/plugins' }), [ready], ready);
  const updatesState = useApiState(() => window.lastbrowser.updates.status(), [], true);
  const sidekickUpdateState = useApiState(() => window.lastbrowser.sidekickUpdate.status(), [], true);
  const [sidekickUpdateBusy, setSidekickUpdateBusy] = useState(false);
  const [section, setSection] = useState<SettingsSectionId>('conversation');
  const [draft, setDraft] = useState<AnyRecord>({});
  const [passwordDraft, setPasswordDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ollamaModalProviderId, setOllamaModalProviderId] = useState<string | null>(null);
  const [ollamaModalLabel, setOllamaModalLabel] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaKey, setOllamaKey] = useState('');
  const [ollamaTestResult, setOllamaTestResult] = useState('');


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
  const dockSettings = usePanelStore((s) => s.dockSettings);
  const setDockSettings = usePanelStore((s) => s.setDockSettings);
  const applyDockPreset = usePanelStore((s) => s.applyDockPreset);
  const resetFloatingDockPos = usePanelStore((s) => s.resetFloatingDockPos);

  const [defaultBrowserStatus, setDefaultBrowserStatus] = useState<boolean | null>(null);

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
      showToast('Windows Standard-Apps Einstellungen geöffnet');
      setTimeout(async () => {
        const isDef = await window.lastbrowser?.system?.isDefaultBrowser?.();
        if (typeof isDef === 'boolean') setDefaultBrowserStatus(isDef);
      }, 1500);
    } catch {
      showToast('Konnte Standard-Browser nicht setzen');
    }
  };

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
  const sidekickUpdateVersion = settingsText(sidekickUpdateState.data?.currentVersion, '');
  const sidekickUpdateSource = settingsText(sidekickUpdateState.data?.source, 'bundled');
  const sidekickUpdateMessage = settingsText(sidekickUpdateState.data?.message, '');
  const sidekickUpdateStatus = settingsText(sidekickUpdateState.data?.state, 'idle');
  const sidekickUpdateAvailable = sidekickUpdateStatus === 'available';
  const pluginList = arrayFrom(pluginsState.data, ['plugins', 'items']);
  const providerOptions = useMemo(() => cloudProviderOptions(onboardingStatus), [onboardingStatus]);
  const fallbackState = useApiState(() => window.lastbrowser.sidekick.getFallbackModel(), [ready], ready);
  const fallbackModel = settingsText(fallbackState.data?.fallback_model?.model, '');

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
      await window.lastbrowser.sidekick.saveSettings({ settings: payload });
      const chosenModel = settingsText(payload.default_model, '').trim();
      if (chosenModel && chosenModel !== settingsText(settings.default_model, '').trim()) {
        await window.lastbrowser.sidekick.setDefaultModel({ model: chosenModel });
        await modelsState.refresh();
      }
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

  async function checkSidekickUpdate(): Promise<void> {
    setSidekickUpdateBusy(true);
    try {
      await window.lastbrowser.sidekickUpdate.check();
      await sidekickUpdateState.refresh();
    } catch (error) {
      showToast(`Sidekick check failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSidekickUpdateBusy(false);
    }
  }

  async function applySidekickUpdate(): Promise<void> {
    setSidekickUpdateBusy(true);
    try {
      const result = await window.lastbrowser.sidekickUpdate.apply();
      await sidekickUpdateState.refresh();
      const state = settingsText((result as AnyRecord)?.state, '');
      if (state === 'updated') {
        showToast('Sidekick updated — the runtime restarted with the new version.');
      } else {
        showToast(settingsText((result as AnyRecord)?.message, 'Sidekick update finished.'));
      }
    } catch (error) {
      showToast(`Sidekick update failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSidekickUpdateBusy(false);
    }
  }

  async function startProviderConnect(option: ProviderOption): Promise<void> {
    if (!option.oauthProvider) return;
    try {
      const response = await window.lastbrowser.sidekick.startOAuth({ provider: option.oauthProvider });
      if (response.error) throw new Error(String(response.error));
      const url = String(response.verification_uri || response.auth_url || '');
      if (response.status === 'success') {
        showToast(`${option.label} credentials found and connected.`);
        await modelsState.refresh();
        return;
      }
      if (!url) throw new Error('Sidekick returned no sign-in URL.');
      window.open(url, '_blank', 'noopener,noreferrer');
      showToast(`Sign in with ${option.label} in the opened browser tab.`);
    } catch (error) {
      showToast(`Connect failed: ${error instanceof Error ? error.message : String(error)}`);
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
                      <input value={settingsText(draft.bot_name ?? settings.bot_name, 'Nova')} onChange={(event) => updateDraftField('bot_name', event.target.value)} placeholder="Nova" />
                    </SettingsField>
                  </div>
                </SettingsCard>

                <SettingsCard
                  title="Fallback model"
                  description="Used automatically when the primary model hits a rate limit or quota. Without one, a rate-limited turn just fails."
                  action={fallbackModel ? <span className="settings-badge">active</span> : <span className="settings-badge">none</span>}
                >
                  <div className="settings-field-grid">
                    <SettingsField label="Fallback model" description="Leave on “None” to disable the fallback.">
                      <select
                        value={fallbackModel}
                        onChange={(event) => void saveFallbackModel(event.target.value)}
                        disabled={!ready || saving}
                      >
                        <option value="">None</option>
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
                  <p className="settings-hint">
                    A good fallback is a model on a different provider — e.g. an OpenRouter model when your
                    Google quota is exhausted.
                  </p>
                </SettingsCard>
              </>
            )}

            {section === 'appearance' && (
              <>
                <SettingsCard title="Modern Zen & Sidekick Layout (Variante B)" description="Konfiguration für die modulare Multi-Tier Seitenleiste und die In-Page Nova Action Bar.">
                  <div className="settings-modern-layout-config">
                    {/* Zen Exit Default Mode */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>Zen-Modus Aufwach-Standard (Ctrl+B)</strong>
                        <small>Bestimmt, ob beim Verlassen des Zen-Modus das kompakte Dock oder die volle Seitenleiste geöffnet wird.</small>
                      </div>
                      <div className="settings-segmented-group">
                        <button
                          type="button"
                          className={zenExitMode === 'slim' ? 'settings-seg-btn active' : 'settings-seg-btn'}
                          onClick={() => {
                            setZenExitModeState('slim');
                            usePanelStore.getState().setZenExitDefaultMode('slim');
                          }}
                        >
                          Kompaktes Dock (48px)
                        </button>
                        <button
                          type="button"
                          className={zenExitMode === 'expanded' ? 'settings-seg-btn active' : 'settings-seg-btn'}
                          onClick={() => {
                            setZenExitModeState('expanded');
                            usePanelStore.getState().setZenExitDefaultMode('expanded');
                          }}
                        >
                          Volle Leiste (240px)
                        </button>
                      </div>
                    </div>

                    {/* Action Bar Docking Preference */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>In-Page AI Action Bar Andockung</strong>
                        <small>Standard-Position der schwebenden Nova-Menüleiste im Browserfenster.</small>
                      </div>
                      <div className="settings-dock-buttons-row">
                        {[
                          { id: 'topbar', label: 'Topleiste (Icon + Ausklapper)' },
                          { id: 'sidebar', label: 'Seitenmenü' },
                          { id: 'bottom', label: 'Unten Mitte' },
                          { id: 'top-left', label: 'Oben Links' },
                          { id: 'top-right', label: 'Oben Rechts' },
                          { id: 'free', label: 'Frei schwebend' }
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
                  title="Nova Dock (Interaktive Leiste & Fisheye-Effekt)"
                  description="Wähle die Position des Docks (Unten, Oben, Links, Rechts oder frei Schwebend), passe die macOS-ähnliche Fisheye-Wellenvergrößerung und das automatische Ausblenden an."
                >
                  <div className="settings-modern-layout-config">
                    {/* 1-Klick-Presets */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>1-Klick-Presets</strong>
                        <small>Wähle eine vorkonfigurierte Nova-Dock-Einstellung für schnellen Start.</small>
                      </div>
                      <div className="settings-dock-buttons-row" style={{ flexWrap: 'wrap' }}>
                        {[
                          { id: 'bottom-dock', label: '🌟 Nova Dock Unten' },
                          { id: 'classic-left', label: '📐 Klassisch Links' },
                          { id: 'floating-widget', label: '🎈 Schwebendes Widget' },
                          { id: 'minimalist-autohide', label: '⚡ Minimalist (Auto-Hide)' }
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
                        <strong>Dock-Position</strong>
                        <small>Position der eingeklappten Nova-Leiste im Browserfenster.</small>
                      </div>
                      <div className="settings-segmented-group">
                        {[
                          { id: 'left', label: 'Links' },
                          { id: 'right', label: 'Rechts' },
                          { id: 'bottom', label: 'Unten' },
                          { id: 'top', label: 'Oben' },
                          { id: 'floating', label: 'Schwebend' }
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
                          <strong>Schwebend: Ausrichtung & Position</strong>
                          <small>Horizontale oder vertikale Ausrichtung des freischwebenden Docks.</small>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div className="settings-segmented-group">
                            <button
                              type="button"
                              className={dockSettings.orientation === 'horizontal' ? 'settings-seg-btn active' : 'settings-seg-btn'}
                              onClick={() => setDockSettings({ orientation: 'horizontal' })}
                            >
                              Horizontal
                            </button>
                            <button
                              type="button"
                              className={dockSettings.orientation === 'vertical' ? 'settings-seg-btn active' : 'settings-seg-btn'}
                              onClick={() => setDockSettings({ orientation: 'vertical' })}
                            >
                              Vertikal
                            </button>
                          </div>
                          <button
                            type="button"
                            className="secondary-action compact"
                            onClick={resetFloatingDockPos}
                            title="Setzt die Schwebeposition zurück"
                          >
                            <RotateCcw size={13} />
                            <span>Position zurücksetzen</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Auto-Hide Toggle */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>Automatisches Ausblenden (Auto-Hide)</strong>
                        <small>Das Dock verbirgt sich automatisch und erscheint bei Mouseover am Bildschirmrand.</small>
                      </div>
                      <div className="settings-segmented-group">
                        <button
                          type="button"
                          className={dockSettings.autoHide ? 'settings-seg-btn active' : 'settings-seg-btn'}
                          onClick={() => setDockSettings({ autoHide: true })}
                        >
                          Aktiviert
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
                        <strong>Einblend-Animation & Dauer</strong>
                        <small>Animationsstil und Geschwindigkeit beim Einblenden ({dockSettings.animationDuration}ms).</small>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div className="settings-segmented-group">
                          {[
                            { id: 'slide', label: 'Slide-in' },
                            { id: 'fade', label: 'Fade' },
                            { id: 'instant', label: 'Sofort' }
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
                          onChange={(e) => setDockSettings({ animationDuration: Number(e.target.value) })}
                          style={{ width: '110px' }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{dockSettings.animationDuration} ms</span>
                      </div>
                    </div>

                    {/* Fisheye Magnification Sliders */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>Fisheye-Vergrößerung (Fokus: {dockSettings.magnification}x, Nachbarn: {dockSettings.neighborScale}x)</strong>
                        <small>Stärke der Icon-Vergrößerung bei Mouseover (macOS Fisheye Wave).</small>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Fokus-Icon</label>
                          <input
                            type="range"
                            min="1.0"
                            max="2.0"
                            step="0.05"
                            value={dockSettings.magnification}
                            onChange={(e) => setDockSettings({ magnification: Number(e.target.value) })}
                            style={{ width: '100px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Nachbar-Icons</label>
                          <input
                            type="range"
                            min="1.0"
                            max="1.5"
                            step="0.05"
                            value={dockSettings.neighborScale}
                            onChange={(e) => setDockSettings({ neighborScale: Number(e.target.value) })}
                            style={{ width: '100px' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard title="Akzentfarben & Glassmorphism (Phase 13.8)" description="Wähle dein bevorzugtes Farbschema, den Unschärfe-Grad der Oberflächen und die visuelle Dichte.">
                  <div className="settings-modern-appearance-grid">
                    {/* Theme Accents */}
                    <div className="settings-field-row">
                      <div className="settings-field-info">
                        <strong>Farben-Akzent (Neon / Minimal)</strong>
                        <small>Steuert Primär-Highlights, Icons, Status-Glow und Cursor.</small>
                      </div>
                      <div className="settings-accent-palette">
                        {[
                          { id: 'neon-cyan', name: 'Neon Cyan', color: '#00d9ff' },
                          { id: 'electric-violet', name: 'Electric Violet', color: '#a855f7' },
                          { id: 'emerald-flow', name: 'Emerald Flow', color: '#10b981' },
                          { id: 'solar-amber', name: 'Solar Amber', color: '#f59e0b' },
                          { id: 'monochrome-slate', name: 'Monochrome Slate', color: '#94a3b8' }
                        ].map((acc) => (
                          <button
                            key={acc.id}
                            type="button"
                            className={`settings-accent-btn ${themeAccent === acc.id ? 'active' : ''}`}
                            onClick={() => usePanelStore.getState().setThemeAccent(acc.id as ThemeAccent)}
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
                        <strong>Glassmorphism & Frosted Blur</strong>
                        <small>Transparenz- und Blur-Effekte der Titelleiste, Seitenleiste und Drawer.</small>
                      </div>
                      <div className="settings-segmented-group">
                        {[
                          { id: 'solid', label: 'Solid (Opak)' },
                          { id: 'subtle', label: 'Subtil (8px)' },
                          { id: 'modern', label: 'Modern (16px)' },
                          { id: 'deep', label: 'Deep Glass (24px)' }
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
                        <strong>UI Dichte (Kompaktheit)</strong>
                        <small>Höhe der Navigation, Abstände in der Tab-Leiste und Icon-Raster.</small>
                      </div>
                      <div className="settings-segmented-group">
                        {[
                          { id: 'compact', label: 'Kompakt' },
                          { id: 'standard', label: 'Standard' },
                          { id: 'comfortable', label: 'Großzügig' }
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

                <SettingsCard title="Basis-Theme" description="Wähle das grundlegende Farbschema für Browser und Oberfläche.">
                  <div className="settings-theme-grid">
                    <button
                      type="button"
                      className={settingsText(draft.theme ?? settings.theme, 'dark') === 'dark' ? 'settings-theme-btn active' : 'settings-theme-btn'}
                      onClick={() => updateDraftField('theme', 'dark')}
                    >
                      <span className="settings-theme-preview settings-theme-preview-dark" />
                      <strong>Dark</strong>
                      <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>Navy / Slate</span>
                    </button>
                    <button
                      type="button"
                      className={settingsText(draft.theme ?? settings.theme, 'dark') === 'light' ? 'settings-theme-btn active' : 'settings-theme-btn'}
                      onClick={() => updateDraftField('theme', 'light')}
                    >
                      <span className="settings-theme-preview settings-theme-preview-light" />
                      <strong>Light</strong>
                      <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>Klar & Hell</span>
                    </button>
                    <button
                      type="button"
                      className={settingsText(draft.theme ?? settings.theme, 'dark') === 'oled' ? 'settings-theme-btn active' : 'settings-theme-btn'}
                      onClick={() => updateDraftField('theme', 'oled')}
                    >
                      <span className="settings-theme-preview" style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.3)' }} />
                      <strong>OLED</strong>
                      <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>Pitch Black #000</span>
                    </button>
                    <button
                      type="button"
                      className={settingsText(draft.theme ?? settings.theme, 'dark') === 'system' ? 'settings-theme-btn active' : 'settings-theme-btn'}
                      onClick={() => updateDraftField('theme', 'system')}
                    >
                      <span className="settings-theme-preview settings-theme-preview-system" />
                      <strong>System</strong>
                      <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>Auto (OS)</span>
                    </button>
                  </div>
                </SettingsCard>

                <SettingsCard title="Akzentfarbe & Skins" description="Wähle eine kuratierte Farbpalette oder bestimme eine freie Akzentfarbe.">
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
                        title="Eigene Akzentfarbe wählen"
                      />
                      <div>
                        <strong style={{ display: 'block', fontSize: 13 }}>Benutzerdefinierte Akzentfarbe</strong>
                        <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>Dynamische Berechnung von Glow-, Hover- und Kontrastwerten</span>
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
                        Aktivieren
                      </button>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard title="Typografie & Seitenzoom" description="UI-Schriftgröße der Oberfläche und Standard-Zoom für Webseiten-Inhalte.">
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--lb-text)' }}>
                      UI-Schriftgröße (Oberfläche & Chat)
                    </label>
                    <div className="settings-size-grid">
                      {[
                        ['small', 'Klein (88%)'],
                        ['default', 'Standard (100%)'],
                        ['large', 'Groß (115%)'],
                        ['xlarge', 'Sehr groß (130%)']
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
                        <strong style={{ display: 'block', fontSize: 13 }}>Standard-Seitenzoom</strong>
                        <span style={{ fontSize: 11, color: 'var(--lb-muted)' }}>Basis-Zoom für neue Webseiten (gespeicherte Domain-Zooms bleiben erhalten)</span>
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
                          title="Auf 100% zurücksetzen"
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
                      <span>100% (Standard)</span>
                      <span>125%</span>
                      <span>150%</span>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard title="Nachrichten-Layout (Copilot & Chat)" description="Visuelle Darstellungsform für KI-Antworten und Dialoge.">
                  <div className="settings-layout-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
                    {[
                      { key: 'bubbles', title: 'Sprechblasen', desc: 'Klassische Chat-Karten mit abgerundeten Ecken und Avataren', icon: '💬' },
                      { key: 'compact', title: 'Kompakter Stream', desc: 'Flacher, dichter Textfluss im Terminal-/Slack-Stil', icon: '📄' },
                      { key: 'expanded', title: 'Dokumenten-Canvas', desc: 'Großzügiges Lese-Layout über die volle Breite', icon: '📖' }
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

                  <SettingsField label="Syntax-Highlighting Theme" description="Codeblock-Farbschema für Transkripte und Vorschauen.">
                    <select value={settingsText(draft.syntax_theme ?? settings.syntax_theme, '')} onChange={(event) => updateDraftField('syntax_theme', event.target.value)}>
                      <option value="">Standard (Theme-spezifisch)</option>
                      <option value="tomorrow-night">Tomorrow Night</option>
                      <option value="one-dark">One Dark</option>
                      <option value="github-light">GitHub Light</option>
                    </select>
                  </SettingsField>
                </SettingsCard>

                {dirty && (
                  <div className="settings-floating-action-bar" style={{ position: 'sticky', bottom: 12, zIndex: 10, padding: '10px 16px', borderRadius: 10, background: 'var(--lb-surface-strong)', border: '1px solid var(--accent-primary)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="status-dot" style={{ background: 'var(--accent-primary)' }} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>Live-Vorschau aktiv (Änderungen ungespeichert)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button type="button" className="secondary-action compact" onClick={() => void restoreDraft()} disabled={!ready || !dirty}>
                        Zurücksetzen
                      </button>
                      <button type="button" className="primary-action compact" onClick={() => void save()} disabled={!ready || saving || !dirty} style={{ background: 'var(--accent-primary)', color: 'var(--accent-text, #ffffff)' }}>
                        {saving ? 'Speichert...' : 'Einstellungen speichern'}
                      </button>
                    </div>
                  </div>
                )}

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
                <SettingsCard
                  title="Search engine"
                  description="Used when you type a search term into the address bar instead of a URL."
                >
                  <div className="settings-field-grid">
                    <SettingsField label="Engine" description="Applies to new searches immediately.">
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
                  title="Default browser"
                  description="Use Lastbrowser as your default application for opening web links and HTML documents."
                >
                  <div className="settings-field-grid">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '16px' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                          {defaultBrowserStatus === true
                            ? '✓ Lastbrowser ist aktuell als Standard-Browser eingerichtet.'
                            : defaultBrowserStatus === false
                            ? 'Lastbrowser ist noch nicht als Standard-Browser eingerichtet.'
                            : 'Status wird überprüft...'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={handleSetDefaultBrowser}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                      >
                        <ExternalLink size={14} />
                        {defaultBrowserStatus === true ? 'Windows-Einstellungen öffnen' : 'Als Standard festlegen'}
                      </button>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard
                  title="Browsing data & cache"
                  description="Clear temporary HTTP cache, cookies, and local web storage across all browser sessions."
                >
                  <div className="settings-field-grid">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '16px' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                          Löscht Netzwerk-Cache und Cookies zur Einhaltung der Privatsphäre (Policy 10.2).
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={async () => {
                          if (window.confirm('Möchtest du Cache und Cookies wirklich bereinigen?')) {
                            try {
                              await window.lastbrowser?.browser?.clearData?.({ cache: true, cookies: true, storage: true });
                              showToast('Cache und Browserdaten erfolgreich gelöscht');
                            } catch {
                              showToast('Fehler beim Bereinigen der Browserdaten');
                            }
                          }
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                      >
                        <Trash2 size={14} />
                        Daten jetzt bereinigen
                      </button>
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard title="Defaults" description="Language and chat behavior.">
                  <div className="settings-field-grid">
                    <SettingsField label="Language" description="User-facing UI language.">
                      <select
                        value={settingsText(draft.language ?? settings.language, 'en')}
                        onChange={(event) => {
                          updateDraftField('language', event.target.value);
                          // Sofortiger Sprachswitch ohne Save
                          void window.lastbrowser?.i18n?.setLocale?.(event.target.value).catch(() => {});
                        }}
                      >
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
                {/* === Accessibility Card === */}
                <SettingsCard title="Barrierefreiheit" description="Hilfsmittel für barrierefreies Arbeiten: Hoher Kontrast, Dyslexie-Schrift, UI-Zoom und Fokus-Ringe.">
                  <div className="settings-field-grid">
                    <SettingsToggle
                      label="Hoher Kontrast"
                      description="Maximiert Lesbarkeit mit weißem Text auf schwarzem Hintergrund (WCAG ≥ 7:1)."
                      checked={usePanelStore.getState().a11yHighContrast}
                      onChange={(val) => { usePanelStore.getState().setA11yHighContrast(val); }}
                    />
                    <SettingsToggle
                      label="Dyslexie-Schrift"
                      description="Wechselt zur lesefreundlichen OpenDyslexic-Schriftart."
                      checked={usePanelStore.getState().a11yDyslexicFont}
                      onChange={(val) => { usePanelStore.getState().setA11yDyslexicFont(val); }}
                    />
                    <SettingsField label="Mindestschriftgröße" description="Verhindert, dass Text unter die gewählte Größe fällt.">
                      <select
                        value={String(usePanelStore.getState().a11yMinFontSize)}
                        onChange={(e) => { usePanelStore.getState().setA11yMinFontSize(Number(e.target.value)); }}
                      >
                        <option value="0">Aus (Standard)</option>
                        <option value="14">14px</option>
                        <option value="16">16px</option>
                        <option value="18">18px</option>
                        <option value="20">20px</option>
                      </select>
                    </SettingsField>
                    <SettingsField
                      label={`UI-Zoom: ${usePanelStore.getState().a11yUiZoom}%`}
                      description="Skaliert die gesamte Oberfläche. Standard: 100 %."
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="range"
                          min={80}
                          max={150}
                          step={5}
                          value={usePanelStore.getState().a11yUiZoom}
                          onChange={(e) => { usePanelStore.getState().setA11yUiZoom(Number(e.target.value)); }}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => { usePanelStore.getState().setA11yUiZoom(100); }}
                          style={{ fontSize: 11, padding: '2px 8px' }}
                        >
                          Reset
                        </button>
                      </div>
                    </SettingsField>
                    <SettingsToggle
                      label="Fokus-Ringe"
                      description="Zeigt deutliche gelbe Fokus-Ringe für Tastatur-Navigation (WCAG AA)."
                      checked={usePanelStore.getState().a11yFocusRings}
                      onChange={(val) => { usePanelStore.getState().setA11yFocusRings(val); }}
                    />
                  </div>
                </SettingsCard>
              </>
            )}


            {section === 'providers' && (
              <>
                <SettingsCard
                  title="Connected providers"
                  description="Which providers Sidekick can use, and how to sign in."
                  action={<span className="settings-badge">{activeProvider || 'No active provider'}</span>}
                >
                  {modelsState.loading && <EmptyState icon={<Loader2 size={16} className="spin" />} label="Loading providers…" />}
                  {modelsState.error && <div className="workspace-error">{modelsState.error}</div>}
                  {!modelsState.loading && !modelsState.error && (
                    <div className="provider-status-list">
                      {providerOptions.map((option) => {
                        const meta = providerPresentation(option.id);
                        const isActive = option.id === activeProvider;
                        return (
                          <div key={option.id} className={`provider-status-row ${isActive ? 'active' : ''}`}>
                            <span className="provider-mark" style={{ background: meta.color }}>{meta.mark}</span>
                            <span className="provider-copy">
                              <strong>{option.label}</strong>
                              <small>{meta.description}</small>
                            </span>
                            {isActive && <span className="provider-badge">active</span>}
                            {option.oauthProvider && (
                              <button
                                type="button"
                                className="secondary-action compact"
                                onClick={() => void startProviderConnect(option)}
                                disabled={!ready}
                              >
                                <LogIn size={14} />
                                <span>Connect</span>
                              </button>
                            )}
                            {!isActive && (['ollama', 'ollama-cloud'].includes(option.id) ? (
                              <button
                                type="button"
                                className="secondary-action compact"
                                onClick={() => {
                                  setOllamaModalProviderId(option.id);
                                  setOllamaModalLabel(option.label || option.id);
                                  setOllamaUrl(settingsText(settings.base_url, option.id === 'ollama' ? 'http://localhost:11434' : ''));
                                  setOllamaKey(settingsText(settings.api_key, ''));
                                  setOllamaTestResult('');
                                }}
                                disabled={!ready || saving}
                              >
                                <Settings size={14} />
                                <span>Configure</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="secondary-action compact"
                                onClick={() => void switchProvider(option.id)}
                                disabled={!ready || saving}
                              >
                                <span>Use</span>
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SettingsCard>

                {/* Ollama Config Modal */}
                {ollamaModalProviderId && (
                  <div className="settings-modal-overlay" onClick={() => setOllamaModalProviderId(null)}>
                    <div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
                      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Configure {ollamaModalLabel}</h3>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Base URL</label>
                      <input
                        type="url"
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        placeholder="http://localhost:11434"
                        style={{ width: '100%', marginBottom: 8 }}
                      />
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>API Key (optional)</label>
                      <input
                        type="password"
                        value={ollamaKey}
                        onChange={(e) => setOllamaKey(e.target.value)}
                        placeholder="Leave empty for local Ollama"
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
                            setOllamaTestResult('Testing…');
                            try {
                              const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000) });
                              if (res.ok) setOllamaTestResult('✓ Connected — Ollama is reachable');
                              else setOllamaTestResult(`✗ HTTP ${res.status}`);
                            } catch (err) {
                              setOllamaTestResult(`✗ ${err instanceof Error ? err.message : String(err)}`);
                            }
                          }}
                        >
                          Test Connection
                        </button>
                        <button type="button" className="secondary-action compact" onClick={() => setOllamaModalProviderId(null)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="primary-action compact"
                          disabled={!ollamaUrl.trim() || saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              await window.lastbrowser.sidekick.saveSettings({
                                settings: {
                                  ...cleanSettingsPayload(settings),
                                  provider: ollamaModalProviderId,
                                  base_url: ollamaUrl.trim(),
                                  ...(ollamaKey.trim() ? { api_key: ollamaKey.trim() } : {})
                                }
                              });
                              await settingsState.refresh();
                              await modelsState.refresh();
                              showToast(`Ollama provider set. URL: ${ollamaUrl.trim()}`);
                              setOllamaModalProviderId(null);
                            } catch (error) {
                              showToast(`Could not configure Ollama: ${error instanceof Error ? error.message : String(error)}`);
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Save & Activate
                        </button>
                      </div>
                    </div>
                  </div>
                )}

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

                <SettingsCard title="Advanced provider routing" description="Raw identifiers — only change these if you know the backend expects them.">
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

                <SettingsCard
                  title="Google Accounts & Round-Robin"
                  description="Multi-account OAuth connections for Google Gemini CLI / Antigravity with balanced token usage."
                >
                  <GeminiAccountsPanel sidekickReady={ready} />
                </SettingsCard>
              </>
            )}

            {section === 'google-accounts' && (
              <SettingsCard
                title="Google Accounts & Round-Robin"
                description="Connect multiple Google accounts to balance Gemini API / CLI token usage across accounts with round-robin rotation."
              >
                <GeminiAccountsPanel sidekickReady={ready} />
              </SettingsCard>
            )}

            {(section === 'extensions' || section === 'plugins') && (
              <>
                <ExtensionsSettingsSection />
                <SettingsCard title="Connected apps & Plugins" description="Installed app integrations and plugin inventory.">
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
                <DoctorDashboard onReopenSetup={onReopenSetup} />

                <SettingsCard
                  title="Setup assistant"
                  description="Reopen the first-run wizard to change providers, sign in again, or review the model options."
                >
                  <div className="settings-system-actions">
                    <button
                      type="button"
                      className="secondary-action compact"
                      onClick={onReopenSetup}
                    >
                      <Sparkles size={15} />
                      <span>Open setup assistant</span>
                    </button>
                  </div>
                  <p className="settings-hint">
                    The assistant walks through provider sign-in and model choice. It does not change
                    anything until you confirm.
                  </p>
                </SettingsCard>

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

                <SettingsCard
                  title="Sidekick runtime"
                  description="Sidekick ships with Lastbrowser but updates independently — no Lastbrowser release needed."
                >
                  <div className="settings-system-status">
                    <span className="settings-badge">
                      Version: {sidekickUpdateVersion || 'unknown'}
                    </span>
                    <span className="settings-badge">
                      Source: {sidekickUpdateSource === 'runtime' ? 'updated copy' : 'bundled'}
                    </span>
                    {sidekickUpdateStatus !== 'idle' && (
                      <span className={`settings-badge ${sidekickUpdateStatus === 'error' ? 'warning' : ''}`}>
                        {sidekickUpdateStatus}
                      </span>
                    )}
                    {sidekickUpdateMessage && <span className="settings-badge">{sidekickUpdateMessage}</span>}
                  </div>
                  <div className="settings-system-actions">
                    <button
                      type="button"
                      className="secondary-action compact"
                      onClick={() => void checkSidekickUpdate()}
                      disabled={sidekickUpdateBusy}
                    >
                      {sidekickUpdateBusy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                      <span>Check Sidekick</span>
                    </button>
                    <button
                      type="button"
                      className="secondary-action compact"
                      onClick={() => void applySidekickUpdate()}
                      disabled={sidekickUpdateBusy || !sidekickUpdateAvailable}
                    >
                      <Download size={15} />
                      <span>Update Sidekick</span>
                    </button>
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
