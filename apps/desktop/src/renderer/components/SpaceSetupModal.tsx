import React, { useState, useMemo, useEffect } from 'react';
import { useDesktopI18n } from '../i18n.js';
import type { DesktopTranslationKey } from '../i18n/keys.js';
import {
  X,
  Sparkles,
  FolderPlus,
  Code2,
  BookOpen,
  Palette,
  Layers,
  ArrowRight,
  ArrowLeft,
  Check,
  Bot,
  Zap,
  Globe,
  Sliders
} from 'lucide-react';

export interface SpaceSetupData {
  path: string;
  name: string;
  color: string;
  model: string;
  modelProvider?: string;
  pinnedApps: { name: string; url: string; color?: string }[];
  startUrl: string;
}

export interface SpaceSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSpace: (data: SpaceSetupData) => Promise<boolean | string>;
  existingSpaceNames?: string[];
}

interface SpacePreset {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  startUrl: string;
  pinnedApps: { name: string; url: string; color: string }[];
}

const PRESETS: SpacePreset[] = [
  {
    id: 'coding-dev',
    name: 'Coding & Dev',
    description: 'Optimiert für Software-Entwicklung, Git-Workflows und Dokumentation.',
    color: '#00d9ff',
    icon: <Code2 size={20} />,
    startUrl: 'https://github.com',
    pinnedApps: [
      { name: 'GitHub', url: 'https://github.com', color: '#24292f' },
      { name: 'Stack Overflow', url: 'https://stackoverflow.com', color: '#f48024' },
      { name: 'DevDocs', url: 'https://devdocs.io', color: '#2b2b2b' },
      { name: 'MDN Docs', url: 'https://developer.mozilla.org', color: '#000000' }
    ]
  },
  {
    id: 'research-writing',
    name: 'Research & Writing',
    description: 'Ideal für Recherche, Paper, Notizen und Deep Thinking.',
    color: '#a855f7',
    icon: <BookOpen size={20} />,
    startUrl: 'https://www.notion.so',
    pinnedApps: [
      { name: 'Notion', url: 'https://notion.so', color: '#000000' },
      { name: 'Wikipedia', url: 'https://wikipedia.org', color: '#ffffff' },
      { name: 'Perplexity', url: 'https://perplexity.ai', color: '#1fb8cd' },
      { name: 'ArXiv', url: 'https://arxiv.org', color: '#b31b1b' }
    ]
  },
  {
    id: 'media-creative',
    name: 'Media & Design',
    description: 'Für Inspiration, UI/UX-Design, Video und Content Creation.',
    color: '#f43f5e',
    icon: <Palette size={20} />,
    startUrl: 'https://www.figma.com',
    pinnedApps: [
      { name: 'Figma', url: 'https://figma.com', color: '#0acf83' },
      { name: 'YouTube', url: 'https://youtube.com', color: '#ff0000' },
      { name: 'Dribbble', url: 'https://dribbble.com', color: '#ea4c89' },
      { name: 'Unsplash', url: 'https://unsplash.com', color: '#000000' }
    ]
  },
  {
    id: 'custom-blank',
    name: 'Freier Space (Blank)',
    description: 'Vollkommen leerer Arbeitsbereich für deine eigenen Routinen.',
    color: '#10b981',
    icon: <Layers size={20} />,
    startUrl: 'app://browser-home',
    pinnedApps: []
  }
];

export function createSpaceSetupDefaults(defaultName: string) {
  return {
    step: 1 as const,
    preset: PRESETS[0],
    name: defaultName,
    color: PRESETS[0].color,
    customPath: '',
    model: 'smart-track',
    startUrl: PRESETS[0].startUrl,
    selectedApps: PRESETS[0].pinnedApps.map((app) => ({ ...app })),
    customAppName: '',
    customAppUrl: '',
    createError: ''
  };
}

const COLOR_SWATCHES = [
  '#00d9ff',
  '#a855f7',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
  '#3b82f6',
  '#ec4899',
  '#06b6d4'
];

