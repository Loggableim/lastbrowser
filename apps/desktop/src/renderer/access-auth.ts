export type AccessAuthStatus = {
  auth_enabled?: boolean;
  logged_in?: boolean;
};

/** Fail closed until the Sidekick auth status is known and, when enabled, valid. */
export function canRenderBrowserForAccessAuth(
  checked: boolean,
  status: AccessAuthStatus | null | undefined
): boolean {
  if (!checked || !status) return false;
  return status.auth_enabled !== true || status.logged_in === true;
}
