export type QuickchatPreferenceScope = Readonly<{ browserProfileId: string; workspacePath: string; backendProfileName: string }>;
export type QuickchatFavorite = Readonly<{ provider: string; model: string }>;
export const QUICKCHAT_FAVORITE_CHANGED_EVENT = 'lastbrowser:quickchat-favorite-changed';
const keyFor = (scope: QuickchatPreferenceScope) => `lastbrowser.quickchat.favorite.v1:${JSON.stringify([scope.browserProfileId, scope.workspacePath, scope.backendProfileName])}`;
function validScope(scope: QuickchatPreferenceScope) { return !!scope.browserProfileId && !!scope.backendProfileName && typeof scope.workspacePath === 'string'; }
function favorite(value: unknown): QuickchatFavorite | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.provider !== 'string' || !record.provider.trim() || record.provider.length > 80 || /^(auto|orchestrator)$/i.test(record.provider)
    || typeof record.model !== 'string' || !record.model.trim() || record.model.length > 200 || record.model.startsWith('@')
    || /^(auto|teamwork|smart-track(?:-.+)?|comode|co-mode-.+)$/i.test(record.model) || /[\u0000-\u001f\u007f]/.test(record.provider + record.model)) return null;
  return { provider: record.provider.trim(), model: record.model.trim() };
}
export function readQuickchatFavoriteState(scope: QuickchatPreferenceScope): { favorite: QuickchatFavorite | null; invalid: boolean } {
  if (!validScope(scope)) return { favorite: null, invalid: false };
  try {
    const raw = window.localStorage.getItem(keyFor(scope));
    if (raw === null) return { favorite: null, invalid: false };
    const value = favorite(JSON.parse(raw));
    return { favorite: value, invalid: value === null };
  } catch { return { favorite: null, invalid: true }; }
}
export function readQuickchatFavorite(scope: QuickchatPreferenceScope): QuickchatFavorite | null {
  return readQuickchatFavoriteState(scope).favorite;
}
export function setQuickchatFavorite(scope: QuickchatPreferenceScope, model: QuickchatFavorite | null): void {
  if (!validScope(scope)) throw new Error('Quickchat profile is not resolved.');
  const normalized = model === null ? null : favorite(model);
  if (model !== null && !normalized) throw new Error('Choose a direct provider/model pair.');
  if (normalized) window.localStorage.setItem(keyFor(scope), JSON.stringify(normalized));
  else window.localStorage.removeItem(keyFor(scope));
  window.dispatchEvent(new CustomEvent(QUICKCHAT_FAVORITE_CHANGED_EVENT, { detail: { scope: { ...scope }, favorite: normalized } }));
}
