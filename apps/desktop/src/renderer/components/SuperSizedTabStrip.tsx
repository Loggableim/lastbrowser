import { Globe2, Loader2, Volume2, VolumeX, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { BrowserTab } from '../tabs.js';

/**
 * Super-Sized Vertikale Tabs (docs/visionimpaired.md §5.1, Feature 9).
 * Each tab is a labelled group with a native activation button and separate
 * action buttons. This keeps keyboard activation of close/mute independent.
 */

export type SuperSizedTabStripProps = {
  tabs: BrowserTab[];
  activeTabId: string;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onToggleTabMute?: (tabId: string) => void;
  onNewTab?: () => void;
  /** Optional because the browser tab model currently has no unread state. */
  unreadTabIds?: ReadonlySet<string> | readonly string[];
};

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const activationButtonStyle: CSSProperties = {
  appearance: 'none',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 0,
  width: '100%',
  minWidth: 0,
  textAlign: 'left',
  cursor: 'pointer'
};

export function SuperSizedTabStrip({
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  onToggleTabMute,
  onNewTab,
  unreadTabIds
}: SuperSizedTabStripProps): React.JSX.Element {
  const isSet = (value: readonly string[] | ReadonlySet<string>): value is ReadonlySet<string> =>
    typeof (value as ReadonlySet<string>).has === 'function';
  const unread = (tabId: string): boolean => {
    if (!unreadTabIds) return false;
    return isSet(unreadTabIds)
      ? unreadTabIds.has(tabId)
      : unreadTabIds.includes(tabId);
  };

  return (
    <nav className="lb-supertabs" aria-label="Browser tabs (super-sized)">
      {tabs.map((tab) => {
        const domain = domainFromUrl(tab.url);
        const isActive = tab.id === activeTabId;
        const hasUnread = unread(tab.id);
        return (
          <div
            key={tab.id}
            role="group"
            aria-label={`${tab.title}${isActive ? ', current tab' : ''}${hasUnread ? ', unread' : ''}`}
            className={`lb-supertab-tile ${isActive ? 'active' : ''}`}
          >
            <button
              type="button"
              className="lb-supertab-activate"
              style={activationButtonStyle}
              aria-label={`${tab.title}${domain ? `, ${domain}` : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onActivateTab(tab.id)}
            >
              <span className="lb-supertab-head">
                {tab.isLoading ? (
                  <Loader2 size={28} className="lb-supertab-favicon" aria-hidden="true" />
                ) : tab.favicon ? (
                  <img src={tab.favicon} alt="" className="lb-supertab-favicon" />
                ) : (
                  <Globe2 size={28} className="lb-supertab-favicon" aria-hidden="true" />
                )}
                <span
                  className="lb-supertab-title"
                  style={{
                    display: 'block',
                    WebkitLineClamp: 'unset',
                    WebkitBoxOrient: 'initial',
                    maxHeight: 'none',
                    overflow: 'visible',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere'
                  }}
                >
                  {tab.title}
                  {hasUnread && <span className="lb-supertab-unread"> — Unread</span>}
                </span>
              </span>
              {domain && <span className="lb-supertab-domain">[{domain}]</span>}
            </button>
            <button
              type="button"
              className="lb-supertab-close"
              aria-label={`Close ${tab.title}`}
              onClick={() => onCloseTab(tab.id)}
            >
              <X size={18} aria-hidden="true" />
            </button>
            {(tab.isPlayingAudio || tab.isMuted) && onToggleTabMute && (
              <span className="lb-supertab-badges">
                <button
                  type="button"
                  className="lb-supertab-audio-badge"
                  aria-label={tab.isMuted ? `Unmute ${tab.title}` : `Mute ${tab.title}`}
                  onClick={() => onToggleTabMute(tab.id)}
                >
                  {tab.isMuted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
                </button>
              </span>
            )}
          </div>
        );
      })}
      {onNewTab && (
        <button
          type="button"
          className="lb-supertab-tile"
          aria-label="New tab"
          onClick={onNewTab}
          style={{ alignItems: 'center', justifyContent: 'center', minHeight: 56 }}
        >
          <span className="lb-supertab-title" style={{ textAlign: 'center' }}>+ New Tab</span>
        </button>
      )}
    </nav>
  );
}
