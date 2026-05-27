import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, List, Loader2, Trash2, X } from 'lucide-react';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;

type QueueMessage = {
  text: string;
  model?: string;
  profile?: string;
};

const QUEUE_STORAGE_KEY = 'lastbrowser.chatQueue.v1';

function loadQueue(): QueueMessage[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueueMessage[]) : [];
  } catch { return []; }
}
function saveQueue(queue: QueueMessage[]) {
  try { window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue)); } catch {}
}

export function useChatQueue(): {
  queue: QueueMessage[];
  enqueue: (msg: QueueMessage) => void;
  dequeue: () => QueueMessage | undefined;
  clearQueue: () => void;
  removeAt: (i: number) => void;
} {
  const [queue, setQueue] = useState<QueueMessage[]>(loadQueue);
  const save = useCallback((q: QueueMessage[]) => { setQueue(q); saveQueue(q); }, []);

  const enqueue = useCallback((msg: QueueMessage) => {
    save([...loadQueue(), msg]);
  }, [save]);

  const dequeue = useCallback(() => {
    const q = loadQueue();
    if (!q.length) return undefined;
    const [first, ...rest] = q;
    save(rest);
    return first;
  }, [save]);

  const clearQueue = useCallback(() => save([]), [save]);
  const removeAt = useCallback((i: number) => {
    const q = loadQueue();
    if (i >= 0 && i < q.length) { q.splice(i, 1); save(q); }
  }, [save]);

  return { queue, enqueue, dequeue, clearQueue, removeAt };
}

export function QueueIndicator({
  queue,
  onDrain,
  onClear,
  onRemoveAt,
  busy
}: {
  queue: QueueMessage[];
  onDrain: () => void;
  onClear: () => void;
  onRemoveAt: (i: number) => void;
  busy: boolean;
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (!queue.length) return null;

  return (
    <div className={`queue-indicator ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="queue-trigger"
        onClick={() => setExpanded((s) => !s)}
        title={`${queue.length} message(s) queued`}
      >
        <List size={14} />
        <span className="queue-count">{queue.length}</span>
        {busy && <Loader2 size={12} className="spin" />}
      </button>

      {expanded && (
        <div className="queue-detail">
          <div className="queue-detail-header">
            <strong>Message queue ({queue.length})</strong>
            <div className="queue-detail-actions">
              <button type="button" className="queue-action-btn" onClick={onDrain} title="Send all now (if not busy)">
                <List size={13} /> Drain
              </button>
              <button type="button" className="queue-action-btn" onClick={onClear} title="Clear all">
                <Trash2 size={13} /> Clear
              </button>
            </div>
          </div>
          <div className="queue-detail-list">
            {queue.map((msg, i) => (
              <div key={i} className="queue-detail-item">
                <span className="queue-detail-text">{msg.text.slice(0, 60)}{msg.text.length > 60 ? '…' : ''}</span>
                <button type="button" className="queue-remove-btn" onClick={() => onRemoveAt(i)} title="Remove">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CompressButton({
  activeSessionId,
  ready,
  onResult
}: {
  activeSessionId: string | null;
  ready: boolean;
  onResult: (msg: string) => void;
}): JSX.Element {
  const [compressing, setCompressing] = useState(false);

  const doCompress = useCallback(async () => {
    if (!activeSessionId || !ready) return;
    setCompressing(true);
    try {
      const result = await window.lastbrowser.sidekick.requestWebui({
        method: 'POST',
        path: '/api/session/compress',
        body: { session_id: activeSessionId }
      });
      if (result?.error) {
        onResult(`Compress failed: ${result.error}`);
      } else if (result?.summary?.reference_message) {
        onResult(result.summary.reference_message);
      } else {
        onResult('Context compressed successfully.');
      }
    } catch (err) {
      onResult(`Compress error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCompressing(false);
    }
  }, [activeSessionId, ready, onResult]);

  return (
    <button
      type="button"
      className="secondary-action compact"
      onClick={doCompress}
      disabled={!ready || !activeSessionId || compressing}
      title="Compress conversation context"
    >
      {compressing ? <Loader2 size={14} className="spin" /> : <Archive size={14} />}
      <span>{compressing ? 'Compressing…' : 'Compress'}</span>
    </button>
  );
}
