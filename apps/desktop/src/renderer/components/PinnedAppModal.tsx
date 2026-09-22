import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Globe,
  Sparkles,
  ExternalLink,
  Trash2,
  Check,
  Pin,
  Search,
  MessageSquare,
  Briefcase,
  Code2,
  Film
} from 'lucide-react';
import {
  type PinnedApp,
  extractAppDomain,
  getFaviconUrl,
  usePinnedAppStore
} from '../stores/usePinnedAppStore.js';
import { TOP_64_PINNED_APPS, type CatalogApp } from '../pinned-apps-catalog.js';

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

type CategoryFilter = 'all' | 'communication' | 'productivity' | 'developer' | 'media';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [showCustomForm, setShowCustomForm] = useState(false);

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
      setShowCustomForm(true);
    } else {
      setName('');
      setUrl('');
      setSelectedColor(COLOR_PALETTE[0]);
      setShowCustomForm(false);
      setSearchQuery('');
      setSelectedCategory('all');
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

  const filteredCatalog = useMemo(() => {
    return TOP_64_PINNED_APPS.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          item.name.toLowerCase().includes(q) ||
          (item.domain && item.domain.toLowerCase().includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [searchQuery, selectedCategory]);

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

  const handleToggleCatalogApp = (preset: CatalogApp) => {
    const existing = apps.find(
      (a) => (a.domain && a.domain === preset.domain) || a.id === preset.id
    );
    if (existing) {
      removeApp(existing.id);
    } else {
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
      <div className="pinned-modal-card top-catalog-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pinned-modal-header">
          <div className="pinned-modal-title-row">
            <span className="pinned-modal-icon-badge">
              <Sparkles size={16} />
            </span>
            <div>
              <h3>{editApp ? 'Pinned App bearbeiten' : 'Pinned Apps & Web-Dienste'}</h3>
              <p className="pinned-modal-subtitle">
                {editApp
                  ? 'Passe Namen, URL und Akzentfarbe an.'
                  : 'Wähle aus den Top 64 Web-Apps oder füge eigene Adressen hinzu.'}
              </p>
            </div>
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

        {/* Modal View Switcher Tabs (Katalog vs. Benutzerdefiniert) */}
        {!editApp && (
          <div className="pinned-modal-nav-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={!showCustomForm}
              className={`pinned-nav-tab ${!showCustomForm ? 'active' : ''}`}
              onClick={() => setShowCustomForm(false)}
            >
              <Sparkles size={13} />
              <span>Top 64 Katalog</span>
              <span className="pinned-nav-count">64</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showCustomForm}
              className={`pinned-nav-tab ${showCustomForm ? 'active' : ''}`}
              onClick={() => setShowCustomForm(true)}
            >
              <Plus size={13} />
              <span>Benutzerdefinierte App</span>
            </button>
          </div>
        )}

        {/* Pin Current Tab Banner */}
        {!editApp && canPinCurrentTab && !showCustomForm && (
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
                  <Pin size={14} /> Aktuellen Tab anheften
                </>
              )}
            </button>
          </div>
        )}

        {!editApp && !showCustomForm && (
          <>
            {/* Search & Categories Bar */}
            <div className="catalog-search-section">
              <div className="catalog-search-box">
                <Search size={15} className="catalog-search-icon" />
                <input
                  type="text"
                  placeholder="Apps durchsuchen (z.B. WhatsApp, Discord, ChatGPT, Notion)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="catalog-search-input"
                  aria-label="Apps durchsuchen"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="catalog-search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="Suche leeren"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="catalog-category-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === 'all'}
                  className={`catalog-cat-tab ${selectedCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('all')}
                >
                  Alle (64)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === 'communication'}
                  className={`catalog-cat-tab ${selectedCategory === 'communication' ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('communication')}
                >
                  <MessageSquare size={12} /> Kommunikation (13)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === 'productivity'}
                  className={`catalog-cat-tab ${selectedCategory === 'productivity' ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('productivity')}
                >
                  <Briefcase size={12} /> Produktivität (17)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === 'developer'}
                  className={`catalog-cat-tab ${selectedCategory === 'developer' ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('developer')}
                >
                  <Code2 size={12} /> Entwickler & KI (17)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === 'media'}
                  className={`catalog-cat-tab ${selectedCategory === 'media' ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('media')}
                >
                  <Film size={12} /> Medien & Social (17)
                </button>
              </div>
            </div>

            {/* Catalog Grid */}
            <div className="catalog-grid-scroll">
              <div className="catalog-cards-grid">
                {filteredCatalog.map((preset) => {
                  const isPinned = apps.some(
                    (a) => a.id === preset.id || (a.domain && a.domain === preset.domain)
                  );
                  return (
                    <div
                      key={preset.id}
                      className={`catalog-card ${isPinned ? 'is-pinned' : ''}`}
                      onClick={() => handleToggleCatalogApp(preset)}
                      role="button"
                      tabIndex={0}
                      title={isPinned ? `${preset.name} abpinnen (1-Klick)` : `${preset.name} anheften (1-Klick)`}
                    >
                      <div
                        className="catalog-card-icon"
                        style={{ background: preset.bg, color: preset.color }}
                      >
                        {preset.url ? (
                          <img
                            src={getFaviconUrl(preset.url)}
                            alt=""
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        <span>{preset.letter || preset.name.charAt(0)}</span>
                      </div>
                      <div className="catalog-card-info">
                        <div className="catalog-card-header-row">
                          <span className="catalog-card-name">{preset.name}</span>
                          {isPinned ? (
                            <span className="catalog-pinned-status-badge">
                              <Check size={10} /> Angepinnt
                            </span>
                          ) : null}
                        </div>
                        <span className="catalog-card-desc">{preset.description || preset.domain}</span>
                      </div>
                      <button
                        type="button"
                        className={`catalog-card-toggle ${isPinned ? 'pinned' : ''}`}
                        title={isPinned ? `${preset.name} abpinnen` : `${preset.name} anheften`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCatalogApp(preset);
                        }}
                      >
                        {isPinned ? <Check size={13} /> : <Plus size={13} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Custom Form Toggle */}
        {!editApp && (
          <div className="catalog-custom-toggle-bar">
            <button
              type="button"
              className="catalog-custom-toggle-btn"
              onClick={() => setShowCustomForm((prev) => !prev)}
            >
              {showCustomForm ? '▲ Zum Top 64 Katalog wechseln' : '▼ Eigene Web-Adresse (Custom URL) hinzufügen'}
            </button>
          </div>
        )}

        {/* Custom Form */}
        {(showCustomForm || editApp) && (
          <form onSubmit={handleSave} className="pinned-modal-form custom-open">
            <span className="pinned-section-title">
              {editApp ? 'APP-EINSTELLUNGEN' : 'BENUTZERDEFINIERTE APP'}
            </span>

            <div className="pinned-form-group">
              <label htmlFor="pinned-app-name">Name</label>
              <input
                id="pinned-app-name"
                type="text"
                className="pinned-input"
                placeholder="z. B. Mein Dashboard"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus={Boolean(editApp || showCustomForm)}
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
                  Fertig
                </button>
                <button
                  type="submit"
                  className="pinned-save-btn"
                  disabled={!name.trim()}
                >
                  {editApp ? 'Änderungen speichern' : 'Custom App anheften'}
                </button>
              </div>
            </div>
          </form>
        )}

        {!showCustomForm && !editApp && (
          <div className="pinned-modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div />
            <button
              type="button"
              className="pinned-save-btn"
              onClick={onClose}
            >
              Fertig
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
