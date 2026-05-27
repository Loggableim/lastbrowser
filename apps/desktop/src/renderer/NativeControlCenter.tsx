import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload, X, Settings, MessageSquare, Loader2 } from 'lucide-react';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;

type ControlTab = 'conversation' | 'import' | 'export' | 'settings';

export function ControlCenter({
  open,
  serviceStatus,
  activeSessionId,
  onClose
}: {
  open: boolean;
  serviceStatus: ServiceStatus | null;
  activeSessionId: string | null;
  onClose: () => void;
}): JSX.Element | null {
  const [tab, setTab] = useState<ControlTab>('conversation');
  const [statusMsg, setStatusMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const ready = serviceStatus?.sidekick === 'ready' && Boolean(serviceStatus?.webuiUrl);

  useEffect(() => {
    if (!open) {
      setTab('conversation');
      setStatusMsg('');
    }
  }, [open]);

  const handleExportMarkdown = useCallback(async () => {
    if (!activeSessionId || !ready) return;
    setExporting(true);
    setStatusMsg('');
    try {
      const payload = await window.lastbrowser.sidekick.requestWebui({
        method: 'GET', path: '/api/session/export',
        query: { session_id: activeSessionId, format: 'markdown' }
      });
      if (payload?.content) {
        const blob = new Blob([payload.content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `session-${activeSessionId.slice(0, 8)}.md`;
        a.click(); URL.revokeObjectURL(url);
        setStatusMsg('Exported as Markdown!');
      } else setStatusMsg('No content to export');
    } catch (err) { setStatusMsg(`Export failed: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setExporting(false); }
  }, [activeSessionId, ready]);

  const handleExportJson = useCallback(async () => {
    if (!activeSessionId || !ready) return;
    setExporting(true);
    setStatusMsg('');
    try {
      const session = await window.lastbrowser.sidekick.getSession({ sessionId: activeSessionId });
      if (session) {
        const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `session-${activeSessionId.slice(0, 8)}.json`;
        a.click(); URL.revokeObjectURL(url);
        setStatusMsg('Exported as JSON!');
      } else setStatusMsg('Session not found');
    } catch (err) { setStatusMsg(`Export failed: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setExporting(false); }
  }, [activeSessionId, ready]);

  const handleImport = useCallback(async () => {
    if (!importInputRef.current?.files?.length) return;
    setImporting(true);
    setStatusMsg('');
    try {
      const file = importInputRef.current.files[0];
      const text = await file.text();
      let payload;
      try { payload = JSON.parse(text); }
      catch { payload = { content: text, format: 'markdown' }; }
      const result = await window.lastbrowser.sidekick.requestWebui({
        method: 'POST', path: '/api/session/import',
        body: { payload }
      });
      if (result?.session_id) {
        setStatusMsg(`Imported! Session: ${result.session_id.slice(0, 8)}`);
        importInputRef.current.value = '';
      } else setStatusMsg(result?.error || 'Import completed');
    } catch (err) { setStatusMsg(`Import failed: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setImporting(false); }
  }, [ready]);

  if (!open) return null;

  const tabs: { id: ControlTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'conversation', label: 'Conversation', icon: MessageSquare },
    { id: 'import', label: 'Import', icon: Upload },
    { id: 'export', label: 'Export', icon: Download },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="control-center-overlay" onClick={onClose}>
      <div className="control-center-modal" onClick={(e) => e.stopPropagation()}>
        <div className="control-center-header">
          <h2>Control Center</h2>
          <button type="button" className="control-center-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="control-center-body">
          <nav className="control-center-tabs">
            {tabs.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                <t.icon size={16} /><span>{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="control-center-content">
            {tab === 'conversation' && (
              <div className="control-center-tab-content">
                <h3>Current Conversation</h3>
                <p>Manage the active session. Export, import, or start fresh.</p>
                {activeSessionId ? (
                  <div className="control-center-actions">
                    <span className="control-center-label">Session ID: {activeSessionId.slice(0, 12)}</span>
                  </div>
                ) : (
                  <p className="control-center-empty">No active session selected.</p>
                )}
              </div>
            )}
            {tab === 'export' && (
              <div className="control-center-tab-content">
                <h3>Export Session</h3>
                <p>Download the current conversation as Markdown or JSON.</p>
                <div className="control-center-actions">
                  <button type="button" className="primary-action compact" onClick={handleExportMarkdown} disabled={!ready || exporting || !activeSessionId}>
                    {exporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                    <span>Export as Markdown</span>
                  </button>
                  <button type="button" className="secondary-action compact" onClick={handleExportJson} disabled={!ready || exporting || !activeSessionId}>
                    {exporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                    <span>Export as JSON</span>
                  </button>
                </div>
              </div>
            )}
            {tab === 'import' && (
              <div className="control-center-tab-content">
                <h3>Import Session</h3>
                <p>Upload a JSON file exported from the Hermes WebUI.</p>
                <input ref={importInputRef} type="file" accept=".json,.md" className="control-center-file-input" />
                <button type="button" className="primary-action compact" onClick={handleImport} disabled={!ready || importing}>
                  {importing ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
                  <span>Import</span>
                </button>
              </div>
            )}
            {tab === 'settings' && (
              <div className="control-center-tab-content">
                <h3>Settings</h3>
                <p>Appearance and preferences are managed in the Settings panel.</p>
                <button type="button" className="secondary-action compact" onClick={() => { onClose(); }}>
                  <Settings size={15} />
                  <span>Open Settings Panel</span>
                </button>
              </div>
            )}
            {statusMsg && <div className={`control-center-status ${statusMsg.includes('failed') ? 'error' : 'success'}`}>{statusMsg}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
