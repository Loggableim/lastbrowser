import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, Loader2 } from 'lucide-react';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;

type ApprovalEntry = {
  session_key?: string;
  session_id?: string;
  approval_id?: string;
  command?: string;
  description?: string;
  pattern_keys?: string[];
};

type ApprovalState = {
  pending: ApprovalEntry | null;
};

export function ApprovalPollManager({
  activeSessionId,
  serviceStatus,
  busy,
  children
}: {
  activeSessionId: string | null;
  serviceStatus: ServiceStatus | null;
  busy: boolean;
  children: (state: { pending: ApprovalEntry | null; respond: (choice: string) => void }) => React.ReactNode;
}): JSX.Element {
  const [pending, setPending] = useState<ApprovalEntry | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef<ApprovalEntry | null>(null);
  const ready = serviceStatus?.sidekick === 'ready' && Boolean(serviceStatus?.webuiUrl);

  const fetchPending = useCallback(async () => {
    if (!activeSessionId || !ready) return;
    try {
      const result = await window.lastbrowser.sidekick.requestWebui({
        method: 'GET',
        path: '/api/approval/pending',
        query: { session_id: activeSessionId }
      });
      const entry = result?.pending || null;
      pendingRef.current = entry;
      setPending(entry);
    } catch {
      // Silent — polling continues
    }
  }, [activeSessionId, ready]);

  // Poll while agent is busy
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!activeSessionId || !ready || !busy) {
      setPending(null);
      pendingRef.current = null;
      return;
    }
    void fetchPending();
    pollRef.current = setInterval(fetchPending, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [activeSessionId, ready, busy, fetchPending]);

  const respond = useCallback(async (choice: string) => {
    const entry = pendingRef.current;
    if (!entry || !activeSessionId) return;
    setPending(null);
    pendingRef.current = null;
    try {
      await window.lastbrowser.sidekick.requestWebui({
        method: 'POST',
        path: '/api/approval/respond',
        body: {
          session_id: activeSessionId,
          approval_id: entry.approval_id || '',
          choice
        }
      });
    } catch {
      // Silent
    }
  }, [activeSessionId]);

  return <>{children({ pending, respond })}</>;
}

export function ApprovalCard({
  entry,
  onRespond
}: {
  entry: ApprovalEntry;
  onRespond: (choice: string) => void;
}): JSX.Element {
  const command = entry.command || '';
  const description = entry.description || '';

  return (
    <div className="approval-card">
      <div className="approval-card-header">
        <ShieldAlert size={18} />
        <span>⚠️ Command requires approval</span>
      </div>
      <div className="approval-card-body">
        {description && <p className="approval-description">{description}</p>}
        <pre className="approval-command"><code>{command}</code></pre>
      </div>
      <div className="approval-card-actions">
        <button type="button" className="approval-btn approval-allow-once" onClick={() => onRespond('once')}>
          Allow once
        </button>
        <button type="button" className="approval-btn approval-allow-session" onClick={() => onRespond('session')}>
          Allow session
        </button>
        <button type="button" className="approval-btn approval-allow-always" onClick={() => onRespond('always')}>
          Always allow
        </button>
        <button type="button" className="approval-btn approval-deny" onClick={() => onRespond('deny')}>
          Deny
        </button>
      </div>
    </div>
  );
}
