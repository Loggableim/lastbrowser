import React, { useEffect, useState } from 'react';
import type { LocalAiState } from '../../main/local-ai-contract.js';
import { useDesktopI18n } from '../i18n.js';
import './local-ai.css';

export function LocalAiSetup({ workspace, onActivated }: { workspace: string; onActivated?: (model: string) => Promise<void> }) {
  const { locale } = useDesktopI18n();
  const de = locale === 'de';
  const label = (german: string, english: string) => de ? german : english;
  const [state, setState] = useState<LocalAiState | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [backend, setBackend] = useState<'cpu' | 'vulkan'>('cpu');
  const [fallback, setFallback] = useState(false);
  const [primary, setPrimary] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => window.lastbrowser.localAi?.status(workspace).then((result) => { if (active) setState(result); }).catch((e) => { if (active) setError(String(e.message)); });
    void refresh(); const timer = setInterval(refresh, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [workspace]);
  useEffect(() => { setFallback(state?.scope?.allowFallback || false); setPrimary(state?.scope?.useAsDefault ?? true); }, [workspace, state?.scope?.modelId, state?.scope?.allowFallback, state?.scope?.useAsDefault]);
  useEffect(() => { setSaved(false); }, [workspace]);
  const run = async (action: () => Promise<unknown>) => {
    setPending(true); setError(''); setSaved(false);
    try { await action(); setState(await window.lastbrowser.localAi.status(workspace)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(false); }
  };
  if (typeof window === 'undefined' || !window.lastbrowser?.localAi) return null;
  const busy = pending || Boolean(state?.activeChats) || ['downloading', 'loading', 'verifying'].includes(state?.phase || '');
  const size = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  return <section className="local-ai-setup" aria-label={label('Lokale KI', 'Local AI')}>
    <h2>{label('Lokale KI auf diesem Computer', 'Local AI on this computer')}</h2>
    <p>{label('Optional: Modell herunterladen oder importieren. Danach läuft die KI lokal. Kleine Modelle können Fehler machen und ersetzen keinen leistungsfähigen Cloud-Agenten.', 'Optional: download or import a model, then run AI locally. Small models can make mistakes and do not replace a powerful cloud agent.')}</p>
    <button type="button" disabled={busy} onClick={() => void run(() => window.lastbrowser.localAi.scan())}>{label('Hardware prüfen', 'Scan hardware')}</button>
    {state?.hardware && <div className="local-ai-hardware">
      <p>{state.hardware.cpu} · {state.hardware.cores} {label('Kerne', 'cores')} · RAM {size(state.hardware.ramBytes)} ({size(state.hardware.availableRamBytes)} {label('frei', 'free')})</p>
      <p>{label('Festplatte frei', 'Free disk')}: {state.hardware.freeDiskBytes === null ? '?' : size(state.hardware.freeDiskBytes)}</p>
      {state.hardware.gpus.map((gpu) => <p key={gpu.name}>{gpu.name} · VRAM {gpu.vramBytes === null ? label('nicht verlässlich ermittelt', 'not reliably detected') : size(gpu.vramBytes)}</p>)}
      {state.hardware.warnings.map((warning) => <p key={warning}>{warning}</p>)}
    </div>}
    {!state?.runtimeAvailable && <p role="status">{label('Windows-x64-Runtime nicht verfügbar.', 'Windows x64 runtime unavailable.')}</p>}
    {state?.scope && <button type="button" disabled={busy} onClick={() => void run(() => window.lastbrowser.localAi.clearSpace(workspace))}>{label('Lokale KI in diesem Space deaktivieren', 'Disable local AI in this Space')}</button>}
    <label>{label('Rechenmodus', 'Compute mode')} <select value={backend} disabled={busy} onChange={(e) => setBackend(e.target.value as 'cpu' | 'vulkan')}><option value="cpu">CPU</option><option value="vulkan">GPU (Vulkan, {label('Test erforderlich', 'test required')})</option></select></label>
    <div className="local-ai-models">{state?.catalog.map((model) => <article key={model.id}>
      <h3>{model.name}</h3><p>{size(model.bytes)} · RAM ≈ {size(model.estimatedRamBytes)} + {label('Browserreserve', 'browser reserve')} · {label('Kandidat, lokal testen', 'candidate, test locally')}</p>
      {state.recommendedModel === model.id && <p><strong>{label('Empfehlung nach Hardwareprüfung', 'Recommended after hardware scan')}</strong></p>}
      {state.hardware && !state.recommendations?.[model.id]?.usable && <p>{state.recommendations?.[model.id]?.reason}</p>}
      {model.agentEvaluation === 'failed' && <p>{label('Agententest nicht bestanden. Für Standard und Fallback gesperrt.', 'Agent test failed. Disabled for default and fallback use.')}</p>}
      {model.agentEvaluation === 'limited' && <p>{label('Kurze lesende Agentenaufgabe bestanden. Komplexe Abläufe bleiben unzuverlässig.', 'Passed a short read-only agent task. Complex flows remain unreliable.')}</p>}
      <p>{label('Lizenz', 'License')}: <button type="button" onClick={() => void window.lastbrowser.system.openExternal(`https://huggingface.co/${model.repository}/blob/${model.revision}/LICENSE`)}>{model.license === 'other' ? 'LFM Open License (commercial use restrictions)' : model.license}</button></p>
      <div className="local-ai-actions">
        {!state.installed.includes(model.id) ? <><button type="button" disabled={busy || !state.runtimeAvailable} onClick={() => void run(() => window.lastbrowser.localAi.download(model.id))}>{label('Optional herunterladen', 'Optional download')}</button><button type="button" disabled={busy} onClick={() => void run(() => window.lastbrowser.localAi.import(model.id))}>{label('Datei importieren', 'Import file')}</button></> : <><button type="button" disabled={busy || !state.runtimeAvailable} onClick={() => void run(() => window.lastbrowser.localAi.start(model.id, backend))}>{label('Laden und Tool Calling testen', 'Load and test tool calling')}</button><button type="button" disabled={busy} onClick={() => void run(() => window.lastbrowser.localAi.remove(model.id))}>{label('Modell entfernen', 'Remove model')}</button></>}
      </div>
    </article>)}</div>
    {state && <p role="status">{label('Status', 'Status')}: {state.phase} {state.phase === 'downloading' && `${Math.floor(state.completedBytes / Math.max(1, state.totalBytes) * 100)}%`}</p>}
    {state?.phase === 'downloading' && <progress max={state.totalBytes} value={state.completedBytes} />}
    {busy && <button type="button" onClick={() => void window.lastbrowser.localAi.cancel()}>{label('Abbrechen', 'Cancel')}</button>}
    {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
    {state?.phase === 'ready' && <><p>{label('Tool-Calling-Test bestanden', 'Tool-calling test passed')}{state.measuredTokensPerSecond !== null ? ` · ${state.measuredTokensPerSecond.toFixed(1)} tokens/s` : ''}</p>
      <label><input type="checkbox" checked={primary} onChange={(e) => { setPrimary(e.target.checked); setSaved(false); }} />{label('Als Standard für diesen Space verwenden', 'Use as default for this Space')}</label>
      <label><input type="checkbox" checked={fallback} onChange={(e) => { setFallback(e.target.checked); setSaved(false); }} />{label('Bei Provider-Ausfall als lokalen Fallback erlauben', 'Allow local fallback on provider failure')}</label>
      <button type="button" disabled={busy || !workspace} onClick={() => void run(async () => {
        await window.lastbrowser.localAi.configure(workspace, state.modelId!, fallback, primary);
        if (onActivated && primary) await onActivated(state.modelId!);
        setSaved(true);
      })}>{label('Für diesen Space speichern', 'Save for this Space')}</button>
      <button type="button" disabled={busy} onClick={() => void run(() => window.lastbrowser.localAi.stop())}>{label('Runtime stoppen / RAM freigeben', 'Stop runtime / release RAM')}</button>
    </>}
    {saved && <p role="status">{label('Space-Konfiguration gespeichert.', 'Space configuration saved.')}</p>}
    <p>{label('Downloads enthalten nur Modellgewichte. Die Runtime ist bereits enthalten. Antworten werden von KI erzeugt.', 'Downloads contain model weights only. The runtime is included. Responses are AI generated.')}</p>
    <p>{label('Lokaler Agent: nur lesende Werkzeuge, höchstens sechs Schritte und 8192 Tokens Kontext. Bei langen Gesprächen einen neuen Chat beginnen.', 'Local agent: read-only tools, up to six steps and 8192 tokens of context. Start a new chat for long conversations.')}</p>
    <p>{label('Nach fünf Minuten ohne Chat wird die Runtime automatisch entladen.', 'The runtime unloads automatically after five minutes without a chat.')}</p>
    <button type="button" onClick={() => void window.lastbrowser.system.openExternal('https://lastbrowser.com/support')}>{label('Problem mit KI-Antwort melden', 'Report an AI response issue')}</button>
  </section>;
}
