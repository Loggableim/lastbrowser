/** Create a per-flow auth URL handler that opens the user's browser at most once. */
export function createAntigravityAuthUrlOpener(
  openExternal: (url: string) => Promise<unknown>,
  onOpened: () => void,
  onOpenFailed: () => void = () => undefined
): (value: unknown) => void {
  let opened = false;
  let opening = false;

  return (value: unknown) => {
    const authUrl = typeof value === 'string' ? value.trim() : '';
    if (!authUrl || opened || opening) return;

    // Set this before invoking the asynchronous IPC call so overlapping poll
    // responses cannot open multiple browser tabs for the same flow.
    opening = true;
    // Show a responsive waiting state immediately; onOpenFailed replaces it
    // with a recoverable error if Electron cannot launch the system browser.
    onOpened();
    void Promise.resolve()
      .then(() => openExternal(authUrl))
      .then((result) => {
        // `system.openExternal` resolves `false` when Electron/the OS could
        // not launch a browser. Treat that exactly like a rejected IPC call;
        // otherwise the panel gets stuck in its "waiting" state forever.
        if (result === false) {
          throw new Error('System browser could not be opened');
        }
        opened = true;
      })
      .catch(() => {
        // Do not retain a failed attempt: a later poll may retry the same URL.
        onOpenFailed();
      })
      .finally(() => {
        opening = false;
      });
  };
}
