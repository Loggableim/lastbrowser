import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { brandAssets } from '../brand.js';
import {
  type LastbrowserPanelId,
  isInstalledSidebarApp,
  lastbrowserPanels
} from '../shell-state.js';

export type ShellRailProps = {
  activePanel: LastbrowserPanelId;
  leftCollapsed: boolean;
  installedSidebarApps: LastbrowserPanelId[];
  onPanel: (panel: LastbrowserPanelId) => void;
  onToggleLeft: () => void;
};

export function ShellRail({
  activePanel,
  leftCollapsed,
  installedSidebarApps,
  onPanel,
  onToggleLeft
}: ShellRailProps): React.JSX.Element {
  const visiblePanels = lastbrowserPanels.filter(
    (panel) => panel.id !== 'settings' && isInstalledSidebarApp(panel.id, installedSidebarApps)
  );
  const settingsPanel =
    lastbrowserPanels.find((panel) => panel.id === 'settings') ||
    lastbrowserPanels[lastbrowserPanels.length - 1];

  return (
    <nav className="shell-rail" aria-label="Lastbrowser navigation">
      <div className="rail-main">
        {visiblePanels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            className={`rail-button ${activePanel === panel.id ? 'active' : ''}`}
            title={panel.tooltip}
            onClick={() => onPanel(panel.id)}
          >
            <img src={brandAssets.sidebarIcons[panel.id]} alt="" />
            <span>{panel.label}</span>
            {panel.id === 'tasks' && <em>9+</em>}
          </button>
        ))}
      </div>
      <div className="rail-bottom">
        <button type="button" className="rail-collapse" title="Toggle sidebar" onClick={onToggleLeft}>
          {leftCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span>Sidebar ein-/ausblenden</span>
        </button>
        <button
          type="button"
          className={`rail-button ${activePanel === 'settings' ? 'active' : ''}`}
          title={settingsPanel.tooltip}
          onClick={() => onPanel('settings')}
        >
          <img src={brandAssets.sidebarIcons.settings} alt="" />
          <span>{settingsPanel.label}</span>
        </button>
      </div>
    </nav>
  );
}
