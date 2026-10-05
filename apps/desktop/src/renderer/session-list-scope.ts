export type SessionListScope = {
  profile: string;
  workspacePath: string;
  backendProfileName?: string;
};

export type SessionListEntry = {
  session_id: string;
};

/** A resolved profile belongs to its original UI selection, even before effects reset it. */
export function resolveSessionBackendProfile(
  requestedScope: SessionListScope | null,
  resolvedProfile: string | undefined,
  currentScope: SessionListScope
): string | undefined {
  return sameSessionListScope(requestedScope, currentScope)
    ? resolvedProfile || currentScope.backendProfileName
    : currentScope.backendProfileName;
}

export function sameSessionListScope(left: SessionListScope | null, right: SessionListScope): boolean {
  return left !== null
    && left.profile === right.profile
    && left.workspacePath === right.workspacePath
    && (left.backendProfileName ?? '') === (right.backendProfileName ?? '');
}

export function sessionListResponseMatchesScope(
  requestedScope: SessionListScope,
  currentScope: SessionListScope
): boolean {
  return sameSessionListScope(requestedScope, currentScope);
}

export function mergeSessionListSnapshot<T extends SessionListEntry>(
  previousScope: SessionListScope | null,
  requestedScope: SessionListScope,
  previousSessions: T[],
  nextSessions: T[],
  currentSessionId: string | null
): { scopeChanged: boolean; sessions: T[] } {
  const scopeChanged = !sameSessionListScope(previousScope, requestedScope);
  if (scopeChanged) return { scopeChanged, sessions: nextSessions };

  const currentSession = currentSessionId
    ? previousSessions.find((session) => session.session_id === currentSessionId)
    : undefined;
  if (currentSession && !nextSessions.some((session) => session.session_id === currentSessionId)) {
    return { scopeChanged, sessions: [currentSession, ...nextSessions] };
  }
  return { scopeChanged, sessions: nextSessions };
}

export function resolveSessionListSelection<T extends SessionListEntry>(
  currentSessionId: string | null,
  sessions: T[],
  scopeChanged: boolean,
  isCreatingSession: boolean
): string | null {
  if (scopeChanged) {
    if (isCreatingSession) return null;
    return sessions[0]?.session_id ?? null;
  }
  if (currentSessionId) return currentSessionId;
  if (isCreatingSession) return null;
  return sessions[0]?.session_id ?? null;
}
