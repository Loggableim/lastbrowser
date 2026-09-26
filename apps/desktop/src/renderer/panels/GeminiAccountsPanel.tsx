import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';

export type GeminiAccountsPanelProps = {
  /** Retained for compatibility with the settings panel; this notice is offline-safe. */
  sidekickReady?: boolean;
};

const ANTIGRAVITY_MIGRATION_URL = 'https://antigravity.google/docs/cli/gcli-migration';
const GOOGLE_ANNOUNCEMENT_URL = 'https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/';

export function GeminiAccountsPanel(_props: GeminiAccountsPanelProps): JSX.Element {
  const { t } = useDesktopI18n();
  return (
    <div className="gemini-accounts-panel">
      <div className="gemini-accounts-header">
        <div className="gemini-accounts-title-row">
          <span className="gemini-accounts-icon">✦</span>
          <div><h3 className="gemini-accounts-title">{t('settings.panels.providers.geminiSubscriptionTitle')}</h3></div>
        </div>
      </div>
      <div className="gemini-rr-controls" role="note">
        <p>{t('settings.panels.providers.geminiSubscriptionMigration')}</p>
        <p>{t('settings.panels.providers.geminiSubscriptionApiKey')}</p>
      </div>
      <div className="gemini-add-account">
        <button type="button" className="secondary-action compact" onClick={() => void window.lastbrowser.system.openExternal(ANTIGRAVITY_MIGRATION_URL)}>
          {t('settings.panels.providers.geminiSubscriptionDocs')} <ExternalLink size={13} />
        </button>
        <button type="button" className="secondary-action compact" onClick={() => void window.lastbrowser.system.openExternal(GOOGLE_ANNOUNCEMENT_URL)}>
          {t('settings.panels.providers.geminiSubscriptionAnnouncement')} <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
}
