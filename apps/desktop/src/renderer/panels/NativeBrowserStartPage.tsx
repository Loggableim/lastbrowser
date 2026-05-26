import React, { FormEvent, useMemo, useState } from 'react';
import { Globe2, Search, Star, TrendingUp, ExternalLink, Sparkles } from 'lucide-react';
import { brandAssets } from '../brand.js';
import type { BrowserBookmark } from '../bookmarks.js';
import type { BrowserVisit } from '../history.js';
import { normalizeNavigationInput } from '../tabs.js';

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
