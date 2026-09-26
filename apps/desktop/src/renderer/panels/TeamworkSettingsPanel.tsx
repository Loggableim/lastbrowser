/**
 * TeamworkSettingsPanel.tsx
 *
 * Visual configuration panel for the Lastbrowser Teamwork Mode (Multi-Agent Orchestrator).
 * Allows users to configure:
 * - Consensus & Debate strategy presets (cost, balanced, quality)
 * - Maximum subagents capacity slider (1-8) with dynamic auto-scaling
 * - Role overrides (Planner, Worker Pool, Critic, Synthesizer) mapped to detected models
 * - Shared browser grounding
 */

import React, { useEffect, useState, useId } from 'react';
import {
  Users,
  Zap,
  Scale,
  Brain,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Save,
  Loader2,
  Eye,
  ShieldAlert,
  Sparkles,
  Info,
  Target
} from 'lucide-react';
import { SettingsCard, SettingsField, SettingsToggle } from './SystemPanels.js';
import { SmartTrackSettingsTab } from './SmartTrackSettingsTab.js';

export interface TeamworkConfig {
  enabled: boolean;
  strategy: 'cost' | 'balanced' | 'quality';
  auto_scale: boolean;
  max_subagents: number;
  shared_grounding: boolean;
  roles: {
    planner: string;
    worker_pool: string | string[];
    critic: string;
    synthesizer: string;
  };
  hot_swap: {
    enabled: boolean;
    fallback_quorum_min: number;
  };
}

export interface DetectedModelItem {
  id: string;
  name: string;
  provider: string;
  provider_label?: string;
  tier?: 'fast' | 'balanced' | 'quality';
}

const DEFAULT_CONFIG: TeamworkConfig = {
  enabled: true,
  strategy: 'balanced',
  auto_scale: true,
  max_subagents: 4,
  shared_grounding: true,
  roles: {
    planner: 'auto',
    worker_pool: 'auto',
    critic: 'auto',
    synthesizer: 'auto'
  },
  hot_swap: {
    enabled: true,
    fallback_quorum_min: 1
  }
};

