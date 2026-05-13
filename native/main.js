/**
 * LastBrowser — Electron Main Process
 *
 * Productivity workspace browser — Wavebox/Sidekick/Zen inspired.
 * Wraps the Hermes WebUI Python backend with a native Electron shell
 * that adds multi-workspace, sidebar apps, vertical tabs, split view,
 * focus mode, command palette, kanban boards, AI agents, and more.
 *
 * Architecture: main/renderer separation with secure IPC bridge.
 */

const { app, BrowserWindow, ipcMain, Menu, shell, nativeImage, Tray, globalShortcut, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawnServer, stopServer, getServerUrl, isServerRunning } = require('./server-launcher');
const { setupTray } = require('./tray');
const { registerAll } = require('./src/main/ipc/router');

// ── LastBrowser Modules ──────────────────────────────────────────────────
const ipcRouter = require('./src/main/ipc/router');
const workspaceManager = require('./src/main/managers/workspaceManager');
const settingsManager = require('./src/main/managers/settingsManager');

const logger = require('./src/main/services/logger');

// ── Constants ──────────────────────────────────────────────────────────────
const DEV_MODE = !!process.env.ELECTRON_DEV;
const WEBUI_DIR = DEV_MODE
  ? path.resolve(__dirname, '..')
  : (() => {
      try {
        return path.resolve(process.resourcesPath, 'webui');
      } catch {
        return path.resolve(__dirname, '..');
      }
    })();

const PRELOAD_PATH = path.join(__dirname, 'preload.js');
const WORKSPACE_HTML = path.join(__dirname, 'workspace.html');

// ── State ──────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let appQuitting = false;
let currentWorkspaceId = null;
let _webContentsViews = new Map();  // tabId -> WebContentsView
let _focusTimerInterval = null;

