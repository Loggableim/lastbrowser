import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readRendererFile(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

function cssBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1];
}

describe('browser shell layout', () => {
  it('uses the WebUI-style shell grid with expanded CD navigation', () => {
    const css = readRendererFile('styles.css');
    const appShell = cssBlock(css, '.app-shell');
    const workspace = cssBlock(css, '.workspace');
    const browserPane = cssBlock(css, '.browser-main');
    const browserView = cssBlock(css, '.browser-view');
    const browserPageMain = cssBlock(css, '.browser-main.browser-page-main');
    const browserWebviewFrame = cssBlock(css, '.browser-main.browser-page-main > .browser-webview-frame');
    const aiBrowserMain = cssBlock(css, '.ai-browser-main');
    const browserStartPage = cssBlock(css, '.browser-start-page');
    const browserCanvas = cssBlock(css, '.panel-browser .browser-main');
    const railCollapsed = cssBlock(css, '.workspace.left-collapsed');
    const contextCollapsed = cssBlock(css, '.workspace.context-collapsed');
    const sidebarHandle = cssBlock(css, '.sidebar-resize-handle');

    expect(appShell).toContain('grid-template-rows: 34px auto minmax(0, 1fr)');
    expect(workspace).toContain('grid-template-rows: minmax(0, 1fr)');
    expect(workspace).toContain('height: 100%');
    expect(workspace).toContain('--left-rail-width: 168px');
    expect(workspace).toContain('--context-sidebar-width: 280px');
    expect(workspace).toContain('--workspace-panel-width: 320px');
    expect(workspace).toContain('grid-template-columns: var(--left-rail-width) var(--context-sidebar-width) minmax(0, 1fr) var(--workspace-panel-width)');
    expect(workspace).toContain('overflow: hidden');
    expect(railCollapsed).toContain('--left-rail-width: 48px');
    expect(contextCollapsed).toContain('--context-sidebar-width: 44px');
    expect(css).not.toContain('.workspace.with-sidekick');
    expect(css).not.toContain('410px');
    expect(browserPane).toContain('display: flex');
    expect(browserPane).toContain('height: 100%');
    expect(browserPane).toContain('overflow: hidden');
    expect(browserPageMain).toContain('display: block');
    expect(browserPageMain).toContain('position: relative');
    expect(browserPageMain).toContain('min-height: 0');
    expect(browserPageMain).toContain('height: 100%');
    expect(browserPageMain).toContain('padding: 0');
    expect(browserWebviewFrame).toContain('position: absolute');
    expect(browserWebviewFrame).toContain('inset: 0');
    expect(browserWebviewFrame).toContain('display: block');
    expect(browserWebviewFrame).toContain('height: 100%');
    expect(browserWebviewFrame).toContain('min-height: 0');
    expect(browserWebviewFrame).toContain('overflow: hidden');
    expect(aiBrowserMain).toContain('overflow: auto');
    expect(browserStartPage).toContain('overflow: auto');
    expect(browserStartPage).toContain('background');
    expect(browserCanvas).toContain('background: #07111f');
    expect(sidebarHandle).toContain('position: absolute');
    expect(sidebarHandle).toContain('cursor: col-resize');
    expect(browserView).toContain('position: absolute');
    expect(browserView).toContain('inset: 0');
    expect(browserView).toContain('height: 100%');
  });

  it('renders visited websites inside a full-height browser webview frame', () => {
    const source = readRendererFile('App.tsx');

    expect(source).toContain('className="browser-main browser-page-main"');
    expect(source).toContain('className="browser-webview-frame"');
    expect(source).toContain('onDidStartLoading={() => onClearBrowserError()}');
    expect(source).toContain('onDidFailLoad={(event) => {');
  });

  it('renders native bookmark controls in the browser chrome', () => {
    const source = readRendererFile('App.tsx');
    const css = readRendererFile('styles.css');

    expect(source).toContain('<BookmarkBar');
    expect(source).toContain('toggleActiveBookmark');
    expect(source).toContain('bookmarks={bookmarks}');
    expect(source).toContain('onRemove={removeBookmarkItem}');
    expect(css).toContain('.bookmark-bar');
    expect(css).toContain('.bookmark-item');
    expect(css).toContain('.bookmark-star.active');
  });

  it('keeps chat developer tools and raw prompts behind an explicit toggle', () => {
    const source = readRendererFile('App.tsx');
    const helper = readRendererFile('chat-display.ts');
    const css = readRendererFile('styles.css');

    expect(source).toContain('showDeveloperTools');
    expect(source).toContain('showDeveloperTools && (');
    expect(source).toContain('partitionChatMessages');
    expect(source).toContain('chat-developer-panel');
    expect(source).toContain('ChatMessageBody');
    expect(source).toContain('AdvancedWebUiTools panel="chat" serviceStatus={serviceStatus} compact');
    expect(helper).toContain('summarizeInternalPrompt');
    expect(helper).toContain('describeChatContent');
    expect(helper).toContain('isInternalPromptText');
    expect(css).toContain('.chat-structured-header');
    expect(css).toContain('.chat-developer-panel');
  });

  it('only shows Gmail and Discord in the rail after the appstore marks them installed', () => {
    const source = readRendererFile('App.tsx');
    const shellState = readRendererFile('shell-state.ts');
    const appstore = readRendererFile('panels/NativeRestPanels.tsx');

    expect(source).toContain('installedSidebarApps');
    expect(source).toContain('setInstalledSidebarApps');
    expect(source).toContain('isInstalledSidebarApp(panel.id, installedSidebarApps)');
    expect(source).toContain('onInstalledSidebarApp');
    expect(source).toContain('onUninstalledSidebarApp');
    expect(shellState).toContain('installedSidebarAppsStorageKey');
    expect(shellState).toContain('loadInstalledSidebarApps');
    expect(shellState).toContain('saveInstalledSidebarApps');
    expect(appstore).toContain('sidebarAppPanelForApp');
  });

  it('binds webview navigation and title events to the tab that owns the webview', () => {
    const source = readRendererFile('App.tsx');

    expect(source).toContain('function updateUrl(tabId: string, url: string): void');
    expect(source).toContain('function updateTitle(tabId: string, title: string): void');
    expect(source).toContain('onWebviewNavigate(activeTab.id, event.url)');
    expect(source).toContain('onWebviewTitle(activeTab.id, event.title)');
    expect(source).toContain('hideWebviewScrollbars(event.currentTarget)');
    expect(source).not.toContain('annotateWebviewViewport');
  });

  it('renders visited websites in an absolute full-bleed browser viewport', () => {
    const source = readRendererFile('App.tsx');
    const css = readRendererFile('styles.css');

    expect(source).toContain('const browserWebviewStyle = {');
    expect(source).toContain("height: '100%'");
    expect(source).toContain('style={browserWebviewStyle}');
    expect(source).not.toContain('useBrowserViewportHeight(');

    const pageMain = cssBlock(css, '.browser-main.browser-page-main');
    const frame = cssBlock(css, '.browser-main.browser-page-main > .browser-webview-frame');
    const actionStrip = cssBlock(css, '.browser-main.browser-page-main > .browser-action-strip');

    expect(pageMain).toContain('display: block');
    expect(pageMain).toContain('height: 100%');
    expect(pageMain).toContain('overflow: hidden');
    expect(frame).toContain('position: absolute');
    expect(frame).toContain('inset: 0');
    expect(frame).toContain('height: 100%');
    expect(actionStrip).toContain('position: absolute');
    expect(actionStrip).toContain('z-index: 6');
  });

  it('renders rail, context sidebar, central browser, and workspace panel together', () => {
    const source = readRendererFile('App.tsx');

    expect(source).toContain('<ShellRail');
    expect(source).toContain('<ContextSidebar');
    expect(source).toContain('onPanel={setActivePanel}');
    expect(source).toContain('contextSidebarCollapsed');
    expect(source).toContain('<BrowserMain');
    expect(source).toContain('<NativeBrowserStartPage');
    expect(source).toContain('<WorkspacePanel');
    expect(source).toContain('<SpaceSelector');
    expect(source).toContain('<NativeChatMain');
    expect(source).toContain('<NativeTasksMain');
    expect(source).toContain('<NativeKanbanMain');
    expect(source).toContain('<NativeTodosMain');
    expect(source).toContain('<NativeSkillsMain');
    expect(source).toContain('<NativeAgentsMain');
    expect(source).toContain('<NativeProfilesMain');
    expect(source).toContain('<NativeMemoryMain');
    expect(source).toContain('<NativeInsightsMain');
    expect(source).toContain('<NativeLogsMain');
    expect(source).toContain('<NativeGmailMain');
    expect(source).toContain('<NativeDiscordMain');
    expect(source).toContain('<NativeAppstoreMain');
    expect(source).toContain('<NativeSettingsMain');
    expect(source).toContain('<ChatTranscript');
    expect(source).toContain('<ChatComposer');
    expect(source).not.toContain('<NativePanelMain');
    expect(source).toContain('<NativeSpacesMain');
    expect(source).toContain('<WorkspaceToolbar');
    expect(source).toContain('<WorkspaceBreadcrumb');
    expect(source).toContain('<WorkspacePreview');
    expect(source).toContain('<AdvancedWebUiTools');
    expect(source).toContain('onResizeStart={(event) => beginSidebarResize(\'context\', event)}');
    expect(source).toContain('onResizeStart={(event) => beginSidebarResize(\'workspace\', event)}');
    expect(source).not.toContain('<WebUiPanelMain');
    expect(source).not.toContain('webuiPanelScript');
    expect(source).not.toContain('webui-panel-view');
    expect(source).toContain('brandAssets.sidebarIcons[panel.id]');
    expect(source).not.toContain('<NativeSidekick');
    expect(source).not.toContain('sidekick-stack');
    expect(source).not.toContain('Browser runtime stays available');
    expect(source).not.toContain('Native panel shell');
    expect(source).not.toContain('focused placeholder');
    expect(source).not.toContain('is queued for native migration after Chat, Workspace/Spaces, Tasks, Kanban and Todos');
    expect(source).toContain('{setupRequired && (');
    expect(source).toContain('<FirstRunSetupPane');
    expect(source).toContain('style={{');
    expect(source).toContain('--context-sidebar-width');
    expect(source).toContain('--workspace-panel-width');
  });

  it('wires context-sidebar section buttons instead of rendering dead controls', () => {
    const source = readRendererFile('App.tsx');

    expect(source).toContain('function panelForContextItem');
    expect(source).toContain('function handleContextItem(item: string): void');
    expect(source).toContain('onClick={() => handleContextItem(item)}');
    expect(source).toContain('aria-pressed={item === activeContextItem}');
    expect(source).not.toContain("className={index === 0 ? 'active' : ''}");
  });

  it('renders native workspace and spaces controls instead of placeholder panels', () => {
    const source = readRendererFile('App.tsx');
    const css = readRendererFile('styles.css');

    expect(source).toContain('onCreateFile');
    expect(source).toContain('onCreateFolder');
    expect(source).toContain('onRenameEntry');
    expect(source).toContain('onDeleteEntry');
    expect(source).toContain('onSavePreview');
    expect(source).toContain('onAddSpace');
    expect(source).toContain('onRenameSpace');
    expect(source).toContain('onRemoveSpace');
    expect(source).toContain('onMoveSpace');
    expect(css).toContain('.workspace-toolbar');
    expect(css).toContain('.workspace-breadcrumb');
    expect(css).toContain('.workspace-preview-actions');
    expect(css).toContain('.spaces-main');
  });

  it('renders native work-management panels for tasks, kanban, and todos', () => {
    const source = readRendererFile('App.tsx');
    const css = readRendererFile('styles.css');

    expect(source).toContain('listCrons');
    expect(source).toContain('createCron');
    expect(source).toContain('getKanbanBoard');
    expect(source).toContain('createKanbanTask');
    expect(source).toContain('extractTodosFromSession');
    expect(source).toContain('<NativeTasksMain activeContextItem={activeContextItem}');
    expect(source).toContain('<NativeKanbanMain activeContextItem={activeContextItem}');
    expect(source).toContain('<NativeTodosMain activeContextItem={activeContextItem}');
    expect(css).toContain('.tasks-main');
    expect(css).toContain('.kanban-main');
    expect(css).toContain('.todos-main');
    expect(css).toContain('.native-work-card');
  });

  it('renders the remaining native integration panels without a generic migration fallback', () => {
    const source = readRendererFile('App.tsx');
    const restPanels = readRendererFile('panels/NativeRestPanels.tsx');
    const css = readRendererFile('styles.css');

    [
      'listSkills',
      'getSkillContent({ name:',
      'saveSkill({',
      'listAgents',
      'getAgentStats',
      'getAgentActivities',
      'activateAgent',
      'getAgentMemory',
      'getAgentSoul',
      'listProfiles',
      'getMemory',
      'getSupermemoryDocument',
      'getInsights',
      'getLogs',
      'listGmailMessages',
      'sendGmailMessage',
      'deleteGmailMessage',
      'listDiscordChannels',
      'listDiscordRoles',
      'getDiscordStats',
      'untimeoutDiscordMember',
      'listAppstore',
      'getSettings'
    ].forEach((apiName) => {
      expect(restPanels).toContain(apiName);
    });

    expect(source).toContain("case 'skills'");
    expect(source).toContain("case 'agents'");
    expect(source).toContain("case 'profiles'");
    expect(source).toContain("case 'memory'");
    expect(source).toContain("case 'settings'");
    expect(source).toContain('<NativeSkillsMain activeContextItem={activeContextItem}');
    expect(source).toContain('<NativeAgentsMain activeContextItem={activeContextItem}');
    expect(source).toContain('<NativeProfilesMain activeContextItem={activeContextItem}');
    expect(source).toContain('<NativeMemoryMain activeContextItem={activeContextItem}');
    expect(source).toContain('<NativeLogsMain activeContextItem={activeContextItem}');
    expect(source).toContain('<NativeGmailMain activeContextItem={activeContextItem}');
    expect(source).toContain('<NativeDiscordMain activeContextItem={activeContextItem}');
    expect(source).toContain('<NativeAppstoreMain');
    expect(source).toContain('<NativeSettingsMain activeContextItem={activeContextItem}');
    expect(restPanels).toContain('agent-terminal');
    expect(restPanels).toContain('memory-editor');
    expect(restPanels).toContain('skill-linked-files');
    expect(restPanels).toContain('skillCategoryDraft');
    expect(restPanels).toContain('gmail-compose');
    expect(restPanels).toContain('discord-moderation');
    expect(restPanels).toContain('lastbrowser:settings-changed');
    expect(restPanels).toContain('appstore-panel-grid');
    expect(restPanels).toContain('insights-panel-grid');
    expect(restPanels).toContain('settings-field-grid');
    expect(restPanels).toContain('settings-section-nav');
    expect(restPanels).toContain('applyDesktopAppearancePreview(');
    expect(restPanels).toContain('<AdvancedWebUiTools');
    expect(restPanels).toContain("panel=\"agents\"");
    expect(restPanels).toContain("panel=\"settings\"");
    expect(restPanels).not.toContain('activeSessionId');
    expect(css).toContain('.native-rest-main');
    expect(css).toContain('.agent-terminal');
    expect(css).toContain('.integration-list');
    expect(css).toContain('.settings-field-grid');
    expect(css).toContain('.appstore-panel-grid');
    expect(css).toContain('.insights-panel-grid');
    expect(css).toContain('.discord-moderation');
    expect(css).toContain('.advanced-webui-tools');
    expect(css).toContain('.browser-load-error');
    expect(css).toContain('html.theme-light .app-shell');
  });
});
