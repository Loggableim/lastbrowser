import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal, X, Loader2, Sparkles, Stethoscope, HelpCircle, Activity } from 'lucide-react';
import { canCallSidekickApi } from '../runtime-readiness.js';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
export type TerminalMode = 'shell' | 'tui';

const LS_ACTIVE_TERMINAL = 'lastbrowser.activeTerminal';
const LS_TERMINAL_CWD = 'lastbrowser.terminalCwd';
const LS_TERMINAL_MODE = 'lastbrowser.terminalMode';
const MAX_LINES = 2000;

function cleanAnsi(str: string): string {
  // Strip ANSI escape codes (CSI, OSC, etc.)
  return str.replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\u001b\].*?\u0007/g, '');
}

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
function loadTerminalMode(): TerminalMode {
  try { return (window.localStorage.getItem(LS_TERMINAL_MODE) as TerminalMode) || 'shell'; } catch { return 'shell'; }
}
function saveTerminalMode(mode: TerminalMode) {
  try { window.localStorage.setItem(LS_TERMINAL_MODE, mode); } catch {}
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
  const [mode, setMode] = useState<TerminalMode>(loadTerminalMode);
  const [activeMode, setActiveMode] = useState<TerminalMode>(loadTerminalMode);
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
    const cleaned = cleanAnsi(text);
    const parts = cleaned.split(/\r?\n/);
    bufferRef.current = [...bufferRef.current, ...parts];
    if (bufferRef.current.length > MAX_LINES) {
      bufferRef.current = bufferRef.current.slice(bufferRef.current.length - MAX_LINES);
    }
    setLines([...bufferRef.current]);
  }, []);

  const startTerm = useCallback(async (selectedMode: TerminalMode = mode) => {
    if (!cwd.trim()) return;
    setStarting(true);
    setError('');
    try {
      // Close previous terminal if any
      if (termId) {
        await window.lastbrowser.terminal.close(termId).catch(() => {});
      }

      const result = await window.lastbrowser.terminal.start({
        cwd: cwd.trim(),
        mode: selectedMode
      });
      if (result.error) {
        setError(result.error);
        setStarting(false);
        return;
      }

      const newId = result.id;
      setTermId(newId);
      setActiveMode(selectedMode);
      saveActiveTerminalId(newId);
      saveTerminalCwd(cwd.trim());
      saveTerminalMode(selectedMode);
      bufferRef.current = [];
      setLines([]);

      // Subscribe to data events
      if (disposerRef.current) disposerRef.current();
      disposerRef.current = window.lastbrowser.terminal.onData((event) => {
        if (event.id === newId) {
          appendOutput(event.data);
        }
      });

      // Send initial newline in shell mode to trigger prompt
      if (selectedMode === 'shell') {
        window.setTimeout(() => {
          window.lastbrowser.terminal.write({ id: newId, data: '\r\n' }).catch(() => {});
        }, 500);
      }

      setStarting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStarting(false);
    }
  }, [cwd, termId, mode, appendOutput]);

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (!termId || !input.trim()) return;
    window.lastbrowser.terminal.write({ id: termId, data: input + '\r\n' }).catch(() => {});
    setInput('');
  }

  function sendCommand(cmd: string): void {
    if (!termId) return;
    window.lastbrowser.terminal.write({ id: termId, data: cmd + '\r\n' }).catch(() => {});
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Enter') return;
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
            <span className="eyebrow">Terminal & CLI</span>
            <h1>Native Terminal & Sidekick CLI</h1>
            <p>ConPTY Terminal mit integrierten 38+ Sidekick-Befehlen und Sidekick TUI</p>
          </div>
        </div>
      </header>

      {!termId && (
        <form className="terminal-start-form" onSubmit={(e) => { e.preventDefault(); void startTerm(); }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              type="button"
              className={mode === 'shell' ? 'primary-action compact' : 'secondary-action compact'}
              onClick={() => { setMode('shell'); saveTerminalMode('shell'); }}
            >
              <Terminal size={14} style={{ marginRight: '6px' }} />
              PowerShell Shell (CLI-Integration)
            </button>
            <button
              type="button"
              className={mode === 'tui' ? 'primary-action compact' : 'secondary-action compact'}
              onClick={() => { setMode('tui'); saveTerminalMode('tui'); }}
            >
              <Sparkles size={14} style={{ marginRight: '6px' }} />
              Sidekick TUI (Interaktiver Chat)
            </button>
          </div>

          <label>
            <span>Working directory</span>
            <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="C:\path\to\workspace" />
          </label>

          <p style={{ fontSize: '12px', color: 'var(--muted, #888)', margin: '4px 0 12px 0' }}>
            {mode === 'shell'
              ? 'Startet ConPTY mit direktem Zugriff auf alle 38+ CLI-Subcommands (sidekick doctor, sidekick status, etc.).'
              : 'Startet die grafische Sidekick-Terminal-Benutzeroberfläche (TUI) direkt im PTY.'}
          </p>

          <button type="submit" className="primary-action compact" disabled={starting || !cwd.trim()}>
            {starting ? <Loader2 size={15} className="spin" /> : <Terminal size={15} />}
            <span>{starting ? 'Starting…' : mode === 'tui' ? 'Launch Sidekick TUI' : 'Open Shell Terminal'}</span>
          </button>
          {error && <div className="workspace-error">{error}</div>}
        </form>
      )}

      {termId && (
        <div className="terminal-container">
          <div className="terminal-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="terminal-label" style={{ fontWeight: 600 }}>
                {activeMode === 'tui' ? 'Sidekick TUI' : 'PowerShell'} — {cwd}
              </span>
              <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }}>
                {activeMode === 'tui' ? 'TUI Mode' : 'CLI Alias: sidekick'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {activeMode === 'shell' && (
                <>
                  <button
                    type="button"
                    className="secondary-action compact"
                    onClick={() => sendCommand('sidekick doctor')}
                    title="Run sidekick doctor diagnostic"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    <Stethoscope size={12} style={{ marginRight: '4px' }} />
                    doctor
                  </button>
                  <button
                    type="button"
                    className="secondary-action compact"
                    onClick={() => sendCommand('sidekick status')}
                    title="Check sidekick components status"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    <Activity size={12} style={{ marginRight: '4px' }} />
                    status
                  </button>
                  <button
                    type="button"
                    className="secondary-action compact"
                    onClick={() => sendCommand('sidekick --help')}
                    title="Show all 38+ CLI subcommands"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    <HelpCircle size={12} style={{ marginRight: '4px' }} />
                    help
                  </button>
                </>
              )}
              <button type="button" className="secondary-action compact" onClick={closeCurrentTerm} title="Close terminal">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="terminal-output" ref={scrollRef}>
            {lines.map((line, i) => (
              <div key={i} className="terminal-line">{line || '\u00A0'}</div>
            ))}
            {!lines.length && <div className="terminal-line terminal-welcome">Starting terminal session...</div>}
          </div>

          <form className="terminal-input-form" onSubmit={handleSubmit}>
            <span className="terminal-prompt">{activeMode === 'tui' ? 'TUI>' : `${cwd}>`}</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeMode === 'tui' ? 'Type input / message for Sidekick TUI...' : 'Type a command (e.g. sidekick doctor)...'}
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
