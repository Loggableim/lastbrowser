import React from 'react';
import {
  Code,
  FileText,
  Figma,
  Hash,
  Kanban,
  LayoutGrid,
  Plus,
  Tv,
  Globe,
  Terminal as TerminalIcon
} from 'lucide-react';
import type { LastbrowserPanelId } from '../shell-state.js';

export interface PinnedApp {
  id: string;
  name: string;
  url?: string;
  panel?: LastbrowserPanelId;
  color: string;
  bg: string;
  letter?: string;
  iconName?: 'notion' | 'figma' | 'trello' | 'terminal' | 'slack' | 'netflix' | 'jira' | 'miro' | 'generic';
}

export const DEFAULT_PINNED_APPS: PinnedApp[] = [
  {
    id: 'notion',
    name: 'Notion',
    url: 'https://www.notion.so',
    color: '#ffffff',
    bg: '#000000',
    letter: 'N',
    iconName: 'notion'
  },
  {
    id: 'figma',
    name: 'Figma',
    url: 'https://www.figma.com',
    color: '#00d9ff',
    bg: 'rgba(0, 217, 255, 0.12)',
    iconName: 'figma'
  },
  {
    id: 'trello',
    name: 'Trello',
    url: 'https://trello.com',
    color: '#0079bf',
    bg: 'rgba(0, 121, 191, 0.15)',
    iconName: 'trello'
  },
  {
    id: 'terminal',
    name: 'Terminal',
    panel: 'terminal',
    color: '#a8ff3e',
    bg: 'rgba(168, 255, 62, 0.12)',
    iconName: 'terminal'
  },
  {
    id: 'slack',
    name: 'Slack',
    url: 'https://slack.com',
    color: '#e01e5a',
    bg: 'rgba(224, 30, 90, 0.12)',
    iconName: 'slack'
  },
  {
    id: 'netflix',
    name: 'Netflix',
    url: 'https://www.netflix.com',
    color: '#e50914',
    bg: 'rgba(229, 9, 20, 0.15)',
    letter: 'N',
    iconName: 'netflix'
  },
  {
    id: 'jira',
    name: 'Jira',
    url: 'https://www.atlassian.com/software/jira',
    color: '#0052cc',
    bg: 'rgba(0, 82, 204, 0.15)',
    iconName: 'jira'
  },
  {
    id: 'miro',
    name: 'Miro',
    url: 'https://miro.com',
    color: '#ffd02f',
    bg: 'rgba(255, 208, 47, 0.15)',
    letter: 'M',
    iconName: 'miro'
  }
];

export const PINNED_APPS_STORAGE_KEY = 'lastbrowser.pinnedApps.v1';

export function loadPinnedApps(): PinnedApp[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(PINNED_APPS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_PINNED_APPS;
}

export function savePinnedApps(apps: PinnedApp[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PINNED_APPS_STORAGE_KEY, JSON.stringify(apps));
    }
  } catch {
    // ignore
  }
}

function renderAppIcon(app: PinnedApp) {
  if (app.iconName === 'terminal') {
    return <TerminalIcon size={16} color={app.color} />;
  }
  if (app.iconName === 'figma') {
    return <Figma size={16} color={app.color} />;
  }
  if (app.iconName === 'slack') {
    return <Hash size={16} color={app.color} />;
  }
  if (app.iconName === 'trello' || app.iconName === 'jira') {
    return <Kanban size={16} color={app.color} />;
  }
  if (app.iconName === 'netflix') {
    return <Tv size={16} color={app.color} />;
  }
  if (app.letter) {
    return <span style={{ fontWeight: 800, fontSize: 13, color: app.color }}>{app.letter}</span>;
  }
  return <Globe size={16} color={app.color} />;
}

export interface PinnedAppGridProps {
  layout: 'dock' | 'grid';
  apps?: PinnedApp[];
  onOpenApp: (app: PinnedApp) => void;
  onAddApp?: () => void;
}

export function PinnedAppGrid({
  layout,
  apps = DEFAULT_PINNED_APPS,
  onOpenApp,
  onAddApp
}: PinnedAppGridProps): React.JSX.Element {
  if (layout === 'dock') {
    return (
      <div className="pinned-dock-list" role="toolbar" aria-label="Pinned Web Apps">
        {apps.map((app) => (
          <button
            key={app.id}
            type="button"
            className="pinned-dock-btn"
            title={app.name}
            aria-label={app.name}
            style={{ '--app-accent': app.color, '--app-bg': app.bg } as React.CSSProperties}
            onClick={() => onOpenApp(app)}
          >
            <div className="pinned-dock-icon-wrapper" style={{ background: app.bg }}>
              {renderAppIcon(app)}
            </div>
          </button>
        ))}
        {onAddApp && (
          <button
            type="button"
            className="pinned-dock-btn add-btn"
            title="Add Pinned App"
            aria-label="Add Pinned App"
            onClick={onAddApp}
          >
            <div className="pinned-dock-icon-wrapper">
              <Plus size={14} />
            </div>
          </button>
        )}
      </div>
    );
  }

  // Grid layout (3x2 or 4x2 Zen compact raster)
  return (
    <div className="pinned-zen-grid" role="region" aria-label="Favorite Apps Grid">
      <div className="pinned-grid-header">
        <span className="pinned-grid-title">PINNED APPS</span>
      </div>
      <div className="pinned-grid-cells">
        {apps.map((app) => (
          <button
            key={app.id}
            type="button"
            className="pinned-grid-cell"
            title={app.name}
            aria-label={app.name}
            onClick={() => onOpenApp(app)}
          >
            <div className="pinned-grid-icon-box" style={{ background: app.bg }}>
              {renderAppIcon(app)}
            </div>
            <span className="pinned-grid-label">{app.name}</span>
          </button>
        ))}
        {onAddApp && (
          <button
            type="button"
            className="pinned-grid-cell add-cell"
            title="Add App"
            aria-label="Add App"
            onClick={onAddApp}
          >
            <div className="pinned-grid-icon-box">
              <Plus size={14} />
            </div>
            <span className="pinned-grid-label">Add</span>
          </button>
        )}
      </div>
    </div>
  );
}
