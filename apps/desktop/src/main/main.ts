import path from 'node:path';
import { app, BrowserWindow, clipboard, ipcMain, Menu, shell } from 'electron';
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
  listWorkspace,
  moveGmailMessage,
  pauseCron,
  pollOnboardingOAuth,
  purgeDiscordChannel,
  readGmailMessage,
  readWorkspaceFile,
  removeSpace,
  requestWebui,
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
import { createDownloadTracker } from './downloads.js';
import { registerWindowControlIpc } from './window-controls.js';
import { startTerminal, writeTerminal, closeTerminal, getTerminalIds } from './terminal-process.js';
import { createMainWindowOptions, installBrowserChrome } from './window-chrome.js';
import { registerBrowserContextMenu } from './browser-context-menu.js';

const mainDir = moduleDirname(import.meta.url);
let mainWindow: BrowserWindow | null = null;
let services: SidecarServices | null = null;
const adblock = createAdblockController();
const sidekickUpdater = createSidekickUpdater({
  // After a successful Sidekick update, restart the sidecar so the new code
  // is loaded. The layout is re-resolved so the runtime copy is picked up.
  onInstalled: async () => {
    if (!services) return;
    services.stop();
    services = new SidecarServices(resolveServiceLayout(appResourcesDir()));
    await services.start();
  }
});
const agentWorkspaceStreams = new Map<string, AbortController>();
const chatStreams = new Map<string, ChatStreamHandle>();
const downloads = createDownloadTracker();

function createWindow(): void {
  mainWindow = new BrowserWindow(createMainWindowOptions(mainDir));

  const rendererUrl = process.env.LASTBROWSER_RENDERER_URL;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.join(mainDir, '..', 'renderer', 'index.html'));
  }
}

function registerIpc(): void {
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
  ipcMain.handle('lastbrowser:setup:load', () => loadSetupState(app.getPath('userData')));
  ipcMain.handle('lastbrowser:setup:save', (_event, state) => saveSetupState(app.getPath('userData'), state));
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
      }
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
  ipcMain.handle('lastbrowser:sidekick:addSpace', (_event, request) => addSpace(requireWebuiUrl(), request));
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
  ipcMain.handle('lastbrowser:sidekick:hybridMemorySearch', (_event, request) => hybridMemorySearch(requireWebuiUrl(), request));
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
  ipcMain.handle('lastbrowser:terminal:start', (_event, cwd) => {
    const webContents = _event.sender;
    const result = startTerminal(String(cwd || ''), (id, data) => {
      try { webContents.send('lastbrowser:terminal:data', { id, data }); } catch (_) {}
    });
    return result;
  });
  ipcMain.handle('lastbrowser:terminal:write', (_event, request) => writeTerminal(String(request?.id || ''), String(request?.data || '')));
  ipcMain.handle('lastbrowser:terminal:close', (_event, id) => closeTerminal(String(id || '')));
  ipcMain.handle('lastbrowser:terminal:list', () => getTerminalIds());
  registerWindowControlIpc(ipcMain, () => mainWindow);
  registerUpdateIpc(() => mainWindow);
  ipcMain.handle('lastbrowser:adblock:status', () => adblock.getStatus());
  ipcMain.handle('lastbrowser:adblock:setEnabled', (_event, enabled: unknown) => {
    adblock.setEnabled(enabled !== false);
    return adblock.getStatus();
  });
  // Download tracking: the renderer polls the list and gets pushed updates.
  ipcMain.handle('lastbrowser:downloads:list', () => downloads.list());
  ipcMain.handle('lastbrowser:downloads:clear', (_event, id: unknown) => {
    const target = String(id || '');
    if (target) downloads.clear(target);
    else downloads.clearFinished();
    return downloads.list();
  });
  downloads.subscribe((entries) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lastbrowser:downloads:changed', entries);
    }
  });
  ipcMain.handle('lastbrowser:sidekick-update:status', () => sidekickUpdater.getStatus());
  ipcMain.handle('lastbrowser:sidekick-update:check', () => sidekickUpdater.check());
  ipcMain.handle('lastbrowser:sidekick-update:apply', () => sidekickUpdater.apply());
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

app.setName('Lastbrowser');
app.whenReady().then(() => {
  installBrowserChrome(Menu);
  registerBrowserContextMenu({
    app,
    Menu,
    clipboard,
    shell,
    getWindow: () => mainWindow
  });
  services = new SidecarServices(resolveServiceLayout(appResourcesDir()));
  void services.start().then(() => ensureSidecarAuth());
  registerIpc();
  createWindow();
  startAutoUpdateChecks();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Attach ad blocking and download tracking to every browser session (webviews
// use per-profile `persist:` partitions, so each profile gets its own).
app.on('session-created', (session) => {
  void adblock.attach(session);
  downloads.attach(session);
});

app.on('before-quit', () => {
  for (const controller of agentWorkspaceStreams.values()) controller.abort();
  agentWorkspaceStreams.clear();
  services?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
