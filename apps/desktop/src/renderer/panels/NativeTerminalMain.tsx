import React, { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon, X, Loader2, Sparkles } from 'lucide-react';
import { Terminal } from '../vendor/xterm/xterm.mjs';
import { FitAddon } from '../vendor/xterm/addon-fit.mjs';
import '../vendor/xterm/xterm.css';
import { createTerminalSession } from '../terminal-session.js';
import { useTerminalEnabled } from '../terminal-feature.js';
import { usePanelStore } from '../stores/usePanelStore.js';
import { useDesktopI18n } from '../i18n.js';
type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
export type TerminalMode = 'shell' | 'tui';

type NativeTerminalProps = { serviceStatus: ServiceStatus | null; activeSessionId: string | null; workspacePath: string };

export function NativeTerminalMain(props: NativeTerminalProps): JSX.Element {
  const enabled = useTerminalEnabled();
  const { locale } = useDesktopI18n();
  const copy = {
    de: ['Terminal ist deaktiviert', 'Aktiviere Terminal im Extension & Skill Hub.', 'Extension & Skill Hub öffnen'],
    en: ['Terminal is disabled', 'Enable Terminal in the Extension & Skill Hub.', 'Open Extension & Skill Hub'],
    es: ['Terminal desactivado', 'Activa Terminal en Extension & Skill Hub.', 'Abrir Extension & Skill Hub'],
    fr: ['Terminal désactivé', 'Activez Terminal dans Extension & Skill Hub.', 'Ouvrir Extension & Skill Hub'],
    it: ['Terminale disattivato', 'Attiva Terminal in Extension & Skill Hub.', 'Apri Extension & Skill Hub'],
    'pt-BR': ['Terminal desativado', 'Ative Terminal no Extension & Skill Hub.', 'Abrir Extension & Skill Hub'],
    ru: ['Терминал отключён', 'Включите терминал в Extension & Skill Hub.', 'Открыть Extension & Skill Hub'],
    ja: ['ターミナルは無効です', 'Extension & Skill Hubでターミナルを有効にしてください。', 'Extension & Skill Hubを開く']
  }[locale];
  if (!enabled) return <section className="browser-main native-rest-main"><h1>{copy[0]}</h1><p>{copy[1]}</p>
    <button type="button" className="primary-action" onClick={() => {
      usePanelStore.getState().setExtensionHubTab('skills'); usePanelStore.getState().setExtensionHubOpen(true);
    }}>{copy[2]}</button></section>;
  return <NativeTerminalRuntime {...props} />;
}

function NativeTerminalRuntime({ serviceStatus, activeSessionId, workspacePath }: {
  serviceStatus: ServiceStatus | null; activeSessionId: string | null; workspacePath: string;
}): JSX.Element {
  const isWindows = /Windows/i.test(navigator.userAgent);
  const shellLabel = isWindows ? 'PowerShell' : 'Shell';
  const shellDetail = isWindows
    ? 'PowerShell und interaktiver Chat im aktuellen Space.'
    : 'Interaktive System-Shell und Sidekick TUI im aktuellen Space.';
  const [mode, setMode] = useState<TerminalMode>('shell');
  const [termId, setTermId] = useState('');
  const [cwd, setCwd] = useState(workspacePath);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const session = useRef<ReturnType<typeof createTerminalSession> | null>(null);
  const idRef = useRef('');

  useEffect(() => {
    setCwd(workspacePath); setTermId(''); setStarting(false); setError('');
    try { window.localStorage.removeItem('lastbrowser.activeTerminal'); window.localStorage.removeItem('lastbrowser.terminalCwd'); } catch {}
    const emulator = new Terminal({ cursorBlink: true, scrollback: 2000, fontSize: 14, theme: { background: '#090e1f' }, allowProposedApi: false });
    const fit = new FitAddon();
    emulator.loadAddon(fit); emulator.open(host.current!); terminal.current = emulator;
    const controller = createTerminalSession(window.lastbrowser.terminal, (data) => emulator.write(data), (id) => {
      idRef.current = id; setTermId(id);
    }, setError);
    session.current = controller;
    const input = emulator.onData((data) => { void controller.write(data); });
    const resize = emulator.onResize(({ cols, rows }) => {
      if (idRef.current) void window.lastbrowser.terminal.resize?.({ id: idRef.current, cols, rows });
    });
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(host.current!); fit.fit();
    return () => {
      session.current = null; idRef.current = ''; controller.dispose(); observer.disconnect();
      input.dispose(); resize.dispose(); emulator.dispose(); terminal.current = null;
    };
  }, [workspacePath]);

  async function start() {
    const controller = session.current;
    if (!controller || !cwd.trim() || starting) return;
    setStarting(true); setError('');
    await controller.start({ cwd: cwd.trim(), mode, sessionId: activeSessionId || undefined });
    if (session.current === controller) {
      setStarting(false);
      const emulator = terminal.current;
      if (idRef.current && emulator) {
        if (mode === 'shell' && !isWindows) await controller.write('\n');
        await window.lastbrowser.terminal.resize?.({ id: idRef.current, cols: emulator.cols, rows: emulator.rows });
        emulator.focus();
      }
    }
  }
  return <section className="browser-main native-rest-main">
    <header className="native-rest-header"><div className="native-rest-title"><TerminalIcon size={21}/><div><span className="eyebrow">Terminal & CLI</span><h1>Terminal & Sidekick</h1><p>{shellDetail}</p></div></div></header>
    {!termId && <form className="terminal-start-form" onSubmit={(event) => { event.preventDefault(); void start(); }}>
      <div className="native-card-actions"><button type="button" aria-pressed={mode === 'shell'} onClick={() => setMode('shell')}><TerminalIcon size={14}/>{shellLabel}</button><button type="button" aria-pressed={mode === 'tui'} onClick={() => setMode('tui')}><Sparkles size={14}/>Sidekick TUI</button></div>
      <label>Arbeitsverzeichnis<input value={cwd} onChange={(event) => setCwd(event.target.value)}/></label>
      <button type="submit" className="primary-action compact" disabled={starting || !cwd.trim() || (mode === 'tui' && serviceStatus?.webuiHealth !== 'ready')}>{starting && <Loader2 className="spin" size={14}/>} {starting ? 'Startet…' : 'Terminal öffnen'}</button>
    </form>}
    {error && <div className="workspace-error" role="status">{error}</div>}
    <div className="terminal-container" style={{ minHeight: 260, flex: 1 }}>
      {termId && <div className="terminal-toolbar"><span>{mode === 'tui' ? 'Sidekick TUI' : shellLabel} — {cwd}</span><button type="button" onClick={() => void session.current?.write('\x03')}>Ctrl+C</button><button type="button" aria-label="Terminal schließen" onClick={() => void session.current?.close()}><X size={14}/></button></div>}
      <div ref={host} className="terminal-emulator" style={{ flex: 1, minHeight: 240, padding: 8 }} />
    </div>
  </section>;
}
