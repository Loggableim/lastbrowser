/**
 * Google Code Assist OAuth account settings.
 *
 * Settings panel for managing multiple connected Google accounts
 * The Sidekick runtime currently stores one active Code Assist OAuth identity.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  User,
  UserCheck,
  Zap
} from 'lucide-react';
import { useGeminiAccountStore, accountUsageSummary, type GeminiOAuthAccount } from '../stores/useGeminiAccountStore.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type OAuthFlowState = 'idle' | 'starting' | 'waiting' | 'success' | 'error' | 'cancelled';

type AddAccountFlow = {
  state: OAuthFlowState;
  flowId?: string;
  verificationUri?: string;
  authUrl?: string;
  userCode?: string;
  error?: string;
  pollInterval?: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function openInSystemBrowser(url: string): void {
  if (!url) return;
  if (window.lastbrowser?.system?.openExternal) {
    void window.lastbrowser.system.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ─── AccountRow ───────────────────────────────────────────────────────────────

function AccountRow({
  account,
  isActive,
  onRename
}: {
  account: GeminiOAuthAccount;
  isActive: boolean;
  onRename: (label: string) => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(account.label);

  function commitRename(): void {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== account.label) onRename(trimmed);
    setEditing(false);
  }

  return (
    <div className={`gemini-account-row ${isActive ? 'active' : ''}`}>
      <div className="gemini-account-avatar" title={account.email}>
        {isActive ? <UserCheck size={18} /> : <User size={18} />}
      </div>

      <div className="gemini-account-info">
        {editing ? (
          <input
            autoFocus
            className="gemini-account-label-input"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setLabelDraft(account.label); setEditing(false); }
            }}
          />
        ) : (
          <button
            className="gemini-account-label"
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {account.label}
          </button>
        )}
        <span className="gemini-account-email">{account.email}</span>
        <span className="gemini-account-meta">
          {accountUsageSummary(account)} · Added {formatDate(account.addedAt)}
        </span>
      </div>

      <div className="gemini-account-badges">
        {isActive && (
          <span className="gemini-badge active" title="Currently active account">
            Active
          </span>
        )}
      </div>
    </div>
  );
}

// ─── OAuthFlowCard ────────────────────────────────────────────────────────────

function OAuthFlowCard({
  flow,
  onCancel
}: {
  flow: AddAccountFlow;
  onCancel: () => void;
}): JSX.Element {
  if (flow.state === 'starting') {
    return (
      <div className="gemini-oauth-card loading">
        <Loader2 size={20} className="spin" />
        <span>Starting Google sign-in…</span>
      </div>
    );
  }

  if (flow.state === 'waiting' && (flow.verificationUri || flow.authUrl)) {
    const targetUrl = flow.authUrl || flow.verificationUri || '';
    return (
      <div className="gemini-oauth-card waiting">
        <div className="gemini-oauth-card-header">
          <span className="gemini-oauth-title">📲 Google-Anmeldung starten</span>
          <button className="gemini-action-btn" onClick={onCancel}>Abbrechen</button>
        </div>
        <p className="gemini-oauth-instruction">
          {flow.userCode
            ? 'Öffnen Sie den Link und geben Sie den untenstehenden Code ein:'
            : 'Melden Sie sich mit Ihrem Google-Konto an, um Lastbrowser zu autorisieren.'}
        </p>

        <div className="gemini-oauth-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '12px 0 10px 0' }}>
          <button
            type="button"
            className="gemini-action-btn primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)',
              color: '#ffffff',
              border: '1px solid rgba(66, 133, 244, 0.4)',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(26, 115, 232, 0.35)'
            }}
            onClick={() => openInSystemBrowser(targetUrl)}
            title="Öffnet Google Sign-In in Ihrem Standardbrowser (Chrome / Edge / Firefox)"
          >
            <ExternalLink size={15} />
            <span>Im Standardbrowser anmelden (Empfohlen)</span>
          </button>

        </div>

        <div style={{
          fontSize: '11px',
          lineHeight: '1.45',
          color: '#cbd5e1',
          background: 'rgba(30, 58, 138, 0.25)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '6px',
          padding: '8px 12px',
          margin: '8px 0 10px 0'
        }}>
          💡 <strong>Hinweis zu Google-Sicherheitsprüfungen:</strong> Google blockiert häufig Anmeldungen in eingebetteten App-Fenstern mit der Meldung <em>„Dieser Browser oder diese App ist unter Umständen nicht sicher“</em>. Über <strong>„Im Standardbrowser anmelden“</strong> nutzen Sie Ihr bereits angemeldetes Google-Konto sicher und ohne Passworteingabe.
        </div>

        <div style={{ fontSize: '11px', color: '#64748b', wordBreak: 'break-all', marginBottom: '8px' }}>
          URL: <a href={targetUrl} onClick={(e) => { e.preventDefault(); openInSystemBrowser(targetUrl); }} style={{ color: '#60a5fa' }}>{targetUrl}</a>
        </div>

        {flow.userCode && (
          <div className="gemini-oauth-code-row">
            <span className="gemini-oauth-code">{flow.userCode}</span>
            <button
              className="gemini-action-btn"
              onClick={() => { void navigator.clipboard.writeText(flow.userCode!); }}
              title="Copy code"
            >
              Kopieren
            </button>
          </div>
        )}
        <p className="gemini-oauth-hint">
          <Loader2 size={12} className="spin" /> Warte auf Autorisierung…
        </p>
      </div>
    );
  }

  if (flow.state === 'success') {
    return (
      <div className="gemini-oauth-card success">
        <CheckCircle2 size={20} />
        <span>Account connected successfully!</span>
      </div>
    );
  }

  if (flow.state === 'error') {
    return (
      <div className="gemini-oauth-card error">
        <AlertCircle size={20} />
        <span>{flow.error || 'Authentication failed. Please try again.'}</span>
        <button className="gemini-action-btn" onClick={onCancel}>Dismiss</button>
      </div>
    );
  }

  return <></>;
}

// ─── GeminiAccountsPanel ──────────────────────────────────────────────────────

export type GeminiAccountsPanelProps = {
  /** Whether the Sidekick backend is ready to accept OAuth requests. */
  sidekickReady: boolean;
};

