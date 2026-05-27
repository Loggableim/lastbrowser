import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal, X, Loader2 } from 'lucide-react';
import { canCallSidekickApi } from '../runtime-readiness.js';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
type TerminalInfo = { id: string; cwd: string };

const LS_ACTIVE_TERMINAL = 'lastbrowser.activeTerminal';
const LS_TERMINAL_CWD = 'lastbrowser.terminalCwd';
const MAX_LINES = 2000;

function loadActiveTerminalId(): string {
  try { return window.localStorage.getItem(LS_ACTIVE_TERMINAL) || ''; } catch { return ''; }
}
function saveActiveTerminalId(id: string) {
  try { window.localStorage.setItem(LS_ACTIVE_TERMINAL, id); } catch {}
}
function loadTerminalCwd(): string {
  try { return window.localStorage.getItem(LS_TERMINAL_CWD) || ''; } catch { return ''; }
}
function saveTerminalCwd(cwd: string) {
  try { window.localStorage.setItem(LS_TERMINAL_CWD, cwd); } catch {}
}

export function NativeTerminalMain({
  serviceStatus,
  activeSessionId,
  workspacePath
}: {
  serviceStatus: ServiceStatus | null;
  activeSessionId: string | null;
  workspacePath: string;
}): JSX.Element {
  const ready = canCallSidekickApi(serviceStatus);
  const [termId, setTermId] = useState(loadActiveTerminalId);
  const [lines, setLines] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState(loadTerminalCwd() || workspacePath || 'C:\\');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const bufferRef = useRef<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const disposerRef = useRef<(() => void) | null>(null);

  // Scroll to bottom on new output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (disposerRef.current) disposerRef.current();
      if (termId) {
        window.lastbrowser.terminal.close(termId).catch(() => {});
      }
    };
  }, []);

  const appendOutput = useCallback((text: string) => {
    const parts = text.split(/\r?\n/);
    bufferRef.current = [...bufferRef.current, ...parts];
    if (bufferRef.current.length > MAX_LINES) {
      bufferRef.current = bufferRef.current.slice(bufferRef.current.length - MAX_LINES);
    }
    setLines([...bufferRef.current]);
  }, []);

  const startTerm = useCallback(async () => {
    if (!cwd.trim()) return;
    setStarting(true);
    setError('');
    try {
      // Close previous terminal if any
      if (termId) {
        await window.lastbrowser.terminal.close(termId).catch(() => {});
      }

      const result = await window.lastbrowser.terminal.start(cwd.trim());
      if (result.error) {
        setError(result.error);
        setStarting(false);
        return;
      }

      const newId = result.id;
      setTermId(newId);
      saveActiveTerminalId(newId);
      saveTerminalCwd(cwd.trim());
      bufferRef.current = [];
      setLines([]);

      // Subscribe to data events
      if (disposerRef.current) disposerRef.current();
      disposerRef.current = window.lastbrowser.terminal.onData((event) => {
        if (event.id === newId) {
          appendOutput(event.data);
        }
      });

      // Send initial newline to get a prompt
      window.setTimeout(() => {
        window.lastbrowser.terminal.write({ id: newId, data: '\r\n' }).catch(() => {});
      }, 500);

      setStarting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStarting(false);
    }
  }, [cwd, termId, appendOutput]);

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (!termId || !input.trim()) return;
    window.lastbrowser.terminal.write({ id: termId, data: input + '\r\n' }).catch(() => {});
    setInput('');
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Enter') return; // handled by form submit
    if (event.key === 'ArrowUp') return; // history (future)
  }

  function closeCurrentTerm(): void {
    if (!termId) return;
    window.lastbrowser.terminal.close(termId).catch(() => {});
    setTermId('');
    saveActiveTerminalId('');
    bufferRef.current = [];
    setLines([]);
    if (disposerRef.current) { disposerRef.current(); disposerRef.current = null; }
  }

  return (
    <section className="browser-main native-rest-main">
      <header className="native-rest-header">
        <div className="native-rest-title">
          <div className="native-rest-icon"><Terminal size={21} /></div>
          <div>
            <span className="eyebrow">Terminal</span>
            <h1>Workspace terminal</h1>
            <p>Run shell commands directly in the browser</p>
          </div>
        </div>
      </header>

      {!termId && (
        <form className="terminal-start-form" onSubmit={(e) => { e.preventDefault(); void startTerm(); }}>
          <label>
            <span>Working directory</span>
            <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="C:\path\to\workspace" />
          </label>
          <button type="submit" className="primary-action compact" disabled={starting || !cwd.trim()}>
            {starting ? <Loader2 size={15} className="spin" /> : <Terminal size={15} />}
            <span>{starting ? 'Starting…' : 'Open terminal'}</span>
          </button>
          {error && <div className="workspace-error">{error}</div>}
        </form>
      )}

      {termId && (
        <div className="terminal-container">
          <div className="terminal-toolbar">
            <span className="terminal-label">cmd.exe — {cwd}</span>
            <button type="button" className="secondary-action compact" onClick={closeCurrentTerm} title="Close terminal">
              <X size={14} />
            </button>
          </div>
          <div className="terminal-output" ref={scrollRef}>
            {lines.map((line, i) => (
              <div key={i} className="terminal-line">{line || '\u00A0'}</div>
            ))}
            {!lines.length && <div className="terminal-line terminal-welcome">Starting terminal session...</div>}
          </div>
          <form className="terminal-input-form" onSubmit={handleSubmit}>
            <span className="terminal-prompt">{cwd}&gt;</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command..."
              autoFocus
            />
            <button type="submit" className="secondary-action compact" disabled={!input.trim()}>
              <Terminal size={14} />
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
