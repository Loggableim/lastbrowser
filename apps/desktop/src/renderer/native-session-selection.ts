export type NativeSessionSelectionEffects = Readonly<{
  invalidatePendingCreation: () => void;
  bindSessionRef: (sessionId: string) => void;
  clearPreviousSessionView: () => void;
  selectSession: (sessionId: string) => void;
  openChatPanel: () => void;
}>;

/** Select a recent session atomically from the renderer's point of view. */
export function selectNativeSession(
  sessionId: string,
  currentSessionId: string | null,
  effects: NativeSessionSelectionEffects,
): boolean {
  if (!sessionId) return false;
  if (currentSessionId !== sessionId) {
    effects.invalidatePendingCreation();
    effects.bindSessionRef(sessionId);
    effects.clearPreviousSessionView();
    effects.selectSession(sessionId);
  }
  effects.openChatPanel();
  return true;
}