const MODE_OPTIONS = [
  {
    id: 'smart-track',
    name: 'Smart Track Auto-Router (Empfohlen)',
    desc: 'Adaptive Single-Track-Pipeline mit dynamischem Modus (Low, Medium, High).',
    badge: 'Adaptiv'
  },
  {
    id: 'teamwork',
    name: 'Teamwork Modus (Multi-Agent)',
    desc: 'Parallele Subagenten mit Orchestrator für komplexe Großaufgaben.',
    badge: 'Multi-Agent'
  },
  {
    id: 'ollama-cloud',
    name: 'Ollama Local / Cloud',
    desc: 'Lokale oder private Cloud-Inferenz für maximale Privatsphäre.',
    badge: 'Lokal'
  }
];

const BUILT_IN_MODEL_IDS = new Set(MODE_OPTIONS.map((option) => option.id));

export function isDuplicateSpaceName(name: string, existingNames: string[]): boolean {
  const normalizedName = name.trim().toLowerCase();
  return Boolean(normalizedName) && existingNames.some((existing) => existing.trim().toLowerCase() === normalizedName);
}

export function normalizePinnedApp(name: string, url: string): { name: string; url: string } | null {
  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  if (!trimmedName || !trimmedUrl) return null;
  try {
    const parsed = new URL(trimmedUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    return { name: trimmedName, url: parsed.toString() };
  } catch {
    return null;
  }
}

export function resolvePresetModel(currentModel: string, availableModelIds: string[]): string {
  const isAvailable = (modelId: string) => BUILT_IN_MODEL_IDS.has(modelId) || availableModelIds.includes(modelId);
  if (isAvailable(currentModel)) return currentModel;
  return 'smart-track';
}

export async function submitSpaceSetup(
  data: SpaceSetupData,
  onCreateSpace: (data: SpaceSetupData) => Promise<boolean | string>,
  onClose: () => void,
  createFailedMessage = 'Could not create the Space. Check the storage path and try again.'
): Promise<Error | null> {
  try {
    const result = await onCreateSpace(data);
    if (result !== true) {
      return new Error(typeof result === 'string' && result.trim() ? result : createFailedMessage);
    }
    onClose();
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

export function SpaceSetupModal({
  isOpen,
  onClose,
  onCreateSpace,
  existingSpaceNames = []
}: SpaceSetupModalProps): React.JSX.Element | null {
  const { t } = useDesktopI18n();
  const initialDefaults = createSpaceSetupDefaults(t('spaceSetup.preset.coding'));
  const [step, setStep] = useState<1 | 2 | 3>(initialDefaults.step);
  const [selectedPreset, setSelectedPreset] = useState<SpacePreset>(initialDefaults.preset);
  const [name, setName] = useState(initialDefaults.name);
  const [color, setColor] = useState(initialDefaults.color);
  const [customPath, setCustomPath] = useState(initialDefaults.customPath);
  const [model, setModel] = useState(initialDefaults.model);
  const [modelProvider, setModelProvider] = useState('');
  const [startUrl, setStartUrl] = useState(initialDefaults.startUrl);
  const [selectedApps, setSelectedApps] = useState(initialDefaults.selectedApps);
  const [customAppName, setCustomAppName] = useState('');
  const [customAppUrl, setCustomAppUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; provider_label?: string; provider?: string }>>([]);

  useEffect(() => {
    if (!isOpen) return;
    const defaults = createSpaceSetupDefaults(t('spaceSetup.preset.coding'));
    setStep(defaults.step);
    setSelectedPreset(defaults.preset);
    setName(defaults.name);
    setColor(defaults.color);
    setCustomPath(defaults.customPath);
    setModel(defaults.model);
    setModelProvider('');
    setStartUrl(defaults.startUrl);
    setSelectedApps(defaults.selectedApps);
    setCustomAppName(defaults.customAppName);
    setCustomAppUrl(defaults.customAppUrl);
    setCreateError(defaults.createError);
    setIsSubmitting(false);

    let active = true;
    void window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/teamwork/status' })
      .then((data: any) => {
        if (!active || !Array.isArray(data?.models)) return;
        const models = data.models.filter((item: any) => typeof item?.id === 'string' && item.id.trim());
        setAvailableModels(models);
        setModel((current) => current === 'smart-track' || models.some((item: any) => item.id === current)
          ? current
          : 'smart-track');
      })
      .catch(() => { if (active) setAvailableModels([]); });
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    if (BUILT_IN_MODEL_IDS.has(model) || availableModels.length === 0) {
      if (BUILT_IN_MODEL_IDS.has(model)) setModelProvider('');
      return;
    }
    setModelProvider((current) => availableModels.some((entry) => entry.id === model && entry.provider === current)
      ? current
      : availableModels.find((entry) => entry.id === model)?.provider || '');
  }, [model, availableModels]);

  const handleSelectPreset = (preset: SpacePreset) => {
    setSelectedPreset(preset);
    const presetNameKeys: Record<string, DesktopTranslationKey> = {
      'coding-dev': 'spaceSetup.preset.coding',
      'research-writing': 'spaceSetup.preset.research',
      'media-creative': 'spaceSetup.preset.media',
      'custom-blank': 'spaceSetup.preset.blank'
    };
    setName(t(presetNameKeys[preset.id]));
    setColor(preset.color);
    setModel((current) => resolvePresetModel(
      current,
      availableModels.map((availableModel) => availableModel.id)
    ));
    setStartUrl(preset.startUrl);
    setSelectedApps([...preset.pinnedApps]);
  };

  const toggleAppSelection = (app: { name: string; url: string; color: string }) => {
    if (selectedApps.some((a) => a.url === app.url)) {
      setSelectedApps(selectedApps.filter((a) => a.url !== app.url));
    } else {
      setSelectedApps([...selectedApps, app]);
    }
  };

  const addCustomApp = () => {
    const app = normalizePinnedApp(customAppName, customAppUrl);
    if (!app || selectedApps.some((existing) => existing.url === app.url)) return;
    setSelectedApps((current) => [...current, { ...app, color }]);
    setCustomAppName('');
    setCustomAppUrl('');
  };

  const slug = useMemo(() => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'space';
  }, [name]);

  const resolvedPath = useMemo(() => {
    if (customPath.trim()) return customPath.trim();
    return `spaces/${slug}`;
  }, [customPath, slug]);

  const duplicateName = isDuplicateSpaceName(name, existingSpaceNames);
  const isNameValid = name.trim().length > 0 && !duplicateName;

  const handleFinish = async () => {
    if (!isNameValid || isSubmitting) return;
    setIsSubmitting(true);
    setCreateError('');
    const error = await submitSpaceSetup({
      path: resolvedPath,
      name: name.trim(),
      color,
      model,
      modelProvider: modelProvider || undefined,
      pinnedApps: selectedApps,
      startUrl: startUrl.trim() || 'app://browser-home'
    }, onCreateSpace, onClose, t('spaceSetup.createFailed'));
    if (error) setCreateError(error.message);
    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="space-setup-modal-backdrop" onClick={() => { if (!isSubmitting) onClose(); }}>
      <div className="space-setup-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-busy={isSubmitting} aria-labelledby="space-setup-title">
        {/* Header */}
        <div className="space-setup-modal-header">
          <div className="space-setup-header-title">
            <div className="space-setup-header-icon" style={{ borderColor: color, color }}>
              <FolderPlus size={18} />
            </div>
            <div>
              <h3 id="space-setup-title">{t('spaceSetup.title')}</h3>
              <p>{t('spaceSetup.subtitle')}</p>
            </div>
          </div>
          <button type="button" className="space-setup-close-btn" onClick={onClose} aria-label={t('common.close')} disabled={isSubmitting}>
            <X size={16} />
          </button>
        </div>

        {/* Steps Breadcrumb */}
        <div className="space-setup-stepper">
          {[
            { num: 1, label: t('spaceSetup.stepTemplate') },
            { num: 2, label: t('spaceSetup.stepModel') },
            { num: 3, label: t('spaceSetup.stepApps') }
          ].map((s) => (
            <div
              key={s.num}
              className={`space-step-pill ${step === s.num ? 'active' : step > s.num ? 'completed' : ''}`}
              onClick={() => {
                if (isNameValid) setStep(s.num as 1 | 2 | 3);
              }}
            >
              <span className="step-num">{step > s.num ? <Check size={11} /> : s.num}</span>
              <span className="step-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Modal Body */}
        <div className="space-setup-body">
          {/* STEP 1: Presets & Basic Info */}
          {step === 1 && (
            <div className="space-step-content">
              <label className="space-setup-label">{t('spaceSetup.chooseTemplate')}</label>
              <div className="space-presets-grid">
                {PRESETS.map((p) => (
                  (() => {
                    const presetCopyKeys: Record<string, [DesktopTranslationKey, DesktopTranslationKey]> = {
                      'coding-dev': ['spaceSetup.preset.coding', 'spaceSetup.preset.codingDescription'],
                      'research-writing': ['spaceSetup.preset.research', 'spaceSetup.preset.researchDescription'],
                      'media-creative': ['spaceSetup.preset.media', 'spaceSetup.preset.mediaDescription'],
                      'custom-blank': ['spaceSetup.preset.blank', 'spaceSetup.preset.blankDescription']
                    };
                    const [nameKey, descriptionKey] = presetCopyKeys[p.id];
                    return (
                  <div
                    key={p.id}
                    className={`space-preset-card ${selectedPreset.id === p.id ? 'active' : ''}`}
                    onClick={() => handleSelectPreset(p)}
                    style={{ '--preset-color': p.color } as React.CSSProperties}
                  >
                    <div className="preset-card-icon" style={{ color: p.color }}>
                      {p.icon}
                    </div>
                    <div className="preset-card-info">
                      <strong>{t(nameKey)}</strong>
                      <p>{t(descriptionKey)}</p>
                    </div>
                    {selectedPreset.id === p.id && (
                      <div className="preset-check-badge" style={{ background: p.color }}>
                        <Check size={12} color="#000" />
                      </div>
                    )}
                  </div>
                    );
                  })()
                ))}
              </div>

              <div className="space-setup-form-row">
                <div className="space-field-group" style={{ flex: 2 }}>
                  <label className="space-setup-label">{t('spaceSetup.name')}</label>
                  <input
                    type="text"
                    className="space-setup-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('spaceSetup.namePlaceholder')}
                    aria-invalid={duplicateName}
                    autoFocus
                  />
                  {duplicateName && <span className="space-hint" role="alert">{t('spaceSetup.duplicateName')}</span>}
                </div>

                <div className="space-field-group" style={{ flex: 1 }}>
                  <label className="space-setup-label">{t('spaceSetup.colorAccent')}</label>
                  <div className="space-color-swatches">
                    {COLOR_SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        className={`space-color-dot ${color === swatch ? 'active' : ''}`}
                        style={{ background: swatch }}
                        onClick={() => setColor(swatch)}
                        aria-label={t('spaceSetup.colorSwatch', { color: swatch })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-field-group" style={{ marginTop: 12 }}>
                <label className="space-setup-label">{t('spaceSetup.pathOptional')}</label>
                <input
                  type="text"
                  className="space-setup-input"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder={resolvedPath}
                />
                <span className="space-hint">{t('spaceSetup.pathHint', { path: resolvedPath })}</span>
              </div>
            </div>
          )}

          {/* STEP 2: AI Model Selection */}
          {step === 2 && (
            <div className="space-step-content">
              <label className="space-setup-label">{t('spaceSetup.modelLabel')}</label>
              <p className="space-step-description">
                {t('spaceSetup.modelDescription')}
              </p>

              <div className="space-models-list">
                {[
                  ...MODE_OPTIONS.map((mode) => {
                    const nameKey = `spaceSetup.model.${mode.id === 'smart-track' ? 'smartTrack' : mode.id === 'teamwork' ? 'teamwork' : 'ollama'}` as DesktopTranslationKey;
                    const descKey = `spaceSetup.model.${mode.id === 'smart-track' ? 'smartTrackDescription' : mode.id === 'teamwork' ? 'teamworkDescription' : 'ollamaDescription'}` as DesktopTranslationKey;
                    const badgeKey = `spaceSetup.model.${mode.id === 'smart-track' ? 'adaptive' : mode.id === 'teamwork' ? 'multiAgent' : 'local'}` as DesktopTranslationKey;
                    return { id: mode.id, provider: '', name: t(nameKey), desc: t(descKey), badge: t(badgeKey) };
                  }),
                  ...availableModels.map((entry) => ({
                    id: entry.id,
                    provider: entry.provider || '',
                    name: entry.name || entry.id,
                    desc: t('spaceSetup.model.availableVia', { provider: entry.provider_label || entry.provider || 'Provider' }),
                    badge: entry.provider_label || entry.provider || 'Live'
                  }))
                ].map((m) => (
                  <div
                    key={m.id}
                    className={`space-model-item ${model === m.id && modelProvider === m.provider ? 'active' : ''}`}
                    onClick={() => {
                      setModel(m.id);
                      setModelProvider(m.provider);
                    }}
                  >
                    <div className="model-radio-icon">
                      {model === m.id && modelProvider === m.provider ? (
                        <div className="radio-dot-checked" style={{ background: color }} />
                      ) : (
                        <div className="radio-dot-empty" />
                      )}
                    </div>
                    <div className="model-item-details">
                      <div className="model-item-title-row">
                        <strong>{m.name}</strong>
                        <span className="model-badge">{m.badge}</span>
                      </div>
                      <p>{m.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Pinned Web Apps & Start Tab */}
          {step === 3 && (
            <div className="space-step-content">
              <label className="space-setup-label">{t('spaceSetup.appsLabel')}</label>
              <p className="space-step-description">
                {t('spaceSetup.appsDescription')}
              </p>

              <div className="space-apps-selector-grid">
                {selectedPreset.pinnedApps.length > 0 ? (
                  selectedPreset.pinnedApps.map((app) => {
                    const isChecked = selectedApps.some((a) => a.url === app.url);
                    return (
                      <div
                        key={app.url}
                        className={`space-app-check-item ${isChecked ? 'checked' : ''}`}
                        onClick={() => toggleAppSelection(app)}
                      >
                        <div className="app-checkbox" style={{ borderColor: isChecked ? color : undefined, background: isChecked ? color : undefined }}>
                          {isChecked && <Check size={12} color="#000" />}
                        </div>
                        <span className="app-name">{app.name}</span>
                        <span className="app-domain">{new URL(app.url).hostname}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="space-hint" style={{ gridColumn: '1 / -1' }}>
                    {t('spaceSetup.noPresetApps')}
                  </p>
                )}
              </div>

              <div className="space-setup-form-row" style={{ marginTop: 12 }}>
                <div className="space-field-group" style={{ flex: 1 }}>
                  <label className="space-setup-label" htmlFor="space-custom-app-name">{t('spaceSetup.customAppName')}</label>
                  <input id="space-custom-app-name" className="space-setup-input" value={customAppName} onChange={(event) => setCustomAppName(event.target.value)} placeholder={t('spaceSetup.namePlaceholderCustom')} />
                </div>
                <div className="space-field-group" style={{ flex: 2 }}>
                  <label className="space-setup-label" htmlFor="space-custom-app-url">{t('spaceSetup.webAddress')}</label>
                  <input id="space-custom-app-url" className="space-setup-input" value={customAppUrl} onChange={(event) => setCustomAppUrl(event.target.value)} placeholder={t('spaceSetup.urlPlaceholder')} />
                </div>
                <button type="button" className="space-btn secondary" disabled={!normalizePinnedApp(customAppName, customAppUrl) || selectedApps.some((app) => app.url === normalizePinnedApp(customAppName, customAppUrl)?.url)} onClick={addCustomApp}>{t('spaceSetup.addApp')}</button>
              </div>
              {selectedApps.length > 0 && <div className="space-hint" aria-live="polite">{t('spaceSetup.pinnedApps', { apps: selectedApps.map((app) => app.name).join(', ') })}</div>}

              <div className="space-field-group" style={{ marginTop: 18 }}>
                <label className="space-setup-label">{t('spaceSetup.startPage')}</label>
                <input
                  type="text"
                  className="space-setup-input"
                  value={startUrl}
                  onChange={(e) => setStartUrl(e.target.value)}
                  placeholder={t('spaceSetup.startPagePlaceholder')}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="space-setup-modal-footer">
          {createError && <p className="space-hint" role="alert" style={{ color: '#f87171', flexBasis: '100%' }}>{createError}</p>}
          {step > 1 ? (
            <button
              type="button"
              className="space-btn secondary"
              disabled={isSubmitting}
              onClick={() => setStep((step - 1) as 1 | 2 | 3)}
            >
              <ArrowLeft size={14} />
              <span>{t('common.back')}</span>
            </button>
          ) : (
            <button type="button" className="space-btn secondary" onClick={onClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              className="space-btn primary"
              disabled={!isNameValid || isSubmitting}
              onClick={() => setStep((step + 1) as 1 | 2 | 3)}
              style={{ background: color, color: '#000000' }}
            >
              <span>{t('common.next')}</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="space-btn primary finish"
              disabled={!isNameValid || isSubmitting}
              onClick={() => void handleFinish()}
              style={{ background: color, color: '#000000' }}
            >
              <Check size={15} />
              <span>{isSubmitting ? t('spaceSetup.submitting') : t('spaceSetup.createAndOpen')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
