/**
 * Window titlebar and header chrome components for Lastbrowser.
 *
 * Extracted from App.tsx. Contains:
 *   • BookmarkBar      - Quick access bar for pinned/saved page bookmarks
 *   • UpdatePill       - Live auto-updater status indicator and trigger
 *   • ProfileSwitcher  - Dropdown to switch, create, rename, or delete browser profiles
 *   • SpaceSelector    - Dropdown to pick active workspace / space
 *   • WindowTitlebar   - Native custom window chrome with tab strip and brand
 *   • WindowControls   - Minimize / Maximize / Close window action buttons
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  Download,
  EyeOff,
  Github,
  Globe2,
  Loader2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import type { BrowserBookmark } from '../bookmarks.js';
import { exportBookmarksToHtml, importBookmarksFromHtml, importBookmarksFromJson } from '../bookmark-io.js';
import type { QuickActionChip } from '../quick-actions.js';
import type { BrowserProfile } from '../profiles.js';
import { type SpaceSummary, spaceDisplayName } from '../shell-state.js';
import type { BrowserTab } from '../tabs.js';
import { prepareSnapTabDrag } from '../types/snap-layouts.js';

export type UpdateStatus = Awaited<ReturnType<typeof window.lastbrowser.updates.status>>;

// ─── BookmarkBar ────────────────────────────────────────────────────────────

export type BookmarkBarProps = {
  activeBookmarkable: boolean;
  activeBookmarked: boolean;
  bookmarks: BrowserBookmark[];
  onNavigate: (url: string) => void;
  onRemove: (bookmark: BrowserBookmark) => void;
  onToggleActive: () => void;
  onImport?: (bookmarks: BrowserBookmark[]) => void;
};

export function BookmarkBar({
  activeBookmarkable,
  activeBookmarked,
  bookmarks,
  onNavigate,
  onRemove,
  onToggleActive,
  onImport
}: BookmarkBarProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = () => {
    if (!bookmarks.length) return;
    const html = exportBookmarksToHtml(bookmarks);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmarks-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImport) return;
    try {
      const text = await file.text();
      const imported = file.name.endsWith('.json')
        ? importBookmarksFromJson(text)
        : importBookmarksFromHtml(text);
      if (imported.length) {
        onImport(imported);
      }
    } catch (err) {
      console.error('Failed to import bookmarks', err);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <nav className="bookmark-bar" aria-label="Bookmarks">
      <div className="bookmark-list">
        {bookmarks.map((bookmark) => (
          <div key={bookmark.id} className="bookmark-item">
            <button
              type="button"
              className="bookmark-open"
              title={bookmark.url}
              onClick={() => onNavigate(bookmark.url)}
            >
              <Star size={13} fill="currentColor" />
              <span>{bookmark.title}</span>
            </button>
            <button
              type="button"
              className="bookmark-remove"
              aria-label={`Remove ${bookmark.title}`}
              onClick={() => onRemove(bookmark)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {!bookmarks.length && <span className="bookmark-empty">No bookmarks yet</span>}
      </div>
      <div className="bookmark-actions">
        {onImport && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,.json"
              style={{ display: 'none' }}
              onChange={(e) => void handleFileChange(e)}
            />
            <button
              type="button"
              className="bookmark-action-btn"
              title="Import bookmarks (HTML/JSON)"
              aria-label="Import bookmarks"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={13} />
            </button>
          </>
        )}
        <button
          type="button"
          className="bookmark-action-btn"
          title="Export bookmarks (HTML)"
          aria-label="Export bookmarks"
          disabled={!bookmarks.length}
          onClick={handleExport}
        >
          <Download size={13} />
        </button>
        <button
          type="button"
          className={`bookmark-add ${activeBookmarked ? 'active' : ''}`}
          disabled={!activeBookmarkable}
          aria-label={activeBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          aria-pressed={activeBookmarked}
          onClick={onToggleActive}
        >
          <Star size={14} fill={activeBookmarked ? 'currentColor' : 'none'} />
        </button>
      </div>
    </nav>
  );
}

// ─── UpdatePill ─────────────────────────────────────────────────────────────

export function updateLabel(status: UpdateStatus): string {
  if (status.state === 'checking') return 'checking updates';
  if (status.state === 'available') return status.availableVersion ? `update ${status.availableVersion}` : 'update available';
  if (status.state === 'downloading') return `downloading ${status.percent ?? 0}%`;
  if (status.state === 'downloaded') return 'restart to update';
  if (status.state === 'error') return 'update retry';
  return 'updates';
}

export function UpdatePill({ status }: { status: UpdateStatus | null }): React.JSX.Element | null {
  if (!status || status.state === 'disabled') return null;
  const visibleStates: UpdateStatus['state'][] = ['checking', 'available', 'downloading', 'downloaded', 'error'];
  if (!visibleStates.includes(status.state)) return null;

  const label = updateLabel(status);
  const handleClick = () => {
    if (status.state === 'downloaded') {
      void window.lastbrowser.updates.install();
      return;
    }
    if (status.state === 'available') {
      void window.lastbrowser.updates.download();
      return;
    }
    if (status.state === 'error') {
      void window.lastbrowser.updates.check();
    }
  };

  return (
    <button
      type="button"
      className={`update-pill ${status.state}`}
      onClick={handleClick}
      disabled={status.state === 'checking' || status.state === 'downloading'}
      title={status.message || label}
    >
      {status.state === 'checking' || status.state === 'downloading'
        ? <Loader2 size={14} className="spin" />
        : status.state === 'downloaded'
          ? <CheckCircle2 size={14} />
          : <RefreshCw size={14} />}
      <span>{label}</span>
    </button>
  );
}

// ─── ProfileSwitcher ─────────────────────────────────────────────────────────

export type ProfileSwitcherProps = {
  profiles: BrowserProfile[];
  activeProfileId: string;
  onSelect: (profileId: string) => void;
  onCreate: (name: string) => void;
  onRename: (profileId: string, name: string) => void;
  onDelete: (profileId: string) => void;
};

export function ProfileSwitcher({
  profiles,
  activeProfileId,
  onSelect,
  onCreate,
  onRename,
  onDelete
}: ProfileSwitcherProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0];

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function submitCreate(event: React.FormEvent): void {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    onCreate(name);
    setDraftName('');
    setOpen(false);
  }

  function submitRename(event: React.FormEvent, profileId: string): void {
    event.preventDefault();
    const name = renameDraft.trim();
    if (name) onRename(profileId, name);
    setRenamingId(null);
    setRenameDraft('');
  }

  return (
    <div className="profile-switcher" ref={rootRef}>
      <button
        type="button"
        className="profile-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Profile: ${activeProfile?.name || 'Default'}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="profile-dot" style={{ background: activeProfile?.color || '#2563FF' }} />
        <span>{activeProfile?.icon || '🌐'} {activeProfile?.name || 'Default'}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="profile-switcher-menu" role="menu">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className={`profile-switcher-item ${profile.id === activeProfileId ? 'is-active' : ''}`}
              role="menuitem"
              tabIndex={0}
              onClick={() => {
                onSelect(profile.id);
                setOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(profile.id);
                  setOpen(false);
                }
              }}
            >
              <span className="profile-dot" style={{ background: profile.color }} />
              {renamingId === profile.id ? (
                <form className="profile-switcher-form" onSubmit={(event) => submitRename(event, profile.id)}>
                  <input
                    className="profile-switcher-input"
                    value={renameDraft}
                    autoFocus
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <button type="submit" className="profile-switcher-action">Save</button>
                </form>
              ) : (
                <>
                  <span className="profile-switcher-item-name">{profile.icon} {profile.name}</span>
                  {profile.isDefault && <span className="profile-switcher-item-badge">Default</span>}
                  <button
                    type="button"
                    className="profile-switcher-delete"
                    aria-label={`Rename ${profile.name}`}
                    title="Rename"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRenamingId(profile.id);
                      setRenameDraft(profile.name);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  {!profile.isDefault && (
                    <button
                      type="button"
                      className="profile-switcher-delete"
                      aria-label={`Delete ${profile.name}`}
                      title="Delete profile"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(profile.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <div className="profile-switcher-separator" />
          <form className="profile-switcher-form" onSubmit={submitCreate}>
            <input
              className="profile-switcher-input"
              placeholder="New profile name…"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
            />
            <button type="submit" className="profile-switcher-action" disabled={!draftName.trim()}>
              <Plus size={13} /> Add
            </button>
          </form>
          <div className="profile-switcher-empty">
            Each profile keeps its own cookies, logins and storage.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SpaceSelector ──────────────────────────────────────────────────────────

export type SpaceSelectorProps = {
  activePath: string;
  error: string;
  spaces: SpaceSummary[];
  onOpenSpaces: () => void;
  onSelect: (path: string) => void;
};

export function SpaceSelector({
  activePath,
  error,
  spaces,
  onOpenSpaces,
  onSelect
}: SpaceSelectorProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const activeSpace = spaces.find((space) => space.path === activePath) || spaces[0] || null;
  const label = activeSpace ? spaceDisplayName(activeSpace) : 'default';

  return (
    <div className="titlebar-space">
      <button
        type="button"
        className={`space-button ${open ? 'open' : ''}`}
        title={error || activeSpace?.path || 'Spaces'}
        onClick={() => setOpen((current) => !current)}
      >
        <img src={brandAssets.sidebarIcons.folder} alt="" />
        <span>{label}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="space-dropdown">
          <div className="space-dropdown-head">
            <strong>Spaces</strong>
            <button type="button" onClick={() => { setOpen(false); onOpenSpaces(); }}>
              Manage
            </button>
          </div>
          <div className="space-list">
            {spaces.map((space) => (
              <button
                key={space.path}
                type="button"
                className={space.path === activePath ? 'active' : ''}
                onClick={() => {
                  onSelect(space.path);
                  setOpen(false);
                }}
              >
                <span>{space.emoji || '·'}</span>
                <strong>{spaceDisplayName(space)}</strong>
                <small>{space.path}</small>
              </button>
            ))}
            {!spaces.length && (
              <div className="space-empty">
                {error || 'Sidekick loads spaces when the runtime is online.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── useWindowDrag ─────────────────────────────────────────────────────────

export function useWindowDrag() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    void window.lastbrowser?.window?.isMaximized?.().then((max) => {
      if (typeof max === 'boolean') setIsMaximized(max);
    });
    const cleanup = window.lastbrowser?.window?.onMaximizeChange?.((max) => {
      setIsMaximized(max);
    });
    return () => cleanup?.();
  }, []);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startScreenX: number;
    startScreenY: number;
    isDragging: boolean;
  } | null>(null);

  const handleDoubleClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, form, a, .tab, .window-controls, .space-dropdown, .profile-switcher-menu')) return;
    void window.lastbrowser?.window?.toggleMaximize?.();
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, form, a, .tab, .window-controls, .space-dropdown, .profile-switcher-menu')) return;

    if (isMaximized) {
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startScreenX: event.screenX,
        startScreenY: event.screenY,
        isDragging: false
      };

      const onMouseMove = async (moveEvent: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = moveEvent.screenX - dragRef.current.startScreenX;
        const dy = moveEvent.screenY - dragRef.current.startScreenY;
        const distance = Math.hypot(dx, dy);

        if (!dragRef.current.isDragging && distance > 5) {
          dragRef.current.isDragging = true;
          await window.lastbrowser?.window?.unmaximize?.();
          setIsMaximized(false);
          const bounds = await window.lastbrowser?.window?.getBounds?.();
          const targetWidth = bounds?.width || 1440;
          const ratio = Math.min(Math.max(dragRef.current.startX / (window.innerWidth || 1920), 0.1), 0.9);
          const newX = Math.round(moveEvent.screenX - targetWidth * ratio);
          const newY = Math.round(moveEvent.screenY - 15);
          await window.lastbrowser?.window?.setPosition?.(newX, newY);
          return;
        }

        if (dragRef.current.isDragging) {
          const bounds = await window.lastbrowser?.window?.getBounds?.();
          const targetWidth = bounds?.width || 1440;
          const ratio = Math.min(Math.max(dragRef.current.startX / (window.innerWidth || 1920), 0.1), 0.9);
          const newX = Math.round(moveEvent.screenX - targetWidth * ratio);
          const newY = Math.round(moveEvent.screenY - 15);
          await window.lastbrowser?.window?.setPosition?.(newX, newY);
        }
      };

      const onMouseUp = async (upEvent: MouseEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        if (dragRef.current?.isDragging && upEvent.screenY <= 4) {
          await window.lastbrowser?.window?.toggleMaximize?.();
        }
        dragRef.current = null;
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };

  return {
    isMaximized,
    handleDoubleClick,
    handleMouseDown
  };
}

// ─── WindowControls ─────────────────────────────────────────────────────────

export function WindowControls(): React.JSX.Element {
  const { isMaximized } = useWindowDrag();

  return (
    <div className="window-controls" aria-label="Window controls">
      <button type="button" className="window-control" aria-label="Minimize" title="Minimize" onClick={() => void window.lastbrowser?.window?.minimize?.()}>
        <Minus size={15} />
      </button>
      <button
        type="button"
        className="window-control"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        title={isMaximized ? 'Restore' : 'Maximize'}
        onClick={() => void window.lastbrowser?.window?.toggleMaximize?.()}
      >
        {isMaximized ? <Copy size={11} style={{ transform: 'rotate(90deg)' }} /> : <Square size={13} />}
      </button>
      <button type="button" className="window-control close" aria-label="Close" title="Close" onClick={() => void window.lastbrowser?.window?.close?.()}>
        <X size={15} />
      </button>
    </div>
  );
}

// ─── WindowTitlebar ─────────────────────────────────────────────────────────

export type WindowTitlebarProps = {
  tabs?: BrowserTab[];
  activeTabId?: string;
  draggedTabId?: string | null;
  onActivateTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onDragEndTab?: () => void;
  onDragStartTab?: (tabId: string | null) => void;
  onMoveTab?: (tabId: string, targetTabId: string) => void;
  onNewTab?: () => void;
  onPinTab?: (tabId: string) => void;
  onToggleTabMute?: (tabId: string) => void;
  onAddSplitTab?: (tabId: string, baseTabId?: string) => void;
};

export function WindowTitlebar({
  tabs,
  activeTabId,
  draggedTabId,
  onActivateTab,
  onCloseTab,
  onDragEndTab,
  onDragStartTab,
  onMoveTab,
  onNewTab,
  onPinTab,
  onToggleTabMute,
  onAddSplitTab
}: WindowTitlebarProps): React.JSX.Element {
  const { isMaximized, handleDoubleClick, handleMouseDown } = useWindowDrag();
  const [dragOverInfo, setDragOverInfo] = useState<{ id: string; mode: 'before' | 'after' | 'split' } | null>(null);

  return (
    <header
      className={`browser-titlebar ${isMaximized ? 'is-maximized' : ''}`}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
    >
      <div className="brand">
        <img src={brandAssets.appIcon256} alt="" className="brand-mark" draggable={false} />
        <span>lastbrowser</span>
      </div>
      {tabs && activeTabId && onActivateTab && onCloseTab && onNewTab ? (
        <nav className="tabbar" aria-label="Browser tabs">
          {tabs.map((tab) => {
            const isDragTarget = dragOverInfo?.id === tab.id;
            const dragMode = isDragTarget ? dragOverInfo.mode : null;
            return (
              <div
                key={tab.id}
                role="button"
                tabIndex={0}
                draggable
                className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.pinned ? 'pinned' : ''} ${tab.incognito ? 'incognito' : ''} ${draggedTabId === tab.id ? 'dragging' : ''} ${dragMode ? `drag-over-${dragMode}` : ''}`}
                onClick={() => onActivateTab(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onActivateTab(tab.id);
                  }
                }}
                onDragStart={(event) => {
                  prepareSnapTabDrag(event.dataTransfer, tab.id);
                  setDragOverInfo(null);
                  onDragStartTab?.(tab.id);
                }}
                onDragEnd={() => {
                  setDragOverInfo(null);
                  onDragEndTab?.();
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (!draggedTabId || draggedTabId === tab.id) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const relX = (event.clientX - rect.left) / rect.width;
                  let mode: 'before' | 'after' | 'split' = 'split';
                  if (relX < 0.25) mode = 'before';
                  else if (relX > 0.75) mode = 'after';
                  if (!dragOverInfo || dragOverInfo.id !== tab.id || dragOverInfo.mode !== mode) {
                    setDragOverInfo({ id: tab.id, mode });
                  }
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                  if (dragOverInfo?.id === tab.id) {
                    setDragOverInfo(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const currentDrop = dragOverInfo;
                  setDragOverInfo(null);
                  if (draggedTabId && draggedTabId !== tab.id) {
                    if (currentDrop?.id === tab.id && currentDrop.mode === 'split') {
                      onAddSplitTab?.(draggedTabId, tab.id);
                    } else {
                      onMoveTab?.(draggedTabId, tab.id);
                    }
                  }
                  onDragEndTab?.();
                }}
              >
                <button
                  type="button"
                  className={`tab-favorite ${tab.pinned ? 'active' : ''}`}
                  aria-label={tab.pinned ? `Unfavorite ${tab.title}` : `Favorite ${tab.title}`}
                  aria-pressed={Boolean(tab.pinned)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPinTab?.(tab.id);
                  }}
                >
                  <Star size={11} fill={tab.pinned ? 'currentColor' : 'none'} />
                </button>
                {tab.incognito && (
                  <EyeOff size={11} className="tab-incognito-icon" title="Private tab" />
                )}
                {tab.isLoading ? (
                  <Loader2 size={12} className="tab-spinner" />
                ) : tab.favicon ? (
                  <img
                    src={tab.favicon}
                    alt=""
                    className="tab-favicon"
                    onError={(event) => {
                      (event.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Globe2 size={12} className="tab-fallback-icon" />
                )}
                <span className="tab-title">{tab.title}</span>
                {dragMode === 'split' && (
                  <div className="vtab-split-drop-badge">
                    <Columns2 size={11} />
                    <span>Split</span>
                  </div>
                )}
              {(tab.isPlayingAudio || tab.isMuted) && (
                <button
                  type="button"
                  className={`tab-audio-btn ${tab.isMuted ? 'is-muted' : 'is-playing'}`}
                  title={tab.isMuted ? `Unmute ${tab.title}` : `Mute ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleTabMute?.(tab.id);
                  }}
                >
                  {tab.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
              )}
              <X
                size={13}
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
              />
            </div>
            );
          })}
          <button type="button" className="new-tab" onClick={onNewTab} aria-label="New tab"><Plus size={16} /></button>
          <div className="tabbar-drag-spacer" />
        </nav>
      ) : (
        <div className="titlebar-drag-fill" />
      )}
      <WindowControls />
    </header>
  );
}

// ─── ModernTitlebar (Phase 9: Sidekick + Zen Browser Synthese) ────────────────

export type ModernTitlebarProps = {
  isLoading?: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onReloadOrStop: () => void;
  sidebarMode: 'slim' | 'expanded' | 'hidden';
  onToggleSidebar: () => void;
  children: React.ReactNode;
  /** Optional Research Action Bar trigger & flyout when docked in topbar */
  topbarActionStrip?: React.ReactNode;
  /** Callback to trigger page AI summarization */
  onTriggerSummarize?: () => void;
  blockedAdsCount?: number;
  onToggleShieldPopover?: () => void;
  onToggleFind: () => void;
  onToggleDownloads: () => void;
  hasActiveDownloads?: boolean;
  onToggleExtensions?: () => void;
  copilotOpen: boolean;
  onToggleCopilot: () => void;
  onOpenGithub?: () => void;
  quickActions?: QuickActionChip[];
  onExecuteQuickAction?: (chip: QuickActionChip) => void;
  /** RAM saved by discarded (sleeping) tabs in MB. */
  savedMemoryMb?: number;
  botName?: string;
  /** Whether Zen mode is active (omnibox autohides to top edge). Defaults to sidebarMode === 'hidden'. */
  zenMode?: boolean;
  /** Externally controlled revealed state for Zen mode (e.g. from Ctrl+L). */
  zenRevealed?: boolean;
  /** Callback when Zen titlebar visibility changes. */
  onZenRevealChange?: (revealed: boolean) => void;
};

