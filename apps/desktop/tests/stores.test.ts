import { describe, expect, it, beforeEach } from 'vitest';
import { useTabStore } from '../src/renderer/stores/useTabStore.js';
import { usePanelStore } from '../src/renderer/stores/usePanelStore.js';
import { useChatStore } from '../src/renderer/stores/useChatStore.js';

describe('Zustand stores', () => {
  describe('useTabStore', () => {
    beforeEach(() => {
      useTabStore.setState({
        tabs: [{ id: 'tab-1', url: 'https://example.com', title: 'Example' }],
        activeTabId: 'tab-1',
        closedTabs: [],
        addressValue: 'https://example.com',
        browserMode: 'web'
      });
    });

    it('adds a new tab and sets it active', () => {
      useTabStore.getState().addTab('https://news.ycombinator.com');
      const state = useTabStore.getState();
      expect(state.tabs.length).toBe(2);
      expect(state.activeTabId).toBe(state.tabs[1].id);
      expect(state.tabs[1].url).toBe('https://news.ycombinator.com');
    });

    it('closes a tab and remembers it in closedTabs', () => {
      useTabStore.getState().addTab('https://github.com');
      const tabToClose = useTabStore.getState().tabs[1];
      useTabStore.getState().closeTab(tabToClose.id);
      const state = useTabStore.getState();
      expect(state.tabs.length).toBe(1);
      expect(state.closedTabs.length).toBe(1);
      expect(state.closedTabs[0].url).toBe(tabToClose.url);
    });

    it('reopens the last closed tab', () => {
      useTabStore.getState().addTab('https://github.com');
      const tabToClose = useTabStore.getState().tabs[1];
      useTabStore.getState().closeTab(tabToClose.id);
      expect(useTabStore.getState().tabs.length).toBe(1);

      useTabStore.getState().reopenClosedTab();
      const state = useTabStore.getState();
      expect(state.tabs.length).toBe(2);
      expect(state.closedTabs.length).toBe(0);
    });

    it('supports functional setTabs updates', () => {
      useTabStore.getState().setTabs((prev) => [
        ...prev,
        { id: 'tab-fn', url: 'https://test.local', title: 'Functional' }
      ]);
      expect(useTabStore.getState().tabs.length).toBe(2);
      expect(useTabStore.getState().tabs[1].id).toBe('tab-fn');
    });
  });

  describe('usePanelStore', () => {
    it('updates activePanel and sidebar collapse states', () => {
      usePanelStore.getState().setActivePanel('settings');
      expect(usePanelStore.getState().activePanel).toBe('settings');

      usePanelStore.getState().setLeftSidebarCollapsed(true);
      expect(usePanelStore.getState().leftSidebarCollapsed).toBe(true);

      usePanelStore.getState().setContextSidebarCollapsed(true);
      expect(usePanelStore.getState().contextSidebarCollapsed).toBe(true);
    });

    it('clamps context and workspace panel widths to limits', () => {
      usePanelStore.getState().setContextSidebarWidth(100); // min is 220
      expect(usePanelStore.getState().contextSidebarWidth).toBe(220);

      usePanelStore.getState().setContextSidebarWidth(1000); // max is 420
      expect(usePanelStore.getState().contextSidebarWidth).toBe(420);

      usePanelStore.getState().setWorkspacePanelWidth(50); // min is 260
      expect(usePanelStore.getState().workspacePanelWidth).toBe(260);

      usePanelStore.getState().setWorkspacePanelWidth(999); // max is 520
      expect(usePanelStore.getState().workspacePanelWidth).toBe(520);
    });
  });

  describe('useChatStore', () => {
    beforeEach(() => {
      useChatStore.setState({
        sessions: [],
        activeSessionId: null,
        chatMessages: [],
        chatRunState: 'idle',
        composerText: '',
        composerMode: 'action'
      });
    });

    it('manages sessions and supports functional state updates', () => {
      useChatStore.getState().setSessions([
        { session_id: 's-1', title: 'Session 1' }
      ]);
      expect(useChatStore.getState().sessions.length).toBe(1);

      useChatStore.getState().setSessions((prev) => [
        ...prev,
        { session_id: 's-2', title: 'Session 2' }
      ]);
      expect(useChatStore.getState().sessions.length).toBe(2);
    });

    it('manages chat messages and composer state', () => {
      useChatStore.getState().setComposerText('Hello Sidekick');
      useChatStore.getState().setComposerMode('plan');
      expect(useChatStore.getState().composerText).toBe('Hello Sidekick');
      expect(useChatStore.getState().composerMode).toBe('plan');

      useChatStore.getState().setChatMessages([
        { role: 'user', content: 'Hello' }
      ]);
      expect(useChatStore.getState().chatMessages.length).toBe(1);

      useChatStore.getState().setChatRunState('streaming');
      expect(useChatStore.getState().chatRunState).toBe('streaming');
    });
  });
});
