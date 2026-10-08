import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe2,
  Search,
  Star,
  TrendingUp,
  ExternalLink,
  Sparkles,
  Compass,
  Clock,
  Command,
  Wand2,
  Bot,
  Layers,
  Plus,
  Check,
  X,
  ShieldCheck
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import type { BrowserBookmark } from '../bookmarks.js';
import type { BrowserVisit } from '../history.js';
import { normalizeNavigationInput, type BrowserTab } from '../tabs.js';
import { spaceDisplayName, type SpaceSummary } from '../shell-state.js';
import { getSpaceTabCount } from '../tab-sessions.js';
import { useDesktopI18n } from '../i18n.js';
import type { DesktopTranslationKey } from '../i18n/keys.js';
import { browserStartSpaceCopy, browserStartHistoryCopy } from '../i18n/browser-start-space-copy.js';

export interface SpeedDialItem {
  id: string;
  label: string;
  domain: string;
  url: string;
  category: string;
  iconText: string;
  accent: string;
}

export const DEFAULT_SPEED_DIAL_ITEMS: SpeedDialItem[] = [
  { id: 'github', label: 'GitHub', domain: 'github.com', url: 'https://github.com', category: 'Developer', iconText: 'GH', accent: '#3b82f6' },
  { id: 'google', label: 'Google', domain: 'google.com', url: 'https://www.google.com', category: 'Search', iconText: 'G', accent: '#4285f4' },
  { id: 'wikipedia', label: 'Wikipedia', domain: 'wikipedia.org', url: 'https://en.wikipedia.org', category: 'Knowledge', iconText: 'W', accent: '#a3a3a3' },
  { id: 'youtube', label: 'YouTube', domain: 'youtube.com', url: 'https://www.youtube.com', category: 'Video', iconText: 'YT', accent: '#ef4444' },
  { id: 'reddit', label: 'Reddit', domain: 'reddit.com', url: 'https://www.reddit.com', category: 'Community', iconText: 'RD', accent: '#f97316' },
  { id: 'hackernews', label: 'Hacker News', domain: 'news.ycombinator.com', url: 'https://news.ycombinator.com', category: 'Tech News', iconText: 'HN', accent: '#ff6600' },
  { id: 'huggingface', label: 'Hugging Face', domain: 'huggingface.co', url: 'https://huggingface.co', category: 'AI Models', iconText: 'HF', accent: '#fbbf24' },
  { id: 'openai', label: 'OpenAI', domain: 'openai.com', url: 'https://openai.com', category: 'AI Research', iconText: 'OA', accent: '#10b981' }
];

export interface DashboardGreeting {
  greetingKey: DesktopTranslationKey;
  sublineKey: DesktopTranslationKey;
}

export function getDashboardGreeting(date: Date = new Date()): DashboardGreeting {
  const hours = date.getHours();
  if (hours >= 5 && hours < 12) {
    return { greetingKey: 'browser.startPage.greeting.morning', sublineKey: 'browser.startPage.greeting.morningSubline' };
  }
  if (hours >= 12 && hours < 18) {
    return { greetingKey: 'browser.startPage.greeting.afternoon', sublineKey: 'browser.startPage.greeting.afternoonSubline' };
  }
  if (hours >= 18 && hours < 23) {
    return { greetingKey: 'browser.startPage.greeting.evening', sublineKey: 'browser.startPage.greeting.eveningSubline' };
  }
  return { greetingKey: 'browser.startPage.greeting.night', sublineKey: 'browser.startPage.greeting.nightSubline' };
}

