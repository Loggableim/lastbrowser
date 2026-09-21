/**
 * Phase 12 – Google Accounts Panel (Multi-OAuth Round-Robin)
 *
 * Settings panel for managing multiple connected Google accounts
 * for the `google-gemini-cli` provider with round-robin token distribution.
 */

import React, { useState, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Shuffle,
  Trash2,
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

// ─── AccountRow ───────────────────────────────────────────────────────────────

function AccountRow({
  account,
  isActive,
  isNext,
  onMakeActive,
  onRemove,
  onRename
}: {
  account: GeminiOAuthAccount;
  isActive: boolean;
  isNext: boolean;
  onMakeActive: () => void;
  onRemove: () => void;
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
    <div className={`gemini-account-row ${isActive ? 'active' : ''} ${isNext ? 'next-up' : ''}`}>
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
        {isNext && !isActive && (
          <span className="gemini-badge next" title="Next in round-robin queue">
            Next ↑
          </span>
        )}
      </div>

      <div className="gemini-account-actions">
        {!isActive && (
          <button
            className="gemini-action-btn"
            onClick={onMakeActive}
            title="Make this account active now"
          >
            <ChevronRight size={14} />
            Use now
          </button>
        )}
        <button
          className="gemini-action-btn danger"
          onClick={onRemove}
          title="Disconnect this account"
        >
          <Trash2 size={14} />
        </button>
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
          <span className="gemini-oauth-title">📲 Open Google sign-in</span>
          <button className="gemini-action-btn" onClick={onCancel}>Cancel</button>
        </div>
        <p className="gemini-oauth-instruction">
          {flow.userCode
            ? 'Visit the link below and enter the code to connect your Google account.'
            : 'Sign in with your Google account in the opened window to authorize Lastbrowser.'}
        </p>
        <a
          className="gemini-oauth-uri"
          href={targetUrl}
          target="_blank"
          rel="noreferrer"
        >
          {targetUrl} <ExternalLink size={12} />
        </a>
        {flow.userCode && (
          <div className="gemini-oauth-code-row">
            <span className="gemini-oauth-code">{flow.userCode}</span>
            <button
              className="gemini-action-btn"
              onClick={() => { void navigator.clipboard.writeText(flow.userCode!); }}
              title="Copy code"
            >
              Copy
            </button>
          </div>
        )}
        <p className="gemini-oauth-hint">
          <Loader2 size={12} className="spin" /> Waiting for authorisation…
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
    roundRobinEnabled,
    rotatePerSession,
    addAccount,
    removeAccount,
    renameAccount,
    setRoundRobinEnabled,
    setRotatePerSession,
    setActiveAccount,
    getNextAccount
  } = useGeminiAccountStore();

  const [flow, setFlow] = useState<AddAccountFlow>({ state: 'idle' });
  const [labelDraft, setLabelDraft] = useState('');

  // Index of the next account in the queue (without advancing the pointer).
  const nextIndex = accounts.length === 0 ? -1 : (currentIndex % accounts.length);
  const upcomingIndex = accounts.length < 2 ? -1 : ((currentIndex + 1) % accounts.length);

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

      if (authUrl && !response.user_code) {
        window.open(authUrl, '_blank', 'noopener,noreferrer');
      }

      // Poll until done.
      const interval = (response.poll_interval_seconds ?? 5) * 1000;
      const maxAttempts = Math.ceil(((response.expires_at ?? Date.now() / 1000 + 300) - Date.now() / 1000) / (interval / 1000));

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, interval));

        // Check if user cancelled.
        if (flow.state === 'idle' || flow.state === 'cancelled') return;

        const poll = await window.lastbrowser.sidekick.pollOAuth(response.flow_id).catch(() => null);
        const status = poll?.status;

        if (status === 'success') {
          const pollEmail = (poll as { email?: string })?.email;
          const email = typeof pollEmail === 'string' ? pollEmail : (label || `google-account-${Date.now()}`);
          addAccount({ label, email, flowId: response.flow_id, preferredModel: 'gemini-2.5-flash' });
          setFlow({ state: 'success' });
          setLabelDraft('');
          // Auto-dismiss after 2s.
          setTimeout(() => setFlow({ state: 'idle' }), 2000);
          return;
        }

        if (status === 'expired' || status === 'error' || status === 'cancelled') {
          setFlow({ state: 'error', error: `Authentication ${status}.` });
          return;
        }
      }

      setFlow({ state: 'error', error: 'Authentication timed out.' });
    } catch (err) {
      setFlow({ state: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }, [sidekickReady, labelDraft, accounts.length, addAccount, flow.state]);

  function cancelOAuth(): void {
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
              Connect multiple Google accounts. Lastbrowser distributes requests evenly across all accounts.
            </p>
          </div>
        </div>
      </div>

      {/* ── Round-Robin Controls ── */}
      <div className="gemini-rr-controls">
        <label className="gemini-rr-toggle">
          <Shuffle size={15} />
          <span>
            <strong>Round-Robin</strong>
            <em>Distribute token usage evenly across all accounts</em>
          </span>
          <input
            type="checkbox"
            checked={roundRobinEnabled}
            onChange={(e) => setRoundRobinEnabled(e.target.checked)}
          />
          <span className="gemini-rr-toggle-thumb" />
        </label>

        {roundRobinEnabled && (
          <label className="gemini-rr-mode">
            <Zap size={13} />
            <span>Rotate per</span>
            <select
              value={rotatePerSession ? 'session' : 'message'}
              onChange={(e) => setRotatePerSession(e.target.value === 'session')}
            >
              <option value="session">New session</option>
              <option value="message">Every message</option>
            </select>
          </label>
        )}
      </div>

      {/* ── Account List ── */}
      {accounts.length > 0 && (
        <div className="gemini-account-list">
          {accounts.map((account, idx) => (
            <AccountRow
              key={account.id}
              account={account}
              isActive={idx === nextIndex}
              isNext={idx === upcomingIndex && roundRobinEnabled}
              onMakeActive={() => setActiveAccount(account.id)}
              onRemove={() => removeAccount(account.id)}
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
      {accounts.length > 1 && (
        <div className="gemini-usage-bar">
          <span className="gemini-usage-label">Token distribution</span>
          <div className="gemini-usage-track">
            {accounts.map((account) => {
              const total = accounts.reduce((s, a) => s + a.totalSessionsUsed, 0) || 1;
              const pct = Math.round((account.totalSessionsUsed / total) * 100);
              return (
                <div
                  key={account.id}
                  className="gemini-usage-segment"
                  style={{ flexGrow: account.totalSessionsUsed || 0.5 }}
                  title={`${account.label}: ${account.totalSessionsUsed} sessions (${pct}%)`}
                />
              );
            })}
          </div>
          <span className="gemini-usage-hint">
            {accounts.reduce((s, a) => s + a.totalSessionsUsed, 0)} total sessions
          </span>
        </div>
      )}

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
