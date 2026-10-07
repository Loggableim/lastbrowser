export type RestartUpdateStatus = { state: string };

type CdpRestartDependencies = {
  installDownloadedUpdate: () => RestartUpdateStatus | null;
  relaunch: () => void;
  quit: () => void;
};

export function createCdpRestartHandler(dependencies: CdpRestartDependencies): () => { ok: true; restarting: true; updateInstalling: boolean } {
  let completedResult: { ok: true; restarting: true; updateInstalling: boolean } | null = null;

  return () => {
    if (completedResult) return completedResult;

    const update = dependencies.installDownloadedUpdate();
    if (update?.state === 'downloaded') {
      // The updater owns shutdown and the single post-install relaunch here.
      completedResult = { ok: true, restarting: true, updateInstalling: true };
      return completedResult;
    }

    dependencies.relaunch();
    completedResult = { ok: true, restarting: true, updateInstalling: false };
    dependencies.quit();
    return completedResult;
  };
}
