import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, screen, shell, session, webContents, type MessageBoxOptions, type Session } from 'electron';
import { getChatCompletionNotification, shouldNotifyChatCompletion } from './chat-notifications.js';
import { detachRequestKey, ensureDetachedPageReady, isGuestOwnedByRenderer, normalizeRestoredNavigationHistory, parseDetachTabPayload, PendingTabDetachRegistry, serializeNavigationHistory } from './window-tab-transfer.js';
import { clearDeletedProfilePartitions } from './profile-partition-cleanup.js';
import { registerBrowserDataCleanupIpc } from './browser-data-cleanup.js';
import { broadcastDownloadSnapshot, createDownloadTracker } from './downloads.js';
import { ExtensionManager } from './extensions.js';
import { isCdpEnabled, resolveCdpPort, setPersistedCdpEnabled } from './cdp.js';
import { loadCdpPreference, saveCdpPreference } from './cdp-settings.js';
import { moduleDirname } from './module-path.js';
import { SidecarServices, appResourcesDir, resolveServiceLayout } from './services.js';
import { loadSetupState, saveSetupState } from './setup-store.js';
import {
  addSupermemoryDocument,
  activateAgent,
  addSpace,
  answerAgentSplashQuestion,
  applyCloudSetup,
  banDiscordMember,
  cancelChatStream,
  cancelOnboardingOAuth,
  createAgent,
  completeAgentSplash,
  completeCloudSetup,
  configureDiscord,
  createCron,
  createGmailTask,
  createKanbanTask,
  createProfile,
  createWorkspaceDirectory,
  createWorkspaceFile,
  createSidekickSession,
  deleteAgent,
  deleteCron,
  deleteGmailMessage,
  deleteProfile,
  deleteSkill,
  deleteSession,
  deleteWorkspaceEntry,
  duplicateSession,
  forgetSupermemoryDocument,
  getActivatedAgents,
  getAgent,
  getAgentActivities,
  getAgentMemory,
  getAgentProfiles,
  getAgentSession,
  getAgentSoul,
  getAgentSplashStatus,
  getAgentStats,
  getAgentWorkspaces,
  getAppstoreUpdates,
  getAppstoreSdk,
  getChatStreamStatus,
  getCurrentAgent,
  getDesktopSession,
  getDiscordBotInfo,
  getDiscordGuild,
  getDiscordMember,
  getDiscordStats,
  getDiscordWarns,
  getInsights,
  getActiveDispatches,
  getKanbanBoard,
  getLogs,
  getMemory,
  getOnboardingStatus,
  getSessionDraft,
  getSettings,
  getSkillContent,
  getSupermemoryStatus,
  getSupermemoryDocument,
  getWikiStatus,
  hybridMemorySearch,
  installAppstoreApp,
  kickDiscordMember,
  listAgents,
  listAgentSessions,
  listAgentWorkspace,
  listAppstore,
  listCrons,
  listDiscordChannels,
  listDiscordChannelsTree,
  listDiscordMembers,
  listDiscordMessages,
  listDiscordRoles,
  listGmailAccounts,
  listGmailFolders,
  listGmailMessages,
  listProfiles,
  listSkills,
  listSpaces,
  listSessions,
  listSupermemoryDocuments,
  reindexSupermemory,
  dumpSupermemory,
  listMcpServers,
  saveMcpServers,
  listMcpTools,
  callMcpTool,
  listWorkspace,
  moveGmailMessage,
  pauseCron,
  pollOnboardingOAuth,
  purgeDiscordChannel,
  readGmailMessage,
  readWorkspaceFile,
  removeSpace,
  requestWebui,
  getAccessAuthStatus,
  loginAccessPassword,
  setAccessAuthRequiredHandler,
  getAccessAuthCookie,
  renameSpace,
  renameWorkspaceEntry,
  reorderSpaces,
  renameSession,
  runDispatchOnce,
  resumeCron,
  runCron,
  saveSettings,
  saveAgentProfile,
  saveSkill,
  saveSessionDraft,
  saveWorkspaceFile,
  searchGmailMessages,
  searchSupermemory,
  sendAgentWorkspaceCommand,
  sendDiscordMessage,
  sendGmailMessage,
  sendSidekickMessage,
  setCurrentAgent,
  setDefaultModel,
  startAgentChat,
  startAgentWorkspaceProcess,
  startSidekickChat,
  startOnboardingOAuth,
  stopAgentWorkspace,
  submitAppstoreApp,
  summarizeGmailThread,
  draftGmailReply,
  getRelatedGmailMessages,
  switchProfile,
  timeoutDiscordMember,
  uninstallAppstoreApp,
  unbanDiscordMember,
  untimeoutDiscordMember,
  updateAgent,
  updateAllAppstore,
  updateCron,
  updateKanbanTask,
  warnDiscordMember,
  writeMemory,
  ensureWebuiAuth,
  getWebuiSessionToken,
  getFallbackModel,
  setFallbackModel
} from './sidekick-api.js';
import { registerUpdateIpc, startAutoUpdateChecks } from './updates.js';
import { createAdblockController } from './adblock.js';
import { createSidekickUpdater } from './sidekick-updater.js';
import { subscribeChatStream, type ChatStreamHandle } from './chat-stream.js';
import { createPermissionController, loadTrustedOrigins, resolvePermissionRequest, saveTrustedOrigins, trustedNotificationOriginsFileName, trustedOriginsFileName } from './permissions.js';
import { configureDrmWidevine, initializeCastlabsWidevine } from './drm.js';
import { appRendererUrl, installAppProtocolHandler, registerAppScheme } from './app-protocol.js';
import { registerWindowControlIpc } from './window-controls.js';
import { startPrimaryInstanceStartup } from './app-startup.js';
import { hardenWebViewAttachment } from './webview-security.js';
import { capturePageDataUrl, normalizeCapturePageRect } from './capture-page.js';
import { createOpenUrlLifecycle } from './open-url-lifecycle.js';
import { registerDefaultSidekickMigrationIpc } from './sidekick-migration.js';
import { withSidekickWebuiReady } from './sidekick-readiness.js';
import { startTerminal, writeTerminal, resizeTerminal, closeTerminal, getTerminalIds, closeAllTerminals } from './terminal-process.js';
import { createAppTray, setupMinimizeToTray, type TrayController } from './tray.js';
import { createMainWindowOptions, installBrowserChrome } from './window-chrome.js';
import { registerBrowserContextMenu } from './browser-context-menu.js';
import { registerBrowserShortcuts } from './shortcuts.js';
import { openAuthConnectWindow, cleanOAuthUserAgent, sanitizeSecChUa, isStreamingLoginUrl, openExternalUrl } from './auth-window.js';
import { synthesizeTabs, extractActiveWebview, type TabSynthesisOptions } from './tab-intelligence.js';

