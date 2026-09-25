import React, { useState, useEffect } from 'react';
import {
  Target,
  RefreshCw,
  Cpu,
  Zap,
  ShieldCheck,
  Check,
  Settings2,
  Sliders,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  provider_label?: string;
  tier: string;
  tags?: string[];
}

interface TierWallData {
  default: string;
  coding: string;
  web: string;
  reasoning: string;
  models: ModelInfo[];
}

interface SmartTrackWall {
  low: TierWallData;
  medium: TierWallData;
  high: TierWallData;
}

interface SmartTrackConfig {
  enabled: boolean;
  effort: 'low' | 'medium' | 'high';
  auto_scan: boolean;
  overrides: {
    low: string;
    medium: string;
    high: string;
  };
  preplan_on_high: boolean;
}

export const SmartTrackSettingsTab: React.FC = () => {
  const [config, setConfig] = useState<SmartTrackConfig | null>(null);
  const [wall, setWall] = useState<SmartTrackWall | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://127.0.0.1:4141/api/smart-track/status');
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setWall(data.wall);
      }
    } catch (e) {
      console.error('Failed to load Smart Track status:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    try {
      setScanning(true);
      const res = await fetch('http://127.0.0.1:4141/api/smart-track/scan', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setWall(data.wall);
        setConfig(data.config);
        triggerSuccess();
      }
    } catch (e) {
      console.error('Failed to trigger scan:', e);
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async (updated: Partial<SmartTrackConfig>) => {
    if (!config) return;
    const newConfig = { ...config, ...updated };
    setConfig(newConfig);
    try {
      setSaving(true);
      const res = await fetch('http://127.0.0.1:4141/api/smart-track/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        triggerSuccess();
      }
    } catch (e) {
      console.error('Failed to save smart track config:', e);
    } finally {
      setSaving(false);
    }
  };

  const triggerSuccess = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const allAvailableModels: ModelInfo[] = [];
  if (wall) {
    const seen = new Set<string>();
    [wall.low, wall.medium, wall.high].forEach((t) => {
      t?.models?.forEach((m) => {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          allAvailableModels.push(m);
        }
      });
    });
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={24} className="spin-animation" style={{ marginBottom: '0.5rem' }} />
        <div>Lade Modellwand und Smart-Track-Konfiguration...</div>
      </div>
    );
  }

  const renderTierCard = (
    tierKey: 'low' | 'medium' | 'high',
    title: string,
    badgeColor: string,
    desc: string,
    tierData?: TierWallData
  ) => {
    const currentOverride = config?.overrides?.[tierKey] || 'auto';

    return (
      <div
        key={tierKey}
        style={{
          borderRadius: '8px',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.02))',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: `${badgeColor}22`,
                color: badgeColor,
                fontWeight: 600,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}
            >
              {title}
            </span>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{desc}</div>
          </div>
        </div>

        {/* Current Active Routing */}
        <div
          style={{
            padding: '0.6rem 0.8rem',
            borderRadius: '6px',
            background: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            fontSize: '0.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Standard-Modell:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {tierData?.default || 'Kein Modell'}
            </span>
          </div>
          {tierData?.coding && tierData.coding !== tierData.default && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Code-Spezialist:</span>
              <span style={{ color: 'var(--text-secondary)' }}>{tierData.coding}</span>
            </div>
          )}
          {tierData?.reasoning && tierData.reasoning !== tierData.default && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Reasoning-Spezialist:</span>
              <span style={{ color: 'var(--text-secondary)' }}>{tierData.reasoning}</span>
            </div>
          )}
        </div>

        {/* Manual Override Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Manuelle Zuweisung:</label>
          <select
            value={currentOverride}
            onChange={(e) => {
              const updatedOverrides = {
                ...config?.overrides,
                [tierKey]: e.target.value,
              };
              handleSave({ overrides: updatedOverrides as SmartTrackConfig['overrides'] });
            }}
            style={{
              padding: '4px 8px',
              borderRadius: '5px',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
              background: 'var(--bg-primary, #1e1e1e)',
              color: 'var(--text-primary, #fff)',
              fontSize: '0.78rem',
              maxWidth: '220px',
            }}
          >
            <option value="auto">✨ Automatisch (Kuriert)</option>
            {allAvailableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.id} ({m.provider})
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="smart-track-settings-tab" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {/* Overview Banner */}
      <div
        style={{
          padding: '1rem 1.2rem',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(16, 185, 129, 0.08))',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ maxWidth: '520px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <Target size={18} style={{ color: '#3b82f6' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Smart Track (Single Track Orchestrator)</h3>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Sparsames Intent-Routing: Schickt pro Anfrage nur eine kuratierte Modellspur los. Spart bis zu 90 % der
            Tokens gegenüber Multi-Agent-Teamwork. Der interne Agent kuratiert die Modellwand automatisch.
          </p>
        </div>

        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '6px',
            background: 'var(--button-primary-bg, #3b82f6)',
            color: '#fff',
            border: 'none',
            fontSize: '0.82rem',
            fontWeight: 500,
            cursor: scanning ? 'not-allowed' : 'pointer',
            opacity: scanning ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} className={scanning ? 'spin-animation' : ''} />
          {scanning ? 'Scanne Modelle...' : 'Modellwand neu scannen'}
        </button>
      </div>

      {saveSuccess && (
        <div
          style={{
            padding: '0.5rem 0.8rem',
            borderRadius: '6px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Check size={14} /> Einstellungen erfolgreich gespeichert.
        </div>
      )}

      {/* 3-Tier Model Wall */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={16} /> Kuratierte Modellwand (3 Tiers)
        </h4>

        {renderTierCard(
          'low',
          'Tier 1: Low (Eco & High-Speed)',
          '#10b981',
          'Schnell & extrem token-sparend. Ideal für kurze Fragen, Zusammenfassungen und Übersetzungen.',
          wall?.low
        )}

        {renderTierCard(
          'medium',
          'Tier 2: Medium (Balanced & Coding)',
          '#3b82f6',
          'Ausgewogene Präzision für Alltag, Coding und Web-Analysen. Zuverlässiger Standard.',
          wall?.medium
        )}

        {renderTierCard(
          'high',
          'Tier 3: High (Deep Reasoning & Flagship)',
          '#a855f7',
          'Maximale analytische Tiefe für komplexe Architektur, Logik und anspruchsvolle Refactorings.',
          wall?.high
        )}
      </div>

      {/* Advanced Settings */}
      <div
        style={{
          borderRadius: '8px',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.02))',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem',
        }}
      >
        <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Settings2 size={16} /> Zusätzliche Optionen
        </h4>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            fontSize: '0.82rem',
          }}
        >
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
              Strukturierte Vorplanung bei Stufe High
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Schaltet bei High Effort einen kurzen, token-armen Strukturierungsschritt vor, bevor das Flaggschiff-Modell antwortet.
            </div>
          </div>
          <input
            type="checkbox"
            checked={config?.preplan_on_high ?? true}
            onChange={(e) => handleSave({ preplan_on_high: e.target.checked })}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
        </label>
      </div>
    </div>
  );
};
