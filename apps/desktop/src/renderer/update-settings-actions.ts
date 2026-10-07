export type DesktopUpdateStatus = Awaited<ReturnType<typeof window.lastbrowser.updates.status>>;

export type DesktopUpdateApi = Pick<typeof window.lastbrowser.updates, 'status' | 'onStatus' | 'install'>;

export function observeDesktopUpdateStatus(
  api: Pick<DesktopUpdateApi, 'status' | 'onStatus'>,
  onStatus: (status: DesktopUpdateStatus) => void,
  onReadError: (error: unknown) => void
): () => void {
  let active = true;
  let receivedLiveStatus = false;
  const unsubscribe = api.onStatus((status) => {
    if (!active) return;
    receivedLiveStatus = true;
    onStatus(status);
  });

  void api.status().then((status) => {
    if (active && !receivedLiveStatus) onStatus(status);
  }).catch((error: unknown) => {
    if (active && !receivedLiveStatus) onReadError(error);
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

export type UpdateInstallResult = 'not-downloaded' | 'busy' | 'started' | 'status-changed' | 'failed';

export async function installDownloadedUpdate(options: {
  getStatus: () => DesktopUpdateStatus | null;
  install: () => Promise<DesktopUpdateStatus>;
  pending: { current: boolean };
  setPending: (pending: boolean) => void;
  setError: (message: string) => void;
  formatError: (error: unknown) => string;
  formatUnavailable: () => string;
}): Promise<UpdateInstallResult> {
  if (options.pending.current) return 'busy';
  if (options.getStatus()?.state !== 'downloaded') return 'not-downloaded';

  options.pending.current = true;
  options.setPending(true);
  options.setError('');
  try {
    const result = await options.install();
    if (result.state !== 'downloaded' || options.getStatus()?.state !== 'downloaded') {
      options.pending.current = false;
      options.setPending(false);
      options.setError(options.formatUnavailable());
      return 'status-changed';
    }
    // Keep the action locked after a successful install request while the app quits.
    return 'started';
  } catch (error) {
    options.pending.current = false;
    options.setPending(false);
    options.setError(options.formatError(error));
    return 'failed';
  }
}
