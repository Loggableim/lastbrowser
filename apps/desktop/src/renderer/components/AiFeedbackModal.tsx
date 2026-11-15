/**
 * Microsoft Store AI Policy – AI Response Feedback & Reporting Modal
 *
 * Provides a user-facing reporting & feedback mechanism for generated AI responses
 * as required by Microsoft Store Generative AI policies.
 * Opens a report draft for the user to review in their email client.
 */

import React, { useId, useState } from 'react';
import { useDesktopI18n } from '../i18n.js';
import { ThumbsDown, X } from 'lucide-react';
import { shellText } from '../i18n/shell-text.js';

export interface AiFeedbackEntry {
  id: string;
  timestamp: number;
  reason: 'inaccurate' | 'harmful' | 'formatting' | 'other';
  comments?: string;
  messageSnippet?: string;
}

export const AI_FEEDBACK_STORAGE_KEY = 'lastbrowser.aiFeedback.v1';
const supportEmail = 'support@lastbrowser.com';
const feedbackReasons = {
  inaccurate: ['Ungenau oder sachlich inkorrekt', 'Inaccurate or factually wrong'],
  harmful: ['Unangemessener, irreführender oder störender Inhalt', 'Inappropriate, misleading, or disruptive content'],
  formatting: ['Unvollständig, abgeschnitten oder Formatierungsfehler', 'Incomplete, cut off, or formatting error'],
  other: ['Sonstiges Feedback', 'Other feedback'],
} as const;

export function saveAiFeedback(entry: Omit<AiFeedbackEntry, 'id' | 'timestamp'>): AiFeedbackEntry {
  const fullEntry: AiFeedbackEntry = {
    ...entry,
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now()
  };

  try {
    const storage = globalThis.localStorage;

    if (storage) {
      const raw = storage.getItem(AI_FEEDBACK_STORAGE_KEY);
      const list: AiFeedbackEntry[] = raw ? JSON.parse(raw) : [];
      list.unshift(fullEntry);
      // Keep last 100 entries
      storage.setItem(AI_FEEDBACK_STORAGE_KEY, JSON.stringify(list.slice(0, 100)));
    }
  } catch {
    // Feedback can be drafted even if local storage is unavailable.
  }

  return fullEntry;
}

export function aiFeedbackReportLabel(locale: string): string {
  return shellText(locale, 'Antwort melden', 'Report reply');
}

export async function openAiFeedbackDraft(
  reason: AiFeedbackEntry['reason'],
  comments: string,
  openExternal: (url: string) => Promise<boolean>,
): Promise<boolean> {
  const details = comments.trim();
  const body = `Reason: ${feedbackReasons[reason][1]}${details ? `\r\n\r\n${details}` : ''}`;
  const query = new URLSearchParams({ subject: 'LastBrowser AI response report', body });
  const url = `mailto:${supportEmail}?${query.toString().replace(/\+/g, '%20')}`;
  // Electron's external URL handler limits Windows URLs to 2081 characters.
  if (url.length > 2081) return false;
  try {
    return await openExternal(url);
  } catch {
    return false;
  }
}

type AiFeedbackModalProps = {
  open: boolean;
  messageContent: string;
  onClose: () => void;
  onSubmitted?: (entry: AiFeedbackEntry) => void;
};

export function AiFeedbackModal({ open, ...props }: AiFeedbackModalProps): JSX.Element | null {
  return open ? <AiFeedbackForm {...props} /> : null;
}

