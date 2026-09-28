/** Restrict the privileged preload bridge to the bundled shell and Vite dev UI. */
export function isTrustedPreloadDocumentUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password) return false;

    if (url.protocol === 'app:' && url.hostname === 'bundle' && !url.port) return true;

    // The development launcher uses this exact loopback origin. Do not expose
    // the bridge to arbitrary localhost services or remote web pages.
    return url.protocol === 'http:'
      && url.hostname === '127.0.0.1'
      && url.port === '5173';
  } catch {
    return false;
  }
}