process.on('uncaughtException', (err, origin) => {
  console.error('[lastbrowser uncaughtException]', origin, err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[lastbrowser unhandledRejection]', reason);
});
app.on('render-process-gone', (_event, _contents, details) => {
  console.error('[lastbrowser render-process-gone]', details);
});
app.on('child-process-gone', (_event, details) => {
  console.error('[lastbrowser child-process-gone]', details);
});

const mainDir = moduleDirname(import.meta.url);
const cdpPreference = loadCdpPreference(app.getPath('userData'));
setPersistedCdpEnabled(cdpPreference.enabled);
let mainWindow: BrowserWindow | null = null;
let appReady = false;
const secondaryWindows = new Set<BrowserWindow>();
type DetachedTabTransfer = {
  transferId: string;
  payload: { tab: any; spacePath?: string; navigationHistory?: ReturnType<typeof serializeNavigationHistory> };
  resolve: (acknowledged: boolean) => void;
  timeout: NodeJS.Timeout;
  historyRestorePromise?: Promise<boolean>;
  acknowledgePromise?: Promise<boolean>;
};
const detachedWindowWebContents = new Set<number>();
const detachedTabTransfers = new Map<number, DetachedTabTransfer>();
const pendingTabDetaches = new PendingTabDetachRegistry<unknown>();

async function restoreDetachedNavigationHistory(
  guest: Electron.WebContents,
  history: NonNullable<DetachedTabTransfer['payload']['navigationHistory']>
): Promise<boolean> {
  try {
    await guest.navigationHistory.restore(history);
  } catch (error) {
    console.warn('[lastbrowser] Could not restore detached tab navigation history:', error);
    return false;
  }

  const activeEntry = history.entries[history.index];
  if (!activeEntry) return false;
  const matchesSource = await normalizeRestoredNavigationHistory(
    history,
    guest.navigationHistory,
    (index) => new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        guest.removeListener('did-finish-load', onFinished);
        guest.removeListener('did-fail-load', onFailed);
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onFinished = () => {
        if (guest.navigationHistory.getActiveIndex() === index
          && guest.getURL() === activeEntry.url) finish();
      };
      const onFailed = (_event: Electron.Event, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
        if (isMainFrame && validatedURL === activeEntry.url) {
          finish(new Error(`Could not load restored history entry (${errorCode}): ${errorDescription}`));
        }
      };
      const timeout = setTimeout(() => finish(new Error('Timed out loading the restored history entry.')), 15_000);
      guest.on('did-finish-load', onFinished);
      guest.on('did-fail-load', onFailed);
      guest.navigationHistory.goToIndex(index);
      onFinished();
    })
  );
  if (matchesSource && guest.getURL() === activeEntry.url) return true;
  console.warn('[lastbrowser] Could not verify detached tab navigation history after restore.');
  return false;
}

let services: SidecarServices | null = null;
let appTray: TrayController | null = null;
let isQuitting = false;
const adblock = createAdblockController();
const sidekickUpdater = createSidekickUpdater();
const agentWorkspaceStreams = new Map<string, AbortController>();
const chatStreams = new Map<string, ChatStreamHandle>();
const downloads = createDownloadTracker();
// Trusted origins live next to the app's other settings so a video-call site the
// user allowed once does not have to be allowed again after a restart.
const trustedOriginsPath = path.join(app.getPath('userData'), trustedOriginsFileName);
const trustedNotificationOriginsPath = path.join(app.getPath('userData'), trustedNotificationOriginsFileName);
const trustedOriginsFs = { existsSync, readFileSync, writeFileSync };
const permissions = createPermissionController(
  loadTrustedOrigins(trustedOriginsPath, trustedOriginsFs),
  loadTrustedOrigins(trustedNotificationOriginsPath, trustedOriginsFs)
);
permissions.onTrustedChange((origins) => saveTrustedOrigins(trustedOriginsPath, origins, trustedOriginsFs));
permissions.onNotificationTrustedChange((origins) => saveTrustedOrigins(trustedNotificationOriginsPath, origins, trustedOriginsFs));
const pendingNotificationPrompts = new Map<string, Promise<boolean>>();

async function promptForWebsiteNotifications(contents: Electron.WebContents, requestingUrl: string): Promise<boolean> {
  let origin: string;
  try {
    origin = new URL(requestingUrl).origin;
  } catch {
    return false;
  }
  const pending = pendingNotificationPrompts.get(origin);
  if (pending) return pending;

  const prompt = (async () => {
    const hostContents = contents.hostWebContents ?? contents;
    const owner = BrowserWindow.fromWebContents(hostContents);
    const hostname = new URL(origin).host;
    const options: MessageBoxOptions = {
      type: 'question',
      title: 'Website notifications',
      message: `Allow ${hostname} to send desktop notifications?`,
      detail: 'An allow choice is remembered for this website. Blocking keeps notifications disabled.',
      buttons: ['Allow', 'Block'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    };
    const result = owner && !owner.isDestroyed()
      ? await dialog.showMessageBox(owner, options)
      : await dialog.showMessageBox(options);
    if (result.response !== 0) return false;
    permissions.trustNotificationOrigin(origin);
    return true;
  })();

  pendingNotificationPrompts.set(origin, prompt);
  try {
    return await prompt;
  } finally {
    if (pendingNotificationPrompts.get(origin) === prompt) pendingNotificationPrompts.delete(origin);
  }
}
let currentAssistantName = 'Nova';
let currentLocale = 'en';
const activeSessions = new Set<Session>();
const extensionManager = new ExtensionManager(app.getPath('userData'), () => Array.from(activeSessions));

import { extractUrlFromArgs } from './url-dispatch.js';
export { extractUrlFromArgs };

export function dispatchOpenUrl(targetUrl: string): void {
  openUrlLifecycle.dispatchOpenUrl(targetUrl);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow(createMainWindowOptions(mainDir));
  mainWindow = window;

  window.webContents.on('did-start-loading', () => openUrlLifecycle.onWindowLoading(window));
  window.webContents.on('did-finish-load', () => {
    // Let preload, React, and the browser tab event subscription mount first.
    setTimeout(() => openUrlLifecycle.onWindowReady(window), 350);
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  window.on('maximize', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('lastbrowser:window:maximizeChanged', true);
    }
  });

  window.on('unmaximize', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('lastbrowser:window:maximizeChanged', false);
    }
  });

  window.on('enter-full-screen', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('lastbrowser:window:fullScreenChanged', true);
    }
  });

  window.on('leave-full-screen', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('lastbrowser:window:fullScreenChanged', false);
    }
  });

  setupMinimizeToTray(window, () => {
    if (isQuitting || process.platform === 'darwin') return false;
    return true;
  });

  const rendererUrl = process.env.LASTBROWSER_RENDERER_URL;
  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    // app:// (not file://) so localStorage persists — see app-protocol.ts.
    void window.loadURL(appRendererUrl());
  }

  // Handle cold-start URL (e.g. launched by clicking link in an external app)
  const initialUrl = extractUrlFromArgs(process.argv);
  if (initialUrl) {
    dispatchOpenUrl(initialUrl);
  }
  return window;
}

const openUrlLifecycle = createOpenUrlLifecycle({
  getMainWindow: () => mainWindow,
  createMainWindow: createWindow,
  isAppReady: () => appReady
});

function broadcastAccessAuthLocked(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    try { window.webContents.send('lastbrowser:access-auth-locked'); } catch { /* Window closed during broadcast. */ }
  }
}

