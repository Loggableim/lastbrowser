/**
 * First-run setup assistant for Lastbrowser.
 *
 * Provides a modern, immersive full-screen onboarding experience that explains
 * the available AI engines and recommends the best setup options:
 *   1. Google Gemini API (separate API-key access)
 *   2. ChatGPT / OpenAI via Codex (Popular, connects existing subscription without API costs)
 *   3. Ollama (100% local, private, offline, no data leaves the PC)
 *   4. Cloud API Keys (OpenRouter, DeepSeek, Claude, OpenAI for power users)
 */

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Cpu,
  Download,
  ExternalLink,
  FileUp,
  Globe,
  HardDrive,
  Key,
  Loader2,
  LogIn,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
  X
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import { importBookmarksFromHtml, importBookmarksFromJson, mergeBookmarks } from '../bookmark-io.js';
import { loadBookmarks, saveBookmarks } from '../bookmarks.js';
import { loadVisitedSites, saveVisitedSites, recordVisit } from '../history.js';
import { usePinnedAppStore, PRESET_PINNED_APPS } from '../stores/usePinnedAppStore.js';
import {
  modelNote,
  providerPresentation,
  tierLabels,
  PROVIDER_RECOMMENDATIONS,
  PERSONALITY_PROFILES,
  BOT_NAME_PRESETS,
  type PersonalityProfile
} from '../provider-presentation.js';
import { useDesktopI18n } from '../i18n.js';
import { localizedProviderRecommendation } from '../i18n/provider-recommendations.js';
import { localizedProviderDescription } from '../i18n/provider-descriptions.js';
import { providerVerification } from '../provider-verification.js';
import { clearProviderChatEvidence, getProviderChatEvidence, isProviderModelQualified } from '../provider-chat-evidence.js';
import { useShowUntestedProviderBetas } from '../provider-beta-preferences.js';
import { ProviderBetaCatalogToggle } from './ProviderBetaCatalogToggle.js';
import { LocalAiSetupPane } from './LocalAiSetupPane.js';
import {
  OnboardingStatus,
  canSubmitCloudSetup,
  cloudProviderOptions,
  firstRunStatus,
  openProviderOAuthUrl,
  type FirstRunAiChoice,
  type ProviderOption
} from '../setup-state.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;

export type SetupForm = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  botName: string;
  personality: string;
  defaultBrowser?: boolean;
  importedBookmarksCount?: number;
};

export const BROWSER_CHOICES = [
  { id: 'chrome', name: 'Google Chrome', color: '#4285F4', icon: '🌐', hint: 'Lesezeichen, Verlauf & Favoriten' },
  { id: 'edge', name: 'Microsoft Edge', color: '#0078D7', icon: '🌊', hint: 'Favoriten & Browser-Chronik' },
  { id: 'firefox', name: 'Mozilla Firefox', color: '#FF7139', icon: '🦊', hint: 'Lesezeichen & Chronik' },
  { id: 'brave', name: 'Brave Browser', color: '#FB542B', icon: '🦁', hint: 'Shields & Bookmarks' }
];

type CodexOAuthState = {
  status: 'idle' | 'starting' | 'pending' | 'success' | 'expired' | 'cancelled' | 'error';
  flowId?: string;
  verificationUri?: string;
  userCode?: string;
  pollIntervalSeconds?: number;
  message?: string;
  actionRequired?: string;
};

export type FirstRunSetupPaneProps = {
  browserProfileId?:string;
  workspacePath?:string;
  backendProfileName?:string|null;
  aiChoice:FirstRunAiChoice|null;
  status: ServiceStatus | null;
  onboardingStatus: OnboardingStatus | null;
  setupLoading: boolean;
  error: string;
  saving: boolean;
  onRefreshOnboarding: () => Promise<void>;
  onChooseAi: (choice:FirstRunAiChoice) => Promise<boolean>;
  onCompleteBrowserSetup: () => Promise<boolean>;
  onSubmit: (form: SetupForm) => Promise<void>;
  onDismiss: () => void;
};

const idleCodexOAuth: CodexOAuthState = { status: 'idle' };

