import React, { useCallback, useState } from 'react';
import { Archive, List, Loader2, Trash2, X } from 'lucide-react';
import { useDesktopI18n } from './i18n.js';
import type { DesktopLocaleId } from './i18n/keys.js';
import {
  dequeueSessionMessage,
  enqueueSessionMessage,
  removeSessionMessage,
  sessionQueue,
  type ComposerQueueMessage,
  type SessionQueues,
} from './composer-queue.js';

const compressionCopy: Record<DesktopLocaleId, { action:string; busy:string; title:string; done:string; failed:string }> = {
  en:{action:'Compress',busy:'Compressing…',title:'Compress conversation context',done:'Context compressed successfully.',failed:'Context compression failed'},
  de:{action:'Komprimieren',busy:'Wird komprimiert…',title:'Gesprächskontext komprimieren',done:'Kontext wurde komprimiert.',failed:'Kontext konnte nicht komprimiert werden'},
  es:{action:'Comprimir',busy:'Comprimiendo…',title:'Comprimir el contexto de conversación',done:'Contexto comprimido.',failed:'No se pudo comprimir el contexto'},
  fr:{action:'Compresser',busy:'Compression…',title:'Compresser le contexte de conversation',done:'Contexte compressé.',failed:'La compression du contexte a échoué'},
  it:{action:'Comprimi',busy:'Compressione…',title:'Comprimi il contesto della conversazione',done:'Contesto compresso.',failed:'Impossibile comprimere il contesto'},
  'pt-BR':{action:'Comprimir',busy:'Comprimindo…',title:'Comprimir contexto da conversa',done:'Contexto comprimido.',failed:'Não foi possível comprimir o contexto'},
  ru:{action:'Сжать',busy:'Сжатие…',title:'Сжать контекст беседы',done:'Контекст сжат.',failed:'Не удалось сжать контекст'},
  ja:{action:'圧縮',busy:'圧縮中…',title:'会話のコンテキストを圧縮',done:'コンテキストを圧縮しました。',failed:'コンテキストを圧縮できませんでした'},
};

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;

type QueueMessage = ComposerQueueMessage;

const SESSION_QUEUE_STORAGE_KEY = 'lastbrowser.chatQueue.sessions.v1';

function loadSessionQueues(): SessionQueues {
  try {
    const raw = window.localStorage.getItem(SESSION_QUEUE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SessionQueues;
  } catch { return {}; }
}
function saveSessionQueues(queues: SessionQueues) {
  try { window.localStorage.setItem(SESSION_QUEUE_STORAGE_KEY, JSON.stringify(queues)); } catch { /* storage can be unavailable */ }
}

export function useChatQueue(sessionId: string | null): {
  queue: QueueMessage[];
  enqueue: (msg: QueueMessage) => boolean;
  dequeue: () => QueueMessage | undefined;
  clearQueue: () => void;
  removeAt: (i: number) => void;
} {
  const [queues, setQueues] = useState<SessionQueues>(loadSessionQueues);
  const persist = useCallback((next: SessionQueues) => { setQueues(next); saveSessionQueues(next); }, []);
  const queue = sessionQueue(queues, sessionId);

  const enqueue = useCallback((msg: QueueMessage) => {
    const next = enqueueSessionMessage(loadSessionQueues(), sessionId, msg);
    if (!next) return false;
    persist(next);
    return true;
  }, [persist, sessionId]);

  const dequeue = useCallback(() => {
    const result = dequeueSessionMessage(loadSessionQueues(), sessionId);
    if (!result.message) return undefined;
    persist(result.store);
    return result.message;
  }, [persist, sessionId]);

  const clearQueue = useCallback(() => {
    const key = sessionId?.trim();
    if (!key) return;
    const next = { ...loadSessionQueues() };
    delete next[key];
    persist(next);
  }, [persist, sessionId]);

  const removeAt = useCallback((i: number) => {
    persist(removeSessionMessage(loadSessionQueues(), sessionId, i));
  }, [persist, sessionId]);

  return { queue, enqueue, dequeue, clearQueue, removeAt };
}

export function ComposerQueuedRows({
  queue,
  onRemoveAt,
}: {
  queue: QueueMessage[];
  onRemoveAt: (index: number) => void;
}): JSX.Element | null {
  const { t } = useDesktopI18n();
  if (!queue.length) return null;
  const label = t('spaceAssistant.queued');
  return (
    <ul className="composer-queued" aria-label={label}>
      {queue.map((message, index) => (
        <li key={`${index}:${message.text}`} className="composer-queued-row" data-testid="composer-queued-row">
          <span className="composer-queued-label">{label}</span>
          <span className="composer-queued-text">{message.text}</span>
          <button type="button" className="queue-remove-btn" onClick={() => onRemoveAt(index)} aria-label={t('common.remove')}>
            <X size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
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
  const { locale } = useDesktopI18n(), copy = compressionCopy[locale];
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
        onResult(`${copy.failed}: ${result.error}`);
      } else {
        const summary = result?.summary;
        const referenceMessage = typeof summary === 'object' && summary !== null && !Array.isArray(summary) && 'reference_message' in summary
          ? summary.reference_message
          : undefined;
        onResult(typeof referenceMessage === 'string' && referenceMessage.trim()
          ? referenceMessage
          : copy.done);
      }
    } catch (err) {
      onResult(`${copy.failed}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCompressing(false);
    }
  }, [activeSessionId, ready, onResult, copy]);

  return (
    <button
      type="button"
      className="secondary-action compact"
      onClick={doCompress}
      disabled={!ready || !activeSessionId || compressing}
      title={copy.title}
    >
      {compressing ? <Loader2 size={14} className="spin" /> : <Archive size={14} />}
      <span>{compressing ? copy.busy : copy.action}</span>
    </button>
  );
}
