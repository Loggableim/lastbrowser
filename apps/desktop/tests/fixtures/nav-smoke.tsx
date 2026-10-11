import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ModernTitlebar, WindowTitlebar } from '../../src/renderer/components/HeaderComponents.js';
import { SidekickSidebar } from '../../src/renderer/components/SidekickSidebar.js';
import { DesktopI18nProvider } from '../../src/renderer/i18n.js';
import { matchBrowserShortcut } from '../../src/main/shortcuts.js';
import { usePanelStore } from '../../src/renderer/stores/usePanelStore.js';
import type { BrowserTab } from '../../src/renderer/tabs.js';
import '../../src/renderer/styles.css';

const tabs: BrowserTab[] = [
  { id: 'tab-a', title: 'Alpha', url: 'https://alpha.example/' },
  { id: 'tab-b', title: 'Beta', url: 'https://beta.example/' }
];

type DrawerTab = 'tabs' | 'ai' | 'workflows' | 'tools';

function Proof(): React.JSX.Element {
  const sidebarMode = usePanelStore((state) => state.sidebarMode);
  const setSidebarMode = usePanelStore((state) => state.setSidebarMode);
  const cycleSidebarMode = usePanelStore((state) => state.cycleSidebarMode);
  const [activeTabId, setActiveTabId] = useState('tab-a');
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('tabs');
  const [log, setLog] = useState<string[]>([]);
  const push = (entry: string) => setLog((current) => [...current, entry]);

  useEffect(() => {
    setSidebarMode('expanded');
    const onKey = (event: KeyboardEvent) => {
      const matched = matchBrowserShortcut({
        type: 'keyDown',
        key: event.key,
        shift: event.shiftKey,
        control: event.ctrlKey || event.metaKey,
        alt: event.altKey,
        meta: event.metaKey
      });
      if (!matched) return;
      if (matched.action === 'next-tab' || matched.action === 'prev-tab') {
        setActiveTabId((current) => {
          const index = tabs.findIndex((tab) => tab.id === current);
          const next = matched.action === 'next-tab'
            ? (index + 1) % tabs.length
            : (index - 1 + tabs.length) % tabs.length;
          return tabs[next].id;
        });
        push(matched.action);
      }
      if (matched.action === 'toggle-sidebar') {
        cycleSidebarMode();
        push('toggle-sidebar');
      }
    };
    window.addEventListener('keydown', onKey);
    (window as unknown as { navSmokeReady?: boolean }).navSmokeReady = true;
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleSidebarMode, setSidebarMode]);

  return (
    <DesktopI18nProvider>
      <div className="first-run-fullscreen-wrap" data-nav="backdrop">
        <div className="first-run-fullscreen">overlay</div>
      </div>
      <ModernTitlebar
        sidebarMode={sidebarMode}
        onToggleSidebar={() => {
          cycleSidebarMode();
          push('click-toggle-sidebar');
        }}
        onGoBack={() => push('back')}
        onGoForward={() => push('forward')}
        onReloadOrStop={() => push('reload')}
        onToggleFind={() => undefined}
        onToggleDownloads={() => undefined}
        copilotOpen={false}
        onToggleCopilot={() => undefined}
      >
        <span>omnibox</span>
      </ModernTitlebar>
      <div style={{ width: 240 }}>
        <WindowTitlebar
          tabs={tabs}
          activeTabId={activeTabId}
          onActivateTab={(id) => {
            setActiveTabId(id);
            push(`activate:${id}`);
          }}
          onCloseTab={() => push('close')}
          onNewTab={() => push('new-tab')}
        />
        <SidekickSidebar
          mode={sidebarMode === 'hidden' ? 'expanded' : sidebarMode}
          tabs={tabs}
          activeTabId={activeTabId}
          onActivateTab={(id) => {
            setActiveTabId(id);
            push(`side-activate:${id}`);
          }}
          onCloseTab={() => undefined}
          onNewTab={() => push('side-new')}
          onCycleMode={() => {
            cycleSidebarMode();
            push('cycle');
          }}
          onSetMode={(mode) => {
            setSidebarMode(mode);
            push(`set-mode:${mode}`);
          }}
          activeSpacePath="/space"
          spaces={[{ path: '/space', name: 'Work' }]}
          onSelectSpace={() => push('space')}
          onOpenSettings={() => push('settings')}
          onOpenApp={() => push('app')}
          drawerTab={drawerTab}
          onSelectDrawerTab={(tab) => {
            setDrawerTab(tab);
            push(`drawer:${tab}`);
          }}
        />
      </div>
      <output id="nav-log">{log.join(',')}</output>
      <output id="nav-state">{`${sidebarMode}|${activeTabId}|${drawerTab}`}</output>
    </DesktopI18nProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Proof />);