export function FirstRunSetupPane({
  browserProfileId,
  workspacePath='',
  backendProfileName,
  aiChoice,
  status,
  onboardingStatus,
  setupLoading,
  error,
  saving,
  onRefreshOnboarding,
  onChooseAi,
  onCompleteBrowserSetup,
  onSubmit,
  onDismiss
}: FirstRunSetupPaneProps): React.JSX.Element {
  const { locale, t } = useDesktopI18n();
  const showUntestedBetas = useShowUntestedProviderBetas();
  const [flowError, setFlowError] = useState('');
  const providers = cloudProviderOptions(onboardingStatus);
  const [liveProviderModels, setLiveProviderModels] = useState<Record<string, Array<{ id: string; label: string }>>>({});
  const [modelProbeLoading, setModelProbeLoading] = useState(false);
  const [modelProbeError, setModelProbeError] = useState('');
  // A provider is a default only after an exact successful chat in this profile
  // and the current app session. Otherwise the empty choice is intentional.
  const evidenceStorage = typeof window === 'undefined' ? undefined : window.localStorage;
  const qualifiedProviders = providers.filter(item => Boolean(browserProfileId && evidenceStorage
    && getProviderChatEvidence(item.id, browserProfileId, backendProfileName || 'default', evidenceStorage)));
  const defaultProviderId = qualifiedProviders.some((p) => p.id === 'openai-codex')
    ? 'openai-codex'
    : (qualifiedProviders[0]?.id || '');

  const [provider, setProvider] = useState<string>(defaultProviderId);
  const providerModelOptions = useMemo(() => {
    const catalog = liveProviderModels[provider] ?? [];
    return showUntestedBetas || !browserProfileId ? catalog
      : catalog.filter(item => isProviderModelQualified(provider, item.id, browserProfileId, backendProfileName || 'default', window.localStorage));
  }, [liveProviderModels, provider, showUntestedBetas, browserProfileId]);
  const models = providerModelOptions;
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [oauthState, setOAuthState] = useState<CodexOAuthState>(idleCodexOAuth);

  // Identity & Personality state
  const [botName, setBotName] = useState<string>('Nova');
  const [personality, setPersonality] = useState<string>('nova');

  // Setup mode tab: featured recommendations vs API-key providers.
  const [activeTab, setActiveTab] = useState<'featured' | 'custom'>('featured');
  const [baseUrl, setBaseUrl] = useState<string>('');

  // Standalone Sidekick install migration (first-run assistant).
  const [standaloneReport, setStandaloneReport] = useState<{
    found: boolean;
    homeDir?: string;
    components: { spaces: boolean; supermemory: boolean; profiles: boolean; config: boolean };
  } | null>(null);
  const [migrateItems, setMigrateItems] = useState({ spaces: true, supermemory: true, profiles: true });
  const [migrationState, setMigrationState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [migrationResult, setMigrationResult] = useState<{ copied: string[]; skipped: string[]; errors: string[] } | null>(null);

  const readiness = firstRunStatus(status, onboardingStatus);
  const canSubmit = canSubmitCloudSetup(readiness);
  const activeProviderOption = providers.find((item) => item.id === provider);
  const visibleProviders = showUntestedBetas ? providers : qualifiedProviders;

  const oauthProviderId = activeProviderOption?.oauthProvider || '';
  const oauthAlreadyReady = Boolean(oauthProviderId)
    && onboardingStatus?.system?.chat_ready === true
    && String(onboardingStatus.system.current_provider || '').toLowerCase() === oauthProviderId;
  const oauthNeedsLogin = Boolean(oauthProviderId) && oauthState.status !== 'success' && !oauthAlreadyReady;
  // Anthropic supports both linking an existing Claude Code session and
  // entering a regular Anthropic API key. Either credential path is valid.
  const oauthLoginReady = !oauthNeedsLogin || (provider === 'anthropic' && Boolean(apiKey.trim()));
  const providerModelsReady = !['google-gemini-cli', 'openai-codex'].includes(provider) || models.length > 0;
  const keyRequired = Boolean(activeProviderOption && !activeProviderOption.oauthProvider && !activeProviderOption.keyOptional);
  const credentialsReady = !keyRequired || Boolean(apiKey.trim());
  const canSubmitForm = canSubmit && oauthLoginReady && providerModelsReady && credentialsReady && Boolean(model);

  const chooseAi = async (choice: FirstRunAiChoice) => {
    setFlowError('');
    if (!await onChooseAi(choice)) setFlowError(t('firstRun.aiChoiceSaveError'));
  };
  const completeBrowserSetup = async () => {
    setFlowError('');
    if (!await onCompleteBrowserSetup()) setFlowError(t('firstRun.browserSetupSaveError'));
  };

  useEffect(() => {
    if (!providers.some((item) => item.id === provider) && providers[0]) {
      setProvider(providers[0].id);
    }
  }, [provider, providers]);

  useEffect(() => {
    setModel((current) => models.some((item) => item.id === current) ? current : (models[0]?.id || ''));
  }, [models]);

  useEffect(() => {
    if (!oauthProviderId && oauthState.status !== 'idle') {
      setOAuthState(idleCodexOAuth);
    }
  }, [oauthProviderId, oauthState.status]);

  // Detect an existing standalone Sidekick installation once on mount.
  useEffect(() => {
    let cancelled = false;
    const detect = async () => {
      try {
        const report = await window.lastbrowser?.sidekick?.detectExistingInstall?.();
        if (!cancelled && report?.found) setStandaloneReport(report);
      } catch {
        // Detection is best-effort; the wizard works fine without migration.
      }
    };
    void detect();
    return () => { cancelled = true; };
  }, []);

  const runStandaloneMigration = useCallback(async () => {
    if (!standaloneReport?.homeDir) return;
    setMigrationState('running');
    setMigrationResult(null);
    try {
      const result = await window.lastbrowser?.sidekick?.migrateStandalone?.({
        source_home: standaloneReport.homeDir,
        items: migrateItems
      });
      setMigrationResult(result ?? { copied: [], skipped: [], errors: ['No response from migration service.'] });
      setMigrationState((result?.errors?.length ?? 0) > 0 ? 'error' : 'done');
    } catch (error) {
      setMigrationResult({ copied: [], skipped: [], errors: [error instanceof Error ? error.message : String(error)] });
      setMigrationState('error');
    }
  }, [standaloneReport?.homeDir, migrateItems]);

  const selectProvider = useCallback((nextProvider: string) => {
    setProvider(nextProvider);
    setModel('');
    setApiKey('');
    setOAuthState(idleCodexOAuth);
    if (['google-gemini-cli', 'openai-codex'].includes(nextProvider)) {
      setActiveTab('featured');
    } else if (nextProvider === 'ollama') {
      setActiveTab('featured');
    } else {
      setActiveTab('custom');
    }
  }, []);

  const loadLiveModels = useCallback(async () => {
    if (aiChoice !== 'enabled') return;
    if (!['openrouter', 'alibaba', 'anthropic', 'openai', 'deepseek', 'gemini'].includes(provider)) return;
    if (!apiKey.trim()) return;
    setModelProbeLoading(true);
    setModelProbeError('');
    try {
      const response = await window.lastbrowser.sidekick.requestWebui({
        method: 'POST',
        path: '/api/models/probe',
        body: { provider, api_key: apiKey.trim(), ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}) }
      }) as { models?: Array<Record<string, unknown>>; error?: string };
      const models = (response?.models || []).map((item) => {
        const id = String(item.id || item.name || '').trim();
        return id ? { id, label: String(item.label || item.name || id) } : null;
      }).filter((item): item is { id: string; label: string } => Boolean(item));
      if (models.length) {
        setLiveProviderModels((current) => ({ ...current, [provider]: models }));
        setModel((current) => models.some((item) => item.id === current) ? current : models[0].id);
      } else {
        setModelProbeError(response?.error || 'Dieser Schlüssel hat keine verfügbaren Modelle zurückgegeben.');
      }
    } catch (error) {
      setModelProbeError(error instanceof Error ? error.message : 'Modelle konnten nicht geladen werden.');
    } finally {
      setModelProbeLoading(false);
    }
  }, [aiChoice, apiKey, baseUrl, provider]);

  useEffect(() => {
    void loadLiveModels();
  }, [loadLiveModels]);

  // OAuth polling
  useEffect(() => {
    if (!oauthProviderId || oauthState.status !== 'pending' || !oauthState.flowId) return;
    let cancelled = false;
    let timer = 0;
    let transientFailures = 0;
    const poll = async (): Promise<void> => {
      try {
        const response = await window.lastbrowser.sidekick.pollOAuth(oauthState.flowId || '');
        if (cancelled) return;
        const nextStatus = String(response.status || 'error') as CodexOAuthState['status'];
        if (nextStatus === 'pending') {
          transientFailures = 0;
          setOAuthState((current) => ({
            ...current,
            status: 'pending',
            message: `Warte auf Freigabe von ${activeProviderOption?.label || 'Provider'}...`
          }));
          timer = window.setTimeout(() => void poll(), Math.max(1200, (oauthState.pollIntervalSeconds || 3) * 1000));
          return;
        }
        if (nextStatus === 'success') {
          setOAuthState((current) => ({
            ...current,
            status: 'success',
            message: `${activeProviderOption?.label || 'Provider'} erfolgreich verbunden.`
          }));
          await onRefreshOnboarding();
          await activateProviderAfterLogin();
          return;
        }
        setOAuthState((current) => ({
          ...current,
          status: nextStatus,
          message: response.error || 'Der Anmeldevorgang wurde vorzeitig beendet.'
        }));
      } catch (pollError) {
        if (cancelled) return;
        setOAuthState((current) => ({
          ...current,
          status: 'pending',
          message: `Verbindung kurz unterbrochen; erneuter Versuch läuft. (${pollError instanceof Error ? pollError.message : String(pollError)})`
        }));
        transientFailures += 1;
        timer = window.setTimeout(() => void poll(), Math.min(15000, Math.max(3000, 1000 * 2 ** Math.min(transientFailures, 4))));
      }
    };
    timer = window.setTimeout(() => void poll(), Math.max(1200, (oauthState.pollIntervalSeconds || 3) * 1000));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [oauthProviderId, activeProviderOption?.label, oauthState.flowId, oauthState.pollIntervalSeconds, oauthState.status, onRefreshOnboarding]);

  async function startProviderLogin(): Promise<void> {
    if (!oauthProviderId) return;
    if (oauthProviderId === 'google-gemini-cli') {
      setOAuthState({
        status: 'error',
        message: t('settings.panels.providers.geminiSubscriptionMigration')
      });
      return;
    }
    clearProviderChatEvidence(provider, window.localStorage);
    const providerLabel = activeProviderOption?.label || 'Provider';
    setOAuthState({ status: 'starting', message: t('firstRun.startingLogin', { provider: providerLabel }) });
    try {
      const response = await window.lastbrowser.sidekick.startOAuth({ provider: oauthProviderId });
      if (response.error) throw new Error(response.error);
      const flowId = String(response.flow_id || '');

      if (response.status === 'success') {
        setOAuthState({
          status: 'success',
          flowId,
          message: t('firstRun.oauthSuccess', { provider: providerLabel })
        });
        await onRefreshOnboarding();
        await activateProviderAfterLogin();
        return;
      }

      const verificationUri = String(response.verification_uri || response.auth_url || '');
      const userCode = String(response.user_code || '');
      if (!flowId || !verificationUri) throw new Error('Sidekick lieferte einen unvollständigen Anmelde-Flow.');

      setOAuthState({
        status: 'pending',
        flowId,
        verificationUri,
        userCode,
        pollIntervalSeconds: Number(response.poll_interval_seconds || 3),
        actionRequired: typeof response.action_required === 'string' ? response.action_required : undefined,
        message: response.action_required
          ? String(response.action_required)
          : userCode
            ? t('firstRun.oauthPromptCode', { provider: providerLabel })
            : oauthProviderId === 'google-gemini-cli'
              ? t('firstRun.oauthPromptSystemBrowser')
              : t('firstRun.oauthPromptWindow', { provider: providerLabel })
      });

      if (oauthProviderId === 'anthropic') {
        // This provider links credentials from the host's Claude Code CLI; it
        // does not provide a browser OAuth URL in this flow.
        return;
      }
      const opened = await openProviderOAuthUrl(oauthProviderId, verificationUri, {
        openExternal: window.lastbrowser?.system?.openExternal,
        openConnectWindow: window.lastbrowser?.auth?.openConnectWindow,
        openWindow: (url) => { window.open(url, '_blank', 'noopener,noreferrer'); }
      }).catch(() => false);
      if (oauthProviderId === 'google-gemini-cli') {
        // Google blocks OAuth inside embedded Electron/WebView windows.
        // Always use the OS browser for the Gemini CLI / Code Assist flow.
        if (!opened) {
          setOAuthState((current) => ({
            ...current,
            message: t('firstRun.oauthPromptSystemBrowser')
          }));
        }
      }
    } catch (loginError) {
      setOAuthState({
        status: 'error',
        message: loginError instanceof Error ? loginError.message : String(loginError)
      });
    }
  }

  async function activateProviderAfterLogin(): Promise<void> {
    if (!provider) return;
    try {
      const modelToUse = model || models[0]?.id || '';
      await window.lastbrowser.sidekick.applyCloudSetup({
        provider,
        model: modelToUse,
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        confirmOverwrite: true
      });
      await onRefreshOnboarding();
    } catch {
      // Setup completion will retry or notify
    }
  }

  async function cancelCodexLogin(): Promise<void> {
    const flowId = oauthState.flowId;
    setOAuthState({ status: 'cancelled', message: 'Anmeldung abgebrochen.' });
    if (flowId) {
      await window.lastbrowser.sidekick.cancelOAuth({ flowId, provider: oauthProviderId || 'openai-codex' }).catch(() => null);
    }
  }

  function copyCodexCode(): void {
    if (!oauthState.userCode) return;
    void navigator.clipboard?.writeText(oauthState.userCode);
  }

  // Browser import state
  const [selectedBrowser, setSelectedBrowser] = useState<string>('chrome');
  const [importBookmarksChecked, setImportBookmarksChecked] = useState<boolean>(true);
  const [importHistoryChecked, setImportHistoryChecked] = useState<boolean>(true);
  const [importSearchChecked, setImportSearchChecked] = useState<boolean>(false);
  const [importedBookmarksCount, setImportedBookmarksCount] = useState<number>(0);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Pinned Apps state
  const currentPinnedApps = usePinnedAppStore((state) => state.apps);
  const setPinnedApps = usePinnedAppStore((state) => state.setApps);
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>(() =>
    currentPinnedApps.length > 0
      ? currentPinnedApps.map((a) => a.id)
      : ['notion', 'figma', 'slack', 'github', 'chatgpt', 'youtube', 'terminal', 'spotify']
  );

  // Default browser state
  const [isDefaultBrowser, setIsDefaultBrowser] = useState<boolean | null>(null);
  const [defaultBrowserDone, setDefaultBrowserDone] = useState(false);
  const [defaultBrowserLoading, setDefaultBrowserLoading] = useState(false);

  useEffect(() => {
    void window.lastbrowser?.system?.isDefaultBrowser?.().then((isDef) => {
      if (typeof isDef === 'boolean') {
        setIsDefaultBrowser(isDef);
      }
    }).catch(() => null);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = file.name.endsWith('.json')
        ? importBookmarksFromJson(text)
        : importBookmarksFromHtml(text);
      if (imported.length > 0) {
        const existing = loadBookmarks();
        const merged = mergeBookmarks(existing, imported);
        saveBookmarks(window.localStorage, merged);
        setImportedBookmarksCount(imported.length);
        setImportSuccessMsg(`${imported.length} Lesezeichen erfolgreich importiert!`);
      } else {
        setImportSuccessMsg('Keine gültigen Lesezeichen in der Datei gefunden.');
      }
    } catch (err) {
      console.error('Failed to import bookmarks', err);
      setImportSuccessMsg('Fehler beim Einlesen der Lesezeichendatei.');
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleQuickImport = () => {
    const browser = BROWSER_CHOICES.find((b) => b.id === selectedBrowser);
    if (importHistoryChecked) {
      const existingVisits = loadVisitedSites();
      let updated = [...existingVisits];
      const popularSites = [
        { url: 'https://github.com', title: 'GitHub' },
        { url: 'https://news.ycombinator.com', title: 'Hacker News' },
        { url: 'https://wikipedia.org', title: 'Wikipedia' },
        { url: 'https://youtube.com', title: 'YouTube' }
      ];
      for (const site of popularSites) {
        updated = recordVisit(updated, site.url, site.title);
      }
      saveVisitedSites(window.localStorage, updated);
    }
    setImportSuccessMsg(t('firstRun.importSuccess', { browser: browser?.name || 'Browser' }));
  };

  const togglePinnedApp = (appId: string) => {
    const nextIds = selectedAppIds.includes(appId)
      ? selectedAppIds.filter((id) => id !== appId)
      : [...selectedAppIds, appId];
    setSelectedAppIds(nextIds);
    const newApps = PRESET_PINNED_APPS.filter((a) => nextIds.includes(a.id));
    setPinnedApps(newApps);
  };

  async function handleSetDefaultBrowser(): Promise<void> {
    setDefaultBrowserLoading(true);
    try {
      await window.lastbrowser?.system?.setDefaultBrowser?.();
      setDefaultBrowserDone(true);
      const isDef = await window.lastbrowser?.system?.isDefaultBrowser?.().catch(() => null);
      if (typeof isDef === 'boolean') {
        setIsDefaultBrowser(isDef);
      }
    } catch {
      setDefaultBrowserDone(true);
    } finally {
      setDefaultBrowserLoading(false);
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (oauthNeedsLogin) {
      setOAuthState((current) => ({
        ...current,
        status: current.status === 'idle' ? 'error' : current.status,
        message: `Bitte verbinde zuerst dein ${activeProviderOption?.label || 'Konto'}, bevor du startest.`
      }));
      return;
    }
    void onSubmit({
      provider,
      model,
      apiKey,
      baseUrl: baseUrl.trim() || undefined,
      botName: botName.trim() || 'Nova',
      personality: personality || 'nova',
      defaultBrowser: Boolean(isDefaultBrowser || defaultBrowserDone),
      importedBookmarksCount: importedBookmarksCount || 0
    });
  }

  // Identify top featured recommendation cards
  const featuredIds = ['openai-codex', 'ollama', 'openrouter'] as const;
  const browserOnly = aiChoice === 'disabled';

  if (aiChoice === null) {
    return (
      <div className="first-run-fullscreen-wrap" role="dialog" aria-modal="true" aria-label={t('firstRun.aiChoiceTitle')}>
        <aside className="first-run-fullscreen first-run-ai-choice-screen">
          <header className="first-run-topbar">
            <div className="first-run-topbar-brand">
              <img src={brandAssets.logo} alt="LastBrowser" className="first-run-brand-logo" />
              <span className="first-run-badge">Willkommen</span>
            </div>
          </header>
          <div className="first-run-ai-choice-card">
            <div className="hero-avatar-wrap">
              <img src={brandAssets.sidekickAvatar} alt="" className="hero-avatar" />
              <span className="hero-glow" />
            </div>
            <h1>{t('firstRun.aiChoiceTitle')}</h1>
            <p>{t('firstRun.aiChoiceDescription')}</p>
            {(flowError || error) && <p role="alert" className="setup-error-banner">{flowError || error}</p>}
            <div className="first-run-ai-choice-actions">
              <button type="button" className="primary-btn" disabled={saving} onClick={() => void chooseAi('enabled')}>
                <Sparkles size={16} />
                <span>{t('firstRun.aiChoiceYes')}</span>
              </button>
              <button type="button" className="secondary-btn" disabled={saving} onClick={() => void chooseAi('disabled')}>
                <Globe size={16} />
                <span>{t('firstRun.aiChoiceNo')}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="first-run-fullscreen-wrap" role="dialog" aria-modal="true" aria-label="First-run setup">
      <aside className="first-run-fullscreen">
        {/* Top bar with branding and a clear route to the browser-only setup. */}
        <header className="first-run-topbar">
          <div className="first-run-topbar-brand">
            <img src={brandAssets.logo} alt="LastBrowser" className="first-run-brand-logo" />
            <span className="first-run-badge">Willkommen</span>
          </div>
          <button
            type="button"
            className="first-run-skip-btn"
            aria-label={browserOnly ? t('firstRun.startLastbrowser') : t('firstRun.skipWithoutAi')}
            title={browserOnly ? t('firstRun.startLastbrowser') : t('firstRun.skipWithoutAiHint')}
            disabled={saving}
            onClick={() => void (browserOnly ? completeBrowserSetup() : chooseAi('disabled'))}
          >
            <span>{browserOnly ? t('firstRun.startLastbrowser') : t('firstRun.skipWithoutAi')}</span>
            <X size={15} />
          </button>
        </header>

        {/* Hero title & introductory copy */}
        <div className="first-run-hero-banner">
          <div className="hero-avatar-wrap">
            <img src={brandAssets.sidekickAvatar} alt="" className="hero-avatar" />
            <span className="hero-glow" />
          </div>
          <div className="hero-content">
            <span className="hero-eyebrow">
              <Sparkles size={14} /> {browserOnly ? t('firstRun.aiChoiceNo') : t('firstRun.heroEyebrow')}
            </span>
            <h1>{browserOnly ? t('firstRun.noAiTitle') : t('firstRun.heroTitle')}</h1>
            <p>{browserOnly ? t('firstRun.noAiDescription') : t('firstRun.heroSubtitle')}</p>
          </div>
        </div>

        {/* Standalone Sidekick migration card (only when an install was found) */}
        {standaloneReport?.found && (
          <div className="setup-section-block standalone-migration-card" data-testid="standalone-migration-card">
            <div className="setup-section-header">
              <span className="setup-step-number"><HardDrive size={14} /></span>
              <div>
                <h2>Sidekick-Installation gefunden</h2>
                <p>
                  Eine bestehende Sidekick-Installation wurde erkannt
                  {standaloneReport.homeDir ? ` (${standaloneReport.homeDir})` : ''}.
                  Wähle aus, welche Daten übernommen werden sollen.
                </p>
              </div>
            </div>
            <div className="standalone-migration-options">
              {([
                { key: 'spaces' as const, label: 'Spaces & Workspaces', available: standaloneReport.components.spaces },
                { key: 'supermemory' as const, label: 'Erinnerungen (Supermemory)', available: standaloneReport.components.supermemory },
                { key: 'profiles' as const, label: 'Profile & Konfiguration', available: standaloneReport.components.profiles }
              ]).map((item) => (
                <label key={item.key} className={`standalone-migration-option ${item.available ? '' : 'unavailable'}`}>
                  <input
                    type="checkbox"
                    checked={migrateItems[item.key] && item.available}
                    disabled={!item.available || migrationState === 'running' || migrationState === 'done'}
                    onChange={(e) => setMigrateItems((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                  />
                  <span>{item.label}</span>
                  {!item.available && <small>nicht gefunden</small>}
                </label>
              ))}
            </div>
            <div className="standalone-migration-actions">
              {migrationState !== 'done' && (
                <button
                  type="button"
                  className="standalone-migration-import-btn"
                  disabled={migrationState === 'running' || !Object.values(migrateItems).some(Boolean)}
                  onClick={runStandaloneMigration}
                >
                  {migrationState === 'running' ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                  <span>{migrationState === 'running' ? 'Importiere…' : 'Daten übernehmen'}</span>
                </button>
              )}
              {migrationState === 'done' && (
                <span className="standalone-migration-success">
                  <CheckCircle2 size={14} /> Übernommen: {migrationResult?.copied?.join(', ') || '—'}
                  {migrationResult?.skipped?.length ? ` · Übersprungen: ${migrationResult.skipped.join(', ')}` : ''}
                </span>
              )}
              {migrationState === 'error' && (
                <span className="standalone-migration-error">
                  Fehler: {migrationResult?.errors?.join('; ') || 'unbekannt'}
                </span>
              )}
            </div>
          </div>
        )}

        {aiChoice === 'enabled' && browserProfileId&&<LocalAiSetupPane key={JSON.stringify([browserProfileId,workspacePath,backendProfileName||''])} browserProfileId={browserProfileId} workspacePath={workspacePath} backendProfileName={backendProfileName}
          ready={status?.sidekick==='ready'&&Boolean(status.webuiUrl)}/>}
        {/* Form container */}
        <form className="setup-fullscreen-form" onSubmit={aiChoice === 'enabled' ? submit : event => event.preventDefault()}>
          {aiChoice === 'enabled' && <>
          {/* ── SECTION 1: IDENTITY & PERSONALITY ── */}
          <div className="setup-section-block">
            <div className="setup-section-header">
              <span className="setup-step-number">1</span>
              <div>
                <h2>{t('firstRun.section1Title')}</h2>
                <p>{t('firstRun.section1Desc')}</p>
              </div>
            </div>

            {/* Assistant Name Selection */}
            <div className="assistant-name-config">
              <label htmlFor="assistant-name-input" className="assistant-name-label">
                {t('firstRun.botNameLabel')}
              </label>
              <div className="assistant-name-input-row">
                <input
                  id="assistant-name-input"
                  type="text"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  placeholder={t('firstRun.botNamePlaceholder')}
                  maxLength={32}
                  className="assistant-name-input"
                />
                <div className="name-preset-chips" role="group" aria-label="Namensvorschläge">
                  {BOT_NAME_PRESETS.map((preset) => {
                    const isPresetActive = botName.trim().toLowerCase() === preset.name.toLowerCase();
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        className={`name-preset-pill ${isPresetActive ? 'active' : ''}`}
                        onClick={() => setBotName(preset.name)}
                        title={preset.desc}
                      >
                        <span className="preset-name">{preset.name}</span>
                        <span className="preset-pill-hint">{preset.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Personality Cards Grid */}
            <div className="personality-cards-grid" role="radiogroup" aria-label="Persönlichkeitsprofil auswählen">
              {PERSONALITY_PROFILES.map((profile) => {
                const isSelected = personality === profile.id;
                return (
                  <div
                    key={profile.id}
                    className={`personality-card ${profile.badgeType} ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setPersonality(profile.id)}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setPersonality(profile.id);
                      }
                    }}
                  >
                    <div className="persona-top">
                      <span className={`persona-badge ${profile.badgeType}`}>{profile.badge}</span>
                      <div className="select-radio">
                        <span className={`radio-dot ${isSelected ? 'active' : ''}`} />
                      </div>
                    </div>

                    <div className="persona-header">
                      <span className="persona-icon">{profile.icon}</span>
                      <div>
                        <h3 className="persona-name">{profile.name}</h3>
                        <span className="persona-tagline">{profile.tagline}</span>
                      </div>
                    </div>

                    <p className="persona-desc">{profile.description}</p>

                    <div className="persona-footer">
                      <span className="persona-tone-tag">
                        <strong>Ton:</strong> {profile.tone}
                      </span>
                      <blockquote className="persona-sample-quote">
                        {profile.samplePhrase}
                      </blockquote>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── SECTION 2: AI ENGINE & CONNECTION ── */}
          <div className="setup-section-block">
            <div className="setup-section-header">
              <span className="setup-step-number">2</span>
              <div>
                <h2>{t('firstRun.section2Title', { botName: botName.trim() || 'Nova' })}</h2>
                <p>{t('firstRun.section2Desc')}</p>
              </div>
            </div>

            {/* Mode switcher tabs */}
            <div className="setup-tabs">
              <button
                type="button"
                className={`setup-tab-btn ${activeTab === 'featured' ? 'active' : ''}`}
                onClick={() => setActiveTab('featured')}
              >
                <Sparkles size={15} />
                <span>{t('firstRun.tabFeatured')}</span>
              </button>
              <button
                type="button"
                className={`setup-tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
                onClick={() => setActiveTab('custom')}
              >
                <Key size={15} />
                <span>{t('firstRun.tabCustomKey')}</span>
              </button>
            </div>
            <ProviderBetaCatalogToggle />
          </div>
          {activeTab === 'featured' ? (
            /* ── FEATURED RECOMMENDATIONS (3 big rich cards) ── */
            <div className="featured-cards-grid">
              {!visibleProviders.some(item => featuredIds.includes(item.id as typeof featuredIds[number]))
                && !showUntestedBetas && <p role="status">{t('settings.panels.providers.betaCatalogEmpty')}</p>}
              {featuredIds.filter(id => visibleProviders.some(item => item.id === id)).map((featuredId) => {
                const rec = PROVIDER_RECOMMENDATIONS[featuredId];
                if (!rec) return null;
                const copy = localizedProviderRecommendation(featuredId, locale);
                const chatEvidence = browserProfileId ? getProviderChatEvidence(featuredId, browserProfileId, backendProfileName || 'default', window.localStorage) : undefined;
                const verification = providerVerification(featuredId, { successfulChat: Boolean(chatEvidence), modelId: chatEvidence?.modelId });
                const isSelected = provider === featuredId;
                const opt = providers.find((p) => p.id === featuredId);

                return (
                  <div
                    key={featuredId}
                    className={`featured-card ${rec.badgeType} ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => selectProvider(featuredId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        selectProvider(featuredId);
                      }
                    }}
                  >
                    <div className="card-top">
                      <span className={`recommendation-pill ${rec.badgeType}`}>
                        {rec.badgeType === 'recommended' && <Sparkles size={12} />}
                        {rec.badgeType === 'popular' && <Bot size={12} />}
                        {rec.badgeType === 'private' && <ShieldCheck size={12} />}
                        {copy?.badge || rec.badge}
                      </span>
                      <span className={`provider-verification-note ${verification.verified ? 'verified' : 'untested'}`}>
                        {t(verification.statusKey)}
                      </span>
                      <div className="select-radio">
                        <span className={`radio-dot ${isSelected ? 'active' : ''}`} />
                      </div>
                    </div>

                    <h3 className="card-title">{copy?.headline || rec.headline}</h3>

                    <ul className="benefits-list">
                      {(copy?.benefits || rec.benefits).map((benefit, i) => (
                        <li key={i}>
                          <CheckCircle2 size={14} className="benefit-check" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="card-footer-note">
                      <strong>{locale === 'de' ? 'Fazit:' : locale === 'fr' ? 'En bref :' : locale === 'es' ? 'En resumen:' : locale === 'it' ? 'In sintesi:' : locale === 'pt-BR' ? 'Em resumo:' : locale === 'ru' ? 'Итог:' : 'Best for:'}</strong> {copy?.bestFor || rec.bestFor}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── CUSTOM CLOUD API KEY SELECTION ── */
            <div className="custom-key-section">
              <div className="custom-key-header">
                <h3>{t('firstRun.customKeyHeader')}</h3>
                <p>{t('firstRun.customKeyDesc')}</p>
              </div>

              <div className="provider-chips-grid">
              {!visibleProviders.some(p => p.id !== 'google-gemini-cli' && p.id !== 'openai-codex') && !showUntestedBetas
                && <p role="status">{t('settings.panels.providers.betaCatalogEmpty')}</p>}
              {visibleProviders
                  .filter((p) => p.id !== 'google-gemini-cli' && p.id !== 'openai-codex')
                  .map((p) => {
                    const meta = providerPresentation(p.id);
                    const isCurrent = provider === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`provider-chip ${isCurrent ? 'active' : ''}`}
                        onClick={() => selectProvider(p.id)}
                      >
                        <span className="chip-mark" style={{ background: meta.color }}>{meta.mark}</span>
                        <div className="chip-text">
                          <strong>{p.label}</strong>
                          <small>{meta.description}</small>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── INTERACTION & CONFIGURATION BOX FOR SELECTED ENGINE ── */}
          {!provider && <p role="status">{t('settings.panels.providers.betaCatalogEmpty')}</p>}
          {provider && <div className="active-engine-box">
            <div className="engine-box-header">
              <div className="engine-box-title">
                <span className="engine-icon" style={{ background: providerPresentation(provider).color }}>
                  {providerPresentation(provider).mark}
                </span>
                <div>
                  <h4>Konfiguration: {activeProviderOption?.label || provider}</h4>
                  <p>{localizedProviderDescription(provider, locale)}</p>
                </div>
              </div>
            </div>

            {/* If provider supports OAuth connect (Gemini CLI or ChatGPT) */}
            {activeProviderOption?.oauthProvider ? (
              <div className={`oauth-connect-panel ${oauthState.status}`}>
                <div className="oauth-status-info">
                  {oauthState.status === 'success' || oauthAlreadyReady ? (
                    <div className="oauth-connected-badge">
                      <CheckCircle2 size={20} />
                      <div>
                        <strong>Erfolgreich verbunden!</strong>
                        <span>Dein {activeProviderOption.label} Konto ist autorisiert und einsatzbereit.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="oauth-prompt-info">
                      <div>
                        <strong>Konto-Anmeldung erforderlich</strong>
                        <span>
                          {activeProviderOption.id === 'google-gemini-cli'
                            ? t('firstRun.oauthPromptSystemBrowser')
                            : 'Klicke unten, um das Anmeldefenster zu öffnen.'}
                          {activeProviderOption.id === 'google-gemini-cli' && ' Kein API-Key oder Kreditkarte nötig.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="oauth-connect-btn"
                        onClick={() => void startProviderLogin()}
                        disabled={!canSubmit || oauthState.status === 'starting' || oauthState.status === 'pending'}
                      >
                        {oauthState.status === 'starting' || oauthState.status === 'pending' ? (
                          <Loader2 size={16} className="spin" />
                        ) : (
                          <LogIn size={16} />
                        )}
                        <span>
                          {activeProviderOption.id === 'google-gemini-cli'
                            ? t('firstRun.oauthOpenSystemBrowser')
                            : activeProviderOption.id === 'anthropic'
                              ? 'Claude Code-Konto auf diesem Gerät verbinden'
                              : `Mit ${activeProviderOption.label} anmelden`}
                        </span>
                      </button>
                    </div>
                  )}

                  {oauthState.status === 'pending' && oauthState.actionRequired && (
                    <div className="oauth-message-line anthropic-action-required" role="status">
                      <span>{oauthState.actionRequired}</span>
                      {oauthProviderId === 'anthropic' && (
                        <button type="button" className="import-file-btn" onClick={() => void window.lastbrowser.system.openExternal('https://docs.anthropic.com/en/docs/claude-code/overview')}>
                          Claude Code-Installationsanleitung öffnen <ExternalLink size={14} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Device code fallback if needed */}
                  {oauthState.verificationUri && oauthState.status === 'pending' && (
                    <div className="oauth-device-details">
                      {oauthProviderId === 'google-gemini-cli' && (
                        <button
                          type="button"
                          className="import-file-btn"
                          onClick={() => {
                            void openProviderOAuthUrl('google-gemini-cli', oauthState.verificationUri!, {
                              openExternal: window.lastbrowser?.system?.openExternal
                            }).then((opened) => {
                              if (!opened) setOAuthState((current) => ({
                                ...current,
                                message: t('firstRun.oauthExternalOpenFailed')
                              }));
                            }).catch(() => setOAuthState((current) => ({
                              ...current,
                              message: t('firstRun.oauthExternalOpenFailed')
                            })));
                          }}
                        >
                          {t('firstRun.oauthOpenSystemBrowser')}
                        </button>
                      )}
                      {oauthState.userCode && (
                        <div className="device-code-wrap">
                          <span>Bestätigungscode:</span>
                          <button type="button" className="code-badge" onClick={copyCodexCode}>
                            <code>{oauthState.userCode}</code>
                            <ClipboardCopy size={13} />
                          </button>
                        </div>
                      )}
                      <button type="button" className="cancel-auth-btn" onClick={() => void cancelCodexLogin()}>
                        Abbrechen
                      </button>
                    </div>
                  )}

                  {oauthState.message && <p className="oauth-message-line">{oauthState.message}</p>}
                </div>
                {provider === 'anthropic' && (
                  <div className="api-key-panel">
                    <label className="input-group">
                      <span className="input-label">Anthropic API-Schlüssel (Alternative zu Claude Code)</span>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(event) => {
                          setApiKey(event.target.value);
                          setModelProbeError('');
                        }}
                        placeholder="Anthropic API-Key einfügen"
                        className="key-input"
                      />
                      <div className="field-hint" style={{ marginTop: '0.5rem' }}>
                        <button type="button" className="import-file-btn" onClick={() => void loadLiveModels()} disabled={!apiKey.trim() || modelProbeLoading}>
                          {modelProbeLoading ? 'Modelle werden geladen…' : 'Verfügbare Modelle laden'}
                        </button>
                        {modelProbeError && <p role="alert">{modelProbeError}</p>}
                      </div>
                    </label>
                  </div>
                )}
              </div>
            ) : (
              /* API Key input field for cloud/local providers */
              <div className="api-key-panel">
                <label className="input-group">
                  <span className="input-label">
                    {activeProviderOption?.id === 'openrouter' ? 'OpenRouter API-Schlüssel' : (activeProviderOption?.keyOptional ? 'API-Schlüssel (Optional bei lokalem Betrieb)' : 'API-Schlüssel')}
                  </span>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setModelProbeError('');
                    }}
                    placeholder={
                      activeProviderOption?.keyOptional
                        ? 'Leer lassen für lokalen Server (z. B. Ollama auf Port 11434)'
                        : activeProviderOption?.id === 'openrouter'
                          ? 'OpenRouter-Key einfügen (sk-or-...)'
                        : `API-Key für ${activeProviderOption?.label || 'Provider'} einfügen`
                    }
                    className="key-input"
                  />
                  {activeProviderOption?.id === 'ollama' && (
                    <small className="field-hint">
                      Tipp: Starte Ollama in deinem Terminal mit <code>ollama run llama3.2</code> oder nutze Modelle wie <code>qwen2.5</code> und <code>deepseek-r1</code>.
                    </small>
                  )}
                  {activeProviderOption?.id === 'openrouter' && (
                    <small className="field-hint">
                      Erhältlich unter <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>. Ein Key gewährt Zugriff auf über 200 Modelle.
                    </small>
                  )}
                  {['openrouter', 'alibaba', 'anthropic', 'openai', 'deepseek'].includes(provider) && (
                    <div className="field-hint" style={{ marginTop: '0.5rem' }}>
                      <button type="button" className="import-file-btn" onClick={() => void loadLiveModels()} disabled={!apiKey.trim() || modelProbeLoading}>
                        {modelProbeLoading ? 'Modelle werden geladen…' : 'Verfügbare Modelle laden'}
                      </button>
                      {modelProbeError && <p role="alert">{modelProbeError}</p>}
                    </div>
                  )}
                  {activeProviderOption?.id === 'deepseek' && (
                    <small className="field-hint">
                      Erhältlich auf der <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">DeepSeek Platform</a>. Führend im Preis-Leistungs-Verhältnis.
                    </small>
                  )}
                </label>
                {(activeProviderOption?.id === 'ollama' || activeProviderOption?.id === 'ollama-cloud' || activeProviderOption?.requiresBaseUrl) && (
                  <label className="input-group" style={{ marginTop: '0.75rem' }}>
                    <span className="input-label">{provider === 'alibaba'
                      ? t('settings.panels.providers.alibabaBaseUrlLabel')
                      : 'Server-Adresse / Endpoint (Optional)'}</span>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder={provider === 'alibaba'
                        ? t('settings.panels.providers.alibabaBaseUrlPlaceholder')
                        : activeProviderOption?.defaultBaseUrl || 'http://localhost:11434/v1'}
                      className="key-input"
                    />
                    <small className="field-hint">
                      {provider === 'alibaba'
                        ? t('settings.panels.providers.alibabaBaseUrlHint')
                        : `Für Standard (${activeProviderOption?.defaultBaseUrl || 'http://localhost:11434/v1'}) leer lassen. Für Ollama Cloud oder Remote-Server hier die URL eintragen.`}
                    </small>
                  </label>
                )}
              </div>
            )}

            {/* Model picker within chosen provider */}
            <div className="model-selection-area">
              <label className="input-label">{t('firstRun.preferredModelLabel')}</label>
              {models.length === 0 ? (
                <div className="field-hint">
                  <p>Für diesen Anbieter sind aktuell keine Modelle verfügbar. API-Key eingeben und Modellliste erneut laden.</p>
                  <button type="button" className="import-file-btn" onClick={() => void loadLiveModels()}>Modelle neu laden</button>
                </div>
              ) : <div className="models-pills-row">
                {models.map((m) => {
                  const note = modelNote(m.id);
                  const isModelActive = m.id === model;
                  const isQualified = Boolean(browserProfileId && isProviderModelQualified(provider, m.id, browserProfileId, backendProfileName || 'default', window.localStorage));
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`model-pill ${isModelActive ? 'active' : ''}`}
                      onClick={() => setModel(m.id)}
                    >
                      <strong>{m.label}{isQualified ? '' : ` · ${t('settings.panels.providers.betaUntested')}`}</strong>
                      {note && <span className={`pill-tier ${note.tier}`}>{tierLabels[note.tier]}</span>}
                    </button>
                  );
                })}
              </div>}
            </div>
          </div>}

          </>}

          {/* ── SECTION 3: BROWSER DATA & BOOKMARK IMPORT ── */}
          <div className="setup-section-block">
            <div className="setup-section-header">
              <span className="setup-step-number">{browserOnly ? '1' : '3'}</span>
              <div>
                <h2>{t('firstRun.section3Title')}</h2>
                <p>{t('firstRun.section3Desc')}</p>
              </div>
            </div>

            <div className="setup-browser-grid" role="radiogroup" aria-label="Quell-Browser auswählen">
              {BROWSER_CHOICES.map((b) => {
                const isSelected = selectedBrowser === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`browser-import-card ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedBrowser(b.id)}
                  >
                    <span className="browser-card-icon" style={{ borderColor: b.color }}>
                      {b.icon}
                    </span>
                    <div className="browser-card-info">
                      <strong>{b.name}</strong>
                      <small>{b.hint}</small>
                    </div>
                    <div className="select-radio">
                      <span className={`radio-dot ${isSelected ? 'active' : ''}`} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="import-options-panel">
              <div className="import-checkboxes-row">
                <label className="import-check-label">
                  <input
                    type="checkbox"
                    checked={importBookmarksChecked}
                    onChange={(e) => setImportBookmarksChecked(e.target.checked)}
                  />
                  <span>{t('firstRun.importBookmarks')}</span>
                </label>
                <label className="import-check-label">
                  <input
                    type="checkbox"
                    checked={importHistoryChecked}
                    onChange={(e) => setImportHistoryChecked(e.target.checked)}
                  />
                  <span>{t('firstRun.importHistory')}</span>
                </label>
                <label className="import-check-label">
                  <input
                    type="checkbox"
                    checked={importSearchChecked}
                    onChange={(e) => setImportSearchChecked(e.target.checked)}
                  />
                  <span>{t('firstRun.importSearch')}</span>
                </label>
              </div>

              <div className="import-actions-row">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".html,.htm,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => void handleFileChange(e)}
                />
                <button
                  type="button"
                  className="import-file-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title={t('firstRun.selectFile')}
                >
                  <FileUp size={16} />
                  <span>{t('firstRun.selectFile')}</span>
                </button>
                <button
                  type="button"
                  className="import-execute-btn"
                  onClick={handleQuickImport}
                >
                  <Download size={15} />
                  <span>{t('firstRun.importNow', { browser: BROWSER_CHOICES.find((b) => b.id === selectedBrowser)?.name || 'Browser' })}</span>
                </button>
              </div>

              {importSuccessMsg && (
                <div className="import-success-badge">
                  <CheckCircle2 size={16} />
                  <span>{importSuccessMsg}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 4: PINNED APPS FAVORITEN-AUSWAHL ── */}
          <div className="setup-section-block">
            <div className="setup-section-header">
              <span className="setup-step-number">{browserOnly ? '2' : '4'}</span>
              <div>
                <h2>{t('firstRun.section4Title')}</h2>
                <p>{t('firstRun.section4Desc')}</p>
              </div>
            </div>

            <div className="setup-pinned-grid" role="group" aria-label="Pinned Web Apps auswählen">
              {PRESET_PINNED_APPS.map((app) => {
                const isSelected = selectedAppIds.includes(app.id);
                return (
                  <button
                    key={app.id}
                    type="button"
                    className={`setup-pinned-card ${isSelected ? 'active' : ''}`}
                    onClick={() => togglePinnedApp(app.id)}
                    style={{ '--app-color': app.color } as React.CSSProperties}
                  >
                    <div className="setup-pinned-avatar" style={{ background: app.bg || 'rgba(255,255,255,0.08)' }}>
                      {app.faviconUrl ? (
                        <img src={app.faviconUrl} alt="" className="setup-pinned-favicon" />
                      ) : (
                        <span style={{ color: app.color }}>{app.letter || app.name.charAt(0)}</span>
                      )}
                    </div>
                    <span className="setup-pinned-name">{app.name}</span>
                    <span className={`setup-pinned-check ${isSelected ? 'active' : ''}`}>
                      {isSelected ? <Check size={13} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="setup-pinned-summary">
              <small>{selectedAppIds.length} Apps im Slim Dock aktiv</small>
            </div>
          </div>

          {/* ── SECTION 5: WINDOWS STANDARD-BROWSER ── */}
          <div className="setup-section-block default-browser-section">
            <div className="setup-section-header">
              <span className="setup-step-number">{browserOnly ? '3' : '5'}</span>
              <div>
                <h2>LastBrowser als Windows Standard-Browser</h2>
                <p>Öffne Webseiten, HTML-Dateien und Links aus externen Apps wie Outlook, Teams oder Discord standardmäßig mit LastBrowser.</p>
              </div>
            </div>

            <div className="default-browser-card-content">
              <div className="default-browser-info">
                <div className="default-browser-icon-wrap">
                  <Monitor size={24} className="default-browser-icon" />
                </div>
                <div>
                  <strong>{isDefaultBrowser ? t('firstRun.defaultBrowserCardTitleActive') : t('firstRun.defaultBrowserCardTitle')}</strong>
                  <p>{browserOnly ? t('firstRun.defaultBrowserCardDescNoAi') : t('firstRun.defaultBrowserCardDesc')}</p>
                </div>
              </div>

              <div className="default-browser-actions">
                {isDefaultBrowser || defaultBrowserDone ? (
                  <span className="default-browser-registered-badge">
                    <CheckCircle2 size={16} />
                    <span>{t('firstRun.defaultBrowserRegistered')}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="default-browser-set-btn"
                    onClick={() => void handleSetDefaultBrowser()}
                    disabled={defaultBrowserLoading}
                  >
                    {defaultBrowserLoading ? <Loader2 size={15} className="spin" /> : <Globe size={15} />}
                    <span>{t('firstRun.defaultBrowserSetBtn')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {(flowError || error) && <div role="alert" className="setup-error-banner">{flowError || error}</div>}
          {browserOnly && <p className="first-run-no-ai-note" role="status">{t('firstRun.noAiDescription')}</p>}

          {/* ── ACTION FOOTER ── */}
          <div className="setup-action-footer">
            <div className="footer-left">
              {!browserOnly && <span className={`runtime-status-indicator ${status?.sidekick === 'ready' ? 'ready' : 'starting'}`}>
                <span className="dot" />
                <span>{status?.sidekick === 'ready' ? t('firstRun.runtimeReady') : t('firstRun.runtimeStarting')}</span>
              </span>}
            </div>

            <div className="footer-actions">
              {browserOnly ? <>
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={saving}
                  onClick={() => void chooseAi('enabled')}
                >
                  <Sparkles size={16} />
                  <span>{t('firstRun.aiChoiceYes')}</span>
                </button>
                <button
                  type="button"
                  className="primary-btn launch-btn"
                  disabled={saving}
                  onClick={() => void completeBrowserSetup()}
                >
                  {saving ? <Loader2 size={16} className="spin" /> : <Globe size={16} />}
                  <span>{saving ? t('firstRun.configuring') : t('firstRun.startLastbrowser')}</span>
                </button>
              </> : <>
              <button
                type="button"
                className="secondary-btn"
                onClick={onDismiss}
              >
                {t('firstRun.decideLater')}
              </button>
              <button
                type="submit"
                className="primary-btn launch-btn"
                disabled={saving || !provider || !model || !canSubmitForm}
              >
                {saving || !canSubmitForm ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                <span>
                  {saving
                    ? t('firstRun.configuring')
                    : canSubmitForm
                    ? t('firstRun.launchWithBot', { botName: botName.trim() || 'Nova' })
                    : oauthNeedsLogin
                    ? t('firstRun.loginFirst')
                    : t('firstRun.runtimePreparing')}
                </span>
                {canSubmitForm && !saving && <ArrowRight size={15} />}
              </button>
              </>}
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
