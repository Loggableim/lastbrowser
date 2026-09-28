import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';

export type GeminiAccountsPanelProps = {
  /** Retained for compatibility with the settings panel; this notice is offline-safe. */
  sidekickReady?: boolean;
};

type AntigravityAccount = {
  email: string;
  label?: string;
  project_id?: string;
  last_status?: string | null;
  last_error_reason?: string | null;
  has_refresh_token?: boolean;
};

type AntigravityStatus = {
  provider_available?: boolean;
  connected_accounts?: number;
  accounts?: AntigravityAccount[];
  round_robin?: boolean;
};

const ANTIGRAVITY_MIGRATION_URL = 'https://antigravity.google/docs/';

export function GeminiAccountsPanel(_props: GeminiAccountsPanelProps): JSX.Element {
  const { t } = useDesktopI18n();
  const [status, setStatus] = useState<AntigravityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [flowBusy, setFlowBusy] = useState(false);
  const [flowMessage, setFlowMessage] = useState('');
  const [pollTimer, setPollTimer] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.lastbrowser.sidekick.requestWebui({
        method: 'GET',
        path: '/api/antigravity/accounts'
      });
      setStatus(data as AntigravityStatus);
      setFlowMessage('');
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollTimer !== null) window.clearInterval(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addAccount = useCallback(async () => {
    setFlowBusy(true);
    setFlowMessage(t('settings.panels.providers.antigravityStarting'));
    try {
      const response = await window.lastbrowser.sidekick.startOAuth({ provider: 'antigravity' });
      const flowId = String(response.flow_id || '');
      const authUrl = String((response as { auth_url?: string }).auth_url || '');
      if (authUrl) {
        await window.lastbrowser.system.openExternal(authUrl).catch(() => undefined);
        setFlowMessage(t('settings.panels.providers.antigravityWaiting'));
      }
      if (!flowId) throw new Error(String((response as { error?: string }).error || 'OAuth flow failed'));
      const timer = window.setInterval(async () => {
        try {
          const poll = await window.lastbrowser.sidekick.pollOAuth(flowId);
          const pollStatus = String((poll as { status?: string }).status || '');
          if (pollStatus === 'success') {
            window.clearInterval(timer);
            setPollTimer(null);
            setFlowBusy(false);
            const email = String((poll as { email?: string }).email || '');
            setFlowMessage(email ? `✓ ${email}` : '✓');
            void refresh();
          } else if (pollStatus === 'error' || pollStatus === 'cancelled' || pollStatus === 'expired') {
            window.clearInterval(timer);
            setPollTimer(null);
            setFlowBusy(false);
            setFlowMessage(`✗ ${String((poll as { error?: string }).error || pollStatus)}`);
          }
        } catch {
          // transient poll failure — keep waiting
        }
      }, 3000);
      setPollTimer(timer);
    } catch (error) {
      setFlowBusy(false);
      setFlowMessage(`✗ ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [refresh, t]);

  const removeAccount = useCallback(async (email: string) => {
    try {
      await window.lastbrowser.sidekick.requestWebui({
        method: 'POST',
        path: '/api/antigravity/accounts',
        body: { action: 'remove', email }
      });
      void refresh();
    } catch (error) {
      setFlowMessage(`✗ ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [refresh]);

  const accounts = status?.accounts || [];

  return (
    <div className="gemini-accounts-panel">
      <div className="gemini-accounts-header">
        <div className="gemini-accounts-title-row">
          <span className="gemini-accounts-icon">✦</span>
          <div><h3 className="gemini-accounts-title">{t('settings.panels.providers.googleAccounts')}</h3></div>
        </div>
        <button
          type="button"
          className="secondary-action compact"
          onClick={() => void refresh()}
          disabled={loading}
          title="Refresh"
        >
          {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
        </button>
      </div>
      <div className="gemini-rr-controls" role="note">
        <p>{t('settings.panels.providers.antigravityRoundRobinHint')}</p>
      </div>

      {accounts.length > 0 && (
        <ul className="antigravity-account-list">
          {accounts.map((account) => (
            <li key={account.email} className="antigravity-account-row">
              <div className="antigravity-account-info">
                <strong>{account.label || account.email}</strong>
                <span className="antigravity-account-meta">
                  {account.email}
                  {account.last_error_reason === 'invalid_grant' ? ' · reconnect required' : ''}
                </span>
              </div>
              <button
                type="button"
                className="secondary-action compact"
                onClick={() => void removeAccount(account.email)}
                title={t('common.remove')}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {accounts.length === 0 && !loading && (
        <p className="antigravity-empty-hint">{t('settings.panels.providers.antigravityEmptyHint')}</p>
      )}

      <div className="gemini-add-account">
        <button
          type="button"
          className="primary-action compact"
          onClick={() => void addAccount()}
          disabled={flowBusy}
        >
          {flowBusy ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
          <span>{t('settings.panels.providers.antigravityAddAccount')}</span>
        </button>
        <button type="button" className="secondary-action compact" onClick={() => void window.lastbrowser.system.openExternal(ANTIGRAVITY_MIGRATION_URL)}>
          {t('settings.panels.providers.geminiSubscriptionDocs')} <ExternalLink size={13} />
        </button>
      </div>
      {flowMessage && <div className="antigravity-flow-message">{flowMessage}</div>}
    </div>
  );
}
