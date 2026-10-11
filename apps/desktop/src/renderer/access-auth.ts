export type AccessAuthStatus = {
  auth_enabled?: boolean;
  logged_in?: boolean;
};

/** Only a confirmed no-password policy can release the initial startup wait. */
export function canReleaseAccessGateFromStartupPreflight(
  policy: 'disabled' | 'enabled' | 'unknown'
): boolean {
  return policy === 'disabled';
}

/** Fail closed until the auth policy is explicit and, when enabled, the session is valid. */
export function canRenderBrowserForAccessAuth(
  checked: boolean,
  status: AccessAuthStatus | null | undefined
): boolean {
  if (!checked || !status) return false;
  return status.auth_enabled === false || (status.auth_enabled === true && status.logged_in === true);
}
