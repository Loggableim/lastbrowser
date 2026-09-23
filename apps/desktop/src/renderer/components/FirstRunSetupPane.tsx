/**
 * First-run setup assistant for Lastbrowser.
 *
 * Provides a modern, immersive full-screen onboarding experience that explains
 * the available AI engines and recommends the best setup options:
 *   1. Google Gemini via CLI / Google-Konto (Recommended, free, 1M context, no API key)
 *   2. ChatGPT / OpenAI via Codex (Popular, connects existing subscription without API costs)
 *   3. Ollama (100% local, private, offline, no data leaves the PC)
 *   4. Cloud API Keys (OpenRouter, DeepSeek, Claude, OpenAI for power users)
 */

import React, { FormEvent, useEffect, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCopy,
  Cpu,
  ExternalLink,
  HardDrive,
  Key,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
  X
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import {
  modelNote,
  providerPresentation,
  tierLabels,
  PROVIDER_RECOMMENDATIONS,
  PERSONALITY_PROFILES,
  BOT_NAME_PRESETS,
  type PersonalityProfile
} from '../provider-presentation.js';
import {
  OnboardingStatus,
  canSubmitCloudSetup,
  cloudProviderOptions,
  firstRunStatus,
  modelsForProvider,
  type ProviderOption
} from '../setup-state.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;

export type SetupForm = {
  provider: string;
  model: string;
  apiKey: string;
  botName: string;
  personality: string;
};

type CodexOAuthState = {
  status: 'idle' | 'starting' | 'pending' | 'success' | 'expired' | 'cancelled' | 'error';
  flowId?: string;
  verificationUri?: string;
  userCode?: string;
  pollIntervalSeconds?: number;
  message?: string;
};

export type FirstRunSetupPaneProps = {
  status: ServiceStatus | null;
  onboardingStatus: OnboardingStatus | null;
  setupLoading: boolean;
  error: string;
  saving: boolean;
  onRefreshOnboarding: () => Promise<void>;
  onSubmit: (form: SetupForm) => Promise<void>;
  onDismiss: () => void;
};

const idleCodexOAuth: CodexOAuthState = { status: 'idle' };

export function FirstRunSetupPane({
  status,
  onboardingStatus,
  setupLoading,
  error,
  saving,
  onRefreshOnboarding,
  onSubmit,
  onDismiss
}: FirstRunSetupPaneProps): React.JSX.Element {
  const providers = cloudProviderOptions(onboardingStatus);

  // Determine initial provider: prefer google-gemini-cli if available, else codex, else first
  const defaultProviderId = providers.some((p) => p.id === 'google-gemini-cli')
    ? 'google-gemini-cli'
    : (providers.some((p) => p.id === 'openai-codex') ? 'openai-codex' : (providers[0]?.id || 'openrouter'));

  const [provider, setProvider] = useState<string>(defaultProviderId);
  const models = modelsForProvider(onboardingStatus, provider);
  const [model, setModel] = useState(models[0]?.id || '');
  const [apiKey, setApiKey] = useState('');
  const [oauthState, setOAuthState] = useState<CodexOAuthState>(idleCodexOAuth);

  // Identity & Personality state
  const [botName, setBotName] = useState<string>('Nova');
  const [personality, setPersonality] = useState<string>('nova');

  // Setup mode tab: 'recommended' (Gemini, ChatGPT, Ollama) vs 'custom-key' (OpenRouter, DeepSeek, etc.)
  const [activeTab, setActiveTab] = useState<'featured' | 'custom'>('featured');

  const readiness = firstRunStatus(status, onboardingStatus);
  const canSubmit = canSubmitCloudSetup(readiness);
  const activeProviderOption = providers.find((item) => item.id === provider);

  const oauthProviderId = activeProviderOption?.oauthProvider || '';
  const oauthAlreadyReady = Boolean(oauthProviderId)
    && onboardingStatus?.system?.chat_ready === true
    && String(onboardingStatus.system.current_provider || '').toLowerCase() === oauthProviderId;
  const oauthNeedsLogin = Boolean(oauthProviderId) && oauthState.status !== 'success' && !oauthAlreadyReady;
  const oauthLoginReady = !oauthNeedsLogin;
  const canSubmitForm = canSubmit && oauthLoginReady;

  useEffect(() => {
    if (!providers.some((item) => item.id === provider) && providers[0]) {
      setProvider(providers[0].id);
    }
  }, [provider, providers]);

  useEffect(() => {
    const nextModels = modelsForProvider(onboardingStatus, provider);
    if (!nextModels.some((item) => item.id === model)) {
      setModel(nextModels[0]?.id || '');
    }
  }, [model, onboardingStatus, provider]);

  useEffect(() => {
    if (!oauthProviderId && oauthState.status !== 'idle') {
      setOAuthState(idleCodexOAuth);
    }
  }, [oauthProviderId, oauthState.status]);

  // OAuth polling
  useEffect(() => {
    if (!oauthProviderId || oauthState.status !== 'pending' || !oauthState.flowId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await window.lastbrowser.sidekick.pollOAuth(oauthState.flowId || '');
        if (cancelled) return;
        const nextStatus = String(response.status || 'error') as CodexOAuthState['status'];
        if (nextStatus === 'pending') {
          setOAuthState((current) => ({
            ...current,
            status: 'pending',
            message: `Warte auf Freigabe von ${activeProviderOption?.label || 'Provider'}...`
          }));
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
          status: 'error',
          message: pollError instanceof Error ? pollError.message : String(pollError)
        }));
      }
    }, Math.max(1200, (oauthState.pollIntervalSeconds || 3) * 1000));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [oauthProviderId, activeProviderOption?.label, oauthState.flowId, oauthState.pollIntervalSeconds, oauthState.status, onRefreshOnboarding]);

  async function startProviderLogin(): Promise<void> {
    if (!oauthProviderId) return;
    const providerLabel = activeProviderOption?.label || 'Provider';
    setOAuthState({ status: 'starting', message: `Starte Anmeldung für ${providerLabel}...` });
    try {
      const response = await window.lastbrowser.sidekick.startOAuth({ provider: oauthProviderId });
      if (response.error) throw new Error(response.error);
      const flowId = String(response.flow_id || '');

      if (response.status === 'success') {
        setOAuthState({
          status: 'success',
          flowId,
          message: `${providerLabel} Anmeldedaten gefunden und verbunden.`
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
        message: userCode
          ? `Öffne ${providerLabel}, gib den Bestätigungscode ein und kehre zu Lastbrowser zurück.`
          : `Melde dich im geöffneten Connect-Fenster mit ${providerLabel} an.`
      });

      // Prefer in-app connect window over opening external system browser!
      if (window.lastbrowser?.auth?.openConnectWindow) {
        void window.lastbrowser.auth.openConnectWindow(verificationUri);
      } else {
        window.open(verificationUri, '_blank', 'noopener,noreferrer');
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
      botName: botName.trim() || 'Nova',
      personality: personality || 'nova'
    });
  }

  // Identify top featured recommendation cards
  const featuredIds = ['google-gemini-cli', 'openai-codex', 'ollama'] as const;

  return (
    <div className="first-run-fullscreen-wrap" role="dialog" aria-modal="true" aria-label="First-run setup">
      <aside className="first-run-fullscreen">
        {/* Top bar with branding & skip button */}
        <header className="first-run-topbar">
          <div className="first-run-topbar-brand">
            <img src={brandAssets.logo} alt="Lastbrowser" className="first-run-brand-logo" />
            <span className="first-run-badge">Willkommen</span>
          </div>
          <button
            type="button"
            className="first-run-skip-btn"
            aria-label="Ohne KI browsen"
            title="Assistent überspringen — du kannst die KI jederzeit in den Einstellungen einrichten"
            onClick={onDismiss}
          >
            <span>Erstmal ohne KI browsen</span>
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
              <Sparkles size={14} /> AI-Native Browsing Experience
            </span>
            <h1>Gestalte deinen KI-Begleiter für Lastbrowser</h1>
            <p>
              Lastbrowser integriert KI direkt in Tabs, Recherche und Workspaces.
              Passe Namen und Persönlichkeit an und wähle die passende KI-Engine:
            </p>
          </div>
        </div>

        {/* Form container */}
        <form className="setup-fullscreen-form" onSubmit={submit}>
          {/* ── SECTION 1: IDENTITY & PERSONALITY ── */}
          <div className="setup-section-block">
            <div className="setup-section-header">
              <span className="setup-step-number">1</span>
              <div>
                <h2>Identität & Persönlichkeit</h2>
                <p>Wie soll dein Assistent heißen und wie soll er sich im Browser verhalten?</p>
              </div>
            </div>

            {/* Assistant Name Selection */}
            <div className="assistant-name-config">
              <label htmlFor="assistant-name-input" className="assistant-name-label">
                Name des KI-Begleiters:
              </label>
              <div className="assistant-name-input-row">
                <input
                  id="assistant-name-input"
                  type="text"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  placeholder="z. B. Nova, Jarvis, Aura..."
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
                <h2>KI-Engine & Modell für {botName.trim() || 'deinen Begleiter'} wählen</h2>
                <p>Wähle den Anbieter, der am besten zu deinen Gewohnheiten und Datenschutzanforderungen passt:</p>
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
                <span>Haupt-Optionen (Empfohlen)</span>
              </button>
              <button
                type="button"
                className={`setup-tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
                onClick={() => setActiveTab('custom')}
              >
                <Key size={15} />
                <span>Eigener API-Schlüssel (OpenRouter, DeepSeek, Claude)</span>
              </button>
            </div>
          </div>
          {activeTab === 'featured' ? (
            /* ── FEATURED RECOMMENDATIONS (3 big rich cards) ── */
            <div className="featured-cards-grid">
              {featuredIds.map((featuredId) => {
                const rec = PROVIDER_RECOMMENDATIONS[featuredId];
                if (!rec) return null;
                const isSelected = provider === featuredId;
                const opt = providers.find((p) => p.id === featuredId);

                return (
                  <div
                    key={featuredId}
                    className={`featured-card ${rec.badgeType} ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setProvider(featuredId);
                      setApiKey('');
                      setOAuthState(idleCodexOAuth);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setProvider(featuredId);
                      }
                    }}
                  >
                    <div className="card-top">
                      <span className={`recommendation-pill ${rec.badgeType}`}>
                        {rec.badgeType === 'recommended' && <Sparkles size={12} />}
                        {rec.badgeType === 'popular' && <Bot size={12} />}
                        {rec.badgeType === 'private' && <ShieldCheck size={12} />}
                        {rec.badge}
                      </span>
                      <div className="select-radio">
                        <span className={`radio-dot ${isSelected ? 'active' : ''}`} />
                      </div>
                    </div>

                    <h3 className="card-title">{rec.headline}</h3>

                    <ul className="benefits-list">
                      {rec.benefits.map((benefit, i) => (
                        <li key={i}>
                          <CheckCircle2 size={14} className="benefit-check" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="card-footer-note">
                      <strong>Fazit:</strong> {rec.bestFor}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── CUSTOM CLOUD API KEY SELECTION ── */
            <div className="custom-key-section">
              <div className="custom-key-header">
                <h3>Cloud-Modelle mit eigenem API-Schlüssel</h3>
                <p>
                  Ideal für Entwickler und Power-User. Gib einfach deinen vorhandenen API-Key ein.
                  Besonders empfohlen: <strong>OpenRouter</strong> (ein Key für hunderte Modelle) oder <strong>DeepSeek</strong> (unschlagbar günstig & klug).
                </p>
              </div>

              <div className="provider-chips-grid">
                {providers
                  .filter((p) => p.id !== 'google-gemini-cli' && p.id !== 'openai-codex')
                  .map((p) => {
                    const meta = providerPresentation(p.id);
                    const isCurrent = provider === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`provider-chip ${isCurrent ? 'active' : ''}`}
                        onClick={() => {
                          setProvider(p.id);
                          setApiKey('');
                          setOAuthState(idleCodexOAuth);
                        }}
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
          <div className="active-engine-box">
            <div className="engine-box-header">
              <div className="engine-box-title">
                <span className="engine-icon" style={{ background: providerPresentation(provider).color }}>
                  {providerPresentation(provider).mark}
                </span>
                <div>
                  <h4>Konfiguration: {activeProviderOption?.label || provider}</h4>
                  <p>{providerPresentation(provider).description}</p>
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
                          Klicke unten, um das Anmeldefenster direkt in Lastbrowser zu öffnen.
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
                            ? 'In Lastbrowser mit Google anmelden'
                            : `Mit ${activeProviderOption.label} anmelden`}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Device code fallback if needed */}
                  {oauthState.verificationUri && oauthState.status === 'pending' && (
                    <div className="oauth-device-details">
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
              </div>
            ) : (
              /* API Key input field for cloud/local providers */
              <div className="api-key-panel">
                <label className="input-group">
                  <span className="input-label">
                    {activeProviderOption?.keyOptional ? 'API-Schlüssel (Optional bei lokalem Betrieb)' : 'API-Schlüssel'}
                  </span>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      activeProviderOption?.keyOptional
                        ? 'Leer lassen für lokalen Server (z. B. Ollama auf Port 11434)'
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
                  {activeProviderOption?.id === 'deepseek' && (
                    <small className="field-hint">
                      Erhältlich auf der <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">DeepSeek Platform</a>. Führend im Preis-Leistungs-Verhältnis.
                    </small>
                  )}
                </label>
              </div>
            )}

            {/* Model picker within chosen provider */}
            <div className="model-selection-area">
              <label className="input-label">Bevorzugtes Modell für Sidekick:</label>
              <div className="models-pills-row">
                {models.map((m) => {
                  const note = modelNote(m.id);
                  const isModelActive = m.id === model;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`model-pill ${isModelActive ? 'active' : ''}`}
                      onClick={() => setModel(m.id)}
                    >
                      <strong>{m.label}</strong>
                      {note && <span className={`pill-tier ${note.tier}`}>{tierLabels[note.tier]}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && <div className="setup-error-banner">{error}</div>}

          {/* ── ACTION FOOTER ── */}
          <div className="setup-action-footer">
            <div className="footer-left">
              <span className={`runtime-status-indicator ${status?.sidekick === 'ready' ? 'ready' : 'starting'}`}>
                <span className="dot" />
                <span>Sidekick Runtime: {status?.sidekick === 'ready' ? 'Bereit' : 'Startet...'}</span>
              </span>
            </div>

            <div className="footer-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={onDismiss}
              >
                Später entscheiden
              </button>
              <button
                type="submit"
                className="primary-btn launch-btn"
                disabled={saving || !provider || !model || !canSubmitForm}
              >
                {saving || !canSubmitForm ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                <span>
                  {saving
                    ? 'Konfiguriere...'
                    : canSubmitForm
                    ? `Lastbrowser mit ${botName.trim() || 'Nova'} starten`
                    : oauthNeedsLogin
                    ? 'Bitte erst oben anmelden'
                    : 'Runtime wird vorbereitet'}
                </span>
                {canSubmitForm && !saving && <ArrowRight size={15} />}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
