import React, { useEffect, useMemo, useRef } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';
import type { DesktopLocaleId } from '../i18n/keys.js';
import { releaseNotesBetween, type UpdateNoticeCandidate } from '../release-notes.js';
import './whats-new.css';

export function WhatsNewModal({
  candidate,
  onClose
}: {
  candidate: UpdateNoticeCandidate;
  onClose: () => void;
}): React.JSX.Element | null {
  const { t, locale } = useDesktopI18n();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const notes = useMemo(() => releaseNotesBetween(candidate, locale as DesktopLocaleId), [candidate, locale]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  if (notes.length === 0) return null;

  function keyboard(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])'
    ))].filter((item) => item.offsetParent !== null);
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !event.currentTarget.contains(document.activeElement))) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="whats-new-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="whats-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        aria-describedby="whats-new-intro"
        onKeyDown={keyboard}
      >
        <header className="whats-new-header">
          <div className="whats-new-heading">
            <span className="whats-new-icon" aria-hidden="true"><Sparkles size={19} /></span>
            <div>
              <h2 id="whats-new-title">{t('whatsNew.title')}</h2>
              <p id="whats-new-intro">{t('whatsNew.intro')}</p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="whats-new-close"
            aria-label={t('whatsNew.close')}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <p className="whats-new-range">
          {candidate.fromVersion
            ? t('whatsNew.versionRange', { fromVersion: candidate.fromVersion, toVersion: candidate.toVersion })
            : t('whatsNew.versionOnly', { toVersion: candidate.toVersion })}
        </p>

        <div className="whats-new-releases">
          {notes.map((release) => (
            <section className="whats-new-release" key={release.version} aria-labelledby={`whats-new-${release.version}`}>
              <h3 id={`whats-new-${release.version}`}>{t('whatsNew.version', { version: release.version })}</h3>
              <ul>
                {release.changes.map((change) => <li key={change}>{change}</li>)}
              </ul>
            </section>
          ))}
        </div>

        <footer className="whats-new-footer">
          <button type="button" className="primary-action compact" onClick={onClose}>{t('whatsNew.close')}</button>
        </footer>
      </section>
    </div>
  );
}
