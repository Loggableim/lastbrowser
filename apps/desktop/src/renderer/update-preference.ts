export function resolveAutoUpdateCheckPreference(
  settings: Record<string, unknown> | null,
  hydrated: boolean
): boolean | null {
  if (!hydrated || settings === null) return null;
  return settings.check_for_updates !== false;
}