// ── Window Creation ────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 500,
    frame: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0D0D1A',
      symbolColor: '#ffffff',
      height: 32,
    },
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: true,
    backgroundColor: '#0D0D1A',
  });

  // Load workspace browser HTML (standalone Electron app)
  mainWindow.loadURL(`file://${WORKSPACE_HTML.replace(/\\/g, '/')}`);

  // ── Sidebar is now integrated into workspace.html (nav-sidebar) ──

  mainWindow.once('ready-to-show', () => {
    logger.info('app', 'LastBrowser window ready');
  });

  mainWindow.on('close', (e) => {
    if (!appQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ── Handle navigation (for legacy WebUI panel switching) ─────────────
  mainWindow.webContents.on('will-navigate', (event, url) => {
    logger.debug('main', `Navigation: ${url}`);
  });

  return mainWindow;
}

// ── WebContentsView Management ─────────────────────────────────────────────

function createWebView(tabId, partition) {
  try {
    const wcv = new BrowserWindow.WebContentsView({
      webPreferences: {
        preload: PRELOAD_PATH,
        partition: partition || `persist:tab_${tabId}`,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    _webContentsViews.set(tabId, wcv);
    return wcv;
  } catch (err) {
    logger.error('webview', `Failed to create WebContentsView for tab ${tabId}: ${err.message}`);
    return null;
  }
}

function destroyWebView(tabId) {
  const wcv = _webContentsViews.get(tabId);
  if (wcv) {
    try {
      mainWindow.contentView.removeChildView(wcv);
      wcv.webContents.destroy();
    } catch (_) {}
    _webContentsViews.delete(tabId);
  }
}

function attachWebViewToWindow(tabId, bounds) {
  const wcv = _webContentsViews.get(tabId);
  if (!wcv || !mainWindow) return;
  try {
    mainWindow.contentView.addChildView(wcv);
    wcv.setBounds(bounds || { x: 280, y: 32, width: 1000, height: 828 });
  } catch (_) {}
}

// ── IPC Handlers ───────────────────────────────────────────────────────────

function setupIPC() {
  // Register all v2 IPC handlers
  ipcRouter.registerAll();

  // Legacy Hermes IPC (backward compatible)
  ipcMain.handle('hermes:get-server-url', () => getServerUrl());
  ipcMain.handle('hermes:get-version', () => app.getVersion());
  ipcMain.handle('hermes:get-webui-dir', () => WEBUI_DIR);
  ipcMain.handle('hermes:is-dev', () => DEV_MODE);

  // Server lifecycle (handled via router now)
  // (removed duplicate of hermes:server-restart)

  // Navigate legacy WebUI panels
  ipcMain.on('hermes:navigate', (_, route) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.executeJavaScript(
        `switchPanel('${route}'); window.__currentRoute = '${route}';`
      ).catch(() => {});
    }
  });

  // Window controls (backward compatible)
  ipcMain.on('hermes:minimize', () => mainWindow?.minimize());
  ipcMain.on('hermes:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('hermes:close', () => {
    if (tray) {
      mainWindow?.hide();
      sidebarWindow?.hide();
    } else {
      mainWindow?.close();
    }
  });
  ipcMain.on('hermes:toggle-sidebar', () => {
    // Sidebar is now integrated into the main window (nav-sidebar in workspace.html)
    // Toggle is handled via the app-sidebar visibility in the renderer
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'document.getElementById(\"appSidebar\").classList.toggle(\"hidden\")'
      ).catch(() => {});
    }
  });

  // ── WebView management IPC ─────────────────────────────────────────
  ipcMain.handle('webview:create', (_, tabId, url, partition) => {
    const wcv = createWebView(tabId, partition);
    if (wcv) {
      wcv.webContents.loadURL(url || 'about:blank');
      attachWebViewToWindow(tabId, _getContentBounds());
      return true;
    }
    return false;
  });

  // ── Tab activation: show/hide WebContentsViews ────────────────────
  ipcMain.handle('tab:activate-view', (_, tabId, url, partition) => {
    try {
      // Remove ALL existing child views from content area
      const views = Array.from(mainWindow.contentView.children || []);
      for (const v of views) {
        try { mainWindow.contentView.removeChildView(v); } catch (_) {}
      }

      // If this tab already has a WCV, just re-attach it
      let wcv = _webContentsViews.get(tabId);
      if (!wcv) {
        wcv = createWebView(tabId, partition || `persist:tab_${tabId}`);
        if (wcv && url && url !== 'about:blank') {
          wcv.webContents.loadURL(url);
        }
      }

      if (wcv) {
        // Set up tracking for title/URL updates
        wcv.webContents.on('page-title-updated', (_e, title) => {
          mainWindow?.webContents.send('tab:title-changed', tabId, title);
        });
        wcv.webContents.on('did-navigate', (_e, navUrl) => {
          mainWindow?.webContents.send('tab:url-changed', tabId, navUrl);
        });
        // Attach and set bounds
        mainWindow.contentView.addChildView(wcv);
        wcv.setBounds(_getContentBounds());
        wcv.webContents.emit('was-shown'); // resume if suspended
      }
      return true;
    } catch (err) {
      logger.error('webview', `Tab activate failed: ${err.message}`);
      return false;
    }
  });

  // ── Tab deactivation: hide all WebContentsViews ───────────────────
  ipcMain.handle('tab:deactivate-view', () => {
    try {
      const views = Array.from(mainWindow.contentView.children || []);
      for (const v of views) {
        try { mainWindow.contentView.removeChildView(v); } catch (_) {}
      }
      return true;
    } catch (_) { return false; }
  });

  // ── Tab close: destroy WCV ────────────────────────────────────────
  ipcMain.handle('tab:close-view', (_, tabId) => {
    destroyWebView(tabId);
    return true;
  });

  ipcMain.handle('webview:destroy', (_, tabId) => {
    destroyWebView(tabId);
    return true;
  });

  ipcMain.handle('webview:navigate', (_, tabId, url) => {
    const wcv = _webContentsViews.get(tabId);
    if (wcv) {
      wcv.webContents.loadURL(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('webview:go-back', (_, tabId) => {
    const wcv = _webContentsViews.get(tabId);
    if (wcv?.webContents.canGoBack()) {
      wcv.webContents.goBack();
      return true;
    }
    return false;
  });

  ipcMain.handle('webview:go-forward', (_, tabId) => {
    const wcv = _webContentsViews.get(tabId);
    if (wcv?.webContents.canGoForward()) {
      wcv.webContents.goForward();
      return true;
    }
    return false;
  });

  ipcMain.handle('webview:reload', (_, tabId) => {
    const wcv = _webContentsViews.get(tabId);
    if (wcv) {
      wcv.webContents.reload();
      return true;
    }
    return false;
  });

  // ── Skills: list from filesystem ──────────────────────────────────
  ipcMain.handle('skills:list', () => {
    const skillsDir = path.resolve(__dirname, '..', '..', 'skills');
    try {
      const items = [];
      if (fs.existsSync(skillsDir)) {
        const dirs = fs.readdirSync(skillsDir, { withFileTypes: true });
        for (const d of dirs) {
          if (d.isDirectory()) {
            const skillPath = path.join(skillsDir, d.name, 'SKILL.md');
            let name = d.name;
            let description = '';
            let icon = '🧩';
            if (fs.existsSync(skillPath)) {
              const content = fs.readFileSync(skillPath, 'utf-8');
              const nameMatch = content.match(/^name:\s*(.+)$/m);
              const descMatch = content.match(/^description:\s*(.+)$/m);
              if (nameMatch) name = nameMatch[1].trim();
              if (descMatch) description = descMatch[1].trim();
            }
            const iconMap = { 'media': '🎬', 'github': '🐙', 'discord': '💬', 'electron': '⚡', 'browser': '🌐', 'test': '🧪', 'research': '🔬', 'writing': '✍️', 'devops': '🔧', 'data': '📊', 'creative': '🎨', 'ai': '🤖', 'mlops': '🧠', 'mcp': '🔌', 'note': '📝', 'email': '📧', 'smart': '🏠', 'gaming': '🎮', 'productivity': '⏱', 'plan': '📋', 'memory': '🧠', 'kanban': '📊' };
            for (const [key, val] of Object.entries(iconMap)) {
              if (name.toLowerCase().includes(key)) { icon = val; break; }
            }
            items.push({ name, description: description.slice(0, 200), icon, category: d.name.split('-')[0] || 'other', status: 'loaded' });
          }
        }
      }
      return items;
    } catch (err) {
      logger.error('skills', `List error: ${err.message}`);
      return [];
    }
  });

  // ── Skills: read detail ──────────────────────────────────────────
  ipcMain.handle('skills:detail', (_, name) => {
    const skillsDir = path.resolve(__dirname, '..', '..', 'skills');
    try {
      const dirs = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory() && d.name === name) {
          const skillPath = path.join(skillsDir, d.name, 'SKILL.md');
          if (fs.existsSync(skillPath)) return fs.readFileSync(skillPath, 'utf-8');
        }
      }
      // Fuzzy search
      for (const d of dirs) {
        if (d.isDirectory()) {
          const skillPath = path.join(skillsDir, d.name, 'SKILL.md');
          if (fs.existsSync(skillPath)) {
            const content = fs.readFileSync(skillPath, 'utf-8');
            if (content.includes(name)) return content;
          }
        }
      }
      return 'Skill not found.';
    } catch (err) {
      return `Error: ${err.message}`;
    }
  });

  // ── Browser Control (Agent) IPC ──────────────────────────────────
  ipcMain.handle('tab:exec-js', async (_, tabId, code) => {
    const wcv = _webContentsViews.get(tabId);
    if (!wcv) return { error: 'Tab not found' };
    try {
      const result = await wcv.webContents.executeJavaScript(code);
      return { result };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('tab:get-content', async (_, tabId) => {
    const wcv = _webContentsViews.get(tabId);
    if (!wcv) return { error: 'Tab not found' };
    try {
      const content = await wcv.webContents.executeJavaScript(`
        (function() {
          const article = document.querySelector('article') ||
                         document.querySelector('[role="main"]') ||
                         document.querySelector('main');
          if (article) return article.innerText.slice(0, 10000);
          // Fallback: body text without scripts/styles
          const clone = document.body.cloneNode(true);
          clone.querySelectorAll('script,style,nav,footer,header,aside').forEach(el => el.remove());
          return (clone.innerText || '').trim().slice(0, 10000);
        })()
      `);
      return { content: content || '' };
    } catch (err) {
      return { content: '', error: err.message };
    }
  });

  ipcMain.handle('tab:screenshot', async (_, tabId) => {
    const wcv = _webContentsViews.get(tabId);
    if (!wcv) return { error: 'Tab not found' };
    try {
      const image = await wcv.webContents.capturePage();
      const dataUrl = image.toDataURL();
      return { screenshot: dataUrl };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('tab:get-meta', async (_, tabId) => {
    const wcv = _webContentsViews.get(tabId);
    if (!wcv) return { error: 'Tab not found' };
    try {
      const meta = await wcv.webContents.executeJavaScript(`
        (function() {
          const icon = document.querySelector('link[rel*="icon"]')?.href ||
                       'https://www.google.com/s2/favicons?domain=' + location.hostname;
          return {
            title: document.title,
            url: location.href,
            favicon: icon,
            domain: location.hostname,
          };
        })()
      `);
      return meta;
    } catch (err) {
      return { error: err.message, title: '', url: '' };
    }
  });

  // Track URL changes for agents
  function setupWebViewTracking(tabId, wcv) {
    wcv.webContents.on('page-title-updated', (_e, title) => {
      mainWindow?.webContents.send('tab:title-changed', tabId, title);
    });
    wcv.webContents.on('did-navigate', (_e, url) => {
      mainWindow?.webContents.send('tab:url-changed', tabId, url);
    });
  }

  // ── Agent Session Control IPC ──────────────────────────────────────
  ipcMain.handle('agent:assign-tab', async (_, sessionId, tabId) => {
    const wcv = _webContentsViews.get(tabId);
    if (!wcv) return { error: 'Tab not found' };
    try {
      const sessionManager = require('./src/main/managers/sessionManager');
      sessionManager.assignAgent(sessionId, tabId);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('agent:tab-action', async (_, tabId, action, params) => {
    const wcv = _webContentsViews.get(tabId);
    if (!wcv) return { error: 'Tab not found' };
    try {
      switch (action) {
        case 'navigate': {
          wcv.webContents.loadURL(params.url);
          return { success: true, action: 'navigate', url: params.url };
        }
        case 'click': {
          const result = await wcv.webContents.executeJavaScript(`
            (function() {
              const el = document.querySelector('${params.selector}');
              if (!el) return { error: 'Element not found: ${params.selector}' };
              el.click();
              return { success: true };
            })()
          `);
          return result;
        }
        case 'type': {
          const result = await wcv.webContents.executeJavaScript(`
            (function() {
              const el = document.querySelector('${params.selector}');
              if (!el) return { error: 'Element not found' };
              el.value = ${JSON.stringify(params.text)};
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true };
            })()
          `);
          return result;
        }
        case 'scroll': {
          wcv.webContents.executeJavaScript(`
            window.scrollBy(0, ${params.y || 0});
          `);
          return { success: true };
        }
        case 'back': {
          if (wcv.webContents.canGoBack()) { wcv.webContents.goBack(); return { success: true }; }
          return { error: 'Cannot go back' };
        }
        case 'forward': {
          if (wcv.webContents.canGoForward()) { wcv.webContents.goForward(); return { success: true }; }
          return { error: 'Cannot go forward' };
        }
        case 'reload': {
          wcv.webContents.reload();
          return { success: true };
        }
        default:
          return { error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('webview:resize', (_, bounds) => {
    for (const [tabId, wcv] of _webContentsViews) {
      try {
        wcv.setBounds(bounds || _getContentBounds());
      } catch (_) {}
    }
    return true;
  });

  logger.info('ipc', 'All IPC handlers registered');
}

function _getContentBounds() {
  if (!mainWindow) return { x: 0, y: 0, width: 800, height: 600 };
  const bounds = mainWindow.getBounds();
  return {
    x: 48 + 280,  // nav sidebar (48px) + old sidebar offset
    y: 0,          // no OS titlebar (frameless via CSS)
    width: bounds.width - 48 - 280,
    height: bounds.height,
  };
}

// ── Global Keyboard Shortcuts ──────────────────────────────────────────────

function registerShortcuts() {
  // Ctrl+K: Command Palette
  globalShortcut.register('CommandOrControl+K', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'window.__openPalette && window.__openPalette()'
      ).catch(() => {});
    }
  });

  // Ctrl+Shift+M: Mute all
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'window.__muteAll && window.__muteAll()'
      ).catch(() => {});
    }
  });

  // Ctrl+B: Toggle sidebar
  globalShortcut.register('CommandOrControl+B', async () => {
    if (mainWindow) {
      const compact = await settingsManager.get('compactMode');
      if (!compact) {
        mainWindow.webContents.send('hermes:toggle-sidebar');
      }
    }
  });

  // Ctrl+T: New tab
  globalShortcut.register('CommandOrControl+T', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'window.__newTab && window.__newTab()'
      ).catch(() => {});
    }
  });

  // Ctrl+W: Close tab
  globalShortcut.register('CommandOrControl+W', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'window.__closeCurrentTab && window.__closeCurrentTab()'
      ).catch(() => {});
    }
  });

  // Ctrl+S: Toggle compact mode
  globalShortcut.register('CommandOrControl+S', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'window.__toggleCompact && window.__toggleCompact()'
      ).catch(() => {});
    }
  });

  // Ctrl+Shift+E: Save session
  globalShortcut.register('CommandOrControl+Shift+E', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'window.__saveSession && window.__saveSession()'
      ).catch(() => {});
    }
  });

  // Ctrl+Shift+S: Sleep all inactive
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'window.__sleepAll && window.__sleepAll()'
      ).catch(() => {});
    }
  });

  // Ctrl+Alt+Number: Switch workspace
  for (let i = 1; i <= 9; i++) {
    globalShortcut.register(`CommandOrControl+Alt+${i}`, () => {
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(
          `window.__switchWorkspace && window.__switchWorkspace(${i - 1})`
        ).catch(() => {});
      }
    });
  }

  // Ctrl+Alt+Left/Right: Previous/Next workspace
  globalShortcut.register('CommandOrControl+Alt+Left', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'window.__prevWorkspace && window.__prevWorkspace()'
      ).catch(() => {});
    }
  });
  globalShortcut.register('CommandOrControl+Alt+Right', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        'window.__nextWorkspace && window.__nextWorkspace()'
      ).catch(() => {});
    }
  });

  logger.info('shortcuts', 'Global keyboard shortcuts registered');
}

