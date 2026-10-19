import React, { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';
import type { ReleaseNoteEntry } from '../release-notes.js';

export type ReleaseNotesDialogProps = {
  open: boolean;
  fromVersion: string | null;
  toVersion: string;
  entries: ReleaseNoteEntry[];
  onClose: () => void;
};

export function ReleaseNotesDialog({ open, fromVersion, toVersion, entries, onClose }: ReleaseNotesDialogProps): React.JSX.Element | null {
  const { t } = useDesktopI18n();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const subtitle = fromVersion
    ? t('browser.chrome.releaseNotesSince', { version: fromVersion })
    : toVersion;

  return (
    <div className="release-notes-backdrop">
      <section
        className="release-notes-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-notes-title"
        aria-describedby="release-notes-subtitle"
      >
        <header className="release-notes-header">
          <div className="release-notes-heading">
            <span className="release-notes-icon"><Sparkles size={18} /></span>
            <div>
              <h2 id="release-notes-title">{t('browser.chrome.releaseNotesTitle')}</h2>
              <p id="release-notes-subtitle">{subtitle}</p>
            </div>
          </div>
          <button type="button" className="release-notes-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </header>

        <div className="release-notes-body">
          {entries.map((entry) => {
            const sections = entry.sections.filter((section) => !/^verification$/i.test(section.title));
            return (
              <article className="release-notes-entry" key={entry.version}>
                <header className="release-notes-entry-header">
                  <span className="release-notes-version">{entry.version}</span>
                  <time dateTime={entry.date}>{entry.date}</time>
                </header>
                {sections.map((section, sectionIndex) => (
                  <div className="release-notes-section" key={`${entry.version}-${sectionIndex}`}>
                    {section.title && <h3>{section.title}</h3>}
                    {section.items.length > 0 && (
                      <ul>
                        {section.items.map((item, itemIndex) => <li key={`${entry.version}-${sectionIndex}-${itemIndex}`}>{item}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </article>
            );
          })}
        </div>

        <footer className="release-notes-footer">
          <button type="button" className="primary-action" onClick={onClose}>{t('common.close')}</button>
        </footer>
      </section>
    </div>
  );
}