function registerIpc(): void {
  setAccessAuthRequiredHandler(broadcastAccessAuthLocked);
  ipcMain.handle('lastbrowser:system:getCursorPosition', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return null;
    const cursor = screen.getCursorScreenPoint();
    const content = window.getContentBounds();
    return { x: cursor.x - content.x, y: cursor.y - content.y, visible: window.isVisible() };
  });
  ipcMain.handle('lastbrowser:system:captureWindowRect', async (event, value: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed() || !value || typeof value !== 'object') return null;
    const rect = value as Record<string, unknown>;
    const numbers = [rect.x, rect.y, rect.width, rect.height].map(Number);
    if (!numbers.every(Number.isFinite) || numbers[2] <= 0 || numbers[3] <= 0) return null;
    const [contentWidth, contentHeight] = window.getContentSize();
    const width = Math.min(256, Math.round(numbers[2]), contentWidth);
    const height = Math.min(256, Math.round(numbers[3]), contentHeight);
    const x = Math.max(0, Math.min(contentWidth - width, Math.round(numbers[0])));
    const y = Math.max(0, Math.min(contentHeight - height, Math.round(numbers[1])));
    if (width <= 0 || height <= 0) return null;
    return capturePageDataUrl(() => window.webContents.capturePage({ x, y, width, height }));
  });
  ipcMain.handle('lastbrowser:system:captureGuestRect', async (event, guestWebContentsId: unknown, value: unknown) => {
    const guestId = Number(guestWebContentsId);
    if (!Number.isInteger(guestId) || guestId <= 0) return null;
    const guest = webContents.fromId(guestId);
    const rect = normalizeCapturePageRect(value);
    if (!guest || guest.isDestroyed() || !rect || !isGuestOwnedByRenderer(guest, event.sender.id)) return null;
    return capturePageDataUrl(() => guest.capturePage(rect));
  });
  ipcMain.handle('lastbrowser:system:isDefaultBrowser', () => {
    if (typeof app?.isDefaultProtocolClient !== 'function') return false;
    return app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https');
  });
  ipcMain.handle('lastbrowser:system:setDefaultBrowser', () => {
    if (typeof app?.setAsDefaultProtocolClient !== 'function') return false;
    const httpOk = app.setAsDefaultProtocolClient('http');
    const httpsOk = app.setAsDefaultProtocolClient('https');
    if (process.platform === 'win32') {
      void shell.openExternal('ms-settings:defaultapps');
    }
    return httpOk && httpsOk;
  });
  ipcMain.handle('lastbrowser:system:openExternal', (_event, url: string) => openExternalUrl(url, {
    platform: process.platform,
    shellOpenExternal: (targetUrl) => shell.openExternal(targetUrl)
  }));

  ipcMain.handle('lastbrowser:notifications:chatCompleted', (event, enabled: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !shouldNotifyChatCompletion(enabled, window.isFocused()) || !Notification.isSupported()) return false;
    new Notification(getChatCompletionNotification(currentLocale)).show();
    return true;
  });
  ipcMain.handle('lastbrowser:i18n:setLocale', (_event, locale: unknown) => {
    if (typeof locale === 'string' && locale.trim()) {
      currentLocale = locale.trim();
    }
    return true;
  });
  registerBrowserDataCleanupIpc(ipcMain, () => {
    const targets = Array.from(activeSessions);
    if (!targets.includes(session.defaultSession)) targets.push(session.defaultSession);
    return targets;
  });
  ipcMain.handle('lastbrowser:browser:clearDeletedProfileData', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, cleared: 0, error: 'Invalid browser profile cleanup request.' };
    }
    const request = payload as { profileId?: unknown; spacePaths?: unknown };
    if (typeof request.profileId !== 'string' || !Array.isArray(request.spacePaths)) {
      return { ok: false, cleared: 0, error: 'Invalid browser profile cleanup request.' };
    }
    const spacePaths = (request.spacePaths as unknown[]).filter((value): value is string => typeof value === 'string' && value.length <= 2048);
    return clearDeletedProfilePartitions(request.profileId, spacePaths, (partition) => session.fromPartition(partition));
  });
  ipcMain.handle('lastbrowser:services:status', () => services?.getStatus());
    ipcMain.handle('lastbrowser:services:start', async () => {
      try {
        await services?.start();
      } catch (error) {
        console.error('[lastbrowser] Failed to start services:', error);
      }
      return services?.getStatus();
    });
  ipcMain.handle('lastbrowser:services:stop', () => {
    services?.stop();
    return services?.getStatus();
  });
  ipcMain.handle('lastbrowser:setup:load', async () => {
    const state = await loadSetupState(app.getPath('userData'));
    if (state.botName) currentAssistantName = state.botName;
    return state;
  });
  ipcMain.handle('lastbrowser:setup:save', async (_event, state) => {
    const saved = await saveSetupState(app.getPath('userData'), state);
    if (saved.botName) currentAssistantName = saved.botName;
    return saved;
  });
  registerDefaultSidekickMigrationIpc(ipcMain, requireWebuiUrl);
  ipcMain.handle('lastbrowser:sidekick:onboardingStatus', () => getOnboardingStatus(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:applyCloudSetup', (_event, request) => applyCloudSetup(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:setDefaultModel', (_event, request) => setDefaultModel(requireWebuiUrl(), String(request?.model || '')));
  ipcMain.handle('lastbrowser:sidekick:getFallbackModel', () => getFallbackModel(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:setFallbackModel', (_event, request) => setFallbackModel(requireWebuiUrl(), {
    model: String(request?.model || ''),
    provider: request?.provider ? String(request.provider) : undefined,
    baseUrl: request?.baseUrl ? String(request.baseUrl) : undefined
  }));
  ipcMain.handle('lastbrowser:sidekick:completeCloudSetup', () => completeCloudSetup(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:startOAuth', (_event, request) => startOnboardingOAuth(requireWebuiUrl(), String(request?.provider || 'openai-codex')));
  ipcMain.handle('lastbrowser:sidekick:pollOAuth', (_event, flowId) => pollOnboardingOAuth(requireWebuiUrl(), String(flowId || '')));
  ipcMain.handle('lastbrowser:sidekick:cancelOAuth', (_event, request) => cancelOnboardingOAuth(
    requireWebuiUrl(),
    String(request?.flowId || ''),
    String(request?.provider || 'openai-codex')
  ));
  ipcMain.handle('lastbrowser:auth:openConnectWindow', (_event, url: string) => {
    openAuthConnectWindow({ url: String(url || ''), parentWindow: mainWindow });
    return true;
  });
  ipcMain.handle('lastbrowser:sidekick:requestWebui', (_event, request) => requestWebui(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:listSessions', () => listSessions(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:listSpaces', () => listSpaces(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:createSession', (_event, request) => createSidekickSession(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:getSession', (_event, request) => {
    if (typeof request === 'string') return getDesktopSession(requireWebuiUrl(), request);
    return getDesktopSession(requireWebuiUrl(), request || { sessionId: '' });
  });
  ipcMain.handle('lastbrowser:sidekick:renameSession', (_event, request) => renameSession(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:deleteSession', (_event, request) => deleteSession(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:duplicateSession', (_event, request) => duplicateSession(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getDraft', (_event, sessionId) => getSessionDraft(requireWebuiUrl(), String(sessionId || '')));
  ipcMain.handle('lastbrowser:sidekick:saveDraft', (_event, request) => saveSessionDraft(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:startChat', (_event, request) => startSidekickChat(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getStreamStatus', (_event, streamId) => getChatStreamStatus(requireWebuiUrl(), String(streamId || '')));
  // Live chat stream: subscribe over SSE and push each event to the renderer.
  // Polling `/api/chat/stream/status` on a timer costs a round-trip per tick and
  // makes the transcript feel laggy; SSE delivers each delta as it happens.
  ipcMain.handle('lastbrowser:sidekick:subscribeChatStream', (event, request) => {
    const streamId = String(request?.streamId || '');
    if (!streamId) throw new Error('streamId is required');
    chatStreams.get(streamId)?.close();
    const handle = subscribeChatStream(
      requireWebuiUrl(),
      streamId,
      getWebuiSessionToken(),
      (streamEvent) => {
        if (event.sender.isDestroyed()) return;
        event.sender.send('lastbrowser:sidekick:chatStreamEvent', { streamId, ...streamEvent });
      },
      undefined,
      getAccessAuthCookie()
    );
    chatStreams.set(streamId, handle);
    void handle.done.finally(() => {
      if (chatStreams.get(streamId) === handle) chatStreams.delete(streamId);
    });
    return { ok: true, streamId };
  });
  ipcMain.handle('lastbrowser:sidekick:unsubscribeChatStream', (_event, request) => {
    const streamId = String(request?.streamId || '');
    chatStreams.get(streamId)?.close();
    chatStreams.delete(streamId);
    return { ok: true, streamId };
  });
  ipcMain.handle('lastbrowser:sidekick:cancelStream', (_event, streamId) => cancelChatStream(requireWebuiUrl(), String(streamId || '')));
  ipcMain.handle('lastbrowser:sidekick:listWorkspace', (_event, request) => listWorkspace(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:readWorkspaceFile', (_event, request) => readWorkspaceFile(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:createWorkspaceFile', (_event, request) => createWorkspaceFile(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:saveWorkspaceFile', (_event, request) => saveWorkspaceFile(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:renameWorkspaceEntry', (_event, request) => renameWorkspaceEntry(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:createWorkspaceDirectory', (_event, request) => createWorkspaceDirectory(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:deleteWorkspaceEntry', (_event, request) => deleteWorkspaceEntry(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:addSpace', async (_event, request) => {
    const sidecar = services;
    if (!sidecar) throw new Error('Sidekick service is not available yet. Try again shortly.');
    await sidecar.start();
    return withSidekickWebuiReady(
      () => sidecar.getStatus(),
      (webuiUrl) => addSpace(webuiUrl, request)
    );
  });
  ipcMain.handle('lastbrowser:sidekick:removeSpace', (_event, request) => removeSpace(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:renameSpace', (_event, request) => renameSpace(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:reorderSpaces', (_event, request) => reorderSpaces(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:listCrons', () => listCrons(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:createCron', (_event, request) => createCron(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:updateCron', (_event, request) => updateCron(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:deleteCron', (_event, request) => deleteCron(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:runCron', (_event, request) => runCron(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:pauseCron', (_event, request) => pauseCron(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:resumeCron', (_event, request) => resumeCron(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getKanbanBoard', (_event, request) => getKanbanBoard(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:createKanbanTask', (_event, request) => createKanbanTask(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:updateKanbanTask', (_event, request) => updateKanbanTask(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:runDispatchOnce', (_event, request) => runDispatchOnce(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:getActiveDispatches', () => getActiveDispatches(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:listSkills', () => listSkills(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getSkillContent', (_event, request) => getSkillContent(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:saveSkill', (_event, request) => saveSkill(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:deleteSkill', (_event, request) => deleteSkill(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:listAgents', () => listAgents(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getActivatedAgents', () => getActivatedAgents(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getCurrentAgent', () => getCurrentAgent(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:setCurrentAgent', (_event, request) => setCurrentAgent(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getAgentSplashStatus', () => getAgentSplashStatus(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:completeAgentSplash', (_event, request) => completeAgentSplash(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:answerAgentSplashQuestion', (_event, request) => answerAgentSplashQuestion(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:getAgentStats', () => getAgentStats(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getAgentActivities', (_event, request) => getAgentActivities(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:getAgentProfiles', () => getAgentProfiles(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getAgentWorkspaces', () => getAgentWorkspaces(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getAgent', (_event, request) => getAgent(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getAgentMemory', (_event, request) => getAgentMemory(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getAgentSoul', (_event, request) => getAgentSoul(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:saveAgentProfile', (_event, request) => saveAgentProfile(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:activateAgent', (_event, request) => activateAgent(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:listAgentSessions', (_event, request) => listAgentSessions(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getAgentSession', (_event, request) => getAgentSession(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:startAgentChat', (_event, request) => startAgentChat(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:listAgentWorkspace', (_event, request) => listAgentWorkspace(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:startAgentWorkspaceProcess', (_event, request) => startAgentWorkspaceProcess(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:sendAgentWorkspaceCommand', (_event, request) => sendAgentWorkspaceCommand(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:stopAgentWorkspace', (_event, request) => stopAgentWorkspace(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:createAgent', (_event, request) => createAgent(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:updateAgent', (_event, request) => updateAgent(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:deleteAgent', (_event, request) => deleteAgent(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:startAgentWorkspaceStream', async (event, request) => {
    const sessionId = String(request?.sessionId || '');
    if (!sessionId) throw new Error('Agent workspace stream needs a session id.');
    const streamId = `agent-workspace-${sessionId}`;
    agentWorkspaceStreams.get(streamId)?.abort();
    const controller = new AbortController();
    agentWorkspaceStreams.set(streamId, controller);
    void runAgentWorkspaceStream(requireWebuiUrl(), sessionId, streamId, controller, (payload) => {
      event.sender.send('lastbrowser:sidekick:agentWorkspaceEvent', payload);
    });
    return { streamId };
  });
  ipcMain.handle('lastbrowser:sidekick:stopAgentWorkspaceStream', (_event, request) => {
    const streamId = String(request?.streamId || '');
    agentWorkspaceStreams.get(streamId)?.abort();
    agentWorkspaceStreams.delete(streamId);
    return { ok: true, streamId };
  });
  ipcMain.handle('lastbrowser:sidekick:listProfiles', () => listProfiles(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:switchProfile', (_event, request) => switchProfile(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:createProfile', (_event, request) => createProfile(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:deleteProfile', (_event, request) => deleteProfile(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getMemory', () => getMemory(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:writeMemory', (_event, request) => writeMemory(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getSupermemoryStatus', () => getSupermemoryStatus(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:listSupermemoryDocuments', () => listSupermemoryDocuments(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getSupermemoryDocument', (_event, request) => getSupermemoryDocument(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:searchSupermemory', (_event, request) => searchSupermemory(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:addSupermemoryDocument', (_event, request) => addSupermemoryDocument(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:forgetSupermemoryDocument', (_event, request) => forgetSupermemoryDocument(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:reindexSupermemory', () => reindexSupermemory(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:dumpSupermemory', () => dumpSupermemory(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:hybridMemorySearch', (_event, request) => hybridMemorySearch(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:mcp:listServers', () => listMcpServers(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:mcp:saveServers', (_event, request) => saveMcpServers(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:mcp:listTools', () => listMcpTools(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:mcp:callTool', (_event, request) => callMcpTool(requireWebuiUrl(), request || { server: '', tool: '' }));
  ipcMain.handle('lastbrowser:sidekick:getInsights', (_event, request) => getInsights(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:getWikiStatus', () => getWikiStatus(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getLogs', (_event, request) => getLogs(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:listAppstore', (_event, request) => listAppstore(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:getAppstoreUpdates', () => getAppstoreUpdates(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getAppstoreSdk', () => getAppstoreSdk(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:installAppstoreApp', (_event, request) => installAppstoreApp(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:uninstallAppstoreApp', (_event, request) => uninstallAppstoreApp(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:updateAllAppstore', () => updateAllAppstore(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:submitAppstoreApp', (_event, request) => submitAppstoreApp(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getSettings', () => getSettings(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getAccessAuthStatus', () => getAccessAuthStatus(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:loginAccessPassword', (_event, request) => loginAccessPassword(requireWebuiUrl(), String(request?.password || '')));
  ipcMain.handle('lastbrowser:sidekick:lockAccessWindows', () => {
    broadcastAccessAuthLocked();
    return { ok: true };
  });
  ipcMain.handle('lastbrowser:sidekick:saveSettings', (_event, request) => saveSettings(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:listGmailAccounts', () => listGmailAccounts(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:listGmailMessages', (_event, request) => listGmailMessages(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:readGmailMessage', (_event, request) => readGmailMessage(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:searchGmailMessages', (_event, request) => searchGmailMessages(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:listGmailFolders', () => listGmailFolders(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:summarizeGmailThread', (_event, request) => summarizeGmailThread(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:draftGmailReply', (_event, request) => draftGmailReply(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getRelatedGmailMessages', (_event, request) => getRelatedGmailMessages(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:sendGmailMessage', (_event, request) => sendGmailMessage(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:deleteGmailMessage', (_event, request) => deleteGmailMessage(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:moveGmailMessage', (_event, request) => moveGmailMessage(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:createGmailTask', (_event, request) => createGmailTask(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getDiscordGuild', () => getDiscordGuild(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:listDiscordChannels', () => listDiscordChannels(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:listDiscordRoles', () => listDiscordRoles(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getDiscordStats', () => getDiscordStats(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getDiscordMember', (_event, request) => getDiscordMember(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:getDiscordBotInfo', () => getDiscordBotInfo(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:getDiscordWarns', () => getDiscordWarns(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:listDiscordChannelsTree', () => listDiscordChannelsTree(requireWebuiUrl()));
  ipcMain.handle('lastbrowser:sidekick:listDiscordMembers', (_event, request) => listDiscordMembers(requireWebuiUrl(), request || {}));
  ipcMain.handle('lastbrowser:sidekick:listDiscordMessages', (_event, request) => listDiscordMessages(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:sendDiscordMessage', (_event, request) => sendDiscordMessage(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:warnDiscordMember', (_event, request) => warnDiscordMember(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:timeoutDiscordMember', (_event, request) => timeoutDiscordMember(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:kickDiscordMember', (_event, request) => kickDiscordMember(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:banDiscordMember', (_event, request) => banDiscordMember(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:purgeDiscordChannel', (_event, request) => purgeDiscordChannel(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:untimeoutDiscordMember', (_event, request) => untimeoutDiscordMember(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:unbanDiscordMember', (_event, request) => unbanDiscordMember(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:configureDiscord', (_event, request) => configureDiscord(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:sidekick:sendMessage', (_event, request) => sendSidekickMessage(requireWebuiUrl(), request));
  ipcMain.handle('lastbrowser:terminal:start', (_event, request) => {
    const webContents = _event.sender;
    const reqObj = typeof request === 'string' ? { cwd: request } : (request || {});
    const cwd = String(reqObj.cwd || '');
    const mode = reqObj.mode === 'tui' ? 'tui' : 'shell';
    const layout = services?.getLayout();
    const result = startTerminal(
      cwd,
      (id, data) => {
        try { webContents.send('lastbrowser:terminal:data', { id, data }); } catch (_) {}
      },
      {
        mode,
        pythonExe: layout?.pythonExe,
        sidekickDir: layout?.sidekickDir,
        cols: reqObj.cols,
        rows: reqObj.rows
      }
    );
    return result;
  });
  ipcMain.handle('lastbrowser:terminal:write', (_event, request) => writeTerminal(String(request?.id || ''), String(request?.data || '')));
  ipcMain.handle('lastbrowser:terminal:resize', (_event, request) =>
    resizeTerminal(String(request?.id || ''), Number(request?.cols || 120), Number(request?.rows || 30))
  );
  ipcMain.handle('lastbrowser:terminal:close', (_event, id) => closeTerminal(String(id || '')));
  ipcMain.handle('lastbrowser:terminal:list', () => getTerminalIds());

  // Multi-Platform Messaging Gateway Daemon handlers
  ipcMain.handle('lastbrowser:gateway:status', () => {
    return services?.getGatewayStatus() ?? { running: false, pid: null, lastError: null, startedAt: null };
  });
  ipcMain.handle('lastbrowser:gateway:start', async () => {
    const status = await services?.startGateway();
    appTray?.updateMenu();
    return status;
  });
  ipcMain.handle('lastbrowser:gateway:stop', async () => {
    const status = await services?.stopGateway();
    appTray?.updateMenu();
    return status;
  });
  ipcMain.handle('lastbrowser:gateway:restart', async () => {
    const status = await services?.restartGateway();
    appTray?.updateMenu();
    return status;
  });
  ipcMain.handle('lastbrowser:gateway:platforms', () => {
    return [
      { id: 'telegram', name: 'Telegram', protocol: 'MTProto / Bot API', icon: 'send', status: 'available' },
      { id: 'whatsapp', name: 'WhatsApp', protocol: 'Web Multi-Device & Cloud API', icon: 'message-circle', status: 'available' },
      { id: 'signal', name: 'Signal', protocol: 'Signal-CLI Daemon', icon: 'shield', status: 'available' },
      { id: 'discord', name: 'Discord', protocol: 'Gateway WebSocket v10', icon: 'message-square', status: 'available' },
      { id: 'slack', name: 'Slack', protocol: 'Socket Mode & Events API', icon: 'hash', status: 'available' },
      { id: 'matrix', name: 'Matrix', protocol: 'Matrix Client-Server API', icon: 'globe', status: 'available' },
      { id: 'bluebubbles', name: 'iMessage / Apple', protocol: 'BlueBubbles REST / Socket', icon: 'smartphone', status: 'available' },
      { id: 'homeassistant', name: 'Home Assistant', protocol: 'WebSocket & REST API', icon: 'home', status: 'available' },
      { id: 'email', name: 'Email / IMAP', protocol: 'IMAP / SMTP Relay', icon: 'mail', status: 'available' }
    ];
  });
  ipcMain.handle('lastbrowser:doctor:run', (_event, options?: { fix?: boolean }) => {
    return services?.runDoctor(options);
  });
  // Cross-Tab Context Synthesis & Intelligence (Phase 10.1 & 10.6)
  ipcMain.handle('lastbrowser:tabs:synthesizeContext', (_event, options?: TabSynthesisOptions) => {
    return synthesizeTabs(options);
  });
  ipcMain.handle('lastbrowser:tabs:extractActive', (_event, maxChars?: number) => {
    return extractActiveWebview(maxChars);
  });
  registerWindowControlIpc(
    ipcMain,
    () => mainWindow,
    (sender) => BrowserWindow.fromWebContents(sender as Electron.WebContents) ?? null
  );
  ipcMain.handle('lastbrowser:window:getStartupState', (event) => {
    const contentsId = event.sender.id;
    const transfer = detachedTabTransfers.get(contentsId);
    return {
      isDetachedWindow: detachedWindowWebContents.has(contentsId),
      transfer: transfer ? { transferId: transfer.transferId, ...transfer.payload } : null
    };
  });
  ipcMain.handle('lastbrowser:window:ackDetachedTab', async (event, transferId: string, tabId: string, guestWebContentsId?: number) => {
    const transfer = detachedTabTransfers.get(event.sender.id);
    if (!transfer || transfer.transferId !== transferId || transfer.payload.tab?.id !== tabId) return false;
    const destinationGuest = typeof guestWebContentsId === 'number' && Number.isInteger(guestWebContentsId)
      ? webContents.fromId(guestWebContentsId)
      : undefined;
    if (!destinationGuest || !isGuestOwnedByRenderer(destinationGuest, event.sender.id)) return false;
    const acknowledgePromise = transfer.acknowledgePromise ?? (async () => {
      let restored = false;
      try {
        if (transfer.payload.navigationHistory) {
          restored = await (transfer.historyRestorePromise
            ?? restoreDetachedNavigationHistory(destinationGuest, transfer.payload.navigationHistory));
        }
      } catch (error) {
        console.warn('[lastbrowser] Could not restore detached tab navigation history:', error);
      }
      const pageReady = await ensureDetachedPageReady(restored, async () => {
        if (!transfer.payload.tab?.url) throw new Error('Detached tab has no fallback URL.');
        await destinationGuest.loadURL(transfer.payload.tab.url);
      });
      if (!pageReady) {
        console.warn('[lastbrowser] Could not load detached tab after history restoration failed.');
        return false;
      }
      // The window may have closed while Chromium was restoring the page.
      if (detachedTabTransfers.get(event.sender.id) !== transfer) return false;
      clearTimeout(transfer.timeout);
      detachedTabTransfers.delete(event.sender.id);
      transfer.resolve(true);
      return true;
    })();
    transfer.acknowledgePromise = acknowledgePromise;
    const restored = await acknowledgePromise;
    if (!restored && detachedTabTransfers.get(event.sender.id) === transfer) {
      transfer.acknowledgePromise = undefined;
    }
    return restored;
  });
  ipcMain.handle('lastbrowser:window:detachTab', async (event, rawPayload: unknown) => {
    const payload = parseDetachTabPayload(rawPayload);
    if (!payload) {
      return { success: false, error: 'A tab with an id and URL, a source webview, and valid screen coordinates are required.' };
    }
    const sourceGuest = webContents.fromId(payload.guestWebContentsId);
    if (!sourceGuest || !isGuestOwnedByRenderer(sourceGuest, event.sender.id)) {
      return { success: false, error: 'The source webview does not belong to this browser window.' };
    }
    // Never inspect a guest webContents until ownership has been established.
    const navigationHistory = serializeNavigationHistory(sourceGuest.navigationHistory);
    const requestKey = detachRequestKey(event.sender.id, payload.tab.id);
    return pendingTabDetaches.run(requestKey, async () => {
      let newWin: BrowserWindow | null = null;
      try {
        const targetDisplay = screen.getDisplayNearestPoint({ x: payload.screenX, y: payload.screenY });
        const workArea = targetDisplay.workArea;
        const width = Math.min(1440, Math.max(900, Math.round(workArea.width * 0.85)));
        const height = Math.min(920, Math.max(600, Math.round(workArea.height * 0.85)));
        const x = Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, payload.screenX - 100));
        const y = Math.max(workArea.y, Math.min(workArea.y + workArea.height - height, payload.screenY - 30));

        const detachedWindow = new BrowserWindow({
          ...createMainWindowOptions(mainDir),
          x,
          y,
          width,
          height
        });
        newWin = detachedWindow;

        secondaryWindows.add(detachedWindow);
        detachedWindowWebContents.add(detachedWindow.webContents.id);
        let resolveTransfer!: (acknowledged: boolean) => void;
        const acknowledged = new Promise<boolean>((resolve) => { resolveTransfer = resolve; });
        const contentsId = detachedWindow.webContents.id;
        const transferId = randomUUID();
        const timeout = setTimeout(() => {
          detachedTabTransfers.delete(contentsId);
          resolveTransfer(false);
        }, 20_000);
        detachedTabTransfers.set(contentsId, {
          transferId,
          payload: { tab: payload.tab, spacePath: payload.spacePath, navigationHistory },
          resolve: resolveTransfer,
          timeout
        });
        detachedWindow.webContents.on('will-attach-webview', (_event, _webPreferences, params) => {
          const transfer = detachedTabTransfers.get(contentsId);
          if (transfer?.payload.navigationHistory && params.src === transfer.payload.tab.url) {
            // Give the guest a valid attachment without committing its first
            // navigation. did-attach-webview restores the snapshot before the
            // transferred page creates its first history entry.
            params.src = 'about:blank';
          }
        });
        detachedWindow.webContents.on('did-attach-webview', (_event, guest) => {
          const transfer = detachedTabTransfers.get(contentsId);
          if (!transfer?.payload.navigationHistory || transfer.historyRestorePromise
            || !isGuestOwnedByRenderer(guest, contentsId)) return;
          transfer.historyRestorePromise = restoreDetachedNavigationHistory(guest, transfer.payload.navigationHistory).catch((error) => {
            console.warn('[lastbrowser] Could not restore detached tab navigation history:', error);
            return false;
          });
        });
        detachedWindow.on('closed', () => {
          secondaryWindows.delete(detachedWindow);
          detachedWindowWebContents.delete(contentsId);
          const pending = detachedTabTransfers.get(contentsId);
          if (pending) {
            clearTimeout(pending.timeout);
            detachedTabTransfers.delete(contentsId);
            pending.resolve(false);
          }
        });

        setupMinimizeToTray(detachedWindow, () => {
          if (isQuitting || process.platform === 'darwin') return false;
          return true;
        });

        const rendererUrl = process.env.LASTBROWSER_RENDERER_URL;
        await detachedWindow.loadURL(rendererUrl || appRendererUrl());
        if (!await acknowledged) {
          // Detached windows minimize to tray on close. A failed transfer must
          // never leave a hidden orphan window that looks like a successful drop.
          if (!detachedWindow.isDestroyed()) detachedWindow.destroy();
          return { success: false, error: 'The new window did not confirm the tab transfer.' };
        }
        return { success: true, windowId: detachedWindow.id };
      } catch (err) {
        if (newWin && !newWin.isDestroyed()) {
          const contentsId = newWin.webContents.id;
          const pending = detachedTabTransfers.get(contentsId);
          if (pending) {
            clearTimeout(pending.timeout);
            detachedTabTransfers.delete(contentsId);
            pending.resolve(false);
          }
          detachedWindowWebContents.delete(contentsId);
          newWin.destroy();
        }
        console.error('[lastbrowser] Failed to detach tab to window:', err);
        return { success: false, error: String(err) };
      }
    });
  });

  ipcMain.handle('lastbrowser:window:getDisplays', () => {
    try {
      return screen.getAllDisplays().map((d) => ({
        id: d.id,
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor
      }));
    } catch {
      return [];
    }
  });
  registerUpdateIpc(() => mainWindow);
  ipcMain.handle('lastbrowser:adblock:status', () => adblock.getStatus());
  ipcMain.handle('lastbrowser:adblock:setEnabled', (_event, enabled: unknown) => {
    adblock.setEnabled(enabled !== false);
    return adblock.getStatus();
  });
  // Download tracking: the renderer polls the list and gets pushed updates.
  ipcMain.handle('lastbrowser:downloads:list', () => downloads.list());
  ipcMain.handle('lastbrowser:downloads:cancel', (_event, id: unknown) => {
    const target = String(id || '');
    return target ? downloads.cancel(target) : false;
  });
  ipcMain.handle('lastbrowser:downloads:clear', (_event, id: unknown) => {
    const target = String(id || '');
    if (target) downloads.clear(target);
    else downloads.clearFinished();
    return downloads.list();
  });
    downloads.subscribe((entries) => {
        broadcastDownloadSnapshot(BrowserWindow.getAllWindows(), entries);
    });
  // Per-site permission trust: the renderer lists trusted origins and can add
  // or revoke one. Without this the deny-by-default policy would be unusable —
  // a video-call site could never be allowed to use the camera.
  ipcMain.handle('lastbrowser:permissions:trustedOrigins', () => permissions.trustedOrigins());
  ipcMain.handle('lastbrowser:permissions:trust', (_event, origin: unknown) => {
    permissions.trustOrigin(String(origin || ''));
    return permissions.trustedOrigins();
  });
  ipcMain.handle('lastbrowser:permissions:revoke', (_event, origin: unknown) => {
    permissions.revokeOrigin(String(origin || ''));
    permissions.revokeNotificationOrigin(String(origin || ''));
    return permissions.trustedOrigins();
  });
  ipcMain.handle('lastbrowser:permissions:notificationOrigins', () => permissions.notificationOrigins());
  ipcMain.handle('lastbrowser:permissions:revokeNotifications', (_event, origin: unknown) => {
    permissions.revokeNotificationOrigin(String(origin || ''));
    return permissions.notificationOrigins();
  });
  ipcMain.handle('lastbrowser:permissions:decide', (_event, request: unknown) => {
    const payload = (request || {}) as { permission?: string; origin?: string };
    return permissions.decide(String(payload.permission || ''), String(payload.origin || ''));
  });
  ipcMain.handle('lastbrowser:sidekick-update:status', () => sidekickUpdater.getStatus());
  ipcMain.handle('lastbrowser:sidekick-update:check', () => sidekickUpdater.check());
  ipcMain.handle('lastbrowser:sidekick-update:apply', () => sidekickUpdater.apply());
  ipcMain.handle('lastbrowser:extensions:list', () => extensionManager.list());
  ipcMain.handle('lastbrowser:extensions:presets', () => extensionManager.getPresets());
  ipcMain.handle('lastbrowser:extensions:installUnpacked', async (_event, dirPath: unknown) => {
    return extensionManager.installFromDirectory(String(dirPath || ''));
  });
  ipcMain.handle('lastbrowser:extensions:installCws', async (_event, idOrUrl: unknown) => {
    return extensionManager.installFromCws(String(idOrUrl || ''));
  });
  ipcMain.handle('lastbrowser:extensions:toggle', async (_event, request: unknown) => {
    const payload = (request || {}) as { id?: string; enabled?: boolean };
    return extensionManager.toggle(String(payload.id || ''), Boolean(payload.enabled));
  });
  ipcMain.handle('lastbrowser:extensions:toggleIncognito', async (_event, request: unknown) => {
    const payload = (request || {}) as { id?: string; allow?: boolean };
    return extensionManager.toggleIncognito(String(payload.id || ''), Boolean(payload.allow));
  });
  ipcMain.handle('lastbrowser:extensions:remove', async (_event, id: unknown) => {
    return extensionManager.remove(String(id || ''));
  });
  ipcMain.handle('lastbrowser:extensions:chooseDir', async () => {
    return extensionManager.chooseDirectory(mainWindow || undefined);
  });
  ipcMain.handle('lastbrowser:cdp:getPreference', async () => ({
    enabled: loadCdpPreference(app.getPath('userData')).enabled,
    active: isCdpEnabled()
  }));
  ipcMain.handle('lastbrowser:cdp:savePreference', async (_event, value: unknown) => {
    if (!value || typeof value !== 'object' || typeof (value as { enabled?: unknown }).enabled !== 'boolean') {
      return { ok: false, error: 'A boolean enabled value is required.' };
    }
    const saved = saveCdpPreference(app.getPath('userData'), { enabled: (value as { enabled: boolean }).enabled });
    return { ok: true, enabled: saved.enabled, active: isCdpEnabled(), restartRequired: saved.enabled !== isCdpEnabled() };
  });
  ipcMain.handle('lastbrowser:cdp:restart', async () => {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });
  ipcMain.handle('lastbrowser:cdp:status', async () => {
    if (!isCdpEnabled()) {
      return { available: false, enabled: false, port: null, url: null, wsUrl: null, browser: null };
    }
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      const data = (await res.json()) as { webSocketDebuggerUrl?: string; Browser?: string };
      return {
        available: true,
        enabled: true,
        port: cdpPort,
        url: `http://127.0.0.1:${cdpPort}`,
        wsUrl: data.webSocketDebuggerUrl ?? null,
        browser: data.Browser ?? null
      };
    } catch {
      return {
        available: false,
        enabled: true,
        port: cdpPort,
        url: `http://127.0.0.1:${cdpPort}`,
        wsUrl: null,
        browser: null
      };
    }
  });
  ipcMain.handle('lastbrowser:cdp:execute', async (_event, request: unknown) => {
    if (!isCdpEnabled()) return { ok: false, error: 'CDP debugging is disabled.' };
    const payload = (request || {}) as { targetUrl?: string; method?: string; params?: Record<string, unknown> };
    try {
      const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = (await listRes.json()) as Array<{ id: string; url: string; webSocketDebuggerUrl?: string; type: string }>;
      const guestTarget = payload.targetUrl
        ? targets.find((t) => t.url.includes(payload.targetUrl!))
        : targets.find((t) => t.type === 'webview' || (t.type === 'page' && !t.url.includes('index.html')));

      return {
        ok: true,
        targetsCount: targets.length,
        matchedTarget: guestTarget ? { id: guestTarget.id, url: guestTarget.url } : null
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

async function runAgentWorkspaceStream(
  webuiUrl: string,
  sessionId: string,
  streamId: string,
  controller: AbortController,
  emit: (payload: Record<string, unknown>) => void
): Promise<void> {
  try {
    const endpoint = new URL(`/api/agents/workspace/stream/${encodeURIComponent(sessionId)}`, webuiUrl).toString();
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || '';
      for (const part of parts) {
        const data = part
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (!data) continue;
        emit({
          streamId,
          sessionId,
          event: JSON.parse(data)
        });
      }
    }
    emit({ streamId, sessionId, event: { type: 'closed' } });
  } catch (error) {
    if (!controller.signal.aborted) {
      emit({
        streamId,
        sessionId,
        event: { type: 'error', message: error instanceof Error ? error.message : String(error) }
      });
    }
  } finally {
    agentWorkspaceStreams.delete(streamId);
  }
}

function requireWebuiUrl(): string {
  const status = services?.getStatus();
  if (!status?.webuiUrl) throw new Error('Sidekick service is not ready yet.');
  return status.webuiUrl;
}

/**
 * Authenticate against the sidecar when it requires a password.
 *
 * The shell owns the sidecar process, so it can pass the password in the
 * environment and log in once. Without this, every native panel call fails
 * with HTTP 401 as soon as the user enables WebUI auth.
 */
async function ensureSidecarAuth(): Promise<void> {
  try {
    const status = services?.getStatus();
    if (!status?.webuiUrl) return;
    const password = process.env.SIDEKICK_WEBUI_PASSWORD || process.env.HERMES_WEBUI_PASSWORD || '';
    await ensureWebuiAuth(status.webuiUrl, password);
  } catch {
    // Auth is optional — a failure must not block the shell.
  }
}

export const cdpPort = resolveCdpPort();
if (isCdpEnabled() && !process.argv.some((a) => a.startsWith('--remote-debugging-port'))) {
  app.commandLine.appendSwitch('remote-debugging-port', String(cdpPort));
}
// Disable AutomationControlled blink feature to prevent navigator.webdriver = true
// so Google / Gmail BotGuard does not block sign-in with "Dieser Browser oder diese App ist unter Umständen nicht sicher".
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Enable Widevine DRM feature flag in Chromium
app.commandLine.appendSwitch('enable-features', 'WidevineCdm');

app.setName('Lastbrowser');

// Enforce single instance lock: prevent port collisions and handle incoming external URLs
const gotSingleInstanceLock = typeof app?.requestSingleInstanceLock === 'function' ? app.requestSingleInstanceLock() : true;
if (gotSingleInstanceLock && typeof app?.on === 'function') {
  app.on('open-url', (event, url) => {
    openUrlLifecycle.handleOpenUrl(event, url);
  });
  app.on('second-instance', (_event, commandLine) => {
    openUrlLifecycle.handleSecondInstance(commandLine);
  });
}

// Auto-detect and register system Widevine CDM before app is ready (Ansatz 3)
configureDrmWidevine(app);

// Strip Electron and Lastbrowser tokens from default User-Agent to avoid Google
// disallowed_useragent, Disney+ login block, and DRM playback rejections.
if (app.userAgentFallback) {
  app.userAgentFallback = cleanOAuthUserAgent(app.userAgentFallback);
}

// A secondary process must not continue into service/window initialization even
// if Electron resolves whenReady after the initial quit request.
startPrimaryInstanceStartup(gotSingleInstanceLock, registerAppScheme, () => app.whenReady(), async () => {
  // Initialize native Widevine CDM if running under Castlabs Electron
  await initializeCastlabsWidevine();

  // Register Lastbrowser as protocol client for standard web links
  if (typeof app?.isDefaultProtocolClient === 'function') {
    if (!app.isDefaultProtocolClient('http')) {
      app.setAsDefaultProtocolClient('http');
    }
    if (!app.isDefaultProtocolClient('https')) {
      app.setAsDefaultProtocolClient('https');
    }
  }

  // Serve the renderer over app:// so localStorage/IndexedDB persist to disk.
  // Under file:// Chromium uses an opaque origin and every setting is lost on
  // restart (verified: tabs, bookmarks and history all vanished).
  installAppProtocolHandler(path.join(mainDir, '..', 'renderer'));
  installBrowserChrome(Menu);
  registerBrowserContextMenu({
    app,
    Menu,
    clipboard,
    shell,
    getWindow: () => mainWindow,
    getAssistantName: () => currentAssistantName,
    getLocale: () => currentLocale
  });
  registerBrowserShortcuts({
    app,
    getWindow: () => mainWindow
  });
  services = new SidecarServices(resolveServiceLayout(appResourcesDir()));
  void services.start().then(() => ensureSidecarAuth());
  registerIpc();
  appReady = true;
  createWindow();
  startAutoUpdateChecks();
  attachSessionHandlers(session.defaultSession);
  void extensionManager.init();
  appTray = createAppTray({
    getMainWindow: () => mainWindow,
    getWindows: () => BrowserWindow.getAllWindows(),
    getServices: () => services,
    resourcesDir: appResourcesDir(),
    onQuit: () => {
      isQuitting = true;
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}, () => app.quit());

function attachSessionHandlers(targetSession: Session): void {
  activeSessions.add(targetSession);
  const currentUa = targetSession.getUserAgent();
  if (currentUa) {
    targetSession.setUserAgent(cleanOAuthUserAgent(currentUa));
  }
  // Sanitize outgoing request headers: clean User-Agent and remove Electron tokens from Sec-CH-UA
  // client hints so Google Accounts / Gmail BotGuard, Disney+, and streaming providers recognize
  // standard Chrome client hints instead of rejecting embedded webviews.
  targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    for (const key of Object.keys(requestHeaders)) {
      const lower = key.toLowerCase();
      if (lower === 'user-agent') {
        requestHeaders[key] = cleanOAuthUserAgent(requestHeaders[key]);
      } else if (lower === 'sec-ch-ua') {
        requestHeaders[key] = sanitizeSecChUa(requestHeaders[key]);
      } else if (lower === 'sec-ch-ua-full-version-list') {
        requestHeaders[key] = sanitizeSecChUa(requestHeaders[key]);
      }
    }
    callback({ requestHeaders });
  });

  // Strip X-Frame-Options and CSP frame-ancestors from streaming service login pages.
  // Disney+ (sso.id.bamgrid.com), Amazon, HBO/Max and others send these headers to
  // prevent embedding — but Electron interprets them the same way a browser does and
  // refuses to load the page inside the webview, resulting in a blank login screen.
  // We remove those headers only for known streaming identity provider origins so
  // normal same-origin protections remain in place for all other sites.
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isStreamingLoginUrl(details.url)) {
      callback({});
      return;
    }
    const responseHeaders = { ...details.responseHeaders };
    for (const key of Object.keys(responseHeaders)) {
      const lower = key.toLowerCase();
      if (lower === 'x-frame-options') {
        delete responseHeaders[key];
      } else if (lower === 'content-security-policy' || lower === 'content-security-policy-report-only') {
        // Remove only the frame-ancestors directive; keep everything else intact.
        responseHeaders[key] = responseHeaders[key].map((v: string) =>
          v.replace(/frame-ancestors[^;]*(;|$)/gi, '').trim()
        );
      }
    }
    callback({ responseHeaders });
  });

  void adblock.attach(targetSession);
  downloads.attach(targetSession, process.env.LASTBROWSER_DOWNLOADS_DIR || app.getPath('downloads'));
  const isIncognito = (targetSession as unknown as { isInMemory?: () => boolean }).isInMemory?.() ?? false;
  void extensionManager.attachToSession(targetSession, isIncognito);
  // Deny-by-default with whitelist (permissions.ts): Electron grants every permission silently
  // otherwise, which would hand any website the camera, microphone, and location.
  targetSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const requestingUrl = String((details as { requestingUrl?: string })?.requestingUrl || '');
    if (permission === 'notifications') {
      const isMainFrame = (details as { isMainFrame?: boolean })?.isMainFrame === true;
      void resolvePermissionRequest(permissions, permission, isMainFrame, requestingUrl,
        (origin) => promptForWebsiteNotifications(_contents, origin))
        .then(callback)
        .catch((error) => {
          console.warn('[permissions] Website notification prompt failed:', error);
          callback(false);
        });
      return;
    }
    callback(permissions.decide(String(permission), requestingUrl) === 'allow');
  });
  targetSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return permissions.decide(String(permission), String(requestingOrigin || '')) === 'allow';
  });
}

// Ensure every webContents (including guest webviews) uses clean User-Agent without Electron tokens
app.on('web-contents-created', (_event, contents) => {
  // Shell windows are privileged renderers and host remote browser WebViews.
  // Harden guest preferences before any renderer-controlled attachment. This
  // policy intentionally leaves src/partition/plugins alone; the detached-tab
  // handler below may still set src to about:blank during history restoration.
  if (contents.getType() === 'window') {
    contents.on('will-attach-webview', (_attachEvent, webPreferences, params) => {
      hardenWebViewAttachment(
        webPreferences as unknown as Record<string, unknown>,
        params as Record<string, unknown>
      );
    });
  }
  try {
    const ua = contents.getUserAgent?.();
    if (ua) {
      contents.setUserAgent(cleanOAuthUserAgent(ua));
    }
  } catch {}
});

// Attach ad blocking, download tracking and permission handling to every
// browser session (webviews use per-profile `persist:` partitions, so each
// profile gets its own).
app.on('session-created', (sess) => {
  // Only attach browser features to persistent profile sessions or incognito webviews.
  // Utility partitions (like electron-updater) have no storagePath and must not be polluted.
  if (!sess.storagePath && !(sess as unknown as { isInMemory?: () => boolean }).isInMemory?.()) {
    return;
  }
  attachSessionHandlers(sess);
});

function cleanupServices(): void {
  try {
    for (const controller of agentWorkspaceStreams.values()) controller.abort();
    agentWorkspaceStreams.clear();
  } catch {}
  try {
    closeAllTerminals();
  } catch {}
  try {
    services?.stop();
  } catch {}
}

app.on('before-quit', () => {
  isQuitting = true;
  try { appTray?.destroy(); } catch {}
  cleanupServices();
});

app.on('will-quit', () => {
  cleanupServices();
});

const handleTerminationSignal = () => {
  if (isQuitting) return;
  isQuitting = true;
  cleanupServices();
  if (typeof app?.quit === 'function') {
    app.quit();
  }
};

process.on('SIGINT', handleTerminationSignal);
process.on('SIGTERM', handleTerminationSignal);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