// ── Focus Mode Timer ──────────────────────────────────────────────────────

function startFocusTimer() {
  if (_focusTimerInterval) return;
  _focusTimerInterval = setInterval(() => {
    const focusManager = require('./src/main/managers/focusManager');
    const status = focusManager.getStatus();
    if (status.active && mainWindow) {
      mainWindow.webContents.send('focus:tick', status);
    }
  }, 1000);
}

// ── Cron Job Checker ──────────────────────────────────────────────────────

function startCronChecker() {
  const cronManager = require('./src/main/managers/cronManager');
  cronManager.onDueJobs((dueJobs) => {
    logger.info('cron', `${dueJobs.length} cron job(s) due`, dueJobs.map(j => j.name));
    for (const job of dueJobs) {
      // Mark as running in worker queue
      const workerManager = require('./src/main/managers/workerManager');
      workerManager.submit({
        type: job.taskType,
        priority: 'medium',
        agentId: '',
        input: { cronJobId: job.id, ...job.config },
      });
      cronManager.markRun(job.id, 'triggered');
    }
  });
  cronManager.start();
  logger.info('cron', 'Cron scheduler started');
}

// ── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  logger.info('app', `LastBrowser v${app.getVersion()} starting...`);

  // Run data migrations
  try {
    const migrations = require('./src/main/database/migrations');
    migrations.runMigrations();
  } catch (err) {
    logger.warn('app', `Migration error (non-critical): ${err.message}`);
  }

  // Seed app definitions (presets)
  try {
    const appDefManager = require('./src/main/managers/appDefinitionManager');
    appDefManager.seedPresets();
  } catch (err) {
    logger.warn('app', `App definition seed error: ${err.message}`);
  }

  // Start Python WebUI server (backward compatible, non-blocking)
  spawnServer(WEBUI_DIR, DEV_MODE).then(serverOk => {
    if (!serverOk) logger.warn('app', 'WebUI server failed to start (non-critical)');
  });

  // Set up all IPC handlers
  setupIPC();

  // Create windows
  createMainWindow();

  // Initialize workspace system
  const workspaces = workspaceManager.getAll();
  if (workspaces.length === 0) {
    const defaultW = workspaceManager.create({
      name: 'Default',
      icon: '💼',
      color: '#6366f1',
    });
    currentWorkspaceId = defaultW.id;
    logger.info('workspace', 'Created default workspace');
  } else {
    currentWorkspaceId = workspaces[0].id;
  }

  // Inject workspace data into renderer
  if (mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(`
        window.__workspaces = ${JSON.stringify(workspaceManager.getAll())};
        window.__currentWorkspaceId = '${currentWorkspaceId}';
      `).catch(() => {});
    });
  }

  // Setup system tray
  tray = setupTray(mainWindow, sidebarWindow, () => appQuitting);

  // No application menu (use titlebar overlay)
  Menu.setApplicationMenu(null);

  // Register global keyboard shortcuts
  registerShortcuts();

  // Start background services
  startFocusTimer();
  startCronChecker();

  app.on('activate', () => {
    if (mainWindow === null) createMainWindow();
    else {
      mainWindow.show();
      sidebarWindow?.show();
    }
  });

  logger.info('app', `LastBrowser ready — ${getServerUrl() || 'workspace browser mode'}`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  appQuitting = true;
  logger.info('app', 'Shutting down...');

  // Clean up
  if (_focusTimerInterval) clearInterval(_focusTimerInterval);

  for (const [tabId, wcv] of _webContentsViews) {
    try { wcv.webContents.destroy(); } catch (_) {}
  }
  _webContentsViews.clear();

  globalShortcut.unregisterAll();

  if (tray) {
    tray.destroy();
    tray = null;
  }

  await stopServer();

  // Persist remaining store data
  const store = require('./src/main/database/store');
  store.shutdown();

  const dataDir = store.getDataDir();
  logger.info('app', `Data stored in: ${dataDir}`);
  logger.info('app', 'Goodbye.');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('process', `Uncaught exception: ${err.message}`, { stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('process', `Unhandled rejection: ${reason}`);
});
