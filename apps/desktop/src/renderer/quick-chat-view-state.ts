export function isQuickChatScopeVisible(contentScopeKey: string | null, activeScopeKey: string): boolean {
  return contentScopeKey === activeScopeKey;
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
