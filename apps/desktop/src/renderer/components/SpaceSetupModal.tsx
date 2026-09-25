import React, { useState, useMemo } from 'react';
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
  pinnedApps: { name: string; url: string; color?: string }[];
  startUrl: string;
}

export interface SpaceSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSpace: (data: SpaceSetupData) => void;
  existingSpaceNames?: string[];
}

interface SpacePreset {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  defaultModel: string;
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
    defaultModel: 'smart-track',
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
    defaultModel: 'gemini-2.5-pro',
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
    defaultModel: 'gemini-2.5-flash',
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
    defaultModel: 'smart-track',
    startUrl: 'app://browser-home',
    pinnedApps: []
  }
];

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

const MODEL_OPTIONS = [
  {
    id: 'smart-track',
    name: 'Smart Track Auto-Router (Empfohlen)',
    desc: 'Adaptive Single-Track-Pipeline mit dynamischem Modus (Low, Medium, High).',
    badge: 'Adaptiv'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Google Gemini 2.5 Flash',
    desc: 'Extrem schnell, 1M Kontextfenster, multimodal & sparsam.',
    badge: 'Schnell'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Google Gemini 2.5 Pro',
    desc: 'Maximale logische Tiefe für Code-Reviews und tiefe Recherche.',
    badge: 'Pro'
  },
  {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    desc: 'Hervorragendes Coding und nuancierte Text-Generierung.',
    badge: 'Hybrid'
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

export function SpaceSetupModal({
  isOpen,
  onClose,
  onCreateSpace,
  existingSpaceNames = []
}: SpaceSetupModalProps): React.JSX.Element | null {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedPreset, setSelectedPreset] = useState<SpacePreset>(PRESETS[0]);
  const [name, setName] = useState(PRESETS[0].name);
  const [color, setColor] = useState(PRESETS[0].color);
  const [customPath, setCustomPath] = useState('');
  const [model, setModel] = useState(PRESETS[0].defaultModel);
  const [startUrl, setStartUrl] = useState(PRESETS[0].startUrl);
  const [selectedApps, setSelectedApps] = useState<{ name: string; url: string; color: string }[]>(
    PRESETS[0].pinnedApps
  );

  const handleSelectPreset = (preset: SpacePreset) => {
    setSelectedPreset(preset);
    setName(preset.name);
    setColor(preset.color);
    setModel(preset.defaultModel);
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

  const isNameValid = name.trim().length > 0;

  const handleFinish = () => {
    if (!isNameValid) return;
    onCreateSpace({
      path: resolvedPath,
      name: name.trim(),
      color,
      model,
      pinnedApps: selectedApps,
      startUrl: startUrl.trim() || 'app://browser-home'
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="space-setup-modal-backdrop" onClick={onClose}>
      <div className="space-setup-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="space-setup-modal-header">
          <div className="space-setup-header-title">
            <div className="space-setup-header-icon" style={{ borderColor: color, color }}>
              <FolderPlus size={18} />
            </div>
            <div>
              <h3>Neuen Space einrichten</h3>
              <p>Strukturierter Arbeitsbereich mit eigenem Profil, KI-Modell & Apps</p>
            </div>
          </div>
          <button type="button" className="space-setup-close-btn" onClick={onClose} aria-label="Schließen">
            <X size={16} />
          </button>
        </div>

        {/* Steps Breadcrumb */}
        <div className="space-setup-stepper">
          {[
            { num: 1, label: '1. Vorlage & Basis' },
            { num: 2, label: '2. KI-Modell' },
            { num: 3, label: '3. Web-Apps & Start' }
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
              <label className="space-setup-label">Wähle eine Vorlage</label>
              <div className="space-presets-grid">
                {PRESETS.map((p) => (
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
                      <strong>{p.name}</strong>
                      <p>{p.description}</p>
                    </div>
                    {selectedPreset.id === p.id && (
                      <div className="preset-check-badge" style={{ background: p.color }}>
                        <Check size={12} color="#000" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-setup-form-row">
                <div className="space-field-group" style={{ flex: 2 }}>
                  <label className="space-setup-label">Name des Space</label>
                  <input
                    type="text"
                    className="space-setup-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="z. B. Coding & Dev"
                    autoFocus
                  />
                </div>

                <div className="space-field-group" style={{ flex: 1 }}>
                  <label className="space-setup-label">Farb-Akzent</label>
                  <div className="space-color-swatches">
                    {COLOR_SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        className={`space-color-dot ${color === swatch ? 'active' : ''}`}
                        style={{ background: swatch }}
                        onClick={() => setColor(swatch)}
                        aria-label={`Farbe ${swatch}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-field-group" style={{ marginTop: 12 }}>
                <label className="space-setup-label">Speicherort / Pfad (Optional)</label>
                <input
                  type="text"
                  className="space-setup-input"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder={resolvedPath}
                />
                <span className="space-hint">Wird standardmäßig in <code>~/.sidekick/{resolvedPath}</code> isoliert.</span>
              </div>
            </div>
          )}

          {/* STEP 2: AI Model Selection */}
          {step === 2 && (
            <div className="space-step-content">
              <label className="space-setup-label">Standard-KI für diesen Space</label>
              <p className="space-step-description">
                Jeder Space kann ein bevorzugtes Modell oder Routing nutzen. Der Chat startet automatisch in diesem Modus.
              </p>

              <div className="space-models-list">
                {MODEL_OPTIONS.map((m) => (
                  <div
                    key={m.id}
                    className={`space-model-item ${model === m.id ? 'active' : ''}`}
                    onClick={() => setModel(m.id)}
                  >
                    <div className="model-radio-icon">
                      {model === m.id ? (
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
              <label className="space-setup-label">Angeheftete Web-Apps</label>
              <p className="space-step-description">
                Wähle die Standard-Webapps, die in der Seitenleiste dieses Space angeheftet werden sollen:
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
                    Keine vorausgewählten Apps für diese Vorlage. Du kannst Apps jederzeit über das Dock hinzufügen.
                  </p>
                )}
              </div>

              <div className="space-field-group" style={{ marginTop: 18 }}>
                <label className="space-setup-label">Start-Webseite beim Öffnen</label>
                <input
                  type="text"
                  className="space-setup-input"
                  value={startUrl}
                  onChange={(e) => setStartUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="space-setup-modal-footer">
          {step > 1 ? (
            <button
              type="button"
              className="space-btn secondary"
              onClick={() => setStep((step - 1) as 1 | 2 | 3)}
            >
              <ArrowLeft size={14} />
              <span>Zurück</span>
            </button>
          ) : (
            <button type="button" className="space-btn secondary" onClick={onClose}>
              Abbrechen
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              className="space-btn primary"
              disabled={!isNameValid}
              onClick={() => setStep((step + 1) as 1 | 2 | 3)}
              style={{ background: color, color: '#000000' }}
            >
              <span>Weiter</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="space-btn primary finish"
              disabled={!isNameValid}
              onClick={handleFinish}
              style={{ background: color, color: '#000000' }}
            >
              <Check size={15} />
              <span>Space erstellen & öffnen</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
