import React, { FormEvent, useEffect, useMemo, useState } from 'react';
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
  Bot
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import type { BrowserBookmark } from '../bookmarks.js';
import type { BrowserVisit } from '../history.js';
import { normalizeNavigationInput } from '../tabs.js';

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
  greeting: string;
  subline: string;
}

export function getDashboardGreeting(date: Date = new Date(), botName = 'Nova'): DashboardGreeting {
  const hours = date.getHours();
  if (hours >= 5 && hours < 12) {
    return { greeting: 'Guten Morgen', subline: `Bereit für den Tag? Womit kann ${botName} helfen?` };
  }
  if (hours >= 12 && hours < 18) {
    return { greeting: 'Guten Tag', subline: 'Was recherchieren wir als Nächstes?' };
  }
  if (hours >= 18 && hours < 23) {
    return { greeting: 'Guten Abend', subline: 'Den Tag abschließen oder noch ein Thema vertiefen?' };
  }
  return { greeting: 'Gute Nacht', subline: `Nachtsession aktiv. ${botName} steht bereit.` };
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
  label: string;
  prompt: string;
  icon: string;
  type: 'prompt' | 'command' | 'action';
}

export const DASHBOARD_QUICK_ACTIONS: DashboardQuickAction[] = [
  { id: 'research', label: 'Recherche starten', prompt: 'Recherchiere die wichtigsten Fakten zu: ', icon: '✨', type: 'prompt' },
  { id: 'tabs-summary', label: 'Tabs zusammenfassen', prompt: '@tabs Fasse alle offenen Tabs in einer strukturierten Tabelle zusammen', icon: '⚡', type: 'prompt' },
  { id: 'sort-tabs', label: 'Tabs sortieren', prompt: 'sortiere tabs nach domain', icon: '🧹', type: 'command' },
  { id: 'doctor', label: 'System-Diagnose', prompt: 'sidekick doctor', icon: '🛡️', type: 'command' },
  { id: 'palette', label: 'Befehlspalette', prompt: 'palette', icon: '⌘K', type: 'action' }
];

export function NativeBrowserStartPage({
  bookmarks,
  visits,
  onNavigate,
  onAskAi,
  onOpenCommandPalette,
  botName = 'Nova'
}: {
  bookmarks: BrowserBookmark[];
  visits: BrowserVisit[];
  onNavigate: (url: string) => void;
  onAskAi?: (prompt: string) => void;
  onOpenCommandPalette?: () => void;
  botName?: string;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const effectiveBotName = botName.trim() || 'Nova';
  const greeting = useMemo(() => getDashboardGreeting(currentTime, effectiveBotName), [currentTime, effectiveBotName]);
  const timeString = useMemo(() => formatDashboardTime(currentTime), [currentTime]);
  const dateString = useMemo(() => formatDashboardDate(currentTime), [currentTime]);

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
              <span className="startpage-clock" aria-label="Uhrzeit">
                {timeString}
              </span>
              <span className="startpage-date">
                {dateString}
              </span>
            </div>
            <h1 className="startpage-greeting">{greeting.greeting}</h1>
            <p className="startpage-subline">{greeting.subline}</p>
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
            title="Befehlspalette öffnen (Strg+K)"
          >
            <Command size={13} />
            <span>Strg+K Palette</span>
          </button>
        </div>
      </div>

      {/* Dual Search & Prompt Bar */}
      <form className="browser-start-search startpage-search-bar" onSubmit={submit}>
        <Search size={18} />
        <input
          value={query}
          placeholder="Web-Adresse eingeben oder Frage an Nova richten..."
          onChange={(event) => setQuery(event.target.value)}
          data-testid="dashboard-search-input"
        />
        <div className="startpage-search-actions">
          <button
            type="button"
            className="secondary-action compact startpage-ask-ai-btn"
            disabled={!query.trim()}
            onClick={handleAskAi}
            title="Frage an Nova AI senden"
          >
            <Bot size={15} />
            <span>Frag Nova</span>
          </button>
          <button type="submit" className="primary-action compact" disabled={!query.trim()}>
            <Globe2 size={15} />
            <span>Öffnen</span>
          </button>
        </div>
      </form>

      {/* Quick Action Chips */}
      <div className="startpage-quick-chips" aria-label="Nova Schnellaktionen">
        <span className="quick-chips-label">
          <Wand2 size={13} />
          <span>Schnellaktionen:</span>
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
            <span className="chip-label">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Speed Dial Quick Launch Section */}
      <section className="speed-dial-section">
        <div className="speed-dial-head">
          <div className="speed-dial-head-title">
            <Compass size={15} />
            <span className="eyebrow">Speed Dial</span>
            <h2>Quick Launch</h2>
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
              <span className="eyebrow">Favorites</span>
              <h2>Bookmarks</h2>
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
              <div className="browser-start-empty">No bookmarks yet. Use the star in the address bar to add favorites.</div>
            )}
          </div>
        </section>

        <section className="browser-start-card">
          <div className="browser-start-card-head">
            <div>
              <span className="eyebrow">Most visited</span>
              <h2>Recent sites</h2>
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
                <span>{visit.count} visits</span>
                <ExternalLink size={14} />
              </button>
            )) : (
              <div className="browser-start-empty">Most visited sites appear here after you browse a few pages.</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
