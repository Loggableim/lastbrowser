import type { SessionListScope } from './session-list-scope.js';

type CreatedSession = Readonly<{ session?: Readonly<{ session_id?: string }> }>;
type LoadedSession = Readonly<{ session?: Readonly<{ session_id?: string }> }>;

/** A new session is selectable only after it can be read through the same bound profile/Space. */
export async function createAndLoadScopedSession<TCreated extends CreatedSession, TLoaded extends LoadedSession>(
  scope: SessionListScope,
  isCurrent: () => boolean,
  create: (scope: SessionListScope) => Promise<TCreated>,
  load: (sessionId: string, scope: SessionListScope) => Promise<TLoaded>
): Promise<Readonly<{ created: TCreated; loaded: TLoaded }> | null> {
  if (!isCurrent()) return null;
  const created = await create(scope);
  const sessionId = created.session?.session_id?.trim();
  if (!sessionId) throw new Error('Sidekick could not create a chat session.');
  if (!isCurrent()) return null;

  const loaded = await load(sessionId, scope);
  if (!isCurrent()) return null;
  if (loaded.session?.session_id !== sessionId) {
    throw new Error('The new chat could not be loaded in the selected Space.');
  }
  return { created, loaded };
}
