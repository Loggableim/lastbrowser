/**
 * Apply a deny-by-default security policy to WebView guests created by the
 * privileged Lastbrowser shell. Keep navigation/session attributes intact;
 * callers may still adjust `params.src` for controlled tab transfers.
 */
export function hardenWebViewAttachment(
  webPreferences: Record<string, unknown>,
  params: Record<string, unknown>
): void {
  // Electron documents that WebView preload scripts run with Node integration
  // enabled. Never accept a page-supplied preload in a remote browser guest.
  for (const key of ['preload', 'preloadURL', 'preloadUrl', 'additionalArguments']) {
    delete webPreferences[key];
    delete params[key];
  }

  webPreferences.nodeIntegration = false;
  webPreferences.nodeIntegrationInSubFrames = false;
  webPreferences.contextIsolation = true;
  webPreferences.sandbox = true;
  webPreferences.webSecurity = true;
  webPreferences.allowRunningInsecureContent = false;
  // Browser guests do not need to create nested WebViews that would otherwise
  // bypass the shell's attachment policy.
  webPreferences.webviewTag = false;
}
