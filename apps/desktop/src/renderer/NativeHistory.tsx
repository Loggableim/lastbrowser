/**
 * History panel for the browser.
 *
 * Visits were already recorded (history.ts) but only surfaced as a short
 * "recent sites" list on the start page — there was no way to search them, see
 * older entries, or remove one. This panel shows the full log grouped by day,
 * with search and per-entry delete.
 */
import React, { useMemo, useState } from 'react';
import { Clock, Search, Trash2, X } from 'lucide-react';
import { groupVisitsByDay, searchVisits, type BrowserVisit } from './history.js';

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function HistoryPanel({
  open,
  visits,
  onClose,
  onOpen,
  onRemove,
  onClear
}: {
  open: boolean;
  visits: BrowserVisit[];
  onClose: () => void;
  onOpen: (url: string) => void;
  onRemove: (url: string) => void;
  onClear: () => void;
}): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [showClearModal, setShowClearModal] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includeCache, setIncludeCache] = useState(true);
  const [includeCookies, setIncludeCookies] = useState(false);
  const [clearing, setClearing] = useState(false);

  const groups = useMemo(
    () => groupVisitsByDay(searchVisits(visits, query)),
    [visits, query]
  );
  const total = groups.reduce((sum, group) => sum + group.visits.length, 0);

  const handleClearConfirmed = async () => {
    setClearing(true);
    try {
      if (includeHistory) {
        onClear();
      }
      if (includeCache || includeCookies) {
        await window.lastbrowser?.browser?.clearData?.({
          cache: includeCache,
          cookies: includeCookies,
          storage: includeCookies
        });
      }
      setShowClearModal(false);
    } finally {
      setClearing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="history-panel" role="dialog" aria-label="History">
      <header>
        <Clock size={15} />
        <strong>History</strong>
        <span className="history-count">{total}</span>
        <button
          type="button"
          className="history-clear"
          title="Clear browsing data (history, cache, cookies)"
          onClick={() => setShowClearModal((prev) => !prev)}
        >
          <Trash2 size={13} />
        </button>
        <button type="button" aria-label="Close history" onClick={onClose}>
          <X size={14} />
        </button>
      </header>

      {showClearModal && (
        <div className="history-clear-dialog">
          <div className="history-clear-dialog-header">
            <strong>Browserdaten löschen</strong>
            <button
              type="button"
              className="history-clear-dialog-close"
              onClick={() => setShowClearModal(false)}
            >
              <X size={12} />
            </button>
          </div>
          <div className="history-clear-dialog-body">
            <label className="history-clear-option">
              <input
                type="checkbox"
                checked={includeHistory}
                onChange={(e) => setIncludeHistory(e.target.checked)}
              />
              <span>Verlauf & Suchhistorie ({visits.length})</span>
            </label>
            <label className="history-clear-option">
              <input
                type="checkbox"
                checked={includeCache}
                onChange={(e) => setIncludeCache(e.target.checked)}
              />
              <span>Bilder & Dateien im Cache</span>
            </label>
            <label className="history-clear-option">
              <input
                type="checkbox"
                checked={includeCookies}
                onChange={(e) => setIncludeCookies(e.target.checked)}
              />
              <span>Cookies & Website-Speicher</span>
            </label>
          </div>
          <div className="history-clear-dialog-footer">
            <button
              type="button"
              className="history-clear-btn cancel"
              onClick={() => setShowClearModal(false)}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="history-clear-btn confirm"
              disabled={clearing || (!includeHistory && !includeCache && !includeCookies)}
              onClick={handleClearConfirmed}
            >
              {clearing ? 'Wird gelöscht...' : 'Daten löschen'}
            </button>
          </div>
        </div>
      )}

      <div className="history-search">
        <Search size={13} />
        <input
          value={query}
          placeholder="Search history"
          aria-label="Search history"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
            <X size={12} />
          </button>
        )}
      </div>

      <div className="history-list">
        {total === 0 && (
          <p className="history-empty">
            {visits.length === 0 ? 'No history yet.' : 'No matches.'}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.label} className="history-group">
            <h4>{group.label}</h4>
            {group.visits.map((visit) => (
              <div key={`${group.label}-${visit.url}`} className="history-row">
                <button
                  type="button"
                  className="history-open"
                  title={visit.url}
                  onClick={() => {
                    onOpen(visit.url);
                    onClose();
                  }}
                >
                  <span className="history-title">{visit.title}</span>
                  <span className="history-url">{visit.url}</span>
                </button>
                <span className="history-time">{formatTime(visit.lastVisited)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${visit.title} from history`}
                  title="Remove from history"
                  onClick={() => onRemove(visit.url)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
