/**
 * LastBrowser v2 — System Tray
 * Minimize-to-tray with context menu featuring workspace switching, focus mode, and quick actions.
 */
const { Tray, Menu, nativeImage, shell, app, dialog } = require('electron');
const path = require('path');

let tray = null;

function setupTray(mainWindow, sidebarWindow, getQuitting) {
  if (tray) return tray;

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon = nativeImage.createFromPath(iconPath);
  trayIcon = trayIcon.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip('LastBrowser');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show LastBrowser',
      click: () => {
        mainWindow?.show();
        sidebarWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Hide to Tray',
      click: () => {
        mainWindow?.hide();
        sidebarWindow?.hide();
      },
    },
    { type: 'separator' },
    {
      label: 'Toggle Compact Mode',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.executeJavaScript('window.__toggleCompact && window.__toggleCompact()').catch(() => {});
        }
      },
    },
    {
      label: 'Start/Stop Focus',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.executeJavaScript('window.__toggleFocus && window.__toggleFocus()').catch(() => {});
        }
      },
    },
    {
      label: 'Sleep Inactive Tabs',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.executeJavaScript('window.__sleepAll && window.__sleepAll()').catch(() => {});
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => {
        shell.openExternal('http://127.0.0.1:8787');
      },
    },
    {
      label: 'Restart Server',
      click: async () => {
        const { spawnServer, stopServer } = require('./server-launcher');
        await stopServer();
        const webuiDir = process.env.ELECTRON_DEV
          ? path.resolve(__dirname, '..')
          : path.resolve(process.resourcesPath, 'webui');
        await spawnServer(webuiDir, !!process.env.ELECTRON_DEV);
        mainWindow?.loadURL('http://127.0.0.1:8787');
        mainWindow?.show();
        sidebarWindow?.show();
      },
    },
    { type: 'separator' },
    {
      label: 'Data Directory…',
      click: () => {
        const store = require('./src/main/database/store');
        shell.openPath(store.getDataDir());
      },
    },
    {
      label: 'About LastBrowser',
      click: () => {
        dialog.showMessageBox({
          type: 'info',
          title: 'About LastBrowser',
          message: `LastBrowser v${app.getVersion()}`,
          detail: "AI-native workspace browser.\nElectron-powered, Python-backed, AI-orchestrated.\n\"The last browser you'll ever need.\"",
        });
      },
    },
    {
      label: 'Quit',
      click: () => { app.quit(); },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
      sidebarWindow?.hide();
    } else {
      mainWindow?.show();
      sidebarWindow?.show();
      mainWindow?.focus();
    }
  });

  return tray;
}

module.exports = { setupTray };
