import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Globe,
  Sparkles,
  ExternalLink,
  Trash2,
  Check,
  Pin
} from 'lucide-react';
import {
  type PinnedApp,
  PRESET_PINNED_APPS,
  extractAppDomain,
  getFaviconUrl,
  usePinnedAppStore
} from '../stores/usePinnedAppStore.js';

export interface PinnedAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  editApp?: PinnedApp | null;
  activeTab?: { title: string; url: string; favicon?: string } | null;
}

const COLOR_PALETTE = [
  { name: 'Cyan', color: '#00d9ff', bg: 'rgba(0, 217, 255, 0.15)' },
  { name: 'Emerald', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  { name: 'Purple', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
  { name: 'Amber', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  { name: 'Rose', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' },
  { name: 'Blue', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  { name: 'Pink', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
  { name: 'Green', color: '#a8ff3e', bg: 'rgba(168, 255, 62, 0.15)' }
];

export function PinnedAppModal({
  isOpen,
  onClose,
  editApp,
  activeTab
}: PinnedAppModalProps): React.JSX.Element | null {
  const { addApp, updateApp, removeApp, pinTabAsApp, apps } = usePinnedAppStore();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [activeTabPinned, setActiveTabPinned] = useState(false);

  useEffect(() => {
    if (editApp) {
      setName(editApp.name);
      setUrl(editApp.url || '');
      const matched = COLOR_PALETTE.find((c) => c.color === editApp.color) || {
        name: 'Custom',
        color: editApp.color,
        bg: editApp.bg
      };
      setSelectedColor(matched);
    } else {
      setName('');
      setUrl('');
      setSelectedColor(COLOR_PALETTE[0]);
    }
  }, [editApp, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const domain = extractAppDomain(url);
  const previewFavicon = url ? getFaviconUrl(url) : '';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editApp) {
      updateApp(editApp.id, {
        name: name.trim(),
        url: url.trim() || undefined,
        color: selectedColor.color,
        bg: selectedColor.bg,
        domain: extractAppDomain(url),
        faviconUrl: url ? getFaviconUrl(url) : undefined
      });
    } else {
      addApp({
        name: name.trim(),
        url: url.trim() || undefined,
        color: selectedColor.color,
        bg: selectedColor.bg,
        domain: extractAppDomain(url),
        faviconUrl: url ? getFaviconUrl(url) : undefined
      });
    }
    onClose();
  };

  const handleSelectPreset = (preset: PinnedApp) => {
    const existing = apps.find(
      (a) => (a.domain && a.domain === preset.domain) || a.id === preset.id
    );
    if (!existing) {
      addApp({
        id: preset.id,
        name: preset.name,
        url: preset.url,
        color: preset.color,
        bg: preset.bg,
        letter: preset.letter,
        iconName: preset.iconName,
        domain: preset.domain,
        faviconUrl: preset.faviconUrl || (preset.url ? getFaviconUrl(preset.url) : undefined)
      });
    }
    onClose();
  };

  const handlePinCurrentTab = () => {
    if (!activeTab || !activeTab.url) return;
    pinTabAsApp(activeTab);
    setActiveTabPinned(true);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  const handleDelete = () => {
    if (editApp) {
      removeApp(editApp.id);
      onClose();
    }
  };

  const canPinCurrentTab =
    activeTab &&
    activeTab.url &&
    !activeTab.url.startsWith('about:') &&
    !activeTab.url.startsWith('lastbrowser:');

  return (
    <div className="pinned-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pinned-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pinned-modal-header">
          <div className="pinned-modal-title-row">
            <span className="pinned-modal-icon-badge">
              <Sparkles size={16} />
            </span>
            <h3>{editApp ? 'Pinned App bearbeiten' : 'Pinned App hinzufügen'}</h3>
          </div>
          <button
            type="button"
            className="pinned-modal-close-btn"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        {/* Pin Current Tab Banner (Only in Add mode) */}
        {!editApp && canPinCurrentTab && (
          <div className="pinned-quick-action-banner">
            <div className="pinned-quick-action-text">
              <span className="pinned-quick-action-label">Aktueller Tab:</span>
              <span className="pinned-quick-action-title" title={activeTab.title}>
                {activeTab.title}
              </span>
            </div>
            <button
              type="button"
              className={`pinned-pin-current-btn ${activeTabPinned ? 'success' : ''}`}
              onClick={handlePinCurrentTab}
            >
              {activeTabPinned ? (
                <>
                  <Check size={14} /> Angeheftet
                </>
              ) : (
                <>
                  <Pin size={14} /> Jetzt anheften
                </>
              )}
            </button>
          </div>
        )}

        {/* Popular Presets Grid (Only in Add mode) */}
        {!editApp && (
          <div className="pinned-presets-section">
            <span className="pinned-section-title">BELIEBTE WEB APPS (1-KLICK)</span>
            <div className="pinned-presets-grid">
              {PRESET_PINNED_APPS.slice(0, 12).map((preset) => {
                const isAlreadyPinned = apps.some(
                  (a) => a.id === preset.id || (a.domain && a.domain === preset.domain)
                );
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`pinned-preset-chip ${isAlreadyPinned ? 'is-pinned' : ''}`}
                    style={{ '--preset-color': preset.color } as React.CSSProperties}
                    onClick={() => handleSelectPreset(preset)}
                    title={isAlreadyPinned ? `${preset.name} ist bereits angeheftet` : `${preset.name} anheften`}
                  >
                    <span
                      className="pinned-preset-dot"
                      style={{ background: preset.color }}
                    />
                    <span className="pinned-preset-name">{preset.name}</span>
                    {isAlreadyPinned && <Check size={12} className="pinned-preset-check" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom Form */}
        <form onSubmit={handleSave} className="pinned-modal-form">
          <span className="pinned-section-title">
            {editApp ? 'APP-EINSTELLUNGEN' : 'ODER BENUTZERDEFINIERTE APP'}
          </span>

          <div className="pinned-form-group">
            <label htmlFor="pinned-app-name">Name</label>
            <input
              id="pinned-app-name"
              type="text"
              className="pinned-input"
              placeholder="z. B. GitHub oder Meine App"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus={!editApp}
            />
          </div>

          <div className="pinned-form-group">
            <label htmlFor="pinned-app-url">Web-Adresse (URL)</label>
            <div className="pinned-url-input-wrapper">
              <input
                id="pinned-app-url"
                type="text"
                className="pinned-input"
                placeholder="https://app.example.com"
                value={url}
                onChange={(e) => {
                  const val = e.target.value;
                  setUrl(val);
                  if (!name && val) {
                    const d = extractAppDomain(val);
                    if (d) setName(d.split('.')[0].charAt(0).toUpperCase() + d.split('.')[0].slice(1));
                  }
                }}
              />
              {domain && (
                <span className="pinned-domain-badge" title={`Erkannte Domain: ${domain}`}>
                  {domain}
                </span>
              )}
            </div>
          </div>

          {/* Color Selection */}
          <div className="pinned-form-group">
            <label>Akzentfarbe & Theme</label>
            <div className="pinned-color-palette">
              {COLOR_PALETTE.map((palette) => (
                <button
                  key={palette.name}
                  type="button"
                  className={`pinned-color-btn ${selectedColor.color === palette.color ? 'selected' : ''}`}
                  style={{ background: palette.color }}
                  onClick={() => setSelectedColor(palette)}
                  title={palette.name}
                  aria-label={palette.name}
                >
                  {selectedColor.color === palette.color && <Check size={12} color="#000" />}
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="pinned-preview-box">
            <div
              className="pinned-preview-icon"
              style={{ background: selectedColor.bg, color: selectedColor.color }}
            >
              {previewFavicon ? (
                <img
                  src={previewFavicon}
                  alt=""
                  className="pinned-preview-img"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span>{name ? name.charAt(0).toUpperCase() : <Globe size={16} />}</span>
              )}
            </div>
            <div className="pinned-preview-info">
              <span className="pinned-preview-name">{name || 'App-Vorschau'}</span>
              <span className="pinned-preview-url">{url || 'https://...'}</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pinned-modal-footer">
            {editApp ? (
              <button
                type="button"
                className="pinned-delete-btn"
                onClick={handleDelete}
                title="App aus Pinned Apps entfernen"
              >
                <Trash2 size={14} /> Löschen
              </button>
            ) : (
              <div />
            )}
            <div className="pinned-modal-footer-right">
              <button
                type="button"
                className="pinned-cancel-btn"
                onClick={onClose}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="pinned-save-btn"
                disabled={!name.trim()}
              >
                {editApp ? 'Änderungen speichern' : 'App anheften'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
