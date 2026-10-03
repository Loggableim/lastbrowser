import { app, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { LocalAiManager } from './local-ai.js';
import { isTrustedPreloadDocumentUrl } from './preload-origin.js';

export function registerLocalAi(manager: LocalAiManager): void {
  const handle = (name: string, action: (...args: any[]) => unknown) => ipcMain.handle(`lastbrowser:localAi:${name}`, (event, ...args) => {
    if (!event.senderFrame || !isTrustedPreloadDocumentUrl(event.senderFrame.url)) throw new Error('Untrusted local AI request.');
    return action(...args);
  });
  handle('status', (workspace = '') => manager.status(String(workspace)));
  handle('scan', () => manager.scan());
  handle('download', (id) => manager.download(String(id)));
  handle('cancel', () => manager.cancel());
  handle('start', (id, backend) => {
    if (backend !== 'cpu' && backend !== 'vulkan') throw new Error('Invalid backend.');
    return manager.start(String(id), backend);
  });
  handle('stop', () => manager.stop());
  handle('remove', (id) => manager.remove(String(id)));
  handle('clearSpace', (workspace) => manager.clearSpace(String(workspace)));
  handle('import', async (id) => {
    const result = await dialog.showOpenDialog({ title: 'GGUF import', properties: ['openFile'], filters: [{ name: 'GGUF', extensions: ['gguf'] }] });
    if (!result.canceled && result.filePaths[0]) await manager.importFile(String(id), result.filePaths[0]);
  });
  handle('configure', (workspace, id, fallback, primary) => manager.configure(String(workspace), String(id), fallback === true, primary === true));
}

export function createLocalAi(runtimeRoot: string): LocalAiManager {
  const home = path.join(app.getPath('userData'), 'local-ai');
  process.env.LASTBROWSER_LOCAL_AI_HOME = home;
  process.env.LASTBROWSER_LOCAL_AI_CATALOG = path.join(runtimeRoot, 'models.json');
  return new LocalAiManager(runtimeRoot, home);
}
