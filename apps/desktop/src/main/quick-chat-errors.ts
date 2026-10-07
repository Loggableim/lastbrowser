/** Stable, non-sensitive failure categories allowed to cross Quickchat IPC. */
export const QUICK_CHAT_BACKEND_ERROR_CODES = [
  'quickchat_invalid_request',
  'quickchat_scope_invalid',
  'quickchat_profile_mismatch',
  'quickchat_not_found',
  'quickchat_binding_conflict',
  'quickchat_scope_denied',
  'quickchat_stream_mismatch',
  'quickchat_worker_binding_missing',
  'quickchat_worker_binding_mismatch',
  'quickchat_worker_cancel_rejected',
  'quickchat_worker_exit_unconfirmed',
  'quickchat_writer_release_unconfirmed',
  'quickchat_file_exit_unconfirmed',
  'quickchat_internal_error'
] as const;

export type QuickChatBackendErrorCode = typeof QUICK_CHAT_BACKEND_ERROR_CODES[number];
const QUICK_CHAT_BACKEND_ERROR_CODE_SET: ReadonlySet<string> = new Set(QUICK_CHAT_BACKEND_ERROR_CODES);

export function isQuickChatBackendErrorCode(value: unknown): value is QuickChatBackendErrorCode {
  return typeof value === 'string' && QUICK_CHAT_BACKEND_ERROR_CODE_SET.has(value);
}

/** Main-process-only HTTP failure. Its original message must never cross Quickchat IPC. */
export class SidekickApiError extends Error {
  constructor(message: string, readonly status: number, readonly safeCode?: QuickChatBackendErrorCode) {
    super(message);
    this.name = 'SidekickApiError';
  }
}

type QuickChatFailureCategory = QuickChatBackendErrorCode |
  'quickchat_ipc_sender_rejected' |
  'quickchat_ipc_unavailable' |
  'quickchat_stop_request_invalid' |
  'quickchat_stop_binding_rejected' |
  'quickchat_cancel_request_invalid' |
  'quickchat_cancel_binding_rejected' |
  'quickchat_stop_failed' |
  'quickchat_cancel_failed' |
  'backend_transport_failed' |
  'backend_http_unauthorized' |
  'backend_http_forbidden' |
  'backend_http_not_found' |
  'backend_http_conflict' |
  'backend_http_server_error' |
  'backend_http_failed' |
  'backend_stop_failed' |
  'backend_cancel_failed';

/** Return a fixed marker, never carrying a server, transport, or exception message. */
export function quickChatFailure(action: 'stop' | 'cancel', category: QuickChatFailureCategory): Error {
  return new Error(`Quickchat ${action} failed [${category}]`);
}

export function quickChatBackendFailure(action: 'stop' | 'cancel', error: unknown): Error {
  let category: QuickChatFailureCategory;
  if (error instanceof SidekickApiError) {
    if (error.safeCode) return quickChatFailure(action, error.safeCode);
    category = error.status === 401 ? 'backend_http_unauthorized'
      : error.status === 403 ? 'backend_http_forbidden'
        : error.status === 404 ? 'backend_http_not_found'
          : error.status === 409 ? 'backend_http_conflict'
            : error.status >= 500 ? 'backend_http_server_error' : 'backend_http_failed';
  } else if (error instanceof TypeError) {
    category = 'backend_transport_failed';
  } else {
    category = action === 'stop' ? 'backend_stop_failed' : 'backend_cancel_failed';
  }
  return quickChatFailure(action, category);
}
