import React, { FormEvent, useMemo, useState } from 'react';
import { Globe2, Search, Star, TrendingUp, ExternalLink, Sparkles, Compass } from 'lucide-react';
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

export function NativeBrowserStartPage({
  bookmarks,
  visits,
  onNavigate
}: {
  bookmarks: BrowserBookmark[];
  visits: BrowserVisit[];
  onNavigate: (url: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const favorites = useMemo(() => bookmarks.slice(0, 8), [bookmarks]);
  const mostVisited = useMemo(() => visits.slice(0, 8), [visits]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    onNavigate(normalizeNavigationInput(value));
  }

  return (
    <section className="browser-main browser-start-page">
      <div className="browser-start-hero">
        <div className="browser-start-brand">
          <img src={brandAssets.logo} alt="lastbrowser" />
          <div>
            <span className="eyebrow">Browser startpage</span>
            <h1>Favorites and most visited</h1>
            <p>Open a website, jump to a bookmark, or continue where you left off.</p>
          </div>
        </div>
        <div className="browser-start-badge">
          <Sparkles size={14} />
          <span>AI Search is in the sidebar</span>
        </div>
      </div>

      <form className="browser-start-search" onSubmit={submit}>
        <Search size={18} />
        <input
          value={query}
          placeholder="Search the web or enter a site"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="primary-action compact" disabled={!query.trim()}>
          <Globe2 size={16} />
          <span>Open</span>
        </button>
      </form>

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
