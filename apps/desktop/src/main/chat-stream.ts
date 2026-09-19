/**
 * Server-Sent Events client for the Sidekick chat stream.
 *
 * The WebUI exposes `/api/chat/stream?stream_id=…` as an SSE endpoint, but the
 * desktop shell previously polled `/api/chat/stream/status` on a timer. Polling
 * costs a round-trip per tick and makes the transcript feel laggy; SSE pushes
 * each event the moment the agent produces it.
 *
 * This module runs in the main process (Node's fetch supports streaming bodies)
 * and forwards every parsed event to the renderer over IPC.
 */

export type ChatStreamEvent = {
  /** SSE event name: heartbeat | delta | message | tool | stream_end | error | cancel */
  event: string;
  /** Parsed JSON payload, or the raw string when the payload is not JSON. */
  data: unknown;
  /** Raw data line, useful for debugging. */
  raw: string;
};

export type ChatStreamHandle = {
  /** Stop consuming and release the connection. */
  close: () => void;
  /** Resolves when the stream ends (normally or on error). */
  done: Promise<void>;
};

type FetchLike = typeof fetch;

/**
 * Parse one SSE frame ("event: x\ndata: y\n\n") into an event object.
 * Returns null for comment-only or empty frames.
 */
export function parseSseFrame(frame: string): ChatStreamEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (!dataLines.length) return null;
  const raw = dataLines.join('\n');
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    // Keep the raw string — some events carry plain text.
  }
  return { event, data, raw };
}

/**
 * Split a growing buffer into complete SSE frames.
 * Returns the parsed frames plus the unconsumed remainder.
 */
export function drainSseBuffer(buffer: string): { events: ChatStreamEvent[]; rest: string } {
  const events: ChatStreamEvent[] = [];
  // Frames are separated by a blank line; tolerate CRLF.
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    const parsed = parseSseFrame(part);
    if (parsed) events.push(parsed);
  }
  return { events, rest };
}

/**
 * Subscribe to a chat stream. Calls `onEvent` for every SSE event and resolves
 * `done` when the stream ends.
 */
export function subscribeChatStream(
  webuiUrl: string,
  streamId: string,
  sessionToken: string | null,
  onEvent: (event: ChatStreamEvent) => void,
  fetchImpl: FetchLike = fetch
): ChatStreamHandle {
  const controller = new AbortController();
  const url = new URL('/api/chat/stream', webuiUrl.endsWith('/') ? webuiUrl : `${webuiUrl}/`);
  url.searchParams.set('stream_id', streamId);
  // EventSource cannot send headers, so the server accepts the session token as
  // a query parameter for streaming paths only.
  if (sessionToken) url.searchParams.set('token', sessionToken);

  const done = (async () => {
    try {
      const response = await fetchImpl(url.toString(), {
        headers: { accept: 'text/event-stream' },
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        onEvent({ event: 'error', data: { error: `HTTP ${response.status}` }, raw: '' });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = drainSseBuffer(buffer);
        buffer = rest;
        for (const event of events) {
          onEvent(event);
          if (event.event === 'stream_end' || event.event === 'error' || event.event === 'cancel') {
            controller.abort();
            return;
          }
        }
      }
      // Flush a trailing frame that arrived without a final blank line.
      const trailing = parseSseFrame(buffer);
      if (trailing) onEvent(trailing);
    } catch (error) {
      // Aborting is the normal shutdown path, not an error.
      if ((error as { name?: string })?.name !== 'AbortError') {
        onEvent({
          event: 'error',
          data: { error: error instanceof Error ? error.message : String(error) },
          raw: ''
        });
      }
    }
  })();

  return {
    close: () => controller.abort(),
    done
  };
}
