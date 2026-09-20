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

  const groups = useMemo(
    () => groupVisitsByDay(searchVisits(visits, query)),
    [visits, query]
  );
  const total = groups.reduce((sum, group) => sum + group.visits.length, 0);

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
          title="Clear all history"
          disabled={visits.length === 0}
          onClick={() => {
            if (window.confirm('Clear all browsing history?')) onClear();
          }}
        >
          <Trash2 size={13} />
        </button>
        <button type="button" aria-label="Close history" onClick={onClose}>
          <X size={14} />
        </button>
      </header>

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
