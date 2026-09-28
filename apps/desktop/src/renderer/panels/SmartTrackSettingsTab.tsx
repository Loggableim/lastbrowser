import React, { useState, useEffect, useRef } from 'react';
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
import { useDesktopI18n } from '../i18n.js';

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
  const { t } = useDesktopI18n();
  const [config, setConfig] = useState<SmartTrackConfig | null>(null);
  const savedConfigRef = useRef<SmartTrackConfig | null>(null);
  const [wall, setWall] = useState<SmartTrackWall | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const data = await window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/smart-track/status' });
      if (data && typeof data === 'object') {
        const loadedConfig = (data as any).config as SmartTrackConfig | undefined;
        if (loadedConfig && typeof loadedConfig.enabled === 'boolean') {
          savedConfigRef.current = loadedConfig;
          setConfig(loadedConfig);
        }
        setWall((data as any).wall);
      }
    } catch (e) {
      console.error('Failed to load Smart Track status:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    try {
      setScanning(true);
      const data = await window.lastbrowser.sidekick.requestWebui({ method: 'POST', path: '/api/smart-track/scan' });
      if (data && typeof data === 'object') {
        setWall((data as any).wall);
        const scannedConfig = (data as any).config as SmartTrackConfig | undefined;
        if (scannedConfig && typeof scannedConfig.enabled === 'boolean') {
          savedConfigRef.current = scannedConfig;
          setConfig(scannedConfig);
        }
        setError(null);
        triggerSuccess();
      }
    } catch (e) {
      console.error('Failed to trigger scan:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async (updated: Partial<SmartTrackConfig>) => {
    if (!config || saving) return;
    const current = savedConfigRef.current || config;
    const newConfig: SmartTrackConfig = {
      ...current,
      ...updated,
      overrides: { ...current.overrides, ...(updated.overrides || {}) },
    };
    setConfig(newConfig);
    try {
      setSaving(true);
      setError(null);
      const response = await window.lastbrowser.sidekick.requestWebui({
        method: 'POST',
        path: '/api/smart-track/config',
        body: newConfig,
      });
      const saved = response && typeof response === 'object' && (response as any).config
        ? (response as any).config as SmartTrackConfig
        : newConfig;
      savedConfigRef.current = saved;
      setConfig(saved);
      window.dispatchEvent(new Event('lastbrowser:orchestration-config-updated'));
      triggerSuccess();
    } catch (e) {
      console.error('Failed to save smart track config:', e);
      setConfig(savedConfigRef.current || config);
      setError(e instanceof Error ? e.message : String(e));
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
        <div>{t('smartTrack.loading')}</div>
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
            <span style={{ color: 'var(--text-muted)' }}>{t('smartTrack.model.default')}</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {tierData?.default || t('smartTrack.model.none')}
            </span>
          </div>
          {tierData?.coding && tierData.coding !== tierData.default && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('smartTrack.model.coding')}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{tierData.coding}</span>
            </div>
          )}
          {tierData?.reasoning && tierData.reasoning !== tierData.default && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('smartTrack.model.reasoning')}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{tierData.reasoning}</span>
            </div>
          )}
        </div>

        {/* Manual Override Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t('smartTrack.assignment')}</label>
          <select
            value={currentOverride}
            disabled={saving || !config}
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
            <option value="auto">✨ {t('smartTrack.model.auto')}</option>
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
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{t('smartTrack.title')}</h3>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            {t('smartTrack.description')}
          </p>
        </div>

        <button
          type="button"
          onClick={handleScan}
          disabled={scanning || saving}
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
            cursor: scanning || saving ? 'not-allowed' : 'pointer',
            opacity: scanning || saving ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} className={scanning ? 'spin-animation' : ''} />
          {scanning ? t('smartTrack.scanning') : t('smartTrack.scan')}
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
          <Check size={14} /> {t('smartTrack.saved')}
        </div>
      )}

      {error && (
        <div role="alert" style={{ padding: '0.55rem 0.8rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', padding: '0.85rem 1rem', border: '1px solid var(--border-color, rgba(255,255,255,0.1))', borderRadius: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', fontSize: '0.82rem' }}>
          <span>
              <strong style={{ display: 'block' }}>{t('smartTrack.enabled')}</strong>
            <span style={{ color: 'var(--text-secondary)' }}>{t('smartTrack.enabledDescription')}</span>
          </span>
          <input
            type="checkbox"
            aria-label={t('smartTrack.enabled')}
            checked={config?.enabled ?? true}
            disabled={saving || !config}
            onChange={(e) => void handleSave({ enabled: e.target.checked })}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', fontSize: '0.82rem' }}>
          <span>
              <strong style={{ display: 'block' }}>{t('smartTrack.autoScan')}</strong>
            <span style={{ color: 'var(--text-secondary)' }}>{t('smartTrack.autoScanDescription')}</span>
          </span>
          <input
            type="checkbox"
            aria-label={t('smartTrack.autoScan')}
            checked={config?.auto_scan ?? true}
            disabled={saving || !config}
            onChange={(e) => void handleSave({ auto_scan: e.target.checked })}
          />
        </label>
        <small style={{ color: 'var(--text-secondary)' }}>
          {t('smartTrack.autoScanNote')}
        </small>
      </div>

      {/* 3-Tier Model Wall */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={16} /> {t('smartTrack.modelWall')}
        </h4>

        {renderTierCard(
          'low',
          t('smartTrack.tier.low'),
          '#10b981',
          t('smartTrack.tier.lowDescription'),
          wall?.low
        )}

        {renderTierCard(
          'medium',
          t('smartTrack.tier.medium'),
          '#3b82f6',
          t('smartTrack.tier.mediumDescription'),
          wall?.medium
        )}

        {renderTierCard(
          'high',
          t('smartTrack.tier.high'),
          '#a855f7',
          t('smartTrack.tier.highDescription'),
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
          <Settings2 size={16} /> {t('smartTrack.advanced')}
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
              {t('smartTrack.preplan')}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              {t('smartTrack.preplanDescription')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={config?.preplan_on_high ?? true}
            disabled={saving || !config}
            onChange={(e) => void handleSave({ preplan_on_high: e.target.checked })}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
        </label>
      </div>
    </div>
  );
};
