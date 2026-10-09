import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';
import { createAntigravityAuthUrlOpener } from './antigravity-auth-flow.js';

export type GeminiAccountsPanelProps = {
  /** Retained for compatibility with the settings panel; this notice is offline-safe. */
  sidekickReady?: boolean;
  onAccountsChanged?: () => void;
  catalogStatus?: string | null;
  providerId?: string;
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

type LiveModelsResponse = {
  provider?: string;
  models?: Array<{ id?: string; label?: string; name?: string } | string>;
  count?: number;
  catalog_status?: 'ready' | 'unavailable' | string;
};

const ANTIGRAVITY_MIGRATION_URL = 'https://antigravity.google/docs/';

export function GeminiAccountsPanel({
  sidekickReady: _sidekickReady,
  onAccountsChanged,
  catalogStatus: propCatalogStatus,
  providerId = 'antigravity',
}: GeminiAccountsPanelProps): JSX.Element {
  const { t } = useDesktopI18n();
  const [status, setStatus] = useState<AntigravityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<string | null>(propCatalogStatus ?? null);
  const [catalogModels, setCatalogModels] = useState<Array<{ id: string; label: string }>>([]);
  const [flowBusy, setFlowBusy] = useState(false);
  const [flowMessage, setFlowMessage] = useState('');
  const pollTimerRef = useRef<number | null>(null);

  const isAntigravity = providerId.trim().toLowerCase() === 'antigravity';
  const effectiveCatalogStatus = catalogStatus ?? (propCatalogStatus ? String(propCatalogStatus).toLowerCase() : null);
  const _isCatalogReady = effectiveCatalogStatus === 'ready';

  const refresh = useCallback(async () => {
    setLoading(true);
    setCatalogLoading(true);
    try {
      const data = await window.lastbrowser.sidekick.requestWebui({
        method: 'GET',
        path: '/api/antigravity/accounts'
      });
      const parsedStatus = data as AntigravityStatus;
      setStatus(parsedStatus);
      setFlowMessage('');

      const accountsCount = parsedStatus?.accounts?.length || 0;
      if (accountsCount > 0) {
        try {
          const liveData = (await window.lastbrowser.sidekick.requestWebui({
            method: 'GET',
            path: '/api/models/live?provider=antigravity'
          })) as LiveModelsResponse;
          const statusStr = liveData?.catalog_status === 'ready' ? 'ready'
            : liveData?.catalog_status === 'unavailable' ? 'unavailable' : 'unknown';
          setCatalogStatus(statusStr);
          const rawModels = statusStr === 'ready' && Array.isArray(liveData?.models) ? liveData.models : [];
          const normalized = rawModels
            .map((m) => {
              if (typeof m === 'string') return { id: m, label: m };
              const id = String(m?.id || m?.name || '').trim();
              return id ? { id, label: String(m?.label || id).trim() } : null;
            })
            .filter((m): m is { id: string; label: string } => Boolean(m));
          setCatalogModels(normalized);
        } catch {
          setCatalogStatus('unknown');
          setCatalogModels([]);
        }
      } else {
        setCatalogStatus(null);
        setCatalogModels([]);
      }
    } catch {
      setStatus(null);
      setCatalogStatus(null);
      setCatalogModels([]);
    } finally {
      setLoading(false);
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addAccount = useCallback(async () => {
    setFlowBusy(true);
    setFlowMessage(t('settings.panels.providers.antigravityStarting'));
    try {
      const response = await window.lastbrowser.sidekick.startOAuth({ provider: 'antigravity' });
      const flowId = String(response.flow_id || '');
      let timer: number | null = null;
      let flowFinished = false;
      let consecutivePollFailures = 0;
      const openAuthUrlOnce = createAntigravityAuthUrlOpener(
        (authUrl) => window.lastbrowser.system.openExternal(authUrl),
        () => {
          if (!flowFinished) setFlowMessage(t('settings.panels.providers.antigravityWaiting'));
        },
        () => {
          if (flowFinished) return;
          // Browser launch failures are often transient (for example, when
          // Windows is still starting the default browser). Keep polling so
          // the auth URL opener can retry it on the next pending response.
          setFlowMessage(`✗ ${t('settings.panels.providers.connectionError')}`);
        }
      );
      // Some backend versions return auth_url immediately; the current
      // background worker usually publishes it in a later pending poll.
      openAuthUrlOnce(response.auth_url);
      if (!flowId) throw new Error(String((response as { error?: string }).error || 'OAuth flow failed'));
      timer = window.setInterval(async () => {
        if (flowFinished) return;
        try {
          const poll = await window.lastbrowser.sidekick.pollOAuth(flowId);
          consecutivePollFailures = 0;
          openAuthUrlOnce((poll as { auth_url?: string }).auth_url);
          const pollStatus = String((poll as { status?: string }).status || '');
          if (pollStatus === 'success') {
            flowFinished = true;
            if (timer !== null) window.clearInterval(timer);
            pollTimerRef.current = null;
            setFlowBusy(false);
            const email = String((poll as { email?: string }).email || '');
            setFlowMessage(email ? `✓ ${email}` : '✓');
            void refresh();
            onAccountsChanged?.();
          } else if (pollStatus === 'error' || pollStatus === 'cancelled' || pollStatus === 'expired') {
            flowFinished = true;
            if (timer !== null) window.clearInterval(timer);
            pollTimerRef.current = null;
            setFlowBusy(false);
            setFlowMessage(`✗ ${String((poll as { error?: string }).error || pollStatus)}`);
          }
        } catch {
          // Retry a few transient failures, then make the broken connection
          // visible instead of leaving the user in an indefinite spinner.
          consecutivePollFailures += 1;
          if (consecutivePollFailures >= 5) {
            flowFinished = true;
            if (timer !== null) window.clearInterval(timer);
            pollTimerRef.current = null;
            setFlowBusy(false);
            setFlowMessage(`✗ ${t('settings.panels.providers.connectionError')}`);
            void window.lastbrowser.sidekick.cancelOAuth({ flowId, provider: 'antigravity' }).catch(() => null);
          }
        }
      }, 3000);
      pollTimerRef.current = timer;
    } catch (error) {
      setFlowBusy(false);
      setFlowMessage(`✗ ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [onAccountsChanged, refresh, t]);

  const removeAccount = useCallback(async (email: string) => {
    try {
      await window.lastbrowser.sidekick.requestWebui({
        method: 'POST',
        path: '/api/antigravity/accounts',
        body: { action: 'remove', email }
      });
      void refresh();
      onAccountsChanged?.();
    } catch (error) {
      setFlowMessage(`✗ ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [onAccountsChanged, refresh]);

  const accounts = status?.accounts || [];

  return (
    <div className="gemini-accounts-panel">
      <div className="gemini-accounts-header">
        <div className="gemini-accounts-title-row">
          <span className="gemini-accounts-icon">✦</span>
          <div><h3 className="gemini-accounts-title">{t('settings.sections.googleAccounts')}</h3></div>
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
        <p>
          {!isAntigravity && status?.round_robin
            ? t('settings.panels.providers.googleAccountsRoundRobinDescription')
            : t('settings.panels.providers.antigravityRoundRobinHint')}
        </p>
      </div>

      {accounts.length > 0 && (
        <ul className="antigravity-account-list">
          {accounts.map((account) => (
            <li key={account.email} className="antigravity-account-row">
              <div className="antigravity-account-info">
                <strong>{account.label || account.email}</strong>
                <span className="antigravity-account-meta">
                  {account.email}
                  {account.last_error_reason === 'invalid_grant' ? ` · ${t('settings.panels.providers.antigravityReconnectRequired')}` : ''}
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

      {accounts.length > 0 && (
        <div className="antigravity-catalog-status" role="status" style={{ marginTop: 8 }}>
          {catalogLoading && (
            <div className="antigravity-catalog-loading" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary, #9ab)' }}>
              <Loader2 size={13} className="spin" />
              <span>{t('settings.panels.providers.loadingModels')}</span>
            </div>
          )}
          {!catalogLoading && catalogStatus === 'unavailable' && (
            <p className="antigravity-catalog-notice" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary, #9ab)' }}>
              {t('settings.panels.providers.antigravityCatalogUnavailable')}
            </p>
          )}
          {!catalogLoading && catalogStatus !== 'ready' && catalogStatus !== 'unavailable' && (
            <p className="antigravity-catalog-notice" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary, #9ab)' }}>
              {t('settings.panels.providers.antigravityCatalogUnknown')}
            </p>
          )}
          {!catalogLoading && catalogStatus === 'ready' && catalogModels.length === 0 && (
            <p className="antigravity-catalog-notice" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary, #9ab)' }}>
              {t('settings.panels.providers.antigravityCatalogUnavailable')}
            </p>
          )}
          {!catalogLoading && catalogStatus === 'ready' && catalogModels.length > 0 && (
            <div className="antigravity-catalog-models" style={{ marginTop: 6, fontSize: 12 }}>
              <div style={{ marginBottom: 4, color: 'var(--text-secondary, #9ab)' }}>
                {t('settings.panels.providers.antigravityCatalogReady')}:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {catalogModels.map((m) => (
                  <span key={m.id} className="settings-badge" title={m.id}>
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
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