export function formatDashboardTime(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatDashboardDate(date: Date = new Date(), locale: string = 'de-DE'): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

export interface DashboardQuickAction {
  id: string;
  labelKey: DesktopTranslationKey;
  prompt: string;
  icon: string;
  type: 'prompt' | 'command' | 'action';
}

export const DASHBOARD_QUICK_ACTIONS: DashboardQuickAction[] = [
  { id: 'research', labelKey: 'browser.startPage.actions.research', prompt: 'Recherchiere die wichtigsten Fakten zu: ', icon: '✨', type: 'prompt' },
  { id: 'tabs-summary', labelKey: 'browser.startPage.actions.tabsSummary', prompt: '@tabs Fasse alle offenen Tabs in einer strukturierten Tabelle zusammen', icon: '⚡', type: 'prompt' },
  { id: 'sort-tabs', labelKey: 'browser.startPage.actions.sortTabs', prompt: 'sortiere tabs nach domain', icon: '🧹', type: 'command' },
  { id: 'doctor', labelKey: 'browser.startPage.actions.diagnostics', prompt: 'sidekick doctor', icon: '🛡️', type: 'command' },
  { id: 'palette', labelKey: 'browser.startPage.actions.commandPalette', prompt: 'palette', icon: '⌘K', type: 'action' }
];

export interface NativeBrowserStartPageProps {
  bookmarks: BrowserBookmark[];
  visits: BrowserVisit[];
  onNavigate: (url: string) => void;
  onAskAi?: (prompt: string) => void;
  onOpenCommandPalette?: () => void;
  botName?: string;
  spaces?: SpaceSummary[];
  activeSpacePath?: string;
  activeProfileId?: string;
  activeSpaceTabs?: BrowserTab[];
  onSelectSpace?: (spacePath: string) => void;
  onAddSpace?: (path: string, name: string) => void;
  focusSearchOnMount?: boolean;
  onSearchFocusConsumed?: () => void;
}

export function getStartPageSpaceTabCount(
  spacePath: string,
  activeSpacePath: string,
  activeSpaceTabs: BrowserTab[],
  activeProfileId: string,
  storage: Storage = window.localStorage
): number {
  if (spacePath === activeSpacePath) {
    return activeSpaceTabs.filter((tab) => !tab.incognito).length;
  }
  return getSpaceTabCount(activeProfileId, spacePath, storage);
}
/** Keep Unicode names distinct while excluding path separators and controls. */
export function startPageSpaceWorkspacePath(name:string):string {
  const slug=name.normalize('NFKC').trim().toLowerCase().replace(/[^\p{Letter}\p{Number}_-]+/gu,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'');
  return `workspaces/${slug||`space-${crypto.randomUUID()}`}`;
}

export function NativeBrowserStartPage({
  bookmarks,
  visits,
  onNavigate,
  onAskAi,
  onOpenCommandPalette,
  botName = 'Nova',
  spaces = [],
  activeSpacePath = '',
  activeProfileId = 'default',
  activeSpaceTabs = [],
  onSelectSpace,
  onAddSpace,
  focusSearchOnMount = false,
  onSearchFocusConsumed
}: NativeBrowserStartPageProps): JSX.Element {
  const { locale, t } = useDesktopI18n();
  const spaceCopy = browserStartSpaceCopy[locale];
  const historyCopy = browserStartHistoryCopy[locale];
  const [query, setQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const displayedSpaces = useMemo(() => {
    if (spaces && spaces.length > 0) {
      return spaces;
    }
    return [{ path: '', name: spaceCopy.home, emoji: '🏠' }];
  }, [spaces, spaceCopy]);

  const isSpaceActive = (space: SpaceSummary) => {
    if (space.path === activeSpacePath) return true;
    if (!activeSpacePath && (space.path === '' || space.path === 'home')) return true;
    return false;
  };

  const handleCreateSpaceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSpaceName.trim();
    if (!trimmed) return;
    const path = startPageSpaceWorkspacePath(trimmed);
    if (onAddSpace) {
      onAddSpace(path, trimmed);
    } else if (onSelectSpace) {
      onSelectSpace(path);
    }
    setNewSpaceName('');
    setIsCreatingSpace(false);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!focusSearchOnMount) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      onSearchFocusConsumed?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusSearchOnMount, onSearchFocusConsumed]);

  const effectiveBotName = botName.trim() || 'Nova';
  const greeting = useMemo(() => getDashboardGreeting(currentTime), [currentTime]);
  const timeString = useMemo(() => formatDashboardTime(currentTime), [currentTime]);
  const dateLocale = locale === 'en' ? 'en-US' : locale === 'pt-BR' ? 'pt-BR' : `${locale}-${({ de: 'DE', es: 'ES', fr: 'FR', it: 'IT', ru: 'RU', ja: 'JP' } as const)[locale]}`;
  const dateString = useMemo(() => formatDashboardDate(currentTime, dateLocale), [currentTime, dateLocale]);

  const favorites = useMemo(() => bookmarks.slice(0, 8), [bookmarks]);
  const mostVisited = useMemo(() => visits.slice(0, 8), [visits]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    onNavigate(normalizeNavigationInput(value));
  }

  function handleAskAi(): void {
    const value = query.trim();
    if (!value) return;
    if (onAskAi) {
      onAskAi(value);
    } else {
      onNavigate(`https://www.google.com/search?q=${encodeURIComponent(value)}`);
    }
  }

  function handleQuickAction(action: DashboardQuickAction): void {
    if (action.id === 'palette') {
      if (onOpenCommandPalette) {
        onOpenCommandPalette();
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      }
      return;
    }

    if (onAskAi) {
      onAskAi(action.prompt);
    } else {
      setQuery(action.prompt);
    }
  }

  return (
    <section className="browser-main browser-start-page" data-testid="browser-start-dashboard">
      {/* 9.4 Atmospheric Hero Dashboard with Live Clock and Greeting */}
      <div className="browser-start-hero startpage-dashboard-hero">
        <div className="browser-start-brand">
          <img src={brandAssets.logo} alt="lastbrowser" className="startpage-logo" />
          <div className="startpage-welcome-text">
            <div className="startpage-time-row">
              <span className="startpage-clock" aria-label={t('browser.startPage.clockLabel')}>
                {timeString}
              </span>
              <span className="startpage-date">
                {dateString}
              </span>
            </div>
            <h1 className="startpage-greeting">{t(greeting.greetingKey)}</h1>
            <p className="startpage-subline">{t(greeting.sublineKey, { botName: effectiveBotName })}</p>
          </div>
        </div>

        <div className="startpage-hero-aside">
          <div className="browser-start-badge">
            <Sparkles size={14} />
            <span>{effectiveBotName} AI</span>
          </div>
          <button
            type="button"
            className="startpage-palette-trigger"
            onClick={() => handleQuickAction(DASHBOARD_QUICK_ACTIONS[4])}
            title={t('browser.startPage.openCommandPalette')}
          >
            <Command size={13} />
            <span>{t('browser.startPage.commandPalette')}</span>
          </button>
        </div>
      </div>

      {/* Dual Search & Prompt Bar */}
      <form className="browser-start-search startpage-search-bar" onSubmit={submit}>
        <Search size={18} />
        <input
          ref={searchInputRef}
          value={query}
          placeholder={t('browser.startPage.searchPlaceholder', { botName: effectiveBotName })}
          onChange={(event) => setQuery(event.target.value)}
          data-testid="dashboard-search-input"
        />
        <div className="startpage-search-actions">
          <button
            type="button"
            className="secondary-action compact startpage-ask-ai-btn"
            disabled={!query.trim()}
            onClick={handleAskAi}
            title={t('browser.startPage.askNovaTitle')}
          >
            <Bot size={15} />
            <span>{t('browser.startPage.askNova', { botName: effectiveBotName })}</span>
          </button>
          <button type="submit" className="primary-action compact" disabled={!query.trim()}>
            <Globe2 size={15} />
            <span>{t('browser.startPage.open')}</span>
          </button>
        </div>
      </form>

      {/* Quick Action Chips */}
      <div className="startpage-quick-chips" aria-label={t('browser.startPage.quickActions')}>
        <span className="quick-chips-label">
          <Wand2 size={13} />
          <span>{t('browser.startPage.quickActions')}:</span>
        </span>
        {DASHBOARD_QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="startpage-chip-btn"
            onClick={() => handleQuickAction(action)}
            title={action.prompt}
          >
            <span className="chip-icon">{action.icon}</span>
            <span className="chip-label">{t(action.labelKey)}</span>
          </button>
        ))}
      </div>

      {/* ── Space-Hub / Workspaces Overview ──────────────────────────────── */}
      <section className="startpage-spaces-section" data-testid="browser-start-spaces-hub">
        <div className="startpage-section-head">
          <div className="startpage-section-title-wrap">
            <div className="startpage-section-icon-badge">
              <Layers size={16} />
            </div>
            <div>
              <span className="eyebrow">{t('browser.startPage.isolatedWorkspaces')}</span>
              <h2 className="startpage-section-title">{t('browser.startPage.spacesSessions')}</h2>
            </div>
          </div>
          <div className="startpage-section-actions">
            <span className="startpage-spaces-isolation-hint" title={t('browser.startPage.spaceIsolationTooltip')}>
              <ShieldCheck size={13} />
              <span>{t('browser.startPage.separateLogins')}</span>
            </span>
            <button
              type="button"
              className="startpage-add-space-btn"
              onClick={() => setIsCreatingSpace(true)}
              title={t('browser.startPage.createSpaceTitle')}
            >
              <Plus size={14} />
              <span>{t('browser.startPage.newSpace')}</span>
            </button>
          </div>
        </div>

        <div className="startpage-spaces-grid">
          {displayedSpaces.map((space) => {
            const isActive = isSpaceActive(space);
            const name = spaceDisplayName(space);
            const tabCount = getStartPageSpaceTabCount(
              space.path,
              activeSpacePath,
              activeSpaceTabs,
              activeProfileId || 'default'
            );
            const avatarChar = space.emoji || (space.path === '' ? '🏠' : name.charAt(0).toUpperCase());

            return (
              <div
                key={space.path || '__home__'}
                className={`startpage-space-card ${isActive ? 'is-active' : ''}`}
                onClick={() => onSelectSpace?.(space.path)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSpace?.(space.path);
                  }
                }}
                title={`${t('sidebar.space.switch')}: ${name} · ${t('browser.startPage.spaceIsolationTooltip')}`}
              >
                <div className="startpage-space-card-top">
                  <div className="startpage-space-avatar">
                    {avatarChar}
                  </div>
                  {isActive ? (
                    <span className="startpage-space-badge active">
                      <Check size={11} />
                      <span>{t('agentPanels.active')}</span>
                    </span>
                  ) : (
                    <span className="startpage-space-badge inactive">
                      <span>{t('sidebar.space.switch')}</span>
                    </span>
                  )}
                </div>

                <div className="startpage-space-card-body">
                  <h3 className="startpage-space-name">{name}</h3>
                  <div className="startpage-space-meta">
                    <span className="startpage-space-tabs-count">
                      {tabCount === 0 ? spaceCopy.noTabs : spaceCopy.tabCount(tabCount)}
                    </span>
                    <span className="startpage-space-dot">•</span>
                    <span className="startpage-space-session-tag">{spaceCopy.session}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* "+ Neuer Space" Card */}
          <button
            type="button"
            className="startpage-space-card startpage-space-add-card"
            onClick={() => setIsCreatingSpace(true)}
            title={t('browser.startPage.createSpaceTitle')}
          >
            <div className="startpage-add-icon-box">
              <Plus size={20} />
            </div>
            <div className="startpage-add-card-text">
              <span className="startpage-add-title">{t('browser.startPage.newSpace')}</span>
              <span className="startpage-add-sub">{t('browser.startPage.isolatedWorkspaces')}</span>
            </div>
          </button>
        </div>

        {/* Modal / Dialog for New Space */}
        {isCreatingSpace && (
          <div className="startpage-modal-overlay" onClick={() => setIsCreatingSpace(false)}>
            <div className="startpage-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="startpage-modal-header">
                <div className="startpage-modal-title-wrap">
                  <div className="startpage-section-icon-badge">
                    <Layers size={16} />
                  </div>
                  <div>
                    <h3>{t('browser.startPage.createSpaceTitle')}</h3>
                    <p className="startpage-modal-sub">
                      {t('browser.startPage.spaceIsolationTooltip')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="startpage-modal-close"
                  onClick={() => setIsCreatingSpace(false)}
                  title={t('common.close')}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateSpaceSubmit} className="startpage-modal-form">
                <div className="startpage-form-field">
                  <label htmlFor="startpage-space-name-input">{t('spaceSetup.name')}</label>
                  <input
                    id="startpage-space-name-input"
                    type="text"
                    autoFocus
                    placeholder={t('spaces.namePlaceholder')}
                    value={newSpaceName}
                    onChange={(e) => setNewSpaceName(e.target.value)}
                    className="startpage-text-input"
                  />
                </div>

                <div className="startpage-modal-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => setIsCreatingSpace(false)}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="primary-action"
                    disabled={!newSpaceName.trim()}
                  >
                    <Plus size={14} />
                    <span>{t('browser.startPage.createSpaceTitle')}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>

      {/* Speed Dial Quick Launch Section */}
      <section className="speed-dial-section">
        <div className="speed-dial-head">
          <div className="speed-dial-head-title">
            <Compass size={15} />
            <span className="eyebrow">{t('browser.startPage.speedDial')}</span>
            <h2>{t('browser.startPage.quickLaunch')}</h2>
          </div>
        </div>
        <div className="speed-dial-grid">
          {DEFAULT_SPEED_DIAL_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="speed-dial-tile"
              onClick={() => onNavigate(item.url)}
              title={`${item.label} (${item.url})`}
            >
              <div
                className="speed-dial-tile-icon"
                style={{
                  background: `linear-gradient(135deg, ${item.accent}22, ${item.accent}44)`,
                  borderColor: `${item.accent}66`,
                  color: item.accent
                }}
              >
                {item.iconText}
              </div>
              <div className="speed-dial-tile-info">
                <strong className="speed-dial-tile-label">{item.label}</strong>
                <span className="speed-dial-tile-domain">{item.domain}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Favorites and Most Visited Grids */}
      <div className="browser-start-grid">
        <section className="browser-start-card">
          <div className="browser-start-card-head">
            <div>
              <span className="eyebrow">{historyCopy.favorites}</span>
              <h2>{t('browser.chrome.bookmarks')}</h2>
            </div>
            <Star size={15} />
          </div>
          <div className="browser-start-list">
            {favorites.length ? favorites.map((bookmark) => (
              <button
                key={bookmark.id}
                type="button"
                className="browser-start-item"
                onClick={() => onNavigate(bookmark.url)}
                title={bookmark.url}
              >
                <strong>{bookmark.title}</strong>
                <span>{bookmark.url}</span>
                <ExternalLink size={14} />
              </button>
            )) : (
              <div className="browser-start-empty">{t('browser.chrome.noBookmarks')}</div>
            )}
          </div>
        </section>

        <section className="browser-start-card">
          <div className="browser-start-card-head">
            <div>
              <span className="eyebrow">{historyCopy.mostVisited}</span>
              <h2>{historyCopy.recentSites}</h2>
            </div>
            <TrendingUp size={15} />
          </div>
          <div className="browser-start-list">
            {mostVisited.length ? mostVisited.map((visit) => (
              <button
                key={visit.url}
                type="button"
                className="browser-start-item"
                onClick={() => onNavigate(visit.url)}
                title={visit.url}
              >
                <strong>{visit.title}</strong>
                <span>{historyCopy.visits(visit.count)}</span>
                <ExternalLink size={14} />
              </button>
            )) : (
              <div className="browser-start-empty">{historyCopy.empty}</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
