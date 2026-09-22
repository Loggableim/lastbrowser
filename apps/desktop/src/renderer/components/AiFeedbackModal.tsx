/**
 * Microsoft Store AI Policy – AI Response Feedback & Reporting Modal
 *
 * Provides a user-facing reporting & feedback mechanism for generated AI responses
 * as required by Microsoft Store Generative AI policies.
 * Stores feedback records in localStorage ('lastbrowser.aiFeedback.v1') and
 * allows logging and support reporting.
 */

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, MessageSquare, ThumbsDown, X } from 'lucide-react';

export interface AiFeedbackEntry {
  id: string;
  timestamp: number;
  reason: 'inaccurate' | 'harmful' | 'formatting' | 'other';
  comments?: string;
  messageSnippet: string;
}

export const AI_FEEDBACK_STORAGE_KEY = 'lastbrowser.aiFeedback.v1';

export function saveAiFeedback(entry: Omit<AiFeedbackEntry, 'id' | 'timestamp'>): AiFeedbackEntry {
  const fullEntry: AiFeedbackEntry = {
    ...entry,
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now()
  };

  try {
    const storage = typeof window !== 'undefined' && window?.localStorage
      ? window.localStorage
      : typeof globalThis !== 'undefined'
      ? (globalThis as any).localStorage
      : null;

    if (storage) {
      const raw = storage.getItem(AI_FEEDBACK_STORAGE_KEY);
      const list: AiFeedbackEntry[] = raw ? JSON.parse(raw) : [];
      list.unshift(fullEntry);
      // Keep last 100 entries
      storage.setItem(AI_FEEDBACK_STORAGE_KEY, JSON.stringify(list.slice(0, 100)));
    }
  } catch (err) {
    console.error('[AI Feedback] Failed to persist feedback:', err);
  }

  return fullEntry;
}

export function AiFeedbackModal({
  open,
  messageContent,
  onClose,
  onSubmitted
}: {
  open: boolean;
  messageContent: string;
  onClose: () => void;
  onSubmitted?: (entry: AiFeedbackEntry) => void;
}): JSX.Element | null {
  const [reason, setReason] = useState<AiFeedbackEntry['reason']>('inaccurate');
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entry = saveAiFeedback({
      reason,
      comments: comments.trim() || undefined,
      messageSnippet: messageContent.slice(0, 300)
    });
    setSubmitted(true);
    setTimeout(() => {
      onSubmitted?.(entry);
      onClose();
      setSubmitted(false);
      setComments('');
    }, 1200);
  };

  return (
    <div className="ai-feedback-modal-overlay" onClick={onClose}>
      <div className="ai-feedback-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="ai-feedback-modal-header">
          <div className="ai-feedback-title-row">
            <ThumbsDown size={16} className="ai-feedback-icon" />
            <strong>Feedback zur KI-Antwort</strong>
          </div>
          <button type="button" className="ai-feedback-close-btn" onClick={onClose} aria-label="Schließen">
            <X size={14} />
          </button>
        </header>

        {submitted ? (
          <div className="ai-feedback-success-state">
            <CheckCircle2 size={32} color="#22c55e" />
            <p>Vielen Dank für deine Rückmeldung! Dein Feedback hilft, Lastbrowser zu verbessern.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="ai-feedback-form">
            <p className="ai-feedback-intro">
              Hilf uns, die Qualität und Sicherheit der generierten Antworten zu gewährleisten.
            </p>

            <div className="ai-feedback-quote-preview">
              <span className="quote-label">Auszug:</span>
              <p className="quote-text">
                {messageContent.slice(0, 140)}
                {messageContent.length > 140 ? '…' : ''}
              </p>
            </div>

            <label className="ai-feedback-field-label">Was trifft auf diese Antwort zu?</label>
            <div className="ai-feedback-radio-group">
              <label className="ai-feedback-radio-item">
                <input
                  type="radio"
                  name="reason"
                  value="inaccurate"
                  checked={reason === 'inaccurate'}
                  onChange={() => setReason('inaccurate')}
                />
                <span>Ungenau oder sachlich inkorrekt</span>
              </label>
              <label className="ai-feedback-radio-item">
                <input
                  type="radio"
                  name="reason"
                  value="harmful"
                  checked={reason === 'harmful'}
                  onChange={() => setReason('harmful')}
                />
                <span>Unangemessener, irreführender oder störender Inhalt</span>
              </label>
              <label className="ai-feedback-radio-item">
                <input
                  type="radio"
                  name="reason"
                  value="formatting"
                  checked={reason === 'formatting'}
                  onChange={() => setReason('formatting')}
                />
                <span>Unvollständig, abgeschnitten oder Formatierungsfehler</span>
              </label>
              <label className="ai-feedback-radio-item">
                <input
                  type="radio"
                  name="reason"
                  value="other"
                  checked={reason === 'other'}
                  onChange={() => setReason('other')}
                />
                <span>Sonstiges Feedback</span>
              </label>
            </div>

            <label className="ai-feedback-field-label">Details oder Anmerkungen (optional):</label>
            <textarea
              className="ai-feedback-textarea"
              placeholder="Was hätte die KI besser oder anders machen sollen?"
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />

            <footer className="ai-feedback-footer">
              <button type="button" className="button button-ghost" onClick={onClose}>
                Abbrechen
              </button>
              <button type="submit" className="button button-primary">
                Feedback senden
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
