/** Run Electron startup only in the process that owns the single-instance lock. */
export function startPrimaryInstanceStartup(
  hasSingleInstanceLock: boolean,
  registerSchemes: () => void,
  whenReady: () => Promise<unknown>,
  initialize: () => void | Promise<void>,
  quit: () => void
): void {
  if (!hasSingleInstanceLock) {
    quit();
    return;
  }

  // Custom schemes must be registered before whenReady() is requested.
  registerSchemes();
  void whenReady().then(initialize);
}
