/**
 * Workspace explorer panel components for Lastbrowser.
 *
 * Extracted from App.tsx. Contains:
 *   • WorkspacePanel      - Collapsible sidebar showing file tree and preview
 *   • WorkspaceToolbar    - Action buttons (new file, new folder, toggle hidden, refresh)
 *   • WorkspaceBreadcrumb - Clickable navigation path
 *   • WorkspacePreview    - File viewer / editor / download pane
 */

import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  RefreshCw,
  Save,
  Trash2
} from 'lucide-react';
import type { WorkspaceFilePreview, WorkspaceTreeEntry } from '../shell-state.js';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isWorkspaceDirectory(entry: WorkspaceTreeEntry): boolean {
  return entry.is_dir === true || entry.type === 'dir' || entry.type === 'directory';
}

export function entryFromPreview(preview: WorkspaceFilePreview): WorkspaceTreeEntry {
  const path = preview.path || '';
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return {
    name: parts[parts.length - 1] || path || 'Preview',
    path,
    type: 'file',
    size: preview.size
  };
}

export function workspacePathParts(path: string): string[] {
  const normalized = (path || '.').replace(/\\/g, '/').replace(/^\.\/?/, '').replace(/\/+$/, '');
  if (!normalized || normalized === '.') return [];
  return normalized.split('/').filter(Boolean);
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function shortSessionId(sessionId: string): string {
  return sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId;
}

// ─── WorkspaceToolbar ─────────────────────────────────────────────────────────

export type WorkspaceToolbarProps = {
  disabled: boolean;
  showHidden: boolean;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRefresh: () => void;
  onToggleHidden: () => void;
};

export function WorkspaceToolbar({
  disabled,
  showHidden,
  onCreateFile,
  onCreateFolder,
  onRefresh,
  onToggleHidden
}: WorkspaceToolbarProps): React.JSX.Element {
  return (
    <div className="workspace-toolbar">
      <button type="button" title="New file" disabled={disabled} onClick={onCreateFile}><FilePlus size={14} /></button>
      <button type="button" title="New folder" disabled={disabled} onClick={onCreateFolder}><FolderPlus size={14} /></button>
      <button type="button" title={showHidden ? 'Hide dotfiles' : 'Show dotfiles'} disabled={disabled} onClick={onToggleHidden}>
        {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button type="button" title="Refresh" disabled={disabled} onClick={onRefresh}><RefreshCw size={14} /></button>
    </div>
  );
}

// ─── WorkspaceBreadcrumb ──────────────────────────────────────────────────────

export type WorkspaceBreadcrumbProps = {
  path: string;
  onRoot: () => void;
  onSelect: (path: string) => void;
};

export function WorkspaceBreadcrumb({
  path,
  onRoot,
  onSelect
}: WorkspaceBreadcrumbProps): React.JSX.Element {
  const parts = workspacePathParts(path);
  return (
    <div className="workspace-breadcrumb">
      <button type="button" onClick={onRoot}>~</button>
      {parts.map((part, index) => {
        const nextPath = parts.slice(0, index + 1).join('/');
        return (
          <React.Fragment key={`${part}-${index}`}>
            <span>/</span>
            <button type="button" onClick={() => onSelect(nextPath)}>{part}</button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── WorkspacePreview ─────────────────────────────────────────────────────────

export type WorkspacePreviewProps = {
  draft: string;
  editing: boolean;
  entry: WorkspaceTreeEntry | null;
  preview: WorkspaceFilePreview | null;
  serviceStatus: ServiceStatus | null;
  sessionId: string | null;
  onDeleteEntry?: () => void;
  onDraft: (value: string) => void;
  onRenameEntry?: () => void;
  onSavePreview: () => void;
  onToggleEditing: () => void;
};

export function WorkspacePreview({
  draft,
  editing,
  entry,
  preview,
  serviceStatus,
  sessionId,
  onDeleteEntry,
  onDraft,
  onRenameEntry,
  onSavePreview,
  onToggleEditing
}: WorkspacePreviewProps): React.JSX.Element | null {
  if (!preview?.path) return null;
  const rawUrl = serviceStatus?.webuiUrl && sessionId
    ? `${serviceStatus.webuiUrl.replace(/\/+$/, '')}/api/file/raw?session_id=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(preview.path)}&download=1`
    : '';

  return (
    <div className="workspace-preview">
      <div className="workspace-preview-head">
        <strong>{preview.path}</strong>
        <div className="workspace-preview-actions">
          {rawUrl && <a href={rawUrl} title="Download"><Download size={13} /></a>}
          <button type="button" title={editing ? 'Cancel edit' : 'Edit'} onClick={onToggleEditing}><Edit3 size={13} /></button>
          <button type="button" title="Save" disabled={!editing} onClick={onSavePreview}><Save size={13} /></button>
          <button type="button" title="Rename" disabled={!entry} onClick={onRenameEntry}><FileText size={13} /></button>
          <button type="button" title="Delete" disabled={!entry} onClick={onDeleteEntry}><Trash2 size={13} /></button>
        </div>
      </div>
      {editing ? (
        <textarea value={draft} onChange={(event) => onDraft(event.target.value)} />
      ) : (
        <pre>{preview.content || ''}</pre>
      )}
    </div>
  );
}

// ─── WorkspacePanel ───────────────────────────────────────────────────────────

export type WorkspacePanelProps = {
  activeSessionId: string | null;
  collapsed: boolean;
  draft: string;
  editing: boolean;
  entries: WorkspaceTreeEntry[];
  error: string;
  path: string;
  preview: WorkspaceFilePreview | null;
  serviceStatus: ServiceStatus | null;
  showHidden: boolean;
  onEntry: (entry: WorkspaceTreeEntry) => Promise<void>;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onDeleteEntry: (entry: WorkspaceTreeEntry) => void;
  onDraft: (value: string) => void;
  onParent: () => void;
  onRenameEntry: (entry: WorkspaceTreeEntry) => void;
  onRefresh: () => void;
  onSavePreview: () => void;
  onToggleEditing: () => void;
  onToggleHidden: () => void;
  onToggle: () => void;
  onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
};

export function WorkspacePanel({
  activeSessionId,
  collapsed,
  draft,
  editing,
  entries,
  error,
  path,
  preview,
  serviceStatus,
  showHidden,
  onEntry,
  onCreateFile,
  onCreateFolder,
  onDeleteEntry,
  onDraft,
  onParent,
  onRenameEntry,
  onRefresh,
  onSavePreview,
  onToggleEditing,
  onToggleHidden,
  onToggle,
  onResizeStart
}: WorkspacePanelProps): React.JSX.Element {
  const [gitInfo, setGitInfo] = useState<{ branch?: string; dirty?: number; modified?: number; ahead?: number; behind?: number; is_git?: boolean } | null>(null);
  const ready = serviceStatus?.sidekick === 'ready';
  const visibleEntries = showHidden ? entries : entries.filter((entry) => !entry.name.startsWith('.'));
  const previewEntry = preview?.path ? entryFromPreview(preview) : null;

  // Fetch git info when session changes
  useEffect(() => {
    setGitInfo(null);
    if (!activeSessionId || !ready) return;
    let alive = true;
    void window.lastbrowser.sidekick.requestWebui({
      method: 'GET', path: '/api/git-info',
      query: { session_id: activeSessionId }
    }).then((result) => {
      if (!alive) return;
      const info = (result as { git?: Record<string, unknown> })?.git;
      if (info && typeof info === 'object') setGitInfo(info as typeof gitInfo);
    }).catch(() => {});
    return () => { alive = false; };
  }, [activeSessionId, ready]);

  if (collapsed) {
    return (
      <aside className="workspace-panel collapsed">
        <button type="button" aria-label="Open workspace" onClick={onToggle}>
          <HardDrive size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="workspace-panel">
      <div className="sidebar-resize-handle workspace-resize-handle" role="presentation" aria-hidden="true" onMouseDown={onResizeStart} />
      <div className="workspace-header">
        <div>
          <span>WORKSPACE</span>
          <strong>{activeSessionId ? shortSessionId(activeSessionId) : 'No session'}</strong>
        </div>
        {gitInfo?.is_git && (
          <div className="workspace-git-badge" title={`${gitInfo.modified || 0} modified, ${gitInfo.ahead || 0} ahead, ${gitInfo.behind || 0} behind`}>
            <span className="workspace-git-branch">{gitInfo.branch}</span>
            {(gitInfo.dirty ?? 0) > 0 && <span className="workspace-git-dirty">•{gitInfo.dirty}</span>}
          </div>
        )}
        <div className="workspace-actions">
          <button type="button" aria-label="Parent folder" onClick={onParent}><ChevronLeft size={16} /></button>
          <button type="button" aria-label="Refresh workspace" onClick={onRefresh}><RefreshCw size={15} /></button>
          <button type="button" aria-label="Collapse workspace" onClick={onToggle}><ChevronRight size={16} /></button>
        </div>
      </div>
      <WorkspaceBreadcrumb path={path} onRoot={() => onEntry({ name: '.', path: '.', type: 'dir', is_dir: true })} onSelect={(nextPath) => onEntry({ name: nextPath, path: nextPath, type: 'dir', is_dir: true })} />
      <WorkspaceToolbar
        disabled={!activeSessionId}
        showHidden={showHidden}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
        onRefresh={onRefresh}
        onToggleHidden={onToggleHidden}
      />
      {error && <div className="workspace-error">{error}</div>}
      {!activeSessionId && (
        <div className="workspace-empty">
          <Folder size={20} />
          <span>{serviceStatus?.sidekick === 'ready' ? 'Start or select a chat' : 'Workspace loading'}</span>
        </div>
      )}
      {activeSessionId && (
        <div className="workspace-list">
          {visibleEntries.map((entry) => {
            const isFolder = isWorkspaceDirectory(entry);
            return (
              <div
                key={`${entry.path || entry.name}-${entry.type || ''}`}
                className="workspace-entry"
              >
                <button type="button" className="workspace-entry-main" onClick={() => void onEntry(entry)}>
                  {isFolder ? <Folder size={15} /> : <FileText size={15} />}
                  <span>{entry.name}</span>
                  {entry.size !== undefined && <small>{formatBytes(entry.size)}</small>}
                </button>
                <div className="workspace-entry-actions">
                  <button type="button" title="Rename" onClick={() => onRenameEntry(entry)}><Edit3 size={13} /></button>
                  <button type="button" title="Delete" onClick={() => onDeleteEntry(entry)}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
          {!visibleEntries.length && !error && (
            <div className="workspace-empty">
              <Folder size={20} />
              <span>{entries.length ? 'Hidden files are currently hidden' : 'No files found'}</span>
            </div>
          )}
        </div>
      )}
      <WorkspacePreview
        draft={draft}
        editing={editing}
        entry={previewEntry}
        preview={preview}
        serviceStatus={serviceStatus}
        sessionId={activeSessionId}
        onDeleteEntry={previewEntry ? () => onDeleteEntry(previewEntry) : undefined}
        onDraft={onDraft}
        onRenameEntry={previewEntry ? () => onRenameEntry(previewEntry) : undefined}
        onSavePreview={onSavePreview}
        onToggleEditing={onToggleEditing}
      />
    </aside>
  );
}
