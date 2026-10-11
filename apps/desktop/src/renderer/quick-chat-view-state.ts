export function isQuickChatScopeVisible(contentScopeKey: string | null, activeScopeKey: string): boolean {
  return contentScopeKey === activeScopeKey;
}

export function createQuickChatScopeKey(
  browserProfileId: string,
  spacePath: string,
  backendProfileName: string | null | undefined
): string {
  return `${browserProfileId}::${spacePath}::${backendProfileName || ''}`;
}

export function selectScopedQuickChatValue<T>(
  value: T,
  contentScopeKey: string | null,
  activeScopeKey: string,
  fallback: T
): T {
  return isQuickChatScopeVisible(contentScopeKey, activeScopeKey) ? value : fallback;
}

export function toggleQuickChatFromToolbar(options: {
  copilotOpen: boolean;
  quickChatMode: boolean;
  setQuickChatMode: (enabled: boolean) => void;
  toggleCopilot: () => void;
}): void {
  options.setQuickChatMode(true);
  if (options.copilotOpen && !options.quickChatMode) return;
  options.toggleCopilot();
}

export function updateScopedQuickChatState<T>(
  stateByScope: Map<string, T>,
  scopeKey: string,
  update: (current: T | undefined) => T
): T {
  const next = update(stateByScope.get(scopeKey));
  stateByScope.set(scopeKey, next);
  return next;
}