export function GeminiAccountsPanel({ sidekickReady }: GeminiAccountsPanelProps): JSX.Element {
  const {
    accounts,
    currentIndex,
    replaceActiveAccount,
    renameAccount,
  } = useGeminiAccountStore();

  const [flow, setFlow] = useState<AddAccountFlow>({ state: 'idle' });
  const [labelDraft, setLabelDraft] = useState('');
  const activeFlowId = useRef<string | null>(null);

  const activeAccount = accounts[currentIndex] ?? accounts[0];

  // ─── OAuth Flow ────────────────────────────────────────────────────────────

  const startOAuth = useCallback(async () => {
    if (!sidekickReady) return;
    const label = labelDraft.trim() || `Account ${accounts.length + 1}`;
    setFlow({ state: 'starting' });

    try {
      const response = await window.lastbrowser.sidekick.startOAuth({ provider: 'google-gemini-cli' });

      if (!response?.flow_id) {
        setFlow({ state: 'error', error: response?.error || 'Could not start OAuth flow.' });
        return;
      }
      activeFlowId.current = response.flow_id;

      const authUrl = response.auth_url;
      const verificationUri = response.verification_uri;

      setFlow({
        state: 'waiting',
        flowId: response.flow_id,
        verificationUri,
        authUrl,
        userCode: response.user_code,
        pollInterval: response.poll_interval_seconds ?? 5
      });

      let opened = false;
      if (authUrl && !response.user_code) {
        openInSystemBrowser(authUrl);
        opened = true;
      }

      // Poll until done.
      const interval = (response.poll_interval_seconds ?? 5) * 1000;
      const maxAttempts = Math.ceil(((response.expires_at ?? Date.now() / 1000 + 300) - Date.now() / 1000) / (interval / 1000));

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, interval));

        // Check if user cancelled.
        if (activeFlowId.current !== response.flow_id) return;

        const poll = await window.lastbrowser.sidekick.pollOAuth(response.flow_id).catch(() => null);
        const status = poll?.status;

        const liveAuthUrl = (poll as { auth_url?: string })?.auth_url;
        if (!opened && liveAuthUrl && !response.user_code) {
          setFlow((prev) => ({ ...prev, authUrl: liveAuthUrl }));
          openInSystemBrowser(liveAuthUrl);
          opened = true;
        }

        if (status === 'success') {
          const pollEmail = (poll as { email?: string })?.email;
          const email = typeof pollEmail === 'string' && pollEmail.includes('@')
            ? pollEmail
            : `Google account ${accounts.length + 1}`;
          if (activeFlowId.current !== response.flow_id) return;
          replaceActiveAccount({ label, email, flowId: response.flow_id, preferredModel: 'gemini-2.5-flash' });
          activeFlowId.current = null;
          setFlow({ state: 'success' });
          setLabelDraft('');
          // Auto-dismiss after 2s.
          setTimeout(() => setFlow({ state: 'idle' }), 2000);
          return;
        }

        if (status === 'expired' || status === 'error' || status === 'cancelled') {
          activeFlowId.current = null;
          setFlow({ state: 'error', error: `Authentication ${status}.` });
          return;
        }
      }

      activeFlowId.current = null;
      setFlow({ state: 'error', error: 'Authentication timed out.' });
    } catch (err) {
      activeFlowId.current = null;
      setFlow({ state: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }, [sidekickReady, labelDraft, accounts.length, replaceActiveAccount]);

  function cancelOAuth(): void {
    activeFlowId.current = null;
    if (flow.flowId) {
      void window.lastbrowser.sidekick.cancelOAuth({ flowId: flow.flowId, provider: 'google-gemini-cli' }).catch(() => null);
    }
    setFlow({ state: 'idle' });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const isFlowActive = flow.state !== 'idle';

  return (
    <div className="gemini-accounts-panel">
      {/* ── Header ── */}
      <div className="gemini-accounts-header">
        <div className="gemini-accounts-title-row">
          <span className="gemini-accounts-icon">✦</span>
          <div>
            <h3 className="gemini-accounts-title">Google Accounts</h3>
            <p className="gemini-accounts-subtitle">
              Connect the Google account used by Gemini CLI / Code Assist. Gemini API-key access is configured separately.
            </p>
          </div>
        </div>
      </div>

      <div className="gemini-rr-controls" role="note">
        <p>The backend supports one active OAuth account. Signing in with another Google account replaces those credentials. Any account rows below are preserved local metadata only and are not rotated through chat requests.</p>
      </div>

      {/* ── Account List ── */}
      {accounts.length > 0 && (
        <div className="gemini-account-list">
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              isActive={false}
              onRename={(label) => renameAccount(account.id, label)}
            />
          ))}
        </div>
      )}

      {accounts.length === 0 && !isFlowActive && (
        <div className="gemini-accounts-empty">
          <User size={32} className="gemini-accounts-empty-icon" />
          <p>No Google accounts connected yet.</p>
          <p className="gemini-accounts-empty-sub">Add your first account to use the Gemini CLI provider.</p>
        </div>
      )}

      {/* ── OAuth Flow Card ── */}
      {isFlowActive && (
        <OAuthFlowCard flow={flow} onCancel={cancelOAuth} />
      )}

      {/* ── Add Account ── */}
      {!isFlowActive && (
        <div className="gemini-add-account">
          <input
            className="gemini-label-input"
            placeholder={`Account ${accounts.length + 1} label (e.g. "Privat")`}
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void startOAuth(); }}
            disabled={!sidekickReady}
          />
          <button
            className="gemini-add-btn"
            onClick={() => void startOAuth()}
            disabled={!sidekickReady}
            title={sidekickReady ? 'Connect Google account via OAuth' : 'Sidekick is not ready'}
          >
            <Plus size={15} />
            Sign in with Google
          </button>
        </div>
      )}

      {/* ── Usage Stats ── */}
      {activeAccount && <p className="gemini-refresh-hint">The active OAuth identity is managed by Sidekick. It is not the Gemini API key setting.</p>}

      {/* ── Refresh hint ── */}
      {accounts.length > 0 && (
        <p className="gemini-refresh-hint">
          <RefreshCw size={11} />
          Token refresh is handled automatically by the Sidekick backend.
        </p>
      )}
    </div>
  );
}