function AiFeedbackForm({
  messageContent,
  onClose,
  onSubmitted,
}: Omit<AiFeedbackModalProps, 'open'>): JSX.Element {
  const { locale } = useDesktopI18n();
  const id = useId();
  const [reason, setReason] = useState<AiFeedbackEntry['reason']>('inaccurate');
  const [comments, setComments] = useState('');
  const [draft, setDraft] = useState<'opening' | 'opened' | 'unavailable' | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft === 'opening') return;
    setDraft('opening');
    const opened = await openAiFeedbackDraft(reason, comments, url => window.lastbrowser.system.openExternal(url));
    setDraft(opened ? 'opened' : 'unavailable');
    if (opened) {
      const entry = saveAiFeedback({ reason, comments: comments.trim() || undefined });
      onSubmitted?.(entry);
    }
  };

  return (
    <div className="ai-feedback-modal-overlay" onClick={onClose}>
      <div className="ai-feedback-modal-card" role="dialog" aria-modal="true" aria-labelledby={id}
        onClick={(e) => e.stopPropagation()} onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        }}>
        <header className="ai-feedback-modal-header">
          <div className="ai-feedback-title-row">
            <ThumbsDown size={16} className="ai-feedback-icon" />
            <strong id={id}>{shellText(locale, 'KI-Antwort melden', 'Report an AI reply')}</strong>
          </div>
          <button type="button" className="ai-feedback-close-btn" onClick={onClose} aria-label={shellText(locale, "Schließen", "Close")}>
            <X size={14} />
          </button>
        </header>

          <form onSubmit={handleSubmit} className="ai-feedback-form">
            <p className="ai-feedback-intro">
              {shellText(locale,
                `Prüfe und sende den Entwurf an ${supportEmail} in deinem E-Mail-Programm. Füge nur Details ein, die du teilen möchtest.`,
                `Review and send the draft to ${supportEmail} in your email app. Include only details you want to share.`)}
            </p>

            <div className="ai-feedback-quote-preview">
              <span className="quote-label">{shellText(locale, 'Auszug (nur hier sichtbar)', 'Excerpt (shown only here)')}</span>
              <p className="quote-text">
                {messageContent.slice(0, 140)}
                {messageContent.length > 140 ? '…' : ''}
              </p>
            </div>

            <span id={`${id}-reason`} className="ai-feedback-field-label">
              {shellText(locale, 'Was trifft auf diese Antwort zu?', 'What applies to this reply?')}
            </span>
            <div className="ai-feedback-radio-group" role="group" aria-labelledby={`${id}-reason`}>
              {(Object.keys(feedbackReasons) as AiFeedbackEntry['reason'][]).map(option => (
                <label key={option} className="ai-feedback-radio-item">
                  <input type="radio" name="reason" value={option}
                    checked={reason === option} onChange={() => setReason(option)} />
                  <span>{shellText(locale, feedbackReasons[option][0], feedbackReasons[option][1])}</span>
                </label>
              ))}
            </div>

            <label htmlFor={`${id}-details`} className="ai-feedback-field-label">
              {shellText(locale, 'Details (optional)', 'Details (optional)')}
            </label>
            <textarea
              id={`${id}-details`}
              className="ai-feedback-textarea"
              placeholder={shellText(locale, "Was hätte die KI besser oder anders machen sollen?", "What should the AI have done differently?")}
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />

            {draft === 'opened' && <p className="ai-feedback-intro" role="status">
              {shellText(locale, 'Prüfe den Entwurf in deinem E-Mail-Programm und sende ihn dort ab.',
                'Review and send the draft in your email app.')}
            </p>}
            {draft === 'unavailable' && <p className="ai-feedback-intro" role="alert">
              {shellText(locale, `Der Entwurf konnte nicht geöffnet werden. Sende deine Meldung per E-Mail an ${supportEmail}.`,
                `Could not open the draft. Email your report to ${supportEmail}.`)}
            </p>}
            <footer className="ai-feedback-footer">
              <button type="button" className="button button-ghost" onClick={onClose}>
                {shellText(locale, 'Schließen', 'Close')}
              </button>
              <button type="submit" className="button button-primary" disabled={draft === 'opening'}>
                {shellText(locale, 'E-Mail-Entwurf öffnen', 'Open email draft')}
              </button>
            </footer>
          </form>
      </div>
    </div>
  );
}