export function ModernTitlebar({
  isLoading,
  onGoBack,
  onGoForward,
  onReloadOrStop,
  sidebarMode,
  onToggleSidebar,
  children,
  topbarActionStrip,
  onTriggerSummarize,
  blockedAdsCount = 3420,
  onToggleShieldPopover,
  onToggleFind,
  onToggleDownloads,
  hasActiveDownloads,
  onToggleExtensions,
  copilotOpen,
  onToggleCopilot,
  onOpenGithub,
  quickActions,
  onExecuteQuickAction,
  savedMemoryMb = 0,
  botName = 'Nova',
  zenMode,
  zenRevealed,
  onZenRevealChange
}: ModernTitlebarProps): React.JSX.Element {
  const { isMaximized, handleDoubleClick, handleMouseDown } = useWindowDrag();
  const isZen = zenMode ?? sidebarMode === 'hidden';
  const [internalZenHover, setInternalZenHover] = useState(false);
  const hoverLeaveTimerRef = useRef<number | null>(null);

  const isRevealed = Boolean(zenRevealed || internalZenHover);

  const handleMouseEnter = () => {
    if (hoverLeaveTimerRef.current) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setInternalZenHover(true);
    onZenRevealChange?.(true);
  };

  const handleMouseLeave = () => {
    if (hoverLeaveTimerRef.current) {
      window.clearTimeout(hoverLeaveTimerRef.current);
    }
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      setInternalZenHover(false);
      onZenRevealChange?.(false);
    }, 350);
  };

  const adRamSavedGb = Math.max(1.2, (blockedAdsCount * 0.35) / 1000).toFixed(1);
  const totalRamSavedLabel =
    savedMemoryMb > 0
      ? `${adRamSavedGb} GB + ${savedMemoryMb} MB tab sleep`
      : `${adRamSavedGb} GB`;

  return (
    <>
      {isZen && (
        <div
          className="zen-top-hover-sensor"
          onMouseEnter={handleMouseEnter}
          title="Kante berühren, um Adressleiste einzublenden"
          aria-hidden="true"
        />
      )}
      <header
        className={`modern-titlebar ${isMaximized ? 'is-maximized' : ''} ${isZen ? 'zen-autohide' : ''} ${isRevealed ? 'zen-revealed' : ''}`}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseEnter={isZen ? handleMouseEnter : undefined}
        onMouseLeave={isZen ? handleMouseLeave : undefined}
      >
        {/* Left controls: Sidebar toggle & Traffic navigation */}
        <div className="modern-titlebar-left">
          <button
            type="button"
          className="titlebar-tool-btn sidebar-toggle"
          title={`Toggle Sidebar (${sidebarMode === 'hidden' ? 'Show' : 'Collapse'}) - Ctrl+B`}
          aria-label="Toggle Sidebar"
          onClick={onToggleSidebar}
        >
          {sidebarMode === 'hidden' ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>

        <div className="traffic-nav-buttons">
          <button
            type="button"
            className="titlebar-tool-btn nav-back"
            title="Back (Alt+Left)"
            aria-label="Back"
            onClick={onGoBack}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="titlebar-tool-btn nav-forward"
            title="Forward (Alt+Right)"
            aria-label="Forward"
            onClick={onGoForward}
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            className="titlebar-tool-btn nav-reload"
            title={isLoading ? 'Stop loading (Esc)' : 'Reload (Ctrl+R)'}
            aria-label={isLoading ? 'Stop loading' : 'Reload'}
            onClick={onReloadOrStop}
          >
            {isLoading ? <X size={15} /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {/* Center: Integrated Omnibox + Quick Action Chips + Live Stats Pill */}
      <div className="modern-titlebar-center">
        {topbarActionStrip}
        {children}

        {onTriggerSummarize && (
          <button
            type="button"
            className="titlebar-summarize-btn"
            title="Seite mit KI zusammenfassen"
            aria-label="Seite mit KI zusammenfassen"
            onClick={onTriggerSummarize}
          >
            <Sparkles size={13} className="summarize-btn-sparkles" />
            <span className="summarize-btn-label">Summarize</span>
          </button>
        )}

        {quickActions && quickActions.length > 0 && onExecuteQuickAction && (
          <div className="titlebar-quick-actions" role="toolbar" aria-label="Contextual Quick Actions">
            {quickActions.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="titlebar-quick-chip"
                title={chip.tooltip}
                onClick={() => onExecuteQuickAction(chip)}
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="adblock-stats-pill"
          onClick={onToggleShieldPopover}
          title={`${blockedAdsCount.toLocaleString()} Werbeanzeigen und Tracker blockiert · Geschätzte ${totalRamSavedLabel} RAM gespart. Klicken für Einstellungen.`}
          aria-label="Adblock and Privacy Shield Statistics"
        >
          <ShieldCheck size={13} className="stats-shield-icon" />
          <span className="stats-text">
            <strong>{blockedAdsCount.toLocaleString()}</strong> Ads blocked · <strong>{totalRamSavedLabel}</strong> RAM saved
          </span>
        </button>
      </div>

      {/* Right controls: In-page find, Downloads, GitHub, Copilot toggle, WindowControls */}
      <div className="modern-titlebar-right">
        <button
          type="button"
          className="titlebar-tool-btn find-btn"
          title="Find in page (Ctrl+F)"
          aria-label="Find in page"
          onClick={onToggleFind}
        >
          <Search size={15} />
        </button>

        <button
          type="button"
          className={`titlebar-tool-btn downloads-trigger ${hasActiveDownloads ? 'has-active' : ''}`}
          title="Downloads (Ctrl+J)"
          aria-label="Downloads"
          onClick={onToggleDownloads}
        >
          <Download size={15} />
          {hasActiveDownloads && <span className="downloads-active-dot" />}
        </button>

        <button
          type="button"
          className="titlebar-tool-btn extensions-trigger"
          title="Extensions & Add-ons (Manifest V3)"
          aria-label="Extensions & Add-ons"
          onClick={onToggleExtensions}
        >
          <Puzzle size={15} />
        </button>

        {onOpenGithub && (
          <button
            type="button"
            className="titlebar-tool-btn bug-report-btn"
            title="Problem melden / GitHub Issues"
            aria-label="Problem melden"
            onClick={onOpenGithub}
          >
            <Bug size={15} />
          </button>
        )}

        <button
          type="button"
          className={`titlebar-tool-btn copilot-toggle-btn ${copilotOpen ? 'active' : ''}`}
          title={`Toggle ${botName} AI (70/30 Split View)`}
          aria-label={`Toggle ${botName} AI`}
          onClick={onToggleCopilot}
        >
          <img src={brandAssets.sidekickAvatar} alt="" className="copilot-btn-avatar" draggable={false} />
        </button>

        <WindowControls />
      </div>
    </header>
    </>
  );
}
