export interface ChatCompletionSnapshot {
  streamActive?: boolean | null;
  session?: {
    active_stream_id?: string | null;
    pending_user_message?: unknown;
  } | null;
}

/** Only infer completion after a real session snapshot confirms there is no turn left. */
export function isChatCompletionConfirmed(snapshot: ChatCompletionSnapshot): boolean {
  return snapshot.session != null &&
    snapshot.streamActive !== true &&
    !snapshot.session.active_stream_id &&
    !snapshot.session.pending_user_message;
}

/** Share one notification edge between the SSE and polling completion paths. */
export function createOnceChatCompletionNotifier(
  soundEnabled: boolean,
  notificationsEnabled: boolean,
  playSound: () => void,
  showNotification: () => void
): () => void {
  let didNotify = false;
  return () => {
    if (didNotify) return;
    didNotify = true;
    if (soundEnabled) playSound();
    if (notificationsEnabled) showNotification();
  };
}
