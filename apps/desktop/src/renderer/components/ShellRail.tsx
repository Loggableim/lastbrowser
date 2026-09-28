import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { brandAssets, sidebarIconForPanel } from '../brand.js';
import {
  type LastbrowserPanelId,
  isInstalledSidebarApp,
  lastbrowserPanels,
  panelLabelTranslationKey
} from '../shell-state.js';
import { useDesktopI18n } from '../i18n.js';
import type { DesktopTranslationKey } from '../i18n/keys.js';

export function getShellRailLabels(
  translate: (key: DesktopTranslationKey) => string,
  panelId: LastbrowserPanelId
): { label: string; ariaLabel: string; title: string; hoverLabel: string } {
  const label = translate(panelLabelTranslationKey(panelId));
  return { label, ariaLabel: label, title: label, hoverLabel: label };
}

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
  const { t } = useDesktopI18n();
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
  const settingsLabels = getShellRailLabels(t, settingsPanel.id);
  const toggleSidebarLabel = t('sidebar.drawer.toggleSidebar');

  return (
    <nav className="shell-rail" aria-label={t('sidebar.drawer.navigation')}>
      <div className="rail-main">
        {visiblePanels.map((panel) => {
          const labels = getShellRailLabels(t, panel.id);
          return (
          <button
            key={panel.id}
            type="button"
            className={`rail-button ${activePanel === panel.id ? 'active' : ''}`}
            aria-label={labels.ariaLabel}
            title={labels.title}
            onMouseEnter={(event) => showHoverLabel(event, labels.hoverLabel)}
            onMouseLeave={hideHoverLabel}
            onFocus={(event) => showHoverLabel(event, labels.hoverLabel)}
            onBlur={hideHoverLabel}
            onClick={() => onPanel(panel.id)}
          >
            <img src={sidebarIconForPanel(panel.id)} alt="" />
            <span>{labels.label}</span>
          </button>
          );
        })}
      </div>
      <div className="rail-bottom">
        <button
          type="button"
          className="rail-collapse"
          aria-label={toggleSidebarLabel}
          title={toggleSidebarLabel}
          onMouseEnter={(event) => showHoverLabel(event, toggleSidebarLabel)}
          onMouseLeave={hideHoverLabel}
          onFocus={(event) => showHoverLabel(event, toggleSidebarLabel)}
          onBlur={hideHoverLabel}
          onClick={onToggleLeft}
        >
          {leftCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span>{toggleSidebarLabel}</span>
        </button>
        <button
          type="button"
          className={`rail-button ${activePanel === 'settings' ? 'active' : ''}`}
          aria-label={settingsLabels.ariaLabel}
          title={settingsLabels.title}
          onMouseEnter={(event) => showHoverLabel(event, settingsLabels.hoverLabel)}
          onMouseLeave={hideHoverLabel}
          onFocus={(event) => showHoverLabel(event, settingsLabels.hoverLabel)}
          onBlur={hideHoverLabel}
          onClick={() => onPanel('settings')}
        >
          <img src={brandAssets.sidebarIcons.settings} alt="" />
          <span>{settingsLabels.label}</span>
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
