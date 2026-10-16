export type SessionListScope = {
  profile: string;
  workspacePath: string;
  backendProfileName?: string;
};

export type SessionListEntry = {
  session_id: string;
};

/** Legacy empty acknowledgements are accepted; explicit failure never removes a chat. */
export function sessionDeletionSucceeded(result: unknown): boolean {
  if (result === false) return false;
  if (!result || typeof result !== 'object') return true;
  const response = result as Record<string, unknown>;
  return !response.error && response.ok !== false && response.deleted !== false;
}

/** What one deletion attempt reports back to the sidebar row that requested it. */
export type SessionDeleteOutcome = { deleted: boolean; message: string };

/**
 * The text shown next to a row whose deletion was refused. Backend messages are
 * shown as sent; the one raw code without wording gets a localized sentence.
 */
export function sessionDeletionFailureMessage(result: unknown, locale: string): string {
  const fallback = locale === 'de' ? 'Chat konnte nicht gelöscht werden.' : 'Chat could not be deleted.';
  if (!result || typeof result !== 'object') return fallback;
  const response = result as Record<string, unknown>;
  const error = typeof response.error === 'string' ? response.error.trim() : '';
  if (error === 'goal_state_unavailable') {
    return locale === 'de'
      ? 'Das Ziel dieses Chats konnte nicht gelöscht werden. Bitte erneut versuchen.'
      : 'The goal of this chat could not be cleared. Please try again.';
  }
  const busy = 'This chat is still being written by an active turn. Stop that turn before changing or deleting the chat.';
  if (error === busy || (typeof response.message === 'string' && response.message.trim() === busy)) {
    const localized = locale === 'de'
      ? 'Dieser Chat wird noch von einem laufenden Durchgang geschrieben. Beende diesen Durchgang, bevor du den Chat änderst oder löschst.'
      : locale === 'es'
        ? 'Este chat todavía lo está escribiendo un turno activo. Detén ese turno antes de cambiar o eliminar el chat.'
        : locale === 'fr'
          ? 'Ce chat est encore écrit par un tour actif. Arrêtez ce tour avant de modifier ou supprimer le chat.'
          : locale === 'it'
            ? 'Questa chat è ancora scritta da un turno attivo. Interrompi quel turno prima di modificare o eliminare la chat.'
            : locale === 'pt-BR'
              ? 'Este chat ainda está sendo escrito por um turno ativo. Interrompa esse turno antes de alterar ou excluir o chat.'
              : locale === 'ru'
                ? 'Этот чат ещё пишет активный ход. Остановите этот ход, прежде чем изменять или удалять чат.'
                : locale === 'ja'
                  ? 'このチャットは進行中のターンがまだ書き込んでいます。変更または削除する前に、そのターンを停止してください。'
                  : busy;
    return localized;
  }
  if (error) return error;
  const message = typeof response.message === 'string' ? response.message.trim() : '';
  return message || fallback;
}

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
  currentSessionId: string | null,
  removedSessionIds?: ReadonlySet<string>
): { scopeChanged: boolean; sessions: T[] } {
  const scopeChanged = !sameSessionListScope(previousScope, requestedScope);
  const removed = removedSessionIds ?? new Set<string>();
  const filteredNext = removed.size
    ? nextSessions.filter((session) => !removed.has(session.session_id))
    : nextSessions;
  if (scopeChanged) return { scopeChanged, sessions: filteredNext };

  const currentSession = currentSessionId
    ? previousSessions.find((session) => session.session_id === currentSessionId)
    : undefined;
  if (currentSession && !filteredNext.some((session) => session.session_id === currentSessionId)) {
    if (currentSessionId && removed.has(currentSessionId)) return { scopeChanged, sessions: filteredNext };
    return { scopeChanged, sessions: [currentSession, ...filteredNext] };
  }
  return { scopeChanged, sessions: filteredNext };
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
