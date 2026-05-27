import React, { useCallback, useEffect, useRef, useState } from 'react';

type UsageData = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  estimated_cost?: number;
  model?: string;
};

type ContextSegment = {
  id: string;
  label: string;
  icon: string;
  tokens: number;
  color: string;
};

type ContextInfo = {
  total_tokens?: number;
  context_window?: number;
  segments?: ContextSegment[];
  pct?: number;
};

export function ContextUsageIndicator({
  activeSessionId,
  ready
}: {
  activeSessionId: string | null;
  ready: boolean;
}): JSX.Element | null {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [context, setContext] = useState<ContextInfo | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUsage = useCallback(async () => {
    if (!activeSessionId || !ready) return;
    try {
      const u = await window.lastbrowser.sidekick.requestWebui({
        method: 'GET', path: '/api/session/usage',
        query: { session_id: activeSessionId }
      }) as UsageData;
      if (u && typeof u.total_tokens === 'number') setUsage(u);
    } catch { /* ignore */ }
  }, [activeSessionId, ready]);

  const fetchContext = useCallback(async () => {
    if (!activeSessionId || !ready) return;
    try {
      const c = await window.lastbrowser.sidekick.requestWebui({
        method: 'GET', path: '/api/session/context-info',
        query: { session_id: activeSessionId }
      }) as ContextInfo;
      if (c && typeof c.pct === 'number') setContext(c);
    } catch { /* ignore */ }
  }, [activeSessionId, ready]);

  // Poll every 10s while a session is active
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setUsage(null);
    setContext(null);
    if (!activeSessionId || !ready) return null;
    void fetchUsage();
    void fetchContext();
    pollRef.current = setInterval(() => {
      void fetchUsage();
      void fetchContext();
    }, 10000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [activeSessionId, ready, fetchUsage, fetchContext]);

  if (!usage && !context) return null;

  const pct = context?.pct ?? (context?.total_tokens && context?.context_window
    ? Math.round((context.total_tokens / context.context_window) * 100) : null);
  const displayPct = pct ?? 0;
  const tokenTotal = usage?.total_tokens ?? context?.total_tokens ?? 0;
  const cost = usage?.estimated_cost ?? 0;
  const segments = context?.segments ?? [];

  const barColor = displayPct > 85 ? '#f44336' : displayPct > 65 ? '#ff9800' : '#00d9ff';
  const barWidth = Math.min(displayPct, 100);

  return (
    <div className="context-usage-indicator">
      <button
        type="button"
        className="context-usage-trigger"
        onClick={() => setShowDetail((s) => !s)}
        title={`${tokenTotal.toLocaleString()} tokens · ${displayPct}% of context window`}
      >
        <svg className="context-usage-ring" width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="7" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="2" />
          <circle
            cx="9" cy="9" r="7"
            fill="none" stroke={barColor} strokeWidth="2"
            strokeDasharray={`${(barWidth / 100) * 43.98} 43.98`}
            strokeLinecap="round"
            transform="rotate(-90, 9, 9)"
            style={{ transition: 'stroke-dasharray 0.3s' }}
          />
        </svg>
        <span className="context-usage-tokens">{tokenTotal.toLocaleString()}</span>
      </button>

      {showDetail && (
        <div className="context-usage-detail">
          <div className="context-usage-detail-segments">
            {segments.map((seg) => (
              <div key={seg.id} className="context-usage-segment">
                <span className="context-usage-seg-icon">{seg.icon}</span>
                <span className="context-usage-seg-label">{seg.label}</span>
                <span className="context-usage-seg-value">{seg.tokens.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="context-usage-bar-track">
            {segments.map((seg) => {
              const segPct = context?.total_tokens ? (seg.tokens / context.total_tokens) * barWidth : 0;
              return (
                <div
                  key={seg.id}
                  className="context-usage-bar-fill"
                  style={{
                    width: `${Math.max(segPct, 2)}%`,
                    background: seg.color
                  }}
                  title={`${seg.label}: ${seg.tokens.toLocaleString()} tokens`}
                />
              );
            })}
          </div>
          <div className="context-usage-meta">
            <span>{displayPct}% of {((context?.context_window ?? 128000) / 1000).toFixed(0)}K context</span>
            {cost > 0 && <span>~${cost.toFixed(4)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
