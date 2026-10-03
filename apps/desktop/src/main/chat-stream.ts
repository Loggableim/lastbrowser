import { signalAccessAuthRequired } from './sidekick-api.js';

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
  /** SSE event name: heartbeat | delta | message | tool | stream_end | error | apperror | cancel */
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

const CHAT_TRANSPORT_TRACE_ENABLED = process.env.LASTBROWSER_DEBUG_CHAT_TRANSPORT === '1';
const CHAT_TRANSPORT_EVENT_NAMES = new Set([
  'heartbeat', 'delta', 'token', 'reasoning', 'message', 'tool', 'tool_complete',
  'metering', 'stream_end', 'error', 'apperror', 'cancel', 'goal', 'goal_continue'
]);
let chatTransportTraceOrdinal = 0;

function traceChatTransport(trace: number, stage: string, fields: Record<string, number | string | boolean>): void {
  if (!CHAT_TRANSPORT_TRACE_ENABLED) return;
  // Keep the opt-in trace safe to forward: no payloads, URLs, session IDs, or
  // exception messages are ever included here.
  console.info('[CHAT-TRANSPORT]', JSON.stringify({ trace, stage, ...fields }));
}

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
  fetchImpl: FetchLike = fetch,
  authCookie: string | null = null
): ChatStreamHandle {
  const controller = new AbortController();
  const trace = CHAT_TRANSPORT_TRACE_ENABLED ? ++chatTransportTraceOrdinal : 0;
  let readerChunks = 0;
  let readerBytes = 0;
  let parsedFrames = 0;
  let finalState = 'running';
  const sampled = (count: number) => count <= 8 || count % 32 === 0;
  const url = new URL('/api/chat/stream', webuiUrl.endsWith('/') ? webuiUrl : `${webuiUrl}/`);
  url.searchParams.set('stream_id', streamId);
  // EventSource cannot send headers, so the server accepts the session token as
  // a query parameter for streaming paths only.
  if (sessionToken) url.searchParams.set('token', sessionToken);

  const done = (async () => {
    try {
      const response = await fetchImpl(url.toString(), {
        headers: {
          accept: 'text/event-stream',
          ...(CHAT_TRANSPORT_TRACE_ENABLED ? { 'x-lastbrowser-chat-transport-trace': String(trace) } : {}),
          ...(authCookie ? { cookie: authCookie } : {})
        },
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        finalState = 'http_error';
        traceChatTransport(trace, 'response', { state: finalState, status: response.status });
        await signalAccessAuthRequired(response);
        onEvent({ event: 'error', data: { error: `HTTP ${response.status}` }, raw: '' });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawTerminalEvent = false;
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) {
          finalState = 'eof';
          traceChatTransport(trace, 'reader_eof', { chunks: readerChunks, bytes: readerBytes, frames: parsedFrames });
          break;
        }
        readerChunks += 1;
        readerBytes += value.byteLength;
        if (sampled(readerChunks)) {
          traceChatTransport(trace, 'reader_chunk', { count: readerChunks, bytes: value.byteLength, total_bytes: readerBytes });
        }
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = drainSseBuffer(buffer);
        buffer = rest;
        for (const event of events) {
          parsedFrames += 1;
          const kind = CHAT_TRANSPORT_EVENT_NAMES.has(event.event) ? event.event : 'unknown';
          if (sampled(parsedFrames)) traceChatTransport(trace, 'frame', { count: parsedFrames, kind });
          onEvent(event);
          if (event.event === 'stream_end' || event.event === 'error' || event.event === 'apperror' || event.event === 'cancel') {
            sawTerminalEvent = true;
            finalState = `terminal_${kind}`;
            traceChatTransport(trace, 'terminal', { frames: parsedFrames, kind, state: finalState });
            controller.abort();
            return;
          }
        }
      }
      // Flush a trailing frame that arrived without a final blank line.
      const trailing = parseSseFrame(buffer);
      if (trailing) {
        parsedFrames += 1;
        const kind = CHAT_TRANSPORT_EVENT_NAMES.has(trailing.event) ? trailing.event : 'unknown';
        if (sampled(parsedFrames)) traceChatTransport(trace, 'frame', { count: parsedFrames, kind });
        onEvent(trailing);
        sawTerminalEvent = trailing.event === 'stream_end'
          || trailing.event === 'error'
          || trailing.event === 'apperror'
          || trailing.event === 'cancel';
        if (sawTerminalEvent) finalState = `terminal_${kind}`;
      }
      if (!sawTerminalEvent && !controller.signal.aborted) {
        finalState = 'eof_without_terminal';
        // Keep transport details out of the UI and logs; EOF is only success
        // when the backend sent an explicit terminal event.
        onEvent({ event: 'error', data: { error: 'Chat stream closed before completion.' }, raw: '' });
      }
    } catch (error) {
      // Aborting is the normal shutdown path, not an error.
      if ((error as { name?: string })?.name !== 'AbortError') {
        finalState = 'transport_error';
        traceChatTransport(trace, 'transport_error', { chunks: readerChunks, bytes: readerBytes, frames: parsedFrames });
        onEvent({
          event: 'error',
          data: { error: error instanceof Error ? error.message : String(error) },
          raw: ''
        });
      } else if (finalState === 'running') {
        finalState = 'aborted';
      }
    } finally {
      traceChatTransport(trace, 'final', { state: finalState, chunks: readerChunks, bytes: readerBytes, frames: parsedFrames });
    }
  })();

  return {
    close: () => {
      traceChatTransport(trace, 'close', { state: controller.signal.aborted ? finalState : 'explicit_close', chunks: readerChunks, bytes: readerBytes, frames: parsedFrames });
      controller.abort();
    },
    done
  };
}
