import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [hoverLabel, setHoverLabel] = useState<{ text: string; left: number; top: number } | null>(null);
  const showHoverLabel = (event: React.SyntheticEvent<HTMLElement>, text: string) => {
    if (!leftCollapsed) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setHoverLabel({ text, left: bounds.right + 10, top: bounds.top + bounds.height / 2 });
  };
  const hideHoverLabel = () => setHoverLabel(null);
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
            aria-label={panel.label}
            title={leftCollapsed ? undefined : panel.tooltip}
            onMouseEnter={(event) => showHoverLabel(event, panel.label)}
            onMouseLeave={hideHoverLabel}
            onFocus={(event) => showHoverLabel(event, panel.label)}
            onBlur={hideHoverLabel}
            onClick={() => onPanel(panel.id)}
          >
            <img src={brandAssets.sidebarIcons[panel.id]} alt="" />
            <span>{panel.label}</span>
          </button>
        ))}
      </div>
      <div className="rail-bottom">
        <button
          type="button"
          className="rail-collapse"
          aria-label="Sidebar ein-/ausblenden"
          title={leftCollapsed ? undefined : 'Toggle sidebar'}
          onMouseEnter={(event) => showHoverLabel(event, 'Sidebar ein-/ausblenden')}
          onMouseLeave={hideHoverLabel}
          onFocus={(event) => showHoverLabel(event, 'Sidebar ein-/ausblenden')}
          onBlur={hideHoverLabel}
          onClick={onToggleLeft}
        >
          {leftCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span>Sidebar ein-/ausblenden</span>
        </button>
        <button
          type="button"
          className={`rail-button ${activePanel === 'settings' ? 'active' : ''}`}
          aria-label={settingsPanel.label}
          title={leftCollapsed ? undefined : settingsPanel.tooltip}
          onMouseEnter={(event) => showHoverLabel(event, settingsPanel.label)}
          onMouseLeave={hideHoverLabel}
          onFocus={(event) => showHoverLabel(event, settingsPanel.label)}
          onBlur={hideHoverLabel}
          onClick={() => onPanel('settings')}
        >
          <img src={brandAssets.sidebarIcons.settings} alt="" />
          <span>{settingsPanel.label}</span>
        </button>
      </div>
      {leftCollapsed && hoverLabel && typeof document !== 'undefined' && createPortal(
        <div
          className="rail-floating-hover-label"
          role="tooltip"
          style={{ left: hoverLabel.left, top: hoverLabel.top }}
        >
          {hoverLabel.text}
        </div>,
        document.body
      )}
    </nav>
  );
}
