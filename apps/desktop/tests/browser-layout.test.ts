import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readRendererFile(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

function cssBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
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
    const browserPageMain = cssBlock(css, '.browser-page-main');
    const browserWebviewFrame = cssBlock(css, '.browser-webview-frame');
    const aiBrowserMain = cssBlock(css, '.ai-browser-main');
    const browserCanvas = cssBlock(css, '.panel-browser .browser-main');
    const railCollapsed = cssBlock(css, '.workspace.left-collapsed');
    const contextCollapsed = cssBlock(css, '.workspace.context-collapsed');

    expect(appShell).toContain('grid-template-rows: 34px auto minmax(0, 1fr)');
    expect(workspace).toContain('grid-template-rows: minmax(0, 1fr)');
    expect(workspace).toContain('height: 100%');
    expect(workspace).toContain('grid-template-columns: 168px 280px minmax(0, 1fr) 320px');
    expect(workspace).toContain('overflow: hidden');
    expect(railCollapsed).toContain('grid-template-columns: 48px 280px minmax(0, 1fr) 320px');
    expect(contextCollapsed).toContain('grid-template-columns: 168px 44px minmax(0, 1fr) 320px');
    expect(css).not.toContain('.workspace.with-sidekick');
    expect(css).not.toContain('410px');
    expect(browserPane).toContain('display: flex');
    expect(browserPane).toContain('height: 100%');
    expect(browserPane).toContain('overflow: hidden');
    expect(browserPageMain).toContain('display: flex');
    expect(browserPageMain).toContain('flex-direction: column');
    expect(browserPageMain).toContain('flex: 1 1 auto');
    expect(browserPageMain).toContain('min-height: 0');
    expect(browserWebviewFrame).toContain('flex: 1 1 auto');
    expect(browserWebviewFrame).toContain('min-height: 0');
    expect(browserWebviewFrame).toContain('overflow: hidden');
    expect(aiBrowserMain).toContain('overflow: auto');
    expect(browserCanvas).toContain('background: #07111f');
    expect(browserView).toContain('position: absolute');
    expect(browserView).toContain('inset: 0');
    expect(browserView).toContain('height: 100%');
  });

  it('renders visited websites inside a full-height browser webview frame', () => {
    const source = readRendererFile('App.tsx');

    expect(source).toContain('className="browser-main browser-page-main"');
    expect(source).toContain('<div className="browser-webview-frame">');
    expect(source).toContain('style={{ width: \'100%\', height: \'100%\' }}');
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

  it('binds webview navigation and title events to the tab that owns the webview', () => {
    const source = readRendererFile('App.tsx');

    expect(source).toContain('function updateUrl(tabId: string, url: string): void');
    expect(source).toContain('function updateTitle(tabId: string, title: string): void');
    expect(source).toContain('onWebviewNavigate(activeTab.id, event.url)');
    expect(source).toContain('onWebviewTitle(activeTab.id, event.title)');
    expect(source).toContain('hideWebviewScrollbars(event.currentTarget)');
  });

  it('renders rail, context sidebar, central browser, and workspace panel together', () => {
    const source = readRendererFile('App.tsx');

    expect(source).toContain('<ShellRail');
    expect(source).toContain('<ContextSidebar');
    expect(source).toContain('onPanel={setActivePanel}');
    expect(source).toContain('contextSidebarCollapsed');
    expect(source).toContain('<BrowserMain');
    expect(source).toContain('<NativeAiBrowserMain');
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
    expect(restPanels).toContain('agent-terminal');
    expect(restPanels).toContain('memory-editor');
    expect(restPanels).toContain('skill-linked-files');
    expect(restPanels).toContain('gmail-compose');
    expect(restPanels).toContain('discord-moderation');
    expect(restPanels).toContain('settings-field-grid');
    expect(restPanels).toContain('settings-section-nav');
    expect(restPanels).toContain('<AdvancedWebUiTools');
    expect(restPanels).toContain("panel=\"agents\"");
    expect(restPanels).toContain("panel=\"settings\"");
    expect(css).toContain('.native-rest-main');
    expect(css).toContain('.agent-terminal');
    expect(css).toContain('.integration-list');
    expect(css).toContain('.settings-field-grid');
    expect(css).toContain('.discord-moderation');
    expect(css).toContain('.advanced-webui-tools');
  });
});