export function TeamworkSettingsPanel(): JSX.Element {
  const [config, setConfig] = useState<TeamworkConfig>(DEFAULT_CONFIG);
  const [initialConfig, setInitialConfig] = useState<TeamworkConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'teamwork' | 'smart-track'>('teamwork');
  const [models, setModels] = useState<DetectedModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plannerSelectId = useId();
  const criticSelectId = useId();
  const synthSelectId = useId();

  // Load live config and detected models
  useEffect(() => {
    let alive = true;
    async function loadData() {
      try {
        setLoading(true);
        const [configRes, statusRes] = await Promise.all([
          window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/teamwork/config' }),
          window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/teamwork/status' })
        ]);

        if (!alive) return;

        if (configRes && typeof configRes === 'object') {
          const merged = { ...DEFAULT_CONFIG, ...configRes };
          setConfig(merged);
          setInitialConfig(merged);
        }

        if (statusRes && typeof statusRes === 'object' && Array.isArray((statusRes as any).models)) {
          setModels((statusRes as any).models);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void loadData();
    return () => {
      alive = false;
    };
  }, []);

  const isDirty = JSON.stringify(config) !== JSON.stringify(initialConfig);

  async function handleSave(): Promise<void> {
    try {
      setSaving(true);
      setError(null);
      const res = await window.lastbrowser.sidekick.requestWebui({
        method: 'POST',
        path: '/api/teamwork/config',
        body: config
      });
      if (res && (res as any).config) {
        setConfig((res as any).config);
        setInitialConfig((res as any).config);
      } else {
        setInitialConfig(config);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2800);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleReset(): void {
    setConfig(initialConfig);
  }

  // Group models by provider label
  const groupedModels = React.useMemo(() => {
    const map = new Map<string, DetectedModelItem[]>();
    for (const m of models) {
      const groupName = m.provider_label || m.provider || 'Other';
      const list = map.get(groupName) || [];
      list.push(m);
      map.set(groupName, list);
    }
    return Array.from(map.entries());
  }, [models]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
        <Loader2 className="spin" size={24} style={{ marginRight: '0.75rem' }} />
        <span>Teamwork-Konfiguration und Modell-Pool werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="teamwork-settings-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))', paddingBottom: '0.6rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('teamwork')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'teamwork' ? 'var(--accent, #6366f1)' : 'rgba(255, 255, 255, 0.05)',
            color: activeTab === 'teamwork' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 500,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <Users size={15} />
          <span>Teamwork (Multi-Agent)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('smart-track')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'smart-track' ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
            color: activeTab === 'smart-track' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 500,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <Target size={15} />
          <span>Smart Track & Modellwand (Single Track)</span>
        </button>
      </div>

      {activeTab === 'smart-track' ? (
        <SmartTrackSettingsTab />
      ) : (
        <>
      {/* Header Banner */}
      <section className="settings-card native-work-card" style={{ padding: '1.25rem', borderLeft: '3px solid var(--accent, #6366f1)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <Users size={20} style={{ color: 'var(--accent, #6366f1)' }} />
              <strong style={{ fontSize: '1.1rem' }}>Teamwork & Multi-Agent Orchestrator</strong>
              <span className="native-rest-pill ready" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                Konsens & Debatte
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
              Kombiniert verbundene LLMs (Google Gemini CLI, Ollama Cloud/Lokal, OpenAI, Anthropic) automatisch über einen koordinierten
              Konsens- und Debattenprozess für präzisere, schnellere und hallucination-geprüfte Antworten.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            {isDirty && (
              <button
                type="button"
                className="secondary-action compact"
                onClick={handleReset}
                disabled={saving}
                title="Änderungen verwerfen"
              >
                <RefreshCw size={14} />
                <span>Zurücksetzen</span>
              </button>
            )}
            <button
              type="button"
              className="primary-action compact"
              onClick={() => void handleSave()}
              disabled={saving || !isDirty}
              style={{ minWidth: '100px' }}
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="spin" />
                  <span>Speichern...</span>
                </>
              ) : savedSuccess ? (
                <>
                  <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                  <span>Gespeichert</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Speichern</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Global Enable Switch */}
      <SettingsCard
        title="Modus-Aktivierung"
        description="Bestimmt, ob der Teamwork-Orchestrator in der Modell-Auswahl des Chats zur Verfügung steht."
      >
        <SettingsToggle
          label="Teamwork-Orchestrierung aktiv"
          description="Ermöglicht die Auswahl von 'Teamwork (Multi-Agent)' direkt im Copilot-Modellmenü."
          checked={config.enabled}
          onChange={(checked) => setConfig((prev) => ({ ...prev, enabled: checked }))}
        />
      </SettingsCard>

      {/* Strategy Presets */}
      <SettingsCard
        title="Orchestrator-Strategie"
        description="Wähle die globale Ausrichtungsstrategie für die Auswahl und Steuerung der debattierenden Subagenten."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
          {/* Cost Preset */}
          <div
            onClick={() => setConfig((prev) => ({ ...prev, strategy: 'cost' }))}
            style={{
              padding: '1rem',
              borderRadius: '8px',
              border: config.strategy === 'cost' ? '2px solid var(--accent, #6366f1)' : '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              background: config.strategy === 'cost' ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-bg, rgba(255,255,255,0.02))',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.9rem' }}>
                <Zap size={16} style={{ color: '#eab308' }} />
                <span>Kosten & Tempo</span>
              </div>
              {config.strategy === 'cost' && <CheckCircle2 size={16} style={{ color: 'var(--accent, #6366f1)' }} />}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.35 }}>
              Bevorzugt schnelle, schlanke Modelle (Gemini Flash-Lite, kompakte Cloud-Modelle). Minimaler Token-Verbrauch bei maximaler Geschwindigkeit.
            </p>
          </div>

          {/* Balanced Preset */}
          <div
            onClick={() => setConfig((prev) => ({ ...prev, strategy: 'balanced' }))}
            style={{
              padding: '1rem',
              borderRadius: '8px',
              border: config.strategy === 'balanced' ? '2px solid var(--accent, #6366f1)' : '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              background: config.strategy === 'balanced' ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-bg, rgba(255,255,255,0.02))',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.9rem' }}>
                <Scale size={16} style={{ color: '#38bdf8' }} />
                <span>Ausgewogen (Empfohlen)</span>
              </div>
              {config.strategy === 'balanced' && <CheckCircle2 size={16} style={{ color: 'var(--accent, #6366f1)' }} />}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.35 }}>
              Intelligenter Mix aus Reaktionszeit und logischer Tiefe. Verbindet Coder-, Reasoning- und General-Purpose-Modelle.
            </p>
          </div>

          {/* Quality Preset */}
          <div
            onClick={() => setConfig((prev) => ({ ...prev, strategy: 'quality' }))}
            style={{
              padding: '1rem',
              borderRadius: '8px',
              border: config.strategy === 'quality' ? '2px solid var(--accent, #6366f1)' : '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              background: config.strategy === 'quality' ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-bg, rgba(255,255,255,0.02))',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.9rem' }}>
                <Brain size={16} style={{ color: '#a855f7' }} />
                <span>Maximale Qualität</span>
              </div>
              {config.strategy === 'quality' && <CheckCircle2 size={16} style={{ color: 'var(--accent, #6366f1)' }} />}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.35 }}>
              Maximale analytische Tiefe. Bindet Deep-Reasoning und Pro-Modelle (Gemini 2.5 Pro, DeepSeek R1) für anspruchsvolle Architektur ein.
            </p>
          </div>
        </div>
      </SettingsCard>

      {/* Capacity & Auto-Scale */}
      <SettingsCard
        title="Kapazität & Dynamische Skalierung"
        description="Steuere die maximale Anzahl parallel arbeitender Subagenten und die automatische Anpassung."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>Maximale Subagenten (Obergrenze):</span>
              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--accent, #6366f1)' }}>
                {config.max_subagents} {config.max_subagents === 1 ? 'Subagent' : 'Subagenten'}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={config.max_subagents}
              onChange={(e) => setConfig((prev) => ({ ...prev, max_subagents: Number(e.target.value) }))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              <span>1 (Minimal)</span>
              <span>3–4 (Empfohlen für optimale Balance)</span>
              <span>8 (Maximum)</span>
            </div>
          </div>

          <SettingsToggle
            label="Dynamisches Auto-Scaling"
            description="Der Orchestrator analysiert die Komplexität der Anfrage und startet nur so viele Subagenten wie nötig (einfache Fragen = 2 Modelle, komplexe Refactorings = bis zum Limit)."
            checked={config.auto_scale}
            onChange={(checked) => setConfig((prev) => ({ ...prev, auto_scale: checked }))}
          />

          <SettingsToggle
            label="Shared Browser Grounding"
            description="Liest den aktiven Browser-Tab (Titel, URL, DOM-Auszug) vor dem Start der Debatte einmalig ein, sodass alle Modelle mit denselben Fakten arbeiten."
            checked={config.shared_grounding}
            onChange={(checked) => setConfig((prev) => ({ ...prev, shared_grounding: checked }))}
          />
        </div>
      </SettingsCard>

      {/* Role Assignment */}
      <SettingsCard
        title="Rollen-Zuweisung & Modell-Overrides"
        description="Standardmäßig wählt der Orchestrator Modelle passend zur Strategie ('Auto'). Du kannst hier für jede Schlüsselrolle feste Modelle erzwingen."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {/* Planner */}
          <SettingsField
            label="1. Architekt / Planer"
            description="Analysiert die Fragestellung und koordiniert die Teilaspekte."
          >
            <select
              id={plannerSelectId}
              value={config.roles.planner || 'auto'}
              onChange={(e) => setConfig((prev) => ({
                ...prev,
                roles: { ...prev.roles, planner: e.target.value }
              }))}
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'inherit', border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))' }}
            >
              <option value="auto">Auto (Intelligent geroutet gemäß Strategie)</option>
              {groupedModels.map(([providerName, modelList]) => (
                <optgroup key={providerName} label={providerName}>
                  {modelList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </SettingsField>

          <SettingsField
            label="Worker-Pool"
            description="Lege fest, welche der aktuell erkannten Modelle parallele Entwürfe erzeugen dürfen. Mehrfachauswahl wird durch Strg/Cmd unterstützt."
          >
            <select
              aria-label="Worker-Pool Modelle"
              multiple
              value={Array.isArray(config.roles.worker_pool) ? config.roles.worker_pool : config.roles.worker_pool === 'auto' ? ['auto'] : [config.roles.worker_pool]}
              onChange={(e) => {
                const selected = Array.from(e.currentTarget.selectedOptions, (option) => option.value);
                const normalized = selected.includes('auto') ? ['auto'] : selected;
                setConfig((prev) => ({
                  ...prev,
                  roles: { ...prev.roles, worker_pool: normalized.length ? normalized : ['auto'] }
                }));
              }}
              style={{ width: '100%', minHeight: '7rem', padding: '0.45rem', borderRadius: '6px', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'inherit', border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))' }}
            >
              <option value="auto">Auto (live erkannter Pool)</option>
              {groupedModels.map(([providerName, modelList]) => (
                <optgroup key={providerName} label={providerName}>
                  {modelList.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
                </optgroup>
              ))}
            </select>
          </SettingsField>

          {/* Critic */}
          <SettingsField
            label="2. Critic / Reviewer"
            description="Vergleicht parallele Entwürfe, deckt Widersprüche auf und empfiehlt die Synthese."
          >
            <select
              id={criticSelectId}
              value={config.roles.critic || 'auto'}
              onChange={(e) => setConfig((prev) => ({
                ...prev,
                roles: { ...prev.roles, critic: e.target.value }
              }))}
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'inherit', border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))' }}
            >
              <option value="auto">Auto (Intelligent geroutet gemäß Strategie)</option>
              {groupedModels.map(([providerName, modelList]) => (
                <optgroup key={providerName} label={providerName}>
                  {modelList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </SettingsField>

          {/* Synthesizer */}
          <SettingsField
            label="3. Synthesizer (Finale Antwort)"
            description="Schreibt die finale, zusammengeführte Antwort für den Nutzer."
          >
            <select
              id={synthSelectId}
              value={config.roles.synthesizer || 'auto'}
              onChange={(e) => setConfig((prev) => ({
                ...prev,
                roles: { ...prev.roles, synthesizer: e.target.value }
              }))}
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', background: 'var(--input-bg, rgba(255,255,255,0.05))', color: 'inherit', border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))' }}
            >
              <option value="auto">Auto (Intelligent geroutet gemäß Strategie)</option>
              {groupedModels.map(([providerName, modelList]) => (
                <optgroup key={providerName} label={providerName}>
                  {modelList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </SettingsField>
        </div>
      </SettingsCard>

      {/* Connected Model Pool Overview */}
      <SettingsCard
        title="Erkannter Modell-Pool"
        description="Alle aktuell erkannten und einsatzbereiten Modelle, die dem Orchestrator für Debatten zur Verfügung stehen."
        action={
          <span className="native-rest-pill ready">
            <span className="status-dot ready" />
            {models.length} {models.length === 1 ? 'Modell einsatzbereit' : 'Modelle einsatzbereit'}
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
          {models.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Keine externen Modelle verbunden. Es wird auf die integrierten Standardmodelle zurückgegriffen.
            </p>
          ) : (
            models.map((m) => {
              const tierBadge =
                m.tier === 'quality'
                  ? { label: '🧠 Quality', color: '#a855f7' }
                  : m.tier === 'fast'
                  ? { label: '⚡ Fast', color: '#eab308' }
                  : { label: '⚖️ Balanced', color: '#38bdf8' };

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.65rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                    fontSize: '0.8rem'
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{m.name}</span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: `${tierBadge.color}18`,
                      color: tierBadge.color,
                      border: `1px solid ${tierBadge.color}33`
                    }}
                  >
                    {tierBadge.label}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    ({m.provider_label || m.provider})
                  </span>
                </div>
              );
            })
          )}
        </div>
      </SettingsCard>
        </>
      )}
    </div>
  );
}
