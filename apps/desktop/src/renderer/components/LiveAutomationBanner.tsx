import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import { useLiveAutomationStore, abortLiveAutomation } from '../live-automation.js';

export interface LiveAutomationBannerProps {
  webview: Electron.WebviewTag | null;
}

export function LiveAutomationBanner({ webview }: LiveAutomationBannerProps): JSX.Element | null {
  const { running, actionLabel, stepDescription, aborted, lastError } = useLiveAutomationStore();

  // Escape key global listener while running
  useEffect(() => {
    if (!running) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        abortLiveAutomation(webview);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [running, webview]);

  if (!running && !aborted && !lastError) {
    return null;
  }

  return (
    <div
      className={`live-automation-banner ${aborted ? 'aborted' : running ? 'active' : 'idle'}`}
      role="status"
      aria-live="polite"
    >
      <div className="live-automation-content">
        {running ? (
          <>
            <span className="live-automation-pulse-dot" />
            <Sparkles size={14} className="live-automation-icon" />
            <span className="live-automation-label">
              <strong>KI-Assistent aktiv:</strong> {actionLabel}
            </span>
            {stepDescription && <span className="live-automation-step">• {stepDescription}</span>}
          </>
        ) : aborted ? (
          <>
            <AlertCircle size={14} className="live-automation-icon warn" />
            <span className="live-automation-label warn">
              <strong>Abgebrochen:</strong> Aktion durch Nutzer gestoppt (Esc)
            </span>
          </>
        ) : lastError ? (
          <>
            <AlertCircle size={14} className="live-automation-icon error" />
            <span className="live-automation-label error">
              <strong>Fehler:</strong> {lastError}
            </span>
          </>
        ) : null}
      </div>

      {running && (
        <button
          type="button"
          className="live-automation-abort-btn"
          title="Automatisierung abbrechen (Esc)"
          onClick={() => abortLiveAutomation(webview)}
        >
          <X size={12} />
          <span>Abbrechen <kbd>Esc</kbd></span>
        </button>
      )}
    </div>
  );
}
